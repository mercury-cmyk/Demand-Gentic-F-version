import { db } from './server/db';
import { sql } from 'drizzle-orm';
import { leads } from './shared/schema';

/**
 * Create Leads from Qualified January 15 Calls
 * Adds qualified prospects to the Leads table with QA scoring
 */

const TRANSCRIPT_MARKER = '[Call Transcript]';

// Interest signals for qualification
const INTEREST_KEYWORDS = {
  highIntent: [
    /interested/i,
    /schedule|book|calendar/i,
    /meeting|demo|presentation/i,
    /send (me|us|over)/i,
    /follow[- ]?up/i,
    /next (step|week|month)/i,
    /email|contact|reach out/i,
  ],
  consideringIntent: [
    /maybe|might|possibly/i,
    /think about|consider/i,
    /discuss|talk|speak/i,
    /more information/i,
    /tell me more/i,
  ],
};

// Extract transcript from notes
function extractTranscript(notes: string | null): string | null {
  if (!notes) return null;
  const markerIndex = notes.indexOf(TRANSCRIPT_MARKER);
  if (markerIndex === -1) return null;
  return notes.substring(markerIndex + TRANSCRIPT_MARKER.length).trim();
}

// Analyze transcript for qualification
function analyzeTranscript(transcript: string): {
  qualificationScore: number;
  highIntentMatches: string[];
  consideringMatches: string[];
  qaScore: number;
  qaStatus: 'new' | 'approved' | 'under_review';
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

  // Calculate qualification score (0-100)
  let qualificationScore = 0;
  qualificationScore += highIntentMatches.length * 30;
  qualificationScore += consideringMatches.length * 15;
  if (wordCount > 100) qualificationScore += 10;
  if (wordCount > 200) qualificationScore += 10;
  qualificationScore = Math.max(0, Math.min(100, qualificationScore));

  // QA Score (0-100) - based on conversation quality
  let qaScore = 50; // Base score
  qaScore += Math.min(wordCount / 10, 30); // More words = better engagement
  qaScore += highIntentMatches.length * 5; // Intent signals boost QA
  qaScore += consideringMatches.length * 2;
  qaScore = Math.max(0, Math.min(100, qaScore));

  // QA Status - using correct enum values from schema
  let qaStatus: 'new' | 'approved' | 'under_review';
  if (qualificationScore >= 60 || highIntentMatches.length >= 2) {
    qaStatus = 'approved'; // High quality, ready for sales
  } else if (qualificationScore >= 30 || consideringMatches.length >= 1) {
    qaStatus = 'under_review'; // Needs review/nurturing
  } else {
    qaStatus = 'new'; // Low quality
  }

  return {
    qualificationScore,
    highIntentMatches,
    consideringMatches,
    qaScore,
    qaStatus,
  };
}

