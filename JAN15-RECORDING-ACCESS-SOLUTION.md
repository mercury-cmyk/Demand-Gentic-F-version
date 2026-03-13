# January 15 Recordings - Access & Transcription Solution

## Current Status

✅ **GCS Configured**: `demandgentic-prod-storage-2026` bucket ready
✅ **Calls to transcribe**: 596 calls (115 already done)
❌ **Recording URLs**: Expired (AWS S3 pre-signed URLs from `telephony-recorder-prod`)

## The Problem

The recording URLs in your database look like this:
```
https://s3.amazonaws.com/telephony-recorder-prod/57bd0f26-ee4a-46e5-961e-baeb66744372/2026-01-15/...
?X-Amz-Algorithm=AWS4-HMAC-SHA256
&X-Amz-Expires=600  ← 10 minute expiry!
&X-Amz-Date=20260116T...
&X-Amz-Signature=...
```

These are **pre-signed S3 URLs** that expired 10 minutes after they were generated. They cannot be refreshed from Telnyx because the call IDs have also expired (422 errors).

## Solution Options

### Option 1: Access telephony-recorder-prod Bucket Directly ⭐ (Recommended)

If you have AWS credentials for the `telephony-recorder-prod` S3 bucket, we can:

1. **List recordings** from the bucket directly (bypass signed URLs)
2. **Download recordings** to your GCS bucket for permanent storage
3. **Generate fresh 7-day presigned URLs** from your GCS
4. **Transcribe all 596 calls** for ~$3.57 (Whisper) or ~$1.49 (AssemblyAI)

**What you need:**
- AWS Access Key ID for `telephony-recorder-prod` bucket
- AWS Secret Access Key
- Read permissions on the bucket

**If you have credentials, add to `.env`:**
```bash
TELEPHONY_RECORDER_AWS_ACCESS_KEY_ID=your_key_here
TELEPHONY_RECORDER_AWS_SECRET_ACCESS_KEY=your_secret_here
TELEPHONY_RECORDER_AWS_REGION=us-east-1
TELEPHONY_RECORDER_AWS_BUCKET=telephony-recorder-prod
```

### Option 2: Contact Telephony Recording Service Provider

The recordings are stored by a third-party service (`telephony-recorder-prod`).

**Action items:**
1. Identify the service provider (check your telephony/SIP provider documentation)
2. Request bulk export or API access to January 15 recordings
3. Ask for:
   - Bulk download link (ZIP file)
   - Fresh signed URLs with longer expiry (24+ hours)
   - API credentials for programmatic access

### Option 3: Use Real-Time Transcription Going Forward

Accept that Jan 15 recordings are inaccessible, but prevent this from happening again:

1. **Enable automatic transcription** within webhook
2. **Store recordings in GCS** immediately upon call completion
3. **Transcribe within 10 minutes** before URLs expire

**Implementation:**
```typescript
// In your Telnyx webhook handler
await storeRecordingFromWebhook(leadId, recordingUrl);
await transcribeLeadCall(leadId);
```

### Option 4: Focus on Already Transcribed Calls

You have **115 transcribed calls** from January 15. You can:

1. Analyze these for insights
2. Extract qualified leads
3. Evaluate conversation quality
4. Train your AI models

**Run analysis:**
```bash
npx tsx analyze-transcripts-manual.ts
npx tsx check-qualified-leads.ts
npx tsx find-real-conversations.ts
```

## Recommended Next Steps

### Immediate (Choose One):

**If you have telephony provider credentials:**
```bash
# I'll create a script to:
# 1. Access recordings directly from S3
# 2. Store in your GCS bucket
# 3. Transcribe all 596 calls
# REPLY: "I have AWS credentials"
```

**If you don't have credentials but want to try getting them:**
```bash
# Contact your telephony/SIP provider
# Ask for: "AWS S3 access to January 15, 2026 call recordings"
# Bucket: telephony-recorder-prod
# REPLY: "I'll contact the provider"
```

**If you want to move forward without Jan 15:**
```bash
# Set up automatic real-time transcription
# Focus on transcribing future calls
# REPLY: "Skip Jan 15, focus on future calls"
```

## Cost Analysis (If Recordings Were Accessible)

| Provider | Cost/min | Total Cost (596 calls, ~993 min) |
|----------|----------|----------------------------------|
| **AssemblyAI** | $0.0025 | **$2.48** (Cheapest) |
| **Whisper** | $0.006 | **$5.96** |
| **Deepgram** | $0.0043 | **$4.27** |

## Files Ready for When URLs Are Available

1. **[batch-transcribe-jan15.ts](batch-transcribe-jan15.ts)** - Transcription script
2. **[check-gcs-recordings.ts](check-gcs-recordings.ts)** - GCS status checker
3. **[TRANSCRIPTION-COST-GUIDE.md](TRANSCRIPTION-COST-GUIDE.md)** - Detailed cost analysis

## Questions to Answer

To help you best, please let me know:

1. **Do you have AWS credentials** for the `telephony-recorder-prod` bucket?
   - [ ] Yes, I have access
   - [ ] No, but I can get them
   - [ ] No, and I can't get them

2. **What telephony/SIP provider** are you using for recordings?
   - Provider name: _________________
   - Account ID: _________________

3. **What's your priority?**
   - [ ] Transcribe January 15 calls (all 596)
   - [ ] Just analyze the 115 already transcribed
   - [ ] Set up real-time transcription for future calls
   - [ ] All of the above

## Technical Details

### Recording URL Pattern
```
Format: s3://telephony-recorder-prod/{account-id}/{date}/{call-id}.wav
Example: s3://telephony-recorder-prod/57bd0f26-ee4a-46e5-961e-baeb66744372/2026-01-15/*.wav
```

### Your GCS Setup
- **Bucket**: `demandgentic-prod-storage-2026`
- **Region**: Configured ✓
- **Service Account**: Active ✓
- **Recordings Path**: `recordings/{lead_id}.{mp3|wav}`

### Current Transcription Status
- Total Jan 15 calls (>60s): **711**
- Already transcribed: **115** (16.2%)
- Remaining: **596** (83.8%)
- Estimated total cost: **$2.48 - $5.96** (depending on provider)

---

**Ready to proceed?** Choose your option above and I'll create the necessary scripts!