/**
 * Audio Transcoder for Voice Providers
 *
 * Handles conversion between different audio formats:
 * - G.711 ulaw/alaw (8kHz, 8-bit) - Used by Telnyx
 * - PCM (16kHz, 16-bit LE) - Used by Gemini Live API input
 * - PCM (24kHz, 16-bit LE) - Used by Gemini Live API output
 *
 * Audio quality settings are configured in audio-configuration.ts (unified across all call paths)
 * 
 * Reference:
 * - G.711 ulaw: ITU-T G.711 (PCMU)
 * - G.711 alaw: ITU-T G.711 (PCMA)
 */

// Import unified audio config (applies to test and production equally)
import { UNIFIED_AUDIO_CONFIG } from "../audio-configuration";

const LOG_PREFIX = "[AudioTranscoder]";

// ==================== G.711 TABLES ====================

// ulaw to linear PCM lookup table (8-bit -> 16-bit)
const ULAW_TO_LINEAR: Int16Array = new Int16Array(256);
const LINEAR_TO_ULAW: Uint8Array = new Uint8Array(65536);

// alaw to linear PCM lookup table
const ALAW_TO_LINEAR: Int16Array = new Int16Array(256);
const LINEAR_TO_ALAW: Uint8Array = new Uint8Array(65536);

// Initialize lookup tables
function initializeTables(): void {
  // Build ulaw decode table
  for (let i = 0; i < 256; i++) {
    const ulawByte = ~i;
    const sign = (ulawByte & 0x80) ? -1 : 1;
    const exponent = (ulawByte >> 4) & 0x07;
    const mantissa = ulawByte & 0x0f;
    const magnitude = ((mantissa << 3) + 0x84) << exponent;
    ULAW_TO_LINEAR[i] = sign * (magnitude - 0x84);
  }

  // Build ulaw encode table
  for (let i = 0; i < 65536; i++) {
    const sample = i < 32768 ? i : i - 65536; // Convert to signed
    LINEAR_TO_ULAW[i] = linearToUlaw(sample);
  }

  // Build alaw decode table
  for (let i = 0; i < 256; i++) {
    const alawByte = i ^ 0x55;
    const sign = (alawByte & 0x80) ? -1 : 1;
    const exponent = (alawByte >> 4) & 0x07;
    const mantissa = alawByte & 0x0f;

    let magnitude: number;
    if (exponent === 0) {
      magnitude = (mantissa << 4) + 8;
    } else {
      magnitude = ((mantissa << 4) + 0x108) << (exponent - 1);
    }
    ALAW_TO_LINEAR[i] = sign * magnitude;
  }

  // Build alaw encode table
  for (let i = 0; i < 65536; i++) {
    const sample = i < 32768 ? i : i - 65536;
    LINEAR_TO_ALAW[i] = linearToAlaw(sample);
  }
}

// Direct ulaw encoding (used to build table)
function linearToUlaw(sample: number): number {
  const BIAS = 0x84;
  const CLIP = 32635;

  const sign = (sample >> 8) & 0x80;
  if (sign) sample = -sample;
  if (sample > CLIP) sample = CLIP;

  sample += BIAS;

  let exponent = 7;
  for (let expMask = 0x4000; (sample & expMask) === 0 && exponent > 0; exponent--, expMask >>= 1) {}

  const mantissa = (sample >> (exponent + 3)) & 0x0f;
  const ulawByte = ~(sign | (exponent << 4) | mantissa);

  return ulawByte & 0xff;
}

// Direct alaw encoding (used to build table)
// FIXED Feb 2026: Corrected exponent calculation that was producing negative values
// for samples in the 256-2047 range, causing encoding errors and noise
function linearToAlaw(sample: number): number {
  const sign = (sample >> 8) & 0x80;
  if (sign) sample = -sample;

  let exponent: number;
  let mantissa: number;

  // Clamp to valid range
  if (sample > 32767) sample = 32767;

  // A-law uses segment-based companding
  // Segment 0: samples 0-255 (linear)
  // Segments 1-7: samples 256-32767 (logarithmic)
  if (sample >= 256) {
    // Find the segment (exponent) using bit position
    // This is more accurate than Math.log2 which can have floating-point issues
    let tempSample = sample;
    exponent = 1;
    while (tempSample >= 512 && exponent < 7) {
      tempSample >>= 1;
      exponent++;
    }
    // Extract mantissa from the appropriate bit position
    mantissa = (sample >> (exponent + 3)) & 0x0f;
  } else {
    // Linear segment (segment 0)
    exponent = 0;
    mantissa = sample >> 4;
  }

  const alawByte = (sign | (exponent << 4) | mantissa) ^ 0x55;
  return alawByte & 0xff;
}

