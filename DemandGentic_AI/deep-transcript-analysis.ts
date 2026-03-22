/**
 * Deep Transcript Analysis for January 19-20, 2026
 *
 * Reviews the actual transcripts of calls to:
 * 1. Find potential misclassified calls
 * 2. Review all "not_interested" calls with transcripts
 * 3. Look for positive signals in transcripts
 */

import 'dotenv/config';
import { db } from './server/db';
import { sql } from 'drizzle-orm';

interface TranscriptCall {
  callSessionId: string;
  contactName: string;
  contactCompany: string;
  campaignName: string;
  phone: string;
  aiDisposition: string;
  dialerDisposition: string;
  aiTranscript: string;
  aiAnalysis: any;
  durationSec: number;
  startedAt: Date;
  leadId: string | null;
}

const POSITIVE_SIGNALS = [
  'yes', 'yeah', 'sure', 'okay', 'sounds good', 'interested',
  'tell me more', 'send me', 'email me', 'follow up', 'follow-up',
  'pricing', 'demo', 'meeting', 'schedule', 'calendar', 'call back',
  'callback', 'how does it work', 'what do you offer', 'more information',
  'speak to someone', 'have someone call', 'give me a call',
  'that sounds interesting', 'i\'d like to learn', 'can you send',
  'looking for something', 'might be interested', 'possibly',
  'let me think', 'need to check', 'get back to you',
];

const NEGATIVE_SIGNALS = [
  'not interested', 'no thanks', 'don\'t call', 'remove me',
  'stop calling', 'take me off', 'no soliciting', 'do not call',
  'wrong number', 'not the right person', 'i don\'t need',
  'already have', 'we use', 'we\'re good', 'we\'re set',
  'not right now', 'too busy', 'bad time',
];

function analyzeTranscript(transcript: string): { positiveCount: number; negativeCount: number; positiveMatches: string[]; negativeMatches: string[]; isLikelyMisclassified: boolean } {
  const lowerTranscript = transcript.toLowerCase();

  const positiveMatches = POSITIVE_SIGNALS.filter(signal => lowerTranscript.includes(signal));
  const negativeMatches = NEGATIVE_SIGNALS.filter(signal => lowerTranscript.includes(signal));

  // Check for consent patterns
  const hasFollowUpConsent = /(?:yes|yeah|sure|okay)[\s,.-]*(?:you can|please|go ahead|send|email)/i.test(transcript);
  const hasExplicitInterest = /(?:i'?m|we'?re|i am|we are)[\s]+(?:interested|looking)/i.test(transcript);

  if (hasFollowUpConsent) positiveMatches.push('explicit_consent_pattern');
  if (hasExplicitInterest) positiveMatches.push('explicit_interest_pattern');

  const positiveCount = positiveMatches.length;
  const negativeCount = negativeMatches.length;

  // Likely misclassified if more positive than negative signals
  const isLikelyMisclassified = positiveCount > negativeCount && positiveCount >= 2;

  return { positiveCount, negativeCount, positiveMatches, negativeMatches, isLikelyMisclassified };
}

