
# Production Database Secrets Guide

## Overview

This document explains how database secrets are configured for production deployment on Replit.

## Database URL Configuration

### Development (Local Replit Workspace)

The `DATABASE_URL` is automatically injected from Replit Secrets and used directly:

```typescript
// server/db.ts
const connectionString = process.env.DATABASE_URL;
```

### Production (Deployed App)

When you deploy your app, Replit uses the **Deployment Secrets** feature:

1. **Location**: Deployment → Settings → Secrets
2. **Secret Name**: `DATABASE_URL`
3. **Secret Value**: Your Neon PostgreSQL connection string

## Current Setup

From your `.replit` file:

```ini
[env]
PORT = "5000"

[userenv.shared]
REDIS_URL = "redis://default:ttVaOhNjFsLxPOhfeFUkbFgyad1DLlhdt@redis-11546.fcrce171.ap-south-1-1.ec2.redns.redis-cloud.com:11546"
```

**Note**: `DATABASE_URL` is stored in Replit Secrets (not in `.replit` file for security).

## How to Verify Production Database Secret

### 1. Check Replit Secrets (Development)

- Open Replit workspace
- Click on "Secrets" tab (🔒 icon in left sidebar)
- Verify `DATABASE_URL` exists

### 2. Check Deployment Secrets (Production)

- Click "Deploy" button
- Select your deployment
- Go to "Settings" → "Secrets"
- Verify `DATABASE_URL` is configured

### 3. Test Connection

From your Replit shell:

```bash
# Test database connection
npx tsx -e "import { db } from './server/db'; db.execute('SELECT 1').then(() => console.log('✅ DB Connected')).catch(e => console.error('❌ DB Error:', e));"
```

## Email Validation Test Endpoint

The email validation test is now live at:

```
POST /api/test/email-validation/single
POST /api/test/email-validation/batch
GET  /api/test/email-validation/status
```

### Authentication Required

All test endpoints require:
- **Admin role**
- **Bearer token** in Authorization header

### Example Request

```bash
curl -X POST https://your-app.replit.app/api/test/email-validation/single \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"email": "test@example.com"}'
```

## Environment Variables

### Required for Production

| Variable | Description | Source |
|----------|-------------|--------|
| `DATABASE_URL` | Neon PostgreSQL connection string | Deployment Secrets |
| `REDIS_URL` | Redis connection for BullMQ | Deployment Secrets |
| `PORT` | Application port (default: 5000) | `.replit` file |

### Optional (Email Validation)

| Variable | Description | Default |
|----------|-------------|---------|
| `SKIP_SMTP_VALIDATION` | Skip SMTP probing | `true` |
| `DNS_TIMEOUT_MS` | DNS lookup timeout | `3000` |
| `SMTP_CONNECT_TIMEOUT_MS` | SMTP connection timeout | `10000` |
| `DOMAIN_CACHE_TTL_HOURS` | Domain cache TTL | `24` |

### Conversation Quality (DeepSeek)

| Variable | Description | Default |
|----------|-------------|---------|
| `DEEPSEEK_API_KEY` | Required for real-time conversation quality monitoring | none |
| `CONVERSATION_QUALITY_MODEL` | Override DeepSeek model for conversation quality | `deepseek-chat` |

## Security Best Practices

1. ✅ **Never commit** `DATABASE_URL` to version control
2. ✅ **Use Replit Secrets** for sensitive data
3. ✅ **Rotate secrets** every 90 days
4. ✅ **Use separate databases** for dev/staging/production
5. ✅ **Enable SSL** for database connections (Neon does this by default)

## Troubleshooting

### "DATABASE_URL not found"

**Solution**: Add it to Replit Secrets:
1. Open Secrets tab
2. Add new secret: `DATABASE_URL`
3. Value: Your Neon connection string
4. Restart the app

### "Connection pooling error"

**Solution**: Ensure your Neon connection string includes `?pooler=true`:

```
postgresql://user:pass@ep-xxx-pooler.us-east-2.aws.neon.tech/dbname?sslmode=require
```

### "Token validation failed"

**Solution**: The auth token is stored in `localStorage`. Clear it and log in again:

```javascript
localStorage.removeItem('authToken');
localStorage.removeItem('authUser');
```

## Related Files

- `server/db.ts` - Database connection setup
- `server/db-init.ts` - Database initialization
- `server/routes/email-validation-test.ts` - Test endpoints
- `.replit` - Replit configuration
- `SECURITY.md` - Security documentation
