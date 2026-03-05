# Transcription Regeneration System - Production Deployment Guide

## Overview

The Transcription Regeneration System is a production-grade background job processor that automatically regenerates transcripts for calls missing transcriptions or requiring re-analysis. It integrates seamlessly with the transcription health dashboard and provides real-time monitoring and adjustment capabilities.

**Key Features:**
- ✅ Automatic background processing of 4,265 queued transcription jobs
- ✅ Configurable concurrency, batch sizes, and regeneration strategies
- ✅ Real-time disposition updates through post-call analysis pipeline
- ✅ Full integration with transcription health endpoint
- ✅ REST API for starting/stopping/monitoring the worker
- ✅ CLI tool for operational management
- ✅ Retry logic with exponential backoff and configurable attempts
- ✅ Detailed progress tracking and job statistics

---

## Architecture

### Components

1. **Background Worker** (`transcription-regeneration-worker.ts`)
   - Continuously processes pending jobs from `transcription_regeneration_jobs` table
   - Maintains configurable concurrency level
   - Handles retries and error tracking
   - Non-blocking, event-driven architecture

2. **API Endpoints** (in `call-intelligence-routes.ts`)
   - `/api/call-intelligence/transcription-gaps/regenerate` - Batch submission endpoint (50 calls max)
   - `/api/call-intelligence/regeneration/worker/start` - Start the background worker
   - `/api/call-intelligence/regeneration/worker/stop` - Stop the background worker
   - `/api/call-intelligence/regeneration/worker/status` - Get worker status and config
   - `/api/call-intelligence/regeneration/worker/config` - Update configuration
   - `/api/call-intelligence/regeneration/progress` - Get overall regeneration progress
   - `/api/call-intelligence/regeneration/jobs` - List and filter regeneration jobs

3. **CLI Manager** (`transcription-regeneration-manager.ts`)
   - Command-line tool for operational control
   - Deploy to production servers for easy management

4. **Job Database Table** (`transcription_regeneration_jobs`)
   - Tracks 4,265 pending regeneration jobs
   - Schema: call_id, source, status, attempts, error, timestamps

---

## Production Deployment

### Prerequisites

1. **Database**: PostgreSQL connection with `transcription_regeneration_jobs` table (already created)
2. **Environment Variables**:
   ```bash
   DATABASE_URL=postgresql://user:pass@host:5432/demandgentic
   BASE_URL=https://demandgentic.ai
   API_TOKEN=your-admin-api-token  # Optional: for CLI authentication
   NODE_ENV=production
   ```

3. **Permissions**: Worker process needs database write access

### Step 1: Verify Job Queue Setup

Check that all 4,265 jobs are queued:

```bash
# Via database
SELECT status, COUNT(*) FROM transcription_regeneration_jobs GROUP BY status;

# Expected output:
#  pending  | 4265
```

### Step 2: Start the Background Worker

**Option A: Using the API**

```bash
curl -X POST https://demandgentic.ai/api/call-intelligence/regeneration/worker/start \
  -H "Authorization: Bearer YOUR_API_TOKEN" \
  -H "Content-Type: application/json"
```

**Option B: Using the CLI Manager**

```bash
npm run transcription-regen:start
```

**Option C: Automated Startup (Cloud Run / Container)**

Add to your server initialization (e.g., `server/index.ts`):

```typescript
import { startWorker } from './services/transcription-regeneration-worker';

// After server startup
if (process.env.TRANSCRIPTION_REGEN_ENABLED === 'true') {
  console.log('Starting transcription regeneration worker...');
  startWorker();
}
```

Then set environment variable:
```bash
TRANSCRIPTION_REGEN_ENABLED=true
```

### Step 3: Monitor Progress in Real-Time

**Dashboard Integration** - The transcription health endpoint automatically shows:
- Daily breakdown of regeneration progress
- Missing transcriptions vs. completed regenerations
- Analysis coverage metrics

**CLI Commands:**

