import { CellStatus } from '../hooks/UseGameWebSocket';
import './GameBoard.css';

interface GameBoardProps {
  board: CellStatus[][];
  onCellClick: (x: number, y: number) => void;
  isOwnBoard: boolean;
}

const GameBoard = ({ board, onCellClick, isOwnBoard }: GameBoardProps) => {
  return (
    <div className="game-board">
      {board.map((row, y) => (
        <div key={y} className="board-row">
          {row.map((cell, x) => (
            <div
              key={`${x}-${y}`}
              className={`cell ${cell} ${!isOwnBoard ? 'clickable' : ''}`}
              onClick={() => onCellClick(x, y)}
            >
              {cell === 'ship' && isOwnBoard && (
                <div className="ship-segment">
                  <div className="ship-body"></div>
                  <div className="ship-highlight"></div>
                </div>
              )}
              {cell === 'hit' && (
                <>
                  {isOwnBoard && (
                    <div className="ship-segment">
                      <div className="ship-body"></div>
                      <div className="ship-highlight"></div>
                    </div>
                  )}
                  <div className="hit-marker">
                    <div className="explosion"></div>
                    <div className="fire">🔥</div>
                  </div>
                </>
              )}
              {cell === 'miss' && (
                <div className="miss-marker">
                  <div className="splash"></div>
                  💧
                </div>
              )}
            </div>
          ))}
        </div>
      ))}
    </div>
  );
};

export default GameBoard;