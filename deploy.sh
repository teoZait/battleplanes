#!/usr/bin/env bash
set -euo pipefail

# ─── Battleplanes Initial Production Setup ───
# Run this ON the DigitalOcean droplet for the first deploy.
# Usage: ./deploy.sh yourdomain.com
#
# Subsequent deploys are handled by deploy-blue-green.sh (called by CI).

DOMAIN="${1:?Usage: ./deploy.sh DOMAIN}"

echo "==> Setting up battleplanes for ${DOMAIN}"

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

# ── 2. Run blue-green deploy ──
echo "==> Running initial blue-green deploy..."
bash deploy-blue-green.sh

echo ""
echo "==> Setup complete! Your app is running on port 80."
echo "==> Make sure Cloudflare is proxying ${DOMAIN} to this server."
echo ""
echo "Subsequent deploys are automatic via GitHub Actions."
echo "Manual deploy: bash deploy-blue-green.sh"
