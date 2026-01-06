-- Performance Optimization Indexes
-- Run this to speed up queries after large data uploads

-- ===== CONTACTS TABLE =====
-- Email lookups and searches
CREATE INDEX IF NOT EXISTS idx_contacts_email ON contacts(email);
CREATE INDEX IF NOT EXISTS idx_contacts_email_normalized ON contacts(email_normalized);

-- Company/Account relationship
CREATE INDEX IF NOT EXISTS idx_contacts_account_id ON contacts(account_id);

-- Name searches (first, last, full)
CREATE INDEX IF NOT EXISTS idx_contacts_first_name ON contacts(first_name);
CREATE INDEX IF NOT EXISTS idx_contacts_last_name ON contacts(last_name);

-- Phone lookups
CREATE INDEX IF NOT EXISTS idx_contacts_direct_phone ON contacts(direct_phone);
CREATE INDEX IF NOT EXISTS idx_contacts_mobile_phone ON contacts(mobile_phone);

-- Job title and seniority filtering
CREATE INDEX IF NOT EXISTS idx_contacts_job_title ON contacts(job_title);
CREATE INDEX IF NOT EXISTS idx_contacts_seniority_level ON contacts(seniority_level);

-- Location filtering
CREATE INDEX IF NOT EXISTS idx_contacts_city ON contacts(city);
CREATE INDEX IF NOT EXISTS idx_contacts_state ON contacts(state);
CREATE INDEX IF NOT EXISTS idx_contacts_country ON contacts(country);

-- ===== ACCOUNTS TABLE =====
-- Domain lookups (critical for CSV matching)
CREATE INDEX IF NOT EXISTS idx_accounts_domain ON accounts(domain);
CREATE INDEX IF NOT EXISTS idx_accounts_domain_normalized ON accounts(domain_normalized);

-- Company name searches (use pg_trgm for fuzzy matching)
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE INDEX IF NOT EXISTS idx_accounts_name_trgm ON accounts USING gin (name gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_accounts_name_normalized_trgm ON accounts USING gin (name_normalized gin_trgm_ops);

-- Industry filtering
CREATE INDEX IF NOT EXISTS idx_accounts_industry ON accounts(industry_standardized);

-- Location filtering
CREATE INDEX IF NOT EXISTS idx_accounts_hq_city ON accounts(hq_city);
CREATE INDEX IF NOT EXISTS idx_accounts_hq_state ON accounts(hq_state);
CREATE INDEX IF NOT EXISTS idx_accounts_hq_country ON accounts(hq_country);

-- Revenue and size filtering
CREATE INDEX IF NOT EXISTS idx_accounts_staff_count ON accounts(staff_count);
CREATE INDEX IF NOT EXISTS idx_accounts_revenue_range ON accounts(revenue_range);

-- ===== VERIFICATION_CONTACTS TABLE =====
-- Campaign filtering
CREATE INDEX IF NOT EXISTS idx_verification_contacts_campaign_id ON verification_contacts(campaign_id);

-- Email validation status
CREATE INDEX IF NOT EXISTS idx_verification_contacts_email_status ON verification_contacts(email_status);

-- Queue status filtering
CREATE INDEX IF NOT EXISTS idx_verification_contacts_queue_status ON verification_contacts(queue_status);

-- Verification status
CREATE INDEX IF NOT EXISTS idx_verification_contacts_verification_status ON verification_contacts(verification_status);

-- Eligibility filtering
CREATE INDEX IF NOT EXISTS idx_verification_contacts_eligibility_status ON verification_contacts(eligibility_status);

-- Email lookups
CREATE INDEX IF NOT EXISTS idx_verification_contacts_contact_email ON verification_contacts(contact_email);

-- Company relationship
CREATE INDEX IF NOT EXISTS idx_verification_contacts_dv_account_id ON verification_contacts(dv_account_id);

-- ===== CAMPAIGN-RELATED TABLES =====
-- Campaign queue lookups
CREATE INDEX IF NOT EXISTS idx_campaign_queue_campaign_id ON campaign_queue(campaign_id);
CREATE INDEX IF NOT EXISTS idx_campaign_queue_status ON campaign_queue(status);
CREATE INDEX IF NOT EXISTS idx_campaign_queue_contact_id ON campaign_queue(contact_id);

-- Agent queue
CREATE INDEX IF NOT EXISTS idx_agent_queue_agent_id ON agent_queue(agent_id);
CREATE INDEX IF NOT EXISTS idx_agent_queue_campaign_id ON agent_queue(campaign_id);
CREATE INDEX IF NOT EXISTS idx_agent_queue_status ON agent_queue(status);

-- Leads
CREATE INDEX IF NOT EXISTS idx_leads_campaign_id ON leads(campaign_id);
CREATE INDEX IF NOT EXISTS idx_leads_qa_status ON leads(qa_status);
CREATE INDEX IF NOT EXISTS idx_leads_contact_id ON leads(contact_id);

-- ===== SUPPRESSION TABLES =====
-- Global DNC lookups
CREATE INDEX IF NOT EXISTS idx_global_dnc_phone_e164 ON global_dnc(phone_e164);

-- Suppression emails
CREATE INDEX IF NOT EXISTS idx_suppression_emails_email ON suppression_emails(email);

-- Suppression phones
CREATE INDEX IF NOT EXISTS idx_suppression_phones_phone ON suppression_phones(phone);

-- Campaign suppression
CREATE INDEX IF NOT EXISTS idx_campaign_suppression_contacts_campaign_id ON campaign_suppression_contacts(campaign_id);
CREATE INDEX IF NOT EXISTS idx_campaign_suppression_contacts_email ON campaign_suppression_contacts(email);

-- ===== COMPOSITE INDEXES (for common query patterns) =====
-- Contacts by account and status
CREATE INDEX IF NOT EXISTS idx_contacts_account_status ON contacts(account_id, email) WHERE email IS NOT NULL;

-- Campaign queue by campaign and status
CREATE INDEX IF NOT EXISTS idx_campaign_queue_campaign_status ON campaign_queue(campaign_id, status);

-- Verification contacts by campaign and verification status
CREATE INDEX IF NOT EXISTS idx_verification_contacts_campaign_verification ON verification_contacts(campaign_id, verification_status);

-- ===== TIMESTAMP INDEXES (for created_at, updated_at queries) =====
CREATE INDEX IF NOT EXISTS idx_contacts_created_at ON contacts(created_at);
CREATE INDEX IF NOT EXISTS idx_accounts_created_at ON accounts(created_at);
CREATE INDEX IF NOT EXISTS idx_leads_created_at ON leads(created_at);
CREATE INDEX IF NOT EXISTS idx_verification_contacts_created_at ON verification_contacts(created_at);

-- Analyze tables to update statistics
ANALYZE contacts;
ANALYZE accounts;
ANALYZE verification_contacts;
ANALYZE campaign_queue;
ANALYZE leads;
