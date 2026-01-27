/**
 * SIP-Only Enforcement for Gemini Live Calls
 *
 * This module ensures that ALL Gemini Live AI calls MUST use the drachtio-srf
 * SIP server as the exclusive transport layer.
 *
 * Enforced constraints:
 * 1. Gemini Live calls MUST route through SIP
 * 2. No fallback to Telnyx, WebRTC, or other providers
 * 3. SIP server must be healthy and initialized
 * 4. All media bridges must use SIP transport
 *
 * Integration points:
 * - Voice Dialer: Check before initiating any Gemini Live call
 * - Campaign Orchestrator: Validate SIP availability before dispatching calls
 * - Call Router: Route ALL Gemini Live through SIP gateway
 */

import { drachtioServer } from './sip/drachtio-server';
import { initializeGeminiLiveSIPGateway, enforceGeminiLiveSIPOnly } from './gemini-live-sip-gateway';

const log = (msg: string) => {
  console.log(`[Gemini Live SIP Enforcement] ${msg}`);
};

const logError = (msg: string, error?: any) => {
  console.error(`[Gemini Live SIP Enforcement] ${msg}`, error || '');
};

/**
 * Initialize SIP-only enforcement for Gemini Live
 *
 * Must be called during application startup BEFORE any Gemini Live
 * calls can be processed.
 */
export async function initializeGeminiLiveSIPEnforcement(): Promise<boolean> {
  log('Initializing SIP-only enforcement for Gemini Live calls...');

  try {
    // Verify environment is configured for SIP
    if (process.env.USE_SIP_CALLING !== 'true') {
      logError('CRITICAL: USE_SIP_CALLING is not enabled!');
      logError('Cannot use Gemini Live without SIP support.');
      logError('Set USE_SIP_CALLING=true to enable SIP calling.');
      return false;
    }

    // Initialize SIP gateway
    if (!(await initializeGeminiLiveSIPGateway())) {
      logError('CRITICAL: Failed to initialize Gemini Live SIP Gateway');
      return false;
    }

    // Verify Drachtio server is ready
    if (!drachtioServer) {
      logError('CRITICAL: Drachtio SIP server not available');
      return false;
    }

    const health = await drachtioServer.healthCheck();
    if (!health) {
      logError('CRITICAL: Drachtio SIP server is unhealthy');
      return false;
    }

    log('✓ SIP-only enforcement initialized successfully');
    log('✓ Gemini Live calls will use SIP transport exclusively');

    return true;
  } catch (error) {
    logError('Failed to initialize SIP-only enforcement', error);
    return false;
  }
}

/**
 * Validate that a call can use Gemini Live (enforces SIP requirement)
 */
export function validateGeminiLiveSIPCall(callDetails: {
  campaignId: string;
  contactId: string;
  toNumber: string;
  fromNumber: string;
}): { valid: boolean; reason?: string } {
  // Enforce SIP-only
  try {
    enforceGeminiLiveSIPOnly();
  } catch (error) {
    return {
      valid: false,
      reason: `SIP enforcement failed: ${error instanceof Error ? error.message : String(error)}`,
    };
  }

  // Validate required fields
  if (!callDetails.toNumber) {
    return { valid: false, reason: 'Missing destination number' };
  }
  if (!callDetails.fromNumber) {
    return { valid: false, reason: 'Missing source number' };
  }
  if (!callDetails.campaignId) {
    return { valid: false, reason: 'Missing campaign ID' };
  }

  return { valid: true };
}

/**
 * Pre-flight check before routing a Gemini Live call
 *
 * Call this before attempting to initiate ANY Gemini Live call
 * to ensure SIP infrastructure is ready.
 */
export async function preflightGeminiLiveSIPCheck(): Promise<{
  ready: boolean;
  issues: string[];
}> {
  const issues: string[] = [];

  // Check environment
  if (process.env.USE_SIP_CALLING !== 'true') {
    issues.push('SIP calling disabled');
  }

  // Check SIP server
  if (!drachtioServer) {
    issues.push('Drachtio SIP server not initialized');
  } else {
    try {
      const health = await drachtioServer.healthCheck();
      if (!health) {
        issues.push('Drachtio SIP server unhealthy');
      }
    } catch (error) {
      issues.push(`SIP health check failed: ${error}`);
    }
  }

  // Check SIP ports
  if (process.env.SIP_LISTEN_PORT === undefined) {
    issues.push('SIP_LISTEN_PORT not configured');
  }

  if (process.env.RTP_PORT_MIN === undefined || process.env.RTP_PORT_MAX === undefined) {
    issues.push('RTP port range not configured');
  }

  return {
    ready: issues.length === 0,
    issues,
  };
}

