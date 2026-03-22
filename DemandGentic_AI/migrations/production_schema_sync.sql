-- ==================== PRODUCTION SCHEMA SYNC ====================
-- This script adds all Pipeline Management System tables to production
-- Run this in your PRODUCTION database using the Replit Database pane
-- 
-- IMPORTANT: This must be run ONCE in production to sync the schema
-- After running, republish your app to ensure it uses the updated schema
-- ================================================================

-- Step 1: Create new enum types
DO $$ BEGIN
    CREATE TYPE pipeline_type AS ENUM ('revenue', 'expansion', 'agency');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE pipeline_opportunity_status AS ENUM ('open', 'won', 'lost', 'on_hold');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE m365_activity_type AS ENUM ('email', 'meeting', 'call');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE m365_activity_direction AS ENUM ('inbound', 'outbound');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE email_sequence_status AS ENUM ('active', 'paused', 'archived');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE sequence_step_status AS ENUM ('active', 'paused');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE enrollment_status AS ENUM ('active', 'paused', 'completed', 'stopped');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE enrollment_stop_reason AS ENUM ('replied', 'unsubscribed', 'manual', 'bounced', 'completed', 'error');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE sequence_email_status AS ENUM (
        'scheduled',
        'sending',
        'sent',
        'delivered',
        'opened',
        'clicked',
        'replied',
        'bounced',
        'failed'
    );
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- Step 2: Create pipelines table
CREATE TABLE IF NOT EXISTS pipelines (
    id varchar(36) PRIMARY KEY,
    tenant_id varchar(36),
    name varchar(255) NOT NULL,
    description text,
    owner_id varchar(36) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    default_currency varchar(3) DEFAULT 'USD' NOT NULL,
    stage_order jsonb NOT NULL,
    sla_policy jsonb DEFAULT '{}'::jsonb NOT NULL,
    active boolean DEFAULT true NOT NULL,
    type pipeline_type DEFAULT 'revenue' NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);

-- Step 3: Create pipeline_opportunities table
CREATE TABLE IF NOT EXISTS pipeline_opportunities (
    id varchar(36) PRIMARY KEY,
    tenant_id varchar(36),
    pipeline_id varchar(36) NOT NULL REFERENCES pipelines(id) ON DELETE CASCADE,
    account_id varchar(36) REFERENCES accounts(id) ON DELETE SET NULL,
    contact_id varchar(36) REFERENCES contacts(id) ON DELETE SET NULL,
    owner_id varchar(36) REFERENCES users(id) ON DELETE SET NULL,
    name varchar(255) NOT NULL,
    stage varchar(120) NOT NULL,
    status pipeline_opportunity_status DEFAULT 'open' NOT NULL,
    amount numeric(14, 2) DEFAULT 0 NOT NULL,
    currency varchar(3) DEFAULT 'USD' NOT NULL,
    probability integer DEFAULT 0 NOT NULL,
    close_date timestamp with time zone,
    forecast_category varchar(64) DEFAULT 'Pipeline' NOT NULL,
    flagged_for_sla boolean DEFAULT false NOT NULL,
    reason text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);

-- Step 4: Create mailbox_accounts table
CREATE TABLE IF NOT EXISTS mailbox_accounts (
    id varchar(36) PRIMARY KEY,
    tenant_id varchar(36),
    user_id varchar(36) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    provider varchar(32) NOT NULL,
    status varchar(32) DEFAULT 'disconnected' NOT NULL,
    mailbox_email varchar(320),
    display_name varchar(255),
    connected_at timestamp with time zone,
    last_sync_at timestamp with time zone,
    access_token text,
    refresh_token text,
    token_expires_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);

