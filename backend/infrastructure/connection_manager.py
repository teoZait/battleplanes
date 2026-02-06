"""
Infrastructure - WebSocket Connection Management
"""
from typing import Dict
from fastapi import WebSocket


class ConnectionManager:
    """Manages WebSocket connections for games"""
    
    def __init__(self):
        self.active_connections: Dict[str, Dict[str, WebSocket]] = {}

    async def connect(self, game_id: str, player_id: str, websocket: WebSocket):
        """Accept and register a new WebSocket connection"""
        await websocket.accept()
        if game_id not in self.active_connections:
            self.active_connections[game_id] = {}
        self.active_connections[game_id][player_id] = websocket

    def disconnect(self, game_id: str, player_id: str):
        """Remove a WebSocket connection"""
        if game_id in self.active_connections and player_id in self.active_connections[game_id]:
            del self.active_connections[game_id][player_id]

    async def send_to_player(self, game_id: str, player_id: str, message: dict):
        """Send a message to a specific player"""
        if game_id in self.active_connections and player_id in self.active_connections[game_id]:
            await self.active_connections[game_id][player_id].send_json(message)

    async def broadcast_to_game(self, game_id: str, message: dict):
        """Broadcast a message to all players in a game"""
        if game_id in self.active_connections:
            for websocket in self.active_connections[game_id].values():
                await websocket.send_json(message)
