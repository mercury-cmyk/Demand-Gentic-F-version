import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { requireAuth } from '../auth';
import { requirePermission, auditLog } from '../middleware/iam-middleware';
import * as secretService from '../services/secret-service';
import { SecretEnvironment } from '@shared/schema';

const router = Router();
router.use(requireAuth);

const ENVIRONMENT_VALUES: SecretEnvironment[] = ['development', 'production'];
const RUNTIME_ENVIRONMENT: SecretEnvironment =
  (process.env.SECRET_MANAGER_RUNTIME_ENV || process.env.NODE_ENV || 'development').toLowerCase() === 'production'
    ? 'production'
    : 'development';
const ALLOWED_ENVIRONMENTS_BY_CONTEXT: SecretEnvironment[] =
  RUNTIME_ENVIRONMENT === 'production' ? [...ENVIRONMENT_VALUES] : ['development'];

class EnvironmentError extends Error {
  public readonly status: 400 | 403;
  constructor(message: string, status: 400 | 403) {
    super(message);
    this.status = status;
  }
}

function resolveEnvironment(value?: string): SecretEnvironment | undefined {
  if (!value) return undefined;
  const normalized = value.trim().toLowerCase() as SecretEnvironment;
  if (!ENVIRONMENT_VALUES.includes(normalized)) {
    throw new EnvironmentError('Invalid secret environment', 400);
  }
  if (!ALLOWED_ENVIRONMENTS_BY_CONTEXT.includes(normalized)) {
    throw new EnvironmentError(
      'Production secrets are not accessible from this deployment',
      403
    );
  }
  return normalized;
}

function getAllowedEnvironments(): SecretEnvironment[] {
  return [...ALLOWED_ENVIRONMENTS_BY_CONTEXT];
}

const listQuerySchema = z.object({
  environment: z.enum(['development', 'production']).optional(),
  service: z.string().optional(),
  usageContext: z.string().optional(),
  isActive: z.enum(['true', 'false']).optional(),
  limit: z
    .preprocess((value) => {
      if (value === undefined) return undefined;
      const parsed = Number(value);
      return Number.isNaN(parsed) ? undefined : parsed;
    }, z.number().int().min(1).max(500).optional())
    .optional(),
  offset: z
    .preprocess((value) => {
      if (value === undefined) return undefined;
      const parsed = Number(value);
      return Number.isNaN(parsed) ? undefined : parsed;
    }, z.number().int().min(0).optional())
    .optional(),
});

const createSecretSchema = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
  environment: z.enum(['development', 'production']),
  service: z.string().min(1),
  usageContext: z.string().min(1),
  metadata: z.record(z.any()).optional(),
  value: z.string().min(1),
  organizationId: z.string().uuid().optional(),
});

const updateSecretSchema = z.object({
  name: z.string().min(1).optional(),
  description: z.string().optional(),
  environment: z.enum(['development', 'production']).optional(),
  service: z.string().optional(),
  usageContext: z.string().optional(),
  metadata: z.record(z.any()).optional(),
});

const rotateSecretSchema = z.object({
  value: z.string().min(1),
});

const deactivateSecretSchema = z.object({
  reason: z.string().optional(),
});

router.get(
  '/',
  requirePermission('secret', 'view'),
  async (req: Request, res: Response) => {
    try {
      const query = listQuerySchema.parse(req.query);
      const environment = resolveEnvironment(query.environment);
      const secrets = await secretService.listSecrets({
        environment: environment,
        service: query.service,
        usageContext: query.usageContext,
        isActive: query.isActive ? query.isActive === 'true' : undefined,
        allowedEnvironments: getAllowedEnvironments(),
        limit: query.limit,
        offset: query.offset,
      });

      res.json({
        secrets,
        allowedEnvironments: getAllowedEnvironments(),
        runtimeEnvironment: RUNTIME_ENVIRONMENT,
      });
    } catch (error: any) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: 'Invalid query parameters', details: error.errors });
      }
      if (error instanceof EnvironmentError) {
        return res.status(error.status).json({ error: error.message });
      }
      console.error('[SECRETS] Failed to list secrets:', error);
      res.status(500).json({ error: 'Failed to list secrets' });
    }
  }
);

