// CRM Database Schema - referenced from blueprint:javascript_database
import { sql, relations } from "drizzle-orm";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";
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
  vector,
  json // Import json type
} from "drizzle-orm/pg-core";

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

// Organization and membership enums
export const organizationTypeEnum = pgEnum('organization_type', ['super', 'client']);
export const organizationMemberRoleEnum = pgEnum('organization_member_role', ['owner', 'admin', 'member']);

// Campaign enums
// IMPORTANT: Keep in sync with client/src/lib/campaign-types.ts UNIFIED_CAMPAIGN_TYPES
export const campaignTypeEnum = pgEnum('campaign_type', [
  // Legacy types
  'email',
  'call',
  'combo',
  // Event-based campaigns
  'webinar_invite',
  'live_webinar',
  'on_demand_webinar',
  'executive_dinner',
  'leadership_forum',
  'conference',
  // Event registration campaigns
  'event_registration_digital_ungated',
  'event_registration_digital_gated',
  'in_person_event',
  // Lead generation campaigns
  'content_syndication',
  'high_quality_leads',
  // Sales qualification campaigns
  'sql',
  'bant_qualification',
  'bant_leads', // Legacy alias for bant_qualification
  'lead_qualification',
  // Appointment setting campaigns
  'appointment_setting',
  'appointment_generation', // Legacy alias for appointment_setting
  'demo_request',
  // Data & verification campaigns
  'data_validation',
  // Follow-up campaigns
  'follow_up',
  'nurture',
  're_engagement'
]);
export const accountCapModeEnum = pgEnum('account_cap_mode', ['queue_size', 'connected_calls', 'positive_disp']);
export const queueStatusEnum = pgEnum('queue_status', ['queued', 'in_progress', 'done', 'removed']);
export const campaignStatusEnum = pgEnum('campaign_status', ['draft', 'scheduled', 'active', 'paused', 'completed', 'cancelled']);
// Lead QA Status Flow: new → under_review → approved → pending_pm_review → published
// PM (Project Management) review is required before leads can be published to client portal
export const qaStatusEnum = pgEnum('qa_status', ['new', 'under_review', 'approved', 'rejected', 'returned', 'pending_pm_review', 'published']);
export const leadDeliverySourceEnum = pgEnum('lead_delivery_source', ['auto_webhook', 'manual']);

// Queue Target Agent Type - For routing queue items to specific agent types
export const queueTargetAgentTypeEnum = pgEnum('queue_target_agent_type', ['human', 'ai', 'any']);

// Dialer Run Type Enum - Execution modes for campaign dialing
export const dialerRunTypeEnum = pgEnum('dialer_run_type', ['manual_dial', 'power_dial']);

// Email Verification Status Enum
export const emailVerificationStatusEnum = pgEnum('email_verification_status', [
  'valid',
  'acceptable',
  'unknown',
  'invalid'
]);

// User Role Enum (legacy roles aligned to existing type)
export const userRoleEnum = pgEnum('user_role', [
  'admin',
  'agent',
  'quality_analyst',
  'content_creator',
  'campaign_manager',
  'data_ops'
]);

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
  'qualified_lead',      // Contact qualified, route to QA
  'not_interested',      // Contact not interested, suppress from campaign
  'do_not_call',         // DNC request, global suppression
  'voicemail',           // Left voicemail, schedule retry
  'no_answer',           // No answer, schedule retry
  'invalid_data',        // Wrong number, disconnected, etc.
  'needs_review',        // Ambiguous call outcome, schedule quick retry and flag for human review
  'callback_requested'   // Contact requested a callback at a specific time
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
// Includes both OpenAI Realtime voices and Google Gemini Live voices
export const aiVoiceEnum = pgEnum('ai_voice', [
  // OpenAI Realtime voices
  'alloy', 'echo', 'fable', 'onyx', 'nova', 'shimmer',
  // Google Gemini Live voices (primary platform)
  'Puck', 'Charon', 'Kore', 'Fenrir', 'Aoede',
  'Orion', 'Vega', 'Pegasus', 'Ursa', 'Dipper', 'Capella', 'Orbit', 'Lyra', 'Eclipse'
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

export const vectorDocumentTypeEnum = pgEnum('vector_document_type', [
  'account',
  'contact',
  'call',
  'knowledge',
  'campaign'
]);

export const pipelineTypeEnum = pgEnum('pipeline_type', ['revenue', 'expansion', 'agency']);

// ==================== PHASE: SMTP TRANSACTIONAL EMAIL SYSTEM ====================

// SMTP Provider Type Enum
export const smtpProviderTypeEnum = pgEnum('smtp_provider_type', [
  'gmail',      // Google Workspace Gmail
  'outlook',    // Microsoft 365 Outlook/Exchange
  'custom'      // Custom SMTP server
]);

// SMTP Auth Type Enum
export const smtpAuthTypeEnum = pgEnum('smtp_auth_type', [
  'oauth2',       // OAuth2 authentication (recommended for Gmail/Outlook)
  'basic',        // Basic username/password
  'app_password'  // App-specific password
]);

// Transactional Event Type Enum
export const transactionalEventTypeEnum = pgEnum('transactional_event_type', [
  'welcome',              // New user signup
  'password_reset',       // Password reset request
  'password_changed',     // Password successfully changed
  'account_verification', // Email verification
  'account_updated',      // Account settings changed
  'notification',         // Generic notification
  'lead_alert',           // New qualified lead notification
  'campaign_completed',   // Campaign finished
  'report_ready',         // Report generated
  'invoice',              // Invoice/billing
  'subscription_expiring',// Subscription warning
  'two_factor_code'       // 2FA verification code
]);

// SMTP Verification Status Enum
export const smtpVerificationStatusEnum = pgEnum('smtp_verification_status', [
  'pending',      // Not yet verified
  'verifying',    // Verification in progress
  'verified',     // Successfully verified
  'failed'        // Verification failed
]);

// Recording Status Enum - For call recording lifecycle
export const recordingStatusEnum = pgEnum('recording_status', [
  'pending',    // Recording not yet started
  'recording',  // Currently recording
  'uploading',  // Uploading to cloud storage
  'stored',     // Successfully stored in S3/GCS
  'failed'      // Recording failed
]);

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

// Pipeline Account Buyer Journey Stages
export const pipelineAccountStageEnum = pgEnum('pipeline_account_stage', [
  'unassigned',      // Not yet assigned to AE
  'assigned',        // Assigned to AE, awaiting outreach
  'outreach',        // AE initiating contact
  'engaged',         // Prospect responding/meeting scheduled
  'qualifying',      // In active qualification
  'qualified',       // Qualified, ready for opportunity creation
  'disqualified',    // Not a fit
  'on_hold'          // Paused for later
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
  'blog_post',
  'ebook',
  'solution_brief'
]);

export const generativeStudioContentStatusEnum = pgEnum('generative_studio_content_status', [
  'generating',
  'generated',
  'editing',
  'previewing',
  'published',
  'failed',
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
  'lead_verification_oncall',
  // Business-critical monitoring events
  'lead_created',
  'lead_qualified',
  'lead_rejected',
  'transcription_started',
  'transcription_completed',
  'transcription_failed',
  'voicemail_detected',
  'amd_human_detected',
  'amd_machine_detected',
  'qa_analysis_started',
  'qa_analysis_completed',
  'qa_auto_approved',
  'qa_auto_rejected',
  'qa_needs_review',
  'disposition_not_interested',
  'disposition_invalid_data',
  'disposition_voicemail',
  'disposition_no_answer',
  'disposition_needs_review',
  // Admin audit events
  'lead_deleted',
  'lead_qa_status_changed',
  'contact_deleted',
  'campaign_deleted',
  'phone_bulk_update',
  'admin_delete_contacts',
  'admin_delete_accounts',
  'admin_delete_leads',
  'admin_delete_all_data'
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

// ==================== MULTI-CHANNEL CAMPAIGN ENUMS ====================

/** Channel type for multi-channel campaigns */
export const channelTypeEnum = pgEnum('channel_type', ['email', 'voice']);

/** Status of a channel variant */
export const channelVariantStatusEnum = pgEnum('channel_variant_status', [
  'draft',
  'pending_review',
  'approved',
  'active',
  'paused'
]);

/** Generation status for channel variants */
export const channelGenerationStatusEnum = pgEnum('channel_generation_status', [
  'not_configured',
  'pending',
  'generating',
  'generated',
  'approved',
  'failed'
]);

/** Template scope for layered template system */
export const templateScopeEnum = pgEnum('template_scope', [
  'campaign',
  'account',
  'contact'
]);

/** Template types for voice channel */
export const voiceTemplateTypeEnum = pgEnum('voice_template_type', [
  'opening',
  'gatekeeper',
  'pitch',
  'objection_handling',
  'closing',
  'voicemail'
]);

/** Template types for email channel */
export const emailTemplateTypeEnum = pgEnum('email_template_type', [
  'subject',
  'preheader',
  'greeting',
  'body_intro',
  'value_proposition',
  'call_to_action',
  'closing',
  'signature'
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
  // Agent telephony settings
  callbackPhone: text("callback_phone"), // Phone number to call agent for click-to-call
  sipExtension: text("sip_extension"), // Optional SIP extension for WebRTC
  // TOTP/Google Authenticator MFA fields
  mfaEnabled: boolean("mfa_enabled").notNull().default(false),
  totpSecret: text("totp_secret"), // Encrypted TOTP secret
  backupCodes: jsonb("backup_codes").$type<string[]>(), // Array of backup codes
  usedBackupCodes: jsonb("used_backup_codes").$type<string[]>().default([]), // Track used codes
  mfaEnrolledAt: timestamp("mfa_enrolled_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (table) => ({
  emailIdx: index("users_email_idx").on(table.email),
  usernameIdx: index("users_username_idx").on(table.username),
}));

// ==================== PROMPT REGISTRY ====================

// Prompt Type Enum
export const promptTypeEnum = pgEnum('prompt_type', [
  'foundational',  // Core agent behavior prompts
  'system',        // System-level instructions
  'specialized',   // Task-specific prompts
  'template'       // User-editable templates
]);

// Prompt Scope Enum
export const promptScopeEnum = pgEnum('prompt_scope', [
  'global',        // Applies to all operations
  'organization',  // Organization-specific
  'campaign',      // Campaign-specific
  'agent_type'     // Specific to agent type
]);

// Prompt Category Enum
export const promptCategoryEnum = pgEnum('prompt_category', [
  'voice',         // Voice call agents
  'email',         // Email generation/analysis
  'intelligence',  // Research and intelligence
  'compliance',    // Compliance and governance
  'system'         // System prompts
]);

// Prompt Registry table - stores all AI prompts
export const promptRegistry = pgTable("prompt_registry", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  promptKey: varchar("prompt_key", { length: 100 }).notNull().unique(), // Unique identifier like 'email.generation'
  name: text("name").notNull(),
  description: text("description"),
  promptType: promptTypeEnum("prompt_type").notNull().default('system'),
  promptScope: promptScopeEnum("prompt_scope").notNull().default('agent_type'),
  agentType: text("agent_type"), // 'voice', 'email', 'compliance', etc.
  category: promptCategoryEnum("category"),
  content: text("content").notNull(), // The actual prompt content
  defaultContent: text("default_content").notNull(), // Original from codebase
  isActive: boolean("is_active").notNull().default(true),
  isLocked: boolean("is_locked").notNull().default(false), // Prevent editing
  priority: integer("priority").notNull().default(50), // For ordering (0-100)
  tags: jsonb("tags").$type<string[]>().default([]),
  sourceFile: text("source_file"), // Where the prompt came from
  sourceLine: integer("source_line"),
  sourceExport: text("source_export"), // Export name from source file
  version: integer("version").notNull().default(1),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  createdBy: varchar("created_by").references(() => users.id, { onDelete: 'set null' }),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
  updatedBy: varchar("updated_by").references(() => users.id, { onDelete: 'set null' }),
}, (table) => ({
  promptKeyIdx: uniqueIndex("prompt_registry_key_idx").on(table.promptKey),
  categoryIdx: index("prompt_registry_category_idx").on(table.category),
  agentTypeIdx: index("prompt_registry_agent_type_idx").on(table.agentType),
  activeIdx: index("prompt_registry_active_idx").on(table.isActive),
}));

// Prompt Versions table - tracks version history
export const promptVersions = pgTable("prompt_versions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  promptId: varchar("prompt_id").notNull().references(() => promptRegistry.id, { onDelete: 'cascade' }),
  version: integer("version").notNull(),
  content: text("content").notNull(),
  previousContent: text("previous_content"),
  changeDescription: text("change_description"),
  changedBy: varchar("changed_by").references(() => users.id, { onDelete: 'set null' }),
  changedAt: timestamp("changed_at").notNull().defaultNow(),
  addedLines: integer("added_lines").default(0),
  removedLines: integer("removed_lines").default(0),
  modifiedLines: integer("modified_lines").default(0),
}, (table) => ({
  promptIdIdx: index("prompt_versions_prompt_id_idx").on(table.promptId),
  versionIdx: index("prompt_versions_version_idx").on(table.promptId, table.version),
}));

// Insert schemas for prompt tables
export const insertPromptRegistrySchema = createInsertSchema(promptRegistry);
export const insertPromptVersionsSchema = createInsertSchema(promptVersions);

export type InsertPromptRegistry = z.infer<typeof insertPromptRegistrySchema>;
export type InsertPromptVersions = z.infer<typeof insertPromptVersionsSchema>;
export type PromptRegistry = typeof promptRegistry.$inferSelect;
export type PromptVersion = typeof promptVersions.$inferSelect;

// ==================== CUSTOM CALL FLOWS ====================
// Updated types to match actual call flow step structure

export const customCallFlows = pgTable("custom_call_flows", {
  id: varchar("id").primaryKey(),
  name: text("name").notNull(),
  objective: text("objective").notNull(),
  successCriteria: text("success_criteria").notNull(),
  maxTotalTurns: integer("max_total_turns").notNull().default(20),
  steps: jsonb("steps").$type<Array<{
    stepId: string;
    name: string;
    mappedState?: string;
    goal?: string;
    allowedIntents?: string[];
    forbiddenIntents?: string[];
    allowedQuestions?: number;
    maxTurnsInStep?: number;
    mustDo?: string[];
    mustNotDo?: string[];
    exitCriteria?: Array<{ signal: string; description: string; nextStep?: string }>;
    branches?: Array<{ trigger: string; condition: string; targetStep?: string; capability?: string; description?: string }>;
    fallback?: { action: string; maxAttempts?: number; message?: string };
  }>>().default([]),
  version: integer("version").notNull().default(1),
  isActive: boolean("is_active").notNull().default(true),
  createdBy: varchar("created_by").references(() => users.id, { onDelete: 'set null' }),
  updatedBy: varchar("updated_by").references(() => users.id, { onDelete: 'set null' }),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (table) => ({
  nameIdx: index("custom_call_flows_name_idx").on(table.name),
  activeIdx: index("custom_call_flows_active_idx").on(table.isActive),
}));

export const customCallFlowMappings = pgTable("custom_call_flow_mappings", {
  campaignType: text("campaign_type").primaryKey(),
  callFlowId: text("call_flow_id").notNull(),
  updatedBy: varchar("updated_by").references(() => users.id, { onDelete: 'set null' }),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (table) => ({
  callFlowIdx: index("custom_call_flow_mappings_flow_idx").on(table.callFlowId),
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

// ==================== IAM (Identity & Access Management) ====================

// IAM Entity Types - resources that can be accessed
export const iamEntityTypeEnum = pgEnum('iam_entity_type', [
  'account',
  'project', 
  'campaign',
  'agent',
  'call_session',
  'recording',
  'transcript',
  'report',
  'lead',
  'delivery',
  'domain',
  'smtp',
  'email_template',
  'prompt',
  'quality_review',
  'audit_log',
  'user',
  'team',
  'role',
  'policy',
  'secret'
]);

// IAM Actions - operations that can be performed
export const iamActionEnum = pgEnum('iam_action', [
  'view',
  'create',
  'edit',
  'delete',
  'run',
  'execute',
  'approve',
  'publish',
  'assign',
  'export',
  'manage_settings',
  'view_sensitive',
  'manage_access'
]);

// IAM Scope Types - how access is scoped
export const iamScopeTypeEnum = pgEnum('iam_scope_type', [
  'all',           // All resources of this type
  'assigned',      // Only assigned resources
  'own',           // Only resources they created
  'team',          // Resources assigned to their team
  'account',       // Scoped to specific accounts
  'project',       // Scoped to specific projects
  'campaign',      // Scoped to specific campaigns
  'organization'   // Scoped to organization
]);

// Grant Types
export const iamGrantTypeEnum = pgEnum('iam_grant_type', [
  'assignment',    // User is assigned to entity
  'permission',    // User has permission over entity
  'temporary',     // Time-bound access
  'break_glass'    // Emergency access requiring reason
]);

// Access Request Status
export const iamRequestStatusEnum = pgEnum('iam_request_status', [
  'pending',
  'approved',
  'denied',
  'expired',
  'revoked'
]);

// Teams - grouping for users
export const iamTeams = pgTable("iam_teams", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull(),
  description: text("description"),
  organizationId: varchar("organization_id").references(() => campaignOrganizations.id, { onDelete: 'cascade' }),
  parentTeamId: varchar("parent_team_id"), // For nested teams
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  createdBy: varchar("created_by").references(() => users.id, { onDelete: 'set null' }),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
  updatedBy: varchar("updated_by").references(() => users.id, { onDelete: 'set null' }),
}, (table) => ({
  orgIdx: index("iam_teams_org_idx").on(table.organizationId),
  nameOrgIdx: uniqueIndex("iam_teams_name_org_idx").on(table.name, table.organizationId),
}));

// Team Members
export const iamTeamMembers = pgTable("iam_team_members", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  teamId: varchar("team_id").notNull().references(() => iamTeams.id, { onDelete: 'cascade' }),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: 'cascade' }),
  isLead: boolean("is_lead").notNull().default(false), // Team lead can approve requests
  joinedAt: timestamp("joined_at").notNull().defaultNow(),
  addedBy: varchar("added_by").references(() => users.id, { onDelete: 'set null' }),
}, (table) => ({
  teamUserIdx: uniqueIndex("iam_team_members_team_user_idx").on(table.teamId, table.userId),
  userIdx: index("iam_team_members_user_idx").on(table.userId),
}));

// IAM Roles - bundles of policies with friendly names
export const iamRoles = pgTable("iam_roles", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull(),
  description: text("description"),
  organizationId: varchar("organization_id").references(() => campaignOrganizations.id, { onDelete: 'cascade' }),
  isSystem: boolean("is_system").notNull().default(false), // System roles cannot be deleted
  isDefault: boolean("is_default").notNull().default(false), // Assigned to new users
  priority: integer("priority").notNull().default(0), // Higher priority = evaluated first
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  createdBy: varchar("created_by").references(() => users.id, { onDelete: 'set null' }),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
  updatedBy: varchar("updated_by").references(() => users.id, { onDelete: 'set null' }),
}, (table) => ({
  nameOrgIdx: uniqueIndex("iam_roles_name_org_idx").on(table.name, table.organizationId),
  orgIdx: index("iam_roles_org_idx").on(table.organizationId),
}));

// IAM Policies - define entity + actions + scope + conditions
export const iamPolicies = pgTable("iam_policies", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull(),
  description: text("description"),
  organizationId: varchar("organization_id").references(() => campaignOrganizations.id, { onDelete: 'cascade' }),
  entityType: iamEntityTypeEnum("entity_type").notNull(),
  actions: jsonb("actions").$type<string[]>().notNull(), // Array of actions from iamActionEnum
  scopeType: iamScopeTypeEnum("scope_type").notNull().default('assigned'),
  conditions: jsonb("conditions").$type<Record<string, any>>(), // e.g., { "report.visibility": "ClientPublished" }
  fieldRules: jsonb("field_rules").$type<Record<string, any>>(), // Field-level access control
  effect: text("effect").notNull().default('allow'), // 'allow' or 'deny'
  isSystem: boolean("is_system").notNull().default(false),
  priority: integer("priority").notNull().default(0),
  isActive: boolean("is_active").notNull().default(true),
  version: integer("version").notNull().default(1),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  createdBy: varchar("created_by").references(() => users.id, { onDelete: 'set null' }),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
  updatedBy: varchar("updated_by").references(() => users.id, { onDelete: 'set null' }),
}, (table) => ({
  entityTypeIdx: index("iam_policies_entity_type_idx").on(table.entityType),
  orgIdx: index("iam_policies_org_idx").on(table.organizationId),
  activeIdx: index("iam_policies_active_idx").on(table.isActive),
}));

// Role-Policy junction (roles bundle multiple policies)
export const iamRolePolicies = pgTable("iam_role_policies", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  roleId: varchar("role_id").notNull().references(() => iamRoles.id, { onDelete: 'cascade' }),
  policyId: varchar("policy_id").notNull().references(() => iamPolicies.id, { onDelete: 'cascade' }),
  addedAt: timestamp("added_at").notNull().defaultNow(),
  addedBy: varchar("added_by").references(() => users.id, { onDelete: 'set null' }),
}, (table) => ({
  rolePolicyIdx: uniqueIndex("iam_role_policies_role_policy_idx").on(table.roleId, table.policyId),
  roleIdx: index("iam_role_policies_role_idx").on(table.roleId),
  policyIdx: index("iam_role_policies_policy_idx").on(table.policyId),
}));

// User-Role assignments (user can have multiple roles)
export const iamUserRoles = pgTable("iam_user_roles", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: 'cascade' }),
  roleId: varchar("role_id").notNull().references(() => iamRoles.id, { onDelete: 'cascade' }),
  organizationId: varchar("organization_id").references(() => campaignOrganizations.id, { onDelete: 'cascade' }),
  assignedAt: timestamp("assigned_at").notNull().defaultNow(),
  assignedBy: varchar("assigned_by").references(() => users.id, { onDelete: 'set null' }),
  expiresAt: timestamp("expires_at"), // Optional expiration
}, (table) => ({
  userRoleOrgIdx: uniqueIndex("iam_user_roles_user_role_org_idx").on(table.userId, table.roleId, table.organizationId),
  userIdx: index("iam_user_roles_user_idx").on(table.userId),
  roleIdx: index("iam_user_roles_role_idx").on(table.roleId),
}));

// Team-Role assignments (teams can have roles)
export const iamTeamRoles = pgTable("iam_team_roles", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  teamId: varchar("team_id").notNull().references(() => iamTeams.id, { onDelete: 'cascade' }),
  roleId: varchar("role_id").notNull().references(() => iamRoles.id, { onDelete: 'cascade' }),
  assignedAt: timestamp("assigned_at").notNull().defaultNow(),
  assignedBy: varchar("assigned_by").references(() => users.id, { onDelete: 'set null' }),
}, (table) => ({
  teamRoleIdx: uniqueIndex("iam_team_roles_team_role_idx").on(table.teamId, table.roleId),
  teamIdx: index("iam_team_roles_team_idx").on(table.teamId),
}));

// Entity Assignments - assigns users/teams to specific entities (accounts/projects/campaigns)
export const iamEntityAssignments = pgTable("iam_entity_assignments", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  // Principal (who is assigned)
  userId: varchar("user_id").references(() => users.id, { onDelete: 'cascade' }),
  teamId: varchar("team_id").references(() => iamTeams.id, { onDelete: 'cascade' }),
  // Entity (what is assigned)
  entityType: iamEntityTypeEnum("entity_type").notNull(),
  entityId: varchar("entity_id").notNull(),
  // Assignment details
  assignmentRole: text("assignment_role"), // e.g., 'owner', 'ae', 'qa', 'viewer'
  isActive: boolean("is_active").notNull().default(true),
  assignedAt: timestamp("assigned_at").notNull().defaultNow(),
  assignedBy: varchar("assigned_by").references(() => users.id, { onDelete: 'set null' }),
  expiresAt: timestamp("expires_at"),
  notes: text("notes"),
}, (table) => ({
  userEntityIdx: index("iam_entity_assignments_user_entity_idx").on(table.userId, table.entityType, table.entityId),
  teamEntityIdx: index("iam_entity_assignments_team_entity_idx").on(table.teamId, table.entityType, table.entityId),
  entityIdx: index("iam_entity_assignments_entity_idx").on(table.entityType, table.entityId),
}));

// Access Grants - fine-grained permission grants on specific entities
export const iamAccessGrants = pgTable("iam_access_grants", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  // Principal
  userId: varchar("user_id").references(() => users.id, { onDelete: 'cascade' }),
  teamId: varchar("team_id").references(() => iamTeams.id, { onDelete: 'cascade' }),
  // Entity
  entityType: iamEntityTypeEnum("entity_type").notNull(),
  entityId: varchar("entity_id"), // NULL = all entities of this type (within scope)
  // Grant details
  grantType: iamGrantTypeEnum("grant_type").notNull().default('permission'),
  actions: jsonb("actions").$type<string[]>().notNull(), // Allowed actions
  conditions: jsonb("conditions").$type<Record<string, any>>(), // Additional conditions
  // Metadata
  isActive: boolean("is_active").notNull().default(true),
  grantedAt: timestamp("granted_at").notNull().defaultNow(),
  grantedBy: varchar("granted_by").references(() => users.id, { onDelete: 'set null' }),
  expiresAt: timestamp("expires_at"),
  reason: text("reason"), // Required for break-glass grants
}, (table) => ({
  userGrantIdx: index("iam_access_grants_user_idx").on(table.userId),
  teamGrantIdx: index("iam_access_grants_team_idx").on(table.teamId),
  entityGrantIdx: index("iam_access_grants_entity_idx").on(table.entityType, table.entityId),
  activeIdx: index("iam_access_grants_active_idx").on(table.isActive),
}));

// Access Requests - approval workflow for access
export const iamAccessRequests = pgTable("iam_access_requests", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  // Requester
  requesterId: varchar("requester_id").notNull().references(() => users.id, { onDelete: 'cascade' }),
  // Requested entity
  entityType: iamEntityTypeEnum("entity_type").notNull(),
  entityId: varchar("entity_id"),
  entityName: text("entity_name"), // Cached name for display
  // Requested access
  actions: jsonb("actions").$type<string[]>().notNull(),
  requestedDuration: text("requested_duration"), // e.g., '7d', '30d', 'permanent'
  reason: text("reason").notNull(),
  // Workflow
  status: iamRequestStatusEnum("status").notNull().default('pending'),
  reviewerId: varchar("reviewer_id").references(() => users.id, { onDelete: 'set null' }),
  reviewedAt: timestamp("reviewed_at"),
  reviewNotes: text("review_notes"),
  // Result
  grantId: varchar("grant_id").references(() => iamAccessGrants.id, { onDelete: 'set null' }), // Created grant if approved
  // Metadata
  createdAt: timestamp("created_at").notNull().defaultNow(),
  expiresAt: timestamp("expires_at"),
}, (table) => ({
  requesterIdx: index("iam_access_requests_requester_idx").on(table.requesterId),
  statusIdx: index("iam_access_requests_status_idx").on(table.status),
  reviewerIdx: index("iam_access_requests_reviewer_idx").on(table.reviewerId),
}));

// IAM Audit Events - detailed audit trail for IAM changes
export const iamAuditEvents = pgTable("iam_audit_events", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  // Actor
  actorId: varchar("actor_id").references(() => users.id, { onDelete: 'set null' }),
  actorType: text("actor_type").notNull().default('user'), // 'user', 'system', 'api'
  actorIp: text("actor_ip"),
  actorUserAgent: text("actor_user_agent"),
  // Action
  action: text("action").notNull(), // 'grant_created', 'role_assigned', 'policy_updated', etc.
  entityType: iamEntityTypeEnum("entity_type"),
  entityId: varchar("entity_id"),
  // Target (who/what was affected)
  targetUserId: varchar("target_user_id").references(() => users.id, { onDelete: 'set null' }),
  targetTeamId: varchar("target_team_id").references(() => iamTeams.id, { onDelete: 'set null' }),
  // Change details
  beforeState: jsonb("before_state"),
  afterState: jsonb("after_state"),
  changeDescription: text("change_description"),
  requestId: varchar("request_id"), // Link to access request if applicable
  reason: text("reason"), // Required for sensitive operations
  // Metadata
  createdAt: timestamp("created_at").notNull().defaultNow(),
  organizationId: varchar("organization_id").references(() => campaignOrganizations.id, { onDelete: 'set null' }),
}, (table) => ({
  actorIdx: index("iam_audit_events_actor_idx").on(table.actorId),
  actionIdx: index("iam_audit_events_action_idx").on(table.action),
  entityIdx: index("iam_audit_events_entity_idx").on(table.entityType, table.entityId),
  targetUserIdx: index("iam_audit_events_target_user_idx").on(table.targetUserId),
  createdAtIdx: index("iam_audit_events_created_at_idx").on(table.createdAt),
  orgIdx: index("iam_audit_events_org_idx").on(table.organizationId),
}));

// Insert schemas for IAM tables
export const insertIamTeamSchema = createInsertSchema(iamTeams);
export const insertIamTeamMemberSchema = createInsertSchema(iamTeamMembers);
export const insertIamRoleSchema = createInsertSchema(iamRoles);
export const insertIamPolicySchema = createInsertSchema(iamPolicies);
export const insertIamRolePolicySchema = createInsertSchema(iamRolePolicies);
export const insertIamUserRoleSchema = createInsertSchema(iamUserRoles);
export const insertIamTeamRoleSchema = createInsertSchema(iamTeamRoles);
export const insertIamEntityAssignmentSchema = createInsertSchema(iamEntityAssignments);
export const insertIamAccessGrantSchema = createInsertSchema(iamAccessGrants);
export const insertIamAccessRequestSchema = createInsertSchema(iamAccessRequests);
export const insertIamAuditEventSchema = createInsertSchema(iamAuditEvents);

export type IamTeam = typeof iamTeams.$inferSelect;
export type IamTeamMember = typeof iamTeamMembers.$inferSelect;
export type IamRole = typeof iamRoles.$inferSelect;
export type IamPolicy = typeof iamPolicies.$inferSelect;
export type IamRolePolicy = typeof iamRolePolicies.$inferSelect;
export type IamUserRole = typeof iamUserRoles.$inferSelect;
export type IamTeamRole = typeof iamTeamRoles.$inferSelect;
export type IamEntityAssignment = typeof iamEntityAssignments.$inferSelect;
export type IamAccessGrant = typeof iamAccessGrants.$inferSelect;
export type IamAccessRequest = typeof iamAccessRequests.$inferSelect;
export type IamAuditEvent = typeof iamAuditEvents.$inferSelect;

export type InsertIamTeam = z.infer<typeof insertIamTeamSchema>;
export type InsertIamTeamMember = z.infer<typeof insertIamTeamMemberSchema>;
export type InsertIamRole = z.infer<typeof insertIamRoleSchema>;
export type InsertIamPolicy = z.infer<typeof insertIamPolicySchema>;
export type InsertIamEntityAssignment = z.infer<typeof insertIamEntityAssignmentSchema>;
export type InsertIamAccessGrant = z.infer<typeof insertIamAccessGrantSchema>;
export type InsertIamAccessRequest = z.infer<typeof insertIamAccessRequestSchema>;
export type InsertIamAuditEvent = z.infer<typeof insertIamAuditEventSchema>;

// ==================== SECRET MANAGEMENT ====================

export const secretEnvironmentEnum = pgEnum("secret_environment", [
  "development", // Non-prod contexts
  "production"   // Live secrets
]);

export const secretStore = pgTable("secret_store", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull(),
  description: text("description"),
  environment: secretEnvironmentEnum("environment").notNull().default("development"),
  service: text("service").notNull(),
  usageContext: text("usage_context").notNull(),
  metadata: jsonb("metadata").default(sql`'{}'::jsonb`),
  encryptedValue: text("encrypted_value").notNull(),
  version: integer("version").notNull().default(1),
  isActive: boolean("is_active").notNull().default(true),
  lastRotatedAt: timestamp("last_rotated_at"),
  rotatedBy: varchar("rotated_by").references(() => users.id, { onDelete: "set null" }),
  deactivatedAt: timestamp("deactivated_at"),
  deactivatedBy: varchar("deactivated_by").references(() => users.id, { onDelete: "set null" }),
  organizationId: varchar("organization_id").references(() => campaignOrganizations.id, { onDelete: "set null" }),
  createdBy: varchar("created_by").references(() => users.id, { onDelete: "set null" }),
  updatedBy: varchar("updated_by").references(() => users.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (table) => ({
  envServiceUsageIdx: uniqueIndex("secret_store_env_service_usage_idx").on(table.environment, table.service, table.usageContext, table.name),
  environmentIdx: index("secret_store_environment_idx").on(table.environment),
  serviceIdx: index("secret_store_service_idx").on(table.service),
  activeIdx: index("secret_store_active_idx").on(table.isActive),
}));

export const secretStoreRelations = relations(secretStore, ({ one }) => ({
  createdByUser: one(users, { fields: [secretStore.createdBy], references: [users.id] }),
  updatedByUser: one(users, { fields: [secretStore.updatedBy], references: [users.id] }),
  rotatedByUser: one(users, { fields: [secretStore.rotatedBy], references: [users.id] }),
  deactivatedByUser: one(users, { fields: [secretStore.deactivatedBy], references: [users.id] }),
  organization: one(campaignOrganizations, { fields: [secretStore.organizationId], references: [campaignOrganizations.id] }),
}));

export const insertSecretStoreSchema = createInsertSchema(secretStore).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
  lastRotatedAt: true,
  rotatedBy: true,
  deactivatedAt: true,
  deactivatedBy: true,
  updatedBy: true,
});

export type SecretStoreRecord = typeof secretStore.$inferSelect;
export type InsertSecretStore = z.infer<typeof insertSecretStoreSchema>;

export type SecretEnvironment = "production" | "development";

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

  // Contact-Level Retry Suppression fields
  lastCallAttemptAt: timestamp("last_call_attempt_at"),
  lastCallOutcome: text("last_call_outcome"), // voicemail, no_answer, busy, rejected, unavailable, completed, qualified_lead, etc.
  nextCallEligibleAt: timestamp("next_call_eligible_at"),
  suppressionReason: text("suppression_reason"), // Human-readable reason for current suppression

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
  nextCallEligibleIdx: index("contacts_next_call_eligible_idx").on(table.nextCallEligibleAt),
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
  // Client & project linkage (governed access)
  clientAccountId: varchar("client_account_id").references(() => clientAccounts.id, { onDelete: 'set null' }),
  projectId: varchar("project_id").references(() => clientProjects.id, { onDelete: 'set null' }),
  // Approval workflow for client visibility
  approvalStatus: contentApprovalStatusEnum("approval_status").notNull().default('draft'),
  approvedById: varchar("approved_by_id").references(() => users.id, { onDelete: 'set null' }),
  approvedAt: timestamp("approved_at"),
  publishedAt: timestamp("published_at"),
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
  dialMode: dialModeEnum("dial_mode").notNull().default('ai_agent'),

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

  // Voice Provider Configuration (supports Google Gemini Live and OpenAI Realtime)
  voiceProvider: text("voice_provider"), // 'google' | 'openai' | null (uses default)
  voiceProviderFallback: boolean("voice_provider_fallback").default(true), // Enable automatic fallback to alternate provider

  // Max Call Duration - strictly enforces call time limits per campaign
  maxCallDurationSeconds: integer("max_call_duration_seconds").default(240), // Default 4 minutes, range: 60-1800 seconds

  // Concurrent Worker Settings (AI Deployment Capacity)
  maxConcurrentWorkers: integer("max_concurrent_workers").default(1),
  
  // Multi-voice Assignment (for voice rotation)
  assignedVoices: jsonb("assigned_voices"), // Array of { id: string, name: string }

  // Problem Intelligence Organization (links to campaign_organizations for problem framework)
  problemIntelligenceOrgId: varchar("problem_intelligence_org_id"), // References campaignOrganizations.id

  // AI Agent Campaign Context (Foundation + Campaign Layer Architecture)
  // These fields are combined with the virtual agent's foundation prompt at runtime
  campaignObjective: text("campaign_objective"), // e.g., "Book qualified meetings with IT decision makers"
  productServiceInfo: text("product_service_info"), // Product/service details and value propositions
  talkingPoints: jsonb("talking_points"), // Key points: ["Reduces costs by 40%", "SOC2 compliant", ...]
  targetAudienceDescription: text("target_audience_description"), // e.g., "CISOs at mid-market companies (500-5000 employees)"
  campaignObjections: jsonb("campaign_objections"), // [{objection: "We have a solution", response: "..."}]
  successCriteria: text("success_criteria"), // e.g., "Meeting booked with decision maker"
  campaignContextBrief: text("campaign_context_brief"), // Short summary for AI context injection

  // Call Flow Configuration - defines the state machine for AI agent call execution
  // Structure: { steps: CallFlowStep[], defaultBehavior: string }
  // CallFlowStep: { id, name, description, entryConditions, allowedUtterances, exitConditions, objectionHandling, nextSteps }
  callFlow: jsonb("call_flow"), // Call flow state machine configuration

  // Account Intelligence Toggle - allows campaigns to work without intelligence generation delays
  requireAccountIntelligence: boolean("require_account_intelligence").default(false), // When false, skips intelligence lookup for immediate call start

  // ==================== PROJECT ATTACHMENT FIELDS ====================
  // These fields are populated from the linked project when auto-creating campaigns
  landingPageUrl: text("landing_page_url"), // Client's landing page URL (from project)
  projectFileUrl: text("project_file_url"), // Client's uploaded project brief/assets URL (from project)

  // Intake request linkage for traceability
  intakeRequestId: varchar("intake_request_id"), // Reference to campaign intake request
  creationMode: text("creation_mode"), // 'manual' | 'agentic' | 'intake' - how the campaign was created

  // ==================== MULTI-CHANNEL CAMPAIGN FIELDS ====================
  // Enabled channels for this campaign (e.g., ['email', 'voice'] for both)
  enabledChannels: text("enabled_channels").array().default(sql`ARRAY['voice']::text[]`),

  // Generation status per channel: { email: 'generated', voice: 'approved' }
  channelGenerationStatus: jsonb("channel_generation_status"),

  // ==================== TELNYX PHONE NUMBER ASSIGNMENT ====================
  // Links campaign to a specific Telnyx phone number from the number pool
  callerPhoneNumberId: varchar("caller_phone_number_id"), // References telnyx_numbers.id (not a FK to avoid circular deps)
  callerPhoneNumber: text("caller_phone_number"), // Denormalized E.164 phone number for quick access

  // ==================== NUMBER POOL ROTATION SETTINGS ====================
  // Configuration for automatic phone number rotation to avoid spam flags
  // Schema: { enabled: boolean, maxCallsPerNumber?: number, rotationStrategy?: 'round_robin' | 'reputation_based' | 'region_match', cooldownHours?: number }
  numberPoolConfig: jsonb("number_pool_config"),

  // ==================== STALL REASON TRACKING ====================
  // Persisted by the AI orchestrator when campaigns silently stop making calls
  lastStallReason: text("last_stall_reason"),
  lastStallReasonAt: timestamp("last_stall_reason_at"),

  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
  launchedAt: timestamp("launched_at"),
}, (table) => ({
  statusIdx: index("campaigns_status_idx").on(table.status),
  typeIdx: index("campaigns_type_idx").on(table.type),
  clientAccountIdx: index("campaigns_client_account_idx").on(table.clientAccountId),
  projectIdx: index("campaigns_project_idx").on(table.projectId),
  approvalStatusIdx: index("campaigns_approval_status_idx").on(table.approvalStatus),
  dialModeIdx: index("campaigns_dial_mode_idx").on(table.dialMode),
  deliveryTemplateIdx: index("campaigns_delivery_template_idx").on(table.deliveryTemplateId),
}));

