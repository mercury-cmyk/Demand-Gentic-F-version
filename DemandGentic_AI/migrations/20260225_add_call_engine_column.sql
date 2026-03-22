-- Add call engine toggle to agent_defaults
-- Allows switching between 'texml' (Telnyx TeXML) and 'livekit' (LiveKit SIP) for AI calls
ALTER TABLE agent_defaults ADD COLUMN IF NOT EXISTS default_call_engine text NOT NULL DEFAULT 'texml';