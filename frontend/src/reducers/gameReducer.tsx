import { CellStatus, ServerMessage } from '../hooks/UseGameWebSocket';

export type GameState = 'waiting' | 'placing' | 'playing' | 'finished';

export interface GameUIState {
  gameState: GameState;
  playerId: string | null;
  currentTurn: string;
  ownBoard: CellStatus[][];
  opponentBoard: CellStatus[][];
  message: string;
  winner: string | null;
}

export const createEmptyBoard = (): CellStatus[][] =>
  Array.from({ length: 10 }, () =>
    Array.from({ length: 10 }, () => 'empty' as CellStatus)
  );

export const initialGameState: GameUIState = {
  gameState: 'waiting',
  playerId: null,
  currentTurn: 'player1',
  ownBoard: createEmptyBoard(),
  opponentBoard: createEmptyBoard(),
  message: '',
  winner: null,
};

export function gameReducer(
  state: GameUIState,
  action: ServerMessage
): GameUIState {
  switch (action.type) {
    case 'player_assigned':
      return {
        ...state,
        playerId: action.player_id,
        gameState: action.game_state,
        message: `You are ${action.player_id}`,
      };

    case 'game_ready':
      return {
        ...state,
        gameState: 'placing',
        message: action.message,
      };

    case 'ships_placed':
      return {
        ...state,
        message: action.success
          ? 'Ships placed successfully! Waiting for opponent...'
          : `Error placing ships: ${action.error}`,
      };

    case 'game_started':
      return {
        ...state,
        gameState: 'playing',
        currentTurn: action.current_turn,
        message: 'Game started!',
      };

    case 'attack_result': {
      const boardKey = action.is_attacker
        ? 'opponentBoard'
        : 'ownBoard';

      const newBoard = state[boardKey].map(row => [...row]);
      newBoard[action.y][action.x] = action.result;

      return {
        ...state,
        [boardKey]: newBoard,
        message: action.is_attacker
          ? `You ${action.result} at (${action.x}, ${action.y})`
          : `Opponent ${action.result} at (${action.x}, ${action.y})`,
      } as GameUIState;
    }

    case 'turn_changed':
      return {
        ...state,
        currentTurn: action.current_turn,
      };

    case 'game_over':
      return {
        ...state,
        gameState: 'finished',
        winner: action.winner,
        message: `Game Over! Winner: ${action.winner}`,
      };

    case 'player_disconnected':
      return {
        ...state,
        message: 'Opponent disconnected',
      };

    case 'error':
      return {
        ...state,
        message: `Error: ${action.message}`,
      };

    default: {
      const _exhaustive: never = action;
      return _exhaustive;
    }
  }
}

export default gameReducer;