import 'dotenv/config';
import { db } from './server/db';
import { sql } from 'drizzle-orm';
import { execSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

const TELNYX_API_KEY = process.env.TELNYX_API_KEY;
const TELNYX_API_BASE = 'https://api.telnyx.com/v2';
const GCS_BUCKET = process.env.GCS_BUCKET || 'demandgentic-ai-storage';

const ALL_IDS = [
  '293ff82c-c7ef-4138-90b7-9c99d65e2422','5a65f2e7-b09e-4890-a489-4cb92133502a',
  'ba27e8a0-961a-4fd8-8dd3-a056fe976aaa','14a5cf33-983f-4628-9c26-b086e68bfc21',
  '40fd460d-a6d3-4dd4-a0c1-824d89478c68','c784e216-a146-4457-8f74-adb11b5d1c58',
  'e0c10ef6-303f-4c40-85c9-68dd570f24a2','6c20d648-cec3-4001-81eb-a6578194cbc0',
  '8cbc2df6-c300-4808-8ef8-71783563b21a','8a981fa4-da13-4dc5-bd03-c296b5dd3021',
  'bbf2f4aa-d02f-4579-8b5a-e7887e5fe3ab','77fd3f9f-a5b8-405e-ae96-79e92abdf07d',
  '4edd482a-5f70-48e4-be2e-d190d2307b2e','6b9f7e62-4bc3-450b-b355-0b03f4f5bbcb',
  '76d7d2cd-901a-4b95-b64a-3572111f5533','c743c654-b808-49fe-a355-2eb3d8082915',
  '9b56d6c7-832f-45da-ab28-672ed144d62e','816c6738-a4fb-4587-9ea7-7d31af76c441',
  '6e541f07-18dc-4200-a2b1-e121ab026151','5ca369a1-dc54-428e-a37b-34365c3a3753',
  'c8b2ba1f-bb28-4f9e-a309-89d08af8f2bd','2dfa7e11-3992-4e55-8e44-51d92621ad9d',
  '687ab225-cec2-4688-b650-c58b6e755bfd','b599b3ef-6020-4d01-8e4b-3ee19d237bb9',
];

async function main() {
  if (!TELNYX_API_KEY) { console.error('TELNYX_API_KEY not set'); process.exit(1); }

  // Find which leads still need fixing
  const result = await db.execute(sql`
    SELECT l.id, l.contact_name, l.recording_url, l.recording_s3_key, l.ai_score,
           dca.recording_url as dca_url
    FROM leads l
    LEFT JOIN dialer_call_attempts dca ON dca.id = l.call_attempt_id
    WHERE l.id IN (${sql.join(ALL_IDS.map(id => sql`${id}`), sql`, `)})
      AND (l.recording_s3_key IS NULL OR l.recording_s3_key = '')
    ORDER BY l.ai_score DESC NULLS LAST
  `);

  console.log(`=== Resume Recording Recovery ===`);
  console.log(`Leads still missing recording_s3_key: ${result.rows.length}\n`);

  let recovered = 0, noLegId = 0, noRecording = 0, failed = 0;

  for (const r of result.rows as any[]) {
    const url = r.recording_url || r.dca_url || '';
    console.log(`[${recovered + noLegId + noRecording + failed + 1}/${result.rows.length}] ${r.contact_name} (score: ${r.ai_score})`);

    // Extract leg_id from S3 URL
    const match = url.match(/\/\d{4}-\d{2}-\d{2}\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/);
    if (!match) {
      console.log(`  ⏭️ No leg_id extractable (URL: ${url ? url.substring(0, 60) : 'NULL'})`);
      noLegId++;
      continue;
    }

    const legId = match[1];
    console.log(`  leg_id: ${legId}`);

    // Get recording from Telnyx
    try {
      const resp = await fetch(
        `${TELNYX_API_BASE}/recordings?filter[call_leg_id]=${encodeURIComponent(legId)}&page[size]=5`,
        { headers: { 'Authorization': `Bearer ${TELNYX_API_KEY}` } }
      );
      if (!resp.ok) { console.log(`  ❌ API error: ${resp.status}`); noRecording++; continue; }
      
      const data = await resp.json();
      if (!data.data || data.data.length === 0) { console.log(`  ❌ No recording for leg_id`); noRecording++; continue; }

      const rec = data.data[0];
      const downloadUrl = rec.download_urls?.wav || rec.download_urls?.mp3;
      if (!downloadUrl) { console.log(`  ❌ No download URL in recording`); noRecording++; continue; }

      console.log(`  Recording: ${rec.id}, duration: ${Math.round(rec.duration_millis/1000)}s`);

      // Download
      const dlResp = await fetch(downloadUrl);
      if (!dlResp.ok) { console.log(`  ❌ Download failed: ${dlResp.status}`); failed++; continue; }
      const buffer = Buffer.from(await dlResp.arrayBuffer());
      const ext = downloadUrl.includes('.mp3') ? 'mp3' : 'wav';
      const tmpFile = path.join(os.tmpdir(), `rec_${r.id}.${ext}`);
      fs.writeFileSync(tmpFile, buffer);

      // Upload to GCS
      const gcsKey = `recordings/${r.id}.${ext}`;
      try {
        execSync(`gcloud storage cp "${tmpFile}" "gs://${GCS_BUCKET}/${gcsKey}"`, { stdio: 'pipe' });
      } catch {
        console.log(`  ❌ GCS upload failed`);
        fs.unlinkSync(tmpFile);
        failed++;
        continue;
      }
      fs.unlinkSync(tmpFile);

      // Update DB
      await db.execute(sql`
        UPDATE leads 
        SET recording_s3_key = ${gcsKey},
            telnyx_recording_id = ${rec.id},
            updated_at = NOW()
        WHERE id = ${r.id}
      `);

      console.log(`  ✅ ${r.contact_name} (${Math.round(buffer.length/1024)}KB)`);
      recovered++;
    } catch (e: any) {
      console.log(`  ❌ Error: ${e.message}`);
      failed++;
    }

    await new Promise(r => setTimeout(r, 300));
  }

  console.log(`\n=== RESULTS ===`);
  console.log(`  Recovered: ${recovered}`);
  console.log(`  No leg_id: ${noLegId}`);
  console.log(`  No Telnyx recording: ${noRecording}`);
  console.log(`  Failed: ${failed}`);
  console.log(`  Total remaining: ${result.rows.length}`);

  process.exit(0);
}
main().catch(e => { console.error(e); process.exit(1); });
