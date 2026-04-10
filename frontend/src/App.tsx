import { useState, useReducer, useCallback, useEffect, useRef } from 'react';
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

export const getGameIdFromUrl = (): string | null => {
  const match = window.location.pathname.match(/^\/game\/([^/]+)/);
  return match ? decodeURIComponent(match[1]) : null;
};

function App() {
  const [gameId, setGameId] = useState<string | null>(getGameIdFromUrl);
  const [showModeSelector, setShowModeSelector] = useState(false);
  const [state, dispatch] = useReducer(gameReducer, initialGameState);

  // Sync URL when gameId changes
  useEffect(() => {
    const targetPath = gameId ? `/game/${gameId}` : '/';
    if (window.location.pathname !== targetPath) {
      window.history.pushState(null, '', targetPath);
    }
  }, [gameId]);

  // Handle browser back/forward buttons
  useEffect(() => {
    const onPopState = () => {
      setGameId(getGameIdFromUrl());
      setShowModeSelector(false);
    };
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, []);

  const prevGameStateRef = useRef(state.gameState);
  const [showBattleFlash, setShowBattleFlash] = useState(false);

  useEffect(() => {
    if (prevGameStateRef.current === 'placing' && state.gameState === 'playing') {
      setShowBattleFlash(true);
      const timer = setTimeout(() => setShowBattleFlash(false), 1800);
      prevGameStateRef.current = state.gameState;
      return () => clearTimeout(timer);
    }
    prevGameStateRef.current = state.gameState;
  }, [state.gameState]);

  const { send, connectionStatus } = useGameWebSocket({
    gameId,
    onMessage: dispatch,
    onClose: () => {
      dispatch({ type: 'error', message: 'Disconnected from game' });
    }
  });

  const createGame = async (mode: 'classic' | 'elite') => {
    const res = await fetch(`${API_URL}/api/game/create`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mode }),
    });
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

    const res = await fetch(`${API_URL}/api/game/${gameId}/continue`, {
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
      {showBattleFlash && (
        <div className="battle-flash">
          <span>Battle!</span>
        </div>
      )}
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
              {!showModeSelector ? (
                <>
                  <button onClick={() => setShowModeSelector(true)} className="btn btn-primary">
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
                </>
              ) : (
                <div className="mode-picker">
                  <p className="mode-picker-title">Choose Your Mode</p>
                  <div className="mode-cards">
                    <button className="mode-card mode-card-classic" onClick={() => createGame('classic')}>
                      <div className="mode-card-planes">
                        <svg className="mc-plane mc-plane-1" viewBox="0 0 64 64" fill="none">
                          <path d="M32 4L28 20H12L8 28H26L22 52L28 48V60L32 56L36 60V48L42 52L38 28H56L52 20H36L32 4Z"
                                fill="currentColor" fillOpacity="0.25" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round"/>
                        </svg>
                        <svg className="mc-plane mc-plane-2" viewBox="0 0 64 64" fill="none">
                          <path d="M32 4L28 20H12L8 28H26L22 52L28 48V60L32 56L36 60V48L42 52L38 28H56L52 20H36L32 4Z"
                                fill="currentColor" fillOpacity="0.25" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round"/>
                        </svg>
                      </div>
                      <h3>Classic</h3>
                      <p>2 planes per player</p>
                    </button>
                    <button className="mode-card mode-card-elite" onClick={() => createGame('elite')}>
                      <div className="mode-card-planes">
                        <svg className="mc-plane mc-plane-1" viewBox="0 0 64 64" fill="none">
                          <path d="M32 4L28 20H12L8 28H26L22 52L28 48V60L32 56L36 60V48L42 52L38 28H56L52 20H36L32 4Z"
                                fill="currentColor" fillOpacity="0.25" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round"/>
                        </svg>
                        <svg className="mc-plane mc-plane-2" viewBox="0 0 64 64" fill="none">
                          <path d="M32 4L28 20H12L8 28H26L22 52L28 48V60L32 56L36 60V48L42 52L38 28H56L52 20H36L32 4Z"
                                fill="currentColor" fillOpacity="0.25" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round"/>
                        </svg>
                        <svg className="mc-plane mc-plane-3" viewBox="0 0 64 64" fill="none">
                          <path d="M32 4L28 20H12L8 28H26L22 52L28 48V60L32 56L36 60V48L42 52L38 28H56L52 20H36L32 4Z"
                                fill="currentColor" fillOpacity="0.25" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round"/>
                        </svg>
                      </div>
                      <h3>Elite</h3>
                      <p>3 planes per player</p>
                    </button>
                  </div>
                  <button className="btn-back" onClick={() => setShowModeSelector(false)}>
                    &larr; Back
                  </button>
                </div>
              )}
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
                <p>Place your planes on the 10x10 grid. Position them wisely — your opponent is doing the same.</p>
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
                <p>Hit the cockpit to down a plane. Destroy all enemy planes to claim victory.</p>
              </div>
            </div>
          </section>

          <footer className="landing-footer">
            <a href="https://github.com/teoZait/battleplanes" target="_blank" rel="noopener noreferrer">
              <svg viewBox="0 0 24 24" fill="currentColor" width="24" height="24">
                <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0024 12c0-6.63-5.37-12-12-12z"/>
              </svg>
            </a>
          </footer>
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
              {state.gameState === 'placing' && state.planesPlaced < state.maxPlanes && (
                <PlanePlacement onPlanesPlaced={handlePlanesPlaced} disabled={!state.opponentConnected} maxPlanes={state.maxPlanes} />
              )}
              {state.gameState === 'placing' && state.planesPlaced === state.maxPlanes && (
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