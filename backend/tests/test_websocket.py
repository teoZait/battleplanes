"""
WebSocket integration tests — full game flow through the FastAPI endpoint.

Tests cover: connection lifecycle, plane placement, attack mechanics,
complete game to victory, disconnection/reconnection, and invalid messages.
"""
import contextlib
import json
import pytest
from fastapi.testclient import TestClient
import main as main_module
from main import app, game_service


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------

@pytest.fixture(autouse=True)
def reset_state():
    """Reset all server state between tests."""
    game_service.games.clear()
    game_service._game_store._redis.store.clear()
    game_service.connection_manager.active_connections.clear()
    main_module._rate_limit_store.clear()


@pytest.fixture
def client():
    return TestClient(app)


@pytest.fixture
def two_player_game(client):
    """Create a game, connect two players, and consume setup messages."""
    game_id = _create_game(client)
    with contextlib.ExitStack() as stack:
        ws1 = stack.enter_context(_ws_connect(client, game_id))
        ws1.receive_json()  # player_assigned

        ws2 = stack.enter_context(_ws_connect(client, game_id))
        ws2.receive_json()  # player_assigned
        ws1.receive_json()  # game_ready
        ws2.receive_json()  # game_ready

        yield game_id, ws1, ws2


@pytest.fixture
def playing_game(two_player_game):
    """Advance the game to PLAYING state (both players placed 2 planes)."""
    game_id, ws1, ws2 = two_player_game
    _place_all_planes(ws1, ws2)
    return game_id, ws1, ws2


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _create_game(client) -> str:
    res = client.post("/game/create")
    assert res.status_code == 200
    return res.json()["game_id"]


class _AuthWebSocket:
    """Wraps Starlette's WebSocketTestSession to auto-send the auth handshake.

    Use as a context manager — identical to ``client.websocket_connect()``
    but sends ``{"type": "auth", "token": ...}`` immediately after open.
    """

    def __init__(self, client, game_id, token=None, **kwargs):
        self._cm = client.websocket_connect(f"/ws/{game_id}", **kwargs)
        self._token = token
        self._ws = None

    def __enter__(self):
        self._ws = self._cm.__enter__()
        self._ws.send_json({"type": "auth", "token": self._token})
        return self._ws

    def __exit__(self, *exc):
        return self._cm.__exit__(*exc)


def _ws_connect(client, game_id, token=None, **kwargs):
    """Return an _AuthWebSocket context manager."""
    return _AuthWebSocket(client, game_id, token=token, **kwargs)


# Two non-overlapping UP-orientation planes:
#   Plane 1 head (2, 0)  →  occupies cols 0-4, rows 0-3
#   Plane 2 head (7, 0)  →  occupies cols 5-9, rows 0-3
PLANE_1 = {"type": "place_plane", "head_x": 2, "head_y": 0, "orientation": "up"}
PLANE_2 = {"type": "place_plane", "head_x": 7, "head_y": 0, "orientation": "up"}

# Plane-1 body cell (wing, row 1) — used in hit tests
PLANE_1_BODY = (0, 1)
# Plane-1 head — used in head-hit tests
PLANE_1_HEAD = (2, 0)
# Plane-2 head
PLANE_2_HEAD = (7, 0)
# Guaranteed empty cell (no plane occupies row 5+)
EMPTY_CELL = (5, 5)


def _place_all_planes(ws1, ws2):
    """Both players place 2 planes; consumes all resulting messages including game_started."""
    for ws in (ws1, ws2):
        ws.send_json(PLANE_1)
        r = ws.receive_json()
        assert r["type"] == "plane_placed" and r["success"] is True

        ws.send_json(PLANE_2)
        r = ws.receive_json()
        assert r["type"] == "plane_placed" and r["success"] is True

    # Both receive game_started
    s1 = ws1.receive_json()
    s2 = ws2.receive_json()
    assert s1["type"] == "game_started" and s1["current_turn"] == "player1"
    assert s2["type"] == "game_started" and s2["current_turn"] == "player1"


def _do_attack(ws_attacker, ws_defender, x, y):
    """Send an attack and consume the attack_result on both sockets.
    Returns (attacker_msg, defender_msg)."""
    ws_attacker.send_json({"type": "attack", "x": x, "y": y})
    atk = ws_attacker.receive_json()
    dfn = ws_defender.receive_json()
    return atk, dfn


