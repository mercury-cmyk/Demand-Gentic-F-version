#!/bin/bash
# Startup script for SIP server VM

set -e

# Logging
log() {
    echo "[$(date +'%Y-%m-%d %H:%M:%S')] $1" | tee -a /var/log/demandgentic-startup.log
}

log "Starting DemandGentic SIP Server setup..."

# Update system
log "Updating system packages..."
apt-get update
apt-get upgrade -y

# Install Docker
log "Installing Docker..."
curl -fsSL https://get.docker.com -o get-docker.sh
sh get-docker.sh
usermod -aG docker $(whoami)
log "Docker installed successfully"

# Install Docker Compose
log "Installing Docker Compose..."
curl -L "https://github.com/docker/compose/releases/latest/download/docker-compose-$(uname -s)-$(uname -m)" -o /usr/local/bin/docker-compose
chmod +x /usr/local/bin/docker-compose
log "Docker Compose installed successfully"

# Create application directory
log "Setting up application directory..."
mkdir -p /opt/demandgentic
cd /opt/demandgentic

# Clone repository
log "Cloning repository..."
git clone https://github.com/your-org/demandgentic-ai.git .
git checkout main

# Create environment file
log "Creating environment configuration..."
cat > .env.sip  /dev/null; then
    log "✓ Drachtio SIP server is running on port 5060"
else
    log "✗ Drachtio SIP server failed to start"
    exit 1
fi

# Check Coturn
if docker-compose -f docker-compose.sip.yml exec -T coturn netstat -an | grep 3478 > /dev/null; then
    log "✓ Coturn TURN server is running on port 3478"
else
    log "✗ Coturn TURN server failed to start"
    exit 1
fi

# Check Application
if curl -s http://localhost:5000/api/health > /dev/null; then
    log "✓ Application is running on port 5000"
else
    log "✗ Application failed to start"
    exit 1
fi

# Setup monitoring and logging
log "Setting up monitoring..."
docker-compose -f docker-compose.sip.yml logs -f &

log "DemandGentic SIP Server startup completed successfully!"
log "Public IP: ${public_ip}"
log "SIP Port: 5060/UDP"
log "TURN Port: 3478/UDP"
log "Application: http://${public_ip}:5000"