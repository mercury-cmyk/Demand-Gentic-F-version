/**
 * Auth Middleware
 * Re-exports the canonical auth middleware from server/auth.ts.
 * 
 * SECURITY FIX: Previously this file contained a no-op that allowed all 
 * requests without authentication. Now properly delegates to JWT verification.
 */

import { Request, Response, NextFunction } from "express";
import { requireAuth as canonicalRequireAuth, verifyToken, type JWTPayload } from "../auth";
import { isSuperOrgOwner } from "../services/super-organization-service";

export const isAuthenticated = canonicalRequireAuth;
export const requireAuth = canonicalRequireAuth;

/**
 * Require Super Admin role
 * Checks if the authenticated user has super_admin role.
 * Must be used AFTER requireAuth middleware so req.user is set.
 */
export const requireSuperAdmin = (req: Request, res: Response, next: NextFunction) => {
  void (async () => {
    if (!req.user) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    const roles = req.user.roles || [req.user.role];
    const hasExplicitSuperAdminRole = roles.includes('super_admin');
    const hasSuperOrgOwnership = req.user.userId
      ? await isSuperOrgOwner(req.user.userId)
      : false;

    if (!hasExplicitSuperAdminRole && !hasSuperOrgOwnership) {
      return res.status(403).json({
        error: 'Super admin access required',
        message: 'This endpoint requires super organization owner privileges',
      });
    }

    next();
  })().catch((error) => {
    console.error('[AUTH] Failed to validate super admin access:', error);
    res.status(500).json({ error: 'Failed to validate super admin access' });
  });
};

/**
 * Require explicit data export authority.
 * Exports are restricted to the super organization authority, not generic admins.
 */
export const requireDataExportAuthority = (req: Request, res: Response, next: NextFunction) => {
  void (async () => {
    if (!req.user) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    const roles = req.user.roles || [req.user.role];
    const hasExplicitSuperAdminRole = roles.includes('super_admin');
    const hasSuperOrgOwnership = req.user.userId
      ? await isSuperOrgOwner(req.user.userId)
      : false;

    if (!hasExplicitSuperAdminRole && !hasSuperOrgOwnership) {
      return res.status(403).json({
        error: 'Forbidden',
        message: 'Only the super organization manager can export data',
      });
    }

    next();
  })().catch((error) => {
    console.error('[AUTH] Failed to validate export authority:', error);
    res.status(500).json({ error: 'Failed to validate export authority' });
  });
};