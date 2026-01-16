# Redis Configuration - Environment-Aware Setup

## Overview
The application now uses environment-specific Redis URLs to support different infrastructure for development and production:

- **Development**: Uses local Redis on `redis://localhost:6379` by default
- **Production**: Uses Google Cloud Memorystore Redis (configured via Cloud Secret Manager)

## Changes Made

### 1. New Helper Module: `server/lib/redis-config.ts`
Created a centralized configuration utility that:
- Reads `NODE_ENV` to determine environment
- Returns appropriate Redis URL based on environment
- Provides consistent connection options for all Redis clients
- Masks sensitive credentials in logs for security

**Functions:**
- `getRedisUrl()`: Returns environment-aware Redis URL
- `isRedisConfigured()`: Checks if Redis is available
- `getRedisConnectionOptions()`: Returns standard ioredis connection options

### 2. Updated Redis Initialization Points
Modified the following files to use `getRedisUrl()`:

- `server/lib/queue.ts` - BullMQ background job queues
- `server/services/call-session-store.ts` - Call session persistence
- `server/lib/oauth-state-store.ts` - OAuth state management
- `server/routes/agent-reports.ts` - Agent leaderboard caching
- `server/workers/auto-recording-sync-worker.ts` - Recording synchronization
- `server/lib/auto-recording-sync-queue.ts` - Recording sync queue
- `server/lib/scheduled-email-worker.ts` - Scheduled email processing

### 3. Configuration Variables

#### Development Environment (`.env.local`)
```dotenv
# Uses local Redis by default
# Set REDIS_URL_DEV to override:
# REDIS_URL_DEV="redis://localhost:6379"

# Fallback Redis URL (used if REDIS_URL_DEV not set)
REDIS_URL="redis://default:f3D5QdjfPaFfFNtmjmy2rz3rNCFEhPfA@redis-10435.c228.us-central1-1.gce.cloud.redislabs.com:10435"
```

#### Production Environment (Cloud Secret Manager)
```
REDIS_URL -> points to Google Cloud Memorystore Redis
REDIS_URL_PROD -> (optional) explicit production Redis URL
```

## How It Works

### Development Flow
1. `NODE_ENV` defaults to `"development"`
2. `getRedisUrl()` checks for `REDIS_URL_DEV` environment variable
3. If not set, checks for `REDIS_URL` environment variable
4. Falls back to `redis://localhost:6379` (local Redis)
5. All Redis clients connect to the selected URL

### Production Flow
1. `NODE_ENV` set to `"production"` in Cloud Run
2. `getRedisUrl()` checks for `REDIS_URL` from Secret Manager
3. Falls back to `REDIS_URL_PROD` if available
4. Final fallback: `redis://10.181.0.35:6379` (internal GCS Memorystore IP)
5. All Redis clients connect to Memorystore

## Requirements

### Development
- **Local Redis**: Optional (graceful fallback if unavailable)
  - Install: `docker run -d -p 6379:6379 redis:latest`
  - Or use: `brew install redis` (macOS)
  - Or: Download from https://redis.io/download

- **Alternative**: Keep `REDIS_URL` pointing to Redis Cloud for development if local Redis not available

### Production
- **Google Cloud Memorystore**: Must be provisioned
  - Region: `us-central1`
  - Network: Same VPC as Cloud Run service
  - Internal IP: `10.181.0.35:6379` (or appropriate IP)

- **Secret Manager**: `REDIS_URL` secret must contain Memorystore connection URL

## Deployment Steps

### Step 1: Setup Local Redis (Development)
```bash
# Option A: Docker
docker run -d -p 6379:6379 redis:latest

# Option B: Brew (macOS)
brew install redis
redis-server

# Option C: Windows
# Download from https://redis.io/download or use WSL
```

### Step 2: Test Development Connection
```bash
npm run dev
# Look for: "[Queue] Redis connected to redis://localhost:6379"
# Look for: "[CallSessionStore] ✅ Redis connected (development)"
```

### Step 3: Configure Production (Cloud Run)
```bash
# Ensure REDIS_URL secret exists in GCP Secret Manager
gcloud secrets create REDIS_URL --data-file=- <<< "redis://:password@memorystore-ip:6379"

# Or update existing secret
gcloud secrets versions add REDIS_URL --data-file=- <<< "redis://:password@memorystore-ip:6379"

# Verify in deploy-gcloud.sh that REDIS_URL is included in --set-secrets
```

### Step 4: Deploy to Production
```bash
npm run build:prod
npm run deploy:prod
# Cloud Run will use REDIS_URL from Secret Manager
```

## Fallback Behavior

### If Redis Connection Fails
- **Call Session Store**: Falls back to in-memory store (session data lost on restart)
- **Background Jobs**: Jobs won't persist across restarts
- **OAuth State**: In-memory storage (limited to single server instance)
- **Caching**: No caching (additional database queries)

**Impact**: Application remains functional but loses persistence and cross-instance coordination.

### Optimal Setup
- **Development**: Use local Redis or Redis Cloud (your choice)
- **Production**: Use Google Cloud Memorystore for reliability and performance

## Monitoring & Troubleshooting

### Check Redis Connection
```bash
# Test local Redis connection
redis-cli ping
# Should return: PONG

# Test production Memorystore (from Cloud Run instance)
# Use Cloud Run internal network to connect to 10.181.0.35:6379
```

### View Logs
```bash
# Development
npm run dev
# Look for [Queue], [CallSessionStore], [OAuthStateStore] log lines

# Production
gcloud run logs read demandgentic-api --limit 50
# Filter for Redis connection messages
```

### Environment Variables Reference
| Variable | Development | Production | Purpose |
|----------|-------------|------------|---------|
| `NODE_ENV` | development | production | Determines which Redis URL to use |
| `REDIS_URL_DEV` | Optional override | Ignored | Explicit development Redis URL |
| `REDIS_URL` | Cloud Redis (fallback) | Secret Manager | Redis URL (fallback/primary) |
| `REDIS_URL_PROD` | Ignored | Optional override | Explicit production Redis URL |

## Security Notes

1. **Credentials Masking**: Redis URLs with passwords are masked in logs (`:***@` pattern)
2. **Network Isolation**: Memorystore uses internal VPC IP, not exposed to internet
3. **Connection Options**:
   - `maxRetriesPerRequest: null` - Required for BullMQ
   - `enableReadyCheck: false` - Improves performance
   - `enableOfflineQueue: true` - Resilience for temporary disconnections

## Testing Checklist

- [ ] Development server starts with Redis connection logs
- [ ] Background jobs process and persist across restarts
- [ ] Call sessions remain available during server restart
- [ ] OAuth flows complete successfully
- [ ] Agent leaderboard cache works (5-minute TTL)
- [ ] Production deployment connects to Memorystore
- [ ] Production background jobs function correctly
- [ ] Fallback to in-memory store works if Redis unavailable

## References

- [ioredis Documentation](https://github.com/luin/ioredis)
- [BullMQ Redis Requirements](https://docs.bullmq.io/guide/configurations)
- [Google Cloud Memorystore](https://cloud.google.com/memorystore/docs/redis)
- [Redis Local Development](https://redis.io/topics/quickstart)
