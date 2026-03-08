#!/bin/bash
# ============================================================
# DemandGentic AI — Deploy / Update
# Run this to pull latest code, rebuild, and restart services.
# Usage: bash vm-deploy/deploy.sh [--rebuild-media-bridge]
# ============================================================

set -euo pipefail

APP_DIR="${APP_DIR:-/home/Zahid/demandgentic}"
COMPOSE_FILE_REL="${COMPOSE_FILE_REL:-vm-deploy/docker-compose.yml}"
COMPOSE="docker compose -f $COMPOSE_FILE_REL"
REBUILD_MB=false

for arg in "$@"; do
    case $arg in
        --rebuild-media-bridge) REBUILD_MB=true ;;
    esac
done

cd "$APP_DIR"

echo "========================================="
echo "  DemandGentic AI — Deploying"
echo "========================================="

# 1. Pull latest code
echo "[1/5] Pulling latest code..."
git pull origin main

# 2. Build API server image
echo "[2/5] Building API server..."
$COMPOSE build api

# 3. Optionally rebuild media bridge
if [ "$REBUILD_MB" = true ]; then
    echo "[3/5] Rebuilding media bridge..."
    $COMPOSE build media-bridge
else
    echo "[3/5] Skipping media bridge rebuild (use --rebuild-media-bridge to rebuild)"
fi

# 4. Rolling restart — bring up new containers
echo "[4/5] Restarting services..."

# Stop old API gracefully (15s drain)
echo "  Stopping API server..."
$COMPOSE stop api 2>/dev/null || true

# Start all services
echo "  Starting all services..."
$COMPOSE up -d

# 5. Verify health
echo "[5/5] Verifying health..."
sleep 5

check_health() {
    local name=$1
    local url=$2
    local status
    status=$(curl -sf -o /dev/null -w "%{http_code}" "$url" 2>/dev/null) || status="000"
    if [ "$status" = "200" ]; then
        echo "  $name: OK"
    else
        echo "  $name: FAILED (HTTP $status)"
    fi
}

check_health "API"           "http://localhost:8080/api/health"
check_health "Media Bridge"  "http://localhost:8090/health"
check_health "Nginx (HTTPS)" "https://demandgentic.ai/api/health"

# Show running containers
echo ""
echo "Running containers:"
docker ps --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}" | grep dg_

echo ""
echo "Deploy complete! $(date)"
echo ""

# Show recent logs
echo "Recent API logs:"
$COMPOSE logs api --tail 10 --no-log-prefix 2>/dev/null || true
