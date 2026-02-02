# ✈️ Warplanes Game

A modern, real-time multiplayer Warplanes game with custom plane designs, built with FastAPI (Python) backend and React (TypeScript) frontend, containerized with Docker and orchestrated with Kubernetes.

## 🎮 Features

- **Real-time Multiplayer**: WebSocket-based communication for instant updates
- **Custom Plane Designs**: Visually appealing plane representations with animations
- **Unique Gameplay**: 
  - Each player has 2 planes
  - Planes have a distinctive cross-shaped pattern (10 cells each)
  - Hit the cockpit (head) to destroy a plane
  - Body hits don't destroy the plane
  - Destroy both enemy planes to win
- **Interactive Gameplay**: 
  - Drag and rotate planes during setup phase (4 orientations)
  - Click to attack opponent's airspace
  - Visual feedback for hits, misses, and destroyed planes
- **Responsive Design**: Works on desktop and mobile devices
- **Production-Ready**: Containerized with Docker and deployable to Kubernetes

## 🎯 Game Rules

### Plane Structure
Each plane consists of 10 cells in this pattern:
```
    [X] [X] [H] [X] [X]   <- Head (cockpit)
    [B] [B] [B] [B] [B]   <- Body
    [X] [X] [B] [X] [X]   <- Body
    [X] [B] [B] [B] [X]   <- Body (tail)
```

- **H** = Head/Cockpit (the critical hit point)
- **B** = Body (can be hit without destroying the plane)
- **X** = Empty space

### Winning Conditions
- Each player places 2 planes
- Planes can be rotated in 4 directions: UP, DOWN, LEFT, RIGHT
- **Body hits** (🔥): Damage the plane but don't destroy it
- **Cockpit hits** (💥): Destroy the plane immediately
- **Objective**: Destroy both enemy planes to win

## 🏗️ Architecture

### Backend (FastAPI)
- **Framework**: FastAPI with WebSocket support
- **Language**: Python 3.11
- **Features**:
  - RESTful API for game creation
  - WebSocket connections for real-time gameplay
  - Game state management
  - Plane placement validation (4 orientations)
  - Attack logic with head/body hit detection
  - Winner detection (both planes destroyed)

### Frontend (React + TypeScript)
- **Framework**: React 18 with TypeScript
- **Build Tool**: Vite
- **Features**:
  - Interactive game boards with custom CSS
  - Real-time updates via WebSocket
  - Plane placement interface with 4-way rotation
  - Visual feedback for game states
  - Distinctive animations for head hits vs body hits
  - Responsive design

## 📁 Project Structure

```
warplanes-app/
├── backend/
│   ├── main.py              # FastAPI application
│   ├── requirements.txt     # Python dependencies
│   └── Dockerfile          # Backend container
├── frontend/
│   ├── src/
│   │   ├── App.tsx         # Main application component
│   │   ├── App.css         # Main styling
│   │   ├── components/
│   │   │   ├── GameBoard.tsx      # Game board display
│   │   │   ├── GameBoard.css      # Custom plane designs
│   │   │   ├── PlanePlacement.tsx  # Plane placement UI
│   │   │   ├── PlanePlacement.css
│   │   │   ├── GameInfo.tsx       # Game status display
│   │   │   └── GameInfo.css
│   │   ├── hooks/
│   │   │   └── UseGameWebSocket.tsx
│   │   ├── reducers/
│   │   │   └── gameReducer.tsx
│   │   ├── main.tsx        # Entry point
│   │   └── index.css       # Global styles
│   ├── package.json
│   ├── Dockerfile          # Frontend container
│   └── nginx.conf          # Nginx configuration
├── k8s/
│   ├── backend-deployment.yaml    # Backend K8s config
│   └── frontend-deployment.yaml   # Frontend K8s config
└── docker-compose.yaml     # Local development setup
```

## 🚀 Getting Started

### Prerequisites

