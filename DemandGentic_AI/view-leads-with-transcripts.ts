import { db } from './server/db';
import { sql } from 'drizzle-orm';

/**
 * View Leads with Transcripts
 * Joins leads with dialer_call_attempts to fetch transcripts
 */

const TRANSCRIPT_MARKER = '[Call Transcript]';

function extractTranscript(notes: string | null): string | null {
  if (!notes) return null;
  const markerIndex = notes.indexOf(TRANSCRIPT_MARKER);
  if (markerIndex === -1) return null;
  return notes.substring(markerIndex + TRANSCRIPT_MARKER.length).trim();
}

async function viewLeadsWithTranscripts() {
  console.log('========================================');
  console.log('LEADS WITH TRANSCRIPTS VIEWER');
  console.log('========================================\n');

  // Parse command line arguments
  const args = process.argv.slice(2);
  const qaStatusFilter = args.find(arg => arg.startsWith('--qa-status='))?.split('=')[1];
  const minScore = args.find(arg => arg.startsWith('--min-score='))?.split('=')[1];
  const limit = parseInt(args.find(arg => arg.startsWith('--limit='))?.split('=')[1] || '10');
  const leadId = args.find(arg => arg.startsWith('--id='))?.split('=')[1];

  console.log('Filters:');
  if (qaStatusFilter) console.log(`  QA Status: ${qaStatusFilter}`);
  if (minScore) console.log(`  Min QA Score: ${minScore}`);
  if (leadId) console.log(`  Lead ID: ${leadId}`);
  console.log(`  Limit: ${limit}\n`);

  // Query leads with call attempts
  const result = await db.execute(sql`
    SELECT
      l.id as lead_id,
      l.contact_name,
      l.account_name,
      l.contact_email,
      l.qa_status,
      l.qa_data,
      l.call_duration,
      l.recording_url,
      l.telnyx_call_id,
      l.created_at,
      -- Get the call attempt notes that contain the transcript
      dca.notes as call_notes,
      dca.id as call_attempt_id,
      dca.disposition,
      dca.call_duration_seconds
    FROM leads l
    LEFT JOIN dialer_call_attempts dca
      ON l.contact_id = dca.contact_id
      AND dca.created_at::date = '2026-01-15'
      AND dca.notes LIKE '%[Call Transcript]%'
    WHERE l.created_at::date = '2026-01-15'
      ${qaStatusFilter ? sql`AND l.qa_status = ${qaStatusFilter}` : sql``}
      ${minScore ? sql`AND (l.qa_data->>'qaScore')::numeric >= ${parseFloat(minScore)}` : sql``}
      ${leadId ? sql`AND l.id = ${leadId}` : sql``}
    ORDER BY (l.qa_data->>'qaScore')::numeric DESC NULLS LAST
    LIMIT ${limit}
  `);

  const leads = result.rows;

  console.log(`Found ${leads.length} leads\n`);

  if (leads.length === 0) {
    console.log('No leads found matching your criteria.\n');
    console.log('Try:');
    console.log('  npx tsx view-leads-with-transcripts.ts --qa-status=approved');
    console.log('  npx tsx view-leads-with-transcripts.ts --min-score=70');
    console.log('  npx tsx view-leads-with-transcripts.ts --limit=5');
    process.exit(0);
  }

  // Display each lead with transcript
  for (const lead of leads as any[]) {
    const qaData = lead.qa_data || {};
    const qaScore = qaData.qaScore || 0;
    const qualScore = qaData.qualificationScore || 0;
    const signals = {
      highIntent: qaData.intentSignals || [],
      considering: qaData.consideringSignals || [],
    };
    const transcript = extractTranscript(lead.call_notes);

    console.log('========================================');
    console.log(`LEAD: ${lead.contact_name}`);
    console.log('========================================\n');

    console.log('📋 CONTACT INFORMATION');
    console.log(`Name:     ${lead.contact_name || 'N/A'}`);
    console.log(`Company:  ${lead.account_name || 'N/A'}`);
    console.log(`Email:    ${lead.contact_email || 'N/A'}`);

    console.log('\n📊 QA METRICS');
    console.log(`QA Status:           ${lead.qa_status?.toUpperCase() || 'N/A'}`);
    console.log(`QA Score:            ${qaScore}/100`);
    console.log(`Qualification Score: ${qualScore}/100`);
    console.log(`Call Duration:       ${lead.call_duration || qaData.callDuration || 0}s`);
    console.log(`Disposition:         ${qaData.disposition || 'N/A'}`);

    console.log('\n🎯 INTENT SIGNALS');
    if (signals.highIntent.length > 0) {
      console.log(`High Intent:    ${signals.highIntent.join(', ')}`);
    } else {
      console.log('High Intent:    None detected');
    }
    if (signals.considering.length > 0) {
      console.log(`Considering:    ${signals.considering.join(', ')}`);
    } else {
      console.log('Considering:    None detected');
    }

    console.log('\n💬 CALL TRANSCRIPT');
    if (transcript) {
      console.log('─────────────────────────────────────────');
      console.log(transcript);
      console.log('─────────────────────────────────────────');
    } else {
      console.log('⚠️  No transcript available');
      console.log('(Transcript may not have been generated for this call)');
    }

    if (lead.recording_url) {
      console.log(`\n🎧 Recording URL: ${lead.recording_url}`);
      console.log('⚠️  Note: Recording URLs expire after 10 minutes');
    }
    if (lead.telnyx_call_id) {
      console.log(`📞 Telnyx Call ID: ${lead.telnyx_call_id}`);
    }
    if (lead.call_attempt_id) {
      console.log(`🔗 Call Attempt ID: ${lead.call_attempt_id}`);
    }

    console.log(`\n🆔 Lead ID: ${lead.lead_id}`);
    console.log(`📅 Created: ${new Date(lead.created_at).toLocaleString()}`);

    console.log('\n');
  }

  // Summary
  console.log('========================================');
  console.log('SUMMARY');
  console.log('========================================\n');

  const byStatus = {
    approved: leads.filter((l: any) => l.qa_status === 'approved').length,
    under_review: leads.filter((l: any) => l.qa_status === 'under_review').length,
    new: leads.filter((l: any) => l.qa_status === 'new').length,
  };

  console.log('Leads by QA Status:');
  console.log(`  Approved:      ${byStatus.approved}`);
  console.log(`  Under Review:  ${byStatus.under_review}`);
  console.log(`  New:           ${byStatus.new}`);

  const withTranscripts = leads.filter((l: any) => extractTranscript(l.call_notes) !== null).length;
  console.log(`\nTranscripts Available: ${withTranscripts}/${leads.length}`);

  const avgQaScore = leads.reduce((sum: number, l: any) => {
    const qaData = l.qa_data || {};
    return sum + (qaData.qaScore || 0);
  }, 0) / leads.length;

  const avgQualScore = leads.reduce((sum: number, l: any) => {
    const qaData = l.qa_data || {};
    return sum + (qaData.qualificationScore || 0);
  }, 0) / leads.length;

  console.log(`\nAverage QA Score:           ${avgQaScore.toFixed(1)}/100`);
  console.log(`Average Qualification Score: ${avgQualScore.toFixed(1)}/100`);

  console.log('\n========================================');
  console.log('USAGE EXAMPLES');
  console.log('========================================\n');

  console.log('View approved leads with transcripts:');
  console.log('  npx tsx view-leads-with-transcripts.ts --qa-status=approved\n');

  console.log('View high-scoring leads (QA score 80+):');
  console.log('  npx tsx view-leads-with-transcripts.ts --min-score=80\n');

  console.log('View top 5 leads:');
  console.log('  npx tsx view-leads-with-transcripts.ts --limit=5\n');

  console.log('View specific lead:');
  console.log('  npx tsx view-leads-with-transcripts.ts --id=YOUR_LEAD_ID\n');

  console.log('Combine filters:');
  console.log('  npx tsx view-leads-with-transcripts.ts --qa-status=approved --min-score=85 --limit=10\n');

  console.log('========================================');
  console.log('NOTE ABOUT RECORDINGS');
  console.log('========================================\n');

  console.log('Recording URLs in the database have EXPIRED (after 10 minutes).');
  console.log('You can still read the full transcripts above.');
  console.log('\nTo access recordings in the future:');
  console.log('  1. Set up auto-transcription webhook (see SETUP-AUTO-TRANSCRIPTION.md)');
  console.log('  2. Store recordings in Google Cloud Storage immediately');
  console.log('  3. Contact Telnyx for fresh recording URLs if needed\n');

  process.exit(0);
}

viewLeadsWithTranscripts().catch(e => {
  console.error('Error:', e);
  process.exit(1);
});