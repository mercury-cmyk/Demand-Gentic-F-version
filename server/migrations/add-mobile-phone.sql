
-- Add mobile phone fields to contacts table
ALTER TABLE contacts 
ADD COLUMN IF NOT EXISTS mobile_phone TEXT,
ADD COLUMN IF NOT EXISTS mobile_phone_e164 TEXT;

-- Create index for mobile phone E164
CREATE INDEX IF NOT EXISTS contacts_mobile_phone_idx ON contacts(mobile_phone_e164);

-- Add country field to contacts for phone formatting (if not exists)
ALTER TABLE contacts 
ADD COLUMN IF NOT EXISTS country TEXT;

COMMENT ON COLUMN contacts.mobile_phone IS 'Contact mobile phone number in original format';
COMMENT ON COLUMN contacts.mobile_phone_e164 IS 'Contact mobile phone in E.164 format for click-to-call';
COMMENT ON COLUMN contacts.direct_phone IS 'Direct work phone number';
COMMENT ON COLUMN accounts.main_phone IS 'Main HQ phone number';
