/**
 * Audit NULL disposition campaign calls from yesterday (Feb 7, 2026)
 * and fetch Telnyx recordings for them
 */
import 'dotenv/config';
import { db } from './server/db';
import { callSessions, dialerCallAttempts } from './shared/schema';
import { and, isNull, gte, lt, sql, isNotNull, eq } from 'drizzle-orm';

const TELNYX_API_KEY = process.env.TELNYX_API_KEY;
const TELNYX_API_BASE = 'https://api.telnyx.com/v2';

async function fetchRecordingUrl(callControlId: string): Promise<string | null> {
  try {
    let resp = await fetch(
      `${TELNYX_API_BASE}/recordings?filter[call_control_id]=${encodeURIComponent(callControlId)}`,
      { headers: { Authorization: `Bearer ${TELNYX_API_KEY}` } }
    );
    if (resp.ok) {
      const data = await resp.json();
      if (data.data?.length > 0) {
        const rec = data.data[0];
        return rec.download_urls?.mp3 || rec.download_urls?.wav || null;
      }
    }
    resp = await fetch(
      `${TELNYX_API_BASE}/recordings?filter[call_leg_id]=${encodeURIComponent(callControlId)}`,
      { headers: { Authorization: `Bearer ${TELNYX_API_KEY}` } }
    );
    if (resp.ok) {
      const data = await resp.json();
      if (data.data?.length > 0) {
        const rec = data.data[0];
        return rec.download_urls?.mp3 || rec.download_urls?.wav || null;
      }
    }
    return null;
  } catch { return null; }
}

