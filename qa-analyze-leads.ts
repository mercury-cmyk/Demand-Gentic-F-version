import { db } from './server/db';
import { sql } from 'drizzle-orm';
import { leads } from './shared/schema';
import { eq } from 'drizzle-orm';

/**
 * QA Analyze Leads
 * 
 * Process all leads with qa_status='new' through transcript analysis
 * and update their qa_status based on qualification signals.
 */

const TRANSCRIPT_MARKER = '[Call Transcript]';

// Voicemail detection patterns
const VOICEMAIL_PATTERNS = [
  /voicemail service/i,
  /leave a message after the (tone|beep)/i,
  /press.*for more options/i,
  /the person you are calling is not available/i,
  /please leave your message/i,
  /you have reached the voicemail/i,
  /after the tone/i,
  /press.*to page/i,
  /cannot take your call/i,
  /not available.*leave/i,
];

// Detect if transcript is voicemail
function isVoicemailOnly(transcript: string): boolean {
  const hasVoicemailPattern = VOICEMAIL_PATTERNS.some(pattern => pattern.test(transcript));
  
  // Check for repetitive content
  const lines = transcript.split(/[.!?]\s+/).filter(l => l.trim().length > 0);
  if (lines.length > 5) {
    const firstLine = lines[0].trim();
    const repetitions = lines.filter(l => l.trim() === firstLine).length;
    if (repetitions > lines.length * 0.5) {
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

// Interest signals
const INTEREST_KEYWORDS = {
  highIntent: [
    /\b(yes|yeah|sure|absolutely|definitely|interested)\b.*\b(send|email|information|details)\b/i,
    /\bsend\s+(me|us|over|that)\b/i,
    /\b(schedule|book|set up|arrange)\b.*\b(meeting|call|demo|presentation)\b/i,
    /\b(next|follow)\s+step\b/i,
    /\b(sounds|looks)\s+(good|great|interesting)\b/i,
    /\blet'?s\s+(talk|discuss|chat|meet)\b/i,
    /\b(we'?re|i'?m)\s+(looking for|interested in|considering)\b/i,
    /\bi\s+would\s+(like|love)\s+to\s+(hear|learn|know)/i,
    /\bthat\s+would\s+be\s+(great|helpful|good)\b/i,
    /\byes\b.*\bplease\b/i,
    /\bemail\s+(it|that|me)\b/i,
  ],
  consideringIntent: [
    /\b(maybe|might|possibly|perhaps|potentially)\b/i,
    /\b(think about|consider|review|evaluate)\b/i,
    /\b(tell|give)\s+me\s+more\b/i,
    /\bmore\s+information\b/i,
    /\bcould\s+you\s+(send|email)\b/i,
    /\bwhat\s+(is|are|does|do)\b/i,
    /\bhow\s+(does|do|can|would)\b/i,
  ],
  // Negative signals
  notInterested: [
    /\bnot\s+interested\b/i,
    /\bdon'?t\s+call\b/i,
    /\bremove\s+me\b/i,
    /\bno\s+thank\s+you\b/i,
    /\bwrong\s+number\b/i,
    /\bstop\s+calling\b/i,
    /\btake\s+me\s+off\b/i,
  ],
};

// Analyze transcript
function analyzeTranscript(transcript: string): {
  qualificationScore: number;
  highIntentMatches: string[];
  consideringMatches: string[];
  negativeMatches: string[];
  qaScore: number;
  qaStatus: 'new' | 'approved' | 'under_review' | 'rejected';
  isVoicemail: boolean;
  reason: string;
} {
  const highIntentMatches: string[] = [];
  const consideringMatches: string[] = [];
  const negativeMatches: string[] = [];

  INTEREST_KEYWORDS.highIntent.forEach((regex) => {
    const match = transcript.match(regex);
    if (match) highIntentMatches.push(match[0]);
  });

  INTEREST_KEYWORDS.consideringIntent.forEach((regex) => {
    const match = transcript.match(regex);
    if (match) consideringMatches.push(match[0]);
  });

  INTEREST_KEYWORDS.notInterested.forEach((regex) => {
    const match = transcript.match(regex);
    if (match) negativeMatches.push(match[0]);
  });

  const wordCount = transcript.split(/\s+/).length;
  const uniqueWords = new Set(transcript.toLowerCase().split(/\s+/)).size;
  const uniqueRatio = uniqueWords / wordCount;
  const isVoicemail = isVoicemailOnly(transcript);

  // Calculate qualification score
  let qualificationScore = 0;
  qualificationScore += highIntentMatches.length * 30;
  qualificationScore += consideringMatches.length * 15;
  qualificationScore -= negativeMatches.length * 40;
  if (wordCount > 100 && uniqueRatio > 0.3) qualificationScore += 10;
  if (wordCount > 200 && uniqueRatio > 0.4) qualificationScore += 10;
  qualificationScore = Math.max(0, Math.min(100, qualificationScore));

  // QA Score (conversation quality)
  let qaScore = 50;
  qaScore += Math.min(wordCount / 10, 30);
  qaScore += highIntentMatches.length * 5;
  qaScore += consideringMatches.length * 2;
  qaScore -= negativeMatches.length * 20;
  qaScore = Math.max(0, Math.min(100, qaScore));

  // Determine status
  let qaStatus: 'new' | 'approved' | 'under_review' | 'rejected' = 'new';
  let reason = '';

  if (isVoicemail) {
    qaStatus = 'rejected';
    reason = 'Voicemail only - no conversation';
  } else if (negativeMatches.length > 0) {
    qaStatus = 'rejected';
    reason = `Not interested: ${negativeMatches.join(', ')}`;
  } else if (qualificationScore >= 60 || highIntentMatches.length >= 2) {
    qaStatus = 'approved';
    reason = `High intent: ${highIntentMatches.join(', ') || 'strong signals'}`;
  } else if (qualificationScore >= 30 || consideringMatches.length >= 1) {
    qaStatus = 'under_review';
    reason = `Considering: ${consideringMatches.join(', ') || 'some interest'}`;
  } else if (wordCount < 50) {
    qaStatus = 'rejected';
    reason = 'Conversation too short';
  } else {
    qaStatus = 'new';
    reason = 'Needs manual review - no clear signals';
  }

  return {
    qualificationScore,
    highIntentMatches,
    consideringMatches,
    negativeMatches,
    qaScore,
    qaStatus,
    isVoicemail,
    reason,
  };
}

async function main() {
  console.log('========================================');
  console.log('  QA ANALYSIS FOR NEW LEADS');
  console.log('========================================\n');

  // Parse command line arguments
  const args = process.argv.slice(2);
  const DRY_RUN = !args.includes('--execute');

  if (DRY_RUN) {
    console.log('🔍 DRY RUN MODE - No changes will be made');
    console.log('Run with --execute flag to update leads\n');
  } else {
    console.log('⚡ EXECUTE MODE - Leads WILL be updated\n');
  }

  // Fetch all leads with qa_status = 'new'
  const leadsResult = await db.execute(sql`
    SELECT 
      l.id as lead_id,
      l.contact_id,
      l.campaign_id,
      l.qa_status,
      l.ai_analysis,
      c.full_name,
      c.first_name,
      c.last_name,
      c.email,
      c.job_title,
      a.name as account_name
    FROM leads l
    LEFT JOIN contacts c ON c.id = l.contact_id
    LEFT JOIN accounts a ON a.id = c.account_id
    WHERE l.qa_status = 'new'
    ORDER BY l.created_at DESC
  `);

  console.log(`Found ${leadsResult.rows.length} leads with qa_status='new'\n`);

  if (leadsResult.rows.length === 0) {
    console.log('No leads to process.');
    process.exit(0);
  }

  // Get call transcripts for each lead
  const results: any[] = [];
  
  for (const lead of leadsResult.rows as any[]) {
    // Find the call attempt with transcript for this contact
    const callResult = await db.execute(sql`
      SELECT 
        dca.notes,
        dca.call_duration_seconds,
        dca.disposition,
        dca.created_at
      FROM dialer_call_attempts dca
      WHERE dca.contact_id = ${lead.contact_id}
        AND dca.notes LIKE '%[Call Transcript]%'
      ORDER BY dca.call_duration_seconds DESC
      LIMIT 1
    `);

    const contactName = lead.full_name || `${lead.first_name || ''} ${lead.last_name || ''}`.trim() || 'Unknown';
    
    if (callResult.rows.length === 0) {
      results.push({
        leadId: lead.lead_id,
        contactId: lead.contact_id,
        contactName,
        accountName: lead.account_name,
        email: lead.email,
        jobTitle: lead.job_title,
        hasTranscript: false,
        analysis: null,
        currentQaStatus: lead.qa_status,
        newQaStatus: 'new',
        reason: 'No transcript found',
      });
      continue;
    }

    const call = callResult.rows[0] as any;
    const transcript = extractTranscript(call.notes);

    if (!transcript) {
      results.push({
        leadId: lead.lead_id,
        contactId: lead.contact_id,
        contactName,
        accountName: lead.account_name,
        email: lead.email,
        jobTitle: lead.job_title,
        hasTranscript: false,
        analysis: null,
        currentQaStatus: lead.qa_status,
        newQaStatus: 'new',
        reason: 'Could not extract transcript',
      });
      continue;
    }

    const analysis = analyzeTranscript(transcript);

    results.push({
      leadId: lead.lead_id,
      contactId: lead.contact_id,
      contactName,
      accountName: lead.account_name,
      email: lead.email,
      jobTitle: lead.job_title,
      duration: call.call_duration_seconds,
      disposition: call.disposition,
      hasTranscript: true,
      transcript: transcript.substring(0, 500) + (transcript.length > 500 ? '...' : ''),
      analysis,
      currentQaStatus: lead.qa_status,
      newQaStatus: analysis.qaStatus,
      reason: analysis.reason,
    });
  }

  // Display results
  console.log('Analysis Results:\n');
  console.log('─'.repeat(80));

  const statusCounts = {
    approved: 0,
    under_review: 0,
    rejected: 0,
    new: 0,
  };

  results.forEach((r, i) => {
    console.log(`\n${i + 1}. ${r.contactName}`);
    console.log(`   Account: ${r.accountName || 'N/A'}`);
    console.log(`   Email: ${r.email || 'N/A'}`);
    console.log(`   Title: ${r.jobTitle || 'N/A'}`);
    
    if (r.hasTranscript && r.analysis) {
      console.log(`   Duration: ${r.duration}s | Disposition: ${r.disposition}`);
      console.log(`   Score: ${r.analysis.qualificationScore}/100 | QA: ${r.analysis.qaScore.toFixed(1)}/100`);
      console.log(`   High Intent: ${r.analysis.highIntentMatches.join(', ') || 'none'}`);
      console.log(`   Considering: ${r.analysis.consideringMatches.join(', ') || 'none'}`);
      console.log(`   Negative: ${r.analysis.negativeMatches.join(', ') || 'none'}`);
      console.log(`   Voicemail: ${r.analysis.isVoicemail ? 'YES ⚠️' : 'No'}`);
    } else {
      console.log(`   ⚠️ No transcript available`);
    }
    
    const emojiMap: Record<string, string> = {
      approved: '✅',
      under_review: '🔍',
      rejected: '❌',
      new: '📋',
    };
    const statusEmoji = emojiMap[r.newQaStatus] || '❓';
    
    console.log(`   Status: ${r.currentQaStatus} → ${statusEmoji} ${r.newQaStatus.toUpperCase()}`);
    console.log(`   Reason: ${r.reason}`);
    
    statusCounts[r.newQaStatus as keyof typeof statusCounts]++;
  });

  console.log('\n' + '─'.repeat(80));
  console.log('\nSummary:');
  console.log(`  ✅ Approved: ${statusCounts.approved}`);
  console.log(`  🔍 Under Review: ${statusCounts.under_review}`);
  console.log(`  ❌ Rejected: ${statusCounts.rejected}`);
  console.log(`  📋 New (needs review): ${statusCounts.new}`);

  if (!DRY_RUN) {
    console.log('\nUpdating leads...\n');
    
    let updated = 0;
    for (const r of results) {
      if (r.analysis) {
        await db.execute(sql`
          UPDATE leads 
          SET 
            qa_status = ${r.newQaStatus},
            ai_analysis = ${JSON.stringify({
              qualificationScore: r.analysis.qualificationScore,
              qaScore: r.analysis.qaScore,
              highIntentMatches: r.analysis.highIntentMatches,
              consideringMatches: r.analysis.consideringMatches,
              negativeMatches: r.analysis.negativeMatches,
              isVoicemail: r.analysis.isVoicemail,
              reason: r.reason,
              analyzedAt: new Date().toISOString(),
            })}::jsonb,
            updated_at = NOW()
          WHERE id = ${r.leadId}
        `);
        console.log(`  ✅ Updated ${r.contactName} → ${r.newQaStatus}`);
        updated++;
      }
    }
    
    console.log(`\n✅ Updated ${updated} leads`);
  } else {
    console.log('\n💡 Run with --execute to apply these changes');
  }

  process.exit(0);
}

main().catch(console.error);
