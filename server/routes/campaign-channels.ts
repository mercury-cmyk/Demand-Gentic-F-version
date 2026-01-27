/**
 * Campaign Channels API Routes
 *
 * Manages multi-channel campaign configurations including:
 * - Enabling/disabling channels
 * - Generating channel variants
 * - Approving variants for execution
 */

import { Router, Request, Response } from 'express';
import { db } from '../db';
import { campaigns, campaignChannelVariants } from '@shared/schema';
import { eq, and } from 'drizzle-orm';
import type { ChannelType } from '@shared/multi-channel-types';
import {
  generateChannelVariant,
  getChannelVariant,
  updateChannelVariant,
  approveChannelVariant,
  deleteChannelVariant,
} from '../services/channel-variant-generator';
import { assembleExecutionPrompt } from '../services/execution-prompt-assembler';

const router = Router();

// ============================================================
// CHANNEL MANAGEMENT
// ============================================================

/**
 * GET /api/campaigns/:id/channels
 * Get all channel configurations for a campaign
 */
router.get('/:id/channels', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    // Get campaign
    const [campaign] = await db
      .select()
      .from(campaigns)
      .where(eq(campaigns.id, id))
      .limit(1);

    if (!campaign) {
      return res.status(404).json({ error: 'Campaign not found' });
    }

    // Get variants
    const variants = await db
      .select()
      .from(campaignChannelVariants)
      .where(eq(campaignChannelVariants.campaignId, id));

    const enabledChannels = (campaign.enabledChannels as string[]) || ['voice'];
    const channelStatus = (campaign.channelGenerationStatus as Record<string, string>) || {};

    res.json({
      success: true,
      data: {
        enabledChannels,
        channelStatus,
        variants,
      },
    });
  } catch (error: any) {
    console.error('Error getting campaign channels:', error);
    res.status(500).json({ error: error.message || 'Failed to get campaign channels' });
  }
});

/**
 * POST /api/campaigns/:id/channels
 * Enable channels for a campaign
 */
router.post('/:id/channels', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { channels } = req.body as { channels: ChannelType[] };

    if (!channels || !Array.isArray(channels)) {
      return res.status(400).json({ error: 'channels array is required' });
    }

    // Validate channels
    const validChannels = channels.filter(c => c === 'email' || c === 'voice');
    if (validChannels.length === 0) {
      return res.status(400).json({ error: 'At least one valid channel (email, voice) is required' });
    }

    // Get campaign
    const [campaign] = await db
      .select()
      .from(campaigns)
      .where(eq(campaigns.id, id))
      .limit(1);

    if (!campaign) {
      return res.status(404).json({ error: 'Campaign not found' });
    }

    // Update campaign enabled channels
    const currentStatus = (campaign.channelGenerationStatus as Record<string, string>) || {};

    // Initialize status for new channels
    for (const channel of validChannels) {
      if (!currentStatus[channel]) {
        currentStatus[channel] = 'pending';
      }
    }

    const [updated] = await db
      .update(campaigns)
      .set({
        enabledChannels: validChannels,
        channelGenerationStatus: currentStatus,
        updatedAt: new Date(),
      })
      .where(eq(campaigns.id, id))
      .returning();

    res.json({
      success: true,
      data: {
        enabledChannels: updated.enabledChannels,
        channelStatus: updated.channelGenerationStatus,
      },
    });
  } catch (error: any) {
    console.error('Error enabling campaign channels:', error);
    res.status(500).json({ error: error.message || 'Failed to enable channels' });
  }
});

// ============================================================
// CHANNEL VARIANT MANAGEMENT
// ============================================================

/**
 * POST /api/campaigns/:id/channels/:channel/generate
 * Generate channel variant from shared context
 */
router.post('/:id/channels/:channel/generate', async (req: Request, res: Response) => {
  try {
    const { id, channel } = req.params;
    const { regenerate, preserveOverrides } = req.body || {};
    const userId = (req as any).user?.id;

    // Validate channel type
    if (channel !== 'email' && channel !== 'voice') {
      return res.status(400).json({ error: 'Invalid channel type. Must be "email" or "voice"' });
    }

    const result = await generateChannelVariant({
      campaignId: id,
      channelType: channel as ChannelType,
      regenerate: regenerate === true,
      preserveOverrides: preserveOverrides === true,
      userId,
    });

    res.json({
      success: true,
      data: result,
    });
  } catch (error: any) {
    console.error('Error generating channel variant:', error);
    res.status(500).json({ error: error.message || 'Failed to generate channel variant' });
  }
});

/**
 * GET /api/campaigns/:id/channels/:channel/variant
 * Get channel variant details
 */
