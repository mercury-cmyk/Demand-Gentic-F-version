/**
 * Call Session Store
 * 
 * Provides persistent storage for call session state across server instances.
 * Uses Redis when available, falls back to in-memory store for development.
 * 
 * This solves the "invalid call control ID" issue in production where:
 * - Multiple server instances don't share in-memory state
 * - Call control IDs become invalid when requests hit different instances
 * - Session state is lost on server restarts
 */

import Redis from 'ioredis';
import { getRedisUrl, getRedisConnectionOptions, isRedisConfigured } from '../lib/redis-config';

const LOG_PREFIX = '[CallSessionStore]';

// Session data structure
export interface CallSession {
  // Core identifiers
  callId: string;
  callControlId: string;        // Provider's call control ID (Telnyx)
  callSessionId?: string;       // Provider's session ID
  streamSid?: string;           // Media stream ID
  calledNumber?: string | null; // Dialed number (E.164) when available
  
  // Campaign/Contact context
  runId: string;
  campaignId: string;
  queueItemId: string;
  callAttemptId: string;
  contactId: string;
  virtualAgentId?: string;
  
  // State tracking
  status: 'initiating' | 'ringing' | 'active' | 'ending' | 'ended';
  provider: 'openai' | 'google' | 'telnyx';
  isTestSession: boolean;
  
  // Timestamps
  createdAt: string;
  updatedAt: string;
  answeredAt?: string;
  endedAt?: string;
  
  // Optional: Conversation state for advanced features
  conversationState?: {
    identityConfirmed: boolean;
    identityConfirmedAt?: string;
    currentState: string;
  };

  // Optional: Real-time conversation quality snapshot
  conversationQuality?: Record<string, unknown>;
}

// Preview conversation session for the AI Studio
export interface PreviewSession {
  sessionId: string;
  virtualAgentId?: string;
  campaignId?: string;
  systemPrompt?: string;
  firstMessage?: string;
  messages: Array<{ role: 'user' | 'assistant'; content: string; timestamp: string }>;
  conversationState: {
    identityConfirmed: boolean;
    currentStage: string;
  };
  createdAt: string;
  updatedAt: string;
  expiresAt: string;
}

// In-memory fallback for development
const inMemoryCallSessions = new Map<string, CallSession>();
const inMemoryPreviewSessions = new Map<string, PreviewSession>();

// Redis client (lazy initialization)
let redisClient: Redis | null = null;
let redisAvailable = false;

const CALL_SESSION_TTL = 3600; // 1 hour (calls shouldn't last longer)
const PREVIEW_SESSION_TTL = 1800; // 30 minutes for preview sessions

/**
 * Initialize Redis connection
 */
export async function initializeCallSessionStore(): Promise<boolean> {
  if (!isRedisConfigured()) {
    console.log(`${LOG_PREFIX} Redis not configured - using in-memory store (suitable for development)`);
    return false;
  }

  try {
    const redisUrl = getRedisUrl();
    redisClient = new Redis(redisUrl, {
      ...getRedisConnectionOptions(),
      maxRetriesPerRequest: 3,
      enableReadyCheck: true,
      lazyConnect: true,
    });
    redisClient.on('error', () => {});

    await redisClient.connect();
    
    // Test connection
    await redisClient.ping();
    redisAvailable = true;
    
    const displayUrl = redisUrl.replace(/:[^@]*@/, ':***@');
    console.log(`${LOG_PREFIX} ✅ Redis connected (${process.env.NODE_ENV || 'development'}) - call sessions will persist across instances`);
    return true;
  } catch (error) {
    console.error(`${LOG_PREFIX} ⚠️ Redis connection failed - falling back to in-memory store:`, error);
    redisClient = null;
    redisAvailable = false;
    return false;
  }
}

/**
 * Check if Redis is available
 */
export function isRedisAvailable(): boolean {
  return redisAvailable && redisClient !== null;
}


// ============================================================================
// CALL SESSION MANAGEMENT
// ============================================================================

const CALL_SESSION_PREFIX = 'call_session:';
const CALL_CONTROL_INDEX = 'call_control_index:';

/**
 * Create or update a call session
 */
