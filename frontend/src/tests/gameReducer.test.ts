import { describe, it, expect } from 'vitest';
import {
  gameReducer,
  initialGameState,
  createEmptyBoard,
  GameUIState,
} from '../reducers/gameReducer';
import type { CellStatus, ServerMessage } from '../hooks/UseGameWebSocket';

const baseState: GameUIState = {
  ...initialGameState,
  playerId: 'player1',
  gameState: 'placing',
};

describe('gameReducer - opponentConnected', () => {

  it('should default opponentConnected to true', () => {
    expect(initialGameState.opponentConnected).toBe(true);
  });

  it('should set opponentConnected to false on player_disconnected', () => {
    const action: ServerMessage = { type: 'player_disconnected' };
    const state = gameReducer(baseState, action);
    expect(state.opponentConnected).toBe(false);
    expect(state.waitingForOpponent).toBe(true);
  });

  it('should not set waitingForOpponent on player_disconnected after game finished', () => {
    const finished: GameUIState = { ...baseState, gameState: 'finished', winner: 'player1' };
    const action: ServerMessage = { type: 'player_disconnected' };
    const state = gameReducer(finished, action);
    expect(state.opponentConnected).toBe(false);
    expect(state.waitingForOpponent).toBe(false);
    expect(state.gameState).toBe('finished');
  });

  it('should set opponentConnected to true on player_reconnected', () => {
    const disconnected = { ...baseState, opponentConnected: false };
    const action: ServerMessage = { type: 'player_reconnected', player_id: 'player2' };
    const state = gameReducer(disconnected, action);
    expect(state.opponentConnected).toBe(true);
  });

  it('should set opponentConnected to true on game_ready', () => {
    const disconnected = { ...baseState, opponentConnected: false };
    const action: ServerMessage = { type: 'game_ready', message: 'Both players connected.' };
    const state = gameReducer(disconnected, action);
    expect(state.opponentConnected).toBe(true);
  });

  it('should set opponentConnected to true on game_resumed', () => {
    const disconnected = { ...baseState, opponentConnected: false };
    const action: ServerMessage = {
      type: 'game_resumed',
      own_board: createEmptyBoard(),
      opponent_board: createEmptyBoard(),
      current_turn: 'player1',
      game_state: 'placing',
      winner: null,
      planes_placed: 1,
    };
    const state = gameReducer(disconnected, action);
    expect(state.opponentConnected).toBe(true);
  });
});

describe('gameReducer - game_resumed', () => {

  it('should restore gameState from server', () => {
    const action: ServerMessage = {
      type: 'game_resumed',
      own_board: createEmptyBoard(),
      opponent_board: createEmptyBoard(),
      current_turn: 'player1',
      game_state: 'placing',
      winner: null,
      planes_placed: 0,
    };
    const state = gameReducer(baseState, action);
    expect(state.gameState).toBe('placing');
  });

  it('should restore planesPlaced from server', () => {
    const action: ServerMessage = {
      type: 'game_resumed',
      own_board: createEmptyBoard(),
      opponent_board: createEmptyBoard(),
      current_turn: 'player1',
      game_state: 'placing',
      winner: null,
      planes_placed: 2,
    };
    const state = gameReducer(baseState, action);
    expect(state.planesPlaced).toBe(2);
  });

  it('should restore winner from server for finished games', () => {
    const action: ServerMessage = {
      type: 'game_resumed',
      own_board: createEmptyBoard(),
      opponent_board: createEmptyBoard(),
      current_turn: 'player1',
      game_state: 'finished',
      winner: 'player1',
      planes_placed: 2,
    };
    const state = gameReducer(baseState, action);
    expect(state.gameState).toBe('finished');
    expect(state.winner).toBe('player1');
  });

  it('should default to playing when game_state not provided', () => {
    const action: ServerMessage = {
      type: 'game_resumed',
      own_board: createEmptyBoard(),
      opponent_board: createEmptyBoard(),
      current_turn: 'player1',
    };
    const state = gameReducer(baseState, action);
    expect(state.gameState).toBe('playing');
  });

  it('should restore ownBoard with plane cells during placing reconnection', () => {
    const ownBoard = createEmptyBoard();
    ownBoard[0][2] = 'head' as CellStatus;
    ownBoard[1][0] = 'plane' as CellStatus;
    ownBoard[1][1] = 'plane' as CellStatus;
    ownBoard[1][2] = 'plane' as CellStatus;
    ownBoard[1][3] = 'plane' as CellStatus;
    ownBoard[1][4] = 'plane' as CellStatus;

    const action: ServerMessage = {
      type: 'game_resumed',
      own_board: ownBoard,
      opponent_board: createEmptyBoard(),
      current_turn: 'player1',
      game_state: 'placing',
      winner: null,
      planes_placed: 2,
    };
    const state = gameReducer(baseState, action);
    expect(state.gameState).toBe('placing');
    expect(state.planesPlaced).toBe(2);
    expect(state.ownBoard[0][2]).toBe('head');
    expect(state.ownBoard[1][0]).toBe('plane');
  });
});

