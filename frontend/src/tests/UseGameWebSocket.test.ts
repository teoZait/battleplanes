import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useGameWebSocket, type ServerMessage } from '../hooks/UseGameWebSocket';

// --- Mock WebSocket ---

type WSHandler = ((event: any) => void) | null;

class MockWebSocket {
  static CONNECTING = 0;
  static OPEN = 1;
  static CLOSING = 2;
  static CLOSED = 3;

  static instances: MockWebSocket[] = [];

  url: string;
  readyState: number = MockWebSocket.CONNECTING;
  onopen: WSHandler = null;
  onclose: WSHandler = null;
  onmessage: WSHandler = null;
  onerror: WSHandler = null;
  sentMessages: string[] = [];

  constructor(url: string) {
    this.url = url;
    MockWebSocket.instances.push(this);
  }

  send(data: string) {
    this.sentMessages.push(data);
  }

  close() {
    this.readyState = MockWebSocket.CLOSED;
    this.onclose?.({});
  }

  // Test helpers
  simulateOpen() {
    this.readyState = MockWebSocket.OPEN;
    this.onopen?.({});
  }

  simulateMessage(data: ServerMessage) {
    this.onmessage?.({ data: JSON.stringify(data) });
  }

  simulateError() {
    this.onerror?.({});
  }

  /** Simulate server accepting the connection (sends player_assigned message) */
  simulateAuth(sessionToken?: string) {
    const msg: any = { type: 'player_assigned', player_id: 'p1', game_state: 'waiting' };
    if (sessionToken) msg.session_token = sessionToken;
    this.simulateMessage(msg);
  }

  simulateUnexpectedClose() {
    this.readyState = MockWebSocket.CLOSED;
    this.onclose?.({});
  }

  /** Simulate server rejecting the connection with a specific close code. */
  simulateReject(code: number) {
    this.readyState = MockWebSocket.CLOSED;
    this.onclose?.({ code });
  }
}

// Apply mock globally
const OriginalWebSocket = globalThis.WebSocket;

// Mock localStorage (jsdom doesn't always provide a full implementation)
const localStorageMock = (() => {
  let store: Record<string, string> = {};
  return {
    getItem: (key: string) => store[key] ?? null,
    setItem: (key: string, value: string) => { store[key] = value; },
    removeItem: (key: string) => { delete store[key]; },
    clear: () => { store = {}; },
    get length() { return Object.keys(store).length; },
    key: (i: number) => Object.keys(store)[i] ?? null,
  };
})();
Object.defineProperty(globalThis, 'localStorage', { value: localStorageMock, writable: true });

beforeEach(() => {
  MockWebSocket.instances = [];
  (globalThis as any).WebSocket = MockWebSocket;
  vi.useFakeTimers();
  // Zero jitter by default so existing exact-timing tests pass
  vi.spyOn(Math, 'random').mockReturnValue(0);
  localStorageMock.clear();
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  (globalThis as any).WebSocket = OriginalWebSocket;
  localStorageMock.clear();
});

// Helper to get the latest MockWebSocket instance
function latestWS(): MockWebSocket {
  return MockWebSocket.instances[MockWebSocket.instances.length - 1];
}

