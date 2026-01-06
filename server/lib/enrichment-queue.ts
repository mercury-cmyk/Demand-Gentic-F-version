/**
 * Verification Enrichment Queue
 * 
 * BullMQ-based background job system for AI-powered company enrichment
 * Features:
 * - Account-level deduplication to prevent duplicate API calls
 * - Chunked processing (25 contacts/chunk)
 * - Rate limiting (~40 calls/minute)
 * - Confidence fallback (≥0.55 but <0.7)
 * - Real-time progress tracking
 * - Circuit breaker for failures
 */

import { Queue, Worker, Job } from 'bullmq';
import { createQueue, createWorker, isQueueAvailable } from './queue';
import { db } from '../db';
import { verificationEnrichmentJobs, verificationContacts, accounts } from '@shared/schema';
import { eq, inArray } from 'drizzle-orm';
import CompanyEnrichmentService from './company-enrichment';

const QUEUE_NAME = 'verification-enrichment';
const CHUNK_SIZE = 40; // Process 40 contacts in parallel (matches API rate limit)
const RATE_LIMIT_DELAY = 1500; // ~40 calls/minute (1500ms between calls)
const MAX_FAILURES_PER_CHUNK = 20; // Circuit breaker threshold (higher for parallel processing)

export interface EnrichmentJobData {
  jobId: string;
  campaignId: string;
  userId: string;
  contactIds: string[];
}

export interface EnrichmentJobProgress {
  totalContacts: number;
  processedContacts: number;
  successCount: number;
  lowConfidenceCount: number;
  failedCount: number;
  skippedCount: number;
  currentChunk?: number;
  totalChunks?: number;
}

let enrichmentQueue: Queue<EnrichmentJobData> | null = null;
let enrichmentWorker: Worker<EnrichmentJobData> | null = null;

/**
 * Get the enrichment queue instance
 */
