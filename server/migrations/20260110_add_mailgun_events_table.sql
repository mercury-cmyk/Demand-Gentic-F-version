-- Migration: Add mailgun_events table for tracking Mailgun webhook events
CREATE TABLE IF NOT EXISTS mailgun_events (
  id SERIAL PRIMARY KEY,
  event_type VARCHAR(64) NOT NULL,
  message_id VARCHAR(255),
  recipient_email VARCHAR(255),
  campaign_id VARCHAR(64),
  contact_id VARCHAR(64),
  account_id VARCHAR(64),
  event_data JSONB,
  created_at TIMESTAMP DEFAULT NOW()
);
