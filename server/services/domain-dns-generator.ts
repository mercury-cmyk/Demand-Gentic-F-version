/**
 * Domain DNS Generator Service
 *
 * Generates SPF, DKIM, DMARC, and tracking CNAME records for email domains.
 * Supports Mailgun, SES, SendGrid, and custom SMTP configurations.
 */

import crypto from 'crypto';

export interface DnsRecord {
  type: 'TXT' | 'CNAME' | 'MX';
  name: string;
  value: string;
  priority?: number;
  ttl: number;
  purpose: string;
  verified: boolean;
}

export interface GeneratedDnsRecords {
  spf: DnsRecord;
  dkim: DnsRecord;
  dmarc: DnsRecord;
  tracking?: DnsRecord;
  returnPath?: DnsRecord;
  mx?: DnsRecord[];
}

export interface DnsGeneratorOptions {
  domain: string;
  subdomain?: string;
  provider: 'mailgun' | 'ses' | 'sendgrid' | 'custom';
  region?: 'US' | 'EU';
  dkimSelector?: string;
  includeTracking?: boolean;
  dmarcPolicy?: 'none' | 'quarantine' | 'reject';
  dmarcPercentage?: number;
  dmarcReportEmail?: string;
  existingSpfIncludes?: string[];
}

// Provider-specific SPF includes
const SPF_INCLUDES: Record<string, string[]> = {
  mailgun: ['include:mailgun.org'],
  mailgun_eu: ['include:eu.mailgun.org'],
  ses: ['include:amazonses.com'],
  sendgrid: ['include:sendgrid.net'],
  custom: [],
};

// Provider-specific DKIM CNAME targets
const DKIM_TARGETS: Record<string, string> = {
  mailgun: 'mailgun.org',
  mailgun_eu: 'eu.mailgun.org',
  ses: 'amazonses.com',
  sendgrid: 'sendgrid.net',
  custom: '',
};

// Tracking domain targets
const TRACKING_TARGETS: Record<string, string> = {
  mailgun: 'mailgun.org',
  mailgun_eu: 'eu.mailgun.org',
  ses: 'r.us-east-1.awstrack.me',
  sendgrid: 'sendgrid.net',
  custom: '',
};

/**
 * Generate a unique DKIM selector
 */
export function generateDkimSelector(domain: string): string {
  const hash = crypto.createHash('md5').update(`${domain}-${Date.now()}`).digest('hex').slice(0, 8);
  return `mg${hash}`;
}

/**
 * Generate a secure verification code for domain ownership
 */
export function generateSecureCode(): string {
  return `dg-verify-${crypto.randomBytes(16).toString('hex')}`;
}

/**
 * Generate SPF record
 */
export function generateSpfRecord(options: DnsGeneratorOptions): DnsRecord {
  const providerKey = options.provider === 'mailgun' && options.region === 'EU'
    ? 'mailgun_eu'
    : options.provider;

  const includes = [
    ...(options.existingSpfIncludes || []),
    ...SPF_INCLUDES[providerKey],
  ];

  // Deduplicate includes
  const uniqueIncludes = [...new Set(includes)];

  // Build SPF record
  const spfParts = ['v=spf1'];
  uniqueIncludes.forEach(inc => {
    if (inc.startsWith('include:')) {
      spfParts.push(inc);
    } else {
      spfParts.push(`include:${inc}`);
    }
  });
  spfParts.push('~all'); // Soft fail for unmatched

  const fullDomain = options.subdomain
    ? `${options.subdomain}.${options.domain}`
    : options.domain;

  return {
    type: 'TXT',
    name: fullDomain,
    value: spfParts.join(' '),
    ttl: 3600,
    purpose: 'SPF - Specifies which mail servers are authorized to send email on behalf of your domain',
    verified: false,
  };
}

/**
 * Generate DKIM record
 */