describe('gameReducer - opponent_session_expired', () => {

  it('should set sessionExpired to true', () => {
    const action: ServerMessage = { type: 'opponent_session_expired', message: 'Session expired' };
    const state = gameReducer(baseState, action);
    expect(state.sessionExpired).toBe(true);
  });

  it('should set opponentConnected to false', () => {
    const action: ServerMessage = { type: 'opponent_session_expired', message: 'Session expired' };
    const state = gameReducer(baseState, action);
    expect(state.opponentConnected).toBe(false);
  });

  it('should set the message from the action', () => {
    const action: ServerMessage = { type: 'opponent_session_expired', message: 'Your opponent cannot rejoin.' };
    const state = gameReducer(baseState, action);
    expect(state.message).toBe('Your opponent cannot rejoin.');
  });

  it('should not set sessionExpired after game finished', () => {
    const finished: GameUIState = { ...baseState, gameState: 'finished', winner: 'player1' };
    const action: ServerMessage = { type: 'opponent_session_expired', message: 'Session expired' };
    const state = gameReducer(finished, action);
    expect(state.sessionExpired).toBe(false);
    expect(state.opponentConnected).toBe(false);
    expect(state.gameState).toBe('finished');
  });

  it('should clear waitingForOpponent so expired banner takes over', () => {
    const disconnected: GameUIState = { ...baseState, waitingForOpponent: true, opponentConnected: false };
    const action: ServerMessage = { type: 'opponent_session_expired', message: 'Gone.' };
    const state = gameReducer(disconnected, action);
    expect(state.waitingForOpponent).toBe(false);
    expect(state.sessionExpired).toBe(true);
  });
});

describe('gameReducer - player_assigned resets state', () => {

  it('should reset sessionExpired to false', () => {
    const expiredState: GameUIState = { ...baseState, sessionExpired: true };
    const action: ServerMessage = { type: 'player_assigned', player_id: 'player1', game_state: 'playing' };
    const state = gameReducer(expiredState, action);
    expect(state.sessionExpired).toBe(false);
  });

  it('should reset planesPlaced to 0', () => {
    const oldState: GameUIState = { ...baseState, planesPlaced: 2 };
    const action: ServerMessage = { type: 'player_assigned', player_id: 'player1', game_state: 'playing' };
    const state = gameReducer(oldState, action);
    expect(state.planesPlaced).toBe(0);
  });

  it('should reset boards to empty', () => {
    const oldBoard = createEmptyBoard();
    oldBoard[0][0] = 'hit' as CellStatus;
    const oldState: GameUIState = { ...baseState, ownBoard: oldBoard };
    const action: ServerMessage = { type: 'player_assigned', player_id: 'player1', game_state: 'playing' };
    const state = gameReducer(oldState, action);
    expect(state.ownBoard[0][0]).toBe('empty');
  });
});

