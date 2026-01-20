/**
 * Comprehensive Call Analysis for January 19-20, 2026
 *
 * Analyzes ALL calls from these dates:
 * - Every disposition type (voicemail, no answer, connected, qualified, etc.)
 * - Transcription evaluation
 * - AI analysis review
 * - Disposition accuracy check
 */

import 'dotenv/config';
import { db } from './server/db';
import { sql } from 'drizzle-orm';

interface CallRecord {
  callSessionId: string;
  callAttemptId: string | null;
  campaignId: string | null;
  campaignName: string | null;
  contactId: string | null;
  contactName: string | null;
  contactCompany: string | null;
  toNumber: string | null;
  aiDisposition: string | null;
  dialerDisposition: string | null;
  aiTranscript: string | null;
  aiAnalysis: any;
  durationSec: number | null;
  startedAt: Date | null;
  endedAt: Date | null;
  status: string | null;
  agentType: string | null;
  recordingUrl: string | null;
  leadId: string | null;
  leadQaStatus: string | null;
}

interface DispositionSummary {
  disposition: string;
  count: number;
  avgDuration: number;
  hasTranscript: number;
  hasLead: number;
  examples: CallRecord[];
}

interface AnalysisResult {
  totalCalls: number;
  dateRange: { start: string; end: string };
  dispositionBreakdown: DispositionSummary[];
  potentialMissedLeads: CallRecord[];
  qualifiedCalls: CallRecord[];
  voicemails: CallRecord[];
  noAnswers: CallRecord[];
  connectedNotQualified: CallRecord[];
  errors: CallRecord[];
  transcriptIssues: CallRecord[];
}

