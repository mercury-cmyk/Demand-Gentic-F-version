// CRM Database Schema - referenced from blueprint:javascript_database
import { sql } from "drizzle-orm";
import {
  pgTable,
  text,
  varchar,
  timestamp,
  jsonb,
  integer,
  pgEnum,
  index,
  uniqueIndex,
  unique,
  serial,
  boolean,
  real,
  numeric,
  foreignKey,
  primaryKey,
  date,
  decimal,
  json // Import json type
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

// Enums
export const userRoleEnum = pgEnum('user_role', [
  'admin',
  'agent',
  'quality_analyst',
  'content_creator',
  'campaign_manager'
]);

export const campaignTypeEnum = pgEnum('campaign_type', ['email', 'call', 'combo']);
export const accountCapModeEnum = pgEnum('account_cap_mode', ['queue_size', 'connected_calls', 'positive_disp']);
export const queueStatusEnum = pgEnum('queue_status', ['queued', 'in_progress', 'done', 'removed']);
export const campaignStatusEnum = pgEnum('campaign_status', [
  'draft',
  'scheduled',
  'active',
  'paused',
  'completed',
  'cancelled'
]);

export const qaStatusEnum = pgEnum('qa_status', [
  'new',
  'under_review',
  'approved',
  'rejected',
  'returned',
  'published'
]);

export const leadDeliverySourceEnum = pgEnum('lead_delivery_source', [
  'auto_webhook',
  'manual'
]);

/**
 * Email Verification Status - Standardized 4-Status System
 * - valid: Verified deliverable emails (formerly: valid, safe_to_send, ok)
 * - acceptable: May deliver but has risk factors - catch-all, role accounts (formerly: accept_all, risky, send_with_caution)
 * - unknown: Cannot reliably determine (SMTP blocked, timeout, greylisting) (formerly: unknown)
 * - invalid: Hard failures - syntax errors, no MX, disabled, disposable, spam trap (formerly: invalid, disabled, disposable, spam_trap)
 */
export const emailVerificationStatusEnum = pgEnum('email_verification_status', [
  'valid',
  'acceptable',
  'unknown',
  'invalid'
]);

export const orderStatusEnum = pgEnum('order_status', [
  'draft',
  'submitted',
  'in_progress',
  'completed',
  'cancelled'
]);

export const callDispositionEnum = pgEnum('call_disposition', [
  'no-answer',
  'busy',
  'voicemail',
  'connected',
  'not_interested',
  'callback-requested',
  'qualified',
  'dnc-request',
  'wrong_number',
  'invalid_data'
]);

// Dual-Dialer Mode Enums
export const dialModeEnum = pgEnum('dial_mode', ['manual', 'hybrid', 'ai_agent', 'power']);

// Agent Type Enum - Unified tracking for AI and human agents in same campaigns
export const agentTypeEnum = pgEnum('agent_type', ['human', 'ai']);

// Specialized Demand Agent Types - for coordinated demand generation
export const demandAgentTypeEnum = pgEnum('demand_agent_type', [
  'demand_intel',   // Research/Intelligence Agent - account research, buying signals
  'demand_qual',    // Voice Qualification Agent - BANT qualification, objection handling
  'demand_engage'   // Email Engagement Agent - personalized sequences, optimization
]);

// Email Suppression Reason Enum
export const emailSuppressionReasonEnum = pgEnum('email_suppression_reason', [
  'hard_bounce',
  'unsubscribe',
  'spam_complaint',
  'manual'
]);

// Queue Target Agent Type - For routing queue items to specific agent types
export const queueTargetAgentTypeEnum = pgEnum('queue_target_agent_type', ['human', 'ai', 'any']);

// Dialer Run Type Enum - Execution modes for campaign dialing
export const dialerRunTypeEnum = pgEnum('dialer_run_type', ['manual_dial', 'power_dial']);

// Dialer Run Status Enum
export const dialerRunStatusEnum = pgEnum('dialer_run_status', [
  'pending',      // Run created but not started
  'active',       // Run is currently active
  'paused',       // Run temporarily paused
  'completed',    // Run completed successfully
  'cancelled'     // Run was cancelled
]);

// Canonical Disposition Code Enum - The ONLY allowed dispositions across platform
export const canonicalDispositionEnum = pgEnum('canonical_disposition', [
  'qualified_lead',   // Contact qualified, route to QA
  'not_interested',   // Contact not interested, suppress from campaign
  'do_not_call',      // DNC request, global suppression
  'voicemail',        // Left voicemail, schedule retry
  'no_answer',        // No answer, schedule retry
  'invalid_data'      // Wrong number, disconnected, etc.
]);

// Campaign Contact State - Audience state machine
export const campaignContactStateEnum = pgEnum('campaign_contact_state', [
  'eligible',       // Ready to be dialed
  'locked',         // Currently being processed
  'waiting_retry',  // Waiting for retry window
  'qualified',      // Converted to qualified lead
  'removed'         // Removed from campaign (DNC, not interested, invalid)
]);

// AI Voice Agent Enums
export const aiVoiceEnum = pgEnum('ai_voice', [
  'alloy', 'echo', 'fable', 'onyx', 'nova', 'shimmer'
]);

export const aiHandoffTriggerEnum = pgEnum('ai_handoff_trigger', [
  'decision_maker_reached',
  'explicit_request',
  'complex_objection',
  'pricing_discussion',
  'technical_question',
  'angry_prospect'
]);

export const amdResultEnum = pgEnum('amd_result', ['human', 'machine', 'unknown']);

export const voicemailActionEnum = pgEnum('voicemail_action', [
  'leave_voicemail',
  'schedule_callback',
  'drop_silent'
]);

export const voicemailMessageTypeEnum = pgEnum('voicemail_message_type', ['tts', 'audio_file']);

export const manualQueueStateEnum = pgEnum('manual_queue_state', [
  'queued',
  'locked',
  'in_progress',
  'completed',
  'removed',
  'released'
]);

export const entityTypeEnum = pgEnum('entity_type', ['account', 'contact']);

export const pipelineTypeEnum = pgEnum('pipeline_type', ['revenue', 'expansion', 'agency']);

export const pipelineCategoryEnum = pgEnum('pipeline_category', [
  'media_partnership',  // Media & Data Partnerships (CPL/CPC Model)
  'direct_sales'       // Direct Sales (Medium & Enterprise)
]);

export const partnershipTypeEnum = pgEnum('partnership_type', [
  'publisher',
  'data_provider',
  'syndication_network',
  'media_buyer'
]);

export const pricingModelEnum = pgEnum('pricing_model', [
  'cpl',               // Cost Per Lead
  'cpc',               // Cost Per Contact  
  'hybrid',            // Mixed model
  'flat_fee'
]);

export const deliveryMethodEnum = pgEnum('delivery_method', [
  'api',
  'csv',
  'realtime_push',
  'sftp',
  'email'
]);

export const contractTypeEnum = pgEnum('contract_type', [
  'retainer',
  'one_time',
  'subscription',
  'per_project'
]);

export const qualityTierEnum = pgEnum('quality_tier', [
  'verified',
  'unverified',
  'data_append',
  'premium'
]);

export const pipelineOpportunityStatusEnum = pgEnum('pipeline_opportunity_status', [
  'open',
  'won',
  'lost',
  'on_hold'
]);

// Intelligent Sales System Enums
export const dealActivityTypeEnum = pgEnum('deal_activity_type', [
  'email_received',
  'email_sent',
  'meeting_scheduled',
  'meeting_completed',
  'call_completed',
  'note_added',
  'document_shared',
  'proposal_sent',
  'contract_sent',
  'stage_changed',
  'score_updated',
  'lead_captured'
]);

export const dealInsightTypeEnum = pgEnum('deal_insight_type', [
  'sentiment',          // Email sentiment analysis
  'intent',             // Purchase intent detection
  'urgency',            // Deal urgency assessment
  'next_action',        // Recommended next action
  'stage_recommendation', // Stage advancement suggestion
  'risk_flag'           // Risk or blocker identification
]);

export const emailDirectionEnum = pgEnum('email_direction', ['inbound', 'outbound']);

export const messageStatusEnum = pgEnum('message_status', [
  'pending',
  'sent',
  'delivered',
  'read',
  'replied',
  'failed'
]);

export const insightStatusEnum = pgEnum('insight_status', [
  'active',
  'acknowledged',
  'dismissed',
  'expired'
]);

export const leadFormTypeEnum = pgEnum('lead_form_type', [
  'ebook_download',
  'whitepaper_download',
  'infographic_download',
  'case_study_download',
  'proposal_request',
  'demo_request',
  'contact_form',
  'linkedin_engagement',
  'webinar_registration'
]);

export const stageTransitionReasonEnum = pgEnum('stage_transition_reason', [
  'manual',           // User manually moved stage
  'ai_suggested',     // AI suggested and user approved
  'ai_automatic',     // AI moved automatically (high confidence)
  'workflow_rule',    // Workflow automation rule triggered
  'system'            // System-initiated (e.g., won/lost)
]);

export const m365ActivityTypeEnum = pgEnum('m365_activity_type', ['email', 'meeting', 'call']);
export const m365ActivityDirectionEnum = pgEnum('m365_activity_direction', ['inbound', 'outbound']);

export const emailSequenceStatusEnum = pgEnum('email_sequence_status', ['active', 'paused', 'archived']);
export const sequenceStepStatusEnum = pgEnum('sequence_step_status', ['active', 'paused']);
export const enrollmentStatusEnum = pgEnum('enrollment_status', ['active', 'paused', 'completed', 'stopped']);
export const enrollmentStopReasonEnum = pgEnum('enrollment_stop_reason', ['replied', 'unsubscribed', 'manual', 'bounced', 'completed', 'error']);
export const sequenceEmailStatusEnum = pgEnum('sequence_email_status', [
  'scheduled',
  'sending',
  'sent',
  'delivered',
  'opened',
  'clicked',
  'replied',
  'bounced',
  'failed'
]);

export const leadVerificationStatusEnum = pgEnum('lead_verification_status', [
  'pending',           // Verification pending (waiting for agent action)
  'pending_ai',        // AI validation in progress
  'ai_verified',       // AI validation completed with positive result
  'verified_approved', // Human QA approved the verification
  'flagged_review',    // Flagged for manual QA review (low confidence or mismatch)
  'rejected'           // Verification rejected (invalid proof or mismatch)
]);

/**
 * Email Validation Provider Enum
 * Specifies which provider was used for email validation
 */
export const emailValidationProviderEnum = pgEnum('email_validation_provider', [
  'kickbox'     // Kickbox deep verification API (only provider)
]);

/**
 * Email Risk Level Enum  
 * Risk classification from Kickbox or internal analysis
 */
export const emailRiskLevelEnum = pgEnum('email_risk_level', [
  'low',        // Safe to send
  'medium',     // Some risk factors present
  'high',       // High risk - should avoid sending
  'unknown'     // Could not determine risk level
]);

export const leadVerificationTypeEnum = pgEnum('lead_verification_type', [
  'linkedin_verified', // LinkedIn screenshot verification
  'oncall_confirmed'   // On-call confirmation with new contact creation
]);

export const customFieldTypeEnum = pgEnum('custom_field_type', [
  'text',
  'number',
  'date',
  'boolean',
  'select',
  'multi_select',
  'url',
  'email'
]);

export const selectionTypeEnum = pgEnum('selection_type', ['explicit', 'filtered']);

export const visibilityScopeEnum = pgEnum('visibility_scope', ['private', 'team', 'global']);

export const sourceTypeEnum = pgEnum('source_type', ['segment', 'manual_upload', 'selection', 'filter']);

export const industryAIStatusEnum = pgEnum('industry_ai_status', [
  'pending',
  'accepted',
  'rejected',
  'partial'
]);

export const filterFieldCategoryEnum = pgEnum('filter_field_category', [
  'contact_fields',
  'account_fields',
  'account_relationship',
  'suppression_fields',
  'email_campaign_fields',
  'telemarketing_campaign_fields',
  'qa_fields',
  'list_segment_fields',
  'client_portal_fields'
]);

export const contentAssetTypeEnum = pgEnum('content_asset_type', [
  'email_template',
  'landing_page',
  'social_post',
  'ad_creative',
  'pdf_document',
  'video',
  'call_script',
  'sales_sequence',
  'blog_post'
]);

export const contentApprovalStatusEnum = pgEnum('content_approval_status', [
  'draft',
  'in_review',
  'approved',
  'rejected',
  'published'
]);

export const socialPlatformEnum = pgEnum('social_platform', [
  'linkedin',
  'twitter',
  'facebook',
  'instagram',
  'youtube'
]);

export const contentToneEnum = pgEnum('content_tone', [
  'formal',
  'conversational',
  'insightful',
  'persuasive',
  'technical'
]);

// Content distribution enums
export const eventTypeEnum = pgEnum('event_type', [
  'webinar',
  'forum',
  'executive_dinner',
  'roundtable',
  'conference'
]);

export const locationTypeEnum = pgEnum('location_type', [
  'virtual',
  'in_person',
  'hybrid'
]);

export const communityEnum = pgEnum('community', [
  'finance',
  'marketing',
  'it',
  'hr',
  'cx_ux',
  'data_ai',
  'ops'
]);

export const resourceTypeEnum = pgEnum('resource_type', [
  'ebook',
  'infographic',
  'white_paper',
  'guide',
  'case_study'
]);

export const contentStatusEnum = pgEnum('content_status', [
  'draft',
  'published',
  'archived'
]);

export const pushStatusEnum = pgEnum('push_status', [
  'pending',
  'in_progress',
  'completed',
  'failed'
]);

// Pivotal B2B Standard Template Enums
export const revenueRangeEnum = pgEnum('revenue_range', [
  '$0 - $100K',
  '$100K - $1M',
  '$1M - $5M',
  '$5M - $20M',
  '$20M - $50M',
  '$50M - $100M',
  '$100M - $500M',
  '$500M - $1B',
  '$1B+'
]);

export const staffCountRangeEnum = pgEnum('staff_count_range', [
  '2-10 employees',
  '11 - 50 employees',
  '51 - 200 employees',
  '201 - 500 employees',
  '501 - 1,000 employees',
  '1,001 - 5,000 employees',
  '5,001 - 10,000 employees',
  '10,001+ employees'
]);

// Disposition & Call Management Enums
export const dispositionSystemActionEnum = pgEnum('disposition_system_action', [
  'add_to_global_dnc',
  'remove_from_campaign_queue',
  'remove_from_all_queues_for_contact',
  'retry_after_delay',
  'retry_with_next_attempt_window',
  'converted_qualified',
  'no_action'
]);

export const callJobStatusEnum = pgEnum('call_job_status', [
  'queued',
  'scheduled',
  'in_progress',
  'completed',
  'cancelled',
  'removed'
]);

export const callSessionStatusEnum = pgEnum('call_session_status', [
  'connecting',
  'ringing',
  'connected',
  'no_answer',
  'busy',
  'failed',
  'voicemail_detected',
  'cancelled',
  'completed'
]);

export const agentStatusEnum = pgEnum('agent_status_type', [
  'offline',        // Agent not logged in
  'available',      // Ready to receive calls
  'busy',          // On active call
  'after_call_work', // Call ended, completing disposition/notes
  'break',         // On break
  'away'           // Temporarily away
]);

export const activityEventTypeEnum = pgEnum('activity_event_type', [
  'call_job_created',
  'call_job_scheduled',
  'call_job_removed',
  'call_started',
  'call_connected',
  'call_ended',
  'disposition_saved',
  'added_to_global_dnc',
  'campaign_opt_out_saved',
  'data_marked_invalid',
  'retry_scheduled',
  'account_cap_reached',
  'queue_rebuilt',
  'queue_set',
  'queue_cleared',
  'queue_cleared_all',
  'contact_called',
  'email_sent',
  'email_opened',
  'email_clicked',
  'form_submitted',
  'task_created',
  'task_completed',
  'note_added',
  'quick_linkedin_lookup',
  'lead_verification_linkedin',
  'lead_verification_oncall'
]);

export const activityEntityTypeEnum = pgEnum('activity_entity_type', [
  'contact',
  'account',
  'campaign',
  'call_job',
  'call_session',
  'lead',
  'user',
  'email_message'
]);

// Users table
export const users = pgTable("users", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  username: text("username").notNull().unique(),
  email: text("email"),
  password: text("password").notNull(),
  role: userRoleEnum("role").notNull().default('agent'), // Deprecated - use user_roles table instead
  firstName: text("first_name"),
  lastName: text("last_name"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (table) => ({
  emailIdx: index("users_email_idx").on(table.email),
  usernameIdx: index("users_username_idx").on(table.username),
}));

// User Roles junction table (many-to-many: users can have multiple roles)
export const userRoles = pgTable("user_roles", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: 'cascade' }),
  role: userRoleEnum("role").notNull(),
  assignedAt: timestamp("assigned_at").notNull().defaultNow(),
  assignedBy: varchar("assigned_by").references(() => users.id, { onDelete: 'set null' }),
}, (table) => ({
  userRoleIdx: uniqueIndex("user_roles_user_role_idx").on(table.userId, table.role), // Prevent duplicate role assignments
  userIdIdx: index("user_roles_user_id_idx").on(table.userId),
}));

// Custom Field Definitions table
export const customFieldDefinitions = pgTable("custom_field_definitions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  entityType: entityTypeEnum("entity_type").notNull(), // 'account' or 'contact'
  fieldKey: text("field_key").notNull(), // Unique key used in customFields JSONB
  displayLabel: text("display_label").notNull(), // Human-readable label
  fieldType: customFieldTypeEnum("field_type").notNull(), // text, number, date, etc.
  options: jsonb("options"), // For select/multi_select types: array of options
  required: boolean("required").notNull().default(false),
  defaultValue: text("default_value"),
  helpText: text("help_text"), // Tooltip/help text for users
  displayOrder: integer("display_order").notNull().default(0), // Order in forms
  active: boolean("active").notNull().default(true),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
  createdBy: varchar("created_by").references(() => users.id),
}, (table) => ({
  entityKeyIdx: uniqueIndex("custom_field_definitions_entity_key_idx").on(table.entityType, table.fieldKey),
  entityTypeIdx: index("custom_field_definitions_entity_type_idx").on(table.entityType),
}));

export type CustomFieldDefinition = typeof customFieldDefinitions.$inferSelect;

// Accounts table
export const accounts = pgTable("accounts", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull(),
  nameNormalized: text("name_normalized"),
  canonicalName: text("canonical_name"),

  // Dual-Industry Field Strategy (Phase 8)
  industryStandardized: text("industry_standardized"),
  industrySecondary: text("industry_secondary").array(),
  industryCode: text("industry_code"),
  industryRaw: text("industry_raw"),

  // AI Enrichment Fields
  industryAiSuggested: text("industry_ai_suggested"),
  industryAiCandidates: jsonb("industry_ai_candidates"),
  industryAiTopk: text("industry_ai_topk").array(),
  industryAiConfidence: numeric("industry_ai_confidence", { precision: 5, scale: 4 }),
  industryAiSource: text("industry_ai_source"),
  industryAiSuggestedAt: timestamp("industry_ai_suggested_at"),
  industryAiReviewedBy: varchar("industry_ai_reviewed_by").references(() => users.id, { onDelete: 'set null' }),
  industryAiReviewedAt: timestamp("industry_ai_reviewed_at"),
  industryAiStatus: industryAIStatusEnum("industry_ai_status"),

  annualRevenue: numeric("annual_revenue"), // Removed precision to allow deployment
  minAnnualRevenue: numeric("min_annual_revenue"), // Range minimum for revenue
  maxAnnualRevenue: numeric("max_annual_revenue"), // Range maximum for revenue
  revenueRange: revenueRangeEnum("revenue_range"), // Pivotal Template: "$500M - $1B", "$1B+", etc.
  employeesSizeRange: staffCountRangeEnum("employees_size_range"), // Pivotal Template: "501-1000", "10000+", etc.
  staffCount: integer("staff_count"),
  minEmployeesSize: integer("min_employees_size"), // Range minimum for employees
  maxEmployeesSize: integer("max_employees_size"), // Range maximum for employees
  description: text("description"), // Multiline text with UTF-8 support
  list: text("list"), // Source list identifier (e.g., "InFynd", "ZoomInfo")

  // Pivotal B2B Standard Template - Company Location Fields
  hqStreet1: text("hq_street_1"),
  hqStreet2: text("hq_street_2"),
  hqStreet3: text("hq_street_3"),
  hqAddress: text("hq_address"), // Legacy combined address
  hqCity: text("hq_city"),
  hqState: text("hq_state"),
  hqStateAbbr: text("hq_state_abbr"), // State abbreviation (e.g., "NC", "CA")
  hqPostalCode: text("hq_postal_code"),
  hqCountry: text("hq_country"),
  companyLocation: text("company_location"), // Formatted: "5420 Wade Park Boulevard, Raleigh, NC 27607, United States"

  yearFounded: integer("year_founded"),
  foundedDate: date("founded_date"), // NEW: YYYY-MM-DD or YYYY only
  foundedDatePrecision: text("founded_date_precision"), // NEW: 'year' or 'full'
  sicCode: text("sic_code"),
  naicsCode: text("naics_code"),
  domain: text("domain"),
  domainNormalized: text("domain_normalized"),
  websiteDomain: text("website_domain"), // NEW: Normalized naked domain (e.g., aircanada.com)
  previousNames: text("previous_names").array(),
  linkedinUrl: text("linkedin_url"),
  linkedinId: text("linkedin_id"), // LinkedIn numeric ID
  linkedinSpecialties: text("linkedin_specialties").array(),
  mainPhone: text("main_phone"),
  mainPhoneE164: text("main_phone_e164"),
  mainPhoneExtension: text("main_phone_extension"),
  intentTopics: text("intent_topics").array(),
  techStack: text("tech_stack").array(),
  webTechnologies: text("web_technologies"), // NEW: BuiltWith URL or comma-separated list
  webTechnologiesJson: jsonb("web_technologies_json"), // NEW: Normalized array for filtering
  parentAccountId: varchar("parent_account_id"),
  tags: text("tags").array(),
  ownerId: varchar("owner_id").references(() => users.id),
  customFields: jsonb("custom_fields"),
  sourceSystem: text("source_system"),
  sourceRecordId: text("source_record_id"),
  sourceUpdatedAt: timestamp("source_updated_at"),

  // AI-Powered Account Enrichment & Verification
  aiEnrichmentData: jsonb("ai_enrichment_data"), // Full AI research results
  aiEnrichmentDate: timestamp("ai_enrichment_date"), // Last enrichment timestamp

  // Email Deliverability Score (Account-Level Aggregation)
  emailDeliverabilityScore: numeric("email_deliverability_score", { precision: 5, scale: 2 }), // 0-100 score based on contact email validation
  emailDeliverabilityUpdatedAt: timestamp("email_deliverability_updated_at"), // Last score calculation timestamp

  // Companies House Validation Cache (Annual Refresh)
  chValidatedAt: timestamp("ch_validated_at"), // Last validation timestamp (365-day TTL)
  chValidationStatus: text("ch_validation_status"), // 'validated', 'not_found', 'api_error', null
  chCompanyNumber: text("ch_company_number"), // UK Companies House registration number
  chLegalName: text("ch_legal_name"), // Official registered company name
  chStatus: text("ch_status"), // Company status: 'active', 'dissolved', etc.
  chIsActive: boolean("ch_is_active"), // True if status is 'active'
  chDateOfCreation: date("ch_date_of_creation"), // Company incorporation date
  chAddress: jsonb("ch_address"), // Full registered address object

  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (table) => ({
  domainIdx: index("accounts_domain_idx").on(table.domain),
  domainNormalizedUniqueIdx: uniqueIndex("accounts_domain_normalized_unique_idx").on(table.domainNormalized),
  nameCityCountryUniqueIdx: uniqueIndex("accounts_name_city_country_unique_idx").on(table.nameNormalized, table.hqCity, table.hqCountry).where(sql`domain_normalized IS NULL`),
  ownerIdx: index("accounts_owner_idx").on(table.ownerId),
  nameIdx: index("accounts_name_idx").on(table.name),
  canonicalNameIdx: index("accounts_canonical_name_idx").on(table.canonicalName),
  specialtiesGinIdx: index("accounts_specialties_gin_idx").using('gin', table.linkedinSpecialties),
  techStackGinIdx: index("accounts_tech_stack_gin_idx").using('gin', table.techStack),
  tagsGinIdx: index("accounts_tags_gin_idx").using('gin', table.tags),
  parentAccountFk: foreignKey({
    columns: [table.parentAccountId],
    foreignColumns: [table.id],
    name: "accounts_parent_account_id_fkey"
  }).onDelete('set null'),
}));

// Company Aliases - Manual overrides for company name matching
export const companyAliases = pgTable("company_aliases", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  canonicalName: text("canonical_name").notNull(),
  alias: text("alias").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  createdBy: varchar("created_by").references(() => users.id, { onDelete: 'set null' }),
}, (table) => ({
  canonicalAliasUniq: uniqueIndex("company_aliases_canonical_alias_uniq").on(table.canonicalName, table.alias),
  aliasIdx: index("company_aliases_alias_idx").on(table.alias),
}));

// Contacts table
export const contacts = pgTable("contacts", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  accountId: varchar("account_id").references(() => accounts.id, { onDelete: 'set null' }),
  fullName: text("full_name").notNull(),
  firstName: text("first_name"),
  lastName: text("last_name"),
  jobTitle: text("job_title"),
  email: text("email"), // Nullable - verification contacts may not have emails initially
  emailNormalized: text("email_normalized"),
  emailVerificationStatus: emailVerificationStatusEnum("email_verification_status").default('unknown'),
  emailAiConfidence: numeric("email_ai_confidence", { precision: 5, scale: 2 }), // AI confidence score (0-100%)
  directPhone: text("direct_phone"),
  directPhoneE164: text("direct_phone_e164"),
  phoneExtension: text("phone_extension"),
  phoneVerifiedAt: timestamp("phone_verified_at"),
  phoneAiConfidence: numeric("phone_ai_confidence", { precision: 5, scale: 2 }), // AI confidence score (0-100%)
  mobilePhone: text("mobile_phone"),
  mobilePhoneE164: text("mobile_phone_e164"),
  seniorityLevel: text("seniority_level"),
  department: text("department"),
  address: text("address"),
  linkedinUrl: text("linkedin_url"),

  // Career & Tenure fields (Pivotal B2B Standard Template)
  formerPosition: text("former_position"),
  timeInCurrentPosition: text("time_in_current_position"), // e.g., "2 years" (raw string)
  timeInCurrentPositionMonths: integer("time_in_current_position_months"), // NEW: Computed shadow field for filtering/sorting
  timeInCurrentCompany: text("time_in_current_company"), // e.g., "4 years" (raw string)
  timeInCurrentCompanyMonths: integer("time_in_current_company_months"), // NEW: Computed shadow field for filtering/sorting
  intentTopics: text("intent_topics").array(),
  tags: text("tags").array(),
  consentBasis: text("consent_basis"),
  consentSource: text("consent_source"),
  consentTimestamp: timestamp("consent_timestamp"),
  ownerId: varchar("owner_id").references(() => users.id),
  customFields: jsonb("custom_fields"),
  emailStatus: text("email_status").default('unknown'),
  phoneStatus: text("phone_status").default('unknown'),
  sourceSystem: text("source_system"),
  sourceRecordId: text("source_record_id"),
  sourceUpdatedAt: timestamp("source_updated_at"),

  // Pivotal B2B Standard Template fields
  researchDate: timestamp("research_date"), // Explicit research/enrichment date
  list: text("list"), // Source list identifier (e.g., "InFynd", "ZoomInfo")

  // Timezone & Business Hours fields
  timezone: text("timezone"), // IANA timezone (e.g., 'America/New_York')
  city: text("city"),
  state: text("state"),
  stateAbbr: text("state_abbr"), // State abbreviation (e.g., "NC", "CA")
  county: text("county"), // County/Region
  postalCode: text("postal_code"), // Postal/ZIP code
  country: text("country"),
  contactLocation: text("contact_location"), // Formatted location string (e.g., "Raleigh, NC 27607, USA")

  // Data Quality fields
  isInvalid: boolean("is_invalid").notNull().default(false),
  invalidReason: text("invalid_reason"),
  invalidatedAt: timestamp("invalidated_at"),
  invalidatedBy: varchar("invalidated_by").references(() => users.id, { onDelete: 'set null' }),

  // Suppression Matching fields
  fullNameNorm: text("full_name_norm"),
  companyNorm: text("company_norm"),
  nameCompanyHash: text("name_company_hash"),
  cavId: text("cav_id"),
  cavUserId: text("cav_user_id"),

  deletedAt: timestamp("deleted_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (table) => ({
  emailIdx: index("contacts_email_idx").on(table.email),
  emailNormalizedUniqueIdx: uniqueIndex("contacts_email_normalized_unique_idx").on(table.emailNormalized).where(sql`deleted_at IS NULL AND email_normalized IS NOT NULL`),
  accountIdx: index("contacts_account_idx").on(table.accountId),
  phoneIdx: index("contacts_phone_idx").on(table.directPhoneE164),
  ownerIdx: index("contacts_owner_idx").on(table.ownerId),
  tagsGinIdx: index("contacts_tags_gin_idx").using('gin', table.tags),
  timezoneIdx: index("contacts_timezone_idx").on(table.timezone),
  cavIdIdx: index("contacts_cav_id_idx").on(table.cavId),
  cavUserIdIdx: index("contacts_cav_user_id_idx").on(table.cavUserId),
  nameCompanyHashIdx: index("contacts_name_company_hash_idx").on(table.nameCompanyHash),
}));


// Contact Emails - Secondary email addresses for contacts
export const contactEmails = pgTable("contact_emails", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  contactId: varchar("contact_id").notNull().references(() => contacts.id, { onDelete: 'cascade' }),
  email: text("email").notNull(),
  emailNormalized: text("email_normalized").notNull(),
  isPrimary: boolean("is_primary").notNull().default(false),
  deletedAt: timestamp("deleted_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (table) => ({
  contactIdx: index("contact_emails_contact_idx").on(table.contactId),
  emailNormalizedUniqueIdx: uniqueIndex("contact_emails_email_normalized_unique_idx").on(table.emailNormalized).where(sql`deleted_at IS NULL`),
}));

// Account Domains - Alternate/additional domains for accounts
export const accountDomains = pgTable("account_domains", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  accountId: varchar("account_id").notNull().references(() => accounts.id, { onDelete: 'cascade' }),
  domain: text("domain").notNull(),
  domainNormalized: text("domain_normalized").notNull(),
  isPrimary: boolean("is_primary").notNull().default(false),
  deletedAt: timestamp("deleted_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (table) => ({
  accountIdx: index("account_domains_account_idx").on(table.accountId),
  domainNormalizedUniqueIdx: uniqueIndex("account_domains_domain_normalized_unique_idx").on(table.domainNormalized).where(sql`deleted_at IS NULL`),
}));

// Field Change Log - Audit trail for field-level survivorship
export const fieldChangeLog = pgTable("field_change_log", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  entityType: text("entity_type").notNull(), // 'contact', 'account'
  entityId: varchar("entity_id").notNull(),
  fieldKey: text("field_key").notNull(),
  oldValue: jsonb("old_value"),
  newValue: jsonb("new_value"),
  sourceSystem: text("source_system"),
  actorId: varchar("actor_id").references(() => users.id),
  survivorshipPolicy: text("survivorship_policy"), // e.g., 'prefer_new', 'max_recency', 'union'
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (table) => ({
  entityIdx: index("field_change_log_entity_idx").on(table.entityType, table.entityId),
  createdAtIdx: index("field_change_log_created_at_idx").on(table.createdAt),
}));

// Dedupe Review Queue - Human review for fuzzy matches
export const dedupeReviewQueue = pgTable("dedupe_review_queue", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  entityType: text("entity_type").notNull(), // 'contact', 'account'
  candidateAId: varchar("candidate_a_id").notNull(),
  candidateBId: varchar("candidate_b_id").notNull(),
  matchScore: real("match_score").notNull(), // 0.0 to 1.0 confidence
  matchReason: text("match_reason"), // e.g., 'similar_name_same_account', 'trigram_domain'
  status: text("status").notNull().default('pending'), // 'pending', 'approved_merge', 'rejected', 'auto_merged'
  reviewedBy: varchar("reviewed_by").references(() => users.id),
  reviewedAt: timestamp("reviewed_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (table) => ({
  statusIdx: index("dedupe_review_queue_status_idx").on(table.status),
  entityTypeIdx: index("dedupe_review_queue_entity_type_idx").on(table.entityType),
}));

// Industry Reference - Standardized taxonomy (LinkedIn/NAICS)
export const industryReference = pgTable("industry_reference", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull().unique(),
  naicsCode: text("naics_code"),
  synonyms: text("synonyms").array().default(sql`'{}'::text[]`),
  parentId: varchar("parent_id"), // For hierarchical grouping
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (table) => ({
  nameIdx: index("industry_reference_name_idx").on(table.name),
  isActiveIdx: index("industry_reference_is_active_idx").on(table.isActive),
  parentIdFk: foreignKey({
    columns: [table.parentId],
    foreignColumns: [table.id],
    name: "industry_reference_parent_id_fkey"
  }).onDelete('set null'),
}));

// Company Size Reference - Standardized employee ranges
export const companySizeReference = pgTable("company_size_reference", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  code: text("code").notNull().unique(), // A, B, C, D, E, F, G, H, I
  label: text("label").notNull(),
  minEmployees: integer("min_employees").notNull(),
  maxEmployees: integer("max_employees"), // NULL for "10,000+"
  sortOrder: integer("sort_order").notNull(),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (table) => ({
  codeIdx: index("company_size_reference_code_idx").on(table.code),
  sortOrderIdx: index("company_size_reference_sort_order_idx").on(table.sortOrder),
}));

// Revenue Range Reference - Standardized annual revenue brackets (USD)
export const revenueRangeReference = pgTable("revenue_range_reference", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  label: text("label").notNull().unique(),
  description: text("description"),
  minRevenue: numeric("min_revenue", { precision: 15, scale: 2 }),
  maxRevenue: numeric("max_revenue", { precision: 15, scale: 2 }), // NULL for "Over $5B"
  sortOrder: integer("sort_order").notNull(),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (table) => ({
  labelIdx: index("revenue_range_reference_label_idx").on(table.label),
  sortOrderIdx: index("revenue_range_reference_sort_order_idx").on(table.sortOrder),
}));

// Seniority Level Reference - Standardized seniority/job levels
export const seniorityLevelReference = pgTable("seniority_level_reference", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull().unique(),
  description: text("description"),
  sortOrder: integer("sort_order").notNull(),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (table) => ({
  nameIdx: index("seniority_level_reference_name_idx").on(table.name),
  sortOrderIdx: index("seniority_level_reference_sort_order_idx").on(table.sortOrder),
}));

