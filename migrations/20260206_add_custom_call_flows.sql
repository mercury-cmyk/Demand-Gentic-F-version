-- Persist custom call flows and campaign-type mappings
CREATE TABLE IF NOT EXISTS custom_call_flows (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  objective TEXT NOT NULL,
  success_criteria TEXT NOT NULL,
  max_total_turns INTEGER NOT NULL DEFAULT 20,
  steps JSONB NOT NULL DEFAULT '[]'::jsonb,
  version INTEGER NOT NULL DEFAULT 1,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_by TEXT REFERENCES users(id) ON DELETE SET NULL,
  updated_by TEXT REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS custom_call_flows_name_idx ON custom_call_flows (name);
CREATE INDEX IF NOT EXISTS custom_call_flows_active_idx ON custom_call_flows (is_active);

CREATE TABLE IF NOT EXISTS custom_call_flow_mappings (
  campaign_type TEXT PRIMARY KEY,
  call_flow_id TEXT NOT NULL,
  updated_by TEXT REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS custom_call_flow_mappings_flow_idx ON custom_call_flow_mappings (call_flow_id);
