import { db } from './server/db';
import { sql } from 'drizzle-orm';

async function deepAnalysis() {
  console.log('=== DEEP DISPOSITION ANALYSIS ===\n');

  // 1. NO_ANSWER (5471 calls)
  console.log('--- NO_ANSWER (5471 calls) ---');
  const noAnswer = await db.execute(sql`
    SELECT 
      CASE 
        WHEN call_duration_seconds IS NULL OR call_duration_seconds = 0 THEN '0s (never connected)'
        WHEN call_duration_seconds  0) {
    console.log('\n  Top notes:');
    for (const r of noAnswerNotes.rows) {
      console.log(`    [${r.cnt}] ${(r.notes as string).substring(0, 100)}...`);
    }
  }

  // 2. NULL disposition (3807 calls)
  console.log('\n--- NULL DISPOSITION (3807 calls) ---');
  const nullDisp = await db.execute(sql`
    SELECT 
      CASE 
        WHEN call_duration_seconds IS NULL OR call_duration_seconds = 0 THEN '0s (call never started)'
        WHEN call_duration_seconds  0) {
    console.log('\n  Sample notes (longest calls):');
    for (const r of niSamples.rows) {
      console.log(`    [${r.call_duration_seconds}s] ${(r.notes as string).substring(0, 150)}...`);
    }
  }

  process.exit(0);
}

deepAnalysis();