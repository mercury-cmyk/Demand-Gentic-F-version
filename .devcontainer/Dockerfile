FROM mcr.microsoft.com/devcontainers/typescript-node:20

# Install PostgreSQL client tools
RUN apt-get update && export DEBIAN_FRONTEND=noninteractive \
    && apt-get -y install --no-install-recommends \
    postgresql-client \
    && apt-get clean -y && rm -rf /var/lib/apt/lists/*

# Install global npm packages
RUN su node -c "npm install -g npm@latest drizzle-kit tsx typescript"

# Set working directory
WORKDIR /workspace

# Configure git (for commits)
RUN git config --global --add safe.directory /workspace
