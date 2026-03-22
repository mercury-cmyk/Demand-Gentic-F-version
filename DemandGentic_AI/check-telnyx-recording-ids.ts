import { db } from "./server/db";
import { sql } from "drizzle-orm";
import "dotenv/config";

const TELNYX_API_KEY = process.env.TELNYX_API_KEY;

async function tryFetchViaRecordingId() {
  // Get the remaining leads missing GCS and check if we can find telnyx_recording_id
  const missing = await db.execute(sql`
    SELECT 
      l.id, l.contact_name, l.recording_url,
      da.telnyx_call_id as da_telnyx_call_id,
      da.id as call_attempt_id,
      cs.telnyx_call_id as cs_telnyx_call_id,
      cs.telnyx_recording_id as cs_recording_id,
      cs.recording_url as cs_recording_url,
      cs.recording_s3_key as cs_s3_key,
      cs.id as cs_id
    FROM leads l
    LEFT JOIN dialer_call_attempts da ON da.id = l.call_attempt_id
    LEFT JOIN call_sessions cs ON cs.contact_id = l.contact_id AND cs.campaign_id = l.campaign_id
    WHERE l.deleted_at IS NULL
      AND l.qa_status IN ('under_review', 'approved', 'pending_pm_review', 'published')
      AND l.created_at >= NOW() - INTERVAL '7 days'
      AND l.recording_s3_key IS NULL
    ORDER BY l.contact_name
  `);

  console.log(`\n=== Checking Telnyx Recording IDs for ${missing.rows.length} missing leads ===\n`);

  for (const row of missing.rows as any[]) {
    console.log(`${row.contact_name}:`);
    console.log(`  lead_id: ${row.id}`);
    console.log(`  da_telnyx_call_id: ${row.da_telnyx_call_id || 'null'}`);
    console.log(`  cs_telnyx_call_id: ${row.cs_telnyx_call_id || 'null'}`);
    console.log(`  cs_recording_id: ${row.cs_recording_id || 'null'}`);
    console.log(`  cs_s3_key: ${row.cs_s3_key || 'null'}`);
    console.log(`  cs_recording_url: ${(row.cs_recording_url || '').substring(0, 80) || 'null'}`);
    
    // Try to get recording via the telnyx_recording_id
    if (row.cs_recording_id && TELNYX_API_KEY) {
      try {
        const resp = await fetch(`https://api.telnyx.com/v2/recordings/${row.cs_recording_id}`, {
          headers: { 'Authorization': `Bearer ${TELNYX_API_KEY}` }
        });
        if (resp.ok) {
          const data = await resp.json();
          const dlUrl = data.data?.download_urls?.mp3 || data.data?.download_urls?.wav;
          console.log(`  TELNYX_RECORDING_API: ${dlUrl ? '✅ GOT URL' : '⚠️ No download URL'}`);
          if (dlUrl) console.log(`  download_url: ${dlUrl.substring(0, 100)}`);
        } else {
          console.log(`  TELNYX_RECORDING_API: ❌ ${resp.status}`);
        }
      } catch (err: any) {
        console.log(`  TELNYX_RECORDING_API: ❌ ${err.message?.substring(0, 60)}`);
      }
    }
    console.log('');
  }
}

tryFetchViaRecordingId().catch(console.error).finally(() => process.exit(0));