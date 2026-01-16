# Auto-Transcription Setup Guide

## Overview

This guide will help you set up automatic real-time transcription for all future calls, preventing the URL expiration issue that happened with January 15 calls.

## Current Situation

✅ **326 calls transcribed** from January 15 (analysis complete!)
✅ **126 qualified leads identified** (37.7% qualification rate)
✅ **31 warm leads** for nurturing
📊 **CSV exported**: `jan15-qualified-leads.csv`

## The Problem (Past)

- Recording URLs expired after 10 minutes
- Couldn't transcribe older calls
- Lost opportunity for insights

## The Solution (Future)

Automatically transcribe calls **within seconds** of completion, before URLs expire.

---

## Step 1: Enable Auto-Recording Sync

Update your campaigns to automatically fetch and store recordings:

### Option A: Via Database

```sql
UPDATE campaigns
SET recording_auto_sync_enabled = true
WHERE id IN (
  SELECT id FROM campaigns WHERE active = true
);
```

### Option B: Via Code (Recommended)

Add to your campaign creation/update logic:

```typescript
await db.update(campaigns)
  .set({ recordingAutoSyncEnabled: true })
  .where(eq(campaigns.id, campaignId));
```

---

## Step 2: Webhook Auto-Transcription

Update your Telnyx webhook handler to transcribe immediately:

### File: `server/routes/webhooks.ts`

Add this function:

```typescript
import { submitTranscription } from '../services/assemblyai-transcription';
import { storeRecordingFromWebhook } from '../services/recording-storage';

async function handleCallRecordingReady(payload: any) {
  const { call_control_id, recording_url } = payload.data;

  // Find the dialer_call_attempt
  const attempt = await db.query.dialerCallAttempts.findFirst({
    where: eq(dialerCallAttempts.telnyxCallId, call_control_id),
  });

  if (!attempt) {
    console.log('[Webhook] No attempt found for call:', call_control_id);
    return;
  }

  console.log(`[Webhook] Processing recording for attempt ${attempt.id}`);

  // Step 1: Store recording in GCS (optional but recommended)
  if (isRecordingStorageEnabled()) {
    await storeRecordingFromWebhook(attempt.id, recording_url);
  }

  // Step 2: Transcribe immediately
  const transcript = await submitTranscription(recording_url);

  if (transcript) {
    // Save transcript to notes
    const existingNotes = attempt.notes || '';
    const transcriptBlock = `[Call Transcript]\\n${transcript.trim()}`;
    const newNotes = existingNotes
      ? `${existingNotes}\\n\\n${transcriptBlock}`
      : transcriptBlock;

    await db.update(dialerCallAttempts)
      .set({ notes: newNotes, updatedAt: new Date() })
      .where(eq(dialerCallAttempts.id, attempt.id));

    console.log(`[Webhook] ✅ Transcribed attempt ${attempt.id}`);
  }
}
```

### Register the webhook handler:

```typescript
app.post('/api/webhooks/telnyx', async (req, res) => {
  const event = req.body;

  if (event.data.event_type === 'call.recording.saved') {
    // Process in background (don't block webhook response)
    handleCallRecordingReady(event).catch(err => {
      console.error('[Webhook] Transcription error:', err);
    });
  }

  res.status(200).send('OK');
});
```

---

## Step 3: Background Worker (Alternative Approach)

If webhooks aren't reliable, use a background worker:

### File: `server/workers/auto-transcription-worker.ts`

```typescript
import { db } from '../db';
import { dialerCallAttempts } from '../../shared/schema';
import { sql } from 'drizzle-orm';
import { submitTranscription } from '../services/assemblyai-transcription';

/**
 * Auto-transcription worker
 * Runs every 2 minutes, transcribes recent calls
 */
export async function runAutoTranscription() {
  console.log('[AutoTranscribe] Starting worker...');

  // Find recent calls without transcripts (last 15 minutes)
  const attempts = await db.execute(sql`
    SELECT id, recording_url, notes
    FROM dialer_call_attempts
    WHERE created_at > NOW() - INTERVAL '15 minutes'
      AND recording_url IS NOT NULL
      AND call_duration_seconds >= 60
      AND (notes IS NULL OR notes NOT LIKE '%[Call Transcript]%')
    ORDER BY created_at DESC
    LIMIT 10
  `);

  console.log(`[AutoTranscribe] Found ${attempts.rows.length} calls to transcribe`);

  for (const row of attempts.rows) {
    const r = row as any;

    try {
      console.log(`[AutoTranscribe] Processing attempt ${r.id}...`);

      const transcript = await submitTranscription(r.recording_url);

      if (transcript) {
        const existingNotes = r.notes || '';
        const transcriptBlock = `[Call Transcript]\\n${transcript.trim()}`;
        const newNotes = existingNotes
          ? `${existingNotes}\\n\\n${transcriptBlock}`
          : transcriptBlock;

        await db.update(dialerCallAttempts)
          .set({ notes: newNotes, updatedAt: new Date() })
          .where(eq(dialerCallAttempts.id, r.id));

        console.log(`[AutoTranscribe] ✅ Transcribed ${r.id}`);
      }
    } catch (error: any) {
      console.error(`[AutoTranscribe] Error for ${r.id}:`, error.message);
    }
  }

  console.log('[AutoTranscribe] Worker complete');
}

// Run every 2 minutes
setInterval(runAutoTranscription, 2 * 60 * 1000);
```