// Job Function Reference - Standardized job functions
export const jobFunctionReference = pgTable("job_function_reference", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull().unique(),
  description: text("description"),
  sortOrder: integer("sort_order").notNull(),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (table) => ({
  nameIdx: index("job_function_reference_name_idx").on(table.name),
  sortOrderIdx: index("job_function_reference_sort_order_idx").on(table.sortOrder),
}));

// Department Reference - Standardized department names
export const departmentReference = pgTable("department_reference", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull().unique(),
  description: text("description"),
  sortOrder: integer("sort_order").notNull(),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (table) => ({
  nameIdx: index("department_reference_name_idx").on(table.name),
  sortOrderIdx: index("department_reference_sort_order_idx").on(table.sortOrder),
}));

// Technology Reference - Standardized technology/software names
export const technologyReference = pgTable("technology_reference", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull().unique(),
  category: text("category"), // e.g., "CRM", "Marketing Automation", "BI Tools"
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (table) => ({
  nameIdx: index("technology_reference_name_idx").on(table.name),
  categoryIdx: index("technology_reference_category_idx").on(table.category),
}));

// Country Reference - Standardized countries
export const countryReference = pgTable("country_reference", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull().unique(),
  code: text("code").notNull().unique(), // ISO 3166-1 alpha-2 (e.g., "US", "CA", "GB")
  sortOrder: integer("sort_order").notNull(),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (table) => ({
  nameIdx: index("country_reference_name_idx").on(table.name),
  codeIdx: index("country_reference_code_idx").on(table.code),
  sortOrderIdx: index("country_reference_sort_order_idx").on(table.sortOrder),
}));

// State Reference - Standardized states/provinces with country relationship
export const stateReference = pgTable("state_reference", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull(),
  code: text("code"), // State abbreviation (e.g., "CA", "TX", "NY")
  countryId: varchar("country_id").references(() => countryReference.id, { onDelete: 'cascade' }).notNull(),
  sortOrder: integer("sort_order").notNull(),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (table) => ({
  nameIdx: index("state_reference_name_idx").on(table.name),
  codeIdx: index("state_reference_code_idx").on(table.code),
  countryIdIdx: index("state_reference_country_id_idx").on(table.countryId),
  sortOrderIdx: index("state_reference_sort_order_idx").on(table.sortOrder),
  uniqueNamePerCountry: index("state_reference_unique_name_country").on(table.name, table.countryId),
}));

// City Reference - Standardized cities with state/country relationship
export const cityReference = pgTable("city_reference", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull(),
  stateId: varchar("state_id").references(() => stateReference.id, { onDelete: 'cascade' }),
  countryId: varchar("country_id").references(() => countryReference.id, { onDelete: 'cascade' }).notNull(),
  sortOrder: integer("sort_order").notNull(),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (table) => ({
  nameIdx: index("city_reference_name_idx").on(table.name),
  stateIdIdx: index("city_reference_state_id_idx").on(table.stateId),
  countryIdIdx: index("city_reference_country_id_idx").on(table.countryId),
  sortOrderIdx: index("city_reference_sort_order_idx").on(table.sortOrder),
}));

// Segments table (dynamic filters)
export const segments = pgTable("segments", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull(),
  description: text("description"),
  entityType: entityTypeEnum("entity_type").notNull().default('contact'),
  definitionJson: jsonb("definition_json").notNull(),
  ownerId: varchar("owner_id").references(() => users.id),
  lastRefreshedAt: timestamp("last_refreshed_at"),
  isActive: boolean("is_active").notNull().default(true),
  recordCountCache: integer("record_count_cache").default(0),
  tags: text("tags").array().default(sql`'{}'::text[]`),
  visibilityScope: visibilityScopeEnum("visibility_scope").notNull().default('private'),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (table) => ({
  entityTypeIdx: index("segments_entity_type_idx").on(table.entityType),
  isActiveIdx: index("segments_is_active_idx").on(table.isActive),
  ownerIdIdx: index("segments_owner_id_idx").on(table.ownerId),
}));

// Lists table (static snapshots)
export const lists = pgTable("lists", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull(),
  description: text("description"),
  entityType: entityTypeEnum("entity_type").notNull().default('contact'),
  sourceType: sourceTypeEnum("source_type").notNull().default('manual_upload'),
  sourceRef: varchar("source_ref"), // Segment ID, import ID, or selection context ID
  snapshotTs: timestamp("snapshot_ts").notNull().defaultNow(),
  recordIds: text("record_ids").array().notNull().default(sql`'{}'::text[]`),
  ownerId: varchar("owner_id").references(() => users.id),
  tags: text("tags").array().default(sql`'{}'::text[]`),
  visibilityScope: visibilityScopeEnum("visibility_scope").notNull().default('private'),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (table) => ({
  entityTypeIdx: index("lists_entity_type_idx").on(table.entityType),
  sourceTypeIdx: index("lists_source_type_idx").on(table.sourceType),
  ownerIdIdx: index("lists_owner_id_idx").on(table.ownerId),
}));

// Domain Sets table (Phase 21 - Upgraded for ABM & Campaign Audience Mapping)
export const domainSets = pgTable("domain_sets", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull(),
  description: text("description"),
  uploadFileUri: text("upload_file_uri"),
  totalUploaded: integer("total_uploaded").default(0),
  matchedAccounts: integer("matched_accounts").default(0),
  matchedContacts: integer("matched_contacts").default(0),
  duplicatesRemoved: integer("duplicates_removed").default(0),
  unknownDomains: integer("unknown_domains").default(0),
  status: text("status").notNull().default('processing'), // processing | completed | error
  ownerId: varchar("owner_id").references(() => users.id),
  tags: text("tags").array().default(sql`'{}'::text[]`),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (table) => ({
  ownerIdIdx: index("domain_sets_owner_id_idx").on(table.ownerId),
  statusIdx: index("domain_sets_status_idx").on(table.status),
}));

// Domain Set Items table (individual domains with matching results)
export const domainSetItems = pgTable("domain_set_items", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  domainSetId: varchar("domain_set_id").references(() => domainSets.id, { onDelete: 'cascade' }).notNull(),
  domain: text("domain").notNull(),
  normalizedDomain: text("normalized_domain").notNull(),
  accountName: text("account_name"), // Company name from CSV for matching
  accountId: varchar("account_id").references(() => accounts.id, { onDelete: 'set null' }),
  matchType: text("match_type"), // exact | fuzzy | none
  matchConfidence: numeric("match_confidence", { precision: 3, scale: 2 }), // 0.00 to 1.00
  matchedBy: text("matched_by"), // domain | name | both
  matchedContactsCount: integer("matched_contacts_count").default(0),
  autoCreatedAccount: boolean("auto_created_account").default(false),
  notes: text("notes"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (table) => ({
  domainSetIdIdx: index("domain_set_items_domain_set_id_idx").on(table.domainSetId),
  accountIdIdx: index("domain_set_items_account_id_idx").on(table.accountId),
  normalizedDomainIdx: index("domain_set_items_normalized_domain_idx").on(table.normalizedDomain),
}));

// Domain Set Contact Links table (links domains to contacts)
export const domainSetContactLinks = pgTable("domain_set_contact_links", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  domainSetId: varchar("domain_set_id").references(() => domainSets.id, { onDelete: 'cascade' }).notNull(),
  contactId: varchar("contact_id").references(() => contacts.id, { onDelete: 'cascade' }).notNull(),
  accountId: varchar("account_id").references(() => accounts.id, { onDelete: 'cascade' }),
  matchedVia: text("matched_via").notNull(), // domain | email | manual
  includedInList: boolean("included_in_list").default(false),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (table) => ({
  domainSetIdIdx: index("domain_set_contact_links_domain_set_id_idx").on(table.domainSetId),
  contactIdIdx: index("domain_set_contact_links_contact_id_idx").on(table.contactId),
}));

// Campaigns table
export const campaigns = pgTable("campaigns", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  type: campaignTypeEnum("type").notNull(),
  name: text("name").notNull(),
  status: campaignStatusEnum("status").notNull().default('draft'),
  brandId: varchar("brand_id"),
  scheduleJson: jsonb("schedule_json"),
  assignedTeams: text("assigned_teams").array(),
  audienceRefs: jsonb("audience_refs"),
  throttlingConfig: jsonb("throttling_config"),
  emailSubject: text("email_subject"),
  emailHtmlContent: text("email_html_content"),
  callScript: text("call_script"),
  scriptId: varchar("script_id"),
  qualificationQuestions: jsonb("qualification_questions"),
  ownerId: varchar("owner_id").references(() => users.id),
  accountCapEnabled: boolean("account_cap_enabled").notNull().default(false),
  accountCapValue: integer("account_cap_value"),
  accountCapMode: accountCapModeEnum("account_cap_mode"),

  // Dial Mode (Manual, Hybrid, or AI Agent)
  dialMode: dialModeEnum("dial_mode").notNull().default('manual'),

  // Power Dialer Settings (AMD & Voicemail)
  powerSettings: jsonb("power_settings"), // { amd: { enabled, confidenceThreshold, timeout, unknownAction }, voicemailPolicy: { enabled, action, message, campaign_daily_vm_cap, contact_vm_cap, region_blacklist } }

  // AI Voice Agent Settings
  aiAgentSettings: jsonb("ai_agent_settings"), // { persona: { name, companyName, role, voice }, scripts: { opening, gatekeeper, pitch, objections, closing }, handoff: { enabled, triggers, transferNumber }, gatekeeperLogic: { responses, maxAttempts } }

  // Retry Logic & Business Hours
  retryRules: jsonb("retry_rules"),  // { voicemail: {}, no_answer: {}, backoff: "", business_hours: {}, respect_local_tz: bool }
  timezone: text("timezone"),  // Campaign timezone (e.g., 'America/New_York')

  // Business Hours Configuration for Auto-Dialer
  businessHoursConfig: jsonb("business_hours_config"), // { enabled: bool, timezone: string, operatingDays: string[], startTime: string, endTime: string, respectContactTimezone: bool, excludedDates: string[] }

  // Campaign goals and timeline (Phase 31)
  targetQualifiedLeads: integer("target_qualified_leads"),
  startDate: date("start_date"),
  endDate: date("end_date"),
  costPerLead: decimal("cost_per_lead", { precision: 10, scale: 2 }),

  // AI-Powered QA Configuration
  qaParameters: jsonb("qa_parameters"), // Quality assurance criteria and scoring weights
  customQaFields: jsonb("custom_qa_fields"), // Custom QA fields to extract from transcripts [{name, label, type, required, options}]
  customQaRules: text("custom_qa_rules"), // Natural language qualification rules for AI to interpret and apply (user input)
  parsedQaRules: jsonb("parsed_qa_rules"), // Cached parsed rules (generated once on save to avoid re-parsing per lead)
  clientSubmissionConfig: jsonb("client_submission_config"), // One-click client submission settings
  recordingAutoSyncEnabled: boolean("recording_auto_sync_enabled").default(false), // Auto-fetch recording 60s after lead creation
  
  // Companies House UK Validation (auto-validate company info on lead creation)
  companiesHouseValidation: jsonb("companies_house_validation"), // { enabled: boolean, autoValidateOnLeadCreation: boolean, requireActiveStatus: boolean }
  
  // Lead Delivery Template (custom field selection for client exports)
  deliveryTemplateId: varchar("delivery_template_id").references(() => exportTemplates.id, { onDelete: 'set null' }),

  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
  launchedAt: timestamp("launched_at"),
}, (table) => ({
  statusIdx: index("campaigns_status_idx").on(table.status),
  typeIdx: index("campaigns_type_idx").on(table.type),
  dialModeIdx: index("campaigns_dial_mode_idx").on(table.dialMode),
  deliveryTemplateIdx: index("campaigns_delivery_template_idx").on(table.deliveryTemplateId),
}));

// Campaign Agent Assignments table (enforces one-campaign-per-agent rule)
// Virtual Agents - AI agent personas that can be assigned to campaigns like human agents
export const virtualAgents = pgTable("virtual_agents", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull(),
  description: text("description"),
  provider: text("provider").notNull().default('openai_realtime'), // openai_realtime, elevenlabs, etc.
  externalAgentId: text("external_agent_id"), // Provider-specific agent ID
  voice: aiVoiceEnum("voice").default('nova'),
  systemPrompt: text("system_prompt"),
  firstMessage: text("first_message"),
  settings: jsonb("settings"), // Provider-specific settings (temperature, persona, etc.)
  isActive: boolean("is_active").notNull().default(true),
  // Specialized Demand Agent fields
  demandAgentType: demandAgentTypeEnum("demand_agent_type"), // demand_intel, demand_qual, demand_engage
  specializationConfig: jsonb("specialization_config"), // Type-specific configuration
  // Skill-Based Agent fields
  skillId: text("skill_id"), // e.g., 'whitepaper_distribution', 'appointment_setting'
  skillInputs: jsonb("skill_inputs"), // User-provided input values for the skill
  compiledPromptMetadata: jsonb("compiled_prompt_metadata"), // {sources, compiledAt, skillMetadata}
  createdBy: varchar("created_by").references(() => users.id, { onDelete: 'set null' }),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (table) => ({
  nameIdx: index("virtual_agents_name_idx").on(table.name),
  providerIdx: index("virtual_agents_provider_idx").on(table.provider),
  activeIdx: index("virtual_agents_active_idx").on(table.isActive),
  demandTypeIdx: index("virtual_agents_demand_type_idx").on(table.demandAgentType),
  skillIdIdx: index("virtual_agents_skill_id_idx").on(table.skillId),
}));

export const campaignAgentAssignments = pgTable("campaign_agent_assignments", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  campaignId: varchar("campaign_id").references(() => campaigns.id, { onDelete: 'cascade' }).notNull(),
  agentId: varchar("agent_id").references(() => users.id, { onDelete: 'cascade' }),
  virtualAgentId: varchar("virtual_agent_id").references(() => virtualAgents.id, { onDelete: 'cascade' }),
  agentType: agentTypeEnum("agent_type").notNull().default('human'),
  assignedBy: varchar("assigned_by").references(() => users.id),
  assignedAt: timestamp("assigned_at").notNull().defaultNow(),
  releasedAt: timestamp("released_at"),
  isActive: boolean("is_active").notNull().default(true),
}, (table) => ({
  campaignAgentUniq: uniqueIndex("campaign_agent_assignments_uniq").on(table.campaignId, table.agentId),
  campaignVirtualAgentUniq: uniqueIndex("campaign_virtual_agent_assignments_uniq").on(table.campaignId, table.virtualAgentId),
  activeAgentUniq: uniqueIndex("campaign_agent_assignments_active_agent_uniq")
    .on(table.agentId)
    .where(sql`${table.isActive} = true AND ${table.agentType} = 'human'`),
  campaignIdx: index("campaign_agent_assignments_campaign_idx").on(table.campaignId),
  agentIdx: index("campaign_agent_assignments_agent_idx").on(table.agentId),
  virtualAgentIdx: index("campaign_agent_assignments_virtual_agent_idx").on(table.virtualAgentId),
  agentTypeIdx: index("campaign_agent_assignments_agent_type_idx").on(table.agentType),
}));

// Campaign Agents table (simplified many-to-many for agent assignments)
export const campaignAgents = pgTable("campaign_agents", {
  campaignId: varchar("campaign_id").references(() => campaigns.id, { onDelete: 'cascade' }).notNull(),
  agentId: varchar("agent_id").references(() => users.id, { onDelete: 'cascade' }).notNull(),
  assignedAt: timestamp("assigned_at").notNull().defaultNow(),
}, (table) => ({
  pk: primaryKey({ columns: [table.campaignId, table.agentId] }),
  campaignIdx: index("campaign_agents_campaign_idx").on(table.campaignId),
  agentIdx: index("campaign_agents_agent_idx").on(table.agentId),
}));

// Campaign Queue table (for account lead cap enforcement & power dial)
export const campaignQueue = pgTable("campaign_queue", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  campaignId: varchar("campaign_id").references(() => campaigns.id, { onDelete: 'cascade' }).notNull(),
  contactId: varchar("contact_id").references(() => contacts.id, { onDelete: 'cascade' }).notNull(),
  accountId: varchar("account_id").references(() => accounts.id, { onDelete: 'cascade' }).notNull(),
  agentId: varchar("agent_id").references(() => users.id),
  virtualAgentId: varchar("virtual_agent_id").references(() => virtualAgents.id),
  targetAgentType: queueTargetAgentTypeEnum("target_agent_type").notNull().default('any'),
  dialedNumber: text("dialed_number"), // CRITICAL: Exact phone number dialed for Telnyx recording sync
  priority: integer("priority").notNull().default(0),
  status: queueStatusEnum("status").notNull().default('queued'),
  removedReason: text("removed_reason"),
  // Lock management & concurrency control
  lockVersion: integer("lock_version").notNull().default(0),
  lockExpiresAt: timestamp("lock_expires_at"),
  nextAttemptAt: timestamp("next_attempt_at"),
  // Provenance tracking
  enqueuedBy: text("enqueued_by"), // system|userId|dv_project_id
  enqueuedReason: text("enqueued_reason"), // campaign_audience|retry|callback|dv_enrollment|manual_add
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (table) => ({
  // Existing indexes
  campaignAccountIdx: index("campaign_queue_camp_acct_idx").on(table.campaignId, table.accountId),
  campaignStatusIdx: index("campaign_queue_camp_status_idx").on(table.campaignId, table.status),
  campaignContactUniq: uniqueIndex("campaign_queue_camp_contact_uniq").on(table.campaignId, table.contactId),
  agentIdx: index("campaign_queue_agent_idx").on(table.agentId),
  virtualAgentIdx: index("campaign_queue_virtual_agent_idx").on(table.virtualAgentId),
  targetAgentTypeIdx: index("campaign_queue_target_agent_type_idx").on(table.targetAgentType),
  // NEW: Partial unique index - prevent dupes unless done/removed
  activeUniq: uniqueIndex("campaign_queue_active_uniq")
    .on(table.campaignId, table.contactId)
    .where(sql`${table.status} NOT IN ('done','removed')`),
  // NEW: Pull-path covering index for power dialer
  pullIdx: index("campaign_queue_pull_idx")
    .on(table.campaignId, table.status, table.nextAttemptAt, table.priority),
}));

// Campaign Account Stats table (for O(1) cap checks)
export const campaignAccountStats = pgTable("campaign_account_stats", {
  campaignId: varchar("campaign_id").references(() => campaigns.id, { onDelete: 'cascade' }).notNull(),
  accountId: varchar("account_id").references(() => accounts.id, { onDelete: 'cascade' }).notNull(),
  queuedCount: integer("queued_count").notNull().default(0),
  connectedCount: integer("connected_count").notNull().default(0),
  positiveDispCount: integer("positive_disp_count").notNull().default(0),
  lastEnforcedAt: timestamp("last_enforced_at"),
}, (table) => ({
  pk: primaryKey({ columns: [table.campaignId, table.accountId] }),
}));

// Agent Queue table (for Manual Dial mode)
export const agentQueue = pgTable("agent_queue", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  agentId: varchar("agent_id").references(() => users.id, { onDelete: 'cascade' }).notNull(),
  campaignId: varchar("campaign_id").references(() => campaigns.id, { onDelete: 'cascade' }).notNull(),
  contactId: varchar("contact_id").references(() => contacts.id, { onDelete: 'cascade' }).notNull(),
  accountId: varchar("account_id").references(() => accounts.id, { onDelete: 'cascade' }),
  dialedNumber: text("dialed_number"), // CRITICAL: Exact phone number dialed for Telnyx recording sync
  queueState: manualQueueStateEnum("queue_state").notNull().default('queued'),
  lockedBy: varchar("locked_by").references(() => users.id),
  lockedAt: timestamp("locked_at"),
  queuedAt: timestamp("queued_at"),
  releasedAt: timestamp("released_at"),
  createdBy: varchar("created_by").references(() => users.id),
  releasedBy: varchar("released_by").references(() => users.id),
  priority: integer("priority").notNull().default(0),
  removedReason: text("removed_reason"),
  // Lock management & concurrency control
  lockVersion: integer("lock_version").notNull().default(0),
  lockExpiresAt: timestamp("lock_expires_at"),
  scheduledFor: timestamp("scheduled_for"), // for callbacks
  // Provenance tracking
  enqueuedBy: text("enqueued_by"), // system|userId|dv_project_id
  enqueuedReason: text("enqueued_reason"), // campaign_audience|retry|callback|dv_enrollment|manual_add
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (table) => ({
  // Existing indexes
  agentCampaignContactUniq: uniqueIndex("agent_queue_agent_campaign_contact_uniq")
    .on(table.agentId, table.campaignId, table.contactId),
  agentStateIdx: index("agent_queue_agent_state_idx").on(table.agentId, table.queueState),
  campaignIdx: index("agent_queue_campaign_idx").on(table.campaignId),
  contactIdx: index("agent_queue_contact_idx").on(table.contactId),
  // NEW: Pull-path covering index for manual dial
  pullIdx: index("agent_queue_pull_idx")
    .on(table.campaignId, table.queueState, table.priority, table.scheduledFor),
}));

// Voicemail Assets table (for AMD/Voicemail messages)
export const voicemailAssets = pgTable("voicemail_assets", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull(),
  messageType: voicemailMessageTypeEnum("message_type").notNull(),
  ttsVoiceId: text("tts_voice_id"), // TTS provider voice ID
  ttsTemplate: text("tts_template"), // Template with {{token}} support
  audioFileUrl: text("audio_file_url"), // URL to uploaded audio file
  audioFileKey: text("audio_file_key"), // Storage key for audio file
  durationSec: integer("duration_sec"),
  locale: text("locale").default('en-US'),
  ownerId: varchar("owner_id").references(() => users.id),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (table) => ({
  ownerIdx: index("voicemail_assets_owner_idx").on(table.ownerId),
  activeIdx: index("voicemail_assets_active_idx").on(table.isActive),
}));

// Contact Voicemail Tracking (per-contact VM counts and cooldowns)
export const contactVoicemailTracking = pgTable("contact_voicemail_tracking", {
  contactId: varchar("contact_id").references(() => contacts.id, { onDelete: 'cascade' }).notNull(),
  campaignId: varchar("campaign_id").references(() => campaigns.id, { onDelete: 'cascade' }).notNull(),
  vmCount: integer("vm_count").notNull().default(0), // Total voicemails left
  lastVmAt: timestamp("last_vm_at"), // Last voicemail timestamp (for cooldown)
  lastVmAssetId: varchar("last_vm_asset_id").references(() => voicemailAssets.id), // Last asset used
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (table) => ({
  pk: primaryKey({ columns: [table.contactId, table.campaignId] }),
  lastVmIdx: index("contact_vm_tracking_last_vm_idx").on(table.lastVmAt),
}));

// Email Messages table
export const emailMessages = pgTable("email_messages", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  campaignId: varchar("campaign_id").references(() => campaigns.id, { onDelete: 'cascade' }),
  contactId: varchar("contact_id").references(() => contacts.id, { onDelete: 'cascade' }),
  providerMessageId: text("provider_message_id"),
  status: text("status").notNull().default('pending'),
  deliveredAt: timestamp("delivered_at"),
  openedAt: timestamp("opened_at"),
  clickedAt: timestamp("clicked_at"),
  bouncedAt: timestamp("bounced_at"),
  complaintAt: timestamp("complaint_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (table) => ({
  campaignIdx: index("email_messages_campaign_idx").on(table.campaignId),
  contactIdx: index("email_messages_contact_idx").on(table.contactId),
  statusIdx: index("email_messages_status_idx").on(table.status),
}));

// Calls table
export const calls = pgTable("calls", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  queueItemId: varchar("queue_item_id"), // No FK - can reference either agent_queue or campaign_queue
  campaignId: varchar("campaign_id").references(() => campaigns.id, { onDelete: 'cascade' }),
  contactId: varchar("contact_id").references(() => contacts.id, { onDelete: 'cascade' }),
  agentId: varchar("agent_id").references(() => users.id),
  disposition: callDispositionEnum("disposition"),
  duration: integer("duration"),
  recordingUrl: text("recording_url"),
  callbackRequested: boolean("callback_requested").default(false),
  telnyxCallId: text("telnyx_call_id"),
  dialedNumber: text("dialed_number"), // Actual phone number dialed (E.164 format) - CRITICAL for recording sync
  notes: text("notes"),
  qualificationData: jsonb("qualification_data"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (table) => ({
  campaignIdx: index("calls_campaign_idx").on(table.campaignId),
  contactIdx: index("calls_contact_idx").on(table.contactId),
  agentIdx: index("calls_agent_idx").on(table.agentId),
  queueItemIdx: index("calls_queue_item_idx").on(table.queueItemId),
}));

// Leads table
export const leads = pgTable("leads", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  contactId: varchar("contact_id").references(() => contacts.id, { onDelete: 'set null' }),
  contactName: text("contact_name"),
  contactEmail: text("contact_email"),
  campaignId: varchar("campaign_id").references(() => campaigns.id, { onDelete: 'set null' }),
  // Link to call recording (if lead came from telephony campaign)
  callAttemptId: varchar("call_attempt_id").references(() => callAttempts.id, { onDelete: 'set null' }),
  recordingUrl: text("recording_url"), // Original Telnyx URL (may expire after 10 min)
  recordingS3Key: text("recording_s3_key"), // Permanent S3 storage key for recordings
  callDuration: integer("call_duration"), // Duration in seconds
  dialedNumber: text("dialed_number"), // Phone number that was dialed
  telnyxCallId: text("telnyx_call_id"), // CRITICAL: Telnyx call control ID for finding recordings
  agentId: varchar("agent_id").references(() => users.id), // Agent who qualified the lead
  qaStatus: qaStatusEnum("qa_status").notNull().default('new'),
  
  // Account snapshot fields (for denormalized access)
  accountName: text("account_name"),
  accountIndustry: text("account_industry"),
  
  // Wrong Person Answered Tracking
  originalContactId: varchar("original_contact_id").references(() => contacts.id), // Contact that was originally dialed
  actualContactId: varchar("actual_contact_id").references(() => contacts.id), // Contact who actually answered (qualified person)
  wrongPersonAnswered: boolean("wrong_person_answered").default(false), // Flag if different person answered
  checklistJson: jsonb("checklist_json"),
  approvedAt: timestamp("approved_at"),
  approvedById: varchar("approved_by_id").references(() => users.id),
  rejectedReason: text("rejected_reason"),
  rejectedAt: timestamp("rejected_at"),
  rejectedById: varchar("rejected_by_id").references(() => users.id),
  notes: text("notes"),
  customFields: jsonb("custom_fields"),

  // AI-Powered QA Fields
  transcript: text("transcript"), // Call transcription from AssemblyAI
  transcriptionStatus: text("transcription_status"), // pending, processing, completed, failed
  structuredTranscript: jsonb("structured_transcript"), // Parsed conversation with speaker labels (Agent vs Prospect)
  recordingStatus: text("recording_status"), // pending, fetching, completed, failed
  aiScore: numeric("ai_score", { precision: 5, scale: 2 }), // AI qualification score (0-100)
  aiAnalysis: jsonb("ai_analysis"), // Detailed AI analysis results
  aiQualificationStatus: text("ai_qualification_status"), // qualified, not_qualified, needs_review
  qaData: jsonb("qa_data"), // Extracted custom QA field values {content_interest: "Yes", company_status: "Active", etc.}

  // Client Submission Tracking
  submittedToClient: boolean("submitted_to_client").default(false),
  submittedAt: timestamp("submitted_at"),
  submissionResponse: jsonb("submission_response"), // Client API/form response
  
  // Lead Delivery Tracking (Webhook/API)
  deliveredAt: timestamp("delivered_at"), // When lead was delivered via webhook/API
  deliveredById: varchar("delivered_by_id").references(() => users.id), // User who marked lead as delivered
  deliverySource: leadDeliverySourceEnum("delivery_source"), // auto_webhook or manual
  deliveryNotes: text("delivery_notes"), // Optional notes about delivery

  // Lead Verification (LinkedIn or On-Call)
  verificationStatus: leadVerificationStatusEnum("verification_status"),
  verificationId: varchar("verification_id"), // Reference to lead_verifications record
  qaDecision: text("qa_decision"), // Clear reason why lead needs review/was rejected
  
  // LinkedIn Image Verification
  linkedinImageUrl: text("linkedin_image_url"), // S3 URL of LinkedIn screenshot
  linkedinVerificationData: jsonb("linkedin_verification_data"), // {extractedName, extractedPosition, extractedCompany, confidence, matchScore, verified}
  linkedinUrl: text("linkedin_url"), // LinkedIn profile URL (simpler verification method)
  verifiedAt: timestamp("verified_at"), // When lead was verified
  verifiedBy: varchar("verified_by").references(() => users.id), // Agent who verified the lead

  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
  
  // Soft Delete
  deletedAt: timestamp("deleted_at"), // When lead was soft deleted
  deletedById: varchar("deleted_by_id").references(() => users.id), // User who deleted the lead
}, (table) => ({
  qaStatusIdx: index("leads_qa_status_idx").on(table.qaStatus),
  campaignIdx: index("leads_campaign_idx").on(table.campaignId),
  callAttemptIdx: index("leads_call_attempt_idx").on(table.callAttemptId),
  deletedAtIdx: index("leads_deleted_at_idx").on(table.deletedAt),
}));

