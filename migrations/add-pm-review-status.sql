-- Migration: Add pending_pm_review to qa_status enum and PM review fields
-- This adds PM review step after QA approval before publishing to client portal
-- Run this migration to add the new enum value and columns

-- Add 'pending_pm_review' to the qa_status enum
DO $$
BEGIN
    -- Check if the value already exists
    IF NOT EXISTS (
        SELECT 1 FROM pg_enum 
        WHERE enumlabel = 'pending_pm_review' 
        AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'qa_status')
    ) THEN
        -- Add the new value after 'approved'
        ALTER TYPE qa_status ADD VALUE IF NOT EXISTS 'pending_pm_review' AFTER 'approved';
    END IF;
END $$;

-- Add PM review tracking columns to leads table
ALTER TABLE leads ADD COLUMN IF NOT EXISTS pm_approved_at TIMESTAMP;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS pm_approved_by VARCHAR REFERENCES users(id);
ALTER TABLE leads ADD COLUMN IF NOT EXISTS pm_rejected_at TIMESTAMP;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS pm_rejected_by VARCHAR REFERENCES users(id);
ALTER TABLE leads ADD COLUMN IF NOT EXISTS pm_rejection_reason TEXT;

-- Create index for PM review status filtering
CREATE INDEX IF NOT EXISTS leads_pm_review_idx ON leads(qa_status) WHERE qa_status IN ('approved', 'pending_pm_review');

-- Update comment to document the workflow
COMMENT ON TYPE qa_status IS 'Lead QA Status Flow: new → under_review → approved → pending_pm_review → published. PM review required before client portal visibility.';
