# Call Intelligence & Conversation Quality System

## Overview

This comprehensive system automatically logs, analyzes, and tracks all call data to ensure complete visibility into conversation quality, call outcomes, and opportunities for improvement.

## Features

### 1. **Comprehensive Call Logging**
Every call automatically creates records with:
- **Metadata**: Call duration, participants, timestamps, recording URLs
- **Transcription**: Full conversation turns (agent and contact)
- **AI Analysis**: Sentiment, engagement level, topics discussed
- **Quality Metrics**: Scores for engagement, clarity, empathy, objection handling, qualification, and closing
- **Campaign Alignment**: How well the call followed campaign objectives and talking points
- **Issues & Challenges**: Specific problems identified in the call
- **Recommendations**: Concrete suggestions for improvement
- **Prompt Updates**: Suggested modifications to agent prompts based on call performance

### 2. **Automatic Conversation Quality Analysis**
All calls (live, test, simulation) are automatically analyzed using AI to:
- Calculate quality scores across 6 dimensions
- Identify conversation breakdowns and issues
- Generate actionable recommendations
- Suggest prompt improvements
- Track learning signals (sentiment, engagement, outcome)

### 3. **Persistent Storage**
All call data is stored in `call_quality_records` table for:
- Historical review and trending
- Performance analytics
- Team feedback and coaching
- AI model training and improvements

## Database Schema

### call_quality_records Table

```sql
CREATE TABLE call_quality_records (
  id UUID PRIMARY KEY,
  call_session_id UUID NOT NULL REFERENCES call_sessions(id),
  dialer_call_attempt_id UUID REFERENCES dialer_call_attempts(id),
  campaign_id UUID REFERENCES campaigns(id),
  contact_id UUID REFERENCES contacts(id),
  
  -- Quality Scores (0-100)
  overall_quality_score INT,
  engagement_score INT,
  clarity_score INT,
  empathy_score INT,
  objection_handling_score INT,
  qualification_score INT,
  closing_score INT,
  
  -- Conversation Intelligence
  sentiment VARCHAR (positive|neutral|negative),
  engagement_level VARCHAR (high|medium|low),
  identity_confirmed BOOLEAN,
  qualification_met BOOLEAN,
  
  -- Analysis Data (JSON)
  issues JSONB,                    -- [{ type, severity, description, evidence, recommendation }]
  recommendations JSONB,           -- [{ category, currentBehavior, suggestedChange, expectedImpact }]
  breakdowns JSONB,                -- [{ type, description, moment, recommendation }]
  prompt_updates JSONB,            -- [{ category, change, rationale, priority }]
  performance_gaps JSONB,          -- [gap descriptions]
  next_best_actions JSONB,         -- [action descriptions]
  
  -- Campaign Alignment
  campaign_alignment_score INT,
  context_usage_score INT,
  talking_points_coverage_score INT,
  missed_talking_points JSONB,
  
  -- Flow Compliance
  flow_compliance_score INT,
  missed_steps JSONB,
  flow_deviations JSONB,
  
  -- Disposition Analysis
  assigned_disposition VARCHAR,
  expected_disposition VARCHAR,
  disposition_accurate BOOLEAN,
  disposition_notes JSONB,
  
  -- Transcript
  transcript_length INT,
  transcript_truncated BOOLEAN,
  full_transcript TEXT,
  
  -- Metadata
  analysis_model VARCHAR,
  analysis_stage VARCHAR (realtime|post_call),
  interaction_type VARCHAR (live_call|test_call|simulation),
  analyzed_at TIMESTAMP,
  
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  
  INDEXES:
  - call_session_id
  - dialer_call_attempt_id
  - campaign_id
  - contact_id
  - overall_quality_score
  - created_at
);
```

## API Endpoints

