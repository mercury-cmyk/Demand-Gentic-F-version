/**
 * IAM Client Access Control Routes
 *
 * Admin-only endpoints for managing per-client feature permissions,
 * campaign access grants, preset application, and audit trail.
 */

import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { requireAuth, requireRole } from '../auth';
import * as clientAccessService from '../services/client-access-control-service';

const router = Router();

// All routes require admin auth
router.use(requireAuth);
router.use(requireRole('admin'));

// ==================== Schemas ====================

const grantFeatureSchema = z.object({
  feature: z.string().min(1),
  scopeType: z.enum(['all', 'campaign', 'project', 'date_range']).optional(),
  scopeValue: z.object({
    campaignIds: z.array(z.string()).optional(),
    projectIds: z.array(z.string()).optional(),
    dateRange: z.object({ from: z.string(), to: z.string() }).optional(),
  }).optional(),
  config: z.record(z.any()).optional(),
  expiresAt: z.string().datetime().optional(),
  notes: z.string().max(500).optional(),
});

const bulkGrantSchema = z.object({
  features: z.array(z.string().min(1)).min(1),
  notes: z.string().max(500).optional(),
});

const applyPresetSchema = z.object({
  preset: z.string().min(1),
  notes: z.string().max(500).optional(),
});

const revokeSchema = z.object({
  reason: z.string().max(500).optional(),
});

const modifyGrantSchema = z.object({
  scopeType: z.enum(['all', 'campaign', 'project', 'date_range']).optional(),
  scopeValue: z.object({
    campaignIds: z.array(z.string()).optional(),
    projectIds: z.array(z.string()).optional(),
    dateRange: z.object({ from: z.string(), to: z.string() }).optional(),
  }).optional(),
  config: z.record(z.any()).optional(),
  expiresAt: z.string().datetime().nullable().optional(),
  notes: z.string().max(500).optional(),
});

// ==================== Client List ====================

/** GET /api/iam/client-access/clients — list clients with grant counts */
router.get('/clients', async (req: Request, res: Response) => {
  try {
    const limit = Math.min(Number(req.query.limit) || 50, 100);
    const offset = Number(req.query.offset) || 0;
    const search = typeof req.query.search === 'string' ? req.query.search : undefined;
    const result = await clientAccessService.listClientsWithAccessSummary({ limit, offset, search });
    res.json(result);
  } catch (error) {
    console.error('[IAM Client Access] Error listing clients:', error);
    res.status(500).json({ error: 'Failed to list clients' });
  }
});

// ==================== Client Permissions ====================

/** GET /api/iam/client-access/:clientAccountId/permissions — all grants for a client */
router.get('/:clientAccountId/permissions', async (req: Request, res: Response) => {
  try {
    const grants = await clientAccessService.getClientPermissions(req.params.clientAccountId);
    res.json(grants);
  } catch (error) {
    console.error('[IAM Client Access] Error getting permissions:', error);
    res.status(500).json({ error: 'Failed to get client permissions' });
  }
});

/** GET /api/iam/client-access/:clientAccountId/summary — access summary */
router.get('/:clientAccountId/summary', async (req: Request, res: Response) => {
  try {
    const summary = await clientAccessService.getClientAccessSummary(req.params.clientAccountId);
    res.json(summary);
  } catch (error) {
    console.error('[IAM Client Access] Error getting summary:', error);
    res.status(500).json({ error: 'Failed to get client access summary' });
  }
});

/** POST /api/iam/client-access/:clientAccountId/grant — grant single feature */
router.post('/:clientAccountId/grant', async (req: Request, res: Response) => {
  try {
    const data = grantFeatureSchema.parse(req.body);
    const grantedBy = req.user!.userId;
    const grantId = await clientAccessService.grantFeature({
      clientAccountId: req.params.clientAccountId,
      feature: data.feature as clientAccessService.ClientFeatureFlag,
      scopeType: data.scopeType as clientAccessService.ClientPermissionScope,
      scopeValue: data.scopeValue,
      config: data.config,
      expiresAt: data.expiresAt ? new Date(data.expiresAt) : undefined,
      notes: data.notes,
      grantedBy,
    });
    res.status(201).json({ id: grantId });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Validation error', details: error.errors });
    }
    console.error('[IAM Client Access] Error granting feature:', error);
    res.status(500).json({ error: 'Failed to grant feature' });
  }
});

