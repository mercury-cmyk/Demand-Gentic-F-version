import { Router } from 'express';
import { WebSocketServer, WebSocket } from 'ws';
import { Server } from 'http';
import { v4 as uuidv4 } from 'uuid';
import * as sipClient from '../services/sip/sip-client';
import { db } from '../db';
import { callAttempts } from '@shared/schema';
import { eq } from 'drizzle-orm';

interface AgentSession {
  id: string;
  ws: WebSocket;
  agentId: string;
  activeCall: {
    callId: string;
    to: string;
    from: string;
    startedAt: number;
  } | null;
}

const agentSessions = new Map<string, AgentSession>();

export function setupSIPAgentWebSocket(server: Server) {
  const wss = new WebSocketServer({ 
    server,
    path: '/api/sip-agent',
  });

  wss.on('connection', (ws: WebSocket, req) => {
    const sessionId = uuidv4();
    const agentId = (req.headers['x-agent-id'] as string) || 'unknown';

    console.log(`[SIP Agent WebSocket] New connection: ${sessionId} (agent: ${agentId})`);

    const session: AgentSession = {
      id: sessionId,
      ws,
      agentId,
      activeCall: null,
    };

    agentSessions.set(sessionId, session);

    // Send session ready message
    ws.send(JSON.stringify({
      type: 'session_ready',
      sessionId,
      agentId,
    }));

    ws.on('message', async (message: string) => {
      try {
        const data = JSON.parse(message);
        console.log(`[SIP Agent WebSocket] Message from ${sessionId}:`, data.type);

        switch (data.type) {
          case 'make_call':
            await handleMakeCall(session, data);
            break;

          case 'answer':
            await handleAnswer(session, data);
            break;

          case 'ice_candidate':
            await handleIceCandidate(session, data);
            break;

          case 'end_call':
            await handleEndCall(session, data);
            break;

          case 'toggle_hold':
            await handleToggleHold(session, data);
            break;

          default:
            console.log(`[SIP Agent WebSocket] Unknown message type: ${data.type}`);
        }
      } catch (error) {
        console.error(`[SIP Agent WebSocket] Error processing message:`, error);
        ws.send(JSON.stringify({
          type: 'error',
          message: 'Failed to process message',
          error: String(error),
        }));
      }
    });

    ws.on('close', () => {
      console.log(`[SIP Agent WebSocket] Connection closed: ${sessionId}`);
      
      // Hangup any active call
      if (session.activeCall) {
        console.log(`[SIP Agent WebSocket] Hanging up active call: ${session.activeCall.callId}`);
        sipClient.endCall(session.activeCall.callId).catch((err: unknown) => {
          console.error(`[SIP Agent WebSocket] Error hanging up call:`, err);
        });
      }

      agentSessions.delete(sessionId);
    });

    ws.on('error', (error) => {
      console.error(`[SIP Agent WebSocket] Error:`, error);
    });
  });

  return wss;
}

async function handleMakeCall(session: AgentSession, data: any) {
  const { to, offer } = data;

  if (!to) {
    session.ws.send(JSON.stringify({
      type: 'error',
      message: 'Missing destination phone number',
    }));
    return;
  }

  try {
    // Generate call ID
    const callId = uuidv4();
    
    console.log(`[SIP Agent WebSocket] Initiating SIP call from agent ${session.agentId} to ${to}`);

    // Update session with active call
    session.activeCall = {
      callId,
      to,
      from: session.agentId,
      startedAt: Date.now(),
    };

    // Send ringing status
    session.ws.send(JSON.stringify({
      type: 'call_ringing',
      callId,
      to,
    }));

    // In a real implementation, you would:
    // 1. Initiate the SIP call via your SIP backend
    // 2. Establish WebRTC connection with the agent
    // 3. Bridge the agent's WebRTC to the SIP call
    
    // For now, send a mock connected message after a delay
    setTimeout(() => {
      if (session.ws.readyState === WebSocket.OPEN && session.activeCall?.callId === callId) {
        session.ws.send(JSON.stringify({
          type: 'call_connected',
          callId,
          to,
        }));
      }
    }, 1000);
  } catch (error) {
    console.error(`[SIP Agent WebSocket] Error making call:`, error);
    session.ws.send(JSON.stringify({
      type: 'error',
      message: 'Failed to initiate call',
      error: String(error),
    }));
  }
}

async function handleAnswer(session: AgentSession, data: any) {
  const { callId, answer } = data;

  if (!callId || !answer) {
    session.ws.send(JSON.stringify({
      type: 'error',
      message: 'Missing callId or answer',
    }));
    return;
  }

  try {
    console.log(`[SIP Agent WebSocket] Answer received for call: ${callId}`);
    
    // In a real implementation, send this answer to the call signaling
    // For now, this is handled by the WebRTC peer connection
  } catch (error) {
    console.error(`[SIP Agent WebSocket] Error handling answer:`, error);
    session.ws.send(JSON.stringify({
      type: 'error',
      message: 'Failed to handle answer',
      error: String(error),
    }));
  }
}

async function handleIceCandidate(session: AgentSession, data: any) {
  const { callId, candidate } = data;

  if (!callId || !candidate) {
    return;
  }

  try {
    console.log(`[SIP Agent WebSocket] ICE candidate received for call: ${callId}`);
    
    // In a real implementation, add ICE candidate to peer connection
    // For now, this is handled by the WebRTC peer connection
  } catch (error) {
    console.error(`[SIP Agent WebSocket] Error handling ICE candidate:`, error);
  }
}

async function handleEndCall(session: AgentSession, data: any) {
  const { callId } = data;

  try {
    console.log(`[SIP Agent WebSocket] Ending call: ${callId}`);

    if (session.activeCall?.callId === callId) {
      // Hangup the SIP call
      await sipClient.endCall(callId);
      session.activeCall = null;
    }

    session.ws.send(JSON.stringify({
      type: 'call_ended',
      callId,
    }));
  } catch (error) {
    console.error(`[SIP Agent WebSocket] Error ending call:`, error);
    session.ws.send(JSON.stringify({
      type: 'error',
      message: 'Failed to end call',
      error: String(error),
    }));
  }
}

async function handleToggleHold(session: AgentSession, data: any) {
  const { callId } = data;

  try {
    console.log(`[SIP Agent WebSocket] Toggling hold for call: ${callId}`);

    // In a real implementation, toggle hold on the SIP call
    // For now, just acknowledge
    session.ws.send(JSON.stringify({
      type: 'hold_toggled',
      callId,
    }));
  } catch (error) {
    console.error(`[SIP Agent WebSocket] Error toggling hold:`, error);
    session.ws.send(JSON.stringify({
      type: 'error',
      message: 'Failed to toggle hold',
      error: String(error),
    }));
  }
}

export function getSIPAgentSessions(): Map<string, AgentSession> {
  return agentSessions;
}
