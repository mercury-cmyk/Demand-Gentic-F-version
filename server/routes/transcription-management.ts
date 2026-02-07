/**
 * Transcription Management API Routes
 *
 * Endpoints for managing and monitoring call transcriptions:
 * - Check transcription status for calls
 * - Manually trigger fallback transcription
 * - Get transcription statistics
 * - Verify transcript quality
 */

import { Router, Request, Response } from 'express';
import { requireAuth, requireRole } from '../auth';
import { db } from '../db';
import { dialerCallAttempts, callSessions, campaigns } from '@shared/schema';
import { eq, and, isNull, isNotNull, desc, sql } from 'drizzle-orm';
import {
  checkTranscriptStatus,
  attemptFallbackTranscription,
  verifyTranscriptQuality,
  getTranscriptionStats,
  ensureTranscript,
  processMissingTranscripts,
} from '../services/transcription-reliability';

const router = Router();

/**
 * GET /api/transcription/status/:callAttemptId
 * Check transcription status for a specific call
 */
router.get('/status/:callAttemptId', requireAuth, async (req: Request, res: Response) => {
  try {
    const { callAttemptId } = req.params;

    const status = await checkTranscriptStatus(callAttemptId);

    // Also get the actual transcript if available
    const [attempt] = await db
      .select({
        fullTranscript: dialerCallAttempts.fullTranscript,
        aiTranscript: dialerCallAttempts.aiTranscript,
        recordingUrl: dialerCallAttempts.recordingUrl,
        startedAt: dialerCallAttempts.startedAt,
        endedAt: dialerCallAttempts.endedAt,
        disposition: dialerCallAttempts.disposition,
      })
      .from(dialerCallAttempts)
      .where(eq(dialerCallAttempts.id, callAttemptId))
      .limit(1);

    if (!attempt) {
      return res.status(404).json({
        success: false,
        message: 'Call attempt not found',
      });
    }

    res.json({
      success: true,
      callAttemptId,
      status,
      transcript: {
        full: attempt.fullTranscript?.substring(0, 500) + (attempt.fullTranscript && attempt.fullTranscript.length > 500 ? '...' : ''),
        aiOnly: attempt.aiTranscript?.substring(0, 200) + (attempt.aiTranscript && attempt.aiTranscript.length > 200 ? '...' : ''),
        fullLength: attempt.fullTranscript?.length || 0,
        aiLength: attempt.aiTranscript?.length || 0,
      },
      hasRecording: !!attempt.recordingUrl,
      callDuration: attempt.startedAt && attempt.endedAt
        ? Math.round((new Date(attempt.endedAt).getTime() - new Date(attempt.startedAt).getTime()) / 1000)
        : null,
      disposition: attempt.disposition,
    });
  } catch (error: any) {
    console.error('[Transcription API] Error checking status:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to check transcription status',
    });
  }
});

/**
 * POST /api/transcription/retry/:callAttemptId
 * Manually trigger fallback transcription for a call
 */
router.post('/retry/:callAttemptId', requireAuth, requireRole(['admin']), async (req: Request, res: Response) => {
  try {
    const { callAttemptId } = req.params;

    // Get the call attempt with recording URL
    const [attempt] = await db
      .select({
        recordingUrl: dialerCallAttempts.recordingUrl,
        fullTranscript: dialerCallAttempts.fullTranscript,
      })
      .from(dialerCallAttempts)
      .where(eq(dialerCallAttempts.id, callAttemptId))
      .limit(1);

    if (!attempt) {
      return res.status(404).json({
        success: false,
        message: 'Call attempt not found',
      });
    }

    if (!attempt.recordingUrl) {
      return res.status(400).json({
        success: false,
        message: 'No recording URL available for this call',
      });
    }

    // Check if already has transcript
    if (attempt.fullTranscript && attempt.fullTranscript.length > 50) {
      return res.status(400).json({
        success: false,
        message: 'Call already has a transcript',
        existingTranscriptLength: attempt.fullTranscript.length,
      });
    }

    // Attempt fallback transcription
    const result = await attemptFallbackTranscription(callAttemptId, attempt.recordingUrl);

    res.json({
      success: result.success,
      message: result.success ? 'Transcription completed successfully' : 'Transcription failed',
      result: {
        source: result.source,
        wordCount: result.wordCount,
        error: result.error,
      },
    });
  } catch (error: any) {
    console.error('[Transcription API] Error retrying transcription:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to retry transcription',
    });
  }
});

/**
 * POST /api/transcription/verify/:callAttemptId
 * Verify transcript quality for a call
 */
router.post('/verify/:callAttemptId', requireAuth, async (req: Request, res: Response) => {
  try {
    const { callAttemptId } = req.params;

    const verification = await verifyTranscriptQuality(callAttemptId);

    res.json({
      success: true,
      callAttemptId,
      verification,
    });
  } catch (error: any) {
    console.error('[Transcription API] Error verifying transcript:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to verify transcript',
    });
  }
});

