import "dotenv/config";
import { pool } from "./server/db";
import { submitStructuredTranscription } from "./server/services/google-transcription";
import { getPresignedDownloadUrl } from "./server/lib/storage";

type CandidateCall = {
  id: string;
  createdAt: Date;
  callDurationSeconds: number | null;
  recordingUrl: string | null;
  telnyxCallId: string | null;
  callSessionId: string | null;
  sessionRecordingUrl: string | null;
  sessionRecordingS3Key: string | null;
};

type CliOptions = {
  days: number;
  limit: number;
  minDurationSec: number;
  concurrency: number;
  execute: boolean;
  verbose: boolean;
  allowHeuristic: boolean;
};

type FormatResult = {
  fullTranscript: string;
  aiTranscript: string | null;
  speakerCount: number;
  agentTurns: number;
  contactTurns: number;
};

function parseArgs(argv: string[]): CliOptions {
  const getNum = (flag: string, fallback: number): number => {
    const idx = argv.findIndex((arg) => arg === flag);
    if (idx < 0) return fallback;
    const raw = Number(argv[idx + 1]);
    return Number.isFinite(raw) && raw > 0 ? raw : fallback;
  };

  return {
    days: Math.floor(getNum("--days", 3)),
    limit: Math.floor(getNum("--limit", 500)),
    minDurationSec: Math.floor(getNum("--min-duration", 5)),
    concurrency: Math.max(1, Math.floor(getNum("--concurrency", 8))),
    execute: argv.includes("--execute"),
    verbose: argv.includes("--verbose"),
    allowHeuristic: argv.includes("--allow-heuristic"),
  };
}

function formatTwoWayTranscript(
  structured: { text: string; utterances: Array<{ speaker: string; channelTag?: number; text: string; start: number; end: number }> },
  allowHeuristic: boolean
): FormatResult | null {
  const utterances = (structured.utterances || []).filter(
    (u) => typeof u.text === "string" && u.text.trim().length > 0
  );

  let agentTurns = 0;
  let contactTurns = 0;
  let lines: string[] = [];
  let aiTranscript = "";

  // Strict path: deterministic channel mapping from stereo recording.
  // Channel 1 (left) = Contact, Channel 2 (right) = Agent.
  const hasChannelTag = utterances.some((u) => typeof u.channelTag === "number");
  if (hasChannelTag) {
    for (const u of utterances) {
      if (u.channelTag === 1) {
        contactTurns += 1;
        lines.push(`Contact: ${u.text.trim()}`);
      } else if (u.channelTag === 2) {
        agentTurns += 1;
        const text = u.text.trim();
        lines.push(`Agent: ${text}`);
        aiTranscript += (aiTranscript ? " " : "") + text;
      }
    }
  } else if (allowHeuristic && utterances.length > 0) {
    // Optional compatibility fallback for mono/non-channel results.
    const agentSpeaker = utterances[0].speaker;
    lines = utterances.map((u) => {
      const isAgent = u.speaker === agentSpeaker;
      if (isAgent) {
        agentTurns += 1;
        aiTranscript += (aiTranscript ? " " : "") + u.text.trim();
      } else {
        contactTurns += 1;
      }
      return `${isAgent ? "Agent" : "Contact"}: ${u.text.trim()}`;
    });
  } else {
    // Strict mode: skip ambiguous mapping.
    return null;
  }

  if (agentTurns === 0 || contactTurns === 0) {
    return null;
  }

  const speakerCount = hasChannelTag
    ? [contactTurns > 0 ? 1 : null, agentTurns > 0 ? 2 : null].filter(Boolean).length
    : new Set(utterances.map((u) => u.speaker)).size;

  return {
    fullTranscript: lines.join("\n").trim(),
    aiTranscript: aiTranscript || null,
    speakerCount,
    agentTurns,
    contactTurns,
  };
}

async function resolveAudioUrl(call: CandidateCall): Promise<string | null> {
  if (call.recordingUrl) return call.recordingUrl;
  if (call.sessionRecordingUrl) return call.sessionRecordingUrl;
  if (call.sessionRecordingS3Key) {
    try {
      return await getPresignedDownloadUrl(call.sessionRecordingS3Key, 3600);
    } catch {
      return null;
    }
  }
  return null;
}

async function getCandidates(options: CliOptions): Promise<CandidateCall[]> {
  const result = await pool.query<CandidateCall>(
    `
      SELECT
        dca.id,
        dca.created_at AS "createdAt",
        dca.call_duration_seconds AS "callDurationSeconds",
        dca.recording_url AS "recordingUrl",
        dca.telnyx_call_id AS "telnyxCallId",
        dca.call_session_id AS "callSessionId",
        cs.recording_url AS "sessionRecordingUrl",
        cs.recording_s3_key AS "sessionRecordingS3Key"
      FROM dialer_call_attempts dca
      LEFT JOIN call_sessions cs ON cs.id = dca.call_session_id
      WHERE dca.agent_type = 'ai'
        AND dca.created_at >= NOW() - ($1::int * INTERVAL '1 day')
        AND COALESCE(dca.call_duration_seconds, 0) >= $2
        AND (
          dca.full_transcript IS NULL
          OR length(trim(dca.full_transcript)) < 20
        )
        AND (
          dca.recording_url IS NOT NULL
          OR cs.recording_url IS NOT NULL
          OR cs.recording_s3_key IS NOT NULL
        )
      ORDER BY dca.created_at DESC
      LIMIT $3
    `,
    [options.days, options.minDurationSec, options.limit]
  );

  return result.rows;
}

