/**
 * Mercury Bridge — Notification Service
 * 
 * Event-driven notification dispatch. Translates domain events into
 * email sends via Mercury templates and the outbox queue.
 * 
 * Architecture:
 *   NotificationEvent → NotificationRule → Template → Outbox → SMTP
 * 
 * Adding a new notification:
 *   1. Add event type to MercuryEventType
 *   2. Create a Mercury template with the matching templateKey
 *   3. Create a NotificationRule mapping event → template + recipients
 *   4. Call notificationService.dispatch({ eventType, ... }) from your business logic
 */

import { db } from '../../db';
import { eq, and, inArray } from 'drizzle-orm';
import {
  mercuryNotificationEvents,
  mercuryNotificationRules,
  mercuryNotificationPreferences,
  clientUsers,
  clientAccounts,
} from '@shared/schema';
import { mercuryEmailService } from './email-service';
import { isFeatureEnabled } from '../../feature-flags';
import type {
  NotificationDispatchRequest,
  NotificationDispatchResult,
  MercuryEventType,
  RecipientResolverType,
} from './types';

export class NotificationService {
  /**
   * Dispatch a notification event.
   * 
   * 1. Records the event
   * 2. Finds matching notification rules
   * 3. Resolves recipients
   * 4. Renders templates
   * 5. Queues emails via Mercury outbox
   * 
   * This method is designed to be non-blocking — errors are captured
   * per-recipient and the method always succeeds at the event level.
   */
  async dispatch(request: NotificationDispatchRequest): Promise {
    if (!isFeatureEnabled('smtp_email_enabled')) {
      console.log(`[Mercury/Notification] Skipped (flag off): ${request.eventType}`);
      return { eventId: '', emailsQueued: 0, errors: ['smtp_email_enabled flag is OFF'] };
    }

    // 1. Record the event
    const [event] = await db.insert(mercuryNotificationEvents).values({
      eventType: request.eventType,
      tenantId: request.tenantId,
      actorUserId: request.actorUserId,
      payload: request.payload,
    }).returning();

    console.log(`[Mercury/Notification] Event recorded: id=${event.id}, type=${request.eventType}`);

    // 2. Find matching enabled rules
    const rules = await db
      .select()
      .from(mercuryNotificationRules)
      .where(
        and(
          eq(mercuryNotificationRules.eventType, request.eventType),
          eq(mercuryNotificationRules.isEnabled, true),
          eq(mercuryNotificationRules.channelType, 'email'),
        )
      );

    if (rules.length === 0) {
      console.log(`[Mercury/Notification] No rules for event: ${request.eventType}`);
      await db.update(mercuryNotificationEvents).set({
        processedAt: new Date(),
      }).where(eq(mercuryNotificationEvents.id, event.id));
      return { eventId: event.id, emailsQueued: 0, errors: [] };
    }

    let totalQueued = 0;
    const errors: string[] = [];

    // 3. Process each rule
    for (const rule of rules) {
      try {
        // Resolve recipients
        const recipients = await this.resolveRecipients(
          rule.recipientResolver as RecipientResolverType,
          request.tenantId,
          request.actorUserId,
          (rule.customRecipients as string[] | null) || [],
        );

        // Filter by notification preferences
        const filteredRecipients = await this.filterByPreferences(
          recipients,
          request.eventType,
        );

        // Render template
        const rendered = await mercuryEmailService.renderTemplate(
          rule.templateKey,
          this.buildTemplateVariables(request.payload, request.eventType),
          true,
        );

        if (!rendered) {
          errors.push(`Template not found: ${rule.templateKey}`);
          continue;
        }

        // Queue emails for each recipient
        for (const recipient of filteredRecipients) {
          try {
            const { skipped } = await mercuryEmailService.queueEmail({
              templateKey: rule.templateKey,
              recipientEmail: recipient.email,
              recipientName: recipient.name,
              recipientUserId: recipient.userId,
              recipientUserType: recipient.userType,
              tenantId: request.tenantId,
              subject: rendered.subject,
              html: rendered.html,
              text: rendered.text,
              idempotencyKey: `${event.id}_${rule.id}_${recipient.email}`,
              metadata: {
                eventId: event.id,
                ruleId: rule.id,
                eventType: request.eventType,
              },
            });

            if (!skipped) totalQueued++;
          } catch (err: any) {
            errors.push(`Failed to queue for ${recipient.email}: ${err.message}`);
          }
        }
      } catch (err: any) {
        errors.push(`Rule ${rule.id} failed: ${err.message}`);
      }
    }

    // Mark event as processed
    await db.update(mercuryNotificationEvents).set({
      processedAt: new Date(),
      errorMessage: errors.length > 0 ? errors.join('; ') : null,
    }).where(eq(mercuryNotificationEvents.id, event.id));

    console.log(`[Mercury/Notification] Dispatched: event=${event.id}, queued=${totalQueued}, errors=${errors.length}`);

    // Trigger outbox processing (async, non-blocking)
    mercuryEmailService.processOutbox().catch(err => {
      console.error('[Mercury/Notification] Outbox processing error:', err.message);
    });

    return { eventId: event.id, emailsQueued: totalQueued, errors };
  }

