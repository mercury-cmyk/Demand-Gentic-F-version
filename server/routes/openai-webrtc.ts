/**
 * OpenAI Realtime WebRTC Ephemeral Token Endpoint
 * 
 * Provides ephemeral session credentials for OpenAI Realtime WebRTC connections.
 * Client NEVER holds long-lived OpenAI API keys - server issues short-lived tokens.
 * 
 * Per OpenAI Realtime WebRTC guide:
 * 1. Client requests ephemeral token from this endpoint
 * 2. Server creates session with OpenAI and returns ephemeral credentials
 * 3. Client uses ephemeral credentials for WebRTC SDP exchange
 */

import { Router, Request, Response } from "express";
import { requireAuth } from "../auth";

const router = Router();
const LOG_PREFIX = "[OpenAI-WebRTC-Ephemeral]";

interface EphemeralTokenRequest {
  model?: string;
  voice?: string;
  instructions?: string;
}

interface EphemeralTokenResponse {
  token: string;
  expires_at: number;
}

/**
 * POST /api/openai/webrtc/ephemeral-token
 * 
 * Creates an ephemeral session token for OpenAI Realtime WebRTC.
 * Requires authentication - user must be logged in.
 */
router.post("/ephemeral-token", requireAuth, async (req: Request, res: Response) => {
  try {
    const { model, voice, instructions } = req.body as EphemeralTokenRequest;
    
    const apiKey = process.env.AI_INTEGRATIONS_OPENAI_API_KEY || process.env.OPENAI_API_KEY;
    if (!apiKey) {
      console.error(`${LOG_PREFIX} OpenAI API key not configured`);
      return res.status(500).json({ error: "OpenAI not configured" });
    }

    const selectedModel = model || "gpt-4o-realtime-preview-2024-12-17";
    
    console.log(`${LOG_PREFIX} Creating ephemeral token for user ${(req as any).user?.id || 'unknown'}`);

    // Create session with OpenAI
    // Per OpenAI docs: POST to /v1/realtime/sessions to get ephemeral client_secret
    const response = await fetch("https://api.openai.com/v1/realtime/sessions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: selectedModel,
        voice: voice || "alloy",
        instructions: instructions || "You are a helpful assistant.",
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`${LOG_PREFIX} OpenAI session creation failed:`, errorText);
      return res.status(response.status).json({ 
        error: "Failed to create OpenAI session",
        details: errorText,
      });
    }

    const sessionData = await response.json() as {
      id: string;
      client_secret: {
        value: string;
        expires_at: number;
      };
    };

    console.log(`${LOG_PREFIX} Ephemeral token created, expires at:`, 
      new Date(sessionData.client_secret.expires_at * 1000).toISOString());

    // Return ephemeral token to client
    const result: EphemeralTokenResponse = {
      token: sessionData.client_secret.value,
      expires_at: sessionData.client_secret.expires_at,
    };

    return res.json(result);

  } catch (error) {
    console.error(`${LOG_PREFIX} Error creating ephemeral token:`, error);
    return res.status(500).json({ 
      error: "Internal server error",
      message: error instanceof Error ? error.message : "Unknown error",
    });
  }
});

/**
 * GET /api/openai/webrtc/status
 * 
 * Health check for WebRTC endpoint.
 */
router.get("/status", (_req: Request, res: Response) => {
  const apiKey = process.env.AI_INTEGRATIONS_OPENAI_API_KEY || process.env.OPENAI_API_KEY;
  return res.json({
    configured: !!apiKey,
    endpoint: "openai-realtime-webrtc",
  });
});

export default router;