// Initialize tables on module load
initializeTables();

// ==================== TRANSCODING FUNCTIONS ====================

export type G711Format = 'ulaw' | 'alaw';
export type AudioFormatType = 'g711_ulaw' | 'g711_alaw' | 'pcm_8k' | 'pcm_16k' | 'pcm_24k';

/**
 * Detect G.711 format from phone number or raw string
 * 
 * CRITICAL FIX (Feb 2026): Telnyx WebSocket <Stream> ALWAYS defaults to PCMU (µ-law)
 * regardless of the SIP leg codec. The start message reports the actual encoding.
 * 
 * Priority order:
 * 1. Telnyx-reported format (from start message media_format.encoding) — TRUST THIS
 * 2. Phone number heuristic — ONLY if no format reported (non-WebSocket paths)
 * 
 * Previous bug: Phone number overrode Telnyx format, causing A-law encoding
 * on a µ-law WebSocket stream → garbled audio for UK/EU calls.
 */
export function detectG711Format(phoneNumber?: string, rawFormat?: string): G711Format {
  // 1. PRIORITY: Telnyx-reported format (from WebSocket start message)
  // This is the ACTUAL codec on the WebSocket stream. Always trust it.
  // Telnyx handles SIP↔WebSocket codec translation internally.
  if (rawFormat) {
    const normalized = rawFormat.toLowerCase();
    if (normalized.includes('alaw') || normalized.includes('pcma') || normalized.includes('g711a')) {
      console.log(`[AudioTranscoder] Format detected from Telnyx: A-law (raw: ${rawFormat})`);
      return 'alaw';
    }
    if (normalized.includes('ulaw') || normalized.includes('pcmu') || normalized.includes('g711u') || normalized.includes('mulaw')) {
      console.log(`[AudioTranscoder] Format detected from Telnyx: µ-law (raw: ${rawFormat})`);
      return 'ulaw';
    }
  }

  // 2. FALLBACK: Phone number heuristic (only when Telnyx doesn't report format)
  // This path is used for non-WebSocket call paths or when start message lacks media_format
  if (phoneNumber) {
    const cleanNumber = phoneNumber.replace(/\D/g, '');
    if (cleanNumber.startsWith('1')) return 'ulaw'; // US/Canada - µ-law
    if (cleanNumber.startsWith('44')) return 'alaw'; // UK - A-law
    if (cleanNumber.startsWith('49')) return 'alaw'; // Germany - A-law
    if (cleanNumber.startsWith('33')) return 'alaw'; // France - A-law
    if (cleanNumber.startsWith('61')) return 'alaw'; // Australia - A-law
    // Most international calls outside North America use A-law
    return 'alaw';
  }

  return 'ulaw'; // Default to µ-law (Telnyx WebSocket default)
}

/**
 * Convert G.711 encoded audio to 16-bit PCM at 8kHz
 */
export function g711ToPcm8k(g711Buffer: Buffer, format: G711Format): Buffer {
  const lookupTable = format === 'ulaw' ? ULAW_TO_LINEAR : ALAW_TO_LINEAR;
  const pcmBuffer = Buffer.alloc(g711Buffer.length * 2);

  for (let i = 0; i < g711Buffer.length; i++) {
    const sample = lookupTable[g711Buffer[i]];
    pcmBuffer.writeInt16LE(sample, i * 2);
  }

  return pcmBuffer;
}

/**
 * Convert 16-bit PCM at 8kHz to G.711 encoded audio
 */
export function pcm8kToG711(pcmBuffer: Buffer, format: G711Format): Buffer {
  const lookupTable = format === 'ulaw' ? LINEAR_TO_ULAW : LINEAR_TO_ALAW;
  const g711Buffer = Buffer.alloc(pcmBuffer.length / 2);

  for (let i = 0; i < g711Buffer.length; i++) {
    const sample = pcmBuffer.readInt16LE(i * 2);
    // Convert signed 16-bit to unsigned 16-bit for table lookup
    const unsigned = sample < 0 ? sample + 65536 : sample;
    g711Buffer[i] = lookupTable[unsigned];
  }

  return g711Buffer;
}

/**
 * Soft noise gate to reduce background noise
 * Uses a soft knee to avoid harsh gating artifacts
 * Only affects samples below the threshold, preserving speech
 * 
 * UPDATED Feb 2026: Made much more conservative to prevent cutting into speech
 * which was causing "noisy" distorted audio when speech was partially gated
 *
 * @param pcmBuffer - Input PCM audio buffer (16-bit LE)
 * @param threshold - Noise floor threshold (0-32767, default 80 - very conservative)
 * @param ratio - Reduction ratio for samples below threshold (0-1, default 0.5 - gentle)
 * @returns Noise-gated PCM buffer
 */
