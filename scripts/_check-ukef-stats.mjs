import pg from 'pg';
const { Pool } = pg;
const p = new Pool({ connectionString: process.env.DATABASE_URL });

const ukef = await p.query("SELECT id, name FROM campaigns WHERE name LIKE '%UKEF%' LIMIT 5");
console.log('UKEF Campaigns:', JSON.stringify(ukef.rows, null, 2));

if (!ukef.rows.length) { console.log('No UKEF campaigns'); await p.end(); process.exit(0); }
const ids = ukef.rows.map(r => r.id);

const qa = await p.query("SELECT qa_status, COUNT(*)::int as cnt FROM leads WHERE campaign_id = ANY($1) GROUP BY qa_status ORDER BY cnt DESC", [ids]);
console.log('\nLead QA Status Breakdown:');
let total = 0;
for (const r of qa.rows) { console.log(`  ${r.qa_status || '(null)'}: ${r.cnt}`); total += parseInt(r.cnt); }
console.log(`  TOTAL: ${total}`);

const qualified = await p.query("SELECT COUNT(*)::int as cnt FROM leads WHERE campaign_id = ANY($1) AND qa_status IN ('approved','pending_pm_review','published')", [ids]);
console.log(`\nDashboard "Qualified" count: ${qualified.rows[0].cnt}`);

const humanQ = await p.query("SELECT COUNT(*)::int as cnt FROM call_attempts WHERE campaign_id = ANY($1) AND disposition = 'qualified'", [ids]);
const aiQ = await p.query("SELECT COUNT(*)::int as cnt FROM dialer_call_attempts WHERE campaign_id = ANY($1) AND disposition = 'qualified_lead'", [ids]);
console.log(`\nCall Dispositions:`);
console.log(`  Human 'qualified': ${humanQ.rows[0].cnt}`);
console.log(`  AI 'qualified_lead': ${aiQ.rows[0].cnt}`);
console.log(`  Total: ${parseInt(humanQ.rows[0].cnt) + parseInt(aiQ.rows[0].cnt)}`);

const gap = parseInt(humanQ.rows[0].cnt) + parseInt(aiQ.rows[0].cnt) - parseInt(qualified.rows[0].cnt);
if (gap > 0) console.log(`\n  GAP: ${gap} qualified calls have no approved lead!`);

const recent = await p.query("SELECT qa_status, COUNT(*)::int as cnt FROM leads WHERE campaign_id = ANY($1) AND created_at > NOW() - INTERVAL '7 days' GROUP BY qa_status ORDER BY cnt DESC", [ids]);
console.log(`\nLast 7 days leads:`, JSON.stringify(recent.rows));

const recentCalls = await p.query("SELECT disposition, COUNT(*)::int as cnt FROM dialer_call_attempts WHERE campaign_id = ANY($1) AND created_at > NOW() - INTERVAL '7 days' GROUP BY disposition ORDER BY cnt DESC", [ids]);
console.log(`Last 7 days AI call dispositions:`, JSON.stringify(recentCalls.rows));

await p.end();
