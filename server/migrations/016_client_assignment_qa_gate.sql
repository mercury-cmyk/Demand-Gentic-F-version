-- Client Assignment & QA-Gated Visibility System Migration
-- Enables: Three-tier hierarchy, project types, universal QA gating for client-facing content

-- ==================== ENUMS ====================

-- Project type classification
DO $$ BEGIN
    CREATE TYPE project_type AS ENUM (
        'call_campaign',
        'email_campaign',
        'data_enrichment',
        'verification',
        'combo',
        'custom'
    );
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- QA content types for universal gating
DO $$ BEGIN
    CREATE TYPE qa_content_type AS ENUM (
        'simulation',
        'mock_call',
        'report',
        'data_export'
    );
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- Client-organization relationship types
DO $$ BEGIN
    CREATE TYPE client_relationship_type AS ENUM (
        'managed',
        'partner',
        'reseller'
    );
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- ==================== CLIENT-ORGANIZATION LINKS ====================

-- Links clients to campaign organizations for three-tier hierarchy
-- Super Org -> Campaign Orgs -> Clients (many-to-many)
CREATE TABLE IF NOT EXISTS client_organization_links (
    id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
    client_account_id VARCHAR NOT NULL REFERENCES client_accounts(id) ON DELETE CASCADE,
    campaign_organization_id VARCHAR NOT NULL REFERENCES campaign_organizations(id) ON DELETE CASCADE,

    -- Relationship metadata
    relationship_type client_relationship_type NOT NULL DEFAULT 'managed',
    is_primary BOOLEAN NOT NULL DEFAULT false,

    -- Audit
    created_by VARCHAR REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW(),

    UNIQUE(client_account_id, campaign_organization_id)
);

CREATE INDEX IF NOT EXISTS idx_client_org_links_client ON client_organization_links(client_account_id);
CREATE INDEX IF NOT EXISTS idx_client_org_links_org ON client_organization_links(campaign_organization_id);
CREATE INDEX IF NOT EXISTS idx_client_org_links_primary ON client_organization_links(client_account_id) WHERE is_primary = true;

-- ==================== QA-GATED CONTENT ====================

