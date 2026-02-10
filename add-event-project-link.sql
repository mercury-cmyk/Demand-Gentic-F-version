-- Migration: Add external_event_id to client_projects and 'rejected' to status enum
-- Feature: Argyle Events → Admin Project Requests → Approval → Campaign Visibility

-- Add 'rejected' to client_project_status enum (idempotent)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_enum
    WHERE enumlabel = 'rejected'
    AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'client_project_status')
  ) THEN
    ALTER TYPE client_project_status ADD VALUE 'rejected';
  END IF;
END$$;

-- Add external_event_id column to client_projects
ALTER TABLE client_projects
  ADD COLUMN IF NOT EXISTS external_event_id VARCHAR REFERENCES external_events(id) ON DELETE SET NULL;

-- Index for lookups by event
CREATE INDEX IF NOT EXISTS client_projects_event_idx ON client_projects(external_event_id);

-- Unique constraint: one project per (client, event) pair
CREATE UNIQUE INDEX IF NOT EXISTS client_projects_client_event_uniq
  ON client_projects(client_account_id, external_event_id)
  WHERE external_event_id IS NOT NULL;
