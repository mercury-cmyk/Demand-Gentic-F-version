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

export default router;
