import { Router } from "express";
import { requireAuth } from "../auth";
import { apiLimiter } from "../middleware/security";
import {
  getInboxMessages,
  getSentMessages,
  getInboxStats,
  markMessageAsRead,
  toggleMessageStar,
  moveMessageToCategory,
  markAllAsRead,
  archiveMessage,
  trashMessage,
  untrashMessage,
  permanentlyDeleteMessage,
  getTrashedMessages,
  emptyTrash,
  getStarredMessages,
  getArchivedMessages,
  type InboxMessage,
  type InboxStats
} from "../lib/inbox-service";
import { db } from "../db";
import { contacts, dealMessages } from "@shared/schema";
import { sql } from "drizzle-orm";
import { z } from "zod";

const router = Router();

// Validation schemas
const inboxQuerySchema = z.object({
  category: z.enum(['primary', 'other']).default('primary'),
  limit: z.coerce.number().min(1).max(100).default(50),
  offset: z.coerce.number().min(0).default(0),
  unreadOnly: z.coerce.boolean().default(false),
  searchQuery: z.string().optional()
});

const sentQuerySchema = z.object({
  limit: z.coerce.number().min(1).max(100).default(50),
  offset: z.coerce.number().min(0).default(0),
  searchQuery: z.string().optional()
});

const markReadSchema = z.object({
  messageId: z.string().uuid(),
  isRead: z.boolean()
});

const toggleStarSchema = z.object({
  messageId: z.string().uuid()
});

const moveCategorySchema = z.object({
  messageId: z.string().uuid(),
  category: z.enum(['primary', 'other'])
});

const markAllReadSchema = z.object({
  category: z.enum(['primary', 'other'])
});

const archiveSchema = z.object({
  messageId: z.string().uuid()
});

/**
 * GET /api/inbox/messages
 * Fetch inbox messages with categorization (Primary/Other)
 */
router.get('/messages', requireAuth, apiLimiter, async (req, res) => {
  try {
    const query = inboxQuerySchema.parse(req.query);
    const userId = req.user!.userId;

    const messages = await getInboxMessages(userId, query.category, {
      limit: query.limit,
      offset: query.offset,
      unreadOnly: query.unreadOnly,
      searchQuery: query.searchQuery
    });

    res.json({
      messages,
      pagination: {
        limit: query.limit,
        offset: query.offset
      }
    });
  } catch (error) {
    console.error('[INBOX] Error fetching messages:', error);
    if (error instanceof z.ZodError) {
      return res.status(400).json({ message: 'Invalid query parameters', errors: error.errors });
    }
    res.status(500).json({ message: 'Failed to fetch inbox messages' });
  }
});

/**
 * GET /api/inbox/sent
 * Fetch sent messages from scheduled_emails table
 */
router.get('/sent', requireAuth, apiLimiter, async (req, res) => {
  try {
    const query = sentQuerySchema.parse(req.query);
    const userId = req.user!.userId;

    const messages = await getSentMessages(userId, {
      limit: query.limit,
      offset: query.offset,
      searchQuery: query.searchQuery
    });

    res.json({
      messages,
      pagination: {
        limit: query.limit,
        offset: query.offset
      }
    });
  } catch (error) {
    console.error('[INBOX] Error fetching sent messages:', error);
    if (error instanceof z.ZodError) {
      return res.status(400).json({ message: 'Invalid query parameters', errors: error.errors });
    }
    res.status(500).json({ message: 'Failed to fetch sent messages' });
  }
});

/**
 * GET /api/inbox/stats
 * Get inbox statistics (unread counts per category)
 */
router.get('/stats', requireAuth, apiLimiter, async (req, res) => {
  try {
    const userId = req.user!.userId;
    const stats = await getInboxStats(userId);

    res.json({ stats });
  } catch (error) {
    console.error('[INBOX] Error fetching stats:', error);
    res.status(500).json({ message: 'Failed to fetch inbox stats' });
  }
});

/**
 * POST /api/inbox/mark-read
 * Mark message as read/unread
 */
router.post('/mark-read', requireAuth, apiLimiter, async (req, res) => {
  try {
    const { messageId, isRead } = markReadSchema.parse(req.body);
    const userId = req.user!.userId;

    await markMessageAsRead(userId, messageId, isRead);

    res.json({ 
      success: true,
      message: isRead ? 'Message marked as read' : 'Message marked as unread'
    });
  } catch (error) {
    console.error('[INBOX] Error marking message:', error);
    if (error instanceof z.ZodError) {
      return res.status(400).json({ message: 'Invalid request', errors: error.errors });
    }
    res.status(500).json({ message: 'Failed to update message status' });
  }
});

/**
 * POST /api/inbox/toggle-star
 * Toggle star on message
 */
