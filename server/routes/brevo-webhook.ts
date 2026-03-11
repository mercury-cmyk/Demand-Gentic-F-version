/**
 * Brevo Webhook Handler
 *
 * Processes Brevo (Sendinblue) transactional email webhooks.
 * Brevo sends POST requests with event data for:
 *   - delivered, opened (unique_opened), click, hard_bounce, soft_bounce,
 *     spam, unsubscribed, blocked, invalid, deferred, error
 *
 * Brevo webhook payload shape (single event per request):
 * {
 *   "event": "delivered",
 *   "email": "recipient@example.com",
 *   "id": 12345,
 *   "date": "2026-03-11 10:00:00",
 *   "ts": 1741683600,
 *   "message-id": "<abc123@smtp-relay.brevo.com>",
 *   "ts_event": 1741683600,
 *   "subject": "Email subject",
 *   "tag": "[\"campaign\", \"campaign-abc\"]",
 *   "sending_ip": "1.2.3.4",
 *   "ts_epoch": 1741683600000,
 *   "tags": ["campaign", "campaign-abc"]
 * }
 *
 * Brevo can also send click events with a "link" field,
 * and bounce events with "reason" and "hard_bounce" boolean.
 */

import { Router, Request, Response } from 'express';
import { db } from '../db';
import { emailEvents, emailSends, emailSuppressionList, contacts } from '@shared/schema';
import { eq } from 'drizzle-orm';

const router = Router();

/**
 * Normalize Brevo event type to our internal event types
 * (matching Mailgun naming: delivered, opened, clicked, bounced, complained, unsubscribed)
 */
function normalizeBrevoEvent(brevoEvent: string): string {
  switch (brevoEvent) {
    case 'delivered':
      return 'delivered';
    case 'opened':
    case 'unique_opened':
      return 'opened';
    case 'click':
      return 'clicked';
    case 'hard_bounce':
    case 'soft_bounce':
    case 'blocked':
    case 'invalid':
      return 'bounced';
    case 'spam':
      return 'complained';
    case 'unsubscribed':
      return 'unsubscribed';
    case 'deferred':
      return 'deferred';
    case 'error':
      return 'failed';
    default:
      return brevoEvent;
  }
}

function getBounceType(brevoEvent: string): 'hard' | 'soft' | null {
  switch (brevoEvent) {
    case 'hard_bounce':
    case 'blocked':
    case 'invalid':
      return 'hard';
    case 'soft_bounce':
    case 'deferred':
      return 'soft';
    default:
      return null;
  }
}

/**
 * POST /api/brevo/webhooks
 *
 * Brevo sends one event per request.  The payload is flat JSON
 * (not wrapped in event-data like Mailgun).
 */
