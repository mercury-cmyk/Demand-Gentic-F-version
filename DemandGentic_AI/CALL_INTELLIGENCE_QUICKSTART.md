# Call Intelligence System - Quick Start

## What Was Added

A complete call logging and conversation intelligence system that:
✅ Logs every call with full metadata, transcript, and analysis
✅ Analyzes conversation quality across 6 dimensions
✅ Identifies issues, challenges, and problems
✅ Generates actionable recommendations
✅ Suggests prompt improvements
✅ Stores all data for reporting and review
✅ Provides API for accessing call logs and analytics

## Step-by-Step Setup

### 1. Apply Database Schema Changes
```bash
npm run db:push
```

This creates the `call_quality_records` table which stores all call analysis.

**What this table contains:**
- Quality scores (overall, engagement, clarity, empathy, objection handling, qualification, closing)
- Sentiment and engagement levels
- Identified issues with severity and recommendations
- Campaign alignment metrics
- Flow compliance
- Disposition accuracy
- Full transcript
- Analysis metadata

### 2. Start the Server
```bash
npm run dev
```

The server now automatically logs all calls.

### 3. Make a Test Call

#### Via Test Call Panel:
1. Open the application
2. Go to a campaign's Preview Studio or Test Call section
3. Make a test call
4. Monitor the console for: `✅ Call intelligence logged: {recordId}`

#### Via CLI (if available):
```bash
npm run test-call -- --campaign=test --contact="John Doe"
```

### 4. Verify the Data

The console will show:
```
[Voice-Dialer] ✅ Call intelligence logged: record-uuid-123
[Voice-Dialer] Test call quality score: 85
[Voice-Dialer] Identified 2 issues
[Voice-Dialer] Generated 3 recommendations
```

## API Usage

Once a call completes, you can retrieve the data:

### Get a Specific Call's Analysis
```bash
curl -H "Authorization: Bearer $YOUR_TOKEN" \
  http://localhost:5000/api/call-intelligence/records/{callSessionId}
```

Response:
```json
{
  "success": true,
  "record": {
    "id": "...",
    "scores": {
      "overall": 82,
      "engagement": 85,
      "clarity": 90,
      "empathy": 78,
      "objectionHandling": 75,
      "qualification": 88,
      "closing": 80
    },
    "intelligence": {
      "sentiment": "positive",
      "engagementLevel": "high",
      "identityConfirmed": true,
      "qualificationMet": true
    },
    "analysis": {
      "issues": [
        {
          "type": "flow",
          "severity": "medium",
          "description": "Skipped objection handling step",
          "recommendation": "Always address concerns before closing"
        }
      ],
      "recommendations": [
        {
          "category": "opening",
          "suggestedChange": "Add industry context to opening",
          "expectedImpact": "Increase engagement by 10-15%"
        }
      ]
    },
    "transcript": {
      "length": 2847,
      "truncated": false,
      "text": "Agent: Hi John, this is Sarah...\nContact: Hello..."
    }
  }
}
```

### Get Campaign Call Quality Summary
```bash
curl -H "Authorization: Bearer $YOUR_TOKEN" \
  'http://localhost:5000/api/call-intelligence/campaign/{campaignId}?minScore=70&limit=20'
```

### Get Problematic Calls
```bash
curl -H "Authorization: Bearer $YOUR_TOKEN" \
  'http://localhost:5000/api/call-intelligence/problematic/{campaignId}?threshold=60'
```

### Export Data for Analysis
```bash
curl -H "Authorization: Bearer $YOUR_TOKEN" \
  'http://localhost:5000/api/call-intelligence/export/{campaignId}?startDate=2026-01-01&endDate=2026-01-31&format=csv' \
  > call-quality-data.csv
```

## Key Files Added/Modified

### New Files:
- `server/services/call-intelligence-logger.ts` - Core logging service
- `server/routes/call-intelligence-routes.ts` - API endpoints
- `CALL_INTELLIGENCE_COMPLETE.md` - Full documentation

