"""
Tests for the GameService application layer.

Uses mock WebSocket objects to test the service in isolation,
without going through HTTP/ASGI.
"""
import pytest
from application.game_service import GameService
from domain.value_objects import GameState


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


@pytest.fixture
def service():
    return GameService()


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

    assert service.get_game(game_id).state == GameState.PLAYING
    ws1.clear()
    ws2.clear()
    return game_id, ws1, ws2


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
        assert service.get_game(gid) is not None
        assert service.get_game(gid).id == gid

    def test_get_nonexistent(self, service):
        assert service.get_game("nope") is None

    @pytest.mark.asyncio
    async def test_game_info(self, service):
        gid = await service.create_game()
        info = service.get_game_info(gid)
        assert info["id"] == gid
        assert info["state"] == GameState.WAITING
        assert info["players"]["player1"] is False


# ---------------------------------------------------------------------------
# Player connection
# ---------------------------------------------------------------------------

class TestPlayerConnection:

    @pytest.mark.asyncio
    async def test_first_player(self, service):
        gid = await service.create_game()
        ws = MockWebSocket()
        pid = await service.handle_player_connection(gid, ws)

        assert pid == "player1"
        assert ws.accepted
        msg = ws.find("player_assigned")
        assert msg["player_id"] == "player1"
        assert msg["game_state"] == GameState.WAITING

    @pytest.mark.asyncio
    async def test_first_player_gets_session_token(self, service):
        """player_assigned message should include a session token."""
        gid = await service.create_game()
        ws = MockWebSocket()
        await service.handle_player_connection(gid, ws)

        msg = ws.find("player_assigned")
        assert "session_token" in msg
        assert isinstance(msg["session_token"], str)
        assert len(msg["session_token"]) > 0

    @pytest.mark.asyncio
    async def test_second_player_starts_placing(self, service):
        gid = await service.create_game()
        ws1, ws2 = await _connect_two(service, gid)

        p2_msg = ws2.find("player_assigned")
        assert p2_msg["game_state"] == GameState.PLACING

        assert ws1.find("game_ready") is not None
        assert ws2.find("game_ready") is not None

    @pytest.mark.asyncio
    async def test_third_player_rejected(self, service):
        gid = await service.create_game()
        await _connect_two(service, gid)

        ws3 = MockWebSocket()
        assert await service.handle_player_connection(gid, ws3) is None

    @pytest.mark.asyncio
    async def test_nonexistent_game_rejected(self, service):
        ws = MockWebSocket()
        assert await service.handle_player_connection("nope", ws) is None


# ---------------------------------------------------------------------------
# Session token authentication (#13)
# ---------------------------------------------------------------------------

class TestSessionTokenAuth:

    @pytest.mark.asyncio
    async def test_reconnect_with_valid_token(self, service):
        """A disconnected player can reclaim their slot with the correct token."""
        gid, ws1, ws2 = await _setup_playing(service)
        game = service.get_game(gid)
        token2 = game.session_tokens["player2"]

        await service.handle_player_disconnection(gid, "player2")

        ws2_new = MockWebSocket()
        pid = await service.handle_player_connection(gid, ws2_new, token=token2)
        assert pid == "player2"

    @pytest.mark.asyncio
    async def test_reconnect_with_invalid_token_rejected(self, service):
        """An invalid token must not reclaim a slot."""
        gid, _, _ = await _setup_playing(service)

        await service.handle_player_disconnection(gid, "player2")

        ws2_new = MockWebSocket()
        pid = await service.handle_player_connection(gid, ws2_new, token="wrong-token")
        assert pid is None

    @pytest.mark.asyncio
    async def test_reconnect_without_token_rejected(self, service):
        """After a player has connected once, reconnecting without token should fail."""
        gid, _, _ = await _setup_playing(service)

        await service.handle_player_disconnection(gid, "player2")

        ws2_new = MockWebSocket()
        pid = await service.handle_player_connection(gid, ws2_new)
        assert pid is None

    @pytest.mark.asyncio
    async def test_cannot_steal_occupied_slot(self, service):
        """A third connection with no token gets rejected when both slots are claimed."""
        gid = await service.create_game()
        await _connect_two(service, gid)

        ws3 = MockWebSocket()
        assert await service.handle_player_connection(gid, ws3) is None

    @pytest.mark.asyncio
    async def test_tokens_persist_across_disconnect(self, service):
        """Session token survives disconnect and can be reused."""
        gid = await service.create_game()
        ws1, ws2 = await _connect_two(service, gid)
        game = service.get_game(gid)
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
        game = service.get_game(gid)
        assert game.session_tokens["player1"] != game.session_tokens["player2"]


# ---------------------------------------------------------------------------
# Plane placement
# ---------------------------------------------------------------------------

class TestPlacement:

    @pytest.mark.asyncio
    async def test_place_valid_plane(self, service):
        gid = await service.create_game()
        ws1, _ = await _connect_two(service, gid)
        ws1.clear()

        await service.handle_plane_placement(gid, "player1", PLANE_1)
        r = ws1.last()
        assert r["type"] == "plane_placed"
        assert r["success"] is True and r["planes_count"] == 1

    @pytest.mark.asyncio
    async def test_overlapping_plane_rejected(self, service):
        gid = await service.create_game()
        ws1, _ = await _connect_two(service, gid)
        ws1.clear()

        await service.handle_plane_placement(gid, "player1", PLANE_1)
        await service.handle_plane_placement(gid, "player1", PLANE_1)
        assert ws1.last()["success"] is False

    @pytest.mark.asyncio
    async def test_game_starts_when_both_ready(self, service):
        gid, ws1, ws2 = await _setup_playing(service)
        game = service.get_game(gid)
        assert game.state == GameState.PLAYING
        assert game.current_turn == "player1"


