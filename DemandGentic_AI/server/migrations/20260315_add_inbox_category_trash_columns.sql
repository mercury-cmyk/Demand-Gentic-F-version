ALTER TABLE inbox_categories
  ADD COLUMN IF NOT EXISTS is_trashed BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS trashed_at TIMESTAMP WITH TIME ZONE;

CREATE INDEX IF NOT EXISTS inbox_categories_is_trashed_idx
  ON inbox_categories(user_id, is_trashed);