-- Agentic Command Center Migration
-- Creates tables for the live "Run" system with interrupts

-- ============================================================================
-- ENUMS
-- ============================================================================

DO $$ BEGIN
  CREATE TYPE agent_run_status AS ENUM (
    'queued',
    'running',
    'paused_needs_input',
    'resumed',
    'verifying',
    'completed',
    'failed',
    'cancelled'
  );
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE agent_run_phase AS ENUM (
    'understand',
    'plan',
    'execute',
    'verify',
    'summarize'
  );
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE agent_step_status AS ENUM (
    'queued',
    'running',
    'done',
    'failed',
    'skipped',
    'awaiting_approval'
  );
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE agent_interrupt_type AS ENUM (
    'missing_required_fields',
    'conflicting_instructions',
    'risky_action_confirm',
    'low_confidence_decision',
    'ambiguous_intent',
    'external_approval'
  );
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE agent_interrupt_field_type AS ENUM (
    'single_select',
    'multi_select',
    'text_short',
    'text_long',
    'number',
    'date',
    'datetime',
    'confirm',
    'entity_picker',
    'constraints'
  );
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE agent_interrupt_state AS ENUM (
    'pending',
    'submitted',
    'expired',
    'cancelled'
  );
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE agent_artifact_kind AS ENUM (
    'campaign',
    'segment',
    'list',
    'email_draft',
    'email_template',
    'call_script',
    'report',
    'file',
    'link',
    'next_action',
    'account',
    'contact',
    'pipeline_opportunity'
  );
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE agent_source_type AS ENUM (
    'db_query',
    'api_call',
    'user_context',
    'file',
    'cache',
    'external_service'
  );
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE agent_approval_state AS ENUM (
    'requested',
    'approved',
    'denied'
  );
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- ============================================================================
-- TABLES
-- ============================================================================

-- Agent Command Runs
CREATE TABLE IF NOT EXISTS agent_command_runs (
  id TEXT PRIMARY KEY,
  org_id INTEGER,
  user_id INTEGER,
  
  -- Request
  request_text TEXT NOT NULL,
  request_context JSONB,
  
  -- Status & Phase
  status agent_run_status NOT NULL DEFAULT 'queued',
  phase agent_run_phase NOT NULL DEFAULT 'understand',
  
  -- Configuration
  model TEXT DEFAULT 'gemini-2.0-flash',
  dry_run BOOLEAN DEFAULT FALSE,
  safe_mode BOOLEAN DEFAULT TRUE,
  
  -- Progress tracking
  current_step_idx INTEGER DEFAULT 0,
  total_steps INTEGER DEFAULT 0,
  
  -- Timestamps
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  cancelled_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  
  -- Error handling
  error_code TEXT,
  error_message TEXT,
  
  -- Results
  summary_md TEXT,
  outputs_json JSONB,
  
  -- Resume tracking
  last_interrupt_id TEXT,
  resume_count INTEGER DEFAULT 0
);

CREATE INDEX IF NOT EXISTS agent_command_runs_status_idx ON agent_command_runs(status);
CREATE INDEX IF NOT EXISTS agent_command_runs_user_idx ON agent_command_runs(user_id);
CREATE INDEX IF NOT EXISTS agent_command_runs_created_at_idx ON agent_command_runs(created_at);

-- Agent Command Steps
CREATE TABLE IF NOT EXISTS agent_command_steps (
  id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL REFERENCES agent_command_runs(id) ON DELETE CASCADE,
  idx INTEGER NOT NULL,
  
  -- Display info
  title TEXT NOT NULL,
  why TEXT,
  
  -- Status
  status agent_step_status NOT NULL DEFAULT 'queued',
  
  -- Tool/action info
  tool_name TEXT,
  tool_args_redacted JSONB,
  result_summary TEXT,
  
  -- Error handling
  error_message TEXT,
  retry_count INTEGER DEFAULT 0,
  
  -- Timestamps
  started_at TIMESTAMPTZ,
  finished_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  
  UNIQUE(run_id, idx)
);

CREATE INDEX IF NOT EXISTS agent_command_steps_run_id_idx ON agent_command_steps(run_id);

-- Agent Command Events (SSE audit log)
CREATE TABLE IF NOT EXISTS agent_command_events (
  id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL REFERENCES agent_command_runs(id) ON DELETE CASCADE,
  seq BIGINT NOT NULL,
  
  -- Event info
  type TEXT NOT NULL,
  phase agent_run_phase,
  step_id TEXT,
  
  -- Event data
  payload JSONB NOT NULL,
  
  -- Timestamp
  ts TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  
  UNIQUE(run_id, seq)
);

