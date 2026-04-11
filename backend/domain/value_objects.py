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


class GameMode(str, Enum):
    """Represents the game mode (number of planes per player)"""
    CLASSIC = "classic"      # 2 planes per player
    ELITE = "elite"  # 3 planes per player

    @property
    def plane_count(self) -> int:
        return 2 if self == GameMode.CLASSIC else 3


class GameState(str, Enum):
    """Represents the current state of the game"""
    WAITING = "waiting"
    PLACING = "placing"
    PLAYING = "playing"
    FINISHED = "finished"


class PlayerID(str, Enum):
    """Identifies a player slot in a game"""
    PLAYER1 = "player1"
    PLAYER2 = "player2"

    @property
    def opponent(self) -> "PlayerID":
        return PlayerID.PLAYER2 if self == PlayerID.PLAYER1 else PlayerID.PLAYER1

    @classmethod
    def both(cls) -> tuple["PlayerID", "PlayerID"]:
        return (cls.PLAYER1, cls.PLAYER2)

    @classmethod
    def make_dict(cls, default_factory):
        """Create a {PLAYER1: ..., PLAYER2: ...} dict using a factory callable."""
        return {pid: default_factory() for pid in cls.both()}