// Account Messaging Briefs (per-account, optional campaign context)
export const accountMessagingBriefs = pgTable('account_messaging_briefs', {
  id: serial('id').primaryKey(),
  workspaceId: varchar('workspace_id'),
  accountId: varchar('account_id').references(() => accounts.id, { onDelete: 'cascade' }).notNull(),
  campaignId: varchar('campaign_id').references(() => campaigns.id, { onDelete: 'set null' }),
  intelligenceVersion: integer('intelligence_version').notNull(),
  payloadJson: jsonb('payload_json').notNull(),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
}, (table) => ({
  accountIdIdx: index('account_messaging_briefs_account_id_idx').on(table.accountId),
  campaignIdIdx: index('account_messaging_briefs_campaign_id_idx').on(table.campaignId),
  createdAtIdx: index('account_messaging_briefs_created_at_idx').on(table.createdAt),
}));

// Account Call Briefs (per-account, optional campaign context)
export const accountCallBriefs = pgTable('account_call_briefs', {
  id: serial('id').primaryKey(),
  workspaceId: varchar('workspace_id'),
  accountId: varchar('account_id').references(() => accounts.id, { onDelete: 'cascade' }).notNull(),
  campaignId: varchar('campaign_id').references(() => campaigns.id, { onDelete: 'set null' }),
  intelligenceVersion: integer('intelligence_version').notNull(),
  campaignFingerprint: text('campaign_fingerprint').notNull(),
  payloadJson: jsonb('payload_json').notNull(),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
}, (table) => ({
  accountIdIdx: index('account_call_briefs_account_id_idx').on(table.accountId),
  campaignIdIdx: index('account_call_briefs_campaign_id_idx').on(table.campaignId),
  createdAtIdx: index('account_call_briefs_created_at_idx').on(table.createdAt),
}));

export const insertAccountMessagingBriefSchema = createInsertSchema(accountMessagingBriefs);
export type AccountMessagingBrief = typeof accountMessagingBriefs.$inferSelect;
export const insertAccountCallBriefSchema = createInsertSchema(accountCallBriefs);
export type AccountCallBrief = typeof accountCallBriefs.$inferSelect;

// ==================== MULTI-CHANNEL CAMPAIGN TABLES ====================

/**
 * Campaign Channel Variants
 * Stores channel-specific configurations derived from the shared campaign context.
 * Each campaign can have one variant per channel type (email, voice).
 */
export const campaignChannelVariants = pgTable("campaign_channel_variants", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  campaignId: varchar("campaign_id").references(() => campaigns.id, { onDelete: 'cascade' }).notNull(),
  channelType: channelTypeEnum("channel_type").notNull(),

  // Status and approval
  status: channelVariantStatusEnum("status").notNull().default('draft'),
  approvedBy: varchar("approved_by").references(() => users.id, { onDelete: 'set null' }),
  approvedAt: timestamp("approved_at"),

  // Generated flow (CallFlowConfig for voice, EmailSequenceFlow for email)
  generatedFlow: jsonb("generated_flow"),

  // User customizations that override the generated flow
  flowOverride: jsonb("flow_override"),

  // Channel-specific settings (voice: persona, provider; email: tone, sender)
  channelSettings: jsonb("channel_settings"),

  // Generated execution prompt for this channel
  executionPrompt: text("execution_prompt"),
  executionPromptVersion: integer("execution_prompt_version").default(1),
  executionPromptGeneratedAt: timestamp("execution_prompt_generated_at"),

  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (table) => ({
  // Unique constraint: one variant per channel per campaign
  campaignChannelUnique: uniqueIndex("campaign_channel_variants_campaign_channel_unique")
    .on(table.campaignId, table.channelType),
  campaignIdIdx: index("campaign_channel_variants_campaign_id_idx").on(table.campaignId),
  statusIdx: index("campaign_channel_variants_status_idx").on(table.status),
}));

export const insertCampaignChannelVariantSchema = createInsertSchema(campaignChannelVariants).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type CampaignChannelVariant = typeof campaignChannelVariants.$inferSelect;
export type InsertCampaignChannelVariant = z.infer<typeof insertCampaignChannelVariantSchema>;

/**
 * Campaign Templates
 * Layered template system supporting campaign, account, and contact level templates.
 * Resolution priority: contact > account > campaign
 */
export const campaignTemplates = pgTable("campaign_templates", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  campaignId: varchar("campaign_id").references(() => campaigns.id, { onDelete: 'cascade' }).notNull(),
  channelType: channelTypeEnum("channel_type").notNull(),

  // Template scope (campaign, account, or contact level)
  scope: templateScopeEnum("scope").notNull(),

  // Scope-specific references (nullable based on scope)
  accountId: varchar("account_id").references(() => accounts.id, { onDelete: 'cascade' }),
  contactId: varchar("contact_id").references(() => contacts.id, { onDelete: 'cascade' }),

  // Template content
  name: varchar("name", { length: 255 }).notNull(),
  templateType: varchar("template_type", { length: 50 }).notNull(), // opening, pitch, subject, etc.
  content: text("content").notNull(),

  // Variables available in this template
  variables: jsonb("variables"),

  // Priority for resolution (higher = preferred)
  priority: integer("priority").default(0),

  isActive: boolean("is_active").default(true),
  createdBy: varchar("created_by").references(() => users.id, { onDelete: 'set null' }),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (table) => ({
  campaignIdIdx: index("campaign_templates_campaign_id_idx").on(table.campaignId),
  channelTypeIdx: index("campaign_templates_channel_type_idx").on(table.channelType),
  scopeIdx: index("campaign_templates_scope_idx").on(table.scope),
  accountIdIdx: index("campaign_templates_account_id_idx").on(table.accountId),
  contactIdIdx: index("campaign_templates_contact_id_idx").on(table.contactId),
  templateTypeIdx: index("campaign_templates_template_type_idx").on(table.templateType),
  // Compound index for efficient template resolution
  resolutionIdx: index("campaign_templates_resolution_idx")
    .on(table.campaignId, table.channelType, table.templateType, table.scope),
}));

export const insertCampaignTemplateSchema = createInsertSchema(campaignTemplates).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type CampaignTemplate = typeof campaignTemplates.$inferSelect;
export type InsertCampaignTemplate = z.infer<typeof insertCampaignTemplateSchema>;

/**
 * Campaign Execution Prompts
 * Cached final execution-ready prompts for agents.
 * These are assembled from shared context + channel flow + resolved templates + compliance.
 */
export const campaignExecutionPrompts = pgTable("campaign_execution_prompts", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  campaignId: varchar("campaign_id").references(() => campaigns.id, { onDelete: 'cascade' }).notNull(),
  channelType: channelTypeEnum("channel_type").notNull(),

  // Context references for prompt generation (nullable for campaign-level prompts)
  accountId: varchar("account_id").references(() => accounts.id, { onDelete: 'cascade' }),
  contactId: varchar("contact_id").references(() => contacts.id, { onDelete: 'cascade' }),

  // Generated prompt components
  basePrompt: text("base_prompt").notNull(),
  channelAdditions: text("channel_additions"),
  templateInsertions: jsonb("template_insertions"), // Resolved templates by type
  complianceAdditions: text("compliance_additions"),

  // Final assembled prompt
  finalPrompt: text("final_prompt").notNull(),
  promptHash: varchar("prompt_hash", { length: 64 }).notNull(), // SHA-256 hash for change detection

  // Version tracking
  version: integer("version").default(1),
  contextVersion: integer("context_version"), // Links to campaign shared context version

  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (table) => ({
  // Unique constraint for prompt lookup
  promptLookupUnique: uniqueIndex("campaign_execution_prompts_lookup_unique")
    .on(table.campaignId, table.channelType, table.accountId, table.contactId),
  campaignIdIdx: index("campaign_execution_prompts_campaign_id_idx").on(table.campaignId),
  channelTypeIdx: index("campaign_execution_prompts_channel_type_idx").on(table.channelType),
  promptHashIdx: index("campaign_execution_prompts_hash_idx").on(table.promptHash),
}));

export const insertCampaignExecutionPromptSchema = createInsertSchema(campaignExecutionPrompts).omit({
  id: true,
  createdAt: true,
});
export type CampaignExecutionPrompt = typeof campaignExecutionPrompts.$inferSelect;
export type InsertCampaignExecutionPrompt = z.infer<typeof insertCampaignExecutionPromptSchema>;

// ==================== PREVIEW STUDIO ENUMS ====================
/**
 * Preview Session Type Enum
 * - context: Viewing assembled context (intelligence, briefs)
 * - email: Previewing generated email content
 * - call_plan: Previewing call brief and participant plan
 * - simulation: Live voice simulation session
 */
export const previewSessionTypeEnum = pgEnum('preview_session_type', [
  'context',
  'email',
  'call_plan',
  'simulation'
]);

/**
 * Preview Session Status Enum
 */
export const previewSessionStatusEnum = pgEnum('preview_session_status', [
  'active',
  'completed',
  'error'
]);

/**
 * Preview Transcript Role Enum
 */
export const previewTranscriptRoleEnum = pgEnum('preview_transcript_role', [
  'user',
  'assistant',
  'system'
]);

/**
 * Preview Content Type Enum
 */
export const previewContentTypeEnum = pgEnum('preview_content_type', [
  'email',
  'call_plan',
  'prompt',
  'call_brief',
  'participant_plan'
]);

/**
 * Preview Studio Sessions
 * Stores simulation and preview sessions for both email and voice channels.
 */
export const previewStudioSessions = pgTable("preview_studio_sessions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  // Legacy columns we must preserve (populated in production)
  workspaceId: varchar("workspace_id"),
  campaignId: varchar("campaign_id").references(() => campaigns.id, { onDelete: 'cascade' }).notNull(),
  accountId: varchar("account_id").references(() => accounts.id, { onDelete: 'set null' }),
  contactId: varchar("contact_id").references(() => contacts.id, { onDelete: 'set null' }),
  userId: varchar("user_id").references(() => users.id, { onDelete: 'set null' }),
  virtualAgentId: varchar("virtual_agent_id").references(() => virtualAgents.id, { onDelete: 'set null' }),
  sessionType: previewSessionTypeEnum("session_type").notNull().default('simulation'),
  status: previewSessionStatusEnum("status").default('active'),
  metadata: jsonb("metadata"),
  endedAt: timestamp("ended_at"),

  // New unified columns
  channelType: channelTypeEnum("channel_type").notNull().default('voice'),
  mode: varchar("mode", { length: 20 }).notNull().default('full'), // full, step_by_step, preview_only

  // Session state
  currentStepId: varchar("current_step_id", { length: 100 }),
  currentStepIndex: integer("current_step_index").default(0),
  isComplete: boolean("is_complete").default(false),

  // Transcript and checkpoints
  transcript: jsonb("transcript").default(sql`'[]'::jsonb`), // Array of SimulationMessage
  checkpoints: jsonb("checkpoints").default(sql`'[]'::jsonb`), // Array of SimulationCheckpoint

  // Resolved templates and prompt used
  resolvedTemplates: jsonb("resolved_templates"),
  executionPrompt: text("execution_prompt"),

  // User who created the session
  createdBy: varchar("created_by").references(() => users.id, { onDelete: 'set null' }),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (table) => ({
  campaignIdIdx: index("preview_studio_sessions_campaign_id_idx").on(table.campaignId),
  channelTypeIdx: index("preview_studio_sessions_channel_type_idx").on(table.channelType),
  createdByIdx: index("preview_studio_sessions_created_by_idx").on(table.createdBy),
  createdAtIdx: index("preview_studio_sessions_created_at_idx").on(table.createdAt),
  sessionTypeIdx: index("preview_studio_sessions_session_type_idx").on(table.sessionType),
  statusIdx: index("preview_studio_sessions_status_idx").on(table.status),
}));

export const insertPreviewStudioSessionSchema = createInsertSchema(previewStudioSessions).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type PreviewStudioSession = typeof previewStudioSessions.$inferSelect;
export type InsertPreviewStudioSession = z.infer<typeof insertPreviewStudioSessionSchema>;

// Global Agent Defaults - centralized default configuration for all virtual agents
export const agentDefaults = pgTable("agent_defaults", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  defaultFirstMessage: text("default_first_message").notNull(),
  defaultSystemPrompt: text("default_system_prompt").notNull(),
  defaultTrainingGuidelines: jsonb("default_training_guidelines").notNull().$type<string[]>(),
  defaultVoiceProvider: text("default_voice_provider").notNull().default('google'),
  defaultVoice: text("default_voice").notNull().default('Fenrir'),
  updatedBy: varchar("updated_by").references(() => users.id, { onDelete: 'set null' }),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export type AgentDefaults = typeof agentDefaults.$inferSelect;

// ==================== UNIFIED KNOWLEDGE HUB ====================
// SINGLE SOURCE OF TRUTH for all AI agent knowledge
// All agents—voice, email, compliance, or otherwise—MUST consume
// knowledge from this centralized hub only.

/**
 * Knowledge Section Category Enum
 * Defines the categories of knowledge in the unified hub
 */
export const knowledgeCategoryEnum = pgEnum('knowledge_category', [
  'compliance',
  'gatekeeper_handling',
  'voicemail_detection',
  'call_dispositioning',
  'call_quality',
  'conversation_flow',
  'dos_and_donts',
  'objection_handling',
  'tone_and_pacing',
  'identity_verification',
  'call_control',
  'learning_rules'
]);

/**
 * Unified Knowledge Hub - Main table storing the current and historical knowledge
 * Each row represents a version of the complete knowledge base
 */
export const unifiedKnowledgeHub = pgTable("unified_knowledge_hub", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  version: integer("version").notNull().default(1),
  
  // Complete knowledge stored as structured JSON
  // Array of KnowledgeSection objects with id, category, title, content, priority, isActive, tags
  sections: jsonb("sections").notNull().$type<{
    id: string;
    category: string;
    title: string;
    content: string;
    priority: number;
    isActive: boolean;
    tags: string[];
  }[]>(),
  
  // Change tracking
  changeDescription: text("change_description"),
  updatedBy: varchar("updated_by").references(() => users.id, { onDelete: 'set null' }),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (table) => ({
  versionIdx: uniqueIndex("unified_knowledge_hub_version_idx").on(table.version),
  updatedAtIdx: index("unified_knowledge_hub_updated_at_idx").on(table.updatedAt),
}));

export const insertUnifiedKnowledgeHubSchema = createInsertSchema(unifiedKnowledgeHub);
export type UnifiedKnowledgeHub = typeof unifiedKnowledgeHub.$inferSelect;

/**
 * Unified Knowledge Versions - Stores full snapshots for diff comparison
 */
export const unifiedKnowledgeVersions = pgTable("unified_knowledge_versions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  knowledgeId: varchar("knowledge_id").references(() => unifiedKnowledgeHub.id, { onDelete: 'cascade' }).notNull(),
  version: integer("version").notNull(),
  
  // Full section snapshots for diff comparison
  sections: jsonb("sections").notNull(),
  previousSections: jsonb("previous_sections"), // Null for first version
  
  // Metadata
  changeDescription: text("change_description"),
  updatedBy: varchar("updated_by").references(() => users.id, { onDelete: 'set null' }),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (table) => ({
  knowledgeIdIdx: index("unified_knowledge_versions_knowledge_id_idx").on(table.knowledgeId),
  versionIdx: index("unified_knowledge_versions_version_idx").on(table.version),
}));

export const insertUnifiedKnowledgeVersionSchema = createInsertSchema(unifiedKnowledgeVersions);
export type UnifiedKnowledgeVersion = typeof unifiedKnowledgeVersions.$inferSelect;

/**
 * Agent Simulation Records - Stores simulation/preview results
 * Used for testing and evaluating agent behavior before deployment
 */
export const agentSimulations = pgTable("agent_simulations", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  
  // Context for simulation
  campaignId: varchar("campaign_id").references(() => campaigns.id, { onDelete: 'set null' }),
  accountId: varchar("account_id").references(() => accounts.id, { onDelete: 'set null' }),
  contactId: varchar("contact_id").references(() => contacts.id, { onDelete: 'set null' }),
  virtualAgentId: varchar("virtual_agent_id").references(() => virtualAgents.id, { onDelete: 'set null' }),
  
  // Simulation type and mode
  simulationType: text("simulation_type").notNull(), // 'voice', 'email', 'text'
  simulationMode: text("simulation_mode").notNull(), // 'preview', 'test_call', 'dry_run'
  
  // Input/Output
  inputScenario: jsonb("input_scenario"), // User-defined test scenario
  generatedPrompt: text("generated_prompt"), // The exact runtime prompt used
  knowledgeVersion: integer("knowledge_version"), // Which knowledge version was used
  
  // Results
  outputResponse: text("output_response"), // AI's response
  evaluationScore: real("evaluation_score"), // 0-100 quality score
  evaluationNotes: text("evaluation_notes"), // Human evaluator notes
  
  // Metadata
  runBy: varchar("run_by").references(() => users.id, { onDelete: 'set null' }),
  runAt: timestamp("run_at").notNull().defaultNow(),
  durationMs: integer("duration_ms"),
  
  // Status
  status: text("status").notNull().default('pending'), // pending, running, completed, failed
  errorMessage: text("error_message"),
}, (table) => ({
  campaignIdx: index("agent_simulations_campaign_idx").on(table.campaignId),
  agentIdx: index("agent_simulations_agent_idx").on(table.virtualAgentId),
  statusIdx: index("agent_simulations_status_idx").on(table.status),
  runAtIdx: index("agent_simulations_run_at_idx").on(table.runAt),
}));

export const insertAgentSimulationSchema = createInsertSchema(agentSimulations);
export type AgentSimulation = typeof agentSimulations.$inferSelect;

// Campaign Agent Assignments table (enforces one-campaign-per-agent rule)
// Virtual Agents - AI agent personas that can be assigned to campaigns like human agents
export const virtualAgents = pgTable("virtual_agents", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull(),
  description: text("description"),
  provider: text("provider").notNull().default('gemini_live'), // gemini_live, openai_realtime, elevenlabs, etc.
  externalAgentId: text("external_agent_id"), // Provider-specific agent ID
  voice: aiVoiceEnum("voice").default('Fenrir'), // Default to Gemini voice (Google-first platform)
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
  // Foundation Agent fields (reusable across campaigns)
  isFoundationAgent: boolean("is_foundation_agent").notNull().default(false), // Marks agent as reusable foundation
  foundationCapabilities: jsonb("foundation_capabilities"), // ["gatekeeper_handling", "right_party_verification", ...]
  // Assigned phone number - dedicated outbound caller ID for this agent
  assignedPhoneNumberId: varchar("assigned_phone_number_id"), // FK to telnyx_numbers.id
  createdBy: varchar("created_by").references(() => users.id, { onDelete: 'set null' }),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (table) => ({
  nameIdx: index("virtual_agents_name_idx").on(table.name),
  providerIdx: index("virtual_agents_provider_idx").on(table.provider),
  activeIdx: index("virtual_agents_active_idx").on(table.isActive),
  demandTypeIdx: index("virtual_agents_demand_type_idx").on(table.demandAgentType),
  skillIdIdx: index("virtual_agents_skill_id_idx").on(table.skillId),
  assignedPhoneIdx: index("virtual_agents_assigned_phone_idx").on(table.assignedPhoneNumberId),
}));

// Prompt Perspectives Enum - Different approaches to the same context
export const promptPerspectiveEnum = pgEnum('prompt_perspective', [
  'consultative',      // Ask questions, diagnose first
  'direct_value',      // Lead with ROI/benefits
  'pain_point',        // Address specific pain points
  'social_proof',      // Lead with case studies/results
  'educational',       // Teach/inform first
  'urgent',            // Create sense of urgency
  'relationship',      // Focus on building relationship
]);

// Prompt Variants table - Store multiple prompt variations for testing
// Variants can be created at agent level (template) or campaign level (specific)
export const promptVariants = pgTable("prompt_variants", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  // Hierarchical scope: account > campaign > agent
  // At least one should be set; variants inherit from parent level if not specified
  accountId: varchar("account_id").references(() => accounts.id, { onDelete: 'cascade' }),
  campaignId: varchar("campaign_id").references(() => campaigns.id, { onDelete: 'cascade' }),
  virtualAgentId: varchar("virtual_agent_id").references(() => virtualAgents.id, { onDelete: 'cascade' }),
  variantName: text("variant_name").notNull(), // e.g., "aggressive", "consultative", "educational"
  perspective: promptPerspectiveEnum("perspective").notNull(),
  systemPrompt: text("system_prompt").notNull(),
  firstMessage: text("first_message"),
  context: jsonb("context"), // Store generation context: {goal, tone, targetAudience, ...}
  isActive: boolean("is_active").notNull().default(true),
  isDefault: boolean("is_default").notNull().default(false),
  // Scope level: 'account', 'campaign', 'agent'
  variantScope: text("variant_scope").notNull().default('campaign'),
  // Performance tracking
  testResults: jsonb("test_results"), // {successRate, engagementScore, callDuration, sampleSize, notes}
  // Provenance
  createdBy: varchar("created_by").references(() => users.id, { onDelete: 'set null' }),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (table) => ({
  accountIdx: index("prompt_variants_account_idx").on(table.accountId),
  campaignIdx: index("prompt_variants_campaign_idx").on(table.campaignId),
  agentIdx: index("prompt_variants_agent_idx").on(table.virtualAgentId),
  perspectiveIdx: index("prompt_variants_perspective_idx").on(table.perspective),
  activeIdx: index("prompt_variants_active_idx").on(table.isActive),
  defaultIdx: index("prompt_variants_default_idx").on(table.isDefault),
  scopeIdx: index("prompt_variants_scope_idx").on(table.variantScope),
}));

// Prompt Variant Tests - Track A/B test performance for each variant
export const promptVariantTests = pgTable("prompt_variant_tests", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  variantId: varchar("variant_id").references(() => promptVariants.id, { onDelete: 'cascade' }).notNull(),
  campaignId: varchar("campaign_id").references(() => campaigns.id, { onDelete: 'cascade' }).notNull(),
  callAttemptId: varchar("call_attempt_id").references(() => callAttempts.id, { onDelete: 'set null' }),
  // Call metrics
  disposition: callDispositionEnum("disposition"),
  duration: integer("duration"), // seconds
  engagementScore: real("engagement_score"), // 0-1 score
  successful: boolean("successful"),
  notes: text("notes"),
  // Metadata
  testedAt: timestamp("tested_at").notNull().defaultNow(),
}, (table) => ({
  variantIdx: index("prompt_variant_tests_variant_idx").on(table.variantId),
  campaignIdx: index("prompt_variant_tests_campaign_idx").on(table.campaignId),
  callAttemptIdx: index("prompt_variant_tests_call_attempt_idx").on(table.callAttemptId),
}));

