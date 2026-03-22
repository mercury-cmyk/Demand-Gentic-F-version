import pg from 'pg';
const client = new pg.Client(process.env.DATABASE_URL);
await client.connect();

// Qualified lead attempts in last 24h
const r = await client.query(`
  SELECT id, disposition, call_duration_seconds, created_at, updated_at, agent_type, connected, campaign_id
  FROM dialer_call_attempts
  WHERE disposition = 'qualified_lead'
  AND created_at > NOW() - INTERVAL '24 hours'
  ORDER BY created_at DESC
`);
console.log('Qualified lead attempts (24h):', r.rows.length);
r.rows.forEach(row => console.log(`  ${row.id} dur=${row.call_duration_seconds}s connected=${row.connected} created=${row.created_at} updated=${row.updated_at}`));

// Check if leads exist for these attempts
if (r.rows.length > 0) {
  const ids = r.rows.map(r => r.id);
  const leads = await client.query(`
    SELECT id, call_attempt_id, status, created_at
    FROM leads
    WHERE call_attempt_id = ANY($1)
  `, [ids]);
  console.log('\nLeads created for these attempts:', leads.rows.length);
  leads.rows.forEach(row => console.log(`  lead=${row.id} attempt=${row.call_attempt_id} status=${row.status} created=${row.created_at}`));

  // Check which attempts have NO lead
  const leadAttemptIds = new Set(leads.rows.map(r => r.call_attempt_id));
  const missingLeads = r.rows.filter(row => !leadAttemptIds.has(row.id));
  console.log('\nAttempts WITHOUT leads:', missingLeads.length);
  missingLeads.forEach(row => console.log(`  ${row.id} dur=${row.call_duration_seconds}s campaign=${row.campaign_id}`));
}

// Check when the container was last restarted (approximate from first log)
console.log('\n--- Timing ---');
const now = new Date();
console.log('Current time:', now.toISOString());

// Check all recent dispositions processed through engine
const engineProcessed = await client.query(`
  SELECT disposition, COUNT(*) as cnt
  FROM dialer_call_attempts
  WHERE updated_at > NOW() - INTERVAL '2 hours'
  AND disposition IS NOT NULL
  GROUP BY disposition
  ORDER BY cnt DESC
`);
console.log('\nDispositions updated in last 2h:');
engineProcessed.rows.forEach(r => console.log(`  ${r.disposition}: ${r.cnt}`));

await client.end();