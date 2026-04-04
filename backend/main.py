"""
FastAPI Application - API Layer / Presentation Layer
"""
import asyncio
import json
import logging
import os
import time
from collections import defaultdict
from contextlib import asynccontextmanager

from fastapi import FastAPI, WebSocket, WebSocketDisconnect, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from application.game_service import GameService
from application.schemas import parse_client_message, AuthMessage
from infrastructure.game_store import GameStore

logger = logging.getLogger(__name__)

# Persistence — Redis is required; defaults to localhost for local dev.
redis_url = os.environ.get("REDIS_URL", "redis://localhost:6379/0")
game_store = GameStore(redis_url)

# Application service (singleton)
game_service = GameService(game_store=game_store)

# Rate limiting
RATE_LIMIT_WINDOW = 60  # seconds
RATE_LIMIT_MAX_REQUESTS = 30  # per window
_rate_limit_store: dict[str, list[float]] = defaultdict(list)


async def _cleanup_rate_limits():
    """Periodically remove stale entries from the rate limit store."""
    while True:
        await asyncio.sleep(300)
        now = time.time()
        window_start = now - RATE_LIMIT_WINDOW
        stale = [ip for ip, ts in _rate_limit_store.items()
                 if not any(t > window_start for t in ts)]
        for ip in stale:
            del _rate_limit_store[ip]


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup: restore games from Redis and start background tasks
    await game_service.initialize()
    rate_limit_task = asyncio.create_task(_cleanup_rate_limits())
    yield
    # Shutdown: cancel background tasks
    rate_limit_task.cancel()
    await game_service.shutdown()


app = FastAPI(title="Warplanes API", lifespan=lifespan)

# CORS middleware - restrict to configured origins
allowed_origins = os.environ.get(
    "CORS_ALLOWED_ORIGINS",
    "http://localhost:3000,http://localhost:5173,http://localhost:80,http://localhost,https://localhost"
).split(",")

logger.info("Allowed CORS origins: %s", allowed_origins)

app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_origins,
    allow_credentials=True,
    allow_methods=["GET", "POST", "OPTIONS"],
    allow_headers=["Content-Type"],
)


# Starlette's CORSMiddleware rejects WebSocket upgrades with 403 if the
# Origin doesn't match — before our endpoint even runs.  We handle
# WebSocket origin validation ourselves in _check_ws_origin, so bypass
# CORS for WebSocket scopes by stripping the Origin header before it
# reaches CORSMiddleware.
class _BypassCorsForWebSocket:
    """ASGI middleware: removes Origin from WebSocket headers so
    CORSMiddleware ignores them.  Stashes the original value in
    scope["ws_origin"] so _check_ws_origin can still validate it."""

    def __init__(self, app):
        self.app = app

    async def __call__(self, scope, receive, send):
        if scope["type"] == "websocket":
            origin = None
            cleaned = []
            for k, v in scope["headers"]:
                if k == b"origin":
                    origin = v.decode("latin-1")
                else:
                    cleaned.append((k, v))
            scope = dict(scope, headers=cleaned, ws_origin=origin)
        await self.app(scope, receive, send)


# Added after CORSMiddleware so it wraps the outermost layer and runs first.
app.add_middleware(_BypassCorsForWebSocket)


def _get_client_ip(request: Request) -> str:
    """Return the real client IP.

    Behind our nginx reverse-proxy the ``X-Forwarded-For`` header is set to
    ``$remote_addr`` (overwritten, not appended) so it always contains exactly
    the real client IP and cannot be spoofed by the end-user.  When the header
    is absent (direct access, tests) we fall back to ``request.client.host``.
    """
    forwarded = request.headers.get("x-forwarded-for")
    if forwarded:
        return forwarded.split(",")[0].strip()
    return request.client.host if request.client else "unknown"


@app.middleware("http")
async def rate_limit_middleware(request: Request, call_next):
    if request.url.path == "/":  # skip health check
        return await call_next(request)

    client_ip = _get_client_ip(request)
    now = time.time()
    window_start = now - RATE_LIMIT_WINDOW

    # Clean old entries and add current request
    timestamps = _rate_limit_store[client_ip]
    _rate_limit_store[client_ip] = [t for t in timestamps if t > window_start]
    _rate_limit_store[client_ip].append(now)

    if len(_rate_limit_store[client_ip]) > RATE_LIMIT_MAX_REQUESTS:
        return JSONResponse(
            status_code=429,
            content={"detail": "Too many requests. Try again later."}
        )

    return await call_next(request)


