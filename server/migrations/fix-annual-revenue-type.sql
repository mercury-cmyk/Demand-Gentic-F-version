
-- Fix annual_revenue column type conversion
-- This migration handles the text -> numeric(20,2) conversion safely

-- Step 1: Add a temporary numeric column
ALTER TABLE accounts ADD COLUMN IF NOT EXISTS annual_revenue_temp numeric(20, 2);

-- Step 2: Convert existing text values to numeric, handling invalid data
UPDATE accounts
SET annual_revenue_temp = CASE
  -- Handle NULL or empty strings (annual_revenue is still text here)
  WHEN annual_revenue IS NULL OR TRIM(CAST(annual_revenue AS text)) = '' THEN NULL
  -- Handle scientific notation (reject it)
  WHEN CAST(annual_revenue AS text) ~ '[eE]' THEN NULL
  -- Clean currency symbols, commas, and convert to numeric
  ELSE CAST(REGEXP_REPLACE(CAST(annual_revenue AS text), '[^0-9.-]', '', 'g') AS numeric(20, 2))
END;

-- Step 3: Drop the old text column
ALTER TABLE accounts DROP COLUMN annual_revenue;

-- Step 4: Rename the temp column to annual_revenue
ALTER TABLE accounts RENAME COLUMN annual_revenue_temp TO annual_revenue;

-- Step 5: Add comment for documentation
COMMENT ON COLUMN accounts.annual_revenue IS 'Annual revenue in numeric format (20,2) - no scientific notation allowed';
