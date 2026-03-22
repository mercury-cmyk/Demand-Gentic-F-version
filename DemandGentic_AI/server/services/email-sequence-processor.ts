/**
 * Email Sequence Processor
 * 
 * BullMQ-powered background processor for automated email sequences.
 * Handles scheduling, personalization, sending, and engagement tracking.
 */

import { storage } from "../storage";
import { createQueue, createWorker } from "../lib/queue";
import type {
  SequenceEmailSend,
  Contact,
  MailboxAccount,
  Account
} from "@shared/schema";
import CryptoJS from "crypto-js";
import { db } from "../db";
import { sequenceEmailSends, sequenceEnrollments, sequenceSteps, emailSequences } from "@shared/schema";
import { eq, and, lte, or } from "drizzle-orm";
import { emailTrackingService } from "../lib/email-tracking-service";

const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY || "default-encryption-key-change-in-production";

interface EmailSendJobData {
  sendId: string;
}

interface PersonalizationContext {
  contact: Contact;
  account?: Account;
}

export class EmailSequenceProcessor {
  private queue: ReturnType>;
  private worker: ReturnType>;

  constructor() {
    this.queue = createQueue("email-sequence-sends", {
      attempts: 3,
      backoff: {
        type: "exponential",
        delay: 60000, // Start with 1 minute
      },
      removeOnComplete: 1000,
      removeOnFail: 5000,
    });

    this.worker = createWorker(
      "email-sequence-sends",
      this.processEmailSend.bind(this),
      { concurrency: 5 } // Process 5 emails concurrently
    );

    console.log("[EmailSequenceProcessor] Queue and worker initialized");
  }

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

    if (tokenExpiresAt  = {
      firstName: contact.firstName || "",
      lastName: contact.lastName || "",
      fullName: contact.fullName || "",
      email: contact.email || "",
      jobTitle: contact.jobTitle || "",
      phone: contact.directPhone || "",
      company: account?.name || "",
      companyName: account?.name || "", // Alias for company
      companyDomain: account?.domain || "",
      companyIndustry: account?.industryStandardized || "",
    };

    let result = text;
    for (const [key, value] of Object.entries(tokens)) {
      const regex = new RegExp(`{{\\s*${key}\\s*}}`, "gi");
      result = result.replace(regex, value);
    }

    return result;
  }

