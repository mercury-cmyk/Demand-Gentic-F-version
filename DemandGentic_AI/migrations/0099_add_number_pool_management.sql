-- ============================================================================
-- NUMBER POOL MANAGEMENT SYSTEM - Database Migration
-- ============================================================================
-- Run this migration to add all tables required for the Telnyx Number Pool
-- Management System.
-- 
-- Prerequisites: Ensure campaigns, virtual_agents, users, call_sessions, and
-- dialer_call_attempts tables exist.
-- ============================================================================

-- ============================================================================
-- STEP 1: CREATE ENUMS
-- ============================================================================

DO $$ BEGIN
    CREATE TYPE number_status AS ENUM (
        'active',      -- Available for calls
        'cooling',     -- In temporary cooldown
        'suspended',   -- Admin-suspended
        'retired'      -- Permanently removed from pool
    );
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE number_reputation_band AS ENUM (
        'excellent',   -- 85-100
        'healthy',     -- 70-84
        'warning',     -- 55-69
        'risk',        -- 40-54
        'burned'       -- 0-39
    );
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE assignment_scope AS ENUM (
        'campaign',      -- Assigned to specific campaign
        'agent',         -- Assigned to specific AI agent
        'region',        -- Geographic pool
        'global'         -- Available to all
    );
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE cooldown_reason AS ENUM (
        'consecutive_short_calls',      -- 3+ short calls in a row
        'zero_answer_rate',             -- 0% answers over last 10 calls
        'repeated_failures',            -- Multiple Telnyx errors
        'audio_quality_issues',         -- Noise/echo flagged
        'reputation_threshold',         -- Score dropped below threshold
        'manual_admin',                 -- Admin-initiated
        'carrier_block_suspected'       -- Block indicators detected
    );
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- ============================================================================
-- STEP 2: CREATE TELNYX_NUMBERS TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS telnyx_numbers (
    id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
    
    -- Telnyx identifiers
    phone_number_e164 TEXT NOT NULL UNIQUE,        -- E.164 format (+12095551234)
    telnyx_number_id TEXT,                          -- Telnyx API ID
    telnyx_connection_id TEXT,                      -- Connection/profile ID
    telnyx_messaging_profile_id TEXT,               -- For SMS if applicable
    
    -- Display & metadata
    display_name TEXT,                              -- Friendly name
    cnam TEXT,                                      -- Caller ID Name (if supported)
    
    -- Geographic data
    country_code VARCHAR(2) NOT NULL DEFAULT 'US',
    region TEXT,                                    -- State/Province (e.g., 'CA', 'TX')
    city TEXT,
    area_code VARCHAR(10),                          -- NPA for routing
    timezone TEXT,                                  -- IANA timezone
    
    -- Status & lifecycle
    status number_status NOT NULL DEFAULT 'active',
    status_reason TEXT,                             -- Why status changed
    status_changed_at TIMESTAMP,
    
    -- Tags for assignment matching
    tags TEXT[] DEFAULT '{}',                       -- e.g., ['campaign:abc', 'region:west']
    
    -- Pacing limits (per-number overrides)
    max_calls_per_hour INTEGER DEFAULT 20,
    max_calls_per_day INTEGER DEFAULT 100,
    max_concurrent_calls INTEGER DEFAULT 1,
    
    -- Last usage tracking
    last_call_at TIMESTAMP,
    last_answered_at TIMESTAMP,
    calls_today INTEGER DEFAULT 0,
    calls_this_hour INTEGER DEFAULT 0,
    
    -- Cost tracking (optional)
    monthly_cost_cents INTEGER,
    
    -- Timestamps
    acquired_at TIMESTAMP DEFAULT NOW(),
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Indexes for telnyx_numbers
CREATE INDEX IF NOT EXISTS idx_telnyx_numbers_status ON telnyx_numbers(status);
CREATE INDEX IF NOT EXISTS idx_telnyx_numbers_area_code ON telnyx_numbers(area_code);
CREATE INDEX IF NOT EXISTS idx_telnyx_numbers_region ON telnyx_numbers(region);
CREATE INDEX IF NOT EXISTS idx_telnyx_numbers_tags ON telnyx_numbers USING GIN(tags);
CREATE INDEX IF NOT EXISTS idx_telnyx_numbers_phone ON telnyx_numbers(phone_number_e164);

-- ============================================================================
-- STEP 3: CREATE NUMBER_ASSIGNMENTS TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS number_assignments (
    id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
    number_id VARCHAR NOT NULL REFERENCES telnyx_numbers(id) ON DELETE CASCADE,
    
    -- Scope determination (one should be set based on scope type)
    scope assignment_scope NOT NULL DEFAULT 'global',
    campaign_id VARCHAR REFERENCES campaigns(id) ON DELETE CASCADE,
    virtual_agent_id VARCHAR REFERENCES virtual_agents(id) ON DELETE CASCADE,
    region TEXT,                                    -- For region-based pools
    
    -- Priority for routing (higher = preferred)
    priority INTEGER NOT NULL DEFAULT 0,
    
    -- Active window
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    valid_from TIMESTAMP,
    valid_until TIMESTAMP,
    
    -- Timestamps
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    created_by VARCHAR REFERENCES users(id),
    
    CONSTRAINT valid_scope CHECK (
        (scope = 'campaign' AND campaign_id IS NOT NULL) OR
        (scope = 'agent' AND virtual_agent_id IS NOT NULL) OR
        (scope = 'region' AND region IS NOT NULL) OR
        (scope = 'global')
    )
);

-- Indexes for number_assignments
CREATE INDEX IF NOT EXISTS idx_number_assignments_number ON number_assignments(number_id);
CREATE INDEX IF NOT EXISTS idx_number_assignments_campaign ON number_assignments(campaign_id);
CREATE INDEX IF NOT EXISTS idx_number_assignments_agent ON number_assignments(virtual_agent_id);
CREATE INDEX IF NOT EXISTS idx_number_assignments_scope ON number_assignments(scope);
CREATE INDEX IF NOT EXISTS idx_number_assignments_active ON number_assignments(is_active) WHERE is_active = TRUE;

-- ============================================================================
-- STEP 4: CREATE NUMBER_REPUTATION TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS number_reputation (
    id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
    number_id VARCHAR NOT NULL REFERENCES telnyx_numbers(id) ON DELETE CASCADE UNIQUE,
    
    -- Current score (0-100)
    score INTEGER NOT NULL DEFAULT 70,
    band number_reputation_band NOT NULL DEFAULT 'healthy',
    
    -- Component scores (for transparency)
    answer_rate_score INTEGER DEFAULT 50,           -- Higher = better
    duration_score INTEGER DEFAULT 50,              -- Higher = better (longer calls)
    short_call_score INTEGER DEFAULT 50,            -- Higher = fewer short calls
    hangup_score INTEGER DEFAULT 50,                -- Higher = fewer immediate hangups
    voicemail_score INTEGER DEFAULT 50,             -- Lower voicemail rate = higher
    failure_score INTEGER DEFAULT 50,               -- Higher = fewer carrier errors
    
    -- Rolling metrics (last 50 calls)
    total_calls INTEGER DEFAULT 0,
    answered_calls INTEGER DEFAULT 0,
    short_calls INTEGER DEFAULT 0,                  -- < 8 seconds
    immediate_hangups INTEGER DEFAULT 0,            -- < 3 seconds
    voicemail_calls INTEGER DEFAULT 0,
    failed_calls INTEGER DEFAULT 0,
    avg_duration_sec NUMERIC(10,2) DEFAULT 0,
    
    -- Trend indicators
    score_trend TEXT DEFAULT 'stable',              -- 'improving', 'stable', 'declining'
    last_score_change INTEGER DEFAULT 0,            -- Delta from previous update
    
    -- Timestamps
    last_calculated_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Indexes for number_reputation
CREATE INDEX IF NOT EXISTS idx_number_reputation_score ON number_reputation(score DESC);
CREATE INDEX IF NOT EXISTS idx_number_reputation_band ON number_reputation(band);

-- ============================================================================
-- STEP 5: CREATE NUMBER_METRICS_DAILY TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS number_metrics_daily (
    id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
    number_id VARCHAR NOT NULL REFERENCES telnyx_numbers(id) ON DELETE CASCADE,
    metric_date DATE NOT NULL,
    
    -- Call volume
    total_calls INTEGER DEFAULT 0,
    answered_calls INTEGER DEFAULT 0,
    no_answer_calls INTEGER DEFAULT 0,
    voicemail_calls INTEGER DEFAULT 0,
    busy_calls INTEGER DEFAULT 0,
    failed_calls INTEGER DEFAULT 0,
    
    -- Quality metrics
    short_calls INTEGER DEFAULT 0,                  -- < 8s duration
    immediate_hangups INTEGER DEFAULT 0,            -- < 3s duration
    avg_duration_sec NUMERIC(10,2) DEFAULT 0,
    max_duration_sec INTEGER DEFAULT 0,
    
    -- Conversion metrics
    qualified_calls INTEGER DEFAULT 0,
    callbacks_scheduled INTEGER DEFAULT 0,
    
    -- Pacing
    peak_hour INTEGER,                              -- Hour with most calls
    peak_hour_calls INTEGER DEFAULT 0,
    
    -- Cost
    total_cost_cents INTEGER DEFAULT 0,
    
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    
    UNIQUE(number_id, metric_date)
);

-- Indexes for number_metrics_daily
CREATE INDEX IF NOT EXISTS idx_number_metrics_daily_number_date 
    ON number_metrics_daily(number_id, metric_date DESC);

-- ============================================================================
-- STEP 6: CREATE NUMBER_METRICS_WINDOW TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS number_metrics_window (
    id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
    number_id VARCHAR NOT NULL REFERENCES telnyx_numbers(id) ON DELETE CASCADE,
    
    -- Call reference
    call_session_id VARCHAR REFERENCES call_sessions(id) ON DELETE SET NULL,
    dialer_attempt_id VARCHAR REFERENCES dialer_call_attempts(id) ON DELETE SET NULL,
    
    -- Call data
    called_at TIMESTAMP NOT NULL,
    answered BOOLEAN DEFAULT FALSE,
    duration_sec INTEGER DEFAULT 0,
    disposition TEXT,
    
    -- Failure indicators
    is_short_call BOOLEAN DEFAULT FALSE,           -- < 8s
    is_immediate_hangup BOOLEAN DEFAULT FALSE,     -- < 3s
    is_voicemail BOOLEAN DEFAULT FALSE,
    is_failed BOOLEAN DEFAULT FALSE,
    failure_reason TEXT,
    
    -- Prospect info (for dedup logic)
    prospect_number_e164 TEXT,
    campaign_id VARCHAR,
    
    created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Indexes for number_metrics_window
CREATE INDEX IF NOT EXISTS idx_number_metrics_window_number_time 
    ON number_metrics_window(number_id, called_at DESC);
CREATE INDEX IF NOT EXISTS idx_number_metrics_window_prospect 
    ON number_metrics_window(prospect_number_e164, number_id);
CREATE INDEX IF NOT EXISTS idx_number_metrics_window_call_session 
    ON number_metrics_window(call_session_id);

-- ============================================================================
-- STEP 7: CREATE NUMBER_COOLDOWNS TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS number_cooldowns (
    id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
    number_id VARCHAR NOT NULL REFERENCES telnyx_numbers(id) ON DELETE CASCADE,
    
    -- Cooldown period
    started_at TIMESTAMP NOT NULL DEFAULT NOW(),
    ends_at TIMESTAMP NOT NULL,
    ended_early_at TIMESTAMP,                       -- If admin overrides
    
    -- Reason
    reason cooldown_reason NOT NULL,
    reason_details JSONB,                           -- Additional context
    
    -- Recovery settings
    recovery_max_calls_per_hour INTEGER,            -- Reduced limits after cooldown
    recovery_max_calls_per_day INTEGER,
    recovery_duration_hours INTEGER DEFAULT 24,     -- How long recovery limits last
    
    -- Tracking
    triggered_by VARCHAR,                           -- 'system' or user ID
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    
    created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Indexes for number_cooldowns
CREATE INDEX IF NOT EXISTS idx_number_cooldowns_number_active 
    ON number_cooldowns(number_id, is_active) WHERE is_active = TRUE;
CREATE INDEX IF NOT EXISTS idx_number_cooldowns_ends_at ON number_cooldowns(ends_at);

-- ============================================================================
-- STEP 8: CREATE PROSPECT_CALL_SUPPRESSION TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS prospect_call_suppression (
    id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
    prospect_number_e164 TEXT NOT NULL UNIQUE,
    
    -- Last attempt info
    last_called_at TIMESTAMP NOT NULL,
    last_disposition TEXT,
    last_number_id VARCHAR REFERENCES telnyx_numbers(id) ON DELETE SET NULL,
    
    -- Suppression rules
    suppress_until TIMESTAMP,                       -- Don't call until this time
    suppress_reason TEXT,                           -- 'voicemail', 'no_answer', 'callback'
    
    -- Stats
    call_attempts_24h INTEGER DEFAULT 1,
    call_attempts_7d INTEGER DEFAULT 1,
    
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Indexes for prospect_call_suppression
CREATE INDEX IF NOT EXISTS idx_prospect_suppression_number 
    ON prospect_call_suppression(prospect_number_e164);
CREATE INDEX IF NOT EXISTS idx_prospect_suppression_until 
    ON prospect_call_suppression(suppress_until);

-- ============================================================================
-- STEP 9: CREATE NUMBER_ROUTING_DECISIONS TABLE (AUDIT LOG)
-- ============================================================================

CREATE TABLE IF NOT EXISTS number_routing_decisions (
    id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
    
    -- Call reference
    call_session_id VARCHAR REFERENCES call_sessions(id) ON DELETE SET NULL,
    dialer_attempt_id VARCHAR REFERENCES dialer_call_attempts(id) ON DELETE SET NULL,
    
    -- Request context
    campaign_id VARCHAR,
    virtual_agent_id VARCHAR,
    prospect_number_e164 TEXT,
    prospect_area_code VARCHAR(10),
    prospect_region TEXT,
    
    -- Decision
    selected_number_id VARCHAR REFERENCES telnyx_numbers(id) ON DELETE SET NULL,
    selected_number_e164 TEXT,
    selection_reason TEXT,                          -- 'highest_reputation', 'local_match', etc.
    
    -- Candidates considered
    candidates_count INTEGER DEFAULT 0,
    candidates_filtered_out JSONB,                  -- {reason: count}
    
    -- Timing
    routing_latency_ms INTEGER,
    jitter_delay_ms INTEGER,                        -- Added delay for pacing
    
    decided_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Indexes for number_routing_decisions
CREATE INDEX IF NOT EXISTS idx_routing_decisions_call 
    ON number_routing_decisions(call_session_id);
CREATE INDEX IF NOT EXISTS idx_routing_decisions_number 
    ON number_routing_decisions(selected_number_id);
CREATE INDEX IF NOT EXISTS idx_routing_decisions_time 
    ON number_routing_decisions(decided_at DESC);
CREATE INDEX IF NOT EXISTS idx_routing_decisions_campaign 
    ON number_routing_decisions(campaign_id);

-- ============================================================================
-- STEP 10: UPDATE EXISTING TABLES
-- ============================================================================

-- Add caller number tracking to call_sessions
ALTER TABLE call_sessions 
    ADD COLUMN IF NOT EXISTS caller_number_id VARCHAR REFERENCES telnyx_numbers(id) ON DELETE SET NULL;
ALTER TABLE call_sessions 
    ADD COLUMN IF NOT EXISTS from_did TEXT;
ALTER TABLE call_sessions 
    ADD COLUMN IF NOT EXISTS routing_decision_id VARCHAR REFERENCES number_routing_decisions(id);

CREATE INDEX IF NOT EXISTS idx_call_sessions_caller_number 
    ON call_sessions(caller_number_id);

-- Add caller number tracking to dialer_call_attempts
ALTER TABLE dialer_call_attempts 
    ADD COLUMN IF NOT EXISTS caller_number_id VARCHAR;
ALTER TABLE dialer_call_attempts 
    ADD COLUMN IF NOT EXISTS from_did TEXT;

CREATE INDEX IF NOT EXISTS idx_dialer_attempts_caller_number 
    ON dialer_call_attempts(caller_number_id);

-- ============================================================================
-- STEP 11: CREATE NUMBER POOL ALERTS TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS number_pool_alerts (
    id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
    
    -- Alert details
    alert_type TEXT NOT NULL,                       -- 'reputation_drop', 'cooldown_triggered', 'pool_exhausted'
    severity TEXT NOT NULL DEFAULT 'warning',       -- 'info', 'warning', 'critical'
    
    -- Related entities
    number_id VARCHAR REFERENCES telnyx_numbers(id) ON DELETE CASCADE,
    campaign_id VARCHAR,
    
    -- Message
    title TEXT NOT NULL,
    description TEXT,
    details JSONB,
    
    -- Status
    is_acknowledged BOOLEAN DEFAULT FALSE,
    acknowledged_by VARCHAR REFERENCES users(id),
    acknowledged_at TIMESTAMP,
    
    created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_number_pool_alerts_unack 
    ON number_pool_alerts(is_acknowledged, created_at DESC) 
    WHERE is_acknowledged = FALSE;
CREATE INDEX IF NOT EXISTS idx_number_pool_alerts_number 
    ON number_pool_alerts(number_id);

-- ============================================================================
-- STEP 12: CREATE TRIGGER FOR UPDATED_AT
-- ============================================================================

CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Apply to tables that have updated_at
DROP TRIGGER IF EXISTS update_telnyx_numbers_updated_at ON telnyx_numbers;
CREATE TRIGGER update_telnyx_numbers_updated_at
    BEFORE UPDATE ON telnyx_numbers
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_number_reputation_updated_at ON number_reputation;
CREATE TRIGGER update_number_reputation_updated_at
    BEFORE UPDATE ON number_reputation
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_prospect_suppression_updated_at ON prospect_call_suppression;
CREATE TRIGGER update_prospect_suppression_updated_at
    BEFORE UPDATE ON prospect_call_suppression
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- ============================================================================
-- STEP 13: SEED EXISTING NUMBER (BACKWARD COMPATIBILITY)
-- ============================================================================

-- Insert the current TELNYX_FROM_NUMBER if it exists as an environment variable
-- This should be done via application code, but here's a placeholder:

-- INSERT INTO telnyx_numbers (
--     phone_number_e164,
--     display_name,
--     status,
--     area_code,
--     region,
--     max_calls_per_hour,
--     max_calls_per_day
-- ) VALUES (
--     '+12094571966',  -- Your current TELNYX_FROM_NUMBER
--     'Primary Outbound',
--     'active',
--     '209',
--     'CA',
--     20,
--     100
-- ) ON CONFLICT (phone_number_e164) DO NOTHING;

-- ============================================================================
-- MIGRATION COMPLETE
-- ============================================================================

-- Verify tables created
SELECT 
    table_name,
    (SELECT COUNT(*) FROM information_schema.columns WHERE table_name = t.table_name) as column_count
FROM information_schema.tables t
WHERE table_schema = 'public' 
AND table_name IN (
    'telnyx_numbers',
    'number_assignments',
    'number_reputation',
    'number_metrics_daily',
    'number_metrics_window',
    'number_cooldowns',
    'prospect_call_suppression',
    'number_routing_decisions',
    'number_pool_alerts'
)
ORDER BY table_name;