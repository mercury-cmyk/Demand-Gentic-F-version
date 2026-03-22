/**
 * Domain Validator Service
 *
 * Performs DNS lookups to verify SPF, DKIM, DMARC, and tracking records.
 * Validates domain configuration against expected values.
 */

import dns from 'dns';
import { promisify } from 'util';

const resolveTxt = promisify(dns.resolveTxt);
const resolveCname = promisify(dns.resolveCname);
const resolveMx = promisify(dns.resolveMx);

export interface ValidationResult {
  valid: boolean;
  status: 'verified' | 'pending' | 'failed' | 'partial';
  message: string;
  details?: Record;
  recordFound?: string;
  expectedValue?: string;
  timestamp: Date;
}

export interface DomainValidationResults {
  domain: string;
  overall: ValidationResult;
  spf: ValidationResult;
  dkim: ValidationResult;
  dmarc: ValidationResult;
  tracking?: ValidationResult;
  mx?: ValidationResult;
}

/**
 * Validate SPF record for a domain
 */
export async function validateSpf(
  domain: string,
  expectedIncludes: string[] = []
): Promise {
  try {
    const records = await resolveTxt(domain);
    const spfRecords = records
      .flat()
      .filter(r => r.startsWith('v=spf1'));

    if (spfRecords.length === 0) {
      return {
        valid: false,
        status: 'failed',
        message: 'No SPF record found',
        timestamp: new Date(),
      };
    }

    if (spfRecords.length > 1) {
      return {
        valid: false,
        status: 'failed',
        message: 'Multiple SPF records found - only one is allowed',
        details: { records: spfRecords },
        timestamp: new Date(),
      };
    }

    const spfRecord = spfRecords[0];

    // Check for expected includes
    const missingIncludes = expectedIncludes.filter(inc => {
      const normalized = inc.startsWith('include:') ? inc : `include:${inc}`;
      return !spfRecord.includes(normalized);
    });

    if (missingIncludes.length > 0) {
      return {
        valid: false,
        status: 'partial',
        message: 'SPF record found but missing required includes',
        recordFound: spfRecord,
        details: { missingIncludes },
        timestamp: new Date(),
      };
    }

    // Check for proper termination
    if (!spfRecord.includes('~all') && !spfRecord.includes('-all') && !spfRecord.includes('?all')) {
      return {
        valid: false,
        status: 'partial',
        message: 'SPF record found but missing ~all/-all terminator',
        recordFound: spfRecord,
        timestamp: new Date(),
      };
    }

    return {
      valid: true,
      status: 'verified',
      message: 'SPF record verified successfully',
      recordFound: spfRecord,
      timestamp: new Date(),
    };
  } catch (error: any) {
    if (error.code === 'ENOTFOUND' || error.code === 'ENODATA') {
      return {
        valid: false,
        status: 'failed',
        message: 'No DNS records found for domain',
        timestamp: new Date(),
      };
    }
    return {
      valid: false,
      status: 'failed',
      message: `DNS lookup failed: ${error.message}`,
      timestamp: new Date(),
    };
  }
}

/**
 * Validate DKIM record for a domain
 */
export async function validateDkim(
  domain: string,
  selector: string,
  expectedValue?: string
): Promise {
  const dkimDomain = `${selector}._domainkey.${domain}`;

  try {
    // First try CNAME (common for Mailgun, SendGrid)
    try {
      const cnameRecords = await resolveCname(dkimDomain);
      if (cnameRecords.length > 0) {
        const record = cnameRecords[0];

        if (expectedValue && !record.includes(expectedValue.replace(/\.$/, ''))) {
          return {
            valid: false,
            status: 'partial',
            message: 'DKIM CNAME found but points to unexpected target',
            recordFound: record,
            expectedValue,
            timestamp: new Date(),
          };
        }

        return {
          valid: true,
          status: 'verified',
          message: 'DKIM CNAME record verified successfully',
          recordFound: record,
          timestamp: new Date(),
        };
      }
    } catch (cnameError) {
      // CNAME not found, try TXT
    }

    // Try TXT record (for direct DKIM keys)
    const txtRecords = await resolveTxt(dkimDomain);
    const dkimRecords = txtRecords
      .flat()
      .filter(r => r.includes('v=DKIM1') || r.includes('k=rsa'));

    if (dkimRecords.length === 0) {
      return {
        valid: false,
        status: 'failed',
        message: `No DKIM record found at ${dkimDomain}`,
        timestamp: new Date(),
      };
    }

    const dkimRecord = dkimRecords[0];

    // Basic validation of DKIM record structure
    if (!dkimRecord.includes('p=')) {
      return {
        valid: false,
        status: 'partial',
        message: 'DKIM record found but missing public key (p=)',
        recordFound: dkimRecord,
        timestamp: new Date(),
      };
    }

    return {
      valid: true,
      status: 'verified',
      message: 'DKIM TXT record verified successfully',
      recordFound: dkimRecord,
      timestamp: new Date(),
    };
  } catch (error: any) {
    if (error.code === 'ENOTFOUND' || error.code === 'ENODATA') {
      return {
        valid: false,
        status: 'failed',
        message: `No DKIM record found at ${dkimDomain}`,
        timestamp: new Date(),
      };
    }
    return {
      valid: false,
      status: 'failed',
      message: `DKIM lookup failed: ${error.message}`,
      timestamp: new Date(),
    };
  }
}

