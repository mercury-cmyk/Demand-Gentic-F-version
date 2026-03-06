/**
 * Drachtio SIP Server
 *
 * Dedicated SIP server using drachtio-srf framework for handling:
 * - Inbound/outbound SIP call signaling
 * - RTP media bridge
 * - SIP registration and presence
 * - Failover and high availability
 *
 * Requires:
 * - Public IP with UDP ports 5060, 5061 (SIP)
 * - UDP ports 10000-20000 (RTP/media)
 * - STUN/TURN servers for NAT traversal
 *
 * Configuration:
 * - DRACHTIO_HOST: Drachtio server address (default: localhost)
 * - DRACHTIO_PORT: Drachtio command port (default: 9022)
 * - SIP_LISTEN_PORT: Port for SIP signaling (default: 5060)
 * - SIP_LISTEN_HOST: Bind address (default: 0.0.0.0)
 * - PUBLIC_IP: Public IP for SDP (required for production)
 * - STUN_SERVERS: STUN server addresses
 * - TURN_SERVERS: TURN server addresses with credentials
 */

import Srf from 'drachtio-srf';
import { EventEmitter } from 'events';
import { v4 as uuidv4 } from 'uuid';
// sdp-transform removed — SDP is built as a plain string for maximum Telnyx compatibility

// Media bridging imports
import { getAudioEndpoint } from './sdp-parser';
import { GeminiLiveSIPProvider, type GeminiLiveSIPProviderConfig } from '../gemini-live-sip-provider';
import * as mediaBridgeClient from './media-bridge-client';

// Configuration
const DRACHTIO_HOST = (process.env.DRACHTIO_HOST || 'localhost').trim();
const DRACHTIO_PORT = parseInt((process.env.DRACHTIO_PORT || '9022').trim());
const DRACHTIO_SECRET = (process.env.DRACHTIO_SECRET || 'cymru').trim();
const SIP_LISTEN_HOST = (process.env.SIP_LISTEN_HOST || '0.0.0.0').trim();
const SIP_LISTEN_PORT = parseInt((process.env.SIP_LISTEN_PORT || '5060').trim());
const PUBLIC_IP = (process.env.PUBLIC_IP || '').trim();
const RTP_PORT_MIN = parseInt(process.env.RTP_PORT_MIN || '10000');
const RTP_PORT_MAX = parseInt(process.env.RTP_PORT_MAX || '20000');

// STUN/TURN Configuration
const STUN_SERVERS = (process.env.STUN_SERVERS || 'stun:stun.l.google.com:19302,stun:stun1.l.google.com:19302')
  .split(',')
  .map((s: string) => s.trim());

const TURN_SERVERS = process.env.TURN_SERVERS
  ? JSON.parse(process.env.TURN_SERVERS)
  : [];

// Logging
const log = (msg: string, data?: any) => {
  const timestamp = new Date().toISOString();
  console.log(`[Drachtio SIP] ${timestamp} ${msg}`, data || '');
};

const logError = (msg: string, error?: any) => {
  const timestamp = new Date().toISOString();
  console.error(`[Drachtio SIP] ${timestamp} ${msg}`, error || '');
};

/**
 * Call state tracking
 */
export interface DrachtioCall {
  callId: string;
  callGuid: string;
  from: string;
  to: string;
  state: 'initiating' | 'ringing' | 'answered' | 'ended';
  direction: 'inbound' | 'outbound';
  startTime: Date;
  endTime?: Date;
  req?: any;
  res?: any;
  campaign?: {
    campaignId: string;
    contactId: string;
    queueItemId: string;
  };
}

/**
 * RTP Port Manager
 */
class RTPPortManager {
  private usedPorts: Set<number> = new Set();
  private portRange = { min: RTP_PORT_MIN, max: RTP_PORT_MAX };

  allocate(): number {
    for (let port = this.portRange.min; port <= this.portRange.max; port += 2) {
      if (!this.usedPorts.has(port) && !this.usedPorts.has(port + 1)) {
        this.usedPorts.add(port);
        this.usedPorts.add(port + 1);
        return port;
      }
    }
    throw new Error(`No available RTP ports (range ${this.portRange.min}-${this.portRange.max})`);
  }

  release(port: number): void {
    this.usedPorts.delete(port);
    this.usedPorts.delete(port + 1);
  }

  getUtilization(): { used: number; total: number; percentage: number } {
    const total = (this.portRange.max - this.portRange.min + 1) / 2;
    const used = this.usedPorts.size / 2;
    return {
      used: Math.floor(used),
      total: Math.floor(total),
      percentage: Math.round((used / total) * 100),
    };
  }
}