describe('gameReducer - waitingForOpponent', () => {

  it('should default waitingForOpponent to false', () => {
    expect(initialGameState.waitingForOpponent).toBe(false);
  });

  it('should set waitingForOpponent to true on game_continued', () => {
    const action = { type: 'game_continued' as const, message: 'Switched to new game.' };
    const state = gameReducer(baseState, action);
    expect(state.waitingForOpponent).toBe(true);
  });

  it('should preserve waitingForOpponent through player_assigned', () => {
    const waitingState: GameUIState = { ...baseState, waitingForOpponent: true };
    const action: ServerMessage = { type: 'player_assigned', player_id: 'player1', game_state: 'playing' };
    const state = gameReducer(waitingState, action);
    expect(state.waitingForOpponent).toBe(true);
  });

  it('should not set waitingForOpponent on normal player_assigned', () => {
    const action: ServerMessage = { type: 'player_assigned', player_id: 'player1', game_state: 'waiting' };
    const state = gameReducer(baseState, action);
    expect(state.waitingForOpponent).toBe(false);
  });

  it('should preserve waitingForOpponent through game_resumed', () => {
    const waitingState: GameUIState = { ...baseState, waitingForOpponent: true };
    const action: ServerMessage = {
      type: 'game_resumed',
      own_board: createEmptyBoard(),
      opponent_board: createEmptyBoard(),
      current_turn: 'player1',
      game_state: 'playing',
      winner: null,
      planes_placed: 2,
    };
    const state = gameReducer(waitingState, action);
    expect(state.waitingForOpponent).toBe(true);
  });

  it('should preserve message through game_resumed when waiting for opponent', () => {
    const waitingState: GameUIState = { ...baseState, waitingForOpponent: true, message: 'Waiting for opponent...' };
    const action: ServerMessage = {
      type: 'game_resumed',
      own_board: createEmptyBoard(),
      opponent_board: createEmptyBoard(),
      current_turn: 'player1',
      game_state: 'playing',
      winner: null,
      planes_placed: 2,
    };
    const state = gameReducer(waitingState, action);
    expect(state.message).toBe('Waiting for opponent...');
  });

  it('should clear waitingForOpponent on game_ready', () => {
    const waitingState: GameUIState = { ...baseState, waitingForOpponent: true };
    const action: ServerMessage = { type: 'game_ready', message: 'Both players connected.' };
    const state = gameReducer(waitingState, action);
    expect(state.waitingForOpponent).toBe(false);
  });

  it('should clear waitingForOpponent on player_reconnected', () => {
    const waitingState: GameUIState = { ...baseState, waitingForOpponent: true };
    const action: ServerMessage = { type: 'player_reconnected', player_id: 'player2' };
    const state = gameReducer(waitingState, action);
    expect(state.waitingForOpponent).toBe(false);
    expect(state.opponentConnected).toBe(true);
  });

});

describe('gameReducer - game_over', () => {

  it('should set opponentBoard from game_over message', () => {
    const opponentBoard = createEmptyBoard();
    opponentBoard[0][2] = 'head_hit' as CellStatus;
    opponentBoard[1][0] = 'plane' as CellStatus;

    const playingState = { ...baseState, gameState: 'playing' as const };
    const action: ServerMessage = {
      type: 'game_over',
      winner: 'player1',
      opponent_board: opponentBoard,
    };
    const state = gameReducer(playingState, action);
    expect(state.gameState).toBe('finished');
    expect(state.winner).toBe('player1');
    expect(state.opponentBoard[0][2]).toBe('head_hit');
    expect(state.opponentBoard[1][0]).toBe('plane');
  });
});

// ── Message sequence tests ──────────────────────────────────────────
// These simulate real server message flows that the WebSocket delivers
// in order, chaining dispatches to guard against state leaking between
// steps (the bugs that bit us in production).

