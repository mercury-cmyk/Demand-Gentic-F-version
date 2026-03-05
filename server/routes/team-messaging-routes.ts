import { Router, Request, Response } from 'express';
import { db } from '../db';
import { 
  chatChannels, chatMessages, channelMembers, messageReadReceipts,
  fileUploads, voiceCalls, callParticipants, users, iamTeams
} from '../../shared/schema';
import { eq, and, or, desc, asc, ilike, count, sql } from 'drizzle-orm';
import { v4 as uuidv4 } from 'uuid';

const router = Router();

// ==================== CHANNELS ====================

// GET /channels/:teamId - Get all channels for a team
router.get('/channels/:teamId', async (req: Request, res: Response) => {
  try {
    const { teamId } = req.params;
    const userId = (req as any).user?.id;

    if (!userId) return res.status(401).json({ message: 'Unauthorized' });

    // Get channels user is member of
    const channels = await db
      .select({
        channel: chatChannels,
        memberCount: count(channelMembers.id),
        unreadCount: count(chatMessages.id),
      })
      .from(chatChannels)
      .innerJoin(channelMembers, eq(channelMembers.channelId, chatChannels.id))
      .leftJoin(
        chatMessages,
        and(
          eq(chatMessages.channelId, chatChannels.id),
          eq(sql`${chatMessages.createdAt} > COALESCE(${channelMembers.lastReadAt}, '1970-01-01'::timestamp)`),
        ),
      )
      .where(
        and(
          eq(chatChannels.teamId, teamId),
          eq(chatChannels.isArchived, false),
          eq(channelMembers.userId, userId),
        ),
      )
      .groupBy(chatChannels.id)
      .orderBy(desc(chatChannels.updatedAt));

    res.json({ channels });
  } catch (err) {
    console.error('[Team Messaging] Get channels error:', err);
    res.status(500).json({ message: 'Failed to fetch channels' });
  }
});

// POST /channels - Create a new channel
router.post('/channels', async (req: Request, res: Response) => {
  try {
    const { teamId, name, description, channelType, memberIds } = req.body;
    const userId = (req as any).user?.id;

    if (!userId) return res.status(401).json({ message: 'Unauthorized' });

    const channelId = uuidv4();

    // Create channel
    const newChannel = await db.insert(chatChannels).values({
      id: channelId,
      teamId,
      name,
      description,
      channelType: channelType || 'general',
      createdById: userId,
    }).returning();

    // Add creator as owner
    await db.insert(channelMembers).values({
      id: uuidv4(),
      channelId,
      userId,
      role: 'owner',
    });

    // Add other members if provided
    if (memberIds && memberIds.length > 0) {
      await db.insert(channelMembers).values(
        memberIds.map((memberId: string) => ({
          id: uuidv4(),
          channelId,
          userId: memberId,
          role: 'member',
        })),
      );
    }

    res.status(201).json({ channel: newChannel[0] });
  } catch (err) {
    console.error('[Team Messaging] Create channel error:', err);
    res.status(500).json({ message: 'Failed to create channel' });
  }
});

// GET /channels/:channelId/details - Get channel details with members
router.get('/channels/:channelId/details', async (req: Request, res: Response) => {
  try {
    const { channelId } = req.params;

    const channel = await db
      .select({ channel: chatChannels })
      .from(chatChannels)
      .where(eq(chatChannels.id, channelId))
      .limit(1);

    if (!channel.length) {
      return res.status(404).json({ message: 'Channel not found' });
    }

    // Get members
    const members = await db
      .select({
        member: channelMembers,
        user: users,
      })
      .from(channelMembers)
      .innerJoin(users, eq(channelMembers.userId, users.id))
      .where(eq(channelMembers.channelId, channelId))
      .orderBy(asc(channelMembers.joinedAt));

    res.json({
      channel: channel[0].channel,
      members: members.map(m => ({ ...m.member, user: m.user })),
    });
  } catch (err) {
    console.error('[Team Messaging] Get channel details error:', err);
    res.status(500).json({ message: 'Failed to fetch channel details' });
  }
});

// PUT /channels/:channelId - Update channel
router.put('/channels/:channelId', async (req: Request, res: Response) => {
  try {
    const { channelId } = req.params;
    const { name, description, metadata } = req.body;
    const userId = (req as any).user?.id;

    // Check if user is owner/admin
    const memberRole = await db
      .select({ role: channelMembers.role })
      .from(channelMembers)
      .where(and(eq(channelMembers.channelId, channelId), eq(channelMembers.userId, userId)))
      .limit(1);

    if (!memberRole.length || !['owner', 'admin'].includes(memberRole[0].role)) {
      return res.status(403).json({ message: 'Insufficient permissions' });
    }

    const updated = await db
      .update(chatChannels)
      .set({ name, description, metadata, updatedAt: new Date() })
      .where(eq(chatChannels.id, channelId))
      .returning();

    res.json({ channel: updated[0] });
  } catch (err) {
    console.error('[Team Messaging] Update channel error:', err);
    res.status(500).json({ message: 'Failed to update channel' });
  }
});

