# Transcription Regeneration - Operations Runbook

## Quick Start (5 minutes)

```bash
# 1. Start the worker
npm run transcription-regen:start

# 2. Check progress (every hour)
npm run transcription-regen:progress

# 3. Get worker status
npm run transcription-regen:status

# 4. Adjust if needed
npm run transcription-regen:config -- --concurrency=5
```

---

## Status Codes & Meanings

| Status | Meaning | Action |
|--------|---------|--------|
| 🟢 Running | Worker is active | Monitor progress |
| 🔴 Stopped | Worker is idle | Run `npm run transcription-regen:start` |
| ⏳ In Progress | Jobs being processed | Let it run |
| ✅ Completed | Job done successfully | None |
| ❌ Failed | Job failed after retries | Check `/regeneration/jobs?status=failed` |

---

## Daily Operations

### Morning (Start of Day)

```bash
# 1. Check if worker is already running from overnight
npm run transcription-regen:status

# 2. View progress
npm run transcription-regen:progress

# 3. If stopped, start it
npm run transcription-regen:start
```

### During Day (Every 2-4 Hours)

```bash
# Check progress
npm run transcription-regen:progress

# If processing slows down, check for stuck jobs
curl -X GET 'https://demandgentic.ai/api/call-intelligence/regeneration/jobs?status=in_progress' \
  -H "Authorization: Bearer $API_TOKEN"
```

### End of Day

```bash
# Check final progress
npm run transcription-regen:progress

# If all jobs done, can optionally stop
npm run transcription-regen:stop
```

### Emergency Stop

```bash
# Stop immediately (doesn't lose progress)
npm run transcription-regen:stop
```

---

## Common Commands Reference

### View Progress

```bash
# See percentage complete and ETA
npm run transcription-regen:progress

# Example output:
# ✅ Regeneration Progress: 45% complete
# ⏳ Estimated time remaining: 55 minutes
# Stats: 1,920 complete | 2,300 pending | 45 failed
```

### View Worker Status

```bash
# See if running, current config, job counts
npm run transcription-regen:status

# Example output:
# 🟢 Worker Running
# Config: concurrency=3, batchSize=50, batchDelay=2000ms
# Active Jobs: 3 / 3
# Stats: pending=2300, inProgress=3, completed=1920, failed=45
```

### View Pending Jobs

```bash
# List next 50 pending jobs
npm run transcription-regen:jobs

# See failed jobs
npm run transcription-regen:jobs -- --status=failed

# Paginate results
npm run transcription-regen:jobs -- --page=2 --limit=20
```

### Adjust Configuration (Runtime)

```bash
# Increase speed (use 5 workers instead of 3)
npm run transcription-regen:config -- --concurrency=5

# Decrease speed (reduce API load)
npm run transcription-regen:config -- --concurrency=1

# Change batch size
npm run transcription-regen:config -- --batch-size=100

# Increase delay between batches (prevent rate limiting)
npm run transcription-regen:config -- --batch-delay=5000

# View current config
npm run transcription-regen:status
```

### Start/Stop Worker

```bash
# Start processing
npm run transcription-regen:start

# Stop (graceful - lets current jobs finish)
npm run transcription-regen:stop
```

---

## Troubleshooting Quick Reference

### Problem: Worker Stopped Unexpectedly

```bash
# Check status
npm run transcription-regen:status

# Should see: 🔴 Worker NOT running

# Restart it
npm run transcription-regen:start

# Verify status
npm run transcription-regen:status
```

### Problem: Jobs Not Processing (Stuck)

```bash
# Check for jobs stuck in 'in_progress' status
curl -X GET 'https://demandgentic.ai/api/call-intelligence/regeneration/jobs?status=in_progress' \
  -H "Authorization: Bearer $API_TOKEN"

# If jobs are stuck for >30 minutes:
# 1. Stop worker
npm run transcription-regen:stop

# 2. Reset stuck jobs (via SQL or database admin):
# UPDATE transcription_regeneration_jobs 
# SET status = 'pending' 
# WHERE status = 'in_progress' AND updated_at < NOW() - INTERVAL '30 minutes';

# 3. Restart worker
npm run transcription-regen:start
```

### Problem: High Failure Rate (>5%)

```bash
# Check failed jobs
curl -X GET 'https://demandgentic.ai/api/call-intelligence/regeneration/jobs?status=failed&limit=10' \
  -H "Authorization: Bearer $API_TOKEN"

# If failures are due to "No recording URL found":
# Try alternate strategy
npm run transcription-regen:config -- --strategy=recording_url

# If failures are due to rate limiting:
# Increase batch delay
npm run transcription-regen:config -- --batch-delay=5000
# Decrease concurrency
npm run transcription-regen:config -- --concurrency=1
```

