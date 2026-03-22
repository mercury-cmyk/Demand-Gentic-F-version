/**
 * Client Portal Inbox Service
 *
 * Provides inbox operations for client portal users, scoped by clientAccountId.
 * Mirrors the admin inbox-service but uses client-specific tables.
 */

import { db } from "../db";
import {
  clientInboxMessages,
  clientMailboxAccounts,
  clientInboxSettings,
  type ClientInboxMessage,
} from "@shared/schema";
import { eq, and, desc, sql, or, asc } from "drizzle-orm";
import CryptoJS from "crypto-js";

const ENCRYPTION_KEY =
  process.env.ENCRYPTION_KEY ||
  process.env.MAILBOX_ENCRYPTION_KEY ||
  process.env.MSFT_OAUTH_CLIENT_SECRET ||
  process.env.M365_CLIENT_SECRET ||
  "";

// ==================== Types ====================

export interface ClientInboxMessageView {
  id: string;
  conversationId: string | null;
  subject: string | null;
  bodyPreview: string | null;
  bodyHtml: string | null;
  from: string | null;
  fromName: string | null;
  to: string[];
  cc: string[];
  receivedDateTime: Date | null;
  hasAttachments: boolean;
  importance: string;
  isRead: boolean;
  isStarred: boolean;
  category: string;
  direction: string;
}

export interface ClientInboxStats {
  category: string;
  unreadCount: number;
  totalCount: number;
}

// ==================== Message Queries ====================

export async function getClientInboxMessages(
  clientAccountId: string,
  category: "primary" | "other" = "primary",
  options: {
    limit?: number;
    offset?: number;
    unreadOnly?: boolean;
    searchQuery?: string;
  } = {}
): Promise<ClientInboxMessageView[]> {
  const { limit = 50, offset = 0, unreadOnly = false, searchQuery } = options;

  const conditions = [
    eq(clientInboxMessages.clientAccountId, clientAccountId),
    eq(clientInboxMessages.category, category),
    eq(clientInboxMessages.isTrashed, false),
    eq(clientInboxMessages.isArchived, false),
    eq(clientInboxMessages.direction, "inbound"),
  ];

  if (unreadOnly) {
    conditions.push(eq(clientInboxMessages.isRead, false));
  }

  if (searchQuery) {
    conditions.push(
      or(
        sql`${clientInboxMessages.subject} ILIKE ${"%" + searchQuery + "%"}`,
        sql`${clientInboxMessages.fromEmail} ILIKE ${"%" + searchQuery + "%"}`,
        sql`${clientInboxMessages.fromName} ILIKE ${"%" + searchQuery + "%"}`,
        sql`${clientInboxMessages.bodyPreview} ILIKE ${"%" + searchQuery + "%"}`
      )!
    );
  }

  const rows = await db
    .select()
    .from(clientInboxMessages)
    .where(and(...conditions))
    .orderBy(desc(clientInboxMessages.receivedAt))
    .limit(limit)
    .offset(offset);

  return rows.map(mapToView);
}

export async function getClientSentMessages(
  clientAccountId: string,
  options: { limit?: number; offset?: number; searchQuery?: string } = {}
): Promise<ClientInboxMessageView[]> {
  const { limit = 50, offset = 0, searchQuery } = options;

  const conditions = [
    eq(clientInboxMessages.clientAccountId, clientAccountId),
    eq(clientInboxMessages.direction, "outbound"),
    eq(clientInboxMessages.isTrashed, false),
  ];

  if (searchQuery) {
    conditions.push(
      or(
        sql`${clientInboxMessages.subject} ILIKE ${"%" + searchQuery + "%"}`,
        sql`${clientInboxMessages.bodyPreview} ILIKE ${"%" + searchQuery + "%"}`
      )!
    );
  }

  const rows = await db
    .select()
    .from(clientInboxMessages)
    .where(and(...conditions))
    .orderBy(desc(clientInboxMessages.sentAt))
    .limit(limit)
    .offset(offset);

  return rows.map(mapToView);
}

