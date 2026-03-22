ALTER TABLE client_accounts
ADD COLUMN IF NOT EXISTS "profile" JSONB DEFAULT '{}'::jsonb,
ADD COLUMN IF NOT EXISTS "settings" JSONB DEFAULT '{}'::jsonb;