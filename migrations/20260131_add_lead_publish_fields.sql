-- Add publish fields to leads table
-- These fields track when and by whom a lead was published (made available in project management)

ALTER TABLE leads ADD COLUMN IF NOT EXISTS published_at TIMESTAMP;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS published_by VARCHAR REFERENCES users(id);

-- Add index for published leads
CREATE INDEX IF NOT EXISTS leads_published_at_idx ON leads(published_at);

COMMENT ON COLUMN leads.published_at IS 'When lead was published (moved from approved to project management)';
COMMENT ON COLUMN leads.published_by IS 'User who published the lead';
