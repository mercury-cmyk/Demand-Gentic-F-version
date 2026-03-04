/**
 * Transcription Regeneration Background Job Processor
 * 
 * Production-grade worker that:
 * - Continuously processes pending transcription regeneration jobs
 * - Handles retries and error tracking
 * - Provides metrics and status monitoring
 * - Integrates with the transcription health dashboard
 * - Respects API rate limits and resource constraints
 */

import pkg from "pg";
const { Pool } = pkg;
import { db } from "../db";
import { sql } from "drizzle-orm";

interface RegenerationJobConfig {
  // How many jobs to process in parallel (default: 3)
  concurrency: number;
  // Max retries per job before marking failed (default: 3)
  maxRetries: number;
  // Batch size for each API submission (default: 50, max: 50)
  batchSize: number;
  // Delay between batch submissions in ms (default: 2000)
  batchDelayMs: number;
  // Strategy: 'telnyx_phone_lookup' | 'recording_url' | 'auto' (default: 'telnyx_phone_lookup')
  strategy: 'telnyx_phone_lookup' | 'recording_url' | 'auto';
  // API endpoint (default: from BASE_URL env)
  apiEndpoint: string;
  // Enable detailed logging (default: true)
  verbose: boolean;
}

const DEFAULT_CONFIG: RegenerationJobConfig = {
  concurrency: 3,
  maxRetries: 3,
  batchSize: 50,
  batchDelayMs: 2000,
  strategy: 'telnyx_phone_lookup',
  apiEndpoint: process.env.BASE_URL || 'https://demandgentic.ai',
  verbose: true,
};

let isRunning = false;
let activeJobsCount = 0;
let config: RegenerationJobConfig = { ...DEFAULT_CONFIG };

const LOG = (msg: string) => console.log(`[TranscriptionRegeneration] ${msg}`);
const VERBOSE = (msg: string) => {
  if (config.verbose) {
    console.log(`[TranscriptionRegeneration:DEBUG] ${msg}`);
  }
};
const ERR = (msg: string, e?: any) => {
  console.error(`[TranscriptionRegeneration:ERROR] ${msg}`, e && e.message ? e.message : '');
};

/**
 * Submit a batch of call IDs to the regeneration endpoint
 */
