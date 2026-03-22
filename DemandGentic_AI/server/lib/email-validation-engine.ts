/**
 * API-Free Email Validation Engine
 * Multi-stage validation: Syntax → DNS/MX → Risk → SMTP
 * 
 * Key design: Validates only "potential eligibles" (contacts that pass geo/title checks)
 */

import { db } from "../db";
import { emailValidationDomainCache, verificationEmailValidations, verificationContacts } from "@shared/schema";
import { eq, desc, sql as sqlTag } from "drizzle-orm";
import * as dns from "dns";
import * as net from "net";
import * as tls from "tls";
import punycode from "punycode";

const EMAIL_MAX_LENGTH = 254;
const LOCAL_MAX_LENGTH = 64;
const DNS_TIMEOUT_MS = Number(process.env.DNS_TIMEOUT_MS || 2000); // Reduced from 3000ms
const SMTP_CONNECT_TIMEOUT_MS = Number(process.env.SMTP_CONNECT_TIMEOUT_MS || 5000); // Reduced from 10000ms
const DOMAIN_CACHE_TTL_HOURS = Number(process.env.DOMAIN_CACHE_TTL_HOURS || 168); // Increased to 7 days
const VALIDATOR_HELO = process.env.VALIDATOR_HELO || 'validator.pivotal-b2b.ai';
const VALIDATOR_MAIL_FROM = process.env.VALIDATOR_MAIL_FROM || 'null-sender@pivotal-b2b.ai';

// Risk lists - can be moved to database for dynamic updates
const ROLE_PREFIXES = ['admin', 'info', 'sales', 'support', 'hr', 'careers', 'hello', 'contact', 'marketing', 'noreply', 'no-reply', 'webmaster', 'postmaster', 'abuse', 'billing'];
const FREE_PROVIDERS = ['gmail.com', 'outlook.com', 'yahoo.com', 'icloud.com', 'hotmail.com', 'live.com', 'aol.com', 'msn.com', 'mail.com', 'protonmail.com', 'me.com', 'zoho.com'];
const DISPOSABLE_DOMAINS = ['mailinator.com', 'guerrillamail.com', 'temp-mail.org', '10minutemail.com', 'throwaway.email', 'yopmail.com', 'maildrop.cc', 'tempmail.com', 'getnada.com', 'trashmail.com'];

// Known spam trap patterns and domains
const SPAM_TRAP_DOMAINS = [
  'spamtrap.com', 'honeypot.net', 'blackhole.email', 'spam.la',
  'mailcatch.com', 'abuse.net', 'fbi.gov', 'ftc.gov'
];

const SPAM_TRAP_PATTERNS = [
  /^spamtrap@/i,
  /^honeypot@/i,
  /^trap@/i,
  /^abuse@/i,
  /^postmaster@/i,
  /^blackhole@/i
];

export interface ParsedEmail {
  ok: boolean;
  local?: string;
  domain?: string;
  normalized?: string;
  reason?: string;
}

export interface DnsResult {
  hasMX: boolean;
  hasA: boolean;
  mxHosts?: string[];
  aRecords?: string[];
  error?: string;
}

export interface RiskCheck {
  isRole: boolean;
  isFree: boolean;
  isDisposable: boolean;
  isSpamTrap: boolean;
  reasons: string[];
}

export interface SmtpProbeResult {
  code?: number;
  banner?: string;
  rcptOk?: boolean;
  isAcceptAll?: boolean;
  raw: string[];
  error?: string;
}

export type EmailValidationStatus = 
  | 'valid'        // SMTP confirmed deliverable OR DNS verified with high confidence
  | 'invalid'      // Hard failures: syntax errors, no MX, mailbox disabled, disposable, spam trap
  | 'unknown'      // Cannot reliably determine (SMTP blocked, timeout, greylisting, ambiguous response)
  | 'acceptable';  // Catch-all/accept-all OR risk factors but likely deliverable

export interface ValidationResult {
  status: EmailValidationStatus;
  confidence: number;
  syntaxValid: boolean;
  hasMx: boolean;
  hasSmtp: boolean;
  smtpAccepted?: boolean;
  isAcceptAll?: boolean;
  isDisabled?: boolean;
  isRole: boolean;
  isFree: boolean;
  isDisposable: boolean;
  isSpamTrap: boolean;
  trace: {
    syntax?: { ok: boolean; reason?: string };
    dns?: DnsResult;
    smtp?: SmtpProbeResult;
    risk?: RiskCheck;
  };
}

/**
 * Stage 1: Syntax Validation
 * Fast, synchronous check for email format validity
 */
export function parseEmail(raw: string): ParsedEmail {
  const trimmed = raw.trim();
  const at = trimmed.indexOf('@');
  
  if (at  EMAIL_MAX_LENGTH || local.length > LOCAL_MAX_LENGTH) {
    return { ok: false, reason: 'length_exceeded' };
  }
  
  // Check for invalid characters in local part
  if (/\s|\.\.|@|,$/.test(local)) {
    return { ok: false, reason: 'invalid_local_chars' };
  }
  
  // IDN (internationalized domain name) support
  try {
    domain = punycode.toASCII(domain);
  } catch (e) {
    return { ok: false, reason: 'invalid_idn' };
  }
  
  // Validate domain syntax
  if (!/^([a-z0-9-]+\.)+[a-z]{2,}$/i.test(domain)) {
    return { ok: false, reason: 'invalid_domain_syntax' };
  }
  
  return {
    ok: true,
    local,
    domain,
    normalized: `${local}@${domain}`
  };
}

