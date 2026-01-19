// Suppress noisy warnings FIRST (before any other imports)
import "./suppress-warnings";

// Validate and load environment variables
import "./env";

// Global Error Handlers - catch unhandled exceptions to prevent silent crashes
process.on('unhandledRejection', (reason, promise) => {
  console.error('[CRITICAL] Unhandled Rejection:', reason);
  // Don't exit here, just log it. 
  // In production you might want to exit, but for dev debugging we want to see it.
});

process.on('uncaughtException', (err) => {
  console.error('[CRITICAL] Uncaught Exception:', err);
  // Keep process alive if possible during dev
});

import express, { type Request, Response, NextFunction } from "express";
import { createServer } from "http";
import compression from "compression";
import { registerRoutes } from "./routes";
import { serveStatic } from "./static";
import { log } from "./log";
import { initializeDatabase } from "./db-init";
import { autoDialerService } from "./services/auto-dialer";
import { LogStreamingService } from "./services/log-streaming-service";
import {
  apiLimiter,
  securityHeaders,
  captureClientIP,
  sanitizeBody,
  PAYLOAD_LIMITS
} from "./middleware/security";
import type { WebSocket as WsWebSocket } from 'ws';

const app = express();

// Trust Replit proxy for accurate client IP detection (required for rate limiting)
// Replit runs behind a reverse proxy that sets X-Forwarded-For header
app.set('trust proxy', 1);

// Apply security middleware early in the stack
app.use(securityHeaders); // Set security headers on all responses
app.use(captureClientIP); // Capture client IP for audit logging

// Enable response compression for better performance with large datasets
app.use(compression({
  filter: (req, res) => {
    // Skip compression for WebSocket upgrades
    if (req.headers.upgrade === 'websocket') {
      return false;
    }
    if (req.headers['x-no-compression']) {
      return false;
    }
    return compression.filter(req, res);
  },
  level: 6, // Compression level (0-9, 6 is default balance)
}));

// Payload size limits (防止 DOS attacks)
// Capture raw body for webhook signature verification
app.use(express.json({ 
  limit: PAYLOAD_LIMITS.json,
  verify: (req: any, res, buf) => {
    // Store raw body for signature verification (used by media/webhook providers)
    req.rawBody = buf.toString('utf8');
  }
}));
app.use(express.urlencoded({ extended: false, limit: PAYLOAD_LIMITS.urlencoded }));

// Sanitize all incoming request bodies (BEFORE validation)
app.use(sanitizeBody); // Remove HTML/SQL injection patterns

app.use((req, res, next) => {
  const start = Date.now();
  const path = req.path;
  let capturedJsonResponse: Record<string, any> | undefined = undefined;

  const originalResJson = res.json;
  res.json = function (bodyJson, ...args) {
    capturedJsonResponse = bodyJson;
    return originalResJson.apply(res, [bodyJson, ...args]);
  };

  res.on("finish", () => {
    const duration = Date.now() - start;
    if (path.startsWith("/api")) {
      let logLine = `${req.method} ${path} ${res.statusCode} in ${duration}ms`;
      if (capturedJsonResponse) {
        logLine += ` :: ${JSON.stringify(capturedJsonResponse)}`;
      }

      if (logLine.length > 80) {
        logLine = logLine.slice(0, 79) + "…";
      }

      log(logLine);
    }
  });

  next();
});

