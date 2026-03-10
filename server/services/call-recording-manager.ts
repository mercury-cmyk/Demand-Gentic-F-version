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
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

const LOG_PREFIX = '[CallRecordingManager]';

// Checkpoint configuration — saves audio to disk periodically to prevent total loss on crash
const CHECKPOINT_INTERVAL_MS = 60_000; // Save checkpoint every 60 seconds
const CHECKPOINT_MIN_DURATION_SEC = 25; // Only checkpoint calls longer than 25s
const CHECKPOINT_DIR = path.join(os.tmpdir(), 'demandgentic-audio-checkpoints');

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

  // Checkpoint — periodic disk-based backup for crash recovery
  checkpointTimer: ReturnType<typeof setInterval> | null;
  checkpointPath: string | null;
  lastCheckpointBytes: number;
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
    checkpointTimer: null,
    checkpointPath: null,
    lastCheckpointBytes: 0,
  };

  activeRecordings.set(callId, session);

  // Start periodic checkpoint timer — saves audio to disk for crash recovery
  session.checkpointTimer = setInterval(() => {
    saveAudioCheckpoint(callId, session);
  }, CHECKPOINT_INTERVAL_MS);

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
 * Save audio checkpoint to disk for crash recovery.
 * Only checkpoints if the call is long enough and there's new audio since last checkpoint.
 */
function saveAudioCheckpoint(callId: string, session: CallRecordingSession): void {
  const durationSec = Math.round((Date.now() - session.startTime.getTime()) / 1000);
  if (durationSec < CHECKPOINT_MIN_DURATION_SEC) return; // too short to bother

  const totalBytes = session.inboundBytes + session.outboundBytes;
  if (totalBytes <= session.lastCheckpointBytes) return; // no new audio

  try {
    // Ensure checkpoint directory exists
    if (!fs.existsSync(CHECKPOINT_DIR)) {
      fs.mkdirSync(CHECKPOINT_DIR, { recursive: true });
    }

    const checkpointFile = path.join(CHECKPOINT_DIR, `${session.callSessionId}.checkpoint`);

    // Save metadata + raw audio chunk references as JSON
    const metadata = {
      callId,
      callSessionId: session.callSessionId,
      campaignId: session.campaignId,
      contactId: session.contactId,
      startTime: session.startTime.toISOString(),
      durationSec,
      inboundBytes: session.inboundBytes,
      outboundBytes: session.outboundBytes,
      inboundChunkCount: session.inboundAudioChunks.length,
      outboundChunkCount: session.outboundAudioChunks.length,
      checkpointTime: new Date().toISOString(),
    };

    // Save the full WAV to disk as a checkpoint
    const wavBuffer = createWavFromMulaw(
      session.inboundAudioChunks,
      session.outboundAudioChunks,
      session.inboundTimestamps,
      session.outboundTimestamps,
      session.startTime.getTime()
    );

    const wavFile = path.join(CHECKPOINT_DIR, `${session.callSessionId}.wav`);
    fs.writeFileSync(wavFile, wavBuffer);
    fs.writeFileSync(checkpointFile, JSON.stringify(metadata, null, 2));

    session.checkpointPath = wavFile;
    session.lastCheckpointBytes = totalBytes;

    console.log(`${LOG_PREFIX} 💾 Checkpoint saved for call ${callId}: ${Math.round(wavBuffer.length / 1024)}KB (${durationSec}s)`);
  } catch (err: any) {
    console.error(`${LOG_PREFIX} Failed to save checkpoint for call ${callId}:`, err?.message);
  }
}

/**
 * Clean up checkpoint files for a call (called after successful upload)
 */
function cleanupCheckpoint(session: CallRecordingSession): void {
  try {
    const metaFile = path.join(CHECKPOINT_DIR, `${session.callSessionId}.checkpoint`);
    const wavFile = path.join(CHECKPOINT_DIR, `${session.callSessionId}.wav`);

    if (fs.existsSync(metaFile)) fs.unlinkSync(metaFile);
    if (fs.existsSync(wavFile)) fs.unlinkSync(wavFile);
  } catch {
    // Non-critical — temp files will eventually be cleaned by OS
  }
}

/**
 * Stop checkpoint timer for a session
 */
