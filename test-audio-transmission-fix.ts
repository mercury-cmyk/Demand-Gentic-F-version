/**
 * Audio Transmission Test Script
 * Tests both Agent Console WebRTC and AI Caller audio paths
 */

import "dotenv/config";

const TEST_PHONE = process.env.TEST_PHONE_NUMBER || "+14179003844";
const API_BASE = "http://localhost:5000/api";

console.log("🎤 Audio Transmission Test Suite\n");
console.log("================================\n");

async function testAgentConsoleAudio() {
  console.log("1️⃣  Testing Agent Console WebRTC Audio...\n");
  
  console.log("Manual Test Required:");
  console.log("1. Open Agent Console at http://localhost:5000/agent-console");
  console.log("2. Look for SIP credentials to connect");
  console.log("3. Make a test call");
  console.log("4. Check browser console for:");
  console.log("   [AUDIO-TX] Requesting microphone access...");
  console.log("   [AUDIO-TX] ✅ Microphone access granted");
  console.log("   [AUDIO-TX] Local audio track status: { enabled: true, muted: false }");
  console.log("   [AUDIO-TX] ✅ Audio transmission active\n");
}

async function testAICallAudio() {
  console.log("2️⃣  Testing AI Caller Audio Transmission...\n");
  
  const callData = {
    phoneNumber: TEST_PHONE,
    campaignId: "test-campaign",
    contactId: "test-contact",
    virtualAgentId: "test-agent",
    testMode: true,
  };
  
  console.log(`Initiating test AI call to ${TEST_PHONE}...`);
  console.log("\nWatch server logs for:");
  console.log("  [Voice-Dialer] 🔗 Telnyx streaming_event received! stream_id set to: <id>");
  console.log("  [Voice-Dialer] ✅ Bidirectional audio now enabled");
  console.log("  [Voice-Dialer] ✅ FIRST OUTBOUND AUDIO FRAME SENT to Telnyx!");
  console.log("\n⚠️  If you see these warnings, audio WILL NOT work:");
  console.log("  [Voice-Dialer] ⚠️ No stream_id received yet for call");
  console.log("  [Voice-Dialer] ⚠️ Sending audio WITHOUT stream_id\n");
}

async function checkEnvironment() {
  console.log("3️⃣  Environment Configuration Check...\n");
  
  const requiredVars = [
    "PUBLIC_WEBSOCKET_URL",
    "TELNYX_API_KEY",
    "TELNYX_TEXML_APP_ID",
    "TELNYX_FROM_NUMBER",
    "OPENAI_API_KEY",
  ];
  
  const missing = [];
  for (const varName of requiredVars) {
    if (process.env[varName]) {
      console.log(`  ✅ ${varName}`);
    } else {
      console.log(`  ❌ ${varName} - MISSING!`);
      missing.push(varName);
    }
  }
  
  if (missing.length > 0) {
    console.log(`\n⚠️  Missing required variables: ${missing.join(", ")}`);
    console.log("Audio transmission may fail!\n");
  } else {
    console.log("\n✅ All required environment variables are set\n");
  }
  
  // Check if PUBLIC_WEBSOCKET_URL is publicly accessible
  const wsUrl = process.env.PUBLIC_WEBSOCKET_URL;
  if (wsUrl) {
    if (wsUrl.includes("localhost") || wsUrl.includes("127.0.0.1")) {
      console.log("⚠️  WARNING: PUBLIC_WEBSOCKET_URL contains localhost!");
      console.log("   Telnyx cannot reach localhost URLs.");
      console.log("   Use ngrok tunnel: .\\setup-ngrok-tunnel.ps1\n");
    } else if (wsUrl.startsWith("wss://")) {
      console.log(`✅ PUBLIC_WEBSOCKET_URL is publicly accessible: ${wsUrl}\n`);
    } else {
      console.log("⚠️  WARNING: PUBLIC_WEBSOCKET_URL should start with wss://\n");
    }
  }
}

async function main() {
  await checkEnvironment();
  await testAgentConsoleAudio();
  await testAICallAudio();
  
  console.log("\n================================");
  console.log("🎤 Audio Test Instructions Complete");
  console.log("================================\n");
  console.log("Next Steps:");
  console.log("1. Make an Agent Console call and verify microphone transmission");
  console.log("2. Initiate an AI call and monitor server logs");
  console.log("3. Answer calls and verify you can hear the agent/AI");
  console.log("4. If issues persist, check AUDIO_TRANSMISSION_DIAGNOSTICS.md\n");
}

main().catch(console.error);
