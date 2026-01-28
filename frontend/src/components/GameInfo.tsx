import { GameState } from '../App';
import './GameInfo.css';

interface GameInfoProps {
  gameState: GameState;
  playerId: string | null;
  currentTurn: string;
  message: string;
  winner: string | null;
  gameId: string | null;
}

const GameInfo = ({ gameState, playerId, currentTurn, message, winner, gameId }: GameInfoProps) => {
  const isMyTurn = playerId === currentTurn;

  const copyGameId = () => {
    if (gameId) {
      navigator.clipboard.writeText(gameId);
      alert('Game ID copied to clipboard!');
    }
  };

  return (
    <div className="game-info">
      {gameId && (
        <div className="game-id-box">
          <div className="game-id-content">
            <span className="game-id-label">Game ID:</span>
            <span className="game-id-value">{gameId}</span>
            <button className="copy-btn" onClick={copyGameId} title="Copy Game ID">
              📋 Copy
            </button>
          </div>
          <p className="game-id-hint">Share this ID with your opponent</p>
        </div>
      )}

      <div className="info-card">
        <div className="info-item">
          <span className="label">Status:</span>
          <span className={`status ${gameState}`}>
            {gameState === 'waiting' && '⏳ Waiting...'}
            {gameState === 'placing' && '🎯 Placing Ships'}
            {gameState === 'playing' && '⚔️ Battle!'}
            {gameState === 'finished' && '🏁 Game Over'}
          </span>
        </div>

        {playerId && (
          <div className="info-item">
            <span className="label">You are:</span>
            <span className="player-id">{playerId}</span>
          </div>
        )}

        {gameState === 'playing' && (
          <div className="info-item">
            <span className="label">Turn:</span>
            <span className={`turn ${isMyTurn ? 'your-turn' : 'opponent-turn'}`}>
              {isMyTurn ? '🎯 Your Turn!' : '⏱️ Opponent\'s Turn'}
            </span>
          </div>
        )}

        {winner && (
          <div className="info-item winner">
            <span className="label">Winner:</span>
            <span className={winner === playerId ? 'you-won' : 'you-lost'}>
              {winner === playerId ? '🎉 You Won!' : '😢 You Lost'}
            </span>
          </div>
        )}
      </div>

      {message && (
        <div className="message-box">
          <p>{message}</p>
        </div>
      )}
    </div>
  );
};

export default GameInfo;