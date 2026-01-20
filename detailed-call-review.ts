/**
 * Detailed review of ALL calls - show full transcripts for calls where contact actually responded
 */

import 'dotenv/config';
import { db } from './server/db';
import { sql } from 'drizzle-orm';

async function detailedCallReview(): Promise<void> {
  console.log('='.repeat(140));
  console.log('DETAILED CALL REVIEW - ALL CONNECTED CALLS WITH FULL TRANSCRIPTS');
  console.log('='.repeat(140));
  console.log();

  const startDate = new Date('2026-01-14T00:00:00.000Z');
  const endDate = new Date('2026-01-21T00:00:00.000Z');

  // Get ALL calls with any transcript
  const result = await db.execute(sql`
    SELECT
      cs.id as "callSessionId",
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
      AND cs.ai_transcript IS NOT NULL
      AND LENGTH(cs.ai_transcript) > 50
    ORDER BY cs.duration_sec DESC
  `);

  const calls = (result as any).rows || [];
  console.log(`Total calls with transcripts: ${calls.length}\n`);

  // Filter for calls where Contact actually spoke (not just voicemail/IVR)
  const realConversations = calls.filter((call: any) => {
    if (!call.aiTranscript) return false;
    const transcript = call.aiTranscript;

    // Count meaningful Contact: lines
    const contactLines = transcript.split('\n')
      .filter((line: string) => line.trim().startsWith('Contact:'))
      .map((line: string) => line.replace('Contact:', '').trim())
      .filter((content: string) => {
        const lower = content.toLowerCase();
        // Exclude voicemail/IVR phrases
        if (lower.includes('voicemail') || lower.includes('leave a message') ||
            lower.includes('mailbox') || lower.includes('not available') ||
            lower.includes('press 1') || lower.includes('press 2') ||
            lower.includes('beep') || lower.includes('record your')) {
          return false;
        }
        return content.length > 5;
      });

    return contactLines.length >= 1;
  });

  console.log(`Calls with real contact responses: ${realConversations.length}\n`);

  // Analyze each real conversation
  const missedLeadCandidates: any[] = [];

  for (const call of realConversations) {
    const transcript = call.aiTranscript || '';
    const lower = transcript.toLowerCase();

    // Extract Contact's actual words
    const contactResponses = transcript.split('\n')
      .filter((line: string) => line.trim().startsWith('Contact:'))
      .map((line: string) => line.replace('Contact:', '').trim());

    // Look for explicit positive engagement
    let hasPositive = false;
    let hasNegative = false;
    const positives: string[] = [];
    const negatives: string[] = [];

    for (const response of contactResponses) {
      const r = response.toLowerCase();

      // Positive signals from CONTACT
      if (/\byeah\b/.test(r)) { positives.push('Said "yeah"'); hasPositive = true; }
      if (/\byes\b/.test(r)) { positives.push('Said "yes"'); hasPositive = true; }
      if (/\bgo ahead\b/.test(r)) { positives.push('Said "go ahead"'); hasPositive = true; }
      if (/\btell me\b/.test(r)) { positives.push('Said "tell me"'); hasPositive = true; }
      if (/\bsend (me|it|that)\b/.test(r)) { positives.push('Requested info'); hasPositive = true; }
      if (/\bemail (me|it)\b/.test(r)) { positives.push('Requested email'); hasPositive = true; }
      if (/\bcall (me )?back\b/.test(r)) { positives.push('Requested callback'); hasPositive = true; }
      if (/\binterested\b/.test(r) && !/not interested/.test(r)) { positives.push('Expressed interest'); hasPositive = true; }
      if (/\bsounds? (good|great|interesting)\b/.test(r)) { positives.push('Positive reaction'); hasPositive = true; }
      if (/\bwhat (is|does|can)\b/.test(r) && response.length > 20) { positives.push('Asked questions'); hasPositive = true; }
      if (/\bsure\b/.test(r) && response.length > 10) { positives.push('Said "sure"'); hasPositive = true; }

      // Negative signals from CONTACT
      if (/\bnot interested\b/.test(r)) { negatives.push('Not interested'); hasNegative = true; }
      if (/\bno thanks\b/.test(r)) { negatives.push('No thanks'); hasNegative = true; }
      if (/\bdon'?t call\b/.test(r)) { negatives.push('Don\'t call'); hasNegative = true; }
      if (/\bremove me\b/.test(r)) { negatives.push('Remove me'); hasNegative = true; }
      if (/\bstop calling\b/.test(r)) { negatives.push('Stop calling'); hasNegative = true; }
      if (/\bwe'?re (all )?set\b/.test(r)) { negatives.push('We\'re set'); hasNegative = true; }
      if (/\bnot (a )?good time\b/.test(r)) { negatives.push('Not good time'); hasNegative = true; }
    }

    // Unique positives/negatives
    const uniquePositives = [...new Set(positives)];
    const uniqueNegatives = [...new Set(negatives)];

    // If has positive signals and no lead was created
    if (hasPositive && !call.leadId) {
      missedLeadCandidates.push({
        ...call,
        contactResponses,
        positives: uniquePositives,
        negatives: uniqueNegatives,
        score: uniquePositives.length - uniqueNegatives.length
      });
    }
  }

  // Sort by score descending
  missedLeadCandidates.sort((a, b) => b.score - a.score);

  // Print all missed lead candidates with full transcripts
  console.log('='.repeat(140));
  console.log('🚨 MISSED LEAD CANDIDATES - FULL DETAILS');
  console.log('='.repeat(140));
  console.log(`Found ${missedLeadCandidates.length} potential missed leads:\n`);

  for (const call of missedLeadCandidates) {
    console.log('█'.repeat(140));
    console.log(`\n📞 CALL SESSION: ${call.callSessionId}`);
    console.log('█'.repeat(140));
    console.log(`
   👤 CONTACT:      ${call.contactName}
   💼 TITLE:        ${call.contactTitle}
   🏢 COMPANY:      ${call.contactCompany}
   📧 EMAIL:        ${call.contactEmail || 'N/A'}
   📱 PHONE:        ${call.phone}
   🎯 CAMPAIGN:     ${call.campaignName}
   ⏱️  DURATION:     ${call.durationSec} seconds
   📅 DATE:         ${new Date(call.startedAt).toLocaleString()}
   🏷️  AI DISP:      ${call.aiDisposition || 'none'}
   🏷️  DIALER DISP:  ${call.dialerDisposition || 'none'}
   🎫 LEAD ID:      ${call.leadId || '❌ NONE (MISSED!)'}

   ✅ POSITIVE SIGNALS: ${call.positives.length > 0 ? call.positives.join(', ') : 'none'}
   ❌ NEGATIVE SIGNALS: ${call.negatives.length > 0 ? call.negatives.join(', ') : 'none'}
   📊 NET SCORE:        ${call.score}
`);

    // AI Analysis if available
    if (call.aiAnalysis && Object.keys(call.aiAnalysis).length > 0) {
      console.log('   🤖 AI ANALYSIS:');
      console.log(`      Sentiment:     ${call.aiAnalysis.sentiment || 'N/A'}`);
      console.log(`      Engagement:    ${call.aiAnalysis.engagement_level || 'N/A'}`);
      console.log(`      Follow-up:     ${call.aiAnalysis.follow_up_consent || 'N/A'}`);
      console.log(`      Outcome:       ${call.aiAnalysis.outcome || 'N/A'}`);
      if (call.aiAnalysis.summary) {
        console.log(`      Summary:       ${call.aiAnalysis.summary}`);
      }
      console.log();
    }

    console.log('   📝 FULL TRANSCRIPT:');
    console.log('   ' + '─'.repeat(134));
    const lines = (call.aiTranscript || '').split('\n').filter((l: string) => l.trim());
    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed.startsWith('Agent:')) {
        console.log(`      🤖 ${trimmed}`);
      } else if (trimmed.startsWith('Contact:')) {
        console.log(`      👤 ${trimmed}`);
      } else {
        console.log(`         ${trimmed}`);
      }
    }
    console.log('   ' + '─'.repeat(134));
    console.log();
  }

  // Summary CSV
  console.log('\n' + '='.repeat(140));
  console.log('📋 CSV EXPORT - ALL MISSED LEAD CANDIDATES');
  console.log('='.repeat(140));
  console.log();
  console.log('Score,Contact Name,Title,Company,Phone,Email,Duration,Disposition,Positive Signals,Call Session ID');

  for (const call of missedLeadCandidates) {
    console.log([
      call.score,
      `"${call.contactName}"`,
      `"${call.contactTitle}"`,
      `"${call.contactCompany}"`,
      call.phone || '',
      call.contactEmail || '',
      call.durationSec,
      call.aiDisposition || call.dialerDisposition || 'unknown',
      `"${call.positives.join('; ')}"`,
      call.callSessionId
    ].join(','));
  }

  // Final summary
  console.log('\n' + '='.repeat(140));
  console.log('📊 FINAL SUMMARY');
  console.log('='.repeat(140));
  console.log(`
   Total calls analyzed:           ${calls.length}
   Real conversations (non-VM):    ${realConversations.length}
   Missed lead candidates:         ${missedLeadCandidates.length}
   High confidence (score >= 2):   ${missedLeadCandidates.filter(c => c.score >= 2).length}
   Medium confidence (score 1):    ${missedLeadCandidates.filter(c => c.score === 1).length}
  `);

  process.exit(0);
}

detailedCallReview().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
