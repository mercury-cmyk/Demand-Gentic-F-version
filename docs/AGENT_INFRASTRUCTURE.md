# Agent Infrastructure Framework

## Overview

The Agent Infrastructure provides a unified, purpose-built framework for all AI agents in the DemandEarn platform. This ensures consistent behavior, compliance, governance, and maintainability across all agent types.

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                    Agent Governance Layer                        │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────────┐ │
│  │  Policies   │  │   Audit     │  │   Version Control       │ │
│  └─────────────┘  └─────────────┘  └─────────────────────────┘ │
└─────────────────────────────────────────────────────────────────┘
                              │
┌─────────────────────────────────────────────────────────────────┐
│                      Agent Registry                              │
│  ┌─────────────────────────────────────────────────────────────┐│
│  │  Agent Discovery │ Lifecycle Management │ Usage Tracking    ││
│  └─────────────────────────────────────────────────────────────┘│
└─────────────────────────────────────────────────────────────────┘
                              │
         ┌────────────────────┴────────────────────┐
         │                                         │
┌────────────────────┐               ┌────────────────────────┐
│  Core Email Agent  │               │  Core Voice Agent      │
│  ────────────────  │               │  ──────────────────    │
│  • Outreach        │               │  • Outbound Calls      │
│  • Follow-ups      │               │  • IVR Navigation      │
│  • Transactional   │               │  • Qualification       │
│  • Campaigns       │               │  • Objection Handling  │
└────────────────────┘               └────────────────────────┘
         │                                         │
┌────────────────────┐               ┌────────────────────────┐
│  Foundational      │               │  Foundational          │
│  Prompt v1.0       │               │  Prompt v1.0           │
│  ────────────────  │               │  ──────────────────    │
│  + Deliverability  │               │  + Identity Check      │
│  + Compliance      │               │  + Compliance          │
│  + Design          │               │  + State Machine       │
│  + Conversion      │               │  + Objection Handling  │
└────────────────────┘               └────────────────────────┘
```

## Core Agents

### Core Email Agent

**Purpose:** Single source of truth for ALL email interactions across the system.

**Handles:**
- Generating new outreach email templates
- Sending follow-up emails
- Sending transactional and system emails
- Campaign-driven email communication

**Foundational Standards:**
1. **Deliverability & Compliance** - Spam filter optimization, privacy compliance, content integrity
2. **Inbox-Safe Rendering** - Gmail, Outlook, Apple Mail, Yahoo compatibility
3. **Design & UX** - Mobile-first, visual hierarchy, brand consistency
4. **Conversion Optimization** - Subject lines, CTAs, friction reduction
5. **Campaign Awareness** - Tailored to campaign types

**Usage:**
```typescript
import { coreEmailAgent } from './server/services/agents';

// Generate campaign email
const result = await coreEmailAgent.generateCampaignEmail({
  campaignId: 'camp_123',
  campaignType: 'content_syndication',
  campaignName: 'Q1 Whitepaper Download',
  objective: 'Drive whitepaper downloads from IT Directors',
  targetAudience: 'IT Directors at mid-market companies',
  callToAction: 'Download the Whitepaper',
  landingPageUrl: 'https://example.com/whitepaper',
});
```

### Core Voice Agent

**Purpose:** Purpose-built agent for all voice call interactions.

**Handles:**
- B2B outbound calling
- IVR navigation
- Right-party verification
- BANT qualification
- Objection handling

**Foundational Standards:**
1. **Output Format** - Natural speech, no technical terms spoken
2. **Identity & Disclosure** - AI disclosure when asked
3. **Right-Party Verification** - Mandatory identity confirmation
4. **Call State Machine** - Forward-only progression
5. **Turn-Taking Discipline** - Natural conversation flow
6. **Compliance** - DNC, privacy, escalation

**Usage:**
```typescript
import { coreVoiceAgent } from './server/services/agents';

// Build complete prompt for voice call
const result = await coreVoiceAgent.execute({
  agentId: 'core_voice_agent',
  campaignContext: {
    campaignId: 'camp_123',
    campaignType: 'appointment_generation',
    campaignName: 'Q1 Demo Booking',
    objective: 'Book demos with IT Directors',
    targetAudience: 'IT Directors at mid-market companies',
  },
  contactContext: {
    contactId: 'contact_456',
    firstName: 'John',
    lastName: 'Smith',
    title: 'IT Director',
    company: 'Acme Corp',
  },
});
```

## Agent Registry

The Agent Registry provides central management for all agents:

```typescript
import { agentRegistry } from './server/services/agents';

