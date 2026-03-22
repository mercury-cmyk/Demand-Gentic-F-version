-- Add first_message column to virtual_agents table
ALTER TABLE virtual_agents ADD COLUMN IF NOT EXISTS first_message TEXT;

-- Add comment for clarity
COMMENT ON COLUMN virtual_agents.first_message IS 'Optional greeting message that the agent will say when the call begins';