-- Universal QA gating for all content types (simulations, mock calls, reports, etc.)
CREATE TABLE IF NOT EXISTS qa_gated_content (
    id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Content identification
    content_type qa_content_type NOT NULL,
    content_id VARCHAR NOT NULL,

    -- Context references
    campaign_id VARCHAR REFERENCES campaigns(id) ON DELETE SET NULL,
    client_account_id VARCHAR REFERENCES client_accounts(id) ON DELETE CASCADE,
    project_id VARCHAR REFERENCES client_projects(id) ON DELETE SET NULL,

    -- QA Status (uses existing qa_status enum: new, under_review, approved, rejected, returned, published)
    qa_status qa_status NOT NULL DEFAULT 'new',
    qa_score INTEGER CHECK (qa_score >= 0 AND qa_score <= 100),
    qa_notes TEXT,
    qa_data JSONB,

    -- Review tracking
    reviewed_by VARCHAR REFERENCES users(id) ON DELETE SET NULL,
    reviewed_at TIMESTAMP,
    auto_reviewed BOOLEAN NOT NULL DEFAULT false,

    -- Visibility control
    client_visible BOOLEAN NOT NULL DEFAULT false,
    published_at TIMESTAMP,

    -- Audit
    created_by VARCHAR REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_qa_gated_content_type_id ON qa_gated_content(content_type, content_id);
CREATE INDEX IF NOT EXISTS idx_qa_gated_content_campaign ON qa_gated_content(campaign_id);
CREATE INDEX IF NOT EXISTS idx_qa_gated_content_client ON qa_gated_content(client_account_id);
CREATE INDEX IF NOT EXISTS idx_qa_gated_content_project ON qa_gated_content(project_id);
CREATE INDEX IF NOT EXISTS idx_qa_gated_content_status ON qa_gated_content(qa_status);
CREATE INDEX IF NOT EXISTS idx_qa_gated_content_visible ON qa_gated_content(client_account_id, client_visible) WHERE client_visible = true;
CREATE UNIQUE INDEX IF NOT EXISTS idx_qa_gated_content_unique ON qa_gated_content(content_type, content_id, client_account_id);

-- ==================== CLIENT SIMULATION SESSIONS ====================

-- Store client-facing simulation sessions with QA gating
CREATE TABLE IF NOT EXISTS client_simulation_sessions (
    id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),

    -- References
    client_account_id VARCHAR NOT NULL REFERENCES client_accounts(id) ON DELETE CASCADE,
    client_user_id VARCHAR REFERENCES client_users(id) ON DELETE SET NULL,
    campaign_id VARCHAR REFERENCES campaigns(id) ON DELETE SET NULL,
    project_id VARCHAR REFERENCES client_projects(id) ON DELETE SET NULL,

    -- Session data
    session_name TEXT,
    transcript JSONB,
    structured_transcript JSONB,
    duration_seconds INTEGER,

    -- QA gating reference
    qa_content_id VARCHAR REFERENCES qa_gated_content(id) ON DELETE SET NULL,

    -- Configuration used
    simulation_config JSONB,

    -- AI evaluation
    evaluation_result JSONB,
    evaluation_score INTEGER CHECK (evaluation_score >= 0 AND evaluation_score <= 100),

    -- Metadata
    metadata JSONB,

    -- Timestamps
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    completed_at TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_client_simulation_client ON client_simulation_sessions(client_account_id);
CREATE INDEX IF NOT EXISTS idx_client_simulation_campaign ON client_simulation_sessions(campaign_id);
CREATE INDEX IF NOT EXISTS idx_client_simulation_project ON client_simulation_sessions(project_id);
CREATE INDEX IF NOT EXISTS idx_client_simulation_qa ON client_simulation_sessions(qa_content_id);

-- ==================== CLIENT MOCK CALLS ====================

-- Store mock/test calls for client review with QA gating
CREATE TABLE IF NOT EXISTS client_mock_calls (
    id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),

    -- References
    client_account_id VARCHAR NOT NULL REFERENCES client_accounts(id) ON DELETE CASCADE,
    campaign_id VARCHAR REFERENCES campaigns(id) ON DELETE SET NULL,
    project_id VARCHAR REFERENCES client_projects(id) ON DELETE SET NULL,

    -- Call data
    call_name TEXT,
    recording_url TEXT,
    recording_s3_key TEXT,
    transcript TEXT,
    structured_transcript JSONB,
    duration_seconds INTEGER,

    -- Call metadata
    call_type VARCHAR(50) DEFAULT 'test', -- test, demo, sample
    disposition VARCHAR(100),

    -- QA gating reference
    qa_content_id VARCHAR REFERENCES qa_gated_content(id) ON DELETE SET NULL,

    -- AI analysis
    ai_analysis JSONB,
    ai_score INTEGER CHECK (ai_score >= 0 AND ai_score <= 100),

    -- Audit
    created_by VARCHAR REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_client_mock_calls_client ON client_mock_calls(client_account_id);
CREATE INDEX IF NOT EXISTS idx_client_mock_calls_campaign ON client_mock_calls(campaign_id);
CREATE INDEX IF NOT EXISTS idx_client_mock_calls_qa ON client_mock_calls(qa_content_id);

-- ==================== CLIENT REPORTS ====================

-- Store generated reports for client review with QA gating
CREATE TABLE IF NOT EXISTS client_reports (
    id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),

    -- References
    client_account_id VARCHAR NOT NULL REFERENCES client_accounts(id) ON DELETE CASCADE,
    campaign_id VARCHAR REFERENCES campaigns(id) ON DELETE SET NULL,
    project_id VARCHAR REFERENCES client_projects(id) ON DELETE SET NULL,

    -- Report details
    report_name TEXT NOT NULL,
    report_type VARCHAR(100) NOT NULL, -- performance, lead_summary, call_analytics, email_analytics, etc.
    report_period_start DATE,
    report_period_end DATE,

    -- Content
    report_data JSONB NOT NULL,
    report_summary TEXT,

    -- File storage
    file_url TEXT,
    file_format VARCHAR(20) DEFAULT 'json', -- json, csv, pdf, xlsx
    file_size_bytes BIGINT,

    -- QA gating reference
    qa_content_id VARCHAR REFERENCES qa_gated_content(id) ON DELETE SET NULL,

    -- Audit
    generated_by VARCHAR REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_client_reports_client ON client_reports(client_account_id);
CREATE INDEX IF NOT EXISTS idx_client_reports_campaign ON client_reports(campaign_id);
CREATE INDEX IF NOT EXISTS idx_client_reports_type ON client_reports(report_type);
CREATE INDEX IF NOT EXISTS idx_client_reports_qa ON client_reports(qa_content_id);

-- ==================== MODIFY CLIENT_PROJECTS ====================

-- Add project type and organization reference
ALTER TABLE client_projects
ADD COLUMN IF NOT EXISTS project_type project_type DEFAULT 'custom';

ALTER TABLE client_projects
ADD COLUMN IF NOT EXISTS campaign_organization_id VARCHAR REFERENCES campaign_organizations(id) ON DELETE SET NULL;

ALTER TABLE client_projects
ADD COLUMN IF NOT EXISTS qa_gate_config JSONB DEFAULT '{"enabled": true, "autoApproveThreshold": 85, "requireManualReview": false}';

CREATE INDEX IF NOT EXISTS idx_client_projects_type ON client_projects(project_type);
CREATE INDEX IF NOT EXISTS idx_client_projects_org ON client_projects(campaign_organization_id);

-- ==================== MODIFY CLIENT_ACCOUNTS ====================

-- Add primary organization reference and visibility settings
ALTER TABLE client_accounts
ADD COLUMN IF NOT EXISTS primary_organization_id VARCHAR REFERENCES campaign_organizations(id) ON DELETE SET NULL;

ALTER TABLE client_accounts
ADD COLUMN IF NOT EXISTS visibility_settings JSONB DEFAULT '{
    "showLeads": true,
    "showRecordings": true,
    "showTranscripts": true,
    "showSimulations": false,
    "showMockCalls": false,
    "showReports": true,
    "qaGateEnabled": true,
    "autoSyncApproved": false
}';

