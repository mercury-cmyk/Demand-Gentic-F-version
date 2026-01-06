/**
 * Kickbox Email Verification API Client
 * 
 * Layer 2 of the 3-Layer Email Verification System
 * Provides deep verification capabilities:
 * - Catch-all detection
 * - Accept-all domain identification
 * - Risk scoring (Sendex score)
 * - SMTP inbox verification
 * - Bounce detection
 * - Spam-trap patterns
 * - Hidden disposable detection
 */

export interface KickboxVerifyResponse {
  result: 'deliverable' | 'undeliverable' | 'risky' | 'unknown';
  reason: string;
  role: boolean;
  free: boolean;
  disposable: boolean;
  accept_all: boolean;
  did_you_mean: string | null;
  sendex: number; // 0-100 quality score
  email: string;
  user: string;
  domain: string;
  success: boolean;
  message?: string;
}

export interface KickboxConfig {
  apiKey: string;
  baseUrl?: string;
  timeout?: number;
  retryAttempts?: number;
  retryDelayMs?: number;
}

const DEFAULT_CONFIG: Omit<Required<KickboxConfig>, 'apiKey'> = {
  baseUrl: 'https://api.kickbox.com/v2',
  timeout: 30000, // 30 seconds
  retryAttempts: 3,
  retryDelayMs: 1000,
};

/**
 * Kickbox API Client
 * Handles email verification with retry logic and rate limiting
 */
export class KickboxClient {
  private apiKey: string;
  private baseUrl: string;
  private timeout: number;
  private retryAttempts: number;
  private retryDelayMs: number;
  private requestCount: number = 0;
  private lastRequestTime: number = 0;

  constructor(config: KickboxConfig) {
    this.apiKey = config.apiKey;
    this.baseUrl = config.baseUrl || DEFAULT_CONFIG.baseUrl;
    this.timeout = config.timeout || DEFAULT_CONFIG.timeout;
    this.retryAttempts = config.retryAttempts || DEFAULT_CONFIG.retryAttempts;
    this.retryDelayMs = config.retryDelayMs || DEFAULT_CONFIG.retryDelayMs;
  }

  /**
   * Verify a single email address
   * Returns detailed verification result from Kickbox
   */
  async verifyEmail(email: string): Promise<KickboxVerifyResponse> {
    const url = `${this.baseUrl}/verify?email=${encodeURIComponent(email)}&apikey=${this.apiKey}`;
    
    let lastError: Error | null = null;
    
    for (let attempt = 1; attempt <= this.retryAttempts; attempt++) {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), this.timeout);
        
        this.requestCount++;
        this.lastRequestTime = Date.now();
        
        console.log(`[Kickbox] Verifying email: ${email} (attempt ${attempt}/${this.retryAttempts})`);
        
        const response = await fetch(url, {
          method: 'GET',
          signal: controller.signal,
          headers: {
            'Accept': 'application/json',
          },
        });
        
        clearTimeout(timeoutId);
        
        // Check for rate limiting
        if (response.status === 429) {
          const retryAfter = response.headers.get('Retry-After');
          const waitTime = retryAfter ? parseInt(retryAfter, 10) * 1000 : this.retryDelayMs * attempt;
          console.warn(`[Kickbox] Rate limited. Waiting ${waitTime}ms before retry...`);
          await this.sleep(waitTime);
          continue;
        }
        
        if (!response.ok) {
          const errorBody = await response.text();
          throw new Error(`Kickbox API error: ${response.status} ${response.statusText} - ${errorBody}`);
        }
        
        const data = await response.json() as KickboxVerifyResponse;
        
        console.log(`[Kickbox] Verification result for ${email}: ${data.result} (reason: ${data.reason}, sendex: ${data.sendex})`);
        
