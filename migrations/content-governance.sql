-- Content Governance: Product Feature Registry, Page-Feature Mappings, Page Versions, Governance Actions

-- Enums
DO $$ BEGIN
  CREATE TYPE content_governance_feature_status AS ENUM ('draft', 'active', 'deprecated', 'sunset');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE content_governance_action_type AS ENUM ('refresh_recommended', 'refresh_in_progress', 'refresh_completed', 'design_update', 'rollback', 'coverage_gap_detected');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Product Features (CMS pipeline / feature registry)
CREATE TABLE IF NOT EXISTS product_features (
  id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id VARCHAR NOT NULL REFERENCES campaign_organizations(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  slug TEXT NOT NULL,
  description TEXT,
  category TEXT,
  status content_governance_feature_status NOT NULL DEFAULT 'draft',
  release_date TIMESTAMP,
  key_benefits JSONB DEFAULT '[]'::jsonb,
  target_personas JSONB DEFAULT '[]'::jsonb,
  competitive_angle TEXT,
  metadata JSONB DEFAULT '{}'::jsonb,
  owner_id VARCHAR NOT NULL,
  tenant_id VARCHAR,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS product_features_org_idx ON product_features(organization_id);
CREATE UNIQUE INDEX IF NOT EXISTS product_features_org_slug_idx ON product_features(organization_id, slug);
CREATE INDEX IF NOT EXISTS product_features_status_idx ON product_features(status);

-- Page-Feature Mappings
CREATE TABLE IF NOT EXISTS page_feature_mappings (
  id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
  published_page_id VARCHAR NOT NULL REFERENCES generative_studio_published_pages(id) ON DELETE CASCADE,
  feature_id VARCHAR NOT NULL REFERENCES product_features(id) ON DELETE CASCADE,
  coverage_depth TEXT NOT NULL DEFAULT 'mentioned',
  ai_confidence REAL,
  last_verified_at TIMESTAMP,
  tenant_id VARCHAR,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS page_feature_mappings_page_idx ON page_feature_mappings(published_page_id);
CREATE INDEX IF NOT EXISTS page_feature_mappings_feature_idx ON page_feature_mappings(feature_id);
CREATE UNIQUE INDEX IF NOT EXISTS page_feature_mappings_page_feature_idx ON page_feature_mappings(published_page_id, feature_id);

-- Page Versions (version history for published pages)
CREATE TABLE IF NOT EXISTS page_versions (
  id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
  published_page_id VARCHAR NOT NULL REFERENCES generative_studio_published_pages(id) ON DELETE CASCADE,
  version_number INTEGER NOT NULL,
  html_content TEXT NOT NULL,
  css_content TEXT,
  change_description TEXT,
  change_trigger TEXT NOT NULL DEFAULT 'manual',
  feature_context JSONB,
  design_prompt TEXT,
  created_by VARCHAR,
  tenant_id VARCHAR,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS page_versions_page_version_idx ON page_versions(published_page_id, version_number);
CREATE INDEX IF NOT EXISTS page_versions_page_created_idx ON page_versions(published_page_id, created_at);

-- Content Governance Actions (audit log)
CREATE TABLE IF NOT EXISTS content_governance_actions (
  id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id VARCHAR NOT NULL REFERENCES campaign_organizations(id) ON DELETE CASCADE,
  action_type content_governance_action_type NOT NULL,
  published_page_id VARCHAR REFERENCES generative_studio_published_pages(id) ON DELETE SET NULL,
  feature_id VARCHAR REFERENCES product_features(id) ON DELETE SET NULL,
  description TEXT,
  ai_analysis JSONB,
  status TEXT NOT NULL DEFAULT 'pending',
  resolved_by VARCHAR,
  resolved_at TIMESTAMP,
  tenant_id VARCHAR,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS content_governance_actions_org_status_idx ON content_governance_actions(organization_id, status);
CREATE INDEX IF NOT EXISTS content_governance_actions_page_idx ON content_governance_actions(published_page_id);
CREATE INDEX IF NOT EXISTS content_governance_actions_feature_idx ON content_governance_actions(feature_id);
