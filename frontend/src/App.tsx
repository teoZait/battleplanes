import { useState, useEffect, useCallback } from 'react';
import './App.css';
import GameBoard from './components/GameBoard';
import ShipPlacement from './components/ShipPlacement';
import GameInfo from './components/GameInfo';

export type CellStatus = 'empty' | 'ship' | 'hit' | 'miss';
export type GameState = 'waiting' | 'placing' | 'playing' | 'finished';

export interface Ship {
  type: string;
  positions: number[][];
  hits?: boolean[];
}

interface Message {
  type: string;
  [key: string]: any;
}

const API_URL = 'http://localhost:8000';
const WS_URL = API_URL.replace('http', 'ws');

function App() {
  const [gameId, setGameId] = useState<string | null>(null);
  const [playerId, setPlayerId] = useState<string | null>(null);
  const [gameState, setGameState] = useState<GameState>('waiting');
  const [currentTurn, setCurrentTurn] = useState<string>('player1');
  const [ownBoard, setOwnBoard] = useState<CellStatus[][]>(
    Array.from({ length: 10 }, () => Array.from({ length: 10 }, () => 'empty' as CellStatus))
  );
  const [opponentBoard, setOpponentBoard] = useState<CellStatus[][]>(
    Array.from({ length: 10 }, () => Array.from({ length: 10 }, () => 'empty' as CellStatus))
  );
  const [_, setPlacedShips] = useState<Ship[]>([]);
  const [ws, setWs] = useState<WebSocket | null>(null);
  const [message, setMessage] = useState<string>('');
  const [winner, setWinner] = useState<string | null>(null);

  const createGame = async () => {
    try {
      const response = await fetch(`${API_URL}/game/create`, {
        method: 'POST',
      });
      const data = await response.json();
      console.log('Game created with ID:', data.game_id);
      setGameId(data.game_id);
      setMessage('Waiting for opponent to join...');
    } catch (error) {
      console.error('Error creating game:', error);
      setMessage('Error creating game');
    }
  };

  const joinGame = (id: string) => {
    setGameId(id);
  };

  useEffect(() => {
    if (!gameId) return;

    const websocket = new WebSocket(`${WS_URL}/ws/${gameId}`);

    websocket.onopen = () => {
      console.log('WebSocket connected');
      setMessage('Connected to game');
    };

    websocket.onmessage = (event) => {
      const data: Message = JSON.parse(event.data);
      console.log('Received:', data);

      switch (data.type) {
        case 'player_assigned':
          setPlayerId(data.player_id);
          setGameState(data.game_state);
          setMessage(`You are ${data.player_id}`);
          break;

        case 'game_ready':
          setMessage(data.message);
          setGameState('placing');
          break;

        case 'ships_placed':
          if (data.success) {
            setMessage('Ships placed successfully! Waiting for opponent...');
          } else {
            setMessage('Error placing ships: ' + data.error);
          }
          break;

        case 'game_started':
          setGameState('playing');
          setCurrentTurn(data.current_turn);
          setMessage('Game started!');
          break;

        case 'attack_result':
          if (data.is_attacker) {
            console.log('Updating opponent board at', data.x, data.y, 'to', data.result);

            setOpponentBoard(prevBoard => {
              const newBoard = prevBoard.map(row => [...row]);
              newBoard[data.y][data.x] = data.result;
              return newBoard;
            });
            
            setMessage(`You ${data.result} at (${data.x}, ${data.y})`);
          } else {
            console.log('Updating own board at', data.x, data.y, 'to', data.result);

            setOwnBoard(prevBoard => {
              console.log('Own board before update:', prevBoard);

              const newBoard = prevBoard.map(row => [...row]);
              newBoard[data.y][data.x] = data.result;

              console.log('Own board after update:', newBoard);
              return newBoard;
            });
            
            setMessage(`Opponent ${data.result} at (${data.x}, ${data.y})`);
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
          setMessage('Error: ' + data.message);
          break;
      }
    };

    websocket.onerror = (error) => {
      console.error('WebSocket error:', error);
      setMessage('Connection error');
    };

    websocket.onclose = () => {
      console.log('WebSocket disconnected');
      setMessage('Disconnected from game');
    };

    setWs(websocket);

    return () => {
      websocket.close();
    };
  }, [gameId]);

  useEffect(() => {
    console.log('Own board updated:', ownBoard);
  }, [ownBoard]);

  const handleShipsPlaced = useCallback((ships: Ship[]) => {
    if (!ws) return;

    setPlacedShips(ships);

    // Update own board
    const newBoard: CellStatus[][] = Array.from({ length: 10 }, () => 
      Array.from({ length: 10 }, () => 'empty' as CellStatus)
    );
    ships.forEach(ship => {
      ship.positions.forEach(([x, y]) => {
        newBoard[y][x] = 'ship';
      });
    });
    setOwnBoard(newBoard);

    // Send to server
    ws.send(JSON.stringify({
      type: 'place_ships',
      ships: ships
    }));
  }, [ws]);

  const handleCellClick = useCallback((x: number, y: number, isOwnBoard: boolean) => {
    if (!ws || gameState !== 'playing' || playerId !== currentTurn || isOwnBoard) {
      return;
    }

    // Don't allow attacking already attacked cells
    if (opponentBoard[y][x] !== 'empty') {
      return;
    }

    ws.send(JSON.stringify({
      type: 'attack',
      x,
      y
    }));
  }, [ws, gameState, playerId, currentTurn, opponentBoard]);

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
              onKeyPress={(e) => {
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
                  key="own-board"
                  board={ownBoard}
                  onCellClick={(x, y) => handleCellClick(x, y, true)}
                  isOwnBoard={true}
                />
              </div>
              <div className="board-container">
                <h3>Opponent's Board</h3>
                <GameBoard
                  key="opponent-board"
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