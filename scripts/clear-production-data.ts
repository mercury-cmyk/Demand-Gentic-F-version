/**
 * PRODUCTION DATA CLEANUP SCRIPT
 * 
 * This script safely clears all business data from production database
 * while preserving the users table.
 * 
 * ⚠️ WARNING: This is PERMANENT and cannot be undone!
 * 
 * Usage:
 *   1. Stop your published app first (if running)
 *   2. Run: npx tsx scripts/clear-production-data.ts
 *   3. Confirm the action
 *   4. Re-publish your app
 */

import { neon } from '@neondatabase/serverless';
import * as readline from 'readline';

// Get production database URL from environment
const PROD_DATABASE_URL = process.env.DATABASE_URL;

if (!PROD_DATABASE_URL) {
  console.error('❌ ERROR: DATABASE_URL environment variable not found!');
  console.error('Make sure you are running this in your Replit environment.');
  process.exit(1);
}

const sql = neon(PROD_DATABASE_URL);

async function confirmAction(): Promise<boolean> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });

  return new Promise((resolve) => {
    console.log('\n⚠️  WARNING: This will PERMANENTLY delete all business data from production!');
    console.log('   The following data will be DELETED:');
    console.log('   - All Accounts');
    console.log('   - All Contacts');
    console.log('   - All Campaigns');
    console.log('   - All Leads');
    console.log('   - All Lists/Segments');
    console.log('   - All Call History');
    console.log('   - All Suppressions');
    console.log('   - All DV Projects');
    console.log('');
    console.log('✅ The following will be PRESERVED:');
    console.log('   - Users (all user accounts)');
    console.log('   - Email Templates');
    console.log('   - SIP Trunks');
    console.log('   - Reference Data (countries, industries, etc.)');
    console.log('');
    
    rl.question('Type "DELETE PRODUCTION DATA" to confirm: ', (answer) => {
      rl.close();
      resolve(answer === 'DELETE PRODUCTION DATA');
    });
  });
}

