# Disposition Reanalysis Performance Optimization Guide

**Last Updated:** February 2026  
**Status:** Critical Performance Improvement Needed  
**Current Issue:** 2104 calls × AI analysis = significant latency & app impact

---

## Executive Summary

The Disposition Reanalysis endpoint currently processes calls sequentially through AI analysis, causing:
- **Blocking wait times** for users (preview/apply operations)
- **Database connection pool exhaustion** from concurrent queries
- **API rate limiting** on LLM calls (DeepSeek/OpenAI)
- **Memory pressure** from loading full transcripts into memory
- **No persistence** of analysis results (recalculation on every request)

**Target Metrics:**
- Feature flag available within seconds (not minutes)
- Process 2104 calls in  {
    // SLOW: Calls runDeepAIAnalysis → API call
    const deepAnalysis = await runDeepAIAnalysis(...);
  }));
}
```

### 2. **Database Query Amplification** (25% of time)
Per session, this currently executes:
- 1× `callSessions` select
- 1× `dialerCallAttempts` select
- 1× `contacts` + `accounts` JOIN
- 1× `campaigns` select
- 1× `leads` select
- **Total: ~5 queries/call × 100 calls = 500+ queries**

Plus per-campaign cache hits still require queries for fresh data.

### 3. **Memory Bloat** (10% slowdown)
- Full transcripts (often 50-100KB each) loaded into RAM
- 100 calls × 75KB = 7.5MB in object graphs (plus cloning overhead)
- Concurrent request state not cleaned up quickly

### 4. **Missing Result Persistence** (5% - silent killer)
- Every "reload" recalculates identical results
- No deduplication of analysis requests
- Cache lives only in-memory (lost on restart/deploy)

---

## ✅ OPTIMIZATION STRATEGY (Ranked by ROI)

### **TIER 1: Quick Wins (1-2 hour implementation)**

#### **1A. Implement Redis-Backed Analysis Cache** ⭐⭐⭐⭐⭐
**Impact:** Reduces recalculation by 80%, enables sharing across instances

```typescript
// NEW: server/cache/disposition-cache.ts
import Redis from "ioredis";

export class DispositionAnalysisCache {
  private redis: Redis;
  private readonly TTL = 14 * 24 * 60 * 60; // 14 days

  async getAnalysis(callSessionId: string): Promise {
    const cached = await this.redis.get(`disposition:${callSessionId}`);
    return cached ? JSON.parse(cached) : null;
  }

  async setAnalysis(callSessionId: string, result: DeepAnalysisOutput): Promise {
    await this.redis.setex(
      `disposition:${callSessionId}`,
      this.TTL,
      JSON.stringify(result)
    );
  }

  async invalidateCall(callSessionId: string): Promise {
    await this.redis.del(`disposition:${callSessionId}`);
  }

  // Batch operations for efficiency
  async getMany(callSessionIds: string[]): Promise> {
    const pipeline = this.redis.pipeline();
    for (const id of callSessionIds) {
      pipeline.get(`disposition:${id}`);
    }
    const results = await pipeline.exec();
    const map = new Map();
    results.forEach((val, i) => {
      if (val?.[1]) map.set(callSessionIds[i], JSON.parse(val[1]));
    });
    return map;
  }
}
```

**Changes to `disposition-deep-reanalyzer.ts`:**
```typescript
// Replace in-memory cache + integrate Redis
const cacheService = new DispositionAnalysisCache();

