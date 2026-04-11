"""
Tests for domain value objects — focused on PlayerID enum.
"""
import pytest
from domain.value_objects import PlayerID


class TestPlayerIDOpponent:
    """Test the .opponent property."""

    def test_player1_opponent_is_player2(self):
        assert PlayerID.PLAYER1.opponent == PlayerID.PLAYER2

    def test_player2_opponent_is_player1(self):
        assert PlayerID.PLAYER2.opponent == PlayerID.PLAYER1

    def test_opponent_round_trip(self):
        """Calling .opponent twice returns the original player."""
        assert PlayerID.PLAYER1.opponent.opponent == PlayerID.PLAYER1
        assert PlayerID.PLAYER2.opponent.opponent == PlayerID.PLAYER2


class TestPlayerIDBoth:
    """Test the .both() classmethod."""

    def test_returns_both_players(self):
        assert PlayerID.both() == (PlayerID.PLAYER1, PlayerID.PLAYER2)

    def test_is_iterable(self):
        result = list(PlayerID.both())
        assert result == [PlayerID.PLAYER1, PlayerID.PLAYER2]


class TestPlayerIDMakeDict:
    """Test the .make_dict() factory."""

    def test_creates_dict_with_both_keys(self):
        d = PlayerID.make_dict(lambda: None)
        assert set(d.keys()) == {PlayerID.PLAYER1, PlayerID.PLAYER2}

    def test_calls_factory_per_key(self):
        """Each key should get its own independent value from the factory."""
        d = PlayerID.make_dict(list)
        d[PlayerID.PLAYER1].append("x")
        assert d[PlayerID.PLAYER2] == [], "Values should be independent objects"

    def test_factory_return_values(self):
        d = PlayerID.make_dict(lambda: 42)
        assert d[PlayerID.PLAYER1] == 42
        assert d[PlayerID.PLAYER2] == 42


class TestPlayerIDStringCompat:
    """Test backward-compatible string behavior (str enum mixin)."""

    def test_equals_plain_string(self):
        assert PlayerID.PLAYER1 == "player1"
        assert PlayerID.PLAYER2 == "player2"

    def test_usable_as_dict_key_interchangeably(self):
        """A dict keyed by PlayerID should be accessible with plain strings and vice versa."""
        d = {PlayerID.PLAYER1: "a", PlayerID.PLAYER2: "b"}
        assert d["player1"] == "a"
        assert d["player2"] == "b"

    def test_construct_from_string(self):
        assert PlayerID("player1") is PlayerID.PLAYER1
        assert PlayerID("player2") is PlayerID.PLAYER2

    def test_invalid_string_raises(self):
        with pytest.raises(ValueError):
            PlayerID("player3")

    def test_json_serializable_value(self):
        """The .value should be a plain string for JSON serialization."""
        assert PlayerID.PLAYER1.value == "player1"
        assert isinstance(PlayerID.PLAYER1.value, str)
