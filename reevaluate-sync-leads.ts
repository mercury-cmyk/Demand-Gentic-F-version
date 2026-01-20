import { db } from './server/db';
import { sql } from 'drizzle-orm';

async function reevaluateAndSync() {
  console.log('=== RE-EVALUATE AND SYNC QUALIFIED LEADS ===\n');

  // 1. Reset all rejected leads to 'new' status for these contacts
  console.log('--- Step 1: Reset leads to qa_status=new ---');
  
  const resetResult = await db.execute(sql`
    UPDATE leads
    SET qa_status = 'new',
        rejected_reason = NULL,
        rejected_at = NULL,
        rejected_by_id = NULL,
        updated_at = NOW()
    WHERE contact_id IN (
      '42b2e795-10ee-4bbf-9016-bfe6a4b65aac',
      'c3eb85f3-e9f0-4e7a-aa2a-00c1cf438a56',
      '44e7c8cd-9f9d-4e0c-86e3-dee93b9b8eb4',
      '792fdde3-900a-4f2e-b6bb-bd404c40a29a',
      '441d3ad8-026e-48fb-b376-83c7ea8c987d',
      '97b2cb09-8a99-44c6-ae38-930a7bc4840a',
      'ff7acc4e-09c1-4172-be69-c7b4f24ae416',
      'fde5e30d-fa1d-4150-8d5b-e72d09588946',
      'ec2a375f-18ec-48e6-8979-0973818be970'
    )
    RETURNING id, contact_name
  `);
  
  console.log(`Reset ${resetResult.rowCount} leads to qa_status=new`);

  // 2. Find missing contacts (in dialer_call_attempts but not in leads)
  console.log('\n--- Step 2: Find and sync missing leads ---');
  
  const missingLeads = await db.execute(sql`
    SELECT 
      dca.id as call_attempt_id,
      dca.contact_id,
      dca.campaign_id,
      dca.call_duration_seconds,
      dca.notes,
      c.full_name,
      c.email,
      a.name as account_name
    FROM dialer_call_attempts dca
    LEFT JOIN contacts c ON dca.contact_id = c.id
    LEFT JOIN accounts a ON c.account_id = a.id
    WHERE dca.disposition = 'qualified_lead'
      AND NOT EXISTS (
        SELECT 1 FROM leads l WHERE l.contact_id = dca.contact_id
      )
  `);

  console.log(`Found ${missingLeads.rows.length} missing leads to sync`);

  for (const lead of missingLeads.rows) {
    console.log(`\nSyncing: ${lead.full_name} @ ${lead.account_name}`);
    
    // Insert into leads table
    await db.execute(sql`
      INSERT INTO leads (
        contact_id,
        contact_name,
        contact_email,
        campaign_id,
        qa_status,
        account_name,
        call_duration,
        notes,
        created_at,
        updated_at
      ) VALUES (
        ${lead.contact_id},
        ${lead.full_name},
        ${lead.email},
        ${lead.campaign_id},
        'new',
        ${lead.account_name},
        ${lead.call_duration_seconds},
        ${lead.notes},
        NOW(),
        NOW()
      )
    `);
    
    console.log(`  ✅ Created lead for ${lead.full_name}`);
  }

  // 3. Print final summary
  console.log('\n\n=== FINAL STATUS ===');
  
  const finalStatus = await db.execute(sql`
    SELECT 
      l.qa_status,
      COUNT(*) as cnt
    FROM leads l
    WHERE l.contact_id IN (
      '42b2e795-10ee-4bbf-9016-bfe6a4b65aac',
      'c3eb85f3-e9f0-4e7a-aa2a-00c1cf438a56',
      '44e7c8cd-9f9d-4e0c-86e3-dee93b9b8eb4',
      '792fdde3-900a-4f2e-b6bb-bd404c40a29a',
      '441d3ad8-026e-48fb-b376-83c7ea8c987d',
      '97b2cb09-8a99-44c6-ae38-930a7bc4840a',
      'ff7acc4e-09c1-4172-be69-c7b4f24ae416',
      'fde5e30d-fa1d-4150-8d5b-e72d09588946',
      'ec2a375f-18ec-48e6-8979-0973818be970'
    )
    GROUP BY l.qa_status
  `);

  for (const r of finalStatus.rows) {
    console.log(`  ${r.qa_status}: ${r.cnt} leads`);
  }

  // List all leads
  const allLeads = await db.execute(sql`
    SELECT 
      l.contact_name,
      l.qa_status,
      l.account_name
    FROM leads l
    WHERE l.contact_id IN (
      '42b2e795-10ee-4bbf-9016-bfe6a4b65aac',
      'c3eb85f3-e9f0-4e7a-aa2a-00c1cf438a56',
      '44e7c8cd-9f9d-4e0c-86e3-dee93b9b8eb4',
      '792fdde3-900a-4f2e-b6bb-bd404c40a29a',
      '441d3ad8-026e-48fb-b376-83c7ea8c987d',
      '97b2cb09-8a99-44c6-ae38-930a7bc4840a',
      'ff7acc4e-09c1-4172-be69-c7b4f24ae416',
      'fde5e30d-fa1d-4150-8d5b-e72d09588946',
      'ec2a375f-18ec-48e6-8979-0973818be970'
    )
    ORDER BY l.created_at DESC
  `);

  console.log('\nAll leads:');
  for (const r of allLeads.rows) {
    console.log(`  ${r.contact_name} @ ${r.account_name} | ${r.qa_status}`);
  }

  process.exit(0);
}

reevaluateAndSync();
