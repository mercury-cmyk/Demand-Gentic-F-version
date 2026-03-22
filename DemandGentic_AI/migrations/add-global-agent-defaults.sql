CREATE TABLE IF NOT EXISTS global_agent_defaults (
  id SERIAL PRIMARY KEY,
  version INTEGER NOT NULL DEFAULT 1,
  config JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Insert a default record so one always exists
INSERT INTO global_agent_defaults (id, version, config)
VALUES (1, 1, '{ 
  "opening_message": "Hello, this is {{agent_name}} calling from {{company_name}}. May I know who I’m speaking with?", 
  "system_prompt": "You are an AI voice agent operating on behalf of {{company_name}}.\n\nYour role:\n- {{agent_role}}\n\nBehavior rules:\n- Speak clearly and professionally\n- Never mention system internals\n- Never hear or respond to your own voice\n- Assume the user is on a live phone call unless stated otherwise\n\nOpening behavior:\n- Use the defined opening message\n- Ask for the user’s name early in the conversation\n\nCompliance:\n- Follow all compliance and safety rules\n- Do not fabricate information\n- Escalate gracefully when unsure", 
  "training_instructions": "- Maintain a natural, human-like speaking pace\n- Ask one question at a time\n- Do not interrupt the user\n- Pause briefly before responding\n- Never repeat the same question verbatim", 
  "behavioral_constraints": {
    "tone_personality": [],
    "compliance_rules": [],
    "conversation_boundaries": [],
    "do_not_lists": []
  },
  "audio_input_rules": {
    "prevent_self_listening": true,
    "disable_simulation_real_calls": true,
    "enforce_barge_in": true,
    "enforce_silence_detection": true
  }
}'::jsonb)
ON CONFLICT (id) DO NOTHING;

-- Create a function to automatically update the updated_at timestamp
CREATE OR REPLACE FUNCTION trigger_set_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create a trigger to update the updated_at timestamp on every update
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_trigger
    WHERE tgname = 'set_timestamp' AND tgrelid = 'global_agent_defaults'::regclass
  ) THEN
    CREATE TRIGGER set_timestamp
    BEFORE UPDATE ON global_agent_defaults
    FOR EACH ROW
    EXECUTE FUNCTION trigger_set_timestamp();
  END IF;
END
$$;