CREATE INDEX IF NOT EXISTS agent_command_events_run_id_idx ON agent_command_events(run_id);
CREATE INDEX IF NOT EXISTS agent_command_events_type_idx ON agent_command_events(type);

-- Agent Command Interrupts (Clarification forms)
CREATE TABLE IF NOT EXISTS agent_command_interrupts (
  id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL REFERENCES agent_command_runs(id) ON DELETE CASCADE,
  step_id TEXT REFERENCES agent_command_steps(id) ON DELETE SET NULL,
  
  -- Interrupt metadata
  interrupt_type agent_interrupt_type NOT NULL,
  state agent_interrupt_state NOT NULL DEFAULT 'pending',
  
  -- Display info
  title TEXT NOT NULL,
  why_needed TEXT NOT NULL,
  resume_hint TEXT,
  
  -- Form schema (versioned)
  schema_version INTEGER DEFAULT 1,
  questions JSONB NOT NULL,
  defaults JSONB,
  
  -- Behavior flags
  blocking BOOLEAN DEFAULT TRUE,
  timeout_seconds INTEGER,
  
  -- Response
  response JSONB,
  responded_at TIMESTAMPTZ,
  responded_by_user_id INTEGER,
  
  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS agent_command_interrupts_run_id_idx ON agent_command_interrupts(run_id);
CREATE INDEX IF NOT EXISTS agent_command_interrupts_state_idx ON agent_command_interrupts(state);

-- Agent Command Artifacts (Outputs panel)
CREATE TABLE IF NOT EXISTS agent_command_artifacts (
  id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL REFERENCES agent_command_runs(id) ON DELETE CASCADE,
  step_id TEXT,
  
  -- Artifact info
  kind agent_artifact_kind NOT NULL,
  title TEXT NOT NULL,
  url TEXT,
  ref_id TEXT,
  content_json JSONB,
  
  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS agent_command_artifacts_run_id_idx ON agent_command_artifacts(run_id);

-- Agent Command Sources (Source panel)
CREATE TABLE IF NOT EXISTS agent_command_sources (
  id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL REFERENCES agent_command_runs(id) ON DELETE CASCADE,
  step_id TEXT,
  
  -- Source info
  source_type agent_source_type NOT NULL,
  label TEXT NOT NULL,
  details_json JSONB,
  
  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS agent_command_sources_run_id_idx ON agent_command_sources(run_id);

-- Agent Command Approvals (Safe mode gating)
CREATE TABLE IF NOT EXISTS agent_command_approvals (
  id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL REFERENCES agent_command_runs(id) ON DELETE CASCADE,
  step_id TEXT NOT NULL REFERENCES agent_command_steps(id) ON DELETE CASCADE,
  
  -- Approval info
  state agent_approval_state NOT NULL DEFAULT 'requested',
  policy TEXT NOT NULL,
  action_description TEXT NOT NULL,
  
  -- Resolution
  resolved_at TIMESTAMPTZ,
  resolved_by_user_id INTEGER,
  note TEXT,
  
  -- Timestamps
  requested_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS agent_command_approvals_run_id_idx ON agent_command_approvals(run_id);
CREATE INDEX IF NOT EXISTS agent_command_approvals_state_idx ON agent_command_approvals(state);

-- ============================================================================
-- COMMENTS
-- ============================================================================

COMMENT ON TABLE agent_command_runs IS 'Agentic Command Center runs - each run represents a user request being processed through understand→plan→execute→verify→summarize phases';
COMMENT ON TABLE agent_command_steps IS 'Individual steps within a run - operator-visible actions (not hidden chain-of-thought)';
COMMENT ON TABLE agent_command_events IS 'Append-only audit log of all events in a run - powers SSE replay and audit trail';
COMMENT ON TABLE agent_command_interrupts IS 'Clarification requests with structured forms - pauses run until user provides answers';
COMMENT ON TABLE agent_command_artifacts IS 'Outputs produced by a run - campaigns, segments, drafts, links shown in Outputs panel';
COMMENT ON TABLE agent_command_sources IS 'Data sources used by the agent - DB queries, API calls, files shown in Source panel';
COMMENT ON TABLE agent_command_approvals IS 'Safe mode approval requests - gating for risky actions like launches, deletes';
