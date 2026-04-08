"""
Tests for the GameService application layer.

Uses mock WebSocket objects to test the service in isolation,
without going through HTTP/ASGI.
"""
import asyncio
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
# Player connection
# ---------------------------------------------------------------------------

class TestPlayerConnection:

    @pytest.mark.asyncio
    async def test_first_player(self, service):
        gid = await service.create_game()
        ws = MockWebSocket()
        pid = await service.handle_player_connection(gid, ws)

        assert pid == "player1"
        msg = ws.find("player_assigned")
        assert msg["player_id"] == "player1"
        assert msg["game_state"] == "waiting"

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
        assert p2_msg["game_state"] == "placing"

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
        game = await service.get_game(gid)
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
        game = await service.get_game(gid)
        assert game.state == "playing"
        assert game.current_turn == "player1"

    @pytest.mark.asyncio
    async def test_placement_rejected_when_opponent_disconnected(self, service):
        """Placing a plane while opponent is disconnected must be rejected."""
        gid = await service.create_game()
        ws1, ws2 = await _connect_two(service, gid)
        await service.handle_player_disconnection(gid, "player2")
        ws1.clear()

        await service.handle_plane_placement(gid, "player1", PLANE_1)
        err = ws1.find("error")
        assert err is not None
        assert "disconnected" in err["message"].lower()


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
        game = await service.get_game(gid)
        assert game.current_turn == "player2"

    @pytest.mark.asyncio
    async def test_attack_rejected_when_opponent_disconnected(self, service):
        """Attacking while opponent is disconnected must be rejected."""
        gid, ws1, ws2 = await _setup_playing(service)
        await service.handle_player_disconnection(gid, "player2")
        ws1.clear()

        await service.handle_attack(gid, "player1", 5, 5)
        err = ws1.find("error")
        assert err is not None
        assert "disconnected" in err["message"].lower()

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
        game = await service.get_game(gid)
        assert game.state == GameState.FINISHED

    @pytest.mark.asyncio
    async def test_game_over_includes_opponent_board(self, service):
        """game_over message must include the opponent's full (unmasked) board."""
        gid, ws1, ws2 = await _setup_playing(service)

        await service.handle_attack(gid, "player1", 2, 0)  # head_hit
        ws1.clear(); ws2.clear()
        await service.handle_attack(gid, "player2", 5, 5)  # miss
        ws1.clear(); ws2.clear()
        await service.handle_attack(gid, "player1", 7, 0)  # head_hit → game over

        # Winner (P1) receives loser's board
        go1 = ws1.find("game_over")
        assert go1 is not None
        assert "opponent_board" in go1
        board1 = go1["opponent_board"]
        assert len(board1) == 10 and len(board1[0]) == 10
        # Board must contain plane cells (unmasked)
        flat1 = [cell for row in board1 for cell in row]
        assert "plane" in flat1 or "head" in flat1 or "head_hit" in flat1

        # Loser (P2) receives winner's board
        go2 = ws2.find("game_over")
        assert go2 is not None
        assert "opponent_board" in go2
        board2 = go2["opponent_board"]
        flat2 = [cell for row in board2 for cell in row]
        assert "plane" in flat2 or "head" in flat2

    @pytest.mark.asyncio
    async def test_game_over_boards_are_unmasked(self, service):
        """Verify specific plane positions are visible in the revealed board."""
        gid, ws1, ws2 = await _setup_playing(service)

        # P1 destroys P2's two cockpits
        await service.handle_attack(gid, "player1", 2, 0)  # head_hit on PLANE_1
        ws1.clear(); ws2.clear()
        await service.handle_attack(gid, "player2", 5, 5)  # miss
        ws1.clear(); ws2.clear()
        await service.handle_attack(gid, "player1", 7, 0)  # head_hit on PLANE_2 → game over

        go1 = ws1.find("game_over")
        board = go1["opponent_board"]
        # PLANE_1 head at (2,0) was hit → head_hit; PLANE_2 head at (7,0) was hit → head_hit
        assert board[0][2] == "head_hit"
        assert board[0][7] == "head_hit"
        # Body cells of the planes should still be "plane" (not masked to "empty")
        # PLANE_1 wing cells at row 1 (y=1): x=0,1,2,3,4
        assert board[1][0] == "plane"


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
    async def test_disconnect_notifies_opponent(self, service):
        gid = await service.create_game()
        _, ws2 = await _connect_two(service, gid)
        ws2.clear()
        await service.handle_player_disconnection(gid, "player1")
        assert ws2.find("player_disconnected") is not None

    @pytest.mark.asyncio
    async def test_reconnect_sends_game_resumed(self, service):
        gid, ws1, ws2 = await _setup_playing(service)
        game = await service.get_game(gid)
        token2 = game.session_tokens["player2"]

        await service.handle_player_disconnection(gid, "player2")

        ws2_new = MockWebSocket()
        pid = await service.handle_player_connection(gid, ws2_new, token=token2)
        assert pid == "player2"

        assigned = ws2_new.find("player_assigned")
        assert assigned["game_state"] == "playing"

        resumed = ws2_new.find("game_resumed")
        assert resumed is not None
        assert len(resumed["own_board"]) == 10
        assert len(resumed["opponent_board"]) == 10
        assert resumed["current_turn"] == "player1"

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
    async def test_reconnect_preserves_board(self, service):
        """Board damage should survive a disconnect/reconnect cycle."""
        gid, ws1, ws2 = await _setup_playing(service)
        game = await service.get_game(gid)
        token2 = game.session_tokens["player2"]

        # P1 hits P2's cockpit
        await service.handle_attack(gid, "player1", 2, 0)

        await service.handle_player_disconnection(gid, "player2")
        ws2_new = MockWebSocket()
        await service.handle_player_connection(gid, ws2_new, token=token2)

        resumed = ws2_new.find("game_resumed")
        assert resumed["own_board"][0][2] == "head_hit"

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
    async def test_reconnect_to_finished_game_reveals_opponent_board(self, service):
        """Reconnecting to a finished game must show unmasked opponent board."""
        gid, ws1, ws2 = await _setup_playing(service)

        # Play to completion
        await service.handle_attack(gid, "player1", 2, 0)  # head_hit
        await service.handle_attack(gid, "player2", 5, 5)  # miss
        await service.handle_attack(gid, "player1", 7, 0)  # head_hit → game over

        game = await service.get_game(gid)
        token1 = game.session_tokens["player1"]

        await service.handle_player_disconnection(gid, "player1")

        ws1_new = MockWebSocket()
        await service.handle_player_connection(gid, ws1_new, token=token1)

        resumed = ws1_new.find("game_resumed")
        assert resumed is not None
        assert resumed["game_state"] == "finished"
        assert resumed["winner"] == "player1"
        # Opponent board must be unmasked — should contain plane cells
        flat = [cell for row in resumed["opponent_board"] for cell in row]
        assert "plane" in flat or "head" in flat or "head_hit" in flat

    @pytest.mark.asyncio
    async def test_reconnect_to_playing_game_still_masks_board(self, service):
        """Reconnecting to an in-progress game must NOT reveal opponent planes."""
        gid, ws1, ws2 = await _setup_playing(service)
        game = await service.get_game(gid)
        token2 = game.session_tokens["player2"]

        await service.handle_player_disconnection(gid, "player2")

        ws2_new = MockWebSocket()
        await service.handle_player_connection(gid, ws2_new, token=token2)

        resumed = ws2_new.find("game_resumed")
        assert resumed is not None
        # Opponent board must be masked — no "plane" or "head" cells visible
        flat = [cell for row in resumed["opponent_board"] for cell in row]
        assert "plane" not in flat
        assert "head" not in flat

    @pytest.mark.asyncio
    async def test_reconnect_during_placing_sends_game_resumed(self, service):
        """Reconnecting during PLACING should send game_resumed with board and planes count."""
        gid = await service.create_game()
        ws1, ws2 = await _connect_two(service, gid)
        game = await service.get_game(gid)
        token1 = game.session_tokens["player1"]

        # P1 places one plane, then disconnects
        await service.handle_plane_placement(gid, "player1", PLANE_1)

        await service.handle_player_disconnection(gid, "player1")

        ws1_new = MockWebSocket()
        await service.handle_player_connection(gid, ws1_new, token=token1)

        assigned = ws1_new.find("player_assigned")
        assert assigned["game_state"] == "placing"

        resumed = ws1_new.find("game_resumed")
        assert resumed is not None
        assert resumed["game_state"] == "placing"
        assert resumed["planes_placed"] == 1
        assert len(resumed["own_board"]) == 10

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

    @pytest.mark.asyncio
    async def test_reconnect_during_placing_preserves_placed_planes(self, service):
        """Reconnecting after placing 2 planes should show them in own_board."""
        gid = await service.create_game()
        ws1, ws2 = await _connect_two(service, gid)
        game = await service.get_game(gid)
        token1 = game.session_tokens["player1"]

        # P1 places both planes
        await service.handle_plane_placement(gid, "player1", PLANE_1)
        await service.handle_plane_placement(gid, "player1", PLANE_2)

        await service.handle_player_disconnection(gid, "player1")

        ws1_new = MockWebSocket()
        await service.handle_player_connection(gid, ws1_new, token=token1)

        resumed = ws1_new.find("game_resumed")
        assert resumed is not None
        assert resumed["planes_placed"] == 2
        # Own board should contain plane cells at known positions
        # PLANE_1 head at (2,0), PLANE_2 head at (7,0)
        assert resumed["own_board"][0][2] == "head"
        assert resumed["own_board"][0][7] == "head"
        flat = [cell for row in resumed["own_board"] for cell in row]
        assert flat.count("plane") + flat.count("head") == 20  # 2 planes x 10 cells


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
# game_state serialised as plain string (#25)
# ---------------------------------------------------------------------------

