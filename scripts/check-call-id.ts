
import { db } from '../server/db';
import { dialerCallAttempts } from '../shared/schema';
import { eq } from 'drizzle-orm';

async function checkCall() {
  const callId = '08eaccd3-f7c4-4c0a-8fc9-0b47d1206682';
  console.log(`Checking call ID: ${callId}`);
  const call = await db.query.dialerCallAttempts.findFirst({
    where: eq(dialerCallAttempts.telnyxCallId, callId),
  });
  console.log('Call found:', call);
}

checkCall();
