/**
 * SIP-Based Gemini Live Provider
 *
 * This provider integrates Gemini Live AI with the drachtio-srf SIP server.
 * It handles the media bridging between SIP calls and Gemini Live WebSocket.
 *
 * Architecture:
 * 1. SIP call arrives at Drachtio server
 * 2. Drachtio routes media to RTP port
 * 3. This provider receives RTP packets
 * 4. Transcodes to PCM for Gemini Live
 * 5. Sends audio to Gemini WebSocket
 * 6. Receives Gemini response
 * 7. Transcodes back to RTP/G.711
 * 8. Sends to caller
 */

import { WebSocket } from 'ws';
import { v4 as uuidv4 } from 'uuid';
import * as dgram from 'dgram';
import { g711ToPcm16k, pcm16kToG711, detectG711Format, type G711Format } from './voice-providers/audio-transcoder';

const log = (msg: string) => {
  console.log(`[Gemini Live SIP Provider] ${msg}`);
};

const logError = (msg: string, error?: any) => {
  console.error(`[Gemini Live SIP Provider] ${msg}`, error || '');
};

/**
 * Configuration for Gemini Live SIP provider
 */
export interface GeminiLiveSIPProviderConfig {
  geminiApiKey: string;
  model?: string;
  voiceName?: string;
  systemPrompt: string;
}

/**
 * Media bridge between SIP (RTP/G.711) and Gemini Live (WebSocket/PCM)
 */
export class GeminiLiveSIPProvider {
  private callId: string;
  private rtpPort: number;
  private rtpSocket: dgram.Socket | null = null;
  private geminiWs: WebSocket | null = null;
  private remoteRtpAddress: string;
  private remoteRtpPort: number;
  private config: GeminiLiveSIPProviderConfig;
  private sequenceNumber: number = 0;
  private timestamp: number = Math.floor(Math.random() * 0xffffffff);
  private g711Format: G711Format = 'ulaw';

  constructor(
    callId: string,
    rtpPort: number,
    remoteAddress: string,
    remotePort: number,
    config: GeminiLiveSIPProviderConfig,
    toPhoneNumber?: string
  ) {
    this.callId = callId;
    this.rtpPort = rtpPort;
    this.remoteRtpAddress = remoteAddress;
    this.remoteRtpPort = remotePort;
    this.config = config;
    this.g711Format = detectG711Format(toPhoneNumber);

    log(`Provider created: ${callId} (RTP: ${rtpPort}, Remote: ${remoteAddress}:${remotePort}, Format: ${this.g711Format})`);
  }

  /**
   * Start media bridge
   */
  async start(): Promise<boolean> {
    try {
      log(`Starting media bridge for call ${this.callId}`);

      // Start RTP receiver
      if (!this.startRtpReceiver()) {
        throw new Error('Failed to start RTP receiver');
      }

      // Connect to Gemini Live
      if (!(await this.connectToGeminiLive())) {
        throw new Error('Failed to connect to Gemini Live');
      }

      log(`✓ Media bridge started for call ${this.callId}`);
      return true;
    } catch (error) {
      logError(`Failed to start media bridge for ${this.callId}`, error);
      return false;
    }
  }

  /**
   * Start RTP receiver on specified port
   */
  private startRtpReceiver(): boolean {
    try {
      this.rtpSocket = dgram.createSocket('udp4');

      this.rtpSocket.on('message', (buffer: Buffer, rinfo: dgram.RemoteInfo) => {
        this.handleIncomingRTP(buffer, rinfo);
      });

      this.rtpSocket.on('error', (error: Error) => {
        logError(`RTP socket error for ${this.callId}`, error);
      });

      this.rtpSocket.bind(this.rtpPort, '0.0.0.0', () => {
        log(`RTP receiver listening on port ${this.rtpPort}`);
      });

      return true;
    } catch (error) {
      logError(`Failed to start RTP receiver`, error);
      return false;
    }
  }

