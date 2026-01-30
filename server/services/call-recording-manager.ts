/**
 * Call Recording Manager
 * 
 * Handles real-time audio capture during calls and storage to cloud.
 * Buffers both inbound (user) and outbound (AI) audio streams,
 * then uploads to S3/GCS when call ends.
 * 
 * Audio format: G.711 μ-law at 8kHz from Telnyx
 */

import { uploadCallSessionRecordingBuffer, isRecordingStorageEnabled } from './recording-storage';
import { db } from '../db';
import { callSessions } from '../../shared/schema';
import { eq } from 'drizzle-orm';

const LOG_PREFIX = '[CallRecordingManager]';

// Recording state for each active call
interface CallRecordingSession {
  callSessionId: string;
  campaignId: string | null;
  contactId: string | null;
  
  // Audio buffers (interleaved for final mix)
  inboundAudioChunks: Buffer[];  // User audio from Telnyx
  outboundAudioChunks: Buffer[]; // AI audio from Gemini/OpenAI
  
  // Timing for interleaving
  inboundTimestamps: number[];
  outboundTimestamps: number[];
  
  // Stats
  inboundBytes: number;
  outboundBytes: number;
  startTime: Date;
  lastActivityTime: Date;
  
  // Recording settings
  isRecording: boolean;
  format: 'wav' | 'mp3';
}

// Active recording sessions by call ID
const activeRecordings = new Map<string, CallRecordingSession>();

/**
 * Start recording for a call session
 * Called when a call begins (after Telnyx stream connects)
 */
export function startRecording(
  callId: string,
  callSessionId: string,
  campaignId: string | null,
  contactId: string | null
): void {
  if (!isRecordingStorageEnabled()) {
    console.log(`${LOG_PREFIX} Recording storage not enabled, skipping recording for call ${callId}`);
    return;
  }

  if (activeRecordings.has(callId)) {
    console.warn(`${LOG_PREFIX} Recording already active for call ${callId}`);
    return;
  }

  const session: CallRecordingSession = {
    callSessionId,
    campaignId,
    contactId,
    inboundAudioChunks: [],
    outboundAudioChunks: [],
    inboundTimestamps: [],
    outboundTimestamps: [],
    inboundBytes: 0,
    outboundBytes: 0,
    startTime: new Date(),
    lastActivityTime: new Date(),
    isRecording: true,
    format: 'wav', // WAV for lossless quality, can transcode to MP3 later
  };

  activeRecordings.set(callId, session);

  // Mark recording as started in database
  db.update(callSessions)
    .set({ recordingStatus: 'recording' })
    .where(eq(callSessions.id, callSessionId))
    .then(() => {
      console.log(`${LOG_PREFIX} ✅ Started recording for call ${callId} (session: ${callSessionId})`);
    })
    .catch(err => {
      console.error(`${LOG_PREFIX} Failed to update recording status:`, err);
    });
}

/**
 * Record inbound audio chunk (from user via Telnyx)
 * Audio format: G.711 μ-law, 8kHz, mono
 */
export function recordInboundAudio(callId: string, audioBuffer: Buffer): void {
  const session = activeRecordings.get(callId);
  if (!session || !session.isRecording) return;

  session.inboundAudioChunks.push(audioBuffer);
  session.inboundTimestamps.push(Date.now());
  session.inboundBytes += audioBuffer.length;
  session.lastActivityTime = new Date();

  // Log progress every ~10 seconds of audio (80KB at 8kHz)
  if (session.inboundBytes % 80000 < audioBuffer.length) {
    const durationSec = Math.round((Date.now() - session.startTime.getTime()) / 1000);
    console.log(`${LOG_PREFIX} [${callId}] Inbound: ${Math.round(session.inboundBytes / 1024)}KB (${durationSec}s)`);
  }
}

/**
 * Record outbound audio chunk (AI response to user)
 * Audio format: G.711 μ-law, 8kHz, mono
 */
export function recordOutboundAudio(callId: string, audioBuffer: Buffer): void {
  const session = activeRecordings.get(callId);
  if (!session || !session.isRecording) return;

  session.outboundAudioChunks.push(audioBuffer);
  session.outboundTimestamps.push(Date.now());
  session.outboundBytes += audioBuffer.length;
  session.lastActivityTime = new Date();

  // Log progress every ~10 seconds of audio
  if (session.outboundBytes % 80000 < audioBuffer.length) {
    const durationSec = Math.round((Date.now() - session.startTime.getTime()) / 1000);
    console.log(`${LOG_PREFIX} [${callId}] Outbound: ${Math.round(session.outboundBytes / 1024)}KB (${durationSec}s)`);
  }
}

