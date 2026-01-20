import { db } from './server/db';
import { sql } from 'drizzle-orm';

async function checkLeads() {
  // Check if these 9 contacts have entries in the leads table
  const contactIds = [
    '42b2e795-10ee-4bbf-9016-bfe6a4b65aac',
    'c3eb85f3-e9f0-4e7a-aa2a-00c1cf438a56',
    '44e7c8cd-9f9d-4e0c-86e3-dee93b9b8eb4',
    '792fdde3-900a-4f2e-b6bb-bd404c40a29a',
    '441d3ad8-026e-48fb-b376-83c7ea8c987d',
    '97b2cb09-8a99-44c6-ae38-930a7bc4840a',
    'ff7acc4e-09c1-4172-be69-c7b4f24ae416',
    'fde5e30d-fa1d-4150-8d5b-e72d09588946',
    'ec2a375f-18ec-48e6-8979-0973818be970'
  ];

  const leads = await db.execute(sql`
    SELECT 
      l.id,
      l.contact_id,
      l.contact_name,
      l.qa_status,
      l.created_at,
      c.full_name
    FROM leads l
    LEFT JOIN contacts c ON l.contact_id = c.id
    WHERE l.contact_id = ANY(ARRAY[
      '42b2e795-10ee-4bbf-9016-bfe6a4b65aac',
      'c3eb85f3-e9f0-4e7a-aa2a-00c1cf438a56',
      '44e7c8cd-9f9d-4e0c-86e3-dee93b9b8eb4',
      '792fdde3-900a-4f2e-b6bb-bd404c40a29a',
      '441d3ad8-026e-48fb-b376-83c7ea8c987d',
      '97b2cb09-8a99-44c6-ae38-930a7bc4840a',
      'ff7acc4e-09c1-4172-be69-c7b4f24ae416',
      'fde5e30d-fa1d-4150-8d5b-e72d09588946',
      'ec2a375f-18ec-48e6-8979-0973818be970'
    ])
    ORDER BY l.created_at DESC
  `);

  console.log('=== LEADS TABLE ENTRIES FOR QUALIFIED CONTACTS ===');
  console.log(`Found: ${leads.rows.length} leads`);

  for (const r of leads.rows) {
    console.log(`  ${r.full_name || r.contact_name} | qa_status=${r.qa_status} | created=${r.created_at}`);
  }

  if (leads.rows.length === 0) {
    console.log('\nNo leads records found - these are only in dialer_call_attempts with disposition=qualified_lead');
  }

  process.exit(0);
}

checkLeads();
