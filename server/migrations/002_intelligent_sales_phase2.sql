-- Migration: 002_intelligent_sales_phase2.sql
-- Description: Add Phase 2 of Intelligent Sales Operating System
--              - AI Insights (deal_insights)
--              - Email Conversation Tracking (deal_conversations, deal_messages)
--              - Score Audit Trail (deal_score_history)
-- Date: 2025-11-10
-- Requires: 001_intelligent_sales_foundation.sql (Phase 1)

-- Create New Enums (Idempotent)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'email_direction') THEN
    CREATE TYPE email_direction AS ENUM ('inbound', 'outbound');
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'message_status') THEN
    CREATE TYPE message_status AS ENUM ('pending', 'sent', 'delivered', 'read', 'replied', 'failed');
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'insight_status') THEN
    CREATE TYPE insight_status AS ENUM ('active', 'acknowledged', 'dismissed', 'expired');
  END IF;
END $$;

-- Deal Insights Table
-- Stores AI-generated insights about pipeline opportunities
CREATE TABLE IF NOT EXISTS deal_insights (
  id VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid(),
  opportunity_id VARCHAR(36) NOT NULL REFERENCES pipeline_opportunities(id) ON DELETE CASCADE,
  insight_type deal_insight_type NOT NULL,
  source VARCHAR(64) NOT NULL, -- 'ai_email_analysis', 'ai_call_analysis', 'manual', 'rule_engine'
  title VARCHAR(255) NOT NULL,
  description TEXT,
  confidence INTEGER DEFAULT 0, -- AI confidence score 0-100
  status insight_status DEFAULT 'active' NOT NULL,
  metadata JSONB, -- Insight-specific data
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  expires_at TIMESTAMPTZ -- When insight becomes stale
);

-- Indexes for deal_insights
CREATE INDEX IF NOT EXISTS deal_insights_opportunity_idx ON deal_insights(opportunity_id);
CREATE INDEX IF NOT EXISTS deal_insights_type_idx ON deal_insights(insight_type);
CREATE INDEX IF NOT EXISTS deal_insights_created_at_idx ON deal_insights(created_at DESC);
CREATE INDEX IF NOT EXISTS deal_insights_status_idx ON deal_insights(status);

-- Unique constraint for deduplication
CREATE UNIQUE INDEX IF NOT EXISTS deal_insights_unique_idx 
  ON deal_insights(opportunity_id, insight_type, source, created_at);

-- Deal Conversations Table
-- Groups related M365 emails into conversation threads
CREATE TABLE IF NOT EXISTS deal_conversations (
  id VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid(),
  opportunity_id VARCHAR(36) REFERENCES pipeline_opportunities(id) ON DELETE SET NULL, -- Preserve history if opp deleted
  subject VARCHAR(512) DEFAULT '' NOT NULL,
  thread_id VARCHAR(255), -- M365 conversation/thread ID
  participant_emails TEXT[], -- All participants in thread
  message_count INTEGER DEFAULT 0 NOT NULL,
  last_message_at TIMESTAMPTZ,
  direction email_direction, -- Primary direction of conversation
  status VARCHAR(32) DEFAULT 'active' NOT NULL, -- active, archived
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

-- Indexes for deal_conversations
CREATE INDEX IF NOT EXISTS deal_conversations_opportunity_idx ON deal_conversations(opportunity_id);
CREATE INDEX IF NOT EXISTS deal_conversations_last_message_idx ON deal_conversations(last_message_at DESC);

-- Unique index on thread_id (where not null)
CREATE UNIQUE INDEX IF NOT EXISTS deal_conversations_thread_id_idx 
  ON deal_conversations(thread_id) WHERE thread_id IS NOT NULL;

-- GIN index for participant email lookups
CREATE INDEX IF NOT EXISTS deal_conversations_participants_idx 
  ON deal_conversations USING gin(participant_emails);

-- Deal Messages Table
-- Individual M365 emails linked to deals (distinct from campaign emails)
CREATE TABLE IF NOT EXISTS deal_messages (
  id VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id VARCHAR(36) NOT NULL REFERENCES deal_conversations(id) ON DELETE CASCADE,
  opportunity_id VARCHAR(36) REFERENCES pipeline_opportunities(id) ON DELETE SET NULL, -- Denormalized for direct joins
  m365_message_id VARCHAR(255) UNIQUE NOT NULL, -- Microsoft Graph message ID
  from_email VARCHAR(320) NOT NULL,
  to_emails TEXT[] NOT NULL, -- Recipients
  cc_emails TEXT[], -- CC'd recipients
  subject VARCHAR(512),
  body_preview TEXT, -- First 255 chars
  body_content TEXT, -- Full email body
  direction email_direction NOT NULL, -- inbound or outbound
  message_status message_status DEFAULT 'delivered' NOT NULL,
  sent_at TIMESTAMPTZ,
  received_at TIMESTAMPTZ,
  is_from_customer BOOLEAN DEFAULT false NOT NULL, -- From external party
  has_attachments BOOLEAN DEFAULT false NOT NULL,
  importance VARCHAR(16) DEFAULT 'normal', -- low, normal, high
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

-- Indexes for deal_messages
CREATE INDEX IF NOT EXISTS deal_messages_conversation_idx ON deal_messages(conversation_id);
CREATE INDEX IF NOT EXISTS deal_messages_opportunity_idx ON deal_messages(opportunity_id);
CREATE UNIQUE INDEX IF NOT EXISTS deal_messages_m365_message_idx ON deal_messages(m365_message_id);
CREATE INDEX IF NOT EXISTS deal_messages_sent_at_idx ON deal_messages(sent_at DESC);
CREATE INDEX IF NOT EXISTS deal_messages_direction_idx ON deal_messages(direction);

-- GIN indexes for email array lookups
CREATE INDEX IF NOT EXISTS deal_messages_to_emails_idx ON deal_messages USING gin(to_emails);
CREATE INDEX IF NOT EXISTS deal_messages_cc_emails_idx ON deal_messages USING gin(cc_emails);

-- Deal Score History Table
-- Audit trail for all score changes (engagement, fit, intent, stage probability)
CREATE TABLE IF NOT EXISTS deal_score_history (
  id VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid(),
  opportunity_id VARCHAR(36) NOT NULL REFERENCES pipeline_opportunities(id) ON DELETE CASCADE,
  score_type VARCHAR(32) NOT NULL, -- 'engagement_score', 'fit_score', 'intent_score', 'stage_probability'
  previous_value INTEGER,
  new_value INTEGER NOT NULL,
  delta INTEGER, -- newValue - previousValue (for analytics)
  change_reason VARCHAR(64) NOT NULL, -- 'email_opened', 'email_replied', 'meeting_attended', 'manual_update', 'ai_analysis'
  changed_by VARCHAR(36) REFERENCES users(id) ON DELETE SET NULL, -- NULL for automated changes
  metadata JSONB, -- Context about what triggered the change
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

-- Indexes for deal_score_history
CREATE INDEX IF NOT EXISTS deal_score_history_opportunity_idx ON deal_score_history(opportunity_id);
CREATE INDEX IF NOT EXISTS deal_score_history_score_type_idx ON deal_score_history(score_type);
CREATE INDEX IF NOT EXISTS deal_score_history_created_at_idx ON deal_score_history(created_at DESC);
CREATE INDEX IF NOT EXISTS deal_score_history_changed_by_idx ON deal_score_history(changed_by);

-- Success message
DO $$
BEGIN
  RAISE NOTICE '✅ Phase 2: AI Insights, Conversation Tracking, and Audit Tables created successfully';
END $$;
