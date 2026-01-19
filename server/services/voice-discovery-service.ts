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
 * - Fallback to hardcoded list if API unavailable
 */

import { TextToSpeechClient, protos } from '@google-cloud/text-to-speech';
import OpenAI from 'openai';

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

// Mapping from Gemini Live voices to Google TTS voices for previews
const GEMINI_TO_TTS_PREVIEW_MAP: Record<string, { ttsVoice: string; gender: 'male' | 'female' | 'neutral'; description: string }> = {
  'Aoede': { ttsVoice: 'en-US-Studio-O', gender: 'female', description: 'Bright and warm' },
  'Charon': { ttsVoice: 'en-US-Studio-M', gender: 'male', description: 'Deep and authoritative' },
  'Fenrir': { ttsVoice: 'en-US-Studio-Q', gender: 'male', description: 'Calm and measured' },
  'Kore': { ttsVoice: 'en-US-Studio-O', gender: 'female', description: 'Soft and friendly (default)' },
  'Puck': { ttsVoice: 'en-US-Studio-N', gender: 'male', description: 'Light and expressive' },
  'Orion': { ttsVoice: 'en-US-Wavenet-B', gender: 'neutral', description: 'Balanced and clear' },
  'Vega': { ttsVoice: 'en-US-Wavenet-C', gender: 'neutral', description: 'Warm and confident' },
  'Pegasus': { ttsVoice: 'en-US-Wavenet-D', gender: 'neutral', description: 'Calm and professional' },
  'Ursa': { ttsVoice: 'en-US-Wavenet-E', gender: 'neutral', description: 'Strong and steady' },
  'Nova': { ttsVoice: 'en-US-Wavenet-F', gender: 'neutral', description: 'Bright and energetic' },
  'Dipper': { ttsVoice: 'en-US-Wavenet-A', gender: 'neutral', description: 'Clear and articulate' },
  'Capella': { ttsVoice: 'en-US-Wavenet-G', gender: 'neutral', description: 'Melodic and smooth' },
  'Orbit': { ttsVoice: 'en-US-Wavenet-H', gender: 'neutral', description: 'Modern and dynamic' },
  'Lyra': { ttsVoice: 'en-US-Wavenet-I', gender: 'neutral', description: 'Elegant and refined' },
  'Eclipse': { ttsVoice: 'en-US-Wavenet-J', gender: 'neutral', description: 'Bold and distinctive' },
};

// Static OpenAI voices (these don't change frequently)
const OPENAI_VOICES_STATIC: VoiceInfo[] = [
  { id: 'alloy', name: 'alloy', displayName: 'Alloy', gender: 'neutral', language: 'en', provider: 'openai', description: 'Balanced and neutral' },
  { id: 'ash', name: 'ash', displayName: 'Ash', gender: 'male', language: 'en', provider: 'openai', description: 'Clear and professional' },
  { id: 'ballad', name: 'ballad', displayName: 'Ballad', gender: 'male', language: 'en', provider: 'openai', description: 'Warm and storytelling' },
  { id: 'coral', name: 'coral', displayName: 'Coral', gender: 'female', language: 'en', provider: 'openai', description: 'Warm and friendly' },
  { id: 'echo', name: 'echo', displayName: 'Echo', gender: 'male', language: 'en', provider: 'openai', description: 'Deep and resonant' },
  { id: 'fable', name: 'fable', displayName: 'Fable', gender: 'male', language: 'en', provider: 'openai', description: 'Expressive and dynamic' },
  { id: 'onyx', name: 'onyx', displayName: 'Onyx', gender: 'male', language: 'en', provider: 'openai', description: 'Deep and authoritative' },
  { id: 'nova', name: 'nova', displayName: 'Nova', gender: 'female', language: 'en', provider: 'openai', description: 'Bright and energetic' },
  { id: 'sage', name: 'sage', displayName: 'Sage', gender: 'female', language: 'en', provider: 'openai', description: 'Calm and wise' },
  { id: 'shimmer', name: 'shimmer', displayName: 'Shimmer', gender: 'female', language: 'en', provider: 'openai', description: 'Light and expressive' },
  { id: 'verse', name: 'verse', displayName: 'Verse', gender: 'male', language: 'en', provider: 'openai', description: 'Poetic and dynamic' },
  // Newest realtime voices
  { id: 'cedar', name: 'cedar', displayName: 'Cedar', gender: 'male', language: 'en', provider: 'openai', description: 'Warm, confident, engaging (Recommended)' },
  { id: 'marin', name: 'marin', displayName: 'Marin', gender: 'female', language: 'en', provider: 'openai', description: 'Calm, professional, soothing' },
];

