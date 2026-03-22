import pg from 'pg';
const { Pool } = pg;
const p = new Pool({ connectionString: process.env.DATABASE_URL });

const ids = (await p.query("SELECT id FROM campaigns WHERE name LIKE '%UKEF%'")).rows.map(r => r.id);

// Duration distribution of 'new' status leads
const durations = await p.query(`
  SELECT
    CASE
      WHEN call_duration IS NULL THEN 'NULL'
      WHEN call_duration < 20 THEN '<20s'
      WHEN call_duration < 45 THEN '20-44s'
      WHEN call_duration < 60 THEN '45-59s'
      WHEN call_duration < 120 THEN '60-119s'
      ELSE '120s+'
    END as bucket,
    COUNT(*)::int as cnt
  FROM leads
  WHERE campaign_id = ANY($1) AND qa_status = 'new'
  GROUP BY 1 ORDER BY cnt DESC
`, [ids]);
console.log('Duration distribution of NEW leads:');
for (const r of durations.rows) console.log(`  ${r.bucket}: ${r.cnt}`);

// Check: do these 'new' leads have matching dialer_call_attempts with qualified_lead disposition?
const matched = await p.query(`
  SELECT COUNT(*)::int as cnt
  FROM leads l
  JOIN dialer_call_attempts dca ON l.call_attempt_id = dca.id
  WHERE l.campaign_id = ANY($1) AND l.qa_status = 'new' AND dca.disposition = 'qualified_lead'
`, [ids]);
console.log(`\nNEW leads with matching qualified_lead disposition: ${matched.rows[0].cnt}`);

const unmatched = await p.query(`
  SELECT COUNT(*)::int as cnt
  FROM leads l
  WHERE l.campaign_id = ANY($1) AND l.qa_status = 'new'
    AND (l.call_attempt_id IS NULL OR l.call_attempt_id NOT IN (
      SELECT id FROM dialer_call_attempts WHERE disposition = 'qualified_lead'
    ))
`, [ids]);
console.log(`NEW leads WITHOUT matching qualified_lead disposition: ${unmatched.rows[0].cnt}`);

// Check what dispositions those unmatched leads have
const unmatchedDisps = await p.query(`
  SELECT dca.disposition, COUNT(*)::int as cnt
  FROM leads l
  LEFT JOIN dialer_call_attempts dca ON l.call_attempt_id = dca.id
  WHERE l.campaign_id = ANY($1) AND l.qa_status = 'new'
  GROUP BY dca.disposition ORDER BY cnt DESC
`, [ids]);
console.log(`\nDisposition breakdown of NEW leads:`);
for (const r of unmatchedDisps.rows) console.log(`  ${r.disposition || '(null/no match)'}: ${r.cnt}`);

await p.end();