async function createQualifiedLeads() {
  console.log('========================================');
  console.log('CREATE QUALIFIED LEADS FROM JAN 15');
  console.log('========================================\n');

  // Parse command line arguments
  const args = process.argv.slice(2);
  const DRY_RUN = !args.includes('--execute');
  const minScore = args.includes('--min-score')
    ? parseInt(args[args.indexOf('--min-score') + 1])
    : 60; // Only create leads with score >= 60

  if (DRY_RUN) {
    console.log('🔍 DRY RUN MODE - No changes will be made');
    console.log('Run with --execute flag to create leads\n');
  } else {
    console.log('⚡ EXECUTE MODE - Leads WILL be created\n');
  }

  console.log(`Minimum Qualification Score: ${minScore}/100\n`);

  // Fetch transcribed calls from Jan 15
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
      AND dca.call_duration_seconds >= 60
      AND dca.notes LIKE '%[Call Transcript]%'
      AND dca.contact_id IS NOT NULL
    ORDER BY dca.call_duration_seconds DESC
  `);

  console.log(`Found ${result.rows.length} transcribed calls\n`);

  // Analyze and filter qualified leads
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
  }).filter(a => a.analysis && a.analysis.qualificationScore >= minScore);

  console.log(`Qualified leads (score >= ${minScore}): ${analyzed.length}\n`);

  // Group by QA status
  const qualified = analyzed.filter(a => a.analysis!.qaStatus === 'approved');
  const nurture = analyzed.filter(a => a.analysis!.qaStatus === 'under_review');

  console.log(`  Approved (ready for sales): ${qualified.length}`);
  console.log(`  Under Review (warm leads): ${nurture.length}\n`);

  if (DRY_RUN) {
    console.log('Preview of leads to be created:\n');
    analyzed.slice(0, 10).forEach((lead, i) => {
      console.log(`${i + 1}. ${lead.contactName} @ ${lead.accountName || 'N/A'}`);
      console.log(`   Score: ${lead.analysis!.qualificationScore}/100 | QA: ${lead.analysis!.qaScore}/100`);
      console.log(`   Status: ${lead.analysis!.qaStatus.toUpperCase()}`);
      console.log(`   Signals: ${lead.analysis!.highIntentMatches.join(', ') || 'none'}`);
      console.log('');
    });

    if (analyzed.length > 10) {
      console.log(`   ... and ${analyzed.length - 10} more leads\n`);
    }

    console.log('To create these leads, run:');
    console.log(`  npx tsx create-qualified-leads.ts --execute --min-score ${minScore}`);
    process.exit(0);
  }

  // Create leads in database
  console.log('Creating leads...\n');
  let created = 0;
  let skipped = 0;
  let errors = 0;

  for (const lead of analyzed) {
    try {
      // Check if lead already exists for this contact
      const existing = await db.execute(sql`
        SELECT id FROM leads
        WHERE contact_id = ${lead.contactId}
          AND created_at::date = '2026-01-15'
        LIMIT 1
      `);

      if (existing.rows.length > 0) {
        console.log(`  ⏭️  Skipped: ${lead.contactName} (already exists)`);
        skipped++;
        continue;
      }

      // Prepare QA data
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

      // Create lead
      await db.insert(leads).values({
        contactId: lead.contactId,
        campaignId: lead.campaignId,
        agentId: lead.agentId,
        contactName: lead.contactName,
        email: lead.email,
        phone: lead.phone,
        jobTitle: lead.jobTitle,
        accountName: lead.accountName,
        callDuration: lead.duration,
        recordingUrl: lead.recordingUrl,
        telnyxCallId: lead.telnyxCallId,
        status: lead.analysis!.qaStatus === 'approved' ? 'qualified' : 'nurture',
        source: 'dialer',

        // QA fields
        qaStatus: lead.analysis!.qaStatus,
        qaScore: lead.analysis!.qaScore,
        qaData: qaData,

        // Qualification data
        qualificationData: {
          score: lead.analysis!.qualificationScore,
          signals: {
            highIntent: lead.analysis!.highIntentMatches,
            considering: lead.analysis!.consideringMatches,
          },
          transcript: lead.transcript,
          analysis: {
            wordCount: lead.transcript!.split(/\s+/).length,
            duration: lead.duration,
            disposition: lead.disposition,
          },
        },

        createdAt: new Date(lead.createdAt),
      });

      console.log(`  ✅ Created: ${lead.contactName} (${lead.analysis!.qaStatus}, Score: ${lead.analysis!.qualificationScore}/100)`);
      created++;

    } catch (error: any) {
      console.log(`  ❌ Error: ${lead.contactName} - ${error.message}`);
      errors++;
    }
  }

  console.log('\n========================================');
  console.log('SUMMARY');
  console.log('========================================\n');

  console.log(`Total Analyzed: ${analyzed.length}`);
  console.log(`Leads Created: ${created}`);
  console.log(`Skipped (duplicates): ${skipped}`);
  console.log(`Errors: ${errors}\n`);

  console.log('Breakdown by Status:');
  const createdQualified = analyzed.filter(a => a.analysis!.qaStatus === 'approved').length;
  const createdNurture = analyzed.filter(a => a.analysis!.qaStatus === 'under_review').length;
  console.log(`  Approved (Ready for Sales): ${createdQualified}`);
  console.log(`  Under Review (Nurture): ${createdNurture}\n`);

  console.log('Next Steps:');
  console.log('  1. Review qualified leads in your CRM/Leads dashboard');
  console.log('  2. Assign qualified leads to sales team');
  console.log('  3. Set up nurture campaigns for warm leads');
  console.log('  4. Track conversion rates by qualification score\n');

  console.log('To query your new leads:');
  console.log(`  SELECT * FROM leads WHERE created_at::date = '2026-01-15' AND qa_status IN ('qualified', 'nurture') ORDER BY qa_score DESC;`);

  process.exit(0);
}

createQualifiedLeads().catch(e => {
  console.error('Fatal error:', e);
  process.exit(1);
});
