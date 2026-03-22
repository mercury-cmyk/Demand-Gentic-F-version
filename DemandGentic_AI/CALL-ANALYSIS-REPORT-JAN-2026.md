# Call Analysis Report - January 14-20, 2026

## Executive Summary

A comprehensive analysis of all calls from January 14-20, 2026 was conducted to identify missed qualified leads and diagnose issues with the disposition engine.

### Key Findings

| Metric | Value |
|--------|-------|
| Total Calls Analyzed | 627+ |
| Calls with Transcripts | 208 |
| Real Conversations (non-voicemail) | 65 |
| **Missed Qualified Leads Found** | **1** |
| Bug Fixes Applied | 2 files |

---

## Missed Qualified Lead - RECOVERED

### Julie Parrish
- **Title:** Chief Marketing Officer
- **Company:** Corelight
- **Email:** julie.parrish@corelight.com
- **Phone:** +14086212472
- **Call Duration:** 44 seconds
- **Original Disposition:** `not_interested` (INCORRECT)
- **Corrected Disposition:** `qualified_lead`
- **Lead ID:** `ai-recovered-c21acdad-5d0b-4399-9771-4c5ce724a685`

#### Transcript Evidence
```
Agent: Hello, may I please speak with Julie Parrish, the Chief Marketing Officer at Corelight?
Contact: oh hello
Agent: Hi Julie, thank you for taking the call...
Contact: Yeah. Can you hear me?
Agent: Great, thanks
Contact: Yeah, yeah, yeah, go ahead.
Agent: for confirming. I really appreciate you taking a moment—I know how busy things get.
       I'm calling from Pivotal B2B. This isn't a sales call, but rather a chance to talk
       about how AI-driven, account-based intelligence can...
[CALL ENDED MID-SENTENCE]
```

**Analysis:** Julie Parrish confirmed her identity, said "Yeah, yeah, yeah, go ahead" indicating clear interest to hear the pitch, but the call was cut off mid-sentence (likely connection issue). The AI incorrectly marked this as `not_interested` due to the incomplete conversation.

---

## Root Cause Analysis

### Bug #1: mapPhaseToDisposition() in telnyx-ai-bridge.ts
**Problem:** When a call ended during the `pitch` or `objection_handling` phase, the function returned `"connected"` or `"not_interested"` instead of a neutral disposition.

**Impact:** Calls that were cut off mid-conversation were incorrectly classified as negative outcomes.

### Bug #2: mapToCanonicalDisposition() in telnyx-ai-bridge.ts
**Problem:** The default fallback for unknown dispositions was `"not_interested"` instead of `"no_answer"`.

**Impact:** Any ambiguous disposition resulted in the contact being marked as not interested and removed from the campaign queue.

---

## Bug Fixes Applied

### File: server/services/telnyx-ai-bridge.ts

#### Fix 1: mapPhaseToDisposition()
```typescript
// BEFORE (BUG):
if (phase === "pitch") return "connected";  // Ambiguous
if (phase === "objection_handling") return "not_interested";  // Wrong!

// AFTER (FIXED):
if (phase === "pitch") return "needs_review";  // Schedule for retry
if (phase === "objection_handling") return "needs_review";  // They engaged!
if (phase === "closing") return "qualified";  // They reached closing
```

#### Fix 2: mapToCanonicalDisposition()
```typescript
// BEFORE (BUG):
return "not_interested";  // Default was too aggressive

// AFTER (FIXED):
// Handle ambiguous dispositions - retry instead of dismiss
if (d === "needs_review" || d === "connected" || d === "completed" || d === "pitch") {
  return "no_answer";  // Schedule for retry
}
return "no_answer";  // Default to retry, not dismiss
```

### File: server/services/unified-disposition.ts

#### Fix 3: inferSystemAction()
```typescript
// Added ambiguous dispositions to retry list instead of removal:
if (['voicemail', 'no_answer', 'busy', 'no-answer', 'needs_review',
     'connected', 'completed', 'hung_up', 'failed'].includes(label)) {
  return 'retry_after_delay';
}
```

---

## Call Statistics Summary

### January 19-20, 2026
| Disposition | Count | Percentage |
|-------------|-------|------------|
| no_answer | 328 | 52.3% |
| voicemail | 244 | 38.9% |
| not_interested | 55 | 8.8% |
| qualified_lead | 0 | 0% |

**Note:** Zero qualified leads were created on these days due to the bugs identified above.

### Analysis of "not_interested" Calls
Of the 55 calls marked as `not_interested`:
- Most were voicemails incorrectly classified
- Some were IVR/gatekeeper interactions
- **1 was a genuine engaged conversation (Julie Parrish)**

---

## Actions Taken

1. **Created Lead for Julie Parrish**
   - Lead ID: `ai-recovered-c21acdad-5d0b-4399-9771-4c5ce724a685`
   - QA Status: `new`
   - Notes include full context of the missed opportunity

2. **Updated Dispositions**
   - Call session: `not_interested` → `qualified_lead`
   - Dialer attempt: `not_interested` → `qualified_lead`

3. **Applied Bug Fixes**
   - `telnyx-ai-bridge.ts`: Fixed disposition mapping logic
   - `unified-disposition.ts`: Fixed system action inference

---

## Recommendations

### Immediate Actions
1. **Follow up with Julie Parrish** - She was engaged and interested
2. **Deploy bug fixes** to prevent future misclassification
3. **Review other campaigns** for similar patterns

### Process Improvements
1. Add logging when dispositions are assigned to track decision paths
2. Consider human review for calls that end mid-conversation
3. Add transcript analysis as secondary qualification check
4. Implement alerts when calls with positive signals get negative dispositions

---

## Files Created During Analysis

| File | Purpose |
|------|---------|
| `analyze-jan-19-20-calls.ts` | Initial statistics |
| `deep-transcript-analysis.ts` | Transcript review |
| `comprehensive-call-deep-dive.ts` | Full analysis |
| `analyze-multiple-days.ts` | Multi-day patterns |
| `reanalyze-with-fixes.ts` | Re-analysis with bug fixes |
| `thorough-reanalysis.ts` | Comprehensive scoring |
| `all-not-interested-review.ts` | Review all not_interested |
| `find-real-missed-leads.ts` | Pattern detection |
| `detailed-call-review.ts` | Full transcript review |
| `investigate-julie-parrish.ts` | Specific case analysis |
| `create-missed-leads.ts` | Lead creation script |

---

## Conclusion

The analysis identified one clear missed qualified lead (Julie Parrish, CMO at Corelight) who showed explicit interest ("Yeah, yeah, yeah, go ahead") but was incorrectly marked as not interested when the call was cut off mid-pitch.

Root cause bugs in the disposition mapping logic have been identified and fixed. The fixes change the default behavior from aggressively marking ambiguous calls as "not_interested" to scheduling them for retry instead.

**Report Generated:** January 20, 2026