import { useState, useReducer, useCallback } from 'react';
import './App.css';
import GameBoard from './components/GameBoard';
import PlanePlacement from './components/PlanePlacement';
import GameInfo from './components/GameInfo';
import ZoomableBoard from './components/ZoomableBoard';
import { useGameWebSocket, CellStatus } from './hooks/UseGameWebSocket';
import {
  gameReducer,
  initialGameState,
  createEmptyBoard
} from './reducers/gameReducer';
import { getPlanePositions } from './helpers';

interface Plane {
  head_x: number;
  head_y: number;
  orientation: 'up' | 'down' | 'left' | 'right';
}

const API_URL = import.meta.env.VITE_API_URL || '';

function App() {
  const [gameId, setGameId] = useState<string | null>(null);
  const [state, dispatch] = useReducer(gameReducer, initialGameState);

  const { send, connectionStatus } = useGameWebSocket({
    gameId,
    onMessage: dispatch,
    onClose: () => {
      dispatch({ type: 'error', message: 'Disconnected from game' });
    }
  });

  const createGame = async () => {
    const res = await fetch(`${API_URL}/game/create`, { method: 'POST' });
    const data = await res.json();
    setGameId(data.game_id);
  };

  const joinGame = (id: string) => setGameId(id);

  const handlePlanesPlaced = useCallback(
    (planes: Plane[]) => {
      const board = createEmptyBoard();

      planes.forEach(plane => {
        const {positions} = getPlanePositions(plane.head_x, plane.head_y, plane.orientation);
        positions.forEach((pos, index) => {
          if (index === 0) {
            board[pos.y][pos.x] = 'head' as CellStatus;
          } else {
            board[pos.y][pos.x] = 'plane' as CellStatus;
          }
        });
      });

      dispatch({
        type: 'set_own_board',
        board
      });

      // Send each plane to the server
      planes.forEach(plane => {
        send({
          type: 'place_plane', 
          head_x: plane.head_x, 
          head_y: plane.head_y, 
          orientation: plane.orientation 
        });
      });
    },
    [send]
  );

  const handleCellClick = useCallback(
    (x: number, y: number, isOwnBoard: boolean) => {
      if (
        state.gameState !== 'playing' ||
        state.playerId !== state.currentTurn ||
        isOwnBoard ||
        !state.opponentConnected ||
        state.opponentBoard[y][x] !== 'empty'
      ) {
        return;
      }

      send({ type: 'attack', x, y });
    },
    [state, send]
  );

  const handleContinueGame = useCallback(async () => {
    if (!gameId) return;
    const token = localStorage.getItem(`game_token_${gameId}`);
    if (!token) return;

    const res = await fetch(`${API_URL}/game/${gameId}/continue`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ session_token: token }),
    });
    if (!res.ok) return;

    const data = await res.json();
    // Store the new session token before switching games
    localStorage.setItem(`game_token_${data.game_id}`, data.session_token);
    // Clear old state immediately and show transition message
    dispatch({ type: 'game_continued', message: 'Switched to new game. Waiting for opponent to connect...' });
    setGameId(data.game_id);
  }, [gameId]);

  return (
    <div className="App">
      <h1>Battleplanes</h1>

      {!gameId && (
        <div className="landing">
          <div className="hero">
            <div className="hero-plane">
              <svg viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M32 4L28 20H12L8 28H26L22 52L28 48V60L32 56L36 60V48L42 52L38 28H56L52 20H36L32 4Z"
                      fill="currentColor" fillOpacity="0.15" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round"/>
                <circle cx="32" cy="14" r="2.5" fill="currentColor" opacity="0.8"/>
              </svg>
            </div>
            <p className="hero-tagline">Outsmart. Outmaneuver. Dominate the skies.</p>

            <div className="hero-actions">
              <button onClick={createGame} className="btn btn-primary">
                Create Game
              </button>

              <div className="divider-text"><span>or</span></div>

              <div className="join-game">
                <input
                  type="text"
                  placeholder="Enter Game ID"
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      joinGame((e.target as HTMLInputElement).value);
                    }
                  }}
                />
                <button
                  onClick={() => {
                    const input = document.querySelector(
                      '.join-game input'
                    ) as HTMLInputElement;
                    if (input?.value) {
                      joinGame(input.value);
                    }
                  }}
                  className="btn btn-secondary"
                >
                  Join
                </button>
              </div>
            </div>
          </div>

          <section className="how-to-play">
            <h2>How to Play</h2>
            <div className="steps">
              <div className="step">
                <div className="step-icon">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M12 2L8 10H2L6 14L4 22L12 17L20 22L18 14L22 10H16L12 2Z"/>
                  </svg>
                </div>
                <h3>Deploy</h3>
                <p>Place 2 planes on your 10x10 grid. Position them wisely — your opponent is doing the same.</p>
              </div>
              <div className="step">
                <div className="step-icon">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="12" cy="12" r="10"/>
                    <circle cx="12" cy="12" r="6"/>
                    <circle cx="12" cy="12" r="2"/>
                    <line x1="12" y1="2" x2="12" y2="4"/>
                    <line x1="12" y1="20" x2="12" y2="22"/>
                    <line x1="2" y1="12" x2="4" y2="12"/>
                    <line x1="20" y1="12" x2="22" y2="12"/>
                  </svg>
                </div>
                <h3>Strike</h3>
                <p>Take turns firing at coordinates on the enemy grid. Hits burn, misses splash.</p>
              </div>
              <div className="step">
                <div className="step-icon">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                    <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/>
                  </svg>
                </div>
                <h3>Destroy</h3>
                <p>Hit the cockpit to down a plane. Destroy both enemy planes to claim victory.</p>
              </div>
            </div>
          </section>
        </div>
      )}

      {gameId && (
        <>
          <GameInfo
            gameState={state.gameState}
            playerId={state.playerId}
            currentTurn={state.currentTurn}
            message={state.message}
            winner={state.winner}
            gameId={gameId}
            connectionStatus={connectionStatus}
            sessionExpired={state.sessionExpired}
            onContinueGame={handleContinueGame}
          />

          <div className="game-content-wrapper">
            <div className={state.waitingForOpponent ? 'game-content-blurred' : ''}>
              {state.gameState === 'placing' && state.planesPlaced < 2 && (
                <PlanePlacement onPlanesPlaced={handlePlanesPlaced} disabled={!state.opponentConnected} />
              )}
              {state.gameState === 'placing' && state.planesPlaced === 2 && (
                <div className="game-boards">
                  <div className="board-container">
                    <h3>Your Airspace</h3>
                    <ZoomableBoard>
                      <GameBoard board={state.ownBoard} onCellClick={() => {}} isOwnBoard />
                    </ZoomableBoard>
                  </div>
                </div>
              )}

              {(state.gameState === 'playing' ||
                state.gameState === 'finished') && (
                <div className="game-boards">
                  <div className="board-container">
                    <h3>Your Airspace</h3>
                    <ZoomableBoard>
                      <GameBoard
                        board={state.ownBoard}
                        onCellClick={(x, y) =>
                          handleCellClick(x, y, true)
                        }
                        isOwnBoard
                      />
                    </ZoomableBoard>
                  </div>
                  <div className="board-container">
                    <h3>Enemy Airspace</h3>
                    <ZoomableBoard>
                      <GameBoard
                        board={state.opponentBoard}
                        onCellClick={(x, y) =>
                          handleCellClick(x, y, false)
                        }
                        isOwnBoard={false}
                        isMyTurn={state.gameState === 'playing' ? state.playerId === state.currentTurn : undefined}
                        gameFinished={state.gameState === 'finished'}
                      />
                    </ZoomableBoard>
                  </div>
                </div>
              )}
            </div>

            {state.waitingForOpponent && (
              <div className="waiting-overlay">
                <div className="waiting-overlay-content">
                  <div className="waiting-overlay-icon">
                    <svg viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg">
                      <path d="M32 4L28 20H12L8 28H26L22 52L28 48V60L32 56L36 60V48L42 52L38 28H56L52 20H36L32 4Z"
                            fill="currentColor" fillOpacity="0.15" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round"/>
                      <circle cx="32" cy="14" r="2.5" fill="currentColor" opacity="0.8"/>
                    </svg>
                  </div>
                  {state.opponentConnected ? (
                    <>
                      <p>Waiting for opponent to connect...</p>
                      <p className="waiting-overlay-hint">Share the Game ID above with your opponent</p>
                    </>
                  ) : (
                    <>
                      <p>Opponent disconnected</p>
                      <p className="waiting-overlay-hint">Waiting for them to reconnect...</p>
                    </>
                  )}
                </div>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}

export default App;