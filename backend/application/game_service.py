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
from domain.value_objects import GameState
from infrastructure.connection_manager import ConnectionManager
from infrastructure.game_store import GameStore

logger = logging.getLogger(__name__)

# Cleanup thresholds
_FINISHED_GAME_TTL = 30 * 60    # 30 minutes after finishing
_WAITING_GAME_TTL = 2 * 60 * 60  # 2 hours if still waiting
_CLEANUP_INTERVAL = 5 * 60       # run every 5 minutes


class GameService:
    """Application service for game-related operations"""

    def __init__(self, game_store: Optional[GameStore] = None):
        self.connection_manager = ConnectionManager()
        self._game_store = game_store
        self.games: Dict[str, Game] = {}
        self._cleanup_task: Optional[asyncio.Task] = None

    async def initialize(self) -> None:
        """Load persisted games from Redis and start background cleanup."""
        if self._game_store and self._game_store.available:
            self.games = await self._game_store.load_all()
        self._cleanup_task = asyncio.create_task(self._periodic_cleanup())

    async def shutdown(self) -> None:
        """Cancel background tasks."""
        if self._cleanup_task:
            self._cleanup_task.cancel()

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
        for game_id in stale_ids:
            del self.games[game_id]
            if game_id in self.connection_manager.active_connections:
                del self.connection_manager.active_connections[game_id]
            if self._game_store:
                await self._game_store.delete(game_id)
        if stale_ids:
            logger.info("Cleaned up %d stale game(s)", len(stale_ids))

    async def _persist(self, game_id: str) -> None:
        """Write-through: save current game state to Redis (no-op without store)."""
        if self._game_store and game_id in self.games:
            await self._game_store.save(self.games[game_id])

    async def create_game(self) -> str:
        """Create a new game and return its ID"""
        game_id = str(uuid.uuid4())
        self.games[game_id] = Game(game_id)
        await self._persist(game_id)
        return game_id
    
    def get_game(self, game_id: str) -> Optional[Game]:
        """Retrieve a game by ID"""
        return self.games.get(game_id)
    
    def get_game_info(self, game_id: str) -> Optional[dict]:
        """Get game information for API response"""
        game = self.get_game(game_id)
        if not game:
            return None
        
        return {
            "id": game.id,
            "state": game.state,
            "current_turn": game.current_turn,
            "players": {
                "player1": game.players["player1"] is not None,
                "player2": game.players["player2"] is not None
            }
        }
    
    async def handle_player_connection(
        self, game_id: str, websocket, token: str | None = None
    ) -> Optional[str]:
        """
        Handle a new player connection to a game.

        If *token* is provided the server verifies it against the stored
        session tokens and reconnects the original player.  Without a token
        only genuinely unclaimed slots (never-connected) can be assigned.

        Returns:
            player_id if successful, None otherwise
        """
        game = self.get_game(game_id)
        if not game:
            return None

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

        # Issue a session token for brand-new players
        if game.session_tokens[player_id] is None:
            game.session_tokens[player_id] = secrets.token_urlsafe(32)

        # State transition when the second player arrives
        if player_id == "player2" and game.state == GameState.WAITING:
            game.state = GameState.PLACING

        await self.connection_manager.connect(game_id, player_id, websocket)

        # Send player assignment (includes session token for the client to store)
        await self.connection_manager.send_to_player(game_id, player_id, {
            "type": "player_assigned",
            "player_id": player_id,
            "game_state": game.state,
            "session_token": game.session_tokens[player_id],
        })

        # If game is already in progress, send board state so the client can resume
        if game.state in (GameState.PLAYING, GameState.FINISHED):
            await self.connection_manager.send_to_player(game_id, player_id, {
                "type": "game_resumed",
                "own_board": game.boards[player_id],
                "opponent_board": game.get_masked_board(player_id),
                "current_turn": game.current_turn,
            })
        # Notify both players if game is ready for placement
        elif game.state == GameState.PLACING:
            await self.connection_manager.broadcast_to_game(game_id, {
                "type": "game_ready",
                "message": "Both players connected. Place your planes! (2 planes each)"
            })

        await self._persist(game_id)
        return player_id
    
    async def handle_plane_placement(self, game_id: str, player_id: str, plane_data: dict):
        """Handle plane placement request"""
        game = self.get_game(game_id)
        if not game:
            return
        
        success, message = game.place_plane(player_id, plane_data)
        
        await self.connection_manager.send_to_player(game_id, player_id, {
            "type": "plane_placed",
            "success": success,
            "message": message,
            "planes_count": len(game.planes[player_id])
        })
        
        # Check if player is ready (placed both planes)
        if len(game.planes[player_id]) == 2:
            game.mark_player_ready(player_id)
            
            # Check if both players are ready
            if game.are_both_players_ready():
                game.start_game()
                await self.connection_manager.broadcast_to_game(game_id, {
                    "type": "game_started",
                    "current_turn": game.current_turn
                })

        await self._persist(game_id)

    async def handle_attack(self, game_id: str, player_id: str, x: int, y: int):
        """Handle attack request"""
        game = self.get_game(game_id)
        if not game:
            return
        
        if game.state != GameState.PLAYING:
            return
        
        if game.current_turn != player_id:
            await self.connection_manager.send_to_player(game_id, player_id, {
                "type": "error",
                "message": "Not your turn"
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
            await self.connection_manager.broadcast_to_game(game_id, {
                "type": "game_over",
                "winner": winner
            })
        else:
            # Switch turns
            game.switch_turn()
            await self.connection_manager.broadcast_to_game(game_id, {
                "type": "turn_changed",
                "current_turn": game.current_turn
            })

        await self._persist(game_id)

    async def handle_player_disconnection(self, game_id: str, player_id: str):
        """Handle player disconnection"""
        self.connection_manager.disconnect(game_id, player_id)

        # Clear the player slot so a reconnecting client can reclaim it
        game = self.get_game(game_id)
        if game:
            game.players[player_id] = None

        await self.connection_manager.broadcast_to_game(game_id, {
            "type": "player_disconnected",
            "player_id": player_id
        })

        await self._persist(game_id)
