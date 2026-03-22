/**
 * Find Actually Engaged Calls - January 19-20, 2026
 *
 * Looking for calls where there was actual back-and-forth conversation
 * (not just voicemail, IVR, or quick hang-ups)
 */

import 'dotenv/config';
import { db } from './server/db';
import { sql } from 'drizzle-orm';

async function findEngagedCalls(): Promise {
  console.log('='.repeat(100));
  console.log('FINDING ACTUALLY ENGAGED CALLS: January 19-20, 2026');
  console.log('='.repeat(100));
  console.log();

  const startDate = new Date('2026-01-19T00:00:00.000Z');
  const endDate = new Date('2026-01-21T00:00:00.000Z');

  // Get calls with back-and-forth conversation
  const result = await db.execute(sql`
    SELECT
      cs.id as "callSessionId",
      COALESCE(c.full_name, c.first_name || ' ' || c.last_name, 'Unknown') as "contactName",
      COALESCE(c.company_norm, 'Unknown') as "contactCompany",
      COALESCE(c.job_title, 'Unknown') as "contactTitle",
      COALESCE(camp.name, 'Unknown') as "campaignName",
      cs.to_number_e164 as "phone",
      cs.ai_disposition as "aiDisposition",
      dca.disposition as "dialerDisposition",
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
      AND cs.started_at  200
      AND cs.duration_sec >= 20
      AND cs.ai_transcript LIKE '%Contact:%'
      AND cs.ai_transcript LIKE '%Agent:%'
    ORDER BY cs.duration_sec DESC
  `);

  const calls = (result as any).rows || [];
  console.log(`Found ${calls.length} calls with actual conversation\n`);

  // Filter for calls that have multiple exchanges (real conversations)
  const engagedCalls = calls.filter((call: any) => {
    const transcript = call.aiTranscript || '';

    // Count exchanges (alternating Agent/Contact)
    const agentCount = (transcript.match(/Agent:/g) || []).length;
    const contactCount = (transcript.match(/Contact:/g) || []).length;

    // Must have at least 2 exchanges each to be a real conversation
    return agentCount >= 2 && contactCount >= 2;
  });

  console.log(`Of these, ${engagedCalls.length} have real back-and-forth conversations\n`);

  // Analyze each engaged call
  for (const call of engagedCalls) {
    const transcript = call.aiTranscript;
    const aiAnalysis = call.aiAnalysis || {};

    console.log('\n' + '='.repeat(100));
    console.log(`CALL: ${call.callSessionId}`);
    console.log('='.repeat(100));
    console.log(`  Contact:       ${call.contactName}`);
    console.log(`  Title:         ${call.contactTitle || 'Unknown'}`);
    console.log(`  Company:       ${call.contactCompany}`);
    console.log(`  Campaign:      ${call.campaignName}`);
    console.log(`  Phone:         ${call.phone}`);
    console.log(`  Duration:      ${call.durationSec}s`);
    console.log(`  Started:       ${new Date(call.startedAt).toLocaleString()}`);
    console.log(`  AI Disp:       ${call.aiDisposition || 'none'}`);
    console.log(`  Dialer Disp:   ${call.dialerDisposition || 'none'}`);
    console.log(`  Lead:          ${call.leadId || 'NONE'}`);

    if (aiAnalysis.sentiment || aiAnalysis.engagement_level || aiAnalysis.outcome) {
      console.log(`\n  AI ANALYSIS:`);
      console.log(`    Sentiment:   ${aiAnalysis.sentiment || 'N/A'}`);
      console.log(`    Engagement:  ${aiAnalysis.engagement_level || 'N/A'}`);
      console.log(`    Outcome:     ${aiAnalysis.outcome || 'N/A'}`);
      console.log(`    Follow-up:   ${aiAnalysis.follow_up_consent || 'N/A'}`);
      if (aiAnalysis.summary) {
        console.log(`    Summary:     ${aiAnalysis.summary}`);
      }
    }

    // Print full transcript with clear formatting
    console.log(`\n  FULL TRANSCRIPT:`);
    console.log('  ' + '-'.repeat(96));

    const lines = transcript.split('\n').filter((l: string) => l.trim());
    for (const line of lines) {
      const formatted = line.trim();
      if (formatted.startsWith('Agent:')) {
        console.log(`  ${formatted}`);
      } else if (formatted.startsWith('Contact:')) {
        console.log(`  ${formatted}`);
      } else {
        console.log(`    ${formatted}`);
      }
    }
    console.log('  ' + '-'.repeat(96));

    // Quick sentiment check
    const lowerTranscript = transcript.toLowerCase();
    const positiveSignals = [];
    const negativeSignals = [];

    if (lowerTranscript.includes('interested')) positiveSignals.push('interested');
    if (lowerTranscript.includes('send me')) positiveSignals.push('send_me');
    if (lowerTranscript.includes('email')) positiveSignals.push('email');
    if (lowerTranscript.includes('demo')) positiveSignals.push('demo');
    if (lowerTranscript.includes('meeting')) positiveSignals.push('meeting');
    if (lowerTranscript.includes('call back')) positiveSignals.push('call_back');
    if (lowerTranscript.includes('sounds good')) positiveSignals.push('sounds_good');
    if (lowerTranscript.includes('tell me more')) positiveSignals.push('tell_me_more');

    if (lowerTranscript.includes('not interested')) negativeSignals.push('not_interested');
    if (lowerTranscript.includes('no thanks')) negativeSignals.push('no_thanks');
    if (lowerTranscript.includes('remove me')) negativeSignals.push('remove_me');
    if (lowerTranscript.includes('don\'t call')) negativeSignals.push('dont_call');
    if (lowerTranscript.includes('too busy')) negativeSignals.push('too_busy');

    console.log(`\n  SIGNAL CHECK:`);
    console.log(`    Positive: ${positiveSignals.join(', ') || 'none'}`);
    console.log(`    Negative: ${negativeSignals.join(', ') || 'none'}`);

    // Recommendation
    if (positiveSignals.length > negativeSignals.length && positiveSignals.length >= 1) {
      console.log(`\n  >>> RECOMMENDATION: REVIEW - Has positive signals, may be worth following up`);
    } else if (negativeSignals.length > 0) {
      console.log(`\n  >>> RECOMMENDATION: CORRECT - Clear negative signals`);
    } else {
      console.log(`\n  >>> RECOMMENDATION: NEUTRAL - No clear signals either way`);
    }
  }

  // Summary
  console.log('\n' + '='.repeat(100));
  console.log('SUMMARY');
  console.log('='.repeat(100));
  console.log(`Total calls found:                    ${calls.length}`);
  console.log(`Calls with real conversations:        ${engagedCalls.length}`);
  console.log(`Leads created:                        ${engagedCalls.filter((c: any) => c.leadId).length}`);

  process.exit(0);
}

findEngagedCalls().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});