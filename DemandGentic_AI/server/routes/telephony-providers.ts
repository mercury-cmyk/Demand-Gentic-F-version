/**
 * Telephony Providers Admin Routes
 * 
 * Admin-only endpoints for managing telephony providers.
 * ISOLATED: These routes manage the new provider abstraction layer,
 * separate from the existing Telnyx production workflow.
 */

import { Router } from 'express';
import { db } from '../db';
import { telephonyProviders, telephonyProviderHealthHistory, users } from '../../shared/schema';
import { eq, desc, sql } from 'drizzle-orm';
import { requireAuth, requireSuperAdmin } from '../middleware/auth';
import {
  getTelephonyProviderRegistry,
  TelephonyProviderFactory,
  type TelephonyProviderConfig,
} from '../services/telephony-providers';
import { invalidateTelephonyProviderCache } from '../services/telephony-provider-routing';

const router = Router();

// All routes require authentication + super admin
router.use(requireAuth);
router.use(requireSuperAdmin);

/**
 * GET /api/admin/telephony-providers
 * List all telephony providers
 */
router.get('/', async (req, res) => {
  try {
    const providers = await db.select({
      id: telephonyProviders.id,
      name: telephonyProviders.name,
      type: telephonyProviders.type,
      enabled: telephonyProviders.enabled,
      priority: telephonyProviders.priority,
      sipDomain: telephonyProviders.sipDomain,
      connectionId: telephonyProviders.connectionId,
      maxCps: telephonyProviders.maxCps,
      maxConcurrent: telephonyProviders.maxConcurrent,
      costPerMinute: telephonyProviders.costPerMinute,
      costPerCall: telephonyProviders.costPerCall,
      currency: telephonyProviders.currency,
      healthCheckInterval: telephonyProviders.healthCheckInterval,
      failoverProviderId: telephonyProviders.failoverProviderId,
      createdAt: telephonyProviders.createdAt,
      updatedAt: telephonyProviders.updatedAt,
    })
    .from(telephonyProviders)
    .orderBy(telephonyProviders.priority);

    res.json({
      success: true,
      providers,
      warning: 'This is an ISOLATED system. Enable providers only after thorough testing.',
    });
  } catch (error) {
    console.error('[TelephonyProviders] Error listing providers:', error);
    res.status(500).json({ error: 'Failed to list providers' });
  }
});

/**
 * GET /api/admin/telephony-providers/:id
 * Get provider details
 */
router.get('/:id', async (req, res) => {
  try {
    const [provider] = await db.select()
      .from(telephonyProviders)
      .where(eq(telephonyProviders.id, req.params.id));

    if (!provider) {
      return res.status(404).json({ error: 'Provider not found' });
    }

    // Mask sensitive fields
    const sanitized = {
      ...provider,
      apiKey: provider.apiKey ? '***CONFIGURED***' : null,
      apiSecret: provider.apiSecret ? '***CONFIGURED***' : null,
      sipPassword: provider.sipPassword ? '***CONFIGURED***' : null,
    };

    res.json({ success: true, provider: sanitized });
  } catch (error) {
    console.error('[TelephonyProviders] Error getting provider:', error);
    res.status(500).json({ error: 'Failed to get provider' });
  }
});

/**
 * POST /api/admin/telephony-providers
 * Create a new telephony provider
 */
