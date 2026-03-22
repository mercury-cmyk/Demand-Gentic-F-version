DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'secret_environment') THEN
    CREATE TYPE secret_environment AS ENUM (
      'development',
      'production'
    );
  END IF;
END
$$;

CREATE TABLE IF NOT EXISTS secret_store (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  description text,
  environment secret_environment NOT NULL DEFAULT 'development',
  service text NOT NULL,
  usage_context text NOT NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  encrypted_value text NOT NULL,
  version integer NOT NULL DEFAULT 1,
  is_active boolean NOT NULL DEFAULT true,
  last_rotated_at timestamptz,
  rotated_by text REFERENCES users(id) ON DELETE SET NULL,
  deactivated_at timestamptz,
  deactivated_by text REFERENCES users(id) ON DELETE SET NULL,
  organization_id text REFERENCES campaign_organizations(id) ON DELETE SET NULL,
  created_by text REFERENCES users(id) ON DELETE SET NULL,
  updated_by text REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS secret_store_env_service_usage_idx
  ON secret_store (environment, service, usage_context, name);
CREATE INDEX IF NOT EXISTS secret_store_environment_idx ON secret_store (environment);
CREATE INDEX IF NOT EXISTS secret_store_service_idx ON secret_store (service);
CREATE INDEX IF NOT EXISTS secret_store_active_idx ON secret_store (is_active);