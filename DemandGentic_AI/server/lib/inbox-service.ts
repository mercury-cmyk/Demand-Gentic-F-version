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
): Promise {
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
): Promise {
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
): Promise {
  const { limit = 50, offset = 0, unreadOnly = false, searchQuery } = options;

  // SECURITY: Get the user's connected mailbox emails to filter messages
  const userMailboxes = await db
    .select({ mailboxEmail: mailboxAccounts.mailboxEmail })
    .from(mailboxAccounts)
    .where(eq(mailboxAccounts.userId, userId));

  const userEmails = userMailboxes
    .map(m => m.mailboxEmail?.toLowerCase())
    .filter(Boolean) as string[];

  if (userEmails.length === 0) {
    // User has no connected mailbox — return empty inbox
    return [];
  }

  // Build user-ownership filter: inbound messages where user's email is in toEmails or ccEmails
  const userEmailFilter = or(
    ...userEmails.map(email => sql`${email} = ANY(${dealMessages.toEmails})`),
    ...userEmails.map(email => sql`${email} = ANY(${dealMessages.ccEmails})`)
  );

  // Fetch ONLY messages addressed to this user's mailbox(es)
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
        userEmailFilter,
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
 * Fetch sent messages from both scheduled_emails AND dealMessages (outbound)
 *
 * Returns emails that have been successfully sent from either:
 * 1. Campaign scheduled emails (scheduledEmails table)
 * 2. Inbox compose sends (dealMessages table with direction='outbound')
 */
export async function getSentMessages(
  userId: string,
  options: {
    limit?: number;
    offset?: number;
    searchQuery?: string;
  } = {}
): Promise {
  const { limit = 50, offset = 0, searchQuery } = options;

  // Fetch user's mailbox accounts
  const userMailboxes = await db
    .select({ id: mailboxAccounts.id, mailboxEmail: mailboxAccounts.mailboxEmail })
    .from(mailboxAccounts)
    .where(eq(mailboxAccounts.userId, userId));

  const mailboxIds = userMailboxes.map(m => m.id);
  const userEmails = userMailboxes
    .map(m => m.mailboxEmail?.toLowerCase())
    .filter(Boolean) as string[];

  if (mailboxIds.length === 0 && userEmails.length === 0) {
    return [];
  }

  // 1. Fetch sent emails from scheduledEmails (campaign sends)
  const scheduledResults = mailboxIds.length > 0 ? await db
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
    .offset(offset) : [];

  // 2. Fetch outbound dealMessages (inbox compose sends)
  const userEmailFilter = userEmails.length > 0
    ? or(...userEmails.map(email => sql`LOWER(${dealMessages.fromEmail}) = ${email}`))
    : sql`false`;

  const dealResults = await db
    .select({
      message: dealMessages,
      conversation: dealConversations,
      opportunity: pipelineOpportunities,
      account: accounts,
      contact: contacts
    })
    .from(dealMessages)
    .leftJoin(dealConversations, eq(dealConversations.id, dealMessages.conversationId))
    .leftJoin(pipelineOpportunities, eq(pipelineOpportunities.id, dealConversations.opportunityId))
    .leftJoin(accounts, eq(accounts.id, pipelineOpportunities.accountId))
    .leftJoin(contacts, eq(contacts.id, pipelineOpportunities.contactId))
    .where(
      and(
        eq(dealMessages.direction, 'outbound'),
        userEmailFilter,
        searchQuery
          ? or(
              sql`${dealMessages.subject} ILIKE ${`%${searchQuery}%`}`,
              sql`${dealMessages.bodyPreview} ILIKE ${`%${searchQuery}%`}`,
              sql`${dealMessages.fromEmail} ILIKE ${`%${searchQuery}%`}`
            )
          : undefined
      )
    )
    .orderBy(desc(dealMessages.sentAt))
    .limit(limit)
    .offset(offset);

  // Merge both sources into unified InboxMessage format
  const fromScheduled: InboxMessage[] = scheduledResults.map(({ email, account, contact }) => ({
    id: email.id,
    conversationId: email.id,
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
    isRead: true,
    isStarred: false,
    category: 'primary' as const,
    accountId: email.accountId,
    accountName: account?.name ?? null,
    contactId: email.contactId,
    contactName: contact ? `${contact.firstName} ${contact.lastName}`.trim() : null,
    opportunityId: email.opportunityId
  }));

  const fromDeal: InboxMessage[] = dealResults.map(({ message, conversation, opportunity, account, contact }) => ({
    id: message.id,
    conversationId: message.conversationId,
    subject: message.subject || '(No Subject)',
    bodyPreview: message.bodyPreview || '',
    bodyHtml: message.bodyContent,
    from: message.fromEmail,
    fromName: null,
    to: message.toEmails,
    cc: message.ccEmails || [],
    receivedDateTime: message.sentAt || message.receivedAt || new Date(),
    hasAttachments: message.hasAttachments || false,
    importance: message.importance || 'normal',
    isRead: true,
    isStarred: false,
    category: 'primary' as const,
    accountId: opportunity?.accountId ?? null,
    accountName: account?.name ?? null,
    contactId: opportunity?.contactId ?? null,
    contactName: contact ? `${contact.firstName} ${contact.lastName}`.trim() : null,
    opportunityId: message.opportunityId || conversation?.opportunityId || null
  }));

  // Combine, deduplicate by ID, sort by date descending, apply limit
  const seen = new Set();
  const combined = [...fromScheduled, ...fromDeal]
    .filter(msg => {
      if (seen.has(msg.id)) return false;
      seen.add(msg.id);
      return true;
    })
    .sort((a, b) => new Date(b.receivedDateTime).getTime() - new Date(a.receivedDateTime).getTime())
    .slice(0, limit);

  return combined;
}

/**
 * Get inbox statistics (unread counts per category)
 */
export async function getInboxStats(userId: string): Promise {
  const stats = await db
    .select({
      category: inboxCategories.category,
      unreadCount: sql`COUNT(*) FILTER (WHERE ${inboxCategories.isRead} = false)`,
      totalCount: sql`COUNT(*)`
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
): Promise {
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
): Promise {
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
 * Move message to different category (Primary  Other)
 */
export async function moveMessageToCategory(
  userId: string,
  messageId: string,
  category: 'primary' | 'other'
): Promise {
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
): Promise {
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
): Promise {
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

/**
 * Trash message (soft-delete)
 */
export async function trashMessage(userId: string, messageId: string): Promise {
  await getOrCreateInboxCategory(userId, messageId);
  await db
    .update(inboxCategories)
    .set({ isTrashed: true, trashedAt: new Date(), updatedAt: new Date() })
    .where(and(eq(inboxCategories.userId, userId), eq(inboxCategories.messageId, messageId)));
}

/**
 * Restore message from trash
 */
export async function untrashMessage(userId: string, messageId: string): Promise {
  await db
    .update(inboxCategories)
    .set({ isTrashed: false, trashedAt: null, updatedAt: new Date() })
    .where(and(eq(inboxCategories.userId, userId), eq(inboxCategories.messageId, messageId)));
}

/**
 * Permanently delete a trashed message category record
 */
export async function permanentlyDeleteMessage(userId: string, messageId: string): Promise {
  const result = await db
    .delete(inboxCategories)
    .where(and(eq(inboxCategories.userId, userId), eq(inboxCategories.messageId, messageId), eq(inboxCategories.isTrashed, true)));
  return (result.rowCount ?? 0) > 0;
}

/**
 * Empty trash – delete all trashed category records for a user
 */
export async function emptyTrash(userId: string): Promise {
  const result = await db
    .delete(inboxCategories)
    .where(and(eq(inboxCategories.userId, userId), eq(inboxCategories.isTrashed, true)));
  return result.rowCount ?? 0;
}

/**
 * Get trashed messages
 */
export async function getTrashedMessages(
  userId: string,
  options: { limit?: number; offset?: number } = {}
): Promise {
  const { limit = 50, offset = 0 } = options;

  const results = await db
    .select({
      message: dealMessages,
      category: inboxCategories,
      conversation: dealConversations,
      opportunity: pipelineOpportunities,
      account: accounts,
      contact: contacts
    })
    .from(inboxCategories)
    .innerJoin(dealMessages, eq(dealMessages.id, inboxCategories.messageId))
    .leftJoin(dealConversations, eq(dealConversations.id, dealMessages.conversationId))
    .leftJoin(pipelineOpportunities, eq(pipelineOpportunities.id, dealConversations.opportunityId))
    .leftJoin(accounts, eq(accounts.id, pipelineOpportunities.accountId))
    .leftJoin(contacts, eq(contacts.id, pipelineOpportunities.contactId))
    .where(and(eq(inboxCategories.userId, userId), eq(inboxCategories.isTrashed, true)))
    .orderBy(desc(inboxCategories.trashedAt))
    .limit(limit)
    .offset(offset);

  return results.map(({ message, category: cat, conversation, opportunity, account, contact }) => ({
    id: message.id,
    conversationId: message.conversationId,
    subject: message.subject || '(No Subject)',
    bodyPreview: message.bodyPreview || '',
    bodyHtml: message.bodyContent,
    from: message.fromEmail,
    fromName: contact ? `${contact.firstName} ${contact.lastName}`.trim() : null,
    to: message.toEmails,
    cc: message.ccEmails || [],
    receivedDateTime: message.receivedAt || message.sentAt || new Date(),
    hasAttachments: message.hasAttachments || false,
    importance: message.importance || 'normal',
    isRead: cat?.isRead ?? false,
    isStarred: cat?.isStarred ?? false,
    category: (cat?.category as 'primary' | 'other') ?? 'primary',
    accountId: opportunity?.accountId ?? null,
    accountName: account?.name ?? null,
    contactId: opportunity?.contactId ?? null,
    contactName: contact ? `${contact.firstName} ${contact.lastName}`.trim() : null,
    opportunityId: message.opportunityId || conversation?.opportunityId || null
  }));
}

/**
 * Get starred messages
 */
export async function getStarredMessages(
  userId: string,
  options: { limit?: number; offset?: number } = {}
): Promise {
  const { limit = 50, offset = 0 } = options;

  const results = await db
    .select({
      message: dealMessages,
      category: inboxCategories,
      conversation: dealConversations,
      opportunity: pipelineOpportunities,
      account: accounts,
      contact: contacts
    })
    .from(inboxCategories)
    .innerJoin(dealMessages, eq(dealMessages.id, inboxCategories.messageId))
    .leftJoin(dealConversations, eq(dealConversations.id, dealMessages.conversationId))
    .leftJoin(pipelineOpportunities, eq(pipelineOpportunities.id, dealConversations.opportunityId))
    .leftJoin(accounts, eq(accounts.id, pipelineOpportunities.accountId))
    .leftJoin(contacts, eq(contacts.id, pipelineOpportunities.contactId))
    .where(and(eq(inboxCategories.userId, userId), eq(inboxCategories.isStarred, true), eq(inboxCategories.isTrashed, false)))
    .orderBy(desc(dealMessages.receivedAt))
    .limit(limit)
    .offset(offset);

  return results.map(({ message, category: cat, conversation, opportunity, account, contact }) => ({
    id: message.id,
    conversationId: message.conversationId,
    subject: message.subject || '(No Subject)',
    bodyPreview: message.bodyPreview || '',
    bodyHtml: message.bodyContent,
    from: message.fromEmail,
    fromName: contact ? `${contact.firstName} ${contact.lastName}`.trim() : null,
    to: message.toEmails,
    cc: message.ccEmails || [],
    receivedDateTime: message.receivedAt || message.sentAt || new Date(),
    hasAttachments: message.hasAttachments || false,
    importance: message.importance || 'normal',
    isRead: cat?.isRead ?? false,
    isStarred: cat?.isStarred ?? false,
    category: (cat?.category as 'primary' | 'other') ?? 'primary',
    accountId: opportunity?.accountId ?? null,
    accountName: account?.name ?? null,
    contactId: opportunity?.contactId ?? null,
    contactName: contact ? `${contact.firstName} ${contact.lastName}`.trim() : null,
    opportunityId: message.opportunityId || conversation?.opportunityId || null
  }));
}

/**
 * Get archived messages
 */
export async function getArchivedMessages(
  userId: string,
  options: { limit?: number; offset?: number } = {}
): Promise {
  const { limit = 50, offset = 0 } = options;

  const results = await db
    .select({
      message: dealMessages,
      category: inboxCategories,
      conversation: dealConversations,
      opportunity: pipelineOpportunities,
      account: accounts,
      contact: contacts
    })
    .from(inboxCategories)
    .innerJoin(dealMessages, eq(dealMessages.id, inboxCategories.messageId))
    .leftJoin(dealConversations, eq(dealConversations.id, dealMessages.conversationId))
    .leftJoin(pipelineOpportunities, eq(pipelineOpportunities.id, dealConversations.opportunityId))
    .leftJoin(accounts, eq(accounts.id, pipelineOpportunities.accountId))
    .leftJoin(contacts, eq(contacts.id, pipelineOpportunities.contactId))
    .where(and(eq(inboxCategories.userId, userId), eq(inboxCategories.isArchived, true), eq(inboxCategories.isTrashed, false)))
    .orderBy(desc(dealMessages.receivedAt))
    .limit(limit)
    .offset(offset);

  return results.map(({ message, category: cat, conversation, opportunity, account, contact }) => ({
    id: message.id,
    conversationId: message.conversationId,
    subject: message.subject || '(No Subject)',
    bodyPreview: message.bodyPreview || '',
    bodyHtml: message.bodyContent,
    from: message.fromEmail,
    fromName: contact ? `${contact.firstName} ${contact.lastName}`.trim() : null,
    to: message.toEmails,
    cc: message.ccEmails || [],
    receivedDateTime: message.receivedAt || message.sentAt || new Date(),
    hasAttachments: message.hasAttachments || false,
    importance: message.importance || 'normal',
    isRead: cat?.isRead ?? false,
    isStarred: cat?.isStarred ?? false,
    category: (cat?.category as 'primary' | 'other') ?? 'primary',
    accountId: opportunity?.accountId ?? null,
    accountName: account?.name ?? null,
    contactId: opportunity?.contactId ?? null,
    contactName: contact ? `${contact.firstName} ${contact.lastName}`.trim() : null,
    opportunityId: message.opportunityId || conversation?.opportunityId || null
  }));
}