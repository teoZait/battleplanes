import { useState } from 'react';
import { GameState } from '.././reducers/gameReducer';
import { ConnectionStatus } from '../hooks/UseGameWebSocket';
import './GameInfo.css';

interface GameInfoProps {
  gameState: GameState;
  playerId: string | null;
  currentTurn: string;
  message: string;
  winner: string | null;
  gameId: string | null;
  connectionStatus: ConnectionStatus;
  sessionExpired?: boolean;
  onContinueGame?: () => void;
}

const GameInfo = ({ gameState, playerId, currentTurn, message, winner, gameId, connectionStatus, sessionExpired, onContinueGame }: GameInfoProps) => {
  const isMyTurn = playerId === currentTurn;
  const [copied, setCopied] = useState(false);

  const copyGameLink = () => {
    if (gameId) {
      navigator.clipboard.writeText(`${window.location.origin}/game/${gameId}`);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <div className="game-info">
      <div className="info-card">
        <div className="info-item">
          <span className="label">Status:</span>
          <span className={`status ${gameState}`}>
            {gameState === 'waiting' && '⏳ Waiting...'}
            {gameState === 'placing' && '🎯 Placing Planes'}
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

        {gameId && (
          <button className={`copy-link-btn${copied ? ' copied' : ''}`} onClick={copyGameLink} title="Copy game link">
            {copied ? '✓ Copied!' : '🔗 Copy Link'}
          </button>
        )}
      </div>

      {connectionStatus !== 'connected' && connectionStatus !== 'disconnected' && (
        <div className={`connection-status ${connectionStatus}`}>
          {connectionStatus === 'connecting' && 'Connecting...'}
          {connectionStatus === 'reconnecting' && 'Connection lost. Reconnecting...'}
        </div>
      )}

      {sessionExpired && (
        <div className="session-expired-banner">
          <p>Your opponent's session has expired and they cannot rejoin this game.</p>
          {onContinueGame && (
            <button className="btn btn-primary" onClick={onContinueGame}>
              Continue in New Game
            </button>
          )}
        </div>
      )}

      {message && !sessionExpired && (
        <div className="message-box">
          <p>{message}</p>
        </div>
      )}
    </div>
  );
};

export default GameInfo;