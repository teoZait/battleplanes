import { useState, useEffect, useCallback } from 'react';
import './App.css';
import GameBoard from './components/GameBoard';
import ShipPlacement from './components/ShipPlacement';
import GameInfo from './components/GameInfo';
import { useGameWebSocket } from './hooks/UseGameWebSocket';

export type CellStatus = 'empty' | 'ship' | 'hit' | 'miss';
export type GameState = 'waiting' | 'placing' | 'playing' | 'finished';

export interface Ship {
  type: string;
  positions: number[][];
  hits?: boolean[];
}

const API_URL = 'http://localhost:8000';

function App() {
  const [gameId, setGameId] = useState<string | null>(null);
  const [playerId, setPlayerId] = useState<string | null>(null);
  const [gameState, setGameState] = useState<GameState>('waiting');
  const [currentTurn, setCurrentTurn] = useState<string>('player1');

  const [ownBoard, setOwnBoard] = useState<CellStatus[][]>(
    Array.from({ length: 10 }, () =>
      Array.from({ length: 10 }, () => 'empty' as CellStatus)
    )
  );

  const [opponentBoard, setOpponentBoard] = useState<CellStatus[][]>(
    Array.from({ length: 10 }, () =>
      Array.from({ length: 10 }, () => 'empty' as CellStatus)
    )
  );

  const [_, setPlacedShips] = useState<Ship[]>([]);
  const [message, setMessage] = useState<string>('');
  const [winner, setWinner] = useState<string | null>(null);

  const { send } = useGameWebSocket({
    gameId,

    onOpen: () => setMessage('Connected to game'),

    onClose: () => setMessage('Disconnected from game'),

    onError: (msg) => setMessage(`Error: ${msg}`),

    onMessage: (data) => {
      switch (data.type) {
        case 'player_assigned':
          setPlayerId(data.player_id);
          setGameState(data.game_state);
          setMessage(`You are ${data.player_id}`);
          break;

        case 'game_ready':
          setGameState('placing');
          setMessage(data.message);
          break;

        case 'ships_placed':
          if (data.success) {
            setMessage('Ships placed successfully! Waiting for opponent...');
          } else {
            setMessage(`Error placing ships: ${data.error}`);
          }
          break;

        case 'game_started':
          setGameState('playing');
          setCurrentTurn(data.current_turn);
          setMessage('Game started!');
          break;

        case 'attack_result':
          if (data.is_attacker) {
            setOpponentBoard(prevBoard => {
              const board = prevBoard.map(row => [...row]);
              board[data.y][data.x] = data.result;

              setMessage(`You ${data.result} at (${data.x}, ${data.y})`);
              return board;
            });
          } else {
            setOwnBoard(prevBoard => {
              const board = prevBoard.map(row => [...row]);
              board[data.y][data.x] = data.result;

              setMessage(`Opponent ${data.result} at (${data.x}, ${data.y})`);
              return board;
            });
          }
          break;

        case 'turn_changed':
          setCurrentTurn(data.current_turn);
          break;

        case 'game_over':
          setGameState('finished');
          setWinner(data.winner);
          setMessage(`Game Over! Winner: ${data.winner}`);
          break;

        case 'player_disconnected':
          setMessage('Opponent disconnected');
          break;

        case 'error':
          setMessage(`Error: ${data.message}`);
          break;

        default:
          // 👇 compile-time exhaustiveness check
          const _exhaustive: never = data;
          return _exhaustive;
      }
    }
  });

  const createGame = async () => {
    try {
      const response = await fetch(`${API_URL}/game/create`, {
        method: 'POST',
      });
      const data = await response.json();
      setGameId(data.game_id);
      setMessage('Waiting for opponent to join...');
    } catch (error) {
      console.error(error);
      setMessage('Error creating game');
    }
  };

  const joinGame = (id: string) => {
    setGameId(id);
  };

  const handleShipsPlaced = useCallback(
    (ships: Ship[]) => {
      setPlacedShips(ships);

      const newBoard: CellStatus[][] = Array.from({ length: 10 }, () =>
        Array.from({ length: 10 }, () => 'empty' as CellStatus)
      );

      ships.forEach(ship => {
        ship.positions.forEach(([x, y]) => {
          newBoard[y][x] = 'ship';
        });
      });

      setOwnBoard(newBoard);

      send({
        type: 'place_ships',
        ships
      });
    },
    [send]
  );

  const handleCellClick = useCallback(
    (x: number, y: number, isOwnBoard: boolean) => {
      if (
        gameState !== 'playing' ||
        playerId !== currentTurn ||
        isOwnBoard
      ) {
        return;
      }

      if (opponentBoard[y][x] !== 'empty') {
        return;
      }

      send({
        type: 'attack',
        x,
        y
      });
    },
    [send, gameState, playerId, currentTurn, opponentBoard]
  );

  useEffect(() => {
    console.log('Own board updated:', ownBoard);
  }, [ownBoard]);

  return (
    <div className="App">
      <h1>⚓ Battleships ⚓</h1>

      {!gameId && (
        <div className="menu">
          <button onClick={createGame} className="btn btn-primary">
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
                const input = document.querySelector('input') as HTMLInputElement;
                if (input.value) joinGame(input.value);
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
            gameState={gameState}
            playerId={playerId}
            currentTurn={currentTurn}
            message={message}
            winner={winner}
            gameId={gameId}
          />

          {gameState === 'placing' && (
            <ShipPlacement onShipsPlaced={handleShipsPlaced} />
          )}

          {(gameState === 'playing' || gameState === 'finished') && (
            <div className="game-boards">
              <div className="board-container">
                <h3>Your Board</h3>
                <GameBoard
                  board={ownBoard}
                  onCellClick={(x, y) => handleCellClick(x, y, true)}
                  isOwnBoard
                />
              </div>

              <div className="board-container">
                <h3>Opponent's Board</h3>
                <GameBoard
                  board={opponentBoard}
                  onCellClick={(x, y) => handleCellClick(x, y, false)}
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