describe('gameReducer - message sequences', () => {

  // ── Continue-game flow ──────────────────────────────────────────

  it('continue flow: game_continued → player_assigned → game_resumed → game_ready', () => {
    // Start from a mid-game state with dirty boards
    const midGame: GameUIState = {
      ...baseState,
      gameState: 'playing',
      opponentConnected: false,
      sessionExpired: true,
      planesPlaced: 2,
      ownBoard: (() => { const b = createEmptyBoard(); b[0][0] = 'head'; return b; })(),
      opponentBoard: (() => { const b = createEmptyBoard(); b[1][1] = 'hit'; return b; })(),
    };

    const ownBoard = createEmptyBoard();
    ownBoard[0][0] = 'head' as CellStatus;
    ownBoard[1][2] = 'plane' as CellStatus;
    const oppBoard = createEmptyBoard();
    oppBoard[3][3] = 'hit' as CellStatus;

    // Step 1: game_continued — full reset + waitingForOpponent
    const s1 = gameReducer(midGame, { type: 'game_continued', message: 'Switched to new game.' });
    expect(s1.waitingForOpponent).toBe(true);
    expect(s1.sessionExpired).toBe(false);
    expect(s1.gameState).toBe('waiting');
    expect(s1.ownBoard[0][0]).toBe('empty');  // boards reset

    // Step 2: player_assigned — must preserve waitingForOpponent
    const s2 = gameReducer(s1, {
      type: 'player_assigned', player_id: 'player1', game_state: 'playing',
    } as ServerMessage);
    expect(s2.waitingForOpponent).toBe(true);
    expect(s2.sessionExpired).toBe(false);
    expect(s2.playerId).toBe('player1');
    expect(s2.gameState).toBe('playing');

    // Step 3: game_resumed — restores boards, keeps waitingForOpponent
    const s3 = gameReducer(s2, {
      type: 'game_resumed',
      own_board: ownBoard,
      opponent_board: oppBoard,
      current_turn: 'player2',
      game_state: 'playing',
      winner: null,
      planes_placed: 2,
    } as ServerMessage);
    expect(s3.waitingForOpponent).toBe(true);
    expect(s3.ownBoard[0][0]).toBe('head');
    expect(s3.opponentBoard[3][3]).toBe('hit');
    expect(s3.message).not.toBe('Reconnected to game');  // not overwritten by "Reconnected"

    // Step 4: player_reconnected — opponent joined continued game, overlay cleared
    const s4 = gameReducer(s3, { type: 'player_reconnected', player_id: 'player2' } as ServerMessage);
    expect(s4.waitingForOpponent).toBe(false);
    expect(s4.opponentConnected).toBe(true);
    expect(s4.ownBoard[0][0]).toBe('head');  // boards preserved
    expect(s4.opponentBoard[3][3]).toBe('hit');
  });

  // ── Session expired → continue ─────────────────────────────────

  it('session expired then continue clears all expired state', () => {
    const playing: GameUIState = {
      ...baseState,
      gameState: 'playing',
      planesPlaced: 2,
      opponentConnected: true,
    };

    const s1 = gameReducer(playing, {
      type: 'opponent_session_expired', message: 'Opponent gone.',
    } as ServerMessage);
    expect(s1.sessionExpired).toBe(true);
    expect(s1.opponentConnected).toBe(false);

    const s2 = gameReducer(s1, { type: 'game_continued', message: 'New game.' });
    expect(s2.sessionExpired).toBe(false);
    expect(s2.waitingForOpponent).toBe(true);
    expect(s2.planesPlaced).toBe(0);
    expect(s2.gameState).toBe('waiting');

    const s3 = gameReducer(s2, {
      type: 'player_assigned', player_id: 'player1', game_state: 'playing',
    } as ServerMessage);
    expect(s3.sessionExpired).toBe(false);
    expect(s3.waitingForOpponent).toBe(true);
  });

  // ── Error while waiting for opponent ───────────────────────────

  it('error message during waitingForOpponent does not clear the flag', () => {
    const waiting: GameUIState = {
      ...baseState,
      waitingForOpponent: true,
      message: 'Waiting...',
    };

    const s = gameReducer(waiting, { type: 'error', message: 'Some error' } as ServerMessage);
    expect(s.waitingForOpponent).toBe(true);
    expect(s.message).toBe('Error: Some error');
  });

  // ── Disconnect/reconnect preserves board state ─────────────────

  it('disconnect → reconnect during playing preserves boards and toggles overlay', () => {
    const ownBoard = createEmptyBoard();
    ownBoard[0][0] = 'head' as CellStatus;
    const oppBoard = createEmptyBoard();
    oppBoard[5][5] = 'miss' as CellStatus;

    const playing: GameUIState = {
      ...baseState,
      gameState: 'playing',
      planesPlaced: 2,
      ownBoard,
      opponentBoard: oppBoard,
    };

    const s1 = gameReducer(playing, { type: 'player_disconnected' } as ServerMessage);
    expect(s1.opponentConnected).toBe(false);
    expect(s1.waitingForOpponent).toBe(true);
    expect(s1.ownBoard[0][0]).toBe('head');
    expect(s1.opponentBoard[5][5]).toBe('miss');
    expect(s1.planesPlaced).toBe(2);

    const s2 = gameReducer(s1, { type: 'player_reconnected', player_id: 'player2' } as ServerMessage);
    expect(s2.opponentConnected).toBe(true);
    expect(s2.waitingForOpponent).toBe(false);
    expect(s2.ownBoard[0][0]).toBe('head');
    expect(s2.opponentBoard[5][5]).toBe('miss');
  });

  // ── player_assigned resets stale finished-game state ───────────

  it('player_assigned after a finished game resets winner and boards', () => {
    const finished: GameUIState = {
      ...baseState,
      gameState: 'finished',
      winner: 'player2',
      planesPlaced: 2,
      sessionExpired: true,
      ownBoard: (() => { const b = createEmptyBoard(); b[0][0] = 'head_hit'; return b; })(),
    };

    const s = gameReducer(finished, {
      type: 'player_assigned', player_id: 'player1', game_state: 'waiting',
    } as ServerMessage);
    expect(s.winner).toBeNull();
    expect(s.planesPlaced).toBe(0);
    expect(s.sessionExpired).toBe(false);
    expect(s.ownBoard[0][0]).toBe('empty');
    expect(s.gameState).toBe('waiting');
  });

  // ── Normal game lifecycle ──────────────────────────────────────

  it('full normal game lifecycle: assigned → ready → placed → started → attack → game_over', () => {
    let s = gameReducer(initialGameState, {
      type: 'player_assigned', player_id: 'player1', game_state: 'waiting',
    } as ServerMessage);
    expect(s.gameState).toBe('waiting');
    expect(s.waitingForOpponent).toBe(false);

    s = gameReducer(s, { type: 'game_ready', message: 'Ready' } as ServerMessage);
    expect(s.gameState).toBe('placing');
    expect(s.opponentConnected).toBe(true);

    s = gameReducer(s, {
      type: 'plane_placed', success: true, message: '', planes_count: 1,
    } as ServerMessage);
    expect(s.planesPlaced).toBe(1);

    s = gameReducer(s, {
      type: 'plane_placed', success: true, message: '', planes_count: 2,
    } as ServerMessage);
    expect(s.planesPlaced).toBe(2);

    s = gameReducer(s, { type: 'game_started', current_turn: 'player1' } as ServerMessage);
    expect(s.gameState).toBe('playing');
    expect(s.currentTurn).toBe('player1');

    s = gameReducer(s, {
      type: 'attack_result', x: 3, y: 2, result: 'miss', is_attacker: true,
    } as ServerMessage);
    expect(s.opponentBoard[2][3]).toBe('miss');

    s = gameReducer(s, { type: 'turn_changed', current_turn: 'player2' } as ServerMessage);
    expect(s.currentTurn).toBe('player2');

    s = gameReducer(s, {
      type: 'attack_result', x: 1, y: 1, result: 'hit', is_attacker: false,
    } as ServerMessage);
    expect(s.ownBoard[1][1]).toBe('hit');

    const finalBoard = createEmptyBoard();
    finalBoard[0][0] = 'head_hit' as CellStatus;
    s = gameReducer(s, {
      type: 'game_over', winner: 'player1', opponent_board: finalBoard,
    } as ServerMessage);
    expect(s.gameState).toBe('finished');
    expect(s.winner).toBe('player1');
    expect(s.opponentBoard[0][0]).toBe('head_hit');
  });

  // ── game_continued fully resets mid-game state ─────────────────

  it('game_continued resets every field from a dirty mid-game state', () => {
    const dirty: GameUIState = {
      gameState: 'playing',
      playerId: 'player1',
      currentTurn: 'player2',
      ownBoard: (() => { const b = createEmptyBoard(); b[0][0] = 'head'; b[1][1] = 'hit'; return b; })(),
      opponentBoard: (() => { const b = createEmptyBoard(); b[5][5] = 'miss'; return b; })(),
      message: 'old message',
      winner: 'player2',
      planesPlaced: 2,
      maxPlanes: 2,
      gameMode: 'classic',
      opponentConnected: false,
      sessionExpired: true,
      waitingForOpponent: false,
    };

    const s = gameReducer(dirty, { type: 'game_continued', message: 'New game.' });
    expect(s.gameState).toBe('waiting');
    expect(s.playerId).toBeNull();
    expect(s.currentTurn).toBe('player1');
    expect(s.ownBoard[0][0]).toBe('empty');
    expect(s.ownBoard[1][1]).toBe('empty');
    expect(s.opponentBoard[5][5]).toBe('empty');
    expect(s.winner).toBeNull();
    expect(s.planesPlaced).toBe(0);
    expect(s.opponentConnected).toBe(true);
    expect(s.sessionExpired).toBe(false);
    expect(s.waitingForOpponent).toBe(true);
    expect(s.message).toBe('New game.');
  });

  // ── Stale attack_result after game_over ────────────────────────

  it('attack_result after game_over still applies to board without crashing', () => {
    const finished: GameUIState = {
      ...baseState,
      gameState: 'finished',
      winner: 'player1',
    };

    // A stale attack_result arriving after game_over should not throw
    const s = gameReducer(finished, {
      type: 'attack_result', x: 0, y: 0, result: 'hit', is_attacker: true,
    } as ServerMessage);
    expect(s.gameState).toBe('finished');  // unchanged
    expect(s.opponentBoard[0][0]).toBe('hit');  // applied but harmless
  });

  // ── Rapid disconnect/reconnect ─────────────────────────────────

  it('rapid disconnect → reconnect → disconnect toggles correctly', () => {
    const playing: GameUIState = { ...baseState, gameState: 'playing', opponentConnected: true };

    const s1 = gameReducer(playing, { type: 'player_disconnected' } as ServerMessage);
    expect(s1.opponentConnected).toBe(false);
    expect(s1.waitingForOpponent).toBe(true);

    const s2 = gameReducer(s1, { type: 'player_reconnected', player_id: 'p2' } as ServerMessage);
    expect(s2.opponentConnected).toBe(true);
    expect(s2.waitingForOpponent).toBe(false);

    const s3 = gameReducer(s2, { type: 'player_disconnected' } as ServerMessage);
    expect(s3.opponentConnected).toBe(false);
    expect(s3.waitingForOpponent).toBe(true);
    expect(s3.gameState).toBe('playing');  // game state preserved throughout
  });

  // ── Disconnect → session expired transitions overlay to banner ──

  it('disconnect → session expired replaces cloud overlay with expired banner', () => {
    const playing: GameUIState = { ...baseState, gameState: 'playing', opponentConnected: true };

    const s1 = gameReducer(playing, { type: 'player_disconnected' } as ServerMessage);
    expect(s1.waitingForOpponent).toBe(true);
    expect(s1.sessionExpired).toBe(false);

    const s2 = gameReducer(s1, {
      type: 'opponent_session_expired', message: 'Session gone.',
    } as ServerMessage);
    expect(s2.waitingForOpponent).toBe(false);
    expect(s2.sessionExpired).toBe(true);
  });
});

