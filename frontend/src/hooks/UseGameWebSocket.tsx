import { useEffect, useRef } from 'react';

export type CellStatus = 'empty' | 'plane' | 'head' | 'hit' | 'miss' | 'head_hit';

export type ServerMessage =
  | { type: 'player_assigned'; player_id: string; game_state: 'waiting' | 'placing' | 'playing' }
  | { type: 'game_ready'; message: string }
  | { type: 'plane_placed'; success: boolean; message: string; planes_count: number }
  | { type: 'game_started'; current_turn: string }
  | { type: 'attack_result'; x: number; y: number; result: string; is_attacker: boolean }
  | { type: 'turn_changed'; current_turn: string }
  | { type: 'game_over'; winner: string }
  | { type: 'player_disconnected' }
  | { type: 'error'; message: string };

export type ClientMessage =
  | { type: 'place_plane'; head_x: number; head_y: number; orientation: string }
  | { type: 'attack'; x: number; y: number };

export function useGameWebSocket(params: {
  gameId: string | null;
  onMessage: (msg: ServerMessage) => void;
  onOpen?: () => void;
  onClose?: () => void;
  onError?: (msg: string) => void;
}) {
  const wsRef = useRef<WebSocket | null>(null);
  const API_URL = 'http://localhost:8000';
  const WS_URL = API_URL.replace('http', 'ws');

  useEffect(() => {
    if (!params.gameId) return;

    const ws = new WebSocket(`${WS_URL}/ws/${params.gameId}`);
    wsRef.current = ws;

    ws.onopen = () => params.onOpen?.();

    ws.onmessage = (event) => {
      const data = JSON.parse(event.data) as ServerMessage;
      params.onMessage(data);
    };

    ws.onerror = () => params.onError?.('WebSocket error');

    ws.onclose = () => {
      wsRef.current = null;
      params.onClose?.();
    };

    return () => ws.close();
  }, [params.gameId]);

  const send = (payload: ClientMessage) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(payload));
    }
  };

  return { send };
}

export default useGameWebSocket;