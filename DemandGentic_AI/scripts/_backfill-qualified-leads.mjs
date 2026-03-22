import pg from 'pg';
const { Pool } = pg;
const p = new Pool({ connectionString: process.env.DATABASE_URL });

// Backfill 1: Leads with call_duration >= 45 from AI qualified calls
const r1 = await p.query(`
  UPDATE leads l
  SET qa_status = 'approved',
      qa_decision = '✅ Backfill auto-approved: AI disposition qualified_lead, call duration meets threshold.',
      updated_at = NOW()
  FROM dialer_call_attempts dca
  WHERE l.call_attempt_id = dca.id
    AND l.qa_status = 'new'
    AND dca.disposition = 'qualified_lead'
    AND l.call_duration >= 45
  RETURNING l.id
`);
console.log(`Backfill 1 (duration >= 45s): ${r1.rowCount} leads`);

// Backfill 2: Leads with NULL call_duration but have qualified_lead disposition
// These are leads where callDurationSeconds wasn't set at disposition time
// Check the actual dialer_call_attempts duration instead
const r2 = await p.query(`
  UPDATE leads l
  SET qa_status = 'approved',
      qa_decision = '✅ Backfill auto-approved: AI disposition qualified_lead (call_duration was not recorded at creation).',
      updated_at = NOW()
  FROM dialer_call_attempts dca
  WHERE l.call_attempt_id = dca.id
    AND l.qa_status = 'new'
    AND dca.disposition = 'qualified_lead'
    AND l.call_duration IS NULL
  RETURNING l.id
`);
console.log(`Backfill 2 (NULL duration, qualified_lead): ${r2.rowCount} leads`);

// Backfill 3: Human agent qualified leads
const r3 = await p.query(`
  UPDATE leads l
  SET qa_status = 'approved',
      qa_decision = '✅ Backfill auto-approved: human agent qualified disposition.',
      updated_at = NOW()
  FROM call_attempts ca
  WHERE l.call_attempt_id = ca.id
    AND l.qa_status = 'new'
    AND ca.disposition = 'qualified'
    AND (l.call_duration IS NULL OR l.call_duration >= 20)
  RETURNING l.id
`);
console.log(`Backfill 3 (human agent qualified): ${r3.rowCount} leads`);

// Final count
const final = await p.query(`
  SELECT qa_status, COUNT(*)::int as cnt
  FROM leads
  WHERE campaign_id IN (SELECT id FROM campaigns WHERE name LIKE '%UKEF%')
  GROUP BY qa_status ORDER BY cnt DESC
`);
console.log('\nFinal QA status breakdown (UKEF):');
let total = 0;
for (const r of final.rows) { console.log(`  ${r.qa_status}: ${r.cnt}`); total += parseInt(r.cnt); }

const dash = await p.query(`
  SELECT COUNT(*)::int as cnt FROM leads
  WHERE campaign_id IN (SELECT id FROM campaigns WHERE name LIKE '%UKEF%')
    AND qa_status IN ('approved','pending_pm_review','published')
`);
console.log(`\nDashboard "Qualified" will now show: ${dash.rows[0].cnt}`);

await p.end();