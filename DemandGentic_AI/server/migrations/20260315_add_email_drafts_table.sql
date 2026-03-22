CREATE TABLE IF NOT EXISTS email_drafts (
  id VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id VARCHAR(36) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  mailbox_account_id VARCHAR(36) REFERENCES mailbox_accounts(id) ON DELETE SET NULL,
  to_emails TEXT[],
  cc_emails TEXT[],
  subject VARCHAR(512),
  body_html TEXT,
  body_plain TEXT,
  attachments JSONB,
  reply_to_message_id VARCHAR(36) REFERENCES deal_messages(id) ON DELETE SET NULL,
  forward_from_message_id VARCHAR(36) REFERENCES deal_messages(id) ON DELETE SET NULL,
  composer_mode VARCHAR(16) NOT NULL DEFAULT 'new',
  last_saved_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS email_drafts_user_idx
  ON email_drafts(user_id);

CREATE INDEX IF NOT EXISTS email_drafts_updated_at_idx
  ON email_drafts(updated_at DESC);