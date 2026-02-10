
import { db } from './server/db';
import { callSessions, callQualityRecords } from './shared/schema';
import { eq, and, gte, lt, isNull } from 'drizzle-orm';

async function checkLink() {
  const date = '2026-02-09';
  const startOfDay = new Date(`${date}T00:00:00.000Z`);
  const endOfDay = new Date(`${date}T23:59:59.999Z`);

  console.log(`Checking calls for ${date} with NULL analysis...`);

  const calls = await db.select({
      id: callSessions.id,
      analysis: callSessions.aiAnalysis
  })
  .from(callSessions)
  .where(and(
      gte(callSessions.startedAt, startOfDay),
      lt(callSessions.startedAt, endOfDay),
      isNull(callSessions.aiAnalysis)
  ))
  .limit(5);

  console.log(`Found ${calls.length} calls with NULL analysis.`);

  for (const call of calls) {
      console.log(`Checking quality record for session ${call.id}...`);
      const qr = await db.select({
          id: callQualityRecords.id,
          overallScore: callQualityRecords.overallQualityScore
      })
      .from(callQualityRecords)
      .where(eq(callQualityRecords.callSessionId, call.id));
      
      console.log(`Found ${qr.length} quality records for session ${call.id}.`);
      if (qr.length > 0) console.log(qr[0]);
  }
}

checkLink().catch(console.error).finally(() => process.exit(0));
