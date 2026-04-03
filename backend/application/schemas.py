"""
WebSocket message schemas for input validation.
"""
import logging
from typing import Literal, Union
from pydantic import BaseModel, field_validator
from domain.value_objects import PlaneOrientation

logger = logging.getLogger(__name__)


class PlacePlaneMessage(BaseModel):
    type: Literal["place_plane"]
    head_x: int
    head_y: int
    orientation: str

    @field_validator("head_x", "head_y")
    @classmethod
    def coords_in_range(cls, v: int) -> int:
        if not (0 <= v <= 9):
            raise ValueError(f"Coordinate must be between 0 and 9, got {v}")
        return v

    @field_validator("orientation")
    @classmethod
    def valid_orientation(cls, v: str) -> str:
        valid = {e.value for e in PlaneOrientation}
        if v not in valid:
            raise ValueError(f"Orientation must be one of {valid}, got '{v}'")
        return v


class AttackMessage(BaseModel):
    type: Literal["attack"]
    x: int
    y: int

    @field_validator("x", "y")
    @classmethod
    def coords_in_range(cls, v: int) -> int:
        if not (0 <= v <= 9):
            raise ValueError(f"Coordinate must be between 0 and 9, got {v}")
        return v


class GetBoardsMessage(BaseModel):
    type: Literal["get_boards"]


ClientMessage = Union[PlacePlaneMessage, AttackMessage, GetBoardsMessage]


def parse_client_message(data: dict) -> ClientMessage | None:
    """
    Validate and parse a raw WebSocket message dict.
    Returns the parsed message, or None if invalid.
    Logs validation errors for debugging.
    """
    msg_type = data.get("type")

    schemas = {
        "place_plane": PlacePlaneMessage,
        "attack": AttackMessage,
        "get_boards": GetBoardsMessage,
    }

    schema = schemas.get(msg_type)
    if schema is None:
        logger.warning("Unknown message type: %s", msg_type)
        return None

    try:
        return schema.model_validate(data)
    except Exception as e:
        logger.warning("Invalid %s message: %s", msg_type, e)
        return None