function softNoiseGate(pcmBuffer: Buffer, threshold: number = 80, ratio: number = 0.5): Buffer {
  const samples = pcmBuffer.length / 2;
  if (samples === 0) return pcmBuffer;

  // Calculate RMS energy to detect if there's actual speech
  let sumSquared = 0;
  let peakSample = 0;
  for (let i = 0; i < samples; i++) {
    const sample = pcmBuffer.readInt16LE(i * 2);
    sumSquared += sample * sample;
    if (Math.abs(sample) > peakSample) peakSample = Math.abs(sample);
  }
  const rms = Math.sqrt(sumSquared / samples);

  // CRITICAL: If any speech detected (RMS > 50 or peak > 200), don't gate at all
  // This prevents the gate from cutting into speech transitions
  if (rms > 50 || peakSample > 200) {
    return pcmBuffer;
  }

  // Only apply very gentle gating to truly silent sections
  const output = Buffer.alloc(pcmBuffer.length);
  for (let i = 0; i < samples; i++) {
    let sample = pcmBuffer.readInt16LE(i * 2);
    const absSample = Math.abs(sample);

    // Only gate very quiet samples (noise floor)
    if (absSample < threshold) {
      // Gentle reduction - preserve more of the signal
      sample = Math.round(sample * ratio);
    }

    output.writeInt16LE(Math.max(-32768, Math.min(32767, sample)), i * 2);
  }

  return output;
}

/**
 * Remove DC offset from audio buffer
 * DC offset causes clicking and pops, especially at chunk boundaries
 *
 * @param pcmBuffer - Input PCM audio buffer (16-bit LE)
 * @returns Buffer with DC offset removed
 */
function removeDcOffset(pcmBuffer: Buffer): Buffer {
  const samples = pcmBuffer.length / 2;
  if (samples === 0) return pcmBuffer;

  // Calculate mean (DC offset)
  let sum = 0;
  for (let i = 0; i < samples; i++) {
    sum += pcmBuffer.readInt16LE(i * 2);
  }
  const dcOffset = Math.round(sum / samples);

  // If DC offset is negligible, skip processing
  if (Math.abs(dcOffset) < 10) {
    return pcmBuffer;
  }

  // Remove DC offset
  const output = Buffer.alloc(pcmBuffer.length);
  for (let i = 0; i < samples; i++) {
    const sample = pcmBuffer.readInt16LE(i * 2) - dcOffset;
    output.writeInt16LE(Math.max(-32768, Math.min(32767, sample)), i * 2);
  }

  return output;
}

/**
 * Normalize audio to prevent clipping and ensure consistent levels
 * Only applies normalization if audio is too hot (would clip)
 *
 * @param pcmBuffer - Input PCM audio buffer (16-bit LE)
 * @param targetLevel - Target peak level as fraction of full scale (0-1, typically 0.85-0.95)
 * @returns Normalized PCM buffer
 */
function normalizeAudio(pcmBuffer: Buffer, targetLevel: number = 0.9): Buffer {
  const samples = pcmBuffer.length / 2;
  if (samples === 0) return pcmBuffer;

  // Find peak amplitude
  let peak = 0;
  for (let i = 0; i < samples; i++) {
    const sample = Math.abs(pcmBuffer.readInt16LE(i * 2));
    if (sample > peak) peak = sample;
  }

  // If no signal or very low, return as-is (don't amplify noise)
  if (peak < 500) {
    return pcmBuffer;
  }

  // Calculate scaling factor
  const maxAllowed = Math.floor(32767 * targetLevel);

  // Only normalize if we need to reduce (prevent clipping)
  // Don't boost quiet audio - it amplifies noise
  if (peak <= maxAllowed) {
    return pcmBuffer;
  }

  const scale = maxAllowed / peak;

  // Apply normalization
  const normalized = Buffer.alloc(pcmBuffer.length);
  for (let i = 0; i < samples; i++) {
    const sample = pcmBuffer.readInt16LE(i * 2);
    const scaled = Math.round(sample * scale);
    normalized.writeInt16LE(Math.max(-32768, Math.min(32767, scaled)), i * 2);
  }

  return normalized;
}

/**
 * Generate windowed sinc filter coefficients for anti-aliasing
 * Uses Blackman window for better stopband attenuation with minimal ringing
 * (Blackman has less ringing than Hamming, which reduces voice artifacts)
 *
 * @param numTaps - Number of filter taps (must be odd)
 * @param cutoffFreq - Normalized cutoff frequency (0 to 0.5, where 0.5 = Nyquist)
 */
