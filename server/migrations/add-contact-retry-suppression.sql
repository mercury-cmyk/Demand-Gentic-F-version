-- Migration: Add Contact-Level Retry Suppression fields
-- Implements same-day blocking and 7-day minimum gap for retry outcomes
--
-- Suppression key: contact_id (not phone_number)
-- Trigger conditions: voicemail, no_answer, busy, rejected, unavailable, network failures
-- Rules:
--   - Same-day block: Don't call same contact again on same day
--   - Minimum 7-day gap: After trigger condition, contact not eligible for 7 days

-- Step 1: Add new columns to contacts table
ALTER TABLE contacts
  ADD COLUMN IF NOT EXISTS last_call_attempt_at TIMESTAMP,
  ADD COLUMN IF NOT EXISTS last_call_outcome TEXT,
  ADD COLUMN IF NOT EXISTS next_call_eligible_at TIMESTAMP,
  ADD COLUMN IF NOT EXISTS suppression_reason TEXT;

-- Step 2: Create index for efficient eligibility queries
-- This index is critical for dialer performance when filtering eligible contacts
CREATE INDEX CONCURRENTLY IF NOT EXISTS contacts_next_call_eligible_idx
  ON contacts (next_call_eligible_at)
  WHERE next_call_eligible_at IS NOT NULL;

-- Step 3: Backfill from recent call data for continuity (optional)
-- This updates contacts based on their most recent dialer_call_attempts records
-- Only processes calls from the last 7 days to set appropriate suppression
UPDATE contacts c
SET
  last_call_attempt_at = subq.latest_call,
  last_call_outcome = subq.latest_disposition,
  -- Set next_call_eligible_at to 7 days from last call for suppression outcomes
  next_call_eligible_at = CASE
    WHEN subq.latest_disposition IN ('voicemail', 'no_answer')
    THEN subq.latest_call + INTERVAL '7 days'
    ELSE NULL
  END,
  suppression_reason = CASE
    WHEN subq.latest_disposition = 'voicemail' THEN 'Voicemail detected - retry suppressed for 7 days'
    WHEN subq.latest_disposition = 'no_answer' THEN 'No answer - retry suppressed for 7 days'
    ELSE NULL
  END
FROM (
  SELECT DISTINCT ON (contact_id)
    contact_id,
    created_at as latest_call,
    disposition as latest_disposition
  FROM dialer_call_attempts
  WHERE contact_id IS NOT NULL
    AND created_at > NOW() - INTERVAL '7 days'
    AND disposition IS NOT NULL
  ORDER BY contact_id, created_at DESC
) subq
WHERE c.id = subq.contact_id
  AND c.last_call_attempt_at IS NULL;

-- Add comment explaining the fields
COMMENT ON COLUMN contacts.last_call_attempt_at IS 'Timestamp of the most recent call attempt to this contact';
COMMENT ON COLUMN contacts.last_call_outcome IS 'Outcome of the most recent call (voicemail, no_answer, busy, rejected, completed, qualified_lead, etc.)';
COMMENT ON COLUMN contacts.next_call_eligible_at IS 'Contact cannot be called until this timestamp. NULL means eligible now.';
COMMENT ON COLUMN contacts.suppression_reason IS 'Human-readable reason for the current suppression (if any)';
