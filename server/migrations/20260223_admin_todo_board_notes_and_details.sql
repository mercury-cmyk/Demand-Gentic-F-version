ALTER TABLE IF EXISTS admin_todo_tasks
  ADD COLUMN IF NOT EXISTS details text;

CREATE TABLE IF NOT EXISTS admin_todo_board_notes (
  id varchar PRIMARY KEY DEFAULT 'shared',
  content text NOT NULL DEFAULT '',
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by varchar(255)
);

INSERT INTO admin_todo_board_notes (id, content)
VALUES ('shared', '')
ON CONFLICT (id) DO NOTHING;
