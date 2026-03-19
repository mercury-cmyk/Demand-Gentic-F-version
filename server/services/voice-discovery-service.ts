/**
 * Voice Discovery Service
 *
 * Provides dynamic voice listing and preview generation for both
 * OpenAI and Google Gemini voice providers.
 *
 * Features:
 * - Fetches available voices from Google Cloud TTS API
 * - Caches voice list with 15-minute TTL
 * - Generates voice preview audio samples
 * - Unified mapping to Google Cloud TTS for high quality
 */

import OpenAI from 'openai';
import { VOICE_MAPPING, getGoogleVoiceConfig } from './voice-constants';
import { synthesizeSpeechRateLimited, getTTSClient } from './tts-rate-limiter';

const LOG_PREFIX = '[VoiceDiscovery]';

// ==================== TYPES ====================

export interface VoiceInfo {
  id: string;
  name: string;
  displayName: string;
  gender: 'male' | 'female' | 'neutral';
  language: string;
  provider: 'openai' | 'gemini';
  description?: string;
  previewVoice?: string; // TTS voice to use for preview
}

export interface VoicesByProvider {
  openai: VoiceInfo[];
  gemini: VoiceInfo[];
}

// ==================== CONSTANTS ====================

const CACHE_TTL_MS = 15 * 60 * 1000; // 15 minutes

// Static OpenAI voices (mapped from centralized config)
const OPENAI_VOICES_STATIC: VoiceInfo[] = Object.entries(VOICE_MAPPING)
  .filter(([id]) => ['alloy', 'ash', 'ballad', 'coral', 'echo', 'fable', 'onyx', 'nova', 'sage', 'shimmer', 'verse', 'marin', 'cedar'].includes(id))
  .map(([id, config]) => ({
    id,
    name: id,
    displayName: config.displayName,
    gender: config.gender,
    language: 'en',
    provider: 'openai',
    description: config.description,
    previewVoice: config.googleVoiceName
  }));

// Gemini Live voices (mapped from centralized config)
const GEMINI_VOICES_FALLBACK: VoiceInfo[] = Object.entries(VOICE_MAPPING)
  .filter(([id]) => ['Puck', 'Charon', 'Kore', 'Fenrir', 'Aoede', 'Leda', 'Orus', 'Zephyr'].includes(id))
  .map(([id, config]) => ({
    id,
    name: id,
    displayName: config.displayName,
    gender: config.gender,
    language: 'en',
    provider: 'gemini',
    description: config.description,
    previewVoice: config.googleVoiceName
  }));

// ==================== CACHE ====================

let voiceCache: { voices: VoicesByProvider; timestamp: number } | null = null;

// ==================== LAZY CLIENT INITIALIZATION ====================
// TTS client is now managed by tts-rate-limiter.ts (singleton)

// ==================== MAIN FUNCTIONS ====================

/**
 * Get all available voices grouped by provider.
 * Uses centralized mapping to ensure consistency.
 */
export async function getAvailableVoices(): Promise<VoicesByProvider> {
  // Check cache
  if (voiceCache && Date.now() - voiceCache.timestamp < CACHE_TTL_MS) {
    console.log(`${LOG_PREFIX} Returning cached voices (${voiceCache.voices.openai.length} OpenAI, ${voiceCache.voices.gemini.length} Gemini)`);
    return voiceCache.voices;
  }

  console.log(`${LOG_PREFIX} Refreshing voice list...`);

  // Use the predefined lists derived from VOICE_MAPPING
  const geminiVoices = GEMINI_VOICES_FALLBACK;
  const openaiVoices = OPENAI_VOICES_STATIC;

  // Cache the results
  voiceCache = {
    voices: {
      openai: openaiVoices,
      gemini: geminiVoices,
    },
    timestamp: Date.now(),
  };

  console.log(`${LOG_PREFIX} Voice list cached: ${openaiVoices.length} OpenAI, ${geminiVoices.length} Gemini`);
  return voiceCache.voices;
}

/**
 * Cleanup voice cache (useful for testing or forcing refresh)
 */
export function clearVoiceCache(): void {
  voiceCache = null;
  console.log(`${LOG_PREFIX} Voice cache cleared`);
}

/**
 * Get a specific voice by ID
 */
export async function getVoiceById(voiceId: string, provider: 'openai' | 'gemini'): Promise<VoiceInfo | null> {
  const voices = await getAvailableVoices();
  const providerVoices = provider === 'openai' ? voices.openai : voices.gemini;
  return providerVoices.find(v => v.id === voiceId) || null;
}

