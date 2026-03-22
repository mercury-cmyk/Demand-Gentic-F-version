import fetch from 'node-fetch';
import 'dotenv/config';

const TELNYX_API_KEY = process.env.TELNYX_API_KEY;
const TELNYX_API_BASE = 'https://api.telnyx.com/v2';

async function queryTelnyxCall() {
  const callId = "2439b838-f231-11f0-b4f2-02420aef95a1";
  
  if (!TELNYX_API_KEY) {
    console.error("TELNYX_API_KEY not configured");
    process.exit(1);
  }

  console.log("========================================");
  console.log(`QUERYING TELNYX API FOR: ${callId}`);
  console.log("========================================\n");

  // Try as call_control_id
  console.log("1. Trying as call_control_id...");
  try {
    const response = await fetch(`${TELNYX_API_BASE}/calls/${callId}`, {
      headers: {
        'Authorization': `Bearer ${TELNYX_API_KEY}`,
        'Content-Type': 'application/json',
      },
    });

    if (response.ok) {
      const data = (await response.json()) as Record;
      console.log("✓ FOUND AS CALL:");
      console.log(JSON.stringify(data, null, 2));
    } else {
      console.log(`✗ Not found as call (${response.status}): ${response.statusText}`);
    }
  } catch (error: any) {
    console.log(`✗ Error querying as call: ${error.message}`);
  }

  // Try searching recordings by call_session_id
  console.log("\n2. Trying as call_session_id in recordings...");
  try {
    const response = await fetch(`${TELNYX_API_BASE}/recordings?filter[call_session_id]=${callId}`, {
      headers: {
        'Authorization': `Bearer ${TELNYX_API_KEY}`,
        'Content-Type': 'application/json',
      },
    });

    if (response.ok) {
      const data = (await response.json()) as { data?: unknown[] };
      if (data.data && data.data.length > 0) {
        console.log("✓ FOUND RECORDINGS:");
        console.log(JSON.stringify(data.data, null, 2));
      } else {
        console.log("✗ No recordings found for this call_session_id");
      }
    } else {
      console.log(`✗ Not found (${response.status}): ${response.statusText}`);
    }
  } catch (error: any) {
    console.log(`✗ Error querying recordings: ${error.message}`);
  }

  // Try searching recordings by call_leg_id
  console.log("\n3. Trying as call_leg_id in recordings...");
  try {
    const response = await fetch(`${TELNYX_API_BASE}/recordings?filter[call_leg_id]=${callId}`, {
      headers: {
        'Authorization': `Bearer ${TELNYX_API_KEY}`,
        'Content-Type': 'application/json',
      },
    });

    if (response.ok) {
      const data = (await response.json()) as { data?: unknown[] };
      if (data.data && data.data.length > 0) {
        console.log("✓ FOUND RECORDINGS:");
        console.log(JSON.stringify(data.data, null, 2));
      } else {
        console.log("✗ No recordings found for this call_leg_id");
      }
    } else {
      console.log(`✗ Not found (${response.status}): ${response.statusText}`);
    }
  } catch (error: any) {
    console.log(`✗ Error querying recordings: ${error.message}`);
  }

  // Try direct recording ID
  console.log("\n4. Trying as recording_id...");
  try {
    const response = await fetch(`${TELNYX_API_BASE}/recordings/${callId}`, {
      headers: {
        'Authorization': `Bearer ${TELNYX_API_KEY}`,
        'Content-Type': 'application/json',
      },
    });

    if (response.ok) {
      const data = (await response.json()) as Record;
      console.log("✓ FOUND AS RECORDING:");
      console.log(JSON.stringify(data, null, 2));
    } else {
      console.log(`✗ Not found as recording (${response.status}): ${response.statusText}`);
    }
  } catch (error: any) {
    console.log(`✗ Error querying as recording: ${error.message}`);
  }

  process.exit(0);
}

queryTelnyxCall().catch((e) => {
  console.error("Error:", e);
  process.exit(1);
});