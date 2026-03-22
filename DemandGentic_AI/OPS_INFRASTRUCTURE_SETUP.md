# Operations Hub Infrastructure Setup Guide

## Overview

The Operations Hub is a unified dashboard for managing all GCP infrastructure, deployments, secrets, logs, costs, and domain mappings. This document provides setup and integration instructions.

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                   Operations Hub Dashboard                  │
│                  (React + TypeScript Frontend)              │
├─────────────────────────────────────────────────────────────┤
│   Secrets  │  Dev Logs  │  Prod Logs  │  Costs  │  Deploy.  │ Domains
├─────────────────────────────────────────────────────────────┤
│                Express REST API Routes                      │
│                  (/api/ops/*)                              │
├─────────────────────────────────────────────────────────────┤
│  GCP Service Managers   │   Socket.IO WebSocket Server     │
│  ┌──────────────────────┴──────────────────────────────┐   │
│  │ • CloudBuild                                         │   │
│  │ • CloudRunDeployment                                 │   │
│  │ • DomainMapper                                       │   │
│  │ • CostTracker (BigQuery)                             │   │
│  └──────────────────────────────────────────────────────┘   │
├─────────────────────────────────────────────────────────────┤
│           Google Cloud Platform Services                    │
│  • Cloud Build               • Secret Manager              │
│  • Cloud Run                 • Cloud DNS                   │
│  • Cloud Logging             • BigQuery (Billing)          │
│  • Vertex AI Gemini          • Cloud Monitoring            │
└─────────────────────────────────────────────────────────────┘
```

## File Structure

```
DemandGentic_AI/
├── server/
│   ├── routes/
│   │   └── ops-management.ts          # API endpoints for all ops
│   ├── services/gcp/
│   │   ├── cloud-build-manager.ts     # Cloud Build integration
│   │   ├── cloud-run-deployment.ts    # Cloud Run deployment mgmt
│   │   ├── domain-mapper.ts           # Custom domain + SSL mgmt
│   │   └── cost-tracker.ts            # Cost analysis + forecasting
│   └── middleware/
│       └── ops-websocket.ts           # Real-time WebSocket updates
│
├── client/src/
│   ├── pages/
│   │   └── ops-hub.tsx               # Main dashboard page
│   └── components/ops/
│       ├── secrets-tab.tsx            # Secret management UI
│       ├── dev-logs-tab.tsx           # Dev log viewer
│       ├── prod-logs-tab.tsx          # Prod log viewer + alerts
│       ├── costs-tab.tsx              # Cost analytics + charts
│       ├── deployments-tab.tsx        # Build/deploy/rollback UI
│       └── domains-tab.tsx            # Domain + DNS + SSL mgmt
│
└── .env.example                       # Example config
```

## Setup Instructions

### Step 1: Install Dependencies

The required Google Cloud packages have been added to `package.json`:

```bash
npm install
```

This will install:
- `@google-cloud/build` - Cloud Build management
- `@google-cloud/run` - Cloud Run deployment
- `@google-cloud/dns` - Domain/DNS management
- `@google-cloud/bigquery` - Cost tracking
- `socket.io` - Real-time WebSocket updates

### Step 2: Configure Environment Variables

Create a `.env` file in the project root:

```bash
# GCP Configuration
GCP_PROJECT_ID=your-gcp-project-id
GCP_REGION=us-central1

# Frontend URL (for WebSocket CORS)
FRONTEND_URL=http://localhost:5173

# BigQuery Billing Configuration
BQ_BILLING_DATASET=billing
BQ_BILLING_TABLE=gcp_billing_export_v1
```

### Step 3: Set Up GCP Service Account

1. Create a service account in GCP Console:
   ```
   IAM & Admin → Service Accounts → Create Service Account
   ```

2. Grant the following roles to the service account:
   - Cloud Build Editor
   - Cloud Run Admin
   - Cloud DNS Admin
   - Secret Manager Accessor
   - BigQuery Data Viewer
   - Logging Viewer

3. Download the service account key JSON file and set it:
   ```bash
   export GOOGLE_APPLICATION_CREDENTIALS=/path/to/service-account-key.json
   ```

### Step 4: Enable BigQuery Billing Export (Optional)

For cost tracking to work with real data:

1. Go to GCP Console → Billing
2. Select your billing account
3. Click "Billing settings"
4. Enable "BigQuery dataset" export
5. Set the dataset name in `.env` (default: `billing`)

### Step 5: Integrate Routes into Express App

The ops routes are already added to `/server/routes.ts` at line ~490:

```typescript
// ==================== OPERATIONS HUB ====================
app.use("/api/ops", opsManagementRouter);
```

The routes are automatically mounted when the server starts.

### Step 6: Add WebSocket Setup (Optional)

To enable real-time updates, add this to `/server/index.ts`:

```typescript
import { setupOpsWebSocket } from './middleware/ops-websocket.js';

// After creating the HTTP server:
const opsWs = setupOpsWebSocket(server);
console.log('✓ Operations Hub WebSocket server initialized');
```

### Step 7: Access the Dashboard

After starting the development server:

```bash
npm run dev:local  # or your preferred dev command
```

Navigate to: **http://localhost:5173/ops-hub**

## API Endpoints

### Cloud Build
- `POST /api/ops/deployments/build` - Trigger a build
- `GET /api/ops/deployments/build/:buildId` - Get build status
- `GET /api/ops/deployments/builds` - List recent builds
- `POST /api/ops/deployments/build/:buildId/cancel` - Cancel build

### Cloud Run Deployments
- `POST /api/ops/deployments/deploy` - Deploy to Cloud Run
- `GET /api/ops/deployments/service/:serviceName` - Get service status
- `GET /api/ops/deployments/service/:serviceName/revisions` - List revisions
- `POST /api/ops/deployments/service/:serviceName/rollback` - Rollback to revision
- `POST /api/ops/deployments/service/:serviceName/traffic` - Update traffic split (blue-green)

### Domain Management
- `POST /api/ops/domains` - Map a domain
- `GET /api/ops/domains` - List all domains
- `GET /api/ops/domains/:domain` - Get domain details
- `GET /api/ops/domains/:domain/health` - Check domain health (DNS, SSL, HTTP)
- `POST /api/ops/domains/:domain/ssl/renew` - Renew SSL certificate
- `DELETE /api/ops/domains/:domain` - Remove domain mapping

### Cost Analytics
- `GET /api/ops/costs/current` - Current month cost
- `GET /api/ops/costs/breakdown` - Cost by service + forecast
- `GET /api/ops/costs/history` - Last 12 months costs
- `GET /api/ops/costs/agents` - LLM provider costs (Copilot, Claude, Gemini)
- `GET /api/ops/costs/projects` - Cost by project (multi-tenant)

## WebSocket Events

Subscribe via Socket.IO on `/ops` namespace:

```javascript
const socket = io('/ops'); // Connects to WebSocket server

// Subscribe to build updates
socket.emit('subscribe:builds', { buildId: 'abc123' });
socket.on('build:started', (data) => console.log('Build started:', data));
socket.on('build:status', (data) => console.log('Build status:', data));
socket.on('build:complete', (data) => console.log('Build completed:', data));

// Subscribe to deployments
socket.emit('subscribe:deployments', { serviceName: 'api-service' });
socket.on('deploy:started', (data) => console.log('Deployment started'));
socket.on('deploy:complete', (data) => console.log('Deployment complete'));

// Subscribe to costs
socket.emit('subscribe:costs');
socket.on('cost_update', (data) => console.log('Cost updated:', data));
```

## Dashboard Tabs

### 1. Secrets
- View all secrets from Secret Manager
- Create/rotate/delete secrets
- View audit log of access and changes
- Status badges: active, rotated, deprecated

### 2. Dev Logs
- Real-time development environment logs
- Filter by severity (DEBUG, INFO, WARN, ERROR, CRITICAL)
- Filter by service/resource
- Search logs by message
- Export to CSV
- Auto-scroll toggle

### 3. Prod Logs
- Same as dev logs with production focus
- Critical error alert banner
- "Page On-Call" button for emergencies
- Different color scheme for production emphasis

### 4. Costs
- Current month cost with trend vs last month
- Service breakdown pie chart (Cloud Run, Vertex AI, Storage, etc.)
- Daily trend line chart with month-end forecast
- AI agent costs breakdown (Genomini, Claude, Copilot)
- Export CSV or PDF report

### 5. Deployments
- Current deployment status for dev/staging/prod environments
- Build triggering with real-time output streaming
- Build history table with status, duration, and logs
- Rollback to any previous revision
- Blue-green deployment traffic control

### 6. Domains
- Map custom domains to Cloud Run services
- View DNS records required for setup (CNAME + TXT)
- Domain health checking (HTTP status, SSL validity, DNS propagation)
- SSL certificate renewal
- Remove domain mappings

## Testing

### Test API Endpoints

```bash
# Test build creation
curl -X POST http://localhost:3000/api/ops/deployments/build \
  -H "Content-Type: application/json" \
  -d '{"branch":"main","projectName":"demandgentic-api"}'

# Test cost tracking
curl http://localhost:3000/api/ops/costs/current

# List domains
curl http://localhost:3000/api/ops/domains
```

### Test WebSocket Connection

```javascript
// In browser console
const socket = io('/ops');
socket.on('connect', () => console.log('Connected to ops WebSocket'));
socket.emit('subscribe:costs');
socket.on('cost_update', (data) => console.log('Cost data:', data));
```

## Troubleshooting

### GCP Authentication Errors
```
Error: 3 INVALID_ARGUMENT: Unable to generate access token
```
Solution: Ensure service account key is set and has required IAM roles:
```bash
export GOOGLE_APPLICATION_CREDENTIALS=/path/to/key.json
gcloud projects get-iam-policy $GCP_PROJECT_ID \
  --flatten="bindings[]" \
  --filter="bindings.members:serviceAccount:*"
```

### BigQuery Errors
```
Error: 404 Not Found: Dataset not found
```
Solution: Enable BigQuery billing export in GCP Console and update `.env`:
```
BQ_BILLING_DATASET=billing_export
BQ_BILLING_TABLE=gcp_billing_export_v1_01234F_ABC123_DEF456
```

### WebSocket Connection Errors
```
cors policy: Response to preflight request doesn't pass access control check
```
Solution: Ensure `FRONTEND_URL` is set correctly in `.env`:
```
FRONTEND_URL=http://localhost:5173  # for dev
FRONTEND_URL=https://yourdomain.com  # for prod
```

### Build Triggering Issues
Ensure Cloud Build source repository is connected:
```bash
gcloud builds list --project $GCP_PROJECT_ID
```

## Next Steps

1. **Install dependencies**: `npm install`
2. **Configure GCP**: Set up service account and IAM roles
3. **Set environment variables**: Create `.env` file
4. **Enable BigQuery export** (optional): For real cost data
5. **Start dev server**: `npm run dev:local`
6. **Access dashboard**: http://localhost:5173/ops-hub
7. **Test endpoints**: Use curl or Postman requests above

## Production Deployment

When deploying to production:

1. Set `FRONTEND_URL` toProduction domain
2. Use production GCP project ID
3. Enable proper authentication/authorization
4. Set up SSL certificates for domains
5. Configure Cloud Logging for production visibility
6. Schedule regular cost analysis exports
7. Set up alerts for critical errors in prod logs

## Support & Documentation

- [Google Cloud Build Docs](https://cloud.google.com/build/docs)
- [Google Cloud Run Docs](https://cloud.google.com/run/docs)
- [Socket.IO Docs](https://socket.io/docs/v4/)
- [BigQuery API Docs](https://cloud.google.com/bigquery/docs/reference/rest)

---

**Created**: Operations Hub Infrastructure
**Status**: Ready for deployment
**Last Updated**: 2025 (Auto-generated)