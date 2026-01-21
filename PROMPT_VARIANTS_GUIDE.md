# Prompt Variant Management System - Complete Guide

## Overview

The Prompt Variant Management System allows you to create, test, and compare multiple prompt variations to find the best approach for your AI agents. Instead of using a single prompt, you can now:

- **Generate 7 different perspectives** from the same context automatically using Claude
- **Test variants** in real calls and campaigns
- **Compare performance** across all variants with metrics
- **A/B test** different approaches to find what works best
- **Refine variants** based on feedback

## Architecture

### Database Schema

The system uses three main tables:

#### 1. `prompt_variants`
Stores different prompt variations for an agent

```sql
- id: UUID (primary key)
- virtualAgentId: UUID (foreign key to virtual_agents)
- variantName: string (e.g., "The Consultant", "The Closer")
- perspective: enum (consultative, direct_value, pain_point, social_proof, educational, urgent, relationship)
- systemPrompt: text (the full system prompt)
- firstMessage: text (opening line)
- context: jsonb (generation context for reference)
- isActive: boolean
- isDefault: boolean
- testResults: jsonb (aggregated metrics)
- createdBy: UUID (user who created it)
- createdAt, updatedAt: timestamps
```

#### 2. `prompt_variant_tests`
Records performance of each variant in actual calls

```sql
- id: UUID
- variantId: UUID (foreign key)
- campaignId: UUID (foreign key)
- callAttemptId: UUID (optional, foreign key)
- disposition: enum (no-answer, busy, voicemail, connected, etc.)
- duration: integer (call duration in seconds)
- engagementScore: real (0-1 score)
- successful: boolean
- notes: text
- testedAt: timestamp
```

#### 3. `variant_selection_history`
Tracks which variant was used for each call

```sql
- id: UUID
- callAttemptId: UUID
- variantId: UUID (optional)
- perspective: enum
- selectionMethod: string (manual, ab_test, dynamic, default)
- selectedAt: timestamp
```

## Features

### 1. Automatic Variant Generation

Generate 7 unique prompt perspectives from the same context:

**Perspective Types:**
- **Consultative**: "Ask questions, diagnose first" - Works best for complex B2B sales
- **Direct Value**: "Lead with ROI" - Effective for time-constrained prospects
- **Pain Point**: "Address frustrations" - Good for cold outreach
- **Social Proof**: "Lead with case studies" - Builds credibility
- **Educational**: "Teach and inform first" - Establishes thought leadership
- **Urgent**: "Create appropriate urgency" - Works for time-sensitive offers
- **Relationship**: "Focus on rapport" - Good for longer sales cycles

### 2. API Endpoints

#### Generate Variants

```bash
POST /api/agents/{agentId}/generate-variants

Body:
{
  "agentName": "Sales Development Rep",
  "baseGoal": "Qualify leads and schedule meetings",
  "tone": "professional and friendly",
  "targetAudience": "VP of Sales",
  "organizationName": "DemandGentic.ai By Pivotal B2B",
  "industry": "SaaS",
  "talkingPoints": [
    "Improve lead qualification",
    "Increase meeting bookings"
  ],
  "objections": [
    "We already have a solution",
    "Not in the budget right now"
  ],
  "successCriteria": [
    "Books 5+ meetings per week",
    "90%+ accuracy in qualification"
  ],
  "autoCreate": true
}

Response:
{
  "success": true,
  "variants": [
    {
      "perspective": "consultative",
      "variantName": "The Consultant",
      "systemPrompt": "...",
      "firstMessage": "Hi, I'm curious about how you currently..."
    },
    // ... 6 more variants
  ],
  "autoCreated": true
}
```

#### List Variants

```bash
GET /api/agents/{agentId}/variants

Response:
{
  "variants": [
    {
      "id": "variant-uuid",
      "variantName": "The Consultant",
      "perspective": "consultative",
      "firstMessage": "...",
      "isDefault": true,
      "isActive": true,
      "testResults": {
        "testCount": 15,
        "successRate": 73.3,
        "avgDuration": 245,
        "avgEngagementScore": 0.82
      }
    }
  ]
}
```

#### Get Variant Details

