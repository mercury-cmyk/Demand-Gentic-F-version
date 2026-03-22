/**
 * Re-analyze calls with the bug fixes applied
 *
 * This script simulates the fixed disposition logic on historical calls
 * to identify how many leads would have been created with the fixes
 */

import 'dotenv/config';
import { db } from './server/db';
import { sql } from 'drizzle-orm';

interface CallRecord {
  callSessionId: string;
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

// Fixed mapToCanonicalDisposition logic
function fixedMapToCanonicalDisposition(disposition: string): 'qualified_lead' | 'not_interested' | 'do_not_call' | 'voicemail' | 'no_answer' | 'invalid_data' {
  const d = disposition.toLowerCase();

  // Qualified outcomes - create lead
  if (d === "qualified" || d === "handoff" || d === "meeting_booked" || d === "callback_requested" || d === "callback") {
    return "qualified_lead";
  }

  // Voicemail - schedule retry
  if (d === "voicemail" || d === "machine") {
    return "voicemail";
  }

  // No answer scenarios - schedule retry
  if (d === "no-answer" || d === "no_answer" || d === "busy" || d === "failed") {
    return "no_answer";
  }

  // Explicit not interested - remove from campaign
  if (d === "not_interested" || d === "not interested") {
    return "not_interested";
  }

  // Do not call - add to global DNC
  if (d === "dnc" || d === "dnc_request" || d === "do_not_call") {
    return "do_not_call";
  }

  // Invalid data - mark phone as invalid
  if (d === "wrong_number" || d === "invalid" || d === "invalid_data") {
    return "invalid_data";
  }

  // BUG FIX: Ambiguous dispositions -> no_answer for retry
  if (d === "needs_review" || d === "connected" || d === "completed" || d === "pitch" || d === "hung_up") {
    return "no_answer";
  }

  // Default: no_answer for retry
  return "no_answer";
}

// Analyze transcript for positive signals
function analyzeTranscriptForQualification(transcript: string | null, analysis: any): {
  shouldBeQualified: boolean;
  confidence: 'high' | 'medium' | 'low';
  reasons: string[];
} {
  if (!transcript || transcript.length = 6) confidence = 'high';
  else if (score >= 3) confidence = 'medium';

  return {
    shouldBeQualified: score >= 4,
    confidence,
    reasons
  };
}

async function reanalyzeWithFixes(): Promise {
  console.log('='.repeat(120));
  console.log('RE-ANALYSIS WITH BUG FIXES APPLIED');
  console.log('='.repeat(120));
  console.log();

  const startDate = new Date('2026-01-19T00:00:00.000Z');
  const endDate = new Date('2026-01-21T00:00:00.000Z');

  // Get all calls
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
      AND cs.started_at ; newDisposition: string }> = [];
  const shouldRetry: Array = [];

  for (const call of calls) {
    const oldDisposition = call.aiDisposition || call.dialerDisposition || 'unknown';
    const newDisposition = fixedMapToCanonicalDisposition(oldDisposition);

    // Count original not_interested
    if (oldDisposition.toLowerCase().includes('not_interested')) {
      originalNotInterested++;
    }

    // Check if disposition would change
    if (oldDisposition.toLowerCase().includes('not_interested') && newDisposition === 'no_answer') {
      fixedWouldRetry++;
      shouldRetry.push({ ...call, newDisposition, oldDisposition });
    }

    // Analyze transcript for qualification signals
    if (call.aiTranscript && call.aiTranscript.length > 50 && call.durationSec >= 20) {
      const transcriptAnalysis = analyzeTranscriptForQualification(call.aiTranscript, call.aiAnalysis);

      if (transcriptAnalysis.shouldBeQualified && !call.leadId) {
        transcriptBasedQualified++;
        missedLeads.push({ ...call, analysis: transcriptAnalysis, newDisposition });
      }
    }
  }

  // Print results
  console.log('='.repeat(120));
  console.log('DISPOSITION CHANGE ANALYSIS');
  console.log('='.repeat(120));
  console.log(`
Original Statistics:
  Total calls:                ${calls.length}
  Marked as not_interested:   ${originalNotInterested}
  Leads created:              ${calls.filter(c => c.leadId).length}

With Bug Fixes Applied:
  Would be retried instead:   ${fixedWouldRetry} (previously lost, now get another chance)
  Transcript-based qualified: ${transcriptBasedQualified} (detected positive signals)
  `);

  // Print missed leads
  console.log('\n' + '='.repeat(120));
  console.log('MISSED LEADS - HIGH CONFIDENCE (Based on transcript analysis)');
  console.log('='.repeat(120));

