import 'dotenv/config';
import { neon } from '@neondatabase/serverless';
import { Storage } from '@google-cloud/storage';

const sql = neon(process.env.DATABASE_URL!);
const TELNYX_API_KEY = process.env.TELNYX_API_KEY!;

const storage = new Storage({ projectId: process.env.GCS_PROJECT_ID || 'demandgentic' });
const bucket = storage.bucket(process.env.GCS_BUCKET || 'demandgentic-prod-storage-2026');

// These 4 leads have expired S3 URLs in call_session.recording_url (not on lead or DCA)
const leadsWithSessionUrls = [
  { name: 'Tim White', sessionUrl: 'https://s3.amazonaws.com/telephony-recorder-prod/57bd0f26-ee4a-46e5-961e-baeb66744372/2026-02-17/25478362-0b96-11f1-80b0-02420aef96a1-1771287492.wav' },
  { name: 'Scott Johnson', sessionUrl: 'https://s3.amazonaws.com/telephony-recorder-prod/57bd0f26-ee4a-46e5-961e-baeb66744372/2026-02-12/37011b08-0822-11f1-a25b-02420a1f0b69-1770907847.wav' },
  { name: 'Mike Glynn', sessionUrl: 'https://s3.amazonaws.com/telephony-recorder-prod/57bd0f26-ee4a-46e5-961e-baeb66744372/2026-02-11/394530de-077d-11f1-af82-02420aef98a0-1770836983.wav' },
  { name: 'Daniella Morris', sessionUrl: 'https://s3.amazonaws.com/telephony-recorder-prod/57bd0f26-ee4a-46e5-961e-baeb66744372/2026-02-12/9d1b9676-080d-11f1-9362-02420a1f0b69-1770898999.wav' },
];

function extractLegId(url: string): string | null {
  // Pattern: /{date}/{leg_id}-{timestamp}.wav
  const match = url.match(/\/(\d{4}-\d{2}-\d{2})\/([0-9a-f-]{36})-\d+\.wav/);
  return match ? match[2] : null;
}

async function getRecordingByLegId(legId: string): Promise<{ downloadUrl: string; recordingId: string } | null> {
  const url = `https://api.telnyx.com/v2/recordings?filter[call_leg_id]=${legId}&page[size]=5`;
  const res = await fetch(url, {
    headers: { 'Authorization': `Bearer ${TELNYX_API_KEY}`, 'Content-Type': 'application/json' }
  });
  if (!res.ok) {
    console.log(`  Telnyx API error: ${res.status} ${res.statusText}`);
    return null;
  }
  const data = await res.json() as any;
  if (!data.data || data.data.length === 0) {
    console.log(`  No recordings found for leg_id ${legId}`);
    return null;
  }
  const rec = data.data[0];
  return { downloadUrl: rec.download_urls?.wav || rec.download_urls?.mp3, recordingId: rec.id };
}

async function downloadBuffer(url: string): Promise<Buffer> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Download failed: ${res.status}`);
  return Buffer.from(await res.arrayBuffer());
}

async function main() {
  console.log('=== Recovering 4 leads with call_session expired URLs ===\n');
  
  let recovered = 0;
  let failed = 0;
  
  for (const lead of leadsWithSessionUrls) {
    console.log(`--- ${lead.name} ---`);
    
    // Get lead ID
    const rows = await sql`
      SELECT l.id, l.recording_url, l.recording_s3_key
      FROM leads l
      WHERE l.contact_name = ${lead.name}
        AND l.recording_s3_key IS NULL
      ORDER BY l.created_at DESC LIMIT 1
    `;
    
    if (rows.length === 0) {
      console.log('  Lead not found or already has recording. Skipping.');
      continue;
    }
    
    const leadId = rows[0].id;
    console.log(`  Lead ID: ${leadId}`);
    
    // Extract leg_id from expired URL
    const legId = extractLegId(lead.sessionUrl);
    if (!legId) {
      console.log(`  Could not extract leg_id from URL`);
      failed++;
      continue;
    }
    console.log(`  Extracted leg_id: ${legId}`);
    
    // Get fresh recording from Telnyx
    const recording = await getRecordingByLegId(legId);
    if (!recording || !recording.downloadUrl) {
      console.log(`  No download URL from Telnyx`);
      failed++;
      continue;
    }
    console.log(`  Recording ID: ${recording.recordingId}`);
    
    // Download the recording
    const buffer = await downloadBuffer(recording.downloadUrl);
    console.log(`  Downloaded: ${(buffer.length / 1024).toFixed(0)} KB`);
    
    if (buffer.length < 1000) {
      console.log(`  WARNING: File too small, skipping`);
      failed++;
      continue;
    }
    
    // Upload to GCS
    const ext = recording.downloadUrl.includes('.mp3') ? 'mp3' : 'wav';
    const gcsKey = `recordings/${leadId}.${ext}`;
    const file = bucket.file(gcsKey);
    await file.save(buffer, { contentType: ext === 'mp3' ? 'audio/mpeg' : 'audio/wav' });
    console.log(`  Uploaded to GCS: ${gcsKey}`);
    
    // Update lead
    await sql`
      UPDATE leads 
      SET recording_s3_key = ${gcsKey},
          recording_url = ${recording.downloadUrl},
          telnyx_recording_id = ${recording.recordingId}
      WHERE id = ${leadId}
    `;
    console.log(`  Lead updated!`);
    recovered++;
  }
  
  console.log(`\n=== Results: ${recovered} recovered, ${failed} failed ===`);
}

main().catch(console.error);
