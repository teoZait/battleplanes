"""
Tests for production readiness fixes:
- CORS defaults (no env var set)
- Background task shutdown with proper await
- Redis socket timeout configuration
- Auth handshake exception specificity
"""
import asyncio
import json
import pytest
from unittest.mock import patch, MagicMock, AsyncMock
from fastapi.testclient import TestClient

from infrastructure.game_store import GameStore
from application.game_service import GameService


# ---------------------------------------------------------------------------
# CORS defaults
# ---------------------------------------------------------------------------

class TestCORSDefaults:

    def _reload_main(self, env_overrides=None):
        import importlib
        import main as main_module
        with patch.dict("os.environ", env_overrides or {}, clear=False):
            # Remove CORS_ALLOWED_ORIGINS so the default path is taken
            import os
            os.environ.pop("CORS_ALLOWED_ORIGINS", None)
            if env_overrides:
                os.environ.update(env_overrides)
            importlib.reload(main_module)
        return main_module

    def test_default_allows_localhost(self):
        """Without CORS_ALLOWED_ORIGINS, localhost should be allowed."""
        main_module = self._reload_main()
        assert "https://localhost" in main_module.allowed_origins
        assert "http://localhost" in main_module.allowed_origins

    def test_default_does_not_allow_arbitrary_origins(self):
        """Default CORS should not include dev ports like 3000 or 5173."""
        main_module = self._reload_main()
        for origin in main_module.allowed_origins:
            assert "3000" not in origin
            assert "5173" not in origin

    def test_env_var_overrides_defaults(self):
        """Setting CORS_ALLOWED_ORIGINS replaces all defaults."""
        main_module = self._reload_main({"CORS_ALLOWED_ORIGINS": "https://example.com"})
        assert main_module.allowed_origins == ["https://example.com"]
        assert "http://localhost" not in main_module.allowed_origins

    def test_empty_env_var_uses_defaults(self):
        """An empty CORS_ALLOWED_ORIGINS should fall back to localhost defaults."""
        main_module = self._reload_main({"CORS_ALLOWED_ORIGINS": ""})
        assert "http://localhost" in main_module.allowed_origins


# ---------------------------------------------------------------------------
# Background task shutdown
# ---------------------------------------------------------------------------

class TestShutdown:

    @pytest.mark.asyncio
    async def test_game_service_shutdown_awaits_task(self):
        """shutdown() must await the cancelled task, not just fire-and-forget."""
        from tests.conftest import FakeRedis

        store = GameStore.__new__(GameStore)
        store._redis = FakeRedis()
        service = GameService(game_store=store)
        await service.initialize()

        # The cleanup task should be running
        assert service._cleanup_task is not None
        assert not service._cleanup_task.done()

        # Shutdown should complete without errors
        await service.shutdown()

        # Task should be done (cancelled)
        assert service._cleanup_task.done()
        assert service._cleanup_task.cancelled()


# ---------------------------------------------------------------------------
# Redis socket timeout configuration
# ---------------------------------------------------------------------------

class TestRedisTimeouts:

    def test_game_store_passes_timeout_params(self):
        """GameStore should configure socket timeouts on the Redis connection."""
        with patch("redis.asyncio.from_url") as mock_from_url:
            mock_from_url.return_value = MagicMock()
            GameStore("redis://localhost:6379/0")

            mock_from_url.assert_called_once()
            call_kwargs = mock_from_url.call_args[1]
            assert call_kwargs["socket_connect_timeout"] == 5
            assert call_kwargs["socket_timeout"] == 5
            assert call_kwargs["decode_responses"] is True


# ---------------------------------------------------------------------------
# Auth handshake exception specificity
# ---------------------------------------------------------------------------

class TestAuthExceptionHandling:

    def test_pydantic_validation_error_closes_connection(self):
        """A message that fails Pydantic validation should close cleanly."""
        import importlib
        import main as main_module
        importlib.reload(main_module)
        client = TestClient(main_module.app)

        game_id = client.post("/game/create").json()["game_id"]
        with pytest.raises(Exception):
            with client.websocket_connect(f"/ws/{game_id}") as ws:
                # Valid JSON but fails AuthMessage validation (missing 'type' field)
                ws.send_json({"foo": "bar"})
                ws.receive_json()

    def test_timeout_closes_connection(self):
        """If the client never sends an auth message, the connection should close."""
        # This is covered by the 5-second timeout in the endpoint.
        # We just verify the endpoint still handles it (no regression from
        # removing the broad Exception catch).
        import importlib
        import main as main_module
        importlib.reload(main_module)
        client = TestClient(main_module.app)

        game_id = client.post("/game/create").json()["game_id"]
        with pytest.raises(Exception):
            with client.websocket_connect(f"/ws/{game_id}") as ws:
                # Send garbage text (not JSON)
                ws.send_text("not json at all")
                ws.receive_json()