// Lead Tags - Colored tags for organizing leads
export const leadTags = pgTable("lead_tags", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull(),
  color: text("color").notNull().default('#6366f1'), // Default indigo color
  description: text("description"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

// Lead Tag Assignments - Junction table linking leads to tags
export const leadTagAssignments = pgTable("lead_tag_assignments", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  leadId: varchar("lead_id").notNull().references(() => leads.id, { onDelete: 'cascade' }),
  tagId: varchar("tag_id").notNull().references(() => leadTags.id, { onDelete: 'cascade' }),
  assignedById: varchar("assigned_by_id").references(() => users.id),
  assignedAt: timestamp("assigned_at").notNull().defaultNow(),
}, (table) => ({
  leadIdx: index("lead_tag_assignments_lead_idx").on(table.leadId),
  tagIdx: index("lead_tag_assignments_tag_idx").on(table.tagId),
  uniqueLeadTag: unique().on(table.leadId, table.tagId),
}));

export const leadTagsRelations = relations(leadTags, ({ many }) => ({
  assignments: many(leadTagAssignments),
}));

export const leadTagAssignmentsRelations = relations(leadTagAssignments, ({ one }) => ({
  lead: one(leads, { fields: [leadTagAssignments.leadId], references: [leads.id] }),
  tag: one(leadTags, { fields: [leadTagAssignments.tagId], references: [leadTags.id] }),
  assignedBy: one(users, { fields: [leadTagAssignments.assignedById], references: [users.id] }),
}));

// Lead Verifications - LinkedIn Screenshot or On-Call Confirmation
export const leadVerifications = pgTable("lead_verifications", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  leadId: varchar("lead_id").notNull().references(() => leads.id, { onDelete: 'cascade' }),
  
  // Verification Details
  verificationType: leadVerificationTypeEnum("verification_type").notNull(),
  verificationStatus: leadVerificationStatusEnum("verification_status").notNull().default('pending'),
  agentId: varchar("agent_id").notNull().references(() => users.id),
  
  // LinkedIn Verification Path
  screenshotUrl: text("screenshot_url"), // Presigned S3 URL for viewing
  screenshotS3Key: text("screenshot_s3_key"), // S3 key for deletion/management
  
  // AI Validation Results (for LinkedIn path)
  aiValidationResult: jsonb("ai_validation_result"), // Full AI analysis JSON from OpenAI Vision
  validationConfidence: numeric("validation_confidence", { precision: 5, scale: 2 }), // 0-100 confidence score
  extractedData: jsonb("extracted_data"), // {name, company, title} extracted by AI
  
  // On-Call Verification Path
  verifiedContactId: varchar("verified_contact_id").references(() => contacts.id), // New contact created during on-call verification
  callRecordingId: varchar("call_recording_id").references(() => callAttempts.id), // Link to call recording
  
  // QA Review
  reviewedAt: timestamp("reviewed_at"),
  reviewedById: varchar("reviewed_by_id").references(() => users.id),
  reviewNotes: text("review_notes"),
  
  // Metadata
  metadata: jsonb("metadata"), // Additional context or data
  
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (table) => ({
  leadIdx: index("lead_verifications_lead_idx").on(table.leadId),
  statusIdx: index("lead_verifications_status_idx").on(table.verificationStatus),
  agentIdx: index("lead_verifications_agent_idx").on(table.agentId),
}));

// Suppression - Email
export const suppressionEmails = pgTable("suppression_emails", {
  id: serial("id").primaryKey(),
  email: text("email").notNull().unique(),
  reason: text("reason"),
  source: text("source"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (table) => ({
  emailIdx: index("suppression_emails_idx").on(table.email),
}));

// Suppression - Phone
export const suppressionPhones = pgTable("suppression_phones", {
  id: serial("id").primaryKey(),
  phoneE164: text("phone_e164").notNull().unique(),
  reason: text("reason"),
  source: text("source"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (table) => ({
  phoneIdx: index("suppression_phones_idx").on(table.phoneE164),
}));

// ========== COMPREHENSIVE SUPPRESSION LIST ==========
// Global suppression list with advanced matching rules:
// 1. Email matches (exact, case-insensitive)
// 2. CAV ID matches
// 3. CAV User ID matches
// 4. Full Name + Company BOTH match (together)
export const suppressionList = pgTable("suppression_list", {
  id: serial("id").primaryKey(),
  email: text("email"),
  emailNorm: text("email_norm"),
  fullName: text("full_name"),
  fullNameNorm: text("full_name_norm"),
  companyName: text("company_name"),
  companyNorm: text("company_norm"),
  nameCompanyHash: text("name_company_hash"),
  cavId: text("cav_id"),
  cavUserId: text("cav_user_id"),
  reason: text("reason"),
  source: text("source"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (table) => ({
  emailNormIdx: index("suppression_list_email_norm_idx").on(table.emailNorm),
  cavIdIdx: index("suppression_list_cav_id_idx").on(table.cavId),
  cavUserIdIdx: index("suppression_list_cav_user_id_idx").on(table.cavUserId),
  nameCompanyHashIdx: index("suppression_list_name_company_hash_idx").on(table.nameCompanyHash),
}));

// ========== CAMPAIGN-LEVEL SUPPRESSION SYSTEM ==========

// Campaign Suppression - Accounts
// Suppress entire accounts (and all their contacts) from specific campaigns
export const campaignSuppressionAccounts = pgTable("campaign_suppression_accounts", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  campaignId: varchar("campaign_id").references(() => campaigns.id, { onDelete: 'cascade' }).notNull(),
  accountId: varchar("account_id").references(() => accounts.id, { onDelete: 'cascade' }).notNull(),
  reason: text("reason"),
  addedBy: varchar("added_by").references(() => users.id, { onDelete: 'set null' }),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (table) => ({
  campaignAccountIdx: index("campaign_suppression_accounts_campaign_idx").on(table.campaignId, table.accountId),
  accountIdx: index("campaign_suppression_accounts_account_idx").on(table.accountId),
  uniqueCampaignAccount: uniqueIndex("campaign_suppression_accounts_unique").on(table.campaignId, table.accountId),
}));

// Campaign Suppression - Contacts
// Suppress specific contacts from specific campaigns
export const campaignSuppressionContacts = pgTable("campaign_suppression_contacts", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  campaignId: varchar("campaign_id").references(() => campaigns.id, { onDelete: 'cascade' }).notNull(),
  contactId: varchar("contact_id").references(() => contacts.id, { onDelete: 'cascade' }).notNull(),
  reason: text("reason"),
  addedBy: varchar("added_by").references(() => users.id, { onDelete: 'set null' }),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (table) => ({
  campaignContactIdx: index("campaign_suppression_contacts_campaign_idx").on(table.campaignId, table.contactId),
  contactIdx: index("campaign_suppression_contacts_contact_idx").on(table.contactId),
  uniqueCampaignContact: uniqueIndex("campaign_suppression_contacts_unique").on(table.campaignId, table.contactId),
}));

// Campaign Suppression - Emails
// Suppress specific emails from specific campaigns (for bulk CSV upload)
export const campaignSuppressionEmails = pgTable("campaign_suppression_emails", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  campaignId: varchar("campaign_id").references(() => campaigns.id, { onDelete: 'cascade' }).notNull(),
  email: text("email").notNull(),
  emailNorm: text("email_norm").notNull(), // Normalized lowercase for matching
  reason: text("reason"),
  addedBy: varchar("added_by").references(() => users.id, { onDelete: 'set null' }),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (table) => ({
  campaignEmailIdx: index("campaign_suppression_emails_campaign_idx").on(table.campaignId),
  emailNormIdx: index("campaign_suppression_emails_norm_idx").on(table.campaignId, table.emailNorm),
  uniqueCampaignEmail: uniqueIndex("campaign_suppression_emails_unique").on(table.campaignId, table.emailNorm),
}));

// Campaign Suppression - Domains
// Suppress specific domains/companies from specific campaigns
// domain can be NULL for company-name-only suppressions (uses domainNorm for matching)
export const campaignSuppressionDomains = pgTable("campaign_suppression_domains", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  campaignId: varchar("campaign_id").references(() => campaigns.id, { onDelete: 'cascade' }).notNull(),
  domain: text("domain"), // e.g., "acme.com" or NULL for company name suppressions
  domainNorm: text("domain_norm").notNull(), // Normalized for matching (always required)
  companyName: text("company_name"), // Original company name for display
  reason: text("reason"),
  addedBy: varchar("added_by").references(() => users.id, { onDelete: 'set null' }),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (table) => ({
  campaignDomainIdx: index("campaign_suppression_domains_campaign_idx").on(table.campaignId),
  domainNormIdx: index("campaign_suppression_domains_norm_idx").on(table.campaignId, table.domainNorm),
  uniqueCampaignDomain: uniqueIndex("campaign_suppression_domains_unique").on(table.campaignId, table.domainNorm),
}));

// ========== DISPOSITION MANAGEMENT & CALL ACTIVITY SYSTEM ==========

// Dispositions - Client-defined labels mapped to system actions
export const dispositions = pgTable("dispositions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  label: text("label").notNull().unique(), // Client-facing label (e.g., "Do Not Call", "Voicemail Left")
  systemAction: dispositionSystemActionEnum("system_action").notNull(),
  params: jsonb("params"), // { retry_delay_minutes: 60, etc. }
  active: boolean("active").notNull().default(true),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
  createdBy: varchar("created_by").references(() => users.id, { onDelete: 'set null' }),
}, (table) => ({
  labelIdx: index("dispositions_label_idx").on(table.label),
  systemActionIdx: index("dispositions_system_action_idx").on(table.systemAction),
}));

// Call Jobs - Queue items for calls with scheduling
export const callJobs = pgTable("call_jobs", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  campaignId: varchar("campaign_id").references(() => campaigns.id, { onDelete: 'cascade' }).notNull(),
  contactId: varchar("contact_id").references(() => contacts.id, { onDelete: 'cascade' }).notNull(),
  accountId: varchar("account_id").references(() => accounts.id, { onDelete: 'cascade' }).notNull(),
  agentId: varchar("agent_id").references(() => users.id, { onDelete: 'set null' }),
  status: callJobStatusEnum("status").notNull().default('queued'),
  scheduledAt: timestamp("scheduled_at"),
  priority: integer("priority").notNull().default(0),
  attemptNo: integer("attempt_no").notNull().default(0),
  lockedByAgentId: varchar("locked_by_agent_id").references(() => users.id, { onDelete: 'set null' }),
  lockedAt: timestamp("locked_at"),
  removedReason: text("removed_reason"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (table) => ({
  campaignStatusIdx: index("call_jobs_campaign_status_idx").on(table.campaignId, table.status),
  contactIdx: index("call_jobs_contact_idx").on(table.contactId),
  accountIdx: index("call_jobs_account_idx").on(table.accountId),
  agentIdx: index("call_jobs_agent_idx").on(table.agentId),
  scheduledAtIdx: index("call_jobs_scheduled_at_idx").on(table.scheduledAt),
}));

// Call Sessions - Individual call attempts with Telnyx integration (unified for AI and human agents)
export const callSessions = pgTable("call_sessions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  callJobId: varchar("call_job_id").references(() => callJobs.id, { onDelete: 'cascade' }),
  telnyxCallId: text("telnyx_call_id"),
  fromNumber: text("from_number"),
  toNumberE164: text("to_number_e164").notNull(),
  startedAt: timestamp("started_at").notNull().defaultNow(),
  endedAt: timestamp("ended_at"),
  durationSec: integer("duration_sec"),
  recordingUrl: text("recording_url"),
  status: callSessionStatusEnum("status").notNull().default('connecting'),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  
  // Unified agent type tracking (human or AI)
  agentType: agentTypeEnum("agent_type").notNull().default('human'),
  agentUserId: varchar("agent_user_id").references(() => users.id, { onDelete: 'set null' }), // Human agent
  
  // AI agent metadata (populated when agentType = 'ai')
  aiAgentId: text("ai_agent_id"), // ElevenLabs agent ID
  aiConversationId: text("ai_conversation_id"), // ElevenLabs conversation ID
  aiTranscript: text("ai_transcript"), // Full conversation transcript
  aiAnalysis: jsonb("ai_analysis"), // AI-generated call analysis (outcome, summary, sentiment)
  aiDisposition: text("ai_disposition"), // AI-determined disposition label
  
  // Campaign context (for AI calls that may not have callJobId)
  campaignId: varchar("campaign_id").references(() => campaigns.id, { onDelete: 'cascade' }),
  contactId: varchar("contact_id").references(() => contacts.id, { onDelete: 'set null' }),
  queueItemId: varchar("queue_item_id"), // Reference to campaign_queue item
}, (table) => ({
  callJobIdx: index("call_sessions_call_job_idx").on(table.callJobId),
  telnyxCallIdx: index("call_sessions_telnyx_call_idx").on(table.telnyxCallId),
  statusIdx: index("call_sessions_status_idx").on(table.status),
  agentTypeIdx: index("call_sessions_agent_type_idx").on(table.agentType),
  campaignIdx: index("call_sessions_campaign_idx").on(table.campaignId),
  contactIdx: index("call_sessions_contact_idx").on(table.contactId),
  aiConversationIdx: index("call_sessions_ai_conversation_idx").on(table.aiConversationId),
}));

// Call Dispositions - Links call sessions to dispositions with notes
export const callDispositions = pgTable("call_dispositions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  callSessionId: varchar("call_session_id").references(() => callSessions.id, { onDelete: 'cascade' }).notNull(),
  dispositionId: varchar("disposition_id").references(() => dispositions.id, { onDelete: 'restrict' }).notNull(),
  notes: text("notes"),
  createdBy: varchar("created_by").references(() => users.id, { onDelete: 'set null' }).notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (table) => ({
  callSessionIdx: index("call_dispositions_call_session_idx").on(table.callSessionId),
  dispositionIdx: index("call_dispositions_disposition_idx").on(table.dispositionId),
}));

// Global DNC - Do Not Call list (platform-wide)
export const globalDnc = pgTable("global_dnc", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  contactId: varchar("contact_id").references(() => contacts.id, { onDelete: 'cascade' }),
  phoneE164: text("phone_e164"),
  source: text("source").notNull(), // agent | api | import
  reason: text("reason"),
  createdBy: varchar("created_by").references(() => users.id, { onDelete: 'set null' }),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (table) => ({
  contactIdx: index("global_dnc_contact_idx").on(table.contactId),
  phoneIdx: index("global_dnc_phone_idx").on(table.phoneE164),
  contactPhoneUniq: uniqueIndex("global_dnc_contact_phone_uniq").on(table.contactId, table.phoneE164),
}));

// Campaign Opt-Outs - Per-campaign contact suppression
export const campaignOptOuts = pgTable("campaign_opt_outs", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  campaignId: varchar("campaign_id").references(() => campaigns.id, { onDelete: 'cascade' }).notNull(),
  contactId: varchar("contact_id").references(() => contacts.id, { onDelete: 'cascade' }).notNull(),
  reason: text("reason"),
  createdBy: varchar("created_by").references(() => users.id, { onDelete: 'set null' }),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (table) => ({
  campaignContactUniq: uniqueIndex("campaign_opt_outs_campaign_contact_uniq").on(table.campaignId, table.contactId),
  campaignIdx: index("campaign_opt_outs_campaign_idx").on(table.campaignId),
  contactIdx: index("campaign_opt_outs_contact_idx").on(table.contactId),
}));

// Activity Log - Event store for audit trail and timelines
export const activityLog = pgTable("activity_log", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  entityType: activityEntityTypeEnum("entity_type").notNull(),
  entityId: varchar("entity_id").notNull(),
  eventType: activityEventTypeEnum("event_type").notNull(),
  payload: jsonb("payload"), // Rich event data
  createdBy: varchar("created_by").references(() => users.id, { onDelete: 'set null' }),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (table) => ({
  entityIdx: index("activity_log_entity_idx").on(table.entityType, table.entityId),
  eventTypeIdx: index("activity_log_event_type_idx").on(table.eventType),
  createdAtIdx: index("activity_log_created_at_idx").on(table.createdAt),
}));

// Business Hours Config - Timezone-based calling hours
export const businessHoursConfig = pgTable("business_hours_config", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  timezone: text("timezone").notNull(), // IANA timezone
  dayOfWeek: integer("day_of_week").notNull(), // 0-6 (Sunday-Saturday)
  startTime: text("start_time").notNull(), // HH:MM format
  endTime: text("end_time").notNull(), // HH:MM format
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (table) => ({
  timezoneIdx: index("business_hours_config_timezone_idx").on(table.timezone),
  timezoneDayUniq: uniqueIndex("business_hours_config_timezone_day_uniq").on(table.timezone, table.dayOfWeek),
}));

// ========== END DISPOSITION MANAGEMENT SYSTEM ==========

// Campaign Orders (Client Portal)
export const campaignOrders = pgTable("campaign_orders", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  clientUserId: varchar("client_user_id").references(() => users.id).notNull(),
  orderNumber: text("order_number").notNull().unique(),
  type: campaignTypeEnum("type").notNull(),
  status: orderStatusEnum("status").notNull().default('draft'),
  leadGoal: integer("lead_goal"),
  pacingConfig: jsonb("pacing_config"),
  qualificationCriteriaJson: jsonb("qualification_criteria_json"),
  complianceConfirmed: boolean("compliance_confirmed").default(false),
  
  // Lead Delivery Configuration
  webhookUrl: text("webhook_url"), // URL to POST approved leads to
  deliveryConfig: jsonb("delivery_config"), // { method: 'webhook' | 'email' | 'sftp', format: 'json' | 'csv', auth: {...} }
  
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
  submittedAt: timestamp("submitted_at"),
}, (table) => ({
  clientIdx: index("campaign_orders_client_idx").on(table.clientUserId),
  statusIdx: index("campaign_orders_status_idx").on(table.status),
}));

// Order Audience Snapshots
export const orderAudienceSnapshots = pgTable("order_audience_snapshots", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  orderId: varchar("order_id").references(() => campaignOrders.id, { onDelete: 'cascade' }).notNull(),
  audienceDefinitionJson: jsonb("audience_definition_json").notNull(),
  contactCount: integer("contact_count"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

// Order Assets
export const orderAssets = pgTable("order_assets", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  orderId: varchar("order_id").references(() => campaignOrders.id, { onDelete: 'cascade' }).notNull(),
  assetType: text("asset_type").notNull(),
  fileUrl: text("file_url").notNull(),
  fileName: text("file_name").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

// Order Qualification Questions
export const orderQualificationQuestions = pgTable("order_qualification_questions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  orderId: varchar("order_id").references(() => campaignOrders.id, { onDelete: 'cascade' }).notNull(),
  questionText: text("question_text").notNull(),
  questionType: text("question_type").notNull(),
  optionsJson: jsonb("options_json"),
  required: boolean("required").default(false),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

// Order Campaign Links (Bridge Model - Manual Linking)
export const orderCampaignLinks = pgTable("order_campaign_links", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  orderId: varchar("order_id").references(() => campaignOrders.id, { onDelete: 'cascade' }).notNull(),
  campaignId: varchar("campaign_id").references(() => campaigns.id, { onDelete: 'cascade' }).notNull(),
  linkedById: varchar("linked_by_id").references(() => users.id).notNull(),
  linkedAt: timestamp("linked_at").notNull().defaultNow(),
}, (table) => ({
  orderIdx: index("order_campaign_links_order_idx").on(table.orderId),
  campaignIdx: index("order_campaign_links_campaign_idx").on(table.campaignId),
}));

// Campaign Audience Snapshots
export const campaignAudienceSnapshots = pgTable("campaign_audience_snapshots", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  campaignId: varchar("campaign_id").references(() => campaigns.id, { onDelete: 'cascade' }).notNull(),
  audienceDefinition: jsonb("audience_definition").notNull(),
  contactIds: text("contact_ids").array(),
  accountIds: text("account_ids").array(),
  contactCount: integer("contact_count").default(0),
  accountCount: integer("account_count").default(0),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (table) => ({
  campaignIdx: index("campaign_audience_snapshots_campaign_idx").on(table.campaignId),
}));

// Sender Profiles (Enhanced for Phase 26)
export const senderProfiles = pgTable("sender_profiles", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull(), // e.g., "Pivotal — Marketing"
  brandId: varchar("brand_id"),
  fromName: text("from_name").notNull(),
  fromEmail: text("from_email").notNull(),
  replyTo: text("reply_to"),
  replyToEmail: text("reply_to_email"), // backward compatibility
  dkimDomain: text("dkim_domain"),
  trackingDomain: text("tracking_domain"),
  trackingDomainId: integer("tracking_domain_id"), // FK to tracking_domains
  espAdapter: text("esp_adapter").default('sendgrid'), // 'ses', 'sendgrid', 'mailgun'
  ipPoolId: integer("ip_pool_id"), // FK to ip_pools; null = shared
  defaultThrottleTps: integer("default_throttle_tps").default(10),
  dailyCap: integer("daily_cap"),
  signatureHtml: text("signature_html"),
  isActive: boolean("is_active").default(true),
  status: text("status").default('active'), // 'active' or 'suspended'
  // Phase 26: Email Infrastructure fields
  isDefault: boolean("is_default").default(false),
  espProvider: text("esp_provider"), // 'sendgrid', 'ses', 'mailgun'
  domainAuthId: integer("domain_auth_id"), // FK to domain_auth
  isVerified: boolean("is_verified"),
  reputationScore: integer("reputation_score"), // 0-100
  warmupStatus: text("warmup_status"), // 'not_started', 'in_progress', 'completed', 'paused'
  createdBy: varchar("created_by"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

// Email Templates - Unified template system for campaigns and sequences
export const emailTemplates = pgTable("email_templates", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull(),
  description: text("description"),
  subject: text("subject").notNull(),
  htmlContent: text("html_content").notNull(),
  plainTextContent: text("plain_text_content"), // Fallback for plain text email clients
  placeholders: text("placeholders").array(),

  // Organization
  category: varchar("category", { length: 100 }), // e.g., "Sales", "Marketing", "Follow-up"
  isActive: boolean("is_active").default(true).notNull(),

  // Campaign approval workflow (for traditional campaigns)
  version: integer("version").default(1),
  isApproved: boolean("is_approved").default(false),
  approvedById: varchar("approved_by_id").references(() => users.id),
  approvedAt: timestamp("approved_at"),

  // Ownership
  createdBy: varchar("created_by").references(() => users.id),

  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (table) => ({
  categoryIdx: index("email_templates_category_idx").on(table.category),
  activeIdx: index("email_templates_active_idx").on(table.isActive),
  createdByIdx: index("email_templates_created_by_idx").on(table.createdBy),
}));

// Email Sends
export const emailSends = pgTable("email_sends", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  campaignId: varchar("campaign_id").references(() => campaigns.id, { onDelete: 'cascade' }).notNull(),
  contactId: varchar("contact_id").references(() => contacts.id, { onDelete: 'cascade' }).notNull(),
  templateId: varchar("template_id").references(() => emailTemplates.id),
  senderProfileId: varchar("sender_profile_id").references(() => senderProfiles.id),
  providerMessageId: text("provider_message_id"),
  provider: text("provider"),
  status: text("status").notNull().default('pending'),
  sendAt: timestamp("send_at"),
  sentAt: timestamp("sent_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (table) => ({
  campaignIdx: index("email_sends_campaign_idx").on(table.campaignId),
  contactIdx: index("email_sends_contact_idx").on(table.contactId),
  statusIdx: index("email_sends_status_idx").on(table.status),
}));

// Email Events - Enhanced with campaign and contact tracking
export const emailEvents = pgTable("email_events", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  sendId: varchar("send_id").references(() => emailSends.id, { onDelete: 'cascade' }),
  campaignId: varchar("campaign_id").references(() => campaigns.id, { onDelete: 'cascade' }),
  contactId: varchar("contact_id").references(() => contacts.id, { onDelete: 'cascade' }),
  messageId: text("message_id"), // Mailgun message ID
  recipient: text("recipient").notNull(), // Email address
  type: text("type").notNull(), // delivered, opened, clicked, bounced, complained, unsubscribed
  bounceType: text("bounce_type"), // 'soft' or 'hard'
  metadata: jsonb("metadata"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (table) => ({
  sendIdx: index("email_events_send_idx").on(table.sendId),
  campaignIdx: index("email_events_campaign_idx").on(table.campaignId),
  contactIdx: index("email_events_contact_idx").on(table.contactId),
  typeIdx: index("email_events_type_idx").on(table.type),
  recipientIdx: index("email_events_recipient_idx").on(table.recipient),
  createdAtIdx: index("email_events_created_at_idx").on(table.createdAt),
}));

// Email Suppression List - Global suppression for bounced/unsubscribed contacts
export const emailSuppressionList = pgTable("email_suppression_list", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  email: text("email").notNull(),
  emailNormalized: text("email_normalized").notNull(),
  reason: emailSuppressionReasonEnum("reason").notNull(),
  campaignId: varchar("campaign_id").references(() => campaigns.id, { onDelete: 'set null' }),
  contactId: varchar("contact_id").references(() => contacts.id, { onDelete: 'set null' }),
  metadata: jsonb("metadata"),
  addedAt: timestamp("added_at").notNull().defaultNow(),
}, (table) => ({
  emailIdx: uniqueIndex("email_suppression_email_unique_idx").on(table.emailNormalized),
  reasonIdx: index("email_suppression_reason_idx").on(table.reason),
  campaignIdx: index("email_suppression_campaign_idx").on(table.campaignId),
}));

// Call Scripts
export const callScripts = pgTable("call_scripts", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  campaignId: varchar("campaign_id").references(() => campaigns.id, { onDelete: 'cascade' }),
  name: text("name").notNull(),
  content: text("content").notNull(),
  version: integer("version").default(1),
  changelog: text("changelog"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

// Call Attempts
export const callAttempts = pgTable("call_attempts", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  campaignId: varchar("campaign_id").references(() => campaigns.id, { onDelete: 'cascade' }).notNull(),
  contactId: varchar("contact_id").references(() => contacts.id, { onDelete: 'cascade' }).notNull(),
  agentId: varchar("agent_id").references(() => users.id).notNull(),
  telnyxCallId: text("telnyx_call_id"),
  recordingUrl: text("recording_url"),
  disposition: callDispositionEnum("disposition"),
  startedAt: timestamp("started_at"),
  endedAt: timestamp("ended_at"),
  duration: integer("duration"),
  notes: text("notes"),
  
  // Wrong Person Answered Tracking
  originalContactId: varchar("original_contact_id").references(() => contacts.id), // Contact that was dialed
  actualContactId: varchar("actual_contact_id").references(() => contacts.id), // Contact who actually answered
  wrongPersonAnswered: boolean("wrong_person_answered").default(false), // Flag if different person answered

  // AMD/Voicemail Tracking
  amdResult: amdResultEnum("amd_result"), // human | machine | unknown
  amdConfidence: numeric("amd_confidence", { precision: 3, scale: 2 }), // 0.00 - 1.00
  vmAssetId: varchar("vm_asset_id").references(() => voicemailAssets.id), // Voicemail asset used
  vmDelivered: boolean("vm_delivered").default(false), // Was VM successfully delivered
  vmDurationSec: integer("vm_duration_sec"), // Duration of voicemail played

  // Phase 27: Telephony enhancements
  wrapupSeconds: integer("wrapup_seconds"), // Time spent in wrap-up state
  scriptVersionId: varchar("script_version_id"), // FK to call_scripts (version tracking)
  qaLocked: boolean("qa_locked").default(false), // Prevents editing after QA review
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (table) => ({
  campaignIdx: index("call_attempts_campaign_idx").on(table.campaignId),
  contactIdx: index("call_attempts_contact_idx").on(table.contactId),
  agentIdx: index("call_attempts_agent_idx").on(table.agentId),
  amdResultIdx: index("call_attempts_amd_result_idx").on(table.amdResult),
  vmAssetIdx: index("call_attempts_vm_asset_idx").on(table.vmAssetId),
}));

// Call Events
export const callEvents = pgTable("call_events", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  attemptId: varchar("attempt_id").references(() => callAttempts.id, { onDelete: 'cascade' }).notNull(),
  type: text("type").notNull(),
  metadata: jsonb("metadata"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (table) => ({
  attemptIdx: index("call_events_attempt_idx").on(table.attemptId),
  typeIdx: index("call_events_type_idx").on(table.type),
}));

// ==================== PHASE 27: TELEPHONY - SOFTPHONE & COMPLIANCE ====================

// Softphone Profile - Per-agent audio device preferences
export const softphoneProfiles = pgTable("softphone_profiles", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").references(() => users.id, { onDelete: 'cascade' }).notNull().unique(),
  micDeviceId: text("mic_device_id"), // Browser audio input device ID
  speakerDeviceId: text("speaker_device_id"), // Browser audio output device ID
  lastTestAt: timestamp("last_test_at"), // Last time agent ran device test
  testResultsJson: jsonb("test_results_json"), // { micLevel: 85, latency: 45, mos: 4.2 }
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (table) => ({
  userIdx: index("softphone_profiles_user_idx").on(table.userId),
}));

// SIP Trunk Configuration - Telnyx WebRTC connection credentials
export const sipTrunkConfigs = pgTable("sip_trunk_configs", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull(), // Friendly name for this SIP connection
  provider: text("provider").notNull().default('telnyx'), // 'telnyx', 'twilio', etc.
  sipUsername: text("sip_username").notNull(), // SIP username for WebRTC authentication
  sipPassword: text("sip_password").notNull(), // SIP password (encrypted in production)
  sipDomain: text("sip_domain").notNull().default('sip.telnyx.com'), // SIP domain/proxy
  connectionId: text("connection_id"), // Telnyx connection ID (optional)
  outboundVoiceProfileId: text("outbound_voice_profile_id"), // For outbound calls
  callerIdNumber: text("caller_id_number"), // Phone number to use as caller ID
  isActive: boolean("is_active").default(true), // Enable/disable this trunk
  isDefault: boolean("is_default").default(false), // Default trunk for agents
  createdById: varchar("created_by_id").references(() => users.id),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (table) => ({
  activeIdx: index("sip_trunk_configs_active_idx").on(table.isActive),
  defaultIdx: index("sip_trunk_configs_default_idx").on(table.isDefault),
}));

// Call Recording Access Log - Audit trail for QA/Admin playback & downloads
export const callRecordingAccessLogs = pgTable("call_recording_access_logs", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  callAttemptId: varchar("call_attempt_id").references(() => callAttempts.id, { onDelete: 'cascade' }).notNull(),
  userId: varchar("user_id").references(() => users.id).notNull(),
  action: text("action").notNull(), // 'play' or 'download'
  ipAddress: text("ip_address"),
  userAgent: text("user_agent"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (table) => ({
  attemptIdx: index("call_recording_access_logs_attempt_idx").on(table.callAttemptId),
  userIdx: index("call_recording_access_logs_user_idx").on(table.userId),
  actionIdx: index("call_recording_access_logs_action_idx").on(table.action),
}));

// Qualification Responses
export const qualificationResponses = pgTable("qualification_responses", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  attemptId: varchar("attempt_id").references(() => callAttempts.id, { onDelete: 'cascade' }),
  leadId: varchar("lead_id").references(() => leads.id, { onDelete: 'cascade' }),
  schemaVersion: text("schema_version"),
  answersJson: jsonb("answers_json").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (table) => ({
  attemptIdx: index("qualification_responses_attempt_idx").on(table.attemptId),
  leadIdx: index("qualification_responses_lead_idx").on(table.leadId),
}));

// ==================== AUTO-DIALER & AGENT STATUS ====================

// Agent Status - Real-time agent availability for auto-dialer
export const agentStatus = pgTable("agent_status", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  agentId: varchar("agent_id").references(() => users.id, { onDelete: 'cascade' }).notNull().unique(),
  status: agentStatusEnum("status").notNull().default('offline'),
  campaignId: varchar("campaign_id").references(() => campaigns.id, { onDelete: 'set null' }),
  currentCallId: varchar("current_call_id").references(() => callSessions.id, { onDelete: 'set null' }),
  lastStatusChangeAt: timestamp("last_status_change_at").notNull().defaultNow(),
  lastCallEndedAt: timestamp("last_call_ended_at"),
  totalCallsToday: integer("total_calls_today").default(0),
  totalTalkTimeToday: integer("total_talk_time_today").default(0), // seconds
  breakReason: text("break_reason"), // Optional reason for break
  statusMetadata: jsonb("status_metadata"), // Additional context
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (table) => ({
  agentIdx: uniqueIndex("agent_status_agent_idx").on(table.agentId),
  statusIdx: index("agent_status_status_idx").on(table.status),
  campaignIdx: index("agent_status_campaign_idx").on(table.campaignId),
}));

// Auto-Dialer Queue - Active dialing campaigns with settings
export const autoDialerQueues = pgTable("auto_dialer_queues", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  campaignId: varchar("campaign_id").references(() => campaigns.id, { onDelete: 'cascade' }).notNull().unique(),
  isActive: boolean("is_active").notNull().default(false),
  dialingMode: varchar("dialing_mode").notNull().default('progressive'), // 'progressive', 'predictive', 'preview'
  maxConcurrentCalls: integer("max_concurrent_calls").default(1),
  maxConcurrentPerAgent: integer("max_concurrent_per_agent").default(1), // Max channels per agent
  dialRatio: numeric("dial_ratio").default('1.0'),
  ringTimeoutSec: integer("ring_timeout_sec").default(30),
  abandonRateTargetPct: numeric("abandon_rate_target_pct").default('3.0'), // Target abandon rate %

  // AMD/Voicemail Configuration
  amdEnabled: boolean("amd_enabled").default(false),
  amdConfidenceThreshold: numeric("amd_confidence_threshold").default('0.75'), // 0.0 - 1.0
  amdDecisionTimeoutMs: integer("amd_decision_timeout_ms").default(2500), // 1500-3500ms
  amdUncertainFallback: varchar("amd_uncertain_fallback").default('route_as_human'), // 'route_as_human' | 'voicemail_policy'

  // Voicemail Policy
  vmAction: voicemailActionEnum("vm_action").default('drop_silent'), // leave_voicemail | schedule_callback | drop_silent
  vmAssetId: varchar("vm_asset_id").references(() => voicemailAssets.id),
  vmMaxPerContact: integer("vm_max_per_contact").default(1),
  vmCooldownHours: integer("vm_cooldown_hours").default(72),
  vmDailyCampaignCap: integer("vm_daily_campaign_cap"),
  vmLocalTimeWindow: jsonb("vm_local_time_window"), // { start_hhmm: '09:00', end_hhmm: '17:00' }
  vmRestrictedRegionBlock: boolean("vm_restricted_region_block").default(false),

  checkDnc: boolean("check_dnc").default(true),
  priorityMode: varchar("priority_mode").default('fifo'),
  pacingStrategy: varchar("pacing_strategy").default('agent_based'),
  distributionStrategy: varchar("distribution_strategy").default('round_robin'), // round_robin | least_recently_served | skill_based
  targetAgentOccupancy: numeric("target_agent_occupancy").default('0.85'),

  // Retry & Quiet Hours
  retryRules: jsonb("retry_rules"),
  quietHours: jsonb("quiet_hours"),
  maxDailyAttemptsPerContact: integer("max_daily_attempts_per_contact").default(3),

  metadata: jsonb("metadata"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (table) => ({
  campaignIdx: uniqueIndex("auto_dialer_queues_campaign_idx").on(table.campaignId),
  activeIdx: index("auto_dialer_queues_active_idx").on(table.isActive),
  vmAssetIdx: index("auto_dialer_queues_vm_asset_idx").on(table.vmAssetId),
}));

// Bulk Imports
export const bulkImports = pgTable("bulk_imports", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  fileName: text("file_name").notNull(),
  fileUrl: text("file_url"),
  status: text("status").notNull().default('processing'),
  totalRows: integer("total_rows"),
  successRows: integer("success_rows").default(0),
  errorRows: integer("error_rows").default(0),
  errorFileUrl: text("error_file_url"),
  uploadedById: varchar("uploaded_by_id").references(() => users.id),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  completedAt: timestamp("completed_at"),
}, (table) => ({
  statusIdx: index("bulk_imports_status_idx").on(table.status),
}));

// Audit Logs
export const auditLogs = pgTable("audit_logs", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").references(() => users.id),
  action: text("action").notNull(),
  entityType: text("entity_type").notNull(),
  entityId: varchar("entity_id").notNull(),
  changesJson: jsonb("changes_json"),
  ipAddress: text("ip_address"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (table) => ({
  userIdx: index("audit_logs_user_idx").on(table.userId),
  entityIdx: index("audit_logs_entity_idx").on(table.entityType, table.entityId),
  createdAtIdx: index("audit_logs_created_at_idx").on(table.createdAt),
}));

// Saved Filters
export const savedFilters = pgTable("saved_filters", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").references(() => users.id, { onDelete: 'cascade' }).notNull(),
  name: text("name").notNull(),
  description: text("description"),
  entityType: text("entity_type").notNull(),
  filterGroup: jsonb("filter_group").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (table) => ({
  userIdx: index("saved_filters_user_idx").on(table.userId),
  entityTypeIdx: index("saved_filters_entity_type_idx").on(table.entityType),
}));

// Selection Contexts for bulk operations
export const selectionContexts = pgTable("selection_contexts", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").references(() => users.id, { onDelete: 'cascade' }).notNull(),
  entityType: entityTypeEnum("entity_type").notNull(),
  selectionType: selectionTypeEnum("selection_type").notNull(), // 'explicit' or 'filtered'
  ids: text("ids").array(), // For explicit selections (≤10k records)
  filterGroup: jsonb("filter_group"), // For filtered selections (all matching)
  totalCount: integer("total_count").notNull(), // Total records in selection
  createdAt: timestamp("created_at").notNull().defaultNow(),
  expiresAt: timestamp("expires_at").notNull(), // 15 min from creation
}, (table) => ({
  userIdx: index("selection_contexts_user_idx").on(table.userId),
  expiresIdx: index("selection_contexts_expires_idx").on(table.expiresAt),
}));

// Filter Field Registry - Dynamic field definitions for scalable filtering
export const filterFieldRegistry = pgTable("filter_field_registry", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  entity: text("entity").notNull(), // 'contact', 'account', 'campaign', etc.
  key: text("key").notNull(), // Field key in database (e.g., 'linkedin_url', 'job_title')
  label: text("label").notNull(), // Display name (e.g., 'LinkedIn Profile URL')
  type: text("type").notNull(), // 'string', 'number', 'boolean', 'array', 'date'
  operators: text("operators").array().notNull(), // Allowed operators for this field type
  category: filterFieldCategoryEnum("category").notNull(), // Categorization for UI grouping
  isCustom: boolean("is_custom").notNull().default(false), // Custom vs. system field
  visibleInFilters: boolean("visible_in_filters").notNull().default(true), // Show in filter UI
  description: text("description"), // Helper text for users
  sortOrder: integer("sort_order").default(0), // Display order within category
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (table) => ({
  entityKeyIdx: index("filter_field_registry_entity_key_idx").on(table.entity, table.key),
  categoryIdx: index("filter_field_registry_category_idx").on(table.category),
  visibleIdx: index("filter_field_registry_visible_idx").on(table.visibleInFilters),
}));

// Relations
export const usersRelations = relations(users, ({ many }) => ({
  ownedAccounts: many(accounts),
  ownedContacts: many(contacts),
  campaignOrders: many(campaignOrders),
  auditLogs: many(auditLogs),
  savedFilters: many(savedFilters),
  selectionContexts: many(selectionContexts),
}));

export const accountsRelations = relations(accounts, ({ one, many }) => ({
  owner: one(users, { fields: [accounts.ownerId], references: [users.id] }),
  contacts: many(contacts),
}));

export const contactsRelations = relations(contacts, ({ one, many }) => ({
  account: one(accounts, { fields: [contacts.accountId], references: [accounts.id] }),
  owner: one(users, { fields: [contacts.ownerId], references: [users.id] }),
  leads: many(leads),
  emailMessages: many(emailMessages),
  calls: many(calls),
}));

export const campaignsRelations = relations(campaigns, ({ one, many }) => ({
  owner: one(users, { fields: [campaigns.ownerId], references: [users.id] }),
  emailMessages: many(emailMessages),
  calls: many(calls),
  leads: many(leads),
  orderLinks: many(orderCampaignLinks),
}));

export const leadsRelations = relations(leads, ({ one }) => ({
  contact: one(contacts, { fields: [leads.contactId], references: [contacts.id] }),
  campaign: one(campaigns, { fields: [leads.campaignId], references: [campaigns.id] }),
  callAttempt: one(callAttempts, { fields: [leads.callAttemptId], references: [callAttempts.id] }),
  agent: one(users, { fields: [leads.agentId], references: [users.id] }),
  approvedBy: one(users, { fields: [leads.approvedById], references: [users.id] }),
  rejectedBy: one(users, { fields: [leads.rejectedById], references: [users.id] }),
  verification: one(leadVerifications, { fields: [leads.verificationId], references: [leadVerifications.id] }),
}));

export const leadVerificationsRelations = relations(leadVerifications, ({ one }) => ({
  lead: one(leads, { fields: [leadVerifications.leadId], references: [leads.id] }),
  agent: one(users, { fields: [leadVerifications.agentId], references: [users.id] }),
  reviewedBy: one(users, { fields: [leadVerifications.reviewedById], references: [users.id] }),
  verifiedContact: one(contacts, { fields: [leadVerifications.verifiedContactId], references: [contacts.id] }),
  callRecording: one(callAttempts, { fields: [leadVerifications.callRecordingId], references: [callAttempts.id] }),
}));

export const campaignOrdersRelations = relations(campaignOrders, ({ one, many }) => ({
  client: one(users, { fields: [campaignOrders.clientUserId], references: [users.id] }),
  audienceSnapshots: many(orderAudienceSnapshots),
  assets: many(orderAssets),
  qualificationQuestions: many(orderQualificationQuestions),
  campaignLinks: many(orderCampaignLinks),
}));

export const savedFiltersRelations = relations(savedFilters, ({ one }) => ({
  user: one(users, { fields: [savedFilters.userId], references: [users.id] }),
}));

export const selectionContextsRelations = relations(selectionContexts, ({ one }) => ({
  user: one(users, { fields: [selectionContexts.userId], references: [users.id] }),
}));

// Insert Schemas
export const insertUserSchema = createInsertSchema(users).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertUserRoleSchema = createInsertSchema(userRoles).omit({
  id: true,
  assignedAt: true,
});

export const insertCustomFieldDefinitionSchema = createInsertSchema(customFieldDefinitions).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const updateCustomFieldDefinitionSchema = insertCustomFieldDefinitionSchema.partial().extend({
  // Prevent changing entity type after creation
  entityType: z.never().optional(),
});

export const insertAccountSchema = createInsertSchema(accounts).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

// Industry update schemas (Phase 8: Dual-Industry Strategy)
export const updateAccountIndustrySchema = z.object({
  primary: z.string().optional(),
  secondary: z.array(z.string()).optional(),
  code: z.string().optional(),
});

export const reviewAccountIndustryAISchema = z.object({
  accept_primary: z.string().optional(),
  add_secondary: z.array(z.string()).optional(),
  reject: z.array(z.string()).optional(),
});

export const insertContactSchema = createInsertSchema(contacts).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
}).extend({
  mobilePhone: z.string().optional(),
});

export const insertSegmentSchema = createInsertSchema(segments).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
  recordCountCache: true,
  lastRefreshedAt: true,
});

export const insertListSchema = createInsertSchema(lists).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
  snapshotTs: true,
});

export const insertDomainSetSchema = createInsertSchema(domainSets).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertDomainSetItemSchema = createInsertSchema(domainSetItems).omit({
  id: true,
  createdAt: true,
});

export const insertDomainSetContactLinkSchema = createInsertSchema(domainSetContactLinks).omit({
  id: true,
  createdAt: true,
});

export const insertCampaignSchema = createInsertSchema(campaigns).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
  launchedAt: true,
});

export const insertCampaignAgentAssignmentSchema = createInsertSchema(campaignAgentAssignments).omit({
  id: true,
  assignedAt: true,
  releasedAt: true,
});

export const insertCampaignQueueSchema = createInsertSchema(campaignQueue).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertCampaignAccountStatsSchema = createInsertSchema(campaignAccountStats).omit({
  lastEnforcedAt: true,
});

export const insertCampaignAudienceSnapshotSchema = createInsertSchema(campaignAudienceSnapshots).omit({
  id: true,
  createdAt: true,
});

export const insertSenderProfileSchema = createInsertSchema(senderProfiles).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertEmailTemplateSchema = createInsertSchema(emailTemplates).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
  approvedAt: true,
});

export const insertEmailSendSchema = createInsertSchema(emailSends).omit({
  id: true,
  createdAt: true,
  sentAt: true,
});

export const insertEmailEventSchema = createInsertSchema(emailEvents).omit({
  id: true,
  createdAt: true,
});

export const insertCallScriptSchema = createInsertSchema(callScripts).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertCallAttemptSchema = createInsertSchema(callAttempts).omit({
  id: true,
  createdAt: true,
});

export const insertCallEventSchema = createInsertSchema(callEvents).omit({
  id: true,
  createdAt: true,
});

export const insertSoftphoneProfileSchema = createInsertSchema(softphoneProfiles).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertSipTrunkConfigSchema = createInsertSchema(sipTrunkConfigs).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertCallRecordingAccessLogSchema = createInsertSchema(callRecordingAccessLogs).omit({
  id: true,
  createdAt: true,
});

export const insertQualificationResponseSchema = createInsertSchema(qualificationResponses).omit({
  id: true,
  createdAt: true,
});

export const insertEmailMessageSchema = createInsertSchema(emailMessages).omit({
  id: true,
  createdAt: true,
});

export const insertCallSchema = createInsertSchema(calls).omit({
  id: true,
  createdAt: true,
});

export const insertLeadSchema = createInsertSchema(leads).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertLeadVerificationSchema = createInsertSchema(leadVerifications).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertLeadVerification = z.infer<typeof insertLeadVerificationSchema>;
export type SelectLeadVerification = typeof leadVerifications.$inferSelect;

export const insertSuppressionEmailSchema = createInsertSchema(suppressionEmails).omit({
  id: true,
  createdAt: true,
});

export const insertSuppressionPhoneSchema = createInsertSchema(suppressionPhones).omit({
  id: true,
  createdAt: true,
});

export const insertSuppressionListSchema = createInsertSchema(suppressionList).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertCampaignSuppressionAccountSchema = createInsertSchema(campaignSuppressionAccounts).omit({
  id: true,
  createdAt: true,
});

export const insertCampaignSuppressionContactSchema = createInsertSchema(campaignSuppressionContacts).omit({
  id: true,
  createdAt: true,
});

export const insertCampaignSuppressionEmailSchema = createInsertSchema(campaignSuppressionEmails).omit({
  id: true,
  createdAt: true,
});

export const insertCampaignSuppressionDomainSchema = createInsertSchema(campaignSuppressionDomains).omit({
  id: true,
  createdAt: true,
});

export const insertCampaignOrderSchema = createInsertSchema(campaignOrders).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertOrderAudienceSnapshotSchema = createInsertSchema(orderAudienceSnapshots).omit({
  id: true,
  createdAt: true,
});

export const insertOrderAssetSchema = createInsertSchema(orderAssets).omit({
  id: true,
  createdAt: true,
});

export const insertOrderQualificationQuestionSchema = createInsertSchema(orderQualificationQuestions).omit({
  id: true,
});

export const insertOrderCampaignLinkSchema = createInsertSchema(orderCampaignLinks).omit({
  id: true,
  linkedAt: true,
});

const bulkImportInsertOmit = {
  id: true,
  createdAt: true,
} satisfies Partial<Record<keyof typeof bulkImports.$inferInsert, true>>;

export const insertBulkImportSchema = createInsertSchema(bulkImports).omit(bulkImportInsertOmit);

export const insertAuditLogSchema = createInsertSchema(auditLogs).omit({
  id: true,
  createdAt: true,
});

export const insertActivityLogSchema = createInsertSchema(activityLog).omit({
  id: true,
  createdAt: true,
});

export const insertSavedFilterSchema = createInsertSchema(savedFilters).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

const selectionContextInsertOmit = {
  id: true,
  createdAt: true,
  expiresAt: true,
} satisfies Partial<Record<keyof typeof selectionContexts.$inferInsert, true>>;

export const insertSelectionContextSchema = createInsertSchema(selectionContexts).omit(selectionContextInsertOmit);

export const insertFilterFieldSchema = createInsertSchema(filterFieldRegistry).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertContactEmailSchema = createInsertSchema(contactEmails).omit({
  id: true,
  createdAt: true,
});

export const insertAccountDomainSchema = createInsertSchema(accountDomains).omit({
  id: true,
  createdAt: true,
});

export const insertFieldChangeLogSchema = createInsertSchema(fieldChangeLog).omit({
  id: true,
  createdAt: true,
});

export const insertDedupeReviewQueueSchema = createInsertSchema(dedupeReviewQueue).omit({
  id: true,
  createdAt: true,
});

export const insertIndustryReferenceSchema = createInsertSchema(industryReference).omit({
  id: true,
});

export const insertCompanySizeReferenceSchema = createInsertSchema(companySizeReference).omit({
  id: true,
});

export const insertRevenueRangeReferenceSchema = createInsertSchema(revenueRangeReference).omit({
  id: true,
});

export const insertSeniorityLevelReferenceSchema = createInsertSchema(seniorityLevelReference).omit({
  id: true,
});

export const insertJobFunctionReferenceSchema = createInsertSchema(jobFunctionReference).omit({
  id: true,
});

export const insertDepartmentReferenceSchema = createInsertSchema(departmentReference).omit({
  id: true,
});

export const insertTechnologyReferenceSchema = createInsertSchema(technologyReference).omit({
  id: true,
});

export const insertCountryReferenceSchema = createInsertSchema(countryReference).omit({
  id: true,
});

export const insertStateReferenceSchema = createInsertSchema(stateReference).omit({
  id: true,
});

export const insertCityReferenceSchema = createInsertSchema(cityReference).omit({
  id: true,
});

// Lead Tag types
export type LeadTag = typeof leadTags.$inferSelect;
export type InsertLeadTag = typeof leadTags.$inferInsert;
export type LeadTagAssignment = typeof leadTagAssignments.$inferSelect;
export type InsertLeadTagAssignment = typeof leadTagAssignments.$inferInsert;

export type Lead = typeof leads.$inferSelect;
export type InsertLead = typeof leads.$inferInsert;

// Core table type exports (select/insert)
export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;
export type UserRole = typeof userRoles.$inferSelect;
export type InsertUserRole = typeof userRoles.$inferInsert;

export type Account = typeof accounts.$inferSelect;
export type InsertAccount = typeof accounts.$inferInsert;

export type Contact = typeof contacts.$inferSelect;
export type InsertContact = typeof contacts.$inferInsert;

export type Campaign = typeof campaigns.$inferSelect;
export type InsertCampaign = typeof campaigns.$inferInsert;

export type CampaignAgentAssignment = typeof campaignAgentAssignments.$inferSelect;
export type InsertCampaignAgentAssignment = typeof campaignAgentAssignments.$inferInsert;

export type Segment = typeof segments.$inferSelect;
export type InsertSegment = typeof segments.$inferInsert;

export type List = typeof lists.$inferSelect;
export type InsertList = typeof lists.$inferInsert;

export type DomainSet = typeof domainSets.$inferSelect;
export type InsertDomainSet = typeof domainSets.$inferInsert;

export type DomainSetItem = typeof domainSetItems.$inferSelect;
export type InsertDomainSetItem = typeof domainSetItems.$inferInsert;

export type DomainSetContactLink = typeof domainSetContactLinks.$inferSelect;
export type InsertDomainSetContactLink = typeof domainSetContactLinks.$inferInsert;

export type EmailMessage = typeof emailMessages.$inferSelect;
export type InsertEmailMessage = typeof emailMessages.$inferInsert;

export type Call = typeof calls.$inferSelect;
export type InsertCall = typeof calls.$inferInsert;

export type CampaignAudienceSnapshot = typeof campaignAudienceSnapshots.$inferSelect;
export type InsertCampaignAudienceSnapshot = typeof campaignAudienceSnapshots.$inferInsert;

export type SenderProfile = typeof senderProfiles.$inferSelect;
export type InsertSenderProfile = typeof senderProfiles.$inferInsert;

export type EmailTemplate = typeof emailTemplates.$inferSelect;
export type InsertEmailTemplate = typeof emailTemplates.$inferInsert;

export type EmailSend = typeof emailSends.$inferSelect;
export type InsertEmailSend = typeof emailSends.$inferInsert;

export type EmailEvent = typeof emailEvents.$inferSelect;
export type InsertEmailEvent = typeof emailEvents.$inferInsert;

export type CallScript = typeof callScripts.$inferSelect;
export type InsertCallScript = typeof callScripts.$inferInsert;

export type CallAttempt = typeof callAttempts.$inferSelect;
export type InsertCallAttempt = typeof callAttempts.$inferInsert;

export type CallEvent = typeof callEvents.$inferSelect;
export type InsertCallEvent = typeof callEvents.$inferInsert;

export type QualificationResponse = typeof qualificationResponses.$inferSelect;
export type InsertQualificationResponse = typeof qualificationResponses.$inferInsert;

export type SoftphoneProfile = typeof softphoneProfiles.$inferSelect;
export type InsertSoftphoneProfile = typeof softphoneProfiles.$inferInsert;

// Lead with joined account and agent information for QA views
export type LeadWithAccount = Lead & {
  accountName?: string | null;
  accountId?: string | null;
  agentFirstName?: string | null;
  agentLastName?: string | null;
  agentEmail?: string | null;
  aiAgentName?: string | null;
  agentDisplayName?: string | null;
  customFields?: any;
  approverFirstName?: string | null;
  approverLastName?: string | null;
  rejectorFirstName?: string | null;
  rejectorLastName?: string | null;
  tags?: LeadTag[];
};

export type SuppressionEmail = typeof suppressionEmails.$inferSelect;
export type InsertSuppressionEmail = z.infer<typeof insertSuppressionEmailSchema>;

export type SuppressionPhone = typeof suppressionPhones.$inferSelect;
export type InsertSuppressionPhone = z.infer<typeof insertSuppressionPhoneSchema>;

export type SuppressionListEntry = typeof suppressionList.$inferSelect;
export type InsertSuppressionListEntry = z.infer<typeof insertSuppressionListSchema>;

export type CampaignSuppressionAccount = typeof campaignSuppressionAccounts.$inferSelect;
export type InsertCampaignSuppressionAccount = z.infer<typeof insertCampaignSuppressionAccountSchema>;

export type CampaignSuppressionContact = typeof campaignSuppressionContacts.$inferSelect;
export type InsertCampaignSuppressionContact = z.infer<typeof insertCampaignSuppressionContactSchema>;

export type CampaignSuppressionEmail = typeof campaignSuppressionEmails.$inferSelect;
export type InsertCampaignSuppressionEmail = z.infer<typeof insertCampaignSuppressionEmailSchema>;

export type CampaignSuppressionDomain = typeof campaignSuppressionDomains.$inferSelect;
export type InsertCampaignSuppressionDomain = z.infer<typeof insertCampaignSuppressionDomainSchema>;

export type CampaignOrder = typeof campaignOrders.$inferSelect;
export type InsertCampaignOrder = z.infer<typeof insertCampaignOrderSchema>;

export type OrderAudienceSnapshot = typeof orderAudienceSnapshots.$inferSelect;
export type InsertOrderAudienceSnapshot = z.infer<typeof insertOrderAudienceSnapshotSchema>;

export type OrderAsset = typeof orderAssets.$inferSelect;
export type InsertOrderAsset = z.infer<typeof insertOrderAssetSchema>;

export type OrderQualificationQuestion = typeof orderQualificationQuestions.$inferSelect;
export type InsertOrderQualificationQuestion = z.infer<typeof insertOrderQualificationQuestionSchema>;

export type OrderCampaignLink = typeof orderCampaignLinks.$inferSelect;
export type InsertOrderCampaignLink = z.infer<typeof insertOrderCampaignLinkSchema>;

export type BulkImport = typeof bulkImports.$inferSelect;
export type InsertBulkImport = z.infer<typeof insertBulkImportSchema>;

export type AuditLog = typeof auditLogs.$inferSelect;
export type InsertAuditLog = z.infer<typeof insertAuditLogSchema>;

export type ActivityLog = typeof activityLog.$inferSelect;
export type InsertActivityLog = z.infer<typeof insertActivityLogSchema>;

export type SavedFilter = typeof savedFilters.$inferSelect;
export type InsertSavedFilter = z.infer<typeof insertSavedFilterSchema>;

export type SelectionContext = typeof selectionContexts.$inferSelect;
export type InsertSelectionContext = z.infer<typeof insertSelectionContextSchema>;

export type FilterField = typeof filterFieldRegistry.$inferSelect;
export type InsertFilterField = z.infer<typeof insertFilterFieldSchema>;

export type ContactEmail = typeof contactEmails.$inferSelect;
export type InsertContactEmail = z.infer<typeof insertContactEmailSchema>;

export type AccountDomain = typeof accountDomains.$inferSelect;
export type InsertAccountDomain = z.infer<typeof insertAccountDomainSchema>;

export type FieldChangeLog = typeof fieldChangeLog.$inferSelect;
export type InsertFieldChangeLog = z.infer<typeof insertFieldChangeLogSchema>;

export type DedupeReviewQueue = typeof dedupeReviewQueue.$inferSelect;
export type InsertDedupeReviewQueue = z.infer<typeof insertDedupeReviewQueueSchema>;

export type IndustryReference = typeof industryReference.$inferSelect;
export type InsertIndustryReference = z.infer<typeof insertIndustryReferenceSchema>;

export type CompanySizeReference = typeof companySizeReference.$inferSelect;
export type InsertCompanySizeReference = z.infer<typeof insertCompanySizeReferenceSchema>;

export type RevenueRangeReference = typeof revenueRangeReference.$inferSelect;
export type InsertRevenueRangeReference = z.infer<typeof insertRevenueRangeReferenceSchema>;

export type SeniorityLevelReference = typeof seniorityLevelReference.$inferSelect;
export type InsertSeniorityLevelReference = z.infer<typeof insertSeniorityLevelReferenceSchema>;

export type JobFunctionReference = typeof jobFunctionReference.$inferSelect;
export type InsertJobFunctionReference = z.infer<typeof insertJobFunctionReferenceSchema>;

export type DepartmentReference = typeof departmentReference.$inferSelect;
export type InsertDepartmentReference = z.infer<typeof insertDepartmentReferenceSchema>;

export type TechnologyReference = typeof technologyReference.$inferSelect;
export type InsertTechnologyReference = z.infer<typeof insertTechnologyReferenceSchema>;

export type CountryReference = typeof countryReference.$inferSelect;
export type InsertCountryReference = z.infer<typeof insertCountryReferenceSchema>;

export type StateReference = typeof stateReference.$inferSelect;
export type InsertStateReference = z.infer<typeof insertStateReferenceSchema>;

export type CityReference = typeof cityReference.$inferSelect;
export type InsertCityReference = z.infer<typeof insertCityReferenceSchema>;

// ============================================================================
// CONTENT STUDIO & SOCIAL MEDIA MANAGEMENT
// ============================================================================

// Content Assets table
export const contentAssets = pgTable("content_assets", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  assetType: contentAssetTypeEnum("asset_type").notNull(),
  title: text("title").notNull(),
  description: text("description"),
  content: text("content"), // HTML/text content
  contentHtml: text("content_html"), // Rendered HTML for emails/landing pages
  thumbnailUrl: text("thumbnail_url"),
  fileUrl: text("file_url"), // For PDFs, videos, images
  tags: text("tags").array().default(sql`ARRAY[]::text[]`),
  metadata: jsonb("metadata"), // Custom metadata, AI-extracted keywords
  approvalStatus: contentApprovalStatusEnum("approval_status").notNull().default('draft'),
  tone: contentToneEnum("tone"),
  targetAudience: text("target_audience"),
  ctaGoal: text("cta_goal"),
  linkedCampaigns: text("linked_campaigns").array().default(sql`ARRAY[]::text[]`),
  usageHistory: jsonb("usage_history").default(sql`'[]'::jsonb`), // Track where asset was used
  version: integer("version").notNull().default(1),
  currentVersionId: varchar("current_version_id"),
  ownerId: varchar("owner_id").notNull().references(() => users.id, { onDelete: 'cascade' }),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (table) => ({
  assetTypeIdx: index("content_assets_asset_type_idx").on(table.assetType),
  approvalStatusIdx: index("content_assets_approval_status_idx").on(table.approvalStatus),
  ownerIdx: index("content_assets_owner_idx").on(table.ownerId),
}));

// Content Versions table
export const contentVersions = pgTable("content_versions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  assetId: varchar("asset_id").notNull().references(() => contentAssets.id, { onDelete: 'cascade' }),
  versionNumber: integer("version_number").notNull(),
  content: text("content").notNull(),
  contentHtml: text("content_html"),
  metadata: jsonb("metadata"),
  changedBy: varchar("changed_by").notNull().references(() => users.id),
  changeDescription: text("change_description"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (table) => ({
  assetIdIdx: index("content_versions_asset_id_idx").on(table.assetId),
  versionIdx: index("content_versions_version_number_idx").on(table.assetId, table.versionNumber),
}));

// Content Approvals table
export const contentApprovals = pgTable("content_approvals", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  assetId: varchar("asset_id").notNull().references(() => contentAssets.id, { onDelete: 'cascade' }),
  reviewerId: varchar("reviewer_id").notNull().references(() => users.id),
  status: contentApprovalStatusEnum("status").notNull(),
  comments: text("comments"),
  reviewedAt: timestamp("reviewed_at").notNull().defaultNow(),
}, (table) => ({
  assetIdIdx: index("content_approvals_asset_id_idx").on(table.assetId),
  reviewerIdx: index("content_approvals_reviewer_idx").on(table.reviewerId),
}));

// Social Posts table
export const socialPosts = pgTable("social_posts", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  assetId: varchar("asset_id").references(() => contentAssets.id, { onDelete: 'set null' }),
  platform: socialPlatformEnum("platform").notNull(),
  content: text("content").notNull(),
  mediaUrls: text("media_urls").array().default(sql`ARRAY[]::text[]`),
  scheduledAt: timestamp("scheduled_at"),
  publishedAt: timestamp("published_at"),
  status: contentApprovalStatusEnum("status").notNull().default('draft'),
  utmParameters: jsonb("utm_parameters"), // UTM tracking
  platformPostId: text("platform_post_id"), // ID from social platform
  engagement: jsonb("engagement"), // likes, shares, comments, impressions
  sentiment: text("sentiment"), // AI-analyzed: positive/neutral/negative
  ownerId: varchar("owner_id").notNull().references(() => users.id, { onDelete: 'cascade' }),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (table) => ({
  platformIdx: index("social_posts_platform_idx").on(table.platform),
  statusIdx: index("social_posts_status_idx").on(table.status),
  scheduledAtIdx: index("social_posts_scheduled_at_idx").on(table.scheduledAt),
  ownerIdx: index("social_posts_owner_idx").on(table.ownerId),
}));

// AI Content Generations table (track AI-generated content)
export const aiContentGenerations = pgTable("ai_content_generations", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  assetId: varchar("asset_id").references(() => contentAssets.id, { onDelete: 'set null' }),
  prompt: text("prompt").notNull(),
  contentType: contentAssetTypeEnum("content_type").notNull(),
  targetAudience: text("target_audience"),
  tone: contentToneEnum("tone"),
  ctaGoal: text("cta_goal"),
  generatedContent: text("generated_content").notNull(),
  model: text("model").notNull(), // GPT-4, Claude, etc.
  tokensUsed: integer("tokens_used"),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: 'cascade' }),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (table) => ({
  assetIdIdx: index("ai_content_generations_asset_id_idx").on(table.assetId),
  userIdx: index("ai_content_generations_user_idx").on(table.userId),
  createdAtIdx: index("ai_content_generations_created_at_idx").on(table.createdAt),
}));

// Content Asset Pushes table (track push attempts to Resources Center)
export const contentAssetPushes = pgTable("content_asset_pushes", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  assetId: varchar("asset_id").notNull().references(() => contentAssets.id, { onDelete: 'cascade' }),
  targetUrl: text("target_url").notNull(), // Resources Center URL
  status: pushStatusEnum("status").notNull().default('pending'),
  attemptCount: integer("attempt_count").notNull().default(0),
  maxAttempts: integer("max_attempts").notNull().default(3),
  lastAttemptAt: timestamp("last_attempt_at"),
  successAt: timestamp("success_at"),
  errorMessage: text("error_message"),
  responsePayload: jsonb("response_payload"), // Response from Resources Center
  externalId: text("external_id"), // ID returned from Resources Center
  pushedBy: varchar("pushed_by").notNull().references(() => users.id),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (table) => ({
  assetIdIdx: index("content_asset_pushes_asset_id_idx").on(table.assetId),
  statusIdx: index("content_asset_pushes_status_idx").on(table.status),
  targetUrlIdx: index("content_asset_pushes_target_url_idx").on(table.targetUrl),
}));

// ============================================================================
// EVENTS, RESOURCES, AND NEWS (Structured Content for Distribution)
// ============================================================================

// Events table
export const events = pgTable("events", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  slug: text("slug").notNull().unique(),
  title: text("title").notNull(),
  eventType: eventTypeEnum("event_type").notNull(),
  locationType: locationTypeEnum("location_type").notNull(),
  community: communityEnum("community").notNull(),
  organizer: text("organizer"),
  sponsor: text("sponsor"),
  speakers: jsonb("speakers").default(sql`'[]'::jsonb`), // Array of speaker objects
  startIso: text("start_iso").notNull(),
  endIso: text("end_iso"),
  timezone: text("timezone"),
  overviewHtml: text("overview_html"),
  learnBullets: text("learn_bullets").array().default(sql`ARRAY[]::text[]`),
  thumbnailUrl: text("thumbnail_url"),
  ctaLink: text("cta_link"),
  formId: text("form_id"),
  seo: jsonb("seo"), // SEO metadata object
  status: contentStatusEnum("status").notNull().default('draft'),
  ownerId: varchar("owner_id").notNull().references(() => users.id, { onDelete: 'cascade' }),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (table) => ({
  slugIdx: index("events_slug_idx").on(table.slug),
  eventTypeIdx: index("events_event_type_idx").on(table.eventType),
  communityIdx: index("events_community_idx").on(table.community),
  statusIdx: index("events_status_idx").on(table.status),
  startIsoIdx: index("events_start_iso_idx").on(table.startIso),
}));

// Resources table
export const resources = pgTable("resources", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  slug: text("slug").notNull().unique(),
  title: text("title").notNull(),
  resourceType: resourceTypeEnum("resource_type").notNull(),
  community: communityEnum("community").notNull(),
  overviewHtml: text("overview_html"),
  bullets: text("bullets").array().default(sql`ARRAY[]::text[]`),
  bodyHtml: text("body_html"),
  thumbnailUrl: text("thumbnail_url"),
  ctaLink: text("cta_link"),
  formId: text("form_id"),
  seo: jsonb("seo"), // SEO metadata object
  status: contentStatusEnum("status").notNull().default('draft'),
  ownerId: varchar("owner_id").notNull().references(() => users.id, { onDelete: 'cascade' }),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (table) => ({
  slugIdx: index("resources_slug_idx").on(table.slug),
  resourceTypeIdx: index("resources_resource_type_idx").on(table.resourceType),
  communityIdx: index("resources_community_idx").on(table.community),
  statusIdx: index("resources_status_idx").on(table.status),
}));

// Speakers, Organizers, Sponsors (Resources Centre Reference Data)
export const speakers = pgTable("speakers", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  title: text("title"), // Job title
  company: text("company"),
  bio: text("bio"),
  photoUrl: text("photo_url"),
  linkedinUrl: text("linkedin_url"),
  externalId: varchar("external_id", { length: 255 }), // ID from Resources Centre
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull()
}, (t) => ({
  nameIdx: index("speakers_name_idx").on(t.name),
  externalIdIdx: uniqueIndex("speakers_external_id_idx").on(t.externalId)
}));