def _consume_turn_changed(ws1, ws2):
    """Consume the turn_changed broadcast on both sockets."""
    tc1 = ws1.receive_json()
    tc2 = ws2.receive_json()
    assert tc1["type"] == "turn_changed"
    assert tc2["type"] == "turn_changed"
    return tc1, tc2


# ---------------------------------------------------------------------------
# Connection tests
# ---------------------------------------------------------------------------

class TestConnection:

    def test_first_player_assigned(self, client):
        game_id = _create_game(client)
        with _ws_connect(client, game_id) as ws:
            msg = ws.receive_json()
            assert msg["type"] == "player_assigned"
            assert msg["player_id"] == "player1"
            assert msg["game_state"] == "waiting"
            assert "session_token" in msg

    def test_second_player_triggers_placing(self, client):
        game_id = _create_game(client)
        with _ws_connect(client, game_id) as ws1:
            ws1.receive_json()
            with _ws_connect(client, game_id) as ws2:
                p2 = ws2.receive_json()
                assert p2["type"] == "player_assigned"
                assert p2["player_id"] == "player2"
                assert p2["game_state"] == "placing"

    def test_game_ready_broadcast(self, client):
        game_id = _create_game(client)
        with _ws_connect(client, game_id) as ws1:
            ws1.receive_json()
            with _ws_connect(client, game_id) as ws2:
                ws2.receive_json()
                assert ws1.receive_json()["type"] == "game_ready"
                assert ws2.receive_json()["type"] == "game_ready"

    def test_nonexistent_game_rejected(self, client):
        with pytest.raises(Exception):
            with client.websocket_connect("/ws/does-not-exist") as ws:
                ws.receive_json()

    def test_third_player_rejected(self, two_player_game, client):
        game_id, _, _ = two_player_game
        with pytest.raises(Exception):
            with _ws_connect(client, game_id) as ws3:
                ws3.receive_json()


# ---------------------------------------------------------------------------
# Plane placement tests
# ---------------------------------------------------------------------------

class TestPlanePlacement:

    def test_place_valid_plane(self, two_player_game):
        _, ws1, _ = two_player_game
        ws1.send_json(PLANE_1)
        r = ws1.receive_json()
        assert r["type"] == "plane_placed"
        assert r["success"] is True
        assert r["planes_count"] == 1

    def test_place_overlapping_plane_rejected(self, two_player_game):
        _, ws1, _ = two_player_game
        ws1.send_json(PLANE_1)
        ws1.receive_json()  # success

        ws1.send_json(PLANE_1)  # same position
        r = ws1.receive_json()
        assert r["type"] == "plane_placed"
        assert r["success"] is False

    def test_third_plane_rejected(self, two_player_game):
        _, ws1, _ = two_player_game
        ws1.send_json(PLANE_1)
        ws1.receive_json()
        ws1.send_json(PLANE_2)
        ws1.receive_json()

        ws1.send_json({"type": "place_plane", "head_x": 5, "head_y": 6, "orientation": "down"})
        r = ws1.receive_json()
        assert r["type"] == "plane_placed"
        assert r["success"] is False

    def test_game_starts_when_both_ready(self, two_player_game):
        _, ws1, ws2 = two_player_game
        _place_all_planes(ws1, ws2)
        # assertions are inside _place_all_planes


# ---------------------------------------------------------------------------
# Attack tests
# ---------------------------------------------------------------------------

