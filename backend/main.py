from fastapi import FastAPI, WebSocket, WebSocketDisconnect, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import List, Dict, Optional, Tuple
import uuid
import json
from enum import Enum

app = FastAPI(title="Battleships API")

# CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

class CellStatus(str, Enum):
    EMPTY = "empty"
    SHIP = "ship"
    HIT = "hit"
    MISS = "miss"

class ShipType(str, Enum):
    CARRIER = "carrier"
    BATTLESHIP = "battleship"
    CRUISER = "cruiser"
    SUBMARINE = "submarine"
    DESTROYER = "destroyer"

class Ship(BaseModel):
    type: ShipType
    positions: List[Tuple[int, int]]
    hits: List[bool]

class GameState(str, Enum):
    WAITING = "waiting"
    PLACING = "placing"
    PLAYING = "playing"
    FINISHED = "finished"

class Game:
    def __init__(self, game_id: str):
        self.id = game_id
        self.players: Dict[str, Optional[WebSocket]] = {"player1": None, "player2": None}
        self.boards: Dict[str, List[List[str]]] = {
            "player1": [["empty" for _ in range(10)] for _ in range(10)],
            "player2": [["empty" for _ in range(10)] for _ in range(10)]
        }
        self.ships: Dict[str, List[Dict]] = {"player1": [], "player2": []}
        self.state = GameState.WAITING
        self.current_turn = "player1"
        self.ready: Dict[str, bool] = {"player1": False, "player2": False}

    def add_player(self, player_id: str, websocket: WebSocket):
        if self.players["player1"] is None:
            self.players["player1"] = websocket
            return "player1"
        elif self.players["player2"] is None:
            self.players["player2"] = websocket
            self.state = GameState.PLACING
            return "player2"
        return None

    def place_ship(self, player_id: str, ship_data: Dict):
        ship_type = ship_data["type"]
        positions = ship_data["positions"]
        
        # Validate positions
        for pos in positions:
            x, y = pos
            if x < 0 or x >= 10 or y < 0 or y >= 10:
                return False
            if self.boards[player_id][y][x] != "empty":
                return False
        
        # Place ship on board
        for pos in positions:
            x, y = pos
            self.boards[player_id][y][x] = "ship"
        
        # Store ship
        self.ships[player_id].append({
            "type": ship_type,
            "positions": positions,
            "hits": [False] * len(positions)
        })
        
        return True

    def attack(self, attacker: str, x: int, y: int):
        defender = "player2" if attacker == "player1" else "player1"
        
        if x < 0 or x >= 10 or y < 0 or y >= 10:
            return None
        
        cell = self.boards[defender][y][x]
        
        if cell == "ship":
            self.boards[defender][y][x] = "hit"
            # Update ship hits
            for ship in self.ships[defender]:
                if [x, y] in ship["positions"]:
                    idx = ship["positions"].index([x, y])
                    ship["hits"][idx] = True
                    break
            return "hit"
        elif cell == "empty":
            self.boards[defender][y][x] = "miss"
            return "miss"
        else:
            return "already_attacked"

    def check_winner(self):
        for player_id in ["player1", "player2"]:
            all_sunk = True
            for ship in self.ships[player_id]:
                if not all(ship["hits"]):
                    all_sunk = False
                    break
            if all_sunk and len(self.ships[player_id]) > 0:
                return "player2" if player_id == "player1" else "player1"
        return None

    def get_masked_board(self, player_id: str):
        """Return opponent's board with ships hidden"""
        opponent = "player2" if player_id == "player1" else "player1"
        masked = []
        for row in self.boards[opponent]:
            masked_row = []
            for cell in row:
                if cell == "ship":
                    masked_row.append("empty")
                else:
                    masked_row.append(cell)
            masked.append(masked_row)
        return masked


# Store active games
games: Dict[str, Game] = {}

class ConnectionManager:
    def __init__(self):
        self.active_connections: Dict[str, Dict[str, WebSocket]] = {}

    async def connect(self, game_id: str, player_id: str, websocket: WebSocket):
        await websocket.accept()
        if game_id not in self.active_connections:
            self.active_connections[game_id] = {}
        self.active_connections[game_id][player_id] = websocket

    def disconnect(self, game_id: str, player_id: str):
        if game_id in self.active_connections and player_id in self.active_connections[game_id]:
            del self.active_connections[game_id][player_id]

    async def send_to_player(self, game_id: str, player_id: str, message: dict):
        if game_id in self.active_connections and player_id in self.active_connections[game_id]:
            await self.active_connections[game_id][player_id].send_json(message)

    async def broadcast_to_game(self, game_id: str, message: dict):
        if game_id in self.active_connections:
            for websocket in self.active_connections[game_id].values():
                await websocket.send_json(message)