export function getEnrichmentQueue(): Queue<EnrichmentJobData> | null {
  if (!isQueueAvailable()) {
    console.warn('[EnrichmentQueue] Queue not available - Redis not configured');
    return null;
  }

  if (!enrichmentQueue) {
    enrichmentQueue = createQueue<EnrichmentJobData>(QUEUE_NAME, {
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

  enrichmentWorker = createWorker<EnrichmentJobData>(
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
): Promise<void> {
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
async function processEnrichmentJob(job: Job<EnrichmentJobData>): Promise<void> {
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
  for (let i = 0; i < sortedContactIds.length; i += CHUNK_SIZE) {
    chunks.push(sortedContactIds.slice(i, i + CHUNK_SIZE));
  }

  console.log(`[EnrichmentQueue] Processing ${chunks.length} chunks of up to ${CHUNK_SIZE} contacts each`);

  const stats = {
    totalContacts: contactIds.length,
    processedContacts: 0,
    successCount: 0,
    lowConfidenceCount: 0,
    failedCount: 0,
    skippedCount: 0
  };

  const errors: Array<{ contactId: string; accountId: string; name: string; error: string }> = [];
  const accountEnrichmentSnapshot: Record<string, boolean> = {}; // Track enriched accounts
  let totalAccounts = 0;
  let alreadyEnriched = 0;

  try {
    for (let chunkIndex = 0; chunkIndex < chunks.length; chunkIndex++) {
      const chunk = chunks[chunkIndex];
      let chunkFailures = 0;

      console.log(`[EnrichmentQueue] Processing chunk ${chunkIndex + 1}/${chunks.length} (${chunk.length} contacts)`);

      for (const contactId of chunk) {
        try {
          // Fetch contact details
          const [contact] = await db
            .select({
              id: verificationContacts.id,
              accountId: verificationContacts.accountId,
              fullName: verificationContacts.fullName,
              title: verificationContacts.title,
              addressEnrichmentStatus: verificationContacts.addressEnrichmentStatus,
              phoneEnrichmentStatus: verificationContacts.phoneEnrichmentStatus
            })
            .from(verificationContacts)
            .where(eq(verificationContacts.id, contactId))
            .limit(1);

          if (!contact) {
            console.warn(`[EnrichmentQueue] Contact ${contactId} not found - skipping`);
            stats.skippedCount++;
            stats.processedContacts++;
            continue;
          }

          // accountId is guaranteed to exist due to FK constraint
          const accountId = contact.accountId!;

          // Track total accounts
          if (!accountEnrichmentSnapshot[accountId]) {
            totalAccounts++;
          }

          // Check if account already enriched (deduplication)
          const accountAlreadyEnriched = 
            accountEnrichmentSnapshot[accountId] ||
            await CompanyEnrichmentService.checkAccountEnrichment(accountId);

          if (accountAlreadyEnriched) {
            // Account already enriched - just propagate to this contact
            console.log(`[EnrichmentQueue] Account ${accountId} already enriched - propagating to contact ${contactId}`);
            await CompanyEnrichmentService.propagateToContact(contactId, accountId);

            if (!accountEnrichmentSnapshot[accountId]) {
              alreadyEnriched++;
            }

            stats.skippedCount++;
            stats.processedContacts++;
            accountEnrichmentSnapshot[accountId] = true;

            // Small delay to prevent hammering the database
            await sleep(100);
            continue;
          }

          // Get account details for enrichment
          const [account] = await db
            .select({
              id: accounts.id,
              name: accounts.name,
              domain: accounts.domain,
              hqCountry: accounts.hqCountry
            })
            .from(accounts)
            .where(eq(accounts.id, accountId))
            .limit(1);

          if (!account || !account.name) {
            console.warn(`[EnrichmentQueue] Account ${accountId} has no name - skipping contact ${contactId}`);
            errors.push({
              contactId,
              accountId,
              name: contact.fullName || 'Unknown',
              error: 'Account has no name'
            });
            stats.skippedCount++;
            stats.processedContacts++;
            continue;
          }

          // Fetch full contact details for enrichment
          const [fullContact] = await db
            .select()
            .from(verificationContacts)
            .where(eq(verificationContacts.id, contactId))
            .limit(1);

          if (!fullContact || !fullContact.contactCountry) {
            console.warn(`[EnrichmentQueue] Contact ${contactId} missing contact country - skipping`);
            errors.push({
              contactId,
              accountId,
              name: contact.fullName || 'Unknown',
              error: 'Contact country required for enrichment'
            });
            stats.skippedCount++;
            stats.processedContacts++;
            continue;
          }

          // TIER 1: Try company-level phone deduplication BEFORE AI enrichment (saves costs!)
          const deduplicatedPhone = await CompanyEnrichmentService.tryCompanyPhoneReuse(
            fullContact,
            accountId,
            campaignId
          );

          if (deduplicatedPhone) {
            // SUCCESS: Found phone from company siblings - skip AI enrichment!
            console.log(`[EnrichmentQueue] ✓ Phone deduplicated from company siblings (${deduplicatedPhone.source})`);
            
            // Store deduplicated phone as account enrichment
            const deduplicatedResult = {
              success: true,
              phone: deduplicatedPhone.phone,
              phoneConfidence: deduplicatedPhone.confidence,
              phoneError: undefined,
              // Note: Address enrichment would still run via AI if needed
              // For now, we're focusing on phone deduplication only
            };

            await CompanyEnrichmentService.storeAccountEnrichment(accountId, deduplicatedResult);
            accountEnrichmentSnapshot[accountId] = true;

            // Propagate to contact
            await CompanyEnrichmentService.propagateToContact(contactId, accountId);

            // Update contact's phoneEnrichmentStatus to track completion
            // Note: Source is tracked in logs as "Deduplicated", but status is "completed"
            await db
              .update(verificationContacts)
              .set({
                phoneEnrichmentStatus: 'completed',
                phoneEnrichedAt: new Date(),
                updatedAt: new Date(),
              })
              .where(eq(verificationContacts.id, contactId));

            stats.successCount++;
            stats.processedContacts++;

            console.log(`[EnrichmentQueue] Contact ${contactId} enriched via deduplication (no AI cost!)`);

            // Update job progress
            await updateJobProgress(jobId, {
              ...stats,
              currentChunk: chunkIndex + 1,
              totalChunks: chunks.length
            });

            // Skip AI enrichment - we already have the phone!
            continue;
          }

          // TIER 2: No deduplication match - proceed with AI enrichment
          console.log(`[EnrichmentQueue] No phone deduplication match - proceeding with AI enrichment`);

          // Rate limiting delay BEFORE enrichment call
          await sleep(RATE_LIMIT_DELAY);

          // Enrich the account using enrichCompanyData
          console.log(`[EnrichmentQueue] Enriching account ${account.id} (${account.name}) for contact ${contactId}`);

          const result = await CompanyEnrichmentService.enrichCompanyData(
            fullContact,
            account.name
          );

          if (result.success && (result.address || result.phone)) {
            // Store enrichment data at account level
            await CompanyEnrichmentService.storeAccountEnrichment(
              accountId,
              result
            );

            accountEnrichmentSnapshot[accountId] = true;

            // Propagate to contact
            await CompanyEnrichmentService.propagateToContact(contactId, accountId);

            // Check for low confidence
            const hasLowConfidence = 
              (result.address && (result.addressConfidence || 0) >= 0.55 && (result.addressConfidence || 0) < 0.7) ||
              (result.phone && (result.phoneConfidence || 0) >= 0.55 && (result.phoneConfidence || 0) < 0.7);

            if (hasLowConfidence) {
              stats.lowConfidenceCount++;
              console.log(`[EnrichmentQueue] Contact ${contactId} enriched with low confidence`);
            }

            stats.successCount++;
            console.log(`[EnrichmentQueue] Successfully enriched contact ${contactId}`);
          } else {
            // Enrichment failed
            const errorMessage = result.addressError || result.phoneError || 'Enrichment failed - no data returned';
            errors.push({
              contactId,
              accountId,
              name: contact.fullName || 'Unknown',
              error: errorMessage
            });
            stats.failedCount++;
            console.error(`[EnrichmentQueue] Failed to enrich contact ${contactId}: ${errorMessage}`);
          }

          stats.processedContacts++;

          // Update job progress
          await updateJobProgress(jobId, {
            ...stats,
            currentChunk: chunkIndex + 1,
            totalChunks: chunks.length
          });

        } catch (error: any) {
          console.error(`[EnrichmentQueue] Error processing contact ${contactId}:`, error);

          // Fetch contact info for error logging
          const [contact] = await db
            .select({
              accountId: verificationContacts.accountId,
              fullName: verificationContacts.fullName
            })
            .from(verificationContacts)
            .where(eq(verificationContacts.id, contactId))
            .limit(1);

          errors.push({
            contactId,
            accountId: contact?.accountId || 'unknown',
            name: contact?.fullName || 'Unknown',
            error: error.message || 'Unknown error'
          });
          stats.failedCount++;
          stats.processedContacts++;
          chunkFailures++;

          // Circuit breaker - if too many failures in this chunk, abort
          if (chunkFailures >= MAX_FAILURES_PER_CHUNK) {
            console.error(`[EnrichmentQueue] Circuit breaker triggered - too many failures in chunk ${chunkIndex + 1}`);
            throw new Error(`Circuit breaker triggered after ${MAX_FAILURES_PER_CHUNK} failures in chunk`);
          }
        }
      }

      // Small delay between chunks to prevent overwhelming the system
      if (chunkIndex < chunks.length - 1) {
        await sleep(500);
      }
    }

    // Job completed successfully
    await db.update(verificationEnrichmentJobs)
      .set({
        status: 'completed',
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
        errors: errors.length > 0 ? errors : [],
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
async function updateJobProgress(jobId: string, progress: EnrichmentJobProgress): Promise<void> {
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
export async function cancelEnrichmentJob(jobId: string): Promise<boolean> {
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
function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}