async function runDeepAIAnalysis(...) {
  const cacheKey = buildDeepAnalysisCacheKey(...);
  
  // 1. Check Redis first (persistent)
  const redisHit = await cacheService.getAnalysis(callSessionId);
  if (redisHit) {
    return { output: redisHit, cacheHit: true };
  }
  
  // 2. Check in-memory cache (hot calls)
  const memHit = deepAnalysisCache.get(cacheKey);
  if (memHit) {
    // Warm Redis for future requests
    await cacheService.setAnalysis(callSessionId, memHit.value);
    return { output: memHit.value, cacheHit: true };
  }
  
  // 3. Run AI + cache both layers
  const output = await deepAnalyzeJSON(...);
  await cacheService.setAnalysis(callSessionId, output);
  deepAnalysisCache.set(cacheKey, { createdAt: Date.now(), value: output });
  
  return { output, cacheHit: false };
}
```

**ROI:** 80-90% cache hit rate on reloads = **10-50x speedup for "refresh" operations**

---

#### **1B. Aggressive Database Query Optimization**  ⭐⭐⭐⭐
**Impact:** Reduce 500 queries → 10-15 queries for batch

```sql
-- NEW: Add index for batch lookups
CREATE INDEX IF NOT EXISTS idx_dial_attempts_session_id 
  ON dialer_call_attempts(call_session_id);
CREATE INDEX IF NOT EXISTS idx_leads_attempt_id 
  ON leads(call_attempt_id);
CREATE INDEX IF NOT EXISTS idx_contacts_account_id 
  ON contacts(account_id);

-- Pre-compute for batch
SELECT 
  cs.id,
  cs.ai_disposition,
  cs.ai_transcript,
  cs.duration_sec,
  dca.id as attempt_id,
  dca.phone_dialed,
  dca.full_transcript,
  c.full_name,
  c.email,
  a.name as company,
  l.id as lead_id,
  l.qa_status,
  camp.name as campaign_name,
  camp.campaign_objective,
  camp.qa_parameters
FROM call_sessions cs
LEFT JOIN dialer_call_attempts dca ON cs.id = dca.call_session_id
LEFT JOIN contacts c ON cs.contact_id = c.id
LEFT JOIN accounts a ON c.account_id = a.id
LEFT JOIN leads l ON dca.id = l.call_attempt_id
LEFT JOIN campaigns camp ON cs.campaign_id = camp.id
WHERE cs.id IN (...) AND cs.ai_transcript IS NOT NULL
```

**TypeScript implementation:**
```typescript
// Replace multiple queries with single JOIN
async function deepReanalyzeBatch(...) {
  // OLD: Multiple separate queries (5+)
  // NEW: Single optimized query with JOINs
  const sessions = await db
    .select({
      id: callSessions.id,
      aiDisposition: callSessions.aiDisposition,
      aiTranscript: callSessions.aiTranscript,
      attempt: {
        id: dialerCallAttempts.id,
        phoneDialed: dialerCallAttempts.phoneDialed,
        fullTranscript: dialerCallAttempts.fullTranscript,
      },
      contact: {
        name: contacts.fullName,
        email: contacts.email,
        company: accounts.name,
      },
      lead: {
        id: leads.id,
        qaStatus: leads.qaStatus,
      },
      campaign: {
        name: campaigns.name,
        objective: campaigns.campaignObjective,
        qaParameters: campaigns.qaParameters,
      },
    })
    .from(callSessions)
    .leftJoin(dialerCallAttempts, eq(callSessions.id, dialerCallAttempts.callSessionId))
    .leftJoin(contacts, eq(callSessions.contactId, contacts.id))
    .leftJoin(accounts, eq(contacts.accountId, accounts.id))
    .leftJoin(leads, eq(dialerCallAttempts.id, leads.callAttemptId))
    .leftJoin(campaigns, eq(callSessions.campaignId, campaigns.id))
    .where(whereClause)
    .limit(limit);

  // Result: 50 calls in 1 query (~50ms) instead of 250 queries (~2s)
}
```

**ROI:** **10-20x database speedup** = 1-2s → 100-200ms

---

#### **1C. Enable Lightweight Triage Priority** ⭐⭐⭐
**Impact:** Skip 40-50% of calls from reaching expensive AI call

```typescript
// EXISTING: runLightweightDispositionTriage already in code
// IMPROVEMENT: Expand coverage & use as early filter

