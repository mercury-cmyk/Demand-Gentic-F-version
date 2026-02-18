/**
 * Backfill GCS Recording URLs Across Entities
 *
 * What this script does:
 * 1) Backfills missing recordingS3Key for leads and call_sessions (when possible)
 * 2) Normalizes recordingUrl to GCS URL for entities that store recordingS3Key
 * 3) Propagates canonical GCS URLs to dependent entities
 *
 * Usage:
 *   npx tsx scripts/backfill-gcs-recording-urls-all-entities.ts --dry-run
 *   npx tsx scripts/backfill-gcs-recording-urls-all-entities.ts --execute --batch=200 --max=5000
 */

import { db } from "../server/db";
import { callSessions, leads, clientMockCalls } from "../shared/schema";
import { and, desc, eq, isNotNull, or, sql } from "drizzle-orm";
import { getCallSessionRecordingUrl, getRecordingUrl, isRecordingStorageEnabled } from "../server/services/recording-storage";
import { getPlayableRecordingLink } from "../server/services/recording-link-resolver";
import { buildCanonicalGcsUrlFromKey } from "../server/lib/recording-url-policy";

const DRY_RUN = !process.argv.includes("--execute");
const batchArg = process.argv.find((a) => a.startsWith("--batch="));
const maxArg = process.argv.find((a) => a.startsWith("--max="));
const BATCH_SIZE = Math.max(1, Number(batchArg?.split("=")[1] || 100));
const MAX_ROWS = Math.max(1, Number(maxArg?.split("=")[1] || 5000));

function clearProxyEnv() {
  process.env.ALL_PROXY = "";
  process.env.HTTP_PROXY = "";
  process.env.HTTPS_PROXY = "";
  process.env.GIT_HTTP_PROXY = "";
  process.env.GIT_HTTPS_PROXY = "";
}

function isUsableGcsUrl(url: string | null | undefined) {
  return !!url && url.startsWith("https://storage.googleapis.com/");
}

type Stats = {
  scanned: number;
  updated: number;
  skipped: number;
  failed: number;
};

async function processLeadBackfill(): Promise<Stats> {
  const stats: Stats = { scanned: 0, updated: 0, skipped: 0, failed: 0 };
  let remaining = MAX_ROWS;
  let offset = 0;

  while (remaining > 0) {
    const limit = Math.min(BATCH_SIZE, remaining);
    const rows = await db
      .select({
        id: leads.id,
        recordingUrl: leads.recordingUrl,
        recordingS3Key: leads.recordingS3Key,
      })
      .from(leads)
      .where(
        or(
          eq(leads.recordingS3Key, ""),
          sql`${leads.recordingS3Key} IS NULL`
        )
      )
      .orderBy(desc(leads.createdAt))
      .limit(limit)
      .offset(offset);

    if (rows.length === 0) break;

    for (const row of rows) {
      stats.scanned++;
      let sourceUrl = row.recordingUrl || null;

      try {
        if (!sourceUrl) {
          const resolved = await getPlayableRecordingLink(row.id);
          sourceUrl = resolved?.url || null;
        }

        if (!sourceUrl) {
          stats.skipped++;
          continue;
        }

        if (DRY_RUN) {
          stats.updated++;
          continue;
        }

        const result = await getRecordingUrl(row.id, sourceUrl);
        if (result.source === "local" && result.url && !result.url.startsWith("gcs-internal://")) {
          stats.updated++;
        } else {
          stats.failed++;
        }
      } catch {
        stats.failed++;
      }
    }

    offset += rows.length;
    remaining -= rows.length;
  }

  return stats;
}

async function processCallSessionBackfill(): Promise<Stats> {
  const stats: Stats = { scanned: 0, updated: 0, skipped: 0, failed: 0 };
  let remaining = MAX_ROWS;
  let offset = 0;

  while (remaining > 0) {
    const limit = Math.min(BATCH_SIZE, remaining);
    const rows = await db
      .select({
        id: callSessions.id,
        recordingUrl: callSessions.recordingUrl,
        recordingS3Key: callSessions.recordingS3Key,
      })
      .from(callSessions)
      .where(
        or(
          eq(callSessions.recordingS3Key, ""),
          sql`${callSessions.recordingS3Key} IS NULL`
        )
      )
      .orderBy(desc(callSessions.createdAt))
      .limit(limit)
      .offset(offset);

    if (rows.length === 0) break;

    for (const row of rows) {
      stats.scanned++;
      try {
        let sourceUrl = row.recordingUrl || null;
        if (!sourceUrl) {
          const resolved = await getPlayableRecordingLink(row.id);
          sourceUrl = resolved?.url || null;
        }

        if (!sourceUrl) {
          stats.skipped++;
          continue;
        }

        if (DRY_RUN) {
          stats.updated++;
          continue;
        }

        const result = await getCallSessionRecordingUrl(row.id, sourceUrl);
        if (result.source === "local" && result.url && !result.url.startsWith("gcs-internal://")) {
          stats.updated++;
        } else {
          stats.failed++;
        }
      } catch {
        stats.failed++;
      }
    }

    offset += rows.length;
    remaining -= rows.length;
  }

  return stats;
}

