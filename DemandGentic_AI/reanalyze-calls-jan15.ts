/**
 * Reanalyze calls (Jan 15 onward) to correct voicemail/lead classification using Gemini.
 *
 * Scope:
 * - Call attempts since 2026-01-15 with dispositions in: qualified_lead, not_interested, voicemail, no_answer, invalid_data (plus null)
 * - Ensures transcript exists (pulls from notes or transcribes via Telnyx if recording present)
 * - Uses Gemini (generateJSON) to classify: qualified_lead | not_interested | voicemail | no_conversation | needs_review
 * - Updates dialer_call_attempts.disposition accordingly
 * - Updates/creates leads: only keep/create for qualified leads; reject voicemail/non-conversation leads
 * - Logs results to console; dryRun toggle available
 */

import 'dotenv/config';
import { db } from './server/db';
import {
  dialerCallAttempts,
  callAttempts,
  leads,
  campaigns,
  activityLog,
  contacts,
  accounts,
} from './shared/schema';
import { and, eq, gte, inArray, isNull, or } from 'drizzle-orm';
import { transcribeCallAttempt } from './server/services/telnyx-transcription';
import { generateJSON } from './server/services/vertex-ai';

const START_DATE = '2026-01-15';
const BATCH_SIZE = 50;
const DRY_RUN = false; // set true to preview without writes

type Classification =
  | 'qualified_lead'
  | 'not_interested'
  | 'voicemail'
  | 'no_conversation'
  | 'needs_review';

interface GeminiResult {
  classification: Classification;
  qualificationConfidence: number;
  reason: string;
  shouldCreateLead: boolean;
  leadSummary?: string;
  signals?: string[];
}

const TRANSCRIPT_MARKER = '[Call Transcript]';

