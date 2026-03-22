import { db } from './server/db';
import { sql } from 'drizzle-orm';

/**
 * Delete the 3 false positive leads from January 15
 * These were incorrectly identified as qualified leads:
 * 1. Tim Skrmetti - was Google Call Assist, not a human
 * 2. Jason Reiling - was a voicemail
 * 3. Yadira Rosas - was a voicemail
 */

async function deleteFalsePositiveLeads() {
  console.log('========================================');
  console.log('DELETE FALSE POSITIVE LEADS');
  console.log('========================================\n');

  const args = process.argv.slice(2);
  const EXECUTE = args.includes('--execute');

  if (!EXECUTE) {
    console.log('🔍 DRY RUN MODE - No changes will be made');
    console.log('Run with --execute to actually delete\n');
  } else {
    console.log('⚡ EXECUTE MODE - Leads WILL be deleted\n');
  }

  const falsePositiveEmails = [
    'tskrmetti@americanfirstfinance.com',  // Tim Skrmetti - Google Call Assist
    'jason_reiling@aar.com',               // Jason Reiling - voicemail
    'yrosas@latinomedianetwork.com',       // Yadira Rosas - voicemail
  ];

  // Find leads to delete
  const leads = await db.execute(sql`
    SELECT id, contact_name, contact_email, account_name, qa_status
    FROM leads
    WHERE contact_email = ANY(${falsePositiveEmails})
  `);

  console.log(`Found ${leads.rows.length} leads to delete:\n`);

  leads.rows.forEach((lead: any, i) => {
    console.log(`${i + 1}. ${lead.contact_name}`);
    console.log(`   Email: ${lead.contact_email}`);
    console.log(`   Company: ${lead.account_name || 'N/A'}`);
    console.log(`   Status: ${lead.qa_status}`);
    console.log(`   ID: ${lead.id}\n`);
  });

  if (!EXECUTE) {
    console.log('\nTo delete these leads, run:');
    console.log('  npx tsx delete-false-positive-leads.ts --execute\n');
    process.exit(0);
  }

  // Execute deletion
  console.log('Deleting leads...\n');

  const result = await db.execute(sql`
    DELETE FROM leads
    WHERE contact_email = ANY(${falsePositiveEmails})
    RETURNING id, contact_name
  `);

  console.log(`✅ Deleted ${result.rows.length} leads\n`);

  result.rows.forEach((lead: any) => {
    console.log(`  - ${lead.contact_name}`);
  });

  // Verify deletion
  const remaining = await db.execute(sql`
    SELECT COUNT(*) as count
    FROM leads
    WHERE contact_email = ANY(${falsePositiveEmails})
  `);

  console.log(`\nRemaining leads with these emails: ${remaining.rows[0]?.count || 0}`);
  console.log('\n✅ False positive leads have been deleted!');

  process.exit(0);
}

deleteFalsePositiveLeads().catch(e => {
  console.error('Error:', e);
  process.exit(1);
});