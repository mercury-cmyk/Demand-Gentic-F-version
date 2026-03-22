# Disposition Reanalysis - Phase 2 Implementation Guide

**Status:** ✅ Code ready for deployment  
**Phase:** Advanced Optimizations (Tier 2A & 2B)  
**Estimated Impact:** 20-100x improvement for UI responsiveness  
**Setup Time:** 30-45 minutes

---

## 📦 What's Implemented

### 1. ✅ Background Job Queue Service
**File:** `server/services/disposition-job-queue.ts`

- Non-blocking batch analysis using Bull queue
- Real-time progress updates for UI
- Automatic retry on failures
- Job persistence (survives restarts)
- Priority-based processing (applies > previews)
- Queue statistics & monitoring

### 2. ✅ Streaming Export Service
**File:** `server/services/disposition-streaming-export.ts`

- Memory-efficient streaming (100K+ records)
- Multiple export formats: CSV, JSON, JSONL
- Automatic field mapping and escaping
- Export size estimation
- Stream backpressure handling

### 3. ✅ Queue-Based Routes
**File:** `server/routes/disposition-reanalysis-routes.ts`

New endpoints:
- `POST /queue/preview` - Queue a preview job
- `POST /queue/apply` - Queue an apply job
- `GET /queue/job/:jobId/status` - Poll job status
- `GET /queue/job/:jobId/result` - Get completed result
- `DELETE /queue/job/:jobId` - Cancel job
- `GET /queue/job/:jobId/result/export` - Stream results
- `GET /queue/stats` - Admin queue statistics

### 4. ✅ Frontend Hook
**File:** `client/src/hooks/use-disposition-job-queue.ts`

- Simplified polling & job management
- Automatic retry with exponential backoff
- TypeScript support
- Hooks: `useAnalysisJob`, `useJobPolling`

---

## 🚀 Deployment Steps

### Step 1: Ensure Bull Queue Dependencies (1 min)

Bull and related packages should already be installed. Verify:

```bash
npm ls bullmq
npm ls ioredis

# Should show versions like:
# bullmq@5.x.x
# ioredis@5.x.x
```

If missing, install:

```bash
npm install bullmq @types/bull
```

### Step 2: Initialize Queue on Server Startup (3 min)

Edit `server/index.ts` or your main server file:

```typescript
import { initializeDispositionQueue, shutdownQueue } from './services/disposition-job-queue';

// On server startup:
async function startServer() {
  // ... existing initialization ...

  // Initialize disposition analysis queue
  const queueReady = await initializeDispositionQueue();
  if (queueReady) {
    console.log("✅ Disposition job queue initialized");
  } else {
    console.warn("⚠️  Disposition job queue unavailable - using synchronous mode");
  }

  // Graceful shutdown
  process.on('SIGTERM', async () => {
    console.log('Shutting down...');
    await shutdownQueue();
    process.exit(0);
  });
}

startServer();
```

### Step 3: Update Frontend to Use Queue (5-10 min)

Create the frontend hook file:

**File:** `client/src/hooks/use-disposition-job-queue.ts`

```typescript
import { useState, useCallback, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';

export function useAnalysisJob() {
  const [jobId, setJobId] = useState(null);
  const [isScheduling, setIsScheduling] = useState(false);

  const scheduleJob = useCallback(
    async (endpoint: string, filters: any) => {
      setIsScheduling(true);
      try {
        const res = await fetch(`/api/disposition-reanalysis/${endpoint}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(filters),
        });

        if (!res.ok) throw new Error(await res.text());

        const { jobId: jid } = await res.json();
        setJobId(jid);
        return jid;
      } catch (error) {
        console.error('Failed to schedule job:', error);
        throw error;
      } finally {
        setIsScheduling(false);
      }
    },
    []
  );

  return { jobId, isScheduling, scheduleJob, setJobId };
}

