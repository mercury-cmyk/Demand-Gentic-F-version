-- Migration: Add dba_name column to client_business_profiles
-- Date: 2026-02-03

-- Add the dba_name column (DBA / Trade Name)
ALTER TABLE client_business_profiles 
ADD COLUMN IF NOT EXISTS dba_name TEXT;

-- Add comment for documentation
COMMENT ON COLUMN client_business_profiles.dba_name IS 'DBA (Doing Business As) or Trade Name - optional';