async function normalizeEntityUrlsFromKeys(): Promise<{
  leads: number;
  callSessions: number;
  clientMockCalls: number;
}> {
  let leadUpdated = 0;
  let sessionUpdated = 0;
  let mockUpdated = 0;

  const leadRows = await db
    .select({ id: leads.id, recordingS3Key: leads.recordingS3Key, recordingUrl: leads.recordingUrl })
    .from(leads)
    .where(isNotNull(leads.recordingS3Key))
    .limit(MAX_ROWS);

  for (const row of leadRows) {
    const canonical = buildCanonicalGcsUrlFromKey(row.recordingS3Key);
    if (!canonical || canonical === row.recordingUrl) continue;
    if (DRY_RUN) {
      leadUpdated++;
      continue;
    }
    await db.update(leads).set({ recordingUrl: canonical, updatedAt: new Date() }).where(eq(leads.id, row.id));
    leadUpdated++;
  }

  const sessionRows = await db
    .select({ id: callSessions.id, recordingS3Key: callSessions.recordingS3Key, recordingUrl: callSessions.recordingUrl })
    .from(callSessions)
    .where(isNotNull(callSessions.recordingS3Key))
    .limit(MAX_ROWS);

  for (const row of sessionRows) {
    const canonical = buildCanonicalGcsUrlFromKey(row.recordingS3Key);
    if (!canonical || canonical === row.recordingUrl) continue;
    if (DRY_RUN) {
      sessionUpdated++;
      continue;
    }
    await db.update(callSessions).set({ recordingUrl: canonical }).where(eq(callSessions.id, row.id));
    sessionUpdated++;
  }

  const mockRows = await db
    .select({ id: clientMockCalls.id, recordingS3Key: clientMockCalls.recordingS3Key, recordingUrl: clientMockCalls.recordingUrl })
    .from(clientMockCalls)
    .where(isNotNull(clientMockCalls.recordingS3Key))
    .limit(MAX_ROWS);

  for (const row of mockRows) {
    const canonical = buildCanonicalGcsUrlFromKey(row.recordingS3Key);
    if (!canonical || canonical === row.recordingUrl) continue;
    if (DRY_RUN) {
      mockUpdated++;
      continue;
    }
    await db.update(clientMockCalls).set({ recordingUrl: canonical }).where(eq(clientMockCalls.id, row.id));
    mockUpdated++;
  }

  return { leads: leadUpdated, callSessions: sessionUpdated, clientMockCalls: mockUpdated };
}

