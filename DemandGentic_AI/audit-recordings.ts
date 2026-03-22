import { db } from "./server/db";
import { sql } from "drizzle-orm";
import "dotenv/config";

async function auditRecordings() {
  // Find all qualified/approved/pending_pm_review/published leads from last 7 days
  const leads = await db.execute(sql`
    SELECT 
      l.id, l.contact_name, l.account_name, l.qa_status, l.ai_score,
      l.recording_url,
      l.recording_s3_key,
      l.call_attempt_id,
      l.campaign_id,
      l.created_at,
      da.recording_url as attempt_recording_url
    FROM leads l
    LEFT JOIN dialer_call_attempts da ON da.id = l.call_attempt_id
    WHERE l.deleted_at IS NULL
      AND l.qa_status IN ('under_review', 'approved', 'pending_pm_review', 'published')
      AND l.created_at >= NOW() - INTERVAL '7 days'
    ORDER BY l.ai_score DESC NULLS LAST
  `);

  console.log(`\n=== RECORDING AUDIT: Qualified Leads (Last 7 Days) ===\n`);
  console.log(`Found ${leads.rows.length} leads\n`);

  let hasGcsKey = 0;
  let hasGcsUrl = 0;
  let hasTelnyxUrl = 0;
  let noRecording = 0;
  const missingGcs: any[] = [];

  for (const row of leads.rows as any[]) {
    const s3Key = row.recording_s3_key;
    const url = row.recording_url || '';
    const attemptUrl = row.attempt_recording_url || '';

    const isGcsKey = !!s3Key && (s3Key.startsWith('recordings/') || s3Key.startsWith('call-recordings/'));
    const isGcsUrl = url.includes('storage.googleapis.com') || url.includes('gcs-internal://');
    const isTelnyxUrl = url.includes('telnyx') || url.includes('api.telnyx.com');

    const hasAnyGcs = isGcsKey || isGcsUrl;
    
    if (isGcsKey) hasGcsKey++;
    if (isGcsUrl) hasGcsUrl++;
    if (isTelnyxUrl) hasTelnyxUrl++;

    if (!hasAnyGcs) {
      noRecording++;
      missingGcs.push(row);
    }

    const status = isGcsKey ? '✅ GCS Key' : 
                   isGcsUrl ? '✅ GCS URL' :
                   isTelnyxUrl ? '❌ Telnyx only (expires!)' :
                   url ? '❌ Unknown URL' : '❌ NO RECORDING';

    console.log(`  ${status} | ${row.contact_name} | score: ${row.ai_score} | qa: ${row.qa_status} | s3_key: ${s3Key || 'null'} | url_type: ${isGcsUrl ? 'GCS' : isTelnyxUrl ? 'Telnyx' : url ? 'other' : 'none'}`);
  }

  console.log(`\n--- Summary ---`);
  console.log(`  Total leads: ${leads.rows.length}`);
  console.log(`  With GCS S3 key: ${hasGcsKey}`);
  console.log(`  With GCS URL: ${hasGcsUrl}`);
  console.log(`  With Telnyx URL only: ${hasTelnyxUrl}`);
  console.log(`  Missing GCS recording: ${noRecording}`);

  if (missingGcs.length > 0) {
    console.log(`\n--- Leads Missing GCS Recording (${missingGcs.length}) ---`);
    for (const row of missingGcs) {
      console.log(`  ID: ${row.id} | ${row.contact_name} | url: ${(row.recording_url || '').substring(0, 80)} | attempt_url: ${(row.attempt_recording_url || '').substring(0, 80)} | session_url: ${(row.session_recording_url || '').substring(0, 80)}`);
    }
  }
}

auditRecordings().catch(console.error).finally(() => process.exit(0));