export async function setCallSession(session: CallSession): Promise<void> {
  session.updatedAt = new Date().toISOString();
  
  if (isRedisAvailable() && redisClient) {
    const key = `${CALL_SESSION_PREFIX}${session.callId}`;
    const controlIndexKey = `${CALL_CONTROL_INDEX}${session.callControlId}`;
    
    const pipeline = redisClient.pipeline();
    pipeline.setex(key, CALL_SESSION_TTL, JSON.stringify(session));
    // Also index by callControlId for webhook lookups
    pipeline.setex(controlIndexKey, CALL_SESSION_TTL, session.callId);
    await pipeline.exec();
    
    console.log(`${LOG_PREFIX} Session stored in Redis: ${session.callId} (control: ${session.callControlId?.slice(0, 8)}...)`);
  } else {
    inMemoryCallSessions.set(session.callId, session);
    console.log(`${LOG_PREFIX} Session stored in memory: ${session.callId}`);
  }
}

/**
 * Get a call session by callId
 */
export async function getCallSession(callId: string): Promise<CallSession | null> {
  if (isRedisAvailable() && redisClient) {
    const key = `${CALL_SESSION_PREFIX}${callId}`;
    const data = await redisClient.get(key);
    return data ? JSON.parse(data) : null;
  } else {
    return inMemoryCallSessions.get(callId) || null;
  }
}

/**
 * Get a call session by call control ID (for webhook handling)
 */
export async function getCallSessionByControlId(callControlId: string): Promise<CallSession | null> {
  if (isRedisAvailable() && redisClient) {
    const indexKey = `${CALL_CONTROL_INDEX}${callControlId}`;
    const callId = await redisClient.get(indexKey);
    if (callId) {
      return getCallSession(callId);
    }
    return null;
  } else {
    // Linear search in memory
    for (const session of inMemoryCallSessions.values()) {
      if (session.callControlId === callControlId) {
        return session;
      }
    }
    return null;
  }
}

/**
 * Update call session status
 */
export async function updateCallSessionStatus(
  callId: string, 
  status: CallSession['status'],
  additionalUpdates?: Partial<CallSession>
): Promise<CallSession | null> {
  const session = await getCallSession(callId);
  if (!session) {
    console.warn(`${LOG_PREFIX} Cannot update status - session not found: ${callId}`);
    return null;
  }

  session.status = status;
  session.updatedAt = new Date().toISOString();
  
  if (status === 'ended') {
    session.endedAt = new Date().toISOString();
  }
  if (status === 'active' && !session.answeredAt) {
    session.answeredAt = new Date().toISOString();
  }
  
  if (additionalUpdates) {
    Object.assign(session, additionalUpdates);
  }

  await setCallSession(session);
  return session;
}

/**
 * Delete a call session
 */
export async function deleteCallSession(callId: string): Promise<void> {
  const session = await getCallSession(callId);
  
  if (isRedisAvailable() && redisClient) {
    const pipeline = redisClient.pipeline();
    pipeline.del(`${CALL_SESSION_PREFIX}${callId}`);
    if (session?.callControlId) {
      pipeline.del(`${CALL_CONTROL_INDEX}${session.callControlId}`);
    }
    await pipeline.exec();
  } else {
    inMemoryCallSessions.delete(callId);
  }
}

/**
 * Get all active call sessions (for debugging/monitoring)
 */
export async function getActiveCallSessions(): Promise<CallSession[]> {
  if (isRedisAvailable() && redisClient) {
    const keys = await redisClient.keys(`${CALL_SESSION_PREFIX}*`);
    if (keys.length === 0) return [];
    
    const pipeline = redisClient.pipeline();
    for (const key of keys) {
      pipeline.get(key);
    }
    const results = await pipeline.exec();
    
    return (results || [])
      .map(([err, data]) => data ? JSON.parse(data as string) : null)
      .filter((s): s is CallSession => s !== null && s.status !== 'ended');
  } else {
    return Array.from(inMemoryCallSessions.values())
      .filter(s => s.status !== 'ended');
  }
}

// ============================================================================
// PREVIEW SESSION MANAGEMENT
// ============================================================================

const PREVIEW_SESSION_PREFIX = 'preview_session:';

/**
 * Create a new preview session
 */
