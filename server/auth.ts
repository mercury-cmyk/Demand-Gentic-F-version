import jwt from "jsonwebtoken";
import bcrypt from "bcryptjs";
import type { Request, Response, NextFunction } from "express";
import { users } from "@shared/schema";

type User = typeof users.$inferSelect;

const JWT_SECRET = process.env.JWT_SECRET || "development-secret-key-change-in-production";
const JWT_EXPIRES_IN = "7d";

export interface JWTPayload {
  userId: string;
  username: string;
  email: string;
  role: string; // Legacy - for backward compatibility
  roles: string[]; // New multi-role support
}

// Extend Express Request to include user
declare global {
  namespace Express {
    interface Request {
      user?: JWTPayload;
    }
  }
}

export function generateToken(user: User, roles: string[] = [], expiresIn?: string): string {
  const payload: JWTPayload = {
    userId: user.id,
    username: user.username,
    email: user.email,
    role: user.role, // Legacy - primary role for backward compatibility
    roles: roles.length > 0 ? roles : [user.role], // Use provided roles or fallback to legacy role
  };
  
  const tokenExpiresIn = expiresIn ?? JWT_EXPIRES_IN;
  return jwt.sign(payload, JWT_SECRET, { expiresIn: tokenExpiresIn });
}

export function verifyToken(token: string): JWTPayload | null {
  try {
    return jwt.verify(token, JWT_SECRET) as JWTPayload;
  } catch (error) {
    if (error instanceof jwt.TokenExpiredError) {
      console.error('[AUTH] Token expired:', error.message);
    } else if (error instanceof jwt.JsonWebTokenError) {
      console.error('[AUTH] Invalid token (possibly signed with different secret):', error.message);
    } else {
      console.error('[AUTH] Token verification failed:', error);
    }
    return null;
  }
}

export async function hashPassword(password: string): Promise<string> {
  return await bcrypt.hash(password, 10);
}

export async function comparePassword(password: string, hash: string): Promise<boolean> {
  return await bcrypt.compare(password, hash);
}

// Auth middleware
export function requireAuth(req: Request, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;
  
  console.log('[AUTH] requireAuth called for:', req.method, req.path);
  console.log('[AUTH] Authorization header present:', !!authHeader);
  
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    console.log('[AUTH] Missing or invalid Authorization header format');
    return res.status(401).json({ message: "Authentication required" });
  }

  const token = authHeader.substring(7); // Remove 'Bearer ' prefix
  const payload = verifyToken(token);

  if (!payload) {
    console.log('[AUTH] Token verification failed');
    return res.status(401).json({ message: "Invalid or expired token" });
  }
  
  console.log('[AUTH] Authentication successful for user:', payload.userId);

  req.user = payload;
  next();
}

// Role-based access middleware (supports multi-role users)
export function requireRole(...allowedRoles: string[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.user) {
      return res.status(401).json({ message: "Authentication required" });
    }

    // Check if user has any of the allowed roles
    const userRoles = req.user.roles || [req.user.role]; // Support both new and legacy format
    
    // Admins have access to everything
    const hasPermission = userRoles.includes('admin') || userRoles.some(role => allowedRoles.includes(role));

    if (!hasPermission) {
      return res.status(403).json({ message: "Insufficient permissions" });
    }

    next();
  };
}

// Dual Auth Middleware (Supports both Internal Users and Client Portal Users)
export function requireDualAuth(req: Request, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ message: "Authentication required" });
  }

  const token = authHeader.substring(7);
  
  // Use existing verification (assumes shared secret or compatible signing)
  const payload = verifyToken(token) as any;

  if (!payload) {
    return res.status(401).json({ message: "Invalid or expired token" });
  }

  // Normalize user object
  // Client tokens might use different field names (e.g. sub vs userId)
  const isClient = payload.isClient || !!payload.clientAccountId || !!payload.tenantId;
  req.user = {
    ...payload,
    userId: payload.userId || payload.sub || payload.id || payload.clientUserId,
    role: payload.role || (isClient ? 'client' : 'user'),
    roles: payload.roles || (isClient ? ['client'] : [payload.role || 'user']),
    tenantId: payload.tenantId || payload.clientAccountId
  };

  next();
}
