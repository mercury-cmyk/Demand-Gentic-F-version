# Staging Environment Testing Guide

## Overview
Step-by-step guide to test the voicemail detection improvements in staging before production deployment.

---

## Pre-Testing Setup

### 1. Deploy to Staging Environment

```bash
# Navigate to project directory
cd c:/Users/Zahid/Downloads/DemandEarn-AI

# Build the project
npm run build

# Deploy to staging (adjust based on your deployment method)
# Option A: PM2
pm2 restart all

# Option B: Direct node
node dist/server/index.js

# Option C: Docker
docker-compose up -d --build
```

### 2. Verify Deployment

```bash
# Check that the service is running
pm2 status

# Check logs for any startup errors
pm2 logs --lines 50

# Verify database connection
npx tsx -e "
import { db } from './server/db';
import { sql } from 'drizzle-orm';
db.execute(sql\`SELECT 1\`).then(() => console.log('✅ Database connected')).then(() => process.exit(0));
"
```

---

## Automated Testing

### Run the Staging Test Suite

```bash
# Run the automated test script
npx tsx test-voicemail-fixes-staging.ts
```

**Expected Output**:
```
🚀 Starting Staging Environment Tests
======================================================================

🔍 Verifying code changes are deployed...

  ✅ IVR loop tracking fields
  ✅ IVR loop detection logic
  ✅ 60-second timeout
  ✅ Human detection flag

✅ Code changes verified

======================================================================

📊 Test 1: Analyzing recent voicemail calls...
...

======================================================================
📊 STAGING TEST REPORT
======================================================================

Total Tests: 5
Passed: 5
Failed: 0
Success Rate: 100.0%

✅ ALL TESTS PASSED - Ready for production
```

---

## Manual Testing

### Test 1: Voicemail Detection (Basic)

**Objective**: Verify call ends within 60s when reaching voicemail

**Steps**:
1. Identify a test phone number that goes to voicemail
2. Initiate a call through the system:
   ```bash
   # Using API
   curl -X POST http://localhost:5000/api/ai/initiate \
     -H "Content-Type: application/json" \
     -d '{
       "campaignId": "your-campaign-id",
       "contactId": "your-contact-id",
       "phoneNumber": "+1-202-555-0100"
     }'
   ```

3. Monitor the call in logs:
   ```bash
   # Watch logs in real-time
   pm2 logs --lines 0 | grep -E "(VOICEMAIL|NO HUMAN|Call.*completed)"
   ```

4. Record the call duration when it ends

**Success Criteria**:
- ✅ Call duration: 30-65 seconds
- ✅ Disposition: `voicemail`
- ✅ Log shows: "VOICEMAIL DETECTED" or "NO HUMAN DETECTED"
- ✅ No errors in logs

**Test Log**:
```
Date/Time: _______________
Phone: ___________________
Duration: _______ seconds
Disposition: _____________
Logs: ✅ / ❌
Result: PASS / FAIL
Notes: ___________________
```

---

### Test 2: IVR Loop Detection

**Objective**: Verify detection of repeating IVR menus

**Steps**:
1. Call a number with voicemail message options:
   - "Press 1 to listen, press 2 to re-record..."
2. Let the AI hear the menu repeat at least 2 times
3. Monitor logs for IVR detection

**Success Criteria**:
- ✅ Call ends after 2nd menu repeat
- ✅ Duration: 40-60 seconds
- ✅ Log shows: "IVR menu repeated X times"
- ✅ Disposition: `voicemail`

**Test Log**:
```
Date/Time: _______________
Phone: ___________________
Menu Repeats: _____ times
Duration: _______ seconds
Result: PASS / FAIL
Notes: ___________________
```

---

### Test 3: Human Detection (No False Positives)

**Objective**: Verify timeout does NOT trigger when human answers

**Steps**:
1. Have a team member answer a test call
2. Let them respond: "Hello, this is [name] speaking"
3. Continue conversation for 90+ seconds
4. End call normally

**Success Criteria**:
- ✅ Log shows: "✅ HUMAN DETECTED"
- ✅ Call continues past 60 seconds
- ✅ Disposition: `qualified_lead`, `not_interested`, or `do_not_call`
- ✅ 60s timeout does NOT trigger

**Test Log**:
```
Date/Time: _______________
Tester: __________________
Human Detected: YES / NO
Duration: _______ seconds
Disposition: _____________
Timeout Triggered: YES / NO
Result: PASS / FAIL
Notes: ___________________
```

