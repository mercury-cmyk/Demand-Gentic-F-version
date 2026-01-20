-- Add missing columns to client_projects table
-- These columns are defined in schema.ts but were missing from the original migration

-- Add requested_lead_count column
ALTER TABLE client_projects
ADD COLUMN IF NOT EXISTS requested_lead_count INTEGER;

-- Add landing_page_url column
ALTER TABLE client_projects
ADD COLUMN IF NOT EXISTS landing_page_url TEXT;

-- Add project_file_url column
ALTER TABLE client_projects
ADD COLUMN IF NOT EXISTS project_file_url TEXT;

COMMENT ON COLUMN client_projects.requested_lead_count IS 'Target number of leads requested for this project';
COMMENT ON COLUMN client_projects.landing_page_url IS 'Optional landing page URL associated with the project';
COMMENT ON COLUMN client_projects.project_file_url IS 'Optional uploaded file URL for project assets';
