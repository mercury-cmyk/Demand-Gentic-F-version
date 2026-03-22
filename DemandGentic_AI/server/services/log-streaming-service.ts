import { PubSub } from '@google-cloud/pubsub';
import { Logging } from '@google-cloud/logging';
import { WebSocketServer, WebSocket } from 'ws';
import { getOpsAgentRequestInfo } from './ops/runtime';
import { getLocalDeploymentLogs } from './ops/local-runtime';
import { parseVmLogLine } from './vm-log-service';
import { getGcpProjectId } from '../lib/gcp-config';

let PROJECT_ID = getGcpProjectId();
const TOPIC_NAME = 'cloud-logging-stream';
const SINK_NAME = 'cloud-logging-stream-sink';
const SUBSCRIPTION_NAME = 'cloud-logging-stream-sub';

interface LogEntry {
  timestamp: string;
  severity: string;
  message: string;
  resource?: string;
  labels?: Record;
  jsonPayload?: any;
  textPayload?: string;
}

interface VmStreamOptions {
  service: string;
  tail: number;
  since: string;
  grep?: string;
}

export class LogStreamingService {
  private pubsub: PubSub | null = null;
  private logging: Logging | null = null;
  private readonly wss: WebSocketServer;
  private consoleInterceptActive = false;
  private readonly vmMode: boolean;
  private readonly opsAgentBaseUrl: string | null;
  private readonly opsAgentHeaders: Record;
  private readonly vmStreamControllers = new Map();

  constructor(_server: any) {
    const opsAgent = getOpsAgentRequestInfo();
    this.opsAgentBaseUrl = opsAgent.baseUrl;
    this.opsAgentHeaders = opsAgent.headers;
    this.vmMode = process.env.OPS_HUB_DEPLOY_TARGET === 'vm' || Boolean(this.opsAgentBaseUrl);

    if (!this.vmMode) {
      try {
        this.pubsub = new PubSub({ projectId: PROJECT_ID });
        this.logging = new Logging({ projectId: PROJECT_ID });
        console.log('[LogStreaming] GCP services initialized');
      } catch (error: any) {
        console.warn(
          '[LogStreaming] GCP services not available, using console-only mode:',
          error.message,
        );
        this.pubsub = null;
        this.logging = null;
      }
    } else {
      console.log('[LogStreaming] VM mode enabled, proxying docker logs through the ops agent');
    }

    this.wss = new WebSocketServer({ noServer: true });
    this.setupWebSocketServer();

    if (!this.vmMode || !this.opsAgentBaseUrl) {
      // Intercept console in non-VM mode or VM mode without ops agent (local dev)
      this.interceptConsole();
    }
  }

  async initialize() {
    try {
      if (this.vmMode) {
        console.log('[LogStreaming] VM mode active, skipping Pub/Sub initialization');
        return;
      }

      if (!this.pubsub || !this.logging) {
        console.log('[LogStreaming] GCP services not available, skipping Pub/Sub initialization');
        return;
      }

      await this.createTopic();
      await this.createSink();
      await this.createSubscription();
      this.listenForMessages();
    } catch (error) {
      console.error('Error initializing log streaming service:', error);
    }
  }

  private async createTopic() {
    if (!this.pubsub) return;
    const [topic] = await this.pubsub.topic(TOPIC_NAME).get({ autoCreate: true });
    console.log(`Topic ${topic.name} created.`);
  }

  private async createSink() {
    if (!this.logging) return;
    const sink = this.logging.sink(SINK_NAME);

    try {
      await sink.getMetadata();
      console.log(`Sink ${SINK_NAME} already exists.`);
      return;
    } catch (error: any) {
      if (error.code !== 5) {
        throw error;
      }
    }

    const destination = `pubsub.googleapis.com/projects/${PROJECT_ID}/topics/${TOPIC_NAME}`;
    const filter =
      'resource.type="cloud_run_revision" AND resource.labels.service_name="demandgentic-api"';

    await this.logging.createSink(SINK_NAME, {
      destination,
      filter,
    });
    console.log(`Sink ${SINK_NAME} created.`);
  }

  private async createSubscription() {
    if (!this.pubsub) return;
    const subscription = this.pubsub.topic(TOPIC_NAME).subscription(SUBSCRIPTION_NAME);
    const [exists] = await subscription.exists();

    if (exists) {
      console.log(`Subscription ${SUBSCRIPTION_NAME} already exists.`);
      return;
    }

    await subscription.create();
    console.log(`Subscription ${SUBSCRIPTION_NAME} created.`);
  }

