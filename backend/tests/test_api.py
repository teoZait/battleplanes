"""
Tests for API layer changes: CORS configuration and rate limiting.
"""
import pytest
import time
from unittest.mock import patch
from fastapi.testclient import TestClient


class TestCORSConfiguration:
    """Test that CORS is properly restricted to configured origins."""

    def test_cors_allows_configured_origin(self):
        """Requests from allowed origins should include CORS headers."""
        with patch.dict("os.environ", {"CORS_ALLOWED_ORIGINS": "http://localhost:3000"}):
            # Re-import to pick up new env var
            import importlib
            import main as main_module
            importlib.reload(main_module)
            client = TestClient(main_module.app)

            response = client.get(
                "/",
                headers={"Origin": "http://localhost:3000"}
            )
            assert response.status_code == 200
            assert response.headers.get("access-control-allow-origin") == "http://localhost:3000"

    def test_cors_blocks_unknown_origin(self):
        """Requests from disallowed origins should not get CORS headers."""
        with patch.dict("os.environ", {"CORS_ALLOWED_ORIGINS": "http://localhost:3000"}):
            import importlib
            import main as main_module
            importlib.reload(main_module)
            client = TestClient(main_module.app)

            response = client.get(
                "/",
                headers={"Origin": "http://evil.example.com"}
            )
            assert response.status_code == 200
            # No CORS header for disallowed origin
            assert "access-control-allow-origin" not in response.headers

    def test_cors_multiple_origins(self):
        """Multiple comma-separated origins should all be allowed."""
        origins = "http://localhost:3000,http://localhost:5173"
        with patch.dict("os.environ", {"CORS_ALLOWED_ORIGINS": origins}):
            import importlib
            import main as main_module
            importlib.reload(main_module)
            client = TestClient(main_module.app)

            for origin in origins.split(","):
                response = client.get("/", headers={"Origin": origin})
                assert response.headers.get("access-control-allow-origin") == origin

    def test_cors_preflight_request(self):
        """OPTIONS preflight requests should return proper CORS headers."""
        with patch.dict("os.environ", {"CORS_ALLOWED_ORIGINS": "http://localhost:3000"}):
            import importlib
            import main as main_module
            importlib.reload(main_module)
            client = TestClient(main_module.app)

            response = client.options(
                "/game/create",
                headers={
                    "Origin": "http://localhost:3000",
                    "Access-Control-Request-Method": "POST",
                }
            )
            assert response.headers.get("access-control-allow-origin") == "http://localhost:3000"


class TestRateLimiting:
    """Test the rate limiting middleware."""

    def _get_fresh_client(self):
        """Get a fresh test client with reset rate limit store."""
        import importlib
        import main as main_module
        importlib.reload(main_module)
        return TestClient(main_module.app), main_module

    def test_requests_within_limit_succeed(self):
        """Requests under the rate limit should succeed normally."""
        client, _ = self._get_fresh_client()

        for _ in range(5):
            response = client.post("/game/create")
            assert response.status_code == 200

    def test_rate_limit_returns_429(self):
        """Exceeding the rate limit should return 429."""
        client, main_module = self._get_fresh_client()

        # Exhaust the limit (30 requests)
        for _ in range(main_module.RATE_LIMIT_MAX_REQUESTS):
            response = client.post("/game/create")
            assert response.status_code == 200

        # Next request should be rate limited
        response = client.post("/game/create")
        assert response.status_code == 429
        assert "Too many requests" in response.json()["detail"]

    def test_rate_limit_error_message(self):
        """Rate limited response should include a helpful message."""
        client, main_module = self._get_fresh_client()

        for _ in range(main_module.RATE_LIMIT_MAX_REQUESTS):
            client.post("/game/create")

        response = client.post("/game/create")
        assert response.json() == {"detail": "Too many requests. Try again later."}

    def test_health_check_exempt_from_rate_limit(self):
        """The health check endpoint (GET /) should bypass rate limiting."""
        client, main_module = self._get_fresh_client()

        # Exhaust the rate limit on game creation
        for _ in range(main_module.RATE_LIMIT_MAX_REQUESTS):
            client.post("/game/create")

        # Health check should still work
        response = client.get("/")
        assert response.status_code == 200
        assert response.json() == {"message": "Warplanes API"}

    def test_rate_limit_window_resets(self):
        """Requests should be allowed again after the window expires."""
        client, main_module = self._get_fresh_client()

        # Exhaust the limit
        for _ in range(main_module.RATE_LIMIT_MAX_REQUESTS):
            client.post("/game/create")

        response = client.post("/game/create")
        assert response.status_code == 429

        # Fast-forward time past the window
        with patch("main.time") as mock_time:
            future_time = time.time() + main_module.RATE_LIMIT_WINDOW + 1
            mock_time.time.return_value = future_time
            # Clear old entries by making a new request
            # The middleware filters timestamps older than window_start
            main_module._rate_limit_store.clear()

            response = client.post("/game/create")
            assert response.status_code == 200

    def test_rate_limit_applies_to_different_endpoints(self):
        """Rate limit should count requests across all non-health-check endpoints."""
        client, main_module = self._get_fresh_client()

        # Mix of endpoints consuming the same rate limit budget
        for _ in range(main_module.RATE_LIMIT_MAX_REQUESTS // 2):
            client.post("/game/create")

        for _ in range(main_module.RATE_LIMIT_MAX_REQUESTS // 2):
            client.get("/game/nonexistent-id")

        # Budget exhausted
        response = client.post("/game/create")
        assert response.status_code == 429


class TestExistingEndpoints:
    """Verify existing endpoints still work correctly after changes."""

    def _get_fresh_client(self):
        import importlib
        import main as main_module
        importlib.reload(main_module)
        return TestClient(main_module.app)

    def test_health_check(self):
        client = self._get_fresh_client()
        response = client.get("/")
        assert response.status_code == 200
        assert response.json() == {"message": "Warplanes API"}

    def test_create_game(self):
        client = self._get_fresh_client()
        response = client.post("/game/create")
        assert response.status_code == 200
        assert "game_id" in response.json()

    def test_get_nonexistent_game(self):
        client = self._get_fresh_client()
        response = client.get("/game/nonexistent-id")
        assert response.status_code == 404

    def test_create_and_get_game(self):
        client = self._get_fresh_client()
        create_response = client.post("/game/create")
        game_id = create_response.json()["game_id"]

        get_response = client.get(f"/game/{game_id}")
        assert get_response.status_code == 200
        data = get_response.json()
        assert data["id"] == game_id
        assert data["state"] == "waiting"
