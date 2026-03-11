/**
 * Analysis Recovery Sweep
 *
 * Recovers callSessions stuck in 'failed' analysisStatus by retrying analysis.
 * Also retries leads with transcriptionStatus='failed' older than 1 hour.
 *
 * Runs every 15 minutes via background-jobs.ts.
 * Capped at 10 sessions + 10 leads per sweep to avoid overloading resources.
 */

import { db } from "../db";
import { callSessions, leads } from "@shared/schema";
import { eq, and, sql, lt, isNull } from "drizzle-orm";

const LOG_PREFIX = "[AnalysisRecovery]";
const MAX_SESSIONS_PER_SWEEP = 10;
const MAX_LEADS_PER_SWEEP = 10;
const MAX_TOTAL_RETRIES = 8; // After 8 total retries, permanently abandon
const COOLDOWN_MS = 60 * 60 * 1000; // 1 hour between recovery attempts

export async function recoverFailedAnalyses(): Promise<{
  processed: number;
  recovered: number;
  permanentlyFailed: number;
}> {
  const result = { processed: 0, recovered: 0, permanentlyFailed: 0 };

  try {
    // ── Phase 1: Recover failed callSessions ──
    const cooldownCutoff = new Date(Date.now() - COOLDOWN_MS);

    const failedSessions = await db
      .select({
        id: callSessions.id,
        analysisRetryCount: callSessions.analysisRetryCount,
        campaignId: callSessions.campaignId,
        contactId: callSessions.contactId,
        durationSec: callSessions.durationSec,
        aiDisposition: callSessions.aiDisposition,
        aiTranscript: callSessions.aiTranscript,
      })
      .from(callSessions)
      .where(
        and(
          eq(callSessions.analysisStatus, 'failed'),
          lt(callSessions.analysisFailedAt, cooldownCutoff),
          sql`COALESCE(${callSessions.analysisRetryCount}, 0) < ${MAX_TOTAL_RETRIES}`
        )
      )
      .orderBy(sql`${callSessions.analysisFailedAt} ASC`)
      .limit(MAX_SESSIONS_PER_SWEEP);

    if (failedSessions.length > 0) {
      console.log(`${LOG_PREFIX} Found ${failedSessions.length} failed analysis sessions to retry`);
    }

    for (const session of failedSessions) {
      result.processed++;
      try {
        // Mark as processing
        await db.update(callSessions)
          .set({ analysisStatus: 'processing' })
          .where(eq(callSessions.id, session.id));

        const { runPostCallAnalysis } = await import("./post-call-analyzer");
        const analysisResult = await runPostCallAnalysis(session.id, {
          campaignId: session.campaignId || undefined,
          contactId: session.contactId || undefined,
          callDurationSec: session.durationSec || undefined,
          disposition: session.aiDisposition || undefined,
          geminiTranscript: session.aiTranscript || undefined,
        });

        if (analysisResult.success) {
          await db.update(callSessions)
            .set({
              analysisStatus: 'completed',
              analysisRetryCount: (session.analysisRetryCount || 0) + 1,
            })
            .where(eq(callSessions.id, session.id));
          result.recovered++;
          console.log(`${LOG_PREFIX} Recovered analysis for session ${session.id}`);
        } else {
          const newRetryCount = (session.analysisRetryCount || 0) + 1;
          if (newRetryCount >= MAX_TOTAL_RETRIES) {
            // Permanently failed — leave status as 'failed', don't retry again
            await db.update(callSessions)
              .set({
                analysisStatus: 'failed',
                analysisRetryCount: newRetryCount,
                analysisFailedAt: new Date(),
              })
              .where(eq(callSessions.id, session.id));
            result.permanentlyFailed++;
            console.warn(`${LOG_PREFIX} Session ${session.id} permanently failed after ${newRetryCount} total attempts`);
          } else {
            // Retry later
            await db.update(callSessions)
              .set({
                analysisStatus: 'failed',
                analysisRetryCount: newRetryCount,
                analysisFailedAt: new Date(),
              })
              .where(eq(callSessions.id, session.id));
          }
        }
      } catch (err: any) {
        console.error(`${LOG_PREFIX} Recovery error for session ${session.id}:`, err.message);
        const newRetryCount = (session.analysisRetryCount || 0) + 1;
        await db.update(callSessions)
          .set({
            analysisStatus: 'failed',
            analysisRetryCount: newRetryCount,
            analysisFailedAt: new Date(),
          })
          .where(eq(callSessions.id, session.id))
          .catch(() => {});
      }
    }

    // ── Phase 2: Recover leads with failed/stuck transcription ──
    // Catches: 'failed' status, NULL status (legacy), 'pending' stuck > 1 hour
    const failedLeads = await db
      .select({
        id: leads.id,
        recordingUrl: leads.recordingUrl,
        recordingS3Key: leads.recordingS3Key,
      })
      .from(leads)
      .where(
        and(
          isNull(leads.transcript),
          lt(leads.updatedAt, cooldownCutoff),
          // Must have a recording source to retry
          sql`(${leads.recordingUrl} IS NOT NULL OR ${leads.recordingS3Key} IS NOT NULL)`,
          // Pick up failed, null (legacy pre-fix), or stuck pending transcriptions
          sql`(${leads.transcriptionStatus} IN ('failed', 'pending') OR ${leads.transcriptionStatus} IS NULL)`
        )
      )
      .orderBy(sql`${leads.updatedAt} ASC`)
      .limit(MAX_LEADS_PER_SWEEP);

    if (failedLeads.length > 0) {
      console.log(`${LOG_PREFIX} Found ${failedLeads.length} leads with failed transcription to retry`);
    }

    for (const lead of failedLeads) {
      result.processed++;
      try {
        await db.update(leads)
          .set({ transcriptionStatus: 'processing', updatedAt: new Date() })
          .where(eq(leads.id, lead.id));

        const { transcribeLeadCall } = await import("./telnyx-transcription");
        const transcribed = await transcribeLeadCall(lead.id);

        if (transcribed) {
          await db.update(leads)
            .set({ transcriptionStatus: 'completed', updatedAt: new Date() })
            .where(eq(leads.id, lead.id));

          // Also run quality analysis now that transcript is available
          try {
            const { analyzeCall } = await import("./telnyx-transcription");
            await analyzeCall(lead.id);
            console.log(`${LOG_PREFIX} Recovered transcription + analysis for lead ${lead.id}`);
          } catch (qaErr: any) {
            console.warn(`${LOG_PREFIX} Transcription recovered but analysis failed for lead ${lead.id}: ${qaErr.message}`);
          }

          result.recovered++;
        } else {
          // Reset to failed with updated timestamp for next cooldown window
          await db.update(leads)
            .set({ transcriptionStatus: 'failed', updatedAt: new Date() })
            .where(eq(leads.id, lead.id));
        }
      } catch (err: any) {
        console.error(`${LOG_PREFIX} Transcription recovery error for lead ${lead.id}:`, err.message);
        await db.update(leads)
          .set({ transcriptionStatus: 'failed', updatedAt: new Date() })
          .where(eq(leads.id, lead.id))
          .catch(() => {});
      }
    }
  } catch (err: any) {
    console.error(`${LOG_PREFIX} Recovery sweep error:`, err.message);
  }

  return result;
}
