/**
 * Audio Transcoder for Voice Providers
 *
 * Handles conversion between different audio formats:
 * - G.711 ulaw/alaw (8kHz, 8-bit) - Used by Telnyx
 * - PCM (16kHz, 16-bit LE) - Used by Gemini Live API input
 * - PCM (24kHz, 16-bit LE) - Used by Gemini Live API output
 *
 * Reference:
 * - G.711 ulaw: ITU-T G.711 (PCMU)
 * - G.711 alaw: ITU-T G.711 (PCMA)
 */

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
 * Low-pass FIR filter coefficients for anti-aliasing before downsampling.
 * This is a 31-tap windowed sinc filter with cutoff at ~3.5kHz (for 8kHz target).
 * Generated using a Hamming window.
 */
const ANTI_ALIAS_FILTER_COEFFS = [
  0.0008, 0.0018, 0.0035, 0.0058, 0.0088,
  0.0124, 0.0166, 0.0212, 0.0261, 0.0311,
  0.0361, 0.0407, 0.0448, 0.0482, 0.0507,
  0.0521, // Center tap (highest weight)
  0.0507, 0.0482, 0.0448, 0.0407, 0.0361,
  0.0311, 0.0261, 0.0212, 0.0166, 0.0124,
  0.0088, 0.0058, 0.0035, 0.0018, 0.0008
];

/**
 * Apply low-pass FIR filter for anti-aliasing before downsampling.
 * Prevents aliasing artifacts (the irritating noise) by removing
 * frequencies above the Nyquist frequency of the target sample rate.
 */
function applyLowPassFilter(inputBuffer: Buffer, cutoffRatio: number): Buffer {
  const inputSamples = inputBuffer.length / 2;
  const outputBuffer = Buffer.alloc(inputBuffer.length);
  const filterLen = ANTI_ALIAS_FILTER_COEFFS.length;
  const halfLen = Math.floor(filterLen / 2);

  // Scale filter coefficients based on cutoff ratio (for different downsample ratios)
  // Lower cutoff ratio = more aggressive filtering needed
  const scaledCoeffs = ANTI_ALIAS_FILTER_COEFFS.map(c => c * Math.min(1, cutoffRatio * 2));

  for (let i = 0; i < inputSamples; i++) {
    let sum = 0;

    for (let j = 0; j < filterLen; j++) {
      const srcIdx = i - halfLen + j;
      let sample = 0;

      if (srcIdx >= 0 && srcIdx < inputSamples) {
        sample = inputBuffer.readInt16LE(srcIdx * 2);
      }

      sum += sample * scaledCoeffs[j];
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
 * Convert G.711 (8kHz) to PCM 16kHz for Gemini Live API input
 * This is the main function for Telnyx -> Gemini audio path
 */
export function g711ToPcm16k(g711Buffer: Buffer, format: G711Format): Buffer {
  // First convert G.711 to PCM 8kHz
  const pcm8k = g711ToPcm8k(g711Buffer, format);
  // Then upsample to 16kHz
  return resamplePcm(pcm8k, 8000, 16000);
}

/**
 * Convert PCM 24kHz (Gemini output) to G.711 (8kHz) for Telnyx
 * This is the main function for Gemini -> Telnyx audio path
 */
export function pcm24kToG711(pcmBuffer: Buffer, format: G711Format): Buffer {
  // First downsample 24kHz to 8kHz
  const pcm8k = resamplePcm(pcmBuffer, 24000, 8000);
  // Then encode to G.711
  return pcm8kToG711(pcm8k, format);
}

/**
 * Convert PCM 16kHz to G.711 (8kHz) for Telnyx
 * Alternative if Gemini sends 16kHz output
 */
export function pcm16kToG711(pcmBuffer: Buffer, format: G711Format): Buffer {
  // First downsample 16kHz to 8kHz
  const pcm8k = resamplePcm(pcmBuffer, 16000, 8000);
  // Then encode to G.711
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
