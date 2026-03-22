import pg from 'pg';
import dotenv from 'dotenv';

dotenv.config();

const { Pool } = pg;

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

async function runMigration() {
  const client = await pool.connect();
  try {
    console.log('Starting migration to create agentic tables...');

    await client.query('BEGIN');

    // Create campaign_intake_requests table
    console.log('Creating table: campaign_intake_requests');
    await client.query(`
      CREATE TABLE IF NOT EXISTS campaign_intake_requests (
        id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
        source_type text,
        client_account_id varchar REFERENCES client_accounts(id) ON DELETE SET NULL,
        client_order_id varchar REFERENCES client_portal_orders(id) ON DELETE SET NULL,
        agentic_session_id varchar,
        raw_input jsonb,
        extracted_context jsonb,
        context_sources jsonb,
        status text DEFAULT 'pending',
        priority text DEFAULT 'normal',
        assigned_pm_id varchar REFERENCES users(id) ON DELETE SET NULL,
        assigned_at timestamp,
        qso_reviewed_by_id varchar REFERENCES users(id) ON DELETE SET NULL,
        qso_reviewed_at timestamp,
        qso_notes text,
        approved_by_id varchar REFERENCES users(id) ON DELETE SET NULL,
        approved_at timestamp,
        rejection_reason text,
        campaign_id varchar REFERENCES campaigns(id) ON DELETE SET NULL,
        project_id varchar REFERENCES client_projects(id) ON DELETE SET NULL,
        requested_start_date timestamp,
        requested_lead_count integer,
        estimated_cost numeric,
        requested_channels jsonb,
        campaign_type text,
        created_at timestamp NOT NULL DEFAULT NOW(),
        updated_at timestamp NOT NULL DEFAULT NOW()
      );
    `);

    console.log('Creating indexes for campaign_intake_requests');
    await client.query(`
      CREATE INDEX IF NOT EXISTS campaign_intake_requests_client_account_idx ON campaign_intake_requests(client_account_id);
      CREATE INDEX IF NOT EXISTS campaign_intake_requests_status_idx ON campaign_intake_requests(status);
      CREATE INDEX IF NOT EXISTS campaign_intake_requests_created_at_idx ON campaign_intake_requests(created_at);
    `);

    // Create agentic_campaign_sessions table
    console.log('Creating table: agentic_campaign_sessions');
    await client.query(`
      CREATE TABLE IF NOT EXISTS agentic_campaign_sessions (
        id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
        intake_request_id varchar,
        current_step text DEFAULT 'context',
        completed_steps jsonb,
        conversation_history jsonb,
        approvals jsonb,
        context_config jsonb,
        audience_config jsonb,
        voice_config jsonb,
        phone_config jsonb,
        content_config jsonb,
        review_config jsonb,
        created_by varchar REFERENCES users(id) ON DELETE SET NULL,
        created_at timestamp NOT NULL DEFAULT NOW(),
        updated_at timestamp NOT NULL DEFAULT NOW()
      );
    `);

    console.log('Creating indexes for agentic_campaign_sessions');
    await client.query(`
      CREATE INDEX IF NOT EXISTS agentic_campaign_sessions_created_by_idx ON agentic_campaign_sessions(created_by);
      CREATE INDEX IF NOT EXISTS agentic_campaign_sessions_current_step_idx ON agentic_campaign_sessions(current_step);
    `);

    await client.query('COMMIT');
    console.log('Migration completed successfully.');

  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Migration failed:', error);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

runMigration();