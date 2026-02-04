/**
 * Plane Matrix Utilities - TypeScript
 * 
 * Matrix-based approach for plane positioning using rotation transformations.
 * This ensures frontend-backend consistency through a single source of truth.
 */

type PlaneCell = 'H' | 'B' | 'X';  // H = Head, B = Body, X = Empty
type PlaneMatrix = PlaneCell[][];
type PlaneOrientation = 'up' | 'down' | 'left' | 'right';

/**
 * Base plane matrix (UP orientation)
 * H = Head (cockpit)
 * B = Body
 * X = Empty space
 */
const PLANE_MATRIX_UP: PlaneMatrix = [
  ['X', 'X', 'H', 'X', 'X'],  // Row 0: Head
  ['B', 'B', 'B', 'B', 'B'],  // Row 1: Wings
  ['X', 'X', 'B', 'X', 'X'],  // Row 2: Body
  ['X', 'B', 'B', 'B', 'X'],  // Row 3: Tail
];

function rotateMatrixRight(matrix: PlaneMatrix): PlaneMatrix {
  const rows = matrix.length;
  const cols = matrix[0].length;
  const result: PlaneMatrix = [];

  for (let x = 0; x < cols; x++) {
    const newRow: PlaneCell[] = [];
    for (let y = rows - 1; y >= 0; y--) {
      newRow.push(matrix[y][x]);
    }
    result.push(newRow);
  }

  return result;
}

function rotateMatrixLeft(matrix: PlaneMatrix): PlaneMatrix {
  const rows = matrix.length;
  const cols = matrix[0].length;
  const result: PlaneMatrix = [];

  for (let x = cols - 1; x >= 0; x--) {
    const newRow: PlaneCell[] = [];
    for (let y = 0; y < rows; y++) {
      newRow.push(matrix[y][x]);
    }
    result.push(newRow);
  }

  return result;
}

function rotateMatrix180(matrix: PlaneMatrix): PlaneMatrix {
  return rotateMatrixRight(rotateMatrixRight(matrix));
}

function getOrientedMatrix(orientation: PlaneOrientation): PlaneMatrix {
  if (orientation === 'up') {
    return PLANE_MATRIX_UP;
  } else if (orientation === 'right') {
    return rotateMatrixRight(PLANE_MATRIX_UP);
  } else if (orientation === 'down') {
    return rotateMatrix180(PLANE_MATRIX_UP);
  } else {  // left
    return rotateMatrixLeft(PLANE_MATRIX_UP);
  }
}

function getPlanePositions(
  headX: number,
  headY: number,
  orientation: PlaneOrientation
): { positions: { x: number; y: number }[]; head: { x: number; y: number } } {
  const matrix = getOrientedMatrix(orientation);
  
  // Find H (head) inside the matrix
  let headMx: number | null = null;
  let headMy: number | null = null;
  
  for (let my = 0; my < matrix.length; my++) {
    for (let mx = 0; mx < matrix[my].length; mx++) {
      if (matrix[my][mx] === 'H') {
        headMx = mx;
        headMy = my;
        break;
      }
    }
    if (headMx !== null) break;
  }
  
  if (headMx === null || headMy === null) {
    throw new Error('Head not found in matrix');
  }
  
  const positions: { x: number; y: number }[] = [];
  let headPosition: { x: number; y: number } | null = null;
  
  // Scan matrix and convert to board coordinates
  for (let my = 0; my < matrix.length; my++) {
    for (let mx = 0; mx < matrix[my].length; mx++) {
      const cell = matrix[my][mx];
      
      if (cell === 'H' || cell === 'B') {
        const boardX = headX + (mx - headMx);
        const boardY = headY + (my - headMy);
        
        if (cell === 'H') {
          headPosition = { x: boardX, y: boardY };
        } else {
          positions.push({ x: boardX, y: boardY });
        }
      }
    }
  }
  
  if (!headPosition) {
    throw new Error('Head position not found');
  }
  
  // Ensure head is first in positions array
  positions.unshift(headPosition);
  
  return {
    positions,
    head: headPosition
  };
}

// Export functions
export {
  rotateMatrixRight,
  rotateMatrixLeft,
  rotateMatrix180,
  getOrientedMatrix,
  getPlanePositions,
  PLANE_MATRIX_UP
};

export type {
  PlaneCell,
  PlaneMatrix,
  PlaneOrientation
};
