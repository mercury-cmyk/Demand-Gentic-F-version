import { db } from "./server/db";
import { callSessions, callQualityRecords } from "./shared/schema";
import { count, isNotNull, eq, and, desc, sql, gte } from "drizzle-orm";

async function checkRecordings() {
  console.log("Checking call sessions + quality records...");
  
  // Re-implement filters from routes
  const NON_CONVERSATION_DISPOSITIONS = [
    'voicemail', 'no_answer', 'no answer', 'no contact', 'no_contact',
    'busy', 'invalid_data', 'wrong_number', 'disconnected',
    'system failure', 'system_failure', 'system error', 'system_error',
    'technical issue', 'technical_issue', 'unknown', 'needs_review',
    'dnc-request', 'dnc_request', 'do_not_call', 'removed',
    'answering machine', 'reached voicemail', 'fax', 'callback',
  ];

  const realConv = sql`(
    LOWER(COALESCE(${callQualityRecords.assignedDisposition}, '')) NOT IN (${sql.join(
      NON_CONVERSATION_DISPOSITIONS.map(d => sql`${d}`),
      sql`, `
    )})
    AND LOWER(COALESCE(${callQualityRecords.assignedDisposition}, '')) NOT LIKE '%voicemail%'
    AND LOWER(COALESCE(${callQualityRecords.assignedDisposition}, '')) NOT LIKE '%no answer%'
    AND LOWER(COALESCE(${callQualityRecords.assignedDisposition}, '')) NOT LIKE '%no_answer%'
  )`;

  const filtered = await db.select({ count: count() })
    .from(callQualityRecords)
    .innerJoin(callSessions, eq(callQualityRecords.callSessionId, callSessions.id))
    .where(and(
      isNotNull(callQualityRecords.overallQualityScore),
      realConv,
      isNotNull(callQualityRecords.fullTranscript),
      gte(callSessions.durationSec, 30),
      eq(callSessions.recordingStatus, 'stored'),
      isNotNull(callSessions.recordingS3Key)
    ));
    
  console.log(`Filtered count matching showcase criteria: ${filtered[0].count}`);

  if (filtered[0].count === 0) {
      console.log("Debugging why 0...");
      const step1 = await db.select({ count: count() })
        .from(callQualityRecords)
        .innerJoin(callSessions, eq(callQualityRecords.callSessionId, callSessions.id))
        .where(and(eq(callSessions.recordingStatus, 'stored'), isNotNull(callSessions.recordingS3Key)));
      console.log(`Step 1 (Status=stored + S3Key): ${step1[0].count}`);

      const step2 = await db.select({ count: count() })
        .from(callQualityRecords)
        .innerJoin(callSessions, eq(callQualityRecords.callSessionId, callSessions.id))
        .where(and(
            eq(callSessions.recordingStatus, 'stored'), 
            isNotNull(callSessions.recordingS3Key),
            gte(callSessions.durationSec, 30)
        ));
      console.log(`Step 2 (Duration >= 30): ${step2[0].count}`);

      const step3 = await db.select({ count: count() })
        .from(callQualityRecords)
        .innerJoin(callSessions, eq(callQualityRecords.callSessionId, callSessions.id))
        .where(and(
            eq(callSessions.recordingStatus, 'stored'), 
            isNotNull(callSessions.recordingS3Key), 
            gte(callSessions.durationSec, 30),
            isNotNull(callQualityRecords.fullTranscript)
        ));
      console.log(`Step 3 (Full Transcript): ${step3[0].count}`);
  }
}

checkRecordings().catch(console.error).then(() => process.exit());