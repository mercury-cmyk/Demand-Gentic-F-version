/**
 * Contact-Level Retry Suppression
 *
 * Implements a global contact-level suppression mechanism that:
 * - Prevents calling the same contact multiple times on the same day
 * - Enforces a minimum 7-day gap after certain call outcomes
 *
 * Suppression key: contact_id (not phone_number)
 *
 * Trigger conditions (apply suppression if ANY occur):
 * - Voicemail detected
 * - No answer / unanswered
 * - Busy
 * - Rejected / declined
 * - Temporary reachability failures (unavailable, no route, etc.)
 *
 * Suppression rules:
 * - Same-day block: Don't call the same contact again on the same day
 * - Minimum 7-day gap: After any trigger condition, contact not eligible until 7 days pass
 */

// Outcomes that trigger retry suppression (7-day gap)
export const SUPPRESSION_TRIGGER_OUTCOMES = [
  'voicemail',
  'no_answer',
  'busy',
  'rejected',
  'unavailable',
  'no_route',
  'network_failure',
  'timeout',
  'machine', // AMD detection
] as const;

export type SuppressionTriggerOutcome = (typeof SUPPRESSION_TRIGGER_OUTCOMES)[number];

// Map Telnyx hangup_cause values to our canonical outcomes
export const TELNYX_HANGUP_CAUSE_MAP: Record<string, string> = {
  // Busy signals
  busy: 'busy',
  user_busy: 'busy',

  // No answer
  no_answer: 'no_answer',
  no_user_response: 'no_answer',
  originator_cancel: 'no_answer',

  // Rejected
  call_rejected: 'rejected',

  // Normal completion (not a suppression trigger)
  normal_unspecified: 'completed',
  normal_clearing: 'completed',

  // Unavailable / network issues
  destination_out_of_order: 'unavailable',
  network_out_of_order: 'network_failure',
  temporary_failure: 'unavailable',
  switch_congestion: 'unavailable',
  requested_channel_unavailable: 'no_route',

  // Invalid numbers (different handling - not retry suppression)
  unallocated_number: 'invalid_number',
  invalid_number_format: 'invalid_number',
};

// Number of days to suppress contact after a trigger outcome
export const SUPPRESSION_DAYS = 7;

/**
 * Check if an outcome should trigger the 7-day suppression
 */
export function shouldTriggerSuppression(outcome: string): boolean {
  return SUPPRESSION_TRIGGER_OUTCOMES.includes(outcome as SuppressionTriggerOutcome);
}

/**
 * Calculate the next eligible date for a contact based on the call outcome
 *
 * - For suppression trigger outcomes: 7 days from now
 * - For other outcomes: end of today (same-day block)
 */
export function calculateNextEligibleDate(outcome: string): Date {
  const now = new Date();

  if (shouldTriggerSuppression(outcome)) {
    // Add 7 days for suppression outcomes
    const nextEligible = new Date(now);
    nextEligible.setDate(nextEligible.getDate() + SUPPRESSION_DAYS);
    // Set to start of day for consistency
    nextEligible.setHours(0, 0, 0, 0);
    return nextEligible;
  }

  // For non-suppression outcomes, just block for the rest of today
  const endOfDay = new Date(now);
  endOfDay.setHours(23, 59, 59, 999);
  return endOfDay;
}

/**
 * Get a human-readable suppression reason for the outcome
 */
export function getSuppressionReason(outcome: string): string | null {
  const reasons: Record<string, string> = {
    voicemail: 'Voicemail detected - retry suppressed for 7 days',
    no_answer: 'No answer - retry suppressed for 7 days',
    busy: 'Line busy - retry suppressed for 7 days',
    rejected: 'Call rejected - retry suppressed for 7 days',
    unavailable: 'Temporarily unavailable - retry suppressed for 7 days',
    no_route: 'No route to destination - retry suppressed for 7 days',
    network_failure: 'Network failure - retry suppressed for 7 days',
    timeout: 'Call timeout - retry suppressed for 7 days',
    machine: 'Answering machine detected - retry suppressed for 7 days',
  };

  if (shouldTriggerSuppression(outcome)) {
    return reasons[outcome] || `Outcome: ${outcome} - retry suppressed for 7 days`;
  }

  return null; // No suppression reason for non-trigger outcomes
}

/**
 * Check if a contact is eligible for a call based on their nextCallEligibleAt timestamp
 *
 * @param nextCallEligibleAt - The contact's next_call_eligible_at value (can be null)
 * @returns true if the contact can be called now, false if suppressed
 */
export function isContactEligibleForCall(nextCallEligibleAt: Date | string | null): boolean {
  if (!nextCallEligibleAt) {
    return true; // No suppression set, eligible
  }

  const eligibleDate = typeof nextCallEligibleAt === 'string'
    ? new Date(nextCallEligibleAt)
    : nextCallEligibleAt;

  return new Date() >= eligibleDate;
}

/**
 * Map a Telnyx hangup cause to our canonical outcome
 *
 * @param hangupCause - The hangup_cause from Telnyx webhook
 * @returns The mapped canonical outcome
 */
export function mapTelnyxHangupCause(hangupCause: string): string {
  return TELNYX_HANGUP_CAUSE_MAP[hangupCause] || 'completed';
}
