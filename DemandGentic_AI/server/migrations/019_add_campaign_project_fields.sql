-- Add project attachment fields to campaigns table
-- These columns are defined in schema.ts but were missing from the database

-- Add landing_page_url column to campaigns
ALTER TABLE campaigns
ADD COLUMN IF NOT EXISTS landing_page_url TEXT;

-- Add project_file_url column to campaigns
ALTER TABLE campaigns
ADD COLUMN IF NOT EXISTS project_file_url TEXT;

-- Add intake_request_id column to campaigns (for traceability)
ALTER TABLE campaigns
ADD COLUMN IF NOT EXISTS intake_request_id UUID REFERENCES client_projects(id);

COMMENT ON COLUMN campaigns.landing_page_url IS 'Client landing page URL (populated from linked project)';
COMMENT ON COLUMN campaigns.project_file_url IS 'Client uploaded project brief/assets URL (from project)';
COMMENT ON COLUMN campaigns.intake_request_id IS 'Links campaign to the client project intake request that created it';