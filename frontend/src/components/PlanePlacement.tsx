import { useState } from 'react';
import './PlanePlacement.css';

interface Plane {
  head_x: number;
  head_y: number;
  orientation: 'up' | 'down' | 'left' | 'right';
}

interface PlanePlacementProps {
  onPlanesPlaced: (planes: Plane[]) => void;
}

const BASE_PLANE_SHAPE: [number, number][] = [
  [0, 0], // head
  [-2, 1], [-1, 1], [0, 1], [1, 1], [2, 1],
  [0, 2],
  [-1, 3], [0, 3], [1, 3],
];

function rotate(dx: number, dy: number, orientation: string): [number, number] {
  switch (orientation) {
    case 'up':
      return [dx, dy];
    case 'right':
      return [dy, -dx];
    case 'down':
      return [-dx, -dy];
    case 'left':
      return [-dy, dx];
    default:
      return [dx, dy];
  }
}

function getPlanePositions(headX: number, headY: number, orientation: string) {
  return BASE_PLANE_SHAPE.map(([dx, dy]) => {
    const [rdx, rdy] = rotate(dx, dy, orientation);
    return { x: headX + rdx, y: headY + rdy };
  });
}


type CellStatus = 'empty' | 'plane' | 'head' | 'hover' | 'invalid';

const PlanePlacement = ({ onPlanesPlaced }: PlanePlacementProps) => {
  const [board, setBoard] = useState<CellStatus[][]>(
    Array(10).fill(null).map(() => Array(10).fill('empty'))
  );
  const [placedPlanes, setPlacedPlanes] = useState<Plane[]>([]);
  const [orientation, setOrientation] = useState<'up' | 'down' | 'left' | 'right'>('up');
  const [hoveredCells, setHoveredCells] = useState<{ x: number; y: number; isValid: boolean }[]>([]);

  const previewPlane = async (head_x: number, head_y: number) => {
    const planePositions = getPlanePositions(head_x, head_y, orientation);
    const isValid = planePositions.every((pos: any) =>
      pos.x >= 0 &&
      pos.x < 10 &&
      pos.y >= 0 &&
      pos.y < 10 &&
      board[pos.y][pos.x] === 'empty'
    );
    
    setHoveredCells(
      planePositions.map((pos: { x: number; y: number }) => ({
        x: pos.x,
        y: pos.y,
        isValid,
      }))
    );
  };

  const handleCellClick = (x: number, y: number) => {
    if (placedPlanes.length >= 2) return;

    const invalidCells = hoveredCells.filter((cell: { isValid: boolean }) => !cell.isValid);
    if (invalidCells.length > 0) {
      return;
    }

    const positions = hoveredCells.map((cell: { x: number; y: number }) => ({ x: cell.x, y: cell.y }));
    const newBoard = board.map((row: CellStatus[]) => [...row]);

    positions.forEach((pos: { x: number; y: number }, index: number) => {
      if (index === 0) {
        newBoard[pos.y][pos.x] = 'head';
      } else {
        newBoard[pos.y][pos.x] = 'plane';
      }
    });

    setBoard(newBoard);
    setPlacedPlanes([...placedPlanes, {
      head_x: x,
      head_y: y,
      orientation: orientation
    }]);
    setHoveredCells([]);
  };

  const handleConfirm = () => {
    if (placedPlanes.length === 2) {
      onPlanesPlaced(placedPlanes);
    }
  };

  const handleReset = () => {
    setBoard(Array(10).fill(null).map(() => Array(10).fill('empty')));
    setPlacedPlanes([]);
    setHoveredCells([]);
  };

  const rotateOrientation = () => {
    const orientations: ('up' | 'down' | 'left' | 'right')[] = ['up', 'right', 'down', 'left'];
    const currentIndex = orientations.indexOf(orientation);
    setOrientation(orientations[(currentIndex + 1) % 4]);
  };

  const isCellHovered = (x: number, y: number): { isHovered: boolean; isValid: boolean; isHead: boolean } => {
    const hoveredIndex = hoveredCells.findIndex((cell: { x: number; y: number }) => cell.x === x && cell.y === y);
    return {
      isHovered: hoveredIndex !== -1,
      isValid: hoveredIndex !== -1 ? hoveredCells[hoveredIndex].isValid : false,
      isHead: hoveredIndex === 0 // First position is always the head
    };
  };

  return (
    <div className="plane-placement">
      <div className="placement-info">
        <h2>Place Your Planes</h2>
        <p>Place {2 - placedPlanes.length} more plane{placedPlanes.length === 1 ? '' : 's'}</p>
        <p className="instruction">Hover to preview, click the head position to place</p>
        <button
          onClick={rotateOrientation}
          className="btn btn-rotate"
        >
          Rotate: {orientation.toUpperCase()} ↻
        </button>
      </div>

      <div className="placement-board">
        {board.map((row, y) => (
          <div key={y} className="board-row">
            {row.map((cell, x) => {
              const { isHovered, isValid, isHead } = isCellHovered(x, y);
              return (
                <div
                  key={`${x}-${y}`}
                  className={`cell ${cell} ${isHovered ? (isValid ? 'hovered-valid' : 'hovered-invalid') : ''}`}
                  onClick={() => handleCellClick(x, y)}
                  onMouseEnter={() => previewPlane(x, y)}
                  onMouseLeave={() => setHoveredCells([])}
                >
                  {/* Show already placed planes */}
                  {cell === 'plane' && (
                    <div className="plane-segment">
                      <div className="plane-body"></div>
                    </div>
                  )}
                  {cell === 'head' && (
                    <div className="plane-segment head">
                      <div className="plane-body"></div>
                      <div className="cockpit">✈️</div>
                    </div>
                  )}
                  
                  {/* Show hover preview */}
                  {isHovered && cell === 'empty' && (
                    <div className={`plane-preview ${isValid ? 'valid' : 'invalid'}`}>
                      {isHead ? (
                        <div className="preview-head">
                          <div className="preview-body"></div>
                          <div className="preview-cockpit">✈️</div>
                        </div>
                      ) : (
                        <div className="preview-segment">
                          <div className="preview-body"></div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        ))}
      </div>

      <div className="plane-list">
        <h3>Planes to Place:</h3>
        <ul>
          <li className={placedPlanes.length > 0 ? 'placed' : placedPlanes.length === 0 ? 'current' : ''}>
            Plane 1 {placedPlanes.length > 0 && '✓'}
          </li>
          <li className={placedPlanes.length === 2 ? 'placed' : placedPlanes.length === 1 ? 'current' : ''}>
            Plane 2 {placedPlanes.length === 2 && '✓'}
          </li>
        </ul>
        <div className="plane-info">
          <p>💡 Tip: Hit the cockpit (✈️) to destroy a plane!</p>
        </div>
      </div>

      <div className="placement-actions">
        <button onClick={handleReset} className="btn btn-secondary">
          Reset
        </button>
        {placedPlanes.length === 2 && (
          <button onClick={handleConfirm} className="btn btn-primary">
            Confirm Placement
          </button>
        )}
      </div>
    </div>
  );
};

export default PlanePlacement;