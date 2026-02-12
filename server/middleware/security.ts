import rateLimit from 'express-rate-limit';
import type { Request, Response, NextFunction } from 'express';
import { ZodSchema, ZodError } from 'zod';

/**
 * RATE LIMITING MIDDLEWARE
 * Protects against brute force attacks and API abuse
 */

// Paths exempt from global rate limiting (webhooks, call control, dialer - high volume during concurrent calls)
const RATE_LIMIT_EXEMPT_PREFIXES = [
  '/api/webhooks/',           // Telnyx/external webhooks - must never be rate limited
  '/api/campaign-test-calls/webhook', // Test call webhooks
  '/api/ai-calls/webhook',    // AI call webhooks
  '/api/ai-calls/audio/',     // Audio clip serving
  '/api/dialer-runs/',        // Dialer run status, call attempts, dispositions
  '/api/calls/',              // Agent call control (status polling, hangup)
  '/api/health',              // Health checks
  '/api/recordings/',         // Recording access during/after calls
];

// General API rate limiter: 50000 requests per 15 minutes per IP (scaled for 50+ concurrent calls)
export const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 50000, // limit each IP to 50000 requests per windowMs
  standardHeaders: true, // Return rate limit info in the `RateLimit-*` headers
  legacyHeaders: false, // Disable the `X-RateLimit-*` headers
  skip: (req) => RATE_LIMIT_EXEMPT_PREFIXES.some(prefix => req.path.startsWith(prefix)),
  handler: (_req, res) => {
    res.status(429).json({
      message: 'Too many requests from this IP, please try again later.',
      retryAfter: 900 // 15 minutes in seconds
    });
  }
});

// Strict rate limiter for authentication endpoints: 10 attempts per 15 minutes
export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10, // limit each IP to 10 login requests per windowMs
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
  // Standard JSON request limit: 10MB (sufficient for most API requests and CSV uploads)
  json: '10mb',
  // File upload limit: 25MB
  upload: '25mb',
  // URL encoded data limit: 10MB
  urlencoded: '10mb',
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
  
  // NOTE: SQL injection protection is handled by Drizzle ORM parameterization.
  // We removed the aggressive keyword filtering to prevent data corruption of valid text (e.g. "Select option").
  // Basic comment stripping can remain if strictly needed, but parameterization is the primary defense.
  
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
  
  // Content Security Policy
  // Allow ws: and http://localhost for Vite HMR in development
  const isDev = process.env.NODE_ENV === 'development';
  const scriptSrc = isDev
    ? "script-src 'self' 'unsafe-inline' 'unsafe-eval'"
    : "script-src 'self' 'unsafe-inline'"; // No unsafe-eval in production
  res.setHeader(
    'Content-Security-Policy',
    `default-src 'self'; ${scriptSrc}; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; img-src 'self' data: https:; font-src 'self' data: https://fonts.gstatic.com; media-src 'self' blob:; connect-src 'self' https: wss:${isDev ? ' ws: http://localhost:* http://127.0.0.1:*' : ''}; frame-ancestors 'none'`
  );

  // Strict Transport Security (enforce HTTPS for 1 year, include subdomains)
  if (!isDev) {
    res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  }

  // Prevent browsers from caching sensitive responses
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(self), geolocation=()');
  
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