  /**
   * Handle incoming RTP packets from SIP
   */
  private handleIncomingRTP(buffer: Buffer, rinfo: dgram.RemoteInfo): void {
    try {
      // Parse RTP header
      const rtpHeader = {
        version: (buffer[0] >> 6) & 0x03,
        padding: (buffer[0] >> 5) & 0x01,
        extension: (buffer[0] >> 4) & 0x01,
        csrcCount: buffer[0] & 0x0f,
        marker: (buffer[1] >> 7) & 0x01,
        payloadType: buffer[1] & 0x7f,
        sequenceNumber: buffer.readUInt16BE(2),
        timestamp: buffer.readUInt32BE(4),
        ssrc: buffer.readUInt32BE(8),
      };

      // Skip CSRC list (if present)
      const csrcSize = rtpHeader.csrcCount * 4;
      let rtpPayloadStart = 12 + csrcSize;

      // Skip RTP extension header (if present)
      if (rtpHeader.extension) {
        const extLen = buffer.readUInt16BE(rtpPayloadStart + 2) * 4 + 4;
        rtpPayloadStart += extLen;
      }

      // Extract payload (G.711 audio)
      const g711Payload = buffer.slice(rtpPayloadStart);

      // Transcode G.711 to PCM
      const pcmAudio = this.transcodeG711ToPcm(g711Payload);

      // Send to Gemini Live
      this.sendAudioToGemini(pcmAudio);
    } catch (error) {
      logError(`Error processing RTP packet for ${this.callId}`, error);
    }
  }

  /**
   * Transcode G.711 audio to PCM
   */
  private transcodeG711ToPcm(g711Buffer: Buffer): Buffer {
    try {
      // Use existing transcoder with detected format
      return g711ToPcm16k(g711Buffer, this.g711Format);
    } catch (error) {
      logError(`G.711 transcoding error for ${this.callId}`, error);
      return Buffer.alloc(0);
    }
  }

  /**
   * Transcode PCM audio to G.711
   */
  private transcodePcmToG711(pcmBuffer: Buffer): Buffer {
    try {
      // Use existing transcoder with detected format
      return pcm16kToG711(pcmBuffer, this.g711Format);
    } catch (error) {
      logError(`PCM transcoding error for ${this.callId}`, error);
      return Buffer.alloc(0);
    }
  }

  /**
   * Connect to Gemini Live WebSocket
   */
  private async connectToGeminiLive(): Promise<boolean> {
    return new Promise((resolve) => {
      try {
        const geminiWsUrl = `wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1alpha.GenerativeService.BidiGenerateContent?key=${this.config.geminiApiKey}`;

        this.geminiWs = new WebSocket(geminiWsUrl);

        this.geminiWs.on('open', () => {
          log(`✓ Connected to Gemini Live for call ${this.callId}`);

          // Send setup message
          this.sendGeminiSetup();
          resolve(true);
        });

        this.geminiWs.on('message', (data: Buffer) => {
          this.handleGeminiMessage(data);
        });

        this.geminiWs.on('error', (error: Error) => {
          logError(`Gemini WebSocket error for ${this.callId}`, error);
          resolve(false);
        });

        this.geminiWs.on('close', () => {
          log(`Gemini WebSocket closed for call ${this.callId}`);
        });

        setTimeout(() => {
          if (this.geminiWs?.readyState !== WebSocket.OPEN) {
            logError(`Gemini connection timeout for ${this.callId}`);
            resolve(false);
          }
        }, 5000);
      } catch (error) {
        logError(`Failed to connect to Gemini Live for ${this.callId}`, error);
        resolve(false);
      }
    });
  }

  /**
   * Send setup configuration to Gemini Live
   */
  private sendGeminiSetup(): void {
    if (!this.geminiWs || this.geminiWs.readyState !== WebSocket.OPEN) {
      return;
    }

    const setupMessage = {
      setup: {
        model: this.config.model || 'models/gemini-2.5-flash-native-audio-preview',
        generationConfig: {
          speechConfig: {
            voiceConfig: {
              prebuiltVoiceConfig: {
                voiceName: this.config.voiceName || 'Puck',
              },
            },
          },
        },
        systemInstruction: {
          parts: [{ text: this.config.systemPrompt }],
        },
      },
    };

    this.geminiWs.send(JSON.stringify(setupMessage));
    log(`Gemini setup sent for call ${this.callId}`);
  }

  /**
   * Send audio to Gemini Live
   */
  private sendAudioToGemini(audioBuffer: Buffer): void {
    if (!this.geminiWs || this.geminiWs.readyState !== WebSocket.OPEN) {
      return;
    }

    if (audioBuffer.length === 0) {
      return;
    }

    const audioMessage = {
      realtimeInput: {
        mediaChunks: [
          {
            data: audioBuffer.toString('base64'),
            mimeType: 'audio/pcm;rate=16000',
          },
        ],
      },
    };

    try {
      this.geminiWs.send(JSON.stringify(audioMessage));
    } catch (error) {
      logError(`Failed to send audio to Gemini for ${this.callId}`, error);
    }
  }

