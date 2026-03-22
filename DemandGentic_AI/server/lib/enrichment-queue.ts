/**
 * Verification Enrichment Queue
 * 
 * BullMQ-based background job system for AI-powered company enrichment
 * Features:
 * - Account-level deduplication to prevent duplicate API calls
 * - Chunked processing (25 contacts/chunk)
 * - Rate limiting (~40 calls/minute)
 * - Confidence fallback (≥0.55 but  | null = null;
let enrichmentWorker: Worker | null = null;

/**
 * Get the enrichment queue instance
 */
export function getEnrichmentQueue(): Queue | null {
  if (!isQueueAvailable()) {
    console.warn('[EnrichmentQueue] Queue not available - Redis not configured');
    return null;
  }

  if (!enrichmentQueue) {
    enrichmentQueue = createQueue(QUEUE_NAME, {
      attempts: 2, // Retry failed jobs once
      backoff: {
        type: 'exponential',
        delay: 10000 // Start with 10s delay
      },
      removeOnComplete: 100, // Keep last 100 completed jobs
      removeOnFail: 200 // Keep last 200 failed jobs
    });

    if (enrichmentQueue) {
      console.log('[EnrichmentQueue] Queue initialized');
    }
  }

  return enrichmentQueue;
}

/**
 * Start the enrichment worker
 */
export function startEnrichmentWorker() {
  if (!isQueueAvailable()) {
    console.warn('[EnrichmentQueue] Worker not started - Redis not configured');
    return null;
  }

  if (enrichmentWorker) {
    console.log('[EnrichmentQueue] Worker already running');
    return enrichmentWorker;
  }

  enrichmentWorker = createWorker(
    QUEUE_NAME,
    processEnrichmentJob,
    {
      concurrency: 10, // Process 10 jobs in parallel (each job processes contacts sequentially)
      limiter: {
        max: 40, // 40 jobs per minute
        duration: 60000 // 1 minute
      }
    }
  );

  if (enrichmentWorker) {
    enrichmentWorker.on('completed', (job) => {
      console.log(`[EnrichmentQueue] Job ${job.id} completed for enrichment job ${job.data.jobId}`);
    });

    enrichmentWorker.on('failed', (job, err) => {
      console.error(`[EnrichmentQueue] Job ${job?.id} failed for enrichment job ${job?.data.jobId}:`, err.message);
    });

    console.log('[EnrichmentQueue] Worker started with concurrency=10 for optimized processing');
  }

  return enrichmentWorker;
}

/**
 * Queue a new enrichment job
 */
export async function queueEnrichmentJob(
  jobId: string,
  campaignId: string,
  userId: string,
  contactIds: string[]
): Promise {
  const queue = getEnrichmentQueue();

  if (!queue) {
    throw new Error('Enrichment queue not available - Redis not configured');
  }

  await queue.add(
    'enrich-contacts',
    {
      jobId,
      campaignId,
      userId,
      contactIds
    },
    {
      jobId: `enrichment-${jobId}`, // Unique job ID
      attempts: 2,
      backoff: {
        type: 'exponential',
        delay: 10000
      }
    }
  );

  console.log(`[EnrichmentQueue] Queued enrichment job ${jobId} with ${contactIds.length} contacts`);
}

/**
 * Process an enrichment job
 */
async function processEnrichmentJob(job: Job): Promise {
  const { jobId, campaignId, userId, contactIds } = job.data;

  console.log(`[EnrichmentQueue] Processing job ${jobId} with ${contactIds.length} contacts`);

  // Update job status to processing
  await db.update(verificationEnrichmentJobs)
    .set({
      status: 'processing',
      startedAt: new Date(),
      updatedAt: new Date()
    })
    .where(eq(verificationEnrichmentJobs.id, jobId));

  // PRIORITY OPTIMIZATION: Fetch all contacts and sort by phone need
  // Process contacts WITHOUT phones FIRST (highest priority)
  console.log(`[EnrichmentQueue] Fetching and prioritizing contacts by phone need...`);
  const allContacts = await db
    .select({
      id: verificationContacts.id,
      phone: verificationContacts.phone,
      mobile: verificationContacts.mobile,
      aiEnrichedPhone: verificationContacts.aiEnrichedPhone
    })
    .from(verificationContacts)
    .where(inArray(verificationContacts.id, contactIds));

  // Sort: contacts without phones FIRST
  const sortedContactIds = allContacts
    .sort((a, b) => {
      const aHasPhone = !!(a.phone || a.mobile || a.aiEnrichedPhone);
      const bHasPhone = !!(b.phone || b.mobile || b.aiEnrichedPhone);
      // Contacts without phones (false) come before those with phones (true)
      return (aHasPhone ? 1 : 0) - (bHasPhone ? 1 : 0);
    })
    .map(c => c.id);

  const withoutPhones = sortedContactIds.filter(id => {
    const contact = allContacts.find(c => c.id === id);
    return !contact?.phone && !contact?.mobile && !contact?.aiEnrichedPhone;
  }).length;

  console.log(`[EnrichmentQueue] Prioritization complete: ${withoutPhones} without phones (priority), ${sortedContactIds.length - withoutPhones} with phones`);

  // Split prioritized contacts into chunks
  const chunks: string[][] = [];
  for (let i = 0; i  = [];
  const accountEnrichmentSnapshot: Record = {}; // Track enriched accounts
  let totalAccounts = 0;
  let alreadyEnriched = 0;

  try {
    for (let chunkIndex = 0; chunkIndex = 0.55 && (result.addressConfidence || 0) = 0.55 && (result.phoneConfidence || 0) = MAX_FAILURES_PER_CHUNK) {
            console.error(`[EnrichmentQueue] Circuit breaker triggered - too many failures in chunk ${chunkIndex + 1}`);
            throw new Error(`Circuit breaker triggered after ${MAX_FAILURES_PER_CHUNK} failures in chunk`);
          }
        }
      }

      // Small delay between chunks to prevent overwhelming the system
      if (chunkIndex  0 ? errors : [],
        finishedAt: new Date(),
        updatedAt: new Date()
      })
      .where(eq(verificationEnrichmentJobs.id, jobId));

    console.log(
      `[EnrichmentQueue] Job ${jobId} completed: ` +
      `${stats.successCount} success, ` +
      `${stats.lowConfidenceCount} low confidence, ` +
      `${alreadyEnriched}/${totalAccounts} deduplicated, ` +
      `${stats.skippedCount} skipped, ` +
      `${stats.failedCount} failed`
    );

  } catch (error: any) {
    // Job failed
    console.error(`[EnrichmentQueue] Job ${jobId} failed:`, error);

    await db.update(verificationEnrichmentJobs)
      .set({
        status: 'failed',
        processedContacts: stats.processedContacts,
        processedAccounts: Object.keys(accountEnrichmentSnapshot).length,
        totalAccounts,
        successCount: stats.successCount,
        lowConfidenceCount: stats.lowConfidenceCount,
        failedCount: stats.failedCount,
        skippedCount: stats.skippedCount,
        dedupeSnapshot: {
          totalAccounts,
          alreadyEnriched,
          needsEnrichment: totalAccounts - alreadyEnriched
        },
        errors: [
          ...errors,
          {
            contactId: 'SYSTEM',
            accountId: 'SYSTEM',
            name: 'System Error',
            error: error.message || 'Job processing failed'
          }
        ],
        errorMessage: error.message || 'Job processing failed',
        updatedAt: new Date()
      })
      .where(eq(verificationEnrichmentJobs.id, jobId));

    throw error; // Re-throw to mark job as failed in BullMQ
  }
}

