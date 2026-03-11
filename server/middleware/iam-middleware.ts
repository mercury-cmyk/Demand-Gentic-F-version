/**
 * IAM Middleware - Permission Checking for Routes
 * 
 * Provides Express middleware for enforcing IAM policies
 */

import { Request, Response, NextFunction } from 'express';
import { checkPermission, logAuditEvent, IamEntityType, IamAction, PermissionContext } from '../services/iam-service';

// Extend Express Request to include IAM context
declare global {
  namespace Express {
    interface Request {
      iamContext?: PermissionContext;
      permissionResult?: {
        allowed: boolean;
        reason: string;
        conditions?: Record<string, any>;
      };
    }
  }
}

export type ScopeResolver = (req: Request) => Promise<{
  resourceId?: string;
  resourceOwnerId?: string;
  resourceMetadata?: Record<string, any>;
  organizationId?: string;
}>;

/**
 * Middleware factory for permission checking
 * 
 * @param entityType - The type of entity being accessed
 * @param action - The action being performed
 * @param scopeResolver - Optional function to resolve resource context from request
 */
export function requirePermission(
  entityType: IamEntityType,
  action: IamAction,
  scopeResolver?: ScopeResolver
) {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      // Get user ID from request (assumes requireAuth middleware ran first)
      const userId = req.user?.userId;
      
      if (!userId) {
        return res.status(401).json({ 
          error: 'Authentication required',
          code: 'AUTH_REQUIRED'
        });
      }
      
      // Resolve scope context
      let scopeContext: Awaited<ReturnType<ScopeResolver>> = {};
      if (scopeResolver) {
        try {
          scopeContext = await scopeResolver(req);
        } catch (err) {
          console.error('[IAM] Error resolving scope:', err);
        }
      }
      
      // Build permission context
      const ctx: PermissionContext = {
        userId,
        organizationId: scopeContext.organizationId || (req as any).organizationId,
        resourceId: scopeContext.resourceId || req.params.id,
        resourceOwnerId: scopeContext.resourceOwnerId,
        resourceMetadata: scopeContext.resourceMetadata
      };
      
      // Store context on request for later use
      req.iamContext = ctx;
      
      // Check permission
      const result = await checkPermission(ctx, entityType, action, ctx.resourceId);
      req.permissionResult = result;
      
      if (!result.allowed) {
        // Log denied access
        await logAuditEvent({
          actorId: userId,
          actorIp: req.ip || req.socket.remoteAddress,
          actorUserAgent: req.get('User-Agent'),
          action: `access_denied_${action}`,
          entityType,
          entityId: ctx.resourceId,
          organizationId: ctx.organizationId,
          reason: result.reason
        });
        
        return res.status(403).json({
          error: 'Permission denied',
          code: 'PERMISSION_DENIED',
          details: result.reason
        });
      }
      
      next();
    } catch (error) {
      console.error('[IAM] Permission check error:', error);
      // Fail closed - deny access on error
      return res.status(500).json({
        error: 'Permission check failed',
        code: 'IAM_ERROR'
      });
    }
  };
}

/**
 * Middleware to require any of the specified permissions
 */
export function requireAnyPermission(
  permissions: Array<{ entityType: IamEntityType; action: IamAction }>,
  scopeResolver?: ScopeResolver
) {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      const userId = req.user?.userId;
      
      if (!userId) {
        return res.status(401).json({ 
          error: 'Authentication required',
          code: 'AUTH_REQUIRED'
        });
      }
      
      let scopeContext: Awaited<ReturnType<ScopeResolver>> = {};
      if (scopeResolver) {
        scopeContext = await scopeResolver(req);
      }
      
      const ctx: PermissionContext = {
        userId,
        organizationId: scopeContext.organizationId || (req as any).organizationId,
        resourceId: scopeContext.resourceId || req.params.id,
        resourceOwnerId: scopeContext.resourceOwnerId,
        resourceMetadata: scopeContext.resourceMetadata
      };
      
      req.iamContext = ctx;
      
      // Check each permission, allow if any passes
      for (const perm of permissions) {
        const result = await checkPermission(ctx, perm.entityType, perm.action, ctx.resourceId);
        if (result.allowed) {
          req.permissionResult = result;
          return next();
        }
      }
      
      // All permissions denied
      await logAuditEvent({
        actorId: userId,
        actorIp: req.ip || req.socket.remoteAddress,
        actorUserAgent: req.get('User-Agent'),
        action: 'access_denied_multi',
        entityType: permissions[0]?.entityType,
        entityId: ctx.resourceId,
        organizationId: ctx.organizationId,
        reason: 'All permission checks failed'
      });
      
      return res.status(403).json({
        error: 'Permission denied',
        code: 'PERMISSION_DENIED'
      });
    } catch (error) {
      console.error('[IAM] Permission check error:', error);
      return res.status(500).json({
        error: 'Permission check failed',
        code: 'IAM_ERROR'
      });
    }
  };
}

/**
 * Middleware to require all specified permissions
 */
