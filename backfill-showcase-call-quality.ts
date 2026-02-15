import "dotenv/config";
import { pool } from "./server/db";
import {
  analyzeConversationQuality,
  type ConversationQualityAnalysis,
} from "./server/services/conversation-quality-analyzer";

type CliOptions = {
  days: number;
  limit: number;
  concurrency: number;
  execute: boolean;
  forceReanalyze: boolean;
};

type Candidate = {
  callSessionId: string;
  campaignId: string | null;
  contactId: string | null;
  createdAt: string;
  durationSec: number | null;
  aiDisposition: string | null;
  transcript: string;
  sessionAiAnalysis: any;
};

type WorkResult =
  | { status: "skipped"; callSessionId: string; reason: string }
  | { status: "analyzed"; callSessionId: string; score: number; inserted: boolean }
  | { status: "failed"; callSessionId: string; reason: string };

const NON_HUMAN_DISPOSITIONS = [
  "voicemail",
  "no_answer",
  "no answer",
  "no contact",
  "no_contact",
  "busy",
  "fax",
  "answering_machine",
  "answering machine",
  "wrong_number",
  "disconnected",
  "invalid_data",
  "invalid data",
  "system_error",
  "system error",
  "technical_issue",
  "technical issue",
  "unavailable",
  "failed",
  "machine",
];

const VOICEMAIL_OR_IVR_TRANSCRIPT_REGEX =
  "(leave\\s+(a|your)\\s+message|after\\s+the\\s+(tone|beep)|forwarded\\s+to\\s+(an\\s+)?(automatic\\s+)?voice\\s+messaging|voicemail|voice\\s*mail|answering\\s+machine|mailbox(\\s+is\\s+full)?|please\\s+record\\s+your\\s+message|not\\s+available\\s+to\\s+take\\s+your\\s+call|currently\\s+unavailable|your\\s+call\\s+has\\s+been\\s+forwarded|cannot\\s+accept\\s+messages|is\\s+not\\s+available)";
const CALL_SCREENING_TRANSCRIPT_REGEX =
  "(calling\\s+assist\\s+by\\s+google|google\\s+call\\s+screening|screening\\s+service\\s+from\\s+google|this\\s+call\\s+is\\s+being\\s+screened|i\\s+try\\s+to\\s+connect\\s+you,?\\s+can\\s+i\\s+ask\\s+what\\s+you'?re\\s+calling\\s+about\\??)";

function parseArgs(argv: string[]): CliOptions {
  const getNum = (flag: string, fallback: number): number => {
    const idx = argv.findIndex((arg) => arg === flag);
    if (idx < 0) return fallback;
    const value = Number(argv[idx + 1]);
    return Number.isFinite(value) && value > 0 ? Math.floor(value) : fallback;
  };

  return {
    days: getNum("--days", 365),
    limit: getNum("--limit", 500),
    concurrency: Math.max(1, getNum("--concurrency", 3)),
    execute: argv.includes("--execute"),
    forceReanalyze: argv.includes("--force-reanalyze"),
  };
}

function extractConversationQuality(aiAnalysis: any): ConversationQualityAnalysis | null {
  if (!aiAnalysis || typeof aiAnalysis !== "object") return null;
  const cq = aiAnalysis.conversationQuality;
  if (!cq || typeof cq !== "object") return null;
  if (typeof cq.overallScore !== "number") return null;
  return cq as ConversationQualityAnalysis;
}

async function getCandidates(options: CliOptions): Promise<Candidate[]> {
  const result = await pool.query<Candidate>(
    `
      SELECT
        cs.id AS "callSessionId",
        cs.campaign_id AS "campaignId",
        cs.contact_id AS "contactId",
        cs.created_at AS "createdAt",
        cs.duration_sec AS "durationSec",
        cs.ai_disposition AS "aiDisposition",
        cs.ai_transcript AS "transcript",
        cs.ai_analysis AS "sessionAiAnalysis"
      FROM call_sessions cs
      LEFT JOIN call_quality_records cqr ON cqr.call_session_id = cs.id
      WHERE cs.agent_type = 'ai'
        AND cs.created_at >= NOW() - ($1::int * INTERVAL '1 day')
        AND cqr.id IS NULL
        AND cs.ai_transcript IS NOT NULL
        AND LENGTH(cs.ai_transcript) >= 80
        AND COALESCE(cs.duration_sec, 0) >= 20
        AND (
          cs.recording_status = 'stored'
          OR cs.recording_s3_key IS NOT NULL
        )
        AND cs.ai_transcript ~* '(agent|ai|assistant|bot)\\s*:'
        AND cs.ai_transcript ~* '(contact|customer|prospect|user|caller|human)\\s*:'
        AND LOWER(COALESCE(cs.ai_disposition, '')) NOT IN (${NON_HUMAN_DISPOSITIONS.map((_, i) => `$${i + 3}`).join(", ")})
        AND LOWER(COALESCE(cs.ai_disposition, '')) NOT LIKE '%voicemail%'
        AND LOWER(COALESCE(cs.ai_disposition, '')) NOT LIKE '%no answer%'
        AND LOWER(COALESCE(cs.ai_disposition, '')) NOT LIKE '%answering machine%'
        AND LOWER(COALESCE(cs.ai_disposition, '')) NOT LIKE '%fax%'
        AND LOWER(COALESCE(cs.ai_transcript, '')) !~* $${NON_HUMAN_DISPOSITIONS.length + 3}
        AND LOWER(COALESCE(cs.ai_transcript, '')) !~* $${NON_HUMAN_DISPOSITIONS.length + 4}
      ORDER BY cs.created_at DESC
      LIMIT $2
    `,
    [
      options.days,
      options.limit,
      ...NON_HUMAN_DISPOSITIONS,
      VOICEMAIL_OR_IVR_TRANSCRIPT_REGEX,
      CALL_SCREENING_TRANSCRIPT_REGEX,
    ],
  );

  return result.rows;
}