export function expandedLightweightTriage(
  transcript: string,
  currentDisposition: string,
  durationSec: number
): DispositionResult | null {
  const patterns = {
    // Group 1: Voicemail/IVR (high confidence)
    voicemail: [
      /leave a message|voicemail|mailbox|answering machine|after the beep|press \d|your call|recording/i,
      /^.*beep.*$/m, // Voicemail beep detection
    ],
    // Group 2: Clear DNC (high confidence)
    doNotCall: [
      /do not call|don't call|remove|unsubscribe|stop calling|take me off/i,
    ],
    // Group 3: Callback Requested (medium confidence)
    callback: [
      /call back|call me back|not right now|bad time|in a meeting|try again|later today|tomorrow/i,
    ],
    // Group 4: Clear False Positive from Current Disposition
    misclassified: [
      // If marked "no_answer" but has heavy contact speech
      ...(currentDisposition === "no_answer" ? [/contact:\s*.{50,}/i] : []),
    ],
  };

  // Run pattern matching only (NO AI)
  for (const pattern of patterns.voicemail) {
    if (pattern.test(transcript)) {
      return {
        suggestedDisposition: "voicemail",
        confidence: 0.91,
        reasoning: "Voicemail pattern detected (lightweight triage)",
        shouldOverride: true,
      };
    }
  }

  // ... more patterns ...

  return null; // Need deep AI
}

// In deepReanalyzeBatch, use as early filter:
const analysis = expandedLightweightTriage(transcript, currentDisp, durationSec);
if (analysis) {
  // Skip AI call, use lightweight result
  summary.stagedFastPathCount++;
  // ... proceed with result ...
} else {
  // Only then call expensive AI
  const deepAnalysis = await runDeepAIAnalysis(...);
}
```

**ROI:** Saves **20-40% of AI API calls** (50-100ms per call skipped)

---

### **TIER 2: Architectural Changes (2-4 hours)**

#### **2A. Implement Background Job Queue**  ⭐⭐⭐⭐⭐
**Impact:** Non-blocking preview/apply, process in background

```typescript
// NEW: server/services/disposition-job-queue.ts
import Bull from "bull";

export const dispositionAnalysisQueue = new Bull("disposition-analysis", {
  defaultJobOptions: {
    attempts: 2,
    backoff: { type: "exponential", delay: 2000 },
    removeOnComplete: { age: 3600 }, // Keep 1 hour
  },
});

export async function queueBatchAnalysis(
  filters: DeepReanalysisFilter,
  dryRun: boolean,
  userId: string
): Promise {
  const job = await dispositionAnalysisQueue.add(
    "analyze-batch",
    { filters, dryRun, userId },
    { 
      jobId: `${userId}-${Date.now()}`,
      priority: dryRun ? 10 : 1, // Previews are lower priority
    }
  );

  return {
    jobId: job.id,
    estimatedTime: calculateEstimate(filters.limit || 50),
  };
}

// Job processor
dispositionAnalysisQueue.process("analyze-batch", 2, async (job) => {
  const { filters, dryRun, userId } = job.data;
  
  // Report progress every N calls
  let processed = 0;
  job.progress({ status: "started", processed: 0, total: filters.limit });

  const result = await deepReanalyzeBatch(filters, dryRun);
  
  // Save to Redis for retrieval
  await redis.setex(`analysis:${job.id}`, 24 * 60 * 60, JSON.stringify(result));
  
  job.progress({ status: "completed", processed, total: filters.limit });
  return result;
});
```

**Route changes:**
```typescript
// OLD: Synchronous (blocks user)
router.post("/preview", requireAuth, async (req, res) => {
  const result = await reanalyzeBatch(filters, true);
  res.json(result); // User waits 30-180s
});

// NEW: Queue-based (user gets job ID immediately)
router.post("/preview", requireAuth, async (req, res) => {
  const { jobId, estimatedTime } = await queueBatchAnalysis(
    filters,
    true,
    req.user.id
  );
  
  // Return immediately
  res.json({
    status: "queued",
    jobId,
    estimatedTime,
    pollUrl: `/api/disposition-reanalysis/job/${jobId}/status`,
  });
});

