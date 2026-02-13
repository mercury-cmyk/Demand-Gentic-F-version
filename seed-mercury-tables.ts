/**
 * Creates Mercury tables and seeds default templates.
 * Run with: npx tsx seed-mercury-tables.ts
 */
import { db } from './server/db';
import { sql } from 'drizzle-orm';
import { seedDefaultTemplates } from './server/services/mercury/default-templates';

async function main() {
  console.log('Creating Mercury tables...');

  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS mercury_templates (
      id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
      template_key VARCHAR NOT NULL UNIQUE,
      name VARCHAR NOT NULL,
      description TEXT,
      subject_template TEXT NOT NULL,
      html_template TEXT NOT NULL,
      text_template TEXT,
      variables JSONB NOT NULL DEFAULT '[]',
      is_enabled BOOLEAN NOT NULL DEFAULT true,
      version INTEGER NOT NULL DEFAULT 1,
      category VARCHAR DEFAULT 'notification',
      created_by VARCHAR REFERENCES users(id) ON DELETE SET NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  console.log('  mercury_templates ✓');

  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS mercury_email_outbox (
      id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
      template_key VARCHAR NOT NULL,
      recipient_email TEXT NOT NULL,
      recipient_name TEXT,
      recipient_user_id VARCHAR,
      recipient_user_type VARCHAR DEFAULT 'client',
      tenant_id VARCHAR,
      subject TEXT NOT NULL,
      html_body TEXT NOT NULL,
      text_body TEXT,
      from_email TEXT NOT NULL DEFAULT 'mercury@pivotal-b2b.com',
      from_name TEXT NOT NULL DEFAULT 'Pivotal B2B',
      status VARCHAR NOT NULL DEFAULT 'queued',
      message_id VARCHAR,
      error_message TEXT,
      retry_count INTEGER NOT NULL DEFAULT 0,
      max_retries INTEGER NOT NULL DEFAULT 3,
      idempotency_key VARCHAR UNIQUE,
      metadata JSONB,
      scheduled_at TIMESTAMPTZ,
      sent_at TIMESTAMPTZ,
      failed_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  console.log('  mercury_email_outbox ✓');

  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS mercury_notification_events (
      id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
      event_type VARCHAR NOT NULL,
      tenant_id VARCHAR,
      actor_user_id VARCHAR,
      payload JSONB NOT NULL DEFAULT '{}',
      processed_at TIMESTAMPTZ,
      error_message TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  console.log('  mercury_notification_events ✓');

  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS mercury_notification_rules (
      id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
      event_type VARCHAR NOT NULL,
      template_key VARCHAR NOT NULL,
      channel_type VARCHAR NOT NULL DEFAULT 'email',
      recipient_resolver VARCHAR NOT NULL,
      custom_recipients JSONB,
      is_enabled BOOLEAN NOT NULL DEFAULT true,
      description TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  console.log('  mercury_notification_rules ✓');

  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS mercury_invitation_tokens (
      id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
      client_user_id VARCHAR NOT NULL REFERENCES client_users(id) ON DELETE CASCADE,
      client_account_id VARCHAR NOT NULL REFERENCES client_accounts(id) ON DELETE CASCADE,
      token VARCHAR NOT NULL UNIQUE,
      expires_at TIMESTAMPTZ NOT NULL,
      used_at TIMESTAMPTZ,
      email_outbox_id VARCHAR REFERENCES mercury_email_outbox(id) ON DELETE SET NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  console.log('  mercury_invitation_tokens ✓');

  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS mercury_notification_preferences (
      id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id VARCHAR NOT NULL,
      user_type VARCHAR NOT NULL DEFAULT 'client',
      notification_type VARCHAR NOT NULL,
      channel_type VARCHAR NOT NULL DEFAULT 'email',
      is_enabled BOOLEAN NOT NULL DEFAULT true,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  console.log('  mercury_notification_preferences ✓');

  console.log('\nAll Mercury tables created. Seeding default templates...');
  const result = await seedDefaultTemplates();
  console.log(`Templates seeded: ${result.created} created, ${result.skipped} skipped`);

  process.exit(0);
}

main().catch(e => {
  console.error('Error:', e.message);
  process.exit(1);
});