```bash
GET /api/variants/{variantId}

Response:
{
  "variant": {...},
  "tests": [...],
  "metrics": {
    "testCount": 15,
    "successRate": 73.3,
    "avgDuration": 245,
    "avgEngagementScore": 0.82
  }
}
```

#### Compare All Variants

```bash
GET /api/agents/{agentId}/variants/compare

Response:
{
  "comparison": [
    {
      "variantId": "...",
      "variantName": "The Consultant",
      "perspective": "consultative",
      "testCount": 15,
      "successRate": 73.3,
      "avgDuration": 245,
      "avgEngagementScore": 0.82
    },
    // ... other variants sorted by success rate (best first)
  ]
}
```

#### Set Default Variant

```bash
PUT /api/agents/{agentId}/variants/{variantId}/default

Response:
{
  "success": true,
  "variant": {...}
}
```

#### Record Test Result

```bash
POST /api/variants/{variantId}/test-result

Body:
{
  "campaignId": "campaign-uuid",
  "callAttemptId": "call-uuid",
  "disposition": "qualified",
  "duration": 245,
  "engagementScore": 0.82,
  "successful": true,
  "notes": "Prospect showed strong interest in demo"
}

Response:
{
  "success": true,
  "test": {...}
}
```

#### Record Variant Selection

```bash
POST /api/call-attempts/{callAttemptId}/variant-selection

Body:
{
  "variantId": "variant-uuid",
  "perspective": "consultative",
  "selectionMethod": "manual"
}

Response:
{
  "success": true,
  "record": {...}
}
```

### 3. UI Components

#### Prompt Variant Management Panel

Located in Virtual Agents page:

```tsx
<PromptVariantManagement
  agentId={agentId}
  agentName="Sales SDR"
  onVariantSelected={(variant) => {
    // Handle variant selection
  }}
/>
```

**Features:**
- Generate variants with one click
- View all variants with performance metrics
- Compare performance across variants
- Set default variant
- Delete variants
- See performance dashboard

#### Prompt Variant Selector

Compact component for use in test calls:

```tsx
<PromptVariantSelector
  agentId={agentId}
  onVariantChange={(variant) => {
    setSelectedVariant(variant);
  }}
  showPreview={true}
  compact={false}
/>
```

## How to Use

### Step 1: Generate Variants

1. Go to Virtual Agents page
2. Select an agent
3. Click "Generate Multiple Variants"
4. Fill in the context:
   - Goal: What should the agent accomplish?
   - Tone: Professional? Friendly? Urgent?
   - Target Audience: Who are they calling?
   - Talking Points: Key value propositions
   - Objections: Common objections to handle
   - Success Criteria: What defines success?

5. Click "Generate 7 Variants"
6. Variants are automatically created and saved

### Step 2: Preview Variants

1. Each variant displays:
   - Variant name and perspective
   - First message preview
   - Performance metrics (if tested)
   - Selection/deletion options

2. Click on a variant to see full preview

### Step 3: Test Variants

#### Option A: Manual Selection
1. Go to Preview Studio
2. Click "Prompt Variant Selector"
3. Choose the variant you want to test
4. Place test call

#### Option B: Compare Performance
1. Go to "Performance" tab
2. See real-time metrics:
   - Test count
   - Success rate
   - Average call duration
   - Engagement score
3. Best performer is highlighted

### Step 4: Set Default Variant

1. Click the star icon on a variant
2. That variant becomes the default for all future calls
3. It will be used automatically in campaigns

### Step 5: Refine Based on Results

After testing:
1. Analyze performance in comparison view
2. Note which perspectives work best
3. Refine the top performers or generate new variants with updated context
4. Re-test to validate improvements

## Performance Metrics

Each variant tracks:

- **Test Count**: Number of calls using this variant
- **Success Rate**: % of calls with positive dispositions (qualified, interested, callback_scheduled)
- **Avg Duration**: Average call length in seconds
- **Avg Engagement Score**: Average engagement score (0-1)

## Best Practices

### 1. Context is Key
- Provide detailed context when generating variants
- Include specific talking points and objections
- Define success criteria clearly

