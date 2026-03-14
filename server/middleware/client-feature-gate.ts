/**
 * Client Feature Gate Middleware
 *
 * Creates Express middleware that checks clientPermissionGrants
 * for the specified feature(s). Default-deny: if no active grant
 * exists, access is blocked with 403.
 */

import { Request, Response, NextFunction } from 'express';
import { checkClientFeature, type ClientFeatureFlag } from '../services/client-access-control-service';

/**
 * Returns middleware that blocks the request unless the client
 * has an active grant for the given feature.
 *
 * Usage:
 *   router.use(requireClientFeature('accounts_contacts'));
 *   router.get('/data', requireClientFeature('analytics_dashboard'), handler);
 */
export function requireClientFeature(feature: ClientFeatureFlag) {
  return async (req: Request, res: Response, next: NextFunction) => {
    const clientAccountId = req.clientUser?.clientAccountId;
    if (!clientAccountId) {
      return res.status(401).json({ message: 'Unauthorized' });
    }

    const result = await checkClientFeature(clientAccountId, feature, {
      campaignId: (req.query.campaignId || req.params.campaignId) as string | undefined,
      projectId: (req.query.projectId || req.params.projectId) as string | undefined,
    });

    if (!result.allowed) {
      return res.status(403).json({
        message: result.reason,
        featureRequired: feature,
      });
    }

    next();
  };
}

/**
 * Require ANY of the listed features (OR logic).
 */
export function requireAnyClientFeature(...features: ClientFeatureFlag[]) {
  return async (req: Request, res: Response, next: NextFunction) => {
    const clientAccountId = req.clientUser?.clientAccountId;
    if (!clientAccountId) {
      return res.status(401).json({ message: 'Unauthorized' });
    }

    for (const feature of features) {
      const result = await checkClientFeature(clientAccountId, feature);
      if (result.allowed) return next();
    }

    return res.status(403).json({
      message: `None of the required features are enabled for your account`,
      featuresRequired: features,
    });
  };
}