// Variant Selection History - Track which variant was used for each call
export const variantSelectionHistory = pgTable("variant_selection_history", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  callAttemptId: varchar("call_attempt_id").references(() => callAttempts.id, { onDelete: 'cascade' }).notNull(),
  variantId: varchar("variant_id").references(() => promptVariants.id, { onDelete: 'set null' }),
  perspective: promptPerspectiveEnum("perspective"),
  selectionMethod: text("selection_method"), // 'manual', 'ab_test', 'dynamic', 'default'
  selectedAt: timestamp("selected_at").notNull().defaultNow(),
}, (table) => ({
  callAttemptIdx: index("variant_selection_history_call_attempt_idx").on(table.callAttemptId),
  variantIdx: index("variant_selection_history_variant_idx").on(table.variantId),
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
  // Link to call recording (if lead came from dialer campaign)
  // NOTE: References dialer_call_attempts (new dialer system), not call_attempts (legacy)
  callAttemptId: varchar("call_attempt_id").references(() => dialerCallAttempts.id, { onDelete: 'set null' }),
  recordingUrl: text("recording_url"), // Legacy: Original Telnyx URL (may expire after 10 min)
  recordingS3Key: text("recording_s3_key"), // Permanent S3 storage key for recordings
  telnyxRecordingId: text("telnyx_recording_id"), // Stable Telnyx recording ID for on-demand URL generation
  recordingProvider: text("recording_provider").default('telnyx'), // Recording provider (telnyx)
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
  
  // Publishing (QA approved → PM Review → Published for client portal)
  publishedAt: timestamp("published_at"), // When lead was published
  publishedBy: varchar("published_by").references(() => users.id), // User who published the lead
  
  // Project Management Review (PM approval required after QA approval)
  pmApprovedAt: timestamp("pm_approved_at"), // When PM approved the lead
  pmApprovedBy: varchar("pm_approved_by").references(() => users.id), // PM who approved
  pmRejectedAt: timestamp("pm_rejected_at"), // When PM rejected the lead
  pmRejectedBy: varchar("pm_rejected_by").references(() => users.id), // PM who rejected
  pmRejectionReason: text("pm_rejection_reason"), // Reason for PM rejection
  
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

// Lead Comments - Client portal comments and notes on leads
export const leadComments = pgTable("lead_comments", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  leadId: varchar("lead_id").notNull().references(() => leads.id, { onDelete: 'cascade' }),
  clientAccountId: varchar("client_account_id").notNull().references(() => clientAccounts.id, { onDelete: 'cascade' }),
  clientUserId: varchar("client_user_id").references(() => clientUsers.id, { onDelete: 'set null' }),
  commentText: text("comment_text").notNull(),
  isInternal: boolean("is_internal").default(false), // Internal notes vs client-facing
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
  deletedAt: timestamp("deleted_at"), // Soft delete support
}, (table) => ({
  leadIdx: index("lead_comments_lead_idx").on(table.leadId),
  clientAccountIdx: index("lead_comments_client_account_idx").on(table.clientAccountId),
  createdAtIdx: index("lead_comments_created_at_idx").on(table.createdAt),
  deletedAtIdx: index("lead_comments_deleted_at_idx").on(table.deletedAt),
}));

export const leadCommentsRelations = relations(leadComments, ({ one }) => ({
  lead: one(leads, { fields: [leadComments.leadId], references: [leads.id] }),
  clientAccount: one(clientAccounts, { fields: [leadComments.clientAccountId], references: [clientAccounts.id] }),
  clientUser: one(clientUsers, { fields: [leadComments.clientUserId], references: [clientUsers.id] }),
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
  telnyxRecordingId: text("telnyx_recording_id"), // Stable Telnyx recording ID for on-demand URL generation
  recordingProvider: text("recording_provider").default('telnyx'), // Recording provider (telnyx)
  fromNumber: text("from_number"),
  toNumberE164: text("to_number_e164").notNull(),
  startedAt: timestamp("started_at").notNull().defaultNow(),
  endedAt: timestamp("ended_at"),
  durationSec: integer("duration_sec"),
  recordingUrl: text("recording_url"), // Legacy: may contain expired Telnyx URL, kept for backward compat
  status: callSessionStatusEnum("status").notNull().default('connecting'),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  
  // Recording storage fields
  recordingS3Key: text("recording_s3_key"), // S3/GCS key for permanent storage
  recordingDurationSec: integer("recording_duration_sec"), // Duration of recording
  recordingStatus: recordingStatusEnum("recording_status").default('pending'), // Recording lifecycle
  recordingFormat: text("recording_format").default('mp3'), // Audio format (mp3/wav)
  recordingFileSizeBytes: integer("recording_file_size_bytes"), // File size in bytes
  
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
  recordingStatusIdx: index("call_sessions_recording_status_idx").on(table.recordingStatus),
}));

// Call Quality Records - Comprehensive logging of call quality analysis, conversation intelligence, issues, and recommendations
export const callQualityRecords = pgTable("call_quality_records", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  callSessionId: varchar("call_session_id").references(() => callSessions.id, { onDelete: 'cascade' }).notNull(),
  dialerCallAttemptId: varchar("dialer_call_attempt_id").references(() => dialerCallAttempts.id, { onDelete: 'cascade' }),
  campaignId: varchar("campaign_id").references(() => campaigns.id, { onDelete: 'set null' }),
  contactId: varchar("contact_id").references(() => contacts.id, { onDelete: 'set null' }),
  
  // Quality metrics
  overallQualityScore: integer("overall_quality_score"), // 0-100
  engagementScore: integer("engagement_score"), // 0-100
  clarityScore: integer("clarity_score"), // 0-100
  empathyScore: integer("empathy_score"), // 0-100
  objectionHandlingScore: integer("objection_handling_score"), // 0-100
  qualificationScore: integer("qualification_score"), // 0-100
  closingScore: integer("closing_score"), // 0-100
  
  // Conversation intelligence
  sentiment: text("sentiment"), // positive | neutral | negative
  engagementLevel: text("engagement_level"), // high | medium | low
  identityConfirmed: boolean("identity_confirmed"),
  qualificationMet: boolean("qualification_met"),
  
  // Analysis results (stored as JSON for flexibility)
  issues: jsonb("issues"), // Array of {type, severity, description, evidence, recommendation}
  recommendations: jsonb("recommendations"), // Array of {category, currentBehavior, suggestedChange, expectedImpact}
  breakdowns: jsonb("breakdowns"), // Array of {type, description, moment, recommendation}
  promptUpdates: jsonb("prompt_updates"), // Array of {category, change, rationale, priority}
  performanceGaps: jsonb("performance_gaps"), // Array of gap descriptions
  nextBestActions: jsonb("next_best_actions"), // Array of recommended actions
  
  // Campaign alignment
  campaignAlignmentScore: integer("campaign_alignment_score"),
  contextUsageScore: integer("context_usage_score"),
  talkingPointsCoverageScore: integer("talking_points_coverage_score"),
  missedTalkingPoints: jsonb("missed_talking_points"), // Array of strings
  
  // Flow compliance
  flowComplianceScore: integer("flow_compliance_score"),
  missedSteps: jsonb("missed_steps"), // Array of strings
  flowDeviations: jsonb("flow_deviations"), // Array of strings
  
  // Disposition accuracy
  assignedDisposition: text("assigned_disposition"),
  expectedDisposition: text("expected_disposition"),
  dispositionAccurate: boolean("disposition_accurate"),
  dispositionNotes: jsonb("disposition_notes"), // Array of notes
  
  // Transcript info
  transcriptLength: integer("transcript_length"),
  transcriptTruncated: boolean("transcript_truncated"),
  fullTranscript: text("full_transcript"),
  
  // Analysis metadata
  analysisModel: text("analysis_model"), // Model used for analysis
  analysisStage: text("analysis_stage"), // realtime | post_call
  interactionType: text("interaction_type"), // live_call | test_call | simulation
  analyzedAt: timestamp("analyzed_at"),
  
  // Timestamps
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (table) => ({
  callSessionIdx: index("call_quality_records_call_session_idx").on(table.callSessionId),
  dialerAttemptIdx: index("call_quality_records_dialer_attempt_idx").on(table.dialerCallAttemptId),
  campaignIdx: index("call_quality_records_campaign_idx").on(table.campaignId),
  contactIdx: index("call_quality_records_contact_idx").on(table.contactId),
  scoreIdx: index("call_quality_records_score_idx").on(table.overallQualityScore),
  createdAtIdx: index("call_quality_records_created_at_idx").on(table.createdAt),
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

// ==================== PHASE: SMTP TRANSACTIONAL EMAIL SYSTEM ====================

// SMTP Providers - Connect Google Workspace or Microsoft 365 accounts for transactional emails
export const smtpProviders = pgTable("smtp_providers", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull(), // e.g., "Marketing Team Gmail", "Support Outlook"
  providerType: smtpProviderTypeEnum("provider_type").notNull(),
  authType: smtpAuthTypeEnum("auth_type").notNull(),

  // OAuth2 Credentials (encrypted at rest)
  clientId: text("client_id"),
  clientSecretEncrypted: text("client_secret_encrypted"),
  refreshTokenEncrypted: text("refresh_token_encrypted"),
  accessTokenEncrypted: text("access_token_encrypted"),
  tokenExpiresAt: timestamp("token_expires_at"),
  tokenScopes: text("token_scopes").array(), // OAuth scopes granted

  // SMTP Configuration (for custom providers)
  smtpHost: text("smtp_host"),
  smtpPort: integer("smtp_port"),
  smtpSecure: boolean("smtp_secure").default(true),
  smtpUsername: text("smtp_username"),
  smtpPasswordEncrypted: text("smtp_password_encrypted"),

  // Email Account Details
  emailAddress: text("email_address").notNull(),
  displayName: text("display_name"),
  replyToAddress: text("reply_to_address"),

  // Rate Limiting
  dailySendLimit: integer("daily_send_limit").default(500),
  hourlySendLimit: integer("hourly_send_limit").default(100),
  sentToday: integer("sent_today").default(0),
  sentThisHour: integer("sent_this_hour").default(0),
  sentTodayResetAt: timestamp("sent_today_reset_at"),
  sentHourResetAt: timestamp("sent_hour_reset_at"),

  // Status & Verification
  isActive: boolean("is_active").default(true),
  isDefault: boolean("is_default").default(false),
  verificationStatus: smtpVerificationStatusEnum("verification_status").default('pending'),
  lastVerifiedAt: timestamp("last_verified_at"),
  lastVerificationError: text("last_verification_error"),
  lastUsedAt: timestamp("last_used_at"),

  // Metadata
  createdBy: varchar("created_by").references(() => users.id),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (table) => ({
  emailIdx: uniqueIndex("smtp_providers_email_unique_idx").on(table.emailAddress),
  providerTypeIdx: index("smtp_providers_type_idx").on(table.providerType),
  activeIdx: index("smtp_providers_active_idx").on(table.isActive),
  defaultIdx: index("smtp_providers_default_idx").on(table.isDefault),
}));

// Transactional Email Templates - Event-triggered email templates
export const transactionalEmailTemplates = pgTable("transactional_email_templates", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  eventType: transactionalEventTypeEnum("event_type").notNull(),
  name: text("name").notNull(),
  description: text("description"),

  // Email Content
  subject: text("subject").notNull(),
  htmlContent: text("html_content").notNull(),
  textContent: text("text_content"), // Plain text fallback

  // Template Variables
  variables: jsonb("variables").$type<{
    name: string;
    description: string;
    required: boolean;
    defaultValue?: string;
  }[]>().default(sql`'[]'::jsonb`),

  // SMTP Provider Assignment
  smtpProviderId: varchar("smtp_provider_id").references(() => smtpProviders.id, { onDelete: 'set null' }),

  // Status
  isActive: boolean("is_active").default(true),
  isDefault: boolean("is_default").default(false), // Default template for this event type

  // Version Control
  version: integer("version").default(1),

  // Metadata
  createdBy: varchar("created_by").references(() => users.id),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (table) => ({
  eventTypeIdx: index("transactional_templates_event_type_idx").on(table.eventType),
  activeIdx: index("transactional_templates_active_idx").on(table.isActive),
  defaultIdx: index("transactional_templates_default_idx").on(table.isDefault),
  smtpProviderIdx: index("transactional_templates_smtp_provider_idx").on(table.smtpProviderId),
}));

// Transactional Email Logs - Audit trail for all transactional emails sent
export const transactionalEmailLogs = pgTable("transactional_email_logs", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  templateId: varchar("template_id").references(() => transactionalEmailTemplates.id, { onDelete: 'set null' }),
  smtpProviderId: varchar("smtp_provider_id").references(() => smtpProviders.id, { onDelete: 'set null' }),

  // Event Details
  eventType: transactionalEventTypeEnum("event_type").notNull(),
  triggerSource: text("trigger_source"), // e.g., "user_signup", "api_call", "scheduled_job"

  // Recipient
  recipientEmail: text("recipient_email").notNull(),
  recipientUserId: varchar("recipient_user_id").references(() => users.id, { onDelete: 'set null' }),
  recipientName: text("recipient_name"),

  // Email Content (snapshot at send time)
  subject: text("subject").notNull(),
  htmlContentSnapshot: text("html_content_snapshot"), // Optional: store rendered HTML

  // Variables Used
  variablesUsed: jsonb("variables_used").$type<Record<string, string>>(),

  // Status & Delivery
  status: text("status").notNull().default('pending'), // pending, queued, sending, sent, delivered, failed, bounced
  messageId: text("message_id"), // Provider's message ID

  // Error Tracking
  errorMessage: text("error_message"),
  errorCode: text("error_code"),
  retryCount: integer("retry_count").default(0),
  maxRetries: integer("max_retries").default(3),

  // Timing
  queuedAt: timestamp("queued_at"),
  sentAt: timestamp("sent_at"),
  deliveredAt: timestamp("delivered_at"),
  failedAt: timestamp("failed_at"),

  // Metadata
  metadata: jsonb("metadata").$type<{
    ipAddress?: string;
    userAgent?: string;
    requestId?: string;
    [key: string]: unknown;
  }>(),

  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (table) => ({
  templateIdx: index("transactional_logs_template_idx").on(table.templateId),
  smtpProviderIdx: index("transactional_logs_smtp_provider_idx").on(table.smtpProviderId),
  eventTypeIdx: index("transactional_logs_event_type_idx").on(table.eventType),
  recipientEmailIdx: index("transactional_logs_recipient_email_idx").on(table.recipientEmail),
  recipientUserIdx: index("transactional_logs_recipient_user_idx").on(table.recipientUserId),
  statusIdx: index("transactional_logs_status_idx").on(table.status),
  createdAtIdx: index("transactional_logs_created_at_idx").on(table.createdAt),
}));

// ==================== END SMTP TRANSACTIONAL EMAIL SYSTEM ====================

// ==================== PHASE 2: DOMAIN MANAGEMENT & DELIVERABILITY ====================

// Enums for Domain Management
export const domainPurposeEnum = pgEnum('domain_purpose', ['marketing', 'transactional', 'both']);
export const warmupPhaseEnum = pgEnum('warmup_phase', ['not_started', 'phase_1', 'phase_2', 'phase_3', 'completed', 'paused']);
export const blacklistStatusEnum = pgEnum('blacklist_status', ['clean', 'listed', 'pending_check']);

// Extended Domain Configuration - Additional settings for domain_auth
export const domainConfiguration = pgTable("domain_configuration", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  domainAuthId: integer("domain_auth_id").notNull().references(() => domainAuth.id, { onDelete: 'cascade' }).unique(),

  // Secure Verification
  secureCode: text("secure_code").notNull().unique(), // Unique verification code
  subdomain: text("subdomain"), // e.g., "mail" for mail.example.com
  parentDomain: text("parent_domain"), // e.g., "example.com"
  domainPurpose: domainPurposeEnum("domain_purpose").default('both').notNull(),

  // Generated DNS Records (to show users what to configure)
  generatedSpfRecord: text("generated_spf_record"),
  generatedDkimSelector: text("generated_dkim_selector"),
  generatedDkimRecord: text("generated_dkim_record"),
  generatedDmarcRecord: text("generated_dmarc_record"),
  generatedTrackingCname: text("generated_tracking_cname"),

  // Validation Timestamps
  spfVerifiedAt: timestamp("spf_verified_at"),
  dkimVerifiedAt: timestamp("dkim_verified_at"),
  dmarcVerifiedAt: timestamp("dmarc_verified_at"),
  trackingVerifiedAt: timestamp("tracking_verified_at"),

  // Permissions
  allowMarketing: boolean("allow_marketing").default(true).notNull(),
  allowTransactional: boolean("allow_transactional").default(true).notNull(),
  requiresManualApproval: boolean("requires_manual_approval").default(false).notNull(),

  // Mailgun Integration
  mailgunDomainId: text("mailgun_domain_id"),
  mailgunApiKey: text("mailgun_api_key"), // Encrypted
  mailgunRegion: text("mailgun_region").default('US'), // 'US' or 'EU'

  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (table) => ({
  domainAuthIdx: index("domain_config_domain_auth_idx").on(table.domainAuthId),
  secureCodeIdx: index("domain_config_secure_code_idx").on(table.secureCode),
}));

// Domain Health Scores - Tracks deliverability health over time
export const domainHealthScores = pgTable("domain_health_scores", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  domainAuthId: integer("domain_auth_id").notNull().references(() => domainAuth.id, { onDelete: 'cascade' }),

  // Overall Score (0-100)
  overallScore: integer("overall_score").notNull().default(0),

  // Component Scores (0-100 each)
  authenticationScore: integer("authentication_score").default(0), // SPF, DKIM, DMARC compliance
  reputationScore: integer("reputation_score").default(0), // Sender reputation
  engagementScore: integer("engagement_score").default(0), // Open/click rates
  blacklistScore: integer("blacklist_score").default(100), // 100 = clean, decreases if listed

  // Engagement Metrics
  bounceRate: real("bounce_rate").default(0), // Percentage (0-100)
  complaintRate: real("complaint_rate").default(0), // Spam complaint rate
  unsubscribeRate: real("unsubscribe_rate").default(0),
  openRate: real("open_rate").default(0),
  clickRate: real("click_rate").default(0),

  // Volume Metrics
  totalSent7Days: integer("total_sent_7_days").default(0),
  totalSent30Days: integer("total_sent_30_days").default(0),
  totalBounced7Days: integer("total_bounced_7_days").default(0),
  totalComplaints7Days: integer("total_complaints_7_days").default(0),

  // Blacklist Status
  blacklistedOn: text("blacklisted_on").array(), // Array of RBL names where listed
  lastBlacklistCheck: timestamp("last_blacklist_check"),

  // Warmup Status
  warmupPhase: warmupPhaseEnum("warmup_phase").default('not_started').notNull(),
  warmupStartedAt: timestamp("warmup_started_at"),
  warmupCompletedAt: timestamp("warmup_completed_at"),
  dailySendTarget: integer("daily_send_target").default(50), // Current daily limit during warmup
  dailySendActual: integer("daily_send_actual").default(0), // Sent today

  // AI-Generated Recommendations
  recommendations: jsonb("recommendations").$type<{
    priority: 'critical' | 'high' | 'medium' | 'low';
    category: string;
    title: string;
    description: string;
    actionUrl?: string;
  }[]>(),

  // Scoring Metadata
  scoredAt: timestamp("scored_at").notNull().defaultNow(),
  scoreVersion: integer("score_version").default(1), // Algorithm version

  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (table) => ({
  domainAuthIdx: index("domain_health_domain_auth_idx").on(table.domainAuthId),
  overallScoreIdx: index("domain_health_overall_score_idx").on(table.overallScore),
  warmupPhaseIdx: index("domain_health_warmup_phase_idx").on(table.warmupPhase),
  scoredAtIdx: index("domain_health_scored_at_idx").on(table.scoredAt),
}));

// Blacklist Monitors - Tracks domain/IP blacklist status across multiple RBLs
export const blacklistMonitors = pgTable("blacklist_monitors", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  domainAuthId: integer("domain_auth_id").references(() => domainAuth.id, { onDelete: 'cascade' }),

  // What we're monitoring
  monitorType: text("monitor_type").notNull(), // 'domain' or 'ip'
  monitorValue: text("monitor_value").notNull(), // The domain or IP address

  // RBL Information
  rblName: text("rbl_name").notNull(), // e.g., 'spamhaus_sbl', 'barracuda', 'spamcop'
  rblDisplayName: text("rbl_display_name").notNull(), // Human-readable name
  rblCategory: text("rbl_category").notNull(), // 'spam', 'phishing', 'malware', 'policy'

  // Status
  status: blacklistStatusEnum("status").default('pending_check').notNull(),
  isListed: boolean("is_listed").default(false).notNull(),
  listedSince: timestamp("listed_since"),
  delistedAt: timestamp("delisted_at"),
  listingReason: text("listing_reason"), // Reason for listing if available

  // Checking Schedule
  lastCheckedAt: timestamp("last_checked_at"),
  nextCheckAt: timestamp("next_check_at"),
  checkFrequencyHours: integer("check_frequency_hours").default(24).notNull(),
  consecutiveCleanChecks: integer("consecutive_clean_checks").default(0), // For confidence scoring

  // Alerting
  alertsEnabled: boolean("alerts_enabled").default(true).notNull(),
  lastAlertSentAt: timestamp("last_alert_sent_at"),
  alertEmailOverride: text("alert_email_override"), // Send alerts to specific email

  // Delisting Efforts
  delistingRequested: boolean("delisting_requested").default(false),
  delistingRequestedAt: timestamp("delisting_requested_at"),
  delistingUrl: text("delisting_url"), // URL to request delisting

  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (table) => ({
  domainAuthIdx: index("blacklist_monitors_domain_auth_idx").on(table.domainAuthId),
  monitorValueIdx: index("blacklist_monitors_monitor_value_idx").on(table.monitorValue),
  rblNameIdx: index("blacklist_monitors_rbl_name_idx").on(table.rblName),
  statusIdx: index("blacklist_monitors_status_idx").on(table.status),
  isListedIdx: index("blacklist_monitors_is_listed_idx").on(table.isListed),
  nextCheckIdx: index("blacklist_monitors_next_check_idx").on(table.nextCheckAt),
}));

// Blacklist Check History - Audit trail of all blacklist checks
export const blacklistCheckHistory = pgTable("blacklist_check_history", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  monitorId: varchar("monitor_id").notNull().references(() => blacklistMonitors.id, { onDelete: 'cascade' }),

  // Check Result
  wasListed: boolean("was_listed").notNull(),
  listingReason: text("listing_reason"),
  responseTime: integer("response_time_ms"), // How long the check took
  rawResponse: text("raw_response"), // Raw API/DNS response for debugging

  // Metadata
  checkSource: text("check_source").default('scheduled'), // 'scheduled', 'manual', 'webhook'
  checkedAt: timestamp("checked_at").notNull().defaultNow(),
}, (table) => ({
  monitorIdx: index("blacklist_history_monitor_idx").on(table.monitorId),
  checkedAtIdx: index("blacklist_history_checked_at_idx").on(table.checkedAt),
  wasListedIdx: index("blacklist_history_was_listed_idx").on(table.wasListed),
}));

// Domain Warmup Schedule - Tracks warmup progress day by day
export const domainWarmupSchedule = pgTable("domain_warmup_schedule", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  domainAuthId: integer("domain_auth_id").notNull().references(() => domainAuth.id, { onDelete: 'cascade' }),

  // Schedule
  day: integer("day").notNull(), // Day 1, 2, 3... of warmup
  scheduledDate: timestamp("scheduled_date").notNull(),
  targetVolume: integer("target_volume").notNull(), // How many to send

  // Actual Results
  actualVolume: integer("actual_volume").default(0),
  delivered: integer("delivered").default(0),
  bounced: integer("bounced").default(0),
  complaints: integer("complaints").default(0),
  opens: integer("opens").default(0),

  // Status
  status: text("status").default('pending').notNull(), // 'pending', 'in_progress', 'completed', 'skipped'
  completedAt: timestamp("completed_at"),
  notes: text("notes"),

  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (table) => ({
  domainAuthIdx: index("warmup_schedule_domain_auth_idx").on(table.domainAuthId),
  scheduledDateIdx: index("warmup_schedule_date_idx").on(table.scheduledDate),
  statusIdx: index("warmup_schedule_status_idx").on(table.status),
  dayIdx: index("warmup_schedule_day_idx").on(table.day),
}));

// ==================== END PHASE 2: DOMAIN MANAGEMENT & DELIVERABILITY ====================

// ==================== PHASE 3: UNIFIED EMAIL AGENT ARCHITECTURE ====================

// Enums for Unified Email Agent
export const emailProviderEnum = pgEnum('email_provider', ['gemini', 'gpt4o', 'deepseek', 'openai', 'anthropic']);
export const emailGenerationStatusEnum = pgEnum('email_generation_status', ['pending', 'processing', 'completed', 'failed', 'cached']);

// Email Generation Logs - Comprehensive tracking of all AI email generation
export const emailGenerationLogs = pgTable("email_generation_logs", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),

  // Request Context
  requestId: varchar("request_id").notNull(), // Unique request identifier for tracing
  campaignId: varchar("campaign_id").references(() => campaigns.id, { onDelete: 'set null' }),
  accountId: varchar("account_id").references(() => accounts.id, { onDelete: 'set null' }),
  contactId: varchar("contact_id").references(() => contacts.id, { onDelete: 'set null' }),

  // Generation Context
  generationType: text("generation_type").notNull(), // 'campaign', 'follow_up', 'transactional', 'personalized', 'batch'
  requestSource: text("request_source").notNull(), // 'campaign_send', 'client_portal', 'agentic_hub', 'api', 'preview'

  // AI Provider Details
  provider: emailProviderEnum("provider").notNull(),
  model: text("model").notNull(), // e.g., 'gemini-2.0-flash', 'gpt-4o', 'deepseek-chat'
  fallbackUsed: boolean("fallback_used").default(false).notNull(),
  fallbackReason: text("fallback_reason"), // Why fallback was triggered

  // Prompt Information
  promptVersion: text("prompt_version").default('1.0'), // Foundational prompt version
  layersApplied: text("layers_applied").array(), // ['foundational', 'org_intelligence', 'campaign_context', 'personalization']
  systemPromptTokens: integer("system_prompt_tokens"),
  userPromptTokens: integer("user_prompt_tokens"),

  // Input Context (stored for debugging/replay)
  inputContext: jsonb("input_context").$type<{
    campaignType?: string;
    campaignName?: string;
    objective?: string;
    targetAudience?: string;
    valueProposition?: string;
    callToAction?: string;
    contactIndustry?: string;
    contactTitle?: string;
    contactCompany?: string;
    organizationContext?: string;
    additionalInstructions?: string;
  }>(),

  // Generated Output
  generatedSubject: text("generated_subject"),
  generatedPreheader: text("generated_preheader"),
  generatedHtmlContent: text("generated_html_content"),
  generatedTextContent: text("generated_text_content"),
  mergeFieldsUsed: text("merge_fields_used").array(),

  // Performance Metrics
  latencyMs: integer("latency_ms"), // Time to generate
  tokenUsage: jsonb("token_usage").$type<{
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
    cachedTokens?: number;
  }>(),
  estimatedCost: real("estimated_cost"), // Estimated cost in USD

  // Quality & Compliance
  complianceChecks: jsonb("compliance_checks").$type<{
    spamScore?: number;
    hasUnsubscribe: boolean;
    hasPhysicalAddress: boolean;
    hasPrivacyLink: boolean;
    characterCount: number;
    linkCount: number;
    imageCount: number;
    passedAllChecks: boolean;
    warnings?: string[];
  }>(),
  compliancePassed: boolean("compliance_passed").default(true),

  // Status
  status: emailGenerationStatusEnum("status").default('pending').notNull(),
  errorMessage: text("error_message"),
  errorCode: text("error_code"),

  // Caching
  cacheKey: text("cache_key"), // For deduplication/caching similar requests
  cachedFromId: varchar("cached_from_id"), // If this was served from cache, reference to original

  // Timestamps
  requestedAt: timestamp("requested_at").notNull().defaultNow(),
  completedAt: timestamp("completed_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (table) => ({
  requestIdIdx: index("email_gen_request_id_idx").on(table.requestId),
  campaignIdx: index("email_gen_campaign_idx").on(table.campaignId),
  accountIdx: index("email_gen_account_idx").on(table.accountId),
  contactIdx: index("email_gen_contact_idx").on(table.contactId),
  providerIdx: index("email_gen_provider_idx").on(table.provider),
  statusIdx: index("email_gen_status_idx").on(table.status),
  generationTypeIdx: index("email_gen_type_idx").on(table.generationType),
  requestSourceIdx: index("email_gen_source_idx").on(table.requestSource),
  requestedAtIdx: index("email_gen_requested_at_idx").on(table.requestedAt),
  cacheKeyIdx: index("email_gen_cache_key_idx").on(table.cacheKey),
}));

// Provider Configuration - Track provider health and routing preferences
export const emailProviderConfig = pgTable("email_provider_config", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),

  // Provider Identity
  provider: emailProviderEnum("provider").notNull().unique(),
  displayName: text("display_name").notNull(),

  // Configuration
  isEnabled: boolean("is_enabled").default(true).notNull(),
  isPrimary: boolean("is_primary").default(false).notNull(), // Primary provider
  priority: integer("priority").default(1).notNull(), // Lower = higher priority for fallback
  maxRetries: integer("max_retries").default(3),

  // Rate Limits
  requestsPerMinute: integer("requests_per_minute").default(60),
  tokensPerMinute: integer("tokens_per_minute").default(100000),
  currentRequestsThisMinute: integer("current_requests_this_minute").default(0),
  currentTokensThisMinute: integer("current_tokens_this_minute").default(0),
  rateLimitResetAt: timestamp("rate_limit_reset_at"),

  // Health Monitoring
  isHealthy: boolean("is_healthy").default(true).notNull(),
  lastHealthCheck: timestamp("last_health_check"),
  consecutiveFailures: integer("consecutive_failures").default(0),
  averageLatencyMs: integer("average_latency_ms"),
  errorRate: real("error_rate").default(0), // Percentage

  // Cost Tracking
  costPerInputToken: real("cost_per_input_token"), // USD
  costPerOutputToken: real("cost_per_output_token"), // USD
  monthlyBudget: real("monthly_budget"),
  monthlySpend: real("monthly_spend").default(0),
  budgetResetAt: timestamp("budget_reset_at"),

  // Model Configuration
  defaultModel: text("default_model").notNull(),
  availableModels: text("available_models").array(),
  defaultTemperature: real("default_temperature").default(0.7),
  defaultMaxTokens: integer("default_max_tokens").default(4000),

  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

// ==================== END PHASE 3: UNIFIED EMAIL AGENT ARCHITECTURE ====================

// ==================== PHASE 4: ENHANCED DRAG-AND-DROP EMAIL BUILDER ====================

// Enums for Email Builder
export const emailBlockTypeEnum = pgEnum('email_block_type', [
  'text', 'heading', 'image', 'button', 'divider', 'spacer',
  'columns', 'hero', 'card', 'social', 'footer', 'header',
  'list', 'quote', 'video', 'countdown', 'product'
]);
export const imageSourceEnum = pgEnum('image_source', ['upload', 'ai_generated', 'url', 'stock']);

// Brand Kits - Store brand colors, fonts, logos for consistent email design
export const brandKits = pgTable("brand_kits", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),

  // Identity
  name: text("name").notNull(),
  isDefault: boolean("is_default").default(false).notNull(),
  isActive: boolean("is_active").default(true).notNull(),

  // Company Information
  companyName: text("company_name").notNull(),
  companyAddress: text("company_address"), // For email footer (CAN-SPAM)
  companyPhone: text("company_phone"),
  companyWebsite: text("company_website"),

  // Brand Colors
  colors: jsonb("colors").$type<{
    primary: string;       // Main brand color (hex)
    secondary: string;     // Secondary accent color
    accent: string;        // Highlight/CTA color
    background: string;    // Email background
    text: string;          // Main text color
    textLight: string;     // Secondary text color
    link: string;          // Link color
    headerBg: string;      // Header background
    footerBg: string;      // Footer background
  }>().notNull(),

  // Typography
  typography: jsonb("typography").$type<{
    headingFont: string;   // e.g., "Arial, Helvetica, sans-serif"
    bodyFont: string;      // e.g., "Georgia, Times, serif"
    headingSize: number;   // Base heading size in px
    bodySize: number;      // Base body size in px
    lineHeight: number;    // e.g., 1.5
  }>().notNull(),

  // Logo
  logoImageId: varchar("logo_image_id"), // Reference to email_builder_images
  logoUrl: text("logo_url"),
  logoWidth: integer("logo_width").default(150),
  logoAlt: text("logo_alt").default('Company Logo'),

  // Social Links
  socialLinks: jsonb("social_links").$type<{
    facebook?: string;
    twitter?: string;
    linkedin?: string;
    instagram?: string;
    youtube?: string;
    tiktok?: string;
  }>(),

  // Button Styles
  buttonStyles: jsonb("button_styles").$type<{
    borderRadius: number;   // e.g., 4
    paddingX: number;       // Horizontal padding
    paddingY: number;       // Vertical padding
    fontSize: number;
    fontWeight: string;     // e.g., "bold"
    textTransform: string;  // e.g., "uppercase", "none"
  }>(),

  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (table) => ({
  nameIdx: index("brand_kits_name_idx").on(table.name),
  isDefaultIdx: index("brand_kits_is_default_idx").on(table.isDefault),
}));

// Email Builder Templates - Save complete email designs
export const emailBuilderTemplates = pgTable("email_builder_templates", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),

  // Template Identity
  name: text("name").notNull(),
  description: text("description"),
  category: text("category").default('custom'), // 'welcome', 'newsletter', 'promotional', 'transactional', 'custom'
  thumbnail: text("thumbnail"), // Preview image URL

  // Template Configuration
  brandKitId: varchar("brand_kit_id").references(() => brandKits.id, { onDelete: 'set null' }),
  width: integer("width").default(600), // Email width in px
  backgroundColor: text("background_color").default('#f4f4f4'),

  // Block Structure (stored as JSON for flexibility)
  blocks: jsonb("blocks").$type<Array<{
    id: string;
    type: string;
    sortOrder: number;
    content: Record<string, unknown>;
    styles: Record<string, unknown>;
    mobileStyles?: Record<string, unknown>;
    isVisible: boolean;
    hideOnMobile?: boolean;
    hideOnDesktop?: boolean;
  }>>().default([]),

  // Metadata
  isPublic: boolean("is_public").default(false), // Available in template library
  usageCount: integer("usage_count").default(0),
  lastUsedAt: timestamp("last_used_at"),

  // Version Control
  version: integer("version").default(1),
  parentTemplateId: varchar("parent_template_id"), // For versioning/forking

  createdBy: varchar("created_by").references(() => users.id, { onDelete: 'set null' }),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (table) => ({
  nameIdx: index("email_builder_templates_name_idx").on(table.name),
  categoryIdx: index("email_builder_templates_category_idx").on(table.category),
  brandKitIdx: index("email_builder_templates_brand_kit_idx").on(table.brandKitId),
  createdByIdx: index("email_builder_templates_created_by_idx").on(table.createdBy),
}));

// Email Builder Blocks - Individual content blocks for templates
export const emailBuilderBlocks = pgTable("email_builder_blocks", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  templateId: varchar("template_id").notNull().references(() => emailBuilderTemplates.id, { onDelete: 'cascade' }),

  // Block Type
  blockType: emailBlockTypeEnum("block_type").notNull(),
  sortOrder: integer("sort_order").notNull().default(0),

  // Content (varies by block type)
  content: jsonb("content").$type<{
    // Text/Heading blocks
    text?: string;
    html?: string;

    // Image blocks
    imageId?: string;
    imageUrl?: string;
    alt?: string;
    linkUrl?: string;

    // Button blocks
    buttonText?: string;
    buttonUrl?: string;
    buttonStyle?: 'primary' | 'secondary' | 'outline';

    // Columns blocks
    columnCount?: number;
    columnRatio?: string; // e.g., "50-50", "33-33-33", "60-40"
    columnBlocks?: Array<{
      id: string;
      type: string;
      content: Record<string, unknown>;
    }>;

    // Hero blocks
    heroTitle?: string;
    heroSubtitle?: string;
    heroImageUrl?: string;
    heroCta?: { text: string; url: string };

    // Social blocks
    socialLinks?: Array<{ platform: string; url: string }>;

    // List blocks
    items?: string[];
    listStyle?: 'bullet' | 'number' | 'check';

    // Video blocks
    videoUrl?: string;
    videoThumbnail?: string;

    // Product blocks
    productName?: string;
    productPrice?: string;
    productImage?: string;
    productDescription?: string;
    productUrl?: string;

    // Generic
    [key: string]: unknown;
  }>().notNull(),

  // Desktop Styles
  styles: jsonb("styles").$type<{
    backgroundColor?: string;
    paddingTop?: number;
    paddingBottom?: number;
    paddingLeft?: number;
    paddingRight?: number;
    marginTop?: number;
    marginBottom?: number;
    borderRadius?: number;
    borderColor?: string;
    borderWidth?: number;
    textAlign?: 'left' | 'center' | 'right';
    fontSize?: number;
    fontWeight?: string;
    color?: string;
    lineHeight?: number;
    width?: string | number;
    maxWidth?: number;
    [key: string]: unknown;
  }>().default({}),

  // Mobile-specific Styles (override desktop)
  mobileStyles: jsonb("mobile_styles").$type<Record<string, unknown>>().default({}),

  // Visibility
  isVisible: boolean("is_visible").default(true).notNull(),
  hideOnMobile: boolean("hide_on_mobile").default(false).notNull(),
  hideOnDesktop: boolean("hide_on_desktop").default(false).notNull(),

  // Personalization
  conditionalLogic: jsonb("conditional_logic").$type<{
    field?: string;
    operator?: 'equals' | 'not_equals' | 'contains' | 'exists';
    value?: string;
  }>(),

  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (table) => ({
  templateIdx: index("email_builder_blocks_template_idx").on(table.templateId),
  sortOrderIdx: index("email_builder_blocks_sort_order_idx").on(table.sortOrder),
  blockTypeIdx: index("email_builder_blocks_type_idx").on(table.blockType),
}));

// Email Builder Images - Store and manage images for email builder
export const emailBuilderImages = pgTable("email_builder_images", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),

  // Source Information
  source: imageSourceEnum("source").notNull(),
  originalUrl: text("original_url"), // Original/source URL
  storedUrl: text("stored_url").notNull(), // Our hosted URL (S3/CDN)
  thumbnailUrl: text("thumbnail_url"), // Smaller preview

  // File Information
  fileName: text("file_name"),
  mimeType: text("mime_type").default('image/png'),
  width: integer("width"),
  height: integer("height"),
  sizeBytes: integer("size_bytes"),

  // AI Generation Details (if source = 'ai_generated')
  aiPrompt: text("ai_prompt"),
  aiModel: text("ai_model"), // e.g., 'imagen-3', 'dall-e-3'
  aiGenerationId: text("ai_generation_id"),
  aiStyle: text("ai_style"), // Style parameters used

  // Metadata
  altText: text("alt_text"),
  caption: text("caption"),
  tags: text("tags").array(),

  // Usage Tracking
  usageCount: integer("usage_count").default(0),
  lastUsedAt: timestamp("last_used_at"),

  // Organization
  folderId: varchar("folder_id"),
  isPublic: boolean("is_public").default(false),

  uploadedBy: varchar("uploaded_by").references(() => users.id, { onDelete: 'set null' }),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (table) => ({
  sourceIdx: index("email_builder_images_source_idx").on(table.source),
  uploadedByIdx: index("email_builder_images_uploaded_by_idx").on(table.uploadedBy),
  tagsIdx: index("email_builder_images_tags_idx").on(table.tags),
}));

// AI Image Generation Jobs - Track Imagen 3 generation requests
export const aiImageGenerationJobs = pgTable("ai_image_generation_jobs", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),

  // Request
  prompt: text("prompt").notNull(),
  negativePrompt: text("negative_prompt"),
  style: text("style"), // 'photorealistic', 'illustration', 'abstract', etc.
  aspectRatio: text("aspect_ratio").default('1:1'), // '1:1', '16:9', '4:3', '9:16'
  numberOfImages: integer("number_of_images").default(1),

  // Model Configuration
  model: text("model").default('imagen-3'),
  modelVersion: text("model_version"),
  parameters: jsonb("parameters").$type<{
    guidanceScale?: number;
    seed?: number;
    safetyFilterLevel?: string;
    [key: string]: unknown;
  }>(),

  // Results
  status: text("status").notNull().default('pending'), // 'pending', 'processing', 'completed', 'failed'
  generatedImages: jsonb("generated_images").$type<Array<{
    imageId: string;
    url: string;
    width: number;
    height: number;
  }>>(),
  errorMessage: text("error_message"),

  // Timing & Cost
  startedAt: timestamp("started_at"),
  completedAt: timestamp("completed_at"),
  durationMs: integer("duration_ms"),
  estimatedCost: real("estimated_cost"),

  requestedBy: varchar("requested_by").references(() => users.id, { onDelete: 'set null' }),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (table) => ({
  statusIdx: index("ai_image_jobs_status_idx").on(table.status),
  requestedByIdx: index("ai_image_jobs_requested_by_idx").on(table.requestedBy),
  createdAtIdx: index("ai_image_jobs_created_at_idx").on(table.createdAt),
}));

// ==================== END PHASE 4: ENHANCED DRAG-AND-DROP EMAIL BUILDER ====================

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

// SIP Trunk Configuration - WebRTC connection credentials
export const sipTrunkConfigs = pgTable("sip_trunk_configs", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull(), // Friendly name for this SIP connection
  provider: text("provider").notNull().default('telnyx'), // 'telnyx', 'twilio', etc.
  sipUsername: text("sip_username").notNull(), // SIP username for WebRTC authentication
  sipPassword: text("sip_password").notNull(), // SIP password (encrypted in production)
  sipDomain: text("sip_domain").notNull().default('sip.telnyx.com'), // SIP domain/proxy
  connectionId: text("connection_id"), // Provider connection ID (optional)
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

// Telephony Provider Type Enum
export const telephonyProviderTypeEnum = pgEnum("telephony_provider_type", [
  'telnyx',
  'sip_trunk',
  'twilio',
  'bandwidth',
  'custom'
]);

// Telephony Provider Transport Enum
export const sipTransportEnum = pgEnum("sip_transport", [
  'udp',
  'tcp',
  'tls',
  'wss'
]);

// Telephony Providers - Abstraction layer for multiple telephony providers
// ISOLATED: This is for the new provider abstraction system, separate from existing Telnyx workflow
export const telephonyProviders = pgTable("telephony_providers", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull(), // Friendly name
  type: telephonyProviderTypeEnum("type").notNull(), // Provider type
  enabled: boolean("enabled").notNull().default(false), // Enable/disable provider
  priority: integer("priority").notNull().default(100), // Lower = higher priority for selection
  
  // API Authentication (for hosted providers like Telnyx, Twilio)
  apiKey: text("api_key"), // Encrypted in production
  apiSecret: text("api_secret"), // Encrypted in production
  
  // SIP Connection (for direct SIP trunk providers)
  sipDomain: text("sip_domain"),
  sipUsername: text("sip_username"),
  sipPassword: text("sip_password"), // Encrypted in production
  sipProxy: text("sip_proxy"),
  sipPort: integer("sip_port").default(5060),
  sipTransport: sipTransportEnum("sip_transport").default('udp'),
  
  // Provider Connection IDs (for hosted providers)
  connectionId: text("connection_id"),
  outboundProfileId: text("outbound_profile_id"),
  
  // Routing Configuration
  outboundNumbers: jsonb("outbound_numbers").$type<string[]>(), // Available caller IDs
  allowedDestinations: jsonb("allowed_destinations").$type<string[]>(), // Patterns like "+1*"
  blockedDestinations: jsonb("blocked_destinations").$type<string[]>(), // Blocked patterns
  
  // Rate Limiting
  maxCps: integer("max_cps").default(10), // Max calls per second
  maxConcurrent: integer("max_concurrent").default(100), // Max concurrent calls
  
  // Failover Configuration
  failoverProviderId: varchar("failover_provider_id"), // Self-reference for failover chain
  healthCheckInterval: integer("health_check_interval").default(60), // Seconds between health checks
  
  // Cost Tracking
  costPerMinute: real("cost_per_minute"), // Cost per minute in cents
  costPerCall: real("cost_per_call"), // Setup cost per call in cents
  currency: varchar("currency", { length: 3 }).default('USD'),
  
  // Metadata
  providerMetadata: jsonb("provider_metadata").$type<Record<string, unknown>>(), // Provider-specific settings
  createdById: varchar("created_by_id").references(() => users.id),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (table) => ({
  enabledIdx: index("telephony_providers_enabled_idx").on(table.enabled),
  typeIdx: index("telephony_providers_type_idx").on(table.type),
  priorityIdx: index("telephony_providers_priority_idx").on(table.priority),
}));

// Provider Health Check History - Track provider health over time
export const telephonyProviderHealthHistory = pgTable("telephony_provider_health_history", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  providerId: varchar("provider_id").references(() => telephonyProviders.id, { onDelete: 'cascade' }).notNull(),
  healthy: boolean("healthy").notNull(),
  latencyMs: integer("latency_ms"),
  errorCount: integer("error_count").default(0),
  lastError: text("last_error"),
  activeCallCount: integer("active_call_count").default(0),
  checkedAt: timestamp("checked_at").notNull().defaultNow(),
}, (table) => ({
  providerIdx: index("telephony_provider_health_provider_idx").on(table.providerId),
  checkedAtIdx: index("telephony_provider_health_checked_at_idx").on(table.checkedAt),
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
  clientAccount: one(clientAccounts, { fields: [campaigns.clientAccountId], references: [clientAccounts.id] }),
  project: one(clientProjects, { fields: [campaigns.projectId], references: [clientProjects.id] }),
  emailMessages: many(emailMessages),
  calls: many(calls),
  leads: many(leads),
  orderLinks: many(orderCampaignLinks),
}));