### 1. Retrieve Call Quality Record
```
GET /api/call-intelligence/records/{callSessionId}

Response:
{
  "success": true,
  "record": {
    "id": "...",
    "scores": { overall, engagement, clarity, ... },
    "intelligence": { sentiment, engagementLevel, ... },
    "analysis": { issues, recommendations, ... },
    "transcript": { text, length, truncated },
    "metadata": { model, stage, type, analyzedAt }
  }
}
```

### 2. Get Campaign Call Quality
```
GET /api/call-intelligence/campaign/{campaignId}?startDate=...&endDate=...&minScore=60&sentiment=negative&limit=50

Response:
{
  "success": true,
  "campaignId": "...",
  "summary": {
    "totalRecords": 150,
    "avgScore": 75,
    "sentimentCounts": { positive: 80, neutral: 60, negative: 10 }
  },
  "records": [
    {
      "id": "...",
      "callSessionId": "...",
      "score": 85,
      "sentiment": "positive",
      "engagement": "high",
      "issueCount": 2,
      "recommendationCount": 3,
      "createdAt": "..."
    }
  ]
}
```

### 3. Get Problematic Calls
```
GET /api/call-intelligence/problematic/{campaignId}?threshold=60

Response:
{
  "success": true,
  "campaignId": "...",
  "threshold": 60,
  "calls": [
    {
      "recordId": "...",
      "callSessionId": "...",
      "score": 45,
      "criticalIssues": [
        "Objection not handled",
        "Failed to confirm identity"
      ],
      "recommendations": [...]
    }
  ]
}
```

### 4. Get Quality Summary
```
GET /api/call-intelligence/summary/{campaignId}?startDate=2026-01-01&endDate=2026-01-31

Response:
{
  "success": true,
  "summary": {
    "campaignId": "...",
    "totalCalls": 150,
    "avgScore": 75,
    "sentimentCounts": { ... },
    "engagementCounts": { ... },
    "commonIssues": {
      "objectionNotHandled": { count: 45, severity: "high" },
      ...
    },
    "topRecommendations": {
      "improveOpening": { count: 60, category: "opening" },
      ...
    }
  }
}
```

### 5. Export Call Quality Data
```
GET /api/call-intelligence/export/{campaignId}?startDate=2026-01-01&endDate=2026-01-31&format=csv

Response: CSV or JSON with complete call quality dataset
```

## Integration Points

### Automatic Logging in voice-dialer.ts

When a call ends, the system:

```typescript
// 1. Analyzes conversation quality
const conversationQuality = await analyzeConversationQuality({
  transcript: fullTranscript,
  interactionType: "live_call",
  analysisStage: "post_call",
  callDurationSeconds: callDuration,
  disposition,
  campaignId: session.campaignId,
  agentName: session.virtualAgentId,
});

// 2. Logs comprehensive intelligence data
const intelligenceResult = await logCallIntelligence({
  callSessionId,
  dialerCallAttemptId: session.callAttemptId,
  campaignId: session.campaignId,
  contactId: session.contactId,
  qualityAnalysis: conversationQuality,
  fullTranscript,
});

// 3. Updates call_sessions with analysis
await db.update(callSessions).set({
  aiAnalysis: { ...aiAnalysis, conversationQuality },
  updatedAt: new Date(),
});
```

## Setup Instructions

### Step 1: Push Database Schema
```bash
npm run db:push
```

This creates the `call_quality_records` table with all necessary indexes.

### Step 2: Start Server
```bash
npm run dev
```

The system will automatically:
- Log all calls to `call_quality_records`
- Analyze conversation quality
- Store transcripts, issues, and recommendations

### Step 3: Test
Run a test call or campaign:
```bash
# Make a test call
# Monitor the call logs in the console
# Check the database for records
```

## Usage Examples

### Get All Calls for a Campaign with Quality Issues
```bash
curl -H "Authorization: Bearer $TOKEN" \
  "http://localhost:5000/api/call-intelligence/campaign/campaign-123?minScore=60"
```

### Get Specific Call Details
```bash
curl -H "Authorization: Bearer $TOKEN" \
  "http://localhost:5000/api/call-intelligence/records/call-session-123"
```

