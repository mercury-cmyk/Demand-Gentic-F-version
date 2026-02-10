/**
 * UKEF Transcript Quality + Disposition Validation Pipeline Module
 *
 * Provides transcript quality assessment, retranscription from recordings,
 * and AI-powered disposition validation for the UKEF (Lightcast) client.
 *
 * Gating:
 * - Feature flag: ukef_transcript_qa
 * - Hard client gate: Lightcast account ID only
 *
 * Safety:
 * - Audit mode by default (no auto-corrections)
 * - All actions logged to transcript_qa_audit_log
 * - No audio storage — only signed URLs to existing recordings
 * - Additive only — does not break other clients
 */

export { default as ukefTranscriptQaRouter } from './routes';
export { UKEF_CLIENT_ACCOUNT_ID } from './types';
export { classifyTranscript, assessTranscriptQuality } from './transcript-classifier';
export { analyzeDisposition, validateDispositions, applyReviewDecision } from './disposition-validator';
export { processRetranscriptionQueue } from './retranscription-job';
