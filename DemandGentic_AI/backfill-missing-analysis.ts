import 'dotenv/config';
import { db } from './server/db';
import { callSessions, campaigns } from './shared/schema';
import { isNotNull, isNull, and, gt, desc, eq, sql } from 'drizzle-orm';
import { analyzeConversationQuality } from './server/services/conversation-quality-analyzer';

async function main() {
  console.log("🚀 Starting cleanup/backfill for missing Conversation Quality...");

  // Select calls from the last 24 hours (or just recent ones)
  // that have a transcript > 15 chars, but NO analysis
  const recentCalls = await db
    .select()
    .from(callSessions)
    .where(
      and(
        isNotNull(callSessions.aiTranscript),
        isNull(callSessions.aiAnalysis)
      )
    )
    .orderBy(desc(callSessions.startedAt))
    .limit(500);

  console.log(`Found ${recentCalls.length} calls with transcript but no analysis.`);

  let processed = 0;
  let errors = 0;
  let skipped = 0;

  for (const session of recentCalls) {
    const transcript = session.aiTranscript || "";
    
    if (transcript.length  setTimeout(r, 100));

    } catch (err) {
      console.error(`  Error processing session ${session.id}:`, err);
      errors++;
    }
  }

  console.log("\nDone!");
  console.log(`Processed: ${processed}`);
  console.log(`Skipped (too short): ${skipped}`);
  console.log(`Errors: ${errors}`);
  
  process.exit(0);
}

main().catch(err => {
  console.error("Fatal error:", err);
  process.exit(1);
});