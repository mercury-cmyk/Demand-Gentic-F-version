import { db } from "./server/db";
import { sql } from "drizzle-orm";
import { Storage } from "@google-cloud/storage";
import { uploadToS3 } from "./server/lib/storage";
import "dotenv/config";

const GCS_BUCKET = process.env.GCS_BUCKET || 'demandgentic-prod-storage-2026';
const storage = new Storage({ projectId: process.env.GCS_PROJECT_ID || process.env.GOOGLE_CLOUD_PROJECT });
const bucket = storage.bucket(GCS_BUCKET);

const TELNYX_API_KEY = process.env.TELNYX_API_KEY;

async function fixRemainingRecordings() {
  const missing = await db.execute(sql`
    SELECT DISTINCT ON (l.id)
      l.id, l.contact_name, l.qa_status, l.ai_score,
      l.recording_url,
      da.telnyx_call_id as da_telnyx_id
    FROM leads l
    LEFT JOIN dialer_call_attempts da ON da.id = l.call_attempt_id
    WHERE l.deleted_at IS NULL
      AND l.qa_status IN ('under_review', 'approved', 'pending_pm_review', 'published')
      AND l.created_at >= NOW() - INTERVAL '7 days'
      AND l.recording_s3_key IS NULL
    ORDER BY l.id, l.ai_score DESC NULLS LAST
  `);

  console.log(`=== FIX REMAINING ${missing.rows.length} RECORDINGS ===\n`);

  let fixed = 0;
  let notFound = 0;

  for (const row of missing.rows as any[]) {
    const leadId = row.id;
    console.log(`\n${row.contact_name} (${leadId}, score: ${row.ai_score}):`);

    // Strategy 1: Check if file already exists in GCS bucket
    const possibleKeys = [
      `recordings/${leadId}.wav`,
      `recordings/${leadId}.mp3`,
    ];

    let foundKey: string | null = null;
    for (const key of possibleKeys) {
      try {
        const [exists] = await bucket.file(key).exists();
        if (exists) {
          foundKey = key;
          break;
        }
      } catch (e) {}
    }

    if (foundKey) {
      console.log(`  ✅ Found in GCS: ${foundKey}`);
      await db.execute(sql`UPDATE leads SET recording_s3_key = ${foundKey}, updated_at = NOW() WHERE id = ${leadId}`);
      fixed++;
      continue;
    }

    // Strategy 2: Try Telnyx call recordings API using v3 call ID with proper URL encoding
    const telnyxCallId = row.da_telnyx_id;
    if (telnyxCallId && TELNYX_API_KEY) {
      try {
        // Try listing recordings from Telnyx
        const url = `https://api.telnyx.com/v2/recordings?filter[call_leg_id]=${encodeURIComponent(telnyxCallId)}`;
        const resp = await fetch(url, {
          headers: { 'Authorization': `Bearer ${TELNYX_API_KEY}` },
          signal: AbortSignal.timeout(15000)
        });
        
        if (resp.ok) {
          const data = await resp.json();
          if (data.data && data.data.length > 0) {
            const rec = data.data[0];
            const dlUrl = rec.download_urls?.mp3 || rec.download_urls?.wav;
            if (dlUrl) {
              console.log(`  🔄 Got fresh URL from Telnyx, downloading...`);
              const dlResp = await fetch(dlUrl, { signal: AbortSignal.timeout(30000) });
              if (dlResp.ok) {
                const buf = Buffer.from(await dlResp.arrayBuffer());
                if (buf.length > 500) {
                  const ext = dlUrl.includes('.wav') ? 'wav' : 'mp3';
                  const s3Key = `recordings/${leadId}.${ext}`;
                  await uploadToS3(s3Key, buf, ext === 'wav' ? 'audio/wav' : 'audio/mpeg');
                  await db.execute(sql`UPDATE leads SET recording_s3_key = ${s3Key}, recording_url = ${dlUrl}, updated_at = NOW() WHERE id = ${leadId}`);
                  console.log(`  ✅ Downloaded and uploaded: ${s3Key} (${(buf.length/1024).toFixed(0)} KB)`);
                  fixed++;
                  continue;
                }
              }
            }
          }
        }
      } catch (e: any) {
        // Ignore Telnyx errors
      }
    }

    // Strategy 3: Check if there's a call-recordings/ prefix match via campaign
    try {
      const [campaignResult] = (await db.execute(sql`
        SELECT l.campaign_id FROM leads l WHERE l.id = ${leadId}
      `)).rows as any[];
      
      if (campaignResult?.campaign_id) {
        const prefix = `call-recordings/${campaignResult.campaign_id}/`;
        const [files] = await bucket.getFiles({ prefix, maxResults: 500 });
        
        // Check if any file name matches the telnyx call ID
        for (const file of files) {
          const fileName = file.name;
          // Check if this file could belong to this lead (by call session matching)
          if (telnyxCallId) {
            // Look for files that might match based on call session data  
            const sessions = await db.execute(sql`
              SELECT cs.id FROM call_sessions cs 
              WHERE cs.telnyx_call_id = ${telnyxCallId} 
              AND cs.recording_s3_key = ${fileName}
            `);
            if (sessions.rows.length > 0) {
              console.log(`  ✅ Found matching campaign recording: ${fileName}`);
              await db.execute(sql`UPDATE leads SET recording_s3_key = ${fileName}, updated_at = NOW() WHERE id = ${leadId}`);
              fixed++;
              continue;
            }
          }
        }
      }
    } catch (e: any) {
      // Ignore
    }

    console.log(`  ❌ No recording found - expired Telnyx URL, no GCS file, no API access`);
    notFound++;
  }

  console.log(`\n=== RESULTS ===`);
  console.log(`  Fixed: ${fixed}`);
  console.log(`  Not recoverable: ${notFound}`);
  console.log(`  Total: ${missing.rows.length}`);
}

fixRemainingRecordings().catch(console.error).finally(() => process.exit(0));