
import { db } from './server/db';
import { callSessions, campaigns } from './shared/schema';
import { count, isNotNull, sql, eq } from 'drizzle-orm';

async function checkData() {
  console.log("Checking call_sessions data...");

  const totalSessions = await db.select({ count: count() }).from(callSessions);
  console.log(`Total Call Sessions: ${totalSessions[0].count}`);

  const withAnalysis = await db.select({ count: count() })
    .from(callSessions)
    .where(isNotNull(callSessions.aiAnalysis));
  console.log(`Sessions with aiAnalysis: ${withAnalysis[0].count}`);

  const withTranscript = await db.select({ count: count() })
    .from(callSessions)
    .where(isNotNull(callSessions.aiTranscript));
  console.log(`Sessions with aiTranscript: ${withTranscript[0].count}`);

  // Sample analysis content
  const sample = await db.select({ 
    id: callSessions.id, 
    analysis: callSessions.aiAnalysis 
  })
  .from(callSessions)
  .where(isNotNull(callSessions.aiAnalysis))
  .limit(1);

  if (sample.length > 0) {
    console.log("\nSample Analysis JSON keys:", Object.keys(sample[0].analysis as object));
    console.log("Sample Analysis content:", JSON.stringify(sample[0].analysis, null, 2).substring(0, 500) + "...");
  } else {
    console.log("\nNo analysis data found.");
  }

  process.exit(0);
}

checkData().catch(err => {
  console.error(err);
  process.exit(1);
});
