import rateLimit from 'express-rate-limit';
import type { Request, Response, NextFunction } from 'express';
import { ZodSchema, ZodError } from 'zod';

/**
 * RATE LIMITING MIDDLEWARE
 * Protects against brute force attacks and API abuse
 */

// General API rate limiter: 10000 requests per 15 minutes per IP (very high for development/testing)
export const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10000, // limit each IP to 10000 requests per windowMs
  standardHeaders: true, // Return rate limit info in the `RateLimit-*` headers
  legacyHeaders: false, // Disable the `X-RateLimit-*` headers
  handler: (_req, res) => {
    res.status(429).json({
      message: 'Too many requests from this IP, please try again later.',
      retryAfter: 900 // 15 minutes in seconds
    });
  }
});

// Strict rate limiter for authentication endpoints: 50 attempts per 15 minutes (very generous)
export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 50, // limit each IP to 50 login requests per windowMs
  skipSuccessfulRequests: true, // Don't count successful logins
  standardHeaders: true,
  legacyHeaders: false,
  handler: (_req, res) => {
    res.status(429).json({
      message: 'Too many login attempts, please try again after 15 minutes.',
      retryAfter: 900 // 15 minutes in seconds
    });
  }
});

// Medium rate limiter for write operations: 1000 requests per 10 minutes (very high for bulk operations)
export const writeLimiter = rateLimit({
  windowMs: 10 * 60 * 1000, // 10 minutes
  max: 1000, // limit each IP to 1000 write requests per windowMs
  standardHeaders: true,
  legacyHeaders: false,
  handler: (_req, res) => {
    res.status(429).json({
      message: 'Too many write operations, please slow down.',
      retryAfter: 600 // 10 minutes in seconds
    });
  }
});

// Strict rate limiter for expensive operations (exports, bulk actions): 100 per hour (generous for development)
export const expensiveOperationLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 100, // limit each IP to 100 expensive operations per hour
  standardHeaders: true,
  legacyHeaders: false,
  handler: (_req, res) => {
    res.status(429).json({
      message: 'Too many expensive operations, please try again later.',
      retryAfter: 3600 // 1 hour in seconds
    });
  }
});

/**
 * REQUEST VALIDATION MIDDLEWARE
 * Validates request body/query/params against Zod schemas
 */

export interface ValidationSchemas {
  body?: ZodSchema;
  query?: ZodSchema;
  params?: ZodSchema;
}

/**
 * Validates request against Zod schemas
 * Usage:
 *   app.post('/api/users', validate({ body: insertUserSchema }), handler)
 */
export function validate(schemas: ValidationSchemas) {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      // Validate body
      if (schemas.body) {
        req.body = await schemas.body.parseAsync(req.body);
      }

      // Validate query parameters
      if (schemas.query) {
        req.query = await schemas.query.parseAsync(req.query);
      }

      // Validate URL parameters
      if (schemas.params) {
        req.params = await schemas.params.parseAsync(req.params);
      }

      next();
    } catch (error) {
      if (error instanceof ZodError) {
        return res.status(400).json({
          message: 'Validation failed',
          errors: error.errors.map(err => ({
            field: err.path.join('.'),
            message: err.message,
          })),
        });
      }
      next(error);
    }
  };
}

/**
 * PAYLOAD SIZE LIMITING
 * Prevents DOS attacks via large payloads
 */
export const PAYLOAD_LIMITS = {
  // Standard JSON request limit: 50MB (increased for CSV uploads)
  json: '50mb',
  // File upload limit: 50MB
  upload: '50mb',
  // URL encoded data limit: 50MB (increased for CSV uploads)
  urlencoded: '50mb',
};

/**
 * INPUT SANITIZATION
 * Strips potentially malicious content from user input
 */
const HTML_PASSTHROUGH_KEYS = new Set([
  "bodyContent",
  "html",
  "htmlContent",
  "emailHtmlContent",
  "templateHtml",
]);

const HTML_KEY_PATTERN = /html/i;

