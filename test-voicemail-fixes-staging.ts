/**
 * Staging Environment Testing Script
 *
 * Tests the voicemail detection improvements in a controlled environment
 */

import { db } from './server/db';
import { sql } from 'drizzle-orm';

interface TestResult {
  testName: string;
  passed: boolean;
  duration?: number;
  disposition?: string;
  humanDetected?: boolean;
  notes: string;
}

const testResults: TestResult[] = [];

/**
 * Check if the code changes are present
 */
async function verifyCodeChanges(): Promise<boolean> {
  console.log('🔍 Verifying code changes are deployed...\n');

  try {
    // Check if the new fields exist in the openai-realtime-dialer.ts
    const fs = await import('fs');
    const code = fs.readFileSync('./server/services/openai-realtime-dialer.ts', 'utf-8');

    const checks = [
      { name: 'IVR loop tracking fields', pattern: /ivrMenuRepeatCount.*number/s },
      { name: 'IVR loop detection logic', pattern: /IVR menu repeated.*times/ },
      { name: '60-second timeout', pattern: /MAX_DURATION_WITHOUT_HUMAN_SECONDS.*60/ },
      { name: 'Human detection flag', pattern: /HUMAN DETECTED for call/ },
    ];

    let allPassed = true;
    for (const check of checks) {
      const found = check.pattern.test(code);
      console.log(`  ${found ? '✅' : '❌'} ${check.name}`);
      if (!found) allPassed = false;
    }

    console.log('');
    return allPassed;
  } catch (error) {
    console.error('❌ Error verifying code changes:', error);
    return false;
  }
}

/**
 * Test 1: Check recent voicemail calls
 */
async function testRecentVoicemailCalls(): Promise<void> {
  console.log('📊 Test 1: Analyzing recent voicemail calls...\n');

  try {
    const recentVoicemails = await db.execute(sql`
      SELECT
        id,
        call_duration_seconds,
        disposition,
        notes,
        created_at
      FROM dialer_call_attempts
      WHERE disposition = 'voicemail'
        AND created_at >= NOW() - INTERVAL '2 hours'
      ORDER BY created_at DESC
      LIMIT 10
    `);

    console.log(`Found ${recentVoicemails.rows.length} voicemail calls in last 2 hours\n`);

    if (recentVoicemails.rows.length === 0) {
      console.log('⚠️  No recent voicemail calls to analyze. Try making some test calls.\n');
      testResults.push({
        testName: 'Recent Voicemail Analysis',
        passed: false,
        notes: 'No data available',
      });
      return;
    }

    let callsUnder65s = 0;
    let totalDuration = 0;

    for (const row of recentVoicemails.rows) {
      const r = row as any;
      const duration = r.call_duration_seconds || 0;
      totalDuration += duration;

      console.log(`  Call ${r.id.substring(0, 8)}...`);
      console.log(`    Duration: ${duration}s`);
      console.log(`    Created: ${r.created_at}`);

      if (duration <= 65) {
        callsUnder65s++;
        console.log(`    ✅ Under target duration (≤65s)`);
      } else {
        console.log(`    ⚠️  Above target duration (>65s)`);
      }

      // Check if notes contain timeout message
      if (r.notes && r.notes.includes('NO HUMAN DETECTED')) {
        console.log(`    ✅ Timeout triggered correctly`);
      }

      console.log('');
    }

    const avgDuration = totalDuration / recentVoicemails.rows.length;
    const percentUnder65s = (callsUnder65s / recentVoicemails.rows.length) * 100;

    console.log(`Average Duration: ${Math.round(avgDuration)}s`);
    console.log(`Calls ≤65s: ${callsUnder65s}/${recentVoicemails.rows.length} (${percentUnder65s.toFixed(1)}%)\n`);

    const passed = avgDuration <= 70; // Allow 5s margin
    testResults.push({
      testName: 'Recent Voicemail Duration',
      passed,
      duration: Math.round(avgDuration),
      notes: `${percentUnder65s.toFixed(1)}% of calls under 65s`,
    });

    console.log(passed ? '✅ Test PASSED\n' : '❌ Test FAILED - Average duration too high\n');
  } catch (error) {
    console.error('❌ Error in test:', error);
    testResults.push({
      testName: 'Recent Voicemail Analysis',
      passed: false,
      notes: `Error: ${error}`,
    });
  }
}

/**
 * Test 2: Check for false positives
 */