# ---------------------------------------------------------------------------
# Continue game
# ---------------------------------------------------------------------------

class TestContinueGame:

    @pytest.mark.asyncio
    async def test_copies_boards_and_planes(self, service):
        """Continuation game should have identical boards and planes."""
        gid, ws1, ws2 = await _setup_playing(service)
        game = await service.get_game(gid)
        token1 = game.session_tokens["player1"]

        # Deal some damage first
        await service.handle_attack(gid, "player1", 5, 5)  # miss
        original_boards = {pid: [row[:] for row in game.boards[pid]] for pid in ("player1", "player2")}

        result = await service.continue_game(gid, token1)
        assert result is not None

        new_game = await service.get_game(result["game_id"])
        assert new_game.boards == original_boards
        assert len(new_game.planes["player1"]) == 2
        assert len(new_game.planes["player2"]) == 2

    @pytest.mark.asyncio
    async def test_preserves_current_turn(self, service):
        """Continuation should keep the same current_turn."""
        gid, ws1, ws2 = await _setup_playing(service)
        game = await service.get_game(gid)
        token1 = game.session_tokens["player1"]

        # Switch turn: P1 attacks, now it's P2's turn
        await service.handle_attack(gid, "player1", 5, 5)
        assert game.current_turn == "player2"

        result = await service.continue_game(gid, token1)
        new_game = await service.get_game(result["game_id"])
        assert new_game.current_turn == "player2"

    @pytest.mark.asyncio
    async def test_preserves_game_state(self, service):
        """Continuation should copy the game state (playing, placing, etc.)."""
        gid, ws1, ws2 = await _setup_playing(service)
        game = await service.get_game(gid)
        token1 = game.session_tokens["player1"]

        result = await service.continue_game(gid, token1)
        new_game = await service.get_game(result["game_id"])
        assert new_game.state == GameState.PLAYING

    @pytest.mark.asyncio
    async def test_requesting_player_keeps_same_slot(self, service):
        """The requesting player should be assigned to their original slot."""
        gid, ws1, ws2 = await _setup_playing(service)
        game = await service.get_game(gid)
        token2 = game.session_tokens["player2"]

        result = await service.continue_game(gid, token2)
        assert result["player_id"] == "player2"

    @pytest.mark.asyncio
    async def test_requesting_player_gets_new_token(self, service):
        """The response should include a new session token for the new game."""
        gid, ws1, ws2 = await _setup_playing(service)
        game = await service.get_game(gid)
        token1 = game.session_tokens["player1"]

        result = await service.continue_game(gid, token1)
        assert result["session_token"] is not None
        assert result["session_token"] != token1  # different game, different token

    @pytest.mark.asyncio
    async def test_opponent_slot_is_open(self, service):
        """The opponent slot in the new game should have no token (open for anyone)."""
        gid, ws1, ws2 = await _setup_playing(service)
        game = await service.get_game(gid)
        token1 = game.session_tokens["player1"]

        result = await service.continue_game(gid, token1)
        new_game = await service.get_game(result["game_id"])

        # player1 slot has a token, player2 slot is open
        assert new_game.session_tokens["player1"] is not None
        assert new_game.session_tokens["player2"] is None

    @pytest.mark.asyncio
    async def test_placing_clears_opponent_planes(self, service):
        """Continue from PLACING should clear the opponent's planes/board/ready."""
        gid = await service.create_game()
        ws1, ws2 = await _connect_two(service, gid)

        # Both players place planes
        for pid in ("player1", "player2"):
            await service.handle_plane_placement(gid, pid, PLANE_1)
            await service.handle_plane_placement(gid, pid, PLANE_2)

        # Force game back to PLACING to simulate the edge case
        game = await service.get_game(gid)
        game.state = GameState.PLACING

        token1 = game.session_tokens["player1"]
        result = await service.continue_game(gid, token1)
        new_game = await service.get_game(result["game_id"])

        # Player1's state preserved
        assert len(new_game.planes["player1"]) == 2
        assert new_game.ready["player1"] is True

        # Opponent's state cleared — new player starts fresh
        assert len(new_game.planes["player2"]) == 0
        assert new_game.ready["player2"] is False
        assert all(cell == "empty" for row in new_game.boards["player2"] for cell in row)

    @pytest.mark.asyncio
    async def test_playing_preserves_opponent_planes(self, service):
        """Continue from PLAYING should keep both players' planes intact."""
        gid, ws1, ws2 = await _setup_playing(service)
        game = await service.get_game(gid)
        token1 = game.session_tokens["player1"]

        result = await service.continue_game(gid, token1)
        new_game = await service.get_game(result["game_id"])

        assert len(new_game.planes["player1"]) == 2
        assert len(new_game.planes["player2"]) == 2

    @pytest.mark.asyncio
    async def test_rejects_invalid_token(self, service):
        gid, ws1, ws2 = await _setup_playing(service)
        result = await service.continue_game(gid, "bad-token")
        assert result is None

    @pytest.mark.asyncio
    async def test_rejects_waiting_game(self, service):
        gid = await service.create_game()
        ws = MockWebSocket()
        await service.handle_player_connection(gid, ws)
        game = await service.get_game(gid)
        token = game.session_tokens["player1"]

        result = await service.continue_game(gid, token)
        assert result is None

    @pytest.mark.asyncio
    async def test_rejects_nonexistent_game(self, service):
        result = await service.continue_game("no-such-game", "any-token")
        assert result is None

    @pytest.mark.asyncio
    async def test_new_game_is_independent(self, service):
        """Mutations in the new game must not affect the original."""
        gid, ws1, ws2 = await _setup_playing(service)
        game = await service.get_game(gid)
        token1 = game.session_tokens["player1"]

        result = await service.continue_game(gid, token1)
        new_game = await service.get_game(result["game_id"])

        # Mutate new game's board
        new_game.boards["player1"][0][0] = "hit"
        # Original should be unchanged
        assert game.boards["player1"][0][0] != "hit"


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

    @pytest.mark.asyncio
    async def test_continue_preserves_mode(self, service):
        gid, ws1, ws2 = await _setup_elite_playing(service)
        game = await service.get_game(gid)
        token1 = game.session_tokens["player1"]

        result = await service.continue_game(gid, token1)
        new_game = await service.get_game(result["game_id"])
        assert new_game.mode == GameMode.ELITE