- Docker and Docker Compose
- (Optional) Kubernetes cluster (minikube, kind, or cloud provider)
- (Optional) kubectl CLI tool

### Local Development with Docker Compose

1. **Clone the repository** (or navigate to the project directory)

2. **Build and run the containers**:
   ```bash
   docker-compose up --build
   ```

3. **Access the application**:
   - Frontend: http://localhost
   - Backend API: http://localhost:8000
   - API Docs: http://localhost:8000/docs

4. **Stop the application**:
   ```bash
   docker-compose down
   ```

## 🎲 How to Play

1. **Create a Game**:
   - Click "Create New Game" to start a new game
   - Share the Game ID with your opponent

2. **Join a Game**:
   - Enter the Game ID provided by your opponent
   - Click "Join Game"

3. **Place Your Planes**:
   - Click "Rotate" to change plane orientation (UP/RIGHT/DOWN/LEFT)
   - Click on the board where you want the cockpit (head) to be
   - Place 2 planes total
   - Click "Confirm Placement" when done

4. **Battle**:
   - When it's your turn, click on your opponent's airspace to attack
   - 🔥 Red with fire = Body hit (plane still active)
   - 💥 Purple with explosion = Cockpit hit (plane destroyed!)
   - 💧 Blue with water = Miss
   - Destroy both enemy planes to win!

## 🎨 Custom Plane Design

Planes are rendered with attention to detail:

- **Visual Design**: Metallic gradients with 3D depth
- **Cockpit**: Orange/red gradient with ✈️ emoji marker
- **Body**: Gray metallic gradient
- **Animations**: 
  - Smooth placement transitions
  - Body hit: Fire explosion (🔥)
  - Cockpit hit: Massive explosion (💥) with special animation
  - Miss: Water splash (💧)
- **Hover States**: Green for valid placement, red for invalid

## 🔧 Configuration

### Environment Variables

#### Frontend (.env)
```
VITE_API_URL=http://localhost:8000
```

For production, update this to your backend service URL.

## 🛠️ Development

### Backend Development

1. Create a virtual environment:
   ```bash
   cd backend
   python -m venv venv
   source venv/bin/activate  # On Windows: venv\Scripts\activate
   ```

2. Install dependencies:
   ```bash
   pip install -r requirements.txt
   ```

3. Run the development server:
   ```bash
   uvicorn main:app --reload
   ```

### Frontend Development

1. Install dependencies:
   ```bash
   cd frontend
   npm install
   ```

2. Run the development server:
   ```bash
   npm run dev
   ```

3. Build for production:
   ```bash
   npm run build
   ```

## 🧪 API Endpoints

### REST API

- `GET /` - Health check
- `POST /game/create` - Create a new game
- `GET /game/{game_id}` - Get game information

### WebSocket

- `WS /ws/{game_id}` - WebSocket connection for real-time gameplay

#### WebSocket Message Types

**Client → Server**:
- `place_plane` - Place a plane on the board (head_x, head_y, orientation)
- `attack` - Attack opponent's airspace (x, y)

**Server → Client**:
- `player_assigned` - Player ID assignment
- `game_ready` - Both players connected
- `plane_placed` - Plane placement confirmation
- `game_started` - Game begins
- `attack_result` - Attack outcome (hit/head_hit/miss)
- `turn_changed` - Turn switch
- `game_over` - Game finished
- `player_disconnected` - Opponent left

## 📝 Key Differences from Battleships

1. **Only 2 units per player** instead of 5 ships
2. **Unique plane shape** (cross pattern) instead of linear ships
3. **Head targeting mechanic**: Only cockpit hits destroy planes
4. **4-way rotation** with complex placement validation
5. **Different win condition**: Destroy both planes (not all ships)

## 📝 License

This project is open source and available for educational purposes.

## 🤝 Contributing

Contributions are welcome! Feel free to submit issues and pull requests.

---

Built with ❤️ using FastAPI, React, Docker, and Kubernetes
