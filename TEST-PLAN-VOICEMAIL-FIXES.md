# Test Plan - Voicemail Detection Improvements

## Overview
Test plan for validating the 60-second timeout and IVR loop detection fixes implemented in `openai-realtime-dialer.ts`.

---

## Pre-Deployment Checklist

### Code Review
- [x] TypeScript compilation passes without errors
- [x] No breaking changes to existing functionality
- [x] New state fields properly initialized
- [x] All edge cases handled (null checks, disposition already set)

### Dependencies
- [x] No new npm packages required
- [x] Backward compatible with existing call data
- [x] Database schema unchanged (no migrations needed)

---

## Test Scenarios

### Test 1: Voicemail Detection - Basic Flow
**Objective**: Verify call ends within 60s when voicemail detected

**Setup**:
1. Initiate call to known voicemail number
2. Monitor logs for detection signals

**Expected Behavior**:
```
[0s] Call initiated
[5s] Call connected
[10-30s] AI greeting sent
[30-45s] Voicemail message plays
[45-60s] Transcript: "leave a message after the tone"
[45-60s] ✅ VOICEMAIL DETECTED
[45-60s] Call ended with disposition: voicemail
```

**Success Criteria**:
- ✅ Call duration < 65 seconds
- ✅ Disposition = `voicemail`
- ✅ Log shows: "VOICEMAIL DETECTED via transcript"
- ✅ No errors in logs

**Test Numbers** (known voicemail):
- US: `+1-202-555-0100` (test voicemail)
- UK: `+44-20-7946-0958` (test voicemail)

---

### Test 2: IVR Menu Loop Detection
**Objective**: Verify call ends when IVR menu repeats 2+ times

**Setup**:
1. Call number that goes to voicemail message options
2. Let AI hear: "Press 1 to listen, press 2 to re-record..."

**Expected Behavior**:
```
[0s] Call initiated
[30s] IVR menu: "To listen to your message, press 1..."
[40s] IVR menu repeats (count: 1)
[50s] IVR menu repeats (count: 2)
[50s] ✅ VOICEMAIL DETECTED - IVR menu repeating
[50s] Call ended with disposition: voicemail
```

**Success Criteria**:
- ✅ Call ends after 2nd menu repeat
- ✅ Call duration < 60 seconds
- ✅ Log shows: "IVR menu repeated X times"
- ✅ Log shows: "VOICEMAIL DETECTED - IVR menu repeating"
- ✅ Disposition = `voicemail`

---

### Test 3: 60-Second Timeout - No Human Detected
**Objective**: Verify call ends at 60s if no human speech detected

**Setup**:
1. Call number that rings continuously (no answer)
2. Monitor for timeout trigger

**Expected Behavior**:
```
[0s] Call initiated
[5s] Call ringing
[60s] ⚠️ NO HUMAN DETECTED - Ending call after 60s
[60s] Log: "Audio patterns detected: [silence, unknown]"
[60s] Disposition set to: no_answer
[60s] Call ended
```

**Success Criteria**:
- ✅ Call duration = 60-62 seconds (accounting for processing)
- ✅ Log shows: "NO HUMAN DETECTED"
- ✅ Disposition = `no_answer` (or `voicemail` if IVR detected)
- ✅ Audio patterns logged

---

### Test 4: Human Detection - Normal Flow
**Objective**: Verify timeout does NOT trigger when human answers

**Setup**:
1. Call number where human answers
2. Verify human detection flag is set

**Expected Behavior**:
```
[0s] Call initiated
[5s] Human answers: "Hello?"
[10s] ✅ HUMAN DETECTED for call {id}
[10-300s] Normal conversation continues
[varies] Call ends normally with appropriate disposition
```

**Success Criteria**:
- ✅ Log shows: "✅ HUMAN DETECTED"
- ✅ `humanDetected = true` in session state
- ✅ `humanDetectedAt` timestamp recorded
- ✅ 60s timeout does NOT trigger
- ✅ Call continues normally
- ✅ Disposition based on conversation (qualified_lead, not_interested, etc.)

---

### Test 5: Edge Case - Human Speaks After 58 Seconds
**Objective**: Verify timeout doesn't trigger if human detected just before 60s