/**
 * Stop recording and upload to cloud storage
 * Called when call ends
 */
export async function stopRecordingAndUpload(callId: string): Promise<string | null> {
  const session = activeRecordings.get(callId);
  if (!session) {
    console.log(`${LOG_PREFIX} No active recording for call ${callId}`);
    return null;
  }

  session.isRecording = false;
  activeRecordings.delete(callId);

  const durationSec = Math.round((Date.now() - session.startTime.getTime()) / 1000);
  const totalBytes = session.inboundBytes + session.outboundBytes;

  console.log(`${LOG_PREFIX} Stopping recording for call ${callId}`);
  console.log(`${LOG_PREFIX}   Duration: ${durationSec}s`);
  console.log(`${LOG_PREFIX}   Inbound: ${Math.round(session.inboundBytes / 1024)}KB (${session.inboundAudioChunks.length} chunks)`);
  console.log(`${LOG_PREFIX}   Outbound: ${Math.round(session.outboundBytes / 1024)}KB (${session.outboundAudioChunks.length} chunks)`);

  // Skip if no audio captured
  if (totalBytes < 1000) {
    console.warn(`${LOG_PREFIX} Too little audio captured (${totalBytes} bytes), skipping upload`);
    
    await db.update(callSessions)
      .set({ recordingStatus: 'failed' })
      .where(eq(callSessions.id, session.callSessionId));
    
    return null;
  }

  try {
    // Create WAV file with mixed audio
    const wavBuffer = createWavFromMulaw(
      session.inboundAudioChunks,
      session.outboundAudioChunks,
      session.inboundTimestamps,
      session.outboundTimestamps,
      session.startTime.getTime()
    );

    console.log(`${LOG_PREFIX} Created WAV file: ${wavBuffer.length} bytes`);

    // Update status to uploading
    await db.update(callSessions)
      .set({ 
        recordingStatus: 'uploading',
        recordingDurationSec: durationSec,
      })
      .where(eq(callSessions.id, session.callSessionId));

    // Upload to S3
    const s3Key = await uploadCallSessionRecordingBuffer(
      session.callSessionId,
      session.campaignId,
      wavBuffer,
      'wav'
    );

    if (s3Key) {
      console.log(`${LOG_PREFIX} ✅ Recording uploaded for call ${callId}: ${s3Key}`);
      return s3Key;
    } else {
      console.error(`${LOG_PREFIX} ❌ Failed to upload recording for call ${callId}`);
      return null;
    }
  } catch (error) {
    console.error(`${LOG_PREFIX} ❌ Error processing recording for call ${callId}:`, error);
    
    await db.update(callSessions)
      .set({ recordingStatus: 'failed' })
      .where(eq(callSessions.id, session.callSessionId));
    
    return null;
  }
}

/**
 * Cancel recording without uploading (e.g., for very short calls or errors)
 */
export function cancelRecording(callId: string): void {
  const session = activeRecordings.get(callId);
  if (!session) return;

  session.isRecording = false;
  activeRecordings.delete(callId);

  console.log(`${LOG_PREFIX} Cancelled recording for call ${callId}`);

  // Mark as failed in database
  db.update(callSessions)
    .set({ recordingStatus: 'failed' })
    .where(eq(callSessions.id, session.callSessionId))
    .catch(err => {
      console.error(`${LOG_PREFIX} Failed to update recording status:`, err);
    });
}

/**
 * Check if recording is active for a call
 */
export function isRecordingActive(callId: string): boolean {
  const session = activeRecordings.get(callId);
  return session?.isRecording ?? false;
}

/**
 * Get recording stats for a call
 */
export function getRecordingStats(callId: string): {
  durationSec: number;
  inboundBytes: number;
  outboundBytes: number;
} | null {
  const session = activeRecordings.get(callId);
  if (!session) return null;

  return {
    durationSec: Math.round((Date.now() - session.startTime.getTime()) / 1000),
    inboundBytes: session.inboundBytes,
    outboundBytes: session.outboundBytes,
  };
}

// ============================================================================
// WAV FILE CREATION
// ============================================================================

/**
 * Create a WAV file from μ-law encoded audio chunks
 * Mixes inbound and outbound audio into a stereo file
 * (Left channel = user, Right channel = AI)
 * 
 * @param inboundChunks - User audio chunks (G.711 μ-law)
 * @param outboundChunks - AI audio chunks (G.711 μ-law)
 * @param inboundTimestamps - Timestamps for inbound chunks
 * @param outboundTimestamps - Timestamps for outbound chunks
 * @param startTime - Recording start time
 */
