# DemandGentic AI - Complete Architecture & Integration Map

## 🎯 System Overview

DemandGentic AI now consists of **four primary systems** that work together to provide a complete cloud-native development platform:

```
┌─────────────────────────────────────────────────────────────────┐
│                    FRONTEND (React + Vite)                       │
│                    Port 5173 (Vite Dev Server)                  │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │  Operations Hub Dashboard (@/pages/ops-hub)           │   │
│  │  ├─ Builds Tab (Real-time WebSocket updates)          │   │
│  │  ├─ Deployments Tab (Cloud Run instances)             │   │
│  │  ├─ Costs Tab (BigQuery analytics)                    │   │
│  │  ├─ Domains Tab (Cloud DNS management)                │   │
│  │  ├─ Secrets Tab (Secret Manager browser)              │   │
│  │  └─ Logs Tab (Cloud Logging viewer)                   │   │
│  └─────────────────────────────────────────────────────────┘   │
│           ↓ WebSocket Connection ↓                              │
│         ws://localhost:8080/socket.io                           │
└─────────────────────────────────────────────────────────────────┘
                            ↑
                    Real-time Updates
                            ↓
┌─────────────────────────────────────────────────────────────────┐
│                    BACKEND SERVER (Express)                      │
│                  Port 8080 (Node.js API Server)                 │
│                                                                   │
│  ┌────────────────────────────────────────────────────────┐    │
│  │  1️⃣  WebSocket Real-Time System                       │    │
│  │  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━    │    │
│  │  File: server/middleware/ops-websocket.ts             │    │
│  │  Function: setupOpsWebSocket(server)                  │    │
│  │  Namespace: /ops                                      │    │
│  │                                                        │    │
│  │  Emits Events:                                         │    │
│  │  • emitBuildEvent() → build status updates            │    │
│  │  • emitDeploymentEvent() → Cloud Run changes          │    │
│  │  • emitCostEvent() → Cost updates from BigQuery       │    │
│  │  • emitDomainEvent() → DNS and domain changes         │    │
│  │  • emitLogEvent() → Real-time logs                    │    │
│  │                                                        │    │
│  │  Integration Points:                                  │    │
│  │  • Called in server/index.ts (lines 310-318)          │    │
│  │  • Subscribes to GCP Cloud Build events              │    │
│  │  • Subscribes to GCP Cloud Run events                │    │
│  │  • Polling: BigQuery for costs (30s interval)        │    │
│  │  • Polling: Cloud Logging (real-time via API)        │    │
│  └────────────────────────────────────────────────────────┘    │
│                                                                   │
│  ┌────────────────────────────────────────────────────────┐    │
│  │  2️⃣  Project Manager CLI System                       │    │
│  │  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━    │    │
│  │  File: scripts/project-manager.ts (285 lines)         │    │
│  │  Command: npm run project -- [command] [args]         │    │
│  │                                                        │    │
│  │  Commands:                                             │    │
│  │  • list         → Show all projects                   │    │
│  │  • current      → Display active project              │    │
│  │  • add <id>     → Create project (interactive)        │    │
│  │  • switch <id>  → Change active project               │    │
│  │  • show <id>    → Display project details             │    │
│  │  • remove <id>  → Delete project config               │    │
│  │                                                        │    │
│  │  Data Storage:                                         │    │
│  │  Config File: .gcp-projects/projects.json             │    │
│  │  Structure: {projectId, region, org, billing, desc}   │    │
│  │                                                        │    │
│  │  Auto-Updates:                                         │    │
│  │  • .env (GCP_PROJECT_ID, GCP_REGION)                  │    │
│  │  • Restarts services if needed                        │    │
│  │                                                        │    │
│  │  Team Integration:                                     │    │
│  │  • Config committed to git                            │    │
│  │  • All team members see same projects                 │    │
│  │  • Automatic .env setup on clone                      │    │
│  └────────────────────────────────────────────────────────┘    │
│                                                                   │
│  ┌────────────────────────────────────────────────────────┐    │
│  │  3️⃣  Multi-Provider AI Agent System                   │    │
│  │  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━    │    │
│  │  File: server/services/multi-provider-agent.ts        │    │
│  │  Class: MultiProviderOrchestrator (380 lines)         │    │
│  │                                                        │    │
│  │  Providers:                                            │    │
│  │  ┌──────────────┬──────────────┬──────────────┐      │    │
│  │  │   Copilot    │    Claude    │    Gemini    │      │    │
│  │  │  (GitHub)    │ (Anthropic)  │   (Google)   │      │    │
│  │  │              │              │              │      │    │
│  │  │ ⚡ Fast (ms) │ 🧠 Reasoning │ 💰 Cheap     │      │    │
│  │  │ 💲 Free tier │ 📚 Extended  │ ⛑️ Fallback │      │    │
│  │  │ 💻 Code ~    │ Thinking     │ 🖼️ Vision   │      │    │
│  │  └──────────────┴──────────────┴──────────────┘      │    │
│  │                                                        │    │
│  │  Intelligent Routing:                                 │    │
│  │  • "code" → Copilot [→ Claude fallback]               │    │
│  │  • "reasoning" → Claude [→ Gemini fallback]           │    │
│  │  • "multimodal" → Gemini [→ Claude fallback]          │    │
│  │  • "analysis" → Claude or Gemini (cost-aware)         │    │
│  │  • "general" → Cost/quality optimized                 │    │
│  │                                                        │    │
│  │  Key Methods:                                          │    │
│  │  • execute(request) → Route and execute               │    │
│  │  • selectProvider(request) → Intelligent selection    │    │
│  │  • getStatus() → Metrics and analytics                │    │
│  │  • listProviders() → Health and performance           │    │
│  │                                                        │    │
│  │  Exports:                                              │    │
│  │  • getOrchestrator() → Singleton instance             │    │
│  │  • aiAgentCall(request) → Simple helper function      │    │
│  │  • default export → orchestrator instance             │    │
│  │                                                        │    │
│  │  Metrics Tracking:                                     │    │
│  │  • Success rate per provider                          │    │
│  │  • Average latency                                    │    │
│  │  • Estimated cost per request                         │    │
│  │  • Request history (last 100)                         │    │
│  │  • Cost breakdown by task type                        │    │
│  └────────────────────────────────────────────────────────┘    │
│                                                                   │
│  ┌────────────────────────────────────────────────────────┐    │
│  │  API Routes (/api/operations/*)                        │    │
│  │  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━    │    │
│  │  GET  /api/operations/builds                           │    │
│  │  GET  /api/operations/deployments                      │    │
│  │  GET  /api/operations/costs                            │    │
│  │  GET  /api/operations/domains                          │    │
│  │  GET  /api/operations/secrets                          │    │
│  │  GET  /api/operations/logs                             │    │
│  │  POST /api/operations/builds (trigger)                 │    │
│  │  POST /api/operations/deployments (create)             │    │
│  │                                                        │    │
│  │  All return JSON + real-time WebSocket updates        │    │
│  └────────────────────────────────────────────────────────┘    │
│                                                                   │
└─────────────────────────────────────────────────────────────────┘
                            ↓↑
            Cloud Platform API Calls
                            ↓↑
┌─────────────────────────────────────────────────────────────────┐
│          GOOGLE CLOUD PLATFORM INTEGRATION LAYER                 │
│                                                                   │
│  ┌────────────────────────────────────────────────────────┐    │
│  │ Cloud Build → Builds WebSocket events                  │    │
│  │ Cloud Run → Deployments WebSocket events               │    │
│  │ BigQuery → Cost analysis (30s polling)                 │    │
│  │ Cloud DNS → Domain management                         │    │
│  │ Secret Manager → Secure credential storage            │    │
│  │ Cloud Logging → Real-time logs                         │    │
│  │ Vertex AI → Gemini API (via Google API)                │    │
│  │ Cloud Workstations → Browser-based IDE                │    │
│  └────────────────────────────────────────────────────────┘    │
│                                                                   │
└─────────────────────────────────────────────────────────────────┘
                            ↓↑
          External LLM Provider API Calls
                            ↓↑
┌─────────────────────────────────────────────────────────────────┐
│              EXTERNAL AI PROVIDER INTEGRATIONS                   │
│                                                                   │
│  Anthropic Claude          GitHub Copilot        Google Gemini   │
│  ├─ /messages API          ├─ Copilot API        ├─ Vertex AI    │
│  ├─ Extended thinking       ├─ Code completion    ├─ Vision       │
│  ├─ Vision capability       ├─ Fast inference     ├─ Cost leader  │
│  └─ $0.003-$0.03/1K tokens  └─ Free tier          └─ $0.000075/1K │
│                                                                   │
└─────────────────────────────────────────────────────────────────┘
                            ↑↓
┌─────────────────────────────────────────────────────────────────┐
│            CLOUD WORKSTATIONS CONTAINER ENVIRONMENT             │
│                                                                   │
│  File: .devcontainer/devcontainer.json (88 lines)               │
│  File: .devcontainer/post-create.sh (74 lines)                  │
│                                                                   │
│  Container Features:                                             │
│  ✓ Node.js 20 LTS                                               │
│  ✓ GitHub CLI                                                   │
│  ✓ Docker-in-Docker                                             │
│  ✓ Google Cloud SDK (gcloud)                                    │
│  ✓ PostgreSQL client                                            │
│  ✓ TypeScript (pre-configured)                                  │
│                                                                   │
│  VS Code Extensions Pre-Installed:                               │
│  ✓ GitHub Copilot + Copilot Chat                                │
│  ✓ Prettier Code Formatter                                      │
│  ✓ ESLint                                                       │
│  ✓ Tailwind CSS                                                 │
│  ✓ Docker Registry                                              │
│  ✓ Kubernetes Tools                                             │
│  ✓ Google Cloud Tools (Cloud Code, gcloud-run-tools)            │
│  ✓ GitLens (Git history)                                        │
│                                                                   │
│  Port Forwarding:                                                │
│  ✓ 5173  → Vite Frontend Dev Server                             │
│  ✓ 8080  → Node.js API Server                                   │
│  ✓ 3000  → Express Server (backup)                              │
│  ✓ 5432  → PostgreSQL                                           │
│  ✓ 6379  → Redis Cache                                          │
│  ✓ 5050  → PgAdmin (DB UI)                                      │
│                                                                   │
│  Credential Mounts:                                              │
│  ✓ ~/.ssh → Git SSH keys                                        │
│  ✓ ~/.config/gcloud → GCP authentication                        │
│                                                                   │
│  Auto-initialization:                                            │
│  1. npm install --legacy-peer-deps                              │
│  2. .env.example → .env setup                                   │
│  3. Node.js version verification (20.x)                         │
│  4. TypeScript setup check                                      │
│  5. PostgreSQL client verification                              │
│  6. GCP gcloud CLI check                                        │
│                                                                   │
└─────────────────────────────────────────────────────────────────┘
```

