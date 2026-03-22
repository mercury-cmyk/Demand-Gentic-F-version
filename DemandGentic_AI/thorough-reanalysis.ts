/**
 * Thorough Re-Analysis of ALL Calls from Jan 19-20, 2026
 *
 * This script will:
 * 1. Analyze EVERY call with a transcript
 * 2. Score each call for engagement signals
 * 3. Identify ALL missed opportunities
 * 4. Create leads for clearly qualified contacts
 * 5. Show the FULL transcript for each call
 */

import 'dotenv/config';
import { db } from './server/db';
import { sql } from 'drizzle-orm';

interface CallRecord {
  callSessionId: string;
  callAttemptId: string | null;
  contactId: string;
  contactName: string;
  contactEmail: string | null;
  contactCompany: string;
  contactTitle: string;
  campaignId: string;
  campaignName: string;
  phone: string;
  aiDisposition: string | null;
  dialerDisposition: string | null;
  aiTranscript: string | null;
  aiAnalysis: any;
  durationSec: number;
  startedAt: Date;
  leadId: string | null;
}

interface EngagementAnalysis {
  score: number;
  positiveSignals: string[];
  negativeSignals: string[];
  recommendation: 'CREATE_LEAD' | 'FOLLOW_UP' | 'RETRY' | 'SKIP';
  reason: string;
}

