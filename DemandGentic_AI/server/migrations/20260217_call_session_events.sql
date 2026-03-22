CREATE TABLE IF NOT EXISTS call_session_events (
  id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  call_session_id varchar NOT NULL REFERENCES call_sessions(id) ON DELETE CASCADE,
  event_key text NOT NULL,
  event_ts timestamp NOT NULL DEFAULT now(),
  value_num numeric(12,3),
  value_text text,
  metadata jsonb,
  created_at timestamp NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS call_session_events_call_session_idx
  ON call_session_events (call_session_id);

CREATE INDEX IF NOT EXISTS call_session_events_event_key_idx
  ON call_session_events (event_key);

CREATE INDEX IF NOT EXISTS call_session_events_event_ts_idx
  ON call_session_events (event_ts);