### Modified Files:
- `shared/schema.ts` - Added `callQualityRecords` table
- `server/services/voice-dialer.ts` - Integrated logging on call end
- `server/routes.ts` - Registered new API routes

## What Gets Logged for Every Call

### Automatically Captured:
✅ Call duration
✅ Start/end times
✅ Full transcript
✅ Campaign and contact info
✅ Recording URL (if available)
✅ Telnyx call ID
✅ AI agent used (OpenAI, Gemini, etc.)

### Automatically Analyzed:
✅ Overall quality score (0-100)
✅ Engagement, clarity, empathy, objection handling, qualification, closing scores
✅ Sentiment (positive/neutral/negative)
✅ Engagement level (high/medium/low)
✅ Identity confirmation status
✅ Qualification met status
✅ Campaign alignment
✅ Flow compliance
✅ Disposition accuracy

### Issues Detected:
✅ Script deviations
✅ Missing flow steps
✅ Qualification failures
✅ Tone issues
✅ Timing problems
✅ Compliance violations
✅ Data capture errors

### Recommendations Generated:
✅ Script improvements
✅ Flow enhancements
✅ Qualification techniques
✅ Tone adjustments
✅ Timing improvements
✅ Compliance fixes
✅ Data capture fixes

### Prompt Improvements Suggested:
✅ Specific changes to agent opening
✅ Changes to qualification questions
✅ Improvements to objection handling
✅ Tone and delivery adjustments
✅ Priority (high/medium/low)

## Testing Checklist

- [ ] Run `npm run db:push` successfully
- [ ] Start server with `npm run dev`
- [ ] Make a test call
- [ ] See "✅ Call intelligence logged" in console
- [ ] Call `GET /api/call-intelligence/records/{callSessionId}`
- [ ] Verify response has all fields populated
- [ ] Check scores are between 0-100
- [ ] Verify issues array has content
- [ ] Verify recommendations array has content
- [ ] Check transcript is captured

## Troubleshooting

### Database Push Fails
```
Error: ECONNRESET or connection failed
```
**Solution:**
- Ensure DATABASE_URL is set correctly
- Check database is running
- Try: `psql $DATABASE_URL -c "SELECT 1"`

### No Records Created
```
No records appearing in call_quality_records
```
**Solution:**
- Check server logs for errors
- Verify `npm run db:push` completed
- Check call_sessions table has records
- Verify conversation-quality-analyzer is being called

### Low/Failing Scores
```
Quality scores very low (< 20)
```
**Solution:**
- This is normal for voicemail/no-answer calls
- Check the `issues` field for problems
- Check transcript is populated
- Check disposition is correct

## Next Steps

1. **Review Call Quality**
   - Monitor quality scores daily
   - Review problematic calls
   - Implement recommendations

2. **Fine-Tune Agents**
   - Use suggested prompt updates
   - A/B test new opening scripts
   - Measure impact on scores

3. **Team Training**
   - Review high-issue calls with team
   - Coach on common problems
   - Share best practices from high-scoring calls

4. **Analytics**
   - Export weekly/monthly data
   - Create dashboards
   - Track trends over time

## Performance Expectations

- **Calls analyzed:** 100% (live, test, simulation)
- **Analysis latency:** ~5-10 seconds after call end
- **Accuracy:** High (uses Deepseek/Gemini)
- **Storage:** ~50-100 KB per call record

## Support & Questions

For issues or questions:
1. Check `CALL_INTELLIGENCE_COMPLETE.md` for detailed documentation
2. Review console logs for error messages
3. Check database connection
4. Verify schema was pushed correctly

## Success Indicators

You'll know it's working when:
✅ Every call creates a call_sessions record
✅ Every call creates a call_quality_records record
✅ Quality scores range from 0-100
✅ Issues are identified for problematic calls
✅ Recommendations are specific and actionable
✅ API endpoints return data correctly
✅ Transcripts are captured completely

Good luck! 🚀