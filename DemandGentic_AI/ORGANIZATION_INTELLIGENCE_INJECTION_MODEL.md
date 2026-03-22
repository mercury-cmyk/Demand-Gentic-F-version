# Organization Intelligence Injection Model

## Architecture Overview

This document describes the production-grade implementation of the Organization Intelligence (OI) Injection Model for voice agents in the DemanGent platform. This architecture enables agency-controlled, campaign-scoped organization context injection without giving clients direct system access.

## Core Principle

> **Agents should never be permanently tied to an organization. They should temporarily assume an organization.**

This provides:
- ✅ **Reusability** - Same agent logic serves multiple clients
- ✅ **Clean separation** - Organization context is isolated per campaign
- ✅ **Zero client access** - Clients never see prompts or internal logic
- ✅ **Full control** - Agency owns all intelligence and execution

---

## The 3 Knowledge Layers

Every voice agent prompt is assembled from three stacked layers:

### Layer 1: Universal Agent Knowledge (Always On)

**Non-negotiable. Defined by platform.**

Includes:
- Professional posture and call flow intelligence
- Ethics, consent, and pacing rules
- Objection handling fundamentals
- AI disclosure requirements
- Compliance protocols

**Location:** `server/services/agent-runtime-assembly.ts` → `UNIVERSAL_AGENT_KNOWLEDGE`

### Layer 2: Organization Intelligence (Campaign-Scoped)

**Selectable at agent creation or campaign assignment.**

Includes:
- Organization name and identity
- Products, services, offerings
- ICP (Ideal Customer Profile)
- Value propositions
- Messaging principles
- Compliance rules specific to the org
- Past campaign learnings (optional)

**Location:** Stored in `organization_intelligence_snapshots` table, bound via `campaign_org_intelligence_bindings`

### Layer 3: Campaign Context (Runtime)

**Injected at call time.**

Includes:
- Campaign objective
- Target audience description
- Contact-specific data
- Call scripts (if provided)
- Qualification criteria

---

## Organization Intelligence Modes

### Mode A: Use Existing Organization Intelligence

**When to use:**
- Your own organization campaigns
- Known/retained clients
- Repeat campaigns

**What happens:**
- Agent loads existing profile from `account_intelligence` or a saved snapshot
- Provides consistency across campaigns
- Fastest setup

### Mode B: Run Fresh Research (Key Feature)

**When to use:**
- New client onboarding
- One-off campaigns
- Pilot/test engagements
- White-label execution

**What happens:**
1. User provides: Organization Name, Website URL, Industry (optional), Notes (optional)
2. System triggers Organization Intelligence Research Pipeline
3. Scrapes website content (landing, about, products pages)
4. AI analyzes and extracts structured intelligence
5. Creates a **campaign-scoped snapshot**

**Important:**
- Snapshot is owned by agency, not client
- Not editable by client
- Optionally saved for reuse

### Mode C: No Organization Intelligence

**When to use:**
- Market research calls
- Voice-of-customer interviews
- Discovery calls
- Investor/ecosystem research

**What happens:**
- Agent operates as neutral researcher
- No brand representation
- No positioning or offers

---

## Database Schema

### `organization_intelligence_snapshots`

```sql
CREATE TABLE organization_intelligence_snapshots (
    id VARCHAR PRIMARY KEY,
    organization_name TEXT NOT NULL,
    website_url TEXT,
    industry TEXT,
    domain TEXT,
    
    -- Structured intelligence (JSONB)
    identity JSONB,
    offerings JSONB,
    icp JSONB,
    positioning JSONB,
    outreach JSONB,
    
    -- Compiled for injection
    compiled_org_context TEXT,
    
    -- Research metadata
    research_notes TEXT,
    raw_research_content TEXT,
    confidence_score REAL,
    
    -- Ownership
    is_reusable BOOLEAN DEFAULT false,
    created_by VARCHAR,
    created_at TIMESTAMP,
    archived_at TIMESTAMP
);
```

### `campaign_org_intelligence_bindings`

```sql
CREATE TABLE campaign_org_intelligence_bindings (
    id VARCHAR PRIMARY KEY,
    campaign_id VARCHAR NOT NULL UNIQUE,
    mode org_intelligence_mode NOT NULL, -- 'use_existing', 'fresh_research', 'none'
    snapshot_id VARCHAR,
    master_org_intelligence_id INTEGER,
    disclosure_level TEXT DEFAULT 'standard',
    bound_by VARCHAR,
    bound_at TIMESTAMP
);
```

### `agent_instance_contexts`

```sql
CREATE TABLE agent_instance_contexts (
    id VARCHAR PRIMARY KEY,
    virtual_agent_id VARCHAR NOT NULL,
    campaign_id VARCHAR,
    assembled_system_prompt TEXT NOT NULL,
    assembled_first_message TEXT,
    assembly_metadata JSONB,
    is_active BOOLEAN DEFAULT true,
    activated_at TIMESTAMP
);
```

---

## API Endpoints

