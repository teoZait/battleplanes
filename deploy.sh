#!/usr/bin/env bash
set -euo pipefail

# ─── Battleplanes Production Deploy Script ───
# Run this ON the DigitalOcean droplet after copying the project.
# Usage: ./deploy.sh yourdomain.com

DOMAIN="${1:?Usage: ./deploy.sh DOMAIN}"

echo "==> Deploying battleplanes to ${DOMAIN}"

# ── 1. Generate .env if it doesn't exist ──
if [ ! -f .env ]; then
    REDIS_PW=$(openssl rand -base64 24)
    cat > .env <<EOF
REDIS_PASSWORD=${REDIS_PW}
CORS_ALLOWED_ORIGINS=https://${DOMAIN}
EOF
    echo "==> Created .env with generated Redis password"
else
    echo "==> .env already exists, keeping it"
fi

# Source .env so variables are available
set -a; source .env; set +a

# ── 2. Build and start ──
echo "==> Building containers..."
docker compose -f docker-compose.yaml -f docker-compose.prod.yaml build

echo "==> Starting services..."
docker compose -f docker-compose.yaml -f docker-compose.prod.yaml up -d

echo ""
echo "==> Done! Your app is running on port 80."
echo "==> Make sure Cloudflare is proxying ${DOMAIN} to this server."
echo ""
echo "Useful commands:"
echo "  docker compose -f docker-compose.yaml -f docker-compose.prod.yaml logs -f"
echo "  docker compose -f docker-compose.yaml -f docker-compose.prod.yaml down"
echo "  docker compose -f docker-compose.yaml -f docker-compose.prod.yaml up -d"