router.get(
  '/:id',
  requirePermission('secret', 'view_sensitive'),
  async (req: Request, res: Response) => {
    try {
      const allowedEnvironments = getAllowedEnvironments();
      const secret = await secretService.getSecretById(req.params.id, allowedEnvironments);
      if (!secret) {
        return res.status(404).json({ error: 'Secret not found' });
      }
      res.json(secret);
    } catch (error) {
      console.error('[SECRETS] Failed to fetch secret:', error);
      res.status(500).json({ error: 'Failed to fetch secret' });
    }
  }
);

router.post(
  '/',
  requirePermission('secret', 'create'),
  auditLog('secret', 'secret_create'),
  async (req: Request, res: Response) => {
    try {
      const body = createSecretSchema.parse(req.body);
      const environment = resolveEnvironment(body.environment);
      const userId = (req as any).userId;
      const secretId = await secretService.createSecret(
        {
          ...body,
          environment: environment!,
        },
        userId
      );

      (req as any).body.id = secretId;
      const detail = await secretService.getSecretById(secretId, getAllowedEnvironments());
      res.status(201).json(detail);
    } catch (error: any) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: 'Validation failed', details: error.errors });
      }
      if (error instanceof EnvironmentError) {
        return res.status(error.status).json({ error: error.message });
      }
      console.error('[SECRETS] Failed to create secret:', error);
      res.status(500).json({ error: 'Failed to create secret' });
    }
  }
);

router.put(
  '/:id',
  requirePermission('secret', 'edit'),
  auditLog('secret', 'secret_update'),
  async (req: Request, res: Response) => {
    try {
      const body = updateSecretSchema.parse(req.body);
      const environment = resolveEnvironment(body.environment);
      const secretSummary = await secretService.getSecretById(req.params.id, getAllowedEnvironments());
      if (!secretSummary) {
        return res.status(404).json({ error: 'Secret not found or not accessible' });
      }

      const updated = await secretService.updateSecretMetadata(
        req.params.id,
        {
          ...body,
          environment: environment ?? body.environment,
        },
        (req as any).userId
      );

      res.json(updated);
    } catch (error: any) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: 'Validation failed', details: error.errors });
      }
      if (error instanceof EnvironmentError) {
        return res.status(error.status).json({ error: error.message });
      }
      console.error('[SECRETS] Failed to update secret metadata:', error);
      res.status(500).json({ error: 'Failed to update secret' });
    }
  }
);

router.post(
  '/:id/rotate',
  requirePermission('secret', 'manage_settings'),
  auditLog('secret', 'secret_rotate'),
  async (req: Request, res: Response) => {
    try {
      const body = rotateSecretSchema.parse(req.body);
      const secretSummary = await secretService.getSecretById(req.params.id, getAllowedEnvironments());
      if (!secretSummary) {
        return res.status(404).json({ error: 'Secret not found or not accessible' });
      }

      const rotated = await secretService.rotateSecret(
        req.params.id,
        body.value,
        (req as any).userId
      );

      res.json(rotated);
    } catch (error: any) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: 'Validation failed', details: error.errors });
      }
      console.error('[SECRETS] Failed to rotate secret:', error);
      res.status(500).json({ error: 'Failed to rotate secret' });
    }
  }
);

router.post(
  '/:id/deactivate',
  requirePermission('secret', 'manage_settings'),
  auditLog('secret', 'secret_deactivate'),
  async (req: Request, res: Response) => {
    try {
      deactivateSecretSchema.parse(req.body);
      const secretSummary = await secretService.getSecretById(req.params.id, getAllowedEnvironments());
      if (!secretSummary) {
        return res.status(404).json({ error: 'Secret not found or not accessible' });
      }

      const deactivated = await secretService.deactivateSecret(
        req.params.id,
        (req as any).userId
      );

      res.json(deactivated);
    } catch (error: any) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: 'Validation failed', details: error.errors });
      }
      console.error('[SECRETS] Failed to deactivate secret:', error);
      res.status(500).json({ error: 'Failed to deactivate secret' });
    }
  }
);

export default router;