// Fallback Gemini voices (used when API is unavailable)
const GEMINI_VOICES_FALLBACK: VoiceInfo[] = Object.entries(GEMINI_TO_TTS_PREVIEW_MAP).map(([name, config]) => ({
  id: name,
  name: name,
  displayName: name,
  gender: config.gender,
  language: 'en',
  provider: 'gemini' as const,
  description: config.description,
  previewVoice: config.ttsVoice,
}));

// ==================== CACHE ====================

let voiceCache: { voices: VoicesByProvider; timestamp: number } | null = null;

// ==================== LAZY CLIENT INITIALIZATION ====================

let ttsClient: TextToSpeechClient | null = null;
let openaiClient: OpenAI | null = null;

function getTTSClient(): TextToSpeechClient {
  if (!ttsClient) {
    ttsClient = new TextToSpeechClient();
  }
  return ttsClient;
}

function getOpenAIClient(): OpenAI {
  if (!openaiClient) {
    const apiKey = process.env.AI_INTEGRATIONS_OPENAI_API_KEY || process.env.OPENAI_API_KEY;
    if (!apiKey) {
      throw new Error('OpenAI API key not configured');
    }
    openaiClient = new OpenAI({ apiKey });
  }
  return openaiClient;
}

// ==================== MAIN FUNCTIONS ====================

/**
 * Get all available voices grouped by provider.
 * Fetches from Google TTS API and caches results.
 */
export async function getAvailableVoices(): Promise<VoicesByProvider> {
  // Check cache
  if (voiceCache && Date.now() - voiceCache.timestamp < CACHE_TTL_MS) {
    console.log(`${LOG_PREFIX} Returning cached voices (${voiceCache.voices.openai.length} OpenAI, ${voiceCache.voices.gemini.length} Gemini)`);
    return voiceCache.voices;
  }

  console.log(`${LOG_PREFIX} Fetching fresh voice list...`);

  try {
    // Fetch Google TTS voices to discover any new ones
    const client = getTTSClient();
    const [response] = await client.listVoices({ languageCode: 'en' });

    // Extract Studio and Wavenet voices that could be used for previews
    const googleVoices = response.voices || [];
    const studioVoices = googleVoices.filter(v =>
      v.name?.includes('Studio') || v.name?.includes('Wavenet')
    );

    console.log(`${LOG_PREFIX} Found ${studioVoices.length} Google TTS voices for preview mapping`);

    // Build Gemini voices list with preview voice mapping
    // We use our predefined Gemini Live voices and map them to TTS preview voices
    const geminiVoices: VoiceInfo[] = Object.entries(GEMINI_TO_TTS_PREVIEW_MAP).map(([name, config]) => ({
      id: name,
      name: name,
      displayName: name,
      gender: config.gender,
      language: 'en',
      provider: 'gemini' as const,
      description: config.description,
      previewVoice: config.ttsVoice,
    }));

    // Cache the results
    voiceCache = {
      voices: {
        openai: OPENAI_VOICES_STATIC,
        gemini: geminiVoices,
      },
      timestamp: Date.now(),
    };

    console.log(`${LOG_PREFIX} Voice list cached: ${OPENAI_VOICES_STATIC.length} OpenAI, ${geminiVoices.length} Gemini`);
    return voiceCache.voices;

  } catch (error) {
    console.error(`${LOG_PREFIX} Error fetching voices from Google TTS:`, error);

    // Return fallback voices
    const fallback: VoicesByProvider = {
      openai: OPENAI_VOICES_STATIC,
      gemini: GEMINI_VOICES_FALLBACK,
    };

    console.log(`${LOG_PREFIX} Using fallback voice list`);
    return fallback;
  }
}

/**
 * Generate a voice preview audio sample.
 * Returns MP3 audio buffer.
 *
 * For Gemini voices: Uses Google Cloud TTS if available, falls back to OpenAI TTS
 * For OpenAI voices: Uses OpenAI TTS directly
 */
