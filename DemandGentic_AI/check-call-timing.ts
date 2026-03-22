import { db } from './server/db';
import { dialerCallAttempts } from '@shared/schema';
import { eq, and } from 'drizzle-orm';

async function checkCallTiming() {
  const samples = await db.select({
    id: dialerCallAttempts.id,
    callStartedAt: dialerCallAttempts.callStartedAt,
    callEndedAt: dialerCallAttempts.callEndedAt,
    callDurationSeconds: dialerCallAttempts.callDurationSeconds,
    disposition: dialerCallAttempts.disposition,
    dispositionSubmittedAt: dialerCallAttempts.dispositionSubmittedAt,
    connected: dialerCallAttempts.connected,
    humanAgentId: dialerCallAttempts.humanAgentId,
    createdAt: dialerCallAttempts.createdAt,
  })
  .from(dialerCallAttempts)
  .where(and(
    eq(dialerCallAttempts.disposition, 'qualified_lead'),
    eq(dialerCallAttempts.dispositionProcessed, false)
  ))
  .limit(5);

  console.log('Sample Qualified Leads with Timing Details:');
  console.log(JSON.stringify(samples, null, 2));
}

checkCallTiming().then(() => process.exit(0));