---

## 🔀 Data Flow & Integration Points

### Flow 1: Real-Time Infrastructure Updates

```
┌─ GCP (Cloud Build, Cloud Run)
│   └─ Emits events (build completed, deployment started, etc.)
│
├─ Operations Hub WebSocket Server
│   └─ Listens for GCP events via pub/sub or polling
│   └─ Broadcasts via Socket.IO to connected clients
│
├─ Frontend (WebSocket Client)
│   └─ Connects to /ops namespace
│   └─ Receives real-time updates
│   └─ Re-renders Operations Hub dashboard
│
└─ End User
    └─ Sees live status in browser (no refresh needed)
```

**Code Path:**
```
server/index.ts (line 310-318)
  → server/middleware/ops-websocket.ts
    → setupOpsWebSocket(server)
      → io.on('connection')
        → socket.on('subscribe', (resource) => ...)
          → emitBuildEvent(), emitDeploymentEvent(), etc.
            → broadcast to all connected clients
              → frontend receives real-time updates
```

### Flow 2: Project Context Switching

```
┌─ Developer runs: npm run project -- switch prod-env
│
├─ Project Manager reads projects.json
│   └─ Finds prod-env configuration
│   └─ Extracts GCP_PROJECT_ID and GCP_REGION
│
├─ Updates .env file
│   └─ GCP_PROJECT_ID=acme-prod-123
│   └─ GCP_REGION=us-east1
│
├─ Restarts services (optional)
│   └─ API server uses new GCP project context
│   └─ Operations Hub shows prod-env resources
│
└─ Developer continues workflow
    └─ All API calls now target prod-env
    └─ WebSocket updates reflect prod-env resources
```