export async function getClientInboxStats(
  clientAccountId: string
): Promise<ClientInboxStats[]> {
  const result = await db.execute(sql`
    SELECT
      category,
      COUNT(*) FILTER (WHERE is_read = false AND is_trashed = false AND is_archived = false AND direction = 'inbound') AS unread_count,
      COUNT(*) FILTER (WHERE is_trashed = false AND is_archived = false AND direction = 'inbound') AS total_count
    FROM client_inbox_messages
    WHERE client_account_id = ${clientAccountId}
    GROUP BY category
  `);

  const rows = (result as any).rows ?? result;
  return rows.map((r: any) => ({
    category: r.category,
    unreadCount: Number(r.unread_count || 0),
    totalCount: Number(r.total_count || 0),
  }));
}

export async function getClientStarredMessages(
  clientAccountId: string,
  options: { limit?: number; offset?: number } = {}
): Promise<ClientInboxMessageView[]> {
  const { limit = 50, offset = 0 } = options;

  const rows = await db
    .select()
    .from(clientInboxMessages)
    .where(
      and(
        eq(clientInboxMessages.clientAccountId, clientAccountId),
        eq(clientInboxMessages.isStarred, true),
        eq(clientInboxMessages.isTrashed, false)
      )
    )
    .orderBy(desc(clientInboxMessages.receivedAt))
    .limit(limit)
    .offset(offset);

  return rows.map(mapToView);
}

export async function getClientArchivedMessages(
  clientAccountId: string,
  options: { limit?: number; offset?: number } = {}
): Promise<ClientInboxMessageView[]> {
  const { limit = 50, offset = 0 } = options;

  const rows = await db
    .select()
    .from(clientInboxMessages)
    .where(
      and(
        eq(clientInboxMessages.clientAccountId, clientAccountId),
        eq(clientInboxMessages.isArchived, true),
        eq(clientInboxMessages.isTrashed, false)
      )
    )
    .orderBy(desc(clientInboxMessages.receivedAt))
    .limit(limit)
    .offset(offset);

  return rows.map(mapToView);
}

export async function getClientTrashedMessages(
  clientAccountId: string,
  options: { limit?: number; offset?: number } = {}
): Promise<ClientInboxMessageView[]> {
  const { limit = 50, offset = 0 } = options;

  const rows = await db
    .select()
    .from(clientInboxMessages)
    .where(
      and(
        eq(clientInboxMessages.clientAccountId, clientAccountId),
        eq(clientInboxMessages.isTrashed, true)
      )
    )
    .orderBy(desc(clientInboxMessages.receivedAt))
    .limit(limit)
    .offset(offset);

  return rows.map(mapToView);
}

// ==================== Message Actions ====================

export async function markClientMessageAsRead(
  clientAccountId: string,
  messageId: string,
  isRead: boolean
): Promise<void> {
  await db
    .update(clientInboxMessages)
    .set({ isRead, updatedAt: new Date() })
    .where(
      and(
        eq(clientInboxMessages.id, messageId),
        eq(clientInboxMessages.clientAccountId, clientAccountId)
      )
    );
}

export async function toggleClientMessageStar(
  clientAccountId: string,
  messageId: string
): Promise<boolean> {
  const [msg] = await db
    .select({ isStarred: clientInboxMessages.isStarred })
    .from(clientInboxMessages)
    .where(
      and(
        eq(clientInboxMessages.id, messageId),
        eq(clientInboxMessages.clientAccountId, clientAccountId)
      )
    )
    .limit(1);

  if (!msg) throw new Error("Message not found");

  const newValue = !msg.isStarred;
  await db
    .update(clientInboxMessages)
    .set({ isStarred: newValue, updatedAt: new Date() })
    .where(
      and(
        eq(clientInboxMessages.id, messageId),
        eq(clientInboxMessages.clientAccountId, clientAccountId)
      )
    );

  return newValue;
}