router.post('/', async (req, res) => {
  try {
    const {
      name,
      type,
      enabled = false, // Default to disabled for safety
      priority = 100,
      apiKey,
      apiSecret,
      sipDomain,
      sipUsername,
      sipPassword,
      sipProxy,
      sipPort,
      sipTransport,
      connectionId,
      outboundProfileId,
      outboundNumbers,
      allowedDestinations,
      blockedDestinations,
      maxCps,
      maxConcurrent,
      failoverProviderId,
      healthCheckInterval,
      costPerMinute,
      costPerCall,
      currency,
      providerMetadata,
    } = req.body;

    if (!name || !type) {
      return res.status(400).json({ error: 'Name and type are required' });
    }

    const validTypes = ['telnyx', 'sip_trunk', 'twilio', 'bandwidth', 'custom'];
    if (!validTypes.includes(type)) {
      return res.status(400).json({ error: `Invalid type. Must be one of: ${validTypes.join(', ')}` });
    }

    const [newProvider] = await db.insert(telephonyProviders).values({
      name,
      type,
      enabled,
      priority,
      apiKey,
      apiSecret,
      sipDomain,
      sipUsername,
      sipPassword,
      sipProxy,
      sipPort,
      sipTransport,
      connectionId,
      outboundProfileId,
      outboundNumbers,
      allowedDestinations,
      blockedDestinations,
      maxCps,
      maxConcurrent,
      failoverProviderId,
      healthCheckInterval,
      costPerMinute,
      costPerCall,
      currency,
      providerMetadata,
      createdById: (req as any).user?.id,
    }).returning();

    invalidateTelephonyProviderCache();

    res.status(201).json({
      success: true,
      provider: {
        ...newProvider,
        apiKey: newProvider.apiKey ? '***CONFIGURED***' : null,
        apiSecret: newProvider.apiSecret ? '***CONFIGURED***' : null,
        sipPassword: newProvider.sipPassword ? '***CONFIGURED***' : null,
      },
      warning: 'Provider created. Enable only after testing.',
    });
  } catch (error) {
    console.error('[TelephonyProviders] Error creating provider:', error);
    res.status(500).json({ error: 'Failed to create provider' });
  }
});

/**
 * PATCH /api/admin/telephony-providers/:id
 * Update a telephony provider
 */
router.patch('/:id', async (req, res) => {
  try {
    const [existing] = await db.select()
      .from(telephonyProviders)
      .where(eq(telephonyProviders.id, req.params.id));

    if (!existing) {
      return res.status(404).json({ error: 'Provider not found' });
    }

    // If enabling a provider, require confirmation
    if (req.body.enabled === true && !existing.enabled) {
      if (req.body.confirmEnable !== true) {
        return res.status(400).json({
          error: 'Confirmation required',
          message: 'Enabling a provider may affect call routing. Set confirmEnable: true to proceed.',
        });
      }
    }

    const updateData: Record = {
      updatedAt: new Date(),
    };

    // Only update provided fields
    const allowedFields = [
      'name', 'enabled', 'priority', 'apiKey', 'apiSecret',
      'sipDomain', 'sipUsername', 'sipPassword', 'sipProxy', 'sipPort', 'sipTransport',
      'connectionId', 'outboundProfileId',
      'outboundNumbers', 'allowedDestinations', 'blockedDestinations',
      'maxCps', 'maxConcurrent', 'failoverProviderId', 'healthCheckInterval',
      'costPerMinute', 'costPerCall', 'currency', 'providerMetadata',
    ];

    for (const field of allowedFields) {
      if (req.body[field] !== undefined) {
        updateData[field] = req.body[field];
      }
    }

    const [updated] = await db.update(telephonyProviders)
      .set(updateData)
      .where(eq(telephonyProviders.id, req.params.id))
      .returning();

    invalidateTelephonyProviderCache();

    // If provider was enabled/disabled, log it
    if (req.body.enabled !== undefined && req.body.enabled !== existing.enabled) {
      console.log(`[TelephonyProviders] Provider ${updated.id} ${updated.enabled ? 'ENABLED' : 'DISABLED'} by user ${(req as any).user?.id}`);
    }

    res.json({
      success: true,
      provider: {
        ...updated,
        apiKey: updated.apiKey ? '***CONFIGURED***' : null,
        apiSecret: updated.apiSecret ? '***CONFIGURED***' : null,
        sipPassword: updated.sipPassword ? '***CONFIGURED***' : null,
      },
    });
  } catch (error) {
    console.error('[TelephonyProviders] Error updating provider:', error);
    res.status(500).json({ error: 'Failed to update provider' });
  }
});

/**
 * DELETE /api/admin/telephony-providers/:id
 * Delete a telephony provider
 */