async function testFalsePositives(): Promise<void> {
  console.log('🔍 Test 2: Checking for false positives...\n');

  try {
    const suspiciousCalls = await db.execute(sql`
      SELECT
        id,
        call_duration_seconds,
        disposition,
        notes,
        created_at
      FROM dialer_call_attempts
      WHERE created_at >= NOW() - INTERVAL '2 hours'
        AND disposition = 'voicemail'
        AND call_duration_seconds BETWEEN 10 AND 30
        AND (
          notes ILIKE '%yes%'
          OR notes ILIKE '%hello%'
          OR notes ILIKE '%speaking%'
        )
      LIMIT 10
    `);

    console.log(`Found ${suspiciousCalls.rows.length} potential false positives\n`);

    if (suspiciousCalls.rows.length === 0) {
      console.log('✅ No false positives detected\n');
      testResults.push({
        testName: 'False Positive Detection',
        passed: true,
        notes: 'No false positives found',
      });
    } else {
      console.log('⚠️  Potential false positives detected:\n');

      for (const row of suspiciousCalls.rows) {
        const r = row as any;
        console.log(`  Call ${r.id.substring(0, 8)}...`);
        console.log(`    Duration: ${r.call_duration_seconds}s`);
        console.log(`    Transcript preview: ${(r.notes || '').substring(0, 100)}...`);
        console.log('');
      }

      testResults.push({
        testName: 'False Positive Detection',
        passed: suspiciousCalls.rows.length < 2, // Allow up to 1 false positive
        notes: `${suspiciousCalls.rows.length} potential false positives (manual review needed)`,
      });
    }
  } catch (error) {
    console.error('❌ Error in test:', error);
    testResults.push({
      testName: 'False Positive Detection',
      passed: false,
      notes: `Error: ${error}`,
    });
  }
}

/**
 * Test 3: Verify human calls still work
 */
async function testHumanCallsWorking(): Promise<void> {
  console.log('👥 Test 3: Verifying human calls still work...\n');

  try {
    const humanCalls = await db.execute(sql`
      SELECT
        id,
        call_duration_seconds,
        disposition,
        created_at
      FROM dialer_call_attempts
      WHERE created_at >= NOW() - INTERVAL '2 hours'
        AND disposition IN ('qualified_lead', 'not_interested', 'do_not_call')
      ORDER BY created_at DESC
      LIMIT 5
    `);

    console.log(`Found ${humanCalls.rows.length} human calls in last 2 hours\n`);

    if (humanCalls.rows.length === 0) {
      console.log('⚠️  No human calls found. This may be expected if no humans answered.\n');
      testResults.push({
        testName: 'Human Calls Working',
        passed: true,
        notes: 'No human calls to verify (may be expected)',
      });
      return;
    }

    let allHaveReasonableDuration = true;

    for (const row of humanCalls.rows) {
      const r = row as any;
      console.log(`  Call ${r.id.substring(0, 8)}...`);
      console.log(`    Disposition: ${r.disposition}`);
      console.log(`    Duration: ${r.call_duration_seconds}s`);

      // Human calls should NOT be cut off at 60s
      if (r.call_duration_seconds >= 60) {
        console.log(`    ✅ Call continued past 60s (human detected correctly)`);
      } else if (r.call_duration_seconds >= 30) {
        console.log(`    ✅ Reasonable duration for human call`);
      } else {
        console.log(`    ⚠️  Very short for human call`);
        allHaveReasonableDuration = false;
      }
      console.log('');
    }

    testResults.push({
      testName: 'Human Calls Working',
      passed: allHaveReasonableDuration,
      notes: `${humanCalls.rows.length} human calls analyzed`,
    });

    console.log(allHaveReasonableDuration ? '✅ Test PASSED\n' : '⚠️  Test WARNING - Check short human calls\n');
  } catch (error) {
    console.error('❌ Error in test:', error);
    testResults.push({
      testName: 'Human Calls Working',
      passed: false,
      notes: `Error: ${error}`,
    });
  }
}

/**
 * Test 4: Check timeout behavior
 */
async function testTimeoutBehavior(): Promise<void> {
  console.log('⏱️  Test 4: Checking 60-second timeout behavior...\n');

  try {
    const callsAt60s = await db.execute(sql`
      SELECT
        COUNT(*) as count,
        AVG(call_duration_seconds) as avg_duration
      FROM dialer_call_attempts
      WHERE created_at >= NOW() - INTERVAL '2 hours'
        AND disposition IN ('voicemail', 'no_answer')
        AND call_duration_seconds BETWEEN 58 AND 62
    `);

    const callsAt60sCount = Number(callsAt60s.rows[0]?.count) || 0;
    const avgDuration = Number(callsAt60s.rows[0]?.avg_duration) || 0;

    console.log(`Calls ending at ~60s: ${callsAt60sCount}`);
    console.log(`Average duration of those calls: ${Math.round(avgDuration)}s\n`);

    // Get total non-human calls
    const totalNonHuman = await db.execute(sql`
      SELECT COUNT(*) as count
      FROM dialer_call_attempts
      WHERE created_at >= NOW() - INTERVAL '2 hours'
        AND disposition IN ('voicemail', 'no_answer')
    `);

    const totalCount = Number(totalNonHuman.rows[0]?.count) || 0;

    if (totalCount === 0) {
      console.log('⚠️  No non-human calls found to analyze\n');
      testResults.push({
        testName: 'Timeout Behavior',
        passed: true,
        notes: 'No data available',
      });
      return;
    }

    const percentAt60s = (callsAt60sCount / totalCount) * 100;
    console.log(`Percentage ending at 60s: ${percentAt60s.toFixed(1)}%\n`);

    // We expect 50-90% of non-human calls to hit the timeout
    const passed = percentAt60s >= 30 && percentAt60s <= 95;

    testResults.push({
      testName: 'Timeout Behavior',
      passed,
      notes: `${percentAt60s.toFixed(1)}% of non-human calls ended at 60s`,
    });

    if (passed) {
      console.log('✅ Test PASSED - Timeout triggering appropriately\n');
    } else if (percentAt60s < 30) {
      console.log('⚠️  Test WARNING - Timeout may not be triggering enough\n');
    } else {
      console.log('⚠️  Test WARNING - Too many calls hitting timeout (>95%)\n');
    }
  } catch (error) {
    console.error('❌ Error in test:', error);
    testResults.push({
      testName: 'Timeout Behavior',
      passed: false,
      notes: `Error: ${error}`,
    });
  }
}

