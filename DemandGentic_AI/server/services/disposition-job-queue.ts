/**
 * Disposition Reanalysis Job Queue Service
 *
 * Background job processing for disposition analysis using Bull queue.
 * Prevents blocking UI while processing large batches.
 *
 * Features:
 * - Non-blocking preview & apply operations
 * - Real-time progress updates
 * - Automatic retry on failures
 * - Job persistence across restarts
 * - Priority queue support
 * - Result expiration (24 hours)
 *
 * Performance Impact:
 * - User gets response in  | null = null;
let worker: Worker | null = null;
let queueEvents: QueueEvents | null = null;
let redisConnection: Redis | null = null;

/**
 * Initialize the job queue
 */
export async function initializeDispositionQueue(): Promise {
  if (queue) return true; // Already initialized

  if (!isRedisConfigured()) {
    console.warn(
      `${LOG_PREFIX} Redis not configured; job queue disabled. Analysis will run synchronously.`
    );
    return false;
  }

  try {
    const redisUrl = getRedisUrl();
    const redisOptions = getRedisConnectionOptions();

    if (!redisUrl) {
      console.warn(`${LOG_PREFIX} No Redis URL available`);
      return false;
    }

    // Create Redis connection for queue
    redisConnection = new Redis(redisUrl, {
      ...redisOptions,
      maxRetriesPerRequest: null,
      enableReadyCheck: false,
    });

    // Create queue
    queue = new Queue("disposition-analysis", {
      connection: redisConnection,
      defaultJobOptions: {
        attempts: 2,
        backoff: {
          type: "exponential",
          delay: 3000,
        },
        removeOnComplete: {
          age: 3600, // Keep 1 hour
        },
        removeOnFail: {
          age: 24 * 3600, // Keep 24 hours for debugging
        },
      },
    });

    // Set up queue events for progress tracking
    queueEvents = new QueueEvents("disposition-analysis", {
      connection: redisConnection,
    });

    queueEvents.on("progress", ({ jobId, data }) => {
      // Progress events handled by event listeners in routes
      console.log(`${LOG_PREFIX} Job ${jobId} progress:`, data);
    });

    queueEvents.on("completed", ({ jobId }) => {
      console.log(`${LOG_PREFIX} Job ${jobId} completed`);
    });

    queueEvents.on("failed", ({ jobId, err }) => {
      console.error(`${LOG_PREFIX} Job ${jobId} failed:`, err.message);
    });

    // Create worker (runs in this process, limited concurrency)
    worker = new Worker(
      "disposition-analysis",
      async (job) => {
        return processAnalysisJob(job);
      },
      {
        connection: redisConnection,
        concurrency: 2, // Run max 2 analysis jobs concurrently
        autorun: true,
      }
    );

    worker.on("error", (err) => {
      console.error(`${LOG_PREFIX} Worker error:`, err.message);
    });

    console.log(`${LOG_PREFIX} Queue initialized successfully`);
    return true;
  } catch (error: any) {
    console.error(`${LOG_PREFIX} Failed to initialize queue:`, error.message);
    return false;
  }
}

/**
 * Queue a batch analysis job
 * Returns immediately with job ID for polling
 */
export async function queueAnalysisJob(
  filters: DeepReanalysisFilter,
  dryRun: boolean,
  userId: string
): Promise {
  if (!queue) {
    throw new Error("Job queue not initialized. Ensure Redis is configured.");
  }

  const totalEstimate = estimateAnalysisDuration(filters.limit || 50);

  const job = await queue.add(
    "analyze-batch",
    {
      filters,
      dryRun,
      userId,
      campaignId: filters.campaignId,
    },
    {
      jobId: `analysis-${userId}-${Date.now()}`,
      priority: dryRun ? 10 : 1, // Previews are lower priority
    }
  );

  console.log(
    `${LOG_PREFIX} Job queued: ${job.id}, Priority: ${dryRun ? "low (preview)" : "high (apply)"}`
  );

  return {
    jobId: job.id || "",
    estimatedSeconds: totalEstimate,
  };
}

/**
 * Get job status and progress
 */
