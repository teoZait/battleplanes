import { useEffect, useRef, useState, useCallback } from 'react';

export type CellStatus = 'empty' | 'plane' | 'head' | 'hit' | 'miss' | 'head_hit';

export type ServerMessage =
  | { type: 'player_assigned'; player_id: string; game_state: 'waiting' | 'placing' | 'playing' }
  | { type: 'game_ready'; message: string }
  | { type: 'plane_placed'; success: boolean; message: string; planes_count: number }
  | { type: 'game_started'; current_turn: string }
  | { type: 'attack_result'; x: number; y: number; result: string; is_attacker: boolean }
  | { type: 'turn_changed'; current_turn: string }
  | { type: 'game_over'; winner: string }
  | { type: 'game_resumed'; own_board: CellStatus[][]; opponent_board: CellStatus[][]; current_turn: string }
  | { type: 'player_disconnected' }
  | { type: 'error'; message: string };

export type ClientMessage =
  | { type: 'place_plane'; head_x: number; head_y: number; orientation: string }
  | { type: 'attack'; x: number; y: number };

export type ConnectionStatus = 'disconnected' | 'connecting' | 'connected' | 'reconnecting';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000';
const WS_URL = API_URL.replace('http', 'ws');

const BACKOFF_BASE = 1000;
const BACKOFF_MAX = 30000;

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
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>('disconnected');

  const connect = useCallback(() => {
    if (!params.gameId) return;

    const isReconnect = retryCountRef.current > 0;
    setConnectionStatus(isReconnect ? 'reconnecting' : 'connecting');

    const ws = new WebSocket(`${WS_URL}/ws/${params.gameId}`);
    wsRef.current = ws;

    ws.onopen = () => {
      retryCountRef.current = 0;
      setConnectionStatus('connected');
      params.onOpen?.();
    };

    ws.onmessage = (event) => {
      const data = JSON.parse(event.data) as ServerMessage;
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

      // Exponential backoff reconnection
      const delay = Math.min(BACKOFF_BASE * Math.pow(2, retryCountRef.current), BACKOFF_MAX);
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
