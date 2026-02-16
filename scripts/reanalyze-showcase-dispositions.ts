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

  return { apply, limit, pinnedOnly };
}

const MIN_MEANINGFUL_DURATION_SEC = 15;
const MIN_TRANSCRIPT_CHARS = 50;
const MIN_OVERALL_SCORE = 30;

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
  "dnc",
  "do_not_call",
  "do not call",
];

const VOICEMAIL_OR_IVR_TRANSCRIPT_REGEX =
  "(leave\\s+(a|your)\\s+message|after\\s+the\\s+(tone|beep)|forwarded\\s+to\\s+(an\\s+)?(automatic\\s+)?voice\\s+messaging|voicemail|voice\\s*mail|answering\\s+machine|mailbox(\\s+is\\s+full)?|please\\s+record\\s+your\\s+message|not\\s+available\\s+to\\s+take\\s+your\\s+call|currently\\s+unavailable|your\\s+call\\s+has\\s+been\\s+forwarded|cannot\\s+accept\\s+messages|is\\s+not\\s+available)";
const CALL_SCREENING_TRANSCRIPT_REGEX =
  "(calling\\s+assist\\s+by\\s+google|google\\s+call\\s+screening|screening\\s+service\\s+from\\s+google|this\\s+call\\s+is\\s+being\\s+screened|i\\s+try\\s+to\\s+connect\\s+you,?\\s+can\\s+i\\s+ask\\s+what\\s+you'?re\\s+calling\\s+about\\??)";

async function main() {
  const options = parseArgs(process.argv.slice(2));

  console.log("====================================================");
  console.log("SHOWCASE DISPOSITION REANALYSIS");
  console.log("====================================================");
  console.log(`Mode: ${options.apply ? "APPLY" : "DRY RUN"}`);
  console.log(`Limit: ${options.limit}`);
  console.log(`Scope: ${options.pinnedOnly ? "Pinned showcase calls only" : "Eligible showcase pool"}`);
  console.log();

  const showcaseRows = options.pinnedOnly
    ? await db
        .select({
          callSessionId: callQualityRecords.callSessionId,
          createdAt: callQualityRecords.createdAt,
        })
        .from(callQualityRecords)
        .where(eq(callQualityRecords.isShowcase, true))
        .orderBy(desc(callQualityRecords.createdAt))
        .limit(options.limit)
    : await db
        .select({
          callSessionId: callQualityRecords.callSessionId,
          createdAt: callQualityRecords.createdAt,
        })
        .from(callQualityRecords)
        .innerJoin(callSessions, eq(callQualityRecords.callSessionId, callSessions.id))
        .where(
          and(
            gte(callQualityRecords.overallQualityScore, MIN_OVERALL_SCORE),
            gte(callSessions.durationSec, MIN_MEANINGFUL_DURATION_SEC),
            isNotNull(callQualityRecords.fullTranscript),
            sql`LENGTH(COALESCE(${callQualityRecords.fullTranscript}, '')) >= ${MIN_TRANSCRIPT_CHARS}`,
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
    const grouped = new Map<string, number>();
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
