"""
Domain Models - Core entities
"""
from typing import List, Tuple, Dict, Optional
from pydantic import BaseModel
from .value_objects import PlaneOrientation, GameState, CellStatus
from .game_logic import get_plane_positions, is_valid_placement


class Plane(BaseModel):
    """Represents a single plane on the board"""
    positions: List[Tuple[int, int]]
    head_position: Tuple[int, int]
    orientation: PlaneOrientation
    hit_positions: List[Tuple[int, int]] = []
    is_destroyed: bool = False

    def receive_attack(self, x: int, y: int) -> str:
        """
        Process an attack on this plane.
        
        Returns:
            "head_hit", "hit", or None if position not part of plane
        """
        position = (x, y)
        
        if position == self.head_position:
            self.is_destroyed = True
            self.hit_positions.append(position)
            return "head_hit"
        elif position in self.positions:
            self.hit_positions.append(position)
            return "hit"
        
        return None


class Game:
    """Game aggregate root - manages all game state and rules"""
    
    def __init__(self, game_id: str):
        self.id = game_id
        self.players: Dict[str, Optional[object]] = {"player1": None, "player2": None}
        self.boards: Dict[str, List[List[str]]] = {
            "player1": [["empty" for _ in range(10)] for _ in range(10)],
            "player2": [["empty" for _ in range(10)] for _ in range(10)]
        }
        self.planes: Dict[str, List[Plane]] = {"player1": [], "player2": []}
        self.state = GameState.WAITING
        self.current_turn = "player1"
        self.ready: Dict[str, bool] = {"player1": False, "player2": False}

    def add_player(self, websocket) -> Optional[str]:
        """Add a player to the game. Returns player_id or None if full."""
        if self.players["player1"] is None:
            self.players["player1"] = websocket
            return "player1"
        elif self.players["player2"] is None:
            self.players["player2"] = websocket
            self.state = GameState.PLACING
            return "player2"
        return None

    def place_plane(self, player_id: str, plane_data: Dict) -> Tuple[bool, str]:
        """
        Place a plane for a player.
        
        Returns:
            Tuple of (success, message)
        """
        # Check if player already has 2 planes
        if len(self.planes[player_id]) >= 2:
            return False, "Already placed 2 planes"
        
        # Get plane positions
        head_x = plane_data["head_x"]
        head_y = plane_data["head_y"]
        orientation = PlaneOrientation(plane_data["orientation"])
        
        positions, head = get_plane_positions(head_x, head_y, orientation)
        
        # Validate placement
        is_valid, error_msg = is_valid_placement(positions, self.boards[player_id])
        if not is_valid:
            return False, error_msg
        
        # Place plane on board
        for pos in positions:
            x, y = pos
            if pos == head:
                self.boards[player_id][y][x] = "head"
            else:
                self.boards[player_id][y][x] = "plane"
        
        # Store plane entity
        plane = Plane(
            positions=positions,
            head_position=head,
            orientation=orientation,
            is_destroyed=False
        )
        self.planes[player_id].append(plane)
        
        return True, "Plane placed successfully"

    def attack(self, attacker: str, x: int, y: int) -> Optional[str]:
        """
        Process an attack.
        
        Returns:
            "hit", "head_hit", "miss", "already_attacked", or None (invalid)
        """
        defender = "player2" if attacker == "player1" else "player1"
        
        # Validate bounds
        if x < 0 or x >= 10 or y < 0 or y >= 10:
            return None
        
        cell = self.boards[defender][y][x]
        
        # Check if already attacked
        if cell in ("hit", "head_hit", "miss"):
            return "already_attacked"
        
        # Process attack on each plane
        for plane in self.planes[defender]:
            result = plane.receive_attack(x, y)
            if result:
                self.boards[defender][y][x] = result
                return result
        
        # Miss
        self.boards[defender][y][x] = "miss"
        return "miss"

    def check_winner(self) -> Optional[str]:
        """
        Check if there's a winner (all planes destroyed).
        
        Returns:
            Winner player_id or None
        """
        for player_id in ["player1", "player2"]:
            if len(self.planes[player_id]) == 2:  # Player has placed both planes
                destroyed_count = sum(1 for plane in self.planes[player_id] if plane.is_destroyed)
                if destroyed_count == 2:
                    # This player lost, return opponent as winner
                    return "player2" if player_id == "player1" else "player1"
        return None

    def get_masked_board(self, player_id: str) -> List[List[str]]:
        """Return opponent's board with planes hidden"""
        opponent = "player2" if player_id == "player1" else "player1"
        masked = []
        
        for row in self.boards[opponent]:
            masked_row = []
            for cell in row:
                if cell in ("plane", "head"):
                    masked_row.append("empty")
                else:
                    masked_row.append(cell)
            masked.append(masked_row)
        
        return masked

    def mark_player_ready(self, player_id: str):
        """Mark player as ready after placing all planes"""
        if len(self.planes[player_id]) == 2:
            self.ready[player_id] = True
    
    def are_both_players_ready(self) -> bool:
        """Check if both players are ready to start"""
        return self.ready["player1"] and self.ready["player2"]
    
    def start_game(self):
        """Transition to playing state"""
        if self.are_both_players_ready():
            self.state = GameState.PLAYING
    
    def switch_turn(self):
        """Switch to the other player's turn"""
        self.current_turn = "player2" if self.current_turn == "player1" else "player1"
    
    def finish_game(self):
        """Mark game as finished"""
        self.state = GameState.FINISHED
