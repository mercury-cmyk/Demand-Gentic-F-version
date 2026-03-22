/**
 * Fix Missing Leads Script
 *
 * Creates lead records for calls marked as qualified_lead that don't have leads
 *
 * Usage: npx tsx scripts/fix-missing-leads.ts [campaignId]
 */

import { db } from '../server/db';
import { dialerCallAttempts, leads, callSessions, contacts, qcWorkQueue } from '../shared/schema';
import { eq, and, isNull, desc, sql, notInArray } from 'drizzle-orm';

const DRY_RUN = process.argv.includes('--dry-run');
// Get campaign ID filter from args (skip --dry-run flag)
const campaignIdFilter = process.argv.slice(2).find(arg => !arg.startsWith('--')) || null;

async function fixMissingLeads() {
  console.log('\n========================================');
  console.log('  FIX MISSING LEADS');
  console.log(DRY_RUN ? '  (DRY RUN - no changes will be made)' : '');
  console.log('========================================\n');

  // Use raw SQL to get qualified calls without leads (more reliable)
  const campaignFilter = campaignIdFilter ? sql`AND dca.campaign_id = ${campaignIdFilter}` : sql``;
  
  const qualifiedCallsWithoutLeads = await db.execute(sql`
    SELECT 
      dca.id,
      dca.campaign_id as "campaignId",
      dca.contact_id as "contactId",
      dca.call_session_id as "callSessionId",
      dca.call_duration_seconds as "callDurationSeconds",
      dca.phone_dialed as "phoneDialed",
      dca.recording_url as "recordingUrl",
      dca.human_agent_id as "humanAgentId",
      dca.disposition_processed as "dispositionProcessed"
    FROM dialer_call_attempts dca
    WHERE dca.disposition = 'qualified_lead'
      AND NOT EXISTS (
        SELECT 1 FROM leads l WHERE l.call_attempt_id = dca.id
      )
      ${campaignFilter}
    ORDER BY dca.created_at DESC
  `);

  const calls = qualifiedCallsWithoutLeads.rows as Array;

  console.log(`Found ${calls.length} qualified calls without leads\n`);

  if (calls.length === 0) {
    console.log('All qualified calls have corresponding leads. Nothing to fix.');
    return;
  }

  let created = 0;
  let failed = 0;

  for (const call of calls) {
    // Get contact info (companyName is on accounts table, not contacts)
    const [contact] = await db
      .select({
        fullName: contacts.fullName,
        firstName: contacts.firstName,
        lastName: contacts.lastName,
        email: contacts.email,
        accountId: contacts.accountId,
      })
      .from(contacts)
      .where(eq(contacts.id, call.contactId))
      .limit(1);

    const contactName = contact?.fullName ||
      (contact?.firstName && contact?.lastName ? `${contact.firstName} ${contact.lastName}` :
        contact?.firstName || contact?.lastName || 'Unknown');

    // Determine QA status based on call duration
    const MINIMUM_DURATION = 30;
    const isShortCall = (call.callDurationSeconds || 0)  {
    console.log('\nFix complete.');
    process.exit(0);
  })
  .catch((error) => {
    console.error('Error:', error);
    process.exit(1);
  });