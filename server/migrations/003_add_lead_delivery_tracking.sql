-- Migration: Add delivery tracking fields to leads table
-- Created: 2025-11-10
-- Purpose: Enable manual delivery tracking for QA team

-- Create lead_delivery_source enum type
DO $$ 
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'lead_delivery_source') THEN
    CREATE TYPE lead_delivery_source AS ENUM ('auto_webhook', 'manual');
  END IF;
END $$;

-- Add delivery tracking columns to leads table
ALTER TABLE leads ADD COLUMN IF NOT EXISTS delivered_by_id VARCHAR REFERENCES users(id);
ALTER TABLE leads ADD COLUMN IF NOT EXISTS delivery_source lead_delivery_source;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS delivery_notes TEXT;

-- Add indexes for better query performance
CREATE INDEX IF NOT EXISTS leads_delivered_by_id_idx ON leads(delivered_by_id);
CREATE INDEX IF NOT EXISTS leads_delivery_source_idx ON leads(delivery_source);
CREATE INDEX IF NOT EXISTS leads_delivered_at_idx ON leads(delivered_at);
