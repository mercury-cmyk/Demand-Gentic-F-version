CREATE TYPE "public"."abv_status" AS ENUM('new', 'in_progress', 'completed', 'cap_reached', 'paused');--> statement-breakpoint
CREATE TYPE "public"."account_cap_mode" AS ENUM('queue_size', 'connected_calls', 'positive_disp');--> statement-breakpoint
CREATE TYPE "public"."activity_entity_type" AS ENUM('contact', 'account', 'campaign', 'call_job', 'call_session', 'lead', 'user', 'email_message');--> statement-breakpoint
CREATE TYPE "public"."activity_event_type" AS ENUM('call_job_created', 'call_job_scheduled', 'call_job_removed', 'call_started', 'call_connected', 'call_ended', 'disposition_saved', 'added_to_global_dnc', 'campaign_opt_out_saved', 'data_marked_invalid', 'retry_scheduled', 'account_cap_reached', 'queue_rebuilt', 'queue_set', 'queue_cleared', 'queue_cleared_all', 'contact_called', 'email_sent', 'email_opened', 'email_clicked', 'form_submitted', 'task_created', 'task_completed', 'note_added');--> statement-breakpoint
CREATE TYPE "public"."address_enrichment_status" AS ENUM('not_needed', 'pending', 'in_progress', 'completed', 'failed');--> statement-breakpoint
CREATE TYPE "public"."agent_status_type" AS ENUM('offline', 'available', 'busy', 'after_call_work', 'break', 'away');--> statement-breakpoint
CREATE TYPE "public"."amd_result" AS ENUM('human', 'machine', 'unknown');--> statement-breakpoint
CREATE TYPE "public"."auth_status" AS ENUM('pending', 'verified', 'failed');--> statement-breakpoint
CREATE TYPE "public"."call_disposition" AS ENUM('no-answer', 'busy', 'voicemail', 'voicemail_left', 'connected', 'not_interested', 'callback-requested', 'qualified', 'dnc-request');--> statement-breakpoint
CREATE TYPE "public"."call_job_status" AS ENUM('queued', 'scheduled', 'in_progress', 'completed', 'cancelled', 'removed');--> statement-breakpoint
CREATE TYPE "public"."call_session_status" AS ENUM('connecting', 'ringing', 'connected', 'no_answer', 'busy', 'failed', 'voicemail_detected', 'cancelled', 'completed');--> statement-breakpoint
CREATE TYPE "public"."campaign_status" AS ENUM('draft', 'scheduled', 'active', 'paused', 'completed', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."campaign_type" AS ENUM('email', 'call', 'combo');--> statement-breakpoint
CREATE TYPE "public"."community" AS ENUM('finance', 'marketing', 'it', 'hr', 'cx_ux', 'data_ai', 'ops');--> statement-breakpoint
CREATE TYPE "public"."content_approval_status" AS ENUM('draft', 'in_review', 'approved', 'rejected', 'published');--> statement-breakpoint
CREATE TYPE "public"."content_asset_type" AS ENUM('email_template', 'landing_page', 'social_post', 'ad_creative', 'pdf_document', 'video', 'call_script', 'sales_sequence', 'blog_post');--> statement-breakpoint
CREATE TYPE "public"."content_status" AS ENUM('draft', 'published', 'archived');--> statement-breakpoint
CREATE TYPE "public"."content_tone" AS ENUM('formal', 'conversational', 'insightful', 'persuasive', 'technical');--> statement-breakpoint
CREATE TYPE "public"."custom_field_type" AS ENUM('text', 'number', 'date', 'boolean', 'select', 'multi_select', 'url', 'email');--> statement-breakpoint
CREATE TYPE "public"."dedupe_scope" AS ENUM('project', 'client', 'global');--> statement-breakpoint
CREATE TYPE "public"."dial_mode" AS ENUM('manual', 'power');--> statement-breakpoint
CREATE TYPE "public"."disposition_system_action" AS ENUM('add_to_global_dnc', 'remove_from_campaign_queue', 'remove_from_all_queues_for_contact', 'retry_after_delay', 'retry_with_next_attempt_window', 'converted_qualified', 'no_action');--> statement-breakpoint
CREATE TYPE "public"."dv_disposition" AS ENUM('Verified', 'PartiallyVerified', 'InvalidEmail', 'NoPhone', 'Duplicate', 'DoNotUse', 'ExcludedByRule', 'NeedsManualReview');--> statement-breakpoint
CREATE TYPE "public"."dv_project_status" AS ENUM('draft', 'active', 'paused', 'closed');--> statement-breakpoint
CREATE TYPE "public"."dv_record_status" AS ENUM('new', 'in_queue', 'in_progress', 'needs_fix', 'excluded', 'invalid', 'verified', 'delivered');--> statement-breakpoint
CREATE TYPE "public"."dv_role" AS ENUM('verifier', 'qa', 'manager', 'viewer');--> statement-breakpoint
CREATE TYPE "public"."email_validation_job_status" AS ENUM('pending', 'processing', 'completed', 'failed', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."email_verification_status" AS ENUM('unknown', 'valid', 'invalid', 'risky');--> statement-breakpoint
CREATE TYPE "public"."entity_type" AS ENUM('account', 'contact');--> statement-breakpoint
CREATE TYPE "public"."event_type" AS ENUM('webinar', 'forum', 'executive_dinner', 'roundtable', 'conference');--> statement-breakpoint
CREATE TYPE "public"."exclusion_scope" AS ENUM('global', 'client', 'project');--> statement-breakpoint
CREATE TYPE "public"."filter_field_category" AS ENUM('contact_fields', 'account_fields', 'account_relationship', 'suppression_fields', 'email_campaign_fields', 'telemarketing_campaign_fields', 'qa_fields', 'list_segment_fields', 'client_portal_fields');--> statement-breakpoint
CREATE TYPE "public"."industry_ai_status" AS ENUM('pending', 'accepted', 'rejected', 'partial');--> statement-breakpoint
CREATE TYPE "public"."location_type" AS ENUM('virtual', 'in_person', 'hybrid');--> statement-breakpoint
CREATE TYPE "public"."manual_queue_state" AS ENUM('queued', 'locked', 'in_progress', 'completed', 'removed', 'released');--> statement-breakpoint
CREATE TYPE "public"."order_status" AS ENUM('draft', 'submitted', 'in_progress', 'completed', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."phone_enrichment_status" AS ENUM('not_needed', 'pending', 'in_progress', 'completed', 'failed');--> statement-breakpoint
CREATE TYPE "public"."push_status" AS ENUM('pending', 'in_progress', 'success', 'failed', 'retrying');--> statement-breakpoint
CREATE TYPE "public"."qa_status" AS ENUM('new', 'under_review', 'approved', 'rejected', 'returned', 'published');--> statement-breakpoint
CREATE TYPE "public"."queue_status" AS ENUM('queued', 'in_progress', 'done', 'removed');--> statement-breakpoint
CREATE TYPE "public"."resource_type" AS ENUM('ebook', 'infographic', 'white_paper', 'guide', 'case_study');--> statement-breakpoint
CREATE TYPE "public"."revenue_range" AS ENUM('$0 - $100K', '$100K - $1M', '$1M - $5M', '$5M - $20M', '$20M - $50M', '$50M - $100M', '$100M - $500M', '$500M - $1B', '$1B+');--> statement-breakpoint
CREATE TYPE "public"."selection_type" AS ENUM('explicit', 'filtered');--> statement-breakpoint
CREATE TYPE "public"."send_policy_scope" AS ENUM('tenant', 'campaign');--> statement-breakpoint
CREATE TYPE "public"."social_platform" AS ENUM('linkedin', 'twitter', 'facebook', 'instagram', 'youtube');--> statement-breakpoint
CREATE TYPE "public"."source_type" AS ENUM('segment', 'manual_upload', 'selection', 'filter');--> statement-breakpoint
CREATE TYPE "public"."staff_count_range" AS ENUM('2-10 employees', '11 - 50 employees', '51 - 200 employees', '201 - 500 employees', '501 - 1,000 employees', '1,001 - 5,000 employees', '5,001 - 10,000 employees', '10,001+ employees');--> statement-breakpoint
CREATE TYPE "public"."sto_mode" AS ENUM('off', 'global_model', 'per_contact');--> statement-breakpoint
CREATE TYPE "public"."upload_job_status" AS ENUM('pending', 'processing', 'completed', 'failed');--> statement-breakpoint
CREATE TYPE "public"."user_role" AS ENUM('admin', 'agent', 'quality_analyst', 'content_creator', 'campaign_manager');--> statement-breakpoint
CREATE TYPE "public"."verification_eligibility_status" AS ENUM('Eligible', 'Out_of_Scope');--> statement-breakpoint
CREATE TYPE "public"."verification_email_status" AS ENUM('unknown', 'ok', 'invalid', 'risky', 'accept_all', 'disposable');--> statement-breakpoint
CREATE TYPE "public"."verification_qa_status" AS ENUM('Unreviewed', 'Flagged', 'Passed', 'Rejected');--> statement-breakpoint
CREATE TYPE "public"."verification_source_type" AS ENUM('Client_Provided', 'New_Sourced');--> statement-breakpoint
CREATE TYPE "public"."verification_status" AS ENUM('Pending', 'Validated', 'Replaced', 'Invalid');--> statement-breakpoint
CREATE TYPE "public"."visibility_scope" AS ENUM('private', 'team', 'global');--> statement-breakpoint
CREATE TYPE "public"."voicemail_action" AS ENUM('leave_voicemail', 'schedule_callback', 'drop_silent');--> statement-breakpoint
CREATE TYPE "public"."voicemail_message_type" AS ENUM('tts', 'audio_file');--> statement-breakpoint
CREATE TYPE "public"."warmup_status" AS ENUM('not_started', 'in_progress', 'completed', 'paused');--> statement-breakpoint
CREATE TABLE "account_domains" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"account_id" varchar NOT NULL,
	"domain" text NOT NULL,
	"domain_normalized" text NOT NULL,
	"is_primary" boolean DEFAULT false NOT NULL,
	"deleted_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "accounts" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"name_normalized" text,
	"canonical_name" text,
	"industry_standardized" text,
	"industry_secondary" text[],
	"industry_code" text,
	"industry_raw" text,
	"industry_ai_suggested" text,
	"industry_ai_candidates" jsonb,
	"industry_ai_topk" text[],
	"industry_ai_confidence" numeric(5, 4),
	"industry_ai_source" text,
	"industry_ai_suggested_at" timestamp,
	"industry_ai_reviewed_by" varchar,
	"industry_ai_reviewed_at" timestamp,
	"industry_ai_status" "industry_ai_status",
	"annual_revenue" numeric,
	"revenue_range" "revenue_range",
	"employees_size_range" "staff_count_range",
	"staff_count" integer,
	"description" text,
	"hq_street_1" text,
	"hq_street_2" text,
	"hq_street_3" text,
	"hq_address" text,
	"hq_city" text,
	"hq_state" text,
	"hq_state_abbr" text,
	"hq_postal_code" text,
	"hq_country" text,
	"company_location" text,
	"year_founded" integer,
	"founded_date" date,
	"founded_date_precision" text,
	"sic_code" text,
	"naics_code" text,
	"domain" text,
	"domain_normalized" text,
	"website_domain" text,
	"previous_names" text[],
	"linkedin_url" text,
	"linkedin_id" text,
	"linkedin_specialties" text[],
	"main_phone" text,
	"main_phone_e164" text,
	"main_phone_extension" text,
	"intent_topics" text[],
	"tech_stack" text[],
	"web_technologies" text,
	"web_technologies_json" jsonb,
	"parent_account_id" varchar,
	"tags" text[],
	"owner_id" varchar,
	"custom_fields" jsonb,
	"source_system" text,
	"source_record_id" text,
	"source_updated_at" timestamp,
	"deleted_at" timestamp,
	"ai_enrichment_data" jsonb,
	"ai_enrichment_date" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "activity_log" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"entity_type" "activity_entity_type" NOT NULL,
	"entity_id" varchar NOT NULL,
	"event_type" "activity_event_type" NOT NULL,
	"payload" jsonb,
	"created_by" varchar,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "agent_queue" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"agent_id" varchar NOT NULL,
	"campaign_id" varchar NOT NULL,
	"contact_id" varchar NOT NULL,
	"account_id" varchar,
	"queue_state" "manual_queue_state" DEFAULT 'queued' NOT NULL,
	"locked_by" varchar,
	"locked_at" timestamp,
	"queued_at" timestamp,
	"released_at" timestamp,
	"created_by" varchar,
	"released_by" varchar,
	"priority" integer DEFAULT 0 NOT NULL,
	"removed_reason" text,
	"lock_version" integer DEFAULT 0 NOT NULL,
	"lock_expires_at" timestamp,
	"scheduled_for" timestamp,
	"enqueued_by" text,
	"enqueued_reason" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "agent_status" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"agent_id" varchar NOT NULL,
	"status" "agent_status_type" DEFAULT 'offline' NOT NULL,
	"campaign_id" varchar,
	"current_call_id" varchar,
	"last_status_change_at" timestamp DEFAULT now() NOT NULL,
	"last_call_ended_at" timestamp,
	"total_calls_today" integer DEFAULT 0,
	"total_talk_time_today" integer DEFAULT 0,
	"break_reason" text,
	"status_metadata" jsonb,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "agent_status_agent_id_unique" UNIQUE("agent_id")
);
--> statement-breakpoint
CREATE TABLE "ai_content_generations" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"asset_id" varchar,
	"prompt" text NOT NULL,
	"content_type" "content_asset_type" NOT NULL,
	"target_audience" text,
	"tone" "content_tone",
	"cta_goal" text,
	"generated_content" text NOT NULL,
	"model" text NOT NULL,
	"tokens_used" integer,
	"user_id" varchar NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "audit_logs" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" varchar,
	"action" text NOT NULL,
	"entity_type" text NOT NULL,
	"entity_id" varchar NOT NULL,
	"changes_json" jsonb,
	"ip_address" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "auto_dialer_queues" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"campaign_id" varchar NOT NULL,
	"is_active" boolean DEFAULT false NOT NULL,
	"dialing_mode" varchar DEFAULT 'progressive' NOT NULL,
	"max_concurrent_calls" integer DEFAULT 1,
	"max_concurrent_per_agent" integer DEFAULT 1,
	"dial_ratio" numeric DEFAULT '1.0',
	"ring_timeout_sec" integer DEFAULT 30,
	"abandon_rate_target_pct" numeric DEFAULT '3.0',
	"amd_enabled" boolean DEFAULT false,
	"amd_confidence_threshold" numeric DEFAULT '0.75',
	"amd_decision_timeout_ms" integer DEFAULT 2500,
	"amd_uncertain_fallback" varchar DEFAULT 'route_as_human',
	"vm_action" "voicemail_action" DEFAULT 'drop_silent',
	"vm_asset_id" varchar,
	"vm_max_per_contact" integer DEFAULT 1,
	"vm_cooldown_hours" integer DEFAULT 72,
	"vm_daily_campaign_cap" integer,
	"vm_local_time_window" jsonb,
	"vm_restricted_region_block" boolean DEFAULT false,
	"check_dnc" boolean DEFAULT true,
	"priority_mode" varchar DEFAULT 'fifo',
	"pacing_strategy" varchar DEFAULT 'agent_based',
	"distribution_strategy" varchar DEFAULT 'round_robin',
	"target_agent_occupancy" numeric DEFAULT '0.85',
	"retry_rules" jsonb,
	"quiet_hours" jsonb,
	"max_daily_attempts_per_contact" integer DEFAULT 3,
	"metadata" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "auto_dialer_queues_campaign_id_unique" UNIQUE("campaign_id")
);
--> statement-breakpoint
CREATE TABLE "bulk_imports" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"file_name" text NOT NULL,
	"file_url" text,
	"status" text DEFAULT 'processing' NOT NULL,
	"total_rows" integer,
	"success_rows" integer DEFAULT 0,
	"error_rows" integer DEFAULT 0,
	"error_file_url" text,
	"uploaded_by_id" varchar,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"completed_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "business_hours_config" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"timezone" text NOT NULL,
	"day_of_week" integer NOT NULL,
	"start_time" text NOT NULL,
	"end_time" text NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "call_attempts" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"campaign_id" varchar NOT NULL,
	"contact_id" varchar NOT NULL,
	"agent_id" varchar NOT NULL,
	"telnyx_call_id" text,
	"recording_url" text,
	"disposition" "call_disposition",
	"started_at" timestamp,
	"ended_at" timestamp,
	"duration" integer,
	"notes" text,
	"amd_result" "amd_result",
	"amd_confidence" numeric(3, 2),
	"vm_asset_id" varchar,
	"vm_delivered" boolean DEFAULT false,
	"vm_duration_sec" integer,
	"wrapup_seconds" integer,
	"script_version_id" varchar,
	"qa_locked" boolean DEFAULT false,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "call_dispositions" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"call_session_id" varchar NOT NULL,
	"disposition_id" varchar NOT NULL,
	"notes" text,
	"created_by" varchar NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "call_events" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"attempt_id" varchar NOT NULL,
	"type" text NOT NULL,
	"metadata" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "call_jobs" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"campaign_id" varchar NOT NULL,
	"contact_id" varchar NOT NULL,
	"account_id" varchar NOT NULL,
	"agent_id" varchar,
	"status" "call_job_status" DEFAULT 'queued' NOT NULL,
	"scheduled_at" timestamp,
	"priority" integer DEFAULT 0 NOT NULL,
	"attempt_no" integer DEFAULT 0 NOT NULL,
	"locked_by_agent_id" varchar,
	"locked_at" timestamp,
	"removed_reason" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "call_recording_access_logs" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"call_attempt_id" varchar NOT NULL,
	"user_id" varchar NOT NULL,
	"action" text NOT NULL,
	"ip_address" text,
	"user_agent" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "call_scripts" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"campaign_id" varchar,
	"name" text NOT NULL,
	"content" text NOT NULL,
	"version" integer DEFAULT 1,
	"changelog" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "call_sessions" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"call_job_id" varchar NOT NULL,
	"telnyx_call_id" text,
	"from_number" text,
	"to_number_e164" text NOT NULL,
	"started_at" timestamp DEFAULT now() NOT NULL,
	"ended_at" timestamp,
	"duration_sec" integer,
	"recording_url" text,
	"status" "call_session_status" DEFAULT 'connecting' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "calls" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"queue_item_id" varchar,
	"campaign_id" varchar,
	"contact_id" varchar,
	"agent_id" varchar,
	"disposition" "call_disposition",
	"duration" integer,
	"recording_url" text,
	"callback_requested" boolean DEFAULT false,
	"notes" text,
	"qualification_data" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "campaign_account_stats" (
	"campaign_id" varchar NOT NULL,
	"account_id" varchar NOT NULL,
	"queued_count" integer DEFAULT 0 NOT NULL,
	"connected_count" integer DEFAULT 0 NOT NULL,
	"positive_disp_count" integer DEFAULT 0 NOT NULL,
	"last_enforced_at" timestamp,
	CONSTRAINT "campaign_account_stats_campaign_id_account_id_pk" PRIMARY KEY("campaign_id","account_id")
);
--> statement-breakpoint
CREATE TABLE "campaign_agent_assignments" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"campaign_id" varchar NOT NULL,
	"agent_id" varchar NOT NULL,
	"assigned_by" varchar,
	"assigned_at" timestamp DEFAULT now() NOT NULL,
	"released_at" timestamp,
	"is_active" boolean DEFAULT true NOT NULL
);
--> statement-breakpoint
CREATE TABLE "campaign_agents" (
	"campaign_id" varchar NOT NULL,
	"agent_id" varchar NOT NULL,
	"assigned_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "campaign_agents_campaign_id_agent_id_pk" PRIMARY KEY("campaign_id","agent_id")
);
--> statement-breakpoint
CREATE TABLE "campaign_audience_snapshots" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"campaign_id" varchar NOT NULL,
	"audience_definition" jsonb NOT NULL,
	"contact_ids" text[],
	"account_ids" text[],
	"contact_count" integer DEFAULT 0,
	"account_count" integer DEFAULT 0,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "campaign_content_links" (
	"id" serial PRIMARY KEY NOT NULL,
	"campaign_id" varchar NOT NULL,
	"content_type" varchar(50) NOT NULL,
	"content_id" varchar(255) NOT NULL,
	"content_slug" varchar(255) NOT NULL,
	"content_title" text NOT NULL,
	"content_url" text NOT NULL,
	"form_id" varchar(255),
	"metadata" jsonb,
	"created_by" varchar(50),
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "campaign_opt_outs" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"campaign_id" varchar NOT NULL,
	"contact_id" varchar NOT NULL,
	"reason" text,
	"created_by" varchar,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "campaign_orders" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"client_user_id" varchar NOT NULL,
	"order_number" text NOT NULL,
	"type" "campaign_type" NOT NULL,
	"status" "order_status" DEFAULT 'draft' NOT NULL,
	"lead_goal" integer,
	"pacing_config" jsonb,
	"qualification_criteria_json" jsonb,
	"compliance_confirmed" boolean DEFAULT false,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"submitted_at" timestamp,
	CONSTRAINT "campaign_orders_order_number_unique" UNIQUE("order_number")
);
--> statement-breakpoint
CREATE TABLE "campaign_queue" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"campaign_id" varchar NOT NULL,
	"contact_id" varchar NOT NULL,
	"account_id" varchar NOT NULL,
	"agent_id" varchar,
	"priority" integer DEFAULT 0 NOT NULL,
	"status" "queue_status" DEFAULT 'queued' NOT NULL,
	"removed_reason" text,
	"lock_version" integer DEFAULT 0 NOT NULL,
	"lock_expires_at" timestamp,
	"next_attempt_at" timestamp,
	"enqueued_by" text,
	"enqueued_reason" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "campaign_suppression_accounts" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"campaign_id" varchar NOT NULL,
	"account_id" varchar NOT NULL,
	"reason" text,
	"added_by" varchar,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "campaign_suppression_contacts" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"campaign_id" varchar NOT NULL,
	"contact_id" varchar NOT NULL,
	"reason" text,
	"added_by" varchar,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "campaigns" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"type" "campaign_type" NOT NULL,
	"name" text NOT NULL,
	"status" "campaign_status" DEFAULT 'draft' NOT NULL,
	"brand_id" varchar,
	"schedule_json" jsonb,
	"assigned_teams" text[],
	"audience_refs" jsonb,
	"throttling_config" jsonb,
	"email_subject" text,
	"email_html_content" text,
	"call_script" text,
	"script_id" varchar,
	"qualification_questions" jsonb,
	"owner_id" varchar,
	"account_cap_enabled" boolean DEFAULT false NOT NULL,
	"account_cap_value" integer,
	"account_cap_mode" "account_cap_mode",
	"dial_mode" "dial_mode" DEFAULT 'power' NOT NULL,
	"power_settings" jsonb,
	"retry_rules" jsonb,
	"timezone" text,
	"business_hours_config" jsonb,
	"target_qualified_leads" integer,
	"start_date" date,
	"end_date" date,
	"cost_per_lead" numeric(10, 2),
	"qa_parameters" jsonb,
	"client_submission_config" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"launched_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "city_reference" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"state_id" varchar,
	"country_id" varchar NOT NULL,
	"sort_order" integer NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "company_aliases" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"canonical_name" text NOT NULL,
	"alias" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"created_by" varchar
);
--> statement-breakpoint
CREATE TABLE "company_size_reference" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" text NOT NULL,
	"label" text NOT NULL,
	"min_employees" integer NOT NULL,
	"max_employees" integer,
	"sort_order" integer NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "company_size_reference_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "contact_emails" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"contact_id" varchar NOT NULL,
	"email" text NOT NULL,
	"email_normalized" text NOT NULL,
	"is_primary" boolean DEFAULT false NOT NULL,
	"deleted_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "contact_voicemail_tracking" (
	"contact_id" varchar NOT NULL,
	"campaign_id" varchar NOT NULL,
	"vm_count" integer DEFAULT 0 NOT NULL,
	"last_vm_at" timestamp,
	"last_vm_asset_id" varchar,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "contact_voicemail_tracking_contact_id_campaign_id_pk" PRIMARY KEY("contact_id","campaign_id")
);
--> statement-breakpoint
CREATE TABLE "contacts" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"account_id" varchar,
	"full_name" text NOT NULL,
	"first_name" text,
	"last_name" text,
	"job_title" text,
	"email" text NOT NULL,
	"email_normalized" text,
	"email_verification_status" "email_verification_status" DEFAULT 'unknown',
	"email_ai_confidence" numeric(5, 2),
	"direct_phone" text,
	"direct_phone_e164" text,
	"phone_extension" text,
	"phone_verified_at" timestamp,
	"phone_ai_confidence" numeric(5, 2),
	"mobile_phone" text,
	"mobile_phone_e164" text,
	"seniority_level" text,
	"department" text,
	"address" text,
	"linkedin_url" text,
	"former_position" text,
	"time_in_current_position" text,
	"time_in_current_position_months" integer,
	"time_in_current_company" text,
	"time_in_current_company_months" integer,
	"intent_topics" text[],
	"tags" text[],
	"consent_basis" text,
	"consent_source" text,
	"consent_timestamp" timestamp,
	"owner_id" varchar,
	"custom_fields" jsonb,
	"email_status" text DEFAULT 'unknown',
	"phone_status" text DEFAULT 'unknown',
	"source_system" text,
	"source_record_id" text,
	"source_updated_at" timestamp,
	"research_date" timestamp,
	"list" text,
	"timezone" text,
	"city" text,
	"state" text,
	"state_abbr" text,
	"county" text,
	"postal_code" text,
	"country" text,
	"contact_location" text,
	"is_invalid" boolean DEFAULT false NOT NULL,
	"invalid_reason" text,
	"invalidated_at" timestamp,
	"invalidated_by" varchar,
	"deleted_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "content_approvals" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"asset_id" varchar NOT NULL,
	"reviewer_id" varchar NOT NULL,
	"status" "content_approval_status" NOT NULL,
	"comments" text,
	"reviewed_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "content_asset_pushes" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"asset_id" varchar NOT NULL,
	"target_url" text NOT NULL,
	"status" "push_status" DEFAULT 'pending' NOT NULL,
	"attempt_count" integer DEFAULT 0 NOT NULL,
	"max_attempts" integer DEFAULT 3 NOT NULL,
	"last_attempt_at" timestamp,
	"success_at" timestamp,
	"error_message" text,
	"response_payload" jsonb,
	"external_id" text,
	"pushed_by" varchar NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "content_assets" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"asset_type" "content_asset_type" NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"content" text,
	"content_html" text,
	"thumbnail_url" text,
	"file_url" text,
	"tags" text[] DEFAULT ARRAY[]::text[],
	"metadata" jsonb,
	"approval_status" "content_approval_status" DEFAULT 'draft' NOT NULL,
	"tone" "content_tone",
	"target_audience" text,
	"cta_goal" text,
	"linked_campaigns" text[] DEFAULT ARRAY[]::text[],
	"usage_history" jsonb DEFAULT '[]'::jsonb,
	"version" integer DEFAULT 1 NOT NULL,
	"current_version_id" varchar,
	"owner_id" varchar NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "content_events" (
	"id" serial PRIMARY KEY NOT NULL,
	"event_name" varchar(50) NOT NULL,
	"content_type" varchar(50),
	"content_id" varchar(255),
	"slug" varchar(255),
	"title" text,
	"community" varchar(100),
	"contact_id" varchar(50),
	"email" varchar(255),
	"url" text,
	"payload_json" jsonb,
	"ts" timestamp NOT NULL,
	"uniq_key" varchar(500) NOT NULL,
	"created_at" timestamp DEFAULT now(),
	CONSTRAINT "content_events_uniq_key_unique" UNIQUE("uniq_key")
);
--> statement-breakpoint
CREATE TABLE "content_versions" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"asset_id" varchar NOT NULL,
	"version_number" integer NOT NULL,
	"content" text NOT NULL,
	"content_html" text,
	"metadata" jsonb,
	"changed_by" varchar NOT NULL,
	"change_description" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "country_reference" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"code" text NOT NULL,
	"sort_order" integer NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "country_reference_name_unique" UNIQUE("name"),
	CONSTRAINT "country_reference_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "custom_field_definitions" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"entity_type" "entity_type" NOT NULL,
	"field_key" text NOT NULL,
	"display_label" text NOT NULL,
	"field_type" "custom_field_type" NOT NULL,
	"options" jsonb,
	"required" boolean DEFAULT false NOT NULL,
	"default_value" text,
	"help_text" text,
	"display_order" integer DEFAULT 0 NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"created_by" varchar
);
--> statement-breakpoint
CREATE TABLE "dedupe_review_queue" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"entity_type" text NOT NULL,
	"candidate_a_id" varchar NOT NULL,
	"candidate_b_id" varchar NOT NULL,
	"match_score" real NOT NULL,
	"match_reason" text,
	"status" text DEFAULT 'pending' NOT NULL,
	"reviewed_by" varchar,
	"reviewed_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "department_reference" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"sort_order" integer NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "department_reference_name_unique" UNIQUE("name")
);
--> statement-breakpoint
CREATE TABLE "dispositions" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"label" text NOT NULL,
	"system_action" "disposition_system_action" NOT NULL,
	"params" jsonb,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"created_by" varchar,
	CONSTRAINT "dispositions_label_unique" UNIQUE("label")
);
--> statement-breakpoint
CREATE TABLE "dkim_keys" (
	"id" serial PRIMARY KEY NOT NULL,
	"domain_auth_id" integer NOT NULL,
	"selector" text NOT NULL,
	"public_key" text NOT NULL,
	"rotation_due_at" timestamp,
	"status" "auth_status" DEFAULT 'pending' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "domain_auth" (
	"id" serial PRIMARY KEY NOT NULL,
	"domain" text NOT NULL,
	"spf_status" "auth_status" DEFAULT 'pending' NOT NULL,
	"dkim_status" "auth_status" DEFAULT 'pending' NOT NULL,
	"dmarc_status" "auth_status" DEFAULT 'pending' NOT NULL,
	"tracking_domain_status" "auth_status" DEFAULT 'pending' NOT NULL,
	"bimi_status" "auth_status" DEFAULT 'pending',
	"last_checked_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "domain_auth_domain_unique" UNIQUE("domain")
);
--> statement-breakpoint
CREATE TABLE "domain_reputation_snapshots" (
	"id" serial PRIMARY KEY NOT NULL,
	"domain" text NOT NULL,
	"timestamp" timestamp DEFAULT now() NOT NULL,
	"metrics_json" jsonb NOT NULL,
	"health_score" integer,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "domain_set_contact_links" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"domain_set_id" varchar NOT NULL,
	"contact_id" varchar NOT NULL,
	"account_id" varchar,
	"matched_via" text NOT NULL,
	"included_in_list" boolean DEFAULT false,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "domain_set_items" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"domain_set_id" varchar NOT NULL,
	"domain" text NOT NULL,
	"normalized_domain" text NOT NULL,
	"account_name" text,
	"account_id" varchar,
	"match_type" text,
	"match_confidence" numeric(3, 2),
	"matched_by" text,
	"matched_contacts_count" integer DEFAULT 0,
	"auto_created_account" boolean DEFAULT false,
	"notes" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "domain_sets" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"upload_file_uri" text,
	"total_uploaded" integer DEFAULT 0,
	"matched_accounts" integer DEFAULT 0,
	"matched_contacts" integer DEFAULT 0,
	"duplicates_removed" integer DEFAULT 0,
	"unknown_domains" integer DEFAULT 0,
	"status" text DEFAULT 'processing' NOT NULL,
	"owner_id" varchar,
	"tags" text[] DEFAULT '{}'::text[],
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "dv_account_assignments" (
	"account_id" varchar NOT NULL,
	"user_id" varchar NOT NULL,
	"role" "dv_role" DEFAULT 'verifier' NOT NULL,
	CONSTRAINT "dv_account_assignments_account_id_user_id_pk" PRIMARY KEY("account_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "dv_accounts" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" varchar NOT NULL,
	"account_name" varchar,
	"account_domain" varchar NOT NULL,
	"website" varchar,
	"linkedin_url" varchar,
	"target_contacts" integer DEFAULT 0 NOT NULL,
	"verified_count" integer DEFAULT 0 NOT NULL,
	"status" "abv_status" DEFAULT 'new' NOT NULL,
	"notes" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "dv_agent_filters" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" varchar NOT NULL,
	"user_id" varchar NOT NULL,
	"name" varchar NOT NULL,
	"filter_json" jsonb NOT NULL,
	"is_active" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "dv_company_caps" (
	"project_id" varchar NOT NULL,
	"account_domain" varchar NOT NULL,
	"verified_count" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "dv_company_caps_project_id_account_domain_pk" PRIMARY KEY("project_id","account_domain")
);
--> statement-breakpoint
CREATE TABLE "dv_deliveries" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" varchar NOT NULL,
	"type" varchar NOT NULL,
	"filter" jsonb,
	"row_count" integer,
	"file_path" varchar,
	"created_by" varchar,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "dv_exclusion_lists" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" varchar NOT NULL,
	"type" varchar NOT NULL,
	"pattern" text NOT NULL,
	"scope" "exclusion_scope" NOT NULL,
	"client_id" varchar,
	"is_active" boolean DEFAULT true NOT NULL,
	"fields" jsonb NOT NULL,
	"created_by" varchar NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "dv_field_constraints" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" varchar NOT NULL,
	"field_name" varchar NOT NULL,
	"rule_type" varchar NOT NULL,
	"rule_value" jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "dv_field_mappings" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" varchar NOT NULL,
	"client_header" varchar NOT NULL,
	"crm_field" varchar NOT NULL,
	"confidence" real DEFAULT 0 NOT NULL,
	"required" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE TABLE "dv_project_agents" (
	"project_id" varchar NOT NULL,
	"user_id" varchar NOT NULL,
	"role" "dv_role" DEFAULT 'verifier' NOT NULL,
	CONSTRAINT "dv_project_agents_project_id_user_id_pk" PRIMARY KEY("project_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "dv_project_exclusions" (
	"project_id" varchar NOT NULL,
	"list_id" varchar NOT NULL,
	CONSTRAINT "dv_project_exclusions_project_id_list_id_pk" PRIMARY KEY("project_id","list_id")
);
--> statement-breakpoint
CREATE TABLE "dv_projects" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"client_id" varchar NOT NULL,
	"name" varchar NOT NULL,
	"description" text,
	"template_id" varchar,
	"rulepack_id" varchar,
	"status" "dv_project_status" DEFAULT 'draft' NOT NULL,
	"cap_per_company" integer DEFAULT 0 NOT NULL,
	"dedupe_scope" "dedupe_scope" DEFAULT 'client' NOT NULL,
	"abv_mode" boolean DEFAULT false NOT NULL,
	"default_target_per_account" integer DEFAULT 0 NOT NULL,
	"created_by" varchar NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "dv_records" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" varchar NOT NULL,
	"account_id" varchar,
	"account_name" varchar,
	"account_domain" varchar,
	"first_name" varchar,
	"last_name" varchar,
	"contact_full_name" varchar,
	"email" varchar,
	"phone_raw" varchar,
	"phone_e164" varchar,
	"job_title" varchar,
	"linkedin_url" varchar,
	"address_1" varchar,
	"address_2" varchar,
	"address_3" varchar,
	"country" varchar,
	"state" varchar,
	"city" varchar,
	"zip" varchar,
	"website" varchar,
	"extras" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"status" "dv_record_status" DEFAULT 'new' NOT NULL,
	"dedupe_hash" varchar,
	"exclusion_reason" varchar,
	"invalid_reason" varchar,
	"normalized_at" timestamp,
	"email_validated_at" timestamp,
	"phone_parsed_at" timestamp,
	"exclusion_checked_at" timestamp,
	"enqueued_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "dv_records_raw" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" varchar NOT NULL,
	"payload" jsonb NOT NULL,
	"imported_at" timestamp DEFAULT now() NOT NULL,
	"source_file" varchar,
	"row_num" integer
);
--> statement-breakpoint
CREATE TABLE "dv_runs" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"record_id" varchar NOT NULL,
	"project_id" varchar NOT NULL,
	"agent_id" varchar,
	"started_at" timestamp DEFAULT now() NOT NULL,
	"finished_at" timestamp,
	"disposition" "dv_disposition",
	"notes" text,
	"checks" jsonb,
	"enrichment" jsonb,
	"result_status" "dv_record_status"
);
--> statement-breakpoint
CREATE TABLE "dv_selection_sets" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" varchar NOT NULL,
	"name" varchar NOT NULL,
	"description" text,
	"filter_json" jsonb NOT NULL,
	"record_ids" jsonb,
	"is_default" boolean DEFAULT false NOT NULL,
	"created_by" varchar NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "email_events" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"send_id" varchar NOT NULL,
	"type" text NOT NULL,
	"metadata" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "email_messages" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"campaign_id" varchar,
	"contact_id" varchar,
	"provider_message_id" text,
	"status" text DEFAULT 'pending' NOT NULL,
	"delivered_at" timestamp,
	"opened_at" timestamp,
	"clicked_at" timestamp,
	"bounced_at" timestamp,
	"complaint_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "email_sends" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"campaign_id" varchar NOT NULL,
	"contact_id" varchar NOT NULL,
	"template_id" varchar,
	"sender_profile_id" varchar,
	"provider_message_id" text,
	"provider" text,
	"status" text DEFAULT 'pending' NOT NULL,
	"send_at" timestamp,
	"sent_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "email_templates" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"subject" text NOT NULL,
	"html_content" text NOT NULL,
	"placeholders" text[],
	"version" integer DEFAULT 1,
	"is_approved" boolean DEFAULT false,
	"approved_by_id" varchar,
	"approved_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "events" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" text NOT NULL,
	"title" text NOT NULL,
	"event_type" "event_type" NOT NULL,
	"location_type" "location_type" NOT NULL,
	"community" "community" NOT NULL,
	"organizer" text,
	"sponsor" text,
	"speakers" jsonb DEFAULT '[]'::jsonb,
	"start_iso" text NOT NULL,
	"end_iso" text,
	"timezone" text,
	"overview_html" text,
	"learn_bullets" text[] DEFAULT ARRAY[]::text[],
	"thumbnail_url" text,
	"cta_link" text,
	"form_id" text,
	"seo" jsonb,
	"status" "content_status" DEFAULT 'draft' NOT NULL,
	"owner_id" varchar NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "events_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "field_change_log" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"entity_type" text NOT NULL,
	"entity_id" varchar NOT NULL,
	"field_key" text NOT NULL,
	"old_value" jsonb,
	"new_value" jsonb,
	"source_system" text,
	"actor_id" varchar,
	"survivorship_policy" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "filter_field_registry" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"entity" text NOT NULL,
	"key" text NOT NULL,
	"label" text NOT NULL,
	"type" text NOT NULL,
	"operators" text[] NOT NULL,
	"category" "filter_field_category" NOT NULL,
	"is_custom" boolean DEFAULT false NOT NULL,
	"visible_in_filters" boolean DEFAULT true NOT NULL,
	"description" text,
	"sort_order" integer DEFAULT 0,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "global_dnc" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"contact_id" varchar,
	"phone_e164" text,
	"source" text NOT NULL,
	"reason" text,
	"created_by" varchar,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "industry_reference" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"naics_code" text,
	"synonyms" text[] DEFAULT '{}'::text[],
	"parent_id" varchar,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "industry_reference_name_unique" UNIQUE("name")
);
--> statement-breakpoint
CREATE TABLE "ip_pools" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"provider" text NOT NULL,
	"ip_addresses" text[] NOT NULL,
	"warmup_status" "warmup_status" DEFAULT 'not_started' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "job_function_reference" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"sort_order" integer NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "job_function_reference_name_unique" UNIQUE("name")
);
--> statement-breakpoint
CREATE TABLE "leads" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"contact_id" varchar NOT NULL,
	"contact_name" text,
	"contact_email" text,
	"campaign_id" varchar,
	"call_attempt_id" varchar,
	"recording_url" text,
	"call_duration" integer,
	"agent_id" varchar,
	"qa_status" "qa_status" DEFAULT 'new' NOT NULL,
	"checklist_json" jsonb,
	"approved_at" timestamp,
	"approved_by_id" varchar,
	"rejected_reason" text,
	"notes" text,
	"transcript" text,
	"transcription_status" text,
	"ai_score" numeric(5, 2),
	"ai_analysis" jsonb,
	"ai_qualification_status" text,
	"submitted_to_client" boolean DEFAULT false,
	"submitted_at" timestamp,
	"submission_response" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "lists" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"entity_type" "entity_type" DEFAULT 'contact' NOT NULL,
	"source_type" "source_type" DEFAULT 'manual_upload' NOT NULL,
	"source_ref" varchar,
	"snapshot_ts" timestamp DEFAULT now() NOT NULL,
	"record_ids" text[] DEFAULT '{}'::text[] NOT NULL,
	"owner_id" varchar,
	"tags" text[] DEFAULT '{}'::text[],
	"visibility_scope" "visibility_scope" DEFAULT 'private' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "news" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" text NOT NULL,
	"title" text NOT NULL,
	"community" "community" NOT NULL,
	"overview_html" text,
	"body_html" text,
	"authors" text[] DEFAULT ARRAY[]::text[],
	"published_iso" text,
	"thumbnail_url" text,
	"seo" jsonb,
	"status" "content_status" DEFAULT 'draft' NOT NULL,
	"owner_id" varchar NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "news_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "order_assets" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"order_id" varchar NOT NULL,
	"asset_type" text NOT NULL,
	"file_url" text NOT NULL,
	"file_name" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "order_audience_snapshots" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"order_id" varchar NOT NULL,
	"audience_definition_json" jsonb NOT NULL,
	"contact_count" integer,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "order_campaign_links" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"order_id" varchar NOT NULL,
	"campaign_id" varchar NOT NULL,
	"linked_by_id" varchar NOT NULL,
	"linked_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "order_qualification_questions" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"order_id" varchar NOT NULL,
	"question_text" text NOT NULL,
	"question_type" text NOT NULL,
	"options_json" jsonb,
	"required" boolean DEFAULT false,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "organizers" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"logo_url" text,
	"website_url" text,
	"external_id" varchar(255),
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "organizers_name_unique" UNIQUE("name")
);
--> statement-breakpoint
CREATE TABLE "per_domain_stats" (
	"id" serial PRIMARY KEY NOT NULL,
	"sending_domain" text NOT NULL,
	"recipient_provider" text NOT NULL,
	"day" text NOT NULL,
	"delivered" integer DEFAULT 0,
	"bounces_hard" integer DEFAULT 0,
	"bounces_soft" integer DEFAULT 0,
	"complaints" integer DEFAULT 0,
	"opens" integer DEFAULT 0,
	"clicks" integer DEFAULT 0,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "qualification_responses" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"attempt_id" varchar,
	"lead_id" varchar,
	"schema_version" text,
	"answers_json" jsonb NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "resources" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" text NOT NULL,
	"title" text NOT NULL,
	"resource_type" "resource_type" NOT NULL,
	"community" "community" NOT NULL,
	"overview_html" text,
	"bullets" text[] DEFAULT ARRAY[]::text[],
	"body_html" text,
	"thumbnail_url" text,
	"cta_link" text,
	"form_id" text,
	"seo" jsonb,
	"status" "content_status" DEFAULT 'draft' NOT NULL,
	"owner_id" varchar NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "resources_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "revenue_range_reference" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"label" text NOT NULL,
	"description" text,
	"min_revenue" numeric(15, 2),
	"max_revenue" numeric(15, 2),
	"sort_order" integer NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "revenue_range_reference_label_unique" UNIQUE("label")
);
--> statement-breakpoint
CREATE TABLE "saved_filters" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" varchar NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"entity_type" text NOT NULL,
	"filter_group" jsonb NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "segments" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"entity_type" "entity_type" DEFAULT 'contact' NOT NULL,
	"definition_json" jsonb NOT NULL,
	"owner_id" varchar,
	"last_refreshed_at" timestamp,
	"is_active" boolean DEFAULT true NOT NULL,
	"record_count_cache" integer DEFAULT 0,
	"tags" text[] DEFAULT '{}'::text[],
	"visibility_scope" "visibility_scope" DEFAULT 'private' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "selection_contexts" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" varchar NOT NULL,
	"entity_type" "entity_type" NOT NULL,
	"selection_type" "selection_type" NOT NULL,
	"ids" text[],
	"filter_group" jsonb,
	"total_count" integer NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"expires_at" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE "send_policies" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"scope" "send_policy_scope" DEFAULT 'tenant' NOT NULL,
	"sto_mode" "sto_mode" DEFAULT 'off' NOT NULL,
	"sto_window_hours" integer DEFAULT 24,
	"batch_size" integer DEFAULT 5000,
	"batch_gap_minutes" integer DEFAULT 15,
	"seed_test_batch" boolean DEFAULT false,
	"global_tps" integer DEFAULT 10,
	"per_domain_caps" jsonb,
	"frequency_cap" integer,
	"status" text DEFAULT 'active' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sender_profiles" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"brand_id" varchar,
	"from_name" text NOT NULL,
	"from_email" text NOT NULL,
	"reply_to" text,
	"reply_to_email" text,
	"dkim_domain" text,
	"tracking_domain" text,
	"tracking_domain_id" integer,
	"esp_adapter" text DEFAULT 'sendgrid',
	"ip_pool_id" integer,
	"default_throttle_tps" integer DEFAULT 10,
	"daily_cap" integer,
	"signature_html" text,
	"is_active" boolean DEFAULT true,
	"status" text DEFAULT 'active',
	"is_default" boolean DEFAULT false,
	"esp_provider" text,
	"domain_auth_id" integer,
	"is_verified" boolean,
	"reputation_score" integer,
	"warmup_status" text,
	"created_by" varchar,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "seniority_level_reference" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"sort_order" integer NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "seniority_level_reference_name_unique" UNIQUE("name")
);
--> statement-breakpoint
CREATE TABLE "sip_trunk_configs" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"provider" text DEFAULT 'telnyx' NOT NULL,
	"sip_username" text NOT NULL,
	"sip_password" text NOT NULL,
	"sip_domain" text DEFAULT 'sip.telnyx.com' NOT NULL,
	"connection_id" text,
	"outbound_voice_profile_id" text,
	"caller_id_number" text,
	"is_active" boolean DEFAULT true,
	"is_default" boolean DEFAULT false,
	"created_by_id" varchar,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "social_posts" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"asset_id" varchar,
	"platform" "social_platform" NOT NULL,
	"content" text NOT NULL,
	"media_urls" text[] DEFAULT ARRAY[]::text[],
	"scheduled_at" timestamp,
	"published_at" timestamp,
	"status" "content_approval_status" DEFAULT 'draft' NOT NULL,
	"utm_parameters" jsonb,
	"platform_post_id" text,
	"engagement" jsonb,
	"sentiment" text,
	"owner_id" varchar NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "softphone_profiles" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" varchar NOT NULL,
	"mic_device_id" text,
	"speaker_device_id" text,
	"last_test_at" timestamp,
	"test_results_json" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "softphone_profiles_user_id_unique" UNIQUE("user_id")
);
--> statement-breakpoint
CREATE TABLE "speakers" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"title" text,
	"company" text,
	"bio" text,
	"photo_url" text,
	"linkedin_url" text,
	"external_id" varchar(255),
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sponsors" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"tier" varchar(50),
	"description" text,
	"logo_url" text,
	"website_url" text,
	"external_id" varchar(255),
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "sponsors_name_unique" UNIQUE("name")
);
--> statement-breakpoint
CREATE TABLE "state_reference" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"code" text,
	"country_id" varchar NOT NULL,
	"sort_order" integer NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "suppression_emails" (
	"id" serial PRIMARY KEY NOT NULL,
	"email" text NOT NULL,
	"reason" text,
	"source" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "suppression_emails_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "suppression_phones" (
	"id" serial PRIMARY KEY NOT NULL,
	"phone_e164" text NOT NULL,
	"reason" text,
	"source" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "suppression_phones_phone_e164_unique" UNIQUE("phone_e164")
);
--> statement-breakpoint
CREATE TABLE "technology_reference" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"category" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "technology_reference_name_unique" UNIQUE("name")
);
--> statement-breakpoint
CREATE TABLE "tracking_domains" (
	"id" serial PRIMARY KEY NOT NULL,
	"cname" text NOT NULL,
	"target" text NOT NULL,
	"tls_status" "auth_status" DEFAULT 'pending' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "tracking_domains_cname_unique" UNIQUE("cname")
);
--> statement-breakpoint
CREATE TABLE "user_roles" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" varchar NOT NULL,
	"role" "user_role" NOT NULL,
	"assigned_at" timestamp DEFAULT now() NOT NULL,
	"assigned_by" varchar
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"username" text NOT NULL,
	"email" text NOT NULL,
	"password" text NOT NULL,
	"role" "user_role" DEFAULT 'agent' NOT NULL,
	"first_name" text,
	"last_name" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "users_username_unique" UNIQUE("username"),
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "verification_audit_log" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"actor_id" varchar,
	"entity_type" text,
	"entity_id" text,
	"action" text,
	"before" jsonb,
	"after" jsonb,
	"at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "verification_campaigns" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"monthly_target" integer DEFAULT 1000,
	"lead_cap_per_account" integer DEFAULT 10,
	"eligibility_config" jsonb,
	"email_validation_provider" text DEFAULT 'emaillistverify',
	"ok_email_states" text[] DEFAULT ARRAY['valid', 'accept_all']::text[],
	"suppression_match_fields" text[] DEFAULT ARRAY['email_lower', 'cav_id', 'cav_user_id', 'name_company_hash']::text[],
	"address_precedence" text[] DEFAULT ARRAY['contact', 'hq']::text[],
	"ok_rate_target" numeric(5, 2) DEFAULT '0.95',
	"deliverability_target" numeric(5, 2) DEFAULT '0.97',
	"suppression_hit_rate_max" numeric(5, 2) DEFAULT '0.05',
	"qa_pass_rate_min" numeric(5, 2) DEFAULT '0.98',
	"status" text DEFAULT 'active',
	"created_by" varchar,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "verification_contacts" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"campaign_id" varchar NOT NULL,
	"account_id" varchar,
	"source_type" "verification_source_type" NOT NULL,
	"full_name" text NOT NULL,
	"first_name" text,
	"last_name" text,
	"title" text,
	"email" text,
	"email_lower" text,
	"phone" text,
	"mobile" text,
	"linkedin_url" text,
	"former_position" text,
	"time_in_current_position" text,
	"time_in_current_position_months" integer,
	"time_in_current_company" text,
	"time_in_current_company_months" integer,
	"contact_address1" text,
	"contact_address2" text,
	"contact_address3" text,
	"contact_city" text,
	"contact_state" text,
	"contact_country" text,
	"contact_postal" text,
	"hq_address_1" text,
	"hq_address_2" text,
	"hq_address_3" text,
	"hq_city" text,
	"hq_state" text,
	"hq_country" text,
	"hq_postal" text,
	"hq_phone" text,
	"cav_id" text,
	"cav_user_id" text,
	"eligibility_status" "verification_eligibility_status" DEFAULT 'Out_of_Scope',
	"eligibility_reason" text,
	"verification_status" "verification_status" DEFAULT 'Pending',
	"qa_status" "verification_qa_status" DEFAULT 'Unreviewed',
	"email_status" "verification_email_status" DEFAULT 'unknown',
	"suppressed" boolean DEFAULT false,
	"deleted" boolean DEFAULT false,
	"assignee_id" varchar,
	"priority_score" numeric(10, 2),
	"in_submission_buffer" boolean DEFAULT false,
	"first_name_norm" text,
	"last_name_norm" text,
	"company_key" text,
	"contact_country_key" text,
	"address_enrichment_status" "address_enrichment_status" DEFAULT 'not_needed',
	"address_enriched_at" timestamp,
	"address_enrichment_error" text,
	"phone_enrichment_status" "phone_enrichment_status" DEFAULT 'not_needed',
	"phone_enriched_at" timestamp,
	"phone_enrichment_error" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "verification_email_validation_jobs" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"campaign_id" varchar NOT NULL,
	"status" "email_validation_job_status" DEFAULT 'pending' NOT NULL,
	"total_contacts" integer DEFAULT 0 NOT NULL,
	"processed_contacts" integer DEFAULT 0 NOT NULL,
	"current_batch" integer DEFAULT 0 NOT NULL,
	"total_batches" integer DEFAULT 0 NOT NULL,
	"success_count" integer DEFAULT 0 NOT NULL,
	"failure_count" integer DEFAULT 0 NOT NULL,
	"status_counts" jsonb DEFAULT '{"ok":0,"invalid":0,"risky":0,"disposable":0,"accept_all":0,"unknown":0}'::jsonb,
	"error_message" text,
	"contact_ids" jsonb,
	"created_by" varchar,
	"started_at" timestamp,
	"finished_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "verification_email_validations" (
	"contact_id" varchar NOT NULL,
	"email_lower" varchar NOT NULL,
	"provider" text DEFAULT 'ELV' NOT NULL,
	"status" "verification_email_status" NOT NULL,
	"raw_json" jsonb,
	"checked_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "verification_lead_submissions" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"contact_id" varchar NOT NULL,
	"account_id" varchar,
	"campaign_id" varchar NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"excluded_reason" text,
	CONSTRAINT "verification_lead_submissions_contact_id_unique" UNIQUE("contact_id")
);
--> statement-breakpoint
CREATE TABLE "verification_suppression_list" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"campaign_id" varchar,
	"email_lower" text,
	"cav_id" text,
	"cav_user_id" text,
	"name_company_hash" text,
	"added_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "verification_upload_jobs" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"campaign_id" varchar NOT NULL,
	"status" "upload_job_status" DEFAULT 'pending' NOT NULL,
	"total_rows" integer DEFAULT 0 NOT NULL,
	"processed_rows" integer DEFAULT 0 NOT NULL,
	"success_count" integer DEFAULT 0 NOT NULL,
	"error_count" integer DEFAULT 0 NOT NULL,
	"errors" jsonb DEFAULT '[]'::jsonb,
	"csv_data" text,
	"field_mappings" jsonb,
	"update_mode" boolean DEFAULT false,
	"created_by" varchar,
	"started_at" timestamp,
	"finished_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "voicemail_assets" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"message_type" "voicemail_message_type" NOT NULL,
	"tts_voice_id" text,
	"tts_template" text,
	"audio_file_url" text,
	"audio_file_key" text,
	"duration_sec" integer,
	"locale" text DEFAULT 'en-US',
	"owner_id" varchar,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "warmup_plans" (
	"id" serial PRIMARY KEY NOT NULL,
	"ip_pool_id" integer NOT NULL,
	"day" integer NOT NULL,
	"daily_cap" integer NOT NULL,
	"domain_split_json" jsonb,
	"status" "warmup_status" DEFAULT 'not_started' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "account_domains" ADD CONSTRAINT "account_domains_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "accounts" ADD CONSTRAINT "accounts_industry_ai_reviewed_by_users_id_fk" FOREIGN KEY ("industry_ai_reviewed_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "accounts" ADD CONSTRAINT "accounts_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "accounts" ADD CONSTRAINT "accounts_parent_account_id_fkey" FOREIGN KEY ("parent_account_id") REFERENCES "public"."accounts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "activity_log" ADD CONSTRAINT "activity_log_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_queue" ADD CONSTRAINT "agent_queue_agent_id_users_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_queue" ADD CONSTRAINT "agent_queue_campaign_id_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaigns"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_queue" ADD CONSTRAINT "agent_queue_contact_id_contacts_id_fk" FOREIGN KEY ("contact_id") REFERENCES "public"."contacts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_queue" ADD CONSTRAINT "agent_queue_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_queue" ADD CONSTRAINT "agent_queue_locked_by_users_id_fk" FOREIGN KEY ("locked_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_queue" ADD CONSTRAINT "agent_queue_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_queue" ADD CONSTRAINT "agent_queue_released_by_users_id_fk" FOREIGN KEY ("released_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_status" ADD CONSTRAINT "agent_status_agent_id_users_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_status" ADD CONSTRAINT "agent_status_campaign_id_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaigns"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_status" ADD CONSTRAINT "agent_status_current_call_id_call_sessions_id_fk" FOREIGN KEY ("current_call_id") REFERENCES "public"."call_sessions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_content_generations" ADD CONSTRAINT "ai_content_generations_asset_id_content_assets_id_fk" FOREIGN KEY ("asset_id") REFERENCES "public"."content_assets"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_content_generations" ADD CONSTRAINT "ai_content_generations_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "auto_dialer_queues" ADD CONSTRAINT "auto_dialer_queues_campaign_id_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaigns"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "auto_dialer_queues" ADD CONSTRAINT "auto_dialer_queues_vm_asset_id_voicemail_assets_id_fk" FOREIGN KEY ("vm_asset_id") REFERENCES "public"."voicemail_assets"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bulk_imports" ADD CONSTRAINT "bulk_imports_uploaded_by_id_users_id_fk" FOREIGN KEY ("uploaded_by_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "call_attempts" ADD CONSTRAINT "call_attempts_campaign_id_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaigns"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "call_attempts" ADD CONSTRAINT "call_attempts_contact_id_contacts_id_fk" FOREIGN KEY ("contact_id") REFERENCES "public"."contacts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "call_attempts" ADD CONSTRAINT "call_attempts_agent_id_users_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "call_attempts" ADD CONSTRAINT "call_attempts_vm_asset_id_voicemail_assets_id_fk" FOREIGN KEY ("vm_asset_id") REFERENCES "public"."voicemail_assets"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "call_dispositions" ADD CONSTRAINT "call_dispositions_call_session_id_call_sessions_id_fk" FOREIGN KEY ("call_session_id") REFERENCES "public"."call_sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "call_dispositions" ADD CONSTRAINT "call_dispositions_disposition_id_dispositions_id_fk" FOREIGN KEY ("disposition_id") REFERENCES "public"."dispositions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "call_dispositions" ADD CONSTRAINT "call_dispositions_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "call_events" ADD CONSTRAINT "call_events_attempt_id_call_attempts_id_fk" FOREIGN KEY ("attempt_id") REFERENCES "public"."call_attempts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "call_jobs" ADD CONSTRAINT "call_jobs_campaign_id_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaigns"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "call_jobs" ADD CONSTRAINT "call_jobs_contact_id_contacts_id_fk" FOREIGN KEY ("contact_id") REFERENCES "public"."contacts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "call_jobs" ADD CONSTRAINT "call_jobs_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "call_jobs" ADD CONSTRAINT "call_jobs_agent_id_users_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "call_jobs" ADD CONSTRAINT "call_jobs_locked_by_agent_id_users_id_fk" FOREIGN KEY ("locked_by_agent_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "call_recording_access_logs" ADD CONSTRAINT "call_recording_access_logs_call_attempt_id_call_attempts_id_fk" FOREIGN KEY ("call_attempt_id") REFERENCES "public"."call_attempts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "call_recording_access_logs" ADD CONSTRAINT "call_recording_access_logs_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "call_scripts" ADD CONSTRAINT "call_scripts_campaign_id_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaigns"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "call_sessions" ADD CONSTRAINT "call_sessions_call_job_id_call_jobs_id_fk" FOREIGN KEY ("call_job_id") REFERENCES "public"."call_jobs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "calls" ADD CONSTRAINT "calls_campaign_id_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaigns"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "calls" ADD CONSTRAINT "calls_contact_id_contacts_id_fk" FOREIGN KEY ("contact_id") REFERENCES "public"."contacts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "calls" ADD CONSTRAINT "calls_agent_id_users_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campaign_account_stats" ADD CONSTRAINT "campaign_account_stats_campaign_id_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaigns"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campaign_account_stats" ADD CONSTRAINT "campaign_account_stats_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campaign_agent_assignments" ADD CONSTRAINT "campaign_agent_assignments_campaign_id_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaigns"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campaign_agent_assignments" ADD CONSTRAINT "campaign_agent_assignments_agent_id_users_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campaign_agent_assignments" ADD CONSTRAINT "campaign_agent_assignments_assigned_by_users_id_fk" FOREIGN KEY ("assigned_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campaign_agents" ADD CONSTRAINT "campaign_agents_campaign_id_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaigns"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campaign_agents" ADD CONSTRAINT "campaign_agents_agent_id_users_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campaign_audience_snapshots" ADD CONSTRAINT "campaign_audience_snapshots_campaign_id_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaigns"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campaign_content_links" ADD CONSTRAINT "campaign_content_links_campaign_id_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaigns"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campaign_opt_outs" ADD CONSTRAINT "campaign_opt_outs_campaign_id_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaigns"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campaign_opt_outs" ADD CONSTRAINT "campaign_opt_outs_contact_id_contacts_id_fk" FOREIGN KEY ("contact_id") REFERENCES "public"."contacts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campaign_opt_outs" ADD CONSTRAINT "campaign_opt_outs_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campaign_orders" ADD CONSTRAINT "campaign_orders_client_user_id_users_id_fk" FOREIGN KEY ("client_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campaign_queue" ADD CONSTRAINT "campaign_queue_campaign_id_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaigns"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campaign_queue" ADD CONSTRAINT "campaign_queue_contact_id_contacts_id_fk" FOREIGN KEY ("contact_id") REFERENCES "public"."contacts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campaign_queue" ADD CONSTRAINT "campaign_queue_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campaign_queue" ADD CONSTRAINT "campaign_queue_agent_id_users_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campaign_suppression_accounts" ADD CONSTRAINT "campaign_suppression_accounts_campaign_id_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaigns"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campaign_suppression_accounts" ADD CONSTRAINT "campaign_suppression_accounts_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campaign_suppression_accounts" ADD CONSTRAINT "campaign_suppression_accounts_added_by_users_id_fk" FOREIGN KEY ("added_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campaign_suppression_contacts" ADD CONSTRAINT "campaign_suppression_contacts_campaign_id_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaigns"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campaign_suppression_contacts" ADD CONSTRAINT "campaign_suppression_contacts_contact_id_contacts_id_fk" FOREIGN KEY ("contact_id") REFERENCES "public"."contacts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campaign_suppression_contacts" ADD CONSTRAINT "campaign_suppression_contacts_added_by_users_id_fk" FOREIGN KEY ("added_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campaigns" ADD CONSTRAINT "campaigns_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "city_reference" ADD CONSTRAINT "city_reference_state_id_state_reference_id_fk" FOREIGN KEY ("state_id") REFERENCES "public"."state_reference"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "city_reference" ADD CONSTRAINT "city_reference_country_id_country_reference_id_fk" FOREIGN KEY ("country_id") REFERENCES "public"."country_reference"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "company_aliases" ADD CONSTRAINT "company_aliases_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contact_emails" ADD CONSTRAINT "contact_emails_contact_id_contacts_id_fk" FOREIGN KEY ("contact_id") REFERENCES "public"."contacts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contact_voicemail_tracking" ADD CONSTRAINT "contact_voicemail_tracking_contact_id_contacts_id_fk" FOREIGN KEY ("contact_id") REFERENCES "public"."contacts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contact_voicemail_tracking" ADD CONSTRAINT "contact_voicemail_tracking_campaign_id_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaigns"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contact_voicemail_tracking" ADD CONSTRAINT "contact_voicemail_tracking_last_vm_asset_id_voicemail_assets_id_fk" FOREIGN KEY ("last_vm_asset_id") REFERENCES "public"."voicemail_assets"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contacts" ADD CONSTRAINT "contacts_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contacts" ADD CONSTRAINT "contacts_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contacts" ADD CONSTRAINT "contacts_invalidated_by_users_id_fk" FOREIGN KEY ("invalidated_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "content_approvals" ADD CONSTRAINT "content_approvals_asset_id_content_assets_id_fk" FOREIGN KEY ("asset_id") REFERENCES "public"."content_assets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "content_approvals" ADD CONSTRAINT "content_approvals_reviewer_id_users_id_fk" FOREIGN KEY ("reviewer_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "content_asset_pushes" ADD CONSTRAINT "content_asset_pushes_asset_id_content_assets_id_fk" FOREIGN KEY ("asset_id") REFERENCES "public"."content_assets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "content_asset_pushes" ADD CONSTRAINT "content_asset_pushes_pushed_by_users_id_fk" FOREIGN KEY ("pushed_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "content_assets" ADD CONSTRAINT "content_assets_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "content_versions" ADD CONSTRAINT "content_versions_asset_id_content_assets_id_fk" FOREIGN KEY ("asset_id") REFERENCES "public"."content_assets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "content_versions" ADD CONSTRAINT "content_versions_changed_by_users_id_fk" FOREIGN KEY ("changed_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "custom_field_definitions" ADD CONSTRAINT "custom_field_definitions_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dedupe_review_queue" ADD CONSTRAINT "dedupe_review_queue_reviewed_by_users_id_fk" FOREIGN KEY ("reviewed_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dispositions" ADD CONSTRAINT "dispositions_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dkim_keys" ADD CONSTRAINT "dkim_keys_domain_auth_id_domain_auth_id_fk" FOREIGN KEY ("domain_auth_id") REFERENCES "public"."domain_auth"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "domain_set_contact_links" ADD CONSTRAINT "domain_set_contact_links_domain_set_id_domain_sets_id_fk" FOREIGN KEY ("domain_set_id") REFERENCES "public"."domain_sets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "domain_set_contact_links" ADD CONSTRAINT "domain_set_contact_links_contact_id_contacts_id_fk" FOREIGN KEY ("contact_id") REFERENCES "public"."contacts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "domain_set_contact_links" ADD CONSTRAINT "domain_set_contact_links_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "domain_set_items" ADD CONSTRAINT "domain_set_items_domain_set_id_domain_sets_id_fk" FOREIGN KEY ("domain_set_id") REFERENCES "public"."domain_sets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "domain_set_items" ADD CONSTRAINT "domain_set_items_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "domain_sets" ADD CONSTRAINT "domain_sets_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dv_account_assignments" ADD CONSTRAINT "dv_account_assignments_account_id_dv_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."dv_accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dv_accounts" ADD CONSTRAINT "dv_accounts_project_id_dv_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."dv_projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dv_agent_filters" ADD CONSTRAINT "dv_agent_filters_project_id_dv_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."dv_projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dv_company_caps" ADD CONSTRAINT "dv_company_caps_project_id_dv_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."dv_projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dv_deliveries" ADD CONSTRAINT "dv_deliveries_project_id_dv_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."dv_projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dv_field_constraints" ADD CONSTRAINT "dv_field_constraints_project_id_dv_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."dv_projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dv_field_mappings" ADD CONSTRAINT "dv_field_mappings_project_id_dv_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."dv_projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dv_project_agents" ADD CONSTRAINT "dv_project_agents_project_id_dv_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."dv_projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dv_project_exclusions" ADD CONSTRAINT "dv_project_exclusions_project_id_dv_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."dv_projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dv_project_exclusions" ADD CONSTRAINT "dv_project_exclusions_list_id_dv_exclusion_lists_id_fk" FOREIGN KEY ("list_id") REFERENCES "public"."dv_exclusion_lists"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dv_records" ADD CONSTRAINT "dv_records_project_id_dv_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."dv_projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dv_records" ADD CONSTRAINT "dv_records_account_id_dv_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."dv_accounts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dv_records_raw" ADD CONSTRAINT "dv_records_raw_project_id_dv_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."dv_projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dv_runs" ADD CONSTRAINT "dv_runs_record_id_dv_records_id_fk" FOREIGN KEY ("record_id") REFERENCES "public"."dv_records"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dv_runs" ADD CONSTRAINT "dv_runs_project_id_dv_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."dv_projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dv_selection_sets" ADD CONSTRAINT "dv_selection_sets_project_id_dv_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."dv_projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "email_events" ADD CONSTRAINT "email_events_send_id_email_sends_id_fk" FOREIGN KEY ("send_id") REFERENCES "public"."email_sends"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "email_messages" ADD CONSTRAINT "email_messages_campaign_id_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaigns"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "email_messages" ADD CONSTRAINT "email_messages_contact_id_contacts_id_fk" FOREIGN KEY ("contact_id") REFERENCES "public"."contacts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "email_sends" ADD CONSTRAINT "email_sends_campaign_id_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaigns"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "email_sends" ADD CONSTRAINT "email_sends_contact_id_contacts_id_fk" FOREIGN KEY ("contact_id") REFERENCES "public"."contacts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "email_sends" ADD CONSTRAINT "email_sends_template_id_email_templates_id_fk" FOREIGN KEY ("template_id") REFERENCES "public"."email_templates"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "email_sends" ADD CONSTRAINT "email_sends_sender_profile_id_sender_profiles_id_fk" FOREIGN KEY ("sender_profile_id") REFERENCES "public"."sender_profiles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "email_templates" ADD CONSTRAINT "email_templates_approved_by_id_users_id_fk" FOREIGN KEY ("approved_by_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "events" ADD CONSTRAINT "events_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "field_change_log" ADD CONSTRAINT "field_change_log_actor_id_users_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "global_dnc" ADD CONSTRAINT "global_dnc_contact_id_contacts_id_fk" FOREIGN KEY ("contact_id") REFERENCES "public"."contacts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "global_dnc" ADD CONSTRAINT "global_dnc_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "industry_reference" ADD CONSTRAINT "industry_reference_parent_id_fkey" FOREIGN KEY ("parent_id") REFERENCES "public"."industry_reference"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "leads" ADD CONSTRAINT "leads_contact_id_contacts_id_fk" FOREIGN KEY ("contact_id") REFERENCES "public"."contacts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "leads" ADD CONSTRAINT "leads_campaign_id_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaigns"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "leads" ADD CONSTRAINT "leads_call_attempt_id_call_attempts_id_fk" FOREIGN KEY ("call_attempt_id") REFERENCES "public"."call_attempts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "leads" ADD CONSTRAINT "leads_agent_id_users_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "leads" ADD CONSTRAINT "leads_approved_by_id_users_id_fk" FOREIGN KEY ("approved_by_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lists" ADD CONSTRAINT "lists_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "news" ADD CONSTRAINT "news_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_assets" ADD CONSTRAINT "order_assets_order_id_campaign_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."campaign_orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_audience_snapshots" ADD CONSTRAINT "order_audience_snapshots_order_id_campaign_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."campaign_orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_campaign_links" ADD CONSTRAINT "order_campaign_links_order_id_campaign_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."campaign_orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_campaign_links" ADD CONSTRAINT "order_campaign_links_campaign_id_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaigns"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_campaign_links" ADD CONSTRAINT "order_campaign_links_linked_by_id_users_id_fk" FOREIGN KEY ("linked_by_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_qualification_questions" ADD CONSTRAINT "order_qualification_questions_order_id_campaign_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."campaign_orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "qualification_responses" ADD CONSTRAINT "qualification_responses_attempt_id_call_attempts_id_fk" FOREIGN KEY ("attempt_id") REFERENCES "public"."call_attempts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "qualification_responses" ADD CONSTRAINT "qualification_responses_lead_id_leads_id_fk" FOREIGN KEY ("lead_id") REFERENCES "public"."leads"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "resources" ADD CONSTRAINT "resources_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "saved_filters" ADD CONSTRAINT "saved_filters_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "segments" ADD CONSTRAINT "segments_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "selection_contexts" ADD CONSTRAINT "selection_contexts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sip_trunk_configs" ADD CONSTRAINT "sip_trunk_configs_created_by_id_users_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "social_posts" ADD CONSTRAINT "social_posts_asset_id_content_assets_id_fk" FOREIGN KEY ("asset_id") REFERENCES "public"."content_assets"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "social_posts" ADD CONSTRAINT "social_posts_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "softphone_profiles" ADD CONSTRAINT "softphone_profiles_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "state_reference" ADD CONSTRAINT "state_reference_country_id_country_reference_id_fk" FOREIGN KEY ("country_id") REFERENCES "public"."country_reference"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_roles" ADD CONSTRAINT "user_roles_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_roles" ADD CONSTRAINT "user_roles_assigned_by_users_id_fk" FOREIGN KEY ("assigned_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "verification_audit_log" ADD CONSTRAINT "verification_audit_log_actor_id_users_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "verification_campaigns" ADD CONSTRAINT "verification_campaigns_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "verification_contacts" ADD CONSTRAINT "verification_contacts_campaign_id_verification_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."verification_campaigns"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "verification_contacts" ADD CONSTRAINT "verification_contacts_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "verification_contacts" ADD CONSTRAINT "verification_contacts_assignee_id_users_id_fk" FOREIGN KEY ("assignee_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "verification_email_validation_jobs" ADD CONSTRAINT "verification_email_validation_jobs_campaign_id_verification_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."verification_campaigns"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "verification_email_validation_jobs" ADD CONSTRAINT "verification_email_validation_jobs_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "verification_email_validations" ADD CONSTRAINT "verification_email_validations_contact_id_verification_contacts_id_fk" FOREIGN KEY ("contact_id") REFERENCES "public"."verification_contacts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "verification_lead_submissions" ADD CONSTRAINT "verification_lead_submissions_contact_id_verification_contacts_id_fk" FOREIGN KEY ("contact_id") REFERENCES "public"."verification_contacts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "verification_lead_submissions" ADD CONSTRAINT "verification_lead_submissions_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "verification_lead_submissions" ADD CONSTRAINT "verification_lead_submissions_campaign_id_verification_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."verification_campaigns"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "verification_suppression_list" ADD CONSTRAINT "verification_suppression_list_campaign_id_verification_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."verification_campaigns"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "verification_upload_jobs" ADD CONSTRAINT "verification_upload_jobs_campaign_id_verification_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."verification_campaigns"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "verification_upload_jobs" ADD CONSTRAINT "verification_upload_jobs_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "voicemail_assets" ADD CONSTRAINT "voicemail_assets_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "warmup_plans" ADD CONSTRAINT "warmup_plans_ip_pool_id_ip_pools_id_fk" FOREIGN KEY ("ip_pool_id") REFERENCES "public"."ip_pools"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "account_domains_account_idx" ON "account_domains" USING btree ("account_id");--> statement-breakpoint
CREATE UNIQUE INDEX "account_domains_domain_normalized_unique_idx" ON "account_domains" USING btree ("domain_normalized") WHERE deleted_at IS NULL;--> statement-breakpoint
CREATE INDEX "accounts_domain_idx" ON "accounts" USING btree ("domain");--> statement-breakpoint
CREATE UNIQUE INDEX "accounts_domain_normalized_unique_idx" ON "accounts" USING btree ("domain_normalized") WHERE deleted_at IS NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "accounts_name_city_country_unique_idx" ON "accounts" USING btree ("name_normalized","hq_city","hq_country") WHERE deleted_at IS NULL AND domain_normalized IS NULL;--> statement-breakpoint
CREATE INDEX "accounts_owner_idx" ON "accounts" USING btree ("owner_id");--> statement-breakpoint
CREATE INDEX "accounts_name_idx" ON "accounts" USING btree ("name");--> statement-breakpoint
CREATE INDEX "accounts_canonical_name_idx" ON "accounts" USING btree ("canonical_name");--> statement-breakpoint
CREATE INDEX "accounts_specialties_gin_idx" ON "accounts" USING gin ("linkedin_specialties");--> statement-breakpoint
CREATE INDEX "accounts_tech_stack_gin_idx" ON "accounts" USING gin ("tech_stack");--> statement-breakpoint
CREATE INDEX "accounts_tags_gin_idx" ON "accounts" USING gin ("tags");--> statement-breakpoint
CREATE INDEX "activity_log_entity_idx" ON "activity_log" USING btree ("entity_type","entity_id");--> statement-breakpoint
CREATE INDEX "activity_log_event_type_idx" ON "activity_log" USING btree ("event_type");--> statement-breakpoint
CREATE INDEX "activity_log_created_at_idx" ON "activity_log" USING btree ("created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "agent_queue_agent_campaign_contact_uniq" ON "agent_queue" USING btree ("agent_id","campaign_id","contact_id");--> statement-breakpoint
CREATE INDEX "agent_queue_agent_state_idx" ON "agent_queue" USING btree ("agent_id","queue_state");--> statement-breakpoint
CREATE INDEX "agent_queue_campaign_idx" ON "agent_queue" USING btree ("campaign_id");--> statement-breakpoint
CREATE INDEX "agent_queue_contact_idx" ON "agent_queue" USING btree ("contact_id");--> statement-breakpoint
CREATE INDEX "agent_queue_pull_idx" ON "agent_queue" USING btree ("campaign_id","queue_state","priority","scheduled_for");--> statement-breakpoint
CREATE UNIQUE INDEX "agent_status_agent_idx" ON "agent_status" USING btree ("agent_id");--> statement-breakpoint
CREATE INDEX "agent_status_status_idx" ON "agent_status" USING btree ("status");--> statement-breakpoint
CREATE INDEX "agent_status_campaign_idx" ON "agent_status" USING btree ("campaign_id");--> statement-breakpoint
CREATE INDEX "ai_content_generations_asset_id_idx" ON "ai_content_generations" USING btree ("asset_id");--> statement-breakpoint
CREATE INDEX "ai_content_generations_user_idx" ON "ai_content_generations" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "ai_content_generations_created_at_idx" ON "ai_content_generations" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "audit_logs_user_idx" ON "audit_logs" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "audit_logs_entity_idx" ON "audit_logs" USING btree ("entity_type","entity_id");--> statement-breakpoint
CREATE INDEX "audit_logs_created_at_idx" ON "audit_logs" USING btree ("created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "auto_dialer_queues_campaign_idx" ON "auto_dialer_queues" USING btree ("campaign_id");--> statement-breakpoint
CREATE INDEX "auto_dialer_queues_active_idx" ON "auto_dialer_queues" USING btree ("is_active");--> statement-breakpoint
CREATE INDEX "auto_dialer_queues_vm_asset_idx" ON "auto_dialer_queues" USING btree ("vm_asset_id");--> statement-breakpoint
CREATE INDEX "bulk_imports_status_idx" ON "bulk_imports" USING btree ("status");--> statement-breakpoint
CREATE INDEX "business_hours_config_timezone_idx" ON "business_hours_config" USING btree ("timezone");--> statement-breakpoint
CREATE UNIQUE INDEX "business_hours_config_timezone_day_uniq" ON "business_hours_config" USING btree ("timezone","day_of_week");--> statement-breakpoint
CREATE INDEX "call_attempts_campaign_idx" ON "call_attempts" USING btree ("campaign_id");--> statement-breakpoint
CREATE INDEX "call_attempts_contact_idx" ON "call_attempts" USING btree ("contact_id");--> statement-breakpoint
CREATE INDEX "call_attempts_agent_idx" ON "call_attempts" USING btree ("agent_id");--> statement-breakpoint
CREATE INDEX "call_attempts_amd_result_idx" ON "call_attempts" USING btree ("amd_result");--> statement-breakpoint
CREATE INDEX "call_attempts_vm_asset_idx" ON "call_attempts" USING btree ("vm_asset_id");--> statement-breakpoint
CREATE INDEX "call_dispositions_call_session_idx" ON "call_dispositions" USING btree ("call_session_id");--> statement-breakpoint
CREATE INDEX "call_dispositions_disposition_idx" ON "call_dispositions" USING btree ("disposition_id");--> statement-breakpoint
CREATE INDEX "call_events_attempt_idx" ON "call_events" USING btree ("attempt_id");--> statement-breakpoint
CREATE INDEX "call_events_type_idx" ON "call_events" USING btree ("type");--> statement-breakpoint
CREATE INDEX "call_jobs_campaign_status_idx" ON "call_jobs" USING btree ("campaign_id","status");--> statement-breakpoint
CREATE INDEX "call_jobs_contact_idx" ON "call_jobs" USING btree ("contact_id");--> statement-breakpoint
CREATE INDEX "call_jobs_account_idx" ON "call_jobs" USING btree ("account_id");--> statement-breakpoint
CREATE INDEX "call_jobs_agent_idx" ON "call_jobs" USING btree ("agent_id");--> statement-breakpoint
CREATE INDEX "call_jobs_scheduled_at_idx" ON "call_jobs" USING btree ("scheduled_at");--> statement-breakpoint
CREATE INDEX "call_recording_access_logs_attempt_idx" ON "call_recording_access_logs" USING btree ("call_attempt_id");--> statement-breakpoint
CREATE INDEX "call_recording_access_logs_user_idx" ON "call_recording_access_logs" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "call_recording_access_logs_action_idx" ON "call_recording_access_logs" USING btree ("action");--> statement-breakpoint
CREATE INDEX "call_sessions_call_job_idx" ON "call_sessions" USING btree ("call_job_id");--> statement-breakpoint
CREATE INDEX "call_sessions_telnyx_call_idx" ON "call_sessions" USING btree ("telnyx_call_id");--> statement-breakpoint
CREATE INDEX "call_sessions_status_idx" ON "call_sessions" USING btree ("status");--> statement-breakpoint
CREATE INDEX "calls_campaign_idx" ON "calls" USING btree ("campaign_id");--> statement-breakpoint
CREATE INDEX "calls_contact_idx" ON "calls" USING btree ("contact_id");--> statement-breakpoint
CREATE INDEX "calls_agent_idx" ON "calls" USING btree ("agent_id");--> statement-breakpoint
CREATE INDEX "calls_queue_item_idx" ON "calls" USING btree ("queue_item_id");--> statement-breakpoint
CREATE UNIQUE INDEX "campaign_agent_assignments_uniq" ON "campaign_agent_assignments" USING btree ("campaign_id","agent_id");--> statement-breakpoint
CREATE UNIQUE INDEX "campaign_agent_assignments_active_agent_uniq" ON "campaign_agent_assignments" USING btree ("agent_id") WHERE "campaign_agent_assignments"."is_active" = true;--> statement-breakpoint
CREATE INDEX "campaign_agent_assignments_campaign_idx" ON "campaign_agent_assignments" USING btree ("campaign_id");--> statement-breakpoint
CREATE INDEX "campaign_agent_assignments_agent_idx" ON "campaign_agent_assignments" USING btree ("agent_id");--> statement-breakpoint
CREATE INDEX "campaign_agents_campaign_idx" ON "campaign_agents" USING btree ("campaign_id");--> statement-breakpoint
CREATE INDEX "campaign_agents_agent_idx" ON "campaign_agents" USING btree ("agent_id");--> statement-breakpoint
CREATE INDEX "campaign_audience_snapshots_campaign_idx" ON "campaign_audience_snapshots" USING btree ("campaign_id");--> statement-breakpoint
CREATE UNIQUE INDEX "campaign_content_unique_idx" ON "campaign_content_links" USING btree ("campaign_id","content_type","content_id");--> statement-breakpoint
CREATE INDEX "campaign_content_links_content_id_idx" ON "campaign_content_links" USING btree ("content_id");--> statement-breakpoint
CREATE UNIQUE INDEX "campaign_opt_outs_campaign_contact_uniq" ON "campaign_opt_outs" USING btree ("campaign_id","contact_id");--> statement-breakpoint
CREATE INDEX "campaign_opt_outs_campaign_idx" ON "campaign_opt_outs" USING btree ("campaign_id");--> statement-breakpoint
CREATE INDEX "campaign_opt_outs_contact_idx" ON "campaign_opt_outs" USING btree ("contact_id");--> statement-breakpoint
CREATE INDEX "campaign_orders_client_idx" ON "campaign_orders" USING btree ("client_user_id");--> statement-breakpoint
CREATE INDEX "campaign_orders_status_idx" ON "campaign_orders" USING btree ("status");--> statement-breakpoint
CREATE INDEX "campaign_queue_camp_acct_idx" ON "campaign_queue" USING btree ("campaign_id","account_id");--> statement-breakpoint
CREATE INDEX "campaign_queue_camp_status_idx" ON "campaign_queue" USING btree ("campaign_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "campaign_queue_camp_contact_uniq" ON "campaign_queue" USING btree ("campaign_id","contact_id");--> statement-breakpoint
CREATE INDEX "campaign_queue_agent_idx" ON "campaign_queue" USING btree ("agent_id");--> statement-breakpoint
CREATE UNIQUE INDEX "campaign_queue_active_uniq" ON "campaign_queue" USING btree ("campaign_id","contact_id") WHERE "campaign_queue"."status" NOT IN ('done','removed');--> statement-breakpoint
CREATE INDEX "campaign_queue_pull_idx" ON "campaign_queue" USING btree ("campaign_id","status","next_attempt_at","priority");--> statement-breakpoint
CREATE INDEX "campaign_suppression_accounts_campaign_idx" ON "campaign_suppression_accounts" USING btree ("campaign_id","account_id");--> statement-breakpoint
CREATE INDEX "campaign_suppression_accounts_account_idx" ON "campaign_suppression_accounts" USING btree ("account_id");--> statement-breakpoint
CREATE UNIQUE INDEX "campaign_suppression_accounts_unique" ON "campaign_suppression_accounts" USING btree ("campaign_id","account_id");--> statement-breakpoint
CREATE INDEX "campaign_suppression_contacts_campaign_idx" ON "campaign_suppression_contacts" USING btree ("campaign_id","contact_id");--> statement-breakpoint
CREATE INDEX "campaign_suppression_contacts_contact_idx" ON "campaign_suppression_contacts" USING btree ("contact_id");--> statement-breakpoint
CREATE UNIQUE INDEX "campaign_suppression_contacts_unique" ON "campaign_suppression_contacts" USING btree ("campaign_id","contact_id");--> statement-breakpoint
CREATE INDEX "campaigns_status_idx" ON "campaigns" USING btree ("status");--> statement-breakpoint
CREATE INDEX "campaigns_type_idx" ON "campaigns" USING btree ("type");--> statement-breakpoint
CREATE INDEX "campaigns_dial_mode_idx" ON "campaigns" USING btree ("dial_mode");--> statement-breakpoint
CREATE INDEX "city_reference_name_idx" ON "city_reference" USING btree ("name");--> statement-breakpoint
CREATE INDEX "city_reference_state_id_idx" ON "city_reference" USING btree ("state_id");--> statement-breakpoint
CREATE INDEX "city_reference_country_id_idx" ON "city_reference" USING btree ("country_id");--> statement-breakpoint
CREATE INDEX "city_reference_sort_order_idx" ON "city_reference" USING btree ("sort_order");--> statement-breakpoint
CREATE UNIQUE INDEX "company_aliases_canonical_alias_uniq" ON "company_aliases" USING btree ("canonical_name","alias");--> statement-breakpoint
CREATE INDEX "company_aliases_alias_idx" ON "company_aliases" USING btree ("alias");--> statement-breakpoint
CREATE INDEX "company_size_reference_code_idx" ON "company_size_reference" USING btree ("code");--> statement-breakpoint
CREATE INDEX "company_size_reference_sort_order_idx" ON "company_size_reference" USING btree ("sort_order");--> statement-breakpoint
CREATE INDEX "contact_emails_contact_idx" ON "contact_emails" USING btree ("contact_id");--> statement-breakpoint
CREATE UNIQUE INDEX "contact_emails_email_normalized_unique_idx" ON "contact_emails" USING btree ("email_normalized") WHERE deleted_at IS NULL;--> statement-breakpoint
CREATE INDEX "contact_vm_tracking_last_vm_idx" ON "contact_voicemail_tracking" USING btree ("last_vm_at");--> statement-breakpoint
CREATE INDEX "contacts_email_idx" ON "contacts" USING btree ("email");--> statement-breakpoint
CREATE UNIQUE INDEX "contacts_email_normalized_unique_idx" ON "contacts" USING btree ("email_normalized") WHERE deleted_at IS NULL;--> statement-breakpoint
CREATE INDEX "contacts_account_idx" ON "contacts" USING btree ("account_id");--> statement-breakpoint
CREATE INDEX "contacts_phone_idx" ON "contacts" USING btree ("direct_phone_e164");--> statement-breakpoint
CREATE INDEX "contacts_owner_idx" ON "contacts" USING btree ("owner_id");--> statement-breakpoint
CREATE INDEX "contacts_tags_gin_idx" ON "contacts" USING gin ("tags");--> statement-breakpoint
CREATE INDEX "contacts_timezone_idx" ON "contacts" USING btree ("timezone");--> statement-breakpoint
CREATE INDEX "content_approvals_asset_id_idx" ON "content_approvals" USING btree ("asset_id");--> statement-breakpoint
CREATE INDEX "content_approvals_reviewer_idx" ON "content_approvals" USING btree ("reviewer_id");--> statement-breakpoint
CREATE INDEX "content_asset_pushes_asset_id_idx" ON "content_asset_pushes" USING btree ("asset_id");--> statement-breakpoint
CREATE INDEX "content_asset_pushes_status_idx" ON "content_asset_pushes" USING btree ("status");--> statement-breakpoint
CREATE INDEX "content_asset_pushes_target_url_idx" ON "content_asset_pushes" USING btree ("target_url");--> statement-breakpoint
CREATE INDEX "content_assets_asset_type_idx" ON "content_assets" USING btree ("asset_type");--> statement-breakpoint
CREATE INDEX "content_assets_approval_status_idx" ON "content_assets" USING btree ("approval_status");--> statement-breakpoint
CREATE INDEX "content_assets_owner_idx" ON "content_assets" USING btree ("owner_id");--> statement-breakpoint
CREATE INDEX "content_events_event_name_idx" ON "content_events" USING btree ("event_name");--> statement-breakpoint
CREATE INDEX "content_events_contact_id_idx" ON "content_events" USING btree ("contact_id");--> statement-breakpoint
CREATE INDEX "content_events_content_id_idx" ON "content_events" USING btree ("content_id");--> statement-breakpoint
CREATE INDEX "content_events_ts_idx" ON "content_events" USING btree ("ts");--> statement-breakpoint
CREATE INDEX "content_versions_asset_id_idx" ON "content_versions" USING btree ("asset_id");--> statement-breakpoint
CREATE INDEX "content_versions_version_number_idx" ON "content_versions" USING btree ("asset_id","version_number");--> statement-breakpoint
CREATE INDEX "country_reference_name_idx" ON "country_reference" USING btree ("name");--> statement-breakpoint
CREATE INDEX "country_reference_code_idx" ON "country_reference" USING btree ("code");--> statement-breakpoint
CREATE INDEX "country_reference_sort_order_idx" ON "country_reference" USING btree ("sort_order");--> statement-breakpoint
CREATE UNIQUE INDEX "custom_field_definitions_entity_key_idx" ON "custom_field_definitions" USING btree ("entity_type","field_key");--> statement-breakpoint
CREATE INDEX "custom_field_definitions_entity_type_idx" ON "custom_field_definitions" USING btree ("entity_type");--> statement-breakpoint
CREATE INDEX "dedupe_review_queue_status_idx" ON "dedupe_review_queue" USING btree ("status");--> statement-breakpoint
CREATE INDEX "dedupe_review_queue_entity_type_idx" ON "dedupe_review_queue" USING btree ("entity_type");--> statement-breakpoint
CREATE INDEX "department_reference_name_idx" ON "department_reference" USING btree ("name");--> statement-breakpoint
CREATE INDEX "department_reference_sort_order_idx" ON "department_reference" USING btree ("sort_order");--> statement-breakpoint
CREATE INDEX "dispositions_label_idx" ON "dispositions" USING btree ("label");--> statement-breakpoint
CREATE INDEX "dispositions_system_action_idx" ON "dispositions" USING btree ("system_action");--> statement-breakpoint
CREATE INDEX "domain_set_contact_links_domain_set_id_idx" ON "domain_set_contact_links" USING btree ("domain_set_id");--> statement-breakpoint
CREATE INDEX "domain_set_contact_links_contact_id_idx" ON "domain_set_contact_links" USING btree ("contact_id");--> statement-breakpoint
CREATE INDEX "domain_set_items_domain_set_id_idx" ON "domain_set_items" USING btree ("domain_set_id");--> statement-breakpoint
CREATE INDEX "domain_set_items_account_id_idx" ON "domain_set_items" USING btree ("account_id");--> statement-breakpoint
CREATE INDEX "domain_set_items_normalized_domain_idx" ON "domain_set_items" USING btree ("normalized_domain");--> statement-breakpoint
CREATE INDEX "domain_sets_owner_id_idx" ON "domain_sets" USING btree ("owner_id");--> statement-breakpoint
CREATE INDEX "domain_sets_status_idx" ON "domain_sets" USING btree ("status");--> statement-breakpoint
CREATE UNIQUE INDEX "dv_accounts_project_domain_idx" ON "dv_accounts" USING btree ("project_id","account_domain");--> statement-breakpoint
CREATE INDEX "dv_records_status_idx" ON "dv_records" USING btree ("status");--> statement-breakpoint
CREATE INDEX "dv_records_project_status_idx" ON "dv_records" USING btree ("project_id","status");--> statement-breakpoint
CREATE INDEX "dv_records_dedupe_idx" ON "dv_records" USING btree ("dedupe_hash");--> statement-breakpoint
CREATE INDEX "email_events_send_idx" ON "email_events" USING btree ("send_id");--> statement-breakpoint
CREATE INDEX "email_events_type_idx" ON "email_events" USING btree ("type");--> statement-breakpoint
CREATE INDEX "email_messages_campaign_idx" ON "email_messages" USING btree ("campaign_id");--> statement-breakpoint
CREATE INDEX "email_messages_contact_idx" ON "email_messages" USING btree ("contact_id");--> statement-breakpoint
CREATE INDEX "email_messages_status_idx" ON "email_messages" USING btree ("status");--> statement-breakpoint
CREATE INDEX "email_sends_campaign_idx" ON "email_sends" USING btree ("campaign_id");--> statement-breakpoint
CREATE INDEX "email_sends_contact_idx" ON "email_sends" USING btree ("contact_id");--> statement-breakpoint
CREATE INDEX "email_sends_status_idx" ON "email_sends" USING btree ("status");--> statement-breakpoint
CREATE INDEX "events_slug_idx" ON "events" USING btree ("slug");--> statement-breakpoint
CREATE INDEX "events_event_type_idx" ON "events" USING btree ("event_type");--> statement-breakpoint
CREATE INDEX "events_community_idx" ON "events" USING btree ("community");--> statement-breakpoint
CREATE INDEX "events_status_idx" ON "events" USING btree ("status");--> statement-breakpoint
CREATE INDEX "events_start_iso_idx" ON "events" USING btree ("start_iso");--> statement-breakpoint
CREATE INDEX "field_change_log_entity_idx" ON "field_change_log" USING btree ("entity_type","entity_id");--> statement-breakpoint
CREATE INDEX "field_change_log_created_at_idx" ON "field_change_log" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "filter_field_registry_entity_key_idx" ON "filter_field_registry" USING btree ("entity","key");--> statement-breakpoint
CREATE INDEX "filter_field_registry_category_idx" ON "filter_field_registry" USING btree ("category");--> statement-breakpoint
CREATE INDEX "filter_field_registry_visible_idx" ON "filter_field_registry" USING btree ("visible_in_filters");--> statement-breakpoint
CREATE INDEX "global_dnc_contact_idx" ON "global_dnc" USING btree ("contact_id");--> statement-breakpoint
CREATE INDEX "global_dnc_phone_idx" ON "global_dnc" USING btree ("phone_e164");--> statement-breakpoint
CREATE UNIQUE INDEX "global_dnc_contact_phone_uniq" ON "global_dnc" USING btree ("contact_id","phone_e164");--> statement-breakpoint
CREATE INDEX "industry_reference_name_idx" ON "industry_reference" USING btree ("name");--> statement-breakpoint
CREATE INDEX "industry_reference_is_active_idx" ON "industry_reference" USING btree ("is_active");--> statement-breakpoint
CREATE INDEX "job_function_reference_name_idx" ON "job_function_reference" USING btree ("name");--> statement-breakpoint
CREATE INDEX "job_function_reference_sort_order_idx" ON "job_function_reference" USING btree ("sort_order");--> statement-breakpoint
CREATE INDEX "leads_qa_status_idx" ON "leads" USING btree ("qa_status");--> statement-breakpoint
CREATE INDEX "leads_campaign_idx" ON "leads" USING btree ("campaign_id");--> statement-breakpoint
CREATE INDEX "leads_call_attempt_idx" ON "leads" USING btree ("call_attempt_id");--> statement-breakpoint
CREATE INDEX "lists_entity_type_idx" ON "lists" USING btree ("entity_type");--> statement-breakpoint
CREATE INDEX "lists_source_type_idx" ON "lists" USING btree ("source_type");--> statement-breakpoint
CREATE INDEX "lists_owner_id_idx" ON "lists" USING btree ("owner_id");--> statement-breakpoint
CREATE INDEX "news_slug_idx" ON "news" USING btree ("slug");--> statement-breakpoint
CREATE INDEX "news_community_idx" ON "news" USING btree ("community");--> statement-breakpoint
CREATE INDEX "news_status_idx" ON "news" USING btree ("status");--> statement-breakpoint
CREATE INDEX "news_published_iso_idx" ON "news" USING btree ("published_iso");--> statement-breakpoint
CREATE INDEX "order_campaign_links_order_idx" ON "order_campaign_links" USING btree ("order_id");--> statement-breakpoint
CREATE INDEX "order_campaign_links_campaign_idx" ON "order_campaign_links" USING btree ("campaign_id");--> statement-breakpoint
CREATE INDEX "organizers_name_idx" ON "organizers" USING btree ("name");--> statement-breakpoint
CREATE INDEX "qualification_responses_attempt_idx" ON "qualification_responses" USING btree ("attempt_id");--> statement-breakpoint
CREATE INDEX "qualification_responses_lead_idx" ON "qualification_responses" USING btree ("lead_id");--> statement-breakpoint
CREATE INDEX "resources_slug_idx" ON "resources" USING btree ("slug");--> statement-breakpoint
CREATE INDEX "resources_resource_type_idx" ON "resources" USING btree ("resource_type");--> statement-breakpoint
CREATE INDEX "resources_community_idx" ON "resources" USING btree ("community");--> statement-breakpoint
CREATE INDEX "resources_status_idx" ON "resources" USING btree ("status");--> statement-breakpoint
CREATE INDEX "revenue_range_reference_label_idx" ON "revenue_range_reference" USING btree ("label");--> statement-breakpoint
CREATE INDEX "revenue_range_reference_sort_order_idx" ON "revenue_range_reference" USING btree ("sort_order");--> statement-breakpoint
CREATE INDEX "saved_filters_user_idx" ON "saved_filters" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "saved_filters_entity_type_idx" ON "saved_filters" USING btree ("entity_type");--> statement-breakpoint
CREATE INDEX "segments_entity_type_idx" ON "segments" USING btree ("entity_type");--> statement-breakpoint
CREATE INDEX "segments_is_active_idx" ON "segments" USING btree ("is_active");--> statement-breakpoint
CREATE INDEX "segments_owner_id_idx" ON "segments" USING btree ("owner_id");--> statement-breakpoint
CREATE INDEX "selection_contexts_user_idx" ON "selection_contexts" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "selection_contexts_expires_idx" ON "selection_contexts" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX "seniority_level_reference_name_idx" ON "seniority_level_reference" USING btree ("name");--> statement-breakpoint
CREATE INDEX "seniority_level_reference_sort_order_idx" ON "seniority_level_reference" USING btree ("sort_order");--> statement-breakpoint
CREATE INDEX "sip_trunk_configs_active_idx" ON "sip_trunk_configs" USING btree ("is_active");--> statement-breakpoint
CREATE INDEX "sip_trunk_configs_default_idx" ON "sip_trunk_configs" USING btree ("is_default");--> statement-breakpoint
CREATE INDEX "social_posts_platform_idx" ON "social_posts" USING btree ("platform");--> statement-breakpoint
CREATE INDEX "social_posts_status_idx" ON "social_posts" USING btree ("status");--> statement-breakpoint
CREATE INDEX "social_posts_scheduled_at_idx" ON "social_posts" USING btree ("scheduled_at");--> statement-breakpoint
CREATE INDEX "social_posts_owner_idx" ON "social_posts" USING btree ("owner_id");--> statement-breakpoint
CREATE INDEX "softphone_profiles_user_idx" ON "softphone_profiles" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "speakers_name_idx" ON "speakers" USING btree ("name");--> statement-breakpoint
CREATE UNIQUE INDEX "speakers_external_id_idx" ON "speakers" USING btree ("external_id");--> statement-breakpoint
CREATE INDEX "sponsors_name_idx" ON "sponsors" USING btree ("name");--> statement-breakpoint
CREATE INDEX "state_reference_name_idx" ON "state_reference" USING btree ("name");--> statement-breakpoint
CREATE INDEX "state_reference_code_idx" ON "state_reference" USING btree ("code");--> statement-breakpoint
CREATE INDEX "state_reference_country_id_idx" ON "state_reference" USING btree ("country_id");--> statement-breakpoint
CREATE INDEX "state_reference_sort_order_idx" ON "state_reference" USING btree ("sort_order");--> statement-breakpoint
CREATE INDEX "state_reference_unique_name_country" ON "state_reference" USING btree ("name","country_id");--> statement-breakpoint
CREATE INDEX "suppression_emails_idx" ON "suppression_emails" USING btree ("email");--> statement-breakpoint
CREATE INDEX "suppression_phones_idx" ON "suppression_phones" USING btree ("phone_e164");--> statement-breakpoint
CREATE INDEX "technology_reference_name_idx" ON "technology_reference" USING btree ("name");--> statement-breakpoint
CREATE INDEX "technology_reference_category_idx" ON "technology_reference" USING btree ("category");--> statement-breakpoint
CREATE UNIQUE INDEX "user_roles_user_role_idx" ON "user_roles" USING btree ("user_id","role");--> statement-breakpoint
CREATE INDEX "user_roles_user_id_idx" ON "user_roles" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "users_email_idx" ON "users" USING btree ("email");--> statement-breakpoint
CREATE INDEX "users_username_idx" ON "users" USING btree ("username");--> statement-breakpoint
CREATE INDEX "verification_audit_entity_idx" ON "verification_audit_log" USING btree ("entity_type","entity_id");--> statement-breakpoint
CREATE INDEX "verification_audit_at_idx" ON "verification_audit_log" USING btree ("at");--> statement-breakpoint
CREATE INDEX "verification_campaigns_name_idx" ON "verification_campaigns" USING btree ("name");--> statement-breakpoint
CREATE INDEX "verification_contacts_campaign_idx" ON "verification_contacts" USING btree ("campaign_id");--> statement-breakpoint
CREATE INDEX "verification_contacts_eligibility_idx" ON "verification_contacts" USING btree ("eligibility_status");--> statement-breakpoint
CREATE INDEX "verification_contacts_suppressed_idx" ON "verification_contacts" USING btree ("suppressed");--> statement-breakpoint
CREATE INDEX "verification_contacts_deleted_idx" ON "verification_contacts" USING btree ("deleted");--> statement-breakpoint
CREATE INDEX "verification_contacts_norm_keys_idx" ON "verification_contacts" USING btree ("first_name_norm","last_name_norm","company_key","contact_country_key");--> statement-breakpoint
CREATE INDEX "verification_contacts_cav_id_idx" ON "verification_contacts" USING btree ("cav_id");--> statement-breakpoint
CREATE INDEX "verification_contacts_email_idx" ON "verification_contacts" USING btree ("email");--> statement-breakpoint
CREATE INDEX "verification_contacts_email_lower_idx" ON "verification_contacts" USING btree ("email_lower");--> statement-breakpoint
CREATE INDEX "verification_email_validation_jobs_campaign_idx" ON "verification_email_validation_jobs" USING btree ("campaign_id");--> statement-breakpoint
CREATE INDEX "verification_email_validation_jobs_status_idx" ON "verification_email_validation_jobs" USING btree ("status");--> statement-breakpoint
CREATE INDEX "verification_email_validation_jobs_created_at_idx" ON "verification_email_validation_jobs" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "verification_email_validations_cache_idx" ON "verification_email_validations" USING btree ("email_lower","checked_at");--> statement-breakpoint
CREATE INDEX "verification_submissions_campaign_account_idx" ON "verification_lead_submissions" USING btree ("campaign_id","account_id");--> statement-breakpoint
CREATE INDEX "verification_suppression_email_idx" ON "verification_suppression_list" USING btree ("email_lower");--> statement-breakpoint
CREATE INDEX "verification_suppression_cav_id_idx" ON "verification_suppression_list" USING btree ("cav_id");--> statement-breakpoint
CREATE INDEX "verification_suppression_campaign_idx" ON "verification_suppression_list" USING btree ("campaign_id");--> statement-breakpoint
CREATE INDEX "verification_upload_jobs_campaign_idx" ON "verification_upload_jobs" USING btree ("campaign_id");--> statement-breakpoint
CREATE INDEX "verification_upload_jobs_status_idx" ON "verification_upload_jobs" USING btree ("status");--> statement-breakpoint
CREATE INDEX "verification_upload_jobs_created_at_idx" ON "verification_upload_jobs" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "voicemail_assets_owner_idx" ON "voicemail_assets" USING btree ("owner_id");--> statement-breakpoint
CREATE INDEX "voicemail_assets_active_idx" ON "voicemail_assets" USING btree ("is_active");