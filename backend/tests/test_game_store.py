"""
Tests for GameStore serialisation/deserialisation and GameService persistence
integration.

These tests do NOT require a running Redis instance — they exercise the
serialize/deserialize logic directly and use a thin in-memory fake for the
write-through integration.
"""
import json
import pytest
from unittest.mock import MagicMock

from domain.models import Game, Plane
from domain.value_objects import GameState, PlaneOrientation
from infrastructure.game_store import GameStore
from application.game_service import GameService


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

PLANE_1_DATA = {"head_x": 2, "head_y": 0, "orientation": "up", "type": "place_plane"}
PLANE_2_DATA = {"head_x": 7, "head_y": 0, "orientation": "up", "type": "place_plane"}


def _make_playing_game(game_id: str = "test-123") -> Game:
    """Create a Game that has advanced to the PLAYING state."""
    game = Game(game_id)
    # Simulate two players joining
    game.players["player1"] = "ws-stub"
    game.players["player2"] = "ws-stub"
    game.state = GameState.PLACING

    for pid in ("player1", "player2"):
        game.place_plane(pid, PLANE_1_DATA)
        game.place_plane(pid, PLANE_2_DATA)
        game.mark_player_ready(pid)

    game.start_game()
    # Clear player refs (as Redis would)
    game.players = {"player1": None, "player2": None}
    return game


# ---------------------------------------------------------------------------
# Serialisation round-trip
# ---------------------------------------------------------------------------

class TestSerialisation:

    def test_fresh_game_round_trip(self):
        original = Game("abc-123")
        data = GameStore._serialize(original)
        restored = GameStore._deserialize(data)

        assert restored.id == original.id
        assert restored.state == GameState.WAITING
        assert restored.current_turn == "player1"
        assert restored.boards == original.boards

    def test_playing_game_round_trip(self):
        original = _make_playing_game()
        data = GameStore._serialize(original)
        restored = GameStore._deserialize(data)

        assert restored.id == original.id
        assert restored.state == GameState.PLAYING
        assert restored.ready == {"player1": True, "player2": True}
        assert len(restored.planes["player1"]) == 2
        assert len(restored.planes["player2"]) == 2

    def test_planes_preserve_fields(self):
        original = _make_playing_game()
        plane = original.planes["player1"][0]

        data = GameStore._serialize(original)
        restored = GameStore._deserialize(data)
        rp = restored.planes["player1"][0]

        assert rp.positions == plane.positions
        assert rp.head_position == plane.head_position
        assert rp.orientation == plane.orientation
        assert rp.is_destroyed == plane.is_destroyed

    def test_board_damage_preserved(self):
        game = _make_playing_game()
        game.attack("player1", 2, 0)  # head_hit on player2's cockpit

        data = GameStore._serialize(game)
        restored = GameStore._deserialize(data)

        assert restored.boards["player2"][0][2] == "head_hit"
        destroyed = [p for p in restored.planes["player2"] if p.is_destroyed]
        assert len(destroyed) == 1

    def test_json_round_trip(self):
        """Ensure the dict survives a full JSON encode/decode cycle."""
        game = _make_playing_game()
        raw = json.dumps(GameStore._serialize(game))
        restored = GameStore._deserialize(json.loads(raw))

        assert restored.state == GameState.PLAYING
        assert len(restored.planes["player1"]) == 2

    def test_players_are_none_after_restore(self):
        game = _make_playing_game()
        data = GameStore._serialize(game)
        restored = GameStore._deserialize(data)

        assert restored.players["player1"] is None
        assert restored.players["player2"] is None


# ---------------------------------------------------------------------------
# GameStore with mocked Redis
# ---------------------------------------------------------------------------

class _FakeRedis:
    """Minimal in-memory stand-in for redis.Redis (only the methods we use)."""

    def __init__(self):
        self.store: dict[str, str] = {}

    def set(self, key, value, ex=None):
        self.store[key] = value

    def get(self, key):
        return self.store.get(key)

    def delete(self, key):
        self.store.pop(key, None)

    def scan_iter(self, match="*"):
        import fnmatch
        return [k for k in self.store if fnmatch.fnmatch(k, match)]


