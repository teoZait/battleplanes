"""
Application Service - Game orchestration and use cases
"""
from __future__ import annotations
import asyncio
import logging
import secrets
import time
from typing import Dict, Optional
import uuid
from domain.models import Game
from domain.value_objects import GameState, GameMode
from infrastructure.connection_manager import ConnectionManager
from infrastructure.game_store import GameStore
from metrics import (
    ACTIVE_GAMES, GAMES_BY_STATE, GAMES_CREATED,
    GAMES_FINISHED, GAMES_CLEANED_UP,
)

logger = logging.getLogger(__name__)

# Cleanup thresholds
_FINISHED_GAME_TTL = 30 * 60       # 30 minutes after finishing
_WAITING_GAME_TTL = 2 * 60 * 60    # 2 hours if still waiting
_DISCONNECT_GAME_TTL = 30 * 60     # 30 minutes after a player disconnects
_CLEANUP_INTERVAL = 5 * 60         # run every 5 minutes


class GameService:
    """Application service for game-related operations"""

    def __init__(self, game_store: GameStore):
        self.connection_manager = ConnectionManager()
        self._game_store = game_store
        self.games: Dict[str, Game] = {}
        self._game_locks: Dict[str, asyncio.Lock] = {}
        self._cleanup_task: Optional[asyncio.Task] = None

    def _sync_game_gauges(self) -> None:
        """Recompute gauge values from the current in-memory game dict."""
        ACTIVE_GAMES.set(len(self.games))
        counts: dict[str, int] = {}
        for game in self.games.values():
            counts[game.state.value] = counts.get(game.state.value, 0) + 1
        for state in GameState:
            GAMES_BY_STATE.labels(state=state.value).set(counts.get(state.value, 0))

    def _get_lock(self, game_id: str) -> asyncio.Lock:
        """Get or create a per-game asyncio lock."""
        if game_id not in self._game_locks:
            self._game_locks[game_id] = asyncio.Lock()
        return self._game_locks[game_id]

    async def initialize(self) -> None:
        """Verify Redis, load persisted games, and start background cleanup."""
        await self._game_store.ping()
        self.games = await self._game_store.load_all()
        self._sync_game_gauges()
        self._cleanup_task = asyncio.create_task(self._periodic_cleanup())

    async def shutdown(self) -> None:
        """Cancel background tasks and wait for them to finish."""
        if self._cleanup_task:
            self._cleanup_task.cancel()
            try:
                await self._cleanup_task
            except asyncio.CancelledError:
                pass

    async def _periodic_cleanup(self) -> None:
        """Periodically evict stale games from memory and Redis."""
        while True:
            await asyncio.sleep(_CLEANUP_INTERVAL)
            try:
                await self._cleanup_stale_games()
            except Exception:
                logger.exception("Error during game cleanup")

    async def _cleanup_stale_games(self) -> None:
        now = time.time()
        stale_ids = []
        for game_id, game in self.games.items():
            if game.state == GameState.FINISHED and game.finished_at and (now - game.finished_at) > _FINISHED_GAME_TTL:
                stale_ids.append(game_id)
            elif game.state == GameState.WAITING and (now - game.created_at) > _WAITING_GAME_TTL:
                stale_ids.append(game_id)
            elif game.state in (GameState.PLACING, GameState.PLAYING):
                # Clean up games where a player has been disconnected too long
                for pid in ("player1", "player2"):
                    dc = game.disconnected_at.get(pid)
                    if dc and (now - dc) > _DISCONNECT_GAME_TTL:
                        stale_ids.append(game_id)
                        break
        for game_id in stale_ids:
            del self.games[game_id]
            self._game_locks.pop(game_id, None)
            if game_id in self.connection_manager.active_connections:
                del self.connection_manager.active_connections[game_id]
            await self._game_store.delete(game_id)
        if stale_ids:
            GAMES_CLEANED_UP.inc(len(stale_ids))
            self._sync_game_gauges()
            logger.info("Cleaned up %d stale game(s)", len(stale_ids))

    async def _persist(self, game_id: str) -> None:
        """Write-through: save current game state to Redis."""
        if game_id in self.games:
            await self._game_store.save(self.games[game_id])

    async def create_game(self, mode: GameMode = GameMode.CLASSIC) -> str:
        """Create a new game and return its ID"""
        game_id = str(uuid.uuid4())
        self.games[game_id] = Game(game_id, mode=mode)
        GAMES_CREATED.labels(mode=mode.value).inc()
        self._sync_game_gauges()
        await self._persist(game_id)
        return game_id
    
    async def get_game(self, game_id: str) -> Optional[Game]:
        """Retrieve a game by ID, falling back to Redis on cache miss."""
        game = self.games.get(game_id)
        if game is not None:
            return game
        # Cache miss — try loading from Redis (e.g. after restart)
        game = await self._game_store.load(game_id)
        if game is not None:
            self.games[game_id] = game
        return game

    async def get_game_info(self, game_id: str) -> Optional[dict]:
        """Get game information for API response.

        Only exposes the game state — player slot occupancy is deliberately
        hidden to prevent game-ID enumeration attacks (#18).

        For finished games the full (unmasked) boards and winner are included
        so the result can be rendered as a static artifact.
        """
        game = await self.get_game(game_id)
        if not game:
            return None

        info: dict = {
            "id": game.id,
            "state": game.state.value,
            "mode": game.mode.value,
        }

        if game.state == GameState.FINISHED:
            info["winner"] = game.check_winner()
            info["boards"] = {
                "player1": game.boards["player1"],
                "player2": game.boards["player2"],
            }

        return info
    
    async def handle_player_connection(
        self, game_id: str, websocket, token: str | None = None
    ) -> Optional[str]:
        """
        Handle a new player connection to a game.

        If *token* is provided the server verifies it against the stored
        session tokens and reconnects the original player.  Without a token
        only genuinely unclaimed slots (never-connected) can be assigned.

        A per-game asyncio lock serialises connection attempts so two
        simultaneous WebSocket upgrades cannot claim the same slot (#24).

        Returns:
            player_id if successful, None otherwise
        """
        game = await self.get_game(game_id)
        if not game:
            return None

        lock = self._get_lock(game_id)
        async with lock:
            player_id: str | None = None

            if token:
                # Reconnection — match the token to an existing slot
                for pid in ("player1", "player2"):
                    stored = game.session_tokens.get(pid)
                    if stored and secrets.compare_digest(stored, token):
                        player_id = pid
                        break
                if player_id is None:
                    return None  # invalid / expired token
            else:
                # First connection — only allow unclaimed slots (no token issued yet)
                for pid in ("player1", "player2"):
                    if game.session_tokens[pid] is None and game.players[pid] is None:
                        player_id = pid
                        break
                if player_id is None:
                    return None  # game is full

            # Assign websocket to the slot
            game.players[player_id] = websocket
            game.disconnected_at[player_id] = None

            # Issue a session token for brand-new players
            if game.session_tokens[player_id] is None:
                game.session_tokens[player_id] = secrets.token_urlsafe(32)

            # State transition when the second player arrives
            if player_id == "player2" and game.state == GameState.WAITING:
                game.state = GameState.PLACING
                self._sync_game_gauges()

            await self.connection_manager.connect(game_id, player_id, websocket)

            # Send player assignment (includes session token for the client to store)
            await self.connection_manager.send_to_player(game_id, player_id, {
                "type": "player_assigned",
                "player_id": player_id,
                "game_state": game.state.value,
                "session_token": game.session_tokens[player_id],
                "mode": game.mode.value,
                "max_planes": game.mode.plane_count,
            })

            # Send board state so the client can resume
            # On reconnection: for PLACING, PLAYING, and FINISHED
            # On first connection: only for PLAYING and FINISHED
            send_resumed = (
                game.state in (GameState.PLAYING, GameState.FINISHED)
                or (token and game.state == GameState.PLACING)
            )
            if send_resumed:
                opponent = "player2" if player_id == "player1" else "player1"
                opponent_board = (
                    game.boards[opponent]
                    if game.state == GameState.FINISHED
                    else game.get_masked_board(player_id)
                )
                await self.connection_manager.send_to_player(game_id, player_id, {
                    "type": "game_resumed",
                    "own_board": game.boards[player_id],
                    "opponent_board": opponent_board,
                    "current_turn": game.current_turn,
                    "game_state": game.state.value,
                    "winner": game.check_winner(),
                    "planes_placed": len(game.planes[player_id]),
                })

            # Notify both players if game is ready for placement
            if game.state == GameState.PLACING:
                await self.connection_manager.broadcast_to_game(game_id, {
                    "type": "game_ready",
                    "message": f"Both players connected. Place your planes! ({game.mode.plane_count} planes each)"
                })

            # Notify opponent that this player has (re)connected.
            # Sent on reconnection (token present) AND when a new player
            # joins a continued game that's already in PLAYING/FINISHED.
            if token or game.state in (GameState.PLAYING, GameState.FINISHED):
                opponent = "player2" if player_id == "player1" else "player1"
                await self.connection_manager.send_to_player(game_id, opponent, {
                    "type": "player_reconnected",
                    "player_id": player_id,
                })

            await self._persist(game_id)
            return player_id
    
    async def handle_plane_placement(self, game_id: str, player_id: str, plane_data: dict):
        """Handle plane placement request"""
        game = await self.get_game(game_id)
        if not game:
            return

        if game.state != GameState.PLACING:
            await self.connection_manager.send_to_player(game_id, player_id, {
                "type": "error",
                "message": "Game is not in placement phase",
            })
            return

        opponent = "player2" if player_id == "player1" else "player1"
        if game.players[opponent] is None:
            await self.connection_manager.send_to_player(game_id, player_id, {
                "type": "error",
                "message": "Opponent is disconnected"
            })
            return

        success, message = game.place_plane(player_id, plane_data)
        
        await self.connection_manager.send_to_player(game_id, player_id, {
            "type": "plane_placed",
            "success": success,
            "message": message,
            "planes_count": len(game.planes[player_id])
        })
        
        # Check if player is ready (placed all planes)
        if len(game.planes[player_id]) == game.mode.plane_count:
            game.mark_player_ready(player_id)
            
            # Check if both players are ready
            if game.are_both_players_ready():
                game.start_game()
                self._sync_game_gauges()
                await self.connection_manager.broadcast_to_game(game_id, {
                    "type": "game_started",
                    "current_turn": game.current_turn
                })

        await self._persist(game_id)

    async def handle_attack(self, game_id: str, player_id: str, x: int, y: int):
        """Handle attack request"""
        game = await self.get_game(game_id)
        if not game:
            return
        
        if game.state != GameState.PLAYING:
            await self.connection_manager.send_to_player(game_id, player_id, {
                "type": "error",
                "message": "Game is not in progress",
            })
            return
        
        if game.current_turn != player_id:
            await self.connection_manager.send_to_player(game_id, player_id, {
                "type": "error",
                "message": "Not your turn"
            })
            return

        opponent = "player2" if player_id == "player1" else "player1"
        if game.players[opponent] is None:
            await self.connection_manager.send_to_player(game_id, player_id, {
                "type": "error",
                "message": "Opponent is disconnected"
            })
            return

        result = game.attack(player_id, x, y)
        
        if result is None or result == "already_attacked":
            await self.connection_manager.send_to_player(game_id, player_id, {
                "type": "attack_result",
                "success": False,
                "message": "Invalid attack"
            })
            return
        
        # Send attack result to both players
        opponent = "player2" if player_id == "player1" else "player1"
        
        await self.connection_manager.send_to_player(game_id, player_id, {
            "type": "attack_result",
            "success": True,
            "result": result,
            "x": x,
            "y": y,
            "is_attacker": True
        })
        
        await self.connection_manager.send_to_player(game_id, opponent, {
            "type": "attack_result",
            "success": True,
            "result": result,
            "x": x,
            "y": y,
            "is_attacker": False
        })
        
        # Check for winner
        winner = game.check_winner()
        if winner:
            game.finish_game()
            GAMES_FINISHED.inc()
            self._sync_game_gauges()
            for pid in ("player1", "player2"):
                opponent = "player2" if pid == "player1" else "player1"
                await self.connection_manager.send_to_player(game_id, pid, {
                    "type": "game_over",
                    "winner": winner,
                    "opponent_board": game.boards[opponent],
                })
        else:
            # Switch turns
            game.switch_turn()
            await self.connection_manager.broadcast_to_game(game_id, {
                "type": "turn_changed",
                "current_turn": game.current_turn
            })

        await self._persist(game_id)

    async def handle_player_disconnection(self, game_id: str, player_id: str, websocket=None):
        """Handle player disconnection.

        ``websocket`` is the specific socket that disconnected.  If a newer
        connection has already replaced it (race between slow disconnect and
        fast reconnect), we skip cleanup so the new connection isn't cleared.
        """
        # Guard against stale disconnect clearing a newer connection
        if websocket is not None:
            current_ws = self.connection_manager.active_connections.get(
                game_id, {}
            ).get(player_id)
            if current_ws is not None and current_ws is not websocket:
                # A new connection already took over — nothing to clean up
                return

        self.connection_manager.disconnect(game_id, player_id)

        game = await self.get_game(game_id)
        if not game:
            return

        game.disconnected_at[player_id] = time.time()

        # After a finished game, notify the opponent and cancel any
        # pending rematch so neither player gets stuck waiting.
        if game.state == GameState.FINISHED:
            opponent = "player2" if player_id == "player1" else "player1"
            await self.connection_manager.send_to_player(game_id, opponent, {
                "type": "player_disconnected",
                "player_id": player_id,
            })
            if game.rematch_requested_by and not game.rematch_game_id:
                game.rematch_requested_by = None
                await self.connection_manager.send_to_player(game_id, opponent, {
                    "type": "rematch_cancelled",
                })
            await self._persist(game_id)
            return

        # Clear the player slot so a reconnecting client can reclaim it
        game.players[player_id] = None

        await self.connection_manager.broadcast_to_game(game_id, {
            "type": "player_disconnected",
            "player_id": player_id
        })

        await self._persist(game_id)

    async def handle_rematch_request(self, game_id: str, player_id: str):
        """Player requests a rematch. If both want one, create a new game."""
        game = await self.get_game(game_id)
        if not game or game.state != GameState.FINISHED:
            return

        if game.rematch_game_id:
            # Rematch already created — resend the game ID
            await self.connection_manager.send_to_player(game_id, player_id, {
                "type": "rematch_started",
                "game_id": game.rematch_game_id,
            })
            return

        opponent = "player2" if player_id == "player1" else "player1"

        # If the opponent isn't connected, a rematch isn't possible.
        opponent_connected = bool(
            self.connection_manager.active_connections
            .get(game_id, {})
            .get(opponent)
        )
        if not opponent_connected:
            await self.connection_manager.send_to_player(game_id, player_id, {
                "type": "rematch_declined",
                "reason": "opponent_disconnected",
            })
            return

        if game.rematch_requested_by == opponent:
            # Both players want a rematch — create the new game
            new_game_id = await self.create_game(mode=game.mode)
            game.rematch_game_id = new_game_id
            await self._persist(game_id)
            await self.connection_manager.broadcast_to_game(game_id, {
                "type": "rematch_started",
                "game_id": new_game_id,
            })
        elif game.rematch_requested_by != player_id:
            game.rematch_requested_by = player_id
            await self._persist(game_id)
            await self.connection_manager.send_to_player(game_id, opponent, {
                "type": "rematch_requested",
            })

