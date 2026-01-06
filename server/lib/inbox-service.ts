import { db } from "../db";
import { 
  inboxCategories, 
  dealMessages, 
  dealConversations,
  pipelineOpportunities,
  accounts, 
  contacts,
  users,
  scheduledEmails,
  mailboxAccounts,
  type InboxCategory,
  type InsertInboxCategory
} from "@shared/schema";
import { eq, and, desc, sql, or, inArray } from "drizzle-orm";

/**
 * Enterprise Inbox Categorization Service
 * 
 * Provides dual-inbox (Primary/Other) categorization logic with:
 * - Automatic categorization based on sender importance
 * - Read/unread tracking per user
 * - Unread count queries
 * - Bulk operations (mark all read, archive, etc)
 * - Search and filtering
 */

export interface InboxMessage {
  id: string;
  conversationId: string;
  subject: string;
  bodyPreview: string;
  bodyHtml: string | null;
  from: string;
  fromName: string | null;
  to: string[];
  cc: string[];
  receivedDateTime: Date;
  hasAttachments: boolean;
  importance: string;
  isRead: boolean;
  isStarred: boolean;
  category: 'primary' | 'other';
  accountId: string | null;
  accountName: string | null;
  contactId: string | null;
  contactName: string | null;
  opportunityId: string | null;
}

export interface InboxStats {
  category: 'primary' | 'other';
  unreadCount: number;
  totalCount: number;
}

/**
 * Determine if an email should be categorized as Primary
 * 
 * Primary criteria (more inclusive):
 * - From a known contact in CRM
 * - From a known account domain
 * - Part of an active opportunity
 * - Direct business emails (not bulk/marketing)
 * - From frequent senders
 * 
 * Other criteria:
 * - Bulk/marketing emails
 * - Automated notifications
 * - Low-priority domains
 */
export async function categorizePrimaryOther(
  messageId: string,
  fromEmail: string,
  accountId: string | null,
  contactId: string | null,
  opportunityId: string | null
): Promise<'primary' | 'other'> {
  // Primary if linked to CRM entities (from conversation)
  if (contactId || accountId || opportunityId) {
    return 'primary';
  }

  // Primary if from a known domain in accounts
  const domain = fromEmail.split('@')[1]?.toLowerCase();
  if (!domain) {
    return 'other'; // Invalid email
  }

  // Check if from a known account domain
  const knownAccount = await db
    .select({ id: accounts.id })
    .from(accounts)
    .where(
      or(
        sql`LOWER(${accounts.domain}) = ${domain}`,
        sql`LOWER(${accounts.websiteDomain}) = ${domain}`
      )
    )
    .limit(1);
  
  if (knownAccount.length > 0) {
    return 'primary';
  }

  // Check if sender has sent previous emails (frequent sender)
  const previousEmails = await db
    .select({ id: dealMessages.id })
    .from(dealMessages)
    .where(
      and(
        sql`LOWER(${dealMessages.fromEmail}) = ${fromEmail.toLowerCase()}`,
        eq(dealMessages.direction, 'inbound')
      )
    )
    .limit(2); // If 2+ emails from this sender, likely important

  if (previousEmails.length >= 2) {
    return 'primary';
  }

  // Categorize as Other if it matches common marketing/notification patterns
  const marketingPatterns = [
    'noreply@',
    'no-reply@',
    'donotreply@',
    'notification@',
    'notifications@',
    'news@',
    'newsletter@',
    'marketing@',
    'promo@',
    'promotions@',
    'updates@',
    'support@',
    'hello@',
    'info@'
  ];

  const emailLower = fromEmail.toLowerCase();
  for (const pattern of marketingPatterns) {
    if (emailLower.startsWith(pattern)) {
      return 'other';
    }
  }

  // Default to Primary for direct business emails
  // This is more inclusive - assume business emails are primary unless proven otherwise
  return 'primary';
}

/**
 * Get or create inbox category for a message and user
 */
export async function getOrCreateInboxCategory(
  userId: string,
  messageId: string,
  defaultCategory: 'primary' | 'other' = 'other'
): Promise<InboxCategory> {
  // Check if category exists
  const existing = await db
    .select()
    .from(inboxCategories)
    .where(
      and(
        eq(inboxCategories.userId, userId),
        eq(inboxCategories.messageId, messageId)
      )
    )
    .limit(1);

  if (existing.length > 0) {
    return existing[0];
  }

  // Create new category
  const [created] = await db
    .insert(inboxCategories)
    .values({
      userId,
      messageId,
      category: defaultCategory,
      isRead: false,
      isStarred: false,
      isArchived: false
    })
    .returning();

  return created;
}

/**
 * Fetch inbox messages with categorization
 * 
 * Auto-categorizes new messages on first fetch using categorizePrimaryOther logic
 */
