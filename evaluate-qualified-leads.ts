import { pool } from './server/db';

/**
 * Evaluate qualified_lead dispositions based on strict criteria:
 *
 * REQUIRED for qualified_lead:
 * 1. Identity CONFIRMED - verified speaking to the right person
 * 2. Meaningful conversation - at least 30+ seconds of actual dialogue
 * 3. Clear interest signals - ONE OR MORE of:
 *    - Asked specific questions about the offer/product/service
 *    - Explicitly requested follow-up materials, demo, or meeting
 *    - Shared relevant business challenges or pain points
 *    - Asked about pricing, timeline, or next steps
 *
 * NOT qualified_lead if:
 * - Only said "yes", "sure", "okay" without elaboration
 * - Call was under 30 seconds
 * - No questions asked by prospect
 * - Identity was never confirmed
 * - Conversation was entirely one-sided
 */

// Interest signals that indicate qualification
const INTEREST_SIGNALS = [
  // Questions about offer/product
  'how does', 'how do you', 'what does', 'what do you', 'can you tell me',
  'how much', 'what\'s the cost', 'what\'s the price', 'pricing',
  'how long', 'timeline', 'when can', 'how soon',

  // Follow-up requests
  'send me', 'email me', 'send information', 'more details', 'more info',
  'schedule', 'set up a meeting', 'book a call', 'demo', 'presentation',
  'let\'s talk', 'call me back', 'follow up',

  // Pain points/challenges shared
  'we\'re looking for', 'we need', 'our challenge', 'our problem',
  'struggling with', 'having issues', 'looking to improve',

  // Engagement signals
  'that sounds interesting', 'tell me more', 'i\'m interested',
  'we\'ve been thinking about', 'that\'s exactly what',
  'yes, please', 'definitely', 'absolutely'
];

// Identity confirmation phrases
const IDENTITY_CONFIRMED = [
  'yes, this is', 'speaking', 'that\'s me', 'this is he', 'this is she',
  'yeah, speaking', 'yes speaking', 'you\'re speaking to', 'i am',
  'this is', 'correct', 'that\'s correct'
];

// Negative/rejection signals
const REJECTION_SIGNALS = [
  'not interested', 'no thank you', 'no thanks', 'don\'t call',
  'remove me', 'take me off', 'stop calling', 'busy right now',
  'not a good time', 'call back later', 'in a meeting'
];

function analyzeTranscript(transcript: string): {
  identityConfirmed: boolean;
  interestSignals: string[];
  rejectionSignals: string[];
  prospectResponses: number;
  agentTurns: number;
} {
  const lower = transcript.toLowerCase();
  const lines = transcript.split('\n').filter(l => l.trim());

  // Count turns
  const prospectLines = lines.filter(l =>
    l.toLowerCase().startsWith('contact:') ||
    l.toLowerCase().startsWith('user:') ||
    l.toLowerCase().startsWith('prospect:')
  );
  const agentLines = lines.filter(l =>
    l.toLowerCase().startsWith('agent:') ||
    l.toLowerCase().startsWith('assistant:')
  );

  // Check identity confirmation
  const identityConfirmed = IDENTITY_CONFIRMED.some(phrase => lower.includes(phrase));

  // Find interest signals
  const interestSignals = INTEREST_SIGNALS.filter(signal => lower.includes(signal));

  // Find rejection signals
  const rejectionSignals = REJECTION_SIGNALS.filter(signal => lower.includes(signal));

  return {
    identityConfirmed,
    interestSignals,
    rejectionSignals,
    prospectResponses: prospectLines.length,
    agentTurns: agentLines.length
  };
}