**Setup**:
1. Call with long intro (IVR navigation)
2. Human answers at 58 seconds

**Expected Behavior**:
```
[0-58s] IVR menu navigation
[58s] Human voice detected
[58s] ✅ HUMAN DETECTED
[58-300s] Normal conversation continues
```

**Success Criteria**:
- ✅ 60s timeout does NOT trigger
- ✅ Call continues past 60 seconds
- ✅ Human detection flag set correctly

---

### Test 6: Edge Case - Disposition Already Set
**Objective**: Verify timeout doesn't override existing disposition

**Setup**:
1. Call where AI submits disposition before 60s
2. Monitor timeout behavior

**Expected Behavior**:
```
[0s] Call initiated
[45s] AI submits disposition: qualified_lead
[60s] Timeout check: disposition already set, skip
[varies] Call ends normally with qualified_lead
```

**Success Criteria**:
- ✅ Existing disposition preserved
- ✅ Timeout check skips if disposition set
- ✅ No conflicting disposition updates

---

### Test 7: Regression - Existing Functionality
**Objective**: Verify changes don't break existing call flow

**Test Cases**:
1. ✅ Normal qualified lead call still works
2. ✅ Not interested disposition still works
3. ✅ Do not call still works
4. ✅ Callback requests still work
5. ✅ Transfer to human still works
6. ✅ DTMF sending still works
7. ✅ Call summaries still generated
8. ✅ Transcripts still captured

**Success Criteria**:
- All existing functionality unchanged
- No regressions in disposition processing
- Lead creation still works for qualified calls

---

## Load Testing

### Test 8: Concurrent Calls
**Objective**: Verify fixes work under load

**Setup**:
1. Initiate 10 concurrent calls (5 to voicemail, 5 to humans)
2. Monitor all calls complete correctly

**Success Criteria**:
- ✅ All voicemail calls end within 60s
- ✅ All human calls continue normally
- ✅ No race conditions or state corruption
- ✅ Correct disposition for each call

---

## Monitoring & Metrics

### Metrics to Track (First 24 Hours)

| Metric | Target | Alert Threshold |
|--------|--------|-----------------|
| Avg voicemail call duration | <60s | >75s |
| % calls with human detected | 15-25% | <10% or >40% |
| Calls ended at 60s timeout | 50-75% | >90% |
| False positives (human marked as VM) | <2% | >5% |
| Call completion rate | >95% | <90% |

### Daily Reports
Generate report showing:
```sql
-- Voicemail call duration trends
SELECT
  DATE(created_at) as date,
  AVG(call_duration_seconds) as avg_duration,
  MIN(call_duration_seconds) as min_duration,
  MAX(call_duration_seconds) as max_duration,
  COUNT(*) as total_calls
FROM dialer_call_attempts
WHERE disposition = 'voicemail'
  AND created_at >= NOW() - INTERVAL '7 days'
GROUP BY DATE(created_at)
ORDER BY date DESC;

-- Human detection rate
SELECT
  DATE(created_at) as date,
  COUNT(*) FILTER (WHERE disposition IN ('qualified_lead', 'not_interested')) as human_calls,
  COUNT(*) FILTER (WHERE disposition IN ('voicemail', 'no_answer')) as non_human_calls,
  ROUND(100.0 * COUNT(*) FILTER (WHERE disposition IN ('qualified_lead', 'not_interested')) / COUNT(*), 2) as human_rate_pct
FROM dialer_call_attempts
WHERE created_at >= NOW() - INTERVAL '7 days'
GROUP BY DATE(created_at)
ORDER BY date DESC;
```

---

## Rollback Plan

### Rollback Triggers
Rollback immediately if:
1. ❌ >10% of human calls marked as voicemail (false positives)
2. ❌ Call completion rate drops below 85%
3. ❌ Critical errors in logs related to timeout logic
4. ❌ Lead creation stops working

### Rollback Procedure
```bash
# 1. Revert changes
git revert <commit-hash>

# 2. Redeploy
npm run build
pm2 restart all

# 3. Verify rollback
# Check that old behavior restored (no 60s timeout)

# 4. Notify team
# Alert that rollback completed
```

