-- Migration: Add assigned phone number to virtual agents
-- This allows each AI agent to have a dedicated phone number for outbound calls

-- Add the column to virtual_agents table
ALTER TABLE virtual_agents 
ADD COLUMN IF NOT EXISTS assigned_phone_number_id VARCHAR 
REFERENCES telnyx_numbers(id) ON DELETE SET NULL;

-- Add index for quick lookups
CREATE INDEX IF NOT EXISTS idx_virtual_agents_assigned_phone 
ON virtual_agents(assigned_phone_number_id) 
WHERE assigned_phone_number_id IS NOT NULL;

-- Add comment for documentation
COMMENT ON COLUMN virtual_agents.assigned_phone_number_id IS 
  'Optional dedicated phone number for this agent. When set, all outbound calls from this agent use this number.';