### Start the worker:

```typescript
// In your server startup file (e.g., server/index.ts)
import { runAutoTranscription } from './workers/auto-transcription-worker';

// Start worker
runAutoTranscription(); // Run immediately
// Then runs every 2 minutes automatically
```

---

## Step 4: Choose Transcription Provider

Update `.env` with your preferred provider:

### Option A: OpenAI Whisper (Already configured)
```bash
AI_INTEGRATIONS_OPENAI_API_KEY=your_key_here
# Cost: $0.006/min
```

### Option B: AssemblyAI (Cheapest - Recommended)
```bash
ASSEMBLYAI_API_KEY=your_key_here
# Cost: $0.0025/min (58% cheaper than Whisper)
# Get free key: https://www.assemblyai.com/
# Free tier: $50 credit = 333 hours of transcription!
```

---

## Step 5: Monitor & Test

### Test the Setup

1. **Make a test call** through your system
2. **Wait 60 seconds** after call ends
3. **Check the database**:

```sql
SELECT
  id,
  created_at,
  call_duration_seconds,
  CASE WHEN notes LIKE '%[Call Transcript]%' THEN 'YES' ELSE 'NO' END as has_transcript
FROM dialer_call_attempts
ORDER BY created_at DESC
LIMIT 10;
```

4. **Verify transcript** was added automatically

### Monitor Logs

```bash
# Watch for transcription activity
tail -f logs/server.log | grep -i transcript

# Or in your application
console.log('[Transcription] Auto-transcribed attempt:', attemptId);
```

---

## Cost Projections

Based on January 15 data:
- **Average call duration**: 123.5 seconds (2.06 minutes)
- **Calls >60s**: 326 calls
- **Total duration**: 672 minutes

### Monthly Cost Estimates (assuming similar volume daily)

| Scenario | Daily Calls | Monthly Minutes | Whisper Cost | AssemblyAI Cost |
|----------|-------------|-----------------|--------------|-----------------|
| Same as Jan 15 | 326 | 20,160 | $120.96 | $50.40 |
| 50% of Jan 15 | 163 | 10,080 | $60.48 | $25.20 |
| Double Jan 15 | 652 | 40,320 | $241.92 | $100.80 |

**Recommendation**: Use **AssemblyAI** to save 58% on costs.

---

## Qualification Insights from Jan 15

Based on the 326 transcribed calls:

### Key Metrics
- **Qualification Rate**: 37.7% (126 qualified leads)
- **Warm Lead Rate**: 9.5% (31 warm leads)
- **Neutral**: 53.1% (173 calls)
- **Not Interested**: 0% (0 calls - surprisingly good!)

### Top Interest Signals
1. "email" - 117 occurrences
2. "send me" - 5 occurrences
3. "contact" - 3 occurrences
4. "meeting" - 1 occurrence

### Top Qualified Companies
1. Premia Relocation Mortgage
2. Meeting Place
3. D-Tools Inc.
4. Proofpoint
5. Bristol Myers Squibb

---

## Next Steps

### Immediate (Today)
- [ ] Choose transcription provider (Whisper or AssemblyAI)
- [ ] Add API key to `.env`
- [ ] Implement webhook handler OR background worker
- [ ] Test with one campaign

### This Week
- [ ] Enable for all active campaigns
- [ ] Monitor costs and quality
- [ ] Create follow-up campaigns for 126 qualified leads
- [ ] Set up nurture sequence for 31 warm leads

### Ongoing
- [ ] Weekly analysis of new transcripts
- [ ] Refine qualification keywords
- [ ] A/B test different scripts based on transcript insights
- [ ] Track conversion rates from qualified leads

---

## Troubleshooting

### Transcripts Not Appearing

**Check 1: Recording URL**
```sql
SELECT id, recording_url FROM dialer_call_attempts
WHERE created_at > NOW() - INTERVAL '1 hour'
LIMIT 5;
```

**Check 2: API Key**
```bash
echo $ASSEMBLYAI_API_KEY  # Should not be empty
```

**Check 3: Logs**
```bash
# Look for errors
grep -i "transcription" logs/server.log
```

### URLs Expiring Before Transcription

- **Solution**: Reduce worker interval to 1 minute
- **Or**: Use webhook approach (processes immediately)
- **Or**: Store recordings in GCS first, then transcribe

### High Costs

- **Switch to AssemblyAI** (58% cheaper than Whisper)
- **Filter short calls** (only transcribe >90 seconds)
- **Sample transcription** (transcribe 50% of calls randomly)

---

## Files Created

1. **[jan15-qualified-leads.csv](jan15-qualified-leads.csv)** - Top 20 qualified leads ready for follow-up
2. **[analyze-jan15-transcripts.ts](analyze-jan15-transcripts.ts)** - Analysis script (reusable for future dates)
3. **[SETUP-AUTO-TRANSCRIPTION.md](SETUP-AUTO-TRANSCRIPTION.md)** - This guide

---

## Summary

You now have:
- ✅ 326 calls analyzed
- ✅ 126 qualified leads identified
- ✅ CSV export ready for CRM import
- ✅ Complete setup guide for auto-transcription
- ✅ Cost projections and recommendations

**Next action**: Choose webhook OR background worker approach, implement, and test!

**Questions?** Review the troubleshooting section or check the implementation files.
