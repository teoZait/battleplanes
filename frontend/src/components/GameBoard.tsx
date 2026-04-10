import { CellStatus } from '../hooks/UseGameWebSocket';
import './GameBoard.css';

interface GameBoardProps {
  board: CellStatus[][];
  onCellClick: (x: number, y: number) => void;
  isOwnBoard: boolean;
  isMyTurn?: boolean;
  gameFinished?: boolean;
}

const columnLabels = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '10'];
const rowLabels = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J'];

const GameBoard = ({ board, onCellClick, isOwnBoard, isMyTurn, gameFinished }: GameBoardProps) => {
  const isActive = !isOwnBoard && isMyTurn;
  const isDimmed = !isOwnBoard && isMyTurn === false;
  const showPlanes = isOwnBoard || gameFinished;

  return (
    <div className={`game-board ${!isOwnBoard ? 'enemy' : ''} ${isActive ? 'active-turn' : ''} ${isDimmed ? 'dimmed' : ''}`}>
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
              className={`cell ${cell} ${!isOwnBoard ? 'clickable enemy' : ''} ${isDimmed ? 'disabled' : ''}`}
              onClick={() => onCellClick(x, y)}
            >
              {(cell === 'plane' as CellStatus) && showPlanes && (
                <div className="plane-segment">
                  <div className="plane-body"></div>
                </div>
              )}
              {(cell === 'head' as CellStatus) && showPlanes && (
                <div className="plane-segment head">
                  <div className="plane-body"></div>
                  <div className="cockpit"></div>
                </div>
              )}
              {(cell === 'hit' as CellStatus) && (
                <>
                  {showPlanes && (
                    <div className="plane-segment">
                      <div className="plane-body"></div>
                    </div>
                  )}
                  <div className="hit-marker">
                    <div className="explosion"></div>
                    <div className="shockwave-ring small"></div>
                    <div className="fire">🔥</div>
                  </div>
                  <div className="hit-particles">
                    {[0,1,2,3,4,5,6,7].map(i => (
                      <div key={i} className={`particle particle-${i}`} />
                    ))}
                  </div>
                </>
              )}
              {(cell === 'head_hit' as CellStatus) && (
                <>
                  {showPlanes && (
                    <div className="plane-segment head">
                      <div className="plane-body"></div>
                    </div>
                  )}
                  <div className="hit-marker">
                    <div className="explosion big"></div>
                    <div className="shockwave-ring"></div>
                    <div className="fire big">💥</div>
                  </div>
                  <div className="hit-particles big">
                    {[0,1,2,3,4,5,6,7,8,9,10,11].map(i => (
                      <div key={i} className={`particle particle-${i}`} />
                    ))}
                  </div>
                </>
              )}
              {(cell === 'miss' as CellStatus) && (
                <div className="miss-marker">
                  <div className="splash"></div>
                  <div className="water-ripples">
                    <div className="ripple ripple-1" />
                    <div className="ripple ripple-2" />
                    <div className="ripple ripple-3" />
                  </div>
                  <div className="splash-drops">
                    {[0,1,2,3,4].map(i => (
                      <div key={i} className={`drop drop-${i}`} />
                    ))}
                  </div>
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
