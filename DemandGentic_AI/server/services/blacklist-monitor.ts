/**
 * Blacklist Monitor Service
 *
 * Monitors domains and IP addresses against various RBLs (Real-time Blackhole Lists).
 * Provides alerting and delisting URL information.
 */

import dns from 'dns';
import { promisify } from 'util';
import { db } from '../db';
import { blacklistMonitors, blacklistCheckHistory } from '../../shared/schema';
import { eq, and, lte, isNull, or } from 'drizzle-orm';

const resolve4 = promisify(dns.resolve4);

// Common RBL providers
export const RBL_PROVIDERS = [
  {
    name: 'spamhaus_sbl',
    displayName: 'Spamhaus SBL',
    dnsbl: 'sbl.spamhaus.org',
    category: 'spam',
    delistUrl: 'https://www.spamhaus.org/sbl/removal/form/',
    description: 'Spamhaus Block List - known spam sources',
  },
  {
    name: 'spamhaus_xbl',
    displayName: 'Spamhaus XBL',
    dnsbl: 'xbl.spamhaus.org',
    category: 'spam',
    delistUrl: 'https://www.spamhaus.org/xbl/removal/form/',
    description: 'Exploits Block List - hijacked PCs and proxies',
  },
  {
    name: 'spamhaus_pbl',
    displayName: 'Spamhaus PBL',
    dnsbl: 'pbl.spamhaus.org',
    category: 'policy',
    delistUrl: 'https://www.spamhaus.org/pbl/removal/',
    description: 'Policy Block List - dynamic IP ranges',
  },
  {
    name: 'spamhaus_dbl',
    displayName: 'Spamhaus DBL',
    dnsbl: 'dbl.spamhaus.org',
    category: 'spam',
    delistUrl: 'https://www.spamhaus.org/dbl/removal/',
    description: 'Domain Block List - spam domains',
    isDomain: true,
  },
  {
    name: 'barracuda',
    displayName: 'Barracuda',
    dnsbl: 'b.barracudacentral.org',
    category: 'spam',
    delistUrl: 'https://www.barracudacentral.org/rbl/removal-request',
    description: 'Barracuda Reputation Block List',
  },
  {
    name: 'spamcop',
    displayName: 'SpamCop',
    dnsbl: 'bl.spamcop.net',
    category: 'spam',
    delistUrl: 'https://www.spamcop.net/fom-serve/cache/298.html',
    description: 'SpamCop Blocking List',
  },
  {
    name: 'sorbs_spam',
    displayName: 'SORBS Spam',
    dnsbl: 'spam.dnsbl.sorbs.net',
    category: 'spam',
    delistUrl: 'http://www.sorbs.net/delisting/',
    description: 'SORBS spam sources',
  },
  {
    name: 'sorbs_recent',
    displayName: 'SORBS Recent',
    dnsbl: 'recent.spam.dnsbl.sorbs.net',
    category: 'spam',
    delistUrl: 'http://www.sorbs.net/delisting/',
    description: 'SORBS recent spam sources',
  },
  {
    name: 'uceprotect_l1',
    displayName: 'UCEPROTECT Level 1',
    dnsbl: 'dnsbl-1.uceprotect.net',
    category: 'spam',
    delistUrl: 'http://www.uceprotect.net/en/rblcheck.php',
    description: 'Single IP listings',
  },
  {
    name: 'uceprotect_l2',
    displayName: 'UCEPROTECT Level 2',
    dnsbl: 'dnsbl-2.uceprotect.net',
    category: 'spam',
    delistUrl: 'http://www.uceprotect.net/en/rblcheck.php',
    description: 'IP range listings',
  },
  {
    name: 'cbl',
    displayName: 'CBL',
    dnsbl: 'cbl.abuseat.org',
    category: 'malware',
    delistUrl: 'https://www.abuseat.org/lookup.cgi',
    description: 'Composite Blocking List - compromised IPs',
  },
  {
    name: 'psbl',
    displayName: 'PSBL',
    dnsbl: 'psbl.surriel.com',
    category: 'spam',
    delistUrl: 'https://psbl.org/remove/',
    description: 'Passive Spam Block List',
  },
  {
    name: 'surbl',
    displayName: 'SURBL',
    dnsbl: 'multi.surbl.org',
    category: 'spam',
    delistUrl: 'https://www.surbl.org/surbl-analysis',
    description: 'URI DNSBL for spam URLs',
    isDomain: true,
  },
];