router.get('/:id/channels/:channel/variant', async (req: Request, res: Response) => {
  try {
    const { id, channel } = req.params;

    if (channel !== 'email' && channel !== 'voice') {
      return res.status(400).json({ error: 'Invalid channel type' });
    }

    const variant = await getChannelVariant(id, channel as ChannelType);

    if (!variant) {
      return res.status(404).json({ error: 'Channel variant not found' });
    }

    res.json({
      success: true,
      data: variant,
    });
  } catch (error: any) {
    console.error('Error getting channel variant:', error);
    res.status(500).json({ error: error.message || 'Failed to get channel variant' });
  }
});

/**
 * PATCH /api/campaigns/:id/channels/:channel/variant
 * Update channel variant (flow override, settings)
 */
router.patch('/:id/channels/:channel/variant', async (req: Request, res: Response) => {
  try {
    const { id, channel } = req.params;
    const { flowOverride, channelSettings, status } = req.body;

    if (channel !== 'email' && channel !== 'voice') {
      return res.status(400).json({ error: 'Invalid channel type' });
    }

    const updates: any = {};
    if (flowOverride !== undefined) updates.flowOverride = flowOverride;
    if (channelSettings !== undefined) updates.channelSettings = channelSettings;
    if (status !== undefined) updates.status = status;

    const variant = await updateChannelVariant(id, channel as ChannelType, updates);

    if (!variant) {
      return res.status(404).json({ error: 'Channel variant not found' });
    }

    res.json({
      success: true,
      data: variant,
    });
  } catch (error: any) {
    console.error('Error updating channel variant:', error);
    res.status(500).json({ error: error.message || 'Failed to update channel variant' });
  }
});

/**
 * POST /api/campaigns/:id/channels/:channel/approve
 * Approve channel variant for execution
 */
router.post('/:id/channels/:channel/approve', async (req: Request, res: Response) => {
  try {
    const { id, channel } = req.params;
    const userId = (req as any).user?.id;

    if (channel !== 'email' && channel !== 'voice') {
      return res.status(400).json({ error: 'Invalid channel type' });
    }

    if (!userId) {
      return res.status(401).json({ error: 'User ID required for approval' });
    }

    const variant = await approveChannelVariant(id, channel as ChannelType, userId);

    if (!variant) {
      return res.status(404).json({ error: 'Channel variant not found' });
    }

    res.json({
      success: true,
      data: variant,
    });
  } catch (error: any) {
    console.error('Error approving channel variant:', error);
    res.status(500).json({ error: error.message || 'Failed to approve channel variant' });
  }
});

/**
 * DELETE /api/campaigns/:id/channels/:channel
 * Disable/remove a channel
 */
router.delete('/:id/channels/:channel', async (req: Request, res: Response) => {
  try {
    const { id, channel } = req.params;

    if (channel !== 'email' && channel !== 'voice') {
      return res.status(400).json({ error: 'Invalid channel type' });
    }

    await deleteChannelVariant(id, channel as ChannelType);

    res.json({
      success: true,
      message: `${channel} channel disabled`,
    });
  } catch (error: any) {
    console.error('Error disabling channel:', error);
    res.status(500).json({ error: error.message || 'Failed to disable channel' });
  }
});

// ============================================================
// EXECUTION PROMPT
// ============================================================

/**
 * GET /api/campaigns/:id/execution-prompt
 * Get assembled execution prompt for a channel
 */
router.get('/:id/execution-prompt', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { channelType, accountId, contactId } = req.query;

    if (!channelType || (channelType !== 'email' && channelType !== 'voice')) {
      return res.status(400).json({ error: 'channelType query parameter required (email or voice)' });
    }

    const prompt = await assembleExecutionPrompt({
      campaignId: id,
      channelType: channelType as ChannelType,
      accountId: accountId as string | undefined,
      contactId: contactId as string | undefined,
    });

    res.json({
      success: true,
      data: prompt,
    });
  } catch (error: any) {
    console.error('Error getting execution prompt:', error);
    res.status(500).json({ error: error.message || 'Failed to get execution prompt' });
  }
});

/**
 * POST /api/campaigns/:id/execution-prompt/regenerate
 * Force regenerate execution prompt
 */
router.post('/:id/execution-prompt/regenerate', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { channelType, accountId, contactId } = req.body;

    if (!channelType || (channelType !== 'email' && channelType !== 'voice')) {
      return res.status(400).json({ error: 'channelType required (email or voice)' });
    }

    const prompt = await assembleExecutionPrompt({
      campaignId: id,
      channelType: channelType as ChannelType,
      accountId,
      contactId,
      forceRegenerate: true,
    });

    res.json({
      success: true,
      data: prompt,
    });
  } catch (error: any) {
    console.error('Error regenerating execution prompt:', error);
    res.status(500).json({ error: error.message || 'Failed to regenerate execution prompt' });
  }
});

export default router;
