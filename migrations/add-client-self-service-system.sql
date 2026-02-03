-- Client Self-Service Portal System Migration
-- This migration adds tables for:
-- 1. Client business profiles (legal name, address, unsubscribe URL)
-- 2. Client feature access control
-- 3. Client CRM (accounts, contacts)
-- 4. Client campaigns, email templates, call flows
-- 5. Bulk import tracking

-- ==================== ENUMS ====================

DO $$ BEGIN
  CREATE TYPE client_feature_flag AS ENUM (
    'accounts_contacts',
    'bulk_upload',
    'campaign_creation',
    'email_templates',
    'call_flows',
    'voice_selection',
    'calendar_booking',
    'analytics_dashboard',
    'reports_export',
    'api_access'
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- ==================== TABLES ====================

-- Client Business Profiles (Legal/Compliance Information)
CREATE TABLE IF NOT EXISTS client_business_profiles (
  id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
  client_account_id VARCHAR NOT NULL UNIQUE REFERENCES client_accounts(id) ON DELETE CASCADE,
  
  -- Legal Business Information (Required for compliance)
  legal_business_name TEXT NOT NULL,
  
  -- Physical Address (Required for CAN-SPAM, GDPR compliance)
  address_line1 TEXT NOT NULL,
  address_line2 TEXT,
  city TEXT NOT NULL,
  state TEXT NOT NULL,
  postal_code TEXT NOT NULL,
  country TEXT NOT NULL DEFAULT 'United States',
  
  -- Custom Unsubscribe URL
  custom_unsubscribe_url TEXT,
  
  -- Optional Business Details
  website TEXT,
  phone TEXT,
  support_email TEXT,
  
  -- Logo and Branding
  logo_url TEXT,
  brand_color VARCHAR(7),
  
  -- Audit
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_by VARCHAR REFERENCES client_users(id) ON DELETE SET NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS client_business_profiles_client_idx ON client_business_profiles(client_account_id);

-- Client Feature Access
CREATE TABLE IF NOT EXISTS client_feature_access (
  id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
  client_account_id VARCHAR NOT NULL REFERENCES client_accounts(id) ON DELETE CASCADE,
  
  feature client_feature_flag NOT NULL,
  is_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  config JSONB,
  
  enabled_by VARCHAR REFERENCES users(id) ON DELETE SET NULL,
  enabled_at TIMESTAMP NOT NULL DEFAULT NOW(),
  disabled_by VARCHAR REFERENCES users(id) ON DELETE SET NULL,
  disabled_at TIMESTAMP
);

CREATE UNIQUE INDEX IF NOT EXISTS client_feature_access_unique_idx ON client_feature_access(client_account_id, feature);
CREATE INDEX IF NOT EXISTS client_feature_access_client_idx ON client_feature_access(client_account_id);

-- Client CRM Accounts
CREATE TABLE IF NOT EXISTS client_crm_accounts (
  id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
  client_account_id VARCHAR NOT NULL REFERENCES client_accounts(id) ON DELETE CASCADE,
  
  name TEXT NOT NULL,
  domain TEXT,
  industry TEXT,
  employees TEXT,
  annual_revenue TEXT,
  
  city TEXT,
  state TEXT,
  country TEXT,
  
  phone TEXT,
  website TEXT,
  
  account_type TEXT,
  status TEXT DEFAULT 'active',
  
  custom_fields JSONB,
  source TEXT,
  source_id VARCHAR,
  
  created_by VARCHAR REFERENCES client_users(id) ON DELETE SET NULL,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS client_crm_accounts_client_idx ON client_crm_accounts(client_account_id);
CREATE INDEX IF NOT EXISTS client_crm_accounts_name_idx ON client_crm_accounts(name);
CREATE INDEX IF NOT EXISTS client_crm_accounts_domain_idx ON client_crm_accounts(domain);

-- Client CRM Contacts
CREATE TABLE IF NOT EXISTS client_crm_contacts (
  id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
  client_account_id VARCHAR NOT NULL REFERENCES client_accounts(id) ON DELETE CASCADE,
  crm_account_id VARCHAR REFERENCES client_crm_accounts(id) ON DELETE SET NULL,
  
  first_name TEXT,
  last_name TEXT,
  email TEXT,
  phone TEXT,
  mobile TEXT,
  
  title TEXT,
  department TEXT,
  linkedin_url TEXT,
  company TEXT,
  
  status TEXT DEFAULT 'active',
  
  email_opt_out BOOLEAN DEFAULT FALSE,
  phone_opt_out BOOLEAN DEFAULT FALSE,
  opt_out_date TIMESTAMP,
  
  custom_fields JSONB,
  source TEXT,
  source_id VARCHAR,
  
  created_by VARCHAR REFERENCES client_users(id) ON DELETE SET NULL,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS client_crm_contacts_client_idx ON client_crm_contacts(client_account_id);
CREATE INDEX IF NOT EXISTS client_crm_contacts_crm_account_idx ON client_crm_contacts(crm_account_id);
CREATE INDEX IF NOT EXISTS client_crm_contacts_email_idx ON client_crm_contacts(email);
CREATE INDEX IF NOT EXISTS client_crm_contacts_name_idx ON client_crm_contacts(first_name, last_name);

-- Client Email Templates
CREATE TABLE IF NOT EXISTS client_email_templates (
  id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
  client_account_id VARCHAR NOT NULL REFERENCES client_accounts(id) ON DELETE CASCADE,
  
  name TEXT NOT NULL,
  description TEXT,
  category TEXT,
  
  subject TEXT NOT NULL,
  body_html TEXT NOT NULL,
  body_text TEXT,
  
  merge_fields JSONB,
  
  is_active BOOLEAN DEFAULT TRUE,
  is_default BOOLEAN DEFAULT FALSE,
  times_used INTEGER DEFAULT 0,
  
  created_by VARCHAR REFERENCES client_users(id) ON DELETE SET NULL,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS client_email_templates_client_idx ON client_email_templates(client_account_id);
CREATE INDEX IF NOT EXISTS client_email_templates_category_idx ON client_email_templates(category);
CREATE INDEX IF NOT EXISTS client_email_templates_active_idx ON client_email_templates(is_active);

-- Client Call Flows
CREATE TABLE IF NOT EXISTS client_call_flows (
  id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
  client_account_id VARCHAR NOT NULL REFERENCES client_accounts(id) ON DELETE CASCADE,
  
  name TEXT NOT NULL,
  description TEXT,
  
  greeting TEXT,
  qualification_questions JSONB,
  objection_handling JSONB,
  closing_script TEXT,
  appointment_script TEXT,
  
  voice_id TEXT,
  voice_name TEXT,
  speaking_rate NUMERIC(3,2) DEFAULT 1.0,
  
  is_active BOOLEAN DEFAULT TRUE,
  is_default BOOLEAN DEFAULT FALSE,
  
  created_by VARCHAR REFERENCES client_users(id) ON DELETE SET NULL,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS client_call_flows_client_idx ON client_call_flows(client_account_id);
CREATE INDEX IF NOT EXISTS client_call_flows_active_idx ON client_call_flows(is_active);

-- Client Campaigns
CREATE TABLE IF NOT EXISTS client_campaigns (
  id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
  client_account_id VARCHAR NOT NULL REFERENCES client_accounts(id) ON DELETE CASCADE,
  
  name TEXT NOT NULL,
  description TEXT,
  campaign_type TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft',
  
  objectives TEXT,
  key_talking_points JSONB,
  target_audience TEXT,
  
  call_flow_id VARCHAR REFERENCES client_call_flows(id) ON DELETE SET NULL,
  voice_id TEXT,
  voice_name TEXT,
  
  default_email_template_id VARCHAR REFERENCES client_email_templates(id) ON DELETE SET NULL,
  sender_name TEXT,
  sender_email TEXT,
  
  booking_enabled BOOLEAN DEFAULT FALSE,
  booking_url TEXT,
  calendar_integration TEXT,
  
  start_date DATE,
  end_date DATE,
  
  total_contacts INTEGER DEFAULT 0,
  contacts_reached INTEGER DEFAULT 0,
  appointments_booked INTEGER DEFAULT 0,
  
  created_by VARCHAR REFERENCES client_users(id) ON DELETE SET NULL,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS client_campaigns_client_idx ON client_campaigns(client_account_id);
CREATE INDEX IF NOT EXISTS client_campaigns_status_idx ON client_campaigns(status);
CREATE INDEX IF NOT EXISTS client_campaigns_type_idx ON client_campaigns(campaign_type);

-- Client Campaign Contacts
CREATE TABLE IF NOT EXISTS client_campaign_contacts (
  id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id VARCHAR NOT NULL REFERENCES client_campaigns(id) ON DELETE CASCADE,
  contact_id VARCHAR NOT NULL REFERENCES client_crm_contacts(id) ON DELETE CASCADE,
  
  status TEXT DEFAULT 'pending',
  
  last_contacted_at TIMESTAMP,
  response_at TIMESTAMP,
  conversion_at TIMESTAMP,
  
  notes TEXT,
  
  added_at TIMESTAMP NOT NULL DEFAULT NOW(),
  added_by VARCHAR REFERENCES client_users(id) ON DELETE SET NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS client_campaign_contacts_unique_idx ON client_campaign_contacts(campaign_id, contact_id);
CREATE INDEX IF NOT EXISTS client_campaign_contacts_campaign_idx ON client_campaign_contacts(campaign_id);
CREATE INDEX IF NOT EXISTS client_campaign_contacts_contact_idx ON client_campaign_contacts(contact_id);
CREATE INDEX IF NOT EXISTS client_campaign_contacts_status_idx ON client_campaign_contacts(status);

-- Client Bulk Imports
CREATE TABLE IF NOT EXISTS client_bulk_imports (
  id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
  client_account_id VARCHAR NOT NULL REFERENCES client_accounts(id) ON DELETE CASCADE,
  
  import_type TEXT NOT NULL,
  file_name TEXT,
  file_url TEXT,
  
  status TEXT NOT NULL DEFAULT 'pending',
  
  total_rows INTEGER DEFAULT 0,
  processed_rows INTEGER DEFAULT 0,
  success_count INTEGER DEFAULT 0,
  error_count INTEGER DEFAULT 0,
  duplicate_count INTEGER DEFAULT 0,
  
  column_mapping JSONB,
  errors JSONB,
  
  campaign_id VARCHAR REFERENCES client_campaigns(id) ON DELETE SET NULL,
  
  uploaded_by VARCHAR REFERENCES client_users(id) ON DELETE SET NULL,
  started_at TIMESTAMP,
  completed_at TIMESTAMP,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS client_bulk_imports_client_idx ON client_bulk_imports(client_account_id);
CREATE INDEX IF NOT EXISTS client_bulk_imports_status_idx ON client_bulk_imports(status);

-- ==================== INITIALIZE DEFAULT FEATURES ====================
-- Grant all features to existing clients by default

INSERT INTO client_feature_access (client_account_id, feature, is_enabled, enabled_at)
SELECT ca.id, f.feature::client_feature_flag, true, NOW()
FROM client_accounts ca
CROSS JOIN (
  VALUES 
    ('accounts_contacts'),
    ('bulk_upload'),
    ('campaign_creation'),
    ('email_templates'),
    ('call_flows'),
    ('voice_selection'),
    ('calendar_booking'),
    ('analytics_dashboard'),
    ('reports_export')
) AS f(feature)
ON CONFLICT (client_account_id, feature) DO NOTHING;

-- ==================== COMMENTS ====================

COMMENT ON TABLE client_business_profiles IS 'Stores legal business information for compliance (email footers, unsubscribe links)';
COMMENT ON TABLE client_feature_access IS 'Controls which features are enabled per client (admin-managed)';
COMMENT ON TABLE client_crm_accounts IS 'Client-managed CRM accounts (their customers/prospects)';
COMMENT ON TABLE client_crm_contacts IS 'Client-managed CRM contacts';
COMMENT ON TABLE client_campaigns IS 'Client-created campaigns for outreach';
COMMENT ON TABLE client_email_templates IS 'Client-created email templates';
COMMENT ON TABLE client_call_flows IS 'Client-defined AI call scripts/flows';
COMMENT ON TABLE client_bulk_imports IS 'Tracks bulk upload operations for contacts/accounts';