  /**
   * Resolve recipients based on the resolver type.
   */
  private async resolveRecipients(
    resolverType: RecipientResolverType,
    tenantId?: string,
    actorUserId?: string,
    customRecipients?: string[],
  ): Promise> {
    switch (resolverType) {
      case 'requester': {
        if (!actorUserId) return [];
        const [user] = await db
          .select({
            id: clientUsers.id,
            email: clientUsers.email,
            firstName: clientUsers.firstName,
            lastName: clientUsers.lastName,
          })
          .from(clientUsers)
          .where(eq(clientUsers.id, actorUserId))
          .limit(1);

        if (!user) return [];
        return [{
          email: user.email,
          name: [user.firstName, user.lastName].filter(Boolean).join(' ') || undefined,
          userId: user.id,
          userType: 'client',
        }];
      }

      case 'tenant_admins':
      case 'all_tenant_users': {
        if (!tenantId) return [];
        const users = await db
          .select({
            id: clientUsers.id,
            email: clientUsers.email,
            firstName: clientUsers.firstName,
            lastName: clientUsers.lastName,
          })
          .from(clientUsers)
          .where(
            and(
              eq(clientUsers.clientAccountId, tenantId),
              eq(clientUsers.isActive, true),
            )
          );

        return users.map(u => ({
          email: u.email,
          name: [u.firstName, u.lastName].filter(Boolean).join(' ') || undefined,
          userId: u.id,
          userType: 'client',
        }));
      }

      case 'custom': {
        return (customRecipients || []).map(email => ({
          email,
          userType: 'custom',
        }));
      }

      default:
        return [];
    }
  }

  /**
   * Filter recipients by their notification preferences.
   * If a user has explicitly disabled this notification type, they are excluded.
   */
  private async filterByPreferences(
    recipients: Array,
    eventType: MercuryEventType,
  ): Promise {
    const userIds = recipients.map(r => r.userId).filter(Boolean) as string[];
    if (userIds.length === 0) return recipients;

    // Fetch preferences for these users + event type
    const prefs = await db
      .select()
      .from(mercuryNotificationPreferences)
      .where(
        and(
          inArray(mercuryNotificationPreferences.userId, userIds),
          eq(mercuryNotificationPreferences.notificationType, eventType),
          eq(mercuryNotificationPreferences.channelType, 'email'),
        )
      );

    // Build opt-out set
    const optedOut = new Set(
      prefs.filter(p => !p.isEnabled).map(p => p.userId)
    );

    return recipients.filter(r => !r.userId || !optedOut.has(r.userId));
  }

  /**
   * Convert event payload to template variables (all values stringified).
   */
  private buildTemplateVariables(
    payload: Record,
    eventType: string,
  ): Record {
    const vars: Record = {};
    for (const [key, value] of Object.entries(payload)) {
      if (value === null || value === undefined) continue;
      if (typeof value === 'object') {
        vars[key] = JSON.stringify(value);
      } else {
        vars[key] = String(value);
      }
    }
    vars.eventType = eventType;
    vars.currentYear = new Date().getFullYear().toString();
    return vars;
  }
}

// Singleton export
export const notificationService = new NotificationService();