"""
Domain Value Objects - Enums and immutable types
"""
from enum import Enum


class CellStatus(str, Enum):
    """Represents the status of a cell on the game board"""
    EMPTY = "empty"
    PLANE = "plane"
    HEAD = "head"
    HIT = "hit"
    MISS = "miss"
    HEAD_HIT = "head_hit"


class PlaneOrientation(str, Enum):
    """Represents the orientation of a plane"""
    UP = "up"
    DOWN = "down"
    LEFT = "left"
    RIGHT = "right"


class GameState(str, Enum):
    """Represents the current state of the game"""
    WAITING = "waiting"
    PLACING = "placing"
    PLAYING = "playing"
    FINISHED = "finished"