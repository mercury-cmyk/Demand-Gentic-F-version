-- Organization Intelligence Injection Model Migration
-- Supports 3 modes: use_existing | fresh_research | none

-- Create enum for OI modes
DO $$ BEGIN
    CREATE TYPE org_intelligence_mode AS ENUM ('use_existing', 'fresh_research', 'none');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- Organization Intelligence Snapshots
-- Campaign-scoped, agency-owned snapshots
CREATE TABLE IF NOT EXISTS organization_intelligence_snapshots (
    id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
    
    -- Source identification
    organization_name TEXT NOT NULL,
    website_url TEXT,
    industry TEXT,
    domain TEXT,
    
    -- Structured Intelligence (JSONB)
    identity JSONB NOT NULL DEFAULT '{}',
    offerings JSONB NOT NULL DEFAULT '{}',
    icp JSONB NOT NULL DEFAULT '{}',
    positioning JSONB NOT NULL DEFAULT '{}',
    outreach JSONB NOT NULL DEFAULT '{}',
    
    -- Compiled prompt-ready content
    compiled_org_context TEXT,
    
    -- Research metadata
    research_notes TEXT,
    raw_research_content TEXT,
    research_sources JSONB,
    confidence_score REAL,
    model_version TEXT,
    
    -- Ownership & Reusability
    is_reusable BOOLEAN NOT NULL DEFAULT false,
    parent_snapshot_id VARCHAR,
    
    -- Agency control
    created_by VARCHAR REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
    archived_at TIMESTAMP
);

-- Indexes for snapshots
CREATE INDEX IF NOT EXISTS oi_snapshots_domain_idx ON organization_intelligence_snapshots(domain);
CREATE INDEX IF NOT EXISTS oi_snapshots_org_name_idx ON organization_intelligence_snapshots(organization_name);
CREATE INDEX IF NOT EXISTS oi_snapshots_reusable_idx ON organization_intelligence_snapshots(is_reusable);
CREATE INDEX IF NOT EXISTS oi_snapshots_created_at_idx ON organization_intelligence_snapshots(created_at);

-- Campaign Organization Intelligence Bindings
-- Binds OI to campaigns (not agents!)
CREATE TABLE IF NOT EXISTS campaign_org_intelligence_bindings (
    id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
    
    -- Campaign binding
    campaign_id VARCHAR NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
    
    -- OI Mode
    mode org_intelligence_mode NOT NULL DEFAULT 'use_existing',
    
    -- Snapshot reference
    snapshot_id VARCHAR REFERENCES organization_intelligence_snapshots(id) ON DELETE SET NULL,
    
    -- Master org intelligence reference
    master_org_intelligence_id INTEGER REFERENCES account_intelligence(id) ON DELETE SET NULL,
    
    -- Runtime config
    disclosure_level TEXT NOT NULL DEFAULT 'standard',
    
    -- Audit
    bound_by VARCHAR REFERENCES users(id) ON DELETE SET NULL,
    bound_at TIMESTAMP NOT NULL DEFAULT NOW(),
    
    -- One binding per campaign
    CONSTRAINT campaign_oi_binding_uniq UNIQUE (campaign_id)
);

-- Indexes for bindings
CREATE INDEX IF NOT EXISTS campaign_oi_binding_snapshot_idx ON campaign_org_intelligence_bindings(snapshot_id);
CREATE INDEX IF NOT EXISTS campaign_oi_binding_mode_idx ON campaign_org_intelligence_bindings(mode);

-- Agent Instance Contexts
-- Cached assembled prompts for performance
CREATE TABLE IF NOT EXISTS agent_instance_contexts (
    id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
    
    -- Agent & Campaign binding
    virtual_agent_id VARCHAR NOT NULL REFERENCES virtual_agents(id) ON DELETE CASCADE,
    campaign_id VARCHAR REFERENCES campaigns(id) ON DELETE CASCADE,
    
    -- Version tracking
    universal_knowledge_hash TEXT,
    organization_context_hash TEXT,
    
    -- Assembled prompt
    assembled_system_prompt TEXT NOT NULL,
    assembled_first_message TEXT,
    
    -- Metadata
    assembly_metadata JSONB,
    
    -- Lifecycle
    is_active BOOLEAN NOT NULL DEFAULT true,
    activated_at TIMESTAMP NOT NULL DEFAULT NOW(),
    deactivated_at TIMESTAMP,
    
    -- One active context per agent-campaign pair
    CONSTRAINT agent_instance_campaign_uniq UNIQUE (virtual_agent_id, campaign_id)
);

-- Indexes for contexts
CREATE INDEX IF NOT EXISTS agent_instance_active_idx ON agent_instance_contexts(is_active);

-- Trigger for updated_at on snapshots
CREATE OR REPLACE FUNCTION update_oi_snapshot_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS oi_snapshot_updated_at ON organization_intelligence_snapshots;
CREATE TRIGGER oi_snapshot_updated_at
    BEFORE UPDATE ON organization_intelligence_snapshots
    FOR EACH ROW
    EXECUTE FUNCTION update_oi_snapshot_updated_at();

-- Comments
COMMENT ON TABLE organization_intelligence_snapshots IS 'Agency-owned organization research snapshots for voice agents';
COMMENT ON TABLE campaign_org_intelligence_bindings IS 'Binds organization intelligence to campaigns (campaign-scoped, not agent-scoped)';
COMMENT ON TABLE agent_instance_contexts IS 'Cached assembled agent prompts with all 3 knowledge layers';
COMMENT ON COLUMN campaign_org_intelligence_bindings.mode IS 'use_existing: load from saved OI, fresh_research: run real-time research, none: neutral agent';
