-- Migration: Add Email Access Feature Flags (email_connect, email_inbox)
-- Enables clients to connect their email and access a unified inbox

-- Step 1: Add the new enum values to client_feature_flag
DO $$ BEGIN
  ALTER TYPE client_feature_flag ADD VALUE IF NOT EXISTS 'email_connect';
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TYPE client_feature_flag ADD VALUE IF NOT EXISTS 'email_inbox';
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;