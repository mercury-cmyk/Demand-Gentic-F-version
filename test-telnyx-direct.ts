/**
 * Direct Telnyx API test call with verbose logging
 */
import "dotenv/config";

// Force the webhook host
const PUBLIC_WEBHOOK_HOST = "steve-unbalking-guessingly.ngrok-free.dev";
const TELNYX_API_KEY = process.env.TELNYX_API_KEY;
const TELNYX_TEXML_APP_ID = process.env.TELNYX_TEXML_APP_ID;
const FROM_NUMBER = process.env.TELNYX_FROM_NUMBER || "+15593366940";

// Test phone number
const TO_NUMBER = "+447798787206";

async function testCall() {
  console.log("=".repeat(60));
  console.log("Direct Telnyx API Test Call");
  console.log("=".repeat(60));
  console.log("API Key:", TELNYX_API_KEY ? TELNYX_API_KEY.slice(0, 15) + "..." : "MISSING");
  console.log("TeXML App ID:", TELNYX_TEXML_APP_ID);
  console.log("Webhook Host:", PUBLIC_WEBHOOK_HOST);
  console.log("From:", FROM_NUMBER);
  console.log("To:", TO_NUMBER);
  
  if (!TELNYX_API_KEY || !TELNYX_TEXML_APP_ID) {
    console.error("\nMissing required env vars!");
    return;
  }
  
  const texmlUrl = `https://${PUBLIC_WEBHOOK_HOST}/api/texml/ai-call?client_state=dGVzdA==`;
  const statusCallback = `https://${PUBLIC_WEBHOOK_HOST}/api/webhooks/telnyx`;
  
  console.log("\nTeXML URL:", texmlUrl);
  console.log("Status Callback:", statusCallback);
  
  const apiUrl = `https://api.telnyx.com/v2/texml/calls/${TELNYX_TEXML_APP_ID}`;
  console.log("\nAPI URL:", apiUrl);
  
  const body = {
    To: TO_NUMBER,
    From: FROM_NUMBER,
    Url: texmlUrl,
    StatusCallback: statusCallback,
    Record: "true",
    RecordingChannels: "dual",
  };
  
  console.log("\nRequest body:", JSON.stringify(body, null, 2));
  
  try {
    const response = await fetch(apiUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${TELNYX_API_KEY}`,
      },
      body: JSON.stringify(body),
    });
    
    console.log("\nResponse status:", response.status, response.statusText);
    
    const responseText = await response.text();
    console.log("\nResponse body:", responseText);
    
    if (response.ok) {
      const data = JSON.parse(responseText);
      console.log("\nCall initiated!");
      console.log("  CallSid:", data.CallSid || data.call_sid);
    } else {
      console.log("\nCall failed!");
    }
  } catch (error) {
    console.error("\nError:", error);
  }
}

testCall().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