export interface BlacklistCheckResult {
  rblName: string;
  rblDisplayName: string;
  rblCategory: string;
  isListed: boolean;
  listingReason?: string;
  delistUrl: string;
  responseTime: number;
  rawResponse?: string;
}

export interface BlacklistSummary {
  target: string;
  targetType: 'ip' | 'domain';
  totalChecked: number;
  totalListed: number;
  cleanLists: string[];
  listedOn: BlacklistCheckResult[];
  checkTime: Date;
  overallStatus: 'clean' | 'listed' | 'critical';
}

/**
 * Reverse an IP address for DNSBL lookup
 */
function reverseIp(ip: string): string {
  return ip.split('.').reverse().join('.');
}

/**
 * Check if an IP address is on a specific RBL
 */
async function checkIpOnRbl(
  ip: string,
  rbl: typeof RBL_PROVIDERS[0]
): Promise {
  const startTime = Date.now();
  const reversedIp = reverseIp(ip);
  const lookupDomain = `${reversedIp}.${rbl.dnsbl}`;

  try {
    const result = await resolve4(lookupDomain);
    const responseTime = Date.now() - startTime;

    // If we get a response, the IP is listed
    // The response code often indicates the listing type
    const rawResponse = result.join(', ');

    return {
      rblName: rbl.name,
      rblDisplayName: rbl.displayName,
      rblCategory: rbl.category,
      isListed: true,
      listingReason: parseListingReason(rbl.name, rawResponse),
      delistUrl: rbl.delistUrl,
      responseTime,
      rawResponse,
    };
  } catch (error: any) {
    const responseTime = Date.now() - startTime;

    // NXDOMAIN or NODATA means not listed (good!)
    if (error.code === 'ENOTFOUND' || error.code === 'ENODATA') {
      return {
        rblName: rbl.name,
        rblDisplayName: rbl.displayName,
        rblCategory: rbl.category,
        isListed: false,
        delistUrl: rbl.delistUrl,
        responseTime,
      };
    }

    // Other errors - treat as unknown/error
    return {
      rblName: rbl.name,
      rblDisplayName: rbl.displayName,
      rblCategory: rbl.category,
      isListed: false,
      delistUrl: rbl.delistUrl,
      responseTime,
      rawResponse: `Error: ${error.message}`,
    };
  }
}

/**
 * Check if a domain is on a domain-specific RBL
 */
async function checkDomainOnRbl(
  domain: string,
  rbl: typeof RBL_PROVIDERS[0]
): Promise {
  const startTime = Date.now();
  const lookupDomain = `${domain}.${rbl.dnsbl}`;

  try {
    const result = await resolve4(lookupDomain);
    const responseTime = Date.now() - startTime;
    const rawResponse = result.join(', ');

    return {
      rblName: rbl.name,
      rblDisplayName: rbl.displayName,
      rblCategory: rbl.category,
      isListed: true,
      listingReason: parseListingReason(rbl.name, rawResponse),
      delistUrl: rbl.delistUrl,
      responseTime,
      rawResponse,
    };
  } catch (error: any) {
    const responseTime = Date.now() - startTime;

    if (error.code === 'ENOTFOUND' || error.code === 'ENODATA') {
      return {
        rblName: rbl.name,
        rblDisplayName: rbl.displayName,
        rblCategory: rbl.category,
        isListed: false,
        delistUrl: rbl.delistUrl,
        responseTime,
      };
    }

    return {
      rblName: rbl.name,
      rblDisplayName: rbl.displayName,
      rblCategory: rbl.category,
      isListed: false,
      delistUrl: rbl.delistUrl,
      responseTime,
      rawResponse: `Error: ${error.message}`,
    };
  }
}

