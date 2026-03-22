/**
 * Client Portal Inbox Routes
 *
 * Full inbox operations for client portal users — mirrors admin /api/inbox routes
 * but scoped by clientAccountId for data isolation.
 *
 * Endpoints:
 *   GET  /messages         — inbox messages (Primary/Other)
 *   GET  /sent             — sent messages
 *   GET  /stats            — unread/total counts per category
 *   GET  /starred          — starred messages
 *   GET  /archived         — archived messages
 *   GET  /trash-messages   — trashed messages
 *   POST /mark-read        — mark message read/unread
 *   POST /toggle-star      — toggle star
 *   POST /move-category    — move Primary <-> Other
 *   POST /mark-all-read    — bulk mark all read in category
 *   POST /archive          — archive message
 *   POST /trash            — soft-delete message
 *   POST /untrash          — restore from trash
 *   DELETE /delete         — permanent delete (from trash only)
 *   POST /empty-trash      — delete all trash
 *   POST /sync             — trigger mailbox sync
 *   POST /send             — send email via connected provider
 *   GET  /settings         — inbox settings
 *   PUT  /settings         — update inbox settings
 *   GET  /mailbox-accounts — list connected mailboxes
 */

import { Router, Request, Response } from "express";
import { z } from "zod";
import { db } from "../db";
import { eq, and } from "drizzle-orm";
import { clientMailboxAccounts } from "@shared/schema";
import {
  getClientInboxMessages,
  getClientSentMessages,
  getClientInboxStats,
  getClientStarredMessages,
  getClientArchivedMessages,
  getClientTrashedMessages,
  markClientMessageAsRead,
  toggleClientMessageStar,
  moveClientMessageCategory,
  markAllClientAsRead,
  archiveClientMessage,
  trashClientMessage,
  untrashClientMessage,
  permanentlyDeleteClientMessage,
  emptyClientTrash,
  syncGoogleMailbox,
  syncMicrosoftMailbox,
  sendViaGoogle,
  sendViaMicrosoft,
  getClientInboxSettings,
  upsertClientInboxSettings,
} from "../lib/client-inbox-service";

const router = Router();

// ==================== Validation Schemas ====================

const inboxQuerySchema = z.object({
  category: z.enum(["primary", "other"]).default("primary"),
  limit: z.coerce.number().min(1).max(100).default(50),
  offset: z.coerce.number().min(0).default(0),
  unreadOnly: z.coerce.boolean().default(false),
  searchQuery: z.string().optional(),
});

const sentQuerySchema = z.object({
  limit: z.coerce.number().min(1).max(100).default(50),
  offset: z.coerce.number().min(0).default(0),
  searchQuery: z.string().optional(),
});

const paginationSchema = z.object({
  limit: z.coerce.number().min(1).max(100).default(50),
  offset: z.coerce.number().min(0).default(0),
});

const messageIdSchema = z.object({
  messageId: z.string().min(1),
});

const markReadSchema = z.object({
  messageId: z.string().min(1),
  isRead: z.boolean(),
});

const moveCategorySchema = z.object({
  messageId: z.string().min(1),
  category: z.enum(["primary", "other"]),
});

const markAllReadSchema = z.object({
  category: z.enum(["primary", "other"]),
});

const sendEmailSchema = z.object({
  to: z.array(z.string().email()).min(1),
  cc: z.array(z.string().email()).optional(),
  subject: z.string().min(1),
  bodyHtml: z.string().min(1),
  mailboxAccountId: z.string().optional(),
});

const settingsSchema = z.object({
  displayDensity: z.enum(["comfortable", "compact", "spacious"]).optional(),
  autoReplyEnabled: z.boolean().optional(),
  autoReplySubject: z.string().max(512).nullable().optional(),
  autoReplyBody: z.string().nullable().optional(),
  notifyNewEmail: z.boolean().optional(),
  notifyDesktop: z.boolean().optional(),
});

// ==================== Messages ====================

router.get("/messages", async (req: Request, res: Response) => {
  try {
    const query = inboxQuerySchema.parse(req.query);
    const clientAccountId = req.clientUser!.clientAccountId;

    const messages = await getClientInboxMessages(clientAccountId, query.category, {
      limit: query.limit,
      offset: query.offset,
      unreadOnly: query.unreadOnly,
      searchQuery: query.searchQuery,
    });

    res.json({ messages, pagination: { limit: query.limit, offset: query.offset } });
  } catch (error) {
    if (error instanceof z.ZodError) return res.status(400).json({ message: "Invalid query", errors: error.errors });
    console.error("[ClientInbox] messages error:", error);
    res.status(500).json({ message: "Failed to fetch messages" });
  }
});