export async function archiveClientMessage(
  clientAccountId: string,
  messageId: string
): Promise<void> {
  await db
    .update(clientInboxMessages)
    .set({ isArchived: true, updatedAt: new Date() })
    .where(
      and(
        eq(clientInboxMessages.id, messageId),
        eq(clientInboxMessages.clientAccountId, clientAccountId)
      )
    );
}

export async function trashClientMessage(
  clientAccountId: string,
  messageId: string
): Promise<void> {
  await db
    .update(clientInboxMessages)
    .set({ isTrashed: true, updatedAt: new Date() })
    .where(
      and(
        eq(clientInboxMessages.id, messageId),
        eq(clientInboxMessages.clientAccountId, clientAccountId)
      )
    );
}

export async function untrashClientMessage(
  clientAccountId: string,
  messageId: string
): Promise<void> {
  await db
    .update(clientInboxMessages)
    .set({ isTrashed: false, updatedAt: new Date() })
    .where(
      and(
        eq(clientInboxMessages.id, messageId),
        eq(clientInboxMessages.clientAccountId, clientAccountId)
      )
    );
}

export async function permanentlyDeleteClientMessage(
  clientAccountId: string,
  messageId: string
): Promise<boolean> {
  const result = await db
    .delete(clientInboxMessages)
    .where(
      and(
        eq(clientInboxMessages.id, messageId),
        eq(clientInboxMessages.clientAccountId, clientAccountId),
        eq(clientInboxMessages.isTrashed, true)
      )
    );

  return (result as any).rowCount > 0;
}

export async function emptyClientTrash(clientAccountId: string): Promise<number> {
  const result = await db
    .delete(clientInboxMessages)
    .where(
      and(
        eq(clientInboxMessages.clientAccountId, clientAccountId),
        eq(clientInboxMessages.isTrashed, true)
      )
    );

  return (result as any).rowCount || 0;
}

export async function markAllClientAsRead(
  clientAccountId: string,
  category: "primary" | "other"
): Promise<number> {
  const result = await db
    .update(clientInboxMessages)
    .set({ isRead: true, updatedAt: new Date() })
    .where(
      and(
        eq(clientInboxMessages.clientAccountId, clientAccountId),
        eq(clientInboxMessages.category, category),
        eq(clientInboxMessages.isRead, false),
        eq(clientInboxMessages.isTrashed, false),
        eq(clientInboxMessages.isArchived, false)
      )
    );

  return (result as any).rowCount || 0;
}

export async function moveClientMessageCategory(
  clientAccountId: string,
  messageId: string,
  category: "primary" | "other"
): Promise<void> {
  await db
    .update(clientInboxMessages)
    .set({ category, updatedAt: new Date() })
    .where(
      and(
        eq(clientInboxMessages.id, messageId),
        eq(clientInboxMessages.clientAccountId, clientAccountId)
      )
    );
}

// ==================== Email Sync ====================

/**
 * Sync emails from connected Google mailbox using Gmail API
 */
