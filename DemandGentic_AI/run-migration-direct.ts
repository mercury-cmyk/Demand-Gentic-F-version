import { db } from './server/db';
import { sql } from 'drizzle-orm';

async function runMigration() {
  console.log('Running number pool management migration...\n');

  try {
    // Create enums first
    console.log('Creating enums...');

    await db.execute(sql`
      DO $$ BEGIN
        CREATE TYPE number_status AS ENUM ('active', 'cooling', 'suspended', 'retired');
      EXCEPTION WHEN duplicate_object THEN null;
      END $$
    `);
    console.log('  - number_status enum');

    await db.execute(sql`
      DO $$ BEGIN
        CREATE TYPE number_reputation_band AS ENUM ('excellent', 'healthy', 'warning', 'risk', 'burned');
      EXCEPTION WHEN duplicate_object THEN null;
      END $$
    `);
    console.log('  - number_reputation_band enum');

    await db.execute(sql`
      DO $$ BEGIN
        CREATE TYPE assignment_scope AS ENUM ('campaign', 'agent', 'region', 'global');
      EXCEPTION WHEN duplicate_object THEN null;
      END $$
    `);
    console.log('  - assignment_scope enum');

    await db.execute(sql`
      DO $$ BEGIN
        CREATE TYPE cooldown_reason AS ENUM (
          'consecutive_short_calls', 'zero_answer_rate', 'repeated_failures',
          'audio_quality_issues', 'reputation_threshold', 'manual_admin', 'carrier_block_suspected'
        );
      EXCEPTION WHEN duplicate_object THEN null;
      END $$
    `);
    console.log('  - cooldown_reason enum');

    // Create number_assignments table
    console.log('\nCreating tables...');

    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS number_assignments (
        id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
        number_id VARCHAR NOT NULL REFERENCES telnyx_numbers(id) ON DELETE CASCADE,
        scope assignment_scope NOT NULL DEFAULT 'global',
        campaign_id VARCHAR,
        virtual_agent_id VARCHAR,
        region TEXT,
        priority INTEGER NOT NULL DEFAULT 0,
        is_active BOOLEAN NOT NULL DEFAULT TRUE,
        valid_from TIMESTAMP,
        valid_until TIMESTAMP,
        created_at TIMESTAMP NOT NULL DEFAULT NOW(),
        created_by VARCHAR
      )
    `);
    console.log('  - number_assignments');

    // Create number_reputation table
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS number_reputation (
        id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
        number_id VARCHAR NOT NULL REFERENCES telnyx_numbers(id) ON DELETE CASCADE UNIQUE,
        score INTEGER NOT NULL DEFAULT 70,
        band number_reputation_band NOT NULL DEFAULT 'healthy',
        answer_rate_score INTEGER DEFAULT 50,
        duration_score INTEGER DEFAULT 50,
        short_call_score INTEGER DEFAULT 50,
        hangup_score INTEGER DEFAULT 50,
        voicemail_score INTEGER DEFAULT 50,
        failure_score INTEGER DEFAULT 50,
        total_calls INTEGER DEFAULT 0,
        answered_calls INTEGER DEFAULT 0,
        short_calls INTEGER DEFAULT 0,
        immediate_hangups INTEGER DEFAULT 0,
        voicemail_calls INTEGER DEFAULT 0,
        failed_calls INTEGER DEFAULT 0,
        avg_duration_sec NUMERIC(10,2) DEFAULT 0,
        score_trend TEXT DEFAULT 'stable',
        last_score_change INTEGER DEFAULT 0,
        last_calculated_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP NOT NULL DEFAULT NOW()
      )
    `);
    console.log('  - number_reputation');

    // Create number_metrics_daily table
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS number_metrics_daily (
        id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
        number_id VARCHAR NOT NULL REFERENCES telnyx_numbers(id) ON DELETE CASCADE,
        metric_date DATE NOT NULL,
        total_calls INTEGER DEFAULT 0,
        answered_calls INTEGER DEFAULT 0,
        no_answer_calls INTEGER DEFAULT 0,
        voicemail_calls INTEGER DEFAULT 0,
        busy_calls INTEGER DEFAULT 0,
        failed_calls INTEGER DEFAULT 0,
        short_calls INTEGER DEFAULT 0,
        immediate_hangups INTEGER DEFAULT 0,
        avg_duration_sec NUMERIC(10,2) DEFAULT 0,
        max_duration_sec INTEGER DEFAULT 0,
        qualified_calls INTEGER DEFAULT 0,
        callbacks_scheduled INTEGER DEFAULT 0,
        peak_hour INTEGER,
        peak_hour_calls INTEGER DEFAULT 0,
        total_cost_cents INTEGER DEFAULT 0,
        created_at TIMESTAMP NOT NULL DEFAULT NOW(),
        UNIQUE(number_id, metric_date)
      )
    `);
    console.log('  - number_metrics_daily');

    // Create number_metrics_window table
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS number_metrics_window (
        id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
        number_id VARCHAR NOT NULL REFERENCES telnyx_numbers(id) ON DELETE CASCADE,
        call_session_id VARCHAR,
        dialer_attempt_id VARCHAR,
        called_at TIMESTAMP NOT NULL,
        answered BOOLEAN DEFAULT FALSE,
        duration_sec INTEGER DEFAULT 0,
        disposition TEXT,
        is_short_call BOOLEAN DEFAULT FALSE,
        is_immediate_hangup BOOLEAN DEFAULT FALSE,
        is_voicemail BOOLEAN DEFAULT FALSE,
        is_failed BOOLEAN DEFAULT FALSE,
        failure_reason TEXT,
        prospect_number_e164 TEXT,
        campaign_id VARCHAR,
        created_at TIMESTAMP NOT NULL DEFAULT NOW()
      )
    `);
    console.log('  - number_metrics_window');

    // Create number_cooldowns table
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS number_cooldowns (
        id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
        number_id VARCHAR NOT NULL REFERENCES telnyx_numbers(id) ON DELETE CASCADE,
        started_at TIMESTAMP NOT NULL DEFAULT NOW(),
        ends_at TIMESTAMP NOT NULL,
        ended_early_at TIMESTAMP,
        reason cooldown_reason NOT NULL,
        reason_details JSONB,
        recovery_max_calls_per_hour INTEGER,
        recovery_max_calls_per_day INTEGER,
        recovery_duration_hours INTEGER DEFAULT 24,
        triggered_by VARCHAR,
        is_active BOOLEAN NOT NULL DEFAULT TRUE,
        created_at TIMESTAMP NOT NULL DEFAULT NOW()
      )
    `);
    console.log('  - number_cooldowns');

    // Create prospect_call_suppression table
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS prospect_call_suppression (
        id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
        prospect_number_e164 TEXT NOT NULL UNIQUE,
        last_called_at TIMESTAMP NOT NULL,
        last_disposition TEXT,
        last_number_id VARCHAR REFERENCES telnyx_numbers(id) ON DELETE SET NULL,
        suppress_until TIMESTAMP,
        suppress_reason TEXT,
        call_attempts_24h INTEGER DEFAULT 1,
        call_attempts_7d INTEGER DEFAULT 1,
        created_at TIMESTAMP NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMP NOT NULL DEFAULT NOW()
      )
    `);
    console.log('  - prospect_call_suppression');

    // Create number_routing_decisions table
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS number_routing_decisions (
        id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
        call_session_id VARCHAR,
        dialer_attempt_id VARCHAR,
        campaign_id VARCHAR,
        virtual_agent_id VARCHAR,
        prospect_number_e164 TEXT,
        prospect_area_code VARCHAR(10),
        prospect_region TEXT,
        selected_number_id VARCHAR REFERENCES telnyx_numbers(id) ON DELETE SET NULL,
        selected_number_e164 TEXT,
        selection_reason TEXT,
        candidates_count INTEGER DEFAULT 0,
        candidates_filtered_out JSONB,
        routing_latency_ms INTEGER,
        jitter_delay_ms INTEGER,
        decided_at TIMESTAMP NOT NULL DEFAULT NOW()
      )
    `);
    console.log('  - number_routing_decisions');

    // Create number_pool_alerts table
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS number_pool_alerts (
        id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
        alert_type TEXT NOT NULL,
        severity TEXT NOT NULL DEFAULT 'warning',
        number_id VARCHAR REFERENCES telnyx_numbers(id) ON DELETE CASCADE,
        campaign_id VARCHAR,
        title TEXT NOT NULL,
        description TEXT,
        details JSONB,
        is_acknowledged BOOLEAN DEFAULT FALSE,
        acknowledged_by VARCHAR,
        acknowledged_at TIMESTAMP,
        created_at TIMESTAMP NOT NULL DEFAULT NOW()
      )
    `);
    console.log('  - number_pool_alerts');

    // Create indexes
    console.log('\nCreating indexes...');

    await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_number_assignments_number ON number_assignments(number_id)`);
    await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_number_reputation_score ON number_reputation(score DESC)`);
    await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_number_metrics_window_number_time ON number_metrics_window(number_id, called_at DESC)`);
    await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_number_cooldowns_number_active ON number_cooldowns(number_id, is_active)`);
    await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_routing_decisions_time ON number_routing_decisions(decided_at DESC)`);

    console.log('  - indexes created');

    // Add columns to call_sessions if they don't exist
    console.log('\nAdding columns to call_sessions...');
    try {
      await db.execute(sql`ALTER TABLE call_sessions ADD COLUMN IF NOT EXISTS caller_number_id VARCHAR`);
      await db.execute(sql`ALTER TABLE call_sessions ADD COLUMN IF NOT EXISTS from_did TEXT`);
      console.log('  - caller_number_id, from_did added');
    } catch (e: any) {
      console.log('  - columns may already exist');
    }

    console.log('\n=== Migration completed! ===\n');

    // Verify tables
    const tables = await db.execute(sql`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'public'
      AND table_name IN (
        'telnyx_numbers',
        'number_assignments',
        'number_reputation',
        'number_metrics_daily',
        'number_metrics_window',
        'number_cooldowns',
        'prospect_call_suppression',
        'number_routing_decisions',
        'number_pool_alerts'
      )
      ORDER BY table_name
    `);

    console.log('Number pool tables now in database:');
    for (const t of tables.rows) {
      console.log(`  - ${(t as any).table_name}`);
    }

  } catch (e: any) {
    console.error('Migration failed:', e.message);
    console.error(e);
  }
  process.exit(0);
}

runMigration();