router.delete('/:id', async (req, res) => {
  try {
    const [existing] = await db.select()
      .from(telephonyProviders)
      .where(eq(telephonyProviders.id, req.params.id));

    if (!existing) {
      return res.status(404).json({ error: 'Provider not found' });
    }

    // Prevent deleting enabled providers
    if (existing.enabled) {
      return res.status(400).json({
        error: 'Cannot delete enabled provider',
        message: 'Disable the provider first before deleting.',
      });
    }

    await db.delete(telephonyProviders)
      .where(eq(telephonyProviders.id, req.params.id));

    invalidateTelephonyProviderCache();

    console.log(`[TelephonyProviders] Provider ${req.params.id} deleted by user ${(req as any).user?.id}`);

    res.json({ success: true, message: 'Provider deleted' });
  } catch (error) {
    console.error('[TelephonyProviders] Error deleting provider:', error);
    res.status(500).json({ error: 'Failed to delete provider' });
  }
});

/**
 * POST /api/admin/telephony-providers/:id/health-check
 * Run a health check on a provider
 */
router.post('/:id/health-check', async (req, res) => {
  try {
    const [provider] = await db.select()
      .from(telephonyProviders)
      .where(eq(telephonyProviders.id, req.params.id));

    if (!provider) {
      return res.status(404).json({ error: 'Provider not found' });
    }

    // Create provider instance and run health check
    const config: TelephonyProviderConfig = {
      id: provider.id,
      name: provider.name,
      type: provider.type as TelephonyProviderConfig['type'],
      enabled: provider.enabled,
      priority: provider.priority,
      apiKey: provider.apiKey || undefined,
      sipDomain: provider.sipDomain || undefined,
      sipUsername: provider.sipUsername || undefined,
      sipPassword: provider.sipPassword || undefined,
      maxCps: provider.maxCps || undefined,
      maxConcurrent: provider.maxConcurrent || undefined,
    };

    try {
      const providerInstance = TelephonyProviderFactory.createProvider(config);
      await providerInstance.initialize(config);
      const health = await providerInstance.checkHealth();
      await providerInstance.shutdown();

      // Record health check
      await db.insert(telephonyProviderHealthHistory).values({
        providerId: provider.id,
        healthy: health.healthy,
        latencyMs: health.latencyMs,
        errorCount: health.errorCount || 0,
        lastError: health.lastError,
        activeCallCount: health.activeCallCount || 0,
      });

      res.json({
        success: true,
        health,
      });
    } catch (providerError) {
      // Record failed health check
      await db.insert(telephonyProviderHealthHistory).values({
        providerId: provider.id,
        healthy: false,
        errorCount: 1,
        lastError: providerError instanceof Error ? providerError.message : 'Health check failed',
      });

      res.json({
        success: true,
        health: {
          healthy: false,
          lastCheck: new Date(),
          lastError: providerError instanceof Error ? providerError.message : 'Health check failed',
        },
      });
    }
  } catch (error) {
    console.error('[TelephonyProviders] Error running health check:', error);
    res.status(500).json({ error: 'Failed to run health check' });
  }
});

/**
 * GET /api/admin/telephony-providers/:id/health-history
 * Get health check history for a provider
 */
router.get('/:id/health-history', async (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit as string) || 50, 100);

    const history = await db.select()
      .from(telephonyProviderHealthHistory)
      .where(eq(telephonyProviderHealthHistory.providerId, req.params.id))
      .orderBy(desc(telephonyProviderHealthHistory.checkedAt))
      .limit(limit);

    res.json({ success: true, history });
  } catch (error) {
    console.error('[TelephonyProviders] Error getting health history:', error);
    res.status(500).json({ error: 'Failed to get health history' });
  }
});

/**
 * GET /api/admin/telephony-providers/registry/status
 * Get the current state of the provider registry
 */
router.get('/registry/status', async (_req, res) => {
  try {
    const registry = getTelephonyProviderRegistry();
    const providers = registry.getAllProviders();

    const status = {
      registeredProviders: providers.length,
      providers: providers.map(p => ({
        id: p.providerId,
        type: p.providerType,
        ready: p.isReady(),
        capabilities: p.getCapabilities(),
        priority: p.config.priority,
      })),
      primaryProviderId: registry.getPrimaryProvider()?.providerId || null,
    };

    res.json({ success: true, status });
  } catch (error) {
    console.error('[TelephonyProviders] Error getting registry status:', error);
    res.status(500).json({ error: 'Failed to get registry status' });
  }
});

export default router;