function generateLowPassFilter(numTaps: number, cutoffFreq: number): number[] {
  const coeffs: number[] = new Array(numTaps);
  const center = (numTaps - 1) / 2;
  let sum = 0;

  for (let i = 0; i < numTaps; i++) {
    const n = i - center;

    // Sinc function
    let sinc: number;
    if (n === 0) {
      sinc = 2 * cutoffFreq;
    } else {
      sinc = Math.sin(2 * Math.PI * cutoffFreq * n) / (Math.PI * n);
    }

    // Blackman window - provides better stopband attenuation with less ringing than Hamming
    const window = 0.42 - 0.5 * Math.cos(2 * Math.PI * i / (numTaps - 1)) 
                       + 0.08 * Math.cos(4 * Math.PI * i / (numTaps - 1));

    coeffs[i] = sinc * window;
    sum += coeffs[i];
  }

  // Normalize for unity gain
  for (let i = 0; i < numTaps; i++) {
    coeffs[i] /= sum;
  }

  return coeffs;
}

// Pre-computed filter for 24kHz → 8kHz (3:1 ratio)
// Input Nyquist = 12kHz, Target Nyquist = 4kHz
// UPDATED Feb 2026: Reduced taps (15 → 11) to minimize ringing artifacts
// Cutoff at 0.30 (3.6kHz) provides good voice quality without aliasing noise
const FILTER_24K_TO_8K = generateLowPassFilter(11, 0.30);

// Pre-computed filter for 16kHz → 8kHz (2:1 ratio)
// Input Nyquist = 8kHz, Target Nyquist = 4kHz
// UPDATED: Reduced taps to minimize ringing
const FILTER_16K_TO_8K = generateLowPassFilter(9, 0.42);

// A-LAW OPTIMIZATION (Fixed for Anti-aliasing):
// Issue: Previous "gentle" filter (cutoff 0.38 = 4.5kHz) was ABOVE the Nyquist limit (4kHz),
// causing severe aliasing noise.
// Fix: STRICTLY limit bandwidth to 3.0kHz (toll quality) to prevent aliasing.
// UPDATED Feb 2026: Use minimal taps (5-7) to eliminate ringing artifacts
// A-law's non-linear quantization makes filter ringing much more audible than µ-law
const FILTER_24K_TO_8K_ALAW = generateLowPassFilter(5, 0.25); // Cutoff ~3.0kHz, minimal ringing
const FILTER_16K_TO_8K_ALAW = generateLowPassFilter(5, 0.38); // Cutoff ~3.0kHz, minimal ringing

/**
 * Apply low-pass FIR filter for anti-aliasing before downsampling.
 * Prevents aliasing artifacts (the irritating noise) by removing
 * frequencies above the Nyquist frequency of the target sample rate.
 * 
 * @param useAlawFilter - Use gentler A-law optimized filter (for UK/Europe)
 */
function applyLowPassFilter(inputBuffer: Buffer, cutoffRatio: number, useAlawFilter: boolean = false): Buffer {
  const inputSamples = inputBuffer.length / 2;
  const outputBuffer = Buffer.alloc(inputBuffer.length);

  // Select appropriate pre-computed filter based on downsample ratio and codec
  let coeffs: number[];
  if (cutoffRatio <= 0.35) {
    // 3:1 downsampling (24kHz → 8kHz)
    coeffs = useAlawFilter ? FILTER_24K_TO_8K_ALAW : FILTER_24K_TO_8K;
  } else if (cutoffRatio <= 0.55) {
    // 2:1 downsampling (16kHz → 8kHz)
    coeffs = useAlawFilter ? FILTER_16K_TO_8K_ALAW : FILTER_16K_TO_8K;
  } else {
    // Minor downsampling - use simple averaging
    return inputBuffer;
  }

  const filterLen = coeffs.length;
  const halfLen = Math.floor(filterLen / 2);

  for (let i = 0; i < inputSamples; i++) {
    let sum = 0;

    for (let j = 0; j < filterLen; j++) {
      const srcIdx = i - halfLen + j;
      let sample = 0;

      if (srcIdx >= 0 && srcIdx < inputSamples) {
        sample = inputBuffer.readInt16LE(srcIdx * 2);
      }

      sum += sample * coeffs[j];
    }

    // Clamp to valid 16-bit range
    const clamped = Math.max(-32768, Math.min(32767, Math.round(sum)));
    outputBuffer.writeInt16LE(clamped, i * 2);
  }

  return outputBuffer;
}

/**
 * Resample PCM audio with proper anti-aliasing.
 * Uses low-pass filtering before downsampling to prevent aliasing artifacts.
 * Uses linear interpolation for upsampling (which is safe).
 */
