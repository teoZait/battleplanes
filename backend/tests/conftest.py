# Remove REDIS_URL before any test module imports main.py, so
# the async Redis client is never created during tests.
# Tests that need persistence use _FakeRedis instead.
import os
os.environ.pop("REDIS_URL", None)