class TestGameStoreOperations:

    def _make_store(self) -> GameStore:
        store = GameStore.__new__(GameStore)
        store._redis = _FakeRedis()
        return store

    def test_save_and_load(self):
        store = self._make_store()
        game = _make_playing_game("save-load")

        store.save(game)
        loaded = store.load("save-load")

        assert loaded is not None
        assert loaded.id == "save-load"
        assert loaded.state == GameState.PLAYING

    def test_load_nonexistent(self):
        store = self._make_store()
        assert store.load("nope") is None

    def test_load_all(self):
        store = self._make_store()
        store.save(Game("g1"))
        store.save(Game("g2"))

        games = store.load_all()
        assert set(games.keys()) == {"g1", "g2"}

    def test_delete(self):
        store = self._make_store()
        store.save(Game("del-me"))
        store.delete("del-me")
        assert store.load("del-me") is None

    def test_no_op_without_redis(self):
        store = GameStore(redis_url=None)
        store.save(Game("x"))
        assert store.load("x") is None
        assert store.load_all() == {}


# ---------------------------------------------------------------------------
# GameService ↔ GameStore integration
# ---------------------------------------------------------------------------

class MockWebSocket:
    def __init__(self):
        self.messages = []
        self.accepted = False

    async def accept(self):
        self.accepted = True

    async def send_json(self, data):
        self.messages.append(data)

    async def close(self, code=1000):
        pass


class TestServicePersistence:

    def _make_service(self) -> tuple[GameService, GameStore]:
        store = GameStore.__new__(GameStore)
        store._redis = _FakeRedis()
        service = GameService(game_store=store)
        return service, store

    def test_create_game_persists(self):
        service, store = self._make_service()
        gid = service.create_game()
        assert store.load(gid) is not None

    @pytest.mark.asyncio
    async def test_plane_placement_persists(self):
        service, store = self._make_service()
        gid = service.create_game()
        ws1, ws2 = MockWebSocket(), MockWebSocket()
        await service.handle_player_connection(gid, ws1)
        await service.handle_player_connection(gid, ws2)

        await service.handle_plane_placement(gid, "player1", PLANE_1_DATA)
        loaded = store.load(gid)
        assert len(loaded.planes["player1"]) == 1

    @pytest.mark.asyncio
    async def test_attack_persists(self):
        service, store = self._make_service()
        gid = service.create_game()
        ws1, ws2 = MockWebSocket(), MockWebSocket()
        await service.handle_player_connection(gid, ws1)
        await service.handle_player_connection(gid, ws2)

        for pid in ("player1", "player2"):
            await service.handle_plane_placement(gid, pid, PLANE_1_DATA)
            await service.handle_plane_placement(gid, pid, PLANE_2_DATA)

        await service.handle_attack(gid, "player1", 5, 5)
        loaded = store.load(gid)
        assert loaded.boards["player2"][5][5] == "miss"
        assert loaded.current_turn == "player2"

    @pytest.mark.asyncio
    async def test_disconnect_persists(self):
        service, store = self._make_service()
        gid = service.create_game()
        ws1, ws2 = MockWebSocket(), MockWebSocket()
        await service.handle_player_connection(gid, ws1)
        await service.handle_player_connection(gid, ws2)

        await service.handle_player_disconnection(gid, "player1")
        loaded = store.load(gid)
        assert loaded.players["player1"] is None

    def test_restore_on_startup(self):
        """A new GameService should restore games from the store."""
        store = GameStore.__new__(GameStore)
        store._redis = _FakeRedis()
        store.save(_make_playing_game("restored-1"))
        store.save(Game("restored-2"))

        service = GameService(game_store=store)
        assert "restored-1" in service.games
        assert "restored-2" in service.games
        assert service.games["restored-1"].state == GameState.PLAYING

    def test_works_without_store(self):
        """GameService must work fine when no store is provided."""
        service = GameService(game_store=None)
        gid = service.create_game()
        assert service.get_game(gid) is not None
