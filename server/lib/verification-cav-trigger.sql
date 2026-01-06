-- CAV Auto-Link Trigger for CAT62542
-- Automatically attaches CAV ID and CAV User ID by matching on normalized tuple:
-- (first_name_norm, last_name_norm, company_key, contact_country_key)

CREATE OR REPLACE FUNCTION relink_cav_by_tuple()
RETURNS trigger AS $$
DECLARE
  v_cav_id text;
  v_cav_user_id text;
BEGIN
  -- Compute normalized keys if missing
  IF NEW.first_name IS NOT NULL AND (NEW.first_name_norm IS NULL OR NEW.first_name_norm = '') THEN
    NEW.first_name_norm := lower(regexp_replace(NEW.first_name, '[^a-z0-9]', '', 'g'));
  END IF;
  
  IF NEW.last_name IS NOT NULL AND (NEW.last_name_norm IS NULL OR NEW.last_name_norm = '') THEN
    NEW.last_name_norm := lower(regexp_replace(NEW.last_name, '[^a-z0-9]', '', 'g'));
  END IF;
  
  IF NEW.company_key IS NULL OR NEW.company_key = '' THEN
    -- Try to get company_key from account name if account_id is set
    IF NEW.account_id IS NOT NULL THEN
      SELECT lower(trim(regexp_replace(name, '\s+', ' ', 'g'))) 
      INTO NEW.company_key
      FROM accounts 
      WHERE id = NEW.account_id;
    END IF;
  END IF;
  
  IF NEW.contact_country IS NOT NULL AND (NEW.contact_country_key IS NULL OR NEW.contact_country_key = '') THEN
    NEW.contact_country_key := lower(trim(NEW.contact_country));
    
    -- Apply common country mappings
    CASE NEW.contact_country_key
      WHEN 'usa' THEN NEW.contact_country_key := 'united states';
      WHEN 'us' THEN NEW.contact_country_key := 'united states';
      WHEN 'uk' THEN NEW.contact_country_key := 'united kingdom';
      ELSE NULL;
    END CASE;
  END IF;
  
  -- Only attempt CAV link if we don't already have CAV IDs and we have the required keys
  IF (NEW.cav_id IS NULL OR NEW.cav_user_id IS NULL) AND
     NEW.first_name_norm IS NOT NULL AND
     NEW.last_name_norm IS NOT NULL AND
     NEW.company_key IS NOT NULL AND
     NEW.contact_country_key IS NOT NULL THEN
    
    -- Look for matching Client_Provided contact with CAV IDs in same campaign
    SELECT c2.cav_id, c2.cav_user_id
    INTO v_cav_id, v_cav_user_id
    FROM verification_contacts c2
    WHERE c2.campaign_id = NEW.campaign_id
      AND c2.source_type = 'Client_Provided'
      AND c2.cav_id IS NOT NULL 
      AND c2.cav_user_id IS NOT NULL
      AND c2.first_name_norm = NEW.first_name_norm
      AND c2.last_name_norm = NEW.last_name_norm
      AND c2.company_key = NEW.company_key
      AND c2.contact_country_key = NEW.contact_country_key
    LIMIT 1;
    
    IF v_cav_id IS NOT NULL THEN
      NEW.cav_id := v_cav_id;
      NEW.cav_user_id := v_cav_user_id;
    END IF;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Drop and recreate trigger
DROP TRIGGER IF EXISTS trg_relink_cav_by_tuple ON verification_contacts;

CREATE TRIGGER trg_relink_cav_by_tuple
  BEFORE INSERT OR UPDATE ON verification_contacts
  FOR EACH ROW
  EXECUTE FUNCTION relink_cav_by_tuple();
