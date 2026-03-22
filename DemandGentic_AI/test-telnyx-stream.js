// Test if Telnyx accepts media streaming parameters
import dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

async function testTelnyxStream() {
  const telnyxApiKey = process.env.TELNYX_API_KEY;
  const connectionId = process.env.TELNYX_CALL_CONTROL_APP_ID;
  const fromNumber = process.env.TELNYX_FROM_NUMBER || '+16692810857';
  const toNumber = process.env.TEST_PHONE_NUMBER || '+14179003844';
  const baseStreamUrl = process.env.PUBLIC_WEBSOCKET_URL ||
    'wss://producer-suggestion-favourites-engineer.trycloudflare.com/openai-realtime-dialer';

  if (!telnyxApiKey || !connectionId) {
    console.error('Missing TELNYX_API_KEY or TELNYX_CALL_CONTROL_APP_ID in environment.');
    process.exit(1);
  }

  const callId = `openai-test-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  const runId = `run-test-${Date.now()}`;
  const queueItemId = `queue-test-${Date.now()}`;
  const callAttemptId = `attempt-${Date.now()}`;
  const contactId = `contact-test-${Date.now()}`;
  const campaignId = process.env.TEST_CAMPAIGN_ID || 'test-campaign';
  const virtualAgentId = process.env.TEST_VIRTUAL_AGENT_ID || 'test-agent';

  const wsParams = new URLSearchParams({
    call_id: callId,
    run_id: runId,
    campaign_id: campaignId,
    queue_item_id: queueItemId,
    call_attempt_id: callAttemptId,
    contact_id: contactId,
    virtual_agent_id: virtualAgentId,
  });
  const streamUrl = baseStreamUrl.includes('?')
    ? `${baseStreamUrl}&${wsParams.toString()}`
    : `${baseStreamUrl}?${wsParams.toString()}`;

  const customParameters = {
    call_id: callId,
    run_id: runId,
    campaign_id: campaignId,
    queue_item_id: queueItemId,
    call_attempt_id: callAttemptId,
    contact_id: contactId,
    virtual_agent_id: virtualAgentId,
    provider: 'openai_realtime',
  };
  const clientState = Buffer.from(JSON.stringify(customParameters)).toString('base64');

  console.log('Testing Telnyx Media Streaming...');
  console.log('Connection ID:', connectionId);
  console.log('Stream URL:', streamUrl);
  console.log('To:', toNumber, 'From:', fromNumber);
  console.log('Call ID:', callId);

  const response = await fetch('https://api.telnyx.com/v2/calls', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${telnyxApiKey}`,
    },
    body: JSON.stringify({
      connection_id: connectionId,
      to: toNumber,
      from: fromNumber,
      stream_url: streamUrl,
      stream_track: 'both_tracks',
      stream_bidirectional_mode: 'rtp',
      custom_parameters: customParameters,
      client_state: clientState,
      answering_machine_detection: 'disabled',
    }),
  });

  const responseText = await response.text();
  console.log('\nResponse Status:', response.status);
  console.log('Response Body:', responseText);

  if (response.ok) {
    const result = JSON.parse(responseText);
    console.log('\n✅ Call initiated successfully!');
    console.log('Call Control ID:', result.data.call_control_id);
    console.log('\nNow watch your server logs for:');
    console.log('[OpenAI-Realtime-Dialer] New Telnyx connection from...');
    console.log('\nIf you DON\'T see this message, Media Streaming is not working.');
  } else {
    console.log('\n❌ Call failed!');
    console.log('Check if the error mentions "stream_url" or "media streaming"');
  }
}

testTelnyxStream().catch(console.error);