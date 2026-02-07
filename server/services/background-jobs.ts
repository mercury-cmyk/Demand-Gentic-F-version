/**
 * Background Jobs Scheduler
 * Runs AI-powered QA processing tasks and queue maintenance at regular intervals
 */

import { processPendingTranscriptions } from './google-transcription';
import { processUnanalyzedLeads } from './ai-qa-analyzer';
import { startEmailValidationJob } from '../jobs/email-validation-job';
import { startAiEnrichmentJob } from '../jobs/ai-enrichment-job';
import { processMissingTranscripts } from './transcription-reliability';
import { db } from '../db';
import { agentQueue, campaignQueue } from '@shared/schema';
import { eq, lt, and, inArray, sql } from 'drizzle-orm';

// Job intervals (in milliseconds) - reduced frequency to minimize connections
// CRITICAL: These values were causing connection pool exhaustion
// - Reduced from 60s to 120s for transcription (less aggressive)
// - Reduced from 90s to 120s for analysis (batch smaller, run less often)
// - This allows connection pool to recover between runs
const TRANSCRIPTION_JOB_INTERVAL = 120000; // Every 120 seconds (was 60s)
const AI_ANALYSIS_JOB_INTERVAL = 120000; // Every 120 seconds (was 90s)
const LOCK_SWEEPER_INTERVAL = 600000; // Every 10 minutes (was 5 min)

let transcriptionInterval: NodeJS.Timeout | null = null;
let analysisInterval: NodeJS.Timeout | null = null;
let lockSweeperInterval: NodeJS.Timeout | null = null;

// Execution guards to prevent overlapping runs
let isTranscriptionRunning = false;
let isAnalysisRunning = false;
let isLockSweeperRunning = false;

// Configuration flags for background jobs
// AI Quality jobs (Transcription + Analysis) are ENABLED by default for lead QA
const ENABLE_TRANSCRIPTION = process.env.ENABLE_TRANSCRIPTION_JOB !== 'false';
const ENABLE_AI_ANALYSIS = process.env.ENABLE_AI_ANALYSIS_JOB !== 'false';
const ENABLE_LOCK_SWEEPER = process.env.ENABLE_LOCK_SWEEPER !== 'false';

/**
 * Lock Sweeper - Release expired locks and stuck queue entries
 */
async function sweepExpiredLocks() {
  try {
    // 1. Release expired locks in agent_queue (manual dial)
    const releasedAgentLocks = await db.update(agentQueue)
      .set({
        queueState: 'queued',
        lockedBy: null,
        lockedAt: null,
        lockExpiresAt: null,
        updatedAt: new Date()
      })
      .where(and(
        eq(agentQueue.queueState, 'locked'),
        lt(agentQueue.lockExpiresAt!, sql`NOW()`)
      ))
      .returning({ id: agentQueue.id });

    if (releasedAgentLocks.length > 0) {
      console.log(`[Lock Sweeper] Released ${releasedAgentLocks.length} expired locks in agent_queue`);
    }

    // 2. Release stuck entries in campaign_queue (power dial)
    // If a contact is in 'in_progress' state for > 10 minutes, something went wrong
    // CRITICAL FIX: Add cooldown to prevent immediate retry (back-to-back calls)
    const releasedPowerEntries = await db.update(campaignQueue)
      .set({
        status: 'queued',
        nextAttemptAt: sql`NOW() + INTERVAL '2 minutes'`,
        updatedAt: new Date()
      })
      .where(and(
        eq(campaignQueue.status, 'in_progress'),
        lt(campaignQueue.updatedAt, sql`NOW() - INTERVAL '10 minutes'`)
      ))
      .returning({ id: campaignQueue.id });

    if (releasedPowerEntries.length > 0) {
      console.log(`[Lock Sweeper] Released ${releasedPowerEntries.length} stuck entries in campaign_queue`);
    }

    // 3. Log summary if any locks were released
    const total = releasedAgentLocks.length + releasedPowerEntries.length;
    if (total > 0) {
      console.log(`[Lock Sweeper] Total locks released: ${total}`);
    }
  } catch (error) {
    console.error('[Lock Sweeper] Error releasing expired locks:', error);
  }
}

// Performance optimization: Disable continuous jobs by default, use manual triggers instead
// These jobs can hammer the database when running continuously
const ENABLE_EMAIL_VALIDATION = process.env.ENABLE_EMAIL_VALIDATION === 'true'; // DISABLED by default
const ENABLE_AI_ENRICHMENT = process.env.ENABLE_AI_ENRICHMENT === 'true'; // DISABLED by default
const ENABLE_M365_SYNC = process.env.ENABLE_M365_SYNC === 'true'; // DISABLED by default

/**
 * Start all background jobs
 */
