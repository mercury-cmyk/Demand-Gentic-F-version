-- Add organization context field to work_orders table
-- This stores the compiled organization intelligence context at the time of submission
-- allowing the AI to process orders with full awareness of client's business context

ALTER TABLE work_orders 
ADD COLUMN IF NOT EXISTS organization_context TEXT;

-- Add index for searching orders by context availability
CREATE INDEX IF NOT EXISTS work_orders_has_context_idx 
ON work_orders ((organization_context IS NOT NULL));

-- Comment for documentation
COMMENT ON COLUMN work_orders.organization_context IS 'Compiled organization intelligence context at time of order submission for AI processing';