async function clearProductionData() {
  try {
    console.log('\n📊 Checking current database state...\n');
    
    // Count records before deletion
    const beforeCounts = await sql`
      SELECT 
        (SELECT COUNT(*) FROM accounts) as accounts,
        (SELECT COUNT(*) FROM contacts) as contacts,
        (SELECT COUNT(*) FROM campaigns) as campaigns,
        (SELECT COUNT(*) FROM leads) as leads,
        (SELECT COUNT(*) FROM users) as users
    `;
    
    console.log('Current record counts:');
    console.log(`  Accounts: ${beforeCounts[0].accounts}`);
    console.log(`  Contacts: ${beforeCounts[0].contacts}`);
    console.log(`  Campaigns: ${beforeCounts[0].campaigns}`);
    console.log(`  Leads: ${beforeCounts[0].leads}`);
    console.log(`  Users: ${beforeCounts[0].users} ✅ (will be preserved)`);
    
    const confirmed = await confirmAction();
    
    if (!confirmed) {
      console.log('\n❌ Operation cancelled. No data was deleted.');
      process.exit(0);
    }
    
    console.log('\n🗑️  Starting data cleanup...\n');
    
    // Execute cleanup - clear tables in correct order to handle foreign keys
    // Campaign-related suppressions (production schema)
    console.log('  Clearing campaign suppressions...');
    await sql`TRUNCATE TABLE campaign_suppression_emails CASCADE`;
    await sql`TRUNCATE TABLE campaign_suppression_domains CASCADE`;
    await sql`TRUNCATE TABLE campaign_suppression_contacts CASCADE`;
    await sql`TRUNCATE TABLE campaign_suppression_accounts CASCADE`;
    
    console.log('  Clearing campaign opt-outs...');
    await sql`TRUNCATE TABLE campaign_opt_outs CASCADE`;
    
    console.log('  Clearing campaign queues...');
    await sql`TRUNCATE TABLE campaign_queue CASCADE`;
    await sql`TRUNCATE TABLE agent_queue CASCADE`;
    await sql`TRUNCATE TABLE auto_dialer_queues CASCADE`;
    
    console.log('  Clearing campaign statistics...');
    await sql`TRUNCATE TABLE campaign_account_stats CASCADE`;
    await sql`TRUNCATE TABLE campaign_audience_snapshots CASCADE`;
    
    console.log('  Clearing campaign assignments...');
    await sql`TRUNCATE TABLE campaign_agent_assignments CASCADE`;
    await sql`TRUNCATE TABLE campaign_agents CASCADE`;
    
    console.log('  Clearing call history...');
    await sql`TRUNCATE TABLE calls CASCADE`;
    await sql`TRUNCATE TABLE call_attempts CASCADE`;
    await sql`TRUNCATE TABLE call_events CASCADE`;
    await sql`TRUNCATE TABLE call_sessions CASCADE`;
    await sql`TRUNCATE TABLE call_jobs CASCADE`;
    await sql`TRUNCATE TABLE call_recording_access_logs CASCADE`;
    
    console.log('  Clearing call dispositions...');
    await sql`TRUNCATE TABLE call_dispositions CASCADE`;
    await sql`TRUNCATE TABLE dispositions CASCADE`;
    
    console.log('  Clearing leads and qualifications...');
    await sql`TRUNCATE TABLE qualification_responses CASCADE`;
    await sql`TRUNCATE TABLE leads CASCADE`;
    
    console.log('  Clearing domain sets...');
    await sql`TRUNCATE TABLE domain_set_contact_links CASCADE`;
    await sql`TRUNCATE TABLE domain_set_items CASCADE`;
    await sql`TRUNCATE TABLE domain_sets CASCADE`;
    
    console.log('  Clearing contact emails...');
    await sql`TRUNCATE TABLE contact_emails CASCADE`;
    await sql`TRUNCATE TABLE contact_voicemail_tracking CASCADE`;
    
    console.log('  Clearing contacts...');
    await sql`TRUNCATE TABLE contacts CASCADE`;
    
    console.log('  Clearing account domains and aliases...');
    await sql`TRUNCATE TABLE account_domains CASCADE`;
    await sql`TRUNCATE TABLE company_aliases CASCADE`;
    
    console.log('  Clearing accounts...');
    await sql`TRUNCATE TABLE accounts CASCADE`;
    
    console.log('  Clearing campaign orders...');
    await sql`TRUNCATE TABLE order_campaign_links CASCADE`;
    await sql`TRUNCATE TABLE order_qualification_questions CASCADE`;
    await sql`TRUNCATE TABLE order_audience_snapshots CASCADE`;
    await sql`TRUNCATE TABLE order_assets CASCADE`;
    await sql`TRUNCATE TABLE campaign_orders CASCADE`;
    
    console.log('  Clearing campaign content...');
    await sql`TRUNCATE TABLE campaign_content_links CASCADE`;
    
    console.log('  Clearing campaigns...');
    await sql`TRUNCATE TABLE campaigns CASCADE`;
    
    console.log('  Clearing lists and segments...');
    await sql`TRUNCATE TABLE lists CASCADE`;
    await sql`TRUNCATE TABLE segments CASCADE`;
    
    console.log('  Clearing global suppression lists...');
    await sql`TRUNCATE TABLE suppression_emails CASCADE`;
    await sql`TRUNCATE TABLE suppression_phones CASCADE`;
    await sql`TRUNCATE TABLE suppression_list CASCADE`;
    await sql`TRUNCATE TABLE global_dnc CASCADE`;
    
    console.log('  Clearing DV (Data Verification) projects...');
    await sql`TRUNCATE TABLE dv_deliveries CASCADE`;
    await sql`TRUNCATE TABLE dv_records CASCADE`;
    await sql`TRUNCATE TABLE dv_records_raw CASCADE`;
    await sql`TRUNCATE TABLE dv_account_assignments CASCADE`;
    await sql`TRUNCATE TABLE dv_accounts CASCADE`;
    await sql`TRUNCATE TABLE dv_selection_sets CASCADE`;
    await sql`TRUNCATE TABLE dv_exclusion_lists CASCADE`;
    await sql`TRUNCATE TABLE dv_company_caps CASCADE`;
    await sql`TRUNCATE TABLE dv_agent_filters CASCADE`;
    await sql`TRUNCATE TABLE dv_field_constraints CASCADE`;
    await sql`TRUNCATE TABLE dv_field_mappings CASCADE`;
    await sql`TRUNCATE TABLE dv_project_agents CASCADE`;
    await sql`TRUNCATE TABLE dv_project_exclusions CASCADE`;
    await sql`TRUNCATE TABLE dv_runs CASCADE`;
    await sql`TRUNCATE TABLE dv_projects CASCADE`;
    
    console.log('  Clearing email verification...');
    await sql`TRUNCATE TABLE verification_email_validations CASCADE`;
    await sql`TRUNCATE TABLE verification_email_validation_jobs CASCADE`;
    await sql`TRUNCATE TABLE verification_lead_submissions CASCADE`;
    await sql`TRUNCATE TABLE verification_contacts CASCADE`;
    await sql`TRUNCATE TABLE verification_campaigns CASCADE`;
    await sql`TRUNCATE TABLE verification_suppression_list CASCADE`;
    await sql`TRUNCATE TABLE verification_upload_jobs CASCADE`;
    await sql`TRUNCATE TABLE verification_audit_log CASCADE`;
    
    console.log('  Clearing content assets...');
    await sql`TRUNCATE TABLE content_versions CASCADE`;
    await sql`TRUNCATE TABLE content_events CASCADE`;
    await sql`TRUNCATE TABLE content_approvals CASCADE`;
    await sql`TRUNCATE TABLE content_asset_pushes CASCADE`;
    await sql`TRUNCATE TABLE content_assets CASCADE`;
    await sql`TRUNCATE TABLE social_posts CASCADE`;
    
    console.log('  Clearing email activity...');
    await sql`TRUNCATE TABLE email_sends CASCADE`;
    await sql`TRUNCATE TABLE email_events CASCADE`;
    await sql`TRUNCATE TABLE email_messages CASCADE`;
    
    console.log('  Clearing activity logs...');
    await sql`TRUNCATE TABLE activity_log CASCADE`;
    await sql`TRUNCATE TABLE audit_logs CASCADE`;
    await sql`TRUNCATE TABLE field_change_log CASCADE`;
    
    console.log('  Clearing agent statuses...');
    await sql`TRUNCATE TABLE agent_status CASCADE`;
    
    console.log('  Clearing voicemail assets...');
    await sql`TRUNCATE TABLE voicemail_assets CASCADE`;
    
    console.log('  Clearing bulk imports...');
    await sql`TRUNCATE TABLE bulk_imports CASCADE`;
    
    console.log('  Clearing dedupe queue...');
    await sql`TRUNCATE TABLE dedupe_review_queue CASCADE`;
    
    console.log('  Clearing saved filters...');
    await sql`TRUNCATE TABLE saved_filters CASCADE`;
    
    console.log('  Clearing events and resources...');
    await sql`TRUNCATE TABLE sponsors CASCADE`;
    await sql`TRUNCATE TABLE speakers CASCADE`;
    await sql`TRUNCATE TABLE organizers CASCADE`;
    await sql`TRUNCATE TABLE events CASCADE`;
    await sql`TRUNCATE TABLE resources CASCADE`;
    await sql`TRUNCATE TABLE news CASCADE`;
    
    console.log('  Clearing AI generations...');
    await sql`TRUNCATE TABLE ai_content_generations CASCADE`;
    
    console.log('  Clearing domain reputation snapshots...');
    await sql`TRUNCATE TABLE domain_reputation_snapshots CASCADE`;
    await sql`TRUNCATE TABLE per_domain_stats CASCADE`;
    
    console.log('\n✅ All business data cleared successfully!\n');
    
    // Verify final state
    const afterCounts = await sql`
      SELECT 
        (SELECT COUNT(*) FROM accounts) as accounts,
        (SELECT COUNT(*) FROM contacts) as contacts,
        (SELECT COUNT(*) FROM campaigns) as campaigns,
        (SELECT COUNT(*) FROM leads) as leads,
        (SELECT COUNT(*) FROM users) as users
    `;
    
    console.log('Final record counts:');
    console.log(`  Accounts: ${afterCounts[0].accounts} ✅`);
    console.log(`  Contacts: ${afterCounts[0].contacts} ✅`);
    console.log(`  Campaigns: ${afterCounts[0].campaigns} ✅`);
    console.log(`  Leads: ${afterCounts[0].leads} ✅`);
    console.log(`  Users: ${afterCounts[0].users} ✅ (preserved)`);
    
    console.log('\n✅ Production database cleanup complete!');
    console.log('\n📝 Next steps:');
    console.log('   1. Your production database is now clean');
    console.log('   2. Click "Publish" button to deploy the current version');
    console.log('   3. Your users can still log in with existing credentials');
    
  } catch (error) {
    console.error('\n❌ ERROR during cleanup:');
    console.error(error);
    console.error('\nSome data may have been deleted. Check the logs above.');
    process.exit(1);
  }
}

// Run the cleanup
clearProductionData()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('Fatal error:', error);
    process.exit(1);
  });