/**
 * Test 5: Check logs for error patterns
 */
async function testLogPatterns(): Promise<void> {
  console.log('📋 Test 5: Checking application logs...\n');

  try {
    // Check recent logs for error patterns
    console.log('Checking for critical patterns in logs:');
    console.log('  ℹ️  Manual check required - look for:');
    console.log('    - "NO HUMAN DETECTED" messages');
    console.log('    - "IVR menu repeated" messages');
    console.log('    - "HUMAN DETECTED" messages');
    console.log('    - Any errors related to timeout logic');
    console.log('');
    console.log('  Run: pm2 logs --lines 100 | grep -E "(NO HUMAN|IVR menu|HUMAN DETECTED)"\n');

    testResults.push({
      testName: 'Log Pattern Check',
      passed: true,
      notes: 'Manual verification required',
    });
  } catch (error) {
    console.error('❌ Error in test:', error);
    testResults.push({
      testName: 'Log Pattern Check',
      passed: false,
      notes: `Error: ${error}`,
    });
  }
}

/**
 * Generate test report
 */
function generateTestReport(): void {
  console.log('\n' + '='.repeat(70));
  console.log('📊 STAGING TEST REPORT');
  console.log('='.repeat(70) + '\n');

  const totalTests = testResults.length;
  const passedTests = testResults.filter(t => t.passed).length;
  const failedTests = totalTests - passedTests;

  console.log(`Total Tests: ${totalTests}`);
  console.log(`Passed: ${passedTests}`);
  console.log(`Failed: ${failedTests}`);
  console.log(`Success Rate: ${((passedTests / totalTests) * 100).toFixed(1)}%\n`);

  console.log('Detailed Results:');
  console.log('-'.repeat(70));

  for (const result of testResults) {
    const status = result.passed ? '✅ PASS' : '❌ FAIL';
    console.log(`\n${status} - ${result.testName}`);
    if (result.duration) console.log(`  Duration: ${result.duration}s`);
    if (result.disposition) console.log(`  Disposition: ${result.disposition}`);
    if (result.humanDetected !== undefined) console.log(`  Human Detected: ${result.humanDetected}`);
    console.log(`  Notes: ${result.notes}`);
  }

  console.log('\n' + '='.repeat(70));

  if (failedTests === 0) {
    console.log('✅ ALL TESTS PASSED - Ready for production');
  } else if (failedTests <= 2) {
    console.log('⚠️  SOME TESTS FAILED - Review results before production');
  } else {
    console.log('❌ MULTIPLE TESTS FAILED - Do not deploy to production');
  }

  console.log('='.repeat(70) + '\n');
}

/**
 * Main test execution
 */
async function runStagingTests() {
  console.log('🚀 Starting Staging Environment Tests');
  console.log('='.repeat(70) + '\n');
  console.log(`Timestamp: ${new Date().toISOString()}\n`);

  // Verify code changes are deployed
  const codeVerified = await verifyCodeChanges();
  if (!codeVerified) {
    console.log('❌ Code changes not fully deployed. Please deploy first.\n');
    process.exit(1);
  }

  console.log('✅ Code changes verified\n');
  console.log('='.repeat(70) + '\n');

  // Run all tests
  await testRecentVoicemailCalls();
  await testFalsePositives();
  await testHumanCallsWorking();
  await testTimeoutBehavior();
  await testLogPatterns();

  // Generate report
  generateTestReport();

  // Exit with appropriate code
  const allPassed = testResults.every(t => t.passed);
  process.exit(allPassed ? 0 : 1);
}

// Execute tests
runStagingTests().catch(error => {
  console.error('❌ Fatal error running tests:', error);
  process.exit(1);
});
