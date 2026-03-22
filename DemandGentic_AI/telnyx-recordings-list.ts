import 'dotenv/config';
import { db } from './server/db';
import { sql } from 'drizzle-orm';

const TELNYX_API_KEY = process.env.TELNYX_API_KEY;
const TELNYX_API_BASE = 'https://api.telnyx.com/v2';

interface TelnyxRecording {
  id: string;
  call_control_id: string;
  call_leg_id: string;
  call_session_id: string;
  channels: string;
  created_at: string;
  download_urls: { mp3?: string; wav?: string };
  duration_millis: number;
  recording_started_at: string;
  recording_ended_at: string;
  status: string;
}

// The 24 missing leads with their v3 call IDs
const MISSING_LEADS = [
  { id: '293ff82c-c7ef-4138-90b7-9c99d65e2422', name: 'Shamayel Alamiri', callId: 'v3:DKgyRxR0x1xevWrUWaz_9BXGfAaL3HFBY3g_uYdKZrOO4_9m1ytnrA' },
  { id: '5a65f2e7-b09e-4890-a489-4cb92133502a', name: 'Matt Reddick', callId: 'v3:C11Eo8wBwzi8_OG3I6DfvQjxxFgAFrVuvG9R-cY7CSdNd4WdGm4C7A' },
  { id: 'ba27e8a0-961a-4fd8-8dd3-a056fe976aaa', name: 'Aritro Chatterjee', callId: 'v3:1SS-nzHDgsbktwaQ3p3oJRNA_N_K4DttWgCH_MwV1oD-YZKfk1OM0w' },
  { id: '14a5cf33-983f-4628-9c26-b086e68bfc21', name: 'Jeff Cruz', callId: 'v3:FN2M5r3oE5K3b3cQGInxi1tx95BZnKOOqbp88vPjf--XBuw4BYH20A' },
  { id: '40fd460d-a6d3-4dd4-a0c1-824d89478c68', name: 'Ajay Kosada', callId: 'v3:ETYSgIMtMpWC_cCOpguUr_n6t7a95sEvdcxV_zTm0DnnKbkagV73vw' },
  { id: 'c784e216-a146-4457-8f74-adb11b5d1c58', name: 'Matt Swanton', callId: 'v3:cKovg-NQyabcCjbxsUYr9WAMv351-ZIGG6SSUTAy_-jJjQh53dPkjw' },
  { id: '6c20d648-cec3-4001-81eb-a6578194cbc0', name: 'Tim White', callId: 'v3:mI1Pu3zk9Y7EOQNV0HS8TG8mM5hKRxEsYwf049VXlehD15O44Q8pkA' },
  { id: 'e0c10ef6-303f-4c40-85c9-68dd570f24a2', name: 'Diana Monk', callId: 'v3:oO7poS1_XanwwMuC_uHyJBoTagKUelEPQZRwsI3EiZPsv5jGjO6Yng' },
  { id: '8cbc2df6-c300-4808-8ef8-71783563b21a', name: 'Scott Johnson', callId: 'v3:exyDqUbLiNSImKMgHr_MwQsD4xrbe8lXSoyyL3qgkimE5JGNyZrjlQ' },
  { id: '8a981fa4-da13-4dc5-bd03-c296b5dd3021', name: 'Martin Ravell', callId: 'v3:vFpykb2bOORBFORYgmSgjHJn0blD_1fuLO6H5JnFFClgP8OhR7UEPg' },
  { id: 'bbf2f4aa-d02f-4579-8b5a-e7887e5fe3ab', name: 'Ilona Uusitalo', callId: 'v3:g6CPbjqsqYipW8_8xReMlrehMSwcR2r_w8ga_oc46riSmVPoGZ_nxA' },
  { id: '77fd3f9f-a5b8-405e-ae96-79e92abdf07d', name: 'Mike Glynn', callId: 'v3:Upf2_yza_5zDsaaTSX8f8DVxHlX-__k7Woi3r1Ko7WPrrFQNm9hlNA' },
  { id: '4edd482a-5f70-48e4-be2e-d190d2307b2e', name: 'Alex Stara', callId: 'v3:UtH4gxMqr2kqMuxDsrr7lYArKpMdXkVHN9DIqg372DQkTE8W94MRpg' },
  { id: '6b9f7e62-4bc3-450b-b355-0b03f4f5bbcb', name: 'Mark Rodrigues', callId: 'v3:_i3Ukr_VZSZ-A7WsFgDI2FhK87JdvbxAIxCgVW8G4wgkKAyTJaBFYg' },
  { id: 'c743c654-b808-49fe-a355-2eb3d8082915', name: 'Ryan Carter', callId: 'v3:BlzvQaBkppscoXOoC_gqhEx1uX7K1BWPl-TFBfTtuZwMUJx3_9memA' },
  { id: '9b56d6c7-832f-45da-ab28-672ed144d62e', name: 'Kim Chang', callId: 'v3:yddYrfOVRhUt7Cw8-mkUhKZgYbqONBGQ_Qefuoo06-6MwxRLHHlb-g' },
  { id: '76d7d2cd-901a-4b95-b64a-3572111f5533', name: 'Nancy Cooley', callId: 'v3:KKlOAFHQajD9M0qoCsgEI1cI4A_yh3sNvWsC2l1qhUzra9o3NY7_OQ' },
  { id: '816c6738-a4fb-4587-9ea7-7d31af76c441', name: 'Daniel Withrow', callId: 'v3:vQ3h_yo890__wnWtPbExYVe4WK3VxrL_QHrW7171MCszcJwSQtseUw' },
  { id: '6e541f07-18dc-4200-a2b1-e121ab026151', name: 'Shubham Salwan', callId: 'v3:tDsyUeRENoOYiWmFCpi-hsEfBNqk1mnMoLJzM6DJVAyrX3p4pOaAzA' },
  { id: '5ca369a1-dc54-428e-a37b-34365c3a3753', name: 'Angad Gill', callId: 'v3:QUIJSd9TT_1KLkr6pbclDyTHYLdzR1IN11gbxlladDpTVH2G_Phzwg' },
  { id: 'c8b2ba1f-bb28-4f9e-a309-89d08af8f2bd', name: 'Wedad Abdulla', callId: 'v3:6iDmb-Nqy1GMPa-uyP3VR9FVLTvuaEK_TJepVyC9bKyyY7OTOmsl9g' },
  { id: '2dfa7e11-3992-4e55-8e44-51d92621ad9d', name: 'David Ward', callId: 'v3:jWmayKVGyzcD4SZIJ63rYjxxr3QafMB8K4mAmUpXcvlJCDPOgUArww' },
  { id: '687ab225-cec2-4688-b650-c58b6e755bfd', name: 'Daniella Morris', callId: 'v3:_9Lg5JEDVOexWkEoBq9lS0BJ_n2vPf2JIhAIPdCBRHzijgF5hd95bw' },
  // Ian Slater has no call_attempt_id / telnyx_call_id
];