```bash
# Get overall progress (percentage complete, ETA)
npm run transcription-regen:progress

# Get worker status and configuration
npm run transcription-regen:status

# Get list of pending jobs (paginated)
curl -X GET 'https://demandgentic.ai/api/call-intelligence/regeneration/jobs?status=pending&limit=50' \
  -H "Authorization: Bearer YOUR_API_TOKEN"
```

---

## Configuration

### Adjustable Parameters

The worker is fully configurable without stopping or redeploying:

```typescript
interface RegenerationJobConfig {
  // How many jobs to process in parallel (default: 3)
  // Increase for faster processing, decrease to reduce API load
  concurrency: number;

  // Max retries per job before marking failed (default: 3)
  maxRetries: number;

  // Batch size for each API submission (default: 50, max: 50)
  // Must be ≤ 50 due to API endpoint limits
  batchSize: number;

  // Delay between batch submissions in ms (default: 2000)
  // Increase to prevent rate limiting, decrease for faster submission
  batchDelayMs: number;

  // Strategy for finding recordings:
  // 'telnyx_phone_lookup' (default) - Search Telnyx for fresh recordings by phone number
  // 'recording_url' - Use existing recording URLs only
  // 'auto' - Try existing URL first, fallback to Telnyx lookup
  strategy: 'telnyx_phone_lookup' | 'recording_url' | 'auto';

  // API endpoint (usually auto-detected from BASE_URL)
  apiEndpoint: string;

  // Enable detailed logging (default: true)
  verbose: boolean;
}
```

### Update Configuration at Runtime

**Via API:**

```bash
curl -X POST https://demandgentic.ai/api/call-intelligence/regeneration/worker/config \
  -H "Authorization: Bearer YOUR_API_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "concurrency": 5,
    "batchSize": 50,
    "batchDelayMs": 1500,
    "strategy": "telnyx_phone_lookup",
    "verbose": false
  }'
```

**Via CLI:**

```bash
# Increase concurrency for faster processing
npm run transcription-regen:config -- --concurrency=5

# Increase batch delay to prevent rate limiting
npm run transcription-regen:config -- --batch-delay=3000

# Switch strategy to use existing URLs only
npm run transcription-regen:config -- --strategy=recording_url

# Disable verbose logging (reduce log volume)
npm run transcription-regen:config -- --verbose=false
```

---

## Regeneration Flow

### What Happens When Running

For each queued job:

1. **Transcription**
   - Fetch fresh recording from Telnyx (using phone number lookup)
   - Transcribe with Deepgram
   - Save transcript to database

2. **Analysis** (Real-time)
   - Run lightweight disposition triage (~0 cost)
   - If uncertain, run deep AI analysis
   - Analyze conversation quality and campaign alignment
   - **Auto-correct disposition** if confidence ≥ threshold

3. **Intelligence Logging**
   - Create analysis record in `call_quality_records`
   - Update `transcription_regeneration_jobs.status` to 'completed'
   - Feed metrics to call intelligence dashboard

4. **Logging & Metrics**
   - Log to CloudLogging for audit trail
   - Update progress counters
   - Report back to CLI/dashboard

### Example: Single Job Processing

```
Job: call_session_abc123
├─ Status: pending
├─ Fetch fresh recording from Telnyx (+1-555-1234, call time ±30 min)
├─ Received: mp3:// URL from Telnyx
├─ Transcribe with Deepgram
├─ Generated: 4,200 word transcript over 8 minutes
├─ Run post-call analysis
│  ├─ Lightweight triage: VoiceMaildetected → confidence 0.92, skip deep analysis
│  └─ Decision: Update disposition to 'voicemail'
├─ Auto-correct disposition: 'needs_review' → 'voicemail'
├─ Create intelligence record
├─ Log to dashboard
└─ Mark as: completed

Result: ✅ 1 job completed in ~15 seconds
```

---

## Production Scenarios

### Scenario 1: Rapid Processing (Development/Testing)

Config for fast initial processing (not recommended for production):

```bash
npm run transcription-regen:config -- \
  --concurrency=5 \
  --batch-delay=500
```

**Result**: ~240 calls/minute, completion in ~18 minutes

