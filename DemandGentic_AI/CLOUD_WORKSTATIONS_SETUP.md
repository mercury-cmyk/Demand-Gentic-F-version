# Cloud Workstations Setup Guide

## Overview

DemandGentic AI is fully configured for **Google Cloud Workstations**, a managed development environment accessible from any browser, with full IDE capabilities and Docker support.

## What is Cloud Workstations?

Cloud Workstations provides:
- 🖥️ Full IDE in the browser (VS Code)
- ☁️ Machine resources managed by Google Cloud
- 🔐 Secure authentication via Google identity
- 📦 Pre-configured containers with all tools
- 🚀 Instant startup (minutes to production-ready dev environment)
- 💰 Flexible, pay-as-you-go pricing (stop/pause unused workstations)

## Quick Start

### Step 1: Create a Cloud Workstations Configuration

```bash
# From your GCP Console or gcloud CLI:
export PROJECT_ID=your-gcp-project
export WORKSTATION_CLUSTER=default
export WORKSTATION_CONFIG=demandgentic-ai

gcloud workstations configs create $WORKSTATION_CONFIG \
  --project=$PROJECT_ID \
  --cluster=$WORKSTATION_CLUSTER \
  --machine-type=e2-standard-4 \
  --boot-disk-size=100 \
  --container-image=us-central1-docker.pkg.dev/cloud-workstations-images/cloud-workstations-vm/cloud-workstations-base:latest
```

### Step 2: Create a Workstation Instance

```bash
export WORKSTATION_ID=demandgentic-dev

gcloud workstations create $WORKSTATION_ID \
  --project=$PROJECT_ID \
  --config=$WORKSTATION_CONFIG \
  --cluster=$WORKSTATION_CLUSTER
```

### Step 3: SSH or Open in Browser

```bash
# Option A: Open in browser (recommended)
gcloud workstations start $WORKSTATION_ID \
  --project=$PROJECT_ID \
  --cluster=$WORKSTATION_CLUSTER

# Then open the generated link in your browser

# Option B: SSH into workstation
gcloud workstations ssh $WORKSTATION_ID \
  --project=$PROJECT_ID \
  --cluster=$WORKSTATION_CLUSTER
```

### Step 4: Clone Repository and Setup

Once connected to the workstation:

```bash
# Clone the repo
git clone https://github.com/yourusername/demandgentic-ai.git
cd demandgentic-ai

# The .devcontainer configuration will automatically:
# 1. Create a dev container with all dependencies
# 2. Install Node.js dependencies
# 3. Set up environment variables
# 4. Prepare the database schema
npm run dev:local
```

## Dev Container Configuration

The `.devcontainer/devcontainer.json` file defines:

### Features Installed
- ✅ Node.js 20 (latest LTS)
- ✅ GitHub CLI
- ✅ Docker-in-Docker
- ✅ Google Cloud SDK (gcloud)

### VS Code Extensions
- 💡 GitHub Copilot + Copilot Chat
- 🎨 Prettier Code Formatter
- 🌬️ ESLint
- 🎨 Tailwind CSS
- 🐳 Docker Registry
- ☸️ Kubernetes Tools
- 🏗️ Google Cloud Tools
- 📚 GitLens (Git history)

### Ports Forwarded
- `5173` → Vite Frontend Dev Server
- `8080` → Node.js API Server
- `3000` → Express Server (backup)
- `5432` → PostgreSQL
- `6379` → Redis Cache
- `5050` → PgAdmin (database UI)

## Environment Configuration

### Required Environment Variables

Create a `.env` file in the root directory:

```bash
# GCP Configuration
GCP_PROJECT_ID=your-gcp-project-id
GCP_REGION=us-central1

# Database
DATABASE_URL=postgresql://user:password@localhost:5432/demandgentic

# APIs
ANTHROPIC_API_KEY=sk-ant-...           # Claude (Anthropic)
GOOGLE_API_KEY=AIz...                  # Gemini (Google)
TELNYX_API_KEY=KEY...                  # Voice/SMS provider

# Frontend
FRONTEND_URL=http://localhost:5173
PUBLIC_WEBSOCKET_URL=ws://localhost:8080

# Redis (optional, for background jobs)
REDIS_URL=redis://localhost:6379
```

### Using Google Secret Manager (Recommended)

Instead of committing secrets to .env:

```bash
# Store secrets in Google Secret Manager
gcloud secrets create demandgentic-api-key \
  --data-file=- \
  --replication-policy="automatic" \
  --project=$GCP_PROJECT_ID

# Retrieve in .devcontainer/post-create.sh:
gcloud secrets versions access latest --secret="demandgentic-api-key"
```

## Development Workflow

### Start Development Server

```bash
# Development with local hot reload
npm run dev:local

# Or with ngrok tunnel for external access
npm run dev:ngrok
```

### Access the Application

