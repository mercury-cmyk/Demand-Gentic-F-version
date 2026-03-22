# Content Syndication Campaign Fix

## Problem
For content syndication campaigns, the AI agent was **deviating from the objective** of just promoting the asset. Instead of focusing on getting prospects to accept/receive the asset, it was:
- Asking discovery questions about their current solution/products
- Pitching the company's solution instead of promoting the asset
- Trying to qualify prospects on BANT (Budget, Authority, Need, Timeline)
- Attempting to solve their problem rather than distributing the asset

## Root Cause
The `content_syndication` configuration in `campaign-configuration.ts` had **weak constraints** that didn't prevent deviation:
- "Keep this FIXED flow" → but the agent still deviated
- "Keep discovery minimal" → but the agent asked product questions
- No explicit DON'T rules about what NOT to do

Additionally, the campaign-configuration system prompt was **not being applied at runtime**. It was only used when creating/updating virtual agents, not during actual call execution.

## Solution

### 1. Strengthened Content Syndication Constraints (campaign-configuration.ts)
Updated the configuration with much stronger, explicit rules:

```typescript
// CRITICAL POINTS:
- YOUR ONLY OBJECTIVE: Get the prospect to consent to receive the asset via email.
- STRICT FLOW - DO NOT DEVIATE: (1) greeting, (2) confirm correct person + relevance check, 
  (3) asset intro (title + brief description ONLY), (4) 1-2 specific value points, (5) ask 
  for email confirmation, (6) get explicit permission to send, (7) polite close.

- CRITICAL CONSTRAINTS:
  * DO NOT ask about their current solution or products.
  * DO NOT ask discovery questions about their problem/challenge.
  * DO NOT try to qualify them on BANT, budget, timeline, decision-making, or buying intent.
  * DO NOT pitch your company's solution or services.
  * DO NOT try to solve their problem during this call.
  * DO NOT ask follow-up questions beyond confirming email and consent.

- The FRAMEWORK is fixed; only campaign context changes (asset title, topic, value points, org name).
- Asset description should be 1 sentence max.
- Close immediately after consent is given. Do NOT continue the conversation.
- If they say "no" to receiving the asset, thank them and end the call politely.
```

### 2. Integrated Campaign Configuration into Runtime Voice Agent (ai-voice-agent.ts)

Added **Layer 3.6** to the system prompt assembly pipeline:

```typescript
// Layer 3.6: Campaign configuration system prompt (campaign-type-specific constraints)
if (this.context.campaignType) {
  const config = getCampaignConfiguration(this.context.campaignType);
  if (config) {
    const campaignConfigPrompt = generateAgentSystemPrompt(config, undefined);
    prompt += `\n\n---\n\n## Campaign Type Specific Instructions\n${campaignConfigPrompt}`;
  }
}
```

This ensures that campaign-type-specific constraints are **applied to every call**, not just at agent creation.

## System Prompt Layering (for reference)
The voice agent system prompt is now assembled in this order:

1. **Layer 1**: Unified Agent Architecture foundational prompt
2. **Layer 2**: Campaign persona override (agent name, company, role)
3. **Layer 3**: Campaign script overrides (if configured)
4. **Layer 3.5**: Campaign behavior policy (awareness/engagement/conversion/qualification/retention)
5. **Layer 3.6**: Campaign configuration system prompt ← **NEW** (campaign-type-specific constraints)
6. **Layer 4**: Account & Contact intelligence
7. **Layer 5**: Voice control layer (canonical rules, output format)

## How It Works
- **For content_syndication campaigns**: The agent now receives explicit instructions to:
  - Stay focused on the asset distribution objective
  - Follow the 7-step fixed flow
  - Avoid all discovery, qualification, and solution-pitching activities
  - Close immediately after getting email consent

- **For other campaign types**: Each type has appropriate behavioral guidelines (e.g., `appointment_generation` gets conversion-focused behavior, `bant_qualification` gets qualification-focused behavior)

## Expected Behavior After Fix
Content syndication calls should now:
1. Open with greeting + confirm correct person + role relevance
2. Introduce the asset (title + 1-2 value points)
3. Confirm email address
4. Ask explicit permission: "Would you like me to send this to you?"
5. Send asset and close (no further conversation)
6. If decline → Thank them politely, end call

**No** product discovery, **no** solution pitching, **no** qualification questions.

## Testing
To verify the fix is working:
1. Run new content syndication campaign
2. Monitor call transcripts to ensure:
   - Agent stays on the 7-step flow
   - No discovery questions asked
   - No solution pitching
   - Closes immediately after consent

The fix applies to all new calls made after deployment.

## Files Modified
- [server/services/campaign-configuration.ts](server/services/campaign-configuration.ts#L225) - Strengthened content_syndication constraints
- [server/services/ai-voice-agent.ts](server/services/ai-voice-agent.ts#L25) - Added campaign configuration import
- [server/services/ai-voice-agent.ts](server/services/ai-voice-agent.ts#L337) - Added Layer 3.6 to system prompt assembly