/**
 * Validate DMARC record for a domain
 */
export async function validateDmarc(
  domain: string,
  expectedPolicy?: 'none' | 'quarantine' | 'reject'
): Promise {
  const dmarcDomain = `_dmarc.${domain}`;

  try {
    const records = await resolveTxt(dmarcDomain);
    const dmarcRecords = records
      .flat()
      .filter(r => r.startsWith('v=DMARC1'));

    if (dmarcRecords.length === 0) {
      return {
        valid: false,
        status: 'failed',
        message: 'No DMARC record found',
        timestamp: new Date(),
      };
    }

    const dmarcRecord = dmarcRecords[0];

    // Extract policy
    const policyMatch = dmarcRecord.match(/p=(\w+)/);
    const policy = policyMatch ? policyMatch[1] : null;

    if (!policy) {
      return {
        valid: false,
        status: 'partial',
        message: 'DMARC record found but missing policy (p=)',
        recordFound: dmarcRecord,
        timestamp: new Date(),
      };
    }

    // Warn if policy is 'none' (weak)
    if (policy === 'none') {
      return {
        valid: true,
        status: 'verified',
        message: 'DMARC record found with monitoring policy (p=none). Consider upgrading to quarantine or reject.',
        recordFound: dmarcRecord,
        details: { policy, recommendation: 'Consider upgrading to p=quarantine or p=reject' },
        timestamp: new Date(),
      };
    }

    // Check expected policy if specified
    if (expectedPolicy && policy !== expectedPolicy) {
      return {
        valid: true,
        status: 'partial',
        message: `DMARC policy is '${policy}' but expected '${expectedPolicy}'`,
        recordFound: dmarcRecord,
        details: { policy, expected: expectedPolicy },
        timestamp: new Date(),
      };
    }

    return {
      valid: true,
      status: 'verified',
      message: `DMARC record verified with policy: ${policy}`,
      recordFound: dmarcRecord,
      details: { policy },
      timestamp: new Date(),
    };
  } catch (error: any) {
    if (error.code === 'ENOTFOUND' || error.code === 'ENODATA') {
      return {
        valid: false,
        status: 'failed',
        message: 'No DMARC record found',
        timestamp: new Date(),
      };
    }
    return {
      valid: false,
      status: 'failed',
      message: `DMARC lookup failed: ${error.message}`,
      timestamp: new Date(),
    };
  }
}

/**
 * Validate tracking/CNAME record
 */
export async function validateTracking(
  trackingDomain: string,
  expectedTarget?: string
): Promise {
  try {
    const records = await resolveCname(trackingDomain);

    if (records.length === 0) {
      return {
        valid: false,
        status: 'failed',
        message: `No CNAME record found for ${trackingDomain}`,
        timestamp: new Date(),
      };
    }

    const record = records[0];

    if (expectedTarget && !record.includes(expectedTarget.replace(/\.$/, ''))) {
      return {
        valid: false,
        status: 'partial',
        message: 'Tracking CNAME found but points to unexpected target',
        recordFound: record,
        expectedValue: expectedTarget,
        timestamp: new Date(),
      };
    }

    return {
      valid: true,
      status: 'verified',
      message: 'Tracking CNAME verified successfully',
      recordFound: record,
      timestamp: new Date(),
    };
  } catch (error: any) {
    if (error.code === 'ENOTFOUND' || error.code === 'ENODATA') {
      return {
        valid: false,
        status: 'failed',
        message: `No CNAME record found for ${trackingDomain}`,
        timestamp: new Date(),
      };
    }
    return {
      valid: false,
      status: 'failed',
      message: `Tracking lookup failed: ${error.message}`,
      timestamp: new Date(),
    };
  }
}

