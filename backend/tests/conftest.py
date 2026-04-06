# Remove REDIS_URL before any test module imports main.py.
import os
os.environ.pop("REDIS_URL", None)

# ---------------------------------------------------------------------------
# FakeRedis — shared async in-memory stand-in for redis.asyncio.Redis
# ---------------------------------------------------------------------------
import fnmatch


class FakeRedis:
    """Minimal async in-memory Redis used by all test suites."""

    def __init__(self):
        self.store: dict[str, str] = {}
        self.sets: dict[str, set[str]] = {}

    async def ping(self):
        return True

    async def set(self, key, value, ex=None):
        self.store[key] = value

    async def get(self, key):
        return self.store.get(key)

    async def mget(self, keys):
        return [self.store.get(k) for k in keys]

    async def delete(self, key):
        self.store.pop(key, None)

    async def sadd(self, key, *members):
        self.sets.setdefault(key, set()).update(members)

    async def srem(self, key, *members):
        if key in self.sets:
            self.sets[key] -= set(members)

    async def smembers(self, key):
        return set(self.sets.get(key, set()))

    async def scan_iter(self, match="*"):
        for k in list(self.store.keys()):
            if fnmatch.fnmatch(k, match):
                yield k


# ---------------------------------------------------------------------------
# Patch redis.asyncio.from_url BEFORE any production code imports it.
# Every GameStore constructed during tests will receive a FakeRedis instance.
# ---------------------------------------------------------------------------
import redis.asyncio as _aioredis

_aioredis.from_url = lambda *args, **kwargs: FakeRedis()


# ---------------------------------------------------------------------------
# Shared pytest fixtures
# ---------------------------------------------------------------------------
import pytest
from infrastructure.game_store import GameStore
from application.game_service import GameService


@pytest.fixture
def game_store():
    """A GameStore backed by a fresh FakeRedis."""
    store = GameStore.__new__(GameStore)
    store._redis = FakeRedis()
    return store


@pytest.fixture
def service(game_store):
    """A GameService wired to a FakeRedis-backed GameStore."""
    return GameService(game_store=game_store)