async function main() {
  if (!TELNYX_API_KEY) {
    console.error('TELNYX_API_KEY not set');
    process.exit(1);
  }
  
  console.log('=== Strategy 1: Try Telnyx recordings list API with date filter ===\n');
  
  // List all recordings for our account from Feb 10-18
  const dateFrom = '2026-02-10T00:00:00Z';
  const dateTo = '2026-02-18T23:59:59Z';
  
  let allRecordings: TelnyxRecording[] = [];
  let page = 1;
  let hasMore = true;
  
  while (hasMore) {
    const url = `${TELNYX_API_BASE}/recordings?filter[created_at][gte]=${dateFrom}&filter[created_at][lte]=${dateTo}&page[number]=${page}&page[size]=250`;
    console.log(`Fetching page ${page}...`);
    
    const resp = await fetch(url, {
      headers: { 'Authorization': `Bearer ${TELNYX_API_KEY}`, 'Content-Type': 'application/json' }
    });
    
    if (!resp.ok) {
      const txt = await resp.text();
      console.error(`API error (${resp.status}): ${txt}`);
      break;
    }
    
    const data = await resp.json();
    const recordings = data.data || [];
    allRecordings.push(...recordings);
    
    console.log(`  Got ${recordings.length} recordings (total: ${allRecordings.length})`);
    
    if (recordings.length ();
  const byCallLegId = new Map();
  const byCallSessionId = new Map();
  
  for (const rec of allRecordings) {
    if (rec.call_control_id) byCallControlId.set(rec.call_control_id, rec);
    if (rec.call_leg_id) byCallLegId.set(rec.call_leg_id, rec);
    if (rec.call_session_id) byCallSessionId.set(rec.call_session_id, rec);
  }
  
  console.log(`\nUnique call_control_ids: ${byCallControlId.size}`);
  console.log(`Unique call_leg_ids: ${byCallLegId.size}`);
  console.log(`Unique call_session_ids: ${byCallSessionId.size}`);
  
  // Try to match our missing leads
  let matched = 0;
  for (const lead of MISSING_LEADS) {
    const rec = byCallControlId.get(lead.callId) 
      || byCallLegId.get(lead.callId) 
      || byCallSessionId.get(lead.callId);
    
    if (rec) {
      const downloadUrl = rec.download_urls?.wav || rec.download_urls?.mp3;
      console.log(`  ✅ MATCH: ${lead.name} -> rec ${rec.id}, url: ${downloadUrl?.substring(0, 80)}`);
      matched++;
    }
  }
  
  console.log(`\nMatched: ${matched} / ${MISSING_LEADS.length}`);
  
  // Also show a sample of what recordings DO look like (call IDs format)
  if (allRecordings.length > 0) {
    console.log(`\nSample recording call IDs (first 5):`);
    for (const rec of allRecordings.slice(0, 5)) {
      console.log(`  call_control_id: ${rec.call_control_id}`);
      console.log(`  call_leg_id: ${rec.call_leg_id}`);
      console.log(`  call_session_id: ${rec.call_session_id}`);
      console.log(`  status: ${rec.status}, duration: ${rec.duration_millis}ms`);
      console.log(`  ---`);
    }
  }
  
  process.exit(0);
}
main().catch(e => { console.error(e); process.exit(1); });