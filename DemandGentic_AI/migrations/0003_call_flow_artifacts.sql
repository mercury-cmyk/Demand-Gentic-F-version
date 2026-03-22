CREATE TABLE IF NOT EXISTS "account_call_briefs" (
  "id" serial PRIMARY KEY,
  "workspace_id" varchar,
  "account_id" varchar NOT NULL REFERENCES "accounts"("id") ON DELETE CASCADE,
  "campaign_id" varchar REFERENCES "campaigns"("id") ON DELETE SET NULL,
  "intelligence_version" integer NOT NULL,
  "campaign_fingerprint" text NOT NULL,
  "payload_json" jsonb NOT NULL,
  "created_at" timestamp DEFAULT now(),
  "updated_at" timestamp DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "account_call_briefs_account_id_idx"
  ON "account_call_briefs" ("account_id");
CREATE INDEX IF NOT EXISTS "account_call_briefs_campaign_id_idx"
  ON "account_call_briefs" ("campaign_id");
CREATE INDEX IF NOT EXISTS "account_call_briefs_created_at_idx"
  ON "account_call_briefs" ("created_at");

CREATE TABLE IF NOT EXISTS "participant_call_plans" (
  "id" serial PRIMARY KEY,
  "workspace_id" varchar,
  "account_id" varchar NOT NULL REFERENCES "accounts"("id") ON DELETE CASCADE,
  "contact_id" varchar NOT NULL REFERENCES "contacts"("id") ON DELETE CASCADE,
  "campaign_id" varchar REFERENCES "campaigns"("id") ON DELETE SET NULL,
  "call_attempt_id" varchar REFERENCES "dialer_call_attempts"("id") ON DELETE SET NULL,
  "attempt_number" integer NOT NULL DEFAULT 1,
  "account_call_brief_id" integer REFERENCES "account_call_briefs"("id") ON DELETE SET NULL,
  "payload_json" jsonb NOT NULL,
  "created_at" timestamp DEFAULT now(),
  "updated_at" timestamp DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "participant_call_plans_account_idx"
  ON "participant_call_plans" ("account_id");
CREATE INDEX IF NOT EXISTS "participant_call_plans_contact_idx"
  ON "participant_call_plans" ("contact_id");
CREATE INDEX IF NOT EXISTS "participant_call_plans_campaign_idx"
  ON "participant_call_plans" ("campaign_id");
CREATE INDEX IF NOT EXISTS "participant_call_plans_call_attempt_idx"
  ON "participant_call_plans" ("call_attempt_id");
CREATE INDEX IF NOT EXISTS "participant_call_plans_created_at_idx"
  ON "participant_call_plans" ("created_at");

CREATE TABLE IF NOT EXISTS "account_call_memory_notes" (
  "id" serial PRIMARY KEY,
  "account_id" varchar NOT NULL REFERENCES "accounts"("id") ON DELETE CASCADE,
  "call_attempt_id" varchar REFERENCES "dialer_call_attempts"("id") ON DELETE SET NULL,
  "summary" text,
  "payload_json" jsonb,
  "created_at" timestamp DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "account_call_memory_notes_account_idx"
  ON "account_call_memory_notes" ("account_id");
CREATE INDEX IF NOT EXISTS "account_call_memory_notes_created_at_idx"
  ON "account_call_memory_notes" ("created_at");

CREATE TABLE IF NOT EXISTS "participant_call_memory_notes" (
  "id" serial PRIMARY KEY,
  "account_id" varchar REFERENCES "accounts"("id") ON DELETE CASCADE,
  "contact_id" varchar NOT NULL REFERENCES "contacts"("id") ON DELETE CASCADE,
  "call_attempt_id" varchar REFERENCES "dialer_call_attempts"("id") ON DELETE SET NULL,
  "summary" text,
  "payload_json" jsonb,
  "created_at" timestamp DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "participant_call_memory_notes_contact_idx"
  ON "participant_call_memory_notes" ("contact_id");
CREATE INDEX IF NOT EXISTS "participant_call_memory_notes_account_idx"
  ON "participant_call_memory_notes" ("account_id");
CREATE INDEX IF NOT EXISTS "participant_call_memory_notes_created_at_idx"
  ON "participant_call_memory_notes" ("created_at");

CREATE TABLE IF NOT EXISTS "call_followup_emails" (
  "id" serial PRIMARY KEY,
  "account_id" varchar NOT NULL REFERENCES "accounts"("id") ON DELETE CASCADE,
  "contact_id" varchar NOT NULL REFERENCES "contacts"("id") ON DELETE CASCADE,
  "campaign_id" varchar REFERENCES "campaigns"("id") ON DELETE SET NULL,
  "call_attempt_id" varchar REFERENCES "dialer_call_attempts"("id") ON DELETE SET NULL,
  "payload_json" jsonb NOT NULL,
  "created_at" timestamp DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "call_followup_emails_contact_idx"
  ON "call_followup_emails" ("contact_id");
CREATE INDEX IF NOT EXISTS "call_followup_emails_account_idx"
  ON "call_followup_emails" ("account_id");
CREATE INDEX IF NOT EXISTS "call_followup_emails_campaign_idx"
  ON "call_followup_emails" ("campaign_id");
CREATE INDEX IF NOT EXISTS "call_followup_emails_call_attempt_idx"
  ON "call_followup_emails" ("call_attempt_id");
CREATE INDEX IF NOT EXISTS "call_followup_emails_created_at_idx"
  ON "call_followup_emails" ("created_at");