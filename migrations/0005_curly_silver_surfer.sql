CREATE TYPE "public"."admin_todo_task_status" AS ENUM('todo', 'in_progress', 'done');--> statement-breakpoint
CREATE TYPE "public"."client_campaign_plan_status" AS ENUM('generating', 'generated', 'approved', 'active', 'completed', 'archived');--> statement-breakpoint
CREATE TYPE "public"."client_journey_action_status" AS ENUM('scheduled', 'in_progress', 'completed', 'skipped', 'failed');--> statement-breakpoint
CREATE TYPE "public"."client_journey_action_type" AS ENUM('callback', 'email', 'sms', 'note', 'stage_change');--> statement-breakpoint
CREATE TYPE "public"."client_journey_lead_status" AS ENUM('active', 'paused', 'completed', 'lost');--> statement-breakpoint
CREATE TYPE "public"."client_journey_pipeline_status" AS ENUM('active', 'paused', 'archived');--> statement-breakpoint
CREATE TYPE "public"."data_quality_severity" AS ENUM('critical', 'high', 'medium', 'low', 'info');--> statement-breakpoint
CREATE TYPE "public"."data_request_status" AS ENUM('requested', 'in_progress', 'delivered', 'validated', 'rejected', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."data_source_type" AS ENUM('vendor', 'internal_enrichment', 'scraping', 'partner', 'client_provided', 'manual_entry', 'api_integration', 'public_data');--> statement-breakpoint
CREATE TYPE "public"."data_template_type" AS ENUM('contacts', 'accounts', 'leads', 'mixed', 'event_registrations', 'suppression_list');--> statement-breakpoint
CREATE TYPE "public"."data_upload_status" AS ENUM('pending', 'validating', 'processing', 'intelligence_running', 'completed', 'failed', 'partial');--> statement-breakpoint
CREATE TYPE "public"."unified_agent_type" AS ENUM('voice', 'email', 'strategy', 'compliance', 'data', 'research', 'content', 'pipeline');--> statement-breakpoint
ALTER TYPE "public"."organization_type" ADD VALUE 'campaign';--> statement-breakpoint
CREATE TABLE "admin_todo_board_notes" (
	"id" varchar PRIMARY KEY DEFAULT 'shared' NOT NULL,
	"content" text DEFAULT '' NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" varchar(255)
);
--> statement-breakpoint
CREATE TABLE "admin_todo_tasks" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"title" text NOT NULL,
	"status" "admin_todo_task_status" DEFAULT 'todo' NOT NULL,
	"assignee_name" varchar(120),
	"details" text,
	"needs_attention" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "call_session_events" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"call_session_id" varchar NOT NULL,
	"event_key" text NOT NULL,
	"event_ts" timestamp DEFAULT now() NOT NULL,
	"value_num" numeric(12, 3),
	"value_text" text,
	"metadata" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "client_campaign_plans" (
	"id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"client_account_id" varchar(36) NOT NULL,
	"created_by_user_id" varchar(36) NOT NULL,
	"name" text NOT NULL,
	"status" "client_campaign_plan_status" DEFAULT 'generating' NOT NULL,
	"campaign_goal" text,
	"target_budget" text,
	"preferred_channels" jsonb,
	"campaign_duration" text,
	"additional_context" text,
	"generated_plan" jsonb,
	"oi_snapshot_summary" text,
	"funnel_stage_count" integer,
	"channel_count" integer,
	"estimated_lead_volume" text,
	"ai_model" text,
	"thinking_content" text,
	"generation_duration_ms" integer,
	"approved_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "client_journey_actions" (
	"id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"journey_lead_id" varchar(36) NOT NULL,
	"pipeline_id" varchar(36) NOT NULL,
	"action_type" "client_journey_action_type" NOT NULL,
	"status" "client_journey_action_status" DEFAULT 'scheduled' NOT NULL,
	"scheduled_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"title" text,
	"description" text,
	"ai_generated_context" jsonb,
	"previous_activity_summary" text,
	"outcome" text,
	"outcome_details" jsonb,
	"result_disposition" text,
	"triggered_next_action" boolean DEFAULT false,
	"created_by" varchar(36),
	"completed_by" varchar(36),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "client_journey_leads" (
	"id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"pipeline_id" varchar(36) NOT NULL,
	"contact_id" varchar(36),
	"contact_name" text,
	"contact_email" text,
	"contact_phone" text,
	"company_name" text,
	"job_title" text,
	"source_call_session_id" varchar(36),
	"source_campaign_id" varchar(36),
	"source_disposition" text,
	"source_call_summary" text,
	"source_ai_analysis" jsonb,
	"current_stage_id" text NOT NULL,
	"current_stage_entered_at" timestamp with time zone DEFAULT now() NOT NULL,
	"status" "client_journey_lead_status" DEFAULT 'active' NOT NULL,
	"priority" integer DEFAULT 3 NOT NULL,
	"next_action_type" text,
	"next_action_at" timestamp with time zone,
	"last_activity_at" timestamp with time zone,
	"total_actions" integer DEFAULT 0 NOT NULL,
	"notes" text,
	"metadata" jsonb,
	"created_by" varchar(36),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "client_journey_pipelines" (
	"id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"client_account_id" varchar(36) NOT NULL,
	"campaign_id" varchar(36),
	"name" text NOT NULL,
	"description" text,
	"stages" jsonb NOT NULL,
	"auto_enroll_dispositions" jsonb,
	"status" "client_journey_pipeline_status" DEFAULT 'active' NOT NULL,
	"lead_count" integer DEFAULT 0 NOT NULL,
	"created_by" varchar(36),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "data_quality_issues" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"upload_id" varchar,
	"record_type" text NOT NULL,
	"record_id" varchar,
	"field_name" text,
	"issue_type" text NOT NULL,
	"severity" "data_quality_severity" DEFAULT 'medium' NOT NULL,
	"description" text NOT NULL,
	"current_value" text,
	"ai_recommendation" text,
	"ai_confidence" real,
	"suggested_value" text,
	"is_resolved" boolean DEFAULT false NOT NULL,
	"resolved_by" varchar,
	"resolved_at" timestamp,
	"resolution" text,
	"applied_value" text,
	"scan_batch_id" varchar,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "data_quality_scans" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"scan_type" text NOT NULL,
	"status" text DEFAULT 'running' NOT NULL,
	"upload_id" varchar,
	"project_id" varchar,
	"campaign_id" varchar,
	"total_records_scanned" integer DEFAULT 0,
	"issues_found" integer DEFAULT 0,
	"critical_issues" integer DEFAULT 0,
	"high_issues" integer DEFAULT 0,
	"medium_issues" integer DEFAULT 0,
	"low_issues" integer DEFAULT 0,
	"overall_health_score" integer,
	"completeness_score" integer,
	"accuracy_score" integer,
	"consistency_score" integer,
	"compliance_score" integer,
	"issue_breakdown" jsonb,
	"field_coverage" jsonb,
	"ai_recommendations" jsonb,
	"triggered_by" varchar,
	"started_at" timestamp DEFAULT now() NOT NULL,
	"completed_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "data_requests" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"request_type" text NOT NULL,
	"status" "data_request_status" DEFAULT 'requested' NOT NULL,
	"priority" text DEFAULT 'medium',
	"source_type" "data_source_type",
	"source_details" text,
	"project_id" varchar,
	"campaign_id" varchar,
	"client_name" text,
	"assigned_to" varchar,
	"requested_by" varchar NOT NULL,
	"target_record_count" integer,
	"delivered_record_count" integer,
	"data_specifications" jsonb,
	"quality_criteria" jsonb,
	"requested_at" timestamp DEFAULT now() NOT NULL,
	"started_at" timestamp,
	"delivered_at" timestamp,
	"validated_at" timestamp,
	"due_date" timestamp,
	"notes" text,
	"rejection_reason" text,
	"metadata" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "data_templates" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"template_type" "data_template_type" NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"is_default" boolean DEFAULT false NOT NULL,
	"mandatory_fields" jsonb NOT NULL,
	"optional_fields" jsonb,
	"field_validations" jsonb,
	"naming_conventions" jsonb,
	"industry_taxonomy" jsonb,
	"title_hierarchy" jsonb,
	"created_by" varchar,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "data_uploads" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"file_name" text NOT NULL,
	"file_size" integer,
	"mime_type" text,
	"storage_key" text,
	"status" "data_upload_status" DEFAULT 'pending' NOT NULL,
	"uploaded_by" varchar NOT NULL,
	"data_request_id" varchar,
	"project_id" varchar,
	"campaign_id" varchar,
	"template_id" varchar,
	"total_rows" integer,
	"valid_rows" integer,
	"invalid_rows" integer,
	"duplicate_rows" integer,
	"contacts_created" integer DEFAULT 0,
	"accounts_created" integer DEFAULT 0,
	"contacts_updated" integer DEFAULT 0,
	"accounts_updated" integer DEFAULT 0,
	"validation_results" jsonb,
	"quality_score" integer,
	"completeness_score" integer,
	"compliance_score" integer,
	"intelligence_results" jsonb,
	"icp_alignment_score" integer,
	"column_mapping" jsonb,
	"detected_schema" jsonb,
	"errors" jsonb,
	"warnings" jsonb,
	"processing_started_at" timestamp,
	"processing_completed_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "qa_compliance_review" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"conversation_id" varchar,
	"interaction_id" varchar,
	"campaign_id" varchar,
	"caller_id_verified" boolean,
	"purpose_stated_clearly" boolean,
	"consent_obtained" boolean,
	"dnc_status_checked" boolean,
	"pii_minimized" boolean,
	"recording_consent_obtained" boolean,
	"no_false_representations" boolean,
	"no_discriminatory_language" boolean,
	"professional_tone_maintained" boolean,
	"regulatory_zones" jsonb DEFAULT '{}'::jsonb,
	"gdpr_compliant" boolean,
	"tcpa_compliant" boolean,
	"pipedal_compliant" boolean,
	"overall_compliance_score" integer NOT NULL,
	"flagged_issues" jsonb DEFAULT '[]'::jsonb,
	"escalated_to_compliance" boolean,
	"compliance_team_review" text,
	"remediation_required" boolean,
	"remediation_notes" text,
	"reviewed_at" timestamp DEFAULT now() NOT NULL,
	"reviewed_by" varchar DEFAULT 'qa_agent' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "qa_conversation_analysis" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"conversation_id" varchar NOT NULL,
	"lead_id" varchar NOT NULL,
	"campaign_id" varchar,
	"conversation_type" text NOT NULL,
	"discovery_quality" integer NOT NULL,
	"engagement_quality" integer NOT NULL,
	"value_delivery_score" integer NOT NULL,
	"objection_handling_score" integer NOT NULL,
	"compliance_score" integer NOT NULL,
	"authenticity_score" integer NOT NULL,
	"overall_conversation_score" integer NOT NULL,
	"prospect_energy_maintained" boolean,
	"prospect_sentiment" text,
	"key_insights" jsonb DEFAULT '[]'::jsonb,
	"coaching_recommendations" text,
	"analysis_notes" text,
	"analyzed_at" timestamp DEFAULT now() NOT NULL,
	"analyzed_by" varchar DEFAULT 'qa_agent' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "qa_interaction_quality" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"interaction_id" varchar NOT NULL,
	"lead_id" varchar NOT NULL,
	"campaign_id" varchar,
	"interaction_type" text NOT NULL,
	"timeliness_score" integer NOT NULL,
	"relevance_score" integer NOT NULL,
	"appropriateness_score" integer NOT NULL,
	"engagement_effectiveness_score" integer NOT NULL,
	"overall_interaction_score" integer NOT NULL,
	"appropriate_channel" boolean,
	"prospect_responsive" text,
	"message_relevance" boolean,
	"next_action_triggered" text,
	"improprieties_found" jsonb DEFAULT '[]'::jsonb,
	"feedback_for_agent" text,
	"assessed_at" timestamp DEFAULT now() NOT NULL,
	"assessed_by" varchar DEFAULT 'qa_agent' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "qa_lead_quality_scores" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"lead_id" varchar NOT NULL,
	"campaign_id" varchar,
	"icp_score" integer NOT NULL,
	"engagement_potential_score" integer NOT NULL,
	"campaign_alignment_score" integer NOT NULL,
	"overall_quality_score" integer NOT NULL,
	"qualification" text NOT NULL,
	"confidence" integer NOT NULL,
	"recommended_action" text,
	"next_best_channel" text,
	"quality_summary" text,
	"improvement_opportunities" jsonb DEFAULT '[]'::jsonb,
	"assessed_at" timestamp DEFAULT now() NOT NULL,
	"assessed_by" varchar DEFAULT 'qa_agent' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "qa_performance_summary" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"agent_id" varchar,
	"campaign_id" varchar,
	"period_start" timestamp NOT NULL,
	"period_end" timestamp NOT NULL,
	"leads_assessed" integer DEFAULT 0 NOT NULL,
	"leads_qualified" integer DEFAULT 0 NOT NULL,
	"qualification_rate" numeric(5, 2),
	"avg_lead_quality_score" numeric(5, 2),
	"conversations_analyzed" integer DEFAULT 0 NOT NULL,
	"avg_conversation_score" numeric(5, 2),
	"interactions_reviewed" integer DEFAULT 0 NOT NULL,
	"avg_interaction_score" numeric(5, 2),
	"sequences_optimized" integer DEFAULT 0 NOT NULL,
	"avg_sequence_score" numeric(5, 2),
	"compliance_violations" integer DEFAULT 0 NOT NULL,
	"compliance_score" integer DEFAULT 100 NOT NULL,
	"win_rate" numeric(5, 2),
	"loss_rate" numeric(5, 2),
	"top_coaching_areas" jsonb DEFAULT '[]'::jsonb,
	"performance_trend" text,
	"key_findings_narrative" text,
	"recommendations_for_improvement" jsonb DEFAULT '[]'::jsonb,
	"generated_at" timestamp DEFAULT now() NOT NULL,
	"generated_by" varchar DEFAULT 'qa_agent' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "qa_touchpoint_sequence_quality" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"lead_id" varchar NOT NULL,
	"campaign_id" varchar,
	"total_touches" integer NOT NULL,
	"touchpoint_sequence" jsonb NOT NULL,
	"voice_touch_count" integer NOT NULL,
	"email_touch_count" integer NOT NULL,
	"content_touch_count" integer NOT NULL,
	"other_touch_count" integer NOT NULL,
	"frequency_per_week" numeric(4, 2),
	"coherence_score" integer NOT NULL,
	"timing_optimization_score" integer NOT NULL,
	"channel_mix_score" integer NOT NULL,
	"adaptive_quality_score" integer NOT NULL,
	"overall_sequence_score" integer NOT NULL,
	"red_flags" jsonb DEFAULT '[]'::jsonb,
	"optimization_opportunities" jsonb DEFAULT '[]'::jsonb,
	"recommended_sequence_adjustments" text,
	"assessed_at" timestamp DEFAULT now() NOT NULL,
	"assessed_by" varchar DEFAULT 'qa_agent' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "unified_agent_capabilities" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"agent_id" varchar NOT NULL,
	"capability_id" varchar NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"category" varchar NOT NULL,
	"performance_score" real DEFAULT 0 NOT NULL,
	"trend" varchar DEFAULT 'stable' NOT NULL,
	"learning_input_sources" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"last_optimized" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "unified_agent_capability_mappings" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"agent_id" varchar NOT NULL,
	"capability_id" varchar NOT NULL,
	"prompt_section_id" varchar NOT NULL,
	"confidence" real DEFAULT 1 NOT NULL,
	"requires_approval" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "unified_agent_learning_data" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"agent_id" varchar NOT NULL,
	"source_type" varchar NOT NULL,
	"metrics" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"insights" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"sample_size" integer DEFAULT 0 NOT NULL,
	"time_range_start" timestamp,
	"time_range_end" timestamp,
	"analysis_id" varchar,
	"findings" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "unified_agent_prompt_changes" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"section_pk" varchar NOT NULL,
	"version_hash" varchar NOT NULL,
	"previous_content" text,
	"new_content" text NOT NULL,
	"changed_by" varchar NOT NULL,
	"change_reason" text,
	"source" varchar DEFAULT 'manual' NOT NULL,
	"recommendation_id" varchar,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "unified_agent_prompt_sections" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"agent_id" varchar NOT NULL,
	"section_id" varchar NOT NULL,
	"name" text NOT NULL,
	"section_number" integer NOT NULL,
	"category" varchar NOT NULL,
	"content" text NOT NULL,
	"is_required" boolean DEFAULT true NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"version_hash" varchar,
	"last_updated" timestamp DEFAULT now() NOT NULL,
	"last_updated_by" varchar DEFAULT 'system' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "unified_agent_recommendations" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"agent_id" varchar NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"category" varchar NOT NULL,
	"priority_score" integer DEFAULT 50 NOT NULL,
	"status" varchar DEFAULT 'pending' NOT NULL,
	"capability_id" varchar,
	"target_prompt_section_id" varchar,
	"evidence" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"proposed_change" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"impact" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"reviewed_at" timestamp,
	"reviewed_by" varchar,
	"review_notes" text,
	"applied_version" varchar,
	"expires_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "unified_agent_versions" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"agent_id" varchar NOT NULL,
	"version" varchar NOT NULL,
	"hash" varchar NOT NULL,
	"prompt_sections_snapshot" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"configuration_snapshot" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"changelog" text,
	"deployed_by" varchar DEFAULT 'system' NOT NULL,
	"rollback_available" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "unified_agents" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"agent_type" "unified_agent_type" NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"channel" varchar NOT NULL,
	"status" varchar DEFAULT 'active' NOT NULL,
	"current_version" varchar DEFAULT '1.0.0' NOT NULL,
	"current_hash" varchar,
	"configuration" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"performance_snapshot" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"deployed_at" timestamp DEFAULT now() NOT NULL,
	"deployed_by" varchar DEFAULT 'system' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "unified_agents_agent_type_unique" UNIQUE("agent_type")
);
--> statement-breakpoint
ALTER TABLE "campaigns" ALTER COLUMN "max_call_duration_seconds" SET DEFAULT 300;--> statement-breakpoint
ALTER TABLE "smtp_providers" ALTER COLUMN "hourly_send_limit" SET DEFAULT 25;--> statement-breakpoint
ALTER TABLE "agent_defaults" ADD COLUMN "default_call_engine" text DEFAULT 'texml' NOT NULL;--> statement-breakpoint
ALTER TABLE "campaign_account_problems" ADD COLUMN "department_intelligence" jsonb DEFAULT '{}';--> statement-breakpoint
ALTER TABLE "campaign_organizations" ADD COLUMN "is_campaign_org" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "campaigns" ADD COLUMN "timezone_priority_config" jsonb;--> statement-breakpoint
ALTER TABLE "contacts" ADD COLUMN "dialing_phone_e164" text;--> statement-breakpoint
ALTER TABLE "mercury_invitation_tokens" ADD COLUMN "token_hash" varchar;--> statement-breakpoint
ALTER TABLE "mercury_invitation_tokens" ADD COLUMN "revoked_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "mercury_invitation_tokens" ADD COLUMN "revoked_by" varchar;--> statement-breakpoint
ALTER TABLE "mercury_invitation_tokens" ADD COLUMN "replaced_by_token_id" varchar;--> statement-breakpoint
ALTER TABLE "organization_service_catalog" ADD COLUMN "target_departments" text[] DEFAULT '{}';--> statement-breakpoint
ALTER TABLE "problem_definitions" ADD COLUMN "target_departments" text[] DEFAULT '{}';--> statement-breakpoint
ALTER TABLE "work_orders" ADD COLUMN "wo_qa_status" text;--> statement-breakpoint
ALTER TABLE "call_session_events" ADD CONSTRAINT "call_session_events_call_session_id_call_sessions_id_fk" FOREIGN KEY ("call_session_id") REFERENCES "public"."call_sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "qa_compliance_review" ADD CONSTRAINT "qa_compliance_review_campaign_id_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaigns"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "qa_conversation_analysis" ADD CONSTRAINT "qa_conversation_analysis_lead_id_leads_id_fk" FOREIGN KEY ("lead_id") REFERENCES "public"."leads"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "qa_conversation_analysis" ADD CONSTRAINT "qa_conversation_analysis_campaign_id_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaigns"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "qa_interaction_quality" ADD CONSTRAINT "qa_interaction_quality_lead_id_leads_id_fk" FOREIGN KEY ("lead_id") REFERENCES "public"."leads"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "qa_interaction_quality" ADD CONSTRAINT "qa_interaction_quality_campaign_id_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaigns"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "qa_lead_quality_scores" ADD CONSTRAINT "qa_lead_quality_scores_lead_id_leads_id_fk" FOREIGN KEY ("lead_id") REFERENCES "public"."leads"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "qa_lead_quality_scores" ADD CONSTRAINT "qa_lead_quality_scores_campaign_id_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaigns"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "qa_performance_summary" ADD CONSTRAINT "qa_performance_summary_agent_id_virtual_agents_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."virtual_agents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "qa_performance_summary" ADD CONSTRAINT "qa_performance_summary_campaign_id_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaigns"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "qa_touchpoint_sequence_quality" ADD CONSTRAINT "qa_touchpoint_sequence_quality_lead_id_leads_id_fk" FOREIGN KEY ("lead_id") REFERENCES "public"."leads"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "qa_touchpoint_sequence_quality" ADD CONSTRAINT "qa_touchpoint_sequence_quality_campaign_id_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaigns"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "unified_agent_capabilities" ADD CONSTRAINT "unified_agent_capabilities_agent_id_unified_agents_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."unified_agents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "unified_agent_capability_mappings" ADD CONSTRAINT "unified_agent_capability_mappings_agent_id_unified_agents_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."unified_agents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "unified_agent_learning_data" ADD CONSTRAINT "unified_agent_learning_data_agent_id_unified_agents_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."unified_agents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "unified_agent_prompt_changes" ADD CONSTRAINT "unified_agent_prompt_changes_section_pk_unified_agent_prompt_sections_id_fk" FOREIGN KEY ("section_pk") REFERENCES "public"."unified_agent_prompt_sections"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "unified_agent_prompt_sections" ADD CONSTRAINT "unified_agent_prompt_sections_agent_id_unified_agents_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."unified_agents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "unified_agent_recommendations" ADD CONSTRAINT "unified_agent_recommendations_agent_id_unified_agents_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."unified_agents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "unified_agent_versions" ADD CONSTRAINT "unified_agent_versions_agent_id_unified_agents_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."unified_agents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "admin_todo_tasks_status_idx" ON "admin_todo_tasks" USING btree ("status");--> statement-breakpoint
CREATE INDEX "admin_todo_tasks_created_at_idx" ON "admin_todo_tasks" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "call_session_events_call_session_idx" ON "call_session_events" USING btree ("call_session_id");--> statement-breakpoint
CREATE INDEX "call_session_events_event_key_idx" ON "call_session_events" USING btree ("event_key");--> statement-breakpoint
CREATE INDEX "call_session_events_event_ts_idx" ON "call_session_events" USING btree ("event_ts");--> statement-breakpoint
CREATE INDEX "ccp_client_account_idx" ON "client_campaign_plans" USING btree ("client_account_id");--> statement-breakpoint
CREATE INDEX "ccp_status_idx" ON "client_campaign_plans" USING btree ("status");--> statement-breakpoint
CREATE INDEX "ccp_created_at_idx" ON "client_campaign_plans" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "cja_journey_lead_idx" ON "client_journey_actions" USING btree ("journey_lead_id");--> statement-breakpoint
CREATE INDEX "cja_pipeline_idx" ON "client_journey_actions" USING btree ("pipeline_id");--> statement-breakpoint
CREATE INDEX "cja_status_idx" ON "client_journey_actions" USING btree ("status");--> statement-breakpoint
CREATE INDEX "cja_scheduled_at_idx" ON "client_journey_actions" USING btree ("scheduled_at");--> statement-breakpoint
CREATE INDEX "cja_action_type_idx" ON "client_journey_actions" USING btree ("action_type");--> statement-breakpoint
CREATE INDEX "cjl_pipeline_idx" ON "client_journey_leads" USING btree ("pipeline_id");--> statement-breakpoint
CREATE INDEX "cjl_contact_idx" ON "client_journey_leads" USING btree ("contact_id");--> statement-breakpoint
CREATE INDEX "cjl_status_idx" ON "client_journey_leads" USING btree ("status");--> statement-breakpoint
CREATE INDEX "cjl_stage_idx" ON "client_journey_leads" USING btree ("current_stage_id");--> statement-breakpoint
CREATE INDEX "cjl_next_action_idx" ON "client_journey_leads" USING btree ("next_action_at");--> statement-breakpoint
CREATE INDEX "cjl_priority_idx" ON "client_journey_leads" USING btree ("priority");--> statement-breakpoint
CREATE INDEX "cjp_client_account_idx" ON "client_journey_pipelines" USING btree ("client_account_id");--> statement-breakpoint
CREATE INDEX "cjp_status_idx" ON "client_journey_pipelines" USING btree ("status");--> statement-breakpoint
CREATE INDEX "cjp_campaign_idx" ON "client_journey_pipelines" USING btree ("campaign_id");--> statement-breakpoint
CREATE INDEX "dq_issues_upload_idx" ON "data_quality_issues" USING btree ("upload_id");--> statement-breakpoint
CREATE INDEX "dq_issues_type_idx" ON "data_quality_issues" USING btree ("issue_type");--> statement-breakpoint
CREATE INDEX "dq_issues_severity_idx" ON "data_quality_issues" USING btree ("severity");--> statement-breakpoint
CREATE INDEX "dq_issues_resolved_idx" ON "data_quality_issues" USING btree ("is_resolved");--> statement-breakpoint
CREATE INDEX "dq_issues_record_idx" ON "data_quality_issues" USING btree ("record_type","record_id");--> statement-breakpoint
CREATE INDEX "dq_scans_status_idx" ON "data_quality_scans" USING btree ("status");--> statement-breakpoint
CREATE INDEX "dq_scans_upload_idx" ON "data_quality_scans" USING btree ("upload_id");--> statement-breakpoint
CREATE INDEX "data_requests_status_idx" ON "data_requests" USING btree ("status");--> statement-breakpoint
CREATE INDEX "data_requests_assigned_idx" ON "data_requests" USING btree ("assigned_to");--> statement-breakpoint
CREATE INDEX "data_requests_project_idx" ON "data_requests" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "data_requests_campaign_idx" ON "data_requests" USING btree ("campaign_id");--> statement-breakpoint
CREATE INDEX "data_uploads_status_idx" ON "data_uploads" USING btree ("status");--> statement-breakpoint
CREATE INDEX "data_uploads_uploader_idx" ON "data_uploads" USING btree ("uploaded_by");--> statement-breakpoint
CREATE INDEX "data_uploads_request_idx" ON "data_uploads" USING btree ("data_request_id");--> statement-breakpoint
ALTER TABLE "mercury_invitation_tokens" ADD CONSTRAINT "mercury_invitation_tokens_revoked_by_users_id_fk" FOREIGN KEY ("revoked_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "contacts_dialing_phone_idx" ON "contacts" USING btree ("dialing_phone_e164");--> statement-breakpoint
CREATE UNIQUE INDEX "mercury_invite_token_hash_idx" ON "mercury_invitation_tokens" USING btree ("token_hash");--> statement-breakpoint
CREATE INDEX "mercury_invite_revoked_idx" ON "mercury_invitation_tokens" USING btree ("revoked_at");--> statement-breakpoint
ALTER TABLE "work_orders" DROP COLUMN "qa_status";