export const leadsRelations = relations(leads, ({ one, many }) => ({
  contact: one(contacts, { fields: [leads.contactId], references: [contacts.id] }),
  campaign: one(campaigns, { fields: [leads.campaignId], references: [campaigns.id] }),
  callAttempt: one(dialerCallAttempts, { fields: [leads.callAttemptId], references: [dialerCallAttempts.id] }),
  agent: one(users, { fields: [leads.agentId], references: [users.id] }),
  approvedBy: one(users, { fields: [leads.approvedById], references: [users.id] }),
  rejectedBy: one(users, { fields: [leads.rejectedById], references: [users.id] }),
  verification: one(leadVerifications, { fields: [leads.verificationId], references: [leadVerifications.id] }),
  comments: many(leadComments),
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

// Telephony Provider insert schema
export const insertTelephonyProviderSchema = createInsertSchema(telephonyProviders).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertTelephonyProviderHealthHistorySchema = createInsertSchema(telephonyProviderHealthHistory).omit({
  id: true,
  checkedAt: true,
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

export const insertLeadCommentSchema = createInsertSchema(leadComments).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertLeadComment = z.infer<typeof insertLeadCommentSchema>;
export type SelectLeadComment = typeof leadComments.$inferSelect;

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
  accountCity?: string | null;
  accountState?: string | null;
  accountCountry?: string | null;
  accountIndustry?: string | null;
  accountRevenueRange?: string | null;
  accountEmployeesRange?: string | null;
  accountLinkedin?: string | null;
  contactTitle?: string | null;
  contactCity?: string | null;
  contactState?: string | null;
  contactCountry?: string | null;
  contactLinkedin?: string | null;
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
// Client Accounts - For external clients to access their portal
export const clientAccounts = pgTable("client_accounts", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull(),
  contactEmail: text("contact_email"),
  contactPhone: text("contact_phone"),
  companyName: text("company_name"),
  notes: text("notes"),
  inviteSlug: varchar("invite_slug")
    .notNull()
    .unique()
    .default(sql`concat('join_', encode(gen_random_bytes(6), 'hex'))`),
  inviteDomains: text("invite_domains").array().default(sql`ARRAY[]::text[]`),
  inviteEnabled: boolean("invite_enabled").notNull().default(true),
  isActive: boolean("is_active").default(true).notNull(),
  // Visibility settings for the client dashboard
  visibilitySettings: jsonb("visibility_settings").$type<{
    showBilling: boolean;
    showLeads: boolean;
    showRecordings: boolean;
    showProjectDetails: boolean;
    allowedCampaignTypes: string[]; // Event, Webinar, etc.
  }>().default({
    showBilling: true,
    showLeads: true,
    showRecordings: false,
    showProjectDetails: true,
    allowedCampaignTypes: []
  }),

  // Enhanced Client Profile
  profile: jsonb("profile").$type<{
    summary?: string; // What the client does
    problemSolved?: string;
    products?: string[];
    services?: string[];
    industries?: string[];
    targetAudience?: string;
    differentiators?: string;
    engagementModel?: string; // How we work with them
    priorities?: string[];
    constraints?: string[];
  }>().default({}),
  
  // Enhanced Settings (Personalization)
  settings: jsonb("settings").$type<{
    featureVisibility?: Record<string, boolean>; 
    defaultCampaignTypes?: string[];
    preferredWorkflows?: string[];
    reportingEmphasis?: string[];
    agentDefaults?: Record<string, any>; // Adapt agent behavior
  }>().default({}),

  createdBy: varchar("created_by").references(() => users.id, { onDelete: 'set null' }),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (table) => ({
  nameIdx: index("client_accounts_name_idx").on(table.name),
  activeIdx: index("client_accounts_active_idx").on(table.isActive),
  inviteSlugIdx: uniqueIndex("client_accounts_invite_slug_idx").on(table.inviteSlug),
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

// Client Campaign Access - Links clients to campaigns they can access
// Supports both verification campaigns (contact enrichment) and regular campaigns (call/email with QA-approved leads)
export const clientCampaignAccess = pgTable("client_campaign_access", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  clientAccountId: varchar("client_account_id").references(() => clientAccounts.id, { onDelete: 'cascade' }).notNull(),
  // Verification campaign access (for contact enrichment workflows)
  campaignId: varchar("campaign_id").references(() => verificationCampaigns.id, { onDelete: 'cascade' }),
  // Regular campaign access (call/email campaigns with QA-approved leads)
  regularCampaignId: varchar("regular_campaign_id").references(() => campaigns.id, { onDelete: 'cascade' }),
  grantedBy: varchar("granted_by").references(() => users.id, { onDelete: 'set null' }),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (table) => ({
  clientCampaignIdx: uniqueIndex("client_campaign_access_unique_idx").on(table.clientAccountId, table.campaignId),
  clientAccountIdx: index("client_campaign_access_client_idx").on(table.clientAccountId),
  campaignIdx: index("client_campaign_access_campaign_idx").on(table.campaignId),
  regularCampaignIdx: index("client_campaign_access_regular_campaign_idx").on(table.clientAccountId, table.regularCampaignId),
}));

// Client Portal Orders - Monthly contact requests from clients
export const clientPortalOrders = pgTable("client_portal_orders", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  orderNumber: text("order_number").notNull().unique(),
  clientAccountId: varchar("client_account_id").references(() => clientAccounts.id, { onDelete: 'cascade' }).notNull(),
  clientUserId: varchar("client_user_id").references(() => clientUsers.id, { onDelete: 'set null' }),
  campaignId: varchar("campaign_id").references(() => verificationCampaigns.id, { onDelete: 'cascade' }),  // Nullable - order can be created before campaign association
  
  // Flexible metadata for work order details
  metadata: jsonb("metadata"),
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

// ==================== AGENTIC CAMPAIGN INTAKE & SESSIONS ====================

// Campaign Intake Requests - agentic campaign order intake queue
export const campaignIntakeRequests = pgTable("campaign_intake_requests", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  sourceType: text("source_type"), // web_form | client_portal | api | agentic_hub
  clientAccountId: varchar("client_account_id").references(() => clientAccounts.id, { onDelete: 'set null' }),
  clientOrderId: varchar("client_order_id").references(() => clientPortalOrders.id, { onDelete: 'set null' }),
  agenticSessionId: varchar("agentic_session_id"),

  // Raw intake payload and extracted context
  rawInput: jsonb("raw_input").$type<Record<string, unknown>>(),
  extractedContext: jsonb("extracted_context").$type<Record<string, unknown>>(),
  contextSources: jsonb("context_sources").$type<Record<string, unknown>[]>(),

  // Workflow
  status: text("status").default('pending'),
  priority: text("priority").default('normal'),
  assignedPmId: varchar("assigned_pm_id").references(() => users.id, { onDelete: 'set null' }),
  assignedAt: timestamp("assigned_at"),

  // QA + approval
  qsoReviewedById: varchar("qso_reviewed_by_id").references(() => users.id, { onDelete: 'set null' }),
  qsoReviewedAt: timestamp("qso_reviewed_at"),
  qsoNotes: text("qso_notes"),
  approvedById: varchar("approved_by_id").references(() => users.id, { onDelete: 'set null' }),
  approvedAt: timestamp("approved_at"),
  rejectionReason: text("rejection_reason"),

  // Campaign linkage
  campaignId: varchar("campaign_id").references(() => campaigns.id, { onDelete: 'set null' }),
  projectId: varchar("project_id").references(() => clientProjects.id, { onDelete: 'set null' }),

  // Requested params
  requestedStartDate: timestamp("requested_start_date"),
  requestedLeadCount: integer("requested_lead_count"),
  estimatedCost: numeric("estimated_cost"),
  requestedChannels: jsonb("requested_channels").$type<string[]>(),
  campaignType: text("campaign_type"),

  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (table) => ({
  clientAccountIdx: index("campaign_intake_requests_client_account_idx").on(table.clientAccountId),
  statusIdx: index("campaign_intake_requests_status_idx").on(table.status),
  createdAtIdx: index("campaign_intake_requests_created_at_idx").on(table.createdAt),
}));

// Agentic Campaign Sessions - conversational campaign creation state
export const agenticCampaignSessions = pgTable("agentic_campaign_sessions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  intakeRequestId: varchar("intake_request_id"),

  currentStep: text("current_step").default('context'),
  completedSteps: jsonb("completed_steps").$type<string[]>(),
  conversationHistory: jsonb("conversation_history").$type<Record<string, unknown>[]>(),
  approvals: jsonb("approvals").$type<Record<string, unknown>>(),

  // Step configurations
  contextConfig: jsonb("context_config").$type<Record<string, unknown>>(),
  audienceConfig: jsonb("audience_config").$type<Record<string, unknown>>(),
  voiceConfig: jsonb("voice_config").$type<Record<string, unknown>>(),
  phoneConfig: jsonb("phone_config").$type<Record<string, unknown>>(),
  contentConfig: jsonb("content_config").$type<Record<string, unknown>>(),
  reviewConfig: jsonb("review_config").$type<Record<string, unknown>>(),

  createdBy: varchar("created_by").references(() => users.id, { onDelete: 'set null' }),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (table) => ({
  createdByIdx: index("agentic_campaign_sessions_created_by_idx").on(table.createdBy),
  currentStepIdx: index("agentic_campaign_sessions_current_step_idx").on(table.currentStep),
}));

export type CampaignIntakeRequest = typeof campaignIntakeRequests.$inferSelect;
export type AgenticCampaignSession = typeof agenticCampaignSessions.$inferSelect;

// Relations for Client Portal
export const clientAccountsRelations = relations(clientAccounts, ({ one, many }) => ({
  createdBy: one(users, { fields: [clientAccounts.createdBy], references: [users.id] }),
  users: many(clientUsers),
  campaignAccess: many(clientCampaignAccess),
  orders: many(clientPortalOrders),
  regularCampaigns: many(campaigns),
}));

export const clientUsersRelations = relations(clientUsers, ({ one, many }) => ({
  clientAccount: one(clientAccounts, { fields: [clientUsers.clientAccountId], references: [clientAccounts.id] }),
  createdBy: one(users, { fields: [clientUsers.createdBy], references: [users.id] }),
  orders: many(clientPortalOrders),
}));

export const clientCampaignAccessRelations = relations(clientCampaignAccess, ({ one }) => ({
  clientAccount: one(clientAccounts, { fields: [clientCampaignAccess.clientAccountId], references: [clientAccounts.id] }),
  campaign: one(verificationCampaigns, { fields: [clientCampaignAccess.campaignId], references: [verificationCampaigns.id] }),
  regularCampaign: one(campaigns, { fields: [clientCampaignAccess.regularCampaignId], references: [campaigns.id] }),
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

// ==================== ENHANCED CLIENT PORTAL SYSTEM ====================

// Enums for enhanced client portal
export const clientProjectStatusEnum = pgEnum('client_project_status', [
  'draft',
  'pending',
  'active',
  'paused',
  'completed',
  'archived',
  'rejected'
]);

export const billingModelTypeEnum = pgEnum('billing_model_type', [
  'cpl',              // Cost Per Lead
  'cpc',              // Cost Per Contact
  'monthly_retainer', // Fixed monthly fee
  'hybrid'            // Retainer + overage
]);

export const activityCostTypeEnum = pgEnum('activity_cost_type', [
  'lead_delivered',
  'contact_verified',
  'ai_call_minute',
  'email_sent',
  'sms_sent',
  'retainer_fee',
  'setup_fee',
  'adjustment',
  'credit'
]);

export const invoiceStatusEnum = pgEnum('invoice_status', [
  'draft',
  'pending',
  'sent',
  'paid',
  'overdue',
  'void',
  'disputed'
]);

export const deliveryStatusEnum = pgEnum('delivery_status', [
  'pending',
  'processing',
  'delivered',
  'failed',
  'expired'
]);

export const voiceCommandIntentEnum = pgEnum('voice_command_intent', [
  'navigation',
  'query',
  'action',
  'report',
  'unknown'
]);

// ==================== CLIENT ASSIGNMENT & QA GATING ENUMS ====================

/**
 * Project Type Enum
 * Classifies client projects by campaign/work type
 */
export const projectTypeEnum = pgEnum('project_type', [
  'call_campaign',
  'email_campaign',
  'data_enrichment',
  'verification',
  'combo',
  'custom'
]);

/**
 * QA Content Type Enum
 * Types of content that can go through QA gating
 */
export const qaContentTypeEnum = pgEnum('qa_content_type', [
  'simulation',
  'mock_call',
  'report',
  'data_export'
]);

/**
 * Client Relationship Type Enum
 * Defines the relationship between clients and campaign organizations
 */
export const clientRelationshipTypeEnum = pgEnum('client_relationship_type', [
  'managed',
  'partner',
  'reseller'
]);

// Client Projects - Container for campaigns and billing
export const clientProjects = pgTable("client_projects", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  clientAccountId: varchar("client_account_id").notNull().references(() => clientAccounts.id, { onDelete: 'cascade' }),

  // Project Details
  name: text("name").notNull(),
  description: text("description"),
  projectCode: text("project_code").unique(),

  // Dates
  startDate: date("start_date"),
  endDate: date("end_date"),

  // Status
  status: clientProjectStatusEnum("status").notNull().default('draft'),

  // Budget
  budgetAmount: numeric("budget_amount", { precision: 12, scale: 2 }),
  budgetCurrency: varchar("budget_currency", { length: 3 }).default('USD'),

  // Lead goals
  requestedLeadCount: integer("requested_lead_count"),

  // Billing Settings (override account defaults)
  billingModel: billingModelTypeEnum("billing_model"),
  ratePerLead: numeric("rate_per_lead", { precision: 10, scale: 2 }),
  ratePerContact: numeric("rate_per_contact", { precision: 10, scale: 2 }),
  ratePerCallMinute: numeric("rate_per_call_minute", { precision: 10, scale: 4 }),
  monthlyRetainer: numeric("monthly_retainer", { precision: 10, scale: 2 }),

  // Metadata
  landingPageUrl: text("landing_page_url"), // Optional landing page URL
  projectFileUrl: text("project_file_url"), // Optional uploaded file URL

  // Project Type Classification (for client assignment)
  projectType: projectTypeEnum("project_type").default('custom'),

  intakeRequestId: varchar("intake_request_id"), // Back-reference to intake request

  // Campaign Organization Reference (for three-tier hierarchy)
  campaignOrganizationId: varchar("campaign_organization_id"),

  // QA Gate Configuration
  qaGateConfig: jsonb("qa_gate_config").$type<{
    enabled: boolean;
    autoApproveThreshold: number;
    requireManualReview: boolean;
  }>().default({
    enabled: true,
    autoApproveThreshold: 85,
    requireManualReview: false
  }),

  // Approval workflow
  approvalNotes: text("approval_notes"),
  approvedBy: varchar("approved_by").references(() => users.id, { onDelete: 'set null' }),
  approvedAt: timestamp("approved_at"),
  rejectionReason: text("rejection_reason"),

  // External event linkage (Argyle event-sourced projects)
  externalEventId: varchar("external_event_id").references(() => externalEvents.id, { onDelete: 'set null' }),

  createdBy: varchar("created_by").references(() => users.id, { onDelete: 'set null' }),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (table) => ({
  clientIdx: index("client_projects_client_idx").on(table.clientAccountId),
  statusIdx: index("client_projects_status_idx").on(table.status),
  codeIdx: index("client_projects_code_idx").on(table.projectCode),
  typeIdx: index("client_projects_type_idx").on(table.projectType),
  orgIdx: index("client_projects_org_idx").on(table.campaignOrganizationId),
  eventIdx: index("client_projects_event_idx").on(table.externalEventId),
}));

// Link campaigns to projects
export const clientProjectCampaigns = pgTable("client_project_campaigns", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  projectId: varchar("project_id").notNull().references(() => clientProjects.id, { onDelete: 'cascade' }),
  campaignId: varchar("campaign_id").notNull().references(() => verificationCampaigns.id, { onDelete: 'cascade' }),
  assignedAt: timestamp("assigned_at").notNull().defaultNow(),
  assignedBy: varchar("assigned_by").references(() => users.id, { onDelete: 'set null' }),
}, (table) => ({
  projectCampaignUniq: uniqueIndex("client_project_campaigns_unique_idx").on(table.projectId, table.campaignId),
  projectIdx: index("client_project_campaigns_project_idx").on(table.projectId),
  campaignIdx: index("client_project_campaigns_campaign_idx").on(table.campaignId),
}));

// Client Billing Configuration
export const clientBillingConfig = pgTable("client_billing_config", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  clientAccountId: varchar("client_account_id").notNull().unique().references(() => clientAccounts.id, { onDelete: 'cascade' }),

  // Default Pricing Model
  defaultBillingModel: billingModelTypeEnum("default_billing_model").notNull().default('cpl'),

  // Rates (defaults)
  defaultRatePerLead: numeric("default_rate_per_lead", { precision: 10, scale: 2 }).default('150.00'),
  defaultRatePerContact: numeric("default_rate_per_contact", { precision: 10, scale: 2 }).default('25.00'),
  defaultRatePerCallMinute: numeric("default_rate_per_call_minute", { precision: 10, scale: 4 }).default('0.15'),
  defaultRatePerEmail: numeric("default_rate_per_email", { precision: 10, scale: 4 }).default('0.02'),

  // Retainer Settings
  monthlyRetainerAmount: numeric("monthly_retainer_amount", { precision: 12, scale: 2 }),
  retainerIncludesLeads: integer("retainer_includes_leads"),
  overageRatePerLead: numeric("overage_rate_per_lead", { precision: 10, scale: 2 }),

  // Payment Terms
  paymentTermsDays: integer("payment_terms_days").default(30),
  currency: varchar("currency", { length: 3 }).default('USD'),

  // Billing Contact
  billingEmail: text("billing_email"),
  billingAddress: jsonb("billing_address"),

  // Tax
  taxExempt: boolean("tax_exempt").default(false),
  taxId: text("tax_id"),
  taxRate: numeric("tax_rate", { precision: 5, scale: 4 }).default('0'),

  // Auto Invoice Settings
  autoInvoiceEnabled: boolean("auto_invoice_enabled").default(true),
  invoiceDayOfMonth: integer("invoice_day_of_month").default(1),
  paymentDueDayOfMonth: integer("payment_due_day_of_month"),

  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

// Client Campaign Type Pricing - Per-client pricing for each campaign type
export const clientCampaignPricing = pgTable("client_campaign_pricing", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  clientAccountId: varchar("client_account_id").notNull().references(() => clientAccounts.id, { onDelete: 'cascade' }),

  // Campaign Type (matches CAMPAIGN_TYPES values in the order panel)
  campaignType: varchar("campaign_type", { length: 100 }).notNull(),

  // Pricing Configuration
  pricePerLead: numeric("price_per_lead", { precision: 10, scale: 2 }).notNull(),
  minimumOrderSize: integer("minimum_order_size").default(100),

  // Volume-based discounts (optional)
  volumeDiscounts: jsonb("volume_discounts").default('[]'), // [{minQuantity: 500, discountPercent: 5}, {minQuantity: 1000, discountPercent: 10}]

  // Campaign-specific settings
  isEnabled: boolean("is_enabled").default(true), // Whether this campaign type is available for this client
  notes: text("notes"), // Internal notes about this pricing agreement

  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (table) => ({
  // Unique constraint: one price per campaign type per client
  uniqueClientCampaignType: unique().on(table.clientAccountId, table.campaignType),
}));

// Client Pricing Documents (uploaded PDFs/files for custom pricing agreements)
export const clientPricingDocuments = pgTable("client_pricing_documents", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  clientAccountId: varchar("client_account_id").notNull().references(() => clientAccounts.id, { onDelete: 'cascade' }),
  name: varchar("name", { length: 255 }).notNull(),
  description: text("description"),
  fileKey: varchar("file_key", { length: 500 }).notNull(), // GCS storage key
  fileName: varchar("file_name", { length: 255 }).notNull(),
  fileType: varchar("file_type", { length: 100 }).notNull(), // MIME type
  fileSize: integer("file_size"), // bytes
  uploadedBy: varchar("uploaded_by", { length: 255 }), // admin name/email
  isActive: boolean("is_active").default(true),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (table) => ({
  clientIdx: index("client_pricing_docs_client_idx").on(table.clientAccountId),
}));

export type ClientPricingDocument = typeof clientPricingDocuments.$inferSelect;
export type InsertClientPricingDocument = typeof clientPricingDocuments.$inferInsert;

// Client Activity Costs (Real-time tracking)
export const clientActivityCosts = pgTable("client_activity_costs", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  clientAccountId: varchar("client_account_id").notNull().references(() => clientAccounts.id, { onDelete: 'cascade' }),
  projectId: varchar("project_id").references(() => clientProjects.id, { onDelete: 'set null' }),
  campaignId: varchar("campaign_id").references(() => verificationCampaigns.id, { onDelete: 'set null' }),
  orderId: varchar("order_id").references(() => clientPortalOrders.id, { onDelete: 'set null' }),

  // Activity Details
  activityType: activityCostTypeEnum("activity_type").notNull(),
  activityDate: timestamp("activity_date").notNull().defaultNow(),

  // Reference to source record
  referenceType: text("reference_type"),
  referenceId: varchar("reference_id"),

  // Cost Calculation
  quantity: numeric("quantity", { precision: 10, scale: 2 }).notNull().default('1'),
  unitRate: numeric("unit_rate", { precision: 10, scale: 4 }).notNull(),
  totalCost: numeric("total_cost", { precision: 12, scale: 4 }).notNull(),
  currency: varchar("currency", { length: 3 }).default('USD'),

  // Billing Status
  invoiceId: varchar("invoice_id"),
  invoicedAt: timestamp("invoiced_at"),

  // Metadata
  description: text("description"),
  metadata: jsonb("metadata"),

  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (table) => ({
  clientDateIdx: index("client_activity_costs_client_date_idx").on(table.clientAccountId, table.activityDate),
  invoiceIdx: index("client_activity_costs_invoice_idx").on(table.invoiceId),
  projectIdx: index("client_activity_costs_project_idx").on(table.projectId),
  campaignIdx: index("client_activity_costs_campaign_idx").on(table.campaignId),
}));

// Client Invoices
export const clientInvoices = pgTable("client_invoices", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  clientAccountId: varchar("client_account_id").notNull().references(() => clientAccounts.id, { onDelete: 'cascade' }),

  // Invoice Details
  invoiceNumber: text("invoice_number").unique().notNull(),

  // Period
  billingPeriodStart: date("billing_period_start").notNull(),
  billingPeriodEnd: date("billing_period_end").notNull(),

  // Amounts
  subtotal: numeric("subtotal", { precision: 12, scale: 2 }).notNull(),
  taxAmount: numeric("tax_amount", { precision: 12, scale: 2 }).default('0'),
  discountAmount: numeric("discount_amount", { precision: 12, scale: 2 }).default('0'),
  totalAmount: numeric("total_amount", { precision: 12, scale: 2 }).notNull(),
  amountPaid: numeric("amount_paid", { precision: 12, scale: 2 }).default('0'),
  currency: varchar("currency", { length: 3 }).default('USD'),

  // Status
  status: invoiceStatusEnum("status").notNull().default('draft'),

  // Dates
  issueDate: date("issue_date"),
  dueDate: date("due_date"),
  paidDate: date("paid_date"),

  // Payment
  paymentMethod: text("payment_method"),
  paymentReference: text("payment_reference"),

  // Notes
  notes: text("notes"),
  internalNotes: text("internal_notes"),

  // PDF Storage
  pdfUrl: text("pdf_url"),

  // Audit
  createdBy: varchar("created_by").references(() => users.id, { onDelete: 'set null' }),
  sentBy: varchar("sent_by").references(() => users.id, { onDelete: 'set null' }),
  sentAt: timestamp("sent_at"),

  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (table) => ({
  clientIdx: index("client_invoices_client_idx").on(table.clientAccountId),
  statusIdx: index("client_invoices_status_idx").on(table.status),
  periodIdx: index("client_invoices_period_idx").on(table.billingPeriodStart, table.billingPeriodEnd),
  dueDateIdx: index("client_invoices_due_date_idx").on(table.dueDate),
}));

// Invoice Line Items
export const clientInvoiceItems = pgTable("client_invoice_items", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  invoiceId: varchar("invoice_id").notNull().references(() => clientInvoices.id, { onDelete: 'cascade' }),

  // Item Details
  description: text("description").notNull(),
  itemType: text("item_type").notNull(),

  // Quantity & Pricing
  quantity: numeric("quantity", { precision: 10, scale: 2 }).notNull(),
  unitPrice: numeric("unit_price", { precision: 10, scale: 4 }).notNull(),
  amount: numeric("amount", { precision: 12, scale: 2 }).notNull(),

  // Project/Campaign Reference
  projectId: varchar("project_id").references(() => clientProjects.id, { onDelete: 'set null' }),
  campaignId: varchar("campaign_id").references(() => verificationCampaigns.id, { onDelete: 'set null' }),

  // Period
  periodStart: date("period_start"),
  periodEnd: date("period_end"),

  // Ordering
  sortOrder: integer("sort_order").default(0),

  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (table) => ({
  invoiceIdx: index("client_invoice_items_invoice_idx").on(table.invoiceId),
}));

// Invoice Activity Log
export const clientInvoiceActivity = pgTable("client_invoice_activity", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  invoiceId: varchar("invoice_id").notNull().references(() => clientInvoices.id, { onDelete: 'cascade' }),

  activityType: text("activity_type").notNull(),
  description: text("description"),

  performedBy: varchar("performed_by").references(() => users.id, { onDelete: 'set null' }),
  performedByClient: varchar("performed_by_client").references(() => clientUsers.id, { onDelete: 'set null' }),
  performedAt: timestamp("performed_at").notNull().defaultNow(),
}, (table) => ({
  invoiceIdx: index("client_invoice_activity_invoice_idx").on(table.invoiceId),
}));

// Delivery Links
export const clientDeliveryLinks = pgTable("client_delivery_links", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  clientAccountId: varchar("client_account_id").notNull().references(() => clientAccounts.id, { onDelete: 'cascade' }),
  orderId: varchar("order_id").references(() => clientPortalOrders.id, { onDelete: 'set null' }),
  campaignId: varchar("campaign_id").references(() => verificationCampaigns.id, { onDelete: 'set null' }),
  projectId: varchar("project_id").references(() => clientProjects.id, { onDelete: 'set null' }),

  // Delivery Details
  deliveryType: text("delivery_type").notNull().default('csv_export'),
  deliveryStatus: deliveryStatusEnum("delivery_status").notNull().default('pending'),

  // Link Information
  fileUrl: text("file_url"),
  fileName: text("file_name"),
  linkExpiresAt: timestamp("link_expires_at"),
  downloadCount: integer("download_count").default(0),
  maxDownloads: integer("max_downloads"),

  // Delivery Content
  contactCount: integer("contact_count").notNull().default(0),
  fileFormat: text("file_format").default('csv'),
  fileSizeBytes: integer("file_size_bytes"),

  // Tracking
  deliveredAt: timestamp("delivered_at"),
  firstAccessedAt: timestamp("first_accessed_at"),
  lastAccessedAt: timestamp("last_accessed_at"),

  // Security
  accessToken: text("access_token").unique().default(sql`gen_random_uuid()::text`),
  passwordProtected: boolean("password_protected").default(false),
  passwordHash: text("password_hash"),

  // Audit
  createdBy: varchar("created_by").references(() => users.id, { onDelete: 'set null' }),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (table) => ({
  clientIdx: index("client_delivery_links_client_idx").on(table.clientAccountId),
  orderIdx: index("client_delivery_links_order_idx").on(table.orderId),
  tokenIdx: index("client_delivery_links_token_idx").on(table.accessToken),
  statusIdx: index("client_delivery_links_status_idx").on(table.deliveryStatus),
}));

// Delivery Access Log
export const clientDeliveryAccessLog = pgTable("client_delivery_access_log", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  deliveryLinkId: varchar("delivery_link_id").notNull().references(() => clientDeliveryLinks.id, { onDelete: 'cascade' }),

  accessedAt: timestamp("accessed_at").notNull().defaultNow(),
  accessedByUserId: varchar("accessed_by_user_id").references(() => clientUsers.id, { onDelete: 'set null' }),
  ipAddress: text("ip_address"),
  userAgent: text("user_agent"),
}, (table) => ({
  linkIdx: index("client_delivery_access_log_link_idx").on(table.deliveryLinkId),
}));

// Voice Commands
export const clientVoiceCommands = pgTable("client_voice_commands", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  clientUserId: varchar("client_user_id").notNull().references(() => clientUsers.id, { onDelete: 'cascade' }),
  clientAccountId: varchar("client_account_id").notNull().references(() => clientAccounts.id, { onDelete: 'cascade' }),

  // Command Details
  transcript: text("transcript").notNull(),
  intent: voiceCommandIntentEnum("intent").default('unknown'),
  entities: jsonb("entities"),

  // Response
  responseText: text("response_text"),
  responseAudioUrl: text("response_audio_url"),

  // Action Taken
  actionType: text("action_type"),
  actionResult: jsonb("action_result"),
  actionSuccess: boolean("action_success"),

  // Timing
  processingDurationMs: integer("processing_duration_ms"),

  // Audio Storage
  audioInputUrl: text("audio_input_url"),

  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (table) => ({
  userIdx: index("client_voice_commands_user_idx").on(table.clientUserId),
  accountIdx: index("client_voice_commands_account_idx").on(table.clientAccountId),
  createdIdx: index("client_voice_commands_created_idx").on(table.createdAt),
}));

// Voice Configuration
export const clientVoiceConfig = pgTable("client_voice_config", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  clientAccountId: varchar("client_account_id").notNull().unique().references(() => clientAccounts.id, { onDelete: 'cascade' }),

  // Voice Settings
  voiceEnabled: boolean("voice_enabled").default(true),
  preferredVoice: text("preferred_voice").default('nova'),
  responseSpeed: numeric("response_speed", { precision: 3, scale: 2 }).default('1.0'),

  // Permissions
  voiceCanCreateOrders: boolean("voice_can_create_orders").default(true),
  voiceCanViewInvoices: boolean("voice_can_view_invoices").default(true),
  voiceCanDownloadReports: boolean("voice_can_download_reports").default(true),

  // Custom Vocabulary
  customVocabulary: jsonb("custom_vocabulary"),

  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

// Relations for enhanced client portal
export const clientProjectsRelations = relations(clientProjects, ({ one, many }) => ({
  clientAccount: one(clientAccounts, { fields: [clientProjects.clientAccountId], references: [clientAccounts.id] }),
  createdBy: one(users, { fields: [clientProjects.createdBy], references: [users.id] }),
  campaigns: many(clientProjectCampaigns),
  regularCampaigns: many(campaigns),
  costs: many(clientActivityCosts),
  deliveryLinks: many(clientDeliveryLinks),
}));

// Client portal activity log (per-client audit trail)
export const clientPortalActivityLogs = pgTable("client_portal_activity_logs", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  clientAccountId: varchar("client_account_id").notNull().references(() => clientAccounts.id, { onDelete: 'cascade' }),
  clientUserId: varchar("client_user_id").references(() => clientUsers.id, { onDelete: 'set null' }),
  entityType: text("entity_type").notNull(),
  entityId: varchar("entity_id").notNull(),
  action: text("action").notNull(),
  details: jsonb("details"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export type ClientPortalActivityLog = typeof clientPortalActivityLogs.$inferSelect;
export type InsertClientPortalActivityLog = typeof clientPortalActivityLogs.$inferInsert;

export const clientProjectCampaignsRelations = relations(clientProjectCampaigns, ({ one }) => ({
  project: one(clientProjects, { fields: [clientProjectCampaigns.projectId], references: [clientProjects.id] }),
  campaign: one(verificationCampaigns, { fields: [clientProjectCampaigns.campaignId], references: [verificationCampaigns.id] }),
  assignedBy: one(users, { fields: [clientProjectCampaigns.assignedBy], references: [users.id] }),
}));

export const clientBillingConfigRelations = relations(clientBillingConfig, ({ one }) => ({
  clientAccount: one(clientAccounts, { fields: [clientBillingConfig.clientAccountId], references: [clientAccounts.id] }),
}));

export const clientCampaignPricingRelations = relations(clientCampaignPricing, ({ one }) => ({
  clientAccount: one(clientAccounts, { fields: [clientCampaignPricing.clientAccountId], references: [clientAccounts.id] }),
}));

export const clientActivityCostsRelations = relations(clientActivityCosts, ({ one }) => ({
  clientAccount: one(clientAccounts, { fields: [clientActivityCosts.clientAccountId], references: [clientAccounts.id] }),
  project: one(clientProjects, { fields: [clientActivityCosts.projectId], references: [clientProjects.id] }),
  campaign: one(verificationCampaigns, { fields: [clientActivityCosts.campaignId], references: [verificationCampaigns.id] }),
  order: one(clientPortalOrders, { fields: [clientActivityCosts.orderId], references: [clientPortalOrders.id] }),
  invoice: one(clientInvoices, { fields: [clientActivityCosts.invoiceId], references: [clientInvoices.id] }),
}));

export const clientInvoicesRelations = relations(clientInvoices, ({ one, many }) => ({
  clientAccount: one(clientAccounts, { fields: [clientInvoices.clientAccountId], references: [clientAccounts.id] }),
  createdBy: one(users, { fields: [clientInvoices.createdBy], references: [users.id] }),
  sentBy: one(users, { fields: [clientInvoices.sentBy], references: [users.id] }),
  items: many(clientInvoiceItems),
  activity: many(clientInvoiceActivity),
  costs: many(clientActivityCosts),
}));

export const clientInvoiceItemsRelations = relations(clientInvoiceItems, ({ one }) => ({
  invoice: one(clientInvoices, { fields: [clientInvoiceItems.invoiceId], references: [clientInvoices.id] }),
  project: one(clientProjects, { fields: [clientInvoiceItems.projectId], references: [clientProjects.id] }),
  campaign: one(verificationCampaigns, { fields: [clientInvoiceItems.campaignId], references: [verificationCampaigns.id] }),
}));

export const clientInvoiceActivityRelations = relations(clientInvoiceActivity, ({ one }) => ({
  invoice: one(clientInvoices, { fields: [clientInvoiceActivity.invoiceId], references: [clientInvoices.id] }),
  performedBy: one(users, { fields: [clientInvoiceActivity.performedBy], references: [users.id] }),
  performedByClient: one(clientUsers, { fields: [clientInvoiceActivity.performedByClient], references: [clientUsers.id] }),
}));

export const clientDeliveryLinksRelations = relations(clientDeliveryLinks, ({ one, many }) => ({
  clientAccount: one(clientAccounts, { fields: [clientDeliveryLinks.clientAccountId], references: [clientAccounts.id] }),
  order: one(clientPortalOrders, { fields: [clientDeliveryLinks.orderId], references: [clientPortalOrders.id] }),
  campaign: one(verificationCampaigns, { fields: [clientDeliveryLinks.campaignId], references: [verificationCampaigns.id] }),
  project: one(clientProjects, { fields: [clientDeliveryLinks.projectId], references: [clientProjects.id] }),
  createdBy: one(users, { fields: [clientDeliveryLinks.createdBy], references: [users.id] }),
  accessLogs: many(clientDeliveryAccessLog),
}));

export const clientDeliveryAccessLogRelations = relations(clientDeliveryAccessLog, ({ one }) => ({
  deliveryLink: one(clientDeliveryLinks, { fields: [clientDeliveryAccessLog.deliveryLinkId], references: [clientDeliveryLinks.id] }),
  accessedBy: one(clientUsers, { fields: [clientDeliveryAccessLog.accessedByUserId], references: [clientUsers.id] }),
}));

export const clientVoiceCommandsRelations = relations(clientVoiceCommands, ({ one }) => ({
  clientUser: one(clientUsers, { fields: [clientVoiceCommands.clientUserId], references: [clientUsers.id] }),
  clientAccount: one(clientAccounts, { fields: [clientVoiceCommands.clientAccountId], references: [clientAccounts.id] }),
}));

export const clientVoiceConfigRelations = relations(clientVoiceConfig, ({ one }) => ({
  clientAccount: one(clientAccounts, { fields: [clientVoiceConfig.clientAccountId], references: [clientAccounts.id] }),
}));

// Types for enhanced client portal
export type ClientProject = typeof clientProjects.$inferSelect;
export type InsertClientProject = typeof clientProjects.$inferInsert;
export type ClientProjectCampaign = typeof clientProjectCampaigns.$inferSelect;
export type ClientBillingConfig = typeof clientBillingConfig.$inferSelect;
export type ClientCampaignPricing = typeof clientCampaignPricing.$inferSelect;
export type InsertClientCampaignPricing = typeof clientCampaignPricing.$inferInsert;
export type ClientActivityCost = typeof clientActivityCosts.$inferSelect;
export type ClientInvoice = typeof clientInvoices.$inferSelect;
export type InsertClientInvoice = typeof clientInvoices.$inferInsert;
export type ClientInvoiceItem = typeof clientInvoiceItems.$inferSelect;
export type ClientDeliveryLink = typeof clientDeliveryLinks.$inferSelect;
export type ClientVoiceCommand = typeof clientVoiceCommands.$inferSelect;
export type ClientVoiceConfig = typeof clientVoiceConfig.$inferSelect;

// ==================== CLIENT ASSIGNMENT & QA GATING SYSTEM ====================

/**
 * Client Organization Links
 * Links clients to campaign organizations for three-tier hierarchy
 * Super Org -> Campaign Orgs -> Clients (many-to-many)
 */
export const clientOrganizationLinks = pgTable("client_organization_links", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  clientAccountId: varchar("client_account_id").notNull().references(() => clientAccounts.id, { onDelete: 'cascade' }),
  campaignOrganizationId: varchar("campaign_organization_id").notNull(),

  // Relationship metadata
  relationshipType: clientRelationshipTypeEnum("relationship_type").notNull().default('managed'),
  isPrimary: boolean("is_primary").notNull().default(false),

  // Audit
  createdBy: varchar("created_by").references(() => users.id, { onDelete: 'set null' }),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (table) => ({
  clientOrgUniq: uniqueIndex("client_organization_links_unique_idx").on(table.clientAccountId, table.campaignOrganizationId),
  clientIdx: index("client_organization_links_client_idx").on(table.clientAccountId),
  orgIdx: index("client_organization_links_org_idx").on(table.campaignOrganizationId),
  primaryIdx: index("client_organization_links_primary_idx").on(table.clientAccountId),
}));

// ==================== WORK ORDERS / CAMPAIGN REQUESTS ====================

/**
 * Work Order Status Enum
 * Tracks the lifecycle of a work order / campaign request
 */
export const workOrderStatusEnum = pgEnum('work_order_status', [
  'draft',           // Client creating the request
  'submitted',       // Submitted, awaiting review
  'under_review',    // Being reviewed by admin
  'approved',        // Approved, ready for project creation
  'in_progress',     // Campaign is being built/executed
  'qa_review',       // In QA review stage
  'completed',       // Work completed, leads delivered
  'on_hold',         // Temporarily paused
  'rejected',        // Request rejected
  'cancelled'        // Request cancelled
]);

/**
 * Work Order Type Enum
 * Type of campaign/work being requested
 */
export const workOrderTypeEnum = pgEnum('work_order_type', [
  'call_campaign',      // AI calling campaign
  'email_campaign',     // Email outreach campaign
  'combo_campaign',     // Combined call + email
  'data_enrichment',    // Data enrichment/verification
  'lead_generation',    // New lead generation
  'appointment_setting', // Appointment setting focused
  'market_research',    // Market research calls
  'custom'              // Custom request
]);

/**
 * Work Order Priority Enum
 */
export const workOrderPriorityEnum = pgEnum('work_order_priority', [
  'low',
  'normal',
  'high',
  'urgent'
]);

/**
 * Work Orders (Client View) / Campaign Requests (Admin View)
 *
 * Submitted by clients as "Work Orders"
 * Viewed by admins as "Campaign Requests"
 * Links to Projects, Campaigns, QA, and Leads
 */
export const workOrders = pgTable("work_orders", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  orderNumber: text("order_number").notNull().unique(),

  // Client info
  clientAccountId: varchar("client_account_id").notNull().references(() => clientAccounts.id, { onDelete: 'cascade' }),
  clientUserId: varchar("client_user_id").references(() => clientUsers.id, { onDelete: 'set null' }),

  // Request details
  title: text("title").notNull(),
  description: text("description"),
  orderType: workOrderTypeEnum("order_type").notNull().default('lead_generation'),
  priority: workOrderPriorityEnum("priority").notNull().default('normal'),
  status: workOrderStatusEnum("status").notNull().default('draft'),

  // Target specifications
  targetIndustries: text("target_industries").array(),
  targetTitles: text("target_titles").array(),
  targetCompanySize: text("target_company_size"),
  targetRegions: text("target_regions").array(),
  targetAccountCount: integer("target_account_count"),
  targetLeadCount: integer("target_lead_count"),

  // Timeline
  requestedStartDate: date("requested_start_date"),
  requestedEndDate: date("requested_end_date"),
  actualStartDate: date("actual_start_date"),
  actualEndDate: date("actual_end_date"),

  // Budget
  estimatedBudget: numeric("estimated_budget", { precision: 12, scale: 2 }),
  approvedBudget: numeric("approved_budget", { precision: 12, scale: 2 }),
  actualSpend: numeric("actual_spend", { precision: 12, scale: 2 }).default('0'),

  // Client notes & requirements
  clientNotes: text("client_notes"),
  specialRequirements: text("special_requirements"),

  // Campaign configuration (from AI Studio or manual)
  campaignConfig: jsonb("campaign_config").$type<{
    voiceId?: string;
    emailTemplateId?: string;
    callScript?: string;
    qualificationQuestions?: Array<{ question: string; required: boolean }>;
    bookingEnabled?: boolean;
    bookingUrl?: string;
  }>(),

  // Organization intelligence context (snapshot at submission time)
  organizationContext: text("organization_context"),

  // Links to other entities (populated after approval)
  projectId: varchar("project_id").references(() => clientProjects.id, { onDelete: 'set null' }),
  campaignId: varchar("campaign_id").references(() => campaigns.id, { onDelete: 'set null' }),

  // Admin workflow
  assignedTo: varchar("assigned_to").references(() => users.id, { onDelete: 'set null' }),
  adminNotes: text("admin_notes"),
  internalPriority: integer("internal_priority"),

  // Review tracking
  reviewedBy: varchar("reviewed_by").references(() => users.id, { onDelete: 'set null' }),
  reviewedAt: timestamp("reviewed_at"),
  approvedBy: varchar("approved_by").references(() => users.id, { onDelete: 'set null' }),
  approvedAt: timestamp("approved_at"),
  rejectedBy: varchar("rejected_by").references(() => users.id, { onDelete: 'set null' }),
  rejectedAt: timestamp("rejected_at"),
  rejectionReason: text("rejection_reason"),

  // Progress tracking
  progressPercent: integer("progress_percent").default(0),
  leadsGenerated: integer("leads_generated").default(0),
  leadsDelivered: integer("leads_delivered").default(0),

  // QA tracking
  qaStatus: text("qa_status"), // pending, in_review, approved, rejected
  qaReviewedBy: varchar("qa_reviewed_by").references(() => users.id, { onDelete: 'set null' }),
  qaReviewedAt: timestamp("qa_reviewed_at"),
  qaNotes: text("qa_notes"),

  // Timestamps
  submittedAt: timestamp("submitted_at"),
  completedAt: timestamp("completed_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (table) => ({
  clientIdx: index("work_orders_client_idx").on(table.clientAccountId),
  statusIdx: index("work_orders_status_idx").on(table.status),
  typeIdx: index("work_orders_type_idx").on(table.orderType),
  projectIdx: index("work_orders_project_idx").on(table.projectId),
  campaignIdx: index("work_orders_campaign_idx").on(table.campaignId),
  assignedIdx: index("work_orders_assigned_idx").on(table.assignedTo),
  orderNumberIdx: uniqueIndex("work_orders_order_number_idx").on(table.orderNumber),
}));

// Schema for inserting work orders
export const insertWorkOrderSchema = createInsertSchema(workOrders);
export type InsertWorkOrder = z.infer<typeof insertWorkOrderSchema>;
export type WorkOrder = typeof workOrders.$inferSelect;

/**
 * QA Gated Content
 * Universal QA gating registry for all client-facing content
 * (simulations, mock calls, reports, data exports)
 */
export const qaGatedContent = pgTable("qa_gated_content", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),

  // Content identification
  contentType: qaContentTypeEnum("content_type").notNull(),
  contentId: varchar("content_id").notNull(),

  // Context references
  campaignId: varchar("campaign_id").references(() => campaigns.id, { onDelete: 'set null' }),
  clientAccountId: varchar("client_account_id").references(() => clientAccounts.id, { onDelete: 'cascade' }),
  projectId: varchar("project_id").references(() => clientProjects.id, { onDelete: 'set null' }),

  // QA Status
  qaStatus: qaStatusEnum("qa_status").notNull().default('new'),
  qaScore: integer("qa_score"),
  qaNotes: text("qa_notes"),
  qaData: jsonb("qa_data").$type<Record<string, unknown>>(),

  // Review tracking
  reviewedBy: varchar("reviewed_by").references(() => users.id, { onDelete: 'set null' }),
  reviewedAt: timestamp("reviewed_at"),
  autoReviewed: boolean("auto_reviewed").notNull().default(false),

  // Visibility control
  clientVisible: boolean("client_visible").notNull().default(false),
  publishedAt: timestamp("published_at"),

  // Audit
  createdBy: varchar("created_by").references(() => users.id, { onDelete: 'set null' }),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (table) => ({
  contentIdx: index("qa_gated_content_content_idx").on(table.contentType, table.contentId),
  campaignIdx: index("qa_gated_content_campaign_idx").on(table.campaignId),
  clientIdx: index("qa_gated_content_client_idx").on(table.clientAccountId),
  projectIdx: index("qa_gated_content_project_idx").on(table.projectId),
  statusIdx: index("qa_gated_content_status_idx").on(table.qaStatus),
  visibleIdx: index("qa_gated_content_visible_idx").on(table.clientAccountId, table.clientVisible),
  uniqueContentIdx: uniqueIndex("qa_gated_content_unique_idx").on(table.contentType, table.contentId, table.clientAccountId),
}));

/**
 * Client Simulation Sessions
 * Store client-facing AI simulation sessions with QA gating
 */
export const clientSimulationSessions = pgTable("client_simulation_sessions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),

  // References
  clientAccountId: varchar("client_account_id").notNull().references(() => clientAccounts.id, { onDelete: 'cascade' }),
  clientUserId: varchar("client_user_id").references(() => clientUsers.id, { onDelete: 'set null' }),
  campaignId: varchar("campaign_id").references(() => campaigns.id, { onDelete: 'set null' }),
  projectId: varchar("project_id").references(() => clientProjects.id, { onDelete: 'set null' }),

  // Session data
  sessionName: text("session_name"),
  transcript: jsonb("transcript").$type<Array<{ role: string; content: string; timestamp?: string }>>(),
  structuredTranscript: jsonb("structured_transcript"),
  durationSeconds: integer("duration_seconds"),

  // QA gating reference
  qaContentId: varchar("qa_content_id").references(() => qaGatedContent.id, { onDelete: 'set null' }),

  // Configuration used
  simulationConfig: jsonb("simulation_config").$type<{
    persona?: string;
    scenario?: string;
    agentSettings?: Record<string, unknown>;
  }>(),

  // AI evaluation
  evaluationResult: jsonb("evaluation_result").$type<{
    score?: number;
    strengths?: string[];
    improvements?: string[];
    summary?: string;
  }>(),
  evaluationScore: integer("evaluation_score"),

  // Metadata
  metadata: jsonb("metadata").$type<Record<string, unknown>>(),

  // Timestamps
  createdAt: timestamp("created_at").notNull().defaultNow(),
  completedAt: timestamp("completed_at"),
}, (table) => ({
  clientIdx: index("client_simulation_sessions_client_idx").on(table.clientAccountId),
  campaignIdx: index("client_simulation_sessions_campaign_idx").on(table.campaignId),
  projectIdx: index("client_simulation_sessions_project_idx").on(table.projectId),
  qaIdx: index("client_simulation_sessions_qa_idx").on(table.qaContentId),
}));

/**
 * Client Mock Calls
 * Store mock/test calls for client review with QA gating
 */
export const clientMockCalls = pgTable("client_mock_calls", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),

  // References
  clientAccountId: varchar("client_account_id").notNull().references(() => clientAccounts.id, { onDelete: 'cascade' }),
  campaignId: varchar("campaign_id").references(() => campaigns.id, { onDelete: 'set null' }),
  projectId: varchar("project_id").references(() => clientProjects.id, { onDelete: 'set null' }),

  // Call data
  callName: text("call_name"),
  recordingUrl: text("recording_url"),
  recordingS3Key: text("recording_s3_key"),
  transcript: text("transcript"),
  structuredTranscript: jsonb("structured_transcript"),
  durationSeconds: integer("duration_seconds"),

  // Call metadata
  callType: varchar("call_type", { length: 50 }).default('test'), // test, demo, sample
  disposition: varchar("disposition", { length: 100 }),

  // QA gating reference
  qaContentId: varchar("qa_content_id").references(() => qaGatedContent.id, { onDelete: 'set null' }),

  // AI analysis
  aiAnalysis: jsonb("ai_analysis").$type<{
    score?: number;
    qualificationStatus?: string;
    highlights?: string[];
    recommendations?: string[];
  }>(),
  aiScore: integer("ai_score"),

  // Audit
  createdBy: varchar("created_by").references(() => users.id, { onDelete: 'set null' }),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (table) => ({
  clientIdx: index("client_mock_calls_client_idx").on(table.clientAccountId),
  campaignIdx: index("client_mock_calls_campaign_idx").on(table.campaignId),
  qaIdx: index("client_mock_calls_qa_idx").on(table.qaContentId),
}));

/**
 * Client Reports
 * Store generated reports for client delivery with QA gating
 */
export const clientReports = pgTable("client_reports", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),

  // References
  clientAccountId: varchar("client_account_id").notNull().references(() => clientAccounts.id, { onDelete: 'cascade' }),
  campaignId: varchar("campaign_id").references(() => campaigns.id, { onDelete: 'set null' }),
  projectId: varchar("project_id").references(() => clientProjects.id, { onDelete: 'set null' }),

  // Report details
  reportName: text("report_name").notNull(),
  reportType: varchar("report_type", { length: 100 }).notNull(), // performance, lead_summary, call_analytics, email_analytics
  reportPeriodStart: date("report_period_start"),
  reportPeriodEnd: date("report_period_end"),

  // Content
  reportData: jsonb("report_data").notNull().$type<Record<string, unknown>>(),
  reportSummary: text("report_summary"),

  // File storage
  fileUrl: text("file_url"),
  fileFormat: varchar("file_format", { length: 20 }).default('json'), // json, csv, pdf, xlsx
  fileSizeBytes: integer("file_size_bytes"),

  // QA gating reference
  qaContentId: varchar("qa_content_id").references(() => qaGatedContent.id, { onDelete: 'set null' }),

  // Audit
  generatedBy: varchar("generated_by").references(() => users.id, { onDelete: 'set null' }),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (table) => ({
  clientIdx: index("client_reports_client_idx").on(table.clientAccountId),
  campaignIdx: index("client_reports_campaign_idx").on(table.campaignId),
  typeIdx: index("client_reports_type_idx").on(table.reportType),
  qaIdx: index("client_reports_qa_idx").on(table.qaContentId),
}));

// Relations for Client Assignment & QA Gating
export const clientOrganizationLinksRelations = relations(clientOrganizationLinks, ({ one }) => ({
  clientAccount: one(clientAccounts, { fields: [clientOrganizationLinks.clientAccountId], references: [clientAccounts.id] }),
  createdByUser: one(users, { fields: [clientOrganizationLinks.createdBy], references: [users.id] }),
}));

export const qaGatedContentRelations = relations(qaGatedContent, ({ one }) => ({
  campaign: one(campaigns, { fields: [qaGatedContent.campaignId], references: [campaigns.id] }),
  clientAccount: one(clientAccounts, { fields: [qaGatedContent.clientAccountId], references: [clientAccounts.id] }),
  project: one(clientProjects, { fields: [qaGatedContent.projectId], references: [clientProjects.id] }),
  reviewedByUser: one(users, { fields: [qaGatedContent.reviewedBy], references: [users.id] }),
  createdByUser: one(users, { fields: [qaGatedContent.createdBy], references: [users.id] }),
}));

export const clientSimulationSessionsRelations = relations(clientSimulationSessions, ({ one }) => ({
  clientAccount: one(clientAccounts, { fields: [clientSimulationSessions.clientAccountId], references: [clientAccounts.id] }),
  clientUser: one(clientUsers, { fields: [clientSimulationSessions.clientUserId], references: [clientUsers.id] }),
  campaign: one(campaigns, { fields: [clientSimulationSessions.campaignId], references: [campaigns.id] }),
  project: one(clientProjects, { fields: [clientSimulationSessions.projectId], references: [clientProjects.id] }),
  qaContent: one(qaGatedContent, { fields: [clientSimulationSessions.qaContentId], references: [qaGatedContent.id] }),
}));

export const clientMockCallsRelations = relations(clientMockCalls, ({ one }) => ({
  clientAccount: one(clientAccounts, { fields: [clientMockCalls.clientAccountId], references: [clientAccounts.id] }),
  campaign: one(campaigns, { fields: [clientMockCalls.campaignId], references: [campaigns.id] }),
  project: one(clientProjects, { fields: [clientMockCalls.projectId], references: [clientProjects.id] }),
  qaContent: one(qaGatedContent, { fields: [clientMockCalls.qaContentId], references: [qaGatedContent.id] }),
  createdByUser: one(users, { fields: [clientMockCalls.createdBy], references: [users.id] }),
}));

export const clientReportsRelations = relations(clientReports, ({ one }) => ({
  clientAccount: one(clientAccounts, { fields: [clientReports.clientAccountId], references: [clientAccounts.id] }),
  campaign: one(campaigns, { fields: [clientReports.campaignId], references: [campaigns.id] }),
  project: one(clientProjects, { fields: [clientReports.projectId], references: [clientProjects.id] }),
  qaContent: one(qaGatedContent, { fields: [clientReports.qaContentId], references: [qaGatedContent.id] }),
  generatedByUser: one(users, { fields: [clientReports.generatedBy], references: [users.id] }),
}));

// Types for Client Assignment & QA Gating
export type ClientOrganizationLink = typeof clientOrganizationLinks.$inferSelect;
export type InsertClientOrganizationLink = typeof clientOrganizationLinks.$inferInsert;
export type QAGatedContent = typeof qaGatedContent.$inferSelect;
export type InsertQAGatedContent = typeof qaGatedContent.$inferInsert;
export type ClientSimulationSession = typeof clientSimulationSessions.$inferSelect;
export type InsertClientSimulationSession = typeof clientSimulationSessions.$inferInsert;
export type ClientMockCall = typeof clientMockCalls.$inferSelect;
export type InsertClientMockCall = typeof clientMockCalls.$inferInsert;
export type ClientReport = typeof clientReports.$inferSelect;
export type InsertClientReport = typeof clientReports.$inferInsert;

// ==================== END CLIENT ASSIGNMENT & QA GATING SYSTEM ====================

// ==================== END ENHANCED CLIENT PORTAL SYSTEM ====================

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
// PIPELINE ACCOUNTS - TOP OF FUNNEL MANAGEMENT
// ============================================================================

/**
 * Pipeline Accounts - Links accounts to pipelines for top-of-funnel management
 * Enables batch assignment to AEs and buyer journey tracking before opportunity creation
 */
export const pipelineAccounts = pgTable("pipeline_accounts", {
  id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  tenantId: varchar("tenant_id", { length: 36 }),
  pipelineId: varchar("pipeline_id", { length: 36 })
    .notNull()
    .references(() => pipelines.id, { onDelete: 'cascade' }),
  accountId: varchar("account_id", { length: 36 })
    .notNull()
    .references(() => accounts.id, { onDelete: 'cascade' }),

  // AE Assignment
  assignedAeId: varchar("assigned_ae_id", { length: 36 })
    .references(() => users.id, { onDelete: 'set null' }),
  assignedAt: timestamp("assigned_at", { withTimezone: true }),
  assignedBy: varchar("assigned_by", { length: 36 })
    .references(() => users.id, { onDelete: 'set null' }),

  // Buyer Journey Stage
  journeyStage: pipelineAccountStageEnum("journey_stage").default('unassigned').notNull(),
  stageChangedAt: timestamp("stage_changed_at", { withTimezone: true }),

  // AI Scoring (Human-Led, AI-Powered)
  priorityScore: integer("priority_score").default(0), // 0-100, AI-calculated priority
  readinessScore: integer("readiness_score").default(0), // 0-100, AI-calculated readiness
  aiRecommendation: text("ai_recommendation"), // AI suggestion for next action
  aiRecommendedAeId: varchar("ai_recommended_ae_id", { length: 36 })
    .references(() => users.id, { onDelete: 'set null' }),
  aiRecommendationReason: text("ai_recommendation_reason"),

  // Qualification Notes
  qualificationNotes: text("qualification_notes"),
  disqualificationReason: text("disqualification_reason"),

  // Tracking
  lastActivityAt: timestamp("last_activity_at", { withTimezone: true }),
  touchpointCount: integer("touchpoint_count").default(0),

  // Converted opportunity reference
  convertedOpportunityId: varchar("converted_opportunity_id", { length: 36 })
    .references(() => pipelineOpportunities.id, { onDelete: 'set null' }),
  convertedAt: timestamp("converted_at", { withTimezone: true }),

  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => ({
  pipelineIdx: index("pipeline_accounts_pipeline_idx").on(table.pipelineId),
  accountIdx: index("pipeline_accounts_account_idx").on(table.accountId),
  aeIdx: index("pipeline_accounts_ae_idx").on(table.assignedAeId),
  stageIdx: index("pipeline_accounts_stage_idx").on(table.journeyStage),
  priorityIdx: index("pipeline_accounts_priority_idx").on(table.priorityScore.desc()),
  // Unique constraint: one account per pipeline
  uniqueAccountPipeline: uniqueIndex("pipeline_accounts_unique_idx").on(table.pipelineId, table.accountId),
}));

/**
 * AE Assignment Batches - Track batch assignments for audit and analytics
 * Records who assigned which accounts to which AEs and the method used
 */
export const aeAssignmentBatches = pgTable("ae_assignment_batches", {
  id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  tenantId: varchar("tenant_id", { length: 36 }),
  pipelineId: varchar("pipeline_id", { length: 36 })
    .notNull()
    .references(() => pipelines.id, { onDelete: 'cascade' }),

  // Who assigned
  assignedBy: varchar("assigned_by", { length: 36 })
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  assignedAt: timestamp("assigned_at", { withTimezone: true }).defaultNow().notNull(),

  // Assignment details
  assignmentMethod: varchar("assignment_method", { length: 50 }).notNull(), // 'manual', 'ai_recommended', 'round_robin'
  accountCount: integer("account_count").notNull(),
  aeAssignments: jsonb("ae_assignments")
    .$type<Array<{ aeId: string; aeName?: string; accountIds: string[]; count: number }>>()
    .notNull(),

  // AI context (if AI-assisted)
  aiAssisted: boolean("ai_assisted").default(false).notNull(),
  aiReasoningSummary: text("ai_reasoning_summary"),

  notes: text("notes"),
}, (table) => ({
  pipelineIdx: index("ae_assignment_batches_pipeline_idx").on(table.pipelineId),
  assignedByIdx: index("ae_assignment_batches_assigned_by_idx").on(table.assignedBy),
  assignedAtIdx: index("ae_assignment_batches_assigned_at_idx").on(table.assignedAt.desc()),
}));

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
// VECTOR DOCUMENTS (pgvector)
// ========================================

export const vectorDocuments = pgTable("vector_documents", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  sourceType: vectorDocumentTypeEnum("source_type").notNull(),
  sourceId: text("source_id").notNull(),
  content: text("content").notNull(),
  embedding: vector("embedding", { dimensions: 768 }).notNull(),
  metadata: jsonb("metadata").$type<Record<string, any>>().default(sql`'{}'::jsonb`),
  accountId: varchar("account_id", { length: 36 }),
  industry: text("industry"),
  disposition: text("disposition"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => ({
  sourceIdx: uniqueIndex("vector_documents_source_idx").on(table.sourceType, table.sourceId),
  sourceTypeIdx: index("vector_documents_source_type_idx").on(table.sourceType),
  accountIdx: index("vector_documents_account_idx").on(table.accountId),
  industryIdx: index("vector_documents_industry_idx").on(table.industry),
  dispositionIdx: index("vector_documents_disposition_idx").on(table.disposition),
  embeddingHnswIdx: index("vector_documents_embedding_hnsw_idx")
    .using("hnsw", table.embedding.op("vector_cosine_ops")),
  embeddingIvfflatIdx: index("vector_documents_embedding_ivfflat_idx")
    .using("ivfflat", table.embedding.op("vector_cosine_ops"))
    .with({ lists: 100 }),
}));

export const insertVectorDocumentSchema = createInsertSchema(vectorDocuments).omit({ 
  id: true, 
  createdAt: true, 
  updatedAt: true 
});
export type VectorDocumentRecord = typeof vectorDocuments.$inferSelect;
export type InsertVectorDocument = z.infer<typeof insertVectorDocumentSchema>;

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
// Projects table
export const projects = pgTable("projects", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  // Link project to a specific client account
  clientAccountId: varchar("client_account_id").references(() => clientAccounts.id, { onDelete: 'set null' }),
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
  recordingUrl: text("recording_url"), // Legacy: may contain expired Telnyx URL
  telnyxRecordingId: text("telnyx_recording_id"), // Stable Telnyx recording ID for on-demand URL generation
  telnyxCallId: text("telnyx_call_id"), // CRITICAL: Link to Telnyx call control ID for recordings/webhooks
  // Transcript fields (for Gemini Live calls)
  fullTranscript: text("full_transcript"), // Full conversation with speaker labels (Agent/Contact)
  aiTranscript: text("ai_transcript"), // AI agent speech only
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (table) => ({
  dialerRunIdx: index("dialer_call_attempts_dialer_run_idx").on(table.dialerRunId),
  campaignIdx: index("dialer_call_attempts_campaign_idx").on(table.campaignId),
  contactIdx: index("dialer_call_attempts_contact_idx").on(table.contactId),
  agentTypeIdx: index("dialer_call_attempts_agent_type_idx").on(table.agentType),
  dispositionIdx: index("dialer_call_attempts_disposition_idx").on(table.disposition),
  telnyxCallIdIdx: index("dialer_call_attempts_telnyx_call_id_idx").on(table.telnyxCallId),
  createdAtIdx: index("dialer_call_attempts_created_at_idx").on(table.createdAt),
  pendingDispositionIdx: index("dialer_call_attempts_pending_disposition_idx")
    .on(table.disposition, table.dispositionProcessed),
}));

// Participant Call Plans (per contact attempt, derived from account call brief)
export const participantCallPlans = pgTable("participant_call_plans", {
  id: serial("id").primaryKey(),
  workspaceId: varchar("workspace_id"),
  accountId: varchar("account_id").references(() => accounts.id, { onDelete: 'cascade' }).notNull(),
  contactId: varchar("contact_id").references(() => contacts.id, { onDelete: 'cascade' }).notNull(),
  campaignId: varchar("campaign_id").references(() => campaigns.id, { onDelete: 'set null' }),
  callAttemptId: varchar("call_attempt_id").references(() => dialerCallAttempts.id, { onDelete: 'set null' }),
  attemptNumber: integer("attempt_number").notNull().default(1),
  accountCallBriefId: integer("account_call_brief_id").references(() => accountCallBriefs.id, { onDelete: 'set null' }),
  payloadJson: jsonb("payload_json").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (table) => ({
  accountIdx: index("participant_call_plans_account_idx").on(table.accountId),
  contactIdx: index("participant_call_plans_contact_idx").on(table.contactId),
  campaignIdx: index("participant_call_plans_campaign_idx").on(table.campaignId),
  callAttemptIdx: index("participant_call_plans_call_attempt_idx").on(table.callAttemptId),
  createdAtIdx: index("participant_call_plans_created_at_idx").on(table.createdAt),
}));

// Call Memory Notes (account-level)
export const accountCallMemoryNotes = pgTable("account_call_memory_notes", {
  id: serial("id").primaryKey(),
  accountId: varchar("account_id").references(() => accounts.id, { onDelete: 'cascade' }).notNull(),
  callAttemptId: varchar("call_attempt_id").references(() => dialerCallAttempts.id, { onDelete: 'set null' }),
  summary: text("summary"),
  payloadJson: jsonb("payload_json"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (table) => ({
  accountIdx: index("account_call_memory_notes_account_idx").on(table.accountId),
  createdAtIdx: index("account_call_memory_notes_created_at_idx").on(table.createdAt),
}));

// Call Memory Notes (participant-level)
export const participantCallMemoryNotes = pgTable("participant_call_memory_notes", {
  id: serial("id").primaryKey(),
  accountId: varchar("account_id").references(() => accounts.id, { onDelete: 'cascade' }),
  contactId: varchar("contact_id").references(() => contacts.id, { onDelete: 'cascade' }).notNull(),
  callAttemptId: varchar("call_attempt_id").references(() => dialerCallAttempts.id, { onDelete: 'set null' }),
  summary: text("summary"),
  payloadJson: jsonb("payload_json"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (table) => ({
  contactIdx: index("participant_call_memory_notes_contact_idx").on(table.contactId),
  accountIdx: index("participant_call_memory_notes_account_idx").on(table.accountId),
  createdAtIdx: index("participant_call_memory_notes_created_at_idx").on(table.createdAt),
}));

// Call Follow-Up Emails (generated after call)
export const callFollowupEmails = pgTable("call_followup_emails", {
  id: serial("id").primaryKey(),
  accountId: varchar("account_id").references(() => accounts.id, { onDelete: 'cascade' }).notNull(),
  contactId: varchar("contact_id").references(() => contacts.id, { onDelete: 'cascade' }).notNull(),
  campaignId: varchar("campaign_id").references(() => campaigns.id, { onDelete: 'set null' }),
  callAttemptId: varchar("call_attempt_id").references(() => dialerCallAttempts.id, { onDelete: 'set null' }),
  payloadJson: jsonb("payload_json").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (table) => ({
  contactIdx: index("call_followup_emails_contact_idx").on(table.contactId),
  accountIdx: index("call_followup_emails_account_idx").on(table.accountId),
  campaignIdx: index("call_followup_emails_campaign_idx").on(table.campaignId),
  callAttemptIdx: index("call_followup_emails_call_attempt_idx").on(table.callAttemptId),
  createdAtIdx: index("call_followup_emails_created_at_idx").on(table.createdAt),
}));

// Insert Schemas for Unified Console
export const insertDispositionRuleSchema = createInsertSchema(dispositionRules).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertParticipantCallPlanSchema = createInsertSchema(participantCallPlans);
export const insertAccountCallMemoryNoteSchema = createInsertSchema(accountCallMemoryNotes);
export const insertParticipantCallMemoryNoteSchema = createInsertSchema(participantCallMemoryNotes);
export const insertCallFollowupEmailSchema = createInsertSchema(callFollowupEmails);

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

export type ParticipantCallPlan = typeof participantCallPlans.$inferSelect;
export type AccountCallMemoryNote = typeof accountCallMemoryNotes.$inferSelect;
export type ParticipantCallMemoryNote = typeof participantCallMemoryNotes.$inferSelect;
export type CallFollowupEmail = typeof callFollowupEmails.$inferSelect;

// Canonical disposition type for type safety
export type CanonicalDisposition = 'qualified_lead' | 'not_interested' | 'do_not_call' | 'voicemail' | 'no_answer' | 'invalid_data' | 'needs_review' | 'callback_requested';
export type CampaignContactState = 'eligible' | 'locked' | 'waiting_retry' | 'qualified' | 'removed';
export type DialerRunType = 'manual_dial'; // hybrid and ai_agent share manual_dial mechanics
export type DialerRunStatus = 'pending' | 'active' | 'paused' | 'completed' | 'cancelled';

// --- Account Intelligence & Agentic Command Center Schemas ---

// Account Intelligence Results
export const accountIntelligence = pgTable('org_intelligence_profiles', {
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

// Account-Level Intelligence Records (per-target account, versioned)
export const accountIntelligenceRecords = pgTable('account_intelligence', {
  id: serial('id').primaryKey(),
  workspaceId: varchar('workspace_id'),
  accountId: varchar('account_id').references(() => accounts.id, { onDelete: 'cascade' }).notNull(),
  version: integer('version').notNull().default(1),
  sourceFingerprint: text('source_fingerprint').notNull(),
  confidence: real('confidence'),
  payloadJson: jsonb('payload_json').notNull(),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
}, (table) => ({
  accountIdIdx: index('account_intelligence_account_id_idx').on(table.accountId),
  accountVersionUniqueIdx: uniqueIndex('account_intelligence_account_version_idx').on(table.accountId, table.version),
  createdAtIdx: index('account_intelligence_created_at_idx').on(table.createdAt),
}));

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
export const insertAccountIntelligenceRecordSchema = createInsertSchema(accountIntelligenceRecords);
export const insertAgentRunSchema = createInsertSchema(agentRuns);
export const insertAgentStepSchema = createInsertSchema(agentSteps);

export type AccountIntelligence = typeof accountIntelligence.$inferSelect;
export type AccountIntelligenceRecord = typeof accountIntelligenceRecords.$inferSelect;
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

// ==================== PROBLEM INTELLIGENCE SYSTEM - Service Catalog & Problem Framework ====================

/**
 * Campaign Organizations
 * Stores multiple organization profiles that can be selected when creating campaigns
 * Each organization has its own service catalog, problem framework, and intelligence
 *
 * Super Organization (Pivotal B2B):
 * - Always exists and cannot be deleted
 * - Stores platform-level credentials and settings
 * - Only accessible by organization owners
 * - Client organizations are created under the super organization
 */
export const campaignOrganizations = pgTable('campaign_organizations', {
  id: varchar('id').primaryKey().default(sql`gen_random_uuid()`),

  // Organization Identity
  name: text('name').notNull(), // e.g., "Pivotal B2B"
  domain: text('domain'), // e.g., "pivotalb2b.com"
  description: text('description'),
  industry: text('industry'),
  logoUrl: text('logo_url'),

  // Organization Type & Hierarchy
  organizationType: organizationTypeEnum('organization_type').notNull().default('client'),
  // 'super' = Pivotal B2B (platform owner), 'client' = Client organizations

  parentOrganizationId: varchar('parent_organization_id'),
  // For client organizations, references the super organization
  // Super organization has null parentOrganizationId

  // Organization Intelligence (JSONB - structured)
  identity: jsonb('identity').notNull().default('{}'),
  // Structure: { legalName, description, industry, employees, regions, foundedYear }

  offerings: jsonb('offerings').notNull().default('{}'),
  // Structure: { coreProducts, useCases, problemsSolved, differentiators }

  icp: jsonb('icp').notNull().default('{}'),
  // Structure: { industries, personas, objections, companySize }

  positioning: jsonb('positioning').notNull().default('{}'),
  // Structure: { oneLiner, valueProposition, competitors, whyUs }

  outreach: jsonb('outreach').notNull().default('{}'),
  // Structure: { emailAngles, callOpeners, objectionHandlers }

  // Compiled prompt-ready context
  compiledOrgContext: text('compiled_org_context'),

  // Status
  isDefault: boolean('is_default').notNull().default(false), // Default org for new campaigns
  isActive: boolean('is_active').notNull().default(true),

  // Audit
  createdBy: varchar('created_by').references(() => users.id, { onDelete: 'set null' }),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
}, (table) => ({
  nameIdx: index('campaign_organizations_name_idx').on(table.name),
  domainIdx: index('campaign_organizations_domain_idx').on(table.domain),
  activeIdx: index('campaign_organizations_active_idx').on(table.isActive),
  defaultIdx: index('campaign_organizations_default_idx').on(table.isDefault),
  typeIdx: index('campaign_organizations_type_idx').on(table.organizationType),
  parentIdx: index('campaign_organizations_parent_idx').on(table.parentOrganizationId),
}));

/**
 * Organization Members
 * Junction table linking users to organizations with specific roles
 * Controls who can access which organization and at what level
 *
 * For Super Organization: Only 'owner' role users can access admin settings
 */
export const organizationMembers = pgTable('organization_members', {
  id: varchar('id').primaryKey().default(sql`gen_random_uuid()`),

  // Foreign keys
  organizationId: varchar('organization_id').notNull().references(() => campaignOrganizations.id, { onDelete: 'cascade' }),
  userId: varchar('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),

  // Member role within this organization
  role: organizationMemberRoleEnum('role').notNull().default('member'),

  // Audit
  invitedBy: varchar('invited_by').references(() => users.id, { onDelete: 'set null' }),
  joinedAt: timestamp('joined_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
}, (table) => ({
  orgUserIdx: uniqueIndex('organization_members_org_user_idx').on(table.organizationId, table.userId),
  orgIdx: index('organization_members_org_idx').on(table.organizationId),
  userIdx: index('organization_members_user_idx').on(table.userId),
  roleIdx: index('organization_members_role_idx').on(table.role),
}));

/**
 * Super Organization Credentials
 * Secure storage for platform-level API keys and credentials
 * Only accessible by super organization owners
 *
 * These credentials are used for platform-wide integrations:
 * - AI providers (OpenAI, Anthropic, Google)
 * - Telephony providers (Telnyx, Twilio)
 * - Email services (SendGrid, Mailgun)
 * - Cloud storage (AWS, GCP)
 */
export const superOrgCredentials = pgTable('super_org_credentials', {
  id: varchar('id').primaryKey().default(sql`gen_random_uuid()`),

  // Reference to super organization
  organizationId: varchar('organization_id').notNull().references(() => campaignOrganizations.id, { onDelete: 'cascade' }),

  // Credential identity
  name: text('name').notNull(), // Human-readable name (e.g., "OpenAI Production Key")
  key: text('key').notNull(), // Unique key identifier (e.g., "OPENAI_API_KEY")
  category: text('category').notNull(), // Category for grouping (e.g., "ai", "telephony", "email")

  // Credential value (encrypted at rest)
  value: text('value').notNull(), // The actual credential value

  // Metadata
  description: text('description'), // Optional description
  isActive: boolean('is_active').notNull().default(true),
  expiresAt: timestamp('expires_at'), // Optional expiration

  // Audit
  createdBy: varchar('created_by').references(() => users.id, { onDelete: 'set null' }),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
  lastUsedAt: timestamp('last_used_at'),
}, (table) => ({
  orgIdx: index('super_org_credentials_org_idx').on(table.organizationId),
  keyIdx: uniqueIndex('super_org_credentials_key_idx').on(table.organizationId, table.key),
  categoryIdx: index('super_org_credentials_category_idx').on(table.category),
  activeIdx: index('super_org_credentials_active_idx').on(table.isActive),
}));

/**
 * Service Category Enum
 * Categories for organizing services in the catalog
 */
export const serviceCategoryEnum = pgEnum('service_category', [
  'platform',
  'consulting',
  'integration',
  'managed_service',
  'data',
  'other'
]);

/**
 * Problem Category Enum
 * Categories for classifying business problems
 */
export const problemCategoryEnum = pgEnum('problem_category', [
  'efficiency',
  'growth',
  'risk',
  'cost',
  'compliance',
  'innovation'
]);

/**
 * Problem Severity Enum
 */
export const problemSeverityEnum = pgEnum('problem_severity', [
  'high',
  'medium',
  'low'
]);

/**
 * Outreach Approach Enum
 */
export const outreachApproachEnum = pgEnum('outreach_approach', [
  'exploratory',
  'consultative',
  'direct',
  'educational'
]);

/**
 * Organization Service Catalog
 * Master organization-level service catalog with problem mappings
 * Defines what services the organization offers and what problems they solve
 */
export const organizationServiceCatalog = pgTable('organization_service_catalog', {
  id: serial('id').primaryKey(),

  // Organization Reference (which org this service belongs to)
  organizationId: varchar('organization_id').references(() => campaignOrganizations.id, { onDelete: 'cascade' }),

  // Service/Capability Definition
  serviceName: text('service_name').notNull(),
  serviceCategory: serviceCategoryEnum('service_category').default('other'),
  serviceDescription: text('service_description'),

  // Problems This Service Solves (JSONB array)
  // Structure: [{ id, problemStatement, symptoms: [{id, description, dataSource, detectionLogic}], impactAreas: [{id, area, description, severity}], severity }]
  problemsSolved: jsonb('problems_solved').notNull().default('[]'),

  // Differentiators for this specific service
  // Structure: [{ id, claim, proof, competitorGap }]
  differentiators: jsonb('differentiators').notNull().default('[]'),

  // Value Propositions
  // Structure: [{ id, headline, description, targetPersona, quantifiedValue }]
  valuePropositions: jsonb('value_propositions').notNull().default('[]'),

  // Target Industries/Verticals for this service
  targetIndustries: text('target_industries').array(),
  targetPersonas: text('target_personas').array(),

  // Ordering and status
  displayOrder: integer('display_order').default(0),
  isActive: boolean('is_active').notNull().default(true),

  // Audit
  createdBy: varchar('created_by').references(() => users.id, { onDelete: 'set null' }),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
}, (table) => ({
  orgIdx: index('org_service_catalog_org_idx').on(table.organizationId),
  serviceNameIdx: index('org_service_catalog_name_idx').on(table.serviceName),
  categoryIdx: index('org_service_catalog_category_idx').on(table.serviceCategory),
  activeIdx: index('org_service_catalog_active_idx').on(table.isActive),
}));

/**
 * Problem Definitions
 * Structured problem framework definitions with detection rules
 * Used for automatic problem detection based on account signals
 */
export const problemDefinitions = pgTable('problem_definitions', {
  id: serial('id').primaryKey(),

  // Organization Reference (which org this problem belongs to)
  organizationId: varchar('organization_id').references(() => campaignOrganizations.id, { onDelete: 'cascade' }),

  // Problem Statement
  problemStatement: text('problem_statement').notNull(),
  problemCategory: problemCategoryEnum('problem_category').default('efficiency'),

  // Symptoms/Indicators (how to detect this problem)
  // Structure: [{ id, symptomDescription, dataSource: "firmographic"|"tech_stack"|"intent"|"behavioral"|"industry", detectionLogic }]
  symptoms: jsonb('symptoms').notNull().default('[]'),

  // Impact Areas
  // Structure: [{ id, area: "Revenue"|"Cost"|"Risk"|"Efficiency"|"Growth"|"Compliance", description, severity }]
  impactAreas: jsonb('impact_areas').notNull().default('[]'),

  // Associated Services (many-to-many via serviceIds array)
  serviceIds: integer('service_ids').array(),

  // Messaging Templates for this problem
  // Structure: [{ id, angle, openingLine, followUp, persona }]
  messagingAngles: jsonb('messaging_angles').notNull().default('[]'),

  // Detection Rules (for automated matching against account data)
  // Structure: { industries: [], techStack: { required: [], absent: [] }, firmographics: { minRevenue, maxRevenue, minEmployees, maxEmployees, regions: [] }, intentSignals: [] }
  detectionRules: jsonb('detection_rules').notNull().default('{}'),

  // Status
  isActive: boolean('is_active').notNull().default(true),

  // Audit
  createdBy: varchar('created_by').references(() => users.id, { onDelete: 'set null' }),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
}, (table) => ({
  orgIdx: index('problem_definitions_org_idx').on(table.organizationId),
  categoryIdx: index('problem_definitions_category_idx').on(table.problemCategory),
  activeIdx: index('problem_definitions_active_idx').on(table.isActive),
}));

/**
 * Campaign Service Customizations
 * Per-campaign customization of services (extends master catalog)
 * Allows campaigns to override or extend master service definitions
 */
export const campaignServiceCustomizations = pgTable('campaign_service_customizations', {
  id: serial('id').primaryKey(),

  // Campaign & Service binding
  campaignId: varchar('campaign_id').references(() => campaigns.id, { onDelete: 'cascade' }).notNull(),
  serviceId: integer('service_id').references(() => organizationServiceCatalog.id, { onDelete: 'cascade' }).notNull(),

  // Campaign-specific overrides (null = use master)
  customProblemsSolved: jsonb('custom_problems_solved'), // Override or extend master problems
  customDifferentiators: jsonb('custom_differentiators'),
  customValuePropositions: jsonb('custom_value_propositions'),

  // Campaign-specific focus
  isPrimaryService: boolean('is_primary_service').default(false),
  focusWeight: integer('focus_weight').default(50), // 0-100, how much to emphasize this service

  // Audit
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
}, (table) => ({
  campaignServiceUniq: uniqueIndex('campaign_service_customizations_uniq').on(table.campaignId, table.serviceId),
  campaignIdx: index('campaign_service_customizations_campaign_idx').on(table.campaignId),
}));

/**
 * Campaign Account Problems
 * Generated problem intelligence per account per campaign
 * Stores detected problems, gap analysis, and messaging recommendations
 */
export const campaignAccountProblems = pgTable('campaign_account_problems', {
  id: serial('id').primaryKey(),

  // Campaign & Account binding
  campaignId: varchar('campaign_id').references(() => campaigns.id, { onDelete: 'cascade' }).notNull(),
  accountId: varchar('account_id').references(() => accounts.id, { onDelete: 'cascade' }).notNull(),

  // Generated Problem Intelligence (JSONB)
  // Structure: [{ problemId, problemStatement, confidence, detectionSignals: [{signalType, signalValue, matchedRule, contribution}], relevantServices: [], messagingAngles: [] }]
  detectedProblems: jsonb('detected_problems').notNull().default('[]'),

  // Gap Analysis Results
  // Structure: { capabilities: [{ capability, accountGap, ourSolution, confidence }], prioritizedGaps: [] }
  gapAnalysis: jsonb('gap_analysis').notNull().default('{}'),

  // Messaging Package
  // Structure: { primaryAngle, secondaryAngles: [], openingLines: [], objectionPrep: [{objection, response, proofPoint}], proofPoints: [] }
  messagingPackage: jsonb('messaging_package').notNull().default('{}'),

  // Outreach Strategy
  // Structure: { recommendedApproach: "exploratory"|"consultative"|"direct"|"educational", talkingPoints: [], questionsToAsk: [], doNotMention: [] }
  outreachStrategy: jsonb('outreach_strategy').notNull().default('{}'),

  // Generation Metadata
  generatedAt: timestamp('generated_at').notNull().defaultNow(),
  generationModel: text('generation_model'),
  sourceFingerprint: text('source_fingerprint'), // Hash of inputs for cache invalidation
  confidence: real('confidence'),

  // Refresh tracking
  lastRefreshedAt: timestamp('last_refreshed_at'),
  refreshCount: integer('refresh_count').default(0),

  // Audit
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
}, (table) => ({
  campaignAccountUniq: uniqueIndex('campaign_account_problems_uniq').on(table.campaignId, table.accountId),
  campaignIdx: index('campaign_account_problems_campaign_idx').on(table.campaignId),
  accountIdx: index('campaign_account_problems_account_idx').on(table.accountId),
  generatedAtIdx: index('campaign_account_problems_generated_at_idx').on(table.generatedAt),
}));

// Insert schemas for Problem Intelligence System
export const insertCampaignOrganizationSchema = createInsertSchema(campaignOrganizations).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertOrganizationServiceCatalogSchema = createInsertSchema(organizationServiceCatalog).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertProblemDefinitionSchema = createInsertSchema(problemDefinitions).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertCampaignServiceCustomizationSchema = createInsertSchema(campaignServiceCustomizations).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertCampaignAccountProblemSchema = createInsertSchema(campaignAccountProblems).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

// Types for Problem Intelligence System
export type CampaignOrganization = typeof campaignOrganizations.$inferSelect;
export type InsertCampaignOrganization = z.infer<typeof insertCampaignOrganizationSchema>;

export type OrganizationServiceCatalogEntry = typeof organizationServiceCatalog.$inferSelect;
export type InsertOrganizationServiceCatalogEntry = z.infer<typeof insertOrganizationServiceCatalogSchema>;

export type ProblemDefinition = typeof problemDefinitions.$inferSelect;
export type InsertProblemDefinition = z.infer<typeof insertProblemDefinitionSchema>;

export type CampaignServiceCustomization = typeof campaignServiceCustomizations.$inferSelect;
export type InsertCampaignServiceCustomization = z.infer<typeof insertCampaignServiceCustomizationSchema>;

export type CampaignAccountProblem = typeof campaignAccountProblems.$inferSelect;
export type InsertCampaignAccountProblem = z.infer<typeof insertCampaignAccountProblemSchema>;

// Enums as TypeScript types
export type ServiceCategory = 'platform' | 'consulting' | 'integration' | 'managed_service' | 'data' | 'other';
export type ProblemCategory = 'efficiency' | 'growth' | 'risk' | 'cost' | 'compliance' | 'innovation';
export type ProblemSeverity = 'high' | 'medium' | 'low';
export type OutreachApproach = 'exploratory' | 'consultative' | 'direct' | 'educational';

// ==================== CAMPAIGN TEST CALLS - Test AI Agent Calls with Monitoring ====================

/**
 * Test Call Status Enum
 * - pending: Test call initiated but not yet answered
 * - in_progress: Test call is active with AI agent
 * - completed: Test call finished successfully
 * - failed: Test call failed (network, timeout, etc.)
 */
export const testCallStatusEnum = pgEnum('test_call_status', [
  'pending',
  'in_progress',
  'completed',
  'failed'
]);

/**
 * Campaign Test Calls - Track test calls for AI campaigns
 * Used to validate AI agent behavior before launching live campaigns
 */
export const campaignTestCalls = pgTable('campaign_test_calls', {
  id: varchar('id').primaryKey().default(sql`gen_random_uuid()`),
  campaignId: varchar('campaign_id').references(() => campaigns.id, { onDelete: 'cascade' }).notNull(),
  virtualAgentId: varchar('virtual_agent_id').references(() => virtualAgents.id, { onDelete: 'set null' }),

  // Test contact details
  testPhoneNumber: text('test_phone_number').notNull(),
  testContactName: text('test_contact_name').notNull(),
  testCompanyName: text('test_company_name'),
  testJobTitle: text('test_job_title'),
  testContactEmail: text('test_contact_email'),
  customVariables: jsonb('custom_variables'), // Any additional variables for the AI agent

  // Call tracking
  callControlId: text('call_control_id'),
  callSessionId: varchar('call_session_id').references(() => callSessions.id, { onDelete: 'set null' }),
  status: testCallStatusEnum('status').notNull().default('pending'),

  // Call timing
  initiatedAt: timestamp('initiated_at').notNull().defaultNow(),
  answeredAt: timestamp('answered_at'),
  endedAt: timestamp('ended_at'),
  durationSeconds: integer('duration_seconds'),

  // Transcript and analysis
  fullTranscript: text('full_transcript'),
  transcriptTurns: jsonb('transcript_turns'), // [{role: 'agent'|'contact', text: string, timestamp: Date}]

  // AI Performance Metrics
  aiPerformanceMetrics: jsonb('ai_performance_metrics'), // {
  //   identityConfirmed: boolean,
  //   gatekeeperHandled: boolean,
  //   pitchDelivered: boolean,
  //   objectionHandled: boolean,
  //   closingAttempted: boolean,
  //   conversationStatesReached: string[],
  //   responseLatencyAvgMs: number,
  //   tokensUsed: number,
  //   estimatedCost: number
  // }

  // Detected Issues and Suggestions
  detectedIssues: jsonb('detected_issues'), // [{type: string, severity: 'low'|'medium'|'high', description: string, suggestion: string}]
  promptImprovementSuggestions: jsonb('prompt_improvement_suggestions'), // AI-generated suggestions for improving the agent prompt

  // Outcome
  disposition: canonicalDispositionEnum('disposition'),
  callSummary: text('call_summary'),
  testResult: text('test_result'), // 'success'|'needs_improvement'|'failed'
  testNotes: text('test_notes'), // Tester's notes

  // Recording
  recordingUrl: text('recording_url'),

  // Metadata
  testedBy: varchar('tested_by').references(() => users.id, { onDelete: 'set null' }),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
}, (table) => ({
  campaignIdx: index('campaign_test_calls_campaign_idx').on(table.campaignId),
  virtualAgentIdx: index('campaign_test_calls_virtual_agent_idx').on(table.virtualAgentId),
  statusIdx: index('campaign_test_calls_status_idx').on(table.status),
  createdAtIdx: index('campaign_test_calls_created_at_idx').on(table.createdAt),
}));

// Insert schema for Campaign Test Calls
export const insertCampaignTestCallSchema = createInsertSchema(campaignTestCalls).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

// Types for Campaign Test Calls
export type CampaignTestCall = typeof campaignTestCalls.$inferSelect;
export type InsertCampaignTestCall = z.infer<typeof insertCampaignTestCallSchema>;

// Test Call Status type
export type TestCallStatus = 'pending' | 'in_progress' | 'completed' | 'failed';
export type TestCallResult = 'success' | 'needs_improvement' | 'failed';

// ==================== PREVIEW STUDIO - Preview and Test Campaign Content ====================
// NOTE: Enums are defined near the previewStudioSessions table (earlier in file).
// This section adds the related tables (transcripts and generated content).

/**
 * Preview Simulation Transcripts - Store transcripts from voice simulations
 */
export const previewSimulationTranscripts = pgTable('preview_simulation_transcripts', {
  id: varchar('id').primaryKey().default(sql`gen_random_uuid()`),
  sessionId: varchar('session_id').references(() => previewStudioSessions.id, { onDelete: 'cascade' }).notNull(),
  role: previewTranscriptRoleEnum('role').notNull(),
  content: text('content').notNull(),
  timestampMs: integer('timestamp_ms').notNull(), // Milliseconds from session start
  audioDurationMs: integer('audio_duration_ms'), // Duration of audio if applicable
  metadata: jsonb('metadata'), // Additional metadata (e.g., confidence, tokens)
  createdAt: timestamp('created_at').notNull().defaultNow(),
}, (table) => ({
  sessionIdx: index('preview_transcripts_session_idx').on(table.sessionId),
  roleIdx: index('preview_transcripts_role_idx').on(table.role),
  timestampIdx: index('preview_transcripts_timestamp_idx').on(table.timestampMs),
}));

/**
 * Preview Generated Content - Store generated emails, call plans, prompts
 */
export const previewGeneratedContent = pgTable('preview_generated_content', {
  id: varchar('id').primaryKey().default(sql`gen_random_uuid()`),
  sessionId: varchar('session_id').references(() => previewStudioSessions.id, { onDelete: 'cascade' }).notNull(),
  contentType: previewContentTypeEnum('content_type').notNull(),
  content: jsonb('content').notNull(), // The actual generated content
  qualityScore: numeric('quality_score', { precision: 5, scale: 2 }), // 0-100 quality score
  regenerationCount: integer('regeneration_count').notNull().default(0),
  createdAt: timestamp('created_at').notNull().defaultNow(),
}, (table) => ({
  sessionIdx: index('preview_content_session_idx').on(table.sessionId),
  typeIdx: index('preview_content_type_idx').on(table.contentType),
}));

// Relations for Preview Studio
export const previewStudioSessionsRelations = relations(previewStudioSessions, ({ one, many }) => ({
  campaign: one(campaigns, {
    fields: [previewStudioSessions.campaignId],
    references: [campaigns.id],
  }),
  account: one(accounts, {
    fields: [previewStudioSessions.accountId],
    references: [accounts.id],
  }),
  contact: one(contacts, {
    fields: [previewStudioSessions.contactId],
    references: [contacts.id],
  }),
  createdByUser: one(users, {
    fields: [previewStudioSessions.createdBy],
    references: [users.id],
  }),
  transcripts: many(previewSimulationTranscripts),
  generatedContent: many(previewGeneratedContent),
}));

export const previewSimulationTranscriptsRelations = relations(previewSimulationTranscripts, ({ one }) => ({
  session: one(previewStudioSessions, {
    fields: [previewSimulationTranscripts.sessionId],
    references: [previewStudioSessions.id],
  }),
}));

export const previewGeneratedContentRelations = relations(previewGeneratedContent, ({ one }) => ({
  session: one(previewStudioSessions, {
    fields: [previewGeneratedContent.sessionId],
    references: [previewStudioSessions.id],
  }),
}));

// Insert schemas for Preview Studio related tables
export const insertPreviewSimulationTranscriptSchema = createInsertSchema(previewSimulationTranscripts).omit({
  id: true,
  createdAt: true,
});

export const insertPreviewGeneratedContentSchema = createInsertSchema(previewGeneratedContent).omit({
  id: true,
  createdAt: true,
});

// Types for Preview Studio related tables
export type PreviewSimulationTranscript = typeof previewSimulationTranscripts.$inferSelect;
export type InsertPreviewSimulationTranscript = z.infer<typeof insertPreviewSimulationTranscriptSchema>;

export type PreviewGeneratedContent = typeof previewGeneratedContent.$inferSelect;
export type InsertPreviewGeneratedContent = z.infer<typeof insertPreviewGeneratedContentSchema>;

export type PreviewSessionType = 'context' | 'email' | 'call_plan' | 'simulation';
export type PreviewSessionStatus = 'active' | 'completed' | 'error';
export type PreviewTranscriptRole = 'user' | 'assistant' | 'system';
export type PreviewContentType = 'email' | 'call_plan' | 'prompt' | 'call_brief' | 'participant_plan';

// ==================== KNOWLEDGE BLOCKS - Modular, Versioned Agent Knowledge ====================

/**
 * Knowledge Block Category Enum
 * Categories for organizing knowledge blocks
 */
export const knowledgeBlockCategoryEnum = pgEnum('knowledge_block_category', [
  'universal',       // Universal knowledge for all agents
  'voice_control',   // Voice agent control instructions
  'organization',    // Organization-specific context
  'campaign',        // Campaign-specific context
  'custom'           // User-defined custom blocks
]);

/**
 * Knowledge Block Layer Enum
 * Determines injection order in prompt assembly
 */
export const knowledgeBlockLayerEnum = pgEnum('knowledge_block_layer', [
  'layer_1_universal',    // Foundation - always first
  'layer_2_organization', // Organization context - second
  'layer_3_campaign'      // Campaign-specific - third
]);

/**
 * Knowledge Blocks - Modular, versioned knowledge units
 * Core building blocks for agent prompts that can be edited at runtime
 */
export const knowledgeBlocks = pgTable('knowledge_blocks', {
  id: serial('id').primaryKey(),

  // Identity
  name: varchar('name', { length: 255 }).notNull(),
  slug: varchar('slug', { length: 100 }).notNull().unique(),
  description: text('description'),

  // Classification
  category: knowledgeBlockCategoryEnum('category').notNull(),
  layer: knowledgeBlockLayerEnum('layer').notNull(),

  // Content
  content: text('content').notNull(),
  tokenEstimate: integer('token_estimate'),

  // Status
  isActive: boolean('is_active').notNull().default(true),
  isSystem: boolean('is_system').notNull().default(false), // System blocks can't be deleted

  // Versioning
  version: integer('version').notNull().default(1),

  // Audit
  createdBy: varchar('created_by').references(() => users.id, { onDelete: 'set null' }),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
}, (table) => ({
  slugIdx: uniqueIndex('knowledge_blocks_slug_idx').on(table.slug),
  categoryIdx: index('knowledge_blocks_category_idx').on(table.category),
  layerIdx: index('knowledge_blocks_layer_idx').on(table.layer),
  activeIdx: index('knowledge_blocks_active_idx').on(table.isActive),
}));

/**
 * Knowledge Block Versions - Version history for knowledge blocks
 * Tracks all changes to knowledge blocks for audit and rollback
 */
export const knowledgeBlockVersions = pgTable('knowledge_block_versions', {
  id: serial('id').primaryKey(),

  // Block reference
  blockId: integer('block_id').references(() => knowledgeBlocks.id, { onDelete: 'cascade' }).notNull(),
  version: integer('version').notNull(),

  // Content snapshot
  content: text('content').notNull(),
  tokenEstimate: integer('token_estimate'),

  // Change metadata
  changeReason: text('change_reason'),
  changedBy: varchar('changed_by').references(() => users.id, { onDelete: 'set null' }),

  // Audit
  createdAt: timestamp('created_at').notNull().defaultNow(),
}, (table) => ({
  blockVersionIdx: uniqueIndex('knowledge_block_versions_block_version_idx').on(table.blockId, table.version),
  blockIdx: index('knowledge_block_versions_block_idx').on(table.blockId),
  createdAtIdx: index('knowledge_block_versions_created_at_idx').on(table.createdAt),
}));

/**
 * Agent Knowledge Config - Per-agent knowledge block configuration
 * Allows enabling/disabling blocks or overriding content per agent
 */
export const agentKnowledgeConfig = pgTable('agent_knowledge_config', {
  id: serial('id').primaryKey(),

  // Agent reference
  virtualAgentId: varchar('virtual_agent_id').references(() => virtualAgents.id, { onDelete: 'cascade' }).notNull(),

  // Block reference
  blockId: integer('block_id').references(() => knowledgeBlocks.id, { onDelete: 'cascade' }).notNull(),

  // Configuration
  isEnabled: boolean('is_enabled').notNull().default(true),
  overrideContent: text('override_content'), // Optional per-agent override
  priority: integer('priority').notNull().default(0), // For ordering within same layer

  // Audit
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
}, (table) => ({
  agentBlockIdx: uniqueIndex('agent_knowledge_config_agent_block_idx').on(table.virtualAgentId, table.blockId),
  agentIdx: index('agent_knowledge_config_agent_idx').on(table.virtualAgentId),
  blockIdx: index('agent_knowledge_config_block_idx').on(table.blockId),
}));

/**
 * Prompt Execution Log - Audit trail for prompt executions
 * Logs every prompt sent to models for debugging and compliance
 */
export const promptExecutionLogs = pgTable('prompt_execution_logs', {
  id: varchar('id').primaryKey().default(sql`gen_random_uuid()`),

  // Context
  virtualAgentId: varchar('virtual_agent_id').references(() => virtualAgents.id, { onDelete: 'set null' }),
  campaignId: varchar('campaign_id').references(() => campaigns.id, { onDelete: 'set null' }),
  callSessionId: varchar('call_session_id'),

  // Prompt details
  promptHash: varchar('prompt_hash', { length: 64 }), // SHA-256 hash for deduplication
  totalTokens: integer('total_tokens'),

  // Block versions used
  blockVersions: jsonb('block_versions'), // [{blockId, version, name}]

  // Environment
  environment: varchar('environment', { length: 20 }), // local, staging, production

  // Audit
  executedAt: timestamp('executed_at').notNull().defaultNow(),
}, (table) => ({
  agentIdx: index('prompt_execution_logs_agent_idx').on(table.virtualAgentId),
  campaignIdx: index('prompt_execution_logs_campaign_idx').on(table.campaignId),
  sessionIdx: index('prompt_execution_logs_session_idx').on(table.callSessionId),
  executedAtIdx: index('prompt_execution_logs_executed_at_idx').on(table.executedAt),
  hashIdx: index('prompt_execution_logs_hash_idx').on(table.promptHash),
}));

// Relations for Knowledge Blocks
export const knowledgeBlocksRelations = relations(knowledgeBlocks, ({ one, many }) => ({
  createdByUser: one(users, {
    fields: [knowledgeBlocks.createdBy],
    references: [users.id],
  }),
  versions: many(knowledgeBlockVersions),
  agentConfigs: many(agentKnowledgeConfig),
}));

export const knowledgeBlockVersionsRelations = relations(knowledgeBlockVersions, ({ one }) => ({
  block: one(knowledgeBlocks, {
    fields: [knowledgeBlockVersions.blockId],
    references: [knowledgeBlocks.id],
  }),
  changedByUser: one(users, {
    fields: [knowledgeBlockVersions.changedBy],
    references: [users.id],
  }),
}));

export const agentKnowledgeConfigRelations = relations(agentKnowledgeConfig, ({ one }) => ({
  virtualAgent: one(virtualAgents, {
    fields: [agentKnowledgeConfig.virtualAgentId],
    references: [virtualAgents.id],
  }),
  block: one(knowledgeBlocks, {
    fields: [agentKnowledgeConfig.blockId],
    references: [knowledgeBlocks.id],
  }),
}));

export const promptExecutionLogsRelations = relations(promptExecutionLogs, ({ one }) => ({
  virtualAgent: one(virtualAgents, {
    fields: [promptExecutionLogs.virtualAgentId],
    references: [virtualAgents.id],
  }),
  campaign: one(campaigns, {
    fields: [promptExecutionLogs.campaignId],
    references: [campaigns.id],
  }),
}));

// Insert schemas for Knowledge Blocks
export const insertKnowledgeBlockSchema = createInsertSchema(knowledgeBlocks).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertKnowledgeBlockVersionSchema = createInsertSchema(knowledgeBlockVersions).omit({
  id: true,
  createdAt: true,
});

export const insertAgentKnowledgeConfigSchema = createInsertSchema(agentKnowledgeConfig).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertPromptExecutionLogSchema = createInsertSchema(promptExecutionLogs).omit({
  id: true,
  executedAt: true,
});

// Types for Knowledge Blocks
export type KnowledgeBlock = typeof knowledgeBlocks.$inferSelect;
export type InsertKnowledgeBlock = z.infer<typeof insertKnowledgeBlockSchema>;

export type KnowledgeBlockVersion = typeof knowledgeBlockVersions.$inferSelect;
export type InsertKnowledgeBlockVersion = z.infer<typeof insertKnowledgeBlockVersionSchema>;

export type AgentKnowledgeConfig = typeof agentKnowledgeConfig.$inferSelect;
export type InsertAgentKnowledgeConfig = z.infer<typeof insertAgentKnowledgeConfigSchema>;

export type PromptExecutionLog = typeof promptExecutionLogs.$inferSelect;
export type InsertPromptExecutionLog = z.infer<typeof insertPromptExecutionLogSchema>;

// Type aliases for enums
export type KnowledgeBlockCategory = 'universal' | 'voice_control' | 'organization' | 'campaign' | 'custom';
export type KnowledgeBlockLayer = 'layer_1_universal' | 'layer_2_organization' | 'layer_3_campaign';

/**
 * Voice Provider Enum
 * Specifies which AI voice provider to use for prompt assembly
 */
export const voiceProviderEnum = pgEnum('voice_provider', [
  'openai',       // OpenAI Realtime API
  'google',       // Google Gemini / Vertex AI
]);

/**
 * Campaign Knowledge Config - Per-campaign knowledge block configuration
 * Allows campaigns to enable/disable or override knowledge blocks
 */
export const campaignKnowledgeConfig = pgTable('campaign_knowledge_config', {
  id: serial('id').primaryKey(),

  // Campaign reference
  campaignId: varchar('campaign_id').references(() => campaigns.id, { onDelete: 'cascade' }).notNull(),

  // Block reference
  blockId: integer('block_id').references(() => knowledgeBlocks.id, { onDelete: 'cascade' }).notNull(),

  // Configuration
  isEnabled: boolean('is_enabled').notNull().default(true),
  overrideContent: text('override_content'), // Optional per-campaign override
  priority: integer('priority').notNull().default(0), // For ordering within same layer

  // Provider-specific overrides (optional)
  openaiOverride: text('openai_override'), // Override for OpenAI provider
  googleOverride: text('google_override'), // Override for Gemini/Vertex AI

  // Audit
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
}, (table) => ({
  campaignBlockIdx: uniqueIndex('campaign_knowledge_config_campaign_block_idx').on(table.campaignId, table.blockId),
  campaignIdx: index('campaign_knowledge_config_campaign_idx').on(table.campaignId),
  blockIdx: index('campaign_knowledge_config_block_idx').on(table.blockId),
}));

// Relations for Campaign Knowledge Config
export const campaignKnowledgeConfigRelations = relations(campaignKnowledgeConfig, ({ one }) => ({
  campaign: one(campaigns, {
    fields: [campaignKnowledgeConfig.campaignId],
    references: [campaigns.id],
  }),
  block: one(knowledgeBlocks, {
    fields: [campaignKnowledgeConfig.blockId],
    references: [knowledgeBlocks.id],
  }),
}));

// Insert schema for Campaign Knowledge Config
export const insertCampaignKnowledgeConfigSchema = createInsertSchema(campaignKnowledgeConfig).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

// Types for Campaign Knowledge Config
export type CampaignKnowledgeConfig = typeof campaignKnowledgeConfig.$inferSelect;
export type InsertCampaignKnowledgeConfig = z.infer<typeof insertCampaignKnowledgeConfigSchema>;

// Voice Provider type
export type VoiceProvider = 'openai' | 'google';

// ==================== SUPER ORGANIZATION TYPES ====================

// Insert schemas for Organization Members
export const insertOrganizationMemberSchema = createInsertSchema(organizationMembers).omit({
  id: true,
  joinedAt: true,
  updatedAt: true,
});

// Insert schemas for Super Org Credentials
export const insertSuperOrgCredentialSchema = createInsertSchema(superOrgCredentials).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
  lastUsedAt: true,
});

// Types for Organization Members
export type OrganizationMember = typeof organizationMembers.$inferSelect;
export type InsertOrganizationMember = z.infer<typeof insertOrganizationMemberSchema>;

// Types for Super Org Credentials
export type SuperOrgCredential = typeof superOrgCredentials.$inferSelect;
export type InsertSuperOrgCredential = z.infer<typeof insertSuperOrgCredentialSchema>;

// Organization Type aliases
export type OrganizationType = 'super' | 'client';
export type OrganizationMemberRole = 'owner' | 'admin' | 'member';

// Super Organization Constants
export const SUPER_ORG_ID = 'pivotal-b2b-super-org';
export const SUPER_ORG_NAME = 'Pivotal B2B';
export const SUPER_ORG_DOMAIN = 'pivotalb2b.com';

/**
 * Credential categories for super organization
 */
export const CREDENTIAL_CATEGORIES = {
  AI: 'ai',
  TELEPHONY: 'telephony',
  EMAIL: 'email',
  STORAGE: 'storage',
  DATABASE: 'database',
  ANALYTICS: 'analytics',
  OTHER: 'other',
} as const;

export type CredentialCategory = typeof CREDENTIAL_CATEGORIES[keyof typeof CREDENTIAL_CATEGORIES];

// ==================== SMI AGENT - Search, Mapping & Intelligence ====================

/**
 * Decision Authority Enum
 * Classification of contact's decision-making power
 */
export const decisionAuthorityEnum = pgEnum('decision_authority', [
  'decision_maker',
  'influencer',
  'user',
  'gatekeeper'
]);

/**
 * Buying Committee Role Enum
 * Role within the buying committee
 */
export const buyingCommitteeRoleEnum = pgEnum('buying_committee_role', [
  'champion',
  'blocker',
  'evaluator',
  'budget_holder',
  'end_user'
]);

/**
 * Learning Insight Type Enum
 * Types of patterns detected from learning
 */
export const insightTypeEnum = pgEnum('insight_type', [
  'role_pattern',
  'industry_pattern',
  'objection_pattern',
  'approach_pattern',
  'messaging_pattern'
]);

/**
 * Learning Insight Scope Enum
 * Scope of learning insights
 */
export const insightScopeEnum = pgEnum('insight_scope', [
  'global',
  'organization',
  'campaign'
]);

/**
 * Role Adjacency Type Enum
 * Types of relationships between roles
 */
export const roleAdjacencyTypeEnum = pgEnum('role_adjacency_type', [
  'equivalent',
  'senior_to',
  'junior_to',
  'collaborates_with',
  'reports_to',
  'manages'
]);

/**
 * Title Mapping Source Enum
 * Source of title-to-role mapping
 */
export const titleMappingSourceEnum = pgEnum('title_mapping_source', [
  'manual',
  'ai',
  'system',
  'imported'
]);

/**
 * Industry Level Enum
 * Hierarchy level in industry taxonomy
 */
export const industryLevelEnum = pgEnum('industry_level', [
  'sector',
  'industry',
  'sub_industry'
]);

/**
 * Job Role Taxonomy - Master Reference for B2B Roles
 * Normalized roles with function, seniority, and decision authority
 */
export const jobRoleTaxonomy = pgTable('job_role_taxonomy', {
  id: serial('id').primaryKey(),
  roleName: text('role_name').notNull(),
  roleCode: text('role_code').notNull().unique(),
  roleCategory: text('role_category').notNull(), // 'functional', 'technical', 'executive', 'support', 'specialist'
  jobFunction: text('job_function').notNull(), // 'IT', 'Finance', 'HR', 'Marketing', 'Operations', 'Sales', 'Legal', 'Executive'
  seniorityLevel: text('seniority_level').notNull(), // 'entry', 'mid', 'senior', 'director', 'vp', 'c_level', 'board'
  decisionAuthority: decisionAuthorityEnum('decision_authority').notNull().default('influencer'),
  department: text('department'),
  synonyms: text('synonyms').array().default(sql`'{}'`),
  keywords: text('keywords').array().default(sql`'{}'`),
  parentRoleId: integer('parent_role_id').references((): any => jobRoleTaxonomy.id),
  typicalReportsTo: integer('typical_reports_to').references((): any => jobRoleTaxonomy.id),
  description: text('description'),
  isActive: boolean('is_active').default(true),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
}, (table) => ({
  functionIdx: index('job_role_taxonomy_function_idx').on(table.jobFunction),
  seniorityIdx: index('job_role_taxonomy_seniority_idx').on(table.seniorityLevel),
  categoryIdx: index('job_role_taxonomy_category_idx').on(table.roleCategory),
  authorityIdx: index('job_role_taxonomy_authority_idx').on(table.decisionAuthority),
}));

/**
 * Job Title Mappings - Raw Titles to Normalized Roles
 * Maps user-provided job titles to canonical roles in taxonomy
 */
export const jobTitleMappings = pgTable('job_title_mappings', {
  id: serial('id').primaryKey(),
  rawTitle: text('raw_title').notNull(),
  rawTitleNormalized: text('raw_title_normalized').notNull(),
  mappedRoleId: integer('mapped_role_id').references(() => jobRoleTaxonomy.id).notNull(),
  confidence: numeric('confidence', { precision: 5, scale: 4 }).notNull().default('0.8'),
  mappingSource: titleMappingSourceEnum('mapping_source').notNull().default('manual'),
  verifiedBy: varchar('verified_by', { length: 36 }).references(() => users.id),
  verifiedAt: timestamp('verified_at'),
  usageCount: integer('usage_count').default(0),
  lastUsedAt: timestamp('last_used_at'),
  notes: text('notes'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
}, (table) => ({
  normalizedIdx: uniqueIndex('job_title_mappings_normalized_idx').on(table.rawTitleNormalized),
  roleIdx: index('job_title_mappings_role_idx').on(table.mappedRoleId),
  sourceIdx: index('job_title_mappings_source_idx').on(table.mappingSource),
  confidenceIdx: index('job_title_mappings_confidence_idx').on(table.confidence),
}));

/**
 * Role Adjacency - Graph of Related Roles
 * Defines relationships between roles (equivalent, senior/junior, collaborators)
 */
export const roleAdjacency = pgTable('role_adjacency', {
  id: serial('id').primaryKey(),
  sourceRoleId: integer('source_role_id').references(() => jobRoleTaxonomy.id).notNull(),
  targetRoleId: integer('target_role_id').references(() => jobRoleTaxonomy.id).notNull(),
  adjacencyType: roleAdjacencyTypeEnum('adjacency_type').notNull(),
  relationshipStrength: numeric('relationship_strength', { precision: 5, scale: 4 }).notNull().default('0.5'),
  contextNotes: text('context_notes'),
  isBidirectional: boolean('is_bidirectional').default(false),
  createdAt: timestamp('created_at').notNull().defaultNow(),
}, (table) => ({
  pairUniq: uniqueIndex('role_adjacency_pair_uniq').on(table.sourceRoleId, table.targetRoleId, table.adjacencyType),
  sourceIdx: index('role_adjacency_source_idx').on(table.sourceRoleId),
  targetIdx: index('role_adjacency_target_idx').on(table.targetRoleId),
}));

/**
 * Industry Taxonomy - Hierarchical Industry Classification
 * Includes SIC/NAICS mappings and industry intelligence
 */
export const industryTaxonomy = pgTable('industry_taxonomy', {
  id: serial('id').primaryKey(),
  industryName: text('industry_name').notNull(),
  industryCode: text('industry_code').notNull().unique(),
  displayName: text('display_name').notNull(),
  sicCodes: text('sic_codes').array().default(sql`'{}'`),
  naicsCodes: text('naics_codes').array().default(sql`'{}'`),
  parentIndustryId: integer('parent_industry_id').references((): any => industryTaxonomy.id),
  industryLevel: industryLevelEnum('industry_level').notNull().default('industry'),
  synonyms: text('synonyms').array().default(sql`'{}'`),
  keywords: text('keywords').array().default(sql`'{}'`),
  description: text('description'),
  // Intelligence fields
  typicalChallenges: jsonb('typical_challenges').default('[]'),
  regulatoryConsiderations: jsonb('regulatory_considerations').default('[]'),
  buyingBehaviors: jsonb('buying_behaviors').default('{}'),
  seasonalPatterns: jsonb('seasonal_patterns').default('{}'),
  technologyTrends: jsonb('technology_trends').default('[]'),
  competitiveLandscape: jsonb('competitive_landscape').default('{}'),
  isActive: boolean('is_active').default(true),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
}, (table) => ({
  parentIdx: index('industry_taxonomy_parent_idx').on(table.parentIndustryId),
  levelIdx: index('industry_taxonomy_level_idx').on(table.industryLevel),
}));

/**
 * Industry Department Pain Points - Industry x Department Matrix
 * Pain points, priorities, and decision factors by industry and department
 */
export const industryDepartmentPainPoints = pgTable('industry_department_pain_points', {
  id: serial('id').primaryKey(),
  industryId: integer('industry_id').references(() => industryTaxonomy.id).notNull(),
  department: text('department').notNull(), // 'IT', 'Finance', 'HR', 'Marketing', 'Operations', 'Sales', 'Legal', 'Executive'
  painPoints: jsonb('pain_points').notNull().default('[]'),
  priorities: jsonb('priorities').default('[]'),
  budgetConsiderations: jsonb('budget_considerations').default('{}'),
  decisionFactors: jsonb('decision_factors').default('[]'),
  successMetrics: jsonb('success_metrics').default('[]'),
  commonObjections: jsonb('common_objections').default('[]'),
  messagingAngles: jsonb('messaging_angles').default('[]'),
  isActive: boolean('is_active').default(true),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
}, (table) => ({
  industryDeptUniq: uniqueIndex('industry_dept_pain_uniq').on(table.industryId, table.department),
  industryIdx: index('industry_dept_industry_idx').on(table.industryId),
  deptIdx: index('industry_dept_dept_idx').on(table.department),
}));

/**
 * Business Perspectives - Evaluation Lens Definitions
 * Defines Finance, HR, Marketing, Operations, IT/Security perspectives
 */
export const businessPerspectives = pgTable('business_perspectives', {
  id: serial('id').primaryKey(),
  perspectiveCode: text('perspective_code').notNull().unique(),
  perspectiveName: text('perspective_name').notNull(),
  description: text('description'),
  evaluationCriteria: jsonb('evaluation_criteria').notNull().default('[]'),
  keyMetrics: jsonb('key_metrics').default('[]'),
  commonConcerns: jsonb('common_concerns').default('[]'),
  valueDrivers: jsonb('value_drivers').default('[]'),
  roiFactors: jsonb('roi_factors').default('[]'),
  riskFactors: jsonb('risk_factors').default('[]'),
  messagingTemplates: jsonb('messaging_templates').default('[]'),
  proofPointTypes: jsonb('proof_point_types').default('[]'),
  applicableToDepartments: text('applicable_to_departments').array().default(sql`'{}'`),
  priorityOrder: integer('priority_order').default(50),
  isActive: boolean('is_active').default(true),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
}, (table) => ({
  activeIdx: index('business_perspectives_active_idx').on(table.isActive),
}));

/**
 * Account Perspective Analysis - Cached Multi-Perspective Intelligence
 * Generated analysis for accounts from each business perspective
 */
export const accountPerspectiveAnalysis = pgTable('account_perspective_analysis', {
  id: serial('id').primaryKey(),
  accountId: varchar('account_id', { length: 36 }).references(() => accounts.id, { onDelete: 'cascade' }).notNull(),
  perspectiveId: integer('perspective_id').references(() => businessPerspectives.id).notNull(),
  analysisJson: jsonb('analysis_json').notNull(),
  keyConsiderations: text('key_considerations').array().default(sql`'{}'`),
  valueDrivers: text('value_drivers').array().default(sql`'{}'`),
  potentialConcerns: text('potential_concerns').array().default(sql`'{}'`),
  recommendedApproach: text('recommended_approach'),
  messagingAngles: text('messaging_angles').array().default(sql`'{}'`),
  questionsToAsk: text('questions_to_ask').array().default(sql`'{}'`),
  confidence: numeric('confidence', { precision: 5, scale: 4 }).notNull().default('0.5'),
  signalsUsed: text('signals_used').array().default(sql`'{}'`),
  generationModel: text('generation_model'),
  sourceFingerprint: text('source_fingerprint'),
  generatedAt: timestamp('generated_at').notNull().defaultNow(),
  expiresAt: timestamp('expires_at'),
  isStale: boolean('is_stale').default(false),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
}, (table) => ({
  accountPerspectiveUniq: uniqueIndex('account_perspective_uniq').on(table.accountId, table.perspectiveId),
  expiresIdx: index('account_perspective_expires_idx').on(table.expiresAt),
  staleIdx: index('account_perspective_stale_idx').on(table.isStale),
}));

/**
 * Contact Intelligence - Cached Contact-Level Intelligence
 * Role mapping, decision authority, engagement recommendations
 */
export const contactIntelligence = pgTable('contact_intelligence', {
  id: serial('id').primaryKey(),
  contactId: varchar('contact_id', { length: 36 }).references(() => contacts.id, { onDelete: 'cascade' }).notNull().unique(),
  // Role Intelligence
  normalizedRoleId: integer('normalized_role_id').references(() => jobRoleTaxonomy.id),
  roleConfidence: numeric('role_confidence', { precision: 5, scale: 4 }),
  roleMappingSource: titleMappingSourceEnum('role_mapping_source'),
  decisionAuthority: decisionAuthorityEnum('decision_authority'),
  buyingCommitteeRole: buyingCommitteeRoleEnum('buying_committee_role'),
  // Persona Intelligence
  likelyPriorities: jsonb('likely_priorities').default('[]'),
  communicationStyleHints: jsonb('communication_style_hints').default('{}'),
  painPointSensitivity: jsonb('pain_point_sensitivity').default('{}'),
  // Engagement Intelligence
  bestApproach: text('best_approach'), // 'direct', 'consultative', 'educational', 'peer-based'
  preferredValueProps: text('preferred_value_props').array().default(sql`'{}'`),
  recommendedMessagingAngles: text('recommended_messaging_angles').array().default(sql`'{}'`),
  // Behavioral patterns
  engagementHistorySummary: jsonb('engagement_history_summary').default('{}'),
  objectionHistory: text('objection_history').array().default(sql`'{}'`),
  interestSignals: text('interest_signals').array().default(sql`'{}'`),
  // Scoring
  engagementPropensity: numeric('engagement_propensity', { precision: 5, scale: 4 }),
  qualificationPropensity: numeric('qualification_propensity', { precision: 5, scale: 4 }),
  // Cache Management
  generatedAt: timestamp('generated_at').notNull().defaultNow(),
  generationModel: text('generation_model'),
  sourceFingerprint: text('source_fingerprint'),
  expiresAt: timestamp('expires_at'),
  isStale: boolean('is_stale').default(false),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
}, (table) => ({
  roleIdx: index('contact_intelligence_role_idx').on(table.normalizedRoleId),
  authorityIdx: index('contact_intelligence_authority_idx').on(table.decisionAuthority),
  committeeIdx: index('contact_intelligence_committee_idx').on(table.buyingCommitteeRole),
  expiresIdx: index('contact_intelligence_expires_idx').on(table.expiresAt),
}));

/**
 * Call Outcome Learnings - Structured Learning Records
 * Captures signals from call outcomes for pattern detection
 */
export const callOutcomeLearnings = pgTable('call_outcome_learnings', {
  id: serial('id').primaryKey(),
  callSessionId: varchar('call_session_id', { length: 36 }).notNull(),
  campaignId: varchar('campaign_id', { length: 36 }).references(() => campaigns.id, { onDelete: 'set null' }),
  contactId: varchar('contact_id', { length: 36 }).references(() => contacts.id, { onDelete: 'set null' }),
  accountId: varchar('account_id', { length: 36 }).references(() => accounts.id, { onDelete: 'set null' }),
  // Outcome Classification
  outcomeCode: text('outcome_code').notNull(),
  outcomeCategory: text('outcome_category').notNull(), // 'positive', 'neutral', 'negative', 'inconclusive'
  outcomeQualityScore: numeric('outcome_quality_score', { precision: 5, scale: 4 }),
  // Signals
  engagementSignals: jsonb('engagement_signals').notNull().default('{}'),
  objectionSignals: jsonb('objection_signals').default('{}'),
  qualificationSignals: jsonb('qualification_signals').default('{}'),
  conversationQualitySignals: jsonb('conversation_quality_signals').default('{}'),
  roleSignals: jsonb('role_signals').default('{}'),
  industrySignals: jsonb('industry_signals').default('{}'),
  messagingSignals: jsonb('messaging_signals').default('{}'),
  // Context
  contactRoleId: integer('contact_role_id').references(() => jobRoleTaxonomy.id),
  industryId: integer('industry_id').references(() => industryTaxonomy.id),
  problemIds: integer('problem_ids').array().default(sql`'{}'`),
  messagingAngleUsed: text('messaging_angle_used'),
  approachUsed: text('approach_used'),
  valuePropsPresented: text('value_props_presented').array().default(sql`'{}'`),
  // Adjustments
  adjustmentsApplied: jsonb('adjustments_applied').default('{}'),
  // Call metadata
  callDurationSeconds: integer('call_duration_seconds'),
  talkRatio: numeric('talk_ratio', { precision: 5, scale: 4 }),
  callTimestamp: timestamp('call_timestamp').notNull(),
  // Processing
  processedForLearning: boolean('processed_for_learning').default(false),
  processedAt: timestamp('processed_at'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
}, (table) => ({
  campaignIdx: index('call_outcome_learnings_campaign_idx').on(table.campaignId),
  contactIdx: index('call_outcome_learnings_contact_idx').on(table.contactId),
  outcomeIdx: index('call_outcome_learnings_outcome_idx').on(table.outcomeCode),
  roleIdx: index('call_outcome_learnings_role_idx').on(table.contactRoleId),
  industryIdx: index('call_outcome_learnings_industry_idx').on(table.industryId),
  timestampIdx: index('call_outcome_learnings_timestamp_idx').on(table.callTimestamp),
}));

/**
 * Learning Insights - Aggregated Patterns from Call Outcomes
 * Detected patterns for roles, industries, objections, approaches
 */
export const learningInsights = pgTable('learning_insights', {
  id: serial('id').primaryKey(),
  insightType: insightTypeEnum('insight_type').notNull(),
  insightScope: insightScopeEnum('insight_scope').notNull(),
  scopeId: varchar('scope_id', { length: 36 }),
  // Pattern Details
  patternKey: text('pattern_key').notNull(),
  patternName: text('pattern_name').notNull(),
  patternDescription: text('pattern_description').notNull(),
  patternData: jsonb('pattern_data').notNull(),
  // Segmentation
  appliesToRoles: integer('applies_to_roles').array().default(sql`'{}'`),
  appliesToIndustries: integer('applies_to_industries').array().default(sql`'{}'`),
  appliesToSeniority: text('applies_to_seniority').array().default(sql`'{}'`),
  appliesToDepartments: text('applies_to_departments').array().default(sql`'{}'`),
  // Statistics
  sampleSize: integer('sample_size').notNull(),
  successRate: numeric('success_rate', { precision: 5, scale: 4 }),
  avgEngagementScore: numeric('avg_engagement_score', { precision: 5, scale: 4 }),
  avgQualificationScore: numeric('avg_qualification_score', { precision: 5, scale: 4 }),
  confidence: numeric('confidence', { precision: 5, scale: 4 }).notNull(),
  statisticalSignificance: numeric('statistical_significance', { precision: 5, scale: 4 }),
  // Recommendations
  recommendedAdjustments: jsonb('recommended_adjustments').default('{}'),
  recommendedMessaging: text('recommended_messaging').array().default(sql`'{}'`),
  recommendedApproaches: text('recommended_approaches').array().default(sql`'{}'`),
  antiPatterns: text('anti_patterns').array().default(sql`'{}'`),
  // Validity
  generatedAt: timestamp('generated_at').notNull().defaultNow(),
  generationModel: text('generation_model'),
  validFrom: timestamp('valid_from').notNull().defaultNow(),
  validUntil: timestamp('valid_until'),
  isActive: boolean('is_active').default(true),
  // Versioning
  version: integer('version').default(1),
  previousVersionId: integer('previous_version_id').references((): any => learningInsights.id),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
}, (table) => ({
  typeIdx: index('learning_insights_type_idx').on(table.insightType),
  scopeIdx: index('learning_insights_scope_idx').on(table.insightScope, table.scopeId),
  keyIdx: index('learning_insights_key_idx').on(table.patternKey),
  activeIdx: index('learning_insights_active_idx').on(table.isActive),
}));

/**
 * Contact Predictive Scores - Campaign-Specific Predictions
 * Likelihood scores for engagement, qualification, and priority
 */
export const contactPredictiveScores = pgTable('contact_predictive_scores', {
  id: serial('id').primaryKey(),
  contactId: varchar('contact_id', { length: 36 }).references(() => contacts.id, { onDelete: 'cascade' }).notNull(),
  campaignId: varchar('campaign_id', { length: 36 }).references(() => campaigns.id, { onDelete: 'cascade' }).notNull(),
  // Scores
  engagementLikelihood: numeric('engagement_likelihood', { precision: 5, scale: 4 }).notNull(),
  qualificationLikelihood: numeric('qualification_likelihood', { precision: 5, scale: 4 }).notNull(),
  conversionLikelihood: numeric('conversion_likelihood', { precision: 5, scale: 4 }),
  // Contributing Factors
  roleScore: numeric('role_score', { precision: 5, scale: 4 }),
  industryScore: numeric('industry_score', { precision: 5, scale: 4 }),
  problemFitScore: numeric('problem_fit_score', { precision: 5, scale: 4 }),
  historicalPatternScore: numeric('historical_pattern_score', { precision: 5, scale: 4 }),
  accountFitScore: numeric('account_fit_score', { precision: 5, scale: 4 }),
  timingScore: numeric('timing_score', { precision: 5, scale: 4 }),
  // Factor explanations
  scoreFactors: jsonb('score_factors').default('{}'),
  // Recommendations
  recommendedApproach: text('recommended_approach'),
  recommendedMessagingAngles: text('recommended_messaging_angles').array().default(sql`'{}'`),
  recommendedValueProps: text('recommended_value_props').array().default(sql`'{}'`),
  recommendedProofPoints: text('recommended_proof_points').array().default(sql`'{}'`),
  // Priority
  callPriority: integer('call_priority').notNull().default(50),
  priorityTier: text('priority_tier'), // 'high', 'medium', 'low'
  // Flags
  hasBlockingFactors: boolean('has_blocking_factors').default(false),
  blockingFactors: text('blocking_factors').array().default(sql`'{}'`),
  // Cache Management
  generatedAt: timestamp('generated_at').notNull().defaultNow(),
  generationModel: text('generation_model'),
  sourceFingerprint: text('source_fingerprint'),
  expiresAt: timestamp('expires_at'),
  isStale: boolean('is_stale').default(false),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
}, (table) => ({
  contactCampaignUniq: uniqueIndex('contact_predictive_scores_uniq').on(table.contactId, table.campaignId),
  priorityIdx: index('contact_predictive_scores_priority_idx').on(table.campaignId, table.callPriority),
  engagementIdx: index('contact_predictive_scores_engagement_idx').on(table.campaignId, table.engagementLikelihood),
  tierIdx: index('contact_predictive_scores_tier_idx').on(table.campaignId, table.priorityTier),
}));

/**
 * SMI Audit Log - Audit Trail for SMI Operations
 * Tracks all SMI Agent operations for governance
 */
export const smiAuditLog = pgTable('smi_audit_log', {
  id: serial('id').primaryKey(),
  operationType: text('operation_type').notNull(),
  operationSubtype: text('operation_subtype'),
  entityType: text('entity_type'),
  entityId: varchar('entity_id', { length: 36 }),
  inputData: jsonb('input_data'),
  outputData: jsonb('output_data'),
  confidence: numeric('confidence', { precision: 5, scale: 4 }),
  modelUsed: text('model_used'),
  processingTimeMs: integer('processing_time_ms'),
  tokensUsed: integer('tokens_used'),
  triggeredBy: varchar('triggered_by', { length: 36 }).references(() => users.id),
  triggeredBySystem: boolean('triggered_by_system').default(false),
  campaignId: varchar('campaign_id', { length: 36 }),
  sessionId: varchar('session_id', { length: 36 }),
  ipAddress: text('ip_address'),
  userAgent: text('user_agent'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
}, (table) => ({
  operationIdx: index('smi_audit_log_operation_idx').on(table.operationType),
  entityIdx: index('smi_audit_log_entity_idx').on(table.entityType, table.entityId),
  campaignIdx: index('smi_audit_log_campaign_idx').on(table.campaignId),
  timestampIdx: index('smi_audit_log_timestamp_idx').on(table.createdAt),
}));

// ==================== SMI AGENT INSERT SCHEMAS ====================

export const insertJobRoleTaxonomySchema = createInsertSchema(jobRoleTaxonomy).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertJobTitleMappingSchema = createInsertSchema(jobTitleMappings).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertRoleAdjacencySchema = createInsertSchema(roleAdjacency).omit({
  id: true,
  createdAt: true,
});

export const insertIndustryTaxonomySchema = createInsertSchema(industryTaxonomy).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertIndustryDepartmentPainPointsSchema = createInsertSchema(industryDepartmentPainPoints).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertBusinessPerspectiveSchema = createInsertSchema(businessPerspectives).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertAccountPerspectiveAnalysisSchema = createInsertSchema(accountPerspectiveAnalysis).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertContactIntelligenceSchema = createInsertSchema(contactIntelligence).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertCallOutcomeLearningSchema = createInsertSchema(callOutcomeLearnings).omit({
  id: true,
  createdAt: true,
});

export const insertLearningInsightSchema = createInsertSchema(learningInsights).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertContactPredictiveScoreSchema = createInsertSchema(contactPredictiveScores).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertSmiAuditLogSchema = createInsertSchema(smiAuditLog).omit({
  id: true,
  createdAt: true,
});

// ==================== SMI AGENT TYPES ====================

export type JobRoleTaxonomy = typeof jobRoleTaxonomy.$inferSelect;
export type InsertJobRoleTaxonomy = z.infer<typeof insertJobRoleTaxonomySchema>;

export type JobTitleMapping = typeof jobTitleMappings.$inferSelect;
export type InsertJobTitleMapping = z.infer<typeof insertJobTitleMappingSchema>;

export type RoleAdjacency = typeof roleAdjacency.$inferSelect;
export type InsertRoleAdjacency = z.infer<typeof insertRoleAdjacencySchema>;

export type IndustryTaxonomy = typeof industryTaxonomy.$inferSelect;
export type InsertIndustryTaxonomy = z.infer<typeof insertIndustryTaxonomySchema>;

export type IndustryDepartmentPainPoints = typeof industryDepartmentPainPoints.$inferSelect;
export type InsertIndustryDepartmentPainPoints = z.infer<typeof insertIndustryDepartmentPainPointsSchema>;

export type BusinessPerspective = typeof businessPerspectives.$inferSelect;
export type InsertBusinessPerspective = z.infer<typeof insertBusinessPerspectiveSchema>;

export type AccountPerspectiveAnalysis = typeof accountPerspectiveAnalysis.$inferSelect;
export type InsertAccountPerspectiveAnalysis = z.infer<typeof insertAccountPerspectiveAnalysisSchema>;

export type ContactIntelligence = typeof contactIntelligence.$inferSelect;
export type InsertContactIntelligence = z.infer<typeof insertContactIntelligenceSchema>;

export type CallOutcomeLearning = typeof callOutcomeLearnings.$inferSelect;
export type InsertCallOutcomeLearning = z.infer<typeof insertCallOutcomeLearningSchema>;

export type LearningInsight = typeof learningInsights.$inferSelect;
export type InsertLearningInsight = z.infer<typeof insertLearningInsightSchema>;

export type ContactPredictiveScore = typeof contactPredictiveScores.$inferSelect;
export type InsertContactPredictiveScore = z.infer<typeof insertContactPredictiveScoreSchema>;

// Call Quality Records Schema
export const insertCallQualityRecordsSchema = createInsertSchema(callQualityRecords).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type CallQualityRecord = typeof callQualityRecords.$inferSelect;
export type InsertCallQualityRecord = z.infer<typeof insertCallQualityRecordsSchema>;

export type SmiAuditLog = typeof smiAuditLog.$inferSelect;
export type InsertSmiAuditLog = z.infer<typeof insertSmiAuditLogSchema>;

// SMI Enum Types
export type DecisionAuthority = 'decision_maker' | 'influencer' | 'user' | 'gatekeeper';
export type BuyingCommitteeRole = 'champion' | 'blocker' | 'evaluator' | 'budget_holder' | 'end_user';
export type InsightType = 'role_pattern' | 'industry_pattern' | 'objection_pattern' | 'approach_pattern' | 'messaging_pattern';
export type InsightScope = 'global' | 'organization' | 'campaign';
export type RoleAdjacencyType = 'equivalent' | 'senior_to' | 'junior_to' | 'collaborates_with' | 'reports_to' | 'manages';
export type TitleMappingSource = 'manual' | 'ai' | 'system' | 'imported';
export type IndustryLevel = 'sector' | 'industry' | 'sub_industry';
export type SmiApproach = 'direct' | 'consultative' | 'educational' | 'peer-based';
export type PriorityTier = 'high' | 'medium' | 'low';

// ==================== SMTP TRANSACTIONAL EMAIL SYSTEM SCHEMAS ====================

// SMTP Providers Insert Schema
export const insertSmtpProviderSchema = createInsertSchema(smtpProviders).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
  sentToday: true,
  sentThisHour: true,
  sentTodayResetAt: true,
  sentHourResetAt: true,
  lastVerifiedAt: true,
  lastUsedAt: true,
});

// Transactional Email Templates Insert Schema
export const insertTransactionalEmailTemplateSchema = createInsertSchema(transactionalEmailTemplates).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

// Transactional Email Logs Insert Schema
export const insertTransactionalEmailLogSchema = createInsertSchema(transactionalEmailLogs).omit({
  id: true,
  createdAt: true,
  queuedAt: true,
  sentAt: true,
  deliveredAt: true,
  failedAt: true,
});

// SMTP Transactional Email System Types
export type SmtpProvider = typeof smtpProviders.$inferSelect;
export type InsertSmtpProvider = z.infer<typeof insertSmtpProviderSchema>;

export type TransactionalEmailTemplate = typeof transactionalEmailTemplates.$inferSelect;
export type InsertTransactionalEmailTemplate = z.infer<typeof insertTransactionalEmailTemplateSchema>;

export type TransactionalEmailLog = typeof transactionalEmailLogs.$inferSelect;
export type InsertTransactionalEmailLog = z.infer<typeof insertTransactionalEmailLogSchema>;

// SMTP Provider Type Enum Type
export type SmtpProviderType = 'gmail' | 'outlook' | 'custom';
export type SmtpAuthType = 'oauth2' | 'basic' | 'app_password';
export type SmtpVerificationStatus = 'pending' | 'verifying' | 'verified' | 'failed';
export type TransactionalEventType =
  | 'welcome'
  | 'password_reset'
  | 'password_changed'
  | 'account_verification'
  | 'account_updated'
  | 'notification'
  | 'lead_alert'
  | 'campaign_completed'
  | 'report_ready'
  | 'invoice'
  | 'subscription_expiring'
  | 'two_factor_code';

// ==================== PHASE 2: DOMAIN MANAGEMENT & DELIVERABILITY SCHEMAS ====================

// Domain Configuration Insert Schema
export const insertDomainConfigurationSchema = createInsertSchema(domainConfiguration).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
  spfVerifiedAt: true,
  dkimVerifiedAt: true,
  dmarcVerifiedAt: true,
  trackingVerifiedAt: true,
});

// Domain Health Scores Insert Schema
export const insertDomainHealthScoreSchema = createInsertSchema(domainHealthScores).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
  scoredAt: true,
});

// Blacklist Monitors Insert Schema
export const insertBlacklistMonitorSchema = createInsertSchema(blacklistMonitors).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
  lastCheckedAt: true,
  lastAlertSentAt: true,
});

// Blacklist Check History Insert Schema
export const insertBlacklistCheckHistorySchema = createInsertSchema(blacklistCheckHistory).omit({
  id: true,
  checkedAt: true,
});

// Domain Warmup Schedule Insert Schema
export const insertDomainWarmupScheduleSchema = createInsertSchema(domainWarmupSchedule).omit({
  id: true,
  createdAt: true,
  completedAt: true,
});

// Phase 2 Types
export type DomainConfiguration = typeof domainConfiguration.$inferSelect;
export type InsertDomainConfiguration = z.infer<typeof insertDomainConfigurationSchema>;

export type DomainHealthScore = typeof domainHealthScores.$inferSelect;
export type InsertDomainHealthScore = z.infer<typeof insertDomainHealthScoreSchema>;

export type BlacklistMonitor = typeof blacklistMonitors.$inferSelect;
export type InsertBlacklistMonitor = z.infer<typeof insertBlacklistMonitorSchema>;

export type BlacklistCheckHistory = typeof blacklistCheckHistory.$inferSelect;
export type InsertBlacklistCheckHistory = z.infer<typeof insertBlacklistCheckHistorySchema>;

export type DomainWarmupSchedule = typeof domainWarmupSchedule.$inferSelect;
export type InsertDomainWarmupSchedule = z.infer<typeof insertDomainWarmupScheduleSchema>;

// Phase 2 Enum Types
export type DomainPurpose = 'marketing' | 'transactional' | 'both';
export type WarmupPhase = 'not_started' | 'phase_1' | 'phase_2' | 'phase_3' | 'completed' | 'paused';
export type BlacklistStatus = 'clean' | 'listed' | 'pending_check';

// ==================== PHASE 3: UNIFIED EMAIL AGENT SCHEMAS ====================

// Email Generation Logs Insert Schema
export const insertEmailGenerationLogSchema = createInsertSchema(emailGenerationLogs).omit({
  id: true,
  createdAt: true,
  requestedAt: true,
  completedAt: true,
});

// Email Provider Config Insert Schema
export const insertEmailProviderConfigSchema = createInsertSchema(emailProviderConfig).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
  currentRequestsThisMinute: true,
  currentTokensThisMinute: true,
  monthlySpend: true,
});

// Phase 3 Types
export type EmailGenerationLog = typeof emailGenerationLogs.$inferSelect;
export type InsertEmailGenerationLog = z.infer<typeof insertEmailGenerationLogSchema>;

export type EmailProviderConfig = typeof emailProviderConfig.$inferSelect;
export type InsertEmailProviderConfig = z.infer<typeof insertEmailProviderConfigSchema>;

// Phase 3 Enum Types
export type EmailProvider = 'gemini' | 'gpt4o' | 'deepseek' | 'openai' | 'anthropic';
export type EmailGenerationStatus = 'pending' | 'processing' | 'completed' | 'failed' | 'cached';

// ==================== PHASE 4: ENHANCED EMAIL BUILDER SCHEMAS ====================

// Brand Kits Insert Schema
export const insertBrandKitSchema = createInsertSchema(brandKits).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

// Email Builder Templates Insert Schema
export const insertEmailBuilderTemplateSchema = createInsertSchema(emailBuilderTemplates).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
  usageCount: true,
  lastUsedAt: true,
});

// Email Builder Blocks Insert Schema
export const insertEmailBuilderBlockSchema = createInsertSchema(emailBuilderBlocks).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

// Email Builder Images Insert Schema
export const insertEmailBuilderImageSchema = createInsertSchema(emailBuilderImages).omit({
  id: true,
  createdAt: true,
  usageCount: true,
  lastUsedAt: true,
});

// AI Image Generation Jobs Insert Schema
export const insertAiImageGenerationJobSchema = createInsertSchema(aiImageGenerationJobs).omit({
  id: true,
  createdAt: true,
  startedAt: true,
  completedAt: true,
  durationMs: true,
});

// Phase 4 Types
export type BrandKit = typeof brandKits.$inferSelect;
export type InsertBrandKit = z.infer<typeof insertBrandKitSchema>;

export type EmailBuilderTemplate = typeof emailBuilderTemplates.$inferSelect;
export type InsertEmailBuilderTemplate = z.infer<typeof insertEmailBuilderTemplateSchema>;

export type EmailBuilderBlock = typeof emailBuilderBlocks.$inferSelect;
export type InsertEmailBuilderBlock = z.infer<typeof insertEmailBuilderBlockSchema>;

export type EmailBuilderImage = typeof emailBuilderImages.$inferSelect;
export type InsertEmailBuilderImage = z.infer<typeof insertEmailBuilderImageSchema>;

export type AiImageGenerationJob = typeof aiImageGenerationJobs.$inferSelect;
export type InsertAiImageGenerationJob = z.infer<typeof insertAiImageGenerationJobSchema>;

// Phase 4 Enum Types
export type EmailBlockType =
  | 'text' | 'heading' | 'image' | 'button' | 'divider' | 'spacer'
  | 'columns' | 'hero' | 'card' | 'social' | 'footer' | 'header'
  | 'list' | 'quote' | 'video' | 'countdown' | 'product';
export type ImageSource = 'upload' | 'ai_generated' | 'url' | 'stock';

// ==================== RESEARCH & ANALYSIS AGENT TABLES ====================

// Analysis Type Enum
export const analysisTypeEnum = pgEnum('analysis_type', [
  'lead_quality',
  'email_quality',
  'call_quality',
  'communication_quality',
  'engagement',
  'account_health',
  'next_best_action'
]);

// Score Tier Enum
export const scoreTierEnum = pgEnum('score_tier', [
  'exceptional',
  'good',
  'acceptable',
  'below_standard',
  'critical'
]);

// Health Status Enum
export const healthStatusEnum = pgEnum('health_status', [
  'thriving',
  'healthy',
  'at_risk',
  'critical'
]);

// NBA Status Enum
export const nbaStatusEnum = pgEnum('nba_status', [
  'pending',
  'in_progress',
  'completed',
  'skipped',
  'expired'
]);

// NBA Action Type Enum
export const nbaActionTypeEnum = pgEnum('nba_action_type', [
  'contact',
  'message',
  'offer',
  'follow_up',
  'escalate'
]);

// Research Analysis Records - Comprehensive logging of all analysis operations
export const researchAnalysisRecords = pgTable("research_analysis_records", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),

  // Entity being analyzed
  entityType: varchar("entity_type", { length: 50 }).notNull(),
  entityId: varchar("entity_id", { length: 255 }).notNull(),

  // Analysis context
  campaignId: varchar("campaign_id").references(() => campaigns.id, { onDelete: 'set null' }),
  organizationId: varchar("organization_id"),
  analysisType: varchar("analysis_type", { length: 50 }).notNull(),

  // Module and model info
  moduleId: varchar("module_id", { length: 100 }).notNull(),
  moduleVersion: varchar("module_version", { length: 20 }).notNull(),
  scoringModelId: varchar("scoring_model_id", { length: 100 }),
  scoringModelVersion: varchar("scoring_model_version", { length: 20 }),

  // Results
  overallScore: integer("overall_score"),
  scoreTier: varchar("score_tier", { length: 20 }),
  scoreComponents: jsonb("score_components"),
  scoreFactors: jsonb("score_factors"),
  confidenceScore: numeric("confidence_score", { precision: 5, scale: 4 }),

  // Findings
  findings: jsonb("findings"),
  findingsCount: integer("findings_count").default(0),
  criticalFindingsCount: integer("critical_findings_count").default(0),

  // Recommendations
  recommendations: jsonb("recommendations"),
  recommendationsCount: integer("recommendations_count").default(0),

  // Evidence
  evidence: jsonb("evidence"),

  // Configuration used
  configurationApplied: jsonb("configuration_applied"),

  // Execution metadata
  executionDurationMs: integer("execution_duration_ms"),
  aiModelUsed: varchar("ai_model_used", { length: 100 }),
  aiTokensUsed: integer("ai_tokens_used"),
  dataSourcesUsed: jsonb("data_sources_used"),

  // Status
  status: varchar("status", { length: 20 }).default('completed'),
  errorMessage: text("error_message"),

  // Audit
  triggeredBy: varchar("triggered_by", { length: 50 }),
  triggeredByUserId: varchar("triggered_by_user_id").references(() => users.id, { onDelete: 'set null' }),

  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (table) => ({
  entityIdx: index("research_analysis_entity_idx").on(table.entityType, table.entityId),
  campaignIdx: index("research_analysis_campaign_idx").on(table.campaignId),
  typeIdx: index("research_analysis_type_idx").on(table.analysisType),
  scoreIdx: index("research_analysis_score_idx").on(table.overallScore),
  createdIdx: index("research_analysis_created_idx").on(table.createdAt),
}));

// Scoring Model Configurations - Store custom scoring model configurations
export const scoringModelConfigurations = pgTable("scoring_model_configurations", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),

  // Model identification
  modelType: varchar("model_type", { length: 50 }).notNull(),
  modelName: varchar("model_name", { length: 100 }).notNull(),
  modelVersion: varchar("model_version", { length: 20 }).default('1.0.0'),

  // Scope
  organizationId: varchar("organization_id"),
  campaignId: varchar("campaign_id").references(() => campaigns.id, { onDelete: 'cascade' }),
  isDefault: boolean("is_default").default(false),

  // Configuration
  weights: jsonb("weights").notNull(),
  thresholds: jsonb("thresholds").notNull(),
  normalization: varchar("normalization", { length: 20 }).default('linear'),
  customRules: jsonb("custom_rules"),

  // Metadata
  description: text("description"),
  createdBy: varchar("created_by").references(() => users.id, { onDelete: 'set null' }),

  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),

  // Soft delete
  isActive: boolean("is_active").default(true),
}, (table) => ({
  typeIdx: index("scoring_model_type_idx").on(table.modelType),
  orgIdx: index("scoring_model_org_idx").on(table.organizationId),
  campaignIdx: index("scoring_model_campaign_idx").on(table.campaignId),
}));

// Account Health Scores - Track account health over time
export const accountHealthScores = pgTable("account_health_scores", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),

  accountId: varchar("account_id").notNull().references(() => accounts.id, { onDelete: 'cascade' }),
  campaignId: varchar("campaign_id").references(() => campaigns.id, { onDelete: 'set null' }),

  // Scores
  overallHealthScore: integer("overall_health_score").notNull(),
  fitScore: integer("fit_score"),
  engagementScore: integer("engagement_score"),
  intentScore: integer("intent_score"),
  relationshipScore: integer("relationship_score"),
  riskScore: integer("risk_score"),

  // Score breakdown
  scoreComponents: jsonb("score_components"),
  scoreFactors: jsonb("score_factors"),

  // Health indicators
  healthStatus: varchar("health_status", { length: 20 }),
  trend: varchar("trend", { length: 20 }),
  trendVelocity: numeric("trend_velocity", { precision: 5, scale: 4 }),

  // Risk factors
  riskFactors: jsonb("risk_factors"),

  // Opportunities
  opportunities: jsonb("opportunities"),

  // Metadata
  scoringModelId: varchar("scoring_model_id"),
  analysisId: varchar("analysis_id").references(() => researchAnalysisRecords.id, { onDelete: 'set null' }),

  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (table) => ({
  accountIdx: index("account_health_account_idx").on(table.accountId),
  campaignIdx: index("account_health_campaign_idx").on(table.campaignId),
  scoreIdx: index("account_health_score_idx").on(table.overallHealthScore),
  statusIdx: index("account_health_status_idx").on(table.healthStatus),
  createdIdx: index("account_health_created_idx").on(table.createdAt),
}));

// Next Best Action Records - Store NBA recommendations
export const nextBestActionRecords = pgTable("next_best_action_records", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),

  // Context
  contactId: varchar("contact_id").references(() => contacts.id, { onDelete: 'cascade' }),
  accountId: varchar("account_id").references(() => accounts.id, { onDelete: 'cascade' }),
  campaignId: varchar("campaign_id").references(() => campaigns.id, { onDelete: 'set null' }),

  // Recommendation
  actionType: varchar("action_type", { length: 50 }).notNull(),
  actionChannel: varchar("action_channel", { length: 20 }),
  actionDescription: text("action_description").notNull(),
  actionDetails: jsonb("action_details"),

  // Prioritization
  priority: varchar("priority", { length: 20 }).notNull(),
  expectedImpact: varchar("expected_impact", { length: 255 }),
  effortLevel: varchar("effort_level", { length: 20 }),
  successProbability: numeric("success_probability", { precision: 5, scale: 4 }),

  // Scoring factors
  contributingFactors: jsonb("contributing_factors"),

  // Status tracking
  status: varchar("status", { length: 20 }).default('pending'),
  assignedTo: varchar("assigned_to").references(() => users.id, { onDelete: 'set null' }),
  completedAt: timestamp("completed_at"),
  completionNotes: text("completion_notes"),
  outcome: varchar("outcome", { length: 50 }),

  // Validity
  validFrom: timestamp("valid_from").defaultNow(),
  validUntil: timestamp("valid_until"),

  // Audit
  generatedByAnalysisId: varchar("generated_by_analysis_id").references(() => researchAnalysisRecords.id, { onDelete: 'set null' }),

  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (table) => ({
  contactIdx: index("nba_contact_idx").on(table.contactId),
  accountIdx: index("nba_account_idx").on(table.accountId),
  campaignIdx: index("nba_campaign_idx").on(table.campaignId),
  statusIdx: index("nba_status_idx").on(table.status),
  priorityIdx: index("nba_priority_idx").on(table.priority),
  validIdx: index("nba_valid_idx").on(table.validFrom, table.validUntil),
}));

// Engagement Analysis Records - Track engagement metrics over time
export const engagementAnalysisRecords = pgTable("engagement_analysis_records", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),

  contactId: varchar("contact_id").notNull().references(() => contacts.id, { onDelete: 'cascade' }),
  accountId: varchar("account_id").references(() => accounts.id, { onDelete: 'set null' }),
  campaignId: varchar("campaign_id").references(() => campaigns.id, { onDelete: 'set null' }),

  // Analysis period
  analysisPeriodStart: timestamp("analysis_period_start").notNull(),
  analysisPeriodEnd: timestamp("analysis_period_end").notNull(),

  // Engagement metrics
  overallEngagementScore: integer("overall_engagement_score"),

  // Sentiment analysis
  sentiment: varchar("sentiment", { length: 20 }),
  sentimentScore: numeric("sentiment_score", { precision: 5, scale: 4 }),
  sentimentTrajectory: varchar("sentiment_trajectory", { length: 20 }),

  // Intent signals
  intentScore: integer("intent_score"),
  intentSignals: jsonb("intent_signals"),

  // Momentum
  momentumScore: integer("momentum_score"),
  momentumDirection: varchar("momentum_direction", { length: 20 }),

  // Channel breakdown
  channelEngagement: jsonb("channel_engagement"),

  // Activity summary
  totalInteractions: integer("total_interactions"),
  emailOpens: integer("email_opens"),
  emailClicks: integer("email_clicks"),
  emailReplies: integer("email_replies"),
  callsConnected: integer("calls_connected"),
  meetingsScheduled: integer("meetings_scheduled"),

  // Behavioral patterns
  engagementPatterns: jsonb("engagement_patterns"),
  anomalies: jsonb("anomalies"),

  // Predictions
  engagementForecast: jsonb("engagement_forecast"),
  churnRiskScore: numeric("churn_risk_score", { precision: 5, scale: 4 }),

  // Metadata
  analysisId: varchar("analysis_id").references(() => researchAnalysisRecords.id, { onDelete: 'set null' }),

  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (table) => ({
  contactIdx: index("engagement_contact_idx").on(table.contactId),
  accountIdx: index("engagement_account_idx").on(table.accountId),
  campaignIdx: index("engagement_campaign_idx").on(table.campaignId),
  periodIdx: index("engagement_period_idx").on(table.analysisPeriodStart, table.analysisPeriodEnd),
  scoreIdx: index("engagement_score_idx").on(table.overallEngagementScore),
  createdIdx: index("engagement_created_idx").on(table.createdAt),
}));

// ==================== RESEARCH & ANALYSIS INSERT SCHEMAS ====================

export const insertResearchAnalysisRecordSchema = createInsertSchema(researchAnalysisRecords).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertScoringModelConfigurationSchema = createInsertSchema(scoringModelConfigurations).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertAccountHealthScoreSchema = createInsertSchema(accountHealthScores).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertNextBestActionRecordSchema = createInsertSchema(nextBestActionRecords).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertEngagementAnalysisRecordSchema = createInsertSchema(engagementAnalysisRecords).omit({
  id: true,
  createdAt: true,
});

// ==================== RESEARCH & ANALYSIS TYPES ====================

export type ResearchAnalysisRecord = typeof researchAnalysisRecords.$inferSelect;
export type InsertResearchAnalysisRecord = z.infer<typeof insertResearchAnalysisRecordSchema>;

export type ScoringModelConfiguration = typeof scoringModelConfigurations.$inferSelect;
export type InsertScoringModelConfiguration = z.infer<typeof insertScoringModelConfigurationSchema>;

export type AccountHealthScoreRecord = typeof accountHealthScores.$inferSelect;
export type InsertAccountHealthScoreRecord = z.infer<typeof insertAccountHealthScoreSchema>;

export type NextBestActionRecord = typeof nextBestActionRecords.$inferSelect;
export type InsertNextBestActionRecord = z.infer<typeof insertNextBestActionRecordSchema>;

export type EngagementAnalysisRecord = typeof engagementAnalysisRecords.$inferSelect;
export type InsertEngagementAnalysisRecord = z.infer<typeof insertEngagementAnalysisRecordSchema>;

// ==================== AGENTIC OPERATOR SYSTEM ====================

// Agent Prompt Type Enum
export const agentPromptTypeEnum = pgEnum('agent_prompt_type', [
  'system',           // System-level instructions
  'capability',       // Defines what agent can do
  'restriction',      // Defines what agent cannot do
  'persona',          // Agent personality/behavior
  'context'           // Context injection rules
]);

// Agent Execution Plan Status Enum
export const agentPlanStatusEnum = pgEnum('agent_plan_status', [
  'pending',          // Plan created, awaiting approval
  'approved',         // User approved the plan
  'executing',        // Plan is being executed
  'completed',        // Plan executed successfully
  'rejected',         // User rejected the plan
  'cancelled',        // Execution was cancelled
  'failed'            // Execution failed
]);

// Agent Prompts - Store role-specific prompts and capabilities
export const agentPrompts = pgTable("agent_prompts", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull(),
  description: text("description"),

  // Role associations (supports both legacy and modern IAM)
  userRole: userRoleEnum("user_role"),           // Legacy role enum
  iamRoleId: varchar("iam_role_id").references(() => iamRoles.id, { onDelete: 'set null' }),
  isClientPortal: boolean("is_client_portal").notNull().default(false), // For client portal users

  // Prompt configuration
  promptType: agentPromptTypeEnum("prompt_type").notNull().default('system'),
  promptContent: text("prompt_content").notNull(),

  // Capabilities and restrictions (JSON arrays of tool names)
  capabilities: jsonb("capabilities").$type<string[]>(),       // Allowed tools/actions
  restrictions: jsonb("restrictions").$type<string[]>(),       // Blocked tools/actions
  contextRules: jsonb("context_rules").$type<Record<string, any>>(),  // Rules for context injection

  // Metadata
  isActive: boolean("is_active").notNull().default(true),
  priority: integer("priority").notNull().default(0), // Higher priority evaluated first
  version: integer("version").notNull().default(1),

  // Audit fields
  createdBy: varchar("created_by").references(() => users.id, { onDelete: 'set null' }),
  updatedBy: varchar("updated_by").references(() => users.id, { onDelete: 'set null' }),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (table) => ({
  roleIdx: index("agent_prompts_role_idx").on(table.userRole),
  iamRoleIdx: index("agent_prompts_iam_role_idx").on(table.iamRoleId),
  activeIdx: index("agent_prompts_active_idx").on(table.isActive),
  priorityIdx: index("agent_prompts_priority_idx").on(table.priority),
  typeIdx: index("agent_prompts_type_idx").on(table.promptType),
}));

// Agent Prompt History - Version tracking and audit trail
export const agentPromptHistory = pgTable("agent_prompt_history", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  agentPromptId: varchar("agent_prompt_id").notNull().references(() => agentPrompts.id, { onDelete: 'cascade' }),

  // Previous state
  previousContent: text("previous_content").notNull(),
  previousCapabilities: jsonb("previous_capabilities").$type<string[]>(),
  previousRestrictions: jsonb("previous_restrictions").$type<string[]>(),

  // Change details
  changeReason: text("change_reason"),
  version: integer("version").notNull(),

  // Audit
  changedBy: varchar("changed_by").references(() => users.id, { onDelete: 'set null' }),
  changedAt: timestamp("changed_at").notNull().defaultNow(),
}, (table) => ({
  promptIdx: index("agent_prompt_history_prompt_idx").on(table.agentPromptId),
  versionIdx: index("agent_prompt_history_version_idx").on(table.version),
  changedAtIdx: index("agent_prompt_history_changed_at_idx").on(table.changedAt),
}));

// Agent Conversations - Persist chat sessions across navigation
export const agentConversations = pgTable("agent_conversations", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),

  // User associations (one of these will be set)
  userId: varchar("user_id").references(() => users.id, { onDelete: 'cascade' }),
  clientUserId: varchar("client_user_id"), // For client portal users

  // Session management
  sessionId: varchar("session_id").notNull(), // Browser session identifier
  title: text("title"), // Auto-generated or user-set title

  // Conversation state
  messages: jsonb("messages").$type<Array<{
    id: string;
    role: 'user' | 'assistant';
    content: string;
    timestamp: string;
    thoughtProcess?: string[];
    toolsExecuted?: Array<{ tool: string; args: any; result: any }>;
    planId?: string;
  }>>().notNull().default(sql`'[]'::jsonb`),

  context: jsonb("context").$type<Record<string, any>>(), // Additional context data

  // Status
  isActive: boolean("is_active").notNull().default(true),
  isPinned: boolean("is_pinned").notNull().default(false), // Pin important conversations

  // Timestamps
  lastMessageAt: timestamp("last_message_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (table) => ({
  userIdx: index("agent_conversations_user_idx").on(table.userId),
  clientUserIdx: index("agent_conversations_client_user_idx").on(table.clientUserId),
  sessionIdx: index("agent_conversations_session_idx").on(table.sessionId),
  activeIdx: index("agent_conversations_active_idx").on(table.isActive),
  lastMessageIdx: index("agent_conversations_last_message_idx").on(table.lastMessageAt),
}));