manager = ConnectionManager()

@app.get("/")
async def root():
    return {"message": "Battleships API"}

@app.post("/game/create")
async def create_game():
    game_id = str(uuid.uuid4())
    games[game_id] = Game(game_id)
    return {"game_id": game_id}

@app.get("/game/{game_id}")
async def get_game(game_id: str):
    if game_id not in games:
        raise HTTPException(status_code=404, detail="Game not found")
    
    game = games[game_id]
    return {
        "id": game.id,
        "state": game.state,
        "current_turn": game.current_turn,
        "players": {
            "player1": game.players["player1"] is not None,
            "player2": game.players["player2"] is not None
        }
    }

@app.websocket("/ws/{game_id}")
async def websocket_endpoint(websocket: WebSocket, game_id: str):
    if game_id not in games:
        await websocket.close(code=1008)
        return
    
    game = games[game_id]
    player_id = game.add_player(str(uuid.uuid4()), websocket)
    
    if player_id is None:
        await websocket.close(code=1008)
        return
    
    await manager.connect(game_id, player_id, websocket)
    
    # Send player assignment
    await manager.send_to_player(game_id, player_id, {
        "type": "player_assigned",
        "player_id": player_id,
        "game_state": game.state
    })
    
    # Notify both players if game is ready
    if game.state == GameState.PLACING:
        await manager.broadcast_to_game(game_id, {
            "type": "game_ready",
            "message": "Both players connected. Place your ships!"
        })
    
    try:
        while True:
            data = await websocket.receive_json()
            
            if data["type"] == "place_ships":
                ships = data["ships"]
                success = True
                for ship in ships:
                    if not game.place_ship(player_id, ship):
                        success = False
                        break
                
                if success:
                    game.ready[player_id] = True
                    await manager.send_to_player(game_id, player_id, {
                        "type": "ships_placed",
                        "success": True
                    })
                    
                    # Check if both players are ready
                    if game.ready["player1"] and game.ready["player2"]:
                        game.state = GameState.PLAYING
                        await manager.broadcast_to_game(game_id, {
                            "type": "game_started",
                            "current_turn": game.current_turn
                        })
                else:
                    await manager.send_to_player(game_id, player_id, {
                        "type": "ships_placed",
                        "success": False,
                        "error": "Invalid ship placement"
                    })
            
            elif data["type"] == "attack":
                if game.state != GameState.PLAYING:
                    continue
                
                if game.current_turn != player_id:
                    await manager.send_to_player(game_id, player_id, {
                        "type": "error",
                        "message": "Not your turn"
                    })
                    continue
                
                x, y = data["x"], data["y"]
                result = game.attack(player_id, x, y)
                
                if result is None or result == "already_attacked":
                    await manager.send_to_player(game_id, player_id, {
                        "type": "attack_result",
                        "success": False,
                        "message": "Invalid attack"
                    })
                    continue
                
                # Send attack result to both players
                opponent = "player2" if player_id == "player1" else "player1"
                
                await manager.send_to_player(game_id, player_id, {
                    "type": "attack_result",
                    "success": True,
                    "result": result,
                    "x": x,
                    "y": y,
                    "is_attacker": True
                })
                
                await manager.send_to_player(game_id, opponent, {
                    "type": "attack_result",
                    "success": True,
                    "result": result,
                    "x": x,
                    "y": y,
                    "is_attacker": False
                })
                
                # Check for winner
                winner = game.check_winner()
                if winner:
                    game.state = GameState.FINISHED
                    await manager.broadcast_to_game(game_id, {
                        "type": "game_over",
                        "winner": winner
                    })
                else:
                    # Switch turns
                    game.current_turn = opponent
                    await manager.broadcast_to_game(game_id, {
                        "type": "turn_changed",
                        "current_turn": game.current_turn
                    })
            
            elif data["type"] == "get_boards":
                await manager.send_to_player(game_id, player_id, {
                    "type": "boards_update",
                    "own_board": game.boards[player_id],
                    "opponent_board": game.get_masked_board(player_id)
                })
    
    except WebSocketDisconnect:
        manager.disconnect(game_id, player_id)
        await manager.broadcast_to_game(game_id, {
            "type": "player_disconnected",
            "player_id": player_id
        })

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
