ALTER TABLE call_sessions
  ADD COLUMN IF NOT EXISTS telephony_provider_id varchar,
  ADD COLUMN IF NOT EXISTS telephony_provider_type varchar(32),
  ADD COLUMN IF NOT EXISTS telephony_provider_name text,
  ADD COLUMN IF NOT EXISTS provider_call_id text,
  ADD COLUMN IF NOT EXISTS telephony_routing_mode varchar(16),
  ADD COLUMN IF NOT EXISTS telephony_selection_reason text,
  ADD COLUMN IF NOT EXISTS telephony_cost_per_minute real,
  ADD COLUMN IF NOT EXISTS telephony_cost_per_call real,
  ADD COLUMN IF NOT EXISTS telephony_currency varchar(3);

CREATE INDEX IF NOT EXISTS call_sessions_telephony_provider_idx
  ON call_sessions (telephony_provider_id);

ALTER TABLE dialer_call_attempts
  ADD COLUMN IF NOT EXISTS telephony_provider_id varchar,
  ADD COLUMN IF NOT EXISTS telephony_provider_type varchar(32),
  ADD COLUMN IF NOT EXISTS telephony_provider_name text,
  ADD COLUMN IF NOT EXISTS provider_call_id text,
  ADD COLUMN IF NOT EXISTS telephony_routing_mode varchar(16),
  ADD COLUMN IF NOT EXISTS telephony_selection_reason text,
  ADD COLUMN IF NOT EXISTS telephony_cost_per_minute real,
  ADD COLUMN IF NOT EXISTS telephony_cost_per_call real,
  ADD COLUMN IF NOT EXISTS telephony_currency varchar(3);

CREATE INDEX IF NOT EXISTS dialer_call_attempts_telephony_provider_idx
  ON dialer_call_attempts (telephony_provider_id);
