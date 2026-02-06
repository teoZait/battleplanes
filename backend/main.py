"""
FastAPI Application - API Layer / Presentation Layer
"""
from fastapi import FastAPI, WebSocket, WebSocketDisconnect, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from application.game_service import GameService

app = FastAPI(title="Warplanes API")

# CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

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
            # TODO: schema here ?!
            
            if data["type"] == "place_plane":
                await game_service.handle_plane_placement(game_id, player_id, data)
            
            elif data["type"] == "attack":
                x, y = data["x"], data["y"]
                await game_service.handle_attack(game_id, player_id, x, y)
            
            elif data["type"] == "get_boards":
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
