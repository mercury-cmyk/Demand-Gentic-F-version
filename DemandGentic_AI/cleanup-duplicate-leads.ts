import { db } from './server/db';
import { sql } from 'drizzle-orm';

async function main() {
  console.log('========================================');
  console.log('  CLEANUP DUPLICATE LEADS');
  console.log('========================================\n');

  // Find duplicate leads
  const duplicates = await db.execute(sql`
    SELECT 
      l.contact_id, 
      COUNT(*) as cnt,
      c.full_name,
      c.email
    FROM leads l
    LEFT JOIN contacts c ON c.id = l.contact_id
    GROUP BY l.contact_id, c.full_name, c.email
    HAVING COUNT(*) > 1
  `);

  console.log(`Found ${duplicates.rows.length} contacts with duplicate leads\n`);

  if (duplicates.rows.length === 0) {
    console.log('No duplicates to clean up.');
    process.exit(0);
  }

  let totalDeleted = 0;

  for (const dup of duplicates.rows as any[]) {
    console.log(`${dup.full_name} (${dup.email})`);
    console.log(`  Contact ID: ${dup.contact_id}`);
    console.log(`  Duplicate count: ${dup.cnt}`);

    // Get all lead IDs for this contact
    const leadsForContact = await db.execute(sql`
      SELECT id, qa_status, created_at
      FROM leads
      WHERE contact_id = ${dup.contact_id}
      ORDER BY created_at ASC
    `);

    const leadIds = (leadsForContact.rows as any[]).map(r => r.id);
    const keepId = leadIds[0];
    const deleteIds = leadIds.slice(1);

    console.log(`  Keeping: ${keepId}`);
    console.log(`  Deleting: ${deleteIds.join(', ')}`);

    // Delete duplicates
    for (const deleteId of deleteIds) {
      await db.execute(sql`DELETE FROM leads WHERE id = ${deleteId}`);
      totalDeleted++;
    }

    console.log('');
  }

  console.log('========================================');
  console.log(`✅ Deleted ${totalDeleted} duplicate leads`);

  // Final count
  const remaining = await db.execute(sql`SELECT COUNT(*) as cnt FROM leads`);
  console.log(`Total leads remaining: ${(remaining.rows[0] as any).cnt}`);

  process.exit(0);
}

main().catch(console.error);