router.post('/toggle-star', requireAuth, apiLimiter, async (req, res) => {
  try {
    const { messageId } = toggleStarSchema.parse(req.body);
    const userId = req.user!.userId;

    const isStarred = await toggleMessageStar(userId, messageId);

    res.json({ 
      success: true,
      isStarred,
      message: isStarred ? 'Message starred' : 'Message unstarred'
    });
  } catch (error) {
    console.error('[INBOX] Error toggling star:', error);
    if (error instanceof z.ZodError) {
      return res.status(400).json({ message: 'Invalid request', errors: error.errors });
    }
    res.status(500).json({ message: 'Failed to toggle star' });
  }
});

/**
 * POST /api/inbox/move-category
 * Move message between Primary and Other
 */
router.post('/move-category', requireAuth, apiLimiter, async (req, res) => {
  try {
    const { messageId, category } = moveCategorySchema.parse(req.body);
    const userId = req.user!.userId;

    await moveMessageToCategory(userId, messageId, category);

    res.json({ 
      success: true,
      category,
      message: `Message moved to ${category === 'primary' ? 'Primary' : 'Other'}`
    });
  } catch (error) {
    console.error('[INBOX] Error moving message:', error);
    if (error instanceof z.ZodError) {
      return res.status(400).json({ message: 'Invalid request', errors: error.errors });
    }
    res.status(500).json({ message: 'Failed to move message' });
  }
});

/**
 * POST /api/inbox/mark-all-read
 * Bulk mark all messages as read in a category
 */
router.post('/mark-all-read', requireAuth, apiLimiter, async (req, res) => {
  try {
    const { category } = markAllReadSchema.parse(req.body);
    const userId = req.user!.userId;

    const count = await markAllAsRead(userId, category);

    res.json({ 
      success: true,
      count,
      message: `${count} messages marked as read`
    });
  } catch (error) {
    console.error('[INBOX] Error marking all as read:', error);
    if (error instanceof z.ZodError) {
      return res.status(400).json({ message: 'Invalid request', errors: error.errors });
    }
    res.status(500).json({ message: 'Failed to mark all as read' });
  }
});

/**
 * POST /api/inbox/archive
 * Archive message
 */
router.post('/archive', requireAuth, apiLimiter, async (req, res) => {
  try {
    const { messageId } = archiveSchema.parse(req.body);
    const userId = req.user!.userId;

    await archiveMessage(userId, messageId);

    res.json({ 
      success: true,
      message: 'Message archived'
    });
  } catch (error) {
    console.error('[INBOX] Error archiving message:', error);
    if (error instanceof z.ZodError) {
      return res.status(400).json({ message: 'Invalid request', errors: error.errors });
    }
    res.status(500).json({ message: 'Failed to archive message' });
  }
});

const trashSchema = z.object({
  messageId: z.string().uuid()
});

const paginationSchema = z.object({
  limit: z.coerce.number().min(1).max(100).default(50),
  offset: z.coerce.number().min(0).default(0),
});

/**
 * POST /api/inbox/trash
 * Move message to trash (soft-delete)
 */
router.post('/trash', requireAuth, apiLimiter, async (req, res) => {
  try {
    const { messageId } = trashSchema.parse(req.body);
    await trashMessage(req.user!.userId, messageId);
    res.json({ success: true, message: 'Message moved to trash' });
  } catch (error) {
    if (error instanceof z.ZodError)
      return res.status(400).json({ message: 'Invalid request', errors: error.errors });
    console.error('[INBOX] trash error:', error);
    res.status(500).json({ message: 'Failed to trash message' });
  }
});

/**
 * POST /api/inbox/untrash
 * Restore message from trash
 */
router.post('/untrash', requireAuth, apiLimiter, async (req, res) => {
  try {
    const { messageId } = trashSchema.parse(req.body);
    await untrashMessage(req.user!.userId, messageId);
    res.json({ success: true, message: 'Message restored from trash' });
  } catch (error) {
    if (error instanceof z.ZodError)
      return res.status(400).json({ message: 'Invalid request', errors: error.errors });
    console.error('[INBOX] untrash error:', error);
    res.status(500).json({ message: 'Failed to restore message' });
  }
});

/**
 * DELETE /api/inbox/delete
 * Permanently delete a trashed message
 */
router.delete('/delete', requireAuth, apiLimiter, async (req, res) => {
  try {
    const { messageId } = trashSchema.parse(req.body);
    const deleted = await permanentlyDeleteMessage(req.user!.userId, messageId);
    if (!deleted) return res.status(404).json({ message: 'Message not found in trash' });
    res.json({ success: true, message: 'Message permanently deleted' });
  } catch (error) {
    if (error instanceof z.ZodError)
      return res.status(400).json({ message: 'Invalid request', errors: error.errors });
    console.error('[INBOX] permanent delete error:', error);
    res.status(500).json({ message: 'Failed to delete message' });
  }
});

