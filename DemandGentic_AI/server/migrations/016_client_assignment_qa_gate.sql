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
    qa_score INTEGER CHECK (qa_score >= 0 AND qa_score = 0 AND evaluation_score = 0 AND ai_score  Campaign Orgs -> Clients)';
COMMENT ON TABLE qa_gated_content IS 'Universal QA gating registry for all client-facing content (simulations, mock calls, reports, exports)';
COMMENT ON TABLE client_simulation_sessions IS 'Client-facing AI simulation sessions with QA gating';
COMMENT ON TABLE client_mock_calls IS 'Test/demo calls for client review with QA gating';
COMMENT ON TABLE client_reports IS 'Generated reports for client delivery with QA gating';
COMMENT ON VIEW client_hierarchy_view IS 'Overview of client-organization-super org hierarchy';
COMMENT ON VIEW qa_content_pending_review IS 'QA content awaiting review with related entity names';