export async function syncGoogleMailbox(
  clientAccountId: string,
  mailboxAccountId: string
): Promise<{ synced: number; errors: number }> {
  const [mailbox] = await db
    .select()
    .from(clientMailboxAccounts)
    .where(
      and(
        eq(clientMailboxAccounts.id, mailboxAccountId),
        eq(clientMailboxAccounts.clientAccountId, clientAccountId),
        eq(clientMailboxAccounts.provider, "google"),
        eq(clientMailboxAccounts.status, "connected")
      )
    )
    .limit(1);

  if (!mailbox || !mailbox.accessToken) {
    throw new Error("Google mailbox not connected or missing tokens");
  }

  let accessToken = decryptToken(mailbox.accessToken);

  // Check if token is expired and refresh
  if (mailbox.tokenExpiresAt && new Date(mailbox.tokenExpiresAt) <= new Date()) {
    accessToken = await refreshGoogleAccessToken(mailbox);
  }

  let synced = 0;
  let errors = 0;

  try {
    // Fetch recent messages from Gmail API
    const listRes = await fetch(
      "https://gmail.googleapis.com/gmail/v1/users/me/messages?maxResults=50&q=newer_than:7d",
      { headers: { Authorization: `Bearer ${accessToken}` } }
    );

    if (!listRes.ok) {
      throw new Error(`Gmail list failed: ${listRes.status}`);
    }

    const listData = (await listRes.json()) as {
      messages?: Array<{ id: string; threadId: string }>;
    };

    if (!listData.messages?.length) {
      await updateLastSync(mailboxAccountId);
      return { synced: 0, errors: 0 };
    }

    for (const msg of listData.messages) {
      try {
        // Check if already synced
        const [existing] = await db
          .select({ id: clientInboxMessages.id })
          .from(clientInboxMessages)
          .where(eq(clientInboxMessages.externalMessageId, `gmail:${msg.id}`))
          .limit(1);

        if (existing) continue;

        // Fetch full message
        const msgRes = await fetch(
          `https://gmail.googleapis.com/gmail/v1/users/me/messages/${msg.id}?format=full`,
          { headers: { Authorization: `Bearer ${accessToken}` } }
        );

        if (!msgRes.ok) {
          errors++;
          continue;
        }

        const msgData = (await msgRes.json()) as any;
        const headers = msgData.payload?.headers || [];
        const getHeader = (name: string) =>
          headers.find((h: any) => h.name.toLowerCase() === name.toLowerCase())?.value || null;

        const fromRaw = getHeader("From") || "";
        const fromMatch = fromRaw.match(/^(?:"?([^"]*)"?\s*)?<?([^>]+)>?$/);
        const fromName = fromMatch?.[1]?.trim() || null;
        const fromEmail = fromMatch?.[2]?.trim() || fromRaw;

        const toRaw = getHeader("To") || "";
        const toEmails = toRaw
          .split(",")
          .map((e: string) => e.replace(/.*</, "").replace(/>.*/, "").trim())
          .filter(Boolean);

        const ccRaw = getHeader("Cc") || "";
        const ccEmails = ccRaw
          ? ccRaw
              .split(",")
              .map((e: string) => e.replace(/.*</, "").replace(/>.*/, "").trim())
              .filter(Boolean)
          : [];

        // Determine direction
        const isOutbound =
          fromEmail.toLowerCase() === mailbox.mailboxEmail?.toLowerCase();

        // Get body
        let bodyHtml: string | null = null;
        let bodyPreview: string | null = msgData.snippet || null;
        const parts = msgData.payload?.parts || [];
        for (const part of parts) {
          if (part.mimeType === "text/html" && part.body?.data) {
            bodyHtml = Buffer.from(part.body.data, "base64url").toString("utf-8");
          }
        }
        if (!bodyHtml && msgData.payload?.body?.data) {
          bodyHtml = Buffer.from(
            msgData.payload.body.data,
            "base64url"
          ).toString("utf-8");
        }

        const internalDate = msgData.internalDate
          ? new Date(parseInt(msgData.internalDate))
          : new Date();

        await db.insert(clientInboxMessages).values({
          clientAccountId,
          mailboxAccountId,
          conversationId: msg.threadId,
          externalMessageId: `gmail:${msg.id}`,
          subject: getHeader("Subject"),
          bodyPreview,
          bodyHtml,
          fromEmail,
          fromName,
          toEmails,
          ccEmails,
          direction: isOutbound ? "outbound" : "inbound",
          hasAttachments:
            parts.some(
              (p: any) =>
                p.filename && p.filename.length > 0
            ) || false,
          importance:
            getHeader("Importance")?.toLowerCase() === "high"
              ? "high"
              : "normal",
          isRead: !msgData.labelIds?.includes("UNREAD"),
          category: "primary",
          receivedAt: internalDate,
          sentAt: isOutbound ? internalDate : null,
        });

        synced++;
      } catch (e) {
        errors++;
      }
    }

    await updateLastSync(mailboxAccountId);
  } catch (e) {
    console.error("[ClientInbox] Google sync error:", e);
    throw e;
  }

  return { synced, errors };
}

