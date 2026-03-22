-- Add dialed_number column to leads table
ALTER TABLE leads ADD COLUMN IF NOT EXISTS dialed_number TEXT;

-- Add index for better query performance
CREATE INDEX IF NOT EXISTS leads_dialed_number_idx ON leads(dialed_number);