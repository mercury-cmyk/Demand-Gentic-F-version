ALTER TABLE IF EXISTS "account_intelligence" RENAME TO "org_intelligence_profiles";

CREATE TABLE IF NOT EXISTS "account_intelligence" (
  "id" serial PRIMARY KEY,
  "workspace_id" varchar,
  "account_id" varchar NOT NULL REFERENCES "accounts"("id") ON DELETE CASCADE,
  "version" integer NOT NULL DEFAULT 1,
  "source_fingerprint" text NOT NULL,
  "confidence" real,
  "payload_json" jsonb NOT NULL,
  "created_at" timestamp DEFAULT now(),
  "updated_at" timestamp DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "account_intelligence_account_id_idx"
  ON "account_intelligence" ("account_id");
CREATE UNIQUE INDEX IF NOT EXISTS "account_intelligence_account_version_idx"
  ON "account_intelligence" ("account_id", "version");
CREATE INDEX IF NOT EXISTS "account_intelligence_created_at_idx"
  ON "account_intelligence" ("created_at");

CREATE TABLE IF NOT EXISTS "account_messaging_briefs" (
  "id" serial PRIMARY KEY,
  "workspace_id" varchar,
  "account_id" varchar NOT NULL REFERENCES "accounts"("id") ON DELETE CASCADE,
  "campaign_id" varchar REFERENCES "campaigns"("id") ON DELETE SET NULL,
  "intelligence_version" integer NOT NULL,
  "payload_json" jsonb NOT NULL,
  "created_at" timestamp DEFAULT now(),
  "updated_at" timestamp DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "account_messaging_briefs_account_id_idx"
  ON "account_messaging_briefs" ("account_id");
CREATE INDEX IF NOT EXISTS "account_messaging_briefs_campaign_id_idx"
  ON "account_messaging_briefs" ("campaign_id");
CREATE INDEX IF NOT EXISTS "account_messaging_briefs_created_at_idx"
  ON "account_messaging_briefs" ("created_at");