export function generateDkimRecord(options: DnsGeneratorOptions & { selector: string }): DnsRecord {
  const providerKey = options.provider === 'mailgun' && options.region === 'EU'
    ? 'mailgun_eu'
    : options.provider;

  const fullDomain = options.subdomain
    ? `${options.subdomain}.${options.domain}`
    : options.domain;

  // For Mailgun, DKIM is a CNAME pointing to their servers
  if (options.provider === 'mailgun') {
    return {
      type: 'CNAME',
      name: `${options.selector}._domainkey.${fullDomain}`,
      value: `${options.selector}.${fullDomain}.${DKIM_TARGETS[providerKey]}`,
      ttl: 3600,
      purpose: 'DKIM - Adds a digital signature to emails to verify they haven\'t been altered',
      verified: false,
    };
  }

  // For SES, similar CNAME approach
  if (options.provider === 'ses') {
    return {
      type: 'CNAME',
      name: `${options.selector}._domainkey.${fullDomain}`,
      value: `${options.selector}.dkim.${DKIM_TARGETS.ses}`,
      ttl: 3600,
      purpose: 'DKIM - Adds a digital signature to emails to verify they haven\'t been altered',
      verified: false,
    };
  }

  // For SendGrid
  if (options.provider === 'sendgrid') {
    return {
      type: 'CNAME',
      name: `s1._domainkey.${fullDomain}`,
      value: `s1.domainkey.u12345.wl12345.sendgrid.net`,
      ttl: 3600,
      purpose: 'DKIM - Adds a digital signature to emails to verify they haven\'t been altered',
      verified: false,
    };
  }

  // Custom provider - return placeholder
  return {
    type: 'TXT',
    name: `${options.selector}._domainkey.${fullDomain}`,
    value: 'v=DKIM1; k=rsa; p=YOUR_PUBLIC_KEY_HERE',
    ttl: 3600,
    purpose: 'DKIM - Adds a digital signature to emails to verify they haven\'t been altered',
    verified: false,
  };
}

/**
 * Generate DMARC record
 */
export function generateDmarcRecord(options: DnsGeneratorOptions): DnsRecord {
  const policy = options.dmarcPolicy || 'none';
  const percentage = options.dmarcPercentage || 100;
  const reportEmail = options.dmarcReportEmail || `dmarc-reports@${options.domain}`;

  const fullDomain = options.subdomain
    ? `${options.subdomain}.${options.domain}`
    : options.domain;

  // Build DMARC record
  const dmarcParts = [
    'v=DMARC1',
    `p=${policy}`,
    `pct=${percentage}`,
    `rua=mailto:${reportEmail}`,
    'sp=none', // Subdomain policy
    'aspf=r', // Relaxed SPF alignment
    'adkim=r', // Relaxed DKIM alignment
  ];

  return {
    type: 'TXT',
    name: `_dmarc.${fullDomain}`,
    value: dmarcParts.join('; '),
    ttl: 3600,
    purpose: 'DMARC - Tells receiving servers how to handle emails that fail SPF/DKIM checks',
    verified: false,
  };
}

/**
 * Generate tracking domain CNAME
 */
export function generateTrackingRecord(options: DnsGeneratorOptions): DnsRecord | null {
  if (!options.includeTracking) return null;

  const providerKey = options.provider === 'mailgun' && options.region === 'EU'
    ? 'mailgun_eu'
    : options.provider;

  const target = TRACKING_TARGETS[providerKey];
  if (!target) return null;

  const fullDomain = options.subdomain
    ? `${options.subdomain}.${options.domain}`
    : options.domain;

  return {
    type: 'CNAME',
    name: `email.${fullDomain}`,
    value: target === TRACKING_TARGETS.mailgun_eu
      ? `eu.mailgun.org`
      : `mailgun.org`,
    ttl: 3600,
    purpose: 'Tracking - Enables open and click tracking for your emails',
    verified: false,
  };
}

/**
 * Generate return-path/bounce domain record
 */
export function generateReturnPathRecord(options: DnsGeneratorOptions): DnsRecord | null {
  if (options.provider !== 'mailgun') return null;

  const providerKey = options.region === 'EU' ? 'mailgun_eu' : 'mailgun';

  const fullDomain = options.subdomain
    ? `${options.subdomain}.${options.domain}`
    : options.domain;

  return {
    type: 'CNAME',
    name: `bounce.${fullDomain}`,
    value: providerKey === 'mailgun_eu' ? 'eu.mailgun.org' : 'mailgun.org',
    ttl: 3600,
    purpose: 'Return-Path - Handles bounce notifications for your domain',
    verified: false,
  };
}

/**
 * Generate all DNS records for a domain
 */
export function generateAllDnsRecords(options: DnsGeneratorOptions): GeneratedDnsRecords {
  const selector = options.dkimSelector || generateDkimSelector(options.domain);

  return {
    spf: generateSpfRecord(options),
    dkim: generateDkimRecord({ ...options, selector }),
    dmarc: generateDmarcRecord(options),
    tracking: generateTrackingRecord(options) || undefined,
    returnPath: generateReturnPathRecord(options) || undefined,
  };
}

/**
 * Format DNS records for display in UI
 */