/**
 * Stage 2: DNS/MX Resolution with caching
 * Checks if domain has MX records or A records
 */
export async function resolveDomain(domain: string): Promise {
  try {
    // Check cache first
    const cached = await db
      .select()
      .from(emailValidationDomainCache)
      .where(eq(emailValidationDomainCache.domain, domain))
      .limit(1);
    
    const now = new Date();
    if (cached.length > 0) {
      const ageHours = (now.getTime() - new Date(cached[0].lastChecked!).getTime()) / 36e5;
      if (ageHours ((resolve, reject) => {
        const timeout = setTimeout(() => reject(new Error('DNS timeout')), DNS_TIMEOUT_MS);
        dns.resolveMx(domain, (err, addresses) => {
          clearTimeout(timeout);
          if (err) reject(err);
          else resolve(addresses || []);
        });
      });
      
      mxRecords.sort((a, b) => a.priority - b.priority);
      result.mxHosts = mxRecords.map(mx => mx.exchange);
      result.hasMX = result.mxHosts.length > 0;
    } catch (e) {
      result.error = `MX lookup failed: ${String(e)}`;
    }
    
    // Fallback to A records if no MX
    if (!result.hasMX) {
      try {
        const aRecords = await new Promise((resolve, reject) => {
          const timeout = setTimeout(() => reject(new Error('DNS timeout')), DNS_TIMEOUT_MS);
          dns.resolve4(domain, (err, addresses) => {
            clearTimeout(timeout);
            if (err) reject(err);
            else resolve(addresses || []);
          });
        });
        
        result.aRecords = aRecords;
        result.hasA = aRecords.length > 0;
      } catch (e) {
        if (!result.error) {
          result.error = `A record lookup failed: ${String(e)}`;
        }
      }
    }
    
    // Update cache
    const cacheData = {
      domain,
      hasMx: result.hasMX,
      hasA: result.hasA,
      mxHosts: result.mxHosts as any,
      lastChecked: now,
      checkCount: 1,
    };
    
    if (cached.length > 0) {
      await db
        .update(emailValidationDomainCache)
        .set({ ...cacheData, checkCount: cached[0].checkCount + 1 })
        .where(eq(emailValidationDomainCache.domain, domain));
    } else {
      await db
        .insert(emailValidationDomainCache)
        .values(cacheData)
        .onConflictDoUpdate({
          target: emailValidationDomainCache.domain,
          set: cacheData
        });
    }
    
    return result;
  } catch (error) {
    console.error('[EmailValidation] DNS resolution error:', error);
    return {
      hasMX: false,
      hasA: false,
      error: String(error)
    };
  }
}

/**
 * Stage 3: Risk Checks
 * Identifies role accounts, free providers, disposable domains, and spam traps
 */
export function checkRisks(local: string, domain: string): RiskCheck {
  const localLower = local.toLowerCase();
  const domainLower = domain.toLowerCase();
  const fullEmail = `${localLower}@${domainLower}`;
  
  const isRole = ROLE_PREFIXES.some(prefix => localLower.startsWith(prefix));
  const isFree = FREE_PROVIDERS.includes(domainLower);
  const isDisposable = DISPOSABLE_DOMAINS.includes(domainLower);
  const isSpamTrap = SPAM_TRAP_DOMAINS.includes(domainLower) || 
                     SPAM_TRAP_PATTERNS.some(pattern => pattern.test(fullEmail));
  
  const reasons: string[] = [];
  if (isRole) reasons.push('role_account');
  if (isFree) reasons.push('free_provider');
  if (isDisposable) reasons.push('disposable_domain');
  if (isSpamTrap) reasons.push('spam_trap');
  
  return { isRole, isFree, isDisposable, isSpamTrap, reasons };
}

/**
 * Stage 4: SMTP Probe
 * Lightweight RCPT TO check (no DATA sent)
 * WARNING: Can be blocked or rate-limited by mail servers
 */
export async function probeSmtp(
  host: string, 
  rcptEmail: string, 
  port: number = 25, 
  secure: boolean = false
): Promise {
  const raw: string[] = [];
  
  return new Promise((resolve) => {
    const timeout = setTimeout(() => {
      sock.destroy();
      resolve({ raw, error: 'SMTP connection timeout' });
    }, SMTP_CONNECT_TIMEOUT_MS);
    
    const sock = secure
      ? tls.connect({ host, port, servername: host, timeout: SMTP_CONNECT_TIMEOUT_MS })
      : net.connect({ host, port, timeout: SMTP_CONNECT_TIMEOUT_MS });
    
    let rcptOk = false;
    let code: number | undefined;
    let banner: string | undefined;
    
    const send = (line: string) => {
      return new Promise((res, rej) => {
        raw.push('> ' + line);
        sock.write(line + '\r\n', (err) => (err ? rej(err) : res()));
      });
    };
    
    const recv = (): Promise => {
      return new Promise((res) => {
        sock.once('data', (buf) => {
          const response = buf.toString('utf8');
          raw.push(' {
      clearTimeout(timeout);
      resolve({ raw, error: String(err) });
    });
    
    sock.once('data', async (d) => {
      try {
        banner = d.toString('utf8');
        raw.push('`);
        await recv();
        
        await send(`RCPT TO:`);
        const rcptResponse = await recv();
        
        code = Number(rcptResponse.slice(0, 3));
        rcptOk = code >= 250 && code  {
  try {
    // Test real email
    const realTest = await probeSmtp(host, realEmail);
    
    // If real email is NOT accepted, domain is not accept-all
    if (!realTest.rcptOk) {
      return false;
    }
    
    // Generate obviously fake email for same domain
    const fakeLocal = 'nonexistent-test-' + Math.random().toString(36).substr(2, 12);
    const fakeEmail = `${fakeLocal}@${domain}`;
    
    // Test fake email
    const fakeTest = await probeSmtp(host, fakeEmail);
    
    // If BOTH real and fake are accepted → accept-all domain
    return !!(realTest.rcptOk && fakeTest.rcptOk);
    
  } catch (error) {
    console.error('[EmailValidation] Accept-all detection error:', error);
    return false; // Assume not accept-all if test fails
  }
}

/**
 * Complete validation pipeline with comprehensive status mapping
 * Runs all stages and returns detailed result with send recommendations
 */
export async function validateEmail(
  email: string,
  options: {
    skipSmtp?: boolean;
    useCache?: boolean;
    detectAcceptAll?: boolean;
  } = {}
): Promise {
  const { skipSmtp = false, useCache = true, detectAcceptAll: shouldDetectAcceptAll = false } = options;
  
  const result: ValidationResult = {
    status: 'unknown',
    confidence: 0,
    syntaxValid: false,
    hasMx: false,
    hasSmtp: false,
    isRole: false,
    isFree: false,
    isDisposable: false,
    isSpamTrap: false,
    trace: {}
  };
  
  // Stage 1: Syntax
  const parsed = parseEmail(email);
  result.trace.syntax = { ok: parsed.ok, reason: parsed.reason };
  
  if (!parsed.ok || !parsed.local || !parsed.domain) {
    result.status = 'invalid';
    result.confidence = 100;
    return result;
  }
  
  result.syntaxValid = true;
  
  // Stage 2: DNS/MX
  const dns = await resolveDomain(parsed.domain);
  result.trace.dns = dns;
  result.hasMx = dns.hasMX;
  
  if (!dns.hasMX && !dns.hasA) {
    result.status = 'invalid';
    result.confidence = 95;
    return result;
  }
  
  // Stage 3: Risk checks (spam traps, disposable, role, free)
  const risk = checkRisks(parsed.local, parsed.domain);
  result.trace.risk = risk;
  result.isRole = risk.isRole;
  result.isFree = risk.isFree;
  result.isDisposable = risk.isDisposable;
  result.isSpamTrap = risk.isSpamTrap;
  
  // High-priority blocks - map to INVALID
  if (result.isSpamTrap || result.isDisposable) {
    result.status = 'invalid';
    result.confidence = 100;
    return result;
  }
  
  // Stage 4: SMTP (optional, can be skipped for performance)
  if (!skipSmtp && dns.hasMX && dns.mxHosts && dns.mxHosts.length > 0) {
    try {
      const smtp = await probeSmtp(dns.mxHosts[0], email);
      result.trace.smtp = smtp;
      result.hasSmtp = !!smtp.rcptOk;
      result.smtpAccepted = smtp.rcptOk;
      
      // SMTP rejection codes (550/551/552/553) can indicate disabled mailboxes
      // BUT many corporate mail servers (Emirates, British Airways, etc.) reject 
      // anonymous SMTP probes as anti-spam protection - even for valid emails!
      // Treat as "unknown" unless corroborated by other signals
      if (smtp.code && (smtp.code === 550 || smtp.code === 551 || smtp.code === 552 || smtp.code === 553)) {
        // Downgrade to "unknown" to avoid false positives from corporate anti-spam
        result.status = 'unknown';
        result.isDisabled = true; // Flag for telemetry/analysis
        result.confidence = 60; // Lower confidence since this may be anti-spam protection
        return result;
      }
      
      // Detect accept-all if requested
      if (shouldDetectAcceptAll && smtp.rcptOk) {
        const isAcceptAll = await detectAcceptAll(dns.mxHosts[0], email, parsed.domain);
        result.isAcceptAll = isAcceptAll;
        
        if (isAcceptAll) {
          result.status = 'acceptable'; // ACCEPTABLE: Catch-all domain
          result.confidence = 75;
          return result;
        }
      }
      
      // Standard SMTP result mapping
      if (smtp.rcptOk) {
        // Map to 4-status system based on risk factors
        if (result.isRole || result.isFree) {
          result.status = 'acceptable'; // ACCEPTABLE: Risk factors but likely deliverable
          result.confidence = 80;
        } else {
          result.status = 'valid'; // VALID: SMTP confirmed deliverable
          result.confidence = 95;
        }
      } else if (smtp.code && smtp.code >= 500) {
        result.status = 'invalid';
        result.confidence = 85;
      } else {
        result.status = 'unknown';
        result.confidence = 50;
      }
    } catch (e) {
      // SMTP probe failed - not necessarily invalid
      result.status = 'unknown';
      result.confidence = 60;
    }
  } else {
    // DNS-only validation (no SMTP)
    if (dns.hasMX) {
      // Map to 4-status system based on risk factors
      if (result.isRole || result.isFree) {
        result.status = 'acceptable'; // ACCEPTABLE: Risk factors but likely deliverable
        result.confidence = 70;
      } else {
        result.status = 'valid'; // VALID: DNS-verified (no SMTP confirmation)
        result.confidence = 75;
      }
    } else {
      result.status = 'unknown';
      result.confidence = 50;
    }
  }
  
  return result;
}

/**
 * Persist email validation status to verification_contacts table
 * Called for both fresh validations and cache hits to ensure real-time updates
 */
async function persistEmailStatusToContact(
  contactId: string,
  status: EmailValidationStatus,
  confidence: number
): Promise {
  try {
    await db
      .update(verificationContacts)
      .set({
        emailStatus: status,
        updatedAt: new Date(),
      })
      .where(eq(verificationContacts.id, contactId));
    
    console.log(`[EmailValidation] Persisted status '${status}' (confidence: ${confidence}%) to contact ${contactId}`);
  } catch (error) {
    console.error(`[EmailValidation] Failed to persist status to contact ${contactId}:`, error);
  }
}

/**
 * Validate email and store result in database
 */
export async function validateAndStoreEmail(
  contactId: string,
  email: string,
  provider: 'kickbox' = 'kickbox',
  options: {
    skipSmtp?: boolean;
    useCache?: boolean;
    detectAcceptAll?: boolean;
  } = {}
): Promise {
  const emailLower = email.toLowerCase().trim();
  
  // CROSS-CAMPAIGN CACHE CHECK: Reuse validation from ANY campaign (if cache enabled)
  if (options.useCache !== false) {
    const [cachedValidation] = await db
      .select()
      .from(verificationEmailValidations)
      .where(eq(verificationEmailValidations.emailLower, emailLower))
      .orderBy(desc(verificationEmailValidations.checkedAt))
      .limit(1);

    if (cachedValidation) {
      console.log(`[EmailValidation] Cache HIT for ${email} - reusing result from ${cachedValidation.checkedAt} (provider: ${cachedValidation.provider})`);
    
    // Store cached result for this contact
    await db.insert(verificationEmailValidations)
      .values({
        contactId,
        emailLower,
        provider: cachedValidation.provider,
        status: cachedValidation.status,
        syntaxValid: cachedValidation.syntaxValid,
        hasMx: cachedValidation.hasMx,
        hasSmtp: cachedValidation.hasSmtp,
        smtpAccepted: cachedValidation.smtpAccepted,
        isRole: cachedValidation.isRole,
        isFree: cachedValidation.isFree,
        isDisposable: cachedValidation.isDisposable,
        isSpamTrap: cachedValidation.isSpamTrap,
        isAcceptAll: cachedValidation.isAcceptAll,
        isDisabled: cachedValidation.isDisabled,
        confidence: cachedValidation.confidence,
        validationTrace: cachedValidation.validationTrace,
        checkedAt: cachedValidation.checkedAt,
      })
      .onConflictDoUpdate({
        target: [verificationEmailValidations.contactId, verificationEmailValidations.emailLower],
        set: {
          provider: cachedValidation.provider,
          status: cachedValidation.status,
          syntaxValid: cachedValidation.syntaxValid,
          hasMx: cachedValidation.hasMx,
          hasSmtp: cachedValidation.hasSmtp,
          smtpAccepted: cachedValidation.smtpAccepted,
          isRole: cachedValidation.isRole,
          isFree: cachedValidation.isFree,
          isDisposable: cachedValidation.isDisposable,
          isSpamTrap: cachedValidation.isSpamTrap,
          isAcceptAll: cachedValidation.isAcceptAll,
          isDisabled: cachedValidation.isDisabled,
          confidence: cachedValidation.confidence,
          validationTrace: cachedValidation.validationTrace,
          checkedAt: cachedValidation.checkedAt,
        }
      });

      // Persist cached validation status to contact record for real-time access
      await persistEmailStatusToContact(
        contactId,
        cachedValidation.status,
        cachedValidation.confidence ?? 50
      );

      return {
        status: cachedValidation.status,
        syntaxValid: cachedValidation.syntaxValid ?? false,
        hasMx: cachedValidation.hasMx ?? false,
        hasSmtp: cachedValidation.hasSmtp ?? false,
        smtpAccepted: cachedValidation.smtpAccepted ?? undefined,
        isRole: cachedValidation.isRole ?? false,
        isFree: cachedValidation.isFree ?? false,
        isDisposable: cachedValidation.isDisposable ?? false,
        isSpamTrap: cachedValidation.isSpamTrap ?? false,
        isAcceptAll: cachedValidation.isAcceptAll ?? false,
        isDisabled: cachedValidation.isDisabled ?? false,
        confidence: cachedValidation.confidence ?? 50,
        trace: cachedValidation.validationTrace as any || {},
        validatedAt: cachedValidation.checkedAt,
      };
    }
  }

  // Cache disabled or cache miss - perform new validation
  console.log(`[EmailValidation] ${options.useCache === false ? 'Cache disabled' : 'Cache MISS'} for ${email} - performing new validation`);
  
  // Run validation
  const validation = await validateEmail(email, options);
  
  // Store result
  await db
    .insert(verificationEmailValidations)
    .values({
      contactId,
      emailLower,
      provider,
      status: validation.status,
      syntaxValid: validation.syntaxValid,
      hasMx: validation.hasMx,
      hasSmtp: validation.hasSmtp,
      smtpAccepted: validation.smtpAccepted,
      isRole: validation.isRole,
      isFree: validation.isFree,
      isDisposable: validation.isDisposable,
      isSpamTrap: validation.isSpamTrap,
      isAcceptAll: validation.isAcceptAll,
      isDisabled: validation.isDisabled,
      confidence: validation.confidence,
      validationTrace: validation.trace as any,
    })
    .onConflictDoUpdate({
      target: [verificationEmailValidations.contactId, verificationEmailValidations.emailLower],
      set: {
        provider,
        status: validation.status,
        syntaxValid: validation.syntaxValid,
        hasMx: validation.hasMx,
        hasSmtp: validation.hasSmtp,
        smtpAccepted: validation.smtpAccepted,
        isRole: validation.isRole,
        isFree: validation.isFree,
        isDisposable: validation.isDisposable,
        isSpamTrap: validation.isSpamTrap,
        isAcceptAll: validation.isAcceptAll,
        isDisabled: validation.isDisabled,
        confidence: validation.confidence,
        validationTrace: validation.trace as any,
        checkedAt: new Date(),
      }
    });
  
  // Persist validation status to contact record for real-time access
  await persistEmailStatusToContact(
    contactId,
    validation.status,
    validation.confidence
  );
  
  return { ...validation, validatedAt: new Date() };
}

/**
 * 3-Layer Email Validation Orchestrator
 * 
 * LAYER 1: In-House Fast Validation (0.0001s per email)
 * - Syntax check
 * - Free email vs business domain
 * - Disposable email provider
 * - Role email (info@, sales@)
 * - DNS Lookup (MX records)
 * 
 * LAYER 2: Third-Party API Deep Verification (Kickbox)
 * - Only called if Layer 1 passes (cost optimization - saves 90% of API cost)
 * - Catch-all detection
 * - Accept-all domain identification
 * - Risk score (Sendex)
 * - SMTP inbox verification
 * - Bounce detection
 * - Spam-trap patterns
 * - Hidden disposable detection
 * 
 * LAYER 3: Smart Caching
 * - Cross-campaign cache by email_lower + provider
 * - Domain cache for DNS/MX lookups
 */

import { 
  getKickboxClient, 
  mapKickboxResultToStatus, 
  mapKickboxResultToRiskLevel,
  determineEmailEligibility,
  type KickboxVerifyResponse 
} from '../integrations/kickbox';

export interface Layer1Result {
  passed: boolean;
  status: EmailValidationStatus;
  confidence: number;
  syntaxValid: boolean;
  hasMx: boolean;
  isRole: boolean;
  isFree: boolean;
  isDisposable: boolean;
  isSpamTrap: boolean;
  isBusinessEmail: boolean;
  failReason?: string;
  trace: ValidationResult['trace'];
}

export interface Layer2Result {
  status: EmailValidationStatus;
  confidence: number;
  kickboxResult: string;
  kickboxReason: string;
  kickboxScore: number;
  kickboxDisposable: boolean;
  kickboxAcceptAll: boolean;
  kickboxFree: boolean;
  kickboxRole: boolean;
  kickboxDidYouMean: string | null;
  riskLevel: 'low' | 'medium' | 'high' | 'unknown';
  isBusinessEmail: boolean;
  emailEligible: boolean;
  eligibilityReason: string;
  rawResponse: KickboxVerifyResponse;
}

export interface ThreeLayerValidationResult {
  // Final status
  status: EmailValidationStatus;
  confidence: number;
  
  // Layer 1 results
  layer1: Layer1Result;
  
  // Layer 2 results (if performed)
  layer2?: Layer2Result;
  
  // Business logic flags
  isBusinessEmail: boolean;
  emailEligible: boolean;
  eligibilityReason: string;
  riskLevel: 'low' | 'medium' | 'high' | 'unknown';
  
  // Provider used (Kickbox is the only provider)
  provider: 'kickbox';
  
  // Timing
  validatedAt: Date;
  deepVerifiedAt?: Date;
}

/**
 * Run Layer 1: In-House Fast Validation
 * This is the gate that determines if Layer 2 should be called
 */
export async function runLayer1Validation(
  email: string,
  options: { skipSmtp?: boolean } = {}
): Promise {
  const { skipSmtp = true } = options; // Default to skipping SMTP for Layer 1
  
  // Stage 1: Syntax check
  const parsed = parseEmail(email);
  if (!parsed.ok || !parsed.local || !parsed.domain) {
    return {
      passed: false,
      status: 'invalid',
      confidence: 100,
      syntaxValid: false,
      hasMx: false,
      isRole: false,
      isFree: false,
      isDisposable: false,
      isSpamTrap: false,
      isBusinessEmail: false,
      failReason: parsed.reason || 'invalid_syntax',
      trace: { syntax: { ok: false, reason: parsed.reason } }
    };
  }
  
  // Stage 2: DNS/MX lookup
  const dnsResult = await resolveDomain(parsed.domain);
  if (!dnsResult.hasMX && !dnsResult.hasA) {
    return {
      passed: false,
      status: 'invalid',
      confidence: 95,
      syntaxValid: true,
      hasMx: false,
      isRole: false,
      isFree: false,
      isDisposable: false,
      isSpamTrap: false,
      isBusinessEmail: false,
      failReason: 'no_mx_record',
      trace: { syntax: { ok: true }, dns: dnsResult }
    };
  }
  
  // Stage 3: Risk checks
  const risk = checkRisks(parsed.local, parsed.domain);
  
  // Immediate rejection for spam traps and disposable
  if (risk.isSpamTrap) {
    return {
      passed: false,
      status: 'invalid',
      confidence: 100,
      syntaxValid: true,
      hasMx: true,
      isRole: risk.isRole,
      isFree: risk.isFree,
      isDisposable: risk.isDisposable,
      isSpamTrap: true,
      isBusinessEmail: false,
      failReason: 'spam_trap',
      trace: { syntax: { ok: true }, dns: dnsResult, risk }
    };
  }
  
  if (risk.isDisposable) {
    return {
      passed: false,
      status: 'invalid',
      confidence: 100,
      syntaxValid: true,
      hasMx: true,
      isRole: risk.isRole,
      isFree: risk.isFree,
      isDisposable: true,
      isSpamTrap: false,
      isBusinessEmail: false,
      failReason: 'disposable_email',
      trace: { syntax: { ok: true }, dns: dnsResult, risk }
    };
  }
  
  // Determine if this is a business email (not free, not disposable)
  const isBusinessEmail = !risk.isFree && !risk.isDisposable;
  
  // Calculate confidence based on available data
  let confidence = 70;
  let status: EmailValidationStatus = 'valid';
  
  // Role accounts and free providers are acceptable but with lower confidence
  if (risk.isRole || risk.isFree) {
    status = 'acceptable';
    confidence = 65;
  }
  
  return {
    passed: true,
    status,
    confidence,
    syntaxValid: true,
    hasMx: dnsResult.hasMX,
    isRole: risk.isRole,
    isFree: risk.isFree,
    isDisposable: false,
    isSpamTrap: false,
    isBusinessEmail,
    trace: { syntax: { ok: true }, dns: dnsResult, risk }
  };
}

/**
 * Run Layer 2: Kickbox Deep Verification
 * Only called if Layer 1 passes and Kickbox is configured
 */
export async function runLayer2Validation(
  email: string,
  layer1Result: Layer1Result
): Promise {
  const kickbox = getKickboxClient();
  
  if (!kickbox) {
    console.log('[EmailValidation] Kickbox not configured, skipping Layer 2');
    return null;
  }
  
  // Only proceed if Layer 1 passed
  if (!layer1Result.passed) {
    console.log('[EmailValidation] Layer 1 failed, skipping Layer 2');
    return null;
  }
  
  // Cost optimization: Only send business emails to Kickbox
  // Free emails are rejected at eligibility level anyway
  if (!layer1Result.isBusinessEmail) {
    console.log('[EmailValidation] Non-business email, skipping Layer 2 (cost optimization)');
    return null;
  }
  
  try {
    console.log(`[EmailValidation] Running Layer 2 (Kickbox) for ${email}`);
    const kickboxResult = await kickbox.verifyEmail(email);
    
    const status = mapKickboxResultToStatus(kickboxResult);
    const riskLevel = mapKickboxResultToRiskLevel(kickboxResult);
    const isBusinessEmail = !kickboxResult.free && !kickboxResult.disposable;
    const eligibility = determineEmailEligibility(kickboxResult, layer1Result.passed);
    
    // Calculate confidence based on Kickbox Sendex score (sendex is 0-1, convert to 0-100)
    let confidence = Math.round((kickboxResult.sendex || 0.5) * 100);
    if (kickboxResult.result === 'deliverable') {
      confidence = Math.max(confidence, 85);
    } else if (kickboxResult.result === 'risky') {
      confidence = Math.min(confidence, 70);
    } else if (kickboxResult.result === 'undeliverable') {
      confidence = Math.max(confidence, 90);
    }
    
    return {
      status,
      confidence,
      kickboxResult: kickboxResult.result,
      kickboxReason: kickboxResult.reason,
      kickboxScore: kickboxResult.sendex,
      kickboxDisposable: kickboxResult.disposable,
      kickboxAcceptAll: kickboxResult.accept_all,
      kickboxFree: kickboxResult.free,
      kickboxRole: kickboxResult.role,
      kickboxDidYouMean: kickboxResult.did_you_mean,
      riskLevel,
      isBusinessEmail,
      emailEligible: eligibility.eligible,
      eligibilityReason: eligibility.reason,
      rawResponse: kickboxResult
    };
  } catch (error) {
    console.error('[EmailValidation] Layer 2 (Kickbox) failed:', error);
    return null;
  }
}

/**
 * 3-Layer Email Validation Orchestrator
 * Runs Layer 1, then conditionally Layer 2 (Kickbox)
 */
export async function validateEmail3Layer(
  email: string,
  options: {
    skipSmtp?: boolean;
    useCache?: boolean;
  } = {}
): Promise {
  const { skipSmtp = true } = options;
  
  const validatedAt = new Date();
  
  // Layer 1: Fast in-house validation
  const layer1 = await runLayer1Validation(email, { skipSmtp });
  
  // If Layer 1 fails, return immediately
  if (!layer1.passed) {
    return {
      status: layer1.status,
      confidence: layer1.confidence,
      layer1,
      isBusinessEmail: layer1.isBusinessEmail,
      emailEligible: false,
      eligibilityReason: layer1.failReason || 'failed_layer1',
      riskLevel: layer1.isSpamTrap || layer1.isDisposable ? 'high' : 'unknown',
      provider: 'kickbox',
      validatedAt
    };
  }
  
  // Layer 2: Kickbox deep verification (if enabled and available)
  let layer2: Layer2Result | null = null;
  let deepVerifiedAt: Date | undefined;
  
  // Always run Kickbox deep verification for business emails
  if (layer1.isBusinessEmail) {
    layer2 = await runLayer2Validation(email, layer1);
    if (layer2) {
      deepVerifiedAt = new Date();
    }
  }
  
  // Determine final result
  if (layer2) {
    // Layer 2 result takes precedence
    return {
      status: layer2.status,
      confidence: layer2.confidence,
      layer1,
      layer2,
      isBusinessEmail: layer2.isBusinessEmail,
      emailEligible: layer2.emailEligible,
      eligibilityReason: layer2.eligibilityReason,
      riskLevel: layer2.riskLevel,
      provider: 'kickbox',
      validatedAt,
      deepVerifiedAt
    };
  } else {
    // Layer 1 only result
    // Determine eligibility based on Layer 1
    const emailEligible = layer1.passed && layer1.isBusinessEmail && !layer1.isDisposable;
    let eligibilityReason = 'layer1_passed';
    
    if (!layer1.isBusinessEmail) {
      eligibilityReason = 'free_email_provider';
    } else if (layer1.isRole) {
      eligibilityReason = 'role_account';
    }
    
    return {
      status: layer1.status,
      confidence: layer1.confidence,
      layer1,
      isBusinessEmail: layer1.isBusinessEmail,
      emailEligible,
      eligibilityReason,
      riskLevel: layer1.isFree ? 'medium' : (layer1.isRole ? 'medium' : 'low'),
      provider: 'kickbox',
      validatedAt
    };
  }
}

/**
 * Validate email with 3-layer system and store result in database
 */
export async function validateAndStore3Layer(
  contactId: string,
  email: string,
  options: {
    skipSmtp?: boolean;
    useCache?: boolean;
  } = {}
): Promise {
  const emailLower = email.toLowerCase().trim();
  const { useCache = true } = options;
  
  // Check cache first (Layer 3)
  if (useCache) {
    const [cachedValidation] = await db
      .select()
      .from(verificationEmailValidations)
      .where(eq(verificationEmailValidations.emailLower, emailLower))
      .orderBy(desc(verificationEmailValidations.checkedAt))
      .limit(1);
    
    if (cachedValidation) {
      // Check if we need to upgrade to Kickbox (if cached result was Layer 1 only)
      const needsKickbox = 
        !cachedValidation.deepVerifiedAt && 
        cachedValidation.isBusinessEmail;
      
      if (!needsKickbox) {
        console.log(`[EmailValidation] Cache HIT for ${email} (provider: ${cachedValidation.provider})`);
        
        // Build result from cache
        const layer1: Layer1Result = {
          passed: cachedValidation.status !== 'invalid',
          status: cachedValidation.status,
          confidence: cachedValidation.confidence ?? 50,
          syntaxValid: cachedValidation.syntaxValid ?? true,
          hasMx: cachedValidation.hasMx ?? true,
          isRole: cachedValidation.isRole ?? false,
          isFree: cachedValidation.isFree ?? false,
          isDisposable: cachedValidation.isDisposable ?? false,
          isSpamTrap: cachedValidation.isSpamTrap ?? false,
          isBusinessEmail: cachedValidation.isBusinessEmail ?? false,
          trace: cachedValidation.validationTrace as any || {}
        };
        
        const result: ThreeLayerValidationResult = {
          status: cachedValidation.status,
          confidence: cachedValidation.confidence ?? 50,
          layer1,
          isBusinessEmail: cachedValidation.isBusinessEmail ?? false,
          emailEligible: cachedValidation.emailEligible ?? false,
          eligibilityReason: cachedValidation.eligibilityReason ?? 'cached',
          riskLevel: (cachedValidation.riskLevel as any) ?? 'unknown',
          provider: 'kickbox',
          validatedAt: cachedValidation.checkedAt,
          deepVerifiedAt: cachedValidation.deepVerifiedAt ?? undefined
        };
        
        // If this is a different contact, store the cached result for this contact too
        if (cachedValidation.contactId !== contactId) {
          await db.insert(verificationEmailValidations)
            .values({
              contactId,
              emailLower,
              provider: cachedValidation.provider,
              status: cachedValidation.status,
              syntaxValid: cachedValidation.syntaxValid,
              hasMx: cachedValidation.hasMx,
              hasSmtp: cachedValidation.hasSmtp,
              smtpAccepted: cachedValidation.smtpAccepted,
              isRole: cachedValidation.isRole,
              isFree: cachedValidation.isFree,
              isDisposable: cachedValidation.isDisposable,
              isSpamTrap: cachedValidation.isSpamTrap,
              isAcceptAll: cachedValidation.isAcceptAll,
              isDisabled: cachedValidation.isDisabled,
              confidence: cachedValidation.confidence,
              validationTrace: cachedValidation.validationTrace,
              kickboxResult: cachedValidation.kickboxResult,
              kickboxReason: cachedValidation.kickboxReason,
              kickboxScore: cachedValidation.kickboxScore,
              kickboxDisposable: cachedValidation.kickboxDisposable,
              kickboxAcceptAll: cachedValidation.kickboxAcceptAll,
              kickboxFree: cachedValidation.kickboxFree,
              kickboxRole: cachedValidation.kickboxRole,
              kickboxDidYouMean: cachedValidation.kickboxDidYouMean,
              kickboxResponse: cachedValidation.kickboxResponse,
              riskLevel: cachedValidation.riskLevel,
              isBusinessEmail: cachedValidation.isBusinessEmail,
              emailEligible: cachedValidation.emailEligible,
              eligibilityReason: cachedValidation.eligibilityReason,
              checkedAt: cachedValidation.checkedAt,
              deepVerifiedAt: cachedValidation.deepVerifiedAt,
            })
            .onConflictDoNothing();
        }
        
        // Persist to contact
        await persistEmailStatusToContact(contactId, result.status, result.confidence);
        
        return result;
      }
    }
  }
  
  // Run 3-layer validation
  console.log(`[EmailValidation] Running 3-layer validation for ${email}`);
  const result = await validateEmail3Layer(email, options);
  
  // Store result in database
  await db.insert(verificationEmailValidations)
    .values({
      contactId,
      emailLower,
      provider: result.provider,
      status: result.status,
      syntaxValid: result.layer1.syntaxValid,
      hasMx: result.layer1.hasMx,
      hasSmtp: false,
      smtpAccepted: null,
      isRole: result.layer2?.kickboxRole ?? result.layer1.isRole,
      isFree: result.layer2?.kickboxFree ?? result.layer1.isFree,
      isDisposable: result.layer2?.kickboxDisposable ?? result.layer1.isDisposable,
      isSpamTrap: result.layer1.isSpamTrap,
      isAcceptAll: result.layer2?.kickboxAcceptAll ?? false,
      isDisabled: false,
      confidence: result.confidence,
      validationTrace: result.layer1.trace as any,
      
      // Kickbox fields
      kickboxResult: result.layer2?.kickboxResult,
      kickboxReason: result.layer2?.kickboxReason,
      kickboxScore: result.layer2?.kickboxScore?.toString(),
      kickboxDisposable: result.layer2?.kickboxDisposable,
      kickboxAcceptAll: result.layer2?.kickboxAcceptAll,
      kickboxFree: result.layer2?.kickboxFree,
      kickboxRole: result.layer2?.kickboxRole,
      kickboxDidYouMean: result.layer2?.kickboxDidYouMean,
      kickboxResponse: result.layer2?.rawResponse as any,
      
      // Business logic
      riskLevel: result.riskLevel,
      isBusinessEmail: result.isBusinessEmail,
      emailEligible: result.emailEligible,
      eligibilityReason: result.eligibilityReason,
      
      checkedAt: result.validatedAt,
      deepVerifiedAt: result.deepVerifiedAt,
    })
    .onConflictDoUpdate({
      target: [verificationEmailValidations.contactId, verificationEmailValidations.emailLower],
      set: {
        provider: result.provider,
        status: result.status,
        syntaxValid: result.layer1.syntaxValid,
        hasMx: result.layer1.hasMx,
        isRole: result.layer2?.kickboxRole ?? result.layer1.isRole,
        isFree: result.layer2?.kickboxFree ?? result.layer1.isFree,
        isDisposable: result.layer2?.kickboxDisposable ?? result.layer1.isDisposable,
        isSpamTrap: result.layer1.isSpamTrap,
        isAcceptAll: result.layer2?.kickboxAcceptAll ?? false,
        confidence: result.confidence,
        validationTrace: result.layer1.trace as any,
        kickboxResult: result.layer2?.kickboxResult,
        kickboxReason: result.layer2?.kickboxReason,
        kickboxScore: result.layer2?.kickboxScore?.toString(),
        kickboxDisposable: result.layer2?.kickboxDisposable,
        kickboxAcceptAll: result.layer2?.kickboxAcceptAll,
        kickboxFree: result.layer2?.kickboxFree,
        kickboxRole: result.layer2?.kickboxRole,
        kickboxDidYouMean: result.layer2?.kickboxDidYouMean,
        kickboxResponse: result.layer2?.rawResponse as any,
        riskLevel: result.riskLevel,
        isBusinessEmail: result.isBusinessEmail,
        emailEligible: result.emailEligible,
        eligibilityReason: result.eligibilityReason,
        checkedAt: result.validatedAt,
        deepVerifiedAt: result.deepVerifiedAt,
      }
    });
  
  // Persist to contact
  await persistEmailStatusToContact(contactId, result.status, result.confidence);
  
  // Also update contact's business email fields and Kickbox results
  await db
    .update(verificationContacts)
    .set({
      isBusinessEmail: result.isBusinessEmail,
      emailRiskLevel: result.riskLevel,
      emailEligible: result.emailEligible,
      emailEligibilityReason: result.eligibilityReason,
      deepVerifiedAt: result.deepVerifiedAt,
      // Kickbox results stored directly on contact for easy access
      kickboxResult: result.layer2?.kickboxResult,
      kickboxReason: result.layer2?.kickboxReason,
      kickboxScore: result.layer2?.kickboxScore?.toString(),
      kickboxAcceptAll: result.layer2?.kickboxAcceptAll,
      kickboxDisposable: result.layer2?.kickboxDisposable,
      kickboxFree: result.layer2?.kickboxFree,
      kickboxRole: result.layer2?.kickboxRole,
      updatedAt: new Date(),
    })
    .where(eq(verificationContacts.id, contactId));
  
  return result;
}