// NEW: Poll for results
router.get("/job/:jobId/status", requireAuth, async (req, res) => {
  const job = await dispositionAnalysisQueue.getJob(req.params.jobId);
  
  if (job?.isCompleted()) {
    const cached = await redis.get(`analysis:${job.id}`);
    return res.json({
      status: "completed",
      result: JSON.parse(cached),
    });
  }
  
  if (job?.isActive()) {
    return res.json({
      status: "processing",
      ...job.progress(),
    });
  }
  
  res.status(404).json({ status: "not_found" });
});
```

**Frontend changes:**
```typescript
// components/disposition-reanalysis/use-batch-preview.ts
export function useBatchPreview() {
  const [jobId, setJobId] = useState(null);
  const [status, setStatus] = useState("idle");
  const [result, setResult] = useState(null);

  const startPreview = async (filters: ReanalysisFilter) => {
    const { jobId, estimatedTime } = await apiRequest("POST", "/api/disposition-reanalysis/preview", filters);
    setJobId(jobId);
    setStatus("queued");

    // Poll with exponential backoff
    const pollResult = await pollJobStatus(jobId, estimatedTime);
    setResult(pollResult);
    setStatus("done");
  };

  return { startPreview, status, result, jobId };
}

// In component:
{status === "queued" && }
{status === "processing" && }
{status === "done" && }
```

**ROI:** **User get feedback in  {
  const job = await dispositionAnalysisQueue.getJob(req.params.jobId);
  if (!job?.isCompleted()) {
    return res.status(400).json({ error: "Job still processing" });
  }

  res.setHeader("Content-Type", "text/csv");
  res.setHeader("Content-Disposition", "attachment; filename=disposition-reanalysis.csv");

  const redis = getRedisClient();
  const resultStream = redis.getReadStream(`analysis:${job.id}`);
  
  const csvTransformer = new Transform({
    transform(chunk, encoding, callback) {
      const result = JSON.parse(chunk);
      const csv = result.calls.map(call => [
        call.callSessionId,
        call.currentDisposition,
        call.suggestedDisposition,
        call.confidence,
      ]).join("\n");
      
      callback(null, csv);
    },
  });

  resultStream
    .pipe(csvTransformer)
    .pipe(res);
});
```

**ROI:** **Handles 100K+ results without memory spike**

---

### **TIER 3: Advanced Optimizations (4-8 hours)**

#### **3A. Implement Intelligent Caching Strategy**  ⭐⭐⭐⭐
**Impact:** Minimize recalculation across updates

```typescript
// NEW: Invalidation chain
export async function invalidateCallAnalysis(
  callSessionId: string,
): Promise {
  const session = await db.query.callSessions.findFirst({
    where: eq(callSessions.id, callSessionId),
  });

  // Cascade update
  await dispositionCache.invalidateCall(callSessionId);
  
  // Invalidate related batch analyses
  if (session?.campaignId) {
    // Mark campaign's batch results as stale
    await redis.del(`campaign-batch:${session.campaignId}`);
  }
  
  // Invalidate any ongoing jobs that referenced this call
  const jobs = await dispositionAnalysisQueue.getActiveJobs();
  for (const job of jobs) {
    if (job.data.filters.campaignId === session?.campaignId) {
      // Requeue job to include fresh data
      await job.retry();
    }
  }
}

// Trigger on disposition change
router.post("/override/:callSessionId", requireAuth, async (req, res) => {
  const result = await overrideSingleDisposition(...);
  
  // Invalidate cache
  await invalidateCallAnalysis(req.params.callSessionId);
  
  // Notify connected clients
  broadcastUpdate({ type: "disposition-changed", callSessionId });
  
  res.json(result);
});
```

**ROI:** **40-60% reduction in redundant recalculations**

---

#### **3B. Add Request Deduplication**  ⭐⭐⭐
**Impact:** Prevent duplicate AI calls from concurrent requests

