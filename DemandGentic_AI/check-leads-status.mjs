import pg from 'pg';
const client = new pg.Client(process.env.DATABASE_URL);
await client.connect();

const leads = await client.query(`
  SELECT COUNT(*) as total,
         COUNT(CASE WHEN created_at > NOW() - INTERVAL '24 hours' THEN 1 END) as last_24h,
         COUNT(CASE WHEN created_at > NOW() - INTERVAL '7 days' THEN 1 END) as last_7d
  FROM leads
`);
console.log('Total Leads:', JSON.stringify(leads.rows[0]));

const disps = await client.query(`
  SELECT disposition, COUNT(*) as cnt
  FROM dialer_call_attempts
  WHERE created_at > NOW() - INTERVAL '24 hours'
  AND disposition IS NOT NULL
  GROUP BY disposition
  ORDER BY cnt DESC
`);
console.log('\nLast 24h Dispositions:');
disps.rows.forEach(r => console.log(`  ${r.disposition}: ${r.cnt}`));

const qualified = await client.query(`
  SELECT id, disposition, call_duration_seconds, created_at, agent_type
  FROM dialer_call_attempts
  WHERE disposition = 'qualified_lead'
  AND created_at > NOW() - INTERVAL '7 days'
  ORDER BY created_at DESC
  LIMIT 10
`);
console.log('\nRecent qualified_lead attempts (last 7d):', qualified.rows.length);
qualified.rows.forEach(r => console.log(`  ${r.id} dur=${r.call_duration_seconds}s agent=${r.agent_type} at=${r.created_at}`));

const rpc = await client.query(`
  SELECT COUNT(*) as total_connected,
         COUNT(CASE WHEN disposition = 'qualified_lead' THEN 1 END) as qualified,
         COUNT(CASE WHEN disposition = 'not_interested' THEN 1 END) as not_interested,
         COUNT(CASE WHEN disposition = 'callback_requested' THEN 1 END) as callback
  FROM dialer_call_attempts
  WHERE created_at > NOW() - INTERVAL '24 hours'
  AND connected = true
`);
console.log('\nRPC (connected calls) last 24h:', JSON.stringify(rpc.rows[0]));

const campaigns = await client.query(`
  SELECT c.name,
         COUNT(ca.id) as total_attempts,
         COUNT(CASE WHEN ca.connected THEN 1 END) as connected,
         COUNT(CASE WHEN ca.disposition = 'qualified_lead' THEN 1 END) as qualified
  FROM dialer_call_attempts ca
  JOIN dialer_campaigns c ON c.id = ca.campaign_id
  WHERE ca.created_at > NOW() - INTERVAL '24 hours'
  GROUP BY c.name
  ORDER BY total_attempts DESC
  LIMIT 10
`);
console.log('\nCampaign stats (last 24h):');
campaigns.rows.forEach(r => console.log(`  ${r.name}: attempts=${r.total_attempts} connected=${r.connected} qualified=${r.qualified}`));

// Check disposition engine safety gate activity
const downgraded = await client.query(`
  SELECT COUNT(*) as cnt
  FROM dialer_call_attempts
  WHERE created_at > NOW() - INTERVAL '24 hours'
  AND disposition = 'no_answer'
  AND agent_type = 'ai'
  AND call_duration_seconds > 0
  AND call_duration_seconds  NOW() - INTERVAL '24 hours'
  AND disposition = 'qualified_lead'
  AND agent_type = 'ai'
  AND call_duration_seconds BETWEEN 15 AND 45
`);
console.log('Short qualified leads (15-45s, ai):', shortQualified.rows[0].cnt);

await client.end();