// ── Game mode support ──────────────────────────────────────────────────

describe('gameReducer - game mode', () => {

  it('should default maxPlanes to 2 and gameMode to classic', () => {
    expect(initialGameState.maxPlanes).toBe(2);
    expect(initialGameState.gameMode).toBe('classic');
  });

  it('player_assigned should set mode and maxPlanes from server', () => {
    const action: ServerMessage = {
      type: 'player_assigned',
      player_id: 'player1',
      game_state: 'placing',
      max_planes: 3,
      mode: 'elite',
    };
    const state = gameReducer(initialGameState, action);
    expect(state.maxPlanes).toBe(3);
    expect(state.gameMode).toBe('elite');
  });

  it('player_assigned without mode defaults to classic/2', () => {
    const action: ServerMessage = {
      type: 'player_assigned',
      player_id: 'player1',
      game_state: 'waiting',
    };
    const state = gameReducer(initialGameState, action);
    expect(state.maxPlanes).toBe(2);
    expect(state.gameMode).toBe('classic');
  });

  it('game_continued should reset maxPlanes and gameMode to defaults', () => {
    const eliteState: GameUIState = {
      ...baseState,
      maxPlanes: 3,
      gameMode: 'elite',
      planesPlaced: 3,
    };
    const state = gameReducer(eliteState, { type: 'game_continued', message: 'New game.' });
    expect(state.maxPlanes).toBe(2);
    expect(state.gameMode).toBe('classic');
  });

  it('plane_placed message reflects remaining count for elite mode', () => {
    const eliteState: GameUIState = { ...baseState, maxPlanes: 3, gameMode: 'elite' };

    // 1 of 3 placed → "2 more planes"
    const s1 = gameReducer(eliteState, {
      type: 'plane_placed', success: true, message: 'OK', planes_count: 1,
    } as ServerMessage);
    expect(s1.planesPlaced).toBe(1);
    expect(s1.message).toContain('2 more planes');

    // 2 of 3 placed → "1 more plane" (singular)
    const s2 = gameReducer({ ...eliteState, planesPlaced: 1 }, {
      type: 'plane_placed', success: true, message: 'OK', planes_count: 2,
    } as ServerMessage);
    expect(s2.message).toContain('1 more plane');
    expect(s2.message).not.toContain('planes');

    // 3 of 3 placed → "Waiting for opponent"
    const s3 = gameReducer({ ...eliteState, planesPlaced: 2 }, {
      type: 'plane_placed', success: true, message: 'OK', planes_count: 3,
    } as ServerMessage);
    expect(s3.planesPlaced).toBe(3);
    expect(s3.message).toContain('Waiting for opponent');
  });
});
