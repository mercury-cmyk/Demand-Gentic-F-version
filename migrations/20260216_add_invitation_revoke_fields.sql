-- Add invitation revocation/audit fields for resend + revoke flows
-- Safe to run multiple times

ALTER TABLE mercury_invitation_tokens
  ADD COLUMN IF NOT EXISTS revoked_at timestamptz,
  ADD COLUMN IF NOT EXISTS revoked_by varchar,
  ADD COLUMN IF NOT EXISTS replaced_by_token_id varchar;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'mercury_invite_revoked_by_fkey'
  ) THEN
    ALTER TABLE mercury_invitation_tokens
      ADD CONSTRAINT mercury_invite_revoked_by_fkey
      FOREIGN KEY (revoked_by)
      REFERENCES users(id)
      ON DELETE SET NULL;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS mercury_invite_revoked_idx
  ON mercury_invitation_tokens(revoked_at);