class TestAttack:

    def test_miss(self, playing_game):
        _, ws1, ws2 = playing_game
        atk, dfn = _do_attack(ws1, ws2, *EMPTY_CELL)
        assert atk["result"] == "miss" and atk["is_attacker"] is True
        assert dfn["result"] == "miss" and dfn["is_attacker"] is False

    def test_body_hit(self, playing_game):
        _, ws1, ws2 = playing_game
        atk, dfn = _do_attack(ws1, ws2, *PLANE_1_BODY)
        assert atk["result"] == "hit"
        assert dfn["result"] == "hit"

    def test_head_hit(self, playing_game):
        _, ws1, ws2 = playing_game
        atk, _ = _do_attack(ws1, ws2, *PLANE_1_HEAD)
        assert atk["result"] == "head_hit"

    def test_turn_switches_after_attack(self, playing_game):
        _, ws1, ws2 = playing_game
        _do_attack(ws1, ws2, *EMPTY_CELL)
        tc1, tc2 = _consume_turn_changed(ws1, ws2)
        assert tc1["current_turn"] == "player2"
        assert tc2["current_turn"] == "player2"

    def test_attack_out_of_turn_rejected(self, playing_game):
        _, _, ws2 = playing_game
        # It's player1's turn; player2 tries to attack
        ws2.send_json({"type": "attack", "x": 5, "y": 5})
        err = ws2.receive_json()
        assert err["type"] == "error"
        assert "Not your turn" in err["message"]

    def test_attack_already_attacked_cell(self, playing_game):
        _, ws1, ws2 = playing_game
        # P1 attacks (5,5) → miss
        _do_attack(ws1, ws2, *EMPTY_CELL)
        _consume_turn_changed(ws1, ws2)

        # P2 attacks something → turn back to P1
        _do_attack(ws2, ws1, 5, 6)
        _consume_turn_changed(ws1, ws2)

        # P1 attacks same cell again
        ws1.send_json({"type": "attack", "x": EMPTY_CELL[0], "y": EMPTY_CELL[1]})
        r = ws1.receive_json()
        assert r["type"] == "attack_result"
        assert r["success"] is False


# ---------------------------------------------------------------------------
# Full game flow
# ---------------------------------------------------------------------------

class TestFullGame:

    def test_player1_wins_by_destroying_both_cockpits(self, playing_game):
        _, ws1, ws2 = playing_game

        # Turn 1 — P1 destroys P2's first cockpit
        atk, _ = _do_attack(ws1, ws2, *PLANE_1_HEAD)
        assert atk["result"] == "head_hit"
        _consume_turn_changed(ws1, ws2)

        # Turn 2 — P2 misses
        _do_attack(ws2, ws1, *EMPTY_CELL)
        _consume_turn_changed(ws1, ws2)

        # Turn 3 — P1 destroys P2's second cockpit → game over
        atk, _ = _do_attack(ws1, ws2, *PLANE_2_HEAD)
        assert atk["result"] == "head_hit"

        go1 = ws1.receive_json()
        go2 = ws2.receive_json()
        assert go1["type"] == "game_over" and go1["winner"] == "player1"
        assert go2["type"] == "game_over" and go2["winner"] == "player1"

    def test_player2_can_also_win(self, playing_game):
        _, ws1, ws2 = playing_game

        # P1 misses
        _do_attack(ws1, ws2, *EMPTY_CELL)
        _consume_turn_changed(ws1, ws2)

        # P2 destroys first cockpit
        _do_attack(ws2, ws1, *PLANE_1_HEAD)
        _consume_turn_changed(ws1, ws2)

        # P1 misses again
        _do_attack(ws1, ws2, 5, 6)
        _consume_turn_changed(ws1, ws2)

        # P2 destroys second cockpit → game over
        _do_attack(ws2, ws1, *PLANE_2_HEAD)

        go1 = ws1.receive_json()
        go2 = ws2.receive_json()
        assert go1["type"] == "game_over" and go1["winner"] == "player2"
        assert go2["type"] == "game_over" and go2["winner"] == "player2"


# ---------------------------------------------------------------------------
# End-of-game plane reveal (E2E)
# ---------------------------------------------------------------------------

