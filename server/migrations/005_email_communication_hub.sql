-- Migration: Email Communication Hub Infrastructure
-- Purpose: Enterprise email system with dual inbox, tracking, AI features, scheduled sends
-- Date: 2025-11-13

-- Email Opens Tracking
CREATE TABLE email_opens (
  id VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id VARCHAR(36) NOT NULL REFERENCES deal_messages(id) ON DELETE CASCADE,
  recipient_email VARCHAR(320) NOT NULL,
  opened_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ip_address VARCHAR(45),
  user_agent TEXT,
  location JSONB,
  device_type VARCHAR(32),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX email_opens_message_idx ON email_opens(message_id);
CREATE INDEX email_opens_recipient_idx ON email_opens(recipient_email);
CREATE INDEX email_opens_opened_at_idx ON email_opens(opened_at DESC);

COMMENT ON TABLE email_opens IS 'Tracks email opens with device and location data for engagement analytics';

-- Email Link Clicks Tracking  
CREATE TABLE email_link_clicks (
  id VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id VARCHAR(36) NOT NULL REFERENCES deal_messages(id) ON DELETE CASCADE,
  recipient_email VARCHAR(320) NOT NULL,
  link_url TEXT NOT NULL,
  link_text TEXT,
  clicked_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ip_address VARCHAR(45),
  user_agent TEXT,
  device_type VARCHAR(32),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX email_link_clicks_message_idx ON email_link_clicks(message_id);
CREATE INDEX email_link_clicks_recipient_idx ON email_link_clicks(recipient_email);
CREATE INDEX email_link_clicks_clicked_at_idx ON email_link_clicks(clicked_at DESC);

COMMENT ON TABLE email_link_clicks IS 'Tracks link clicks within emails for detailed engagement analysis';

-- Scheduled Emails Queue
CREATE TABLE scheduled_emails (
  id VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid(),
  mailbox_account_id VARCHAR(36) NOT NULL REFERENCES mailbox_accounts(id) ON DELETE CASCADE,
  from_email VARCHAR(320) NOT NULL,
  to_emails TEXT[] NOT NULL,
  cc_emails TEXT[],
  bcc_emails TEXT[],
  subject VARCHAR(512) NOT NULL,
  body_html TEXT NOT NULL,
  body_plain TEXT,
  attachments JSONB,
  scheduled_for TIMESTAMP WITH TIME ZONE NOT NULL,
  status VARCHAR(32) NOT NULL DEFAULT 'pending',
  sent_at TIMESTAMP WITH TIME ZONE,
  failure_reason TEXT,
  opportunity_id VARCHAR(36) REFERENCES pipeline_opportunities(id) ON DELETE SET NULL,
  contact_id VARCHAR(36) REFERENCES contacts(id) ON DELETE SET NULL,
  account_id VARCHAR(36) REFERENCES accounts(id) ON DELETE SET NULL,
  created_by VARCHAR(36) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX scheduled_emails_scheduled_for_idx ON scheduled_emails(scheduled_for);
CREATE INDEX scheduled_emails_status_idx ON scheduled_emails(status);
CREATE INDEX scheduled_emails_mailbox_idx ON scheduled_emails(mailbox_account_id);
CREATE INDEX scheduled_emails_opportunity_idx ON scheduled_emails(opportunity_id);

COMMENT ON TABLE scheduled_emails IS 'Queue for future email sends with BullMQ integration and M365 OAuth token refresh';

-- Email AI Rewrites History
CREATE TABLE email_ai_rewrites (
  id VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id VARCHAR(36) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  original_text TEXT NOT NULL,
  rewritten_text TEXT NOT NULL,
  tone VARCHAR(32),
  instructions TEXT,
  ai_model VARCHAR(64) DEFAULT 'gpt-4o',
  analysis_results JSONB,
  accepted BOOLEAN DEFAULT FALSE,
  message_id VARCHAR(36) REFERENCES deal_messages(id) ON DELETE SET NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX email_ai_rewrites_user_idx ON email_ai_rewrites(user_id);
CREATE INDEX email_ai_rewrites_created_at_idx ON email_ai_rewrites(created_at DESC);
CREATE INDEX email_ai_rewrites_message_idx ON email_ai_rewrites(message_id);

COMMENT ON TABLE email_ai_rewrites IS 'History of AI email rewrites with analysis for quality control and learning';

-- Email Signatures
CREATE TABLE email_signatures (
  id VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id VARCHAR(36) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  signature_html TEXT NOT NULL,
  signature_plain TEXT,
  is_default BOOLEAN NOT NULL DEFAULT FALSE,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX email_signatures_user_idx ON email_signatures(user_id);
CREATE INDEX email_signatures_default_idx ON email_signatures(user_id, is_default);

COMMENT ON TABLE email_signatures IS 'User email signatures with Pivotal B2B branding template';

-- Inbox Categories (Primary/Other)
CREATE TABLE inbox_categories (
  id VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id VARCHAR(36) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  message_id VARCHAR(36) NOT NULL REFERENCES deal_messages(id) ON DELETE CASCADE,
  category VARCHAR(32) NOT NULL DEFAULT 'other',
  is_read BOOLEAN NOT NULL DEFAULT FALSE,
  is_starred BOOLEAN NOT NULL DEFAULT FALSE,
  is_archived BOOLEAN NOT NULL DEFAULT FALSE,
  read_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX inbox_categories_user_idx ON inbox_categories(user_id);
CREATE UNIQUE INDEX inbox_categories_message_user_idx ON inbox_categories(user_id, message_id);
CREATE INDEX inbox_categories_category_idx ON inbox_categories(user_id, category);
CREATE INDEX inbox_categories_is_read_idx ON inbox_categories(user_id, is_read);

COMMENT ON TABLE inbox_categories IS 'Dual-inbox categorization (Primary/Other) with read/unread tracking per user';