### OI Snapshots

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/org-intelligence-injection/snapshots` | List reusable snapshots |
| GET | `/api/org-intelligence-injection/snapshots/:id` | Get snapshot details |
| POST | `/api/org-intelligence-injection/research` | Run fresh research |
| PATCH | `/api/org-intelligence-injection/snapshots/:id/reusable` | Mark as reusable |
| DELETE | `/api/org-intelligence-injection/snapshots/:id` | Archive snapshot |

### Campaign Bindings

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/org-intelligence-injection/campaigns/:id/binding` | Get campaign's OI binding |
| POST | `/api/org-intelligence-injection/campaigns/:id/bind` | Bind OI to campaign |
| POST | `/api/org-intelligence-injection/campaigns/:id/research-and-bind` | Research + bind in one step |

### Agent Assembly

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/org-intelligence-injection/assemble-prompt` | Assemble full agent prompt |
| POST | `/api/org-intelligence-injection/agents/:id/activate` | Create/refresh agent context |
| GET | `/api/org-intelligence-injection/agents/:id/context` | Get active agent context |

### Utility

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/org-intelligence-injection/master` | Get master org intelligence |
| GET | `/api/org-intelligence-injection/available-sources` | List all OI sources |

---

## UI Components

### `OrganizationIntelligenceSetup`

Location: `client/src/components/agents/organization-intelligence-setup.tsx`

Used in agent creation flow. Provides:
- Radio selection for 3 modes
- Source selector for existing OI
- Research form for fresh research
- Real-time research execution

### `CampaignOrgIntelligenceBinding`

Location: `client/src/components/campaigns/campaign-org-intelligence-binding.tsx`

Used in campaign creation/editing. Provides:
- Current binding status display
- Source selector dropdown
- Campaign-scoped binding confirmation

---

## Runtime Assembly Flow

When an agent is activated for a call:

```
1. Load Universal Agent Knowledge (always)
2. Check campaign_org_intelligence_bindings for mode
   - use_existing → Load from snapshot or master OI
   - fresh_research → Load from snapshot_id
   - none → Skip OI layer
3. Add Campaign Context
4. Add Agent's Custom System Prompt
5. Add Contact Context (at call time)
6. Assemble final prompt
```

**Runtime Model:**
```
Agent Core (immutable)
+ Organization Intelligence Snapshot (campaign-scoped)
+ Campaign Intent
+ Audience Context
= Active Agent Instance
```

---

## Safeguards

### 1. Org Intelligence Isolation
- No cross-campaign sharing unless explicitly saved as reusable
- Prevents contamination between client contexts

### 2. Disclosure Guard
- Agent only states org name and high-level context
- No internal strategy exposure
- Disclosure level configurable: minimal, standard, detailed

### 3. Consent Scope
- Follow-ups reference the represented organization
- Data ownership remains with agency
- All snapshots owned by agency users

---

## Business Model Alignment

This architecture supports the agency model:

**Clients do NOT:**
- Log into the system
- See agents or prompts
- Control intelligence
- Access campaign internals

**Agency delivers:**
- Conversations
- Leads
- Insights
- Results

**This protects:**
- Your IP
- Your execution edge
- Your margin

---

## File Locations

### Backend
- `server/services/organization-research-service.ts` - Research pipeline
- `server/services/agent-runtime-assembly.ts` - 3-layer assembly
- `server/routes/org-intelligence-injection-routes.ts` - API endpoints

### Frontend
- `client/src/components/agents/organization-intelligence-setup.tsx` - Agent creation UI
- `client/src/components/campaigns/campaign-org-intelligence-binding.tsx` - Campaign binding UI

### Schema
- `shared/schema.ts` - Database tables and types
- `migrations/0001_org_intelligence_injection_model.sql` - Migration

---

## Usage Example

### Creating an Agent with Fresh Research

```typescript
// 1. Create agent with OI config
const agent = await createAgent({
  name: "Client Campaign Agent",
  orgIntelligenceConfig: {
    mode: 'fresh_research',
    organizationName: "Acme Corp",
    websiteUrl: "https://acme.com",
    industry: "SaaS",
    saveAsReusable: true,
  }
});

// 2. Research runs automatically
// 3. Snapshot created and bound
```

### Binding OI to Campaign

```typescript
// Bind existing OI to campaign
await bindOrgIntelligenceToCampaign(campaignId, 'use_existing', {
  snapshotId: 'snapshot-123',
  disclosureLevel: 'standard',
});
```

### Assembling Agent Prompt at Runtime

```typescript
// At call time
const assembled = await assembleAgentPrompt({
  agentId: 'agent-123',
  campaignId: 'campaign-456',
  contactContext: {
    firstName: 'John',
    lastName: 'Smith',
    title: 'VP Engineering',
    company: 'Tech Corp',
  }
});

// assembled.systemPrompt contains all 3 layers
```

---

## Why This Architecture Is Right

This gives you:
- **Agency-scale reuse** - Same agents, multiple contexts
- **Rapid client onboarding** - Fresh research in minutes
- **Clean, repeatable campaigns** - Isolated, version-tracked
- **No client dependency** - They never touch the platform
- **Strong differentiation** - Not just another SaaS CRM

> **You're building an AI-operated demand engine, not a tool.**