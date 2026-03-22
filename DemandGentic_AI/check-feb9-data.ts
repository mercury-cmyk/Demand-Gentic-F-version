import { db } from './server/db';
import { callSessions, callQualityRecords } from './shared/schema';
import { sql, eq, and, gte, lt, desc } from 'drizzle-orm';

async function checkData() {
  const date = '2026-02-09';
  const startOfDay = new Date(`${date}T00:00:00.000Z`);
  const endOfDay = new Date(`${date}T23:59:59.999Z`);

  console.log(`Checking data for ${date}...`);

  const totalCalls = await db.select({ count: sql`count(*)` })
    .from(callSessions)
    .where(and(
        gte(callSessions.startedAt, startOfDay),
        lt(callSessions.startedAt, endOfDay)
    ));

  console.log(`Total calls for ${date}: ${totalCalls[0].count}`);

  const callsWithAnalysis = await db.select({ count: sql`count(*)` })
    .from(callSessions)
    .where(and(
        gte(callSessions.startedAt, startOfDay),
        lt(callSessions.startedAt, endOfDay),
        sql`ai_analysis IS NOT NULL`
    ));
    
  console.log(`Calls with Analysis populated: ${callsWithAnalysis[0].count}`);

  const callsWithTranscript = await db.select({ count: sql`count(*)` })
    .from(callSessions)
    .where(and(
        gte(callSessions.startedAt, startOfDay),
        lt(callSessions.startedAt, endOfDay),
        sql`ai_transcript IS NOT NULL`
    ));

  console.log(`Calls with Transcript populated: ${callsWithTranscript[0].count}`);
  
  // Check quality records by joining
  const qualityRecordsCount = await db.select({ count: sql`count(*)` })
    .from(callQualityRecords)
    .innerJoin(callSessions, eq(callQualityRecords.callSessionId, callSessions.id))
    .where(and(
        gte(callSessions.startedAt, startOfDay),
        lt(callSessions.startedAt, endOfDay)
    ));

  console.log(`Call Quality Records linked to ${date} calls: ${qualityRecordsCount[0].count}`);

}

checkData().catch(console.error).finally(() => process.exit(0));