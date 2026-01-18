import { pool } from './server/db';

/**
 * Reanalyze all call dispositions based on updated criteria:
 *
 * invalid_data should ONLY be used when:
 * - "wrong number" confirmed
 * - "no one by that name" / person doesn't work there
 * - "no longer works" / "left the company"
 * - Line disconnected / out of service
 *
 * If a meaningful conversation happened (duration >= 30s or transcripts > 2)
 * WITHOUT these indicators, it should be not_interested or qualified_lead
 */

// Phrases that indicate legitimate invalid_data
const INVALID_DATA_INDICATORS = [
  'wrong number',
  'no one by that name',
  'doesn\'t work here',
  'does not work here',
  'no longer works',
  'left the company',
  'disconnected',
  'out of service',
  'not in service',
  'number not valid',
  'invalid number',
  'never worked here',
  'no such person',
  'moved on',
  'no longer with',
  'not at this number',
  'retired',
  'passed away'
];

function isLegitimateInvalidData(text: string): boolean {
  const lowerText = text.toLowerCase();
  return INVALID_DATA_INDICATORS.some(indicator => lowerText.includes(indicator));
}

async function reanalyzeDispositions() {
  console.log('\n🔄 Reanalyzing Call Dispositions Based on Updated Criteria\n');
  console.log('='.repeat(80));

  // 1. Analyze campaign_test_calls (test calls)
  console.log('\n📞 ANALYZING TEST CALLS (campaign_test_calls):\n');

  const testCalls = await pool.query(`
    SELECT
      id,
      disposition,
      duration_seconds,
      call_summary,
      full_transcript,
      test_result,
      created_at
    FROM campaign_test_calls
    WHERE disposition IS NOT NULL
      AND created_at >= '2026-01-15'
    ORDER BY created_at DESC
  `);

  let testCallsUpdated = 0;
  let testCallsAnalyzed = 0;

  for (const call of testCalls.rows) {
    testCallsAnalyzed++;
    const duration = call.duration_seconds || 0;
    const transcript = call.full_transcript || '';
    const summary = call.call_summary || '';
    const combinedText = `${transcript} ${summary}`.toLowerCase();

    const isLegitInvalid = isLegitimateInvalidData(combinedText);
    const hasMeaningfulConversation = duration >= 30 || transcript.split('\n').length > 4;

    let suggestedDisposition = call.disposition;
    let needsUpdate = false;
    let reason = '';

    if (call.disposition === 'invalid_data') {
      if (hasMeaningfulConversation && !isLegitInvalid) {
        // Should be not_interested, not invalid_data
        suggestedDisposition = 'not_interested';
        needsUpdate = true;
        reason = `Duration: ${duration}s, no wrong number indicators found`;
      } else if (isLegitInvalid) {
        reason = `Legitimate invalid_data: contains "${INVALID_DATA_INDICATORS.find(i => combinedText.includes(i))}"`;
      }
    }

    console.log(`─`.repeat(80));
    console.log(`📞 Test Call: ${call.id}`);
    console.log(`   Date: ${call.created_at}`);
    console.log(`   Duration: ${duration}s`);
    console.log(`   Current Disposition: ${call.disposition}`);

    if (needsUpdate) {
      console.log(`   ⚠️  NEEDS UPDATE → ${suggestedDisposition}`);
      console.log(`   Reason: ${reason}`);

      // Update the disposition
      await pool.query(`
        UPDATE campaign_test_calls
        SET disposition = $1, updated_at = NOW()
        WHERE id = $2
      `, [suggestedDisposition, call.id]);

      console.log(`   ✅ UPDATED to ${suggestedDisposition}`);
      testCallsUpdated++;
    } else {
      console.log(`   ✓ Disposition OK: ${reason || 'No change needed'}`);
    }

    // Show transcript snippet
    if (transcript) {
      const lines = transcript.split('\n').slice(0, 5);
      console.log(`   Transcript preview:`);
      lines.forEach(line => console.log(`     ${line.substring(0, 80)}${line.length > 80 ? '...' : ''}`));
    }
  }

  console.log(`\n📊 Test Calls Summary: ${testCallsUpdated}/${testCallsAnalyzed} updated\n`);

  // 2. Analyze dialer_call_attempts (production calls)
  console.log('\n📞 ANALYZING PRODUCTION CALLS (dialer_call_attempts):\n');

  // First get count of invalid_data calls that might need review
  const invalidDataCalls = await pool.query(`
    SELECT
      dca.id,
      dca.disposition,
      dca.call_duration_seconds as duration,
      dca.connected,
      dca.notes,
      dca.call_started_at,
      c.name as campaign_name
    FROM dialer_call_attempts dca
    JOIN campaigns c ON dca.campaign_id = c.id
    WHERE dca.disposition = 'invalid_data'
    ORDER BY dca.call_started_at DESC
    LIMIT 100
  `);

  let productionCallsUpdated = 0;
  let productionCallsAnalyzed = 0;
  let legitimateInvalidData = 0;
  let needsManualReview = 0;

  for (const call of invalidDataCalls.rows) {
    productionCallsAnalyzed++;
    const duration = call.duration || 0;
    const notes = call.notes || '';
    const connected = call.connected;

    const isLegitInvalid = isLegitimateInvalidData(notes);
    const hasMeaningfulConversation = connected && duration >= 30;

    if (isLegitInvalid) {
      legitimateInvalidData++;
      // This is correctly marked as invalid_data
    } else if (hasMeaningfulConversation) {
      // This might need to be updated
      console.log(`─`.repeat(80));
      console.log(`📞 Call: ${call.id}`);
      console.log(`   Campaign: ${call.campaign_name}`);
      console.log(`   Date: ${call.call_started_at}`);
      console.log(`   Duration: ${duration}s | Connected: ${connected}`);
      console.log(`   Notes: ${notes || '(none)'}`);
      console.log(`   ⚠️  POTENTIAL MISCLASSIFICATION - Connected ${duration}s call marked as invalid_data`);

      // Update to not_interested
      await pool.query(`
        UPDATE dialer_call_attempts
        SET disposition = 'not_interested', updated_at = NOW()
        WHERE id = $1
      `, [call.id]);

      console.log(`   ✅ UPDATED to not_interested`);
      productionCallsUpdated++;
    } else if (!connected && duration <= 5) {
      // Short disconnected call - likely legitimate invalid_data
      legitimateInvalidData++;
    } else {
      needsManualReview++;
    }
  }

  console.log(`\n📊 Production Calls Summary:`);
  console.log(`   Total invalid_data analyzed: ${productionCallsAnalyzed}`);
  console.log(`   Legitimate invalid_data: ${legitimateInvalidData}`);
  console.log(`   Auto-corrected to not_interested: ${productionCallsUpdated}`);
  console.log(`   Needs manual review: ${needsManualReview}`);

  // 3. Final summary statistics
  console.log('\n' + '='.repeat(80));
  console.log('📈 FINAL DISPOSITION BREAKDOWN:\n');

  const finalStats = await pool.query(`
    SELECT disposition, COUNT(*) as count
    FROM dialer_call_attempts
    WHERE disposition IS NOT NULL
    GROUP BY disposition
    ORDER BY count DESC
  `);

  console.log('Dialer Call Attempts:');
  for (const row of finalStats.rows) {
    console.log(`   ${String(row.disposition).padEnd(20)}: ${row.count}`);
  }

  const testCallStats = await pool.query(`
    SELECT disposition, COUNT(*) as count
    FROM campaign_test_calls
    WHERE disposition IS NOT NULL
    GROUP BY disposition
    ORDER BY count DESC
  `);

  console.log('\nTest Calls:');
  for (const row of testCallStats.rows) {
    console.log(`   ${String(row.disposition).padEnd(20)}: ${row.count}`);
  }

  console.log('\n✅ Disposition reanalysis complete!\n');

  process.exit(0);
}

reanalyzeDispositions().catch(e => {
  console.error('Error:', e.message);
  process.exit(1);
});
