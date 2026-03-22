/**
 * Voice Provider Fallback Handler
 *
 * Wraps a primary provider with automatic fallback capability.
 * Monitors primary provider health and switches to fallback on failure.
 */

import { EventEmitter } from "events";
import {
  IVoiceProvider,
  VoiceProviderType,
  VoiceProviderConfig,
  RateLimitInfo,
  AudioDeltaEvent,
  TranscriptEvent,
  FunctionCallEvent,
  ResponseEvent,
  ErrorEvent,
} from "./voice-provider.interface";

const LOG_PREFIX = "[FallbackHandler]";

// ==================== TYPES ====================

export interface FallbackOptions {
  /**
   * Callback when fallback is triggered
   */
  onFallback?: (reason: string) => void;

  /**
   * Callback when provider health changes
   */
  onHealthChange?: (provider: VoiceProviderType, healthy: boolean) => void;

  /**
   * Maximum connection attempts before giving up
   */
  maxRetries?: number;

  /**
   * Delay between retry attempts (ms)
   */
  retryDelay?: number;

  /**
   * Auto-reconnect on disconnect
   */
  autoReconnect?: boolean;
}

// ==================== FALLBACK HANDLER ====================

export class FallbackHandler extends EventEmitter implements IVoiceProvider {
  private primaryProvider: IVoiceProvider;
  private fallbackProvider: IVoiceProvider;
  private currentProvider: IVoiceProvider;
  private hasFallenBack: boolean = false;
  private config: VoiceProviderConfig | null = null;
  private options: Required;

  constructor(
    primaryProvider: IVoiceProvider,
    fallbackProvider: IVoiceProvider,
    options: FallbackOptions = {}
  ) {
    super();

    this.primaryProvider = primaryProvider;
    this.fallbackProvider = fallbackProvider;
    this.currentProvider = primaryProvider;

    this.options = {
      onFallback: options.onFallback || (() => {}),
      onHealthChange: options.onHealthChange || (() => {}),
      maxRetries: options.maxRetries ?? 2,
      retryDelay: options.retryDelay ?? 1000,
      autoReconnect: options.autoReconnect ?? false,
    };

    // Set up event forwarding
    this.setupEventForwarding(primaryProvider);
    this.setupEventForwarding(fallbackProvider);

    // Monitor primary provider for failures
    this.setupHealthMonitoring(primaryProvider);
  }

  // ==================== IVOICEPROVIDER IMPLEMENTATION ====================

  get providerName(): VoiceProviderType {
    return this.currentProvider.providerName;
  }

  get isConnected(): boolean {
    return this.currentProvider.isConnected;
  }

  get isResponding(): boolean {
    return this.currentProvider.isResponding;
  }

  async connect(): Promise {
    try {
      console.log(`${LOG_PREFIX} Connecting to primary provider: ${this.primaryProvider.providerName}`);
      await this.primaryProvider.connect();
      this.currentProvider = this.primaryProvider;
      this.options.onHealthChange(this.primaryProvider.providerName, true);
    } catch (error: any) {
      console.error(`${LOG_PREFIX} Primary provider failed to connect:`, error.message);
      this.options.onHealthChange(this.primaryProvider.providerName, false);

      // Try fallback
      await this.switchToFallback(`Primary connection failed: ${error.message}`);
    }
  }

  async disconnect(): Promise {
    // Disconnect both providers
    const disconnectPromises: Promise[] = [];

    if (this.primaryProvider.isConnected) {
      disconnectPromises.push(this.primaryProvider.disconnect());
    }

    if (this.fallbackProvider.isConnected) {
      disconnectPromises.push(this.fallbackProvider.disconnect());
    }

    await Promise.all(disconnectPromises);
  }

  async configure(config: VoiceProviderConfig): Promise {
    this.config = config;

    try {
      await this.currentProvider.configure(config);
    } catch (error: any) {
      console.error(`${LOG_PREFIX} Configure failed on ${this.currentProvider.providerName}:`, error.message);

      // If primary failed, try fallback
      if (this.currentProvider === this.primaryProvider && !this.hasFallenBack) {
        await this.switchToFallback(`Configure failed: ${error.message}`);
        await this.currentProvider.configure(config);
      } else {
        throw error;
      }
    }
  }

  sendAudio(audioBuffer: Buffer): void {
    this.currentProvider.sendAudio(audioBuffer);
  }

  sendTextMessage(text: string): void {
    this.currentProvider.sendTextMessage(text);
  }

  cancelResponse(): void {
    this.currentProvider.cancelResponse();
  }

  truncateAudio(itemId: string, audioEndMs: number): void {
    this.currentProvider.truncateAudio(itemId, audioEndMs);
  }

  respondToFunctionCall(callId: string, result: any): void {
    this.currentProvider.respondToFunctionCall(callId, result);
  }

  getRateLimits(): RateLimitInfo | null {
    return this.currentProvider.getRateLimits();
  }

