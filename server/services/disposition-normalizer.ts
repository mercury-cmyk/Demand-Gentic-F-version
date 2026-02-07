/**
 * Disposition Normalizer
 * 
 * Ensures all AI call dispositions are stored as canonical values.
 * This prevents data inconsistency from varied sources (AI agents, webhooks, legacy code).
 * 
 * Canonical values: qualified_lead, not_interested, do_not_call, voicemail, no_answer, invalid_data, needs_review
 */

export type CanonicalDisposition =
  | 'qualified_lead'
  | 'not_interested'
  | 'do_not_call'
  | 'voicemail'
  | 'no_answer'
  | 'invalid_data'
  | 'needs_review'
  | 'callback_requested';

const CANONICAL_DISPOSITIONS = new Set<CanonicalDisposition>([
  'qualified_lead',
  'not_interested',
  'do_not_call',
  'voicemail',
  'no_answer',
  'invalid_data',
  'needs_review',
  'callback_requested',  // Prospect asked for specific callback time
]);

/**
 * Normalize any disposition string to a canonical value.
 * 
 * @param rawDisposition - The raw disposition from any source (AI, webhooks, legacy data)
 * @returns A canonical disposition value
 */
export function normalizeDisposition(rawDisposition: string | null | undefined): CanonicalDisposition {
  if (!rawDisposition) {
    return 'no_answer';
  }
  
  const d = rawDisposition.toLowerCase().trim().replace(/[\s_-]+/g, '_');
  
  // Already canonical
  if (CANONICAL_DISPOSITIONS.has(d as CanonicalDisposition)) {
    return d as CanonicalDisposition;
  }
  
  // Callback requested - prospect wants to be called at a specific time
  // Keep this separate from qualified_lead to preserve callback scheduling context
  if (['callback', 'callback_requested', 'call_back', 'call_me_back'].includes(d)) {
    return 'callback_requested';
  }

  // Qualified outcomes - creates a lead
  if ([
    'qualified', 'lead', 'meeting_booked',
    'transfer_to_human', 'transferred', 'positive_intent', 'expressed_interest',
    'handoff', 'demo_scheduled', 'appointment_set'
  ].includes(d)) {
    return 'qualified_lead';
  }
  
  // Voicemail - detected machine/voicemail
  if ([
    'voicemail', 'machine', 'machine_start', 'machine_end', 'machine_other',
    'answering_machine', 'fax'
  ].includes(d)) {
    return 'voicemail';
  }
  
  // Not interested - explicit rejection after conversation
  if ([
    'not_interested', 'rejected', 'declined', 'no_thanks', 'hung_up_after_pitch',
    'gatekeeper_block', 'no_budget', 'not_a_fit'
  ].includes(d)) {
    return 'not_interested';
  }
  
  // Do not call - add to global suppression
  if ([
    'dnc', 'dnc_request', 'do_not_call', 'stop_calling', 'remove_from_list'
  ].includes(d)) {
    return 'do_not_call';
  }
  
  // Invalid data - wrong/disconnected number
  if ([
    'wrong_number', 'invalid', 'invalid_data', 'disconnected', 'not_in_service',
    'person_left_company', 'no_longer_there'
  ].includes(d)) {
    return 'invalid_data';
  }
  
  // SIP failures - treat as no_answer for retry
  if (d.startsWith('failed') || d.includes('sip_')) {
    return 'no_answer';
  }
  
  // Ambiguous outcomes - need human review (NOT defaulting to no_answer to preserve intent)
  // These indicate the call connected but outcome is unclear
  if ([
    'needs_review', 'unclear', 'ambiguous', 'interrupted', 'call_dropped'
  ].includes(d)) {
    return 'needs_review';
  }
  
  // Technical failures and non-connects - retry with no_answer
  // This includes: completed (without outcome), connected (disconnected early), hung_up (early), etc.
  if ([
    'completed', 'connected', 'hung_up', 'pitch',
    'busy', 'no_answer', 'timeout', 'cleaned_up',
    'cleaned_up___stuck_connecting', 'stuck_connecting'
  ].includes(d)) {
    return 'no_answer';
  }
  
  // Default: unknown disposition - use no_answer for retry
  console.warn(`[DispositionNormalizer] Unknown disposition "${rawDisposition}" - defaulting to no_answer`);
  return 'no_answer';
}

/**
 * Check if a disposition value is already canonical
 */
export function isCanonicalDisposition(value: string | null | undefined): boolean {
  if (!value) return false;
  return CANONICAL_DISPOSITIONS.has(value.toLowerCase() as CanonicalDisposition);
}

/**
 * Get all canonical disposition values
 */
export function getCanonicalDispositions(): CanonicalDisposition[] {
  return Array.from(CANONICAL_DISPOSITIONS);
}
