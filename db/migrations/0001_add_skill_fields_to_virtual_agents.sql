-- Migration: Add skill-based agent fields to virtual_agents table
-- Purpose: Support skill-based agent creation framework
-- Date: 2026-01-05

-- Add skill-related columns to virtual_agents table
ALTER TABLE virtual_agents
ADD COLUMN IF NOT EXISTS skill_id TEXT,
ADD COLUMN IF NOT EXISTS skill_inputs JSONB,
ADD COLUMN IF NOT EXISTS compiled_prompt_metadata JSONB;

-- Add index for skill_id to optimize queries
CREATE INDEX IF NOT EXISTS virtual_agents_skill_id_idx ON virtual_agents(skill_id);

-- Add comments for documentation
COMMENT ON COLUMN virtual_agents.skill_id IS 'ID of the pretrained skill used to create this agent (e.g., whitepaper_distribution, appointment_setting)';
COMMENT ON COLUMN virtual_agents.skill_inputs IS 'User-provided input values for the selected skill (e.g., asset files, event details)';
COMMENT ON COLUMN virtual_agents.compiled_prompt_metadata IS 'Metadata about the compiled prompt including sources, compilation timestamp, and skill metadata';