async function processOne(call: CandidateCall, options: CliOptions): Promise<{
  status: "updated" | "failed" | "skipped";
  reason?: string;
  speakerCount?: number;
  agentTurns?: number;
  contactTurns?: number;
}> {
  const audioUrl = await resolveAudioUrl(call);
  if (!audioUrl) {
    return { status: "skipped", reason: "no-audio-url" };
  }

  try {
    const structured = await submitStructuredTranscription(audioUrl, {
      telnyxCallId: call.telnyxCallId,
      recordingS3Key: call.sessionRecordingS3Key,
      throwOnError: true,
    });

    if (!structured) {
      return { status: "failed", reason: "empty-transcription" };
    }

    const formatted = formatTwoWayTranscript(structured, options.allowHeuristic);
    if (!formatted || formatted.fullTranscript.length < 20) {
      return { status: "failed", reason: "strict-mapping-unavailable-or-too-short" };
    }

    if (options.execute) {
      await pool.query(
        `
          UPDATE dialer_call_attempts
          SET full_transcript = $1,
              ai_transcript = COALESCE($2, ai_transcript),
              updated_at = NOW()
          WHERE id = $3
        `,
        [formatted.fullTranscript, formatted.aiTranscript, call.id]
      );
    }

    return {
      status: "updated",
      speakerCount: formatted.speakerCount,
      agentTurns: formatted.agentTurns,
      contactTurns: formatted.contactTurns,
    };
  } catch (error: any) {
    return { status: "failed", reason: error?.message || "unknown-error" };
  }
}

async function main() {
  const options = parseArgs(process.argv.slice(2));

  console.log("==============================================");
  console.log("MISSING TWO-WAY TRANSCRIPT BACKFILL");
  console.log("==============================================");
  console.log(`Mode: ${options.execute ? "EXECUTE" : "DRY RUN"}`);
  console.log(`Days: last ${options.days}`);
  console.log(`Limit: ${options.limit}`);
  console.log(`Min duration: ${options.minDurationSec}s`);
  console.log(`Concurrency: ${options.concurrency}`);
  console.log(`Mapping: ${options.allowHeuristic ? "strict+heuristic-fallback" : "strict-channel-only"}`);
  console.log();

  const candidates = await getCandidates(options);
  console.log(`Candidates found: ${candidates.length}`);

  if (candidates.length === 0) {
    await pool.end();
    return;
  }

  if (!options.execute) {
    const preview = candidates.slice(0, Math.min(20, candidates.length));
    console.log("\nDry run preview (first candidates):");
    for (const call of preview) {
      console.log(
        `  ${call.id} | ${call.createdAt.toISOString()} | ${call.callDurationSeconds ?? 0}s`
      );
    }
    console.log("\nDry run does not call transcription APIs.");
    console.log("Re-run with --execute to transcribe and persist.");
    await pool.end();
    return;
  }

  let cursor = 0;
  let updated = 0;
  let failed = 0;
  let skipped = 0;
  let bothSides = 0;

  async function worker(workerId: number) {
    while (true) {
      const idx = cursor;
      cursor += 1;
      if (idx >= candidates.length) break;

      const call = candidates[idx];
      const result = await processOne(call, options);
      const prefix = `[${idx + 1}/${candidates.length}]`;

      if (result.status === "updated") {
        updated += 1;
        if ((result.agentTurns || 0) > 0 && (result.contactTurns || 0) > 0) {
          bothSides += 1;
        }
        if (options.verbose) {
          console.log(
            `${prefix} updated ${call.id} speakers=${result.speakerCount} agentTurns=${result.agentTurns} contactTurns=${result.contactTurns}`
          );
        }
      } else if (result.status === "skipped") {
        skipped += 1;
        if (options.verbose) {
          console.log(`${prefix} skipped ${call.id} (${result.reason})`);
        }
      } else {
        failed += 1;
        console.log(`${prefix} failed ${call.id} (${result.reason})`);
      }
    }

    if (options.verbose) {
      console.log(`Worker ${workerId} completed`);
    }
  }

  const workers = Array.from({ length: options.concurrency }, (_, i) => worker(i + 1));
  await Promise.all(workers);

  console.log();
  console.log("==============================================");
  console.log("SUMMARY");
  console.log("==============================================");
  console.log(`Updated: ${updated}`);
  console.log(`Updated with both sides detected: ${bothSides}`);
  console.log(`Skipped: ${skipped}`);
  console.log(`Failed: ${failed}`);
  console.log(`Mode: EXECUTE`);
  console.log("==============================================");

  await pool.end();
}

main().catch(async (error) => {
  console.error("Fatal error:", error);
  await pool.end();
  process.exit(1);
});
