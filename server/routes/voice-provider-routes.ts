/**
 * Voice Provider Routes
 *
 * API endpoints for voice provider management:
 * - GET /voices - List all available voices (OpenAI + Gemini)
 * - POST /preview - Generate voice preview audio
 * - GET /health - Voice service health check
 */

import { Router, Request, Response } from 'express';
import { z } from 'zod';
import {
  getAvailableVoices,
  generateVoicePreview,
  checkVoiceServiceHealth,
  clearVoiceCache,
} from '../services/voice-discovery-service';
import {
  GEMINI_VOICES,
  GEMINI_VOICE_DETAILS,
  getRecommendedVoice,
} from '../services/voice-providers/gemini-types';
import { requireAuth } from '../auth';

const router = Router();
const LOG_PREFIX = '[VoiceProviderRoutes]';

// ==================== VALIDATION SCHEMAS ====================

const previewRequestSchema = z.object({
  voiceId: z.string().min(1, 'Voice ID is required'),
  provider: z.enum(['openai', 'gemini'], {
    errorMap: () => ({ message: 'Provider must be "openai" or "gemini"' }),
  }),
});

// ==================== ROUTES ====================

/**
 * GET /api/voice-providers/voices
 *
 * Returns all available voices grouped by provider.
 * Response is cached on the server (15 min) and client (15 min).
 */