### Quick Fix Options
If partial rollback needed:
1. Increase timeout from 60s to 90s (reduce false positives)
2. Disable IVR loop detection only
3. Require 3+ menu repeats instead of 2

---

## Sign-Off Checklist

### Pre-Production
- [ ] All test scenarios passed
- [ ] No TypeScript errors
- [ ] Code review completed
- [ ] Test numbers validated
- [ ] Monitoring dashboard configured
- [ ] Alerts configured
- [ ] Rollback plan reviewed

### Production Deployment
- [ ] Deploy during low-traffic window
- [ ] Monitor logs for first hour
- [ ] Check first 10 calls manually
- [ ] Verify metrics after 4 hours
- [ ] Full team review after 24 hours

### Post-Deployment (Day 1)
- [ ] Average voicemail duration <65s ✅
- [ ] No false positives detected ✅
- [ ] Lead creation still working ✅
- [ ] No critical errors ✅

### Post-Deployment (Week 1)
- [ ] Metrics stable and within targets ✅
- [ ] Cost savings confirmed ✅
- [ ] User feedback positive ✅
- [ ] No rollback needed ✅

---

## Test Execution Log

### Test Run #1 - Pre-Production
**Date**: _________________
**Tester**: _________________
**Environment**: Staging

| Test # | Scenario | Result | Duration | Notes |
|--------|----------|--------|----------|-------|
| 1 | Voicemail basic | ⬜ | _____s | |
| 2 | IVR loop | ⬜ | _____s | |
| 3 | 60s timeout | ⬜ | _____s | |
| 4 | Human detection | ⬜ | _____s | |
| 5 | Late human | ⬜ | _____s | |
| 6 | Disposition set | ⬜ | _____s | |
| 7 | Regression | ⬜ | N/A | |
| 8 | Load test | ⬜ | N/A | |

**Overall Result**: ⬜ PASS / ⬜ FAIL
**Notes**: ________________________________________________

---

## Appendix: Log Examples

### Expected Log - Voicemail Detected
```
[OpenAI-Realtime] User: leave a message after the tone
[AudioDetect] VOICEMAIL PATTERN MATCHED: "leave a message after the tone"
[OpenAI-Realtime] VOICEMAIL DETECTED via transcript: "leave a message after the tone..."
[OpenAI-Realtime] Immediately ending call 12345 - NO voicemail will be left
[OpenAI-Realtime] Ending call: 12345, outcome: voicemail, disposition: voicemail
```

### Expected Log - IVR Loop
```
[AudioDetect] IVR DETECTED: "to listen to your message"
[OpenAI-Realtime] IVR menu repeated 1 times
[AudioDetect] IVR DETECTED: "to listen to your message"
[OpenAI-Realtime] IVR menu repeated 2 times
[OpenAI-Realtime] VOICEMAIL DETECTED - IVR menu repeating (likely voicemail message options)
[OpenAI-Realtime] Immediately ending call 12345
```

### Expected Log - 60s Timeout
```
[OpenAI-Realtime] NO HUMAN DETECTED - Ending call 12345 after 60s without human response
[OpenAI-Realtime] Audio patterns detected: ivr, silence, ivr
[OpenAI-Realtime] Setting disposition to voicemail (IVR detected without human)
[OpenAI-Realtime] Ending call: 12345, outcome: voicemail, disposition: voicemail
```

### Expected Log - Human Detected
```
[AudioDetect] Analyzing: "yes this is john speaking"
[OpenAI-Realtime] User: yes this is john speaking
[OpenAI-Realtime] ✅ HUMAN DETECTED for call 12345 at 2026-01-16T10:30:45.123Z
```

---

## Contact & Support

**Primary Contact**: Engineering Team
**Slack Channel**: #ai-voice-engineering
**On-Call**: [Rotation Schedule]

**Escalation Path**:
1. Check logs first
2. Review monitoring dashboard
3. Contact on-call engineer
4. Initiate rollback if critical

---

**Document Version**: 1.0
**Last Updated**: January 16, 2026
**Next Review**: After 1 week in production
