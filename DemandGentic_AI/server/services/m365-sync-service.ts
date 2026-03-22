import { storage } from "../storage";
import type { MailboxAccount, InsertM365Activity } from "@shared/schema";
import CryptoJS from "crypto-js";
import { parse as parseDomain } from "tldts";
import { dealConversationService } from "./deal-conversation-service";
import { emailTrackingService } from "../lib/email-tracking-service";

const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY || "default-encryption-key-change-in-production";

interface GraphEmailMessage {
  id: string;
  subject: string;
  conversationId?: string;
  from: {
    emailAddress: {
      name: string;
      address: string;
    };
  };
  toRecipients: Array;
  ccRecipients: Array;
  sentDateTime: string;
  receivedDateTime: string;
  bodyPreview: string;
  isRead: boolean;
  hasAttachments: boolean;
  internetMessageId: string;
}

interface GraphResponse {
  value: GraphEmailMessage[];
  "@odata.nextLink"?: string;
}

export class M365SyncService {
  private async decryptToken(encryptedToken: string): Promise {
    const bytes = CryptoJS.AES.decrypt(encryptedToken, ENCRYPTION_KEY);
    return bytes.toString(CryptoJS.enc.Utf8);
  }

  private async encryptToken(token: string): Promise {
    return CryptoJS.AES.encrypt(token, ENCRYPTION_KEY).toString();
  }

