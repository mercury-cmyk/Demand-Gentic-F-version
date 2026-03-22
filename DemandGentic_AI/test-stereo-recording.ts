import 'dotenv/config';
import { startRecording, recordInboundAudio, recordOutboundAudio, stopRecordingAndUpload } from './server/services/call-recording-manager';
import { v4 as uuidv4 } from 'uuid';

// Mock G.711 u-law silence (0xFF)
const SILENCE_BYTE = 0xFF;

// Generate simulated u-law audio chunk (8kHz, 20ms = 160 samples)
function generateChunk(size: number, pattern: number = SILENCE_BYTE): Buffer {
  return Buffer.alloc(size, pattern);
}

// Function to wait
const wait = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

async function runTest() {
  const callId = `test-call-${Date.now()}`;
  const callSessionId = uuidv4();
  
  console.log(`🎤 Starting Stereo Recording Test`);
  console.log(`Call ID: ${callId}`);
  console.log(`Session ID: ${callSessionId}`);

  // 1. Start Recording
  startRecording(callId, callSessionId, null, null);

  // 2. Simulate User speaking (Left Channel)
  // Time 0 - 500ms
  console.log('👤 User speaking (0-500ms)...');
  for (let i = 0; i < 5; i++) {
    const chunk = generateChunk(800); // 100ms
    recordInboundAudio(callId, chunk);
    await wait(100);
  }

  // 3. Simulate Silence (both)
  // Time 500 - 1000ms
  console.log('User silent, AI generating (500-1000ms)...');
  await wait(500);

  // 4. Simulate AI speaking (Right Channel)
  // Time 1000 - 1500ms
  console.log('🤖 AI speaking (1000-1500ms)...');
  for (let i = 0; i < 5; i++) {
    const chunk = generateChunk(800, 0xAA); // Different pattern for AI
    recordOutboundAudio(callId, chunk);
    await wait(100);
  }

  // 5. User interrupts
  // Time 1500 - 2000ms (Both speaking)
  console.log('🗣️ Crosstalk (1500-2000ms)...');
  for (let i = 0; i < 5; i++) {
    const userChunk = generateChunk(800, SILENCE_BYTE);
    const aiChunk = generateChunk(800, 0xAA);
    
    recordInboundAudio(callId, userChunk);
    recordOutboundAudio(callId, aiChunk);
    await wait(100);
  }

  // 6. Stop Phase
  console.log('🛑 Stopping recording...');
  const s3Key = await stopRecordingAndUpload(callId);
  
  console.log('✅ Test Complete');
}

runTest().catch(console.error);