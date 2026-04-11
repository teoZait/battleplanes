"""
Tests for the GameService application layer.

Uses mock WebSocket objects to test the service in isolation,
without going through HTTP/ASGI.
"""
import asyncio
import time
import pytest
from application.game_service import GameService
from domain.value_objects import GameState, GameMode


# ---------------------------------------------------------------------------
# Mock WebSocket
# ---------------------------------------------------------------------------

class MockWebSocket:
    """Minimal async WebSocket stand-in for service-layer tests."""

    def __init__(self):
        self.messages: list[dict] = []
        self.accepted = False
        self.closed = False

    async def accept(self):
        self.accepted = True

    async def send_json(self, data: dict):
        self.messages.append(data)

    async def close(self, code: int = 1000):
        self.closed = True

    # helpers for assertions
    def last(self) -> dict:
        return self.messages[-1]

    def find(self, msg_type: str) -> dict | None:
        return next((m for m in self.messages if m.get("type") == msg_type), None)

    def clear(self):
        self.messages.clear()


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------

PLANE_1 = {"head_x": 2, "head_y": 0, "orientation": "up", "type": "place_plane"}
PLANE_2 = {"head_x": 7, "head_y": 0, "orientation": "up", "type": "place_plane"}
PLANE_3 = {"head_x": 5, "head_y": 9, "orientation": "down", "type": "place_plane"}

# NOTE: the `service` fixture is provided by conftest.py (FakeRedis-backed)


async def _connect_two(service: GameService, game_id: str):
    """Connect two mock players and return (ws1, ws2)."""
    ws1, ws2 = MockWebSocket(), MockWebSocket()
    p1 = await service.handle_player_connection(game_id, ws1)
    p2 = await service.handle_player_connection(game_id, ws2)
    assert p1 == "player1" and p2 == "player2"
    return ws1, ws2


async def _setup_playing(service: GameService):
    """Create game, connect 2 players, place all planes, return (game_id, ws1, ws2)."""
    game_id = await service.create_game()
    ws1, ws2 = await _connect_two(service, game_id)

    for pid in ("player1", "player2"):
        await service.handle_plane_placement(game_id, pid, PLANE_1)
        await service.handle_plane_placement(game_id, pid, PLANE_2)

    game = await service.get_game(game_id)
    assert game.state == "playing"
    ws1.clear()
    ws2.clear()
    return game_id, ws1, ws2


async def _play_to_finish(service: GameService):
    """Setup and play a game to completion. Returns (game_id, ws1, ws2)."""
    gid, ws1, ws2 = await _setup_playing(service)
    await service.handle_attack(gid, "player1", 2, 0)   # head_hit
    await service.handle_attack(gid, "player2", 5, 5)   # miss
    await service.handle_attack(gid, "player1", 7, 0)   # head_hit → game over
    game = await service.get_game(gid)
    assert game.state == GameState.FINISHED
    ws1.clear()
    ws2.clear()
    return gid, ws1, ws2


# ---------------------------------------------------------------------------
# Game creation
# ---------------------------------------------------------------------------

class TestGameCreation:

    @pytest.mark.asyncio
    async def test_create_returns_uuid(self, service):
        gid = await service.create_game()
        assert isinstance(gid, str) and len(gid) > 0

    @pytest.mark.asyncio
    async def test_get_game(self, service):
        gid = await service.create_game()
        game = await service.get_game(gid)
        assert game is not None
        assert game.id == gid

    @pytest.mark.asyncio
    async def test_get_nonexistent(self, service):
        assert await service.get_game("nope") is None

    @pytest.mark.asyncio
    async def test_game_info(self, service):
        gid = await service.create_game()
        info = await service.get_game_info(gid)
        assert info["id"] == gid
        assert info["state"] == "waiting"
        # #18 — must not expose player slots or current_turn
        assert "players" not in info
        assert "current_turn" not in info


# ---------------------------------------------------------------------------
# Session token authentication (#13)
# ---------------------------------------------------------------------------

class TestSessionTokenAuth:

    @pytest.mark.asyncio
    async def test_tokens_persist_across_disconnect(self, service):
        """Session token survives disconnect and can be reused."""
        gid = await service.create_game()
        ws1, ws2 = await _connect_two(service, gid)
        game = await service.get_game(gid)
        token1 = game.session_tokens["player1"]

        await service.handle_player_disconnection(gid, "player1")
        assert game.session_tokens["player1"] == token1  # token not cleared

        ws1_new = MockWebSocket()
        pid = await service.handle_player_connection(gid, ws1_new, token=token1)
        assert pid == "player1"

    @pytest.mark.asyncio
    async def test_each_player_gets_unique_token(self, service):
        gid = await service.create_game()
        await _connect_two(service, gid)
        game = await service.get_game(gid)
        assert game.session_tokens["player1"] != game.session_tokens["player2"]


