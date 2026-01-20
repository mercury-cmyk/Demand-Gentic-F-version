import { db } from './server/db';
import { dialerCallAttempts } from './server/db/schema';
import { eq, sql, and, or, isNull } from 'drizzle-orm';

/**
 * Backfill Script: Fix voicemail_detected flag and reclassify misclassified calls
 * 
 * This script:
 * 1. Sets voicemail_detected=true for all calls with disposition='voicemail'
 * 2. Reclassifies not_interested calls that contain voicemail/IVR patterns
 */

async function backfillVoicemailDetected() {
  console.log('=== BACKFILL: voicemail_detected FLAG ===\n');

  // Count how many need updating
  const countResult = await db.execute(sql`
    SELECT COUNT(*) as cnt
    FROM dialer_call_attempts
    WHERE disposition = 'voicemail'
      AND (voicemail_detected = false OR voicemail_detected IS NULL)
  `);
  
  const countToUpdate = countResult.rows[0]?.cnt || 0;
  console.log(`Found ${countToUpdate} voicemail calls with voicemail_detected=false`);

  if (Number(countToUpdate) > 0) {
    // Update all voicemail disposition calls to have voicemail_detected=true
    const updateResult = await db.execute(sql`
      UPDATE dialer_call_attempts
      SET voicemail_detected = true,
          updated_at = NOW()
      WHERE disposition = 'voicemail'
        AND (voicemail_detected = false OR voicemail_detected IS NULL)
    `);
    
    console.log(`✅ Updated ${updateResult.rowCount} records to voicemail_detected=true`);
  }
}

async function reclassifyNotInterestedCalls() {
  console.log('\n=== RECLASSIFY: not_interested calls with voicemail/IVR patterns ===\n');

  // Find not_interested calls that contain voicemail keywords in notes
  const voicemailKeywords = [
    'voicemail', 'mailbox', 'leave a message', 'leave your message',
    'after the beep', 'after the tone', 'not available', 'is unavailable',
    'please record', 'record your message', 'forwarded to an automated',
    'voice messaging system', 'automatic voice message'
  ];

  // Build OR conditions for each keyword
  const keywordConditions = voicemailKeywords.map(kw => `notes ILIKE '%${kw}%'`).join(' OR ');

  // Count before update
  const countResult = await db.execute(sql`
    SELECT COUNT(*) as cnt
    FROM dialer_call_attempts
    WHERE disposition = 'not_interested'
      AND connected = false
      AND (${sql.raw(keywordConditions)})
  `);
  
  const countToReclassify = countResult.rows[0]?.cnt || 0;
  console.log(`Found ${countToReclassify} not_interested calls with voicemail keywords`);

  if (Number(countToReclassify) > 0) {
    // Update these to voicemail disposition
    const updateResult = await db.execute(sql`
      UPDATE dialer_call_attempts
      SET disposition = 'voicemail',
          voicemail_detected = true,
          updated_at = NOW()
      WHERE disposition = 'not_interested'
        AND connected = false
        AND (${sql.raw(keywordConditions)})
    `);
    
    console.log(`✅ Reclassified ${updateResult.rowCount} calls from not_interested to voicemail`);
  }

  // Now handle IVR patterns - these should be no_answer, not not_interested
  console.log('\n--- Reclassifying IVR patterns to no_answer ---');
  
  const ivrKeywords = [
    'press 1', 'press 2', 'press 3', 'press pound', 'press star',
    'dial by name', 'directory', 'operator', 'extension',
    'please hold', 'your call is important'
  ];

  const ivrConditions = ivrKeywords.map(kw => `notes ILIKE '%${kw}%'`).join(' OR ');

  const ivrCountResult = await db.execute(sql`
    SELECT COUNT(*) as cnt
    FROM dialer_call_attempts
    WHERE disposition = 'not_interested'
      AND connected = false
      AND (${sql.raw(ivrConditions)})
      AND NOT (${sql.raw(keywordConditions)})  -- Exclude ones already classified as voicemail
  `);
  
  const ivrCountToReclassify = ivrCountResult.rows[0]?.cnt || 0;
  console.log(`Found ${ivrCountToReclassify} not_interested calls with IVR patterns (no voicemail)`);

  if (Number(ivrCountToReclassify) > 0) {
    const updateResult = await db.execute(sql`
      UPDATE dialer_call_attempts
      SET disposition = 'no_answer',
          updated_at = NOW()
      WHERE disposition = 'not_interested'
        AND connected = false
        AND (${sql.raw(ivrConditions)})
        AND NOT (${sql.raw(keywordConditions)})
    `);
    
    console.log(`✅ Reclassified ${updateResult.rowCount} calls from not_interested to no_answer (IVR)`);
  }
}

async function printSummary() {
  console.log('\n=== FINAL DISPOSITION SUMMARY ===\n');

  const summary = await db.execute(sql`
    SELECT 
      disposition,
      connected,
      voicemail_detected,
      COUNT(*) as cnt
    FROM dialer_call_attempts
    GROUP BY disposition, connected, voicemail_detected
    ORDER BY cnt DESC
  `);

  console.log('Disposition          | Connected | VM_Detected | Count');
  console.log('-'.repeat(60));
  for (const r of summary.rows) {
    const disp = (r.disposition || 'NULL').toString().padEnd(20);
    const conn = r.connected ? 'true' : 'false';
    const vm = r.voicemail_detected ? 'true' : 'false';
    console.log(`${disp} | ${conn.padEnd(9)} | ${vm.padEnd(11)} | ${r.cnt}`);
  }
}

async function main() {
  try {
    console.log('Starting backfill and reclassification...\n');
    
    await backfillVoicemailDetected();
    await reclassifyNotInterestedCalls();
    await printSummary();
    
    console.log('\n✅ Backfill complete!');
    process.exit(0);
  } catch (error) {
    console.error('Error during backfill:', error);
    process.exit(1);
  }
}

main();