---

### Test 4: No Answer Timeout

**Objective**: Verify call ends at 60s when no one answers

**Steps**:
1. Call a number that rings but doesn't answer
2. Let it ring for full 60+ seconds
3. Monitor for automatic timeout

**Success Criteria**:
- ✅ Call ends at 60-62 seconds
- ✅ Disposition: `no_answer`
- ✅ Log shows: "NO HUMAN DETECTED - Ending call after 60s"

**Test Log**:
```
Date/Time: _______________
Phone: ___________________
Duration: _______ seconds
Disposition: _____________
Result: PASS / FAIL
Notes: ___________________
```

---

### Test 5: Existing Functionality (Regression)

**Objective**: Verify changes don't break existing features

**Test Cases**:

| Feature | Test | Result | Notes |
|---------|------|--------|-------|
| Qualified Lead | Human conversation → disposition | ⬜ | |
| Not Interested | "Not interested" → disposition | ⬜ | |
| Do Not Call | "Don't call again" → DNC | ⬜ | |
| DTMF Sending | Navigate IVR with digits | ⬜ | |
| Call Summary | AI generates summary | ⬜ | |
| Transcripts | Conversation transcribed | ⬜ | |
| Lead Creation | Lead record created | ⬜ | |

**Instructions**:
For each feature, make a test call and verify it works as before.

---

## Log Monitoring

### Real-Time Log Monitoring

```bash
# Monitor for voicemail detection
pm2 logs | grep -E "(VOICEMAIL|IVR menu|NO HUMAN)"

# Monitor for human detection
pm2 logs | grep "HUMAN DETECTED"

# Monitor for timeout triggers
pm2 logs | grep "Ending call.*after.*60s"

# Monitor for errors
pm2 logs --err
```

### Key Log Patterns to Look For

**✅ Good Patterns (Expected)**:
```
[OpenAI-Realtime] VOICEMAIL DETECTED via transcript: "leave a message after the tone"
[OpenAI-Realtime] IVR menu repeated 2 times
[OpenAI-Realtime] VOICEMAIL DETECTED - IVR menu repeating
[OpenAI-Realtime] NO HUMAN DETECTED - Ending call after 60s
[OpenAI-Realtime] ✅ HUMAN DETECTED for call {id}
```

**❌ Bad Patterns (Issues)**:
```
Error: Cannot read property 'ivrMenuRepeatCount'
TypeError: session.audioDetection is undefined
Call failed unexpectedly at 30s
MaxListenersExceededWarning
```

---

## Database Verification

### Check Recent Call Metrics

```bash
# Run monitoring report
npx tsx -e "
import { generateDailyReport } from './server/services/call-monitoring-service';
generateDailyReport(new Date()).then(r => console.log(r)).then(() => process.exit(0));
"
```

### Query Recent Calls

```sql
-- Voicemail calls in last hour
SELECT
  id,
  call_duration_seconds,
  disposition,
  created_at
FROM dialer_call_attempts
WHERE created_at >= NOW() - INTERVAL '1 hour'
  AND disposition = 'voicemail'
ORDER BY call_duration_seconds DESC;

-- Human calls in last hour
SELECT
  id,
  call_duration_seconds,
  disposition,
  created_at
FROM dialer_call_attempts
WHERE created_at >= NOW() - INTERVAL '1 hour'
  AND disposition IN ('qualified_lead', 'not_interested', 'do_not_call')
ORDER BY created_at DESC;

-- Calls ending at ~60s
SELECT
  COUNT(*) as count,
  AVG(call_duration_seconds) as avg_duration
FROM dialer_call_attempts
WHERE created_at >= NOW() - INTERVAL '1 hour'
  AND call_duration_seconds BETWEEN 58 AND 62
  AND disposition IN ('voicemail', 'no_answer');
```

---

## Performance Testing

### Load Test (Optional)

```bash
# Make 10 concurrent test calls
for i in {1..10}; do
  curl -X POST http://localhost:5000/api/ai/initiate \
    -H "Content-Type: application/json" \
    -d "{
      \"campaignId\": \"test-campaign\",
      \"contactId\": \"test-contact-$i\",
      \"phoneNumber\": \"+1-202-555-010$i\"
    }" &
done
wait

# Monitor all calls complete successfully
pm2 logs --lines 50 | grep "Call.*completed"
```