/**
 * GET /api/transcription/stats/:campaignId
 * Get transcription statistics for a campaign
 */
router.get('/stats/:campaignId', requireAuth, async (req: Request, res: Response) => {
  try {
    const { campaignId } = req.params;

    // Verify campaign exists
    const [campaign] = await db
      .select({ id: campaigns.id, name: campaigns.name })
      .from(campaigns)
      .where(eq(campaigns.id, campaignId))
      .limit(1);

    if (!campaign) {
      return res.status(404).json({
        success: false,
        message: 'Campaign not found',
      });
    }

    const stats = await getTranscriptionStats(campaignId);

    res.json({
      success: true,
      campaignId,
      campaignName: campaign.name,
      stats,
    });
  } catch (error: any) {
    console.error('[Transcription API] Error getting stats:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to get transcription stats',
    });
  }
});

/**
 * POST /api/transcription/process-missing
 * Manually trigger processing of all missing transcripts
 */
router.post('/process-missing', requireAuth, requireRole(['admin']), async (req: Request, res: Response) => {
  try {
    console.log('[Transcription API] Manual trigger: Processing missing transcripts');

    const result = await processMissingTranscripts();

    res.json({
      success: true,
      message: 'Missing transcript processing completed',
      result,
    });
  } catch (error: any) {
    console.error('[Transcription API] Error processing missing transcripts:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to process missing transcripts',
    });
  }
});

/**
 * GET /api/transcription/calls-without-transcripts
 * List recent calls that are missing transcripts
 */
router.get('/calls-without-transcripts', requireAuth, requireRole(['admin']), async (req: Request, res: Response) => {
  try {
    const limit = Math.min(parseInt(req.query.limit as string) || 50, 100);

    const callsWithoutTranscripts = await db
      .select({
        id: dialerCallAttempts.id,
        campaignId: dialerCallAttempts.campaignId,
        contactId: dialerCallAttempts.contactId,
        phoneDialed: dialerCallAttempts.phoneDialed,
        recordingUrl: dialerCallAttempts.recordingUrl,
        startedAt: dialerCallAttempts.startedAt,
        endedAt: dialerCallAttempts.endedAt,
        disposition: dialerCallAttempts.disposition,
      })
      .from(dialerCallAttempts)
      .where(
        and(
          isNull(dialerCallAttempts.fullTranscript),
          isNull(dialerCallAttempts.aiTranscript),
          isNotNull(dialerCallAttempts.endedAt)
        )
      )
      .orderBy(desc(dialerCallAttempts.endedAt))
      .limit(limit);

    // Calculate duration for each call
    const callsWithDuration = callsWithoutTranscripts.map(call => ({
      ...call,
      durationSec: call.startedAt && call.endedAt
        ? Math.round((new Date(call.endedAt).getTime() - new Date(call.startedAt).getTime()) / 1000)
        : null,
      hasRecording: !!call.recordingUrl,
    }));

    res.json({
      success: true,
      count: callsWithDuration.length,
      calls: callsWithDuration,
    });
  } catch (error: any) {
    console.error('[Transcription API] Error listing calls without transcripts:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to list calls',
    });
  }
});

/**
 * GET /api/transcription/full/:callAttemptId
 * Get the full transcript for a call
 */
router.get('/full/:callAttemptId', requireAuth, async (req: Request, res: Response) => {
  try {
    const { callAttemptId } = req.params;

    const [attempt] = await db
      .select({
        fullTranscript: dialerCallAttempts.fullTranscript,
        aiTranscript: dialerCallAttempts.aiTranscript,
        startedAt: dialerCallAttempts.startedAt,
        endedAt: dialerCallAttempts.endedAt,
        disposition: dialerCallAttempts.disposition,
        campaignId: dialerCallAttempts.campaignId,
        contactId: dialerCallAttempts.contactId,
      })
      .from(dialerCallAttempts)
      .where(eq(dialerCallAttempts.id, callAttemptId))
      .limit(1);

    if (!attempt) {
      return res.status(404).json({
        success: false,
        message: 'Call attempt not found',
      });
    }

    const transcript = attempt.fullTranscript || attempt.aiTranscript;

    res.json({
      success: true,
      callAttemptId,
      transcript,
      transcriptLength: transcript?.length || 0,
      wordCount: transcript ? transcript.split(/\s+/).length : 0,
      hasFullTranscript: !!attempt.fullTranscript,
      hasAiTranscript: !!attempt.aiTranscript,
      callDuration: attempt.startedAt && attempt.endedAt
        ? Math.round((new Date(attempt.endedAt).getTime() - new Date(attempt.startedAt).getTime()) / 1000)
        : null,
      disposition: attempt.disposition,
      campaignId: attempt.campaignId,
      contactId: attempt.contactId,
    });
  } catch (error: any) {
    console.error('[Transcription API] Error getting full transcript:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to get transcript',
    });
  }
});

export default router;
