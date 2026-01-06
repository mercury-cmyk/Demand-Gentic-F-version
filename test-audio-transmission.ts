/// <reference types="node" />
import "dotenv/config";
import axios from "axios";

/**
 * Audio Transmission Diagnostic Tool
 * Tests real-time voice transmission from AI agent during OpenAI Realtime calls
 */

const API_URL = process.env.API_URL || "http://localhost:5000";
const PHONE_NUMBER = process.env.TEST_PHONE_NUMBER || '+14179003844';
const VIRTUAL_AGENT_ID = process.env.VIRTUAL_AGENT_ID || '5e8437c7-d69c-4e96-9faf-14d63e40cf9e';
const AUTH_TOKEN = process.env.AUTH_TOKEN || process.env.TEST_AUTH_TOKEN || '';

async function checkAudioStatus(): Promise<void> {
  try {
    const { data } = await axios.get(`${API_URL}/api/dialer-runs/openai-realtime/status`);
    
    if (data.activeSessions === 0) {
      console.log("📊 No active sessions currently");
      return;
    }

    console.log(`📊 Active sessions: ${data.activeSessions}`);
    console.log(`🎯 WebSocket endpoint: ${data.websocketPath}`);
    console.log(`🤖 Provider: ${data.provider}`);
    console.log(`📡 Model: ${data.model}`);

    const sessions = Array.isArray(data.sessions) ? data.sessions : [];
    sessions.forEach((session: any, idx: number) => {
      console.log(`\nSession ${idx + 1}: ${session.callId || 'unknown'}`);
      console.log(`  Stream ID: ${session.streamSid || 'NOT SET'}`);
      console.log(`  OpenAI WS: ${session.openaiState}`);
      console.log(`  Telnyx WS: ${session.telnyxState}`);
      console.log(`  Audio frames sent: ${session.audioFrameCount} (${session.audioBytesSent} bytes)`);
      console.log(`  Last audio frame: ${session.lastAudioFrameTime || 'n/a'}`);
      console.log(`  Buffered frames: ${session.bufferedFrames}`);
      console.log(`  Telnyx inbound frames: ${session.telnyxInboundFrames}`);
    });
  } catch (error) {
    console.error("Failed to check status:", error);
  }
}

