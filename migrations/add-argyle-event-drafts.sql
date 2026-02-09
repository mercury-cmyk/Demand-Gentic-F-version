-- Migration: Argyle Event-Sourced Campaign Drafts
-- Adds external_events and work_order_drafts tables for event-sourced campaign drafting
-- Backwards-compatible: new tables only, no existing table modifications

-- ============================================
-- EXTERNAL EVENTS TABLE
-- Stores parsed events from external sources (Argyle, etc.)
-- ============================================
CREATE TABLE IF NOT EXISTS external_events (
  id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- Client gate: which client account owns this event
  client_id VARCHAR NOT NULL REFERENCES client_accounts(id) ON DELETE CASCADE,
  
  -- Source identification
  source_provider VARCHAR NOT NULL DEFAULT 'argyle',  -- Provider identifier
  external_id VARCHAR NOT NULL,                       -- Stable unique key (canonical URL)
  source_url TEXT NOT NULL,                           -- Link back to original event page
  source_hash VARCHAR,                                -- Hash of source content for change detection
  
  -- Event metadata
  title TEXT NOT NULL,
  community VARCHAR,                                  -- e.g., 'Finance', 'Information Technology', 'HR'
  event_type VARCHAR,                                 -- e.g., 'Forum', 'Webinar'
  location TEXT,                                      -- e.g., 'Virtual', city name
  
  -- Date handling (dual storage)
  start_at_iso TIMESTAMPTZ,                           -- Normalized ISO date (nullable if unparseable)
  start_at_human VARCHAR,                             -- Original human-readable date string
  needs_date_review BOOLEAN DEFAULT false,            -- True if date couldn't be parsed
  
  -- Content excerpts (minimal, links back to source)
  overview_excerpt TEXT,                              -- 2-5 sentence overview
  agenda_excerpt TEXT,                                -- Optional agenda summary
  speakers_excerpt TEXT,                              -- Optional speakers list
  
  -- Sync tracking
  last_synced_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  sync_status VARCHAR DEFAULT 'synced',               -- synced | error | stale
  sync_error TEXT,                                    -- Last sync error message
  
  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  
  -- Unique constraint: one event per external_id per client per provider
  CONSTRAINT external_events_unique_key UNIQUE (client_id, source_provider, external_id)
);

-- Indexes for external_events
CREATE INDEX IF NOT EXISTS external_events_client_idx ON external_events(client_id);
CREATE INDEX IF NOT EXISTS external_events_provider_idx ON external_events(source_provider);
CREATE INDEX IF NOT EXISTS external_events_start_at_idx ON external_events(start_at_iso);

-- ============================================
-- WORK ORDER DRAFTS TABLE
-- Stores editable campaign drafts linked to external events
-- ============================================
CREATE TABLE IF NOT EXISTS work_order_drafts (
  id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- Client ownership
  client_account_id VARCHAR NOT NULL REFERENCES client_accounts(id) ON DELETE CASCADE,
  client_user_id VARCHAR REFERENCES client_users(id) ON DELETE SET NULL,
  
  -- Link to external event (nullable for manual drafts)
  external_event_id VARCHAR REFERENCES external_events(id) ON DELETE SET NULL,
  
  -- Draft status
  status VARCHAR NOT NULL DEFAULT 'draft',            -- draft | ready | submitted | cancelled
  
  -- Source fields (auto-populated from event, overwritten on re-sync)
  source_fields JSONB NOT NULL DEFAULT '{}',
  
  -- Draft fields (client-editable version)
  draft_fields JSONB NOT NULL DEFAULT '{}',
  
  -- Tracks which fields the client has manually edited
  edited_fields JSONB NOT NULL DEFAULT '[]',          -- Array of field names client has touched
  
  -- The critical required field
  lead_count INTEGER,                                 -- REQUIRED to submit; nullable until client fills in
  
  -- Campaign linking (after submission)
  work_order_id VARCHAR REFERENCES work_orders(id) ON DELETE SET NULL,
  
  -- Timestamps
  submitted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes for work_order_drafts
CREATE INDEX IF NOT EXISTS work_order_drafts_client_idx ON work_order_drafts(client_account_id);
CREATE INDEX IF NOT EXISTS work_order_drafts_event_idx ON work_order_drafts(external_event_id);
CREATE INDEX IF NOT EXISTS work_order_drafts_status_idx ON work_order_drafts(status);
