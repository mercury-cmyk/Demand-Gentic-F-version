import pg from 'pg';
const { Client } = pg;

const client = new Client({
  connectionString: "postgresql://neondb_owner:npg_7sYERC3kqXcd@ep-mute-sky-ahoyd10z.c-3.us-east-1.aws.neon.tech/neondb?sslmode=require",
});

await client.connect();

// Try to insert a test call attempt (will rollback)
try {
  await client.query('BEGIN');
  const result = await client.query(`
    INSERT INTO dialer_call_attempts (dialer_run_id, campaign_id, contact_id, queue_item_id, agent_type, phone_dialed, attempt_number)
    VALUES ('073dc3a0-test-test-test-000000000000', '00000000-0000-0000-0000-000000000001', 'test-contact', 'test-queue', 'ai', '+1234567890', 1)
    RETURNING id
  `);
  console.log('Insert succeeded:', result.rows[0]);
  await client.query('ROLLBACK');
} catch (err) {
  console.error('INSERT FAILED:', err.message);
  console.error('Code:', err.code);
  console.error('Detail:', err.detail);
  await client.query('ROLLBACK');
}

// Check columns with NOT NULL but no default
const cols = await client.query(`
  SELECT column_name, data_type, is_nullable, column_default
  FROM information_schema.columns
  WHERE table_name = 'dialer_call_attempts'
    AND is_nullable = 'NO'
    AND column_default IS NULL
  ORDER BY ordinal_position
`);

console.log('\n=== Required columns (NOT NULL, no default) ===');
for (const row of cols.rows) {
  console.log(`  ${row.column_name}: ${row.data_type} (NOT NULL, no default)`);
}

// Check if there was a recent migration
const migrations = await client.query(`
  SELECT * FROM information_schema.tables WHERE table_name LIKE '%migration%' OR table_name LIKE '%drizzle%'
`);
console.log('\n=== Migration tables ===');
for (const row of migrations.rows) {
  console.log(`  ${row.table_name}`);
}

await client.end();