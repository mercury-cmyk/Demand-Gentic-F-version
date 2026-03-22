-- Migration: Migrate existing campaigns to work with the new agentic campaign creation system
-- This migration:
-- 1. Sets creation_mode for existing campaigns that don't have one
-- 2. Ensures all campaigns have proper enabled_channels set
-- 3. Populates landing_page_url and project_file_url from linked projects where applicable
-- 4. Creates intake requests for existing campaigns that need tracking

-- Step 1: Set creation_mode to 'manual' for all existing campaigns that don't have it set
UPDATE campaigns
SET creation_mode = 'manual'
WHERE creation_mode IS NULL;

-- Step 2: Ensure enabled_channels is properly set for all campaigns
-- Set based on campaign type if not already set
UPDATE campaigns
SET enabled_channels = CASE
    WHEN type = 'email' THEN ARRAY['email']::text[]
    WHEN type = 'call' THEN ARRAY['voice']::text[]
    WHEN type = 'combo' THEN ARRAY['voice', 'email']::text[]
    ELSE ARRAY['voice']::text[]
END
WHERE enabled_channels IS NULL OR array_length(enabled_channels, 1) IS NULL;

-- Step 3: Populate landing_page_url and project_file_url from linked client_projects
-- This enriches campaigns that are linked to projects
UPDATE campaigns c
SET
    landing_page_url = COALESCE(c.landing_page_url, cp.landing_page_url),
    project_file_url = COALESCE(c.project_file_url, cp.project_file_url)
FROM client_projects cp
WHERE c.project_id = cp.id
  AND (c.landing_page_url IS NULL OR c.project_file_url IS NULL);

-- Step 4: Set dial_mode based on campaign type for existing campaigns
UPDATE campaigns
SET dial_mode = CASE
    WHEN type IN ('email', 'content_syndication') THEN 'manual'::dial_mode
    WHEN type IN ('call', 'combo', 'appointment_generation', 'lead_qualification') THEN 'ai_agent'::dial_mode
    ELSE 'ai_agent'::dial_mode
END
WHERE dial_mode IS NULL;

-- Step 5: Initialize channel_generation_status for campaigns that don't have it
UPDATE campaigns
SET channel_generation_status = jsonb_build_object(
    'voice', CASE WHEN 'voice' = ANY(enabled_channels) THEN 'pending' ELSE NULL END,
    'email', CASE WHEN 'email' = ANY(enabled_channels) THEN 'pending' ELSE NULL END
)
WHERE channel_generation_status IS NULL;

-- Step 6: Create campaign_intake_requests for existing campaigns with client associations
-- This allows existing campaigns to be tracked in the new intake workflow
INSERT INTO campaign_intake_requests (
    id,
    source_type,
    client_account_id,
    project_id,
    campaign_id,
    status,
    priority,
    raw_input,
    extracted_context,
    campaign_type,
    requested_lead_count,
    requested_channels,
    created_at,
    updated_at
)
SELECT
    gen_random_uuid(),
    'api'::text,
    c.client_account_id,
    c.project_id,
    c.id,
    'completed'::text,
    'normal'::text,
    jsonb_build_object(
        'migratedFromLegacy', true,
        'originalCampaignName', c.name,
        'originalCampaignType', c.type,
        'migratedAt', now()::text
    ),
    jsonb_build_object(
        'objective', COALESCE(c.campaign_objective, 'Migrated campaign - objective not specified'),
        'productServiceInfo', c.product_service_info,
        'successCriteria', c.success_criteria,
        'targetAudienceDescription', c.target_audience_description
    ),
    c.type::text,
    c.target_qualified_leads,
    c.enabled_channels,
    c.created_at,
    now()
FROM campaigns c
WHERE c.client_account_id IS NOT NULL
  AND c.intake_request_id IS NULL
  AND NOT EXISTS (
      SELECT 1 FROM campaign_intake_requests cir
      WHERE cir.campaign_id = c.id
  );

-- Step 7: Update campaigns to link back to their intake requests
UPDATE campaigns c
SET intake_request_id = cir.id
FROM campaign_intake_requests cir
WHERE cir.campaign_id = c.id
  AND c.intake_request_id IS NULL;

-- Step 8: Add comments for audit trail
COMMENT ON TABLE campaigns IS 'Campaigns table - migrated to support agentic creation workflow on 2026-02-05';

-- Log migration completion
DO $$
DECLARE
    total_campaigns INTEGER;
    migrated_campaigns INTEGER;
    intake_created INTEGER;
BEGIN
    SELECT COUNT(*) INTO total_campaigns FROM campaigns;
    SELECT COUNT(*) INTO migrated_campaigns FROM campaigns WHERE creation_mode = 'manual';
    SELECT COUNT(*) INTO intake_created FROM campaign_intake_requests WHERE (raw_input->>'migratedFromLegacy')::boolean = true;

    RAISE NOTICE 'Migration complete: % total campaigns, % marked as manual, % intake requests created',
        total_campaigns, migrated_campaigns, intake_created;
END $$;