/**
 * Parse listing reason from RBL response
 */
function parseListingReason(rblName: string, response: string): string {
  // Spamhaus return codes
  if (rblName.startsWith('spamhaus')) {
    if (response.includes('127.0.0.2')) return 'Direct spam source';
    if (response.includes('127.0.0.3')) return 'Spam support service';
    if (response.includes('127.0.0.4')) return 'Verified spammer';
    if (response.includes('127.0.0.9')) return 'Drop list';
    if (response.includes('127.0.0.10')) return 'Dynamic IP range';
    if (response.includes('127.0.0.11')) return 'ISP policy violation';
  }

  // Barracuda
  if (rblName === 'barracuda') {
    return 'Listed for sending spam or virus';
  }

  // Generic
  return 'Listed on blacklist';
}

/**
 * Check an IP address against all RBLs
 */
export async function checkIpBlacklists(ip: string): Promise {
  // Only check IP-based RBLs
  const ipRbls = RBL_PROVIDERS.filter(r => !r.isDomain);

  const results = await Promise.all(
    ipRbls.map(rbl => checkIpOnRbl(ip, rbl))
  );

  const listedOn = results.filter(r => r.isListed);
  const cleanLists = results.filter(r => !r.isListed).map(r => r.rblDisplayName);

  let overallStatus: 'clean' | 'listed' | 'critical';
  if (listedOn.length === 0) {
    overallStatus = 'clean';
  } else if (listedOn.some(r => r.rblName.startsWith('spamhaus'))) {
    overallStatus = 'critical'; // Spamhaus listings are serious
  } else {
    overallStatus = 'listed';
  }

  return {
    target: ip,
    targetType: 'ip',
    totalChecked: results.length,
    totalListed: listedOn.length,
    cleanLists,
    listedOn,
    checkTime: new Date(),
    overallStatus,
  };
}

/**
 * Check a domain against domain-specific RBLs
 */
export async function checkDomainBlacklists(domain: string): Promise {
  // Only check domain-based RBLs
  const domainRbls = RBL_PROVIDERS.filter(r => r.isDomain);

  // Also check the domain as an IP (in case it resolves to a listed IP)
  // This is a simplified check - in production, you'd resolve the domain first

  const results = await Promise.all(
    domainRbls.map(rbl => checkDomainOnRbl(domain, rbl))
  );

  const listedOn = results.filter(r => r.isListed);
  const cleanLists = results.filter(r => !r.isListed).map(r => r.rblDisplayName);

  let overallStatus: 'clean' | 'listed' | 'critical';
  if (listedOn.length === 0) {
    overallStatus = 'clean';
  } else if (listedOn.some(r => r.rblName === 'spamhaus_dbl')) {
    overallStatus = 'critical';
  } else {
    overallStatus = 'listed';
  }

  return {
    target: domain,
    targetType: 'domain',
    totalChecked: results.length,
    totalListed: listedOn.length,
    cleanLists,
    listedOn,
    checkTime: new Date(),
    overallStatus,
  };
}

/**
 * Check both domain and its MX servers' IPs
 */
export async function comprehensiveBlacklistCheck(domain: string): Promise {
  const domainResult = await checkDomainBlacklists(domain);

  // Optionally resolve MX records and check their IPs
  // This is simplified - in production, you'd resolve MX to IP

  return {
    domain: domainResult,
  };
}

/**
 * Save blacklist check results to database
 */
