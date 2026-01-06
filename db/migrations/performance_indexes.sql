-- Production Performance Indexes
-- Run this file using: psql $DATABASE_URL -f db/migrations/performance_indexes.sql
-- Or execute via execute_sql_tool

-- ============================================================
-- Agent Queue Optimizations
-- ============================================================

-- Agent queue lookups/assignments (manual dial)
CREATE INDEX IF NOT EXISTS idx_agent_queue_campaign_state
  ON agent_queue (campaign_id, queue_state, agent_id);

-- Campaign queue (power dial)
CREATE INDEX IF NOT EXISTS idx_campaign_queue_campaign_status
  ON campaign_queue (campaign_id, status);

-- ============================================================
-- Contacts Performance
-- ============================================================

-- Contacts filtering in agent console
CREATE INDEX IF NOT EXISTS idx_contacts_campaign_status
  ON contacts (campaign_id, status);

-- Suppression matching (case-insensitive email)
CREATE INDEX IF NOT EXISTS idx_contacts_email_ci
  ON contacts (LOWER(email));

-- Name + company hash for deduplication
CREATE INDEX IF NOT EXISTS idx_contacts_name_company_hash
  ON contacts (name_company_hash);

-- Full-text search for job title
CREATE INDEX IF NOT EXISTS idx_contacts_title_tsv
  ON contacts USING GIN (to_tsvector('simple', job_title));

-- ============================================================
-- Verification Contacts Optimizations
-- ============================================================

-- Verification caps per company
CREATE INDEX IF NOT EXISTS idx_vc_company_campaign_status
  ON verification_contacts (account_id, campaign_id, eligibility_status);

-- Pending email validation queue
CREATE INDEX IF NOT EXISTS idx_vc_pending_validation
  ON verification_contacts (campaign_id, eligibility_status, email)
  WHERE eligibility_status = 'Pending_Email_Validation' AND deleted = false;

-- Priority score ordering for cap enforcement
CREATE INDEX IF NOT EXISTS idx_vc_priority_score
  ON verification_contacts (campaign_id, account_id, priority_score DESC NULLS LAST)
  WHERE eligibility_status = 'Eligible' AND deleted = false;

-- Reserved slot tracking
CREATE INDEX IF NOT EXISTS idx_vc_reserved_slots
  ON verification_contacts (campaign_id, account_id, reserved_slot)
  WHERE reserved_slot = true AND deleted = false;

-- ============================================================
-- Accounts Optimizations
-- ============================================================

-- Enable pg_trgm extension for fuzzy matching
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- Fuzzy company name matching (e.g., "Ltd", "Inc")
CREATE INDEX IF NOT EXISTS idx_accounts_name_trgm
  ON accounts USING GIN (company_name gin_trgm_ops);

-- ============================================================
-- Suppressions Optimizations
-- ============================================================

-- Email suppression lookups
CREATE INDEX IF NOT EXISTS idx_suppressions_email_ci
  ON suppressions (LOWER(email))
  WHERE email IS NOT NULL;

-- Phone suppression lookups
CREATE INDEX IF NOT EXISTS idx_suppressions_phone
  ON suppressions (phone)
  WHERE phone IS NOT NULL;

-- ============================================================
-- Email Validation Optimizations
-- ============================================================

-- Domain cache lookups (for email validation)
CREATE INDEX IF NOT EXISTS idx_email_domain_cache_domain
  ON email_validation_domain_cache (domain, expires_at);

-- Email validation history per contact
CREATE INDEX IF NOT EXISTS idx_email_validation_contact
  ON email_validation (contact_id, validated_at DESC);

-- ============================================================
-- Campaign Analytics
-- ============================================================

-- Lead analytics by campaign and status
CREATE INDEX IF NOT EXISTS idx_leads_campaign_status
  ON leads (campaign_id, status, created_at DESC);

-- Call recordings by campaign
CREATE INDEX IF NOT EXISTS idx_call_recordings_campaign
  ON call_recordings (campaign_id, created_at DESC);

-- ============================================================
-- Verification Account Cap Status
-- ============================================================

-- Cap status lookups
CREATE INDEX IF NOT EXISTS idx_vac_status_campaign_account
  ON verification_account_cap_status (campaign_id, account_id);

-- ============================================================
-- Analysis Complete
-- ============================================================

-- You can verify index usage with:
-- SELECT schemaname, tablename, indexname, idx_scan, idx_tup_read, idx_tup_fetch
-- FROM pg_stat_user_indexes
-- WHERE schemaname = 'public'
-- ORDER BY idx_scan DESC;
