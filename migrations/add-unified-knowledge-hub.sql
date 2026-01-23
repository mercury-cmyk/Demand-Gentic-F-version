-- Unified Knowledge Hub Migration
-- Single source of truth for all AI agent knowledge.
-- All agents—voice, email, compliance, or otherwise—MUST consume
-- knowledge from this centralized hub only.

-- Create knowledge category enum
CREATE TYPE knowledge_category AS ENUM (
  'compliance',
  'gatekeeper_handling',
  'voicemail_detection',
  'call_dispositioning',
  'call_quality',
  'conversation_flow',
  'dos_and_donts',
  'objection_handling',
  'tone_and_pacing',
  'identity_verification',
  'call_control',
  'learning_rules'
);

-- Create unified_knowledge_hub table
-- Stores the current and historical knowledge versions
CREATE TABLE unified_knowledge_hub (
  id VARCHAR(255) PRIMARY KEY DEFAULT gen_random_uuid(),
  version INTEGER NOT NULL DEFAULT 1,
  
  -- Complete knowledge stored as structured JSON
  -- Array of KnowledgeSection objects
  sections JSONB NOT NULL,
  
  -- Change tracking
  change_description TEXT,
  updated_by VARCHAR(255) REFERENCES users(id) ON DELETE SET NULL,
  updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Create unique index on version for fast lookups
CREATE UNIQUE INDEX unified_knowledge_hub_version_idx ON unified_knowledge_hub(version);
CREATE INDEX unified_knowledge_hub_updated_at_idx ON unified_knowledge_hub(updated_at);

-- Create unified_knowledge_versions table for diff tracking
CREATE TABLE unified_knowledge_versions (
  id VARCHAR(255) PRIMARY KEY DEFAULT gen_random_uuid(),
  knowledge_id VARCHAR(255) NOT NULL REFERENCES unified_knowledge_hub(id) ON DELETE CASCADE,
  version INTEGER NOT NULL,
  
  -- Full section snapshots for diff comparison
  sections JSONB NOT NULL,
  previous_sections JSONB, -- Null for first version
  
  -- Metadata
  change_description TEXT,
  updated_by VARCHAR(255) REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX unified_knowledge_versions_knowledge_id_idx ON unified_knowledge_versions(knowledge_id);
CREATE INDEX unified_knowledge_versions_version_idx ON unified_knowledge_versions(version);

-- Create agent_simulations table for testing/preview
CREATE TABLE agent_simulations (
  id VARCHAR(255) PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- Context for simulation
  campaign_id VARCHAR(255) REFERENCES campaigns(id) ON DELETE SET NULL,
  account_id VARCHAR(255) REFERENCES accounts(id) ON DELETE SET NULL,
  contact_id VARCHAR(255) REFERENCES contacts(id) ON DELETE SET NULL,
  virtual_agent_id VARCHAR(255) REFERENCES virtual_agents(id) ON DELETE SET NULL,
  
  -- Simulation type and mode
  simulation_type TEXT NOT NULL, -- 'voice', 'email', 'text'
  simulation_mode TEXT NOT NULL, -- 'preview', 'test_call', 'dry_run'
  
  -- Input/Output
  input_scenario JSONB,
  generated_prompt TEXT,
  knowledge_version INTEGER,
  
  -- Results
  output_response TEXT,
  evaluation_score REAL,
  evaluation_notes TEXT,
  
  -- Metadata
  run_by VARCHAR(255) REFERENCES users(id) ON DELETE SET NULL,
  run_at TIMESTAMP NOT NULL DEFAULT NOW(),
  duration_ms INTEGER,
  
  -- Status
  status TEXT NOT NULL DEFAULT 'pending',
  error_message TEXT
);

CREATE INDEX agent_simulations_campaign_idx ON agent_simulations(campaign_id);
CREATE INDEX agent_simulations_agent_idx ON agent_simulations(virtual_agent_id);
CREATE INDEX agent_simulations_status_idx ON agent_simulations(status);
CREATE INDEX agent_simulations_run_at_idx ON agent_simulations(run_at);

-- Add comment explaining the architecture
COMMENT ON TABLE unified_knowledge_hub IS 'SINGLE SOURCE OF TRUTH for all AI agent knowledge. All agents must consume knowledge from this centralized hub only.';
COMMENT ON TABLE unified_knowledge_versions IS 'Version history for unified knowledge hub, enabling diff tracking and change visualization.';
COMMENT ON TABLE agent_simulations IS 'Records of agent simulations/previews for testing and evaluation.';
