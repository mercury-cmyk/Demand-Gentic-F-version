-- Migration: Add telephony fields to users table for human agent calling
-- This enables click-to-call functionality where the system calls the agent's phone first

ALTER TABLE users ADD COLUMN IF NOT EXISTS callback_phone TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS sip_extension TEXT;

-- Add comments for documentation
COMMENT ON COLUMN users.callback_phone IS 'Phone number to call agent for click-to-call (E.164 format)';
COMMENT ON COLUMN users.sip_extension IS 'Optional SIP extension for WebRTC softphone';
