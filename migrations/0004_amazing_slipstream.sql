CREATE TYPE "public"."content_promo_page_status" AS ENUM('draft', 'published', 'archived', 'expired');--> statement-breakpoint
CREATE TYPE "public"."content_promo_page_type" AS ENUM('gated_download', 'ungated_download', 'webinar_registration', 'demo_request', 'confirmation');--> statement-breakpoint
CREATE TYPE "public"."content_promo_template_theme" AS ENUM('executive', 'modern_gradient', 'clean_minimal', 'bold_impact', 'tech_forward');--> statement-breakpoint
CREATE TABLE "content_promotion_page_views" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"page_id" varchar NOT NULL,
	"visitor_email" varchar(320),
	"visitor_first_name" varchar(255),
	"visitor_last_name" varchar(255),
	"visitor_company" varchar(255),
	"ip_address" varchar(45),
	"user_agent" text,
	"referrer" text,
	"utm_source" varchar(255),
	"utm_medium" varchar(255),
	"utm_campaign" varchar(255),
	"utm_term" varchar(255),
	"utm_content" varchar(255),
	"event_type" varchar(50) DEFAULT 'view' NOT NULL,
	"form_data" jsonb,
	"time_on_page_ms" integer,
	"scroll_depth_percent" integer,
	"submission_id" varchar,
	"converted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "content_promotion_pages" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" varchar,
	"title" text NOT NULL,
	"slug" text NOT NULL,
	"page_type" "content_promo_page_type" NOT NULL,
	"status" "content_promo_page_status" DEFAULT 'draft' NOT NULL,
	"template_theme" "content_promo_template_theme" DEFAULT 'modern_gradient' NOT NULL,
	"hero_config" jsonb NOT NULL,
	"asset_config" jsonb,
	"branding_config" jsonb NOT NULL,
	"form_config" jsonb,
	"social_proof_config" jsonb,
	"benefits_config" jsonb,
	"urgency_config" jsonb,
	"thank_you_config" jsonb,
	"seo_config" jsonb,
	"linked_lead_form_id" varchar,
	"view_count" integer DEFAULT 0 NOT NULL,
	"unique_view_count" integer DEFAULT 0 NOT NULL,
	"submission_count" integer DEFAULT 0 NOT NULL,
	"conversion_rate" numeric(5, 2),
	"published_at" timestamp with time zone,
	"expires_at" timestamp with time zone,
	"created_by" varchar,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "content_promotion_pages_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
ALTER TABLE "call_sessions" ADD COLUMN "caller_number_id" text;--> statement-breakpoint
ALTER TABLE "call_sessions" ADD COLUMN "from_did" text;--> statement-breakpoint
ALTER TABLE "call_sessions" ADD COLUMN "routing_decision_id" text;--> statement-breakpoint
CREATE INDEX "content_promo_views_page_idx" ON "content_promotion_page_views" USING btree ("page_id");--> statement-breakpoint
CREATE INDEX "content_promo_views_email_idx" ON "content_promotion_page_views" USING btree ("visitor_email");--> statement-breakpoint
CREATE INDEX "content_promo_views_event_idx" ON "content_promotion_page_views" USING btree ("event_type");--> statement-breakpoint
CREATE INDEX "content_promo_views_created_idx" ON "content_promotion_page_views" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "content_promo_views_utm_campaign_idx" ON "content_promotion_page_views" USING btree ("utm_campaign");--> statement-breakpoint
CREATE UNIQUE INDEX "content_promo_pages_slug_idx" ON "content_promotion_pages" USING btree ("slug");--> statement-breakpoint
CREATE INDEX "content_promo_pages_status_idx" ON "content_promotion_pages" USING btree ("status");--> statement-breakpoint
CREATE INDEX "content_promo_pages_type_idx" ON "content_promotion_pages" USING btree ("page_type");--> statement-breakpoint
CREATE INDEX "content_promo_pages_tenant_idx" ON "content_promotion_pages" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "content_promo_pages_created_idx" ON "content_promotion_pages" USING btree ("created_at");