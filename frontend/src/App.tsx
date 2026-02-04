import { useState, useReducer, useCallback } from 'react';
import './App.css';
import GameBoard from './components/GameBoard';
import PlanePlacement from './components/PlanePlacement';
import GameInfo from './components/GameInfo';
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

const API_URL = 'http://localhost:8000';

function App() {
  const [gameId, setGameId] = useState<string | null>(null);
  const [state, dispatch] = useReducer(gameReducer, initialGameState);

  const { send } = useGameWebSocket({
    gameId,
    onOpen: () => {
      dispatch({ type: 'error', message: 'Connected to game' });
    },
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
        state.opponentBoard[y][x] !== 'empty'
      ) {
        return;
      }

      send({ type: 'attack', x, y });
    },
    [state, send]
  );

  return (
    <div className="App">
      <h1>✈️ Warplanes ✈️</h1>

      {!gameId && (
        <div className="menu">
          <button
            onClick={createGame}
            className="btn btn-primary"
          >
            Create New Game
          </button>

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
              Join Game
            </button>
          </div>
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
          />

          {state.gameState === 'placing' && (
            <PlanePlacement onPlanesPlaced={handlePlanesPlaced} />
          )}

          {(state.gameState === 'playing' ||
            state.gameState === 'finished') && (
            <div className="game-boards">
              <div className="board-container">
                <h3>Your Airspace</h3>
                <GameBoard
                  board={state.ownBoard}
                  onCellClick={(x, y) =>
                    handleCellClick(x, y, true)
                  }
                  isOwnBoard
                />
              </div>
              <div className="board-container">
                <h3>Enemy Airspace</h3>
                <GameBoard
                  board={state.opponentBoard}
                  onCellClick={(x, y) =>
                    handleCellClick(x, y, false)
                  }
                  isOwnBoard={false}
                />
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

export default App;