async function analyzeJanuary19_20Calls(): Promise<void> {
  console.log('='.repeat(80));
  console.log('COMPREHENSIVE CALL ANALYSIS: January 19-20, 2026');
  console.log('='.repeat(80));
  console.log();

  const startDate = new Date('2026-01-19T00:00:00.000Z');
  const endDate = new Date('2026-01-21T00:00:00.000Z'); // End of Jan 20

  console.log(`Date Range: ${startDate.toISOString()} to ${endDate.toISOString()}\n`);

  // Query ALL call sessions from Jan 19-20
  const callsResult = await db.execute(sql`
    SELECT
      cs.id as "callSessionId",
      dca.id as "callAttemptId",
      cs.campaign_id as "campaignId",
      camp.name as "campaignName",
      cs.contact_id as "contactId",
      COALESCE(c.full_name, c.first_name || ' ' || c.last_name, 'Unknown') as "contactName",
      c.company_norm as "contactCompany",
      cs.to_number_e164 as "toNumber",
      cs.ai_disposition as "aiDisposition",
      dca.disposition as "dialerDisposition",
      cs.ai_transcript as "aiTranscript",
      cs.ai_analysis as "aiAnalysis",
      cs.duration_sec as "durationSec",
      cs.started_at as "startedAt",
      cs.ended_at as "endedAt",
      cs.status as "status",
      cs.agent_type as "agentType",
      cs.recording_url as "recordingUrl",
      l.id as "leadId",
      l.qa_status as "leadQaStatus"
    FROM call_sessions cs
    LEFT JOIN dialer_call_attempts dca ON dca.call_session_id = cs.id
    LEFT JOIN contacts c ON c.id = cs.contact_id
    LEFT JOIN campaigns camp ON camp.id = cs.campaign_id
    LEFT JOIN leads l ON l.call_attempt_id = dca.id OR l.id LIKE 'ai-' || cs.id || '%'
    WHERE cs.started_at >= ${startDate.toISOString()}::timestamp
      AND cs.started_at < ${endDate.toISOString()}::timestamp
    ORDER BY cs.started_at ASC
  `);

  const calls: CallRecord[] = (callsResult as any).rows || [];
  console.log(`Total Calls Found: ${calls.length}\n`);

  if (calls.length === 0) {
    console.log('No calls found in this date range.');

    // Let's also check dialer_call_attempts directly
    const attemptsResult = await db.execute(sql`
      SELECT
        dca.id,
        dca.disposition,
        dca.call_session_id,
        dca.created_at,
        dca.phone_dialed
      FROM dialer_call_attempts dca
      WHERE dca.created_at >= ${startDate.toISOString()}::timestamp
        AND dca.created_at < ${endDate.toISOString()}::timestamp
      ORDER BY dca.created_at ASC
      LIMIT 50
    `);

    console.log('\nDirect dialer_call_attempts check:');
    console.log(`Found ${(attemptsResult as any).rows?.length || 0} attempts`);

    for (const row of (attemptsResult as any).rows || []) {
      console.log(`  - ${row.id}: ${row.disposition || 'no disposition'} at ${row.created_at}`);
    }

    process.exit(0);
  }

  // Analyze by disposition
  const dispositionMap = new Map<string, DispositionSummary>();

  for (const call of calls) {
    const disposition = normalizeDisposition(call.aiDisposition || call.dialerDisposition || 'unknown');

    if (!dispositionMap.has(disposition)) {
      dispositionMap.set(disposition, {
        disposition,
        count: 0,
        avgDuration: 0,
        hasTranscript: 0,
        hasLead: 0,
        examples: [],
      });
    }

    const summary = dispositionMap.get(disposition)!;
    summary.count++;
    if (call.durationSec) {
      summary.avgDuration = ((summary.avgDuration * (summary.count - 1)) + call.durationSec) / summary.count;
    }
    if (call.aiTranscript && call.aiTranscript.length > 50) {
      summary.hasTranscript++;
    }
    if (call.leadId) {
      summary.hasLead++;
    }
    if (summary.examples.length < 5) {
      summary.examples.push(call);
    }
  }

  // Sort dispositions by count
  const dispositionBreakdown = Array.from(dispositionMap.values())
    .sort((a, b) => b.count - a.count);

  // Print disposition breakdown
  console.log('='.repeat(80));
  console.log('DISPOSITION BREAKDOWN');
  console.log('='.repeat(80));
  console.log();

  for (const disp of dispositionBreakdown) {
    const pct = ((disp.count / calls.length) * 100).toFixed(1);
    const transcriptPct = disp.count > 0 ? ((disp.hasTranscript / disp.count) * 100).toFixed(0) : '0';
    const leadPct = disp.count > 0 ? ((disp.hasLead / disp.count) * 100).toFixed(0) : '0';

    console.log(`${disp.disposition.padEnd(30)} | Count: ${String(disp.count).padStart(4)} (${pct.padStart(5)}%) | AvgDur: ${Math.round(disp.avgDuration).toString().padStart(3)}s | Transcript: ${transcriptPct.padStart(3)}% | Lead: ${leadPct.padStart(3)}%`);
  }

  // Categorize calls
  const qualifiedCalls = calls.filter(c =>
    isQualifiedDisposition(c.aiDisposition) || isQualifiedDisposition(c.dialerDisposition)
  );

  const voicemails = calls.filter(c =>
    isVoicemailDisposition(c.aiDisposition) || isVoicemailDisposition(c.dialerDisposition)
  );

  const noAnswers = calls.filter(c =>
    isNoAnswerDisposition(c.aiDisposition) || isNoAnswerDisposition(c.dialerDisposition)
  );

  const connectedCalls = calls.filter(c =>
    (c.durationSec && c.durationSec > 10) &&
    !isQualifiedDisposition(c.aiDisposition) &&
    !isVoicemailDisposition(c.aiDisposition) &&
    !isNoAnswerDisposition(c.aiDisposition)
  );

  // Find potential missed leads (calls with positive signals but not qualified)
  const potentialMissedLeads = calls.filter(c => {
    if (c.leadId) return false; // Already has a lead
    if (isQualifiedDisposition(c.aiDisposition) || isQualifiedDisposition(c.dialerDisposition)) return false;

    // Check for positive signals
    const analysis = c.aiAnalysis || {};
    const transcript = (c.aiTranscript || '').toLowerCase();

    // Positive indicators
    const hasPositiveSentiment = analysis.sentiment === 'positive';
    const hasHighEngagement = analysis.engagement_level === 'high';
    const hasFollowUpConsent = analysis.follow_up_consent === 'yes';
    const hasLongDuration = (c.durationSec || 0) >= 60;

    // Check transcript for interest phrases
    const interestPhrases = [
      'send me', 'email me', 'follow up', 'interested', 'pricing',
      'demo', 'meeting', 'schedule', 'calendar', 'call back',
      'sounds good', 'tell me more', 'yes please', 'sure'
    ];
    const hasInterestInTranscript = interestPhrases.some(phrase => transcript.includes(phrase));

    // Score the call
    let score = 0;
    if (hasPositiveSentiment) score += 2;
    if (hasHighEngagement) score += 2;
    if (hasFollowUpConsent) score += 3;
    if (hasLongDuration) score += 1;
    if (hasInterestInTranscript) score += 2;

    return score >= 3;
  });

  // Print detailed analysis sections
  console.log('\n' + '='.repeat(80));
  console.log('QUALIFIED CALLS DETAIL');
  console.log('='.repeat(80));
  console.log(`Total Qualified: ${qualifiedCalls.length}`);

  for (const call of qualifiedCalls) {
    printCallDetail(call);
  }

  console.log('\n' + '='.repeat(80));
  console.log('POTENTIAL MISSED LEADS (High-scoring calls without lead record)');
  console.log('='.repeat(80));
  console.log(`Total Potential Missed: ${potentialMissedLeads.length}`);

  for (const call of potentialMissedLeads) {
    printCallDetail(call, true);
  }

  console.log('\n' + '='.repeat(80));
  console.log('VOICEMAIL SUMMARY');
  console.log('='.repeat(80));
  console.log(`Total Voicemails: ${voicemails.length}`);

  // Just show first 10 voicemails
  for (const call of voicemails.slice(0, 10)) {
    console.log(`  ${call.callSessionId} | ${call.contactName || 'Unknown'} | ${call.contactCompany || 'Unknown Company'} | ${call.campaignName || 'Unknown Campaign'}`);
  }
  if (voicemails.length > 10) {
    console.log(`  ... and ${voicemails.length - 10} more voicemails`);
  }

  console.log('\n' + '='.repeat(80));
  console.log('NO ANSWER SUMMARY');
  console.log('='.repeat(80));
  console.log(`Total No Answers: ${noAnswers.length}`);

  for (const call of noAnswers.slice(0, 10)) {
    console.log(`  ${call.callSessionId} | ${call.contactName || 'Unknown'} | ${call.contactCompany || 'Unknown Company'} | ${call.campaignName || 'Unknown Campaign'}`);
  }
  if (noAnswers.length > 10) {
    console.log(`  ... and ${noAnswers.length - 10} more no-answers`);
  }

  console.log('\n' + '='.repeat(80));
  console.log('CONNECTED BUT NOT QUALIFIED (reviewing for missed opportunities)');
  console.log('='.repeat(80));
  console.log(`Total Connected (not qualified): ${connectedCalls.length}`);

  // Sort by duration (longest first, as they may be more interesting)
  const sortedConnected = connectedCalls.sort((a, b) => (b.durationSec || 0) - (a.durationSec || 0));

  for (const call of sortedConnected.slice(0, 20)) {
    printCallDetail(call, true);
  }
  if (sortedConnected.length > 20) {
    console.log(`  ... and ${sortedConnected.length - 20} more connected calls`);
  }

  // Final summary
  console.log('\n' + '='.repeat(80));
  console.log('EXECUTIVE SUMMARY');
  console.log('='.repeat(80));
  console.log(`
Date Range:              January 19-20, 2026
Total Calls:             ${calls.length}
Qualified Leads:         ${qualifiedCalls.length} (${((qualifiedCalls.length / calls.length) * 100).toFixed(1)}%)
Potential Missed Leads:  ${potentialMissedLeads.length}
Voicemails:              ${voicemails.length} (${((voicemails.length / calls.length) * 100).toFixed(1)}%)
No Answers:              ${noAnswers.length} (${((noAnswers.length / calls.length) * 100).toFixed(1)}%)
Connected (other):       ${connectedCalls.length} (${((connectedCalls.length / calls.length) * 100).toFixed(1)}%)

Calls with Transcripts:  ${calls.filter(c => c.aiTranscript && c.aiTranscript.length > 50).length}
Calls with Leads:        ${calls.filter(c => c.leadId).length}
  `);

  // Print all unique dispositions found
  console.log('All Dispositions Found:');
  for (const disp of dispositionBreakdown) {
    console.log(`  - ${disp.disposition}: ${disp.count}`);
  }

  process.exit(0);
}

