ALTER TABLE "campaigns"
  ADD COLUMN "client_account_id" varchar REFERENCES "client_accounts"("id") ON DELETE set null,
  ADD COLUMN "project_id" varchar REFERENCES "client_projects"("id") ON DELETE set null,
  ADD COLUMN "approval_status" "content_approval_status" NOT NULL DEFAULT 'draft',
  ADD COLUMN "approved_by_id" varchar REFERENCES "users"("id") ON DELETE set null,
  ADD COLUMN "approved_at" timestamp,
  ADD COLUMN "published_at" timestamp;

CREATE INDEX "campaigns_client_account_idx" ON "campaigns" ("client_account_id");
CREATE INDEX "campaigns_project_idx" ON "campaigns" ("project_id");
CREATE INDEX "campaigns_approval_status_idx" ON "campaigns" ("approval_status");