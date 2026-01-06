-- Migration: Add normalized suppression fields to contacts and suppression_list tables
-- This migration adds columns needed for strict suppression matching

-- Step 1: Add columns to contacts table if they don't exist
ALTER TABLE contacts
  ADD COLUMN IF NOT EXISTS full_name_norm text,
  ADD COLUMN IF NOT EXISTS company_norm text,
  ADD COLUMN IF NOT EXISTS name_company_hash text,
  ADD COLUMN IF NOT EXISTS cav_id text,
  ADD COLUMN IF NOT EXISTS cav_user_id text;

-- Step 2: Ensure suppression_list table has all required columns
ALTER TABLE suppression_list
  ADD COLUMN IF NOT EXISTS email_norm text,
  ADD COLUMN IF NOT EXISTS full_name_norm text,
  ADD COLUMN IF NOT EXISTS company_norm text,
  ADD COLUMN IF NOT EXISTS name_company_hash text,
  ADD COLUMN IF NOT EXISTS cav_id text,
  ADD COLUMN IF NOT EXISTS cav_user_id text;

-- Step 3: Create indexes for performance on contacts table
CREATE INDEX IF NOT EXISTS contacts_cav_id_idx ON contacts (cav_id);
CREATE INDEX IF NOT EXISTS contacts_cav_user_id_idx ON contacts (cav_user_id);
CREATE INDEX IF NOT EXISTS contacts_name_company_hash_idx ON contacts (name_company_hash);

-- Step 4: Create indexes for performance on suppression_list table
CREATE INDEX IF NOT EXISTS suppression_list_email_norm_idx ON suppression_list (email_norm);
CREATE INDEX IF NOT EXISTS suppression_list_cav_id_idx ON suppression_list (cav_id);
CREATE INDEX IF NOT EXISTS suppression_list_cav_user_id_idx ON suppression_list (cav_user_id);
CREATE INDEX IF NOT EXISTS suppression_list_name_company_hash_idx ON suppression_list (name_company_hash);

-- Step 5: Backfill normalized data for contacts
UPDATE contacts c
SET
  full_name_norm = LOWER(TRIM(REGEXP_REPLACE(
    COALESCE(first_name, '') || ' ' || COALESCE(last_name, ''),
    '\s+', ' ', 'g'
  ))),
  company_norm = (
    SELECT LOWER(TRIM(REGEXP_REPLACE(COALESCE(a.name, ''), '\s+', ' ', 'g')))
    FROM accounts a
    WHERE a.id = c.account_id
  ),
  name_company_hash = (
    SELECT ENCODE(DIGEST(
      LOWER(TRIM(REGEXP_REPLACE(
        COALESCE(c.first_name, '') || ' ' || COALESCE(c.last_name, ''),
        '\s+', ' ', 'g'
      ))) || '|' ||
      LOWER(TRIM(REGEXP_REPLACE(COALESCE(a.name, ''), '\s+', ' ', 'g')))
    , 'sha256'), 'hex')
    FROM accounts a
    WHERE a.id = c.account_id
      AND TRIM(COALESCE(c.first_name, '')) != ''
      AND TRIM(COALESCE(c.last_name, '')) != ''
      AND TRIM(COALESCE(a.name, '')) != ''
  )
WHERE c.deleted_at IS NULL
  AND (c.full_name_norm IS NULL OR c.company_norm IS NULL);

-- Step 6: Backfill normalized data for suppression_list
UPDATE suppression_list
SET
  email_norm = LOWER(TRIM(email)),
  full_name_norm = LOWER(TRIM(REGEXP_REPLACE(COALESCE(full_name, ''), '\s+', ' ', 'g'))),
  company_norm = LOWER(TRIM(REGEXP_REPLACE(COALESCE(company_name, ''), '\s+', ' ', 'g'))),
  name_company_hash = CASE
    WHEN TRIM(COALESCE(full_name, '')) != '' AND TRIM(COALESCE(company_name, '')) != ''
    THEN ENCODE(DIGEST(
      LOWER(TRIM(REGEXP_REPLACE(COALESCE(full_name, ''), '\s+', ' ', 'g'))) || '|' ||
      LOWER(TRIM(REGEXP_REPLACE(COALESCE(company_name, ''), '\s+', ' ', 'g')))
    , 'sha256'), 'hex')
    ELSE NULL
  END
WHERE email_norm IS NULL OR full_name_norm IS NULL OR company_norm IS NULL;
