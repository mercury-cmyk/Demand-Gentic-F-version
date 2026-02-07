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
function linearToAlaw(sample: number): number {
  const sign = (sample >> 8) & 0x80;
  if (sign) sample = -sample;

  let exponent: number;
  let mantissa: number;

  if (sample > 32767) sample = 32767;

  if (sample >= 256) {
    exponent = Math.floor(Math.log2(sample)) - 7;
    if (exponent > 7) exponent = 7;
    mantissa = (sample >> (exponent + 3)) & 0x0f;
  } else {
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
 * UPDATED: Prioritizes UK/EU country codes as 'alaw' because Telnyx/carriers 
 * sometimes report 'PCMU' default but the actual line requires A-law to avoid noise.
 */
export function detectG711Format(phoneNumber?: string, rawFormat?: string): G711Format {
  // 1. PRIORITY: Country-based hard overrides
  // UK (+44) and Germany (+49) are strictly A-law. 
  // Even if the signaling says PCMU, sending PCMU leads to static/noise.
  if (phoneNumber) {
    const cleanNumber = phoneNumber.replace(/\D/g, '');
    if (cleanNumber.startsWith('44')) return 'alaw'; // UK
    if (cleanNumber.startsWith('49')) return 'alaw'; // Germany
    if (cleanNumber.startsWith('33')) return 'alaw'; // France
    if (cleanNumber.startsWith('61')) return 'alaw'; // Australia
  }

  // 2. Explicit format check (if not overridden by country)
  if (rawFormat) {
    const normalized = rawFormat.toLowerCase();
    if (normalized.includes('alaw') || normalized.includes('pcma') || normalized.includes('g711a')) {
      return 'alaw';
    }
    if (normalized.includes('ulaw') || normalized.includes('pcmu') || normalized.includes('g711u') || normalized.includes('mulaw')) {
      return 'ulaw';
    }
  }

  // 3. Fallback phone number based heuristic for other regions
  // North America (+1) and Japan (+81) use mu-law (PCMU)
  if (phoneNumber) {
    const cleanNumber = phoneNumber.replace(/\D/g, '');
    if (cleanNumber.startsWith('1')) return 'ulaw'; // US/Canada
    
    // Most international calls outside North America use A-law
    // This is a safe default for non-+1 numbers
    return 'alaw';
  }

  return 'ulaw'; // Default to ulaw
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
// Standard filter: Cutoff at 3.4kHz (0.28)
const FILTER_24K_TO_8K = generateLowPassFilter(21, 0.28); 

// Pre-computed filter for 16kHz → 8kHz (2:1 ratio)
// Input Nyquist = 8kHz, Target Nyquist = 4kHz
// Standard filter: Cutoff at 3.5kHz (0.44)
const FILTER_16K_TO_8K = generateLowPassFilter(15, 0.44);

// A-LAW OPTIMIZATION (Fixed for Anti-aliasing):
// Issue: Previous "gentle" filter (cutoff 0.38 = 4.5kHz) was ABOVE the Nyquist limit (4kHz),
// causing severe aliasing noise. 
// Fix: STRICTLY limit bandwidth to 3.2kHz (standard toll quality) to prevent aliasing.
// Using 13 taps gives a decent compromise between ringing and rollback.
const FILTER_24K_TO_8K_ALAW = generateLowPassFilter(13, 0.26); // Cutoff ~3.1kHz < 4kHz
const FILTER_16K_TO_8K_ALAW = generateLowPassFilter(9, 0.40); // Cutoff ~3.2kHz < 4kHz

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
 * Improved 3:1 decimation using simple point-picking after filtering
 * Since we've already applied a proper anti-aliasing filter,
 * we can just pick every 3rd sample - no need for additional weighted averaging
 * which was causing additional noise/distortion artifacts
 * 
 * This is cleaner because the FIR filter already removed high frequencies
 */
function simpleDecimate3to1(inputBuffer: Buffer): Buffer {
  const inputSamples = inputBuffer.length / 2;
  const outputSamples = Math.floor(inputSamples / 3);
  const outputBuffer = Buffer.alloc(outputSamples * 2);

  // After anti-aliasing filter, simply pick every 3rd sample (at center of each group)
  for (let i = 0; i < outputSamples; i++) {
    const srcIdx = i * 3 + 1; // Center sample of each 3-sample group
    if (srcIdx < inputSamples) {
      const sample = inputBuffer.readInt16LE(srcIdx * 2);
      outputBuffer.writeInt16LE(sample, i * 2);
    }
  }

  return outputBuffer;
}

/**
 * Convert PCM 24kHz (Gemini output) to G.711 (8kHz) for Telnyx
 * This is the main function for Gemini -> Telnyx audio path
 *
 * AUDIO QUALITY IMPROVEMENTS (Feb 2026):
 * 1. Remove DC offset (prevents clicking at chunk boundaries)
 * 2. Normalize audio to prevent clipping
 * 3. Apply proper FIR anti-aliasing filter (not just averaging)
 * 4. Encode to G.711
 * 
 * UK/A-LAW FIX (Feb 2026):
 * - Use gentler FIR filter for A-law to reduce ringing artifacts
 * - A-law quantization makes filter artifacts more audible than µ-law
 * - Skip normalization for A-law (Gemini output is already well-leveled)
 */
export function pcm24kToG711(pcmBuffer: Buffer, format: G711Format): Buffer {
  const isAlaw = format === 'alaw';
  
  // Step 1: Skip DC offset removal for Gemini/AI output
  // AI synthetic audio has 0 DC offset. Calculating chunk-based mean
  // introduces discontinuities (clicking/buzzing) at chunk boundaries.
  // const dcCorrected = removeDcOffset(pcmBuffer); 

  // Step 2: For A-law (UK), skip normalization - it can amplify quantization noise
  // For µ-law (US), normalize to prevent clipping
  const normalized = isAlaw ? pcmBuffer : normalizeAudio(pcmBuffer, 0.92);

  // Step 3: Apply anti-aliasing FIR filter before downsampling
  // Use gentler A-law filter for UK calls to reduce ringing/noise artifacts
  const filtered = applyLowPassFilter(normalized, 0.28, isAlaw);

  // Step 4: Decimate 3:1 (24kHz → 8kHz)
  const pcm8k = simpleDecimate3to1(filtered);

  // Step 5: Encode to G.711
  return pcm8kToG711(pcm8k, format);
}

/**
 * Convert PCM 16kHz to G.711 (8kHz) for Telnyx
 * Alternative if Gemini sends 16kHz output
 *
 * AUDIO QUALITY FIXES:
 * 1. Skip DC offset (cause of buzzing/clicking on digital sources)
 * 2. Normalize only if needed to prevent clipping (skip for A-law)
 * 3. Downsample with anti-aliasing filter (gentler for A-law)
 * 4. Encode to G.711
 */
export function pcm16kToG711(pcmBuffer: Buffer, format: G711Format): Buffer {
  const isAlaw = format === 'alaw';
  
  // Step 1: Skip DC offset for AI audio
  // const dcCorrected = removeDcOffset(pcmBuffer);

  // Step 2: Skip normalization for A-law (UK) to avoid amplifying quantization noise
  const normalizedInput = isAlaw ? pcmBuffer : normalizeAudio(pcmBuffer, 0.9);

  // Step 3: Downsample 16kHz to 8kHz with anti-aliasing (gentler filter for A-law)
  const pcm8k = resamplePcmWithFormat(normalizedInput, 16000, 8000, isAlaw);

  // Step 4: Encode to G.711
  return pcm8kToG711(pcm8k, format);
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