function extractTranscriptFromNotes(notes: string | null): string | null {
  if (!notes) return null;
  const idx = notes.indexOf(TRANSCRIPT_MARKER);
  if (idx  {
  // Try embedded transcript in notes
  const fromNotes = extractTranscriptFromNotes(attempt.notes || null);
  if (fromNotes) return fromNotes;

  // Try linked lead transcript
  const [lead] = await db
    .select({ transcript: leads.transcript })
    .from(leads)
    .where(eq(leads.callAttemptId, attempt.id))
    .limit(1);
  if (lead?.transcript) return lead.transcript;

  // Transcribe from Telnyx recording if available
  if (attempt.recordingUrl) {
    console.log(`[Reanalyze] Transcribing attempt ${attempt.id} ...`);
    const didTranscribe = await transcribeCallAttempt(attempt.id);
    if (didTranscribe) {
      const [refetched] = await db
        .select({ transcript: dialerCallAttempts.transcript })
        .from(dialerCallAttempts)
        .where(eq(dialerCallAttempts.id, attempt.id))
        .limit(1);
      if (refetched?.transcript) return refetched.transcript;
    }
  }

  return null;
}

async function classifyWithGemini(transcript: string, context: { disposition?: string; campaignName?: string; contactName?: string; duration?: number; }): Promise {
  const prompt = `You are a QA reviewer. Classify this outbound call based on the transcript.

Transcript (may contain speaker tags):
"""
${transcript.slice(0, 6000)}
"""

Known disposition: ${context.disposition || 'unknown'}
Campaign: ${context.campaignName || 'unknown'}
Contact: ${context.contactName || 'unknown'}
Duration: ${context.duration ?? 0} seconds

Rules:
- If this is clearly a voicemail greeting/recording, classify as voicemail. Voicemail should never create a lead.
- If there is no human conversation (dead air, tone, IVR, machine-only), classify as no_conversation. No lead.
- If the prospect explicitly rejects ("not interested", DNC, hang up), classify as not_interested. No lead.
- Qualified lead only when the prospect engages and shows intent (interest, meeting/demo, next steps). Otherwise do not create lead.
- Be conservative: if unsure, choose needs_review with shouldCreateLead=false.

Return strict JSON:
{
  "classification": "qualified_lead" | "not_interested" | "voicemail" | "no_conversation" | "needs_review",
  "qualificationConfidence": number, // 0-1
  "reason": "short rationale",
  "shouldCreateLead": boolean,
  "leadSummary": "1-2 sentence summary if qualified",
  "signals": ["key phrases or cues"]
}`;

  return await generateJSON(prompt, { temperature: 0.2 });
}

async function upsertLeadForQualified(
  attempt: any,
  transcript: string,
  analysis: GeminiResult,
  contactInfo: { contactName?: string | null; contactEmail?: string | null; accountName?: string | null }
) {
  const [existing] = await db
    .select({ id: leads.id })
    .from(leads)
    .where(eq(leads.callAttemptId, attempt.id))
    .limit(1);

  if (existing) {
    if (DRY_RUN) return existing.id;
    await db
      .update(leads)
      .set({
        aiQualificationStatus: 'qualified',
        aiAnalysis: { gemini: analysis },
        transcript,
        qaStatus: 'new',
        updatedAt: new Date(),
      })
      .where(eq(leads.id, existing.id));
    return existing.id;
  }

  if (DRY_RUN) return 'dry-run-new-lead';

  // Only set callAttemptId if the legacy call_attempts table has this id to avoid FK issues
  const [legacyCall] = await db
    .select({ id: callAttempts.id })
    .from(callAttempts)
    .where(eq(callAttempts.id, attempt.id))
    .limit(1);

  const [newLead] = await db
    .insert(leads)
    .values({
      campaignId: attempt.campaignId,
      contactId: attempt.contactId,
      callAttemptId: legacyCall ? attempt.id : undefined,
      contactName: contactInfo.contactName || undefined,
      contactEmail: contactInfo.contactEmail || undefined,
      accountName: contactInfo.accountName || undefined,
      dialedNumber: attempt.phoneDialed || undefined,
      recordingUrl: attempt.recordingUrl || undefined,
      telnyxCallId: attempt.telnyxCallId || undefined,
      callDuration: attempt.callDurationSeconds || undefined,
      transcript,
      transcriptionStatus: 'completed',
      aiQualificationStatus: 'qualified',
      aiAnalysis: { gemini: analysis },
      qaStatus: 'new',
      notes: analysis.leadSummary || undefined,
    })
    .returning({ id: leads.id });

  return newLead.id;
}

async function rejectLeadForAttempt(attemptId: string, reason: string, classification: Classification, analysis: GeminiResult) {
  const [existing] = await db
    .select({ id: leads.id, qaStatus: leads.qaStatus })
    .from(leads)
    .where(eq(leads.callAttemptId, attemptId))
    .limit(1);

  if (!existing) return;
  if (DRY_RUN) return;

  await db
    .update(leads)
    .set({
      qaStatus: 'rejected',
      qaDecision: reason,
      aiQualificationStatus: 'not_qualified',
      aiAnalysis: { gemini: analysis },
      updatedAt: new Date(),
    })
    .where(eq(leads.id, existing.id));
}

async function logActivity(entityId: string, eventType: string, payload: any) {
  if (DRY_RUN) return;
  try {
    await db.insert(activityLog).values({
      entityType: 'call_attempt',
      entityId,
      eventType,
      payload,
      createdBy: null,
    });
  } catch (err) {
    console.warn('[Reanalyze] Failed to log activity', err);
  }
}

async function run() {
  console.log(`[Reanalyze] Starting (dryRun=${DRY_RUN})`);

  const statuses = ['qualified_lead', 'not_interested', 'voicemail', 'no_answer', 'invalid_data'];
  const rows = await db
    .select({
      id: dialerCallAttempts.id,
      campaignId: dialerCallAttempts.campaignId,
      contactId: dialerCallAttempts.contactId,
      disposition: dialerCallAttempts.disposition,
      callDurationSeconds: dialerCallAttempts.callDurationSeconds,
      notes: dialerCallAttempts.notes,
      recordingUrl: dialerCallAttempts.recordingUrl,
      telnyxCallId: dialerCallAttempts.telnyxCallId,
      phoneDialed: dialerCallAttempts.phoneDialed,
      createdAt: dialerCallAttempts.createdAt,
    })
    .from(dialerCallAttempts)
    .where(
      and(
        gte(dialerCallAttempts.createdAt, new Date(START_DATE)),
        or(inArray(dialerCallAttempts.disposition, statuses as any), isNull(dialerCallAttempts.disposition))
      )
    )
    .orderBy(dialerCallAttempts.createdAt)
    .limit(5000); // safety cap

  console.log(`[Reanalyze] Fetched ${rows.length} call attempts`);

  let processed = 0;
  let updatedDispositions = 0;
  let leadsCreated = 0;
  let leadsRejected = 0;
  let skippedNoTranscript = 0;

  for (const chunk of chunkArray(rows, BATCH_SIZE)) {
    for (const attempt of chunk) {
      const transcript = await ensureTranscript(attempt);
      if (!transcript) {
        skippedNoTranscript++;
        continue;
      }

      // Fetch campaign/contact for context
      const [campaign] = await db.select({ name: campaigns.name }).from(campaigns).where(eq(campaigns.id, attempt.campaignId)).limit(1);
      const [contact] = await db
        .select({ fullName: contacts.fullName, email: contacts.email, accountId: contacts.accountId })
        .from(contacts)
        .where(eq(contacts.id, attempt.contactId))
        .limit(1);
      const accountName = contact?.accountId
        ? (await db.select({ name: accounts.name }).from(accounts).where(eq(accounts.id, contact.accountId)).limit(1))[0]?.name
        : undefined;

      const result = await classifyWithGemini(transcript, {
        disposition: attempt.disposition || undefined,
        campaignName: campaign?.name,
        contactName: contact?.fullName,
        duration: attempt.callDurationSeconds || undefined,
      });

      const targetDisposition: string =
        result.classification === 'qualified_lead'
          ? 'qualified_lead'
          : result.classification === 'not_interested'
            ? 'not_interested'
            : result.classification === 'voicemail'
              ? 'voicemail'
              : 'no_answer';

      // Update disposition if changed
      if (!DRY_RUN && attempt.disposition !== targetDisposition) {
        await db
          .update(dialerCallAttempts)
          .set({
            disposition: targetDisposition as any,
            voicemailDetected: result.classification === 'voicemail',
            dispositionProcessed: true,
            dispositionProcessedAt: new Date(),
            updatedAt: new Date(),
          })
          .where(eq(dialerCallAttempts.id, attempt.id));
        updatedDispositions++;
      }

      if (result.classification === 'qualified_lead' && result.shouldCreateLead) {
        const leadId = await upsertLeadForQualified(attempt, transcript, result, {
          contactName: contact?.fullName,
          contactEmail: contact?.email,
          accountName,
        });
        if (leadId) leadsCreated++;
      } else {
        await rejectLeadForAttempt(
          attempt.id,
          result.classification === 'voicemail'
            ? 'Voicemail reanalysis — not a live conversation'
            : 'Non-conversation or not interested per reanalysis',
          result.classification,
          result
        );
        leadsRejected++;
      }

      await logActivity(attempt.id, 'qa_analysis_completed', {
        classification: result.classification,
        reason: result.reason,
        disposition: targetDisposition,
      });

      processed++;
    }
  }

  console.log('[Reanalyze] DONE');
  console.log({ processed, updatedDispositions, leadsCreated, leadsRejected, skippedNoTranscript });
}

function chunkArray(arr: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i  process.exit(0))
  .catch((err) => {
    console.error('[Reanalyze] Error', err);
    process.exit(1);
  });