CREATE TABLE IF NOT EXISTS "ai_model_governance" (
  "id" varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  "version" integer NOT NULL DEFAULT 1,
  "policies" jsonb NOT NULL,
  "updated_by" varchar,
  "updated_at" timestamp NOT NULL DEFAULT now()
);

DO $$ BEGIN
 ALTER TABLE "ai_model_governance"
 ADD CONSTRAINT "ai_model_governance_updated_by_users_id_fk"
 FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id")
 ON DELETE set null
 ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;

CREATE INDEX IF NOT EXISTS "ai_model_governance_updated_at_idx"
  ON "ai_model_governance" ("updated_at");