# ---------------------------------------------------------------------------
# Attack
# ---------------------------------------------------------------------------

class TestAttack:

    @pytest.mark.asyncio
    async def test_miss(self, service):
        gid, ws1, ws2 = await _setup_playing(service)
        await service.handle_attack(gid, "player1", 5, 5)
        assert ws1.last()["type"] == "turn_changed"
        atk = ws1.find("attack_result")
        assert atk["result"] == "miss" and atk["is_attacker"] is True

    @pytest.mark.asyncio
    async def test_body_hit(self, service):
        gid, ws1, _ = await _setup_playing(service)
        await service.handle_attack(gid, "player1", 0, 1)  # wing cell
        atk = ws1.find("attack_result")
        assert atk["result"] == "hit"

    @pytest.mark.asyncio
    async def test_head_hit(self, service):
        gid, ws1, _ = await _setup_playing(service)
        await service.handle_attack(gid, "player1", 2, 0)  # cockpit
        atk = ws1.find("attack_result")
        assert atk["result"] == "head_hit"

    @pytest.mark.asyncio
    async def test_not_your_turn(self, service):
        gid, _, ws2 = await _setup_playing(service)
        await service.handle_attack(gid, "player2", 5, 5)
        err = ws2.find("error")
        assert err is not None and "Not your turn" in err["message"]

    @pytest.mark.asyncio
    async def test_turn_switches(self, service):
        gid, _, _ = await _setup_playing(service)
        await service.handle_attack(gid, "player1", 5, 5)
        assert service.get_game(gid).current_turn == "player2"

    @pytest.mark.asyncio
    async def test_game_over(self, service):
        gid, ws1, ws2 = await _setup_playing(service)

        # P1 destroys both cockpits (with P2 taking a turn in between)
        await service.handle_attack(gid, "player1", 2, 0)  # head_hit
        ws1.clear(); ws2.clear()
        await service.handle_attack(gid, "player2", 5, 5)  # P2 misses (turn back to P1)
        ws1.clear(); ws2.clear()
        await service.handle_attack(gid, "player1", 7, 0)  # head_hit → game over

        go = ws1.find("game_over")
        assert go is not None and go["winner"] == "player1"
        assert service.get_game(gid).state == GameState.FINISHED


# ---------------------------------------------------------------------------
# Disconnect & reconnect
# ---------------------------------------------------------------------------

class TestDisconnect:

    @pytest.mark.asyncio
    async def test_disconnect_clears_slot(self, service):
        gid = await service.create_game()
        ws1, _ = await _connect_two(service, gid)
        await service.handle_player_disconnection(gid, "player1")
        assert service.get_game(gid).players["player1"] is None

    @pytest.mark.asyncio
    async def test_disconnect_notifies_opponent(self, service):
        gid = await service.create_game()
        _, ws2 = await _connect_two(service, gid)
        ws2.clear()
        await service.handle_player_disconnection(gid, "player1")
        assert ws2.find("player_disconnected") is not None

    @pytest.mark.asyncio
    async def test_reconnect_sends_game_resumed(self, service):
        gid, ws1, ws2 = await _setup_playing(service)
        game = service.get_game(gid)
        token2 = game.session_tokens["player2"]

        await service.handle_player_disconnection(gid, "player2")

        ws2_new = MockWebSocket()
        pid = await service.handle_player_connection(gid, ws2_new, token=token2)
        assert pid == "player2"

        assigned = ws2_new.find("player_assigned")
        assert assigned["game_state"] == GameState.PLAYING

        resumed = ws2_new.find("game_resumed")
        assert resumed is not None
        assert len(resumed["own_board"]) == 10
        assert len(resumed["opponent_board"]) == 10
        assert resumed["current_turn"] == "player1"

    @pytest.mark.asyncio
    async def test_reconnect_does_not_reset_state(self, service):
        """Reconnecting player2 must not revert the game to PLACING."""
        gid, _, ws2 = await _setup_playing(service)
        game = service.get_game(gid)
        token2 = game.session_tokens["player2"]

        await service.handle_player_disconnection(gid, "player2")

        ws2_new = MockWebSocket()
        await service.handle_player_connection(gid, ws2_new, token=token2)

        assert game.state == GameState.PLAYING

    @pytest.mark.asyncio
    async def test_reconnect_preserves_board(self, service):
        """Board damage should survive a disconnect/reconnect cycle."""
        gid, ws1, ws2 = await _setup_playing(service)
        game = service.get_game(gid)
        token2 = game.session_tokens["player2"]

        # P1 hits P2's cockpit
        await service.handle_attack(gid, "player1", 2, 0)

        await service.handle_player_disconnection(gid, "player2")
        ws2_new = MockWebSocket()
        await service.handle_player_connection(gid, ws2_new, token=token2)

        resumed = ws2_new.find("game_resumed")
        assert resumed["own_board"][0][2] == "head_hit"
