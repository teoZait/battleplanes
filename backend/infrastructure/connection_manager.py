"""
Infrastructure - WebSocket Connection Management
"""
import logging
from typing import Dict
from fastapi import WebSocket

logger = logging.getLogger(__name__)


class ConnectionManager:
    """Manages WebSocket connections for games"""

    def __init__(self):
        self.active_connections: Dict[str, Dict[str, WebSocket]] = {}

    async def connect(self, game_id: str, player_id: str, websocket: WebSocket):
        """Register an already-accepted WebSocket connection."""
        if game_id not in self.active_connections:
            self.active_connections[game_id] = {}
        self.active_connections[game_id][player_id] = websocket

    def disconnect(self, game_id: str, player_id: str):
        """Remove a WebSocket connection"""
        if game_id in self.active_connections and player_id in self.active_connections[game_id]:
            del self.active_connections[game_id][player_id]

    async def send_to_player(self, game_id: str, player_id: str, message: dict):
        """Send a message to a specific player. Silently handles broken connections."""
        if game_id in self.active_connections and player_id in self.active_connections[game_id]:
            try:
                await self.active_connections[game_id][player_id].send_json(message)
            except Exception:
                logger.warning("Failed to send to game=%s player=%s", game_id, player_id)
                self.disconnect(game_id, player_id)

    async def broadcast_to_game(self, game_id: str, message: dict):
        """Broadcast a message to all players in a game."""
        if game_id in self.active_connections:
            for player_id in list(self.active_connections[game_id].keys()):
                await self.send_to_player(game_id, player_id, message)