router.get("/sent", async (req: Request, res: Response) => {
  try {
    const query = sentQuerySchema.parse(req.query);
    const clientAccountId = req.clientUser!.clientAccountId;

    const messages = await getClientSentMessages(clientAccountId, {
      limit: query.limit,
      offset: query.offset,
      searchQuery: query.searchQuery,
    });

    res.json({ messages, pagination: { limit: query.limit, offset: query.offset } });
  } catch (error) {
    if (error instanceof z.ZodError) return res.status(400).json({ message: "Invalid query", errors: error.errors });
    console.error("[ClientInbox] sent error:", error);
    res.status(500).json({ message: "Failed to fetch sent messages" });
  }
});

router.get("/stats", async (req: Request, res: Response) => {
  try {
    const stats = await getClientInboxStats(req.clientUser!.clientAccountId);
    res.json({ stats });
  } catch (error) {
    console.error("[ClientInbox] stats error:", error);
    res.status(500).json({ message: "Failed to fetch stats" });
  }
});

router.get("/starred", async (req: Request, res: Response) => {
  try {
    const query = paginationSchema.parse(req.query);
    const messages = await getClientStarredMessages(req.clientUser!.clientAccountId, query);
    res.json({ messages });
  } catch (error) {
    if (error instanceof z.ZodError) return res.status(400).json({ message: "Invalid query", errors: error.errors });
    console.error("[ClientInbox] starred error:", error);
    res.status(500).json({ message: "Failed to fetch starred messages" });
  }
});

router.get("/archived", async (req: Request, res: Response) => {
  try {
    const query = paginationSchema.parse(req.query);
    const messages = await getClientArchivedMessages(req.clientUser!.clientAccountId, query);
    res.json({ messages });
  } catch (error) {
    if (error instanceof z.ZodError) return res.status(400).json({ message: "Invalid query", errors: error.errors });
    console.error("[ClientInbox] archived error:", error);
    res.status(500).json({ message: "Failed to fetch archived messages" });
  }
});

router.get("/trash-messages", async (req: Request, res: Response) => {
  try {
    const query = paginationSchema.parse(req.query);
    const messages = await getClientTrashedMessages(req.clientUser!.clientAccountId, query);
    res.json({ messages });
  } catch (error) {
    if (error instanceof z.ZodError) return res.status(400).json({ message: "Invalid query", errors: error.errors });
    console.error("[ClientInbox] trash list error:", error);
    res.status(500).json({ message: "Failed to fetch trash" });
  }
});

// ==================== Actions ====================

router.post("/mark-read", async (req: Request, res: Response) => {
  try {
    const { messageId, isRead } = markReadSchema.parse(req.body);
    await markClientMessageAsRead(req.clientUser!.clientAccountId, messageId, isRead);
    res.json({ success: true, message: isRead ? "Marked as read" : "Marked as unread" });
  } catch (error) {
    if (error instanceof z.ZodError) return res.status(400).json({ message: "Invalid request", errors: error.errors });
    console.error("[ClientInbox] mark-read error:", error);
    res.status(500).json({ message: "Failed to update message" });
  }
});

router.post("/toggle-star", async (req: Request, res: Response) => {
  try {
    const { messageId } = messageIdSchema.parse(req.body);
    const isStarred = await toggleClientMessageStar(req.clientUser!.clientAccountId, messageId);
    res.json({ success: true, isStarred });
  } catch (error) {
    if (error instanceof z.ZodError) return res.status(400).json({ message: "Invalid request", errors: error.errors });
    console.error("[ClientInbox] toggle-star error:", error);
    res.status(500).json({ message: "Failed to toggle star" });
  }
});

router.post("/move-category", async (req: Request, res: Response) => {
  try {
    const { messageId, category } = moveCategorySchema.parse(req.body);
    await moveClientMessageCategory(req.clientUser!.clientAccountId, messageId, category);
    res.json({ success: true, category });
  } catch (error) {
    if (error instanceof z.ZodError) return res.status(400).json({ message: "Invalid request", errors: error.errors });
    console.error("[ClientInbox] move-category error:", error);
    res.status(500).json({ message: "Failed to move message" });
  }
});