  const highConfidence = missedLeads.filter(m => m.analysis.confidence === 'high');
  console.log(`Found ${highConfidence.length} high-confidence missed leads:\n`);

  for (const missed of highConfidence) {
    console.log('-'.repeat(120));
    console.log(`CALL: ${missed.callSessionId}`);
    console.log(`  Contact:     ${missed.contactName} (${missed.contactTitle})`);
    console.log(`  Company:     ${missed.contactCompany}`);
    console.log(`  Email:       ${missed.contactEmail || 'N/A'}`);
    console.log(`  Phone:       ${missed.phone}`);
    console.log(`  Campaign:    ${missed.campaignName}`);
    console.log(`  Duration:    ${missed.durationSec}s`);
    console.log(`  Old Disp:    ${missed.aiDisposition || missed.dialerDisposition}`);
    console.log(`  New Disp:    ${missed.newDisposition}`);
    console.log(`  Confidence:  ${missed.analysis.confidence.toUpperCase()}`);
    console.log(`  Reasons:     ${missed.analysis.reasons.join(', ')}`);

    if (missed.aiTranscript) {
      console.log(`\n  TRANSCRIPT:`);
      const lines = missed.aiTranscript.split('\n').filter(l => l.trim()).slice(0, 15);
      for (const line of lines) {
        console.log(`    ${line.trim()}`);
      }
      if (missed.aiTranscript.split('\n').length > 15) {
        console.log(`    ... (truncated)`);
      }
    }
  }

  // Print medium confidence
  console.log('\n' + '='.repeat(120));
  console.log('MISSED LEADS - MEDIUM CONFIDENCE');
  console.log('='.repeat(120));

  const mediumConfidence = missedLeads.filter(m => m.analysis.confidence === 'medium');
  console.log(`Found ${mediumConfidence.length} medium-confidence missed leads:\n`);

  for (const missed of mediumConfidence.slice(0, 10)) {
    console.log(`  ${missed.callSessionId} | ${missed.contactName} @ ${missed.contactCompany} | ${missed.durationSec}s | Reasons: ${missed.analysis.reasons.join(', ')}`);
  }
  if (mediumConfidence.length > 10) {
    console.log(`  ... and ${mediumConfidence.length - 10} more`);
  }

  // Print calls that would be retried
  console.log('\n' + '='.repeat(120));
  console.log('CALLS THAT WOULD BE RETRIED (Previously marked not_interested)');
  console.log('='.repeat(120));
  console.log(`Found ${shouldRetry.length} calls that would get another chance:\n`);

  for (const call of shouldRetry.slice(0, 20)) {
    console.log(`  ${call.callSessionId} | ${call.contactName} | ${call.durationSec}s | ${call.oldDisposition} -> ${call.newDisposition}`);
  }
  if (shouldRetry.length > 20) {
    console.log(`  ... and ${shouldRetry.length - 20} more`);
  }

  // CSV output for missed leads
  console.log('\n' + '='.repeat(120));
  console.log('CSV FORMAT - MISSED LEADS FOR FOLLOW-UP');
  console.log('='.repeat(120));
  console.log();
  console.log('Confidence,Contact Name,Title,Company,Phone,Email,Duration,Reasons,Call Session ID');

  for (const missed of missedLeads) {
    console.log([
      missed.analysis.confidence.toUpperCase(),
      `"${missed.contactName}"`,
      `"${missed.contactTitle}"`,
      `"${missed.contactCompany}"`,
      missed.phone || '',
      missed.contactEmail || '',
      missed.durationSec,
      `"${missed.analysis.reasons.join('; ')}"`,
      missed.callSessionId
    ].join(','));
  }

  // Final summary
  console.log('\n' + '='.repeat(120));
  console.log('FINAL SUMMARY');
  console.log('='.repeat(120));
  console.log(`
BUG IMPACT ASSESSMENT:

  Calls incorrectly marked as "not_interested":  ${fixedWouldRetry}
  (These would now be scheduled for retry instead of being lost)

  Missed leads with positive signals:            ${transcriptBasedQualified}
    - High confidence:                           ${highConfidence.length}
    - Medium confidence:                         ${mediumConfidence.length}

RECOMMENDATION:
  1. Deploy the bug fixes to prevent future missed leads
  2. Manually review the ${highConfidence.length} high-confidence missed leads
  3. Consider re-calling the ${fixedWouldRetry} contacts that were incorrectly dismissed
  `);

  process.exit(0);
}

reanalyzeWithFixes().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});