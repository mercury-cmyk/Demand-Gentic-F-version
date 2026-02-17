import 'dotenv/config';
import { db } from '../server/db';
import { callQualityRecords, callSessions } from '../shared/schema';
import { and, desc, eq, isNotNull, lte, or } from 'drizzle-orm';
import { getPlayableRecordingLink } from '../server/services/recording-link-resolver';
import { isRecordingStorageEnabled, storeCallSessionRecording } from '../server/services/recording-storage';

const DRY_RUN = process.argv.includes('--dry-run');
const includeUnpinned = process.argv.includes('--include-unpinned');
const limitArg = process.argv.find((arg) => arg.startsWith('--limit='));
const LIMIT = Math.max(1, Number(limitArg?.split('=')[1] || 100));
const MAX_SHOWCASE_DURATION_SEC = 4 * 60;

interface ShowcaseSession {
  callSessionId: string;
  recordingStatus: string | null;
  recordingS3Key: string | null;
  recordingUrl: string | null;
  telnyxCallId: string | null;
  telnyxRecordingId: string | null;
  startedAt: Date | null;
  durationSec: number | null;
  showcaseCategory: string | null;
  showcasedAt: Date | null;
}

function buildShowcaseWhere() {
  if (includeUnpinned) {
    return or(
      eq(callQualityRecords.isShowcase, true),
      isNotNull(callQualityRecords.showcasedAt),
      isNotNull(callQualityRecords.showcaseCategory),
    )!;
  }

  return or(eq(callQualityRecords.isShowcase, true), isNotNull(callQualityRecords.showcasedAt))!;
}

async function getShowcaseSessions(limit: number): Promise<ShowcaseSession[]> {
  const rows = await db
    .select({
      callSessionId: callQualityRecords.callSessionId,
      recordingStatus: callSessions.recordingStatus,
      recordingS3Key: callSessions.recordingS3Key,
      recordingUrl: callSessions.recordingUrl,
      telnyxCallId: callSessions.telnyxCallId,
      telnyxRecordingId: callSessions.telnyxRecordingId,
      startedAt: callSessions.startedAt,
      durationSec: callSessions.durationSec,
      showcaseCategory: callQualityRecords.showcaseCategory,
      showcasedAt: callQualityRecords.showcasedAt,
      cqrCreatedAt: callQualityRecords.createdAt,
    })
    .from(callQualityRecords)
    .innerJoin(callSessions, eq(callQualityRecords.callSessionId, callSessions.id))
    .where(
      and(
        buildShowcaseWhere(),
        lte(callSessions.durationSec, MAX_SHOWCASE_DURATION_SEC),
      )
    )
    .orderBy(desc(callQualityRecords.showcasedAt), desc(callQualityRecords.createdAt))
    .limit(Math.max(limit * 3, limit));

  const unique = new Map<string, ShowcaseSession>();
  for (const row of rows) {
    if (!unique.has(row.callSessionId)) {
      unique.set(row.callSessionId, {
        callSessionId: row.callSessionId,
        recordingStatus: row.recordingStatus,
        recordingS3Key: row.recordingS3Key,
        recordingUrl: row.recordingUrl,
        telnyxCallId: row.telnyxCallId,
        telnyxRecordingId: row.telnyxRecordingId,
        startedAt: row.startedAt,
        durationSec: row.durationSec,
        showcaseCategory: row.showcaseCategory,
        showcasedAt: row.showcasedAt,
      });
    }

    if (unique.size >= limit) break;
  }

  return Array.from(unique.values());
}

async function processOne(session: ShowcaseSession, canPersist: boolean) {
  const id = session.callSessionId;

  // Prefer non-cached resolvers first for guaranteed playability
  let resolved = await getPlayableRecordingLink(id, { skipCached: true });

  if (!resolved) {
    resolved = await getPlayableRecordingLink(id);
  }

  if (!resolved) {
    return { status: 'unresolved' as const, source: null as string | null };
  }

  // Already healthy from GCS
  if (resolved.source === 'gcs') {
    return { status: 'already_ok' as const, source: resolved.source };
  }

  // If we can persist and have a usable URL, store to GCS for long-term reliability
  const shouldPersist =
    canPersist &&
    resolved.url.startsWith('http') &&
    (resolved.source === 'telnyx_recording_id' ||
      resolved.source === 'telnyx_call_id' ||
      resolved.source === 'cached');

  if (!shouldPersist) {
    return { status: 'playable_not_persisted' as const, source: resolved.source };
  }

  if (DRY_RUN) {
    return { status: 'would_persist' as const, source: resolved.source };
  }

  const s3Key = await storeCallSessionRecording(id, resolved.url, session.durationSec || undefined);
  if (!s3Key) {
    return { status: 'persist_failed' as const, source: resolved.source };
  }

  const verified = await getPlayableRecordingLink(id, { skipCached: true });
  if (verified?.source === 'gcs') {
    return { status: 'persisted' as const, source: resolved.source };
  }

  // Still usable, but verify didn't come back as gcs yet.
  return { status: 'persisted_unverified' as const, source: verified?.source || resolved.source };
}

