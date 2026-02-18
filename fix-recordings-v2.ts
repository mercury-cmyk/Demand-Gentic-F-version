import 'dotenv/config';
import { db } from './server/db';
import { sql } from 'drizzle-orm';
import { execSync } from 'child_process';

const TELNYX_API_KEY = process.env.TELNYX_API_KEY;
const TELNYX_API_BASE = 'https://api.telnyx.com/v2';
const GCS_BUCKET = process.env.GCS_BUCKET || 'demandgentic-storage';

const LEAD_IDS = [
  '293ff82c-c7ef-4138-90b7-9c99d65e2422',
  '5a65f2e7-b09e-4890-a489-4cb92133502a',
  'ba27e8a0-961a-4fd8-8dd3-a056fe976aaa',
  '14a5cf33-983f-4628-9c26-b086e68bfc21',
  '40fd460d-a6d3-4dd4-a0c1-824d89478c68',
  'c784e216-a146-4457-8f74-adb11b5d1c58',
  'e0c10ef6-303f-4c40-85c9-68dd570f24a2',
  '6c20d648-cec3-4001-81eb-a6578194cbc0',
  '8cbc2df6-c300-4808-8ef8-71783563b21a',
  '8a981fa4-da13-4dc5-bd03-c296b5dd3021',
  'bbf2f4aa-d02f-4579-8b5a-e7887e5fe3ab',
  '77fd3f9f-a5b8-405e-ae96-79e92abdf07d',
  '4edd482a-5f70-48e4-be2e-d190d2307b2e',
  '6b9f7e62-4bc3-450b-b355-0b03f4f5bbcb',
  '76d7d2cd-901a-4b95-b64a-3572111f5533',
  'c743c654-b808-49fe-a355-2eb3d8082915',
  '9b56d6c7-832f-45da-ab28-672ed144d62e',
  '816c6738-a4fb-4587-9ea7-7d31af76c441',
  '6e541f07-18dc-4200-a2b1-e121ab026151',
  '5ca369a1-dc54-428e-a37b-34365c3a3753',
  'c8b2ba1f-bb28-4f9e-a309-89d08af8f2bd',
  '2dfa7e11-3992-4e55-8e44-51d92621ad9d',
  '687ab225-cec2-4688-b650-c58b6e755bfd',
  'b599b3ef-6020-4d01-8e4b-3ee19d237bb9', // Ian Slater
];