const rtpPortManager = new RTPPortManager();

/**
 * Call tracking
 */
class CallTracker extends EventEmitter {
  private calls: Map<string, DrachtioCall> = new Map();

  add(call: DrachtioCall): void {
    this.calls.set(call.callId, call);
    this.emit('call:added', call);
    log(`Call added: ${call.callId} (${call.direction}) ${call.from} -> ${call.to}`);
  }

  update(callId: string, data: Partial<DrachtioCall>): void {
    const call = this.calls.get(callId);
    if (call) {
      Object.assign(call, data);
      this.emit('call:updated', call);
    }
  }

  remove(callId: string): void {
    const call = this.calls.get(callId);
    if (call) {
      call.endTime = new Date();
      this.calls.delete(callId);
      this.emit('call:removed', call);
      log(`Call removed: ${callId}`);
    }
  }

  get(callId: string): DrachtioCall | undefined {
    return this.calls.get(callId);
  }

  getAll(): DrachtioCall[] {
    return Array.from(this.calls.values());
  }

  getStats(): any {
    const calls = this.getAll();
    return {
      total: calls.length,
      inbound: calls.filter((c) => c.direction === 'inbound').length,
      outbound: calls.filter((c) => c.direction === 'outbound').length,
      averageDuration: this.calculateAverageDuration(),
    };
  }

  private calculateAverageDuration(): number {
    // TODO: Calculate from ended calls
    return 0;
  }
}

const callTracker = new CallTracker();

/**
 * Media provider tracking for cleanup
 */
class MediaProviderTracker {
  private providers: Map<string, GeminiLiveSIPProvider> = new Map();

  set(callId: string, provider: GeminiLiveSIPProvider): void {
    this.providers.set(callId, provider);
    log(`Media provider registered for call ${callId}`);
  }

  get(callId: string): GeminiLiveSIPProvider | undefined {
    return this.providers.get(callId);
  }

  async remove(callId: string): Promise<void> {
    const provider = this.providers.get(callId);
    if (provider) {
      try {
        await provider.stop();
        this.providers.delete(callId);
        log(`Media provider stopped and removed for call ${callId}`);
      } catch (error) {
        logError(`Error stopping media provider for ${callId}`, error);
      }
    }
  }

  getStats(): { activeProviders: number } {
    return {
      activeProviders: this.providers.size,
    };
  }
}

const mediaProviderTracker = new MediaProviderTracker();
export class DrachtioSIPServer {
  private srf: any = null;
  private isInitialized = false;
  private isConnected = false;
  private canMakeOutboundCalls = false;
  private lastConnectionError: string | null = null;

  async initialize(): Promise<boolean> {
    if (this.isInitialized) {
      log('Already initialized');
      return this.isConnected;
    }

    try {
      log('Initializing Drachtio SIP Server...');
      log(`Configuration: host=${DRACHTIO_HOST}, port=${DRACHTIO_PORT}, secret=${DRACHTIO_SECRET ? 'set' : 'MISSING'}, listenPort=${SIP_LISTEN_PORT}`);

      if (!PUBLIC_IP) {
        logError('PUBLIC_IP not set - SDP will not include public address');
      }

      // Create SRF instance
      this.srf = new Srf();

      // Connect to Drachtio daemon
      await this.connectToDrachtio();

      // Setup call handlers
      this.setupCallHandlers();

      this.isInitialized = true;
      this.isConnected = true;

      // Test if we can make outbound calls by checking socket availability
      this.canMakeOutboundCalls = this.testOutboundCapability();

      log('Drachtio SIP Server initialized successfully');
      log(`Outbound calling capability: ${this.canMakeOutboundCalls ? 'AVAILABLE' : 'NOT AVAILABLE'}`);
      return true;
    } catch (error) {
      logError('Failed to initialize Drachtio SIP Server', error);
      this.isConnected = false;
      this.canMakeOutboundCalls = false;
      return false;
    }
  }

  /**
   * Test if outbound calls can be made
   * Drachtio requires a valid socket for outbound UAC requests
   */
  private testOutboundCapability(): boolean {
    if (!this.srf) return false;

    try {
      // In outbound-connect mode, the SRF connection itself is the socket
      // for UAC requests. If we're connected, we can make outbound calls.
      if (this.isConnected) {
        log('Drachtio connected - outbound calling available');
        return true;
      }

      // Fallback: check internal sockets
      const agent = this.srf._agent;
      if (agent) {
        const sockets = agent._sockets;
        if (sockets && sockets.size > 0) {
          log(`Drachtio has ${sockets.size} socket(s) registered`);
          return true;
        }
      }

      log('No outbound capability detected');
      return false;
    } catch (error: any) {
      log(`Error checking outbound capability: ${error.message}`);
      return false;
    }
  }