export async function getInboxMessages(
  userId: string,
  category: 'primary' | 'other',
  options: {
    limit?: number;
    offset?: number;
    unreadOnly?: boolean;
    searchQuery?: string;
  } = {}
): Promise<InboxMessage[]> {
  const { limit = 50, offset = 0, unreadOnly = false, searchQuery } = options;

  // Fetch all inbound messages with CRM data
  const results = await db
    .select({
      message: dealMessages,
      category: inboxCategories,
      conversation: dealConversations,
      opportunity: pipelineOpportunities,
      account: accounts,
      contact: contacts
    })
    .from(dealMessages)
    .leftJoin(
      inboxCategories,
      and(
        eq(inboxCategories.messageId, dealMessages.id),
        eq(inboxCategories.userId, userId)
      )
    )
    .leftJoin(dealConversations, eq(dealConversations.id, dealMessages.conversationId))
    .leftJoin(pipelineOpportunities, eq(pipelineOpportunities.id, dealConversations.opportunityId))
    .leftJoin(accounts, eq(accounts.id, pipelineOpportunities.accountId))
    .leftJoin(contacts, eq(contacts.id, pipelineOpportunities.contactId))
    .where(
      and(
        eq(dealMessages.direction, 'inbound'),
        searchQuery
          ? or(
              sql`${dealMessages.subject} ILIKE ${`%${searchQuery}%`}`,
              sql`${dealMessages.bodyPreview} ILIKE ${`%${searchQuery}%`}`,
              sql`${dealMessages.fromEmail} ILIKE ${`%${searchQuery}%`}`
            )
          : undefined
      )
    )
    .orderBy(desc(dealMessages.receivedAt))
    .limit(limit * 2) // Fetch more to ensure we have enough after filtering
    .offset(offset);

  // Auto-categorize uncategorized messages
  const categorizedResults = await Promise.all(
    results.map(async ({ message, category: cat, conversation, opportunity, account, contact }) => {
      let finalCategory = cat;
      
      // If no category exists, auto-categorize and persist
      if (!cat) {
        const detectedCategory = await categorizePrimaryOther(
          message.id,
          message.fromEmail,
          opportunity?.accountId ?? null,
          opportunity?.contactId ?? null,
          message.opportunityId || conversation?.opportunityId || null
        );
        
        // Create inbox category record
        const [created] = await db
          .insert(inboxCategories)
          .values({
            userId,
            messageId: message.id,
            category: detectedCategory,
            isRead: false,
            isStarred: false,
            isArchived: false
          })
          .onConflictDoNothing()
          .returning();
        
        finalCategory = created || { category: detectedCategory, isRead: false, isStarred: false, isArchived: false, readAt: null };
      }

      return {
        message,
        category: finalCategory,
        conversation,
        opportunity,
        account,
        contact
      };
    })
  );

  // Filter by requested category and unread status, then limit
  const filtered = categorizedResults
    .filter(({ category: cat }) => {
      if (!cat) return false; // Skip if no category
      if (cat.category !== category) return false;
      if (unreadOnly && cat.isRead) return false;
      return true;
    })
    .slice(0, limit);

  return filtered.map(({ message, category: cat, conversation, opportunity, account, contact }) => ({
    id: message.id,
    conversationId: message.conversationId,
    subject: message.subject || '(No Subject)',
    bodyPreview: message.bodyPreview || '',
    bodyHtml: message.bodyContent, // Using bodyContent as HTML
    from: message.fromEmail,
    fromName: contact ? `${contact.firstName} ${contact.lastName}`.trim() : null,
    to: message.toEmails,
    cc: message.ccEmails || [],
    receivedDateTime: message.receivedAt || message.sentAt || new Date(),
    hasAttachments: message.hasAttachments || false,
    importance: message.importance || 'normal',
    isRead: cat?.isRead ?? false,
    isStarred: cat?.isStarred ?? false,
    category: (cat?.category as 'primary' | 'other') ?? category,
    accountId: opportunity?.accountId ?? null,
    accountName: account?.name ?? null,
    contactId: opportunity?.contactId ?? null,
    contactName: contact ? `${contact.firstName} ${contact.lastName}`.trim() : null,
    opportunityId: message.opportunityId || conversation?.opportunityId || null
  }));
}

/**
 * Fetch sent messages from scheduled_emails table
 * 
 * Returns emails that have been successfully sent
 */