/**
 * Validate MX records for a domain
 */
export async function validateMx(domain: string): Promise {
  try {
    const records = await resolveMx(domain);

    if (records.length === 0) {
      return {
        valid: false,
        status: 'failed',
        message: 'No MX records found',
        timestamp: new Date(),
      };
    }

    // Sort by priority
    const sortedRecords = records.sort((a, b) => a.priority - b.priority);

    return {
      valid: true,
      status: 'verified',
      message: `Found ${records.length} MX record(s)`,
      details: {
        records: sortedRecords.map(r => ({
          priority: r.priority,
          exchange: r.exchange,
        })),
      },
      timestamp: new Date(),
    };
  } catch (error: any) {
    if (error.code === 'ENOTFOUND' || error.code === 'ENODATA') {
      return {
        valid: false,
        status: 'failed',
        message: 'No MX records found',
        timestamp: new Date(),
      };
    }
    return {
      valid: false,
      status: 'failed',
      message: `MX lookup failed: ${error.message}`,
      timestamp: new Date(),
    };
  }
}

/**
 * Perform full domain validation
 */
export async function validateDomain(options: {
  domain: string;
  dkimSelector: string;
  expectedSpfIncludes?: string[];
  expectedDkimTarget?: string;
  expectedDmarcPolicy?: 'none' | 'quarantine' | 'reject';
  trackingSubdomain?: string;
}): Promise {
  const { domain, dkimSelector, expectedSpfIncludes, expectedDkimTarget, expectedDmarcPolicy, trackingSubdomain } = options;

  // Run all validations in parallel
  const [spf, dkim, dmarc, mx] = await Promise.all([
    validateSpf(domain, expectedSpfIncludes),
    validateDkim(domain, dkimSelector, expectedDkimTarget),
    validateDmarc(domain, expectedDmarcPolicy),
    validateMx(domain),
  ]);

  // Optionally validate tracking
  let tracking: ValidationResult | undefined;
  if (trackingSubdomain) {
    tracking = await validateTracking(`${trackingSubdomain}.${domain}`);
  }

  // Calculate overall status
  const validations = [spf, dkim, dmarc];
  if (tracking) validations.push(tracking);

  const allValid = validations.every(v => v.valid);
  const anyFailed = validations.some(v => v.status === 'failed');
  const anyPartial = validations.some(v => v.status === 'partial');

  let overallStatus: 'verified' | 'pending' | 'failed' | 'partial';
  let overallMessage: string;

  if (allValid && !anyPartial) {
    overallStatus = 'verified';
    overallMessage = 'All DNS records verified successfully';
  } else if (anyFailed) {
    overallStatus = 'failed';
    const failedRecords = validations.filter(v => v.status === 'failed').length;
    overallMessage = `${failedRecords} record(s) failed verification`;
  } else if (anyPartial) {
    overallStatus = 'partial';
    overallMessage = 'Some records need attention';
  } else {
    overallStatus = 'pending';
    overallMessage = 'Verification in progress';
  }

  return {
    domain,
    overall: {
      valid: allValid,
      status: overallStatus,
      message: overallMessage,
      timestamp: new Date(),
    },
    spf,
    dkim,
    dmarc,
    tracking,
    mx,
  };
}

/**
 * Quick health check for a domain (faster, less detailed)
 */
export async function quickDomainHealthCheck(domain: string): Promise {
  const results = await Promise.allSettled([
    resolveTxt(domain).then(r => r.flat().some(rec => rec.startsWith('v=spf1'))),
    resolveTxt(`_dmarc.${domain}`).then(r => r.flat().some(rec => rec.startsWith('v=DMARC1'))),
    resolveMx(domain).then(r => r.length > 0),
  ]);

  const hasSpf = results[0].status === 'fulfilled' && results[0].value;
  const hasDmarc = results[1].status === 'fulfilled' && results[1].value;
  const hasMx = results[2].status === 'fulfilled' && results[2].value;

  // DKIM requires selector, so we assume it's configured if SPF is
  const hasDkim = hasSpf; // Simplified assumption

  let score = 0;
  if (hasSpf) score += 30;
  if (hasDkim) score += 30;
  if (hasDmarc) score += 30;
  if (hasMx) score += 10;

  return { hasSpf, hasDkim, hasDmarc, hasMx, score };
}

export const domainValidator = {
  validateSpf,
  validateDkim,
  validateDmarc,
  validateTracking,
  validateMx,
  validateDomain,
  quickDomainHealthCheck,
};