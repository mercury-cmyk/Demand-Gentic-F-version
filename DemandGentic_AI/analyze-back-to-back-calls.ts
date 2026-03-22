import { db } from './server/db';
import { sql } from 'drizzle-orm';

async function findBackToBackCalls() {
  console.log('Analyzing back-to-back calls on January 15...\n');

  // Find contacts with multiple calls on Jan 15, ordered by time
  const result = await db.execute(sql`
    SELECT
      c.email,
      c.first_name,
      c.last_name,
      c.direct_phone,
      dca.id,
      dca.created_at,
      dca.call_duration_seconds,
      dca.disposition,
      dca.connected,
      dca.voicemail_detected
    FROM dialer_call_attempts dca
    JOIN contacts c ON c.id = dca.contact_id
    WHERE dca.created_at::date = '2026-01-15'
    ORDER BY c.email, dca.created_at
  `);

  console.log(`Total call attempts on Jan 15: ${result.rows.length}`);

  // Group by contact
  const byContact = new Map();
  for (const row of result.rows as any[]) {
    const key = row.email || row.direct_phone;
    if (!byContact.has(key)) {
      byContact.set(key, []);
    }
    byContact.get(key)!.push(row);
  }

  // Find contacts with multiple calls
  console.log('\n========================================');
  console.log('CONTACTS WITH MULTIPLE CALLS');
  console.log('========================================\n');

  let multipleCallContacts = 0;
  const backToBackCalls: any[] = [];

  for (const [contact, calls] of byContact) {
    if (calls.length > 1) {
      multipleCallContacts++;

      // Check time between calls
      for (let i = 1; i  c.timeBetweenMinutes  c.timeBetweenMinutes >= 5 && c.timeBetweenMinutes  c.timeBetweenMinutes >= 30 && c.timeBetweenMinutes  c.timeBetweenMinutes >= 60);

  console.log('Time between calls breakdown:');
  console.log(`   60 minutes: ${longDelay.length}\n`);

  // Show immediate calls (most concerning)
  console.log('\n========================================');
  console.log('IMMEDIATE BACK-TO-BACK CALLS ( {
    console.log(`${i+1}. ${c.name} (${c.phone})`);
    console.log(`   Call 1: ${c.call1Duration}s - ${c.call1Disposition || 'null'}`);
    console.log(`   Call 2: ${c.call2Duration}s - ${c.call2Disposition || 'null'}`);
    console.log(`   Time between: ${c.timeBetweenMinutes.toFixed(1)} minutes\n`);
  });

  // Disposition patterns for immediate calls
  console.log('\n========================================');
  console.log('DISPOSITION PATTERNS (Immediate Calls)');
  console.log('========================================\n');

  const patterns: Record = {};
  immediate.forEach(c => {
    const pattern = `${c.call1Disposition || 'null'} -> ${c.call2Disposition || 'null'}`;
    patterns[pattern] = (patterns[pattern] || 0) + 1;
  });

  Object.entries(patterns)
    .sort((a, b) => b[1] - a[1])
    .forEach(([pattern, count]) => {
      console.log(`  ${pattern}: ${count}`);
    });

  // Check call durations for immediate calls
  console.log('\n========================================');
  console.log('CALL DURATION ANALYSIS (Immediate Calls)');
  console.log('========================================\n');

  const zeroDuration = immediate.filter(c => c.call1Duration === 0 || c.call1Duration === null);
  const shortDuration = immediate.filter(c => c.call1Duration > 0 && c.call1Duration  c.call1Duration >= 10);

  console.log(`First call duration breakdown:`);
  console.log(`  0 or null (failed/not answered): ${zeroDuration.length}`);
  console.log(`  1-10 seconds (very short): ${shortDuration.length}`);
  console.log(`  10+ seconds (normal): ${normalDuration.length}`);

  // Analysis
  console.log('\n========================================');
  console.log('ROOT CAUSE ANALYSIS');
  console.log('========================================\n');

  if (immediate.length > 0) {
    const nullDispositionCount = immediate.filter(c => !c.call1Disposition).length;
    const noAnswerCount = immediate.filter(c => c.call1Disposition === 'no_answer').length;

    if (nullDispositionCount > 0) {
      console.log(`⚠️  ${nullDispositionCount} immediate retries had NULL disposition on first call`);
      console.log('   This suggests calls failed/errored without setting a disposition,');
      console.log('   which may have triggered an immediate retry.\n');
    }

    if (noAnswerCount > 0) {
      console.log(`⚠️  ${noAnswerCount} immediate retries had "no_answer" disposition`);
      console.log('   The system may be retrying "no_answer" calls too quickly.\n');
    }

    const zeroFirstDuration = immediate.filter(c => c.call1Duration === 0 || c.call1Duration === null).length;
    if (zeroFirstDuration > 0) {
      console.log(`⚠️  ${zeroFirstDuration} immediate retries had 0/null duration on first call`);
      console.log('   These were likely failed call attempts (network error, busy, etc.)');
      console.log('   that triggered an immediate retry.\n');
    }
  }

  process.exit(0);
}

findBackToBackCalls().catch(e => {
  console.error('Error:', e);
  process.exit(1);
});