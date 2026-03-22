import FormData from 'form-data';
import nodemailer from 'nodemailer';
import { and, asc, desc, eq, sql } from 'drizzle-orm';
import {
  campaignEmailDomainBindings,
  campaignEmailProviders,
  campaignEmailSenderBindings,
  type CampaignEmailDnsProfile,
  type CampaignEmailProvider,
  type CampaignEmailSendingProfile,
  type SenderProfile,
} from '@shared/schema';
import { db } from '../db';
import { decryptJson, encryptJson } from '../lib/encryption';
import { domainDnsGenerator, type GeneratedDnsRecords } from './domain-dns-generator';
import { generateBulkEmailHeaders, validateSenderAuthentication } from '../lib/email-security';

type ProviderSource = 'database' | 'environment';
type ProviderTransport = 'mailgun_api' | 'brevo_api' | 'smtp';

export interface SanitizedCampaignEmailProvider {
  id: string;
  providerKey: string;
  name: string;
  description: string | null;
  transport: ProviderTransport;
  isEnabled: boolean;
  isDefault: boolean;
  priority: number;
  apiBaseUrl: string | null;
  apiDomain: string | null;
  apiRegion: string | null;
  smtpHost: string | null;
  smtpPort: number | null;
  smtpSecure: boolean | null;
  smtpUsername: string | null;
  defaultFromEmail: string | null;
  defaultFromName: string | null;
  replyToEmail: string | null;
  dnsProfile: CampaignEmailDnsProfile;
  sendingProfile: CampaignEmailSendingProfile;
  healthStatus: string;
  lastHealthCheck: Date | null;
  lastHealthError: string | null;
  createdBy: string | null;
  createdAt: Date;
  updatedAt: Date;
  apiKeyConfigured: boolean;
  smtpPasswordConfigured: boolean;
  source: ProviderSource;
}

interface ResolvedCampaignEmailProvider extends SanitizedCampaignEmailProvider {
  apiKey?: string;
  webhookSigningKey?: string;
  smtpPassword?: string;
}

interface SendCampaignEmailParams {
  providerId?: string | null;
  providerKey?: string | null;
  options: {
    to: string;
    from: string;
    fromName?: string;
    replyTo?: string;
    subject: string;
    html: string;
    text?: string;
    listUnsubscribeUrl?: string;
    campaignId?: string;
    contactId?: string;
    sendId?: string;
    tags?: string[];
  };
}

interface ProviderVerificationResult {
  success: boolean;
  status: 'healthy' | 'degraded';
  message: string;
}

let ensureSchemaPromise: Promise | null = null;

const PROVIDER_SECRET =
  process.env.SECRET_MANAGER_MASTER_KEY ||
  process.env.SESSION_SECRET ||
  '';

const MAILGUN_ENV_PROVIDER_ID = 'env-mailgun';
const BREVO_ENV_PROVIDER_ID = 'env-brevo';

const MAILGUN_DEFAULT_DNS: CampaignEmailDnsProfile = {
  spfInclude: 'mailgun.org',
  dkimType: 'cname',
  dkimSelector: 'mg',
  dkimValue: '{{selector}}.{{fullDomain}}.mailgun.org',
  trackingHost: 'email',
  trackingValue: 'mailgun.org',
  returnPathHost: 'bounce',
  returnPathValue: 'mailgun.org',
  dmarcPolicy: 'none',
  setupNotes: 'Mailgun manages SPF, DKIM, tracking, and return-path via DNS CNAME/TXT records.',
};

const BREVO_DEFAULT_DNS: CampaignEmailDnsProfile = {
  dkimType: 'txt',
  dkimSelector: 'mail',
  dkimValue: 'Paste the exact DKIM value Brevo provides for this domain.',
  dmarcPolicy: 'none',
  dmarcReportEmail: 'rua@dmarc.brevo.com',
  setupNotes: 'Use the exact sender-domain records shown in Brevo. Brevo code, DKIM, and DMARC are required. SPF and MX are only needed when Brevo asks for them, such as dedicated IP setups.',
};

const BRAINPOOL_DEFAULT_DNS: CampaignEmailDnsProfile = {
  dkimType: 'txt',
  dkimSelector: 'bp1',
  dkimValue: 'v=DKIM1; k=rsa; p=YOUR_BRAINPOOL_PUBLIC_KEY',
  trackingHost: 'track',
  trackingValue: '',
  dmarcPolicy: 'none',
  setupNotes: 'Enter the Brainpool-specific SPF include, DKIM target/public key, and tracking host from your Brainpool admin panel.',
};

const DEFAULT_SMTP_SENDING: CampaignEmailSendingProfile = {
  batchSize: 50,
  rateLimitPerMinute: 120,
  dailyCap: 2000,
  enableOpenTracking: true,
  enableClickTracking: true,
  enableUnsubscribeHeader: true,
  retryCount: 2,
  retryBackoffMs: 2000,
  warmupMode: true,
};

const DEFAULT_MAILGUN_SENDING: CampaignEmailSendingProfile = {
  batchSize: 100,
  rateLimitPerMinute: 300,
  dailyCap: 5000,
  enableOpenTracking: true,
  enableClickTracking: true,
  enableUnsubscribeHeader: true,
  retryCount: 3,
  retryBackoffMs: 2000,
  warmupMode: true,
};

function getMailgunApiBase(region?: string | null): string {
  if ((region || '').toUpperCase() === 'EU') {
    return 'https://api.eu.mailgun.net/v3';
  }

  return process.env.MAILGUN_API_BASE || 'https://api.mailgun.net/v3';
}

function getBrevoApiBase(): string {
  return process.env.BREVO_API_BASE || 'https://api.brevo.com/v3';
}

function normalizeProviderKey(providerKey?: string | null, transport?: string | null): string {
  const normalized = (providerKey || '').trim().toLowerCase();
  if (normalized) return normalized;

  if (transport === 'mailgun_api') return 'mailgun';
  if (transport === 'brevo_api') return 'brevo';
  return 'custom';
}

function inferLegacyProviderKey(profile?: Pick | null): string | null {
  const raw = profile?.espProvider || profile?.espAdapter || null;
  if (!raw) return null;

  return normalizeProviderKey(raw);
}

