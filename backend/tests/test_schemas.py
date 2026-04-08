"""
Tests for WebSocket message validation schemas.
"""
import pytest
from application.schemas import (
    PlacePlaneMessage,
    AttackMessage,
    GetBoardsMessage,
    AuthMessage,
    CreateGameRequest,
    parse_client_message,
)


class TestPlacePlaneMessage:
    """Test place_plane message validation."""

    def test_valid_message(self):
        msg = PlacePlaneMessage(type="place_plane", head_x=5, head_y=3, orientation="up")
        assert msg.head_x == 5
        assert msg.head_y == 3
        assert msg.orientation == "up"

    def test_all_orientations(self):
        for orientation in ["up", "down", "left", "right"]:
            msg = PlacePlaneMessage(type="place_plane", head_x=0, head_y=0, orientation=orientation)
            assert msg.orientation == orientation

    def test_boundary_coordinates(self):
        msg = PlacePlaneMessage(type="place_plane", head_x=0, head_y=0, orientation="up")
        assert msg.head_x == 0
        msg = PlacePlaneMessage(type="place_plane", head_x=9, head_y=9, orientation="down")
        assert msg.head_x == 9

    def test_negative_x_rejected(self):
        with pytest.raises(Exception):
            PlacePlaneMessage(type="place_plane", head_x=-1, head_y=5, orientation="up")

    def test_negative_y_rejected(self):
        with pytest.raises(Exception):
            PlacePlaneMessage(type="place_plane", head_x=5, head_y=-1, orientation="up")

    def test_x_too_large_rejected(self):
        with pytest.raises(Exception):
            PlacePlaneMessage(type="place_plane", head_x=10, head_y=5, orientation="up")

    def test_y_too_large_rejected(self):
        with pytest.raises(Exception):
            PlacePlaneMessage(type="place_plane", head_x=5, head_y=10, orientation="up")

    def test_invalid_orientation_rejected(self):
        with pytest.raises(Exception):
            PlacePlaneMessage(type="place_plane", head_x=5, head_y=5, orientation="diagonal")

    def test_missing_orientation_rejected(self):
        with pytest.raises(Exception):
            PlacePlaneMessage(type="place_plane", head_x=5, head_y=5)

    def test_missing_coordinates_rejected(self):
        with pytest.raises(Exception):
            PlacePlaneMessage(type="place_plane", orientation="up")


class TestAttackMessage:
    """Test attack message validation."""

    def test_valid_message(self):
        msg = AttackMessage(type="attack", x=3, y=7)
        assert msg.x == 3
        assert msg.y == 7

    def test_boundary_coordinates(self):
        msg = AttackMessage(type="attack", x=0, y=0)
        assert msg.x == 0
        msg = AttackMessage(type="attack", x=9, y=9)
        assert msg.x == 9

    def test_negative_x_rejected(self):
        with pytest.raises(Exception):
            AttackMessage(type="attack", x=-1, y=5)

    def test_negative_y_rejected(self):
        with pytest.raises(Exception):
            AttackMessage(type="attack", x=5, y=-1)

    def test_x_too_large_rejected(self):
        with pytest.raises(Exception):
            AttackMessage(type="attack", x=10, y=5)

    def test_y_too_large_rejected(self):
        with pytest.raises(Exception):
            AttackMessage(type="attack", x=5, y=10)

    def test_missing_x_rejected(self):
        with pytest.raises(Exception):
            AttackMessage(type="attack", y=5)

    def test_missing_y_rejected(self):
        with pytest.raises(Exception):
            AttackMessage(type="attack", x=5)


class TestGetBoardsMessage:
    """Test get_boards message validation."""

    def test_valid_message(self):
        msg = GetBoardsMessage(type="get_boards")
        assert msg.type == "get_boards"


class TestAuthMessage:
    """Test auth handshake message validation."""

    def test_valid_with_token(self):
        msg = AuthMessage(type="auth", token="abc-123")
        assert msg.token == "abc-123"

    def test_valid_without_token(self):
        msg = AuthMessage(type="auth", token=None)
        assert msg.token is None

    def test_valid_from_dict(self):
        msg = AuthMessage.model_validate({"type": "auth", "token": None})
        assert msg.token is None

    def test_missing_token_defaults_to_none(self):
        msg = AuthMessage.model_validate({"type": "auth"})
        assert msg.token is None

    def test_wrong_type_rejected(self):
        with pytest.raises(Exception):
            AuthMessage.model_validate({"type": "attack", "token": None})


class TestParseClientMessage:
    """Test the parse_client_message dispatcher."""

    def test_valid_place_plane(self):
        msg = parse_client_message({
            "type": "place_plane", "head_x": 5, "head_y": 3, "orientation": "up"
        })
        assert isinstance(msg, PlacePlaneMessage)
        assert msg.head_x == 5

    def test_valid_attack(self):
        msg = parse_client_message({"type": "attack", "x": 3, "y": 7})
        assert isinstance(msg, AttackMessage)
        assert msg.x == 3

    def test_valid_get_boards(self):
        msg = parse_client_message({"type": "get_boards"})
        assert isinstance(msg, GetBoardsMessage)

    def test_unknown_type_returns_none(self):
        assert parse_client_message({"type": "unknown_action"}) is None

    def test_missing_type_returns_none(self):
        assert parse_client_message({"x": 5, "y": 3}) is None

    def test_empty_dict_returns_none(self):
        assert parse_client_message({}) is None

    def test_invalid_place_plane_returns_none(self):
        # Out of range coordinate
        msg = parse_client_message({
            "type": "place_plane", "head_x": 99, "head_y": 3, "orientation": "up"
        })
        assert msg is None

    def test_invalid_attack_returns_none(self):
        # Missing y
        msg = parse_client_message({"type": "attack", "x": 3})
        assert msg is None

    def test_invalid_orientation_returns_none(self):
        msg = parse_client_message({
            "type": "place_plane", "head_x": 5, "head_y": 3, "orientation": "sideways"
        })
        assert msg is None

    def test_place_plane_model_dump(self):
        """Ensure model_dump produces dict compatible with game_service."""
        msg = parse_client_message({
            "type": "place_plane", "head_x": 5, "head_y": 3, "orientation": "up"
        })
        data = msg.model_dump()
        assert data["head_x"] == 5
        assert data["head_y"] == 3
        assert data["orientation"] == "up"
        assert data["type"] == "place_plane"

    def test_extra_fields_ignored(self):
        """Extra fields in the message should not cause validation failure."""
        msg = parse_client_message({
            "type": "attack", "x": 3, "y": 7, "extra_field": "ignored"
        })
        assert isinstance(msg, AttackMessage)
        assert msg.x == 3


class TestCreateGameRequest:
    """Test CreateGameRequest schema validation."""

    def test_valid_modes_accepted(self):
        for mode in ("classic", "strategic"):
            req = CreateGameRequest.model_validate({"mode": mode})
            assert req.mode == mode

    def test_default_mode_is_classic(self):
        assert CreateGameRequest().mode == "classic"
        assert CreateGameRequest.model_validate({}).mode == "classic"

    def test_invalid_modes_rejected(self):
        for bad in ("chaos", "", "CLASSIC"):
            with pytest.raises(Exception):
                CreateGameRequest(mode=bad)
