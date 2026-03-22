-- Migration: Add Organization Intelligence Feature Flag
-- This enables clients to access and edit their organization intelligence for campaigns

-- Step 1: Add the new enum value to client_feature_flag
DO $$ BEGIN
  ALTER TYPE client_feature_flag ADD VALUE IF NOT EXISTS 'organization_intelligence';
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- Step 2: Enable organization_intelligence for all active client accounts
-- (They can later be disabled individually if needed)
INSERT INTO client_feature_access (id, client_account_id, feature, is_enabled, enabled_at)
SELECT 
  gen_random_uuid(),
  ca.id,
  'organization_intelligence'::client_feature_flag,
  true,
  NOW()
FROM client_accounts ca
WHERE ca.is_active = true
ON CONFLICT (client_account_id, feature) DO UPDATE SET 
  is_enabled = true,
  enabled_at = NOW();

-- Add comment
COMMENT ON COLUMN client_feature_access.feature IS 'Feature flags including: accounts_contacts, bulk_upload, campaign_creation, email_templates, call_flows, voice_selection, calendar_booking, analytics_dashboard, reports_export, api_access, organization_intelligence';