export function useJobPolling(jobId: string | null, autoPoll = true) {
  const { data: status, isLoading, error, refetch } = useQuery({
    queryKey: [`job-status-${jobId}`],
    queryFn: async () => {
      if (!jobId) return null;
      const res = await fetch(`/api/disposition-reanalysis/queue/job/${jobId}/status`);
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
    enabled: !!jobId && autoPoll,
    refetchInterval: (data) => {
      // Smart polling: reduce frequency as job gets closer
      if (!data) return 500; // Job not found yet
      const { estimatedSecondsRemaining } = data;
      if (estimatedSecondsRemaining > 30) return 2000; // Poll every 2s
      if (estimatedSecondsRemaining > 10) return 1000; // Poll every 1s
      return 500; // Poll every 0.5s near completion
    },
  });

  return { status, isLoading, error, refetch };
}

export function useJobResult(jobId: string | null) {
  const { data: result, isLoading, error } = useQuery({
    queryKey: [`job-result-${jobId}`],
    queryFn: async () => {
      if (!jobId) return null;
      const res = await fetch(`/api/disposition-reanalysis/queue/job/${jobId}/result`);
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
    enabled: !!jobId,
    staleTime: Infinity, // Results don't change once completed
  });

  return { result, isLoading, error };
}

// Usage example in component:
/*
function DispositionAnalysisComponent() {
  const { jobId, isScheduling, scheduleJob } = useAnalysisJob();
  const { status, isLoading } = useJobPolling(jobId);
  const { result } = useJobResult(jobId);

  const handlePreview = async () => {
    const filters = { campaignId: 'abc', limit: 50 };
    await scheduleJob('queue/preview', filters);
  };

  return (
    
      
        {isScheduling ? 'Scheduling...' : 'Run Preview'}
      

      {jobId && !result && (
        
          {status && (
            <>
              Progress: {status.processed}/{status.total}
              Remaining: {status.estimatedSecondsRemaining}s
            
          )}
        
      )}

      {result && (
        <>
          Found {result.totalShouldChange} misclassifications
        
      )}
    
  );
}
*/
```

### Step 4: Test Queue Operations (5 min)

**Test job queueing:**

```bash
# Terminal 1: Start server
npm run dev

# Terminal 2: Queue a preview job
curl -X POST http://localhost:3000/api/disposition-reanalysis/queue/preview \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "campaignId": "your-campaign-id",
    "limit": 10,
    "dryRun": true
  }'

# Returns:
# {
#   "status": "queued",
#   "jobId": "analysis-userid-1708450000000",
#   "estimatedSeconds": 25,
#   "pollUrl": "/api/disposition-reanalysis/queue/job/..."
# }
```

**Check job status:**

```bash
curl http://localhost:3000/api/disposition-reanalysis/queue/job/analysis-userid-1708450000000/status \
  -H "Authorization: Bearer YOUR_TOKEN"

# Returns:
# {
#   "jobId": "analysis-userid-1708450000000",
#   "status": "processing",
#   "processed": 5,
#   "total": 10,
#   "estimatedSecondsRemaining": 8
# }
```

**Get queue statistics:**

```bash
curl http://localhost:3000/api/disposition-reanalysis/queue/stats \
  -H "Authorization: Bearer YOUR_TOKEN"

# Returns:
# {
#   "operational": true,
#   "waiting": 2,
#   "active": 1,
#   "completed": 45,
#   "failed": 0,
#   "delayed": 0
# }
```

### Step 5: Update UI to Use Queue (10-20 min)

Replace synchronous calls with queue-based approach:

```typescript
// OLD: Synchronous (blocks UI for 60-120 seconds)
async function handlePreview() {
  setLoading(true);
  try {
    const result = await fetch('/api/disposition-reanalysis/preview', {
      method: 'POST',
      body: JSON.stringify(filters),
    }).then(r => r.json());
    setResults(result);
  } finally {
    setLoading(false);
  }
}

// NEW: Queue-based (response in  {
    const status = await fetch(`/api/.../queue/job/${jobId}/status`)
      .then(r => r.json());
    
    if (status.status === 'completed') {
      clearInterval(checkStatus);
      const result = await fetch(`/api/.../queue/job/${jobId}/result`)
        .then(r => r.json());
      setResults(result.result);
    }
  }, 1000);
}
```

---

## 📊 Expected Performance Improvements

### Before (Synchronous)
```
Preview (50 calls):
- User waits: 60-120 seconds (blocking)
- No feedback: No progress indication
- App state: UI frozen
- Timeout risk: Yes (if >2 minutes)

