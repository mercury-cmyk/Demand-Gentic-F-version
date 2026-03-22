-- Migration: Add dialing_phone_e164 unified dialing field to contacts
-- This column stores the pre-computed best phone for dialing (direct > mobile > hq)
-- so the call queue always has a single, validated E.164 number to dial.
-- Computed at upload time in the CSV import worker and kept up-to-date on enrichment.

-- 1. Add the column (nullable – back-filled below for existing contacts)
ALTER TABLE contacts
  ADD COLUMN IF NOT EXISTS dialing_phone_e164 text;

-- 2. Back-fill existing contacts: prefer direct_phone_e164, fall back to mobile_phone_e164
UPDATE contacts
SET dialing_phone_e164 = COALESCE(
  CASE WHEN direct_phone_e164 IS NOT NULL
            AND direct_phone_e164 ~ '^\+[1-9]\d{7,14}$'
       THEN direct_phone_e164
  END,
  CASE WHEN mobile_phone_e164 IS NOT NULL
            AND mobile_phone_e164 ~ '^\+[1-9]\d{7,14}$'
       THEN mobile_phone_e164
  END
)
WHERE dialing_phone_e164 IS NULL
  AND (direct_phone_e164 IS NOT NULL OR mobile_phone_e164 IS NOT NULL);

-- 3. Index for fast queue lookups
CREATE INDEX IF NOT EXISTS contacts_dialing_phone_idx
  ON contacts (dialing_phone_e164)
  WHERE dialing_phone_e164 IS NOT NULL;