// Agent Execution Plans - Plan-before-execute tracking
export const agentExecutionPlans = pgTable("agent_execution_plans", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),

  // Associations
  conversationId: varchar("conversation_id").references(() => agentConversations.id, { onDelete: 'cascade' }),
  userId: varchar("user_id").references(() => users.id, { onDelete: 'cascade' }),
  clientUserId: varchar("client_user_id"), // For client portal users

  // Request
  requestMessage: text("request_message").notNull(),

  // Plan details
  plannedSteps: jsonb("planned_steps").$type<Array<{
    id: string;
    stepNumber: number;
    tool: string;
    description: string;
    args: Record<string, any>;
    isDestructive: boolean;
    estimatedImpact?: string;
  }>>().notNull(),

  // Risk assessment
  riskLevel: text("risk_level").notNull().default('low'), // 'low', 'medium', 'high'
  affectedEntities: jsonb("affected_entities").$type<string[]>(),

  // Execution state
  status: agentPlanStatusEnum("status").notNull().default('pending'),
  executedSteps: jsonb("executed_steps").$type<Array<{
    stepId: string;
    executedAt: string;
    result: any;
    success: boolean;
    error?: string;
  }>>().default(sql`'[]'::jsonb`),

  // User modifications
  userModifications: jsonb("user_modifications").$type<{
    modifiedSteps?: Array<{ stepId: string; originalArgs: any; newArgs: any }>;
    removedSteps?: string[];
    addedSteps?: Array<{ tool: string; args: any; insertAfter?: string }>;
  }>(),

  // Approval
  approvedBy: varchar("approved_by").references(() => users.id, { onDelete: 'set null' }),
  approvedAt: timestamp("approved_at"),
  rejectionReason: text("rejection_reason"),

  // Execution timing
  executionStartedAt: timestamp("execution_started_at"),
  executionCompletedAt: timestamp("execution_completed_at"),

  // Timestamps
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (table) => ({
  conversationIdx: index("agent_plans_conversation_idx").on(table.conversationId),
  userIdx: index("agent_plans_user_idx").on(table.userId),
  clientUserIdx: index("agent_plans_client_user_idx").on(table.clientUserId),
  statusIdx: index("agent_plans_status_idx").on(table.status),
  createdAtIdx: index("agent_plans_created_at_idx").on(table.createdAt),
}));