  triggerResponse(): void {
    this.currentProvider.triggerResponse();
  }

  // ==================== FALLBACK LOGIC ====================

  private async switchToFallback(reason: string): Promise {
    if (this.hasFallenBack) {
      console.warn(`${LOG_PREFIX} Already on fallback provider, cannot switch again`);
      throw new Error("Both providers failed");
    }

    console.log(`${LOG_PREFIX} Switching to fallback provider: ${this.fallbackProvider.providerName}`);
    console.log(`${LOG_PREFIX} Reason: ${reason}`);

    this.hasFallenBack = true;
    this.options.onFallback(reason);

    // Connect fallback provider
    await this.fallbackProvider.connect();
    this.currentProvider = this.fallbackProvider;
    this.options.onHealthChange(this.fallbackProvider.providerName, true);

    // Reconfigure if we had a config
    if (this.config) {
      await this.fallbackProvider.configure(this.config);
    }

    console.log(`${LOG_PREFIX} Successfully switched to ${this.fallbackProvider.providerName}`);
  }

  // ==================== EVENT HANDLING ====================

  private setupEventForwarding(provider: IVoiceProvider): void {
    // Only forward events from the current provider
    const forwardEvent = (eventName: string) => {
      provider.on(eventName, (...args: any[]) => {
        if (provider === this.currentProvider) {
          this.emit(eventName, ...args);
        }
      });
    };

    // Forward all voice provider events
    forwardEvent('audio:delta');
    forwardEvent('audio:done');
    forwardEvent('transcript:user');
    forwardEvent('transcript:agent');
    forwardEvent('function:call');
    forwardEvent('speech:started');
    forwardEvent('speech:stopped');
    forwardEvent('response:started');
    forwardEvent('response:done');
    forwardEvent('response:cancelled');
    forwardEvent('connected');
    forwardEvent('disconnected');
    forwardEvent('reconnecting');
    forwardEvent('ratelimit:updated');
  }

  private setupHealthMonitoring(provider: IVoiceProvider): void {
    // Monitor for errors
    provider.on('error', async (event: ErrorEvent) => {
      if (provider !== this.currentProvider) return;

      console.error(`${LOG_PREFIX} Error from ${provider.providerName}:`, event.message);

      // If error is not recoverable and we haven't fallen back yet, switch
      if (!event.recoverable && !this.hasFallenBack) {
        try {
          await this.switchToFallback(`Provider error: ${event.message}`);
        } catch (fallbackError) {
          // Both providers failed - emit the error
          this.emit('error', event);
        }
      } else {
        // Forward the error
        this.emit('error', event);
      }
    });

    // Monitor for disconnects
    provider.on('disconnected', async (reason?: string) => {
      if (provider !== this.currentProvider) return;

      console.warn(`${LOG_PREFIX} Provider ${provider.providerName} disconnected: ${reason || 'unknown'}`);
      this.options.onHealthChange(provider.providerName, false);

      // If auto-reconnect is enabled and we haven't fallen back
      if (this.options.autoReconnect && !this.hasFallenBack) {
        try {
          console.log(`${LOG_PREFIX} Attempting to reconnect...`);
          await provider.connect();
          if (this.config) {
            await provider.configure(this.config);
          }
          this.options.onHealthChange(provider.providerName, true);
        } catch (error) {
          // Reconnect failed, try fallback
          try {
            await this.switchToFallback(`Reconnect failed: ${reason || 'unknown'}`);
          } catch {
            // Both failed
          }
        }
      }
    });
  }

  // ==================== UTILITY METHODS ====================

  /**
   * Get the current active provider
   */
  getCurrentProvider(): IVoiceProvider {
    return this.currentProvider;
  }

  /**
   * Check if currently using fallback provider
   */
  isUsingFallback(): boolean {
    return this.hasFallenBack;
  }

  /**
   * Get the primary provider (for direct access if needed)
   */
  getPrimaryProvider(): IVoiceProvider {
    return this.primaryProvider;
  }

  /**
   * Get the fallback provider (for direct access if needed)
   */
  getFallbackProvider(): IVoiceProvider {
    return this.fallbackProvider;
  }

  /**
   * Force switch to fallback (for testing or manual control)
   */
  async forceFallback(reason: string = 'Manual switch'): Promise {
    if (this.hasFallenBack) {
      console.warn(`${LOG_PREFIX} Already on fallback`);
      return;
    }

    await this.switchToFallback(reason);
  }

  /**
   * Send opening message to start the conversation
   */
  sendOpeningMessage(text: string): void {
    // Type assertion since this method is on the concrete providers
    const provider = this.currentProvider as any;
    if (typeof provider.sendOpeningMessage === 'function') {
      provider.sendOpeningMessage(text);
    } else {
      // Fallback: send as text message
      this.sendTextMessage(text);
      this.triggerResponse();
    }
  }
}

export default FallbackHandler;