### Export Data for Analysis
```bash
curl -H "Authorization: Bearer $TOKEN" \
  "http://localhost:5000/api/call-intelligence/export/campaign-123?startDate=2026-01-01&endDate=2026-01-31&format=csv" \
  > call-quality-export.csv
```

## Data Flow

```
Call Initiated
     ↓
Call Recording (Telnyx)
     ↓
Call Ended
     ↓
Transcription (Telnyx/Whisper)
     ↓
AI Analysis (Deepseek/Gemini)
     ↓
Conversation Quality Analysis
     ↓
Log to call_quality_records ✅
     ↓
Update call_sessions with analysis
     ↓
Available via API for review
```

## Quality Score Breakdown

### Overall Quality Score (0-100)
- Weighted average of 6 dimensions
- Reflects overall conversation effectiveness

### Engagement Score (0-100)
- Prospect attention and interest level
- Voice tone and responsiveness

### Clarity Score (0-100)
- Message articulation
- Prospect understanding

### Empathy Score (0-100)
- Active listening demonstration
- Prospect rapport and comfort

### Objection Handling Score (0-100)
- Response quality to concerns
- Objection resolution effectiveness

### Qualification Score (0-100)
- Qualification criteria met
- Data captured accurately

### Closing Score (0-100)
- Next step clarity
- Call objective achieved

## Issue Categories

- **Script Issues**: Deviations from intended messaging
- **Flow Issues**: Missing steps in call flow
- **Qualification Issues**: Failed to qualify properly
- **Tone Issues**: Inappropriate tone or delivery
- **Timing Issues**: Pacing or timing problems
- **Compliance Issues**: Regulatory or policy violations
- **Data Issues**: Incorrect information captured

## Recommendation Categories

- **Script**: Changes to agent messaging or opening
- **Flow**: Improvements to call flow or structure
- **Qualification**: Better qualification techniques
- **Tone**: Adjustments to agent tone or delivery
- **Timing**: Pacing improvements
- **Compliance**: Compliance fixes
- **Data**: Data capture improvements
- **Other**: General improvements

## Maintenance

### Regular Tasks

1. **Monitor Call Quality Trends**
   - Check avg quality scores weekly
   - Identify declining trends
   - Take corrective action

2. **Review High-Priority Issues**
   - Focus on "high" severity issues
   - Implement prompt updates
   - Re-train agents

3. **Export Data for Analytics**
   - Weekly/monthly exports
   - Trend analysis
   - Performance dashboards

4. **Archive Old Records**
   - Archive records older than 90 days
   - Maintain performance by cleaning up old data

### Performance Optimization

- Index on `call_session_id`, `campaign_id`, `created_at`
- Partition by `created_at` for very large datasets
- Archive to S3 for long-term storage

## Troubleshooting

### No Call Quality Records Created

Check:
1. Ensure `npm run db:push` was successful
2. Verify database connection
3. Check server logs for errors
4. Confirm `analyzeConversationQuality` is being called

### Missing Transcripts

Check:
1. Recording URL is present in call_sessions
2. Transcription service is working
3. Transcript length > 0

### Low Quality Scores

This is expected for:
- Voicemail calls
- No-answer calls
- Very short calls (<10 seconds)

Check the `issues` field for specific problems.

## Architecture

### Services

- `conversation-quality-analyzer.ts`: Analyzes transcripts using AI
- `call-intelligence-logger.ts`: Persists call data to database
- `voice-dialer.ts`: Triggers logging when calls end

### Database

- `call_quality_records`: Stores all analysis results
- `call_sessions`: Stores call metadata and transcripts
- `dialer_call_attempts`: Links to campaign/contact

### API

- `call-intelligence-routes.ts`: Exposes data via REST endpoints

## Future Enhancements

- Real-time quality monitoring dashboard
- Team coaching recommendations
- Automatic prompt optimization
- Conversation replay with analysis overlay
- Team comparison and benchmarking
- ML-based predictive scoring
- Integration with CRM for lead scoring