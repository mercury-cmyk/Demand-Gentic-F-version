
import WebSocket from 'ws';

const CAMPAIGN_ID = "bd8ab195-8eed-4d30-b792-6973cf5babda";
const WS_URL = `ws://localhost:5000/openai-realtime-dialer?campaign_id=${CAMPAIGN_ID}&call_id=test-manual-2`;

console.log(`Connecting to ${WS_URL}`);

const ws = new WebSocket(WS_URL);

ws.on('open', () => {
    console.log('Connected!');
    // Send a start message to simulate Telnyx start
    const startMsg = {
        event: "start",
        sequence_number: "1",
        start: {
            stream_sid: "stream-123",
            account_sid: "acc-123",
            call_control_id: "call-123",
            connection_id: "conn-123",
            from: "+15551234567",
            to: "+15557654321",
            media_format: {
                encoding: "mulaw",
                sample_rate: 8000,
                channels: 1
            },
            custom_parameters: {
                campaign_id: CAMPAIGN_ID,
                is_test_call: "true",
                call_id: "test-manual-2"
            }
        },
        stream_id: "stream-123"
    };
    ws.send(JSON.stringify(startMsg));
    console.log('Sent start message');
    
    setTimeout(() => {
        ws.close();
        process.exit(0);
    }, 5000);
});

ws.on('message', (data) => {
    console.log('Received:', data.toString());
});

ws.on('error', (err) => {
    console.error('Error:', err);
});