async function evaluateQualifiedLeads() {
  console.log('\n🔍 Evaluating Qualified Leads Against Strict Criteria\n');
  console.log('='.repeat(80));

  // Get all qualified_lead test calls after Jan 15
  const qualifiedLeads = await pool.query(`
    SELECT
      id,
      disposition,
      duration_seconds,
      call_summary,
      full_transcript,
      test_result,
      test_contact_name,
      test_company_name,
      test_job_title,
      created_at
    FROM campaign_test_calls
    WHERE disposition = 'qualified_lead'
      AND created_at >= '2026-01-15'
    ORDER BY created_at DESC
  `);

  console.log(`\n📊 Found ${qualifiedLeads.rows.length} qualified_lead calls to evaluate\n`);

  let validLeads = 0;
  let invalidLeads = 0;
  let needsReview = 0;

  for (const lead of qualifiedLeads.rows) {
    const duration = lead.duration_seconds || 0;
    const transcript = lead.full_transcript || '';
    const summary = lead.call_summary || '';

    const analysis = analyzeTranscript(transcript);

    console.log('─'.repeat(80));
    console.log(`📞 Call ID: ${lead.id}`);
    console.log(`   Contact: ${lead.test_contact_name} | ${lead.test_job_title || 'N/A'} @ ${lead.test_company_name || 'N/A'}`);
    console.log(`   Date: ${lead.created_at}`);
    console.log(`   Duration: ${duration}s`);
    console.log(`   Current Disposition: ${lead.disposition}`);
    console.log('');

    // Evaluate criteria
    console.log('   📋 QUALIFICATION CRITERIA CHECK:');

    // Criterion 1: Duration >= 30s
    const durationOk = duration >= 30;
    console.log(`   ${durationOk ? '✅' : '❌'} Duration >= 30s: ${duration}s`);

    // Criterion 2: Identity confirmed
    console.log(`   ${analysis.identityConfirmed ? '✅' : '⚠️'} Identity Confirmed: ${analysis.identityConfirmed ? 'Yes' : 'Not explicitly detected'}`);

    // Criterion 3: Interest signals
    const hasInterest = analysis.interestSignals.length > 0;
    console.log(`   ${hasInterest ? '✅' : '❌'} Interest Signals: ${analysis.interestSignals.length > 0 ? analysis.interestSignals.slice(0, 3).join(', ') : 'None detected'}`);

    // Check for rejection signals
    const hasRejection = analysis.rejectionSignals.length > 0;
    if (hasRejection) {
      console.log(`   ⚠️  Rejection Signals Found: ${analysis.rejectionSignals.join(', ')}`);
    }

    // Conversation analysis
    console.log(`   📊 Conversation: ${analysis.prospectResponses} prospect responses, ${analysis.agentTurns} agent turns`);
    const isOneSided = analysis.prospectResponses < 3;
    if (isOneSided) {
      console.log(`   ⚠️  Conversation may be one-sided (few prospect responses)`);
    }

    // Overall verdict
    const meetsAllCriteria = durationOk && analysis.identityConfirmed && hasInterest && !hasRejection && !isOneSided;
    const meetsSomeCriteria = durationOk && (analysis.identityConfirmed || hasInterest);

    console.log('');
    if (meetsAllCriteria) {
      console.log('   ✅ VERDICT: VALID QUALIFIED LEAD - Meets all criteria');
      validLeads++;
    } else if (meetsSomeCriteria && !hasRejection) {
      console.log('   ⚠️  VERDICT: NEEDS REVIEW - Meets some criteria but not all');
      needsReview++;

      // Check if should be downgraded
      if (!hasInterest) {
        console.log('   💡 Suggestion: Consider downgrading to not_interested (no clear interest signals)');
      }
    } else {
      console.log('   ❌ VERDICT: INVALID QUALIFIED LEAD - Does not meet criteria');
      invalidLeads++;

      if (hasRejection) {
        console.log('   💡 Suggestion: Should be not_interested (rejection signals detected)');
      } else if (!durationOk) {
        console.log('   💡 Suggestion: Should be no_answer or not_interested (call too short)');
      }
    }

    // Show transcript preview
    if (transcript) {
      console.log('');
      console.log('   📝 Transcript Preview:');
      const lines = transcript.split('\n').slice(0, 8);
      lines.forEach(line => {
        const trimmed = line.substring(0, 100);
        console.log(`      ${trimmed}${line.length > 100 ? '...' : ''}`);
      });
    }

    console.log('');
  }

  // Summary
  console.log('='.repeat(80));
  console.log('\n📈 QUALIFIED LEADS EVALUATION SUMMARY:\n');
  console.log(`   Total Qualified Leads: ${qualifiedLeads.rows.length}`);
  console.log(`   ✅ Valid (meets all criteria): ${validLeads}`);
  console.log(`   ⚠️  Needs Review: ${needsReview}`);
  console.log(`   ❌ Invalid (should be reclassified): ${invalidLeads}`);

  const validPercent = qualifiedLeads.rows.length > 0
    ? Math.round((validLeads / qualifiedLeads.rows.length) * 100)
    : 0;
  console.log(`\n   Quality Score: ${validPercent}% valid qualified leads`);

  // Also check not_interested calls that might be qualified
  console.log('\n' + '='.repeat(80));
  console.log('\n🔍 CHECKING NOT_INTERESTED CALLS FOR POTENTIAL QUALIFIED LEADS:\n');

  const notInterestedCalls = await pool.query(`
    SELECT
      id,
      disposition,
      duration_seconds,
      call_summary,
      full_transcript,
      test_contact_name,
      test_company_name,
      created_at
    FROM campaign_test_calls
    WHERE disposition = 'not_interested'
      AND created_at >= '2026-01-15'
      AND duration_seconds >= 60
    ORDER BY duration_seconds DESC
  `);

  let potentialUpgrades = 0;

  for (const call of notInterestedCalls.rows) {
    const transcript = call.full_transcript || '';
    const analysis = analyzeTranscript(transcript);

    if (analysis.identityConfirmed && analysis.interestSignals.length >= 2 && analysis.rejectionSignals.length === 0) {
      potentialUpgrades++;
      console.log(`─`.repeat(80));
      console.log(`📞 Potential Upgrade: ${call.id}`);
      console.log(`   Contact: ${call.test_contact_name} @ ${call.test_company_name}`);
      console.log(`   Duration: ${call.duration_seconds}s`);
      console.log(`   Interest Signals: ${analysis.interestSignals.slice(0, 3).join(', ')}`);
      console.log(`   💡 This call may qualify as qualified_lead`);
    }
  }

  if (potentialUpgrades === 0) {
    console.log('   No not_interested calls appear to qualify for upgrade.');
  } else {
    console.log(`\n   Found ${potentialUpgrades} not_interested calls that may qualify as qualified_lead`);
  }

  console.log('\n✅ Evaluation complete!\n');

  process.exit(0);
}

evaluateQualifiedLeads().catch(e => {
  console.error('Error:', e.message);
  process.exit(1);
});
