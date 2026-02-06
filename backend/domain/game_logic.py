"""
Domain Logic - Core game rules and algorithms
"""
from typing import List, Tuple
from .value_objects import PlaneOrientation


# Plane matrix definition (UP orientation)
PLANE_MATRIX_UP = [
    ['.', '.', 'H', '.', '.'],
    ['B', 'B', 'B', 'B', 'B'],
    ['.', '.', 'B', '.', '.'],
    ['.', 'B', 'B', 'B', '.'],
]


def rotate_matrix_right(matrix):
    """Rotate matrix 90 degrees clockwise"""
    return [list(row) for row in zip(*matrix[::-1])]


def rotate_matrix_left(matrix):
    """Rotate matrix 90 degrees counter-clockwise"""
    return [list(row) for row in zip(*matrix)][::-1]


def rotate_matrix_180(matrix):
    """Rotate matrix 180 degrees"""
    return [row[::-1] for row in matrix[::-1]]


def get_oriented_matrix(orientation: PlaneOrientation):
    """Get the plane matrix for a specific orientation"""
    if orientation == PlaneOrientation.UP:
        return PLANE_MATRIX_UP
    elif orientation == PlaneOrientation.RIGHT:
        return rotate_matrix_right(PLANE_MATRIX_UP)
    elif orientation == PlaneOrientation.DOWN:
        return rotate_matrix_180(PLANE_MATRIX_UP)
    else:  # LEFT
        return rotate_matrix_left(PLANE_MATRIX_UP)


def get_plane_positions(
    head_x: int, 
    head_y: int, 
    orientation: PlaneOrientation
) -> Tuple[List[Tuple[int, int]], Tuple[int, int]]:
    """
    Calculate all positions for a plane given head position and orientation.
    
    Returns:
        Tuple of (positions_list, head_position)
        - positions_list: All 10 cells (head first, then body cells)
        - head_position: The head coordinate
    """
    matrix = get_oriented_matrix(orientation)

    # Find H (head) inside the matrix
    head_mx = head_my = None
    for my, row in enumerate(matrix):
        for mx, cell in enumerate(row):
            if cell == 'H':
                head_mx, head_my = mx, my
                break
        if head_mx is not None:
            break

    positions = []
    head_position = None

    # Scan matrix and convert to board coordinates
    for my, row in enumerate(matrix):
        for mx, cell in enumerate(row):
            if cell in ('H', 'B'):
                board_x = head_x + (mx - head_mx)
                board_y = head_y + (my - head_my)

                if cell == 'H':
                    head_position = (board_x, board_y)
                else:
                    positions.append((board_x, board_y))

    # Ensure head is first in positions array
    positions.insert(0, head_position)

    return positions, head_position


def is_valid_placement(
    positions: List[Tuple[int, int]], 
    existing_board: List[List[str]],
    board_size: int = 10
) -> Tuple[bool, str]:
    """
    Validate if a plane can be placed at the given positions.
    
    Returns:
        Tuple of (is_valid, error_message)
    """
    for x, y in positions:
        # Check bounds
        if x < 0 or x >= board_size or y < 0 or y >= board_size:
            return False, "Plane out of bounds"
        
        # Check overlap
        if existing_board[y][x] != "empty":
            return False, "Plane overlaps with another plane"
    
    return True, "Valid placement"