async function main() {
  const yesterday = new Date('2026-02-07T00:00:00Z');
  const today = new Date('2026-02-08T00:00:00Z');

  console.log('='.repeat(80));
  console.log('AUDIT: NULL Disposition Campaign Calls - Feb 7, 2026');
  console.log('='.repeat(80));

  // 1. dialer_call_attempts with NULL disposition
  console.log('\n📊 PART 1: dialer_call_attempts with NULL disposition yesterday\n');
  const nullAttempts = await db.select({
    id: dialerCallAttempts.id,
    phoneDialed: dialerCallAttempts.phoneDialed,
    connected: dialerCallAttempts.connected,
    callStartedAt: dialerCallAttempts.callStartedAt,
    callDurationSeconds: dialerCallAttempts.callDurationSeconds,
    disposition: dialerCallAttempts.disposition,
    telnyxCallId: dialerCallAttempts.telnyxCallId,
    recordingUrl: dialerCallAttempts.recordingUrl,
    fullTranscript: dialerCallAttempts.fullTranscript,
    notes: dialerCallAttempts.notes,
    createdAt: dialerCallAttempts.createdAt,
  })
  .from(dialerCallAttempts)
  .where(and(
    gte(dialerCallAttempts.createdAt, yesterday),
    lt(dialerCallAttempts.createdAt, today),
    isNull(dialerCallAttempts.disposition),
  ))
  .orderBy(dialerCallAttempts.createdAt);

  console.log(`Found ${nullAttempts.length} with NULL disposition\n`);
  for (const a of nullAttempts) {
    console.log(`  ${a.id} | ${a.phoneDialed} | ${a.callDurationSeconds ?? '?'}s | connected=${a.connected} | telnyx=${a.telnyxCallId?.substring(0, 25) ?? 'NULL'} | recording=${a.recordingUrl ? 'YES' : 'NO'} | transcript=${a.fullTranscript ? a.fullTranscript.length + 'ch' : 'NULL'}`);
  }

  // 2. Disposition breakdown
  console.log('\n📊 PART 2: Disposition Breakdown (all yesterday)\n');
  const breakdown = await db.select({
    disposition: dialerCallAttempts.disposition,
    count: sql<number>`count(*)::int`,
    avgDur: sql<number>`coalesce(avg(call_duration_seconds),0)::int`,
    connected: sql<number>`sum(case when connected then 1 else 0 end)::int`,
    hasTranscript: sql<number>`sum(case when full_transcript is not null and full_transcript != '' then 1 else 0 end)::int`,
    hasRecording: sql<number>`sum(case when recording_url is not null then 1 else 0 end)::int`,
  })
  .from(dialerCallAttempts)
  .where(and(gte(dialerCallAttempts.createdAt, yesterday), lt(dialerCallAttempts.createdAt, today)))
  .groupBy(dialerCallAttempts.disposition);

  console.log('Disposition          | Count | AvgDur | Connected | Transcript | Recording');
  console.log('-'.repeat(85));
  for (const r of breakdown) {
    console.log(`${String(r.disposition ?? 'NULL').padEnd(20)} | ${String(r.count).padStart(5)} | ${String(r.avgDur).padStart(5)}s | ${String(r.connected).padStart(9)} | ${String(r.hasTranscript).padStart(10)} | ${String(r.hasRecording).padStart(9)}`);
  }

  // 3. call_sessions with NULL aiDisposition (campaign only)
  console.log('\n📊 PART 3: call_sessions NULL aiDisposition (campaign) yesterday\n');
  const nullSessions = await db.select({
    id: callSessions.id,
    telnyxCallId: callSessions.telnyxCallId,
    toNumberE164: callSessions.toNumberE164,
    durationSec: callSessions.durationSec,
    status: callSessions.status,
    aiDisposition: callSessions.aiDisposition,
    recordingUrl: callSessions.recordingUrl,
    recordingStatus: callSessions.recordingStatus,
    campaignId: callSessions.campaignId,
    aiTranscript: callSessions.aiTranscript,
    startedAt: callSessions.startedAt,
  })
  .from(callSessions)
  .where(and(
    gte(callSessions.startedAt, yesterday),
    lt(callSessions.startedAt, today),
    isNull(callSessions.aiDisposition),
    isNotNull(callSessions.campaignId),
  ))
  .orderBy(callSessions.startedAt);

  console.log(`Found ${nullSessions.length} campaign call_sessions with NULL aiDisposition\n`);
  for (const s of nullSessions.slice(0, 20)) {
    console.log(`  ${s.id} | ${s.toNumberE164} | ${s.durationSec ?? '?'}s | status=${s.status} | recording=${s.recordingUrl ? 'YES' : s.recordingStatus} | transcript=${s.aiTranscript ? s.aiTranscript.length + 'ch' : 'NULL'}`);
  }

  // 4. Fetch Telnyx recordings
  console.log('\n📊 PART 4: Fetching Telnyx recordings for NULL-disposition calls\n');
  const telnyxIds: { source: string; id: string; callId: string; phone: string; duration: number | null }[] = [];

  for (const a of nullAttempts) {
    if (a.telnyxCallId) telnyxIds.push({ source: 'attempts', id: a.id, callId: a.telnyxCallId, phone: a.phoneDialed, duration: a.callDurationSeconds });
  }
  for (const s of nullSessions) {
    if (s.telnyxCallId && !telnyxIds.find(t => t.callId === s.telnyxCallId)) {
      telnyxIds.push({ source: 'sessions', id: s.id, callId: s.telnyxCallId, phone: s.toNumberE164, duration: s.durationSec });
    }
  }

  console.log(`Checking ${telnyxIds.length} Telnyx call IDs for recordings...\n`);
  const found: typeof telnyxIds[0] & { url: string }[] = [];

  for (const entry of telnyxIds) {
    const url = await fetchRecordingUrl(entry.callId);
    if (url) {
      found.push({ ...entry, url });
      console.log(`  ✅ ${entry.phone} (${entry.duration ?? '?'}s): ${url.substring(0, 100)}...`);
    } else {
      console.log(`  ❌ ${entry.phone} (${entry.duration ?? '?'}s): No recording`);
    }
    await new Promise(r => setTimeout(r, 150));
  }

  // 5. Suspicious not_interested (≥45s)
  console.log('\n📊 PART 5: Possibly misclassified not_interested (≥45s duration)\n');
  const suspicious = await db.select({
    id: dialerCallAttempts.id,
    phoneDialed: dialerCallAttempts.phoneDialed,
    callDurationSeconds: dialerCallAttempts.callDurationSeconds,
    connected: dialerCallAttempts.connected,
    fullTranscript: dialerCallAttempts.fullTranscript,
    notes: dialerCallAttempts.notes,
    telnyxCallId: dialerCallAttempts.telnyxCallId,
  })
  .from(dialerCallAttempts)
  .where(and(
    gte(dialerCallAttempts.createdAt, yesterday),
    lt(dialerCallAttempts.createdAt, today),
    eq(dialerCallAttempts.disposition, 'not_interested'),
    sql`${dialerCallAttempts.callDurationSeconds} >= 45`,
  ))
  .orderBy(sql`${dialerCallAttempts.callDurationSeconds} desc`);

  console.log(`Found ${suspicious.length} not_interested calls ≥ 45s\n`);
  for (const c of suspicious.slice(0, 15)) {
    console.log(`  ${c.id} | ${c.phoneDialed} | ${c.callDurationSeconds}s | connected=${c.connected}`);
    if (c.fullTranscript) console.log(`    Transcript: ${c.fullTranscript.substring(0, 250)}`);
    else console.log(`    Transcript: NULL`);
    console.log();
  }

  // Also fetch recordings for suspicious not_interested calls
  if (suspicious.length > 0) {
    console.log('\n🎵 Fetching recordings for suspicious not_interested calls...\n');
    for (const c of suspicious.slice(0, 15)) {
      if (c.telnyxCallId) {
        const url = await fetchRecordingUrl(c.telnyxCallId);
        if (url) {
          console.log(`  ✅ ${c.phoneDialed} (${c.callDurationSeconds}s): ${url.substring(0, 100)}...`);
        } else {
          console.log(`  ❌ ${c.phoneDialed} (${c.callDurationSeconds}s): No recording`);
        }
        await new Promise(r => setTimeout(r, 150));
      }
    }
  }

  // SUMMARY
  console.log('\n' + '='.repeat(80));
  console.log('SUMMARY');
  console.log('='.repeat(80));
  console.log(`NULL-disposition dialer_call_attempts: ${nullAttempts.length}`);
  console.log(`NULL-disposition call_sessions (campaign): ${nullSessions.length}`);
  console.log(`Telnyx IDs checked: ${telnyxIds.length}`);
  console.log(`Recordings found: ${found.length}`);
  console.log(`Suspicious not_interested (≥45s): ${suspicious.length}`);

  if (found.length > 0) {
    console.log('\n🎵 ALL RECORDING URLS:');
    for (const r of found) {
      console.log(`  ${r.phone} (${r.duration ?? '?'}s): ${r.url}`);
    }
  }

  process.exit(0);
}

main().catch(err => { console.error('FATAL:', err); process.exit(1); });
