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

    def test_session_tokens_round_trip(self):
        """Session tokens should survive serialisation."""
        game = Game("token-test")
        game.session_tokens = {"player1": "tok-abc", "player2": "tok-xyz"}

        data = GameStore._serialize(game)
        restored = GameStore._deserialize(data)

        assert restored.session_tokens == {"player1": "tok-abc", "player2": "tok-xyz"}

    def test_timestamps_round_trip(self):
        """created_at and finished_at should survive serialisation."""
        game = _make_playing_game()
        game.finish_game()

        data = GameStore._serialize(game)
        restored = GameStore._deserialize(data)

        assert restored.created_at == game.created_at
        assert restored.finished_at == game.finished_at
        assert restored.finished_at is not None

    def test_deserialize_missing_new_fields(self):
        """Old data without session_tokens/timestamps should deserialise safely."""
        data = {
            "id": "old-game",
            "boards": Game("x").boards,
            "planes": {"player1": [], "player2": []},
            "state": "waiting",
            "current_turn": "player1",
            "ready": {"player1": False, "player2": False},
            # no session_tokens, created_at, finished_at
        }
        restored = GameStore._deserialize(data)
        assert restored.id == "old-game"
        assert restored.session_tokens == {"player1": None, "player2": None}
        assert isinstance(restored.created_at, float)
        assert restored.finished_at is None


# ---------------------------------------------------------------------------
# GameStore with async mocked Redis
# ---------------------------------------------------------------------------

class _FakeRedis:
    """Minimal async in-memory stand-in for redis.asyncio.Redis."""

    def __init__(self):
        self.store: dict[str, str] = {}

    async def set(self, key, value, ex=None):
        self.store[key] = value

    async def get(self, key):
        return self.store.get(key)

    async def delete(self, key):
        self.store.pop(key, None)

    async def scan_iter(self, match="*"):
        import fnmatch
        for k in list(self.store.keys()):
            if fnmatch.fnmatch(k, match):
                yield k


class TestGameStoreOperations:

    def _make_store(self) -> GameStore:
        store = GameStore.__new__(GameStore)
        store._redis = _FakeRedis()
        return store

    @pytest.mark.asyncio
    async def test_save_and_load(self):
        store = self._make_store()
        game = _make_playing_game("save-load")

        await store.save(game)
        loaded = await store.load("save-load")

        assert loaded is not None
        assert loaded.id == "save-load"
        assert loaded.state == GameState.PLAYING

    @pytest.mark.asyncio
    async def test_load_nonexistent(self):
        store = self._make_store()
        assert await store.load("nope") is None

    @pytest.mark.asyncio
    async def test_load_all(self):
        store = self._make_store()
        await store.save(Game("g1"))
        await store.save(Game("g2"))

        games = await store.load_all()
        assert set(games.keys()) == {"g1", "g2"}

    @pytest.mark.asyncio
    async def test_delete(self):
        store = self._make_store()
        await store.save(Game("del-me"))
        await store.delete("del-me")
        assert await store.load("del-me") is None

    @pytest.mark.asyncio
    async def test_no_op_without_redis(self):
        store = GameStore(redis_url=None)
        await store.save(Game("x"))
        assert await store.load("x") is None
        assert await store.load_all() == {}


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

    @pytest.mark.asyncio
    async def test_create_game_persists(self):
        service, store = self._make_service()
        gid = await service.create_game()
        assert await store.load(gid) is not None

    @pytest.mark.asyncio
    async def test_plane_placement_persists(self):
        service, store = self._make_service()
        gid = await service.create_game()
        ws1, ws2 = MockWebSocket(), MockWebSocket()
        await service.handle_player_connection(gid, ws1)
        await service.handle_player_connection(gid, ws2)

        await service.handle_plane_placement(gid, "player1", PLANE_1_DATA)
        loaded = await store.load(gid)
        assert len(loaded.planes["player1"]) == 1

    @pytest.mark.asyncio
    async def test_attack_persists(self):
        service, store = self._make_service()
        gid = await service.create_game()
        ws1, ws2 = MockWebSocket(), MockWebSocket()
        await service.handle_player_connection(gid, ws1)
        await service.handle_player_connection(gid, ws2)

        for pid in ("player1", "player2"):
            await service.handle_plane_placement(gid, pid, PLANE_1_DATA)
            await service.handle_plane_placement(gid, pid, PLANE_2_DATA)

        await service.handle_attack(gid, "player1", 5, 5)
        loaded = await store.load(gid)
        assert loaded.boards["player2"][5][5] == "miss"
        assert loaded.current_turn == "player2"

    @pytest.mark.asyncio
    async def test_disconnect_persists(self):
        service, store = self._make_service()
        gid = await service.create_game()
        ws1, ws2 = MockWebSocket(), MockWebSocket()
        await service.handle_player_connection(gid, ws1)
        await service.handle_player_connection(gid, ws2)

        await service.handle_player_disconnection(gid, "player1")
        loaded = await store.load(gid)
        assert loaded.players["player1"] is None

    @pytest.mark.asyncio
    async def test_restore_on_startup(self):
        """A new GameService should restore games from the store on initialize()."""
        store = GameStore.__new__(GameStore)
        store._redis = _FakeRedis()
        await store.save(_make_playing_game("restored-1"))
        await store.save(Game("restored-2"))

        service = GameService(game_store=store)
        await service.initialize()

        assert "restored-1" in service.games
        assert "restored-2" in service.games
        assert service.games["restored-1"].state == GameState.PLAYING

        await service.shutdown()

    @pytest.mark.asyncio
    async def test_works_without_store(self):
        """GameService must work fine when no store is provided."""
        service = GameService(game_store=None)
        gid = await service.create_game()
        assert service.get_game(gid) is not None
