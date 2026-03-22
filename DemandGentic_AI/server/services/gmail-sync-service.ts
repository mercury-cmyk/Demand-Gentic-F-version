import CryptoJS from "crypto-js";
import { storage } from "../storage";
import { db } from "../db";
import { dealConversations } from "@shared/schema";
import { eq } from "drizzle-orm";
import type { MailboxAccount } from "@shared/schema";
import { emailTrackingService } from "../lib/email-tracking-service";

const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY || "default-encryption-key-change-in-production";
const GOOGLE_CLIENT_ID = (process.env.GOOGLE_CLIENT_ID ?? process.env.GOOGLE_AUTH_CLIENT_ID ?? "").trim();
const GOOGLE_CLIENT_SECRET = (process.env.GOOGLE_CLIENT_SECRET ?? "").trim();

interface GmailHeader {
  name: string;
  value: string;
}

interface GmailMessagePart {
  filename?: string;
  mimeType?: string;
  body?: {
    attachmentId?: string;
    data?: string;
    size?: number;
  };
  parts?: GmailMessagePart[];
}

interface GmailMessage {
  id: string;
  threadId?: string;
  labelIds?: string[];
  snippet?: string;
  internalDate?: string;
  payload?: {
    headers?: GmailHeader[];
    parts?: GmailMessagePart[];
    filename?: string;
    body?: {
      attachmentId?: string;
      data?: string;
      size?: number;
    };
  };
}

interface GmailMessageListResponse {
  messages?: Array;
  nextPageToken?: string;
}

