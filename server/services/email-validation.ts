import {
  validateEmail as runEmailValidation,
  validateAndStoreEmail as runAndStoreEmail,
  validateEmail3Layer,
  validateAndStore3Layer,
  runLayer1Validation,
  runLayer2Validation,
  type ValidationResult,
  type ThreeLayerValidationResult,
  type Layer1Result,
  type Layer2Result,
} from '../lib/email-validation-engine';
import { isKickboxAvailable } from '../integrations/kickbox';

export interface BusinessEmailValidationOptions {
  skipSmtp?: boolean;
  useCache?: boolean;
  detectAcceptAll?: boolean;
}

export interface ThreeLayerValidationOptions {
  skipSmtp?: boolean;
  useCache?: boolean;
}

export interface BusinessEmailValidationSummary {
  status: ValidationResult['status'];
  confidence: number;
  isDeliverable: boolean;
  deliverability:
    | 'deliverable'
    | 'likely_deliverable'
    | 'risky'
    | 'undeliverable'
    | 'unknown';
  isCatchAll: boolean;
  shouldBlock: boolean;
  smtpStatus: 'accepted' | 'rejected' | 'unreachable' | 'skipped' | 'unknown';
  reasons: string[];
}

const DEFAULT_SKIP_SMTP = process.env.SKIP_SMTP_VALIDATION === 'true';
const DEFAULT_USE_CACHE = process.env.EMAIL_VALIDATION_USE_CACHE !== 'false';
const DEFAULT_DETECT_ACCEPT_ALL = process.env.EMAIL_VALIDATION_DETECT_ACCEPT_ALL !== 'false';

function mergeOptions(options?: BusinessEmailValidationOptions): Required<BusinessEmailValidationOptions> {
  const overrides = options ?? {};
  return {
    skipSmtp: overrides.skipSmtp ?? DEFAULT_SKIP_SMTP,
    useCache: overrides.useCache ?? DEFAULT_USE_CACHE,
    detectAcceptAll: overrides.detectAcceptAll ?? DEFAULT_DETECT_ACCEPT_ALL,
  };
}

export async function validateBusinessEmail(
  email: string,
  options?: BusinessEmailValidationOptions
): Promise<ValidationResult> {
  const merged = mergeOptions(options);
  return runEmailValidation(email, merged);
}

/**
 * Validate and store business email using Kickbox 3-layer system
 * @deprecated Use validateAndStore3LayerEmail instead - this function now delegates to it
 */
export async function validateAndStoreBusinessEmail(
  contactId: string,
  email: string,
  options: BusinessEmailValidationOptions = {}
) {
  const merged = mergeOptions(options);
  return runAndStoreEmail(contactId, email, 'kickbox', merged);
}

const DELIVERABLE_STATUSES = new Set<ValidationResult['status']>([
  'valid',
]);

const LIKELY_DELIVERABLE_STATUSES = new Set<ValidationResult['status']>([
  'acceptable',
  'unknown', // Unknown emails are treated as likely deliverable (~90% success rate)
]);

const BLOCKING_STATUSES = new Set<ValidationResult['status']>([
  'invalid', // Only invalid emails are considered non-deliverable
]);

