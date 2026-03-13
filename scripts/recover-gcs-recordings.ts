
import { db } from "../server/db";
import { callSessions } from "@shared/schema";
import { gt, and, isNotNull, isNull, desc, eq, or } from "drizzle-orm";
// We import the bucket from storage to check file existence
import { BUCKET, s3ObjectExists } from "../server/lib/storage";
import { runPostCallAnalysis } from "../server/services/post-call-analyzer";
import { Storage } from "@google-cloud/storage";

// Re-init storage here to ensure we have access (relying on env vars from storage.ts context usually)
const storage = new Storage({
  projectId: process.env.GCS_PROJECT_ID || process.env.GOOGLE_CLOUD_PROJECT,
});
const bucket = storage.bucket(BUCKET || 'demandgentic-prod-storage-2026');

async function main() {
  const threeDaysAgo = new Date();
  threeDaysAgo.setDate(threeDaysAgo.getDate() - 3);
  console.log(`Checking for orphan GCS recordings since ${threeDaysAgo.toISOString()}...`);
  console.log(`Target Bucket: ${bucket.name}`);

  // Find calls with NO recordingS3Key (or empty) but missing transcripts
  const calls = await db
    .select()
    .from(callSessions)
    .where(
        and(
            gt(callSessions.createdAt, threeDaysAgo),
            or(isNull(callSessions.recordingS3Key), eq(callSessions.recordingS3Key, ''))
        )
    )
    .orderBy(desc(callSessions.createdAt));

  console.log(`Found ${calls.length} calls without S3 Keys in DB.`);

  let recoveredCount = 0;
  let stillMissingCount = 0;

  for (const call of calls) {
      if (call.aiTranscript && call.aiTranscript.length > 50) continue; // Skip if already has transcript

      // Construct potential paths
      const pathsToCheck = [];
      
      // 1. Standard pattern: call-recordings/{campaignId}/{callId}.wav
      if (call.campaignId) {
          pathsToCheck.push(`call-recordings/${call.campaignId}/${call.id}.wav`);
          pathsToCheck.push(`call-recordings/${call.campaignId}/${call.id}.mp3`);
      }

      // 2. Fallback pattern: call-recordings/no-campaign/{callId}.wav
      pathsToCheck.push(`call-recordings/no-campaign/${call.id}.wav`);
      
      // 3. Root/Legacy: recordings/{callId}.wav
      pathsToCheck.push(`recordings/${call.id}.wav`);

      // 4. Just ID
      pathsToCheck.push(`${call.id}.wav`);

      let foundKey: string | null = null;

      for (const path of pathsToCheck) {
          try {
              const file = bucket.file(path);
              const [exists] = await file.exists();
              if (exists) {
                  foundKey = path;
                  break;
              }
          } catch (e) {
              // Ignore permission errors or similar during check
          }
      }

      if (foundKey) {
          console.log(`✅ FOUND recording for ${call.id} at: ${foundKey}`);
          
          // Update DB
          await db.update(callSessions)
            .set({ recordingS3Key: foundKey })
            .where(eq(callSessions.id, call.id));
          
          // Run Analysis
          console.log(`   ▶️ Triggering analysis...`);
          const result = await runPostCallAnalysis(call.id, {
             callDurationSec: call.durationSec || 0,
             disposition: call.aiDisposition || undefined,
             contactId: call.contactId || undefined,
             campaignId: call.campaignId || undefined
          });

          if (result.success) {
              console.log(`   ✅ Analysis Complete: ${result.metrics.totalTurns} turns.`);
              recoveredCount++;
          } else {
              console.error(`   ❌ Analysis Failed: ${result.error}`);
          }

      } else {
          console.log(`❌ Could not find recording for ${call.id} in GCS.`);
          stillMissingCount++;
      }
  }

  console.log(`\nRecovery Summary:`);
  console.log(`- Recovered & Analyzed: ${recoveredCount}`);
  console.log(`- Still Missing: ${stillMissingCount}`);
}

main().catch(console.error).finally(() => process.exit(0));