// ==================== MESSAGES ====================

// POST /messages - Send a message
router.post('/messages', async (req: Request, res: Response) => {
  try {
    const { channelId, content, messageType = 'text', parentMessageId, attachmentIds } = req.body;
    const userId = (req as any).user?.id;

    if (!userId) return res.status(401).json({ message: 'Unauthorized' });

    // Verify user is channel member
    const isMember = await db
      .select({ id: channelMembers.id })
      .from(channelMembers)
      .where(and(eq(channelMembers.channelId, channelId), eq(channelMembers.userId, userId)))
      .limit(1);

    if (!isMember.length) {
      return res.status(403).json({ message: 'Not a member of this channel' });
    }

    const messageId = uuidv4();

    const message = await db.insert(chatMessages).values({
      id: messageId,
      channelId,
      senderId: userId,
      content,
      messageType,
      parentMessageId,
      attachmentIds: attachmentIds || [],
    }).returning();

    // Mark message as read for sender
    await db.insert(messageReadReceipts).values({
      id: uuidv4(),
      messageId,
      userId,
    }).catch(() => {}); // Ignore if duplicate

    res.status(201).json({ message: message[0] });
  } catch (err) {
    console.error('[Team Messaging] Send message error:', err);
    res.status(500).json({ message: 'Failed to send message' });
  }
});

// GET /messages/:channelId - Get messages for a channel (paginated)
router.get('/messages/:channelId', async (req: Request, res: Response) => {
  try {
    const { channelId } = req.params;
    const { limit = 50, offset = 0 } = req.query;
    const userId = (req as any).user?.id;

    // Verify user is channel member
    const isMember = await db
      .select({ id: channelMembers.id })
      .from(channelMembers)
      .where(and(eq(channelMembers.channelId, channelId), eq(channelMembers.userId, userId)))
      .limit(1);

    if (!isMember.length) {
      return res.status(403).json({ message: 'Not a member of this channel' });
    }

    // Get messages with read receipts
    const messages = await db
      .select({
        message: chatMessages,
        sender: users,
        readCount: count(messageReadReceipts.id),
      })
      .from(chatMessages)
      .innerJoin(users, eq(chatMessages.senderId, users.id))
      .leftJoin(messageReadReceipts, eq(messageReadReceipts.messageId, chatMessages.id))
      .where(eq(chatMessages.channelId, channelId))
      .groupBy(chatMessages.id, users.id)
      .orderBy(desc(chatMessages.createdAt))
      .limit(Number(limit))
      .offset(Number(offset));

    res.json({
      messages: messages.map(m => ({
        ...m.message,
        sender: m.sender,
        readCount: m.readCount,
      })),
      total: messages.length,
    });
  } catch (err) {
    console.error('[Team Messaging] Get messages error:', err);
    res.status(500).json({ message: 'Failed to fetch messages' });
  }
});

// PUT /messages/:messageId - Edit a message
router.put('/messages/:messageId', async (req: Request, res: Response) => {
  try {
    const { messageId } = req.params;
    const { content } = req.body;
    const userId = (req as any).user?.id;

    // Verify ownership
    const message = await db
      .select({ senderId: chatMessages.senderId })
      .from(chatMessages)
      .where(eq(chatMessages.id, messageId))
      .limit(1);

    if (!message.length || message[0].senderId !== userId) {
      return res.status(403).json({ message: 'Cannot edit this message' });
    }

    const updated = await db
      .update(chatMessages)
      .set({ content, editedAt: new Date(), editedBy: userId })
      .where(eq(chatMessages.id, messageId))
      .returning();

    res.json({ message: updated[0] });
  } catch (err) {
    console.error('[Team Messaging] Edit message error:', err);
    res.status(500).json({ message: 'Failed to edit message' });
  }
});

// DELETE /messages/:messageId - Delete a message
router.delete('/messages/:messageId', async (req: Request, res: Response) => {
  try {
    const { messageId } = req.params;
    const userId = (req as any).user?.id;

    const message = await db
      .select({ senderId: chatMessages.senderId })
      .from(chatMessages)
      .where(eq(chatMessages.id, messageId))
      .limit(1);

    if (!message.length || message[0].senderId !== userId) {
      return res.status(403).json({ message: 'Cannot delete this message' });
    }

    await db.delete(chatMessages).where(eq(chatMessages.id, messageId));
    res.json({ success: true });
  } catch (err) {
    console.error('[Team Messaging] Delete message error:', err);
    res.status(500).json({ message: 'Failed to delete message' });
  }
});

// POST /messages/:messageId/read - Mark message as read
router.post('/messages/:messageId/read', async (req: Request, res: Response) => {
  try {
    const { messageId } = req.params;
    const userId = (req as any).user?.id;

    if (!userId) return res.status(401).json({ message: 'Unauthorized' });

    await db
      .insert(messageReadReceipts)
      .values({ id: uuidv4(), messageId, userId })
      .onConflictDoNothing();

    res.json({ success: true });
  } catch (err) {
    console.error('[Team Messaging] Mark read error:', err);
    res.status(500).json({ message: 'Failed to mark message as read' });
  }
});