function stopCheckpointTimer(session: CallRecordingSession): void {
  if (session.checkpointTimer) {
    clearInterval(session.checkpointTimer);
    session.checkpointTimer = null;
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
  stopCheckpointTimer(session);
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
      // CRITICAL: Mark recording as stored and save S3 key — without this,
      // post-call analyzer sees 'uploading' forever and skips transcription
      await db.update(callSessions)
        .set({
          recordingStatus: 'stored',
          recordingS3Key: s3Key,
        })
        .where(eq(callSessions.id, session.callSessionId));

      console.log(`${LOG_PREFIX} ✅ Recording uploaded and stored for call ${callId}: ${s3Key}`);
      cleanupCheckpoint(session);
      return s3Key;
    } else {
      console.error(`${LOG_PREFIX} ❌ Failed to upload recording for call ${callId}`);
      // Keep checkpoint on disk — recovery process can use it
      return null;
    }
  } catch (error) {
    console.error(`${LOG_PREFIX} ❌ Error processing recording for call ${callId}:`, error);

    await db.update(callSessions)
      .set({ recordingStatus: 'failed' })
      .where(eq(callSessions.id, session.callSessionId));

    // Keep checkpoint on disk — recovery process can use it
    if (session.checkpointPath) {
      console.log(`${LOG_PREFIX} 💾 Checkpoint preserved at ${session.checkpointPath} for crash recovery`);
    }

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
  stopCheckpointTimer(session);
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
// WAV FILE CREATION (STEREO for Speaker Separation)
// ============================================================================

/**
 * Create a Stereo WAV file from disconnected μ-law encoded audio chunks.
 * Uses timestamps to synchronize audio streams (filling gaps with silence).
 * 
 * Channel 0 (Left): Inbound (User/Prospect)
 * Channel 1 (Right): Outbound (AI Agent)
 * 
 * @param inboundChunks - User audio chunks (G.711 μ-law)
 * @param outboundChunks - AI audio chunks (G.711 μ-law)
 * @param inboundTimestamps - Timestamps for inbound chunks
 * @param outboundTimestamps - Timestamps for outbound chunks
 * @param startTime - Recording start time (reference for t=0)
 */
function createWavFromMulaw(
  inboundChunks: Buffer[],
  outboundChunks: Buffer[],
  inboundTimestamps: number[],
  outboundTimestamps: number[],
  startTime: number
): Buffer {
  // 1. Calculate total duration
  let maxTimeMs = 0;
  
  const calculateEnd = (chunks: Buffer[], timestamps: number[]) => {
    if (chunks.length === 0 || timestamps.length === 0) return;
    const lastIdx = timestamps.length - 1;
    const startOffsetMs = timestamps[lastIdx] - startTime;
    // 8kHz = 8 samples/ms = 8 bytes/ms (u-law)
    const durationMs = chunks[lastIdx].length / 8;
    maxTimeMs = Math.max(maxTimeMs, startOffsetMs + durationMs);
  };
  
  calculateEnd(inboundChunks, inboundTimestamps);
  calculateEnd(outboundChunks, outboundTimestamps);

  // Add 1 second buffer for safety
  maxTimeMs += 1000;

  // 2. Allocate Stereo PCM Buffer (16-bit)
  // 8 samples/ms * maxTimeMs * 2 channels * 2 bytes/sample
  const totalSamples = Math.ceil(maxTimeMs * 8);
  const bufferSize = totalSamples * 4; // 4 bytes per stereo frame (L+R)
  const stereoPcm = Buffer.alloc(bufferSize, 0); // Initialize with silence

  // 3. Helper to write chunks to specific channel
  const placeChunks = (chunks: Buffer[], timestamps: number[], channel: 0 | 1) => {
    chunks.forEach((chunk, idx) => {
      // Calculate start sample index based on timestamp
      const offsetMs = timestamps[idx] - startTime;
      if (offsetMs < 0) return; // ignore pre-start audio
      
      const startSampleIndex = Math.floor(offsetMs * 8);
      
      // Convert chunk to PCM
      const pcmChunk = mulawToPcm(chunk); // returns 16-bit PCM buffer
      
      // Write samples to stereo buffer
      for (let i = 0; i < pcmChunk.length; i += 2) {
        // Read 16-bit sample
        const sample = pcmChunk.readInt16LE(i);
        
        // Calculate position in stereo buffer
        // Frame index = startSampleIndex + (i/2)
        // Byte index = Frame index * 4 + Channel offset * 2
        const frameIndex = startSampleIndex + (i / 2);
        if (frameIndex >= totalSamples) break;
        
        const byteIndex = (frameIndex * 4) + (channel * 2);
        
        if (byteIndex + 1 < stereoPcm.length) {
          stereoPcm.writeInt16LE(sample, byteIndex);
        }
      }
    });
  };

  // 4. Place Audio
  placeChunks(inboundChunks, inboundTimestamps, 0);  // Left = User
  placeChunks(outboundChunks, outboundTimestamps, 1); // Right = AI

  // 5. Create WAV header
  console.log(`${LOG_PREFIX} Generating Stereo WAV: ${Math.round(totalSamples/8000)}s duration, ${stereoPcm.length} bytes`);
  const wavHeader = createWavHeader(stereoPcm.length, 8000, 2, 16);
  
  return Buffer.concat([wavHeader, stereoPcm]);
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
// CHECKPOINT RECOVERY — run on server startup to salvage audio from crashed calls
// ============================================================================

/**
 * Recover and upload any audio checkpoints left from crashed calls.
 * Call this during server startup to ensure no long-call audio is lost.
 */
export async function recoverAudioCheckpoints(): Promise<{ recovered: number; failed: number }> {
  const stats = { recovered: 0, failed: 0 };

  if (!fs.existsSync(CHECKPOINT_DIR)) return stats;

  const checkpointFiles = fs.readdirSync(CHECKPOINT_DIR).filter(f => f.endsWith('.checkpoint'));
  if (checkpointFiles.length === 0) return stats;

  console.log(`${LOG_PREFIX} 🔄 Found ${checkpointFiles.length} audio checkpoint(s) from previous session — recovering...`);

  for (const metaFile of checkpointFiles) {
    try {
      const metaPath = path.join(CHECKPOINT_DIR, metaFile);
      const metadata = JSON.parse(fs.readFileSync(metaPath, 'utf-8'));
      const wavFile = path.join(CHECKPOINT_DIR, `${metadata.callSessionId}.wav`);

      if (!fs.existsSync(wavFile)) {
        console.warn(`${LOG_PREFIX} Checkpoint WAV missing for ${metadata.callSessionId}, skipping`);
        fs.unlinkSync(metaPath);
        continue;
      }

      // Check if this session already has a recording (maybe it was uploaded before crash)
      const [session] = await db
        .select({ recordingStatus: callSessions.recordingStatus, recordingS3Key: callSessions.recordingS3Key })
        .from(callSessions)
        .where(eq(callSessions.id, metadata.callSessionId))
        .limit(1);

      if (session?.recordingS3Key && session.recordingStatus === 'stored') {
        console.log(`${LOG_PREFIX} Session ${metadata.callSessionId} already has recording — cleaning up checkpoint`);
        fs.unlinkSync(metaPath);
        fs.unlinkSync(wavFile);
        continue;
      }

      // Upload the checkpoint WAV
      const wavBuffer = fs.readFileSync(wavFile);
      console.log(`${LOG_PREFIX} 🔄 Uploading recovered audio for session ${metadata.callSessionId} (${Math.round(wavBuffer.length / 1024)}KB, ${metadata.durationSec}s)`);

      const s3Key = await uploadCallSessionRecordingBuffer(
        metadata.callSessionId,
        metadata.campaignId,
        wavBuffer,
        'wav'
      );

      if (s3Key) {
        // Update DB with stored status + S3 key so post-call analyzer can proceed
        await db.update(callSessions)
          .set({
            recordingStatus: 'stored',
            recordingS3Key: s3Key,
          })
          .where(eq(callSessions.id, metadata.callSessionId));

        console.log(`${LOG_PREFIX} ✅ Recovered recording uploaded and stored: ${s3Key}`);
        stats.recovered++;
      } else {
        console.error(`${LOG_PREFIX} ❌ Failed to upload recovered recording for ${metadata.callSessionId}`);
        stats.failed++;
      }

      // Clean up checkpoint files
      fs.unlinkSync(metaPath);
      fs.unlinkSync(wavFile);
    } catch (err: any) {
      console.error(`${LOG_PREFIX} Error recovering checkpoint ${metaFile}:`, err?.message);
      stats.failed++;
    }
  }

  console.log(`${LOG_PREFIX} 🔄 Checkpoint recovery complete: ${stats.recovered} recovered, ${stats.failed} failed`);
  return stats;
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
