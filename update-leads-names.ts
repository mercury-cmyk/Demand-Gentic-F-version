import { db } from './server/db';
import { sql } from 'drizzle-orm';

async function updateLeadsNames() {
  console.log('Updating leads with contact data...\n');

  // Update the leads with contact data
  const result = await db.execute(sql`
    UPDATE leads l
    SET
      contact_name = CONCAT(c.first_name, ' ', c.last_name),
      contact_email = c.email,
      account_name = a.name
    FROM contacts c
    LEFT JOIN accounts a ON a.id = c.account_id
    WHERE c.id = l.contact_id
      AND l.created_at > NOW() - INTERVAL '1 day'
    RETURNING l.id, l.contact_name, l.contact_email, l.account_name
  `);

  console.log('Updated leads:');
  for (const row of result.rows) {
    const r = row as any;
    console.log(`  ${r.contact_name} | ${r.contact_email} | ${r.account_name}`);
  }

  console.log(`\nTotal updated: ${result.rows.length}`);

  process.exit(0);
}

updateLeadsNames().catch(e => {
  console.error('Error:', e);
  process.exit(1);
});
