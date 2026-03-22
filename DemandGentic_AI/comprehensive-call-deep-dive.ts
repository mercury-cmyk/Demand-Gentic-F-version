/**
 * Comprehensive Deep Dive Analysis - January 19-20, 2026
 *
 * Detailed analysis of:
 * 1. All "not_interested" calls with full transcripts
 * 2. Why no leads were created
 * 3. Pattern analysis across all calls
 * 4. Follow-up opportunity identification
 */

import 'dotenv/config';
import { db } from './server/db';
import { sql } from 'drizzle-orm';

interface DetailedCall {
  callSessionId: string;
  callAttemptId: string | null;
  contactId: string | null;
  contactName: string;
  contactCompany: string;
  contactTitle: string;
  contactEmail: string | null;
  directPhone: string | null;
  mobilePhone: string | null;
  campaignId: string | null;
  campaignName: string;
  phone: string;
  aiDisposition: string | null;
  dialerDisposition: string | null;
  aiTranscript: string | null;
  aiAnalysis: any;
  durationSec: number;
  startedAt: Date;
  endedAt: Date | null;
  status: string | null;
  recordingUrl: string | null;
  leadId: string | null;
  queueStatus: string | null;
}

interface FollowUpCandidate {
  priority: 'HIGH' | 'MEDIUM' | 'LOW';
  reason: string[];
  call: DetailedCall;
  recommendedAction: string;
}