export const organizers = pgTable("organizers", {
  id: serial("id").primaryKey(),
  name: text("name").notNull().unique(),
  description: text("description"),
  logoUrl: text("logo_url"),
  websiteUrl: text("website_url"),
  externalId: varchar("external_id", { length: 255 }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull()
}, (t) => ({
  nameIdx: index("organizers_name_idx").on(t.name)
}));

export const sponsors = pgTable("sponsors", {
  id: serial("id").primaryKey(),
  name: text("name").notNull().unique(),
  tier: varchar("tier", { length: 50 }), // platinum, gold, silver, bronze
  description: text("description"),
  logoUrl: text("logo_url"),
  websiteUrl: text("website_url"),
  externalId: varchar("external_id", { length: 255 }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull()
}, (t) => ({
  nameIdx: index("sponsors_name_idx").on(t.name)
}));

// News table
export const news = pgTable("news", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  slug: text("slug").notNull().unique(),
  title: text("title").notNull(),
  community: communityEnum("community").notNull(),
  overviewHtml: text("overview_html"),
  bodyHtml: text("body_html"),
  authors: text("authors").array().default(sql`ARRAY[]::text[]`),
  publishedIso: text("published_iso"),
  thumbnailUrl: text("thumbnail_url"),
  seo: jsonb("seo"), // SEO metadata object
  status: contentStatusEnum("status").notNull().default('draft'),
  ownerId: varchar("owner_id").notNull().references(() => users.id, { onDelete: 'cascade' }),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (table) => ({
  slugIdx: index("news_slug_idx").on(table.slug),
  communityIdx: index("news_community_idx").on(table.community),
  statusIdx: index("news_status_idx").on(table.status),
  publishedIsoIdx: index("news_published_iso_idx").on(table.publishedIso),
}));

// Insert schemas for Content Studio
export const insertContentAssetSchema = createInsertSchema(contentAssets).omit({
  id: true,
  version: true,
  currentVersionId: true,
  ownerId: true,
  createdAt: true,
  updatedAt: true,
});

export const insertContentVersionSchema = createInsertSchema(contentVersions).omit({
  id: true,
  createdAt: true,
});

export const insertContentApprovalSchema = createInsertSchema(contentApprovals).omit({
  id: true,
  reviewedAt: true,
});

export const insertSocialPostSchema = createInsertSchema(socialPosts).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertAIContentGenerationSchema = createInsertSchema(aiContentGenerations).omit({
  id: true,
  createdAt: true,
});

export const insertContentAssetPushSchema = createInsertSchema(contentAssetPushes).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

// Export types for Content Studio
export type ContentAsset = typeof contentAssets.$inferSelect;
export type InsertContentAsset = z.infer<typeof insertContentAssetSchema>;

export type ContentVersion = typeof contentVersions.$inferSelect;
export type InsertContentVersion = z.infer<typeof insertContentVersionSchema>;

export type ContentApproval = typeof contentApprovals.$inferSelect;
export type InsertContentApproval = z.infer<typeof insertContentApprovalSchema>;

export type SocialPost = typeof socialPosts.$inferSelect;
export type InsertSocialPost = z.infer<typeof insertSocialPostSchema>;

export type AIContentGeneration = typeof aiContentGenerations.$inferSelect;
export type InsertAIContentGeneration = z.infer<typeof insertAIContentGenerationSchema>;

export type ContentAssetPush = typeof contentAssetPushes.$inferSelect;
export type InsertContentAssetPush = z.infer<typeof insertContentAssetPushSchema>;

// Insert schemas for Speakers, Organizers, Sponsors
export const insertSpeakerSchema = createInsertSchema(speakers).omit({
  id: true,
  createdAt: true,
  updatedAt: true
});

export const insertOrganizerSchema = createInsertSchema(organizers).omit({
  id: true,
  createdAt: true,
  updatedAt: true
});

export const insertSponsorSchema = createInsertSchema(sponsors).omit({
  id: true,
  createdAt: true,
  updatedAt: true
});

export type Speaker = typeof speakers.$inferSelect;
export type InsertSpeaker = z.infer<typeof insertSpeakerSchema>;

export type Organizer = typeof organizers.$inferSelect;
export type InsertOrganizer = z.infer<typeof insertOrganizerSchema>;

export type Sponsor = typeof sponsors.$inferSelect;
export type InsertSponsor = z.infer<typeof insertSponsorSchema>;

// Insert schemas for Events, Resources, and News
export const insertEventSchema = createInsertSchema(events).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertResourceSchema = createInsertSchema(resources).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertNewsSchema = createInsertSchema(news).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

// Export types for Events, Resources, and News
export type Event = typeof events.$inferSelect;
export type InsertEvent = z.infer<typeof insertEventSchema>;

export type Resource = typeof resources.$inferSelect;
export type InsertResource = z.infer<typeof insertResourceSchema>;

export type News = typeof news.$inferSelect;
export type InsertNews = z.infer<typeof insertNewsSchema>;

// ============================================================================
// EMAIL INFRASTRUCTURE (Phase 26)
// ============================================================================

// Enums for Email Infrastructure
export const authStatusEnum = pgEnum('auth_status', ['pending', 'verified', 'failed']);
export const warmupStatusEnum = pgEnum('warmup_status', ['not_started', 'in_progress', 'completed', 'paused']);
export const stoModeEnum = pgEnum('sto_mode', ['off', 'global_model', 'per_contact']);
export const sendPolicyScopeEnum = pgEnum('send_policy_scope', ['tenant', 'campaign']);

// Domain Authentication
export const domainAuth = pgTable("domain_auth", {
  id: serial("id").primaryKey(),
  domain: text("domain").notNull().unique(),
  spfStatus: authStatusEnum("spf_status").default('pending').notNull(),
  dkimStatus: authStatusEnum("dkim_status").default('pending').notNull(),
  dmarcStatus: authStatusEnum("dmarc_status").default('pending').notNull(),
  trackingDomainStatus: authStatusEnum("tracking_domain_status").default('pending').notNull(),
  bimiStatus: authStatusEnum("bimi_status").default('pending'),
  lastCheckedAt: timestamp("last_checked_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// DKIM Keys
export const dkimKeys = pgTable("dkim_keys", {
  id: serial("id").primaryKey(),
  domainAuthId: integer("domain_auth_id").notNull().references(() => domainAuth.id, { onDelete: 'cascade' }),
  selector: text("selector").notNull(),
  publicKey: text("public_key").notNull(),
  rotationDueAt: timestamp("rotation_due_at"),
  status: authStatusEnum("status").default('pending').notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// Tracking Domains
export const trackingDomains = pgTable("tracking_domains", {
  id: serial("id").primaryKey(),
  cname: text("cname").notNull().unique(), // e.g., click.brand.com
  target: text("target").notNull(), // provider target
  tlsStatus: authStatusEnum("tls_status").default('pending').notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// IP Pools
export const ipPools = pgTable("ip_pools", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  provider: text("provider").notNull(), // 'ses', 'sendgrid', 'mailgun'
  ipAddresses: text("ip_addresses").array().notNull(), // array of IPs
  warmupStatus: warmupStatusEnum("warmup_status").default('not_started').notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// Warmup Plans
export const warmupPlans = pgTable("warmup_plans", {
  id: serial("id").primaryKey(),
  ipPoolId: integer("ip_pool_id").notNull().references(() => ipPools.id, { onDelete: 'cascade' }),
  day: integer("day").notNull(), // day of warmup (1-28)
  dailyCap: integer("daily_cap").notNull(),
  domainSplitJson: jsonb("domain_split_json"), // per-domain distribution
  status: warmupStatusEnum("status").default('not_started').notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// Send Policies (STO, Batching, Throttling)
export const sendPolicies = pgTable("send_policies", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  scope: sendPolicyScopeEnum("scope").default('tenant').notNull(),

  // STO Settings
  stoMode: stoModeEnum("sto_mode").default('off').notNull(),
  stoWindowHours: integer("sto_window_hours").default(24),

  // Batching Settings
  batchSize: integer("batch_size").default(5000),
  batchGapMinutes: integer("batch_gap_minutes").default(15),
  seedTestBatch: boolean("seed_test_batch").default(false),

  // Throttling Settings
  globalTps: integer("global_tps").default(10),
  perDomainCaps: jsonb("per_domain_caps"), // { "gmail.com": 500, "outlook.com": 300 }
  frequencyCap: integer("frequency_cap"), // max emails per contact per week

  status: text("status").default('active').notNull(), // 'active' or 'suspended'
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// Domain Reputation Snapshots
export const domainReputationSnapshots = pgTable("domain_reputation_snapshots", {
  id: serial("id").primaryKey(),
  domain: text("domain").notNull(),
  timestamp: timestamp("timestamp").defaultNow().notNull(),
  metricsJson: jsonb("metrics_json").notNull(), // delivery%, bounces, complaints, etc.
  healthScore: integer("health_score"), // 0-100
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// Per-Domain Stats (aggregated by day)
export const perDomainStats = pgTable("per_domain_stats", {
  id: serial("id").primaryKey(),
  sendingDomain: text("sending_domain").notNull(),
  recipientProvider: text("recipient_provider").notNull(), // gmail.com, outlook.com, etc.
  day: text("day").notNull(), // YYYY-MM-DD
  delivered: integer("delivered").default(0),
  bouncesHard: integer("bounces_hard").default(0),
  bouncesSoft: integer("bounces_soft").default(0),
  complaints: integer("complaints").default(0),
  opens: integer("opens").default(0),
  clicks: integer("clicks").default(0),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// Content Events from Resources Centre (reverse webhook)
export const contentEvents = pgTable("content_events", {
  id: serial("id").primaryKey(),
  eventName: varchar("event_name", { length: 50 }).notNull(), // page_view | form_submission
  contentType: varchar("content_type", { length: 50 }), // event | resource | news
  contentId: varchar("content_id", { length: 255 }),
  slug: varchar("slug", { length: 255 }),
  title: text("title"),
  community: varchar("community", { length: 100 }),
  contactId: varchar("contact_id", { length: 50 }),
  email: varchar("email", { length: 255 }),
  url: text("url"),
  payloadJson: jsonb("payload_json"), // full event data
  ts: timestamp("ts").notNull(),
  uniqKey: varchar("uniq_key", { length: 500 }).notNull().unique(), // deduplication key
  createdAt: timestamp("created_at").defaultNow()
}, (t) => ({
  eventNameIdx: index("content_events_event_name_idx").on(t.eventName),
  contactIdIdx: index("content_events_contact_id_idx").on(t.contactId),
  contentIdIdx: index("content_events_content_id_idx").on(t.contentId),
  tsIdx: index("content_events_ts_idx").on(t.ts)
}));

// Campaign Content Links (for linking campaigns to Events/Resources from Resources Centre)
export const campaignContentLinks = pgTable("campaign_content_links", {
  id: serial("id").primaryKey(),
  campaignId: varchar("campaign_id").references(() => campaigns.id, { onDelete: "cascade" }).notNull(),
  contentType: varchar("content_type", { length: 50 }).notNull(), // event | resource
  contentId: varchar("content_id", { length: 255 }).notNull(), // External ID from Resources Centre
  contentSlug: varchar("content_slug", { length: 255 }).notNull(),
  contentTitle: text("content_title").notNull(),
  contentUrl: text("content_url").notNull(), // Base URL without tracking params
  formId: varchar("form_id", { length: 255 }), // If content has gated form
  metadata: jsonb("metadata"), // Additional content metadata
  createdBy: varchar("created_by", { length: 50 }),
  createdAt: timestamp("created_at").defaultNow().notNull()
}, (t) => ({
  campaignContentIdx: uniqueIndex("campaign_content_unique_idx").on(t.campaignId, t.contentType, t.contentId),
  contentIdIdx: index("campaign_content_links_content_id_idx").on(t.contentId)
}));

// Insert Schemas
export const insertDomainAuthSchema = createInsertSchema(domainAuth).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertDkimKeySchema = createInsertSchema(dkimKeys).omit({
  id: true,
  createdAt: true,
});

export const insertTrackingDomainSchema = createInsertSchema(trackingDomains).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertIpPoolSchema = createInsertSchema(ipPools).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertWarmupPlanSchema = createInsertSchema(warmupPlans).omit({
  id: true,
  createdAt: true,
});

export const insertSendPolicySchema = createInsertSchema(sendPolicies).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertDomainReputationSnapshotSchema = createInsertSchema(domainReputationSnapshots).omit({
  id: true,
  createdAt: true,
});

export const insertPerDomainStatsSchema = createInsertSchema(perDomainStats).omit({
  id: true,
  createdAt: true,
});

export const insertContentEventSchema = createInsertSchema(contentEvents).omit({
  id: true,
  createdAt: true,
});

export const insertCampaignContentLinkSchema = createInsertSchema(campaignContentLinks).omit({
  id: true,
  createdAt: true,
});

// Export Types
export type DomainAuth = typeof domainAuth.$inferSelect;
export type InsertDomainAuth = z.infer<typeof insertDomainAuthSchema>;

export type DkimKey = typeof dkimKeys.$inferSelect;
export type InsertDkimKey = z.infer<typeof insertDkimKeySchema>;

export type TrackingDomain = typeof trackingDomains.$inferSelect;
export type InsertTrackingDomain = z.infer<typeof insertTrackingDomainSchema>;

export type IpPool = typeof ipPools.$inferSelect;
export type InsertIpPool = z.infer<typeof insertIpPoolSchema>;

export type WarmupPlan = typeof warmupPlans.$inferSelect;
export type InsertWarmupPlan = z.infer<typeof insertWarmupPlanSchema>;

export type SendPolicy = typeof sendPolicies.$inferSelect;
export type InsertSendPolicy = z.infer<typeof insertSendPolicySchema>;

export type DomainReputationSnapshot = typeof domainReputationSnapshots.$inferSelect;
export type InsertDomainReputationSnapshot = z.infer<typeof insertDomainReputationSnapshotSchema>;

export type PerDomainStats = typeof perDomainStats.$inferSelect;
export type InsertPerDomainStats = z.infer<typeof insertPerDomainStatsSchema>;

export type ContentEvent = typeof contentEvents.$inferSelect;
export type InsertContentEvent = z.infer<typeof insertContentEventSchema>;

export type CampaignContentLink = typeof campaignContentLinks.$inferSelect;
export type InsertCampaignContentLink = z.infer<typeof insertCampaignContentLinkSchema>;

// Auto-Dialer Insert Schemas
export const insertAgentStatusSchema = createInsertSchema(agentStatus).omit({
  id: true,
  lastStatusChangeAt: true,
  updatedAt: true,
});

export const insertAutoDialerQueueSchema = createInsertSchema(autoDialerQueues).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

// Dual-Dialer Mode Insert Schemas
export const insertAgentQueueSchema = createInsertSchema(agentQueue).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertVoicemailAssetSchema = createInsertSchema(voicemailAssets).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertContactVoicemailTrackingSchema = createInsertSchema(contactVoicemailTracking).omit({
  updatedAt: true,
});

// Auto-Dialer Types
export type AgentStatus = typeof agentStatus.$inferSelect;
export type InsertAgentStatus = z.infer<typeof insertAgentStatusSchema>;

export type AutoDialerQueue = typeof autoDialerQueues.$inferSelect;
export type InsertAutoDialerQueue = z.infer<typeof insertAutoDialerQueueSchema>;

// Dual-Dialer Mode Types
export type AgentQueue = typeof agentQueue.$inferSelect;
export type InsertAgentQueue = z.infer<typeof insertAgentQueueSchema>;

export type VoicemailAsset = typeof voicemailAssets.$inferSelect;
export type InsertVoicemailAsset = z.infer<typeof insertVoicemailAssetSchema>;

export type ContactVoicemailTracking = typeof contactVoicemailTracking.$inferSelect;
export type InsertContactVoicemailTracking = z.infer<typeof insertContactVoicemailTrackingSchema>;

// Enum value arrays for dropdowns
export const REVENUE_RANGE_VALUES = revenueRangeEnum.enumValues;
export const STAFF_COUNT_RANGE_VALUES = staffCountRangeEnum.enumValues;
export const AGENT_STATUS_VALUES = agentStatusEnum.enumValues;
export const DIAL_MODE_VALUES = dialModeEnum.enumValues;
export const AMD_RESULT_VALUES = amdResultEnum.enumValues;
export const VOICEMAIL_ACTION_VALUES = voicemailActionEnum.enumValues;
export const VOICEMAIL_MESSAGE_TYPE_VALUES = voicemailMessageTypeEnum.enumValues;
export const MANUAL_QUEUE_STATE_VALUES = manualQueueStateEnum.enumValues;

// ==================== DUAL-DIALER MODE: AMD & VOICEMAIL CONFIGURATION TYPES ====================

export interface VoicemailLocalTimeWindow {
  start_hhmm: string; // e.g., "09:00"
  end_hhmm: string;   // e.g., "17:00"
}

export interface VoicemailMachinePolicy {
  action: 'leave_voicemail' | 'schedule_callback' | 'drop_silent';
  message_type?: 'tts' | 'audio_file';
  tts_voice_id?: string;
  audio_asset_id?: string;
  template_id?: string;
  message_max_sec?: number;
  max_vm_per_contact?: number;
  vm_cooldown_hours?: number;
  campaign_daily_vm_cap?: number;
  vm_local_time_window?: VoicemailLocalTimeWindow;
  restricted_region_block?: boolean;
}

export interface AMDConfiguration {
  enabled: boolean;
  confidence_threshold: number; // 0.0 - 1.0
  decision_timeout_ms: number; // e.g., 1500-3500
  uncertain_fallback: 'route_as_human' | 'voicemail_policy';
  machine_policy?: VoicemailMachinePolicy;
}

export interface PowerDialSettings {
  pacing_ratio: number; // 1.0 - 3.0
  max_concurrent_per_agent: number; // 1-3
  ring_timeout_sec: number;
  abandon_rate_target_pct: number;
  distribution_strategy: 'round_robin' | 'least_recently_served' | 'skill_based';
  retry_rules?: any;
  quiet_hours?: any;
  max_daily_attempts_per_contact?: number;
  amd?: AMDConfiguration;
}

// Voicemail Token Substitution Context
export interface VoicemailTokenContext {
  contact: {
    first_name?: string;
    last_name?: string;
    full_name?: string;
    company?: string;
    email?: string;
    phone?: string;
  };
  company: {
    name?: string;
    domain?: string;
  };
  callback: {
    number?: string;
    hours?: string;
  };
  campaign: {
    name?: string;
    owner_name?: string;
  };
}

// Manual Queue Filter Parameters
export interface ManualQueueFilters {
  accountIds?: string[];
  industries?: string[];
  regions?: string[];
  hasEmail?: boolean;
  hasPhone?: boolean;
  customFilters?: any;
}

// Zod validation schemas for API requests
export const voicemailMachinePolicySchema = z.object({
  action: z.enum(['leave_voicemail', 'schedule_callback', 'drop_silent']),
  message_type: z.enum(['tts', 'audio_file']).optional(),
  tts_voice_id: z.string().optional(),
  audio_asset_id: z.string().optional(),
  template_id: z.string().optional(),
  message_max_sec: z.number().min(1).max(120).optional(),
  max_vm_per_contact: z.number().min(1).max(10).optional(),
  vm_cooldown_hours: z.number().min(1).max(720).optional(),
  campaign_daily_vm_cap: z.number().min(1).optional(),
  vm_local_time_window: z.object({
    start_hhmm: z.string().regex(/^\d{2}:\d{2}$/),
    end_hhmm: z.string().regex(/^\d{2}:\d{2}$/),
  }).optional(),
  restricted_region_block: z.boolean().optional(),
});

export const amdConfigurationSchema = z.object({
  enabled: z.boolean(),
  confidence_threshold: z.number().min(0).max(1),
  decision_timeout_ms: z.number().min(1000).max(5000),
  uncertain_fallback: z.enum(['route_as_human', 'voicemail_policy']),
  machine_policy: voicemailMachinePolicySchema.optional(),
});

export const powerDialSettingsSchema = z.object({
  pacing_ratio: z.number().min(1.0).max(3.0),
  max_concurrent_per_agent: z.number().min(1).max(3),
  ring_timeout_sec: z.number().min(10).max(120),
  abandon_rate_target_pct: z.number().min(0).max(20),
  distribution_strategy: z.enum(['round_robin', 'least_recently_served', 'skill_based']),
  retry_rules: z.any().optional(),
  quiet_hours: z.any().optional(),
  max_daily_attempts_per_contact: z.number().min(1).max(20).optional(),
  amd: amdConfigurationSchema.optional(),
});

// ============================================================================
// VERIFICATION CAMPAIGNS MODULE SCHEMA
// ============================================================================

export const verificationEligibilityStatusEnum = pgEnum('verification_eligibility_status', [
  'Eligible', 
  'Out_of_Scope', 
  'Ineligible_Cap_Reached', 
  'Ineligible_Recently_Submitted', // Submitted in last 2 years - auto-excluded
  'Pending_Email_Validation', 
  'Ineligible_Email_Invalid'
]);
export const verificationStatusEnum = pgEnum('verification_status', ['Pending', 'Validated', 'Replaced', 'Invalid']);
export const verificationQaStatusEnum = pgEnum('verification_qa_status', ['Unreviewed', 'Flagged', 'Passed', 'Rejected']);
export const verificationEmailStatusEnum = pgEnum('verification_email_status', [
  'valid',        // SMTP confirmed deliverable OR DNS verified with high confidence
  'invalid',      // Hard failures: syntax errors, no MX, mailbox disabled, disposable, spam trap
  'unknown',      // Cannot reliably determine (SMTP blocked, timeout, greylisting, ambiguous response)
  'acceptable'    // Catch-all/accept-all OR risk factors but likely deliverable
]);
export const verificationSourceTypeEnum = pgEnum('verification_source_type', ['Client_Provided', 'New_Sourced']);
export const addressEnrichmentStatusEnum = pgEnum('address_enrichment_status', ['not_needed', 'pending', 'in_progress', 'completed', 'failed']);
export const phoneEnrichmentStatusEnum = pgEnum('phone_enrichment_status', ['not_needed', 'pending', 'in_progress', 'completed', 'failed']);
export const seniorityLevelEnum = pgEnum('seniority_level', ['executive', 'vp', 'director', 'manager', 'ic', 'unknown']);

export const verificationCampaigns = pgTable("verification_campaigns", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull(),
  monthlyTarget: integer("monthly_target").default(1000),
  leadCapPerAccount: integer("lead_cap_per_account").default(10),

  eligibilityConfig: jsonb("eligibility_config").$type<{
    geoAllow?: string[];
    titleKeywords?: string[];
    seniorDmFallback?: string[];
    seniorityLevels?: string[];
    industryKeywords?: string[];
    requireEmailNameMatch?: boolean;
    titleMatchMode?: 'contains' | 'exact' | 'word_boundary';
    // Contact realness checks
    rejectFakeNames?: boolean;
    rejectSelfEmployed?: boolean;
    rejectMissingIndustry?: boolean;
    rejectMissingCompanyLinkedIn?: boolean;
    rejectFreemailWithTitle?: boolean; // Flag contacts using personal email (gmail, yahoo) with business titles
    rejectMissingTenure?: boolean; // Flag contacts with no tenure data (time in position or time in company)
  }>(),

  priorityConfig: jsonb("priority_config").$type<{
    targetJobTitles?: string[];
    targetSeniorityLevels?: string[];
    seniorityWeight?: number;
    titleAlignmentWeight?: number;
    emailQualityWeight?: number;
    phoneCompletenessWeight?: number;
    addressCompletenessWeight?: number;
  }>().default(sql`'{"seniorityWeight": 0.20, "titleAlignmentWeight": 0.10, "emailQualityWeight": 0.30, "phoneCompletenessWeight": 0.20, "addressCompletenessWeight": 0.20}'::jsonb`),

  emailValidationProvider: text("email_validation_provider").default("kickbox"),
  okEmailStates: text("ok_email_states").array().default(sql`ARRAY['valid', 'acceptable']::text[]`),

  suppressionMatchFields: text("suppression_match_fields").array().default(sql`ARRAY['email_lower', 'cav_id', 'cav_user_id', 'name_company_hash']::text[]`),

  addressPrecedence: text("address_precedence").array().default(sql`ARRAY['contact', 'hq']::text[]`),

  okRateTarget: numeric("ok_rate_target", { precision: 5, scale: 2 }).default('0.95'),
  deliverabilityTarget: numeric("deliverability_target", { precision: 5, scale: 2 }).default('0.97'),
  suppressionHitRateMax: numeric("suppression_hit_rate_max", { precision: 5, scale: 2 }).default('0.05'),
  qaPassRateMin: numeric("qa_pass_rate_min", { precision: 5, scale: 2 }).default('0.98'),

  status: text("status").default('active'),
  workflowTriggeredAt: timestamp("workflow_triggered_at"),
  createdBy: varchar("created_by").references(() => users.id),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (table) => ({
  nameIdx: index("verification_campaigns_name_idx").on(table.name),
}));

export const verificationContacts = pgTable("verification_contacts", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  campaignId: varchar("campaign_id").references(() => verificationCampaigns.id, { onDelete: 'cascade' }).notNull(),
  accountId: varchar("account_id").references(() => accounts.id, { onDelete: 'set null' }),
  sourceType: verificationSourceTypeEnum("source_type").notNull(),

  fullName: text("full_name").notNull(),
  firstName: text("first_name"),
  lastName: text("last_name"),
  title: text("title"),
  email: text("email"),
  emailLower: text("email_lower"),
  phone: text("phone"),
  mobile: text("mobile"),
  linkedinUrl: text("linkedin_url"),

  // Career & Tenure fields (matching contacts table)
  formerPosition: text("former_position"),
  timeInCurrentPosition: text("time_in_current_position"),
  timeInCurrentPositionMonths: integer("time_in_current_position_months"),
  timeInCurrentCompany: text("time_in_current_company"),
  timeInCurrentCompanyMonths: integer("time_in_current_company_months"),

  contactAddress1: text("contact_address1"),
  contactAddress2: text("contact_address2"),
  contactAddress3: text("contact_address3"),
  contactCity: text("contact_city"),
  contactState: text("contact_state"),
  contactCountry: text("contact_country"),
  contactPostal: text("contact_postal"),

  hqAddress1: text("hq_address_1"),
  hqAddress2: text("hq_address_2"),
  hqAddress3: text("hq_address_3"),
  hqCity: text("hq_city"),
  hqState: text("hq_state"),
  hqCountry: text("hq_country"),
  hqPostal: text("hq_postal"),
  hqPhone: text("hq_phone"),

  cavId: text("cav_id"),
  cavUserId: text("cav_user_id"),

  eligibilityStatus: verificationEligibilityStatusEnum("eligibility_status").default('Out_of_Scope'),
  eligibilityReason: text("eligibility_reason"),
  verificationStatus: verificationStatusEnum("verification_status").default('Pending'),
  qaStatus: verificationQaStatusEnum("qa_status").default('Unreviewed'),
  emailStatus: verificationEmailStatusEnum("email_status").default('unknown'),
  isBusinessEmail: boolean("is_business_email"), // True if email is business (not free/disposable)
  emailRiskLevel: emailRiskLevelEnum("email_risk_level").default('unknown'),
  emailEligible: boolean("email_eligible").default(false), // Final email eligibility based on 3-layer validation
  emailEligibilityReason: text("email_eligibility_reason"), // Reason for eligibility decision
  deepVerifiedAt: timestamp("deep_verified_at"), // When Kickbox deep verification was performed
  
  // Kickbox verification results (stored directly for easy access)
  kickboxResult: text("kickbox_result"), // deliverable, undeliverable, risky, unknown
  kickboxReason: text("kickbox_reason"), // Reason code from Kickbox
  kickboxScore: numeric("kickbox_score", { precision: 5, scale: 2 }), // Sendex score (0-100)
  kickboxAcceptAll: boolean("kickbox_accept_all"), // Catch-all domain detection
  kickboxDisposable: boolean("kickbox_disposable"), // Hidden disposable detection
  kickboxFree: boolean("kickbox_free"), // Free email provider
  kickboxRole: boolean("kickbox_role"), // Role-based address detection
  
  suppressed: boolean("suppressed").default(false),
  deleted: boolean("deleted").default(false),

  assigneeId: varchar("assignee_id").references(() => users.id, { onDelete: 'set null' }),
  seniorityLevel: seniorityLevelEnum("seniority_level").default('unknown'),
  titleAlignmentScore: numeric("title_alignment_score", { precision: 3, scale: 2 }),
  priorityScore: numeric("priority_score", { precision: 10, scale: 2 }),

  // Comprehensive priority score components (for data quality-based cap enforcement)
  emailQualityScore: numeric("email_quality_score", { precision: 3, scale: 2 }),
  phoneCompletenessScore: numeric("phone_completeness_score", { precision: 3, scale: 2 }),
  addressCompletenessScore: numeric("address_completeness_score", { precision: 3, scale: 2 }),
  comprehensivePriorityScore: numeric("comprehensive_priority_score", { precision: 10, scale: 2 }),

  reservedSlot: boolean("reserved_slot").default(false),
  inSubmissionBuffer: boolean("in_submission_buffer").default(false),
  
  // Client submission tracking - exported contacts are ineligible for 2 years
  submittedToClientAt: timestamp("submitted_to_client_at"),
  clientDeliveryExcludedUntil: timestamp("client_delivery_excluded_until"),

  firstNameNorm: text("first_name_norm"),
  lastNameNorm: text("last_name_norm"),
  companyKey: text("company_key"),
  contactCountryKey: text("contact_country_key"),
  nameCompanyHash: text("name_company_hash"),

  addressEnrichmentStatus: addressEnrichmentStatusEnum("address_enrichment_status").default('not_needed'),
  addressEnrichedAt: timestamp("address_enriched_at"),
  addressEnrichmentError: text("address_enrichment_error"),
  phoneEnrichmentStatus: phoneEnrichmentStatusEnum("phone_enrichment_status").default('not_needed'),
  phoneEnrichedAt: timestamp("phone_enriched_at"),
  phoneEnrichmentError: text("phone_enrichment_error"),

  // AI Enrichment Results - Separate fields for enriched data based on Contact Country
  aiEnrichedAddress1: text("ai_enriched_address1"),
  aiEnrichedAddress2: text("ai_enriched_address2"),
  aiEnrichedAddress3: text("ai_enriched_address3"),
  aiEnrichedCity: text("ai_enriched_city"),
  aiEnrichedState: text("ai_enriched_state"),
  aiEnrichedPostal: text("ai_enriched_postal"),
  aiEnrichedCountry: text("ai_enriched_country"),
  aiEnrichedPhone: text("ai_enriched_phone"),

  customFields: jsonb("custom_fields"),

  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (table) => ({
  campaignIdx: index("verification_contacts_campaign_idx").on(table.campaignId),
  eligibilityIdx: index("verification_contacts_eligibility_idx").on(table.eligibilityStatus),
  suppressedIdx: index("verification_contacts_suppressed_idx").on(table.suppressed),
  deletedIdx: index("verification_contacts_deleted_idx").on(table.deleted),
  normKeysIdx: index("verification_contacts_norm_keys_idx").on(table.firstNameNorm, table.lastNameNorm, table.companyKey, table.contactCountryKey),
  cavIdIdx: index("verification_contacts_cav_id_idx").on(table.cavId),
  emailIdx: index("verification_contacts_email_idx").on(table.email),
  emailLowerIdx: index("verification_contacts_email_lower_idx").on(table.emailLower),
  uniqueCampaignContact: uniqueIndex("verification_contacts_unique_campaign_contact").on(table.campaignId, table.fullName, table.accountId),
}));

export const verificationEmailValidations = pgTable("verification_email_validations", {
  contactId: varchar("contact_id").references(() => verificationContacts.id, { onDelete: 'cascade' }).notNull(),
  emailLower: varchar("email_lower").notNull(),
  provider: text("provider").default("kickbox").notNull(),
  status: verificationEmailStatusEnum("status").notNull(),
  rawJson: jsonb("raw_json"),

  // Layer 1: API-free validation details (In-house fast validation)
  syntaxValid: boolean("syntax_valid"),
  hasMx: boolean("has_mx"),
  hasSmtp: boolean("has_smtp"),
  smtpAccepted: boolean("smtp_accepted"),
  isRole: boolean("is_role"),
  isFree: boolean("is_free"),
  isDisposable: boolean("is_disposable"),
  isSpamTrap: boolean("is_spam_trap"),
  isAcceptAll: boolean("is_accept_all"),
  isDisabled: boolean("is_disabled"),
  confidence: integer("confidence"),
  validationTrace: jsonb("validation_trace").$type<{
    syntax?: { ok: boolean; reason?: string };
    dns?: { hasMX: boolean; hasA: boolean; mxHosts?: string[] };
    smtp?: { code?: number; rcptOk?: boolean; banner?: string; raw?: string[] };
    risk?: { isRole: boolean; isFree: boolean; isDisposable: boolean };
  }>(),

  // Layer 2: Kickbox Deep Verification Fields
  kickboxResult: text("kickbox_result"), // deliverable, undeliverable, risky, unknown
  kickboxReason: text("kickbox_reason"), // Reason code (e.g., invalid_email, rejected_email, etc.)
  kickboxScore: numeric("kickbox_score", { precision: 5, scale: 2 }), // Sendex score (0-100)
  kickboxDidYouMean: text("kickbox_did_you_mean"), // Suggested email correction
  kickboxDisposable: boolean("kickbox_disposable"), // Hidden disposable detection
  kickboxAcceptAll: boolean("kickbox_accept_all"), // Catch-all domain detection
  kickboxFree: boolean("kickbox_free"), // Free email provider
  kickboxRole: boolean("kickbox_role"), // Role-based address detection
  kickboxResponse: jsonb("kickbox_response").$type<{
    result?: string;
    reason?: string;
    role?: boolean;
    free?: boolean;
    disposable?: boolean;
    accept_all?: boolean;
    did_you_mean?: string;
    sendex?: number;
    email?: string;
    user?: string;
    domain?: string;
    success?: boolean;
    message?: string;
  }>(),

  // Risk assessment
  riskLevel: emailRiskLevelEnum("risk_level").default('unknown'),
  isBusinessEmail: boolean("is_business_email"), // Not free + not disposable = business email

  // Eligibility tracking
  emailEligible: boolean("email_eligible").default(false), // Final eligibility result
  eligibilityReason: text("eligibility_reason"), // Why email is/isn't eligible

  checkedAt: timestamp("checked_at").notNull().defaultNow(),
  deepVerifiedAt: timestamp("deep_verified_at"), // When Kickbox verification was performed
}, (table) => ({
  pk: primaryKey({ name: 'verification_email_validations_pkey', columns: [table.contactId, table.emailLower] }),
  emailCacheIdx: index("verification_email_validations_cache_idx").on(table.emailLower, table.checkedAt),
  providerEmailIdx: index("verification_email_validations_provider_email_idx").on(table.emailLower, table.provider),
}));

// Domain cache for DNS/MX lookups (reduces API-free validation overhead)
export const emailValidationDomainCache = pgTable("email_validation_domain_cache", {
  domain: text("domain").primaryKey(),
  hasMx: boolean("has_mx").default(false).notNull(),
  hasA: boolean("has_a").default(false).notNull(),
  mxHosts: jsonb("mx_hosts").$type<string[]>(),
  spfRecord: text("spf_record"),
  dmarcRecord: text("dmarc_record"),
  acceptAllProbability: integer("accept_all_probability").default(0).notNull(),
  lastChecked: timestamp("last_checked").notNull().defaultNow(),
  checkCount: integer("check_count").default(1).notNull(),
}, (table) => ({
  lastCheckedIdx: index("email_validation_domain_cache_last_checked_idx").on(table.lastChecked),
}));

export const verificationSuppressionList = pgTable("verification_suppression_list", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  campaignId: varchar("campaign_id").references(() => verificationCampaigns.id, { onDelete: 'cascade' }),
  emailLower: text("email_lower"),
  cavId: text("cav_id"),
  cavUserId: text("cav_user_id"),
  nameCompanyHash: text("name_company_hash"),
  addedAt: timestamp("added_at").notNull().defaultNow(),
}, (table) => ({
  emailIdx: index("verification_suppression_email_idx").on(table.emailLower),
  cavIdIdx: index("verification_suppression_cav_id_idx").on(table.cavId),
  campaignIdx: index("verification_suppression_campaign_idx").on(table.campaignId),
}));

export const verificationLeadSubmissions = pgTable("verification_lead_submissions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  contactId: varchar("contact_id").references(() => verificationContacts.id, { onDelete: 'cascade' }).notNull().unique(),
  accountId: varchar("account_id").references(() => accounts.id, { onDelete: 'set null' }),
  campaignId: varchar("campaign_id").references(() => verificationCampaigns.id, { onDelete: 'cascade' }).notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  excludedReason: text("excluded_reason"),
}, (table) => ({
  campaignAccountIdx: index("verification_submissions_campaign_account_idx").on(table.campaignId, table.accountId),
}));

export const verificationAccountCapStatus = pgTable("verification_account_cap_status", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  campaignId: varchar("campaign_id").references(() => verificationCampaigns.id, { onDelete: 'cascade' }).notNull(),
  accountId: varchar("account_id").references(() => accounts.id, { onDelete: 'cascade' }).notNull(),
  cap: integer("cap").notNull(),
  submittedCount: integer("submitted_count").default(0).notNull(),
  reservedCount: integer("reserved_count").default(0).notNull(),
  eligibleCount: integer("eligible_count").default(0).notNull(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (table) => ({
  campaignAccountIdx: index("verification_cap_status_campaign_account_idx").on(table.campaignId, table.accountId),
  uniqueCampaignAccount: uniqueIndex("verification_cap_status_unique").on(table.campaignId, table.accountId),
}));

export const verificationAuditLog = pgTable("verification_audit_log", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  actorId: varchar("actor_id").references(() => users.id, { onDelete: 'set null' }),
  entityType: text("entity_type"),
  entityId: text("entity_id"),
  action: text("action"),
  before: jsonb("before"),
  after: jsonb("after"),
  at: timestamp("at").notNull().defaultNow(),
}, (table) => ({
  entityIdx: index("verification_audit_entity_idx").on(table.entityType, table.entityId),
  atIdx: index("verification_audit_at_idx").on(table.at),
}));

export const uploadJobStatusEnum = pgEnum('upload_job_status', ['pending', 'processing', 'completed', 'failed']);

export const uploadJobTypeEnum = pgEnum('upload_job_type', ['validation_results', 'submissions', 'contacts']);

export const emailValidationJobStatusEnum = pgEnum('email_validation_job_status', ['pending', 'processing', 'completed', 'failed', 'cancelled']);

export const enrichmentJobStatusEnum = pgEnum('enrichment_job_status', ['pending', 'processing', 'completed', 'failed', 'cancelled']);

export const verificationUploadJobs = pgTable("verification_upload_jobs", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  campaignId: varchar("campaign_id").references(() => verificationCampaigns.id, { onDelete: 'cascade' }).notNull(),
  jobType: uploadJobTypeEnum("job_type").notNull(),
  status: uploadJobStatusEnum("status").default('pending').notNull(),
  totalRows: integer("total_rows").default(0).notNull(),
  processedRows: integer("processed_rows").default(0).notNull(),
  successCount: integer("success_count").default(0).notNull(),
  errorCount: integer("error_count").default(0).notNull(),
  errors: jsonb("errors").$type<Array<{row: number, message: string}>>().default(sql`'[]'::jsonb`),
  csvData: text("csv_data"),
  s3Key: varchar("s3_key"),
  fieldMappings: jsonb("field_mappings"),
  updateMode: boolean("update_mode").default(false),
  createdBy: varchar("created_by").references(() => users.id, { onDelete: 'set null' }),
  startedAt: timestamp("started_at"),
  finishedAt: timestamp("finished_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (table) => ({
  campaignIdx: index("verification_upload_jobs_campaign_idx").on(table.campaignId),
  statusIdx: index("verification_upload_jobs_status_idx").on(table.status),
  jobTypeIdx: index("verification_upload_jobs_type_idx").on(table.jobType),
  createdAtIdx: index("verification_upload_jobs_created_at_idx").on(table.createdAt),
}));

export const verificationEmailValidationJobs = pgTable("verification_email_validation_jobs", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  campaignId: varchar("campaign_id").references(() => verificationCampaigns.id, { onDelete: 'cascade' }).notNull(),
  status: emailValidationJobStatusEnum("status").default('pending').notNull(),
  totalContacts: integer("total_contacts").default(0).notNull(),
  processedContacts: integer("processed_contacts").default(0).notNull(),
  currentBatch: integer("current_batch").default(0).notNull(),
  totalBatches: integer("total_batches").default(0).notNull(),
  successCount: integer("success_count").default(0).notNull(),
  failureCount: integer("failure_count").default(0).notNull(),
  statusCounts: jsonb("status_counts").$type<{
    valid: number;
    invalid: number;
    acceptable: number;
    unknown: number;
  }>().default(sql`'{"valid":0,"invalid":0,"acceptable":0,"unknown":0}'::jsonb`),
  errorMessage: text("error_message"),
  contactIds: jsonb("contact_ids").$type<string[]>(),
  createdBy: varchar("created_by").references(() => users.id, { onDelete: 'set null' }),
  startedAt: timestamp("started_at"),
  finishedAt: timestamp("finished_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (table) => ({
  campaignIdx: index("verification_email_validation_jobs_campaign_idx").on(table.campaignId),
  statusIdx: index("verification_email_validation_jobs_status_idx").on(table.status),
  createdAtIdx: index("verification_email_validation_jobs_created_at_idx").on(table.createdAt),
}));

export const verificationEnrichmentJobs = pgTable("verification_enrichment_jobs", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  campaignId: varchar("campaign_id").references(() => verificationCampaigns.id, { onDelete: 'cascade' }).notNull(),
  status: enrichmentJobStatusEnum("status").default('pending').notNull(),
  
  totalContacts: integer("total_contacts").default(0).notNull(),
  totalAccounts: integer("total_accounts").default(0).notNull(),
  processedContacts: integer("processed_contacts").default(0).notNull(),
  processedAccounts: integer("processed_accounts").default(0).notNull(),
  
  currentChunk: integer("current_chunk").default(0).notNull(),
  totalChunks: integer("total_chunks").default(0).notNull(),
  chunkSize: integer("chunk_size").default(25).notNull(),
  
  successCount: integer("success_count").default(0).notNull(),
  lowConfidenceCount: integer("low_confidence_count").default(0).notNull(),
  failedCount: integer("failed_count").default(0).notNull(),
  skippedCount: integer("skipped_count").default(0).notNull(),
  
  errors: jsonb("errors").$type<Array<{
    contactId: string;
    accountId: string;
    name: string;
    error: string;
    stage?: string;
    provider?: string;
    statusCode?: number;
  }>>().default(sql`'[]'::jsonb`),
  errorMessage: text("error_message"),
  
  contactIds: jsonb("contact_ids").$type<string[]>(),
  accountIds: jsonb("account_ids").$type<string[]>(),
  dedupeSnapshot: jsonb("dedupe_snapshot").$type<{
    totalAccounts: number;
    alreadyEnriched: number;
    needsEnrichment: number;
  }>(),
  
  force: boolean("force").default(false).notNull(),
  createdBy: varchar("created_by").references(() => users.id, { onDelete: 'set null' }),
  startedAt: timestamp("started_at"),
  finishedAt: timestamp("finished_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (table) => ({
  campaignIdx: index("verification_enrichment_jobs_campaign_idx").on(table.campaignId),
  statusIdx: index("verification_enrichment_jobs_status_idx").on(table.status),
  createdAtIdx: index("verification_enrichment_jobs_created_at_idx").on(table.createdAt),
  // Unique partial index to prevent duplicate active jobs per campaign
  uniqueActiveCampaignIdx: uniqueIndex("verification_enrichment_jobs_unique_active_campaign")
    .on(table.campaignId)
    .where(sql`status IN ('pending', 'processing')`),
}));

// Workflow Orchestration Enums
export const workflowStageEnum = pgEnum('workflow_stage', [
  'eligibility_check',
  'email_validation',
  'address_enrichment',
  'phone_enrichment',
  'completed'
]);

export const workflowStatusEnum = pgEnum('workflow_status', [
  'pending',
  'processing',
  'completed',
  'failed',
  'paused'
]);

// Automated Workflow Orchestration Table
export const verificationCampaignWorkflows = pgTable("verification_campaign_workflows", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  campaignId: varchar("campaign_id").references(() => verificationCampaigns.id, { onDelete: 'cascade' }).notNull().unique(),
  
  currentStage: workflowStageEnum("current_stage").default('eligibility_check').notNull(),
  status: workflowStatusEnum("status").default('pending').notNull(),
  
  eligibilityStats: jsonb("eligibility_stats").$type<{
    total: number;
    eligible: number;
    ineligible: number;
    processedAt?: string;
  }>().default(sql`'{"total":0,"eligible":0,"ineligible":0}'::jsonb`),
  
  emailValidationStats: jsonb("email_validation_stats").$type<{
    total: number;
    processed: number;
    skipped: number;
    valid: number;
    invalid: number;
    processedAt?: string;
  }>().default(sql`'{"total":0,"processed":0,"skipped":0,"valid":0,"invalid":0}'::jsonb`),
  
  addressEnrichmentStats: jsonb("address_enrichment_stats").$type<{
    total: number;
    processed: number;
    skipped: number;
    enriched: number;
    failed: number;
    processedAt?: string;
  }>().default(sql`'{"total":0,"processed":0,"skipped":0,"enriched":0,"failed":0}'::jsonb`),
  
  phoneEnrichmentStats: jsonb("phone_enrichment_stats").$type<{
    total: number;
    processed: number;
    skipped: number;
    enriched: number;
    failed: number;
    processedAt?: string;
  }>().default(sql`'{"total":0,"processed":0,"skipped":0,"enriched":0,"failed":0}'::jsonb`),
  
  errorMessage: text("error_message"),
  retryCount: integer("retry_count").default(0).notNull(),
  maxRetries: integer("max_retries").default(3).notNull(),
  
  startedAt: timestamp("started_at"),
  completedAt: timestamp("completed_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (table) => ({
  campaignIdx: index("verification_campaign_workflows_campaign_idx").on(table.campaignId),
  statusIdx: index("verification_campaign_workflows_status_idx").on(table.status),
  stageIdx: index("verification_campaign_workflows_stage_idx").on(table.currentStage),
}));

// Export Templates for Smart Export Mapper
export const exportTemplates = pgTable("export_templates", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull(),
  description: text("description"),
  templateType: varchar("template_type").notNull().default('verification_smart'), // verification_smart, standard, etc.
  fieldMappings: jsonb("field_mappings").notNull().$type<Record<string, string>>(), // { "our_field": "Client Column Name" }
  columnOrder: jsonb("column_order").$type<string[]>(), // Optional ordering
  createdBy: varchar("created_by").references(() => users.id, { onDelete: 'set null' }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => ({
  nameIdx: index("export_templates_name_idx").on(table.name),
  typeIdx: index("export_templates_type_idx").on(table.templateType),
  createdByIdx: index("export_templates_created_by_idx").on(table.createdBy),
}));

export const exportTemplatesRelations = relations(exportTemplates, ({ one }) => ({
  createdBy: one(users, { fields: [exportTemplates.createdBy], references: [users.id] }),
}));

// ==================== CLIENT PORTAL SYSTEM ====================

export const clientPortalOrderStatusEnum = pgEnum('client_portal_order_status', [
  'draft',           // Client is creating the order
  'submitted',       // Client submitted, awaiting admin approval
  'approved',        // Admin approved, ready for contact selection
  'in_fulfillment',  // Contacts being pulled from eligible pool
  'completed',       // Order fulfilled and delivered
  'rejected',        // Admin rejected the order
  'cancelled'        // Client or admin cancelled
]);

// Client Accounts - Organization-level entity for clients
export const clientAccounts = pgTable("client_accounts", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull(),
  contactEmail: text("contact_email"),
  contactPhone: text("contact_phone"),
  companyName: text("company_name"),
  notes: text("notes"),
  isActive: boolean("is_active").default(true).notNull(),
  createdBy: varchar("created_by").references(() => users.id, { onDelete: 'set null' }),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (table) => ({
  nameIdx: index("client_accounts_name_idx").on(table.name),
  activeIdx: index("client_accounts_active_idx").on(table.isActive),
}));

// Client Users - Separate auth for client portal login
export const clientUsers = pgTable("client_users", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  clientAccountId: varchar("client_account_id").references(() => clientAccounts.id, { onDelete: 'cascade' }).notNull(),
  email: text("email").notNull().unique(),
  password: text("password").notNull(),
  firstName: text("first_name"),
  lastName: text("last_name"),
  isActive: boolean("is_active").default(true).notNull(),
  lastLoginAt: timestamp("last_login_at"),
  createdBy: varchar("created_by").references(() => users.id, { onDelete: 'set null' }),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (table) => ({
  emailIdx: uniqueIndex("client_users_email_idx").on(table.email),
  clientAccountIdx: index("client_users_client_account_idx").on(table.clientAccountId),
  activeIdx: index("client_users_active_idx").on(table.isActive),
}));

// Client Campaign Access - Links clients to verification campaigns they can access
export const clientCampaignAccess = pgTable("client_campaign_access", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  clientAccountId: varchar("client_account_id").references(() => clientAccounts.id, { onDelete: 'cascade' }).notNull(),
  campaignId: varchar("campaign_id").references(() => verificationCampaigns.id, { onDelete: 'cascade' }).notNull(),
  grantedBy: varchar("granted_by").references(() => users.id, { onDelete: 'set null' }),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (table) => ({
  clientCampaignIdx: uniqueIndex("client_campaign_access_unique_idx").on(table.clientAccountId, table.campaignId),
  clientAccountIdx: index("client_campaign_access_client_idx").on(table.clientAccountId),
  campaignIdx: index("client_campaign_access_campaign_idx").on(table.campaignId),
}));

// Client Portal Orders - Monthly contact requests from clients
export const clientPortalOrders = pgTable("client_portal_orders", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  orderNumber: text("order_number").notNull().unique(),
  clientAccountId: varchar("client_account_id").references(() => clientAccounts.id, { onDelete: 'cascade' }).notNull(),
  clientUserId: varchar("client_user_id").references(() => clientUsers.id, { onDelete: 'set null' }),
  campaignId: varchar("campaign_id").references(() => verificationCampaigns.id, { onDelete: 'cascade' }).notNull(),
  
  // Order details
  requestedQuantity: integer("requested_quantity").notNull(),
  approvedQuantity: integer("approved_quantity"),
  deliveredQuantity: integer("delivered_quantity").default(0).notNull(),
  
  // Monthly period
  orderMonth: integer("order_month").notNull(), // 1-12
  orderYear: integer("order_year").notNull(),
  
  // Status workflow
  status: clientPortalOrderStatusEnum("status").default('draft').notNull(),
  
  // Client notes/comments
  clientNotes: text("client_notes"),
  
  // Admin approval workflow
  adminNotes: text("admin_notes"),
  approvedBy: varchar("approved_by").references(() => users.id, { onDelete: 'set null' }),
  approvedAt: timestamp("approved_at"),
  rejectedBy: varchar("rejected_by").references(() => users.id, { onDelete: 'set null' }),
  rejectedAt: timestamp("rejected_at"),
  rejectionReason: text("rejection_reason"),
  
  submittedAt: timestamp("submitted_at"),
  fulfilledAt: timestamp("fulfilled_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (table) => ({
  orderNumberIdx: uniqueIndex("client_portal_orders_order_number_idx").on(table.orderNumber),
  clientAccountIdx: index("client_portal_orders_client_account_idx").on(table.clientAccountId),
  campaignIdx: index("client_portal_orders_campaign_idx").on(table.campaignId),
  statusIdx: index("client_portal_orders_status_idx").on(table.status),
  monthYearIdx: index("client_portal_orders_month_year_idx").on(table.orderMonth, table.orderYear),
}));

// Client Portal Order Contacts - Contacts included in an order with edit/comment capability
export const clientPortalOrderContacts = pgTable("client_portal_order_contacts", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  orderId: varchar("order_id").references(() => clientPortalOrders.id, { onDelete: 'cascade' }).notNull(),
  verificationContactId: varchar("verification_contact_id").references(() => verificationContacts.id, { onDelete: 'cascade' }).notNull(),
  
  // Allow admin to edit/override contact data for this order
  editedData: jsonb("edited_data").$type<Record<string, unknown>>(), // Overrides for this delivery
  
  // Comments from admin or client
  adminComment: text("admin_comment"),
  clientComment: text("client_comment"),
  
  // Selection metadata
  selectionOrder: integer("selection_order").notNull(), // Priority order in which contact was selected
  selectedAt: timestamp("selected_at").notNull().defaultNow(),
  selectedBy: varchar("selected_by").references(() => users.id, { onDelete: 'set null' }),
  
  // Delivery status
  isDelivered: boolean("is_delivered").default(false).notNull(),
  deliveredAt: timestamp("delivered_at"),
  
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (table) => ({
  orderIdx: index("client_portal_order_contacts_order_idx").on(table.orderId),
  contactIdx: index("client_portal_order_contacts_contact_idx").on(table.verificationContactId),
  orderContactIdx: uniqueIndex("client_portal_order_contacts_unique_idx").on(table.orderId, table.verificationContactId),
}));

// Relations for Client Portal
export const clientAccountsRelations = relations(clientAccounts, ({ one, many }) => ({
  createdBy: one(users, { fields: [clientAccounts.createdBy], references: [users.id] }),
  users: many(clientUsers),
  campaignAccess: many(clientCampaignAccess),
  orders: many(clientPortalOrders),
}));

export const clientUsersRelations = relations(clientUsers, ({ one, many }) => ({
  clientAccount: one(clientAccounts, { fields: [clientUsers.clientAccountId], references: [clientAccounts.id] }),
  createdBy: one(users, { fields: [clientUsers.createdBy], references: [users.id] }),
  orders: many(clientPortalOrders),
}));

export const clientCampaignAccessRelations = relations(clientCampaignAccess, ({ one }) => ({
  clientAccount: one(clientAccounts, { fields: [clientCampaignAccess.clientAccountId], references: [clientAccounts.id] }),
  campaign: one(verificationCampaigns, { fields: [clientCampaignAccess.campaignId], references: [verificationCampaigns.id] }),
  grantedBy: one(users, { fields: [clientCampaignAccess.grantedBy], references: [users.id] }),
}));

export const clientPortalOrdersRelations = relations(clientPortalOrders, ({ one, many }) => ({
  clientAccount: one(clientAccounts, { fields: [clientPortalOrders.clientAccountId], references: [clientAccounts.id] }),
  clientUser: one(clientUsers, { fields: [clientPortalOrders.clientUserId], references: [clientUsers.id] }),
  campaign: one(verificationCampaigns, { fields: [clientPortalOrders.campaignId], references: [verificationCampaigns.id] }),
  approvedByUser: one(users, { fields: [clientPortalOrders.approvedBy], references: [users.id] }),
  rejectedByUser: one(users, { fields: [clientPortalOrders.rejectedBy], references: [users.id] }),
  contacts: many(clientPortalOrderContacts),
}));

export const clientPortalOrderContactsRelations = relations(clientPortalOrderContacts, ({ one }) => ({
  order: one(clientPortalOrders, { fields: [clientPortalOrderContacts.orderId], references: [clientPortalOrders.id] }),
  verificationContact: one(verificationContacts, { fields: [clientPortalOrderContacts.verificationContactId], references: [verificationContacts.id] }),
  selectedByUser: one(users, { fields: [clientPortalOrderContacts.selectedBy], references: [users.id] }),
}));

// ==================== END CLIENT PORTAL SYSTEM ====================

export const verificationCampaignsRelations = relations(verificationCampaigns, ({ one, many }) => ({
  createdBy: one(users, { fields: [verificationCampaigns.createdBy], references: [users.id] }),
  contacts: many(verificationContacts),
  suppressionList: many(verificationSuppressionList),
  leadSubmissions: many(verificationLeadSubmissions),
}));

export const verificationContactsRelations = relations(verificationContacts, ({ one, many }) => ({
  campaign: one(verificationCampaigns, { fields: [verificationContacts.campaignId], references: [verificationCampaigns.id] }),
  account: one(accounts, { fields: [verificationContacts.accountId], references: [accounts.id] }),
  assignee: one(users, { fields: [verificationContacts.assigneeId], references: [users.id] }),
  emailValidation: one(verificationEmailValidations, { fields: [verificationContacts.id], references: [verificationEmailValidations.contactId] }),
  leadSubmission: one(verificationLeadSubmissions),
}));

// ==================== Agent Performance & Gamification System ====================

export const periodStatusEnum = pgEnum('period_status', ['upcoming', 'active', 'completed', 'archived']);
export const goalTypeEnum = pgEnum('goal_type', ['qualified_leads', 'accepted_leads', 'call_volume', 'conversion_rate', 'custom']);

// Performance Periods - Time-boxed tracking periods (monthly, weekly, etc.)
export const performancePeriods = pgTable("performance_periods", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  label: text("label").notNull(), // e.g., "January 2025", "Q1 2025"
  startAt: timestamp("start_at").notNull(),
  endAt: timestamp("end_at").notNull(),
  status: periodStatusEnum("status").default('upcoming').notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (table) => ({
  statusIdx: index("performance_periods_status_idx").on(table.status),
  dateRangeIdx: index("performance_periods_date_range_idx").on(table.startAt, table.endAt),
}));

// Goal Definitions - Reusable goal templates
export const goalDefinitions = pgTable("goal_definitions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull(), // e.g., "Monthly Qualified Leads Target"
  description: text("description"),
  goalType: goalTypeEnum("goal_type").notNull(),
  defaultTargetValue: integer("default_target_value").notNull(), // Default target number
  active: boolean("active").default(true).notNull(),
  createdBy: varchar("created_by").references(() => users.id, { onDelete: 'set null' }),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (table) => ({
  nameIdx: index("goal_definitions_name_idx").on(table.name),
  typeIdx: index("goal_definitions_type_idx").on(table.goalType),
  activeIdx: index("goal_definitions_active_idx").on(table.active),
}));

// Gamification Rewards - Reward catalog
export const gamificationRewards = pgTable("gamification_rewards", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull(), // e.g., "Top Performer Bonus"
  description: text("description"),
  rewardValue: numeric("reward_value"), // Monetary value (e.g., 10000 for $10k)
  rewardCurrency: varchar("reward_currency", { length: 3 }).default('USD'),
  criteria: jsonb("criteria").$type<{
    type: 'rank' | 'threshold' | 'percentile';
    value: number;
  }>(),
  fulfillmentChannel: text("fulfillment_channel"), // e.g., "payroll", "gift_card", "recognition"
  active: boolean("active").default(true).notNull(),
  createdBy: varchar("created_by").references(() => users.id, { onDelete: 'set null' }),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (table) => ({
  nameIdx: index("gamification_rewards_name_idx").on(table.name),
  activeIdx: index("gamification_rewards_active_idx").on(table.active),
}));

// Agent Goals - Links agents to goals for specific periods
export const agentGoals = pgTable("agent_goals", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  agentId: varchar("agent_id").references(() => users.id, { onDelete: 'cascade' }).notNull(),
  periodId: varchar("period_id").references(() => performancePeriods.id, { onDelete: 'cascade' }).notNull(),
  goalDefinitionId: varchar("goal_definition_id").references(() => goalDefinitions.id, { onDelete: 'restrict' }).notNull(),
  targetValue: integer("target_value").notNull(), // Can override default
  rewardId: varchar("reward_id").references(() => gamificationRewards.id, { onDelete: 'set null' }),
  createdBy: varchar("created_by").references(() => users.id, { onDelete: 'set null' }),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (table) => ({
  agentPeriodIdx: index("agent_goals_agent_period_idx").on(table.agentId, table.periodId),
  periodIdx: index("agent_goals_period_idx").on(table.periodId),
  goalDefIdx: index("agent_goals_goal_def_idx").on(table.goalDefinitionId),
}));

// Agent Period Stats - Cached aggregates refreshed nightly or on-demand
export const agentPeriodStats = pgTable("agent_period_stats", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  agentId: varchar("agent_id").references(() => users.id, { onDelete: 'cascade' }).notNull(),
  periodId: varchar("period_id").references(() => performancePeriods.id, { onDelete: 'cascade' }).notNull(),
  totalCalls: integer("total_calls").default(0).notNull(),
  qualifiedLeads: integer("qualified_leads").default(0).notNull(),
  acceptedLeads: integer("accepted_leads").default(0).notNull(),
  rejectedLeads: integer("rejected_leads").default(0).notNull(),
  pendingReview: integer("pending_review").default(0).notNull(),
  conversionRate: numeric("conversion_rate", { precision: 5, scale: 2 }), // % of qualified leads accepted
  avgCallDuration: integer("avg_call_duration"), // Average in seconds
  calculatedAt: timestamp("calculated_at").notNull().defaultNow(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (table) => ({
  agentPeriodUniq: uniqueIndex("agent_period_stats_agent_period_uniq").on(table.agentId, table.periodId),
  periodIdx: index("agent_period_stats_period_idx").on(table.periodId),
  qualifiedLeadsIdx: index("agent_period_stats_qualified_idx").on(table.qualifiedLeads),
  acceptedLeadsIdx: index("agent_period_stats_accepted_idx").on(table.acceptedLeads),
}));

// Relations
export const performancePeriodsRelations = relations(performancePeriods, ({ many }) => ({
  agentStats: many(agentPeriodStats),
  agentGoals: many(agentGoals),
}));

export const goalDefinitionsRelations = relations(goalDefinitions, ({ one, many }) => ({
  createdBy: one(users, { fields: [goalDefinitions.createdBy], references: [users.id] }),
  agentGoals: many(agentGoals),
}));

export const gamificationRewardsRelations = relations(gamificationRewards, ({ one, many }) => ({
  createdBy: one(users, { fields: [gamificationRewards.createdBy], references: [users.id] }),
  agentGoals: many(agentGoals),
}));

export const agentGoalsRelations = relations(agentGoals, ({ one }) => ({
  agent: one(users, { fields: [agentGoals.agentId], references: [users.id] }),
  period: one(performancePeriods, { fields: [agentGoals.periodId], references: [performancePeriods.id] }),
  goalDefinition: one(goalDefinitions, { fields: [agentGoals.goalDefinitionId], references: [goalDefinitions.id] }),
  reward: one(gamificationRewards, { fields: [agentGoals.rewardId], references: [gamificationRewards.id] }),
  createdBy: one(users, { fields: [agentGoals.createdBy], references: [users.id] }),
}));

export const agentPeriodStatsRelations = relations(agentPeriodStats, ({ one }) => ({
  agent: one(users, { fields: [agentPeriodStats.agentId], references: [users.id] }),
  period: one(performancePeriods, { fields: [agentPeriodStats.periodId], references: [performancePeriods.id] }),
}));

// ==================== Pipeline Management ====================
export const pipelines = pgTable("pipelines", {
  id: varchar("id", { length: 36 }).primaryKey(),
  tenantId: varchar("tenant_id", { length: 36 }),
  name: varchar("name", { length: 255 }).notNull(),
  description: text("description"),
  category: pipelineCategoryEnum("category").default('direct_sales').notNull(), // Dual-pipeline: Media Partnership vs Direct Sales
  ownerId: varchar("owner_id", { length: 36 }).notNull().references(() => users.id, { onDelete: 'cascade' }),
  defaultCurrency: varchar("default_currency", { length: 3 }).default('USD').notNull(),
  stageOrder: jsonb("stage_order").$type<string[]>().notNull(),
  slaPolicy: jsonb("sla_policy")
    .$type<{ response?: string | null; followUp?: string | null; quietHours?: string | null }>()
    .default(sql`'{}'::jsonb`)
    .notNull(),
  active: boolean("active").default(true).notNull(),
  type: pipelineTypeEnum("type").default('revenue').notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

// Temporarily commented out due to Drizzle index issue
// export const pipelineOwnerIdx = index("pipelines_owner_idx").on(pipelines.ownerId);
// export const pipelineActiveIdx = index("pipelines_active_idx").on(pipelines.active);

export const pipelineOpportunities = pgTable("pipeline_opportunities", {
  id: varchar("id", { length: 36 }).primaryKey(),
  tenantId: varchar("tenant_id", { length: 36 }),
  pipelineId: varchar("pipeline_id", { length: 36 })
    .notNull()
    .references(() => pipelines.id, { onDelete: 'cascade' }),
  accountId: varchar("account_id", { length: 36 }).references(() => accounts.id, { onDelete: 'set null' }),
  contactId: varchar("contact_id", { length: 36 }).references(() => contacts.id, { onDelete: 'set null' }),
  ownerId: varchar("owner_id", { length: 36 }).references(() => users.id, { onDelete: 'set null' }),
  name: varchar("name", { length: 255 }).notNull(),
  stage: varchar("stage", { length: 120 }).notNull(),
  status: pipelineOpportunityStatusEnum("status").default('open').notNull(),
  amount: numeric("amount", { precision: 14, scale: 2 }).default('0').notNull(),
  currency: varchar("currency", { length: 3 }).default('USD').notNull(),
  probability: integer("probability").default(0).notNull(),
  closeDate: timestamp("close_date", { withTimezone: true }),
  forecastCategory: varchar("forecast_category", { length: 64 }).default('Pipeline').notNull(),
  flaggedForSla: boolean("flagged_for_sla").default(false).notNull(),
  reason: text("reason"),
  
  // Media & Data Partnership Fields (CPL/CPC Model)
  partnerName: varchar("partner_name", { length: 255 }),
  partnershipType: partnershipTypeEnum("partnership_type"),
  pricingModel: pricingModelEnum("pricing_model"),
  costPerLead: numeric("cost_per_lead", { precision: 10, scale: 2 }),
  costPerContact: numeric("cost_per_contact", { precision: 10, scale: 2 }),
  leadVolumeGoal: integer("lead_volume_goal"),
  qualityTier: qualityTierEnum("quality_tier"),
  partnerAccountManager: varchar("partner_account_manager", { length: 255 }),
  deliveryMethod: deliveryMethodEnum("delivery_method"),
  associatedCampaignIds: jsonb("associated_campaign_ids").$type<string[]>(),
  
  // Direct Sales (Medium & Enterprise) Fields
  contractType: contractTypeEnum("contract_type"),
  estimatedDealValue: numeric("estimated_deal_value", { precision: 14, scale: 2 }),
  intentScore: integer("intent_score"), // 0-100
  leadSource: varchar("lead_source", { length: 255 }),
  decisionMakers: jsonb("decision_makers").$type<Array<{ name: string; role: string; email?: string }>>(),
  touchpointLog: jsonb("touchpoint_log").$type<Array<{ date: string; type: string; notes: string }>>(),
  
  // Intelligent Sales System - Scoring Fields (Current State)
  engagementScore: integer("engagement_score").default(0), // 0-100: Email opens, replies, meeting attendance
  fitScore: integer("fit_score").default(0), // 0-100: Company size, industry match, role alignment
  stageProbability: integer("stage_probability").default(0), // 0-100: Likelihood of current stage success
  nextActionAiSuggestion: text("next_action_ai_suggestion"), // AI-recommended next action
  lastActivityAt: timestamp("last_activity_at", { withTimezone: true }), // Most recent interaction
  
  // Import tracking fields
  sourceAsset: varchar("source_asset", { length: 255 }),
  dateCaptured: varchar("date_captured", { length: 64 }),
  
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

// Temporarily commented out due to Drizzle index issue
// export const pipelineOpportunitiesPipelineIdx = index("pipeline_opportunities_pipeline_idx").on(pipelineOpportunities.pipelineId);
// export const pipelineOpportunitiesAccountIdx = index("pipeline_opportunities_account_idx").on(pipelineOpportunities.accountId);
// export const pipelineOpportunitiesOwnerIdx = index("pipeline_opportunities_owner_idx").on(pipelineOpportunities.ownerId);

// ============================================================================
// INTELLIGENT SALES SYSTEM TABLES
// ============================================================================

// Deal Activities - Append-only activity ledger for all deal interactions
export const dealActivities = pgTable("deal_activities", {
  id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  opportunityId: varchar("opportunity_id", { length: 36 })
    .notNull()
    .references(() => pipelineOpportunities.id, { onDelete: 'cascade' }),
  activityType: dealActivityTypeEnum("activity_type").notNull(),
  actorId: varchar("actor_id", { length: 36 }).references(() => users.id, { onDelete: 'set null' }), // Who performed the action
  actorEmail: varchar("actor_email", { length: 320 }), // For external actors (e.g., customer emails)
  title: varchar("title", { length: 255 }).notNull(),
  description: text("description"),
  metadata: jsonb("metadata").$type<Record<string, any>>(), // Flexible JSON payload for activity-specific data
  sourceReference: varchar("source_reference", { length: 255 }), // Reference to source record (email ID, meeting ID, etc.)
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

// Lead Forms - Definitions for lead capture forms
export const leadForms = pgTable("lead_forms", {
  id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  name: varchar("name", { length: 255 }).notNull(),
  formType: leadFormTypeEnum("form_type").notNull(),
  pipelineId: varchar("pipeline_id", { length: 36 })
    .notNull()
    .references(() => pipelines.id, { onDelete: 'cascade' }),
  initialStage: varchar("initial_stage", { length: 120 }).notNull(), // Which stage new opportunities start in
  autoAssignToUserId: varchar("auto_assign_to_user_id", { length: 36 }).references(() => users.id, { onDelete: 'set null' }),
  webhookUrl: varchar("webhook_url", { length: 512 }), // Optional webhook to call on submission
  isActive: boolean("is_active").default(true).notNull(),
  assetUrl: varchar("asset_url", { length: 512 }), // URL to the downloadable asset (for ebooks, whitepapers, etc.)
  thankYouMessage: text("thank_you_message"),
  formConfig: jsonb("form_config").$type<{
    fields: Array<{ name: string; required: boolean; type: string }>;
    submitButtonText?: string;
    styling?: Record<string, any>;
  }>(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

// Lead Form Submissions - Captures form submissions that auto-create opportunities
export const leadFormSubmissions = pgTable("lead_form_submissions", {
  id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  formId: varchar("form_id", { length: 36 })
    .notNull()
    .references(() => leadForms.id, { onDelete: 'cascade' }),
  opportunityId: varchar("opportunity_id", { length: 36 }).references(() => pipelineOpportunities.id, { onDelete: 'set null' }), // Created opportunity
  submitterEmail: varchar("submitter_email", { length: 320 }).notNull(),
  submitterName: varchar("submitter_name", { length: 255 }),
  companyName: varchar("company_name", { length: 255 }),
  jobTitle: varchar("job_title", { length: 255 }),
  formData: jsonb("form_data").$type<Record<string, any>>().notNull(), // All form field values
  ipAddress: varchar("ip_address", { length: 45 }), // For spam detection
  userAgent: text("user_agent"),
  sourceUrl: varchar("source_url", { length: 512 }), // Page where form was submitted
  processed: boolean("processed").default(false).notNull(), // Whether orchestration worker has processed this
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

// Phase 2: AI Insights, Conversation Tracking, and Audit Tables

// Deal Insights - AI-generated insights about opportunities
export const dealInsights = pgTable("deal_insights", {
  id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  opportunityId: varchar("opportunity_id", { length: 36 })
    .notNull()
    .references(() => pipelineOpportunities.id, { onDelete: 'cascade' }),
  insightType: dealInsightTypeEnum("insight_type").notNull(),
  source: varchar("source", { length: 64 }).notNull(), // 'ai_email_analysis', 'ai_call_analysis', 'manual', 'rule_engine'
  title: varchar("title", { length: 255 }).notNull(),
  description: text("description"),
  confidence: integer("confidence").default(0), // AI confidence score 0-100
  status: insightStatusEnum("status").default('active').notNull(),
  metadata: jsonb("metadata").$type<Record<string, any>>(), // Insight-specific data
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }), // When insight becomes stale
}, (table) => ({
  opportunityIdx: index("deal_insights_opportunity_idx").on(table.opportunityId),
  insightTypeIdx: index("deal_insights_type_idx").on(table.insightType),
  createdAtIdx: index("deal_insights_created_at_idx").on(table.createdAt.desc()),
  statusIdx: index("deal_insights_status_idx").on(table.status),
  // Unique constraint for deduplication
  uniqueInsightIdx: uniqueIndex("deal_insights_unique_idx")
    .on(table.opportunityId, table.insightType, table.source, table.createdAt),
}));

// Deal Conversations - Email thread grouping for M365 emails
export const dealConversations = pgTable("deal_conversations", {
  id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  opportunityId: varchar("opportunity_id", { length: 36 })
    .references(() => pipelineOpportunities.id, { onDelete: 'set null' }), // Preserve history if opp deleted
  subject: varchar("subject", { length: 512 }).default('').notNull(),
  threadId: varchar("thread_id", { length: 255 }), // M365 conversation/thread ID
  participantEmails: text("participant_emails").array(), // All participants in thread
  messageCount: integer("message_count").default(0).notNull(),
  lastMessageAt: timestamp("last_message_at", { withTimezone: true }),
  direction: emailDirectionEnum("direction"), // Primary direction of conversation
  status: varchar("status", { length: 32 }).default('active').notNull(), // active, archived
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => ({
  opportunityIdx: index("deal_conversations_opportunity_idx").on(table.opportunityId),
  threadIdIdx: uniqueIndex("deal_conversations_thread_id_idx")
    .on(table.threadId)
    .where(sql`${table.threadId} IS NOT NULL`),
  lastMessageIdx: index("deal_conversations_last_message_idx").on(table.lastMessageAt.desc()),
  // GIN index for participant email lookups
  participantsIdx: index("deal_conversations_participants_idx")
    .using('gin', table.participantEmails),
}));

// Deal Messages - Individual M365 emails linked to deals
export const dealMessages = pgTable("deal_messages", {
  id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  conversationId: varchar("conversation_id", { length: 36 })
    .notNull()
    .references(() => dealConversations.id, { onDelete: 'cascade' }),
  opportunityId: varchar("opportunity_id", { length: 36 })
    .references(() => pipelineOpportunities.id, { onDelete: 'set null' }), // Denormalized for direct joins
  m365MessageId: text("m365_message_id").unique().notNull(), // Microsoft Graph message ID (can be very long)
  fromEmail: varchar("from_email", { length: 320 }).notNull(),
  toEmails: text("to_emails").array().notNull(), // Recipients
  ccEmails: text("cc_emails").array(), // CC'd recipients
  subject: varchar("subject", { length: 512 }),
  bodyPreview: text("body_preview"), // First 255 chars
  bodyContent: text("body_content"), // Full email body
  direction: emailDirectionEnum("direction").notNull(), // inbound or outbound
  messageStatus: messageStatusEnum("message_status").default('delivered').notNull(),
  sentAt: timestamp("sent_at", { withTimezone: true }),
  receivedAt: timestamp("received_at", { withTimezone: true }),
  isFromCustomer: boolean("is_from_customer").default(false).notNull(), // From external party
  hasAttachments: boolean("has_attachments").default(false).notNull(),
  importance: varchar("importance", { length: 16 }).default('normal'), // low, normal, high
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => ({
  conversationIdx: index("deal_messages_conversation_idx").on(table.conversationId),
  opportunityIdx: index("deal_messages_opportunity_idx").on(table.opportunityId),
  m365MessageIdx: uniqueIndex("deal_messages_m365_message_idx").on(table.m365MessageId),
  sentAtIdx: index("deal_messages_sent_at_idx").on(table.sentAt.desc()),
  directionIdx: index("deal_messages_direction_idx").on(table.direction),
  // GIN indexes for email array lookups
  toEmailsIdx: index("deal_messages_to_emails_idx").using('gin', table.toEmails),
  ccEmailsIdx: index("deal_messages_cc_emails_idx").using('gin', table.ccEmails),
}));

// Email Tracking - Opens, clicks, and engagement tracking
export const emailOpens = pgTable("email_opens", {
  id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  messageId: varchar("message_id", { length: 36 }).notNull().references(() => dealMessages.id, { onDelete: 'cascade' }),
  recipientEmail: varchar("recipient_email", { length: 320 }).notNull(),
  openedAt: timestamp("opened_at", { withTimezone: true }).notNull().defaultNow(),
  ipAddress: varchar("ip_address", { length: 45 }),
  userAgent: text("user_agent"),
  location: jsonb("location").$type<{ city?: string; region?: string; country?: string }>(),
  deviceType: varchar("device_type", { length: 32 }), // desktop, mobile, tablet
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => ({
  messageIdx: index("email_opens_message_idx").on(table.messageId),
  recipientIdx: index("email_opens_recipient_idx").on(table.recipientEmail),
  openedAtIdx: index("email_opens_opened_at_idx").on(table.openedAt.desc()),
}));

export const emailLinkClicks = pgTable("email_link_clicks", {
  id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  messageId: varchar("message_id", { length: 36 }).notNull().references(() => dealMessages.id, { onDelete: 'cascade' }),
  recipientEmail: varchar("recipient_email", { length: 320 }).notNull(),
  linkUrl: text("link_url").notNull(),
  linkText: text("link_text"),
  clickedAt: timestamp("clicked_at", { withTimezone: true }).notNull().defaultNow(),
  ipAddress: varchar("ip_address", { length: 45 }),
  userAgent: text("user_agent"),
  deviceType: varchar("device_type", { length: 32 }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => ({
  messageIdx: index("email_link_clicks_message_idx").on(table.messageId),
  recipientIdx: index("email_link_clicks_recipient_idx").on(table.recipientEmail),
  clickedAtIdx: index("email_link_clicks_clicked_at_idx").on(table.clickedAt.desc()),
}));

// Scheduled Emails - Queue for future sending
export const scheduledEmails = pgTable("scheduled_emails", {
  id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  mailboxAccountId: varchar("mailbox_account_id", { length: 36 }).notNull().references(() => mailboxAccounts.id, { onDelete: 'cascade' }),
  fromEmail: varchar("from_email", { length: 320 }).notNull(),
  toEmails: text("to_emails").array().notNull(),
  ccEmails: text("cc_emails").array(),
  bccEmails: text("bcc_emails").array(),
  subject: varchar("subject", { length: 512 }).notNull(),
  bodyHtml: text("body_html").notNull(),
  bodyPlain: text("body_plain"),
  attachments: jsonb("attachments").$type<Array<{ name: string; url: string; size: number }>>(),
  scheduledFor: timestamp("scheduled_for", { withTimezone: true }).notNull(),
  status: varchar("status", { length: 32 }).notNull().default('pending'), // pending, sent, failed, cancelled
  sentAt: timestamp("sent_at", { withTimezone: true }),
  failureReason: text("failure_reason"),
  opportunityId: varchar("opportunity_id", { length: 36 }).references(() => pipelineOpportunities.id, { onDelete: 'set null' }),
  contactId: varchar("contact_id", { length: 36 }).references(() => contacts.id, { onDelete: 'set null' }),
  accountId: varchar("account_id", { length: 36 }).references(() => accounts.id, { onDelete: 'set null' }),
  createdBy: varchar("created_by", { length: 36 }).notNull().references(() => users.id, { onDelete: 'cascade' }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => ({
  scheduledForIdx: index("scheduled_emails_scheduled_for_idx").on(table.scheduledFor),
  statusIdx: index("scheduled_emails_status_idx").on(table.status),
  mailboxIdx: index("scheduled_emails_mailbox_idx").on(table.mailboxAccountId),
  opportunityIdx: index("scheduled_emails_opportunity_idx").on(table.opportunityId),
}));

// Email AI Rewrites - History of AI email rewrites
export const emailAiRewrites = pgTable("email_ai_rewrites", {
  id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id", { length: 36 }).notNull().references(() => users.id, { onDelete: 'cascade' }),
  originalText: text("original_text").notNull(),
  rewrittenText: text("rewritten_text").notNull(),
  tone: varchar("tone", { length: 32 }), // professional, friendly, formal, casual
  instructions: text("instructions"), // User-provided instructions for rewrite
  aiModel: varchar("ai_model", { length: 64 }).default('gpt-4o'),
  analysisResults: jsonb("analysis_results").$type<{
    clarity?: number;
    tone?: string;
    professionalism?: number;
    suggestions?: string[];
  }>(),
  accepted: boolean("accepted").default(false),
  messageId: varchar("message_id", { length: 36 }).references(() => dealMessages.id, { onDelete: 'set null' }), // Link to sent email if accepted
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => ({
  userIdx: index("email_ai_rewrites_user_idx").on(table.userId),
  createdAtIdx: index("email_ai_rewrites_created_at_idx").on(table.createdAt.desc()),
  messageIdx: index("email_ai_rewrites_message_idx").on(table.messageId),
}));

// Email Signatures - User email signatures
export const emailSignatures = pgTable("email_signatures", {
  id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id", { length: 36 }).notNull().references(() => users.id, { onDelete: 'cascade' }),
  name: varchar("name", { length: 255 }).notNull(),
  signatureHtml: text("signature_html").notNull(),
  signaturePlain: text("signature_plain"),
  isDefault: boolean("is_default").default(false).notNull(),
  active: boolean("active").default(true).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => ({
  userIdx: index("email_signatures_user_idx").on(table.userId),
  defaultIdx: index("email_signatures_default_idx").on(table.userId, table.isDefault),
}));

// Inbox Categories - For Primary/Other inbox categorization
export const inboxCategories = pgTable("inbox_categories", {
  id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id", { length: 36 }).notNull().references(() => users.id, { onDelete: 'cascade' }),
  messageId: varchar("message_id", { length: 36 }).notNull().references(() => dealMessages.id, { onDelete: 'cascade' }),
  category: varchar("category", { length: 32 }).notNull().default('other'), // primary, other
  isRead: boolean("is_read").default(false).notNull(),
  isStarred: boolean("is_starred").default(false).notNull(),
  isArchived: boolean("is_archived").default(false).notNull(),
  readAt: timestamp("read_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => ({
  userIdx: index("inbox_categories_user_idx").on(table.userId),
  messageIdx: uniqueIndex("inbox_categories_message_user_idx").on(table.userId, table.messageId),
  categoryIdx: index("inbox_categories_category_idx").on(table.userId, table.category),
  isReadIdx: index("inbox_categories_is_read_idx").on(table.userId, table.isRead),
}));

// Deal Score History - Audit trail for score changes
export const dealScoreHistory = pgTable("deal_score_history", {
  id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  opportunityId: varchar("opportunity_id", { length: 36 })
    .notNull()
    .references(() => pipelineOpportunities.id, { onDelete: 'cascade' }),
  scoreType: varchar("score_type", { length: 32 }).notNull(), // 'engagement_score', 'fit_score', 'intent_score', 'stage_probability'
  previousValue: integer("previous_value"),
  newValue: integer("new_value").notNull(),
  delta: integer("delta"), // newValue - previousValue (for analytics)
  changeReason: varchar("change_reason", { length: 64 }).notNull(), // 'email_opened', 'email_replied', 'meeting_attended', 'manual_update', 'ai_analysis'
  changedBy: varchar("changed_by", { length: 36 })
    .references(() => users.id, { onDelete: 'set null' }), // NULL for automated changes
  metadata: jsonb("metadata").$type<Record<string, any>>(), // Context about what triggered the change
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => ({
  opportunityIdx: index("deal_score_history_opportunity_idx").on(table.opportunityId),
  scoreTypeIdx: index("deal_score_history_score_type_idx").on(table.scoreType),
  createdAtIdx: index("deal_score_history_created_at_idx").on(table.createdAt.desc()),
  changedByIdx: index("deal_score_history_changed_by_idx").on(table.changedBy),
}));

export const insertPipelineSchema = createInsertSchema(pipelines)
  .omit({ 
    id: true, 
    createdAt: true, 
    updatedAt: true,
  })
  .partial({
    ownerId: true,
    tenantId: true,
  })
  .extend({
    stageOrder: z.array(z.string()).min(1, "At least one stage is required"),
    slaPolicy: z.object({
      response: z.string().nullable().optional(),
      followUp: z.string().nullable().optional(),
      quietHours: z.string().nullable().optional(),
    }).optional(),
  });

export const insertPipelineOpportunitySchema = createInsertSchema(pipelineOpportunities)
  .omit({
    id: true,
    createdAt: true,
    updatedAt: true,
  })
  .partial({
    ownerId: true,
    tenantId: true,
  });

// Pipeline Import Schema
export const pipelineImportRowSchema = z.object({
  leadName: z.string().min(1, "Lead name is required"),
  jobTitle: z.string().optional(),
  email: z.string().email("Valid email is required"),
  companyName: z.string().min(1, "Company name is required"),
  industry: z.string().optional(),
  companyDescription: z.string().optional(),
  hqLocation: z.string().optional(),
  sourceAsset: z.string().optional(),
  dateCaptured: z.string().optional(),
  opportunityName: z.string().optional(), // Override if provided
  amount: z.string().optional(),
  probability: z.number().min(0).max(100).optional(),
});

export type PipelineImportRow = z.infer<typeof pipelineImportRowSchema>;

export const pipelineBulkImportSchema = z.object({
  pipelineId: z.string().min(1, "Pipeline ID is required"),
  stage: z.string().min(1, "Stage is required"),
  rows: z.array(pipelineImportRowSchema).min(1, "At least one row is required"),
  createMissingAccounts: z.boolean().default(true),
  createMissingContacts: z.boolean().default(true),
});

export type PipelineBulkImport = z.infer<typeof pipelineBulkImportSchema>;

// Intelligent Sales System - Insert Schemas & Types
export const insertDealActivitySchema = createInsertSchema(dealActivities)
  .omit({
    id: true,
    createdAt: true,
  });

export const insertLeadFormSchema = createInsertSchema(leadForms)
  .omit({
    id: true,
    createdAt: true,
    updatedAt: true,
  });

export const insertLeadFormSubmissionSchema = createInsertSchema(leadFormSubmissions)
  .omit({
    id: true,
    createdAt: true,
  });

// Phase 2 Insert Schemas
export const insertDealInsightSchema = createInsertSchema(dealInsights)
  .omit({
    id: true,
    createdAt: true,
  });

export const insertDealConversationSchema = createInsertSchema(dealConversations)
  .omit({
    id: true,
    createdAt: true,
    updatedAt: true,
  });

export const insertDealMessageSchema = createInsertSchema(dealMessages)
  .omit({
    id: true,
    createdAt: true,
  });

export const insertDealScoreHistorySchema = createInsertSchema(dealScoreHistory)
  .omit({
    id: true,
    createdAt: true,
  });

export type DealActivity = typeof dealActivities.$inferSelect;
export type InsertDealActivity = z.infer<typeof insertDealActivitySchema>;

export type LeadForm = typeof leadForms.$inferSelect;
export type InsertLeadForm = z.infer<typeof insertLeadFormSchema>;

export type LeadFormSubmission = typeof leadFormSubmissions.$inferSelect;
export type InsertLeadFormSubmission = z.infer<typeof insertLeadFormSubmissionSchema>;

// Phase 2 Types
export type DealInsight = typeof dealInsights.$inferSelect;
export type InsertDealInsight = z.infer<typeof insertDealInsightSchema>;

export type DealConversation = typeof dealConversations.$inferSelect;
export type InsertDealConversation = z.infer<typeof insertDealConversationSchema>;

export type DealMessage = typeof dealMessages.$inferSelect;
export type InsertDealMessage = z.infer<typeof insertDealMessageSchema>;

export type DealScoreHistory = typeof dealScoreHistory.$inferSelect;
export type InsertDealScoreHistory = z.infer<typeof insertDealScoreHistorySchema>;

export const mailboxAccounts = pgTable("mailbox_accounts", {
  id: varchar("id", { length: 36 }).primaryKey(),
  tenantId: varchar("tenant_id", { length: 36 }),
  userId: varchar("user_id", { length: 36 }).notNull().references(() => users.id, { onDelete: 'cascade' }),
  provider: varchar("provider", { length: 32 }).notNull(),
  status: varchar("status", { length: 32 }).default('disconnected').notNull(),
  mailboxEmail: varchar("mailbox_email", { length: 320 }),
  displayName: varchar("display_name", { length: 255 }),
  connectedAt: timestamp("connected_at", { withTimezone: true }),
  lastSyncAt: timestamp("last_sync_at", { withTimezone: true }),
  accessToken: text("access_token"),
  refreshToken: text("refresh_token"),
  tokenExpiresAt: timestamp("token_expires_at", { withTimezone: true }),
  encryptedTokens: text("encrypted_tokens"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

// Temporarily commented out due to Drizzle index issue
// export const mailboxAccountsUserIdx = index("mailbox_accounts_user_idx").on(mailboxAccounts.userId, mailboxAccounts.provider);

export const insertMailboxAccountSchema = createInsertSchema(mailboxAccounts).omit({ id: true, createdAt: true, updatedAt: true });

// M365 Synced Activities (GDPR-compliant email metadata only)
export const m365Activities = pgTable("m365_activities", {
  id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  mailboxAccountId: varchar("mailbox_account_id", { length: 36 }).notNull().references(() => mailboxAccounts.id, { onDelete: 'cascade' }),
  activityType: m365ActivityTypeEnum("activity_type").default('email').notNull(),
  direction: m365ActivityDirectionEnum("direction").notNull(),

  // Microsoft Graph IDs
  messageId: text("message_id").notNull(),
  conversationId: text("conversation_id"),

  // Email metadata (GDPR-compliant - no full body)
  subject: text("subject"),
  bodyPreview: text("body_preview"),
  importance: varchar("importance", { length: 16 }),

  // Participants
  fromEmail: varchar("from_email", { length: 320 }),
  fromName: varchar("from_name", { length: 255 }),
  toRecipients: jsonb("to_recipients"),
  ccRecipients: jsonb("cc_recipients"),

  // Timestamps
  receivedDateTime: timestamp("received_datetime", { withTimezone: true }),
  sentDateTime: timestamp("sent_datetime", { withTimezone: true }),

  // Flags
  isRead: boolean("is_read").default(false),
  hasAttachments: boolean("has_attachments").default(false),

  // CRM Linking
  accountId: varchar("account_id", { length: 36 }).references(() => accounts.id, { onDelete: 'set null' }),
  contactId: varchar("contact_id", { length: 36 }).references(() => contacts.id, { onDelete: 'set null' }),

  // Metadata
  webLink: text("web_link"),
  syncedAt: timestamp("synced_at", { withTimezone: true }).defaultNow().notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => ({
  mailboxIdx: index("m365_activities_mailbox_idx").on(table.mailboxAccountId),
  messageIdx: index("m365_activities_message_idx").on(table.messageId),
  accountIdx: index("m365_activities_account_idx").on(table.accountId),
  contactIdx: index("m365_activities_contact_idx").on(table.contactId),
  receivedIdx: index("m365_activities_received_idx").on(table.receivedDateTime),
}));

export const insertM365ActivitySchema = createInsertSchema(m365Activities).omit({ id: true, createdAt: true, syncedAt: true });

// Email Hub Insert Schemas
export const insertEmailOpenSchema = createInsertSchema(emailOpens).omit({ id: true, createdAt: true });
export const insertEmailLinkClickSchema = createInsertSchema(emailLinkClicks).omit({ id: true, createdAt: true });
export const insertScheduledEmailSchema = createInsertSchema(scheduledEmails).omit({ id: true, createdAt: true, updatedAt: true });
export const insertEmailAiRewriteSchema = createInsertSchema(emailAiRewrites).omit({ id: true, createdAt: true });
export const insertEmailSignatureSchema = createInsertSchema(emailSignatures).omit({ id: true, createdAt: true, updatedAt: true });
export const insertInboxCategorySchema = createInsertSchema(inboxCategories).omit({ id: true, createdAt: true, updatedAt: true });

// Email Sequences - Automated multi-step email campaigns
export const emailSequences = pgTable("email_sequences", {
  id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  name: varchar("name", { length: 255 }).notNull(),
  description: text("description"),
  status: emailSequenceStatusEnum("status").default('active').notNull(),

  // Mailbox for sending
  mailboxAccountId: varchar("mailbox_account_id", { length: 36 }).notNull().references(() => mailboxAccounts.id, { onDelete: 'restrict' }),

  // Ownership
  createdBy: varchar("created_by", { length: 36 }).notNull().references(() => users.id, { onDelete: 'cascade' }),

  // Tracking
  totalEnrolled: integer("total_enrolled").default(0).notNull(),
  activeEnrollments: integer("active_enrollments").default(0).notNull(),
  completedEnrollments: integer("completed_enrollments").default(0).notNull(),

  // Timestamps
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => ({
  mailboxIdx: index("email_sequences_mailbox_idx").on(table.mailboxAccountId),
  createdByIdx: index("email_sequences_created_by_idx").on(table.createdBy),
  statusIdx: index("email_sequences_status_idx").on(table.status),
}));

export const insertEmailSequenceSchema = createInsertSchema(emailSequences).omit({ 
  id: true, 
  createdAt: true, 
  updatedAt: true,
  totalEnrolled: true,
  activeEnrollments: true,
  completedEnrollments: true
});
export type EmailSequence = typeof emailSequences.$inferSelect;
export type InsertEmailSequence = z.infer<typeof insertEmailSequenceSchema>;

// Sequence Steps - Individual emails in a sequence
export const sequenceSteps = pgTable("sequence_steps", {
  id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  sequenceId: varchar("sequence_id", { length: 36 }).notNull().references(() => emailSequences.id, { onDelete: 'cascade' }),

  // Step configuration
  stepNumber: integer("step_number").notNull(),
  name: varchar("name", { length: 255 }),
  status: sequenceStepStatusEnum("status").default('active').notNull(),

  // Delay after previous step (0 for first step)
  delayDays: integer("delay_days").default(0).notNull(),
  delayHours: integer("delay_hours").default(0).notNull(),

  // Optional template reference (if null, use custom content below)
  templateId: varchar("template_id", { length: 36 }).references(() => emailTemplates.id, { onDelete: 'set null' }),

  // Email content with personalization token support (used if templateId is null)
  subject: text("subject"),
  htmlBody: text("html_body"),
  textBody: text("text_body"),

  // Tracking
  totalSent: integer("total_sent").default(0).notNull(),
  totalOpened: integer("total_opened").default(0).notNull(),
  totalClicked: integer("total_clicked").default(0).notNull(),
  totalReplied: integer("total_replied").default(0).notNull(),

  // Timestamps
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => ({
  sequenceIdx: index("sequence_steps_sequence_idx").on(table.sequenceId),
  sequenceStepIdx: uniqueIndex("sequence_steps_sequence_step_idx").on(table.sequenceId, table.stepNumber),
}));

export const insertSequenceStepSchema = createInsertSchema(sequenceSteps).omit({ 
  id: true, 
  createdAt: true, 
  updatedAt: true,
  totalSent: true,
  totalOpened: true,
  totalClicked: true,
  totalReplied: true
});
export type SequenceStep = typeof sequenceSteps.$inferSelect;
export type InsertSequenceStep = z.infer<typeof insertSequenceStepSchema>;

// Sequence Enrollments - Contacts enrolled in sequences
export const sequenceEnrollments = pgTable("sequence_enrollments", {
  id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  sequenceId: varchar("sequence_id", { length: 36 }).notNull().references(() => emailSequences.id, { onDelete: 'cascade' }),
  contactId: varchar("contact_id", { length: 36 }).notNull().references(() => contacts.id, { onDelete: 'cascade' }),

  // Enrollment details
  enrolledBy: varchar("enrolled_by", { length: 36 }).notNull().references(() => users.id, { onDelete: 'set null' }),
  status: enrollmentStatusEnum("status").default('active').notNull(),

  // Progress tracking
  currentStepNumber: integer("current_step_number").default(0).notNull(),

  // Stop tracking
  stopReason: enrollmentStopReasonEnum("stop_reason"),
  stoppedAt: timestamp("stopped_at", { withTimezone: true }),

  // Timestamps
  enrolledAt: timestamp("enrolled_at", { withTimezone: true }).defaultNow().notNull(),
  lastActivityAt: timestamp("last_activity_at", { withTimezone: true }),
}, (table) => ({
  sequenceIdx: index("sequence_enrollments_sequence_idx").on(table.sequenceId),
  contactIdx: index("sequence_enrollments_contact_idx").on(table.contactId),
  statusIdx: index("sequence_enrollments_status_idx").on(table.status),
  uniqueEnrollment: uniqueIndex("sequence_enrollments_unique_idx").on(table.sequenceId, table.contactId),
}));

export const insertSequenceEnrollmentSchema = createInsertSchema(sequenceEnrollments).omit({ 
  id: true, 
  enrolledAt: true,
  lastActivityAt: true
});
export type SequenceEnrollment = typeof sequenceEnrollments.$inferSelect;
export type InsertSequenceEnrollment = z.infer<typeof insertSequenceEnrollmentSchema>;

// Sequence Email Sends - Individual email send tracking
export const sequenceEmailSends = pgTable("sequence_email_sends", {
  id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  enrollmentId: varchar("enrollment_id", { length: 36 }).notNull().references(() => sequenceEnrollments.id, { onDelete: 'cascade' }),
  stepId: varchar("step_id", { length: 36 }).notNull().references(() => sequenceSteps.id, { onDelete: 'cascade' }),
  contactId: varchar("contact_id", { length: 36 }).notNull().references(() => contacts.id, { onDelete: 'cascade' }),
  sequenceId: varchar("sequence_id", { length: 36 }).notNull().references(() => emailSequences.id, { onDelete: 'cascade' }),

  // Send status
  status: sequenceEmailStatusEnum("status").default('scheduled').notNull(),

  // Scheduling
  scheduledFor: timestamp("scheduled_for", { withTimezone: true }).notNull(),

  // M365 integration
  messageId: text("message_id"),
  conversationId: text("conversation_id"),

  // Email content (personalized for this contact)
  subject: text("subject").notNull(),
  htmlBody: text("html_body").notNull(),
  textBody: text("text_body"),

  // Error tracking
  error: text("error"),
  retryCount: integer("retry_count").default(0).notNull(),

  // Engagement tracking
  sentAt: timestamp("sent_at", { withTimezone: true }),
  deliveredAt: timestamp("delivered_at", { withTimezone: true }),
  openedAt: timestamp("opened_at", { withTimezone: true }),
  clickedAt: timestamp("clicked_at", { withTimezone: true }),
  repliedAt: timestamp("replied_at", { withTimezone: true }),
  bouncedAt: timestamp("bounced_at", { withTimezone: true }),

  // Timestamps
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => ({
  enrollmentIdx: index("sequence_email_sends_enrollment_idx").on(table.enrollmentId),
  stepIdx: index("sequence_email_sends_step_idx").on(table.stepId),
  contactIdx: index("sequence_email_sends_contact_idx").on(table.contactId),
  sequenceIdx: index("sequence_email_sends_sequence_idx").on(table.sequenceId),
  statusIdx: index("sequence_email_sends_status_idx").on(table.status),
  scheduledIdx: index("sequence_email_sends_scheduled_idx").on(table.scheduledFor),
  messageIdx: index("sequence_email_sends_message_idx").on(table.messageId),
}));

export const insertSequenceEmailSendSchema = createInsertSchema(sequenceEmailSends).omit({ 
  id: true, 
  createdAt: true, 
  updatedAt: true
});
export type SequenceEmailSend = typeof sequenceEmailSends.$inferSelect;
export type InsertSequenceEmailSend = z.infer<typeof insertSequenceEmailSendSchema>;

// CSV Mapping Templates - Store successful CSV field mappings for reuse
export const csvMappingTemplates = pgTable("csv_mapping_templates", {
  id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id", { length: 36 }).notNull().references(() => users.id, { onDelete: 'cascade' }),
  
  // Template metadata
  name: text("name").notNull(),
  description: text("description"),
  isDefault: boolean("is_default").default(false).notNull(),
  
  // CSV headers (original column names)
  csvHeaders: jsonb("csv_headers").notNull().$type<string[]>(),
  
  // Field mappings: array of {csvColumn, targetField, targetEntity}
  mappings: jsonb("mappings").notNull().$type<Array<{
    csvColumn: string;
    targetField: string | null;
    targetEntity: 'contact' | 'account' | null;
  }>>(),
  
  // Usage statistics
  useCount: integer("use_count").default(0).notNull(),
  lastUsedAt: timestamp("last_used_at", { withTimezone: true }),
  
  // Timestamps
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => ({
  userIdx: index("csv_mapping_templates_user_idx").on(table.userId),
  defaultIdx: index("csv_mapping_templates_default_idx").on(table.isDefault),
}));

export const insertVerificationCampaignSchema = createInsertSchema(verificationCampaigns)
  .omit({ id: true, createdAt: true, updatedAt: true })
  .extend({
    okRateTarget: z.union([z.string(), z.number()]).optional().transform(val => val !== undefined ? String(val) : undefined),
    deliverabilityTarget: z.union([z.string(), z.number()]).optional().transform(val => val !== undefined ? String(val) : undefined),
    suppressionHitRateMax: z.union([z.string(), z.number()]).optional().transform(val => val !== undefined ? String(val) : undefined),
    qaPassRateMin: z.union([z.string(), z.number()]).optional().transform(val => val !== undefined ? String(val) : undefined),
  });
export const insertVerificationContactSchema = createInsertSchema(verificationContacts).omit({ id: true, createdAt: true, updatedAt: true });
export const insertVerificationEmailValidationSchema = createInsertSchema(verificationEmailValidations).omit({ checkedAt: true });
export const insertEmailValidationDomainCacheSchema = createInsertSchema(emailValidationDomainCache).omit({ lastChecked: true, checkCount: true });
export const insertVerificationSuppressionListSchema = createInsertSchema(verificationSuppressionList).omit({ id: true, addedAt: true });
export const insertVerificationLeadSubmissionSchema = createInsertSchema(verificationLeadSubmissions).omit({ id: true, createdAt: true });
export const insertVerificationAuditLogSchema = createInsertSchema(verificationAuditLog).omit({ id: true, at: true });
export const insertVerificationUploadJobSchema = createInsertSchema(verificationUploadJobs).omit({ id: true, createdAt: true, updatedAt: true, startedAt: true, finishedAt: true });
export const insertVerificationEmailValidationJobSchema = createInsertSchema(verificationEmailValidationJobs).omit({ id: true, createdAt: true, updatedAt: true, startedAt: true, finishedAt: true });
export const insertVerificationEnrichmentJobSchema = createInsertSchema(verificationEnrichmentJobs).omit({ id: true, createdAt: true, updatedAt: true, startedAt: true, finishedAt: true });
export const insertVerificationCampaignWorkflowSchema = createInsertSchema(verificationCampaignWorkflows).omit({ id: true, createdAt: true, updatedAt: true, startedAt: true, completedAt: true });
export const insertExportTemplateSchema = createInsertSchema(exportTemplates).omit({ id: true, createdAt: true, updatedAt: true });

// ========================================
// AI-POWERED PROJECT CREATION
// ========================================

export const aiIntentStatusEnum = pgEnum('ai_intent_status', [
  'processing',      // AI is extracting data
  'needs_review',    // Extracted but needs human review
  'approved',        // Human approved the extraction
  'rejected',        // Human rejected the extraction
  'created'          // Project successfully created
]);

export const aiConfidenceLevelEnum = pgEnum('ai_confidence_level', [
  'high',      // >85% confidence - can auto-create draft
  'medium',    // 60-85% confidence - needs review
  'low'        // <60% confidence - requires manual input
]);

// Projects table - Groups multiple campaigns together
export const projects = pgTable("projects", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull(),
  description: text("description"),
  clientName: text("client_name"),
  status: campaignStatusEnum("status").notNull().default('draft'),
  
  // Commercial details
  totalLeadsTarget: integer("total_leads_target"),
  costPerLead: decimal("cost_per_lead", { precision: 10, scale: 2 }),
  totalBudget: decimal("total_budget", { precision: 12, scale: 2 }),
  
  // Timeline
  startDate: date("start_date"),
  endDate: date("end_date"),
  
  // Delivery configuration
  deliveryMethods: jsonb("delivery_methods").$type<{
    method: string;
    frequency: string;
    format?: string;
    fieldMapping?: Record<string, string>;
    credentials?: string; // Encrypted reference
    recipients?: string[];
  }[]>().default(sql`'[]'::jsonb`),
  
  // Metadata
  ownerId: varchar("owner_id").references(() => users.id),
  aiGeneratedFrom: varchar("ai_generated_from"), // Reference to ai_project_intents.id
  
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (table) => ({
  statusIdx: index("projects_status_idx").on(table.status),
  ownerIdx: index("projects_owner_idx").on(table.ownerId),
  aiGeneratedIdx: index("projects_ai_generated_idx").on(table.aiGeneratedFrom),
}));

// AI Project Intents - Stores natural language inputs and extracted data
export const aiProjectIntents = pgTable("ai_project_intents", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  
  // Natural language input (PII redacted for storage)
  originalPrompt: text("original_prompt").notNull(),
  redactedPrompt: text("redacted_prompt"), // PII-redacted version for learning
  inputMethod: text("input_method").default('text'), // text | speech
  
  // Extraction status
  status: aiIntentStatusEnum("status").notNull().default('processing'),
  confidenceLevel: aiConfidenceLevelEnum("confidence_level"),
  confidenceScore: numeric("confidence_score", { precision: 5, scale: 2 }), // 0-100
  
  // Extracted structured data
  extractedData: jsonb("extracted_data").$type<{
    projectName?: string;
    clientName?: string;
    targetAudience?: {
      jobTitles?: string[];
      industries?: string[];
      companySize?: { min?: number; max?: number };
      geography?: string[];
    };
    channels?: string[]; // ['email', 'call', 'verification']
    volume?: number;
    costPerLead?: number;
    timeline?: { start?: string; end?: string };
    deliveryMethods?: string[];
    specialRequirements?: string[];
  }>(),
  
  // AI model information
  modelUsed: text("model_used"), // e.g., "gpt-4o", "gemini-1.5-pro"
  processingTime: integer("processing_time"), // milliseconds
  
  // Validation results
  validationErrors: jsonb("validation_errors").$type<string[]>(),
  validationWarnings: jsonb("validation_warnings").$type<string[]>(),
  
  // Project creation
  projectId: varchar("project_id").references(() => projects.id, { onDelete: 'set null' }),
  createdCampaignIds: text("created_campaign_ids").array(),
  
  // Metadata
  userId: varchar("user_id").notNull().references(() => users.id),
  reviewedBy: varchar("reviewed_by").references(() => users.id),
  reviewedAt: timestamp("reviewed_at"),
  rejectionReason: text("rejection_reason"),
  
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (table) => ({
  statusIdx: index("ai_project_intents_status_idx").on(table.status),
  userIdx: index("ai_project_intents_user_idx").on(table.userId),
  projectIdx: index("ai_project_intents_project_idx").on(table.projectId),
  confidenceIdx: index("ai_project_intents_confidence_idx").on(table.confidenceLevel),
}));

// AI Intent Feedback - Stores corrections and learning data
export const aiIntentFeedback = pgTable("ai_intent_feedback", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  intentId: varchar("intent_id").notNull().references(() => aiProjectIntents.id, { onDelete: 'cascade' }),
  
  // What was corrected
  fieldPath: text("field_path").notNull(), // e.g., "extractedData.targetAudience.companySize.min"
  originalValue: text("original_value"), // What AI extracted
  correctedValue: text("corrected_value"), // What human corrected it to
  
  // Feedback context
  feedbackType: text("feedback_type").notNull(), // 'correction' | 'addition' | 'removal'
  feedbackNotes: text("feedback_notes"),
  
  // Who provided feedback
  userId: varchar("user_id").notNull().references(() => users.id),
  
  // Learning metadata
  wasUsedForTraining: boolean("was_used_for_training").default(false),
  similarityScore: numeric("similarity_score", { precision: 5, scale: 2 }), // For embedding-based retrieval
  
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (table) => ({
  intentIdx: index("ai_intent_feedback_intent_idx").on(table.intentId),
  feedbackTypeIdx: index("ai_intent_feedback_type_idx").on(table.feedbackType),
  trainingIdx: index("ai_intent_feedback_training_idx").on(table.wasUsedForTraining),
}));

// Insert schemas
export const insertProjectSchema = createInsertSchema(projects).omit({ 
  id: true, 
  createdAt: true, 
  updatedAt: true 
});

export const insertAiProjectIntentSchema = createInsertSchema(aiProjectIntents).omit({ 
  id: true, 
  createdAt: true, 
  updatedAt: true,
  reviewedAt: true
});

export const insertAiIntentFeedbackSchema = createInsertSchema(aiIntentFeedback).omit({ 
  id: true, 
  createdAt: true 
});

// Types
export type Project = typeof projects.$inferSelect;
export type InsertProject = z.infer<typeof insertProjectSchema>;
export type SelectProject = typeof projects.$inferSelect;

export type AiProjectIntent = typeof aiProjectIntents.$inferSelect;
export type InsertAiProjectIntent = z.infer<typeof insertAiProjectIntentSchema>;
export type SelectAiProjectIntent = typeof aiProjectIntents.$inferSelect;

export type AiIntentFeedback = typeof aiIntentFeedback.$inferSelect;
export type InsertAiIntentFeedback = z.infer<typeof insertAiIntentFeedbackSchema>;
export type SelectAiIntentFeedback = typeof aiIntentFeedback.$inferSelect;

export type Pipeline = typeof pipelines.$inferSelect;
export type InsertPipeline = z.infer<typeof insertPipelineSchema>;
export type PipelineOpportunity = typeof pipelineOpportunities.$inferSelect;
export type InsertPipelineOpportunity = z.infer<typeof insertPipelineOpportunitySchema>;

export type MailboxAccount = typeof mailboxAccounts.$inferSelect;
export type InsertMailboxAccount = z.infer<typeof insertMailboxAccountSchema>;

export type M365Activity = typeof m365Activities.$inferSelect;
export type InsertM365Activity = z.infer<typeof insertM365ActivitySchema>;

// Email Hub Types
export type EmailOpen = typeof emailOpens.$inferSelect;
export type InsertEmailOpen = z.infer<typeof insertEmailOpenSchema>;

export type EmailLinkClick = typeof emailLinkClicks.$inferSelect;
export type InsertEmailLinkClick = z.infer<typeof insertEmailLinkClickSchema>;

export type ScheduledEmail = typeof scheduledEmails.$inferSelect;
export type InsertScheduledEmail = z.infer<typeof insertScheduledEmailSchema>;

export type EmailAiRewrite = typeof emailAiRewrites.$inferSelect;
export type InsertEmailAiRewrite = z.infer<typeof insertEmailAiRewriteSchema>;

export type EmailSignature = typeof emailSignatures.$inferSelect;
export type InsertEmailSignature = z.infer<typeof insertEmailSignatureSchema>;

export type InboxCategory = typeof inboxCategories.$inferSelect;
export type InsertInboxCategory = z.infer<typeof insertInboxCategorySchema>;

export type VerificationCampaign = typeof verificationCampaigns.$inferSelect;
export type InsertVerificationCampaign = z.infer<typeof insertVerificationCampaignSchema>;
export type VerificationContact = typeof verificationContacts.$inferSelect;
export type InsertVerificationContact = z.infer<typeof insertVerificationContactSchema>;
export type VerificationEmailValidation = typeof verificationEmailValidations.$inferSelect;
export type InsertVerificationEmailValidation = z.infer<typeof insertVerificationEmailValidationSchema>;
export type EmailValidationDomainCache = typeof emailValidationDomainCache.$inferSelect;
export type InsertEmailValidationDomainCache = z.infer<typeof insertEmailValidationDomainCacheSchema>;
export type VerificationSuppressionList = typeof verificationSuppressionList.$inferSelect;
export type InsertVerificationSuppressionList = z.infer<typeof insertVerificationSuppressionListSchema>;
export type VerificationLeadSubmission = typeof verificationLeadSubmissions.$inferSelect;
export type InsertVerificationLeadSubmission = z.infer<typeof insertVerificationLeadSubmissionSchema>;
export type VerificationAuditLog = typeof verificationAuditLog.$inferSelect;
export type InsertVerificationAuditLog = z.infer<typeof insertVerificationAuditLogSchema>;
export type VerificationUploadJob = typeof verificationUploadJobs.$inferSelect;
export type InsertVerificationUploadJob = z.infer<typeof insertVerificationUploadJobSchema>;
export type VerificationEmailValidationJob = typeof verificationEmailValidationJobs.$inferSelect;
export type InsertVerificationEmailValidationJob = z.infer<typeof insertVerificationEmailValidationJobSchema>;
export type VerificationEnrichmentJob = typeof verificationEnrichmentJobs.$inferSelect;
export type InsertVerificationEnrichmentJob = z.infer<typeof insertVerificationEnrichmentJobSchema>;
export type VerificationCampaignWorkflow = typeof verificationCampaignWorkflows.$inferSelect;
export type InsertVerificationCampaignWorkflow = z.infer<typeof insertVerificationCampaignWorkflowSchema>;
export type ExportTemplate = typeof exportTemplates.$inferSelect;
export type InsertExportTemplate = z.infer<typeof insertExportTemplateSchema>;

export const insertCsvMappingTemplateSchema = createInsertSchema(csvMappingTemplates).omit({ 
  id: true, 
  createdAt: true, 
  updatedAt: true,
  useCount: true,
  lastUsedAt: true
});

export const updateCsvMappingTemplateSchema = z.object({
  name: z.string().min(1).optional(),
  description: z.string().optional(),
  mappings: z.array(z.object({
    csvColumn: z.string(),
    targetField: z.string().nullable(),
    targetEntity: z.enum(['contact', 'account']).nullable(),
  })).optional(),
});

export type CsvMappingTemplate = typeof csvMappingTemplates.$inferSelect;
export type InsertCsvMappingTemplate = z.infer<typeof insertCsvMappingTemplateSchema>;
export type UpdateCsvMappingTemplate = z.infer<typeof updateCsvMappingTemplateSchema>;

// Client Portal Insert Schemas
export const insertClientAccountSchema = createInsertSchema(clientAccounts).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertClientUserSchema = createInsertSchema(clientUsers).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
  lastLoginAt: true,
});

export const insertClientCampaignAccessSchema = createInsertSchema(clientCampaignAccess).omit({
  id: true,
  createdAt: true,
});

const clientPortalOrderInsertOmit = {
  id: true,
  createdAt: true,
  updatedAt: true,
  orderNumber: true,
  deliveredQuantity: true,
  approvedAt: true,
  rejectedAt: true,
  fulfilledAt: true,
  submittedAt: true,
  status: true,
  approvedQuantity: true,
  approvedBy: true,
  adminNotes: true,
  rejectionReason: true,
} satisfies Partial<Record<keyof typeof clientPortalOrders.$inferInsert, true>>;

export const insertClientPortalOrderSchema = createInsertSchema(clientPortalOrders).omit(clientPortalOrderInsertOmit);

export const insertClientPortalOrderContactSchema = createInsertSchema(clientPortalOrderContacts).omit({
  id: true,
  createdAt: true,
  selectedAt: true,
  deliveredAt: true,
});

// Client Portal Types
export type ClientAccount = typeof clientAccounts.$inferSelect;
export type InsertClientAccount = z.infer<typeof insertClientAccountSchema>;

export type ClientUser = typeof clientUsers.$inferSelect;
export type InsertClientUser = z.infer<typeof insertClientUserSchema>;

export type ClientCampaignAccess = typeof clientCampaignAccess.$inferSelect;
export type InsertClientCampaignAccess = z.infer<typeof insertClientCampaignAccessSchema>;

export type ClientPortalOrder = typeof clientPortalOrders.$inferSelect;
export type InsertClientPortalOrder = z.infer<typeof insertClientPortalOrderSchema>;

export type ClientPortalOrderContact = typeof clientPortalOrderContacts.$inferSelect;
export type InsertClientPortalOrderContact = z.infer<typeof insertClientPortalOrderContactSchema>;

// ============================================================================
// UNIFIED AI/HUMAN AGENT CONSOLE - Disposition Framework & Governance
// ============================================================================

// Handoff Stage Enum - Tracks AI to human handoff stages
export const handoffStageEnum = pgEnum('handoff_stage', [
  'ai_initial',        // AI handles first touch
  'ai_qualifying',     // AI qualifying the lead
  'ai_handoff',        // AI triggered handoff to human
  'human_takeover',    // Human took over from AI
  'human_direct',      // Human handled from start
  'ai_complete'        // AI completed without handoff
]);

// Governance Action Enum - System actions triggered by disposition rules
export const governanceActionEnum = pgEnum('governance_action', [
  'qc_review',              // Add to QC review queue
  'auto_suppress',          // Auto-suppress from campaign
  'global_dnc',             // Add to global DNC list
  'recycle',                // Schedule for recycle/redial
  'data_quality_flag',      // Flag for data quality review
  'downstream_sales',       // Push to downstream sales flow
  'remove_from_campaign',   // Remove from current campaign
  'escalate'                // Escalate for review
]);

// Recycle Status Enum
export const recycleStatusEnum = pgEnum('recycle_status', [
  'scheduled',    // Waiting for recycle window
  'eligible',     // Ready to be redialed
  'processing',   // Currently being processed
  'completed',    // Successfully recycled
  'expired',      // Max attempts exceeded
  'cancelled'     // Manually cancelled
]);

// QC Review Status Enum
export const qcReviewStatusEnum = pgEnum('qc_review_status', [
  'pending',      // Awaiting review
  'in_review',    // Currently being reviewed
  'approved',     // Approved by QC
  'rejected',     // Rejected by QC
  'escalated',    // Escalated to supervisor
  'returned'      // Returned for rework
]);

// Disposition Rules Engine - Configurable rules triggered by disposition codes
export const dispositionRules = pgTable("disposition_rules", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull(),
  description: text("description"),
  dispositionId: varchar("disposition_id").references(() => dispositions.id, { onDelete: 'cascade' }).notNull(),
  producerType: agentTypeEnum("producer_type"), // null = applies to all producers
  priority: integer("priority").notNull().default(0),
  conditions: jsonb("conditions"), // Additional conditions: { minCallDuration: 30, requiresRecording: true }
  actions: jsonb("actions").notNull(), // Array of actions: [{ type: 'qc_review', config: {} }]
  recycleConfig: jsonb("recycle_config"), // { waitDays: 3, maxAttempts: 3, preferredTimeSlot: '09:00-17:00' }
  isActive: boolean("is_active").notNull().default(true),
  createdBy: varchar("created_by").references(() => users.id, { onDelete: 'set null' }),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (table) => ({
  dispositionIdx: index("disposition_rules_disposition_idx").on(table.dispositionId),
  producerTypeIdx: index("disposition_rules_producer_type_idx").on(table.producerType),
  activeIdx: index("disposition_rules_active_idx").on(table.isActive),
  priorityIdx: index("disposition_rules_priority_idx").on(table.priority),
}));

// Call Producer Tracking - Enhanced call tracking with producer type and handoff
export const callProducerTracking = pgTable("call_producer_tracking", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  callSessionId: varchar("call_session_id").references(() => callSessions.id, { onDelete: 'cascade' }).notNull(),
  campaignId: varchar("campaign_id").references(() => campaigns.id, { onDelete: 'cascade' }).notNull(),
  contactId: varchar("contact_id").references(() => contacts.id, { onDelete: 'set null' }),
  producerType: agentTypeEnum("producer_type").notNull(),
  humanAgentId: varchar("human_agent_id").references(() => users.id, { onDelete: 'set null' }),
  virtualAgentId: varchar("virtual_agent_id").references(() => virtualAgents.id, { onDelete: 'set null' }),
  handoffStage: handoffStageEnum("handoff_stage").notNull().default('ai_initial'),
  handoffTrigger: aiHandoffTriggerEnum("handoff_trigger"),
  handoffTimestamp: timestamp("handoff_timestamp"),
  handoffNotes: text("handoff_notes"),
  intentsDetected: jsonb("intents_detected"), // AI-detected intents during call
  transcriptAnalysis: jsonb("transcript_analysis"), // AI analysis of call transcript
  qualityScore: numeric("quality_score", { precision: 5, scale: 2 }),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (table) => ({
  callSessionIdx: index("call_producer_tracking_session_idx").on(table.callSessionId),
  campaignIdx: index("call_producer_tracking_campaign_idx").on(table.campaignId),
  producerTypeIdx: index("call_producer_tracking_producer_type_idx").on(table.producerType),
  handoffStageIdx: index("call_producer_tracking_handoff_stage_idx").on(table.handoffStage),
  createdAtIdx: index("call_producer_tracking_created_at_idx").on(table.createdAt),
}));

// QC Work Queue - Unified QC queue for AI and human call reviews
export const qcWorkQueue = pgTable("qc_work_queue", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  callSessionId: varchar("call_session_id").references(() => callSessions.id, { onDelete: 'cascade' }),
  leadId: varchar("lead_id").references(() => leads.id, { onDelete: 'cascade' }),
  campaignId: varchar("campaign_id").references(() => campaigns.id, { onDelete: 'cascade' }).notNull(),
  producerType: agentTypeEnum("producer_type").notNull(),
  producerTrackingId: varchar("producer_tracking_id").references(() => callProducerTracking.id, { onDelete: 'set null' }),
  status: qcReviewStatusEnum("status").notNull().default('pending'),
  priority: integer("priority").notNull().default(0),
  assignedTo: varchar("assigned_to").references(() => users.id, { onDelete: 'set null' }),
  triggerRule: varchar("trigger_rule").references(() => dispositionRules.id, { onDelete: 'set null' }),
  reviewNotes: text("review_notes"),
  scorecard: jsonb("scorecard"), // QC scoring results
  qcOutcome: text("qc_outcome"), // approved, rejected, needs_retraining
  reviewedAt: timestamp("reviewed_at"),
  reviewedBy: varchar("reviewed_by").references(() => users.id, { onDelete: 'set null' }),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (table) => ({
  campaignIdx: index("qc_work_queue_campaign_idx").on(table.campaignId),
  statusIdx: index("qc_work_queue_status_idx").on(table.status),
  producerTypeIdx: index("qc_work_queue_producer_type_idx").on(table.producerType),
  assignedToIdx: index("qc_work_queue_assigned_to_idx").on(table.assignedTo),
  priorityStatusIdx: index("qc_work_queue_priority_status_idx").on(table.status, table.priority),
}));

// Recycle Jobs - Scheduled redial queue with configurable wait windows
export const recycleJobs = pgTable("recycle_jobs", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  campaignId: varchar("campaign_id").references(() => campaigns.id, { onDelete: 'cascade' }).notNull(),
  contactId: varchar("contact_id").references(() => contacts.id, { onDelete: 'cascade' }).notNull(),
  originalCallSessionId: varchar("original_call_session_id").references(() => callSessions.id, { onDelete: 'set null' }),
  dispositionId: varchar("disposition_id").references(() => dispositions.id, { onDelete: 'set null' }),
  triggerRule: varchar("trigger_rule").references(() => dispositionRules.id, { onDelete: 'set null' }),
  status: recycleStatusEnum("status").notNull().default('scheduled'),
  attemptNumber: integer("attempt_number").notNull().default(1),
  maxAttempts: integer("max_attempts").notNull().default(3),
  scheduledAt: timestamp("scheduled_at").notNull(),
  eligibleAt: timestamp("eligible_at").notNull(),
  targetAgentType: queueTargetAgentTypeEnum("target_agent_type").notNull().default('any'),
  preferredTimeWindow: jsonb("preferred_time_window"), // { start: '09:00', end: '17:00', timezone: 'America/New_York' }
  processedAt: timestamp("processed_at"),
  resultQueueItemId: varchar("result_queue_item_id"),
  notes: text("notes"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (table) => ({
  campaignIdx: index("recycle_jobs_campaign_idx").on(table.campaignId),
  contactIdx: index("recycle_jobs_contact_idx").on(table.contactId),
  statusIdx: index("recycle_jobs_status_idx").on(table.status),
  eligibleAtIdx: index("recycle_jobs_eligible_at_idx").on(table.eligibleAt),
  scheduledEligibleIdx: index("recycle_jobs_scheduled_eligible_idx").on(table.status, table.eligibleAt),
}));

// Governance Actions Log - Audit trail for all governance actions
export const governanceActionsLog = pgTable("governance_actions_log", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  campaignId: varchar("campaign_id").references(() => campaigns.id, { onDelete: 'cascade' }),
  contactId: varchar("contact_id").references(() => contacts.id, { onDelete: 'set null' }),
  callSessionId: varchar("call_session_id").references(() => callSessions.id, { onDelete: 'set null' }),
  dispositionId: varchar("disposition_id").references(() => dispositions.id, { onDelete: 'set null' }),
  triggerRuleId: varchar("trigger_rule_id").references(() => dispositionRules.id, { onDelete: 'set null' }),
  actionType: governanceActionEnum("action_type").notNull(),
  producerType: agentTypeEnum("producer_type"),
  actionPayload: jsonb("action_payload"), // Details of the action taken
  result: text("result"), // success, failed, skipped
  errorMessage: text("error_message"),
  executedBy: text("executed_by").notNull().default('system'), // system, userId
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (table) => ({
  campaignIdx: index("governance_actions_log_campaign_idx").on(table.campaignId),
  actionTypeIdx: index("governance_actions_log_action_type_idx").on(table.actionType),
  producerTypeIdx: index("governance_actions_log_producer_type_idx").on(table.producerType),
  createdAtIdx: index("governance_actions_log_created_at_idx").on(table.createdAt),
}));

// Producer Metrics - Aggregated performance metrics by producer type
export const producerMetrics = pgTable("producer_metrics", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  campaignId: varchar("campaign_id").references(() => campaigns.id, { onDelete: 'cascade' }).notNull(),
  producerType: agentTypeEnum("producer_type").notNull(),
  humanAgentId: varchar("human_agent_id").references(() => users.id, { onDelete: 'set null' }),
  virtualAgentId: varchar("virtual_agent_id").references(() => virtualAgents.id, { onDelete: 'set null' }),
  metricDate: date("metric_date").notNull(),
  totalCalls: integer("total_calls").notNull().default(0),
  connectedCalls: integer("connected_calls").notNull().default(0),
  qualifiedLeads: integer("qualified_leads").notNull().default(0),
  qcPassedLeads: integer("qc_passed_leads").notNull().default(0),
  qcFailedLeads: integer("qc_failed_leads").notNull().default(0),
  dncRequests: integer("dnc_requests").notNull().default(0),
  optOutRequests: integer("opt_out_requests").notNull().default(0),
  handoffsToHuman: integer("handoffs_to_human").notNull().default(0),
  avgCallDuration: numeric("avg_call_duration", { precision: 10, scale: 2 }),
  avgQualityScore: numeric("avg_quality_score", { precision: 5, scale: 2 }),
  conversionRate: numeric("conversion_rate", { precision: 5, scale: 4 }),
  contactabilityRate: numeric("contactability_rate", { precision: 5, scale: 4 }),
  recycledContacts: integer("recycled_contacts").notNull().default(0),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (table) => ({
  campaignDateIdx: index("producer_metrics_campaign_date_idx").on(table.campaignId, table.metricDate),
  producerTypeIdx: index("producer_metrics_producer_type_idx").on(table.producerType),
  humanAgentIdx: index("producer_metrics_human_agent_idx").on(table.humanAgentId),
  virtualAgentIdx: index("producer_metrics_virtual_agent_idx").on(table.virtualAgentId),
  metricDateIdx: index("producer_metrics_date_idx").on(table.metricDate),
  uniqueProducerDateIdx: uniqueIndex("producer_metrics_unique_producer_date").on(
    table.campaignId, table.producerType, table.metricDate, table.humanAgentId, table.virtualAgentId
  ),
}));

// DNC Reconciliation Log - Track DNC sync across AI and human channels
export const dncReconciliationLog = pgTable("dnc_reconciliation_log", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  phoneE164: text("phone_e164").notNull(),
  contactId: varchar("contact_id").references(() => contacts.id, { onDelete: 'set null' }),
  source: text("source").notNull(), // ai_call, human_call, carrier_blocklist, nightly_sync
  producerType: agentTypeEnum("producer_type"),
  callSessionId: varchar("call_session_id").references(() => callSessions.id, { onDelete: 'set null' }),
  carrierBlocklistUpdated: boolean("carrier_blocklist_updated").notNull().default(false),
  globalDncUpdated: boolean("global_dnc_updated").notNull().default(false),
  reconciledAt: timestamp("reconciled_at"),
  notes: text("notes"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (table) => ({
  phoneIdx: index("dnc_reconciliation_log_phone_idx").on(table.phoneE164),
  sourceIdx: index("dnc_reconciliation_log_source_idx").on(table.source),
  createdAtIdx: index("dnc_reconciliation_log_created_at_idx").on(table.createdAt),
}));

// ============================================================================
// DIALER RUNS - Unified Manual/PowerDialer Execution System
// ============================================================================

// Dialer Runs - Execution mode tracking (Manual Dial vs Power Dial)
export const dialerRuns = pgTable("dialer_runs", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  campaignId: varchar("campaign_id").references(() => campaigns.id, { onDelete: 'cascade' }).notNull(),
  runType: dialerRunTypeEnum("run_type").notNull(),
  status: dialerRunStatusEnum("status").notNull().default('pending'),
  agentType: agentTypeEnum("agent_type").notNull(), // human for manual_dial, ai for power_dial
  humanAgentId: varchar("human_agent_id").references(() => users.id, { onDelete: 'set null' }),
  virtualAgentId: varchar("virtual_agent_id").references(() => virtualAgents.id, { onDelete: 'set null' }),
  startedAt: timestamp("started_at"),
  endedAt: timestamp("ended_at"),
  // Run statistics (updated in real-time)
  totalContacts: integer("total_contacts").notNull().default(0),
  contactsProcessed: integer("contacts_processed").notNull().default(0),
  contactsConnected: integer("contacts_connected").notNull().default(0),
  qualifiedLeads: integer("qualified_leads").notNull().default(0),
  dncRequests: integer("dnc_requests").notNull().default(0),
  voicemails: integer("voicemails").notNull().default(0),
  noAnswers: integer("no_answers").notNull().default(0),
  invalidData: integer("invalid_data").notNull().default(0),
  notInterested: integer("not_interested").notNull().default(0),
  // Configuration
  maxConcurrentCalls: integer("max_concurrent_calls").notNull().default(1),
  callTimeoutSeconds: integer("call_timeout_seconds").notNull().default(30),
  createdBy: varchar("created_by").references(() => users.id, { onDelete: 'set null' }),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (table) => ({
  campaignIdx: index("dialer_runs_campaign_idx").on(table.campaignId),
  runTypeIdx: index("dialer_runs_run_type_idx").on(table.runType),
  statusIdx: index("dialer_runs_status_idx").on(table.status),
  agentTypeIdx: index("dialer_runs_agent_type_idx").on(table.agentType),
  humanAgentIdx: index("dialer_runs_human_agent_idx").on(table.humanAgentId),
  virtualAgentIdx: index("dialer_runs_virtual_agent_idx").on(table.virtualAgentId),
  startedAtIdx: index("dialer_runs_started_at_idx").on(table.startedAt),
}));

// Dialer Call Attempts - Tracks each call attempt with canonical disposition for unified dialer
export const dialerCallAttempts = pgTable("dialer_call_attempts", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  dialerRunId: varchar("dialer_run_id").references(() => dialerRuns.id, { onDelete: 'cascade' }).notNull(),
  campaignId: varchar("campaign_id").references(() => campaigns.id, { onDelete: 'cascade' }).notNull(),
  contactId: varchar("contact_id").references(() => contacts.id, { onDelete: 'cascade' }).notNull(),
  queueItemId: varchar("queue_item_id").references(() => campaignQueue.id, { onDelete: 'set null' }),
  callSessionId: varchar("call_session_id").references(() => callSessions.id, { onDelete: 'set null' }),
  agentType: agentTypeEnum("agent_type").notNull(),
  humanAgentId: varchar("human_agent_id").references(() => users.id, { onDelete: 'set null' }),
  virtualAgentId: varchar("virtual_agent_id").references(() => virtualAgents.id, { onDelete: 'set null' }),
  phoneDialed: text("phone_dialed").notNull(),
  attemptNumber: integer("attempt_number").notNull().default(1),
  // Call outcome
  callStartedAt: timestamp("call_started_at"),
  callEndedAt: timestamp("call_ended_at"),
  callDurationSeconds: integer("call_duration_seconds"),
  connected: boolean("connected").notNull().default(false),
  voicemailDetected: boolean("voicemail_detected").notNull().default(false),
  // Canonical disposition
  disposition: canonicalDispositionEnum("disposition"),
  dispositionSubmittedAt: timestamp("disposition_submitted_at"),
  dispositionSubmittedBy: varchar("disposition_submitted_by").references(() => users.id, { onDelete: 'set null' }),
  // Disposition engine processing
  dispositionProcessed: boolean("disposition_processed").notNull().default(false),
  dispositionProcessedAt: timestamp("disposition_processed_at"),
  // Additional data
  notes: text("notes"),
  recordingUrl: text("recording_url"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (table) => ({
  dialerRunIdx: index("dialer_call_attempts_dialer_run_idx").on(table.dialerRunId),
  campaignIdx: index("dialer_call_attempts_campaign_idx").on(table.campaignId),
  contactIdx: index("dialer_call_attempts_contact_idx").on(table.contactId),
  agentTypeIdx: index("dialer_call_attempts_agent_type_idx").on(table.agentType),
  dispositionIdx: index("dialer_call_attempts_disposition_idx").on(table.disposition),
  createdAtIdx: index("dialer_call_attempts_created_at_idx").on(table.createdAt),
  pendingDispositionIdx: index("dialer_call_attempts_pending_disposition_idx")
    .on(table.disposition, table.dispositionProcessed),
}));

// Insert Schemas for Unified Console
export const insertDispositionRuleSchema = createInsertSchema(dispositionRules).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertCallProducerTrackingSchema = createInsertSchema(callProducerTracking).omit({
  id: true,
  createdAt: true,
});

export const insertQcWorkQueueSchema = createInsertSchema(qcWorkQueue).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertRecycleJobSchema = createInsertSchema(recycleJobs).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertGovernanceActionLogSchema = createInsertSchema(governanceActionsLog).omit({
  id: true,
  createdAt: true,
});

export const insertProducerMetricsSchema = createInsertSchema(producerMetrics).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertDncReconciliationLogSchema = createInsertSchema(dncReconciliationLog).omit({
  id: true,
  createdAt: true,
});

// Types for Unified Console
export type DispositionRule = typeof dispositionRules.$inferSelect;
export type InsertDispositionRule = z.infer<typeof insertDispositionRuleSchema>;

export type CallProducerTracking = typeof callProducerTracking.$inferSelect;
export type InsertCallProducerTracking = z.infer<typeof insertCallProducerTrackingSchema>;

export type QcWorkQueue = typeof qcWorkQueue.$inferSelect;
export type InsertQcWorkQueue = z.infer<typeof insertQcWorkQueueSchema>;

export type RecycleJob = typeof recycleJobs.$inferSelect;
export type InsertRecycleJob = z.infer<typeof insertRecycleJobSchema>;

export type GovernanceActionLog = typeof governanceActionsLog.$inferSelect;
export type InsertGovernanceActionLog = z.infer<typeof insertGovernanceActionLogSchema>;

export type ProducerMetrics = typeof producerMetrics.$inferSelect;
export type InsertProducerMetrics = z.infer<typeof insertProducerMetricsSchema>;

export type DncReconciliationLog = typeof dncReconciliationLog.$inferSelect;
export type InsertDncReconciliationLog = z.infer<typeof insertDncReconciliationLogSchema>;

// Insert Schemas for Dialer Runs System
export const insertDialerRunSchema = createInsertSchema(dialerRuns).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertDialerCallAttemptSchema = createInsertSchema(dialerCallAttempts).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

// Types for Dialer Runs System
export type DialerRun = typeof dialerRuns.$inferSelect;
export type InsertDialerRun = z.infer<typeof insertDialerRunSchema>;

export type DialerCallAttempt = typeof dialerCallAttempts.$inferSelect;
export type InsertDialerCallAttempt = z.infer<typeof insertDialerCallAttemptSchema>;

// Canonical disposition type for type safety
export type CanonicalDisposition = 'qualified_lead' | 'not_interested' | 'do_not_call' | 'voicemail' | 'no_answer' | 'invalid_data';
export type CampaignContactState = 'eligible' | 'locked' | 'waiting_retry' | 'qualified' | 'removed';
export type DialerRunType = 'manual_dial'; // hybrid and ai_agent share manual_dial mechanics
export type DialerRunStatus = 'pending' | 'active' | 'paused' | 'completed' | 'cancelled';

// --- Account Intelligence & Agentic Command Center Schemas ---

// Account Intelligence Results
export const accountIntelligence = pgTable('account_intelligence', {
  id: serial('id').primaryKey(),
  accountId: varchar('account_id').references(() => accounts.id),
  domain: text('domain').notNull(),
  
  // Structured Intelligence (JSONB)
  identity: jsonb('identity').notNull(), // legalName, description, etc.
  offerings: jsonb('offerings').notNull(), // products, useCases, problemsSolved
  icp: jsonb('icp').notNull(), // industries, personas
  positioning: jsonb('positioning').notNull(), // oneLiner, competitors
  outreach: jsonb('outreach').notNull(), // emailAngles, callOpeners
  
  // Prompt Optimization Settings (stored with org profile)
  orgIntelligence: text('org_intelligence'), // Brand identity, positioning, services, ICP
  compliancePolicy: text('compliance_policy'), // Legal and ethical guidelines
  platformPolicies: text('platform_policies'), // Tool permissions and safety rules
  agentVoiceDefaults: text('agent_voice_defaults'), // Voice behavior defaults
  
  // Metadata
  rawContent: text('raw_content'), // The scraped text used for analysis
  confidenceScore: real('confidence_score'),
  modelVersion: text('model_version'),
  
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
});

// Agent Runs (Sessions)
export const agentRuns = pgTable('agent_runs', {
  id: serial('id').primaryKey(),
  taskType: text('task_type').notNull(), // e.g., "CREATE_OUTREACH_PLAN"
  context: jsonb('context'), // { accountId: 123, campaignType: 'email' }
  status: text('status').notNull().default('running'), // running, completed, failed
  summary: text('summary'),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
});

// Agent Steps (Individual Actions)
export const agentSteps = pgTable('agent_steps', {
  id: serial('id').primaryKey(),
  runId: integer('run_id').references(() => agentRuns.id).notNull(),
  stepNumber: integer('step_number').notNull(),
  actionType: text('action_type').notNull(), // e.g., "fetch_account", "generate_email"
  input: jsonb('input'),
  output: jsonb('output'),
  status: text('status').notNull(), // success, failure
  error: text('error'),
  createdAt: timestamp('created_at').defaultNow(),
});

// Zod Schemas for Intelligence & Agents
export const insertAccountIntelligenceSchema = createInsertSchema(accountIntelligence);
export const insertAgentRunSchema = createInsertSchema(agentRuns);
export const insertAgentStepSchema = createInsertSchema(agentSteps);

export type AccountIntelligence = typeof accountIntelligence.$inferSelect;
export type AgentRun = typeof agentRuns.$inferSelect;
export type AgentStep = typeof agentSteps.$inferSelect;

// ==================== ORGANIZATION INTELLIGENCE INJECTION MODEL ====================
// Supports 3 modes: Use Existing, Run Fresh Research, No Organization Intelligence

/**
 * Organization Intelligence Mode Enum
 * - use_existing: Load from saved organization intelligence
 * - fresh_research: Run real-time research pipeline
 * - none: Neutral agent without organization context
 */
export const orgIntelligenceModeEnum = pgEnum('org_intelligence_mode', [
  'use_existing',   // Mode A: Use saved organization intelligence
  'fresh_research', // Mode B: Run fresh research at agent/campaign creation
  'none'            // Mode C: No organization intelligence (neutral agent)
]);

/**
 * Organization Intelligence Snapshots
 * Campaign-scoped, agency-owned snapshots of organization research
 * NOT editable by clients - full agency control
 */
export const organizationIntelligenceSnapshots = pgTable('organization_intelligence_snapshots', {
  id: varchar('id').primaryKey().default(sql`gen_random_uuid()`),
  
  // Source identification
  organizationName: text('organization_name').notNull(),
  websiteUrl: text('website_url'),
  industry: text('industry'),
  domain: text('domain'), // Extracted from website URL
  
  // Structured Intelligence (mirrors accountIntelligence structure)
  identity: jsonb('identity').notNull().default('{}'),
  offerings: jsonb('offerings').notNull().default('{}'),
  icp: jsonb('icp').notNull().default('{}'),
  positioning: jsonb('positioning').notNull().default('{}'),
  outreach: jsonb('outreach').notNull().default('{}'),
  
  // Compiled prompt-ready content
  compiledOrgContext: text('compiled_org_context'), // Ready-to-inject prompt section
  
  // Research metadata
  researchNotes: text('research_notes'), // User-provided notes for research guidance
  rawResearchContent: text('raw_research_content'), // Scraped/fetched content
  researchSources: jsonb('research_sources'), // [{url, type, fetchedAt}]
  confidenceScore: real('confidence_score'),
  modelVersion: text('model_version'),
  
  // Ownership & Reusability
  isReusable: boolean('is_reusable').notNull().default(false), // Can be saved for future use
  parentSnapshotId: varchar('parent_snapshot_id'), // For derived snapshots
  
  // Agency control
  createdBy: varchar('created_by').references(() => users.id, { onDelete: 'set null' }),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
  archivedAt: timestamp('archived_at'), // Soft delete
}, (table) => ({
  domainIdx: index('oi_snapshots_domain_idx').on(table.domain),
  orgNameIdx: index('oi_snapshots_org_name_idx').on(table.organizationName),
  reusableIdx: index('oi_snapshots_reusable_idx').on(table.isReusable),
  createdAtIdx: index('oi_snapshots_created_at_idx').on(table.createdAt),
}));

/**
 * Campaign Organization Intelligence Bindings
 * Binds an OI snapshot to a campaign for agent runtime
 * This is where OI is campaign-scoped, NOT agent-scoped
 */
export const campaignOrgIntelligenceBindings = pgTable('campaign_org_intelligence_bindings', {
  id: varchar('id').primaryKey().default(sql`gen_random_uuid()`),
  
  // Campaign binding
  campaignId: varchar('campaign_id').references(() => campaigns.id, { onDelete: 'cascade' }).notNull(),
  
  // OI Mode
  mode: orgIntelligenceModeEnum('mode').notNull().default('use_existing'),
  
  // Snapshot reference (null for 'none' mode, references existing or fresh snapshot)
  snapshotId: varchar('snapshot_id').references(() => organizationIntelligenceSnapshots.id, { onDelete: 'set null' }),
  
  // For 'use_existing' mode - reference to master org intelligence
  masterOrgIntelligenceId: integer('master_org_intelligence_id').references(() => accountIntelligence.id, { onDelete: 'set null' }),
  
  // Runtime config
  disclosureLevel: text('disclosure_level').notNull().default('standard'), // minimal, standard, detailed
  
  // Audit
  boundBy: varchar('bound_by').references(() => users.id, { onDelete: 'set null' }),
  boundAt: timestamp('bound_at').notNull().defaultNow(),
}, (table) => ({
  campaignUniq: uniqueIndex('campaign_oi_binding_uniq').on(table.campaignId),
  snapshotIdx: index('campaign_oi_binding_snapshot_idx').on(table.snapshotId),
  modeIdx: index('campaign_oi_binding_mode_idx').on(table.mode),
}));

/**
 * Agent Instance Context
 * Runtime-assembled context for an active agent instance
 * Combines: Universal Knowledge + Campaign OI + Agent Config
 */
export const agentInstanceContexts = pgTable('agent_instance_contexts', {
  id: varchar('id').primaryKey().default(sql`gen_random_uuid()`),
  
  // Agent & Campaign binding
  virtualAgentId: varchar('virtual_agent_id').references(() => virtualAgents.id, { onDelete: 'cascade' }).notNull(),
  campaignId: varchar('campaign_id').references(() => campaigns.id, { onDelete: 'cascade' }),
  
  // Assembled prompt layers
  universalKnowledgeHash: text('universal_knowledge_hash'), // Version tracking
  organizationContextHash: text('organization_context_hash'), // Version tracking
  
  // Final assembled prompt
  assembledSystemPrompt: text('assembled_system_prompt').notNull(),
  assembledFirstMessage: text('assembled_first_message'),
  
  // Context metadata
  assemblyMetadata: jsonb('assembly_metadata'), // {layers, sources, assembledAt}
  
  // Lifecycle
  isActive: boolean('is_active').notNull().default(true),
  activatedAt: timestamp('activated_at').notNull().defaultNow(),
  deactivatedAt: timestamp('deactivated_at'),
}, (table) => ({
  agentCampaignUniq: uniqueIndex('agent_instance_campaign_uniq').on(table.virtualAgentId, table.campaignId),
  activeIdx: index('agent_instance_active_idx').on(table.isActive),
}));

// Insert schemas
export const insertOrgIntelligenceSnapshotSchema = createInsertSchema(organizationIntelligenceSnapshots).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertCampaignOrgIntelligenceBindingSchema = createInsertSchema(campaignOrgIntelligenceBindings).omit({
  id: true,
  boundAt: true,
});

export const insertAgentInstanceContextSchema = createInsertSchema(agentInstanceContexts).omit({
  id: true,
  activatedAt: true,
});

// Types
export type OrganizationIntelligenceSnapshot = typeof organizationIntelligenceSnapshots.$inferSelect;
export type InsertOrganizationIntelligenceSnapshot = z.infer<typeof insertOrgIntelligenceSnapshotSchema>;

export type CampaignOrgIntelligenceBinding = typeof campaignOrgIntelligenceBindings.$inferSelect;
export type InsertCampaignOrgIntelligenceBinding = z.infer<typeof insertCampaignOrgIntelligenceBindingSchema>;

export type AgentInstanceContext = typeof agentInstanceContexts.$inferSelect;
export type InsertAgentInstanceContext = z.infer<typeof insertAgentInstanceContextSchema>;

export type OrgIntelligenceMode = 'use_existing' | 'fresh_research' | 'none';

