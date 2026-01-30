-- Research & Analysis Agent Database Schema
-- Migration: Add tables for research analysis, scoring configurations, account health, and next best actions

-- ==================== RESEARCH ANALYSIS RECORDS ====================
-- Core table for logging all analysis operations

CREATE TABLE IF NOT EXISTS research_analysis_records (
  id VARCHAR(255) PRIMARY KEY DEFAULT gen_random_uuid()::text,

  -- Entity being analyzed
  entity_type VARCHAR(50) NOT NULL,  -- lead, email, call, contact, account
  entity_id VARCHAR(255) NOT NULL,

  -- Analysis context
  campaign_id VARCHAR(255) REFERENCES campaigns(id) ON DELETE SET NULL,
  organization_id VARCHAR(255),
  analysis_type VARCHAR(50) NOT NULL,  -- lead_quality, email_quality, call_quality, etc.

  -- Module and model info
  module_id VARCHAR(100) NOT NULL,
  module_version VARCHAR(20) NOT NULL,
  scoring_model_id VARCHAR(100),
  scoring_model_version VARCHAR(20),

  -- Results
  overall_score INTEGER,
  score_tier VARCHAR(20),  -- exceptional, good, acceptable, below_standard, critical
  score_components JSONB,  -- Array of component scores
  score_factors JSONB,  -- Array of contributing factors
  confidence_score NUMERIC(5, 4),

  -- Findings
  findings JSONB,  -- Array of findings with type, category, severity
  findings_count INTEGER DEFAULT 0,
  critical_findings_count INTEGER DEFAULT 0,

  -- Recommendations
  recommendations JSONB,  -- Array of recommendations with priority
  recommendations_count INTEGER DEFAULT 0,

  -- Evidence
  evidence JSONB,  -- Array of evidence citations

  -- Configuration used
  configuration_applied JSONB,

  -- Execution metadata
  execution_duration_ms INTEGER,
  ai_model_used VARCHAR(100),
  ai_tokens_used INTEGER,
  data_sources_used JSONB,  -- Array of data source names

  -- Status
  status VARCHAR(20) DEFAULT 'completed',  -- pending, processing, completed, failed
  error_message TEXT,

  -- Audit
  triggered_by VARCHAR(50),  -- user, system, schedule, api
  triggered_by_user_id VARCHAR(255) REFERENCES users(id) ON DELETE SET NULL,

  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indexes for research_analysis_records
CREATE INDEX IF NOT EXISTS idx_research_analysis_entity ON research_analysis_records(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_research_analysis_campaign ON research_analysis_records(campaign_id);
CREATE INDEX IF NOT EXISTS idx_research_analysis_type ON research_analysis_records(analysis_type);
CREATE INDEX IF NOT EXISTS idx_research_analysis_score ON research_analysis_records(overall_score);
CREATE INDEX IF NOT EXISTS idx_research_analysis_created ON research_analysis_records(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_research_analysis_status ON research_analysis_records(status);


-- ==================== SCORING MODEL CONFIGURATIONS ====================
-- Store custom scoring model configurations

CREATE TABLE IF NOT EXISTS scoring_model_configurations (
  id VARCHAR(255) PRIMARY KEY DEFAULT gen_random_uuid()::text,

  -- Model identification
  model_type VARCHAR(50) NOT NULL,  -- lead_quality, email_quality, etc.
  model_name VARCHAR(100) NOT NULL,
  model_version VARCHAR(20) DEFAULT '1.0.0',

  -- Scope
  organization_id VARCHAR(255),
  campaign_id VARCHAR(255) REFERENCES campaigns(id) ON DELETE CASCADE,
  is_default BOOLEAN DEFAULT FALSE,

  -- Configuration
  weights JSONB NOT NULL,  -- Component weights
  thresholds JSONB NOT NULL,  -- Tier thresholds
  normalization VARCHAR(20) DEFAULT 'linear',  -- linear, logarithmic, sigmoid
  custom_rules JSONB,  -- Array of custom scoring rules

  -- Metadata
  description TEXT,
  created_by VARCHAR(255) REFERENCES users(id) ON DELETE SET NULL,

  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

  -- Soft delete
  is_active BOOLEAN DEFAULT TRUE
);

-- Indexes for scoring_model_configurations
CREATE INDEX IF NOT EXISTS idx_scoring_model_type ON scoring_model_configurations(model_type);
CREATE INDEX IF NOT EXISTS idx_scoring_model_org ON scoring_model_configurations(organization_id);
CREATE INDEX IF NOT EXISTS idx_scoring_model_campaign ON scoring_model_configurations(campaign_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_scoring_model_default ON scoring_model_configurations(model_type, organization_id)
  WHERE is_default = TRUE AND is_active = TRUE;


-- ==================== ACCOUNT HEALTH SCORES ====================
-- Track account health over time

CREATE TABLE IF NOT EXISTS account_health_scores (
  id VARCHAR(255) PRIMARY KEY DEFAULT gen_random_uuid()::text,

  account_id VARCHAR(255) REFERENCES accounts(id) ON DELETE CASCADE NOT NULL,
  campaign_id VARCHAR(255) REFERENCES campaigns(id) ON DELETE SET NULL,

  -- Scores
  overall_health_score INTEGER NOT NULL,
  fit_score INTEGER,
  engagement_score INTEGER,
  intent_score INTEGER,
  relationship_score INTEGER,
  risk_score INTEGER,

  -- Score breakdown
  score_components JSONB,
  score_factors JSONB,

  -- Health indicators
  health_status VARCHAR(20),  -- thriving, healthy, at_risk, critical
  trend VARCHAR(20),  -- improving, stable, declining
  trend_velocity NUMERIC(5, 4),  -- rate of change

  -- Risk factors
  risk_factors JSONB,

  -- Opportunities
  opportunities JSONB,

  -- Metadata
  scoring_model_id VARCHAR(255),
  analysis_id VARCHAR(255) REFERENCES research_analysis_records(id) ON DELETE SET NULL,

  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indexes for account_health_scores
CREATE INDEX IF NOT EXISTS idx_account_health_account ON account_health_scores(account_id);
CREATE INDEX IF NOT EXISTS idx_account_health_campaign ON account_health_scores(campaign_id);
CREATE INDEX IF NOT EXISTS idx_account_health_score ON account_health_scores(overall_health_score);
CREATE INDEX IF NOT EXISTS idx_account_health_status ON account_health_scores(health_status);
CREATE INDEX IF NOT EXISTS idx_account_health_created ON account_health_scores(created_at DESC);


-- ==================== NEXT BEST ACTION RECORDS ====================
-- Store NBA recommendations

CREATE TABLE IF NOT EXISTS next_best_action_records (
  id VARCHAR(255) PRIMARY KEY DEFAULT gen_random_uuid()::text,

  -- Context
  contact_id VARCHAR(255) REFERENCES contacts(id) ON DELETE CASCADE,
  account_id VARCHAR(255) REFERENCES accounts(id) ON DELETE CASCADE,
  campaign_id VARCHAR(255) REFERENCES campaigns(id) ON DELETE SET NULL,

  -- Recommendation
  action_type VARCHAR(50) NOT NULL,  -- contact, message, offer, follow_up, escalate
  action_channel VARCHAR(20),  -- email, call, sms, linkedin
  action_description TEXT NOT NULL,
  action_details JSONB,

  -- Prioritization
  priority VARCHAR(20) NOT NULL,  -- immediate, high, medium, low
  expected_impact VARCHAR(255),
  effort_level VARCHAR(20),  -- low, medium, high
  success_probability NUMERIC(5, 4),

  -- Scoring factors
  contributing_factors JSONB,  -- What led to this recommendation

  -- Status tracking
  status VARCHAR(20) DEFAULT 'pending',  -- pending, in_progress, completed, skipped, expired
  assigned_to VARCHAR(255) REFERENCES users(id) ON DELETE SET NULL,
  completed_at TIMESTAMP WITH TIME ZONE,
  completion_notes TEXT,
  outcome VARCHAR(50),  -- successful, unsuccessful, no_response

  -- Validity
  valid_from TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  valid_until TIMESTAMP WITH TIME ZONE,

  -- Audit
  generated_by_analysis_id VARCHAR(255) REFERENCES research_analysis_records(id) ON DELETE SET NULL,

  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indexes for next_best_action_records
CREATE INDEX IF NOT EXISTS idx_nba_contact ON next_best_action_records(contact_id);
CREATE INDEX IF NOT EXISTS idx_nba_account ON next_best_action_records(account_id);
CREATE INDEX IF NOT EXISTS idx_nba_campaign ON next_best_action_records(campaign_id);
CREATE INDEX IF NOT EXISTS idx_nba_status ON next_best_action_records(status);
CREATE INDEX IF NOT EXISTS idx_nba_priority ON next_best_action_records(priority);
CREATE INDEX IF NOT EXISTS idx_nba_valid ON next_best_action_records(valid_from, valid_until);
CREATE INDEX IF NOT EXISTS idx_nba_assigned ON next_best_action_records(assigned_to) WHERE assigned_to IS NOT NULL;


-- ==================== ENGAGEMENT ANALYSIS RECORDS ====================
-- Track engagement metrics over time

CREATE TABLE IF NOT EXISTS engagement_analysis_records (
  id VARCHAR(255) PRIMARY KEY DEFAULT gen_random_uuid()::text,

  contact_id VARCHAR(255) REFERENCES contacts(id) ON DELETE CASCADE NOT NULL,
  account_id VARCHAR(255) REFERENCES accounts(id) ON DELETE SET NULL,
  campaign_id VARCHAR(255) REFERENCES campaigns(id) ON DELETE SET NULL,

  -- Analysis period
  analysis_period_start TIMESTAMP WITH TIME ZONE NOT NULL,
  analysis_period_end TIMESTAMP WITH TIME ZONE NOT NULL,

  -- Engagement metrics
  overall_engagement_score INTEGER,

  -- Sentiment analysis
  sentiment VARCHAR(20),  -- positive, neutral, negative, mixed
  sentiment_score NUMERIC(5, 4),  -- -1 to 1
  sentiment_trajectory VARCHAR(20),  -- improving, stable, declining

  -- Intent signals
  intent_score INTEGER,
  intent_signals JSONB,  -- Array of detected intent signals

  -- Momentum
  momentum_score INTEGER,
  momentum_direction VARCHAR(20),  -- accelerating, steady, decelerating, stalled

  -- Channel breakdown
  channel_engagement JSONB,  -- Per-channel engagement metrics

  -- Activity summary
  total_interactions INTEGER,
  email_opens INTEGER,
  email_clicks INTEGER,
  email_replies INTEGER,
  calls_connected INTEGER,
  meetings_scheduled INTEGER,

  -- Behavioral patterns
  engagement_patterns JSONB,
  anomalies JSONB,

  -- Predictions
  engagement_forecast JSONB,
  churn_risk_score NUMERIC(5, 4),

  -- Metadata
  analysis_id VARCHAR(255) REFERENCES research_analysis_records(id) ON DELETE SET NULL,

  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indexes for engagement_analysis_records
CREATE INDEX IF NOT EXISTS idx_engagement_contact ON engagement_analysis_records(contact_id);
CREATE INDEX IF NOT EXISTS idx_engagement_account ON engagement_analysis_records(account_id);
CREATE INDEX IF NOT EXISTS idx_engagement_campaign ON engagement_analysis_records(campaign_id);
CREATE INDEX IF NOT EXISTS idx_engagement_period ON engagement_analysis_records(analysis_period_start, analysis_period_end);
CREATE INDEX IF NOT EXISTS idx_engagement_score ON engagement_analysis_records(overall_engagement_score);
CREATE INDEX IF NOT EXISTS idx_engagement_created ON engagement_analysis_records(created_at DESC);


-- ==================== ADD UPDATED_AT TRIGGER ====================
-- Automatically update updated_at timestamp

CREATE OR REPLACE FUNCTION update_research_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply trigger to tables with updated_at
DROP TRIGGER IF EXISTS research_analysis_updated_at ON research_analysis_records;
CREATE TRIGGER research_analysis_updated_at
  BEFORE UPDATE ON research_analysis_records
  FOR EACH ROW EXECUTE FUNCTION update_research_updated_at();

DROP TRIGGER IF EXISTS scoring_model_updated_at ON scoring_model_configurations;
CREATE TRIGGER scoring_model_updated_at
  BEFORE UPDATE ON scoring_model_configurations
  FOR EACH ROW EXECUTE FUNCTION update_research_updated_at();

DROP TRIGGER IF EXISTS account_health_updated_at ON account_health_scores;
CREATE TRIGGER account_health_updated_at
  BEFORE UPDATE ON account_health_scores
  FOR EACH ROW EXECUTE FUNCTION update_research_updated_at();

DROP TRIGGER IF EXISTS nba_updated_at ON next_best_action_records;
CREATE TRIGGER nba_updated_at
  BEFORE UPDATE ON next_best_action_records
  FOR EACH ROW EXECUTE FUNCTION update_research_updated_at();