function normalizeDnsProfile(providerKey: string, profile?: CampaignEmailDnsProfile | null): CampaignEmailDnsProfile {
  if (providerKey === 'mailgun') {
    return { ...MAILGUN_DEFAULT_DNS, ...(profile || {}) };
  }

  if (providerKey === 'brevo') {
    return { ...BREVO_DEFAULT_DNS, ...(profile || {}) };
  }

  if (providerKey === 'brainpool') {
    return { ...BRAINPOOL_DEFAULT_DNS, ...(profile || {}) };
  }

  return {
    dkimType: 'txt',
    dkimSelector: 'mail',
    dkimValue: 'v=DKIM1; k=rsa; p=YOUR_PUBLIC_KEY',
    dmarcPolicy: 'none',
    ...(profile || {}),
  };
}

function normalizeSendingProfile(providerKey: string, transport: ProviderTransport, profile?: CampaignEmailSendingProfile | null): CampaignEmailSendingProfile {
  const defaults = providerKey === 'mailgun' || providerKey === 'brevo' || transport === 'mailgun_api' || transport === 'brevo_api'
    ? DEFAULT_MAILGUN_SENDING
    : DEFAULT_SMTP_SENDING;

  return { ...defaults, ...(profile || {}) };
}

function requireProviderSecret(): string {
  if (!PROVIDER_SECRET) {
    throw new Error('Provider encryption secret is not configured. Set SECRET_MANAGER_MASTER_KEY or SESSION_SECRET.');
  }

  return PROVIDER_SECRET;
}

function encryptOptional(value?: string | null): string | undefined {
  if (!value) return undefined;
  return encryptJson(value, requireProviderSecret());
}

function decryptOptional(payload?: string | null): string | undefined {
  if (!payload) return undefined;
  return decryptJson(payload, requireProviderSecret());
}

function sanitizeProvider(row: CampaignEmailProvider, source: ProviderSource = 'database'): SanitizedCampaignEmailProvider {
  const providerKey = normalizeProviderKey(row.providerKey, row.transport);
  const transport = (row.transport as ProviderTransport) || 'smtp';

  return {
    id: row.id,
    providerKey,
    name: row.name,
    description: row.description,
    transport,
    isEnabled: row.isEnabled,
    isDefault: row.isDefault,
    priority: row.priority ?? 1,
    apiBaseUrl: row.apiBaseUrl,
    apiDomain: row.apiDomain,
    apiRegion: row.apiRegion,
    smtpHost: row.smtpHost,
    smtpPort: row.smtpPort,
    smtpSecure: row.smtpSecure,
    smtpUsername: row.smtpUsername,
    defaultFromEmail: row.defaultFromEmail,
    defaultFromName: row.defaultFromName,
    replyToEmail: row.replyToEmail,
    dnsProfile: normalizeDnsProfile(providerKey, row.dnsProfile),
    sendingProfile: normalizeSendingProfile(providerKey, transport, row.sendingProfile),
    healthStatus: row.healthStatus || 'unknown',
    lastHealthCheck: row.lastHealthCheck,
    lastHealthError: row.lastHealthError,
    createdBy: row.createdBy,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    apiKeyConfigured: !!row.apiKeyEncrypted,
    smtpPasswordConfigured: !!row.smtpPasswordEncrypted,
    source,
  };
}

function hydrateProvider(row: CampaignEmailProvider, source: ProviderSource = 'database'): ResolvedCampaignEmailProvider {
  const sanitized = sanitizeProvider(row, source);

  return {
    ...sanitized,
    apiKey: decryptOptional(row.apiKeyEncrypted),
    webhookSigningKey: decryptOptional(row.webhookSigningKeyEncrypted),
    smtpPassword: decryptOptional(row.smtpPasswordEncrypted),
  };
}

function buildEnvironmentMailgunProvider(): ResolvedCampaignEmailProvider | null {
  const apiKey = process.env.MAILGUN_API_KEY;
  const apiDomain = process.env.MAILGUN_DOMAIN;

  if (!apiKey || !apiDomain) return null;

  return {
    id: MAILGUN_ENV_PROVIDER_ID,
    providerKey: 'mailgun',
    name: 'Mailgun (Environment)',
    description: 'Environment-backed Mailgun provider fallback',
    transport: 'mailgun_api',
    isEnabled: true,
    isDefault: true,
    priority: 999,
    apiBaseUrl: getMailgunApiBase(null),
    apiDomain,
    apiRegion: null,
    smtpHost: null,
    smtpPort: null,
    smtpSecure: null,
    smtpUsername: null,
    defaultFromEmail: process.env.DEFAULT_FROM_EMAIL || `noreply@${apiDomain}`,
    defaultFromName: process.env.DEFAULT_FROM_NAME || 'DemandGentic',
    replyToEmail: process.env.DEFAULT_REPLY_TO_EMAIL || process.env.DEFAULT_FROM_EMAIL || `noreply@${apiDomain}`,
    dnsProfile: normalizeDnsProfile('mailgun'),
    sendingProfile: normalizeSendingProfile('mailgun', 'mailgun_api'),
    healthStatus: 'healthy',
    lastHealthCheck: null,
    lastHealthError: null,
    createdBy: null,
    createdAt: new Date(0),
    updatedAt: new Date(0),
    apiKeyConfigured: true,
    smtpPasswordConfigured: false,
    source: 'environment',
    apiKey,
  };
}

function buildEnvironmentBrevoProvider(): ResolvedCampaignEmailProvider | null {
  const apiKey = process.env.BREVO_API_KEY;
  if (!apiKey) return null;

  return {
    id: BREVO_ENV_PROVIDER_ID,
    providerKey: 'brevo',
    name: 'Brevo (Environment)',
    description: 'Environment-backed Brevo provider fallback',
    transport: 'brevo_api',
    isEnabled: true,
    isDefault: false,
    priority: 998,
    apiBaseUrl: getBrevoApiBase(),
    apiDomain: null,
    apiRegion: null,
    smtpHost: null,
    smtpPort: null,
    smtpSecure: null,
    smtpUsername: null,
    defaultFromEmail: process.env.BREVO_FROM_EMAIL || process.env.DEFAULT_FROM_EMAIL || null,
    defaultFromName: process.env.BREVO_FROM_NAME || process.env.DEFAULT_FROM_NAME || 'DemandGentic',
    replyToEmail: process.env.BREVO_REPLY_TO_EMAIL || process.env.DEFAULT_REPLY_TO_EMAIL || null,
    dnsProfile: normalizeDnsProfile('brevo'),
    sendingProfile: normalizeSendingProfile('brevo', 'brevo_api'),
    healthStatus: 'healthy',
    lastHealthCheck: null,
    lastHealthError: null,
    createdBy: null,
    createdAt: new Date(0),
    updatedAt: new Date(0),
    apiKeyConfigured: true,
    smtpPasswordConfigured: false,
    source: 'environment',
    apiKey,
  };
}