// POST /messages/:messageId/reactions - Add reaction to message
router.post('/messages/:messageId/reactions', async (req: Request, res: Response) => {
  try {
    const { messageId } = req.params;
    const { emoji } = req.body;
    const userId = (req as any).user?.id;

    if (!userId) return res.status(401).json({ message: 'Unauthorized' });

    const message = await db
      .select({ reactions: chatMessages.reactions })
      .from(chatMessages)
      .where(eq(chatMessages.id, messageId))
      .limit(1);

    if (!message.length) {
      return res.status(404).json({ message: 'Message not found' });
    }

    const reactions = (message[0].reactions || {}) as Record<string, string[]>;
    
    if (!reactions[emoji]) {
      reactions[emoji] = [];
    }

    if (!reactions[emoji].includes(userId)) {
      reactions[emoji].push(userId);
    }

    const updated = await db
      .update(chatMessages)
      .set({ reactions })
      .where(eq(chatMessages.id, messageId))
      .returning();

    res.json({ message: updated[0] });
  } catch (err) {
    console.error('[Team Messaging] Add reaction error:', err);
    res.status(500).json({ message: 'Failed to add reaction' });
  }
});

// ==================== CHANNEL MEMBERS ====================

// POST /channels/:channelId/members - Add member to channel
router.post('/channels/:channelId/members', async (req: Request, res: Response) => {
  try {
    const { channelId } = req.params;
    const { userId } = req.body;
    const requesterUserId = (req as any).user?.id;

    // Check if requester is owner/admin
    const memberRole = await db
      .select({ role: channelMembers.role })
      .from(channelMembers)
      .where(and(eq(channelMembers.channelId, channelId), eq(channelMembers.userId, requesterUserId)))
      .limit(1);

    if (!memberRole.length || !['owner', 'admin'].includes(memberRole[0].role)) {
      return res.status(403).json({ message: 'Insufficient permissions' });
    }

    // Check if already member
    const existing = await db
      .select({ id: channelMembers.id })
      .from(channelMembers)
      .where(and(eq(channelMembers.channelId, channelId), eq(channelMembers.userId, userId)))
      .limit(1);

    if (existing.length) {
      return res.status(400).json({ message: 'User already a member' });
    }

    const newMember = await db.insert(channelMembers).values({
      id: uuidv4(),
      channelId,
      userId,
      role: 'member',
    }).returning();

    res.status(201).json({ member: newMember[0] });
  } catch (err) {
    console.error('[Team Messaging] Add member error:', err);
    res.status(500).json({ message: 'Failed to add member' });
  }
});

// DELETE /channels/:channelId/members/:userId - Remove member from channel
router.delete('/channels/:channelId/members/:userId', async (req: Request, res: Response) => {
  try {
    const { channelId, userId } = req.params;
    const requesterUserId = (req as any).user?.id;

    const memberRole = await db
      .select({ role: channelMembers.role })
      .from(channelMembers)
      .where(and(eq(channelMembers.channelId, channelId), eq(channelMembers.userId, requesterUserId)))
      .limit(1);

    if (!memberRole.length || !['owner', 'admin'].includes(memberRole[0].role)) {
      return res.status(403).json({ message: 'Insufficient permissions' });
    }

    await db
      .delete(channelMembers)
      .where(and(eq(channelMembers.channelId, channelId), eq(channelMembers.userId, userId)));

    res.json({ success: true });
  } catch (err) {
    console.error('[Team Messaging] Remove member error:', err);
    res.status(500).json({ message: 'Failed to remove member' });
  }
});

// ==================== SEARCH ====================

// GET /search - Search messages and channels
router.get('/search', async (req: Request, res: Response) => {
  try {
    const { q, teamId, type = 'all' } = req.query;
    const userId = (req as any).user?.id;

    if (!userId) return res.status(401).json({ message: 'Unauthorized' });

    const searchQuery = `%${q}%`;

    const results: any = {};

    if (type === 'all' || type === 'channels') {
      results.channels = await db
        .select({ channel: chatChannels })
        .from(chatChannels)
        .innerJoin(channelMembers, 
          and(
            eq(channelMembers.channelId, chatChannels.id),
            eq(channelMembers.userId, userId),
          ),
        )
        .where(
          and(
            eq(chatChannels.teamId, teamId as string),
            ilike(chatChannels.name, searchQuery),
          ),
        )
        .limit(10);
    }

    if (type === 'all' || type === 'messages') {
      results.messages = await db
        .select({ message: chatMessages, sender: users })
        .from(chatMessages)
        .innerJoin(users, eq(chatMessages.senderId, users.id))
        .innerJoin(channelMembers,
          and(
            eq(channelMembers.channelId, chatMessages.channelId),
            eq(channelMembers.userId, userId),
          ),
        )
        .where(ilike(chatMessages.content, searchQuery))
        .orderBy(desc(chatMessages.createdAt))
        .limit(20);
    }

    res.json(results);
  } catch (err) {
    console.error('[Team Messaging] Search error:', err);
    res.status(500).json({ message: 'Search failed' });
  }
});

export default router;
