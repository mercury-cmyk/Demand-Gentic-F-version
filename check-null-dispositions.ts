import { db } from './server/db';
import { callSessions } from './shared/schema';
import { sql, isNull, desc } from 'drizzle-orm';

async function check() {
  try {
    // Get sample of calls with NULL disposition
    console.log('=== CALLS WITH NULL DISPOSITION ===\n');

    const nullCalls = await db.select({
      id: callSessions.id,
      status: callSessions.status,
      aiDisposition: callSessions.aiDisposition,
      durationSec: callSessions.durationSec,
      startedAt: callSessions.startedAt,
      aiTranscript: callSessions.aiTranscript,
      agentType: callSessions.agentType,
      aiAgentId: callSessions.aiAgentId,
    }).from(callSessions)
      .where(isNull(callSessions.aiDisposition))
      .orderBy(desc(callSessions.startedAt))
      .limit(10);

    console.log('Sample of calls with NULL disposition:');
    nullCalls.forEach((call: any) => {
      console.log('Call: ' + call.id);
      console.log('  Status: ' + call.status);
      console.log('  Duration: ' + (call.durationSec || 0) + 's');
      console.log('  AgentType: ' + call.agentType);
      console.log('  AIAgent: ' + call.aiAgentId);
      console.log('  Started: ' + call.startedAt);
      if (call.aiTranscript) {
        console.log('  Transcript: ' + call.aiTranscript.substring(0, 100));
      } else {
        console.log('  Transcript: NONE');
      }
      console.log('');
    });

    // Get breakdown by status for NULL disposition calls
    const statusBreakdown = await db.select({
      status: callSessions.status,
      count: sql`count(*)::int`,
    }).from(callSessions)
      .where(isNull(callSessions.aiDisposition))
      .groupBy(callSessions.status);

    console.log('NULL disposition calls by status:');
    statusBreakdown.forEach((s: any) => {
      console.log('  ' + s.status + ': ' + s.count);
    });

  } catch (e: any) {
    console.error('Error:', e.message);
  }
  process.exit(0);
}

check();
