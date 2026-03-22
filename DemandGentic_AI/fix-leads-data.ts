import { db } from './server/db';
import { sql } from 'drizzle-orm';

async function fixLeadsData() {
  console.log('========================================');
  console.log('FIX LEADS DATA');
  console.log('========================================\n');

  // Check the schema of leads table
  const schema = await db.execute(sql`
    SELECT column_name, data_type
    FROM information_schema.columns
    WHERE table_name = 'leads'
    ORDER BY ordinal_position
  `);

  console.log('Leads table columns:');
  for (const row of schema.rows) {
    const r = row as any;
    console.log(`  ${r.column_name}: ${r.data_type}`);
  }

  // Check the 3 leads we just created
  const newLeads = await db.execute(sql`
    SELECT
      l.*,
      c.first_name,
      c.last_name,
      c.email as contact_email
    FROM leads l
    LEFT JOIN contacts c ON c.id = l.contact_id
    WHERE l.created_at > NOW() - INTERVAL '1 day'
    ORDER BY l.created_at DESC
    LIMIT 5
  `);

  console.log('\nRecent leads with contact data:');
  for (const row of newLeads.rows) {
    const r = row as any;
    console.log(`\n  Lead ID: ${r.id}`);
    console.log(`  contact_id: ${r.contact_id}`);
    console.log(`  Contact Name: ${r.first_name} ${r.last_name}`);
    console.log(`  Contact Email: ${r.contact_email}`);
    console.log(`  Lead first_name field: ${r.first_name || 'NULL'}`);
  }

  // Check if leads table has first_name, last_name, email columns
  const hasNameColumns = schema.rows.some((r: any) => r.column_name === 'first_name');
  const hasEmailColumn = schema.rows.some((r: any) => r.column_name === 'email');

  console.log(`\nLeads table has first_name column: ${hasNameColumns}`);
  console.log(`Leads table has email column: ${hasEmailColumn}`);

  // If leads table has these columns, update them from contacts
  if (hasNameColumns && hasEmailColumn) {
    console.log('\nUpdating leads with contact data...');

    const updateResult = await db.execute(sql`
      UPDATE leads l
      SET
        first_name = c.first_name,
        last_name = c.last_name,
        email = c.email
      FROM contacts c
      WHERE c.id = l.contact_id
        AND l.created_at > NOW() - INTERVAL '1 day'
        AND (l.first_name IS NULL OR l.first_name = '')
      RETURNING l.id
    `);

    console.log(`Updated ${updateResult.rows.length} leads`);
  }

  // Verify the fix
  const verifyLeads = await db.execute(sql`
    SELECT
      id,
      first_name,
      last_name,
      email,
      contact_id
    FROM leads
    WHERE created_at > NOW() - INTERVAL '1 day'
    ORDER BY created_at DESC
    LIMIT 5
  `);

  console.log('\nLeads after update:');
  for (const row of verifyLeads.rows) {
    const r = row as any;
    console.log(`  ${r.first_name || 'NULL'} ${r.last_name || 'NULL'} | ${r.email || 'NULL'}`);
  }

  process.exit(0);
}

fixLeadsData().catch(e => {
  console.error('Error:', e);
  process.exit(1);
});