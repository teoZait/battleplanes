import pytest
from main import (
    get_plane_positions, 
    PlaneOrientation, 
    Game,
    CellStatus
)

def normalize(positions):
    """Sort positions for comparison"""
    return sorted(positions)


class TestPlanePositions:
    """Test plane position generation for all orientations"""
    
    def test_plane_has_10_positions(self):
        """Every plane should have exactly 10 cells"""
        for orientation in [PlaneOrientation.UP, PlaneOrientation.DOWN, 
                           PlaneOrientation.LEFT, PlaneOrientation.RIGHT]:
            positions, head = get_plane_positions(5, 5, orientation)
            assert len(positions) == 10, f"{orientation}: Should have 10 positions"
    
    def test_head_is_first_position(self):
        """Head should always be the first position in the array"""
        for orientation in [PlaneOrientation.UP, PlaneOrientation.DOWN,
                           PlaneOrientation.LEFT, PlaneOrientation.RIGHT]:
            positions, head = get_plane_positions(5, 5, orientation)
            assert positions[0] == head, f"{orientation}: First position should be head"
            assert head == (5, 5), f"{orientation}: Head should be at original coordinates"
    
    def test_no_duplicate_positions(self):
        """All positions should be unique"""
        for orientation in [PlaneOrientation.UP, PlaneOrientation.DOWN,
                           PlaneOrientation.LEFT, PlaneOrientation.RIGHT]:
            positions, _ = get_plane_positions(5, 5, orientation)
            assert len(positions) == len(set(positions)), f"{orientation}: Has duplicate positions"
    
    def test_up_orientation_positions(self):
        """Test UP orientation creates correct pattern"""
        positions, head = get_plane_positions(5, 2, PlaneOrientation.UP)
        
        expected = [
            (5, 2),  # Head
            (3, 3), (4, 3), (5, 3), (6, 3), (7, 3),  # Wings
            (5, 4),  # Body
            (4, 5), (5, 5), (6, 5)  # Tail
        ]
        
        assert normalize(positions) == normalize(expected), "UP orientation positions don't match expected"
        assert head == (5, 2), "Head position incorrect"
    
    def test_down_orientation_positions(self):
        """Test DOWN orientation creates correct pattern"""
        positions, head = get_plane_positions(5, 7, PlaneOrientation.DOWN)
        
        expected = [
            (5, 7),  # Head
            (4, 4), (5, 4), (6, 4),  # Tail
            (5, 5),  # Body
            (3, 6), (4, 6), (5, 6), (6, 6), (7, 6)  # Wings
        ]
        
        assert normalize(positions) == normalize(expected), "DOWN orientation positions don't match expected"
        assert head == (5, 7), "Head position incorrect"
    
    def test_left_orientation_positions(self):
        """Test LEFT orientation creates correct pattern"""
        positions, head = get_plane_positions(2, 5, PlaneOrientation.LEFT)
        
        expected = [
            (2, 5),  # Head
            (3, 3), (3, 4), (3, 5), (3, 6), (3, 7),  # Wings
            (4, 5),  # Body
            (5, 4), (5, 5), (5, 6)  # Tail
        ]
        
        assert normalize(positions) == normalize(expected), "LEFT orientation positions don't match expected"
        assert head == (2, 5), "Head position incorrect"
    
    def test_right_orientation_positions(self):
        """Test RIGHT orientation creates correct pattern"""
        positions, head = get_plane_positions(7, 5, PlaneOrientation.RIGHT)
        
        expected = [
            (7, 5),  # Head
            (4, 4), (4, 5), (4, 6),  # Tail
            (5, 5),  # Body
            (6, 3), (6, 4), (6, 5), (6, 6), (6, 7)  # Wings
        ]
        
        assert normalize(positions) == normalize(expected), "RIGHT orientation positions don't match expected"
        assert head == (7, 5), "Head position incorrect"


