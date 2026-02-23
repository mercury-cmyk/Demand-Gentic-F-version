import { Router } from "express";
import {
  getSessionStoreHealth,
  validateCallControlId,
  getActiveCallSessions,
  isRedisAvailable,
} from "../services/call-session-store";
import { poolMetrics } from "../db";
import { getAiConcurrencyStats } from "../lib/ai-concurrency";
import { getVertexThrottleStats } from "../services/vertex-ai/vertex-client";

const router = Router();

/**
 * Health check endpoint for Cloud Run and load balancers
 * Returns 200 if the service is healthy
 */
router.get("/health", async (req, res) => {
  try {
    const dbStats = poolMetrics.getStats();
    const aiStats = getAiConcurrencyStats();
    const vertexStats = getVertexThrottleStats();

    // Basic health check - service is running
    const health = {
      status: "healthy",
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      environment: process.env.NODE_ENV || "development",
      build: {
        gitSha: process.env.APP_GIT_SHA || process.env.COMMIT_SHA || null,
        revision: process.env.K_REVISION || null,
        service: process.env.K_SERVICE || null,
      },
      dbPool: dbStats,
      aiConcurrency: aiStats,
      vertexThrottle: vertexStats,
      memory: {
        rss: Math.round(process.memoryUsage().rss / 1024 / 1024),
        heapUsed: Math.round(process.memoryUsage().heapUsed / 1024 / 1024),
        heapTotal: Math.round(process.memoryUsage().heapTotal / 1024 / 1024),
      },
    };

    // Degrade if DB pool, AI concurrency, or Vertex throttle are stressed
    if (!dbStats.isHealthy || aiStats.queued > 20 || vertexStats.globalCooldownRemainingMs > 0) {
      (health as any).status = "degraded";
    }

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

/**
 * Runtime configuration diagnostics (admin-only, no secrets).
 * Shows environment settings useful for debugging production issues.
 */
router.get("/config-diagnostics", async (req, res) => {
  // Only allow in authenticated admin context or when called from health-check user agents
  const authHeader = req.headers['authorization'];
  if (!authHeader) {
    return res.status(401).json({ error: 'Authentication required' });
  }

  try {
    // Verify admin role via JWT 
    const { default: jwt } = await import('jsonwebtoken');
    const token = authHeader.replace('Bearer ', '');
    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'dev-secret') as any;
    if (decoded.role !== 'ADMIN' && decoded.role !== 'SUPER_ADMIN') {
      return res.status(403).json({ error: 'Admin access required' });
    }
  } catch {
    return res.status(401).json({ error: 'Invalid token' });
  }

  const hasEnvVar = (key: string) => !!process.env[key];

  res.json({
    timestamp: new Date().toISOString(),
    environment: {
      NODE_ENV: process.env.NODE_ENV || 'not-set',
      PORT: process.env.PORT || '8080',
    },
    services: {
      database: hasEnvVar('DATABASE_URL'),
      redis: hasEnvVar('REDIS_URL') || hasEnvVar('REDIS_URL_PROD'),
      redisAvailable: isRedisAvailable(),
      telnyxConfigured: hasEnvVar('TELNYX_API_KEY'),
      geminiConfigured: hasEnvVar('GEMINI_API_KEY') || hasEnvVar('GOOGLE_AI_API_KEY'),
      openaiConfigured: hasEnvVar('OPENAI_API_KEY'),
      mailgunConfigured: hasEnvVar('MAILGUN_API_KEY'),
      webhookHost: process.env.PUBLIC_WEBHOOK_HOST ? '(set)' : '(not set)',
      websocketUrl: process.env.PUBLIC_WEBSOCKET_URL ? '(set)' : '(not set)',
    },
    runtime: {
      uptime: Math.floor(process.uptime()),
      nodeVersion: process.version,
      platform: process.platform,
      memoryUsage: {
        rss: Math.round(process.memoryUsage().rss / 1024 / 1024) + ' MB',
        heapUsed: Math.round(process.memoryUsage().heapUsed / 1024 / 1024) + ' MB',
      },
    },
  });
});

export default router;