async function ensureCampaignEmailSchema(): Promise {
  if (!ensureSchemaPromise) {
    ensureSchemaPromise = (async () => {
      await db.execute(sql.raw(`
        CREATE TABLE IF NOT EXISTS campaign_email_providers (
          id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
          provider_key text NOT NULL,
          name text NOT NULL,
          description text,
          transport text NOT NULL DEFAULT 'smtp',
          is_enabled boolean NOT NULL DEFAULT true,
          is_default boolean NOT NULL DEFAULT false,
          priority integer NOT NULL DEFAULT 1,
          api_base_url text,
          api_domain text,
          api_region text,
          api_key_encrypted text,
          webhook_signing_key_encrypted text,
          smtp_host text,
          smtp_port integer,
          smtp_secure boolean DEFAULT true,
          smtp_username text,
          smtp_password_encrypted text,
          default_from_email text,
          default_from_name text,
          reply_to_email text,
          dns_profile jsonb,
          sending_profile jsonb,
          health_status text NOT NULL DEFAULT 'unknown',
          last_health_check timestamp,
          last_health_error text,
          created_by varchar REFERENCES users(id),
          created_at timestamp NOT NULL DEFAULT now(),
          updated_at timestamp NOT NULL DEFAULT now()
        )
      `));

      await db.execute(sql.raw(`
        CREATE UNIQUE INDEX IF NOT EXISTS campaign_email_providers_name_uniq
        ON campaign_email_providers(name)
      `));
      await db.execute(sql.raw(`
        CREATE INDEX IF NOT EXISTS campaign_email_providers_key_idx
        ON campaign_email_providers(provider_key)
      `));
      await db.execute(sql.raw(`
        CREATE INDEX IF NOT EXISTS campaign_email_providers_default_idx
        ON campaign_email_providers(is_default)
      `));
      await db.execute(sql.raw(`
        CREATE INDEX IF NOT EXISTS campaign_email_providers_enabled_idx
        ON campaign_email_providers(is_enabled)
      `));
      await db.execute(sql.raw(`
        CREATE INDEX IF NOT EXISTS campaign_email_providers_priority_idx
        ON campaign_email_providers(priority)
      `));

      await db.execute(sql.raw(`
        CREATE TABLE IF NOT EXISTS campaign_email_sender_bindings (
          id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
          sender_profile_id varchar NOT NULL REFERENCES sender_profiles(id) ON DELETE CASCADE,
          provider_id varchar NOT NULL REFERENCES campaign_email_providers(id) ON DELETE CASCADE,
          created_at timestamp NOT NULL DEFAULT now(),
          updated_at timestamp NOT NULL DEFAULT now()
        )
      `));
      await db.execute(sql.raw(`
        CREATE UNIQUE INDEX IF NOT EXISTS campaign_email_sender_bindings_sender_uniq
        ON campaign_email_sender_bindings(sender_profile_id)
      `));
      await db.execute(sql.raw(`
        CREATE INDEX IF NOT EXISTS campaign_email_sender_bindings_provider_idx
        ON campaign_email_sender_bindings(provider_id)
      `));

      await db.execute(sql.raw(`
        CREATE TABLE IF NOT EXISTS campaign_email_domain_bindings (
          id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
          domain_auth_id integer NOT NULL REFERENCES domain_auth(id) ON DELETE CASCADE,
          provider_id varchar NOT NULL REFERENCES campaign_email_providers(id) ON DELETE CASCADE,
          created_at timestamp NOT NULL DEFAULT now(),
          updated_at timestamp NOT NULL DEFAULT now()
        )
      `));
      await db.execute(sql.raw(`
        CREATE UNIQUE INDEX IF NOT EXISTS campaign_email_domain_bindings_domain_uniq
        ON campaign_email_domain_bindings(domain_auth_id)
      `));
      await db.execute(sql.raw(`
        CREATE INDEX IF NOT EXISTS campaign_email_domain_bindings_provider_idx
        ON campaign_email_domain_bindings(provider_id)
      `));
    })().catch((error) => {
      ensureSchemaPromise = null;
      throw error;
    });
  }

  return ensureSchemaPromise;
}

function applyTemplate(input: string | undefined | null, values: Record): string | undefined {
  if (!input) return undefined;

  let output = input;
  for (const [key, value] of Object.entries(values)) {
    output = output.replaceAll(`{{${key}}}`, value);
  }

  return output;
}