/**
 * Sync emails from connected Microsoft mailbox using Graph API
 */
export async function syncMicrosoftMailbox(
  clientAccountId: string,
  mailboxAccountId: string
): Promise<{ synced: number; errors: number }> {
  const [mailbox] = await db
    .select()
    .from(clientMailboxAccounts)
    .where(
      and(
        eq(clientMailboxAccounts.id, mailboxAccountId),
        eq(clientMailboxAccounts.clientAccountId, clientAccountId),
        eq(clientMailboxAccounts.provider, "o365"),
        eq(clientMailboxAccounts.status, "connected")
      )
    )
    .limit(1);

  if (!mailbox || !mailbox.accessToken) {
    throw new Error("Microsoft mailbox not connected or missing tokens");
  }

  let accessToken = decryptToken(mailbox.accessToken);

  if (mailbox.tokenExpiresAt && new Date(mailbox.tokenExpiresAt) <= new Date()) {
    accessToken = await refreshMicrosoftAccessToken(mailbox);
  }

  let synced = 0;
  let errors = 0;

  try {
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    const filterDate = sevenDaysAgo.toISOString();

    const listRes = await fetch(
      `https://graph.microsoft.com/v1.0/me/messages?$top=50&$orderby=receivedDateTime desc&$filter=receivedDateTime ge ${filterDate}&$select=id,conversationId,subject,bodyPreview,body,from,toRecipients,ccRecipients,receivedDateTime,hasAttachments,importance,isRead`,
      { headers: { Authorization: `Bearer ${accessToken}` } }
    );

    if (!listRes.ok) {
      throw new Error(`Microsoft messages list failed: ${listRes.status}`);
    }

    const listData = (await listRes.json()) as { value?: any[] };

    if (!listData.value?.length) {
      await updateLastSync(mailboxAccountId);
      return { synced: 0, errors: 0 };
    }

    for (const msg of listData.value) {
      try {
        const externalId = `m365:${msg.id}`;

        const [existing] = await db
          .select({ id: clientInboxMessages.id })
          .from(clientInboxMessages)
          .where(eq(clientInboxMessages.externalMessageId, externalId))
          .limit(1);

        if (existing) continue;

        const fromEmail =
          msg.from?.emailAddress?.address || "";
        const fromName =
          msg.from?.emailAddress?.name || null;

        const toEmails = (msg.toRecipients || []).map(
          (r: any) => r.emailAddress?.address
        ).filter(Boolean);

        const ccEmails = (msg.ccRecipients || []).map(
          (r: any) => r.emailAddress?.address
        ).filter(Boolean);

        const isOutbound =
          fromEmail.toLowerCase() === mailbox.mailboxEmail?.toLowerCase();

        const receivedAt = msg.receivedDateTime
          ? new Date(msg.receivedDateTime)
          : new Date();

        await db.insert(clientInboxMessages).values({
          clientAccountId,
          mailboxAccountId,
          conversationId: msg.conversationId || null,
          externalMessageId: externalId,
          subject: msg.subject || null,
          bodyPreview: msg.bodyPreview || null,
          bodyHtml: msg.body?.contentType === "html" ? msg.body.content : null,
          fromEmail,
          fromName,
          toEmails,
          ccEmails,
          direction: isOutbound ? "outbound" : "inbound",
          hasAttachments: msg.hasAttachments || false,
          importance: msg.importance === "high" ? "high" : "normal",
          isRead: msg.isRead || false,
          category: "primary",
          receivedAt,
          sentAt: isOutbound ? receivedAt : null,
        });

        synced++;
      } catch (e) {
        errors++;
      }
    }

    await updateLastSync(mailboxAccountId);
  } catch (e) {
    console.error("[ClientInbox] Microsoft sync error:", e);
    throw e;
  }

  return { synced, errors };
}

