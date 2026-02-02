import { db } from './server/db';
import { callSessions } from './shared/schema';
import { desc, sql, gt } from 'drizzle-orm';

async function check() {
  // Find sessions with substantial transcripts (over 200 chars)
  const sessions = await db.select({
    id: callSessions.id,
    transcriptLen: sql<number>`COALESCE(LENGTH(ai_transcript), 0)`,
    disposition: callSessions.aiDisposition,
    status: callSessions.status,
    durationSec: callSessions.durationSec,
    transcript: callSessions.aiTranscript
  }).from(callSessions)
    .where(gt(sql`LENGTH(ai_transcript)`, 200))
    .orderBy(desc(callSessions.startedAt))
    .limit(5);
  
  console.log('Sessions with substantial transcripts (>200 chars):', sessions.length);
  
  for (const s of sessions) {
    console.log(`\nID: ${s.id.substring(0,8)} | Duration: ${s.durationSec}s | Disp: ${s.disposition} | ${s.transcriptLen} chars`);
    console.log('--- Transcript Preview ---');
    console.log(s.transcript?.substring(0, 800));
    console.log('---');
  }
  
  // Check disposition breakdown
  const byDisp = await db.execute(sql`
    SELECT ai_disposition, COUNT(*) as count, AVG(LENGTH(ai_transcript)) as avg_len
    FROM call_sessions
    WHERE ai_transcript IS NOT NULL
    GROUP BY ai_disposition
    ORDER BY count DESC
    LIMIT 10
  `);
  console.log('\nTranscript length by disposition:');
  console.log(byDisp.rows);
  
  process.exit(0);
}
check();
