#!/usr/bin/env bash
set -euo pipefail

# ─── Battleplanes Production Deploy Script ───
# Run this ON the DigitalOcean droplet after copying the project.
# Usage: ./deploy.sh play.yourdomain.com you@email.com

DOMAIN="${1:?Usage: ./deploy.sh DOMAIN EMAIL}"
EMAIL="${2:?Usage: ./deploy.sh DOMAIN EMAIL}"

echo "==> Deploying battleplanes to ${DOMAIN}"

# ── 1. Generate a strong Redis password if .env doesn't exist ──
if [ ! -f .env ]; then
    REDIS_PW=$(openssl rand -base64 24)
    cat > .env <<EOF
REDIS_PASSWORD=${REDIS_PW}
DOMAIN=${DOMAIN}
CERT_EMAIL=${EMAIL}
CORS_ALLOWED_ORIGINS=https://${DOMAIN}
EOF
    echo "==> Created .env with generated Redis password"
else
    echo "==> .env already exists, keeping it"
fi

# Source .env so variables are available
set -a; source .env; set +a

# ── 2. Replace DOMAIN placeholder in nginx.prod.conf ──
sed -i "s|DOMAIN|${DOMAIN}|g" frontend/nginx.prod.conf
echo "==> Updated nginx.prod.conf with domain: ${DOMAIN}"

# ── 3. Build everything ──
echo "==> Building containers..."
docker compose -f docker-compose.yaml -f docker-compose.prod.yaml build

# ── 4. Create temporary self-signed cert so nginx can start ──
# The certs volume is empty on first run, but nginx.prod.conf expects
# certs at /etc/nginx/ssl/live/DOMAIN/. We seed the volume with a
# self-signed cert so nginx starts and can serve the ACME challenge.
echo "==> Creating temporary self-signed certificate..."
docker compose -f docker-compose.yaml -f docker-compose.prod.yaml run --rm --entrypoint="" \
    certbot sh -c "
        mkdir -p /etc/letsencrypt/live/${DOMAIN} &&
        openssl req -x509 -nodes -days 1 -newkey rsa:2048 \
            -keyout /etc/letsencrypt/live/${DOMAIN}/privkey.pem \
            -out /etc/letsencrypt/live/${DOMAIN}/fullchain.pem \
            -subj '/CN=${DOMAIN}'
    "

# ── 5. Start services with the temporary cert ──
echo "==> Starting services (initial bootstrap)..."
docker compose -f docker-compose.yaml -f docker-compose.prod.yaml up -d

# Wait for nginx to be ready
echo "==> Waiting for nginx..."
sleep 5

# ── 6. Get the real certificate from Let's Encrypt ──
echo "==> Requesting TLS certificate from Let's Encrypt..."
docker compose -f docker-compose.yaml -f docker-compose.prod.yaml run --rm certbot \
    certonly --webroot -w /var/www/certbot \
    -d "${DOMAIN}" \
    --email "${EMAIL}" --agree-tos --no-eff-email

# ── 7. Restart frontend to pick up the real cert ──
echo "==> Restarting frontend with real TLS certificate..."
docker compose -f docker-compose.yaml -f docker-compose.prod.yaml restart frontend

echo ""
echo "==> Done! Your app is live at https://${DOMAIN}"
echo ""
echo "Useful commands:"
echo "  docker compose -f docker-compose.yaml -f docker-compose.prod.yaml logs -f"
echo "  docker compose -f docker-compose.yaml -f docker-compose.prod.yaml down"
echo "  docker compose -f docker-compose.yaml -f docker-compose.prod.yaml up -d"
