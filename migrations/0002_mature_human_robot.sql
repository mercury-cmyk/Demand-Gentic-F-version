CREATE TYPE "public"."analysis_type" AS ENUM('lead_quality', 'email_quality', 'call_quality', 'communication_quality', 'engagement', 'account_health', 'next_best_action');--> statement-breakpoint
CREATE TYPE "public"."email_block_type" AS ENUM('text', 'heading', 'image', 'button', 'divider', 'spacer', 'columns', 'hero', 'card', 'social', 'footer', 'header', 'list', 'quote', 'video', 'countdown', 'product');--> statement-breakpoint
CREATE TYPE "public"."email_generation_status" AS ENUM('pending', 'processing', 'completed', 'failed', 'cached');--> statement-breakpoint
CREATE TYPE "public"."email_provider" AS ENUM('gemini', 'gpt4o', 'deepseek', 'openai', 'anthropic');--> statement-breakpoint
CREATE TYPE "public"."health_status" AS ENUM('thriving', 'healthy', 'at_risk', 'critical');--> statement-breakpoint
CREATE TYPE "public"."iam_action" AS ENUM('view', 'create', 'edit', 'delete', 'run', 'execute', 'approve', 'publish', 'assign', 'export', 'manage_settings', 'view_sensitive', 'manage_access');--> statement-breakpoint
CREATE TYPE "public"."iam_entity_type" AS ENUM('account', 'project', 'campaign', 'agent', 'call_session', 'recording', 'transcript', 'report', 'lead', 'delivery', 'domain', 'smtp', 'email_template', 'prompt', 'quality_review', 'audit_log', 'user', 'team', 'role', 'policy');--> statement-breakpoint
CREATE TYPE "public"."iam_grant_type" AS ENUM('assignment', 'permission', 'temporary', 'break_glass');--> statement-breakpoint
CREATE TYPE "public"."iam_request_status" AS ENUM('pending', 'approved', 'denied', 'expired', 'revoked');--> statement-breakpoint
CREATE TYPE "public"."iam_scope_type" AS ENUM('all', 'assigned', 'own', 'team', 'account', 'project', 'campaign', 'organization');--> statement-breakpoint
CREATE TYPE "public"."image_source" AS ENUM('upload', 'ai_generated', 'url', 'stock');--> statement-breakpoint
CREATE TYPE "public"."nba_action_type" AS ENUM('contact', 'message', 'offer', 'follow_up', 'escalate');--> statement-breakpoint
CREATE TYPE "public"."nba_status" AS ENUM('pending', 'in_progress', 'completed', 'skipped', 'expired');--> statement-breakpoint
CREATE TYPE "public"."score_tier" AS ENUM('exceptional', 'good', 'acceptable', 'below_standard', 'critical');--> statement-breakpoint
CREATE TABLE "account_health_scores" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"account_id" varchar NOT NULL,
	"campaign_id" varchar,
	"overall_health_score" integer NOT NULL,
	"fit_score" integer,
	"engagement_score" integer,
	"intent_score" integer,
	"relationship_score" integer,
	"risk_score" integer,
	"score_components" jsonb,
	"score_factors" jsonb,
	"health_status" varchar(20),
	"trend" varchar(20),
	"trend_velocity" numeric(5, 4),
	"risk_factors" jsonb,
	"opportunities" jsonb,
	"scoring_model_id" varchar,
	"analysis_id" varchar,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ai_image_generation_jobs" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"prompt" text NOT NULL,
	"negative_prompt" text,
	"style" text,
	"aspect_ratio" text DEFAULT '1:1',
	"number_of_images" integer DEFAULT 1,
	"model" text DEFAULT 'imagen-3',
	"model_version" text,
	"parameters" jsonb,
	"status" text DEFAULT 'pending' NOT NULL,
	"generated_images" jsonb,
	"error_message" text,
	"started_at" timestamp,
	"completed_at" timestamp,
	"duration_ms" integer,
	"estimated_cost" real,
	"requested_by" varchar,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "brand_kits" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"is_default" boolean DEFAULT false NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"company_name" text NOT NULL,
	"company_address" text,
	"company_phone" text,
	"company_website" text,
	"colors" jsonb NOT NULL,
	"typography" jsonb NOT NULL,
	"logo_image_id" varchar,
	"logo_url" text,
	"logo_width" integer DEFAULT 150,
	"logo_alt" text DEFAULT 'Company Logo',
	"social_links" jsonb,
	"button_styles" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "email_builder_blocks" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"template_id" varchar NOT NULL,
	"block_type" "email_block_type" NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"content" jsonb NOT NULL,
	"styles" jsonb DEFAULT '{}'::jsonb,
	"mobile_styles" jsonb DEFAULT '{}'::jsonb,
	"is_visible" boolean DEFAULT true NOT NULL,
	"hide_on_mobile" boolean DEFAULT false NOT NULL,
	"hide_on_desktop" boolean DEFAULT false NOT NULL,
	"conditional_logic" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "email_builder_images" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"source" "image_source" NOT NULL,
	"original_url" text,
	"stored_url" text NOT NULL,
	"thumbnail_url" text,
	"file_name" text,
	"mime_type" text DEFAULT 'image/png',
	"width" integer,
	"height" integer,
	"size_bytes" integer,
	"ai_prompt" text,
	"ai_model" text,
	"ai_generation_id" text,
	"ai_style" text,
	"alt_text" text,
	"caption" text,
	"tags" text[],
	"usage_count" integer DEFAULT 0,
	"last_used_at" timestamp,
	"folder_id" varchar,
	"is_public" boolean DEFAULT false,
	"uploaded_by" varchar,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "email_builder_templates" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"category" text DEFAULT 'custom',
	"thumbnail" text,
	"brand_kit_id" varchar,
	"width" integer DEFAULT 600,
	"background_color" text DEFAULT '#f4f4f4',
	"blocks" jsonb DEFAULT '[]'::jsonb,
	"is_public" boolean DEFAULT false,
	"usage_count" integer DEFAULT 0,
	"last_used_at" timestamp,
	"version" integer DEFAULT 1,
	"parent_template_id" varchar,
	"created_by" varchar,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "email_generation_logs" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"request_id" varchar NOT NULL,
	"campaign_id" varchar,
	"account_id" varchar,
	"contact_id" varchar,
	"generation_type" text NOT NULL,
	"request_source" text NOT NULL,
	"provider" "email_provider" NOT NULL,
	"model" text NOT NULL,
	"fallback_used" boolean DEFAULT false NOT NULL,
	"fallback_reason" text,
	"prompt_version" text DEFAULT '1.0',
	"layers_applied" text[],
	"system_prompt_tokens" integer,
	"user_prompt_tokens" integer,
	"input_context" jsonb,
	"generated_subject" text,
	"generated_preheader" text,
	"generated_html_content" text,
	"generated_text_content" text,
	"merge_fields_used" text[],
	"latency_ms" integer,
	"token_usage" jsonb,
	"estimated_cost" real,
	"compliance_checks" jsonb,
	"compliance_passed" boolean DEFAULT true,
	"status" "email_generation_status" DEFAULT 'pending' NOT NULL,
	"error_message" text,
	"error_code" text,
	"cache_key" text,
	"cached_from_id" varchar,
	"requested_at" timestamp DEFAULT now() NOT NULL,
	"completed_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "email_provider_config" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"provider" "email_provider" NOT NULL,
	"display_name" text NOT NULL,
	"is_enabled" boolean DEFAULT true NOT NULL,
	"is_primary" boolean DEFAULT false NOT NULL,
	"priority" integer DEFAULT 1 NOT NULL,
	"max_retries" integer DEFAULT 3,
	"requests_per_minute" integer DEFAULT 60,
	"tokens_per_minute" integer DEFAULT 100000,
	"current_requests_this_minute" integer DEFAULT 0,
	"current_tokens_this_minute" integer DEFAULT 0,
	"rate_limit_reset_at" timestamp,
	"is_healthy" boolean DEFAULT true NOT NULL,
	"last_health_check" timestamp,
	"consecutive_failures" integer DEFAULT 0,
	"average_latency_ms" integer,
	"error_rate" real DEFAULT 0,
	"cost_per_input_token" real,
	"cost_per_output_token" real,
	"monthly_budget" real,
	"monthly_spend" real DEFAULT 0,
	"budget_reset_at" timestamp,
	"default_model" text NOT NULL,
	"available_models" text[],
	"default_temperature" real DEFAULT 0.7,
	"default_max_tokens" integer DEFAULT 4000,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "email_provider_config_provider_unique" UNIQUE("provider")
);
--> statement-breakpoint
CREATE TABLE "engagement_analysis_records" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"contact_id" varchar NOT NULL,
	"account_id" varchar,
	"campaign_id" varchar,
	"analysis_period_start" timestamp NOT NULL,
	"analysis_period_end" timestamp NOT NULL,
	"overall_engagement_score" integer,
	"sentiment" varchar(20),
	"sentiment_score" numeric(5, 4),
	"sentiment_trajectory" varchar(20),
	"intent_score" integer,
	"intent_signals" jsonb,
	"momentum_score" integer,
	"momentum_direction" varchar(20),
	"channel_engagement" jsonb,
	"total_interactions" integer,
	"email_opens" integer,
	"email_clicks" integer,
	"email_replies" integer,
	"calls_connected" integer,
	"meetings_scheduled" integer,
	"engagement_patterns" jsonb,
	"anomalies" jsonb,
	"engagement_forecast" jsonb,
	"churn_risk_score" numeric(5, 4),
	"analysis_id" varchar,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "iam_access_grants" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" varchar,
	"team_id" varchar,
	"entity_type" "iam_entity_type" NOT NULL,
	"entity_id" varchar,
	"grant_type" "iam_grant_type" DEFAULT 'permission' NOT NULL,
	"actions" jsonb NOT NULL,
	"conditions" jsonb,
	"is_active" boolean DEFAULT true NOT NULL,
	"granted_at" timestamp DEFAULT now() NOT NULL,
	"granted_by" varchar,
	"expires_at" timestamp,
	"reason" text
);
--> statement-breakpoint
CREATE TABLE "iam_access_requests" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"requester_id" varchar NOT NULL,
	"entity_type" "iam_entity_type" NOT NULL,
	"entity_id" varchar,
	"entity_name" text,
	"actions" jsonb NOT NULL,
	"requested_duration" text,
	"reason" text NOT NULL,
	"status" "iam_request_status" DEFAULT 'pending' NOT NULL,
	"reviewer_id" varchar,
	"reviewed_at" timestamp,
	"review_notes" text,
	"grant_id" varchar,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"expires_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "iam_audit_events" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"actor_id" varchar,
	"actor_type" text DEFAULT 'user' NOT NULL,
	"actor_ip" text,
	"actor_user_agent" text,
	"action" text NOT NULL,
	"entity_type" "iam_entity_type",
	"entity_id" varchar,
	"target_user_id" varchar,
	"target_team_id" varchar,
	"before_state" jsonb,
	"after_state" jsonb,
	"change_description" text,
	"request_id" varchar,
	"reason" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"organization_id" varchar
);
--> statement-breakpoint
CREATE TABLE "iam_entity_assignments" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" varchar,
	"team_id" varchar,
	"entity_type" "iam_entity_type" NOT NULL,
	"entity_id" varchar NOT NULL,
	"assignment_role" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"assigned_at" timestamp DEFAULT now() NOT NULL,
	"assigned_by" varchar,
	"expires_at" timestamp,
	"notes" text
);
--> statement-breakpoint
CREATE TABLE "iam_policies" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"organization_id" varchar,
	"entity_type" "iam_entity_type" NOT NULL,
	"actions" jsonb NOT NULL,
	"scope_type" "iam_scope_type" DEFAULT 'assigned' NOT NULL,
	"conditions" jsonb,
	"field_rules" jsonb,
	"effect" text DEFAULT 'allow' NOT NULL,
	"is_system" boolean DEFAULT false NOT NULL,
	"priority" integer DEFAULT 0 NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"created_by" varchar,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"updated_by" varchar
);
--> statement-breakpoint
CREATE TABLE "iam_role_policies" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"role_id" varchar NOT NULL,
	"policy_id" varchar NOT NULL,
	"added_at" timestamp DEFAULT now() NOT NULL,
	"added_by" varchar
);
--> statement-breakpoint
CREATE TABLE "iam_roles" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"organization_id" varchar,
	"is_system" boolean DEFAULT false NOT NULL,
	"is_default" boolean DEFAULT false NOT NULL,
	"priority" integer DEFAULT 0 NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"created_by" varchar,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"updated_by" varchar
);
--> statement-breakpoint
CREATE TABLE "iam_team_members" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"team_id" varchar NOT NULL,
	"user_id" varchar NOT NULL,
	"is_lead" boolean DEFAULT false NOT NULL,
	"joined_at" timestamp DEFAULT now() NOT NULL,
	"added_by" varchar
);
--> statement-breakpoint
CREATE TABLE "iam_team_roles" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"team_id" varchar NOT NULL,
	"role_id" varchar NOT NULL,
	"assigned_at" timestamp DEFAULT now() NOT NULL,
	"assigned_by" varchar
);
--> statement-breakpoint
CREATE TABLE "iam_teams" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"organization_id" varchar,
	"parent_team_id" varchar,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"created_by" varchar,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"updated_by" varchar
);
--> statement-breakpoint
CREATE TABLE "iam_user_roles" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" varchar NOT NULL,
	"role_id" varchar NOT NULL,
	"organization_id" varchar,
	"assigned_at" timestamp DEFAULT now() NOT NULL,
	"assigned_by" varchar,
	"expires_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "next_best_action_records" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"contact_id" varchar,
	"account_id" varchar,
	"campaign_id" varchar,
	"action_type" varchar(50) NOT NULL,
	"action_channel" varchar(20),
	"action_description" text NOT NULL,
	"action_details" jsonb,
	"priority" varchar(20) NOT NULL,
	"expected_impact" varchar(255),
	"effort_level" varchar(20),
	"success_probability" numeric(5, 4),
	"contributing_factors" jsonb,
	"status" varchar(20) DEFAULT 'pending',
	"assigned_to" varchar,
	"completed_at" timestamp,
	"completion_notes" text,
	"outcome" varchar(50),
	"valid_from" timestamp DEFAULT now(),
	"valid_until" timestamp,
	"generated_by_analysis_id" varchar,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "research_analysis_records" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"entity_type" varchar(50) NOT NULL,
	"entity_id" varchar(255) NOT NULL,
	"campaign_id" varchar,
	"organization_id" varchar,
	"analysis_type" varchar(50) NOT NULL,
	"module_id" varchar(100) NOT NULL,
	"module_version" varchar(20) NOT NULL,
	"scoring_model_id" varchar(100),
	"scoring_model_version" varchar(20),
	"overall_score" integer,
	"score_tier" varchar(20),
	"score_components" jsonb,
	"score_factors" jsonb,
	"confidence_score" numeric(5, 4),
	"findings" jsonb,
	"findings_count" integer DEFAULT 0,
	"critical_findings_count" integer DEFAULT 0,
	"recommendations" jsonb,
	"recommendations_count" integer DEFAULT 0,
	"evidence" jsonb,
	"configuration_applied" jsonb,
	"execution_duration_ms" integer,
	"ai_model_used" varchar(100),
	"ai_tokens_used" integer,
	"data_sources_used" jsonb,
	"status" varchar(20) DEFAULT 'completed',
	"error_message" text,
	"triggered_by" varchar(50),
	"triggered_by_user_id" varchar,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "scoring_model_configurations" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"model_type" varchar(50) NOT NULL,
	"model_name" varchar(100) NOT NULL,
	"model_version" varchar(20) DEFAULT '1.0.0',
	"organization_id" varchar,
	"campaign_id" varchar,
	"is_default" boolean DEFAULT false,
	"weights" jsonb NOT NULL,
	"thresholds" jsonb NOT NULL,
	"normalization" varchar(20) DEFAULT 'linear',
	"custom_rules" jsonb,
	"description" text,
	"created_by" varchar,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"is_active" boolean DEFAULT true
);
--> statement-breakpoint
ALTER TABLE "account_health_scores" ADD CONSTRAINT "account_health_scores_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "account_health_scores" ADD CONSTRAINT "account_health_scores_campaign_id_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaigns"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "account_health_scores" ADD CONSTRAINT "account_health_scores_analysis_id_research_analysis_records_id_fk" FOREIGN KEY ("analysis_id") REFERENCES "public"."research_analysis_records"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_image_generation_jobs" ADD CONSTRAINT "ai_image_generation_jobs_requested_by_users_id_fk" FOREIGN KEY ("requested_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "email_builder_blocks" ADD CONSTRAINT "email_builder_blocks_template_id_email_builder_templates_id_fk" FOREIGN KEY ("template_id") REFERENCES "public"."email_builder_templates"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "email_builder_images" ADD CONSTRAINT "email_builder_images_uploaded_by_users_id_fk" FOREIGN KEY ("uploaded_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "email_builder_templates" ADD CONSTRAINT "email_builder_templates_brand_kit_id_brand_kits_id_fk" FOREIGN KEY ("brand_kit_id") REFERENCES "public"."brand_kits"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "email_builder_templates" ADD CONSTRAINT "email_builder_templates_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "email_generation_logs" ADD CONSTRAINT "email_generation_logs_campaign_id_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaigns"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "email_generation_logs" ADD CONSTRAINT "email_generation_logs_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "email_generation_logs" ADD CONSTRAINT "email_generation_logs_contact_id_contacts_id_fk" FOREIGN KEY ("contact_id") REFERENCES "public"."contacts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "engagement_analysis_records" ADD CONSTRAINT "engagement_analysis_records_contact_id_contacts_id_fk" FOREIGN KEY ("contact_id") REFERENCES "public"."contacts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "engagement_analysis_records" ADD CONSTRAINT "engagement_analysis_records_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "engagement_analysis_records" ADD CONSTRAINT "engagement_analysis_records_campaign_id_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaigns"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "engagement_analysis_records" ADD CONSTRAINT "engagement_analysis_records_analysis_id_research_analysis_records_id_fk" FOREIGN KEY ("analysis_id") REFERENCES "public"."research_analysis_records"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "iam_access_grants" ADD CONSTRAINT "iam_access_grants_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "iam_access_grants" ADD CONSTRAINT "iam_access_grants_team_id_iam_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."iam_teams"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "iam_access_grants" ADD CONSTRAINT "iam_access_grants_granted_by_users_id_fk" FOREIGN KEY ("granted_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "iam_access_requests" ADD CONSTRAINT "iam_access_requests_requester_id_users_id_fk" FOREIGN KEY ("requester_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "iam_access_requests" ADD CONSTRAINT "iam_access_requests_reviewer_id_users_id_fk" FOREIGN KEY ("reviewer_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "iam_access_requests" ADD CONSTRAINT "iam_access_requests_grant_id_iam_access_grants_id_fk" FOREIGN KEY ("grant_id") REFERENCES "public"."iam_access_grants"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "iam_audit_events" ADD CONSTRAINT "iam_audit_events_actor_id_users_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "iam_audit_events" ADD CONSTRAINT "iam_audit_events_target_user_id_users_id_fk" FOREIGN KEY ("target_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "iam_audit_events" ADD CONSTRAINT "iam_audit_events_target_team_id_iam_teams_id_fk" FOREIGN KEY ("target_team_id") REFERENCES "public"."iam_teams"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "iam_audit_events" ADD CONSTRAINT "iam_audit_events_organization_id_campaign_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."campaign_organizations"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "iam_entity_assignments" ADD CONSTRAINT "iam_entity_assignments_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "iam_entity_assignments" ADD CONSTRAINT "iam_entity_assignments_team_id_iam_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."iam_teams"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "iam_entity_assignments" ADD CONSTRAINT "iam_entity_assignments_assigned_by_users_id_fk" FOREIGN KEY ("assigned_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "iam_policies" ADD CONSTRAINT "iam_policies_organization_id_campaign_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."campaign_organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "iam_policies" ADD CONSTRAINT "iam_policies_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "iam_policies" ADD CONSTRAINT "iam_policies_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "iam_role_policies" ADD CONSTRAINT "iam_role_policies_role_id_iam_roles_id_fk" FOREIGN KEY ("role_id") REFERENCES "public"."iam_roles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "iam_role_policies" ADD CONSTRAINT "iam_role_policies_policy_id_iam_policies_id_fk" FOREIGN KEY ("policy_id") REFERENCES "public"."iam_policies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "iam_role_policies" ADD CONSTRAINT "iam_role_policies_added_by_users_id_fk" FOREIGN KEY ("added_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "iam_roles" ADD CONSTRAINT "iam_roles_organization_id_campaign_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."campaign_organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "iam_roles" ADD CONSTRAINT "iam_roles_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "iam_roles" ADD CONSTRAINT "iam_roles_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "iam_team_members" ADD CONSTRAINT "iam_team_members_team_id_iam_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."iam_teams"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "iam_team_members" ADD CONSTRAINT "iam_team_members_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "iam_team_members" ADD CONSTRAINT "iam_team_members_added_by_users_id_fk" FOREIGN KEY ("added_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "iam_team_roles" ADD CONSTRAINT "iam_team_roles_team_id_iam_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."iam_teams"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "iam_team_roles" ADD CONSTRAINT "iam_team_roles_role_id_iam_roles_id_fk" FOREIGN KEY ("role_id") REFERENCES "public"."iam_roles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "iam_team_roles" ADD CONSTRAINT "iam_team_roles_assigned_by_users_id_fk" FOREIGN KEY ("assigned_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "iam_teams" ADD CONSTRAINT "iam_teams_organization_id_campaign_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."campaign_organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "iam_teams" ADD CONSTRAINT "iam_teams_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "iam_teams" ADD CONSTRAINT "iam_teams_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "iam_user_roles" ADD CONSTRAINT "iam_user_roles_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "iam_user_roles" ADD CONSTRAINT "iam_user_roles_role_id_iam_roles_id_fk" FOREIGN KEY ("role_id") REFERENCES "public"."iam_roles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "iam_user_roles" ADD CONSTRAINT "iam_user_roles_organization_id_campaign_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."campaign_organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "iam_user_roles" ADD CONSTRAINT "iam_user_roles_assigned_by_users_id_fk" FOREIGN KEY ("assigned_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "next_best_action_records" ADD CONSTRAINT "next_best_action_records_contact_id_contacts_id_fk" FOREIGN KEY ("contact_id") REFERENCES "public"."contacts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "next_best_action_records" ADD CONSTRAINT "next_best_action_records_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "next_best_action_records" ADD CONSTRAINT "next_best_action_records_campaign_id_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaigns"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "next_best_action_records" ADD CONSTRAINT "next_best_action_records_assigned_to_users_id_fk" FOREIGN KEY ("assigned_to") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "next_best_action_records" ADD CONSTRAINT "next_best_action_records_generated_by_analysis_id_research_analysis_records_id_fk" FOREIGN KEY ("generated_by_analysis_id") REFERENCES "public"."research_analysis_records"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "research_analysis_records" ADD CONSTRAINT "research_analysis_records_campaign_id_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaigns"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "research_analysis_records" ADD CONSTRAINT "research_analysis_records_triggered_by_user_id_users_id_fk" FOREIGN KEY ("triggered_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scoring_model_configurations" ADD CONSTRAINT "scoring_model_configurations_campaign_id_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaigns"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scoring_model_configurations" ADD CONSTRAINT "scoring_model_configurations_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "account_health_account_idx" ON "account_health_scores" USING btree ("account_id");--> statement-breakpoint
CREATE INDEX "account_health_campaign_idx" ON "account_health_scores" USING btree ("campaign_id");--> statement-breakpoint
CREATE INDEX "account_health_score_idx" ON "account_health_scores" USING btree ("overall_health_score");--> statement-breakpoint
CREATE INDEX "account_health_status_idx" ON "account_health_scores" USING btree ("health_status");--> statement-breakpoint
CREATE INDEX "account_health_created_idx" ON "account_health_scores" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "ai_image_jobs_status_idx" ON "ai_image_generation_jobs" USING btree ("status");--> statement-breakpoint
CREATE INDEX "ai_image_jobs_requested_by_idx" ON "ai_image_generation_jobs" USING btree ("requested_by");--> statement-breakpoint
CREATE INDEX "ai_image_jobs_created_at_idx" ON "ai_image_generation_jobs" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "brand_kits_name_idx" ON "brand_kits" USING btree ("name");--> statement-breakpoint
CREATE INDEX "brand_kits_is_default_idx" ON "brand_kits" USING btree ("is_default");--> statement-breakpoint
CREATE INDEX "email_builder_blocks_template_idx" ON "email_builder_blocks" USING btree ("template_id");--> statement-breakpoint
CREATE INDEX "email_builder_blocks_sort_order_idx" ON "email_builder_blocks" USING btree ("sort_order");--> statement-breakpoint
CREATE INDEX "email_builder_blocks_type_idx" ON "email_builder_blocks" USING btree ("block_type");--> statement-breakpoint
CREATE INDEX "email_builder_images_source_idx" ON "email_builder_images" USING btree ("source");--> statement-breakpoint
CREATE INDEX "email_builder_images_uploaded_by_idx" ON "email_builder_images" USING btree ("uploaded_by");--> statement-breakpoint
CREATE INDEX "email_builder_images_tags_idx" ON "email_builder_images" USING btree ("tags");--> statement-breakpoint
CREATE INDEX "email_builder_templates_name_idx" ON "email_builder_templates" USING btree ("name");--> statement-breakpoint
CREATE INDEX "email_builder_templates_category_idx" ON "email_builder_templates" USING btree ("category");--> statement-breakpoint
CREATE INDEX "email_builder_templates_brand_kit_idx" ON "email_builder_templates" USING btree ("brand_kit_id");--> statement-breakpoint
CREATE INDEX "email_builder_templates_created_by_idx" ON "email_builder_templates" USING btree ("created_by");--> statement-breakpoint
CREATE INDEX "email_gen_request_id_idx" ON "email_generation_logs" USING btree ("request_id");--> statement-breakpoint
CREATE INDEX "email_gen_campaign_idx" ON "email_generation_logs" USING btree ("campaign_id");--> statement-breakpoint
CREATE INDEX "email_gen_account_idx" ON "email_generation_logs" USING btree ("account_id");--> statement-breakpoint
CREATE INDEX "email_gen_contact_idx" ON "email_generation_logs" USING btree ("contact_id");--> statement-breakpoint
CREATE INDEX "email_gen_provider_idx" ON "email_generation_logs" USING btree ("provider");--> statement-breakpoint
CREATE INDEX "email_gen_status_idx" ON "email_generation_logs" USING btree ("status");--> statement-breakpoint
CREATE INDEX "email_gen_type_idx" ON "email_generation_logs" USING btree ("generation_type");--> statement-breakpoint
CREATE INDEX "email_gen_source_idx" ON "email_generation_logs" USING btree ("request_source");--> statement-breakpoint
CREATE INDEX "email_gen_requested_at_idx" ON "email_generation_logs" USING btree ("requested_at");--> statement-breakpoint
CREATE INDEX "email_gen_cache_key_idx" ON "email_generation_logs" USING btree ("cache_key");--> statement-breakpoint
CREATE INDEX "engagement_contact_idx" ON "engagement_analysis_records" USING btree ("contact_id");--> statement-breakpoint
CREATE INDEX "engagement_account_idx" ON "engagement_analysis_records" USING btree ("account_id");--> statement-breakpoint
CREATE INDEX "engagement_campaign_idx" ON "engagement_analysis_records" USING btree ("campaign_id");--> statement-breakpoint
CREATE INDEX "engagement_period_idx" ON "engagement_analysis_records" USING btree ("analysis_period_start","analysis_period_end");--> statement-breakpoint
CREATE INDEX "engagement_score_idx" ON "engagement_analysis_records" USING btree ("overall_engagement_score");--> statement-breakpoint
CREATE INDEX "engagement_created_idx" ON "engagement_analysis_records" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "iam_access_grants_user_idx" ON "iam_access_grants" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "iam_access_grants_team_idx" ON "iam_access_grants" USING btree ("team_id");--> statement-breakpoint
CREATE INDEX "iam_access_grants_entity_idx" ON "iam_access_grants" USING btree ("entity_type","entity_id");--> statement-breakpoint
CREATE INDEX "iam_access_grants_active_idx" ON "iam_access_grants" USING btree ("is_active");--> statement-breakpoint
CREATE INDEX "iam_access_requests_requester_idx" ON "iam_access_requests" USING btree ("requester_id");--> statement-breakpoint
CREATE INDEX "iam_access_requests_status_idx" ON "iam_access_requests" USING btree ("status");--> statement-breakpoint
CREATE INDEX "iam_access_requests_reviewer_idx" ON "iam_access_requests" USING btree ("reviewer_id");--> statement-breakpoint
CREATE INDEX "iam_audit_events_actor_idx" ON "iam_audit_events" USING btree ("actor_id");--> statement-breakpoint
CREATE INDEX "iam_audit_events_action_idx" ON "iam_audit_events" USING btree ("action");--> statement-breakpoint
CREATE INDEX "iam_audit_events_entity_idx" ON "iam_audit_events" USING btree ("entity_type","entity_id");--> statement-breakpoint
CREATE INDEX "iam_audit_events_target_user_idx" ON "iam_audit_events" USING btree ("target_user_id");--> statement-breakpoint
CREATE INDEX "iam_audit_events_created_at_idx" ON "iam_audit_events" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "iam_audit_events_org_idx" ON "iam_audit_events" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "iam_entity_assignments_user_entity_idx" ON "iam_entity_assignments" USING btree ("user_id","entity_type","entity_id");--> statement-breakpoint
CREATE INDEX "iam_entity_assignments_team_entity_idx" ON "iam_entity_assignments" USING btree ("team_id","entity_type","entity_id");--> statement-breakpoint
CREATE INDEX "iam_entity_assignments_entity_idx" ON "iam_entity_assignments" USING btree ("entity_type","entity_id");--> statement-breakpoint
CREATE INDEX "iam_policies_entity_type_idx" ON "iam_policies" USING btree ("entity_type");--> statement-breakpoint
CREATE INDEX "iam_policies_org_idx" ON "iam_policies" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "iam_policies_active_idx" ON "iam_policies" USING btree ("is_active");--> statement-breakpoint
CREATE UNIQUE INDEX "iam_role_policies_role_policy_idx" ON "iam_role_policies" USING btree ("role_id","policy_id");--> statement-breakpoint
CREATE INDEX "iam_role_policies_role_idx" ON "iam_role_policies" USING btree ("role_id");--> statement-breakpoint
CREATE INDEX "iam_role_policies_policy_idx" ON "iam_role_policies" USING btree ("policy_id");--> statement-breakpoint
CREATE UNIQUE INDEX "iam_roles_name_org_idx" ON "iam_roles" USING btree ("name","organization_id");--> statement-breakpoint
CREATE INDEX "iam_roles_org_idx" ON "iam_roles" USING btree ("organization_id");--> statement-breakpoint
CREATE UNIQUE INDEX "iam_team_members_team_user_idx" ON "iam_team_members" USING btree ("team_id","user_id");--> statement-breakpoint
CREATE INDEX "iam_team_members_user_idx" ON "iam_team_members" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "iam_team_roles_team_role_idx" ON "iam_team_roles" USING btree ("team_id","role_id");--> statement-breakpoint
CREATE INDEX "iam_team_roles_team_idx" ON "iam_team_roles" USING btree ("team_id");--> statement-breakpoint
CREATE INDEX "iam_teams_org_idx" ON "iam_teams" USING btree ("organization_id");--> statement-breakpoint
CREATE UNIQUE INDEX "iam_teams_name_org_idx" ON "iam_teams" USING btree ("name","organization_id");--> statement-breakpoint
CREATE UNIQUE INDEX "iam_user_roles_user_role_org_idx" ON "iam_user_roles" USING btree ("user_id","role_id","organization_id");--> statement-breakpoint
CREATE INDEX "iam_user_roles_user_idx" ON "iam_user_roles" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "iam_user_roles_role_idx" ON "iam_user_roles" USING btree ("role_id");--> statement-breakpoint
CREATE INDEX "nba_contact_idx" ON "next_best_action_records" USING btree ("contact_id");--> statement-breakpoint
CREATE INDEX "nba_account_idx" ON "next_best_action_records" USING btree ("account_id");--> statement-breakpoint
CREATE INDEX "nba_campaign_idx" ON "next_best_action_records" USING btree ("campaign_id");--> statement-breakpoint
CREATE INDEX "nba_status_idx" ON "next_best_action_records" USING btree ("status");--> statement-breakpoint
CREATE INDEX "nba_priority_idx" ON "next_best_action_records" USING btree ("priority");--> statement-breakpoint
CREATE INDEX "nba_valid_idx" ON "next_best_action_records" USING btree ("valid_from","valid_until");--> statement-breakpoint
CREATE INDEX "research_analysis_entity_idx" ON "research_analysis_records" USING btree ("entity_type","entity_id");--> statement-breakpoint
CREATE INDEX "research_analysis_campaign_idx" ON "research_analysis_records" USING btree ("campaign_id");--> statement-breakpoint
CREATE INDEX "research_analysis_type_idx" ON "research_analysis_records" USING btree ("analysis_type");--> statement-breakpoint
CREATE INDEX "research_analysis_score_idx" ON "research_analysis_records" USING btree ("overall_score");--> statement-breakpoint
CREATE INDEX "research_analysis_created_idx" ON "research_analysis_records" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "scoring_model_type_idx" ON "scoring_model_configurations" USING btree ("model_type");--> statement-breakpoint
CREATE INDEX "scoring_model_org_idx" ON "scoring_model_configurations" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "scoring_model_campaign_idx" ON "scoring_model_configurations" USING btree ("campaign_id");