/**
 * Analyze why some calls have no transcripts
 */

import { db } from '../server/db';
import { callSessions, callQualityRecords } from '../shared/schema';
import { sql, isNull, isNotNull, count, desc, eq, and } from 'drizzle-orm';

async function analyze() {
  // Get overall stats - Note: transcript is aiTranscript in schema
  const [total] = await db.select({ c: count() }).from(callSessions);
  const [withTranscript] = await db.select({ c: count() }).from(callSessions).where(isNotNull(callSessions.aiTranscript));
  const [withRecording] = await db.select({ c: count() }).from(callSessions).where(isNotNull(callSessions.recordingUrl));
  
  console.log('=== CALL SESSION STATS ===');
  console.log('Total sessions:', total.c);
  console.log('With transcript:', withTranscript.c);
  console.log('With recording URL:', withRecording.c);
  console.log('Missing transcripts:', total.c - withTranscript.c);
  
  // Check recent calls without transcripts
  const recentNoTranscript = await db.select({
    id: callSessions.id,
    status: callSessions.status,
    duration: callSessions.durationSec,
    recordingUrl: callSessions.recordingUrl,
    createdAt: callSessions.createdAt,
    disposition: callSessions.aiDisposition
  })
  .from(callSessions)
  .where(isNull(callSessions.aiTranscript))
  .orderBy(desc(callSessions.createdAt))
  .limit(15);
  
  console.log('\n=== RECENT CALLS WITHOUT TRANSCRIPT ===');
  for (const c of recentNoTranscript) {
    const created = c.createdAt ? c.createdAt.toISOString().slice(0,16) : 'N/A';
    const status = (c.status || 'null').padEnd(12);
    const disp = (c.disposition || 'null').padEnd(15);
    const dur = String(c.duration || 0).padStart(3);
    const rec = c.recordingUrl ? 'YES' : 'NO ';
    console.log(`[${created}] status:${status} disp:${disp} dur:${dur}s rec:${rec}`);
  }
  
  // Analyze by disposition
  const byDisposition = await db.execute(sql`
    SELECT ai_disposition as disposition, 
           COUNT(*) as total,
           COUNT(ai_transcript) as with_transcript,
           COUNT(*) - COUNT(ai_transcript) as missing_transcript
    FROM call_sessions 
    GROUP BY ai_disposition
    ORDER BY missing_transcript DESC
    LIMIT 10
  `);
  
  console.log('\n=== MISSING TRANSCRIPTS BY DISPOSITION ===');
  for (const r of byDisposition.rows as any[]) {
    const disp = (r.disposition || 'null').padEnd(20);
    const tot = String(r.total).padStart(4);
    const miss = String(r.missing_transcript).padStart(4);
    console.log(`${disp} total:${tot} missing:${miss}`);
  }
  
  // Check quality records
  const [qualityTotal] = await db.select({ c: count() }).from(callQualityRecords);
  const [qualityWithTranscript] = await db.select({ c: count() }).from(callQualityRecords).where(isNotNull(callQualityRecords.fullTranscript));
  
  console.log('\n=== QUALITY RECORDS ===');
  console.log('Total:', qualityTotal.c);
  console.log('With full transcript:', qualityWithTranscript.c);
  
  // Analyze calls with recordings but no transcript
  const recButNoTranscript = await db.select({
    id: callSessions.id,
    status: callSessions.status,
    duration: callSessions.durationSec,
    recordingUrl: callSessions.recordingUrl,
    createdAt: callSessions.createdAt,
    disposition: callSessions.aiDisposition
  })
  .from(callSessions)
  .where(and(
    isNull(callSessions.aiTranscript),
    isNotNull(callSessions.recordingUrl)
  ))
  .orderBy(desc(callSessions.createdAt))
  .limit(10);
  
  console.log('\n=== CALLS WITH RECORDING BUT NO TRANSCRIPT ===');
  console.log(`Found ${recButNoTranscript.length} calls with recordings that could be transcribed`);
  for (const c of recButNoTranscript) {
    const created = c.createdAt ? c.createdAt.toISOString().slice(0,16) : 'N/A';
    const disp = (c.disposition || 'null').padEnd(15);
    const dur = String(c.duration || 0).padStart(3);
    console.log(`[${created}] disp:${disp} dur:${dur}s`);
  }
  
  // Check why transcripts are missing - by duration
  const byDuration = await db.execute(sql`
    SELECT 
      CASE 
        WHEN duration_sec IS NULL THEN 'null'
        WHEN duration_sec  0 ? Math.round(r.with_transcript / r.total * 100) : 0;
    console.log(`${bucket} total:${tot} with_transcript:${with_t} (${pct}%)`);
  }
  
  process.exit(0);
}

analyze();