  private async refreshAccessToken(mailboxAccount: MailboxAccount): Promise {
    if (!mailboxAccount.refreshToken) {
      throw new Error("No refresh token available");
    }

    const refreshToken = await this.decryptToken(mailboxAccount.refreshToken);

    const tokenUrl = `https://login.microsoftonline.com/${process.env.MICROSOFT_TENANT_ID}/oauth2/v2.0/token`;

    const params = new URLSearchParams({
      client_id: process.env.MICROSOFT_CLIENT_ID!,
      client_secret: process.env.MICROSOFT_CLIENT_SECRET!,
      refresh_token: refreshToken,
      grant_type: "refresh_token",
      scope: "offline_access Mail.Read Mail.ReadBasic Mail.ReadWrite Mail.Send",
    });

    const response = await fetch(tokenUrl, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: params.toString(),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Token refresh failed: ${error}`);
    }

    const data = await response.json();

    const encryptedAccessToken = await this.encryptToken(data.access_token);
    const encryptedRefreshToken = data.refresh_token
      ? await this.encryptToken(data.refresh_token)
      : mailboxAccount.refreshToken;

    await storage.updateMailboxAccount(mailboxAccount.id, {
      accessToken: encryptedAccessToken,
      refreshToken: encryptedRefreshToken,
      tokenExpiresAt: new Date(Date.now() + data.expires_in * 1000),
    });

    return data.access_token;
  }

  private async getValidAccessToken(mailboxAccount: MailboxAccount): Promise {
    if (!mailboxAccount.accessToken) {
      throw new Error("No access token available");
    }

    const tokenExpiresAt = mailboxAccount.tokenExpiresAt ? new Date(mailboxAccount.tokenExpiresAt) : new Date(0);
    const now = new Date();

    if (tokenExpiresAt  {
    // Check if message already exists
    const existing = await storage.getDealMessageByM365Id(m365Activity.messageId);
    if (existing) {
      return;
    }

    const direction = email.from.emailAddress.address === mailboxEmail ? "outbound" : "inbound";
    
    // Create a standalone conversation for inbox messages (no opportunity required)
    const conversation = await storage.createDealConversation({
      opportunityId: null, // No opportunity - this is just for inbox display
      subject: email.subject || "(No Subject)",
      threadId: email.conversationId || null,
      participantEmails: [
        email.from.emailAddress.address,
        ...email.toRecipients.map(r => r.emailAddress.address),
        ...email.ccRecipients.map(r => r.emailAddress.address)
      ].filter((e, i, arr) => arr.indexOf(e) === i), // Unique emails
      messageCount: 1,
      lastMessageAt: new Date(email.receivedDateTime),
      direction,
      status: 'active'
    });

    // Create message linked to the standalone conversation
    await storage.createDealMessage({
      conversationId: conversation.id,
      opportunityId: null, // No opportunity link yet
      m365MessageId: m365Activity.messageId,
      fromEmail: email.from.emailAddress.address,
      toEmails: email.toRecipients.map(r => r.emailAddress.address),
      ccEmails: email.ccRecipients.map(r => r.emailAddress.address),
      subject: email.subject || "(No Subject)",
      bodyPreview: email.bodyPreview?.substring(0, 500) || null,
      bodyContent: null,
      direction,
      messageStatus: 'delivered',
      sentAt: new Date(email.sentDateTime),
      receivedAt: new Date(email.receivedDateTime),
      isFromCustomer: direction === 'inbound',
      hasAttachments: email.hasAttachments || false,
      importance: 'normal'
    });
  }

  private async linkToAccountAndContact(
    email: string,
    mailboxAccountId: string
  ): Promise {
    const domain = this.extractDomainFromEmail(email);
    let accountId: string | null = null;
    let contactId: string | null = null;

    if (domain) {
      const account = await storage.getAccountByDomain(domain);
      if (account) {
        accountId = account.id;
      }
    }

    const contacts = await storage.getContactsByEmails([email]);
    if (contacts.length > 0) {
      contactId = contacts[0].id;
      if (!accountId && contacts[0].accountId) {
        accountId = contacts[0].accountId;
      }
    }

    return { accountId, contactId };
  }

  private async fetchEmailsFromGraph(
    accessToken: string,
    options?: { top?: number; skip?: number; deltaToken?: string }
  ): Promise {
    const top = options?.top || 50;
    const skip = options?.skip || 0;

    let url = options?.deltaToken
      ? `https://graph.microsoft.com/v1.0/me/mailFolders/inbox/messages/delta?${options.deltaToken}`
      : `https://graph.microsoft.com/v1.0/me/mailFolders/inbox/messages?$top=${top}&$skip=${skip}&$orderby=receivedDateTime desc`;

    const response = await fetch(url, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      let errorData: { error?: { code?: string; message?: string } } = {};
      try {
        errorData = JSON.parse(errorText);
      } catch {
        // Not JSON, use raw text
      }

      // Handle specific Graph API errors gracefully
      const errorCode = errorData?.error?.code;
      if (errorCode === "MailboxNotEnabledForRESTAPI") {
        throw new Error(`MAILBOX_NOT_ENABLED: ${errorData?.error?.message || "Mailbox is not enabled for REST API (may be on-premise, inactive, or missing Exchange Online license)"}`);
      }
      if (errorCode === "ResourceNotFound" || response.status === 404) {
        throw new Error(`MAILBOX_NOT_FOUND: Mailbox or resource not found`);
      }
      if (errorCode === "OrganizationFromTenantGuidNotFound") {
        throw new Error(`TENANT_NOT_FOUND: The M365 tenant was not found or is no longer valid`);
      }

      throw new Error(`Graph API request failed: ${response.status} - ${errorText}`);
    }

    const data: GraphResponse = await response.json();

    const deltaLink = data["@odata.nextLink"];
    const deltaToken = deltaLink ? new URL(deltaLink).searchParams.get("$deltatoken") || undefined : undefined;

    return {
      emails: data.value,
      deltaToken,
    };
  }

  async syncEmails(
    mailboxAccountId: string,
    options?: { limit?: number; fullSync?: boolean }
  ): Promise {
    const mailboxAccount = await storage.getMailboxAccountById(mailboxAccountId);
    if (!mailboxAccount) {
      throw new Error("Mailbox account not found");
    }

    const accessToken = await this.getValidAccessToken(mailboxAccount);

    const { emails } = await this.fetchEmailsFromGraph(accessToken, {
      top: options?.limit || 50,
    });

    let synced = 0;
    let errors = 0;

    for (const email of emails) {
      try {
        const existing = await storage.getM365ActivityByMessageId(
          mailboxAccountId,
          email.internetMessageId || email.id
        );

        if (existing) {
          continue;
        }

        const fromEmail = email.from.emailAddress.address;
        const { accountId, contactId } = await this.linkToAccountAndContact(fromEmail, mailboxAccountId);

        const direction = fromEmail === mailboxAccount.mailboxEmail ? "outbound" : "inbound";

        const activity: InsertM365Activity = {
          mailboxAccountId,
          messageId: email.internetMessageId || email.id,
          activityType: "email",
          direction,
          subject: email.subject || "(No Subject)",
          fromEmail: email.from.emailAddress.address,
          fromName: email.from.emailAddress.name?.substring(0, 255) || null,
          toRecipients: email.toRecipients.map((r) => ({ name: r.emailAddress.name, address: r.emailAddress.address })),
          ccRecipients: email.ccRecipients.map((r) => ({ name: r.emailAddress.name, address: r.emailAddress.address })),
          bodyPreview: email.bodyPreview?.substring(0, 500) || null,
          receivedDateTime: new Date(email.receivedDateTime),
          sentDateTime: new Date(email.sentDateTime),
          isRead: email.isRead,
          hasAttachments: email.hasAttachments,
          accountId,
          contactId,
        };

        const createdActivity = await storage.createM365Activity(activity);
        synced++;

        // Create deal message for inbox display (always create, not just for opportunities)
        try {
          await this.createDealMessageForInbox(createdActivity, email, mailboxAccount.mailboxEmail!);
        } catch (dealError) {
          console.error(`[M365Sync] Error creating inbox message:`, dealError);
        }

        // Link to opportunities if found
        try {
          await dealConversationService.processEmailSync({
            m365Activity: createdActivity,
            threadId: email.conversationId,
            conversationId: email.conversationId,
            subject: email.subject || "(No Subject)",
            participants: {
              from: email.from.emailAddress.address,
              to: email.toRecipients.map(r => r.emailAddress.address),
              cc: email.ccRecipients.map(r => r.emailAddress.address)
            },
            direction,
            mailboxEmail: mailboxAccount.mailboxEmail!
          });
        } catch (dealError) {
          console.error(`[M365Sync] Error linking email to opportunities:`, dealError);
        }
      } catch (error) {
        console.error(`[M365Sync] Error syncing email ${email.id}:`, error);
        errors++;
      }
    }

    await storage.updateMailboxAccount(mailboxAccountId, {
      lastSyncAt: new Date(),
    });

    return { synced, errors };
  }

  async syncAllMailboxes(): Promise {
    console.log("[M365Sync] Starting sync for all mailboxes...");

    const mailboxAccounts = await storage.getAllMailboxAccounts("o365");

    let total = mailboxAccounts.length;
    let totalSynced = 0;
    let totalErrors = 0;

    if (mailboxAccounts.length === 0) {
      console.log("[M365Sync] No mailbox accounts found");
      return { total, synced: totalSynced, errors: totalErrors };
    }

    console.log(`[M365Sync] Found ${mailboxAccounts.length} mailbox account(s)`);

    for (const mailboxAccount of mailboxAccounts) {
      try {
        console.log(`[M365Sync] Syncing mailbox ${mailboxAccount.mailboxEmail}...`);
        const result = await this.syncEmails(mailboxAccount.id, { limit: 50 });
        totalSynced += result.synced;
        totalErrors += result.errors;
        console.log(`[M365Sync] Synced ${result.synced} emails for ${mailboxAccount.mailboxEmail}`);
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        
        // Handle known configuration issues gracefully
        if (errorMessage.startsWith("MAILBOX_NOT_ENABLED:")) {
          console.warn(`[M365Sync] ⚠️ Skipping mailbox ${mailboxAccount.mailboxEmail}: Not enabled for REST API (on-premise, inactive, or missing Exchange Online license)`);
          // Don't count as error - this is a configuration issue, not a sync failure
          continue;
        }
        if (errorMessage.startsWith("MAILBOX_NOT_FOUND:")) {
          console.warn(`[M365Sync] ⚠️ Skipping mailbox ${mailboxAccount.mailboxEmail}: Mailbox not found`);
          continue;
        }
        if (errorMessage.startsWith("TENANT_NOT_FOUND:")) {
          console.warn(`[M365Sync] ⚠️ Skipping mailbox ${mailboxAccount.mailboxEmail}: Tenant not found or invalid`);
          continue;
        }

        console.error(`[M365Sync] Error syncing mailbox ${mailboxAccount.mailboxEmail}:`, error);
        totalErrors++;
      }
    }

    console.log(`[M365Sync] Sync complete - Total: ${total}, Synced: ${totalSynced}, Errors: ${totalErrors}`);
    return { total, synced: totalSynced, errors: totalErrors };
  }

  /**
   * Send an email using Microsoft Graph API
   */
  async sendEmail(mailboxAccountId: string, emailData: {
    to: string;
    cc?: string;
    subject: string;
    body: string;
    skipTracking?: boolean;
  }): Promise {
    console.log(`[M365 Send] Sending email from mailbox ${mailboxAccountId}`);

    const mailboxAccount = await storage.getMailboxAccountById(mailboxAccountId);
    if (!mailboxAccount) {
      throw new Error("Mailbox account not found");
    }

    const accessToken = await this.getValidAccessToken(mailboxAccount);

    // Parse recipients (normal email behavior with To/CC headers)
    const toRecipients = emailData.to.split(',').map(email => ({
      emailAddress: {
        address: email.trim()
      }
    }));

    const ccRecipients = emailData.cc
      ? emailData.cc.split(',').map(email => ({
          emailAddress: {
            address: email.trim()
          }
        }))
      : [];

    let trackedBody: string;
    let trackingMessageId: string;

    if (emailData.skipTracking) {
      // Body already has tracking applied by caller
      trackedBody = emailData.body;
      trackingMessageId = `sent-${Date.now()}`;
    } else {
      trackingMessageId = `sent-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
      // When sending to multiple recipients in a single email (To + CC), we cannot attribute
      // opens to a specific person — use empty string so opens are recorded as unattributed
      // rather than incorrectly attributed to the first To address.
      const allRecipientAddresses = [
        ...toRecipients.map(r => r.emailAddress.address),
        ...ccRecipients.map(r => r.emailAddress.address),
      ].filter(Boolean);
      const trackingEmail = allRecipientAddresses.length === 1
        ? allRecipientAddresses[0]
        : '';
      trackedBody = emailTrackingService.applyTracking(emailData.body, {
        messageId: trackingMessageId,
        recipientEmail: trackingEmail,
      });
    }

    // Send single email with proper To/CC headers (normal email behavior)
    const message = {
      subject: emailData.subject,
      body: {
        contentType: "HTML",
        content: trackedBody
      },
      toRecipients,
      ...(ccRecipients.length > 0 ? { ccRecipients } : {})
    };

    const response = await fetch("https://graph.microsoft.com/v1.0/me/sendMail", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ message }),
    });

    if (!response.ok) {
      const error = await response.text();
      console.error(`[M365 Send] Failed to send email:`, error);
      throw new Error(`Failed to send email: ${error}`);
    }

    console.log(`[M365 Send] Email sent successfully from ${mailboxAccount.mailboxEmail}`);

    const now = new Date();

    // Create activity record for sent email
    await storage.createM365Activity({
      mailboxAccountId,
      activityType: 'email',
      direction: 'outbound',
      messageId: trackingMessageId,
      subject: emailData.subject,
      fromEmail: mailboxAccount.mailboxEmail || '',
      fromName: mailboxAccount.displayName || mailboxAccount.mailboxEmail || '',
      toRecipients: toRecipients.map(r => ({
        name: r.emailAddress.address,
        address: r.emailAddress.address
      })),
      ...(ccRecipients.length > 0 ? {
        ccRecipients: ccRecipients.map(r => ({
          name: r.emailAddress.address,
          address: r.emailAddress.address
        }))
      } : {}),
      bodyPreview: emailData.body.substring(0, 255),
      sentDateTime: now,
      receivedDateTime: now,
      isRead: true,
      hasAttachments: false,
    });
  }

  /**
   * Backfill existing m365_activities into deal_messages for inbox display
   */
  async backfillInboxFromActivities(mailboxAccountId: string): Promise {
    console.log(`[M365 Backfill] Starting backfill for mailbox ${mailboxAccountId}...`);
    
    const activities = await storage.getM365Activities(mailboxAccountId, { limit: 500 });
    
    let processed = 0;
    let created = 0;
    let skipped = 0;
    let errors = 0;

    for (const activity of activities) {
      try {
        processed++;
        
        // Check if already exists in deal_messages
        const existing = await storage.getDealMessageByM365Id(activity.messageId);
        if (existing) {
          skipped++;
          continue;
        }

        // Reconstruct email object for createDealMessageForInbox
        const email: GraphEmailMessage = {
          id: activity.messageId,
          subject: activity.subject || "(No Subject)",
          conversationId: undefined,
          from: {
            emailAddress: {
              name: activity.fromName || activity.fromEmail || "",
              address: activity.fromEmail || ""
            }
          },
          toRecipients: ((activity.toRecipients as any) || []).map((r: any) => ({
            emailAddress: {
              name: r.name || r.address,
              address: r.address
            }
          })),
          ccRecipients: ((activity.ccRecipients as any) || []).map((r: any) => ({
            emailAddress: {
              name: r.name || r.address,
              address: r.address
            }
          })),
          sentDateTime: activity.sentDateTime?.toISOString() || new Date().toISOString(),
          receivedDateTime: activity.receivedDateTime?.toISOString() || new Date().toISOString(),
          bodyPreview: activity.bodyPreview || "",
          isRead: activity.isRead || false,
          hasAttachments: activity.hasAttachments || false,
          internetMessageId: activity.messageId
        };

        const mailboxAccount = await storage.getMailboxAccountById(mailboxAccountId);
        if (!mailboxAccount) {
          throw new Error("Mailbox account not found");
        }

        await this.createDealMessageForInbox(activity, email, mailboxAccount.mailboxEmail!);
        created++;

      } catch (error) {
        console.error(`[M365 Backfill] Error processing activity ${activity.id}:`, error);
        errors++;
      }
    }

    console.log(`[M365 Backfill] Complete - Processed: ${processed}, Created: ${created}, Skipped: ${skipped}, Errors: ${errors}`);
    return { processed, created, skipped, errors };
  }
}

export const m365SyncService = new M365SyncService();