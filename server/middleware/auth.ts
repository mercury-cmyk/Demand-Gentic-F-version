/**
 * Auth Middleware
 * Re-exports the canonical auth middleware from server/auth.ts.
 * 
 * SECURITY FIX: Previously this file contained a no-op that allowed all 
 * requests without authentication. Now properly delegates to JWT verification.
 */

import { Request, Response, NextFunction } from "express";
import { requireAuth as canonicalRequireAuth, verifyToken, type JWTPayload } from "../auth";

export const isAuthenticated = canonicalRequireAuth;
export const requireAuth = canonicalRequireAuth;

/**
 * Require Super Admin role
 * Checks if the authenticated user has super_admin role.
 * Must be used AFTER requireAuth middleware so req.user is set.
 */
export const requireSuperAdmin = (req: Request, res: Response, next: NextFunction) => {
  if (!req.user) {
    return res.status(401).json({ error: 'Authentication required' });
  }
  
  // Check for super_admin or admin role in user roles array
  const roles = req.user.roles || [req.user.role];
  const isSuperAdmin = roles.includes('super_admin') || roles.includes('admin');
  
  if (!isSuperAdmin) {
    return res.status(403).json({ 
      error: 'Super admin access required',
      message: 'This endpoint requires super_admin privileges'
    });
  }
  
  next();
};