**Code Path:**
```
scripts/project-manager.ts
  → loadProjects() from .gcp-projects/projects.json
  → switch command
    → getProject(id)
    → updateEnvFile(project)
      → writes GCP_PROJECT_ID and GCP_REGION to .env
        → process environment updated
          → all GCP API calls use new context
            → Operations Hub reflects new project
```

### Flow 3: AI Agent Task Routing

```
┌─ Developer calls: aiAgentCall({ prompt, task, context })
│
├─ Multi-Provider Orchestrator receives request
│   └─ Analyzes task type ("code", "analysis", etc.)
│   └─ Checks provider availability
│   └─ Consults metrics history
│   └─ Consults OPTIMIZE_COSTS setting
│
├─ Selects best provider
│   ├─ "code" → Copilot (fast, free)
│   ├─ "analysis" → Claude/Gemini (quality/cost tradeoff)
│   ├─ "reasoning" → Claude (best thinking)
│   └─ etc.
│
├─ Executes on selected provider
│   └─ Calls Copilot/Claude/Gemini API
│   └─ Records metrics (latency, cost, tokens)
│   └─ Stores in request history
│
├─ Returns response to caller
│   ├─ Content from selected provider
│   ├─ Metadata (cost, latency, provider name)
│   └─ Success status
│
└─ Developer uses response
    └─ Integrates into their workflow
```