function createWavFromMulaw(
  inboundChunks: Buffer[],
  outboundChunks: Buffer[],
  inboundTimestamps: number[],
  outboundTimestamps: number[],
  startTime: number
): Buffer {
  // Convert all chunks to linear PCM
  const inboundPcm = mulawToPcm(Buffer.concat(inboundChunks));
  const outboundPcm = mulawToPcm(Buffer.concat(outboundChunks));

  // For simplicity, create a mono mix (average of both channels)
  // A proper implementation would use timestamps for precise mixing
  const maxLength = Math.max(inboundPcm.length, outboundPcm.length);
  const mixedPcm = Buffer.alloc(maxLength);

  for (let i = 0; i < maxLength; i += 2) {
    const inSample = i < inboundPcm.length ? inboundPcm.readInt16LE(i) : 0;
    const outSample = i < outboundPcm.length ? outboundPcm.readInt16LE(i) : 0;
    
    // Mix both channels (clamp to prevent overflow)
    let mixed = Math.round((inSample + outSample) / 2);
    mixed = Math.max(-32768, Math.min(32767, mixed));
    
    if (i + 1 < maxLength) {
      mixedPcm.writeInt16LE(mixed, i);
    }
  }

  // Create WAV header
  const wavHeader = createWavHeader(mixedPcm.length, 8000, 1, 16);
  
  return Buffer.concat([wavHeader, mixedPcm]);
}

/**
 * Convert G.711 μ-law to linear 16-bit PCM
 * μ-law is 8-bit logarithmic, PCM is 16-bit linear
 */
function mulawToPcm(mulawBuffer: Buffer): Buffer {
  const pcmBuffer = Buffer.alloc(mulawBuffer.length * 2); // 8-bit to 16-bit
  
  for (let i = 0; i < mulawBuffer.length; i++) {
    const mulaw = mulawBuffer[i];
    const pcm = mulawDecode(mulaw);
    pcmBuffer.writeInt16LE(pcm, i * 2);
  }
  
  return pcmBuffer;
}

/**
 * Decode a single μ-law byte to 16-bit linear PCM
 * Based on ITU-T G.711 specification
 */
function mulawDecode(mulaw: number): number {
  // Invert all bits
  mulaw = ~mulaw & 0xFF;
  
  // Extract sign, exponent, and mantissa
  const sign = (mulaw & 0x80) ? -1 : 1;
  const exponent = (mulaw >> 4) & 0x07;
  const mantissa = mulaw & 0x0F;
  
  // Compute linear value
  // Add bias back (33) and shift by exponent
  let linear = ((mantissa << 3) + 0x84) << exponent;
  linear -= 0x84; // Remove bias
  
  return sign * linear;
}

/**
 * Create a WAV file header
 */
function createWavHeader(
  dataSize: number,
  sampleRate: number,
  numChannels: number,
  bitsPerSample: number
): Buffer {
  const header = Buffer.alloc(44);
  
  const byteRate = sampleRate * numChannels * (bitsPerSample / 8);
  const blockAlign = numChannels * (bitsPerSample / 8);
  
  // RIFF header
  header.write('RIFF', 0);
  header.writeUInt32LE(36 + dataSize, 4);
  header.write('WAVE', 8);
  
  // fmt subchunk
  header.write('fmt ', 12);
  header.writeUInt32LE(16, 16); // Subchunk1Size for PCM
  header.writeUInt16LE(1, 20); // AudioFormat (1 = PCM)
  header.writeUInt16LE(numChannels, 22);
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(byteRate, 28);
  header.writeUInt16LE(blockAlign, 32);
  header.writeUInt16LE(bitsPerSample, 34);
  
  // data subchunk
  header.write('data', 36);
  header.writeUInt32LE(dataSize, 40);
  
  return header;
}

// ============================================================================
// CLEANUP
// ============================================================================

/**
 * Clean up any stale recordings (e.g., from crashed calls)
 * Run periodically to prevent memory leaks
 */
export function cleanupStaleRecordings(maxAgeSec: number = 3600): void {
  const now = Date.now();
  const staleThreshold = maxAgeSec * 1000;
  
  for (const [callId, session] of activeRecordings.entries()) {
    const age = now - session.lastActivityTime.getTime();
    
    if (age > staleThreshold) {
      console.warn(`${LOG_PREFIX} Cleaning up stale recording for call ${callId} (age: ${Math.round(age / 1000)}s)`);
      cancelRecording(callId);
    }
  }
}

// Run cleanup every 30 minutes
setInterval(() => cleanupStaleRecordings(3600), 30 * 60 * 1000);