// ==================== Email Send ====================

/**
 * Send an email via the connected Google mailbox
 */
export async function sendViaGoogle(
  clientAccountId: string,
  mailboxAccountId: string,
  to: string[],
  subject: string,
  bodyHtml: string,
  cc?: string[]
): Promise<string | null> {
  const [mailbox] = await db
    .select()
    .from(clientMailboxAccounts)
    .where(
      and(
        eq(clientMailboxAccounts.id, mailboxAccountId),
        eq(clientMailboxAccounts.clientAccountId, clientAccountId),
        eq(clientMailboxAccounts.provider, "google"),
        eq(clientMailboxAccounts.status, "connected")
      )
    )
    .limit(1);

  if (!mailbox || !mailbox.accessToken) {
    throw new Error("Google mailbox not connected");
  }

  let accessToken = decryptToken(mailbox.accessToken);
  if (mailbox.tokenExpiresAt && new Date(mailbox.tokenExpiresAt) <= new Date()) {
    accessToken = await refreshGoogleAccessToken(mailbox);
  }

  const fromLine = mailbox.displayName
    ? `"${mailbox.displayName}" <${mailbox.mailboxEmail}>`
    : mailbox.mailboxEmail;

  const boundary = "boundary_" + Date.now();
  const rawMessage = [
    `From: ${fromLine}`,
    `To: ${to.join(", ")}`,
    ...(cc?.length ? [`Cc: ${cc.join(", ")}`] : []),
    `Subject: ${subject}`,
    `MIME-Version: 1.0`,
    `Content-Type: multipart/alternative; boundary="${boundary}"`,
    "",
    `--${boundary}`,
    `Content-Type: text/html; charset="UTF-8"`,
    "",
    bodyHtml,
    `--${boundary}--`,
  ].join("\r\n");

  const encodedMessage = Buffer.from(rawMessage)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");

  const sendRes = await fetch(
    "https://gmail.googleapis.com/gmail/v1/users/me/messages/send",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ raw: encodedMessage }),
    }
  );

  if (!sendRes.ok) {
    const text = await sendRes.text();
    throw new Error(`Gmail send failed: ${text}`);
  }

  const sendData = (await sendRes.json()) as { id: string; threadId: string };

  // Store sent message locally
  await db.insert(clientInboxMessages).values({
    clientAccountId,
    mailboxAccountId,
    conversationId: sendData.threadId,
    externalMessageId: `gmail:${sendData.id}`,
    subject,
    bodyPreview: bodyHtml.replace(/<[^>]+>/g, "").substring(0, 200),
    bodyHtml,
    fromEmail: mailbox.mailboxEmail,
    fromName: mailbox.displayName,
    toEmails: to,
    ccEmails: cc || [],
    direction: "outbound",
    hasAttachments: false,
    importance: "normal",
    isRead: true,
    category: "primary",
    sentAt: new Date(),
    receivedAt: new Date(),
  });

  return sendData.id;
}

/**
 * Send an email via the connected Microsoft mailbox
 */
