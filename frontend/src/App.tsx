import { useState, useReducer, useCallback } from 'react';
import './App.css';
import GameBoard from './components/GameBoard';
import ShipPlacement from './components/ShipPlacement';
import GameInfo from './components/GameInfo';
import { useGameWebSocket } from './hooks/UseGameWebSocket';
import {
  gameReducer,
  initialGameState,
  createEmptyBoard
} from './reducers/gameReducer';

export interface Ship {
  type: string;
  positions: number[][];
  hits?: boolean[];
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

  const handleShipsPlaced = useCallback(
    (ships: Ship[]) => {
      const board = createEmptyBoard();
      ships.forEach(ship =>
        ship.positions.forEach(([x, y]) => {
          board[y][x] = 'ship';
        })
      );

      dispatch({
        type: 'attack_result', // local-only UI update
        x: -1,
        y: -1,
        result: 'ship',
        is_attacker: false
      });

      send({ type: 'place_ships', ships });
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
      <h1>⚓ Battleships ⚓</h1>

      {!gameId && (
        <div className="menu">
          <button onClick={createGame}>Create Game</button>
          <input
            placeholder="Game ID"
            onKeyDown={(e) =>
              e.key === 'Enter' &&
              joinGame((e.target as HTMLInputElement).value)
            }
          />
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
            <ShipPlacement onShipsPlaced={handleShipsPlaced} />
          )}

          {(state.gameState === 'playing' ||
            state.gameState === 'finished') && (
            <div className="game-boards">
              <GameBoard
                board={state.ownBoard}
                onCellClick={(x, y) =>
                  handleCellClick(x, y, true)
                }
                isOwnBoard
              />
              <GameBoard
                board={state.opponentBoard}
                onCellClick={(x, y) =>
                  handleCellClick(x, y, false)
                }
                isOwnBoard={false}
              />
            </div>
          )}
        </>
      )}
    </div>
  );
}

export default App;