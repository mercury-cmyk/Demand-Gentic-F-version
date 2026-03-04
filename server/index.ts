// Emit startup timestamp immediately so Cloud Run logs capture boot progress
console.log(`[BOOT] Process starting — PID ${process.pid}, Node ${process.version}, argv[1]=${process.argv[1]}`);

// Increase thread pool size for heavy concurrent I/O (DNS, FS, Crypto/SSL)
// Must be set before any libuv operations to be effective
process.env.UV_THREADPOOL_SIZE = process.env.UV_THREADPOOL_SIZE || '128';

// Suppress noisy warnings FIRST (before any other imports)
import "./suppress-warnings";

// Validate and load environment variables
import "./env";

// CRITICAL: Configure HTTP/HTTPS agents for high concurrency BEFORE any imports
// Node.js defaults to 6 sockets per host - this causes request queuing under load
import http from "http";
import https from "https";

http.globalAgent.maxSockets = Infinity;
https.globalAgent.maxSockets = Infinity;
http.globalAgent.maxFreeSockets = 256;
https.globalAgent.maxFreeSockets = 256;

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
import { pathToFileURL } from "url";
import { log } from "./log";
import { LogStreamingService } from "./services/log-streaming-service";
import {
  securityHeaders,
  captureClientIP,
  sanitizeBody,
  PAYLOAD_LIMITS
} from "./middleware/security";
import { WebSocketServer, type WebSocket as WsWebSocket } from 'ws';

const app = express();
let server: http.Server | null = null;
const SERVICE_ROLE = process.env.SERVICE_ROLE || 'all';

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
  const shouldCaptureResponseBody =
    process.env.LOG_API_RESPONSE_BODY === 'true' ||
    (process.env.NODE_ENV !== 'production' && process.env.LOG_API_RESPONSE_BODY !== 'false');
  let capturedJsonResponse: Record<string, any> | undefined = undefined;

  if (shouldCaptureResponseBody) {
    const originalResJson = res.json;
    res.json = function (bodyJson, ...args) {
      // Only capture small responses to avoid holding large payloads in memory
      if (bodyJson && typeof bodyJson === 'object') {
        const keys = Object.keys(bodyJson);
        // Skip capture for large array responses (list endpoints)
        if (Array.isArray(bodyJson) && bodyJson.length > 50) {
          capturedJsonResponse = { _truncated: true, count: bodyJson.length };
        } else if (keys.length > 100) {
          capturedJsonResponse = { _truncated: true, keys: keys.length };
        } else {
          capturedJsonResponse = bodyJson;
        }
      } else {
        capturedJsonResponse = bodyJson;
      }
      return originalResJson.apply(res, [bodyJson, ...args]);
    };
  }

  res.on("finish", () => {
    const duration = Date.now() - start;
    if (path.startsWith("/api")) {
      let logLine = `${req.method} ${path} ${res.statusCode} in ${duration}ms`;
      if (capturedJsonResponse && shouldCaptureResponseBody) {
        try {
          const responsePreview = JSON.stringify(capturedJsonResponse);
          // Keep logging lightweight; avoid expensive giant payload logs
          logLine += ` :: ${responsePreview.slice(0, 240)}`;
        } catch {
          logLine += " :: [response-body-unserializable]";
        }
      }

      if (logLine.length > 80) {
        logLine = logLine.slice(0, 79) + "…";
      }

      log(logLine);
    }
  });

  next();
});

// This will be null if the module is imported, and non-null if run directly.
const isMainModule = (() => {
  try {
    // CommonJS execution path (local scripts/tests that transpile to CJS)
    if (typeof require !== 'undefined' && typeof module !== 'undefined') {
      return require.main === module;
    }

    // ESM execution path (Cloud Run production build uses ESM output)
    const entryPoint = process.argv[1];
    if (!entryPoint) return false;
    const resolved = import.meta.url === pathToFileURL(entryPoint).href;
    console.log(`[BOOT] isMainModule: import.meta.url=${import.meta.url} entryFile=${pathToFileURL(entryPoint).href} match=${resolved}`);
    return resolved;
  } catch (err) {
    console.error('[BOOT] isMainModule detection error, defaulting to true:', err);
    return true;
  }
})();

