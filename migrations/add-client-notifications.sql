-- Client Notification Center (Mercury Bridge)
-- Stores client-specific email notifications for pipeline updates, campaign launches, etc.

DO $$ BEGIN
  CREATE TYPE "client_notification_status" AS ENUM ('draft', 'queued', 'sent', 'failed');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE "client_notification_type" AS ENUM (
    'pipeline_update', 'campaign_launch', 'leads_delivered',
    'weekly_report', 'milestone', 'custom'
  );
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

CREATE TABLE IF NOT EXISTS "client_notifications" (
  "id" varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  "client_account_id" varchar NOT NULL REFERENCES "client_accounts"("id") ON DELETE CASCADE,
  "campaign_id" varchar REFERENCES "campaigns"("id") ON DELETE SET NULL,
  "notification_type" "client_notification_type" NOT NULL,
  "subject" text NOT NULL,
  "html_content" text NOT NULL,
  "text_content" text,
  "recipient_emails" jsonb NOT NULL DEFAULT '[]',
  "status" "client_notification_status" NOT NULL DEFAULT 'draft',
  "sent_at" timestamptz,
  "sent_by" varchar REFERENCES "users"("id") ON DELETE SET NULL,
  "outbox_id" varchar,
  "error_message" text,
  "metadata" jsonb,
  "ai_generated" boolean DEFAULT false,
  "ai_prompt" text,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "client_notifications_client_idx" ON "client_notifications"("client_account_id");
CREATE INDEX IF NOT EXISTS "client_notifications_campaign_idx" ON "client_notifications"("campaign_id");
CREATE INDEX IF NOT EXISTS "client_notifications_status_idx" ON "client_notifications"("status");
CREATE INDEX IF NOT EXISTS "client_notifications_type_idx" ON "client_notifications"("notification_type");
CREATE INDEX IF NOT EXISTS "client_notifications_created_idx" ON "client_notifications"("created_at");