function normalizeDisposition(disposition: string | null): string {
  if (!disposition) return 'unknown';
  const d = disposition.toLowerCase().trim();

  if (d.includes('qualified') || d.includes('meeting') || d.includes('booked')) return 'qualified_lead';
  if (d.includes('voicemail') || d.includes('vm')) return 'voicemail';
  if (d.includes('no_answer') || d.includes('no-answer') || d.includes('noanswer') || d === 'no answer') return 'no_answer';
  if (d.includes('not_interested') || d.includes('not interested')) return 'not_interested';
  if (d.includes('dnc') || d.includes('do not call')) return 'dnc';
  if (d.includes('busy')) return 'busy';
  if (d.includes('hung_up') || d.includes('hung up')) return 'hung_up';
  if (d.includes('gatekeeper')) return 'gatekeeper_block';
  if (d.includes('wrong_number') || d.includes('wrong number')) return 'wrong_number';
  if (d.includes('callback') || d.includes('call back')) return 'callback_requested';
  if (d.includes('completed')) return 'completed';
  if (d.includes('failed') || d.includes('error')) return 'failed';

  return disposition;
}

function isQualifiedDisposition(disposition: string | null): boolean {
  if (!disposition) return false;
  const d = disposition.toLowerCase();
  return d.includes('qualified') || d.includes('meeting') || d.includes('booked') ||
         d.includes('callback') || d.includes('interested') || d.includes('positive_intent');
}