router.post("/mark-all-read", async (req: Request, res: Response) => {
  try {
    const { category } = markAllReadSchema.parse(req.body);
    const count = await markAllClientAsRead(req.clientUser!.clientAccountId, category);
    res.json({ success: true, count });
  } catch (error) {
    if (error instanceof z.ZodError) return res.status(400).json({ message: "Invalid request", errors: error.errors });
    console.error("[ClientInbox] mark-all-read error:", error);
    res.status(500).json({ message: "Failed to mark all as read" });
  }
});

router.post("/archive", async (req: Request, res: Response) => {
  try {
    const { messageId } = messageIdSchema.parse(req.body);
    await archiveClientMessage(req.clientUser!.clientAccountId, messageId);
    res.json({ success: true, message: "Archived" });
  } catch (error) {
    if (error instanceof z.ZodError) return res.status(400).json({ message: "Invalid request", errors: error.errors });
    console.error("[ClientInbox] archive error:", error);
    res.status(500).json({ message: "Failed to archive" });
  }
});

router.post("/trash", async (req: Request, res: Response) => {
  try {
    const { messageId } = messageIdSchema.parse(req.body);
    await trashClientMessage(req.clientUser!.clientAccountId, messageId);
    res.json({ success: true, message: "Trashed" });
  } catch (error) {
    if (error instanceof z.ZodError) return res.status(400).json({ message: "Invalid request", errors: error.errors });
    console.error("[ClientInbox] trash error:", error);
    res.status(500).json({ message: "Failed to trash" });
  }
});

router.post("/untrash", async (req: Request, res: Response) => {
  try {
    const { messageId } = messageIdSchema.parse(req.body);
    await untrashClientMessage(req.clientUser!.clientAccountId, messageId);
    res.json({ success: true, message: "Restored" });
  } catch (error) {
    if (error instanceof z.ZodError) return res.status(400).json({ message: "Invalid request", errors: error.errors });
    console.error("[ClientInbox] untrash error:", error);
    res.status(500).json({ message: "Failed to restore" });
  }
});

router.delete("/delete", async (req: Request, res: Response) => {
  try {
    const { messageId } = messageIdSchema.parse(req.body);
    const deleted = await permanentlyDeleteClientMessage(req.clientUser!.clientAccountId, messageId);
    if (!deleted) return res.status(404).json({ message: "Message not found in trash" });
    res.json({ success: true, message: "Deleted" });
  } catch (error) {
    if (error instanceof z.ZodError) return res.status(400).json({ message: "Invalid request", errors: error.errors });
    console.error("[ClientInbox] delete error:", error);
    res.status(500).json({ message: "Failed to delete" });
  }
});

router.post("/empty-trash", async (req: Request, res: Response) => {
  try {
    const count = await emptyClientTrash(req.clientUser!.clientAccountId);
    res.json({ success: true, count });
  } catch (error) {
    console.error("[ClientInbox] empty-trash error:", error);
    res.status(500).json({ message: "Failed to empty trash" });
  }
});

// ==================== Sync ====================

router.post("/sync", async (req: Request, res: Response) => {
  try {
    const clientAccountId = req.clientUser!.clientAccountId;

    // Find all connected mailboxes for this client
    const mailboxes = await db
      .select()
      .from(clientMailboxAccounts)
      .where(
        and(
          eq(clientMailboxAccounts.clientAccountId, clientAccountId),
          eq(clientMailboxAccounts.status, "connected")
        )
      );

    if (!mailboxes.length) {
      return res.status(400).json({ message: "No connected mailboxes to sync" });
    }

    let totalSynced = 0;
    let totalErrors = 0;
    const results: Array<{ provider: string; synced: number; errors: number }> = [];

    for (const mb of mailboxes) {
      try {
        let result: { synced: number; errors: number };

        if (mb.provider === "google") {
          result = await syncGoogleMailbox(clientAccountId, mb.id);
        } else if (mb.provider === "o365") {
          result = await syncMicrosoftMailbox(clientAccountId, mb.id);
        } else {
          continue; // SMTP doesn't support sync
        }

        totalSynced += result.synced;
        totalErrors += result.errors;
        results.push({ provider: mb.provider, ...result });
      } catch (e: any) {
        console.error(`[ClientInbox] Sync error for ${mb.provider}:`, e.message);
        results.push({ provider: mb.provider, synced: 0, errors: 1 });
        totalErrors++;
      }
    }

    res.json({
      success: true,
      synced: totalSynced,
      errors: totalErrors,
      details: results,
    });
  } catch (error) {
    console.error("[ClientInbox] sync error:", error);
    res.status(500).json({ message: "Failed to sync mailbox" });
  }
});