async function main() {
  console.log('\n========================================');
  console.log(' SHOWCASE RECORDINGS BACKFILL');
  console.log('========================================');
  console.log(`Mode: ${DRY_RUN ? 'DRY RUN' : 'LIVE'}`);
  console.log(`Scope: ${includeUnpinned ? 'Pinned + categorized showcase records' : 'Pinned showcase records'}`);
  console.log(`Limit: ${LIMIT}`);

  const canPersist = isRecordingStorageEnabled();
  if (!canPersist) {
    console.log('⚠ Recording storage is not enabled. Will validate playability only (no GCS persistence).');
  }

  const sessions = await getShowcaseSessions(LIMIT);
  console.log(`Found ${sessions.length} unique showcase call sessions to evaluate.\n`);

  if (sessions.length === 0) {
    console.log('No showcase sessions found.');
    return;
  }

  const stats = {
    alreadyOk: 0,
    wouldPersist: 0,
    persisted: 0,
    persistedUnverified: 0,
    playableNotPersisted: 0,
    unresolved: 0,
    persistFailed: 0,
    errors: 0,
  };

  const unresolvedIds: string[] = [];

  for (let i = 0; i < sessions.length; i++) {
    const session = sessions[i];
    const label = `[${i + 1}/${sessions.length}] ${session.callSessionId}`;

    try {
      const result = await processOne(session, canPersist);

      switch (result.status) {
        case 'already_ok':
          stats.alreadyOk++;
          console.log(`${label} ✅ already_playable_from_gcs`);
          break;
        case 'would_persist':
          stats.wouldPersist++;
          console.log(`${label} 🧪 would_persist_from_${result.source}`);
          break;
        case 'persisted':
          stats.persisted++;
          console.log(`${label} ✅ persisted_to_gcs_from_${result.source}`);
          break;
        case 'persisted_unverified':
          stats.persistedUnverified++;
          console.log(`${label} ⚠ persisted_but_not_yet_verified_gcs (current=${result.source})`);
          break;
        case 'playable_not_persisted':
          stats.playableNotPersisted++;
          console.log(`${label} ⚠ playable_from_${result.source}_not_persisted`);
          break;
        case 'persist_failed':
          stats.persistFailed++;
          unresolvedIds.push(session.callSessionId);
          console.log(`${label} ❌ persist_failed_from_${result.source}`);
          break;
        case 'unresolved':
          stats.unresolved++;
          unresolvedIds.push(session.callSessionId);
          console.log(`${label} ❌ unresolved_no_playable_source`);
          break;
      }
    } catch (error: any) {
      stats.errors++;
      unresolvedIds.push(session.callSessionId);
      console.log(`${label} ❌ error: ${error?.message || error}`);
    }
  }

  console.log('\n========================================');
  console.log(' RESULTS');
  console.log('========================================');
  console.log(`alreadyOk:            ${stats.alreadyOk}`);
  console.log(`wouldPersist:         ${stats.wouldPersist}`);
  console.log(`persisted:            ${stats.persisted}`);
  console.log(`persistedUnverified:  ${stats.persistedUnverified}`);
  console.log(`playableNotPersisted: ${stats.playableNotPersisted}`);
  console.log(`unresolved:           ${stats.unresolved}`);
  console.log(`persistFailed:        ${stats.persistFailed}`);
  console.log(`errors:               ${stats.errors}`);

  if (unresolvedIds.length > 0) {
    console.log('\nUnresolved callSessionIds:');
    for (const id of unresolvedIds) {
      console.log(` - ${id}`);
    }
  }

  if (DRY_RUN) {
    console.log('\nDry-run complete. Re-run without --dry-run to persist recoverable recordings to GCS.');
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('Backfill failed:', error);
    process.exit(1);
  });