export function resamplePcm(
  inputBuffer: Buffer,
  inputSampleRate: number,
  outputSampleRate: number
): Buffer {
  if (inputSampleRate === outputSampleRate) {
    return inputBuffer;
  }

  const ratio = outputSampleRate / inputSampleRate;
  let processedInput = inputBuffer;

  // When downsampling, apply anti-aliasing filter first
  // This removes frequencies above the target Nyquist frequency
  // to prevent them from folding back as noise (aliasing)
  if (ratio < 1) {
    // Apply low-pass filter with cutoff at target Nyquist frequency
    processedInput = applyLowPassFilter(inputBuffer, ratio);
  }

  const inputSamples = processedInput.length / 2;
  const outputSamples = Math.floor(inputSamples * ratio);
  const outputBuffer = Buffer.alloc(outputSamples * 2);

  for (let i = 0; i < outputSamples; i++) {
    const srcPos = i / ratio;
    const srcIndex = Math.floor(srcPos);
    const fraction = srcPos - srcIndex;

    const sample1 = srcIndex < inputSamples
      ? processedInput.readInt16LE(srcIndex * 2)
      : 0;
    const sample2 = srcIndex + 1 < inputSamples
      ? processedInput.readInt16LE((srcIndex + 1) * 2)
      : sample1;

    // Linear interpolation (safe after filtering for downsampling)
    const interpolated = Math.round(sample1 + (sample2 - sample1) * fraction);
    outputBuffer.writeInt16LE(Math.max(-32768, Math.min(32767, interpolated)), i * 2);
  }

  return outputBuffer;
}

/**
 * Resample PCM audio with format-aware anti-aliasing
 * Uses gentler filtering for A-law (UK/Europe) to reduce noise artifacts
 */
function resamplePcmWithFormat(
  inputBuffer: Buffer,
  inputSampleRate: number,
  outputSampleRate: number,
  useAlawFilter: boolean = false
): Buffer {
  if (inputSampleRate === outputSampleRate) {
    return inputBuffer;
  }

  const ratio = outputSampleRate / inputSampleRate;
  let processedInput = inputBuffer;

  // When downsampling, apply anti-aliasing filter first
  if (ratio < 1) {
    processedInput = applyLowPassFilter(inputBuffer, ratio, useAlawFilter);
  }

  const inputSamples = processedInput.length / 2;
  const outputSamples = Math.floor(inputSamples * ratio);
  const outputBuffer = Buffer.alloc(outputSamples * 2);

  for (let i = 0; i < outputSamples; i++) {
    const srcPos = i / ratio;
    const srcIndex = Math.floor(srcPos);
    const fraction = srcPos - srcIndex;

    const sample1 = srcIndex < inputSamples
      ? processedInput.readInt16LE(srcIndex * 2)
      : 0;
    const sample2 = srcIndex + 1 < inputSamples
      ? processedInput.readInt16LE((srcIndex + 1) * 2)
      : sample1;

    const interpolated = Math.round(sample1 + (sample2 - sample1) * fraction);
    outputBuffer.writeInt16LE(Math.max(-32768, Math.min(32767, interpolated)), i * 2);
  }

  return outputBuffer;
}

/**
 * Apply subtle high-frequency boost to improve speech clarity
 * Uses a simple first-order high-shelf filter to enhance consonants and sibilance
 * This makes speech more intelligible over telephony without sounding harsh
 * 
 * @param pcmBuffer - Input PCM audio buffer (16-bit LE, 16kHz)
 * @param boostDb - Amount of high-frequency boost in dB (default 2.0 - subtle)
 * @returns Enhanced PCM buffer
 */
function applyClarityBoost(pcmBuffer: Buffer, boostDb: number = 2.0): Buffer {
  const samples = pcmBuffer.length / 2;
  if (samples === 0) return pcmBuffer;

  // Convert dB to linear gain
  const boostGain = Math.pow(10, boostDb / 20);
  
  // Simple first-order high-shelf filter coefficients
  // Cutoff around 2kHz for speech clarity (alpha controls shelf frequency)
  const alpha = 0.15; // Controls the transition frequency
  const output = Buffer.alloc(pcmBuffer.length);
  
  let prevInput = 0;
  let prevOutput = 0;

  for (let i = 0; i < samples; i++) {
    const input = pcmBuffer.readInt16LE(i * 2);
    
    // High-pass component (difference from previous sample = high frequencies)
    const highPass = input - prevInput;
    
    // Mix original with boosted high frequencies
    // Original signal + (high-frequency component * (boost - 1))
    const enhanced = input + (highPass * alpha * (boostGain - 1));
    
    // Soft clipping to prevent harsh distortion
    let clipped = enhanced;
    if (Math.abs(enhanced) > 30000) {
      const sign = enhanced > 0 ? 1 : -1;
      clipped = sign * (30000 + (Math.abs(enhanced) - 30000) * 0.1);
    }
    
    output.writeInt16LE(Math.max(-32768, Math.min(32767, Math.round(clipped))), i * 2);
    
    prevInput = input;
    prevOutput = clipped;
  }

  return output;
}

