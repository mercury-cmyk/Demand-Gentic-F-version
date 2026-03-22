-- Migration: Add regular_campaign_id to client_campaign_access
-- Purpose: Allow clients to access regular call/email campaigns (not just verification campaigns)
-- This enables exposing QA-approved leads from call campaigns to clients

-- Add the new column for regular campaigns
ALTER TABLE client_campaign_access
ADD COLUMN IF NOT EXISTS regular_campaign_id VARCHAR REFERENCES campaigns(id) ON DELETE CASCADE;

-- Create index for efficient lookups
CREATE INDEX IF NOT EXISTS client_campaign_access_regular_campaign_idx
ON client_campaign_access(client_account_id, regular_campaign_id);

-- Note: We're making both campaign_id and regular_campaign_id nullable
-- A row can reference EITHER a verification campaign OR a regular campaign
-- This maintains backward compatibility with existing verification campaign access

-- Add comment for documentation
COMMENT ON COLUMN client_campaign_access.regular_campaign_id IS 'Reference to regular campaigns (call/email) - mutually exclusive with campaign_id (verification)';