        return data;
      } catch (error) {
        lastError = error as Error;
        
        if (error instanceof Error && error.name === 'AbortError') {
          console.warn(`[Kickbox] Request timeout for ${email} (attempt ${attempt})`);
        } else {
          console.error(`[Kickbox] Request failed for ${email}:`, error);
        }
        
        if (attempt < this.retryAttempts) {
          await this.sleep(this.retryDelayMs * attempt);
        }
      }
    }
    
    // All retries failed - return unknown result
    console.error(`[Kickbox] All ${this.retryAttempts} attempts failed for ${email}`);
    return {
      result: 'unknown',
      reason: 'api_error',
      role: false,
      free: false,
      disposable: false,
      accept_all: false,
      did_you_mean: null,
      sendex: 0,
      email,
      user: email.split('@')[0],
      domain: email.split('@')[1] || '',
      success: false,
      message: lastError?.message || 'Unknown error',
    };
  }

  /**
   * Batch verify multiple emails (for efficiency)
   * Respects rate limits and processes sequentially with delay
   */
  async verifyEmails(emails: string[], delayBetweenMs: number = 200): Promise<Map<string, KickboxVerifyResponse>> {
    const results = new Map<string, KickboxVerifyResponse>();
    
    for (const email of emails) {
      const result = await this.verifyEmail(email);
      results.set(email, result);
      
      if (emails.indexOf(email) < emails.length - 1) {
        await this.sleep(delayBetweenMs);
      }
    }
    
    return results;
  }

  /**
   * Get the number of requests made
   */
  getRequestCount(): number {
    return this.requestCount;
  }

  /**
   * Check if API key is configured
   */
  isConfigured(): boolean {
    return !!this.apiKey && this.apiKey.length > 0;
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

/**
 * Map Kickbox result to our 4-status system
 * 
 * CONSERVATIVE APPROACH:
 * - Only mark as 'valid' when we are 100% sure it's deliverable
 * - Only mark as 'invalid' when we are 100% sure it's undeliverable
 * - Everything uncertain (risky, accept_all, catch_all, unknown) stays 'unknown'
 */
export function mapKickboxResultToStatus(
  result: KickboxVerifyResponse
): 'valid' | 'acceptable' | 'unknown' | 'invalid' {
  switch (result.result) {
    case 'deliverable':
      // Accept-all/catch-all domains: we can't verify individual mailboxes
      // These domains accept all emails, so we're NOT sure the contact is real
      if (result.accept_all) {
        return 'unknown';
      }
      // Role emails on deliverable domains are still valid (we're sure the mailbox exists)
      return 'valid';
    
    case 'risky':
      // Risky emails: we're NOT sure - could be accept_all, low_quality, etc.
      return 'unknown';
    
    case 'undeliverable':
      // Undeliverable: we are 100% sure this email is invalid
      return 'invalid';
    
    case 'unknown':
    default:
      // Unknown: we couldn't determine - stay unknown
      return 'unknown';
  }
}

/**
 * Map Kickbox result to risk level
 * Note: Kickbox sendex is a 0-1 float (1 = best), converted to 0-100 scale
 */
export function mapKickboxResultToRiskLevel(
  result: KickboxVerifyResponse
): 'low' | 'medium' | 'high' | 'unknown' {
  // Convert sendex from 0-1 to 0-100 scale
  const sendexScore = Math.round((result.sendex || 0) * 100);
  
  if (result.result === 'unknown') {
    return 'unknown';
  }
  
  if (result.result === 'undeliverable') {
    return 'high';
  }
  
  if (result.disposable) {
    return 'high';
  }
  
  if (sendexScore >= 80) {
    return 'low';
  } else if (sendexScore >= 50) {
    // Check for additional risk factors
    if (result.accept_all || result.role || result.free) {
      return 'medium';
    }
    return 'low';
  } else if (sendexScore >= 20) {
    return 'medium';
  } else {
    return 'high';
  }
}

/**
 * Determine email eligibility based on Kickbox result
 * 
 * CONSERVATIVE APPROACH - only eligible when we are 100% certain:
 * - Must pass Layer 1 (syntax, DNS)
 * - Must be deliverable (NOT risky, NOT unknown)
 * - Must NOT be accept_all/catch_all (we can't verify individual mailboxes)
 * - Must NOT be disposable
 * - Must be a business email (NOT free provider)
 */
export function determineEmailEligibility(
  result: KickboxVerifyResponse,
  layer1Passed: boolean
): { eligible: boolean; reason: string } {
  // Must pass Layer 1 first
  if (!layer1Passed) {
    return { eligible: false, reason: 'failed_layer1_validation' };
  }
  
  // Disposable emails - always NOT ELIGIBLE
  if (result.disposable) {
    return { eligible: false, reason: 'disposable_email' };
  }
  
  // Free email providers - NOT business email
  if (result.free) {
    return { eligible: false, reason: 'free_email_provider' };
  }
  
  // Undeliverable - NOT ELIGIBLE (we're 100% sure it's invalid)
  if (result.result === 'undeliverable') {
    return { eligible: false, reason: `undeliverable_${result.reason}` };
  }
  
  // Unknown - we can't determine, NOT ELIGIBLE
  if (result.result === 'unknown') {
    return { eligible: false, reason: 'verification_unknown' };
  }
  
  // Risky - we're NOT sure, NOT ELIGIBLE
  if (result.result === 'risky') {
    return { eligible: false, reason: `risky_uncertain_${result.reason}` };
  }
  
  // Deliverable - check for accept_all/catch_all
  if (result.result === 'deliverable') {
    // Accept-all/catch-all: we can't verify individual mailboxes, NOT ELIGIBLE
    if (result.accept_all) {
      return { eligible: false, reason: 'accept_all_uncertain' };
    }
    // Role emails on verified domains are still eligible
    if (result.role) {
      return { eligible: true, reason: 'deliverable_role_account' };
    }
    // Fully verified deliverable business email - ELIGIBLE
    return { eligible: true, reason: 'deliverable_verified' };
  }
  
  // Fallback - unknown case, NOT ELIGIBLE
  return { eligible: false, reason: 'verification_uncertain' };
}

/**
 * Create a Kickbox client from environment variables
 */
export function createKickboxClient(): KickboxClient | null {
  const apiKey = process.env.KICKBOX_API_KEY;
  
  if (!apiKey) {
    console.warn('[Kickbox] API key not configured. Deep verification will be skipped.');
    return null;
  }
  
  return new KickboxClient({
    apiKey,
    timeout: Number(process.env.KICKBOX_TIMEOUT_MS) || 30000,
    retryAttempts: Number(process.env.KICKBOX_RETRY_ATTEMPTS) || 3,
  });
}

// Singleton instance
let kickboxClientInstance: KickboxClient | null = null;

/**
 * Get or create the Kickbox client singleton
 */
export function getKickboxClient(): KickboxClient | null {
  if (kickboxClientInstance === null) {
    kickboxClientInstance = createKickboxClient();
  }
  return kickboxClientInstance;
}

/**
 * Check if Kickbox is available
 */
export function isKickboxAvailable(): boolean {
  return !!process.env.KICKBOX_API_KEY;
}