**Code Path:**
```
aiAgentCall(request)
  → getOrchestrator()
    → orchestrator.execute(request)
      → selectProvider(request.task)
        → evaluate cost/quality/performance tradeoffs
          → callCopilot() OR callClaude() OR callGemini()
            → make API call to chosen provider
              → recordMetrics()
                → return AgentResponse {provider, content, cost, latency}
```

### Flow 4: Cloud Workstations Setup

```
┌─ Developer creates workstation in GCP
│   └─ Uses devcontainer.json configuration
│   └─ Uses docker-compose.yml for services
│
├─ Container starts
│   └─ Applies GCP features (gcloud SDK)
│   └─ Installs VS Code extensions
│   └─ Configures port forwarding
│
├─ Post-create hook runs
│   └─ .devcontainer/post-create.sh
│     ├─ npm install --legacy-peer-deps
│     ├─ .env setup
│     ├─ Node.js/TypeScript/DB verification
│     └─ gcloud CLI configuration
│
├─ Developer opens in browser
│   └─ Full VS Code IDE in Cloud Workstations
│   └─ All ports forwarded
│   └─ All dependencies installed
│
└─ Developer productivity
    └─ npm run dev:local → Frontend + Backend running
    └─ npm run project -- list → Project configs available
    └─ .env already configured
    └─ Can integrate with multi-provider agent system
```

**Files Involved:**
```
.devcontainer/
  ├─ devcontainer.json (88 lines - configuration)
  │   ├─ Image: Cloud Workstations base
  │   ├─ Features: gcloud
  │   ├─ Extensions: Copilot, Cloud Code, etc.
  │   ├─ Mounts: ~/.ssh, ~/.config/gcloud
  │   └─ Ports: 5173, 8080, 3000, 5432, 6379, 5050
  │
  ├─ post-create.sh (74 lines - setup script)
  │   ├─ npm install
  │   ├─ .env initialization
  │   ├─ Verification steps
  │   └─ User guidance
  │
  └─ docker-compose.yml (services: postgres, redis, etc.)
```

---

## 🔗 Cross-System Integration Examples

### Example 1: Deploy Code with AI Assistance

```
Workflow:
1. Developer: npm run project -- switch staging-env
   → Switches to staging GCP project

2. Developer: Calls aiAgentCall()
   → Multi-provider agent routes to Copilot
   → Generates deployment script for staging

3. Developer runs generated script
   → Targets staging environment (GCP_PROJECT_ID is staging)
   → Cloud Build triggers
   → WebSocket broadcasts build events in real-time

4. Frontend shows real-time build progress
   → Operations Hub updates via /ops namespace
   → Deployment completes, events broadcast

5. Cost is tracked automatically
   → AI agent logs API cost
   → Cloud infrastructure logs spend
   → Operations Hub shows total cost for session
```

### Example 2: Multi-Environment Testing

```
Workflow:
1. Create 3 projects:
   npm run project -- add dev
   npm run project -- add staging
   npm run project -- add prod

2. Test in dev:
   npm run project -- switch dev
   npm run dev:local
   → Resources show dev-specific metrics

3. Promote to staging:
   npm run project -- switch staging
   npm run deploy
   → WebSocket shows staging build progress
   → Operations Hub reflects staging costs

4. Release to production:
   npm run project -- switch prod
   npm run deploy
   → Staging costs vs prod costs visible in Operations Hub
   → Real-time monitoring of prod deployment
```

### Example 3: Cloud Workstations Team Development