async function callQualityRecordExists(callSessionId: string): Promise<boolean> {
  const result = await pool.query(
    `SELECT 1 FROM call_quality_records WHERE call_session_id = $1 LIMIT 1`,
    [callSessionId],
  );
  return result.rowCount > 0;
}

async function insertQualityRecord(row: Candidate, analysis: ConversationQualityAnalysis): Promise<boolean> {
  const result = await pool.query(
    `
      INSERT INTO call_quality_records (
        call_session_id,
        campaign_id,
        contact_id,
        overall_quality_score,
        engagement_score,
        clarity_score,
        empathy_score,
        objection_handling_score,
        qualification_score,
        closing_score,
        sentiment,
        engagement_level,
        issues,
        recommendations,
        breakdowns,
        prompt_updates,
        performance_gaps,
        next_best_actions,
        campaign_alignment_score,
        context_usage_score,
        talking_points_coverage_score,
        missed_talking_points,
        flow_compliance_score,
        missed_steps,
        flow_deviations,
        assigned_disposition,
        expected_disposition,
        disposition_accurate,
        disposition_notes,
        transcript_length,
        transcript_truncated,
        full_transcript,
        analysis_model,
        analysis_stage,
        interaction_type,
        analyzed_at
      )
      VALUES (
        $1, $2, $3,
        $4, $5, $6, $7, $8, $9, $10,
        $11, $12,
        $13::jsonb, $14::jsonb, $15::jsonb, $16::jsonb, $17::jsonb, $18::jsonb,
        $19, $20, $21, $22::jsonb,
        $23, $24::jsonb, $25::jsonb,
        $26, $27, $28, $29::jsonb,
        $30, $31, $32,
        $33, 'post_call', 'live_call', NOW()
      )
    `,
    [
      row.callSessionId,
      row.campaignId,
      row.contactId,
      analysis.overallScore ?? null,
      analysis.qualityDimensions?.engagement ?? null,
      analysis.qualityDimensions?.clarity ?? null,
      analysis.qualityDimensions?.empathy ?? null,
      analysis.qualityDimensions?.objectionHandling ?? null,
      analysis.qualityDimensions?.qualification ?? null,
      analysis.qualityDimensions?.closing ?? null,
      analysis.learningSignals?.sentiment ?? null,
      analysis.learningSignals?.engagementLevel ?? null,
      JSON.stringify(analysis.issues || []),
      JSON.stringify(analysis.recommendations || []),
      JSON.stringify(analysis.breakdowns || []),
      JSON.stringify(analysis.promptUpdates || []),
      JSON.stringify(analysis.performanceGaps || []),
      JSON.stringify(analysis.nextBestActions || []),
      analysis.campaignAlignment?.objectiveAdherence ?? null,
      analysis.campaignAlignment?.contextUsage ?? null,
      analysis.campaignAlignment?.talkingPointsCoverage ?? null,
      JSON.stringify(analysis.campaignAlignment?.missedTalkingPoints || []),
      analysis.flowCompliance?.score ?? null,
      JSON.stringify(analysis.flowCompliance?.missedSteps || []),
      JSON.stringify(analysis.flowCompliance?.deviations || []),
      analysis.dispositionReview?.assignedDisposition ?? row.aiDisposition ?? null,
      analysis.dispositionReview?.expectedDisposition ?? null,
      analysis.dispositionReview?.isAccurate ?? null,
      JSON.stringify(analysis.dispositionReview?.notes || []),
      row.transcript.length,
      analysis.metadata?.truncated ?? false,
      row.transcript.slice(0, 12000),
      analysis.metadata?.model || "vertex-ai-gemini",
    ],
  );

  return result.rowCount > 0;
}