  private listenForMessages() {
    if (!this.pubsub) return;
    const subscription = this.pubsub.subscription(SUBSCRIPTION_NAME);

    subscription.on('message', (message) => {
      try {
        const logEntry = JSON.parse(message.data.toString()) as LogEntry;
        this.broadcast(logEntry);
        message.ack();
      } catch (error) {
        console.error('Error processing log message:', error);
        message.nack();
      }
    });

    subscription.on('error', (error) => {
      console.error('Error receiving message:', error);
    });

    console.log(`Listening for messages on ${SUBSCRIPTION_NAME}.`);
  }

  private setupWebSocketServer() {
    this.wss.on('connection', (ws, request) => {
      const vmOptions = this.parseVmStreamOptions(request);
      console.log(
        this.vmMode
          ? `[LogStreaming] Client connected to log stream (${vmOptions.service})`
          : 'Client connected to log stream.',
      );

      if (this.vmMode) {
        void this.attachVmLogStream(ws, vmOptions);
      }

      ws.on('close', () => {
        this.stopVmLogStream(ws);
        console.log('Client disconnected from log stream.');
      });
    });
  }

  private broadcast(data: LogEntry) {
    this.wss.clients.forEach((client) => {
      if (client.readyState === WebSocket.OPEN) {
        client.send(JSON.stringify(data));
      }
    });
  }

  handleUpgrade(request: any, socket: any, head: any) {
    this.wss.handleUpgrade(request, socket, head, (ws) => {
      this.wss.emit('connection', ws, request);
    });
  }

  private parseVmStreamOptions(request: any): VmStreamOptions {
    const parsedUrl = new URL(request?.url || '/log-stream', 'http://localhost');
    const requestedTail = Number(parsedUrl.searchParams.get('tail') || '100');
    const tail = Number.isFinite(requestedTail)
      ? Math.min(Math.max(Math.floor(requestedTail), 10), 500)
      : 100;

    return {
      service: parsedUrl.searchParams.get('service') || process.env.VM_LOG_STREAM_SERVICE || 'api',
      tail,
      since: parsedUrl.searchParams.get('since') || '2m',
      grep: parsedUrl.searchParams.get('grep') || undefined,
    };
  }

  private stopVmLogStream(ws: WebSocket) {
    const controller = this.vmStreamControllers.get(ws);
    if (!controller) {
      return;
    }

    controller.abort();
    this.vmStreamControllers.delete(ws);
  }

  private async attachVmLogStream(ws: WebSocket, options: VmStreamOptions) {
    this.stopVmLogStream(ws);

    const controller = new AbortController();
    this.vmStreamControllers.set(ws, controller);

    if (!this.opsAgentBaseUrl) {
      // Local fallback: poll Docker logs directly
      await this.attachLocalLogStream(ws, options, controller);
      return;
    }

    try {
      const params = new URLSearchParams({
        tail: String(options.tail),
        since: options.since,
      });
      if (options.grep) {
        params.set('grep', options.grep);
      }

      const response = await fetch(
        `${this.opsAgentBaseUrl}/logs/stream/${encodeURIComponent(options.service)}?${params.toString()}`,
        {
          headers: this.opsAgentHeaders,
          signal: controller.signal,
        },
      );

      if (!response.ok || !response.body) {
        throw new Error(`Ops agent log stream failed with HTTP ${response.status}`);
      }

      const reader = response.body.getReader();
      let pending = '';

      while (ws.readyState === WebSocket.OPEN) {
        const { value, done } = await reader.read();
        if (done) {
          break;
        }

        pending += Buffer.from(value).toString('utf8');
        const lines = pending.split(/\r?\n/);
        pending = lines.pop() || '';

        for (const line of lines) {
          if (!line.trim()) {
            continue;
          }

          try {
            const event = JSON.parse(line) as { line?: string; service?: string };
            if (!event.line) {
              continue;
            }

            const logEntry = parseVmLogLine(event.line, event.service || options.service);
            if (logEntry && ws.readyState === WebSocket.OPEN) {
              ws.send(JSON.stringify(logEntry));
            }
          } catch (error) {
            console.warn('[LogStreaming] Skipping malformed VM log event:', error);
          }
        }
      }

      if (pending.trim()) {
        try {
          const event = JSON.parse(pending) as { line?: string; service?: string };
          if (event.line) {
            const logEntry = parseVmLogLine(event.line, event.service || options.service);
            if (logEntry && ws.readyState === WebSocket.OPEN) {
              ws.send(JSON.stringify(logEntry));
            }
          }
        } catch {
          // Ignore trailing partial frames.
        }
      }

      // Stream ended — auto-reconnect instead of closing
      if (ws.readyState === WebSocket.OPEN && !controller.signal.aborted) {
        console.warn('[LogStreaming] Ops agent stream ended, auto-reconnecting in 3s...');
        ws.send(JSON.stringify({
          timestamp: new Date().toISOString(),
          severity: 'INFO',
          message: '🔄 Log stream reconnecting...',
          resource: 'vm-log-stream',
        }));
        await new Promise(r => setTimeout(r, 3000));
        if (ws.readyState === WebSocket.OPEN && !controller.signal.aborted) {
          return this.attachVmLogStream(ws, options);
        }
      }
    } catch (error) {
      if (controller.signal.aborted) {
        return;
      }

      console.error('[LogStreaming] VM log proxy failed, falling back to local polling:', error);
      // Fall back to local polling if ops agent stream fails
      await this.attachLocalLogStream(ws, options, controller);
    } finally {
      if (this.vmStreamControllers.get(ws) === controller) {
        this.vmStreamControllers.delete(ws);
      }
    }
  }

