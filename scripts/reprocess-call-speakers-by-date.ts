import "dotenv/config";
import { pool } from "../server/db";
import { runPostCallAnalysis } from "../server/services/post-call-analyzer";

type TargetRow = {
  callSessionId: string;
  callAttemptId: string | null;
  startedAt: string | null;
  endedAt: string | null;
  campaignId: string | null;
  contactId: string | null;
  recordingUrl: string | null;
  telnyxCallId: string | null;
};

function readArg(name: string, fallback?: string): string | undefined {
  const exact = process.argv.find((a) => a.startsWith(`--${name}=`));
  if (exact) return exact.split("=")[1];

  const idx = process.argv.indexOf(`--${name}`);
  if (idx >= 0 && process.argv[idx + 1] && !process.argv[idx + 1].startsWith("--")) {
    return process.argv[idx + 1];
  }
  return fallback;
}

const dateArg = readArg("date", "2026-02-16")!;
const limit = Math.max(1, parseInt(readArg("limit", "2000") || "2000", 10));
const concurrency = Math.max(1, parseInt(readArg("concurrency", "4") || "4", 10));
const execute = process.argv.includes("--execute") && !process.argv.includes("--dry-run");

function buildUtcDayRange(dateIsoDay: string): { start: string; end: string } {
  const start = `${dateIsoDay}T00:00:00.000Z`;
  const end = `${dateIsoDay}T23:59:59.999Z`;
  return { start, end };
}

async function loadTargets(startIso: string, endIso: string): Promise<TargetRow[]> {
  const result = await pool.query(
    `SELECT
       cs.id AS call_session_id,
       dca.id AS call_attempt_id,
       cs.started_at,
       cs.ended_at,
       cs.campaign_id,
       cs.contact_id,
       cs.recording_url,
       cs.telnyx_call_id
     FROM call_sessions cs
     LEFT JOIN LATERAL (
       SELECT id
       FROM dialer_call_attempts
       WHERE call_session_id = cs.id
       ORDER BY updated_at DESC NULLS LAST, created_at DESC NULLS LAST
       LIMIT 1
     ) dca ON TRUE
     WHERE cs.ended_at IS NOT NULL
       AND cs.started_at >= $1::timestamptz
       AND cs.started_at <= $2::timestamptz
       AND (
         cs.recording_url IS NOT NULL
         OR cs.telnyx_call_id IS NOT NULL
       )
     ORDER BY cs.started_at ASC
     LIMIT $3`,
    [startIso, endIso, limit]
  );

  return result.rows.map((r: any) => ({
    callSessionId: r.call_session_id,
    callAttemptId: r.call_attempt_id || null,
    startedAt: r.started_at ? new Date(r.started_at).toISOString() : null,
    endedAt: r.ended_at ? new Date(r.ended_at).toISOString() : null,
    campaignId: r.campaign_id || null,
    contactId: r.contact_id || null,
    recordingUrl: r.recording_url || null,
    telnyxCallId: r.telnyx_call_id || null,
  }));
}

async function runWithConcurrency<T>(
  items: T[],
  worker: (item: T, index: number) => Promise<void>,
  maxConcurrency: number
): Promise<void> {
  let nextIndex = 0;

  const runners = Array.from({ length: Math.min(maxConcurrency, items.length) }, async () => {
    while (true) {
      const current = nextIndex;
      nextIndex += 1;
      if (current >= items.length) return;
      await worker(items[current], current);
    }
  });

  await Promise.all(runners);
}

async function main(): Promise<void> {
  const { start, end } = buildUtcDayRange(dateArg);

  console.log("============================================");
  console.log("Reprocess Call Speaker Attribution by Date");
  console.log("============================================");
  console.log(`Date (UTC day): ${dateArg}`);
  console.log(`Window: ${start} -> ${end}`);
  console.log(`Mode: ${execute ? "EXECUTE" : "DRY RUN"}`);
  console.log(`Limit: ${limit}`);
  console.log(`Concurrency: ${concurrency}`);
  console.log();

  const targets = await loadTargets(start, end);
  console.log(`Eligible call sessions found: ${targets.length}`);

  if (!execute) {
    const preview = targets.slice(0, 20).map((t, i) => ({
      idx: i + 1,
      callSessionId: t.callSessionId,
      callAttemptId: t.callAttemptId,
      startedAt: t.startedAt,
      campaignId: t.campaignId,
    }));
    console.table(preview);
    console.log("\nDry run complete. Re-run with --execute to apply.");
    return;
  }

  let succeeded = 0;
  let failed = 0;
  const failures: Array<{ callSessionId: string; error: string }> = [];

  await runWithConcurrency(
    targets,
    async (row, index) => {
      const label = `[${index + 1}/${targets.length}] ${row.callSessionId}`;
      try {
        const result = await runPostCallAnalysis(row.callSessionId, {
          callAttemptId: row.callAttemptId || undefined,
        });

        if (result.success) {
          succeeded += 1;
          console.log(`${label} ✅ reprocessed (${result.metrics.totalTurns} turns)`);
        } else {
          failed += 1;
          const err = result.error || "analysis_failed";
          failures.push({ callSessionId: row.callSessionId, error: err });
          console.log(`${label} ⚠️ failed: ${err}`);
        }
      } catch (err: any) {
        failed += 1;
        const msg = err?.message || String(err);
        failures.push({ callSessionId: row.callSessionId, error: msg });
        console.log(`${label} ❌ error: ${msg}`);
      }
    },
    concurrency
  );

  console.log("\n============================================");
  console.log("Reprocess Summary");
  console.log("============================================");
  console.log(`Total targeted: ${targets.length}`);
  console.log(`Succeeded: ${succeeded}`);
  console.log(`Failed: ${failed}`);

  if (failures.length > 0) {
    console.log("\nSample failures:");
    console.table(failures.slice(0, 20));
  }

  await pool.end();
}

main().catch(async (err) => {
  console.error("Fatal error:", err);
  try {
    await pool.end();
  } catch {}
  process.exit(1);
});
