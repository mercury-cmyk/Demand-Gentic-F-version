/**
 * Real-time Log Streaming Service
 *
 * This service sets up a Google Cloud Logging sink to export logs to a Pub/Sub topic,
 * subscribes to that topic, and streams the logs to a WebSocket server.
 *
 * This provides a real-time stream of logs to the internal dashboard.
 *
 * To use this service, you need to install the following dependencies:
 * npm install @google-cloud/pubsub ws
 */

import { PubSub } from '@google-cloud/pubsub';
import { Logging } from '@google-cloud/logging';
import { WebSocketServer, WebSocket } from 'ws';

const PROJECT_ID = process.env.GOOGLE_CLOUD_PROJECT || process.env.GCP_PROJECT_ID || 'pivotalb2b-2026';
const TOPIC_NAME = 'cloud-logging-stream';
const SINK_NAME = 'cloud-logging-stream-sink';
const SUBSCRIPTION_NAME = 'cloud-logging-stream-sub';

interface LogEntry {
  timestamp: string;
  severity: string;
  message: string;
  resource?: string;
  labels?: Record<string, string>;
  jsonPayload?: any;
  textPayload?: string;
}

export class LogStreamingService {
  private pubsub: PubSub;
  private logging: Logging;
  private wss: WebSocketServer;

  constructor(server: any) {
    this.pubsub = new PubSub({ projectId: PROJECT_ID });
    this.logging = new Logging({ projectId: PROJECT_ID });
    // Use noServer: true to avoid conflict with manual upgrade handling in index.ts
    this.wss = new WebSocketServer({ noServer: true });

    this.setupWebSocketServer();
  }

  /**
   * Initializes the log streaming service.
   * This includes creating the Pub/Sub topic, the log sink, and the subscription.
   */
  async initialize() {
    try {
      await this.createTopic();
      await this.createSink();
      await this.createSubscription();
      this.listenForMessages();
    } catch (error) {
      console.error('Error initializing log streaming service:', error);
    }
  }

  /**
   * Creates the Pub/Sub topic if it doesn't already exist.
   */
  private async createTopic() {
    const [topic] = await this.pubsub.topic(TOPIC_NAME).get({ autoCreate: true });
    console.log(`Topic ${topic.name} created.`);
  }

  /**
   * Creates the Cloud Logging sink if it doesn't already exist.
   * The sink exports logs to the Pub/Sub topic.
   */
  private async createSink() {
    const sink = this.logging.sink(SINK_NAME);

    try {
      await sink.getMetadata();
      console.log(`Sink ${SINK_NAME} already exists.`);
      return;
    } catch (error: any) {
      if (error.code !== 5) { // 5 = NOT_FOUND
        throw error;
      }
    }

    const destination = `pubsub.googleapis.com/projects/${PROJECT_ID}/topics/${TOPIC_NAME}`;
    const filter = `resource.type="cloud_run_revision" AND resource.labels.service_name="demandgentic-api"`;

    await this.logging.createSink(SINK_NAME, {
      destination,
      filter,
    });
    console.log(`Sink ${SINK_NAME} created.`);
  }

  /**
   * Creates the Pub/Sub subscription if it doesn't already exist.
   */
  private async createSubscription() {
    const subscription = this.pubsub.topic(TOPIC_NAME).subscription(SUBSCRIPTION_NAME);
    const [exists] = await subscription.exists();

    if (exists) {
      console.log(`Subscription ${SUBSCRIPTION_NAME} already exists.`);
      return;
    }

    await subscription.create();
    console.log(`Subscription ${SUBSCRIPTION_NAME} created.`);
  }

  /**
   * Listens for messages on the Pub/Sub subscription and broadcasts them to all connected WebSocket clients.
   */
  private listenForMessages() {
    const subscription = this.pubsub.subscription(SUBSCRIPTION_NAME);

    subscription.on('message', message => {
      try {
        const logEntry = JSON.parse(message.data.toString()) as LogEntry;
        this.broadcast(logEntry);
        message.ack();
      } catch (error) {
        console.error('Error processing log message:', error);
        message.nack();
      }
    });

    subscription.on('error', error => {
      console.error('Error receiving message:', error);
    });

    console.log(`Listening for messages on ${SUBSCRIPTION_NAME}.`);
  }

  /**
   * Sets up the WebSocket server.
   */
  private setupWebSocketServer() {
    this.wss.on('connection', ws => {
      console.log('Client connected to log stream.');
      ws.on('close', () => {
        console.log('Client disconnected from log stream.');
      });
    });
  }

  /**
   * Broadcasts a message to all connected WebSocket clients.
   * @param data The data to broadcast.
   */
  private broadcast(data: any) {
    this.wss.clients.forEach(client => {
      if (client.readyState === WebSocket.OPEN) {
        client.send(JSON.stringify(data));
      }
    });
  }

  /**
   * Handles WebSocket upgrade requests.
   * @param request The HTTP request.
   * @param socket The network socket between the server and client.
   * @param head The first packet of the upgraded stream.
   */
  handleUpgrade(request: any, socket: any, head: any) {
    this.wss.handleUpgrade(request, socket, head, ws => {
      this.wss.emit('connection', ws, request);
    });
  }
}
