# Battleplanes

A real-time multiplayer strategy game where two players place planes on a grid and take turns trying to destroy each other's cockpits. Built with FastAPI, React, Redis, and WebSockets — fully containerized with Docker and deployable to Kubernetes.

> Think Battleship, but with planes. Hit the cockpit to destroy it. Body shots don't count.

---

## Table of Contents

- [Game Rules](#game-rules)
- [Tech Stack](#tech-stack)
- [Architecture](#architecture)
- [Getting Started](#getting-started)
- [Running Tests](#running-tests)
- [Project Structure](#project-structure)
- [API Reference](#api-reference)
- [Configuration](#configuration)
- [Deployment](#deployment)
- [License](#license)

---

## Game Rules

### The Plane

Each plane is a 10-cell cross pattern with a **cockpit** (head) and **body**:

```
         .   .   H   .   .       H = Cockpit (destroy target)
         B   B   B   B   B       B = Body (hit, but plane survives)
         .   .   B   .   .       . = Empty
         .   B   B   B   .
```

Planes can be rotated in 4 orientations: UP, RIGHT, DOWN, LEFT.

### How to Win

| Phase     | What happens                                                     |
|-----------|------------------------------------------------------------------|
| Setup     | Each player places **2 planes** on their 10x10 grid             |
| Battle    | Players alternate turns, clicking cells on the opponent's board  |
| Victory   | First player to destroy **both** enemy cockpits wins             |

### Hit Types

| Result       | Meaning                    | Visual     |
|--------------|----------------------------|------------|
| Miss         | No plane at that cell      | Water drop |
| Body hit     | Hit the plane body         | Fire       |
| Cockpit hit  | Plane destroyed instantly  | Explosion  |

---

## Tech Stack

| Layer      | Technology                                              |
|------------|---------------------------------------------------------|
| Backend    | Python 3.11, FastAPI, Uvicorn, Pydantic                 |
| Frontend   | React 18, TypeScript, Vite                              |
| State      | Redis 7 (async, authenticated)                          |
| Realtime   | WebSockets with session-token auth and reconnection     |
| Infra      | Docker Compose (dev), Kubernetes + Nginx (prod)         |
| Testing    | pytest + pytest-asyncio (backend), Vitest (frontend)    |

---

## Architecture

```
                       ┌────────────┐
                       │   Nginx    │ :80 / :443
                       │  (reverse  │  TLS termination
                       │   proxy)   │  security headers
                       └─────┬──────┘
                             │
              ┌──────────────┴──────────────┐
              │                             │
     HTTP / WS upgrade               Static assets
              │                       (React SPA)
              v
      ┌───────────────┐
      │   FastAPI      │ :8000
      │   Backend      │  REST + WebSocket
      │                │  rate limiting
      │                │  session auth
      └───────┬───────┘
              │
              v
      ┌───────────────┐
      │    Redis 7     │ :6379
      │   (async)      │  game state
      │                │  password auth
      └───────────────┘
```

The backend follows **Clean Architecture** with three layers:

- **Domain** — Game models, value objects, game logic (pure, no I/O)
- **Application** — Game service, orchestration, lifecycle management
- **Infrastructure** — Redis store, WebSocket connection manager

### Security Highlights

- Session-token authentication for WebSocket reconnection
- Per-connection rate limiting (sliding window)
- WebSocket message size limits
- CORS with explicit origin allowlist
- Security headers (HSTS, CSP, X-Frame-Options, X-Content-Type-Options)
- Redis password authentication
- WebSocket origin validation
- Exponential backoff with jitter and max retry cap on the client

---

## Getting Started

### Prerequisites

- [Docker](https://docs.docker.com/get-docker/) and Docker Compose

### Run Locally

```bash
docker compose up --build
```

Then open [http://localhost](http://localhost) in your browser.

| Service  | URL                           |
|----------|-------------------------------|
| Frontend | http://localhost               |
| Backend  | http://localhost:8000          |
| API Docs | http://localhost:8000/docs     |

### Play

1. Open the app and click **Create New Game**
2. Copy the Game ID and share it with your opponent
3. Both players place **2 planes** on the board (click to place, rotate to change orientation)
4. Click **Confirm Placement** when ready
5. Take turns attacking the opponent's grid
6. Destroy both enemy cockpits to win

---

## Running Tests

### Backend

```bash
docker compose run --rm backend python -m pytest tests/ -v
```

### Frontend

```bash
cd frontend
docker run --rm -v "$(pwd)":/app -w /app node:18-alpine \
  sh -c "npm install --silent 2>/dev/null && npx vitest run --reporter=verbose"
```

---

## Project Structure

```
battleplanes/
├── backend/
│   ├── main.py                        # FastAPI app, routes, WS endpoint
│   ├── domain/
│   │   ├── models.py                  # Game aggregate root
│   │   ├── game_logic.py              # Pure game rules
│   │   └── value_objects.py           # Enums, board types
│   ├── application/
│   │   ├── game_service.py            # Orchestration, lifecycle
│   │   └── schemas.py                 # Pydantic request/response models
│   ├── infrastructure/
│   │   ├── game_store.py              # Async Redis persistence
│   │   └── connection_manager.py      # WebSocket connection tracking
│   ├── tests/
│   │   ├── conftest.py                # Test fixtures
│   │   ├── test_api.py                # HTTP endpoint tests
│   │   ├── test_websocket.py          # WS integration tests
│   │   ├── test_game_service.py       # Service layer tests
│   │   ├── test_game_store.py         # Redis store tests
│   │   ├── test_domain.py             # Game logic tests
│   │   └── ...
│   ├── requirements.txt
│   └── Dockerfile
├── frontend/
│   ├── src/
│   │   ├── App.tsx                    # Main app component
│   │   ├── components/
│   │   │   ├── GameBoard.tsx          # Game board grid
│   │   │   ├── PlanePlacement.tsx     # Plane setup UI
│   │   │   ├── GameInfo.tsx           # Status display
│   │   │   └── ZoomableBoard.tsx      # Pinch-to-zoom (mobile)
│   │   ├── hooks/
│   │   │   └── UseGameWebSocket.tsx   # WS hook with reconnection
│   │   ├── reducers/
│   │   │   └── gameReducer.tsx        # Game state reducer
│   │   ├── helpers.ts                 # Plane rotation utilities
│   │   └── tests/                     # Vitest test suites
│   ├── nginx.conf                     # Nginx config (TLS, headers)
│   ├── package.json
│   └── Dockerfile                     # Multi-stage build
├── k8s/                               # Kubernetes manifests
│   ├── backend-deployment.yaml
│   ├── frontend-deployment.yaml
│   ├── redis.yaml
│   ├── ingress.yaml
│   ├── cert-issuer.yaml
│   └── namespace.yaml
├── docker-compose.yaml                # Local development
└── docker-compose.prod.yaml           # Production compose
```

---

## API Reference

### REST Endpoints

| Method | Path              | Description                 |
|--------|-------------------|-----------------------------|
| GET    | `/`               | Health check                |
| POST   | `/game/create`    | Create a new game           |
| GET    | `/game/{game_id}` | Get game info (id + state)  |

### WebSocket

Connect to `ws://HOST/ws/{game_id}` (optionally with `?token=SESSION_TOKEN` for reconnection).

#### Client Messages

```json
{ "type": "place_plane", "head_x": 5, "head_y": 2, "orientation": "up" }
{ "type": "attack", "x": 3, "y": 7 }
```

#### Server Messages

| Type                  | Description                                           |
|-----------------------|-------------------------------------------------------|
| `player_assigned`     | Your player ID and session token                      |
| `game_ready`          | Both players connected                                |
| `plane_placed`        | Placement confirmation with count                     |
| `game_started`        | Battle phase begins, includes who goes first          |
| `attack_result`       | Hit/miss/head_hit result for both players             |
| `turn_changed`        | Whose turn it is now                                  |
| `game_over`           | Winner declared                                       |
| `game_resumed`        | Full board state on reconnection                      |
| `player_disconnected` | Opponent left                                         |
| `error`               | Error message                                         |

---

## Configuration

### Environment Variables

| Variable               | Default                          | Description                           |
|------------------------|----------------------------------|---------------------------------------|
| `REDIS_URL`            | `redis://localhost:6379/0`       | Redis connection string               |
| `REDIS_PASSWORD`       | `changeme`                       | Redis auth password                   |
| `CORS_ALLOWED_ORIGINS` | `http://localhost,https://localhost` | Comma-separated allowed origins    |
| `VITE_API_URL`         | `http://localhost:8000`          | Backend URL (frontend build-time)     |

---

## Deployment

### Docker Compose (Production)

```bash
REDIS_PASSWORD=your-secure-password docker compose -f docker-compose.prod.yaml up --build -d
```

### Kubernetes

Apply the manifests in order:

```bash
kubectl apply -f k8s/namespace.yaml
kubectl apply -f k8s/config.yaml
kubectl apply -f k8s/redis.yaml
kubectl apply -f k8s/backend-deployment.yaml
kubectl apply -f k8s/frontend-deployment.yaml
kubectl apply -f k8s/cert-issuer.yaml
kubectl apply -f k8s/ingress.yaml
```

---

## License

This project is open source and available for educational purposes.