/**
 * Convert G.711 (8kHz) to PCM 16kHz for Gemini Live API input
 * This is the main function for Telnyx -> Gemini audio path
 *
 * AUDIO QUALITY IMPROVEMENTS (Feb 2026):
 * 1. G.711 decode
 * 2. Remove DC offset (prevents clicking)
 * 3. Very gentle noise gate (only on truly silent sections)
 * 4. Upsample to 16kHz (no aliasing risk with upsampling)
 * 5. Apply subtle high-frequency boost for clarity
 */
export function g711ToPcm16k(g711Buffer: Buffer, format: G711Format): Buffer {
  const isAlaw = format === 'alaw';

  // Step 1: Decode G.711 to PCM 8kHz
  const pcm8k = g711ToPcm8k(g711Buffer, format);

  // Step 2: Remove DC offset (prevents clicking/popping)
  // Safe for inbound audio from PSTN which can have genuine DC offset
  const dcCorrected = removeDcOffset(pcm8k);

  // Step 3: Apply VERY gentle noise gate - only for µ-law
  // A-law already has good noise floor characteristics; gating can clip speech transitions
  const gatedPcm = isAlaw ? dcCorrected : softNoiseGate(dcCorrected, 60, 0.6);

  // Step 4: Upsample to 16kHz with linear interpolation
  // No filtering needed for upsampling (no aliasing risk)
  const pcm16k = resamplePcm(gatedPcm, 8000, 16000);

  // Step 5: Apply clarity boost ONLY for µ-law (US calls)
  // SKIP for A-law: boosting high frequencies before Gemini processes it causes
  // artifacts when re-encoded back to A-law on the outbound path.
  // A-law's non-linear quantization amplifies these boosted HF components into audible noise.
  const enhanced = isAlaw ? pcm16k : applyClarityBoost(pcm16k);

  return enhanced;
}

/**
 * Improved 3:1 decimation using weighted averaging after filtering
 *
 * UPDATED Feb 2026: Changed from point-picking to weighted averaging
 * Point-picking at offset 1 was causing phase discontinuities that manifested
 * as "noisy" distorted audio. Weighted averaging smooths the transition.
 *
 * Uses triangular window weights [0.25, 0.5, 0.25] to blend 3 samples into 1
 * This reduces high-frequency artifacts that cause the irritating noise.
 */
function simpleDecimate3to1(inputBuffer: Buffer): Buffer {
  const inputSamples = inputBuffer.length / 2;
  const outputSamples = Math.floor(inputSamples / 3);
  const outputBuffer = Buffer.alloc(outputSamples * 2);

  // Weighted averaging with triangular window [0.25, 0.5, 0.25]
  for (let i = 0; i < outputSamples; i++) {
    const srcIdx = i * 3;

    // Get 3 samples (with boundary handling)
    const s0 = srcIdx < inputSamples ? inputBuffer.readInt16LE(srcIdx * 2) : 0;
    const s1 = srcIdx + 1 < inputSamples ? inputBuffer.readInt16LE((srcIdx + 1) * 2) : s0;
    const s2 = srcIdx + 2 < inputSamples ? inputBuffer.readInt16LE((srcIdx + 2) * 2) : s1;

    // Weighted average: center sample weighted higher
    const averaged = Math.round(s0 * 0.25 + s1 * 0.5 + s2 * 0.25);

    // Clamp to valid range
    const clamped = Math.max(-32768, Math.min(32767, averaged));
    outputBuffer.writeInt16LE(clamped, i * 2);
  }

  return outputBuffer;
}

// State for cross-chunk smoothing (prevents pops/clicks at chunk boundaries)
let lastOutputSample: number = 0;

/**
 * Apply smooth transition at chunk start to prevent pops/clicks
 * Uses a short crossfade from the last sample of previous chunk
 */
function smoothChunkBoundary(pcmBuffer: Buffer, fadeInSamples: number = 4): Buffer {
  if (pcmBuffer.length < fadeInSamples * 2) return pcmBuffer;

  const output = Buffer.from(pcmBuffer); // Clone
  const samples = output.length / 2;

  // Smooth first few samples to transition from last chunk's end sample
  for (let i = 0; i < Math.min(fadeInSamples, samples); i++) {
    const currentSample = output.readInt16LE(i * 2);
    // Linear crossfade from lastOutputSample to current sample
    const t = (i + 1) / fadeInSamples; // 0.25, 0.5, 0.75, 1.0
    const blended = Math.round(lastOutputSample * (1 - t) + currentSample * t);
    output.writeInt16LE(Math.max(-32768, Math.min(32767, blended)), i * 2);
  }

  // Remember last sample for next chunk
  if (samples > 0) {
    lastOutputSample = output.readInt16LE((samples - 1) * 2);
  }

  return output;
}

