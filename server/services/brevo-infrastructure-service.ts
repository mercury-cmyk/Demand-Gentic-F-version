import { eq } from 'drizzle-orm';
import { db } from '../db';
import {
  domainAuth,
  domainHealthScores,
  senderProfiles,
} from '@shared/schema';
import {
  bindDomainToCampaignEmailProvider,
  bindSenderProfileToCampaignEmailProvider,
  getCampaignEmailProvider,
  getCampaignEmailProviderBindingForDomain,
  getCampaignEmailProviderBindingForSender,
} from './campaign-email-provider-service';

type BrevoProvider = NonNullable<Awaited<ReturnType<typeof getCampaignEmailProvider>>>;

interface BrevoRequestOptions extends RequestInit {
  allow404?: boolean;
}

export interface BrevoInfrastructureMatch {
  id: string | number;
  label: string;
  providerId: string | null;
  providerName: string | null;
}

export interface BrevoManagedSender {
  id: string;
  name: string;
  email: string;
  domain: string | null;
  active: boolean | null;
  verified: boolean | null;
  ips: string[];
  localMatch: BrevoInfrastructureMatch | null;
  raw: Record<string, unknown>;
}

export interface BrevoManagedDomain {
  id: string;
  domain: string;
  authenticated: boolean | null;
  verified: boolean | null;
  status: string | null;
  dnsRecords: Array<{
    type: string;
    name: string;
    value: string;
    status: string | null;
  }>;
  localMatch: BrevoInfrastructureMatch | null;
  raw: Record<string, unknown>;
}

export interface BrevoDedicatedIp {
  id: string;
  ip: string;
  name: string | null;
  domain: string | null;
  status: string | null;
  warmupStatus: string | null;
  weight: number | null;
  raw: Record<string, unknown>;
}

export interface BrevoInfrastructureOverview {
  provider: {
    id: string;
    name: string;
    source: 'database' | 'environment';
  };
  capabilities: {
    canManageSenders: boolean;
    canManageDomains: boolean;
    canManageDedicatedIpAssignments: boolean;
    canProvisionDedicatedIps: boolean;
  };
  stats: {
    senderCount: number;
    domainCount: number;
    dedicatedIpCount: number;
    matchedLocalSenders: number;
    matchedLocalDomains: number;
  };
  senders: BrevoManagedSender[];
  domains: BrevoManagedDomain[];
  dedicatedIps: BrevoDedicatedIp[];
  sectionErrors: {
    senders: string | null;
    domains: string | null;
    dedicatedIps: string | null;
  };
  syncedAt: string;
}

export interface BrevoSyncResult {
  importedSenders: number;
  updatedSenders: number;
  importedDomains: number;
  updatedDomains: number;
  skipped: string[];
}

function normalizeEmail(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const normalized = value.trim().toLowerCase();
  return normalized || null;
}

function normalizeDomainName(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const normalized = value.trim().toLowerCase().replace(/\.$/, '');
  return normalized || null;
}

function parseBoolean(value: unknown): boolean | null {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return value !== 0;
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    if (['true', '1', 'yes', 'verified', 'authenticated', 'active'].includes(normalized)) return true;
    if (['false', '0', 'no', 'pending', 'inactive', 'failed'].includes(normalized)) return false;
  }
  return null;
}

function parseNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function coerceRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function arrayFromPayload(payload: unknown, candidateKeys: string[]): unknown[] {
  if (Array.isArray(payload)) return payload;
  const record = coerceRecord(payload);
  for (const key of candidateKeys) {
    if (Array.isArray(record[key])) {
      return record[key] as unknown[];
    }
  }
  return [];
}

function getStringArray(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value
      .map((entry) => (typeof entry === 'string' ? entry.trim() : ''))
      .filter(Boolean);
  }

  if (typeof value === 'string') {
    return value
      .split(',')
      .map((entry) => entry.trim())
      .filter(Boolean);
  }

  return [];
}

async function requireBrevoProvider(providerId: string): Promise<BrevoProvider> {
  const provider = await getCampaignEmailProvider(providerId);
  if (!provider) {
    throw new Error('Campaign email provider not found.');
  }

  if (provider.providerKey !== 'brevo' || provider.transport !== 'brevo_api') {
    throw new Error('Selected provider is not configured for the Brevo API.');
  }

  if (!provider.apiKey) {
    throw new Error('Brevo API key is missing for this provider.');
  }

  return provider as BrevoProvider;
}