router.post('/', async (req: Request, res: Response) => {
  try {
    const body = req.body;

    if (!body || !body.event) {
      return res.status(400).json({ error: 'Invalid Brevo webhook payload' });
    }

    const brevoEvent = body.event as string;
    const eventType = normalizeBrevoEvent(brevoEvent);
    const recipient = (body.email || '').toLowerCase().trim();
    const messageId = body['message-id'] || null;
    const timestamp = body.ts_event
      ? new Date(body.ts_event * 1000)
      : body.date
        ? new Date(body.date)
        : new Date();

    // Extract campaign/send info from tags or params
    const tags: string[] = Array.isArray(body.tags) ? body.tags : [];
    const campaignTag = tags.find((t: string) => t.startsWith('campaign-'));
    const tagCampaignId = campaignTag ? campaignTag.replace('campaign-', '') : null;

    // Brevo passes params we sent in the transactional email
    const params = body.params || {};
    const paramCampaignId = params.campaignId || null;
    const paramContactId = params.contactId || null;
    const paramSendId = params.sendId || null;

    console.log(`[Brevo Webhook] ${brevoEvent} (${eventType}) - ${recipient} - Campaign: ${paramCampaignId || tagCampaignId || 'unknown'}`);

    let resolvedSendId: string | null = paramSendId;
    let resolvedCampaignId: string | null = paramCampaignId || tagCampaignId;
    let resolvedContactId: string | null = paramContactId;

    // Resolve send record by sendId first (most reliable)
    if (paramSendId) {
      const [send] = await db
        .select({
          id: emailSends.id,
          campaignId: emailSends.campaignId,
          contactId: emailSends.contactId,
        })
        .from(emailSends)
        .where(eq(emailSends.id, paramSendId))
        .limit(1);

      if (send) {
        resolvedSendId = send.id;
        resolvedCampaignId = send.campaignId || resolvedCampaignId;
        resolvedContactId = send.contactId || resolvedContactId;
      }
    }

    // Fallback: resolve by provider message ID
    if (!resolvedSendId && messageId) {
      const [send] = await db
        .select({
          id: emailSends.id,
          campaignId: emailSends.campaignId,
          contactId: emailSends.contactId,
        })
        .from(emailSends)
        .where(eq(emailSends.providerMessageId, messageId))
        .limit(1);

      if (send) {
        resolvedSendId = send.id;
        resolvedCampaignId = send.campaignId || resolvedCampaignId;
        resolvedContactId = send.contactId || resolvedContactId;
      }
    }

    // Fallback: resolve contact by email
    if (!resolvedContactId && recipient) {
      const [contact] = await db
        .select({ id: contacts.id })
        .from(contacts)
        .where(eq(contacts.emailNormalized, recipient))
        .limit(1);
      resolvedContactId = contact?.id || null;
    }

    // Build metadata including click URL if present
    const metadata: Record<string, unknown> = { ...body };
    if (body.link) {
      metadata.url = body.link;
    }

    // Store event in email_events table (same table as Mailgun events)
    await db.insert(emailEvents).values({
      sendId: resolvedSendId,
      messageId,
      campaignId: resolvedCampaignId,
      contactId: resolvedContactId,
      recipient,
      type: eventType,
      bounceType: getBounceType(brevoEvent),
      metadata,
      createdAt: timestamp,
    });

    // Update emailSends status for bounce/failure events
    if (resolvedSendId && ['bounced', 'failed'].includes(eventType)) {
      await db
        .update(emailSends)
        .set({ status: 'bounced' })
        .where(eq(emailSends.id, resolvedSendId));
    }

    // Update emailSends status for delivered (only if still 'sent')
    if (resolvedSendId && eventType === 'delivered') {
      await db
        .update(emailSends)
        .set({ status: 'sent' })
        .where(eq(emailSends.id, resolvedSendId));
    }

    // Handle automatic suppression for hard bounces, spam complaints, and unsubscribes
    const shouldSuppress =
      (eventType === 'bounced' && getBounceType(brevoEvent) === 'hard') ||
      eventType === 'complained' ||
      eventType === 'unsubscribed';

    if (shouldSuppress && recipient) {
      const suppressionReason =
        eventType === 'bounced'
          ? 'hard_bounce' as const
          : eventType === 'unsubscribed'
            ? 'unsubscribe' as const
            : 'spam_complaint' as const;

      // Check if already suppressed
      const existing = await db
        .select()
        .from(emailSuppressionList)
        .where(eq(emailSuppressionList.emailNormalized, recipient))
        .limit(1);

      if (existing.length === 0) {
        await db.insert(emailSuppressionList).values({
          email: body.email || recipient,
          emailNormalized: recipient,
          reason: suppressionReason,
          campaignId: resolvedCampaignId,
          contactId: resolvedContactId,
          metadata: { event: brevoEvent, timestamp, provider: 'brevo' },
        });

        console.log(`[Brevo Webhook] Added ${recipient} to suppression list (${suppressionReason})`);

        // Update contact record
        if (resolvedContactId) {
          const updateData: Record<string, unknown> = {};
          if (eventType === 'bounced') {
            updateData.emailStatus = 'bounced';
            updateData.isInvalid = true;
            updateData.invalidReason = 'Hard bounce from Brevo email campaign';
            updateData.invalidatedAt = new Date();
          } else if (eventType === 'unsubscribed') {
            updateData.emailStatus = 'unsubscribed';
          } else if (eventType === 'complained') {
            updateData.emailStatus = 'spam_complaint';
            updateData.isInvalid = true;
            updateData.invalidReason = 'Spam complaint via Brevo';
            updateData.invalidatedAt = new Date();
          }

          await db
            .update(contacts)
            .set(updateData)
            .where(eq(contacts.id, resolvedContactId));
        }
      }
    }

    res.status(200).json({ received: true });
  } catch (error: any) {
    console.error('[Brevo Webhook] Error processing webhook:', error);
    res.status(500).json({ error: 'Webhook processing failed' });
  }
});

export default router;