  private async connectToDrachtio(): Promise<void> {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.lastConnectionError = `Connection timeout to Drachtio at ${DRACHTIO_HOST}:${DRACHTIO_PORT}`;
        reject(new Error(`Connection timeout to Drachtio at ${DRACHTIO_HOST}:${DRACHTIO_PORT}`));
      }, 10000);

      log(`Connecting to Drachtio at ${DRACHTIO_HOST}:${DRACHTIO_PORT} with secret=${DRACHTIO_SECRET ? '***' : 'MISSING'}`);

      this.srf.connect(
        {
          host: DRACHTIO_HOST,
          port: DRACHTIO_PORT,
          secret: DRACHTIO_SECRET,
        },
        (err: any, hostport: string) => {
          clearTimeout(timeout);
          if (err) {
            this.isConnected = false;
            this.lastConnectionError = err?.message || String(err);
            logError(`Drachtio authentication failed: ${err.message || err}`);
            reject(err);
            return;
          }
          this.isConnected = true;
          this.lastConnectionError = null;
          log(`Connected and authenticated to Drachtio daemon at ${DRACHTIO_HOST}:${DRACHTIO_PORT} (hostport: ${hostport})`);
          resolve();
        }
      );

      this.srf.on('error', (error: any) => {
        logError('Drachtio connection error', error);
        this.isConnected = false;
        this.lastConnectionError = error?.message || String(error);
      });

      this.srf.on('disconnect', () => {
        log('Drachtio connection closed');
        this.isConnected = false;
        this.lastConnectionError = 'Disconnected from drachtio daemon';
      });
    });
  }

  private setupCallHandlers(): void {
    if (!this.srf) return;

    // INVITE handler (inbound and outbound call requests)
    this.srf.invite(async (req: any, res: any) => {
      const callId = req.uri.user;
      const from = req.from.uri;
      const to = req.to.uri;

      log(`INVITE received: ${from} -> ${to}`);

      try {
        const call: DrachtioCall = {
          callId: uuidv4(),
          callGuid: req.headers['call-id'],
          from,
          to,
          state: 'initiating',
          direction: 'inbound',
          startTime: new Date(),
          req,
          res,
        };

        callTracker.add(call);

        // Extract SDP from request
        const remoteSdp = req.body;
        const rtpPort = rtpPortManager.allocate();

        // Generate local SDP with ICE and DTLS
        const localSdp = this.generateSDP({
          port: rtpPort,
          remoteSdp,
          callId: call.callId,
        });

        // Send 180 Ringing
        res.send(180, {
          headers: {
            'Content-Type': 'application/sdp',
          },
          body: localSdp,
        });

        callTracker.update(call.callId, { state: 'ringing' });

        // Accept call (send 200 OK)
        res.send(200, {
          headers: {
            'Content-Type': 'application/sdp',
          },
          body: localSdp,
        });

        callTracker.update(call.callId, { state: 'answered' });

        // Setup media handlers
        await this.setupMediaHandlers(call, rtpPort);

        // BYE handler (call termination)
        req.on('bye', async () => {
          log(`BYE received for call ${call.callId}`);
          // Clean up media provider
          await mediaProviderTracker.remove(call.callId);
          // Release RTP port
          rtpPortManager.release(rtpPort);
          // Remove call tracking
          callTracker.remove(call.callId);
        });

        // CANCEL handler
        req.on('cancel', async () => {
          log(`CANCEL received for call ${call.callId}`);
          // Clean up media provider
          await mediaProviderTracker.remove(call.callId);
          // Release RTP port
          rtpPortManager.release(rtpPort);
          // Remove call tracking
          callTracker.remove(call.callId);
        });
      } catch (error) {
        logError(`Error handling INVITE: ${error}`, error);
        res.send(500, { body: 'Server Internal Error' });
      }
    });

    // REGISTER handler (if needed for presence/registration)
    this.srf.register(async (req: any, res: any) => {
      const user = req.from.uri.split('@')[0];
      log(`REGISTER from ${user}`);

      // Accept registration
      res.send(200, {
        headers: {
          'Contact': req.headers['contact'],
        },
      });
    });

    // OPTIONS handler (SIP keep-alive / OPTIONS ping)
    this.srf.options(async (req: any, res: any) => {
      res.send(200, {
        headers: {
          'Allow': 'INVITE, ACK, BYE, CANCEL, OPTIONS, REGISTER',
          'Accept': 'application/sdp',
        },
      });
    });
  }

  /**
   * Generate standard SIP SDP for PSTN/Telnyx trunk
   * Uses plain RTP/AVP with G.711 codecs — no WebRTC attributes (ICE, DTLS, SRTP)
   */
  private generateSDP(options: {
    port: number;
    remoteSdp?: string;
    callId: string;
  }): string {
    const { port, callId } = options;
    const listenAddr = PUBLIC_IP || SIP_LISTEN_HOST;
    const sessionId = Math.floor(Math.random() * 1e10);

    log(`SDP: listenAddr=${listenAddr} (PUBLIC_IP=${PUBLIC_IP || 'NOT SET'}, SIP_LISTEN_HOST=${SIP_LISTEN_HOST}), port=${port}`);

    // Build standard SIP SDP manually for maximum compatibility with Telnyx
    const lines = [
      'v=0',
      `o=drachtio ${sessionId} 1 IN IP4 ${listenAddr}`,
      `s=DemandGentic ${callId}`,
      `c=IN IP4 ${listenAddr}`,
      't=0 0',
      `m=audio ${port} RTP/AVP 0 8 101`,
      'a=rtpmap:0 PCMU/8000',
      'a=rtpmap:8 PCMA/8000',
      'a=rtpmap:101 telephone-event/8000',
      'a=fmtp:101 0-15',
      'a=ptime:20',
      'a=sendrecv',
    ];

    return lines.join('\r\n') + '\r\n';
  }

  /**
   * Setup media handlers for RTP/RTCP
   * 
   * This method creates and starts a Gemini Live SIP provider that:
   * - Listens for incoming RTP packets on the allocated port
   * - Transcodes G.711 audio to PCM for Gemini Live
   * - Streams audio to Gemini Live API via WebSocket
   * - Receives Gemini responses and transcodes back to G.711
   * - Sends response audio back to the caller as RTP packets
   */
  private async setupMediaHandlers(call: DrachtioCall, rtpPort: number): Promise<void> {
    try {
      log(`Setting up media handlers for call ${call.callId} on port ${rtpPort}`);

      // Extract remote RTP endpoint from SDP
      const remoteEndpoint = getAudioEndpoint(call.req.body);
      if (!remoteEndpoint) {
        throw new Error(`Could not parse audio endpoint from remote SDP for call ${call.callId}`);
      }

      log(`Remote RTP endpoint: ${remoteEndpoint.address}:${remoteEndpoint.port}`);

      // Get Gemini API configuration
      const geminiApiKey = process.env.GEMINI_API_KEY;
      if (!geminiApiKey) {
        throw new Error('GEMINI_API_KEY environment variable not set');
      }

      // Build provider configuration
      const providerConfig: GeminiLiveSIPProviderConfig = {
        geminiApiKey,
        model: process.env.GEMINI_MODEL || 'models/gemini-2.5-flash-native-audio-preview',
        voiceName: process.env.GEMINI_VOICE_NAME || 'Puck',
        systemPrompt: process.env.GEMINI_SYSTEM_PROMPT || 
          'You are a helpful sales representative. ' +
          'Be concise, professional, and focus on understanding the caller\'s needs. ' +
          'Ask clarifying questions when needed. ' +
          'Maintain a friendly, conversational tone.',
      };

      // Extract phone number from destination (if available)
      // Used to detect G.711 format (mulaw vs alaw)
      let toPhoneNumber: string | undefined;
      try {
        const toUri = call.to;
        const match = toUri.match(/sip:([^@]+)[@:]/);
        if (match) {
          toPhoneNumber = match[1];
        }
      } catch (e) {
        // Continue without phone number
      }

      // Create Gemini Live SIP provider
      const provider = new GeminiLiveSIPProvider(
        call.callId,
        rtpPort,
        remoteEndpoint.address,
        remoteEndpoint.port,
        providerConfig,
        toPhoneNumber
      );

      // Start the provider
      const started = await provider.start();
      if (!started) {
        throw new Error('Failed to start Gemini Live SIP provider');
      }

      // Track provider for cleanup
      mediaProviderTracker.set(call.callId, provider);

      log(`✓ Media handlers initialized for call ${call.callId}`);
    } catch (error) {
      logError(`Error setting up media handlers for call ${call.callId}`, error);
      // Don't throw - call already has SDP response sent
      // Provider will simply not be active for this call
    }
  }

  /**
   * Check if outbound calls can be made
   */
  canMakeOutbound(): boolean {
    return this.canMakeOutboundCalls && this.isConnected && !!this.srf;
  }

  /**
   * Initiate outbound call via SIP trunk
   */
  async initiateCall(options: {
    to: string;
    from: string;
    campaignId?: string;
    contactId?: string;
    queueItemId?: string;
    telephonyProviderOverride?: {
      sipDomain?: string;
      sipProxy?: string;
      sipPort?: number;
      sipTransport?: "udp" | "tcp" | "tls" | "wss";
      sipUsername?: string;
      sipPassword?: string;
    };
    onAudioReceived?: (audio: Buffer) => void;
    onCallStateChanged?: (state: string) => void;
    onCallEnded?: (reason: string) => void;
  }): Promise<{ callId: string; success: boolean; error?: string; rtpPort?: number; remoteAddress?: string; remotePort?: number }> {
    if (!this.isConnected || !this.srf) {
      return { callId: '', success: false, error: 'Drachtio not connected' };
    }

    // Check if we can actually make outbound calls
    if (!this.canMakeOutboundCalls) {
      // Re-test capability in case it changed
      this.canMakeOutboundCalls = this.testOutboundCapability();
      if (!this.canMakeOutboundCalls) {
        return {
          callId: '',
          success: false,
          error: 'SIP outbound calling not available - no valid socket. Fall back to Telnyx API.'
        };
      }
    }

    const callId = uuidv4();
    let rtpPort: number | null = null;

    // SIP trunk configuration from environment
    const override = options.telephonyProviderOverride;
    const sipTrunkHost = override?.sipProxy || override?.sipDomain || process.env.SIP_TRUNK_HOST || 'sip.telnyx.com';
    const sipPort = override?.sipPort;
    const sipTransport = override?.sipTransport;
    const trunkAuthority = sipPort ? `${sipTrunkHost}:${sipPort}` : sipTrunkHost;
    const stripBOM = (s: string) => s.replace(/^\uFEFF/, '');
    const sipUsername = stripBOM((override?.sipUsername || process.env.SIP_USERNAME || process.env.TELNYX_SIP_USERNAME || '').trim());
    const sipPassword = stripBOM((override?.sipPassword || process.env.SIP_PASSWORD || process.env.TELNYX_SIP_PASSWORD || '').trim());

    try {
      rtpPort = rtpPortManager.allocate();
      const localSdp = this.generateSDP({ port: rtpPort, callId });

      // Format the destination number (strip + if present for SIP URI)
      const toNumber = options.to.replace(/^\+/, '');
      const fromNumber = options.from.replace(/^\+/, '');

      // Build SIP URI for Telnyx trunk
      const transportSuffix = sipTransport ? `;transport=${sipTransport}` : '';
      const requestUri = `sip:${toNumber}@${trunkAuthority}${transportSuffix}`;

      log(`Initiating outbound call ${callId} to ${requestUri} (auth: ${sipUsername ? sipUsername : 'none'})`);

      // Create UAC (User Agent Client) to send INVITE
      const uacOptions = {
        headers: {
          'From': `<sip:${fromNumber}@${trunkAuthority}>`,
          'To': `<sip:${toNumber}@${trunkAuthority}>`,
          'Contact': `<sip:${fromNumber}@${PUBLIC_IP || '127.0.0.1'}:${SIP_LISTEN_PORT}>`,
        },
        auth: sipUsername && sipPassword ? {
          username: sipUsername,
          password: sipPassword,
        } : undefined,
        localSdp,
      };

      // Use simple UAC toward the SIP trunk
      let uac: any;
      try {
        uac = await this.srf.createUAC(requestUri, {
          ...uacOptions,
          callingNumber: fromNumber,
          calledNumber: toNumber,
        });
      } catch (uacError: any) {
        // Handle specific assertion errors from drachtio-srf
        if (uacError.message?.includes('AssertionError') || uacError.name === 'AssertionError') {
          log('Drachtio socket not available for outbound calls - disabling SIP outbound');
          this.canMakeOutboundCalls = false;
          this.lastConnectionError = 'Socket assertion failed - drachtio daemon may not support outbound UAC';
          throw new Error('SIP socket not available for outbound calls. Use Telnyx API instead.');
        }
        throw uacError;
      }

      // Extract remote RTP endpoint from 200 OK SDP
      let remoteAddress = '';
      let remoteRtpPort = 0;
      try {
        const remoteSdp = uac?.remote?.sdp || '';
        if (remoteSdp) {
          const endpoint = getAudioEndpoint(remoteSdp);
          if (endpoint) {
            remoteAddress = endpoint.address;
            remoteRtpPort = endpoint.port;
            log(`Remote RTP endpoint for ${callId}: ${remoteAddress}:${remoteRtpPort}`);
          }
        }
      } catch (e) {
        logError(`Could not parse remote SDP for ${callId}`, e);
      }

      const call: DrachtioCall = {
        callId,
        callGuid: (uac as any)?.headers?.['call-id'] || `${Date.now()}-${Math.random()}`,
        from: options.from,
        to: options.to,
        state: 'answered',
        direction: 'outbound',
        startTime: new Date(),
        req: uac as any,
        res: undefined,
        campaign: {
          campaignId: options.campaignId || '',
          contactId: options.contactId || '',
          queueItemId: options.queueItemId || '',
        },
      };

      callTracker.add(call);

      // Handle call events
      if (uac) {
        (uac as any).on('destroy', async () => {
          log(`Call ${callId} destroyed`);
          call.state = 'ended';
          call.endTime = new Date();
          if (rtpPort) rtpPortManager.release(rtpPort);
          // Clean up media bridge on VM
          mediaBridgeClient.destroyMediaBridge(callId).catch(() => {});
          if (options.onCallEnded) {
            options.onCallEnded('call_ended');
          }
        });
      }

      if (options.onCallStateChanged) {
        options.onCallStateChanged('answered');
      }

      log(`Call ${callId} initiated and answered (RTP port ${rtpPort}, remote ${remoteAddress}:${remoteRtpPort})`);
      return { callId, success: true, rtpPort: rtpPort || undefined, remoteAddress: remoteAddress || undefined, remotePort: remoteRtpPort || undefined };
    } catch (error: any) {
      if (rtpPort) rtpPortManager.release(rtpPort);
      logError(`Failed to initiate call ${callId}: ${error.message}`, error);

      // Mark outbound as unavailable if it's a socket/connection issue
      if (error.message?.includes('socket') || error.message?.includes('Socket') ||
          error.message?.includes('AssertionError') || error.message?.includes('not available')) {
        this.canMakeOutboundCalls = false;
      }

      return { callId, success: false, error: error.message };
    }
  }

  /**
   * End call
   */
  async endCall(callId: string): Promise<void> {
    const call = callTracker.get(callId);
    if (!call) {
      throw new Error(`Call not found: ${callId}`);
    }

    // Send BYE via dialog destroy
    if (call.req) {
      try {
        if (typeof call.req.destroy === 'function') {
          call.req.destroy();
        } else if (typeof call.req.bye === 'function') {
          call.req.bye();
        } else {
          log(`Cannot end call ${callId}: dialog has no destroy/bye method`);
        }
      } catch (err: any) {
        log(`Error sending BYE for ${callId}: ${err.message}`);
      }
    }

    callTracker.remove(callId);
    log(`Call ended: ${callId}`);
  }

  /**
   * Get server stats
   */
  getStats() {
    return {
      connected: this.isConnected,
      canMakeOutboundCalls: this.canMakeOutboundCalls,
      lastConnectionError: this.lastConnectionError,
      drachtioHost: DRACHTIO_HOST,
      drachtioPort: DRACHTIO_PORT,
      sipListenPort: SIP_LISTEN_PORT,
      publicIp: PUBLIC_IP,
      rtpPorts: rtpPortManager.getUtilization(),
      calls: callTracker.getStats(),
      stunServers: STUN_SERVERS.length,
      turnServers: TURN_SERVERS.length,
    };
  }

  /**
   * Health check
   */
  async healthCheck(): Promise<boolean> {
    if (!this.isConnected) {
      try {
        await this.connectToDrachtio();
      } catch (error) {
        logError('Health check failed', error);
        return false;
      }
    }
    return true;
  }

  /**
   * Get call state by ID
   */
  getCallState(callId: string): DrachtioCall | undefined {
    return callTracker.get(callId);
  }

  /**
   * Get all active calls
   */
  getActiveCalls(): DrachtioCall[] {
    return callTracker.getAll();
  }
}

// Export singleton instance
export const drachtioServer = new DrachtioSIPServer();