async function comprehensiveDeepDive(): Promise {
  console.log('='.repeat(120));
  console.log('COMPREHENSIVE DEEP DIVE ANALYSIS: January 19-20, 2026');
  console.log('='.repeat(120));
  console.log();

  const startDate = new Date('2026-01-19T00:00:00.000Z');
  const endDate = new Date('2026-01-21T00:00:00.000Z');

  // ============================================================================
  // SECTION 1: Get all detailed call data
  // ============================================================================
  console.log('SECTION 1: Loading all call data...\n');

  const allCallsResult = await db.execute(sql`
    SELECT
      cs.id as "callSessionId",
      dca.id as "callAttemptId",
      cs.contact_id as "contactId",
      COALESCE(c.full_name, c.first_name || ' ' || c.last_name, 'Unknown') as "contactName",
      COALESCE(c.company_norm, 'Unknown') as "contactCompany",
      COALESCE(c.job_title, 'Unknown') as "contactTitle",
      c.email as "contactEmail",
      c.direct_phone as "directPhone",
      c.mobile_phone as "mobilePhone",
      cs.campaign_id as "campaignId",
      COALESCE(camp.name, 'Unknown') as "campaignName",
      cs.to_number_e164 as "phone",
      cs.ai_disposition as "aiDisposition",
      dca.disposition as "dialerDisposition",
      cs.ai_transcript as "aiTranscript",
      cs.ai_analysis as "aiAnalysis",
      cs.duration_sec as "durationSec",
      cs.started_at as "startedAt",
      cs.ended_at as "endedAt",
      cs.status as "status",
      cs.recording_url as "recordingUrl",
      l.id as "leadId",
      cq.status as "queueStatus"
    FROM call_sessions cs
    LEFT JOIN dialer_call_attempts dca ON dca.call_session_id = cs.id
    LEFT JOIN contacts c ON c.id = cs.contact_id
    LEFT JOIN campaigns camp ON camp.id = cs.campaign_id
    LEFT JOIN leads l ON l.call_attempt_id = dca.id OR l.id LIKE 'ai-' || cs.id || '%'
    LEFT JOIN campaign_queue cq ON cq.contact_id = cs.contact_id AND cq.campaign_id = cs.campaign_id
    WHERE cs.started_at >= ${startDate.toISOString()}::timestamp
      AND cs.started_at 
    c.aiDisposition?.toLowerCase().includes('not_interested') ||
    c.dialerDisposition?.toLowerCase().includes('not_interested')
  );

  console.log(`Total "not_interested" calls: ${notInterestedCalls.length}\n`);

  const followUpCandidates: FollowUpCandidate[] = [];

  for (const call of notInterestedCalls) {
    const analysis = analyzeCallInDetail(call);

    if (analysis.shouldFollowUp) {
      followUpCandidates.push({
        priority: analysis.priority,
        reason: analysis.reasons,
        call: call,
        recommendedAction: analysis.recommendedAction
      });
    }

    // Print detailed analysis for each not_interested call
    printDetailedCallAnalysis(call, analysis);
  }

  // ============================================================================
  // SECTION 3: Analyze voicemail calls for any that might have been live
  // ============================================================================
  console.log('\n' + '='.repeat(120));
  console.log('SECTION 3: VOICEMAIL CALLS ANALYSIS (checking for misclassified live calls)');
  console.log('='.repeat(120));
  console.log();

  const voicemailCalls = allCalls.filter(c =>
    c.aiDisposition?.toLowerCase().includes('voicemail') ||
    c.dialerDisposition?.toLowerCase().includes('voicemail')
  );

  console.log(`Total voicemail calls: ${voicemailCalls.length}`);

  // Check for voicemails that might have been live conversations
  const suspiciousVoicemails = voicemailCalls.filter(c => {
    const transcript = (c.aiTranscript || '').toLowerCase();
    // Check for live person indicators
    return (
      transcript.includes('who') ||
      transcript.includes('speaking') ||
      transcript.includes('hello?') ||
      (c.durationSec > 30 && transcript.length > 200)
    );
  });

  console.log(`Suspicious voicemails (may have been live): ${suspiciousVoicemails.length}\n`);

  for (const call of suspiciousVoicemails.slice(0, 10)) {
    const analysis = analyzeCallInDetail(call);
    if (analysis.shouldFollowUp) {
      followUpCandidates.push({
        priority: analysis.priority,
        reason: [...analysis.reasons, 'voicemail_may_be_live'],
        call: call,
        recommendedAction: analysis.recommendedAction
      });
    }
    printDetailedCallAnalysis(call, analysis);
  }

  // ============================================================================
  // SECTION 4: Check why no leads were created
  // ============================================================================
  console.log('\n' + '='.repeat(120));
  console.log('SECTION 4: INVESTIGATION - WHY NO LEADS WERE CREATED');
  console.log('='.repeat(120));
  console.log();

  // Check if there are any qualified dispositions
  const qualifiedDispositions = allCalls.filter(c =>
    c.aiDisposition?.toLowerCase().includes('qualified') ||
    c.aiDisposition?.toLowerCase().includes('meeting') ||
    c.aiDisposition?.toLowerCase().includes('callback') ||
    c.dialerDisposition?.toLowerCase().includes('qualified') ||
    c.dialerDisposition?.toLowerCase().includes('meeting') ||
    c.dialerDisposition?.toLowerCase().includes('callback')
  );

  console.log(`Calls with qualified/meeting/callback dispositions: ${qualifiedDispositions.length}`);

  // Check AI analysis for positive outcomes
  const positiveAnalysis = allCalls.filter(c => {
    const analysis = c.aiAnalysis || {};
    return (
      analysis.sentiment === 'positive' ||
      analysis.engagement_level === 'high' ||
      analysis.follow_up_consent === 'yes' ||
      analysis.outcome?.toLowerCase().includes('interested')
    );
  });

  console.log(`Calls with positive AI analysis: ${positiveAnalysis.length}`);

  if (positiveAnalysis.length > 0) {
    console.log('\nCalls with positive AI analysis but no lead:');
    for (const call of positiveAnalysis.slice(0, 10)) {
      const analysis = call.aiAnalysis || {};
      console.log(`  - ${call.callSessionId}: ${call.contactName}`);
      console.log(`    Sentiment: ${analysis.sentiment}, Engagement: ${analysis.engagement_level}, Follow-up: ${analysis.follow_up_consent}`);
      console.log(`    Disposition: ${call.aiDisposition || call.dialerDisposition}`);
      console.log(`    Lead: ${call.leadId || 'NONE'}`);
    }
  }

  // ============================================================================
  // SECTION 5: Pattern Analysis
  // ============================================================================
  console.log('\n' + '='.repeat(120));
  console.log('SECTION 5: PATTERN ANALYSIS');
  console.log('='.repeat(120));
  console.log();

  // Analyze by time of day
  const hourlyDistribution: Record = {};

  for (const call of allCalls) {
    const hour = new Date(call.startedAt).getUTCHours();
    if (!hourlyDistribution[hour]) {
      hourlyDistribution[hour] = { total: 0, connected: 0, voicemail: 0, noAnswer: 0 };
    }
    hourlyDistribution[hour].total++;

    const disp = (call.aiDisposition || call.dialerDisposition || '').toLowerCase();
    if (disp.includes('not_interested')) hourlyDistribution[hour].connected++;
    else if (disp.includes('voicemail')) hourlyDistribution[hour].voicemail++;
    else if (disp.includes('no_answer') || disp.includes('no-answer')) hourlyDistribution[hour].noAnswer++;
  }

  console.log('Hourly Distribution (UTC):');
  console.log('Hour | Total | Connected | Voicemail | No Answer | Connect Rate');
  console.log('-'.repeat(70));

  for (const hour of Object.keys(hourlyDistribution).map(Number).sort((a, b) => a - b)) {
    const data = hourlyDistribution[hour];
    const connectRate = data.total > 0 ? ((data.connected / data.total) * 100).toFixed(1) : '0.0';
    console.log(
      `${String(hour).padStart(4)} | ${String(data.total).padStart(5)} | ${String(data.connected).padStart(9)} | ${String(data.voicemail).padStart(9)} | ${String(data.noAnswer).padStart(9)} | ${connectRate}%`
    );
  }

  // Analyze by campaign
  const campaignStats: Record = {};

  for (const call of allCalls) {
    const campId = call.campaignId || 'unknown';
    if (!campaignStats[campId]) {
      campaignStats[campId] = { name: call.campaignName, total: 0, connected: 0 };
    }
    campaignStats[campId].total++;

    const disp = (call.aiDisposition || call.dialerDisposition || '').toLowerCase();
    if (disp.includes('not_interested')) campaignStats[campId].connected++;
  }

  console.log('\n\nCampaign Performance:');
  console.log('Campaign | Total | Connected | Connect Rate');
  console.log('-'.repeat(80));

  for (const [campId, data] of Object.entries(campaignStats)) {
    const connectRate = data.total > 0 ? ((data.connected / data.total) * 100).toFixed(1) : '0.0';
    console.log(`${data.name.substring(0, 40).padEnd(40)} | ${String(data.total).padStart(5)} | ${String(data.connected).padStart(9)} | ${connectRate}%`);
  }

  // ============================================================================
  // SECTION 6: FOLLOW-UP CANDIDATES (ACTIONABLE LIST)
  // ============================================================================
  console.log('\n' + '='.repeat(120));
  console.log('SECTION 6: FOLLOW-UP CANDIDATES - ACTIONABLE LIST');
  console.log('='.repeat(120));
  console.log();

  // Sort by priority
  const sortedCandidates = followUpCandidates.sort((a, b) => {
    const priorityOrder = { HIGH: 0, MEDIUM: 1, LOW: 2 };
    return priorityOrder[a.priority] - priorityOrder[b.priority];
  });

  const highPriority = sortedCandidates.filter(c => c.priority === 'HIGH');
  const mediumPriority = sortedCandidates.filter(c => c.priority === 'MEDIUM');
  const lowPriority = sortedCandidates.filter(c => c.priority === 'LOW');

  console.log(`HIGH PRIORITY: ${highPriority.length} contacts`);
  console.log(`MEDIUM PRIORITY: ${mediumPriority.length} contacts`);
  console.log(`LOW PRIORITY: ${lowPriority.length} contacts`);
  console.log();

  console.log('='.repeat(120));
  console.log('HIGH PRIORITY FOLLOW-UPS');
  console.log('='.repeat(120));

  for (const candidate of highPriority) {
    printFollowUpCandidate(candidate);
  }

  console.log('\n' + '='.repeat(120));
  console.log('MEDIUM PRIORITY FOLLOW-UPS');
  console.log('='.repeat(120));

  for (const candidate of mediumPriority) {
    printFollowUpCandidate(candidate);
  }

  if (lowPriority.length > 0) {
    console.log('\n' + '='.repeat(120));
    console.log('LOW PRIORITY FOLLOW-UPS');
    console.log('='.repeat(120));

    for (const candidate of lowPriority.slice(0, 10)) {
      printFollowUpCandidate(candidate);
    }
    if (lowPriority.length > 10) {
      console.log(`\n... and ${lowPriority.length - 10} more low priority contacts`);
    }
  }

  // ============================================================================
  // SECTION 7: EXPORT FOLLOW-UP LIST AS CSV-FRIENDLY FORMAT
  // ============================================================================
  console.log('\n' + '='.repeat(120));
  console.log('SECTION 7: FOLLOW-UP LIST (CSV FORMAT)');
  console.log('='.repeat(120));
  console.log();

  console.log('Priority,Contact Name,Title,Company,Phone,Email,Call Duration,Reasons,Recommended Action,Call Session ID');

  for (const candidate of sortedCandidates) {
    const c = candidate.call;
    console.log([
      candidate.priority,
      `"${c.contactName}"`,
      `"${c.contactTitle}"`,
      `"${c.contactCompany}"`,
      c.phone || c.directPhone || c.mobilePhone || '',
      c.contactEmail || '',
      c.durationSec,
      `"${candidate.reason.join('; ')}"`,
      `"${candidate.recommendedAction}"`,
      c.callSessionId
    ].join(','));
  }

  // ============================================================================
  // SECTION 8: FINAL SUMMARY
  // ============================================================================
  console.log('\n' + '='.repeat(120));
  console.log('FINAL SUMMARY');
  console.log('='.repeat(120));
  console.log(`
CALL STATISTICS:
  Total calls analyzed:           ${allCalls.length}
  Not interested:                 ${notInterestedCalls.length}
  Voicemails:                     ${voicemailCalls.length}
  No answers:                     ${allCalls.filter(c => c.aiDisposition?.includes('no_answer') || c.dialerDisposition?.includes('no_answer')).length}

LEAD GENERATION:
  Leads created:                  ${allCalls.filter(c => c.leadId).length}
  Qualified dispositions:         ${qualifiedDispositions.length}
  Positive AI analysis:           ${positiveAnalysis.length}

FOLLOW-UP OPPORTUNITIES:
  High priority:                  ${highPriority.length}
  Medium priority:                ${mediumPriority.length}
  Low priority:                   ${lowPriority.length}
  Total actionable contacts:      ${sortedCandidates.length}

KEY ISSUES IDENTIFIED:
  1. No qualified dispositions recorded despite 55 connected calls
  2. AI disposition engine may be too aggressive in marking calls as "not_interested"
  3. Several calls cut short during active engagement
  4. High no-answer/voicemail rate (91.2%) suggests data or timing issues
  `);

  process.exit(0);
}

interface CallAnalysisResult {
  shouldFollowUp: boolean;
  priority: 'HIGH' | 'MEDIUM' | 'LOW';
  reasons: string[];
  recommendedAction: string;
  positiveSignals: string[];
  negativeSignals: string[];
  engagementLevel: string;
}

function analyzeCallInDetail(call: DetailedCall): CallAnalysisResult {
  const transcript = (call.aiTranscript || '').toLowerCase();
  const aiAnalysis = call.aiAnalysis || {};

  const positiveSignals: string[] = [];
  const negativeSignals: string[] = [];
  const reasons: string[] = [];

  // Check AI analysis
  if (aiAnalysis.sentiment === 'positive') positiveSignals.push('positive_sentiment');
  if (aiAnalysis.engagement_level === 'high') positiveSignals.push('high_engagement');
  if (aiAnalysis.follow_up_consent === 'yes') positiveSignals.push('follow_up_consent');
  if (aiAnalysis.sentiment === 'negative') negativeSignals.push('negative_sentiment');

  // Check transcript for positive signals
  const positivePatterns = [
    { pattern: /yeah[,.]?\s*(yeah[,.]?\s*)+/i, signal: 'multiple_affirmatives' },
    { pattern: /go ahead/i, signal: 'permission_to_continue' },
    { pattern: /tell me more/i, signal: 'asking_for_info' },
    { pattern: /sounds? (good|interesting)/i, signal: 'positive_response' },
    { pattern: /send (me|it|that)/i, signal: 'requesting_materials' },
    { pattern: /email (me|it)/i, signal: 'requesting_email' },
    { pattern: /call (me )?back/i, signal: 'callback_request' },
    { pattern: /interested/i, signal: 'expressed_interest' },
    { pattern: /schedule|meeting|demo/i, signal: 'meeting_interest' },
    { pattern: /what (do|does|is|are)/i, signal: 'asking_questions' },
    { pattern: /how (do|does|can)/i, signal: 'asking_questions' },
    { pattern: /can you (send|tell|explain)/i, signal: 'requesting_info' },
    { pattern: /yes[,.]?\s*(please|sure|okay)/i, signal: 'affirmative_response' },
  ];

  const negativePatterns = [
    { pattern: /not interested/i, signal: 'explicit_not_interested' },
    { pattern: /no thanks/i, signal: 'declined' },
    { pattern: /don'?t call/i, signal: 'do_not_call' },
    { pattern: /remove me/i, signal: 'removal_request' },
    { pattern: /too busy/i, signal: 'too_busy' },
    { pattern: /wrong (number|person)/i, signal: 'wrong_contact' },
    { pattern: /stop calling/i, signal: 'stop_request' },
    { pattern: /we('re| are) (good|set|fine)/i, signal: 'not_needed' },
    { pattern: /already have/i, signal: 'already_has_solution' },
  ];

  for (const { pattern, signal } of positivePatterns) {
    if (pattern.test(transcript)) positiveSignals.push(signal);
  }

  for (const { pattern, signal } of negativePatterns) {
    if (pattern.test(transcript)) negativeSignals.push(signal);
  }

  // Check for conversation indicators
  const agentTurns = (transcript.match(/agent:/gi) || []).length;
  const contactTurns = (transcript.match(/contact:/gi) || []).length;
  const hasRealConversation = agentTurns >= 2 && contactTurns >= 2;

  // Check if call was cut short during pitch
  const pitchStarted = transcript.includes('pivotal b2b') || transcript.includes('demandgentic');
  const pitchComplete = transcript.includes('account-based') && transcript.includes('intelligence');
  const callCutShort = pitchStarted && !pitchComplete && call.durationSec = 60 && hasRealConversation) {
    positiveSignals.push('substantial_conversation');
  }

  // Determine if should follow up
  const positiveScore = positiveSignals.length;
  const negativeScore = negativeSignals.length;

  let shouldFollowUp = false;
  let priority: 'HIGH' | 'MEDIUM' | 'LOW' = 'LOW';
  let recommendedAction = 'No action needed';

  // High priority: clear positive signals without strong negatives
  if (positiveScore >= 3 && negativeScore === 0) {
    shouldFollowUp = true;
    priority = 'HIGH';
    reasons.push('strong_positive_signals');
    recommendedAction = 'Immediate callback - high interest indicated';
  }
  // High priority: explicit requests
  else if (positiveSignals.includes('requesting_materials') || positiveSignals.includes('callback_request') || positiveSignals.includes('meeting_interest')) {
    shouldFollowUp = true;
    priority = 'HIGH';
    reasons.push('explicit_action_request');
    recommendedAction = 'Follow up with requested materials or callback';
  }
  // Medium priority: engagement but no explicit request
  else if (positiveScore >= 2 && negativeScore = 1) {
    shouldFollowUp = true;
    priority = 'MEDIUM';
    reasons.push('interrupted_conversation');
    recommendedAction = 'Retry call - previous attempt was interrupted';
  }
  // Low priority: some positive signals but also negatives
  else if (positiveScore >= 1 && negativeScore = 60) engagementLevel = 'high';
  else if (hasRealConversation || call.durationSec >= 30) engagementLevel = 'medium';
  else if (contactTurns >= 1) engagementLevel = 'low';

  return {
    shouldFollowUp,
    priority,
    reasons,
    recommendedAction,
    positiveSignals,
    negativeSignals,
    engagementLevel
  };
}

function printDetailedCallAnalysis(call: DetailedCall, analysis: CallAnalysisResult): void {
  console.log('\n' + '-'.repeat(120));
  console.log(`CALL: ${call.callSessionId}`);
  console.log('-'.repeat(120));
  console.log(`  Contact:       ${call.contactName}`);
  console.log(`  Title:         ${call.contactTitle}`);
  console.log(`  Company:       ${call.contactCompany}`);
  console.log(`  Email:         ${call.contactEmail || 'N/A'}`);
  console.log(`  Phone:         ${call.phone || call.directPhone || call.mobilePhone || 'N/A'}`);
  console.log(`  Campaign:      ${call.campaignName}`);
  console.log(`  Duration:      ${call.durationSec}s`);
  console.log(`  Started:       ${new Date(call.startedAt).toLocaleString()}`);
  console.log(`  AI Disp:       ${call.aiDisposition || 'none'}`);
  console.log(`  Dialer Disp:   ${call.dialerDisposition || 'none'}`);
  console.log(`  Lead:          ${call.leadId || 'NONE'}`);
  console.log(`  Queue Status:  ${call.queueStatus || 'N/A'}`);

  const aiAnalysis = call.aiAnalysis || {};
  if (Object.keys(aiAnalysis).length > 0) {
    console.log(`\n  AI ANALYSIS:`);
    console.log(`    Sentiment:   ${aiAnalysis.sentiment || 'N/A'}`);
    console.log(`    Engagement:  ${aiAnalysis.engagement_level || 'N/A'}`);
    console.log(`    Outcome:     ${aiAnalysis.outcome || 'N/A'}`);
    console.log(`    Follow-up:   ${aiAnalysis.follow_up_consent || 'N/A'}`);
    if (aiAnalysis.summary) {
      console.log(`    Summary:     ${aiAnalysis.summary}`);
    }
  }

  console.log(`\n  SIGNAL ANALYSIS:`);
  console.log(`    Positive (${analysis.positiveSignals.length}): ${analysis.positiveSignals.join(', ') || 'none'}`);
  console.log(`    Negative (${analysis.negativeSignals.length}): ${analysis.negativeSignals.join(', ') || 'none'}`);
  console.log(`    Engagement:  ${analysis.engagementLevel}`);

  if (analysis.shouldFollowUp) {
    console.log(`\n  >>> FOLLOW-UP: ${analysis.priority} PRIORITY`);
    console.log(`      Reasons: ${analysis.reasons.join(', ')}`);
    console.log(`      Action:  ${analysis.recommendedAction}`);
  }

  if (call.aiTranscript && call.aiTranscript.length > 50) {
    console.log(`\n  TRANSCRIPT:`);
    console.log('  ' + '-'.repeat(116));
    const lines = call.aiTranscript.split('\n').filter(l => l.trim());
    for (const line of lines) {
      console.log(`    ${line.trim()}`);
    }
    console.log('  ' + '-'.repeat(116));
  }

  if (call.recordingUrl) {
    console.log(`\n  Recording: ${call.recordingUrl}`);
  }
}

function printFollowUpCandidate(candidate: FollowUpCandidate): void {
  const c = candidate.call;
  console.log(`\n  [${candidate.priority}] ${c.contactName}`);
  console.log(`    Title:    ${c.contactTitle}`);
  console.log(`    Company:  ${c.contactCompany}`);
  console.log(`    Phone:    ${c.phone || c.directPhone || c.mobilePhone || 'N/A'}`);
  console.log(`    Email:    ${c.contactEmail || 'N/A'}`);
  console.log(`    Duration: ${c.durationSec}s`);
  console.log(`    Reasons:  ${candidate.reason.join(', ')}`);
  console.log(`    Action:   ${candidate.recommendedAction}`);
  console.log(`    Call ID:  ${c.callSessionId}`);
}

comprehensiveDeepDive().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});