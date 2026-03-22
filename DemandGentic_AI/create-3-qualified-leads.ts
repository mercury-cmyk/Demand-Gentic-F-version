import { db } from './server/db';
import { sql } from 'drizzle-orm';
import { leads } from './shared/schema';

/**
 * Create 3 Qualified Leads from January 15
 * These are the only leads that showed positive interest/engagement
 */

async function createQualifiedLeads() {
  console.log('========================================');
  console.log('CREATE 3 QUALIFIED LEADS');
  console.log('========================================\n');

  const qualifiedLeads = [
    {
      name: 'Tim Skrmetti',
      email: 'tskrmetti@americanfirstfinance.com',
      company: 'American First Finance',
      title: 'Senior Director, VP of Business Development - Automotive',
      callId: null, // Will fetch from DB
      reason: 'Engaged with AI agent, asked what call was about',
    },
    {
      name: 'Jason Reiling',
      email: 'jason_reiling@aar.com',
      company: 'MxV Rail',
      title: 'Senior Assistant Vice President - Business Development',
      callId: null,
      reason: 'Positive voicemail tone, potential interest',
    },
    {
      name: 'Yadira Rosas',
      email: 'yrosas@latinomedianetwork.com',
      company: 'Latino Media Network',
      title: null, // Will fetch from contact
      callId: null,
      reason: 'Some engagement detected',
    },
  ];

  console.log('Fetching call details...\n');

  for (const lead of qualifiedLeads) {
    // Find the call attempt
    const callResult = await db.execute(sql`
      SELECT
        dca.id as attempt_id,
        dca.contact_id,
        dca.campaign_id,
        dca.human_agent_id,
        dca.call_duration_seconds,
        dca.disposition,
        dca.recording_url,
        dca.telnyx_call_id,
        dca.phone_dialed,
        dca.notes,
        c.account_id,
        c.email,
        c.job_title,
        c.full_name,
        a.name as account_name
      FROM dialer_call_attempts dca
      LEFT JOIN contacts c ON c.id = dca.contact_id
      LEFT JOIN accounts a ON a.id = c.account_id
      WHERE c.email = ${lead.email}
        AND dca.created_at::date = '2026-01-15'
        AND dca.notes LIKE '%[Call Transcript]%'
      ORDER BY dca.call_duration_seconds DESC
      LIMIT 1
    `);

    if (callResult.rows.length === 0) {
      console.log(`❌ Could not find call for ${lead.name} (${lead.email})`);
      continue;
    }

    const call = callResult.rows[0] as any;

    // Check if lead already exists
    const existingLead = await db.execute(sql`
      SELECT id FROM leads
      WHERE contact_id = ${call.contact_id}
        AND created_at::date = '2026-01-15'
      LIMIT 1
    `);

    if (existingLead.rows.length > 0) {
      console.log(`⏭️  Skipped: ${lead.name} (already exists in leads table)`);
      continue;
    }

    // Extract transcript
    const TRANSCRIPT_MARKER = '[Call Transcript]';
    const notes = call.notes as string;
    const markerIndex = notes.indexOf(TRANSCRIPT_MARKER);
    const transcript = markerIndex >= 0
      ? notes.substring(markerIndex + TRANSCRIPT_MARKER.length).trim()
      : null;

    // Create lead
    try {
      await db.insert(leads).values({
        contactId: call.contact_id,
        campaignId: call.campaign_id,
        agentId: call.human_agent_id,
        contactName: call.full_name || lead.name,
        contactEmail: call.email || lead.email,
        accountName: call.account_name || lead.company,
        callDuration: call.call_duration_seconds,
        recordingUrl: call.recording_url,
        telnyxCallId: call.telnyx_call_id,
        dialedNumber: call.phone_dialed,
        qaStatus: 'under_review', // Manual review recommended
        transcript: transcript,
        transcriptionStatus: 'completed',
        qaData: {
          source: 'manual_qualification',
          reason: lead.reason,
          conversationType: 'real_engagement',
          qualifiedBy: 'ai_conversation_analysis',
          qualifiedAt: new Date().toISOString(),
        },
        notes: `QUALIFIED LEAD: ${lead.reason}\n\nThis lead showed actual engagement during the call and should be prioritized for follow-up.`,
        createdAt: new Date(),
      });

      console.log(`✅ Created: ${lead.name} @ ${lead.company}`);
      console.log(`   Email: ${lead.email}`);
      console.log(`   Reason: ${lead.reason}`);
      console.log(`   Duration: ${call.call_duration_seconds}s\n`);
    } catch (error: any) {
      console.log(`❌ Error creating ${lead.name}: ${error.message}\n`);
    }
  }

  console.log('========================================');
  console.log('SUMMARY');
  console.log('========================================\n');

  const finalCount = await db.execute(sql`
    SELECT COUNT(*) as count
    FROM leads
    WHERE created_at::date = '2026-01-15'
  `);

  console.log(`Total leads from Jan 15: ${finalCount.rows[0]?.count || 0}`);
  console.log('\nThese 3 leads are the ONLY qualified leads from the entire campaign.');
  console.log('They showed actual engagement and should be followed up immediately.\n');

  console.log('Next Steps:');
  console.log('  1. Review these leads manually');
  console.log('  2. Send personalized follow-up emails');
  console.log('  3. Attempt to schedule calls/demos');
  console.log('  4. Fix system flags (connected, voicemail_detected) for better tracking\n');

  process.exit(0);
}

createQualifiedLeads().catch(e => {
  console.error('Error:', e);
  process.exit(1);
});