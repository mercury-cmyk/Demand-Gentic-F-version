# AI Agent Integration with Organization Intelligence

## ✅ Migration Complete

The system has been updated to use **database-driven organization intelligence** instead of environment variables.

### What Changed

- ✅ Database migration applied - added 4 new columns to `account_intelligence` table
- ✅ Environment variables removed from `.env`, `.env.local`, and `env.yaml`
- ✅ Prompt optimization pipeline updated to use database
- ✅ Example implementation added to `ai-voice-agent.ts`
- ✅ Helper library available: `server/lib/org-intelligence-helper.ts`

## Updated Files

### 1. ✅ Prompt Optimization Pipeline
**File**: `server/services/prompt-optimization-pipeline.ts`

Now reads organization settings from database instead of env variables:
- Organization intelligence
- Compliance policy  
- Platform policies
- Agent voice defaults

### 2. ✅ AI Voice Agent (Example Implementation)
**File**: `server/services/ai-voice-agent.ts`

Updated to use `buildAgentSystemPrompt()` helper, which automatically includes:
- Organization identity and positioning
- Compliance rules (business hours, opt-outs, DNC)
- Platform policies (tool permissions)
- Voice behavior defaults (IVR handling, gatekeepers, turn-taking)

## How to Update Other Agents

### Before (Old Pattern)
```typescript
const systemPrompt = `You are an AI assistant...`;

const response = await openai.chat.completions.create({
  model: 'gpt-4o',
  messages: [
    { role: 'system', content: systemPrompt },
    // ...
  ]
});
```

### After (New Pattern)
```typescript
import { buildAgentSystemPrompt } from '../lib/org-intelligence-helper';

const systemPrompt = await buildAgentSystemPrompt(`You are an AI assistant...`);

const response = await openai.chat.completions.create({
  model: 'gpt-4o',
  messages: [
    { role: 'system', content: systemPrompt },
    // ...
  ]
});
```

That's it! The helper automatically injects:
- ✅ Organization context (brand, positioning, ICP)
- ✅ Compliance rules (business hours, opt-outs)
- ✅ Platform policies (tool permissions)
- ✅ Voice defaults (for voice agents)

## Agents That Should Be Updated

Candidates for integration (in priority order):

### High Priority
1. **`server/services/agent-command-runner.ts`** - Command execution agents
2. **`server/routes/virtual-agents.ts`** - Virtual agent system
3. **`server/services/ai-qa-analyzer.ts`** - QA analysis agent
4. **`server/services/ai-account-enrichment.ts`** - Account enrichment agent

### Medium Priority
5. **`server/routes/ai-operator.ts`** - AI operator interface
6. **`server/routes/hybrid-campaign-agents.ts`** - Hybrid campaign agents
7. **`server/services/natural-language-rule-parser.ts`** - Rule parsing agent

### Low Priority (Test/Utility Files)
8. `server/test-integrations.ts` - Test file
9. `server/routes.ts` - Legacy routes (if still used)

## Example Implementations

### Voice Agent Pattern
```typescript
import { buildAgentSystemPrompt } from '../lib/org-intelligence-helper';

class VoiceAgent {
  async buildSystemPrompt(): Promise<string> {
    const basePrompt = `
      You are making outbound B2B calls.
      Be professional, courteous, and respect gatekeepers.
      Navigate IVR systems politely.
    `;
    
    // Automatically adds org context, compliance, voice defaults
    return await buildAgentSystemPrompt(basePrompt);
  }
  
  async makeCall() {
    const systemPrompt = await this.buildSystemPrompt();
    // Use systemPrompt in OpenAI API call
  }
}
```

### Email Agent Pattern
```typescript
import { buildAgentSystemPrompt, getOrganizationProfile } from '../lib/org-intelligence-helper';

async function generateEmail(contact) {
  // Get organization profile for personalization
  const profile = await getOrganizationProfile();
  
  const systemPrompt = await buildAgentSystemPrompt(`
    You are an AI email writer for B2B campaigns.
    Write personalized, compliant emails.
    
    Contact: ${contact.name}
    Company: ${contact.company}
  `);
  
  const response = await openai.chat.completions.create({
    model: 'gpt-4o',
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: `Write introduction email` }
    ]
  });
}
```

### QA Agent Pattern
```typescript
import { buildAgentSystemPrompt } from '../lib/org-intelligence-helper';

async function analyzeCallQuality(transcript) {
  const systemPrompt = await buildAgentSystemPrompt(`
    You are a QA analyst reviewing B2B sales call transcripts.
    Evaluate for: professionalism, compliance, effectiveness.
  `);
  
  // systemPrompt now includes compliance policies for evaluation
  
  const response = await openai.chat.completions.create({
    model: 'gpt-4o',
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: `Analyze transcript: ${transcript}` }
    ]
  });
}
```

## Available Helper Functions

### 1. `buildAgentSystemPrompt(basePrompt: string)`
**Use when**: You want a complete system prompt with org context

```typescript
const systemPrompt = await buildAgentSystemPrompt(`
  Your agent-specific instructions here
`);
```

Returns: Complete prompt with organization context, compliance, policies

### 2. `getOrganizationPromptSettings()`
**Use when**: You need individual settings components

```typescript
const settings = await getOrganizationPromptSettings();
// { orgIntelligence, compliancePolicy, platformPolicies, agentVoiceDefaults }
```

### 3. `getOrganizationProfile()`
**Use when**: You need organization profile data

```typescript
const profile = await getOrganizationProfile();
// { domain, identity, offerings, icp, positioning, outreach }
```

## Configuration

All settings are managed through the UI:

1. Navigate to **AI Studio** → **Organization Intelligence**
2. **Organization Profile** tab - Analyze your organization's domain
3. **Prompt Optimization** tab - Edit behavioral settings

Changes apply immediately to all agents.

## Testing

After updating an agent:

1. Configure settings in UI (if not already done)
2. Test agent functionality
3. Verify system prompts include organization context
4. Check compliance rules are being followed

## Benefits

✅ **Single Source of Truth** - Database-driven, editable through UI
✅ **No Environment Changes** - Update settings without redeployment
✅ **Consistent Behavior** - All agents use same org context
✅ **Compliance Enforcement** - Policies automatically included
✅ **Easy Updates** - Change once, applies to all agents

## Migration Checklist

For each agent file:

- [ ] Import helper: `import { buildAgentSystemPrompt } from '../lib/org-intelligence-helper'`
- [ ] Make system prompt function async: `async buildSystemPrompt()`
- [ ] Wrap base prompt: `await buildAgentSystemPrompt(basePrompt)`
- [ ] Update callers to await: `const prompt = await buildSystemPrompt()`
- [ ] Test agent functionality
- [ ] Remove any hardcoded org/compliance text (now in database)

## Questions?

See documentation: [`server/lib/ORG_INTELLIGENCE_USAGE.md`](server/lib/ORG_INTELLIGENCE_USAGE.md)