export function formatDnsRecordsForDisplay(records: GeneratedDnsRecords): {
  records: Array<{
    type: string;
    name: string;
    value: string;
    purpose: string;
    priority?: string;
  }>;
  instructions: string[];
} {
  const formattedRecords: Array<{
    type: string;
    name: string;
    value: string;
    purpose: string;
    priority?: string;
  }> = [];

  // Add SPF
  formattedRecords.push({
    type: records.spf.type,
    name: records.spf.name,
    value: records.spf.value,
    purpose: records.spf.purpose,
  });

  // Add DKIM
  formattedRecords.push({
    type: records.dkim.type,
    name: records.dkim.name,
    value: records.dkim.value,
    purpose: records.dkim.purpose,
  });

  // Add DMARC
  formattedRecords.push({
    type: records.dmarc.type,
    name: records.dmarc.name,
    value: records.dmarc.value,
    purpose: records.dmarc.purpose,
  });

  // Add tracking if present
  if (records.tracking) {
    formattedRecords.push({
      type: records.tracking.type,
      name: records.tracking.name,
      value: records.tracking.value,
      purpose: records.tracking.purpose,
    });
  }

  // Add return path if present
  if (records.returnPath) {
    formattedRecords.push({
      type: records.returnPath.type,
      name: records.returnPath.name,
      value: records.returnPath.value,
      purpose: records.returnPath.purpose,
    });
  }

  const instructions = [
    '1. Log in to your DNS provider (e.g., Cloudflare, GoDaddy, Route 53)',
    '2. Navigate to DNS management for your domain',
    '3. Add each record exactly as shown above',
    '4. Wait for DNS propagation (can take up to 48 hours, usually faster)',
    '5. Return here and click "Verify DNS Records" to confirm setup',
    '',
    'Note: If you already have an SPF record, merge the includes rather than creating a duplicate.',
    'Only one SPF record is allowed per domain.',
  ];

  return { records: formattedRecords, instructions };
}

/**
 * Get warmup schedule recommendations based on domain age and current sending volume
 */
export function getWarmupSchedule(options: {
  isNewDomain: boolean;
  currentDailyVolume: number;
  targetDailyVolume: number;
}): Array<{ day: number; targetVolume: number; notes: string }> {
  const { isNewDomain, currentDailyVolume, targetDailyVolume } = options;

  // Standard warmup schedule for new domains
  if (isNewDomain || currentDailyVolume === 0) {
    return [
      { day: 1, targetVolume: 50, notes: 'Start with highly engaged contacts' },
      { day: 2, targetVolume: 100, notes: 'Monitor bounce rates closely' },
      { day: 3, targetVolume: 200, notes: 'Check spam complaint rates' },
      { day: 4, targetVolume: 350, notes: 'Review engagement metrics' },
      { day: 5, targetVolume: 500, notes: 'Scale if metrics are healthy' },
      { day: 6, targetVolume: 750, notes: 'Continue monitoring' },
      { day: 7, targetVolume: 1000, notes: 'End of week 1 - evaluate' },
      { day: 8, targetVolume: 1500, notes: 'Week 2 - gradual increase' },
      { day: 9, targetVolume: 2000, notes: 'Monitor deliverability' },
      { day: 10, targetVolume: 2500, notes: 'Check inbox placement' },
      { day: 11, targetVolume: 3000, notes: 'Review authentication status' },
      { day: 12, targetVolume: 4000, notes: 'Approaching target volume' },
      { day: 13, targetVolume: 5000, notes: 'Final warmup phase' },
      { day: 14, targetVolume: Math.min(targetDailyVolume, 10000), notes: 'Warmup complete - normal sending' },
    ];
  }

  // Accelerated warmup for established domains
  const startVolume = Math.max(currentDailyVolume, 100);
  const dailyIncrease = Math.ceil((targetDailyVolume - startVolume) / 7);

  return Array.from({ length: 7 }, (_, i) => ({
    day: i + 1,
    targetVolume: Math.min(startVolume + (dailyIncrease * (i + 1)), targetDailyVolume),
    notes: i === 6 ? 'Warmup complete' : 'Monitor engagement metrics',
  }));
}

export const domainDnsGenerator = {
  generateDkimSelector,
  generateSecureCode,
  generateSpfRecord,
  generateDkimRecord,
  generateDmarcRecord,
  generateTrackingRecord,
  generateReturnPathRecord,
  generateAllDnsRecords,
  formatDnsRecordsForDisplay,
  getWarmupSchedule,
};
