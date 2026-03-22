import { WebSocketServer, WebSocket } from 'ws';
import http from 'http';
import { db } from '../db';
import { chatMessages, channelMembers, users } from '../../shared/schema';
import { eq } from 'drizzle-orm';

interface ChatUser {
  userId: string;
  channelId: string;
  socket: WebSocket;
  isTyping: boolean;
}

// Map channel -> Set of connected users
const channelConnections = new Map>();

// Cache for typing indicators (clear after 3 seconds of inactivity)
const typingCache = new Map>();
const typingTimeouts = new Map();

export function initializeChatWebSocket(server: http.Server) {
  const chatWss = new WebSocketServer({ noServer: true });

  // Upgrade path: /ws/chat/:channelId/:userId
  server.on('upgrade', (request, socket, head) => {
    if (!request.url?.startsWith('/ws/chat/')) return;

    const url = new URL(request.url, `http://${request.headers.host}`);
    const segments = url.pathname.split('/');
    const channelId = segments[3];
    const userId = segments[4];

    if (!channelId || !userId) {
      socket.write('HTTP/1.1 400 Bad Request\r\n\r\n');
      socket.destroy();
      return;
    }

    chatWss.handleUpgrade(request, socket, head, (ws) => {
      console.log(`[Chat WS] User ${userId} connected to channel ${channelId}`);
      handleChatConnection(ws, channelId, userId);
    });
  });

  return chatWss;
}

function handleChatConnection(ws: WebSocket, channelId: string, userId: string) {
  // Initialize channel map if needed
  if (!channelConnections.has(channelId)) {
    channelConnections.set(channelId, new Map());
    typingCache.set(channelId, new Set());
  }

  const channelUsers = channelConnections.get(channelId)!;
  const chatUser: ChatUser = { userId, channelId, socket: ws, isTyping: false };
  channelUsers.set(userId, chatUser);

  // Notify others of user join
  broadcastToChannel(channelId, {
    type: 'user_joined',
    userId,
    timestamp: new Date().toISOString(),
  }, userId);

  // Send current online users to new user
  const onlineUsers = Array.from(channelUsers.values()).map(u => u.userId);
  ws.send(JSON.stringify({
    type: 'online_users',
    users: onlineUsers,
  }));

  // Handle incoming messages
  ws.on('message', async (data) => {
    try {
      const message = JSON.parse(data.toString());
      await handleChatMessage(message, userId, channelId, ws);
    } catch (err) {
      console.error('[Chat WS] Message parse error:', err);
      ws.send(JSON.stringify({ type: 'error', message: 'Invalid message format' }));
    }
  });

  // Handle disconnect
  ws.on('close', () => {
    console.log(`[Chat WS] User ${userId} disconnected from ${channelId}`);
    channelUsers.delete(userId);

    // Clear typing indicator
    const typingSet = typingCache.get(channelId);
    if (typingSet) {
      typingSet.delete(userId);
    }

    // Clear typing timeout
    const timeoutKey = `${channelId}:${userId}`;
    if (typingTimeouts.has(timeoutKey)) {
      clearTimeout(typingTimeouts.get(timeoutKey)!);
      typingTimeouts.delete(timeoutKey);
    }

    // Notify channel
    broadcastToChannel(channelId, {
      type: 'user_left',
      userId,
      timestamp: new Date().toISOString(),
    });

    // Cleanup empty channels
    if (channelUsers.size === 0) {
      channelConnections.delete(channelId);
      typingCache.delete(channelId);
    }
  });

  ws.on('error', (err) => {
    console.error('[Chat WS] Socket error:', err);
  });
}

async function handleChatMessage(
  message: any,
  userId: string,
  channelId: string,
  ws: WebSocket,
) {
  const { type, content, messageId, emoji } = message;

  switch (type) {
    case 'message':
      // Broadcast new message to all users in channel
      broadcastToChannel(channelId, {
        type: 'new_message',
        messageId,
        senderId: userId,
        content,
        timestamp: new Date().toISOString(),
      });
      break;

    case 'typing_start':
      handleTypingStart(channelId, userId);
      break;

    case 'typing_stop':
      handleTypingStop(channelId, userId);
      break;

    case 'reaction':
      // Broadcast emoji reaction
      broadcastToChannel(channelId, {
        type: 'message_reaction',
        messageId,
        emoji,
        userId,
        timestamp: new Date().toISOString(),
      });
      break;

    case 'message_read':
      // Broadcast read receipt
      broadcastToChannel(channelId, {
        type: 'message_read',
        messageId,
        userId,
        timestamp: new Date().toISOString(),
      });
      break;

    default:
      console.warn(`[Chat WS] Unknown message type: ${type}`);
  }
}

function handleTypingStart(channelId: string, userId: string) {
  const typingSet = typingCache.get(channelId);
  if (!typingSet) return;

  typingSet.add(userId);

  // Clear previous timeout
  const timeoutKey = `${channelId}:${userId}`;
  if (typingTimeouts.has(timeoutKey)) {
    clearTimeout(typingTimeouts.get(timeoutKey)!);
  }

  // Set new timeout to auto-clear typing after 3 seconds of inactivity
  const timeout = setTimeout(() => {
    handleTypingStop(channelId, userId);
  }, 3000);

  typingTimeouts.set(timeoutKey, timeout);

  // Broadcast typing status
  broadcastToChannel(channelId, {
    type: 'user_typing',
    userId,
    typingUsers: Array.from(typingSet),
  });
}

function handleTypingStop(channelId: string, userId: string) {
  const typingSet = typingCache.get(channelId);
  if (!typingSet) return;

  typingSet.delete(userId);

  // Clear timeout
  const timeoutKey = `${channelId}:${userId}`;
  if (typingTimeouts.has(timeoutKey)) {
    clearTimeout(typingTimeouts.get(timeoutKey)!);
    typingTimeouts.delete(timeoutKey);
  }

  // Broadcast updated typing status
  broadcastToChannel(channelId, {
    type: 'user_typing',
    userId,
    typingUsers: Array.from(typingSet),
  });
}

export function broadcastToChannel(
  channelId: string,
  data: any,
  excludeUserId?: string,
) {
  const channelUsers = channelConnections.get(channelId);
  if (!channelUsers) return;

  const message = JSON.stringify(data);

  channelUsers.forEach((user) => {
    if (excludeUserId && user.userId === excludeUserId) return;
    if (user.socket.readyState === WebSocket.OPEN) {
      user.socket.send(message);
    }
  });
}

export function getChannelOnlineUsers(channelId: string): string[] {
  const channelUsers = channelConnections.get(channelId);
  if (!channelUsers) return [];
  return Array.from(channelUsers.keys());
}

export function isUserInChannel(channelId: string, userId: string): boolean {
  const channelUsers = channelConnections.get(channelId);
  return channelUsers ? channelUsers.has(userId) : false;
}