router.get('/voices', requireAuth, async (req: Request, res: Response) => {
  try {
    console.log(`${LOG_PREFIX} GET /voices requested`);

    const voices = await getAvailableVoices();

    // Set cache headers for client-side caching
    res.set('Cache-Control', 'public, max-age=900'); // 15 minutes

    res.json(voices);
  } catch (error) {
    console.error(`${LOG_PREFIX} Error fetching voices:`, error);
    res.status(500).json({
      error: 'Failed to fetch available voices',
      details: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * POST /api/voice-providers/preview
 *
 * Generates a voice preview audio sample.
 * Returns MP3 audio data.
 *
 * Body:
 * - voiceId: string - The voice identifier
 * - provider: 'openai' | 'gemini' - The voice provider
 */
router.post('/preview', requireAuth, async (req: Request, res: Response) => {
  try {
    // Validate request body
    const parseResult = previewRequestSchema.safeParse(req.body);
    if (!parseResult.success) {
      return res.status(400).json({
        error: 'Invalid request',
        details: parseResult.error.errors,
      });
    }

    const { voiceId, provider } = parseResult.data;
    console.log(`${LOG_PREFIX} POST /preview requested for ${provider}/${voiceId}`);

    const audioBuffer = await generateVoicePreview(voiceId, provider);

    // Set appropriate headers for audio response
    res.set('Content-Type', 'audio/mpeg');
    res.set('Content-Length', audioBuffer.length.toString());
    res.set('Content-Disposition', `inline; filename="preview-${provider}-${voiceId}.mp3"`);

    // Cache preview audio for 1 hour (it doesn't change)
    res.set('Cache-Control', 'public, max-age=3600');

    res.send(audioBuffer);
  } catch (error) {
    console.error(`${LOG_PREFIX} Error generating voice preview:`, error);
    res.status(500).json({
      error: 'Failed to generate voice preview',
      details: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * GET /api/voice-providers/health
 *
 * Returns health status of voice services.
 */
router.get('/health', requireAuth, async (req: Request, res: Response) => {
  try {
    const health = await checkVoiceServiceHealth();

    const status = health.healthy ? 200 : 503;
    res.status(status).json({
      status: health.healthy ? 'healthy' : 'degraded',
      providers: {
        openai: {
          status: health.openAI ? 'online' : 'offline',
        },
        gemini: {
          status: health.googleTTS ? 'online' : 'offline',
        },
      },
      cache: {
        voiceCount: health.cachedVoices,
        isCached: health.cachedVoices > 0,
      },
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error(`${LOG_PREFIX} Error checking health:`, error);
    res.status(500).json({
      status: 'error',
      error: error instanceof Error ? error.message : 'Unknown error',
      timestamp: new Date().toISOString(),
    });
  }
});

/**
 * POST /api/voice-providers/refresh
 *
 * Clears the voice cache and fetches fresh data.
 * Useful for forcing a refresh after deploying new voices.
 */
router.post('/refresh', requireAuth, async (req: Request, res: Response) => {
  try {
    console.log(`${LOG_PREFIX} POST /refresh requested - clearing cache`);

    clearVoiceCache();
    const voices = await getAvailableVoices();

    res.json({
      message: 'Voice cache refreshed successfully',
      voiceCount: {
        openai: voices.openai.length,
        gemini: voices.gemini.length,
      },
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error(`${LOG_PREFIX} Error refreshing voices:`, error);
    res.status(500).json({
      error: 'Failed to refresh voice cache',
      details: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * GET /api/voice-providers/gemini/voices
 *
 * Returns all Gemini voices with detailed metadata.
 * Includes voice descriptions, gender, style, and best use cases.
 */
router.get('/gemini/voices', requireAuth, async (req: Request, res: Response) => {
  try {
    console.log(`${LOG_PREFIX} GET /gemini/voices requested`);

    // Build detailed voice list with metadata
    const voiceList = Object.values(GEMINI_VOICES).map(voice => ({
      id: voice,
      ...GEMINI_VOICE_DETAILS[voice],
    }));

    // Get the default provider to indicate if Gemini is the default
    const defaultProvider = process.env.VOICE_PROVIDER?.toLowerCase() || 'google';
    const isGeminiDefault = !defaultProvider.includes('openai');

    res.set('Cache-Control', 'public, max-age=3600'); // 1 hour
    res.json({
      provider: 'gemini',
      isDefault: isGeminiDefault,
      model: process.env.GEMINI_LIVE_MODEL || 'gemini-live-2.5-flash-native-audio',  // Gemini 2.5 Flash Native Audio
      voices: voiceList,
      defaultVoice: 'Kore',
      recommendedForSales: 'Vega',
      recommendedForB2B: 'Pegasus',
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error(`${LOG_PREFIX} Error fetching Gemini voices:`, error);
    res.status(500).json({
      error: 'Failed to fetch Gemini voices',
      details: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * GET /api/voice-providers/gemini/recommend
 *
 * Get voice recommendation based on use case.
 * Query params:
 * - useCase: 'sales' | 'b2b' | 'support' | 'executive' | 'technical' | 'outreach'
 */
router.get('/gemini/recommend', requireAuth, async (req: Request, res: Response) => {
  try {
    const useCase = (req.query.useCase as string) || 'default';
    console.log(`${LOG_PREFIX} GET /gemini/recommend for useCase: ${useCase}`);

    const recommendedVoice = getRecommendedVoice(useCase);
    const voiceDetails = GEMINI_VOICE_DETAILS[recommendedVoice];

    res.json({
      useCase,
      recommendedVoice: {
        id: recommendedVoice,
        ...voiceDetails,
      },
      alternatives: Object.values(GEMINI_VOICES)
        .filter(v => v !== recommendedVoice)
        .slice(0, 3)
        .map(voice => ({
          id: voice,
          ...GEMINI_VOICE_DETAILS[voice],
        })),
    });
  } catch (error) {
    console.error(`${LOG_PREFIX} Error getting voice recommendation:`, error);
    res.status(500).json({
      error: 'Failed to get voice recommendation',
      details: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * GET /api/voice-providers/default
 *
 * Returns the current default voice provider and configuration.
 */
router.get('/default', requireAuth, async (req: Request, res: Response) => {
  try {
    const defaultProvider = process.env.VOICE_PROVIDER?.toLowerCase() || 'google';
    const isGeminiDefault = !defaultProvider.includes('openai');

    res.json({
      provider: isGeminiDefault ? 'google' : 'openai',
      providerName: isGeminiDefault ? 'Gemini Live' : 'OpenAI Realtime',
      model: isGeminiDefault
        ? (process.env.GEMINI_LIVE_MODEL || 'gemini-live-2.5-flash-native-audio')
        : 'gpt-4o-realtime-preview-2024-12-17',
      defaultVoice: isGeminiDefault ? 'Kore' : 'marin',
      costInfo: isGeminiDefault
        ? 'Gemini Live uses Google Cloud pricing - typically 50-70% lower than OpenAI Realtime'
        : 'OpenAI Realtime uses per-minute pricing',
      features: isGeminiDefault
        ? ['Native audio output', 'Natural prosody', '15+ voice options', 'Low latency', 'Function calling']
        : ['Real-time conversation', 'Voice activity detection', 'Function calling'],
    });
  } catch (error) {
    console.error(`${LOG_PREFIX} Error getting default provider:`, error);
    res.status(500).json({
      error: 'Failed to get default provider',
      details: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

// ==================== TTS SCHEMA ====================

const ttsRequestSchema = z.object({
  text: z.string().min(1, 'Text is required'),
  voiceId: z.string().min(1, 'Voice ID is required'),
  provider: z.enum(['openai', 'gemini'], {
    errorMap: () => ({ message: 'Provider must be "openai" or "gemini"' }),
  }),
});

/**
 * POST /api/voice-providers/tts
 *
 * Generates text-to-speech audio for simulation playback.
 * Uses Google Cloud TTS for Gemini voices, OpenAI TTS for OpenAI voices.
 * Returns MP3 audio data.
 *
 * Body:
 * - text: string - The text to synthesize
 * - voiceId: string - The voice identifier (e.g., 'Kore', 'alloy')
 * - provider: 'openai' | 'gemini' - The voice provider
 */
router.post('/tts', requireAuth, async (req: Request, res: Response) => {
  try {
    // Validate request body
    const parseResult = ttsRequestSchema.safeParse(req.body);
    if (!parseResult.success) {
      return res.status(400).json({
        error: 'Invalid request',
        details: parseResult.error.errors,
      });
    }

    const { text, voiceId, provider } = parseResult.data;
    console.log(`${LOG_PREFIX} POST /tts requested for ${provider}/${voiceId} (${text.length} chars)`);

    // Import the synthesize function from voice-discovery-service
    const { generateTTSAudio } = await import('../services/voice-discovery-service');
    
    const audioBuffer = await generateTTSAudio(text, voiceId, provider);

    // Set appropriate headers for audio response
    res.set('Content-Type', 'audio/mpeg');
    res.set('Content-Length', audioBuffer.length.toString());
    res.set('Content-Disposition', 'inline; filename="tts-audio.mp3"');

    // Short cache for TTS (same text + voice should be cached)
    res.set('Cache-Control', 'private, max-age=60');

    res.send(audioBuffer);
  } catch (error) {
    console.error(`${LOG_PREFIX} Error generating TTS audio:`, error);
    res.status(500).json({
      error: 'Failed to generate TTS audio',
      details: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

export default router;
