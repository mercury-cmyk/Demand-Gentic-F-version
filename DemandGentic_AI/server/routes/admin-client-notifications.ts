/**
 * Admin Client Notifications Routes
 *
 * API routes for managing client-specific email notifications via Mercury Bridge:
 * - Generate AI templates (pipeline updates, campaign launches, custom)
 * - Create, list, preview, send, and delete notifications
 * - Resolve recipients per-client
 * - All operations are client + campaign scoped
 */

import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { requireAuth } from '../auth';
import { clientNotificationService } from '../services/mercury/client-notification-service';

const router = Router();

// ─── Validation Schemas ──────────────────────────────────────────────────────

const generateTemplateSchema = z.object({
  clientAccountId: z.string().min(1),
  campaignId: z.string().optional(),
  notificationType: z.enum(['pipeline_update', 'campaign_launch', 'leads_delivered', 'weekly_report', 'milestone', 'custom']),
  customPrompt: z.string().max(2000).optional(),
  context: z.record(z.string()).optional(),
});

const createNotificationSchema = z.object({
  clientAccountId: z.string().min(1),
  campaignId: z.string().optional(),
  notificationType: z.enum(['pipeline_update', 'campaign_launch', 'leads_delivered', 'weekly_report', 'milestone', 'custom']),
  subject: z.string().min(1).max(500),
  htmlContent: z.string().min(1),
  textContent: z.string().optional(),
  recipientEmails: z.array(z.string().email()).min(1),
  status: z.enum(['draft', 'queued']).optional(),
  aiGenerated: z.boolean().optional(),
  aiPrompt: z.string().optional(),
  metadata: z.record(z.any()).optional(),
});

// ─── Generate AI Template ────────────────────────────────────────────────────

router.post('/generate-template', requireAuth, async (req: Request, res: Response) => {
  try {
    const parsed = generateTemplateSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'Invalid request', details: parsed.error.flatten() });
    }

    const template = await clientNotificationService.generateTemplate(parsed.data);
    res.json({ success: true, template });
  } catch (error: any) {
    console.error('[ClientNotifications] Generate template error:', error.message);
    res.status(500).json({ error: 'Failed to generate template' });
  }
});

// ─── Create Notification ─────────────────────────────────────────────────────

router.post('/', requireAuth, async (req: Request, res: Response) => {
  try {
    const parsed = createNotificationSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'Invalid request', details: parsed.error.flatten() });
    }

    const notification = await clientNotificationService.createNotification({
      ...parsed.data,
      sentBy: (req as any).user?.id,
    });

    res.json({ success: true, notification });
  } catch (error: any) {
    console.error('[ClientNotifications] Create error:', error.message);
    res.status(500).json({ error: 'Failed to create notification' });
  }
});

// ─── List Notifications for Client ───────────────────────────────────────────

router.get('/client/:clientAccountId', requireAuth, async (req: Request, res: Response) => {
  try {
    const { clientAccountId } = req.params;
    const campaignId = req.query.campaignId as string | undefined;
    const limit = Math.min(parseInt(req.query.limit as string) || 50, 200);
    const offset = parseInt(req.query.offset as string) || 0;

    const result = await clientNotificationService.listNotifications({
      clientAccountId,
      campaignId,
      limit,
      offset,
    });

    res.json(result);
  } catch (error: any) {
    console.error('[ClientNotifications] List error:', error.message);
    res.status(500).json({ error: 'Failed to list notifications' });
  }
});

// ─── Get Single Notification ─────────────────────────────────────────────────

router.get('/:id', requireAuth, async (req: Request, res: Response) => {
  try {
    const notification = await clientNotificationService.getNotification(req.params.id);
    if (!notification) return res.status(404).json({ error: 'Not found' });
    res.json(notification);
  } catch (error: any) {
    console.error('[ClientNotifications] Get error:', error.message);
    res.status(500).json({ error: 'Failed to get notification' });
  }
});

// ─── Send Notification ───────────────────────────────────────────────────────

router.post('/:id/send', requireAuth, async (req: Request, res: Response) => {
  try {
    const result = await clientNotificationService.sendNotification({
      notificationId: req.params.id,
      sentBy: (req as any).user?.id,
    });

    if (!result.success) {
      return res.status(400).json({ error: result.error, sentCount: result.sentCount });
    }

    res.json({ success: true, sentCount: result.sentCount });
  } catch (error: any) {
    console.error('[ClientNotifications] Send error:', error.message);
    res.status(500).json({ error: 'Failed to send notification' });
  }
});

// ─── Delete Notification ─────────────────────────────────────────────────────

router.delete('/:id', requireAuth, async (req: Request, res: Response) => {
  try {
    const deleted = await clientNotificationService.deleteNotification(req.params.id);
    if (!deleted) return res.status(400).json({ error: 'Cannot delete sent notification or not found' });
    res.json({ success: true });
  } catch (error: any) {
    console.error('[ClientNotifications] Delete error:', error.message);
    res.status(500).json({ error: 'Failed to delete notification' });
  }
});

// ─── Resolve Client Recipients ───────────────────────────────────────────────

router.get('/client/:clientAccountId/recipients', requireAuth, async (req: Request, res: Response) => {
  try {
    const recipients = await clientNotificationService.resolveClientRecipients(req.params.clientAccountId);
    res.json({ recipients });
  } catch (error: any) {
    console.error('[ClientNotifications] Resolve recipients error:', error.message);
    res.status(500).json({ error: 'Failed to resolve recipients' });
  }
});

export default router;