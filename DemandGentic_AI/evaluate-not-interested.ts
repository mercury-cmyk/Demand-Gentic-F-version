import { db } from './server/db';
import { sql } from 'drizzle-orm';

async function evaluateNotInterested() {
  console.log('='.repeat(80));
  console.log('EVALUATING NOT_INTERESTED CALLS AGAINST SUCCESS CRITERIA');
  console.log('='.repeat(80));
  console.log();

  // First, get the success criteria for active campaigns
  const campaigns = await db.execute(sql`
    SELECT
      id,
      name,
      success_criteria,
      campaign_objective
    FROM campaigns
    WHERE dial_mode = 'ai_agent' AND status = 'active'
  `);

  console.log('=== CAMPAIGN SUCCESS CRITERIA ===\n');
  for (const c of campaigns.rows as any[]) {
    console.log(`📋 ${c.name}`);
    console.log(`   Success Criteria: ${c.success_criteria ? 'DEFINED' : '❌ NOT SET'}`);
    if (c.success_criteria) {
      // Extract key indicators from success criteria
      const criteria = c.success_criteria.toLowerCase();
      const indicators: string[] = [];

      if (criteria.includes('interest') || criteria.includes('curious')) indicators.push('interest/curiosity');
      if (criteria.includes('meeting') || criteria.includes('session') || criteria.includes('schedule')) indicators.push('meeting request');
      if (criteria.includes('consent') || criteria.includes('agree')) indicators.push('consent given');
      if (criteria.includes('email') || criteria.includes('follow-up')) indicators.push('follow-up interest');
      if (criteria.includes('pilot') || criteria.includes('demo')) indicators.push('demo/pilot interest');
      if (criteria.includes('question')) indicators.push('asked questions');
      if (criteria.includes('confirm') || criteria.includes('identity')) indicators.push('identity confirmed');

      console.log(`   Key Indicators: ${indicators.join(', ') || 'generic'}`);
    }
    console.log();
  }

  // Get not_interested calls with duration > 30s (meaningful conversations)
  console.log('\n=== NOT_INTERESTED CALLS WITH MEANINGFUL DURATION (>30s) ===\n');

  const notInterestedCalls = await db.execute(sql`
    SELECT
      dca.id,
      dca.phone_dialed,
      dca.call_duration_seconds,
      dca.disposition,
      dca.connected,
      dca.created_at,
      dca.campaign_id,
      dca.notes,
      dca.recording_url,
      c.first_name,
      c.last_name,
      c.job_title,
      c.company_norm as company_name,
      camp.name as campaign_name,
      camp.success_criteria
    FROM dialer_call_attempts dca
    LEFT JOIN contacts c ON dca.contact_id = c.id
    LEFT JOIN campaigns camp ON dca.campaign_id = camp.id
    WHERE dca.disposition = 'not_interested'
    AND dca.call_duration_seconds > 30
    AND dca.created_at > NOW() - INTERVAL '7 days'
    ORDER BY dca.call_duration_seconds DESC
    LIMIT 50
  `);

  console.log(`Found ${notInterestedCalls.rows.length} not_interested calls with duration > 30s\n`);

  let potentialQualified = 0;
  let needsReview: any[] = [];

  for (const call of notInterestedCalls.rows as any[]) {
    const duration = call.call_duration_seconds;
    const notes = call.notes;
    const criteria = call.success_criteria?.toLowerCase() || '';

    // Analyze if this might have been a qualified lead
    let signals: string[] = [];
    let redFlags: string[] = [];

    // Duration-based signals - longer calls suggest engagement
    if (duration > 180) signals.push(`Very long call (${duration}s) - likely engaged conversation`);
    else if (duration > 120) signals.push(`Long call (${duration}s) - meaningful conversation`);
    else if (duration > 60) signals.push(`Medium call (${duration}s)`);

    // Check notes for positive signals
    if (notes) {
      const notesLower = notes.toLowerCase();

      // Positive signals
      if (notesLower.includes('interest')) signals.push('Mentioned interest');
      if (notesLower.includes('question')) signals.push('Asked questions');
      if (notesLower.includes('follow') || notesLower.includes('email')) signals.push('Follow-up discussed');
      if (notesLower.includes('meeting') || notesLower.includes('schedule') || notesLower.includes('call back')) signals.push('Meeting/callback mentioned');
      if (notesLower.includes('demo') || notesLower.includes('pilot') || notesLower.includes('trial')) signals.push('Demo/pilot interest');
      if (notesLower.includes('send') && (notesLower.includes('info') || notesLower.includes('material'))) signals.push('Requested info');
      if (notesLower.includes('budget') || notesLower.includes('price') || notesLower.includes('cost')) signals.push('Budget discussion');
      if (notesLower.includes('decision') || notesLower.includes('authority')) signals.push('Decision maker signals');

      // Red flags (actual not interested signals)
      if (notesLower.includes('not interested') || notesLower.includes('no interest')) redFlags.push('Explicit no interest');
      if (notesLower.includes('busy') || notesLower.includes('bad time')) redFlags.push('Bad timing');
      if (notesLower.includes('already have') || notesLower.includes('current solution')) redFlags.push('Has solution');
      if (notesLower.includes('hang up') || notesLower.includes('hung up')) redFlags.push('Hung up');
      if (notesLower.includes('wrong person') || notesLower.includes('wrong number')) redFlags.push('Wrong contact');
    }

    // Check against campaign success criteria
    if (criteria && notes) {
      const notesLower = notes.toLowerCase();

      // Pivotal B2B criteria
      if (criteria.includes('abm') && notesLower.includes('abm')) signals.push('ABM topic discussed');
      if (criteria.includes('intelligence') && notesLower.includes('intelligence')) signals.push('Intelligence discussed');
      if (criteria.includes('session') && (notesLower.includes('session') || notesLower.includes('meeting'))) signals.push('Session interest');

      // Proton UK criteria
      if (criteria.includes('consent') && notesLower.includes('consent')) signals.push('Consent given');
      if (criteria.includes('whitepaper') && notesLower.includes('whitepaper')) signals.push('Whitepaper interest');
      if (criteria.includes('email') && notesLower.includes('email')) signals.push('Email confirmed');
    }

    // Determine if this needs review based on duration alone for calls without notes
    const hasPositiveSignals = signals.length >= 2;
    const hasNoRedFlags = redFlags.length === 0;
    const isVeryLongCall = duration > 120; // 2+ minute calls are suspicious for "not interested"

    const shouldReview = (hasPositiveSignals && hasNoRedFlags) || (isVeryLongCall && redFlags.length === 0);

    if (shouldReview) {
      potentialQualified++;
      needsReview.push({
        ...call,
        signals,
        redFlags
      });
    }
  }

  console.log('='.repeat(80));
  console.log('CALLS THAT MAY HAVE BEEN MISCLASSIFIED');
  console.log('='.repeat(80));
  console.log();

  if (needsReview.length === 0) {
    console.log('✅ No obvious misclassifications found based on available data.');
    console.log('   Note: Call summaries may be missing or incomplete.');
  } else {
    console.log(`⚠️  Found ${needsReview.length} calls that might be qualified leads:\n`);

    for (const call of needsReview) {
      console.log(`--- ${call.first_name} ${call.last_name} (${call.job_title || 'N/A'}) ---`);
      console.log(`    Company: ${call.company_name || 'N/A'}`);
      console.log(`    Campaign: ${call.campaign_name}`);
      console.log(`    Duration: ${call.call_duration_seconds}s`);
      console.log(`    Date: ${new Date(call.created_at).toLocaleString()}`);
      console.log(`    ✅ Positive signals: ${call.signals.join(', ') || 'None'}`);
      console.log(`    ❌ Red flags: ${call.redFlags.join(', ') || 'None'}`);
      if (call.notes) {
        console.log(`    Notes: ${call.notes.substring(0, 200)}${call.notes.length > 200 ? '...' : ''}`);
      } else {
        console.log(`    Notes: ❌ NO NOTES RECORDED`);
      }
      if (call.recording_url) {
        console.log(`    🎙️ Recording: ${call.recording_url.substring(0, 60)}...`);
      }
      console.log();
    }
  }

  // Summary statistics
  console.log('='.repeat(80));
  console.log('SUMMARY');
  console.log('='.repeat(80));
  console.log(`Total not_interested calls (>30s): ${notInterestedCalls.rows.length}`);
  console.log(`Potentially misclassified: ${potentialQualified} (${((potentialQualified / notInterestedCalls.rows.length) * 100).toFixed(1)}%)`);

  // Check how many have notes
  const withNotes = (notInterestedCalls.rows as any[]).filter(c => c.notes).length;
  console.log(`Calls with notes: ${withNotes} (${((withNotes / notInterestedCalls.rows.length) * 100).toFixed(1)}%)`);

  // Check how many have recordings
  const withRecording = (notInterestedCalls.rows as any[]).filter(c => c.recording_url).length;
  console.log(`Calls with recordings: ${withRecording} (${((withRecording / notInterestedCalls.rows.length) * 100).toFixed(1)}%)`);

  if (withNotes  c.call_duration_seconds);
  const over60 = durations.filter(d => d > 60).length;
  const over120 = durations.filter(d => d > 120).length;
  const over180 = durations.filter(d => d > 180).length;
  console.log(`  30-60s: ${durations.length - over60} calls`);
  console.log(`  60-120s: ${over60 - over120} calls`);
  console.log(`  120-180s: ${over120 - over180} calls`);
  console.log(`  180s+: ${over180} calls`);

  process.exit(0);
}

evaluateNotInterested().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});