if (isMainModule) {
  console.log('[BOOT] Starting server...');
  (async () => {
    // Create server with Express app as the default handler
    // WebSocket upgrades will be handled separately via server.on('upgrade')
    server = createServer(app);

    // PERFORMANCE: Set HTTP server timeouts to prevent resource exhaustion
    server.requestTimeout = 120_000;   // 2 minutes max for entire request
    server.headersTimeout = 60_000;    // 1 minute to receive headers
    server.keepAliveTimeout = 65_000;  // 65s (must be > headersTimeout)
    server.timeout = 300_000;          // 5 minutes overall socket timeout (allows long AI calls)

    // CRITICAL: Start listening FIRST so Cloud Run health check passes
    // Cloud Run requires the container to listen on PORT within the startup timeout
    // All other initialization happens AFTER the server is listening
    const port = parseInt(process.env.PORT || '8080', 10);
    const host = process.env.HOST || '0.0.0.0';
    console.log(`[BOOT] Binding to ${host}:${port}...`);

    await new Promise<void>((resolve) => {
      server!.listen({ port, host }, () => {
        console.log(`[BOOT] Port ${port} bound successfully`);
        log(`Server listening on http://${host}:${port} - starting initialization...`);
        resolve();
      });
    });

    // CRITICAL: Register a lightweight /api/health BEFORE heavy route imports.
    // The full registerRoutes() can take 30-60s due to massive import tree.
    // Without this, Cloud Run health checks fail during initialization.
    let initPhase = 'starting';
    app.get('/api/health', (_req, res) => {
      res.json({ status: 'ok', timestamp: new Date().toISOString(), phase: initPhase });
    });
    app.get('/api/ready', (_req, res) => {
      if (initPhase === 'ready') {
        res.json({ status: 'ok', timestamp: new Date().toISOString() });
      } else {
        res.status(503).json({ status: 'initializing', phase: initPhase });
      }
    });

    // Redirect /favicon.ico to the logo
    app.get('/favicon.ico', (_req, res) => res.redirect(301, '/demangent-logo.png'));

    log('Health endpoint registered, yielding to event loop before heavy imports...');

    // CRITICAL: Yield to the event loop so Express can process the health check
    // request that Cloud Run sends immediately after the TCP probe succeeds.
    // Without this yield, the synchronous module evaluation from import("./routes")
    // blocks the event loop for 30-60s, preventing all HTTP responses.
    await new Promise<void>((resolve) => setImmediate(resolve));

    // LiveKit Webhook Handler (Signed with LIVEKIT_WEBHOOK_SECRET or LIVEKIT_API_SECRET)
    app.post('/webhook', async (req, res) => {
      const { livekitWebhookHandler } = await import("./services/livekit/webhook");
      return livekitWebhookHandler(req, res);
    });

    // Telnyx Webhook Handler for LiveKit Outbound Calls
    app.post('/api/webhooks/telnyx-livekit', async (req, res) => {
      try {
        const { handleTelnyxEvent } = await import("./services/livekit/outbound-service");
        await handleTelnyxEvent(req.body);
        res.status(200).send('ok');
      } catch (err) {
        console.error('[Telnyx Webhook Error]', err);
        res.status(500).send('error');
      }
    });

    // Register all application routes (this import is heavy — 560KB+ route file with many sub-imports)
    initPhase = 'loading_routes';
    log('Loading routes...');
    const { registerRoutes } = await import("./routes");
    registerRoutes(app);
    initPhase = 'routes_ready';

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
    const isDevelopment = process.env.NODE_ENV === "development";

    // Register static file serving immediately in production so `/` responds even while
    // background startup tasks are still initializing.
    if (!isDevelopment) {
      log("Serving static files from production build");
      const { serveStatic } = await import("./static");
      serveStatic(app);
    }
    initPhase = 'ready';

    // Now initialize everything else (after server is listening and health check is available)
    // This ensures health checks pass even if initialization is slow

    // Initialize database with default admin if needed
    try {
      const { initializeDatabase } = await import("./db-init");
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

    // Initialize Unified Agent Architecture (One Agent Per Type, Self-Contained, Learning-Integrated)
    try {
      const { initializeUnifiedAgentArchitecture } = await import("./services/agents/unified");
      initializeUnifiedAgentArchitecture();
    } catch (err) {
      console.error('[STARTUP] Unified agent architecture initialization failed (non-blocking):', err);
    }

    // Initialize Number Pool Scheduler (hourly/daily counter resets, cooldown processing, reputation recalc)
    if (SERVICE_ROLE === 'all' || SERVICE_ROLE === 'voice') {
      try {
        const { initializeAlignedScheduler } = await import("./services/number-pool-scheduler");
        const { resetHourlyCounters } = await import("./services/number-pool/number-service");
        initializeAlignedScheduler();
        // Immediately reset hourly counters on startup since they may be stale from previous run
        resetHourlyCounters().then(count => {
          if (count > 0) console.log(`[STARTUP] Reset stale hourly counters for ${count} numbers`);
        }).catch(() => {});
      } catch (err) {
        console.error('[STARTUP] Number Pool Scheduler initialization failed (non-blocking):', err);
      }
    } else {
      console.log(`[Startup] ⏭️ Skipping Number Pool Scheduler (Role: ${SERVICE_ROLE})`);
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

    // Autonomous AI Dialer fallback state.
    // Primary path is BullMQ orchestrator; this fallback is used only when Redis/orchestrator
    // cannot run so outbound AI calls do not stall completely.
    let autonomousDialerFallbackActive = false;
    const startAutonomousDialerFallback = async (reason: string) => {
      if (autonomousDialerFallbackActive) return;
      try {
        const { initializeAutonomousDialer } = await import("./services/autonomous-ai-dialer");
        initializeAutonomousDialer();
        autonomousDialerFallbackActive = true;
        process.env.AUTONOMOUS_DIALER_FALLBACK_ACTIVE = "true";
        console.warn(`[STARTUP] Autonomous AI Dialer fallback activated: ${reason}`);
      } catch (err) {
        console.error('[STARTUP] Autonomous AI Dialer fallback failed:', err);
      }
    };

    // Initialize Log Streaming Service
    // Always create the service so WebSocket connections succeed.
    // Pub/Sub streaming is optional; console-intercept fallback is always active.
    const logStreamingService = new LogStreamingService(server);
    if (process.env.ENABLE_LOG_STREAMING === 'true') {
      logStreamingService.initialize().catch((err) => {
        console.warn('[LogStreaming] Pub/Sub init failed (console fallback active):', err.message);
      });
    }

    // Initialize Operations Hub WebSocket Server for real-time infrastructure updates
    let opsSocketIO: any = null;
    try {
      const { setupOpsWebSocket } = await import("./middleware/ops-websocket");
      opsSocketIO = setupOpsWebSocket(server);
      console.log('[STARTUP] ✓ Operations Hub WebSocket server initialized on /ops namespace');
    } catch (err) {
      console.error('[STARTUP] Operations Hub WebSocket initialization failed (non-blocking):', err);
    }
    
    // Initialize LiveKit Worker if explicitly enabled (SIP/WebRTC Bridge)
    // Requires LIVEKIT_WORKER_ENABLED=true because the @livekit/rtc-node native module
    // is not available on Alpine Linux (Cloud Run) and causes unhandled rejections on import.
    if (SERVICE_ROLE === 'all' || SERVICE_ROLE === 'voice') {
      if (process.env.LIVEKIT_WORKER_ENABLED === 'true' && process.env.LIVEKIT_URL && process.env.LIVEKIT_API_KEY && process.env.LIVEKIT_API_SECRET) {
        (async () => {
          try {
            console.log('[STARTUP] 🚀 Initializing LiveKit Agent Worker...');
            const { startLiveKitWorker } = await import("./services/livekit/worker");
            await startLiveKitWorker();
          } catch (err) {
            console.error('[STARTUP] ❌ LiveKit Worker initialization failed:', err);
          }
        })();
      } else if (process.env.LIVEKIT_URL && !process.env.LIVEKIT_WORKER_ENABLED) {
        console.log('[STARTUP] ℹ️ LiveKit configured but worker disabled (set LIVEKIT_WORKER_ENABLED=true to enable)');
      }
    } else {
      console.log(`[Startup] ⏭️ Skipping LiveKit Worker (Role: ${SERVICE_ROLE})`);
    }

    // Manually handle WebSocket upgrades since path-based routing doesn't work reliably
    server.on('upgrade', (req, socket, head) => {
      const pathname = new URL(req.url || '', `ws://${req.headers.host}`).pathname;
      const protocol = req.headers['sec-websocket-protocol'];
      if (protocol === 'vite-hmr') {
        return;
      }
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

        // Optimize socket for real-time audio streaming
        (socket as any).setNoDelay?.(true);
        (socket as any).setKeepAlive?.(true, 30000);

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
        (socket as any).setNoDelay?.(true);
        (socket as any).setKeepAlive?.(true, 30000);
        // Increase buffer size for high-throughput audio streaming
        (socket as any)._writableState.highWaterMark = 64 * 1024;

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

        // Optimize socket for real-time audio streaming
        (socket as any).setNoDelay?.(true);
        (socket as any).setKeepAlive?.(true, 30000);

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
    
    console.log(`\n[Startup] 🚀 Running with SERVICE_ROLE: ${SERVICE_ROLE.toUpperCase()}`);

    if (SERVICE_ROLE === 'all' || SERVICE_ROLE === 'analysis') {
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

      // Initialize OI batch pipeline queue and worker (BullMQ)
      if (hasRedis) {
        const { initializeOiBatchQueue } = await import("./lib/oi-batch-queue");
        initializeOiBatchQueue();
      }
    } else {
      console.log(`[Startup] ⏭️ Skipping analysis/data queues (Role: ${SERVICE_ROLE})`);
    }
    
    if (SERVICE_ROLE === 'all' || SERVICE_ROLE === 'voice') {
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
      const { initializeAiCampaignOrchestrator, getOrchestratorStatus } = await import("./lib/ai-campaign-orchestrator");
      if (hasRedis) {
        try {
          await initializeAiCampaignOrchestrator();

          const configuredHealthcheckMs = Number(process.env.AI_ORCHESTRATOR_HEALTHCHECK_MS || 60000);
          const orchestratorHealthcheckMs = Number.isFinite(configuredHealthcheckMs)
            ? Math.max(30000, configuredHealthcheckMs)
            : 60000;

          setInterval(async () => {
            try {
              const status = await getOrchestratorStatus();
              if (!status.available) {
                console.warn(
                  `[AI Orchestrator] Healthcheck detected unavailable orchestrator ` +
                  `(workerRunning=${status.workerRunning}, workerPaused=${status.workerPaused}, staleTick=${status.staleTick}, lastTickAgeMs=${status.lastTickAgeMs}) - attempting forced re-initialization`
                );
                await initializeAiCampaignOrchestrator({ forceReinitialize: true });
              }
            } catch (err) {
              console.error('[AI Orchestrator] Healthcheck failed:', err);
            }
          }, orchestratorHealthcheckMs);
        } catch (err) {
          console.error('[AI Orchestrator] Initialization failed, enabling fallback dialer:', err);
          await startAutonomousDialerFallback('AI orchestrator failed to initialize');
        }
      } else {
        await startAutonomousDialerFallback('Redis unavailable for BullMQ orchestrator');
      }
    } else {
      console.log(`[Startup] ⏭️ Skipping voice orchestrator (Role: ${SERVICE_ROLE})`);
    }

    if (SERVICE_ROLE === 'all' || SERVICE_ROLE === 'analysis') {
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
    }

    if (SERVICE_ROLE === 'all' || SERVICE_ROLE === 'email') {
      // M365 email sync - Enabled by default, set ENABLE_M365_SYNC=false to disable
      const ENABLE_M365_SYNC = process.env.ENABLE_M365_SYNC !== 'false';
      if (ENABLE_M365_SYNC) {
        const { startM365SyncJob } = await import("./jobs/m365-sync-job");
        startM365SyncJob();
      } else {
        console.log("[M365SyncJob] AUTO-SYNC DISABLED - Use manual trigger API endpoint");
      }

      // Gmail email sync - Enabled by default, set ENABLE_GMAIL_SYNC=false to disable
      const ENABLE_GMAIL_SYNC = process.env.ENABLE_GMAIL_SYNC !== 'false';
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
    } else {
      console.log(`[Startup] ⏭️ Skipping email sync/validation jobs (Role: ${SERVICE_ROLE})`);
    }
    
    if (SERVICE_ROLE === 'all' || SERVICE_ROLE === 'analysis') {
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
    }
    
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
    if (isDevelopment) {
      log("Setting up Vite development server...");
      const modulePath = "./vite";
      const { setupVite } = await import(modulePath);
      await setupVite(app, server);
      log("Vite development server ready");
    }

    // Server is already listening (started at the beginning)
    // Log that all initialization is complete
    log(`Initialization complete - server ready on http://${host}:${port}`);
  })();
} else {
  console.warn('[BOOT] isMainModule=false — server will NOT start. This file was imported, not executed directly.');
}

export { app, server };
