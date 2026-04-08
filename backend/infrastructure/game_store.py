"""
Infrastructure - Redis-backed Game State Persistence

Every game mutation is written through to Redis so that a server restart
can restore active games.  Redis is required — the application will fail
fast at startup if it is unreachable.
"""
import json
import logging
import time
from typing import Dict, Optional

import redis.asyncio as aioredis

from domain.models import Game, Plane
from domain.value_objects import GameState, GameMode

logger = logging.getLogger(__name__)

# Games expire from Redis after 2 hours of inactivity.
GAME_TTL_SECONDS = 60 * 60 * 2

# Redis Set that tracks all active game IDs so we can avoid SCAN on startup.
_ACTIVE_GAMES_KEY = "active_games"


class GameStore:
    """Persists serialised Game state to Redis."""

    def __init__(self, redis_url: str):
        self._redis: aioredis.Redis = aioredis.from_url(
            redis_url,
            decode_responses=True,
            socket_connect_timeout=5,
            socket_timeout=5,
        )
        logger.info("GameStore configured for Redis at %s", redis_url)

    async def ping(self) -> None:
        """Verify Redis is reachable.  Raises on failure."""
        await self._redis.ping()
        logger.info("Redis connection verified")

    # ------------------------------------------------------------------
    # Public API
    # ------------------------------------------------------------------

    async def save(self, game: Game) -> None:
        """Write-through: persist the current game state."""
        key = self._key(game.id)
        data = json.dumps(self._serialize(game))
        await self._redis.set(key, data, ex=GAME_TTL_SECONDS)
        await self._redis.sadd(_ACTIVE_GAMES_KEY, game.id)

    async def load(self, game_id: str) -> Optional[Game]:
        """Load a single game from Redis."""
        raw = await self._redis.get(self._key(game_id))
        if raw is None:
            return None
        return self._deserialize(json.loads(raw))

    async def load_all(self) -> Dict[str, Game]:
        """Restore every persisted game (used at startup).

        Uses a Redis Set of active game IDs + MGET instead of SCAN,
        so startup cost is O(active games) not O(all Redis keys).
        """
        game_ids = await self._redis.smembers(_ACTIVE_GAMES_KEY)
        if not game_ids:
            logger.info("Restored 0 game(s) from Redis")
            return {}

        keys = [self._key(gid) for gid in game_ids]
        values = await self._redis.mget(keys)

        games: Dict[str, Game] = {}
        expired_ids: list[str] = []
        for gid, raw in zip(game_ids, values):
            if raw is None:
                # Key expired via TTL but ID lingered in the set — clean up.
                expired_ids.append(gid)
                continue
            game = self._deserialize(json.loads(raw))
            games[game.id] = game

        # Remove stale IDs from the set in one call.
        if expired_ids:
            await self._redis.srem(_ACTIVE_GAMES_KEY, *expired_ids)

        logger.info("Restored %d game(s) from Redis", len(games))
        return games

    async def delete(self, game_id: str) -> None:
        """Remove a finished/stale game from Redis."""
        await self._redis.delete(self._key(game_id))
        await self._redis.srem(_ACTIVE_GAMES_KEY, game_id)

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
            "mode": game.mode.value,
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
        game = Game(data["id"], mode=GameMode(data.get("mode", "classic")))
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