export async function getSentMessages(
  userId: string,
  options: {
    limit?: number;
    offset?: number;
    searchQuery?: string;
  } = {}
): Promise<InboxMessage[]> {
  const { limit = 50, offset = 0, searchQuery } = options;

  // Fetch user's mailbox accounts
  const userMailboxes = await db
    .select({ id: mailboxAccounts.id })
    .from(mailboxAccounts)
    .where(eq(mailboxAccounts.userId, userId));

  const mailboxIds = userMailboxes.map(m => m.id);
  
  if (mailboxIds.length === 0) {
    return [];
  }

  // Fetch sent emails with CRM data
  const results = await db
    .select({
      email: scheduledEmails,
      account: accounts,
      contact: contacts
    })
    .from(scheduledEmails)
    .leftJoin(accounts, eq(accounts.id, scheduledEmails.accountId))
    .leftJoin(contacts, eq(contacts.id, scheduledEmails.contactId))
    .where(
      and(
        inArray(scheduledEmails.mailboxAccountId, mailboxIds),
        eq(scheduledEmails.status, 'sent'),
        searchQuery
          ? or(
              sql`${scheduledEmails.subject} ILIKE ${`%${searchQuery}%`}`,
              sql`${scheduledEmails.bodyPlain} ILIKE ${`%${searchQuery}%`}`,
              sql`${scheduledEmails.fromEmail} ILIKE ${`%${searchQuery}%`}`
            )
          : undefined
      )
    )
    .orderBy(desc(scheduledEmails.sentAt))
    .limit(limit)
    .offset(offset);

  return results.map(({ email, account, contact }) => ({
    id: email.id,
    conversationId: email.id, // Use email ID as conversation ID for sent emails
    subject: email.subject || '(No Subject)',
    bodyPreview: email.bodyPlain?.substring(0, 200) || '',
    bodyHtml: email.bodyHtml,
    from: email.fromEmail,
    fromName: null,
    to: email.toEmails,
    cc: email.ccEmails || [],
    receivedDateTime: email.sentAt || email.createdAt,
    hasAttachments: (email.attachments as any[])?.length > 0 || false,
    importance: 'normal',
    isRead: true, // Sent emails are always "read"
    isStarred: false,
    category: 'primary' as const, // Sent emails default to primary
    accountId: email.accountId,
    accountName: account?.name ?? null,
    contactId: email.contactId,
    contactName: contact ? `${contact.firstName} ${contact.lastName}`.trim() : null,
    opportunityId: email.opportunityId
  }));
}

/**
 * Get inbox statistics (unread counts per category)
 */
export async function getInboxStats(userId: string): Promise<InboxStats[]> {
  const stats = await db
    .select({
      category: inboxCategories.category,
      unreadCount: sql<number>`COUNT(*) FILTER (WHERE ${inboxCategories.isRead} = false)`,
      totalCount: sql<number>`COUNT(*)`
    })
    .from(inboxCategories)
    .where(
      and(
        eq(inboxCategories.userId, userId),
        eq(inboxCategories.isArchived, false)
      )
    )
    .groupBy(inboxCategories.category);

  return stats.map(stat => ({
    category: stat.category as 'primary' | 'other',
    unreadCount: Number(stat.unreadCount),
    totalCount: Number(stat.totalCount)
  }));
}

/**
 * Mark message as read/unread
 */
export async function markMessageAsRead(
  userId: string,
  messageId: string,
  isRead: boolean
): Promise<void> {
  // Get or create category
  await getOrCreateInboxCategory(userId, messageId);

  // Update read status
  await db
    .update(inboxCategories)
    .set({
      isRead,
      readAt: isRead ? new Date() : null,
      updatedAt: new Date()
    })
    .where(
      and(
        eq(inboxCategories.userId, userId),
        eq(inboxCategories.messageId, messageId)
      )
    );
}

/**
 * Toggle star on message
 */
export async function toggleMessageStar(
  userId: string,
  messageId: string
): Promise<boolean> {
  // Get or create category
  const category = await getOrCreateInboxCategory(userId, messageId);

  // Toggle star
  const [updated] = await db
    .update(inboxCategories)
    .set({
      isStarred: !category.isStarred,
      updatedAt: new Date()
    })
    .where(
      and(
        eq(inboxCategories.userId, userId),
        eq(inboxCategories.messageId, messageId)
      )
    )
    .returning();

  return updated.isStarred;
}

/**
 * Move message to different category (Primary <-> Other)
 */
export async function moveMessageToCategory(
  userId: string,
  messageId: string,
  category: 'primary' | 'other'
): Promise<void> {
  // Get or create category
  await getOrCreateInboxCategory(userId, messageId);

  // Update category
  await db
    .update(inboxCategories)
    .set({
      category,
      updatedAt: new Date()
    })
    .where(
      and(
        eq(inboxCategories.userId, userId),
        eq(inboxCategories.messageId, messageId)
      )
    );
}

/**
 * Bulk mark all as read in a category
 */
export async function markAllAsRead(
  userId: string,
  category: 'primary' | 'other'
): Promise<number> {
  const result = await db
    .update(inboxCategories)
    .set({
      isRead: true,
      readAt: new Date(),
      updatedAt: new Date()
    })
    .where(
      and(
        eq(inboxCategories.userId, userId),
        eq(inboxCategories.category, category),
        eq(inboxCategories.isRead, false)
      )
    );

  return result.rowCount ?? 0;
}

/**
 * Archive message
 */
export async function archiveMessage(
  userId: string,
  messageId: string
): Promise<void> {
  // Get or create category
  await getOrCreateInboxCategory(userId, messageId);

  // Mark as archived
  await db
    .update(inboxCategories)
    .set({
      isArchived: true,
      updatedAt: new Date()
    })
    .where(
      and(
        eq(inboxCategories.userId, userId),
        eq(inboxCategories.messageId, messageId)
      )
    );
}
