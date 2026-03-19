-- Engagement Triggers Migration
-- Cross-channel automation: Call → Email follow-up | Email → Call follow-up

-- Create enums
DO $$ BEGIN
  CREATE TYPE engagement_trigger_status AS ENUM ('pending', 'scheduled', 'executing', 'completed', 'failed', 'cancelled', 'skipped');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE engagement_trigger_channel AS ENUM ('call', 'email');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Create table
CREATE TABLE IF NOT EXISTS account_engagement_triggers (
  id VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id VARCHAR(36),
  account_id VARCHAR(36) NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  contact_id VARCHAR(36) NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
  campaign_id VARCHAR(36) REFERENCES campaigns(id) ON DELETE SET NULL,
  pipeline_id VARCHAR(36) REFERENCES pipelines(id) ON DELETE SET NULL,
  source_channel engagement_trigger_channel NOT NULL,
  source_entity_id VARCHAR(36),
  source_engaged_at TIMESTAMPTZ NOT NULL,
  target_channel engagement_trigger_channel NOT NULL,
  status engagement_trigger_status NOT NULL DEFAULT 'pending',
  scheduled_at TIMESTAMPTZ,
  executed_at TIMESTAMPTZ,
  result_entity_id VARCHAR(36),
  result_notes TEXT,
  error_message TEXT,
  trigger_payload JSONB DEFAULT '{}',
  created_by VARCHAR(36),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Create indexes
CREATE INDEX IF NOT EXISTS aet_account_idx ON account_engagement_triggers(account_id);
CREATE INDEX IF NOT EXISTS aet_contact_idx ON account_engagement_triggers(contact_id);
CREATE INDEX IF NOT EXISTS aet_campaign_idx ON account_engagement_triggers(campaign_id);
CREATE INDEX IF NOT EXISTS aet_status_idx ON account_engagement_triggers(status);
CREATE INDEX IF NOT EXISTS aet_scheduled_idx ON account_engagement_triggers(scheduled_at);
CREATE INDEX IF NOT EXISTS aet_source_channel_idx ON account_engagement_triggers(source_channel);
CREATE INDEX IF NOT EXISTS aet_target_channel_idx ON account_engagement_triggers(target_channel);

SELECT 'Engagement triggers migration complete' AS result;