/** POST /api/iam/client-access/:clientAccountId/bulk-grant — grant multiple features */
router.post('/:clientAccountId/bulk-grant', async (req: Request, res: Response) => {
  try {
    const data = bulkGrantSchema.parse(req.body);
    const grantedBy = req.user!.userId;
    const grantIds = await clientAccessService.bulkGrantFeatures(
      req.params.clientAccountId,
      data.features as clientAccessService.ClientFeatureFlag[],
      grantedBy,
      data.notes,
    );
    res.status(201).json({ ids: grantIds, count: grantIds.length });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Validation error', details: error.errors });
    }
    console.error('[IAM Client Access] Error bulk granting features:', error);
    res.status(500).json({ error: 'Failed to bulk grant features' });
  }
});

/** POST /api/iam/client-access/:clientAccountId/apply-preset — apply a named preset */
router.post('/:clientAccountId/apply-preset', async (req: Request, res: Response) => {
  try {
    const data = applyPresetSchema.parse(req.body);
    const preset = clientAccessService.PRESETS[data.preset];
    if (!preset) {
      return res.status(400).json({ error: `Unknown preset: ${data.preset}` });
    }
    const grantedBy = req.user!.userId;

    // Revoke all first, then grant the preset features
    await clientAccessService.bulkRevokeFeatures(req.params.clientAccountId, grantedBy, `Resetting for preset: ${data.preset}`);
    const grantIds = await clientAccessService.bulkGrantFeatures(
      req.params.clientAccountId,
      preset.features,
      grantedBy,
      data.notes || `Applied preset: ${preset.label}`,
    );
    res.json({ preset: data.preset, granted: grantIds.length });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Validation error', details: error.errors });
    }
    console.error('[IAM Client Access] Error applying preset:', error);
    res.status(500).json({ error: 'Failed to apply preset' });
  }
});

/** POST /api/iam/client-access/:clientAccountId/bulk-revoke — revoke all features */
router.post('/:clientAccountId/bulk-revoke', async (req: Request, res: Response) => {
  try {
    const data = revokeSchema.parse(req.body);
    const revokedBy = req.user!.userId;
    const count = await clientAccessService.bulkRevokeFeatures(
      req.params.clientAccountId,
      revokedBy,
      data.reason,
    );
    res.json({ revoked: count });
  } catch (error) {
    console.error('[IAM Client Access] Error bulk revoking features:', error);
    res.status(500).json({ error: 'Failed to bulk revoke features' });
  }
});

// ==================== Individual Grant Operations ====================

/** DELETE /api/iam/client-access/grants/:grantId — revoke a single grant */
router.delete('/grants/:grantId', async (req: Request, res: Response) => {
  try {
    const revokedBy = req.user!.userId;
    const reason = typeof req.query.reason === 'string' ? req.query.reason : undefined;
    await clientAccessService.revokeFeature({ grantId: req.params.grantId, revokedBy, reason });
    res.json({ success: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    if (message === 'Grant not found') {
      return res.status(404).json({ error: 'Grant not found' });
    }
    console.error('[IAM Client Access] Error revoking grant:', error);
    res.status(500).json({ error: 'Failed to revoke grant' });
  }
});

/** PATCH /api/iam/client-access/grants/:grantId — modify scope/config of a grant */
router.patch('/grants/:grantId', async (req: Request, res: Response) => {
  try {
    const data = modifyGrantSchema.parse(req.body);
    const modifiedBy = req.user!.userId;
    const updatedId = await clientAccessService.modifyGrant(
      req.params.grantId,
      {
        scopeType: data.scopeType as clientAccessService.ClientPermissionScope,
        scopeValue: data.scopeValue,
        config: data.config,
        expiresAt: data.expiresAt === null ? null : data.expiresAt ? new Date(data.expiresAt) : undefined,
        notes: data.notes,
      },
      modifiedBy,
    );
    res.json({ id: updatedId });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Validation error', details: error.errors });
    }
    const message = error instanceof Error ? error.message : 'Unknown error';
    if (message === 'Grant not found') {
      return res.status(404).json({ error: 'Grant not found' });
    }
    console.error('[IAM Client Access] Error modifying grant:', error);
    res.status(500).json({ error: 'Failed to modify grant' });
  }
});

// ==================== Campaign Access ====================

/** GET /api/iam/client-access/meta/campaigns — all campaigns for selector */
router.get('/meta/campaigns', async (_req: Request, res: Response) => {
  try {
    const campaigns = await clientAccessService.getAllCampaignsForSelector();
    res.json(campaigns);
  } catch (error) {
    console.error('[IAM Client Access] Error getting campaigns list:', error);
    res.status(500).json({ error: 'Failed to get campaigns list' });
  }
});

/** GET /api/iam/client-access/:clientAccountId/campaigns — campaign access list */
router.get('/:clientAccountId/campaigns', async (req: Request, res: Response) => {
  try {
    const grants = await clientAccessService.getClientCampaignAccess(req.params.clientAccountId);
    res.json(grants);
  } catch (error) {
    console.error('[IAM Client Access] Error getting campaign access:', error);
    res.status(500).json({ error: 'Failed to get campaign access' });
  }
});

const grantCampaignSchema = z.object({
  campaignId: z.string().min(1),
  campaignType: z.enum(['regular', 'verification']),
});

/** POST /api/iam/client-access/:clientAccountId/campaigns/grant — grant campaign access */
router.post('/:clientAccountId/campaigns/grant', async (req: Request, res: Response) => {
  try {
    const parsed = grantCampaignSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'Invalid input', details: parsed.error.flatten() });
    }
    const { campaignId, campaignType } = parsed.data;
    const userId = (req as any).user?.userId || 'system';
    const grant = await clientAccessService.grantCampaignAccess(
      req.params.clientAccountId,
      campaignId,
      campaignType,
      userId
    );
    res.json(grant);
  } catch (error: any) {
    if (error.message === 'Campaign access already granted') {
      return res.status(409).json({ error: error.message });
    }
    console.error('[IAM Client Access] Error granting campaign access:', error);
    res.status(500).json({ error: 'Failed to grant campaign access' });
  }
});