export async function generateVoicePreview(
  voiceId: string,
  provider: 'openai' | 'gemini'
): Promise<Buffer> {
  const sampleText = "Hello! I'm your AI assistant. How can I help you today?";

  console.log(`${LOG_PREFIX} Generating preview for ${provider}/${voiceId}`);

  if (provider === 'gemini') {
    // First try Google TTS with the mapped preview voice
    const previewConfig = GEMINI_TO_TTS_PREVIEW_MAP[voiceId];
    if (!previewConfig) {
      throw new Error(`Unknown Gemini voice: ${voiceId}`);
    }

    try {
      const client = getTTSClient();
      const [response] = await client.synthesizeSpeech({
        input: { text: sampleText },
        voice: {
          name: previewConfig.ttsVoice,
          languageCode: 'en-US',
        },
        audioConfig: {
          audioEncoding: protos.google.cloud.texttospeech.v1.AudioEncoding.MP3,
          speakingRate: 1.0,
          pitch: 0,
        },
      });

      if (!response.audioContent) {
        throw new Error('No audio content returned from Google TTS');
      }

      console.log(`${LOG_PREFIX} Generated Gemini preview via Google TTS: ${(response.audioContent as Buffer).length} bytes`);
      return Buffer.from(response.audioContent as Uint8Array);
    } catch (googleTtsError) {
      // Google TTS failed (likely ADC not configured), fall back to OpenAI TTS
      console.warn(`${LOG_PREFIX} Google TTS failed, using OpenAI TTS as fallback:`, googleTtsError instanceof Error ? googleTtsError.message : 'Unknown error');

      try {
        const openai = getOpenAIClient();
        // Map Gemini voice to similar OpenAI voice for preview
        const fallbackVoice = mapGeminiToOpenAIVoice(voiceId);

        const response = await openai.audio.speech.create({
          model: 'tts-1',
          voice: fallbackVoice as any,
          input: `This is a preview of the ${voiceId} voice. ${sampleText}`,
          response_format: 'mp3',
        });

        const arrayBuffer = await response.arrayBuffer();
        const buffer = Buffer.from(arrayBuffer);

        console.log(`${LOG_PREFIX} Generated Gemini preview via OpenAI fallback: ${buffer.length} bytes`);
        return buffer;
      } catch (openaiError) {
        console.error(`${LOG_PREFIX} OpenAI fallback also failed:`, openaiError);
        throw new Error('Voice preview generation failed: Neither Google TTS nor OpenAI TTS available');
      }
    }

  } else {
    // Use OpenAI TTS
    const openai = getOpenAIClient();

    // Map voice ID to OpenAI TTS voice (some realtime voices aren't in TTS)
    const ttsVoice = mapOpenAIRealtimeToTTS(voiceId);

    const response = await openai.audio.speech.create({
      model: 'tts-1',
      voice: ttsVoice as any,
      input: sampleText,
      response_format: 'mp3',
    });

    const arrayBuffer = await response.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    console.log(`${LOG_PREFIX} Generated OpenAI preview: ${buffer.length} bytes`);
    return buffer;
  }
}

/**
 * Map Gemini voice to similar OpenAI voice for preview fallback.
 */
function mapGeminiToOpenAIVoice(geminiVoice: string): string {
  const config = GEMINI_TO_TTS_PREVIEW_MAP[geminiVoice];
  if (!config) return 'alloy'; // Default fallback

  // Map based on gender/characteristics
  const mapping: Record<string, string> = {
    'Aoede': 'nova',     // Bright female -> Nova
    'Charon': 'onyx',    // Deep male -> Onyx
    'Fenrir': 'echo',    // Calm male -> Echo
    'Kore': 'shimmer',   // Soft female -> Shimmer
    'Puck': 'fable',     // Light expressive -> Fable
    'Orion': 'alloy',    // Balanced -> Alloy
    'Vega': 'nova',      // Warm confident -> Nova
    'Pegasus': 'echo',   // Calm professional -> Echo
    'Ursa': 'onyx',      // Strong steady -> Onyx
    'Nova': 'nova',      // Bright energetic -> Nova
    'Dipper': 'alloy',   // Clear articulate -> Alloy
    'Capella': 'shimmer', // Melodic smooth -> Shimmer
    'Orbit': 'fable',    // Modern dynamic -> Fable
    'Lyra': 'shimmer',   // Elegant refined -> Shimmer
    'Eclipse': 'onyx',   // Bold distinctive -> Onyx
  };

  return mapping[geminiVoice] || 'alloy';
}

/**
 * Map OpenAI Realtime voice to TTS voice.
 * Some realtime voices (like cedar, marin) aren't available in TTS API.
 */