/**
 * Create a wrapper function for initiating Gemini Live calls
 *
 * This ensures ALL call initiation goes through SIP enforcement.
 * Use this instead of direct initiateGeminiLiveCall() calls.
 */
export function createGeminiLiveSIPCallInitiator() {
  return async (callParams: {
    toNumber: string;
    fromNumber: string;
    campaignId: string;
    contactId: string;
    queueItemId: string;
    systemPrompt: string;
    voiceName?: string;
    maxCallDurationSeconds?: number;
  }) => {
    // Validate SIP requirements
    const validation = validateGeminiLiveSIPCall({
      campaignId: callParams.campaignId,
      contactId: callParams.contactId,
      toNumber: callParams.toNumber,
      fromNumber: callParams.fromNumber,
    });

    if (!validation.valid) {
      throw new Error(`Gemini Live SIP validation failed: ${validation.reason}`);
    }

    // Pre-flight check
    const preflight = await preflightGeminiLiveSIPCheck();
    if (!preflight.ready) {
      throw new Error(
        `Gemini Live SIP preflight failed: ${preflight.issues.join(', ')}`
      );
    }

    // Import here to avoid circular dependencies
    const { initiateGeminiLiveCall } = await import('./gemini-live-sip-gateway');

    // Initiate call through SIP gateway
    return initiateGeminiLiveCall({
      toNumber: callParams.toNumber,
      fromNumber: callParams.fromNumber,
      campaignId: callParams.campaignId,
      contactId: callParams.contactId,
      queueItemId: callParams.queueItemId,
      systemPrompt: callParams.systemPrompt,
      voiceName: callParams.voiceName,
      maxCallDurationSeconds: callParams.maxCallDurationSeconds,
    });
  };
}

/**
 * Middleware: Enforce SIP for Gemini Live in HTTP handlers
 */
export function enforceGeminiLiveSIPMiddleware() {
  return async (
    req: any,
    res: any,
    next: any
  ) => {
    // Check if this is a Gemini Live call request
    const isGeminiLiveCall = req.body?.provider === 'gemini-live' ||
      req.path?.includes('gemini-live');

    if (isGeminiLiveCall) {
      // Validate SIP requirements
      const preflight = await preflightGeminiLiveSIPCheck();
      if (!preflight.ready) {
        return res.status(503).json({
          error: 'SIP infrastructure not ready for Gemini Live',
          issues: preflight.issues,
        });
      }

      // Enforce SIP-only routing
      req.headers['x-force-sip'] = 'true';
      req.body.useSIPOnly = true;
    }

    next();
  };
}

/**
 * Guard function: Prevent non-SIP Gemini Live calls
 */
export function preventNonSIPGeminiLiveCalls(callProvider: string): boolean {
  // If it's Gemini Live, MUST use SIP
  if (callProvider === 'gemini-live') {
    try {
      enforceGeminiLiveSIPOnly();
      return true; // SIP is enforced
    } catch (error) {
      logError('Non-SIP Gemini Live call attempt detected!', error);
      return false; // Reject non-SIP call
    }
  }

  // Other providers can use their own transports
  return true;
}

/**
 * Status check endpoint data
 */
export async function getGeminiLiveSIPStatus() {
  const preflight = await preflightGeminiLiveSIPCheck();
  const stats = drachtioServer?.getStats();

  return {
    enforcement: {
      enabled: process.env.USE_SIP_CALLING === 'true',
      required: true,
      status: preflight.ready ? 'ready' : 'degraded',
      issues: preflight.issues,
    },
    sipServer: {
      initialized: !!drachtioServer,
      healthy: preflight.ready && preflight.issues.length === 0,
      stats,
    },
  };
}

// Export for use in initialization
export { initiateGeminiLiveCall } from './gemini-live-sip-gateway';
export { enforceGeminiLiveSIPOnly } from './gemini-live-sip-gateway';
