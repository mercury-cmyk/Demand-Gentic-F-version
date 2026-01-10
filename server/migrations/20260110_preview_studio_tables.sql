-- Preview Studio Tables
-- Migration for preview studio sessions, transcripts, and generated content

-- Session type enum
DO $$ BEGIN
    CREATE TYPE preview_session_type AS ENUM ('context', 'email', 'call_plan', 'simulation');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- Session status enum
DO $$ BEGIN
    CREATE TYPE preview_session_status AS ENUM ('active', 'completed', 'error');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- Transcript role enum
DO $$ BEGIN
    CREATE TYPE preview_transcript_role AS ENUM ('user', 'assistant', 'system');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- Content type enum
DO $$ BEGIN
    CREATE TYPE preview_content_type AS ENUM ('email', 'call_plan', 'prompt', 'call_brief', 'participant_plan');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- Preview sessions for tracking all preview activity
CREATE TABLE IF NOT EXISTS preview_studio_sessions (
    id VARCHAR(255) PRIMARY KEY DEFAULT gen_random_uuid()::text,
    workspace_id VARCHAR(255),
    campaign_id VARCHAR(255) REFERENCES campaigns(id) ON DELETE CASCADE,
    account_id VARCHAR(255) REFERENCES accounts(id) ON DELETE CASCADE,
    contact_id VARCHAR(255) REFERENCES contacts(id) ON DELETE SET NULL,
    user_id VARCHAR(255) REFERENCES users(id) ON DELETE SET NULL,
    virtual_agent_id VARCHAR(255) REFERENCES virtual_agents(id) ON DELETE SET NULL,
    session_type preview_session_type NOT NULL,
    status preview_session_status DEFAULT 'active',
    metadata JSONB,
    created_at TIMESTAMP DEFAULT NOW(),
    ended_at TIMESTAMP,
    updated_at TIMESTAMP DEFAULT NOW()
);

-- Simulation transcripts for voice preview sessions
CREATE TABLE IF NOT EXISTS preview_simulation_transcripts (
    id VARCHAR(255) PRIMARY KEY DEFAULT gen_random_uuid()::text,
    session_id VARCHAR(255) REFERENCES preview_studio_sessions(id) ON DELETE CASCADE NOT NULL,
    role preview_transcript_role NOT NULL,
    content TEXT NOT NULL,
    timestamp_ms INTEGER NOT NULL,
    audio_duration_ms INTEGER,
    metadata JSONB,
    created_at TIMESTAMP DEFAULT NOW()
);

-- Generated preview content (emails, call plans, prompts)
CREATE TABLE IF NOT EXISTS preview_generated_content (
    id VARCHAR(255) PRIMARY KEY DEFAULT gen_random_uuid()::text,
    session_id VARCHAR(255) REFERENCES preview_studio_sessions(id) ON DELETE CASCADE NOT NULL,
    content_type preview_content_type NOT NULL,
    content JSONB NOT NULL,
    quality_score NUMERIC(5,2),
    regeneration_count INTEGER DEFAULT 0,
    created_at TIMESTAMP DEFAULT NOW()
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_preview_sessions_campaign ON preview_studio_sessions(campaign_id);
CREATE INDEX IF NOT EXISTS idx_preview_sessions_account ON preview_studio_sessions(account_id);
CREATE INDEX IF NOT EXISTS idx_preview_sessions_user ON preview_studio_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_preview_sessions_type ON preview_studio_sessions(session_type);
CREATE INDEX IF NOT EXISTS idx_preview_sessions_status ON preview_studio_sessions(status);
CREATE INDEX IF NOT EXISTS idx_preview_sessions_created ON preview_studio_sessions(created_at);

CREATE INDEX IF NOT EXISTS idx_preview_transcripts_session ON preview_simulation_transcripts(session_id);
CREATE INDEX IF NOT EXISTS idx_preview_transcripts_role ON preview_simulation_transcripts(role);
CREATE INDEX IF NOT EXISTS idx_preview_transcripts_timestamp ON preview_simulation_transcripts(timestamp_ms);

CREATE INDEX IF NOT EXISTS idx_preview_content_session ON preview_generated_content(session_id);
CREATE INDEX IF NOT EXISTS idx_preview_content_type ON preview_generated_content(content_type);
