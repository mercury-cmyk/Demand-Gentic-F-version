import { db } from './server/db';
import { callSessions } from './shared/schema';
import { desc, inArray } from 'drizzle-orm';

async function check() {
  const sessions = await db.select({
    id: callSessions.id,
    disposition: callSessions.aiDisposition,
    durationSec: callSessions.durationSec,
    transcript: callSessions.aiTranscript,
    startedAt: callSessions.startedAt
  }).from(callSessions)
    .where(inArray(callSessions.aiDisposition, ['Completed', 'Not Interested', 'Gatekeeper Block', 'Callback Requested', 'qualified']))
    .orderBy(desc(callSessions.startedAt))
    .limit(3);
  
  console.log('Sessions with real conversations:', sessions.length);
  
  for (const s of sessions) {
    console.log(`\n=== ID: ${s.id} ===`);
    console.log(`Duration: ${s.durationSec}s | Disp: ${s.disposition}`);
    console.log('Transcript (first 1500 chars):');
    console.log(s.transcript?.substring(0, 1500));
    console.log('---');
  }
  
  process.exit(0);
}
check();
