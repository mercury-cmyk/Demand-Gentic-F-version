/**
 * Email-Pipeline Bridge
 *
 * Resolves campaign/contact context from email tracking events and
 * emits engagement signals to the campaign-pipeline orchestrator.
 *
 * This bridges the gap between the email tracking system (which works
 * with messageId + recipientEmail) and the pipeline system (which
 * needs campaignId + contactId).
 */

import { db } from "../db";
import { emailSends, contacts, campaigns, accounts } from "@shared/schema";
import { eq, and, sql } from "drizzle-orm";
import {
  processEmailEngagement,
  type EngagementSignal,
} from "../services/campaign-pipeline-orchestrator";
import { processEngagementEvent } from "../services/engagement-trigger-service";

/**
 * Emit an engagement signal from an email tracking event.
 * Resolves the campaign/contact from the recipientEmail and routes
 * the signal to the pipeline orchestrator.
 */
export async function emitEmailEngagementSignal(
  signal: EngagementSignal,
  messageId: string,
  recipientEmail: string,
  linkUrl?: string
): Promise<void> {
  try {
    // Strategy 1: Look up via emailSends (campaign email → contact mapping)
    const sendRecords = await db
      .select({
        campaignId: emailSends.campaignId,
        contactId: emailSends.contactId,
      })
      .from(emailSends)
      .innerJoin(contacts, eq(emailSends.contactId, contacts.id))
      .where(
        and(
          eq(contacts.email, recipientEmail)
        )
      )
      .orderBy(sql`${emailSends.createdAt} DESC`)
      .limit(1);

    if (sendRecords.length > 0) {
      const { campaignId, contactId } = sendRecords[0];
      await processEmailEngagement({
        signal,
        campaignId,
        contactId,
        contactEmail: recipientEmail,
        metadata: {
          messageId,
          linkUrl,
          source: "email_tracking",
        },
      });
      return;
    }

    // Strategy 2: Look up contact by email directly (for pipeline-originated emails)
    // Pipeline emails use messageId format: "pipeline-{actionId}"
    const [contact] = await db
      .select({ id: contacts.id })
      .from(contacts)
      .where(eq(contacts.email, recipientEmail))
      .limit(1);

    if (!contact) {
      // No contact found — can't route to pipeline
      return;
    }

    // Find the most recent campaign associated with this contact's email sends
    const [recentSend] = await db
      .select({ campaignId: emailSends.campaignId })
      .from(emailSends)
      .where(eq(emailSends.contactId, contact.id))
      .orderBy(sql`${emailSends.createdAt} DESC`)
      .limit(1);

    if (recentSend) {
      await processEmailEngagement({
        signal,
        campaignId: recentSend.campaignId,
        contactId: contact.id,
        contactEmail: recipientEmail,
        metadata: {
          messageId,
          linkUrl,
          source: "email_tracking_fallback",
        },
      });
    }
    // ── Cross-channel engagement trigger: email engagement → schedule call follow-up ──
    // Only fire on click (high-intent signal) or reply — opens alone are too noisy
    if (signal === 'email_clicked' || signal === 'email_replied') {
      try {
        // Find the contact and their account for the trigger
        const [contactRecord] = await db
          .select({
            id: contacts.id,
            accountId: contacts.accountId,
          })
          .from(contacts)
          .where(eq(contacts.email, recipientEmail))
          .limit(1);

        if (contactRecord?.accountId) {
          // Find most recent campaign for this contact
          const [recentSend] = await db
            .select({ campaignId: emailSends.campaignId })
            .from(emailSends)
            .where(eq(emailSends.contactId, contactRecord.id))
            .orderBy(sql`${emailSends.createdAt} DESC`)
            .limit(1);

          await processEngagementEvent({
            accountId: contactRecord.accountId,
            contactId: contactRecord.id,
            campaignId: recentSend?.campaignId || undefined,
            channel: 'email',
            entityId: messageId,
            engagedAt: new Date(),
            metadata: {
              emailOpened: signal === 'email_clicked',
              emailClicked: signal === 'email_clicked',
            },
          });
          console.log(`[EmailPipelineBridge] Engagement trigger created: ${signal} → call follow-up for ${recipientEmail}`);
        }
      } catch (triggerErr: any) {
        console.warn(`[EmailPipelineBridge] Engagement trigger failed for ${recipientEmail}:`, triggerErr.message);
      }
    }
  } catch (error: any) {
    // Non-critical — don't fail email tracking if pipeline signal fails
    console.warn(
      `[EmailPipelineBridge] Failed to emit ${signal} for ${recipientEmail}:`,
      error.message
    );
  }
}