class TestGamePlacement:
    """Test game plane placement validation"""
    
    def test_place_valid_plane(self):
        """Should successfully place a valid plane"""
        game = Game("test-game-1")
        
        success, message = game.place_plane("player1", {
            "head_x": 5,
            "head_y": 2,
            "orientation": "up"
        })
        
        assert success is True, "Valid plane placement should succeed"
        assert len(game.planes["player1"]) == 1, "Should have 1 plane placed"
    
    def test_cannot_place_more_than_2_planes(self):
        """Should reject placement of more than 2 planes"""
        game = Game("test-game-2")
        
        # Place first plane
        game.place_plane("player1", {"head_x": 5, "head_y": 2, "orientation": "up"})
        # Place second plane
        game.place_plane("player1", {"head_x": 5, "head_y": 9, "orientation": "down"})
        # Try to place third plane
        success, message = game.place_plane("player1", {"head_x": 3, "head_y": 4, "orientation": "right"})
        
        assert success is False, "Should not allow more than 2 planes"
        assert "Already placed 2 planes" in message
        assert len(game.planes["player1"]) == 2, "Should still have only 2 planes"
    
    def test_cannot_place_overlapping_planes(self):
        """Should reject overlapping plane placement"""
        game = Game("test-game-3")
        
        # Place first plane
        game.place_plane("player1", {"head_x": 5, "head_y": 2, "orientation": "up"})
        # Try to place overlapping plane
        success, message = game.place_plane("player1", {"head_x": 5, "head_y": 3, "orientation": "up"})
        
        assert success is False, "Should reject overlapping planes"
        assert "overlap" in message.lower()
    
    def test_cannot_place_out_of_bounds(self):
        """Should reject planes that go out of bounds"""
        game = Game("test-game-4")
        
        # Try to place plane too close to top edge (UP orientation needs space below)
        success, message = game.place_plane("player1", {"head_x": 5, "head_y": 8, "orientation": "up"})
        
        assert success is False, "Should reject out of bounds placement"
        assert "out of bounds" in message.lower()
    
    def test_plane_positions_marked_on_board(self):
        """Board should be updated with plane positions"""
        game = Game("test-game-5")
        
        game.place_plane("player1", {"head_x": 5, "head_y": 2, "orientation": "up"})
        
        # Check head is marked
        assert game.boards["player1"][2][5] == "head", "Head should be marked on board"
        
        # Check wings are marked
        assert game.boards["player1"][3][3] == "plane", "Wing should be marked"
        assert game.boards["player1"][3][7] == "plane", "Wing should be marked"
        
        # Check body is marked
        assert game.boards["player1"][4][5] == "plane", "Body should be marked"


class TestGameAttacks:
    """Test game attack mechanics"""
    
    def test_attack_body_cell(self):
        """Attacking plane body should return 'hit' but not destroy plane"""
        game = Game("test-game-6")
        game.planes["player1"] = []  # Reset
        game.planes["player2"] = []
        
        # Place plane for player2
        game.place_plane("player2", {"head_x": 5, "head_y": 2, "orientation": "up"})
        
        # Player1 attacks plane body
        result = game.attack("player1", 5, 4)  # Body position
        
        assert result == "hit", "Body hit should return 'hit'"
        assert game.boards["player2"][4][5] == "hit", "Board should show hit"
        assert game.planes["player2"][0].is_destroyed is False, "Plane should NOT be destroyed"
    
    def test_attack_head_cell(self):
        """Attacking plane head should return 'head_hit' and destroy plane"""
        game = Game("test-game-7")
        game.planes["player1"] = []
        game.planes["player2"] = []
        
        # Place plane for player2
        game.place_plane("player2", {"head_x": 5, "head_y": 2, "orientation": "up"})
        
        # Player1 attacks plane head
        result = game.attack("player1", 5, 2)  # Head position
        
        assert result == "head_hit", "Head hit should return 'head_hit'"
        assert game.boards["player2"][2][5] == "head_hit", "Board should show head_hit"
        assert game.planes["player2"][0].is_destroyed is True, "Plane SHOULD be destroyed"
    
    def test_attack_empty_cell(self):
        """Attacking empty cell should return 'miss'"""
        game = Game("test-game-8")
        
        result = game.attack("player1", 0, 0)
        
        assert result == "miss", "Empty cell should return 'miss'"
        assert game.boards["player2"][0][0] == "miss", "Board should show miss"
    
    def test_attack_already_attacked_cell(self):
        """Attacking same cell twice should return 'already_attacked'"""
        game = Game("test-game-9")
        
        # First attack
        game.attack("player1", 0, 0)
        # Second attack on same cell
        result = game.attack("player1", 0, 0)
        
        assert result == "already_attacked", "Should reject repeated attack"
    
    def test_attack_out_of_bounds(self):
        """Attacking out of bounds should return None"""
        game = Game("test-game-10")
        
        result = game.attack("player1", 10, 10)
        assert result is None, "Out of bounds attack should return None"
        
        result = game.attack("player1", -1, 5)
        assert result is None, "Negative coordinate attack should return None"


