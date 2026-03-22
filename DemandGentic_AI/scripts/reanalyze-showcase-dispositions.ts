import "dotenv/config";

import { db } from "../server/db";
import { callQualityRecords, callSessions } from "../shared/schema";
import { eq, desc, and, gte, isNotNull, ne, sql } from "drizzle-orm";
import {
  analyzeSingleCall,
  overrideSingleDisposition,
} from "../server/services/bulk-disposition-reanalyzer";
import type { CanonicalDisposition } from "../shared/schema";

type CliOptions = {
  apply: boolean;
  limit: number;
  pinnedOnly: boolean;
  minDurationSec: number;
  minOverallScore: number;
};

type ChangeCandidate = {
  callSessionId: string;
  campaignName: string;
  currentDisposition: string;
  suggestedDisposition: CanonicalDisposition;
  confidence: number;
  reasoning: string;
};

function parseArgs(argv: string[]): CliOptions {
  const apply = argv.includes("--apply");
  const pinnedOnly = argv.includes("--pinned-only");

  const limitIdx = argv.findIndex((arg) => arg === "--limit");
  const rawLimit = limitIdx >= 0 ? Number(argv[limitIdx + 1]) : 200;
  const limit = Number.isFinite(rawLimit) && rawLimit > 0
    ? Math.min(Math.floor(rawLimit), 1000)
    : 200;

  const minDurationIdx = argv.findIndex((arg) => arg === "--min-duration");
  const rawMinDuration = minDurationIdx >= 0 ? Number(argv[minDurationIdx + 1]) : MIN_MEANINGFUL_DURATION_SEC;
  const minDurationSec = Number.isFinite(rawMinDuration) && rawMinDuration >= 0
    ? Math.floor(rawMinDuration)
    : MIN_MEANINGFUL_DURATION_SEC;

  const minScoreIdx = argv.findIndex((arg) => arg === "--min-score");
  const rawMinScore = minScoreIdx >= 0 ? Number(argv[minScoreIdx + 1]) : MIN_OVERALL_SCORE;
  const minOverallScore = Number.isFinite(rawMinScore) && rawMinScore >= 0 && rawMinScore = ${MIN_TRANSCRIPT_CHARS}`,
            sql`COALESCE(${callQualityRecords.fullTranscript}, '') ~* '(agent|ai|assistant|bot)\\s*:'`,
            sql`COALESCE(${callQualityRecords.fullTranscript}, '') ~* '(contact|customer|prospect|user|caller|human)\\s*:'`,
            sql`COALESCE(${callQualityRecords.fullTranscript}, '') !~* ${VOICEMAIL_OR_IVR_TRANSCRIPT_REGEX}`,
            sql`COALESCE(${callQualityRecords.fullTranscript}, '') !~* ${CALL_SCREENING_TRANSCRIPT_REGEX}`,
            sql`LOWER(COALESCE(${callQualityRecords.assignedDisposition}, '')) NOT IN (${sql.join(
              NON_HUMAN_DISPOSITIONS.map((d) => sql`${d}`),
              sql`, `
            )})`,
            sql`LOWER(COALESCE(${callQualityRecords.assignedDisposition}, '')) NOT LIKE '%voicemail%'`,
            sql`LOWER(COALESCE(${callQualityRecords.assignedDisposition}, '')) NOT LIKE '%no answer%'`,
            sql`LOWER(COALESCE(${callQualityRecords.assignedDisposition}, '')) NOT LIKE '%answering machine%'`,
            sql`LOWER(COALESCE(${callQualityRecords.assignedDisposition}, '')) NOT LIKE '%fax%'`,
            sql`(
              (
                ${callSessions.recordingStatus} = 'stored'
                AND ${callSessions.recordingS3Key} IS NOT NULL
              )
              OR ${callSessions.recordingUrl} IS NOT NULL
              OR (${callSessions.telnyxRecordingId} IS NOT NULL AND ${callSessions.recordingStatus} <> 'failed')
            )`,
            ne(callSessions.recordingStatus, 'failed')
          )
        )
        .orderBy(desc(callQualityRecords.createdAt))
        .limit(options.limit);

  console.log(`Showcase-scope calls found: ${showcaseRows.length}`);

  if (showcaseRows.length === 0) {
    console.log("No showcase-scope calls found. Exiting.");
    return;
  }

  const candidates: ChangeCandidate[] = [];
  let analyzed = 0;
  let analysisErrors = 0;

  for (const row of showcaseRows) {
    try {
      const analyzedCall = await analyzeSingleCall(row.callSessionId);
      analyzed += 1;

      if (!analyzedCall) continue;

      const { analysis } = analyzedCall;
      const current = analyzedCall.currentDisposition || "unknown";
      const suggested = analysis.suggestedDisposition;

      if (analysis.shouldOverride && suggested !== current) {
        candidates.push({
          callSessionId: analyzedCall.callSessionId,
          campaignName: analyzedCall.campaignInfo.name || "Unknown",
          currentDisposition: current,
          suggestedDisposition: suggested,
          confidence: analysis.confidence,
          reasoning: analysis.reasoning,
        });
      }
    } catch (error: any) {
      analysisErrors += 1;
      console.log(`[ANALYZE_ERROR] ${row.callSessionId}: ${error?.message || "Unknown error"}`);
    }
  }

  console.log();
  console.log("---------------- DRY ANALYSIS SUMMARY ----------------");
  console.log(`Analyzed: ${analyzed}`);
  console.log(`Potential changes: ${candidates.length}`);
  console.log(`Analysis errors: ${analysisErrors}`);

  if (candidates.length > 0) {
    const grouped = new Map();
    for (const c of candidates) {
      const key = `${c.currentDisposition} -> ${c.suggestedDisposition}`;
      grouped.set(key, (grouped.get(key) || 0) + 1);
    }

    console.log("\nChange breakdown:");
    for (const [key, count] of [...grouped.entries()].sort((a, b) => b[1] - a[1])) {
      console.log(`  ${key}: ${count}`);
    }

    console.log("\nSample candidates:");
    for (const c of candidates.slice(0, 20)) {
      console.log(
        `  ${c.callSessionId} | ${c.campaignName} | ${c.currentDisposition} -> ${c.suggestedDisposition} | conf=${c.confidence.toFixed(2)} | ${c.reasoning}`
      );
    }
    if (candidates.length > 20) {
      console.log(`  ... plus ${candidates.length - 20} more`);
    }
  }

  if (!options.apply) {
    console.log("\nDry run complete. Re-run with --apply to apply disposition changes.");
    return;
  }

  console.log("\nApplying changes...");

  let applied = 0;
  let applyErrors = 0;

  for (const c of candidates) {
    try {
      const result = await overrideSingleDisposition(
        c.callSessionId,
        c.suggestedDisposition,
        "showcase_reanalysis_script",
        `Showcase reanalysis matched campaign criteria. confidence=${c.confidence.toFixed(2)}; reason=${c.reasoning}`
      );

      if (result.success) {
        applied += 1;
        console.log(`[APPLIED] ${c.callSessionId}: ${c.currentDisposition} -> ${c.suggestedDisposition}`);
      } else {
        applyErrors += 1;
        console.log(`[APPLY_ERROR] ${c.callSessionId}: ${result.error || "Unknown error"}`);
      }
    } catch (error: any) {
      applyErrors += 1;
      console.log(`[APPLY_ERROR] ${c.callSessionId}: ${error?.message || "Unknown error"}`);
    }
  }

  console.log();
  console.log("---------------- APPLY SUMMARY ----------------");
  console.log(`Candidates: ${candidates.length}`);
  console.log(`Applied: ${applied}`);
  console.log(`Apply errors: ${applyErrors}`);
  console.log("Done.");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("Showcase reanalysis failed:", error);
    process.exit(1);
  });