async function brevoRequest<T = unknown>(
  provider: BrevoProvider,
  path: string,
  options: BrevoRequestOptions = {},
): Promise<T | null> {
  const { allow404 = false, ...requestInit } = options;
  const requestHeaders = requestInit.headers && typeof requestInit.headers === 'object'
    ? requestInit.headers as Record<string, string>
    : {};
  const response = await fetch(`${provider.apiBaseUrl || 'https://api.brevo.com/v3'}${path}`, {
    ...requestInit,
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      'api-key': provider.apiKey!,
      ...requestHeaders,
    },
  });

  if (allow404 && response.status === 404) {
    return null;
  }

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Brevo API ${response.status} on ${path}: ${errorText || response.statusText}`);
  }

  if (response.status === 204) {
    return null;
  }

  const text = await response.text();
  return text ? JSON.parse(text) as T : null;
}

async function loadLocalSenderMatches(): Promise<Map<string, BrevoInfrastructureMatch>> {
  const localSenders = await db
    .select()
    .from(senderProfiles);

  const matches = new Map<string, BrevoInfrastructureMatch>();
  for (const sender of localSenders) {
    const normalized = normalizeEmail(sender.fromEmail);
    if (!normalized) continue;

    const provider = await getCampaignEmailProviderBindingForSender(sender.id);
    matches.set(normalized, {
      id: sender.id,
      label: sender.name,
      providerId: provider?.id || null,
      providerName: provider?.name || null,
    });
  }

  return matches;
}

async function loadLocalDomainMatches(): Promise<Map<string, BrevoInfrastructureMatch>> {
  const localDomains = await db
    .select()
    .from(domainAuth);

  const matches = new Map<string, BrevoInfrastructureMatch>();
  for (const domain of localDomains) {
    const normalized = normalizeDomainName(domain.domain);
    if (!normalized) continue;

    const provider = await getCampaignEmailProviderBindingForDomain(domain.id);
    matches.set(normalized, {
      id: domain.id,
      label: domain.domain,
      providerId: provider?.id || null,
      providerName: provider?.name || null,
    });
  }

  return matches;
}

function normalizeBrevoSender(
  rawValue: unknown,
  senderMatches: Map<string, BrevoInfrastructureMatch>,
): BrevoManagedSender | null {
  const raw = coerceRecord(rawValue);
  const email = normalizeEmail(raw.email || raw.sender);
  if (!email) return null;

  const domain = normalizeDomainName(email.split('@')[1] || null);
  const ips = getStringArray(raw.ips || raw.ip || raw.ipAddresses || raw.dedicatedIps);
  const verified = parseBoolean(raw.verified ?? raw.isVerified ?? raw.authenticated);

  return {
    id: String(raw.id ?? raw.senderId ?? email),
    name: typeof raw.name === 'string' && raw.name.trim() ? raw.name.trim() : email,
    email,
    domain,
    active: parseBoolean(raw.active ?? raw.enabled ?? raw.status),
    verified,
    ips,
    localMatch: senderMatches.get(email) || null,
    raw,
  };
}

function normalizeDnsRecords(raw: Record<string, unknown>): BrevoManagedDomain['dnsRecords'] {
  const possibleRows = arrayFromPayload(
    raw.dnsRecords || raw.dns_records || raw.records || raw.expectedDnsRecords,
    ['records', 'dns_records', 'dnsRecords'],
  );

  return possibleRows
    .map((entry) => {
      const row = coerceRecord(entry);
      const type = typeof row.type === 'string' ? row.type : typeof row.recordType === 'string' ? row.recordType : 'TXT';
      const name = typeof row.name === 'string' ? row.name : typeof row.host === 'string' ? row.host : '';
      const value = typeof row.value === 'string' ? row.value : typeof row.target === 'string' ? row.target : '';
      if (!name || !value) return null;

      return {
        type,
        name,
        value,
        status: typeof row.status === 'string' ? row.status : null,
      };
    })
    .filter((row): row is NonNullable<typeof row> => !!row);
}

function normalizeBrevoDomain(
  rawValue: unknown,
  domainMatches: Map<string, BrevoInfrastructureMatch>,
): BrevoManagedDomain | null {
  const raw = coerceRecord(rawValue);
  const domain = normalizeDomainName(raw.name || raw.domain || raw.domainName || raw.id);
  if (!domain) return null;

  const authenticated = parseBoolean(raw.authenticated ?? raw.isAuthenticated ?? raw.domainAuthenticated);
  const verified = parseBoolean(raw.verified ?? raw.isVerified ?? raw.valid ?? raw.domainVerified);

  return {
    id: String(raw.id ?? domain),
    domain,
    authenticated,
    verified,
    status: typeof raw.status === 'string' ? raw.status : null,
    dnsRecords: normalizeDnsRecords(raw),
    localMatch: domainMatches.get(domain) || null,
    raw,
  };
}

function normalizeBrevoDedicatedIp(rawValue: unknown): BrevoDedicatedIp | null {
  const raw = coerceRecord(rawValue);
  const ip = typeof raw.ip === 'string'
    ? raw.ip.trim()
    : typeof raw.address === 'string'
      ? raw.address.trim()
      : '';

  if (!ip) return null;

  return {
    id: String(raw.id ?? ip),
    ip,
    name: typeof raw.name === 'string' ? raw.name : null,
    domain: normalizeDomainName(raw.domain || raw.senderDomain),
    status: typeof raw.status === 'string' ? raw.status : null,
    warmupStatus: typeof raw.warmupStatus === 'string'
      ? raw.warmupStatus
      : typeof raw.warmup_status === 'string'
        ? raw.warmup_status
        : null,
    weight: parseNumber(raw.weight),
    raw,
  };
}

async function listBrevoSenders(provider: BrevoProvider): Promise<BrevoManagedSender[]> {
  const senderMatches = await loadLocalSenderMatches();
  const payload = await brevoRequest(provider, '/senders');
  return arrayFromPayload(payload, ['senders', 'items', 'data'])
    .map((entry) => normalizeBrevoSender(entry, senderMatches))
    .filter((entry): entry is BrevoManagedSender => !!entry);
}

export async function getBrevoDomain(providerId: string, domainName: string): Promise<BrevoManagedDomain | null> {
  const provider = await requireBrevoProvider(providerId);
  const domainMatches = await loadLocalDomainMatches();
  const payload = await brevoRequest(provider, `/senders/domains/${encodeURIComponent(domainName)}`, { allow404: true });
  if (!payload) return null;

  const raw = Array.isArray(payload) ? payload[0] : coerceRecord(payload).domain || payload;
  return normalizeBrevoDomain(raw, domainMatches);
}

async function listBrevoDomains(provider: BrevoProvider): Promise<BrevoManagedDomain[]> {
  const domainMatches = await loadLocalDomainMatches();
  const payload = await brevoRequest(provider, '/senders/domains');
  const domains = arrayFromPayload(payload, ['domains', 'items', 'data'])
    .map((entry) => normalizeBrevoDomain(entry, domainMatches))
    .filter((entry): entry is BrevoManagedDomain => !!entry);

  const enriched = await Promise.all(
    domains.map(async (domain) => {
      try {
        const detail = await brevoRequest(provider, `/senders/domains/${encodeURIComponent(domain.domain)}`, { allow404: true });
        if (!detail) return domain;

        const normalized = normalizeBrevoDomain(
          Array.isArray(detail) ? detail[0] : coerceRecord(detail).domain || detail,
          domainMatches,
        );

        return normalized || domain;
      } catch {
        return domain;
      }
    }),
  );

  return enriched;
}

async function listBrevoDedicatedIps(provider: BrevoProvider): Promise<BrevoDedicatedIp[]> {
  const payload = await brevoRequest(provider, '/senders/ips');
  return arrayFromPayload(payload, ['ips', 'items', 'data'])
    .map((entry) => normalizeBrevoDedicatedIp(entry))
    .filter((entry): entry is BrevoDedicatedIp => !!entry);
}

export async function getBrevoInfrastructureOverview(providerId: string): Promise<BrevoInfrastructureOverview> {
  const provider = await requireBrevoProvider(providerId);

  const [sendersResult, domainsResult, ipsResult] = await Promise.allSettled([
    listBrevoSenders(provider),
    listBrevoDomains(provider),
    listBrevoDedicatedIps(provider),
  ]);

  const senders = sendersResult.status === 'fulfilled' ? sendersResult.value : [];
  const domains = domainsResult.status === 'fulfilled' ? domainsResult.value : [];
  const dedicatedIps = ipsResult.status === 'fulfilled' ? ipsResult.value : [];

  return {
    provider: {
      id: provider.id,
      name: provider.name,
      source: provider.source,
    },
    capabilities: {
      canManageSenders: true,
      canManageDomains: true,
      canManageDedicatedIpAssignments: ipsResult.status === 'fulfilled',
      canProvisionDedicatedIps: false,
    },
    stats: {
      senderCount: senders.length,
      domainCount: domains.length,
      dedicatedIpCount: dedicatedIps.length,
      matchedLocalSenders: senders.filter((sender) => !!sender.localMatch).length,
      matchedLocalDomains: domains.filter((domain) => !!domain.localMatch).length,
    },
    senders,
    domains,
    dedicatedIps,
    sectionErrors: {
      senders: sendersResult.status === 'rejected' ? sendersResult.reason?.message || 'Failed to load Brevo senders.' : null,
      domains: domainsResult.status === 'rejected' ? domainsResult.reason?.message || 'Failed to load Brevo domains.' : null,
      dedicatedIps: ipsResult.status === 'rejected' ? ipsResult.reason?.message || 'Failed to load Brevo dedicated IPs.' : null,
    },
    syncedAt: new Date().toISOString(),
  };
}

export async function createBrevoSender(providerId: string, params: {
  name: string;
  email: string;
  ips?: string[];
}): Promise<void> {
  const provider = await requireBrevoProvider(providerId);
  await brevoRequest(provider, '/senders', {
    method: 'POST',
    body: JSON.stringify({
      name: params.name,
      email: params.email,
      ips: params.ips?.length ? params.ips : undefined,
    }),
  });
}

export async function updateBrevoSender(providerId: string, senderId: string, params: {
  name?: string;
  email?: string;
  ips?: string[];
}): Promise<void> {
  const provider = await requireBrevoProvider(providerId);
  await brevoRequest(provider, `/senders/${encodeURIComponent(senderId)}`, {
    method: 'PUT',
    body: JSON.stringify({
      name: params.name,
      email: params.email,
      ...(params.ips === undefined ? {} : { ips: params.ips }),
    }),
  });
}

export async function deleteBrevoSender(providerId: string, senderId: string): Promise<void> {
  const provider = await requireBrevoProvider(providerId);
  await brevoRequest(provider, `/senders/${encodeURIComponent(senderId)}`, {
    method: 'DELETE',
  });
}

export async function validateBrevoSender(providerId: string, senderId: string, otp: string): Promise<void> {
  const provider = await requireBrevoProvider(providerId);
  await brevoRequest(provider, `/senders/${encodeURIComponent(senderId)}/validate`, {
    method: 'PUT',
    body: JSON.stringify({ otp }),
  });
}

export async function createBrevoDomain(providerId: string, params: {
  domain: string;
}): Promise<void> {
  const provider = await requireBrevoProvider(providerId);
  await brevoRequest(provider, '/senders/domains', {
    method: 'POST',
    body: JSON.stringify({ name: params.domain }),
  });
}

export async function authenticateBrevoDomain(providerId: string, domainName: string): Promise<void> {
  const provider = await requireBrevoProvider(providerId);
  await brevoRequest(provider, `/senders/domains/${encodeURIComponent(domainName)}/authenticate`, {
    method: 'PUT',
  });
}

export async function deleteBrevoDomain(providerId: string, domainName: string): Promise<void> {
  const provider = await requireBrevoProvider(providerId);
  await brevoRequest(provider, `/senders/domains/${encodeURIComponent(domainName)}`, {
    method: 'DELETE',
  });
}

async function upsertSyncedSender(
  provider: BrevoProvider,
  sender: BrevoManagedSender,
  result: BrevoSyncResult,
): Promise<void> {
  const [existingSender] = sender.localMatch
    ? await db
      .select()
      .from(senderProfiles)
      .where(eq(senderProfiles.id, String(sender.localMatch.id)))
      .limit(1)
    : await db
      .select()
      .from(senderProfiles)
      .where(eq(senderProfiles.fromEmail, sender.email))
      .limit(1);

  if (existingSender) {
    const explicitBinding = await getCampaignEmailProviderBindingForSender(existingSender.id);
    if (explicitBinding && explicitBinding.id !== provider.id && provider.source === 'database') {
      result.skipped.push(`Skipped sender ${sender.email} because it is already bound to ${explicitBinding.name}.`);
      return;
    }

    await db
      .update(senderProfiles)
      .set({
        name: sender.name || existingSender.name,
        fromName: sender.name || existingSender.fromName,
        fromEmail: sender.email,
        isActive: sender.active ?? existingSender.isActive,
        isVerified: sender.verified ?? existingSender.isVerified,
        espProvider: 'brevo',
        espAdapter: 'brevo',
        updatedAt: new Date(),
      })
      .where(eq(senderProfiles.id, existingSender.id));

    if (provider.source === 'database') {
      await bindSenderProfileToCampaignEmailProvider(existingSender.id, provider.id);
    }

    result.updatedSenders += 1;
    return;
  }

  const [created] = await db
    .insert(senderProfiles)
    .values({
      name: sender.name,
      fromName: sender.name,
      fromEmail: sender.email,
      isActive: sender.active ?? true,
      isVerified: sender.verified ?? null,
      espProvider: 'brevo',
      espAdapter: 'brevo',
      createdAt: new Date(),
      updatedAt: new Date(),
    })
    .returning();

  if (provider.source === 'database') {
    await bindSenderProfileToCampaignEmailProvider(created.id, provider.id);
  }

  result.importedSenders += 1;
}

async function upsertSyncedDomain(
  provider: BrevoProvider,
  domain: BrevoManagedDomain,
  result: BrevoSyncResult,
): Promise<void> {
  const verifiedStatus = domain.verified || domain.authenticated ? 'verified' : 'pending';

  const [existingDomain] = domain.localMatch
    ? await db
      .select()
      .from(domainAuth)
      .where(eq(domainAuth.id, Number(domain.localMatch.id)))
      .limit(1)
    : await db
      .select()
      .from(domainAuth)
      .where(eq(domainAuth.domain, domain.domain))
      .limit(1);

  if (existingDomain) {
    const explicitBinding = await getCampaignEmailProviderBindingForDomain(existingDomain.id);
    if (explicitBinding && explicitBinding.id !== provider.id && provider.source === 'database') {
      result.skipped.push(`Skipped domain ${domain.domain} because it is already bound to ${explicitBinding.name}.`);
      return;
    }

    await db
      .update(domainAuth)
      .set({
        spfStatus: verifiedStatus,
        dkimStatus: verifiedStatus,
        dmarcStatus: verifiedStatus,
        trackingDomainStatus: verifiedStatus,
        lastCheckedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(domainAuth.id, existingDomain.id));

    if (provider.source === 'database') {
      await bindDomainToCampaignEmailProvider(existingDomain.id, provider.id);
    }

    result.updatedDomains += 1;
    return;
  }

  const [created] = await db
    .insert(domainAuth)
    .values({
      domain: domain.domain,
      spfStatus: verifiedStatus,
      dkimStatus: verifiedStatus,
      dmarcStatus: verifiedStatus,
      trackingDomainStatus: verifiedStatus,
      lastCheckedAt: new Date(),
      createdAt: new Date(),
      updatedAt: new Date(),
    })
    .returning();

  await db.insert(domainHealthScores).values({
    domainAuthId: created.id,
    overallScore: domain.verified || domain.authenticated ? 85 : 0,
    authenticationScore: domain.verified || domain.authenticated ? 100 : 0,
    warmupPhase: 'not_started',
  });

  if (provider.source === 'database') {
    await bindDomainToCampaignEmailProvider(created.id, provider.id);
  }

  result.importedDomains += 1;
}

export async function syncBrevoAssetsToDashboard(providerId: string): Promise<BrevoSyncResult> {
  const provider = await requireBrevoProvider(providerId);
  const overview = await getBrevoInfrastructureOverview(providerId);
  const result: BrevoSyncResult = {
    importedSenders: 0,
    updatedSenders: 0,
    importedDomains: 0,
    updatedDomains: 0,
    skipped: [],
  };

  for (const sender of overview.senders) {
    await upsertSyncedSender(provider, sender, result);
  }

  for (const domain of overview.domains) {
    await upsertSyncedDomain(provider, domain, result);
  }

  if (provider.source !== 'database') {
    result.skipped.push('Explicit sender/domain bindings were not created because this Brevo provider is environment-backed. Create a saved Brevo provider in Email Management for full multi-provider governance bindings.');
  }

  return result;
}
