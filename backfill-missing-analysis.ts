
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
    
    if (transcript.length <= 15) {
      // console.log(`Skipping session ${session.id} - transcript too short (${transcript.length})`);
      skipped++;
      continue;
    }

    try {
      console.log(`Analyzing session ${session.id} (${transcript.length} chars)...`);
      
      const result = await analyzeConversationQuality({
        transcript,
        interactionType: 'live_call', // or 'outbound_call'
        analysisStage: 'post_call',
        callDurationSeconds: session.durationSec || 0,
        disposition: session.aiDisposition || undefined,
        campaignId: session.campaignId || undefined,
      });

      if ((result as any).status === 'error') {
        console.error(`  Failed analysis: ${(result as any).failureReason}`);
        errors++;
        continue;
      }

      // Update the record
      await db.update(callSessions)
        .set({
          aiAnalysis: {
            conversationQuality: {
              overallScore: result.overallScore,
              summary: result.summary,
              qualityDimensions: result.qualityDimensions,
              campaignAlignment: result.campaignAlignment,
              dispositionReview: result.dispositionReview,
              issues: result.issues,
              recommendations: result.recommendations,
              breakdowns: result.breakdowns,
              performanceGaps: result.performanceGaps,
              flowCompliance: result.flowCompliance,
              learningSignals: result.learningSignals,
              nextBestActions: result.nextBestActions,
              promptUpdates: result.promptUpdates,
              metadata: {
                 model: 'deepseek-chat',
                 analyzedAt: new Date().toISOString(),
                 version: '1.0.0'
              }
            }
          }
        })
        .where(eq(callSessions.id, session.id));
      
      console.log(`  ✅ Updated session ${session.id} (Score: ${result.overallScore})`);
      processed++;
      
      // Delay slightly to avoid rate limits if any
      await new Promise(r => setTimeout(r, 100));

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