// ==================== Send ====================

router.post("/send", async (req: Request, res: Response) => {
  try {
    const clientAccountId = req.clientUser!.clientAccountId;
    const data = sendEmailSchema.parse(req.body);

    // Find a connected mailbox to send from
    let mailbox: typeof clientMailboxAccounts.$inferSelect | null = null;

    if (data.mailboxAccountId) {
      const [mb] = await db
        .select()
        .from(clientMailboxAccounts)
        .where(
          and(
            eq(clientMailboxAccounts.id, data.mailboxAccountId),
            eq(clientMailboxAccounts.clientAccountId, clientAccountId),
            eq(clientMailboxAccounts.status, "connected")
          )
        )
        .limit(1);
      mailbox = mb || null;
    }

    // If no specific mailbox, pick the first connected one (prefer google, then o365)
    if (!mailbox) {
      const allMailboxes = await db
        .select()
        .from(clientMailboxAccounts)
        .where(
          and(
            eq(clientMailboxAccounts.clientAccountId, clientAccountId),
            eq(clientMailboxAccounts.status, "connected")
          )
        );

      mailbox =
        allMailboxes.find((m) => m.provider === "google") ||
        allMailboxes.find((m) => m.provider === "o365") ||
        null;
    }

    if (!mailbox) {
      return res.status(400).json({ message: "No connected mailbox available for sending" });
    }

    let externalId: string | null = null;

    if (mailbox.provider === "google") {
      externalId = await sendViaGoogle(
        clientAccountId,
        mailbox.id,
        data.to,
        data.subject,
        data.bodyHtml,
        data.cc
      );
    } else if (mailbox.provider === "o365") {
      externalId = await sendViaMicrosoft(
        clientAccountId,
        mailbox.id,
        data.to,
        data.subject,
        data.bodyHtml,
        data.cc
      );
    } else {
      return res.status(400).json({ message: `Sending via ${mailbox.provider} is not supported` });
    }

    res.json({ success: true, messageId: externalId });
  } catch (error) {
    if (error instanceof z.ZodError) return res.status(400).json({ message: "Invalid email data", errors: error.errors });
    console.error("[ClientInbox] send error:", error);
    res.status(500).json({ message: "Failed to send email" });
  }
});

// ==================== Settings ====================

router.get("/settings", async (req: Request, res: Response) => {
  try {
    const settings = await getClientInboxSettings(req.clientUser!.clientAccountId);
    res.json(settings);
  } catch (error) {
    console.error("[ClientInbox] settings get error:", error);
    res.status(500).json({ message: "Failed to fetch settings" });
  }
});

router.put("/settings", async (req: Request, res: Response) => {
  try {
    const data = settingsSchema.parse(req.body);
    const settings = await upsertClientInboxSettings(req.clientUser!.clientAccountId, data);
    res.json(settings);
  } catch (error) {
    if (error instanceof z.ZodError) return res.status(400).json({ message: "Invalid input", errors: error.errors });
    console.error("[ClientInbox] settings update error:", error);
    res.status(500).json({ message: "Failed to update settings" });
  }
});

// ==================== Mailbox Accounts ====================

router.get("/mailbox-accounts", async (req: Request, res: Response) => {
  try {
    const clientAccountId = req.clientUser!.clientAccountId;

    const mailboxes = await db
      .select({
        id: clientMailboxAccounts.id,
        provider: clientMailboxAccounts.provider,
        status: clientMailboxAccounts.status,
        mailboxEmail: clientMailboxAccounts.mailboxEmail,
        displayName: clientMailboxAccounts.displayName,
        connectedAt: clientMailboxAccounts.connectedAt,
        lastSyncAt: clientMailboxAccounts.lastSyncAt,
      })
      .from(clientMailboxAccounts)
      .where(eq(clientMailboxAccounts.clientAccountId, clientAccountId));

    res.json(mailboxes);
  } catch (error) {
    console.error("[ClientInbox] mailbox-accounts error:", error);
    res.status(500).json({ message: "Failed to fetch mailbox accounts" });
  }
});

export default router;
