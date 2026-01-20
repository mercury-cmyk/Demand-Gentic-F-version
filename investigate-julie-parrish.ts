/**
 * Investigate the Julie Parrish call - why was it marked not_interested?
 * And look for any other similar calls that may have been misclassified
 */

import 'dotenv/config';
import { db } from './server/db';
import { sql } from 'drizzle-orm';

async function investigateJulieParrish(): Promise<void> {
  console.log('='.repeat(140));
  console.log('INVESTIGATING JULIE PARRISH CALL + SIMILAR PATTERNS');
  console.log('='.repeat(140));
  console.log();

  // Get the Julie Parrish call with ALL related data
  const callResult = await db.execute(sql`
    SELECT
      cs.*,
      dca.id as "dialerCallAttemptId",
      dca.disposition as "dcaDisposition",
      dca.created_at as "dcaCreatedAt",
      c.full_name as "contactFullName",
      c.first_name as "contactFirstName",
      c.last_name as "contactLastName",
      c.email as "contactEmail",
      c.job_title as "contactTitle",
      c.company_norm as "contactCompany",
      camp.name as "campaignName"
    FROM call_sessions cs
    LEFT JOIN dialer_call_attempts dca ON dca.call_session_id = cs.id
    LEFT JOIN contacts c ON c.id = cs.contact_id
    LEFT JOIN campaigns camp ON camp.id = cs.campaign_id
    WHERE cs.id = 'c21acdad-5d0b-4399-9771-4c5ce724a685'
  `);

  const julieCall = (callResult as any).rows?.[0];

  if (julieCall) {
    console.log('JULIE PARRISH CALL - FULL DETAILS');
    console.log('='.repeat(140));
    console.log(`
Call Session ID:      ${julieCall.id}
Contact ID:           ${julieCall.contact_id}
Contact Name:         ${julieCall.contactFullName || julieCall.contactFirstName + ' ' + julieCall.contactLastName}
Contact Title:        ${julieCall.contactTitle}
Contact Company:      ${julieCall.contactCompany}
Contact Email:        ${julieCall.contactEmail}

Campaign ID:          ${julieCall.campaign_id}
Campaign Name:        ${julieCall.campaignName}

Call To Number:       ${julieCall.to_number_e164}
Call From Number:     ${julieCall.from_number_e164}
Started At:           ${julieCall.started_at}
Answered At:          ${julieCall.answered_at}
Ended At:             ${julieCall.ended_at}
Duration (sec):       ${julieCall.duration_sec}

AI Disposition:       ${julieCall.ai_disposition}
AI Status:            ${julieCall.status}
AI Phase:             ${julieCall.ai_agent_phase}
End Reason:           ${julieCall.end_reason}

Dialer Attempt ID:    ${julieCall.dialerCallAttemptId}
Dialer Disposition:   ${julieCall.dcaDisposition}
Dialer Created:       ${julieCall.dcaCreatedAt}
`);

    console.log('AI ANALYSIS:');
    console.log(JSON.stringify(julieCall.ai_analysis, null, 2));

    console.log('\nFULL TRANSCRIPT:');
    console.log('-'.repeat(140));
    console.log(julieCall.ai_transcript);
    console.log('-'.repeat(140));
  }

  // Now let's find ALL calls where:
  // 1. Contact said "yeah" multiple times
  // 2. Contact said "go ahead" or similar
  // 3. But call was marked not_interested
  console.log('\n\n' + '='.repeat(140));
  console.log('SEARCHING FOR SIMILAR PATTERNS - CALLS WITH POSITIVE SIGNALS BUT MARKED NOT_INTERESTED');
  console.log('='.repeat(140));
  console.log();

  const startDate = new Date('2026-01-14T00:00:00.000Z');
  const endDate = new Date('2026-01-21T00:00:00.000Z');

  const similarCalls = await db.execute(sql`
    SELECT
      cs.id as "callSessionId",
      cs.contact_id as "contactId",
      COALESCE(c.full_name, c.first_name || ' ' || c.last_name, 'Unknown') as "contactName",
      c.email as "contactEmail",
      COALESCE(c.company_norm, 'Unknown') as "contactCompany",
      COALESCE(c.job_title, 'Unknown') as "contactTitle",
      COALESCE(camp.name, 'Unknown') as "campaignName",
      cs.to_number_e164 as "phone",
      cs.ai_disposition as "aiDisposition",
      cs.status as "callStatus",
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
      AND cs.ai_transcript IS NOT NULL
      AND LENGTH(cs.ai_transcript) > 100
      AND (cs.ai_disposition = 'not_interested' OR dca.disposition::text = 'not_interested')
      AND (
        cs.ai_transcript ILIKE '%yeah, yeah%'
        OR cs.ai_transcript ILIKE '%go ahead%'
        OR cs.ai_transcript ILIKE '%tell me more%'
        OR cs.ai_transcript ILIKE '%sounds good%'
        OR cs.ai_transcript ILIKE '%sounds interesting%'
        OR cs.ai_transcript ILIKE '%send me%'
        OR cs.ai_transcript ILIKE '%email me%'
      )
    ORDER BY cs.duration_sec DESC
  `);

  const matches = (similarCalls as any).rows || [];
  console.log(`Found ${matches.length} calls with positive signals but marked not_interested:\n`);

  for (const call of matches) {
    console.log('─'.repeat(140));
    console.log(`CALL: ${call.callSessionId}`);
    console.log(`  Contact:      ${call.contactName} (${call.contactTitle})`);
    console.log(`  Company:      ${call.contactCompany}`);
    console.log(`  Email:        ${call.contactEmail || 'N/A'}`);
    console.log(`  Phone:        ${call.phone}`);
    console.log(`  Duration:     ${call.durationSec}s`);
    console.log(`  Status:       ${call.callStatus}`);
    console.log(`  Disposition:  ${call.aiDisposition || call.dialerDisposition}`);
    console.log(`  Lead:         ${call.leadId || 'NONE'}`);

    // Show the transcript
    if (call.aiTranscript) {
      console.log('\n  TRANSCRIPT:');
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
    }
    console.log();
  }

  // Summary
  console.log('\n' + '='.repeat(140));
  console.log('ACTIONABLE RECOMMENDATIONS');
  console.log('='.repeat(140));
  console.log(`
The following contacts showed CLEAR positive engagement but were marked as not_interested:

1. JULIE PARRISH (CMO, Corelight)
   - Email: julie.parrish@corelight.com
   - Phone: +14086212472
   - Said: "Yeah. Can you hear me?" and "Yeah, yeah, yeah, go ahead."
   - The call was cut off mid-pitch - she was actively listening
   - RECOMMENDATION: Create lead and follow up immediately

ROOT CAUSE ANALYSIS:
   - The call ended (possibly due to connection issue) during the pitch phase
   - The AI disposition system saw an incomplete conversation
   - Default fallback to "not_interested" kicked in
   - This is the bug we identified earlier in telnyx-ai-bridge.ts

BUG FIXES ALREADY APPLIED:
   - mapPhaseToDisposition() now returns "needs_review" for pitch phase
   - mapToCanonicalDisposition() now defaults to "no_answer" for ambiguous cases
   - These fixes will prevent future misclassification

IMMEDIATE ACTION NEEDED:
   - Create a lead for Julie Parrish (CMO at Corelight)
   - She was clearly interested and engaged
   - The call should be retried or followed up via email
  `);

  process.exit(0);
}

investigateJulieParrish().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
