import { db } from './server/db';
import { sql } from 'drizzle-orm';
import { leads } from './shared/schema';

/**
 * Cleanup Bad Leads and Recreate with Proper Filtering
 *
 * Problem: Current leads include:
 * - Voicemail-only calls (not conversations)
 * - Short calls with no engagement
 * - False positives from voicemail greeting keywords
 *
 * Solution: Delete all Jan 15 leads and recreate with strict criteria:
 * - Exclude voicemail-only transcripts
 * - Require actual conversation (not just repeated greetings)
 * - Minimum quality thresholds
 * - Real intent signals (not from greetings)
 */

const TRANSCRIPT_MARKER = '[Call Transcript]';

// Enhanced voicemail detection patterns
const VOICEMAIL_PATTERNS = [
  /voicemail service/i,
  /leave a message after the (tone|beep)/i,
  /press.*for more options/i,
  /the person you are calling is not available/i,
  /please leave your message/i,
  /you have reached the voicemail/i,
  /after the tone/i,
  /press.*to page/i,
];

// Detect if transcript is just a voicemail greeting
function isVoicemailOnly(transcript: string): boolean {
  // Check for voicemail greeting patterns
  const hasVoicemailPattern = VOICEMAIL_PATTERNS.some(pattern => pattern.test(transcript));

  // Check for repetitive content (same phrase repeated many times)
  const lines = transcript.split(/[.!?]\s+/).filter(l => l.trim().length > 0);
  if (lines.length > 5) {
    const firstLine = lines[0].trim();
    const repetitions = lines.filter(l => l.trim() === firstLine).length;
    if (repetitions > lines.length * 0.5) {
      // More than 50% identical lines = voicemail or stuck loop
      return true;
    }
  }

  return hasVoicemailPattern;
}

// Extract transcript from notes
function extractTranscript(notes: string | null): string | null {
  if (!notes) return null;
  const markerIndex = notes.indexOf(TRANSCRIPT_MARKER);
  if (markerIndex === -1) return null;
  return notes.substring(markerIndex + TRANSCRIPT_MARKER.length).trim();
}

// Interest signals - EXCLUDING voicemail greeting keywords
const INTEREST_KEYWORDS = {
  highIntent: [
    /\b(yes|yeah|sure|absolutely|definitely|interested)\b.*\b(send|email|information|details)\b/i,
    /\bsend\s+(me|us|over|that)\b/i,
    /\b(schedule|book|set up|arrange)\b.*\b(meeting|call|demo|presentation)\b/i,
    /\b(next|follow)\s+step\b/i,
    /\b(sounds|looks)\s+(good|great|interesting)\b/i,
    /\blet'?s\s+(talk|discuss|chat|meet)\b/i,
    /\b(we'?re|i'?m)\s+(looking for|interested in|considering)\b/i,
  ],
  consideringIntent: [
    /\b(maybe|might|possibly|perhaps|potentially)\b/i,
    /\b(think about|consider|review|evaluate)\b/i,
    /\b(tell|give)\s+me\s+more\b/i,
    /\bmore\s+information\b/i,
    /\bcould\s+you\s+(send|email)\b/i,
  ],
};

// Analyze transcript with strict criteria
function analyzeTranscript(transcript: string): {
  qualificationScore: number;
  highIntentMatches: string[];
  consideringMatches: string[];
  qaScore: number;
  qaStatus: 'new' | 'approved' | 'under_review';
  isQualified: boolean;
  rejectionReason?: string;
} {
  const highIntentMatches: string[] = [];
  const consideringMatches: string[] = [];

  INTEREST_KEYWORDS.highIntent.forEach((regex) => {
    const match = transcript.match(regex);
    if (match) highIntentMatches.push(match[0]);
  });

  INTEREST_KEYWORDS.consideringIntent.forEach((regex) => {
    const match = transcript.match(regex);
    if (match) consideringMatches.push(match[0]);
  });

  const wordCount = transcript.split(/\s+/).length;
  const uniqueWords = new Set(transcript.toLowerCase().split(/\s+/)).size;
  const uniqueRatio = uniqueWords / wordCount;

  // Calculate qualification score
  let qualificationScore = 0;
  qualificationScore += highIntentMatches.length * 30;
  qualificationScore += consideringMatches.length * 15;
  if (wordCount > 100 && uniqueRatio > 0.3) qualificationScore += 10;
  if (wordCount > 200 && uniqueRatio > 0.4) qualificationScore += 10;
  qualificationScore = Math.max(0, Math.min(100, qualificationScore));

  // QA Score
  let qaScore = 50;
  qaScore += Math.min(wordCount / 10, 30);
  qaScore += highIntentMatches.length * 5;
  qaScore += consideringMatches.length * 2;
  qaScore = Math.max(0, Math.min(100, qaScore));

  // Determine if actually qualified
  let isQualified = false;
  let rejectionReason: string | undefined;

  // Check for voicemail only
  if (isVoicemailOnly(transcript)) {
    rejectionReason = 'Voicemail only - no conversation';
  }
  // Check for low unique content (repetitive/stuck)
  else if (uniqueRatio = 60 || highIntentMatches.length >= 2) {
      qaStatus = 'approved';
    } else if (qualificationScore >= 30 || consideringMatches.length >= 1) {
      qaStatus = 'under_review';
    } else {
      qaStatus = 'new';
    }
  } else {
    qaStatus = 'new';
  }

  return {
    qualificationScore,
    highIntentMatches,
    consideringMatches,
    qaScore,
    qaStatus,
    isQualified,
    rejectionReason,
  };
}