-- Step 5: Create m365_activities table
CREATE TABLE IF NOT EXISTS m365_activities (
    id varchar(36) PRIMARY KEY DEFAULT gen_random_uuid(),
    mailbox_account_id varchar(36) NOT NULL REFERENCES mailbox_accounts(id) ON DELETE CASCADE,
    activity_type m365_activity_type DEFAULT 'email' NOT NULL,
    direction m365_activity_direction NOT NULL,
    message_id text NOT NULL,
    conversation_id text,
    subject text,
    body_preview text,
    importance varchar(16),
    from_email varchar(320),
    from_name varchar(255),
    to_recipients jsonb,
    cc_recipients jsonb,
    received_datetime timestamp with time zone,
    sent_datetime timestamp with time zone,
    is_read boolean DEFAULT false,
    has_attachments boolean DEFAULT false,
    account_id varchar(36) REFERENCES accounts(id) ON DELETE SET NULL,
    contact_id varchar(36) REFERENCES contacts(id) ON DELETE SET NULL,
    web_link text,
    synced_at timestamp with time zone DEFAULT now() NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

-- Step 6: Create email_sequences table
CREATE TABLE IF NOT EXISTS email_sequences (
    id varchar(36) PRIMARY KEY DEFAULT gen_random_uuid(),
    name varchar(255) NOT NULL,
    description text,
    status email_sequence_status DEFAULT 'active' NOT NULL,
    mailbox_account_id varchar(36) NOT NULL REFERENCES mailbox_accounts(id) ON DELETE RESTRICT,
    created_by varchar(36) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    total_enrolled integer DEFAULT 0 NOT NULL,
    active_enrollments integer DEFAULT 0 NOT NULL,
    completed_enrollments integer DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);

-- Step 7: Create sequence_steps table
CREATE TABLE IF NOT EXISTS sequence_steps (
    id varchar(36) PRIMARY KEY DEFAULT gen_random_uuid(),
    sequence_id varchar(36) NOT NULL REFERENCES email_sequences(id) ON DELETE CASCADE,
    step_number integer NOT NULL,
    name varchar(255),
    status sequence_step_status DEFAULT 'active' NOT NULL,
    delay_days integer DEFAULT 0 NOT NULL,
    delay_hours integer DEFAULT 0 NOT NULL,
    template_id varchar(36) REFERENCES email_templates(id) ON DELETE SET NULL,
    subject text,
    html_body text,
    text_body text,
    total_sent integer DEFAULT 0 NOT NULL,
    total_opened integer DEFAULT 0 NOT NULL,
    total_clicked integer DEFAULT 0 NOT NULL,
    total_replied integer DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);

-- Step 8: Create sequence_enrollments table
CREATE TABLE IF NOT EXISTS sequence_enrollments (
    id varchar(36) PRIMARY KEY DEFAULT gen_random_uuid(),
    sequence_id varchar(36) NOT NULL REFERENCES email_sequences(id) ON DELETE CASCADE,
    contact_id varchar(36) NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
    enrolled_by varchar(36) NOT NULL REFERENCES users(id) ON DELETE SET NULL,
    status enrollment_status DEFAULT 'active' NOT NULL,
    current_step_number integer DEFAULT 0 NOT NULL,
    stop_reason enrollment_stop_reason,
    stopped_at timestamp with time zone,
    enrolled_at timestamp with time zone DEFAULT now() NOT NULL,
    last_activity_at timestamp with time zone
);

-- Step 9: Create sequence_email_sends table
CREATE TABLE IF NOT EXISTS sequence_email_sends (
    id varchar(36) PRIMARY KEY DEFAULT gen_random_uuid(),
    enrollment_id varchar(36) NOT NULL REFERENCES sequence_enrollments(id) ON DELETE CASCADE,
    step_id varchar(36) NOT NULL REFERENCES sequence_steps(id) ON DELETE CASCADE,
    contact_id varchar(36) NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
    sequence_id varchar(36) NOT NULL REFERENCES email_sequences(id) ON DELETE CASCADE,
    status sequence_email_status DEFAULT 'scheduled' NOT NULL,
    scheduled_for timestamp with time zone NOT NULL,
    message_id text,
    conversation_id text,
    subject text NOT NULL,
    html_body text NOT NULL,
    text_body text,
    error text,
    retry_count integer DEFAULT 0 NOT NULL,
    sent_at timestamp with time zone,
    delivered_at timestamp with time zone,
    opened_at timestamp with time zone,
    clicked_at timestamp with time zone,
    replied_at timestamp with time zone,
    bounced_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);

-- Step 10: Create indexes for performance
CREATE INDEX IF NOT EXISTS m365_activities_mailbox_idx ON m365_activities(mailbox_account_id);
CREATE INDEX IF NOT EXISTS m365_activities_message_idx ON m365_activities(message_id);
CREATE INDEX IF NOT EXISTS m365_activities_account_idx ON m365_activities(account_id);
CREATE INDEX IF NOT EXISTS m365_activities_contact_idx ON m365_activities(contact_id);
CREATE INDEX IF NOT EXISTS m365_activities_received_idx ON m365_activities(received_datetime);

CREATE INDEX IF NOT EXISTS email_sequences_mailbox_idx ON email_sequences(mailbox_account_id);
CREATE INDEX IF NOT EXISTS email_sequences_created_by_idx ON email_sequences(created_by);
CREATE INDEX IF NOT EXISTS email_sequences_status_idx ON email_sequences(status);

CREATE INDEX IF NOT EXISTS sequence_steps_sequence_idx ON sequence_steps(sequence_id);
CREATE UNIQUE INDEX IF NOT EXISTS sequence_steps_sequence_step_idx ON sequence_steps(sequence_id, step_number);

CREATE INDEX IF NOT EXISTS sequence_enrollments_sequence_idx ON sequence_enrollments(sequence_id);
CREATE INDEX IF NOT EXISTS sequence_enrollments_contact_idx ON sequence_enrollments(contact_id);
CREATE INDEX IF NOT EXISTS sequence_enrollments_status_idx ON sequence_enrollments(status);
CREATE UNIQUE INDEX IF NOT EXISTS sequence_enrollments_unique_idx ON sequence_enrollments(sequence_id, contact_id);

CREATE INDEX IF NOT EXISTS sequence_email_sends_enrollment_idx ON sequence_email_sends(enrollment_id);
CREATE INDEX IF NOT EXISTS sequence_email_sends_step_idx ON sequence_email_sends(step_id);
CREATE INDEX IF NOT EXISTS sequence_email_sends_contact_idx ON sequence_email_sends(contact_id);
CREATE INDEX IF NOT EXISTS sequence_email_sends_sequence_idx ON sequence_email_sends(sequence_id);
CREATE INDEX IF NOT EXISTS sequence_email_sends_status_idx ON sequence_email_sends(status);
CREATE INDEX IF NOT EXISTS sequence_email_sends_scheduled_idx ON sequence_email_sends(scheduled_for);
CREATE INDEX IF NOT EXISTS sequence_email_sends_message_idx ON sequence_email_sends(message_id);

-- Step 11: Insert default pipeline if none exist
INSERT INTO pipelines (id, name, description, owner_id, default_currency, stage_order, sla_policy, active, type, created_at, updated_at)
SELECT 
    gen_random_uuid(),
    'Default Sales Pipeline',
    'Automatically created default pipeline',
    (SELECT id FROM users LIMIT 1),
    'USD',
    '["Prospecting", "Qualification", "Proposal", "Negotiation", "Closed Won"]'::jsonb,
    '{}'::jsonb,
    true,
    'revenue',
    now(),
    now()
WHERE NOT EXISTS (SELECT 1 FROM pipelines LIMIT 1);

-- ================================================================
-- VERIFICATION QUERIES
-- Run these to confirm everything was created successfully:
-- ================================================================

-- Check if all tables exist:
SELECT table_name 
FROM information_schema.tables 
WHERE table_schema = 'public' 
AND table_name IN (
    'pipelines',
    'pipeline_opportunities',
    'mailbox_accounts',
    'm365_activities',
    'email_sequences',
    'sequence_steps',
    'sequence_enrollments',
    'sequence_email_sends'
)
ORDER BY table_name;

-- Check if all enums exist:
SELECT typname 
FROM pg_type 
WHERE typtype = 'e' 
AND typname IN (
    'pipeline_type',
    'pipeline_opportunity_status',
    'm365_activity_type',
    'm365_activity_direction',
    'email_sequence_status',
    'sequence_step_status',
    'enrollment_status',
    'enrollment_stop_reason',
    'sequence_email_status'
)
ORDER BY typname;

-- Expected result: You should see 8 tables and 9 enums listed