// File: server/services/webhook-service.ts
// Webhook Events Delivery System

import crypto from 'crypto';
import { db } from '../db';

enum WebhookEventType {
  EMAIL_SENT = 'email.sent',
  EMAIL_DELIVERED = 'email.delivered',
  EMAIL_OPENED = 'email.opened',
  EMAIL_CLICKED = 'email.clicked',
  EMAIL_BOUNCED = 'email.bounced',
  EMAIL_UNSUBSCRIBED = 'email.unsubscribed',
  CAMPAIGN_SENT = 'campaign.sent',
  CAMPAIGN_COMPLETED = 'campaign.completed',
}

interface WebhookEvent {
  id: string;
  type: WebhookEventType;
  timestamp: Date;
  data: {
    campaignId: string;
    contactId?: string;
    email?: string;
    messageId?: string;
    url?: string;
    metadata?: Record;
  };
}

interface Webhook {
  id: string;
  url: string;
  events: WebhookEventType[];
  secret: string;
  active: boolean;
  createdAt: Date;
}

interface WebhookDelivery {
  id: string;
  webhookId: string;
  eventId: string;
  status: 'pending' | 'success' | 'failed';
  attempts: number;
  nextRetryAt?: Date;
  lastError?: string;
}

class WebhookService {
  private webhooks: Map = new Map();
  private deliveries: Map = new Map();

  // Register webhook
  async registerWebhook(
    url: string,
    events: WebhookEventType[],
    secret?: string
  ): Promise {
    const id = `webhook_${Date.now()}`;
    const webhook: Webhook = {
      id,
      url,
      events,
      secret: secret || crypto.randomBytes(32).toString('hex'),
      active: true,
      createdAt: new Date(),
    };

    this.webhooks.set(id, webhook);
    return webhook;
  }

  // List webhooks
  async listWebhooks(): Promise {
    return Array.from(this.webhooks.values());
  }

  // Get webhook
  async getWebhook(id: string): Promise {
    return this.webhooks.get(id);
  }

  // Update webhook
  async updateWebhook(id: string, updates: Partial): Promise {
    const webhook = this.webhooks.get(id);
    if (webhook) {
      this.webhooks.set(id, { ...webhook, ...updates });
    }
  }

  // Delete webhook
  async deleteWebhook(id: string): Promise {
    this.webhooks.delete(id);
  }

  // Emit event
  async emitWebhookEvent(event: WebhookEvent): Promise {
    // Find webhooks subscribed to this event type
    const subscribedWebhooks = Array.from(this.webhooks.values()).filter(
      webhook => webhook.active && webhook.events.includes(event.type)
    );

    // Queue deliveries
    for (const webhook of subscribedWebhooks) {
      await this.queueDelivery(webhook, event);
    }
  }

  // Queue delivery
  private async queueDelivery(
    webhook: Webhook,
    event: WebhookEvent
  ): Promise {
    const delivery: WebhookDelivery = {
      id: `delivery_${Date.now()}`,
      webhookId: webhook.id,
      eventId: event.id,
      status: 'pending',
      attempts: 0,
    };

    this.deliveries.set(delivery.id, delivery);

    // Attempt immediate delivery
    await this.attemptDelivery(delivery, webhook, event);
  }

