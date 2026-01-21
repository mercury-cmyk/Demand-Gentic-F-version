-- Migration 017: Search, Mapping & Intelligence (SMI) Agent Schema
-- Creates tables for B2B intelligence, role mapping, industry classification, and learning

-- ============================================================================
-- ENUMS
-- ============================================================================

-- Decision authority levels
CREATE TYPE decision_authority AS ENUM (
    'decision_maker',
    'influencer',
    'user',
    'gatekeeper'
);

-- Buying committee roles
CREATE TYPE buying_committee_role AS ENUM (
    'champion',
    'blocker',
    'evaluator',
    'budget_holder',
    'end_user'
);

-- Learning insight types
CREATE TYPE insight_type AS ENUM (
    'role_pattern',
    'industry_pattern',
    'objection_pattern',
    'approach_pattern',
    'messaging_pattern'
);

-- Learning insight scopes
CREATE TYPE insight_scope AS ENUM (
    'global',
    'organization',
    'campaign'
);

-- Role adjacency types
CREATE TYPE role_adjacency_type AS ENUM (
    'equivalent',
    'senior_to',
    'junior_to',
    'collaborates_with',
    'reports_to',
    'manages'
);

-- Title mapping sources
CREATE TYPE title_mapping_source AS ENUM (
    'manual',
    'ai',
    'system',
    'imported'
);

-- Industry levels
CREATE TYPE industry_level AS ENUM (
    'sector',
    'industry',
    'sub_industry'
);

-- ============================================================================
-- TABLE 1: Job Role Taxonomy (Master Reference)
-- ============================================================================