export async function sendViaMicrosoft(
  clientAccountId: string,
  mailboxAccountId: string,
  to: string[],
  subject: string,
  bodyHtml: string,
  cc?: string[]
): Promise<string | null> {
  const [mailbox] = await db
    .select()
    .from(clientMailboxAccounts)
    .where(
      and(
        eq(clientMailboxAccounts.id, mailboxAccountId),
        eq(clientMailboxAccounts.clientAccountId, clientAccountId),
        eq(clientMailboxAccounts.provider, "o365"),
        eq(clientMailboxAccounts.status, "connected")
      )
    )
    .limit(1);

  if (!mailbox || !mailbox.accessToken) {
    throw new Error("Microsoft mailbox not connected");
  }

  let accessToken = decryptToken(mailbox.accessToken);
  if (mailbox.tokenExpiresAt && new Date(mailbox.tokenExpiresAt) <= new Date()) {
    accessToken = await refreshMicrosoftAccessToken(mailbox);
  }

  const sendRes = await fetch(
    "https://graph.microsoft.com/v1.0/me/sendMail",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        message: {
          subject,
          body: { contentType: "HTML", content: bodyHtml },
          toRecipients: to.map((email) => ({
            emailAddress: { address: email },
          })),
          ...(cc?.length
            ? {
                ccRecipients: cc.map((email) => ({
                  emailAddress: { address: email },
                })),
              }
            : {}),
        },
        saveToSentItems: true,
      }),
    }
  );

  if (!sendRes.ok) {
    const text = await sendRes.text();
    throw new Error(`Microsoft send failed: ${text}`);
  }

  // Store sent message locally
  await db.insert(clientInboxMessages).values({
    clientAccountId,
    mailboxAccountId,
    subject,
    bodyPreview: bodyHtml.replace(/<[^>]+>/g, "").substring(0, 200),
    bodyHtml,
    fromEmail: mailbox.mailboxEmail,
    fromName: mailbox.displayName,
    toEmails: to,
    ccEmails: cc || [],
    direction: "outbound",
    hasAttachments: false,
    importance: "normal",
    isRead: true,
    category: "primary",
    sentAt: new Date(),
    receivedAt: new Date(),
  });

  return null; // Microsoft sendMail returns 202 with no body
}

// ==================== Settings ====================

export async function getClientInboxSettings(clientAccountId: string) {
  const [settings] = await db
    .select()
    .from(clientInboxSettings)
    .where(eq(clientInboxSettings.clientAccountId, clientAccountId))
    .limit(1);

  return (
    settings || {
      displayDensity: "comfortable",
      autoReplyEnabled: false,
      autoReplySubject: null,
      autoReplyBody: null,
      notifyNewEmail: true,
      notifyDesktop: false,
    }
  );
}

export async function upsertClientInboxSettings(
  clientAccountId: string,
  data: Partial<{
    displayDensity: string;
    autoReplyEnabled: boolean;
    autoReplySubject: string | null;
    autoReplyBody: string | null;
    notifyNewEmail: boolean;
    notifyDesktop: boolean;
  }>
) {
  const [existing] = await db
    .select({ id: clientInboxSettings.id })
    .from(clientInboxSettings)
    .where(eq(clientInboxSettings.clientAccountId, clientAccountId))
    .limit(1);

  if (existing) {
    await db
      .update(clientInboxSettings)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(clientInboxSettings.id, existing.id));
  } else {
    await db.insert(clientInboxSettings).values({
      clientAccountId,
      ...data,
    });
  }

  return getClientInboxSettings(clientAccountId);
}

// ==================== Helpers ====================

function decryptToken(encrypted: string): string {
  const bytes = CryptoJS.AES.decrypt(encrypted, ENCRYPTION_KEY);
  return bytes.toString(CryptoJS.enc.Utf8);
}

function encryptToken(token: string): string {
  return CryptoJS.AES.encrypt(token, ENCRYPTION_KEY).toString();
}

async function updateLastSync(mailboxAccountId: string) {
  await db
    .update(clientMailboxAccounts)
    .set({ lastSyncAt: new Date(), updatedAt: new Date() })
    .where(eq(clientMailboxAccounts.id, mailboxAccountId));
}

