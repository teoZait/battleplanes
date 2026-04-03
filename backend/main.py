"""
FastAPI Application - API Layer / Presentation Layer
"""
import os
import time
from collections import defaultdict

from fastapi import FastAPI, WebSocket, WebSocketDisconnect, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from application.game_service import GameService
from application.schemas import parse_client_message

app = FastAPI(title="Warplanes API")

# CORS middleware - restrict to configured origins
allowed_origins = os.environ.get(
    "CORS_ALLOWED_ORIGINS",
    "http://localhost:3000,http://localhost:5173,http://localhost:80,http://localhost"
).split(",")

app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Rate limiting
RATE_LIMIT_WINDOW = 60  # seconds
RATE_LIMIT_MAX_REQUESTS = 30  # per window
_rate_limit_store: dict[str, list[float]] = defaultdict(list)


@app.middleware("http")
async def rate_limit_middleware(request: Request, call_next):
    if request.url.path == "/":  # skip health check
        return await call_next(request)

    client_ip = request.client.host if request.client else "unknown"
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

# Application service (singleton)
game_service = GameService()


@app.get("/")
async def root():
    """Health check endpoint"""
    return {"message": "Warplanes API"}


@app.post("/game/create")
async def create_game():
    """Create a new game"""
    game_id = game_service.create_game()
    return {"game_id": game_id}


@app.get("/game/{game_id}")
async def get_game(game_id: str):
    """Get game information"""
    game_info = game_service.get_game_info(game_id)
    
    if not game_info:
        raise HTTPException(status_code=404, detail="Game not found")
    
    return game_info


@app.websocket("/ws/{game_id}")
async def websocket_endpoint(websocket: WebSocket, game_id: str):
    """WebSocket endpoint for real-time gameplay"""
    # Verify game exists
    if not game_service.get_game(game_id):
        await websocket.close(code=1008)
        return
    
    # Connect player
    player_id = await game_service.handle_player_connection(game_id, websocket)
    
    if player_id is None:
        await websocket.close(code=1008)
        return
    
    try:
        while True:
            data = await websocket.receive_json()
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
                game = game_service.get_game(game_id)
                if game:
                    await game_service.connection_manager.send_to_player(game_id, player_id, {
                        "type": "boards_update",
                        "own_board": game.boards[player_id],
                        "opponent_board": game.get_masked_board(player_id)
                    })
    
    except WebSocketDisconnect:
        await game_service.handle_player_disconnection(game_id, player_id)


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
