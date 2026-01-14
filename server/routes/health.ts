import { Router } from "express";
import {
  getSessionStoreHealth,
  validateCallControlId,
  getActiveCallSessions,
  isRedisAvailable,
} from "../services/call-session-store";

const router = Router();

/**
 * Health check endpoint for Cloud Run and load balancers
 * Returns 200 if the service is healthy
 */
router.get("/health", async (req, res) => {
  try {
    // Basic health check - service is running
    const health = {
      status: "healthy",
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      environment: process.env.NODE_ENV || "development",
    };

    // Log health check for Cloud Run log validation
    console.log(`[Health Check] ${health.timestamp} - Status: ${health.status}, Uptime: ${Math.floor(health.uptime)}s`);

    res.status(200).json(health);
  } catch (error) {
    // Log errors for Cloud Run error tracking
    console.error(`[Health Check Error] ${new Date().toISOString()} - ${error instanceof Error ? error.message : 'Unknown error'}`);
    res.status(503).json({
      status: "unhealthy",
      timestamp: new Date().toISOString(),
      error: error instanceof Error ? error.message : "Unknown error",
    });
  }
});

/**
 * Readiness check - verifies database connectivity
 */
router.get("/ready", async (req, res) => {
  try {
    // Import db to check connection
    const { db } = await import("../db");
    const { sql } = await import("drizzle-orm");
    
    // Simple query to verify DB connection
    await db.execute(sql`SELECT 1`);

    res.status(200).json({
      status: "ready",
      timestamp: new Date().toISOString(),
      database: "connected",
    });
  } catch (error) {
    res.status(503).json({
      status: "not_ready",
      timestamp: new Date().toISOString(),
      database: "disconnected",
      error: error instanceof Error ? error.message : "Database connection failed",
    });
  }
});

/**
 * Call orchestration health check
 * Validates Telnyx credentials, WebSocket URLs, and session store health
 * This helps diagnose "invalid call control ID" errors in production
 */
router.get("/call-orchestration", async (req, res) => {
  try {
    const sessionStoreHealth = await getSessionStoreHealth();
    const activeSessions = await getActiveCallSessions();
    
    // Validate environment configuration
    const telnyxApiKey = process.env.TELNYX_API_KEY;
    const telnyxConnectionId = process.env.TELNYX_CALL_CONTROL_APP_ID || process.env.TELNYX_CONNECTION_ID || process.env.TELNYX_SIP_CONNECTION_ID;
    const publicWebsocketUrl = process.env.PUBLIC_WEBSOCKET_URL;
    const telnyxFromNumber = process.env.TELNYX_FROM_NUMBER;
    
    const envValidation = {
      TELNYX_API_KEY: {
        configured: !!telnyxApiKey,
        prefix: telnyxApiKey ? telnyxApiKey.slice(0, 10) + '...' : null,
      },
      TELNYX_CONNECTION_ID: {
        configured: !!telnyxConnectionId,
        value: telnyxConnectionId || null,
      },
      PUBLIC_WEBSOCKET_URL: {
        configured: !!publicWebsocketUrl,
        value: publicWebsocketUrl || null,
        isProduction: publicWebsocketUrl?.includes('demandgentic.ai') || false,
      },
      TELNYX_FROM_NUMBER: {
        configured: !!telnyxFromNumber,
        value: telnyxFromNumber || null,
      },
      REDIS_URL: {
        configured: !!process.env.REDIS_URL,
        connected: isRedisAvailable(),
      },
    };

    // Check for common production issues
    const warnings: string[] = [];
    
    if (!telnyxApiKey) {
      warnings.push('TELNYX_API_KEY not configured - calls will fail');
    }
    if (!telnyxConnectionId) {
      warnings.push('No Telnyx connection ID configured (TELNYX_CALL_CONTROL_APP_ID, TELNYX_CONNECTION_ID, or TELNYX_SIP_CONNECTION_ID)');
    }
    if (!publicWebsocketUrl) {
      warnings.push('PUBLIC_WEBSOCKET_URL not configured - media streaming will fail');
    }
    if (process.env.NODE_ENV === 'production' && !isRedisAvailable()) {
      warnings.push('Running in production without Redis - call control IDs may fail across instances (use sticky sessions as workaround)');
    }
    if (publicWebsocketUrl && !publicWebsocketUrl.startsWith('wss://')) {
      warnings.push('PUBLIC_WEBSOCKET_URL should use wss:// for secure connections');
    }

    const overallStatus = warnings.length === 0 ? 'healthy' : 
                         warnings.some(w => w.includes('will fail')) ? 'unhealthy' : 'degraded';

    res.status(overallStatus === 'unhealthy' ? 503 : 200).json({
      status: overallStatus,
      timestamp: new Date().toISOString(),
      sessionStore: sessionStoreHealth,
      activeCalls: {
        count: activeSessions.length,
        sessions: activeSessions.map(s => ({
          callId: s.callId,
          status: s.status,
          provider: s.provider,
          createdAt: s.createdAt,
          isTest: s.isTestSession,
        })),
      },
      environment: envValidation,
      warnings,
      diagnosticTips: warnings.length > 0 ? [
        'Check that prod and dev environments use different Telnyx API keys',
        'Ensure PUBLIC_WEBSOCKET_URL matches your deployed domain',
        'Verify webhook URL is accessible from Telnyx servers',
        'Enable Redis for production multi-instance deployments',
      ] : [],
    });
  } catch (error) {
    res.status(503).json({
      status: "error",
      timestamp: new Date().toISOString(),
      error: error instanceof Error ? error.message : "Health check failed",
    });
  }
});

/**
 * Validate a specific call control ID
 * Useful for debugging "invalid call control ID" errors
 */
router.get("/validate-call/:callControlId", async (req, res) => {
  try {
    const { callControlId } = req.params;
    const validation = await validateCallControlId(callControlId);
    
    res.status(validation.valid ? 200 : 404).json({
      callControlId,
      ...validation,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    res.status(500).json({
      error: error instanceof Error ? error.message : "Validation failed",
    });
  }
});

export default router;
