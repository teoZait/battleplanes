"""
Infrastructure - Redis-backed Game State Persistence

Optional write-through cache: every game mutation is written to Redis so
that a server restart can restore active games.  When REDIS_URL is not
configured the store is a no-op and games live only in memory.
"""
import json
import logging
import time
from typing import Dict, Optional

import redis.asyncio as aioredis

from domain.models import Game, Plane
from domain.value_objects import GameState

logger = logging.getLogger(__name__)

# Games expire from Redis after 24 hours of inactivity.
GAME_TTL_SECONDS = 60 * 60 * 2


class GameStore:
    """Persists serialised Game state to Redis."""

    def __init__(self, redis_url: Optional[str] = None):
        self._redis: Optional[aioredis.Redis] = None
        if redis_url:
            self._redis = aioredis.from_url(redis_url, decode_responses=True)
            logger.info("GameStore connected to Redis at %s", redis_url)

    @property
    def available(self) -> bool:
        return self._redis is not None

    # ------------------------------------------------------------------
    # Public API
    # ------------------------------------------------------------------

    async def save(self, game: Game) -> None:
        """Write-through: persist the current game state."""
        if not self._redis:
            return
        key = self._key(game.id)
        data = json.dumps(self._serialize(game))
        await self._redis.set(key, data, ex=GAME_TTL_SECONDS)

    async def load(self, game_id: str) -> Optional[Game]:
        """Load a single game from Redis."""
        if not self._redis:
            return None
        raw = await self._redis.get(self._key(game_id))
        if raw is None:
            return None
        return self._deserialize(json.loads(raw))

    async def load_all(self) -> Dict[str, Game]:
        """Restore every persisted game (used at startup)."""
        if not self._redis:
            return {}
        games: Dict[str, Game] = {}
        async for key in self._redis.scan_iter(match="game:*"):
            raw = await self._redis.get(key)
            if raw is None:
                continue
            game = self._deserialize(json.loads(raw))
            games[game.id] = game
        logger.info("Restored %d game(s) from Redis", len(games))
        return games

    async def delete(self, game_id: str) -> None:
        """Remove a finished/stale game from Redis."""
        if not self._redis:
            return
        await self._redis.delete(self._key(game_id))

    # ------------------------------------------------------------------
    # Serialisation helpers
    # ------------------------------------------------------------------

    @staticmethod
    def _key(game_id: str) -> str:
        return f"game:{game_id}"

    @staticmethod
    def _serialize(game: Game) -> dict:
        return {
            "id": game.id,
            "boards": game.boards,
            "planes": {
                pid: [p.model_dump(mode="json") for p in planes]
                for pid, planes in game.planes.items()
            },
            "state": game.state.value,
            "current_turn": game.current_turn,
            "ready": game.ready,
            "session_tokens": game.session_tokens,
            "created_at": game.created_at,
            "finished_at": game.finished_at,
        }

    @staticmethod
    def _deserialize(data: dict) -> Game:
        game = Game(data["id"])
        game.boards = data["boards"]
        game.planes = {
            pid: [Plane(**p) for p in planes]
            for pid, planes in data["planes"].items()
        }
        game.state = GameState(data["state"])
        game.current_turn = data["current_turn"]
        game.ready = data["ready"]
        game.session_tokens = data.get("session_tokens", {"player1": None, "player2": None})
        game.created_at = data.get("created_at", time.time())
        game.finished_at = data.get("finished_at")
        # players stay None — they reconnect via WebSocket
        return game
