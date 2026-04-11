import { CellStatus } from '../hooks/UseGameWebSocket';
import GameBoard from './GameBoard';
import ZoomableBoard from './ZoomableBoard';
import './FinishedGameView.css';

export interface FinishedGameData {
  winner: string;
  boards: {
    player1: CellStatus[][];
    player2: CellStatus[][];
  };
  mode: string;
}

interface FinishedGameViewProps {
  data: FinishedGameData;
  onNewGame: () => void;
}

const FinishedGameView = ({ data, onNewGame }: FinishedGameViewProps) => {
  const winnerLabel = data.winner === 'player1' ? 'Player 1' : 'Player 2';

  return (
    <div className="finished-game-view">
      <div className="finished-result">
        <span className="finished-badge">Game Over</span>
        <p className="finished-winner">{winnerLabel} wins!</p>
      </div>

      <div className="game-boards">
        <div className="board-container">
          <h3>{data.winner === 'player1' ? '🏆 Player 1' : 'Player 1'}</h3>
          <ZoomableBoard>
            <GameBoard board={data.boards.player1} onCellClick={() => {}} isOwnBoard gameFinished />
          </ZoomableBoard>
        </div>
        <div className="board-container">
          <h3>{data.winner === 'player2' ? '🏆 Player 2' : 'Player 2'}</h3>
          <ZoomableBoard>
            <GameBoard board={data.boards.player2} onCellClick={() => {}} isOwnBoard={false} gameFinished />
          </ZoomableBoard>
        </div>
      </div>

      <div className="post-game-actions">
        <button className="btn btn-primary" onClick={onNewGame}>
          New Game
        </button>
      </div>
    </div>
  );
};

export default FinishedGameView;