(async () => {
  // Create server with Express app as the default handler
  // WebSocket upgrades will be handled separately via server.on('upgrade')
  const server = createServer(app);

  // Initialize database with default admin if needed
  await initializeDatabase();

  // Initialize WebSocket servers BEFORE starting server and Express middleware evaluation
  // This ensures upgrade requests bypass Express routing
  const { initializeAiMediaStreaming } = await import("./services/ai-media-streaming");
  const mediaWss = initializeAiMediaStreaming(server);

  // Initialize Voice Dialer for AI calling (Gemini + OpenAI) with disposition detection
  // Note: WebSocketServer needs server reference but path-based routing won't work with
  // Express. We manually handle the upgrade event instead.
  const { initializeVoiceDialer } = await import("./services/voice-dialer");
  const voiceDialerWss = initializeVoiceDialer(server);
  voiceDialerWss.on('error', (err) => {
    console.error('[WebSocket Upgrade] Voice Dialer WSS error:', err);
  });

  // Initialize Gemini Live Dialer
  const { handleGeminiLiveConnection } = await import("./services/gemini-live-dialer");

  // Initialize Campaign Runner WebSocket for browser-based WebRTC calling
  const { initializeCampaignRunnerWS } = await import("./services/campaign-runner-ws");
  const campaignRunnerWss = initializeCampaignRunnerWS(server);
  campaignRunnerWss.on('error', (err) => {
    console.error('[WebSocket Upgrade] Campaign Runner WSS error:', err);
  });

  // Initialize Log Streaming Service (optional - requires GCP Pub/Sub permissions)
  // Disabled by default since cloud-logs API endpoints work without it
  const enableLogStreaming = process.env.ENABLE_LOG_STREAMING === 'true';
  let logStreamingService: LogStreamingService | null = null;
  if (enableLogStreaming) {
    logStreamingService = new LogStreamingService(server);
    logStreamingService.initialize().catch((err) => {
      console.warn('[LogStreaming] Service initialization failed (non-blocking):', err.message);
    });
  } else {
    console.log('[LogStreaming] Disabled (set ENABLE_LOG_STREAMING=true to enable)');
  }
  
  // Manually handle WebSocket upgrades since path-based routing doesn't work reliably
  server.on('upgrade', (req, socket, head) => {
    // FORCE LOGGING TO STDERR TO BYPASS ANY CONSOLE INTERCEPTION
    process.stderr.write(`[DEBUG-UPGRADE] Upgrade request for URL: ${req.url}\n`);
    process.stderr.write(`[DEBUG-UPGRADE] Headers: ${JSON.stringify(req.headers)}\n`);

    const pathname = new URL(req.url || '', `ws://${req.headers.host}`).pathname;
    console.log(`[WebSocket Upgrade] URL: ${req.url}`);
    console.log(`[WebSocket Upgrade] Headers:`, JSON.stringify(req.headers, null, 2));
    console.log(`[WebSocket Upgrade] Socket state: { readable: ${socket.readable}, writable: ${socket.writable}, destroyed: ${socket.destroyed} }`);
    
    socket.on('error', (err) => {
      console.error('[WebSocket Upgrade] Socket error:', err);
    });

    socket.on('close', (hadError: boolean) => {
      console.log(`[WebSocket Upgrade] Socket closed. Had error: ${hadError}`);
    });

    if (pathname === '/voice-dialer') {
      console.log('[WebSocket Upgrade] Handling Voice Dialer connection');
      
      try {
        voiceDialerWss.handleUpgrade(req, socket as any, head, (ws) => {
          console.log('[WebSocket Upgrade] ✅ Voice Dialer connection established');
          voiceDialerWss.emit('connection', ws, req);
        });
      } catch (error) {
        console.error('[WebSocket Upgrade] Exception in handleUpgrade:', error);
      }
    } else if (pathname === '/gemini-live-dialer') {
      console.log('[WebSocket Upgrade] Handling Gemini Live Dialer connection');
      
      const { WebSocketServer } = require('ws');
      const geminiWss = new WebSocketServer({ noServer: true });
      geminiWss.handleUpgrade(req, socket as any, head, (ws: WsWebSocket) => {
        console.log('[WebSocket Upgrade] ✅ Gemini Live Dialer connection established');
        handleGeminiLiveConnection(ws, req);
      });
    } else if (pathname === '/ai-media-stream') {
      console.log('[WebSocket Upgrade] Handling AI Media Stream connection');
      
      mediaWss.handleUpgrade(req, socket as any, head, (ws) => {
        console.log('[WebSocket Upgrade] ✅ AI Media Stream connection established');
        mediaWss.emit('connection', ws, req);
      });
    } else if (pathname === '/campaign-runner') {
      console.log('[WebSocket Upgrade] Handling Campaign Runner connection');
      
      campaignRunnerWss.handleUpgrade(req, socket as any, head, (ws) => {
        console.log('[WebSocket Upgrade] ✅ Campaign Runner connection established');
        campaignRunnerWss.emit('connection', ws, req);
      });
    } else if (pathname === '/log-stream') {
      console.log('[WebSocket Upgrade] Handling Log Stream connection');
      
      if (logStreamingService) {
        logStreamingService.handleUpgrade(req, socket, head);
      } else {
        console.warn('[WebSocket Upgrade] Log streaming service not initialized');
        socket.destroy();
      }
    } else {
      // Let Vite HMR handle its own WebSocket connections (protocol: vite-hmr)
      // Don't destroy unknown paths - they may be handled by other middleware
      const protocol = req.headers['sec-websocket-protocol'];
      if (protocol === 'vite-hmr') {
        // Vite will handle this via its middleware - don't interfere
        return;
      }
      console.log('[WebSocket Upgrade] Unknown path, destroying socket:', pathname);
      socket.destroy();
    }
  });

  
  // Initialize verification campaign schema (ensure workflow_triggered_at column exists)
  // DISABLED: Auto-init routines causing schema changes
  // const { initializeVerificationCampaignSchema } = await import("./lib/verification-schema-init");
  // await initializeVerificationCampaignSchema();
  
  // Initialize intelligent sales operating system schema (CHECK constraints for scores)
  // DISABLED: Auto-init routines causing schema changes
  // const { initializeIntelligentSalesSchema } = await import("./lib/intelligent-sales-schema-init");
  // await initializeIntelligentSalesSchema();
  
  // Auto-dialer service - DISABLED
  // await autoDialerService.start();
  console.log("[AutoDialer] Service DISABLED - not started");
  
  // Start AI-powered QA background jobs
  // Check if Redis is configured using the centralized config
  const { isRedisConfigured, getRedisUrl } = await import("./lib/redis-config");
  const hasRedis = isRedisConfigured() && !!getRedisUrl();
  const { startBackgroundJobs } = await import("./services/background-jobs");
  if (hasRedis) {
    startBackgroundJobs();
  } else {
    console.log("[BackgroundJobs] Skipped - Redis not configured (set REDIS_URL or REDIS_URL_PROD)");
  }
  
  // Initialize CSV import queue and worker (BullMQ)
  if (hasRedis) {
    const { initializeCSVImportQueue } = await import("./lib/csv-import-queue");
    initializeCSVImportQueue();
  }
  
  // Initialize cap enforcement queue and worker (BullMQ)
  if (hasRedis) {
    const { initializeCapEnforcementQueue } = await import("./lib/cap-enforcement-queue");
    initializeCapEnforcementQueue();
  }
  
  // Initialize bulk list operation queue and worker (BullMQ)
  if (hasRedis) {
    const { initializeBulkListQueue } = await import("./lib/bulk-list-queue");
    initializeBulkListQueue();
  }
  
  // Initialize contacts CSV import queue and worker (BullMQ)
  if (hasRedis) {
    const { initializeContactsCSVImportQueue } = await import("./lib/contacts-csv-import-queue");
    initializeContactsCSVImportQueue();
  }
  
  // Initialize verification CSV import queue and worker (BullMQ - OPTIMIZED with PostgreSQL COPY)
  if (hasRedis) {
    const { initializeVerificationCSVImportQueue } = await import("./lib/verification-csv-import-queue");
    initializeVerificationCSVImportQueue();
  }
  
  // Initialize verification workflow orchestrator (BullMQ)
  if (hasRedis) {
    const { initializeVerificationWorkflowQueue } = await import("./lib/verification-workflow-queue");
    initializeVerificationWorkflowQueue();
  }
  
  // Initialize verification enrichment queue and worker (BullMQ)
  if (hasRedis) {
    const { initializeEnrichmentQueue } = await import("./lib/enrichment-queue");
    initializeEnrichmentQueue();
  }
  
  // Initialize auto recording sync worker (BullMQ)
  if (hasRedis) {
    await import("./workers/auto-recording-sync-worker");
  }
  
  // Initialize AI Campaign Orchestrator (BullMQ) - maintains call concurrency for ai_agent campaigns
  const { initializeAiCampaignOrchestrator } = await import("./lib/ai-campaign-orchestrator");
  if (hasRedis) {
    initializeAiCampaignOrchestrator();
  }

  // Initialize Vertex AI Agentic CRM Operator
  if (process.env.USE_VERTEX_AI === 'true') {
    const { initializeVertexAI } = await import("./services/vertex-ai");
    try {
      const vertexResult = await initializeVertexAI({
        indexData: false,  // Set to true to pre-index accounts/contacts for vector search
        startOperator: true,  // Start the agentic operator task queue
      });
      console.log(`[VertexAI] Agentic CRM Operator initialized: ${vertexResult.status}`);
      if (vertexResult.operatorStarted) {
        console.log("[VertexAI] Task queue processor started");
      }
    } catch (error) {
      console.error("[VertexAI] Failed to initialize:", error);
    }
  } else {
    console.log("[VertexAI] Disabled - Set USE_VERTEX_AI=true to enable Agentic CRM Operator");
  }

  // M365 email sync - Only start if enabled (DISABLED by default for performance)
  // Enable M365 auto-sync for production email inbox
  const ENABLE_M365_SYNC = process.env.ENABLE_M365_SYNC === 'true' || true; // Enabled by default
  if (ENABLE_M365_SYNC) {
    const { startM365SyncJob } = await import("./jobs/m365-sync-job");
    startM365SyncJob();
  } else {
    console.log("[M365SyncJob] AUTO-SYNC DISABLED - Use manual trigger API endpoint");
  }

  // Gmail email sync - Only start if enabled
  const ENABLE_GMAIL_SYNC = process.env.ENABLE_GMAIL_SYNC === 'true';
  if (ENABLE_GMAIL_SYNC) {
    const { startGmailSyncJob } = await import("./jobs/gmail-sync-job");
    startGmailSyncJob();
  } else {
    console.log("[GmailSyncJob] AUTO-SYNC DISABLED - Use manual trigger API endpoint");
  }
  
  // Auto-resume stuck email validation jobs (with error handling and timeout)
  const { resumeStuckEmailValidationJobs } = await import("./lib/resume-validation-jobs");
  setTimeout(async () => {
    console.log("[VALIDATION RESUME] Checking for stuck email validation jobs...");
    let timeoutId: NodeJS.Timeout;
    try {
      await Promise.race([
        resumeStuckEmailValidationJobs(),
        new Promise<never>((_, reject) => {
          timeoutId = setTimeout(() => reject(new Error('Resume validation timeout')), 15000);
        })
      ]);
      clearTimeout(timeoutId!);
      console.log("[VALIDATION RESUME] Check completed successfully");
    } catch (error: any) {
      clearTimeout(timeoutId!);
      console.error("[VALIDATION RESUME] Error checking for stuck jobs:", error.message || error);
    }
  }, 5000); // Wait 5 seconds after startup
  
  // Auto-resume stuck CSV upload jobs (with error handling and timeout)
  const { resumeStuckUploadJobs } = await import("./lib/upload-job-processor");
  setTimeout(async () => {
    console.log("[UPLOAD JOB RESUME] Checking for stuck upload jobs...");
    let timeoutId: NodeJS.Timeout;
    try {
      await Promise.race([
        resumeStuckUploadJobs(),
        new Promise<never>((_, reject) => {
          timeoutId = setTimeout(() => reject(new Error('Resume upload timeout')), 15000);
        })
      ]);
      clearTimeout(timeoutId!);
      console.log("[UPLOAD JOB RESUME] Check completed successfully");
    } catch (error: any) {
      clearTimeout(timeoutId!);
      console.error("[UPLOAD JOB RESUME] Error checking for stuck jobs:", error.message || error);
    }
  }, 5000); // Wait 5 seconds after startup
  
  // =========================================================================
  // CALL ORCHESTRATION ENVIRONMENT VALIDATION
  // Logs critical configuration at startup to help diagnose production issues
  // =========================================================================
  console.log("\n" + "=".repeat(70));
  console.log("[Call Orchestration] Environment Configuration:");
  console.log("=".repeat(70));
  const telnyxKey = process.env.TELNYX_API_KEY;
  const telnyxTexmlAppId = process.env.TELNYX_TEXML_APP_ID;
  const telnyxConnId = process.env.TELNYX_CONNECTION_ID;
  const publicWsUrl = process.env.PUBLIC_WEBSOCKET_URL;
  const telnyxFrom = process.env.TELNYX_FROM_NUMBER;
  
  console.log(`  TELNYX_API_KEY: ${telnyxKey ? '✅ Configured (' + telnyxKey.slice(0, 12) + '...)' : '❌ NOT SET'}`);
  console.log(`  TELNYX_TEXML_APP_ID: ${telnyxTexmlAppId ? '✅ ' + telnyxTexmlAppId : '❌ NOT SET'}`);
  console.log(`  TELNYX_CONNECTION_ID: ${telnyxConnId ? '✅ ' + telnyxConnId : '⚠️ NOT SET (optional)'}`);
  console.log(`  PUBLIC_WEBSOCKET_URL: ${publicWsUrl ? '✅ ' + publicWsUrl : '❌ NOT SET'}`);
  console.log(`  TELNYX_FROM_NUMBER: ${telnyxFrom ? '✅ ' + telnyxFrom : '❌ NOT SET'}`);
  const redisUrlDisplay = getRedisUrl();
  if (hasRedis && redisUrlDisplay) {
    // Mask password if present
    const maskedRedisUrl = redisUrlDisplay.replace(/:[^@]*@/, ':***@');
    console.log(`  REDIS_URL: ✅ Configured (${maskedRedisUrl})`);
  } else {
    console.log(`  REDIS_URL: ⚠️ NOT SET (background jobs disabled, in-memory only)`);
  }
  console.log(`  NODE_ENV: ${process.env.NODE_ENV || 'development'}`);
  
  if (!telnyxKey || !telnyxTexmlAppId || !publicWsUrl) {
    console.log("\n⚠️  WARNING: Some Telnyx configuration is missing. Calls may fail.");
    console.log("   Check /api/call-orchestration for detailed diagnostics.");
  }
  if (process.env.NODE_ENV === 'production' && !hasRedis) {
    console.log("\n⚠️  WARNING: Production without Redis!");
    console.log("   Background jobs (CSV import, enrichment, etc.) will not work.");
    console.log("   Call session persistence will use in-memory store only.");
    console.log("   Set REDIS_URL or REDIS_URL_PROD to enable Redis.");
  }
  console.log("=".repeat(70) + "\n");
  
  registerRoutes(app);

  app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
    const status = err.status || err.statusCode || 500;
    const message = err.message || "Internal Server Error";
    
    // Log the error but don't crash the server
    console.error('[Express Error]', err);

    if (!res.headersSent) {
      res.status(status).json({ message });
    }
  });

  // importantly only setup vite in development and after
  // setting up all the other routes so the catch-all route
  // doesn't interfere with the other routes
  if (process.env.NODE_ENV === "development") {
    log("Setting up Vite development server...");
    const modulePath = "./vite";
    const { setupVite } = await import(modulePath);
    await setupVite(app, server);
    log("Vite development server ready");
  } else {
    log("Serving static files from production build");
    serveStatic(app);
  }

  // ALWAYS serve the app on the port specified in the environment variable PORT
  // Cloud Run automatically sets PORT=8080
  // For local dev, default to 8080
  const port = parseInt(process.env.PORT || '8080', 10);
  const host = process.env.HOST || '0.0.0.0';
  server.listen({
    port,
    host,
  }, () => {
    log(`serving on http://${host}:${port}`);
  });
})();
