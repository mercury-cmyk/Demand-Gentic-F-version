#!/bin/bash
# ============================================================
# DemandGentic AI — One-time VM setup
# Run this once on a fresh VM to install dependencies and
# generate initial SSL certificates.
# Usage: sudo bash setup.sh
# ============================================================

set -euo pipefail

DOMAIN="demandgentic.ai"
EMAIL="admin@pivotal-b2b.com"  # Change to your email for certbot notifications
APP_DIR="/home/Zahid/demandgentic"
REPO_URL="https://github.com/mohammadizahid704-blip/DemandGentic-V.01.git"

echo "========================================="
echo "  DemandGentic AI — VM Setup"
echo "========================================="

# 1. System updates
echo "[1/7] Updating system packages..."
apt-get update -qq && apt-get upgrade -y -qq

# 2. Install Docker + Docker Compose (if not already installed)
if ! command -v docker &>/dev/null; then
    echo "[2/7] Installing Docker..."
    curl -fsSL https://get.docker.com | sh
    usermod -aG docker Zahid
else
    echo "[2/7] Docker already installed: $(docker --version)"
fi

if ! docker compose version &>/dev/null; then
    echo "  Installing Docker Compose plugin..."
    apt-get install -y -qq docker-compose-plugin
else
    echo "  Docker Compose already installed: $(docker compose version)"
fi

# 3. Install certbot (standalone for initial cert, then managed by docker)
if ! command -v certbot &>/dev/null; then
    echo "[3/7] Installing certbot..."
    apt-get install -y -qq certbot
else
    echo "[3/7] Certbot already installed"
fi

# 4. Clone/update repo
if [ -d "$APP_DIR" ]; then
    echo "[4/7] Updating existing repo..."
    cd "$APP_DIR"
    git pull origin main
else
    echo "[4/7] Cloning repository..."
    git clone "$REPO_URL" "$APP_DIR"
    cd "$APP_DIR"
fi

# 5. Generate .env from Google Secret Manager
echo "[5/7] Fetching secrets from Google Secret Manager..."
bash vm-deploy/fetch-secrets.sh

# 6. SSL certificates
CERT_DIR="vm-deploy/nginx/ssl/live/$DOMAIN"
if [ ! -f "$CERT_DIR/fullchain.pem" ]; then
    echo "[6/7] Generating SSL certificate with certbot..."
    # Stop anything on port 80
    docker stop dg_nginx 2>/dev/null || true

    certbot certonly \
        --standalone \
        --non-interactive \
        --agree-tos \
        --email "$EMAIL" \
        -d "$DOMAIN"

    # Copy certs to our nginx ssl dir
    mkdir -p "$CERT_DIR"
    cp -rL /etc/letsencrypt/live/$DOMAIN/* "$CERT_DIR/"
    cp -rL /etc/letsencrypt/archive "$APP_DIR/vm-deploy/nginx/ssl/"
    cp -rL /etc/letsencrypt/renewal "$APP_DIR/vm-deploy/nginx/ssl/"
    echo "  SSL certificate generated successfully"
else
    echo "[6/7] SSL certificate already exists"
fi

# 7. Open firewall ports
echo "[7/7] Configuring firewall..."
ufw allow 80/tcp   2>/dev/null || true
ufw allow 443/tcp  2>/dev/null || true
ufw allow 5060/udp 2>/dev/null || true  # SIP
ufw allow 8090/tcp 2>/dev/null || true  # Media bridge (internal, but needed for health checks)
ufw allow 10000:10500/udp 2>/dev/null || true  # RTP port range

# System tuning for high-concurrency calling
echo "[*] Applying system tuning..."
cat > /etc/sysctl.d/99-demandgentic.conf << 'SYSCTL'
# Increase network buffers for RTP
net.core.rmem_max = 16777216
net.core.wmem_max = 16777216
net.core.rmem_default = 1048576
net.core.wmem_default = 1048576
# Increase connection tracking
net.netfilter.nf_conntrack_max = 131072
# Increase file descriptors
fs.file-max = 2097152
# Reduce TIME_WAIT sockets
net.ipv4.tcp_tw_reuse = 1
net.ipv4.tcp_fin_timeout = 15
SYSCTL
sysctl -p /etc/sysctl.d/99-demandgentic.conf 2>/dev/null || true

# Increase container file descriptor limits
mkdir -p /etc/docker
cat > /etc/docker/daemon.json << 'DAEMON'
{
  "default-ulimits": {
    "nofile": { "Name": "nofile", "Hard": 65535, "Soft": 65535 }
  },
  "log-driver": "json-file",
  "log-opts": {
    "max-size": "50m",
    "max-file": "3"
  }
}
DAEMON
systemctl restart docker

echo ""
echo "========================================="
echo "  Setup complete!"
echo "========================================="
echo ""
echo "Next steps:"
echo "  1. Review vm-deploy/.env"
echo "  2. Run: cd $APP_DIR && bash vm-deploy/deploy.sh"
echo "  3. Point DNS A record for $DOMAIN to $(curl -s http://metadata.google.internal/computeMetadata/v1/instance/network-interfaces/0/access-configs/0/external-ip -H 'Metadata-Flavor: Google' 2>/dev/null || echo '35.239.173.4')"
echo ""
