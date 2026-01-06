/**
 * Email Validation Test Routes
 * Dedicated endpoints for testing the API-free email validation engine
 */

import { Router } from "express";
import { summarizeBusinessEmailValidation, validateBusinessEmail } from "../services/email-validation";
import { requireAuth, requireRole } from "../auth";
import { z } from "zod";

const router = Router();

// Schema for single email test
const singleEmailTestSchema = z.object({
  email: z.string().email("Invalid email format"),
  skipCache: z.boolean().optional().default(false),
});

// Schema for batch email test
const batchEmailTestSchema = z.object({
  emails: z.array(z.string().email("Invalid email format")).min(1).max(100),
  skipCache: z.boolean().optional().default(false),
});

/**
 * Test single email validation
 * POST /api/test/email-validation/single
 * 
 * Body:
 * {
 *   "email": "test@example.com",
 *   "skipCache": false  // Optional: bypass DNS cache for testing
 * }
 * 
 * Response includes:
 * - Overall validation status (ok, invalid, risky, disposable, accept_all, unknown)
 * - Confidence score (0-100)
 * - Individual stage results (syntax, DNS/MX, risk assessment, SMTP)
 * - Detailed trace information for debugging
 */
router.post(
  "/api/test/email-validation/single",
  requireAuth,
  requireRole("admin"),
  async (req, res) => {
    try {
      // Validate request body
      const validation = singleEmailTestSchema.safeParse(req.body);
      if (!validation.success) {
        return res.status(400).json({
          error: "Validation error",
          details: validation.error.errors,
        });
      }

      const { email, skipCache } = validation.data;

      console.log(`[EMAIL VALIDATION TEST] Testing email: ${email}, skipCache: ${skipCache}`);

      const startTime = Date.now();
      const options = { useCache: !skipCache } as const;
      const result = await validateBusinessEmail(email, options);
      const summary = summarizeBusinessEmailValidation(result, options);
      const duration = Date.now() - startTime;

      res.json({
        email,
        duration: `${duration}ms`,
        result: {
          status: result.status,
          confidence: result.confidence,
          summary: {
            syntaxValid: result.syntaxValid,
            hasMx: result.hasMx,
            hasSmtp: result.hasSmtp,
            smtpAccepted: result.smtpAccepted,
            isRole: result.isRole,
            isFree: result.isFree,
            isDisposable: result.isDisposable,
            isCatchAll: result.isAcceptAll,
            deliverability: summary.deliverability,
            isDeliverable: summary.isDeliverable,
          },
          trace: result.trace,
        },
        metadata: {
          skipSmtpValidation: process.env.SKIP_SMTP_VALIDATION === 'true',
          dnsCacheTtl: `${process.env.DOMAIN_CACHE_TTL_HOURS || 24} hours`,
          dnsTimeout: `${process.env.DNS_TIMEOUT_MS || 3000}ms`,
          smtpTimeout: `${process.env.SMTP_CONNECT_TIMEOUT_MS || 10000}ms`,
        },
      });
    } catch (error) {
      console.error("[EMAIL VALIDATION TEST] Error:", error);
      res.status(500).json({
        error: "Validation failed",
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }
);

/**
 * Test batch email validation
 * POST /api/test/email-validation/batch
 * 
 * Body:
 * {
 *   "emails": ["test1@example.com", "test2@example.com", ...],
 *   "skipCache": false
 * }
 * 
 * Response includes validation results for each email with timing
 */
router.post(
  "/api/test/email-validation/batch",
  requireAuth,
  requireRole("admin"),
  async (req, res) => {
    try {
      // Validate request body
      const validation = batchEmailTestSchema.safeParse(req.body);
      if (!validation.success) {
        return res.status(400).json({
          error: "Validation error",
          details: validation.error.errors,
        });
      }

      const { emails, skipCache } = validation.data;

      console.log(`[EMAIL VALIDATION TEST] Testing ${emails.length} emails`);

      const startTime = Date.now();
      const results = [];

      for (const email of emails) {
        const emailStartTime = Date.now();
        try {
          const options = { useCache: !skipCache } as const;
          const result = await validateBusinessEmail(email, options);
          const summary = summarizeBusinessEmailValidation(result, options);
          results.push({
            email,
            duration: `${Date.now() - emailStartTime}ms`,
            status: result.status,
            confidence: result.confidence,
            summary: {
              syntaxValid: result.syntaxValid,
              hasMx: result.hasMx,
              hasSmtp: result.hasSmtp,
              smtpAccepted: result.smtpAccepted,
              isRole: result.isRole,
              isFree: result.isFree,
              isDisposable: result.isDisposable,
              isCatchAll: result.isAcceptAll,
              deliverability: summary.deliverability,
              isDeliverable: summary.isDeliverable,
            },
            trace: result.trace,
          });
        } catch (error) {
          results.push({
            email,
            duration: `${Date.now() - emailStartTime}ms`,
            error: error instanceof Error ? error.message : String(error),
          });
        }
      }

      const totalDuration = Date.now() - startTime;

      res.json({
        totalEmails: emails.length,
        totalDuration: `${totalDuration}ms`,
        averageDuration: `${Math.round(totalDuration / emails.length)}ms`,
        results,
        metadata: {
          skipSmtpValidation: process.env.SKIP_SMTP_VALIDATION === 'true',
          dnsCacheTtl: `${process.env.DOMAIN_CACHE_TTL_HOURS || 24} hours`,
        },
      });
    } catch (error) {
      console.error("[EMAIL VALIDATION TEST] Batch error:", error);
      res.status(500).json({
        error: "Batch validation failed",
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }
);

/**
 * Get validation system status and configuration
 * GET /api/test/email-validation/status
 */
router.get(
  "/api/test/email-validation/status",
  requireAuth,
  requireRole("admin"),
  async (req, res) => {
    try {
      const { db } = await import("../db");
      const { emailValidationDomainCache } = await import("@shared/schema");
      const { sql } = await import("drizzle-orm");

      // Get cache statistics
      const cacheStats = await db.execute(sql`
        SELECT 
          COUNT(*) as total_cached_domains,
          COUNT(CASE WHEN expires_at > NOW() THEN 1 END) as active_cached_domains,
          COUNT(CASE WHEN expires_at <= NOW() THEN 1 END) as expired_cached_domains,
          COUNT(CASE WHEN has_mx = true THEN 1 END) as domains_with_mx,
          COUNT(CASE WHEN has_a = true THEN 1 END) as domains_with_a
        FROM email_validation_domain_cache
      `);

      const stats = cacheStats.rows[0];

      res.json({
        configuration: {
          skipSmtpValidation: process.env.SKIP_SMTP_VALIDATION === 'true',
          dnsTimeout: `${process.env.DNS_TIMEOUT_MS || 3000}ms`,
          smtpTimeout: `${process.env.SMTP_CONNECT_TIMEOUT_MS || 10000}ms`,
          domainCacheTtl: `${process.env.DOMAIN_CACHE_TTL_HOURS || 24} hours`,
          validatorHelo: process.env.VALIDATOR_HELO || 'validator.pivotal-b2b.ai',
          validatorMailFrom: process.env.VALIDATOR_MAIL_FROM || 'null-sender@pivotal-b2b.ai',
        },
        domainCache: {
          totalCachedDomains: Number(stats.total_cached_domains),
          activeCachedDomains: Number(stats.active_cached_domains),
          expiredCachedDomains: Number(stats.expired_cached_domains),
          domainsWithMx: Number(stats.domains_with_mx),
          domainsWithA: Number(stats.domains_with_a),
        },
        recommendations: {
          enableSmtpValidation: process.env.SKIP_SMTP_VALIDATION === 'true' 
            ? "Set SKIP_SMTP_VALIDATION=false to enable SMTP probing for higher accuracy" 
            : "SMTP validation is enabled",
          cacheStatus: Number(stats.expired_cached_domains) > 0
            ? `${stats.expired_cached_domains} expired domains in cache - will be refreshed on next validation`
            : "All cached domains are current",
        },
      });
    } catch (error) {
      console.error("[EMAIL VALIDATION TEST] Status error:", error);
      res.status(500).json({
        error: "Failed to get validation status",
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }
);

export default router;