  /**
   * Send email via Microsoft Graph API
   * Sends HTML content; Outlook auto-generates plain text preview
   * Plain text field is used for reference/fallback if no HTML
   */
  private async sendEmailViaGraph(
    accessToken: string,
    toEmail: string,
    subject: string,
    htmlBody: string,
    textBody?: string
  ): Promise {
    // Microsoft Graph API sendMail uses JSON format (not raw MIME)
    // For Outlook-safe emails: send HTML, client auto-generates plain text preview
    // If no HTML, fall back to plain text
    const hasHtml = htmlBody && htmlBody.trim().length > 0;
    
    const emailMessage = {
      message: {
        subject,
        body: {
          contentType: hasHtml ? "HTML" : "Text",
          content: hasHtml ? htmlBody : (textBody || ""),
        },
        toRecipients: [
          {
            emailAddress: {
              address: toEmail,
            },
          },
        ],
      },
      saveToSentItems: true,
    };

    const response = await fetch("https://graph.microsoft.com/v1.0/me/sendMail", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(emailMessage),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Failed to send email: ${response.status} ${error}`);
    }

    const sentMessageId = response.headers.get("message-id") || `sent-${Date.now()}`;
    const conversationId = `conv-${Date.now()}`;

    return {
      messageId: sentMessageId,
      conversationId,
    };
  }

  /**
   * Process individual email send job
   */
  private async processEmailSend(job: any): Promise {
    const { sendId } = job.data as EmailSendJobData;

    console.log(`[EmailSequenceProcessor] Processing send ${sendId} (attempt ${job.attemptsMade + 1})`);

    try {
      const send = await db.query.sequenceEmailSends.findFirst({
        where: eq(sequenceEmailSends.id, sendId),
      });

      if (!send) {
        throw new Error(`Send ${sendId} not found`);
      }

      if (send.status === "sending") {
        console.log(`[EmailSequenceProcessor] Send ${sendId} currently being processed by another worker`);
        return;
      }
      
      if (send.status !== "scheduled" && send.status !== "failed") {
        console.log(`[EmailSequenceProcessor] Send ${sendId} already processed with final status: ${send.status}`);
        return;
      }

      const [contacts, enrollment, step, sequence] = await Promise.all([
        storage.getContactsByIds([send.contactId]),
        db.query.sequenceEnrollments.findFirst({
          where: eq(sequenceEnrollments.id, send.enrollmentId),
        }),
        db.query.sequenceSteps.findFirst({
          where: eq(sequenceSteps.id, send.stepId),
        }),
        db.query.emailSequences.findFirst({
          where: eq(emailSequences.id, send.sequenceId),
        }),
      ]);

      const contact = contacts[0];

      if (!contact) throw new Error(`Contact ${send.contactId} not found`);
      if (!enrollment) throw new Error(`Enrollment ${send.enrollmentId} not found`);
      if (!step) throw new Error(`Step ${send.stepId} not found`);
      if (!sequence) throw new Error(`Sequence ${send.sequenceId} not found`);

      if (enrollment.status !== "active") {
        console.log(`[EmailSequenceProcessor] Enrollment ${enrollment.id} is ${enrollment.status}, skipping`);
        await db.update(sequenceEmailSends)
          .set({
            status: "failed",
            error: `Enrollment is ${enrollment.status}`,
            updatedAt: new Date(),
          })
          .where(eq(sequenceEmailSends.id, sendId));
        return;
      }

      const mailboxAccount = await storage.getMailboxAccountById(sequence.mailboxAccountId);
      if (!mailboxAccount) {
        throw new Error(`Mailbox account ${sequence.mailboxAccountId} not found`);
      }

      const accounts = contact.accountId ? await storage.getAccountsByIds([contact.accountId]) : [];
      const account = accounts[0];

      // Determine email content: use template if specified, otherwise use step's custom content
      let subject = step.subject || '';
      let htmlBody = step.htmlBody || '';
      let textBody = step.textBody || '';
      
      if (step.templateId) {
        const template = await storage.getEmailTemplate(step.templateId);
        if (template && template.isActive) {
          subject = template.subject;
          htmlBody = template.htmlContent;
          textBody = template.plainTextContent || '';
        } else {
          throw new Error(`Template ${step.templateId} not found or inactive`);
        }
      }

      await db.update(sequenceEmailSends)
        .set({
          status: "sending",
          updatedAt: new Date(),
        })
        .where(eq(sequenceEmailSends.id, sendId));

      const accessToken = await this.getValidAccessToken(mailboxAccount);

      // Apply personalization to subject and body
      const personalizedSubject = this.personalizeText(subject, { contact, account });
      const personalizedHtmlBody = this.personalizeText(htmlBody, { contact, account });
      const personalizedTextBody = textBody ? this.personalizeText(textBody, { contact, account }) : undefined;

      // Apply open/click tracking using the sequenceEmailSend ID
      const trackedHtmlBody = emailTrackingService.applyTracking(personalizedHtmlBody, {
        messageId: sendId,
        recipientEmail: contact.email,
      });

      const { messageId, conversationId } = await this.sendEmailViaGraph(
        accessToken,
        contact.email,
        personalizedSubject,
        trackedHtmlBody,
        personalizedTextBody
      );

      const now = new Date();
      await db.update(sequenceEmailSends)
        .set({
          status: "sent",
          messageId,
          conversationId,
          sentAt: now,
          updatedAt: now,
        })
        .where(eq(sequenceEmailSends.id, sendId));

      await db.update(sequenceSteps)
        .set({
          totalSent: step.totalSent + 1,
          updatedAt: now,
        })
        .where(eq(sequenceSteps.id, step.id));

      await db.update(sequenceEnrollments)
        .set({
          currentStepNumber: step.stepNumber,
          lastActivityAt: now,
        })
        .where(eq(sequenceEnrollments.id, enrollment.id));

      console.log(`[EmailSequenceProcessor] Successfully sent email ${sendId} to ${contact.email}`);

    } catch (error: any) {
      console.error(`[EmailSequenceProcessor] Failed to send ${sendId} (attempt ${job.attemptsMade + 1}):`, error);

      await db.update(sequenceEmailSends)
        .set({
          status: "failed",
          error: error.message,
          retryCount: job.attemptsMade + 1,
          messageId: null,
          conversationId: null,
          sentAt: null,
          updatedAt: new Date(),
        })
        .where(eq(sequenceEmailSends.id, sendId));

      throw error;
    }
  }

  /**
   * Schedule emails that are due to be sent
   * Called by cron job every 5 minutes
   */
  async scheduleReadyEmails(): Promise {
    if (!this.queue) {
      console.warn("[EmailSequenceProcessor] Queue not available, skipping scheduling");
      return 0;
    }

    const now = new Date();

    const readyEmails = await db.query.sequenceEmailSends.findMany({
      where: and(
        eq(sequenceEmailSends.status, "scheduled"),
        lte(sequenceEmailSends.scheduledFor, now)
      ),
      limit: 100,
    });

    console.log(`[EmailSequenceProcessor] Found ${readyEmails.length} emails ready to send`);

    for (const email of readyEmails) {
      await this.queue?.add("send-email", { sendId: email.id }, {
        jobId: `send-${email.id}`,
        removeOnComplete: true,
      });
    }

    return readyEmails.length;
  }
}

export const emailSequenceProcessor = new EmailSequenceProcessor();