async function propagateCanonicalUrlsToDependentEntities(): Promise<Record<string, number>> {
  const counters: Record<string, number> = {
    dialerCallAttemptsFromSessions: 0,
    dialerCallAttemptsFromLeads: 0,
    campaignTestCallsFromSessions: 0,
    callsFromSessions: 0,
    callAttemptsFromSessions: 0,
  };

  const canonicalLike = "https://storage.googleapis.com/%";

  if (DRY_RUN) {
    const [d1, d2, t1, c1, a1] = await Promise.all([
      db.execute(sql`
        SELECT COUNT(*)::int AS count
        FROM dialer_call_attempts d
        JOIN call_sessions cs ON cs.id = d.call_session_id
        WHERE cs.recording_url LIKE ${canonicalLike}
          AND (d.recording_url IS NULL OR d.recording_url NOT LIKE ${canonicalLike})
      `),
      db.execute(sql`
        SELECT COUNT(*)::int AS count
        FROM dialer_call_attempts d
        JOIN leads l ON l.call_attempt_id = d.id
        WHERE l.recording_url LIKE ${canonicalLike}
          AND (d.recording_url IS NULL OR d.recording_url NOT LIKE ${canonicalLike})
      `),
      db.execute(sql`
        SELECT COUNT(*)::int AS count
        FROM campaign_test_calls t
        JOIN call_sessions cs ON cs.id = t.call_session_id
        WHERE cs.recording_url LIKE ${canonicalLike}
          AND (t.recording_url IS NULL OR t.recording_url NOT LIKE ${canonicalLike})
      `),
      db.execute(sql`
        SELECT COUNT(*)::int AS count
        FROM calls c
        JOIN call_sessions cs ON cs.telnyx_call_id = c.telnyx_call_id
        WHERE cs.recording_url LIKE ${canonicalLike}
          AND (c.recording_url IS NULL OR c.recording_url NOT LIKE ${canonicalLike})
      `),
      db.execute(sql`
        SELECT COUNT(*)::int AS count
        FROM call_attempts a
        JOIN call_sessions cs ON cs.telnyx_call_id = a.telnyx_call_id
        WHERE cs.recording_url LIKE ${canonicalLike}
          AND (a.recording_url IS NULL OR a.recording_url NOT LIKE ${canonicalLike})
      `),
    ]);

    counters.dialerCallAttemptsFromSessions = Number(d1.rows[0]?.count || 0);
    counters.dialerCallAttemptsFromLeads = Number(d2.rows[0]?.count || 0);
    counters.campaignTestCallsFromSessions = Number(t1.rows[0]?.count || 0);
    counters.callsFromSessions = Number(c1.rows[0]?.count || 0);
    counters.callAttemptsFromSessions = Number(a1.rows[0]?.count || 0);
    return counters;
  }

  const r1 = await db.execute(sql`
    UPDATE dialer_call_attempts d
    SET recording_url = cs.recording_url, updated_at = NOW()
    FROM call_sessions cs
    WHERE cs.id = d.call_session_id
      AND cs.recording_url LIKE ${canonicalLike}
      AND (d.recording_url IS NULL OR d.recording_url NOT LIKE ${canonicalLike})
  `);
  counters.dialerCallAttemptsFromSessions = r1.rowCount ?? 0;

  const r2 = await db.execute(sql`
    UPDATE dialer_call_attempts d
    SET recording_url = l.recording_url, updated_at = NOW()
    FROM leads l
    WHERE l.call_attempt_id = d.id
      AND l.recording_url LIKE ${canonicalLike}
      AND (d.recording_url IS NULL OR d.recording_url NOT LIKE ${canonicalLike})
  `);
  counters.dialerCallAttemptsFromLeads = r2.rowCount ?? 0;

  const r3 = await db.execute(sql`
    UPDATE campaign_test_calls t
    SET recording_url = cs.recording_url, updated_at = NOW()
    FROM call_sessions cs
    WHERE cs.id = t.call_session_id
      AND cs.recording_url LIKE ${canonicalLike}
      AND (t.recording_url IS NULL OR t.recording_url NOT LIKE ${canonicalLike})
  `);
  counters.campaignTestCallsFromSessions = r3.rowCount ?? 0;

  const r4 = await db.execute(sql`
    UPDATE calls c
    SET recording_url = cs.recording_url
    FROM call_sessions cs
    WHERE cs.telnyx_call_id = c.telnyx_call_id
      AND cs.recording_url LIKE ${canonicalLike}
      AND (c.recording_url IS NULL OR c.recording_url NOT LIKE ${canonicalLike})
  `);
  counters.callsFromSessions = r4.rowCount ?? 0;

  const r5 = await db.execute(sql`
    UPDATE call_attempts a
    SET recording_url = cs.recording_url
    FROM call_sessions cs
    WHERE cs.telnyx_call_id = a.telnyx_call_id
      AND cs.recording_url LIKE ${canonicalLike}
      AND (a.recording_url IS NULL OR a.recording_url NOT LIKE ${canonicalLike})
  `);
  counters.callAttemptsFromSessions = r5.rowCount ?? 0;

  return counters;
}

async function summarizeRemaining() {
  const canonicalLike = "https://storage.googleapis.com/%";
  const [leadMissing, sessionMissing, dialerMissing] = await Promise.all([
    db.execute(sql`
      SELECT COUNT(*)::int AS count
      FROM leads
      WHERE recording_url IS NOT NULL
        AND recording_url NOT LIKE ${canonicalLike}
    `),
    db.execute(sql`
      SELECT COUNT(*)::int AS count
      FROM call_sessions
      WHERE recording_url IS NOT NULL
        AND recording_url NOT LIKE ${canonicalLike}
    `),
    db.execute(sql`
      SELECT COUNT(*)::int AS count
      FROM dialer_call_attempts
      WHERE recording_url IS NOT NULL
        AND recording_url NOT LIKE ${canonicalLike}
    `),
  ]);

  return {
    leadsNonGcs: Number(leadMissing.rows[0]?.count || 0),
    callSessionsNonGcs: Number(sessionMissing.rows[0]?.count || 0),
    dialerAttemptsNonGcs: Number(dialerMissing.rows[0]?.count || 0),
  };
}

async function main() {
  clearProxyEnv();

  console.log("========================================");
  console.log("GCS Recording URL Backfill (All Entities)");
  console.log(DRY_RUN ? "Mode: DRY RUN" : "Mode: EXECUTE");
  console.log(`Batch: ${BATCH_SIZE}, MaxRowsPerEntity: ${MAX_ROWS}`);
  console.log("========================================");

  if (!isRecordingStorageEnabled()) {
    console.error("Recording storage is not enabled. Configure GCS first.");
    process.exit(1);
  }

  const leadStats = await processLeadBackfill();
  console.log("[Leads backfill]", leadStats);

  const sessionStats = await processCallSessionBackfill();
  console.log("[Call sessions backfill]", sessionStats);

  const normalized = await normalizeEntityUrlsFromKeys();
  console.log("[Canonical URL normalization]", normalized);

  const propagated = await propagateCanonicalUrlsToDependentEntities();
  console.log("[Propagation to dependent entities]", propagated);

  const remaining = await summarizeRemaining();
  console.log("[Remaining non-GCS URLs]", remaining);

  console.log("========================================");
  console.log("Done.");
  console.log("========================================");
}

main().catch((err) => {
  console.error("Backfill failed:", err);
  process.exit(1);
});
