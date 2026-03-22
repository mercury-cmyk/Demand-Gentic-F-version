/**
 * Deep investigation of qualified lead detection
 * 
 * This script analyzes:
 * 1. Calls with meaningful transcripts that might have been qualified
 * 2. Whether AI is calling submit_disposition properly
 * 3. Patterns in calls marked as no_answer vs qualified_lead
 */

import { db } from "./server/db";
import { sql } from "drizzle-orm";

async function investigate() {
  console.log('=== DEEP INVESTIGATION: Qualified Lead Detection ===\n');

  // 1. Find calls with long transcripts that are NOT qualified_lead
  console.log('--- 1. Calls with substantial transcripts (>500 chars) but NOT qualified_lead ---');
  const missedQualified = await db.execute(sql`
    SELECT 
      id,
      ai_disposition,
      LENGTH(ai_transcript) as transcript_length,
      duration_sec,
      contact_id,
      campaign_id,
      started_at,
      SUBSTRING(ai_transcript FROM 1 FOR 500) as transcript_preview
    FROM call_sessions
    WHERE agent_type = 'ai'
      AND ai_transcript IS NOT NULL
      AND LENGTH(ai_transcript) > 500
      AND ai_disposition != 'qualified_lead'
    ORDER BY LENGTH(ai_transcript) DESC
    LIMIT 10
  `);
  
  console.log(`Found ${missedQualified.rows.length} calls with substantial transcripts not marked qualified:\n`);
  for (const row of missedQualified.rows as any[]) {
    console.log(`ID: ${row.id.substring(0, 8)}`);
    console.log(`  Disposition: ${row.ai_disposition}`);
    console.log(`  Duration: ${row.duration_sec}s`);
    console.log(`  Transcript length: ${row.transcript_length} chars`);
    console.log(`  Preview: ${row.transcript_preview?.substring(0, 200)}...`);
    console.log('');
  }

  // 2. Check the qualified_lead calls - what do they look like?
  console.log('\n--- 2. Qualified Lead Calls - What Made Them Qualified? ---');
  const qualifiedCalls = await db.execute(sql`
    SELECT 
      id,
      ai_disposition,
      LENGTH(ai_transcript) as transcript_length,
      duration_sec,
      ai_transcript,
      ai_analysis,
      started_at
    FROM call_sessions
    WHERE ai_disposition = 'qualified_lead'
    ORDER BY started_at DESC
    LIMIT 5
  `);
  
  console.log(`Found ${qualifiedCalls.rows.length} qualified_lead calls:\n`);
  for (const row of qualifiedCalls.rows as any[]) {
    console.log(`ID: ${row.id.substring(0, 8)}`);
    console.log(`  Duration: ${row.duration_sec}s`);
    console.log(`  Transcript length: ${row.transcript_length} chars`);
    console.log(`  Transcript: ${row.ai_transcript?.substring(0, 300)}...`);
    if (row.ai_analysis) {
      console.log(`  AI Analysis: ${JSON.stringify(row.ai_analysis).substring(0, 200)}...`);
    }
    console.log('');
  }

  // 3. Check calls with "interested", "yes", "meeting", "demo" in transcript but not qualified
  console.log('\n--- 3. Calls with Interest Signals but NOT Qualified ---');
  const interestSignals = await db.execute(sql`
    SELECT 
      id,
      ai_disposition,
      duration_sec,
      SUBSTRING(ai_transcript FROM 1 FOR 800) as transcript_preview
    FROM call_sessions
    WHERE agent_type = 'ai'
      AND ai_transcript IS NOT NULL
      AND ai_disposition != 'qualified_lead'
      AND (
        LOWER(ai_transcript) LIKE '%interested%'
        OR LOWER(ai_transcript) LIKE '%sounds good%'
        OR LOWER(ai_transcript) LIKE '%tell me more%'
        OR LOWER(ai_transcript) LIKE '%send me%'
        OR LOWER(ai_transcript) LIKE '%schedule%'
        OR LOWER(ai_transcript) LIKE '%meeting%'
        OR LOWER(ai_transcript) LIKE '%demo%'
        OR LOWER(ai_transcript) LIKE '%follow up%'
      )
    ORDER BY duration_sec DESC
    LIMIT 10
  `);
  
  console.log(`Found ${interestSignals.rows.length} calls with interest signals not marked qualified:\n`);
  for (const row of interestSignals.rows as any[]) {
    console.log(`ID: ${row.id.substring(0, 8)}`);
    console.log(`  Current Disposition: ${row.ai_disposition}`);
    console.log(`  Duration: ${row.duration_sec}s`);
    console.log(`  Transcript Preview:`);
    console.log(`    ${row.transcript_preview?.substring(0, 400)}...`);
    console.log('');
  }

  // 4. Check calls marked no_answer that have transcripts (shouldn't happen)
  console.log('\n--- 4. Calls marked no_answer WITH transcripts (data inconsistency) ---');
  const noAnswerWithTranscript = await db.execute(sql`
    SELECT 
      id,
      ai_disposition,
      duration_sec,
      LENGTH(ai_transcript) as transcript_length,
      SUBSTRING(ai_transcript FROM 1 FOR 300) as transcript_preview
    FROM call_sessions
    WHERE ai_disposition = 'no_answer'
      AND ai_transcript IS NOT NULL
      AND LENGTH(ai_transcript) > 100
    ORDER BY LENGTH(ai_transcript) DESC
    LIMIT 10
  `);
  
  console.log(`Found ${noAnswerWithTranscript.rows.length} no_answer calls WITH transcripts:\n`);
  for (const row of noAnswerWithTranscript.rows as any[]) {
    console.log(`ID: ${row.id.substring(0, 8)} | Duration: ${row.duration_sec}s | Transcript: ${row.transcript_length} chars`);
    console.log(`  Preview: ${row.transcript_preview}...`);
  }

  // 5. Check disposition distribution by call duration
  console.log('\n--- 5. Disposition by Call Duration ---');
  const durationAnalysis = await db.execute(sql`
    SELECT 
      ai_disposition,
      CASE 
        WHEN duration_sec 2min)'
      END as duration_bucket,
      COUNT(*) as count,
      AVG(duration_sec)::int as avg_duration,
      AVG(LENGTH(COALESCE(ai_transcript, '')))::int as avg_transcript_length
    FROM call_sessions
    WHERE agent_type = 'ai'
      AND ai_disposition IS NOT NULL
    GROUP BY ai_disposition, duration_bucket
    ORDER BY ai_disposition, duration_bucket
  `);
  
  console.log('Disposition breakdown by duration:\n');
  let currentDisp = '';
  for (const row of durationAnalysis.rows as any[]) {
    if (row.ai_disposition !== currentDisp) {
      currentDisp = row.ai_disposition;
      console.log(`\n${currentDisp}:`);
    }
    console.log(`  ${row.duration_bucket}: ${row.count} calls (avg ${row.avg_duration}s, avg transcript ${row.avg_transcript_length} chars)`);
  }

  // 6. Check the AI analysis field for patterns
  console.log('\n\n--- 6. AI Analysis Quality Check ---');
  const analysisCheck = await db.execute(sql`
    SELECT 
      ai_disposition,
      COUNT(*) as total,
      COUNT(ai_analysis) as with_analysis,
      COUNT(ai_transcript) as with_transcript
    FROM call_sessions
    WHERE agent_type = 'ai'
    GROUP BY ai_disposition
    ORDER BY total DESC
  `);
  
  console.log('Calls with AI analysis by disposition:\n');
  for (const row of analysisCheck.rows as any[]) {
    const r = row as any;
    console.log(`${r.ai_disposition}: ${r.total} total | ${r.with_analysis} with analysis | ${r.with_transcript} with transcript`);
  }

  process.exit(0);
}

investigate().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});