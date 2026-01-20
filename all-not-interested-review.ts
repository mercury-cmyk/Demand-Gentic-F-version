/**
 * Review ALL "not_interested" calls with full transcripts
 * No scoring - just show everything for human review
 */

import 'dotenv/config';
import { db } from './server/db';
import { sql } from 'drizzle-orm';

async function reviewAllNotInterested(): Promise<void> {
  console.log('='.repeat(140));
  console.log('ALL "NOT INTERESTED" CALLS - FULL REVIEW');
  console.log('='.repeat(140));
  console.log();

  const startDate = new Date('2026-01-19T00:00:00.000Z');
  const endDate = new Date('2026-01-21T00:00:00.000Z');

  // Get all not_interested calls
  const result = await db.execute(sql`
    SELECT
      cs.id as "callSessionId",
      dca.id as "callAttemptId",
      cs.contact_id as "contactId",
      COALESCE(c.full_name, c.first_name || ' ' || c.last_name, 'Unknown') as "contactName",
      c.email as "contactEmail",
      COALESCE(c.company_norm, 'Unknown') as "contactCompany",
      COALESCE(c.job_title, 'Unknown') as "contactTitle",
      cs.campaign_id as "campaignId",
      COALESCE(camp.name, 'Unknown') as "campaignName",
      cs.to_number_e164 as "phone",
      cs.ai_disposition as "aiDisposition",
      dca.disposition::text as "dialerDisposition",
      cs.ai_transcript as "aiTranscript",
      cs.ai_analysis as "aiAnalysis",
      cs.duration_sec as "durationSec",
      cs.started_at as "startedAt",
      l.id as "leadId"
    FROM call_sessions cs
    LEFT JOIN dialer_call_attempts dca ON dca.call_session_id = cs.id
    LEFT JOIN contacts c ON c.id = cs.contact_id
    LEFT JOIN campaigns camp ON camp.id = cs.campaign_id
    LEFT JOIN leads l ON l.call_attempt_id = dca.id OR l.id LIKE 'ai-' || cs.id || '%'
    WHERE cs.started_at >= ${startDate.toISOString()}::timestamp
      AND cs.started_at < ${endDate.toISOString()}::timestamp
      AND (cs.ai_disposition = 'not_interested' OR dca.disposition::text = 'not_interested')
    ORDER BY cs.duration_sec DESC
  `);

  const calls = (result as any).rows || [];
  console.log(`Total "not_interested" calls: ${calls.length}\n`);

  // Print each call with full details
  let callNum = 0;
  for (const call of calls) {
    callNum++;
    console.log('='.repeat(140));
    console.log(`CALL ${callNum}/${calls.length}: ${call.callSessionId}`);
    console.log('='.repeat(140));
    console.log(`  Contact:      ${call.contactName}`);
    console.log(`  Title:        ${call.contactTitle}`);
    console.log(`  Company:      ${call.contactCompany}`);
    console.log(`  Email:        ${call.contactEmail || 'N/A'}`);
    console.log(`  Phone:        ${call.phone}`);
    console.log(`  Campaign:     ${call.campaignName}`);
    console.log(`  Duration:     ${call.durationSec}s`);
    console.log(`  Started:      ${new Date(call.startedAt).toLocaleString()}`);
    console.log(`  AI Disp:      ${call.aiDisposition || 'none'}`);
    console.log(`  Dialer Disp:  ${call.dialerDisposition || 'none'}`);
    console.log(`  Lead:         ${call.leadId || 'NONE'}`);

    const analysis = call.aiAnalysis || {};
    if (Object.keys(analysis).length > 0) {
      console.log(`\n  AI ANALYSIS:`);
      console.log(`    Sentiment:    ${analysis.sentiment || 'N/A'}`);
      console.log(`    Engagement:   ${analysis.engagement_level || 'N/A'}`);
      console.log(`    Follow-up:    ${analysis.follow_up_consent || 'N/A'}`);
      console.log(`    Outcome:      ${analysis.outcome || 'N/A'}`);
      if (analysis.summary) {
        console.log(`    Summary:      ${analysis.summary}`);
      }
    }

    console.log(`\n  FULL TRANSCRIPT:`);
    console.log('  ' + '-'.repeat(136));
    if (call.aiTranscript && call.aiTranscript.length > 10) {
      const lines = call.aiTranscript.split('\n').filter((l: string) => l.trim());
      for (const line of lines) {
        const trimmed = line.trim();
        if (trimmed.startsWith('Agent:')) {
          console.log(`    🤖 ${trimmed}`);
        } else if (trimmed.startsWith('Contact:')) {
          console.log(`    👤 ${trimmed}`);
        } else {
          console.log(`       ${trimmed}`);
        }
      }
    } else {
      console.log('    (No transcript available)');
    }
    console.log('  ' + '-'.repeat(136));
    console.log();
  }

  // Summary
  console.log('='.repeat(140));
  console.log('SUMMARY');
  console.log('='.repeat(140));

  const withTranscripts = calls.filter((c: any) => c.aiTranscript && c.aiTranscript.length > 50);
  const longCalls = calls.filter((c: any) => c.durationSec >= 30);
  const shortCalls = calls.filter((c: any) => c.durationSec < 15);

  console.log(`
Total "not_interested" calls:     ${calls.length}
With meaningful transcripts:      ${withTranscripts.length}
Long calls (30+ seconds):         ${longCalls.length}
Short calls (< 15 seconds):       ${shortCalls.length}
With leads in DB:                 ${calls.filter((c: any) => c.leadId).length}
  `);

  // CSV export
  console.log('\n' + '='.repeat(140));
  console.log('CSV EXPORT - ALL NOT_INTERESTED CALLS');
  console.log('='.repeat(140));
  console.log();
  console.log('Contact Name,Title,Company,Phone,Email,Duration,Has Transcript,Call ID');

  for (const call of calls) {
    console.log([
      `"${call.contactName}"`,
      `"${call.contactTitle}"`,
      `"${call.contactCompany}"`,
      call.phone || '',
      call.contactEmail || '',
      call.durationSec,
      call.aiTranscript && call.aiTranscript.length > 50 ? 'YES' : 'NO',
      call.callSessionId
    ].join(','));
  }

  process.exit(0);
}

reviewAllNotInterested().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