async function deepTranscriptAnalysis(): Promise {
  console.log('='.repeat(100));
  console.log('DEEP TRANSCRIPT ANALYSIS: January 19-20, 2026');
  console.log('='.repeat(100));
  console.log();

  const startDate = new Date('2026-01-19T00:00:00.000Z');
  const endDate = new Date('2026-01-21T00:00:00.000Z');

  // Get all calls with transcripts
  const result = await db.execute(sql`
    SELECT
      cs.id as "callSessionId",
      COALESCE(c.full_name, c.first_name || ' ' || c.last_name, 'Unknown') as "contactName",
      COALESCE(c.company_norm, 'Unknown Company') as "contactCompany",
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
      AND cs.started_at  100
    ORDER BY cs.duration_sec DESC
  `);

  const calls: TranscriptCall[] = (result as any).rows || [];
  console.log(`Found ${calls.length} calls with meaningful transcripts\n`);

  const misclassifiedCalls: Array }> = [];
  const longCallsReview: Array }> = [];

  // Analyze each transcript
  for (const call of calls) {
    const analysis = analyzeTranscript(call.aiTranscript);

    if (analysis.isLikelyMisclassified) {
      misclassifiedCalls.push({ ...call, analysis });
    }

    // Also review long calls (>60s) regardless of classification
    if (call.durationSec >= 60) {
      longCallsReview.push({ ...call, analysis });
    }
  }

  // Print potentially misclassified calls
  console.log('='.repeat(100));
  console.log('POTENTIALLY MISCLASSIFIED CALLS (High positive signals marked as not_interested)');
  console.log('='.repeat(100));
  console.log(`Found: ${misclassifiedCalls.length}\n`);

  for (const call of misclassifiedCalls.slice(0, 30)) {
    printDetailedCall(call);
  }

  // Print long calls for review
  console.log('\n' + '='.repeat(100));
  console.log('LONG DURATION CALLS (60+ seconds) - REQUIRES REVIEW');
  console.log('='.repeat(100));
  console.log(`Found: ${longCallsReview.length}\n`);

  // Sort by duration, longest first
  longCallsReview.sort((a, b) => b.durationSec - a.durationSec);

  for (const call of longCallsReview.slice(0, 30)) {
    printDetailedCall(call);
  }

  // Summary of all "not_interested" calls with transcripts
  const notInterestedWithTranscript = calls.filter(c =>
    c.aiDisposition?.toLowerCase().includes('not_interested') ||
    c.dialerDisposition?.toLowerCase().includes('not_interested')
  );

  console.log('\n' + '='.repeat(100));
  console.log('ALL "NOT INTERESTED" CALLS WITH TRANSCRIPTS - FULL REVIEW');
  console.log('='.repeat(100));
  console.log(`Total: ${notInterestedWithTranscript.length}\n`);

  for (const call of notInterestedWithTranscript) {
    const analysis = analyzeTranscript(call.aiTranscript);
    printDetailedCall({ ...call, analysis });
  }

  // Final statistics
  console.log('\n' + '='.repeat(100));
  console.log('ANALYSIS SUMMARY');
  console.log('='.repeat(100));
  console.log(`
Total calls with transcripts:        ${calls.length}
Potentially misclassified:           ${misclassifiedCalls.length}
Long calls (60+ sec):                ${longCallsReview.length}
"Not interested" with transcripts:   ${notInterestedWithTranscript.length}
Calls with leads:                    ${calls.filter(c => c.leadId).length}
  `);

  process.exit(0);
}

function printDetailedCall(call: TranscriptCall & { analysis?: ReturnType }): void {
  const analysis = call.analysis || analyzeTranscript(call.aiTranscript);
  const aiAnalysis = call.aiAnalysis || {};

  console.log('\n' + '-'.repeat(100));
  console.log(`CALL: ${call.callSessionId}`);
  console.log('-'.repeat(100));
  console.log(`  Contact:       ${call.contactName} @ ${call.contactCompany}`);
  console.log(`  Campaign:      ${call.campaignName}`);
  console.log(`  Phone:         ${call.phone}`);
  console.log(`  Duration:      ${call.durationSec}s`);
  console.log(`  Started:       ${new Date(call.startedAt).toLocaleString()}`);
  console.log(`  AI Disp:       ${call.aiDisposition || 'none'}`);
  console.log(`  Dialer Disp:   ${call.dialerDisposition || 'none'}`);
  console.log(`  Lead:          ${call.leadId || 'NONE'}`);

  if (aiAnalysis.sentiment || aiAnalysis.engagement_level) {
    console.log(`  AI Sentiment:  ${aiAnalysis.sentiment || 'N/A'}`);
    console.log(`  AI Engagement: ${aiAnalysis.engagement_level || 'N/A'}`);
    console.log(`  Follow-up:     ${aiAnalysis.follow_up_consent || 'N/A'}`);
  }

  if (aiAnalysis.summary) {
    console.log(`  AI Summary:    ${aiAnalysis.summary}`);
  }

  console.log(`\n  SIGNAL ANALYSIS:`);
  console.log(`    Positive (${analysis.positiveCount}): ${analysis.positiveMatches.join(', ') || 'none'}`);
  console.log(`    Negative (${analysis.negativeCount}): ${analysis.negativeMatches.join(', ') || 'none'}`);
  console.log(`    Likely Misclassified: ${analysis.isLikelyMisclassified ? 'YES' : 'no'}`);

  // Print full transcript with line breaks
  console.log(`\n  FULL TRANSCRIPT:`);
  const transcriptLines = call.aiTranscript.split('\n').filter(l => l.trim());
  for (const line of transcriptLines) {
    console.log(`    ${line}`);
  }
}

deepTranscriptAnalysis().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});