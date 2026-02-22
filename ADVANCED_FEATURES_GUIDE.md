# DemandGentic AI - Advanced Features Setup Guide

## 🎯 What's New

You now have **four enterprise-grade features** fully integrated and production-ready:

### 1. 🔌 **WebSocket Real-Time Updates** (`setupOpsWebSocket`)
Live streaming infrastructure changes, build status, and deployment events directly in the Operations Hub dashboard.

### 2. 📋 **Multi-Project Context Switching** (`project-manager.ts`)
Seamlessly switch between multiple GCP projects with automatic `.env` updates and team-friendly configuration.

### 3. 🤖 **Multi-Provider AI Agent Orchestration** (`multi-provider-agent.ts`)
Intelligent routing to **Copilot, Claude, or Gemini** based on task type—with automatic cost optimization and fallback providers.

### 4. ☁️ **Cloud Workstations Configuration** (`.devcontainer`)
Browser-based IDE with pre-configured GCP integration, VS Code extensions, and comprehensive setup automation.

---

## 📚 Documentation Guides

Choose the guide that matches your need:

### For Cloud Development (DevOps/SRE)
→ **[CLOUD_WORKSTATIONS_SETUP.md](./CLOUD_WORKSTATIONS_SETUP.md)**
- Deploy workstations on Google Cloud
- Configure containers with pre-installed tools
- Manage development lifecycle (start/stop/pause)

### For Multi-Project Workflows (Full-Stack Devs)
→ **[PROJECT_MANAGER_GUIDE.md](./PROJECT_MANAGER_GUIDE.md)**
- Switch between dev/staging/production environments
- Auto-update environment variables
- Team collaboration and configuration management

### For AI-Powered Development (ML/AI Engineers)
→ **[MULTI_PROVIDER_AGENT_GUIDE.md](./MULTI_PROVIDER_AGENT_GUIDE.md)**
- Route tasks to optimal AI provider
- Monitor costs and performance
- Integrate agents into API routes and workflows

### For Infrastructure (DevInfra/Platform Teams)
→ **[OPS_INFRASTRUCTURE_SETUP.md](./OPS_INFRASTRUCTURE_SETUP.md)** (existing)
- GCP resource management
- Cost tracking and dashboards
- Deployment pipelines

---

## 🚀 Quick Start (5 minutes)

### Prerequisites

```bash
# Check Node.js version
node --version  # Should be v20.x

# Check npm
npm --version   # Should be v10.x

# Install dependencies (if not done)
npm install --legacy-peer-deps
```

### Step 1: Start the Development Server

```bash
# Terminal 1: Start API server + WebSocket
npm run dev:local

# Output:
# ✓ Server running on http://localhost:8080
# ✓ WebSocket server on /ops namespace
# ✓ Frontend dev server on http://localhost:5173
```

### Step 2: Configure Your First Project

```bash
# Terminal 2: Add a GCP project
npm run project -- add my-first-project

# Follow prompts:
# ? Region [us-central1]: (press Enter or type your region)
# ? Organization ID: (enter or skip)
# ? Billing Account: (enter or skip)
# ? Description: My development environment

# Verify it's set
npm run project -- current
```

### Step 3: Access Operations Hub

Open your browser:
```
http://localhost:5173/ops-hub
```

You should see:
- ✅ Real-time build status (WebSocket updates)
- ✅ Costs for your selected project
- ✅ Deployments and domains
- ✅ Live logs

### Step 4: Test AI Agent (Optional)

```bash
# Add this to any TypeScript server file:
import { aiAgentCall } from './services/multi-provider-agent';

async function testAgent() {
  const result = await aiAgentCall({
    prompt: "Write a simple TypeScript function",
    task: "code"
  });
  console.log(result);
}
```

---

