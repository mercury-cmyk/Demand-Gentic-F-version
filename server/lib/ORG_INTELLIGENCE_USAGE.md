# Organization Intelligence for AI Agents

## Overview
Organization Intelligence is now stored in the **database** (not env variables), making it editable through the UI and tied to your organization.

## For AI Agent Developers

### Quick Start - Use Helper Functions

```typescript
import { buildAgentSystemPrompt, getOrganizationPromptSettings, getOrganizationProfile } from './lib/org-intelligence-helper';

// Option 1: Build complete system prompt (recommended)
const systemPrompt = await buildAgentSystemPrompt(`
  You are an AI sales agent. 
  Your goal is to qualify leads and book meetings.
`);

// Option 2: Get settings separately
const settings = await getOrganizationPromptSettings();
// Returns: { orgIntelligence, compliancePolicy, platformPolicies, agentVoiceDefaults }

const profile = await getOrganizationProfile();
// Returns: { domain, identity, offerings, icp, positioning, outreach }
```

### Example: Email Campaign Agent

```typescript
import { buildAgentSystemPrompt } from './lib/org-intelligence-helper';

async function generateCampaignEmail(contact, campaign) {
  const systemPrompt = await buildAgentSystemPrompt(`
    You are an AI email writer for B2B campaigns.
    Write personalized, compliant emails.
  `);
  
  // systemPrompt now includes:
  // - Organization identity & positioning
  // - Compliance rules (business hours, opt-outs, etc.)
  // - Platform policies
  // - Tone/voice guidelines
  
  const completion = await openai.chat.completions.create({
    model: 'gpt-4o',
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: `Write email for: ${contact.name}...` }
    ]
  });
}
```

### Example: Voice Agent

```typescript
import { buildAgentSystemPrompt } from './lib/org-intelligence-helper';

async function handleVoiceCall(callContext) {
  const systemPrompt = await buildAgentSystemPrompt(`
    You are an AI voice agent making outbound B2B calls.
    Be professional, courteous, and value the prospect's time.
  `);
  
  // systemPrompt automatically includes:
  // - Voice behavior defaults (turn-taking, IVR handling, etc.)
  // - Compliance policy (business hours, DNC respect)
  // - Organization identity for intro
  
  // Use with OpenAI Realtime API or similar
}
```

## Database Schema

```sql
account_intelligence:
  - org_intelligence: TEXT       -- Brand identity, positioning, ICP
  - compliance_policy: TEXT      -- Legal/ethical guidelines
  - platform_policies: TEXT      -- Tool permissions
  - agent_voice_defaults: TEXT   -- Voice behavior rules
```

## Campaign & Engagement Learnings (Auto)

`buildAgentSystemPrompt()` now appends a **Campaign & Engagement Learnings** section with recent performance signals so agents can adapt messaging based on data.

Data sources (aggregated, no PII):
- `email_events` (delivered/opened/clicked/unsubscribed/complained)
- `call_attempts` (attempts, connected, qualified, DNC)
- `leads` (created vs approved/published)

Configurable settings (optional):
- `ORG_LEARNING_WINDOW_DAYS` (default: 30)
- `ORG_LEARNING_CACHE_MS` (default: 300000)
- `ORG_LEARNING_PROVIDER` = `auto` | `gemini` | `none`
- `ORG_LEARNING_GEMINI_MODEL` (default: `gemini-2.5-flash`)
- `AI_INTEGRATIONS_GEMINI_API_KEY` (required for Gemini summaries)

## Multi-Model Reasoning & Synthesis

Organization intelligence analysis runs **parallel multi-model reasoning** (OpenAI + Gemini + Claude) and then synthesizes a master profile.

Tuning settings (optional):
- `ORG_INTELLIGENCE_MODEL_TIMEOUT_MS` (default: 120000)
- `ORG_INTELLIGENCE_OPENAI_MODEL`, `ORG_INTELLIGENCE_GEMINI_MODEL`, `ORG_INTELLIGENCE_CLAUDE_MODEL`
- `ORG_INTELLIGENCE_OPENAI_MAX_TOKENS`, `ORG_INTELLIGENCE_GEMINI_MAX_OUTPUT_TOKENS`, `ORG_INTELLIGENCE_CLAUDE_MAX_TOKENS`
- `ORG_INTELLIGENCE_SYNTH_PROVIDER` = `auto` | `gemini` | `openai` | `claude` | `none`
- `ORG_INTELLIGENCE_SYNTH_MODEL`
- `ORG_INTELLIGENCE_SYNTH_TIMEOUT_MS` (default: 120000)

## Deep Analysis Mode (NEW)

For thorough organization intelligence, use the **Deep Analysis** endpoint (`POST /api/org-intelligence/analyze-deep`).

### What Deep Analysis Does

1. **Enhanced Web Research** (4 parallel streams, 15+ queries)
   - Company Core: Identity, products, mission
   - Market Position: Competitors, pricing, alternatives
   - Customer Intelligence: Case studies, testimonials, industries
   - News & Trends: Recent news, funding, growth signals