async function refreshGoogleAccessToken(
  mailbox: typeof clientMailboxAccounts.$inferSelect
): Promise<string> {
  if (!mailbox.refreshToken) throw new Error("No refresh token");

  const GOOGLE_CLIENT_ID = (
    process.env.GOOGLE_CLIENT_ID ??
    process.env.GOOGLE_AUTH_CLIENT_ID ??
    process.env.GMAIL_CLIENT_ID ??
    ""
  ).trim();
  const GOOGLE_CLIENT_SECRET = (
    process.env.GOOGLE_CLIENT_SECRET ??
    process.env.GMAIL_CLIENT_SECRET ??
    ""
  ).trim();

  const refreshToken = decryptToken(mailbox.refreshToken);

  const params = new URLSearchParams({
    client_id: GOOGLE_CLIENT_ID,
    client_secret: GOOGLE_CLIENT_SECRET,
    refresh_token: refreshToken,
    grant_type: "refresh_token",
  });

  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: params.toString(),
  });

  if (!res.ok) throw new Error("Failed to refresh Google token");

  const data = (await res.json()) as {
    access_token: string;
    expires_in: number;
    refresh_token?: string;
  };

  const newAccessToken = encryptToken(data.access_token);
  const newRefreshToken = data.refresh_token
    ? encryptToken(data.refresh_token)
    : null;

  await db
    .update(clientMailboxAccounts)
    .set({
      accessToken: newAccessToken,
      ...(newRefreshToken ? { refreshToken: newRefreshToken } : {}),
      tokenExpiresAt: new Date(Date.now() + data.expires_in * 1000),
      updatedAt: new Date(),
    })
    .where(eq(clientMailboxAccounts.id, mailbox.id));

  return data.access_token;
}

async function refreshMicrosoftAccessToken(
  mailbox: typeof clientMailboxAccounts.$inferSelect
): Promise<string> {
  if (!mailbox.refreshToken) throw new Error("No refresh token");

  const M365_CLIENT_ID =
    process.env.MICROSOFT_CLIENT_ID ??
    process.env.MSFT_OAUTH_CLIENT_ID ??
    process.env.M365_CLIENT_ID ??
    "";
  const M365_CLIENT_SECRET =
    process.env.MICROSOFT_CLIENT_SECRET ??
    process.env.MSFT_OAUTH_CLIENT_SECRET ??
    process.env.M365_CLIENT_SECRET ??
    "";
  const M365_TENANT_ID =
    process.env.MICROSOFT_TENANT_ID ??
    process.env.MSFT_OAUTH_TENANT_ID ??
    process.env.M365_TENANT_ID ??
    "common";

  const refreshToken = decryptToken(mailbox.refreshToken);

  const params = new URLSearchParams({
    client_id: M365_CLIENT_ID,
    scope: "offline_access Mail.Read Mail.ReadBasic Mail.ReadWrite Mail.Send",
    refresh_token: refreshToken,
    grant_type: "refresh_token",
  });

  if (M365_CLIENT_SECRET) {
    params.set("client_secret", M365_CLIENT_SECRET);
  }

  const res = await fetch(
    `https://login.microsoftonline.com/${M365_TENANT_ID}/oauth2/v2.0/token`,
    {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: params.toString(),
    }
  );

  if (!res.ok) throw new Error("Failed to refresh Microsoft token");

  const data = (await res.json()) as {
    access_token: string;
    expires_in: number;
    refresh_token?: string;
  };

  const newAccessToken = encryptToken(data.access_token);
  const newRefreshToken = data.refresh_token
    ? encryptToken(data.refresh_token)
    : null;

  await db
    .update(clientMailboxAccounts)
    .set({
      accessToken: newAccessToken,
      ...(newRefreshToken ? { refreshToken: newRefreshToken } : {}),
      tokenExpiresAt: new Date(Date.now() + data.expires_in * 1000),
      updatedAt: new Date(),
    })
    .where(eq(clientMailboxAccounts.id, mailbox.id));

  return data.access_token;
}

function mapToView(row: ClientInboxMessage): ClientInboxMessageView {
  return {
    id: row.id,
    conversationId: row.conversationId,
    subject: row.subject,
    bodyPreview: row.bodyPreview,
    bodyHtml: row.bodyHtml,
    from: row.fromEmail,
    fromName: row.fromName,
    to: row.toEmails || [],
    cc: row.ccEmails || [],
    receivedDateTime: row.receivedAt,
    hasAttachments: row.hasAttachments || false,
    importance: row.importance || "normal",
    isRead: row.isRead || false,
    isStarred: row.isStarred || false,
    category: row.category || "primary",
    direction: row.direction,
  };
}
