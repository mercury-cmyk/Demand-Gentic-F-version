-- Add custom_fields column to leads table for AI call metadata
ALTER TABLE leads ADD COLUMN IF NOT EXISTS custom_fields JSONB;