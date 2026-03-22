-- Add hashed invitation token support (backward-compatible)
-- Requires pgcrypto for digest()

CREATE EXTENSION IF NOT EXISTS pgcrypto;

ALTER TABLE mercury_invitation_tokens
  ADD COLUMN IF NOT EXISTS token_hash varchar;

-- Backfill hashes for existing tokens
UPDATE mercury_invitation_tokens
SET token_hash = encode(digest(token, 'sha256'), 'hex')
WHERE token_hash IS NULL
  AND token IS NOT NULL;

-- Unique index for hashed token lookup (partial to allow nulls during rollout)
CREATE UNIQUE INDEX IF NOT EXISTS mercury_invite_token_hash_idx
  ON mercury_invitation_tokens(token_hash)
  WHERE token_hash IS NOT NULL;