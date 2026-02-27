# Multi-stage Dockerfile for production

# --------------------
# Builder: install deps and build
# --------------------
FROM node:20-alpine AS builder

# Accept build arg for Node.js memory limit (GitHub Actions runners need this)
ARG NODE_OPTIONS="--max-old-space-size=4096"
ENV NODE_OPTIONS=${NODE_OPTIONS}

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install all dependencies (including devDependencies for build)
RUN npm ci

# Copy source files
COPY . .

# Build the application — fail the Docker build if compilation fails
# (never swallow errors: a missing dist/server/index.js causes silent container crashes)
RUN npm run build

# --------------------
# Runner: lean image with only production artifacts
# --------------------
FROM node:20-alpine AS production

# Expand libuv thread pool for concurrent DB/Redis/DNS at startup (default 4 is too few)
ENV UV_THREADPOOL_SIZE=128

WORKDIR /app

# Install dumb-init for proper signal handling and curl for healthcheck
RUN apk add --no-cache dumb-init curl

# Create non-root user
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nodejs -u 1001

# Copy package files
COPY package*.json ./

# Install only production dependencies
RUN npm ci --omit=dev && npm cache clean --force

# Copy built application from builder stage
COPY --from=builder /app/dist ./dist

# Copy any additional required files
COPY --from=builder /app/shared ./shared
COPY --from=builder /app/migrations ./migrations

# Set ownership
RUN chown -R nodejs:nodejs /app

# Switch to non-root user
USER nodejs

# Expose port (Cloud Run uses PORT env variable)
EXPOSE 8080

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
  CMD curl -f http://localhost:${PORT:-8080}/api/health || exit 1

# Use dumb-init for proper signal handling
ENTRYPOINT ["dumb-init", "--"]

# Start the application
CMD ["node", "dist/server/index.js"]
