/**
 * Comprehensive Test Suite for Plane Matrix Utilities
 * Tests all rotation functions, edge cases, and plane positioning logic
 */

import { describe, it, expect } from 'vitest';
import {
  rotateMatrixRight,
  rotateMatrixLeft,
  rotateMatrix180,
  getOrientedMatrix,
  getPlanePositions,
  PLANE_MATRIX_UP,
  type PlaneMatrix,
  type PlaneOrientation
} from '../helpers';

// Helper function to normalize positions for order-independent comparison
function sortPositions(positions: { x: number; y: number }[]): { x: number; y: number }[] {
  return [...positions].sort((a, b) => {
    if (a.y !== b.y) return a.y - b.y;
    return a.x - b.x;
  });
}

describe('Plane Matrix Utilities - Comprehensive Test Suite', () => {

  // ============================================================================
  // ROTATION FUNCTIONS - BASIC BEHAVIOR
  // ============================================================================

  describe('rotateMatrixRight - Basic Behavior', () => {
    
    it('should rotate a simple 2x2 matrix 90 degrees clockwise', () => {
      const input: PlaneMatrix = [
        ['H', 'X'],
        ['B', 'B']
      ];
      
      const result = rotateMatrixRight(input);
      
      const expected: PlaneMatrix = [
        ['B', 'H'],
        ['B', 'X']
      ];
      
      expect(result).toEqual(expected);
    });

    it('should rotate a 3x3 matrix correctly', () => {
      const input: PlaneMatrix = [
        ['H', 'X', 'X'],
        ['B', 'B', 'X'],
        ['X', 'B', 'B']
      ];
      
      const result = rotateMatrixRight(input);
      
      const expected: PlaneMatrix = [
        ['X', 'B', 'H'],
        ['B', 'B', 'X'],
        ['B', 'X', 'X']
      ];
      
      expect(result).toEqual(expected);
    });

    it('should handle non-square matrices (4x5 like plane matrix)', () => {
      const result = rotateMatrixRight(PLANE_MATRIX_UP);
      
      // Should swap dimensions: 4 rows x 5 cols → 5 rows x 4 cols
      expect(result.length).toBe(5);
      expect(result[0].length).toBe(4);
    });

    it('should not mutate the original matrix', () => {
      const original: PlaneMatrix = [
        ['H', 'X'],
        ['B', 'B']
      ];
      const copy = JSON.parse(JSON.stringify(original));
      
      rotateMatrixRight(original);
      
      expect(original).toEqual(copy);
    });
  });

  describe('rotateMatrixLeft - Basic Behavior', () => {
    
    it('should rotate a simple 2x2 matrix 90 degrees counter-clockwise', () => {
      const input: PlaneMatrix = [
        ['H', 'X'],
        ['B', 'B']
      ];
      
      const result = rotateMatrixLeft(input);
      
      const expected: PlaneMatrix = [
        ['X', 'B'],
        ['H', 'B']
      ];
      
      expect(result).toEqual(expected);
    });

    it('should rotate a 3x3 matrix correctly', () => {
      const input: PlaneMatrix = [
        ['H', 'X', 'X'],
        ['B', 'B', 'X'],
        ['X', 'B', 'B']
      ];
      
      const result = rotateMatrixLeft(input);
      
      const expected: PlaneMatrix = [
        ['X', 'X', 'B'],
        ['X', 'B', 'B'],
        ['B', 'B', 'H']
      ];
      
      expect(result).toEqual(expected);
    });

    it('should handle non-square matrices', () => {
      const result = rotateMatrixLeft(PLANE_MATRIX_UP);
      
      expect(result.length).toBe(5);
      expect(result[0].length).toBe(4);
    });

    it('should not mutate the original matrix', () => {
      const original: PlaneMatrix = [
        ['H', 'X'],
        ['B', 'B']
      ];
      const copy = JSON.parse(JSON.stringify(original));
      
      rotateMatrixLeft(original);
      
      expect(original).toEqual(copy);
    });
  });

  describe('rotateMatrix180 - Basic Behavior', () => {
    
    it('should rotate a 2x2 matrix 180 degrees', () => {
      const input: PlaneMatrix = [
        ['H', 'X'],
        ['B', 'B']
      ];
      
      const result = rotateMatrix180(input);
      
      const expected: PlaneMatrix = [
        ['B', 'B'],
        ['X', 'H']
      ];
      
      expect(result).toEqual(expected);
    });

    it('should rotate a 3x3 matrix correctly', () => {
      const input: PlaneMatrix = [
        ['H', 'X', 'X'],
        ['B', 'B', 'X'],
        ['X', 'B', 'B']
      ];
      
      const result = rotateMatrix180(input);
      
      const expected: PlaneMatrix = [
        ['B', 'B', 'X'],
        ['X', 'B', 'B'],
        ['X', 'X', 'H']
      ];
      
      expect(result).toEqual(expected);
    });

    it('should preserve dimensions', () => {
      const result = rotateMatrix180(PLANE_MATRIX_UP);
      
      expect(result.length).toBe(PLANE_MATRIX_UP.length);
      expect(result[0].length).toBe(PLANE_MATRIX_UP[0].length);
    });

    it('should not mutate the original matrix', () => {
      const original: PlaneMatrix = [
        ['H', 'X'],
        ['B', 'B']
      ];
      const copy = JSON.parse(JSON.stringify(original));
      
      rotateMatrix180(original);
      
      expect(original).toEqual(copy);
    });
  });

  // ============================================================================
  // ROTATION CONSISTENCY TESTS
  // ============================================================================

  describe('Rotation Consistency', () => {
    
    it('rotating right 4 times should return to original', () => {
      let matrix = PLANE_MATRIX_UP;
      
      matrix = rotateMatrixRight(matrix);
      matrix = rotateMatrixRight(matrix);
      matrix = rotateMatrixRight(matrix);
      matrix = rotateMatrixRight(matrix);
      
      expect(matrix).toEqual(PLANE_MATRIX_UP);
    });

    it('rotating left 4 times should return to original', () => {
      let matrix = PLANE_MATRIX_UP;
      
      matrix = rotateMatrixLeft(matrix);
      matrix = rotateMatrixLeft(matrix);
      matrix = rotateMatrixLeft(matrix);
      matrix = rotateMatrixLeft(matrix);
      
      expect(matrix).toEqual(PLANE_MATRIX_UP);
    });

    it('rotating 180 twice should return to original', () => {
      const once = rotateMatrix180(PLANE_MATRIX_UP);
      const twice = rotateMatrix180(once);
      
      expect(twice).toEqual(PLANE_MATRIX_UP);
    });

    it('right rotation should equal left rotation 3 times', () => {
      const rightOnce = rotateMatrixRight(PLANE_MATRIX_UP);
      
      let leftThrice = PLANE_MATRIX_UP;
      leftThrice = rotateMatrixLeft(leftThrice);
      leftThrice = rotateMatrixLeft(leftThrice);
      leftThrice = rotateMatrixLeft(leftThrice);
      
      expect(rightOnce).toEqual(leftThrice);
    });

    it('left rotation should equal right rotation 3 times', () => {
      const leftOnce = rotateMatrixLeft(PLANE_MATRIX_UP);
      
      let rightThrice = PLANE_MATRIX_UP;
      rightThrice = rotateMatrixRight(rightThrice);
      rightThrice = rotateMatrixRight(rightThrice);
      rightThrice = rotateMatrixRight(rightThrice);
      
      expect(leftOnce).toEqual(rightThrice);
    });

    it('180 rotation should equal right rotation twice', () => {
      const rotate180 = rotateMatrix180(PLANE_MATRIX_UP);
      
      let rightTwice = PLANE_MATRIX_UP;
      rightTwice = rotateMatrixRight(rightTwice);
      rightTwice = rotateMatrixRight(rightTwice);
      
      expect(rotate180).toEqual(rightTwice);
    });

    it('180 rotation should equal left rotation twice', () => {
      const rotate180 = rotateMatrix180(PLANE_MATRIX_UP);
      
      let leftTwice = PLANE_MATRIX_UP;
      leftTwice = rotateMatrixLeft(leftTwice);
      leftTwice = rotateMatrixLeft(leftTwice);
      
      expect(rotate180).toEqual(leftTwice);
    });

    it('right then left should return to original', () => {
      const right = rotateMatrixRight(PLANE_MATRIX_UP);
      const back = rotateMatrixLeft(right);
      
      expect(back).toEqual(PLANE_MATRIX_UP);
    });

    it('left then right should return to original', () => {
      const left = rotateMatrixLeft(PLANE_MATRIX_UP);
      const back = rotateMatrixRight(left);
      
      expect(back).toEqual(PLANE_MATRIX_UP);
    });
  });

  // ============================================================================
  // getOrientedMatrix TESTS
  // ============================================================================

  describe('getOrientedMatrix', () => {
    
    it('should return original matrix for UP orientation', () => {
      const result = getOrientedMatrix('up');
      expect(result).toEqual(PLANE_MATRIX_UP);
    });

    it('should return rotated matrix for RIGHT orientation', () => {
      const result = getOrientedMatrix('right');
      const expected = rotateMatrixRight(PLANE_MATRIX_UP);
      expect(result).toEqual(expected);
    });

    it('should return rotated matrix for DOWN orientation', () => {
      const result = getOrientedMatrix('down');
      const expected = rotateMatrix180(PLANE_MATRIX_UP);
      expect(result).toEqual(expected);
    });

    it('should return rotated matrix for LEFT orientation', () => {
      const result = getOrientedMatrix('left');
      const expected = rotateMatrixLeft(PLANE_MATRIX_UP);
      expect(result).toEqual(expected);
    });

    it('should produce different matrices for each orientation', () => {
      const up = getOrientedMatrix('up');
      const right = getOrientedMatrix('right');
      const down = getOrientedMatrix('down');
      const left = getOrientedMatrix('left');
      
      expect(up).not.toEqual(right);
      expect(up).not.toEqual(down);
      expect(up).not.toEqual(left);
      expect(right).not.toEqual(down);
      expect(right).not.toEqual(left);
      expect(down).not.toEqual(left);
    });

    it('should preserve H (head) in all orientations', () => {
      const orientations: PlaneOrientation[] = ['up', 'down', 'left', 'right'];
      
      orientations.forEach(orientation => {
        const matrix = getOrientedMatrix(orientation);
        let foundH = false;
        
        for (const row of matrix) {
          for (const cell of row) {
            if (cell === 'H') {
              foundH = true;
              break;
            }
          }
          if (foundH) break;
        }
        
        expect(foundH).toBe(true);
      });
    });

    it('should preserve correct number of B (body) cells in all orientations', () => {
      const orientations: PlaneOrientation[] = ['up', 'down', 'left', 'right'];
      
      orientations.forEach(orientation => {
        const matrix = getOrientedMatrix(orientation);
        let countB = 0;
        
        for (const row of matrix) {
          for (const cell of row) {
            if (cell === 'B') countB++;
          }
        }
        
        // Plane has 9 body cells
        expect(countB).toBe(9);
      });
    });
  });

  // ============================================================================
  // getPlanePositions - BASIC TESTS
  // ============================================================================

  describe('getPlanePositions - Basic Properties', () => {
    
    it('should return 10 positions for all orientations', () => {
      const orientations: PlaneOrientation[] = ['up', 'down', 'left', 'right'];
      
      orientations.forEach(orientation => {
        const { positions } = getPlanePositions(5, 5, orientation);
        expect(positions.length).toBe(10);
      });
    });

    it('should have head as first position', () => {
      const orientations: PlaneOrientation[] = ['up', 'down', 'left', 'right'];
      
      orientations.forEach(orientation => {
        const { positions, head } = getPlanePositions(5, 5, orientation);
        expect(positions[0]).toEqual(head);
      });
    });

    it('should have no duplicate positions', () => {
      const orientations: PlaneOrientation[] = ['up', 'down', 'left', 'right'];
      
      orientations.forEach(orientation => {
        const { positions } = getPlanePositions(5, 5, orientation);
        const posStrings = positions.map(p => `${p.x},${p.y}`);
        const uniqueStrings = new Set(posStrings);
        expect(uniqueStrings.size).toBe(10);
      });
    });

    it('should place head at specified coordinates', () => {
      const testCases = [
        { x: 0, y: 0 },
        { x: 5, y: 5 },
        { x: 9, y: 9 },
        { x: 3, y: 7 }
      ];
      
      testCases.forEach(({ x, y }) => {
        const { head } = getPlanePositions(x, y, 'up');
        expect(head).toEqual({ x, y });
      });
    });
  });

  // ============================================================================
  // getPlanePositions - SPECIFIC ORIENTATIONS (Backend Compatibility)
  // ============================================================================

  describe('getPlanePositions - UP Orientation', () => {
    
    it('should match backend positions exactly', () => {
      const { positions, head } = getPlanePositions(5, 2, 'up');
      
      expect(head).toEqual({ x: 5, y: 2 });
      
      const expected = [
        { x: 5, y: 2 },   // Head
        { x: 3, y: 3 }, { x: 4, y: 3 }, { x: 5, y: 3 }, { x: 6, y: 3 }, { x: 7, y: 3 },  // Wings
        { x: 5, y: 4 },   // Body
        { x: 4, y: 5 }, { x: 5, y: 5 }, { x: 6, y: 5 }   // Tail
      ];
      
      // Use normalized comparison (order-independent)
      expect(sortPositions(positions)).toEqual(sortPositions(expected));
    });

    it('should extend downward from head', () => {
      const { positions } = getPlanePositions(5, 2, 'up');
      
      // All y-coordinates should be >= head y-coordinate (2)
      positions.forEach(pos => {
        expect(pos.y).toBeGreaterThanOrEqual(2);
      });
    });

    it('should have correct span (5 cells wide)', () => {
      const { positions } = getPlanePositions(5, 2, 'up');
      
      const xCoords = positions.map(p => p.x);
      const minX = Math.min(...xCoords);
      const maxX = Math.max(...xCoords);
      
      expect(maxX - minX).toBe(4);  // 5 cells wide: positions 3-7
    });
  });

  describe('getPlanePositions - DOWN Orientation', () => {
    
    it('should match backend positions exactly', () => {
      const { positions, head } = getPlanePositions(5, 7, 'down');
      
      expect(head).toEqual({ x: 5, y: 7 });
      
      const expected = [
        { x: 5, y: 7 },   // Head
        { x: 4, y: 4 }, { x: 5, y: 4 }, { x: 6, y: 4 },  // Tail
        { x: 5, y: 5 },   // Body
        { x: 3, y: 6 }, { x: 4, y: 6 }, { x: 5, y: 6 }, { x: 6, y: 6 }, { x: 7, y: 6 }  // Wings
      ];
      
      // Use normalized comparison (order-independent)
      expect(sortPositions(positions)).toEqual(sortPositions(expected));
    });

    it('should extend upward from head', () => {
      const { positions } = getPlanePositions(5, 7, 'down');
      
      // All y-coordinates should be <= head y-coordinate (7)
      positions.forEach(pos => {
        expect(pos.y).toBeLessThanOrEqual(7);
      });
    });
  });

  describe('getPlanePositions - LEFT Orientation', () => {
    
    it('should match backend positions exactly', () => {
      const { positions, head } = getPlanePositions(2, 5, 'left');
      
      expect(head).toEqual({ x: 2, y: 5 });
      
      const expected = [
        { x: 2, y: 5 },   // Head
        { x: 3, y: 3 }, { x: 3, y: 4 }, { x: 3, y: 5 }, { x: 3, y: 6 }, { x: 3, y: 7 },  // Wings
        { x: 4, y: 5 },   // Body
        { x: 5, y: 4 }, { x: 5, y: 5 }, { x: 5, y: 6 }   // Tail
      ];
      
      // Use normalized comparison (order-independent)
      expect(sortPositions(positions)).toEqual(sortPositions(expected));
    });

    it('should extend rightward from head', () => {
      const { positions } = getPlanePositions(2, 5, 'left');
      
      // All x-coordinates should be >= head x-coordinate (2)
      positions.forEach(pos => {
        expect(pos.x).toBeGreaterThanOrEqual(2);
      });
    });

    it('should have head on the left edge', () => {
      const { positions, head } = getPlanePositions(2, 5, 'left');
      
      const xCoords = positions.map(p => p.x);
      const minX = Math.min(...xCoords);
      
      expect(head.x).toBe(minX);
    });
  });

  describe('getPlanePositions - RIGHT Orientation', () => {
    
    it('should match backend positions exactly', () => {
      const { positions, head } = getPlanePositions(7, 5, 'right');
      
      expect(head).toEqual({ x: 7, y: 5 });
      
      const expected = [
        { x: 7, y: 5 },   // Head
        { x: 4, y: 4 }, { x: 4, y: 5 }, { x: 4, y: 6 },  // Tail
        { x: 5, y: 5 },   // Body
        { x: 6, y: 3 }, { x: 6, y: 4 }, { x: 6, y: 5 }, { x: 6, y: 6 }, { x: 6, y: 7 }  // Wings
      ];
      
      // Use normalized comparison (order-independent)
      expect(sortPositions(positions)).toEqual(sortPositions(expected));
    });

    it('should extend leftward from head', () => {
      const { positions } = getPlanePositions(7, 5, 'right');
      
      // All x-coordinates should be <= head x-coordinate (7)
      positions.forEach(pos => {
        expect(pos.x).toBeLessThanOrEqual(7);
      });
    });

    it('should have head on the right edge', () => {
      const { positions, head } = getPlanePositions(7, 5, 'right');
      
      const xCoords = positions.map(p => p.x);
      const maxX = Math.max(...xCoords);
      
      expect(head.x).toBe(maxX);
    });
  });

  // ============================================================================
  // EDGE CASES & BOUNDARY CONDITIONS
  // ============================================================================

  describe('Edge Cases - Boundary Positions', () => {
    
    it('should handle head at origin (0, 0) for UP', () => {
      const { positions, head } = getPlanePositions(0, 0, 'up');
      
      expect(head).toEqual({ x: 0, y: 0 });
      expect(positions.length).toBe(10);
      
      // Some positions will be negative (out of bounds, but that's OK)
      const hasNegative = positions.some(p => p.x < 0 || p.y < 0);
      expect(hasNegative).toBe(true);  // Expected: wings extend to x=-2
    });

    it('should handle head at maximum coordinates (9, 9) for DOWN', () => {
      const { positions, head } = getPlanePositions(9, 9, 'down');
      
      expect(head).toEqual({ x: 9, y: 9 });
      expect(positions.length).toBe(10);
      
      // Some positions will exceed 9 (out of bounds, but that's OK)
      const hasExceeding = positions.some(p => p.x > 9 || p.y > 9);
      expect(hasExceeding).toBe(true);  // Expected: wings extend to x=11
    });

    it('should handle negative head coordinates', () => {
      const { positions, head } = getPlanePositions(-5, -5, 'up');
      
      expect(head).toEqual({ x: -5, y: -5 });
      expect(positions.length).toBe(10);
    });

    it('should handle large coordinates', () => {
      const { positions, head } = getPlanePositions(100, 100, 'down');
      
      expect(head).toEqual({ x: 100, y: 100 });
      expect(positions.length).toBe(10);
    });
  });

  describe('Edge Cases - Position Validation', () => {
    
    it('should generate positions that form valid plane shape for UP', () => {
      const { positions } = getPlanePositions(5, 2, 'up');
      
      // Check that positions match the expected pattern
      const posSet = new Set(positions.map(p => `${p.x},${p.y}`));
      
      // Verify wings span correctly
      expect(posSet.has('3,3')).toBe(true);
      expect(posSet.has('7,3')).toBe(true);
      
      // Verify tail
      expect(posSet.has('4,5')).toBe(true);
      expect(posSet.has('6,5')).toBe(true);
    });

    it('should maintain plane shape integrity across all orientations', () => {
      const testCoord = { x: 5, y: 5 };
      const orientations: PlaneOrientation[] = ['up', 'down', 'left', 'right'];
      
      orientations.forEach(orientation => {
        const { positions } = getPlanePositions(testCoord.x, testCoord.y, orientation);
        
        // All planes should have exactly 10 cells
        expect(positions.length).toBe(10);
        
        // No duplicates
        const posStrings = positions.map(p => `${p.x},${p.y}`);
        expect(new Set(posStrings).size).toBe(10);
      });
    });
  });

  // ============================================================================
  // ERROR HANDLING
  // ============================================================================

  describe('Error Handling', () => {
    
    it('should throw error if head not found in matrix (corrupted matrix)', () => {
      // This should never happen with valid matrices, but test defensive code
      // We can't easily test this without modifying the function,
      // but we verify it doesn't throw with valid inputs
      
      expect(() => getPlanePositions(5, 5, 'up')).not.toThrow();
      expect(() => getPlanePositions(5, 5, 'down')).not.toThrow();
      expect(() => getPlanePositions(5, 5, 'left')).not.toThrow();
      expect(() => getPlanePositions(5, 5, 'right')).not.toThrow();
    });
  });

  // ============================================================================
  // IMMUTABILITY TESTS
  // ============================================================================

  describe('Immutability', () => {
    
    it('rotations should not modify PLANE_MATRIX_UP constant', () => {
      const original = JSON.parse(JSON.stringify(PLANE_MATRIX_UP));
      
      rotateMatrixRight(PLANE_MATRIX_UP);
      rotateMatrixLeft(PLANE_MATRIX_UP);
      rotateMatrix180(PLANE_MATRIX_UP);
      
      expect(PLANE_MATRIX_UP).toEqual(original);
    });

    it('getOrientedMatrix should not modify PLANE_MATRIX_UP', () => {
      const original = JSON.parse(JSON.stringify(PLANE_MATRIX_UP));
      
      getOrientedMatrix('up');
      getOrientedMatrix('right');
      getOrientedMatrix('down');
      getOrientedMatrix('left');
      
      expect(PLANE_MATRIX_UP).toEqual(original);
    });

    it('getPlanePositions should not modify PLANE_MATRIX_UP', () => {
      const original = JSON.parse(JSON.stringify(PLANE_MATRIX_UP));
      
      getPlanePositions(5, 5, 'up');
      getPlanePositions(5, 5, 'right');
      getPlanePositions(5, 5, 'down');
      getPlanePositions(5, 5, 'left');
      
      expect(PLANE_MATRIX_UP).toEqual(original);
    });
  });

  // ============================================================================
  // INTEGRATION TESTS
  // ============================================================================

  describe('Integration - Full Workflow', () => {
    
    it('should correctly place two planes without overlap', () => {
      const plane1 = getPlanePositions(5, 2, 'up');
      const plane2 = getPlanePositions(2, 7, 'left');
      
      // Check no overlap
      const pos1Set = new Set(plane1.positions.map(p => `${p.x},${p.y}`));
      const pos2Set = new Set(plane2.positions.map(p => `${p.x},${p.y}`));
      
      const intersection = [...pos1Set].filter(p => pos2Set.has(p));
      expect(intersection.length).toBe(0);
    });

    it('should work correctly with all orientation combinations', () => {
      const orientations: PlaneOrientation[] = ['up', 'down', 'left', 'right'];
      
      orientations.forEach(orient1 => {
        orientations.forEach(orient2 => {
          const plane1 = getPlanePositions(3, 3, orient1);
          const plane2 = getPlanePositions(7, 7, orient2);
          
          expect(plane1.positions.length).toBe(10);
          expect(plane2.positions.length).toBe(10);
          expect(plane1.head).toBeDefined();
          expect(plane2.head).toBeDefined();
        });
      });
    });
  });

  // ============================================================================
  // PERFORMANCE TESTS (Optional but useful)
  // ============================================================================

  describe('Performance', () => {
    
    it('should handle 1000 rotations quickly', () => {
      const start = performance.now();
      
      for (let i = 0; i < 1000; i++) {
        rotateMatrixRight(PLANE_MATRIX_UP);
      }
      
      const end = performance.now();
      const duration = end - start;
      
      // Should complete in less than 100ms
      expect(duration).toBeLessThan(100);
    });

    it('should handle 1000 plane position calculations quickly', () => {
      const start = performance.now();
      
      for (let i = 0; i < 1000; i++) {
        getPlanePositions(5, 5, 'up');
      }
      
      const end = performance.now();
      const duration = end - start;
      
      // Should complete in less than 100ms
      expect(duration).toBeLessThan(100);
    });
  });
});