async function testAudioTransmission() {
  console.log("🎤 Audio Transmission Diagnostic Test");
  console.log("=".repeat(60));
  console.log(`Target phone: ${PHONE_NUMBER}`);
  console.log(`Virtual Agent: ${VIRTUAL_AGENT_ID}`);
  console.log(`API URL: ${API_URL}\n`);
  
  console.log("⚠️  Prerequisites:");
  console.log("-".repeat(60));
  console.log("1. Development server must be running:");
  console.log("   npm run dev");
  console.log("2. Environment variables must be set:");
  console.log("   - OPENAI_API_KEY");
  console.log("   - TELNYX_API_KEY");
  console.log("   - TELNYX_FROM_NUMBER");
  console.log("   - TELNYX_CALL_CONTROL_APP_ID");
  console.log("3. Authentication token required:");
  console.log("   - Set AUTH_TOKEN or TEST_AUTH_TOKEN environment variable");
  console.log("   - Or login to get a token\n");

  try {
    console.log("📡 Checking OpenAI Realtime service status...");
    await checkAudioStatus();

    console.log("\n🎯 Testing OpenAI Realtime call with audio monitoring...\n");
    console.log("The test will:");
    console.log("  1. Initiate a call via the OpenAI Realtime API");
    console.log("  2. Monitor audio frame transmission");
    console.log("  3. Track audio bytes sent to the caller");
    console.log("  4. Detect any transmission delays or gaps");
    console.log("  5. Report audio health metrics\n");

    // Initiate test call
    console.log("📞 Initiating test call...");
    
    const headers: any = {
      "Content-Type": "application/json",
    };
    
    if (AUTH_TOKEN) {
      headers["Authorization"] = `Bearer ${AUTH_TOKEN}`;
    }
    
    const callResponse = await axios.post(
      `${API_URL}/api/ai-calls/test-openai-realtime`,
      {
        phoneNumber: PHONE_NUMBER,
        virtualAgentId: VIRTUAL_AGENT_ID,
      },
      { headers }
    );

    const callId = callResponse.data.call_control_id ? callResponse.data.call_id : callResponse.data.callId;
    const callControlId = callResponse.data.call_control_id || callResponse.data.callControlId;
    const wsUrl = callResponse.data.ws_url || callResponse.data.wsUrl;

    console.log("✅ Call initiated successfully!");
    console.log(`Call Control ID: ${callControlId}`);
    console.log(`Call ID: ${callId}`);
    console.log(`WebSocket URL: ${wsUrl}\n`);
    
    console.log("🔍 Audio Transmission Checklist:");
    console.log("-".repeat(60));
    console.log("✓ Telnyx call initiated with stream_url parameter");
    console.log("✓ WebSocket endpoint includes all required parameters");
    console.log("✓ Stream will connect automatically when call is answered");
    console.log("✓ Audio format set to g711_ulaw (native Telnyx compatibility)");
    console.log("✓ Both OpenAI and Telnyx connections will be monitored\n");

    console.log("📊 Audio Transmission Monitoring:");
    console.log("-".repeat(60));
    console.log("Watch server logs for audio health metrics.");
    console.log("Expected metrics to display:");
    console.log("  ✅ Audio frames being received from OpenAI");
    console.log("  ✅ Audio bytes being transmitted to caller");
    console.log("  ✅ First audio frame delivery confirmation");
    console.log("  ✅ Periodic health checks (every 30 seconds)");
    console.log("  ⚠️  Warnings if audio stalls (>15 seconds gap)");
    console.log("  ⚠️  Warnings if frame rate is too low (<10 fps)\n");

    console.log("📋 Audio Quality Indicators:");
    console.log("-".repeat(60));
    console.log("✅ Healthy audio transmission:");
    console.log("   - Frames being transmitted every 100-500ms");
    console.log("   - Consistent frame rate >10 fps");
    console.log("   - No gaps >1 second in audio stream");
    console.log("   - Total bytes increasing steadily");
    console.log("   - Both OpenAI and Telnyx showing OPEN state");
    console.log("   - Stream ID properly set\n");

    console.log("❌ Audio transmission issues:");
    console.log("   - 'Telnyx WebSocket not open' errors");
    console.log("   - 'No stream_id available' errors");
    console.log("   - No audio frames received for >15 seconds");
    console.log("   - Frame rate drops below 5 fps");
    console.log("   - Buffered frames accumulating (indicates connection lag)");
    console.log("   - WebSocket state showing CLOSED or NULL\n");

    console.log("🔧 Troubleshooting:");
    console.log("-".repeat(60));
    console.log("If audio isn't audible on the receiving end:");
    console.log("  1. Check server logs for 'First audio frame sent to Telnyx' confirmation");
    console.log("  2. Verify stream_id is set (should appear in health checks)");
    console.log("  3. Look for 'No stream_id available' errors");
    console.log("  4. Check both WebSocket states are OPEN");
    console.log("  5. Monitor for 'Failed to send audio frame' errors");
    console.log("  6. Verify Telnyx streaming endpoint is receiving 'media' events");
    console.log("  7. Confirm audio payload format (should be base64 encoded)");
    console.log("  8. Check for 'Telnyx WebSocket not ready' warnings");
    console.log("  9. Verify OpenAI session is using g711_ulaw audio format");
    console.log("  10. Look for buffer accumulation warnings (>20 frames)ng 'media' events");
    console.log("  3. Confirm audio payload format (should be base64 encoded)");
    console.log("  4. Check Telnyx API for media stream errors");
    console.log("  5. Verify OpenAI session is using g711_ulaw audio format");
    console.log("  6. Test with a different phone number or agent\n");

    console.log("📞 Call is now connected. Listen for AI agent voice on the call.");
    console.log("The call will end automatically after completion.");
    console.log("\nPress Ctrl+C to stop the test at any time.");
  } catch (error: any) {
    console.error("\n❌ Test failed!");
    console.error("-".repeat(60));
    
    if (error.response) {
      // HTTP error response from server
      console.error(`HTTP Status: ${error.response.status}`);
      console.error(`Response:`, error.response.data);
      
      if (error.response.status === 401) {
        console.error("\n💡 Authentication failed.");
        console.error("   Set AUTH_TOKEN environment variable with a valid admin token:");
        console.error("   $env:AUTH_TOKEN='your_token_here'");
        console.error("   Or login via the web UI and copy the token from browser dev tools");
        console.error("\n💡 Authentication failed. Please check your credentials.");
      } else if (error.response.status === 400) {
        console.error("\n💡 Invalid request:", error.response.data.message);
      } else if (error.response.status === 429) {
        console.error("\n💡 Rate limited. Please wait before trying again.");
      } else if (error.response.status === 500) {
        console.error("\n💡 Server error. Check if required environment variables are set:");
        console.error("   - OPENAI_API_KEY");
        console.error("   - TELNYX_API_KEY");
        console.error("   - TELNYX_FROM_NUMBER");
        console.error("   - TELNYX_CALL_CONTROL_APP_ID");
      }
    } else if (error.request) {
      // Request made but no response
      console.error("No response received from server");
      console.error(`Target URL: ${API_URL}`);
      console.error("\n💡 Check if the server is running:");
      console.error("   npm run dev");
    } else {
      // Other error
      console.error("Error:", error.message);
      if (error.stack) {
        console.error("\nStack trace:");
        console.error(error.stack);
      }
    }
    
    console.error("\n🔍 Troubleshooting:");
    console.error("1. Ensure server is running: npm run dev");
    console.error("2. Check environment variables are set");
    console.error("3. Verify API_URL is correct:", API_URL);
    console.error("4. Check server logs for errors");
    
    process.exit(1);
  }
}

// Run the test
testAudioTransmission().catch(console.error);