// Map Gemini voice names to OpenAI TTS voices for fallback
const GEMINI_TO_OPENAI_FALLBACK: Record<string, string> = {
  'Puck': 'echo', 'Charon': 'onyx', 'Kore': 'nova', 'Fenrir': 'ash',
  'Aoede': 'shimmer', 'Leda': 'coral', 'Orus': 'sage', 'Zephyr': 'alloy',
  'Vega': 'nova', 'Pegasus': 'ash', 'Solaria': 'shimmer',
};

/**
 * Generate TTS audio using OpenAI's TTS API as fallback.
 */
async function generateOpenAITTSFallback(
  text: string,
  voiceId: string,
  provider: 'openai' | 'gemini'
): Promise<Buffer> {
  const openaiVoices = ['alloy', 'ash', 'ballad', 'coral', 'echo', 'fable', 'onyx', 'nova', 'sage', 'shimmer'];
  let openaiVoice: string;

  if (provider === 'openai' && openaiVoices.includes(voiceId.toLowerCase())) {
    openaiVoice = voiceId.toLowerCase();
  } else {
    openaiVoice = GEMINI_TO_OPENAI_FALLBACK[voiceId] || 'alloy';
  }

  console.log(`${LOG_PREFIX} OpenAI TTS fallback: ${voiceId} -> ${openaiVoice}`);

  const openai = new OpenAI();
  const mp3Response = await openai.audio.speech.create({
    model: 'tts-1',
    voice: openaiVoice as any,
    input: text,
    response_format: 'mp3',
  });

  return Buffer.from(await mp3Response.arrayBuffer());
}

/**
 * Generate TTS audio for any text using the specified voice.
 * Primary: Google Cloud TTS. Fallback: OpenAI TTS.
 * Returns MP3 audio buffer.
 */
export async function generateTTSAudio(
  text: string,
  voiceId: string,
  provider: 'openai' | 'gemini'
): Promise<Buffer> {
  console.log(`${LOG_PREFIX} Generating unified TTS audio for ${provider}/${voiceId} (${text.length} chars)`);

  // Try Google Cloud TTS first
  const voiceConfig = getGoogleVoiceConfig(voiceId);
  const googleVoiceName = voiceConfig.googleVoiceName;
  
  console.log(`${LOG_PREFIX} Voice mapping: ${voiceId} -> ${googleVoiceName} (${voiceConfig.displayName}, ${voiceConfig.gender})`);

  try {
    const buffer = await synthesizeSpeechRateLimited(text, googleVoiceName, 'en-US', 'MP3');
    console.log(`${LOG_PREFIX} Generated TTS audio: ${buffer.length} bytes (Voice: ${googleVoiceName})`);
    return buffer;
  } catch (googleError) {
    console.warn(`${LOG_PREFIX} Google TTS failed for ${voiceId}, trying OpenAI fallback:`, googleError instanceof Error ? googleError.message : googleError);

    try {
      const buffer = await generateOpenAITTSFallback(text, voiceId, provider);
      console.log(`${LOG_PREFIX} OpenAI TTS fallback succeeded: ${buffer.length} bytes`);
      return buffer;
    } catch (openaiError) {
      console.error(`${LOG_PREFIX} Both TTS providers failed for ${voiceId}:`, {
        google: googleError instanceof Error ? googleError.message : googleError,
        openai: openaiError instanceof Error ? openaiError.message : openaiError,
      });
      throw new Error(`Voice preview unavailable: both Google TTS and OpenAI TTS failed. Check API credentials.`);
    }
  }
}

/**
 * Generate a voice preview for valid voices.
 * Uses Google Cloud TTS for all voices (mapped) to ensure high quality and consistency.
 */
export async function generateVoicePreview(
  voiceId: string,
  provider: 'openai' | 'gemini'
): Promise<Buffer> {
  const sampleText = 'Hello, this is a preview of my voice. I can help with sales calls, scheduling, and more.';
  return generateTTSAudio(sampleText, voiceId, provider);
}

/**
 * Check if voice discovery service is healthy
 */
export async function checkVoiceServiceHealth(): Promise<{
  healthy: boolean;
  googleTTS: boolean;
  openAI: boolean;
  cachedVoices: number;
}> {
  let googleTTSHealthy = false;
  
  try {
    // Lightweight check using singleton client from rate limiter
    const client = getTTSClient();
    await client.listVoices({ languageCode: 'en-US' });
    googleTTSHealthy = true;
  } catch (e) {
    console.warn(`${LOG_PREFIX} Google TTS health check failed:`, e);
    googleTTSHealthy = false;
  }

  // We are relying on Google TTS now
  const openAIHealthy = false;

  const cachedVoiceCount = voiceCache
    ? voiceCache.voices.openai.length + voiceCache.voices.gemini.length
    : 0;

  return {
    healthy: googleTTSHealthy,
    googleTTS: googleTTSHealthy,
    openAI: openAIHealthy,
    cachedVoices: cachedVoiceCount,
  };
}