function isVoicemailDisposition(disposition: string | null): boolean {
  if (!disposition) return false;
  const d = disposition.toLowerCase();
  return d.includes('voicemail') || d.includes('vm');
}

function isNoAnswerDisposition(disposition: string | null): boolean {
  if (!disposition) return false;
  const d = disposition.toLowerCase();
  return d.includes('no_answer') || d.includes('no-answer') || d.includes('noanswer') || d === 'no answer';
}

function printCallDetail(call: CallRecord, showTranscriptSummary: boolean = false): void {
  const analysis = call.aiAnalysis || {};
  const startTime = call.startedAt ? new Date(call.startedAt).toLocaleString() : 'Unknown';

  console.log(`\n--- Call: ${call.callSessionId} ---`);
  console.log(`  Contact:     ${call.contactName || 'Unknown'} @ ${call.contactCompany || 'Unknown Company'}`);
  console.log(`  Campaign:    ${call.campaignName || call.campaignId || 'Unknown'}`);
  console.log(`  Phone:       ${call.toNumber || 'Unknown'}`);
  console.log(`  Started:     ${startTime}`);
  console.log(`  Duration:    ${call.durationSec || 0}s`);
  console.log(`  AI Disp:     ${call.aiDisposition || 'none'}`);
  console.log(`  Dialer Disp: ${call.dialerDisposition || 'none'}`);
  console.log(`  Lead ID:     ${call.leadId || 'NONE'}`);
  console.log(`  Lead QA:     ${call.leadQaStatus || 'N/A'}`);

  if (analysis.sentiment || analysis.engagement_level || analysis.follow_up_consent) {
    console.log(`  AI Analysis: sentiment=${analysis.sentiment || 'N/A'}, engagement=${analysis.engagement_level || 'N/A'}, follow_up=${analysis.follow_up_consent || 'N/A'}`);
  }

  if (analysis.summary) {
    console.log(`  Summary:     ${analysis.summary.substring(0, 200)}${analysis.summary.length > 200 ? '...' : ''}`);
  }

  if (showTranscriptSummary && call.aiTranscript) {
    const transcript = call.aiTranscript.substring(0, 500);
    console.log(`  Transcript:  ${transcript}${call.aiTranscript.length > 500 ? '...' : ''}`);
  }

  if (call.recordingUrl) {
    console.log(`  Recording:   ${call.recordingUrl}`);
  }
}

analyzeJanuary19_20Calls().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
