# Campaign & Account-Level Prompt Variants Architecture

## Overview

Refactored the prompt variant system to support a hierarchical three-level architecture:
1. **Account Level** - Organization-wide variant templates
2. **Campaign Level** - Campaign-specific variants (inherit from account)
3. **Agent Level** - Individual agent templates (legacy support)

## Architecture

### Hierarchy & Inheritance

```
Account Variants (Templates for entire organization)
    ↓ (Defaults to)
Campaign Variants (Specific to campaign)
    ↓ (Falls back to)
Agent Variants (Individual agent level)
```

When selecting an active variant:
1. Try campaign-level default first
2. Fall back to account-level default
3. Fall back to agent-level default (if provided)

### Schema Changes

**Updated `promptVariants` table in `shared/schema.ts`:**

```typescript
promptVariants {
  accountId: optional FK to accounts (new)
  campaignId: optional FK to campaigns
  virtualAgentId: optional FK to virtualAgents
  variantScope: 'account' | 'campaign' | 'agent' (was variantType)
  // + existing fields
}
```

**New Indexes:**
- `accountIdx` - Query by account
- `campaignIdx` - Query by campaign
- `agentIdx` - Query by agent
- `scopeIdx` - Query by variant scope

## API Endpoints

### Account-Level Endpoints

```
GET    /api/accounts/:accountId/variants
POST   /api/accounts/:accountId/variants
GET    /api/accounts/:accountId/variants/compare
POST   /api/accounts/:accountId/variants/generate
```

### Campaign-Level Endpoints

```
GET    /api/campaigns/:campaignId/variants
POST   /api/campaigns/:campaignId/variants
GET    /api/campaigns/:campaignId/variants/default
GET    /api/campaigns/:campaignId/variants/compare
GET    /api/campaigns/:campaignId/variants/:variantId
PUT    /api/campaigns/:campaignId/variants/:variantId
DELETE /api/campaigns/:campaignId/variants/:variantId
POST   /api/campaigns/:campaignId/variants/:variantId/set-default
POST   /api/campaigns/:campaignId/variants/:variantId/test
POST   /api/campaigns/:campaignId/variants/:variantId/record-selection
POST   /api/campaigns/:campaignId/variants/generate
```

### Agent-Level Endpoints (Templates)

```
GET    /api/agents/:agentId/variants
POST   /api/agents/:agentId/variants
POST   /api/agents/:agentId/variants/generate
```

## Service Functions

### New/Updated Functions

- `createPromptVariant()` - Supports accountId, campaignId, agentId
- `getAccountVariants()` - NEW: Get all account-level variants
- `getCampaignVariants()` - Get campaign variants
- `getAgentVariants()` - Get agent variants
- `getActiveVariantForCampaign()` - UPDATED: Hierarchical fallback (campaign → account → agent)
- `compareAccountVariants()` - NEW: Compare account-level variants
- `compareCampaignVariants()` - Compare campaign variants
- `setDefaultVariant()` - Set default for scope
- `recordVariantTest()` - Record test results
- `recordVariantSelection()` - Track which variant was used

## Usage Flow

### Creating Account-Level Variant Template

```typescript
const variant = await createPromptVariant({
  variantName: "Professional Consultative",
  perspective: "consultative",
  systemPrompt: "...",
  accountId: "acc_123" // Account scope
}, userId);
```

### Creating Campaign-Specific Variant

```typescript
const variant = await createPromptVariant({
  variantName: "Campaign Q1 - Aggressive",
  perspective: "direct_value",
  systemPrompt: "...",
  campaignId: "camp_456" // Campaign scope
}, userId);
```

### Getting Active Variant (With Fallback)

```typescript
const variant = await getActiveVariantForCampaign(
  "camp_456",           // Campaign ID
  "acc_123",            // Account ID (optional, for fallback)
  "agent_789"           // Agent ID (optional, for final fallback)
);
// Returns: campaign variant → account variant → agent variant → null
```

### Comparing Performance

```typescript
// Account-level performance
const accountComparison = await compareAccountVariants("acc_123");

// Campaign-level performance
const campaignComparison = await compareCampaignVariants("camp_456");
```

### Generating Variants

```typescript
// Generate account templates
const accountVariants = await generateMultiplePromptVariants(
  { accountId: "acc_123", goal: "...", targetAudience: "..." },
  ["consultative", "direct_value"]  // Optional: only these perspectives
);

// Generate campaign-specific variants
const campaignVariants = await generateMultiplePromptVariants(
  { campaignId: "camp_456", goal: "...", targetAudience: "..." }
);
```

## Prompt Perspectives

All variants use one of these perspectives:
- `consultative` - Asks questions, builds relationship
- `direct_value` - Leads with business value
- `pain_point` - Focuses on problems to solve
- `social_proof` - Uses case studies, testimonials
- `educational` - Teaching approach
- `urgent` - Time-sensitive, FOMO-based
- `relationship` - Personal, friendly tone

## Performance Metrics

Each variant tracks:
- **testCount** - Number of calls tested
- **successRate** - Percentage of successful dispositions
- **avgDuration** - Average call length (seconds)
- **avgEngagementScore** - Average engagement 0-1

## Migration Notes

### For Existing Code

1. Update variant creation to include scope:
   ```typescript
   // Old: createPromptVariant(agentId, input, userId)
   // New: createPromptVariant({...input, agentId}, userId)
   ```

2. Update variant queries to specify scope:
   ```typescript
   // Get account variants
   await getAccountVariants(accountId);
   
   // Get campaign variants
   await getCampaignVariants(campaignId);
   ```

3. Update fallback logic:
   ```typescript
   // Old: getActiveVariant(agentId)
   // New: getActiveVariantForCampaign(campaignId, accountId, agentId)
   ```

## Files Modified

- `shared/schema.ts` - Updated promptVariants table
- `server/services/prompt-variant-service.ts` - Updated service layer
- `server/routes/prompt-variants.ts` - Restructured API routes

## Next Steps

1. Update UI components to use account/campaign selectors
2. Create migrations for existing data (map campaign → account)
3. Add analytics dashboard for variant performance
4. Implement auto-selection logic based on performance
5. Add variant A/B testing scheduler