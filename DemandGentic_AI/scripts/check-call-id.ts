import { db } from '../server/db';
import { dialerCallAttempts } from '../shared/schema';
import { eq } from 'drizzle-orm';
import * as fs from 'fs';

import { leads } from '../shared/schema';

async function checkCall() {
  const checkId = '0083050d-822a-4081-9de3-337e28c3bee7'; 
  const logFile = 'scripts/check-result.txt';
  fs.writeFileSync(logFile, `Checking ID: ${checkId}\n`);
  
  const call = await db.query.dialerCallAttempts.findFirst({
    where: eq(dialerCallAttempts.telnyxCallId, checkId),
  });
  
  if (call) {
      fs.appendFileSync(logFile, `Found in dialerCallAttempts: ${JSON.stringify(call, null, 2)}\n`);
  } else {
      fs.appendFileSync(logFile, 'NOT found in dialerCallAttempts.\n');
  }

  const lead = await db.query.leads.findFirst({
      where: eq(leads.id, checkId),
  });
   if (lead) {
      fs.appendFileSync(logFile, `Found in leads: ${JSON.stringify(lead, null, 2)}\n`);
  } else {
      fs.appendFileSync(logFile, 'NOT found in leads.\n');
  }

  process.exit(0);
}

checkCall();