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
              {(cell === 'plane' as CellStatus) && isOwnBoard && (
                <div className="plane-segment">
                  <div className="plane-body"></div>
                </div>
              )}
              {(cell === 'head' as CellStatus) && isOwnBoard && (
                <div className="plane-segment head">
                  <div className="plane-body"></div>
                  <div className="cockpit">✈️</div>
                </div>
              )}
              {(cell === 'hit' as CellStatus) && (
                <>
                  {isOwnBoard && (
                    <div className="plane-segment">
                      <div className="plane-body"></div>
                    </div>
                  )}
                  <div className="hit-marker">
                    <div className="explosion"></div>
                    <div className="fire">🔥</div>
                  </div>
                </>
              )}
              {(cell === 'head_hit' as CellStatus) && (
                <>
                  {isOwnBoard && (
                    <div className="plane-segment head">
                      <div className="plane-body"></div>
                    </div>
                  )}
                  <div className="hit-marker">
                    <div className="explosion big"></div>
                    <div className="fire big">💥</div>
                  </div>
                </>
              )}
              {(cell === 'miss' as CellStatus) && (
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