function buildCustomDnsRecords(params: {
  domain: string;
  subdomain?: string;
  provider: SanitizedCampaignEmailProvider | null;
  dkimSelector?: string;
  dmarcPolicy?: 'none' | 'quarantine' | 'reject';
  includeTracking?: boolean;
}): GeneratedDnsRecords {
  const fullDomain = params.subdomain ? `${params.subdomain}.${params.domain}` : params.domain;
  const dnsProfile = params.provider?.dnsProfile || normalizeDnsProfile(params.provider?.providerKey || 'custom');
  const selector = params.dkimSelector || dnsProfile.dkimSelector || 'mail';
  const values = {
    domain: params.domain,
    fullDomain,
    selector,
  };
  const spfInclude = dnsProfile.spfInclude?.trim();
  const dmarcPolicy = params.dmarcPolicy || dnsProfile.dmarcPolicy || 'none';

  const spfValue = spfInclude
    ? `v=spf1 ${spfInclude.startsWith('include:') ? spfInclude : `include:${spfInclude}`} ~all`
    : 'v=spf1 ~all';

  const dkimValue = applyTemplate(dnsProfile.dkimValue, values)
    || 'v=DKIM1; k=rsa; p=YOUR_PUBLIC_KEY';

  const trackingValue = applyTemplate(dnsProfile.trackingValue, values);
  const returnPathValue = applyTemplate(dnsProfile.returnPathValue, values);
  const trackingHost = dnsProfile.trackingHost || 'email';
  const returnPathHost = dnsProfile.returnPathHost || 'bounce';

  return {
    spf: {
      type: 'TXT',
      name: fullDomain,
      value: spfValue,
      ttl: 3600,
      purpose: 'SPF - Specifies which mail servers are authorized to send email on behalf of your domain',
      verified: false,
    },
    dkim: {
      type: dnsProfile.dkimType === 'cname' ? 'CNAME' : 'TXT',
      name: `${selector}._domainkey.${fullDomain}`,
      value: dkimValue,
      ttl: 3600,
      purpose: 'DKIM - Adds a digital signature to emails to verify they have not been altered',
      verified: false,
    },
    dmarc: {
      type: 'TXT',
      name: `_dmarc.${fullDomain}`,
      value: `v=DMARC1; p=${dmarcPolicy}; rua=mailto:${dnsProfile.dmarcReportEmail || `dmarc@${params.domain}`}; aspf=r; adkim=r`,
      ttl: 3600,
      purpose: 'DMARC - Tells receiving servers how to handle emails that fail SPF/DKIM checks',
      verified: false,
    },
    tracking: params.includeTracking !== false && trackingValue ? {
      type: 'CNAME',
      name: `${trackingHost}.${fullDomain}`,
      value: trackingValue,
      ttl: 3600,
      purpose: 'Tracking - Enables open and click tracking for your emails',
      verified: false,
    } : undefined,
    returnPath: returnPathValue ? {
      type: 'CNAME',
      name: `${returnPathHost}.${fullDomain}`,
      value: returnPathValue,
      ttl: 3600,
      purpose: 'Return-Path - Handles bounce notifications for your domain',
      verified: false,
    } : undefined,
  };
}

async function sendViaMailgun(provider: ResolvedCampaignEmailProvider, params: SendCampaignEmailParams['options']): Promise {
  if (!provider.apiKey || !provider.apiDomain) {
    throw new Error(`Mailgun provider "${provider.name}" is missing API credentials or domain.`);
  }

  const apiBaseUrl = provider.apiBaseUrl || getMailgunApiBase(provider.apiRegion);
  const appBaseUrl = process.env.APP_BASE_URL || 'https://demandgentic.ai';
  const authValidation = validateSenderAuthentication(params.from, appBaseUrl);
  if (authValidation.warnings.length > 0) {
    console.warn('[Campaign Email] Sender authentication warnings:', authValidation.warnings);
  }

  const formData = new FormData();
  const from = params.fromName ? `${params.fromName} ` : params.from;

  formData.append('from', from);
  formData.append('to', params.to);
  formData.append('subject', params.subject);
  formData.append('html', params.html);

  if (params.text) {
    formData.append('text', params.text);
  }

  if (params.replyTo) {
    formData.append('h:Reply-To', params.replyTo);
  }

  const securityHeaders = generateBulkEmailHeaders({
    fromEmail: params.from,
    recipientEmail: params.to,
    campaignId: params.campaignId,
    messageId: params.sendId,
  });

  Object.entries(securityHeaders).forEach(([header, value]) => {
    formData.append(`h:${header}`, value);
  });

  if (params.campaignId) formData.append('v:campaign_id', params.campaignId);
  if (params.contactId) formData.append('v:contact_id', params.contactId);
  if (params.sendId) formData.append('v:send_id', params.sendId);

  if (params.tags?.length) {
    params.tags.forEach((tag) => formData.append('o:tag', tag));
  }

  if (provider.sendingProfile.enableOpenTracking !== false) {
    formData.append('o:tracking-opens', 'yes');
  }

  if (provider.sendingProfile.enableClickTracking !== false) {
    formData.append('o:tracking-clicks', 'yes');
  }

  formData.append('o:tracking', 'yes');

  const auth = Buffer.from(`api:${provider.apiKey}`).toString('base64');
  const response = await fetch(`${apiBaseUrl}/${provider.apiDomain}/messages`, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${auth}`,
      ...formData.getHeaders(),
    },
    body: formData as any,
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Mailgun API error (${response.status}): ${errorText}`);
  }

  const result = await response.json() as { id?: string; message?: string };
  return {
    messageId: result.id || result.message || `${Date.now()}`,
    providerKey: provider.providerKey,
  };
}