## 🏗️ Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│         DemandGentic AI - Advanced Features Stack           │
├─────────────────────────────────────────────────────────────┤
│                                                               │
│  📱 Frontend (React + Vite)                                  │
│  ├─ Operations Hub Dashboard (@/pages/ops-hub)              │
│  ├─ Real-time WebSocket updates                             │
│  └─ Live cost/deployment monitoring                         │
│                                                               │
│  ⚡ Server (Express + Node.js)                               │
│  ├─ setupOpsWebSocket() - WebSocket handler                 │
│  ├─ Project Manager CLI - Context switching                 │
│  ├─ Multi-Provider Agent - AI routing                       │
│  └─ API Routes (/api/operations/*)                          │
│                                                               │
│  🧠 AI Services                                              │
│  ├─ Copilot (GitHub) - Code generation                      │
│  ├─ Claude (Anthropic) - Reasoning & analysis               │
│  └─ Gemini (Google) - Multimodal & cost-optimized           │
│                                                               │
│  ☁️ GCP Integration                                          │
│  ├─ Cloud Build - Build pipelines                           │
│  ├─ Cloud Run - Deployments                                 │
│  ├─ Cloud DNS - Domain management                           │
│  └─ BigQuery - Cost analysis                                │
│                                                               │
│  🐳 Container                                                │
│  ├─ Dev Container Configuration                             │
│  ├─ Cloud Workstations Support                              │
│  └─ Post-create Initialization                              │
│                                                               │
└─────────────────────────────────────────────────────────────┘
```

---

## 📂 File Locations

### WebSocket Real-Time Updates
- **Integration point**: `server/index.ts` (lines 310-318)
- **Handler**: `server/middleware/ops-websocket.ts`
- **Events**: Build, Deployment, Cost, Domain updates
- **Namespace**: `/ops`

### Multi-Project Manager
- **CLI**: `scripts/project-manager.ts` (285 lines)
- **Config storage**: `.gcp-projects/projects.json`
- **npm script**: `npm run project -- [command]`
- **Env updates**: Automatic `.env` modification

### Multi-Provider Agent
- **Service**: `server/services/multi-provider-agent.ts` (380 lines)
- **Providers**: Copilot, Claude, Gemini
- **Export functions**: `getOrchestrator()`, `aiAgentCall(request)`
- **Metrics**: Cost tracking, latency monitoring, success rates

### Cloud Workstations
- **Config**: `.devcontainer/devcontainer.json` (88 lines)
- **Setup script**: `.devcontainer/post-create.sh` (74 lines)
- **Features**: GCP SDK, VS Code extensions, port forwarding
- **Services**: PostgreSQL, Redis, Node.js, Express

---

## 🔧 Configuration

### Environment Variables (.env)

```bash
# Required for all features
GCP_PROJECT_ID=your-gcp-project           # Auto-set by project-manager
GCP_REGION=us-central1                    # Auto-set by project-manager

# AI Agent Configuration
ANTHROPIC_API_KEY=sk-ant-...              # Claude (Anthropic)
GOOGLE_API_KEY=AIzaSy...                  # Gemini (if not using service account)
GOOGLE_APPLICATION_CREDENTIALS=...        # For Vertex AI service account

# Optional AI Optimization
OPTIMIZE_COSTS=false                      # true = max cost savings, false = max quality

# Other Services
DATABASE_URL=postgresql://...
REDIS_URL=redis://localhost:6379
PUBLIC_WEBSOCKET_URL=ws://localhost:8080  # For frontend WebSocket connection
```

### Project Configuration (.gcp-projects/projects.json)

```json
{
  "projects": {
    "dev-env": {
      "projectId": "my-dev-123",
      "region": "us-central1",
      "organizationId": "org-456",
      "billingAccount": "dev-billing",
      "description": "Development environment"
    },
    "prod-env": {
      "projectId": "my-prod-789",
      "region": "us-east1",
      "organizationId": "org-456",
      "billingAccount": "prod-billing",
      "description": "Production environment"
    }
  },
  "currentProject": "dev-env"
}
```

---

## 💬 Usage Examples

### Example 1: Real-Time Infrastructure Monitoring

```typescript
// Automatically via Operations Hub WebSocket
// Each event broadcasts to connected clients in real-time:

// Build event
{
  type: 'build-started',
  buildId: 'abc-123',
  status: 'in-progress',
  timestamp: '2024-01-20T14:30:00Z'
}

// Deployment event  
{
  type: 'deployment-completed',
  service: 'backend-api',
  version: 'v2.1.0',
  timestamp: '2024-01-20T14:35:00Z'
}

// Cost event
{
  type: 'cost-update',
  monthlyEstimate: 1234.56,
  breakdown: { compute: 800, storage: 234, ... }
}
```

### Example 2: Project Context Switching

```bash
# Development workflow
npm run project -- switch dev-env
npm run dev:local
# Work on feature...

# Ready for production?
npm run project -- switch prod-env
npm run build
npm run deploy:production

# Verify
npm run project -- current
```

### Example 3: AI-Powered Code Generation

```typescript
import { aiAgentCall } from './services/multi-provider-agent';

// Generate deployment script
const script = await aiAgentCall({
  prompt: 'Generate a Cloud Run deployment script for TypeScript backend',
  task: 'code',
  maxTokens: 3000
});

// Analyze metrics
const analysis = await aiAgentCall({
  prompt: 'Analyze this data for anomalies',
  context: { data: metrics },
  task: 'analysis'
});

// Extended reasoning
const diagnosis = await aiAgentCall({
  prompt: 'Why is memory usage spiking?',
  context: { logs: [...] },
  task: 'reasoning'
});
```

### Example 4: Cloud Workstations Dev Environment

```bash
# Create workstation config in GCP
gcloud workstations configs create demandgentic \
  --machine-type=e2-standard-4 \
  --boot-disk-size=100

# Create instance
gcloud workstations create my-dev \
  --config=demandgentic

# Open in browser - VS Code automatically loads
# .devcontainer/devcontainer.json configures:
# ✓ Node.js 20
# ✓ GitHub Copilot + Copilot Chat
# ✓ Google Cloud Tools
# ✓ All npm dependencies
# ✓ Port forwarding (5173, 8080, 5432, 6379, etc.)

npm run dev:local  # Already configured!
```

---

## 📊 Monitoring & Dashboards

### Operations Hub Dashboard

Navigate to: **http://localhost:5173/ops-hub**

Tabs available:
- **Builds** → Real-time build status (WebSocket updates)
- **Deployments** → Cloud Run services and versions
- **Costs** → Monthly spending breakdown
- **Domains** → DNS records and domain management
- **Secrets** → Sensitive configuration (REDACTED)
- **Logs** → Real-time infrastructure logs

### Agent Metrics

```typescript
const orchestrator = getOrchestrator();
const status = orchestrator.getStatus();

console.log({
  totalRequests: 245,
  totalCost: 12.45,
  providers: {
    copilot: { cost: 0, requests: 120 },
    claude: { cost: 8.92, requests: 89 },
    gemini: { cost: 3.53, requests: 36 }
  }
});
```

---

## ⚙️ Common Tasks

### Task: Add Team Members to Project

```bash
# Add project configuration to git
git add .gcp-projects/projects.json
git commit -m "Add dev/staging/prod project configs"
git push

# Team members pull and use immediately
git pull
npm run project -- list
npm run project -- switch prod-env
npm run dev:local
```

### Task: Deploy to Different Regions

```bash
npm run project -- add us-east-prod
npm run project -- switch us-east-prod
npm run deploy

npm run project -- add eu-west-prod
npm run project -- switch eu-west-prod
npm run deploy

npm run project -- add apac-prod
npm run project -- switch apac-prod
npm run deploy
```

### Task: Cost Optimization

```bash
# Enable cost-first AI routing
OPTIMIZE_COSTS=true npm run dev:local

# Or update .env
echo "OPTIMIZE_COSTS=true" >> .env

# Monitor spending
npm run cost:analysis  # (if available)
```

### Task: Secure API Key Management

```bash
# Store in Google Secret Manager (best practice)
gcloud secrets create anthropic-key \
  --data-file=- \
  --project=$GCP_PROJECT_ID

# Update post-create.sh to fetch at startup
# Rather than storing in .env
```

---

## 🐛 Troubleshooting

### "WebSocket connection failed"

```bash
# Check if server is running
curl http://localhost:8080/health

# Check WebSocket is initialized
npm run dev:local | grep "WebSocket"

# Verify frontend WebSocket URL
cat .env | grep PUBLIC_WEBSOCKET_URL
```

### "Project not found" error

```bash
# List available projects
npm run project -- list

# Check .gcp-projects/projects.json exists
ls -la .gcp-projects/

# Re-add missing project
npm run project -- add my-project
```

### "API key not found"

```bash
# Verify environment variables
echo $ANTHROPIC_API_KEY
echo $GOOGLE_API_KEY

# Check .env file (should not be committed)
cat .env

# For Vertex AI via GCP service account
gcloud auth application-default login
export GOOGLE_APPLICATION_CREDENTIALS=$(gcloud auth application-default print-access-token)
```

### "Cannot connect to Cloud Workstations"

```bash
# Verify workstation is running
gcloud workstations list

# Start if stopped
gcloud workstations start WORKSTATION_ID

# Check SSH connectivity
gcloud workstations ssh WORKSTATION_ID -- pwd
```

---

## 🔐 Security Best Practices

### 1. Never Commit Secrets

```bash
# Add to .gitignore
echo ".env.local" >> .gitignore
echo ".gcp-service-account.json" >> .gitignore
```

### 2. Use Google Secret Manager

```bash
# Store sensitive data
gcloud secrets create my-api-key \
  --replication-policy="automatic" \
  --data-file=secret.txt

# Retrieve in code
gcloud secrets versions access latest --secret="my-api-key"
```

### 3. Service Account Limitations

```bash
# Create restricted service account for development
gcloud iam service-accounts create demandgentic-dev \
  --display-name="DemandGentic Dev SA"

# Grant minimal required permissions
gcloud projects add-iam-policy-binding $PROJECT_ID \
  --member="serviceAccount:demandgentic-dev@...iam.gserviceaccount.com" \
  --role="roles/run.developer"
```

### 4. API Key Rotation

```bash
# Rotate API keys regularly
gcloud secrets versions add my-api-key --data-file=new-key.txt

# Update application to fetch latest
# (automatic if using Secret Manager)
```

---

## 📈 Performance Optimization

### WebSocket Performance

- Real-time updates are debounced (max 1/second per event type)
- Binary compression enabled for large payloads
- Automatic reconnection with exponential backoff

### Agent Performance

- Provider selection cached for 60 seconds
- Request history limited to last 100 for memory efficiency
- Cost estimates calculated client-side to avoid database lookup

### Cloud Workstations Performance

- Use `e2-standard-4` or higher for development
- Enable disk caching for faster rebuilds
- Use in same region as Cloud Run deployments (latency)

---

## 🎓 Learning Path

**Beginner** (Get started in <1 hour)
1. Read this guide
2. Run `npm run dev:local`
3. Open Operations Hub at http://localhost:5173/ops-hub
4. Create first project with `npm run project -- add`

**Intermediate** (Expand knowledge in 2-4 hours)
1. Read [PROJECT_MANAGER_GUIDE.md](./PROJECT_MANAGER_GUIDE.md)
2. Set up 3 projects (dev/staging/prod)
3. Read [MULTI_PROVIDER_AGENT_GUIDE.md](./MULTI_PROVIDER_AGENT_GUIDE.md)
4. Integrate agent into one API route

**Advanced** (Master all features in 4-8 hours)
1. Read [CLOUD_WORKSTATIONS_SETUP.md](./CLOUD_WORKSTATIONS_SETUP.md)
2. Deploy to Google Cloud Workstations
3. Read [OPS_INFRASTRUCTURE_SETUP.md](./OPS_INFRASTRUCTURE_SETUP.md)
4. Build custom agents/scripts

---

## 📞 Support & Resources

### Documentation
- **WebSocket**: See `server/middleware/ops-websocket.ts`
- **Project Manager**: See `scripts/project-manager.ts`
- **Agent System**: See `server/services/multi-provider-agent.ts`
- **Container**: See `.devcontainer/devcontainer.json`

### Official Links
- [Google Cloud Workstations](https://cloud.google.com/workstations)
- [Dev Containers Specification](https://containers.dev)
- [Cloud Run Documentation](https://cloud.google.com/run/docs)
- [Anthropic Claude API](https://docs.anthropic.com)
- [Google Vertex AI](https://cloud.google.com/docs/vertexai)

### npm Scripts Reference

```bash
npm run dev:local                          # Dev server (http://localhost:8080)
npm run dev:ngrok                          # Dev with ngrok tunnel
npm run build                              # Production build
npm run check                              # Type checking
npm run project -- list                    # List all projects
npm run project -- switch <id>             # Switch project
npm run project -- add <id>                # Add project (interactive)
npm run project -- show <id>               # Show project details
npm run project -- remove <id>             # Delete project
npm run db:push                            # Push schema to database
npm run deploy:production                  # Deploy to prod
```

---

**Next Steps:**
- ✅ Run `npm run dev:local` and open http://localhost:5173/ops-hub
- ✅ Create your first project with `npm run project -- add my-project`
- ✅ Read one of the implementation guides above
- ✅ Integrate AI agents into your workflow

**Questions?** Check the specific guide for your use case!
