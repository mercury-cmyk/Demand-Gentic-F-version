import 'dotenv/config';
import { db } from './server/db';
import { sql } from 'drizzle-orm';

const MISSING_IDS = [
  '14a5cf33-983f-4628-9c26-b086e68bfc21','293ff82c-c7ef-4138-90b7-9c99d65e2422',
  '2dfa7e11-3992-4e55-8e44-51d92621ad9d','40fd460d-a6d3-4dd4-a0c1-824d89478c68',
  '4edd482a-5f70-48e4-be2e-d190d2307b2e','5a65f2e7-b09e-4890-a489-4cb92133502a',
  '5ca369a1-dc54-428e-a37b-34365c3a3753','687ab225-cec2-4688-b650-c58b6e755bfd',
  '6b9f7e62-4bc3-450b-b355-0b03f4f5bbcb','6c20d648-cec3-4001-81eb-a6578194cbc0',
  '6e541f07-18dc-4200-a2b1-e121ab026151','76d7d2cd-901a-4b95-b64a-3572111f5533',
  '77fd3f9f-a5b8-405e-ae96-79e92abdf07d','816c6738-a4fb-4587-9ea7-7d31af76c441',
  '8a981fa4-da13-4dc5-bd03-c296b5dd3021','8cbc2df6-c300-4808-8ef8-71783563b21a',
  '9b56d6c7-832f-45da-ab28-672ed144d62e','b599b3ef-6020-4d01-8e4b-3ee19d237bb9',
  'ba27e8a0-961a-4fd8-8dd3-a056fe976aaa','bbf2f4aa-d02f-4579-8b5a-e7887e5fe3ab',
  'c743c654-b808-49fe-a355-2eb3d8082915','c784e216-a146-4457-8f74-adb11b5d1c58',
  'c8b2ba1f-bb28-4f9e-a309-89d08af8f2bd','e0c10ef6-303f-4c40-85c9-68dd570f24a2'
];

async function main() {
  // Check lead recording fields + all call_sessions for these leads
  const results = await db.execute(sql`
    SELECT DISTINCT ON (l.id)
      l.id, l.contact_name, l.recording_url, l.recording_s3_key, l.ai_score,
      l.telnyx_call_id as lead_telnyx_call_id, l.telnyx_recording_id as lead_telnyx_rec_id,
      cs.id as cs_id, cs.recording_url as cs_recording_url, cs.recording_s3_key as cs_s3_key,
      cs.telnyx_call_id, cs.telnyx_recording_id, cs.campaign_id
    FROM leads l
    LEFT JOIN call_sessions cs ON cs.contact_id = l.id
    WHERE l.id IN (${sql.join(MISSING_IDS.map(id => sql`${id}`), sql`, `)})
    ORDER BY l.id, cs.created_at DESC NULLS LAST
  `);

  let withUrl = 0, noUrl = 0, withCallId = 0;
  
  for (const r of results.rows as any[]) {
    const recUrl = r.recording_url || '';
    const hasExpiredS3 = recUrl.includes('s3.amazonaws.com');
    const hasGcsInternal = recUrl.includes('gcs-internal://');
    
    console.log(`${r.contact_name} | score: ${r.ai_score}`);
    console.log(`  lead.recording_url: ${recUrl ? recUrl.substring(0, 100) : 'NULL'}`);
    console.log(`  lead.recording_s3_key: ${r.recording_s3_key || 'NULL'}`);
    console.log(`  cs.recording_url: ${r.cs_recording_url ? r.cs_recording_url.substring(0, 100) : 'NULL'}`);
    console.log(`  cs.recording_s3_key: ${r.cs_s3_key || 'NULL'}`);
    console.log(`  cs.telnyx_call_id: ${r.telnyx_call_id || 'NULL'}`);
    console.log(`  cs.telnyx_recording_id: ${r.telnyx_recording_id || 'NULL'}`);
    console.log(`  cs.campaign_id: ${r.campaign_id || 'NULL'}`);
    
    if (hasExpiredS3) console.log(`  ⚠️ Has expired S3 URL`);
    if (hasGcsInternal) console.log(`  ⚠️ Has gcs-internal:// URL`);
    if (!recUrl && !r.cs_recording_url) { console.log(`  🚫 NO recording URL anywhere`); noUrl++; }
    else { withUrl++; }
    if (r.telnyx_call_id) withCallId++;
    console.log('---');
  }
  
  console.log(`\nSummary: ${results.rows.length} leads`);
  console.log(`  With some URL: ${withUrl}`);
  console.log(`  No URL at all: ${noUrl}`);
  console.log(`  With telnyx_call_id: ${withCallId}`);
  
  // Also check if any call-recordings exist for these leads via campaign_id + session pairing
  const sessionResults = await db.execute(sql`
    SELECT cs.id as session_id, cs.contact_id, cs.campaign_id, cs.recording_url, cs.recording_s3_key,
           cs.telnyx_call_id, cs.telnyx_recording_id
    FROM call_sessions cs
    WHERE cs.contact_id IN (${sql.join(MISSING_IDS.map(id => sql`${id}`), sql`, `)})
    AND (cs.recording_s3_key IS NOT NULL OR cs.recording_url IS NOT NULL)
    ORDER BY cs.created_at DESC
  `);
  
  console.log(`\nCall sessions with recordings for these leads: ${sessionResults.rows.length}`);
  for (const s of sessionResults.rows as any[]) {
    console.log(`  session ${s.session_id} -> contact ${s.contact_id}`);
    console.log(`    s3_key: ${s.recording_s3_key || 'NULL'}`);
    console.log(`    url: ${(s.recording_url || 'NULL').substring(0, 100)}`);
  }
  
  process.exit(0);
}
main().catch(e => { console.error(e); process.exit(1); });