/**
 * Noise gate — zeroes out PCM samples whose absolute level is below threshold.
 * Eliminates low-level hiss / static / quantisation noise that becomes
 * very audible after the 24 kHz → 8 kHz decimation.
 *
 * Threshold is tuned for 16-bit signed PCM (-32768 … 32767).
 * 200 ≈ −44 dBFS — below normal speech but above the noise floor.
 * A short hold-off window (holdSamples) prevents chopping the tail of
 * consonants / sibilants.
 */
function applyNoiseGate(pcmBuffer: Buffer, threshold: number = 200, holdSamples: number = 40): Buffer {
  const samples = pcmBuffer.length / 2;
  if (samples === 0) return pcmBuffer;

  const output = Buffer.alloc(pcmBuffer.length);
  let holdCounter = 0;

  for (let i = 0; i < samples; i++) {
    const sample = pcmBuffer.readInt16LE(i * 2);
    const abs = Math.abs(sample);

    if (abs >= threshold) {
      // Signal above gate — pass through and reset hold
      output.writeInt16LE(sample, i * 2);
      holdCounter = holdSamples;
    } else if (holdCounter > 0) {
      // Still inside hold window — pass through, fade gently
      const fade = holdCounter / holdSamples;
      output.writeInt16LE(Math.round(sample * fade), i * 2);
      holdCounter--;
    } else {
      // Below threshold & hold expired — silence
      output.writeInt16LE(0, i * 2);
    }
  }

  return output;
}

/**
 * Soft limiter for A-law to prevent harsh clipping
 * A-law is more sensitive to peak distortion than µ-law
 * Uses soft-knee compression above threshold
 */
function softLimitForAlaw(pcmBuffer: Buffer): Buffer {
  const samples = pcmBuffer.length / 2;
  if (samples === 0) return pcmBuffer;

  const output = Buffer.alloc(pcmBuffer.length);
  const threshold = 24000; // Start soft limiting here (73% of max)
  const knee = 8000; // Soft knee width

  for (let i = 0; i < samples; i++) {
    let sample = pcmBuffer.readInt16LE(i * 2);
    const absSample = Math.abs(sample);

    if (absSample > threshold) {
      // Soft compression above threshold
      const excess = absSample - threshold;
      const ratio = 0.3; // 3:1 compression ratio
      const compressed = threshold + (excess * ratio);
      sample = sample > 0 ? Math.round(compressed) : Math.round(-compressed);
    }

    output.writeInt16LE(Math.max(-32768, Math.min(32767, sample)), i * 2);
  }

  return output;
}

/**
 * Convert PCM 24kHz (Gemini output) to G.711 (8kHz) for Telnyx
 * This is the main function for Gemini -> Telnyx audio path
 *
 * AUDIO QUALITY IMPROVEMENTS (Feb 2026):
 * 1. Apply gentle normalization (reduced target to prevent clipping)
 * 2. Apply proper FIR anti-aliasing filter with reduced taps
 * 3. Decimate with weighted averaging instead of point-picking
 * 4. Smooth chunk boundaries to prevent pops/clicks
 * 5. Encode to G.711
 *
 * UK/A-LAW FIX (Feb 2026):
 * - Use gentler FIR filter (5 taps) for A-law to eliminate ringing artifacts
 * - Apply soft limiter to prevent harsh clipping distortion
 * - A-law's non-linear quantization makes artifacts much more audible
 */
export function pcm24kToG711(pcmBuffer: Buffer, format: G711Format): Buffer {
  const isAlaw = format === 'alaw';

  // Step 1: For A-law (UK), apply soft limiter instead of normalization
  // For µ-law (US), normalize with reduced target (0.88) to prevent clipping
  const processed = isAlaw ? softLimitForAlaw(pcmBuffer) : normalizeAudio(pcmBuffer, 0.88);

  // Step 2: Apply anti-aliasing FIR filter before downsampling
  // Use gentler A-law filter (5 taps) for UK/UAE calls to eliminate ringing artifacts
  const filtered = applyLowPassFilter(processed, 0.30, isAlaw);

  // Step 3: Decimate 3:1 (24kHz → 8kHz) with weighted averaging
  const pcm8k = simpleDecimate3to1(filtered);

  // Step 4: Smooth chunk boundary to prevent pops/clicks
  const smoothed = smoothChunkBoundary(pcm8k);

  // Step 5: Apply noise gate to suppress low-level hiss/static
  // A-law uses higher threshold (300) because its quantization makes noise more audible
  const gateThreshold = isAlaw ? 300 : 200;
  const gated = applyNoiseGate(smoothed, gateThreshold);

  // Step 6: Encode to G.711
  return pcm8kToG711(gated, format);
}

