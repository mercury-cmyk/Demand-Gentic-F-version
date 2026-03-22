DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'admin_todo_task_status') THEN
    CREATE TYPE admin_todo_task_status AS ENUM ('todo', 'in_progress', 'done');
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS admin_todo_tasks (
  id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  status admin_todo_task_status NOT NULL DEFAULT 'todo',
  assignee_name varchar(120),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS admin_todo_tasks_status_idx ON admin_todo_tasks(status);
CREATE INDEX IF NOT EXISTS admin_todo_tasks_created_at_idx ON admin_todo_tasks(created_at);