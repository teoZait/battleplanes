import { CellStatus } from '../hooks/UseGameWebSocket';
import './GameBoard.css';

interface GameBoardProps {
  board: CellStatus[][];
  onCellClick: (x: number, y: number) => void;
  isOwnBoard: boolean;
}

const columnLabels = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '10'];
const rowLabels = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J'];

const GameBoard = ({ board, onCellClick, isOwnBoard }: GameBoardProps) => {
  return (
    <div className={`game-board ${!isOwnBoard ? 'enemy' : ''}`}>
      {/* Top-left corner (empty) */}
      <div className="board-row label-row">
        <div className="label-corner"></div>
        {columnLabels.map((colLabel, x) => (
          <div key={`col-${x}`} className="label-cell column-label">
            {colLabel}
          </div>
        ))}
      </div>
      
      {/* Grid rows with row labels */}
      {board.map((row, y) => (
        <div key={y} className="board-row">
          {/* Row label on the left */}
          <div className="label-cell row-label">
            {rowLabels[y]}
          </div>
          {row.map((cell, x) => (
            <div
              key={`${x}-${y}`}
              className={`cell ${cell} ${!isOwnBoard ? 'clickable enemy' : ''}`}
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