```typescript
// NEW: Deduplication tracker
const inFlight = new Map>();

async function runDeepAIAnalysisDedup(
  transcript: string,
  campaignId: string,
  currentDisposition: string,
  durationSec: number,
  ...otherParams
): Promise {
  const cacheKey = buildDeepAnalysisCacheKey({
    transcript,
    campaignId,
    currentDisposition,
    durationSec,
    ...otherParams,
  });

  // If already requested, wait for that result instead of making another call
  if (inFlight.has(cacheKey)) {
    const result = await inFlight.get(cacheKey)!;
    return { output: result, cacheHit: true, dedup: true };
  }

  // Mark as in-flight
  const promise = performAIAnalysis(...)
    .finally(() => inFlight.delete(cacheKey));

  inFlight.set(cacheKey, promise);

  const output = await promise;
  return { output, cacheHit: false, dedup: false };
}
```

**ROI:** **Eliminates 15-25% of API calls** in burst scenarios

---

## 📋 Implementation Checklist

### Phase 1: Redis Cache (Day 1)
- [ ] Set up Redis Elasticache or local instance
- [ ] Implement `DispositionAnalysisCache` class
- [ ] Integrate with `runDeepAIAnalysis()`
- [ ] Add cache invalidation on disposition override
- [ ] Test with 100-call batch (expect 5x speedup on reload)

### Phase 2: Database Optimization (Day 1-2)
- [ ] Create indices on `dialer_call_attempts`, `leads`, `contacts`
- [ ] Refactor batch query to use JOINS instead of separate queries
- [ ] Benchmark before/after (target: <200ms per 50 calls)
- [ ] Add query result caching alongside Redis

### Phase 3: Job Queue (Day 2-3)
- [ ] Set up Bull/Redis queue
- [ ] Implement `queueBatchAnalysis()` and job processor
- [ ] Add polling endpoint for job status
- [ ] Update frontend to use queue-based pattern
- [ ] Add WebSocket notifications for real-time progress

### Phase 4: Streaming & Advanced (Day 3-4)
- [ ] Implement CSV/JSON stream exporter
- [ ] Add invalidation cascading
- [ ] Implement request deduplication
- [ ] Add monitoring/alerting for queue depth

---

## 🔍 Monitoring & Metrics

Add these metrics to track improvement:

```typescript
// server/monitoring/disposition-metrics.ts
import prometheus from "prom-client";

export const metrics = {
  // Cache
  cacheHitRate: new prometheus.Gauge({
    name: "disposition_cache_hit_rate",
    help: "Redis cache hit percentage",
  }),
  
  // API Calls  
  aiCallDuration: new prometheus.Histogram({
    name: "disposition_ai_call_duration_ms",
    help: "Time to complete AI analysis call",
    buckets: [500, 1000, 2000, 5000, 10000],
  }),
  
  // Queue
  jobQueueDepth: new prometheus.Gauge({
    name: "disposition_job_queue_depth",
    help: "Number of pending analysis jobs",
  }),
  
  // Database
  queryDuration: new prometheus.Histogram({
    name: "disposition_query_duration_ms",
    help: "Database query execution time",
    buckets: [10, 50, 100, 500, 1000],
  }),
};

// Usage
const start = Date.now();
const result = await runDeepAIAnalysis(...);
metrics.aiCallDuration.observe(Date.now() - start);
```

---

## Expected Results

| Metric | Before | After | Improvement |
|--------|--------|-------|------------|
| Preview time (50 calls) | 60-120s | 2-5s | **30-60x** |
| Reload time (cached) | 30-60s | <1s | **30-60x** |
| Memory per 100 calls | ~50MB | ~5MB | **10x** |
| Concurrent users supported | 3-5 | 50-100 | **15-20x** |
| App impact during analysis | High | Minimal | ✅ |

---

## References

- [Bull Job Queue Docs](https://github.com/OptimalBits/bull)
- [Redis Client (ioredis)](https://github.com/luin/ioredis)
- [Drizzle ORM Joins](https://orm.drizzle.team/docs/joins)
- [Node.js Streaming](https://nodejs.org/en/docs/guides/backpressuring-in-streams/)