### Scenario 2: Balanced Production Setup (Recommended)

Safe default configuration:

```bash
npm run transcription-regen:config -- \
  --concurrency=3 \
  --batch-delay=2000
```

**Result**: ~45 calls/minute, completion in ~100 minutes
**Cost**: ~1,890 Deepgram transcription units (assuming 0.45 units/call)

### Scenario 3: Afternoon/Off-Peak Processing

Run with higher concurrency during low-traffic periods:

```bash
# Set higher concurrency during off-peak
npm run transcription-regen:config -- --concurrency=8

# Increase batch delay to prevent thundering herd
npm run transcription-regen:config -- --batch-delay=2500
```

### Scenario 4: Pause and Resume

Stop processing temporarily without losing progress:

```bash
# Pause
npm run transcription-regen:stop

# Resume later (all pending jobs preserved)
npm run transcription-regen:start
```

All jobs retain their status and attempt counts.

---

## Monitoring & Alerting

### Key Metrics to Monitor

**From CLI:**

```bash
npm run transcription-regen:progress
```

Watch for:
- `progressPercent` - Should increase smoothly (0-100%)
- `estimatedRemainingMinutes` - Should decrease over time
- `failed` count - Should be < 5% of total

**From API:**

```bash
curl https://demandgentic.ai/api/call-intelligence/regeneration/progress \
  -H "Authorization: Bearer YOUR_API_TOKEN"
```

Response:
```json
{
  "success": true,
  "data": {
    "pending": 3200,
    "inProgress": 0,
    "submitted": 750,
    "completed": 180,
    "failed": 35,
    "total": 4265,
    "progressPercent": 22,
    "estimatedRemainingMinutes": 95
  }
}
```

### Alerting Rules

Set up alerts for:

1. **Worker Stopped Unexpectedly**
   ```sql
   SELECT * FROM logs 
   WHERE message LIKE '%Worker stopped%' 
   AND timestamp > NOW() - INTERVAL '5 minutes'
   ```

2. **High Failure Rate**
   ```sql
   SELECT COUNT(*) FROM transcription_regeneration_jobs 
   WHERE status = 'failed' 
   AND created_at > NOW() - INTERVAL '1 hour';
   -- Alert if > 10% of jobs from last hour
   ```

3. **Stuck in Progress**
   ```sql
   SELECT COUNT(*) FROM transcription_regeneration_jobs 
   WHERE status = 'in_progress' 
   AND updated_at < NOW() - INTERVAL '30 minutes';
   -- Alert if > 0
   ```

---

## Troubleshooting

### Worker Not Processing Jobs

**Check Status:**

```bash
npm run transcription-regen:status

# Should show: Running: 🟢 YES
```

**If Not Running:**

```bash
# Restart worker
npm run transcription-regen:start
```

**If Still Not Running:**

- Check logs: `gcloud logging read "resource.type=cloud_run_revision"`
- Verify DATABASE_URL is correct
- Check API_TOKEN authentication

### Jobs Stuck in 'in_progress'

**Cause**: Worker crashed or stalled

**Fix:**

```sql
-- Reset stuck jobs to pending
UPDATE transcription_regeneration_jobs 
SET status = 'pending'
WHERE status = 'in_progress' 
AND updated_at < NOW() - INTERVAL '1 hour';

-- Restart worker
npm run transcription-regen:start
```

### High Failure Rate

**Check Specific Failures:**

```bash
curl 'https://demandgentic.ai/api/call-intelligence/regeneration/jobs?status=failed&limit=10' \
  -H "Authorization: Bearer YOUR_API_TOKEN"
```

**Common Issues:**

1. **"No recording URL found"**
   - Phone number not in Telnyx system
   - Recording older than retention period
   - Switch strategy: `--strategy=recording_url` to use existing URLs

2. **"Transcription returned empty"**
   - Silent call / no audio
   - Audio too short or corrupted
   - May need manual review

3. **"HTTP 429: Rate Limited"**
   - API rate limit exceeded
   - Increase batch delay: `--batch-delay=5000`
   - Decrease concurrency: `--concurrency=1`

