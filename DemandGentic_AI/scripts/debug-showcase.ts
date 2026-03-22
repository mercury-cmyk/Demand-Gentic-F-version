import { db } from "../server/db";
import { callQualityRecords, callSessions } from "@shared/schema";
import { eq, and, isNotNull, sql, gte, count } from "drizzle-orm";

async function checkShowcaseCounts() {
  console.log("Checking Showcase Calls counts...");

  // 1. Total Call Quality Records
  const [totalQuality] = await db
    .select({ count: count() })
    .from(callQualityRecords);
  console.log(`Total Call Quality Records: ${totalQuality.count}`);

  // 2. Currently Pinned Showcase Calls
  const [pinned] = await db
    .select({ count: count() })
    .from(callQualityRecords)
    .where(eq(callQualityRecords.isShowcase, true));
  console.log(`Pinned Showcase Calls (isShowcase=true): ${pinned.count}`);

  // 3. Candidates (matching auto-detect logic approximate)
  // Replicating the logic from showcase-calls-routes.ts
  const NON_CONVERSATION_DISPOSITIONS = [
    'voicemail', 'no_answer', 'no answer', 'no contact', 'no_contact',
    'busy', 'invalid_data', 'wrong_number', 'disconnected',
    'system failure', 'system_failure', 'system error', 'system_error',
    'technical issue', 'technical_issue', 'unknown', 'needs_review',
    'dnc-request', 'dnc_request', 'do_not_call', 'removed',
    'answering machine', 'reached voicemail', 'fax', 'callback',
  ];

  const realConversationFilter = sql`(
    LOWER(COALESCE(${callQualityRecords.assignedDisposition}, '')) NOT IN (${sql.join(
      NON_CONVERSATION_DISPOSITIONS.map(d => sql`${d}`),
      sql`, `
    )})
    AND LOWER(COALESCE(${callQualityRecords.assignedDisposition}, '')) NOT LIKE '%voicemail%'
    AND LOWER(COALESCE(${callQualityRecords.assignedDisposition}, '')) NOT LIKE '%no answer%'
    AND LOWER(COALESCE(${callQualityRecords.assignedDisposition}, '')) NOT LIKE '%no_answer%'
    AND LOWER(COALESCE(${callQualityRecords.assignedDisposition}, '')) NOT LIKE '%system%'
    AND LOWER(COALESCE(${callQualityRecords.assignedDisposition}, '')) NOT LIKE '%fax%'
    AND LOWER(COALESCE(${callQualityRecords.assignedDisposition}, '')) NOT LIKE '%answering machine%'
  )`;

  const agentPerformaceScore = sql`(
    COALESCE(${callQualityRecords.engagementScore}, 0) * 0.20 +
    COALESCE(${callQualityRecords.clarityScore}, 0) * 0.20 +
    COALESCE(${callQualityRecords.empathyScore}, 0) * 0.25 +
    COALESCE(${callQualityRecords.objectionHandlingScore}, 0) * 0.20 +
    COALESCE(${callQualityRecords.flowComplianceScore}, 0) * 0.15
  )`;

  const [candidates] = await db
    .select({ count: count() })
    .from(callQualityRecords)
    .innerJoin(callSessions, eq(callQualityRecords.callSessionId, callSessions.id))
    .where(and(
        sql`(${callQualityRecords.isShowcase} IS NULL OR ${callQualityRecords.isShowcase} = false)`,
        eq(callSessions.recordingStatus, 'stored'),
        isNotNull(callQualityRecords.fullTranscript),
        realConversationFilter,
        gte(callQualityRecords.engagementScore, 20),
        gte(callSessions.durationSec, 30),
        sql`${agentPerformaceScore} >= 75`
    ));
  
  console.log(`Potential Candidates (Score >= 75, >30s, Real Convo): ${candidates.count}`);

  // 4. Breakdown of filters
  console.log("\n--- Breakdown ---");

  // Base: Duration & Recording
  const [base] = await db
    .select({ count: count() })
    .from(callQualityRecords)
    .innerJoin(callSessions, eq(callQualityRecords.callSessionId, callSessions.id))
    .where(and(
        gte(callSessions.durationSec, 30),
        eq(callSessions.recordingStatus, 'stored')
    ));
  console.log(`Base (Duration > 30s + Recording): ${base.count}`);

  // + Real Conversation
  const [step1] = await db
    .select({ count: count() })
    .from(callQualityRecords)
    .innerJoin(callSessions, eq(callQualityRecords.callSessionId, callSessions.id))
    .where(and(
        gte(callSessions.durationSec, 30),
        eq(callSessions.recordingStatus, 'stored'),
        realConversationFilter
    ));
  console.log(`+ Real Conversation Disposition: ${step1.count}`);

  // + Engagement
  const [step2] = await db
    .select({ count: count() })
    .from(callQualityRecords)
    .innerJoin(callSessions, eq(callQualityRecords.callSessionId, callSessions.id))
    .where(and(
        gte(callSessions.durationSec, 30),
        eq(callSessions.recordingStatus, 'stored'),
        realConversationFilter,
        gte(callQualityRecords.engagementScore, 20)
    ));
  console.log(`+ Engagement Score >= 20: ${step2.count}`);

  // + Performance Score
  const [step3] = await db
    .select({ count: count() })
    .from(callQualityRecords)
    .innerJoin(callSessions, eq(callQualityRecords.callSessionId, callSessions.id))
    .where(and(
        gte(callSessions.durationSec, 30),
        eq(callSessions.recordingStatus, 'stored'),
        realConversationFilter,
        gte(callQualityRecords.engagementScore, 20),
        sql`${agentPerformaceScore} >= 75`
    ));
  console.log(`+ Agent Score >= 75: ${step3.count}`);
  
  // + Transcript Check
  const [step4] = await db
    .select({ count: count() })
    .from(callQualityRecords)
    .innerJoin(callSessions, eq(callQualityRecords.callSessionId, callSessions.id))
    .where(and(
        gte(callSessions.durationSec, 30),
        eq(callSessions.recordingStatus, 'stored'),
        realConversationFilter,
        gte(callQualityRecords.engagementScore, 20),
        sql`${agentPerformaceScore} >= 75`,
        isNotNull(callQualityRecords.fullTranscript)
    ));
    console.log(`+ Full Transcript != NULL: ${step4.count}`);

  process.exit(0);
}

checkShowcaseCounts().catch(console.error);