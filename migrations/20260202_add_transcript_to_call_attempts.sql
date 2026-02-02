-- Add transcript columns to dialer_call_attempts table
-- These columns store the full conversation transcript and AI-only transcript for Gemini Live calls

ALTER TABLE dialer_call_attempts
ADD COLUMN IF NOT EXISTS full_transcript TEXT,
ADD COLUMN IF NOT EXISTS ai_transcript TEXT;

-- Add comment for documentation
COMMENT ON COLUMN dialer_call_attempts.full_transcript IS 'Full conversation with speaker labels (Agent/Contact)';
COMMENT ON COLUMN dialer_call_attempts.ai_transcript IS 'AI agent speech only';
