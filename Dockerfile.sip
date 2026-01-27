# Dockerfile for Drachtio SIP Server + Application

FROM ubuntu:22.04

# Install system dependencies
RUN apt-get update && apt-get install -y \
    curl \
    wget \
    gnupg \
    lsb-release \
    ca-certificates \
    apt-transport-https \
    build-essential \
    git \
    nodejs \
    npm \
    sox \
    libsox-dev \
    libsox-fmt-all \
    openssl \
    libssl-dev \
    && rm -rf /var/lib/apt/lists/*

# Install drachtio-server
RUN curl -fsSL https://raw.githubusercontent.com/drachtio/drachtio-server/main/install.sh | bash

# Install Node.js 20+
RUN npm install -g n && n 20

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm ci --production

# Copy application
COPY . .

# Build TypeScript
RUN npm run build

# Create non-root user
RUN useradd -m -u 1000 sip && chown -R sip:sip /app
USER sip

# Expose SIP ports
EXPOSE 5060/udp 5061/udp

# Expose RTP media ports
EXPOSE 10000-20000/udp

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD curl -f http://localhost:5000/api/health || exit 1

# Start drachtio and application
CMD ["npm", "start"]
