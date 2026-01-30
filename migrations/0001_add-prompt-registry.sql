CREATE TYPE "public"."activity_cost_type" AS ENUM('lead_delivered', 'contact_verified', 'ai_call_minute', 'email_sent', 'sms_sent', 'retainer_fee', 'setup_fee', 'adjustment', 'credit');--> statement-breakpoint
CREATE TYPE "public"."agent_type" AS ENUM('human', 'ai');--> statement-breakpoint
CREATE TYPE "public"."ai_confidence_level" AS ENUM('high', 'medium', 'low');--> statement-breakpoint
CREATE TYPE "public"."ai_handoff_trigger" AS ENUM('decision_maker_reached', 'explicit_request', 'complex_objection', 'pricing_discussion', 'technical_question', 'angry_prospect');--> statement-breakpoint
CREATE TYPE "public"."ai_intent_status" AS ENUM('processing', 'needs_review', 'approved', 'rejected', 'created');--> statement-breakpoint
CREATE TYPE "public"."ai_voice" AS ENUM('alloy', 'echo', 'fable', 'onyx', 'nova', 'shimmer', 'Puck', 'Charon', 'Kore', 'Fenrir', 'Aoede', 'Orion', 'Vega', 'Pegasus', 'Ursa', 'Dipper', 'Capella', 'Orbit', 'Lyra', 'Eclipse');--> statement-breakpoint
CREATE TYPE "public"."billing_model_type" AS ENUM('cpl', 'cpc', 'monthly_retainer', 'hybrid');--> statement-breakpoint
CREATE TYPE "public"."blacklist_status" AS ENUM('clean', 'listed', 'pending_check');--> statement-breakpoint
CREATE TYPE "public"."buying_committee_role" AS ENUM('champion', 'blocker', 'evaluator', 'budget_holder', 'end_user');--> statement-breakpoint
CREATE TYPE "public"."campaign_contact_state" AS ENUM('eligible', 'locked', 'waiting_retry', 'qualified', 'removed');--> statement-breakpoint
CREATE TYPE "public"."canonical_disposition" AS ENUM('qualified_lead', 'not_interested', 'do_not_call', 'voicemail', 'no_answer', 'invalid_data', 'needs_review');--> statement-breakpoint
CREATE TYPE "public"."channel_generation_status" AS ENUM('not_configured', 'pending', 'generating', 'generated', 'approved', 'failed');--> statement-breakpoint
CREATE TYPE "public"."channel_type" AS ENUM('email', 'voice');--> statement-breakpoint
CREATE TYPE "public"."channel_variant_status" AS ENUM('draft', 'pending_review', 'approved', 'active', 'paused');--> statement-breakpoint
CREATE TYPE "public"."client_portal_order_status" AS ENUM('draft', 'submitted', 'approved', 'in_fulfillment', 'completed', 'rejected', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."client_project_status" AS ENUM('draft', 'pending', 'active', 'paused', 'completed', 'archived');--> statement-breakpoint
CREATE TYPE "public"."client_relationship_type" AS ENUM('managed', 'partner', 'reseller');--> statement-breakpoint
CREATE TYPE "public"."contract_type" AS ENUM('retainer', 'one_time', 'subscription', 'per_project');--> statement-breakpoint
CREATE TYPE "public"."deal_activity_type" AS ENUM('email_received', 'email_sent', 'meeting_scheduled', 'meeting_completed', 'call_completed', 'note_added', 'document_shared', 'proposal_sent', 'contract_sent', 'stage_changed', 'score_updated', 'lead_captured');--> statement-breakpoint
CREATE TYPE "public"."deal_insight_type" AS ENUM('sentiment', 'intent', 'urgency', 'next_action', 'stage_recommendation', 'risk_flag');--> statement-breakpoint
CREATE TYPE "public"."decision_authority" AS ENUM('decision_maker', 'influencer', 'user', 'gatekeeper');--> statement-breakpoint
CREATE TYPE "public"."delivery_method" AS ENUM('api', 'csv', 'realtime_push', 'sftp', 'email');--> statement-breakpoint
CREATE TYPE "public"."delivery_status" AS ENUM('pending', 'processing', 'delivered', 'failed', 'expired');--> statement-breakpoint
CREATE TYPE "public"."demand_agent_type" AS ENUM('demand_intel', 'demand_qual', 'demand_engage');--> statement-breakpoint
CREATE TYPE "public"."dialer_run_status" AS ENUM('pending', 'active', 'paused', 'completed', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."dialer_run_type" AS ENUM('manual_dial', 'power_dial');--> statement-breakpoint
CREATE TYPE "public"."domain_purpose" AS ENUM('marketing', 'transactional', 'both');--> statement-breakpoint
CREATE TYPE "public"."email_direction" AS ENUM('inbound', 'outbound');--> statement-breakpoint
CREATE TYPE "public"."email_risk_level" AS ENUM('low', 'medium', 'high', 'unknown');--> statement-breakpoint
CREATE TYPE "public"."email_sequence_status" AS ENUM('active', 'paused', 'archived');--> statement-breakpoint
CREATE TYPE "public"."email_suppression_reason" AS ENUM('hard_bounce', 'unsubscribe', 'spam_complaint', 'manual');--> statement-breakpoint
CREATE TYPE "public"."email_template_type" AS ENUM('subject', 'preheader', 'greeting', 'body_intro', 'value_proposition', 'call_to_action', 'closing', 'signature');--> statement-breakpoint
CREATE TYPE "public"."email_validation_provider" AS ENUM('kickbox');--> statement-breakpoint
CREATE TYPE "public"."enrichment_job_status" AS ENUM('pending', 'processing', 'completed', 'failed', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."enrollment_status" AS ENUM('active', 'paused', 'completed', 'stopped');--> statement-breakpoint
CREATE TYPE "public"."enrollment_stop_reason" AS ENUM('replied', 'unsubscribed', 'manual', 'bounced', 'completed', 'error');--> statement-breakpoint
CREATE TYPE "public"."goal_type" AS ENUM('qualified_leads', 'accepted_leads', 'call_volume', 'conversion_rate', 'custom');--> statement-breakpoint
CREATE TYPE "public"."governance_action" AS ENUM('qc_review', 'auto_suppress', 'global_dnc', 'recycle', 'data_quality_flag', 'downstream_sales', 'remove_from_campaign', 'escalate');--> statement-breakpoint
CREATE TYPE "public"."handoff_stage" AS ENUM('ai_initial', 'ai_qualifying', 'ai_handoff', 'human_takeover', 'human_direct', 'ai_complete');--> statement-breakpoint
CREATE TYPE "public"."industry_level" AS ENUM('sector', 'industry', 'sub_industry');--> statement-breakpoint
CREATE TYPE "public"."insight_scope" AS ENUM('global', 'organization', 'campaign');--> statement-breakpoint
CREATE TYPE "public"."insight_status" AS ENUM('active', 'acknowledged', 'dismissed', 'expired');--> statement-breakpoint
CREATE TYPE "public"."insight_type" AS ENUM('role_pattern', 'industry_pattern', 'objection_pattern', 'approach_pattern', 'messaging_pattern');--> statement-breakpoint
CREATE TYPE "public"."invoice_status" AS ENUM('draft', 'pending', 'sent', 'paid', 'overdue', 'void', 'disputed');--> statement-breakpoint
CREATE TYPE "public"."knowledge_block_category" AS ENUM('universal', 'voice_control', 'organization', 'campaign', 'custom');--> statement-breakpoint
CREATE TYPE "public"."knowledge_block_layer" AS ENUM('layer_1_universal', 'layer_2_organization', 'layer_3_campaign');--> statement-breakpoint
CREATE TYPE "public"."knowledge_category" AS ENUM('compliance', 'gatekeeper_handling', 'voicemail_detection', 'call_dispositioning', 'call_quality', 'conversation_flow', 'dos_and_donts', 'objection_handling', 'tone_and_pacing', 'identity_verification', 'call_control', 'learning_rules');--> statement-breakpoint
CREATE TYPE "public"."lead_delivery_source" AS ENUM('auto_webhook', 'manual');--> statement-breakpoint
CREATE TYPE "public"."lead_form_type" AS ENUM('ebook_download', 'whitepaper_download', 'infographic_download', 'case_study_download', 'proposal_request', 'demo_request', 'contact_form', 'linkedin_engagement', 'webinar_registration');--> statement-breakpoint
CREATE TYPE "public"."lead_verification_status" AS ENUM('pending', 'pending_ai', 'ai_verified', 'verified_approved', 'flagged_review', 'rejected');--> statement-breakpoint
CREATE TYPE "public"."lead_verification_type" AS ENUM('linkedin_verified', 'oncall_confirmed');--> statement-breakpoint
CREATE TYPE "public"."m365_activity_direction" AS ENUM('inbound', 'outbound');--> statement-breakpoint
CREATE TYPE "public"."m365_activity_type" AS ENUM('email', 'meeting', 'call');--> statement-breakpoint
CREATE TYPE "public"."message_status" AS ENUM('pending', 'sent', 'delivered', 'read', 'replied', 'failed');--> statement-breakpoint
CREATE TYPE "public"."org_intelligence_mode" AS ENUM('use_existing', 'fresh_research', 'none');--> statement-breakpoint
CREATE TYPE "public"."organization_member_role" AS ENUM('owner', 'admin', 'member');--> statement-breakpoint
CREATE TYPE "public"."organization_type" AS ENUM('super', 'client');--> statement-breakpoint
CREATE TYPE "public"."outreach_approach" AS ENUM('exploratory', 'consultative', 'direct', 'educational');--> statement-breakpoint
CREATE TYPE "public"."partnership_type" AS ENUM('publisher', 'data_provider', 'syndication_network', 'media_buyer');--> statement-breakpoint
CREATE TYPE "public"."period_status" AS ENUM('upcoming', 'active', 'completed', 'archived');--> statement-breakpoint
CREATE TYPE "public"."pipeline_category" AS ENUM('media_partnership', 'direct_sales');--> statement-breakpoint
CREATE TYPE "public"."pipeline_opportunity_status" AS ENUM('open', 'won', 'lost', 'on_hold');--> statement-breakpoint
CREATE TYPE "public"."pipeline_type" AS ENUM('revenue', 'expansion', 'agency');--> statement-breakpoint
CREATE TYPE "public"."preview_content_type" AS ENUM('email', 'call_plan', 'prompt', 'call_brief', 'participant_plan');--> statement-breakpoint
CREATE TYPE "public"."preview_session_status" AS ENUM('active', 'completed', 'error');--> statement-breakpoint
CREATE TYPE "public"."preview_session_type" AS ENUM('context', 'email', 'call_plan', 'simulation');--> statement-breakpoint
CREATE TYPE "public"."preview_transcript_role" AS ENUM('user', 'assistant', 'system');--> statement-breakpoint
CREATE TYPE "public"."pricing_model" AS ENUM('cpl', 'cpc', 'hybrid', 'flat_fee');--> statement-breakpoint
CREATE TYPE "public"."problem_category" AS ENUM('efficiency', 'growth', 'risk', 'cost', 'compliance', 'innovation');--> statement-breakpoint
CREATE TYPE "public"."problem_severity" AS ENUM('high', 'medium', 'low');--> statement-breakpoint
CREATE TYPE "public"."project_type" AS ENUM('call_campaign', 'email_campaign', 'data_enrichment', 'verification', 'combo', 'custom');--> statement-breakpoint
CREATE TYPE "public"."prompt_category" AS ENUM('voice', 'email', 'intelligence', 'compliance', 'system');--> statement-breakpoint
CREATE TYPE "public"."prompt_perspective" AS ENUM('consultative', 'direct_value', 'pain_point', 'social_proof', 'educational', 'urgent', 'relationship');--> statement-breakpoint
CREATE TYPE "public"."prompt_scope" AS ENUM('global', 'organization', 'campaign', 'agent_type');--> statement-breakpoint
CREATE TYPE "public"."prompt_type" AS ENUM('foundational', 'system', 'specialized', 'template');--> statement-breakpoint
CREATE TYPE "public"."qa_content_type" AS ENUM('simulation', 'mock_call', 'report', 'data_export');--> statement-breakpoint
CREATE TYPE "public"."qc_review_status" AS ENUM('pending', 'in_review', 'approved', 'rejected', 'escalated', 'returned');--> statement-breakpoint
CREATE TYPE "public"."quality_tier" AS ENUM('verified', 'unverified', 'data_append', 'premium');--> statement-breakpoint
CREATE TYPE "public"."queue_target_agent_type" AS ENUM('human', 'ai', 'any');--> statement-breakpoint
CREATE TYPE "public"."recording_status" AS ENUM('pending', 'recording', 'uploading', 'stored', 'failed');--> statement-breakpoint
CREATE TYPE "public"."recycle_status" AS ENUM('scheduled', 'eligible', 'processing', 'completed', 'expired', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."role_adjacency_type" AS ENUM('equivalent', 'senior_to', 'junior_to', 'collaborates_with', 'reports_to', 'manages');--> statement-breakpoint
CREATE TYPE "public"."seniority_level" AS ENUM('executive', 'vp', 'director', 'manager', 'ic', 'unknown');--> statement-breakpoint
CREATE TYPE "public"."sequence_email_status" AS ENUM('scheduled', 'sending', 'sent', 'delivered', 'opened', 'clicked', 'replied', 'bounced', 'failed');--> statement-breakpoint
CREATE TYPE "public"."sequence_step_status" AS ENUM('active', 'paused');--> statement-breakpoint
CREATE TYPE "public"."service_category" AS ENUM('platform', 'consulting', 'integration', 'managed_service', 'data', 'other');--> statement-breakpoint
CREATE TYPE "public"."smtp_auth_type" AS ENUM('oauth2', 'basic', 'app_password');--> statement-breakpoint
CREATE TYPE "public"."smtp_provider_type" AS ENUM('gmail', 'outlook', 'custom');--> statement-breakpoint
CREATE TYPE "public"."smtp_verification_status" AS ENUM('pending', 'verifying', 'verified', 'failed');--> statement-breakpoint
CREATE TYPE "public"."stage_transition_reason" AS ENUM('manual', 'ai_suggested', 'ai_automatic', 'workflow_rule', 'system');--> statement-breakpoint
CREATE TYPE "public"."template_scope" AS ENUM('campaign', 'account', 'contact');--> statement-breakpoint
CREATE TYPE "public"."test_call_status" AS ENUM('pending', 'in_progress', 'completed', 'failed');--> statement-breakpoint
CREATE TYPE "public"."title_mapping_source" AS ENUM('manual', 'ai', 'system', 'imported');--> statement-breakpoint
CREATE TYPE "public"."transactional_event_type" AS ENUM('welcome', 'password_reset', 'password_changed', 'account_verification', 'account_updated', 'notification', 'lead_alert', 'campaign_completed', 'report_ready', 'invoice', 'subscription_expiring', 'two_factor_code');--> statement-breakpoint
CREATE TYPE "public"."upload_job_type" AS ENUM('validation_results', 'submissions', 'contacts');--> statement-breakpoint
CREATE TYPE "public"."vector_document_type" AS ENUM('account', 'contact', 'call', 'knowledge', 'campaign');--> statement-breakpoint
CREATE TYPE "public"."voice_command_intent" AS ENUM('navigation', 'query', 'action', 'report', 'unknown');--> statement-breakpoint
CREATE TYPE "public"."voice_provider" AS ENUM('openai', 'google');--> statement-breakpoint
CREATE TYPE "public"."voice_template_type" AS ENUM('opening', 'gatekeeper', 'pitch', 'objection_handling', 'closing', 'voicemail');--> statement-breakpoint
CREATE TYPE "public"."warmup_phase" AS ENUM('not_started', 'phase_1', 'phase_2', 'phase_3', 'completed', 'paused');--> statement-breakpoint
CREATE TYPE "public"."workflow_stage" AS ENUM('eligibility_check', 'email_validation', 'address_enrichment', 'phone_enrichment', 'completed');--> statement-breakpoint
CREATE TYPE "public"."workflow_status" AS ENUM('pending', 'processing', 'completed', 'failed', 'paused');--> statement-breakpoint
ALTER TYPE "public"."activity_event_type" ADD VALUE 'quick_linkedin_lookup';--> statement-breakpoint
ALTER TYPE "public"."activity_event_type" ADD VALUE 'lead_verification_linkedin';--> statement-breakpoint
ALTER TYPE "public"."activity_event_type" ADD VALUE 'lead_verification_oncall';--> statement-breakpoint
ALTER TYPE "public"."activity_event_type" ADD VALUE 'lead_created';--> statement-breakpoint
ALTER TYPE "public"."activity_event_type" ADD VALUE 'lead_qualified';--> statement-breakpoint
ALTER TYPE "public"."activity_event_type" ADD VALUE 'lead_rejected';--> statement-breakpoint
ALTER TYPE "public"."activity_event_type" ADD VALUE 'transcription_started';--> statement-breakpoint
ALTER TYPE "public"."activity_event_type" ADD VALUE 'transcription_completed';--> statement-breakpoint
ALTER TYPE "public"."activity_event_type" ADD VALUE 'transcription_failed';--> statement-breakpoint
ALTER TYPE "public"."activity_event_type" ADD VALUE 'voicemail_detected';--> statement-breakpoint
ALTER TYPE "public"."activity_event_type" ADD VALUE 'amd_human_detected';--> statement-breakpoint
ALTER TYPE "public"."activity_event_type" ADD VALUE 'amd_machine_detected';--> statement-breakpoint
ALTER TYPE "public"."activity_event_type" ADD VALUE 'qa_analysis_started';--> statement-breakpoint
ALTER TYPE "public"."activity_event_type" ADD VALUE 'qa_analysis_completed';--> statement-breakpoint
ALTER TYPE "public"."activity_event_type" ADD VALUE 'qa_auto_approved';--> statement-breakpoint
ALTER TYPE "public"."activity_event_type" ADD VALUE 'qa_auto_rejected';--> statement-breakpoint
ALTER TYPE "public"."activity_event_type" ADD VALUE 'qa_needs_review';--> statement-breakpoint
ALTER TYPE "public"."activity_event_type" ADD VALUE 'disposition_not_interested';--> statement-breakpoint
ALTER TYPE "public"."activity_event_type" ADD VALUE 'disposition_invalid_data';--> statement-breakpoint
ALTER TYPE "public"."activity_event_type" ADD VALUE 'disposition_voicemail';--> statement-breakpoint
ALTER TYPE "public"."activity_event_type" ADD VALUE 'disposition_no_answer';--> statement-breakpoint
ALTER TYPE "public"."campaign_type" ADD VALUE 'content_syndication';--> statement-breakpoint
ALTER TYPE "public"."campaign_type" ADD VALUE 'live_webinar';--> statement-breakpoint
ALTER TYPE "public"."campaign_type" ADD VALUE 'on_demand_webinar';--> statement-breakpoint
ALTER TYPE "public"."campaign_type" ADD VALUE 'high_quality_leads';--> statement-breakpoint
ALTER TYPE "public"."campaign_type" ADD VALUE 'executive_dinner';--> statement-breakpoint
ALTER TYPE "public"."campaign_type" ADD VALUE 'leadership_forum';--> statement-breakpoint
ALTER TYPE "public"."campaign_type" ADD VALUE 'conference';--> statement-breakpoint
ALTER TYPE "public"."campaign_type" ADD VALUE 'sql';--> statement-breakpoint
ALTER TYPE "public"."campaign_type" ADD VALUE 'appointment_generation';--> statement-breakpoint
ALTER TYPE "public"."campaign_type" ADD VALUE 'lead_qualification';--> statement-breakpoint
ALTER TYPE "public"."campaign_type" ADD VALUE 'data_validation';--> statement-breakpoint
ALTER TYPE "public"."campaign_type" ADD VALUE 'bant_leads';--> statement-breakpoint
ALTER TYPE "public"."campaign_type" ADD VALUE 'webinar_invite';--> statement-breakpoint
ALTER TYPE "public"."dial_mode" ADD VALUE 'hybrid' BEFORE 'power';--> statement-breakpoint
ALTER TYPE "public"."dial_mode" ADD VALUE 'ai_agent' BEFORE 'power';--> statement-breakpoint
ALTER TYPE "public"."verification_eligibility_status" ADD VALUE 'Ineligible_Cap_Reached';--> statement-breakpoint
ALTER TYPE "public"."verification_eligibility_status" ADD VALUE 'Ineligible_Recently_Submitted';--> statement-breakpoint
ALTER TYPE "public"."verification_eligibility_status" ADD VALUE 'Pending_Email_Validation';--> statement-breakpoint
ALTER TYPE "public"."verification_eligibility_status" ADD VALUE 'Ineligible_Email_Invalid';--> statement-breakpoint
CREATE TABLE "account_call_briefs" (
	"id" serial PRIMARY KEY NOT NULL,
	"workspace_id" varchar,
	"account_id" varchar NOT NULL,
	"campaign_id" varchar,
	"intelligence_version" integer NOT NULL,
	"campaign_fingerprint" text NOT NULL,
	"payload_json" jsonb NOT NULL,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "account_call_memory_notes" (
	"id" serial PRIMARY KEY NOT NULL,
	"account_id" varchar NOT NULL,
	"call_attempt_id" varchar,
	"summary" text,
	"payload_json" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "org_intelligence_profiles" (
	"id" serial PRIMARY KEY NOT NULL,
	"account_id" varchar,
	"domain" text NOT NULL,
	"identity" jsonb NOT NULL,
	"offerings" jsonb NOT NULL,
	"icp" jsonb NOT NULL,
	"positioning" jsonb NOT NULL,
	"outreach" jsonb NOT NULL,
	"org_intelligence" text,
	"compliance_policy" text,
	"platform_policies" text,
	"agent_voice_defaults" text,
	"raw_content" text,
	"confidence_score" real,
	"model_version" text,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "account_intelligence" (
	"id" serial PRIMARY KEY NOT NULL,
	"workspace_id" varchar,
	"account_id" varchar NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"source_fingerprint" text NOT NULL,
	"confidence" real,
	"payload_json" jsonb NOT NULL,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "account_messaging_briefs" (
	"id" serial PRIMARY KEY NOT NULL,
	"workspace_id" varchar,
	"account_id" varchar NOT NULL,
	"campaign_id" varchar,
	"intelligence_version" integer NOT NULL,
	"payload_json" jsonb NOT NULL,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "account_perspective_analysis" (
	"id" serial PRIMARY KEY NOT NULL,
	"account_id" varchar(36) NOT NULL,
	"perspective_id" integer NOT NULL,
	"analysis_json" jsonb NOT NULL,
	"key_considerations" text[] DEFAULT '{}',
	"value_drivers" text[] DEFAULT '{}',
	"potential_concerns" text[] DEFAULT '{}',
	"recommended_approach" text,
	"messaging_angles" text[] DEFAULT '{}',
	"questions_to_ask" text[] DEFAULT '{}',
	"confidence" numeric(5, 4) DEFAULT '0.5' NOT NULL,
	"signals_used" text[] DEFAULT '{}',
	"generation_model" text,
	"source_fingerprint" text,
	"generated_at" timestamp DEFAULT now() NOT NULL,
	"expires_at" timestamp,
	"is_stale" boolean DEFAULT false,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "agent_defaults" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"default_first_message" text NOT NULL,
	"default_system_prompt" text NOT NULL,
	"default_training_guidelines" jsonb NOT NULL,
	"default_voice_provider" text DEFAULT 'google' NOT NULL,
	"default_voice" text DEFAULT 'Fenrir' NOT NULL,
	"updated_by" varchar,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "agent_goals" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"agent_id" varchar NOT NULL,
	"period_id" varchar NOT NULL,
	"goal_definition_id" varchar NOT NULL,
	"target_value" integer NOT NULL,
	"reward_id" varchar,
	"created_by" varchar,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "agent_instance_contexts" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"virtual_agent_id" varchar NOT NULL,
	"campaign_id" varchar,
	"universal_knowledge_hash" text,
	"organization_context_hash" text,
	"assembled_system_prompt" text NOT NULL,
	"assembled_first_message" text,
	"assembly_metadata" jsonb,
	"is_active" boolean DEFAULT true NOT NULL,
	"activated_at" timestamp DEFAULT now() NOT NULL,
	"deactivated_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "agent_knowledge_config" (
	"id" serial PRIMARY KEY NOT NULL,
	"virtual_agent_id" varchar NOT NULL,
	"block_id" integer NOT NULL,
	"is_enabled" boolean DEFAULT true NOT NULL,
	"override_content" text,
	"priority" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "agent_period_stats" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"agent_id" varchar NOT NULL,
	"period_id" varchar NOT NULL,
	"total_calls" integer DEFAULT 0 NOT NULL,
	"qualified_leads" integer DEFAULT 0 NOT NULL,
	"accepted_leads" integer DEFAULT 0 NOT NULL,
	"rejected_leads" integer DEFAULT 0 NOT NULL,
	"pending_review" integer DEFAULT 0 NOT NULL,
	"conversion_rate" numeric(5, 2),
	"avg_call_duration" integer,
	"calculated_at" timestamp DEFAULT now() NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "agent_runs" (
	"id" serial PRIMARY KEY NOT NULL,
	"task_type" text NOT NULL,
	"context" jsonb,
	"status" text DEFAULT 'running' NOT NULL,
	"summary" text,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "agent_simulations" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"campaign_id" varchar,
	"account_id" varchar,
	"contact_id" varchar,
	"virtual_agent_id" varchar,
	"simulation_type" text NOT NULL,
	"simulation_mode" text NOT NULL,
	"input_scenario" jsonb,
	"generated_prompt" text,
	"knowledge_version" integer,
	"output_response" text,
	"evaluation_score" real,
	"evaluation_notes" text,
	"run_by" varchar,
	"run_at" timestamp DEFAULT now() NOT NULL,
	"duration_ms" integer,
	"status" text DEFAULT 'pending' NOT NULL,
	"error_message" text
);
--> statement-breakpoint
CREATE TABLE "agent_steps" (
	"id" serial PRIMARY KEY NOT NULL,
	"run_id" integer NOT NULL,
	"step_number" integer NOT NULL,
	"action_type" text NOT NULL,
	"input" jsonb,
	"output" jsonb,
	"status" text NOT NULL,
	"error" text,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "ai_intent_feedback" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"intent_id" varchar NOT NULL,
	"field_path" text NOT NULL,
	"original_value" text,
	"corrected_value" text,
	"feedback_type" text NOT NULL,
	"feedback_notes" text,
	"user_id" varchar NOT NULL,
	"was_used_for_training" boolean DEFAULT false,
	"similarity_score" numeric(5, 2),
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ai_project_intents" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"original_prompt" text NOT NULL,
	"redacted_prompt" text,
	"input_method" text DEFAULT 'text',
	"status" "ai_intent_status" DEFAULT 'processing' NOT NULL,
	"confidence_level" "ai_confidence_level",
	"confidence_score" numeric(5, 2),
	"extracted_data" jsonb,
	"model_used" text,
	"processing_time" integer,
	"validation_errors" jsonb,
	"validation_warnings" jsonb,
	"project_id" varchar,
	"created_campaign_ids" text[],
	"user_id" varchar NOT NULL,
	"reviewed_by" varchar,
	"reviewed_at" timestamp,
	"rejection_reason" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "blacklist_check_history" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"monitor_id" varchar NOT NULL,
	"was_listed" boolean NOT NULL,
	"listing_reason" text,
	"response_time_ms" integer,
	"raw_response" text,
	"check_source" text DEFAULT 'scheduled',
	"checked_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "blacklist_monitors" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"domain_auth_id" integer,
	"monitor_type" text NOT NULL,
	"monitor_value" text NOT NULL,
	"rbl_name" text NOT NULL,
	"rbl_display_name" text NOT NULL,
	"rbl_category" text NOT NULL,
	"status" "blacklist_status" DEFAULT 'pending_check' NOT NULL,
	"is_listed" boolean DEFAULT false NOT NULL,
	"listed_since" timestamp,
	"delisted_at" timestamp,
	"listing_reason" text,
	"last_checked_at" timestamp,
	"next_check_at" timestamp,
	"check_frequency_hours" integer DEFAULT 24 NOT NULL,
	"consecutive_clean_checks" integer DEFAULT 0,
	"alerts_enabled" boolean DEFAULT true NOT NULL,
	"last_alert_sent_at" timestamp,
	"alert_email_override" text,
	"delisting_requested" boolean DEFAULT false,
	"delisting_requested_at" timestamp,
	"delisting_url" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "business_perspectives" (
	"id" serial PRIMARY KEY NOT NULL,
	"perspective_code" text NOT NULL,
	"perspective_name" text NOT NULL,
	"description" text,
	"evaluation_criteria" jsonb DEFAULT '[]' NOT NULL,
	"key_metrics" jsonb DEFAULT '[]',
	"common_concerns" jsonb DEFAULT '[]',
	"value_drivers" jsonb DEFAULT '[]',
	"roi_factors" jsonb DEFAULT '[]',
	"risk_factors" jsonb DEFAULT '[]',
	"messaging_templates" jsonb DEFAULT '[]',
	"proof_point_types" jsonb DEFAULT '[]',
	"applicable_to_departments" text[] DEFAULT '{}',
	"priority_order" integer DEFAULT 50,
	"is_active" boolean DEFAULT true,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "business_perspectives_perspective_code_unique" UNIQUE("perspective_code")
);
--> statement-breakpoint
CREATE TABLE "call_followup_emails" (
	"id" serial PRIMARY KEY NOT NULL,
	"account_id" varchar NOT NULL,
	"contact_id" varchar NOT NULL,
	"campaign_id" varchar,
	"call_attempt_id" varchar,
	"payload_json" jsonb NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "call_outcome_learnings" (
	"id" serial PRIMARY KEY NOT NULL,
	"call_session_id" varchar(36) NOT NULL,
	"campaign_id" varchar(36),
	"contact_id" varchar(36),
	"account_id" varchar(36),
	"outcome_code" text NOT NULL,
	"outcome_category" text NOT NULL,
	"outcome_quality_score" numeric(5, 4),
	"engagement_signals" jsonb DEFAULT '{}' NOT NULL,
	"objection_signals" jsonb DEFAULT '{}',
	"qualification_signals" jsonb DEFAULT '{}',
	"conversation_quality_signals" jsonb DEFAULT '{}',
	"role_signals" jsonb DEFAULT '{}',
	"industry_signals" jsonb DEFAULT '{}',
	"messaging_signals" jsonb DEFAULT '{}',
	"contact_role_id" integer,
	"industry_id" integer,
	"problem_ids" integer[] DEFAULT '{}',
	"messaging_angle_used" text,
	"approach_used" text,
	"value_props_presented" text[] DEFAULT '{}',
	"adjustments_applied" jsonb DEFAULT '{}',
	"call_duration_seconds" integer,
	"talk_ratio" numeric(5, 4),
	"call_timestamp" timestamp NOT NULL,
	"processed_for_learning" boolean DEFAULT false,
	"processed_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "call_producer_tracking" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"call_session_id" varchar NOT NULL,
	"campaign_id" varchar NOT NULL,
	"contact_id" varchar,
	"producer_type" "agent_type" NOT NULL,
	"human_agent_id" varchar,
	"virtual_agent_id" varchar,
	"handoff_stage" "handoff_stage" DEFAULT 'ai_initial' NOT NULL,
	"handoff_trigger" "ai_handoff_trigger",
	"handoff_timestamp" timestamp,
	"handoff_notes" text,
	"intents_detected" jsonb,
	"transcript_analysis" jsonb,
	"quality_score" numeric(5, 2),
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "call_quality_records" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"call_session_id" varchar NOT NULL,
	"dialer_call_attempt_id" varchar,
	"campaign_id" varchar,
	"contact_id" varchar,
	"overall_quality_score" integer,
	"engagement_score" integer,
	"clarity_score" integer,
	"empathy_score" integer,
	"objection_handling_score" integer,
	"qualification_score" integer,
	"closing_score" integer,
	"sentiment" text,
	"engagement_level" text,
	"identity_confirmed" boolean,
	"qualification_met" boolean,
	"issues" jsonb,
	"recommendations" jsonb,
	"breakdowns" jsonb,
	"prompt_updates" jsonb,
	"performance_gaps" jsonb,
	"next_best_actions" jsonb,
	"campaign_alignment_score" integer,
	"context_usage_score" integer,
	"talking_points_coverage_score" integer,
	"missed_talking_points" jsonb,
	"flow_compliance_score" integer,
	"missed_steps" jsonb,
	"flow_deviations" jsonb,
	"assigned_disposition" text,
	"expected_disposition" text,
	"disposition_accurate" boolean,
	"disposition_notes" jsonb,
	"transcript_length" integer,
	"transcript_truncated" boolean,
	"full_transcript" text,
	"analysis_model" text,
	"analysis_stage" text,
	"interaction_type" text,
	"analyzed_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "campaign_account_problems" (
	"id" serial PRIMARY KEY NOT NULL,
	"campaign_id" varchar NOT NULL,
	"account_id" varchar NOT NULL,
	"detected_problems" jsonb DEFAULT '[]' NOT NULL,
	"gap_analysis" jsonb DEFAULT '{}' NOT NULL,
	"messaging_package" jsonb DEFAULT '{}' NOT NULL,
	"outreach_strategy" jsonb DEFAULT '{}' NOT NULL,
	"generated_at" timestamp DEFAULT now() NOT NULL,
	"generation_model" text,
	"source_fingerprint" text,
	"confidence" real,
	"last_refreshed_at" timestamp,
	"refresh_count" integer DEFAULT 0,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "campaign_channel_variants" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"campaign_id" varchar NOT NULL,
	"channel_type" "channel_type" NOT NULL,
	"status" "channel_variant_status" DEFAULT 'draft' NOT NULL,
	"approved_by" varchar,
	"approved_at" timestamp,
	"generated_flow" jsonb,
	"flow_override" jsonb,
	"channel_settings" jsonb,
	"execution_prompt" text,
	"execution_prompt_version" integer DEFAULT 1,
	"execution_prompt_generated_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "campaign_execution_prompts" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"campaign_id" varchar NOT NULL,
	"channel_type" "channel_type" NOT NULL,
	"account_id" varchar,
	"contact_id" varchar,
	"base_prompt" text NOT NULL,
	"channel_additions" text,
	"template_insertions" jsonb,
	"compliance_additions" text,
	"final_prompt" text NOT NULL,
	"prompt_hash" varchar(64) NOT NULL,
	"version" integer DEFAULT 1,
	"context_version" integer,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "campaign_knowledge_config" (
	"id" serial PRIMARY KEY NOT NULL,
	"campaign_id" varchar NOT NULL,
	"block_id" integer NOT NULL,
	"is_enabled" boolean DEFAULT true NOT NULL,
	"override_content" text,
	"priority" integer DEFAULT 0 NOT NULL,
	"openai_override" text,
	"google_override" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "campaign_org_intelligence_bindings" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"campaign_id" varchar NOT NULL,
	"mode" "org_intelligence_mode" DEFAULT 'use_existing' NOT NULL,
	"snapshot_id" varchar,
	"master_org_intelligence_id" integer,
	"disclosure_level" text DEFAULT 'standard' NOT NULL,
	"bound_by" varchar,
	"bound_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "campaign_organizations" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"domain" text,
	"description" text,
	"industry" text,
	"logo_url" text,
	"organization_type" "organization_type" DEFAULT 'client' NOT NULL,
	"parent_organization_id" varchar,
	"identity" jsonb DEFAULT '{}' NOT NULL,
	"offerings" jsonb DEFAULT '{}' NOT NULL,
	"icp" jsonb DEFAULT '{}' NOT NULL,
	"positioning" jsonb DEFAULT '{}' NOT NULL,
	"outreach" jsonb DEFAULT '{}' NOT NULL,
	"compiled_org_context" text,
	"is_default" boolean DEFAULT false NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_by" varchar,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "campaign_service_customizations" (
	"id" serial PRIMARY KEY NOT NULL,
	"campaign_id" varchar NOT NULL,
	"service_id" integer NOT NULL,
	"custom_problems_solved" jsonb,
	"custom_differentiators" jsonb,
	"custom_value_propositions" jsonb,
	"is_primary_service" boolean DEFAULT false,
	"focus_weight" integer DEFAULT 50,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "campaign_suppression_domains" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"campaign_id" varchar NOT NULL,
	"domain" text,
	"domain_norm" text NOT NULL,
	"company_name" text,
	"reason" text,
	"added_by" varchar,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "campaign_suppression_emails" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"campaign_id" varchar NOT NULL,
	"email" text NOT NULL,
	"email_norm" text NOT NULL,
	"reason" text,
	"added_by" varchar,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "campaign_templates" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"campaign_id" varchar NOT NULL,
	"channel_type" "channel_type" NOT NULL,
	"scope" "template_scope" NOT NULL,
	"account_id" varchar,
	"contact_id" varchar,
	"name" varchar(255) NOT NULL,
	"template_type" varchar(50) NOT NULL,
	"content" text NOT NULL,
	"variables" jsonb,
	"priority" integer DEFAULT 0,
	"is_active" boolean DEFAULT true,
	"created_by" varchar,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "campaign_test_calls" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"campaign_id" varchar NOT NULL,
	"virtual_agent_id" varchar,
	"test_phone_number" text NOT NULL,
	"test_contact_name" text NOT NULL,
	"test_company_name" text,
	"test_job_title" text,
	"test_contact_email" text,
	"custom_variables" jsonb,
	"call_control_id" text,
	"call_session_id" varchar,
	"status" "test_call_status" DEFAULT 'pending' NOT NULL,
	"initiated_at" timestamp DEFAULT now() NOT NULL,
	"answered_at" timestamp,
	"ended_at" timestamp,
	"duration_seconds" integer,
	"full_transcript" text,
	"transcript_turns" jsonb,
	"ai_performance_metrics" jsonb,
	"detected_issues" jsonb,
	"prompt_improvement_suggestions" jsonb,
	"disposition" "canonical_disposition",
	"call_summary" text,
	"test_result" text,
	"test_notes" text,
	"recording_url" text,
	"tested_by" varchar,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "client_accounts" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"contact_email" text,
	"contact_phone" text,
	"company_name" text,
	"notes" text,
	"invite_slug" varchar DEFAULT concat('join_', encode(gen_random_bytes(6), 'hex')) NOT NULL,
	"invite_domains" text[] DEFAULT ARRAY[]::text[],
	"invite_enabled" boolean DEFAULT true NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"visibility_settings" jsonb DEFAULT '{"showBilling":true,"showLeads":true,"showRecordings":false,"showProjectDetails":true,"allowedCampaignTypes":[]}'::jsonb,
	"created_by" varchar,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "client_accounts_invite_slug_unique" UNIQUE("invite_slug")
);
--> statement-breakpoint
CREATE TABLE "client_activity_costs" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"client_account_id" varchar NOT NULL,
	"project_id" varchar,
	"campaign_id" varchar,
	"order_id" varchar,
	"activity_type" "activity_cost_type" NOT NULL,
	"activity_date" timestamp DEFAULT now() NOT NULL,
	"reference_type" text,
	"reference_id" varchar,
	"quantity" numeric(10, 2) DEFAULT '1' NOT NULL,
	"unit_rate" numeric(10, 4) NOT NULL,
	"total_cost" numeric(12, 4) NOT NULL,
	"currency" varchar(3) DEFAULT 'USD',
	"invoice_id" varchar,
	"invoiced_at" timestamp,
	"description" text,
	"metadata" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "client_billing_config" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"client_account_id" varchar NOT NULL,
	"default_billing_model" "billing_model_type" DEFAULT 'cpl' NOT NULL,
	"default_rate_per_lead" numeric(10, 2) DEFAULT '150.00',
	"default_rate_per_contact" numeric(10, 2) DEFAULT '25.00',
	"default_rate_per_call_minute" numeric(10, 4) DEFAULT '0.15',
	"default_rate_per_email" numeric(10, 4) DEFAULT '0.02',
	"monthly_retainer_amount" numeric(12, 2),
	"retainer_includes_leads" integer,
	"overage_rate_per_lead" numeric(10, 2),
	"payment_terms_days" integer DEFAULT 30,
	"currency" varchar(3) DEFAULT 'USD',
	"billing_email" text,
	"billing_address" jsonb,
	"tax_exempt" boolean DEFAULT false,
	"tax_id" text,
	"tax_rate" numeric(5, 4) DEFAULT '0',
	"auto_invoice_enabled" boolean DEFAULT true,
	"invoice_day_of_month" integer DEFAULT 1,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "client_billing_config_client_account_id_unique" UNIQUE("client_account_id")
);
--> statement-breakpoint
CREATE TABLE "client_campaign_access" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"client_account_id" varchar NOT NULL,
	"campaign_id" varchar,
	"regular_campaign_id" varchar,
	"granted_by" varchar,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "client_delivery_access_log" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"delivery_link_id" varchar NOT NULL,
	"accessed_at" timestamp DEFAULT now() NOT NULL,
	"accessed_by_user_id" varchar,
	"ip_address" text,
	"user_agent" text
);
--> statement-breakpoint
CREATE TABLE "client_delivery_links" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"client_account_id" varchar NOT NULL,
	"order_id" varchar,
	"campaign_id" varchar,
	"project_id" varchar,
	"delivery_type" text DEFAULT 'csv_export' NOT NULL,
	"delivery_status" "delivery_status" DEFAULT 'pending' NOT NULL,
	"file_url" text,
	"file_name" text,
	"link_expires_at" timestamp,
	"download_count" integer DEFAULT 0,
	"max_downloads" integer,
	"contact_count" integer DEFAULT 0 NOT NULL,
	"file_format" text DEFAULT 'csv',
	"file_size_bytes" integer,
	"delivered_at" timestamp,
	"first_accessed_at" timestamp,
	"last_accessed_at" timestamp,
	"access_token" text DEFAULT gen_random_uuid()::text,
	"password_protected" boolean DEFAULT false,
	"password_hash" text,
	"created_by" varchar,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "client_delivery_links_access_token_unique" UNIQUE("access_token")
);
--> statement-breakpoint
CREATE TABLE "client_invoice_activity" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"invoice_id" varchar NOT NULL,
	"activity_type" text NOT NULL,
	"description" text,
	"performed_by" varchar,
	"performed_by_client" varchar,
	"performed_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "client_invoice_items" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"invoice_id" varchar NOT NULL,
	"description" text NOT NULL,
	"item_type" text NOT NULL,
	"quantity" numeric(10, 2) NOT NULL,
	"unit_price" numeric(10, 4) NOT NULL,
	"amount" numeric(12, 2) NOT NULL,
	"project_id" varchar,
	"campaign_id" varchar,
	"period_start" date,
	"period_end" date,
	"sort_order" integer DEFAULT 0,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "client_invoices" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"client_account_id" varchar NOT NULL,
	"invoice_number" text NOT NULL,
	"billing_period_start" date NOT NULL,
	"billing_period_end" date NOT NULL,
	"subtotal" numeric(12, 2) NOT NULL,
	"tax_amount" numeric(12, 2) DEFAULT '0',
	"discount_amount" numeric(12, 2) DEFAULT '0',
	"total_amount" numeric(12, 2) NOT NULL,
	"amount_paid" numeric(12, 2) DEFAULT '0',
	"currency" varchar(3) DEFAULT 'USD',
	"status" "invoice_status" DEFAULT 'draft' NOT NULL,
	"issue_date" date,
	"due_date" date,
	"paid_date" date,
	"payment_method" text,
	"payment_reference" text,
	"notes" text,
	"internal_notes" text,
	"pdf_url" text,
	"created_by" varchar,
	"sent_by" varchar,
	"sent_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "client_invoices_invoice_number_unique" UNIQUE("invoice_number")
);
--> statement-breakpoint
CREATE TABLE "client_mock_calls" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"client_account_id" varchar NOT NULL,
	"campaign_id" varchar,
	"project_id" varchar,
	"call_name" text,
	"recording_url" text,
	"recording_s3_key" text,
	"transcript" text,
	"structured_transcript" jsonb,
	"duration_seconds" integer,
	"call_type" varchar(50) DEFAULT 'test',
	"disposition" varchar(100),
	"qa_content_id" varchar,
	"ai_analysis" jsonb,
	"ai_score" integer,
	"created_by" varchar,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "client_organization_links" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"client_account_id" varchar NOT NULL,
	"campaign_organization_id" varchar NOT NULL,
	"relationship_type" "client_relationship_type" DEFAULT 'managed' NOT NULL,
	"is_primary" boolean DEFAULT false NOT NULL,
	"created_by" varchar,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "client_portal_activity_logs" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"client_account_id" varchar NOT NULL,
	"client_user_id" varchar,
	"entity_type" text NOT NULL,
	"entity_id" varchar NOT NULL,
	"action" text NOT NULL,
	"details" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "client_portal_order_contacts" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"order_id" varchar NOT NULL,
	"verification_contact_id" varchar NOT NULL,
	"edited_data" jsonb,
	"admin_comment" text,
	"client_comment" text,
	"selection_order" integer NOT NULL,
	"selected_at" timestamp DEFAULT now() NOT NULL,
	"selected_by" varchar,
	"is_delivered" boolean DEFAULT false NOT NULL,
	"delivered_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "client_portal_orders" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"order_number" text NOT NULL,
	"client_account_id" varchar NOT NULL,
	"client_user_id" varchar,
	"campaign_id" varchar NOT NULL,
	"requested_quantity" integer NOT NULL,
	"approved_quantity" integer,
	"delivered_quantity" integer DEFAULT 0 NOT NULL,
	"order_month" integer NOT NULL,
	"order_year" integer NOT NULL,
	"status" "client_portal_order_status" DEFAULT 'draft' NOT NULL,
	"client_notes" text,
	"admin_notes" text,
	"approved_by" varchar,
	"approved_at" timestamp,
	"rejected_by" varchar,
	"rejected_at" timestamp,
	"rejection_reason" text,
	"submitted_at" timestamp,
	"fulfilled_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "client_portal_orders_order_number_unique" UNIQUE("order_number")
);
--> statement-breakpoint
CREATE TABLE "client_project_campaigns" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" varchar NOT NULL,
	"campaign_id" varchar NOT NULL,
	"assigned_at" timestamp DEFAULT now() NOT NULL,
	"assigned_by" varchar
);
--> statement-breakpoint
CREATE TABLE "client_projects" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"client_account_id" varchar NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"project_code" text,
	"start_date" date,
	"end_date" date,
	"status" "client_project_status" DEFAULT 'draft' NOT NULL,
	"budget_amount" numeric(12, 2),
	"budget_currency" varchar(3) DEFAULT 'USD',
	"requested_lead_count" integer,
	"billing_model" "billing_model_type",
	"rate_per_lead" numeric(10, 2),
	"rate_per_contact" numeric(10, 2),
	"rate_per_call_minute" numeric(10, 4),
	"monthly_retainer" numeric(10, 2),
	"landing_page_url" text,
	"project_file_url" text,
	"project_type" "project_type" DEFAULT 'custom',
	"campaign_organization_id" varchar,
	"qa_gate_config" jsonb DEFAULT '{"enabled":true,"autoApproveThreshold":85,"requireManualReview":false}'::jsonb,
	"created_by" varchar,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "client_projects_project_code_unique" UNIQUE("project_code")
);
--> statement-breakpoint
CREATE TABLE "client_reports" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"client_account_id" varchar NOT NULL,
	"campaign_id" varchar,
	"project_id" varchar,
	"report_name" text NOT NULL,
	"report_type" varchar(100) NOT NULL,
	"report_period_start" date,
	"report_period_end" date,
	"report_data" jsonb NOT NULL,
	"report_summary" text,
	"file_url" text,
	"file_format" varchar(20) DEFAULT 'json',
	"file_size_bytes" integer,
	"qa_content_id" varchar,
	"generated_by" varchar,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "client_simulation_sessions" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"client_account_id" varchar NOT NULL,
	"client_user_id" varchar,
	"campaign_id" varchar,
	"project_id" varchar,
	"session_name" text,
	"transcript" jsonb,
	"structured_transcript" jsonb,
	"duration_seconds" integer,
	"qa_content_id" varchar,
	"simulation_config" jsonb,
	"evaluation_result" jsonb,
	"evaluation_score" integer,
	"metadata" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"completed_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "client_users" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"client_account_id" varchar NOT NULL,
	"email" text NOT NULL,
	"password" text NOT NULL,
	"first_name" text,
	"last_name" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"last_login_at" timestamp,
	"created_by" varchar,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "client_users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "client_voice_commands" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"client_user_id" varchar NOT NULL,
	"client_account_id" varchar NOT NULL,
	"transcript" text NOT NULL,
	"intent" "voice_command_intent" DEFAULT 'unknown',
	"entities" jsonb,
	"response_text" text,
	"response_audio_url" text,
	"action_type" text,
	"action_result" jsonb,
	"action_success" boolean,
	"processing_duration_ms" integer,
	"audio_input_url" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "client_voice_config" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"client_account_id" varchar NOT NULL,
	"voice_enabled" boolean DEFAULT true,
	"preferred_voice" text DEFAULT 'nova',
	"response_speed" numeric(3, 2) DEFAULT '1.0',
	"voice_can_create_orders" boolean DEFAULT true,
	"voice_can_view_invoices" boolean DEFAULT true,
	"voice_can_download_reports" boolean DEFAULT true,
	"custom_vocabulary" jsonb,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "client_voice_config_client_account_id_unique" UNIQUE("client_account_id")
);
--> statement-breakpoint
CREATE TABLE "contact_intelligence" (
	"id" serial PRIMARY KEY NOT NULL,
	"contact_id" varchar(36) NOT NULL,
	"normalized_role_id" integer,
	"role_confidence" numeric(5, 4),
	"role_mapping_source" "title_mapping_source",
	"decision_authority" "decision_authority",
	"buying_committee_role" "buying_committee_role",
	"likely_priorities" jsonb DEFAULT '[]',
	"communication_style_hints" jsonb DEFAULT '{}',
	"pain_point_sensitivity" jsonb DEFAULT '{}',
	"best_approach" text,
	"preferred_value_props" text[] DEFAULT '{}',
	"recommended_messaging_angles" text[] DEFAULT '{}',
	"engagement_history_summary" jsonb DEFAULT '{}',
	"objection_history" text[] DEFAULT '{}',
	"interest_signals" text[] DEFAULT '{}',
	"engagement_propensity" numeric(5, 4),
	"qualification_propensity" numeric(5, 4),
	"generated_at" timestamp DEFAULT now() NOT NULL,
	"generation_model" text,
	"source_fingerprint" text,
	"expires_at" timestamp,
	"is_stale" boolean DEFAULT false,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "contact_intelligence_contact_id_unique" UNIQUE("contact_id")
);
--> statement-breakpoint
CREATE TABLE "contact_predictive_scores" (
	"id" serial PRIMARY KEY NOT NULL,
	"contact_id" varchar(36) NOT NULL,
	"campaign_id" varchar(36) NOT NULL,
	"engagement_likelihood" numeric(5, 4) NOT NULL,
	"qualification_likelihood" numeric(5, 4) NOT NULL,
	"conversion_likelihood" numeric(5, 4),
	"role_score" numeric(5, 4),
	"industry_score" numeric(5, 4),
	"problem_fit_score" numeric(5, 4),
	"historical_pattern_score" numeric(5, 4),
	"account_fit_score" numeric(5, 4),
	"timing_score" numeric(5, 4),
	"score_factors" jsonb DEFAULT '{}',
	"recommended_approach" text,
	"recommended_messaging_angles" text[] DEFAULT '{}',
	"recommended_value_props" text[] DEFAULT '{}',
	"recommended_proof_points" text[] DEFAULT '{}',
	"call_priority" integer DEFAULT 50 NOT NULL,
	"priority_tier" text,
	"has_blocking_factors" boolean DEFAULT false,
	"blocking_factors" text[] DEFAULT '{}',
	"generated_at" timestamp DEFAULT now() NOT NULL,
	"generation_model" text,
	"source_fingerprint" text,
	"expires_at" timestamp,
	"is_stale" boolean DEFAULT false,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "csv_mapping_templates" (
	"id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" varchar(36) NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"is_default" boolean DEFAULT false NOT NULL,
	"csv_headers" jsonb NOT NULL,
	"mappings" jsonb NOT NULL,
	"use_count" integer DEFAULT 0 NOT NULL,
	"last_used_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "deal_activities" (
	"id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"opportunity_id" varchar(36) NOT NULL,
	"activity_type" "deal_activity_type" NOT NULL,
	"actor_id" varchar(36),
	"actor_email" varchar(320),
	"title" varchar(255) NOT NULL,
	"description" text,
	"metadata" jsonb,
	"source_reference" varchar(255),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "deal_conversations" (
	"id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"opportunity_id" varchar(36),
	"subject" varchar(512) DEFAULT '' NOT NULL,
	"thread_id" varchar(255),
	"participant_emails" text[],
	"message_count" integer DEFAULT 0 NOT NULL,
	"last_message_at" timestamp with time zone,
	"direction" "email_direction",
	"status" varchar(32) DEFAULT 'active' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "deal_insights" (
	"id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"opportunity_id" varchar(36) NOT NULL,
	"insight_type" "deal_insight_type" NOT NULL,
	"source" varchar(64) NOT NULL,
	"title" varchar(255) NOT NULL,
	"description" text,
	"confidence" integer DEFAULT 0,
	"status" "insight_status" DEFAULT 'active' NOT NULL,
	"metadata" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "deal_messages" (
	"id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"conversation_id" varchar(36) NOT NULL,
	"opportunity_id" varchar(36),
	"m365_message_id" text NOT NULL,
	"from_email" varchar(320) NOT NULL,
	"to_emails" text[] NOT NULL,
	"cc_emails" text[],
	"subject" varchar(512),
	"body_preview" text,
	"body_content" text,
	"direction" "email_direction" NOT NULL,
	"message_status" "message_status" DEFAULT 'delivered' NOT NULL,
	"sent_at" timestamp with time zone,
	"received_at" timestamp with time zone,
	"is_from_customer" boolean DEFAULT false NOT NULL,
	"has_attachments" boolean DEFAULT false NOT NULL,
	"importance" varchar(16) DEFAULT 'normal',
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "deal_messages_m365_message_id_unique" UNIQUE("m365_message_id")
);
--> statement-breakpoint
CREATE TABLE "deal_score_history" (
	"id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"opportunity_id" varchar(36) NOT NULL,
	"score_type" varchar(32) NOT NULL,
	"previous_value" integer,
	"new_value" integer NOT NULL,
	"delta" integer,
	"change_reason" varchar(64) NOT NULL,
	"changed_by" varchar(36),
	"metadata" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "dialer_call_attempts" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"dialer_run_id" varchar NOT NULL,
	"campaign_id" varchar NOT NULL,
	"contact_id" varchar NOT NULL,
	"queue_item_id" varchar,
	"call_session_id" varchar,
	"agent_type" "agent_type" NOT NULL,
	"human_agent_id" varchar,
	"virtual_agent_id" varchar,
	"phone_dialed" text NOT NULL,
	"attempt_number" integer DEFAULT 1 NOT NULL,
	"call_started_at" timestamp,
	"call_ended_at" timestamp,
	"call_duration_seconds" integer,
	"connected" boolean DEFAULT false NOT NULL,
	"voicemail_detected" boolean DEFAULT false NOT NULL,
	"disposition" "canonical_disposition",
	"disposition_submitted_at" timestamp,
	"disposition_submitted_by" varchar,
	"disposition_processed" boolean DEFAULT false NOT NULL,
	"disposition_processed_at" timestamp,
	"notes" text,
	"recording_url" text,
	"telnyx_call_id" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "dialer_runs" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"campaign_id" varchar NOT NULL,
	"run_type" "dialer_run_type" NOT NULL,
	"status" "dialer_run_status" DEFAULT 'pending' NOT NULL,
	"agent_type" "agent_type" NOT NULL,
	"human_agent_id" varchar,
	"virtual_agent_id" varchar,
	"started_at" timestamp,
	"ended_at" timestamp,
	"total_contacts" integer DEFAULT 0 NOT NULL,
	"contacts_processed" integer DEFAULT 0 NOT NULL,
	"contacts_connected" integer DEFAULT 0 NOT NULL,
	"qualified_leads" integer DEFAULT 0 NOT NULL,
	"dnc_requests" integer DEFAULT 0 NOT NULL,
	"voicemails" integer DEFAULT 0 NOT NULL,
	"no_answers" integer DEFAULT 0 NOT NULL,
	"invalid_data" integer DEFAULT 0 NOT NULL,
	"not_interested" integer DEFAULT 0 NOT NULL,
	"max_concurrent_calls" integer DEFAULT 1 NOT NULL,
	"call_timeout_seconds" integer DEFAULT 30 NOT NULL,
	"created_by" varchar,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "disposition_rules" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"disposition_id" varchar NOT NULL,
	"producer_type" "agent_type",
	"priority" integer DEFAULT 0 NOT NULL,
	"conditions" jsonb,
	"actions" jsonb NOT NULL,
	"recycle_config" jsonb,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_by" varchar,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "dnc_reconciliation_log" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"phone_e164" text NOT NULL,
	"contact_id" varchar,
	"source" text NOT NULL,
	"producer_type" "agent_type",
	"call_session_id" varchar,
	"carrier_blocklist_updated" boolean DEFAULT false NOT NULL,
	"global_dnc_updated" boolean DEFAULT false NOT NULL,
	"reconciled_at" timestamp,
	"notes" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "domain_configuration" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"domain_auth_id" integer NOT NULL,
	"secure_code" text NOT NULL,
	"subdomain" text,
	"parent_domain" text,
	"domain_purpose" "domain_purpose" DEFAULT 'both' NOT NULL,
	"generated_spf_record" text,
	"generated_dkim_selector" text,
	"generated_dkim_record" text,
	"generated_dmarc_record" text,
	"generated_tracking_cname" text,
	"spf_verified_at" timestamp,
	"dkim_verified_at" timestamp,
	"dmarc_verified_at" timestamp,
	"tracking_verified_at" timestamp,
	"allow_marketing" boolean DEFAULT true NOT NULL,
	"allow_transactional" boolean DEFAULT true NOT NULL,
	"requires_manual_approval" boolean DEFAULT false NOT NULL,
	"mailgun_domain_id" text,
	"mailgun_api_key" text,
	"mailgun_region" text DEFAULT 'US',
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "domain_configuration_domain_auth_id_unique" UNIQUE("domain_auth_id"),
	CONSTRAINT "domain_configuration_secure_code_unique" UNIQUE("secure_code")
);
--> statement-breakpoint
CREATE TABLE "domain_health_scores" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"domain_auth_id" integer NOT NULL,
	"overall_score" integer DEFAULT 0 NOT NULL,
	"authentication_score" integer DEFAULT 0,
	"reputation_score" integer DEFAULT 0,
	"engagement_score" integer DEFAULT 0,
	"blacklist_score" integer DEFAULT 100,
	"bounce_rate" real DEFAULT 0,
	"complaint_rate" real DEFAULT 0,
	"unsubscribe_rate" real DEFAULT 0,
	"open_rate" real DEFAULT 0,
	"click_rate" real DEFAULT 0,
	"total_sent_7_days" integer DEFAULT 0,
	"total_sent_30_days" integer DEFAULT 0,
	"total_bounced_7_days" integer DEFAULT 0,
	"total_complaints_7_days" integer DEFAULT 0,
	"blacklisted_on" text[],
	"last_blacklist_check" timestamp,
	"warmup_phase" "warmup_phase" DEFAULT 'not_started' NOT NULL,
	"warmup_started_at" timestamp,
	"warmup_completed_at" timestamp,
	"daily_send_target" integer DEFAULT 50,
	"daily_send_actual" integer DEFAULT 0,
	"recommendations" jsonb,
	"scored_at" timestamp DEFAULT now() NOT NULL,
	"score_version" integer DEFAULT 1,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "domain_warmup_schedule" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"domain_auth_id" integer NOT NULL,
	"day" integer NOT NULL,
	"scheduled_date" timestamp NOT NULL,
	"target_volume" integer NOT NULL,
	"actual_volume" integer DEFAULT 0,
	"delivered" integer DEFAULT 0,
	"bounced" integer DEFAULT 0,
	"complaints" integer DEFAULT 0,
	"opens" integer DEFAULT 0,
	"status" text DEFAULT 'pending' NOT NULL,
	"completed_at" timestamp,
	"notes" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "email_ai_rewrites" (
	"id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" varchar(36) NOT NULL,
	"original_text" text NOT NULL,
	"rewritten_text" text NOT NULL,
	"tone" varchar(32),
	"instructions" text,
	"ai_model" varchar(64) DEFAULT 'gpt-4o',
	"analysis_results" jsonb,
	"accepted" boolean DEFAULT false,
	"message_id" varchar(36),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "email_link_clicks" (
	"id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"message_id" varchar(36) NOT NULL,
	"recipient_email" varchar(320) NOT NULL,
	"link_url" text NOT NULL,
	"link_text" text,
	"clicked_at" timestamp with time zone DEFAULT now() NOT NULL,
	"ip_address" varchar(45),
	"user_agent" text,
	"device_type" varchar(32),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "email_opens" (
	"id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"message_id" varchar(36) NOT NULL,
	"recipient_email" varchar(320) NOT NULL,
	"opened_at" timestamp with time zone DEFAULT now() NOT NULL,
	"ip_address" varchar(45),
	"user_agent" text,
	"location" jsonb,
	"device_type" varchar(32),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "email_sequences" (
	"id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" varchar(255) NOT NULL,
	"description" text,
	"status" "email_sequence_status" DEFAULT 'active' NOT NULL,
	"mailbox_account_id" varchar(36) NOT NULL,
	"created_by" varchar(36) NOT NULL,
	"total_enrolled" integer DEFAULT 0 NOT NULL,
	"active_enrollments" integer DEFAULT 0 NOT NULL,
	"completed_enrollments" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "email_signatures" (
	"id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" varchar(36) NOT NULL,
	"name" varchar(255) NOT NULL,
	"signature_html" text NOT NULL,
	"signature_plain" text,
	"is_default" boolean DEFAULT false NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "email_suppression_list" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" text NOT NULL,
	"email_normalized" text NOT NULL,
	"reason" "email_suppression_reason" NOT NULL,
	"campaign_id" varchar,
	"contact_id" varchar,
	"metadata" jsonb,
	"added_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "email_validation_domain_cache" (
	"domain" text PRIMARY KEY NOT NULL,
	"has_mx" boolean DEFAULT false NOT NULL,
	"has_a" boolean DEFAULT false NOT NULL,
	"mx_hosts" jsonb,
	"spf_record" text,
	"dmarc_record" text,
	"accept_all_probability" integer DEFAULT 0 NOT NULL,
	"last_checked" timestamp DEFAULT now() NOT NULL,
	"check_count" integer DEFAULT 1 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "export_templates" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"template_type" varchar DEFAULT 'verification_smart' NOT NULL,
	"field_mappings" jsonb NOT NULL,
	"column_order" jsonb,
	"created_by" varchar,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "gamification_rewards" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"reward_value" numeric,
	"reward_currency" varchar(3) DEFAULT 'USD',
	"criteria" jsonb,
	"fulfillment_channel" text,
	"active" boolean DEFAULT true NOT NULL,
	"created_by" varchar,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "goal_definitions" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"goal_type" "goal_type" NOT NULL,
	"default_target_value" integer NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_by" varchar,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "governance_actions_log" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"campaign_id" varchar,
	"contact_id" varchar,
	"call_session_id" varchar,
	"disposition_id" varchar,
	"trigger_rule_id" varchar,
	"action_type" "governance_action" NOT NULL,
	"producer_type" "agent_type",
	"action_payload" jsonb,
	"result" text,
	"error_message" text,
	"executed_by" text DEFAULT 'system' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "inbox_categories" (
	"id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" varchar(36) NOT NULL,
	"message_id" varchar(36) NOT NULL,
	"category" varchar(32) DEFAULT 'other' NOT NULL,
	"is_read" boolean DEFAULT false NOT NULL,
	"is_starred" boolean DEFAULT false NOT NULL,
	"is_archived" boolean DEFAULT false NOT NULL,
	"read_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "industry_department_pain_points" (
	"id" serial PRIMARY KEY NOT NULL,
	"industry_id" integer NOT NULL,
	"department" text NOT NULL,
	"pain_points" jsonb DEFAULT '[]' NOT NULL,
	"priorities" jsonb DEFAULT '[]',
	"budget_considerations" jsonb DEFAULT '{}',
	"decision_factors" jsonb DEFAULT '[]',
	"success_metrics" jsonb DEFAULT '[]',
	"common_objections" jsonb DEFAULT '[]',
	"messaging_angles" jsonb DEFAULT '[]',
	"is_active" boolean DEFAULT true,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "industry_taxonomy" (
	"id" serial PRIMARY KEY NOT NULL,
	"industry_name" text NOT NULL,
	"industry_code" text NOT NULL,
	"display_name" text NOT NULL,
	"sic_codes" text[] DEFAULT '{}',
	"naics_codes" text[] DEFAULT '{}',
	"parent_industry_id" integer,
	"industry_level" "industry_level" DEFAULT 'industry' NOT NULL,
	"synonyms" text[] DEFAULT '{}',
	"keywords" text[] DEFAULT '{}',
	"description" text,
	"typical_challenges" jsonb DEFAULT '[]',
	"regulatory_considerations" jsonb DEFAULT '[]',
	"buying_behaviors" jsonb DEFAULT '{}',
	"seasonal_patterns" jsonb DEFAULT '{}',
	"technology_trends" jsonb DEFAULT '[]',
	"competitive_landscape" jsonb DEFAULT '{}',
	"is_active" boolean DEFAULT true,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "industry_taxonomy_industry_code_unique" UNIQUE("industry_code")
);
--> statement-breakpoint
CREATE TABLE "job_role_taxonomy" (
	"id" serial PRIMARY KEY NOT NULL,
	"role_name" text NOT NULL,
	"role_code" text NOT NULL,
	"role_category" text NOT NULL,
	"job_function" text NOT NULL,
	"seniority_level" text NOT NULL,
	"decision_authority" "decision_authority" DEFAULT 'influencer' NOT NULL,
	"department" text,
	"synonyms" text[] DEFAULT '{}',
	"keywords" text[] DEFAULT '{}',
	"parent_role_id" integer,
	"typical_reports_to" integer,
	"description" text,
	"is_active" boolean DEFAULT true,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "job_role_taxonomy_role_code_unique" UNIQUE("role_code")
);
--> statement-breakpoint
CREATE TABLE "job_title_mappings" (
	"id" serial PRIMARY KEY NOT NULL,
	"raw_title" text NOT NULL,
	"raw_title_normalized" text NOT NULL,
	"mapped_role_id" integer NOT NULL,
	"confidence" numeric(5, 4) DEFAULT '0.8' NOT NULL,
	"mapping_source" "title_mapping_source" DEFAULT 'manual' NOT NULL,
	"verified_by" varchar(36),
	"verified_at" timestamp,
	"usage_count" integer DEFAULT 0,
	"last_used_at" timestamp,
	"notes" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "knowledge_block_versions" (
	"id" serial PRIMARY KEY NOT NULL,
	"block_id" integer NOT NULL,
	"version" integer NOT NULL,
	"content" text NOT NULL,
	"token_estimate" integer,
	"change_reason" text,
	"changed_by" varchar,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "knowledge_blocks" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" varchar(255) NOT NULL,
	"slug" varchar(100) NOT NULL,
	"description" text,
	"category" "knowledge_block_category" NOT NULL,
	"layer" "knowledge_block_layer" NOT NULL,
	"content" text NOT NULL,
	"token_estimate" integer,
	"is_active" boolean DEFAULT true NOT NULL,
	"is_system" boolean DEFAULT false NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"created_by" varchar,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "knowledge_blocks_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "lead_comments" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"lead_id" varchar NOT NULL,
	"client_account_id" varchar NOT NULL,
	"client_user_id" varchar,
	"comment_text" text NOT NULL,
	"is_internal" boolean DEFAULT false,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"deleted_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "lead_form_submissions" (
	"id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"form_id" varchar(36) NOT NULL,
	"opportunity_id" varchar(36),
	"submitter_email" varchar(320) NOT NULL,
	"submitter_name" varchar(255),
	"company_name" varchar(255),
	"job_title" varchar(255),
	"form_data" jsonb NOT NULL,
	"ip_address" varchar(45),
	"user_agent" text,
	"source_url" varchar(512),
	"processed" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "lead_forms" (
	"id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" varchar(255) NOT NULL,
	"form_type" "lead_form_type" NOT NULL,
	"pipeline_id" varchar(36) NOT NULL,
	"initial_stage" varchar(120) NOT NULL,
	"auto_assign_to_user_id" varchar(36),
	"webhook_url" varchar(512),
	"is_active" boolean DEFAULT true NOT NULL,
	"asset_url" varchar(512),
	"thank_you_message" text,
	"form_config" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "lead_tag_assignments" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"lead_id" varchar NOT NULL,
	"tag_id" varchar NOT NULL,
	"assigned_by_id" varchar,
	"assigned_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "lead_tag_assignments_lead_id_tag_id_unique" UNIQUE("lead_id","tag_id")
);
--> statement-breakpoint
CREATE TABLE "lead_tags" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"color" text DEFAULT '#6366f1' NOT NULL,
	"description" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "lead_verifications" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"lead_id" varchar NOT NULL,
	"verification_type" "lead_verification_type" NOT NULL,
	"verification_status" "lead_verification_status" DEFAULT 'pending' NOT NULL,
	"agent_id" varchar NOT NULL,
	"screenshot_url" text,
	"screenshot_s3_key" text,
	"ai_validation_result" jsonb,
	"validation_confidence" numeric(5, 2),
	"extracted_data" jsonb,
	"verified_contact_id" varchar,
	"call_recording_id" varchar,
	"reviewed_at" timestamp,
	"reviewed_by_id" varchar,
	"review_notes" text,
	"metadata" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "learning_insights" (
	"id" serial PRIMARY KEY NOT NULL,
	"insight_type" "insight_type" NOT NULL,
	"insight_scope" "insight_scope" NOT NULL,
	"scope_id" varchar(36),
	"pattern_key" text NOT NULL,
	"pattern_name" text NOT NULL,
	"pattern_description" text NOT NULL,
	"pattern_data" jsonb NOT NULL,
	"applies_to_roles" integer[] DEFAULT '{}',
	"applies_to_industries" integer[] DEFAULT '{}',
	"applies_to_seniority" text[] DEFAULT '{}',
	"applies_to_departments" text[] DEFAULT '{}',
	"sample_size" integer NOT NULL,
	"success_rate" numeric(5, 4),
	"avg_engagement_score" numeric(5, 4),
	"avg_qualification_score" numeric(5, 4),
	"confidence" numeric(5, 4) NOT NULL,
	"statistical_significance" numeric(5, 4),
	"recommended_adjustments" jsonb DEFAULT '{}',
	"recommended_messaging" text[] DEFAULT '{}',
	"recommended_approaches" text[] DEFAULT '{}',
	"anti_patterns" text[] DEFAULT '{}',
	"generated_at" timestamp DEFAULT now() NOT NULL,
	"generation_model" text,
	"valid_from" timestamp DEFAULT now() NOT NULL,
	"valid_until" timestamp,
	"is_active" boolean DEFAULT true,
	"version" integer DEFAULT 1,
	"previous_version_id" integer,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "m365_activities" (
	"id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"mailbox_account_id" varchar(36) NOT NULL,
	"activity_type" "m365_activity_type" DEFAULT 'email' NOT NULL,
	"direction" "m365_activity_direction" NOT NULL,
	"message_id" text NOT NULL,
	"conversation_id" text,
	"subject" text,
	"body_preview" text,
	"importance" varchar(16),
	"from_email" varchar(320),
	"from_name" varchar(255),
	"to_recipients" jsonb,
	"cc_recipients" jsonb,
	"received_datetime" timestamp with time zone,
	"sent_datetime" timestamp with time zone,
	"is_read" boolean DEFAULT false,
	"has_attachments" boolean DEFAULT false,
	"account_id" varchar(36),
	"contact_id" varchar(36),
	"web_link" text,
	"synced_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "mailbox_accounts" (
	"id" varchar(36) PRIMARY KEY NOT NULL,
	"tenant_id" varchar(36),
	"user_id" varchar(36) NOT NULL,
	"provider" varchar(32) NOT NULL,
	"status" varchar(32) DEFAULT 'disconnected' NOT NULL,
	"mailbox_email" varchar(320),
	"display_name" varchar(255),
	"connected_at" timestamp with time zone,
	"last_sync_at" timestamp with time zone,
	"access_token" text,
	"refresh_token" text,
	"token_expires_at" timestamp with time zone,
	"encrypted_tokens" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "organization_intelligence_snapshots" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_name" text NOT NULL,
	"website_url" text,
	"industry" text,
	"domain" text,
	"identity" jsonb DEFAULT '{}' NOT NULL,
	"offerings" jsonb DEFAULT '{}' NOT NULL,
	"icp" jsonb DEFAULT '{}' NOT NULL,
	"positioning" jsonb DEFAULT '{}' NOT NULL,
	"outreach" jsonb DEFAULT '{}' NOT NULL,
	"compiled_org_context" text,
	"research_notes" text,
	"raw_research_content" text,
	"research_sources" jsonb,
	"confidence_score" real,
	"model_version" text,
	"is_reusable" boolean DEFAULT false NOT NULL,
	"parent_snapshot_id" varchar,
	"created_by" varchar,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"archived_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "organization_members" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" varchar NOT NULL,
	"user_id" varchar NOT NULL,
	"role" "organization_member_role" DEFAULT 'member' NOT NULL,
	"invited_by" varchar,
	"joined_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "organization_service_catalog" (
	"id" serial PRIMARY KEY NOT NULL,
	"organization_id" varchar,
	"service_name" text NOT NULL,
	"service_category" "service_category" DEFAULT 'other',
	"service_description" text,
	"problems_solved" jsonb DEFAULT '[]' NOT NULL,
	"differentiators" jsonb DEFAULT '[]' NOT NULL,
	"value_propositions" jsonb DEFAULT '[]' NOT NULL,
	"target_industries" text[],
	"target_personas" text[],
	"display_order" integer DEFAULT 0,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_by" varchar,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "participant_call_memory_notes" (
	"id" serial PRIMARY KEY NOT NULL,
	"account_id" varchar,
	"contact_id" varchar NOT NULL,
	"call_attempt_id" varchar,
	"summary" text,
	"payload_json" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "participant_call_plans" (
	"id" serial PRIMARY KEY NOT NULL,
	"workspace_id" varchar,
	"account_id" varchar NOT NULL,
	"contact_id" varchar NOT NULL,
	"campaign_id" varchar,
	"call_attempt_id" varchar,
	"attempt_number" integer DEFAULT 1 NOT NULL,
	"account_call_brief_id" integer,
	"payload_json" jsonb NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "performance_periods" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"label" text NOT NULL,
	"start_at" timestamp NOT NULL,
	"end_at" timestamp NOT NULL,
	"status" "period_status" DEFAULT 'upcoming' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "pipeline_opportunities" (
	"id" varchar(36) PRIMARY KEY NOT NULL,
	"tenant_id" varchar(36),
	"pipeline_id" varchar(36) NOT NULL,
	"account_id" varchar(36),
	"contact_id" varchar(36),
	"owner_id" varchar(36),
	"name" varchar(255) NOT NULL,
	"stage" varchar(120) NOT NULL,
	"status" "pipeline_opportunity_status" DEFAULT 'open' NOT NULL,
	"amount" numeric(14, 2) DEFAULT '0' NOT NULL,
	"currency" varchar(3) DEFAULT 'USD' NOT NULL,
	"probability" integer DEFAULT 0 NOT NULL,
	"close_date" timestamp with time zone,
	"forecast_category" varchar(64) DEFAULT 'Pipeline' NOT NULL,
	"flagged_for_sla" boolean DEFAULT false NOT NULL,
	"reason" text,
	"partner_name" varchar(255),
	"partnership_type" "partnership_type",
	"pricing_model" "pricing_model",
	"cost_per_lead" numeric(10, 2),
	"cost_per_contact" numeric(10, 2),
	"lead_volume_goal" integer,
	"quality_tier" "quality_tier",
	"partner_account_manager" varchar(255),
	"delivery_method" "delivery_method",
	"associated_campaign_ids" jsonb,
	"contract_type" "contract_type",
	"estimated_deal_value" numeric(14, 2),
	"intent_score" integer,
	"lead_source" varchar(255),
	"decision_makers" jsonb,
	"touchpoint_log" jsonb,
	"engagement_score" integer DEFAULT 0,
	"fit_score" integer DEFAULT 0,
	"stage_probability" integer DEFAULT 0,
	"next_action_ai_suggestion" text,
	"last_activity_at" timestamp with time zone,
	"source_asset" varchar(255),
	"date_captured" varchar(64),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "pipelines" (
	"id" varchar(36) PRIMARY KEY NOT NULL,
	"tenant_id" varchar(36),
	"name" varchar(255) NOT NULL,
	"description" text,
	"category" "pipeline_category" DEFAULT 'direct_sales' NOT NULL,
	"owner_id" varchar(36) NOT NULL,
	"default_currency" varchar(3) DEFAULT 'USD' NOT NULL,
	"stage_order" jsonb NOT NULL,
	"sla_policy" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"type" "pipeline_type" DEFAULT 'revenue' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "preview_generated_content" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"session_id" varchar NOT NULL,
	"content_type" "preview_content_type" NOT NULL,
	"content" jsonb NOT NULL,
	"quality_score" numeric(5, 2),
	"regeneration_count" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "preview_simulation_transcripts" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"session_id" varchar NOT NULL,
	"role" "preview_transcript_role" NOT NULL,
	"content" text NOT NULL,
	"timestamp_ms" integer NOT NULL,
	"audio_duration_ms" integer,
	"metadata" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "preview_studio_sessions" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" varchar,
	"campaign_id" varchar NOT NULL,
	"account_id" varchar,
	"contact_id" varchar,
	"user_id" varchar,
	"virtual_agent_id" varchar,
	"session_type" "preview_session_type" DEFAULT 'simulation' NOT NULL,
	"status" "preview_session_status" DEFAULT 'active',
	"metadata" jsonb,
	"ended_at" timestamp,
	"channel_type" "channel_type" DEFAULT 'voice' NOT NULL,
	"mode" varchar(20) DEFAULT 'full' NOT NULL,
	"current_step_id" varchar(100),
	"current_step_index" integer DEFAULT 0,
	"is_complete" boolean DEFAULT false,
	"transcript" jsonb DEFAULT '[]'::jsonb,
	"checkpoints" jsonb DEFAULT '[]'::jsonb,
	"resolved_templates" jsonb,
	"execution_prompt" text,
	"created_by" varchar,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "problem_definitions" (
	"id" serial PRIMARY KEY NOT NULL,
	"organization_id" varchar,
	"problem_statement" text NOT NULL,
	"problem_category" "problem_category" DEFAULT 'efficiency',
	"symptoms" jsonb DEFAULT '[]' NOT NULL,
	"impact_areas" jsonb DEFAULT '[]' NOT NULL,
	"service_ids" integer[],
	"messaging_angles" jsonb DEFAULT '[]' NOT NULL,
	"detection_rules" jsonb DEFAULT '{}' NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_by" varchar,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "producer_metrics" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"campaign_id" varchar NOT NULL,
	"producer_type" "agent_type" NOT NULL,
	"human_agent_id" varchar,
	"virtual_agent_id" varchar,
	"metric_date" date NOT NULL,
	"total_calls" integer DEFAULT 0 NOT NULL,
	"connected_calls" integer DEFAULT 0 NOT NULL,
	"qualified_leads" integer DEFAULT 0 NOT NULL,
	"qc_passed_leads" integer DEFAULT 0 NOT NULL,
	"qc_failed_leads" integer DEFAULT 0 NOT NULL,
	"dnc_requests" integer DEFAULT 0 NOT NULL,
	"opt_out_requests" integer DEFAULT 0 NOT NULL,
	"handoffs_to_human" integer DEFAULT 0 NOT NULL,
	"avg_call_duration" numeric(10, 2),
	"avg_quality_score" numeric(5, 2),
	"conversion_rate" numeric(5, 4),
	"contactability_rate" numeric(5, 4),
	"recycled_contacts" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "projects" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"client_account_id" varchar,
	"name" text NOT NULL,
	"description" text,
	"client_name" text,
	"status" "campaign_status" DEFAULT 'draft' NOT NULL,
	"total_leads_target" integer,
	"cost_per_lead" numeric(10, 2),
	"total_budget" numeric(12, 2),
	"start_date" date,
	"end_date" date,
	"delivery_methods" jsonb DEFAULT '[]'::jsonb,
	"owner_id" varchar,
	"ai_generated_from" varchar,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "prompt_execution_logs" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"virtual_agent_id" varchar,
	"campaign_id" varchar,
	"call_session_id" varchar,
	"prompt_hash" varchar(64),
	"total_tokens" integer,
	"block_versions" jsonb,
	"environment" varchar(20),
	"executed_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "prompt_registry" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"prompt_key" varchar(100) NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"prompt_type" "prompt_type" DEFAULT 'system' NOT NULL,
	"prompt_scope" "prompt_scope" DEFAULT 'agent_type' NOT NULL,
	"agent_type" text,
	"category" "prompt_category",
	"content" text NOT NULL,
	"default_content" text NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"is_locked" boolean DEFAULT false NOT NULL,
	"priority" integer DEFAULT 50 NOT NULL,
	"tags" jsonb DEFAULT '[]'::jsonb,
	"source_file" text,
	"source_line" integer,
	"source_export" text,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"created_by" varchar,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"updated_by" varchar,
	CONSTRAINT "prompt_registry_prompt_key_unique" UNIQUE("prompt_key")
);
--> statement-breakpoint
CREATE TABLE "prompt_variant_tests" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"variant_id" varchar NOT NULL,
	"campaign_id" varchar NOT NULL,
	"call_attempt_id" varchar,
	"disposition" "call_disposition",
	"duration" integer,
	"engagement_score" real,
	"successful" boolean,
	"notes" text,
	"tested_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "prompt_variants" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"account_id" varchar,
	"campaign_id" varchar,
	"virtual_agent_id" varchar,
	"variant_name" text NOT NULL,
	"perspective" "prompt_perspective" NOT NULL,
	"system_prompt" text NOT NULL,
	"first_message" text,
	"context" jsonb,
	"is_active" boolean DEFAULT true NOT NULL,
	"is_default" boolean DEFAULT false NOT NULL,
	"variant_scope" text DEFAULT 'campaign' NOT NULL,
	"test_results" jsonb,
	"created_by" varchar,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "prompt_versions" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"prompt_id" varchar NOT NULL,
	"version" integer NOT NULL,
	"content" text NOT NULL,
	"previous_content" text,
	"change_description" text,
	"changed_by" varchar,
	"changed_at" timestamp DEFAULT now() NOT NULL,
	"added_lines" integer DEFAULT 0,
	"removed_lines" integer DEFAULT 0,
	"modified_lines" integer DEFAULT 0
);
--> statement-breakpoint
CREATE TABLE "qa_gated_content" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"content_type" "qa_content_type" NOT NULL,
	"content_id" varchar NOT NULL,
	"campaign_id" varchar,
	"client_account_id" varchar,
	"project_id" varchar,
	"qa_status" "qa_status" DEFAULT 'new' NOT NULL,
	"qa_score" integer,
	"qa_notes" text,
	"qa_data" jsonb,
	"reviewed_by" varchar,
	"reviewed_at" timestamp,
	"auto_reviewed" boolean DEFAULT false NOT NULL,
	"client_visible" boolean DEFAULT false NOT NULL,
	"published_at" timestamp,
	"created_by" varchar,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "qc_work_queue" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"call_session_id" varchar,
	"lead_id" varchar,
	"campaign_id" varchar NOT NULL,
	"producer_type" "agent_type" NOT NULL,
	"producer_tracking_id" varchar,
	"status" "qc_review_status" DEFAULT 'pending' NOT NULL,
	"priority" integer DEFAULT 0 NOT NULL,
	"assigned_to" varchar,
	"trigger_rule" varchar,
	"review_notes" text,
	"scorecard" jsonb,
	"qc_outcome" text,
	"reviewed_at" timestamp,
	"reviewed_by" varchar,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "recycle_jobs" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"campaign_id" varchar NOT NULL,
	"contact_id" varchar NOT NULL,
	"original_call_session_id" varchar,
	"disposition_id" varchar,
	"trigger_rule" varchar,
	"status" "recycle_status" DEFAULT 'scheduled' NOT NULL,
	"attempt_number" integer DEFAULT 1 NOT NULL,
	"max_attempts" integer DEFAULT 3 NOT NULL,
	"scheduled_at" timestamp NOT NULL,
	"eligible_at" timestamp NOT NULL,
	"target_agent_type" "queue_target_agent_type" DEFAULT 'any' NOT NULL,
	"preferred_time_window" jsonb,
	"processed_at" timestamp,
	"result_queue_item_id" varchar,
	"notes" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "role_adjacency" (
	"id" serial PRIMARY KEY NOT NULL,
	"source_role_id" integer NOT NULL,
	"target_role_id" integer NOT NULL,
	"adjacency_type" "role_adjacency_type" NOT NULL,
	"relationship_strength" numeric(5, 4) DEFAULT '0.5' NOT NULL,
	"context_notes" text,
	"is_bidirectional" boolean DEFAULT false,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "scheduled_emails" (
	"id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"mailbox_account_id" varchar(36) NOT NULL,
	"from_email" varchar(320) NOT NULL,
	"to_emails" text[] NOT NULL,
	"cc_emails" text[],
	"bcc_emails" text[],
	"subject" varchar(512) NOT NULL,
	"body_html" text NOT NULL,
	"body_plain" text,
	"attachments" jsonb,
	"scheduled_for" timestamp with time zone NOT NULL,
	"status" varchar(32) DEFAULT 'pending' NOT NULL,
	"sent_at" timestamp with time zone,
	"failure_reason" text,
	"opportunity_id" varchar(36),
	"contact_id" varchar(36),
	"account_id" varchar(36),
	"created_by" varchar(36) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sequence_email_sends" (
	"id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"enrollment_id" varchar(36) NOT NULL,
	"step_id" varchar(36) NOT NULL,
	"contact_id" varchar(36) NOT NULL,
	"sequence_id" varchar(36) NOT NULL,
	"status" "sequence_email_status" DEFAULT 'scheduled' NOT NULL,
	"scheduled_for" timestamp with time zone NOT NULL,
	"message_id" text,
	"conversation_id" text,
	"subject" text NOT NULL,
	"html_body" text NOT NULL,
	"text_body" text,
	"error" text,
	"retry_count" integer DEFAULT 0 NOT NULL,
	"sent_at" timestamp with time zone,
	"delivered_at" timestamp with time zone,
	"opened_at" timestamp with time zone,
	"clicked_at" timestamp with time zone,
	"replied_at" timestamp with time zone,
	"bounced_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sequence_enrollments" (
	"id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"sequence_id" varchar(36) NOT NULL,
	"contact_id" varchar(36) NOT NULL,
	"enrolled_by" varchar(36) NOT NULL,
	"status" "enrollment_status" DEFAULT 'active' NOT NULL,
	"current_step_number" integer DEFAULT 0 NOT NULL,
	"stop_reason" "enrollment_stop_reason",
	"stopped_at" timestamp with time zone,
	"enrolled_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_activity_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "sequence_steps" (
	"id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"sequence_id" varchar(36) NOT NULL,
	"step_number" integer NOT NULL,
	"name" varchar(255),
	"status" "sequence_step_status" DEFAULT 'active' NOT NULL,
	"delay_days" integer DEFAULT 0 NOT NULL,
	"delay_hours" integer DEFAULT 0 NOT NULL,
	"template_id" varchar(36),
	"subject" text,
	"html_body" text,
	"text_body" text,
	"total_sent" integer DEFAULT 0 NOT NULL,
	"total_opened" integer DEFAULT 0 NOT NULL,
	"total_clicked" integer DEFAULT 0 NOT NULL,
	"total_replied" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "smi_audit_log" (
	"id" serial PRIMARY KEY NOT NULL,
	"operation_type" text NOT NULL,
	"operation_subtype" text,
	"entity_type" text,
	"entity_id" varchar(36),
	"input_data" jsonb,
	"output_data" jsonb,
	"confidence" numeric(5, 4),
	"model_used" text,
	"processing_time_ms" integer,
	"tokens_used" integer,
	"triggered_by" varchar(36),
	"triggered_by_system" boolean DEFAULT false,
	"campaign_id" varchar(36),
	"session_id" varchar(36),
	"ip_address" text,
	"user_agent" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "smtp_providers" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"provider_type" "smtp_provider_type" NOT NULL,
	"auth_type" "smtp_auth_type" NOT NULL,
	"client_id" text,
	"client_secret_encrypted" text,
	"refresh_token_encrypted" text,
	"access_token_encrypted" text,
	"token_expires_at" timestamp,
	"token_scopes" text[],
	"smtp_host" text,
	"smtp_port" integer,
	"smtp_secure" boolean DEFAULT true,
	"smtp_username" text,
	"smtp_password_encrypted" text,
	"email_address" text NOT NULL,
	"display_name" text,
	"reply_to_address" text,
	"daily_send_limit" integer DEFAULT 500,
	"hourly_send_limit" integer DEFAULT 100,
	"sent_today" integer DEFAULT 0,
	"sent_this_hour" integer DEFAULT 0,
	"sent_today_reset_at" timestamp,
	"sent_hour_reset_at" timestamp,
	"is_active" boolean DEFAULT true,
	"is_default" boolean DEFAULT false,
	"verification_status" "smtp_verification_status" DEFAULT 'pending',
	"last_verified_at" timestamp,
	"last_verification_error" text,
	"last_used_at" timestamp,
	"created_by" varchar,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "super_org_credentials" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" varchar NOT NULL,
	"name" text NOT NULL,
	"key" text NOT NULL,
	"category" text NOT NULL,
	"value" text NOT NULL,
	"description" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"expires_at" timestamp,
	"created_by" varchar,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"last_used_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "suppression_list" (
	"id" serial PRIMARY KEY NOT NULL,
	"email" text,
	"email_norm" text,
	"full_name" text,
	"full_name_norm" text,
	"company_name" text,
	"company_norm" text,
	"name_company_hash" text,
	"cav_id" text,
	"cav_user_id" text,
	"reason" text,
	"source" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "transactional_email_logs" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"template_id" varchar,
	"smtp_provider_id" varchar,
	"event_type" "transactional_event_type" NOT NULL,
	"trigger_source" text,
	"recipient_email" text NOT NULL,
	"recipient_user_id" varchar,
	"recipient_name" text,
	"subject" text NOT NULL,
	"html_content_snapshot" text,
	"variables_used" jsonb,
	"status" text DEFAULT 'pending' NOT NULL,
	"message_id" text,
	"error_message" text,
	"error_code" text,
	"retry_count" integer DEFAULT 0,
	"max_retries" integer DEFAULT 3,
	"queued_at" timestamp,
	"sent_at" timestamp,
	"delivered_at" timestamp,
	"failed_at" timestamp,
	"metadata" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "transactional_email_templates" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"event_type" "transactional_event_type" NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"subject" text NOT NULL,
	"html_content" text NOT NULL,
	"text_content" text,
	"variables" jsonb DEFAULT '[]'::jsonb,
	"smtp_provider_id" varchar,
	"is_active" boolean DEFAULT true,
	"is_default" boolean DEFAULT false,
	"version" integer DEFAULT 1,
	"created_by" varchar,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "unified_knowledge_hub" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"sections" jsonb NOT NULL,
	"change_description" text,
	"updated_by" varchar,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "unified_knowledge_versions" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"knowledge_id" varchar NOT NULL,
	"version" integer NOT NULL,
	"sections" jsonb NOT NULL,
	"previous_sections" jsonb,
	"change_description" text,
	"updated_by" varchar,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "variant_selection_history" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"call_attempt_id" varchar NOT NULL,
	"variant_id" varchar,
	"perspective" "prompt_perspective",
	"selection_method" text,
	"selected_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "vector_documents" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"source_type" vector_document_type NOT NULL,
	"source_id" text NOT NULL,
	"content" text NOT NULL,
	"embedding" vector(768) NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb,
	"account_id" varchar(36),
	"industry" text,
	"disposition" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "verification_account_cap_status" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"campaign_id" varchar NOT NULL,
	"account_id" varchar NOT NULL,
	"cap" integer NOT NULL,
	"submitted_count" integer DEFAULT 0 NOT NULL,
	"reserved_count" integer DEFAULT 0 NOT NULL,
	"eligible_count" integer DEFAULT 0 NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "verification_campaign_workflows" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"campaign_id" varchar NOT NULL,
	"current_stage" "workflow_stage" DEFAULT 'eligibility_check' NOT NULL,
	"status" "workflow_status" DEFAULT 'pending' NOT NULL,
	"eligibility_stats" jsonb DEFAULT '{"total":0,"eligible":0,"ineligible":0}'::jsonb,
	"email_validation_stats" jsonb DEFAULT '{"total":0,"processed":0,"skipped":0,"valid":0,"invalid":0}'::jsonb,
	"address_enrichment_stats" jsonb DEFAULT '{"total":0,"processed":0,"skipped":0,"enriched":0,"failed":0}'::jsonb,
	"phone_enrichment_stats" jsonb DEFAULT '{"total":0,"processed":0,"skipped":0,"enriched":0,"failed":0}'::jsonb,
	"error_message" text,
	"retry_count" integer DEFAULT 0 NOT NULL,
	"max_retries" integer DEFAULT 3 NOT NULL,
	"started_at" timestamp,
	"completed_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "verification_campaign_workflows_campaign_id_unique" UNIQUE("campaign_id")
);
--> statement-breakpoint
CREATE TABLE "verification_enrichment_jobs" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"campaign_id" varchar NOT NULL,
	"status" "enrichment_job_status" DEFAULT 'pending' NOT NULL,
	"total_contacts" integer DEFAULT 0 NOT NULL,
	"total_accounts" integer DEFAULT 0 NOT NULL,
	"processed_contacts" integer DEFAULT 0 NOT NULL,
	"processed_accounts" integer DEFAULT 0 NOT NULL,
	"current_chunk" integer DEFAULT 0 NOT NULL,
	"total_chunks" integer DEFAULT 0 NOT NULL,
	"chunk_size" integer DEFAULT 25 NOT NULL,
	"success_count" integer DEFAULT 0 NOT NULL,
	"low_confidence_count" integer DEFAULT 0 NOT NULL,
	"failed_count" integer DEFAULT 0 NOT NULL,
	"skipped_count" integer DEFAULT 0 NOT NULL,
	"errors" jsonb DEFAULT '[]'::jsonb,
	"error_message" text,
	"contact_ids" jsonb,
	"account_ids" jsonb,
	"dedupe_snapshot" jsonb,
	"force" boolean DEFAULT false NOT NULL,
	"created_by" varchar,
	"started_at" timestamp,
	"finished_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "virtual_agents" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"provider" text DEFAULT 'gemini_live' NOT NULL,
	"external_agent_id" text,
	"voice" "ai_voice" DEFAULT 'Fenrir',
	"system_prompt" text,
	"first_message" text,
	"settings" jsonb,
	"is_active" boolean DEFAULT true NOT NULL,
	"demand_agent_type" "demand_agent_type",
	"specialization_config" jsonb,
	"skill_id" text,
	"skill_inputs" jsonb,
	"compiled_prompt_metadata" jsonb,
	"is_foundation_agent" boolean DEFAULT false NOT NULL,
	"foundation_capabilities" jsonb,
	"created_by" varchar,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "dv_account_assignments" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "dv_accounts" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "dv_agent_filters" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "dv_company_caps" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "dv_deliveries" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "dv_exclusion_lists" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "dv_field_constraints" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "dv_field_mappings" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "dv_project_agents" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "dv_project_exclusions" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "dv_projects" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "dv_records" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "dv_records_raw" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "dv_runs" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "dv_selection_sets" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP TABLE "dv_account_assignments" CASCADE;--> statement-breakpoint
DROP TABLE "dv_accounts" CASCADE;--> statement-breakpoint
DROP TABLE "dv_agent_filters" CASCADE;--> statement-breakpoint
DROP TABLE "dv_company_caps" CASCADE;--> statement-breakpoint
DROP TABLE "dv_deliveries" CASCADE;--> statement-breakpoint
DROP TABLE "dv_exclusion_lists" CASCADE;--> statement-breakpoint
DROP TABLE "dv_field_constraints" CASCADE;--> statement-breakpoint
DROP TABLE "dv_field_mappings" CASCADE;--> statement-breakpoint
DROP TABLE "dv_project_agents" CASCADE;--> statement-breakpoint
DROP TABLE "dv_project_exclusions" CASCADE;--> statement-breakpoint
DROP TABLE "dv_projects" CASCADE;--> statement-breakpoint
DROP TABLE "dv_records" CASCADE;--> statement-breakpoint
DROP TABLE "dv_records_raw" CASCADE;--> statement-breakpoint
DROP TABLE "dv_runs" CASCADE;--> statement-breakpoint
DROP TABLE "dv_selection_sets" CASCADE;--> statement-breakpoint
ALTER TABLE "users" DROP CONSTRAINT "users_email_unique";--> statement-breakpoint
ALTER TABLE "leads" DROP CONSTRAINT "leads_call_attempt_id_call_attempts_id_fk";
--> statement-breakpoint
ALTER TABLE "leads" DROP CONSTRAINT "leads_contact_id_contacts_id_fk";
--> statement-breakpoint
ALTER TABLE "leads" DROP CONSTRAINT "leads_campaign_id_campaigns_id_fk";
--> statement-breakpoint
ALTER TABLE "call_attempts" ALTER COLUMN "disposition" SET DATA TYPE text;--> statement-breakpoint
ALTER TABLE "calls" ALTER COLUMN "disposition" SET DATA TYPE text;--> statement-breakpoint
ALTER TABLE "prompt_variant_tests" ALTER COLUMN "disposition" SET DATA TYPE text;--> statement-breakpoint
DROP TYPE "public"."call_disposition";--> statement-breakpoint
CREATE TYPE "public"."call_disposition" AS ENUM('no-answer', 'busy', 'voicemail', 'connected', 'not_interested', 'callback-requested', 'qualified', 'dnc-request', 'wrong_number', 'invalid_data');--> statement-breakpoint
ALTER TABLE "call_attempts" ALTER COLUMN "disposition" SET DATA TYPE "public"."call_disposition" USING "disposition"::"public"."call_disposition";--> statement-breakpoint
ALTER TABLE "calls" ALTER COLUMN "disposition" SET DATA TYPE "public"."call_disposition" USING "disposition"::"public"."call_disposition";--> statement-breakpoint
ALTER TABLE "prompt_variant_tests" ALTER COLUMN "disposition" SET DATA TYPE "public"."call_disposition" USING "disposition"::"public"."call_disposition";--> statement-breakpoint
ALTER TABLE "contacts" ALTER COLUMN "email_verification_status" SET DATA TYPE text;--> statement-breakpoint
ALTER TABLE "contacts" ALTER COLUMN "email_verification_status" SET DEFAULT 'unknown'::text;--> statement-breakpoint
DROP TYPE "public"."email_verification_status";--> statement-breakpoint
CREATE TYPE "public"."email_verification_status" AS ENUM('valid', 'acceptable', 'unknown', 'invalid');--> statement-breakpoint
ALTER TABLE "contacts" ALTER COLUMN "email_verification_status" SET DEFAULT 'unknown'::"public"."email_verification_status";--> statement-breakpoint
ALTER TABLE "contacts" ALTER COLUMN "email_verification_status" SET DATA TYPE "public"."email_verification_status" USING "email_verification_status"::"public"."email_verification_status";--> statement-breakpoint
ALTER TABLE "content_asset_pushes" ALTER COLUMN "status" SET DATA TYPE text;--> statement-breakpoint
ALTER TABLE "content_asset_pushes" ALTER COLUMN "status" SET DEFAULT 'pending'::text;--> statement-breakpoint
DROP TYPE "public"."push_status";--> statement-breakpoint
CREATE TYPE "public"."push_status" AS ENUM('pending', 'in_progress', 'completed', 'failed');--> statement-breakpoint
ALTER TABLE "content_asset_pushes" ALTER COLUMN "status" SET DEFAULT 'pending'::"public"."push_status";--> statement-breakpoint
ALTER TABLE "content_asset_pushes" ALTER COLUMN "status" SET DATA TYPE "public"."push_status" USING "status"::"public"."push_status";--> statement-breakpoint
ALTER TABLE "verification_contacts" ALTER COLUMN "email_status" SET DATA TYPE text;--> statement-breakpoint
ALTER TABLE "verification_contacts" ALTER COLUMN "email_status" SET DEFAULT 'unknown'::text;--> statement-breakpoint
ALTER TABLE "verification_email_validations" ALTER COLUMN "status" SET DATA TYPE text;--> statement-breakpoint
DROP TYPE "public"."verification_email_status";--> statement-breakpoint
CREATE TYPE "public"."verification_email_status" AS ENUM('valid', 'invalid', 'unknown', 'acceptable');--> statement-breakpoint
ALTER TABLE "verification_contacts" ALTER COLUMN "email_status" SET DEFAULT 'unknown'::"public"."verification_email_status";--> statement-breakpoint
ALTER TABLE "verification_contacts" ALTER COLUMN "email_status" SET DATA TYPE "public"."verification_email_status" USING "email_status"::"public"."verification_email_status";--> statement-breakpoint
ALTER TABLE "verification_email_validations" ALTER COLUMN "status" SET DATA TYPE "public"."verification_email_status" USING "status"::"public"."verification_email_status";--> statement-breakpoint
DROP INDEX "accounts_domain_normalized_unique_idx";--> statement-breakpoint
DROP INDEX "accounts_name_city_country_unique_idx";--> statement-breakpoint
DROP INDEX "campaign_agent_assignments_active_agent_uniq";--> statement-breakpoint
DROP INDEX "contacts_email_normalized_unique_idx";--> statement-breakpoint
ALTER TABLE "call_sessions" ALTER COLUMN "call_job_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "campaign_agent_assignments" ALTER COLUMN "agent_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "campaigns" ALTER COLUMN "dial_mode" SET DEFAULT 'ai_agent';--> statement-breakpoint
ALTER TABLE "contacts" ALTER COLUMN "email" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "email_events" ALTER COLUMN "send_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "leads" ALTER COLUMN "contact_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ALTER COLUMN "email" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "verification_campaigns" ALTER COLUMN "email_validation_provider" SET DEFAULT 'kickbox';--> statement-breakpoint
ALTER TABLE "verification_campaigns" ALTER COLUMN "ok_email_states" SET DEFAULT ARRAY['valid', 'acceptable']::text[];--> statement-breakpoint
ALTER TABLE "verification_email_validation_jobs" ALTER COLUMN "status_counts" SET DEFAULT '{"valid":0,"invalid":0,"acceptable":0,"unknown":0}'::jsonb;--> statement-breakpoint
ALTER TABLE "verification_email_validations" ALTER COLUMN "provider" SET DEFAULT 'kickbox';--> statement-breakpoint
ALTER TABLE "verification_email_validations" ADD CONSTRAINT "verification_email_validations_pkey" PRIMARY KEY("contact_id","email_lower");--> statement-breakpoint
ALTER TABLE "accounts" ADD COLUMN "min_annual_revenue" numeric;--> statement-breakpoint
ALTER TABLE "accounts" ADD COLUMN "max_annual_revenue" numeric;--> statement-breakpoint
ALTER TABLE "accounts" ADD COLUMN "min_employees_size" integer;--> statement-breakpoint
ALTER TABLE "accounts" ADD COLUMN "max_employees_size" integer;--> statement-breakpoint
ALTER TABLE "accounts" ADD COLUMN "list" text;--> statement-breakpoint
ALTER TABLE "accounts" ADD COLUMN "email_deliverability_score" numeric(5, 2);--> statement-breakpoint
ALTER TABLE "accounts" ADD COLUMN "email_deliverability_updated_at" timestamp;--> statement-breakpoint
ALTER TABLE "accounts" ADD COLUMN "ch_validated_at" timestamp;--> statement-breakpoint
ALTER TABLE "accounts" ADD COLUMN "ch_validation_status" text;--> statement-breakpoint
ALTER TABLE "accounts" ADD COLUMN "ch_company_number" text;--> statement-breakpoint
ALTER TABLE "accounts" ADD COLUMN "ch_legal_name" text;--> statement-breakpoint
ALTER TABLE "accounts" ADD COLUMN "ch_status" text;--> statement-breakpoint
ALTER TABLE "accounts" ADD COLUMN "ch_is_active" boolean;--> statement-breakpoint
ALTER TABLE "accounts" ADD COLUMN "ch_date_of_creation" date;--> statement-breakpoint
ALTER TABLE "accounts" ADD COLUMN "ch_address" jsonb;--> statement-breakpoint
ALTER TABLE "agent_queue" ADD COLUMN "dialed_number" text;--> statement-breakpoint
ALTER TABLE "call_attempts" ADD COLUMN "original_contact_id" varchar;--> statement-breakpoint
ALTER TABLE "call_attempts" ADD COLUMN "actual_contact_id" varchar;--> statement-breakpoint
ALTER TABLE "call_attempts" ADD COLUMN "wrong_person_answered" boolean DEFAULT false;--> statement-breakpoint
ALTER TABLE "call_sessions" ADD COLUMN "recording_s3_key" text;--> statement-breakpoint
ALTER TABLE "call_sessions" ADD COLUMN "recording_duration_sec" integer;--> statement-breakpoint
ALTER TABLE "call_sessions" ADD COLUMN "recording_status" "recording_status" DEFAULT 'pending';--> statement-breakpoint
ALTER TABLE "call_sessions" ADD COLUMN "recording_format" text DEFAULT 'mp3';--> statement-breakpoint
ALTER TABLE "call_sessions" ADD COLUMN "recording_file_size_bytes" integer;--> statement-breakpoint
ALTER TABLE "call_sessions" ADD COLUMN "agent_type" "agent_type" DEFAULT 'human' NOT NULL;--> statement-breakpoint
ALTER TABLE "call_sessions" ADD COLUMN "agent_user_id" varchar;--> statement-breakpoint
ALTER TABLE "call_sessions" ADD COLUMN "ai_agent_id" text;--> statement-breakpoint
ALTER TABLE "call_sessions" ADD COLUMN "ai_conversation_id" text;--> statement-breakpoint
ALTER TABLE "call_sessions" ADD COLUMN "ai_transcript" text;--> statement-breakpoint
ALTER TABLE "call_sessions" ADD COLUMN "ai_analysis" jsonb;--> statement-breakpoint
ALTER TABLE "call_sessions" ADD COLUMN "ai_disposition" text;--> statement-breakpoint
ALTER TABLE "call_sessions" ADD COLUMN "campaign_id" varchar;--> statement-breakpoint
ALTER TABLE "call_sessions" ADD COLUMN "contact_id" varchar;--> statement-breakpoint
ALTER TABLE "call_sessions" ADD COLUMN "queue_item_id" varchar;--> statement-breakpoint
ALTER TABLE "calls" ADD COLUMN "telnyx_call_id" text;--> statement-breakpoint
ALTER TABLE "calls" ADD COLUMN "dialed_number" text;--> statement-breakpoint
ALTER TABLE "campaign_agent_assignments" ADD COLUMN "virtual_agent_id" varchar;--> statement-breakpoint
ALTER TABLE "campaign_agent_assignments" ADD COLUMN "agent_type" "agent_type" DEFAULT 'human' NOT NULL;--> statement-breakpoint
ALTER TABLE "campaign_orders" ADD COLUMN "webhook_url" text;--> statement-breakpoint
ALTER TABLE "campaign_orders" ADD COLUMN "delivery_config" jsonb;--> statement-breakpoint
ALTER TABLE "campaign_queue" ADD COLUMN "virtual_agent_id" varchar;--> statement-breakpoint
ALTER TABLE "campaign_queue" ADD COLUMN "target_agent_type" "queue_target_agent_type" DEFAULT 'any' NOT NULL;--> statement-breakpoint
ALTER TABLE "campaign_queue" ADD COLUMN "dialed_number" text;--> statement-breakpoint
ALTER TABLE "campaigns" ADD COLUMN "client_account_id" varchar;--> statement-breakpoint
ALTER TABLE "campaigns" ADD COLUMN "project_id" varchar;--> statement-breakpoint
ALTER TABLE "campaigns" ADD COLUMN "approval_status" "content_approval_status" DEFAULT 'draft' NOT NULL;--> statement-breakpoint
ALTER TABLE "campaigns" ADD COLUMN "approved_by_id" varchar;--> statement-breakpoint
ALTER TABLE "campaigns" ADD COLUMN "approved_at" timestamp;--> statement-breakpoint
ALTER TABLE "campaigns" ADD COLUMN "published_at" timestamp;--> statement-breakpoint
ALTER TABLE "campaigns" ADD COLUMN "ai_agent_settings" jsonb;--> statement-breakpoint
ALTER TABLE "campaigns" ADD COLUMN "custom_qa_fields" jsonb;--> statement-breakpoint
ALTER TABLE "campaigns" ADD COLUMN "custom_qa_rules" text;--> statement-breakpoint
ALTER TABLE "campaigns" ADD COLUMN "parsed_qa_rules" jsonb;--> statement-breakpoint
ALTER TABLE "campaigns" ADD COLUMN "recording_auto_sync_enabled" boolean DEFAULT false;--> statement-breakpoint
ALTER TABLE "campaigns" ADD COLUMN "companies_house_validation" jsonb;--> statement-breakpoint
ALTER TABLE "campaigns" ADD COLUMN "delivery_template_id" varchar;--> statement-breakpoint
ALTER TABLE "campaigns" ADD COLUMN "voice_provider" text;--> statement-breakpoint
ALTER TABLE "campaigns" ADD COLUMN "voice_provider_fallback" boolean DEFAULT true;--> statement-breakpoint
ALTER TABLE "campaigns" ADD COLUMN "max_call_duration_seconds" integer DEFAULT 240;--> statement-breakpoint
ALTER TABLE "campaigns" ADD COLUMN "problem_intelligence_org_id" varchar;--> statement-breakpoint
ALTER TABLE "campaigns" ADD COLUMN "campaign_objective" text;--> statement-breakpoint
ALTER TABLE "campaigns" ADD COLUMN "product_service_info" text;--> statement-breakpoint
ALTER TABLE "campaigns" ADD COLUMN "talking_points" jsonb;--> statement-breakpoint
ALTER TABLE "campaigns" ADD COLUMN "target_audience_description" text;--> statement-breakpoint
ALTER TABLE "campaigns" ADD COLUMN "campaign_objections" jsonb;--> statement-breakpoint
ALTER TABLE "campaigns" ADD COLUMN "success_criteria" text;--> statement-breakpoint
ALTER TABLE "campaigns" ADD COLUMN "campaign_context_brief" text;--> statement-breakpoint
ALTER TABLE "campaigns" ADD COLUMN "call_flow" jsonb;--> statement-breakpoint
ALTER TABLE "campaigns" ADD COLUMN "require_account_intelligence" boolean DEFAULT false;--> statement-breakpoint
ALTER TABLE "campaigns" ADD COLUMN "enabled_channels" text[] DEFAULT ARRAY['voice']::text[];--> statement-breakpoint
ALTER TABLE "campaigns" ADD COLUMN "channel_generation_status" jsonb;--> statement-breakpoint
ALTER TABLE "contacts" ADD COLUMN "full_name_norm" text;--> statement-breakpoint
ALTER TABLE "contacts" ADD COLUMN "company_norm" text;--> statement-breakpoint
ALTER TABLE "contacts" ADD COLUMN "name_company_hash" text;--> statement-breakpoint
ALTER TABLE "contacts" ADD COLUMN "cav_id" text;--> statement-breakpoint
ALTER TABLE "contacts" ADD COLUMN "cav_user_id" text;--> statement-breakpoint
ALTER TABLE "contacts" ADD COLUMN "last_call_attempt_at" timestamp;--> statement-breakpoint
ALTER TABLE "contacts" ADD COLUMN "last_call_outcome" text;--> statement-breakpoint
ALTER TABLE "contacts" ADD COLUMN "next_call_eligible_at" timestamp;--> statement-breakpoint
ALTER TABLE "contacts" ADD COLUMN "suppression_reason" text;--> statement-breakpoint
ALTER TABLE "email_events" ADD COLUMN "campaign_id" varchar;--> statement-breakpoint
ALTER TABLE "email_events" ADD COLUMN "contact_id" varchar;--> statement-breakpoint
ALTER TABLE "email_events" ADD COLUMN "message_id" text;--> statement-breakpoint
ALTER TABLE "email_events" ADD COLUMN "recipient" text NOT NULL;--> statement-breakpoint
ALTER TABLE "email_events" ADD COLUMN "bounce_type" text;--> statement-breakpoint
ALTER TABLE "email_templates" ADD COLUMN "description" text;--> statement-breakpoint
ALTER TABLE "email_templates" ADD COLUMN "plain_text_content" text;--> statement-breakpoint
ALTER TABLE "email_templates" ADD COLUMN "category" varchar(100);--> statement-breakpoint
ALTER TABLE "email_templates" ADD COLUMN "is_active" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "email_templates" ADD COLUMN "created_by" varchar;--> statement-breakpoint
ALTER TABLE "leads" ADD COLUMN "recording_s3_key" text;--> statement-breakpoint
ALTER TABLE "leads" ADD COLUMN "dialed_number" text;--> statement-breakpoint
ALTER TABLE "leads" ADD COLUMN "telnyx_call_id" text;--> statement-breakpoint
ALTER TABLE "leads" ADD COLUMN "account_name" text;--> statement-breakpoint
ALTER TABLE "leads" ADD COLUMN "account_industry" text;--> statement-breakpoint
ALTER TABLE "leads" ADD COLUMN "original_contact_id" varchar;--> statement-breakpoint
ALTER TABLE "leads" ADD COLUMN "actual_contact_id" varchar;--> statement-breakpoint
ALTER TABLE "leads" ADD COLUMN "wrong_person_answered" boolean DEFAULT false;--> statement-breakpoint
ALTER TABLE "leads" ADD COLUMN "rejected_at" timestamp;--> statement-breakpoint
ALTER TABLE "leads" ADD COLUMN "rejected_by_id" varchar;--> statement-breakpoint
ALTER TABLE "leads" ADD COLUMN "custom_fields" jsonb;--> statement-breakpoint
ALTER TABLE "leads" ADD COLUMN "structured_transcript" jsonb;--> statement-breakpoint
ALTER TABLE "leads" ADD COLUMN "recording_status" text;--> statement-breakpoint
ALTER TABLE "leads" ADD COLUMN "qa_data" jsonb;--> statement-breakpoint
ALTER TABLE "leads" ADD COLUMN "delivered_at" timestamp;--> statement-breakpoint
ALTER TABLE "leads" ADD COLUMN "delivered_by_id" varchar;--> statement-breakpoint
ALTER TABLE "leads" ADD COLUMN "delivery_source" "lead_delivery_source";--> statement-breakpoint
ALTER TABLE "leads" ADD COLUMN "delivery_notes" text;--> statement-breakpoint
ALTER TABLE "leads" ADD COLUMN "verification_status" "lead_verification_status";--> statement-breakpoint
ALTER TABLE "leads" ADD COLUMN "verification_id" varchar;--> statement-breakpoint
ALTER TABLE "leads" ADD COLUMN "qa_decision" text;--> statement-breakpoint
ALTER TABLE "leads" ADD COLUMN "linkedin_image_url" text;--> statement-breakpoint
ALTER TABLE "leads" ADD COLUMN "linkedin_verification_data" jsonb;--> statement-breakpoint
ALTER TABLE "leads" ADD COLUMN "linkedin_url" text;--> statement-breakpoint
ALTER TABLE "leads" ADD COLUMN "verified_at" timestamp;--> statement-breakpoint
ALTER TABLE "leads" ADD COLUMN "verified_by" varchar;--> statement-breakpoint
ALTER TABLE "leads" ADD COLUMN "deleted_at" timestamp;--> statement-breakpoint
ALTER TABLE "leads" ADD COLUMN "deleted_by_id" varchar;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "callback_phone" text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "sip_extension" text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "mfa_enabled" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "totp_secret" text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "backup_codes" jsonb;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "used_backup_codes" jsonb DEFAULT '[]'::jsonb;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "mfa_enrolled_at" timestamp;--> statement-breakpoint
ALTER TABLE "verification_campaigns" ADD COLUMN "priority_config" jsonb DEFAULT '{"seniorityWeight": 0.20, "titleAlignmentWeight": 0.10, "emailQualityWeight": 0.30, "phoneCompletenessWeight": 0.20, "addressCompletenessWeight": 0.20}'::jsonb;--> statement-breakpoint
ALTER TABLE "verification_campaigns" ADD COLUMN "workflow_triggered_at" timestamp;--> statement-breakpoint
ALTER TABLE "verification_contacts" ADD COLUMN "is_business_email" boolean;--> statement-breakpoint
ALTER TABLE "verification_contacts" ADD COLUMN "email_risk_level" "email_risk_level" DEFAULT 'unknown';--> statement-breakpoint
ALTER TABLE "verification_contacts" ADD COLUMN "email_eligible" boolean DEFAULT false;--> statement-breakpoint
ALTER TABLE "verification_contacts" ADD COLUMN "email_eligibility_reason" text;--> statement-breakpoint
ALTER TABLE "verification_contacts" ADD COLUMN "deep_verified_at" timestamp;--> statement-breakpoint
ALTER TABLE "verification_contacts" ADD COLUMN "kickbox_result" text;--> statement-breakpoint
ALTER TABLE "verification_contacts" ADD COLUMN "kickbox_reason" text;--> statement-breakpoint
ALTER TABLE "verification_contacts" ADD COLUMN "kickbox_score" numeric(5, 2);--> statement-breakpoint
ALTER TABLE "verification_contacts" ADD COLUMN "kickbox_accept_all" boolean;--> statement-breakpoint
ALTER TABLE "verification_contacts" ADD COLUMN "kickbox_disposable" boolean;--> statement-breakpoint
ALTER TABLE "verification_contacts" ADD COLUMN "kickbox_free" boolean;--> statement-breakpoint
ALTER TABLE "verification_contacts" ADD COLUMN "kickbox_role" boolean;--> statement-breakpoint
ALTER TABLE "verification_contacts" ADD COLUMN "seniority_level" "seniority_level" DEFAULT 'unknown';--> statement-breakpoint
ALTER TABLE "verification_contacts" ADD COLUMN "title_alignment_score" numeric(3, 2);--> statement-breakpoint
ALTER TABLE "verification_contacts" ADD COLUMN "email_quality_score" numeric(3, 2);--> statement-breakpoint
ALTER TABLE "verification_contacts" ADD COLUMN "phone_completeness_score" numeric(3, 2);--> statement-breakpoint
ALTER TABLE "verification_contacts" ADD COLUMN "address_completeness_score" numeric(3, 2);--> statement-breakpoint
ALTER TABLE "verification_contacts" ADD COLUMN "comprehensive_priority_score" numeric(10, 2);--> statement-breakpoint
ALTER TABLE "verification_contacts" ADD COLUMN "reserved_slot" boolean DEFAULT false;--> statement-breakpoint
ALTER TABLE "verification_contacts" ADD COLUMN "submitted_to_client_at" timestamp;--> statement-breakpoint
ALTER TABLE "verification_contacts" ADD COLUMN "client_delivery_excluded_until" timestamp;--> statement-breakpoint
ALTER TABLE "verification_contacts" ADD COLUMN "name_company_hash" text;--> statement-breakpoint
ALTER TABLE "verification_contacts" ADD COLUMN "ai_enriched_address1" text;--> statement-breakpoint
ALTER TABLE "verification_contacts" ADD COLUMN "ai_enriched_address2" text;--> statement-breakpoint
ALTER TABLE "verification_contacts" ADD COLUMN "ai_enriched_address3" text;--> statement-breakpoint
ALTER TABLE "verification_contacts" ADD COLUMN "ai_enriched_city" text;--> statement-breakpoint
ALTER TABLE "verification_contacts" ADD COLUMN "ai_enriched_state" text;--> statement-breakpoint
ALTER TABLE "verification_contacts" ADD COLUMN "ai_enriched_postal" text;--> statement-breakpoint
ALTER TABLE "verification_contacts" ADD COLUMN "ai_enriched_country" text;--> statement-breakpoint
ALTER TABLE "verification_contacts" ADD COLUMN "ai_enriched_phone" text;--> statement-breakpoint
ALTER TABLE "verification_contacts" ADD COLUMN "custom_fields" jsonb;--> statement-breakpoint
ALTER TABLE "verification_email_validations" ADD COLUMN "syntax_valid" boolean;--> statement-breakpoint
ALTER TABLE "verification_email_validations" ADD COLUMN "has_mx" boolean;--> statement-breakpoint
ALTER TABLE "verification_email_validations" ADD COLUMN "has_smtp" boolean;--> statement-breakpoint
ALTER TABLE "verification_email_validations" ADD COLUMN "smtp_accepted" boolean;--> statement-breakpoint
ALTER TABLE "verification_email_validations" ADD COLUMN "is_role" boolean;--> statement-breakpoint
ALTER TABLE "verification_email_validations" ADD COLUMN "is_free" boolean;--> statement-breakpoint
ALTER TABLE "verification_email_validations" ADD COLUMN "is_disposable" boolean;--> statement-breakpoint
ALTER TABLE "verification_email_validations" ADD COLUMN "is_spam_trap" boolean;--> statement-breakpoint
ALTER TABLE "verification_email_validations" ADD COLUMN "is_accept_all" boolean;--> statement-breakpoint
ALTER TABLE "verification_email_validations" ADD COLUMN "is_disabled" boolean;--> statement-breakpoint
ALTER TABLE "verification_email_validations" ADD COLUMN "confidence" integer;--> statement-breakpoint
ALTER TABLE "verification_email_validations" ADD COLUMN "validation_trace" jsonb;--> statement-breakpoint
ALTER TABLE "verification_email_validations" ADD COLUMN "kickbox_result" text;--> statement-breakpoint
ALTER TABLE "verification_email_validations" ADD COLUMN "kickbox_reason" text;--> statement-breakpoint
ALTER TABLE "verification_email_validations" ADD COLUMN "kickbox_score" numeric(5, 2);--> statement-breakpoint
ALTER TABLE "verification_email_validations" ADD COLUMN "kickbox_did_you_mean" text;--> statement-breakpoint
ALTER TABLE "verification_email_validations" ADD COLUMN "kickbox_disposable" boolean;--> statement-breakpoint
ALTER TABLE "verification_email_validations" ADD COLUMN "kickbox_accept_all" boolean;--> statement-breakpoint
ALTER TABLE "verification_email_validations" ADD COLUMN "kickbox_free" boolean;--> statement-breakpoint
ALTER TABLE "verification_email_validations" ADD COLUMN "kickbox_role" boolean;--> statement-breakpoint
ALTER TABLE "verification_email_validations" ADD COLUMN "kickbox_response" jsonb;--> statement-breakpoint
ALTER TABLE "verification_email_validations" ADD COLUMN "risk_level" "email_risk_level" DEFAULT 'unknown';--> statement-breakpoint
ALTER TABLE "verification_email_validations" ADD COLUMN "is_business_email" boolean;--> statement-breakpoint
ALTER TABLE "verification_email_validations" ADD COLUMN "email_eligible" boolean DEFAULT false;--> statement-breakpoint
ALTER TABLE "verification_email_validations" ADD COLUMN "eligibility_reason" text;--> statement-breakpoint
ALTER TABLE "verification_email_validations" ADD COLUMN "deep_verified_at" timestamp;--> statement-breakpoint
ALTER TABLE "verification_upload_jobs" ADD COLUMN "job_type" "upload_job_type" NOT NULL;--> statement-breakpoint
ALTER TABLE "verification_upload_jobs" ADD COLUMN "s3_key" varchar;--> statement-breakpoint
ALTER TABLE "account_call_briefs" ADD CONSTRAINT "account_call_briefs_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "account_call_briefs" ADD CONSTRAINT "account_call_briefs_campaign_id_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaigns"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "account_call_memory_notes" ADD CONSTRAINT "account_call_memory_notes_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "account_call_memory_notes" ADD CONSTRAINT "account_call_memory_notes_call_attempt_id_dialer_call_attempts_id_fk" FOREIGN KEY ("call_attempt_id") REFERENCES "public"."dialer_call_attempts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "org_intelligence_profiles" ADD CONSTRAINT "org_intelligence_profiles_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "account_intelligence" ADD CONSTRAINT "account_intelligence_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "account_messaging_briefs" ADD CONSTRAINT "account_messaging_briefs_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "account_messaging_briefs" ADD CONSTRAINT "account_messaging_briefs_campaign_id_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaigns"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "account_perspective_analysis" ADD CONSTRAINT "account_perspective_analysis_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "account_perspective_analysis" ADD CONSTRAINT "account_perspective_analysis_perspective_id_business_perspectives_id_fk" FOREIGN KEY ("perspective_id") REFERENCES "public"."business_perspectives"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_defaults" ADD CONSTRAINT "agent_defaults_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_goals" ADD CONSTRAINT "agent_goals_agent_id_users_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_goals" ADD CONSTRAINT "agent_goals_period_id_performance_periods_id_fk" FOREIGN KEY ("period_id") REFERENCES "public"."performance_periods"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_goals" ADD CONSTRAINT "agent_goals_goal_definition_id_goal_definitions_id_fk" FOREIGN KEY ("goal_definition_id") REFERENCES "public"."goal_definitions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_goals" ADD CONSTRAINT "agent_goals_reward_id_gamification_rewards_id_fk" FOREIGN KEY ("reward_id") REFERENCES "public"."gamification_rewards"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_goals" ADD CONSTRAINT "agent_goals_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_instance_contexts" ADD CONSTRAINT "agent_instance_contexts_virtual_agent_id_virtual_agents_id_fk" FOREIGN KEY ("virtual_agent_id") REFERENCES "public"."virtual_agents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_instance_contexts" ADD CONSTRAINT "agent_instance_contexts_campaign_id_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaigns"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_knowledge_config" ADD CONSTRAINT "agent_knowledge_config_virtual_agent_id_virtual_agents_id_fk" FOREIGN KEY ("virtual_agent_id") REFERENCES "public"."virtual_agents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_knowledge_config" ADD CONSTRAINT "agent_knowledge_config_block_id_knowledge_blocks_id_fk" FOREIGN KEY ("block_id") REFERENCES "public"."knowledge_blocks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_period_stats" ADD CONSTRAINT "agent_period_stats_agent_id_users_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_period_stats" ADD CONSTRAINT "agent_period_stats_period_id_performance_periods_id_fk" FOREIGN KEY ("period_id") REFERENCES "public"."performance_periods"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_simulations" ADD CONSTRAINT "agent_simulations_campaign_id_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaigns"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_simulations" ADD CONSTRAINT "agent_simulations_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_simulations" ADD CONSTRAINT "agent_simulations_contact_id_contacts_id_fk" FOREIGN KEY ("contact_id") REFERENCES "public"."contacts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_simulations" ADD CONSTRAINT "agent_simulations_virtual_agent_id_virtual_agents_id_fk" FOREIGN KEY ("virtual_agent_id") REFERENCES "public"."virtual_agents"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_simulations" ADD CONSTRAINT "agent_simulations_run_by_users_id_fk" FOREIGN KEY ("run_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_steps" ADD CONSTRAINT "agent_steps_run_id_agent_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."agent_runs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_intent_feedback" ADD CONSTRAINT "ai_intent_feedback_intent_id_ai_project_intents_id_fk" FOREIGN KEY ("intent_id") REFERENCES "public"."ai_project_intents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_intent_feedback" ADD CONSTRAINT "ai_intent_feedback_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_project_intents" ADD CONSTRAINT "ai_project_intents_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_project_intents" ADD CONSTRAINT "ai_project_intents_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_project_intents" ADD CONSTRAINT "ai_project_intents_reviewed_by_users_id_fk" FOREIGN KEY ("reviewed_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "blacklist_check_history" ADD CONSTRAINT "blacklist_check_history_monitor_id_blacklist_monitors_id_fk" FOREIGN KEY ("monitor_id") REFERENCES "public"."blacklist_monitors"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "blacklist_monitors" ADD CONSTRAINT "blacklist_monitors_domain_auth_id_domain_auth_id_fk" FOREIGN KEY ("domain_auth_id") REFERENCES "public"."domain_auth"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "call_followup_emails" ADD CONSTRAINT "call_followup_emails_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "call_followup_emails" ADD CONSTRAINT "call_followup_emails_contact_id_contacts_id_fk" FOREIGN KEY ("contact_id") REFERENCES "public"."contacts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "call_followup_emails" ADD CONSTRAINT "call_followup_emails_campaign_id_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaigns"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "call_followup_emails" ADD CONSTRAINT "call_followup_emails_call_attempt_id_dialer_call_attempts_id_fk" FOREIGN KEY ("call_attempt_id") REFERENCES "public"."dialer_call_attempts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "call_outcome_learnings" ADD CONSTRAINT "call_outcome_learnings_campaign_id_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaigns"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "call_outcome_learnings" ADD CONSTRAINT "call_outcome_learnings_contact_id_contacts_id_fk" FOREIGN KEY ("contact_id") REFERENCES "public"."contacts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "call_outcome_learnings" ADD CONSTRAINT "call_outcome_learnings_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "call_outcome_learnings" ADD CONSTRAINT "call_outcome_learnings_contact_role_id_job_role_taxonomy_id_fk" FOREIGN KEY ("contact_role_id") REFERENCES "public"."job_role_taxonomy"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "call_outcome_learnings" ADD CONSTRAINT "call_outcome_learnings_industry_id_industry_taxonomy_id_fk" FOREIGN KEY ("industry_id") REFERENCES "public"."industry_taxonomy"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "call_producer_tracking" ADD CONSTRAINT "call_producer_tracking_call_session_id_call_sessions_id_fk" FOREIGN KEY ("call_session_id") REFERENCES "public"."call_sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "call_producer_tracking" ADD CONSTRAINT "call_producer_tracking_campaign_id_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaigns"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "call_producer_tracking" ADD CONSTRAINT "call_producer_tracking_contact_id_contacts_id_fk" FOREIGN KEY ("contact_id") REFERENCES "public"."contacts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "call_producer_tracking" ADD CONSTRAINT "call_producer_tracking_human_agent_id_users_id_fk" FOREIGN KEY ("human_agent_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "call_producer_tracking" ADD CONSTRAINT "call_producer_tracking_virtual_agent_id_virtual_agents_id_fk" FOREIGN KEY ("virtual_agent_id") REFERENCES "public"."virtual_agents"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "call_quality_records" ADD CONSTRAINT "call_quality_records_call_session_id_call_sessions_id_fk" FOREIGN KEY ("call_session_id") REFERENCES "public"."call_sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "call_quality_records" ADD CONSTRAINT "call_quality_records_dialer_call_attempt_id_dialer_call_attempts_id_fk" FOREIGN KEY ("dialer_call_attempt_id") REFERENCES "public"."dialer_call_attempts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "call_quality_records" ADD CONSTRAINT "call_quality_records_campaign_id_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaigns"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "call_quality_records" ADD CONSTRAINT "call_quality_records_contact_id_contacts_id_fk" FOREIGN KEY ("contact_id") REFERENCES "public"."contacts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campaign_account_problems" ADD CONSTRAINT "campaign_account_problems_campaign_id_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaigns"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campaign_account_problems" ADD CONSTRAINT "campaign_account_problems_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campaign_channel_variants" ADD CONSTRAINT "campaign_channel_variants_campaign_id_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaigns"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campaign_channel_variants" ADD CONSTRAINT "campaign_channel_variants_approved_by_users_id_fk" FOREIGN KEY ("approved_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campaign_execution_prompts" ADD CONSTRAINT "campaign_execution_prompts_campaign_id_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaigns"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campaign_execution_prompts" ADD CONSTRAINT "campaign_execution_prompts_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campaign_execution_prompts" ADD CONSTRAINT "campaign_execution_prompts_contact_id_contacts_id_fk" FOREIGN KEY ("contact_id") REFERENCES "public"."contacts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campaign_knowledge_config" ADD CONSTRAINT "campaign_knowledge_config_campaign_id_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaigns"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campaign_knowledge_config" ADD CONSTRAINT "campaign_knowledge_config_block_id_knowledge_blocks_id_fk" FOREIGN KEY ("block_id") REFERENCES "public"."knowledge_blocks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campaign_org_intelligence_bindings" ADD CONSTRAINT "campaign_org_intelligence_bindings_campaign_id_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaigns"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campaign_org_intelligence_bindings" ADD CONSTRAINT "campaign_org_intelligence_bindings_snapshot_id_organization_intelligence_snapshots_id_fk" FOREIGN KEY ("snapshot_id") REFERENCES "public"."organization_intelligence_snapshots"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campaign_org_intelligence_bindings" ADD CONSTRAINT "campaign_org_intelligence_bindings_master_org_intelligence_id_org_intelligence_profiles_id_fk" FOREIGN KEY ("master_org_intelligence_id") REFERENCES "public"."org_intelligence_profiles"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campaign_org_intelligence_bindings" ADD CONSTRAINT "campaign_org_intelligence_bindings_bound_by_users_id_fk" FOREIGN KEY ("bound_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campaign_organizations" ADD CONSTRAINT "campaign_organizations_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campaign_service_customizations" ADD CONSTRAINT "campaign_service_customizations_campaign_id_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaigns"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campaign_service_customizations" ADD CONSTRAINT "campaign_service_customizations_service_id_organization_service_catalog_id_fk" FOREIGN KEY ("service_id") REFERENCES "public"."organization_service_catalog"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campaign_suppression_domains" ADD CONSTRAINT "campaign_suppression_domains_campaign_id_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaigns"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campaign_suppression_domains" ADD CONSTRAINT "campaign_suppression_domains_added_by_users_id_fk" FOREIGN KEY ("added_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campaign_suppression_emails" ADD CONSTRAINT "campaign_suppression_emails_campaign_id_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaigns"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campaign_suppression_emails" ADD CONSTRAINT "campaign_suppression_emails_added_by_users_id_fk" FOREIGN KEY ("added_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campaign_templates" ADD CONSTRAINT "campaign_templates_campaign_id_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaigns"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campaign_templates" ADD CONSTRAINT "campaign_templates_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campaign_templates" ADD CONSTRAINT "campaign_templates_contact_id_contacts_id_fk" FOREIGN KEY ("contact_id") REFERENCES "public"."contacts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campaign_templates" ADD CONSTRAINT "campaign_templates_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campaign_test_calls" ADD CONSTRAINT "campaign_test_calls_campaign_id_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaigns"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campaign_test_calls" ADD CONSTRAINT "campaign_test_calls_virtual_agent_id_virtual_agents_id_fk" FOREIGN KEY ("virtual_agent_id") REFERENCES "public"."virtual_agents"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campaign_test_calls" ADD CONSTRAINT "campaign_test_calls_call_session_id_call_sessions_id_fk" FOREIGN KEY ("call_session_id") REFERENCES "public"."call_sessions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campaign_test_calls" ADD CONSTRAINT "campaign_test_calls_tested_by_users_id_fk" FOREIGN KEY ("tested_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "client_accounts" ADD CONSTRAINT "client_accounts_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "client_activity_costs" ADD CONSTRAINT "client_activity_costs_client_account_id_client_accounts_id_fk" FOREIGN KEY ("client_account_id") REFERENCES "public"."client_accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "client_activity_costs" ADD CONSTRAINT "client_activity_costs_project_id_client_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."client_projects"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "client_activity_costs" ADD CONSTRAINT "client_activity_costs_campaign_id_verification_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."verification_campaigns"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "client_activity_costs" ADD CONSTRAINT "client_activity_costs_order_id_client_portal_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."client_portal_orders"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "client_billing_config" ADD CONSTRAINT "client_billing_config_client_account_id_client_accounts_id_fk" FOREIGN KEY ("client_account_id") REFERENCES "public"."client_accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "client_campaign_access" ADD CONSTRAINT "client_campaign_access_client_account_id_client_accounts_id_fk" FOREIGN KEY ("client_account_id") REFERENCES "public"."client_accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "client_campaign_access" ADD CONSTRAINT "client_campaign_access_campaign_id_verification_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."verification_campaigns"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "client_campaign_access" ADD CONSTRAINT "client_campaign_access_regular_campaign_id_campaigns_id_fk" FOREIGN KEY ("regular_campaign_id") REFERENCES "public"."campaigns"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "client_campaign_access" ADD CONSTRAINT "client_campaign_access_granted_by_users_id_fk" FOREIGN KEY ("granted_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "client_delivery_access_log" ADD CONSTRAINT "client_delivery_access_log_delivery_link_id_client_delivery_links_id_fk" FOREIGN KEY ("delivery_link_id") REFERENCES "public"."client_delivery_links"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "client_delivery_access_log" ADD CONSTRAINT "client_delivery_access_log_accessed_by_user_id_client_users_id_fk" FOREIGN KEY ("accessed_by_user_id") REFERENCES "public"."client_users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "client_delivery_links" ADD CONSTRAINT "client_delivery_links_client_account_id_client_accounts_id_fk" FOREIGN KEY ("client_account_id") REFERENCES "public"."client_accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "client_delivery_links" ADD CONSTRAINT "client_delivery_links_order_id_client_portal_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."client_portal_orders"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "client_delivery_links" ADD CONSTRAINT "client_delivery_links_campaign_id_verification_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."verification_campaigns"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "client_delivery_links" ADD CONSTRAINT "client_delivery_links_project_id_client_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."client_projects"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "client_delivery_links" ADD CONSTRAINT "client_delivery_links_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "client_invoice_activity" ADD CONSTRAINT "client_invoice_activity_invoice_id_client_invoices_id_fk" FOREIGN KEY ("invoice_id") REFERENCES "public"."client_invoices"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "client_invoice_activity" ADD CONSTRAINT "client_invoice_activity_performed_by_users_id_fk" FOREIGN KEY ("performed_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "client_invoice_activity" ADD CONSTRAINT "client_invoice_activity_performed_by_client_client_users_id_fk" FOREIGN KEY ("performed_by_client") REFERENCES "public"."client_users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "client_invoice_items" ADD CONSTRAINT "client_invoice_items_invoice_id_client_invoices_id_fk" FOREIGN KEY ("invoice_id") REFERENCES "public"."client_invoices"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "client_invoice_items" ADD CONSTRAINT "client_invoice_items_project_id_client_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."client_projects"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "client_invoice_items" ADD CONSTRAINT "client_invoice_items_campaign_id_verification_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."verification_campaigns"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "client_invoices" ADD CONSTRAINT "client_invoices_client_account_id_client_accounts_id_fk" FOREIGN KEY ("client_account_id") REFERENCES "public"."client_accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "client_invoices" ADD CONSTRAINT "client_invoices_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "client_invoices" ADD CONSTRAINT "client_invoices_sent_by_users_id_fk" FOREIGN KEY ("sent_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "client_mock_calls" ADD CONSTRAINT "client_mock_calls_client_account_id_client_accounts_id_fk" FOREIGN KEY ("client_account_id") REFERENCES "public"."client_accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "client_mock_calls" ADD CONSTRAINT "client_mock_calls_campaign_id_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaigns"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "client_mock_calls" ADD CONSTRAINT "client_mock_calls_project_id_client_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."client_projects"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "client_mock_calls" ADD CONSTRAINT "client_mock_calls_qa_content_id_qa_gated_content_id_fk" FOREIGN KEY ("qa_content_id") REFERENCES "public"."qa_gated_content"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "client_mock_calls" ADD CONSTRAINT "client_mock_calls_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "client_organization_links" ADD CONSTRAINT "client_organization_links_client_account_id_client_accounts_id_fk" FOREIGN KEY ("client_account_id") REFERENCES "public"."client_accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "client_organization_links" ADD CONSTRAINT "client_organization_links_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "client_portal_activity_logs" ADD CONSTRAINT "client_portal_activity_logs_client_account_id_client_accounts_id_fk" FOREIGN KEY ("client_account_id") REFERENCES "public"."client_accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "client_portal_activity_logs" ADD CONSTRAINT "client_portal_activity_logs_client_user_id_client_users_id_fk" FOREIGN KEY ("client_user_id") REFERENCES "public"."client_users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "client_portal_order_contacts" ADD CONSTRAINT "client_portal_order_contacts_order_id_client_portal_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."client_portal_orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "client_portal_order_contacts" ADD CONSTRAINT "client_portal_order_contacts_verification_contact_id_verification_contacts_id_fk" FOREIGN KEY ("verification_contact_id") REFERENCES "public"."verification_contacts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "client_portal_order_contacts" ADD CONSTRAINT "client_portal_order_contacts_selected_by_users_id_fk" FOREIGN KEY ("selected_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "client_portal_orders" ADD CONSTRAINT "client_portal_orders_client_account_id_client_accounts_id_fk" FOREIGN KEY ("client_account_id") REFERENCES "public"."client_accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "client_portal_orders" ADD CONSTRAINT "client_portal_orders_client_user_id_client_users_id_fk" FOREIGN KEY ("client_user_id") REFERENCES "public"."client_users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "client_portal_orders" ADD CONSTRAINT "client_portal_orders_campaign_id_verification_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."verification_campaigns"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "client_portal_orders" ADD CONSTRAINT "client_portal_orders_approved_by_users_id_fk" FOREIGN KEY ("approved_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "client_portal_orders" ADD CONSTRAINT "client_portal_orders_rejected_by_users_id_fk" FOREIGN KEY ("rejected_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "client_project_campaigns" ADD CONSTRAINT "client_project_campaigns_project_id_client_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."client_projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "client_project_campaigns" ADD CONSTRAINT "client_project_campaigns_campaign_id_verification_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."verification_campaigns"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "client_project_campaigns" ADD CONSTRAINT "client_project_campaigns_assigned_by_users_id_fk" FOREIGN KEY ("assigned_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "client_projects" ADD CONSTRAINT "client_projects_client_account_id_client_accounts_id_fk" FOREIGN KEY ("client_account_id") REFERENCES "public"."client_accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "client_projects" ADD CONSTRAINT "client_projects_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "client_reports" ADD CONSTRAINT "client_reports_client_account_id_client_accounts_id_fk" FOREIGN KEY ("client_account_id") REFERENCES "public"."client_accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "client_reports" ADD CONSTRAINT "client_reports_campaign_id_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaigns"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "client_reports" ADD CONSTRAINT "client_reports_project_id_client_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."client_projects"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "client_reports" ADD CONSTRAINT "client_reports_qa_content_id_qa_gated_content_id_fk" FOREIGN KEY ("qa_content_id") REFERENCES "public"."qa_gated_content"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "client_reports" ADD CONSTRAINT "client_reports_generated_by_users_id_fk" FOREIGN KEY ("generated_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "client_simulation_sessions" ADD CONSTRAINT "client_simulation_sessions_client_account_id_client_accounts_id_fk" FOREIGN KEY ("client_account_id") REFERENCES "public"."client_accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "client_simulation_sessions" ADD CONSTRAINT "client_simulation_sessions_client_user_id_client_users_id_fk" FOREIGN KEY ("client_user_id") REFERENCES "public"."client_users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "client_simulation_sessions" ADD CONSTRAINT "client_simulation_sessions_campaign_id_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaigns"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "client_simulation_sessions" ADD CONSTRAINT "client_simulation_sessions_project_id_client_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."client_projects"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "client_simulation_sessions" ADD CONSTRAINT "client_simulation_sessions_qa_content_id_qa_gated_content_id_fk" FOREIGN KEY ("qa_content_id") REFERENCES "public"."qa_gated_content"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "client_users" ADD CONSTRAINT "client_users_client_account_id_client_accounts_id_fk" FOREIGN KEY ("client_account_id") REFERENCES "public"."client_accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "client_users" ADD CONSTRAINT "client_users_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "client_voice_commands" ADD CONSTRAINT "client_voice_commands_client_user_id_client_users_id_fk" FOREIGN KEY ("client_user_id") REFERENCES "public"."client_users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "client_voice_commands" ADD CONSTRAINT "client_voice_commands_client_account_id_client_accounts_id_fk" FOREIGN KEY ("client_account_id") REFERENCES "public"."client_accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "client_voice_config" ADD CONSTRAINT "client_voice_config_client_account_id_client_accounts_id_fk" FOREIGN KEY ("client_account_id") REFERENCES "public"."client_accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contact_intelligence" ADD CONSTRAINT "contact_intelligence_contact_id_contacts_id_fk" FOREIGN KEY ("contact_id") REFERENCES "public"."contacts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contact_intelligence" ADD CONSTRAINT "contact_intelligence_normalized_role_id_job_role_taxonomy_id_fk" FOREIGN KEY ("normalized_role_id") REFERENCES "public"."job_role_taxonomy"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contact_predictive_scores" ADD CONSTRAINT "contact_predictive_scores_contact_id_contacts_id_fk" FOREIGN KEY ("contact_id") REFERENCES "public"."contacts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contact_predictive_scores" ADD CONSTRAINT "contact_predictive_scores_campaign_id_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaigns"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "csv_mapping_templates" ADD CONSTRAINT "csv_mapping_templates_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deal_activities" ADD CONSTRAINT "deal_activities_opportunity_id_pipeline_opportunities_id_fk" FOREIGN KEY ("opportunity_id") REFERENCES "public"."pipeline_opportunities"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deal_activities" ADD CONSTRAINT "deal_activities_actor_id_users_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deal_conversations" ADD CONSTRAINT "deal_conversations_opportunity_id_pipeline_opportunities_id_fk" FOREIGN KEY ("opportunity_id") REFERENCES "public"."pipeline_opportunities"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deal_insights" ADD CONSTRAINT "deal_insights_opportunity_id_pipeline_opportunities_id_fk" FOREIGN KEY ("opportunity_id") REFERENCES "public"."pipeline_opportunities"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deal_messages" ADD CONSTRAINT "deal_messages_conversation_id_deal_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."deal_conversations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deal_messages" ADD CONSTRAINT "deal_messages_opportunity_id_pipeline_opportunities_id_fk" FOREIGN KEY ("opportunity_id") REFERENCES "public"."pipeline_opportunities"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deal_score_history" ADD CONSTRAINT "deal_score_history_opportunity_id_pipeline_opportunities_id_fk" FOREIGN KEY ("opportunity_id") REFERENCES "public"."pipeline_opportunities"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deal_score_history" ADD CONSTRAINT "deal_score_history_changed_by_users_id_fk" FOREIGN KEY ("changed_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dialer_call_attempts" ADD CONSTRAINT "dialer_call_attempts_dialer_run_id_dialer_runs_id_fk" FOREIGN KEY ("dialer_run_id") REFERENCES "public"."dialer_runs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dialer_call_attempts" ADD CONSTRAINT "dialer_call_attempts_campaign_id_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaigns"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dialer_call_attempts" ADD CONSTRAINT "dialer_call_attempts_contact_id_contacts_id_fk" FOREIGN KEY ("contact_id") REFERENCES "public"."contacts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dialer_call_attempts" ADD CONSTRAINT "dialer_call_attempts_queue_item_id_campaign_queue_id_fk" FOREIGN KEY ("queue_item_id") REFERENCES "public"."campaign_queue"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dialer_call_attempts" ADD CONSTRAINT "dialer_call_attempts_call_session_id_call_sessions_id_fk" FOREIGN KEY ("call_session_id") REFERENCES "public"."call_sessions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dialer_call_attempts" ADD CONSTRAINT "dialer_call_attempts_human_agent_id_users_id_fk" FOREIGN KEY ("human_agent_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dialer_call_attempts" ADD CONSTRAINT "dialer_call_attempts_virtual_agent_id_virtual_agents_id_fk" FOREIGN KEY ("virtual_agent_id") REFERENCES "public"."virtual_agents"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dialer_call_attempts" ADD CONSTRAINT "dialer_call_attempts_disposition_submitted_by_users_id_fk" FOREIGN KEY ("disposition_submitted_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dialer_runs" ADD CONSTRAINT "dialer_runs_campaign_id_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaigns"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dialer_runs" ADD CONSTRAINT "dialer_runs_human_agent_id_users_id_fk" FOREIGN KEY ("human_agent_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dialer_runs" ADD CONSTRAINT "dialer_runs_virtual_agent_id_virtual_agents_id_fk" FOREIGN KEY ("virtual_agent_id") REFERENCES "public"."virtual_agents"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dialer_runs" ADD CONSTRAINT "dialer_runs_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "disposition_rules" ADD CONSTRAINT "disposition_rules_disposition_id_dispositions_id_fk" FOREIGN KEY ("disposition_id") REFERENCES "public"."dispositions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "disposition_rules" ADD CONSTRAINT "disposition_rules_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dnc_reconciliation_log" ADD CONSTRAINT "dnc_reconciliation_log_contact_id_contacts_id_fk" FOREIGN KEY ("contact_id") REFERENCES "public"."contacts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dnc_reconciliation_log" ADD CONSTRAINT "dnc_reconciliation_log_call_session_id_call_sessions_id_fk" FOREIGN KEY ("call_session_id") REFERENCES "public"."call_sessions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "domain_configuration" ADD CONSTRAINT "domain_configuration_domain_auth_id_domain_auth_id_fk" FOREIGN KEY ("domain_auth_id") REFERENCES "public"."domain_auth"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "domain_health_scores" ADD CONSTRAINT "domain_health_scores_domain_auth_id_domain_auth_id_fk" FOREIGN KEY ("domain_auth_id") REFERENCES "public"."domain_auth"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "domain_warmup_schedule" ADD CONSTRAINT "domain_warmup_schedule_domain_auth_id_domain_auth_id_fk" FOREIGN KEY ("domain_auth_id") REFERENCES "public"."domain_auth"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "email_ai_rewrites" ADD CONSTRAINT "email_ai_rewrites_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "email_ai_rewrites" ADD CONSTRAINT "email_ai_rewrites_message_id_deal_messages_id_fk" FOREIGN KEY ("message_id") REFERENCES "public"."deal_messages"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "email_link_clicks" ADD CONSTRAINT "email_link_clicks_message_id_deal_messages_id_fk" FOREIGN KEY ("message_id") REFERENCES "public"."deal_messages"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "email_opens" ADD CONSTRAINT "email_opens_message_id_deal_messages_id_fk" FOREIGN KEY ("message_id") REFERENCES "public"."deal_messages"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "email_sequences" ADD CONSTRAINT "email_sequences_mailbox_account_id_mailbox_accounts_id_fk" FOREIGN KEY ("mailbox_account_id") REFERENCES "public"."mailbox_accounts"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "email_sequences" ADD CONSTRAINT "email_sequences_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "email_signatures" ADD CONSTRAINT "email_signatures_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "email_suppression_list" ADD CONSTRAINT "email_suppression_list_campaign_id_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaigns"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "email_suppression_list" ADD CONSTRAINT "email_suppression_list_contact_id_contacts_id_fk" FOREIGN KEY ("contact_id") REFERENCES "public"."contacts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "export_templates" ADD CONSTRAINT "export_templates_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gamification_rewards" ADD CONSTRAINT "gamification_rewards_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "goal_definitions" ADD CONSTRAINT "goal_definitions_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "governance_actions_log" ADD CONSTRAINT "governance_actions_log_campaign_id_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaigns"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "governance_actions_log" ADD CONSTRAINT "governance_actions_log_contact_id_contacts_id_fk" FOREIGN KEY ("contact_id") REFERENCES "public"."contacts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "governance_actions_log" ADD CONSTRAINT "governance_actions_log_call_session_id_call_sessions_id_fk" FOREIGN KEY ("call_session_id") REFERENCES "public"."call_sessions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "governance_actions_log" ADD CONSTRAINT "governance_actions_log_disposition_id_dispositions_id_fk" FOREIGN KEY ("disposition_id") REFERENCES "public"."dispositions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "governance_actions_log" ADD CONSTRAINT "governance_actions_log_trigger_rule_id_disposition_rules_id_fk" FOREIGN KEY ("trigger_rule_id") REFERENCES "public"."disposition_rules"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inbox_categories" ADD CONSTRAINT "inbox_categories_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inbox_categories" ADD CONSTRAINT "inbox_categories_message_id_deal_messages_id_fk" FOREIGN KEY ("message_id") REFERENCES "public"."deal_messages"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "industry_department_pain_points" ADD CONSTRAINT "industry_department_pain_points_industry_id_industry_taxonomy_id_fk" FOREIGN KEY ("industry_id") REFERENCES "public"."industry_taxonomy"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "industry_taxonomy" ADD CONSTRAINT "industry_taxonomy_parent_industry_id_industry_taxonomy_id_fk" FOREIGN KEY ("parent_industry_id") REFERENCES "public"."industry_taxonomy"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "job_role_taxonomy" ADD CONSTRAINT "job_role_taxonomy_parent_role_id_job_role_taxonomy_id_fk" FOREIGN KEY ("parent_role_id") REFERENCES "public"."job_role_taxonomy"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "job_role_taxonomy" ADD CONSTRAINT "job_role_taxonomy_typical_reports_to_job_role_taxonomy_id_fk" FOREIGN KEY ("typical_reports_to") REFERENCES "public"."job_role_taxonomy"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "job_title_mappings" ADD CONSTRAINT "job_title_mappings_mapped_role_id_job_role_taxonomy_id_fk" FOREIGN KEY ("mapped_role_id") REFERENCES "public"."job_role_taxonomy"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "job_title_mappings" ADD CONSTRAINT "job_title_mappings_verified_by_users_id_fk" FOREIGN KEY ("verified_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "knowledge_block_versions" ADD CONSTRAINT "knowledge_block_versions_block_id_knowledge_blocks_id_fk" FOREIGN KEY ("block_id") REFERENCES "public"."knowledge_blocks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "knowledge_block_versions" ADD CONSTRAINT "knowledge_block_versions_changed_by_users_id_fk" FOREIGN KEY ("changed_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "knowledge_blocks" ADD CONSTRAINT "knowledge_blocks_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lead_comments" ADD CONSTRAINT "lead_comments_lead_id_leads_id_fk" FOREIGN KEY ("lead_id") REFERENCES "public"."leads"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lead_comments" ADD CONSTRAINT "lead_comments_client_account_id_client_accounts_id_fk" FOREIGN KEY ("client_account_id") REFERENCES "public"."client_accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lead_comments" ADD CONSTRAINT "lead_comments_client_user_id_client_users_id_fk" FOREIGN KEY ("client_user_id") REFERENCES "public"."client_users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lead_form_submissions" ADD CONSTRAINT "lead_form_submissions_form_id_lead_forms_id_fk" FOREIGN KEY ("form_id") REFERENCES "public"."lead_forms"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lead_form_submissions" ADD CONSTRAINT "lead_form_submissions_opportunity_id_pipeline_opportunities_id_fk" FOREIGN KEY ("opportunity_id") REFERENCES "public"."pipeline_opportunities"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lead_forms" ADD CONSTRAINT "lead_forms_pipeline_id_pipelines_id_fk" FOREIGN KEY ("pipeline_id") REFERENCES "public"."pipelines"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lead_forms" ADD CONSTRAINT "lead_forms_auto_assign_to_user_id_users_id_fk" FOREIGN KEY ("auto_assign_to_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lead_tag_assignments" ADD CONSTRAINT "lead_tag_assignments_lead_id_leads_id_fk" FOREIGN KEY ("lead_id") REFERENCES "public"."leads"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lead_tag_assignments" ADD CONSTRAINT "lead_tag_assignments_tag_id_lead_tags_id_fk" FOREIGN KEY ("tag_id") REFERENCES "public"."lead_tags"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lead_tag_assignments" ADD CONSTRAINT "lead_tag_assignments_assigned_by_id_users_id_fk" FOREIGN KEY ("assigned_by_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lead_verifications" ADD CONSTRAINT "lead_verifications_lead_id_leads_id_fk" FOREIGN KEY ("lead_id") REFERENCES "public"."leads"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lead_verifications" ADD CONSTRAINT "lead_verifications_agent_id_users_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lead_verifications" ADD CONSTRAINT "lead_verifications_verified_contact_id_contacts_id_fk" FOREIGN KEY ("verified_contact_id") REFERENCES "public"."contacts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lead_verifications" ADD CONSTRAINT "lead_verifications_call_recording_id_call_attempts_id_fk" FOREIGN KEY ("call_recording_id") REFERENCES "public"."call_attempts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lead_verifications" ADD CONSTRAINT "lead_verifications_reviewed_by_id_users_id_fk" FOREIGN KEY ("reviewed_by_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "learning_insights" ADD CONSTRAINT "learning_insights_previous_version_id_learning_insights_id_fk" FOREIGN KEY ("previous_version_id") REFERENCES "public"."learning_insights"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "m365_activities" ADD CONSTRAINT "m365_activities_mailbox_account_id_mailbox_accounts_id_fk" FOREIGN KEY ("mailbox_account_id") REFERENCES "public"."mailbox_accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "m365_activities" ADD CONSTRAINT "m365_activities_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "m365_activities" ADD CONSTRAINT "m365_activities_contact_id_contacts_id_fk" FOREIGN KEY ("contact_id") REFERENCES "public"."contacts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mailbox_accounts" ADD CONSTRAINT "mailbox_accounts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "organization_intelligence_snapshots" ADD CONSTRAINT "organization_intelligence_snapshots_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "organization_members" ADD CONSTRAINT "organization_members_organization_id_campaign_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."campaign_organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "organization_members" ADD CONSTRAINT "organization_members_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "organization_members" ADD CONSTRAINT "organization_members_invited_by_users_id_fk" FOREIGN KEY ("invited_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "organization_service_catalog" ADD CONSTRAINT "organization_service_catalog_organization_id_campaign_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."campaign_organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "organization_service_catalog" ADD CONSTRAINT "organization_service_catalog_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "participant_call_memory_notes" ADD CONSTRAINT "participant_call_memory_notes_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "participant_call_memory_notes" ADD CONSTRAINT "participant_call_memory_notes_contact_id_contacts_id_fk" FOREIGN KEY ("contact_id") REFERENCES "public"."contacts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "participant_call_memory_notes" ADD CONSTRAINT "participant_call_memory_notes_call_attempt_id_dialer_call_attempts_id_fk" FOREIGN KEY ("call_attempt_id") REFERENCES "public"."dialer_call_attempts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "participant_call_plans" ADD CONSTRAINT "participant_call_plans_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "participant_call_plans" ADD CONSTRAINT "participant_call_plans_contact_id_contacts_id_fk" FOREIGN KEY ("contact_id") REFERENCES "public"."contacts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "participant_call_plans" ADD CONSTRAINT "participant_call_plans_campaign_id_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaigns"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "participant_call_plans" ADD CONSTRAINT "participant_call_plans_call_attempt_id_dialer_call_attempts_id_fk" FOREIGN KEY ("call_attempt_id") REFERENCES "public"."dialer_call_attempts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "participant_call_plans" ADD CONSTRAINT "participant_call_plans_account_call_brief_id_account_call_briefs_id_fk" FOREIGN KEY ("account_call_brief_id") REFERENCES "public"."account_call_briefs"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pipeline_opportunities" ADD CONSTRAINT "pipeline_opportunities_pipeline_id_pipelines_id_fk" FOREIGN KEY ("pipeline_id") REFERENCES "public"."pipelines"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pipeline_opportunities" ADD CONSTRAINT "pipeline_opportunities_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pipeline_opportunities" ADD CONSTRAINT "pipeline_opportunities_contact_id_contacts_id_fk" FOREIGN KEY ("contact_id") REFERENCES "public"."contacts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pipeline_opportunities" ADD CONSTRAINT "pipeline_opportunities_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pipelines" ADD CONSTRAINT "pipelines_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "preview_generated_content" ADD CONSTRAINT "preview_generated_content_session_id_preview_studio_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."preview_studio_sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "preview_simulation_transcripts" ADD CONSTRAINT "preview_simulation_transcripts_session_id_preview_studio_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."preview_studio_sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "preview_studio_sessions" ADD CONSTRAINT "preview_studio_sessions_campaign_id_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaigns"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "preview_studio_sessions" ADD CONSTRAINT "preview_studio_sessions_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "preview_studio_sessions" ADD CONSTRAINT "preview_studio_sessions_contact_id_contacts_id_fk" FOREIGN KEY ("contact_id") REFERENCES "public"."contacts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "preview_studio_sessions" ADD CONSTRAINT "preview_studio_sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "preview_studio_sessions" ADD CONSTRAINT "preview_studio_sessions_virtual_agent_id_virtual_agents_id_fk" FOREIGN KEY ("virtual_agent_id") REFERENCES "public"."virtual_agents"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "preview_studio_sessions" ADD CONSTRAINT "preview_studio_sessions_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "problem_definitions" ADD CONSTRAINT "problem_definitions_organization_id_campaign_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."campaign_organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "problem_definitions" ADD CONSTRAINT "problem_definitions_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "producer_metrics" ADD CONSTRAINT "producer_metrics_campaign_id_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaigns"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "producer_metrics" ADD CONSTRAINT "producer_metrics_human_agent_id_users_id_fk" FOREIGN KEY ("human_agent_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "producer_metrics" ADD CONSTRAINT "producer_metrics_virtual_agent_id_virtual_agents_id_fk" FOREIGN KEY ("virtual_agent_id") REFERENCES "public"."virtual_agents"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "projects" ADD CONSTRAINT "projects_client_account_id_client_accounts_id_fk" FOREIGN KEY ("client_account_id") REFERENCES "public"."client_accounts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "projects" ADD CONSTRAINT "projects_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "prompt_execution_logs" ADD CONSTRAINT "prompt_execution_logs_virtual_agent_id_virtual_agents_id_fk" FOREIGN KEY ("virtual_agent_id") REFERENCES "public"."virtual_agents"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "prompt_execution_logs" ADD CONSTRAINT "prompt_execution_logs_campaign_id_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaigns"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "prompt_registry" ADD CONSTRAINT "prompt_registry_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "prompt_registry" ADD CONSTRAINT "prompt_registry_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "prompt_variant_tests" ADD CONSTRAINT "prompt_variant_tests_variant_id_prompt_variants_id_fk" FOREIGN KEY ("variant_id") REFERENCES "public"."prompt_variants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "prompt_variant_tests" ADD CONSTRAINT "prompt_variant_tests_campaign_id_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaigns"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "prompt_variant_tests" ADD CONSTRAINT "prompt_variant_tests_call_attempt_id_call_attempts_id_fk" FOREIGN KEY ("call_attempt_id") REFERENCES "public"."call_attempts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "prompt_variants" ADD CONSTRAINT "prompt_variants_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "prompt_variants" ADD CONSTRAINT "prompt_variants_campaign_id_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaigns"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "prompt_variants" ADD CONSTRAINT "prompt_variants_virtual_agent_id_virtual_agents_id_fk" FOREIGN KEY ("virtual_agent_id") REFERENCES "public"."virtual_agents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "prompt_variants" ADD CONSTRAINT "prompt_variants_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "prompt_versions" ADD CONSTRAINT "prompt_versions_prompt_id_prompt_registry_id_fk" FOREIGN KEY ("prompt_id") REFERENCES "public"."prompt_registry"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "prompt_versions" ADD CONSTRAINT "prompt_versions_changed_by_users_id_fk" FOREIGN KEY ("changed_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "qa_gated_content" ADD CONSTRAINT "qa_gated_content_campaign_id_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaigns"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "qa_gated_content" ADD CONSTRAINT "qa_gated_content_client_account_id_client_accounts_id_fk" FOREIGN KEY ("client_account_id") REFERENCES "public"."client_accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "qa_gated_content" ADD CONSTRAINT "qa_gated_content_project_id_client_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."client_projects"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "qa_gated_content" ADD CONSTRAINT "qa_gated_content_reviewed_by_users_id_fk" FOREIGN KEY ("reviewed_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "qa_gated_content" ADD CONSTRAINT "qa_gated_content_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "qc_work_queue" ADD CONSTRAINT "qc_work_queue_call_session_id_call_sessions_id_fk" FOREIGN KEY ("call_session_id") REFERENCES "public"."call_sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "qc_work_queue" ADD CONSTRAINT "qc_work_queue_lead_id_leads_id_fk" FOREIGN KEY ("lead_id") REFERENCES "public"."leads"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "qc_work_queue" ADD CONSTRAINT "qc_work_queue_campaign_id_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaigns"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "qc_work_queue" ADD CONSTRAINT "qc_work_queue_producer_tracking_id_call_producer_tracking_id_fk" FOREIGN KEY ("producer_tracking_id") REFERENCES "public"."call_producer_tracking"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "qc_work_queue" ADD CONSTRAINT "qc_work_queue_assigned_to_users_id_fk" FOREIGN KEY ("assigned_to") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "qc_work_queue" ADD CONSTRAINT "qc_work_queue_trigger_rule_disposition_rules_id_fk" FOREIGN KEY ("trigger_rule") REFERENCES "public"."disposition_rules"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "qc_work_queue" ADD CONSTRAINT "qc_work_queue_reviewed_by_users_id_fk" FOREIGN KEY ("reviewed_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recycle_jobs" ADD CONSTRAINT "recycle_jobs_campaign_id_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaigns"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recycle_jobs" ADD CONSTRAINT "recycle_jobs_contact_id_contacts_id_fk" FOREIGN KEY ("contact_id") REFERENCES "public"."contacts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recycle_jobs" ADD CONSTRAINT "recycle_jobs_original_call_session_id_call_sessions_id_fk" FOREIGN KEY ("original_call_session_id") REFERENCES "public"."call_sessions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recycle_jobs" ADD CONSTRAINT "recycle_jobs_disposition_id_dispositions_id_fk" FOREIGN KEY ("disposition_id") REFERENCES "public"."dispositions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recycle_jobs" ADD CONSTRAINT "recycle_jobs_trigger_rule_disposition_rules_id_fk" FOREIGN KEY ("trigger_rule") REFERENCES "public"."disposition_rules"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "role_adjacency" ADD CONSTRAINT "role_adjacency_source_role_id_job_role_taxonomy_id_fk" FOREIGN KEY ("source_role_id") REFERENCES "public"."job_role_taxonomy"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "role_adjacency" ADD CONSTRAINT "role_adjacency_target_role_id_job_role_taxonomy_id_fk" FOREIGN KEY ("target_role_id") REFERENCES "public"."job_role_taxonomy"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scheduled_emails" ADD CONSTRAINT "scheduled_emails_mailbox_account_id_mailbox_accounts_id_fk" FOREIGN KEY ("mailbox_account_id") REFERENCES "public"."mailbox_accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scheduled_emails" ADD CONSTRAINT "scheduled_emails_opportunity_id_pipeline_opportunities_id_fk" FOREIGN KEY ("opportunity_id") REFERENCES "public"."pipeline_opportunities"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scheduled_emails" ADD CONSTRAINT "scheduled_emails_contact_id_contacts_id_fk" FOREIGN KEY ("contact_id") REFERENCES "public"."contacts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scheduled_emails" ADD CONSTRAINT "scheduled_emails_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scheduled_emails" ADD CONSTRAINT "scheduled_emails_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sequence_email_sends" ADD CONSTRAINT "sequence_email_sends_enrollment_id_sequence_enrollments_id_fk" FOREIGN KEY ("enrollment_id") REFERENCES "public"."sequence_enrollments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sequence_email_sends" ADD CONSTRAINT "sequence_email_sends_step_id_sequence_steps_id_fk" FOREIGN KEY ("step_id") REFERENCES "public"."sequence_steps"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sequence_email_sends" ADD CONSTRAINT "sequence_email_sends_contact_id_contacts_id_fk" FOREIGN KEY ("contact_id") REFERENCES "public"."contacts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sequence_email_sends" ADD CONSTRAINT "sequence_email_sends_sequence_id_email_sequences_id_fk" FOREIGN KEY ("sequence_id") REFERENCES "public"."email_sequences"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sequence_enrollments" ADD CONSTRAINT "sequence_enrollments_sequence_id_email_sequences_id_fk" FOREIGN KEY ("sequence_id") REFERENCES "public"."email_sequences"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sequence_enrollments" ADD CONSTRAINT "sequence_enrollments_contact_id_contacts_id_fk" FOREIGN KEY ("contact_id") REFERENCES "public"."contacts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sequence_enrollments" ADD CONSTRAINT "sequence_enrollments_enrolled_by_users_id_fk" FOREIGN KEY ("enrolled_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sequence_steps" ADD CONSTRAINT "sequence_steps_sequence_id_email_sequences_id_fk" FOREIGN KEY ("sequence_id") REFERENCES "public"."email_sequences"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sequence_steps" ADD CONSTRAINT "sequence_steps_template_id_email_templates_id_fk" FOREIGN KEY ("template_id") REFERENCES "public"."email_templates"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "smi_audit_log" ADD CONSTRAINT "smi_audit_log_triggered_by_users_id_fk" FOREIGN KEY ("triggered_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "smtp_providers" ADD CONSTRAINT "smtp_providers_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "super_org_credentials" ADD CONSTRAINT "super_org_credentials_organization_id_campaign_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."campaign_organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "super_org_credentials" ADD CONSTRAINT "super_org_credentials_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transactional_email_logs" ADD CONSTRAINT "transactional_email_logs_template_id_transactional_email_templates_id_fk" FOREIGN KEY ("template_id") REFERENCES "public"."transactional_email_templates"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transactional_email_logs" ADD CONSTRAINT "transactional_email_logs_smtp_provider_id_smtp_providers_id_fk" FOREIGN KEY ("smtp_provider_id") REFERENCES "public"."smtp_providers"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transactional_email_logs" ADD CONSTRAINT "transactional_email_logs_recipient_user_id_users_id_fk" FOREIGN KEY ("recipient_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transactional_email_templates" ADD CONSTRAINT "transactional_email_templates_smtp_provider_id_smtp_providers_id_fk" FOREIGN KEY ("smtp_provider_id") REFERENCES "public"."smtp_providers"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transactional_email_templates" ADD CONSTRAINT "transactional_email_templates_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "unified_knowledge_hub" ADD CONSTRAINT "unified_knowledge_hub_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "unified_knowledge_versions" ADD CONSTRAINT "unified_knowledge_versions_knowledge_id_unified_knowledge_hub_id_fk" FOREIGN KEY ("knowledge_id") REFERENCES "public"."unified_knowledge_hub"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "unified_knowledge_versions" ADD CONSTRAINT "unified_knowledge_versions_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "variant_selection_history" ADD CONSTRAINT "variant_selection_history_call_attempt_id_call_attempts_id_fk" FOREIGN KEY ("call_attempt_id") REFERENCES "public"."call_attempts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "variant_selection_history" ADD CONSTRAINT "variant_selection_history_variant_id_prompt_variants_id_fk" FOREIGN KEY ("variant_id") REFERENCES "public"."prompt_variants"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "verification_account_cap_status" ADD CONSTRAINT "verification_account_cap_status_campaign_id_verification_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."verification_campaigns"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "verification_account_cap_status" ADD CONSTRAINT "verification_account_cap_status_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "verification_campaign_workflows" ADD CONSTRAINT "verification_campaign_workflows_campaign_id_verification_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."verification_campaigns"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "verification_enrichment_jobs" ADD CONSTRAINT "verification_enrichment_jobs_campaign_id_verification_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."verification_campaigns"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "verification_enrichment_jobs" ADD CONSTRAINT "verification_enrichment_jobs_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "virtual_agents" ADD CONSTRAINT "virtual_agents_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "account_call_briefs_account_id_idx" ON "account_call_briefs" USING btree ("account_id");--> statement-breakpoint
CREATE INDEX "account_call_briefs_campaign_id_idx" ON "account_call_briefs" USING btree ("campaign_id");--> statement-breakpoint
CREATE INDEX "account_call_briefs_created_at_idx" ON "account_call_briefs" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "account_call_memory_notes_account_idx" ON "account_call_memory_notes" USING btree ("account_id");--> statement-breakpoint
CREATE INDEX "account_call_memory_notes_created_at_idx" ON "account_call_memory_notes" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "account_intelligence_account_id_idx" ON "account_intelligence" USING btree ("account_id");--> statement-breakpoint
CREATE UNIQUE INDEX "account_intelligence_account_version_idx" ON "account_intelligence" USING btree ("account_id","version");--> statement-breakpoint
CREATE INDEX "account_intelligence_created_at_idx" ON "account_intelligence" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "account_messaging_briefs_account_id_idx" ON "account_messaging_briefs" USING btree ("account_id");--> statement-breakpoint
CREATE INDEX "account_messaging_briefs_campaign_id_idx" ON "account_messaging_briefs" USING btree ("campaign_id");--> statement-breakpoint
CREATE INDEX "account_messaging_briefs_created_at_idx" ON "account_messaging_briefs" USING btree ("created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "account_perspective_uniq" ON "account_perspective_analysis" USING btree ("account_id","perspective_id");--> statement-breakpoint
CREATE INDEX "account_perspective_expires_idx" ON "account_perspective_analysis" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX "account_perspective_stale_idx" ON "account_perspective_analysis" USING btree ("is_stale");--> statement-breakpoint
CREATE INDEX "agent_goals_agent_period_idx" ON "agent_goals" USING btree ("agent_id","period_id");--> statement-breakpoint
CREATE INDEX "agent_goals_period_idx" ON "agent_goals" USING btree ("period_id");--> statement-breakpoint
CREATE INDEX "agent_goals_goal_def_idx" ON "agent_goals" USING btree ("goal_definition_id");--> statement-breakpoint
CREATE UNIQUE INDEX "agent_instance_campaign_uniq" ON "agent_instance_contexts" USING btree ("virtual_agent_id","campaign_id");--> statement-breakpoint
CREATE INDEX "agent_instance_active_idx" ON "agent_instance_contexts" USING btree ("is_active");--> statement-breakpoint
CREATE UNIQUE INDEX "agent_knowledge_config_agent_block_idx" ON "agent_knowledge_config" USING btree ("virtual_agent_id","block_id");--> statement-breakpoint
CREATE INDEX "agent_knowledge_config_agent_idx" ON "agent_knowledge_config" USING btree ("virtual_agent_id");--> statement-breakpoint
CREATE INDEX "agent_knowledge_config_block_idx" ON "agent_knowledge_config" USING btree ("block_id");--> statement-breakpoint
CREATE UNIQUE INDEX "agent_period_stats_agent_period_uniq" ON "agent_period_stats" USING btree ("agent_id","period_id");--> statement-breakpoint
CREATE INDEX "agent_period_stats_period_idx" ON "agent_period_stats" USING btree ("period_id");--> statement-breakpoint
CREATE INDEX "agent_period_stats_qualified_idx" ON "agent_period_stats" USING btree ("qualified_leads");--> statement-breakpoint
CREATE INDEX "agent_period_stats_accepted_idx" ON "agent_period_stats" USING btree ("accepted_leads");--> statement-breakpoint
CREATE INDEX "agent_simulations_campaign_idx" ON "agent_simulations" USING btree ("campaign_id");--> statement-breakpoint
CREATE INDEX "agent_simulations_agent_idx" ON "agent_simulations" USING btree ("virtual_agent_id");--> statement-breakpoint
CREATE INDEX "agent_simulations_status_idx" ON "agent_simulations" USING btree ("status");--> statement-breakpoint
CREATE INDEX "agent_simulations_run_at_idx" ON "agent_simulations" USING btree ("run_at");--> statement-breakpoint
CREATE INDEX "ai_intent_feedback_intent_idx" ON "ai_intent_feedback" USING btree ("intent_id");--> statement-breakpoint
CREATE INDEX "ai_intent_feedback_type_idx" ON "ai_intent_feedback" USING btree ("feedback_type");--> statement-breakpoint
CREATE INDEX "ai_intent_feedback_training_idx" ON "ai_intent_feedback" USING btree ("was_used_for_training");--> statement-breakpoint
CREATE INDEX "ai_project_intents_status_idx" ON "ai_project_intents" USING btree ("status");--> statement-breakpoint
CREATE INDEX "ai_project_intents_user_idx" ON "ai_project_intents" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "ai_project_intents_project_idx" ON "ai_project_intents" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "ai_project_intents_confidence_idx" ON "ai_project_intents" USING btree ("confidence_level");--> statement-breakpoint
CREATE INDEX "blacklist_history_monitor_idx" ON "blacklist_check_history" USING btree ("monitor_id");--> statement-breakpoint
CREATE INDEX "blacklist_history_checked_at_idx" ON "blacklist_check_history" USING btree ("checked_at");--> statement-breakpoint
CREATE INDEX "blacklist_history_was_listed_idx" ON "blacklist_check_history" USING btree ("was_listed");--> statement-breakpoint
CREATE INDEX "blacklist_monitors_domain_auth_idx" ON "blacklist_monitors" USING btree ("domain_auth_id");--> statement-breakpoint
CREATE INDEX "blacklist_monitors_monitor_value_idx" ON "blacklist_monitors" USING btree ("monitor_value");--> statement-breakpoint
CREATE INDEX "blacklist_monitors_rbl_name_idx" ON "blacklist_monitors" USING btree ("rbl_name");--> statement-breakpoint
CREATE INDEX "blacklist_monitors_status_idx" ON "blacklist_monitors" USING btree ("status");--> statement-breakpoint
CREATE INDEX "blacklist_monitors_is_listed_idx" ON "blacklist_monitors" USING btree ("is_listed");--> statement-breakpoint
CREATE INDEX "blacklist_monitors_next_check_idx" ON "blacklist_monitors" USING btree ("next_check_at");--> statement-breakpoint
CREATE INDEX "business_perspectives_active_idx" ON "business_perspectives" USING btree ("is_active");--> statement-breakpoint
CREATE INDEX "call_followup_emails_contact_idx" ON "call_followup_emails" USING btree ("contact_id");--> statement-breakpoint
CREATE INDEX "call_followup_emails_account_idx" ON "call_followup_emails" USING btree ("account_id");--> statement-breakpoint
CREATE INDEX "call_followup_emails_campaign_idx" ON "call_followup_emails" USING btree ("campaign_id");--> statement-breakpoint
CREATE INDEX "call_followup_emails_call_attempt_idx" ON "call_followup_emails" USING btree ("call_attempt_id");--> statement-breakpoint
CREATE INDEX "call_followup_emails_created_at_idx" ON "call_followup_emails" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "call_outcome_learnings_campaign_idx" ON "call_outcome_learnings" USING btree ("campaign_id");--> statement-breakpoint
CREATE INDEX "call_outcome_learnings_contact_idx" ON "call_outcome_learnings" USING btree ("contact_id");--> statement-breakpoint
CREATE INDEX "call_outcome_learnings_outcome_idx" ON "call_outcome_learnings" USING btree ("outcome_code");--> statement-breakpoint
CREATE INDEX "call_outcome_learnings_role_idx" ON "call_outcome_learnings" USING btree ("contact_role_id");--> statement-breakpoint
CREATE INDEX "call_outcome_learnings_industry_idx" ON "call_outcome_learnings" USING btree ("industry_id");--> statement-breakpoint
CREATE INDEX "call_outcome_learnings_timestamp_idx" ON "call_outcome_learnings" USING btree ("call_timestamp");--> statement-breakpoint
CREATE INDEX "call_producer_tracking_session_idx" ON "call_producer_tracking" USING btree ("call_session_id");--> statement-breakpoint
CREATE INDEX "call_producer_tracking_campaign_idx" ON "call_producer_tracking" USING btree ("campaign_id");--> statement-breakpoint
CREATE INDEX "call_producer_tracking_producer_type_idx" ON "call_producer_tracking" USING btree ("producer_type");--> statement-breakpoint
CREATE INDEX "call_producer_tracking_handoff_stage_idx" ON "call_producer_tracking" USING btree ("handoff_stage");--> statement-breakpoint
CREATE INDEX "call_producer_tracking_created_at_idx" ON "call_producer_tracking" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "call_quality_records_call_session_idx" ON "call_quality_records" USING btree ("call_session_id");--> statement-breakpoint
CREATE INDEX "call_quality_records_dialer_attempt_idx" ON "call_quality_records" USING btree ("dialer_call_attempt_id");--> statement-breakpoint
CREATE INDEX "call_quality_records_campaign_idx" ON "call_quality_records" USING btree ("campaign_id");--> statement-breakpoint
CREATE INDEX "call_quality_records_contact_idx" ON "call_quality_records" USING btree ("contact_id");--> statement-breakpoint
CREATE INDEX "call_quality_records_score_idx" ON "call_quality_records" USING btree ("overall_quality_score");--> statement-breakpoint
CREATE INDEX "call_quality_records_created_at_idx" ON "call_quality_records" USING btree ("created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "campaign_account_problems_uniq" ON "campaign_account_problems" USING btree ("campaign_id","account_id");--> statement-breakpoint
CREATE INDEX "campaign_account_problems_campaign_idx" ON "campaign_account_problems" USING btree ("campaign_id");--> statement-breakpoint
CREATE INDEX "campaign_account_problems_account_idx" ON "campaign_account_problems" USING btree ("account_id");--> statement-breakpoint
CREATE INDEX "campaign_account_problems_generated_at_idx" ON "campaign_account_problems" USING btree ("generated_at");--> statement-breakpoint
CREATE UNIQUE INDEX "campaign_channel_variants_campaign_channel_unique" ON "campaign_channel_variants" USING btree ("campaign_id","channel_type");--> statement-breakpoint
CREATE INDEX "campaign_channel_variants_campaign_id_idx" ON "campaign_channel_variants" USING btree ("campaign_id");--> statement-breakpoint
CREATE INDEX "campaign_channel_variants_status_idx" ON "campaign_channel_variants" USING btree ("status");--> statement-breakpoint
CREATE UNIQUE INDEX "campaign_execution_prompts_lookup_unique" ON "campaign_execution_prompts" USING btree ("campaign_id","channel_type","account_id","contact_id");--> statement-breakpoint
CREATE INDEX "campaign_execution_prompts_campaign_id_idx" ON "campaign_execution_prompts" USING btree ("campaign_id");--> statement-breakpoint
CREATE INDEX "campaign_execution_prompts_channel_type_idx" ON "campaign_execution_prompts" USING btree ("channel_type");--> statement-breakpoint
CREATE INDEX "campaign_execution_prompts_hash_idx" ON "campaign_execution_prompts" USING btree ("prompt_hash");--> statement-breakpoint
CREATE UNIQUE INDEX "campaign_knowledge_config_campaign_block_idx" ON "campaign_knowledge_config" USING btree ("campaign_id","block_id");--> statement-breakpoint
CREATE INDEX "campaign_knowledge_config_campaign_idx" ON "campaign_knowledge_config" USING btree ("campaign_id");--> statement-breakpoint
CREATE INDEX "campaign_knowledge_config_block_idx" ON "campaign_knowledge_config" USING btree ("block_id");--> statement-breakpoint
CREATE UNIQUE INDEX "campaign_oi_binding_uniq" ON "campaign_org_intelligence_bindings" USING btree ("campaign_id");--> statement-breakpoint
CREATE INDEX "campaign_oi_binding_snapshot_idx" ON "campaign_org_intelligence_bindings" USING btree ("snapshot_id");--> statement-breakpoint
CREATE INDEX "campaign_oi_binding_mode_idx" ON "campaign_org_intelligence_bindings" USING btree ("mode");--> statement-breakpoint
CREATE INDEX "campaign_organizations_name_idx" ON "campaign_organizations" USING btree ("name");--> statement-breakpoint
CREATE INDEX "campaign_organizations_domain_idx" ON "campaign_organizations" USING btree ("domain");--> statement-breakpoint
CREATE INDEX "campaign_organizations_active_idx" ON "campaign_organizations" USING btree ("is_active");--> statement-breakpoint
CREATE INDEX "campaign_organizations_default_idx" ON "campaign_organizations" USING btree ("is_default");--> statement-breakpoint
CREATE INDEX "campaign_organizations_type_idx" ON "campaign_organizations" USING btree ("organization_type");--> statement-breakpoint
CREATE INDEX "campaign_organizations_parent_idx" ON "campaign_organizations" USING btree ("parent_organization_id");--> statement-breakpoint
CREATE UNIQUE INDEX "campaign_service_customizations_uniq" ON "campaign_service_customizations" USING btree ("campaign_id","service_id");--> statement-breakpoint
CREATE INDEX "campaign_service_customizations_campaign_idx" ON "campaign_service_customizations" USING btree ("campaign_id");--> statement-breakpoint
CREATE INDEX "campaign_suppression_domains_campaign_idx" ON "campaign_suppression_domains" USING btree ("campaign_id");--> statement-breakpoint
CREATE INDEX "campaign_suppression_domains_norm_idx" ON "campaign_suppression_domains" USING btree ("campaign_id","domain_norm");--> statement-breakpoint
CREATE UNIQUE INDEX "campaign_suppression_domains_unique" ON "campaign_suppression_domains" USING btree ("campaign_id","domain_norm");--> statement-breakpoint
CREATE INDEX "campaign_suppression_emails_campaign_idx" ON "campaign_suppression_emails" USING btree ("campaign_id");--> statement-breakpoint
CREATE INDEX "campaign_suppression_emails_norm_idx" ON "campaign_suppression_emails" USING btree ("campaign_id","email_norm");--> statement-breakpoint
CREATE UNIQUE INDEX "campaign_suppression_emails_unique" ON "campaign_suppression_emails" USING btree ("campaign_id","email_norm");--> statement-breakpoint
CREATE INDEX "campaign_templates_campaign_id_idx" ON "campaign_templates" USING btree ("campaign_id");--> statement-breakpoint
CREATE INDEX "campaign_templates_channel_type_idx" ON "campaign_templates" USING btree ("channel_type");--> statement-breakpoint
CREATE INDEX "campaign_templates_scope_idx" ON "campaign_templates" USING btree ("scope");--> statement-breakpoint
CREATE INDEX "campaign_templates_account_id_idx" ON "campaign_templates" USING btree ("account_id");--> statement-breakpoint
CREATE INDEX "campaign_templates_contact_id_idx" ON "campaign_templates" USING btree ("contact_id");--> statement-breakpoint
CREATE INDEX "campaign_templates_template_type_idx" ON "campaign_templates" USING btree ("template_type");--> statement-breakpoint
CREATE INDEX "campaign_templates_resolution_idx" ON "campaign_templates" USING btree ("campaign_id","channel_type","template_type","scope");--> statement-breakpoint
CREATE INDEX "campaign_test_calls_campaign_idx" ON "campaign_test_calls" USING btree ("campaign_id");--> statement-breakpoint
CREATE INDEX "campaign_test_calls_virtual_agent_idx" ON "campaign_test_calls" USING btree ("virtual_agent_id");--> statement-breakpoint
CREATE INDEX "campaign_test_calls_status_idx" ON "campaign_test_calls" USING btree ("status");--> statement-breakpoint
CREATE INDEX "campaign_test_calls_created_at_idx" ON "campaign_test_calls" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "client_accounts_name_idx" ON "client_accounts" USING btree ("name");--> statement-breakpoint
CREATE INDEX "client_accounts_active_idx" ON "client_accounts" USING btree ("is_active");--> statement-breakpoint
CREATE UNIQUE INDEX "client_accounts_invite_slug_idx" ON "client_accounts" USING btree ("invite_slug");--> statement-breakpoint
CREATE INDEX "client_activity_costs_client_date_idx" ON "client_activity_costs" USING btree ("client_account_id","activity_date");--> statement-breakpoint
CREATE INDEX "client_activity_costs_invoice_idx" ON "client_activity_costs" USING btree ("invoice_id");--> statement-breakpoint
CREATE INDEX "client_activity_costs_project_idx" ON "client_activity_costs" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "client_activity_costs_campaign_idx" ON "client_activity_costs" USING btree ("campaign_id");--> statement-breakpoint
CREATE UNIQUE INDEX "client_campaign_access_unique_idx" ON "client_campaign_access" USING btree ("client_account_id","campaign_id");--> statement-breakpoint
CREATE INDEX "client_campaign_access_client_idx" ON "client_campaign_access" USING btree ("client_account_id");--> statement-breakpoint
CREATE INDEX "client_campaign_access_campaign_idx" ON "client_campaign_access" USING btree ("campaign_id");--> statement-breakpoint
CREATE INDEX "client_campaign_access_regular_campaign_idx" ON "client_campaign_access" USING btree ("client_account_id","regular_campaign_id");--> statement-breakpoint
CREATE INDEX "client_delivery_access_log_link_idx" ON "client_delivery_access_log" USING btree ("delivery_link_id");--> statement-breakpoint
CREATE INDEX "client_delivery_links_client_idx" ON "client_delivery_links" USING btree ("client_account_id");--> statement-breakpoint
CREATE INDEX "client_delivery_links_order_idx" ON "client_delivery_links" USING btree ("order_id");--> statement-breakpoint
CREATE INDEX "client_delivery_links_token_idx" ON "client_delivery_links" USING btree ("access_token");--> statement-breakpoint
CREATE INDEX "client_delivery_links_status_idx" ON "client_delivery_links" USING btree ("delivery_status");--> statement-breakpoint
CREATE INDEX "client_invoice_activity_invoice_idx" ON "client_invoice_activity" USING btree ("invoice_id");--> statement-breakpoint
CREATE INDEX "client_invoice_items_invoice_idx" ON "client_invoice_items" USING btree ("invoice_id");--> statement-breakpoint
CREATE INDEX "client_invoices_client_idx" ON "client_invoices" USING btree ("client_account_id");--> statement-breakpoint
CREATE INDEX "client_invoices_status_idx" ON "client_invoices" USING btree ("status");--> statement-breakpoint
CREATE INDEX "client_invoices_period_idx" ON "client_invoices" USING btree ("billing_period_start","billing_period_end");--> statement-breakpoint
CREATE INDEX "client_invoices_due_date_idx" ON "client_invoices" USING btree ("due_date");--> statement-breakpoint
CREATE INDEX "client_mock_calls_client_idx" ON "client_mock_calls" USING btree ("client_account_id");--> statement-breakpoint
CREATE INDEX "client_mock_calls_campaign_idx" ON "client_mock_calls" USING btree ("campaign_id");--> statement-breakpoint
CREATE INDEX "client_mock_calls_qa_idx" ON "client_mock_calls" USING btree ("qa_content_id");--> statement-breakpoint
CREATE UNIQUE INDEX "client_organization_links_unique_idx" ON "client_organization_links" USING btree ("client_account_id","campaign_organization_id");--> statement-breakpoint
CREATE INDEX "client_organization_links_client_idx" ON "client_organization_links" USING btree ("client_account_id");--> statement-breakpoint
CREATE INDEX "client_organization_links_org_idx" ON "client_organization_links" USING btree ("campaign_organization_id");--> statement-breakpoint
CREATE INDEX "client_organization_links_primary_idx" ON "client_organization_links" USING btree ("client_account_id");--> statement-breakpoint
CREATE INDEX "client_portal_order_contacts_order_idx" ON "client_portal_order_contacts" USING btree ("order_id");--> statement-breakpoint
CREATE INDEX "client_portal_order_contacts_contact_idx" ON "client_portal_order_contacts" USING btree ("verification_contact_id");--> statement-breakpoint
CREATE UNIQUE INDEX "client_portal_order_contacts_unique_idx" ON "client_portal_order_contacts" USING btree ("order_id","verification_contact_id");--> statement-breakpoint
CREATE UNIQUE INDEX "client_portal_orders_order_number_idx" ON "client_portal_orders" USING btree ("order_number");--> statement-breakpoint
CREATE INDEX "client_portal_orders_client_account_idx" ON "client_portal_orders" USING btree ("client_account_id");--> statement-breakpoint
CREATE INDEX "client_portal_orders_campaign_idx" ON "client_portal_orders" USING btree ("campaign_id");--> statement-breakpoint
CREATE INDEX "client_portal_orders_status_idx" ON "client_portal_orders" USING btree ("status");--> statement-breakpoint
CREATE INDEX "client_portal_orders_month_year_idx" ON "client_portal_orders" USING btree ("order_month","order_year");--> statement-breakpoint
CREATE UNIQUE INDEX "client_project_campaigns_unique_idx" ON "client_project_campaigns" USING btree ("project_id","campaign_id");--> statement-breakpoint
CREATE INDEX "client_project_campaigns_project_idx" ON "client_project_campaigns" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "client_project_campaigns_campaign_idx" ON "client_project_campaigns" USING btree ("campaign_id");--> statement-breakpoint
CREATE INDEX "client_projects_client_idx" ON "client_projects" USING btree ("client_account_id");--> statement-breakpoint
CREATE INDEX "client_projects_status_idx" ON "client_projects" USING btree ("status");--> statement-breakpoint
CREATE INDEX "client_projects_code_idx" ON "client_projects" USING btree ("project_code");--> statement-breakpoint
CREATE INDEX "client_projects_type_idx" ON "client_projects" USING btree ("project_type");--> statement-breakpoint
CREATE INDEX "client_projects_org_idx" ON "client_projects" USING btree ("campaign_organization_id");--> statement-breakpoint
CREATE INDEX "client_reports_client_idx" ON "client_reports" USING btree ("client_account_id");--> statement-breakpoint
CREATE INDEX "client_reports_campaign_idx" ON "client_reports" USING btree ("campaign_id");--> statement-breakpoint
CREATE INDEX "client_reports_type_idx" ON "client_reports" USING btree ("report_type");--> statement-breakpoint
CREATE INDEX "client_reports_qa_idx" ON "client_reports" USING btree ("qa_content_id");--> statement-breakpoint
CREATE INDEX "client_simulation_sessions_client_idx" ON "client_simulation_sessions" USING btree ("client_account_id");--> statement-breakpoint
CREATE INDEX "client_simulation_sessions_campaign_idx" ON "client_simulation_sessions" USING btree ("campaign_id");--> statement-breakpoint
CREATE INDEX "client_simulation_sessions_project_idx" ON "client_simulation_sessions" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "client_simulation_sessions_qa_idx" ON "client_simulation_sessions" USING btree ("qa_content_id");--> statement-breakpoint
CREATE UNIQUE INDEX "client_users_email_idx" ON "client_users" USING btree ("email");--> statement-breakpoint
CREATE INDEX "client_users_client_account_idx" ON "client_users" USING btree ("client_account_id");--> statement-breakpoint
CREATE INDEX "client_users_active_idx" ON "client_users" USING btree ("is_active");--> statement-breakpoint
CREATE INDEX "client_voice_commands_user_idx" ON "client_voice_commands" USING btree ("client_user_id");--> statement-breakpoint
CREATE INDEX "client_voice_commands_account_idx" ON "client_voice_commands" USING btree ("client_account_id");--> statement-breakpoint
CREATE INDEX "client_voice_commands_created_idx" ON "client_voice_commands" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "contact_intelligence_role_idx" ON "contact_intelligence" USING btree ("normalized_role_id");--> statement-breakpoint
CREATE INDEX "contact_intelligence_authority_idx" ON "contact_intelligence" USING btree ("decision_authority");--> statement-breakpoint
CREATE INDEX "contact_intelligence_committee_idx" ON "contact_intelligence" USING btree ("buying_committee_role");--> statement-breakpoint
CREATE INDEX "contact_intelligence_expires_idx" ON "contact_intelligence" USING btree ("expires_at");--> statement-breakpoint
CREATE UNIQUE INDEX "contact_predictive_scores_uniq" ON "contact_predictive_scores" USING btree ("contact_id","campaign_id");--> statement-breakpoint
CREATE INDEX "contact_predictive_scores_priority_idx" ON "contact_predictive_scores" USING btree ("campaign_id","call_priority");--> statement-breakpoint
CREATE INDEX "contact_predictive_scores_engagement_idx" ON "contact_predictive_scores" USING btree ("campaign_id","engagement_likelihood");--> statement-breakpoint
CREATE INDEX "contact_predictive_scores_tier_idx" ON "contact_predictive_scores" USING btree ("campaign_id","priority_tier");--> statement-breakpoint
CREATE INDEX "csv_mapping_templates_user_idx" ON "csv_mapping_templates" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "csv_mapping_templates_default_idx" ON "csv_mapping_templates" USING btree ("is_default");--> statement-breakpoint
CREATE INDEX "deal_conversations_opportunity_idx" ON "deal_conversations" USING btree ("opportunity_id");--> statement-breakpoint
CREATE UNIQUE INDEX "deal_conversations_thread_id_idx" ON "deal_conversations" USING btree ("thread_id") WHERE "deal_conversations"."thread_id" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "deal_conversations_last_message_idx" ON "deal_conversations" USING btree ("last_message_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "deal_conversations_participants_idx" ON "deal_conversations" USING gin ("participant_emails");--> statement-breakpoint
CREATE INDEX "deal_insights_opportunity_idx" ON "deal_insights" USING btree ("opportunity_id");--> statement-breakpoint
CREATE INDEX "deal_insights_type_idx" ON "deal_insights" USING btree ("insight_type");--> statement-breakpoint
CREATE INDEX "deal_insights_created_at_idx" ON "deal_insights" USING btree ("created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "deal_insights_status_idx" ON "deal_insights" USING btree ("status");--> statement-breakpoint
CREATE UNIQUE INDEX "deal_insights_unique_idx" ON "deal_insights" USING btree ("opportunity_id","insight_type","source","created_at");--> statement-breakpoint
CREATE INDEX "deal_messages_conversation_idx" ON "deal_messages" USING btree ("conversation_id");--> statement-breakpoint
CREATE INDEX "deal_messages_opportunity_idx" ON "deal_messages" USING btree ("opportunity_id");--> statement-breakpoint
CREATE UNIQUE INDEX "deal_messages_m365_message_idx" ON "deal_messages" USING btree ("m365_message_id");--> statement-breakpoint
CREATE INDEX "deal_messages_sent_at_idx" ON "deal_messages" USING btree ("sent_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "deal_messages_direction_idx" ON "deal_messages" USING btree ("direction");--> statement-breakpoint
CREATE INDEX "deal_messages_to_emails_idx" ON "deal_messages" USING gin ("to_emails");--> statement-breakpoint
CREATE INDEX "deal_messages_cc_emails_idx" ON "deal_messages" USING gin ("cc_emails");--> statement-breakpoint
CREATE INDEX "deal_score_history_opportunity_idx" ON "deal_score_history" USING btree ("opportunity_id");--> statement-breakpoint
CREATE INDEX "deal_score_history_score_type_idx" ON "deal_score_history" USING btree ("score_type");--> statement-breakpoint
CREATE INDEX "deal_score_history_created_at_idx" ON "deal_score_history" USING btree ("created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "deal_score_history_changed_by_idx" ON "deal_score_history" USING btree ("changed_by");--> statement-breakpoint
CREATE INDEX "dialer_call_attempts_dialer_run_idx" ON "dialer_call_attempts" USING btree ("dialer_run_id");--> statement-breakpoint
CREATE INDEX "dialer_call_attempts_campaign_idx" ON "dialer_call_attempts" USING btree ("campaign_id");--> statement-breakpoint
CREATE INDEX "dialer_call_attempts_contact_idx" ON "dialer_call_attempts" USING btree ("contact_id");--> statement-breakpoint
CREATE INDEX "dialer_call_attempts_agent_type_idx" ON "dialer_call_attempts" USING btree ("agent_type");--> statement-breakpoint
CREATE INDEX "dialer_call_attempts_disposition_idx" ON "dialer_call_attempts" USING btree ("disposition");--> statement-breakpoint
CREATE INDEX "dialer_call_attempts_telnyx_call_id_idx" ON "dialer_call_attempts" USING btree ("telnyx_call_id");--> statement-breakpoint
CREATE INDEX "dialer_call_attempts_created_at_idx" ON "dialer_call_attempts" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "dialer_call_attempts_pending_disposition_idx" ON "dialer_call_attempts" USING btree ("disposition","disposition_processed");--> statement-breakpoint
CREATE INDEX "dialer_runs_campaign_idx" ON "dialer_runs" USING btree ("campaign_id");--> statement-breakpoint
CREATE INDEX "dialer_runs_run_type_idx" ON "dialer_runs" USING btree ("run_type");--> statement-breakpoint
CREATE INDEX "dialer_runs_status_idx" ON "dialer_runs" USING btree ("status");--> statement-breakpoint
CREATE INDEX "dialer_runs_agent_type_idx" ON "dialer_runs" USING btree ("agent_type");--> statement-breakpoint
CREATE INDEX "dialer_runs_human_agent_idx" ON "dialer_runs" USING btree ("human_agent_id");--> statement-breakpoint
CREATE INDEX "dialer_runs_virtual_agent_idx" ON "dialer_runs" USING btree ("virtual_agent_id");--> statement-breakpoint
CREATE INDEX "dialer_runs_started_at_idx" ON "dialer_runs" USING btree ("started_at");--> statement-breakpoint
CREATE INDEX "disposition_rules_disposition_idx" ON "disposition_rules" USING btree ("disposition_id");--> statement-breakpoint
CREATE INDEX "disposition_rules_producer_type_idx" ON "disposition_rules" USING btree ("producer_type");--> statement-breakpoint
CREATE INDEX "disposition_rules_active_idx" ON "disposition_rules" USING btree ("is_active");--> statement-breakpoint
CREATE INDEX "disposition_rules_priority_idx" ON "disposition_rules" USING btree ("priority");--> statement-breakpoint
CREATE INDEX "dnc_reconciliation_log_phone_idx" ON "dnc_reconciliation_log" USING btree ("phone_e164");--> statement-breakpoint
CREATE INDEX "dnc_reconciliation_log_source_idx" ON "dnc_reconciliation_log" USING btree ("source");--> statement-breakpoint
CREATE INDEX "dnc_reconciliation_log_created_at_idx" ON "dnc_reconciliation_log" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "domain_config_domain_auth_idx" ON "domain_configuration" USING btree ("domain_auth_id");--> statement-breakpoint
CREATE INDEX "domain_config_secure_code_idx" ON "domain_configuration" USING btree ("secure_code");--> statement-breakpoint
CREATE INDEX "domain_health_domain_auth_idx" ON "domain_health_scores" USING btree ("domain_auth_id");--> statement-breakpoint
CREATE INDEX "domain_health_overall_score_idx" ON "domain_health_scores" USING btree ("overall_score");--> statement-breakpoint
CREATE INDEX "domain_health_warmup_phase_idx" ON "domain_health_scores" USING btree ("warmup_phase");--> statement-breakpoint
CREATE INDEX "domain_health_scored_at_idx" ON "domain_health_scores" USING btree ("scored_at");--> statement-breakpoint
CREATE INDEX "warmup_schedule_domain_auth_idx" ON "domain_warmup_schedule" USING btree ("domain_auth_id");--> statement-breakpoint
CREATE INDEX "warmup_schedule_date_idx" ON "domain_warmup_schedule" USING btree ("scheduled_date");--> statement-breakpoint
CREATE INDEX "warmup_schedule_status_idx" ON "domain_warmup_schedule" USING btree ("status");--> statement-breakpoint
CREATE INDEX "warmup_schedule_day_idx" ON "domain_warmup_schedule" USING btree ("day");--> statement-breakpoint
CREATE INDEX "email_ai_rewrites_user_idx" ON "email_ai_rewrites" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "email_ai_rewrites_created_at_idx" ON "email_ai_rewrites" USING btree ("created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "email_ai_rewrites_message_idx" ON "email_ai_rewrites" USING btree ("message_id");--> statement-breakpoint
CREATE INDEX "email_link_clicks_message_idx" ON "email_link_clicks" USING btree ("message_id");--> statement-breakpoint
CREATE INDEX "email_link_clicks_recipient_idx" ON "email_link_clicks" USING btree ("recipient_email");--> statement-breakpoint
CREATE INDEX "email_link_clicks_clicked_at_idx" ON "email_link_clicks" USING btree ("clicked_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "email_opens_message_idx" ON "email_opens" USING btree ("message_id");--> statement-breakpoint
CREATE INDEX "email_opens_recipient_idx" ON "email_opens" USING btree ("recipient_email");--> statement-breakpoint
CREATE INDEX "email_opens_opened_at_idx" ON "email_opens" USING btree ("opened_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "email_sequences_mailbox_idx" ON "email_sequences" USING btree ("mailbox_account_id");--> statement-breakpoint
CREATE INDEX "email_sequences_created_by_idx" ON "email_sequences" USING btree ("created_by");--> statement-breakpoint
CREATE INDEX "email_sequences_status_idx" ON "email_sequences" USING btree ("status");--> statement-breakpoint
CREATE INDEX "email_signatures_user_idx" ON "email_signatures" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "email_signatures_default_idx" ON "email_signatures" USING btree ("user_id","is_default");--> statement-breakpoint
CREATE UNIQUE INDEX "email_suppression_email_unique_idx" ON "email_suppression_list" USING btree ("email_normalized");--> statement-breakpoint
CREATE INDEX "email_suppression_reason_idx" ON "email_suppression_list" USING btree ("reason");--> statement-breakpoint
CREATE INDEX "email_suppression_campaign_idx" ON "email_suppression_list" USING btree ("campaign_id");--> statement-breakpoint
CREATE INDEX "email_validation_domain_cache_last_checked_idx" ON "email_validation_domain_cache" USING btree ("last_checked");--> statement-breakpoint
CREATE INDEX "export_templates_name_idx" ON "export_templates" USING btree ("name");--> statement-breakpoint
CREATE INDEX "export_templates_type_idx" ON "export_templates" USING btree ("template_type");--> statement-breakpoint
CREATE INDEX "export_templates_created_by_idx" ON "export_templates" USING btree ("created_by");--> statement-breakpoint
CREATE INDEX "gamification_rewards_name_idx" ON "gamification_rewards" USING btree ("name");--> statement-breakpoint
CREATE INDEX "gamification_rewards_active_idx" ON "gamification_rewards" USING btree ("active");--> statement-breakpoint
CREATE INDEX "goal_definitions_name_idx" ON "goal_definitions" USING btree ("name");--> statement-breakpoint
CREATE INDEX "goal_definitions_type_idx" ON "goal_definitions" USING btree ("goal_type");--> statement-breakpoint
CREATE INDEX "goal_definitions_active_idx" ON "goal_definitions" USING btree ("active");--> statement-breakpoint
CREATE INDEX "governance_actions_log_campaign_idx" ON "governance_actions_log" USING btree ("campaign_id");--> statement-breakpoint
CREATE INDEX "governance_actions_log_action_type_idx" ON "governance_actions_log" USING btree ("action_type");--> statement-breakpoint
CREATE INDEX "governance_actions_log_producer_type_idx" ON "governance_actions_log" USING btree ("producer_type");--> statement-breakpoint
CREATE INDEX "governance_actions_log_created_at_idx" ON "governance_actions_log" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "inbox_categories_user_idx" ON "inbox_categories" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "inbox_categories_message_user_idx" ON "inbox_categories" USING btree ("user_id","message_id");--> statement-breakpoint
CREATE INDEX "inbox_categories_category_idx" ON "inbox_categories" USING btree ("user_id","category");--> statement-breakpoint
CREATE INDEX "inbox_categories_is_read_idx" ON "inbox_categories" USING btree ("user_id","is_read");--> statement-breakpoint
CREATE UNIQUE INDEX "industry_dept_pain_uniq" ON "industry_department_pain_points" USING btree ("industry_id","department");--> statement-breakpoint
CREATE INDEX "industry_dept_industry_idx" ON "industry_department_pain_points" USING btree ("industry_id");--> statement-breakpoint
CREATE INDEX "industry_dept_dept_idx" ON "industry_department_pain_points" USING btree ("department");--> statement-breakpoint
CREATE INDEX "industry_taxonomy_parent_idx" ON "industry_taxonomy" USING btree ("parent_industry_id");--> statement-breakpoint
CREATE INDEX "industry_taxonomy_level_idx" ON "industry_taxonomy" USING btree ("industry_level");--> statement-breakpoint
CREATE INDEX "job_role_taxonomy_function_idx" ON "job_role_taxonomy" USING btree ("job_function");--> statement-breakpoint
CREATE INDEX "job_role_taxonomy_seniority_idx" ON "job_role_taxonomy" USING btree ("seniority_level");--> statement-breakpoint
CREATE INDEX "job_role_taxonomy_category_idx" ON "job_role_taxonomy" USING btree ("role_category");--> statement-breakpoint
CREATE INDEX "job_role_taxonomy_authority_idx" ON "job_role_taxonomy" USING btree ("decision_authority");--> statement-breakpoint
CREATE UNIQUE INDEX "job_title_mappings_normalized_idx" ON "job_title_mappings" USING btree ("raw_title_normalized");--> statement-breakpoint
CREATE INDEX "job_title_mappings_role_idx" ON "job_title_mappings" USING btree ("mapped_role_id");--> statement-breakpoint
CREATE INDEX "job_title_mappings_source_idx" ON "job_title_mappings" USING btree ("mapping_source");--> statement-breakpoint
CREATE INDEX "job_title_mappings_confidence_idx" ON "job_title_mappings" USING btree ("confidence");--> statement-breakpoint
CREATE UNIQUE INDEX "knowledge_block_versions_block_version_idx" ON "knowledge_block_versions" USING btree ("block_id","version");--> statement-breakpoint
CREATE INDEX "knowledge_block_versions_block_idx" ON "knowledge_block_versions" USING btree ("block_id");--> statement-breakpoint
CREATE INDEX "knowledge_block_versions_created_at_idx" ON "knowledge_block_versions" USING btree ("created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "knowledge_blocks_slug_idx" ON "knowledge_blocks" USING btree ("slug");--> statement-breakpoint
CREATE INDEX "knowledge_blocks_category_idx" ON "knowledge_blocks" USING btree ("category");--> statement-breakpoint
CREATE INDEX "knowledge_blocks_layer_idx" ON "knowledge_blocks" USING btree ("layer");--> statement-breakpoint
CREATE INDEX "knowledge_blocks_active_idx" ON "knowledge_blocks" USING btree ("is_active");--> statement-breakpoint
CREATE INDEX "lead_comments_lead_idx" ON "lead_comments" USING btree ("lead_id");--> statement-breakpoint
CREATE INDEX "lead_comments_client_account_idx" ON "lead_comments" USING btree ("client_account_id");--> statement-breakpoint
CREATE INDEX "lead_comments_created_at_idx" ON "lead_comments" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "lead_comments_deleted_at_idx" ON "lead_comments" USING btree ("deleted_at");--> statement-breakpoint
CREATE INDEX "lead_tag_assignments_lead_idx" ON "lead_tag_assignments" USING btree ("lead_id");--> statement-breakpoint
CREATE INDEX "lead_tag_assignments_tag_idx" ON "lead_tag_assignments" USING btree ("tag_id");--> statement-breakpoint
CREATE INDEX "lead_verifications_lead_idx" ON "lead_verifications" USING btree ("lead_id");--> statement-breakpoint
CREATE INDEX "lead_verifications_status_idx" ON "lead_verifications" USING btree ("verification_status");--> statement-breakpoint
CREATE INDEX "lead_verifications_agent_idx" ON "lead_verifications" USING btree ("agent_id");--> statement-breakpoint
CREATE INDEX "learning_insights_type_idx" ON "learning_insights" USING btree ("insight_type");--> statement-breakpoint
CREATE INDEX "learning_insights_scope_idx" ON "learning_insights" USING btree ("insight_scope","scope_id");--> statement-breakpoint
CREATE INDEX "learning_insights_key_idx" ON "learning_insights" USING btree ("pattern_key");--> statement-breakpoint
CREATE INDEX "learning_insights_active_idx" ON "learning_insights" USING btree ("is_active");--> statement-breakpoint
CREATE INDEX "m365_activities_mailbox_idx" ON "m365_activities" USING btree ("mailbox_account_id");--> statement-breakpoint
CREATE INDEX "m365_activities_message_idx" ON "m365_activities" USING btree ("message_id");--> statement-breakpoint
CREATE INDEX "m365_activities_account_idx" ON "m365_activities" USING btree ("account_id");--> statement-breakpoint
CREATE INDEX "m365_activities_contact_idx" ON "m365_activities" USING btree ("contact_id");--> statement-breakpoint
CREATE INDEX "m365_activities_received_idx" ON "m365_activities" USING btree ("received_datetime");--> statement-breakpoint
CREATE INDEX "oi_snapshots_domain_idx" ON "organization_intelligence_snapshots" USING btree ("domain");--> statement-breakpoint
CREATE INDEX "oi_snapshots_org_name_idx" ON "organization_intelligence_snapshots" USING btree ("organization_name");--> statement-breakpoint
CREATE INDEX "oi_snapshots_reusable_idx" ON "organization_intelligence_snapshots" USING btree ("is_reusable");--> statement-breakpoint
CREATE INDEX "oi_snapshots_created_at_idx" ON "organization_intelligence_snapshots" USING btree ("created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "organization_members_org_user_idx" ON "organization_members" USING btree ("organization_id","user_id");--> statement-breakpoint
CREATE INDEX "organization_members_org_idx" ON "organization_members" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "organization_members_user_idx" ON "organization_members" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "organization_members_role_idx" ON "organization_members" USING btree ("role");--> statement-breakpoint
CREATE INDEX "org_service_catalog_org_idx" ON "organization_service_catalog" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "org_service_catalog_name_idx" ON "organization_service_catalog" USING btree ("service_name");--> statement-breakpoint
CREATE INDEX "org_service_catalog_category_idx" ON "organization_service_catalog" USING btree ("service_category");--> statement-breakpoint
CREATE INDEX "org_service_catalog_active_idx" ON "organization_service_catalog" USING btree ("is_active");--> statement-breakpoint
CREATE INDEX "participant_call_memory_notes_contact_idx" ON "participant_call_memory_notes" USING btree ("contact_id");--> statement-breakpoint
CREATE INDEX "participant_call_memory_notes_account_idx" ON "participant_call_memory_notes" USING btree ("account_id");--> statement-breakpoint
CREATE INDEX "participant_call_memory_notes_created_at_idx" ON "participant_call_memory_notes" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "participant_call_plans_account_idx" ON "participant_call_plans" USING btree ("account_id");--> statement-breakpoint
CREATE INDEX "participant_call_plans_contact_idx" ON "participant_call_plans" USING btree ("contact_id");--> statement-breakpoint
CREATE INDEX "participant_call_plans_campaign_idx" ON "participant_call_plans" USING btree ("campaign_id");--> statement-breakpoint
CREATE INDEX "participant_call_plans_call_attempt_idx" ON "participant_call_plans" USING btree ("call_attempt_id");--> statement-breakpoint
CREATE INDEX "participant_call_plans_created_at_idx" ON "participant_call_plans" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "performance_periods_status_idx" ON "performance_periods" USING btree ("status");--> statement-breakpoint
CREATE INDEX "performance_periods_date_range_idx" ON "performance_periods" USING btree ("start_at","end_at");--> statement-breakpoint
CREATE INDEX "preview_content_session_idx" ON "preview_generated_content" USING btree ("session_id");--> statement-breakpoint
CREATE INDEX "preview_content_type_idx" ON "preview_generated_content" USING btree ("content_type");--> statement-breakpoint
CREATE INDEX "preview_transcripts_session_idx" ON "preview_simulation_transcripts" USING btree ("session_id");--> statement-breakpoint
CREATE INDEX "preview_transcripts_role_idx" ON "preview_simulation_transcripts" USING btree ("role");--> statement-breakpoint
CREATE INDEX "preview_transcripts_timestamp_idx" ON "preview_simulation_transcripts" USING btree ("timestamp_ms");--> statement-breakpoint
CREATE INDEX "preview_studio_sessions_campaign_id_idx" ON "preview_studio_sessions" USING btree ("campaign_id");--> statement-breakpoint
CREATE INDEX "preview_studio_sessions_channel_type_idx" ON "preview_studio_sessions" USING btree ("channel_type");--> statement-breakpoint
CREATE INDEX "preview_studio_sessions_created_by_idx" ON "preview_studio_sessions" USING btree ("created_by");--> statement-breakpoint
CREATE INDEX "preview_studio_sessions_created_at_idx" ON "preview_studio_sessions" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "preview_studio_sessions_session_type_idx" ON "preview_studio_sessions" USING btree ("session_type");--> statement-breakpoint
CREATE INDEX "preview_studio_sessions_status_idx" ON "preview_studio_sessions" USING btree ("status");--> statement-breakpoint
CREATE INDEX "problem_definitions_org_idx" ON "problem_definitions" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "problem_definitions_category_idx" ON "problem_definitions" USING btree ("problem_category");--> statement-breakpoint
CREATE INDEX "problem_definitions_active_idx" ON "problem_definitions" USING btree ("is_active");--> statement-breakpoint
CREATE INDEX "producer_metrics_campaign_date_idx" ON "producer_metrics" USING btree ("campaign_id","metric_date");--> statement-breakpoint
CREATE INDEX "producer_metrics_producer_type_idx" ON "producer_metrics" USING btree ("producer_type");--> statement-breakpoint
CREATE INDEX "producer_metrics_human_agent_idx" ON "producer_metrics" USING btree ("human_agent_id");--> statement-breakpoint
CREATE INDEX "producer_metrics_virtual_agent_idx" ON "producer_metrics" USING btree ("virtual_agent_id");--> statement-breakpoint
CREATE INDEX "producer_metrics_date_idx" ON "producer_metrics" USING btree ("metric_date");--> statement-breakpoint
CREATE UNIQUE INDEX "producer_metrics_unique_producer_date" ON "producer_metrics" USING btree ("campaign_id","producer_type","metric_date","human_agent_id","virtual_agent_id");--> statement-breakpoint
CREATE INDEX "projects_status_idx" ON "projects" USING btree ("status");--> statement-breakpoint
CREATE INDEX "projects_owner_idx" ON "projects" USING btree ("owner_id");--> statement-breakpoint
CREATE INDEX "projects_ai_generated_idx" ON "projects" USING btree ("ai_generated_from");--> statement-breakpoint
CREATE INDEX "prompt_execution_logs_agent_idx" ON "prompt_execution_logs" USING btree ("virtual_agent_id");--> statement-breakpoint
CREATE INDEX "prompt_execution_logs_campaign_idx" ON "prompt_execution_logs" USING btree ("campaign_id");--> statement-breakpoint
CREATE INDEX "prompt_execution_logs_session_idx" ON "prompt_execution_logs" USING btree ("call_session_id");--> statement-breakpoint
CREATE INDEX "prompt_execution_logs_executed_at_idx" ON "prompt_execution_logs" USING btree ("executed_at");--> statement-breakpoint
CREATE INDEX "prompt_execution_logs_hash_idx" ON "prompt_execution_logs" USING btree ("prompt_hash");--> statement-breakpoint
CREATE UNIQUE INDEX "prompt_registry_key_idx" ON "prompt_registry" USING btree ("prompt_key");--> statement-breakpoint
CREATE INDEX "prompt_registry_category_idx" ON "prompt_registry" USING btree ("category");--> statement-breakpoint
CREATE INDEX "prompt_registry_agent_type_idx" ON "prompt_registry" USING btree ("agent_type");--> statement-breakpoint
CREATE INDEX "prompt_registry_active_idx" ON "prompt_registry" USING btree ("is_active");--> statement-breakpoint
CREATE INDEX "prompt_variant_tests_variant_idx" ON "prompt_variant_tests" USING btree ("variant_id");--> statement-breakpoint
CREATE INDEX "prompt_variant_tests_campaign_idx" ON "prompt_variant_tests" USING btree ("campaign_id");--> statement-breakpoint
CREATE INDEX "prompt_variant_tests_call_attempt_idx" ON "prompt_variant_tests" USING btree ("call_attempt_id");--> statement-breakpoint
CREATE INDEX "prompt_variants_account_idx" ON "prompt_variants" USING btree ("account_id");--> statement-breakpoint
CREATE INDEX "prompt_variants_campaign_idx" ON "prompt_variants" USING btree ("campaign_id");--> statement-breakpoint
CREATE INDEX "prompt_variants_agent_idx" ON "prompt_variants" USING btree ("virtual_agent_id");--> statement-breakpoint
CREATE INDEX "prompt_variants_perspective_idx" ON "prompt_variants" USING btree ("perspective");--> statement-breakpoint
CREATE INDEX "prompt_variants_active_idx" ON "prompt_variants" USING btree ("is_active");--> statement-breakpoint
CREATE INDEX "prompt_variants_default_idx" ON "prompt_variants" USING btree ("is_default");--> statement-breakpoint
CREATE INDEX "prompt_variants_scope_idx" ON "prompt_variants" USING btree ("variant_scope");--> statement-breakpoint
CREATE INDEX "prompt_versions_prompt_id_idx" ON "prompt_versions" USING btree ("prompt_id");--> statement-breakpoint
CREATE INDEX "prompt_versions_version_idx" ON "prompt_versions" USING btree ("prompt_id","version");--> statement-breakpoint
CREATE INDEX "qa_gated_content_content_idx" ON "qa_gated_content" USING btree ("content_type","content_id");--> statement-breakpoint
CREATE INDEX "qa_gated_content_campaign_idx" ON "qa_gated_content" USING btree ("campaign_id");--> statement-breakpoint
CREATE INDEX "qa_gated_content_client_idx" ON "qa_gated_content" USING btree ("client_account_id");--> statement-breakpoint
CREATE INDEX "qa_gated_content_project_idx" ON "qa_gated_content" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "qa_gated_content_status_idx" ON "qa_gated_content" USING btree ("qa_status");--> statement-breakpoint
CREATE INDEX "qa_gated_content_visible_idx" ON "qa_gated_content" USING btree ("client_account_id","client_visible");--> statement-breakpoint
CREATE UNIQUE INDEX "qa_gated_content_unique_idx" ON "qa_gated_content" USING btree ("content_type","content_id","client_account_id");--> statement-breakpoint
CREATE INDEX "qc_work_queue_campaign_idx" ON "qc_work_queue" USING btree ("campaign_id");--> statement-breakpoint
CREATE INDEX "qc_work_queue_status_idx" ON "qc_work_queue" USING btree ("status");--> statement-breakpoint
CREATE INDEX "qc_work_queue_producer_type_idx" ON "qc_work_queue" USING btree ("producer_type");--> statement-breakpoint
CREATE INDEX "qc_work_queue_assigned_to_idx" ON "qc_work_queue" USING btree ("assigned_to");--> statement-breakpoint
CREATE INDEX "qc_work_queue_priority_status_idx" ON "qc_work_queue" USING btree ("status","priority");--> statement-breakpoint
CREATE INDEX "recycle_jobs_campaign_idx" ON "recycle_jobs" USING btree ("campaign_id");--> statement-breakpoint
CREATE INDEX "recycle_jobs_contact_idx" ON "recycle_jobs" USING btree ("contact_id");--> statement-breakpoint
CREATE INDEX "recycle_jobs_status_idx" ON "recycle_jobs" USING btree ("status");--> statement-breakpoint
CREATE INDEX "recycle_jobs_eligible_at_idx" ON "recycle_jobs" USING btree ("eligible_at");--> statement-breakpoint
CREATE INDEX "recycle_jobs_scheduled_eligible_idx" ON "recycle_jobs" USING btree ("status","eligible_at");--> statement-breakpoint
CREATE UNIQUE INDEX "role_adjacency_pair_uniq" ON "role_adjacency" USING btree ("source_role_id","target_role_id","adjacency_type");--> statement-breakpoint
CREATE INDEX "role_adjacency_source_idx" ON "role_adjacency" USING btree ("source_role_id");--> statement-breakpoint
CREATE INDEX "role_adjacency_target_idx" ON "role_adjacency" USING btree ("target_role_id");--> statement-breakpoint
CREATE INDEX "scheduled_emails_scheduled_for_idx" ON "scheduled_emails" USING btree ("scheduled_for");--> statement-breakpoint
CREATE INDEX "scheduled_emails_status_idx" ON "scheduled_emails" USING btree ("status");--> statement-breakpoint
CREATE INDEX "scheduled_emails_mailbox_idx" ON "scheduled_emails" USING btree ("mailbox_account_id");--> statement-breakpoint
CREATE INDEX "scheduled_emails_opportunity_idx" ON "scheduled_emails" USING btree ("opportunity_id");--> statement-breakpoint
CREATE INDEX "sequence_email_sends_enrollment_idx" ON "sequence_email_sends" USING btree ("enrollment_id");--> statement-breakpoint
CREATE INDEX "sequence_email_sends_step_idx" ON "sequence_email_sends" USING btree ("step_id");--> statement-breakpoint
CREATE INDEX "sequence_email_sends_contact_idx" ON "sequence_email_sends" USING btree ("contact_id");--> statement-breakpoint
CREATE INDEX "sequence_email_sends_sequence_idx" ON "sequence_email_sends" USING btree ("sequence_id");--> statement-breakpoint
CREATE INDEX "sequence_email_sends_status_idx" ON "sequence_email_sends" USING btree ("status");--> statement-breakpoint
CREATE INDEX "sequence_email_sends_scheduled_idx" ON "sequence_email_sends" USING btree ("scheduled_for");--> statement-breakpoint
CREATE INDEX "sequence_email_sends_message_idx" ON "sequence_email_sends" USING btree ("message_id");--> statement-breakpoint
CREATE INDEX "sequence_enrollments_sequence_idx" ON "sequence_enrollments" USING btree ("sequence_id");--> statement-breakpoint
CREATE INDEX "sequence_enrollments_contact_idx" ON "sequence_enrollments" USING btree ("contact_id");--> statement-breakpoint
CREATE INDEX "sequence_enrollments_status_idx" ON "sequence_enrollments" USING btree ("status");--> statement-breakpoint
CREATE UNIQUE INDEX "sequence_enrollments_unique_idx" ON "sequence_enrollments" USING btree ("sequence_id","contact_id");--> statement-breakpoint
CREATE INDEX "sequence_steps_sequence_idx" ON "sequence_steps" USING btree ("sequence_id");--> statement-breakpoint
CREATE UNIQUE INDEX "sequence_steps_sequence_step_idx" ON "sequence_steps" USING btree ("sequence_id","step_number");--> statement-breakpoint
CREATE INDEX "smi_audit_log_operation_idx" ON "smi_audit_log" USING btree ("operation_type");--> statement-breakpoint
CREATE INDEX "smi_audit_log_entity_idx" ON "smi_audit_log" USING btree ("entity_type","entity_id");--> statement-breakpoint
CREATE INDEX "smi_audit_log_campaign_idx" ON "smi_audit_log" USING btree ("campaign_id");--> statement-breakpoint
CREATE INDEX "smi_audit_log_timestamp_idx" ON "smi_audit_log" USING btree ("created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "smtp_providers_email_unique_idx" ON "smtp_providers" USING btree ("email_address");--> statement-breakpoint
CREATE INDEX "smtp_providers_type_idx" ON "smtp_providers" USING btree ("provider_type");--> statement-breakpoint
CREATE INDEX "smtp_providers_active_idx" ON "smtp_providers" USING btree ("is_active");--> statement-breakpoint
CREATE INDEX "smtp_providers_default_idx" ON "smtp_providers" USING btree ("is_default");--> statement-breakpoint
CREATE INDEX "super_org_credentials_org_idx" ON "super_org_credentials" USING btree ("organization_id");--> statement-breakpoint
CREATE UNIQUE INDEX "super_org_credentials_key_idx" ON "super_org_credentials" USING btree ("organization_id","key");--> statement-breakpoint
CREATE INDEX "super_org_credentials_category_idx" ON "super_org_credentials" USING btree ("category");--> statement-breakpoint
CREATE INDEX "super_org_credentials_active_idx" ON "super_org_credentials" USING btree ("is_active");--> statement-breakpoint
CREATE INDEX "suppression_list_email_norm_idx" ON "suppression_list" USING btree ("email_norm");--> statement-breakpoint
CREATE INDEX "suppression_list_cav_id_idx" ON "suppression_list" USING btree ("cav_id");--> statement-breakpoint
CREATE INDEX "suppression_list_cav_user_id_idx" ON "suppression_list" USING btree ("cav_user_id");--> statement-breakpoint
CREATE INDEX "suppression_list_name_company_hash_idx" ON "suppression_list" USING btree ("name_company_hash");--> statement-breakpoint
CREATE INDEX "transactional_logs_template_idx" ON "transactional_email_logs" USING btree ("template_id");--> statement-breakpoint
CREATE INDEX "transactional_logs_smtp_provider_idx" ON "transactional_email_logs" USING btree ("smtp_provider_id");--> statement-breakpoint
CREATE INDEX "transactional_logs_event_type_idx" ON "transactional_email_logs" USING btree ("event_type");--> statement-breakpoint
CREATE INDEX "transactional_logs_recipient_email_idx" ON "transactional_email_logs" USING btree ("recipient_email");--> statement-breakpoint
CREATE INDEX "transactional_logs_recipient_user_idx" ON "transactional_email_logs" USING btree ("recipient_user_id");--> statement-breakpoint
CREATE INDEX "transactional_logs_status_idx" ON "transactional_email_logs" USING btree ("status");--> statement-breakpoint
CREATE INDEX "transactional_logs_created_at_idx" ON "transactional_email_logs" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "transactional_templates_event_type_idx" ON "transactional_email_templates" USING btree ("event_type");--> statement-breakpoint
CREATE INDEX "transactional_templates_active_idx" ON "transactional_email_templates" USING btree ("is_active");--> statement-breakpoint
CREATE INDEX "transactional_templates_default_idx" ON "transactional_email_templates" USING btree ("is_default");--> statement-breakpoint
CREATE INDEX "transactional_templates_smtp_provider_idx" ON "transactional_email_templates" USING btree ("smtp_provider_id");--> statement-breakpoint
CREATE UNIQUE INDEX "unified_knowledge_hub_version_idx" ON "unified_knowledge_hub" USING btree ("version");--> statement-breakpoint
CREATE INDEX "unified_knowledge_hub_updated_at_idx" ON "unified_knowledge_hub" USING btree ("updated_at");--> statement-breakpoint
CREATE INDEX "unified_knowledge_versions_knowledge_id_idx" ON "unified_knowledge_versions" USING btree ("knowledge_id");--> statement-breakpoint
CREATE INDEX "unified_knowledge_versions_version_idx" ON "unified_knowledge_versions" USING btree ("version");--> statement-breakpoint
CREATE INDEX "variant_selection_history_call_attempt_idx" ON "variant_selection_history" USING btree ("call_attempt_id");--> statement-breakpoint
CREATE INDEX "variant_selection_history_variant_idx" ON "variant_selection_history" USING btree ("variant_id");--> statement-breakpoint
CREATE UNIQUE INDEX "vector_documents_source_idx" ON "vector_documents" USING btree ("source_type","source_id");--> statement-breakpoint
CREATE INDEX "vector_documents_source_type_idx" ON "vector_documents" USING btree ("source_type");--> statement-breakpoint
CREATE INDEX "vector_documents_account_idx" ON "vector_documents" USING btree ("account_id");--> statement-breakpoint
CREATE INDEX "vector_documents_industry_idx" ON "vector_documents" USING btree ("industry");--> statement-breakpoint
CREATE INDEX "vector_documents_disposition_idx" ON "vector_documents" USING btree ("disposition");--> statement-breakpoint
CREATE INDEX "vector_documents_embedding_hnsw_idx" ON "vector_documents" USING hnsw ("embedding" vector_cosine_ops);--> statement-breakpoint
CREATE INDEX "vector_documents_embedding_ivfflat_idx" ON "vector_documents" USING ivfflat ("embedding" vector_cosine_ops) WITH (lists=100);--> statement-breakpoint
CREATE INDEX "verification_cap_status_campaign_account_idx" ON "verification_account_cap_status" USING btree ("campaign_id","account_id");--> statement-breakpoint
CREATE UNIQUE INDEX "verification_cap_status_unique" ON "verification_account_cap_status" USING btree ("campaign_id","account_id");--> statement-breakpoint
CREATE INDEX "verification_campaign_workflows_campaign_idx" ON "verification_campaign_workflows" USING btree ("campaign_id");--> statement-breakpoint
CREATE INDEX "verification_campaign_workflows_status_idx" ON "verification_campaign_workflows" USING btree ("status");--> statement-breakpoint
CREATE INDEX "verification_campaign_workflows_stage_idx" ON "verification_campaign_workflows" USING btree ("current_stage");--> statement-breakpoint
CREATE INDEX "verification_enrichment_jobs_campaign_idx" ON "verification_enrichment_jobs" USING btree ("campaign_id");--> statement-breakpoint
CREATE INDEX "verification_enrichment_jobs_status_idx" ON "verification_enrichment_jobs" USING btree ("status");--> statement-breakpoint
CREATE INDEX "verification_enrichment_jobs_created_at_idx" ON "verification_enrichment_jobs" USING btree ("created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "verification_enrichment_jobs_unique_active_campaign" ON "verification_enrichment_jobs" USING btree ("campaign_id") WHERE status IN ('pending', 'processing');--> statement-breakpoint
CREATE INDEX "virtual_agents_name_idx" ON "virtual_agents" USING btree ("name");--> statement-breakpoint
CREATE INDEX "virtual_agents_provider_idx" ON "virtual_agents" USING btree ("provider");--> statement-breakpoint
CREATE INDEX "virtual_agents_active_idx" ON "virtual_agents" USING btree ("is_active");--> statement-breakpoint
CREATE INDEX "virtual_agents_demand_type_idx" ON "virtual_agents" USING btree ("demand_agent_type");--> statement-breakpoint
CREATE INDEX "virtual_agents_skill_id_idx" ON "virtual_agents" USING btree ("skill_id");--> statement-breakpoint
ALTER TABLE "call_attempts" ADD CONSTRAINT "call_attempts_original_contact_id_contacts_id_fk" FOREIGN KEY ("original_contact_id") REFERENCES "public"."contacts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "call_attempts" ADD CONSTRAINT "call_attempts_actual_contact_id_contacts_id_fk" FOREIGN KEY ("actual_contact_id") REFERENCES "public"."contacts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "call_sessions" ADD CONSTRAINT "call_sessions_agent_user_id_users_id_fk" FOREIGN KEY ("agent_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "call_sessions" ADD CONSTRAINT "call_sessions_campaign_id_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaigns"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "call_sessions" ADD CONSTRAINT "call_sessions_contact_id_contacts_id_fk" FOREIGN KEY ("contact_id") REFERENCES "public"."contacts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campaign_agent_assignments" ADD CONSTRAINT "campaign_agent_assignments_virtual_agent_id_virtual_agents_id_fk" FOREIGN KEY ("virtual_agent_id") REFERENCES "public"."virtual_agents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campaign_queue" ADD CONSTRAINT "campaign_queue_virtual_agent_id_virtual_agents_id_fk" FOREIGN KEY ("virtual_agent_id") REFERENCES "public"."virtual_agents"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campaigns" ADD CONSTRAINT "campaigns_client_account_id_client_accounts_id_fk" FOREIGN KEY ("client_account_id") REFERENCES "public"."client_accounts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campaigns" ADD CONSTRAINT "campaigns_project_id_client_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."client_projects"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campaigns" ADD CONSTRAINT "campaigns_approved_by_id_users_id_fk" FOREIGN KEY ("approved_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campaigns" ADD CONSTRAINT "campaigns_delivery_template_id_export_templates_id_fk" FOREIGN KEY ("delivery_template_id") REFERENCES "public"."export_templates"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "email_events" ADD CONSTRAINT "email_events_campaign_id_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaigns"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "email_events" ADD CONSTRAINT "email_events_contact_id_contacts_id_fk" FOREIGN KEY ("contact_id") REFERENCES "public"."contacts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "email_templates" ADD CONSTRAINT "email_templates_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "leads" ADD CONSTRAINT "leads_call_attempt_id_dialer_call_attempts_id_fk" FOREIGN KEY ("call_attempt_id") REFERENCES "public"."dialer_call_attempts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "leads" ADD CONSTRAINT "leads_original_contact_id_contacts_id_fk" FOREIGN KEY ("original_contact_id") REFERENCES "public"."contacts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "leads" ADD CONSTRAINT "leads_actual_contact_id_contacts_id_fk" FOREIGN KEY ("actual_contact_id") REFERENCES "public"."contacts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "leads" ADD CONSTRAINT "leads_rejected_by_id_users_id_fk" FOREIGN KEY ("rejected_by_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "leads" ADD CONSTRAINT "leads_delivered_by_id_users_id_fk" FOREIGN KEY ("delivered_by_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "leads" ADD CONSTRAINT "leads_verified_by_users_id_fk" FOREIGN KEY ("verified_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "leads" ADD CONSTRAINT "leads_deleted_by_id_users_id_fk" FOREIGN KEY ("deleted_by_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "leads" ADD CONSTRAINT "leads_contact_id_contacts_id_fk" FOREIGN KEY ("contact_id") REFERENCES "public"."contacts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "leads" ADD CONSTRAINT "leads_campaign_id_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaigns"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "call_sessions_agent_type_idx" ON "call_sessions" USING btree ("agent_type");--> statement-breakpoint
CREATE INDEX "call_sessions_campaign_idx" ON "call_sessions" USING btree ("campaign_id");--> statement-breakpoint
CREATE INDEX "call_sessions_contact_idx" ON "call_sessions" USING btree ("contact_id");--> statement-breakpoint
CREATE INDEX "call_sessions_ai_conversation_idx" ON "call_sessions" USING btree ("ai_conversation_id");--> statement-breakpoint
CREATE INDEX "call_sessions_recording_status_idx" ON "call_sessions" USING btree ("recording_status");--> statement-breakpoint
CREATE UNIQUE INDEX "campaign_virtual_agent_assignments_uniq" ON "campaign_agent_assignments" USING btree ("campaign_id","virtual_agent_id");--> statement-breakpoint
CREATE INDEX "campaign_agent_assignments_virtual_agent_idx" ON "campaign_agent_assignments" USING btree ("virtual_agent_id");--> statement-breakpoint
CREATE INDEX "campaign_agent_assignments_agent_type_idx" ON "campaign_agent_assignments" USING btree ("agent_type");--> statement-breakpoint
CREATE INDEX "campaign_queue_virtual_agent_idx" ON "campaign_queue" USING btree ("virtual_agent_id");--> statement-breakpoint
CREATE INDEX "campaign_queue_target_agent_type_idx" ON "campaign_queue" USING btree ("target_agent_type");--> statement-breakpoint
CREATE INDEX "campaigns_client_account_idx" ON "campaigns" USING btree ("client_account_id");--> statement-breakpoint
CREATE INDEX "campaigns_project_idx" ON "campaigns" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "campaigns_approval_status_idx" ON "campaigns" USING btree ("approval_status");--> statement-breakpoint
CREATE INDEX "campaigns_delivery_template_idx" ON "campaigns" USING btree ("delivery_template_id");--> statement-breakpoint
CREATE INDEX "contacts_cav_id_idx" ON "contacts" USING btree ("cav_id");--> statement-breakpoint
CREATE INDEX "contacts_cav_user_id_idx" ON "contacts" USING btree ("cav_user_id");--> statement-breakpoint
CREATE INDEX "contacts_name_company_hash_idx" ON "contacts" USING btree ("name_company_hash");--> statement-breakpoint
CREATE INDEX "contacts_next_call_eligible_idx" ON "contacts" USING btree ("next_call_eligible_at");--> statement-breakpoint
CREATE INDEX "email_events_campaign_idx" ON "email_events" USING btree ("campaign_id");--> statement-breakpoint
CREATE INDEX "email_events_contact_idx" ON "email_events" USING btree ("contact_id");--> statement-breakpoint
CREATE INDEX "email_events_recipient_idx" ON "email_events" USING btree ("recipient");--> statement-breakpoint
CREATE INDEX "email_events_created_at_idx" ON "email_events" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "email_templates_category_idx" ON "email_templates" USING btree ("category");--> statement-breakpoint
CREATE INDEX "email_templates_active_idx" ON "email_templates" USING btree ("is_active");--> statement-breakpoint
CREATE INDEX "email_templates_created_by_idx" ON "email_templates" USING btree ("created_by");--> statement-breakpoint
CREATE INDEX "leads_deleted_at_idx" ON "leads" USING btree ("deleted_at");--> statement-breakpoint
CREATE UNIQUE INDEX "verification_contacts_unique_campaign_contact" ON "verification_contacts" USING btree ("campaign_id","full_name","account_id");--> statement-breakpoint
CREATE INDEX "verification_email_validations_provider_email_idx" ON "verification_email_validations" USING btree ("email_lower","provider");--> statement-breakpoint
CREATE INDEX "verification_upload_jobs_type_idx" ON "verification_upload_jobs" USING btree ("job_type");--> statement-breakpoint
CREATE UNIQUE INDEX "accounts_domain_normalized_unique_idx" ON "accounts" USING btree ("domain_normalized");--> statement-breakpoint
CREATE UNIQUE INDEX "accounts_name_city_country_unique_idx" ON "accounts" USING btree ("name_normalized","hq_city","hq_country") WHERE domain_normalized IS NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "campaign_agent_assignments_active_agent_uniq" ON "campaign_agent_assignments" USING btree ("agent_id") WHERE "campaign_agent_assignments"."is_active" = true AND "campaign_agent_assignments"."agent_type" = 'human';--> statement-breakpoint
CREATE UNIQUE INDEX "contacts_email_normalized_unique_idx" ON "contacts" USING btree ("email_normalized") WHERE deleted_at IS NULL AND email_normalized IS NOT NULL;--> statement-breakpoint
ALTER TABLE "accounts" DROP COLUMN "deleted_at";--> statement-breakpoint
DROP TYPE "public"."abv_status";--> statement-breakpoint
DROP TYPE "public"."dedupe_scope";--> statement-breakpoint
DROP TYPE "public"."dv_disposition";--> statement-breakpoint
DROP TYPE "public"."dv_project_status";--> statement-breakpoint
DROP TYPE "public"."dv_record_status";--> statement-breakpoint
DROP TYPE "public"."dv_role";--> statement-breakpoint
DROP TYPE "public"."exclusion_scope";