import { CellStatus, ServerMessage } from '../hooks/UseGameWebSocket';

// Helper to convert numeric coordinates to proper labels (e.g., x=3, y=2 -> "C4")
// In the grid: board[y][x], where y is row index (A-J) and x is column index (1-10)
const getCoordinateLabel = (x: number, y: number): string => {
  const columnLabels = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '10'];
  const rowLabels = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J'];
  return `${rowLabels[y]}${columnLabels[x]}`;
};

export type GameState = 'waiting' | 'placing' | 'playing' | 'finished';

export interface GameUIState {
  gameState: GameState;
  playerId: string | null;
  currentTurn: string;
  ownBoard: CellStatus[][];
  opponentBoard: CellStatus[][];
  message: string;
  winner: string | null;
  planesPlaced: number;
}

export type UIAction =
  | { type: 'set_own_board'; board: CellStatus[][] };

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
  planesPlaced: 0,
};

export function gameReducer(
  state: GameUIState,
  action: ServerMessage | UIAction
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

    case 'plane_placed':
      return {
        ...state,
        message: action.success
          ? `Plane ${action.planes_count} placed! ${action.planes_count === 2 ? 'Waiting for opponent...' : 'Place one more plane'}`
          : `Error: ${action.message}`,
        planesPlaced: action.success ? action.planes_count : state.planesPlaced,
      };

    case 'game_started':
      return {
        ...state,
        gameState: 'playing',
        currentTurn: action.current_turn,
        message: 'Game started! Destroy enemy cockpits to win!',
      };

    case 'attack_result': {
      const boardKey = action.is_attacker
        ? 'opponentBoard'
        : 'ownBoard';

      const newBoard = state[boardKey].map(row => [...row]);
      newBoard[action.y][action.x] = action.result as CellStatus;

      let message = '';
      const coordLabel = getCoordinateLabel(action.x, action.y);
      if (action.is_attacker) {
        if (action.result === 'head_hit') {
          message = `💥 COCKPIT HIT! Enemy plane destroyed at ${coordLabel}!`;
        } else if (action.result === 'hit') {
          message = `🔥 Hit at ${coordLabel} - but plane still flying!`;
        } else {
          message = `💧 Miss at ${coordLabel}`;
        }
      } else {
        if (action.result === 'head_hit') {
          message = `💥 Your cockpit was hit at ${coordLabel}! Plane destroyed!`;
        } else if (action.result === 'hit') {
          message = `🔥 Your plane took damage at ${coordLabel}`;
        } else {
          message = `💧 Opponent missed at ${coordLabel}`;
        }
      }

      return {
        ...state,
        [boardKey]: newBoard,
        message,
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
        opponentBoard: action.opponent_board,
        message: `Game Over! Winner: ${action.winner}`,
      };

    case 'game_resumed':
      return {
        ...state,
        gameState: (action.game_state as GameState) || 'playing',
        ownBoard: action.own_board,
        opponentBoard: action.opponent_board,
        currentTurn: action.current_turn,
        winner: action.winner ?? null,
        message: 'Reconnected to game',
      };

    case 'player_disconnected':
      return {
        ...state,
        message: 'Opponent disconnected',
      };

    case 'player_reconnected':
      return {
        ...state,
        message: 'Opponent reconnected',
      };

    case 'error':
      return {
        ...state,
        message: `Error: ${action.message}`,
      };

    case 'set_own_board':
      return {
        ...state,
        ownBoard: action.board,
      };

    default: {
      const _exhaustive: never = action;
      return _exhaustive;
    }
  }
}

export default gameReducer;