### Problem: Processing Too Slow

```bash
# Current speed
npm run transcription-regen:progress

# If ETA is too long and no resource constraints:
npm run transcription-regen:config -- --concurrency=8
npm run transcription-regen:config -- --batch-delay=1000
```

### Problem: API Rate Limiting

```bash
# Symptoms: Many failures with "HTTP 429" or "Rate Limited"

# Fix: Increase delays and reduce concurrency
npm run transcription-regen:config -- --concurrency=1
npm run transcription-regen:config -- --batch-delay=5000

# Then gradually increase:
npm run transcription-regen:config -- --concurrency=2
npm run transcription-regen:config -- --batch-delay=3000
```

---

## Performance Targets

| Config | Speed | Duration | Cost | Notes |
|--------|-------|----------|------|-------|
| Conservative | 30 calls/min | 2.5 hours | Low | Safe default |
| Balanced (default) | 45 calls/min | 100 min | Medium | **Recommended** |
| Aggressive | 100+ calls/min | 40 min | Medium | Monitor for rate limits |
| Turbo | 240+ calls/min | 18 min | Medium | Risk: rate limiting |

---

## Environment Variables

Set these before running:

```bash
# Required
export BASE_URL=https://demandgentic.ai
export DATABASE_URL=postgresql://user:pass@host:5432/demandgentic

# Optional but recommended
export API_TOKEN=your-admin-token  # Needed for CLI commands
export NODE_ENV=production

# Optional
export TRANSCRIPTION_REGEN_ENABLED=true  # Auto-start on server boot
```

---

## Alert Thresholds

Monitor and alert if:

| Condition | Threshold | Action |
|-----------|-----------|--------|
| Worker not running | >30 minutes | Restart manually |
| Jobs stuck in progress | >30 minutes | Reset and restart |
| Failure rate | >10% | Review errors in logs |
| No progress | >60 minutes | Stop/debug/restart |
| Long ETA | >2 hours remaining | Not a problem, normal |

---

## Deployment Checklist

- [ ] Environment variables set (BASE_URL, DATABASE_URL, API_TOKEN)
- [ ] Code deployed to production
- [ ] `/api/call-intelligence/regeneration/worker/status` endpoint accessible
- [ ] CLI commands configured to point to production
- [ ] Database connectivity verified
- [ ] Start worker: `npm run transcription-regen:start`
- [ ] Verify jobs processing: `npm run transcription-regen:progress`
- [ ] Set up monitoring/alerts in ops system
- [ ] Brief ops team on troubleshooting (above)

---

## Example: Full Operations Session

```bash
# 1. Start of day - check status
$ npm run transcription-regen:status
🟢 Worker Running
Active Jobs: 3 / 3
Stats: pending=2100, completed=2165, failed=0

# 2. View progress
$ npm run transcription-regen:progress
✅ Regeneration Progress: 51% complete
⏳ Estimated time remaining: 50 minutes
Stats: 2,165 complete | 2,100 pending | 0 failed

# 3. An hour later - check progress
$ npm run transcription-regen:progress
✅ Regeneration Progress: 72% complete
⏳ Estimated time remaining: 25 minutes

# 4. Processing slowing - increase concurrency
$ npm run transcription-regen:config -- --concurrency=6
✅ Config updated: concurrency=6

# 5. Check status
$ npm run transcription-regen:status
🟢 Worker Running
Active Jobs: 6 / 6
Stats: pending=1000, completed=3265, failed=0

# 6. Final check
$ npm run transcription-regen:progress
✅ Regeneration Progress: 99% complete
⏳ Estimated time remaining: 2 minutes

# 7. Done - stop worker
$ npm run transcription-regen:stop
🟢 Worker stopped gracefully
```

---

## Dashboard Integration

The transcription health dashboard at:
```
https://demandgentic.ai/disposition-intelligence?tab=transcription-health
```

Automatically shows:
- Live regeneration progress bar
- Daily breakdown by date
- Missing vs. completed counts
- Action buttons to start/stop/configure worker
- List of calls pending regeneration

---

## Support Contacts & Resources

- **Logs**: `gcloud logging read "resource.type=cloud_run_revision"`
- **Database Queries**: See troubleshooting section above
- **API Endpoints**: All documented in `TRANSCRIPTION_REGENERATION_PRODUCTION_GUIDE.md`
- **CLI Help**: `npm run transcription-regen:help`

---

## Key Files

- **Configuration & API**: `server/routes/call-intelligence-routes.ts`
- **Background Worker**: `server/services/transcription-regeneration-worker.ts`
- **CLI Manager**: `scripts/transcription-regeneration-manager.ts`
- **Full Documentation**: `TRANSCRIPTION_REGENERATION_PRODUCTION_GUIDE.md` (this directory)