class TestEndOfGameReveal:

    def test_game_over_reveals_opponent_boards(self, playing_game):
        """Both players receive opponent's unmasked board in game_over."""
        _, ws1, ws2 = playing_game

        # P1 destroys P2's first cockpit
        _do_attack(ws1, ws2, *PLANE_1_HEAD)
        _consume_turn_changed(ws1, ws2)

        # P2 misses
        _do_attack(ws2, ws1, *EMPTY_CELL)
        _consume_turn_changed(ws1, ws2)

        # P1 destroys P2's second cockpit → game over
        _do_attack(ws1, ws2, *PLANE_2_HEAD)

        go1 = ws1.receive_json()
        go2 = ws2.receive_json()
        assert go1["type"] == "game_over"
        assert go2["type"] == "game_over"

        # Winner (P1) sees loser's (P2) unmasked board
        board1 = go1["opponent_board"]
        assert len(board1) == 10 and len(board1[0]) == 10
        flat1 = [cell for row in board1 for cell in row]
        assert "plane" in flat1 or "head" in flat1 or "head_hit" in flat1

        # Loser (P2) sees winner's (P1) unmasked board
        board2 = go2["opponent_board"]
        assert len(board2) == 10 and len(board2[0]) == 10
        flat2 = [cell for row in board2 for cell in row]
        assert "plane" in flat2 or "head" in flat2

    def test_reconnect_to_finished_game_reveals_board(self, client):
        """Reconnecting to a finished game shows unmasked opponent board."""
        game_id = _create_game(client)
        with contextlib.ExitStack() as stack:
            ws1 = stack.enter_context(_ws_connect(client, game_id))
            p1 = ws1.receive_json()
            token1 = p1["session_token"]

            ws2 = stack.enter_context(_ws_connect(client, game_id))
            ws2.receive_json()  # player_assigned
            ws1.receive_json()  # game_ready
            ws2.receive_json()  # game_ready
            _place_all_planes(ws1, ws2)

            # Play to completion
            _do_attack(ws1, ws2, *PLANE_1_HEAD)
            _consume_turn_changed(ws1, ws2)
            _do_attack(ws2, ws1, *EMPTY_CELL)
            _consume_turn_changed(ws1, ws2)
            _do_attack(ws1, ws2, *PLANE_2_HEAD)
            ws1.receive_json()  # game_over
            ws2.receive_json()  # game_over

        # Both disconnected; reconnect player1
        with _ws_connect(client, game_id, token=token1) as ws1_new:
            assigned = ws1_new.receive_json()
            assert assigned["type"] == "player_assigned"
            assert assigned["game_state"] == "finished"

            resumed = ws1_new.receive_json()
            assert resumed["type"] == "game_resumed"
            assert resumed["winner"] == "player1"

            flat = [cell for row in resumed["opponent_board"] for cell in row]
            assert "plane" in flat or "head" in flat or "head_hit" in flat

    def test_midgame_reconnect_does_not_reveal_board(self, client):
        """Reconnecting mid-game must NOT reveal opponent planes."""
        game_id = _create_game(client)
        with _ws_connect(client, game_id) as ws1:
            ws1.receive_json()  # player_assigned
            with _ws_connect(client, game_id) as ws2:
                p2 = ws2.receive_json()
                token2 = p2["session_token"]
                ws1.receive_json()  # game_ready
                ws2.receive_json()  # game_ready
                _place_all_planes(ws1, ws2)

            # ws2 disconnected
            ws1.receive_json()  # player_disconnected

            with _ws_connect(client, game_id, token=token2) as ws2_new:
                ws2_new.receive_json()  # player_assigned
                resumed = ws2_new.receive_json()
                assert resumed["type"] == "game_resumed"

                flat = [cell for row in resumed["opponent_board"] for cell in row]
                assert "plane" not in flat
                assert "head" not in flat


# ---------------------------------------------------------------------------
# Disconnect / reconnection
# ---------------------------------------------------------------------------