/**
 * Convert PCM 16kHz to G.711 (8kHz) for Telnyx
 * Alternative if Gemini sends 16kHz output
 *
 * AUDIO QUALITY FIXES (Feb 2026):
 * 1. For A-law: Apply soft limiter; For µ-law: Normalize with reduced target
 * 2. Downsample with anti-aliasing filter (gentler for A-law)
 * 3. Smooth chunk boundaries to prevent pops/clicks
 * 4. Encode to G.711
 */
export function pcm16kToG711(pcmBuffer: Buffer, format: G711Format): Buffer {
  const isAlaw = format === 'alaw';

  // Step 1: For A-law (UK/UAE), apply soft limiter instead of normalization
  // Use reduced target (0.88) for µ-law to prevent clipping
  const normalizedInput = isAlaw ? softLimitForAlaw(pcmBuffer) : normalizeAudio(pcmBuffer, 0.88);

  // Step 2: Downsample 16kHz to 8kHz with anti-aliasing (gentler filter for A-law)
  const pcm8k = resamplePcmWithFormat(normalizedInput, 16000, 8000, isAlaw);

  // Step 3: Smooth chunk boundary to prevent pops/clicks
  const smoothed = smoothChunkBoundary(pcm8k);

  // Step 4: Apply noise gate to suppress low-level hiss/static
  // A-law uses higher threshold (300) because its quantization makes noise more audible
  const gateThreshold = isAlaw ? 300 : 200;
  const gated = applyNoiseGate(smoothed, gateThreshold);

  // Step 5: Encode to G.711
  return pcm8kToG711(gated, format);
}

// ==================== AUDIO TRANSCODER CLASS ====================

export class AudioTranscoder {
  private inputFormat: G711Format;
  private outputFormat: G711Format;

  constructor(format: 'g711_ulaw' | 'g711_alaw' = 'g711_ulaw') {
    this.inputFormat = format === 'g711_alaw' ? 'alaw' : 'ulaw';
    this.outputFormat = format === 'g711_alaw' ? 'alaw' : 'ulaw';
  }

  /**
   * Convert incoming Telnyx audio (G.711) to Gemini format (PCM 16kHz)
   */
  telnyxToGemini(g711Buffer: Buffer): Buffer {
    return g711ToPcm16k(g711Buffer, this.inputFormat);
  }

  /**
   * Convert incoming Gemini audio (PCM 24kHz) to Telnyx format (G.711)
   */
  geminiToTelnyx(pcmBuffer: Buffer, sampleRate: 24000 | 16000 = 24000): Buffer {
    if (sampleRate === 24000) {
      return pcm24kToG711(pcmBuffer, this.outputFormat);
    }
    return pcm16kToG711(pcmBuffer, this.outputFormat);
  }

  /**
   * Pass through for OpenAI (already uses G.711)
   */
  telnyxToOpenAI(g711Buffer: Buffer): Buffer {
    return g711Buffer; // OpenAI Realtime accepts G.711 directly
  }

  /**
   * Pass through for OpenAI (already uses G.711)
   */
  openAIToTelnyx(g711Buffer: Buffer): Buffer {
    return g711Buffer; // OpenAI Realtime outputs G.711 directly
  }

  /**
   * Calculate audio duration in milliseconds
   */
  static calculateDurationMs(buffer: Buffer, format: AudioFormatType): number {
    switch (format) {
      case 'g711_ulaw':
      case 'g711_alaw':
        // G.711: 8kHz, 8-bit = 8 bytes per ms
        return buffer.length / 8;
      case 'pcm_8k':
        // PCM 8kHz, 16-bit = 16 bytes per ms
        return buffer.length / 16;
      case 'pcm_16k':
        // PCM 16kHz, 16-bit = 32 bytes per ms
        return buffer.length / 32;
      case 'pcm_24k':
        // PCM 24kHz, 16-bit = 48 bytes per ms
        return buffer.length / 48;
      default:
        return 0;
    }
  }

  /**
   * Convert base64 audio to buffer
   */
  static fromBase64(base64: string): Buffer {
    return Buffer.from(base64, 'base64');
  }

  /**
   * Convert buffer to base64
   */
  static toBase64(buffer: Buffer): string {
    return buffer.toString('base64');
  }
}

export default AudioTranscoder;