```
Workflow:
1. AI Engineer creates Cloud Workstations configuration
   → Uses .devcontainer/devcontainer.json in repo
   → Uses .gcp-projects/projects.json for team projects

2. Team member clones repo and opens in Cloud Workstations
   → post-create.sh automatically runs
   → npm install completes
   → Environment is ready to go

3. Team member opens Operations Hub
   → WebSocket connects automatically
   → Real-time dashboard shows all GCP resources
   → Can script deployments with multi-provider agents

4. All team members stay in sync
   → Same project configs (from git)
   → Same environment (from devcontainer)
   → Same dashboard (Operations Hub)
```

---

## 🏛️ Architectural Decisions

### Why These Four Systems?

1. **WebSocket Real-Time Updates** (`setupOpsWebSocket`)
   - **Purpose**: Eliminate polling-based dashboards
   - **Benefit**: Sub-second latency, reduced bandwidth
   - **Choice**: Socket.IO over raw WebSockets (easier namespaces/rooms)

2. **Project Manager** (`project-manager.ts`)
   - **Purpose**: Seamless multi-environment workflows
   - **Benefit**: Developers don't manage secrets manually
   - **Choice**: CLI over UI (faster for frequent switching)

3. **Multi-Provider Agent** (`multi-provider-agent.ts`)
   - **Purpose**: Optimize cost + quality of AI responses
   - **Benefit**: Use right tool for right job (cost metric + task type)
   - **Choice**: Orchestrator pattern over direct provider calls (flexibility)

4. **Cloud Workstations** (`.devcontainer/`)
   - **Purpose**: Eliminate "it works on my machine" problems
   - **Benefit**: Instant onboarding, consistent environments
   - **Choice**: devcontainer standard (VS Code, GitPod, GitHub Codespaces all support)

### Technology Stack Rationale

| Component | Technology | Why |
|-----------|-----------|-----|
| Real-time Updates | Socket.IO | Namespace support, browser compatibility, fallbacks |
| Project Config | JSON file | Version control friendly, human-readable |
| CLI | TypeScript | Type-safe, easy to maintain, leverage existing stack |
| Agent Routing | Orchestrator pattern | Extensible for new providers, metric-driven decisions |
| Container | devcontainer.json | Industry standard, works across IDEs/platforms |

---

## 🔄 How Systems Communicate

```
┌─────────────────┐
│  Project Manager │──┐
│   (.env updates) │  │
└─────────────────┘  │
                     ├──→ ┌──────────────┐
                     │    │ Environment  │
                     │    │ Variables    │
┌─────────────────┐  │    │              │
│  Cloud Build    │──┤    │ GCP_PROJECT_ │
│  (WebSocket     │  │    │ ID           │
│   events)       │  │    │ GCP_REGION   │
└─────────────────┘  │    │ ANTHROPIC_   │
                     │    │ API_KEY      │
┌─────────────────┐  │    │ GOOGLE_API_  │
│  Operations Hub │──┤    │ KEY          │
│  (uses .env)    │  │    │              │
└─────────────────┘  │    └──────────────┘
                     │
┌─────────────────┐  │
│  AI Agent       │──┘
│  (uses .env)    │
└─────────────────┘

All systems: Read .env → Use environment variables
Project Manager: Writes .env when switching projects
Result: Seamless context switching across all systems
```

---

## 📊 System Dependencies

```
Startup Sequence:
━━━━━━━━━━━━━━━━━

1. Load .env
   └─ Read all environment variables
   └─ Set GCP_PROJECT_ID, GCP_REGION, API keys

2. Initialize Database
   └─ Connect to PostgreSQL
   └─ Apply migrations if needed

3. Load GCP SDK
   └─ Initialize Google Cloud clients
   └─ Authenticate using GOOGLE_APPLICATION_CREDENTIALS

4. Initialize WebSocket Server
   └─ Create Socket.IO instance
   └─ Call setupOpsWebSocket(server)
   └─ Start listening for GCP events

5. Load Agent Orchestrator
   └─ Initialize MultiProviderOrchestrator
   └─ Prepare provider connections
   └─ Start tracking metrics

6. Start Express Server
   └─ All systems now operational
   └─ Ready for requests

Shutdown Sequence:
━━━━━━━━━━━━━━━━━

1. Stop accepting new requests
2. Close WebSocket connections
3. Shutdown GCP SDK connections
4. Close database
5. Shutdown server
```

---

## 🚨 Failure Modes & Resilience

### System: Real-Time WebSocket Updates