function analyzeEngagement(call: CallRecord): EngagementAnalysis {
  const transcript = (call.aiTranscript || '').toLowerCase();
  const analysis = call.aiAnalysis || {};

  const positiveSignals: string[] = [];
  const negativeSignals: string[] = [];
  let score = 0;

  // ==========================================
  // POSITIVE ENGAGEMENT SIGNALS
  // ==========================================

  // Strong interest indicators (4+ points each)
  if (/send (me|it|that|us|over)/i.test(transcript)) {
    score += 5;
    positiveSignals.push('REQUESTED_MATERIALS');
  }
  if (/email (me|it|that|us)/i.test(transcript)) {
    score += 5;
    positiveSignals.push('REQUESTED_EMAIL');
  }
  if (/call (me |us )?(back|later|tomorrow|next week)/i.test(transcript)) {
    score += 5;
    positiveSignals.push('CALLBACK_REQUESTED');
  }
  if (/schedule|meeting|demo|appointment/i.test(transcript)) {
    score += 5;
    positiveSignals.push('MEETING_INTEREST');
  }
  if (/i('m| am| would be) interested/i.test(transcript)) {
    score += 5;
    positiveSignals.push('EXPLICIT_INTEREST');
  }
  if (/tell me more|more (info|information|details)/i.test(transcript)) {
    score += 4;
    positiveSignals.push('ASKING_FOR_INFO');
  }

  // Medium interest indicators (2-3 points)
  if (/yeah[,.]?\s*(yeah[,.]?\s*)+/i.test(transcript)) {
    score += 3;
    positiveSignals.push('MULTIPLE_AFFIRMATIVES');
  }
  if (/go ahead|continue|proceed/i.test(transcript)) {
    score += 3;
    positiveSignals.push('PERMISSION_TO_CONTINUE');
  }
  if (/sounds? (good|great|interesting)/i.test(transcript)) {
    score += 3;
    positiveSignals.push('POSITIVE_RESPONSE');
  }
  if (/what (do|does|is|are|can) (you|it|this|that)/i.test(transcript)) {
    score += 2;
    positiveSignals.push('ASKING_QUESTIONS');
  }
  if (/how (do|does|can|would)/i.test(transcript)) {
    score += 2;
    positiveSignals.push('ASKING_HOW');
  }
  if (/yes[,.]?\s*(please|sure|okay)/i.test(transcript)) {
    score += 2;
    positiveSignals.push('AFFIRMATIVE_RESPONSE');
  }
  if (/can you (send|tell|explain|share)/i.test(transcript)) {
    score += 3;
    positiveSignals.push('REQUESTING_ACTION');
  }

  // Light interest indicators (1 point)
  if (/okay|alright|sure/i.test(transcript) && transcript.length > 100) {
    score += 1;
    positiveSignals.push('AGREEABLE');
  }
  if (/who('s| is) (this|calling)/i.test(transcript)) {
    score += 1;
    positiveSignals.push('ENGAGING_WITH_CALLER');
  }

  // Duration bonus
  if (call.durationSec >= 60) {
    score += 2;
    positiveSignals.push('LONG_CONVERSATION_60s+');
  } else if (call.durationSec >= 30) {
    score += 1;
    positiveSignals.push('MODERATE_CONVERSATION_30s+');
  }

  // AI analysis signals
  if (analysis.sentiment === 'positive') {
    score += 2;
    positiveSignals.push('AI_POSITIVE_SENTIMENT');
  }
  if (analysis.engagement_level === 'high') {
    score += 3;
    positiveSignals.push('AI_HIGH_ENGAGEMENT');
  }
  if (analysis.follow_up_consent === 'yes') {
    score += 5;
    positiveSignals.push('AI_FOLLOW_UP_CONSENT');
  }

  // ==========================================
  // NEGATIVE SIGNALS
  // ==========================================

  if (/not interested/i.test(transcript)) {
    score -= 10;
    negativeSignals.push('EXPLICIT_NOT_INTERESTED');
  }
  if (/no thanks|no thank you/i.test(transcript)) {
    score -= 5;
    negativeSignals.push('DECLINED');
  }
  if (/don'?t call|stop calling/i.test(transcript)) {
    score -= 10;
    negativeSignals.push('DO_NOT_CALL');
  }
  if (/remove (me|us)|take (me|us) off/i.test(transcript)) {
    score -= 10;
    negativeSignals.push('REMOVAL_REQUEST');
  }
  if (/wrong (number|person)/i.test(transcript)) {
    score -= 8;
    negativeSignals.push('WRONG_CONTACT');
  }
  if (/too busy|bad time/i.test(transcript)) {
    score -= 2;
    negativeSignals.push('TIMING_ISSUE');
  }
  if (/we('re| are) (good|set|fine)/i.test(transcript)) {
    score -= 3;
    negativeSignals.push('NOT_NEEDED');
  }
  if (/already have|we use/i.test(transcript)) {
    score -= 2;
    negativeSignals.push('ALREADY_HAS_SOLUTION');
  }

  // ==========================================
  // DETERMINE RECOMMENDATION
  // ==========================================

  let recommendation: 'CREATE_LEAD' | 'FOLLOW_UP' | 'RETRY' | 'SKIP';
  let reason: string;

  if (negativeSignals.includes('DO_NOT_CALL') || negativeSignals.includes('REMOVAL_REQUEST')) {
    recommendation = 'SKIP';
    reason = 'Explicit DNC request';
  } else if (negativeSignals.includes('EXPLICIT_NOT_INTERESTED') && positiveSignals.length = 8) {
    recommendation = 'CREATE_LEAD';
    reason = `High engagement score (${score}) with strong signals: ${positiveSignals.join(', ')}`;
  } else if (score >= 4) {
    recommendation = 'FOLLOW_UP';
    reason = `Medium engagement score (${score}) with signals: ${positiveSignals.join(', ')}`;
  } else if (score >= 1 || call.durationSec >= 30) {
    recommendation = 'RETRY';
    reason = `Some engagement (score ${score}, duration ${call.durationSec}s)`;
  } else {
    recommendation = 'SKIP';
    reason = `Low engagement (score ${score})`;
  }

  return { score, positiveSignals, negativeSignals, recommendation, reason };
}

async function thoroughReanalysis(): Promise {
  console.log('='.repeat(140));
  console.log('THOROUGH RE-ANALYSIS OF ALL CALLS - JANUARY 19-20, 2026');
  console.log('='.repeat(140));
  console.log();

  const startDate = new Date('2026-01-19T00:00:00.000Z');
  const endDate = new Date('2026-01-21T00:00:00.000Z');

  // Get ALL calls with transcripts
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
      AND cs.started_at  c.aiTranscript && c.aiTranscript.length > 30);
  console.log(`Calls with transcripts: ${callsWithTranscripts.length}\n`);

  // Analyze each call
  const createLeadCalls: Array = [];
  const followUpCalls: Array = [];
  const retryCalls: Array = [];
  const skipCalls: Array = [];

  for (const call of callsWithTranscripts) {
    const analysis = analyzeEngagement(call);

    switch (analysis.recommendation) {
      case 'CREATE_LEAD':
        createLeadCalls.push({ ...call, analysis });
        break;
      case 'FOLLOW_UP':
        followUpCalls.push({ ...call, analysis });
        break;
      case 'RETRY':
        retryCalls.push({ ...call, analysis });
        break;
      case 'SKIP':
        skipCalls.push({ ...call, analysis });
        break;
    }
  }

  // Sort by score
  createLeadCalls.sort((a, b) => b.analysis.score - a.analysis.score);
  followUpCalls.sort((a, b) => b.analysis.score - a.analysis.score);

  // ==========================================
  // PRINT RESULTS
  // ==========================================

  console.log('='.repeat(140));
  console.log(`🎯 CREATE LEAD - ${createLeadCalls.length} contacts (High engagement, should have been qualified)`);
  console.log('='.repeat(140));

  for (const call of createLeadCalls) {
    printCallDetails(call, call.analysis);
  }

  console.log('\n' + '='.repeat(140));
  console.log(`📧 FOLLOW UP - ${followUpCalls.length} contacts (Medium engagement, worth an email)`);
  console.log('='.repeat(140));

  for (const call of followUpCalls) {
    printCallDetails(call, call.analysis);
  }

  console.log('\n' + '='.repeat(140));
  console.log(`🔄 RETRY - ${retryCalls.length} contacts (Some engagement, should retry call)`);
  console.log('='.repeat(140));

  for (const call of retryCalls.slice(0, 10)) {
    console.log(`  ${call.contactName} | ${call.contactCompany} | ${call.durationSec}s | Score: ${call.analysis.score} | ${call.analysis.positiveSignals.join(', ') || 'none'}`);
  }
  if (retryCalls.length > 10) {
    console.log(`  ... and ${retryCalls.length - 10} more`);
  }

  console.log('\n' + '='.repeat(140));
  console.log(`⏭️ SKIP - ${skipCalls.length} contacts (Low engagement or explicit rejection)`);
  console.log('='.repeat(140));
  console.log(`  (Not shown - these are correctly classified as not interested or have no engagement signals)`);

  // ==========================================
  // SUMMARY
  // ==========================================

  console.log('\n' + '='.repeat(140));
  console.log('SUMMARY');
  console.log('='.repeat(140));
  console.log(`
Total Calls:                    ${allCalls.length}
Calls with Transcripts:         ${callsWithTranscripts.length}
Current Leads in DB:            ${allCalls.filter(c => c.leadId).length}

RECOMMENDATION BREAKDOWN:
  🎯 CREATE LEAD:               ${createLeadCalls.length} (missed opportunities!)
  📧 FOLLOW UP:                 ${followUpCalls.length} (should email)
  🔄 RETRY:                     ${retryCalls.length} (should call again)
  ⏭️ SKIP:                      ${skipCalls.length} (correctly classified)

MISSED LEADS VALUE:
  ${createLeadCalls.length} contacts showed clear engagement but no lead was created.
  These contacts gave permission to continue, asked questions, or requested materials.
  `);

  // ==========================================
  // CSV EXPORT
  // ==========================================

  console.log('\n' + '='.repeat(140));
  console.log('CSV EXPORT - ALL ACTIONABLE CONTACTS');
  console.log('='.repeat(140));
  console.log();
  console.log('Action,Score,Contact Name,Title,Company,Phone,Email,Duration,Signals,Current Disposition,Call ID');

  for (const call of createLeadCalls) {
    console.log([
      'CREATE_LEAD',
      call.analysis.score,
      `"${call.contactName}"`,
      `"${call.contactTitle}"`,
      `"${call.contactCompany}"`,
      call.phone || '',
      call.contactEmail || '',
      call.durationSec,
      `"${call.analysis.positiveSignals.join('; ')}"`,
      `"${call.aiDisposition || call.dialerDisposition}"`,
      call.callSessionId
    ].join(','));
  }

  for (const call of followUpCalls) {
    console.log([
      'FOLLOW_UP',
      call.analysis.score,
      `"${call.contactName}"`,
      `"${call.contactTitle}"`,
      `"${call.contactCompany}"`,
      call.phone || '',
      call.contactEmail || '',
      call.durationSec,
      `"${call.analysis.positiveSignals.join('; ')}"`,
      `"${call.aiDisposition || call.dialerDisposition}"`,
      call.callSessionId
    ].join(','));
  }

  process.exit(0);
}

function printCallDetails(call: CallRecord, analysis: EngagementAnalysis): void {
  console.log('\n' + '-'.repeat(140));
  console.log(`📞 CALL: ${call.callSessionId}`);
  console.log('-'.repeat(140));
  console.log(`  Name:        ${call.contactName}`);
  console.log(`  Title:       ${call.contactTitle}`);
  console.log(`  Company:     ${call.contactCompany}`);
  console.log(`  Email:       ${call.contactEmail || 'N/A'}`);
  console.log(`  Phone:       ${call.phone}`);
  console.log(`  Campaign:    ${call.campaignName}`);
  console.log(`  Duration:    ${call.durationSec}s`);
  console.log(`  Disposition: ${call.aiDisposition || call.dialerDisposition || 'none'}`);
  console.log(`  Lead in DB:  ${call.leadId || 'NONE'}`);
  console.log();
  console.log(`  ENGAGEMENT ANALYSIS:`);
  console.log(`    Score:     ${analysis.score}`);
  console.log(`    Action:    ${analysis.recommendation}`);
  console.log(`    Positive:  ${analysis.positiveSignals.join(', ') || 'none'}`);
  console.log(`    Negative:  ${analysis.negativeSignals.join(', ') || 'none'}`);
  console.log(`    Reason:    ${analysis.reason}`);

  if (call.aiTranscript) {
    console.log();
    console.log(`  FULL TRANSCRIPT:`);
    console.log('  ' + '-'.repeat(136));
    const lines = call.aiTranscript.split('\n').filter(l => l.trim());
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
    console.log('  ' + '-'.repeat(136));
  }
}

thoroughReanalysis().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});