-- Migration: Fix leads.call_attempt_id foreign key constraint
--
-- Problem: leads.call_attempt_id references call_attempts.id (legacy table)
--          but the dialer system uses dialer_call_attempts.id
--          This causes FK constraint violations when creating leads from dialer calls
--
-- Solution: Drop the old FK and create a new one referencing dialer_call_attempts
--
-- NOTE: This migration is safe because:
--       1. Currently no leads have call_attempt_id set (they failed to insert due to FK)
--       2. The new FK allows null values (set null on delete)

-- Step 1: Drop the old foreign key constraint
ALTER TABLE leads DROP CONSTRAINT IF EXISTS leads_call_attempt_id_call_attempts_id_fk;

-- Step 2: Create new foreign key referencing dialer_call_attempts
-- Using 'set null' on delete to prevent cascade deletions
ALTER TABLE leads
ADD CONSTRAINT leads_call_attempt_id_dialer_call_attempts_id_fk
FOREIGN KEY (call_attempt_id)
REFERENCES dialer_call_attempts(id)
ON DELETE SET NULL;

-- Step 3: Add index for faster lookups (if not exists)
CREATE INDEX IF NOT EXISTS leads_call_attempt_id_idx ON leads(call_attempt_id);

-- Verification query (run manually to confirm):
-- SELECT
--   tc.constraint_name,
--   kcu.column_name,
--   ccu.table_name AS foreign_table_name,
--   ccu.column_name AS foreign_column_name
-- FROM information_schema.table_constraints AS tc
-- JOIN information_schema.key_column_usage AS kcu ON tc.constraint_name = kcu.constraint_name
-- JOIN information_schema.constraint_column_usage AS ccu ON ccu.constraint_name = tc.constraint_name
-- WHERE tc.constraint_type = 'FOREIGN KEY' AND tc.table_name='leads' AND kcu.column_name = 'call_attempt_id';