# ---------------------------------------------------------------------------
# Disconnect & reconnect
# ---------------------------------------------------------------------------

class TestDisconnect:

    @pytest.mark.asyncio
    async def test_disconnect_clears_slot(self, service):
        gid = await service.create_game()
        ws1, _ = await _connect_two(service, gid)
        await service.handle_player_disconnection(gid, "player1")
        game = await service.get_game(gid)
        assert game.players["player1"] is None

    @pytest.mark.asyncio
    async def test_disconnect_after_finished_does_not_clear_slot(self, service):
        """After a finished game, disconnecting should NOT clear the player slot."""
        gid, ws1, ws2 = await _setup_playing(service)

        await service.handle_attack(gid, "player1", 2, 0)
        await service.handle_attack(gid, "player2", 5, 5)
        await service.handle_attack(gid, "player1", 7, 0)  # game over

        await service.handle_player_disconnection(gid, "player2")
        game = await service.get_game(gid)
        assert game.players["player2"] is not None

    @pytest.mark.asyncio
    async def test_reconnect_does_not_reset_state(self, service):
        """Reconnecting player2 must not revert the game to PLACING."""
        gid, _, ws2 = await _setup_playing(service)
        game = await service.get_game(gid)
        token2 = game.session_tokens["player2"]

        await service.handle_player_disconnection(gid, "player2")

        ws2_new = MockWebSocket()
        await service.handle_player_connection(gid, ws2_new, token=token2)

        assert game.state == "playing"

    @pytest.mark.asyncio
    async def test_reconnect_notifies_opponent_during_playing(self, service):
        """When a player reconnects mid-game, their opponent should be notified."""
        gid, ws1, ws2 = await _setup_playing(service)
        game = await service.get_game(gid)
        token2 = game.session_tokens["player2"]

        await service.handle_player_disconnection(gid, "player2")
        ws1.clear()

        ws2_new = MockWebSocket()
        await service.handle_player_connection(gid, ws2_new, token=token2)

        reconnected = ws1.find("player_reconnected")
        assert reconnected is not None
        assert reconnected["player_id"] == "player2"

    @pytest.mark.asyncio
    async def test_reconnect_notifies_opponent_during_placing(self, service):
        """When a player reconnects during placement, their opponent should be notified."""
        gid = await service.create_game()
        ws1, ws2 = await _connect_two(service, gid)
        game = await service.get_game(gid)
        token1 = game.session_tokens["player1"]

        await service.handle_player_disconnection(gid, "player1")
        ws2.clear()

        ws1_new = MockWebSocket()
        await service.handle_player_connection(gid, ws1_new, token=token1)

        reconnected = ws2.find("player_reconnected")
        assert reconnected is not None
        assert reconnected["player_id"] == "player1"

    @pytest.mark.asyncio
    async def test_first_connection_does_not_send_reconnected(self, service):
        """Initial connections (no token) must not trigger player_reconnected."""
        gid = await service.create_game()
        ws1 = MockWebSocket()
        await service.handle_player_connection(gid, ws1)

        ws2 = MockWebSocket()
        await service.handle_player_connection(gid, ws2)

        assert ws1.find("player_reconnected") is None

    @pytest.mark.asyncio
    async def test_reconnect_during_placing_notifies_game_ready(self, service):
        """Reconnecting during PLACING should broadcast game_ready to both players."""
        gid = await service.create_game()
        ws1, ws2 = await _connect_two(service, gid)
        game = await service.get_game(gid)
        token1 = game.session_tokens["player1"]

        await service.handle_player_disconnection(gid, "player1")
        ws2.clear()

        ws1_new = MockWebSocket()
        await service.handle_player_connection(gid, ws1_new, token=token1)

        # Both players should get game_ready
        assert ws2.find("game_ready") is not None


# ---------------------------------------------------------------------------
# Connection lock (#24)
# ---------------------------------------------------------------------------

