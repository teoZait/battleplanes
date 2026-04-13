#!/usr/bin/env bash
set -euo pipefail

# ─── Blue-Green Deployment Script ───
# Deploys the inactive color, waits for health, swaps the proxy, stops the old.
# Requires .env to exist (run deploy.sh first for initial setup).

COMPOSE="docker compose -f docker-compose.prod.yaml"
COLOR_FILE="active_color"

# ── Prevent concurrent deploys ──
exec 200>/tmp/battleplanes-deploy.lock
flock -n 200 || { echo "ERROR: another deploy is already running"; exit 1; }

if [ ! -f .env ]; then
    echo "ERROR: .env not found. Run ./deploy.sh <domain> for initial setup."
    exit 1
fi

set -a; source .env; set +a

# ── Determine active and next color ──
CURRENT=$(cat "$COLOR_FILE" 2>/dev/null || echo "none")

if [ "$CURRENT" = "blue" ]; then
    NEXT="green"
else
    NEXT="blue"
fi

echo "==> Active: $CURRENT -> deploying: $NEXT"

# ── Start infrastructure (redis, prometheus, grafana — not proxy yet) ──
echo "==> Ensuring infrastructure is running..."
$COMPOSE up -d redis prometheus grafana

# ── Build and start the new color ──
echo "==> Building $NEXT..."
$COMPOSE build --no-cache "backend-$NEXT" "frontend-$NEXT"

echo "==> Starting $NEXT..."
$COMPOSE up -d --no-deps "backend-$NEXT" "frontend-$NEXT"

# ── Wait for health checks ──
rollback() {
    echo "ERROR: $NEXT failed to become healthy. Cleaning up..."
    $COMPOSE stop "backend-$NEXT" "frontend-$NEXT" 2>/dev/null || true
    $COMPOSE rm -f "backend-$NEXT" "frontend-$NEXT" 2>/dev/null || true
    echo "    $NEXT containers removed. $CURRENT is still serving."
    exit 1
}

echo "==> Waiting for backend-$NEXT to be healthy..."
if ! timeout 120 bash -c "
    until [ \"\$(docker inspect -f '{{.State.Health.Status}}' battleplanes-backend-$NEXT 2>/dev/null)\" = \"healthy\" ]; do
        sleep 2
    done
"; then
    rollback
fi
echo "    backend-$NEXT is healthy"

echo "==> Waiting for frontend-$NEXT to be healthy..."
if ! timeout 60 bash -c "
    until [ \"\$(docker inspect -f '{{.State.Health.Status}}' battleplanes-frontend-$NEXT 2>/dev/null)\" = \"healthy\" ]; do
        sleep 2
    done
"; then
    rollback
fi
echo "    frontend-$NEXT is healthy"

# ── Ensure proxy is running (start on first deploy, noop after) ──
# Proxy starts after backends are healthy so nginx can resolve upstream names.
echo "==> Ensuring proxy is running..."
cp "proxy/nginx-$NEXT.conf" proxy/active.conf
$COMPOSE up -d nginx-proxy

# ── Swap proxy to new color ──
# Use cat > (not cp) to preserve the file inode — Docker bind mounts track the inode,
# so replacing the file with cp would make the container see stale content.
echo "==> Switching proxy to $NEXT..."
cat "proxy/nginx-$NEXT.conf" > proxy/active.conf
docker exec battleplanes-proxy nginx -s reload

# ── Update Prometheus to scrape new color ──
cat > prometheus-targets.json <<EOF
[
  {
    "targets": ["backend-$NEXT:8000"],
    "labels": {"color": "$NEXT"}
  }
]
EOF
echo "    prometheus now scrapes backend-$NEXT"

echo "$NEXT" > "$COLOR_FILE"
echo "    proxy now routes to $NEXT"

# ── Stop old color with grace period for connection draining ──
if [ "$CURRENT" != "none" ]; then
    echo "==> Traffic shifted. Waiting 60s for existing connections to drain..."
    sleep 60
    echo "==> Stopping $CURRENT..."
    $COMPOSE stop "backend-$CURRENT" "frontend-$CURRENT"
    $COMPOSE rm -f "backend-$CURRENT" "frontend-$CURRENT"
    echo "    $CURRENT stopped"
fi

# ── Clean up old Docker images ──
echo "==> Pruning unused images..."
docker image prune -f

echo ""
echo "==> Deploy complete! Active color: $NEXT"