export async function createPreviewSession(
  virtualAgentId?: string,
  campaignId?: string,
  systemPrompt?: string,
  firstMessage?: string
): Promise<PreviewSession> {
  const sessionId = `preview-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
  const now = new Date();
  
  const session: PreviewSession = {
    sessionId,
    virtualAgentId,
    campaignId,
    systemPrompt,
    firstMessage,
    messages: [],
    conversationState: {
      identityConfirmed: false,
      currentStage: 'IDENTITY_CHECK',
    },
    createdAt: now.toISOString(),
    updatedAt: now.toISOString(),
    expiresAt: new Date(now.getTime() + PREVIEW_SESSION_TTL * 1000).toISOString(),
  };

  await setPreviewSession(session);
  return session;
}

/**
 * Store a preview session
 */
export async function setPreviewSession(session: PreviewSession): Promise<void> {
  session.updatedAt = new Date().toISOString();
  
  if (isRedisAvailable() && redisClient) {
    const key = `${PREVIEW_SESSION_PREFIX}${session.sessionId}`;
    await redisClient.setex(key, PREVIEW_SESSION_TTL, JSON.stringify(session));
  } else {
    inMemoryPreviewSessions.set(session.sessionId, session);
  }
}

/**
 * Get a preview session
 */
export async function getPreviewSession(sessionId: string): Promise<PreviewSession | null> {
  if (isRedisAvailable() && redisClient) {
    const key = `${PREVIEW_SESSION_PREFIX}${sessionId}`;
    const data = await redisClient.get(key);
    if (!data) return null;
    
    const session = JSON.parse(data) as PreviewSession;
    // Check expiry
    if (new Date(session.expiresAt) < new Date()) {
      await redisClient.del(key);
      return null;
    }
    return session;
  } else {
    const session = inMemoryPreviewSessions.get(sessionId);
    if (!session) return null;
    // Check expiry
    if (new Date(session.expiresAt) < new Date()) {
      inMemoryPreviewSessions.delete(sessionId);
      return null;
    }
    return session;
  }
}

/**
 * Add a message to a preview session
 */
export async function addPreviewMessage(
  sessionId: string,
  role: 'user' | 'assistant',
  content: string
): Promise<PreviewSession | null> {
  const session = await getPreviewSession(sessionId);
  if (!session) return null;

  session.messages.push({
    role,
    content,
    timestamp: new Date().toISOString(),
  });
  
  // Update conversation state based on messages
  if (role === 'user') {
    const identityConfirmPatterns = [
      'yes', 'yeah', 'yep', 'yup', 'speaking',
      'this is me', "that's me", "it's me", "it is me",
    ];
    const contentLower = content.toLowerCase();
    if (identityConfirmPatterns.some(p => contentLower.includes(p))) {
      session.conversationState.identityConfirmed = true;
      session.conversationState.currentStage = 'RIGHT_PARTY_INTRO';
    }
  }

  await setPreviewSession(session);
  return session;
}

/**
 * Delete a preview session
 */
export async function deletePreviewSession(sessionId: string): Promise<void> {
  if (isRedisAvailable() && redisClient) {
    await redisClient.del(`${PREVIEW_SESSION_PREFIX}${sessionId}`);
  } else {
    inMemoryPreviewSessions.delete(sessionId);
  }
}

// ============================================================================
// VALIDATION & HEALTH
// ============================================================================

/**
 * Validate that a call control ID is still valid
 */
export async function validateCallControlId(callControlId: string): Promise<{
  valid: boolean;
  reason?: string;
  session?: CallSession;
}> {
  const session = await getCallSessionByControlId(callControlId);
  
  if (!session) {
    return {
      valid: false,
      reason: 'Call control ID not found in session store. Possible causes: wrong environment credentials, session expired, or cross-instance state loss.',
    };
  }

  if (session.status === 'ended') {
    return {
      valid: false,
      reason: `Call has already ended at ${session.endedAt}`,
      session,
    };
  }

  // Check for stale sessions (no update in last 5 minutes during active call)
  const lastUpdate = new Date(session.updatedAt);
  const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);
  if (session.status === 'active' && lastUpdate < fiveMinutesAgo) {
    return {
      valid: false,
      reason: `Session appears stale - last update was ${session.updatedAt}`,
      session,
    };
  }

  return {
    valid: true,
    session,
  };
}

/**
 * Get session store health status
 */
export async function getSessionStoreHealth(): Promise<{
  status: 'healthy' | 'degraded' | 'unhealthy';
  backend: 'redis' | 'in-memory';
  activeCallSessions: number;
  previewSessions: number;
  warning?: string;
}> {
  const activeSessions = await getActiveCallSessions();
  
  let previewCount = 0;
  if (isRedisAvailable() && redisClient) {
    const keys = await redisClient.keys(`${PREVIEW_SESSION_PREFIX}*`);
    previewCount = keys.length;
  } else {
    previewCount = inMemoryPreviewSessions.size;
  }

  const isProduction = process.env.NODE_ENV === 'production';
  const usingInMemory = !isRedisAvailable();

  return {
    status: isProduction && usingInMemory ? 'degraded' : 'healthy',
    backend: isRedisAvailable() ? 'redis' : 'in-memory',
    activeCallSessions: activeSessions.length,
    previewSessions: previewCount,
    warning: isProduction && usingInMemory 
      ? 'Using in-memory store in production - call control IDs may fail across instances' 
      : undefined,
  };
}

// Auto-initialize on module load
initializeCallSessionStore().catch(err => {
  console.error(`${LOG_PREFIX} Failed to initialize:`, err);
});

// ============================================================================
// CALL CUSTOM PARAMS STORE (for large data like system_prompt)
// ============================================================================

const CALL_PARAMS_PREFIX = 'call_params:';
const CALL_PARAMS_TTL = 3600; // 1 hour

export interface CallCustomParams {
  call_id: string;
  run_id?: string;
  campaign_id?: string;
  queue_item_id?: string;
  call_attempt_id?: string;
  contact_id?: string;
  virtual_agent_id?: string;
  called_number?: string;
  is_test_call?: boolean;
  test_call_id?: string;
  system_prompt?: string;
  first_message?: string;
  voice?: string;
  agent_name?: string;
  test_contact?: {
    name?: string;
    company?: string;
    title?: string;
    email?: string;
  };
  provider?: string;
  // OpenAI Realtime configuration (from Preview Studio)
  openai_config?: {
    turn_detection?: 'server_vad' | 'semantic' | 'disabled';
    eagerness?: 'low' | 'medium' | 'high';
    max_tokens?: number;
  };
  // Preview test specific
  is_preview_test?: boolean;
  preview_session_id?: string;
  [key: string]: unknown;
}

const inMemoryCallParams = new Map<string, CallCustomParams>();

/**
 * Store call custom params (for large data like system_prompt)
 */
export async function setCallParams(callId: string, params: CallCustomParams): Promise<void> {
  const key = `${CALL_PARAMS_PREFIX}${callId}`;
  
  if (isRedisAvailable() && redisClient) {
    await redisClient.setex(key, CALL_PARAMS_TTL, JSON.stringify(params));
    console.log(`${LOG_PREFIX} Stored call params in Redis for ${callId}`);
  } else {
    inMemoryCallParams.set(callId, params);
    console.log(`${LOG_PREFIX} Stored call params in memory for ${callId}`);
    // Auto-cleanup after TTL
    setTimeout(() => inMemoryCallParams.delete(callId), CALL_PARAMS_TTL * 1000);
  }
}

/**
 * Get call custom params
 */
export async function getCallParams(callId: string): Promise<CallCustomParams | null> {
  const key = `${CALL_PARAMS_PREFIX}${callId}`;
  
  if (isRedisAvailable() && redisClient) {
    const data = await redisClient.get(key);
    if (data) {
      console.log(`${LOG_PREFIX} Retrieved call params from Redis for ${callId}`);
      return JSON.parse(data);
    }
  } else {
    const params = inMemoryCallParams.get(callId);
    if (params) {
      console.log(`${LOG_PREFIX} Retrieved call params from memory for ${callId}`);
      return params;
    }
  }
  
  console.log(`${LOG_PREFIX} No call params found for ${callId}`);
  return null;
}

/**
 * Delete call custom params
 */
export async function deleteCallParams(callId: string): Promise<void> {
  const key = `${CALL_PARAMS_PREFIX}${callId}`;
  
  if (isRedisAvailable() && redisClient) {
    await redisClient.del(key);
  } else {
    inMemoryCallParams.delete(callId);
  }
  console.log(`${LOG_PREFIX} Deleted call params for ${callId}`);
}

// Export compatibility wrapper
export const callSessionStore = {
  setSession: setCallParams,
  getSession: getCallParams,
  deleteSession: deleteCallParams,
};