async function main() {
  console.log('=== Step 1: Revert bad recording updates ===\n');

  // Get the leads that were incorrectly updated (have recording_s3_key matching wrong pattern)
  const wrongRecording = '5b35765f-600a-4b53-91fb-a7790fff3a58';
  
  // Revert: Clear recording_s3_key and telnyx_recording_id for all 24 leads
  // Restore their original recording_url from dialer_call_attempts
  for (const id of LEAD_IDS) {
    // Get original recording URL from dialer_call_attempts
    const origResult = await db.execute(sql`
      SELECT dca.recording_url as orig_url
      FROM leads l
      LEFT JOIN dialer_call_attempts dca ON dca.id = l.call_attempt_id
      WHERE l.id = ${id}
    `);
    const origUrl = (origResult.rows[0] as any)?.orig_url || null;

    await db.execute(sql`
      UPDATE leads 
      SET recording_s3_key = NULL,
          recording_url = ${origUrl},
          telnyx_recording_id = NULL,
          updated_at = NOW()
      WHERE id = ${id}
    `);
  }
  console.log(`Reverted ${LEAD_IDS.length} leads to original state`);

  // Delete wrong files from GCS
  console.log('\n=== Step 2: Delete wrong recordings from GCS ===\n');
  for (const id of LEAD_IDS) {
    try {
      execSync(`gcloud storage rm "gs://${GCS_BUCKET}/recordings/${id}.wav" 2>NUL`, { stdio: 'pipe' });
      console.log(`  Deleted recordings/${id}.wav`);
    } catch {
      // File may not exist
    }
  }

  // Now get FULL expired URLs to extract leg_ids
  console.log('\n=== Step 3: Get full expired URLs and extract leg_ids ===\n');
  
  const leadsResult = await db.execute(sql`
    SELECT l.id, l.contact_name, l.recording_url, l.ai_score,
           dca.recording_url as dca_url
    FROM leads l
    LEFT JOIN dialer_call_attempts dca ON dca.id = l.call_attempt_id
    WHERE l.id IN (${sql.join(LEAD_IDS.map(id => sql`${id}`), sql`, `)})
    ORDER BY l.ai_score DESC NULLS LAST
  `);

  interface LeadWithLegId {
    id: string;
    name: string;
    legId: string;
    score: string;
  }
  
  const leadsWithLegIds: LeadWithLegId[] = [];
  const leadsWithoutUrls: string[] = [];

  for (const r of leadsResult.rows as any[]) {
    // Get the recording URL (try lead first, then dca)
    const url = r.recording_url || r.dca_url || '';
    
    if (!url.includes('telephony-recorder-prod')) {
      console.log(`  ${r.contact_name} (${r.id}): NO S3 URL - cannot extract leg_id`);
      leadsWithoutUrls.push(r.id);
      continue;
    }

    // Extract leg_id from S3 URL
    // Pattern: .../date/LEG_ID-TIMESTAMP.wav?...
    // Example: .../2026-02-18/e7705cd8-0c69-11f1-8f15-02420a1f0a70-1771378442.wav?...
    const match = url.match(/\/\d{4}-\d{2}-\d{2}\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/);
    
    if (match) {
      const legId = match[1];
      console.log(`  ${r.contact_name}: leg_id = ${legId}`);
      leadsWithLegIds.push({ id: r.id, name: r.contact_name, legId, score: r.ai_score || 'null' });
    } else {
      console.log(`  ${r.contact_name}: Could not extract leg_id from URL: ${url.substring(0, 120)}`);
      leadsWithoutUrls.push(r.id);
    }
  }

  console.log(`\nExtracted leg_ids: ${leadsWithLegIds.length}`);
  console.log(`Without URLs / unextractable: ${leadsWithoutUrls.length}`);

  if (leadsWithLegIds.length === 0) {
    console.log('No leg_ids extracted. Exiting.');
    process.exit(0);
  }

  // Step 4: Use leg_ids to get fresh download URLs from Telnyx
  console.log('\n=== Step 4: Get fresh download URLs using leg_ids ===\n');

  let recovered = 0, failed = 0;
  const fs = await import('fs');
  const path = await import('path');
  const os = await import('os');
  
  for (const lead of leadsWithLegIds) {
    console.log(`[${recovered + failed + 1}/${leadsWithLegIds.length}] ${lead.name} (score: ${lead.score})`);
    console.log(`  leg_id: ${lead.legId}`);

    // Get recording from Telnyx using leg_id
    const recUrl = `${TELNYX_API_BASE}/recordings?filter[call_leg_id]=${encodeURIComponent(lead.legId)}&page[size]=5`;
    const resp = await fetch(recUrl, {
      headers: { 'Authorization': `Bearer ${TELNYX_API_KEY}` }
    });
    
    if (!resp.ok) {
      console.log(`  ❌ Telnyx API error: ${resp.status}`);
      failed++;
      continue;
    }

    const data = await resp.json();
    if (!data.data || data.data.length === 0) {
      console.log(`  ❌ No recording found for leg_id`);
      failed++;
      continue;
    }

    const rec = data.data[0];
    const downloadUrl = rec.download_urls?.wav || rec.download_urls?.mp3;
    if (!downloadUrl) {
      console.log(`  ❌ Recording found but no download URL`);
      failed++;
      continue;
    }

    console.log(`  Recording ID: ${rec.id}, duration: ${rec.duration_millis}ms`);

    // Download
    const dlResp = await fetch(downloadUrl);
    if (!dlResp.ok) {
      console.log(`  ❌ Download failed: ${dlResp.status}`);
      failed++;
      continue;
    }
    const buffer = Buffer.from(await dlResp.arrayBuffer());
    const ext = downloadUrl.includes('.mp3') ? 'mp3' : 'wav';
    const tmpFile = path.join(os.tmpdir(), `rec_${lead.id}.${ext}`);
    fs.writeFileSync(tmpFile, buffer);
    console.log(`  Downloaded ${buffer.length} bytes`);

    // Upload to GCS
    const gcsKey = `recordings/${lead.id}.${ext}`;
    try {
      execSync(`gcloud storage cp "${tmpFile}" "gs://${GCS_BUCKET}/${gcsKey}"`, { stdio: 'pipe' });
    } catch (e: any) {
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
      WHERE id = ${lead.id}
    `);

    console.log(`  ✅ RECOVERED: ${lead.name} (${buffer.length} bytes)`);
    recovered++;
    
    // Brief delay
    await new Promise(r => setTimeout(r, 300));
  }

  console.log(`\n=== FINAL RESULTS ===`);
  console.log(`  Recovered with correct recording: ${recovered}`);
  console.log(`  Failed: ${failed}`);
  console.log(`  Leads without URLs (unrecoverable): ${leadsWithoutUrls.length}`);
  console.log(`  Total: ${LEAD_IDS.length}`);

  process.exit(0);
}
main().catch(e => { console.error(e); process.exit(1); });
