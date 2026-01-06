/**
 * Migration: Standardize Email Validation to 4-Status System
 * 
 * BEFORE: 10 statuses (unknown, valid, safe_to_send, risky, send_with_caution, 
 *         accept_all, invalid, disabled, disposable, spam_trap, ok)
 * 
 * AFTER: 4 statuses (valid, invalid, unknown, acceptable)
 * 
 * MAPPING:
 * - safe_to_send, ok → valid
 * - accept_all, risky, send_with_caution → acceptable  
 * - unknown → unknown
 * - invalid, disabled, disposable, spam_trap → invalid
 * - NULL → unknown (for consistency)
 */

BEGIN;

-- Step 1: Create new enum with 4 statuses
CREATE TYPE verification_email_status_v2 AS ENUM (
  'valid',
  'invalid', 
  'unknown',
  'acceptable'
);

-- Step 2: Add temporary columns to ALL tables using the enum
ALTER TABLE verification_contacts 
ADD COLUMN email_status_v2 verification_email_status_v2;

ALTER TABLE verification_email_validations 
ADD COLUMN status_v2 verification_email_status_v2;

-- Step 3: Migrate data in verification_contacts
UPDATE verification_contacts
SET email_status_v2 = CASE
  -- Map to VALID
  WHEN email_status IN ('safe_to_send', 'valid', 'ok') THEN 'valid'::verification_email_status_v2
  
  -- Map to ACCEPTABLE  
  WHEN email_status IN ('accept_all', 'risky', 'send_with_caution') THEN 'acceptable'::verification_email_status_v2
  
  -- Map to INVALID
  WHEN email_status IN ('invalid', 'disabled', 'disposable', 'spam_trap') THEN 'invalid'::verification_email_status_v2
  
  -- Keep UNKNOWN or convert NULL to UNKNOWN
  WHEN email_status = 'unknown' OR email_status IS NULL THEN 'unknown'::verification_email_status_v2
  
  -- Default fallback (shouldn't hit this)
  ELSE 'unknown'::verification_email_status_v2
END;

-- Step 4: Migrate data in verification_email_validations
UPDATE verification_email_validations
SET status_v2 = CASE
  WHEN status IN ('safe_to_send', 'valid', 'ok') THEN 'valid'::verification_email_status_v2
  WHEN status IN ('accept_all', 'risky', 'send_with_caution') THEN 'acceptable'::verification_email_status_v2
  WHEN status IN ('invalid', 'disabled', 'disposable', 'spam_trap') THEN 'invalid'::verification_email_status_v2
  WHEN status = 'unknown' OR status IS NULL THEN 'unknown'::verification_email_status_v2
  ELSE 'unknown'::verification_email_status_v2
END;

-- Step 5: Drop old columns from all tables
ALTER TABLE verification_contacts DROP COLUMN email_status;
ALTER TABLE verification_email_validations DROP COLUMN status;

-- Step 6: Drop old enum type (now safe since no columns use it)
DROP TYPE verification_email_status;

-- Step 7: Rename new enum to original name
ALTER TYPE verification_email_status_v2 RENAME TO verification_email_status;

-- Step 8: Rename new columns to original names
ALTER TABLE verification_contacts RENAME COLUMN email_status_v2 TO email_status;
ALTER TABLE verification_email_validations RENAME COLUMN status_v2 TO status;

-- Step 9: Set defaults
ALTER TABLE verification_contacts 
ALTER COLUMN email_status SET DEFAULT 'unknown'::verification_email_status;

-- Step 10: Migrate contacts table (uses text, not enum - simpler migration)
-- Check if column exists first manually: SELECT column_name FROM information_schema.columns WHERE table_name='contacts' AND column_name='email_status';
-- If it exists, run this UPDATE statement:
-- UPDATE contacts SET email_status = CASE WHEN email_status IN ('safe_to_send', 'ok') THEN 'valid' WHEN email_status IN ('accept_all', 'risky', 'send_with_caution') THEN 'acceptable' WHEN email_status IN ('disabled', 'disposable', 'spam_trap') THEN 'invalid' WHEN email_status = 'unknown' OR email_status IS NULL THEN 'unknown' ELSE email_status END;

COMMIT;

-- Verification queries (run these separately to check results)
-- SELECT email_status, COUNT(*) FROM verification_contacts GROUP BY email_status ORDER BY COUNT(*) DESC;
-- SELECT status, COUNT(*) FROM verification_email_validations GROUP BY status ORDER BY COUNT(*) DESC;
