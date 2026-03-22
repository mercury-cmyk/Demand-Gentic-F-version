import { db } from "../server/db";
import { callSessions } from "@shared/schema";
import { desc, isNotNull, sql } from "drizzle-orm";

async function checkConversationQuality() {
  console.log("🔍 Checking conversation quality data in database...\n");

  // Check total call sessions
  const totalSessions = await db.select({ count: sql`count(*)` })
    .from(callSessions);
  console.log(`Total call sessions: ${totalSessions[0].count}`);

  // Check sessions with ai_analysis
  const withAnalysis = await db.select({ count: sql`count(*)` })
    .from(callSessions)
    .where(isNotNull(callSessions.aiAnalysis));
  console.log(`Sessions with ai_analysis: ${withAnalysis[0].count}`);

  // Check sessions with transcripts
  const withTranscripts = await db.select({ count: sql`count(*)` })
    .from(callSessions)
    .where(isNotNull(callSessions.aiTranscript));
  console.log(`Sessions with transcripts: ${withTranscripts[0].count}`);

  // Check recent sessions with ai_analysis
  const recentSessions = await db.select({
    id: callSessions.id,
    campaignId: callSessions.campaignId,
    aiAnalysis: callSessions.aiAnalysis,
    aiDisposition: callSessions.aiDisposition,
    createdAt: callSessions.createdAt,
  })
    .from(callSessions)
    .where(isNotNull(callSessions.aiAnalysis))
    .orderBy(desc(callSessions.createdAt))
    .limit(5);

  console.log(`\n📊 Recent sessions with ai_analysis (last 5):`);
  for (const session of recentSessions) {
    const analysis = session.aiAnalysis as any;
    const hasConversationQuality = analysis?.conversationQuality !== undefined;
    const qualityScore = analysis?.conversationQuality?.overallScore;
    
    console.log(`\nSession ID: ${session.id}`);
    console.log(`  Campaign ID: ${session.campaignId}`);
    console.log(`  Created: ${session.createdAt}`);
    console.log(`  Disposition: ${session.aiDisposition}`);
    console.log(`  Has conversationQuality: ${hasConversationQuality}`);
    if (hasConversationQuality) {
      console.log(`  Quality Score: ${qualityScore}`);
      console.log(`  Quality Keys: ${Object.keys(analysis.conversationQuality || {}).join(', ')}`);
    } else {
      console.log(`  Analysis Keys: ${Object.keys(analysis || {}).join(', ')}`);
    }
  }

  process.exit(0);
}

checkConversationQuality().catch((error) => {
  console.error("❌ Error:", error);
  process.exit(1);
});