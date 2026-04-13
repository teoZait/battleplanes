# Battleplanes

A real-time multiplayer strategy game where two players place planes on a grid and take turns trying to destroy each other's cockpits. Built with FastAPI, React, Redis, and WebSockets — fully containerized with Docker and deployable to Kubernetes.

> Think Battleship, but with planes. Hit the cockpit to destroy it. Body shots don't count.

**[Play now at battleplanes.io](https://battleplanes.io)**

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
- [Monitoring](#monitoring)
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

### Game Modes

| Mode        | Planes per player | Win condition              |
|-------------|-------------------|----------------------------|
| **Classic** | 2                 | Destroy both cockpits      |
| **Elite**   | 3                 | Destroy all three cockpits |

### How to Win

| Phase     | What happens                                                     |
|-----------|------------------------------------------------------------------|
| Setup     | Each player places their planes on a 10x10 grid                 |
| Battle    | Players alternate turns, clicking cells on the opponent's board  |
| Victory   | First player to destroy **all** enemy cockpits wins              |

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
| Monitoring | Prometheus, Grafana (dashboards + Slack alerts)         |
| Infra      | Docker Compose, blue-green deploys, Nginx reverse proxy |
| Testing    | pytest + pytest-asyncio (backend), Vitest (frontend)    |

---

## Architecture

```
      ┌───────────────────────────┐
      │     React 18 + TypeScript  │
      │   SPA with client routing  │
      │   WebSocket reconnection   │
      └────────────┬──────────────┘
                   │
                   v
      ┌───────────────────────────┐
      │       Cloudflare           │  TLS termination
      └────────────┬──────────────┘
                   │ :80
                   v
      ┌───────────────────────────┐
      │      nginx-proxy           │  never restarted during deploys
      │   reverse proxy + routing  │  config swap via nginx -s reload
      └─────┬─────────────┬───────┘
            │             │
     /api/* & /ws/*    /* (static)
            │             │
            v             v
      ┌───────────┐ ┌───────────┐
      │  backend   │ │ frontend  │   blue-green: only one color
      │  -blue or  │ │ -blue or  │   is active at a time
      │  -green    │ │ -green    │
      └──────┬─────┘ └───────────┘
             │
             v
      ┌───────────────────────────┐
      │         Redis 7            │  never restarted during deploys
      │   game state (JSON + TTL)  │  RDB snapshots → Docker volume
      │   password auth            │
      └───────────────────────────┘
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

1. Open the app and click **Create Game**
2. Choose a mode — **Classic** (2 planes) or **Elite** (3 planes)
3. Share the game link with your opponent
4. Both players place their planes on the board (click to place, rotate to change orientation)
5. Click **Confirm Placement** when ready
6. Take turns attacking the opponent's grid
7. Destroy all enemy cockpits to win

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
│   ├── metrics.py                     # Prometheus metric definitions
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
├── proxy/                              # Blue-green reverse proxy configs
│   ├── nginx-blue.conf                 # Routes to backend-blue + frontend-blue
│   └── nginx-green.conf               # Routes to backend-green + frontend-green
├── k8s/                               # Kubernetes manifests
│   ├── backend-deployment.yaml
│   ├── frontend-deployment.yaml
│   ├── redis.yaml
│   ├── ingress.yaml
│   ├── cert-issuer.yaml
│   └── namespace.yaml
├── prometheus.yml                      # Prometheus scrape config
├── prometheus-targets.json             # Dynamic scrape targets (updated by deploy)
├── grafana/
│   ├── provisioning/
│   │   ├── datasources/prometheus.yml  # Auto-configured data source
│   │   ├── dashboards/dashboards.yml   # Dashboard provider config
│   │   └── alerting/                   # Contact points, policies, rules
│   └── dashboards/
│       └── battleplanes.json           # Pre-built overview dashboard
├── docker-compose.yaml                 # Local development
├── docker-compose.prod.yaml            # Production (blue-green services)
├── deploy.sh                           # Initial production setup
└── deploy-blue-green.sh                # Zero-downtime deploy script
```

---

## API Reference

### REST Endpoints

| Method | Path                          | Description                        |
|--------|-------------------------------|------------------------------------|
| GET    | `/`                           | Health check                       |
| POST   | `/api/game/create`            | Create a new game (`{mode}` body)  |
| GET    | `/api/game/{game_id}`         | Get game info (id, state, mode)    |
| POST   | `/api/game/{game_id}/continue`| Continue in a new game             |

### Frontend Routes

| Path            | Description                    |
|-----------------|--------------------------------|
| `/`             | Landing page (create or join)  |
| `/game/{id}`    | Game view (auto-joins via URL) |

### WebSocket

Connect to `ws://HOST/ws/{game_id}`. Auth is sent as the first frame (`{type: "auth", token: "..."}`).

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
| `VITE_API_URL`         | *(empty — same origin)*         | Backend URL (frontend build-time)     |
| `GRAFANA_ADMIN_PASSWORD` | `changeme`                    | Grafana admin UI password             |
| `SLACK_WEBHOOK_URL`    | *(empty)*                        | Slack webhook for alert notifications |

---

## Monitoring

The app includes Prometheus + Grafana for metrics collection, dashboards, and alerting.

### What's Tracked

| Metric | Type | Description |
|--------|------|-------------|
| `battleplanes_active_games` | Gauge | Games currently in memory |
| `battleplanes_games_by_state` | Gauge | Games broken down by state (waiting, placing, playing, finished) |
| `battleplanes_games_created_total` | Counter | Total games created, by mode |
| `battleplanes_games_finished_total` | Counter | Total games that reached a winner |
| `battleplanes_games_cleaned_up_total` | Counter | Stale games removed by cleanup |
| `battleplanes_ws_connections` | Gauge | Active WebSocket connections |
| `battleplanes_ws_messages_received_total` | Counter | Total WebSocket messages from clients |
| `battleplanes_http_requests_total` | Counter | HTTP requests by method, endpoint, status |
| `battleplanes_http_request_duration_seconds` | Histogram | Request latency distribution |

### Dashboard

A pre-built Grafana dashboard is provisioned automatically with panels for all metrics above. No manual setup needed — just open Grafana.

### Alerts

| Alert | Fires when | Severity |
|-------|------------|----------|
| High HTTP Error Rate | 5xx rate > 0.1 req/s for 2 min | Critical |
| High Request Latency | p99 > 1s for 5 min | Warning |
| Backend Scrape Failing | Prometheus can't reach `/metrics/` for 2 min | Critical |

Alerts are sent to Slack via the configured webhook URL.

### Accessing Locally

Prometheus and Grafana are available at `localhost` after `docker compose up`:

| Service    | URL                      | Credentials        |
|------------|--------------------------|---------------------|
| Grafana    | http://localhost:3000    | admin / changeme    |
| Prometheus | http://localhost:9090    | *(no auth)*         |

### Accessing on the Droplet

Both services are bound to `127.0.0.1` — not exposed to the internet. Access them via SSH tunnel:

```bash
ssh -L 3000:localhost:3000 -L 9090:localhost:9090 your-droplet
```

Then open `http://localhost:3000` on your machine.

### Security

- `/metrics` endpoint is blocked by Nginx — Prometheus scrapes the backend directly over the Docker network
- Prometheus and Grafana ports are bound to `127.0.0.1` (loopback only)
- Grafana admin password is set via `GRAFANA_ADMIN_PASSWORD` env var

---

## Deployment

### How It Works

Production uses **blue-green deployment** for zero-downtime releases. Two identical sets of backend + frontend containers (blue and green) take turns being the active set. An nginx reverse proxy sits in front and switches between them via `nginx -s reload`.

```
push to main → CI SSHs in → build new color → wait healthy → nginx reload → kill old color
```

What stays running during every deploy:
- **Redis** — never restarted, all game state persists. RDB snapshots to a Docker volume.
- **nginx-proxy** — never restarted, only its config is swapped and gracefully reloaded.
- **Prometheus + Grafana** — untouched, persistent volumes.

What gets swapped:
- **backend-{blue/green}** — new container starts, loads all games from Redis, becomes healthy, then receives traffic.
- **frontend-{blue/green}** — static files only, no state to lose.
- **WebSocket connections** — drop briefly when the old backend is killed. Clients auto-reconnect with session tokens and recover full game state.

See [blue-green-architecture.html](blue-green-architecture.html) for a detailed visual walkthrough.

### Initial Setup (on the DigitalOcean droplet)

```bash
git clone <repo> /opt/battleplanes
cd /opt/battleplanes
./deploy.sh yourdomain.com
```

This creates `.env` with a generated Redis password and runs the first blue-green deploy.

### Subsequent Deploys (automatic)

Every push to `main` triggers a GitHub Action that SSHs into the droplet and runs `deploy-blue-green.sh`. The script:

1. Acquires a file lock (prevents concurrent deploys)
2. Reads `active_color` to determine which color to deploy next
3. Builds and starts the new color alongside the old
4. Waits for health checks (rolls back on failure)
5. Swaps the proxy config and runs `nginx -s reload`
6. Updates Prometheus scrape targets to the new color
7. Waits 60s for connection draining, then stops the old color
8. Prunes unused Docker images

### Manual Deploy

```bash
cd /opt/battleplanes
git pull origin main
bash deploy-blue-green.sh
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

This project is licensed under the MIT License — see [LICENSE](LICENSE) for details.