**Success Criteria**:
- ✅ All 10 calls complete
- ✅ No memory leaks
- ✅ No race conditions
- ✅ Correct disposition for each

---

## Monitoring API Test

### Test Monitoring Endpoints

```bash
# Health check
curl http://localhost:5000/api/monitoring/calls/health | jq

# Expected output:
{
  "success": true,
  "status": "healthy",
  "severity": "none",
  "alerts": [],
  "metrics": {
    "totalCalls": 25,
    "humanDetectionRate": 20.5,
    "avgVoicemailDuration": 58.3
  }
}

# Get metrics
curl http://localhost:5000/api/monitoring/calls/metrics | jq

# Check false positives
curl http://localhost:5000/api/monitoring/calls/false-positives | jq

# Voicemail efficiency
curl http://localhost:5000/api/monitoring/calls/voicemail-efficiency | jq
```

---

## Issue Troubleshooting

### Issue: Timeout Not Triggering

**Symptoms**: Calls still lasting 90+ seconds to voicemail

**Check**:
```bash
# Verify code changes are deployed
grep -n "MAX_DURATION_WITHOUT_HUMAN_SECONDS" server/services/openai-realtime-dialer.ts

# Check if humanDetected flag is being set
pm2 logs | grep "HUMAN DETECTED"
```

**Fix**:
- Redeploy code changes
- Restart services: `pm2 restart all`

---

### Issue: False Positives (Humans Marked as Voicemail)

**Symptoms**: Real conversations being cut off at 60s

**Check**:
```bash
# Query suspicious calls
npx tsx -e "
import { detectPotentialFalsePositives } from './server/services/call-monitoring-service';
detectPotentialFalsePositives(2).then(r => console.log('False positives:', r.length)).then(() => process.exit(0));
"
```

**Fix**:
- Review `detectAudioType` function
- Increase timeout to 75s temporarily
- Check human speech detection logic

---

### Issue: IVR Loop Not Detected

**Symptoms**: Calls stuck in IVR menus for 90+ seconds

**Check**:
```bash
# Check logs for IVR detection
pm2 logs | grep "IVR menu repeated"

# Verify IVR patterns in code
grep -A5 "ivrMenuRepeatCount" server/services/openai-realtime-dialer.ts
```

**Fix**:
- Verify IVR detection logic deployed
- Check transcript contains "press" and "message"
- Reduce repeat threshold from 2 to 1 if needed

---

## Staging Sign-Off Checklist

### Before Approving for Production

- [ ] Automated tests pass (5/5)
- [ ] Manual Test 1 (Voicemail) - PASS
- [ ] Manual Test 2 (IVR Loop) - PASS
- [ ] Manual Test 3 (Human Detection) - PASS
- [ ] Manual Test 4 (No Answer) - PASS
- [ ] Manual Test 5 (Regression) - All PASS
- [ ] No errors in logs
- [ ] Average voicemail duration < 65s
- [ ] No false positives detected
- [ ] Monitoring APIs working
- [ ] Performance acceptable (load test)

### Sign-Off

**Tested By**: _______________________
**Date**: ___________________________
**Environment**: Staging
**Version**: ________________________

**Result**: ⬜ APPROVED FOR PRODUCTION / ⬜ ISSUES FOUND

**Notes**:
```
__________________________________________________________________
__________________________________________________________________
__________________________________________________________________
```

---

## Next Steps

### If Tests Pass ✅
1. Document any observations
2. Complete sign-off checklist
3. Schedule production deployment
4. Prepare rollback plan
5. Alert team of deployment window

### If Tests Fail ❌
1. Document all failures
2. Review logs for errors
3. Fix issues in code
4. Redeploy to staging
5. Rerun full test suite

---

## Quick Reference Commands

```bash
# Deploy to staging
npm run build && pm2 restart all

# Run automated tests
npx tsx test-voicemail-fixes-staging.ts

# Monitor logs
pm2 logs --lines 0 | grep -E "(VOICEMAIL|HUMAN DETECTED|NO HUMAN)"

# Check recent calls
npx tsx -e "import { generateDailyReport } from './server/services/call-monitoring-service'; generateDailyReport(new Date()).then(console.log).then(() => process.exit(0));"

# Health check
curl http://localhost:5000/api/monitoring/calls/health

# Restart services
pm2 restart all

# View errors
pm2 logs --err
```

---

**Testing Guide Version**: 1.0
**Last Updated**: January 16, 2026
**Status**: Ready for Use
