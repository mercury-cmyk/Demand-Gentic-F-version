import 'dotenv/config';

const TELNYX_API_KEY = process.env.TELNYX_API_KEY;
const TELNYX_API_BASE = 'https://api.telnyx.com/v2';

// Test with one v3 call ID first
const TEST_CALL_ID = 'v3:DKgyRxR0x1xevWrUWaz_9BXGfAaL3HFBY3g_uYdKZrOO4_9m1ytnrA';

async function main() {
  if (!TELNYX_API_KEY) { console.error('No API key'); process.exit(1); }

  console.log('=== Telnyx API Exploration ===\n');
  
  // Strategy 1: Try call events API
  console.log('1. Call Events API with v3 ID...');
  try {
    const eventsUrl = `${TELNYX_API_BASE}/call_events?filter[call_control_id]=${encodeURIComponent(TEST_CALL_ID)}&page[size]=25`;
    const resp = await fetch(eventsUrl, {
      headers: { 'Authorization': `Bearer ${TELNYX_API_KEY}` }
    });
    console.log(`   Status: ${resp.status}`);
    const body = await resp.text();
    console.log(`   Body: ${body.substring(0, 500)}`);
  } catch (e: any) { console.log(`   Error: ${e.message}`); }
  
  // Strategy 2: Try listing recordings with connection_id filter
  console.log('\n2. Recordings with connection_id filter...');
  try {
    // The 57bd0f26-ee4a-46e5-961e-baeb66744372 from the S3 URL might be the connection ID
    const connId = '57bd0f26-ee4a-46e5-961e-baeb66744372';
    const recUrl = `${TELNYX_API_BASE}/recordings?filter[connection_id]=${connId}&filter[created_at][gte]=2026-02-11T00:00:00Z&filter[created_at][lte]=2026-02-11T23:59:59Z&page[size]=10`;
    const resp = await fetch(recUrl, {
      headers: { 'Authorization': `Bearer ${TELNYX_API_KEY}` }
    });
    console.log(`   Status: ${resp.status}`);
    const body = await resp.text();
    console.log(`   Body: ${body.substring(0, 500)}`);
  } catch (e: any) { console.log(`   Error: ${e.message}`); }

  // Strategy 3: Try the v2 call recording API directly
  console.log('\n3. Direct recording by call_control_id (GET /v2/calls/{id}/recordings)...');
  try {
    const recUrl = `${TELNYX_API_BASE}/calls/${encodeURIComponent(TEST_CALL_ID)}/recordings`;
    const resp = await fetch(recUrl, {
      headers: { 'Authorization': `Bearer ${TELNYX_API_KEY}` }
    });
    console.log(`   Status: ${resp.status}`);
    const body = await resp.text();
    console.log(`   Body: ${body.substring(0, 500)}`);
  } catch (e: any) { console.log(`   Error: ${e.message}`); }

  // Strategy 4: Check what the recording download URL looks like for recordings we CAN access
  console.log('\n4. Sample of accessible recordings (first 3 from recent)...');
  try {
    const recUrl = `${TELNYX_API_BASE}/recordings?page[size]=3&filter[created_at][gte]=2026-02-17T00:00:00Z`;
    const resp = await fetch(recUrl, {
      headers: { 'Authorization': `Bearer ${TELNYX_API_KEY}` }
    });
    if (resp.ok) {
      const data = await resp.json();
      for (const rec of (data.data || []).slice(0, 3)) {
        console.log(`   Recording ${rec.id}:`);
        console.log(`     call_control_id: ${rec.call_control_id}`);
        console.log(`     call_leg_id: ${rec.call_leg_id}`);
        console.log(`     call_session_id: ${rec.call_session_id}`);
        console.log(`     download_urls: ${JSON.stringify(rec.download_urls)}`);
        console.log(`     duration_millis: ${rec.duration_millis}`);
        console.log(`     status: ${rec.status}`);
      }
    } else {
      console.log(`   Status: ${resp.status}, Body: ${(await resp.text()).substring(0, 300)}`);
    }
  } catch (e: any) { console.log(`   Error: ${e.message}`); }

  process.exit(0);
}
main().catch(e => { console.error(e); process.exit(1); });