
-- Add contact name and email to leads table for easier querying
ALTER TABLE leads ADD COLUMN IF NOT EXISTS contact_name TEXT;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS contact_email TEXT;

-- Backfill existing leads with contact data
UPDATE leads 
SET 
  contact_name = COALESCE(
    c.full_name,
    CASE 
      WHEN c.first_name IS NOT NULL AND c.last_name IS NOT NULL THEN c.first_name || ' ' || c.last_name
      WHEN c.first_name IS NOT NULL THEN c.first_name
      WHEN c.last_name IS NOT NULL THEN c.last_name
      ELSE c.email
    END
  ),
  contact_email = c.email
FROM contacts c
WHERE leads.contact_id = c.id
  AND (leads.contact_name IS NULL OR leads.contact_email IS NULL);
