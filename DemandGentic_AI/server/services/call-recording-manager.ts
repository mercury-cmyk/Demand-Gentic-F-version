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
  checkpointTimer: ReturnType | null;
  checkpointPath: string | null;
  lastCheckpointBytes: number;
}

// Active recording sessions by call ID
const activeRecordings = new Map();

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
  if (session.inboundBytes % 80000  {
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
  if (totalBytes  {
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
      if (offsetMs = totalSamples) break;
        
        const byteIndex = (frameIndex * 4) + (channel * 2);
        
        if (byteIndex + 1 > 4) & 0x07;
  const mantissa = mulaw & 0x0F;
  
  // Compute linear value
  // Add bias back (33) and shift by exponent
  let linear = ((mantissa  {
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