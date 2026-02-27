-- Ensure Client Journey pipeline tables exist (idempotent)

-- Enums
DO $$ BEGIN
  CREATE TYPE client_journey_pipeline_status AS ENUM ('active', 'paused', 'archived');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE client_journey_lead_status AS ENUM ('active', 'paused', 'completed', 'lost');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE client_journey_action_type AS ENUM ('callback', 'email', 'sms', 'note', 'stage_change');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE client_journey_action_status AS ENUM ('scheduled', 'in_progress', 'completed', 'skipped', 'failed');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- Pipelines
CREATE TABLE IF NOT EXISTS client_journey_pipelines (
  id varchar(36) PRIMARY KEY DEFAULT gen_random_uuid()::text,
  client_account_id varchar(36) NOT NULL,
  campaign_id varchar(36),
  name text NOT NULL,
  description text,
  stages jsonb NOT NULL,
  auto_enroll_dispositions jsonb,
  status client_journey_pipeline_status NOT NULL DEFAULT 'active',
  lead_count integer NOT NULL DEFAULT 0,
  created_by varchar(36),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS cjp_client_account_idx ON client_journey_pipelines (client_account_id);
CREATE INDEX IF NOT EXISTS cjp_status_idx ON client_journey_pipelines (status);
CREATE INDEX IF NOT EXISTS cjp_campaign_idx ON client_journey_pipelines (campaign_id);

-- Leads
CREATE TABLE IF NOT EXISTS client_journey_leads (
  id varchar(36) PRIMARY KEY DEFAULT gen_random_uuid()::text,
  pipeline_id varchar(36) NOT NULL,
  contact_id varchar(36),
  contact_name text,
  contact_email text,
  contact_phone text,
  company_name text,
  job_title text,
  source_call_session_id varchar(36),
  source_campaign_id varchar(36),
  source_disposition text,
  source_call_summary text,
  source_ai_analysis jsonb,
  current_stage_id text NOT NULL,
  current_stage_entered_at timestamptz NOT NULL DEFAULT now(),
  status client_journey_lead_status NOT NULL DEFAULT 'active',
  priority integer NOT NULL DEFAULT 3,
  next_action_type text,
  next_action_at timestamptz,
  last_activity_at timestamptz,
  total_actions integer NOT NULL DEFAULT 0,
  notes text,
  metadata jsonb,
  created_by varchar(36),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT cjl_pipeline_fk FOREIGN KEY (pipeline_id) REFERENCES client_journey_pipelines(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS cjl_pipeline_idx ON client_journey_leads (pipeline_id);
CREATE INDEX IF NOT EXISTS cjl_contact_idx ON client_journey_leads (contact_id);
CREATE INDEX IF NOT EXISTS cjl_status_idx ON client_journey_leads (status);
CREATE INDEX IF NOT EXISTS cjl_stage_idx ON client_journey_leads (current_stage_id);
CREATE INDEX IF NOT EXISTS cjl_next_action_idx ON client_journey_leads (next_action_at);
CREATE INDEX IF NOT EXISTS cjl_priority_idx ON client_journey_leads (priority);

-- Actions
CREATE TABLE IF NOT EXISTS client_journey_actions (
  id varchar(36) PRIMARY KEY DEFAULT gen_random_uuid()::text,
  journey_lead_id varchar(36) NOT NULL,
  pipeline_id varchar(36) NOT NULL,
  action_type client_journey_action_type NOT NULL,
  status client_journey_action_status NOT NULL DEFAULT 'scheduled',
  scheduled_at timestamptz,
  completed_at timestamptz,
  title text,
  description text,
  ai_generated_context jsonb,
  previous_activity_summary text,
  outcome text,
  outcome_details jsonb,
  result_disposition text,
  triggered_next_action boolean DEFAULT false,
  created_by varchar(36),
  completed_by varchar(36),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT cja_journey_lead_fk FOREIGN KEY (journey_lead_id) REFERENCES client_journey_leads(id) ON DELETE CASCADE,
  CONSTRAINT cja_pipeline_fk FOREIGN KEY (pipeline_id) REFERENCES client_journey_pipelines(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS cja_journey_lead_idx ON client_journey_actions (journey_lead_id);
CREATE INDEX IF NOT EXISTS cja_pipeline_idx ON client_journey_actions (pipeline_id);
CREATE INDEX IF NOT EXISTS cja_status_idx ON client_journey_actions (status);
CREATE INDEX IF NOT EXISTS cja_scheduled_at_idx ON client_journey_actions (scheduled_at);
CREATE INDEX IF NOT EXISTS cja_action_type_idx ON client_journey_actions (action_type);