class TestConnectionLock:

    @pytest.mark.asyncio
    async def test_concurrent_connections_get_different_slots(self, service):
        """Two connections arriving concurrently must not both get player1."""
        gid = await service.create_game()
        ws1, ws2 = MockWebSocket(), MockWebSocket()

        # Launch both connections concurrently
        results = await asyncio.gather(
            service.handle_player_connection(gid, ws1),
            service.handle_player_connection(gid, ws2),
        )
        # Both should succeed, getting different slots
        assert set(results) == {"player1", "player2"}

    @pytest.mark.asyncio
    async def test_third_concurrent_connection_rejected(self, service):
        """With two connections in-flight, a third must be rejected."""
        gid = await service.create_game()
        ws1, ws2, ws3 = MockWebSocket(), MockWebSocket(), MockWebSocket()

        results = await asyncio.gather(
            service.handle_player_connection(gid, ws1),
            service.handle_player_connection(gid, ws2),
            service.handle_player_connection(gid, ws3),
        )
        non_none = [r for r in results if r is not None]
        assert len(non_none) == 2
        assert set(non_none) == {"player1", "player2"}

    @pytest.mark.asyncio
    async def test_lock_is_per_game(self, service):
        """Locks should be independent per game — different games don't block each other."""
        gid1 = await service.create_game()
        gid2 = await service.create_game()
        assert service._get_lock(gid1) is not service._get_lock(gid2)


# ---------------------------------------------------------------------------
# Disconnect race condition guard
# ---------------------------------------------------------------------------

class TestDisconnectRaceCondition:

    @pytest.mark.asyncio
    async def test_stale_disconnect_does_not_clear_new_connection(self, service):
        """If a new connection replaces an old one, the old disconnect should be a no-op."""
        gid, ws1, ws2 = await _setup_playing(service)
        game = await service.get_game(gid)
        token2 = game.session_tokens["player2"]
        old_ws2 = ws2

        # Reconnect player2 with a new websocket (before old disconnect fires)
        ws2_new = MockWebSocket()
        await service.handle_player_connection(gid, ws2_new, token=token2)

        # Old disconnect fires — should NOT clear the new connection
        await service.handle_player_disconnection(gid, "player2", old_ws2)

        # player2 should still be connected
        game = await service.get_game(gid)
        assert game.players["player2"] is ws2_new
        # Connection manager should still have the new websocket
        cm = service.connection_manager.active_connections.get(gid, {})
        assert cm.get("player2") is ws2_new

    @pytest.mark.asyncio
    async def test_current_disconnect_still_works(self, service):
        """Normal disconnect (matching websocket) should still clear the slot."""
        gid, ws1, ws2 = await _setup_playing(service)

        await service.handle_player_disconnection(gid, "player2", ws2)

        game = await service.get_game(gid)
        assert game.players["player2"] is None

    @pytest.mark.asyncio
    async def test_disconnect_without_websocket_still_works(self, service):
        """Backwards-compatible: disconnect with no websocket arg should still work."""
        gid, ws1, ws2 = await _setup_playing(service)

        await service.handle_player_disconnection(gid, "player2")

        game = await service.get_game(gid)
        assert game.players["player2"] is None


# ---------------------------------------------------------------------------
# game_state serialised as plain string (#25)
# ---------------------------------------------------------------------------

class TestGameStateSerialization:

    @pytest.mark.asyncio
    async def test_player_assigned_game_state_is_string(self, service):
        """game_state in player_assigned must be a plain str, not an enum."""
        gid = await service.create_game()
        ws = MockWebSocket()
        await service.handle_player_connection(gid, ws)

        msg = ws.find("player_assigned")
        assert msg["game_state"] == "waiting"
        assert type(msg["game_state"]) is str  # not GameState enum

    @pytest.mark.asyncio
    async def test_game_info_state_is_string(self, service):
        """state in get_game_info must be a plain str, not an enum."""
        gid = await service.create_game()
        info = await service.get_game_info(gid)
        assert info["state"] == "waiting"
        assert type(info["state"]) is str

    @pytest.mark.asyncio
    async def test_placing_state_is_string(self, service):
        """After second player connects, game_state should be the string 'placing'."""
        gid = await service.create_game()
        ws1, ws2 = MockWebSocket(), MockWebSocket()
        await service.handle_player_connection(gid, ws1)
        await service.handle_player_connection(gid, ws2)

        msg = ws2.find("player_assigned")
        assert msg["game_state"] == "placing"
        assert type(msg["game_state"]) is str


