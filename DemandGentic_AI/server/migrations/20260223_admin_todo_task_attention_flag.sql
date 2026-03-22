ALTER TABLE IF EXISTS admin_todo_tasks
  ADD COLUMN IF NOT EXISTS needs_attention boolean NOT NULL DEFAULT false;