// Get all registered agents
const agents = agentRegistry.getAllAgents();

// Get primary agent for a channel
const emailAgent = agentRegistry.getPrimaryAgent('email');

// Get registry statistics
const stats = agentRegistry.getStats();
```

## Governance Layer

The Governance Layer enforces policies and provides audit capabilities:

```typescript
import { agentGovernance, GOVERNANCE_POLICIES } from './server/services/agents';

// Initialize governance (call at server startup)
agentGovernance.initialize();

// Verify agent integrity
const integrity = agentGovernance.verifyIntegrity(coreEmailAgent);

// Get audit log
const auditLog = agentGovernance.getAuditLog(50);

// Lock agent to prevent changes
agentGovernance.lockAgent('core_email_agent', 'user_123', 'Deployed to production');
```

### Governance Policies

| Policy | Description | Enforcement |
|--------|-------------|-------------|
| EMAIL_SINGLE_SOURCE_OF_TRUTH | All email must use Core Email Agent | Mandatory |
| VOICE_SINGLE_SOURCE_OF_TRUTH | All voice must use Core Voice Agent | Mandatory |
| PROMPT_UPDATE_APPROVAL | Foundational prompts require approval | Recommended |
| USAGE_LOGGING | All invocations are logged | Automatic |

## Initialization

Add to your server startup:

```typescript
import { initializeAgentInfrastructure } from './server/services/agents';

// In your main server file
initializeAgentInfrastructure();
```

## Creating New Agents

To create a new agent type:

1. **Extend BaseAgent:**
```typescript
import { BaseAgent } from './server/services/agents';

export class MyNewAgent extends BaseAgent {
  readonly id = 'my_new_agent';
  readonly name = 'My New Agent';
  readonly description = 'Description of what this agent does';
  readonly channel = 'chat' as const;

  getFoundationalPrompt(): string {
    return MY_FOUNDATIONAL_PROMPT;
  }

  getKnowledgeSections(): AgentKnowledgeSection[] {
    return MY_KNOWLEDGE_SECTIONS;
  }

  async execute(input: AgentExecutionInput): Promise<AgentExecutionOutput> {
    // Implementation
  }
}
```

2. **Register with governance:**
```typescript
import { agentGovernance, agentRegistry } from './server/services/agents';

agentGovernance.registerAgent(myNewAgent);
agentRegistry.register(myNewAgent);
```

3. **Export from index:**
```typescript
// In server/services/agents/index.ts
export { myNewAgent, MyNewAgent } from './my-new-agent';
```

## File Structure

```
server/services/agents/
├── index.ts                 # Main exports
├── types.ts                 # Core types and interfaces
├── base-agent.ts            # Abstract base class
├── agent-registry.ts        # Central registry
├── agent-governance.ts      # Governance layer
├── core-email-agent.ts      # Core Email Agent
└── core-voice-agent.ts      # Core Voice Agent
```

## Prompt Versioning

Each agent's foundational prompt has a version hash:

```typescript
import { getPromptVersion, FOUNDATIONAL_PROMPTS } from './server/services/agents';

// Get version for a specific agent
const emailVersion = getPromptVersion('core_email_agent');

// Access all prompts
const allPrompts = FOUNDATIONAL_PROMPTS;
```

## Best Practices

1. **Always use core agents** - Never implement parallel email/voice logic
2. **Initialize at startup** - Call `initializeAgentInfrastructure()` early
3. **Provide full context** - Include campaign, contact, and organization context
4. **Monitor governance** - Check audit logs regularly
5. **Version control prompts** - Track prompt changes through governance
6. **Test thoroughly** - Validate prompts produce expected outputs

## Integration with Existing Services

The agent infrastructure integrates with existing services:

- **agent-runtime-assembly.ts** - Uses foundational prompts as base
- **agent-brain-service.ts** - Leverages agent knowledge sections
- **bulk-email-service.ts** - Delegates to Core Email Agent
- **voice-dialer.ts** - Uses Core Voice Agent prompts

## Future Roadmap

- [ ] SMS Agent
- [ ] Chat Agent
- [ ] Multi-agent orchestration
- [ ] A/B testing for prompts
- [ ] Dynamic knowledge injection
- [ ] Real-time prompt optimization