**Failure Mode**: GCP API unavailable
**Resilience**: 
- Fallback to polling (30s intervals)
- Exponential backoff on reconnection
- Cache last known state

### System: Project Manager

**Failure Mode**: `.gcp-projects/projects.json` corrupted
**Resilience**: 
- Backup to git history
- Validation on load
- Prompt user to recreate

### System: Multi-Provider Agent

**Failure Mode**: Primary provider API unavailable
**Resilience**: 
- Automatic fallback to secondary provider
- Up to 3 retries with exponential backoff
- Cache previous successful responses

### System: Cloud Workstations

**Failure Mode**: Container build fails
**Resilience**: 
- post-create.sh logs all steps
- Manual rebuild with `Dev Containers: Rebuild`
- Fallback to local development environment

---

## 📈 Scalability Considerations

### Current Capacity

- **WebSocket clients**: 100+ concurrent connections per server
- **Project configs**: Unlimited (JSON file based)
- **Agent request history**: Last 100 requests (cached in memory)
- **Cost data**: 6 months (stored in BigQuery)

### Scaling Path

| Metric | Current | Future (10x) | Solution |
|--------|---------|------|-----------|
| WebSocket clients | 100 | 1000 | Redis pub/sub for multi-server |
| Project configs | 1 file | Thousands | Move to Cloud Firestore |
| Agent request history | Memory | Persistent | Store in BigQuery/Cloud Datastore |
| Cost data | BigQuery only | Real-time | BigQuery + Cloud Pub/Sub |

---

## 🔐 Security Considerations

### Secrets Management

```
Development:
  .env (local, not committed) → API keys stored locally
  
Cloud Workstations:
  Secret Manager → Credentials fetched at startup
  ~/.config/gcloud → GCP service account mounted
  
CI/CD:
  GitHub Secrets → Injected at build time
  Cloud Build → Service account IAM permissions
```

### Access Control

- **Project configs** (.gcp-projects/): Version controlled, visible to team
- **Actual GCP projects**: Protected by IAM
- **AI provider keys**: Never logged, stored in Secret Manager
- **WebSocket**: Authenticated via session/JWT

### API Key Rotation

```
1. Create new key in Secret Manager
2. Update environment variable
3. Deploy new version
4. Retire old key (optional grace period)
```

---

## 🎓 Developer Learning Path

**Phase 1: Basics (First Day)**
- Start dev server: `npm run dev:local`
- Open Operations Hub: `http://localhost:5173/ops-hub`
- Create first project: `npm run project -- add`
- Understand WebSocket updates

**Phase 2: Intermediate (Week 1)**
- Switch between projects: `npm run project -- switch`
- Call AI agent: `import { aiAgentCall } from '...'`
- Monitor costs in Operations Hub
- Read project guides

**Phase 3: Advanced (Week 2-4)**
- Deploy to Cloud Workstations
- Build custom agents
- Integrate agents into API routes
- Manage team environments

---

## 🔗 Reference Links

### In This Repository
- **WebSocket Handler**: `server/middleware/ops-websocket.ts`
- **Project Manager**: `scripts/project-manager.ts`
- **Agent System**: `server/services/multi-provider-agent.ts`
- **Detection Config**: `.devcontainer/devcontainer.json`
- **Setup Script**: `.devcontainer/post-create.sh`

### External Resources
- [Socket.IO Documentation](https://socket.io/docs/)
- [Cloud Workstations](https://cloud.google.com/workstations)
- [Dev Containers Spec](https://containers.dev)
- [Cloud Run API](https://cloud.google.com/run/docs/reference/rest)
- [Anthropic Claude](https://docs.anthropic.com)
- [Google Vertex AI](https://cloud.google.com/docs/vertexai)

### Guides in This Repository
- [Advanced Features Guide](./ADVANCED_FEATURES_GUIDE.md)
- [Cloud Workstations Setup](./CLOUD_WORKSTATIONS_SETUP.md)
- [Project Manager Guide](./PROJECT_MANAGER_GUIDE.md)
- [Multi-Provider Agent Guide](./MULTI_PROVIDER_AGENT_GUIDE.md)
- [Operations Hub Setup](./OPS_INFRASTRUCTURE_SETUP.md)

---

**Last Updated**: January 2025
**Architecture Version**: 2.0 (with WebSocket, Project Manager, Multi-Provider Agent, Cloud Workstations)
**Status**: ✅ Production Ready