describe('useGameWebSocket', () => {

  // ==========================================================================
  // CONNECTION LIFECYCLE
  // ==========================================================================

  describe('Connection Lifecycle', () => {

    it('should not connect when gameId is null', () => {
      const onMessage = vi.fn();
      renderHook(() => useGameWebSocket({ gameId: null, onMessage }));

      expect(MockWebSocket.instances).toHaveLength(0);
    });

    it('should connect when gameId is provided', () => {
      const onMessage = vi.fn();
      renderHook(() => useGameWebSocket({ gameId: 'game-123', onMessage }));

      expect(MockWebSocket.instances).toHaveLength(1);
      expect(latestWS().url).toContain('/ws/game-123');
    });

    it('should start with "connecting" status when gameId is set', () => {
      const onMessage = vi.fn();
      const { result } = renderHook(() =>
        useGameWebSocket({ gameId: 'game-123', onMessage })
      );

      expect(result.current.connectionStatus).toBe('connecting');
    });

    it('should stay "connecting" after open until server confirms via player_assigned', () => {
      const onMessage = vi.fn();
      const { result } = renderHook(() =>
        useGameWebSocket({ gameId: 'game-123', onMessage })
      );

      act(() => latestWS().simulateOpen());
      // Still connecting — server hasn't confirmed auth yet
      expect(result.current.connectionStatus).toBe('connecting');

      act(() => latestWS().simulateAuth());
      expect(result.current.connectionStatus).toBe('connected');
    });

    it('should call onOpen callback when connection opens', () => {
      const onMessage = vi.fn();
      const onOpen = vi.fn();
      renderHook(() =>
        useGameWebSocket({ gameId: 'game-123', onMessage, onOpen })
      );

      act(() => latestWS().simulateOpen());

      expect(onOpen).toHaveBeenCalledOnce();
    });

    it('should close WebSocket on unmount', () => {
      const onMessage = vi.fn();
      const { unmount } = renderHook(() =>
        useGameWebSocket({ gameId: 'game-123', onMessage })
      );

      const ws = latestWS();
      act(() => ws.simulateOpen());

      act(() => unmount());

      expect(ws.readyState).toBe(MockWebSocket.CLOSED);
    });

    it('should not call onClose on intentional close (unmount/game switch)', () => {
      const onMessage = vi.fn();
      const onClose = vi.fn();
      const { unmount } = renderHook(() =>
        useGameWebSocket({ gameId: 'game-123', onMessage, onClose })
      );

      act(() => latestWS().simulateOpen());
      act(() => unmount());

      expect(onClose).not.toHaveBeenCalled();
    });

    it('should close previous connection when gameId changes', () => {
      const onMessage = vi.fn();
      const { rerender } = renderHook(
        ({ gameId }) => useGameWebSocket({ gameId, onMessage }),
        { initialProps: { gameId: 'game-1' as string | null } }
      );

      const firstWS = latestWS();
      act(() => firstWS.simulateOpen());

      act(() => rerender({ gameId: 'game-2' }));

      expect(firstWS.readyState).toBe(MockWebSocket.CLOSED);
      expect(MockWebSocket.instances).toHaveLength(2);
      expect(latestWS().url).toContain('/ws/game-2');
    });
  });

  // ==========================================================================
  // AUTH HANDSHAKE
  // ==========================================================================

  describe('Auth Handshake', () => {

    it('should send auth message with null token on first connection', () => {
      const onMessage = vi.fn();
      renderHook(() => useGameWebSocket({ gameId: 'game-123', onMessage }));

      act(() => latestWS().simulateOpen());

      expect(latestWS().sentMessages).toHaveLength(1);
      expect(JSON.parse(latestWS().sentMessages[0])).toEqual({
        type: 'auth',
        token: null,
      });
    });

    it('should send stored session token on reconnection', () => {
      const onMessage = vi.fn();
      renderHook(() => useGameWebSocket({ gameId: 'game-123', onMessage }));

      // First connection — receive a session token
      act(() => latestWS().simulateOpen());
      act(() => latestWS().simulateAuth('secret-token-123'));

      // Disconnect and reconnect
      act(() => latestWS().simulateUnexpectedClose());
      act(() => vi.advanceTimersByTime(1000));
      act(() => latestWS().simulateOpen());

      expect(JSON.parse(latestWS().sentMessages[0])).toEqual({
        type: 'auth',
        token: 'secret-token-123',
      });
    });

    it('should persist session token to localStorage', () => {
      const onMessage = vi.fn();
      renderHook(() => useGameWebSocket({ gameId: 'game-123', onMessage }));

      act(() => latestWS().simulateOpen());
      act(() => latestWS().simulateAuth('persisted-token'));

      expect(localStorage.getItem('game_token_game-123')).toBe('persisted-token');
    });

    it('should restore session token from localStorage on mount (tab reopen)', () => {
      // Simulate a previous session having stored a token
      localStorage.setItem('game_token_game-123', 'saved-token');

      const onMessage = vi.fn();
      renderHook(() => useGameWebSocket({ gameId: 'game-123', onMessage }));

      act(() => latestWS().simulateOpen());

      // Should send the token from localStorage, not null
      expect(JSON.parse(latestWS().sentMessages[0])).toEqual({
        type: 'auth',
        token: 'saved-token',
      });
    });

    it('should not leak tokens between different game IDs', () => {
      localStorage.setItem('game_token_game-AAA', 'token-aaa');

      const onMessage = vi.fn();
      renderHook(() => useGameWebSocket({ gameId: 'game-BBB', onMessage }));

      act(() => latestWS().simulateOpen());

      // Should NOT pick up game-AAA's token
      expect(JSON.parse(latestWS().sentMessages[0])).toEqual({
        type: 'auth',
        token: null,
      });
    });
  });

  // ==========================================================================
  // MESSAGE HANDLING
  // ==========================================================================

  describe('Message Handling', () => {

    it('should call onMessage with parsed server message', () => {
      const onMessage = vi.fn();
      renderHook(() => useGameWebSocket({ gameId: 'game-123', onMessage }));

      act(() => latestWS().simulateOpen());

      const msg: ServerMessage = { type: 'player_assigned', player_id: 'p1', game_state: 'waiting' };
      act(() => latestWS().simulateMessage(msg));

      expect(onMessage).toHaveBeenCalledWith(msg);
    });

    it('should handle multiple messages', () => {
      const onMessage = vi.fn();
      renderHook(() => useGameWebSocket({ gameId: 'game-123', onMessage }));

      act(() => latestWS().simulateOpen());

      const msg1: ServerMessage = { type: 'game_ready', message: 'Both players connected' };
      const msg2: ServerMessage = { type: 'game_started', current_turn: 'p1' };
      act(() => {
        latestWS().simulateMessage(msg1);
        latestWS().simulateMessage(msg2);
      });

      expect(onMessage).toHaveBeenCalledTimes(2);
      expect(onMessage).toHaveBeenCalledWith(msg1);
      expect(onMessage).toHaveBeenCalledWith(msg2);
    });
  });

  // ==========================================================================
  // SEND
  // ==========================================================================

  describe('send()', () => {

    it('should send JSON-stringified payload when connected', () => {
      const onMessage = vi.fn();
      const { result } = renderHook(() =>
        useGameWebSocket({ gameId: 'game-123', onMessage })
      );

      act(() => latestWS().simulateOpen());

      act(() => result.current.send({ type: 'attack', x: 3, y: 5 }));

      // sentMessages[0] is the auth handshake, [1] is the user message
      expect(latestWS().sentMessages).toHaveLength(2);
      expect(JSON.parse(latestWS().sentMessages[1])).toEqual({
        type: 'attack', x: 3, y: 5,
      });
    });

    it('should not send when WebSocket is not open', () => {
      const onMessage = vi.fn();
      const { result } = renderHook(() =>
        useGameWebSocket({ gameId: 'game-123', onMessage })
      );

      // Still CONNECTING, not OPEN
      act(() => result.current.send({ type: 'attack', x: 0, y: 0 }));

      expect(latestWS().sentMessages).toHaveLength(0);
    });

    it('should send place_plane messages correctly', () => {
      const onMessage = vi.fn();
      const { result } = renderHook(() =>
        useGameWebSocket({ gameId: 'game-123', onMessage })
      );

      act(() => latestWS().simulateOpen());

      act(() =>
        result.current.send({ type: 'place_plane', head_x: 5, head_y: 2, orientation: 'up' })
      );

      expect(JSON.parse(latestWS().sentMessages[1])).toEqual({
        type: 'place_plane', head_x: 5, head_y: 2, orientation: 'up',
      });
    });
  });

  // ==========================================================================
  // ERROR HANDLING
  // ==========================================================================

  describe('Error Handling', () => {

    it('should call onError when WebSocket errors', () => {
      const onMessage = vi.fn();
      const onError = vi.fn();
      renderHook(() =>
        useGameWebSocket({ gameId: 'game-123', onMessage, onError })
      );

      act(() => latestWS().simulateError());

      expect(onError).toHaveBeenCalledWith('WebSocket error');
    });
  });

  // ==========================================================================
  // RECONNECTION WITH EXPONENTIAL BACKOFF
  // ==========================================================================

  describe('Reconnection', () => {

    it('should attempt reconnection on unexpected close', () => {
      const onMessage = vi.fn();
      const { result } = renderHook(() =>
        useGameWebSocket({ gameId: 'game-123', onMessage })
      );

      act(() => latestWS().simulateOpen());
      expect(MockWebSocket.instances).toHaveLength(1);

      // Simulate unexpected close (server crash, network drop)
      act(() => latestWS().simulateUnexpectedClose());

      expect(result.current.connectionStatus).toBe('reconnecting');

      // Advance past first backoff (1000ms)
      act(() => vi.advanceTimersByTime(1000));

      expect(MockWebSocket.instances).toHaveLength(2);
    });

    it('should set status to "reconnecting" during backoff', () => {
      const onMessage = vi.fn();
      const { result } = renderHook(() =>
        useGameWebSocket({ gameId: 'game-123', onMessage })
      );

      act(() => latestWS().simulateOpen());
      act(() => latestWS().simulateUnexpectedClose());

      expect(result.current.connectionStatus).toBe('reconnecting');
    });

    it('should use exponential backoff delays', () => {
      const onMessage = vi.fn();
      renderHook(() =>
        useGameWebSocket({ gameId: 'game-123', onMessage })
      );

      act(() => latestWS().simulateOpen());

      // First unexpected close -> 1000ms backoff
      act(() => latestWS().simulateUnexpectedClose());
      expect(MockWebSocket.instances).toHaveLength(1);

      act(() => vi.advanceTimersByTime(999));
      expect(MockWebSocket.instances).toHaveLength(1); // not yet

      act(() => vi.advanceTimersByTime(1));
      expect(MockWebSocket.instances).toHaveLength(2); // reconnect #1

      // Second unexpected close -> 2000ms backoff
      act(() => latestWS().simulateUnexpectedClose());

      act(() => vi.advanceTimersByTime(1999));
      expect(MockWebSocket.instances).toHaveLength(2); // not yet

      act(() => vi.advanceTimersByTime(1));
      expect(MockWebSocket.instances).toHaveLength(3); // reconnect #2

      // Third unexpected close -> 4000ms backoff
      act(() => latestWS().simulateUnexpectedClose());

      act(() => vi.advanceTimersByTime(3999));
      expect(MockWebSocket.instances).toHaveLength(3); // not yet

      act(() => vi.advanceTimersByTime(1));
      expect(MockWebSocket.instances).toHaveLength(4); // reconnect #3
    });

    it('should cap backoff at 30 seconds', () => {
      const onMessage = vi.fn();
      renderHook(() =>
        useGameWebSocket({ gameId: 'game-123', onMessage })
      );

      act(() => latestWS().simulateOpen());

      // Burn through retries: 1s, 2s, 4s, 8s, 16s, 32s->capped at 30s
      for (let i = 0; i < 5; i++) {
        act(() => latestWS().simulateUnexpectedClose());
        act(() => vi.advanceTimersByTime(30000));
      }

      // Now at retry 5: 1000 * 2^5 = 32000, capped to 30000
      act(() => latestWS().simulateUnexpectedClose());
      const countBefore = MockWebSocket.instances.length;

      act(() => vi.advanceTimersByTime(29999));
      expect(MockWebSocket.instances).toHaveLength(countBefore); // not yet

      act(() => vi.advanceTimersByTime(1));
      expect(MockWebSocket.instances).toHaveLength(countBefore + 1); // capped at 30s
    });

    it('should reset retry count on successful reconnection (player_assigned)', () => {
      const onMessage = vi.fn();
      renderHook(() =>
        useGameWebSocket({ gameId: 'game-123', onMessage })
      );

      act(() => latestWS().simulateOpen());
      act(() => latestWS().simulateAuth());

      // First disconnect -> 1000ms backoff
      act(() => latestWS().simulateUnexpectedClose());
      act(() => vi.advanceTimersByTime(1000));
      expect(MockWebSocket.instances).toHaveLength(2);

      // Successful reconnect (server confirms) resets counter
      act(() => {
        latestWS().simulateOpen();
        latestWS().simulateAuth();
      });

      // Next disconnect should use 1000ms again (not 2000ms)
      act(() => latestWS().simulateUnexpectedClose());

      act(() => vi.advanceTimersByTime(999));
      expect(MockWebSocket.instances).toHaveLength(2); // not yet

      act(() => vi.advanceTimersByTime(1));
      expect(MockWebSocket.instances).toHaveLength(3); // back to 1s
    });

    it('should restore "connected" status after successful reconnection (player_assigned)', () => {
      const onMessage = vi.fn();
      const { result } = renderHook(() =>
        useGameWebSocket({ gameId: 'game-123', onMessage })
      );

      act(() => latestWS().simulateOpen());
      act(() => latestWS().simulateAuth());
      expect(result.current.connectionStatus).toBe('connected');

      act(() => latestWS().simulateUnexpectedClose());
      expect(result.current.connectionStatus).toBe('reconnecting');

      act(() => vi.advanceTimersByTime(1000));
      act(() => {
        latestWS().simulateOpen();
        latestWS().simulateAuth();
      });

      expect(result.current.connectionStatus).toBe('connected');
    });

    it('should not reconnect on intentional close (unmount)', () => {
      const onMessage = vi.fn();
      const { unmount } = renderHook(() =>
        useGameWebSocket({ gameId: 'game-123', onMessage })
      );

      act(() => latestWS().simulateOpen());
      const countBeforeUnmount = MockWebSocket.instances.length;

      act(() => unmount());

      // Advance plenty of time — no new connections should appear
      act(() => vi.advanceTimersByTime(60000));

      expect(MockWebSocket.instances).toHaveLength(countBeforeUnmount);
    });

    it('should cancel pending reconnection timer on unmount', () => {
      const onMessage = vi.fn();
      const { unmount } = renderHook(() =>
        useGameWebSocket({ gameId: 'game-123', onMessage })
      );

      act(() => latestWS().simulateOpen());
      act(() => latestWS().simulateUnexpectedClose());
      // reconnection timer is now pending

      const countBeforeUnmount = MockWebSocket.instances.length;
      act(() => unmount());

      // Timer would have fired at 1000ms — it should be cancelled
      act(() => vi.advanceTimersByTime(5000));

      expect(MockWebSocket.instances).toHaveLength(countBeforeUnmount);
    });

    it('should cancel pending reconnection when gameId changes', () => {
      const onMessage = vi.fn();
      const { rerender } = renderHook(
        ({ gameId }) => useGameWebSocket({ gameId, onMessage }),
        { initialProps: { gameId: 'game-1' as string | null } }
      );

      act(() => latestWS().simulateOpen());
      act(() => latestWS().simulateUnexpectedClose());
      // Reconnection timer pending for game-1

      const countBefore = MockWebSocket.instances.length;

      // Switch to a new game
      act(() => rerender({ gameId: 'game-2' }));

      // Advance past old timer
      act(() => vi.advanceTimersByTime(5000));

      // Only one new connection (for game-2), not two (game-1 retry + game-2)
      const newConnections = MockWebSocket.instances.slice(countBefore);
      const game2Connections = newConnections.filter(ws => ws.url.includes('game-2'));
      const game1Connections = newConnections.filter(ws => ws.url.includes('game-1'));

      expect(game2Connections.length).toBeGreaterThanOrEqual(1);
      expect(game1Connections).toHaveLength(0);
    });

    it('should stop reconnecting after max retries (10)', () => {
      const onMessage = vi.fn();
      const onClose = vi.fn();
      const { result } = renderHook(() =>
        useGameWebSocket({ gameId: 'game-123', onMessage, onClose })
      );

      act(() => latestWS().simulateOpen());

      // Exhaust all 10 retries
      for (let i = 0; i < 10; i++) {
        act(() => latestWS().simulateUnexpectedClose());
        act(() => vi.advanceTimersByTime(30000)); // always enough
      }

      const countAfterRetries = MockWebSocket.instances.length;

      // 11th close should give up — no more connections
      act(() => latestWS().simulateUnexpectedClose());

      // Advance plenty of time
      act(() => vi.advanceTimersByTime(60000));

      expect(MockWebSocket.instances).toHaveLength(countAfterRetries);
      expect(result.current.connectionStatus).toBe('disconnected');
      expect(onClose).toHaveBeenCalled();
    });

    it('should reset max retry counter on successful reconnection (player_assigned)', () => {
      const onMessage = vi.fn();
      const { result } = renderHook(() =>
        useGameWebSocket({ gameId: 'game-123', onMessage })
      );

      act(() => latestWS().simulateOpen());
      act(() => latestWS().simulateAuth());

      // Use up 9 retries (one short of max)
      for (let i = 0; i < 9; i++) {
        act(() => latestWS().simulateUnexpectedClose());
        act(() => vi.advanceTimersByTime(30000));
      }

      // Successful reconnect (server confirms via player_assigned) resets counter
      act(() => {
        latestWS().simulateOpen();
        latestWS().simulateAuth();
      });

      // Should be able to retry 10 more times
      for (let i = 0; i < 10; i++) {
        act(() => latestWS().simulateUnexpectedClose());
        act(() => vi.advanceTimersByTime(30000));
      }

      // 11th failure after reset should give up
      act(() => latestWS().simulateUnexpectedClose());
      act(() => vi.advanceTimersByTime(60000));

      expect(result.current.connectionStatus).toBe('disconnected');
    });

    it('should add jitter to backoff delay', () => {
      // Override Math.random to return 1 → max jitter (50% of base delay)
      vi.spyOn(Math, 'random').mockReturnValue(1);

      const onMessage = vi.fn();
      renderHook(() =>
        useGameWebSocket({ gameId: 'game-123', onMessage })
      );

      act(() => latestWS().simulateOpen());
      act(() => latestWS().simulateUnexpectedClose());

      // Base delay = 1000ms, jitter = 1 * 0.5 * 1000 = 500ms, total = 1500ms
      act(() => vi.advanceTimersByTime(1000));
      expect(MockWebSocket.instances).toHaveLength(1); // not yet at 1000ms

      act(() => vi.advanceTimersByTime(500));
      expect(MockWebSocket.instances).toHaveLength(2); // reconnects at 1500ms
    });
  });

  // ==========================================================================
  // AUTH REJECTION (regression tests for infinite retry loop bug)
  // ==========================================================================

  describe('Auth Rejection', () => {

    it('should not reset retry counter when open fires without player_assigned', () => {
      const onMessage = vi.fn();
      const { result } = renderHook(() =>
        useGameWebSocket({ gameId: 'game-123', onMessage })
      );

      // Open but no player_assigned — status should stay 'connecting'
      act(() => latestWS().simulateOpen());
      expect(result.current.connectionStatus).toBe('connecting');

      // Server closes (auth rejection)
      act(() => latestWS().simulateUnexpectedClose());
      expect(result.current.connectionStatus).toBe('reconnecting');

      // After backoff, reconnect opens — still no player_assigned
      act(() => vi.advanceTimersByTime(1000));
      act(() => latestWS().simulateOpen());

      // Status should be 'reconnecting', NOT 'connected'
      expect(result.current.connectionStatus).toBe('reconnecting');
    });

    it('should use increasing backoff when auth is rejected after each open', () => {
      const onMessage = vi.fn();
      renderHook(() =>
        useGameWebSocket({ gameId: 'game-123', onMessage })
      );

      // First connection: open then server rejects auth
      act(() => latestWS().simulateOpen());
      act(() => latestWS().simulateUnexpectedClose());
      expect(MockWebSocket.instances).toHaveLength(1);

      // Retry 1: should wait 1000ms
      act(() => vi.advanceTimersByTime(999));
      expect(MockWebSocket.instances).toHaveLength(1);
      act(() => vi.advanceTimersByTime(1));
      expect(MockWebSocket.instances).toHaveLength(2);

      // Open and rejected again (no player_assigned)
      act(() => latestWS().simulateOpen());
      act(() => latestWS().simulateUnexpectedClose());

      // Retry 2: should wait 2000ms (counter was NOT reset by open)
      act(() => vi.advanceTimersByTime(1999));
      expect(MockWebSocket.instances).toHaveLength(2);
      act(() => vi.advanceTimersByTime(1));
      expect(MockWebSocket.instances).toHaveLength(3);

      // Open and rejected again
      act(() => latestWS().simulateOpen());
      act(() => latestWS().simulateUnexpectedClose());

      // Retry 3: should wait 4000ms
      act(() => vi.advanceTimersByTime(3999));
      expect(MockWebSocket.instances).toHaveLength(3);
      act(() => vi.advanceTimersByTime(1));
      expect(MockWebSocket.instances).toHaveLength(4);
    });

    it('should give up after max retries when auth is repeatedly rejected', () => {
      const onMessage = vi.fn();
      const onClose = vi.fn();
      const { result } = renderHook(() =>
        useGameWebSocket({ gameId: 'game-123', onMessage, onClose })
      );

      // Initial connection opens, auth sent, but server rejects (closes)
      act(() => latestWS().simulateOpen());
      act(() => latestWS().simulateUnexpectedClose());

      // Each retry: open succeeds, auth rejected (no player_assigned), close fires
      // Need 10 iterations: retryCount goes 0→1, 1→2, ..., 9→10; give up when 10 >= max
      for (let i = 0; i < 10; i++) {
        act(() => vi.advanceTimersByTime(30000));
        act(() => latestWS().simulateOpen());
        act(() => latestWS().simulateUnexpectedClose());
      }

      const countAfter = MockWebSocket.instances.length;

      // Advance more — no new connections should appear
      act(() => vi.advanceTimersByTime(60000));

      expect(MockWebSocket.instances).toHaveLength(countAfter);
      expect(result.current.connectionStatus).toBe('disconnected');
      expect(onClose).toHaveBeenCalled();
    });

    it('should not retry on close code 1008 (auth/game rejection)', () => {
      const onMessage = vi.fn();
      const { result } = renderHook(() =>
        useGameWebSocket({ gameId: 'game-123', onMessage })
      );

      act(() => latestWS().simulateOpen());
      const countBefore = MockWebSocket.instances.length;

      act(() => latestWS().simulateReject(1008));

      act(() => vi.advanceTimersByTime(60000));
      expect(MockWebSocket.instances).toHaveLength(countBefore);
      expect(result.current.connectionStatus).toBe('disconnected');
    });

    it('should not retry on close code 4010 (finished game)', () => {
      const onMessage = vi.fn();
      const { result } = renderHook(() =>
        useGameWebSocket({ gameId: 'game-123', onMessage })
      );

      act(() => latestWS().simulateOpen());
      const countBefore = MockWebSocket.instances.length;

      act(() => latestWS().simulateReject(4010));

      act(() => vi.advanceTimersByTime(60000));
      expect(MockWebSocket.instances).toHaveLength(countBefore);
      expect(result.current.connectionStatus).toBe('disconnected');
    });

    it('should not call onClose on server rejection codes (error already sent)', () => {
      const onMessage = vi.fn();
      const onClose = vi.fn();
      renderHook(() =>
        useGameWebSocket({ gameId: 'game-123', onMessage, onClose })
      );

      act(() => latestWS().simulateOpen());
      act(() => latestWS().simulateReject(1008));

      expect(onClose).not.toHaveBeenCalled();
    });

    it('should not enter infinite retry loop when server always rejects auth', () => {
      const onMessage = vi.fn();
      renderHook(() =>
        useGameWebSocket({ gameId: 'game-123', onMessage })
      );

      // Simulate the exact bug scenario: open resets counter, close retries from 0
      // With the fix, this should NOT create unlimited connections
      for (let attempt = 0; attempt < 20; attempt++) {
        const ws = latestWS();
        if (ws.readyState === MockWebSocket.CONNECTING) {
          act(() => ws.simulateOpen());
          // Server rejects auth — closes connection without player_assigned
          act(() => ws.simulateUnexpectedClose());
        }
        act(() => vi.advanceTimersByTime(30000));
      }

      // Should have stopped well before 20 connections (max retries is 10)
      expect(MockWebSocket.instances.length).toBeLessThanOrEqual(11); // 1 initial + 10 retries
    });
  });
});