2. **Specialized Multi-Model Reasoning** (4 models, unique perspectives)
   - OpenAI (GPT-4o) → Strategic Analyst: Business model, competitive moat
   - Gemini (1.5 Pro) → Customer Success Expert: ICP, use cases, objections
   - Claude (Sonnet) → Brand Strategist: Positioning, messaging, outreach
   - DeepSeek → Market Researcher: Industry trends, competitive landscape

3. **Cross-Model Critique**
   - Identifies conflicts between model analyses
   - Highlights gaps in coverage
   - Finds consensus points (high confidence)

4. **Master Synthesis with Reasoning**
   - Chain-of-thought reasoning for each field
   - Confidence scores with justification
   - Tracks which model contributed to final values

### Real-Time Progress Updates

The endpoint uses Server-Sent Events (SSE) to stream progress:
```javascript
// Frontend example
const eventSource = new EventSource('/api/org-intelligence/analyze-deep');

eventSource.onmessage = (event) => {
  const data = JSON.parse(event.data);

  if (data.type === 'progress') {
    console.log(`[${data.phase}] ${data.message} (${data.progress}%)`);
  } else if (data.type === 'complete') {
    console.log('Analysis complete:', data.data);
    eventSource.close();
  } else if (data.type === 'error') {
    console.error('Error:', data.error);
    eventSource.close();
  }
};
```

### Configuration

```bash
# DeepSeek API (4th model perspective)
DEEPSEEK_API_KEY=xxx
ORG_INTELLIGENCE_DEEPSEEK_MODEL=deepseek-chat

# Research depth
ORG_INTELLIGENCE_WEB_PAGES=10          # Pages to crawl (default: 10)
ORG_INTELLIGENCE_WEB_PAGE_CHARS=1500   # Chars per page (default: 1500)
ORG_INTELLIGENCE_WEB_TIMEOUT_MS=15000  # Website timeout (default: 15000)
```

### Performance

| Metric | Standard Analysis | Deep Analysis |
|--------|-------------------|---------------|
| Search queries | 6 | 15+ |
| Model perspectives | 1 (generic) | 4 (specialized) |
| Reasoning depth | Single pass | Multi-pass + critique |
| Analysis time | ~30 seconds | ~2-3 minutes |
| Confidence detail | Basic | With reasoning traces |

## Agent Brain System (NEW)

AI Agents now have built-in **Knowledge**, **Brain**, and **Memory**:

### Simplified Agent Creation

Users only need to provide:
1. **Task Description** - What the agent should do
2. **First Message** - Opening greeting

The system automatically adds:
- Default B2B knowledge (calling rules, dispositions, compliance)
- Organization Intelligence (company info, products, ICP, positioning)
- Campaign learnings (performance insights)

### API Endpoints

**Create Smart Agent** (simplified):
```http
POST /api/virtual-agents/create-smart
{
  "name": "Sales Qualifier",
  "taskDescription": "Qualify inbound leads by asking about their needs and budget",
  "firstMessage": "Hi, thanks for your interest! I'd love to learn more about what you're looking for.",
  "agentType": "voice",
  "voice": "nova"
}
```

**Preview Generated Prompt** (without creating):
```http
POST /api/virtual-agents/generate-prompt
{
  "taskDescription": "...",
  "firstMessage": "..."
}
```

**Regenerate Existing Agent Prompt**:
```http
POST /api/virtual-agents/:id/regenerate-prompt
{
  "taskDescription": "Updated task...",
  "additionalContext": "Focus on enterprise customers"
}
```

**Check Organization Brain**:
```http
GET /api/virtual-agents/organization-brain
```

### Agent Knowledge Components

| Component | Source | Description |
|-----------|--------|-------------|
| **Default Knowledge** | `agent-brain-service.ts` | B2B calling rules, dispositions, compliance |
| **Brain** | Organization Intelligence | Company identity, products, ICP, positioning |
| **Memory** | Campaign Learnings | Performance insights from past 30 days |

### How It Works

1. User provides simple task + first message
2. System fetches Organization Intelligence
3. OpenAI generates comprehensive master prompt
4. Master prompt includes all knowledge sources
5. Agent is created with rich context

### Configuration

```bash
# Model for prompt generation
AGENT_BRAIN_MODEL=gpt-4o
```

## Migration Path

1. ✅ Old way: Read from `process.env.PROMPT_OPTIMIZATION_*`
2. ✅ New way: Read from database via helper functions
3. ✅ **Database only** - No fallback to env variables

**Breaking change** - You must configure settings through the UI or API. Env variables are ignored.

## Editing Settings

Users can edit these settings in the UI:
- Navigate to **AI Studio** → **Organization Intelligence**
- Go to **Prompt Optimization** tab
- Edit and save settings
- Changes apply immediately to all agents

## Benefits

✅ **Editable through UI** - No code deployments needed  
✅ **Tenant-specific** - Different orgs can have different settings  
✅ **Version controlled** - Track changes in database  
✅ **Consistent behavior** - All agents use same rules  
✅ **Compliance-ready** - Central place for policies