// ==================== AGENTIC OPERATOR INSERT SCHEMAS ====================

export const insertAgentPromptSchema = createInsertSchema(agentPrompts).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertAgentPromptHistorySchema = createInsertSchema(agentPromptHistory).omit({
  id: true,
  changedAt: true,
});

export const insertAgentConversationSchema = createInsertSchema(agentConversations).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertAgentExecutionPlanSchema = createInsertSchema(agentExecutionPlans).omit({
  id: true,
  createdAt: true,
});

// ==================== AGENTIC OPERATOR TYPES ====================

export type AgentPrompt = typeof agentPrompts.$inferSelect;
export type InsertAgentPrompt = z.infer<typeof insertAgentPromptSchema>;

export type AgentPromptHistory = typeof agentPromptHistory.$inferSelect;
export type InsertAgentPromptHistory = z.infer<typeof insertAgentPromptHistorySchema>;

export type AgentConversation = typeof agentConversations.$inferSelect;
export type InsertAgentConversation = z.infer<typeof insertAgentConversationSchema>;

export type AgentExecutionPlan = typeof agentExecutionPlans.$inferSelect;
export type InsertAgentExecutionPlan = z.infer<typeof insertAgentExecutionPlanSchema>;

// ==================== CLIENT SELF-SERVICE PORTAL SYSTEM ====================