# ---------------------------------------------------------------------------
# Game mode support
# ---------------------------------------------------------------------------

async def _setup_elite_playing(service: GameService):
    """Create elite-mode game, connect 2 players, place 3 planes each."""
    game_id = await service.create_game(mode=GameMode.ELITE)
    ws1, ws2 = await _connect_two(service, game_id)

    for pid in ("player1", "player2"):
        await service.handle_plane_placement(game_id, pid, PLANE_1)
        await service.handle_plane_placement(game_id, pid, PLANE_2)
        await service.handle_plane_placement(game_id, pid, PLANE_3)

    game = await service.get_game(game_id)
    assert game.state == "playing"
    ws1.clear()
    ws2.clear()
    return game_id, ws1, ws2


class TestGameModeService:

    @pytest.mark.asyncio
    async def test_create_game_with_mode(self, service):
        """Game should store the requested mode and expose it in game_info."""
        gid = await service.create_game(mode=GameMode.ELITE)
        game = await service.get_game(gid)
        assert game.mode == GameMode.ELITE
        info = await service.get_game_info(gid)
        assert info["mode"] == "elite"

    @pytest.mark.asyncio
    async def test_player_assigned_includes_mode_and_max_planes(self, service):
        gid = await service.create_game(mode=GameMode.ELITE)
        ws = MockWebSocket()
        await service.handle_player_connection(gid, ws)
        msg = ws.find("player_assigned")
        assert msg["mode"] == "elite"
        assert msg["max_planes"] == 3

    @pytest.mark.asyncio
    async def test_game_ready_message_reflects_mode(self, service):
        gid = await service.create_game(mode=GameMode.ELITE)
        ws1, ws2 = await _connect_two(service, gid)
        msg = ws1.find("game_ready")
        assert "3 planes each" in msg["message"]

    @pytest.mark.asyncio
    async def test_elite_game_needs_3_planes_to_start(self, service):
        gid = await service.create_game(mode=GameMode.ELITE)
        ws1, ws2 = await _connect_two(service, gid)

        # Place 2 planes each — game should NOT start
        for pid in ("player1", "player2"):
            await service.handle_plane_placement(gid, pid, PLANE_1)
            await service.handle_plane_placement(gid, pid, PLANE_2)

        game = await service.get_game(gid)
        assert game.state == GameState.PLACING  # still placing

        # Place 3rd plane each — game should start
        for pid in ("player1", "player2"):
            await service.handle_plane_placement(gid, pid, PLANE_3)

        game = await service.get_game(gid)
        assert game.state == GameState.PLAYING


# ---------------------------------------------------------------------------
# Rematch flow
# ---------------------------------------------------------------------------