/**
 * Update job progress incrementally
 */
async function updateJobProgress(jobId: string, progress: EnrichmentJobProgress): Promise {
  try {
    await db.update(verificationEnrichmentJobs)
      .set({
        processedContacts: progress.processedContacts,
        successCount: progress.successCount,
        lowConfidenceCount: progress.lowConfidenceCount,
        failedCount: progress.failedCount,
        skippedCount: progress.skippedCount,
        updatedAt: new Date()
      })
      .where(eq(verificationEnrichmentJobs.id, jobId));
  } catch (error: any) {
    // Handle unique constraint violation when job was cancelled during processing
    if (error.code === '23505') {
      // Check if job was cancelled - if so, gracefully exit
      const [job] = await db
        .select({ status: verificationEnrichmentJobs.status })
        .from(verificationEnrichmentJobs)
        .where(eq(verificationEnrichmentJobs.id, jobId))
        .limit(1);

      if (job && job.status === 'cancelled') {
        console.log(`[EnrichmentQueue] Job ${jobId} was cancelled - stopping progress updates`);
        throw new Error('JOB_CANCELLED'); // Signal worker to stop
      }
    }

    // Re-throw other errors
    throw error;
  }
}

/**
 * Cancel an enrichment job
 */
export async function cancelEnrichmentJob(jobId: string): Promise {
  const queue = getEnrichmentQueue();

  if (!queue) {
    console.warn('[EnrichmentQueue] Cannot cancel job - queue not available');
    return false;
  }

  try {
    // Get the BullMQ job using consistent key
    const bullJob = await queue.getJob(`enrichment-${jobId}`);

    if (bullJob) {
      // First discard the job to prevent retries, then remove it atomically
      await bullJob.discard();
      await bullJob.remove();
      console.log(`[EnrichmentQueue] Discarded and removed job ${jobId} from queue`);
    }

    // Update database status (Note: This is now called from the API route within a transaction)
    // Keeping this here for backwards compatibility with direct cancelEnrichmentJob calls
    await db.update(verificationEnrichmentJobs)
      .set({
        status: 'cancelled',
        errorMessage: 'Job cancelled',
        finishedAt: new Date(),
        updatedAt: new Date()
      })
      .where(eq(verificationEnrichmentJobs.id, jobId));

    console.log(`[EnrichmentQueue] Cancelled job ${jobId}`);
    return true;

  } catch (error: any) {
    console.error(`[EnrichmentQueue] Error cancelling job ${jobId}:`, error);
    return false;
  }
}

/**
 * Initialize the enrichment queue system
 * Gracefully degrades if Redis is unavailable to prevent server startup failures
 */
export function initializeEnrichmentQueue() {
  if (!isQueueAvailable()) {
    console.warn('[EnrichmentQueue] Queue system not available - Redis not configured');
    return;
  }

  try {
    // Initialize queue and worker
    getEnrichmentQueue();
    startEnrichmentWorker();

    console.log('[EnrichmentQueue] Enrichment queue system initialized');
  } catch (error: any) {
    console.error('[EnrichmentQueue] Failed to initialize enrichment queue system:', error.message);
    console.warn('[EnrichmentQueue] Server will continue without enrichment queue functionality');
    // Don't throw - allow Express server to boot without enrichment queue
  }
}

/**
 * Sleep utility function
 */
function sleep(ms: number): Promise {
  return new Promise(resolve => setTimeout(resolve, ms));
}