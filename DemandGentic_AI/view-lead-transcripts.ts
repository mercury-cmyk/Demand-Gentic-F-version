import { db } from './server/db';
import { sql } from 'drizzle-orm';

/**
 * View Lead Transcripts with QA Scores
 * Shows transcripts for leads created from January 15 calls
 */

async function viewLeadTranscripts() {
  console.log('========================================');
  console.log('LEAD TRANSCRIPTS VIEWER');
  console.log('========================================\n');

  // Parse command line arguments
  const args = process.argv.slice(2);
  const qaStatusFilter = args.find(arg => arg.startsWith('--qa-status='))?.split('=')[1];
  const minScore = args.find(arg => arg.startsWith('--min-score='))?.split('=')[1];
  const limit = args.find(arg => arg.startsWith('--limit='))?.split('=')[1] || '20';
  const leadId = args.find(arg => arg.startsWith('--id='))?.split('=')[1];

  console.log('Filters:');
  if (qaStatusFilter) console.log(`  QA Status: ${qaStatusFilter}`);
  if (minScore) console.log(`  Min Score: ${minScore}`);
  if (leadId) console.log(`  Lead ID: ${leadId}`);
  console.log(`  Limit: ${limit}\n`);

  // Build query
  let query = sql`
    SELECT
      id,
      contact_name,
      account_name,
      email,
      phone,
      job_title,
      qa_status,
      qa_score,
      call_duration,
      recording_url,
      telnyx_call_id,
      qualification_data,
      created_at
    FROM leads
    WHERE created_at::date = '2026-01-15'
  `;

  // Add filters
  if (qaStatusFilter) {
    query = sql`${query} AND qa_status = ${qaStatusFilter}`;
  }
  if (minScore) {
    query = sql`${query} AND qa_score >= ${parseInt(minScore)}`;
  }
  if (leadId) {
    query = sql`${query} AND id = ${leadId}`;
  }

  query = sql`${query} ORDER BY qa_score DESC LIMIT ${parseInt(limit)}`;

  const result = await db.execute(query);
  const leads = result.rows;

  console.log(`Found ${leads.length} leads\n`);

  if (leads.length === 0) {
    console.log('No leads found matching your criteria.');
    console.log('\nTry:');
    console.log('  npx tsx view-lead-transcripts.ts --qa-status=approved');
    console.log('  npx tsx view-lead-transcripts.ts --min-score=70');
    console.log('  npx tsx view-lead-transcripts.ts --limit=10');
    process.exit(0);
  }

  // Display each lead with transcript
  leads.forEach((lead: any, index: number) => {
    const qualData = lead.qualification_data as any;
    const transcript = qualData?.transcript || 'No transcript available';
    const score = qualData?.score || 0;
    const signals = qualData?.signals || { highIntent: [], considering: [] };
    const analysis = qualData?.analysis || {};

    console.log('========================================');
    console.log(`LEAD ${index + 1} of ${leads.length}`);
    console.log('========================================\n');

    console.log('📋 CONTACT INFORMATION');
    console.log(`Name:     ${lead.contact_name || 'N/A'}`);
    console.log(`Company:  ${lead.account_name || 'N/A'}`);
    console.log(`Title:    ${lead.job_title || 'N/A'}`);
    console.log(`Email:    ${lead.email || 'N/A'}`);
    console.log(`Phone:    ${lead.phone || 'N/A'}`);

    console.log('\n📊 QA METRICS');
    console.log(`QA Status:           ${lead.qa_status?.toUpperCase() || 'N/A'}`);
    console.log(`QA Score:            ${lead.qa_score || 0}/100`);
    console.log(`Qualification Score: ${score}/100`);
    console.log(`Call Duration:       ${lead.call_duration || 0}s`);

    console.log('\n🎯 INTENT SIGNALS');
    if (signals.highIntent && signals.highIntent.length > 0) {
      console.log(`High Intent:    ${signals.highIntent.join(', ')}`);
    } else {
      console.log('High Intent:    None detected');
    }
    if (signals.considering && signals.considering.length > 0) {
      console.log(`Considering:    ${signals.considering.join(', ')}`);
    } else {
      console.log('Considering:    None detected');
    }

    console.log('\n📈 CONVERSATION ANALYSIS');
    console.log(`Word Count:     ${analysis.wordCount || 0} words`);
    console.log(`Duration:       ${analysis.duration || 0} seconds`);
    console.log(`Disposition:    ${analysis.disposition || 'N/A'}`);

    console.log('\n💬 CALL TRANSCRIPT');
    console.log('─────────────────────────────────────────');
    console.log(transcript);
    console.log('─────────────────────────────────────────');

    if (lead.recording_url) {
      console.log(`\n🎧 Recording URL: ${lead.recording_url}`);
    }
    if (lead.telnyx_call_id) {
      console.log(`📞 Telnyx Call ID: ${lead.telnyx_call_id}`);
    }

    console.log(`\n🆔 Lead ID: ${lead.id}`);
    console.log(`📅 Created: ${new Date(lead.created_at).toLocaleString()}`);

    console.log('\n');
  });

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

  const avgQaScore = leads.reduce((sum: number, l: any) => sum + (l.qa_score || 0), 0) / leads.length;
  const avgQualScore = leads.reduce((sum: number, l: any) => {
    const qualData = l.qualification_data as any;
    return sum + (qualData?.score || 0);
  }, 0) / leads.length;

  console.log(`\nAverage QA Score:           ${avgQaScore.toFixed(1)}/100`);
  console.log(`Average Qualification Score: ${avgQualScore.toFixed(1)}/100`);

  console.log('\n========================================');
  console.log('USAGE EXAMPLES');
  console.log('========================================\n');

  console.log('View approved leads only:');
  console.log('  npx tsx view-lead-transcripts.ts --qa-status=approved\n');

  console.log('View high-scoring leads (70+):');
  console.log('  npx tsx view-lead-transcripts.ts --min-score=70\n');

  console.log('View top 10 leads:');
  console.log('  npx tsx view-lead-transcripts.ts --limit=10\n');

  console.log('View specific lead:');
  console.log('  npx tsx view-lead-transcripts.ts --id=YOUR_LEAD_ID\n');

  console.log('Combine filters:');
  console.log('  npx tsx view-lead-transcripts.ts --qa-status=approved --min-score=80 --limit=5\n');

  process.exit(0);
}

viewLeadTranscripts().catch(e => {
  console.error('Error:', e);
  process.exit(1);
});