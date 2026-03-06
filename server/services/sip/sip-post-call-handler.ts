/**
 * SIP Post-Call Analysis Handler
 *
 * Creates a synthetic callSession for SIP calls and delegates to the full
 * runPostCallAnalysis pipeline (same as TeXML).  This ensures SIP calls get
 * identical treatment: deep analysis, disposition reanalysis, intelligence
 * logging, campaign outcome evaluation, potential-lead detection, etc.
 */

import { db } from '../../db';
import { leads, dialerCallAttempts, callSessions } from '@shared/schema';
import { eq } from 'drizzle-orm';

const LOG_PREFIX = '[SIPPostCallHandler]';

export interface SIPTranscriptTurn {
  speaker: 'agent' | 'contact';
  text: string;
  timestamp?: number;
}

export interface SIPPostCallData {
  callAttemptId: string;
  leadId?: string;
  campaignId: string;
  contactName?: string;
  disposition: string;
  turnTranscript: SIPTranscriptTurn[];
  callDurationSeconds: number;
  agentNotes?: string;
}

/**
 * Process SIP call post-call analysis
 *
 * Creates a synthetic callSession and then delegates to the SAME full
 * runPostCallAnalysis pipeline that TeXML uses.  This ensures SIP calls
 * get identical treatment: deep AI analysis, disposition auto-correction,
 * call intelligence logging, campaign outcome evaluation, potential-lead
 * detection, etc.
 */
export async function processSIPPostCallAnalysis(data: SIPPostCallData): Promise<void> {
  try {
    console.log(`${LOG_PREFIX} Starting post-call analysis for call attempt ${data.callAttemptId}`);

    // Build plain transcript from turns
    const plainTranscript = data.turnTranscript
      .map(t => `${t.speaker === 'agent' ? 'Agent' : 'Contact'}: ${t.text}`)
      .join('\n')
      .trim();

    if (!plainTranscript) {
      console.log(`${LOG_PREFIX} No transcript content — skipping post-call analysis for ${data.callAttemptId}`);
      return;
    }

    // Step 1: Create a synthetic callSession so the full pipeline has a session to work with
    let callSessionId: string | null = null;
    try {
      const [attempt] = await db
        .select({
          phoneDialed: dialerCallAttempts.phoneDialed,
          contactId: dialerCallAttempts.contactId,
          callStartedAt: dialerCallAttempts.callStartedAt,
        })
        .from(dialerCallAttempts)
        .where(eq(dialerCallAttempts.id, data.callAttemptId))
        .limit(1);

      const [session] = await db
        .insert(callSessions)
        .values({
          toNumberE164: attempt?.phoneDialed || 'unknown',
          fromNumber: 'sip',
          status: 'completed',
          agentType: 'ai',
          campaignId: data.campaignId || null,
          contactId: attempt?.contactId || null,
          startedAt: attempt?.callStartedAt || new Date(),
          endedAt: new Date(),
          durationSec: data.callDurationSeconds,
          aiTranscript: plainTranscript,
          aiDisposition: data.disposition,
        })
        .returning({ id: callSessions.id });

      callSessionId = session.id;

      // Link it back to the call attempt
      await db.update(dialerCallAttempts)
        .set({ callSessionId, fullTranscript: plainTranscript, updatedAt: new Date() })
        .where(eq(dialerCallAttempts.id, data.callAttemptId));

      console.log(`${LOG_PREFIX} Created synthetic callSession ${callSessionId} for SIP call ${data.callAttemptId}`);
    } catch (sessionErr) {
      console.warn(`${LOG_PREFIX} Failed to create synthetic callSession:`, sessionErr);
    }

    // Step 2: Save transcript to lead record
    try {
      const [leadByAttempt] = await db
        .select({ id: leads.id })
        .from(leads)
        .where(eq(leads.callAttemptId, data.callAttemptId))
        .limit(1);

      if (leadByAttempt) {
        await db.update(leads)
          .set({ transcript: plainTranscript, updatedAt: new Date() })
          .where(eq(leads.id, leadByAttempt.id));
        console.log(`${LOG_PREFIX} Saved transcript to lead ${leadByAttempt.id}`);
      }
    } catch (leadErr) {
      console.warn(`${LOG_PREFIX} Failed to update lead transcript:`, leadErr);
    }

    // Step 3: Delegate to the FULL post-call analysis pipeline (same as TeXML)
    // This handles: deep AI analysis, quality scoring, disposition reanalysis,
    // auto-correction, call intelligence logging, campaign outcome evaluation, etc.
    if (callSessionId) {
      const { runPostCallAnalysis } = await import('../post-call-analyzer');
      const result = await runPostCallAnalysis(callSessionId, {
        callAttemptId: data.callAttemptId,
        campaignId: data.campaignId,
        contactId: data.leadId || undefined,
        callDurationSec: data.callDurationSeconds,
        disposition: data.disposition,
        geminiTranscript: plainTranscript,
      });

      if (result.success) {
        console.log(`${LOG_PREFIX} ✅ Full post-call analysis complete for ${data.callAttemptId} (via unified pipeline)`);
      } else {
        console.warn(`${LOG_PREFIX} Post-call analysis returned: ${result.error || 'unknown error'}`);
      }
    } else {
      console.warn(`${LOG_PREFIX} No callSession created — cannot run full post-call analysis for ${data.callAttemptId}`);
    }

    console.log(`${LOG_PREFIX} Post-call analysis complete for call attempt ${data.callAttemptId}`);
  } catch (error: any) {
    console.error(`${LOG_PREFIX} ❌ Error processing post-call analysis:`, error);
  }
}

