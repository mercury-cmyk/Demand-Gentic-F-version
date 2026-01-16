import { db } from './server/db';
import { sql } from 'drizzle-orm';

async function checkHumanCalls() {
  // Check the Gray Bekurs call that WAS qualified
  const grayCall = await db.execute(sql`
    SELECT
      dca.notes,
      dca.call_duration_seconds
    FROM dialer_call_attempts dca
    WHERE dca.disposition = 'qualified_lead'
      AND dca.created_at >= '2026-01-15'
    LIMIT 1
  `);

  console.log('\n=== SUCCESSFUL QUALIFIED LEAD (Gray Bekurs) ===');
  console.log('Duration:', (grayCall.rows[0] as any)?.call_duration_seconds, 'seconds');
  console.log('-'.repeat(60));
  if (grayCall.rows[0]) {
    console.log((grayCall.rows[0] as any).notes);
  }

  // Check the two calls identified as having human interaction
  const humanCalls = await db.execute(sql`
    SELECT
      dca.id,
      dca.call_duration_seconds,
      dca.notes,
      c.first_name,
      c.last_name,
      a.name as company_name
    FROM dialer_call_attempts dca
    LEFT JOIN contacts c ON c.id = dca.contact_id
    LEFT JOIN accounts a ON a.id = c.account_id
    WHERE dca.created_at >= '2026-01-15'
      AND dca.call_duration_seconds BETWEEN 106 AND 109
      AND dca.disposition = 'no_answer'
      AND dca.notes IS NOT NULL
      AND LENGTH(dca.notes) > 100
    ORDER BY dca.call_duration_seconds DESC
    LIMIT 10
  `);

  console.log('\n\n=== CALLS WITH POTENTIAL HUMAN INTERACTION ===');
  for (const row of humanCalls.rows) {
    const r = row as any;
    console.log('\n' + '='.repeat(60));
    console.log(`Name: ${r.first_name} ${r.last_name} @ ${r.company_name}`);
    console.log(`Duration: ${r.call_duration_seconds}s`);
    console.log('-'.repeat(60));
    console.log('TRANSCRIPT:');
    console.log(r.notes);
  }

  process.exit(0);
}
checkHumanCalls();
