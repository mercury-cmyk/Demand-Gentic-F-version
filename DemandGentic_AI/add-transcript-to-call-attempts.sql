-- Add transcript fields to dialer_call_attempts table
-- This allows Gemini Live calls to store transcripts directly

-- Add full_transcript column (full conversation with speaker labels)
ALTER TABLE dialer_call_attempts 
ADD COLUMN IF NOT EXISTS full_transcript TEXT;

-- Add ai_transcript column (AI agent's speech only, for backwards compatibility)
ALTER TABLE dialer_call_attempts 
ADD COLUMN IF NOT EXISTS ai_transcript TEXT;

-- Add index for transcript analysis
CREATE INDEX IF NOT EXISTS dialer_call_attempts_transcript_idx 
ON dialer_call_attempts (id) 
WHERE full_transcript IS NOT NULL;

-- Comment explaining the fields
COMMENT ON COLUMN dialer_call_attempts.full_transcript IS 'Full conversation transcript with speaker labels (Agent/Contact)';
COMMENT ON COLUMN dialer_call_attempts.ai_transcript IS 'AI agent speech only (for backwards compatibility)';