/**
 * GET /api/inbox/trash-messages
 * List trashed messages
 */
router.get('/trash-messages', requireAuth, apiLimiter, async (req, res) => {
  try {
    const query = paginationSchema.parse(req.query);
    const messages = await getTrashedMessages(req.user!.userId, query);
    res.json({ messages });
  } catch (error) {
    if (error instanceof z.ZodError)
      return res.status(400).json({ message: 'Invalid query', errors: error.errors });
    console.error('[INBOX] list trash error:', error);
    res.status(500).json({ message: 'Failed to fetch trashed messages' });
  }
});

/**
 * POST /api/inbox/empty-trash
 * Delete all trashed messages
 */
router.post('/empty-trash', requireAuth, apiLimiter, async (req, res) => {
  try {
    const count = await emptyTrash(req.user!.userId);
    res.json({ success: true, count, message: `${count} messages permanently deleted` });
  } catch (error) {
    console.error('[INBOX] empty trash error:', error);
    res.status(500).json({ message: 'Failed to empty trash' });
  }
});

/**
 * GET /api/inbox/starred
 * Fetch starred messages
 */
router.get('/starred', requireAuth, apiLimiter, async (req, res) => {
  try {
    const query = paginationSchema.parse(req.query);
    const messages = await getStarredMessages(req.user!.userId, query);
    res.json({ messages });
  } catch (error) {
    if (error instanceof z.ZodError)
      return res.status(400).json({ message: 'Invalid query', errors: error.errors });
    console.error('[INBOX] starred error:', error);
    res.status(500).json({ message: 'Failed to fetch starred messages' });
  }
});

/**
 * GET /api/inbox/archived
 * Fetch archived messages
 */
router.get('/archived', requireAuth, apiLimiter, async (req, res) => {
  try {
    const query = paginationSchema.parse(req.query);
    const messages = await getArchivedMessages(req.user!.userId, query);
    res.json({ messages });
  } catch (error) {
    if (error instanceof z.ZodError)
      return res.status(400).json({ message: 'Invalid query', errors: error.errors });
    console.error('[INBOX] archived error:', error);
    res.status(500).json({ message: 'Failed to fetch archived messages' });
  }
});

/**
 * GET /api/inbox/contacts/autocomplete?q=
 * Search contacts by name or email, plus past conversation recipients (top 10)
 */
router.get('/contacts/autocomplete', requireAuth, apiLimiter, async (req, res) => {
  try {
    const q = z.string().min(1).max(100).parse(req.query.q);
    const pattern = `%${q}%`;

    // Search contacts table
    const contactResults = await db
      .select({
        id: contacts.id,
        fullName: contacts.fullName,
        firstName: contacts.firstName,
        lastName: contacts.lastName,
        email: contacts.email,
        jobTitle: contacts.jobTitle,
      })
      .from(contacts)
      .where(
        sql`(${contacts.fullName} ILIKE ${pattern} OR ${contacts.email} ILIKE ${pattern} OR ${contacts.firstName} ILIKE ${pattern} OR ${contacts.lastName} ILIKE ${pattern})`
      )
      .limit(10);

    // Search past conversation recipients from dealMessages (toEmails + ccEmails arrays)
    const conversationEmails = await db.execute(sql`
      SELECT DISTINCT unnested_email AS email
      FROM (
        SELECT unnest(${dealMessages.toEmails}) AS unnested_email FROM ${dealMessages}
        UNION
        SELECT unnest(${dealMessages.ccEmails}) AS unnested_email FROM ${dealMessages}
      ) AS all_emails
      WHERE unnested_email ILIKE ${pattern}
      LIMIT 10
    `);

    // Merge and deduplicate by email
    const seenEmails = new Set();
    const merged: Array = [];

    for (const c of contactResults) {
      if (c.email && !seenEmails.has(c.email.toLowerCase())) {
        seenEmails.add(c.email.toLowerCase());
        merged.push({
          id: c.id,
          fullName: c.fullName,
          email: c.email,
          jobTitle: c.jobTitle,
          source: 'contact',
        });
      }
    }

    const convRows = (conversationEmails as any).rows ?? conversationEmails;
    for (const row of convRows) {
      const email = row.email as string;
      if (email && !seenEmails.has(email.toLowerCase())) {
        seenEmails.add(email.toLowerCase());
        merged.push({
          id: null,
          fullName: null,
          email,
          jobTitle: null,
          source: 'conversation',
        });
      }
    }

    res.json({ contacts: merged.slice(0, 10) });
  } catch (error) {
    if (error instanceof z.ZodError)
      return res.status(400).json({ message: 'Query parameter q is required' });
    console.error('[INBOX] autocomplete error:', error);
    res.status(500).json({ message: 'Failed to search contacts' });
  }
});

export default router;