function shouldAllowHtml(key?: string): boolean {
  if (!key) return false;
  return HTML_PASSTHROUGH_KEYS.has(key) || HTML_KEY_PATTERN.test(key);
}

export function sanitizeInput(input: string): string {
  if (typeof input !== 'string') return input;
  
  // Remove HTML tags to prevent XSS
  let sanitized = input.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '');
  sanitized = sanitized.replace(/<[^>]+>/g, '');
  
  // Remove SQL injection attempts (basic patterns)
  const sqlPatterns = [
    /(\b(SELECT|INSERT|UPDATE|DELETE|DROP|CREATE|ALTER|EXEC|EXECUTE)\b)/gi,
    /(--|#|\/\*|\*\/)/g,
  ];
  
  sqlPatterns.forEach(pattern => {
    sanitized = sanitized.replace(pattern, '');
  });
  
  return sanitized.trim();
}

export function sanitizeHtmlInput(input: string): string {
  if (typeof input !== 'string') return input;
  
  let sanitized = input.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '');
  sanitized = sanitized.replace(/\son\w+\s*=\s*(['"]).*?\1/gi, '');
  sanitized = sanitized.replace(/\son\w+\s*=\s*[^\s>]+/gi, '');
  sanitized = sanitized.replace(/javascript:/gi, '');
  
  return sanitized.trim();
}

/**
 * Middleware to sanitize all string fields in request body
 */
export function sanitizeBody(req: Request, res: Response, next: NextFunction) {
  if (req.body && typeof req.body === 'object') {
    const sanitizeObject = (obj: any, allowHtml = false): any => {
      if (Array.isArray(obj)) {
        return obj.map(item => sanitizeObject(item, allowHtml));
      }
      
      if (obj !== null && typeof obj === 'object') {
        const sanitized: any = {};
        for (const [key, value] of Object.entries(obj)) {
          const allowHtmlForKey = allowHtml || shouldAllowHtml(key);
          if (typeof value === 'string') {
            sanitized[key] = allowHtmlForKey ? sanitizeHtmlInput(value) : sanitizeInput(value);
          } else if (typeof value === 'object') {
            sanitized[key] = sanitizeObject(value, allowHtmlForKey);
          } else {
            sanitized[key] = value;
          }
        }
        return sanitized;
      }
      
      if (typeof obj === 'string') {
        return allowHtml ? sanitizeHtmlInput(obj) : sanitizeInput(obj);
      }
      
      return obj;
    };
    
    req.body = sanitizeObject(req.body);
  }
  next();
}

/**
 * SECURITY HEADERS
 * Additional security headers to prevent common attacks
 */
export function securityHeaders(req: Request, res: Response, next: NextFunction) {
  // Prevent clickjacking
  res.setHeader('X-Frame-Options', 'DENY');
  
  // Prevent MIME type sniffing
  res.setHeader('X-Content-Type-Options', 'nosniff');
  
  // Enable XSS filter
  res.setHeader('X-XSS-Protection', '1; mode=block');
  
  // Referrer policy
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  
  // Content Security Policy (basic - adjust based on your needs)
  res.setHeader(
    'Content-Security-Policy',
    "default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; img-src 'self' data: https:; font-src 'self' data: https://fonts.gstatic.com; media-src 'self' blob:; connect-src 'self' https: wss:"
  );
  
  next();
}

/**
 * IP LOGGING FOR AUDIT
 * Captures client IP for security auditing
 */
export function getClientIP(req: Request): string {
  // Check various headers for the real IP (considering proxies)
  const forwarded = req.headers['x-forwarded-for'];
  if (forwarded) {
    const ips = (forwarded as string).split(',');
    return ips[0].trim();
  }
  
  return req.headers['x-real-ip'] as string || 
         req.connection.remoteAddress || 
         req.socket.remoteAddress || 
         'unknown';
}

/**
 * Attach client IP to request object for logging
 */
export function captureClientIP(req: Request, res: Response, next: NextFunction) {
  (req as any).clientIP = getClientIP(req);
  next();
}