  /**
   * Handle messages from Gemini Live
   */
  private handleGeminiMessage(data: Buffer): void {
    try {
      const message = JSON.parse(data.toString());

      if (message.serverContent?.audioContent) {
        // Extract audio data
        const audioData = Buffer.from(
          message.serverContent.audioContent.data,
          'base64'
        );

        // Transcode PCM to G.711
        const g711Audio = this.transcodePcmToG711(audioData);

        // Send via RTP
        this.sendRTPAudio(g711Audio);
      }

      if (message.serverContent?.textContent) {
        log(`Gemini response text for ${this.callId}: ${message.serverContent.textContent.text}`);
      }
    } catch (error) {
      logError(`Error handling Gemini message for ${this.callId}`, error);
    }
  }

  /**
   * Send audio via RTP
   */
  private sendRTPAudio(g711Audio: Buffer): void {
    if (!this.rtpSocket) {
      return;
    }

    try {
      // Build RTP header
      const rtpHeader = Buffer.alloc(12);

      // V(2), P(1), X(1), CC(4)
      rtpHeader[0] = 0x80; // Version 2

      // M(1), PT(7) - PT 0 for PCMU (G.711 mulaw)
      rtpHeader[1] = 0x00;

      // Sequence number (big-endian)
      rtpHeader.writeUInt16BE(this.sequenceNumber++, 2);

      // Timestamp (big-endian)
      rtpHeader.writeUInt32BE(this.timestamp, 4);
      this.timestamp += g711Audio.length / 2; // Update for next packet

      // SSRC (big-endian)
      rtpHeader.writeUInt32BE(0x12345678, 8);

      // Combine RTP header + payload
      const rtpPacket = Buffer.concat([rtpHeader, g711Audio]);

      // Send to remote address
      this.rtpSocket.send(
        rtpPacket,
        0,
        rtpPacket.length,
        this.remoteRtpPort,
        this.remoteRtpAddress,
        (error) => {
          if (error) {
            logError(`RTP send error for ${this.callId}`, error);
          }
        }
      );
    } catch (error) {
      logError(`Failed to send RTP audio for ${this.callId}`, error);
    }
  }

  /**
   * Stop the media bridge
   */
  async stop(): Promise<void> {
    log(`Stopping media bridge for call ${this.callId}`);

    // Close RTP socket
    if (this.rtpSocket) {
      this.rtpSocket.close();
      this.rtpSocket = null;
    }

    // Close Gemini WebSocket
    if (this.geminiWs) {
      this.geminiWs.close();
      this.geminiWs = null;
    }

    log(`✓ Media bridge stopped for call ${this.callId}`);
  }
}

// Track active providers
const activeProviders: Map<string, GeminiLiveSIPProvider> = new Map();

/**
 * Create and start a Gemini Live SIP provider for a call
 */
export async function createGeminiLiveSIPProvider(
  callId: string,
  rtpPort: number,
  remoteAddress: string,
  remotePort: number,
  config: GeminiLiveSIPProviderConfig,
  toPhoneNumber?: string
): Promise<GeminiLiveSIPProvider | null> {
  try {
    const provider = new GeminiLiveSIPProvider(
      callId,
      rtpPort,
      remoteAddress,
      remotePort,
      config,
      toPhoneNumber
    );

    if (await provider.start()) {
      activeProviders.set(callId, provider);
      return provider;
    }

    return null;
  } catch (error) {
    logError(`Failed to create Gemini Live SIP provider for ${callId}`, error);
    return null;
  }
}

/**
 * Get active provider for a call
 */
export function getGeminiLiveSIPProvider(callId: string): GeminiLiveSIPProvider | undefined {
  return activeProviders.get(callId);
}

/**
 * Stop provider and remove from tracking
 */
export async function stopGeminiLiveSIPProvider(callId: string): Promise<void> {
  const provider = activeProviders.get(callId);
  if (provider) {
    await provider.stop();
    activeProviders.delete(callId);
  }
}

/**
 * Get stats on active providers
 */
export function getGeminiLiveSIPProviderStats() {
  return {
    activeProviders: activeProviders.size,
    calls: Array.from(activeProviders.keys()),
  };
}