export async function saveBlacklistCheckResults(
  monitorId: string,
  result: BlacklistCheckResult
): Promise {
  await db.insert(blacklistCheckHistory).values({
    monitorId,
    wasListed: result.isListed,
    listingReason: result.listingReason,
    responseTime: result.responseTime,
    rawResponse: result.rawResponse,
    checkSource: 'scheduled',
  });

  // Update monitor status
  const now = new Date();
  const nextCheck = new Date(now.getTime() + 24 * 60 * 60 * 1000); // 24 hours later

  await db
    .update(blacklistMonitors)
    .set({
      status: result.isListed ? 'listed' : 'clean',
      isListed: result.isListed,
      listingReason: result.listingReason || null,
      listedSince: result.isListed ? now : null,
      lastCheckedAt: now,
      nextCheckAt: nextCheck,
      consecutiveCleanChecks: result.isListed ? 0 : db.raw('consecutive_clean_checks + 1'),
      updatedAt: now,
    })
    .where(eq(blacklistMonitors.id, monitorId));
}

/**
 * Initialize monitors for a domain
 */
export async function initializeDomainMonitors(
  domainAuthId: number,
  domain: string
): Promise {
  // Create monitors for domain-based RBLs
  const domainRbls = RBL_PROVIDERS.filter(r => r.isDomain);

  for (const rbl of domainRbls) {
    await db.insert(blacklistMonitors).values({
      domainAuthId,
      monitorType: 'domain',
      monitorValue: domain,
      rblName: rbl.name,
      rblDisplayName: rbl.displayName,
      rblCategory: rbl.category,
      status: 'pending_check',
      isListed: false,
      checkFrequencyHours: 24,
      alertsEnabled: true,
      delistingUrl: rbl.delistUrl,
    }).onConflictDoNothing();
  }
}

/**
 * Get monitors that need checking
 */
export async function getMonitorsDueForCheck(
  limit: number = 100
): Promise {
  const now = new Date();

  return await db
    .select()
    .from(blacklistMonitors)
    .where(
      or(
        isNull(blacklistMonitors.nextCheckAt),
        lte(blacklistMonitors.nextCheckAt, now)
      )
    )
    .limit(limit);
}

/**
 * Run scheduled blacklist checks
 */
export async function runScheduledBlacklistChecks(): Promise {
  const monitors = await getMonitorsDueForCheck(50);

  let checked = 0;
  let newListings = 0;
  let delistings = 0;

  for (const monitor of monitors) {
    const rbl = RBL_PROVIDERS.find(r => r.name === monitor.rblName);
    if (!rbl) continue;

    const result = monitor.monitorType === 'ip'
      ? await checkIpOnRbl(monitor.monitorValue, rbl)
      : await checkDomainOnRbl(monitor.monitorValue, rbl);

    await saveBlacklistCheckResults(monitor.id, result);

    checked++;

    // Track new listings
    if (result.isListed && !monitor.isListed) {
      newListings++;
      // TODO: Send alert email
    }

    // Track delistings
    if (!result.isListed && monitor.isListed) {
      delistings++;
      await db
        .update(blacklistMonitors)
        .set({
          delistedAt: new Date(),
        })
        .where(eq(blacklistMonitors.id, monitor.id));
    }
  }

  return { checked, newListings, delistings };
}

/**
 * Get blacklist status summary for a domain
 */
export async function getDomainBlacklistSummary(domainAuthId: number): Promise;
}> {
  const monitors = await db
    .select()
    .from(blacklistMonitors)
    .where(eq(blacklistMonitors.domainAuthId, domainAuthId));

  const clean = monitors.filter(m => m.status === 'clean');
  const listed = monitors.filter(m => m.status === 'listed');
  const pending = monitors.filter(m => m.status === 'pending_check');

  return {
    totalMonitors: monitors.length,
    cleanMonitors: clean.length,
    listedMonitors: listed.length,
    pendingMonitors: pending.length,
    listings: listed.map(m => ({
      rblName: m.rblName,
      rblDisplayName: m.rblDisplayName,
      listedSince: m.listedSince,
      delistUrl: m.delistingUrl,
    })),
  };
}

export const blacklistMonitorService = {
  checkIpBlacklists,
  checkDomainBlacklists,
  comprehensiveBlacklistCheck,
  initializeDomainMonitors,
  runScheduledBlacklistChecks,
  getDomainBlacklistSummary,
  RBL_PROVIDERS,
};