async function processOne(row: Candidate, options: CliOptions): Promise<WorkResult> {
  try {
    if (await callQualityRecordExists(row.callSessionId)) {
      return { status: "skipped", callSessionId: row.callSessionId, reason: "already-has-quality-record" };
    }

    let analysis = extractConversationQuality(row.sessionAiAnalysis);

    if (!analysis || options.forceReanalyze) {
      if (!options.execute) {
        return {
          status: "analyzed",
          callSessionId: row.callSessionId,
          score: analysis?.overallScore ?? 0,
          inserted: true,
        };
      }

      const analyzed = await analyzeConversationQuality({
        transcript: row.transcript,
        interactionType: "live_call",
        analysisStage: "post_call",
        callDurationSeconds: row.durationSec ?? undefined,
        disposition: row.aiDisposition ?? undefined,
        campaignId: row.campaignId ?? undefined,
      });

      if (analyzed.status !== "ok") {
        return {
          status: "failed",
          callSessionId: row.callSessionId,
          reason: analyzed.issues?.[0]?.description || "analysis-failed",
        };
      }

      analysis = analyzed;

      const mergedAiAnalysis = {
        ...(row.sessionAiAnalysis && typeof row.sessionAiAnalysis === "object" ? row.sessionAiAnalysis : {}),
        conversationQuality: analysis,
      };

      await pool.query(
        `UPDATE call_sessions SET ai_analysis = $1::jsonb WHERE id = $2`,
        [JSON.stringify(mergedAiAnalysis), row.callSessionId],
      );
    }

    if (!analysis) {
      return { status: "failed", callSessionId: row.callSessionId, reason: "no-analysis-produced" };
    }

    const inserted = options.execute ? await insertQualityRecord(row, analysis) : true;

    return {
      status: "analyzed",
      callSessionId: row.callSessionId,
      score: analysis.overallScore,
      inserted,
    };
  } catch (error: any) {
    return {
      status: "failed",
      callSessionId: row.callSessionId,
      reason: error?.message || "unknown-error",
    };
  }
}

async function main() {
  const options = parseArgs(process.argv.slice(2));

  console.log("==============================================");
  console.log("SHOWCASE CALL QUALITY BACKFILL (CALL SESSIONS)");
  console.log("==============================================");
  console.log(`Mode: ${options.execute ? "EXECUTE" : "DRY RUN"}`);
  console.log(`Days: last ${options.days}`);
  console.log(`Limit: ${options.limit}`);
  console.log(`Concurrency: ${options.concurrency}`);
  console.log(`Force reanalyze: ${options.forceReanalyze ? "yes" : "no"}`);
  console.log();

  const candidates = await getCandidates(options);
  console.log(`Candidates found: ${candidates.length}`);

  const withExistingAnalysis = candidates.filter((c) => extractConversationQuality(c.sessionAiAnalysis)).length;
  const needsModelAnalysis = candidates.length - withExistingAnalysis;
  console.log(`With existing conversationQuality: ${withExistingAnalysis}`);
  console.log(`Needs model analysis: ${needsModelAnalysis}`);
  console.log();

  if (candidates.length === 0) {
    await pool.end();
    return;
  }

  const stats = {
    analyzed: 0,
    inserted: 0,
    skipped: 0,
    failed: 0,
  };

  const queue = [...candidates];
  const workers = Array.from({ length: options.concurrency }, async () => {
    while (queue.length > 0) {
      const row = queue.shift();
      if (!row) break;
      const result = await processOne(row, options);

      if (result.status === "analyzed") {
        stats.analyzed += 1;
        if (result.inserted) stats.inserted += 1;
      } else if (result.status === "skipped") {
        stats.skipped += 1;
      } else {
        stats.failed += 1;
        console.log(`[FAILED] ${result.callSessionId}: ${result.reason}`);
      }
    }
  });

  await Promise.all(workers);

  console.log();
  console.log("==============================================");
  console.log("SUMMARY");
  console.log("==============================================");
  console.log(`Analyzed: ${stats.analyzed}`);
  console.log(`Inserted quality records: ${stats.inserted}`);
  console.log(`Skipped: ${stats.skipped}`);
  console.log(`Failed: ${stats.failed}`);
  console.log(`Mode: ${options.execute ? "EXECUTE" : "DRY RUN"}`);
  console.log("==============================================");

  await pool.end();
}

main().catch(async (error) => {
  console.error("Backfill failed:", error);
  await pool.end();
  process.exit(1);
});
