
import fetch from "node-fetch";

const CAMPAIGN_ID = "bd8ab195-8eed-4d30-b792-6973cf5babda";
const AGENT_ID = "test-agent-id"; // Assuming optional or I can fetch one if needed.
const PHONE = "+15550001234"; // Test phone

async function main() {
  const response = await fetch("http://localhost:5000/api/ai-calls/test-openai-realtime", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": "Bearer mocked-token" // Note: The endpoint requires auth. I need a valid token or bypass.
    },
    body: JSON.stringify({
      phoneNumber: PHONE,
      campaignId: CAMPAIGN_ID,
      virtualAgentId: AGENT_ID
    })
  });

  const text = await response.text();
  console.log("Response:", response.status, text);
}

// I can't easily get a valid token without login.
// Instead, I can call the code directly? No, I want to test the full flow.
// Or I can temporarily disable auth in the route for testing? 
// Or I can look at "get-auth-token.ts" in the file list.
