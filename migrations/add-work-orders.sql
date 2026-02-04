-- Migration: Work Orders / Campaign Requests System
-- Creates work_orders table to connect client Work Orders with admin Campaign Requests
-- Links to Projects, Campaigns, QA, and Leads

-- ==================== ENUMS ====================

DO $$ BEGIN
  CREATE TYPE work_order_status AS ENUM (
    'draft',           -- Client creating the request
    'submitted',       -- Submitted, awaiting review
    'under_review',    -- Being reviewed by admin
    'approved',        -- Approved, ready for project creation
    'in_progress',     -- Campaign is being built/executed
    'qa_review',       -- In QA review stage
    'completed',       -- Work completed, leads delivered
    'on_hold',         -- Temporarily paused
    'rejected',        -- Request rejected
    'cancelled'        -- Request cancelled
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE work_order_type AS ENUM (
    'call_campaign',      -- AI calling campaign
    'email_campaign',     -- Email outreach campaign
    'combo_campaign',     -- Combined call + email
    'data_enrichment',    -- Data enrichment/verification
    'lead_generation',    -- New lead generation
    'appointment_setting', -- Appointment setting focused
    'market_research',    -- Market research calls
    'custom'              -- Custom request
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE work_order_priority AS ENUM (
    'low',
    'normal',
    'high',
    'urgent'
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- ==================== TABLES ====================

CREATE TABLE IF NOT EXISTS work_orders (
  id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
  order_number TEXT NOT NULL UNIQUE,

  -- Client info
  client_account_id VARCHAR NOT NULL REFERENCES client_accounts(id) ON DELETE CASCADE,
  client_user_id VARCHAR REFERENCES client_users(id) ON DELETE SET NULL,

  -- Request details
  title TEXT NOT NULL,
  description TEXT,
  order_type work_order_type NOT NULL DEFAULT 'lead_generation',
  priority work_order_priority NOT NULL DEFAULT 'normal',
  status work_order_status NOT NULL DEFAULT 'draft',

  -- Target specifications
  target_industries TEXT[],
  target_titles TEXT[],
  target_company_size TEXT,
  target_regions TEXT[],
  target_account_count INTEGER,
  target_lead_count INTEGER,

  -- Timeline
  requested_start_date DATE,
  requested_end_date DATE,
  actual_start_date DATE,
  actual_end_date DATE,

  -- Budget
  estimated_budget NUMERIC(12, 2),
  approved_budget NUMERIC(12, 2),
  actual_spend NUMERIC(12, 2) DEFAULT 0,

  -- Client notes & requirements
  client_notes TEXT,
  special_requirements TEXT,

  -- Campaign configuration (JSONB for flexibility)
  campaign_config JSONB,

  -- Links to other entities (populated after approval)
  project_id VARCHAR REFERENCES client_projects(id) ON DELETE SET NULL,
  campaign_id VARCHAR REFERENCES campaigns(id) ON DELETE SET NULL,

  -- Admin workflow
  assigned_to VARCHAR REFERENCES users(id) ON DELETE SET NULL,
  admin_notes TEXT,
  internal_priority INTEGER,

  -- Review tracking
  reviewed_by VARCHAR REFERENCES users(id) ON DELETE SET NULL,
  reviewed_at TIMESTAMP,
  approved_by VARCHAR REFERENCES users(id) ON DELETE SET NULL,
  approved_at TIMESTAMP,
  rejected_by VARCHAR REFERENCES users(id) ON DELETE SET NULL,
  rejected_at TIMESTAMP,
  rejection_reason TEXT,

  -- Progress tracking
  progress_percent INTEGER DEFAULT 0,
  leads_generated INTEGER DEFAULT 0,
  leads_delivered INTEGER DEFAULT 0,

  -- QA tracking
  qa_status TEXT,
  qa_reviewed_by VARCHAR REFERENCES users(id) ON DELETE SET NULL,
  qa_reviewed_at TIMESTAMP,
  qa_notes TEXT,

  -- Timestamps
  submitted_at TIMESTAMP,
  completed_at TIMESTAMP,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- ==================== INDEXES ====================

CREATE INDEX IF NOT EXISTS work_orders_client_idx ON work_orders(client_account_id);
CREATE INDEX IF NOT EXISTS work_orders_status_idx ON work_orders(status);
CREATE INDEX IF NOT EXISTS work_orders_type_idx ON work_orders(order_type);
CREATE INDEX IF NOT EXISTS work_orders_project_idx ON work_orders(project_id);
CREATE INDEX IF NOT EXISTS work_orders_campaign_idx ON work_orders(campaign_id);
CREATE INDEX IF NOT EXISTS work_orders_assigned_idx ON work_orders(assigned_to);
CREATE UNIQUE INDEX IF NOT EXISTS work_orders_order_number_idx ON work_orders(order_number);

-- ==================== COMMENTS ====================

COMMENT ON TABLE work_orders IS 'Work Orders (client view) / Campaign Requests (admin view). Links clients to projects, campaigns, QA, and leads.';
COMMENT ON COLUMN work_orders.order_number IS 'Unique order number for client reference (e.g., WO-2026-0001)';
COMMENT ON COLUMN work_orders.status IS 'Workflow status: draft → submitted → under_review → approved → in_progress → qa_review → completed';
COMMENT ON COLUMN work_orders.project_id IS 'Linked project (created after approval)';
COMMENT ON COLUMN work_orders.campaign_id IS 'Linked campaign (created after approval)';