async function submitBatch(callIds: string[], attempt: number = 1): Promise<{ success: boolean; analyzed: number; failed: number; error?: string }> {
  try {
    if (callIds.length === 0) {
      return { success: true, analyzed: 0, failed: 0 };
    }

    if (callIds.length > config.batchSize) {
      return {
        success: false,
        analyzed: 0,
        failed: callIds.length,
        error: `Batch size ${callIds.length} exceeds max ${config.batchSize}`,
      };
    }

    const payload = JSON.stringify({
      callIds,
      strategy: config.strategy,
    });

    VERBOSE(`Submitting batch of ${callIds.length} calls to ${config.apiEndpoint}/api/call-intelligence/transcription-gaps/regenerate`);

    const response = await fetch(`${config.apiEndpoint}/api/call-intelligence/transcription-gaps/regenerate`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.API_TOKEN || ''}`,
      },
      body: payload,
    });

    if (!response.ok) {
      const errText = await response.text().catch(() => 'Unknown error');
      throw new Error(`HTTP ${response.status}: ${errText.substring(0, 100)}`);
    }

    const result = await response.json();
    
    if (result.success && result.data) {
      VERBOSE(`Batch submitted: ${result.data.queued} queued, ${result.data.succeeded} succeeded, ${result.data.analyzed} analyzed`);
      return {
        success: true,
        analyzed: result.data.analyzed || 0,
        failed: result.data.failed || 0,
      };
    } else {
      throw new Error(result.error || 'Unknown API error');
    }
  } catch (err: any) {
    if (attempt < config.maxRetries) {
      ERR(`Batch submission failed (attempt ${attempt}/${config.maxRetries}): ${err.message}`);
      VERBOSE(`Retrying in 5 seconds...`);
      await new Promise(resolve => setTimeout(resolve, 5000));
      return submitBatch(callIds, attempt + 1);
    } else {
      ERR(`Batch submission failed after ${config.maxRetries} attempts: ${err.message}`);
      return {
        success: false,
        analyzed: 0,
        failed: callIds.length,
        error: err.message,
      };
    }
  }
}

/**
 * Process a single pending job
 */
async function processPendingJob(): Promise<boolean> {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });

  try {
    // Get next pending job
    const [job] = await pool.query(
      `SELECT id, call_id, source, attempts 
       FROM transcription_regeneration_jobs 
       WHERE status = 'pending' 
       ORDER BY created_at ASC 
       LIMIT 1 
       FOR UPDATE SKIP LOCKED`
    );

    if (!job) {
      return false; // No pending jobs
    }

    // Mark as in-progress
    await pool.query(
      `UPDATE transcription_regeneration_jobs 
       SET status = 'in_progress', attempts = attempts + 1, updated_at = NOW()
       WHERE id = $1`,
      [job.id]
    );

    VERBOSE(`Processing job ${job.id} (${job.source}): ${job.call_id}`);

    // Get next batch of pending jobs to submit together
    const batch = await pool.query(
      `SELECT call_id 
       FROM transcription_regeneration_jobs 
       WHERE (status = 'pending' OR (status = 'in_progress' AND attempts < $1))
       ORDER BY created_at ASC 
       LIMIT $2`,
      [config.maxRetries, config.batchSize]
    );

    const batchCallIds = batch.rows.map((r: any) => r.call_id);
    VERBOSE(`Batch for submission: ${batchCallIds.length} calls`);

    // Submit batch
    const submitResult = await submitBatch(batchCallIds);

    if (submitResult.success) {
      // Mark submitted jobs as submitted
      await pool.query(
        `UPDATE transcription_regeneration_jobs 
         SET status = 'submitted', updated_at = NOW()
         WHERE call_id = ANY($1)`,
        [batchCallIds]
      );

      VERBOSE(`Batch submitted successfully: ${submitResult.analyzed} analyzed, ${submitResult.failed} failed`);
      return true;
    } else {
      // Increment attempts
      const newAttempts = job.attempts + 1;
      
      if (newAttempts >= config.maxRetries) {
        // Mark as failed
        await pool.query(
          `UPDATE transcription_regeneration_jobs 
           SET status = 'failed', attempts = $1, error = $2, updated_at = NOW()
           WHERE id = $3`,
          [newAttempts, submitResult.error || 'Submission failed', job.id]
        );
        ERR(`Job ${job.id} failed after ${newAttempts} attempts`);
      } else {
        // Reset to pending for retry
        await pool.query(
          `UPDATE transcription_regeneration_jobs 
           SET status = 'pending', attempts = $1, updated_at = NOW()
           WHERE id = $2`,
          [newAttempts, job.id]
        );
        VERBOSE(`Job ${job.id} reset to pending for retry (attempt ${newAttempts}/${config.maxRetries})`);
      }
      
      return false;
    }
  } catch (err: any) {
    ERR(`Error processing job: ${err.message}`);
    return false;
  } finally {
    await pool.end();
  }
}

/**
 * Main worker loop - processes jobs with configurable concurrency
 */
async function startWorker() {
  if (isRunning) {
    LOG('Worker already running, ignoring start request');
    return;
  }

  isRunning = true;
  LOG(`Starting transcription regeneration worker (concurrency: ${config.concurrency})`);

  const workerLoop = async () => {
    while (isRunning) {
      try {
        // Maintain concurrency count
        while (activeJobsCount < config.concurrency && isRunning) {
          const hasWork = await processPendingJob();
          if (!hasWork) {
            // No pending jobs, wait before checking again
            await new Promise(resolve => setTimeout(resolve, 5000));
            continue;
          }

          activeJobsCount++;
          processPendingJob()
            .finally(() => {
              activeJobsCount--;
            });

          // Delay between submissions
          await new Promise(resolve => setTimeout(resolve, config.batchDelayMs));
        }

        // Wait for active jobs before checking for more
        await new Promise(resolve => setTimeout(resolve, 1000));
      } catch (err: any) {
        ERR(`Worker loop error: ${err.message}`);
        await new Promise(resolve => setTimeout(resolve, 10000));
      }
    }

    LOG('Worker stopped');
  };

  workerLoop();
}

/**
 * Stop the worker gracefully
 */
function stopWorker() {
  if (!isRunning) {
    LOG('Worker not running');
    return;
  }

  LOG('Stopping worker gracefully...');
  isRunning = false;
}

/**
 * Get worker status and statistics
 */
async function getStatus(): Promise<{
  running: boolean;
  activeJobs: number;
  config: RegenerationJobConfig;
  jobStats: {
    pending: number;
    inProgress: number;
    submitted: number;
    completed: number;
    failed: number;
    total: number;
  };
}> {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });

  try {
    const [stats] = await pool.query(
      `SELECT 
        status,
        COUNT(*) as count
      FROM transcription_regeneration_jobs
      GROUP BY status`
    );

    const jobStats = {
      pending: 0,
      inProgress: 0,
      submitted: 0,
      completed: 0,
      failed: 0,
      total: 0,
    };

    if (stats && Array.isArray(stats.rows)) {
      for (const row of stats.rows) {
        const count = parseInt(row.count || 0);
        jobStats.total += count;

        switch (row.status) {
          case 'pending':
            jobStats.pending = count;
            break;
          case 'in_progress':
            jobStats.inProgress = count;
            break;
          case 'submitted':
            jobStats.submitted = count;
            break;
          case 'completed':
            jobStats.completed = count;
            break;
          case 'failed':
            jobStats.failed = count;
            break;
        }
      }
    }

    return {
      running: isRunning,
      activeJobs: activeJobsCount,
      config,
      jobStats,
    };
  } catch (err) {
    ERR(`Error getting status: ${err}`);
    throw err;
  } finally {
    await pool.end();
  }
}

/**
 * Update configuration
 */
function updateConfig(newConfig: Partial<RegenerationJobConfig>) {
  config = { ...config, ...newConfig };
  LOG(`Configuration updated: concurrency=${config.concurrency}, batchSize=${config.batchSize}, strategy=${config.strategy}`);
}

// Export functions for API routes
export {
  startWorker,
  stopWorker,
  getStatus,
  updateConfig,
  RegenerationJobConfig,
};