/**
 * Client Feature Flags Enum
 * Controls which features are enabled for each client
 */
export const clientFeatureFlagEnum = pgEnum('client_feature_flag', [
  'accounts_contacts',       // Can manage accounts and contacts
  'bulk_upload',            // Can bulk upload contacts/accounts
  'campaign_creation',      // Can create campaigns
  'email_templates',        // Can create/manage email templates
  'call_flows',             // Can define call flows
  'voice_selection',        // Can select AI voices
  'calendar_booking',       // Can configure calendar booking
  'analytics_dashboard',    // Can access analytics
  'reports_export',         // Can export reports
  'api_access',             // Has API access
  'organization_intelligence', // Can view/edit organization intelligence for campaigns
]);

/**
 * Client Business Profile
 * Stores legal business information for compliance (email footers, etc.)
 */
export const clientBusinessProfiles = pgTable("client_business_profiles", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  clientAccountId: varchar("client_account_id").notNull().unique().references(() => clientAccounts.id, { onDelete: 'cascade' }),

  // Legal Business Information (Required for compliance)
  legalBusinessName: text("legal_business_name"),
  dbaName: text("dba_name"), // DBA / Trade Name (optional)
  
  // Physical Address (Required for CAN-SPAM, GDPR compliance)
  addressLine1: text("address_line1"),
  addressLine2: text("address_line2"),
  city: text("city"),
  state: text("state"),
  postalCode: text("postal_code"),
  country: text("country").notNull().default('United States'),

  // Custom Unsubscribe URL (for client's own unsubscribe mechanism)
  customUnsubscribeUrl: text("custom_unsubscribe_url"),

  // Optional Business Details
  website: text("website"),
  phone: text("phone"),
  supportEmail: text("support_email"),

  // Logo and Branding
  logoUrl: text("logo_url"),
  brandColor: varchar("brand_color", { length: 7 }), // Hex color e.g. #3B82F6

  // Audit
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
  updatedBy: varchar("updated_by").references(() => clientUsers.id, { onDelete: 'set null' }),
}, (table) => ({
  clientAccountIdx: uniqueIndex("client_business_profiles_client_idx").on(table.clientAccountId),
}));

