/**
 * Telephony Provider Factory
 * 
 * Creates and manages telephony provider instances.
 * Implements provider registry for selection/failover.
 * 
 * ISOLATED from production Telnyx workflow until fully tested.
 */

import {
  ITelephonyProvider,
  ITelephonyProviderRegistry,
  TelephonyProviderConfig,
  ProviderSelectionOptions,
  ProviderCapabilities,
} from './telephony-provider.interface';
import { TelnyxProvider } from './telnyx-provider';
import { SipTrunkProvider } from './sip-trunk-provider';

export class TelephonyProviderFactory {
  /**
   * Create a provider instance from configuration
   */
  static createProvider(config: TelephonyProviderConfig): ITelephonyProvider {
    switch (config.type) {
      case 'telnyx':
        return new TelnyxProvider(config);
      
      case 'sip_trunk':
        return new SipTrunkProvider(config);
      
      case 'twilio':
        // TODO: Implement TwilioProvider
        throw new Error('Twilio provider not yet implemented');
      
      case 'bandwidth':
        // TODO: Implement BandwidthProvider
        throw new Error('Bandwidth provider not yet implemented');
      
      case 'custom':
        // TODO: Allow custom provider implementations
        throw new Error('Custom provider not yet implemented');
      
      default:
        throw new Error(`Unknown provider type: ${config.type}`);
    }
  }
  
  /**
   * Create and initialize a provider
   */
  static async createAndInitialize(config: TelephonyProviderConfig): Promise {
    const provider = this.createProvider(config);
    await provider.initialize(config);
    return provider;
  }
}

/**
 * Provider Registry Implementation
 * 
 * Manages multiple telephony providers and handles provider selection/failover.
 */
export class TelephonyProviderRegistry implements ITelephonyProviderRegistry {
  private providers: Map = new Map();
  private primaryProviderId: string | null = null;
  
  constructor() {
    console.log('[TelephonyProviderRegistry] Initialized');
  }
  
  registerProvider(provider: ITelephonyProvider): void {
    console.log(`[TelephonyProviderRegistry] Registering provider: ${provider.providerId} (${provider.providerType})`);
    this.providers.set(provider.providerId, provider);
    
    // Set as primary if first provider or has highest priority
    if (!this.primaryProviderId || provider.config.priority  a.config.priority - b.config.priority);
    
    // Return the highest priority provider
    return eligibleProviders[0];
  }
  
  removeProvider(providerId: string): boolean {
    const removed = this.providers.delete(providerId);
    
    if (removed && this.primaryProviderId === providerId) {
      // Find new primary
      let newPrimary: ITelephonyProvider | undefined;
      for (const provider of this.providers.values()) {
        if (!newPrimary || provider.config.priority  {
    const eligibleProviders = this.getEligibleProviders(destination, options);
    eligibleProviders.sort((a, b) => a.config.priority - b.config.priority);
    
    for (const provider of eligibleProviders) {
      try {
        const health = await provider.checkHealth();
        if (health.healthy) {
          return provider;
        }
        console.warn(`[TelephonyProviderRegistry] Provider ${provider.providerId} unhealthy, trying next`);
      } catch (error) {
        console.error(`[TelephonyProviderRegistry] Health check failed for ${provider.providerId}:`, error);
      }
    }
    
    return undefined;
  }
  
  /**
   * Shutdown all providers
   */
  async shutdownAll(): Promise {
    console.log('[TelephonyProviderRegistry] Shutting down all providers');
    
    const shutdownPromises = Array.from(this.providers.values()).map(async (provider) => {
      try {
        await provider.shutdown();
      } catch (error) {
        console.error(`[TelephonyProviderRegistry] Error shutting down ${provider.providerId}:`, error);
      }
    });
    
    await Promise.all(shutdownPromises);
    this.providers.clear();
    this.primaryProviderId = null;
  }
  
  // Private helper methods
  
  private getEligibleProviders(destination: string, options?: ProviderSelectionOptions): ITelephonyProvider[] {
    const eligible: ITelephonyProvider[] = [];
    
    for (const provider of this.providers.values()) {
      if (!provider.isReady()) continue;
      if (!provider.config.enabled) continue;
      if (options?.excludeProviderIds?.includes(provider.providerId)) continue;
      if (!this.isProviderAllowed(provider, destination, options)) continue;
      if (!this.hasRequiredCapabilities(provider, options?.requireCapabilities)) continue;
      if (options?.maxCostPerMinute && provider.config.costPerMinute && 
          provider.config.costPerMinute > options.maxCostPerMinute) continue;
      
      eligible.push(provider);
    }
    
    return eligible;
  }
  
  private isProviderAllowed(provider: ITelephonyProvider, destination: string, options?: ProviderSelectionOptions): boolean {
    const config = provider.config;
    
    // Check blocked destinations
    if (config.blockedDestinations?.length) {
      for (const blocked of config.blockedDestinations) {
        if (this.matchesPattern(destination, blocked)) {
          return false;
        }
      }
    }
    
    // Check allowed destinations (if specified, destination must match)
    if (config.allowedDestinations?.length) {
      let allowed = false;
      for (const pattern of config.allowedDestinations) {
        if (this.matchesPattern(destination, pattern)) {
          allowed = true;
          break;
        }
      }
      if (!allowed) return false;
    }
    
    return true;
  }
  
  private matchesPattern(destination: string, pattern: string): boolean {
    // Simple pattern matching (e.g., "+1*" matches all US numbers)
    if (pattern.endsWith('*')) {
      const prefix = pattern.slice(0, -1);
      return destination.startsWith(prefix);
    }
    return destination === pattern;
  }
  
  private hasRequiredCapabilities(provider: ITelephonyProvider, required?: (keyof ProviderCapabilities)[]): boolean {
    if (!required || required.length === 0) return true;
    
    const capabilities = provider.getCapabilities();
    
    for (const cap of required) {
      if (!capabilities[cap]) return false;
    }
    
    return true;
  }
}

// Singleton instance
let registryInstance: TelephonyProviderRegistry | null = null;

/**
 * Get the global provider registry instance
 */
export function getTelephonyProviderRegistry(): TelephonyProviderRegistry {
  if (!registryInstance) {
    registryInstance = new TelephonyProviderRegistry();
  }
  return registryInstance;
}

/**
 * Initialize providers from database configuration
 */
export async function initializeTelephonyProviders(configs: TelephonyProviderConfig[]): Promise {
  const registry = getTelephonyProviderRegistry();
  
  for (const config of configs) {
    if (!config.enabled) {
      console.log(`[TelephonyProviderRegistry] Skipping disabled provider: ${config.id}`);
      continue;
    }
    
    try {
      const provider = await TelephonyProviderFactory.createAndInitialize(config);
      registry.registerProvider(provider);
    } catch (error) {
      console.error(`[TelephonyProviderRegistry] Failed to initialize provider ${config.id}:`, error);
    }
  }
  
  return registry;
}