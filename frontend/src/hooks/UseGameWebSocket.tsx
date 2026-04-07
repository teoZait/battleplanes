import { useEffect, useRef, useState, useCallback } from 'react';

export type CellStatus = 'empty' | 'plane' | 'head' | 'hit' | 'miss' | 'head_hit';

export type ServerMessage =
  | { type: 'player_assigned'; player_id: string; game_state: 'waiting' | 'placing' | 'playing' | 'finished'; session_token?: string }
  | { type: 'game_ready'; message: string }
  | { type: 'plane_placed'; success: boolean; message: string; planes_count: number }
  | { type: 'game_started'; current_turn: string }
  | { type: 'attack_result'; x: number; y: number; result: string; is_attacker: boolean }
  | { type: 'turn_changed'; current_turn: string }
  | { type: 'game_over'; winner: string; opponent_board: CellStatus[][] }
  | { type: 'game_resumed'; own_board: CellStatus[][]; opponent_board: CellStatus[][]; current_turn: string; game_state?: string; winner?: string | null }
  | { type: 'player_disconnected' }
  | { type: 'player_reconnected'; player_id: string }
  | { type: 'error'; message: string };

export type ClientMessage =
  | { type: 'place_plane'; head_x: number; head_y: number; orientation: string }
  | { type: 'attack'; x: number; y: number };

export type ConnectionStatus = 'disconnected' | 'connecting' | 'connected' | 'reconnecting';

// Derive the WebSocket URL from the current page origin so connections
// go through nginx (same-origin) and avoid CORS issues.
const WS_URL = import.meta.env.VITE_WS_URL
  || `${window.location.protocol === 'https:' ? 'wss:' : 'ws:'}//${window.location.host}`;

const BACKOFF_BASE = 1000;
const BACKOFF_MAX = 30000;
const BACKOFF_MAX_RETRIES = 10;

export function useGameWebSocket(params: {
  gameId: string | null;
  onMessage: (msg: ServerMessage) => void;
  onOpen?: () => void;
  onClose?: () => void;
  onError?: (msg: string) => void;
}) {
  const wsRef = useRef<WebSocket | null>(null);
  const retryCountRef = useRef(0);
  const retryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const intentionalCloseRef = useRef(false);
  const sessionTokenRef = useRef<string | null>(null);
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>('disconnected');

  // Persist session tokens in localStorage so they survive tab closes.
  // Without this, a returning player sends token: null and the server
  // rejects the connection because the slot already has a token assigned.
  const storageKey = params.gameId ? `game_token_${params.gameId}` : null;

  const connect = useCallback(() => {
    if (!params.gameId) return;

    const isReconnect = retryCountRef.current > 0;
    setConnectionStatus(isReconnect ? 'reconnecting' : 'connecting');

    const ws = new WebSocket(`${WS_URL}/ws/${params.gameId}`);
    wsRef.current = ws;

    ws.onopen = () => {
      // Send session token as the first message (not in URL, to keep it out of logs)
      ws.send(JSON.stringify({
        type: 'auth',
        token: sessionTokenRef.current,
      }));
      params.onOpen?.();
    };

    ws.onmessage = (event) => {
      const data = JSON.parse(event.data) as ServerMessage;
      // Capture session token from initial assignment for reconnection.
      // Only reset the retry counter here — after the server has accepted
      // the auth.  Resetting in onopen would cause an infinite retry loop
      // because onopen fires before the server validates the token.
      if (data.type === 'player_assigned') {
        if (data.session_token) {
          sessionTokenRef.current = data.session_token;
          if (storageKey) {
            try { localStorage.setItem(storageKey, data.session_token); } catch {}
          }
        }
        retryCountRef.current = 0;
        setConnectionStatus('connected');
      }
      params.onMessage(data);
    };

    ws.onerror = () => {
      params.onError?.('WebSocket error');
    };

    ws.onclose = () => {
      wsRef.current = null;

      if (intentionalCloseRef.current) {
        setConnectionStatus('disconnected');
        params.onClose?.();
        return;
      }

      // Give up after max retries to avoid thundering herd
      if (retryCountRef.current >= BACKOFF_MAX_RETRIES) {
        setConnectionStatus('disconnected');
        params.onClose?.();
        return;
      }

      // Exponential backoff with jitter to spread reconnection attempts
      const baseDelay = Math.min(BACKOFF_BASE * Math.pow(2, retryCountRef.current), BACKOFF_MAX);
      const jitter = Math.random() * 0.5 * baseDelay;
      const delay = baseDelay + jitter;
      retryCountRef.current += 1;
      setConnectionStatus('reconnecting');

      retryTimerRef.current = setTimeout(() => {
        connect();
      }, delay);
    };
  }, [params.gameId]);

  useEffect(() => {
    intentionalCloseRef.current = false;
    retryCountRef.current = 0;

    // Restore session token from localStorage so returning players can reclaim their slot
    if (storageKey) {
      try { sessionTokenRef.current = localStorage.getItem(storageKey); } catch {}
    }

    connect();

    return () => {
      intentionalCloseRef.current = true;
      if (retryTimerRef.current) {
        clearTimeout(retryTimerRef.current);
        retryTimerRef.current = null;
      }
      wsRef.current?.close();
    };
  }, [params.gameId]);

  const send = useCallback((payload: ClientMessage) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(payload));
    }
  }, []);

  return { send, connectionStatus };
}

export default useGameWebSocket;