-- ==================== REGULAR CAMPAIGN ACCESS ====================

-- Add regular campaign access (in addition to verification campaigns)
ALTER TABLE client_campaign_access
ADD COLUMN IF NOT EXISTS regular_campaign_id VARCHAR REFERENCES campaigns(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_client_campaign_access_regular ON client_campaign_access(regular_campaign_id);

-- ==================== UPDATE TIMESTAMPS TRIGGERS ====================

-- Trigger for client_organization_links
DROP TRIGGER IF EXISTS update_client_organization_links_updated_at ON client_organization_links;
CREATE TRIGGER update_client_organization_links_updated_at
    BEFORE UPDATE ON client_organization_links
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Trigger for qa_gated_content
DROP TRIGGER IF EXISTS update_qa_gated_content_updated_at ON qa_gated_content;
CREATE TRIGGER update_qa_gated_content_updated_at
    BEFORE UPDATE ON qa_gated_content
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- ==================== HELPER VIEWS ====================

-- View for client hierarchy overview
CREATE OR REPLACE VIEW client_hierarchy_view AS
SELECT
    ca.id AS client_account_id,
    ca.name AS client_name,
    ca.company_name,
    col.campaign_organization_id,
    co.name AS organization_name,
    col.relationship_type,
    col.is_primary,
    parent_co.id AS super_organization_id,
    parent_co.name AS super_organization_name
FROM client_accounts ca
LEFT JOIN client_organization_links col ON ca.id = col.client_account_id
LEFT JOIN campaign_organizations co ON col.campaign_organization_id = co.id
LEFT JOIN campaign_organizations parent_co ON co.parent_organization_id = parent_co.id
WHERE ca.is_active = true;

-- View for QA content awaiting review
CREATE OR REPLACE VIEW qa_content_pending_review AS
SELECT
    qc.*,
    ca.name AS client_name,
    c.name AS campaign_name,
    cp.name AS project_name
FROM qa_gated_content qc
LEFT JOIN client_accounts ca ON qc.client_account_id = ca.id
LEFT JOIN campaigns c ON qc.campaign_id = c.id
LEFT JOIN client_projects cp ON qc.project_id = cp.id
WHERE qc.qa_status IN ('new', 'under_review')
ORDER BY qc.created_at DESC;

-- ==================== COMMENTS ====================

COMMENT ON TABLE client_organization_links IS 'Links clients to campaign organizations for three-tier hierarchy (Super Org -> Campaign Orgs -> Clients)';
COMMENT ON TABLE qa_gated_content IS 'Universal QA gating registry for all client-facing content (simulations, mock calls, reports, exports)';
COMMENT ON TABLE client_simulation_sessions IS 'Client-facing AI simulation sessions with QA gating';
COMMENT ON TABLE client_mock_calls IS 'Test/demo calls for client review with QA gating';
COMMENT ON TABLE client_reports IS 'Generated reports for client delivery with QA gating';
COMMENT ON VIEW client_hierarchy_view IS 'Overview of client-organization-super org hierarchy';
COMMENT ON VIEW qa_content_pending_review IS 'QA content awaiting review with related entity names';
