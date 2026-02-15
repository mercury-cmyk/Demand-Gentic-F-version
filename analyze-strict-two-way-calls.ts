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
  verbose: boolean;
  forceReanalyze: boolean;
};

type Candidate = {
  callAttemptId: string;
  callSessionId: string;
  campaignId: string | null;
  contactId: string | null;
  createdAt: string;
  callDurationSeconds: number | null;
  disposition: string | null;
  transcript: string;
  sessionAiAnalysis: any;
  hasQualityRecord: boolean;
};

type WorkResult =
  | { status: "skipped"; reason: string; callSessionId: string }
  | { status: "analyzed"; callSessionId: string; score: number; insertedQualityRecord: boolean }
  | { status: "quality_record_inserted"; callSessionId: string; score: number }
  | { status: "failed"; callSessionId: string; reason: string };

function parseArgs(argv: string[]): CliOptions {
  const getNum = (flag: string, fallback: number): number => {
    const idx = argv.findIndex((arg) => arg === flag);
    if (idx < 0) return fallback;
    const val = Number(argv[idx + 1]);
    return Number.isFinite(val) && val > 0 ? val : fallback;
  };

  return {
    days: Math.floor(getNum("--days", 3)),
    limit: Math.floor(getNum("--limit", 1500)),
    concurrency: Math.max(1, Math.floor(getNum("--concurrency", 3))),
    execute: argv.includes("--execute"),
    verbose: argv.includes("--verbose"),
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
        dca.id AS "callAttemptId",
        dca.call_session_id AS "callSessionId",
        dca.campaign_id AS "campaignId",
        dca.contact_id AS "contactId",
        dca.created_at AS "createdAt",
        dca.call_duration_seconds AS "callDurationSeconds",
        dca.disposition AS "disposition",
        dca.full_transcript AS "transcript",
        cs.ai_analysis AS "sessionAiAnalysis",
        EXISTS (
          SELECT 1
          FROM call_quality_records cqr
          WHERE cqr.call_session_id = dca.call_session_id
        ) AS "hasQualityRecord"
      FROM dialer_call_attempts dca
      JOIN call_sessions cs ON cs.id = dca.call_session_id
      WHERE dca.agent_type = 'ai'
        AND dca.created_at >= NOW() - ($1::int * INTERVAL '1 day')
        AND dca.call_session_id IS NOT NULL
        AND dca.full_transcript ILIKE '%Agent:%'
        AND dca.full_transcript ILIKE '%Contact:%'
      ORDER BY dca.created_at DESC
      LIMIT $2
    `,
    [options.days, options.limit]
  );

  return result.rows;
}

async function upsertQualityRecord(
  row: Candidate,
  analysis: ConversationQualityAnalysis
): Promise<boolean> {
  const existing = await pool.query(
    `SELECT 1 FROM call_quality_records WHERE call_session_id = $1 LIMIT 1`,
    [row.callSessionId]
  );
  if (existing.rowCount > 0) {
    return false;
  }

  const insertResult = await pool.query(
    `
      INSERT INTO call_quality_records (
        call_session_id,
        dialer_call_attempt_id,
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
        $1, $2, $3, $4,
        $5, $6, $7, $8, $9, $10, $11,
        $12, $13,
        $14::jsonb, $15::jsonb, $16::jsonb, $17::jsonb, $18::jsonb, $19::jsonb,
        $20, $21, $22, $23::jsonb,
        $24, $25::jsonb, $26::jsonb,
        $27, $28, $29, $30::jsonb,
        $31, $32, $33,
        $34, 'post_call', 'live_call', NOW()
      )
    `,
    [
      row.callSessionId,
      row.callAttemptId,
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
      analysis.dispositionReview?.assignedDisposition ?? row.disposition ?? null,
      analysis.dispositionReview?.expectedDisposition ?? null,
      analysis.dispositionReview?.isAccurate ?? null,
      JSON.stringify(analysis.dispositionReview?.notes || []),
      row.transcript.length,
      analysis.metadata?.truncated ?? false,
      row.transcript.slice(0, 12000),
      analysis.metadata?.model || "vertex-ai-gemini",
    ]
  );

  return insertResult.rowCount > 0;
}

async function processOne(row: Candidate, options: CliOptions): Promise<WorkResult> {
  try {
    const existingAnalysis = extractConversationQuality(row.sessionAiAnalysis);
    const alreadyComplete = existingAnalysis && row.hasQualityRecord;

    if (alreadyComplete && !options.forceReanalyze) {
      return { status: "skipped", reason: "already-analyzed-and-recorded", callSessionId: row.callSessionId };
    }

    // Dry-run preview mode: do not invoke model analysis APIs.
    if (!options.execute) {
      if (existingAnalysis && !row.hasQualityRecord && !options.forceReanalyze) {
        return {
          status: "quality_record_inserted",
          callSessionId: row.callSessionId,
          score: existingAnalysis.overallScore,
        };
      }
      return {
        status: "analyzed",
        callSessionId: row.callSessionId,
        score: existingAnalysis?.overallScore ?? 0,
        insertedQualityRecord: !row.hasQualityRecord,
      };
    }

    let analysis: ConversationQualityAnalysis | null = existingAnalysis;

    if (!analysis || options.forceReanalyze) {
      analysis = await analyzeConversationQuality({
        transcript: row.transcript,
        interactionType: "live_call",
        analysisStage: "post_call",
        callDurationSeconds: row.callDurationSeconds ?? undefined,
        disposition: row.disposition ?? undefined,
        campaignId: row.campaignId ?? undefined,
      });

      if (analysis.status !== "ok") {
        return {
          status: "failed",
          callSessionId: row.callSessionId,
          reason: analysis.issues?.[0]?.description || "analysis-failed",
        };
      }

      if (options.execute) {
        const mergedAiAnalysis = {
          ...(row.sessionAiAnalysis && typeof row.sessionAiAnalysis === "object" ? row.sessionAiAnalysis : {}),
          conversationQuality: analysis,
        };
        await pool.query(
          `UPDATE call_sessions SET ai_analysis = $1::jsonb WHERE id = $2`,
          [JSON.stringify(mergedAiAnalysis), row.callSessionId]
        );
      }
    }

    if (!analysis) {
      return { status: "failed", callSessionId: row.callSessionId, reason: "no-analysis-produced" };
    }

    let insertedQualityRecord = false;
    if (!row.hasQualityRecord || options.forceReanalyze) {
      if (options.execute) {
        insertedQualityRecord = await upsertQualityRecord(row, analysis);
      } else {
        insertedQualityRecord = !row.hasQualityRecord;
      }
    }

    if (existingAnalysis && !options.forceReanalyze && !row.hasQualityRecord) {
      return {
        status: "quality_record_inserted",
        callSessionId: row.callSessionId,
        score: analysis.overallScore,
      };
    }

    return {
      status: "analyzed",
      callSessionId: row.callSessionId,
      score: analysis.overallScore,
      insertedQualityRecord,
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
  console.log("STRICT TWO-WAY CALL ANALYSIS BACKFILL");
  console.log("==============================================");
  console.log(`Mode: ${options.execute ? "EXECUTE" : "DRY RUN"}`);
  console.log(`Days: last ${options.days}`);
  console.log(`Limit: ${options.limit}`);
  console.log(`Concurrency: ${options.concurrency}`);
  console.log(`Force reanalyze: ${options.forceReanalyze ? "yes" : "no"}`);
  console.log();

  const candidates = await getCandidates(options);
  console.log(`Strict two-way candidates found: ${candidates.length}`);

  const alreadyComplete = candidates.filter((c) => extractConversationQuality(c.sessionAiAnalysis) && c.hasQualityRecord).length;
  const missingAnalysis = candidates.filter((c) => !extractConversationQuality(c.sessionAiAnalysis)).length;
  const missingQualityRecord = candidates.filter((c) => !c.hasQualityRecord).length;

  console.log(`Already complete (analysis + quality record): ${alreadyComplete}`);
  console.log(`Missing conversationQuality: ${missingAnalysis}`);
  console.log(`Missing call_quality_record: ${missingQualityRecord}`);
  console.log();

  if (candidates.length === 0) {
    await pool.end();
    return;
  }

  let cursor = 0;
  let skipped = 0;
  let analyzed = 0;
  let qualityRecordInsertedOnly = 0;
  let failed = 0;
  let qualityRecordsInserted = 0;

  async function worker(workerId: number) {
    while (true) {
      const idx = cursor;
      cursor += 1;
      if (idx >= candidates.length) break;

      const row = candidates[idx];
      const result = await processOne(row, options);
      const prefix = `[${idx + 1}/${candidates.length}]`;

      if (result.status === "skipped") {
        skipped += 1;
        if (options.verbose) {
          console.log(`${prefix} skipped ${row.callSessionId} (${result.reason})`);
        }
      } else if (result.status === "quality_record_inserted") {
        qualityRecordInsertedOnly += 1;
        qualityRecordsInserted += 1;
        if (options.verbose) {
          console.log(`${prefix} inserted quality record from existing analysis ${row.callSessionId} score=${result.score}`);
        }
      } else if (result.status === "analyzed") {
        analyzed += 1;
        if (result.insertedQualityRecord) {
          qualityRecordsInserted += 1;
        }
        if (options.verbose) {
          console.log(
            `${prefix} analyzed ${row.callSessionId} score=${result.score} qualityRecordInserted=${result.insertedQualityRecord ? "yes" : "no"}`
          );
        }
      } else {
        failed += 1;
        console.log(`${prefix} failed ${row.callSessionId} (${result.reason})`);
      }
    }

    if (options.verbose) {
      console.log(`Worker ${workerId} complete`);
    }
  }

  const workers = Array.from({ length: options.concurrency }, (_, i) => worker(i + 1));
  await Promise.all(workers);

  console.log();
  console.log("==============================================");
  console.log("SUMMARY");
  console.log("==============================================");
  console.log(`Analyzed with model: ${analyzed}`);
  console.log(`Inserted quality record from existing analysis: ${qualityRecordInsertedOnly}`);
  console.log(`Total quality records inserted: ${qualityRecordsInserted}`);
  console.log(`Skipped: ${skipped}`);
  console.log(`Failed: ${failed}`);
  console.log(`Mode: ${options.execute ? "EXECUTE" : "DRY RUN"}`);
  console.log("==============================================");

  await pool.end();
}

main().catch(async (error) => {
  console.error("Fatal error:", error);
  await pool.end();
  process.exit(1);
});
