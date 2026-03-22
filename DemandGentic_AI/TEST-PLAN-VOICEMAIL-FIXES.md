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
- ✅ Call duration 75s |
| % calls with human detected | 15-25% | 40% |
| Calls ended at 60s timeout | 50-75% | >90% |
| False positives (human marked as VM) | 5% |
| Call completion rate | >95% | = NOW() - INTERVAL '7 days'
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
git revert 

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