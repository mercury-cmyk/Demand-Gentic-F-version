import "dotenv/config";

/**
 * Test OpenAI Realtime Voice API Call
 * Run with: npx tsx test-openai-realtime-call.ts
 * 
 * This script initiates a test call using OpenAI Realtime Voice API
 * with polling-based streaming start (no webhooks required).
 */

const PHONE_NUMBER = '+14179003844'; // Zahid Mohammadi
const VIRTUAL_AGENT_ID = '5e8437c7-d69c-4e96-9faf-14d63e40cf9e'; // UK Export Finance Agent

async function testOpenAIRealtimeCall() {
  console.log('🚀 Testing OpenAI Realtime Voice API Call\n');
  console.log(`📞 Phone: ${PHONE_NUMBER}`);
  console.log(`🤖 Agent: ${VIRTUAL_AGENT_ID}`);
  console.log('');

  // Check environment variables
  const requiredEnvVars = ['TELNYX_API_KEY', 'TELNYX_FROM_NUMBER', 'OPENAI_API_KEY'];
  for (const envVar of requiredEnvVars) {
    if (!process.env[envVar]) {
      console.error(`❌ Missing environment variable: ${envVar}`);
      process.exit(1);
    }
    console.log(`✓ ${envVar}: configured`);
  }
  console.log('');

  const telnyxApiKey = process.env.TELNYX_API_KEY!;
  const fromNumber = process.env.TELNYX_FROM_NUMBER!;
  // Use the Call Control App ID (required for Call Control API)
  const connectionId = process.env.TELNYX_CALL_CONTROL_APP_ID || '2853482451592807572';

  // Generate unique call identifiers
  const callId = `openai-test-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  const runId = `run-test-${Date.now()}`;
  const queueItemId = `queue-test-${Date.now()}`;
  const callAttemptId = `attempt-${Date.now()}`;
  const contactId = 'b39f3618-f170-4c49-bf2b-3664202ce4ce';
  const campaignId = 'ae5b353d-64a9-44d8-92cf-69d4726ca121';
  
  // Use demangent.ai for production testing
  const host = 'demangent.ai';

  // Quick reachability check over HTTPS (WSS must also be reachable from Telnyx)
  const checkUrl = `https://${host}/openai-realtime-dialer`;
  try {
    const reach = await fetch(checkUrl, { method: 'GET' });
    console.log(`🌐 Reachability check ${checkUrl}: status ${reach.status}`);
  } catch (err) {
    console.log(`⚠️ Reachability check failed for ${checkUrl}:`, err);
  }

  console.log(`📱 From Number: ${fromNumber}`);
  console.log(`🔑 Connection ID: ${connectionId}`);
  console.log('');

  console.log('📤 Initiating Telnyx call...\n');

  try {
    // Step 1: Create the call (without stream_url - we'll start streaming after answer)
    const requestBody: any = {
      connection_id: connectionId,
      to: PHONE_NUMBER,
      from: fromNumber,
      answering_machine_detection: "detect",
      client_state: Buffer.from(JSON.stringify({
        call_id: callId,
        provider: 'openai_realtime',
      })).toString('base64'),
    };

    const response = await fetch("https://api.telnyx.com/v2/calls", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${telnyxApiKey}`,
      },
      body: JSON.stringify(requestBody),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`❌ Telnyx API error: ${response.status}`);
      console.error(errorText);
      process.exit(1);
    }

    const result = await response.json();
    const callControlId = result.data?.call_control_id;

    console.log('✅ Call initiated successfully!');
    console.log(`   Call ID: ${callId}`);
    console.log(`   Call Control ID: ${callControlId}`);
    console.log('');
    console.log('📱 Your phone should ring shortly...');
    console.log('⏳ Polling for call answer...\n');

    // Step 2: Poll for call status and start streaming when answered
    let attempts = 0;
    const maxAttempts = 60; // allow up to 60 seconds for answer
    const pollInterval = 1000;
    let streamingStarted = false;

    const poll = async () => {
      attempts++;
      if (attempts > maxAttempts) {
        console.log('❌ Timeout waiting for call to be answered');
        return;
      }

      try {
        const statusResponse = await fetch(`https://api.telnyx.com/v2/calls/${callControlId}`, {
          headers: {
            Authorization: `Bearer ${telnyxApiKey}`,
          },
        });

        if (!statusResponse.ok) {
          if (statusResponse.status === 404) {
            console.log('📵 Call ended or not found');
            return;
          }
          console.log(`⚠️ Poll error: ${statusResponse.status}`);
          setTimeout(poll, pollInterval);
          return;
        }

        const statusText = await statusResponse.text();
        let statusData: any;
        try {
          statusData = JSON.parse(statusText);
        } catch {
          statusData = statusText;
        }
        const callState = statusData?.data?.state;
        const callIsAlive = statusData?.data?.is_alive === true;
        const callDuration = statusData?.data?.call_duration ?? 0;
        console.log(`   [${attempts}s] Call state: ${callState} | alive=${callIsAlive} | duration=${callDuration}s`);
        if (!callState || callState === 'undefined') {
          console.log(`   ↳ Raw status payload: ${typeof statusData === 'string' ? statusData : JSON.stringify(statusData)}`);
        }

        // Consider the call ready if answered OR media is alive with duration > 0
        const callReady = (callState === 'answered') || (callIsAlive && callDuration > 0);

        // Only start streaming after the call is actually ready
        if (callReady && !streamingStarted) {
          streamingStarted = true;
          console.log('\n🎉 Call ready (answered/alive), starting OpenAI Realtime streaming...\n');

          // Small grace delay to ensure media path is ready
          await new Promise((res) => setTimeout(res, 1000));

          // Build WebSocket URLs (primary + fallback)
          const wsParams = new URLSearchParams({
            call_id: callId,
            run_id: runId,
            campaign_id: campaignId,
            queue_item_id: queueItemId,
            call_attempt_id: callAttemptId,
            contact_id: contactId,
            virtual_agent_id: VIRTUAL_AGENT_ID,
          });
          const primaryWsUrl = `wss://${host}/openai-realtime-dialer?${wsParams.toString()}`;
          const fallbackWsUrl = `wss://${host}/ai-media-stream?${wsParams.toString()}`;

          console.log(`🔗 Primary stream URL: ${primaryWsUrl.substring(0, 80)}...`);
          console.log(`🔗 Fallback stream URL: ${fallbackWsUrl.substring(0, 80)}...`);

          // Try Telnyx streaming_start with primary, then fallback on connection failure
          const tryStartStreaming = async (streamUrl: string) => {
            let startAttempt = 0;
            const maxStartAttempts = 3;
            while (startAttempt < maxStartAttempts) {
              startAttempt++;
              const streamResponse = await fetch(`https://api.telnyx.com/v2/calls/${callControlId}/actions/streaming_start`, {
                method: "POST",
                headers: {
                  "Content-Type": "application/json",
                  Authorization: `Bearer ${telnyxApiKey}`,
                },
                body: JSON.stringify({
                  stream_url: streamUrl,
                  stream_track: "both_tracks",
                  enable_dialogflow: false,
                }),
              });

              const streamText = await streamResponse.text();
              if (streamResponse.ok) {
                console.log('✅ Streaming start response:');
                console.log(streamText);
                console.log('');
                console.log('The AI agent will:');
                console.log('1. Introduce itself as UK Export Finance representative');
                console.log('2. Offer the "Leading with Finance" whitepaper');
                console.log('3. Ask to confirm your email');
                console.log('4. Request permission for follow-up communications');
                console.log('');
                console.log('Speak naturally - the AI uses OpenAI Realtime for conversational responses.');
                return true;
              }

              console.error(`❌ Failed to start streaming (attempt ${startAttempt}): ${streamResponse.status}`);
              console.error(streamText);

              // If call not answered yet (422), wait a bit and retry
              if (streamResponse.status === 422 && startAttempt < maxStartAttempts) {
                await new Promise((res) => setTimeout(res, 1000 * startAttempt));
                continue;
              }

              // For destination errors (90046) or other failures, stop retries for this URL
              break;
            }
            return false;
          };

          const startedPrimary = await tryStartStreaming(primaryWsUrl);
          if (!startedPrimary) {
            console.log('↪️ Trying fallback /ai-media-stream endpoint...');
            const startedFallback = await tryStartStreaming(fallbackWsUrl);
            if (startedFallback) return;
          } else {
            return;
          }
          return;
        }

        if (callState === 'hangup' || callState === 'failed') {
          console.log(`📵 Call ended with state: ${callState}`);
          return;
        }

        // Continue polling
        setTimeout(poll, pollInterval);
      } catch (error) {
        console.error('⚠️ Poll error:', error);
        setTimeout(poll, pollInterval);
      }
    };

    // Start polling
    poll();

  } catch (error) {
    console.error('❌ Failed to initiate call:', error);
    process.exit(1);
  }
}

testOpenAIRealtimeCall().catch(console.error);