class TestWinCondition:
    """Test game win condition logic"""
    
    def test_no_winner_at_start(self):
        """Game should have no winner initially"""
        game = Game("test-game-11")
        game.planes["player1"] = []
        game.planes["player2"] = []
        
        # Place planes
        game.place_plane("player1", {"head_x": 5, "head_y": 2, "orientation": "up"})
        game.place_plane("player1", {"head_x": 2, "head_y": 7, "orientation": "left"})
        game.place_plane("player2", {"head_x": 5, "head_y": 2, "orientation": "up"})
        game.place_plane("player2", {"head_x": 2, "head_y": 7, "orientation": "left"})
        
        winner = game.check_winner()
        assert winner is None, "No winner at game start"
    
    def test_winner_after_destroying_one_plane(self):
        """Destroying only one plane should not declare winner"""
        game = Game("test-game-12")
        game.planes["player1"] = []
        game.planes["player2"] = []
        
        # Place 2 planes for player2
        game.place_plane("player2", {"head_x": 5, "head_y": 2, "orientation": "up"})
        game.place_plane("player2", {"head_x": 2, "head_y": 7, "orientation": "left"})
        
        # Destroy first plane
        game.attack("player1", 5, 2)  # Hit head
        
        winner = game.check_winner()
        assert winner is None, "Should not have winner after destroying only 1 plane"
    
    def test_winner_after_destroying_both_planes(self):
        """Destroying both planes should declare winner"""
        game = Game("test-game-13")
        game.planes["player1"] = []
        game.planes["player2"] = []
        
        # Place 2 planes for player2
        game.place_plane("player2", {"head_x": 5, "head_y": 2, "orientation": "up"})
        game.place_plane("player2", {"head_x": 2, "head_y": 7, "orientation": "left"})
        
        # Destroy both planes
        game.attack("player1", 5, 2)  # Hit first head
        game.attack("player1", 2, 7)  # Hit second head
        
        winner = game.check_winner()
        assert winner == "player1", "Player1 should win after destroying both planes"
    
    def test_correct_winner_identification(self):
        """Winner should be opponent of player who lost all planes"""
        game = Game("test-game-14")
        game.planes["player1"] = []
        game.planes["player2"] = []
        
        # Place planes for both players
        game.place_plane("player1", {"head_x": 5, "head_y": 2, "orientation": "up"})
        game.place_plane("player1", {"head_x": 2, "head_y": 7, "orientation": "left"})
        game.place_plane("player2", {"head_x": 5, "head_y": 2, "orientation": "up"})
        game.place_plane("player2", {"head_x": 2, "head_y": 7, "orientation": "left"})
        
        # Player2 destroys player1's planes
        game.attack("player2", 5, 2)
        game.attack("player2", 2, 7)
        
        winner = game.check_winner()
        assert winner == "player2", "Player2 should win"


class TestBoardMasking:
    """Test opponent board masking"""
    
    def test_opponent_board_hides_planes(self):
        """Opponent's board should hide plane positions"""
        game = Game("test-game-15")
        game.planes["player2"] = []
        
        # Place plane for player2
        game.place_plane("player2", {"head_x": 5, "head_y": 2, "orientation": "up"})
        
        # Get masked board from player1's perspective
        masked = game.get_masked_board("player1")
        
        # Check that plane positions show as empty
        assert masked[2][5] == "empty", "Head should be hidden"
        assert masked[3][5] == "empty", "Wing should be hidden"
        assert masked[4][5] == "empty", "Body should be hidden"
    
    def test_opponent_board_shows_hits(self):
        """Opponent's board should show hit and miss markers"""
        game = Game("test-game-16")
        game.planes["player2"] = []
        
        # Place plane
        game.place_plane("player2", {"head_x": 5, "head_y": 2, "orientation": "up"})
        
        # Attack
        game.attack("player1", 5, 2)  # Head hit
        game.attack("player1", 5, 4)  # Body hit
        game.attack("player1", 0, 0)  # Miss
        
        masked = game.get_masked_board("player1")
        
        assert masked[2][5] == "head_hit", "Head hit should be visible"
        assert masked[4][5] == "hit", "Body hit should be visible"
        assert masked[0][0] == "miss", "Miss should be visible"


if __name__ == "__main__":
    # Run with: python -m pytest test_main.py -v
    pytest.main([__file__, "-v"])
