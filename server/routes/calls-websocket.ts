import { WebSocketServer, WebSocket } from 'ws';
import http from 'http';

interface CallUser {
  userId: string;
  callId: string;
  socket: WebSocket;
  status: 'ringing' | 'active' | 'ended';
}

// Map call -> Set of connected users
const callConnections = new Map<string, Map<string, CallUser>>();

// Track active calls by team/user
const userActiveCalls = new Map<string, string>(); // userId -> callId

export function initializeCallsWebSocket(server: http.Server) {
  const callsWss = new WebSocketServer({ noServer: true });

  // Upgrade path: /ws/calls/:callId/:userId
  server.on('upgrade', (request, socket, head) => {
    if (!request.url?.startsWith('/ws/calls/')) return;

    const url = new URL(request.url, `http://${request.headers.host}`);
    const segments = url.pathname.split('/');
    const callId = segments[3];
    const userId = segments[4];

    if (!callId || !userId) {
      socket.write('HTTP/1.1 400 Bad Request\r\n\r\n');
      socket.destroy();
      return;
    }

    callsWss.handleUpgrade(request, socket, head, (ws) => {
      console.log(`[Calls WS] User ${userId} connected to call ${callId}`);
      handleCallConnection(ws, callId, userId);
    });
  });

  return callsWss;
}

function handleCallConnection(ws: WebSocket, callId: string, userId: string) {
  // Initialize call map if needed
  if (!callConnections.has(callId)) {
    callConnections.set(callId, new Map());
  }

  const callUsers = callConnections.get(callId)!;
  const callUser: CallUser = { userId, callId, socket: ws, status: 'ringing' };
  callUsers.set(userId, callUser);

  // Track user's active call
  userActiveCalls.set(userId, callId);

  // Send call state to new user
  const participants = Array.from(callUsers.values()).map(u => ({
    userId: u.userId,
    status: u.status,
  }));

  ws.send(JSON.stringify({
    type: 'call_participants',
    participants,
  }));

  // Notify others of new participant
  broadcastToCall(callId, {
    type: 'participant_joined',
    userId,
    status: 'ringing',
    timestamp: new Date().toISOString(),
  }, userId);

  // Handle WebRTC signaling and control messages
  ws.on('message', async (data) => {
    try {
      const message = JSON.parse(data.toString());
      await handleCallMessage(message, userId, callId, ws);
    } catch (err) {
      console.error('[Calls WS] Message parse error:', err);
      ws.send(JSON.stringify({ type: 'error', message: 'Invalid message format' }));
    }
  });

  // Handle disconnect
  ws.on('close', () => {
    console.log(`[Calls WS] User ${userId} disconnected from ${callId}`);
    callUsers.delete(userId);
    userActiveCalls.delete(userId);

    // Notify others
    broadcastToCall(callId, {
      type: 'participant_left',
      userId,
      timestamp: new Date().toISOString(),
    });

    // Cleanup empty calls
    if (callUsers.size === 0) {
      callConnections.delete(callId);
      console.log(`[Calls WS] Call ${callId} ended (no more participants)`);
    }
  });

  ws.on('error', (err) => {
    console.error('[Calls WS] Socket error:', err);
  });
}

async function handleCallMessage(
  message: any,
  userId: string,
  callId: string,
  ws: WebSocket,
) {
  const { type, data } = message;

  switch (type) {
    case 'accept_call':
      // Update participant status to active
      updateParticipantStatus(callId, userId, 'active');
      broadcastToCall(callId, {
        type: 'participant_status_changed',
        userId,
        status: 'active',
        timestamp: new Date().toISOString(),
      });
      break;

    case 'decline_call':
      // Remove participant
      const callUsers = callConnections.get(callId);
      if (callUsers) {
        callUsers.delete(userId);
        userActiveCalls.delete(userId);
      }
      broadcastToCall(callId, {
        type: 'participant_declined',
        userId,
        timestamp: new Date().toISOString(),
      });
      break;

    case 'webrtc_offer':
    case 'webrtc_answer':
    case 'webrtc_ice_candidate':
      // Forward WebRTC signaling to all other participants
      const targetUserId = data.targetUserId;
      if (targetUserId) {
        sendToUser(callId, targetUserId, {
          type,
          from: userId,
          data: data.payload,
        });
      }
      break;

    case 'mute_audio':
      broadcastToCall(callId, {
        type: 'participant_media_changed',
        userId,
        audio: !data.muted,
        timestamp: new Date().toISOString(),
      });
      break;

    case 'mute_video':
      broadcastToCall(callId, {
        type: 'participant_media_changed',
        userId,
        video: !data.muted,
        timestamp: new Date().toISOString(),
      });
      break;

    case 'share_screen':
      broadcastToCall(callId, {
        type: 'screen_share_started',
        userId,
        streamId: data.streamId,
        timestamp: new Date().toISOString(),
      });
      break;

    case 'stop_screen_share':
      broadcastToCall(callId, {
        type: 'screen_share_stopped',
        userId,
        timestamp: new Date().toISOString(),
      });
      break;

    case 'call_metrics':
      // Log call quality metrics
      console.log(`[Calls WS] Metrics from ${userId}:`, {
        latency: data.latency,
        packetLoss: data.packetLoss,
        bandwidth: data.bandwidth,
      });
      break;

    case 'end_call':
      updateParticipantStatus(callId, userId, 'ended');
      broadcastToCall(callId, {
        type: 'participant_ended_call',
        userId,
        timestamp: new Date().toISOString(),
      });
      break;

    default:
      console.warn(`[Calls WS] Unknown message type: ${type}`);
  }
}

function updateParticipantStatus(
  callId: string,
  userId: string,
  status: 'ringing' | 'active' | 'ended',
) {
  const callUsers = callConnections.get(callId);
  if (callUsers && callUsers.has(userId)) {
    callUsers.get(userId)!.status = status;
  }
}

export function broadcastToCall(
  callId: string,
  data: any,
  excludeUserId?: string,
) {
  const callUsers = callConnections.get(callId);
  if (!callUsers) return;

  const message = JSON.stringify(data);

  callUsers.forEach((user) => {
    if (excludeUserId && user.userId === excludeUserId) return;
    if (user.socket.readyState === WebSocket.OPEN) {
      user.socket.send(message);
    }
  });
}

function sendToUser(callId: string, userId: string, data: any) {
  const callUsers = callConnections.get(callId);
  if (!callUsers || !callUsers.has(userId)) return;

  const user = callUsers.get(userId)!;
  if (user.socket.readyState === WebSocket.OPEN) {
    user.socket.send(JSON.stringify(data));
  }
}

export function getCallParticipants(callId: string): string[] {
  const callUsers = callConnections.get(callId);
  if (!callUsers) return [];
  return Array.from(callUsers.keys());
}

export function getUserActiveCall(userId: string): string | undefined {
  return userActiveCalls.get(userId);
}

export function isUserInCall(callId: string, userId: string): boolean {
  const callUsers = callConnections.get(callId);
  return callUsers ? callUsers.has(userId) : false;
}

export function notifyCallInvitees(callId: string, recipientIds: string[]) {
  // Send call invitation to specific users even if not yet in WebSocket
  recipientIds.forEach(recipientId => {
    console.log(`[Calls WS] Notifying ${recipientId} of call ${callId}`);
    // Could integrate with push notifications here
  });
}
