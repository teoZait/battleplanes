from fastapi import Body, FastAPI, WebSocket, WebSocketDisconnect, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import List, Dict, Optional, Tuple
import uuid
import json
from enum import Enum

app = FastAPI(title="Warplanes API")

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
    PLANE = "plane"
    HEAD = "head"
    HIT = "hit"
    MISS = "miss"
    HEAD_HIT = "head_hit"

class PlaneOrientation(str, Enum):
    UP = "up"
    DOWN = "down"
    LEFT = "left"
    RIGHT = "right"

class Plane(BaseModel):
    positions: List[Tuple[int, int]]
    head_position: Tuple[int, int]
    orientation: PlaneOrientation
    hit_positions: List[Tuple[int, int]] = []
    is_destroyed: bool = False

class GameState(str, Enum):
    WAITING = "waiting"
    PLACING = "placing"
    PLAYING = "playing"
    FINISHED = "finished"


PLANE_MATRIX_UP = [
    ['.', '.', 'H', '.', '.'],
    ['B', 'B', 'B', 'B', 'B'],
    ['.', '.', 'B', '.', '.'],
    ['.', 'B', 'B', 'B', '.'],
]

def rotate_matrix_right(matrix):
    return [list(row) for row in zip(*matrix[::-1])]

def rotate_matrix_left(matrix):
    return [list(row) for row in zip(*matrix)][::-1]

def rotate_matrix_180(matrix):
    return [row[::-1] for row in matrix[::-1]]

def get_oriented_matrix(orientation: PlaneOrientation):
    if orientation == PlaneOrientation.UP:
        return PLANE_MATRIX_UP
    elif orientation == PlaneOrientation.RIGHT:
        return rotate_matrix_right(PLANE_MATRIX_UP)
    elif orientation == PlaneOrientation.DOWN:
        return rotate_matrix_180(PLANE_MATRIX_UP)
    else:
        return rotate_matrix_left(PLANE_MATRIX_UP)

def get_plane_positions(head_x: int, head_y: int, orientation: PlaneOrientation) -> Tuple[List[Tuple[int, int]], Tuple[int, int]]:
    matrix = get_oriented_matrix(orientation)

    # Find H inside the matrix
    head_mx = head_my = None
    for my, row in enumerate(matrix):
        for mx, cell in enumerate(row):
            if cell == 'H':
                head_mx, head_my = mx, my
                break
        if head_mx is not None:
            break

    positions = []
    head_position = None

    for my, row in enumerate(matrix):
        for mx, cell in enumerate(row):
            if cell in ('H', 'B'):
                board_x = head_x + (mx - head_mx)
                board_y = head_y + (my - head_my)

                if cell == 'H':
                    head_position = (board_x, board_y)
                else:
                    positions.append((board_x, board_y))

    # Ensure head is first
    positions.insert(0, head_position)

    return positions, head_position


class Game:
    def __init__(self, game_id: str):
        self.id = game_id
        self.players: Dict[str, Optional[WebSocket]] = {"player1": None, "player2": None}
        self.boards: Dict[str, List[List[str]]] = {
            "player1": [["empty" for _ in range(10)] for _ in range(10)],
            "player2": [["empty" for _ in range(10)] for _ in range(10)]
        }
        self.planes: Dict[str, List[Plane]] = {"player1": [], "player2": []}
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

    def place_plane(self, player_id: str, plane_data: Dict):
        head_x = plane_data["head_x"]
        head_y = plane_data["head_y"]
        orientation = PlaneOrientation(plane_data["orientation"])
        
        # Get plane positions
        positions, head = get_plane_positions(head_x, head_y, orientation)
        
        # Validate all positions are within bounds
        for pos in positions:
            x, y = pos
            if x < 0 or x >= 10 or y < 0 or y >= 10:
                return False, "Plane out of bounds"
            if self.boards[player_id][y][x] != "empty":
                return False, "Plane overlaps with another plane"
        
        # Check if player already has 2 planes
        if len(self.planes[player_id]) >= 2:
            return False, "Already placed 2 planes"
        
        # Place plane on board
        for pos in positions:
            x, y = pos
            if pos == head:
                self.boards[player_id][y][x] = "head"
            else:
                self.boards[player_id][y][x] = "plane"
        
        # Store plane
        self.planes[player_id].append(Plane(
            positions=positions,
            head_position=head,
            orientation=orientation,
            is_destroyed=False
        ))
        
        return True, "Plane placed successfully"

    def attack(self, attacker: str, x: int, y: int):
        defender = "player2" if attacker == "player1" else "player1"
        
        if x < 0 or x >= 10 or y < 0 or y >= 10:
            return None
        
        cell = self.boards[defender][y][x]
        
        if cell == "plane":
            self.boards[defender][y][x] = "hit"
            for plane in self.planes[defender]:
                if (x, y) in plane.positions:
                    plane.hit_positions.append((x, y))
                    break
            return "hit"
        elif cell == "head":
            self.boards[defender][y][x] = "head_hit"
            for plane in self.planes[defender]:
                if plane.head_position == (x, y):
                    plane.is_destroyed = True
                    plane.hit_positions.append((x, y))
                    break
            return "head_hit"
        elif cell == "empty":
            self.boards[defender][y][x] = "miss"
            return "miss"
        else:
            return "already_attacked"

    def check_winner(self):
        """Check if all planes of a player are destroyed (both heads hit)"""
        for player_id in ["player1", "player2"]:
            if len(self.planes[player_id]) == 2:  # Player has placed both planes
                destroyed_count = sum(1 for plane in self.planes[player_id] if plane.is_destroyed)
                if destroyed_count == 2:
                    # This player lost, return the opponent as winner
                    return "player2" if player_id == "player1" else "player1"
        return None

    def get_masked_board(self, player_id: str):
        """Return opponent's board with planes hidden"""
        opponent = "player2" if player_id == "player1" else "player1"
        masked = []
        for row in self.boards[opponent]:
            masked_row = []
            for cell in row:
                if cell == "plane" or cell == "head":
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
    return {"message": "Warplanes API"}

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
            "message": "Both players connected. Place your planes! (2 planes each)"
        })
    
    try:
        while True:
            data = await websocket.receive_json()
            
            if data["type"] == "place_plane":
                success, message = game.place_plane(player_id, data)
                
                await manager.send_to_player(game_id, player_id, {
                    "type": "plane_placed",
                    "success": success,
                    "message": message,
                    "planes_count": len(game.planes[player_id])
                })
                
                # Check if player is ready (placed both planes)
                if len(game.planes[player_id]) == 2:
                    game.ready[player_id] = True
                    
                    # Check if both players are ready
                    if game.ready["player1"] and game.ready["player2"]:
                        game.state = GameState.PLAYING
                        await manager.broadcast_to_game(game_id, {
                            "type": "game_started",
                            "current_turn": game.current_turn
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