/** DELETE /api/iam/client-access/:clientAccountId/campaigns/:campaignId — revoke campaign access */
router.delete('/:clientAccountId/campaigns/:campaignId', async (req: Request, res: Response) => {
  try {
    await clientAccessService.revokeCampaignAccess(
      req.params.clientAccountId,
      req.params.campaignId
    );
    res.json({ success: true });
  } catch (error: any) {
    if (error.message === 'Campaign access grant not found') {
      return res.status(404).json({ error: error.message });
    }
    console.error('[IAM Client Access] Error revoking campaign access:', error);
    res.status(500).json({ error: 'Failed to revoke campaign access' });
  }
});

// ==================== Audit ====================

/** GET /api/iam/client-access/:clientAccountId/audit — paginated audit log */
router.get('/:clientAccountId/audit', async (req: Request, res: Response) => {
  try {
    const limit = Math.min(Number(req.query.limit) || 50, 100);
    const offset = Number(req.query.offset) || 0;
    const feature = typeof req.query.feature === 'string' ? req.query.feature : undefined;
    const action = typeof req.query.action === 'string' ? req.query.action : undefined;
    const result = await clientAccessService.getAuditLog(req.params.clientAccountId, { limit, offset, feature, action });
    res.json(result);
  } catch (error) {
    console.error('[IAM Client Access] Error getting audit log:', error);
    res.status(500).json({ error: 'Failed to get audit log' });
  }
});

// ==================== Reference Data ====================

/** GET /api/iam/client-access/meta/categories — feature categories for the UI */
router.get('/meta/categories', (_req: Request, res: Response) => {
  res.json(clientAccessService.FEATURE_CATEGORIES);
});

/** GET /api/iam/client-access/meta/presets — available presets */
router.get('/meta/presets', (_req: Request, res: Response) => {
  res.json(clientAccessService.PRESETS);
});

/** GET /api/iam/client-access/meta/features — flat list of all features */
router.get('/meta/features', (_req: Request, res: Response) => {
  res.json(clientAccessService.ALL_FEATURES);
});

/** PUT /api/iam/client-access/meta/presets/:key — update a preset's features/label/description */
const updatePresetSchema = z.object({
  label: z.string().min(1).max(100).optional(),
  description: z.string().min(1).max(500).optional(),
  features: z.array(z.string().min(1)).optional(),
});

router.put('/meta/presets/:key', async (req: Request, res: Response) => {
  try {
    const key = req.params.key;
    if (!clientAccessService.PRESETS[key]) {
      return res.status(404).json({ error: `Preset not found: ${key}` });
    }
    if (key === 'full_access') {
      return res.status(400).json({ error: 'Cannot edit Full Access preset' });
    }
    const data = updatePresetSchema.parse(req.body);
    const success = clientAccessService.updatePreset(key, {
      label: data.label,
      description: data.description,
      features: data.features as clientAccessService.ClientFeatureFlag[] | undefined,
    });
    if (!success) {
      return res.status(400).json({ error: 'Failed to update preset' });
    }
    res.json(clientAccessService.PRESETS[key]);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Validation error', details: error.errors });
    }
    console.error('[IAM Client Access] Error updating preset:', error);
    res.status(500).json({ error: 'Failed to update preset' });
  }
});

export default router;