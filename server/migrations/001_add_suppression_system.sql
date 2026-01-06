-- ========== COMPREHENSIVE SUPPRESSION SYSTEM MIGRATION ==========
-- This migration adds support for advanced contact suppression matching:
-- 1. Email matches (exact, case-insensitive)
-- 2. CAV ID matches
-- 3. CAV User ID matches
-- 4. Full Name + Company BOTH match (together)

-- Step 1: Add normalized columns to contacts table
ALTER TABLE contacts
  ADD COLUMN IF NOT EXISTS full_name_norm text,
  ADD COLUMN IF NOT EXISTS company_norm text,
  ADD COLUMN IF NOT EXISTS name_company_hash text,
  ADD COLUMN IF NOT EXISTS cav_id text,
  ADD COLUMN IF NOT EXISTS cav_user_id text;

-- Step 2: Create suppression_list table if it doesn't exist
CREATE TABLE IF NOT EXISTS suppression_list (
  id serial PRIMARY KEY,
  email text,
  email_norm text,
  full_name text,
  full_name_norm text,
  company_name text,
  company_norm text,
  name_company_hash text,
  cav_id text,
  cav_user_id text,
  reason text,
  source text,
  created_at timestamp NOT NULL DEFAULT NOW(),
  updated_at timestamp NOT NULL DEFAULT NOW()
);

-- Step 3: Backfill normalized data for contacts
-- Normalize email (lowercase, trim)
UPDATE contacts
SET email_norm = LOWER(TRIM(email))
WHERE email_norm IS NULL AND email IS NOT NULL AND email != '';

-- Normalize full name (lowercase, trim, collapse whitespace)
-- Combine first_name and last_name if full_name is not set
UPDATE contacts
SET full_name_norm = LOWER(TRIM(REGEXP_REPLACE(
  COALESCE(first_name, '') || ' ' || COALESCE(last_name, ''),
  '\s+', ' ', 'g'
)))
WHERE full_name_norm IS NULL 
  AND (first_name IS NOT NULL OR last_name IS NOT NULL)
  AND (first_name != '' OR last_name != '');

-- Normalize company name from account relationship
-- This will be populated when account is linked
UPDATE contacts c
SET company_norm = LOWER(TRIM(REGEXP_REPLACE(COALESCE(a.name, ''), '\s+', ' ', 'g')))
FROM accounts a
WHERE c.account_id = a.id
  AND c.company_norm IS NULL
  AND a.name IS NOT NULL
  AND a.name != '';

-- Step 4: Compute name_company_hash for contacts
-- Only compute when BOTH full_name_norm AND company_norm are present
UPDATE contacts
SET name_company_hash = ENCODE(DIGEST(
  full_name_norm || '|' || company_norm,
  'sha256'
), 'hex')
WHERE full_name_norm IS NOT NULL 
  AND full_name_norm != ''
  AND company_norm IS NOT NULL 
  AND company_norm != ''
  AND name_company_hash IS NULL;

-- Step 5: Create indexes on contacts table for suppression matching
CREATE INDEX IF NOT EXISTS contacts_cav_id_idx ON contacts (cav_id);
CREATE INDEX IF NOT EXISTS contacts_cav_user_id_idx ON contacts (cav_user_id);
CREATE INDEX IF NOT EXISTS contacts_name_company_hash_idx ON contacts (name_company_hash);

-- Step 6: Create indexes on suppression_list table for efficient matching
CREATE INDEX IF NOT EXISTS suppression_list_email_norm_idx ON suppression_list (email_norm);
CREATE INDEX IF NOT EXISTS suppression_list_cav_id_idx ON suppression_list (cav_id);
CREATE INDEX IF NOT EXISTS suppression_list_cav_user_id_idx ON suppression_list (cav_user_id);
CREATE INDEX IF NOT EXISTS suppression_list_name_company_hash_idx ON suppression_list (name_company_hash);

-- Step 7: Create function to maintain normalized values on insert/update
CREATE OR REPLACE FUNCTION update_contact_suppression_fields()
RETURNS TRIGGER AS $$
BEGIN
  -- Update email_norm
  IF NEW.email IS NOT NULL AND NEW.email != '' THEN
    NEW.email_norm = LOWER(TRIM(NEW.email));
  END IF;

  -- Update full_name_norm
  IF (NEW.first_name IS NOT NULL AND NEW.first_name != '') 
     OR (NEW.last_name IS NOT NULL AND NEW.last_name != '') THEN
    NEW.full_name_norm = LOWER(TRIM(REGEXP_REPLACE(
      COALESCE(NEW.first_name, '') || ' ' || COALESCE(NEW.last_name, ''),
      '\s+', ' ', 'g'
    )));
  END IF;

  -- Compute name_company_hash if both name and company are present
  IF NEW.full_name_norm IS NOT NULL AND NEW.full_name_norm != ''
     AND NEW.company_norm IS NOT NULL AND NEW.company_norm != '' THEN
    NEW.name_company_hash = ENCODE(DIGEST(
      NEW.full_name_norm || '|' || NEW.company_norm,
      'sha256'
    ), 'hex');
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Step 8: Create trigger to auto-update suppression fields on contacts
DROP TRIGGER IF EXISTS contact_suppression_fields_trigger ON contacts;
CREATE TRIGGER contact_suppression_fields_trigger
  BEFORE INSERT OR UPDATE ON contacts
  FOR EACH ROW
  EXECUTE FUNCTION update_contact_suppression_fields();

-- Step 9: Create function to maintain normalized values on suppression_list
CREATE OR REPLACE FUNCTION update_suppression_list_fields()
RETURNS TRIGGER AS $$
BEGIN
  -- Update email_norm
  IF NEW.email IS NOT NULL AND NEW.email != '' THEN
    NEW.email_norm = LOWER(TRIM(NEW.email));
  END IF;

  -- Update full_name_norm
  IF NEW.full_name IS NOT NULL AND NEW.full_name != '' THEN
    NEW.full_name_norm = LOWER(TRIM(REGEXP_REPLACE(NEW.full_name, '\s+', ' ', 'g')));
  END IF;

  -- Update company_norm
  IF NEW.company_name IS NOT NULL AND NEW.company_name != '' THEN
    NEW.company_norm = LOWER(TRIM(REGEXP_REPLACE(NEW.company_name, '\s+', ' ', 'g')));
  END IF;

  -- Compute name_company_hash if both name and company are present
  IF NEW.full_name_norm IS NOT NULL AND NEW.full_name_norm != ''
     AND NEW.company_norm IS NOT NULL AND NEW.company_norm != '' THEN
    NEW.name_company_hash = ENCODE(DIGEST(
      NEW.full_name_norm || '|' || NEW.company_norm,
      'sha256'
    ), 'hex');
  END IF;

  -- Update timestamp
  NEW.updated_at = NOW();

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Step 10: Create trigger to auto-update suppression_list fields
DROP TRIGGER IF EXISTS suppression_list_fields_trigger ON suppression_list;
CREATE TRIGGER suppression_list_fields_trigger
  BEFORE INSERT OR UPDATE ON suppression_list
  FOR EACH ROW
  EXECUTE FUNCTION update_suppression_list_fields();

-- Migration complete!
