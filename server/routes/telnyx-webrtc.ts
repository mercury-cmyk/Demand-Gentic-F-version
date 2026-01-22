/**
 * Telnyx WebRTC Credentials Endpoint
 * 
 * Provides Telnyx WebRTC credentials for browser-based calling.
 * Uses credential connection authentication.
 */

import { Router, Request, Response } from "express";
import { requireAuth } from "../auth";
import { storage } from "../storage";

const router = Router();
const LOG_PREFIX = "[Telnyx-WebRTC]";
// NOTE: The Telnyx SDK handles signaling internally - we don't expose wsServer to clients
// The SDK connects to the appropriate signaling server automatically

interface TelnyxWebRTCCredentials {
  username: string;
  password: string;
  callerIdNumber?: string;
  callerIdName?: string;
}

/**
 * GET /api/telnyx/webrtc/credentials
 * 
 * Returns Telnyx WebRTC credentials for the authenticated user.
 * Requires authentication - user must be logged in.
 * PRIORITY: Database config first, then environment variables as fallback
 */
router.get("/credentials", requireAuth, async (req: Request, res: Response) => {
  try {
    let username: string | undefined;
    let password: string | undefined;
    let callerIdNumber: string | undefined;
    // NOTE: The Telnyx SDK handles signaling automatically - no wsServer needed

    // PRIORITY 1: Use environment variables for WebRTC (WebRTC credentials are different from SIP trunk)
    username = process.env.TELNYX_WEBRTC_USERNAME || process.env.TELNYX_SIP_USERNAME;
    password = process.env.TELNYX_WEBRTC_PASSWORD || process.env.TELNYX_SIP_PASSWORD;
    callerIdNumber = process.env.TELNYX_FROM_NUMBER;

    // FALLBACK: Try database config only if env vars not set
    if (!username || !password) {
      const config = await storage.getDefaultSipTrunkConfig();
      if (config) {
        console.log(`${LOG_PREFIX} Using database config: ${config.name}`);
        username = config.sipUsername;
        password = config.sipPassword;
        callerIdNumber = config.callerIdNumber || callerIdNumber;
      }
    } else {
      console.log(`${LOG_PREFIX} Using environment variables for WebRTC credentials`);
    }
    
    if (!username || !password) {
      console.error(`${LOG_PREFIX} Telnyx WebRTC credentials not configured in database or environment`);
      return res.status(500).json({ error: "Telnyx WebRTC not configured" });
    }

    console.log(`${LOG_PREFIX} Providing credentials for user ${(req as any).user?.id || 'unknown'}`);

    const credentials: TelnyxWebRTCCredentials = {
      username,
      password,
      callerIdNumber,
      callerIdName: (req as any).user?.username || 'Agent',
    };

    return res.json(credentials);

  } catch (error) {
    console.error(`${LOG_PREFIX} Error providing credentials:`, error);
    return res.status(500).json({ 
      error: "Internal server error",
      message: error instanceof Error ? error.message : "Unknown error",
    });
  }
});

/**
 * GET /api/telnyx/webrtc/status
 * 
 * Health check for Telnyx WebRTC endpoint.
 */
router.get("/status", (_req: Request, res: Response) => {
  const username = process.env.TELNYX_WEBRTC_USERNAME;
  const password = process.env.TELNYX_WEBRTC_PASSWORD;
  
  return res.json({
    configured: !!(username && password),
    endpoint: "telnyx-webrtc",
  });
});

export default router;
