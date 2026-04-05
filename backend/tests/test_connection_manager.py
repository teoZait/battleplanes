"""
Tests for ConnectionManager — WebSocket send error handling.

Verifies that broken WebSocket connections don't crash the game loop
and are cleaned up automatically.
"""
import pytest
from infrastructure.connection_manager import ConnectionManager


class _GoodWebSocket:
    """Mock WebSocket that records sent messages."""
    def __init__(self):
        self.messages: list[dict] = []

    async def send_json(self, data: dict):
        self.messages.append(data)


class _BrokenWebSocket:
    """Mock WebSocket that raises on send (simulates a dropped connection)."""
    async def send_json(self, data: dict):
        raise ConnectionError("client gone")


class TestSendToPlayer:

    @pytest.mark.asyncio
    async def test_sends_message_to_connected_player(self):
        cm = ConnectionManager()
        ws = _GoodWebSocket()
        await cm.connect("g1", "player1", ws)

        await cm.send_to_player("g1", "player1", {"type": "test"})
        assert ws.messages == [{"type": "test"}]

    @pytest.mark.asyncio
    async def test_noop_for_unknown_game(self):
        cm = ConnectionManager()
        # Should not raise
        await cm.send_to_player("nonexistent", "player1", {"type": "test"})

    @pytest.mark.asyncio
    async def test_noop_for_unknown_player(self):
        cm = ConnectionManager()
        ws = _GoodWebSocket()
        await cm.connect("g1", "player1", ws)
        # Should not raise
        await cm.send_to_player("g1", "player2", {"type": "test"})

    @pytest.mark.asyncio
    async def test_broken_send_does_not_raise(self):
        cm = ConnectionManager()
        ws = _BrokenWebSocket()
        await cm.connect("g1", "player1", ws)

        # Should NOT raise — error is caught internally
        await cm.send_to_player("g1", "player1", {"type": "test"})

    @pytest.mark.asyncio
    async def test_broken_send_disconnects_player(self):
        cm = ConnectionManager()
        ws = _BrokenWebSocket()
        await cm.connect("g1", "player1", ws)

        await cm.send_to_player("g1", "player1", {"type": "test"})

        # Player should have been removed from active connections
        assert "player1" not in cm.active_connections.get("g1", {})


class TestBroadcast:

    @pytest.mark.asyncio
    async def test_broadcasts_to_all_players(self):
        cm = ConnectionManager()
        ws1, ws2 = _GoodWebSocket(), _GoodWebSocket()
        await cm.connect("g1", "player1", ws1)
        await cm.connect("g1", "player2", ws2)

        await cm.broadcast_to_game("g1", {"type": "test"})
        assert ws1.messages == [{"type": "test"}]
        assert ws2.messages == [{"type": "test"}]

    @pytest.mark.asyncio
    async def test_broadcast_survives_one_broken_connection(self):
        """If one player's send fails, the other should still receive the message."""
        cm = ConnectionManager()
        ws_good = _GoodWebSocket()
        ws_broken = _BrokenWebSocket()
        await cm.connect("g1", "player1", ws_broken)
        await cm.connect("g1", "player2", ws_good)

        await cm.broadcast_to_game("g1", {"type": "test"})

        # Good player still got the message
        assert ws_good.messages == [{"type": "test"}]
        # Broken player was cleaned up
        assert "player1" not in cm.active_connections["g1"]

    @pytest.mark.asyncio
    async def test_broadcast_noop_for_unknown_game(self):
        cm = ConnectionManager()
        # Should not raise
        await cm.broadcast_to_game("nonexistent", {"type": "test"})


class TestDisconnect:

    @pytest.mark.asyncio
    async def test_disconnect_removes_player(self):
        cm = ConnectionManager()
        ws = _GoodWebSocket()
        await cm.connect("g1", "player1", ws)

        cm.disconnect("g1", "player1")
        assert "player1" not in cm.active_connections.get("g1", {})

    @pytest.mark.asyncio
    async def test_disconnect_noop_for_unknown(self):
        cm = ConnectionManager()
        # Should not raise
        cm.disconnect("nonexistent", "player1")