  /**
   * Local fallback: poll Docker compose logs and push new lines to the WebSocket.
   * Runs every 3 seconds, deduplicating against previously seen lines.
   */
  private async attachLocalLogStream(
    ws: WebSocket,
    options: VmStreamOptions,
    controller: AbortController,
  ) {
    const seenLines = new Set();
    const POLL_INTERVAL_MS = 3000;

    // Send initial batch
    try {
      const snapshot = await getLocalDeploymentLogs(options.service, {
        tail: options.tail,
        since: options.since,
        grep: options.grep,
      });

      for (const rawLine of snapshot.lines) {
        seenLines.add(rawLine);
        const entry = parseVmLogLine(rawLine, options.service);
        if (entry && ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify(entry));
        }
      }
    } catch (err) {
      console.warn('[LogStreaming] Initial local log fetch failed:', err);
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({
          timestamp: new Date().toISOString(),
          severity: 'WARNING',
          message: 'Docker logs not available locally. Ensure Docker is running.',
          resource: 'vm-log-stream',
        }));
      }
    }

    // Poll loop
    const poll = async () => {
      if (controller.signal.aborted || ws.readyState !== WebSocket.OPEN) return;

      try {
        const snapshot = await getLocalDeploymentLogs(options.service, {
          tail: 100,
          since: '1m',
          grep: options.grep,
        });

        for (const rawLine of snapshot.lines) {
          if (seenLines.has(rawLine)) continue;
          seenLines.add(rawLine);

          const entry = parseVmLogLine(rawLine, options.service);
          if (entry && ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify(entry));
          }
        }

        // Cap the dedup set to prevent unbounded growth
        if (seenLines.size > 5000) {
          const arr = Array.from(seenLines);
          seenLines.clear();
          for (const line of arr.slice(arr.length - 2000)) {
            seenLines.add(line);
          }
        }
      } catch {
        // Silently retry on next poll
      }

      if (!controller.signal.aborted && ws.readyState === WebSocket.OPEN) {
        setTimeout(poll, POLL_INTERVAL_MS);
      }
    };

    setTimeout(poll, POLL_INTERVAL_MS);
  }

  private interceptConsole() {
    if (this.consoleInterceptActive) return;
    this.consoleInterceptActive = true;

    const origLog = console.log;
    const origWarn = console.warn;
    const origError = console.error;

    const self = this;

    const makeInterceptor = (original: (...args: any[]) => void, severity: string) => {
      return function (...args: any[]) {
        original.apply(console, args);
        if (self.wss.clients.size > 0) {
          const message = args
            .map((arg: any) => {
              if (typeof arg === 'string') return arg;
              if (arg instanceof Error) {
                return `${arg.message}${arg.stack ? `\n${arg.stack.split('\n').slice(1, 3).join('\n')}` : ''}`;
              }
              try {
                return JSON.stringify(arg);
              } catch {
                return String(arg);
              }
            })
            .join(' ');

          if (message.includes('[LogStreaming]') || message.includes('log stream')) {
            return;
          }

          self.broadcast({
            timestamp: new Date().toISOString(),
            severity,
            message,
            resource: 'console-intercept',
          });
        }
      };
    };

    console.log = makeInterceptor(origLog, 'DEFAULT');
    console.warn = makeInterceptor(origWarn, 'WARNING');
    console.error = makeInterceptor(origError, 'ERROR');
  }
}