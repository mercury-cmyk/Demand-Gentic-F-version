
-- Add new fields for campaign goals and timeline
ALTER TABLE campaigns 
ADD COLUMN IF NOT EXISTS target_qualified_leads INTEGER,
ADD COLUMN IF NOT EXISTS start_date DATE,
ADD COLUMN IF NOT EXISTS end_date DATE,
ADD COLUMN IF NOT EXISTS cost_per_lead DECIMAL(10, 2);

-- Create index for date-based queries
CREATE INDEX IF NOT EXISTS campaigns_start_date_idx ON campaigns(start_date);
CREATE INDEX IF NOT EXISTS campaigns_end_date_idx ON campaigns(end_date);
