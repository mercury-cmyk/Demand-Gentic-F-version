import { db } from '../server/db';
import { callSessions, leads } from '../shared/schema';
import { and, eq, isNull, or, sql } from 'drizzle-orm';
import { getRecordingUrl } from '../server/services/recording-storage';

type CandidateRow = {
  id: string;
  recordingUrl: string | null;
  recordingS3Key: string | null;
};

function extractGcsKeyFromUrl(url: string): string | null {
  const trimmed = url.trim();
  const match = trimmed.match(/^https:\/\/storage\.googleapis\.com\/([^/]+)\/(.+)$/i);
  if (!match) return null;
  try {
    return decodeURIComponent(match[2]);
  } catch {
    return match[2];
  }
}

async function processTable(params: {
  table: 'call_sessions' | 'leads';
  rows: CandidateRow[];
  apply: boolean;
}) {
  let updated = 0;
  let skipped = 0;

  for (const row of params.rows) {
    if (row.recordingS3Key) {
      skipped++;
      continue;
    }

    const resolved = await getRecordingUrl(row.id, row.recordingUrl || undefined).catch(() => null);
    const gcsUrl = resolved?.url || '';
    const gcsKey = gcsUrl ? extractGcsKeyFromUrl(gcsUrl) : null;
    if (!gcsKey) {
      skipped++;
      continue;
    }

    if (params.apply) {
      if (params.table === 'call_sessions') {
        await db
          .update(callSessions)
          .set({ recordingS3Key: gcsKey })
          .where(and(eq(callSessions.id, row.id), isNull(callSessions.recordingS3Key)));
      } else {
        await db
          .update(leads)
          .set({ recordingS3Key: gcsKey })
          .where(and(eq(leads.id, row.id), isNull(leads.recordingS3Key)));
      }
    }
    updated++;
  }

  return { updated, skipped, total: params.rows.length };
}

async function main() {
  const apply = process.argv.includes('--apply');

  const callSessionCandidates = await db
    .select({
      id: callSessions.id,
      recordingUrl: callSessions.recordingUrl,
      recordingS3Key: callSessions.recordingS3Key,
    })
    .from(callSessions)
    .where(
      and(
        isNull(callSessions.recordingS3Key),
        or(
          sql`${callSessions.recordingUrl} ilike '%s3.amazonaws.com%'`,
          sql`${callSessions.recordingUrl} ilike '%telephony-recorder-prod%'`,
        )!,
      ),
    );

  const leadCandidates = await db
    .select({
      id: leads.id,
      recordingUrl: leads.recordingUrl,
      recordingS3Key: leads.recordingS3Key,
    })
    .from(leads)
    .where(
      and(
        isNull(leads.recordingS3Key),
        or(
          sql`${leads.recordingUrl} ilike '%s3.amazonaws.com%'`,
          sql`${leads.recordingUrl} ilike '%telephony-recorder-prod%'`,
        )!,
      ),
    );

  const callSessionsResult = await processTable({
    table: 'call_sessions',
    rows: callSessionCandidates,
    apply,
  });
  const leadsResult = await processTable({
    table: 'leads',
    rows: leadCandidates,
    apply,
  });

  console.log(
    `[Backfill GCS References] mode=${apply ? 'apply' : 'dry-run'} ` +
      `call_sessions updated=${callSessionsResult.updated}/${callSessionsResult.total} skipped=${callSessionsResult.skipped} ` +
      `leads updated=${leadsResult.updated}/${leadsResult.total} skipped=${leadsResult.skipped}`,
  );
}

main().catch((error) => {
  console.error('[Backfill GCS References] failed:', error);
  process.exitCode = 1;
});