CREATE TABLE job_role_taxonomy (
    id SERIAL PRIMARY KEY,
    role_name TEXT NOT NULL,
    role_code TEXT NOT NULL UNIQUE,
    role_category TEXT NOT NULL, -- 'functional', 'technical', 'executive', 'support', 'specialist'
    job_function TEXT NOT NULL,  -- 'IT', 'Finance', 'HR', 'Marketing', 'Operations', 'Sales', 'Legal', 'Executive'
    seniority_level TEXT NOT NULL, -- 'entry', 'mid', 'senior', 'director', 'vp', 'c_level', 'board'
    decision_authority decision_authority NOT NULL DEFAULT 'influencer',
    department TEXT,
    synonyms TEXT[] DEFAULT '{}',
    keywords TEXT[] DEFAULT '{}', -- Keywords that indicate this role
    parent_role_id INTEGER REFERENCES job_role_taxonomy(id),
    typical_reports_to INTEGER REFERENCES job_role_taxonomy(id),
    description TEXT,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_role_taxonomy_function ON job_role_taxonomy(job_function);
CREATE INDEX idx_role_taxonomy_seniority ON job_role_taxonomy(seniority_level);
CREATE INDEX idx_role_taxonomy_category ON job_role_taxonomy(role_category);
CREATE INDEX idx_role_taxonomy_authority ON job_role_taxonomy(decision_authority);
CREATE INDEX idx_role_taxonomy_synonyms ON job_role_taxonomy USING GIN(synonyms);
CREATE INDEX idx_role_taxonomy_keywords ON job_role_taxonomy USING GIN(keywords);

-- ============================================================================
-- TABLE 2: Job Title Mappings (Raw Titles -> Normalized Roles)
-- ============================================================================

CREATE TABLE job_title_mappings (
    id SERIAL PRIMARY KEY,
    raw_title TEXT NOT NULL,
    raw_title_normalized TEXT NOT NULL, -- lowercase, trimmed, special chars removed
    mapped_role_id INTEGER REFERENCES job_role_taxonomy(id) NOT NULL,
    confidence NUMERIC(5, 4) NOT NULL DEFAULT 0.8,
    mapping_source title_mapping_source NOT NULL DEFAULT 'manual',
    verified_by VARCHAR(36) REFERENCES users(id),
    verified_at TIMESTAMP,
    usage_count INTEGER DEFAULT 0,
    last_used_at TIMESTAMP,
    notes TEXT,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

CREATE UNIQUE INDEX idx_title_mappings_normalized ON job_title_mappings(raw_title_normalized);
CREATE INDEX idx_title_mappings_role ON job_title_mappings(mapped_role_id);
CREATE INDEX idx_title_mappings_source ON job_title_mappings(mapping_source);
CREATE INDEX idx_title_mappings_confidence ON job_title_mappings(confidence DESC);

-- Enable trigram extension for fuzzy matching (if not already enabled)
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE INDEX idx_title_mappings_trgm ON job_title_mappings USING GIN(raw_title_normalized gin_trgm_ops);

-- ============================================================================
-- TABLE 3: Role Adjacency Graph (Related Roles)
-- ============================================================================

CREATE TABLE role_adjacency (
    id SERIAL PRIMARY KEY,
    source_role_id INTEGER REFERENCES job_role_taxonomy(id) NOT NULL,
    target_role_id INTEGER REFERENCES job_role_taxonomy(id) NOT NULL,
    adjacency_type role_adjacency_type NOT NULL,
    relationship_strength NUMERIC(5, 4) NOT NULL DEFAULT 0.5, -- 0-1 scale
    context_notes TEXT,
    is_bidirectional BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE UNIQUE INDEX idx_role_adjacency_pair ON role_adjacency(source_role_id, target_role_id, adjacency_type);
CREATE INDEX idx_role_adjacency_source ON role_adjacency(source_role_id);
CREATE INDEX idx_role_adjacency_target ON role_adjacency(target_role_id);
CREATE INDEX idx_role_adjacency_type ON role_adjacency(adjacency_type);

-- ============================================================================
-- TABLE 4: Industry Taxonomy (Enhanced Classification)
-- ============================================================================

CREATE TABLE industry_taxonomy (
    id SERIAL PRIMARY KEY,
    industry_name TEXT NOT NULL,
    industry_code TEXT NOT NULL UNIQUE, -- Internal canonical code (e.g., 'TECH_SAAS', 'FIN_BANKING')
    display_name TEXT NOT NULL, -- User-friendly name
    sic_codes TEXT[] DEFAULT '{}', -- SIC codes that map to this industry
    naics_codes TEXT[] DEFAULT '{}', -- NAICS codes that map to this industry
    parent_industry_id INTEGER REFERENCES industry_taxonomy(id),
    industry_level industry_level NOT NULL DEFAULT 'industry',
    synonyms TEXT[] DEFAULT '{}',
    keywords TEXT[] DEFAULT '{}',
    description TEXT,
    -- Intelligence fields (JSONB for flexibility)
    typical_challenges JSONB DEFAULT '[]', -- Common operational challenges
    regulatory_considerations JSONB DEFAULT '[]', -- Regulatory factors by region
    buying_behaviors JSONB DEFAULT '{}', -- Common B2B buying patterns
    seasonal_patterns JSONB DEFAULT '{}', -- Budget cycles, busy seasons
    technology_trends JSONB DEFAULT '[]', -- Current technology adoption trends
    competitive_landscape JSONB DEFAULT '{}', -- Industry competition insights
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_industry_taxonomy_parent ON industry_taxonomy(parent_industry_id);
CREATE INDEX idx_industry_taxonomy_level ON industry_taxonomy(industry_level);
CREATE INDEX idx_industry_taxonomy_sic ON industry_taxonomy USING GIN(sic_codes);
CREATE INDEX idx_industry_taxonomy_naics ON industry_taxonomy USING GIN(naics_codes);
CREATE INDEX idx_industry_taxonomy_synonyms ON industry_taxonomy USING GIN(synonyms);
CREATE INDEX idx_industry_taxonomy_trgm ON industry_taxonomy USING GIN(industry_name gin_trgm_ops);

-- ============================================================================
-- TABLE 5: Industry-Department Pain Point Mappings
-- ============================================================================

CREATE TABLE industry_department_pain_points (
    id SERIAL PRIMARY KEY,
    industry_id INTEGER REFERENCES industry_taxonomy(id) NOT NULL,
    department TEXT NOT NULL, -- 'IT', 'Finance', 'HR', 'Marketing', 'Operations', 'Sales', 'Legal', 'Executive'
    pain_points JSONB NOT NULL DEFAULT '[]', -- Array of structured pain points
    priorities JSONB DEFAULT '[]', -- Department priorities in this industry
    budget_considerations JSONB DEFAULT '{}', -- Budget cycles, typical spend
    decision_factors JSONB DEFAULT '[]', -- What drives decisions
    success_metrics JSONB DEFAULT '[]', -- KPIs this department cares about
    common_objections JSONB DEFAULT '[]', -- Common objections from this department
    messaging_angles JSONB DEFAULT '[]', -- Effective messaging approaches
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

CREATE UNIQUE INDEX idx_industry_dept_pain ON industry_department_pain_points(industry_id, department);
CREATE INDEX idx_industry_dept_industry ON industry_department_pain_points(industry_id);
CREATE INDEX idx_industry_dept_department ON industry_department_pain_points(department);

-- ============================================================================
-- TABLE 6: Business Perspective Definitions
-- ============================================================================

CREATE TABLE business_perspectives (
    id SERIAL PRIMARY KEY,
    perspective_code TEXT NOT NULL UNIQUE, -- 'finance', 'hr', 'marketing', 'operations', 'it_security'
    perspective_name TEXT NOT NULL,
    description TEXT,
    -- Evaluation criteria for this perspective
    evaluation_criteria JSONB NOT NULL DEFAULT '[]', -- What this lens evaluates
    key_metrics JSONB DEFAULT '[]', -- KPIs this perspective cares about
    common_concerns JSONB DEFAULT '[]', -- Typical concerns/objections
    value_drivers JSONB DEFAULT '[]', -- What motivates decisions
    roi_factors JSONB DEFAULT '[]', -- How ROI is calculated
    risk_factors JSONB DEFAULT '[]', -- Risk considerations
    -- Messaging guidance
    messaging_templates JSONB DEFAULT '[]', -- Template messaging approaches
    proof_point_types JSONB DEFAULT '[]', -- What types of evidence resonate
    -- Configuration
    applicable_to_departments TEXT[] DEFAULT '{}', -- Which departments this applies to
    priority_order INTEGER DEFAULT 50, -- Display/processing order
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_business_perspectives_active ON business_perspectives(is_active) WHERE is_active = TRUE;

-- ============================================================================
-- TABLE 7: Account Perspective Analysis (Cached Intelligence)
-- ============================================================================

CREATE TABLE account_perspective_analysis (
    id SERIAL PRIMARY KEY,
    account_id VARCHAR(36) REFERENCES accounts(id) ON DELETE CASCADE NOT NULL,
    perspective_id INTEGER REFERENCES business_perspectives(id) NOT NULL,
    -- Analysis content
    analysis_json JSONB NOT NULL, -- Perspective-specific analysis
    key_considerations TEXT[] DEFAULT '{}',
    value_drivers TEXT[] DEFAULT '{}',
    potential_concerns TEXT[] DEFAULT '{}',
    recommended_approach TEXT,
    messaging_angles TEXT[] DEFAULT '{}',
    questions_to_ask TEXT[] DEFAULT '{}',
    -- Metadata
    confidence NUMERIC(5, 4) NOT NULL DEFAULT 0.5,
    signals_used TEXT[] DEFAULT '{}', -- What signals informed this analysis
    generation_model TEXT,
    source_fingerprint TEXT, -- Hash of source data for cache invalidation
    -- Cache management
    generated_at TIMESTAMP NOT NULL DEFAULT NOW(),
    expires_at TIMESTAMP,
    is_stale BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

CREATE UNIQUE INDEX idx_account_perspective ON account_perspective_analysis(account_id, perspective_id);
CREATE INDEX idx_account_perspective_expires ON account_perspective_analysis(expires_at);
CREATE INDEX idx_account_perspective_stale ON account_perspective_analysis(is_stale) WHERE is_stale = FALSE;

-- ============================================================================
-- TABLE 8: Contact Intelligence Cache
-- ============================================================================

CREATE TABLE contact_intelligence (
    id SERIAL PRIMARY KEY,
    contact_id VARCHAR(36) REFERENCES contacts(id) ON DELETE CASCADE NOT NULL UNIQUE,
    -- Role Intelligence
    normalized_role_id INTEGER REFERENCES job_role_taxonomy(id),
    role_confidence NUMERIC(5, 4),
    role_mapping_source title_mapping_source,
    decision_authority decision_authority, -- Inferred from role
    buying_committee_role buying_committee_role, -- Champion, blocker, evaluator, etc.
    -- Persona Intelligence
    likely_priorities JSONB DEFAULT '[]', -- AI-inferred priorities based on role + industry
    communication_style_hints JSONB DEFAULT '{}', -- Time-constrained, detail-oriented, etc.
    pain_point_sensitivity JSONB DEFAULT '{}', -- Which pain points resonate
    -- Engagement Intelligence
    best_approach TEXT, -- 'direct', 'consultative', 'educational', 'peer-based'
    preferred_value_props TEXT[] DEFAULT '{}', -- Which value props likely resonate
    recommended_messaging_angles TEXT[] DEFAULT '{}',
    -- Behavioral patterns
    engagement_history_summary JSONB DEFAULT '{}', -- Summary of past interactions
    objection_history TEXT[] DEFAULT '{}', -- Past objections raised
    interest_signals TEXT[] DEFAULT '{}', -- Detected interest signals
    -- Scoring
    engagement_propensity NUMERIC(5, 4), -- 0-1 likelihood to engage
    qualification_propensity NUMERIC(5, 4), -- 0-1 likelihood to qualify
    -- Cache Management
    generated_at TIMESTAMP NOT NULL DEFAULT NOW(),
    generation_model TEXT,
    source_fingerprint TEXT,
    expires_at TIMESTAMP,
    is_stale BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_contact_intel_role ON contact_intelligence(normalized_role_id);
CREATE INDEX idx_contact_intel_authority ON contact_intelligence(decision_authority);
CREATE INDEX idx_contact_intel_committee ON contact_intelligence(buying_committee_role);
CREATE INDEX idx_contact_intel_expires ON contact_intelligence(expires_at);
CREATE INDEX idx_contact_intel_stale ON contact_intelligence(is_stale) WHERE is_stale = FALSE;

-- ============================================================================
-- TABLE 9: Call Outcome Learnings (Structured Learning Records)
-- ============================================================================

CREATE TABLE call_outcome_learnings (
    id SERIAL PRIMARY KEY,
    call_session_id VARCHAR(36) NOT NULL,
    campaign_id VARCHAR(36) REFERENCES campaigns(id) ON DELETE SET NULL,
    contact_id VARCHAR(36) REFERENCES contacts(id) ON DELETE SET NULL,
    account_id VARCHAR(36) REFERENCES accounts(id) ON DELETE SET NULL,
    -- Outcome Classification
    outcome_code TEXT NOT NULL, -- Canonical disposition
    outcome_category TEXT NOT NULL, -- 'positive', 'neutral', 'negative', 'inconclusive'
    outcome_quality_score NUMERIC(5, 4), -- 0-1 quality of the outcome
    -- Signals (Expanded)
    engagement_signals JSONB NOT NULL DEFAULT '{}', -- sentiment, interest_level, time_pressure, etc.
    objection_signals JSONB DEFAULT '{}', -- objection_type, intensity, topic, resolution
    qualification_signals JSONB DEFAULT '{}', -- BANT signals detected
    conversation_quality_signals JSONB DEFAULT '{}', -- clarity, rapport, flow, professionalism
    role_signals JSONB DEFAULT '{}', -- role confirmation, authority level, referral made
    industry_signals JSONB DEFAULT '{}', -- industry challenges mentioned, regulations
    messaging_signals JSONB DEFAULT '{}', -- angle used, effectiveness, proof points
    -- Context
    contact_role_id INTEGER REFERENCES job_role_taxonomy(id),
    industry_id INTEGER REFERENCES industry_taxonomy(id),
    problem_ids INTEGER[] DEFAULT '{}', -- Problem IDs that were discussed
    messaging_angle_used TEXT,
    approach_used TEXT, -- 'exploratory', 'consultative', 'direct', 'educational'
    value_props_presented TEXT[] DEFAULT '{}',
    -- Adjustments Applied
    adjustments_applied JSONB DEFAULT '{}', -- What coaching adjustments were active
    -- Call metadata
    call_duration_seconds INTEGER,
    talk_ratio NUMERIC(5, 4), -- Agent talk time / total time
    call_timestamp TIMESTAMP NOT NULL,
    -- Processing
    processed_for_learning BOOLEAN DEFAULT FALSE,
    processed_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_call_learnings_campaign ON call_outcome_learnings(campaign_id);
CREATE INDEX idx_call_learnings_contact ON call_outcome_learnings(contact_id);
CREATE INDEX idx_call_learnings_account ON call_outcome_learnings(account_id);
CREATE INDEX idx_call_learnings_outcome ON call_outcome_learnings(outcome_code);
CREATE INDEX idx_call_learnings_category ON call_outcome_learnings(outcome_category);
CREATE INDEX idx_call_learnings_role ON call_outcome_learnings(contact_role_id);
CREATE INDEX idx_call_learnings_industry ON call_outcome_learnings(industry_id);
CREATE INDEX idx_call_learnings_timestamp ON call_outcome_learnings(call_timestamp);
CREATE INDEX idx_call_learnings_unprocessed ON call_outcome_learnings(processed_for_learning) WHERE processed_for_learning = FALSE;

-- ============================================================================
-- TABLE 10: Learning Insights (Aggregated Patterns)
-- ============================================================================

CREATE TABLE learning_insights (
    id SERIAL PRIMARY KEY,
    insight_type insight_type NOT NULL,
    insight_scope insight_scope NOT NULL,
    scope_id VARCHAR(36), -- campaign_id or organization_id if scoped
    -- Pattern Details
    pattern_key TEXT NOT NULL, -- e.g., 'cfo_tech_approach', 'healthcare_compliance_objection'
    pattern_name TEXT NOT NULL, -- Human-readable name
    pattern_description TEXT NOT NULL,
    pattern_data JSONB NOT NULL, -- Detailed pattern analysis
    -- Segmentation
    applies_to_roles INTEGER[] DEFAULT '{}', -- Role IDs this pattern applies to
    applies_to_industries INTEGER[] DEFAULT '{}', -- Industry IDs this pattern applies to
    applies_to_seniority TEXT[] DEFAULT '{}', -- Seniority levels
    applies_to_departments TEXT[] DEFAULT '{}', -- Departments
    -- Statistics
    sample_size INTEGER NOT NULL,
    success_rate NUMERIC(5, 4),
    avg_engagement_score NUMERIC(5, 4),
    avg_qualification_score NUMERIC(5, 4),
    confidence NUMERIC(5, 4) NOT NULL,
    statistical_significance NUMERIC(5, 4), -- p-value or similar
    -- Recommendations
    recommended_adjustments JSONB DEFAULT '{}',
    recommended_messaging TEXT[] DEFAULT '{}',
    recommended_approaches TEXT[] DEFAULT '{}',
    anti_patterns TEXT[] DEFAULT '{}', -- What to avoid
    -- Validity
    generated_at TIMESTAMP NOT NULL DEFAULT NOW(),
    generation_model TEXT,
    valid_from TIMESTAMP NOT NULL DEFAULT NOW(),
    valid_until TIMESTAMP,
    is_active BOOLEAN DEFAULT TRUE,
    -- Versioning
    version INTEGER DEFAULT 1,
    previous_version_id INTEGER REFERENCES learning_insights(id),
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_learning_insights_type ON learning_insights(insight_type);
CREATE INDEX idx_learning_insights_scope ON learning_insights(insight_scope, scope_id);
CREATE INDEX idx_learning_insights_key ON learning_insights(pattern_key);
CREATE INDEX idx_learning_insights_active ON learning_insights(is_active) WHERE is_active = TRUE;
CREATE INDEX idx_learning_insights_roles ON learning_insights USING GIN(applies_to_roles);
CREATE INDEX idx_learning_insights_industries ON learning_insights USING GIN(applies_to_industries);
CREATE INDEX idx_learning_insights_valid ON learning_insights(valid_until) WHERE valid_until IS NOT NULL;

-- ============================================================================
-- TABLE 11: Contact Predictive Scores
-- ============================================================================

CREATE TABLE contact_predictive_scores (
    id SERIAL PRIMARY KEY,
    contact_id VARCHAR(36) REFERENCES contacts(id) ON DELETE CASCADE NOT NULL,
    campaign_id VARCHAR(36) REFERENCES campaigns(id) ON DELETE CASCADE NOT NULL,
    -- Scores (0-1 scale)
    engagement_likelihood NUMERIC(5, 4) NOT NULL,
    qualification_likelihood NUMERIC(5, 4) NOT NULL,
    conversion_likelihood NUMERIC(5, 4), -- If applicable
    -- Contributing Factor Scores
    role_score NUMERIC(5, 4), -- Score from role matching
    industry_score NUMERIC(5, 4), -- Score from industry fit
    problem_fit_score NUMERIC(5, 4), -- Score from problem intelligence
    historical_pattern_score NUMERIC(5, 4), -- Score from learning patterns
    account_fit_score NUMERIC(5, 4), -- Score from account characteristics
    timing_score NUMERIC(5, 4), -- Score based on timing/recency
    -- Factor explanations
    score_factors JSONB DEFAULT '{}', -- Detailed breakdown of what contributed
    -- Recommended Actions
    recommended_approach TEXT, -- 'direct', 'consultative', 'educational'
    recommended_messaging_angles TEXT[] DEFAULT '{}',
    recommended_value_props TEXT[] DEFAULT '{}',
    recommended_proof_points TEXT[] DEFAULT '{}',
    -- Priority
    call_priority INTEGER NOT NULL DEFAULT 50, -- 1-100 (higher = more priority)
    priority_tier TEXT, -- 'high', 'medium', 'low'
    -- Flags
    has_blocking_factors BOOLEAN DEFAULT FALSE,
    blocking_factors TEXT[] DEFAULT '{}',
    -- Cache Management
    generated_at TIMESTAMP NOT NULL DEFAULT NOW(),
    generation_model TEXT,
    source_fingerprint TEXT,
    expires_at TIMESTAMP,
    is_stale BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

CREATE UNIQUE INDEX idx_contact_score_campaign ON contact_predictive_scores(contact_id, campaign_id);
CREATE INDEX idx_contact_score_priority ON contact_predictive_scores(campaign_id, call_priority DESC);
CREATE INDEX idx_contact_score_engagement ON contact_predictive_scores(campaign_id, engagement_likelihood DESC);
CREATE INDEX idx_contact_score_qualification ON contact_predictive_scores(campaign_id, qualification_likelihood DESC);
CREATE INDEX idx_contact_score_expires ON contact_predictive_scores(expires_at);
CREATE INDEX idx_contact_score_stale ON contact_predictive_scores(is_stale) WHERE is_stale = FALSE;
CREATE INDEX idx_contact_score_tier ON contact_predictive_scores(campaign_id, priority_tier);

-- ============================================================================
-- TABLE 12: SMI Audit Log
-- ============================================================================

CREATE TABLE smi_audit_log (
    id SERIAL PRIMARY KEY,
    operation_type TEXT NOT NULL, -- 'title_mapping', 'industry_classification', 'perspective_analysis', etc.
    operation_subtype TEXT, -- More specific operation
    entity_type TEXT, -- 'contact', 'account', 'campaign'
    entity_id VARCHAR(36),
    -- Operation details
    input_data JSONB,
    output_data JSONB,
    confidence NUMERIC(5, 4),
    model_used TEXT,
    -- Performance
    processing_time_ms INTEGER,
    tokens_used INTEGER,
    -- User/System
    triggered_by VARCHAR(36) REFERENCES users(id),
    triggered_by_system BOOLEAN DEFAULT FALSE,
    -- Metadata
    campaign_id VARCHAR(36),
    session_id VARCHAR(36),
    ip_address TEXT,
    user_agent TEXT,
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_smi_audit_operation ON smi_audit_log(operation_type);
CREATE INDEX idx_smi_audit_entity ON smi_audit_log(entity_type, entity_id);
CREATE INDEX idx_smi_audit_campaign ON smi_audit_log(campaign_id);
CREATE INDEX idx_smi_audit_timestamp ON smi_audit_log(created_at);
CREATE INDEX idx_smi_audit_user ON smi_audit_log(triggered_by);

-- ============================================================================
-- FUNCTIONS: Title Normalization
-- ============================================================================

CREATE OR REPLACE FUNCTION normalize_job_title(title TEXT)
RETURNS TEXT AS $$
BEGIN
    RETURN LOWER(
        TRIM(
            REGEXP_REPLACE(
                REGEXP_REPLACE(title, '[^a-zA-Z0-9\s]', '', 'g'),
                '\s+', ' ', 'g'
            )
        )
    );
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- ============================================================================
-- TRIGGERS: Auto-update timestamps
-- ============================================================================

CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER job_role_taxonomy_updated_at BEFORE UPDATE ON job_role_taxonomy
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER job_title_mappings_updated_at BEFORE UPDATE ON job_title_mappings
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER industry_taxonomy_updated_at BEFORE UPDATE ON industry_taxonomy
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER industry_department_pain_points_updated_at BEFORE UPDATE ON industry_department_pain_points
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER business_perspectives_updated_at BEFORE UPDATE ON business_perspectives
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER account_perspective_analysis_updated_at BEFORE UPDATE ON account_perspective_analysis
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER contact_intelligence_updated_at BEFORE UPDATE ON contact_intelligence
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER learning_insights_updated_at BEFORE UPDATE ON learning_insights
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER contact_predictive_scores_updated_at BEFORE UPDATE ON contact_predictive_scores
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ============================================================================
-- COMMENTS
-- ============================================================================

COMMENT ON TABLE job_role_taxonomy IS 'Master taxonomy of normalized B2B job roles with decision authority and function mappings';
COMMENT ON TABLE job_title_mappings IS 'Maps raw job titles to normalized roles in the taxonomy with confidence scores';
COMMENT ON TABLE role_adjacency IS 'Graph of related roles (equivalent, senior/junior, collaborators)';
COMMENT ON TABLE industry_taxonomy IS 'Hierarchical industry classification with SIC/NAICS mappings and intelligence';
COMMENT ON TABLE industry_department_pain_points IS 'Matrix of pain points by industry and department combination';
COMMENT ON TABLE business_perspectives IS 'Definitions of business evaluation lenses (Finance, HR, Marketing, etc.)';
COMMENT ON TABLE account_perspective_analysis IS 'Cached multi-perspective intelligence for accounts';
COMMENT ON TABLE contact_intelligence IS 'Cached intelligence for contacts including role mapping and engagement insights';
COMMENT ON TABLE call_outcome_learnings IS 'Structured records of call outcomes with signals for learning';
COMMENT ON TABLE learning_insights IS 'Aggregated patterns detected from call outcomes across campaigns';
COMMENT ON TABLE contact_predictive_scores IS 'Predictive scores for contacts in specific campaigns';
COMMENT ON TABLE smi_audit_log IS 'Audit trail for SMI Agent operations';
