/**
 * Campaign Preview & Simulation API Routes
 *
 * Provides non-executing preview and simulation capabilities for
 * both email and voice channels.
 */

import { Router, Request, Response } from 'express';
import type { SimulationMode } from '@shared/multi-channel-types';
import {
  startEmailPreview,
  startVoiceSimulation,
  advanceSimulation,
  getSimulationSession,
  endSimulation,
  checkLaunchReadiness,
} from '../services/simulation-preview-service';

const router = Router();

// ============================================================
// EMAIL PREVIEW
// ============================================================

/**
 * POST /api/campaigns/:id/preview/email
 * Generate email preview with resolved templates
 */
router.post('/:id/preview/email', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { accountId, contactId } = req.body || {};

    const preview = await startEmailPreview({
      campaignId: id,
      accountId,
      contactId,
    });

    res.json({
      success: true,
      data: preview,
    });
  } catch (error: any) {
    console.error('Error generating email preview:', error);
    res.status(500).json({ error: error.message || 'Failed to generate email preview' });
  }
});

// ============================================================
// VOICE SIMULATION
// ============================================================

/**
 * POST /api/campaigns/:id/preview/voice/start
 * Start a new voice simulation session
 */
router.post('/:id/preview/voice/start', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { accountId, contactId, mode } = req.body || {};
    const userId = (req as any).user?.id;

    const validModes: SimulationMode[] = ['full', 'step_by_step', 'preview_only'];
    const simulationMode = validModes.includes(mode) ? mode : 'full';

    const session = await startVoiceSimulation({
      campaignId: id,
      accountId,
      contactId,
      mode: simulationMode,
      userId,
    });

    res.json({
      success: true,
      data: session,
    });
  } catch (error: any) {
    console.error('Error starting voice simulation:', error);
    res.status(500).json({ error: error.message || 'Failed to start voice simulation' });
  }
});

/**
 * POST /api/campaigns/:id/preview/voice/:sessionId/respond
 * Send a response to continue the simulation
 */
router.post('/:id/preview/voice/:sessionId/respond', async (req: Request, res: Response) => {
  try {
    const { sessionId } = req.params;
    const { message } = req.body;

    if (!message || typeof message !== 'string') {
      return res.status(400).json({ error: 'message is required' });
    }

    const session = await advanceSimulation(sessionId, message);

    res.json({
      success: true,
      data: session,
    });
  } catch (error: any) {
    console.error('Error advancing simulation:', error);
    res.status(500).json({ error: error.message || 'Failed to advance simulation' });
  }
});

/**
 * GET /api/campaigns/:id/preview/voice/:sessionId
 * Get simulation session state
 */
router.get('/:id/preview/voice/:sessionId', async (req: Request, res: Response) => {
  try {
    const { sessionId } = req.params;

    const session = await getSimulationSession(sessionId);

    if (!session) {
      return res.status(404).json({ error: 'Simulation session not found' });
    }

    res.json({
      success: true,
      data: session,
    });
  } catch (error: any) {
    console.error('Error getting simulation session:', error);
    res.status(500).json({ error: error.message || 'Failed to get simulation session' });
  }
});

/**
 * POST /api/campaigns/:id/preview/voice/:sessionId/end
 * End a simulation session
 */
router.post('/:id/preview/voice/:sessionId/end', async (req: Request, res: Response) => {
  try {
    const { sessionId } = req.params;

    const session = await endSimulation(sessionId);

    res.json({
      success: true,
      data: session,
    });
  } catch (error: any) {
    console.error('Error ending simulation:', error);
    res.status(500).json({ error: error.message || 'Failed to end simulation' });
  }
});

// ============================================================
// LAUNCH READINESS
// ============================================================

/**
 * GET /api/campaigns/:id/preview/launch-readiness
 * Check if campaign is ready to launch
 */
router.get('/:id/preview/launch-readiness', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const readiness = await checkLaunchReadiness(id);

    res.json({
      success: true,
      data: readiness,
    });
  } catch (error: any) {
    console.error('Error checking launch readiness:', error);
    res.status(500).json({ error: error.message || 'Failed to check launch readiness' });
  }
});

export default router;