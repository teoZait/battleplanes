import { useEffect, useRef } from 'react';

export function useGameWebSocket(params: {
    gameId: string | null;
    onPlayerAssigned: (data: any) => void;
    onGameReady: (data: any) => void;
    onGameStarted: (data: any) => void;
    onAttackResult: (data: any) => void;
    onTurnChanged: (data: any) => void;
    onGameOver: (data: any) => void;
    onPlayerDisconnected: () => void;
    onError: (message: string) => void;
    onOpen?: () => void;
    onClose?: () => void;
}) {
    const wsRef = useRef<WebSocket | null>(null);
    const API_URL = 'http://localhost:8000';
    const WS_URL = API_URL.replace('http', 'ws');

    useEffect(() => {
        if (!params.gameId) return;

        const ws = new WebSocket(`${WS_URL}/ws/${params.gameId}`);
        wsRef.current = ws;

        ws.onopen = () => {
            params.onOpen?.();
        };

        ws.onmessage = (event) => {
            const data = JSON.parse(event.data);

            switch (data.type) {
                case 'player_assigned':
                    params.onPlayerAssigned(data);
                    break;
                case 'game_ready':
                    params.onGameReady(data);
                    break;
                case 'game_started':
                    params.onGameStarted(data);
                    break;
                case 'attack_result':
                    params.onAttackResult(data);
                    break;
                case 'turn_changed':
                    params.onTurnChanged(data);
                    break;
                case 'game_over':
                    params.onGameOver(data);
                    break;
                case 'player_disconnected':
                    params.onPlayerDisconnected();
                    break;
                case 'error':
                    params.onError(data.message);
                    break;
            }
        };

        ws.onerror = () => {
            params.onError('WebSocket error');
        };

        ws.onclose = () => {
            params.onClose?.();
            wsRef.current = null;
        };

        return () => {
            ws.close();
        };
    }, [params.gameId]);

    const send = (payload: any) => {
        if (wsRef.current?.readyState === WebSocket.OPEN) {
            wsRef.current.send(JSON.stringify(payload));
        }
    };

    return { send };
}
