import 'dotenv/config';
import { db } from './server/db';
import { sql } from 'drizzle-orm';
import { execSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

const TELNYX_API_KEY = process.env.TELNYX_API_KEY;
const TELNYX_API_BASE = 'https://api.telnyx.com/v2';
const GCS_BUCKET = process.env.GCS_BUCKET || 'demandgentic-prod-storage-2026';

interface LeadInfo {
  id: string;
  name: string;
  callId: string; // v3 call_control_id
  score: string;
}

// The 23 missing leads with v3 call IDs (Ian Slater excluded - no call data)
const MISSING_LEADS: LeadInfo[] = [
  { id: '293ff82c-c7ef-4138-90b7-9c99d65e2422', name: 'Shamayel Alamiri', callId: 'v3:DKgyRxR0x1xevWrUWaz_9BXGfAaL3HFBY3g_uYdKZrOO4_9m1ytnrA', score: '53' },
  { id: '5a65f2e7-b09e-4890-a489-4cb92133502a', name: 'Matt Reddick', callId: 'v3:C11Eo8wBwzi8_OG3I6DfvQjxxFgAFrVuvG9R-cY7CSdNd4WdGm4C7A', score: '51' },
  { id: 'ba27e8a0-961a-4fd8-8dd3-a056fe976aaa', name: 'Aritro Chatterjee', callId: 'v3:1SS-nzHDgsbktwaQ3p3oJRNA_N_K4DttWgCH_MwV1oD-YZKfk1OM0w', score: '50' },
  { id: '14a5cf33-983f-4628-9c26-b086e68bfc21', name: 'Jeff Cruz', callId: 'v3:FN2M5r3oE5K3b3cQGInxi1tx95BZnKOOqbp88vPjf--XBuw4BYH20A', score: '49' },
  { id: '40fd460d-a6d3-4dd4-a0c1-824d89478c68', name: 'Ajay Kosada', callId: 'v3:ETYSgIMtMpWC_cCOpguUr_n6t7a95sEvdcxV_zTm0DnnKbkagV73vw', score: '49' },
  { id: 'c784e216-a146-4457-8f74-adb11b5d1c58', name: 'Matt Swanton', callId: 'v3:cKovg-NQyabcCjbxsUYr9WAMv351-ZIGG6SSUTAy_-jJjQh53dPkjw', score: '49' },
  { id: 'e0c10ef6-303f-4c40-85c9-68dd570f24a2', name: 'Diana Monk', callId: 'v3:oO7poS1_XanwwMuC_uHyJBoTagKUelEPQZRwsI3EiZPsv5jGjO6Yng', score: '48' },
  { id: '6c20d648-cec3-4001-81eb-a6578194cbc0', name: 'Tim White', callId: 'v3:mI1Pu3zk9Y7EOQNV0HS8TG8mM5hKRxEsYwf049VXlehD15O44Q8pkA', score: '48' },
  { id: '8cbc2df6-c300-4808-8ef8-71783563b21a', name: 'Scott Johnson', callId: 'v3:exyDqUbLiNSImKMgHr_MwQsD4xrbe8lXSoyyL3qgkimE5JGNyZrjlQ', score: '47' },
  { id: '8a981fa4-da13-4dc5-bd03-c296b5dd3021', name: 'Martin Ravell', callId: 'v3:vFpykb2bOORBFORYgmSgjHJn0blD_1fuLO6H5JnFFClgP8OhR7UEPg', score: '47' },
  { id: 'bbf2f4aa-d02f-4579-8b5a-e7887e5fe3ab', name: 'Ilona Uusitalo', callId: 'v3:g6CPbjqsqYipW8_8xReMlrehMSwcR2r_w8ga_oc46riSmVPoGZ_nxA', score: '47' },
  { id: '77fd3f9f-a5b8-405e-ae96-79e92abdf07d', name: 'Mike Glynn', callId: 'v3:Upf2_yza_5zDsaaTSX8f8DVxHlX-__k7Woi3r1Ko7WPrrFQNm9hlNA', score: '46' },
  { id: '4edd482a-5f70-48e4-be2e-d190d2307b2e', name: 'Alex Stara', callId: 'v3:UtH4gxMqr2kqMuxDsrr7lYArKpMdXkVHN9DIqg372DQkTE8W94MRpg', score: '46' },
  { id: '6b9f7e62-4bc3-450b-b355-0b03f4f5bbcb', name: 'Mark Rodrigues', callId: 'v3:_i3Ukr_VZSZ-A7WsFgDI2FhK87JdvbxAIxCgVW8G4wgkKAyTJaBFYg', score: '45' },
  { id: '76d7d2cd-901a-4b95-b64a-3572111f5533', name: 'Nancy Cooley', callId: 'v3:KKlOAFHQajD9M0qoCsgEI1cI4A_yh3sNvWsC2l1qhUzra9o3NY7_OQ', score: '44' },
  { id: 'c743c654-b808-49fe-a355-2eb3d8082915', name: 'Ryan Carter', callId: 'v3:BlzvQaBkppscoXOoC_gqhEx1uX7K1BWPl-TFBfTtuZwMUJx3_9memA', score: '44' },
  { id: '9b56d6c7-832f-45da-ab28-672ed144d62e', name: 'Kim Chang', callId: 'v3:yddYrfOVRhUt7Cw8-mkUhKZgYbqONBGQ_Qefuoo06-6MwxRLHHlb-g', score: '44' },
  { id: '816c6738-a4fb-4587-9ea7-7d31af76c441', name: 'Daniel Withrow', callId: 'v3:vQ3h_yo890__wnWtPbExYVe4WK3VxrL_QHrW7171MCszcJwSQtseUw', score: '42' },
  { id: '6e541f07-18dc-4200-a2b1-e121ab026151', name: 'Shubham Salwan', callId: 'v3:tDsyUeRENoOYiWmFCpi-hsEfBNqk1mnMoLJzM6DJVAyrX3p4pOaAzA', score: '42' },
  { id: '5ca369a1-dc54-428e-a37b-34365c3a3753', name: 'Angad Gill', callId: 'v3:QUIJSd9TT_1KLkr6pbclDyTHYLdzR1IN11gbxlladDpTVH2G_Phzwg', score: '42' },
  { id: 'c8b2ba1f-bb28-4f9e-a309-89d08af8f2bd', name: 'Wedad Abdulla', callId: 'v3:6iDmb-Nqy1GMPa-uyP3VR9FVLTvuaEK_TJepVyC9bKyyY7OTOmsl9g', score: '42' },
  { id: '2dfa7e11-3992-4e55-8e44-51d92621ad9d', name: 'David Ward', callId: 'v3:jWmayKVGyzcD4SZIJ63rYjxxr3QafMB8K4mAmUpXcvlJCDPOgUArww', score: '40' },
  { id: '687ab225-cec2-4688-b650-c58b6e755bfd', name: 'Daniella Morris', callId: 'v3:_9Lg5JEDVOexWkEoBq9lS0BJ_n2vPf2JIhAIPdCBRHzijgF5hd95bw', score: 'null' },
];

function sleep(ms: number): Promise {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function getLegIdFromCallEvents(callControlId: string): Promise {
  const url = `${TELNYX_API_BASE}/call_events?filter[call_control_id]=${encodeURIComponent(callControlId)}&page[size]=5`;
  const resp = await fetch(url, {
    headers: { 'Authorization': `Bearer ${TELNYX_API_KEY}` }
  });
  if (!resp.ok) return null;
  const data = await resp.json();
  if (data.data && data.data.length > 0) {
    return data.data[0].leg_id || null;
  }
  return null;
}

async function getRecordingByLegId(legId: string): Promise {
  const url = `${TELNYX_API_BASE}/recordings?filter[call_leg_id]=${encodeURIComponent(legId)}&page[size]=5`;
  const resp = await fetch(url, {
    headers: { 'Authorization': `Bearer ${TELNYX_API_KEY}` }
  });
  if (!resp.ok) return null;
  const data = await resp.json();
  if (data.data && data.data.length > 0) {
    const rec = data.data[0];
    const downloadUrl = rec.download_urls?.wav || rec.download_urls?.mp3;
    if (downloadUrl) {
      return { downloadUrl, recordingId: rec.id };
    }
  }
  return null;
}

async function downloadToTemp(url: string, leadId: string): Promise {
  try {
    const resp = await fetch(url);
    if (!resp.ok) {
      console.log(`    Download failed: ${resp.status}`);
      return null;
    }
    const buffer = Buffer.from(await resp.arrayBuffer());
    const ext = url.includes('.mp3') ? 'mp3' : 'wav';
    const tmpFile = path.join(os.tmpdir(), `recording_${leadId}.${ext}`);
    fs.writeFileSync(tmpFile, buffer);
    console.log(`    Downloaded ${buffer.length} bytes to ${tmpFile}`);
    return tmpFile;
  } catch (e: any) {
    console.log(`    Download error: ${e.message}`);
    return null;
  }
}

function uploadToGCS(localPath: string, gcsKey: string): boolean {
  try {
    const gcsPath = `gs://${GCS_BUCKET}/${gcsKey}`;
    execSync(`gcloud storage cp "${localPath}" "${gcsPath}"`, { stdio: 'pipe' });
    return true;
  } catch (e: any) {
    console.log(`    GCS upload error: ${e.message}`);
    return false;
  }
}

async function main() {
  if (!TELNYX_API_KEY) { console.error('TELNYX_API_KEY not set'); process.exit(1); }

  console.log('=== Recording Recovery via Call Events API ===\n');
  console.log('Strategy: v3 call_control_id → Call Events API → leg_id → Recordings API → download → upload to GCS\n');

  let recovered = 0, failed = 0, noEvents = 0, noRecording = 0;

  for (const lead of MISSING_LEADS) {
    console.log(`[${recovered + failed + noEvents + noRecording + 1}/${MISSING_LEADS.length}] ${lead.name} (score: ${lead.score})`);
    
    // Step 1: Get leg_id from call events
    console.log(`  Step 1: Getting leg_id from call events...`);
    const legId = await getLegIdFromCallEvents(lead.callId);
    
    if (!legId) {
      console.log(`  ❌ No call events found for v3 ID`);
      noEvents++;
      await sleep(500);
      continue;
    }
    console.log(`  leg_id: ${legId}`);

    // Step 2: Get recording using leg_id
    console.log(`  Step 2: Getting recording by leg_id...`);
    const recording = await getRecordingByLegId(legId);
    
    if (!recording) {
      console.log(`  ❌ No recording found for leg_id`);
      noRecording++;
      await sleep(500);
      continue;
    }
    console.log(`  Recording ID: ${recording.recordingId}`);
    console.log(`  Download URL: ${recording.downloadUrl.substring(0, 80)}...`);

    // Step 3: Download recording
    console.log(`  Step 3: Downloading recording...`);
    const tmpFile = await downloadToTemp(recording.downloadUrl, lead.id);
    if (!tmpFile) {
      console.log(`  ❌ Download failed`);
      failed++;
      await sleep(500);
      continue;
    }

    // Step 4: Upload to GCS
    const ext = tmpFile.endsWith('.mp3') ? 'mp3' : 'wav';
    const gcsKey = `recordings/${lead.id}.${ext}`;
    console.log(`  Step 4: Uploading to GCS as ${gcsKey}...`);
    const uploaded = uploadToGCS(tmpFile, gcsKey);
    
    // Clean up temp file
    try { fs.unlinkSync(tmpFile); } catch {}

    if (!uploaded) {
      console.log(`  ❌ GCS upload failed`);
      failed++;
      await sleep(500);
      continue;
    }

    // Step 5: Update database
    console.log(`  Step 5: Updating database...`);
    await db.execute(sql`
      UPDATE leads 
      SET recording_s3_key = ${gcsKey},
          recording_url = ${'https://storage.googleapis.com/' + GCS_BUCKET + '/' + gcsKey},
          telnyx_recording_id = ${recording.recordingId},
          updated_at = NOW()
      WHERE id = ${lead.id}
    `);

    console.log(`  ✅ RECOVERED: ${lead.name}`);
    recovered++;
    
    // Small delay between API calls
    await sleep(500);
  }

  console.log(`\n=== RESULTS ===`);
  console.log(`  Recovered: ${recovered}`);
  console.log(`  No call events: ${noEvents}`);
  console.log(`  No recording: ${noRecording}`);
  console.log(`  Failed download/upload: ${failed}`);
  console.log(`  Total: ${MISSING_LEADS.length}`);

  process.exit(0);
}
main().catch(e => { console.error(e); process.exit(1); });