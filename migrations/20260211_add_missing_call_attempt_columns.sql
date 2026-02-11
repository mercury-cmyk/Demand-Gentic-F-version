-- Add missing columns to dialer_call_attempts
-- These columns are defined in schema.ts but never had migrations
-- They are referenced by Drizzle ORM in INSERT/RETURNING clauses, causing PostgreSQL error 42703

ALTER TABLE dialer_call_attempts
ADD COLUMN IF NOT EXISTS telnyx_recording_id TEXT;

ALTER TABLE dialer_call_attempts
ADD COLUMN IF NOT EXISTS telnyx_call_id TEXT;

ALTER TABLE dialer_call_attempts
ADD COLUMN IF NOT EXISTS caller_number_id VARCHAR;

ALTER TABLE dialer_call_attempts
ADD COLUMN IF NOT EXISTS from_did TEXT;

ALTER TABLE dialer_call_attempts
ADD COLUMN IF NOT EXISTS full_transcript TEXT;

ALTER TABLE dialer_call_attempts
ADD COLUMN IF NOT EXISTS ai_transcript TEXT;

-- Add indexes for new columns
CREATE INDEX IF NOT EXISTS dialer_call_attempts_telnyx_call_id_idx ON dialer_call_attempts(telnyx_call_id);

COMMENT ON COLUMN dialer_call_attempts.telnyx_recording_id IS 'Stable Telnyx recording ID for on-demand URL generation';
COMMENT ON COLUMN dialer_call_attempts.telnyx_call_id IS 'Link to Telnyx call control ID for recordings/webhooks';
COMMENT ON COLUMN dialer_call_attempts.caller_number_id IS 'References telnyx_numbers.id from number pool';
COMMENT ON COLUMN dialer_call_attempts.from_did IS 'The actual DID used for the call';
COMMENT ON COLUMN dialer_call_attempts.full_transcript IS 'Full conversation with speaker labels';
COMMENT ON COLUMN dialer_call_attempts.ai_transcript IS 'AI agent speech only';