async function cleanupAndRecreateLeads() {
  console.log('========================================');
  console.log('CLEANUP & RECREATE QUALIFIED LEADS');
  console.log('========================================\n');

  // Parse arguments
  const args = process.argv.slice(2);
  const EXECUTE = args.includes('--execute');
  const minCallDuration = parseInt(args.find(arg => arg.startsWith('--min-duration='))?.split('=')[1] || '90');

  if (!EXECUTE) {
    console.log('🔍 DRY RUN MODE - No changes will be made');
    console.log('Run with --execute to actually delete and recreate leads\n');
  } else {
    console.log('⚡ EXECUTE MODE - Will delete and recreate leads\n');
  }

  console.log(`Minimum call duration: ${minCallDuration}s`);
  console.log('Filtering criteria:');
  console.log('  - Exclude voicemail-only transcripts');
  console.log('  - Exclude repetitive/stuck transcripts');
  console.log('  - Require actual intent signals');
  console.log('  - Minimum qualification score: 30');
  console.log('  - Minimum conversation quality\n');

  // Step 1: Count current leads
  const currentLeads = await db.execute(sql`
    SELECT COUNT(*) as count
    FROM leads
    WHERE created_at::date = '2026-01-15'
  `);

  const currentCount = currentLeads.rows[0]?.count || 0;
  console.log(`Current leads from Jan 15: ${currentCount}\n`);

  // Step 2: Fetch and analyze transcribed calls
  const result = await db.execute(sql`
    SELECT
      dca.id as attempt_id,
      dca.contact_id,
      c.account_id,
      dca.campaign_id,
      dca.human_agent_id,
      dca.call_duration_seconds,
      dca.notes,
      dca.disposition,
      dca.recording_url,
      dca.telnyx_call_id,
      dca.phone_dialed,
      dca.created_at,
      c.first_name,
      c.last_name,
      c.email,
      c.direct_phone,
      c.job_title,
      c.full_name,
      a.name as account_name
    FROM dialer_call_attempts dca
    LEFT JOIN contacts c ON c.id = dca.contact_id
    LEFT JOIN accounts a ON a.id = c.account_id
    WHERE dca.created_at::date = '2026-01-15'
      AND dca.call_duration_seconds >= ${minCallDuration}
      AND dca.notes LIKE '%[Call Transcript]%'
      AND dca.contact_id IS NOT NULL
    ORDER BY dca.call_duration_seconds DESC
  `);

  console.log(`Found ${result.rows.length} transcribed calls (>=${minCallDuration}s)\n`);

  // Analyze all calls
  const analyzed = result.rows.map((row: any) => {
    const transcript = extractTranscript(row.notes);
    const analysis = transcript ? analyzeTranscript(transcript) : null;

    return {
      attemptId: row.attempt_id,
      contactId: row.contact_id,
      accountId: row.account_id,
      campaignId: row.campaign_id,
      agentId: row.human_agent_id,
      contactName: row.full_name || `${row.first_name || ''} ${row.last_name || ''}`.trim(),
      email: row.email,
      phone: row.direct_phone || row.phone_dialed,
      jobTitle: row.job_title,
      accountName: row.account_name,
      duration: row.call_duration_seconds,
      disposition: row.disposition,
      recordingUrl: row.recording_url,
      telnyxCallId: row.telnyx_call_id,
      createdAt: row.created_at,
      transcript,
      analysis,
    };
  });

  // Filter to only qualified leads
  const qualifiedLeads = analyzed.filter(a => a.analysis?.isQualified);
  const rejectedLeads = analyzed.filter(a => a.analysis && !a.analysis.isQualified);

  console.log('Analysis Results:');
  console.log(`  Total transcribed calls: ${analyzed.length}`);
  console.log(`  ✅ Qualified leads: ${qualifiedLeads.length}`);
  console.log(`  ❌ Rejected (not qualified): ${rejectedLeads.length}\n`);

  // Breakdown by rejection reason
  console.log('Rejection Reasons:');
  const rejectionReasons: { [key: string]: number } = {};
  rejectedLeads.forEach(lead => {
    const reason = lead.analysis!.rejectionReason || 'Unknown';
    rejectionReasons[reason] = (rejectionReasons[reason] || 0) + 1;
  });
  Object.entries(rejectionReasons).forEach(([reason, count]) => {
    console.log(`  ${reason}: ${count}`);
  });

  console.log('\nQualified Leads by QA Status:');
  const approved = qualifiedLeads.filter(l => l.analysis!.qaStatus === 'approved');
  const underReview = qualifiedLeads.filter(l => l.analysis!.qaStatus === 'under_review');
  const newLeads = qualifiedLeads.filter(l => l.analysis!.qaStatus === 'new');
  console.log(`  Approved: ${approved.length}`);
  console.log(`  Under Review: ${underReview.length}`);
  console.log(`  New: ${newLeads.length}\n`);

  if (!EXECUTE) {
    console.log('Preview of TOP 10 QUALIFIED leads:\n');
    qualifiedLeads.slice(0, 10).forEach((lead, i) => {
      console.log(`${i + 1}. ${lead.contactName} @ ${lead.accountName || 'N/A'}`);
      console.log(`   Score: ${lead.analysis!.qualificationScore}/100 | QA: ${lead.analysis!.qaScore.toFixed(1)}/100`);
      console.log(`   Status: ${lead.analysis!.qaStatus.toUpperCase()}`);
      console.log(`   Signals: ${lead.analysis!.highIntentMatches.join(', ') || 'considering only'}`);
      console.log(`   Duration: ${lead.duration}s`);
      console.log('');
    });

    console.log('\nPreview of REJECTED leads (first 5):\n');
    rejectedLeads.slice(0, 5).forEach((lead, i) => {
      console.log(`${i + 1}. ${lead.contactName} @ ${lead.accountName || 'N/A'}`);
      console.log(`   Reason: ${lead.analysis!.rejectionReason}`);
      console.log(`   Duration: ${lead.duration}s`);
      console.log(`   Transcript preview: ${lead.transcript?.substring(0, 100)}...`);
      console.log('');
    });

    console.log('========================================');
    console.log('NEXT STEP');
    console.log('========================================\n');
    console.log(`This will:`);
    console.log(`  1. DELETE ${currentCount} existing leads from Jan 15`);
    console.log(`  2. CREATE ${qualifiedLeads.length} NEW qualified leads`);
    console.log(`  3. Net change: ${qualifiedLeads.length - currentCount} leads\n`);
    console.log('To execute:');
    console.log('  npx tsx cleanup-and-recreate-leads.ts --execute\n');
    console.log('To change minimum call duration (default 90s):');
    console.log('  npx tsx cleanup-and-recreate-leads.ts --execute --min-duration=120\n');
    process.exit(0);
  }

  // EXECUTE MODE - Delete and recreate
  console.log('========================================');
  console.log('EXECUTING CLEANUP & RECREATION');
  console.log('========================================\n');

  // Step 1: Delete existing leads
  console.log(`Deleting ${currentCount} existing leads from Jan 15...`);
  await db.execute(sql`
    DELETE FROM leads
    WHERE created_at::date = '2026-01-15'
  `);
  console.log('✅ Deleted\n');

  // Step 2: Create qualified leads
  console.log(`Creating ${qualifiedLeads.length} qualified leads...\n`);
  let created = 0;
  let errors = 0;

  for (const lead of qualifiedLeads) {
    try {
      const qaData = {
        qualificationScore: lead.analysis!.qualificationScore,
        qaScore: lead.analysis!.qaScore,
        qaStatus: lead.analysis!.qaStatus,
        intentSignals: lead.analysis!.highIntentMatches,
        consideringSignals: lead.analysis!.consideringMatches,
        transcriptWordCount: lead.transcript!.split(/\s+/).length,
        callDuration: lead.duration,
        disposition: lead.disposition,
      };

      await db.insert(leads).values({
        contactId: lead.contactId,
        campaignId: lead.campaignId,
        agentId: lead.agentId,
        contactName: lead.contactName,
        contactEmail: lead.email,
        accountName: lead.accountName,
        callDuration: lead.duration,
        recordingUrl: lead.recordingUrl,
        telnyxCallId: lead.telnyxCallId,
        dialedNumber: lead.phone,
        qaStatus: lead.analysis!.qaStatus,
        qaData: qaData,
        transcript: lead.transcript,
        transcriptionStatus: 'completed',
        createdAt: new Date(lead.createdAt),
      });

      console.log(`  ✅ ${lead.contactName} (${lead.analysis!.qaStatus}, Score: ${lead.analysis!.qualificationScore}/100)`);
      created++;

    } catch (error: any) {
      console.log(`  ❌ ${lead.contactName} - ${error.message}`);
      errors++;
    }
  }

  console.log('\n========================================');
  console.log('SUMMARY');
  console.log('========================================\n');

  console.log(`Deleted: ${currentCount} old leads`);
  console.log(`Created: ${created} qualified leads`);
  console.log(`Errors: ${errors}`);
  console.log(`Net change: ${created - currentCount} leads\n`);

  console.log('Quality Distribution:');
  console.log(`  Approved (Ready for Sales): ${approved.length}`);
  console.log(`  Under Review (Nurture): ${underReview.length}`);
  console.log(`  New (Low Quality): ${newLeads.length}\n`);

  console.log('✅ Cleanup and recreation complete!\n');

  console.log('To view your qualified leads:');
  console.log('  npx tsx view-leads-with-transcripts.ts --qa-status=approved\n');

  process.exit(0);
}

cleanupAndRecreateLeads().catch(e => {
  console.error('Error:', e);
  process.exit(1);
});