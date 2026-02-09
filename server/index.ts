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
import { WebSocketServer, type WebSocket as WsWebSocket } from 'ws';

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

// JSON parsing error handler - catches malformed JSON before it reaches routes
app.use((err: any, req: Request, res: Response, next: NextFunction) => {
  if (err instanceof SyntaxError && 'body' in err) {
    console.error('[JSON Parse Error] Path:', req.path);
    console.error('[JSON Parse Error] Method:', req.method);
    console.error('[JSON Parse Error] Content-Type:', req.headers['content-type']);
    console.error('[JSON Parse Error] Error:', err.message);
    return res.status(400).json({
      message: 'Invalid JSON in request body',
      error: err.message
    });
  }
  next(err);
});

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

  // CRITICAL: Start listening FIRST so Cloud Run health check passes
  // Cloud Run requires the container to listen on PORT within the startup timeout
  // All other initialization happens AFTER the server is listening
  const port = parseInt(process.env.PORT || '8080', 10);
  const host = process.env.HOST || '0.0.0.0';

  await new Promise<void>((resolve) => {
    server.listen({ port, host }, () => {
      log(`Server listening on http://${host}:${port} - starting initialization...`);
      resolve();
    });
  });

  // CRITICAL: Register routes IMMEDIATELY after listening so health check endpoint works
  // This must happen before any potentially slow initialization
  registerRoutes(app);

  // Add error handler after routes
  app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
    const status = err.status || err.statusCode || 500;
    const message = err.message || "Internal Server Error";
    console.error('[Express Error]', err);
    if (!res.headersSent) {
      res.status(status).json({ message });
    }
  });

  log('Routes registered - health check available at /api/health');

  // Now initialize everything else (after server is listening and health check is available)
  // This ensures health checks pass even if initialization is slow

  // Initialize database with default admin if needed
  try {
    await initializeDatabase();
  } catch (err) {
    console.error('[STARTUP] Database initialization failed (non-blocking):', err);
  }

  // Load secrets from database into process.env
  // Cloud Run/Env vars take priority; DB acts as dynamic override/fallback
  // DISABLED globally for now to prevent decryption errors (Session Key Mismatch between DB and Cloud Run)
  /*
  if (process.env.NODE_ENV === 'production') {
    try {
      const { initializeSecrets } = await import("./services/secret-loader");
      await initializeSecrets({ overwriteEnv: false });
    } catch (err) {
      console.error('[STARTUP] Secret loader initialization failed (non-blocking):', err);
      console.log('[STARTUP] Continuing with .env values as fallback...');
    }
  }
  */

  // Auto-sync prompt definitions to database (ensures prompts are available)
  try {
    const { syncPromptDefinitions } = await import("./services/prompt-management-service");
    const { ALL_PROMPT_DEFINITIONS } = await import("./services/prompt-loader");
    const results = await syncPromptDefinitions(ALL_PROMPT_DEFINITIONS, null);
    console.log(`[STARTUP] Prompt sync complete: ${results.created} created, ${results.updated} updated, ${results.skipped} skipped`);
  } catch (err) {
    console.error('[STARTUP] Prompt sync failed (non-blocking):', err);
  }

  // Initialize Unified Audio Configuration (must run before voice services)
  // This ensures ALL call types (test/production) use identical audio settings
  try {
    const { initializeAudioConfiguration } = await import("./services/audio-configuration");
    initializeAudioConfiguration();
  } catch (err) {
    console.error('[STARTUP] Audio configuration initialization failed (non-blocking):', err);
  }

  // Initialize Agent Infrastructure (Core Email & Voice Agents, Governance)
  try {
    const { initializeAgentInfrastructure } = await import("./services/agents");
    initializeAgentInfrastructure();
  } catch (err) {
    console.error('[STARTUP] Agent infrastructure initialization failed (non-blocking):', err);
  }

  // Initialize WebSocket servers for real-time communication
  // Wrapped in try-catch to ensure failures don't prevent server startup
  let mediaWss: any = null;
  let voiceDialerWss: any = null;
  let campaignRunnerWss: any = null;
  let geminiWss: WebSocketServer | null = null;
  let handleGeminiLiveConnection: any = null;

  try {
    const { initializeAiMediaStreaming } = await import("./services/ai-media-streaming");
    mediaWss = initializeAiMediaStreaming(server);
  } catch (err) {
    console.error('[STARTUP] AI Media Streaming initialization failed (non-blocking):', err);
  }

  try {
    const { initializeVoiceDialer } = await import("./services/voice-dialer");
    voiceDialerWss = initializeVoiceDialer(server);
    voiceDialerWss?.on('error', (err: Error) => {
      console.error('[WebSocket Upgrade] Voice Dialer WSS error:', err);
    });
  } catch (err) {
    console.error('[STARTUP] Voice Dialer initialization failed (non-blocking):', err);
  }

  try {
    const geminiModule = await import("./services/gemini-live-dialer");
    handleGeminiLiveConnection = geminiModule.handleGeminiLiveConnection;
    geminiWss = new WebSocketServer({ noServer: true });
  } catch (err) {
    console.error('[STARTUP] Gemini Live Dialer initialization failed (non-blocking):', err);
  }

  try {
    const { initializeCampaignRunnerWS } = await import("./services/campaign-runner-ws");
    campaignRunnerWss = initializeCampaignRunnerWS(server);
    campaignRunnerWss?.on('error', (err: Error) => {
      console.error('[WebSocket Upgrade] Campaign Runner WSS error:', err);
    });
  } catch (err) {
    console.error('[STARTUP] Campaign Runner WS initialization failed (non-blocking):', err);
  }

  // Initialize Log Streaming Service
  // Always create the service so WebSocket connections succeed.
  // Pub/Sub streaming is optional; console-intercept fallback is always active.
  const logStreamingService = new LogStreamingService(server);
  if (process.env.ENABLE_LOG_STREAMING === 'true') {
    logStreamingService.initialize().catch((err) => {
      console.warn('[LogStreaming] Pub/Sub init failed (console fallback active):', err.message);
    });
  }
  
  // Manually handle WebSocket upgrades since path-based routing doesn't work reliably
  server.on('upgrade', (req, socket, head) => {
    const pathname = new URL(req.url || '', `ws://${req.headers.host}`).pathname;
    // Only log non-trivial upgrade requests (skip /log-stream to reduce noise)
    if (pathname !== '/log-stream') {
      console.log(`[WebSocket Upgrade] ${pathname}`);
    }
    
    socket.on('error', (err: any) => {
      // ECONNRESET is common when clients disconnect abruptly; treat as warn to reduce noise
      if (err && (err.code === 'ECONNRESET' || err.errno === -4077)) {
        console.warn('[WebSocket Upgrade] Socket error (ECONNRESET - client disconnected):', {
          code: err.code,
          errno: err.errno,
          syscall: err.syscall,
        });
      } else {
        console.error('[WebSocket Upgrade] Socket error:', err);
      }
    });

    socket.on('close', (hadError: boolean) => {
      console.log(`[WebSocket Upgrade] Socket closed. Had error: ${hadError}`);
    });

    if (pathname === '/voice-dialer') {
      console.log('[WebSocket Upgrade] Handling Voice Dialer connection');

      // CRITICAL FIX: Check if socket is writable before attempting upgrade
      if (!socket.writable) {
        console.error('[WebSocket Upgrade] ❌ Socket not writable - cannot upgrade. This may be a tunnel issue.');
        // Try to make the socket writable by setting it up properly
        if (!socket.destroyed) {
          console.log('[WebSocket Upgrade] Attempting socket recovery...');
          // Force the socket to be writable
          (socket as any)._writableState = (socket as any)._writableState || { ended: false };
          (socket as any)._writableState.ended = false;
          socket.resume();
        }
      }

      if (!voiceDialerWss) {
        console.warn('[WebSocket Upgrade] Voice Dialer not initialized');
        socket.destroy();
        return;
      }
      try {
        voiceDialerWss.handleUpgrade(req, socket as any, head, (ws: any) => {
          console.log('[WebSocket Upgrade] ✅ Voice Dialer connection established');
          voiceDialerWss.emit('connection', ws, req);
        });
      } catch (error) {
        console.error('[WebSocket Upgrade] Exception in handleUpgrade:', error);
        socket.destroy();
      }
    } else if (pathname === '/gemini-live-dialer') {
      console.log('[WebSocket Upgrade] Handling Gemini Live Dialer connection');
      console.log('[WebSocket Upgrade] Gemini upgrade headers:', {
        upgrade: req.headers['upgrade'],
        connection: req.headers['connection'],
        secWebSocketKey: req.headers['sec-websocket-key'],
        secWebSocketVersion: req.headers['sec-websocket-version'],
        secWebSocketProtocol: req.headers['sec-websocket-protocol'],
        host: req.headers['host'],
        userAgent: req.headers['user-agent'],
      });

      if (!handleGeminiLiveConnection || !geminiWss) {
        console.warn('[WebSocket Upgrade] Gemini Live Dialer not initialized');
        socket.destroy();
        return;
      }

      // CRITICAL: Set socket options to keep connection alive
      socket.setNoDelay(true);
      socket.setKeepAlive(true, 30000);

      // Log socket state and attempt immediate upgrade
      // Don't defer - ngrok might be timing out the connection
      console.log('[WebSocket Upgrade] Socket state before upgrade:', {
        readable: socket.readable,
        writable: socket.writable,
        destroyed: socket.destroyed,
        connecting: (socket as any).connecting,
        pending: (socket as any).pending,
      });

      // If socket appears half-closed, try to resume it
      if (!socket.writable && !socket.destroyed) {
        console.log('[WebSocket Upgrade] ⚠️ Socket not writable, calling resume()...');
        socket.resume();
      }

      // Attempt upgrade immediately - don't wait
      try {
        geminiWss.handleUpgrade(req, socket as any, head, (ws: WsWebSocket) => {
          console.log('[WebSocket Upgrade] ✅ Gemini Live Dialer connection established');
          handleGeminiLiveConnection(ws, req);
        });
      } catch (error) {
        console.error('[WebSocket Upgrade] Exception in Gemini Live handleUpgrade:', error);
        if (!socket.destroyed) socket.destroy();
      }
    } else if (pathname === '/ai-media-stream') {
      console.log('[WebSocket Upgrade] Handling AI Media Stream connection');

      if (!mediaWss) {
        console.warn('[WebSocket Upgrade] AI Media Stream not initialized');
        socket.destroy();
        return;
      }
      mediaWss.handleUpgrade(req, socket as any, head, (ws: any) => {
        console.log('[WebSocket Upgrade] ✅ AI Media Stream connection established');
        mediaWss.emit('connection', ws, req);
      });
    } else if (pathname === '/campaign-runner') {
      console.log('[WebSocket Upgrade] Handling Campaign Runner connection');

      if (!campaignRunnerWss) {
        console.warn('[WebSocket Upgrade] Campaign Runner not initialized');
        socket.destroy();
        return;
      }
      campaignRunnerWss.handleUpgrade(req, socket as any, head, (ws: any) => {
        console.log('[WebSocket Upgrade] ✅ Campaign Runner connection established');
        campaignRunnerWss.emit('connection', ws, req);
      });
    } else if (pathname === '/log-stream') {
      logStreamingService.handleUpgrade(req, socket, head);
    } else {
      // Block ALL vite-hmr WebSocket connections - they cause frame corruption
      const protocol = req.headers['sec-websocket-protocol'];

      if (protocol === 'vite-hmr') {
        // Silently block HMR to prevent log spam and frame corruption
        socket.destroy();
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
    // console.log("[BackgroundJobs] Temporarily disabled for stability");
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
    const { initializeAutoRecordingSyncWorker } = await import("./workers/auto-recording-sync-worker");
    // Initialize in background, don't block server startup
    setImmediate(() => {
      try {
        initializeAutoRecordingSyncWorker();
      } catch (err) {
        console.error('[AutoRecordingSyncWorker] Background init failed:', err);
      }
    });
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

  // Routes and error handler were already registered at startup (lines 124-136)
  // to ensure health check endpoint is available immediately

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

  // Server is already listening (started at the beginning)
  // Log that all initialization is complete
  log(`Initialization complete - server ready on http://${host}:${port}`);
})();
