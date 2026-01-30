-- Migration: Add lead comments system for client portal
-- This allows clients to add notes and comments on their qualified leads

-- Create lead_comments table
CREATE TABLE IF NOT EXISTS "lead_comments" (
  "id" VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
  "lead_id" VARCHAR NOT NULL REFERENCES "leads"("id") ON DELETE CASCADE,
  "client_account_id" VARCHAR NOT NULL REFERENCES "client_accounts"("id") ON DELETE CASCADE,
  "client_user_id" VARCHAR REFERENCES "client_users"("id") ON DELETE SET NULL,
  "comment_text" TEXT NOT NULL,
  "is_internal" BOOLEAN DEFAULT FALSE, -- Internal notes vs client-facing
  "created_at" TIMESTAMP NOT NULL DEFAULT NOW(),
  "updated_at" TIMESTAMP NOT NULL DEFAULT NOW(),
  "deleted_at" TIMESTAMP -- Soft delete support
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS "lead_comments_lead_idx" ON "lead_comments"("lead_id");
CREATE INDEX IF NOT EXISTS "lead_comments_client_account_idx" ON "lead_comments"("client_account_id");
CREATE INDEX IF NOT EXISTS "lead_comments_created_at_idx" ON "lead_comments"("created_at" DESC);
CREATE INDEX IF NOT EXISTS "lead_comments_deleted_at_idx" ON "lead_comments"("deleted_at");

-- Comment: This enables clients to add notes and collaborate on leads in their portal
