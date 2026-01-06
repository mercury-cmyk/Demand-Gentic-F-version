import crypto from "crypto";

// Configuration - these should match your .env
const CRM_URL = "http://localhost:5000";
const WEBHOOK_API_KEY = "test-webhook-api-key-12345";
const WEBHOOK_SHARED_SECRET = "test-webhook-shared-secret-67890";

function signPayload(secret: string, body: string, ts: number): string {
  const message = `${ts}.${body}`;
  return crypto.createHmac("sha256", secret).update(message).digest("base64");
}

async function sendWebhook(eventName: string, data: any) {
  const payload = {
    api_key: WEBHOOK_API_KEY,
    event: eventName,
    data
  };
  
  const body = JSON.stringify(payload);
  const ts = Math.floor(Date.now() / 1000);
  const signature = signPayload(WEBHOOK_SHARED_SECRET, body, ts);
  
  console.log(`\n🔔 Sending ${eventName} webhook...`);
  console.log("Timestamp:", ts);
  console.log("Signature:", signature.substring(0, 20) + "...");
  
  try {
    const response = await fetch(`${CRM_URL}/api/webhooks/resources-centre`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Timestamp": String(ts),
        "X-Signature": signature
      },
      body
    });
    
    const result = await response.json();
    console.log("Status:", response.status);
    console.log("Response:", result);
    
    return response.ok;
  } catch (e) {
    console.error("Error:", e);
    return false;
  }
}

async function runTests() {
  console.log("🧪 Testing CRM Webhook Receiver");
  console.log("================================\n");
  
  // Test 1: Page View Event
  console.log("Test 1: Page View Event");
  await sendWebhook("page_view", {
    content_type: "event",
    content_id: "evt_123",
    slug: "generative-ai-for-finance-oct-2025",
    title: "Generative AI for Finance Leaders",
    community: "finance",
    contact_id: "cnt_001",
    url: "https://resources.example.com/event/generative-ai-for-finance-oct-2025",
    ts: new Date().toISOString()
  });
  
  await new Promise(r => setTimeout(r, 500));
  
  // Test 2: Form Submission Event
  console.log("\nTest 2: Form Submission Event");
  await sendWebhook("form_submission", {
    form_id: "frm_109",
    content_type: "event",
    content_id: "evt_123",
    slug: "generative-ai-for-finance-oct-2025",
    contact_id: "cnt_001",
    email: "john@acme.com",
    fields: {
      first_name: "John",
      last_name: "Doe",
      company: "Acme Ltd",
      job_title: "CFO",
      country: "US"
    },
    ts: new Date().toISOString()
  });
  
  await new Promise(r => setTimeout(r, 500));
  
  // Test 3: Duplicate (should be silently deduplicated)
  console.log("\nTest 3: Duplicate Page View (should dedupe)");
  await sendWebhook("page_view", {
    content_type: "event",
    content_id: "evt_123",
    slug: "generative-ai-for-finance-oct-2025",
    title: "Generative AI for Finance Leaders",
    community: "finance",
    contact_id: "cnt_001",
    url: "https://resources.example.com/event/generative-ai-for-finance-oct-2025",
    ts: new Date().toISOString()
  });
  
  await new Promise(r => setTimeout(r, 500));
  
  // Test 4: Invalid API Key
  console.log("\nTest 4: Invalid API Key (should fail)");
  const badPayload = {
    api_key: "wrong-key",
    event: "page_view",
    data: { ts: new Date().toISOString() }
  };
  const badBody = JSON.stringify(badPayload);
  const badTs = Math.floor(Date.now() / 1000);
  const badSig = signPayload(WEBHOOK_SHARED_SECRET, badBody, badTs);
  
  try {
    const response = await fetch(`${CRM_URL}/api/webhooks/resources-centre`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Timestamp": String(badTs),
        "X-Signature": badSig
      },
      body: badBody
    });
    const result = await response.json();
    console.log("Status:", response.status, "(expected 401)");
    console.log("Response:", result);
  } catch (e) {
    console.error("Error:", e);
  }
  
  await new Promise(r => setTimeout(r, 500));
  
  // Test 5: Invalid Signature
  console.log("\nTest 5: Invalid Signature (should fail)");
  const validPayload = {
    api_key: WEBHOOK_API_KEY,
    event: "page_view",
    data: { ts: new Date().toISOString() }
  };
  const validBody = JSON.stringify(validPayload);
  const validTs = Math.floor(Date.now() / 1000);
  
  try {
    const response = await fetch(`${CRM_URL}/api/webhooks/resources-centre`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Timestamp": String(validTs),
        "X-Signature": "invalid-signature-12345"
      },
      body: validBody
    });
    const result = await response.json();
    console.log("Status:", response.status, "(expected 401)");
    console.log("Response:", result);
  } catch (e) {
    console.error("Error:", e);
  }
  
  console.log("\n✅ Tests complete!");
  console.log("\nTo verify events were stored, check the content_events table:");
  console.log("  SELECT * FROM content_events ORDER BY created_at DESC LIMIT 10;");
}

runTests().catch(console.error);