async function sendViaBrevo(provider: ResolvedCampaignEmailProvider, params: SendCampaignEmailParams['options']): Promise {
  if (!provider.apiKey) {
    throw new Error(`Brevo provider "${provider.name}" is missing an API key.`);
  }

  const appBaseUrl = process.env.APP_BASE_URL || 'https://demandgentic.ai';
  const authValidation = validateSenderAuthentication(params.from, appBaseUrl);
  if (authValidation.warnings.length > 0) {
    console.warn('[Campaign Email] Sender authentication warnings:', authValidation.warnings);
  }

  const headers = provider.sendingProfile.enableUnsubscribeHeader === false
    ? {
        'X-Mailer': 'DemandGentic CRM',
        'X-Campaign-ID': params.campaignId || 'none',
      }
    : generateBulkEmailHeaders({
        fromEmail: params.from,
        recipientEmail: params.to,
        campaignId: params.campaignId,
        messageId: params.sendId,
      });

  if (params.sendId) {
    headers.idempotencyKey = params.sendId;
  }

  const payload: Record = {
    sender: params.fromName
      ? { email: params.from, name: params.fromName }
      : { email: params.from },
    to: [{ email: params.to }],
    subject: params.subject,
    headers,
  };

  if (params.html) {
    payload.htmlContent = params.html;
  } else if (params.text) {
    payload.textContent = params.text;
  }

  if (params.replyTo) {
    payload.replyTo = { email: params.replyTo };
  }

  if (params.tags?.length) {
    payload.tags = params.tags;
  }

  if (params.campaignId || params.contactId || params.sendId) {
    payload.params = {
      campaignId: params.campaignId,
      contactId: params.contactId,
      sendId: params.sendId,
    };
  }

  const response = await fetch(`${provider.apiBaseUrl || getBrevoApiBase()}/smtp/email`, {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      'api-key': provider.apiKey,
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Brevo API error (${response.status}): ${errorText}`);
  }

  const result = await response.json() as { messageId?: string | string[] };
  const messageId = Array.isArray(result.messageId)
    ? result.messageId[0]
    : result.messageId;

  return {
    messageId: messageId || `${Date.now()}`,
    providerKey: provider.providerKey,
  };
}

async function sendViaSmtp(provider: ResolvedCampaignEmailProvider, params: SendCampaignEmailParams['options']): Promise {
  if (!provider.smtpHost || !provider.smtpPort || !provider.smtpUsername || !provider.smtpPassword) {
    throw new Error(`SMTP provider "${provider.name}" is missing host, port, username, or password.`);
  }

  const transport = nodemailer.createTransport({
    host: provider.smtpHost,
    port: provider.smtpPort,
    secure: provider.smtpSecure ?? provider.smtpPort === 465,
    auth: {
      user: provider.smtpUsername,
      pass: provider.smtpPassword,
    },
    pool: true,
    maxConnections: 3,
    maxMessages: 200,
  });

  const headers = provider.sendingProfile.enableUnsubscribeHeader === false
    ? {
        'X-Mailer': 'DemandGentic CRM',
        'X-Campaign-ID': params.campaignId || 'none',
      }
    : generateBulkEmailHeaders({
        fromEmail: params.from,
        recipientEmail: params.to,
        campaignId: params.campaignId,
        messageId: params.sendId,
      });

  const info = await transport.sendMail({
    from: params.fromName ? `${params.fromName} ` : params.from,
    to: params.to,
    subject: params.subject,
    html: params.html,
    text: params.text,
    replyTo: params.replyTo,
    headers,
  });

  await transport.close();

  return {
    messageId: info.messageId || `${Date.now()}`,
    providerKey: provider.providerKey,
  };
}

async function sendViaProvider(provider: ResolvedCampaignEmailProvider, params: SendCampaignEmailParams['options']): Promise {
  if (provider.transport === 'mailgun_api') {
    return sendViaMailgun(provider, params);
  }

  if (provider.transport === 'brevo_api') {
    return sendViaBrevo(provider, params);
  }

  return sendViaSmtp(provider, params);
}

export async function listCampaignEmailProviders(): Promise {
  await ensureCampaignEmailSchema();

  const rows = await db
    .select()
    .from(campaignEmailProviders)
    .orderBy(desc(campaignEmailProviders.isDefault), asc(campaignEmailProviders.priority), asc(campaignEmailProviders.name));

  const providers = rows.map((row) => sanitizeProvider(row));
  const hasMailgunDbProvider = providers.some((provider) => provider.providerKey === 'mailgun');
  const hasBrevoDbProvider = providers.some((provider) => provider.providerKey === 'brevo');
  const envMailgun = !hasMailgunDbProvider ? buildEnvironmentMailgunProvider() : null;
  const envBrevo = !hasBrevoDbProvider ? buildEnvironmentBrevoProvider() : null;

  const all = [...providers];
  if (envMailgun) all.push(envMailgun);
  if (envBrevo) all.push(envBrevo);
  return all;
}

export async function getCampaignEmailProvider(providerId: string): Promise {
  await ensureCampaignEmailSchema();

  if (providerId === MAILGUN_ENV_PROVIDER_ID) {
    return buildEnvironmentMailgunProvider();
  }

  if (providerId === BREVO_ENV_PROVIDER_ID) {
    return buildEnvironmentBrevoProvider();
  }

  const [row] = await db
    .select()
    .from(campaignEmailProviders)
    .where(eq(campaignEmailProviders.id, providerId))
    .limit(1);

  return row ? hydrateProvider(row) : null;
}

async function resolveDefaultProvider(): Promise {
  await ensureCampaignEmailSchema();

  const [row] = await db
    .select()
    .from(campaignEmailProviders)
    .where(and(eq(campaignEmailProviders.isDefault, true), eq(campaignEmailProviders.isEnabled, true)))
    .orderBy(asc(campaignEmailProviders.priority))
    .limit(1);

  if (row) {
    return hydrateProvider(row);
  }

  return buildEnvironmentMailgunProvider();
}

async function resolveProviderByKey(providerKey: string): Promise {
  await ensureCampaignEmailSchema();

  const normalized = normalizeProviderKey(providerKey);
  const [row] = await db
    .select()
    .from(campaignEmailProviders)
    .where(and(eq(campaignEmailProviders.providerKey, normalized), eq(campaignEmailProviders.isEnabled, true)))
    .orderBy(desc(campaignEmailProviders.isDefault), asc(campaignEmailProviders.priority))
    .limit(1);

  if (row) {
    return hydrateProvider(row);
  }

  if (normalized === 'mailgun') {
    return buildEnvironmentMailgunProvider();
  }

  if (normalized === 'brevo') {
    return buildEnvironmentBrevoProvider();
  }

  return null;
}

async function resolveProviderForSend(providerId?: string | null, providerKey?: string | null): Promise {
  const byId = providerId ? await getCampaignEmailProvider(providerId) : null;
  if (byId?.isEnabled) {
    return byId;
  }

  const byKey = providerKey ? await resolveProviderByKey(providerKey) : null;
  if (byKey?.isEnabled) {
    return byKey;
  }

  const defaultProvider = await resolveDefaultProvider();
  if (defaultProvider?.isEnabled) {
    return defaultProvider;
  }

  throw new Error('No enabled campaign email provider is configured. Add Mailgun, Brevo, Brainpool, or Custom SMTP in Email Management first.');
}

export async function createCampaignEmailProvider(input: {
  providerKey: string;
  name: string;
  description?: string;
  transport: ProviderTransport;
  isEnabled?: boolean;
  isDefault?: boolean;
  priority?: number;
  apiBaseUrl?: string;
  apiDomain?: string;
  apiRegion?: string;
  apiKey?: string;
  webhookSigningKey?: string;
  smtpHost?: string;
  smtpPort?: number;
  smtpSecure?: boolean;
  smtpUsername?: string;
  smtpPassword?: string;
  defaultFromEmail?: string;
  defaultFromName?: string;
  replyToEmail?: string;
  dnsProfile?: CampaignEmailDnsProfile;
  sendingProfile?: CampaignEmailSendingProfile;
  createdBy?: string | null;
}): Promise {
  await ensureCampaignEmailSchema();

  if (input.isDefault) {
    await db
      .update(campaignEmailProviders)
      .set({ isDefault: false, updatedAt: new Date() })
      .where(eq(campaignEmailProviders.isDefault, true));
  }

  const providerKey = normalizeProviderKey(input.providerKey, input.transport);
  const dnsProfile = normalizeDnsProfile(providerKey, input.dnsProfile);
  const sendingProfile = normalizeSendingProfile(providerKey, input.transport, input.sendingProfile);

  const [row] = await db
    .insert(campaignEmailProviders)
    .values({
      providerKey,
      name: input.name,
      description: input.description,
      transport: input.transport,
      isEnabled: input.isEnabled ?? true,
      isDefault: input.isDefault ?? false,
      priority: input.priority ?? 1,
      apiBaseUrl: input.transport === 'mailgun_api'
        ? (input.apiBaseUrl || getMailgunApiBase(input.apiRegion))
        : input.transport === 'brevo_api'
          ? (input.apiBaseUrl || getBrevoApiBase())
          : input.apiBaseUrl,
      apiDomain: input.apiDomain,
      apiRegion: input.apiRegion,
      apiKeyEncrypted: encryptOptional(input.apiKey),
      webhookSigningKeyEncrypted: encryptOptional(input.webhookSigningKey),
      smtpHost: input.smtpHost,
      smtpPort: input.smtpPort,
      smtpSecure: input.smtpSecure ?? true,
      smtpUsername: input.smtpUsername,
      smtpPasswordEncrypted: encryptOptional(input.smtpPassword),
      defaultFromEmail: input.defaultFromEmail,
      defaultFromName: input.defaultFromName,
      replyToEmail: input.replyToEmail,
      dnsProfile,
      sendingProfile,
      healthStatus: 'unknown',
      createdBy: input.createdBy || null,
    })
    .returning();

  return sanitizeProvider(row);
}

export async function updateCampaignEmailProvider(providerId: string, input: {
  providerKey?: string;
  name?: string;
  description?: string;
  transport?: ProviderTransport;
  isEnabled?: boolean;
  isDefault?: boolean;
  priority?: number;
  apiBaseUrl?: string | null;
  apiDomain?: string | null;
  apiRegion?: string | null;
  apiKey?: string | null;
  webhookSigningKey?: string | null;
  smtpHost?: string | null;
  smtpPort?: number | null;
  smtpSecure?: boolean | null;
  smtpUsername?: string | null;
  smtpPassword?: string | null;
  defaultFromEmail?: string | null;
  defaultFromName?: string | null;
  replyToEmail?: string | null;
  dnsProfile?: CampaignEmailDnsProfile | null;
  sendingProfile?: CampaignEmailSendingProfile | null;
}): Promise {
  await ensureCampaignEmailSchema();

  const existing = await getCampaignEmailProvider(providerId);
  if (!existing || existing.source === 'environment') {
    return null;
  }

  if (input.isDefault) {
    await db
      .update(campaignEmailProviders)
      .set({ isDefault: false, updatedAt: new Date() })
      .where(eq(campaignEmailProviders.isDefault, true));
  }

  const nextProviderKey = normalizeProviderKey(input.providerKey || existing.providerKey, input.transport || existing.transport);
  const nextTransport = (input.transport || existing.transport) as ProviderTransport;

  const updatePayload: Record = {
    providerKey: nextProviderKey,
    name: input.name ?? existing.name,
    description: input.description ?? existing.description,
    transport: nextTransport,
    isEnabled: input.isEnabled ?? existing.isEnabled,
    isDefault: input.isDefault ?? existing.isDefault,
    priority: input.priority ?? existing.priority,
    apiBaseUrl: input.apiBaseUrl === undefined
      ? existing.apiBaseUrl
      : (
          input.apiBaseUrl
          || (nextTransport === 'mailgun_api'
            ? getMailgunApiBase(input.apiRegion || existing.apiRegion)
            : nextTransport === 'brevo_api'
              ? getBrevoApiBase()
              : null)
        ),
    apiDomain: input.apiDomain === undefined ? existing.apiDomain : input.apiDomain,
    apiRegion: input.apiRegion === undefined ? existing.apiRegion : input.apiRegion,
    smtpHost: input.smtpHost === undefined ? existing.smtpHost : input.smtpHost,
    smtpPort: input.smtpPort === undefined ? existing.smtpPort : input.smtpPort,
    smtpSecure: input.smtpSecure === undefined ? existing.smtpSecure : input.smtpSecure,
    smtpUsername: input.smtpUsername === undefined ? existing.smtpUsername : input.smtpUsername,
    defaultFromEmail: input.defaultFromEmail === undefined ? existing.defaultFromEmail : input.defaultFromEmail,
    defaultFromName: input.defaultFromName === undefined ? existing.defaultFromName : input.defaultFromName,
    replyToEmail: input.replyToEmail === undefined ? existing.replyToEmail : input.replyToEmail,
    dnsProfile: normalizeDnsProfile(nextProviderKey, input.dnsProfile === undefined ? existing.dnsProfile : input.dnsProfile || undefined),
    sendingProfile: normalizeSendingProfile(nextProviderKey, nextTransport, input.sendingProfile === undefined ? existing.sendingProfile : input.sendingProfile || undefined),
    updatedAt: new Date(),
  };

  if (input.apiKey !== undefined) {
    updatePayload.apiKeyEncrypted = encryptOptional(input.apiKey) || null;
  }

  if (input.webhookSigningKey !== undefined) {
    updatePayload.webhookSigningKeyEncrypted = encryptOptional(input.webhookSigningKey) || null;
  }

  if (input.smtpPassword !== undefined) {
    updatePayload.smtpPasswordEncrypted = encryptOptional(input.smtpPassword) || null;
  }

  const [updated] = await db
    .update(campaignEmailProviders)
    .set(updatePayload as Partial)
    .where(eq(campaignEmailProviders.id, providerId))
    .returning();

  return updated ? sanitizeProvider(updated) : null;
}

export async function deleteCampaignEmailProvider(providerId: string): Promise {
  await ensureCampaignEmailSchema();

  if (providerId === MAILGUN_ENV_PROVIDER_ID) {
    throw new Error('The environment Mailgun provider cannot be deleted. Remove MAILGUN_* env vars instead.');
  }

  const deleted = await db
    .delete(campaignEmailProviders)
    .where(eq(campaignEmailProviders.id, providerId))
    .returning({ id: campaignEmailProviders.id });

  return deleted.length > 0;
}

async function updateProviderHealth(providerId: string, result: ProviderVerificationResult): Promise {
  if (providerId === MAILGUN_ENV_PROVIDER_ID) return;

  await db
    .update(campaignEmailProviders)
    .set({
      healthStatus: result.status,
      lastHealthCheck: new Date(),
      lastHealthError: result.success ? null : result.message,
      updatedAt: new Date(),
    })
    .where(eq(campaignEmailProviders.id, providerId));
}

export async function verifyCampaignEmailProvider(providerId: string): Promise {
  const provider = await resolveProviderForSend(providerId, null);

  try {
    if (provider.transport === 'mailgun_api') {
      if (!provider.apiKey || !provider.apiDomain) {
        throw new Error('Missing Mailgun API key or domain.');
      }

      const response = await fetch(`${provider.apiBaseUrl || getMailgunApiBase(provider.apiRegion)}/domains/${provider.apiDomain}`, {
        headers: {
          Authorization: `Basic ${Buffer.from(`api:${provider.apiKey}`).toString('base64')}`,
        },
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Mailgun verification failed (${response.status}): ${errorText}`);
      }
    } else if (provider.transport === 'brevo_api') {
      if (!provider.apiKey) {
        throw new Error('Missing Brevo API key.');
      }

      const response = await fetch(`${provider.apiBaseUrl || getBrevoApiBase()}/account`, {
        headers: {
          Accept: 'application/json',
          'api-key': provider.apiKey,
        },
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Brevo verification failed (${response.status}): ${errorText}`);
      }
    } else {
      if (!provider.smtpHost || !provider.smtpPort || !provider.smtpUsername || !provider.smtpPassword) {
        throw new Error('Missing SMTP host, port, username, or password.');
      }

      const transport = nodemailer.createTransport({
        host: provider.smtpHost,
        port: provider.smtpPort,
        secure: provider.smtpSecure ?? provider.smtpPort === 465,
        auth: {
          user: provider.smtpUsername,
          pass: provider.smtpPassword,
        },
      });

      await transport.verify();
      await transport.close();
    }

    const result: ProviderVerificationResult = {
      success: true,
      status: 'healthy',
      message: `${provider.name} verified successfully.`,
    };
    await updateProviderHealth(provider.id, result);
    return result;
  } catch (error: any) {
    const result: ProviderVerificationResult = {
      success: false,
      status: 'degraded',
      message: error.message || 'Provider verification failed.',
    };
    await updateProviderHealth(provider.id, result);
    return result;
  }
}

export async function sendCampaignProviderTestEmail(providerId: string, params: {
  to: string;
  subject: string;
  html: string;
  text?: string;
  fromEmail?: string;
  fromName?: string;
  replyTo?: string;
}): Promise {
  try {
    const provider = await resolveProviderForSend(providerId, null);
    const result = await sendViaProvider(provider, {
      to: params.to,
      from: params.fromEmail || provider.defaultFromEmail || provider.smtpUsername || `noreply@${provider.apiDomain || 'example.com'}`,
      fromName: params.fromName || provider.defaultFromName || undefined,
      replyTo: params.replyTo || provider.replyToEmail || undefined,
      subject: params.subject,
      html: params.html,
      text: params.text,
      sendId: `test-${Date.now()}`,
      tags: ['test-email'],
    });

    return {
      success: true,
      provider: provider.name,
      messageId: result.messageId,
    };
  } catch (error: any) {
    return {
      success: false,
      provider: providerId,
      error: error.message || 'Test email failed.',
    };
  }
}

export async function sendCampaignEmail(params: SendCampaignEmailParams): Promise {
  const provider = await resolveProviderForSend(params.providerId, params.providerKey);
  const result = await sendViaProvider(provider, params.options);

  return {
    messageId: result.messageId,
    providerId: provider.id,
    providerKey: result.providerKey,
    providerName: provider.name,
  };
}

export async function bindSenderProfileToCampaignEmailProvider(senderProfileId: string, providerId: string | null): Promise {
  await ensureCampaignEmailSchema();

  if (!providerId || providerId === MAILGUN_ENV_PROVIDER_ID || providerId === BREVO_ENV_PROVIDER_ID) {
    await db
      .delete(campaignEmailSenderBindings)
      .where(eq(campaignEmailSenderBindings.senderProfileId, senderProfileId));
    return;
  }

  await db.execute(sql`
    INSERT INTO campaign_email_sender_bindings (sender_profile_id, provider_id, created_at, updated_at)
    VALUES (${senderProfileId}, ${providerId}, NOW(), NOW())
    ON CONFLICT (sender_profile_id)
    DO UPDATE SET provider_id = EXCLUDED.provider_id, updated_at = NOW()
  `);
}

export async function bindDomainToCampaignEmailProvider(domainAuthId: number, providerId: string | null): Promise {
  await ensureCampaignEmailSchema();

  if (!providerId || providerId === MAILGUN_ENV_PROVIDER_ID || providerId === BREVO_ENV_PROVIDER_ID) {
    await db
      .delete(campaignEmailDomainBindings)
      .where(eq(campaignEmailDomainBindings.domainAuthId, domainAuthId));
    return;
  }

  await db.execute(sql`
    INSERT INTO campaign_email_domain_bindings (domain_auth_id, provider_id, created_at, updated_at)
    VALUES (${domainAuthId}, ${providerId}, NOW(), NOW())
    ON CONFLICT (domain_auth_id)
    DO UPDATE SET provider_id = EXCLUDED.provider_id, updated_at = NOW()
  `);
}

export async function getCampaignEmailProviderBindingForSender(senderProfileId: string): Promise {
  await ensureCampaignEmailSchema();

  const rows = await db
    .select({
      provider: campaignEmailProviders,
    })
    .from(campaignEmailSenderBindings)
    .innerJoin(campaignEmailProviders, eq(campaignEmailSenderBindings.providerId, campaignEmailProviders.id))
    .where(eq(campaignEmailSenderBindings.senderProfileId, senderProfileId))
    .limit(1);

  return rows[0]?.provider ? sanitizeProvider(rows[0].provider) : null;
}

export async function getCampaignEmailProviderBindingForDomain(domainAuthId: number): Promise {
  await ensureCampaignEmailSchema();

  const rows = await db
    .select({
      provider: campaignEmailProviders,
    })
    .from(campaignEmailDomainBindings)
    .innerJoin(campaignEmailProviders, eq(campaignEmailDomainBindings.providerId, campaignEmailProviders.id))
    .where(eq(campaignEmailDomainBindings.domainAuthId, domainAuthId))
    .limit(1);

  return rows[0]?.provider ? sanitizeProvider(rows[0].provider) : null;
}

export async function resolveCampaignEmailProviderForSenderProfile(profile: SenderProfile | null | undefined): Promise {
  if (!profile) return null;

  const bound = await getCampaignEmailProviderBindingForSender(profile.id);
  if (bound) return bound;

  const legacyProviderKey = inferLegacyProviderKey(profile);
  if (legacyProviderKey) {
    const provider = await resolveProviderByKey(legacyProviderKey);
    if (provider) {
      const { apiKey, smtpPassword, webhookSigningKey, ...sanitized } = provider;
      return sanitized;
    }
  }

  const defaultProvider = await resolveDefaultProvider();
  if (!defaultProvider) return null;
  const { apiKey, smtpPassword, webhookSigningKey, ...sanitized } = defaultProvider;
  return sanitized;
}

export async function generateDnsRecordsForCampaignEmailProvider(params: {
  providerId?: string | null;
  providerKey?: string | null;
  domain: string;
  subdomain?: string;
  region?: 'US' | 'EU';
  dkimSelector?: string;
  includeTracking?: boolean;
  dmarcPolicy?: 'none' | 'quarantine' | 'reject';
}): Promise {
  const provider = params.providerId
    ? await getCampaignEmailProvider(params.providerId)
    : params.providerKey
      ? await resolveProviderByKey(params.providerKey)
      : null;

  const normalizedProviderKey = normalizeProviderKey(provider?.providerKey || params.providerKey || null);

  if (normalizedProviderKey === 'mailgun' || normalizedProviderKey === 'ses' || normalizedProviderKey === 'sendgrid') {
    return domainDnsGenerator.generateAllDnsRecords({
      domain: params.domain,
      subdomain: params.subdomain,
      provider: normalizedProviderKey as 'mailgun' | 'ses' | 'sendgrid',
      region: params.region,
      dkimSelector: params.dkimSelector,
      includeTracking: params.includeTracking,
      dmarcPolicy: params.dmarcPolicy,
    });
  }

  const customProvider = provider
    ? {
        ...provider,
        apiKeyConfigured: !!provider.apiKey,
        smtpPasswordConfigured: !!provider.smtpPassword,
      }
    : null;

  return buildCustomDnsRecords({
    domain: params.domain,
    subdomain: params.subdomain,
    provider: customProvider,
    dkimSelector: params.dkimSelector,
    dmarcPolicy: params.dmarcPolicy,
    includeTracking: params.includeTracking,
  });
}

export async function getDomainValidationExpectations(providerId?: string | null, providerKey?: string | null): Promise {
  const provider = providerId
    ? await getCampaignEmailProvider(providerId)
    : providerKey
      ? await resolveProviderByKey(providerKey)
      : null;

  const dnsProfile = provider?.dnsProfile || normalizeDnsProfile(provider?.providerKey || providerKey || 'custom');
  return {
    expectedSpfIncludes: dnsProfile.spfInclude ? [dnsProfile.spfInclude] : [],
    expectedDkimTarget: dnsProfile.dkimType === 'cname' ? dnsProfile.dkimValue : undefined,
    expectedDmarcPolicy: dnsProfile.dmarcPolicy,
    trackingSubdomain: dnsProfile.trackingHost || undefined,
  };
}

export async function getCampaignEmailManagementOverview(): Promise {
  await ensureCampaignEmailSchema();

  const providers = await listCampaignEmailProviders();
  const [{ count: senderBindingCount }] = await db
    .select({ count: sql`count(*)` })
    .from(campaignEmailSenderBindings);

  const [{ count: domainBindingCount }] = await db
    .select({ count: sql`count(*)` })
    .from(campaignEmailDomainBindings);

  const defaultProvider = providers.find((provider) => provider.isDefault)
    || providers.find((provider) => provider.source === 'environment')
    || null;

  return {
    providers,
    providerCount: providers.length,
    healthyProviders: providers.filter((provider) => provider.healthStatus === 'healthy' || provider.source === 'environment').length,
    defaultProviderId: defaultProvider?.id || null,
    senderBindingCount: Number(senderBindingCount || 0),
    domainBindingCount: Number(domainBindingCount || 0),
  };
}

export const campaignEmailProviderService = {
  ensureCampaignEmailSchema,
  listCampaignEmailProviders,
  getCampaignEmailProvider,
  createCampaignEmailProvider,
  updateCampaignEmailProvider,
  deleteCampaignEmailProvider,
  verifyCampaignEmailProvider,
  sendCampaignProviderTestEmail,
  sendCampaignEmail,
  bindSenderProfileToCampaignEmailProvider,
  bindDomainToCampaignEmailProvider,
  getCampaignEmailProviderBindingForSender,
  getCampaignEmailProviderBindingForDomain,
  resolveCampaignEmailProviderForSenderProfile,
  generateDnsRecordsForCampaignEmailProvider,
  getDomainValidationExpectations,
  getCampaignEmailManagementOverview,
};