function mapOpenAIRealtimeToTTS(voiceId: string): string {
  const mapping: Record<string, string> = {
    'cedar': 'echo',    // Cedar is similar to Echo
    'marin': 'nova',    // Marin is similar to Nova
    'ash': 'onyx',      // Ash is similar to Onyx
    'ballad': 'fable',  // Ballad is similar to Fable
    'verse': 'fable',   // Verse is similar to Fable
    'sage': 'shimmer',  // Sage is similar to Shimmer
    'coral': 'nova',    // Coral is similar to Nova
  };

  return mapping[voiceId] || voiceId;
}

/**
 * Clear the voice cache (useful for testing or forcing refresh)
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

/**
 * Generate TTS audio for any text using the specified voice.
 * Used for simulation playback with Gemini/OpenAI voices.
 * Returns MP3 audio buffer.
 */
export async function generateTTSAudio(
  text: string,
  voiceId: string,
  provider: 'openai' | 'gemini'
): Promise<Buffer> {
  console.log(`${LOG_PREFIX} Generating TTS audio for ${provider}/${voiceId} (${text.length} chars)`);

  if (provider === 'gemini') {
    // Use Google Cloud TTS with the mapped voice
    const previewConfig = GEMINI_TO_TTS_PREVIEW_MAP[voiceId];
    if (!previewConfig) {
      throw new Error(`Unknown Gemini voice: ${voiceId}`);
    }

    try {
      const client = getTTSClient();
      const [response] = await client.synthesizeSpeech({
        input: { text },
        voice: {
          name: previewConfig.ttsVoice,
          languageCode: 'en-US',
        },
        audioConfig: {
          audioEncoding: protos.google.cloud.texttospeech.v1.AudioEncoding.MP3,
          speakingRate: 1.0,
          pitch: 0,
        },
      });

      if (!response.audioContent) {
        throw new Error('No audio content returned from Google TTS');
      }

      console.log(`${LOG_PREFIX} Generated Gemini TTS: ${(response.audioContent as Buffer).length} bytes`);
      return Buffer.from(response.audioContent as Uint8Array);
    } catch (googleTtsError) {
      // Google TTS failed, fall back to OpenAI TTS
      console.warn(`${LOG_PREFIX} Google TTS failed, using OpenAI TTS as fallback:`, googleTtsError instanceof Error ? googleTtsError.message : 'Unknown error');

      try {
        const openai = getOpenAIClient();
        const fallbackVoice = mapGeminiToOpenAIVoice(voiceId);

        const response = await openai.audio.speech.create({
          model: 'tts-1',
          voice: fallbackVoice as any,
          input: text,
          response_format: 'mp3',
        });

        const arrayBuffer = await response.arrayBuffer();
        const buffer = Buffer.from(arrayBuffer);

        console.log(`${LOG_PREFIX} Generated Gemini TTS via OpenAI fallback: ${buffer.length} bytes`);
        return buffer;
      } catch (openaiError) {
        console.error(`${LOG_PREFIX} OpenAI fallback also failed:`, openaiError);
        throw new Error('TTS generation failed: Neither Google TTS nor OpenAI TTS available');
      }
    }
  } else {
    // Use OpenAI TTS
    const openai = getOpenAIClient();
    const ttsVoice = mapOpenAIRealtimeToTTS(voiceId);

    const response = await openai.audio.speech.create({
      model: 'tts-1',
      voice: ttsVoice as any,
      input: text,
      response_format: 'mp3',
    });

    const arrayBuffer = await response.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    console.log(`${LOG_PREFIX} Generated OpenAI TTS: ${buffer.length} bytes`);
    return buffer;
  }
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
  let openAIHealthy = false;

  try {
    const client = getTTSClient();
    await client.listVoices({ languageCode: 'en' });
    googleTTSHealthy = true;
  } catch {
    googleTTSHealthy = false;
  }

  try {
    const apiKey = process.env.AI_INTEGRATIONS_OPENAI_API_KEY || process.env.OPENAI_API_KEY;
    openAIHealthy = !!apiKey;
  } catch {
    openAIHealthy = false;
  }

  const cachedVoiceCount = voiceCache
    ? voiceCache.voices.openai.length + voiceCache.voices.gemini.length
    : 0;

  return {
    healthy: googleTTSHealthy || openAIHealthy,
    googleTTS: googleTTSHealthy,
    openAI: openAIHealthy,
    cachedVoices: cachedVoiceCount,
  };
}
