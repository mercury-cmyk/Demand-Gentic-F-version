# Account Intelligence Toggle Feature

## Overview

The **Account Intelligence Toggle** allows you to control whether campaigns should wait for/generate account intelligence before making calls. This gives you flexibility to:

1. **Launch campaigns immediately** without waiting for intelligence generation
2. **Enable intelligence selectively** for high-value campaigns that benefit from personalization
3. **Mix both approaches** - some campaigns use intelligence, others don't

## How It Works

### Campaign Field: `require_account_intelligence`

- **Type**: Boolean
- **Default**: `false` (campaigns work immediately without intelligence)
- **Location**: `campaigns` table

### Behavior

**When `require_account_intelligence = false` (Default)**:
- System prompt builds instantly using **campaign context + basic company info**:
  - Virtual agent base prompt
  - Campaign objective & talking points
  - Product/service info
  - Contact details (name, title, company)
  - **Basic company context** (industry, description, size, revenue)
- ✅ **No delays** - calls start immediately
- ✅ **No intelligence generation** - works out of the box
- ✅ **Lightweight personalization** - uses company industry & description
- ⚠️  **No deep research** - doesn't include competitive analysis, recent news, or messaging strategy

**When `require_account_intelligence = true`:
- System prompt includes **full account intelligence**:
  - All campaign context (above)
  - Company research & insights
  - Account messaging brief
  - Call planning & strategy
  - Memory notes from previous calls
- ✅ **Highly personalized** - tailored to each account
- ✅ **Uses cached intelligence** - if already generated (instant)
- ⚠️  **May generate on-the-fly** - if not cached (5-30 second delay)

## Configuration

### Via Database

```sql
-- Enable intelligence for a specific campaign
UPDATE campaigns
SET require_account_intelligence = true
WHERE id = 'campaign-id-here';

-- Enable for all campaigns matching a pattern
UPDATE campaigns
SET require_account_intelligence = true
WHERE name LIKE '%Enterprise%'
  AND dial_mode = 'ai_agent';

-- Disable intelligence (default behavior)
UPDATE campaigns
SET require_account_intelligence = false
WHERE id = 'campaign-id-here';
```

### Via Application (Future Enhancement)

The UI can add a toggle in campaign settings:

```
Campaign Settings
├── AI Agent Configuration
│   ├── Virtual Agent
│   ├── Campaign Objective
│   └── [ ] Require Account Intelligence
│           When enabled, calls will use detailed account
│           research for personalization. Generate intelligence
│           before launching campaign to avoid delays.
```

## Best Practices

### ✅ Enable Intelligence For:
- **Enterprise accounts** - High-value targets where personalization matters
- **Complex sales cycles** - Multi-touch campaigns needing context
- **Account-based marketing (ABM)** - Campaigns targeting specific companies
- **Existing accounts** - Calls to customers who already have intelligence generated

### ✅ Disable Intelligence For:
- **Cold outreach campaigns** - Volume-based campaigns where speed matters (still gets industry/description)
- **Simple qualification calls** - Basic qualifying questions with lightweight context
- **New campaigns** - Launch immediately with basic personalization, enable intelligence later
- **Testing/development** - Faster iteration without intelligence delays
- **Most campaigns** - Basic company context (industry, description) is sufficient for most use cases

## Migration Guide

### Current State (After Migration)

All campaigns now have `require_account_intelligence = false` by default, **except**:
- Pivotal B2B campaigns (already set to `true` since intelligence is being generated)

This means:
- ✅ **Existing campaigns work immediately** - no changes needed
- ✅ **No breaking changes** - backward compatible
- ✅ **Opt-in model** - enable intelligence only when needed

### Enabling Intelligence for a Campaign

1. **Generate intelligence first** (recommended):
   ```bash
   npx tsx generate-intelligence-daily.ts
   # Or for specific campaign:
   npx tsx generate-intelligence-pivotal-only.ts
   ```

2. **Enable the toggle**:
   ```sql
   UPDATE campaigns
   SET require_account_intelligence = true
   WHERE id = 'your-campaign-id';
   ```

3. **Launch campaign** - calls will now use intelligence

## Logs & Monitoring

The system logs indicate which path is taken:

```
[OpenAI-Realtime-Dialer] Campaign does not require account intelligence - proceeding with campaign context only.
```

```
[OpenAI-Realtime-Dialer] Campaign requires account intelligence - loading/generating...
```

## Silent Call Fix

This feature **directly addresses the silent call issue**:

### Before (Silent Calls)
1. Campaign starts → Call connects
2. System tries to load intelligence
3. Intelligence not found → Generates (5-30s delay)
4. Call already connected and waiting
5. Generation times out → **Incomplete prompt → SILENT**

### After (Two Options)

**Option A: Disable Intelligence (Immediate Calls)**
```sql
UPDATE campaigns SET require_account_intelligence = false;
```
- Calls work immediately
- Use campaign context only
- No personalization delays

**Option B: Pre-Generate Intelligence**
```bash
npx tsx generate-intelligence-daily.ts
```
- Generate intelligence in advance
- Enable intelligence toggle
- Calls use cached intelligence (instant)
- Full personalization without delays

## Technical Details

### Code Changes

**Schema ([shared/schema.ts:1246](shared/schema.ts#L1246))**:
```typescript
requireAccountIntelligence: boolean("require_account_intelligence").default(false),
```

**Prompt Builder ([server/services/openai-realtime-dialer.ts:3814-3825](server/services/openai-realtime-dialer.ts#L3814-L3825))**:
```typescript
const requireIntelligence = campaignConfig?.requireAccountIntelligence ?? false;

if (!requireIntelligence) {
  console.log(`${LOG_PREFIX} Campaign does not require account intelligence - proceeding with campaign context only.`);
} else if (!accountId || !contactId) {
  console.warn(`${LOG_PREFIX} Missing accountId or contactId - skipping account intelligence.`);
} else {
  console.log(`${LOG_PREFIX} Campaign requires account intelligence - loading/generating...`);
  // ... load/generate intelligence
}
```

### Intelligence Generation Scripts

- `generate-intelligence-daily.ts` - Process 1,000 accounts/day
- `generate-intelligence-pivotal-only.ts` - Process Pivotal campaign accounts only
- `generate-account-intelligence.ts` - Process all accounts (use carefully)

## Summary

| Feature | Without Intelligence | With Intelligence |
|---------|---------------------|------------------|
| **Call Start** | Immediate | Immediate (if cached) |
| **Company Context** | Basic (industry, description, size) | Full (research, news, competitors) |
| **Personalization** | Campaign + lightweight company | Deep account-specific |
| **Setup Required** | None | Pre-generate intelligence |
| **Use Case** | Most campaigns | High-value ABM |
| **Risk** | Less detailed context | Delays if not cached |

**Recommendation**: Start with intelligence disabled for immediate results, then enable selectively for high-value campaigns after generating intelligence.