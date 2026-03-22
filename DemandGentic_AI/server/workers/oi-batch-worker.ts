/**
 * OI Batch Pipeline Worker
 *
 * Processes account intelligence generation in configurable batches.
 * Uses getOrBuildAccountIntelligence() from account-messaging-service
 * for the actual AI generation work.
 */

import { Job } from 'bullmq';
import { storage } from '../storage';
import { getOrBuildAccountIntelligence } from '../services/account-messaging-service';

export interface OiBatchJobData {
  jobId: string;
  accountIds: string[];
  batchSize: number;
  concurrency: number;
  forceRefresh: boolean;
}

export interface OiBatchJobResult {
  success: boolean;
  jobId: string;
  totalProcessed: number;
  successCount: number;
  failedCount: number;
  skippedCount: number;
  errors: Array;
}

const INTER_BATCH_DELAY_MS = 500;

export async function processOiBatchJob(job: Job): Promise {
  const { jobId, accountIds, batchSize, concurrency } = job.data;

  console.log(`[OiBatchWorker] Starting job ${jobId} — ${accountIds.length} accounts, batch=${batchSize}, concurrency=${concurrency}`);

  // Mark job as processing
  await storage.updateOiBatchJob(jobId, {
    status: 'processing',
    startedAt: new Date(),
  });

  let successCount = 0;
  let failedCount = 0;
  let skippedCount = 0;
  const errors: Array = [];

  try {
    for (let i = 0; i [] = [];
      for (let j = 0; j  {
            try {
              await getOrBuildAccountIntelligence(accountId);
              return { accountId, status: 'success' as const };
            } catch (error: any) {
              return { accountId, status: 'failed' as const, error: error?.message || String(error) };
            }
          })
        );

        for (const result of results) {
          if (result.status === 'fulfilled') {
            if (result.value.status === 'success') {
              successCount++;
            } else {
              failedCount++;
              errors.push({ accountId: result.value.accountId, error: result.value.error || 'Unknown error' });
            }
          } else {
            failedCount++;
          }
        }
      }

      const processedSoFar = Math.min(i + batchSize, accountIds.length);

      // Update DB progress
      await storage.updateOiBatchJob(jobId, {
        processedAccounts: processedSoFar,
        successCount,
        failedCount,
        skippedCount,
        errorLog: errors.slice(-100), // Keep last 100 errors
      });

      // Update BullMQ progress for polling
      await job.updateProgress({
        processed: processedSoFar,
        total: accountIds.length,
        successCount,
        failedCount,
        percent: Math.floor((processedSoFar / accountIds.length) * 100),
      });

      console.log(`[OiBatchWorker] Job ${jobId} progress: ${processedSoFar}/${accountIds.length} (${successCount} ok, ${failedCount} fail)`);

      // Delay between batches to avoid API rate limits
      if (i + batchSize  setTimeout(resolve, INTER_BATCH_DELAY_MS));
      }
    }

    // Check final status
    const finalJob = await storage.getOiBatchJob(jobId);
    const finalStatus = finalJob?.status === 'cancelled' ? 'cancelled' : 'completed';

    await storage.updateOiBatchJob(jobId, {
      status: finalStatus,
      processedAccounts: successCount + failedCount + skippedCount,
      successCount,
      failedCount,
      skippedCount,
      completedAt: new Date(),
      errorLog: errors.slice(-100),
    });

    console.log(`[OiBatchWorker] Job ${jobId} ${finalStatus} — ${successCount} success, ${failedCount} failed, ${skippedCount} skipped`);

    return {
      success: failedCount === 0,
      jobId,
      totalProcessed: successCount + failedCount + skippedCount,
      successCount,
      failedCount,
      skippedCount,
      errors: errors.slice(-50),
    };
  } catch (error: any) {
    console.error(`[OiBatchWorker] Job ${jobId} critical failure:`, error);

    await storage.updateOiBatchJob(jobId, {
      status: 'failed',
      completedAt: new Date(),
      errorLog: [...errors.slice(-99), { accountId: 'SYSTEM', error: error?.message || String(error) }],
    });

    return {
      success: false,
      jobId,
      totalProcessed: successCount + failedCount + skippedCount,
      successCount,
      failedCount,
      skippedCount,
      errors: [...errors.slice(-49), { accountId: 'SYSTEM', error: error?.message || String(error) }],
    };
  }
}