export function startBackgroundJobs() {
  console.log('[Background Jobs] Starting background job system...');
  console.log('[Background Jobs] ========================================');
  console.log('[Background Jobs] AI QUALITY JOBS (Always On):');
  console.log(`[Background Jobs]   ✓ Transcription: ${ENABLE_TRANSCRIPTION ? 'ENABLED (every 60s)' : 'DISABLED'}`);
  console.log(`[Background Jobs]   ✓ AI Analysis: ${ENABLE_AI_ANALYSIS ? 'ENABLED (every 90s)' : 'DISABLED'}`);
  console.log('[Background Jobs] ========================================');
  console.log('[Background Jobs] SYSTEM MAINTENANCE:');
  console.log(`[Background Jobs]   • Lock Sweeper: ${ENABLE_LOCK_SWEEPER ? 'ENABLED (every 10min)' : 'DISABLED'}`);
  console.log('[Background Jobs] ========================================');
  console.log('[Background Jobs] ON-DEMAND JOBS (Manual Trigger):');
  console.log(`[Background Jobs]   • Email Validation: ${ENABLE_EMAIL_VALIDATION ? 'AUTO-RUN ENABLED' : 'MANUAL ONLY (use API)'}`);
  console.log(`[Background Jobs]   • AI Enrichment: ${ENABLE_AI_ENRICHMENT ? 'AUTO-RUN ENABLED' : 'MANUAL ONLY (use API)'}`);
  console.log(`[Background Jobs]   • M365 Email Sync: ${ENABLE_M365_SYNC ? 'AUTO-RUN ENABLED' : 'MANUAL ONLY (use API)'}`);
  console.log('[Background Jobs] ========================================');

  // Transcription processing job (optional)
  if (ENABLE_TRANSCRIPTION) {
    transcriptionInterval = setInterval(async () => {
      if (isTranscriptionRunning) {
        return; // Skip if still running
      }

      isTranscriptionRunning = true;
      try {
        // Process legacy leads transcriptions (Google STT)
        await processPendingTranscriptions();

        // Process AI call transcripts that may be missing (fallback for Gemini Live)
        // This catches any calls where real-time transcription failed
        await processMissingTranscripts();
      } catch (error) {
        console.error('[Background Jobs] Transcription job error:', error);
      } finally {
        isTranscriptionRunning = false;
      }
    }, TRANSCRIPTION_JOB_INTERVAL);
  }

  // AI analysis processing job (optional)
  if (ENABLE_AI_ANALYSIS) {
    analysisInterval = setInterval(async () => {
      if (isAnalysisRunning) {
        console.warn('[Background Jobs] AI analysis job still running from previous cycle - skipping');
        return; // Skip if still running
      }

      isAnalysisRunning = true;
      const startTime = Date.now();
      try {
        console.log('[Background Jobs] Starting AI analysis job cycle...');
        await processUnanalyzedLeads();
        const duration = Date.now() - startTime;
        console.log(`[Background Jobs] AI analysis job completed in ${duration}ms`);
      } catch (error) {
        console.error('[Background Jobs] AI analysis job error:', error);
      } finally {
        isAnalysisRunning = false;
      }
    }, AI_ANALYSIS_JOB_INTERVAL);
  }

  // Lock sweeper job (optional)
  if (ENABLE_LOCK_SWEEPER) {
    lockSweeperInterval = setInterval(async () => {
      if (isLockSweeperRunning) {
        return; // Skip if still running
      }

      isLockSweeperRunning = true;
      try {
        await sweepExpiredLocks();
      } catch (error) {
        console.error('[Background Jobs] Lock sweeper job error:', error);
      } finally {
        isLockSweeperRunning = false;
      }
    }, LOCK_SWEEPER_INTERVAL);
  }

  // Email validation job (cron-based) - Only start if enabled
  if (ENABLE_EMAIL_VALIDATION) {
    startEmailValidationJob();
  } else {
    console.log('[Background Jobs] Email validation job DISABLED - use manual trigger');
  }

  // AI enrichment job (cron-based, targets contacts missing BOTH phone and address) - Only start if enabled
  if (ENABLE_AI_ENRICHMENT) {
    startAiEnrichmentJob();
  } else {
    console.log('[Background Jobs] AI enrichment job DISABLED - use manual trigger');
  }

  console.log('[Background Jobs] ✅ Job system initialized');
  console.log('[Background Jobs] 💡 Tip: Use manual trigger API endpoints for on-demand processing');

  // Email Sequence Processor - Schedule emails ready to send
  setInterval(async () => {
    try {
      const { emailSequenceProcessor } = await import('./email-sequence-processor');
      const scheduledCount = await emailSequenceProcessor.scheduleReadyEmails();
      if (scheduledCount > 0) {
        console.log(`[Background Jobs] Scheduled ${scheduledCount} sequence emails`);
      }
    } catch (error) {
      console.error('[Background Jobs] Email sequence error:', error);
    }
  }, 5 * 60 * 1000); // Every 5 minutes
}

/**
 * Stop all background jobs
 */
export function stopBackgroundJobs() {
  console.log('[Background Jobs] Stopping all background jobs...');

  if (transcriptionInterval) {
    clearInterval(transcriptionInterval);
    transcriptionInterval = null;
  }

  if (analysisInterval) {
    clearInterval(analysisInterval);
    analysisInterval = null;
  }

  if (lockSweeperInterval) {
    clearInterval(lockSweeperInterval);
    lockSweeperInterval = null;
  }

  console.log('[Background Jobs] All jobs stopped');
}

/**
 * Graceful shutdown handler
 */
process.on('SIGINT', () => {
  stopBackgroundJobs();
  process.exit(0);
});

process.on('SIGTERM', () => {
  stopBackgroundJobs();
  process.exit(0);
});