- **Frontend**: http://localhost:5173
- **Backend API**: http://localhost:8080
- **Operations Hub**: http://localhost:5173/ops-hub

### Available npm Scripts

```bash
npm run dev:local              # Dev server (local only)
npm run dev                    # Dev with ngrok tunnel
npm run build                  # Production build
npm run check                  # TypeScript type-checking
npm run db:push                # Push schema changes to DB
npm run project -- list        # List GCP projects
npm run project -- switch ID   # Switch GCP project
```

## Troubleshooting

### Problem: "Cannot find module" errors

**Solution**: The devcontainer might not have finished building. Try:
```bash
# Rebuild the container
Ctrl+Shift+P → Dev Containers: Rebuild Container
```

### Problem: Database connection refused

**Solution**: Wait for services to start. Check status:
```bash
docker ps
docker logs 
```

### Problem: GCP authentication required

**Solution**: Authenticate with Google Cloud:
```bash
gcloud auth login
gcloud auth application-default login  # For local APIs
gcloud config set project $GCP_PROJECT_ID
```

### Problem: Port already in use

**Solution**: Check what's using the port:
```bash
lsof -i :8080  # Check port 8080
kill -9   # Kill the process
```

## Workstation Lifecycle

### Stopping a Workstation (Lower Costs)

```bash
gcloud workstations stop $WORKSTATION_ID \
  --project=$PROJECT_ID \
  --cluster=$WORKSTATION_CLUSTER
```

### Restarting

```bash
gcloud workstations start $WORKSTATION_ID \
  --project=$PROJECT_ID \
  --cluster=$WORKSTATION_CLUSTER
```

### Deleting a Workstation

```bash
gcloud workstations delete $WORKSTATION_ID \
  --project=$PROJECT_ID \
  --cluster=$WORKSTATION_CLUSTER
```

## Best Practices

### 1. Use `.env.local` for Sensitive Files

Never commit sensitive credentials. Use:
```bash
.env              # Version controlled (example values)
.env.local        # Not version controlled (your secrets)
```

### 2. Store Secrets in Google Secret Manager

```bash
# Create secret
echo -n "my-api-key" | gcloud secrets create my-api-key --data-file=-

# Retrieve in code
gcloud secrets versions access latest --secret="my-api-key"
```

### 3. Regular Database Backups

```bash
# Export database
pg_dump $DATABASE_URL > backup.sql

# Or use Google Cloud SQL backups (if using managed PostgreSQL)
```

### 4. Monitor Costs

```bash
# Check Cloud Workstations costs
gcloud workstations list --project=$GCP_PROJECT_ID --format=json

# Check overall GCP costs in Operations Hub dashboard
```

## Advanced Configuration

### Custom Docker Image

To use a custom Dockerfile instead of the default image:

```jsonc
// .devcontainer/devcontainer.json
{
  "dockerfile": "Dockerfile",
  // Instead of "image": "..."
}
```

### Docker Compose Services

Add additional services (PostgreSQL, Redis, etc.):

```yaml
# .devcontainer/docker-compose.yml
version: '3'
services:
  app:
    buildContext: ..
    dockerfile: Dockerfile
  
  postgres:
    image: postgres:15
    environment:
      POSTGRES_PASSWORD: postgres
    ports:
      - "5432:5432"
  
  redis:
    image: redis:7
    ports:
      - "6379:6379"
```

### Pre-commit Hooks

Ensure code quality before commits:

```bash
# Install pre-commit hook
npm run setup:hooks

# Or manually:
cat > .git/hooks/pre-commit << 'EOF'
#!/bin/bash
npm run check:lint
npm run check:types
EOF
chmod +x .git/hooks/pre-commit
```

## Collaboration

### Share Development Environment

```bash
# Cloud Workstations supports team collaboration
gcloud workstations configs describe $WORKSTATION_CONFIG \
  --project=$PROJECT_ID \
  --cluster=$WORKSTATION_CLUSTER

# Team members can SSH in with:
gcloud workstations ssh $WORKSTATION_ID --project=$PROJECT_ID
```

### Version Control

All configuration is version controlled:
- `.devcontainer/devcontainer.json` → Container config
- `.devcontainer/docker-compose.yml` → Services
- `.devcontainer/post-create.sh` → Setup script
- `.env.example` → Empty template for secrets

Team members get consistent development environments automatically.

## Resources

- **Google Cloud Workstations Docs**: https://cloud.google.com/workstations/docs
- **Dev Containers Specification**: https://containers.dev
- **VS Code Remote Development**: https://code.visualstudio.com/docs/remote/remote-overview
- **DemandGentic Operations Hub**: `/ops-hub` (when running)

---

**Need Help?** 
- Check the main README.md for project overview
- See OPS_INFRASTRUCTURE_SETUP.md for cloud infrastructure details
- Review Operations Hub dashboard for GCP resources