export function summarizeBusinessEmailValidation(
  result: ValidationResult,
  options?: BusinessEmailValidationOptions
): BusinessEmailValidationSummary {
  const mergedOptions = mergeOptions(options);
  const isSmtpSkipped = mergedOptions.skipSmtp && !result.trace.smtp && !result.hasSmtp;
  const smtpStatus: BusinessEmailValidationSummary['smtpStatus'] = isSmtpSkipped
    ? 'skipped'
    : result.smtpAccepted === true
    ? 'accepted'
    : result.smtpAccepted === false
    ? 'rejected'
    : result.hasSmtp
    ? 'unreachable'
    : 'unknown';

  let deliverability: BusinessEmailValidationSummary['deliverability'] = 'unknown';
  if (DELIVERABLE_STATUSES.has(result.status) || result.smtpAccepted) {
    deliverability = 'deliverable';
  } else if (LIKELY_DELIVERABLE_STATUSES.has(result.status)) {
    deliverability = 'likely_deliverable';
  } else if (BLOCKING_STATUSES.has(result.status)) {
    deliverability = 'undeliverable';
  }

  const shouldBlock = BLOCKING_STATUSES.has(result.status);

  return {
    status: result.status,
    confidence: result.confidence,
    isDeliverable: !shouldBlock, // Only 'invalid' status is non-deliverable
    deliverability,
    isCatchAll: result.isAcceptAll ?? false,
    shouldBlock,
    smtpStatus,
    reasons: result.trace.risk?.reasons ?? [],
  };
}

/**
 * 3-Layer Email Validation System
 * 
 * LAYER 1: In-House Fast Validation (0.0001s per email)
 * - Syntax check, Free email vs business domain, Disposable email provider
 * - Role email (info@, sales@), DNS Lookup (MX records)
 * 
 * LAYER 2: Third-Party API Deep Verification (Kickbox)
 * - Catch-all detection, Accept-all domain identification, Risk score (Sendex)
 * - SMTP inbox verification, Bounce detection, Spam-trap patterns
 * - Hidden disposable detection
 * 
 * LAYER 3: Smart Caching
 * - Cross-campaign cache by email_lower + provider
 * - Domain cache for DNS/MX lookups
 */

export interface ThreeLayerEmailValidationSummary {
  status: 'valid' | 'acceptable' | 'unknown' | 'invalid';
  confidence: number;
  isBusinessEmail: boolean;
  emailEligible: boolean;
  eligibilityReason: string;
  riskLevel: 'low' | 'medium' | 'high' | 'unknown';
  provider: 'kickbox';
  isCatchAll: boolean;
  isDisposable: boolean;
  isFree: boolean;
  isRole: boolean;
}

/**
 * Run 3-layer email validation (without storing)
 * Always uses Kickbox as the provider
 */
export async function validate3LayerEmail(
  email: string,
  options?: ThreeLayerValidationOptions
): Promise<ThreeLayerValidationResult> {
  const opts = {
    skipSmtp: options?.skipSmtp ?? true,
    useCache: options?.useCache ?? true,
  };
  
  return validateEmail3Layer(email, opts);
}

/**
 * Run 3-layer email validation and store result
 * Always uses Kickbox as the provider
 */
export async function validateAndStore3LayerEmail(
  contactId: string,
  email: string,
  options?: ThreeLayerValidationOptions
): Promise<ThreeLayerValidationResult> {
  const opts = {
    skipSmtp: options?.skipSmtp ?? true,
    useCache: options?.useCache ?? true,
  };
  
  return validateAndStore3Layer(contactId, email, opts);
}

/**
 * Summarize 3-layer validation result for business logic
 */
export function summarize3LayerValidation(
  result: ThreeLayerValidationResult
): ThreeLayerEmailValidationSummary {
  return {
    status: result.status,
    confidence: result.confidence,
    isBusinessEmail: result.isBusinessEmail,
    emailEligible: result.emailEligible,
    eligibilityReason: result.eligibilityReason,
    riskLevel: result.riskLevel,
    provider: 'kickbox',
    isCatchAll: result.layer2?.kickboxAcceptAll ?? result.layer1?.isRole ?? false,
    isDisposable: result.layer2?.kickboxDisposable ?? result.layer1.isDisposable,
    isFree: result.layer2?.kickboxFree ?? result.layer1.isFree,
    isRole: result.layer2?.kickboxRole ?? result.layer1.isRole,
  };
}

/**
 * Check if Kickbox deep verification is available
 */
export function isDeepVerificationAvailable(): boolean {
  return isKickboxAvailable();
}