export function requireAllPermissions(
  permissions: Array<{ entityType: IamEntityType; action: IamAction }>,
  scopeResolver?: ScopeResolver
) {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      const userId = req.user?.userId;
      
      if (!userId) {
        return res.status(401).json({ 
          error: 'Authentication required',
          code: 'AUTH_REQUIRED'
        });
      }
      
      let scopeContext: Awaited<ReturnType<ScopeResolver>> = {};
      if (scopeResolver) {
        scopeContext = await scopeResolver(req);
      }
      
      const ctx: PermissionContext = {
        userId,
        organizationId: scopeContext.organizationId || (req as any).organizationId,
        resourceId: scopeContext.resourceId || req.params.id,
        resourceOwnerId: scopeContext.resourceOwnerId,
        resourceMetadata: scopeContext.resourceMetadata
      };
      
      req.iamContext = ctx;
      
      // Check each permission, all must pass
      const results = [];
      for (const perm of permissions) {
        const result = await checkPermission(ctx, perm.entityType, perm.action, ctx.resourceId);
        results.push({ ...perm, ...result });
        
        if (!result.allowed) {
          await logAuditEvent({
            actorId: userId,
            actorIp: req.ip || req.socket.remoteAddress,
            actorUserAgent: req.get('User-Agent'),
            action: `access_denied_${perm.action}`,
            entityType: perm.entityType,
            entityId: ctx.resourceId,
            organizationId: ctx.organizationId,
            reason: result.reason
          });
          
          return res.status(403).json({
            error: 'Permission denied',
            code: 'PERMISSION_DENIED',
            details: `Missing permission: ${perm.entityType}:${perm.action}`
          });
        }
      }
      
      req.permissionResult = { allowed: true, reason: 'All permissions granted' };
      next();
    } catch (error) {
      console.error('[IAM] Permission check error:', error);
      return res.status(500).json({
        error: 'Permission check failed',
        code: 'IAM_ERROR'
      });
    }
  };
}

/**
 * Soft permission check - adds permission result to request but doesn't block
 */
export function checkPermissionSoft(
  entityType: IamEntityType,
  action: IamAction,
  scopeResolver?: ScopeResolver
) {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      const userId = req.user?.userId;
      
      if (!userId) {
        req.permissionResult = { allowed: false, reason: 'Not authenticated' };
        return next();
      }
      
      let scopeContext: Awaited<ReturnType<ScopeResolver>> = {};
      if (scopeResolver) {
        scopeContext = await scopeResolver(req);
      }
      
      const ctx: PermissionContext = {
        userId,
        organizationId: scopeContext.organizationId || (req as any).organizationId,
        resourceId: scopeContext.resourceId || req.params.id,
        resourceOwnerId: scopeContext.resourceOwnerId,
        resourceMetadata: scopeContext.resourceMetadata
      };
      
      req.iamContext = ctx;
      const result = await checkPermission(ctx, entityType, action, ctx.resourceId);
      req.permissionResult = result;
      
      next();
    } catch (error) {
      console.error('[IAM] Soft permission check error:', error);
      req.permissionResult = { allowed: false, reason: 'Permission check failed' };
      next();
    }
  };
}

/**
 * Audit logging middleware - logs all actions for auditable routes
 */
export function auditLog(
  entityType: IamEntityType,
  action: string
) {
  return async (req: Request, res: Response, next: NextFunction) => {
    const userId = req.user?.userId;
    const startTime = Date.now();
    
    // Capture original end function
    const originalEnd = res.end.bind(res) as (...args: any[]) => any;
    
    // Override end to log after response
    (res as any).end = async function(...args: any[]) {
      const duration = Date.now() - startTime;
      
      try {
        await logAuditEvent({
          actorId: userId,
          actorIp: req.ip || req.socket.remoteAddress,
          actorUserAgent: req.get('User-Agent'),
          action,
          entityType,
          entityId: req.params.id || (req.body && req.body.id),
          organizationId: req.iamContext?.organizationId,
          afterState: res.statusCode < 400 ? { success: true, duration } : { error: true, statusCode: res.statusCode },
          requestId: req.get('X-Request-ID')
        });
      } catch (err) {
        console.error('[IAM] Audit log error:', err);
      }
      
      // Call original end
      return originalEnd(...args);
    };
    
    next();
  };
}

// ==================== Common Scope Resolvers ====================

/**
 * Resolve account context from request params or body
 */
export const accountScopeResolver: ScopeResolver = async (req) => {
  const accountId = req.params.accountId || req.params.id || req.body?.accountId;
  
  // Could query DB here to get owner info
  return {
    resourceId: accountId,
    organizationId: (req as any).organizationId
  };
};

/**
 * Resolve campaign context from request
 */
export const campaignScopeResolver: ScopeResolver = async (req) => {
  const campaignId = req.params.campaignId || req.params.id || req.body?.campaignId;
  
  return {
    resourceId: campaignId,
    organizationId: (req as any).organizationId
  };
};

/**
 * Resolve from query string or body
 */
export const genericScopeResolver: ScopeResolver = async (req) => {
  return {
    resourceId: req.params.id || req.query.id as string || req.body?.id,
    organizationId: (req as any).organizationId
  };
};