### Disposition Not Updating

**Verify Analysis Ran:**

```sql
SELECT id, status, ai_analysis 
FROM call_sessions 
WHERE id = 'your_call_id';

-- Should have populated ai_analysis JSON
```

**If Analysis is NULL:**
- Check `call_quality_records` for the call
- Review server logs for analysis errors
- May need manual post-call analysis via dashboard

---

## Cost Optimization

### Estimated Costs (for 4,265 calls)

**Deepgram Transcription:**
- Cost: ~0.45 units per call (for 8-minute average)
- Total: ~1,920 units ~ $1-2 (depending on plan)
- Batch: 100 calls / minute = 42 minutes total

**Telnyx Phone Lookup:**
- Cost: Free (included in API)
- Benefit: Fresh recordings bypass old GCS account issues

**Total Processing Time:**
- Balanced config: ~100 minutes
- Optimized config: ~40 minutes
- Fast config: ~18 minutes

### Cost Reduction Strategies

1. **Use existing recording URLs** (if available)
   ```bash
   npm run transcription-regen:config -- --strategy=recording_url
   ```
   Saves Telnyx API calls but risks using outdated recordings.

2. **Increase batch delay** during peak hours
   ```bash
   npm run transcription-regen:config -- --batch-delay=5000
   ```
   Reduces concurrent load, spreads cost over longer period.

3. **Process during off-peak**
   - Start at 2 AM UTC: lowest API load
   - Run with high concurrency (8+)
   - Complete in ~20 minutes

---

## Maintenance & Support

### Regular Checks (Daily)

```bash
# Check progress
npm run transcription-regen:progress

# Verify no stuck jobs
curl -X GET 'https://demandgentic.ai/api/call-intelligence/regeneration/jobs?status=in_progress' \
  -H "Authorization: Bearer YOUR_API_TOKEN"

# Review failures
curl -X GET 'https://demandgentic.ai/api/call-intelligence/regeneration/jobs?status=failed' \
  -H "Authorization: Bearer YOUR_API_TOKEN"
```

### Weekly Reviews

```bash
# Full status report
npm run transcription-regen:status

# Check overall health dashboard
# Navigate to: https://demandgentic.ai/disposition-intelligence?tab=transcription-health
```

### Cleanup After Completion

Once all jobs are completed:

```sql
-- Archive completed jobs (optional)
INSERT INTO transcription_regeneration_jobs_archive 
SELECT * FROM transcription_regeneration_jobs WHERE status = 'completed';

-- Remove old records
DELETE FROM transcription_regeneration_jobs 
WHERE status = 'completed' 
AND completed_at < NOW() - INTERVAL '30 days';
```

---

## Integration with Transcription Health Dashboard

### What the Dashboard Shows

The transcription health endpoint automatically includes regeneration status:

**Endpoint**: `GET /api/call-intelligence/transcription-health?days=14&minDuration=30`

**Response includes:**
- Daily breakdown of calls with/without transcripts
- Missing vs. completed analysis records
- Coverage percentage over time

### Dashboard Features

1. **Visual Progress Bar**: Shows regeneration completion %
2. **Daily Breakdown**: Regeneration progress by day
3. **Missing Calls**: Links to calls needing regeneration
4. **Action Buttons**: Start/stop worker directly from dashboard
5. **Configuration Panel**: Adjust worker settings in real-time

---

## Summary

The Transcription Regeneration System provides:

✅ **Automated Processing**: Background worker handles all 4,265 jobs  
✅ **Real-time Adaptation**: Update config without stopping  
✅ **Intelligent Analysis**: Disposition updates on-demand  
✅ **Full Visibility**: Monitor progress, errors, and metrics  
✅ **Production Ready**: Retry logic, error handling, graceful shutdown  
✅ **Cost Optimized**: Configurable strategies and concurrency  

**Start regeneration now:**

```bash
npm run transcription-regen:start
npm run transcription-regen:progress  # Watch progress
npm run transcription-regen:status    # Check worker health
```

For support, check logs and review the troubleshooting section above.