class TestRematch:

    @pytest.mark.asyncio
    async def test_rematch_request_notifies_opponent(self, service):
        gid, ws1, ws2 = await _play_to_finish(service)
        await service.handle_rematch_request(gid, "player1")
        assert ws2.find("rematch_requested") is not None
        assert ws1.find("rematch_requested") is None

    @pytest.mark.asyncio
    async def test_both_request_creates_new_game(self, service):
        gid, ws1, ws2 = await _play_to_finish(service)
        await service.handle_rematch_request(gid, "player1")
        ws1.clear(); ws2.clear()
        await service.handle_rematch_request(gid, "player2")

        msg1 = ws1.find("rematch_started")
        msg2 = ws2.find("rematch_started")
        assert msg1 is not None and msg2 is not None
        assert msg1["game_id"] == msg2["game_id"]
        # New game should exist
        new_game = await service.get_game(msg1["game_id"])
        assert new_game is not None
        assert new_game.state == GameState.WAITING

    @pytest.mark.asyncio
    async def test_rematch_preserves_game_mode(self, service):
        gid = await service.create_game(mode=GameMode.ELITE)
        ws1, ws2 = await _connect_two(service, gid)
        for pid in ("player1", "player2"):
            await service.handle_plane_placement(gid, pid, PLANE_1)
            await service.handle_plane_placement(gid, pid, PLANE_2)
            await service.handle_plane_placement(gid, pid, PLANE_3)
        game = await service.get_game(gid)
        assert game.state == GameState.PLAYING
        # Destroy all 3 heads for player2
        await service.handle_attack(gid, "player1", 2, 0)
        await service.handle_attack(gid, "player2", 5, 5)
        await service.handle_attack(gid, "player1", 7, 0)
        await service.handle_attack(gid, "player2", 5, 6)
        await service.handle_attack(gid, "player1", 5, 9)
        ws1.clear(); ws2.clear()

        await service.handle_rematch_request(gid, "player1")
        await service.handle_rematch_request(gid, "player2")
        new_id = ws1.find("rematch_started")["game_id"]
        new_game = await service.get_game(new_id)
        assert new_game.mode == GameMode.ELITE

    @pytest.mark.asyncio
    async def test_duplicate_request_does_not_re_notify(self, service):
        gid, ws1, ws2 = await _play_to_finish(service)
        await service.handle_rematch_request(gid, "player1")
        ws2.clear()
        await service.handle_rematch_request(gid, "player1")
        # Second request should not send another notification
        assert ws2.find("rematch_requested") is None

    @pytest.mark.asyncio
    async def test_rematch_after_creation_resends_game_id(self, service):
        gid, ws1, ws2 = await _play_to_finish(service)
        await service.handle_rematch_request(gid, "player1")
        await service.handle_rematch_request(gid, "player2")
        ws1.clear()
        # Third request after game already created
        await service.handle_rematch_request(gid, "player1")
        msg = ws1.find("rematch_started")
        assert msg is not None

    @pytest.mark.asyncio
    async def test_rematch_on_non_finished_game_ignored(self, service):
        gid, ws1, ws2 = await _setup_playing(service)
        await service.handle_rematch_request(gid, "player1")
        assert ws1.find("rematch_requested") is None
        assert ws2.find("rematch_requested") is None

    @pytest.mark.asyncio
    async def test_rematch_declined_when_opponent_disconnected(self, service):
        gid, ws1, ws2 = await _play_to_finish(service)
        await service.handle_player_disconnection(gid, "player2", ws2)
        await service.handle_rematch_request(gid, "player1")
        msg = ws1.find("rematch_declined")
        assert msg is not None
        assert msg["reason"] == "opponent_disconnected"

    @pytest.mark.asyncio
    async def test_requester_disconnect_cancels_rematch(self, service):
        """Requester disconnects → opponent gets rematch_cancelled."""
        gid, ws1, ws2 = await _play_to_finish(service)
        await service.handle_rematch_request(gid, "player1")
        ws2.clear()
        await service.handle_player_disconnection(gid, "player1", ws1)
        assert ws2.find("rematch_cancelled") is not None
        game = await service.get_game(gid)
        assert game.rematch_requested_by is None

    @pytest.mark.asyncio
    async def test_non_requester_disconnect_cancels_rematch(self, service):
        """Non-requester disconnects → requester gets rematch_cancelled."""
        gid, ws1, ws2 = await _play_to_finish(service)
        await service.handle_rematch_request(gid, "player1")
        ws1.clear()
        await service.handle_player_disconnection(gid, "player2", ws2)
        assert ws1.find("rematch_cancelled") is not None
        game = await service.get_game(gid)
        assert game.rematch_requested_by is None

    @pytest.mark.asyncio
    async def test_disconnect_without_pending_rematch_no_cancel(self, service):
        """Disconnect from finished game with no rematch → no cancel message."""
        gid, ws1, ws2 = await _play_to_finish(service)
        await service.handle_player_disconnection(gid, "player2", ws2)
        assert ws1.find("rematch_cancelled") is None


# ---------------------------------------------------------------------------
# disconnected_at tracking
# ---------------------------------------------------------------------------

class TestDisconnectedAt:

    @pytest.mark.asyncio
    async def test_disconnected_at_initially_none(self, service):
        gid = await service.create_game()
        game = await service.get_game(gid)
        assert game.disconnected_at["player1"] is None
        assert game.disconnected_at["player2"] is None

    @pytest.mark.asyncio
    async def test_disconnected_at_set_on_disconnect(self, service):
        gid, ws1, ws2 = await _setup_playing(service)
        await service.handle_player_disconnection(gid, "player2", ws2)
        game = await service.get_game(gid)
        assert game.disconnected_at["player2"] is not None
        assert game.disconnected_at["player1"] is None

    @pytest.mark.asyncio
    async def test_disconnected_at_cleared_on_reconnect(self, service):
        gid, ws1, ws2 = await _setup_playing(service)
        game = await service.get_game(gid)
        token2 = game.session_tokens["player2"]

        await service.handle_player_disconnection(gid, "player2", ws2)
        assert game.disconnected_at["player2"] is not None

        ws2_new = MockWebSocket()
        await service.handle_player_connection(gid, ws2_new, token=token2)
        assert game.disconnected_at["player2"] is None

    @pytest.mark.asyncio
    async def test_disconnected_at_set_for_finished_game(self, service):
        gid, ws1, ws2 = await _play_to_finish(service)
        await service.handle_player_disconnection(gid, "player1", ws1)
        game = await service.get_game(gid)
        assert game.disconnected_at["player1"] is not None


