import { useState } from 'react';
import { Ship } from '../App';
import './ShipPlacement.css';

interface ShipPlacementProps {
  onShipsPlaced: (ships: Ship[]) => void;
}

const shipTypes = [
  { type: 'carrier', length: 5, name: 'Carrier' },
  { type: 'battleship', length: 4, name: 'Battleship' },
  { type: 'cruiser', length: 3, name: 'Cruiser' },
  { type: 'submarine', length: 3, name: 'Submarine' },
  { type: 'destroyer', length: 2, name: 'Destroyer' },
];

const ShipPlacement = ({ onShipsPlaced }: ShipPlacementProps) => {
  const [board, setBoard] = useState<string[][]>(
    Array(10).fill(null).map(() => Array(10).fill('empty'))
  );
  const [placedShips, setPlacedShips] = useState<Ship[]>([]);
  const [currentShipIndex, setCurrentShipIndex] = useState(0);
  const [isHorizontal, setIsHorizontal] = useState(true);
  const [hoveredCells, setHoveredCells] = useState<number[][]>([]);

  const currentShip = shipTypes[currentShipIndex];

  const canPlaceShip = (x: number, y: number, length: number, horizontal: boolean): boolean => {
    if (horizontal) {
      if (x + length > 10) return false;
      for (let i = 0; i < length; i++) {
        if (board[y][x + i] !== 'empty') return false;
      }
    } else {
      if (y + length > 10) return false;
      for (let i = 0; i < length; i++) {
        if (board[y + i][x] !== 'empty') return false;
      }
    }
    return true;
  };

  const handleCellHover = (x: number, y: number) => {
    if (!currentShip) return;

    const positions: number[][] = [];
    if (canPlaceShip(x, y, currentShip.length, isHorizontal)) {
      if (isHorizontal) {
        for (let i = 0; i < currentShip.length; i++) {
          positions.push([x + i, y]);
        }
      } else {
        for (let i = 0; i < currentShip.length; i++) {
          positions.push([x, y + i]);
        }
      }
    }
    setHoveredCells(positions);
  };

  const handleCellClick = (x: number, y: number) => {
    if (!currentShip) return;

    if (canPlaceShip(x, y, currentShip.length, isHorizontal)) {
      const positions: number[][] = [];
      const newBoard = board.map(row => [...row]);

      if (isHorizontal) {
        for (let i = 0; i < currentShip.length; i++) {
          newBoard[y][x + i] = 'ship';
          positions.push([x + i, y]);
        }
      } else {
        for (let i = 0; i < currentShip.length; i++) {
          newBoard[y + i][x] = 'ship';
          positions.push([x, y + i]);
        }
      }

      setBoard(newBoard);
      setPlacedShips([...placedShips, {
        type: currentShip.type,
        positions: positions,
      }]);
      setCurrentShipIndex(currentShipIndex + 1);
      setHoveredCells([]);
    }
  };

  const handleConfirm = () => {
    if (placedShips.length === shipTypes.length) {
      onShipsPlaced(placedShips);
    }
  };

  const handleReset = () => {
    setBoard(Array(10).fill(null).map(() => Array(10).fill('empty')));
    setPlacedShips([]);
    setCurrentShipIndex(0);
    setHoveredCells([]);
  };

  const isCellHovered = (x: number, y: number): boolean => {
    return hoveredCells.some(([hx, hy]) => hx === x && hy === y);
  };

  return (
    <div className="ship-placement">
      <div className="placement-info">
        <h2>Place Your Ships</h2>
        {currentShip ? (
          <>
            <p>Place your {currentShip.name} (Length: {currentShip.length})</p>
            <button
              onClick={() => setIsHorizontal(!isHorizontal)}
              className="btn btn-rotate"
            >
              Rotate ({isHorizontal ? 'Horizontal' : 'Vertical'})
            </button>
          </>
        ) : (
          <p>All ships placed!</p>
        )}
      </div>

      <div className="placement-board">
        {board.map((row, y) => (
          <div key={y} className="board-row">
            {row.map((cell, x) => (
              <div
                key={`${x}-${y}`}
                className={`cell ${cell} ${isCellHovered(x, y) ? 'hovered' : ''}`}
                onClick={() => handleCellClick(x, y)}
                onMouseEnter={() => handleCellHover(x, y)}
                onMouseLeave={() => setHoveredCells([])}
              >
                {cell === 'ship' && (
                  <div className="ship-segment">
                    <div className="ship-body"></div>
                    <div className="ship-highlight"></div>
                  </div>
                )}
              </div>
            ))}
          </div>
        ))}
      </div>

      <div className="ship-list">
        <h3>Ships to Place:</h3>
        <ul>
          {shipTypes.map((ship, index) => (
            <li
              key={ship.type}
              className={index < currentShipIndex ? 'placed' : index === currentShipIndex ? 'current' : ''}
            >
              {ship.name} ({ship.length})
              {index < currentShipIndex && ' ✓'}
            </li>
          ))}
        </ul>
      </div>

      <div className="placement-actions">
        <button onClick={handleReset} className="btn btn-secondary">
          Reset
        </button>
        {placedShips.length === shipTypes.length && (
          <button onClick={handleConfirm} className="btn btn-primary">
            Confirm Placement
          </button>
        )}
      </div>
    </div>
  );
};

export default ShipPlacement;