/**
 * Batch validate emails for regular contacts (not verification contacts)
 * Uses 3-layer Kickbox validation without storing to verification_email_validations
 * Updates contact's email verification status and lead's qaData
 */
export async function validateEmailBatch(
  contactIds: string[],
  options?: ThreeLayerValidationOptions
): Promise<{ success: number; failed: number; skipped: number }> {
  const { db } = await import('../db');
  const { contacts, leads } = await import('@shared/schema');
  const { eq, inArray } = await import('drizzle-orm');
  
  const stats = { success: 0, failed: 0, skipped: 0 };
  
  if (contactIds.length === 0) {
    console.log('[EmailBatch] No contacts to validate');
    return stats;
  }
  
  console.log(`[EmailBatch] Starting batch validation for ${contactIds.length} contacts with Kickbox`);
  
  // Fetch all contacts
  const contactRecords = await db.select()
    .from(contacts)
    .where(inArray(contacts.id, contactIds));
  
  // Build a map of contactId to leads for updating qaData
  const leadsForContacts = await db.select()
    .from(leads)
    .where(inArray(leads.contactId, contactIds));
  
  const leadsByContactId = new Map<string, typeof leadsForContacts>();
  for (const lead of leadsForContacts) {
    if (lead.contactId) {
      const existing = leadsByContactId.get(lead.contactId) || [];
      existing.push(lead);
      leadsByContactId.set(lead.contactId, existing);
    }
  }
  
  // Process each contact
  for (const contact of contactRecords) {
    if (!contact.email) {
      console.log(`[EmailBatch] Skipping contact ${contact.id} - no email`);
      stats.skipped++;
      continue;
    }
    
    try {
      // Run 3-layer validation (no storage - results go to contact/lead records)
      const validation = await validate3LayerEmail(contact.email, {
        skipSmtp: options?.skipSmtp ?? true,
        useCache: options?.useCache ?? true,
      });
      
      const summary = summarize3LayerValidation(validation);
      
      // Update contact's email verification status
      await db.update(contacts)
        .set({
          emailVerificationStatus: validation.status,
          emailStatus: validation.status,
        })
        .where(eq(contacts.id, contact.id));
      
      // Update all leads for this contact with email validation results
      const contactLeads = leadsByContactId.get(contact.id) || [];
      for (const lead of contactLeads) {
        const isDeliverable = validation.status === 'valid' || validation.status === 'acceptable';
        const isUnknown = validation.status === 'unknown';
        
        const currentQaData = (lead.qaData as Record<string, any>) || {};
        const updatedQaData = {
          ...currentQaData,
          emailValidation: {
            status: validation.status,
            isDeliverable,
            isUnknown,
            validatedAt: new Date().toISOString(),
            confidence: validation.confidence,
            provider: 'kickbox',
            riskLevel: summary.riskLevel,
            isCatchAll: summary.isCatchAll,
            isDisposable: summary.isDisposable,
            isFree: summary.isFree,
            isRole: summary.isRole,
            eligibilityReason: summary.eligibilityReason,
            layer1: validation.layer1,
            layer2: validation.layer2 ? {
              result: validation.layer2.kickboxResult,
              reason: validation.layer2.kickboxReason,
              score: validation.layer2.kickboxScore,
            } : null,
          },
        };
        
        await db.update(leads)
          .set({ qaData: updatedQaData })
          .where(eq(leads.id, lead.id));
      }
      
      console.log(`[EmailBatch] ${contact.email}: ${validation.status} (confidence: ${validation.confidence}, leads updated: ${contactLeads.length})`);
      stats.success++;
    } catch (error) {
      console.error(`[EmailBatch] Failed to validate ${contact.email}:`, error);
      stats.failed++;
    }
  }
  
  console.log(`[EmailBatch] Completed: ${stats.success} success, ${stats.failed} failed, ${stats.skipped} skipped`);
  return stats;
}

// Re-export types for external use
export type {
  ThreeLayerValidationResult,
  Layer1Result,
  Layer2Result,
};
