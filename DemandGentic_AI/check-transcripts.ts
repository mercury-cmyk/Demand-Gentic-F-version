import { db } from './server/db';
import { callSessions } from './shared/schema';
import { desc, isNotNull, sql } from 'drizzle-orm';

async function check() {
  const sessions = await db.select({
    id: callSessions.id,
    transcriptLen: sql`COALESCE(LENGTH(ai_transcript), 0)`,
    disposition: callSessions.aiDisposition,
    status: callSessions.status,
    startedAt: callSessions.startedAt
  }).from(callSessions).orderBy(desc(callSessions.startedAt)).limit(15);
  
  console.log('Recent call sessions:');
  for (const s of sessions) {
    console.log(`ID: ${s.id.substring(0,8)} | Transcript: ${s.transcriptLen} chars | Disp: ${s.disposition || 'none'} | Status: ${s.status}`);
  }
  
  // Count sessions with transcripts
  const withTrans = await db.select({count: sql`COUNT(*)`})
    .from(callSessions)
    .where(isNotNull(callSessions.aiTranscript));
  console.log('\nTotal sessions with transcripts:', withTrans[0]?.count);

  // Get a sample transcript if exists
  const sample = await db.select({
    id: callSessions.id,
    transcript: callSessions.aiTranscript
  }).from(callSessions)
    .where(isNotNull(callSessions.aiTranscript))
    .orderBy(desc(callSessions.startedAt))
    .limit(1);
  
  if (sample.length > 0 && sample[0].transcript) {
    console.log('\n--- Sample transcript preview (first 500 chars) ---');
    console.log(sample[0].transcript.substring(0, 500));
  }
  
  process.exit(0);
}
check();