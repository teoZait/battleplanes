# ⚓ Battleships Game

A modern, real-time multiplayer Battleships game with custom ship designs, built with FastAPI (Python) backend and React (TypeScript) frontend, containerized with Docker and orchestrated with Kubernetes.

## 🎮 Features

- **Real-time Multiplayer**: WebSocket-based communication for instant updates
- **Custom Ship Designs**: Visually appealing ship representations with animations
- **Interactive Gameplay**: 
  - Drag and place ships during setup phase
  - Click to attack opponent's board
  - Visual feedback for hits, misses, and sinking ships
- **Responsive Design**: Works on desktop and mobile devices
- **Production-Ready**: Containerized with Docker and deployable to Kubernetes

## 🏗️ Architecture

### Backend (FastAPI)
- **Framework**: FastAPI with WebSocket support
- **Language**: Python 3.11
- **Features**:
  - RESTful API for game creation
  - WebSocket connections for real-time gameplay
  - Game state management
  - Ship placement validation
  - Attack logic and winner detection

### Frontend (React + TypeScript)
- **Framework**: React 18 with TypeScript
- **Build Tool**: Vite
- **Features**:
  - Interactive game boards with custom CSS
  - Real-time updates via WebSocket
  - Ship placement interface with rotation
  - Visual feedback for game states
  - Responsive design

## 📁 Project Structure

```
battleships-app/
├── backend/
│   ├── main.py              # FastAPI application
│   ├── requirements.txt     # Python dependencies
│   └── Dockerfile          # Backend container
├── frontend/
│   ├── src/
│   │   ├── App.tsx         # Main application component
│   │   ├── components/
│   │   │   ├── GameBoard.tsx      # Game board display
│   │   │   ├── ShipPlacement.tsx  # Ship placement UI
│   │   │   └── GameInfo.tsx       # Game status display
│   │   └── main.tsx        # Entry point
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

### Building Docker Images

#### Backend
```bash
cd backend
docker build -t battleships-backend:latest .
```

#### Frontend
```bash
cd frontend
docker build -t battleships-frontend:latest .
```

## ☸️ Kubernetes Deployment

### Prerequisites
- A running Kubernetes cluster
- kubectl configured to connect to your cluster

### Deploy to Kubernetes

1. **Build the Docker images** (as shown above)

2. **Load images into your cluster** (for local clusters like minikube):
   ```bash
   # For minikube
   minikube image load battleships-backend:latest
   minikube image load battleships-frontend:latest
   
   # For kind
   kind load docker-image battleships-backend:latest
   kind load docker-image battleships-frontend:latest
   ```

3. **Deploy the backend**:
   ```bash
   kubectl apply -f k8s/backend-deployment.yaml
   ```

4. **Deploy the frontend**:
   ```bash
   kubectl apply -f k8s/frontend-deployment.yaml
   ```

5. **Check deployment status**:
   ```bash
   kubectl get pods
   kubectl get services
   ```

6. **Access the application**:
   
   For minikube:
   ```bash
   minikube service frontend
   ```
   
   For cloud providers, get the external IP:
   ```bash
   kubectl get service frontend
   ```

### Kubernetes Configuration

The Kubernetes setup includes:

- **Backend Service**: ClusterIP service on port 8000
- **Frontend Service**: LoadBalancer service on port 80
- **Deployments**: 2 replicas each for high availability
- **Health Checks**: Liveness and readiness probes
- **Resource Limits**: CPU and memory constraints

## 🎲 How to Play

1. **Create a Game**:
   - Click "Create New Game" to start a new game
   - Share the Game ID with your opponent

2. **Join a Game**:
   - Enter the Game ID provided by your opponent
   - Click "Join Game"

3. **Place Your Ships**:
   - Click "Rotate" to change ship orientation (Horizontal/Vertical)
   - Click on the board to place each ship
   - Ships: Carrier (5), Battleship (4), Cruiser (3), Submarine (3), Destroyer (2)
   - Click "Confirm Placement" when done

4. **Battle**:
   - When it's your turn, click on your opponent's board to attack
   - Red = Hit, Blue = Miss
   - Sink all enemy ships to win!

## 🔧 Configuration

### Environment Variables

#### Frontend (.env)
```
VITE_API_URL=http://localhost:8000
```

For production, update this to your backend service URL.

#### Backend
No environment variables required for basic setup.

### Scaling

To scale deployments in Kubernetes:

```bash
# Scale backend
kubectl scale deployment battleships-backend --replicas=3

# Scale frontend
kubectl scale deployment battleships-frontend --replicas=3
```

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
- `place_ships` - Place ships on the board
- `attack` - Attack opponent's board
- `get_boards` - Request current board states

**Server → Client**:
- `player_assigned` - Player ID assignment
- `game_ready` - Both players connected
- `ships_placed` - Ship placement confirmation
- `game_started` - Game begins
- `attack_result` - Attack outcome
- `turn_changed` - Turn switch
- `game_over` - Game finished
- `player_disconnected` - Opponent left

## 🎨 Custom Ship Designs

Ships are rendered with custom CSS featuring:
- Metallic gradient styling
- 3D effects with highlights and shadows
- Animated hit markers with fire effects
- Splash animations for misses
- Hover effects during placement

## 📝 License

This project is open source and available for educational purposes.

## 🤝 Contributing

Contributions are welcome! Feel free to submit issues and pull requests.

## 📧 Support

For issues or questions, please create an issue in the repository.

---

Built with ❤️ using FastAPI, React, Docker, and Kubernetes
