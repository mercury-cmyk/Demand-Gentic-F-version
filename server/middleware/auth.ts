/**
 * Auth Middleware
 * Simple authentication middleware for protected routes
 */

import { Request, Response, NextFunction } from "express";

export const isAuthenticated = (req: Request, res: Response, next: NextFunction) => {
  // For now, allow all requests (development mode)
  // In production, check req.user or authorization headers
  next();
};

export const requireAuth = isAuthenticated;

/**
 * Require Super Admin role
 * Checks if the authenticated user has super_admin role
 */
export const requireSuperAdmin = (req: Request, res: Response, next: NextFunction) => {
  const user = (req as any).user;
  
  if (!user) {
    return res.status(401).json({ error: 'Authentication required' });
  }
  
  // Check for super_admin role in user roles array
  const roles = user.roles || [];
  const isSuperAdmin = roles.includes('super_admin');
  
  if (!isSuperAdmin) {
    return res.status(403).json({ 
      error: 'Super admin access required',
      message: 'This endpoint requires super_admin privileges'
    });
  }
  
  next();
};
