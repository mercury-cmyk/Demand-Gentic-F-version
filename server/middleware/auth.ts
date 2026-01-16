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