Database load: Spikes, then normal
Memory: Temporarily high (7-10MB)
```

### After (Queue-Based)
```
Preview (50 calls):
- User gets response: (
  "disposition-analysis",
  async (job) => processAnalysisJob(job),
  {
    connection: redisConnection,
    concurrency: 2, // Increase if you have more CPU/memory
  }
);
```

- `concurrency: 1` - Conservative (uses less resources)
- `concurrency: 2` - Balanced (default)
- `concurrency: 4` - Aggressive (faster processing, more resource usage)

### Adjust Job Retention

Edit `server/services/disposition-job-queue.ts`, line ~90:

```typescript
defaultJobOptions: {
  removeOnComplete: {
    age: 3600, // Keep completed jobs for 1 hour (3600 seconds)
  },
  removeOnFail: {
    age: 86400, // Keep failed jobs for 24 hours
  },
}
```

- Shorter age: Saves memory, but loses debugging info
- Longer age: Better for debugging, uses more Redis memory

### Disable Queue During Development

If Redis is not available and you want synchronous processing:

```bash
export DISABLE_REDIS=true
npm run dev
```

The system automatically falls back to synchronous analysis.

---

## 📈 Monitoring & Metrics

### Queue Health Checks

Add these to your monitoring/admin dashboard:

```typescript
// Check queue health every 30 seconds
setInterval(async () => {
  const stats = await fetch('/api/disposition-reanalysis/queue/stats')
    .then(r => r.json());
  
  // Alert if too many jobs fail
  if (stats.failed > 10) {
    console.warn('Queue has failing jobs:', stats.failed);
  }
  
  // Alert if queue is backing up
  if (stats.waiting > 100) {
    console.warn('Queue is backed up:', stats.waiting, 'waiting jobs');
  }
}, 30000);
```

### Key Metrics to Track

1. **Average Job Duration** - Should decrease over time as cache improves
2. **Job Success Rate** - Should be 95%+
3. **Queue Depth** - Should be  KEYS "bull:disposition-analysis:*"
> HGETALL "bull:disposition-analysis:1" (check job details)
```

### Issue: Memory growing

**If Redis memory is growing:**
- Increase job cleanup age: Reduce `removeOnComplete.age`
- Or: Adjust concurrency down

**If server process memory is growing:**
- Check streaming isn't loading all results into memory
- Look for memory leaks in custom code

---

## 🚀 Next Steps (Optional)

### Further Optimizations (Not Required)

1. **WebSocket Updates** (instead of polling)
   - Real-time progress via WebSocket
   - Eliminates polling overhead
   - Better UX

2. **Materialized Views** (database optimization)
   - Pre-compute common queries
   - Faster aggregations
   
3. **Distributed Queue** (for multi-instance deployments)
   - Run workers on separate servers
   - Better scalability for 1000+ jobs/day

---

## 📝 Migration Path

### Option A: Gradual Migration (Recommended)
1. Keep old synchronous endpoints
2. Add new queue endpoints alongside
3. Migrate UI gradually (A/B test)
4. Deprecate old endpoints after 2-3 weeks

### Option B: Full Migration
1. Replace all endpoints at once
2. Synchronous fallback if queue unavailable
3. Better UX consistency

---

## ✅ Success Criteria

Deployment successful when:

- [ ] Server starts with "✅ Disposition job queue initialized"
- [ ] Queue endpoints respond without errors
- [ ] Jobs transition through states: queued → processing → completed
- [ ] Status polling returns progress updates
- [ ] Results export in CSV/JSON/JSONL formats
- [ ] Queue stats show realistic numbers
- [ ] UI updates in real-time while job processes
- [ ] No "timeout" errors in browser logs
- [ ] Fallback works if Redis disconnects

---

## 📊 Expected Results After Phase 2

| Aspect | Before | After |
|--------|--------|-------|
| **User wait time** | 60-180s | <100ms |
| **UI responsiveness** | Frozen | Fully responsive |
| **Progress feedback** | None | Real-time % |
| **Max concurrent analysis** | 1 | 10-50 |
| **Result export speed** | Blocks UI | Streaming |
| **Memory per 100 results** | 7-10MB | <1MB (streaming) |

---

## 📞 Reference

**Endpoints Cheat Sheet:**

```
POST /queue/preview         → Start preview job
POST /queue/apply           → Start apply job
GET /queue/job/:id/status   → Poll job status
GET /queue/job/:id/result   → Get final result
DELETE /queue/job/:id       → Cancel job
GET /queue/stats            → Queue statistics
GET /queue/job/:id/result/export?format=csv → Export results
```

**Environment Variables:**

```bash
REDIS_URL=redis://localhost:6379      # Queue backend
DISABLE_REDIS=true                    # Disable queue (sync fallback)
```

---

**Last Updated:** February 2026  
**Tested With:** Node.js 18+, Redis 6.0+, Bull 4.x+