/**
 * Client Feature Access
 * Stores which features are enabled for each client (admin-controlled)
 */
export const clientFeatureAccess = pgTable("client_feature_access", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  clientAccountId: varchar("client_account_id").notNull().references(() => clientAccounts.id, { onDelete: 'cascade' }),
  
  // Feature flag
  feature: clientFeatureFlagEnum("feature").notNull(),
  
  // Is this feature enabled?
  isEnabled: boolean("is_enabled").notNull().default(true),
  
  // Feature-specific configuration (optional)
  config: jsonb("config").$type<Record<string, any>>(),

  // Audit
  enabledBy: varchar("enabled_by").references(() => users.id, { onDelete: 'set null' }),
  enabledAt: timestamp("enabled_at").notNull().defaultNow(),
  disabledBy: varchar("disabled_by").references(() => users.id, { onDelete: 'set null' }),
  disabledAt: timestamp("disabled_at"),
}, (table) => ({
  clientFeatureIdx: uniqueIndex("client_feature_access_unique_idx").on(table.clientAccountId, table.feature),
  clientAccountIdx: index("client_feature_access_client_idx").on(table.clientAccountId),
}));

/**
 * Client Accounts (CRM) - Client's own account records
 * Separate from our internal accounts table
 */
export const clientCrmAccounts = pgTable("client_crm_accounts", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  clientAccountId: varchar("client_account_id").notNull().references(() => clientAccounts.id, { onDelete: 'cascade' }),

  // Account Information
  name: text("name").notNull(),
  domain: text("domain"),
  industry: text("industry"),
  employees: text("employees"),
  annualRevenue: text("annual_revenue"),
  
  // Location
  city: text("city"),
  state: text("state"),
  country: text("country"),
  
  // Contact Info
  phone: text("phone"),
  website: text("website"),

  // Classification
  accountType: text("account_type"), // prospect, customer, partner
  status: text("status").default('active'),
  
  // Custom Fields
  customFields: jsonb("custom_fields").$type<Record<string, any>>(),

  // Source tracking
  source: text("source"),
  sourceId: varchar("source_id"),

  // Audit
  createdBy: varchar("created_by").references(() => clientUsers.id, { onDelete: 'set null' }),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (table) => ({
  clientAccountIdx: index("client_crm_accounts_client_idx").on(table.clientAccountId),
  nameIdx: index("client_crm_accounts_name_idx").on(table.name),
  domainIdx: index("client_crm_accounts_domain_idx").on(table.domain),
}));

/**
 * Client Contacts (CRM) - Client's own contact records
 */
export const clientCrmContacts = pgTable("client_crm_contacts", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  clientAccountId: varchar("client_account_id").notNull().references(() => clientAccounts.id, { onDelete: 'cascade' }),
  crmAccountId: varchar("crm_account_id").references(() => clientCrmAccounts.id, { onDelete: 'set null' }),

  // Contact Information
  firstName: text("first_name"),
  lastName: text("last_name"),
  email: text("email"),
  phone: text("phone"),
  mobile: text("mobile"),
  
  // Professional Info
  title: text("title"),
  department: text("department"),
  linkedinUrl: text("linkedin_url"),
  
  // Company (denormalized for display)
  company: text("company"),
  
  // Status
  status: text("status").default('active'),
  
  // Opt-out tracking
  emailOptOut: boolean("email_opt_out").default(false),
  phoneOptOut: boolean("phone_opt_out").default(false),
  optOutDate: timestamp("opt_out_date"),
  
  // Custom Fields
  customFields: jsonb("custom_fields").$type<Record<string, any>>(),

  // Source tracking
  source: text("source"),
  sourceId: varchar("source_id"),

  // Audit
  createdBy: varchar("created_by").references(() => clientUsers.id, { onDelete: 'set null' }),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (table) => ({
  clientAccountIdx: index("client_crm_contacts_client_idx").on(table.clientAccountId),
  crmAccountIdx: index("client_crm_contacts_crm_account_idx").on(table.crmAccountId),
  emailIdx: index("client_crm_contacts_email_idx").on(table.email),
  nameIdx: index("client_crm_contacts_name_idx").on(table.firstName, table.lastName),
}));

/**
 * Client Campaigns - Client-created campaigns
 */
export const clientCampaigns = pgTable("client_campaigns", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  clientAccountId: varchar("client_account_id").notNull().references(() => clientAccounts.id, { onDelete: 'cascade' }),

  // Campaign Details
  name: text("name").notNull(),
  description: text("description"),
  campaignType: text("campaign_type").notNull(), // 'call', 'email', 'mixed'
  status: text("status").notNull().default('draft'), // draft, active, paused, completed
  
  // Objectives and Content
  objectives: text("objectives"),
  keyTalkingPoints: jsonb("key_talking_points").$type<string[]>(),
  targetAudience: text("target_audience"),
  
  // Call Configuration
  callFlowId: varchar("call_flow_id").references(() => clientCallFlows.id, { onDelete: 'set null' }),
  voiceId: text("voice_id"), // Gemini voice ID
  voiceName: text("voice_name"),
  
  // Email Configuration
  defaultEmailTemplateId: varchar("default_email_template_id").references(() => clientEmailTemplates.id, { onDelete: 'set null' }),
  senderName: text("sender_name"),
  senderEmail: text("sender_email"),
  
  // Booking Configuration (for appointment campaigns)
  bookingEnabled: boolean("booking_enabled").default(false),
  bookingUrl: text("booking_url"),
  calendarIntegration: text("calendar_integration"), // 'calendly', 'google', 'outlook'
  
  // Timing
  startDate: date("start_date"),
  endDate: date("end_date"),
  
  // Statistics (denormalized for performance)
  totalContacts: integer("total_contacts").default(0),
  contactsReached: integer("contacts_reached").default(0),
  appointmentsBooked: integer("appointments_booked").default(0),
  
  // Audit
  createdBy: varchar("created_by").references(() => clientUsers.id, { onDelete: 'set null' }),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (table) => ({
  clientAccountIdx: index("client_campaigns_client_idx").on(table.clientAccountId),
  statusIdx: index("client_campaigns_status_idx").on(table.status),
  typeIdx: index("client_campaigns_type_idx").on(table.campaignType),
}));

/**
 * Client Campaign Contacts - Links contacts to campaigns
 */
export const clientCampaignContacts = pgTable("client_campaign_contacts", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  campaignId: varchar("campaign_id").notNull().references(() => clientCampaigns.id, { onDelete: 'cascade' }),
  contactId: varchar("contact_id").notNull().references(() => clientCrmContacts.id, { onDelete: 'cascade' }),
  
  // Status within campaign
  status: text("status").default('pending'), // pending, scheduled, contacted, responded, converted
  
  // Activity tracking
  lastContactedAt: timestamp("last_contacted_at"),
  responseAt: timestamp("response_at"),
  conversionAt: timestamp("conversion_at"),
  
  // Notes
  notes: text("notes"),

  addedAt: timestamp("added_at").notNull().defaultNow(),
  addedBy: varchar("added_by").references(() => clientUsers.id, { onDelete: 'set null' }),
}, (table) => ({
  campaignContactIdx: uniqueIndex("client_campaign_contacts_unique_idx").on(table.campaignId, table.contactId),
  campaignIdx: index("client_campaign_contacts_campaign_idx").on(table.campaignId),
  contactIdx: index("client_campaign_contacts_contact_idx").on(table.contactId),
  statusIdx: index("client_campaign_contacts_status_idx").on(table.status),
}));

/**
 * Client Email Templates - Client-created email templates
 */
export const clientEmailTemplates = pgTable("client_email_templates", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  clientAccountId: varchar("client_account_id").notNull().references(() => clientAccounts.id, { onDelete: 'cascade' }),

  // Template Details
  name: text("name").notNull(),
  description: text("description"),
  category: text("category"), // 'outreach', 'follow-up', 'nurture', etc.
  
  // Email Content
  subject: text("subject").notNull(),
  bodyHtml: text("body_html").notNull(),
  bodyText: text("body_text"),
  
  // Personalization
  mergeFields: jsonb("merge_fields").$type<string[]>(), // Available merge fields
  
  // Status
  isActive: boolean("is_active").default(true),
  isDefault: boolean("is_default").default(false),
  
  // Statistics
  timesUsed: integer("times_used").default(0),
  
  // Audit
  createdBy: varchar("created_by").references(() => clientUsers.id, { onDelete: 'set null' }),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (table) => ({
  clientAccountIdx: index("client_email_templates_client_idx").on(table.clientAccountId),
  categoryIdx: index("client_email_templates_category_idx").on(table.category),
  activeIdx: index("client_email_templates_active_idx").on(table.isActive),
}));

/**
 * Client Call Flows - Client-defined AI call scripts/flows
 */
export const clientCallFlows = pgTable("client_call_flows", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  clientAccountId: varchar("client_account_id").notNull().references(() => clientAccounts.id, { onDelete: 'cascade' }),

  // Flow Details
  name: text("name").notNull(),
  description: text("description"),
  
  // Call Script/Flow Definition
  greeting: text("greeting"),
  qualificationQuestions: jsonb("qualification_questions").$type<Array<{
    id: string;
    question: string;
    expectedResponses?: string[];
    followUp?: string;
    required?: boolean;
  }>>(),
  objectionHandling: jsonb("objection_handling").$type<Array<{
    objection: string;
    response: string;
  }>>(),
  closingScript: text("closing_script"),
  
  // Appointment Booking Script
  appointmentScript: text("appointment_script"),
  
  // Voice Configuration
  voiceId: text("voice_id"),
  voiceName: text("voice_name"),
  speakingRate: numeric("speaking_rate", { precision: 3, scale: 2 }).default('1.0'),
  
  // Status
  isActive: boolean("is_active").default(true),
  isDefault: boolean("is_default").default(false),

  // Audit
  createdBy: varchar("created_by").references(() => clientUsers.id, { onDelete: 'set null' }),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (table) => ({
  clientAccountIdx: index("client_call_flows_client_idx").on(table.clientAccountId),
  activeIdx: index("client_call_flows_active_idx").on(table.isActive),
}));

/**
 * Client Bulk Import Jobs - Tracks bulk upload operations
 */
export const clientBulkImports = pgTable("client_bulk_imports", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  clientAccountId: varchar("client_account_id").notNull().references(() => clientAccounts.id, { onDelete: 'cascade' }),

  // Import Details
  importType: text("import_type").notNull(), // 'contacts', 'accounts'
  fileName: text("file_name"),
  fileUrl: text("file_url"),
  
  // Status
  status: text("status").notNull().default('pending'), // pending, processing, completed, failed
  
  // Counts
  totalRows: integer("total_rows").default(0),
  processedRows: integer("processed_rows").default(0),
  successCount: integer("success_count").default(0),
  errorCount: integer("error_count").default(0),
  duplicateCount: integer("duplicate_count").default(0),
  
  // Mapping Configuration
  columnMapping: jsonb("column_mapping").$type<Record<string, string>>(),
  
  // Errors
  errors: jsonb("errors").$type<Array<{
    row: number;
    field?: string;
    message: string;
  }>>(),

  // Campaign assignment (optional)
  campaignId: varchar("campaign_id").references(() => clientCampaigns.id, { onDelete: 'set null' }),

  // Audit
  uploadedBy: varchar("uploaded_by").references(() => clientUsers.id, { onDelete: 'set null' }),
  startedAt: timestamp("started_at"),
  completedAt: timestamp("completed_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (table) => ({
  clientAccountIdx: index("client_bulk_imports_client_idx").on(table.clientAccountId),
  statusIdx: index("client_bulk_imports_status_idx").on(table.status),
}));

// ==================== CLIENT SELF-SERVICE RELATIONS ====================

export const clientBusinessProfilesRelations = relations(clientBusinessProfiles, ({ one }) => ({
  clientAccount: one(clientAccounts, { fields: [clientBusinessProfiles.clientAccountId], references: [clientAccounts.id] }),
  updatedByUser: one(clientUsers, { fields: [clientBusinessProfiles.updatedBy], references: [clientUsers.id] }),
}));

export const clientFeatureAccessRelations = relations(clientFeatureAccess, ({ one }) => ({
  clientAccount: one(clientAccounts, { fields: [clientFeatureAccess.clientAccountId], references: [clientAccounts.id] }),
  enabledByUser: one(users, { fields: [clientFeatureAccess.enabledBy], references: [users.id] }),
}));

export const clientCrmAccountsRelations = relations(clientCrmAccounts, ({ one, many }) => ({
  clientAccount: one(clientAccounts, { fields: [clientCrmAccounts.clientAccountId], references: [clientAccounts.id] }),
  contacts: many(clientCrmContacts),
  createdByUser: one(clientUsers, { fields: [clientCrmAccounts.createdBy], references: [clientUsers.id] }),
}));

export const clientCrmContactsRelations = relations(clientCrmContacts, ({ one }) => ({
  clientAccount: one(clientAccounts, { fields: [clientCrmContacts.clientAccountId], references: [clientAccounts.id] }),
  crmAccount: one(clientCrmAccounts, { fields: [clientCrmContacts.crmAccountId], references: [clientCrmAccounts.id] }),
  createdByUser: one(clientUsers, { fields: [clientCrmContacts.createdBy], references: [clientUsers.id] }),
}));

export const clientCampaignsRelations = relations(clientCampaigns, ({ one, many }) => ({
  clientAccount: one(clientAccounts, { fields: [clientCampaigns.clientAccountId], references: [clientAccounts.id] }),
  callFlow: one(clientCallFlows, { fields: [clientCampaigns.callFlowId], references: [clientCallFlows.id] }),
  emailTemplate: one(clientEmailTemplates, { fields: [clientCampaigns.defaultEmailTemplateId], references: [clientEmailTemplates.id] }),
  contacts: many(clientCampaignContacts),
  createdByUser: one(clientUsers, { fields: [clientCampaigns.createdBy], references: [clientUsers.id] }),
}));

export const clientCampaignContactsRelations = relations(clientCampaignContacts, ({ one }) => ({
  campaign: one(clientCampaigns, { fields: [clientCampaignContacts.campaignId], references: [clientCampaigns.id] }),
  contact: one(clientCrmContacts, { fields: [clientCampaignContacts.contactId], references: [clientCrmContacts.id] }),
  addedByUser: one(clientUsers, { fields: [clientCampaignContacts.addedBy], references: [clientUsers.id] }),
}));

export const clientEmailTemplatesRelations = relations(clientEmailTemplates, ({ one }) => ({
  clientAccount: one(clientAccounts, { fields: [clientEmailTemplates.clientAccountId], references: [clientAccounts.id] }),
  createdByUser: one(clientUsers, { fields: [clientEmailTemplates.createdBy], references: [clientUsers.id] }),
}));

export const clientCallFlowsRelations = relations(clientCallFlows, ({ one }) => ({
  clientAccount: one(clientAccounts, { fields: [clientCallFlows.clientAccountId], references: [clientAccounts.id] }),
  createdByUser: one(clientUsers, { fields: [clientCallFlows.createdBy], references: [clientUsers.id] }),
}));

export const clientBulkImportsRelations = relations(clientBulkImports, ({ one }) => ({
  clientAccount: one(clientAccounts, { fields: [clientBulkImports.clientAccountId], references: [clientAccounts.id] }),
  campaign: one(clientCampaigns, { fields: [clientBulkImports.campaignId], references: [clientCampaigns.id] }),
  uploadedByUser: one(clientUsers, { fields: [clientBulkImports.uploadedBy], references: [clientUsers.id] }),
}));

// ==================== CLIENT SELF-SERVICE INSERT SCHEMAS ====================

export const insertClientBusinessProfileSchema = createInsertSchema(clientBusinessProfiles).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertClientFeatureAccessSchema = createInsertSchema(clientFeatureAccess).omit({
  id: true,
});

export const insertClientCrmAccountSchema = createInsertSchema(clientCrmAccounts).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertClientCrmContactSchema = createInsertSchema(clientCrmContacts).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertClientCampaignSchema = createInsertSchema(clientCampaigns).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertClientCampaignContactSchema = createInsertSchema(clientCampaignContacts).omit({
  id: true,
  addedAt: true,
});

export const insertClientEmailTemplateSchema = createInsertSchema(clientEmailTemplates).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertClientCallFlowSchema = createInsertSchema(clientCallFlows).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertClientBulkImportSchema = createInsertSchema(clientBulkImports).omit({
  id: true,
  createdAt: true,
});

// ==================== CLIENT SELF-SERVICE TYPES ====================

export type ClientBusinessProfile = typeof clientBusinessProfiles.$inferSelect;
export type InsertClientBusinessProfile = z.infer<typeof insertClientBusinessProfileSchema>;

export type ClientFeatureAccess = typeof clientFeatureAccess.$inferSelect;
export type InsertClientFeatureAccess = z.infer<typeof insertClientFeatureAccessSchema>;

export type ClientCrmAccount = typeof clientCrmAccounts.$inferSelect;
export type InsertClientCrmAccount = z.infer<typeof insertClientCrmAccountSchema>;

export type ClientCrmContact = typeof clientCrmContacts.$inferSelect;
export type InsertClientCrmContact = z.infer<typeof insertClientCrmContactSchema>;

export type ClientCampaign = typeof clientCampaigns.$inferSelect;
export type InsertClientCampaign = z.infer<typeof insertClientCampaignSchema>;

export type ClientCampaignContact = typeof clientCampaignContacts.$inferSelect;
export type InsertClientCampaignContact = z.infer<typeof insertClientCampaignContactSchema>;

export type ClientEmailTemplate = typeof clientEmailTemplates.$inferSelect;
export type InsertClientEmailTemplate = z.infer<typeof insertClientEmailTemplateSchema>;

export type ClientCallFlow = typeof clientCallFlows.$inferSelect;
export type InsertClientCallFlow = z.infer<typeof insertClientCallFlowSchema>;

export type ClientBulkImport = typeof clientBulkImports.$inferSelect;
export type InsertClientBulkImport = z.infer<typeof insertClientBulkImportSchema>;

// Feature flag type for type-safe feature checks
export type ClientFeatureFlag = 
  | 'accounts_contacts'
  | 'bulk_upload'
  | 'campaign_creation'
  | 'email_templates'
  | 'call_flows'
  | 'voice_selection'
  | 'calendar_booking'
  | 'analytics_dashboard'
  | 'reports_export'
  | 'api_access';


// Calendar & Booking System Schema

export const bookingTypes = pgTable("booking_types", {
  id: serial("id").primaryKey(),
  userId: varchar("user_id").references(() => users.id),
  name: text("name").notNull(), // e.g. "Discovery Call"
  slug: text("slug").notNull(), // e.g. "discovery-call"
  description: text("description"),
  duration: integer("duration").notNull(), // in minutes
  isActive: boolean("is_active").default(true),
  color: text("color").default("#3b82f6"), // For UI
  requiresApproval: boolean("requires_approval").default(false),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const availabilitySlots = pgTable("availability_slots", {
  id: serial("id").primaryKey(),
  userId: varchar("user_id").references(() => users.id),
  dayOfWeek: integer("day_of_week").notNull(), // 0=Sunday, 1=Monday...
  startTime: text("start_time").notNull(), // "09:00"
  endTime: text("end_time").notNull(), // "17:00"
  timezone: text("timezone").default("UTC"),
  isActive: boolean("is_active").default(true),
});

export const bookings = pgTable("bookings", {
  id: serial("id").primaryKey(),
  bookingTypeId: integer("booking_type_id").references(() => bookingTypes.id),
  hostUserId: varchar("host_user_id").references(() => users.id),
  guestName: text("guest_name").notNull(),
  guestEmail: text("guest_email").notNull(),
  guestNotes: text("guest_notes"),
  startTime: timestamp("start_time").notNull(),
  endTime: timestamp("end_time").notNull(),
  status: text("status").default("confirmed"), // confirmed, cancelled, rescheduled
  googleEventId: text("google_event_id"), // For Google Calendar sync
  meetingUrl: text("meeting_url"), // Google Meet link or other
  createdAt: timestamp("created_at").defaultNow(),
});

export const googleCalendarIntegrations = pgTable("google_calendar_integrations", {
  id: serial("id").primaryKey(),
  userId: varchar("user_id").references(() => users.id).unique(),
  accessToken: text("access_token"),
  refreshToken: text("refresh_token"),
  tokenExpiry: timestamp("token_expiry"),
  calendarId: text("calendar_id").default("primary"),
  isActive: boolean("is_active").default(true),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Relationships
export const bookingTypesRelations = relations(bookingTypes, ({ one, many }) => ({
  user: one(users, {
    fields: [bookingTypes.userId],
    references: [users.id],
  }),
  bookings: many(bookings),
}));

export const bookingsRelations = relations(bookings, ({ one }) => ({
  bookingType: one(bookingTypes, {
    fields: [bookings.bookingTypeId],
    references: [bookingTypes.id],
  }),
  host: one(users, {
    fields: [bookings.hostUserId],
    references: [users.id],
  }),
}));

export const availabilitySlotsRelations = relations(availabilitySlots, ({ one }) => ({
  user: one(users, {
    fields: [availabilitySlots.userId],
    references: [users.id],
  }),
}));

export const googleCalendarIntegrationsRelations = relations(googleCalendarIntegrations, ({ one }) => ({
  user: one(users, {
    fields: [googleCalendarIntegrations.userId],
    references: [users.id],
  }),
}));

// Insert Schemas
export const insertBookingTypeSchema = createInsertSchema(bookingTypes);
export const insertAvailabilitySlotSchema = createInsertSchema(availabilitySlots);
export const insertBookingSchema = createInsertSchema(bookings);
export const insertGoogleCalendarIntegrationSchema = createInsertSchema(googleCalendarIntegrations);

// ============================================
// GENERATIVE STUDIO TABLES
// ============================================

export const generativeStudioProjects = pgTable("generative_studio_projects", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  title: text("title").notNull(),
  contentType: contentAssetTypeEnum("content_type").notNull(),
  status: generativeStudioContentStatusEnum("status").notNull().default('generating'),

  // Generation input
  prompt: text("prompt").notNull(),
  targetAudience: text("target_audience"),
  industry: text("industry"),
  tone: contentToneEnum("tone"),
  brandKitId: varchar("brand_kit_id"),
  additionalContext: text("additional_context"),
  generationParams: jsonb("generation_params"),

  // Generated output
  generatedContent: text("generated_content"),
  generatedContentHtml: text("generated_content_html"),
  variants: jsonb("variants"),

  // Content-type specific metadata (SEO, chapters, sections, subject lines, etc.)
  metadata: jsonb("metadata"),

  // Linked content asset when saved/published
  contentAssetId: varchar("content_asset_id"),
  exportedFileUrl: text("exported_file_url"),
  thumbnailUrl: text("thumbnail_url"),

  // AI tracking
  aiModel: text("ai_model"),
  tokensUsed: integer("tokens_used"),
  generationDurationMs: integer("generation_duration_ms"),

  // Ownership
  ownerId: varchar("owner_id").notNull(),
  tenantId: varchar("tenant_id"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (table) => ({
  contentTypeIdx: index("gen_studio_projects_content_type_idx").on(table.contentType),
  statusIdx: index("gen_studio_projects_status_idx").on(table.status),
  ownerIdx: index("gen_studio_projects_owner_idx").on(table.ownerId),
  createdAtIdx: index("gen_studio_projects_created_at_idx").on(table.createdAt),
}));

export const generativeStudioChatMessages = pgTable("generative_studio_chat_messages", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  sessionId: varchar("session_id").notNull(),
  role: text("role").notNull(), // 'user' | 'assistant' | 'system'
  content: text("content").notNull(),
  projectId: varchar("project_id"),
  model: text("model"),
  tokensUsed: integer("tokens_used"),
  ownerId: varchar("owner_id").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (table) => ({
  sessionIdx: index("gen_studio_chat_session_idx").on(table.sessionId),
  ownerIdx: index("gen_studio_chat_owner_idx").on(table.ownerId),
  createdAtIdx: index("gen_studio_chat_created_at_idx").on(table.createdAt),
}));

export const generativeStudioPublishedPages = pgTable("generative_studio_published_pages", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  projectId: varchar("project_id").notNull(),
  contentType: contentAssetTypeEnum("content_type").notNull(),
  title: text("title").notNull(),
  slug: text("slug").notNull(),
  htmlContent: text("html_content").notNull(),
  cssContent: text("css_content"),
  metaTitle: text("meta_title"),
  metaDescription: text("meta_description"),
  ogImageUrl: text("og_image_url"),
  isPublished: boolean("is_published").notNull().default(false),
  publishedAt: timestamp("published_at"),
  unpublishedAt: timestamp("unpublished_at"),
  viewCount: integer("view_count").notNull().default(0),
  ownerId: varchar("owner_id").notNull(),
  tenantId: varchar("tenant_id"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (table) => ({
  slugIdx: index("gen_studio_published_slug_idx").on(table.slug),
  contentTypeIdx: index("gen_studio_published_type_idx").on(table.contentType),
  isPublishedIdx: index("gen_studio_published_is_published_idx").on(table.isPublished),
}));

// Generative Studio insert schemas
export const insertGenerativeStudioProjectSchema = createInsertSchema(generativeStudioProjects).omit({
  id: true,
  ownerId: true,
  createdAt: true,
  updatedAt: true,
});

export const insertGenerativeStudioChatMessageSchema = createInsertSchema(generativeStudioChatMessages).omit({
  id: true,
  ownerId: true,
  createdAt: true,
});

export const insertGenerativeStudioPublishedPageSchema = createInsertSchema(generativeStudioPublishedPages).omit({
  id: true,
  ownerId: true,
  createdAt: true,
  updatedAt: true,
});

// Generative Studio types
export type GenerativeStudioProject = typeof generativeStudioProjects.$inferSelect;
export type InsertGenerativeStudioProject = z.infer<typeof insertGenerativeStudioProjectSchema>;
export type GenerativeStudioChatMessage = typeof generativeStudioChatMessages.$inferSelect;
export type InsertGenerativeStudioChatMessage = z.infer<typeof insertGenerativeStudioChatMessageSchema>;
export type GenerativeStudioPublishedPage = typeof generativeStudioPublishedPages.$inferSelect;
export type InsertGenerativeStudioPublishedPage = z.infer<typeof insertGenerativeStudioPublishedPageSchema>;

// ============================================
// EXTERNAL EVENTS (Argyle Event-Sourced Campaign Drafts)
// ============================================
export const externalEvents = pgTable("external_events", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  clientId: varchar("client_id").notNull().references(() => clientAccounts.id, { onDelete: 'cascade' }),
  sourceProvider: varchar("source_provider").notNull().default('argyle'),
  externalId: varchar("external_id").notNull(),
  sourceUrl: text("source_url").notNull(),
  sourceHash: varchar("source_hash"),
  title: text("title").notNull(),
  community: varchar("community"),
  eventType: varchar("event_type"),
  location: text("location"),
  startAtIso: timestamp("start_at_iso", { withTimezone: true }),
  startAtHuman: varchar("start_at_human"),
  needsDateReview: boolean("needs_date_review").default(false),
  overviewExcerpt: text("overview_excerpt"),
  agendaExcerpt: text("agenda_excerpt"),
  speakersExcerpt: text("speakers_excerpt"),
  lastSyncedAt: timestamp("last_synced_at", { withTimezone: true }).notNull().defaultNow(),
  syncStatus: varchar("sync_status").default('synced'),
  syncError: text("sync_error"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
  clientIdx: index("external_events_client_idx").on(table.clientId),
  providerIdx: index("external_events_provider_idx").on(table.sourceProvider),
  startAtIdx: index("external_events_start_at_idx").on(table.startAtIso),
  uniqueKey: unique("external_events_unique_key").on(table.clientId, table.sourceProvider, table.externalId),
}));

export const insertExternalEventSchema = createInsertSchema(externalEvents).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type ExternalEvent = typeof externalEvents.$inferSelect;
export type InsertExternalEvent = z.infer<typeof insertExternalEventSchema>;

// ============================================
// WORK ORDER DRAFTS (Event-linked campaign drafts)
// ============================================
export const workOrderDrafts = pgTable("work_order_drafts", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  clientAccountId: varchar("client_account_id").notNull().references(() => clientAccounts.id, { onDelete: 'cascade' }),
  clientUserId: varchar("client_user_id").references(() => clientUsers.id, { onDelete: 'set null' }),
  externalEventId: varchar("external_event_id").references(() => externalEvents.id, { onDelete: 'set null' }),
  status: varchar("status").notNull().default('draft'),
  sourceFields: jsonb("source_fields").$type<Record<string, any>>().notNull().default({}),
  draftFields: jsonb("draft_fields").$type<Record<string, any>>().notNull().default({}),
  editedFields: jsonb("edited_fields").$type<string[]>().notNull().default([]),
  leadCount: integer("lead_count"),
  workOrderId: varchar("work_order_id").references(() => workOrders.id, { onDelete: 'set null' }),
  submittedAt: timestamp("submitted_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
  clientIdx: index("work_order_drafts_client_idx").on(table.clientAccountId),
  eventIdx: index("work_order_drafts_event_idx").on(table.externalEventId),
  statusIdx: index("work_order_drafts_status_idx").on(table.status),
}));

export const insertWorkOrderDraftSchema = createInsertSchema(workOrderDrafts).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type WorkOrderDraft = typeof workOrderDrafts.$inferSelect;
export type InsertWorkOrderDraft = z.infer<typeof insertWorkOrderDraftSchema>;

// ─────────────────────────────────────────────────────────────────────────────
// Mercury Bridge — Notification System Tables
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Mercury notification templates — reusable email templates with Mustache-style variables.
 * Separate from transactionalEmailTemplates to avoid scope contamination.
 */
export const mercuryTemplates = pgTable("mercury_templates", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  templateKey: varchar("template_key").notNull().unique(),
  name: varchar("name").notNull(),
  description: text("description"),
  subjectTemplate: text("subject_template").notNull(),
  htmlTemplate: text("html_template").notNull(),
  textTemplate: text("text_template"),
  variables: jsonb("variables").$type<Array<{
    name: string;
    description: string;
    required: boolean;
    defaultValue?: string;
    exampleValue?: string;
  }>>().notNull().default([]),
  isEnabled: boolean("is_enabled").default(true).notNull(),
  version: integer("version").default(1).notNull(),
  category: varchar("category").default('notification'),
  createdBy: varchar("created_by").references(() => users.id, { onDelete: 'set null' }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
  keyIdx: uniqueIndex("mercury_templates_key_idx").on(table.templateKey),
  enabledIdx: index("mercury_templates_enabled_idx").on(table.isEnabled),
  categoryIdx: index("mercury_templates_category_idx").on(table.category),
}));

export const insertMercuryTemplateSchema = createInsertSchema(mercuryTemplates).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type MercuryTemplate = typeof mercuryTemplates.$inferSelect;
export type InsertMercuryTemplate = z.infer<typeof insertMercuryTemplateSchema>;

/**
 * Mercury email outbox — queued emails with status tracking and idempotency.
 */
export const mercuryEmailOutbox = pgTable("mercury_email_outbox", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  templateKey: varchar("template_key").notNull(),
  recipientEmail: text("recipient_email").notNull(),
  recipientName: text("recipient_name"),
  recipientUserId: varchar("recipient_user_id"),
  recipientUserType: varchar("recipient_user_type").default('client'), // 'admin' | 'client'
  tenantId: varchar("tenant_id"), // clientAccountId
  subject: text("subject").notNull(),
  htmlBody: text("html_body").notNull(),
  textBody: text("text_body"),
  fromEmail: text("from_email").notNull().default('mercury@pivotal-b2b.com'),
  fromName: text("from_name").notNull().default('Pivotal B2B'),
  status: varchar("status").notNull().default('queued'), // queued | sending | sent | failed | skipped
  messageId: varchar("message_id"),
  errorMessage: text("error_message"),
  retryCount: integer("retry_count").default(0).notNull(),
  maxRetries: integer("max_retries").default(3).notNull(),
  idempotencyKey: varchar("idempotency_key").unique(),
  metadata: jsonb("metadata").$type<Record<string, any>>(),
  scheduledAt: timestamp("scheduled_at", { withTimezone: true }),
  sentAt: timestamp("sent_at", { withTimezone: true }),
  failedAt: timestamp("failed_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
  statusIdx: index("mercury_outbox_status_idx").on(table.status),
  recipientIdx: index("mercury_outbox_recipient_idx").on(table.recipientEmail),
  tenantIdx: index("mercury_outbox_tenant_idx").on(table.tenantId),
  templateIdx: index("mercury_outbox_template_idx").on(table.templateKey),
  idempotencyIdx: uniqueIndex("mercury_outbox_idempotency_idx").on(table.idempotencyKey),
  createdIdx: index("mercury_outbox_created_idx").on(table.createdAt),
}));

export const insertMercuryEmailOutboxSchema = createInsertSchema(mercuryEmailOutbox).omit({
  id: true,
  createdAt: true,
});
export type MercuryEmailOutbox = typeof mercuryEmailOutbox.$inferSelect;
export type InsertMercuryEmailOutbox = z.infer<typeof insertMercuryEmailOutboxSchema>;

/**
 * Mercury notification events — domain event log for the notification framework.
 */
export const mercuryNotificationEvents = pgTable("mercury_notification_events", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  eventType: varchar("event_type").notNull(), // e.g. 'project_request_approved', 'campaign_launched'
  tenantId: varchar("tenant_id"), // clientAccountId
  actorUserId: varchar("actor_user_id"), // user who triggered the event
  payload: jsonb("payload").$type<Record<string, any>>().notNull().default({}),
  processedAt: timestamp("processed_at", { withTimezone: true }),
  errorMessage: text("error_message"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
  eventTypeIdx: index("mercury_events_type_idx").on(table.eventType),
  tenantIdx: index("mercury_events_tenant_idx").on(table.tenantId),
  processedIdx: index("mercury_events_processed_idx").on(table.processedAt),
  createdIdx: index("mercury_events_created_idx").on(table.createdAt),
}));

export type MercuryNotificationEvent = typeof mercuryNotificationEvents.$inferSelect;

/**
 * Mercury notification rules — maps event types to templates and recipient resolvers.
 */
export const mercuryNotificationRules = pgTable("mercury_notification_rules", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  eventType: varchar("event_type").notNull(),
  templateKey: varchar("template_key").notNull(),
  channelType: varchar("channel_type").notNull().default('email'), // 'email' | 'sms' | 'in_app'
  recipientResolver: varchar("recipient_resolver").notNull(), // 'requester' | 'tenant_admins' | 'all_tenant_users' | 'custom'
  customRecipients: jsonb("custom_recipients").$type<string[]>(),
  isEnabled: boolean("is_enabled").default(true).notNull(),
  description: text("description"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
  eventTypeIdx: index("mercury_rules_event_type_idx").on(table.eventType),
  enabledIdx: index("mercury_rules_enabled_idx").on(table.isEnabled),
}));

export type MercuryNotificationRule = typeof mercuryNotificationRules.$inferSelect;

/**
 * Mercury invitation tokens — secure one-time-use client portal invitation tokens.
 */
export const mercuryInvitationTokens = pgTable("mercury_invitation_tokens", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  clientUserId: varchar("client_user_id").references(() => clientUsers.id, { onDelete: 'cascade' }).notNull(),
  clientAccountId: varchar("client_account_id").references(() => clientAccounts.id, { onDelete: 'cascade' }).notNull(),
  token: varchar("token").notNull().unique(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  usedAt: timestamp("used_at", { withTimezone: true }),
  emailOutboxId: varchar("email_outbox_id").references(() => mercuryEmailOutbox.id, { onDelete: 'set null' }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
  tokenIdx: uniqueIndex("mercury_invite_token_idx").on(table.token),
  userIdx: index("mercury_invite_user_idx").on(table.clientUserId),
  accountIdx: index("mercury_invite_account_idx").on(table.clientAccountId),
  expiresIdx: index("mercury_invite_expires_idx").on(table.expiresAt),
}));

export type MercuryInvitationToken = typeof mercuryInvitationTokens.$inferSelect;

/**
 * Mercury notification preferences — per-user notification opt-in/out.
 */
export const mercuryNotificationPreferences = pgTable("mercury_notification_preferences", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull(),
  userType: varchar("user_type").notNull().default('client'), // 'admin' | 'client'
  notificationType: varchar("notification_type").notNull(), // matches eventType
  channelType: varchar("channel_type").notNull().default('email'),
  isEnabled: boolean("is_enabled").default(true).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
  userTypeIdx: index("mercury_prefs_user_type_idx").on(table.userId, table.userType),
  notifTypeIdx: index("mercury_prefs_notif_type_idx").on(table.notificationType),
}));