export async function getJobStatus(jobId: string): Promise {
  if (!queue) return null;

  const job = await queue.getJob(jobId);
  if (!job) return null;

  const state = await job.getState();
  const progress = job.progress() as any;

  let estimatedRemaining = 0;
  if (state === "active" && progress?.total && progress?.processed) {
    const secondsElapsed = (Date.now() - (job.timestamp || 0)) / 1000;
    const secondsPerItem = secondsElapsed / (progress.processed + 1);
    estimatedRemaining = Math.ceil(secondsPerItem * (progress.total - progress.processed));
  }

  return {
    status: state as any,
    processed: progress?.processed || 0,
    total: progress?.total || 0,
    estimatedSecondsRemaining: estimatedRemaining,
    currentPhase: progress?.currentPhase,
  };
}

/**
 * Get job result
 */
export async function getJobResult(jobId: string): Promise {
  if (!queue) return null;

  const job = await queue.getJob(jobId);
  if (!job) return null;

  const state = await job.getState();

  if (state === "completed") {
    return {
      jobId,
      status: "completed",
      result: job.returnvalue as DeepReanalysisSummary,
      completedAt: new Date().toISOString(),
    };
  }

  if (state === "failed") {
    return {
      jobId,
      status: "failed",
      error: job.failedReason || "Unknown error",
      completedAt: new Date().toISOString(),
    };
  }

  return null;
}

/**
 * Cancel a job
 */
export async function cancelJob(jobId: string): Promise {
  if (!queue) return false;

  const job = await queue.getJob(jobId);
  if (!job) return false;

  await job.remove();
  return true;
}

/**
 * List active jobs
 */
export async function getActiveJobs(): Promise {
  if (!queue) return [];

  const activeIds = await queue.getActiveCount();
  if (activeIds === 0) return [];

  const active = await queue.getJobs(["active"], 0, 50);
  return active.map((job) => job.id || "");
}

/**
 * Get queue statistics
 */
export async function getQueueStats(): Promise {
  if (!queue) {
    return { waiting: 0, active: 0, completed: 0, failed: 0, delayed: 0 };
  }

  const counts = await queue.getCountsPerStatus();
  return {
    waiting: counts.waiting || 0,
    active: counts.active || 0,
    completed: counts.completed || 0,
    failed: counts.failed || 0,
    delayed: counts.delayed || 0,
  };
}

/**
 * Process a single analysis job
 */
async function processAnalysisJob(
  job: any
): Promise {
  const { filters, dryRun, userId } = job.data as DispositionAnalysisJobData;

  console.log(
    `${LOG_PREFIX} [${job.id}] Starting analysis job. DryRun=${dryRun}, Limit=${filters.limit}`
  );

  try {
    // Run deep batch analysis
    const result = await deepReanalyzeBatch(filters, dryRun);

    console.log(
      `${LOG_PREFIX} [${job.id}] Analysis complete. Changes found: ${result.totalShouldChange}`
    );

    // Mark job complete with result
    return result;
  } catch (error: any) {
    console.error(`${LOG_PREFIX} [${job.id}] Analysis failed:`, error.message);
    throw new Error(`Analysis failed: ${error.message}`);
  }
}

/**
 * Estimate analysis duration based on batch size
 * Used for UI feedback
 */
function estimateAnalysisDuration(limit: number): number {
  // Rough estimate: 
  // - 2s database overhead
  // - 0.5s per call for lightweight triage (stage-1)
  // - 2.5s per call for AI analysis (stage-2)
  // - Mix of 60% fast-path and 40% deep path = ~1.2s per call average
  // - With pipelining and parallelization: ~0.8s per call realistically
  
  if (limit  {
  console.log(`${LOG_PREFIX} Shutting down queue...`);

  if (worker) {
    await worker.close();
  }

  if (queueEvents) {
    queueEvents.close();
  }

  if (queue) {
    await queue.close();
  }

  if (redisConnection) {
    redisConnection.disconnect();
  }

  queue = null;
  worker = null;
  queueEvents = null;
  redisConnection = null;

  console.log(`${LOG_PREFIX} Queue shutdown complete`);
}

/**
 * Check if queue is operational
 */
export function isQueueOperational(): boolean {
  return !!queue && queue.isPaused === false;
}