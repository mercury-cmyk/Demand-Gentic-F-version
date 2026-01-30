/**
 * In-memory store for pending call state.
 * 
 * This is used to pass call context from the TeXML endpoint to the voice-dialer WebSocket
 * without putting the entire context in the URL (which causes issues with URL length limits).
 * 
 * Flow:
 * 1. TeXML endpoint stores context here with call_id as key
 * 2. TeXML returns WebSocket URL with only call_id parameter
 * 3. Voice-dialer retrieves context from here when WebSocket connects
 * 4. Context is automatically cleaned up after TTL expires
 */

interface PendingCallState {
  context: Record<string, any>;
  createdAt: number;
}

// TTL for pending call state (5 minutes - calls should connect much faster)
const STATE_TTL_MS = 5 * 60 * 1000;

// Cleanup interval (every minute)
const CLEANUP_INTERVAL_MS = 60 * 1000;

// In-memory store for pending call state
const pendingCallState = new Map<string, PendingCallState>();

// Start cleanup interval
let cleanupInterval: ReturnType<typeof setInterval> | null = null;

function startCleanupInterval(): void {
  if (cleanupInterval) return;
  
  cleanupInterval = setInterval(() => {
    const now = Date.now();
    let cleaned = 0;
    
    for (const [callId, state] of pendingCallState) {
      if (now - state.createdAt > STATE_TTL_MS) {
        pendingCallState.delete(callId);
        cleaned++;
      }
    }
    
    if (cleaned > 0) {
      console.log(`[PendingCallState] Cleaned up ${cleaned} expired entries. Remaining: ${pendingCallState.size}`);
    }
  }, CLEANUP_INTERVAL_MS);
}

// Start cleanup on module load
startCleanupInterval();

/**
 * Store call context for later retrieval by voice-dialer
 */
export function storePendingCallState(callId: string, context: Record<string, any>): void {
  pendingCallState.set(callId, {
    context,
    createdAt: Date.now(),
  });
  console.log(`[PendingCallState] Stored state for call ${callId}. Total pending: ${pendingCallState.size}`);
}

/**
 * Retrieve and optionally consume call context
 * @param callId The call ID to look up
 * @param consume If true, removes the state after retrieval (default: true)
 */
export function getPendingCallState(callId: string, consume: boolean = true): Record<string, any> | null {
  const state = pendingCallState.get(callId);
  
  if (!state) {
    console.log(`[PendingCallState] No state found for call ${callId}`);
    return null;
  }
  
  if (consume) {
    pendingCallState.delete(callId);
    console.log(`[PendingCallState] Retrieved and consumed state for call ${callId}. Remaining: ${pendingCallState.size}`);
  } else {
    console.log(`[PendingCallState] Retrieved state for call ${callId} (not consumed)`);
  }
  
  return state.context;
}

/**
 * Check if state exists for a call ID
 */
export function hasPendingCallState(callId: string): boolean {
  return pendingCallState.has(callId);
}

/**
 * Get count of pending call states (for monitoring)
 */
export function getPendingCallStateCount(): number {
  return pendingCallState.size;
}
