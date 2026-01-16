import { db } from './server/db';
import { sql } from 'drizzle-orm';

async function checkSuccessfulCalls() {
  // Get calls with qualified_lead or not_interested disposition since Jan 15
  const successCalls = await db.execute(sql`
    SELECT
      dca.id,
      dca.disposition,
      dca.call_duration_seconds,
      dca.connected,
      dca.voicemail_detected,
      dca.notes,
      dca.created_at,
      c.first_name,
      c.last_name,
      a.name as company_name
    FROM dialer_call_attempts dca
    LEFT JOIN contacts c ON c.id = dca.contact_id
    LEFT JOIN accounts a ON a.id = c.account_id
    WHERE dca.created_at >= '2026-01-15'
      AND dca.disposition IN ('qualified_lead', 'not_interested')
    ORDER BY dca.created_at DESC
    LIMIT 10
  `);

  console.log('Calls with qualified_lead or not_interested disposition since Jan 15:');
  console.log('====================================================================');
  console.log('Found:', successCalls.rows.length);

  for (const row of successCalls.rows) {
    const r = row as any;
    console.log('');
    console.log('---');
    console.log('Name:', r.first_name, r.last_name, '@', r.company_name);
    console.log('Disposition:', r.disposition);
    console.log('Duration:', r.call_duration_seconds, 's');
    console.log('Connected:', r.connected);
    console.log('Voicemail:', r.voicemail_detected);
    console.log('Created:', r.created_at);
    if (r.notes) {
      console.log('Transcript:');
      console.log(r.notes.substring(0, 2000));
    }
  }

  // Check the last known working day
  const jan14Calls = await db.execute(sql`
    SELECT
      disposition,
      COUNT(*) as count,
      AVG(call_duration_seconds) as avg_duration
    FROM dialer_call_attempts
    WHERE created_at::date = '2026-01-14'
    GROUP BY disposition
    ORDER BY count DESC
  `);

  console.log('\n\nJanuary 14 Disposition Summary (day before):');
  console.log('=============================================');
  for (const row of jan14Calls.rows) {
    const r = row as any;
    console.log(`  ${r.disposition || 'NULL'}: ${r.count} calls (avg ${Math.round(r.avg_duration || 0)}s)`);
  }

  process.exit(0);
}
checkSuccessfulCalls();
