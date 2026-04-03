"""
Application Service - Game orchestration and use cases
"""
from __future__ import annotations
from typing import Dict, Optional
import uuid
from domain.models import Game
from domain.value_objects import GameState
from infrastructure.connection_manager import ConnectionManager
from infrastructure.game_store import GameStore


class GameService:
    """Application service for game-related operations"""

    def __init__(self, game_store: Optional[GameStore] = None):
        self.connection_manager = ConnectionManager()
        self._game_store = game_store

        # Restore persisted games on startup (Redis → memory)
        if game_store and game_store.available:
            self.games: Dict[str, Game] = game_store.load_all()
        else:
            self.games = {}
    
    def _persist(self, game_id: str) -> None:
        """Write-through: save current game state to Redis (no-op without store)."""
        if self._game_store and game_id in self.games:
            self._game_store.save(self.games[game_id])

    def create_game(self) -> str:
        """Create a new game and return its ID"""
        game_id = str(uuid.uuid4())
        self.games[game_id] = Game(game_id)
        self._persist(game_id)
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
    
    async def handle_player_connection(self, game_id: str, websocket) -> Optional[str]:
        """
        Handle a new player connection to a game.
        
        Returns:
            player_id if successful, None otherwise
        """
        game = self.get_game(game_id)
        if not game:
            return None
        
        player_id = game.add_player(websocket)
        if not player_id:
            return None
        
        await self.connection_manager.connect(game_id, player_id, websocket)

        # Send player assignment
        await self.connection_manager.send_to_player(game_id, player_id, {
            "type": "player_assigned",
            "player_id": player_id,
            "game_state": game.state
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

        self._persist(game_id)
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

        self._persist(game_id)

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

        self._persist(game_id)

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

        self._persist(game_id)