# ---------------------------------------------------------------------------
# State guard on plane placement
# ---------------------------------------------------------------------------

class TestPlacementStateGuard:

    @pytest.mark.asyncio
    async def test_placement_rejected_during_playing(self, service):
        gid, ws1, ws2 = await _setup_playing(service)
        ws1.clear()
        await service.handle_plane_placement(gid, "player1", PLANE_1)
        err = ws1.find("error")
        assert err is not None
        assert "not in placement phase" in err["message"]

    @pytest.mark.asyncio
    async def test_placement_rejected_during_finished(self, service):
        gid, ws1, ws2 = await _play_to_finish(service)
        ws1.clear()
        await service.handle_plane_placement(gid, "player1", PLANE_1)
        err = ws1.find("error")
        assert err is not None
        assert "not in placement phase" in err["message"]

    @pytest.mark.asyncio
    async def test_placement_rejected_during_waiting(self, service):
        gid = await service.create_game()
        ws1 = MockWebSocket()
        await service.handle_player_connection(gid, ws1)
        ws1.clear()
        await service.handle_plane_placement(gid, "player1", PLANE_1)
        err = ws1.find("error")
        assert err is not None
        assert "not in placement phase" in err["message"]


# ---------------------------------------------------------------------------
# Stale game cleanup for PLACING/PLAYING
# ---------------------------------------------------------------------------

class TestStaleGameCleanup:

    @pytest.mark.asyncio
    async def test_playing_game_with_stale_disconnect_cleaned_up(self, service):
        gid, ws1, ws2 = await _setup_playing(service)
        await service.handle_player_disconnection(gid, "player2", ws2)

        # Backdate the disconnection timestamp
        game = await service.get_game(gid)
        game.disconnected_at["player2"] = time.time() - 31 * 60  # 31 min ago

        await service._cleanup_stale_games()
        assert await service.get_game(gid) is None

    @pytest.mark.asyncio
    async def test_placing_game_with_stale_disconnect_cleaned_up(self, service):
        gid = await service.create_game()
        ws1, ws2 = await _connect_two(service, gid)
        game = await service.get_game(gid)
        assert game.state == GameState.PLACING

        await service.handle_player_disconnection(gid, "player2", ws2)
        game.disconnected_at["player2"] = time.time() - 31 * 60

        await service._cleanup_stale_games()
        assert await service.get_game(gid) is None

    @pytest.mark.asyncio
    async def test_playing_game_with_recent_disconnect_not_cleaned(self, service):
        gid, ws1, ws2 = await _setup_playing(service)
        await service.handle_player_disconnection(gid, "player2", ws2)

        # Recent disconnect — should survive cleanup
        await service._cleanup_stale_games()
        assert await service.get_game(gid) is not None

    @pytest.mark.asyncio
    async def test_playing_game_with_no_disconnect_not_cleaned(self, service):
        gid, ws1, ws2 = await _setup_playing(service)
        await service._cleanup_stale_games()
        assert await service.get_game(gid) is not None


# ---------------------------------------------------------------------------
# FINISHED disconnect notification
# ---------------------------------------------------------------------------

class TestFinishedDisconnectNotification:

    @pytest.mark.asyncio
    async def test_finished_disconnect_notifies_opponent(self, service):
        gid, ws1, ws2 = await _play_to_finish(service)
        ws1.clear()
        await service.handle_player_disconnection(gid, "player2", ws2)
        msg = ws1.find("player_disconnected")
        assert msg is not None
        assert msg["player_id"] == "player2"

    @pytest.mark.asyncio
    async def test_finished_disconnect_with_rematch_sends_both_messages(self, service):
        """Opponent should get both player_disconnected and rematch_cancelled."""
        gid, ws1, ws2 = await _play_to_finish(service)
        await service.handle_rematch_request(gid, "player1")
        ws2.clear()
        await service.handle_player_disconnection(gid, "player1", ws1)
        assert ws2.find("player_disconnected") is not None
        assert ws2.find("rematch_cancelled") is not None

