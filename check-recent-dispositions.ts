import { db } from './server/db';
import { dialerCallAttempts, callSessions } from './shared/schema';
import { desc, isNotNull, and, gte, eq } from 'drizzle-orm';

async function check() {
  // Look at last 4 hours
  const fourHoursAgo = new Date(Date.now() - 4 * 3600000);
  
  console.log('=== Recent Call Attempts (last 4 hours) ===\n');
  
  const recent = await db.select({
    id: dialerCallAttempts.id,
    disposition: dialerCallAttempts.disposition,
    callDurationSeconds: dialerCallAttempts.callDurationSeconds,
    connected: dialerCallAttempts.connected,
    callStartedAt: dialerCallAttempts.callStartedAt,
    notes: dialerCallAttempts.notes,
  })
  .from(dialerCallAttempts)
  .where(and(
    isNotNull(dialerCallAttempts.disposition),
    gte(dialerCallAttempts.callStartedAt, fourHoursAgo)
  ))
  .orderBy(desc(dialerCallAttempts.callStartedAt))
  .limit(20);
  
  // Count by disposition
  const dispositionCounts: Record<string, number> = {};
  for (const r of recent) {
    const disp = r.disposition || 'unknown';
    dispositionCounts[disp] = (dispositionCounts[disp] || 0) + 1;
  }
  
  console.log('Disposition breakdown:');
  for (const [disp, count] of Object.entries(dispositionCounts)) {
    console.log(`  ${disp}: ${count}`);
  }
  console.log('');
  
  for (const r of recent) {
    console.log(`Disposition: ${r.disposition}`);
    console.log(`  Duration: ${r.callDurationSeconds}s`);
    console.log(`  Connected: ${r.connected}`);
    console.log(`  Started: ${r.callStartedAt}`);
    console.log(`  Notes: ${(r.notes || 'none').substring(0, 150)}`);
    console.log('');
  }

  console.log('\n=== Call Sessions marked not_interested ===\n');

  const notInterestedSessions = await db.select({
    id: callSessions.id,
    aiDisposition: callSessions.aiDisposition,
    durationSec: callSessions.durationSec,
    aiTranscript: callSessions.aiTranscript,
    aiAnalysis: callSessions.aiAnalysis,
    startedAt: callSessions.startedAt,
  })
  .from(callSessions)
  .where(and(
    gte(callSessions.startedAt, fourHoursAgo),
    eq(callSessions.aiDisposition, 'not_interested')
  ))
  .orderBy(desc(callSessions.startedAt))
  .limit(5);
  
  for (const s of notInterestedSessions) {
    console.log(`Disposition: ${s.aiDisposition} | Duration: ${s.durationSec}s | Started: ${s.startedAt}`);
    console.log(`  Full Transcript:`);
    if (s.aiTranscript) {
      console.log(s.aiTranscript);
    } else {
      console.log(`    (no transcript)`);
    }
    if (s.aiAnalysis) {
      console.log(`  AI Analysis: ${JSON.stringify(s.aiAnalysis, null, 2)}`);
    }
    console.log('\n---\n');
  }
  
  process.exit(0);
}

check().catch(e => {
  console.error(e);
  process.exit(1);
});