class TestDisconnect:

    def test_opponent_notified_on_disconnect(self, client):
        game_id = _create_game(client)
        with _ws_connect(client, game_id) as ws1:
            ws1.receive_json()  # player_assigned
            with _ws_connect(client, game_id) as ws2:
                ws2.receive_json()  # player_assigned
                ws1.receive_json()  # game_ready
                ws2.receive_json()  # game_ready
            # ws2 disconnected here
            msg = ws1.receive_json()
            assert msg["type"] == "player_disconnected"

    def test_reconnect_to_playing_game(self, client):
        game_id = _create_game(client)
        token1 = token2 = None
        with contextlib.ExitStack() as stack:
            ws1 = stack.enter_context(_ws_connect(client, game_id))
            p1 = ws1.receive_json()
            token1 = p1["session_token"]

            ws2 = stack.enter_context(_ws_connect(client, game_id))
            p2 = ws2.receive_json()
            token2 = p2["session_token"]
            ws1.receive_json()  # game_ready
            ws2.receive_json()  # game_ready
            _place_all_planes(ws1, ws2)

        # Both disconnected; reconnect with session tokens via auth message
        with contextlib.ExitStack() as stack:
            ws1 = stack.enter_context(_ws_connect(client, game_id, token=token1))
            p1 = ws1.receive_json()
            assert p1["type"] == "player_assigned"
            assert p1["game_state"] == "playing"

            resumed1 = ws1.receive_json()
            assert resumed1["type"] == "game_resumed"
            assert len(resumed1["own_board"]) == 10
            assert len(resumed1["opponent_board"]) == 10
            assert resumed1["current_turn"] == "player1"

            ws2 = stack.enter_context(_ws_connect(client, game_id, token=token2))
            p2 = ws2.receive_json()
            assert p2["type"] == "player_assigned"
            assert p2["player_id"] == "player2"

            resumed2 = ws2.receive_json()
            assert resumed2["type"] == "game_resumed"

    def test_reconnect_preserves_board_state(self, client):
        """After attacks, a reconnecting player should see the correct board."""
        game_id = _create_game(client)
        with _ws_connect(client, game_id) as ws1:
            ws1.receive_json()  # player_assigned
            with _ws_connect(client, game_id) as ws2:
                p2 = ws2.receive_json()  # player_assigned
                token2 = p2["session_token"]
                ws1.receive_json()  # game_ready
                ws2.receive_json()  # game_ready
                _place_all_planes(ws1, ws2)

                # P1 hits P2's cockpit
                _do_attack(ws1, ws2, *PLANE_1_HEAD)
                _consume_turn_changed(ws1, ws2)

            # ws2 disconnected; ws1 still connected
            ws1.receive_json()  # player_disconnected

            # Reconnect player2 with token and verify board reflects the head_hit
            with _ws_connect(client, game_id, token=token2) as ws2_new:
                ws2_new.receive_json()  # player_assigned
                resumed = ws2_new.receive_json()
                assert resumed["type"] == "game_resumed"
                hx, hy = PLANE_1_HEAD
                assert resumed["own_board"][hy][hx] == "head_hit"


# ---------------------------------------------------------------------------
# Invalid message handling
# ---------------------------------------------------------------------------

class TestInvalidMessages:

    def test_unknown_message_type(self, two_player_game):
        _, ws1, _ = two_player_game
        ws1.send_json({"type": "unknown_action"})
        err = ws1.receive_json()
        assert err["type"] == "error"

    def test_malformed_attack(self, two_player_game):
        _, ws1, _ = two_player_game
        ws1.send_json({"type": "attack", "x": 999})
        err = ws1.receive_json()
        assert err["type"] == "error"

    def test_missing_type_field(self, two_player_game):
        _, ws1, _ = two_player_game
        ws1.send_json({"x": 5, "y": 3})
        err = ws1.receive_json()
        assert err["type"] == "error"


# ---------------------------------------------------------------------------
# Session token authentication — integration (#13)
# ---------------------------------------------------------------------------

class TestSessionTokenAuth:

    def test_player_assigned_includes_session_token(self, client):
        game_id = _create_game(client)
        with _ws_connect(client, game_id) as ws:
            msg = ws.receive_json()
            assert msg["type"] == "player_assigned"
            assert "session_token" in msg
            assert isinstance(msg["session_token"], str)
            assert len(msg["session_token"]) > 0

    def test_reconnect_with_invalid_token_rejected(self, client):
        game_id = _create_game(client)
        with _ws_connect(client, game_id) as ws1:
            ws1.receive_json()
            with _ws_connect(client, game_id) as ws2:
                ws2.receive_json()
                ws1.receive_json()  # game_ready
                ws2.receive_json()  # game_ready

        # Both disconnected; try to reconnect with wrong token
        with pytest.raises(Exception):
            with _ws_connect(client, game_id, token="invalid-token") as ws:
                ws.receive_json()

    def test_reconnect_without_token_on_claimed_slot_rejected(self, client):
        game_id = _create_game(client)
        with _ws_connect(client, game_id) as ws1:
            ws1.receive_json()
            with _ws_connect(client, game_id) as ws2:
                ws2.receive_json()
                ws1.receive_json()
                ws2.receive_json()

        # Both disconnected; try to reconnect without token (slots have tokens)
        with pytest.raises(Exception):
            with _ws_connect(client, game_id) as ws:
                ws.receive_json()

    def test_invalid_auth_message_rejected(self, client):
        """Sending garbage instead of an auth message should close the connection."""
        game_id = _create_game(client)
        with pytest.raises(Exception):
            with client.websocket_connect(f"/ws/{game_id}") as ws:
                ws.send_text("not-json")
                ws.receive_json()

    def test_wrong_auth_type_rejected(self, client):
        """Sending a valid JSON message with wrong type should close the connection."""
        game_id = _create_game(client)
        with pytest.raises(Exception):
            with client.websocket_connect(f"/ws/{game_id}") as ws:
                ws.send_json({"type": "attack", "x": 0, "y": 0})
                ws.receive_json()


