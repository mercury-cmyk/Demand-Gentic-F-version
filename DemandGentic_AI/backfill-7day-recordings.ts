import { db } from "./server/db";
import { sql } from "drizzle-orm";
import { uploadToS3 } from "./server/lib/storage";
import { fetchTelnyxRecording } from "./server/services/telnyx-recordings";
import "dotenv/config";

const RECORDING_PREFIX = 'recordings';

async function backfillRecordingsToGCS() {
  console.log("=== BACKFILL RECORDINGS TO GCS (with Telnyx API refresh) ===\n");

  // Find leads from last 7 days in QA/approved statuses missing GCS recordings
  const missing = await db.execute(sql`
    SELECT 
      l.id, l.contact_name, l.account_name, l.qa_status, l.ai_score,
      l.recording_url,
      l.recording_s3_key,
      da.recording_url as attempt_recording_url,
      da.telnyx_call_id as attempt_telnyx_call_id,
      cs.telnyx_call_id as session_telnyx_call_id,
      cs.recording_url as session_recording_url,
      cs.recording_s3_key as session_s3_key
    FROM leads l
    LEFT JOIN dialer_call_attempts da ON da.id = l.call_attempt_id
    LEFT JOIN call_sessions cs ON cs.contact_id = l.contact_id AND cs.campaign_id = l.campaign_id
    WHERE l.deleted_at IS NULL
      AND l.qa_status IN ('under_review', 'approved', 'pending_pm_review', 'published')
      AND l.created_at >= NOW() - INTERVAL '7 days'
      AND l.recording_s3_key IS NULL
    ORDER BY l.ai_score DESC NULLS LAST
  `);

  console.log(`Found ${missing.rows.length} leads missing GCS recording key\n`);

  let downloaded = 0;
  let copiedFromSession = 0;
  let failed = 0;
  let noUrl = 0;

  for (const row of missing.rows as any[]) {
    const leadId = row.id;
    
    // Strategy 1: Copy from call_sessions if it has a GCS key already
    if (row.session_s3_key) {
      console.log(`  📋 ${row.contact_name} - Copying S3 key from call_session: ${row.session_s3_key}`);
      await db.execute(sql`
        UPDATE leads SET recording_s3_key = ${row.session_s3_key}, updated_at = NOW() WHERE id = ${leadId}
      `);
      copiedFromSession++;
      continue;
    }

    // Strategy 2: Try to get a fresh URL from Telnyx API
    const telnyxCallId = row.attempt_telnyx_call_id || row.session_telnyx_call_id;
    let downloadUrl: string | null = null;
    
    if (telnyxCallId) {
      try {
        console.log(`  🔄 ${row.contact_name} - Fetching fresh URL from Telnyx API (call: ${telnyxCallId})...`);
        downloadUrl = await fetchTelnyxRecording(telnyxCallId);
        if (downloadUrl) {
          console.log(`    ✅ Got fresh Telnyx URL`);
        } else {
          console.log(`    ⚠️  Telnyx API returned no recording`);
        }
      } catch (err: any) {
        console.log(`    ⚠️  Telnyx API error: ${err.message?.substring(0, 80)}`);
      }
    }

    // Strategy 3: Try the existing URLs (may work if not expired)
    if (!downloadUrl) {
      downloadUrl = row.recording_url || row.attempt_recording_url || row.session_recording_url || '';
    }

    if (!downloadUrl || downloadUrl.trim().length === 0) {
      console.log(`  ⏭️  ${row.contact_name} (${leadId}) - NO recording URL available`);
      noUrl++;
      continue;
    }

    try {
      const response = await fetch(downloadUrl, { 
        redirect: 'follow',
        signal: AbortSignal.timeout(30000)
      } as any);

      if (!response.ok) {
        console.log(`    ❌ Download failed: HTTP ${response.status}`);
        failed++;
        continue;
      }

      const arrayBuffer = await response.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);

      if (buffer.length  process.exit(0));