-- Safe patch for preview_studio_sessions to avoid data loss
-- Adds new columns with defaults and preserves existing legacy columns

-- 1) Ensure channel_type column exists with safe default
ALTER TABLE preview_studio_sessions
  ADD COLUMN IF NOT EXISTS channel_type channel_type;

-- Backfill channel_type for existing rows based on session_type, else default to voice
UPDATE preview_studio_sessions
SET channel_type = CASE
  WHEN channel_type IS NOT NULL THEN channel_type
  WHEN session_type = 'email' THEN 'email'
  ELSE 'voice'
END
WHERE channel_type IS NULL;

-- Enforce NOT NULL with default
ALTER TABLE preview_studio_sessions
  ALTER COLUMN channel_type SET DEFAULT 'voice';

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'preview_studio_sessions'
      AND column_name = 'channel_type'
      AND is_nullable = 'YES'
  ) THEN
    EXECUTE 'ALTER TABLE preview_studio_sessions ALTER COLUMN channel_type SET NOT NULL';
  END IF;
END $$;

-- 2) Add new nullable columns used by new simulation UX (no drops)
ALTER TABLE preview_studio_sessions
  ADD COLUMN IF NOT EXISTS mode VARCHAR(20) DEFAULT 'full',
  ADD COLUMN IF NOT EXISTS current_step_id VARCHAR(100),
  ADD COLUMN IF NOT EXISTS current_step_index INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS is_complete BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS transcript JSONB DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS checkpoints JSONB DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS resolved_templates JSONB,
  ADD COLUMN IF NOT EXISTS execution_prompt TEXT,
  ADD COLUMN IF NOT EXISTS created_by VARCHAR(255) REFERENCES users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT NOW();

-- 3) Add helpful indexes if missing
CREATE INDEX IF NOT EXISTS preview_studio_sessions_channel_type_idx ON preview_studio_sessions(channel_type);
CREATE INDEX IF NOT EXISTS preview_studio_sessions_session_type_idx ON preview_studio_sessions(session_type);
CREATE INDEX IF NOT EXISTS preview_studio_sessions_status_idx ON preview_studio_sessions(status);
CREATE INDEX IF NOT EXISTS preview_studio_sessions_created_by_idx ON preview_studio_sessions(created_by);
CREATE INDEX IF NOT EXISTS preview_studio_sessions_created_at_idx ON preview_studio_sessions(created_at);