# ---------------------------------------------------------------------------
# WebSocket message size limit (#15)
# ---------------------------------------------------------------------------

class TestWebSocketMessageSize:

    def test_oversized_message_rejected(self, two_player_game):
        _, ws1, _ = two_player_game
        ws1.send_text("x" * 2000)
        err = ws1.receive_json()
        assert err["type"] == "error"
        assert "too large" in err["message"].lower()

    def test_normal_size_message_accepted(self, two_player_game):
        _, ws1, _ = two_player_game
        ws1.send_json(PLANE_1)
        r = ws1.receive_json()
        assert r["type"] == "plane_placed"


# ---------------------------------------------------------------------------
# WebSocket rate limiting (#14)
# ---------------------------------------------------------------------------

class TestWebSocketRateLimit:

    def test_rapid_messages_get_throttled(self, two_player_game):
        """Sending more than 10 messages/sec should trigger rate limiting."""
        _, ws1, _ = two_player_game
        # Send 12 messages rapidly (limit is 10/sec)
        for _ in range(12):
            ws1.send_json({"type": "get_boards"})

        # Consume all 12 responses — at least one should be a rate-limit error
        responses = [ws1.receive_json() for _ in range(12)]
        error_msgs = [r for r in responses if r["type"] == "error"
                      and "slow down" in r.get("message", "").lower()]
        assert len(error_msgs) >= 1


# ---------------------------------------------------------------------------
# WebSocket error handling (#16)
# ---------------------------------------------------------------------------

class TestWebSocketErrorHandling:

    def test_malformed_json_returns_error(self, two_player_game):
        """Invalid JSON should return an error, not crash the handler."""
        _, ws1, _ = two_player_game
        ws1.send_text("{invalid json")
        err = ws1.receive_json()
        assert err["type"] == "error"
        assert "invalid json" in err["message"].lower()

    def test_connection_survives_bad_json(self, two_player_game):
        """After a bad JSON message, the connection should still work."""
        _, ws1, _ = two_player_game
        # Send bad JSON
        ws1.send_text("{bad json")
        ws1.receive_json()  # error response

        # Connection should still be alive — send a valid message
        ws1.send_json(PLANE_1)
        r = ws1.receive_json()
        assert r["type"] == "plane_placed"


# ---------------------------------------------------------------------------
# WebSocket Origin validation (#17)
# ---------------------------------------------------------------------------

class TestWebSocketOriginValidation:

    def test_allowed_origin_connects(self, client):
        """A WebSocket from an allowed origin should connect normally."""
        game_id = _create_game(client)
        with _ws_connect(client, game_id, headers={"Origin": "http://localhost"}) as ws:
            msg = ws.receive_json()
            assert msg["type"] == "player_assigned"

    def test_disallowed_origin_rejected(self, client):
        """A WebSocket from an unknown origin should be rejected."""
        game_id = _create_game(client)
        with pytest.raises(Exception):
            with client.websocket_connect(
                f"/ws/{game_id}",
                headers={"Origin": "http://evil.example.com"},
            ) as ws:
                ws.receive_json()

    def test_no_origin_header_allowed(self, client):
        """Non-browser clients without an Origin header should connect."""
        game_id = _create_game(client)
        # TestClient doesn't send Origin by default
        with _ws_connect(client, game_id) as ws:
            msg = ws.receive_json()
            assert msg["type"] == "player_assigned"


# ---------------------------------------------------------------------------
# Game info endpoint hardening (#18)
# ---------------------------------------------------------------------------

class TestGameInfoHardening:

    def test_get_game_only_returns_id_and_state(self, client):
        """GET /game/{id} must not reveal player slots or current turn."""
        game_id = _create_game(client)
        response = client.get(f"/game/{game_id}")
        data = response.json()
        assert set(data.keys()) == {"id", "state"}

    def test_get_game_nonexistent_returns_404(self, client):
        response = client.get("/game/nonexistent-id")
        assert response.status_code == 404