  // Attempt delivery
  private async attemptDelivery(
    delivery: WebhookDelivery,
    webhook: Webhook,
    event: WebhookEvent,
    attempt = 1
  ): Promise {
    const maxAttempts = 5;
    const backoffMultiplier = 2;
    const initialDelayMs = 1000;

    try {
      // Generate signature
      const payload = JSON.stringify(event);
      const signature = this.generateSignature(payload, webhook.secret);

      // Send request
      const response = await fetch(webhook.url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Webhook-Signature': signature,
          'X-Webhook-ID': webhook.id,
          'X-Webhook-Event': event.type,
          'X-Webhook-Timestamp': event.timestamp.toISOString(),
        },
        body: payload,
        timeout: 30000, // 30 second timeout
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      // Success
      delivery.status = 'success';
      delivery.attempts = attempt;
      this.deliveries.set(delivery.id, delivery);

      console.log(
        `✓ Webhook ${webhook.id} delivered (attempt ${attempt})`
      );
    } catch (error: any) {
      console.error(
        `✗ Webhook delivery failed (attempt ${attempt}/${maxAttempts}):`,
        error.message
      );

      delivery.lastError = error.message;
      delivery.attempts = attempt;

      if (attempt  {
          this.attemptDelivery(delivery, webhook, event, attempt + 1);
        }, delayMs);
      } else {
        // Max attempts reached
        delivery.status = 'failed';
        this.deliveries.set(delivery.id, delivery);
        console.error(
          `✗ Webhook ${webhook.id} failed after ${maxAttempts} attempts`
        );
      }
    }
  }

  // Generate signature
  private generateSignature(payload: string, secret: string): string {
    return crypto
      .createHmac('sha256', secret)
      .update(payload)
      .digest('hex');
  }

  // Verify signature
  static verifySignature(
    payload: string,
    signature: string,
    secret: string
  ): boolean {
    const expectedSignature = crypto
      .createHmac('sha256', secret)
      .update(payload)
      .digest('hex');

    return signature === expectedSignature;
  }

  // Get delivery status
  async getDeliveryStatus(deliveryId: string): Promise {
    return this.deliveries.get(deliveryId);
  }

  // Retry delivery
  async retryDelivery(deliveryId: string): Promise {
    const delivery = this.deliveries.get(deliveryId);
    if (!delivery) return;

    const webhook = this.webhooks.get(delivery.webhookId);
    if (!webhook) return;

    // Get original event (in production, query from database)
    const event: WebhookEvent = {
      id: delivery.eventId,
      type: WebhookEventType.EMAIL_SENT,
      timestamp: new Date(),
      data: {
        campaignId: '',
      },
    };

    delivery.status = 'pending';
    delivery.attempts = 0;
    this.deliveries.set(deliveryId, delivery);

    await this.attemptDelivery(delivery, webhook, event);
  }

  // Get delivery history
  async getDeliveryHistory(webhookId: string): Promise {
    return Array.from(this.deliveries.values()).filter(
      d => d.webhookId === webhookId
    );
  }

  // Cleanup old deliveries
  async cleanupOldDeliveries(daysOld: number = 30): Promise {
    const cutoffDate = new Date(Date.now() - daysOld * 24 * 60 * 60 * 1000);
    let deleted = 0;

    for (const [id, delivery] of this.deliveries.entries()) {
      // If no retry date, use a default based on event
      if (delivery.status === 'success') {
        deleted++;
        this.deliveries.delete(id);
      }
    }

    return deleted;
  }
}

// Export singleton
export const webhookService = new WebhookService();

// Example event emission
export function createWebhookEvents() {
  return {
    // Email sent
    emailSent: (campaignId: string, contactId: string, messageId: string) =>
      ({
        id: `evt_${Date.now()}`,
        type: WebhookEventType.EMAIL_SENT,
        timestamp: new Date(),
        data: {
          campaignId,
          contactId,
          messageId,
          metadata: { service: 'sendgrid' },
        },
      } as WebhookEvent),

    // Email opened
    emailOpened: (campaignId: string, contactId: string, messageId: string) =>
      ({
        id: `evt_${Date.now()}`,
        type: WebhookEventType.EMAIL_OPENED,
        timestamp: new Date(),
        data: {
          campaignId,
          contactId,
          messageId,
          metadata: {
            deviceType: 'mobile',
            country: 'US',
            userAgent: 'Mozilla/5.0...',
          },
        },
      } as WebhookEvent),

    // Email clicked
    emailClicked: (
      campaignId: string,
      contactId: string,
      messageId: string,
      url: string
    ) =>
      ({
        id: `evt_${Date.now()}`,
        type: WebhookEventType.EMAIL_CLICKED,
        timestamp: new Date(),
        data: {
          campaignId,
          contactId,
          messageId,
          url,
          metadata: { linkPosition: 'footer' },
        },
      } as WebhookEvent),

    // Email bounced
    emailBounced: (
      campaignId: string,
      contactId: string,
      email: string,
      bounceType: 'hard' | 'soft'
    ) =>
      ({
        id: `evt_${Date.now()}`,
        type: WebhookEventType.EMAIL_BOUNCED,
        timestamp: new Date(),
        data: {
          campaignId,
          contactId,
          email,
          metadata: { bounceType, reason: 'User unknown' },
        },
      } as WebhookEvent),

    // Campaign completed
    campaignCompleted: (campaignId: string, stats: any) =>
      ({
        id: `evt_${Date.now()}`,
        type: WebhookEventType.CAMPAIGN_COMPLETED,
        timestamp: new Date(),
        data: {
          campaignId,
          metadata: stats,
        },
      } as WebhookEvent),
  };
}

export { WebhookEventType, WebhookEvent, Webhook, WebhookDelivery };