export class GmailSyncService {
  buildExternalMessageId(mailboxAccountId: string, messageId: string): string {
    return `google:${mailboxAccountId}:${messageId}`;
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

    const params = new URLSearchParams({
      client_id: GOOGLE_CLIENT_ID,
      client_secret: GOOGLE_CLIENT_SECRET,
      refresh_token: refreshToken,
      grant_type: "refresh_token",
    });

    const response = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: params.toString(),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Google token refresh failed: ${error}`);
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

    if (tokenExpiresAt  header.name.toLowerCase() === name.toLowerCase());
    return match?.value || "";
  }

  private parseEmailAddress(value: string): { name: string | null; address: string | null } {
    if (!value) {
      return { name: null, address: null };
    }

    const trimmed = value.trim();
    const match = trimmed.match(/^(?:"?([^"]*)"?\s*)?]+)>$/);
    if (match) {
      return {
        name: match[1]?.trim() || null,
        address: match[2]?.trim() || null,
      };
    }

    return { name: null, address: trimmed };
  }

  private parseEmailList(value: string): Array {
    if (!value) return [];

    return value
      .split(/,(?![^)/)
      .map((part) => part.trim())
      .filter(Boolean)
      .map((part) => {
        const parsed = this.parseEmailAddress(part);
        return {
          name: parsed.name,
          address: parsed.address || part.trim(),
        };
      });
  }

  private hasAttachments(payload?: GmailMessagePart): boolean {
    if (!payload) return false;
    if (payload.filename && payload.filename.trim().length > 0) return true;
    if (payload.body?.attachmentId) return true;
    if (payload.parts) {
      return payload.parts.some((part) => this.hasAttachments(part));
    }
    return false;
  }

  /**
   * Recursively extract HTML (or plain text) body from a Gmail MIME payload.
   * Prefers text/html; falls back to text/plain.
   */
  private extractBodyFromParts(payload?: GmailMessagePart): string | null {
    if (!payload) return null;

    // Single-part message (no sub-parts)
    if (!payload.parts || payload.parts.length === 0) {
      if (payload.body?.data) {
        const decoded = Buffer.from(payload.body.data, "base64url").toString("utf-8");
        return decoded;
      }
      return null;
    }

    // Multi-part: look for text/html first, then text/plain
    let htmlBody: string | null = null;
    let plainBody: string | null = null;

    const walk = (parts: GmailMessagePart[]) => {
      for (const part of parts) {
        if (part.mimeType === "text/html" && part.body?.data && !htmlBody) {
          htmlBody = Buffer.from(part.body.data, "base64url").toString("utf-8");
        } else if (part.mimeType === "text/plain" && part.body?.data && !plainBody) {
          plainBody = Buffer.from(part.body.data, "base64url").toString("utf-8");
        }
        if (part.parts) {
          walk(part.parts);
        }
      }
    };

    walk(payload.parts);
    return htmlBody || plainBody;
  }

  private async fetchMessage(accessToken: string, messageId: string): Promise {
    const response = await fetch(
      `https://gmail.googleapis.com/gmail/v1/users/me/messages/${messageId}?format=full`,
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          Accept: "application/json",
        },
      }
    );

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Gmail message fetch failed: ${response.status} - ${error}`);
    }

    return (await response.json()) as GmailMessage;
  }

  private async fetchMessageList(
    accessToken: string,
    options?: { limit?: number }
  ): Promise {
    const maxResults = options?.limit || 50;
    const url = new URL("https://gmail.googleapis.com/gmail/v1/users/me/messages");
    url.searchParams.set("labelIds", "INBOX");
    url.searchParams.set("maxResults", maxResults.toString());

    const response = await fetch(url, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: "application/json",
      },
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Gmail list fetch failed: ${response.status} - ${error}`);
    }

    return (await response.json()) as GmailMessageListResponse;
  }

  private async createDealMessageForInbox(
    mailboxAccount: MailboxAccount,
    message: GmailMessage
  ): Promise {
    const externalMessageId = this.buildExternalMessageId(mailboxAccount.id, message.id);
    const existing = await storage.getDealMessageByM365Id(externalMessageId);
    if (existing) {
      return;
    }

    const headers = message.payload?.headers || [];
    const fromHeader = this.getHeader(headers, "From");
    const toHeader = this.getHeader(headers, "To");
    const ccHeader = this.getHeader(headers, "Cc");
    const subjectHeader = this.getHeader(headers, "Subject");

    const fromParsed = this.parseEmailAddress(fromHeader);
    const toParsed = this.parseEmailList(toHeader);
    const ccParsed = this.parseEmailList(ccHeader);

    const fromAddress = fromParsed.address || mailboxAccount.mailboxEmail || "";
    const mailboxEmail = mailboxAccount.mailboxEmail || "";
    const direction = fromAddress && mailboxEmail && fromAddress.toLowerCase() === mailboxEmail.toLowerCase()
      ? "outbound"
      : "inbound";

    const participantEmails = [
      fromAddress,
      ...toParsed.map((recipient) => recipient.address),
      ...ccParsed.map((recipient) => recipient.address),
    ]
      .map((email) => email.trim())
      .filter(Boolean);

    const uniqueParticipants = participantEmails.filter((email, index, arr) => arr.indexOf(email) === index);
    const timestamp = message.internalDate ? new Date(Number(message.internalDate)) : new Date();

    // Extract full HTML body from MIME payload
    const bodyContent = this.extractBodyFromParts(message.payload as GmailMessagePart);

    // Thread grouping: reuse existing conversation if same Gmail threadId
    const threadId = message.threadId ? `gmail:${message.threadId}` : null;
    let conversation: { id: string };

    if (threadId) {
      // Look up existing conversation by threadId
      const [existingConv] = await db
        .select()
        .from(dealConversations)
        .where(eq(dealConversations.threadId, threadId))
        .limit(1);

      if (existingConv) {
        conversation = existingConv;
        // Update conversation metadata
        await storage.updateDealConversation(existingConv.id, {
          lastMessageAt: timestamp,
          messageCount: (existingConv.messageCount || 0) + 1,
        });
      } else {
        conversation = await storage.createDealConversation({
          opportunityId: null,
          subject: subjectHeader || "(No Subject)",
          threadId,
          participantEmails: uniqueParticipants,
          messageCount: 1,
          lastMessageAt: timestamp,
          direction,
          status: "active",
        });
      }
    } else {
      conversation = await storage.createDealConversation({
        opportunityId: null,
        subject: subjectHeader || "(No Subject)",
        threadId: null,
        participantEmails: uniqueParticipants,
        messageCount: 1,
        lastMessageAt: timestamp,
        direction,
        status: "active",
      });
    }

    await storage.createDealMessage({
      conversationId: conversation.id,
      opportunityId: null,
      m365MessageId: externalMessageId,
      fromEmail: fromAddress,
      toEmails: toParsed.map((recipient) => recipient.address),
      ccEmails: ccParsed.map((recipient) => recipient.address),
      subject: subjectHeader || "(No Subject)",
      bodyPreview: message.snippet?.substring(0, 500) || null,
      bodyContent,
      direction,
      messageStatus: "delivered",
      sentAt: timestamp,
      receivedAt: timestamp,
      isFromCustomer: direction === "inbound",
      hasAttachments: this.hasAttachments(message.payload),
      importance: "normal",
    });
  }

  async syncEmails(
    mailboxAccountId: string,
    options?: { limit?: number }
  ): Promise {
    const mailboxAccount = await storage.getMailboxAccountById(mailboxAccountId);
    if (!mailboxAccount) {
      throw new Error("Mailbox account not found");
    }

    const accessToken = await this.getValidAccessToken(mailboxAccount);
    const listResponse = await this.fetchMessageList(accessToken, { limit: options?.limit });
    const messages = listResponse.messages || [];

    let synced = 0;
    let errors = 0;

    for (const entry of messages) {
      try {
        const message = await this.fetchMessage(accessToken, entry.id);
        await this.createDealMessageForInbox(mailboxAccount, message);
        synced++;
      } catch (error) {
        console.error(`[GmailSync] Error syncing message ${entry.id}:`, error);
        errors++;
      }
    }

    await storage.updateMailboxAccount(mailboxAccountId, {
      lastSyncAt: new Date(),
    });

    return { synced, errors };
  }

  async syncAllMailboxes(): Promise {
    console.log("[GmailSync] Starting sync for all mailboxes...");

    const mailboxAccounts = await storage.getAllMailboxAccounts("google");
    const total = mailboxAccounts.length;
    let totalSynced = 0;
    let totalErrors = 0;

    if (mailboxAccounts.length === 0) {
      console.log("[GmailSync] No mailbox accounts found");
      return { total, synced: totalSynced, errors: totalErrors };
    }

    console.log(`[GmailSync] Found ${mailboxAccounts.length} mailbox account(s)`);

    for (const mailboxAccount of mailboxAccounts) {
      try {
        console.log(`[GmailSync] Syncing mailbox ${mailboxAccount.mailboxEmail}...`);
        const result = await this.syncEmails(mailboxAccount.id, { limit: 50 });
        totalSynced += result.synced;
        totalErrors += result.errors;
        console.log(`[GmailSync] Synced ${result.synced} emails for ${mailboxAccount.mailboxEmail}`);
      } catch (error) {
        console.error(`[GmailSync] Error syncing mailbox ${mailboxAccount.mailboxEmail}:`, error);
        totalErrors++;
      }
    }

    console.log(`[GmailSync] Sync complete - Total: ${total}, Synced: ${totalSynced}, Errors: ${totalErrors}`);
    return { total, synced: totalSynced, errors: totalErrors };
  }

  async sendEmail(
    mailboxAccountId: string,
    emailData: {
      to: string;
      cc?: string;
      subject: string;
      body: string;
      skipTracking?: boolean;
    }
  ): Promise {
    const mailboxAccount = await storage.getMailboxAccountById(mailboxAccountId);
    if (!mailboxAccount) {
      throw new Error("Mailbox account not found");
    }

    const accessToken = await this.getValidAccessToken(mailboxAccount);

    let trackedBody: string;
    if (emailData.skipTracking) {
      // Body already has tracking applied by caller
      trackedBody = emailData.body;
    } else {
      const trackingMessageId = `sent-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
      // When sending to multiple recipients in a single email (To + CC), we cannot attribute
      // opens to a specific person — use empty string so opens are recorded as unattributed
      // rather than incorrectly attributed to the first To address.
      const toAddresses = emailData.to.split(",").map(e => e.trim()).filter(Boolean);
      const ccAddresses = emailData.cc ? emailData.cc.split(",").map(e => e.trim()).filter(Boolean) : [];
      const allAddresses = [...toAddresses, ...ccAddresses];
      const trackingEmail = allAddresses.length === 1 ? allAddresses[0] : '';
      trackedBody = emailTrackingService.applyTracking(emailData.body, {
        messageId: trackingMessageId,
        recipientEmail: trackingEmail,
      });
    }

    const lines = [
      `To: ${emailData.to}`,
      emailData.cc ? `Cc: ${emailData.cc}` : null,
      `Subject: ${emailData.subject}`,
      "MIME-Version: 1.0",
      "Content-Type: text/html; charset=utf-8",
      "",
      trackedBody,
    ].filter((line): line is string => line !== null);

    const rawMessage = Buffer.from(lines.join("\r\n"))
      .toString("base64")
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=+$/, "");

    const response = await fetch("https://gmail.googleapis.com/gmail/v1/users/me/messages/send", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ raw: rawMessage }),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Failed to send Gmail message: ${error}`);
    }

    const data = (await response.json()) as { id: string };
    return { messageId: data.id };
  }
}

export const gmailSyncService = new GmailSyncService();