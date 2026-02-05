-- Migration: Add Telnyx Phone Number Assignment to Campaigns
-- Date: 2026-02-06
-- Description: Adds callerPhoneNumberId and callerPhoneNumber fields to campaigns table
--              for assigning specific Telnyx phone numbers per campaign

-- Add caller phone number fields to campaigns table
ALTER TABLE campaigns 
ADD COLUMN IF NOT EXISTS caller_phone_number_id VARCHAR,
ADD COLUMN IF NOT EXISTS caller_phone_number TEXT;

-- Add comment for documentation
COMMENT ON COLUMN campaigns.caller_phone_number_id IS 'References telnyx_numbers.id - The assigned phone number from the number pool for this campaign';
COMMENT ON COLUMN campaigns.caller_phone_number IS 'Denormalized E.164 phone number for quick access (e.g., +12025551234)';

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS campaigns_caller_phone_number_id_idx ON campaigns(caller_phone_number_id);