### 2. Test Size Matters
- Run at least 10-15 calls with each variant for statistically significant results
- Test in similar conditions for fair comparison
- Account for factors like time of day, day of week

### 3. Iterate Continuously
- Don't just pick the best and stop
- Analyze why certain perspectives worked
- Generate new variants based on learnings
- Test refined versions

### 4. Combine Insights
- Take the best elements from top performers
- Create hybrid variants if needed
- Share learnings across similar agents

### 5. Track Over Time
- Monitor how perspectives perform for different industries
- Build a library of winning approaches
- Use historical data to inform new generations

## Prompt Refinement and Deployment

**All final system prompts must be refined and fine-tuned using Vertex AI prior to deployment to voice agents, including those utilizing Gemini voices. These prompts must strictly adhere to all defined guidelines and control layers.**

This process ensures:
- **Optimal Performance:** Prompts are tuned for the specific model and voice, leading to better-quality responses.
- **Consistency:** A standardized process for all prompts.
- **Safety and Compliance:** All prompts are vetted against safety guidelines and control layers before production use.

### Workflow Integration
1.  **Initial Prompt Generation:** Use the Prompt Variant Management System to generate and test initial prompt ideas.
2.  **Identify Top Performers:** Use the A/B testing and performance metrics to identify the most effective prompt variants.
3.  **Vertex AI Refinement:** Before a winning prompt is deployed as the new default for production traffic, it must be taken to the Vertex AI environment for final tuning and validation.
4.  **Final Deployment:** Once refined and approved in Vertex AI, the prompt can be deployed to the voice agents.

## Example Workflow

```
Week 1:
- Generate 7 variants for new "Enterprise SDR" agent
- Variants created: Consultative, Direct Value, Pain Point, Social Proof, Educational, Urgent, Relationship

Week 1-2:
- Test each variant in 10-15 calls
- Results: Direct Value (78% success), Social Proof (75%), Consultative (72%)

Week 2:
- Set "Direct Value" as default
- Generate new variants focusing on urgency and social proof elements
- Create hybrid combining best of all approaches

Week 3-4:
- Test new variants
- Find "Direct Value + Social Proof Hybrid" at 82% success rate
- Set as new default

Month 1+:
- Continuously monitor performance
- Quarterly regenerate variants with updated market context
- Share best practices with other agents
```

## Integration with Campaigns

Variants integrate seamlessly with campaigns:

1. **Automatic Tracking**: Which variant was used for each call
2. **Performance Attribution**: Know which variants drive results
3. **A/B Testing**: Route calls to different variants automatically
4. **Real-time Optimization**: Adjust approaches based on live data

## Troubleshooting

### Variants Not Generating
- Check Claude API key is configured
- Verify context fields are filled
- Check token usage for API limits

### Performance Metrics Not Updating
- Ensure test results are recorded after calls
- Check database for variant_tests records
- Verify call attempts are linked correctly

### Wrong Variant Loading
- Check variantId parameter in request
- Verify variant is active
- Check fallback to default works

## Advanced Features (Future)

- **Dynamic Perspective Selection**: Automatically choose best variant per prospect
- **ML-Powered Ranking**: ML model predicts best variant per industry/role
- **Real-time Adjustment**: Switch variants mid-call based on response
- **Emotional Tone Analysis**: Analyze prospect emotion and adapt tone
- **Multi-variant Chains**: Chain variants together for different call stages

## API Reference

### POST /api/agents/{agentId}/generate-variants
Generate 7 prompt variants automatically

### GET /api/agents/{agentId}/variants
List all variants for an agent

### GET /api/agents/{agentId}/variants/compare
Compare performance of all variants

### POST /api/agents/{agentId}/generate-variant/{perspective}
Generate single variant with specific perspective

### GET /api/variants/{variantId}
Get variant details with test results

### POST /api/variants/{variantId}/test-result
Record test result after call

### PUT /api/agents/{agentId}/variants/{variantId}/default
Set variant as default

### DELETE /api/variants/{variantId}
Delete a variant

### PUT /api/variants/{variantId}
Update variant metadata

### POST /api/variants/{variantId}/refine
Refine variant based on feedback

---

**For questions or feedback, contact the development team.**
