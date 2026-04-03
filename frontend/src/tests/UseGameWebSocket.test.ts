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

  simulateUnexpectedClose() {
    this.readyState = MockWebSocket.CLOSED;
    this.onclose?.({});
  }
}

// Apply mock globally
const OriginalWebSocket = globalThis.WebSocket;

beforeEach(() => {
  MockWebSocket.instances = [];
  (globalThis as any).WebSocket = MockWebSocket;
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
  (globalThis as any).WebSocket = OriginalWebSocket;
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

    it('should transition to "connected" on successful open', () => {
      const onMessage = vi.fn();
      const { result } = renderHook(() =>
        useGameWebSocket({ gameId: 'game-123', onMessage })
      );

      act(() => latestWS().simulateOpen());

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

    it('should call onClose on intentional close', () => {
      const onMessage = vi.fn();
      const onClose = vi.fn();
      const { unmount } = renderHook(() =>
        useGameWebSocket({ gameId: 'game-123', onMessage, onClose })
      );

      act(() => latestWS().simulateOpen());
      act(() => unmount());

      expect(onClose).toHaveBeenCalledOnce();
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

      expect(latestWS().sentMessages).toHaveLength(1);
      expect(JSON.parse(latestWS().sentMessages[0])).toEqual({
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

      expect(JSON.parse(latestWS().sentMessages[0])).toEqual({
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

    it('should reset retry count on successful reconnection', () => {
      const onMessage = vi.fn();
      renderHook(() =>
        useGameWebSocket({ gameId: 'game-123', onMessage })
      );

      act(() => latestWS().simulateOpen());

      // First disconnect -> 1000ms backoff
      act(() => latestWS().simulateUnexpectedClose());
      act(() => vi.advanceTimersByTime(1000));
      expect(MockWebSocket.instances).toHaveLength(2);

      // Successful reconnect resets counter
      act(() => latestWS().simulateOpen());

      // Next disconnect should use 1000ms again (not 2000ms)
      act(() => latestWS().simulateUnexpectedClose());

      act(() => vi.advanceTimersByTime(999));
      expect(MockWebSocket.instances).toHaveLength(2); // not yet

      act(() => vi.advanceTimersByTime(1));
      expect(MockWebSocket.instances).toHaveLength(3); // back to 1s
    });

    it('should restore "connected" status after successful reconnection', () => {
      const onMessage = vi.fn();
      const { result } = renderHook(() =>
        useGameWebSocket({ gameId: 'game-123', onMessage })
      );

      act(() => latestWS().simulateOpen());
      expect(result.current.connectionStatus).toBe('connected');

      act(() => latestWS().simulateUnexpectedClose());
      expect(result.current.connectionStatus).toBe('reconnecting');

      act(() => vi.advanceTimersByTime(1000));
      act(() => latestWS().simulateOpen());

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
  });
});