@app.get("/")
async def root():
    """Health check endpoint"""
    return {"message": "Warplanes API"}


@app.post("/game/create")
async def create_game():
    """Create a new game"""
    game_id = await game_service.create_game()
    return {"game_id": game_id}


@app.get("/game/{game_id}")
async def get_game(game_id: str):
    """Get game information"""
    game_info = await game_service.get_game_info(game_id)
    
    if not game_info:
        raise HTTPException(status_code=404, detail="Game not found")
    
    return game_info


# WebSocket security limits
_WS_MSG_PER_SECOND = 10
_WS_MAX_MSG_SIZE = 1024  # bytes (valid game messages are < 200 bytes)


def _check_ws_origin(websocket: WebSocket) -> bool:
    """Validate the WebSocket Origin against allowed CORS origins.

    The origin is stashed in scope["ws_origin"] by _BypassCorsForWebSocket
    (stripped from headers so CORSMiddleware doesn't interfere).
    """
    origin = websocket.scope.get("ws_origin")
    if origin is None:
        return True  # non-browser clients (curl, game bots) don't send Origin
    return origin in allowed_origins


@app.websocket("/ws/{game_id}")
async def websocket_endpoint(websocket: WebSocket, game_id: str):
    """WebSocket endpoint for real-time gameplay"""
    # #17 — Reject cross-origin WebSocket connections
    if not _check_ws_origin(websocket):
        await websocket.close(code=1008)
        return

    # Verify game exists
    if not await game_service.get_game(game_id):
        await websocket.close(code=1008)
        return

    # Accept the connection, then wait for the client's auth message.
    # The token travels inside the WebSocket frame, not in the URL,
    # so it stays out of browser history, proxy logs, and Referer headers.
    await websocket.accept()
    try:
        raw_auth = await asyncio.wait_for(websocket.receive_text(), timeout=5.0)
        auth_data = json.loads(raw_auth)
        auth_msg = AuthMessage.model_validate(auth_data)
        token = auth_msg.token
    except (asyncio.TimeoutError, json.JSONDecodeError, Exception):
        await websocket.close(code=1008)
        return

    # Connect player (token verified inside game_service)
    player_id = await game_service.handle_player_connection(
        game_id, websocket, token=token
    )

    if player_id is None:
        await websocket.close(code=1008)
        return

    # #14 — Per-connection message rate tracking
    msg_timestamps: list[float] = []

    try:
        while True:
            # #15 — Message size limit: read raw text, check length, then parse
            raw = await websocket.receive_text()

            if len(raw) > _WS_MAX_MSG_SIZE:
                await game_service.connection_manager.send_to_player(
                    game_id, player_id,
                    {"type": "error", "message": "Message too large"},
                )
                continue

            # #14 — Per-connection rate limiting
            now = time.time()
            msg_timestamps = [t for t in msg_timestamps if t > now - 1.0]
            if len(msg_timestamps) >= _WS_MSG_PER_SECOND:
                await game_service.connection_manager.send_to_player(
                    game_id, player_id,
                    {"type": "error", "message": "Too many messages, slow down"},
                )
                continue
            msg_timestamps.append(now)

            # Parse JSON (replaces receive_json)
            try:
                data = json.loads(raw)
            except (json.JSONDecodeError, ValueError):
                await game_service.connection_manager.send_to_player(
                    game_id, player_id,
                    {"type": "error", "message": "Invalid JSON"},
                )
                continue

            message = parse_client_message(data)

            if message is None:
                await game_service.connection_manager.send_to_player(game_id, player_id, {
                    "type": "error",
                    "message": "Invalid message format"
                })
                continue

            if message.type == "place_plane":
                await game_service.handle_plane_placement(game_id, player_id, message.model_dump())

            elif message.type == "attack":
                await game_service.handle_attack(game_id, player_id, message.x, message.y)

            elif message.type == "get_boards":
                game = await game_service.get_game(game_id)
                if game:
                    await game_service.connection_manager.send_to_player(game_id, player_id, {
                        "type": "boards_update",
                        "own_board": game.boards[player_id],
                        "opponent_board": game.get_masked_board(player_id)
                    })

    except WebSocketDisconnect:
        await game_service.handle_player_disconnection(game_id, player_id)
    # #16 — Catch any other exception so disconnection cleanup always runs
    except Exception:
        logger.exception("WebSocket error for game=%s player=%s", game_id, player_id)
        await game_service.handle_player_disconnection(game_id, player_id)
        try:
            await websocket.close(code=1011)
        except Exception:
            pass


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000, ws_ping_interval=30, ws_ping_timeout=10)
