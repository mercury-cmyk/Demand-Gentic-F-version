CREATE TYPE "public"."agent_plan_status" AS ENUM('pending', 'approved', 'executing', 'completed', 'rejected', 'cancelled', 'failed');--> statement-breakpoint
CREATE TYPE "public"."agent_prompt_type" AS ENUM('system', 'capability', 'restriction', 'persona', 'context');--> statement-breakpoint
CREATE TYPE "public"."client_feature_flag" AS ENUM('accounts_contacts', 'bulk_upload', 'campaign_creation', 'email_templates', 'call_flows', 'voice_selection', 'calendar_booking', 'analytics_dashboard', 'reports_export', 'api_access', 'organization_intelligence');--> statement-breakpoint
CREATE TYPE "public"."conversation_quality_status" AS ENUM('pending', 'analyzed', 'flagged', 'reviewed');--> statement-breakpoint
CREATE TYPE "public"."crm_action" AS ENUM('create_lead', 'send_to_review', 'push_to_crm', 'suppress', 'mark_dnc', 'schedule_callback', 'no_action');--> statement-breakpoint
CREATE TYPE "public"."generative_studio_content_status" AS ENUM('generating', 'generated', 'editing', 'previewing', 'published', 'failed');--> statement-breakpoint
CREATE TYPE "public"."intent_strength" AS ENUM('strong', 'moderate', 'weak', 'none', 'ambiguous');--> statement-breakpoint
CREATE TYPE "public"."lead_quality_status" AS ENUM('pending', 'analyzed', 'qualified', 'not_qualified', 'needs_review');--> statement-breakpoint
CREATE TYPE "public"."pipeline_account_stage" AS ENUM('unassigned', 'assigned', 'outreach', 'engaged', 'qualifying', 'qualified', 'disqualified', 'on_hold');--> statement-breakpoint
CREATE TYPE "public"."prompt_department" AS ENUM('sales', 'marketing', 'operations', 'ai_engineering', 'crm', 'compliance', 'intelligence', 'content');--> statement-breakpoint
CREATE TYPE "public"."prompt_dependency_direction" AS ENUM('produces', 'consumes');--> statement-breakpoint
CREATE TYPE "public"."prompt_dependency_entity_type" AS ENUM('service', 'route', 'script', 'agent');--> statement-breakpoint
CREATE TYPE "public"."prompt_function" AS ENUM('email_drafting', 'call_script', 'lead_scoring', 'enrichment', 'campaign_personalization', 'classification', 'summarization', 'reasoning', 'routing', 'research', 'content_generation', 'quality_analysis', 'disposition', 'mapping', 'simulation', 'image_generation');--> statement-breakpoint
CREATE TYPE "public"."prompt_purpose" AS ENUM('generation', 'classification', 'summarization', 'reasoning', 'scoring', 'routing', 'extraction', 'analysis', 'enrichment', 'personalization', 'compliance_check', 'orchestration');--> statement-breakpoint
CREATE TYPE "public"."prompt_status" AS ENUM('draft', 'live', 'archived', 'deprecated');--> statement-breakpoint
CREATE TYPE "public"."secret_environment" AS ENUM('development', 'production');--> statement-breakpoint
CREATE TYPE "public"."sip_transport" AS ENUM('udp', 'tcp', 'tls', 'wss');--> statement-breakpoint
CREATE TYPE "public"."telephony_provider_type" AS ENUM('telnyx', 'sip_trunk', 'twilio', 'bandwidth', 'custom');--> statement-breakpoint
CREATE TYPE "public"."work_order_priority" AS ENUM('low', 'normal', 'high', 'urgent');--> statement-breakpoint
CREATE TYPE "public"."work_order_status" AS ENUM('draft', 'submitted', 'under_review', 'approved', 'in_progress', 'qa_review', 'completed', 'on_hold', 'rejected', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."work_order_type" AS ENUM('call_campaign', 'email_campaign', 'combo_campaign', 'data_enrichment', 'lead_generation', 'appointment_setting', 'market_research', 'custom');--> statement-breakpoint
CREATE TYPE "public"."assignment_scope" AS ENUM('campaign', 'agent', 'region', 'global');--> statement-breakpoint
CREATE TYPE "public"."cooldown_reason" AS ENUM('consecutive_short_calls', 'zero_answer_rate', 'repeated_failures', 'audio_quality_issues', 'reputation_threshold', 'manual_admin', 'carrier_block_suspected');--> statement-breakpoint
CREATE TYPE "public"."number_reputation_band" AS ENUM('excellent', 'healthy', 'warning', 'risk', 'burned');--> statement-breakpoint
CREATE TYPE "public"."number_status" AS ENUM('active', 'cooling', 'suspended', 'retired');--> statement-breakpoint
ALTER TYPE "public"."activity_event_type" ADD VALUE 'disposition_needs_review';--> statement-breakpoint
ALTER TYPE "public"."activity_event_type" ADD VALUE 'lead_deleted';--> statement-breakpoint
ALTER TYPE "public"."activity_event_type" ADD VALUE 'lead_qa_status_changed';--> statement-breakpoint
ALTER TYPE "public"."activity_event_type" ADD VALUE 'contact_deleted';--> statement-breakpoint
ALTER TYPE "public"."activity_event_type" ADD VALUE 'campaign_deleted';--> statement-breakpoint
ALTER TYPE "public"."activity_event_type" ADD VALUE 'phone_bulk_update';--> statement-breakpoint
ALTER TYPE "public"."activity_event_type" ADD VALUE 'admin_delete_contacts';--> statement-breakpoint
ALTER TYPE "public"."activity_event_type" ADD VALUE 'admin_delete_accounts';--> statement-breakpoint
ALTER TYPE "public"."activity_event_type" ADD VALUE 'admin_delete_leads';--> statement-breakpoint
ALTER TYPE "public"."activity_event_type" ADD VALUE 'admin_delete_all_data';--> statement-breakpoint
ALTER TYPE "public"."canonical_disposition" ADD VALUE 'callback_requested';--> statement-breakpoint
ALTER TYPE "public"."client_project_status" ADD VALUE 'rejected';--> statement-breakpoint
ALTER TYPE "public"."content_asset_type" ADD VALUE 'ebook';--> statement-breakpoint
ALTER TYPE "public"."content_asset_type" ADD VALUE 'solution_brief';--> statement-breakpoint
ALTER TYPE "public"."demand_agent_type" ADD VALUE 'demand_architect';--> statement-breakpoint
ALTER TYPE "public"."iam_entity_type" ADD VALUE 'secret';--> statement-breakpoint
ALTER TYPE "public"."qa_status" ADD VALUE 'pending_pm_review' BEFORE 'published';--> statement-breakpoint
ALTER TYPE "public"."user_role" ADD VALUE 'data_ops';--> statement-breakpoint
CREATE TABLE "ae_assignment_batches" (
	"id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" varchar(36),
	"pipeline_id" varchar(36) NOT NULL,
	"assigned_by" varchar(36) NOT NULL,
	"assigned_at" timestamp with time zone DEFAULT now() NOT NULL,
	"assignment_method" varchar(50) NOT NULL,
	"account_count" integer NOT NULL,
	"ae_assignments" jsonb NOT NULL,
	"ai_assisted" boolean DEFAULT false NOT NULL,
	"ai_reasoning_summary" text,
	"notes" text
);
--> statement-breakpoint
CREATE TABLE "agent_conversations" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" varchar,
	"client_user_id" varchar,
	"session_id" varchar NOT NULL,
	"title" text,
	"messages" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"context" jsonb,
	"is_active" boolean DEFAULT true NOT NULL,
	"is_pinned" boolean DEFAULT false NOT NULL,
	"last_message_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "agent_execution_plans" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"conversation_id" varchar,
	"user_id" varchar,
	"client_user_id" varchar,
	"request_message" text NOT NULL,
	"planned_steps" jsonb NOT NULL,
	"risk_level" text DEFAULT 'low' NOT NULL,
	"affected_entities" jsonb,
	"status" "agent_plan_status" DEFAULT 'pending' NOT NULL,
	"executed_steps" jsonb DEFAULT '[]'::jsonb,
	"user_modifications" jsonb,
	"approved_by" varchar,
	"approved_at" timestamp,
	"rejection_reason" text,
	"execution_started_at" timestamp,
	"execution_completed_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "agent_prompt_history" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"agent_prompt_id" varchar NOT NULL,
	"previous_content" text NOT NULL,
	"previous_capabilities" jsonb,
	"previous_restrictions" jsonb,
	"change_reason" text,
	"version" integer NOT NULL,
	"changed_by" varchar,
	"changed_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "agent_prompts" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"user_role" "user_role",
	"iam_role_id" varchar,
	"is_client_portal" boolean DEFAULT false NOT NULL,
	"prompt_type" "agent_prompt_type" DEFAULT 'system' NOT NULL,
	"prompt_content" text NOT NULL,
	"capabilities" jsonb,
	"restrictions" jsonb,
	"context_rules" jsonb,
	"is_active" boolean DEFAULT true NOT NULL,
	"priority" integer DEFAULT 0 NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"created_by" varchar,
	"updated_by" varchar,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "agentic_campaign_sessions" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"intake_request_id" varchar,
	"current_step" text DEFAULT 'context',
	"completed_steps" jsonb,
	"conversation_history" jsonb,
	"approvals" jsonb,
	"context_config" jsonb,
	"audience_config" jsonb,
	"voice_config" jsonb,
	"phone_config" jsonb,
	"content_config" jsonb,
	"review_config" jsonb,
	"created_by" varchar,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "availability_slots" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" varchar,
	"day_of_week" integer NOT NULL,
	"start_time" text NOT NULL,
	"end_time" text NOT NULL,
	"timezone" text DEFAULT 'UTC',
	"is_active" boolean DEFAULT true
);
--> statement-breakpoint
CREATE TABLE "booking_types" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" varchar,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"description" text,
	"duration" integer NOT NULL,
	"is_active" boolean DEFAULT true,
	"color" text DEFAULT '#3b82f6',
	"requires_approval" boolean DEFAULT false,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "bookings" (
	"id" serial PRIMARY KEY NOT NULL,
	"booking_type_id" integer,
	"host_user_id" varchar,
	"guest_name" text NOT NULL,
	"guest_email" text NOT NULL,
	"guest_notes" text,
	"start_time" timestamp NOT NULL,
	"end_time" timestamp NOT NULL,
	"status" text DEFAULT 'confirmed',
	"google_event_id" text,
	"meeting_url" text,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "campaign_intake_requests" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"source_type" text,
	"client_account_id" varchar,
	"client_order_id" varchar,
	"agentic_session_id" varchar,
	"raw_input" jsonb,
	"extracted_context" jsonb,
	"context_sources" jsonb,
	"status" text DEFAULT 'pending',
	"priority" text DEFAULT 'normal',
	"assigned_pm_id" varchar,
	"assigned_at" timestamp,
	"qso_reviewed_by_id" varchar,
	"qso_reviewed_at" timestamp,
	"qso_notes" text,
	"approved_by_id" varchar,
	"approved_at" timestamp,
	"rejection_reason" text,
	"campaign_id" varchar,
	"project_id" varchar,
	"requested_start_date" timestamp,
	"requested_lead_count" integer,
	"estimated_cost" numeric,
	"requested_channels" jsonb,
	"campaign_type" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "client_bulk_imports" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"client_account_id" varchar NOT NULL,
	"import_type" text NOT NULL,
	"file_name" text,
	"file_url" text,
	"status" text DEFAULT 'pending' NOT NULL,
	"total_rows" integer DEFAULT 0,
	"processed_rows" integer DEFAULT 0,
	"success_count" integer DEFAULT 0,
	"error_count" integer DEFAULT 0,
	"duplicate_count" integer DEFAULT 0,
	"column_mapping" jsonb,
	"errors" jsonb,
	"campaign_id" varchar,
	"uploaded_by" varchar,
	"started_at" timestamp,
	"completed_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "client_business_profiles" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"client_account_id" varchar NOT NULL,
	"legal_business_name" text,
	"dba_name" text,
	"address_line1" text,
	"address_line2" text,
	"city" text,
	"state" text,
	"postal_code" text,
	"country" text DEFAULT 'United States' NOT NULL,
	"custom_unsubscribe_url" text,
	"website" text,
	"phone" text,
	"support_email" text,
	"logo_url" text,
	"brand_color" varchar(7),
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"updated_by" varchar,
	CONSTRAINT "client_business_profiles_client_account_id_unique" UNIQUE("client_account_id")
);
--> statement-breakpoint
CREATE TABLE "client_call_flows" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"client_account_id" varchar NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"greeting" text,
	"qualification_questions" jsonb,
	"objection_handling" jsonb,
	"closing_script" text,
	"appointment_script" text,
	"voice_id" text,
	"voice_name" text,
	"speaking_rate" numeric(3, 2) DEFAULT '1.0',
	"is_active" boolean DEFAULT true,
	"is_default" boolean DEFAULT false,
	"created_by" varchar,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "client_campaign_contacts" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"campaign_id" varchar NOT NULL,
	"contact_id" varchar NOT NULL,
	"status" text DEFAULT 'pending',
	"last_contacted_at" timestamp,
	"response_at" timestamp,
	"conversion_at" timestamp,
	"notes" text,
	"added_at" timestamp DEFAULT now() NOT NULL,
	"added_by" varchar
);
--> statement-breakpoint
CREATE TABLE "client_campaign_pricing" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"client_account_id" varchar NOT NULL,
	"campaign_type" varchar(100) NOT NULL,
	"price_per_lead" numeric(10, 2) NOT NULL,
	"minimum_order_size" integer DEFAULT 100,
	"volume_discounts" jsonb DEFAULT '[]',
	"is_enabled" boolean DEFAULT true,
	"notes" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "client_campaign_pricing_client_account_id_campaign_type_unique" UNIQUE("client_account_id","campaign_type")
);
--> statement-breakpoint
CREATE TABLE "client_campaigns" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"client_account_id" varchar NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"campaign_type" text NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"objectives" text,
	"key_talking_points" jsonb,
	"target_audience" text,
	"call_flow_id" varchar,
	"voice_id" text,
	"voice_name" text,
	"default_email_template_id" varchar,
	"sender_name" text,
	"sender_email" text,
	"booking_enabled" boolean DEFAULT false,
	"booking_url" text,
	"calendar_integration" text,
	"start_date" date,
	"end_date" date,
	"total_contacts" integer DEFAULT 0,
	"contacts_reached" integer DEFAULT 0,
	"appointments_booked" integer DEFAULT 0,
	"created_by" varchar,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "client_crm_accounts" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"client_account_id" varchar NOT NULL,
	"name" text NOT NULL,
	"domain" text,
	"industry" text,
	"employees" text,
	"annual_revenue" text,
	"city" text,
	"state" text,
	"country" text,
	"phone" text,
	"website" text,
	"account_type" text,
	"status" text DEFAULT 'active',
	"custom_fields" jsonb,
	"source" text,
	"source_id" varchar,
	"created_by" varchar,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "client_crm_contacts" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"client_account_id" varchar NOT NULL,
	"crm_account_id" varchar,
	"first_name" text,
	"last_name" text,
	"email" text,
	"phone" text,
	"mobile" text,
	"title" text,
	"department" text,
	"linkedin_url" text,
	"company" text,
	"status" text DEFAULT 'active',
	"email_opt_out" boolean DEFAULT false,
	"phone_opt_out" boolean DEFAULT false,
	"opt_out_date" timestamp,
	"custom_fields" jsonb,
	"source" text,
	"source_id" varchar,
	"created_by" varchar,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "client_email_templates" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"client_account_id" varchar NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"category" text,
	"subject" text NOT NULL,
	"body_html" text NOT NULL,
	"body_text" text,
	"merge_fields" jsonb,
	"is_active" boolean DEFAULT true,
	"is_default" boolean DEFAULT false,
	"times_used" integer DEFAULT 0,
	"created_by" varchar,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "client_feature_access" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"client_account_id" varchar NOT NULL,
	"feature" "client_feature_flag" NOT NULL,
	"is_enabled" boolean DEFAULT true NOT NULL,
	"config" jsonb,
	"enabled_by" varchar,
	"enabled_at" timestamp DEFAULT now() NOT NULL,
	"disabled_by" varchar,
	"disabled_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "client_pricing_documents" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"client_account_id" varchar NOT NULL,
	"name" varchar(255) NOT NULL,
	"description" text,
	"file_key" varchar(500) NOT NULL,
	"file_name" varchar(255) NOT NULL,
	"file_type" varchar(100) NOT NULL,
	"file_size" integer,
	"uploaded_by" varchar(255),
	"is_active" boolean DEFAULT true,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "conversation_quality_assessments" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"call_session_id" varchar NOT NULL,
	"dialer_call_attempt_id" varchar,
	"campaign_id" varchar,
	"contact_id" varchar,
	"tenant_id" varchar,
	"status" "conversation_quality_status" DEFAULT 'pending',
	"conversation_quality_score" integer,
	"technical_integrity_score" integer,
	"compliance_score" integer,
	"behavioral_score" integer,
	"tone_score" integer,
	"naturalness_score" integer,
	"confidence_score" integer,
	"opening_protocol_score" integer,
	"robotic_repetition_flag" boolean DEFAULT false,
	"script_adherence_score" integer,
	"gatekeeper_protocol_score" integer,
	"objection_handling_logic_score" integer,
	"unauthorized_improvisation_flag" boolean DEFAULT false,
	"voicemail_detection_accurate" boolean,
	"silence_detection_accurate" boolean,
	"transfer_handling_correct" boolean,
	"directory_navigation_correct" boolean,
	"interruption_handling_correct" boolean,
	"technical_issues" jsonb,
	"disposition_correct" boolean,
	"dnc_triggered_correctly" boolean,
	"callback_handled_correctly" boolean,
	"state_logic_respected" boolean,
	"behavioral_assessment" jsonb,
	"issue_flags" jsonb,
	"transcript_annotations" jsonb,
	"summary" text,
	"analysis_model" text,
	"analyzed_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "custom_call_flow_mappings" (
	"campaign_type" text PRIMARY KEY NOT NULL,
	"call_flow_id" text NOT NULL,
	"updated_by" varchar,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "custom_call_flows" (
	"id" varchar PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"objective" text NOT NULL,
	"success_criteria" text NOT NULL,
	"max_total_turns" integer DEFAULT 20 NOT NULL,
	"steps" jsonb DEFAULT '[]'::jsonb,
	"version" integer DEFAULT 1 NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_by" varchar,
	"updated_by" varchar,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "external_events" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"client_id" varchar NOT NULL,
	"source_provider" varchar DEFAULT 'argyle' NOT NULL,
	"external_id" varchar NOT NULL,
	"source_url" text NOT NULL,
	"source_hash" varchar,
	"title" text NOT NULL,
	"community" varchar,
	"event_type" varchar,
	"location" text,
	"start_at_iso" timestamp with time zone,
	"start_at_human" varchar,
	"needs_date_review" boolean DEFAULT false,
	"overview_excerpt" text,
	"agenda_excerpt" text,
	"speakers_excerpt" text,
	"last_synced_at" timestamp with time zone DEFAULT now() NOT NULL,
	"sync_status" varchar DEFAULT 'synced',
	"sync_error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "external_events_unique_key" UNIQUE("client_id","source_provider","external_id")
);
--> statement-breakpoint
CREATE TABLE "generative_studio_chat_messages" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"session_id" varchar NOT NULL,
	"role" text NOT NULL,
	"content" text NOT NULL,
	"project_id" varchar,
	"model" text,
	"tokens_used" integer,
	"owner_id" varchar NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "generative_studio_projects" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"title" text NOT NULL,
	"content_type" "content_asset_type" NOT NULL,
	"status" "generative_studio_content_status" DEFAULT 'generating' NOT NULL,
	"prompt" text NOT NULL,
	"target_audience" text,
	"industry" text,
	"tone" "content_tone",
	"brand_kit_id" varchar,
	"additional_context" text,
	"generation_params" jsonb,
	"generated_content" text,
	"generated_content_html" text,
	"variants" jsonb,
	"metadata" jsonb,
	"content_asset_id" varchar,
	"exported_file_url" text,
	"thumbnail_url" text,
	"ai_model" text,
	"tokens_used" integer,
	"generation_duration_ms" integer,
	"owner_id" varchar NOT NULL,
	"tenant_id" varchar,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "generative_studio_published_pages" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" varchar NOT NULL,
	"content_type" "content_asset_type" NOT NULL,
	"title" text NOT NULL,
	"slug" text NOT NULL,
	"html_content" text NOT NULL,
	"css_content" text,
	"meta_title" text,
	"meta_description" text,
	"og_image_url" text,
	"is_published" boolean DEFAULT false NOT NULL,
	"published_at" timestamp,
	"unpublished_at" timestamp,
	"view_count" integer DEFAULT 0 NOT NULL,
	"owner_id" varchar NOT NULL,
	"tenant_id" varchar,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "google_calendar_integrations" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" varchar,
	"access_token" text,
	"refresh_token" text,
	"token_expiry" timestamp,
	"calendar_id" text DEFAULT 'primary',
	"is_active" boolean DEFAULT true,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now(),
	CONSTRAINT "google_calendar_integrations_user_id_unique" UNIQUE("user_id")
);
--> statement-breakpoint
CREATE TABLE "lead_quality_assessments" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"call_session_id" varchar NOT NULL,
	"dialer_call_attempt_id" varchar,
	"campaign_id" varchar,
	"contact_id" varchar,
	"lead_id" varchar,
	"tenant_id" varchar,
	"status" "lead_quality_status" DEFAULT 'pending',
	"lead_qualification_score" integer,
	"campaign_fit_score" integer,
	"intent_strength" "intent_strength",
	"prospect_interested" boolean,
	"explicit_buying_intent" boolean,
	"implicit_buying_intent" boolean,
	"interest_misinterpreted" boolean,
	"interest_evidence" jsonb,
	"job_title_alignment" integer,
	"industry_alignment" integer,
	"company_size_fit" integer,
	"budget_indicators" integer,
	"authority_level" integer,
	"timeline_signals" integer,
	"pain_point_alignment" integer,
	"qualification_criteria" jsonb,
	"outcome_category" text,
	"disposition_accurate" boolean,
	"suggested_disposition" text,
	"disposition_confidence" numeric(3, 2),
	"recommended_crm_action" "crm_action",
	"should_create_lead" boolean,
	"should_send_to_review" boolean,
	"should_push_to_crm" boolean,
	"should_suppress" boolean,
	"should_mark_dnc" boolean,
	"qualification_report" jsonb,
	"campaign_alignment_notes" jsonb,
	"routing_rationale" text,
	"summary" text,
	"analysis_model" text,
	"analyzed_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "mercury_email_outbox" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"template_key" varchar NOT NULL,
	"recipient_email" text NOT NULL,
	"recipient_name" text,
	"recipient_user_id" varchar,
	"recipient_user_type" varchar DEFAULT 'client',
	"tenant_id" varchar,
	"subject" text NOT NULL,
	"html_body" text NOT NULL,
	"text_body" text,
	"from_email" text DEFAULT 'mercury@pivotal-b2b.com' NOT NULL,
	"from_name" text DEFAULT 'Pivotal B2B' NOT NULL,
	"status" varchar DEFAULT 'queued' NOT NULL,
	"message_id" varchar,
	"error_message" text,
	"retry_count" integer DEFAULT 0 NOT NULL,
	"max_retries" integer DEFAULT 3 NOT NULL,
	"idempotency_key" varchar,
	"metadata" jsonb,
	"scheduled_at" timestamp with time zone,
	"sent_at" timestamp with time zone,
	"failed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "mercury_email_outbox_idempotency_key_unique" UNIQUE("idempotency_key")
);
--> statement-breakpoint
CREATE TABLE "mercury_invitation_tokens" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"client_user_id" varchar NOT NULL,
	"client_account_id" varchar NOT NULL,
	"token" varchar NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"used_at" timestamp with time zone,
	"email_outbox_id" varchar,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "mercury_invitation_tokens_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "mercury_notification_events" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"event_type" varchar NOT NULL,
	"tenant_id" varchar,
	"actor_user_id" varchar,
	"payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"processed_at" timestamp with time zone,
	"error_message" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "mercury_notification_preferences" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" varchar NOT NULL,
	"user_type" varchar DEFAULT 'client' NOT NULL,
	"notification_type" varchar NOT NULL,
	"channel_type" varchar DEFAULT 'email' NOT NULL,
	"is_enabled" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "mercury_notification_rules" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"event_type" varchar NOT NULL,
	"template_key" varchar NOT NULL,
	"channel_type" varchar DEFAULT 'email' NOT NULL,
	"recipient_resolver" varchar NOT NULL,
	"custom_recipients" jsonb,
	"is_enabled" boolean DEFAULT true NOT NULL,
	"description" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "mercury_templates" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"template_key" varchar NOT NULL,
	"name" varchar NOT NULL,
	"description" text,
	"subject_template" text NOT NULL,
	"html_template" text NOT NULL,
	"text_template" text,
	"variables" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"is_enabled" boolean DEFAULT true NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"category" varchar DEFAULT 'notification',
	"created_by" varchar,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "mercury_templates_template_key_unique" UNIQUE("template_key")
);
--> statement-breakpoint
CREATE TABLE "password_reset_tokens" (
	"id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"token" varchar(64) NOT NULL,
	"user_id" varchar(36),
	"client_user_id" varchar(36),
	"email" text NOT NULL,
	"user_type" text DEFAULT 'internal' NOT NULL,
	"expires_at" timestamp NOT NULL,
	"used_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "password_reset_tokens_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "pipeline_accounts" (
	"id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" varchar(36),
	"pipeline_id" varchar(36) NOT NULL,
	"account_id" varchar(36) NOT NULL,
	"assigned_ae_id" varchar(36),
	"assigned_at" timestamp with time zone,
	"assigned_by" varchar(36),
	"journey_stage" "pipeline_account_stage" DEFAULT 'unassigned' NOT NULL,
	"stage_changed_at" timestamp with time zone,
	"priority_score" integer DEFAULT 0,
	"readiness_score" integer DEFAULT 0,
	"ai_recommendation" text,
	"ai_recommended_ae_id" varchar(36),
	"ai_recommendation_reason" text,
	"qualification_notes" text,
	"disqualification_reason" text,
	"last_activity_at" timestamp with time zone,
	"touchpoint_count" integer DEFAULT 0,
	"converted_opportunity_id" varchar(36),
	"converted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "prompt_dependency_map" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"prompt_id" varchar NOT NULL,
	"entity_type" "prompt_dependency_entity_type" NOT NULL,
	"entity_name" text NOT NULL,
	"endpoint_path" text,
	"http_method" text,
	"service_function" text,
	"direction" "prompt_dependency_direction" NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "secret_store" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"environment" "secret_environment" DEFAULT 'development' NOT NULL,
	"service" text NOT NULL,
	"usage_context" text NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb,
	"encrypted_value" text NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"last_rotated_at" timestamp,
	"rotated_by" varchar,
	"deactivated_at" timestamp,
	"deactivated_by" varchar,
	"organization_id" varchar,
	"created_by" varchar,
	"updated_by" varchar,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "telephony_provider_health_history" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"provider_id" varchar NOT NULL,
	"healthy" boolean NOT NULL,
	"latency_ms" integer,
	"error_count" integer DEFAULT 0,
	"last_error" text,
	"active_call_count" integer DEFAULT 0,
	"checked_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "telephony_providers" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"type" "telephony_provider_type" NOT NULL,
	"enabled" boolean DEFAULT false NOT NULL,
	"priority" integer DEFAULT 100 NOT NULL,
	"api_key" text,
	"api_secret" text,
	"sip_domain" text,
	"sip_username" text,
	"sip_password" text,
	"sip_proxy" text,
	"sip_port" integer DEFAULT 5060,
	"sip_transport" "sip_transport" DEFAULT 'udp',
	"connection_id" text,
	"outbound_profile_id" text,
	"outbound_numbers" jsonb,
	"allowed_destinations" jsonb,
	"blocked_destinations" jsonb,
	"max_cps" integer DEFAULT 10,
	"max_concurrent" integer DEFAULT 100,
	"failover_provider_id" varchar,
	"health_check_interval" integer DEFAULT 60,
	"cost_per_minute" real,
	"cost_per_call" real,
	"currency" varchar(3) DEFAULT 'USD',
	"provider_metadata" jsonb,
	"created_by_id" varchar,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "work_order_drafts" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"client_account_id" varchar NOT NULL,
	"client_user_id" varchar,
	"external_event_id" varchar,
	"status" varchar DEFAULT 'draft' NOT NULL,
	"source_fields" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"draft_fields" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"edited_fields" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"lead_count" integer,
	"work_order_id" varchar,
	"submitted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "work_orders" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"order_number" text NOT NULL,
	"client_account_id" varchar NOT NULL,
	"client_user_id" varchar,
	"title" text NOT NULL,
	"description" text,
	"order_type" "work_order_type" DEFAULT 'lead_generation' NOT NULL,
	"priority" "work_order_priority" DEFAULT 'normal' NOT NULL,
	"status" "work_order_status" DEFAULT 'draft' NOT NULL,
	"target_industries" text[],
	"target_titles" text[],
	"target_company_size" text,
	"target_regions" text[],
	"target_account_count" integer,
	"target_lead_count" integer,
	"requested_start_date" date,
	"requested_end_date" date,
	"actual_start_date" date,
	"actual_end_date" date,
	"estimated_budget" numeric(12, 2),
	"approved_budget" numeric(12, 2),
	"actual_spend" numeric(12, 2) DEFAULT '0',
	"client_notes" text,
	"special_requirements" text,
	"campaign_config" jsonb,
	"organization_context" text,
	"project_id" varchar,
	"campaign_id" varchar,
	"assigned_to" varchar,
	"admin_notes" text,
	"internal_priority" integer,
	"reviewed_by" varchar,
	"reviewed_at" timestamp,
	"approved_by" varchar,
	"approved_at" timestamp,
	"rejected_by" varchar,
	"rejected_at" timestamp,
	"rejection_reason" text,
	"progress_percent" integer DEFAULT 0,
	"leads_generated" integer DEFAULT 0,
	"leads_delivered" integer DEFAULT 0,
	"qa_status" text,
	"qa_reviewed_by" varchar,
	"qa_reviewed_at" timestamp,
	"qa_notes" text,
	"submitted_at" timestamp,
	"completed_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "work_orders_order_number_unique" UNIQUE("order_number")
);
--> statement-breakpoint
CREATE TABLE "number_assignments" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"number_id" varchar NOT NULL,
	"scope" "assignment_scope" DEFAULT 'global' NOT NULL,
	"campaign_id" varchar,
	"virtual_agent_id" varchar,
	"region" text,
	"priority" integer DEFAULT 0 NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"valid_from" timestamp,
	"valid_until" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"created_by" varchar
);
--> statement-breakpoint
CREATE TABLE "number_cooldowns" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"number_id" varchar NOT NULL,
	"started_at" timestamp DEFAULT now() NOT NULL,
	"ends_at" timestamp NOT NULL,
	"ended_early_at" timestamp,
	"reason" "cooldown_reason" NOT NULL,
	"reason_details" jsonb,
	"recovery_max_calls_per_hour" integer,
	"recovery_max_calls_per_day" integer,
	"recovery_duration_hours" integer DEFAULT 24,
	"triggered_by" varchar,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "number_metrics_daily" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"number_id" varchar NOT NULL,
	"metric_date" date NOT NULL,
	"total_calls" integer DEFAULT 0,
	"answered_calls" integer DEFAULT 0,
	"no_answer_calls" integer DEFAULT 0,
	"voicemail_calls" integer DEFAULT 0,
	"busy_calls" integer DEFAULT 0,
	"failed_calls" integer DEFAULT 0,
	"short_calls" integer DEFAULT 0,
	"immediate_hangups" integer DEFAULT 0,
	"avg_duration_sec" numeric(10, 2) DEFAULT '0',
	"max_duration_sec" integer DEFAULT 0,
	"qualified_calls" integer DEFAULT 0,
	"callbacks_scheduled" integer DEFAULT 0,
	"peak_hour" integer,
	"peak_hour_calls" integer DEFAULT 0,
	"total_cost_cents" integer DEFAULT 0,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "number_metrics_window" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"number_id" varchar NOT NULL,
	"call_session_id" varchar,
	"dialer_attempt_id" varchar,
	"called_at" timestamp NOT NULL,
	"answered" boolean DEFAULT false,
	"duration_sec" integer DEFAULT 0,
	"disposition" text,
	"is_short_call" boolean DEFAULT false,
	"is_immediate_hangup" boolean DEFAULT false,
	"is_voicemail" boolean DEFAULT false,
	"is_failed" boolean DEFAULT false,
	"failure_reason" text,
	"prospect_number_e164" text,
	"campaign_id" varchar,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "number_pool_alerts" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"alert_type" text NOT NULL,
	"severity" text DEFAULT 'warning' NOT NULL,
	"number_id" varchar,
	"campaign_id" varchar,
	"title" text NOT NULL,
	"description" text,
	"details" jsonb,
	"is_acknowledged" boolean DEFAULT false,
	"acknowledged_by" varchar,
	"acknowledged_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "number_reputation" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"number_id" varchar NOT NULL,
	"score" integer DEFAULT 70 NOT NULL,
	"band" "number_reputation_band" DEFAULT 'healthy' NOT NULL,
	"answer_rate_score" integer DEFAULT 50,
	"duration_score" integer DEFAULT 50,
	"short_call_score" integer DEFAULT 50,
	"hangup_score" integer DEFAULT 50,
	"voicemail_score" integer DEFAULT 50,
	"failure_score" integer DEFAULT 50,
	"total_calls" integer DEFAULT 0,
	"answered_calls" integer DEFAULT 0,
	"short_calls" integer DEFAULT 0,
	"immediate_hangups" integer DEFAULT 0,
	"voicemail_calls" integer DEFAULT 0,
	"failed_calls" integer DEFAULT 0,
	"avg_duration_sec" numeric(10, 2) DEFAULT '0',
	"score_trend" text DEFAULT 'stable',
	"last_score_change" integer DEFAULT 0,
	"last_calculated_at" timestamp DEFAULT NOW(),
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "number_reputation_number_id_unique" UNIQUE("number_id")
);
--> statement-breakpoint
CREATE TABLE "number_routing_decisions" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"call_session_id" varchar,
	"dialer_attempt_id" varchar,
	"campaign_id" varchar,
	"virtual_agent_id" varchar,
	"prospect_number_e164" text,
	"prospect_area_code" varchar(10),
	"prospect_region" text,
	"selected_number_id" varchar,
	"selected_number_e164" text,
	"selection_reason" text,
	"candidates_count" integer DEFAULT 0,
	"candidates_filtered_out" jsonb,
	"routing_latency_ms" integer,
	"jitter_delay_ms" integer,
	"decided_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "prospect_call_suppression" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"prospect_number_e164" text NOT NULL,
	"last_called_at" timestamp NOT NULL,
	"last_disposition" text,
	"last_number_id" varchar,
	"suppress_until" timestamp,
	"suppress_reason" text,
	"call_attempts_24h" integer DEFAULT 1,
	"call_attempts_7d" integer DEFAULT 1,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "prospect_call_suppression_prospect_number_e164_unique" UNIQUE("prospect_number_e164")
);
--> statement-breakpoint
CREATE TABLE "telnyx_numbers" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"phone_number_e164" text NOT NULL,
	"telnyx_number_id" text,
	"telnyx_connection_id" text,
	"telnyx_messaging_profile_id" text,
	"display_name" text,
	"cnam" text,
	"country_code" varchar(2) DEFAULT 'US' NOT NULL,
	"region" text,
	"city" text,
	"area_code" varchar(10),
	"timezone" text,
	"status" "number_status" DEFAULT 'active' NOT NULL,
	"status_reason" text,
	"status_changed_at" timestamp,
	"tags" text[] DEFAULT '{}'::text[],
	"max_calls_per_hour" integer DEFAULT 40,
	"max_calls_per_day" integer DEFAULT 500,
	"max_concurrent_calls" integer DEFAULT 1,
	"last_call_at" timestamp,
	"last_answered_at" timestamp,
	"calls_today" integer DEFAULT 0,
	"calls_this_hour" integer DEFAULT 0,
	"monthly_cost_cents" integer,
	"acquired_at" timestamp DEFAULT NOW(),
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "telnyx_numbers_phone_number_e164_unique" UNIQUE("phone_number_e164")
);
--> statement-breakpoint
ALTER TABLE "campaign_orders" ALTER COLUMN "type" SET DATA TYPE text;--> statement-breakpoint
ALTER TABLE "campaigns" ALTER COLUMN "type" SET DATA TYPE text;--> statement-breakpoint
DROP TYPE "public"."campaign_type";--> statement-breakpoint
CREATE TYPE "public"."campaign_type" AS ENUM('email', 'call', 'combo', 'webinar_invite', 'live_webinar', 'on_demand_webinar', 'executive_dinner', 'leadership_forum', 'conference', 'event_registration_digital_ungated', 'event_registration_digital_gated', 'in_person_event', 'content_syndication', 'high_quality_leads', 'sql', 'bant_qualification', 'bant_leads', 'lead_qualification', 'appointment_setting', 'appointment_generation', 'demo_request', 'data_validation', 'follow_up', 'nurture', 're_engagement');--> statement-breakpoint
ALTER TABLE "campaign_orders" ALTER COLUMN "type" SET DATA TYPE "public"."campaign_type" USING "type"::"public"."campaign_type";--> statement-breakpoint
ALTER TABLE "campaigns" ALTER COLUMN "type" SET DATA TYPE "public"."campaign_type" USING "type"::"public"."campaign_type";--> statement-breakpoint
ALTER TABLE "campaigns" ALTER COLUMN "max_call_duration_seconds" SET DEFAULT 360;--> statement-breakpoint
ALTER TABLE "client_portal_orders" ALTER COLUMN "campaign_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "agent_defaults" ADD COLUMN "default_max_concurrent_calls" integer DEFAULT 100 NOT NULL;--> statement-breakpoint
ALTER TABLE "agent_defaults" ADD COLUMN "global_max_concurrent_calls" integer DEFAULT 100 NOT NULL;--> statement-breakpoint
ALTER TABLE "agent_queue" ADD COLUMN "ai_priority_score" integer;--> statement-breakpoint
ALTER TABLE "agent_queue" ADD COLUMN "ai_scored_at" timestamp;--> statement-breakpoint
ALTER TABLE "agent_queue" ADD COLUMN "ai_score_breakdown" jsonb;--> statement-breakpoint
ALTER TABLE "call_quality_records" ADD COLUMN "is_showcase" boolean DEFAULT false;--> statement-breakpoint
ALTER TABLE "call_quality_records" ADD COLUMN "showcase_category" text;--> statement-breakpoint
ALTER TABLE "call_quality_records" ADD COLUMN "showcase_notes" text;--> statement-breakpoint
ALTER TABLE "call_quality_records" ADD COLUMN "showcased_at" timestamp;--> statement-breakpoint
ALTER TABLE "call_quality_records" ADD COLUMN "showcased_by" varchar;--> statement-breakpoint
ALTER TABLE "call_sessions" ADD COLUMN "telnyx_recording_id" text;--> statement-breakpoint
ALTER TABLE "call_sessions" ADD COLUMN "recording_provider" text DEFAULT 'telnyx';--> statement-breakpoint
ALTER TABLE "campaign_organizations" ADD COLUMN "branding" jsonb DEFAULT '{}' NOT NULL;--> statement-breakpoint
ALTER TABLE "campaign_organizations" ADD COLUMN "events" jsonb DEFAULT '{}' NOT NULL;--> statement-breakpoint
ALTER TABLE "campaign_organizations" ADD COLUMN "forums" jsonb DEFAULT '{}' NOT NULL;--> statement-breakpoint
ALTER TABLE "campaign_queue" ADD COLUMN "ai_priority_score" integer;--> statement-breakpoint
ALTER TABLE "campaign_queue" ADD COLUMN "ai_scored_at" timestamp;--> statement-breakpoint
ALTER TABLE "campaign_queue" ADD COLUMN "ai_score_breakdown" jsonb;--> statement-breakpoint
ALTER TABLE "campaigns" ADD COLUMN "max_concurrent_workers" integer DEFAULT 1;--> statement-breakpoint
ALTER TABLE "campaigns" ADD COLUMN "assigned_voices" jsonb;--> statement-breakpoint
ALTER TABLE "campaigns" ADD COLUMN "landing_page_url" text;--> statement-breakpoint
ALTER TABLE "campaigns" ADD COLUMN "project_file_url" text;--> statement-breakpoint
ALTER TABLE "campaigns" ADD COLUMN "intake_request_id" varchar;--> statement-breakpoint
ALTER TABLE "campaigns" ADD COLUMN "creation_mode" text;--> statement-breakpoint
ALTER TABLE "campaigns" ADD COLUMN "caller_phone_number_id" varchar;--> statement-breakpoint
ALTER TABLE "campaigns" ADD COLUMN "caller_phone_number" text;--> statement-breakpoint
ALTER TABLE "campaigns" ADD COLUMN "number_pool_config" jsonb;--> statement-breakpoint
ALTER TABLE "campaigns" ADD COLUMN "last_stall_reason" text;--> statement-breakpoint
ALTER TABLE "campaigns" ADD COLUMN "last_stall_reason_at" timestamp;--> statement-breakpoint
ALTER TABLE "client_accounts" ADD COLUMN "profile" jsonb DEFAULT '{}'::jsonb;--> statement-breakpoint
ALTER TABLE "client_accounts" ADD COLUMN "settings" jsonb DEFAULT '{}'::jsonb;--> statement-breakpoint
ALTER TABLE "client_billing_config" ADD COLUMN "payment_due_day_of_month" integer;--> statement-breakpoint
ALTER TABLE "client_portal_orders" ADD COLUMN "metadata" jsonb;--> statement-breakpoint
ALTER TABLE "client_projects" ADD COLUMN "intake_request_id" varchar;--> statement-breakpoint
ALTER TABLE "client_projects" ADD COLUMN "enabled_features" jsonb DEFAULT '{"emailCampaignTest":false,"campaignQueueView":false,"previewStudio":false,"campaignCallTest":false,"voiceSelection":false}'::jsonb;--> statement-breakpoint
ALTER TABLE "client_projects" ADD COLUMN "approval_notes" text;--> statement-breakpoint
ALTER TABLE "client_projects" ADD COLUMN "approved_by" varchar;--> statement-breakpoint
ALTER TABLE "client_projects" ADD COLUMN "approved_at" timestamp;--> statement-breakpoint
ALTER TABLE "client_projects" ADD COLUMN "rejection_reason" text;--> statement-breakpoint
ALTER TABLE "client_projects" ADD COLUMN "external_event_id" varchar;--> statement-breakpoint
ALTER TABLE "dialer_call_attempts" ADD COLUMN "telnyx_recording_id" text;--> statement-breakpoint
ALTER TABLE "dialer_call_attempts" ADD COLUMN "caller_number_id" varchar;--> statement-breakpoint
ALTER TABLE "dialer_call_attempts" ADD COLUMN "from_did" text;--> statement-breakpoint
ALTER TABLE "dialer_call_attempts" ADD COLUMN "full_transcript" text;--> statement-breakpoint
ALTER TABLE "dialer_call_attempts" ADD COLUMN "ai_transcript" text;--> statement-breakpoint
ALTER TABLE "leads" ADD COLUMN "telnyx_recording_id" text;--> statement-breakpoint
ALTER TABLE "leads" ADD COLUMN "recording_provider" text DEFAULT 'telnyx';--> statement-breakpoint
ALTER TABLE "leads" ADD COLUMN "published_at" timestamp;--> statement-breakpoint
ALTER TABLE "leads" ADD COLUMN "published_by" varchar;--> statement-breakpoint
ALTER TABLE "leads" ADD COLUMN "pm_approved_at" timestamp;--> statement-breakpoint
ALTER TABLE "leads" ADD COLUMN "pm_approved_by" varchar;--> statement-breakpoint
ALTER TABLE "leads" ADD COLUMN "pm_rejected_at" timestamp;--> statement-breakpoint
ALTER TABLE "leads" ADD COLUMN "pm_rejected_by" varchar;--> statement-breakpoint
ALTER TABLE "leads" ADD COLUMN "pm_rejection_reason" text;--> statement-breakpoint
ALTER TABLE "prompt_registry" ADD COLUMN "department" "prompt_department";--> statement-breakpoint
ALTER TABLE "prompt_registry" ADD COLUMN "prompt_function" "prompt_function";--> statement-breakpoint
ALTER TABLE "prompt_registry" ADD COLUMN "purpose" "prompt_purpose";--> statement-breakpoint
ALTER TABLE "prompt_registry" ADD COLUMN "ai_model" text;--> statement-breakpoint
ALTER TABLE "prompt_registry" ADD COLUMN "status" "prompt_status" DEFAULT 'live' NOT NULL;--> statement-breakpoint
ALTER TABLE "prompt_registry" ADD COLUMN "owner_id" varchar;--> statement-breakpoint
ALTER TABLE "prompt_registry" ADD COLUMN "owner_department" text;--> statement-breakpoint
ALTER TABLE "prompt_registry" ADD COLUMN "invocation_point" jsonb;--> statement-breakpoint
ALTER TABLE "prompt_registry" ADD COLUMN "input_dependencies" jsonb;--> statement-breakpoint
ALTER TABLE "prompt_registry" ADD COLUMN "output_destination" jsonb;--> statement-breakpoint
ALTER TABLE "virtual_agents" ADD COLUMN "assigned_phone_number_id" varchar;--> statement-breakpoint
ALTER TABLE "ae_assignment_batches" ADD CONSTRAINT "ae_assignment_batches_pipeline_id_pipelines_id_fk" FOREIGN KEY ("pipeline_id") REFERENCES "public"."pipelines"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ae_assignment_batches" ADD CONSTRAINT "ae_assignment_batches_assigned_by_users_id_fk" FOREIGN KEY ("assigned_by") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_conversations" ADD CONSTRAINT "agent_conversations_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_execution_plans" ADD CONSTRAINT "agent_execution_plans_conversation_id_agent_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."agent_conversations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_execution_plans" ADD CONSTRAINT "agent_execution_plans_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_execution_plans" ADD CONSTRAINT "agent_execution_plans_approved_by_users_id_fk" FOREIGN KEY ("approved_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_prompt_history" ADD CONSTRAINT "agent_prompt_history_agent_prompt_id_agent_prompts_id_fk" FOREIGN KEY ("agent_prompt_id") REFERENCES "public"."agent_prompts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_prompt_history" ADD CONSTRAINT "agent_prompt_history_changed_by_users_id_fk" FOREIGN KEY ("changed_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_prompts" ADD CONSTRAINT "agent_prompts_iam_role_id_iam_roles_id_fk" FOREIGN KEY ("iam_role_id") REFERENCES "public"."iam_roles"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_prompts" ADD CONSTRAINT "agent_prompts_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_prompts" ADD CONSTRAINT "agent_prompts_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agentic_campaign_sessions" ADD CONSTRAINT "agentic_campaign_sessions_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "availability_slots" ADD CONSTRAINT "availability_slots_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "booking_types" ADD CONSTRAINT "booking_types_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_booking_type_id_booking_types_id_fk" FOREIGN KEY ("booking_type_id") REFERENCES "public"."booking_types"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_host_user_id_users_id_fk" FOREIGN KEY ("host_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campaign_intake_requests" ADD CONSTRAINT "campaign_intake_requests_client_account_id_client_accounts_id_fk" FOREIGN KEY ("client_account_id") REFERENCES "public"."client_accounts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campaign_intake_requests" ADD CONSTRAINT "campaign_intake_requests_client_order_id_client_portal_orders_id_fk" FOREIGN KEY ("client_order_id") REFERENCES "public"."client_portal_orders"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campaign_intake_requests" ADD CONSTRAINT "campaign_intake_requests_assigned_pm_id_users_id_fk" FOREIGN KEY ("assigned_pm_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campaign_intake_requests" ADD CONSTRAINT "campaign_intake_requests_qso_reviewed_by_id_users_id_fk" FOREIGN KEY ("qso_reviewed_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campaign_intake_requests" ADD CONSTRAINT "campaign_intake_requests_approved_by_id_users_id_fk" FOREIGN KEY ("approved_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campaign_intake_requests" ADD CONSTRAINT "campaign_intake_requests_campaign_id_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaigns"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campaign_intake_requests" ADD CONSTRAINT "campaign_intake_requests_project_id_client_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."client_projects"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "client_bulk_imports" ADD CONSTRAINT "client_bulk_imports_client_account_id_client_accounts_id_fk" FOREIGN KEY ("client_account_id") REFERENCES "public"."client_accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "client_bulk_imports" ADD CONSTRAINT "client_bulk_imports_campaign_id_client_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."client_campaigns"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "client_bulk_imports" ADD CONSTRAINT "client_bulk_imports_uploaded_by_client_users_id_fk" FOREIGN KEY ("uploaded_by") REFERENCES "public"."client_users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "client_business_profiles" ADD CONSTRAINT "client_business_profiles_client_account_id_client_accounts_id_fk" FOREIGN KEY ("client_account_id") REFERENCES "public"."client_accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "client_business_profiles" ADD CONSTRAINT "client_business_profiles_updated_by_client_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."client_users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "client_call_flows" ADD CONSTRAINT "client_call_flows_client_account_id_client_accounts_id_fk" FOREIGN KEY ("client_account_id") REFERENCES "public"."client_accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "client_call_flows" ADD CONSTRAINT "client_call_flows_created_by_client_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."client_users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "client_campaign_contacts" ADD CONSTRAINT "client_campaign_contacts_campaign_id_client_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."client_campaigns"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "client_campaign_contacts" ADD CONSTRAINT "client_campaign_contacts_contact_id_client_crm_contacts_id_fk" FOREIGN KEY ("contact_id") REFERENCES "public"."client_crm_contacts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "client_campaign_contacts" ADD CONSTRAINT "client_campaign_contacts_added_by_client_users_id_fk" FOREIGN KEY ("added_by") REFERENCES "public"."client_users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "client_campaign_pricing" ADD CONSTRAINT "client_campaign_pricing_client_account_id_client_accounts_id_fk" FOREIGN KEY ("client_account_id") REFERENCES "public"."client_accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "client_campaigns" ADD CONSTRAINT "client_campaigns_client_account_id_client_accounts_id_fk" FOREIGN KEY ("client_account_id") REFERENCES "public"."client_accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "client_campaigns" ADD CONSTRAINT "client_campaigns_call_flow_id_client_call_flows_id_fk" FOREIGN KEY ("call_flow_id") REFERENCES "public"."client_call_flows"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "client_campaigns" ADD CONSTRAINT "client_campaigns_default_email_template_id_client_email_templates_id_fk" FOREIGN KEY ("default_email_template_id") REFERENCES "public"."client_email_templates"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "client_campaigns" ADD CONSTRAINT "client_campaigns_created_by_client_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."client_users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "client_crm_accounts" ADD CONSTRAINT "client_crm_accounts_client_account_id_client_accounts_id_fk" FOREIGN KEY ("client_account_id") REFERENCES "public"."client_accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "client_crm_accounts" ADD CONSTRAINT "client_crm_accounts_created_by_client_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."client_users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "client_crm_contacts" ADD CONSTRAINT "client_crm_contacts_client_account_id_client_accounts_id_fk" FOREIGN KEY ("client_account_id") REFERENCES "public"."client_accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "client_crm_contacts" ADD CONSTRAINT "client_crm_contacts_crm_account_id_client_crm_accounts_id_fk" FOREIGN KEY ("crm_account_id") REFERENCES "public"."client_crm_accounts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "client_crm_contacts" ADD CONSTRAINT "client_crm_contacts_created_by_client_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."client_users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "client_email_templates" ADD CONSTRAINT "client_email_templates_client_account_id_client_accounts_id_fk" FOREIGN KEY ("client_account_id") REFERENCES "public"."client_accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "client_email_templates" ADD CONSTRAINT "client_email_templates_created_by_client_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."client_users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "client_feature_access" ADD CONSTRAINT "client_feature_access_client_account_id_client_accounts_id_fk" FOREIGN KEY ("client_account_id") REFERENCES "public"."client_accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "client_feature_access" ADD CONSTRAINT "client_feature_access_enabled_by_users_id_fk" FOREIGN KEY ("enabled_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "client_feature_access" ADD CONSTRAINT "client_feature_access_disabled_by_users_id_fk" FOREIGN KEY ("disabled_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "client_pricing_documents" ADD CONSTRAINT "client_pricing_documents_client_account_id_client_accounts_id_fk" FOREIGN KEY ("client_account_id") REFERENCES "public"."client_accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversation_quality_assessments" ADD CONSTRAINT "conversation_quality_assessments_call_session_id_call_sessions_id_fk" FOREIGN KEY ("call_session_id") REFERENCES "public"."call_sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversation_quality_assessments" ADD CONSTRAINT "conversation_quality_assessments_dialer_call_attempt_id_dialer_call_attempts_id_fk" FOREIGN KEY ("dialer_call_attempt_id") REFERENCES "public"."dialer_call_attempts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversation_quality_assessments" ADD CONSTRAINT "conversation_quality_assessments_campaign_id_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaigns"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversation_quality_assessments" ADD CONSTRAINT "conversation_quality_assessments_contact_id_contacts_id_fk" FOREIGN KEY ("contact_id") REFERENCES "public"."contacts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "custom_call_flow_mappings" ADD CONSTRAINT "custom_call_flow_mappings_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "custom_call_flows" ADD CONSTRAINT "custom_call_flows_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "custom_call_flows" ADD CONSTRAINT "custom_call_flows_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "external_events" ADD CONSTRAINT "external_events_client_id_client_accounts_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."client_accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "google_calendar_integrations" ADD CONSTRAINT "google_calendar_integrations_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lead_quality_assessments" ADD CONSTRAINT "lead_quality_assessments_call_session_id_call_sessions_id_fk" FOREIGN KEY ("call_session_id") REFERENCES "public"."call_sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lead_quality_assessments" ADD CONSTRAINT "lead_quality_assessments_dialer_call_attempt_id_dialer_call_attempts_id_fk" FOREIGN KEY ("dialer_call_attempt_id") REFERENCES "public"."dialer_call_attempts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lead_quality_assessments" ADD CONSTRAINT "lead_quality_assessments_campaign_id_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaigns"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lead_quality_assessments" ADD CONSTRAINT "lead_quality_assessments_contact_id_contacts_id_fk" FOREIGN KEY ("contact_id") REFERENCES "public"."contacts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lead_quality_assessments" ADD CONSTRAINT "lead_quality_assessments_lead_id_leads_id_fk" FOREIGN KEY ("lead_id") REFERENCES "public"."leads"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mercury_invitation_tokens" ADD CONSTRAINT "mercury_invitation_tokens_client_user_id_client_users_id_fk" FOREIGN KEY ("client_user_id") REFERENCES "public"."client_users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mercury_invitation_tokens" ADD CONSTRAINT "mercury_invitation_tokens_client_account_id_client_accounts_id_fk" FOREIGN KEY ("client_account_id") REFERENCES "public"."client_accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mercury_invitation_tokens" ADD CONSTRAINT "mercury_invitation_tokens_email_outbox_id_mercury_email_outbox_id_fk" FOREIGN KEY ("email_outbox_id") REFERENCES "public"."mercury_email_outbox"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mercury_templates" ADD CONSTRAINT "mercury_templates_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pipeline_accounts" ADD CONSTRAINT "pipeline_accounts_pipeline_id_pipelines_id_fk" FOREIGN KEY ("pipeline_id") REFERENCES "public"."pipelines"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pipeline_accounts" ADD CONSTRAINT "pipeline_accounts_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pipeline_accounts" ADD CONSTRAINT "pipeline_accounts_assigned_ae_id_users_id_fk" FOREIGN KEY ("assigned_ae_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pipeline_accounts" ADD CONSTRAINT "pipeline_accounts_assigned_by_users_id_fk" FOREIGN KEY ("assigned_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pipeline_accounts" ADD CONSTRAINT "pipeline_accounts_ai_recommended_ae_id_users_id_fk" FOREIGN KEY ("ai_recommended_ae_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pipeline_accounts" ADD CONSTRAINT "pipeline_accounts_converted_opportunity_id_pipeline_opportunities_id_fk" FOREIGN KEY ("converted_opportunity_id") REFERENCES "public"."pipeline_opportunities"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "prompt_dependency_map" ADD CONSTRAINT "prompt_dependency_map_prompt_id_prompt_registry_id_fk" FOREIGN KEY ("prompt_id") REFERENCES "public"."prompt_registry"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "secret_store" ADD CONSTRAINT "secret_store_rotated_by_users_id_fk" FOREIGN KEY ("rotated_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "secret_store" ADD CONSTRAINT "secret_store_deactivated_by_users_id_fk" FOREIGN KEY ("deactivated_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "secret_store" ADD CONSTRAINT "secret_store_organization_id_campaign_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."campaign_organizations"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "secret_store" ADD CONSTRAINT "secret_store_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "secret_store" ADD CONSTRAINT "secret_store_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "telephony_provider_health_history" ADD CONSTRAINT "telephony_provider_health_history_provider_id_telephony_providers_id_fk" FOREIGN KEY ("provider_id") REFERENCES "public"."telephony_providers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "telephony_providers" ADD CONSTRAINT "telephony_providers_created_by_id_users_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "work_order_drafts" ADD CONSTRAINT "work_order_drafts_client_account_id_client_accounts_id_fk" FOREIGN KEY ("client_account_id") REFERENCES "public"."client_accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "work_order_drafts" ADD CONSTRAINT "work_order_drafts_client_user_id_client_users_id_fk" FOREIGN KEY ("client_user_id") REFERENCES "public"."client_users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "work_order_drafts" ADD CONSTRAINT "work_order_drafts_external_event_id_external_events_id_fk" FOREIGN KEY ("external_event_id") REFERENCES "public"."external_events"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "work_order_drafts" ADD CONSTRAINT "work_order_drafts_work_order_id_work_orders_id_fk" FOREIGN KEY ("work_order_id") REFERENCES "public"."work_orders"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "work_orders" ADD CONSTRAINT "work_orders_client_account_id_client_accounts_id_fk" FOREIGN KEY ("client_account_id") REFERENCES "public"."client_accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "work_orders" ADD CONSTRAINT "work_orders_client_user_id_client_users_id_fk" FOREIGN KEY ("client_user_id") REFERENCES "public"."client_users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "work_orders" ADD CONSTRAINT "work_orders_project_id_client_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."client_projects"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "work_orders" ADD CONSTRAINT "work_orders_campaign_id_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaigns"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "work_orders" ADD CONSTRAINT "work_orders_assigned_to_users_id_fk" FOREIGN KEY ("assigned_to") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "work_orders" ADD CONSTRAINT "work_orders_reviewed_by_users_id_fk" FOREIGN KEY ("reviewed_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "work_orders" ADD CONSTRAINT "work_orders_approved_by_users_id_fk" FOREIGN KEY ("approved_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "work_orders" ADD CONSTRAINT "work_orders_rejected_by_users_id_fk" FOREIGN KEY ("rejected_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "work_orders" ADD CONSTRAINT "work_orders_qa_reviewed_by_users_id_fk" FOREIGN KEY ("qa_reviewed_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "number_assignments" ADD CONSTRAINT "number_assignments_number_id_telnyx_numbers_id_fk" FOREIGN KEY ("number_id") REFERENCES "public"."telnyx_numbers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "number_assignments" ADD CONSTRAINT "number_assignments_campaign_id_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaigns"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "number_assignments" ADD CONSTRAINT "number_assignments_virtual_agent_id_virtual_agents_id_fk" FOREIGN KEY ("virtual_agent_id") REFERENCES "public"."virtual_agents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "number_assignments" ADD CONSTRAINT "number_assignments_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "number_cooldowns" ADD CONSTRAINT "number_cooldowns_number_id_telnyx_numbers_id_fk" FOREIGN KEY ("number_id") REFERENCES "public"."telnyx_numbers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "number_metrics_daily" ADD CONSTRAINT "number_metrics_daily_number_id_telnyx_numbers_id_fk" FOREIGN KEY ("number_id") REFERENCES "public"."telnyx_numbers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "number_metrics_window" ADD CONSTRAINT "number_metrics_window_number_id_telnyx_numbers_id_fk" FOREIGN KEY ("number_id") REFERENCES "public"."telnyx_numbers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "number_metrics_window" ADD CONSTRAINT "number_metrics_window_call_session_id_call_sessions_id_fk" FOREIGN KEY ("call_session_id") REFERENCES "public"."call_sessions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "number_metrics_window" ADD CONSTRAINT "number_metrics_window_dialer_attempt_id_dialer_call_attempts_id_fk" FOREIGN KEY ("dialer_attempt_id") REFERENCES "public"."dialer_call_attempts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "number_pool_alerts" ADD CONSTRAINT "number_pool_alerts_number_id_telnyx_numbers_id_fk" FOREIGN KEY ("number_id") REFERENCES "public"."telnyx_numbers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "number_pool_alerts" ADD CONSTRAINT "number_pool_alerts_acknowledged_by_users_id_fk" FOREIGN KEY ("acknowledged_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "number_reputation" ADD CONSTRAINT "number_reputation_number_id_telnyx_numbers_id_fk" FOREIGN KEY ("number_id") REFERENCES "public"."telnyx_numbers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "number_routing_decisions" ADD CONSTRAINT "number_routing_decisions_call_session_id_call_sessions_id_fk" FOREIGN KEY ("call_session_id") REFERENCES "public"."call_sessions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "number_routing_decisions" ADD CONSTRAINT "number_routing_decisions_dialer_attempt_id_dialer_call_attempts_id_fk" FOREIGN KEY ("dialer_attempt_id") REFERENCES "public"."dialer_call_attempts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "number_routing_decisions" ADD CONSTRAINT "number_routing_decisions_selected_number_id_telnyx_numbers_id_fk" FOREIGN KEY ("selected_number_id") REFERENCES "public"."telnyx_numbers"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "prospect_call_suppression" ADD CONSTRAINT "prospect_call_suppression_last_number_id_telnyx_numbers_id_fk" FOREIGN KEY ("last_number_id") REFERENCES "public"."telnyx_numbers"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "ae_assignment_batches_pipeline_idx" ON "ae_assignment_batches" USING btree ("pipeline_id");--> statement-breakpoint
CREATE INDEX "ae_assignment_batches_assigned_by_idx" ON "ae_assignment_batches" USING btree ("assigned_by");--> statement-breakpoint
CREATE INDEX "ae_assignment_batches_assigned_at_idx" ON "ae_assignment_batches" USING btree ("assigned_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "agent_conversations_user_idx" ON "agent_conversations" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "agent_conversations_client_user_idx" ON "agent_conversations" USING btree ("client_user_id");--> statement-breakpoint
CREATE INDEX "agent_conversations_session_idx" ON "agent_conversations" USING btree ("session_id");--> statement-breakpoint
CREATE INDEX "agent_conversations_active_idx" ON "agent_conversations" USING btree ("is_active");--> statement-breakpoint
CREATE INDEX "agent_conversations_last_message_idx" ON "agent_conversations" USING btree ("last_message_at");--> statement-breakpoint
CREATE INDEX "agent_plans_conversation_idx" ON "agent_execution_plans" USING btree ("conversation_id");--> statement-breakpoint
CREATE INDEX "agent_plans_user_idx" ON "agent_execution_plans" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "agent_plans_client_user_idx" ON "agent_execution_plans" USING btree ("client_user_id");--> statement-breakpoint
CREATE INDEX "agent_plans_status_idx" ON "agent_execution_plans" USING btree ("status");--> statement-breakpoint
CREATE INDEX "agent_plans_created_at_idx" ON "agent_execution_plans" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "agent_prompt_history_prompt_idx" ON "agent_prompt_history" USING btree ("agent_prompt_id");--> statement-breakpoint
CREATE INDEX "agent_prompt_history_version_idx" ON "agent_prompt_history" USING btree ("version");--> statement-breakpoint
CREATE INDEX "agent_prompt_history_changed_at_idx" ON "agent_prompt_history" USING btree ("changed_at");--> statement-breakpoint
CREATE INDEX "agent_prompts_role_idx" ON "agent_prompts" USING btree ("user_role");--> statement-breakpoint
CREATE INDEX "agent_prompts_iam_role_idx" ON "agent_prompts" USING btree ("iam_role_id");--> statement-breakpoint
CREATE INDEX "agent_prompts_active_idx" ON "agent_prompts" USING btree ("is_active");--> statement-breakpoint
CREATE INDEX "agent_prompts_priority_idx" ON "agent_prompts" USING btree ("priority");--> statement-breakpoint
CREATE INDEX "agent_prompts_type_idx" ON "agent_prompts" USING btree ("prompt_type");--> statement-breakpoint
CREATE INDEX "agentic_campaign_sessions_created_by_idx" ON "agentic_campaign_sessions" USING btree ("created_by");--> statement-breakpoint
CREATE INDEX "agentic_campaign_sessions_current_step_idx" ON "agentic_campaign_sessions" USING btree ("current_step");--> statement-breakpoint
CREATE INDEX "campaign_intake_requests_client_account_idx" ON "campaign_intake_requests" USING btree ("client_account_id");--> statement-breakpoint
CREATE INDEX "campaign_intake_requests_status_idx" ON "campaign_intake_requests" USING btree ("status");--> statement-breakpoint
CREATE INDEX "campaign_intake_requests_created_at_idx" ON "campaign_intake_requests" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "client_bulk_imports_client_idx" ON "client_bulk_imports" USING btree ("client_account_id");--> statement-breakpoint
CREATE INDEX "client_bulk_imports_status_idx" ON "client_bulk_imports" USING btree ("status");--> statement-breakpoint
CREATE UNIQUE INDEX "client_business_profiles_client_idx" ON "client_business_profiles" USING btree ("client_account_id");--> statement-breakpoint
CREATE INDEX "client_call_flows_client_idx" ON "client_call_flows" USING btree ("client_account_id");--> statement-breakpoint
CREATE INDEX "client_call_flows_active_idx" ON "client_call_flows" USING btree ("is_active");--> statement-breakpoint
CREATE UNIQUE INDEX "client_campaign_contacts_unique_idx" ON "client_campaign_contacts" USING btree ("campaign_id","contact_id");--> statement-breakpoint
CREATE INDEX "client_campaign_contacts_campaign_idx" ON "client_campaign_contacts" USING btree ("campaign_id");--> statement-breakpoint
CREATE INDEX "client_campaign_contacts_contact_idx" ON "client_campaign_contacts" USING btree ("contact_id");--> statement-breakpoint
CREATE INDEX "client_campaign_contacts_status_idx" ON "client_campaign_contacts" USING btree ("status");--> statement-breakpoint
CREATE INDEX "client_campaigns_client_idx" ON "client_campaigns" USING btree ("client_account_id");--> statement-breakpoint
CREATE INDEX "client_campaigns_status_idx" ON "client_campaigns" USING btree ("status");--> statement-breakpoint
CREATE INDEX "client_campaigns_type_idx" ON "client_campaigns" USING btree ("campaign_type");--> statement-breakpoint
CREATE INDEX "client_crm_accounts_client_idx" ON "client_crm_accounts" USING btree ("client_account_id");--> statement-breakpoint
CREATE INDEX "client_crm_accounts_name_idx" ON "client_crm_accounts" USING btree ("name");--> statement-breakpoint
CREATE INDEX "client_crm_accounts_domain_idx" ON "client_crm_accounts" USING btree ("domain");--> statement-breakpoint
CREATE INDEX "client_crm_contacts_client_idx" ON "client_crm_contacts" USING btree ("client_account_id");--> statement-breakpoint
CREATE INDEX "client_crm_contacts_crm_account_idx" ON "client_crm_contacts" USING btree ("crm_account_id");--> statement-breakpoint
CREATE INDEX "client_crm_contacts_email_idx" ON "client_crm_contacts" USING btree ("email");--> statement-breakpoint
CREATE INDEX "client_crm_contacts_name_idx" ON "client_crm_contacts" USING btree ("first_name","last_name");--> statement-breakpoint
CREATE INDEX "client_email_templates_client_idx" ON "client_email_templates" USING btree ("client_account_id");--> statement-breakpoint
CREATE INDEX "client_email_templates_category_idx" ON "client_email_templates" USING btree ("category");--> statement-breakpoint
CREATE INDEX "client_email_templates_active_idx" ON "client_email_templates" USING btree ("is_active");--> statement-breakpoint
CREATE UNIQUE INDEX "client_feature_access_unique_idx" ON "client_feature_access" USING btree ("client_account_id","feature");--> statement-breakpoint
CREATE INDEX "client_feature_access_client_idx" ON "client_feature_access" USING btree ("client_account_id");--> statement-breakpoint
CREATE INDEX "client_pricing_docs_client_idx" ON "client_pricing_documents" USING btree ("client_account_id");--> statement-breakpoint
CREATE INDEX "cqa_call_session_idx" ON "conversation_quality_assessments" USING btree ("call_session_id");--> statement-breakpoint
CREATE INDEX "cqa_campaign_idx" ON "conversation_quality_assessments" USING btree ("campaign_id");--> statement-breakpoint
CREATE INDEX "cqa_cqs_idx" ON "conversation_quality_assessments" USING btree ("conversation_quality_score");--> statement-breakpoint
CREATE INDEX "cqa_status_idx" ON "conversation_quality_assessments" USING btree ("status");--> statement-breakpoint
CREATE INDEX "cqa_created_at_idx" ON "conversation_quality_assessments" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "custom_call_flow_mappings_flow_idx" ON "custom_call_flow_mappings" USING btree ("call_flow_id");--> statement-breakpoint
CREATE INDEX "custom_call_flows_name_idx" ON "custom_call_flows" USING btree ("name");--> statement-breakpoint
CREATE INDEX "custom_call_flows_active_idx" ON "custom_call_flows" USING btree ("is_active");--> statement-breakpoint
CREATE INDEX "external_events_client_idx" ON "external_events" USING btree ("client_id");--> statement-breakpoint
CREATE INDEX "external_events_provider_idx" ON "external_events" USING btree ("source_provider");--> statement-breakpoint
CREATE INDEX "external_events_start_at_idx" ON "external_events" USING btree ("start_at_iso");--> statement-breakpoint
CREATE INDEX "gen_studio_chat_session_idx" ON "generative_studio_chat_messages" USING btree ("session_id");--> statement-breakpoint
CREATE INDEX "gen_studio_chat_owner_idx" ON "generative_studio_chat_messages" USING btree ("owner_id");--> statement-breakpoint
CREATE INDEX "gen_studio_chat_created_at_idx" ON "generative_studio_chat_messages" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "gen_studio_projects_content_type_idx" ON "generative_studio_projects" USING btree ("content_type");--> statement-breakpoint
CREATE INDEX "gen_studio_projects_status_idx" ON "generative_studio_projects" USING btree ("status");--> statement-breakpoint
CREATE INDEX "gen_studio_projects_owner_idx" ON "generative_studio_projects" USING btree ("owner_id");--> statement-breakpoint
CREATE INDEX "gen_studio_projects_created_at_idx" ON "generative_studio_projects" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "gen_studio_published_slug_idx" ON "generative_studio_published_pages" USING btree ("slug");--> statement-breakpoint
CREATE INDEX "gen_studio_published_type_idx" ON "generative_studio_published_pages" USING btree ("content_type");--> statement-breakpoint
CREATE INDEX "gen_studio_published_is_published_idx" ON "generative_studio_published_pages" USING btree ("is_published");--> statement-breakpoint
CREATE INDEX "lqa_call_session_idx" ON "lead_quality_assessments" USING btree ("call_session_id");--> statement-breakpoint
CREATE INDEX "lqa_campaign_idx" ON "lead_quality_assessments" USING btree ("campaign_id");--> statement-breakpoint
CREATE INDEX "lqa_lead_idx" ON "lead_quality_assessments" USING btree ("lead_id");--> statement-breakpoint
CREATE INDEX "lqa_qual_score_idx" ON "lead_quality_assessments" USING btree ("lead_qualification_score");--> statement-breakpoint
CREATE INDEX "lqa_outcome_idx" ON "lead_quality_assessments" USING btree ("outcome_category");--> statement-breakpoint
CREATE INDEX "lqa_status_idx" ON "lead_quality_assessments" USING btree ("status");--> statement-breakpoint
CREATE INDEX "lqa_created_at_idx" ON "lead_quality_assessments" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "mercury_outbox_status_idx" ON "mercury_email_outbox" USING btree ("status");--> statement-breakpoint
CREATE INDEX "mercury_outbox_recipient_idx" ON "mercury_email_outbox" USING btree ("recipient_email");--> statement-breakpoint
CREATE INDEX "mercury_outbox_tenant_idx" ON "mercury_email_outbox" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "mercury_outbox_template_idx" ON "mercury_email_outbox" USING btree ("template_key");--> statement-breakpoint
CREATE UNIQUE INDEX "mercury_outbox_idempotency_idx" ON "mercury_email_outbox" USING btree ("idempotency_key");--> statement-breakpoint
CREATE INDEX "mercury_outbox_created_idx" ON "mercury_email_outbox" USING btree ("created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "mercury_invite_token_idx" ON "mercury_invitation_tokens" USING btree ("token");--> statement-breakpoint
CREATE INDEX "mercury_invite_user_idx" ON "mercury_invitation_tokens" USING btree ("client_user_id");--> statement-breakpoint
CREATE INDEX "mercury_invite_account_idx" ON "mercury_invitation_tokens" USING btree ("client_account_id");--> statement-breakpoint
CREATE INDEX "mercury_invite_expires_idx" ON "mercury_invitation_tokens" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX "mercury_events_type_idx" ON "mercury_notification_events" USING btree ("event_type");--> statement-breakpoint
CREATE INDEX "mercury_events_tenant_idx" ON "mercury_notification_events" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "mercury_events_processed_idx" ON "mercury_notification_events" USING btree ("processed_at");--> statement-breakpoint
CREATE INDEX "mercury_events_created_idx" ON "mercury_notification_events" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "mercury_prefs_user_type_idx" ON "mercury_notification_preferences" USING btree ("user_id","user_type");--> statement-breakpoint
CREATE INDEX "mercury_prefs_notif_type_idx" ON "mercury_notification_preferences" USING btree ("notification_type");--> statement-breakpoint
CREATE INDEX "mercury_rules_event_type_idx" ON "mercury_notification_rules" USING btree ("event_type");--> statement-breakpoint
CREATE INDEX "mercury_rules_enabled_idx" ON "mercury_notification_rules" USING btree ("is_enabled");--> statement-breakpoint
CREATE UNIQUE INDEX "mercury_templates_key_idx" ON "mercury_templates" USING btree ("template_key");--> statement-breakpoint
CREATE INDEX "mercury_templates_enabled_idx" ON "mercury_templates" USING btree ("is_enabled");--> statement-breakpoint
CREATE INDEX "mercury_templates_category_idx" ON "mercury_templates" USING btree ("category");--> statement-breakpoint
CREATE INDEX "password_reset_tokens_token_idx" ON "password_reset_tokens" USING btree ("token");--> statement-breakpoint
CREATE INDEX "password_reset_tokens_email_idx" ON "password_reset_tokens" USING btree ("email");--> statement-breakpoint
CREATE INDEX "pipeline_accounts_pipeline_idx" ON "pipeline_accounts" USING btree ("pipeline_id");--> statement-breakpoint
CREATE INDEX "pipeline_accounts_account_idx" ON "pipeline_accounts" USING btree ("account_id");--> statement-breakpoint
CREATE INDEX "pipeline_accounts_ae_idx" ON "pipeline_accounts" USING btree ("assigned_ae_id");--> statement-breakpoint
CREATE INDEX "pipeline_accounts_stage_idx" ON "pipeline_accounts" USING btree ("journey_stage");--> statement-breakpoint
CREATE INDEX "pipeline_accounts_priority_idx" ON "pipeline_accounts" USING btree ("priority_score" DESC NULLS LAST);--> statement-breakpoint
CREATE UNIQUE INDEX "pipeline_accounts_unique_idx" ON "pipeline_accounts" USING btree ("pipeline_id","account_id");--> statement-breakpoint
CREATE INDEX "prompt_dep_map_prompt_id_idx" ON "prompt_dependency_map" USING btree ("prompt_id");--> statement-breakpoint
CREATE INDEX "prompt_dep_map_entity_idx" ON "prompt_dependency_map" USING btree ("entity_name");--> statement-breakpoint
CREATE INDEX "prompt_dep_map_endpoint_idx" ON "prompt_dependency_map" USING btree ("endpoint_path");--> statement-breakpoint
CREATE INDEX "prompt_dep_map_direction_idx" ON "prompt_dependency_map" USING btree ("direction");--> statement-breakpoint
CREATE UNIQUE INDEX "secret_store_env_service_usage_idx" ON "secret_store" USING btree ("environment","service","usage_context","name");--> statement-breakpoint
CREATE INDEX "secret_store_environment_idx" ON "secret_store" USING btree ("environment");--> statement-breakpoint
CREATE INDEX "secret_store_service_idx" ON "secret_store" USING btree ("service");--> statement-breakpoint
CREATE INDEX "secret_store_active_idx" ON "secret_store" USING btree ("is_active");--> statement-breakpoint
CREATE INDEX "telephony_provider_health_provider_idx" ON "telephony_provider_health_history" USING btree ("provider_id");--> statement-breakpoint
CREATE INDEX "telephony_provider_health_checked_at_idx" ON "telephony_provider_health_history" USING btree ("checked_at");--> statement-breakpoint
CREATE INDEX "telephony_providers_enabled_idx" ON "telephony_providers" USING btree ("enabled");--> statement-breakpoint
CREATE INDEX "telephony_providers_type_idx" ON "telephony_providers" USING btree ("type");--> statement-breakpoint
CREATE INDEX "telephony_providers_priority_idx" ON "telephony_providers" USING btree ("priority");--> statement-breakpoint
CREATE INDEX "work_order_drafts_client_idx" ON "work_order_drafts" USING btree ("client_account_id");--> statement-breakpoint
CREATE INDEX "work_order_drafts_event_idx" ON "work_order_drafts" USING btree ("external_event_id");--> statement-breakpoint
CREATE INDEX "work_order_drafts_status_idx" ON "work_order_drafts" USING btree ("status");--> statement-breakpoint
CREATE INDEX "work_orders_client_idx" ON "work_orders" USING btree ("client_account_id");--> statement-breakpoint
CREATE INDEX "work_orders_status_idx" ON "work_orders" USING btree ("status");--> statement-breakpoint
CREATE INDEX "work_orders_type_idx" ON "work_orders" USING btree ("order_type");--> statement-breakpoint
CREATE INDEX "work_orders_project_idx" ON "work_orders" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "work_orders_campaign_idx" ON "work_orders" USING btree ("campaign_id");--> statement-breakpoint
CREATE INDEX "work_orders_assigned_idx" ON "work_orders" USING btree ("assigned_to");--> statement-breakpoint
CREATE UNIQUE INDEX "work_orders_order_number_idx" ON "work_orders" USING btree ("order_number");--> statement-breakpoint
CREATE INDEX "number_assignments_number_idx" ON "number_assignments" USING btree ("number_id");--> statement-breakpoint
CREATE INDEX "number_assignments_campaign_idx" ON "number_assignments" USING btree ("campaign_id");--> statement-breakpoint
CREATE INDEX "number_assignments_agent_idx" ON "number_assignments" USING btree ("virtual_agent_id");--> statement-breakpoint
CREATE INDEX "number_assignments_scope_idx" ON "number_assignments" USING btree ("scope");--> statement-breakpoint
CREATE INDEX "number_assignments_active_idx" ON "number_assignments" USING btree ("is_active");--> statement-breakpoint
CREATE INDEX "number_cooldowns_number_active_idx" ON "number_cooldowns" USING btree ("number_id","is_active");--> statement-breakpoint
CREATE INDEX "number_cooldowns_ends_at_idx" ON "number_cooldowns" USING btree ("ends_at");--> statement-breakpoint
CREATE INDEX "number_metrics_daily_number_date_idx" ON "number_metrics_daily" USING btree ("number_id","metric_date");--> statement-breakpoint
CREATE INDEX "number_metrics_window_number_time_idx" ON "number_metrics_window" USING btree ("number_id","called_at");--> statement-breakpoint
CREATE INDEX "number_metrics_window_prospect_idx" ON "number_metrics_window" USING btree ("prospect_number_e164","number_id");--> statement-breakpoint
CREATE INDEX "number_metrics_window_call_session_idx" ON "number_metrics_window" USING btree ("call_session_id");--> statement-breakpoint
CREATE INDEX "number_pool_alerts_unack_idx" ON "number_pool_alerts" USING btree ("is_acknowledged","created_at");--> statement-breakpoint
CREATE INDEX "number_pool_alerts_number_idx" ON "number_pool_alerts" USING btree ("number_id");--> statement-breakpoint
CREATE INDEX "number_reputation_score_idx" ON "number_reputation" USING btree ("score");--> statement-breakpoint
CREATE INDEX "number_reputation_band_idx" ON "number_reputation" USING btree ("band");--> statement-breakpoint
CREATE INDEX "routing_decisions_call_idx" ON "number_routing_decisions" USING btree ("call_session_id");--> statement-breakpoint
CREATE INDEX "routing_decisions_number_idx" ON "number_routing_decisions" USING btree ("selected_number_id");--> statement-breakpoint
CREATE INDEX "routing_decisions_time_idx" ON "number_routing_decisions" USING btree ("decided_at");--> statement-breakpoint
CREATE INDEX "routing_decisions_campaign_idx" ON "number_routing_decisions" USING btree ("campaign_id");--> statement-breakpoint
CREATE INDEX "prospect_suppression_number_idx" ON "prospect_call_suppression" USING btree ("prospect_number_e164");--> statement-breakpoint
CREATE INDEX "prospect_suppression_until_idx" ON "prospect_call_suppression" USING btree ("suppress_until");--> statement-breakpoint
CREATE INDEX "telnyx_numbers_status_idx" ON "telnyx_numbers" USING btree ("status");--> statement-breakpoint
CREATE INDEX "telnyx_numbers_area_code_idx" ON "telnyx_numbers" USING btree ("area_code");--> statement-breakpoint
CREATE INDEX "telnyx_numbers_region_idx" ON "telnyx_numbers" USING btree ("region");--> statement-breakpoint
CREATE INDEX "telnyx_numbers_phone_idx" ON "telnyx_numbers" USING btree ("phone_number_e164");--> statement-breakpoint
ALTER TABLE "call_quality_records" ADD CONSTRAINT "call_quality_records_showcased_by_users_id_fk" FOREIGN KEY ("showcased_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "client_projects" ADD CONSTRAINT "client_projects_approved_by_users_id_fk" FOREIGN KEY ("approved_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "client_projects" ADD CONSTRAINT "client_projects_external_event_id_external_events_id_fk" FOREIGN KEY ("external_event_id") REFERENCES "public"."external_events"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "leads" ADD CONSTRAINT "leads_published_by_users_id_fk" FOREIGN KEY ("published_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "leads" ADD CONSTRAINT "leads_pm_approved_by_users_id_fk" FOREIGN KEY ("pm_approved_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "leads" ADD CONSTRAINT "leads_pm_rejected_by_users_id_fk" FOREIGN KEY ("pm_rejected_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "prompt_registry" ADD CONSTRAINT "prompt_registry_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "call_quality_records_showcase_idx" ON "call_quality_records" USING btree ("is_showcase");--> statement-breakpoint
CREATE INDEX "client_projects_event_idx" ON "client_projects" USING btree ("external_event_id");--> statement-breakpoint
CREATE INDEX "leads_contact_idx" ON "leads" USING btree ("contact_id");--> statement-breakpoint
CREATE INDEX "leads_agent_idx" ON "leads" USING btree ("agent_id");--> statement-breakpoint
CREATE INDEX "leads_created_idx" ON "leads" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "prompt_registry_department_idx" ON "prompt_registry" USING btree ("department");--> statement-breakpoint
CREATE INDEX "prompt_registry_function_idx" ON "prompt_registry" USING btree ("prompt_function");--> statement-breakpoint
CREATE INDEX "prompt_registry_purpose_idx" ON "prompt_registry" USING btree ("purpose");--> statement-breakpoint
CREATE INDEX "prompt_registry_status_idx" ON "prompt_registry" USING btree ("status");--> statement-breakpoint
CREATE INDEX "prompt_registry_owner_idx" ON "prompt_registry" USING btree ("owner_id");--> statement-breakpoint
CREATE INDEX "prompt_registry_model_idx" ON "prompt_registry" USING btree ("ai_model");--> statement-breakpoint
CREATE INDEX "virtual_agents_assigned_phone_idx" ON "virtual_agents" USING btree ("assigned_phone_number_id");