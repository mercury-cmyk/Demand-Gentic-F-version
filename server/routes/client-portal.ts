import { Router, Request, Response, NextFunction } from 'express';
import crypto from 'crypto';
import { db } from '../db';
import { eq, and, desc, sql, or, like, isNotNull, asc, inArray, gte } from 'drizzle-orm';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import {
  clientAccounts,
  clientUsers,
  clientProjects,
  clientCampaignAccess,
  clientPortalOrders,
  clientPortalOrderContacts,
  verificationCampaigns,
  verificationContacts,
  clientPortalActivityLogs,
  insertClientAccountSchema,
  insertClientUserSchema,
  insertClientCampaignAccessSchema,
  insertClientPortalOrderSchema,
  workOrders,
  // QA-approved leads system
  leads,
  dialerCallAttempts,
  callSessions,
  leadComments,
  campaigns,
  campaignQueue,
  contacts,
  accounts,
  lists,
  users,
  clientProjectCampaigns,
  campaignIntakeRequests,
  clientCampaigns,
  passwordResetTokens,
} from '@shared/schema';
import { requireAuth, requireRole } from '../auth';
import { z } from 'zod';
import { notificationService } from '../services/notification-service';
import { transactionalEmailService } from '../services/transactional-email-service';

// Import enhanced client portal route modules
import clientPortalProjectsRouter from './client-portal-projects';
import clientPortalBillingRouter from './client-portal-billing';
import clientPortalVoiceRouter from './client-portal-voice';
import clientPortalAdminBillingRouter from './client-portal-admin-billing';
import clientPortalAgentRouter from './client-portal-agent';
import clientPortalAgenticRouter from './client-portal-agentic';
import clientPortalSimulationRouter from './client-portal-simulation';
import clientPortalSettingsRouter from './client-portal-settings';
import clientPortalCrmRouter from './client-portal-crm';
import clientPortalCampaignsRouter from './client-portal-campaigns';
import clientPortalBookingsRouter from './client-portal-bookings';
import clientPortalOrdersRouter from './client-portal-orders';
import argyleEventsRouter from '../integrations/argyle_events/routes';
import { ukefReportsRouter } from '../integrations/ukef_reports';
import { ukefTranscriptQaRouter } from '../integrations/ukef_transcript_qa';
import clientPortalWorkOrdersRouter from './client-portal-work-orders';
import clientPortalAnalyticsRouter from './client-portal-analytics';
import { fetchTelnyxRecordings } from '../services/telnyx-sync-service';
import { getPlayableRecordingLink } from '../services/recording-link-resolver';
import { canonicalizeGcsRecordingUrl } from '../lib/recording-url-policy';

const router = Router();

async function logClientPortalActivity(params: {
  clientAccountId: string;
  clientUserId?: string;
  entityType: string;
  entityId: string;
  action: string;
  details?: any;
}) {
  try {
    await db.insert(clientPortalActivityLogs).values({
      clientAccountId: params.clientAccountId,
      clientUserId: params.clientUserId || null,
      entityType: params.entityType,
      entityId: params.entityId,
      action: params.action,
      details: params.details ?? null,
    });
  } catch (err) {
    console.error('[CLIENT PORTAL] Activity log error:', err);
  }
}

const JWT_SECRET = process.env.JWT_SECRET || "development-secret-key-change-in-production";
const JWT_EXPIRES_IN = "7d";
const PORTAL_BASE_URL =
  process.env.CLIENT_PORTAL_BASE_URL ||
  process.env.APP_BASE_URL ||
  process.env.MSFT_OAUTH_APP_URL ||
  "";

export interface ClientJWTPayload {
  clientUserId: string;
  clientAccountId: string;
  email: string;
  firstName: string | null;
  lastName: string | null;
  isClient: true;
  isOwner?: boolean;
}

interface ClientRecordingStreamTokenPayload {
  recordingId: string;
  clientUserId: string;
  clientAccountId: string;
  isClientRecordingStream: true;
}

type TutorialVideoProvider = 'google_drive' | 'youtube' | 'loom' | 'vimeo' | 'other';

interface ClientTutorialVideo {
  id: string;
  title: string;
  description?: string | null;
  url: string;
  embedUrl: string;
  provider: TutorialVideoProvider;
  thumbnailUrl?: string | null;
  durationSeconds?: number | null;
  sortOrder: number;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

function detectTutorialVideoProvider(url: string): TutorialVideoProvider {
  const value = (url || '').toLowerCase();
  if (value.includes('drive.google.com')) return 'google_drive';
  if (value.includes('youtube.com') || value.includes('youtu.be')) return 'youtube';
  if (value.includes('loom.com')) return 'loom';
  if (value.includes('vimeo.com')) return 'vimeo';
  return 'other';
}

function normalizeDriveEmbedUrl(url: string): string {
  if (!url) return '';
  if (!url.includes('drive.google.com')) return url;

  const fileIdMatch = url.match(/\/file\/d\/([^/]+)/);
  if (fileIdMatch?.[1]) {
    return `https://drive.google.com/file/d/${fileIdMatch[1]}/preview`;
  }

  const idParamMatch = url.match(/[?&]id=([^&]+)/);
  if (idParamMatch?.[1]) {
    return `https://drive.google.com/file/d/${idParamMatch[1]}/preview`;
  }

  const ucIdMatch = url.match(/\/uc\?id=([^&]+)/);
  if (ucIdMatch?.[1]) {
    return `https://drive.google.com/file/d/${ucIdMatch[1]}/preview`;
  }

  return url;
}

function sanitizeTutorialVideo(input: unknown, fallbackSortOrder = 0): ClientTutorialVideo | null {
  if (!input || typeof input !== 'object') return null;
  const raw = input as Record<string, unknown>;

  const title = typeof raw.title === 'string' ? raw.title.trim() : '';
  const url = typeof raw.url === 'string' ? raw.url.trim() : '';
  if (!title || !url) return null;

  const provider =
    typeof raw.provider === 'string'
      ? (raw.provider as TutorialVideoProvider)
      : detectTutorialVideoProvider(url);
  const embedUrlCandidate = typeof raw.embedUrl === 'string' ? raw.embedUrl.trim() : '';
  const embedUrl = embedUrlCandidate || normalizeDriveEmbedUrl(url);

  const nowIso = new Date().toISOString();
  const sortOrderRaw = raw.sortOrder;
  const sortOrder =
    typeof sortOrderRaw === 'number' && Number.isFinite(sortOrderRaw)
      ? sortOrderRaw
      : fallbackSortOrder;

  const durationRaw = raw.durationSeconds;
  const durationSeconds =
    typeof durationRaw === 'number' && Number.isFinite(durationRaw) && durationRaw >= 0
      ? durationRaw
      : null;

  const isActive = typeof raw.isActive === 'boolean' ? raw.isActive : true;

  return {
    id: typeof raw.id === 'string' && raw.id.trim() ? raw.id : crypto.randomUUID(),
    title,
    description: typeof raw.description === 'string' ? raw.description.trim() : null,
    url,
    embedUrl,
    provider,
    thumbnailUrl: typeof raw.thumbnailUrl === 'string' ? raw.thumbnailUrl.trim() : null,
    durationSeconds,
    sortOrder,
    isActive,
    createdAt: typeof raw.createdAt === 'string' ? raw.createdAt : nowIso,
    updatedAt: typeof raw.updatedAt === 'string' ? raw.updatedAt : nowIso,
  };
}

function getClientTutorialVideosFromSettings(settings: unknown): ClientTutorialVideo[] {
  if (!settings || typeof settings !== 'object') return [];
  const videosRaw = (settings as Record<string, unknown>).tutorialVideos;
  if (!Array.isArray(videosRaw)) return [];

  return videosRaw
    .map((item, index) => sanitizeTutorialVideo(item, index))
    .filter((item): item is ClientTutorialVideo => Boolean(item))
    .sort((a, b) => a.sortOrder - b.sortOrder);
}

const tutorialVideoInputSchema = z.object({
  title: z.string().min(1).max(200),
  description: z.string().max(2000).optional().nullable(),
  url: z.string().url(),
  embedUrl: z.string().url().optional().nullable(),
  thumbnailUrl: z.string().url().optional().nullable(),
  durationSeconds: z.number().int().min(0).optional().nullable(),
  sortOrder: z.number().int().optional(),
  isActive: z.boolean().optional(),
});

function buildTutorialVideoFromInput(
  input: z.infer<typeof tutorialVideoInputSchema>,
  existing?: ClientTutorialVideo,
  defaultSortOrder?: number,
): ClientTutorialVideo {
  const nowIso = new Date().toISOString();
  const provider = detectTutorialVideoProvider(input.url);
  const embedUrl = input.embedUrl?.trim() || normalizeDriveEmbedUrl(input.url.trim());

  return {
    id: existing?.id || crypto.randomUUID(),
    title: input.title.trim(),
    description: input.description?.trim() || null,
    url: input.url.trim(),
    embedUrl,
    provider,
    thumbnailUrl: input.thumbnailUrl?.trim() || null,
    durationSeconds: input.durationSeconds ?? null,
    sortOrder: input.sortOrder ?? existing?.sortOrder ?? defaultSortOrder ?? 0,
    isActive: input.isActive ?? existing?.isActive ?? true,
    createdAt: existing?.createdAt || nowIso,
    updatedAt: nowIso,
  };
}

async function saveClientTutorialVideos(clientId: string, videos: ClientTutorialVideo[]) {
  const [client] = await db
    .select({ settings: clientAccounts.settings })
    .from(clientAccounts)
    .where(eq(clientAccounts.id, clientId))
    .limit(1);

  if (!client) {
    return null;
  }

  const currentSettings = (client.settings as Record<string, unknown>) || {};
  const nextSettings = {
    ...currentSettings,
    tutorialVideos: videos,
  };

  const [updated] = await db
    .update(clientAccounts)
    .set({
      settings: nextSettings,
      updatedAt: new Date(),
    })
    .where(eq(clientAccounts.id, clientId))
    .returning({
      id: clientAccounts.id,
      settings: clientAccounts.settings,
    });

  return updated;
}

function normalizePhoneDigits(value: string | null | undefined): string {
  return (value || '').replace(/\D/g, '');
}

function formatPhoneForTelnyx(value: string | null | undefined): string | undefined {
  if (!value) return undefined;
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  if (trimmed.startsWith('+')) return trimmed;

  const digits = normalizePhoneDigits(trimmed);
  if (!digits) return undefined;
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith('1')) return `+${digits}`;
  return `+${digits}`;
}

function resolveQualifiedLeadRecordingUrl(
  recordingUrl: string | null | undefined,
  recordingS3Key: string | null | undefined,
): string | null {
  return canonicalizeGcsRecordingUrl({
    recordingUrl,
    recordingS3Key,
  });
}

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number, label: string): Promise<T> {
  let timeoutId: NodeJS.Timeout | null = null;
  const timeoutPromise = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(() => {
      reject(new Error(`${label} timed out after ${timeoutMs}ms`));
    }, timeoutMs);
  });

  try {
    return await Promise.race([promise, timeoutPromise]);
  } finally {
    if (timeoutId) clearTimeout(timeoutId);
  }
}

declare global {
  namespace Express {
    interface Request {
      clientUser?: ClientJWTPayload;
    }
  }
}

function generateInviteSlug() {
  return `join_${crypto.randomBytes(6).toString('hex')}`;
}

function normalizeDomains(input: unknown): string[] {
  if (!input) return [];
  const raw = Array.isArray(input) ? input : String(input).split(',');
  const unique = new Set(
    raw
      .map((d) => d.trim().toLowerCase())
      .filter((d) => d && /^[a-z0-9.-]+\.[a-z]{2,}$/i.test(d)),
  );
  return Array.from(unique);
}

function buildJoinUrl(slug: string) {
  if (PORTAL_BASE_URL) {
    const baseUrl = PORTAL_BASE_URL.replace(/\/$/, '');
    return baseUrl + '/client-portal/join/' + slug;
  }
  return '/client-portal/join/' + slug;
}

function generateClientToken(clientUser: typeof clientUsers.$inferSelect, isOwner = false): string {
  const payload: ClientJWTPayload = {
    clientUserId: clientUser.id,
    clientAccountId: clientUser.clientAccountId,
    email: clientUser.email,
    firstName: clientUser.firstName,
    lastName: clientUser.lastName,
    isClient: true,
    ...(isOwner && { isOwner: true }),
  };
  return jwt.sign(payload, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });
}

function requireClientAuth(req: Request, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ message: "Authentication required" });
  }

  const token = authHeader.substring(7);

  // Check for null/undefined token
  if (!token || token === 'null' || token === 'undefined') {
    return res.status(401).json({ message: "Invalid token - please log in again" });
  }

  try {
    const payload = jwt.verify(token, JWT_SECRET) as ClientJWTPayload;
    if (!payload.isClient) {
      return res.status(401).json({ message: "Invalid client token" });
    }
    req.clientUser = payload;
    next();
  } catch {
    return res.status(401).json({ message: "Invalid or expired token" });
  }
}

function generateOrderNumber(): string {
  const date = new Date();
  const dateStr = `${date.getFullYear()}${String(date.getMonth() + 1).padStart(2, '0')}`;
  const random = Math.random().toString(36).substring(2, 8).toUpperCase();
  return `ORD-${dateStr}-${random}`;
}

// ==================== MOUNT ENHANCED CLIENT PORTAL ROUTES ====================
// These routes require client authentication
router.use('/projects', requireClientAuth, clientPortalProjectsRouter);
router.use('/billing', requireClientAuth, clientPortalBillingRouter);
router.use('/voice', requireClientAuth, clientPortalVoiceRouter);
router.use('/agent', requireClientAuth, clientPortalAgentRouter);
router.use('/agentic', requireClientAuth, clientPortalAgenticRouter);
router.use('/simulation', requireClientAuth, clientPortalSimulationRouter);
router.use('/settings', requireClientAuth, clientPortalSettingsRouter);
router.use('/crm', requireClientAuth, clientPortalCrmRouter);
router.use('/bookings', requireClientAuth, clientPortalBookingsRouter);
router.use('/orders', requireClientAuth, clientPortalOrdersRouter);

// Canonical work orders (Direct Agentic Orders) — used by Work Orders tab + Upcoming Events
router.use('/work-orders', requireClientAuth, clientPortalWorkOrdersRouter);

// Argyle event-sourced campaign drafts (feature-flagged, client-gated)
router.use('/argyle-events', requireClientAuth, argyleEventsRouter);

// UKEF campaign reports with lead evidence & QA (feature-flagged, client-gated)
router.use('/ukef-reports', requireClientAuth, ukefReportsRouter);

// UKEF transcript quality + disposition validation (feature-flagged, client-gated)
router.use('/ukef-transcript-qa', requireClientAuth, ukefTranscriptQaRouter);

// Campaigns (Client wizard and management)
/**
 * GET /campaigns/:campaignId/preview-audience
 * Get a sample of accounts and contacts from a campaign's audience for preview purposes
 * Returns 5-10 sample accounts and 20-30 sample contacts for the client to preview personalization
 */
router.get('/campaigns/:campaignId/preview-audience', requireClientAuth, async (req, res) => {
  const { campaignId } = req.params;
  console.log('[CLIENT PORTAL] preview-audience - campaignId:', campaignId);

  try {
    const clientAccountId = req.clientUser!.clientAccountId;

    // Verify client has access — check ALL possible access paths (union approach)
    const accessChecks = await Promise.all([
      // 1. clientCampaignAccess table (verification or regular campaign link)
      db.select({ id: clientCampaignAccess.id }).from(clientCampaignAccess).where(and(eq(clientCampaignAccess.clientAccountId, clientAccountId), or(eq(clientCampaignAccess.campaignId, campaignId), eq(clientCampaignAccess.regularCampaignId, campaignId)))).limit(1),
      // 2. workOrders table
      db.select({ id: workOrders.id }).from(workOrders).where(and(eq(workOrders.clientAccountId, clientAccountId), eq(workOrders.campaignId, campaignId))).limit(1),
      // 3. campaignIntakeRequests table
      db.select({ id: campaignIntakeRequests.id }).from(campaignIntakeRequests).where(and(eq(campaignIntakeRequests.clientAccountId, clientAccountId), eq(campaignIntakeRequests.campaignId, campaignId))).limit(1),
      // 4. campaigns.clientAccountId (campaigns created by admins or via client portal wizard)
      db.select({ id: campaigns.id }).from(campaigns).where(and(eq(campaigns.id, campaignId), eq(campaigns.clientAccountId, clientAccountId))).limit(1),
      // 5. clientCampaigns table (client-portal-created campaigns)
      db.select({ id: clientCampaigns.id }).from(clientCampaigns).where(and(eq(clientCampaigns.id, campaignId), eq(clientCampaigns.clientAccountId, clientAccountId))).limit(1),
    ]);

    const hasAccess = accessChecks.some(result => result.length > 0);
    console.log('[CLIENT PORTAL] preview-audience: client', clientAccountId, 'campaign', campaignId, 'access:', hasAccess, 'checks:', accessChecks.map((r, i) => `${['campaignAccess', 'workOrder', 'intake', 'directCampaign', 'clientCampaign'][i]}=${r.length > 0}`).join(', '));

    if (!hasAccess) {
      return res.status(403).json({ message: "You don't have access to this campaign" });
    }

    // Try to get campaign details
    const [verificationCampaign] = await db.select().from(verificationCampaigns).where(eq(verificationCampaigns.id, campaignId)).limit(1);

    if (verificationCampaign) {
      const sampleContacts = await db.select({ id: verificationContacts.id, firstName: verificationContacts.firstName, lastName: verificationContacts.lastName, email: verificationContacts.email, phone: verificationContacts.phone, title: verificationContacts.title, company: verificationContacts.companyKey }).from(verificationContacts).where(eq(verificationContacts.campaignId, campaignId)).limit(30);
      console.log('[CLIENT PORTAL] preview-audience: verification campaign found, contacts:', sampleContacts.length);

      const accountsMap = new Map();
      for (const contact of sampleContacts) {
        const companyName = contact.company || 'Unknown Company';
        if (!accountsMap.has(companyName)) accountsMap.set(companyName, { name: companyName, contactCount: 0 });
        accountsMap.get(companyName).contactCount++;
      }
      const sampleAccounts = Array.from(accountsMap.entries()).slice(0, 10).map(([k, v], i) => ({ id: `company_${i}`, name: v.name, contactCount: v.contactCount }));

      return res.json({ campaign: { id: verificationCampaign.id, name: verificationCampaign.name, status: verificationCampaign.status, type: 'verification' }, accounts: sampleAccounts, contacts: sampleContacts, totalAccountsAvailable: accountsMap.size, totalContactsAvailable: sampleContacts.length });
    }

    const [regularCampaign] = await db.select().from(campaigns).where(eq(campaigns.id, campaignId)).limit(1);
    if (regularCampaign) {
      let sampleContactsData: any[] = [];

      // 1. Try campaign queue first (LEFT join accounts so contacts without accountId aren't dropped)
      const queueContacts = await db.select({
        id: contacts.id, firstName: contacts.firstName, lastName: contacts.lastName,
        email: contacts.email, phone: contacts.directPhone, title: contacts.jobTitle,
        accountId: contacts.accountId, companyNorm: contacts.companyNorm,
        accountName: accounts.name, accountWebsite: accounts.websiteDomain, accountIndustry: accounts.industryStandardized,
      }).from(campaignQueue)
        .innerJoin(contacts, eq(campaignQueue.contactId, contacts.id))
        .leftJoin(accounts, eq(contacts.accountId, accounts.id))
        .where(eq(campaignQueue.campaignId, campaignId)).limit(30);
      console.log('[CLIENT PORTAL] preview-audience: regular campaign, queueContacts:', queueContacts.length);

      if (queueContacts.length > 0) {
        sampleContactsData = queueContacts.map(c => ({
          ...c,
          accountName: c.accountName || c.companyNorm || 'Unknown Company',
        }));
      } else {
        // 2. Fall back to audienceRefs (lists, segments, filterGroups)
        const audienceRefs = regularCampaign.audienceRefs as any;
        console.log('[CLIENT PORTAL] preview-audience: no queue contacts, audienceRefs:', JSON.stringify(audienceRefs));
        if (audienceRefs) {
           const listIds = audienceRefs.lists || audienceRefs.selectedLists || [];
           console.log('[CLIENT PORTAL] preview-audience: listIds:', listIds);
           if (Array.isArray(listIds) && listIds.length > 0) {
              const campaignLists = await db.select({ recordIds: lists.recordIds }).from(lists).where(inArray(lists.id, listIds));
              console.log('[CLIENT PORTAL] preview-audience: found', campaignLists.length, 'lists, recordIds counts:', campaignLists.map(l => l.recordIds?.length || 0));
              let contactIds: string[] = [];
              for(const l of campaignLists) if(l.recordIds && Array.isArray(l.recordIds)) contactIds.push(...l.recordIds);
              contactIds = [...new Set(contactIds)].slice(0, 30);
              console.log('[CLIENT PORTAL] preview-audience: unique contactIds:', contactIds.length);
              if(contactIds.length > 0) {
                 const listContacts = await db.select({
                   id: contacts.id, firstName: contacts.firstName, lastName: contacts.lastName,
                   email: contacts.email, phone: contacts.directPhone, title: contacts.jobTitle,
                   accountId: contacts.accountId, companyNorm: contacts.companyNorm,
                   accountName: accounts.name, accountWebsite: accounts.websiteDomain, accountIndustry: accounts.industryStandardized,
                 }).from(contacts)
                   .leftJoin(accounts, eq(contacts.accountId, accounts.id))
                   .where(inArray(contacts.id, contactIds)).limit(30);
                 console.log('[CLIENT PORTAL] preview-audience: fetched contacts:', listContacts.length, 'with accountIds:', listContacts.map(c => c.accountId).filter(Boolean).length, 'with companyNorm:', listContacts.map(c => c.companyNorm).filter(Boolean).length);
                 sampleContactsData = listContacts.map(c => ({
                   ...c,
                   accountName: c.accountName || c.companyNorm || 'Unknown Company',
                 }));
              }
           }
        }
      }

      // Build accounts map — use accountId if available, otherwise group by companyNorm/accountName
      const accountsMap = new Map<string, { id: string; name: string; website?: string | null; industry?: string | null }>();
      for (const c of sampleContactsData) {
        if (c.accountId && !accountsMap.has(c.accountId)) {
          accountsMap.set(c.accountId, { id: c.accountId, name: c.accountName || 'Unknown', website: c.accountWebsite, industry: c.accountIndustry });
        } else if (!c.accountId && c.accountName && !accountsMap.has(`company_${c.accountName}`)) {
          // Contacts without accountId — group by company name (like verification campaigns)
          accountsMap.set(`company_${c.accountName}`, { id: `company_${c.accountName}`, name: c.accountName, website: null, industry: null });
        }
      }
      console.log('[CLIENT PORTAL] preview-audience: final accounts:', accountsMap.size, 'contacts:', sampleContactsData.length);

      return res.json({
        campaign: { id: regularCampaign.id, name: regularCampaign.name, status: regularCampaign.status, type: 'regular' },
        accounts: Array.from(accountsMap.values()).slice(0, 10),
        contacts: sampleContactsData.map(c => ({ ...c, company: c.accountName })),
        totalAccountsAvailable: accountsMap.size,
        totalContactsAvailable: sampleContactsData.length,
      });
    }

    console.log('[CLIENT PORTAL] preview-audience: campaign not found in either table');
    res.status(404).json({ message: "Campaign not found" });
  } catch (error) {
    console.error('[CLIENT PORTAL] Get preview audience error:', error);
    res.status(500).json({ message: "Failed to get preview audience" });
  }
});

router.use('/campaigns', requireClientAuth, clientPortalCampaignsRouter);

// Admin routes for billing/invoice management (requires admin auth)
router.use('/admin', clientPortalAdminBillingRouter);

// ==================== CLIENT INVITE / SELF-SERVE SIGNUP ====================

router.get('/invite/:slug', async (req, res) => {
  try {
    const { slug } = req.params;
    const [client] = await db
      .select({
        id: clientAccounts.id,
        name: clientAccounts.name,
        inviteDomains: clientAccounts.inviteDomains,
        inviteEnabled: clientAccounts.inviteEnabled,
        isActive: clientAccounts.isActive,
      })
      .from(clientAccounts)
      .where(eq(clientAccounts.inviteSlug, slug))
      .limit(1);

    if (!client || !client.inviteEnabled || !client.isActive) {
      return res.status(404).json({ message: "Invite not found or disabled" });
    }

    return res.json({
      clientName: client.name,
      allowedDomains: client.inviteDomains ?? [],
      joinUrl: buildJoinUrl(slug),
    });
  } catch (error) {
    console.error('[CLIENT PORTAL] Get invite error:', error);
    res.status(500).json({ message: "Failed to fetch invite details" });
  }
});

router.post('/invite/:slug/signup', async (req, res) => {
  try {
    const { slug } = req.params;
    const { email, password, firstName, lastName } = req.body;

    if (!email || !password) {
      return res.status(400).json({ message: "Email and password are required" });
    }

    const domain = email.includes('@') ? email.split('@')[1].toLowerCase() : '';
    if (!domain) {
      return res.status(400).json({ message: "Invalid email" });
    }

    const [client] = await db
      .select({
        id: clientAccounts.id,
        name: clientAccounts.name,
        inviteDomains: clientAccounts.inviteDomains,
        inviteEnabled: clientAccounts.inviteEnabled,
        isActive: clientAccounts.isActive,
      })
      .from(clientAccounts)
      .where(eq(clientAccounts.inviteSlug, slug))
      .limit(1);

    if (!client || !client.inviteEnabled || !client.isActive) {
      return res.status(404).json({ message: "Invite not found or disabled" });
    }

    const allowedDomains = client.inviteDomains ?? [];
    if (allowedDomains.length === 0) {
      return res.status(403).json({ message: "Self-serve signup is disabled for this client" });
    }
    if (!allowedDomains.map((d) => d.toLowerCase()).includes(domain)) {
      return res.status(403).json({ message: "Email domain is not allowed for this invite" });
    }

    // Avoid duplicate user creation
    const [existingUser] = await db
      .select()
      .from(clientUsers)
      .where(eq(clientUsers.email, email.toLowerCase()))
      .limit(1);

    if (existingUser) {
      return res.status(409).json({ message: "An account already exists for this email" });
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const [user] = await db
      .insert(clientUsers)
      .values({
        clientAccountId: client.id,
        email: email.toLowerCase(),
        password: hashedPassword,
        firstName,
        lastName,
      })
      .returning();

    const token = generateClientToken(user);
    return res.status(201).json({
      token,
      user: {
        id: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
      },
      client: {
        id: client.id,
        name: client.name,
      },
    });
  } catch (error) {
    console.error('[CLIENT PORTAL] Invite signup error:', error);
    res.status(500).json({ message: "Failed to complete signup" });
  }
});

// ==================== CLIENT AUTHENTICATION ====================

router.post('/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ message: "Email and password required" });
    }

    const [clientUser] = await db
      .select()
      .from(clientUsers)
      .where(eq(clientUsers.email, email.toLowerCase()))
      .limit(1);

    if (!clientUser) {
      return res.status(401).json({ message: "Invalid credentials" });
    }

    if (!clientUser.isActive) {
      return res.status(401).json({ message: "Account is disabled" });
    }

    const isValidPassword = await bcrypt.compare(password, clientUser.password);
    if (!isValidPassword) {
      return res.status(401).json({ message: "Invalid credentials" });
    }

    await db
      .update(clientUsers)
      .set({ lastLoginAt: new Date() })
      .where(eq(clientUsers.id, clientUser.id));

    // Check if this client user is also a platform admin (super admin / owner)
    const [platformUser] = await db
      .select({ role: users.role })
      .from(users)
      .where(eq(users.email, clientUser.email.toLowerCase()))
      .limit(1);
    const isOwner = platformUser?.role === 'admin';

    const token = generateClientToken(clientUser, isOwner);

    const [account] = await db
      .select()
      .from(clientAccounts)
      .where(eq(clientAccounts.id, clientUser.clientAccountId))
      .limit(1);

    res.json({
      token,
      user: {
        id: clientUser.id,
        email: clientUser.email,
        firstName: clientUser.firstName,
        lastName: clientUser.lastName,
        clientAccountId: clientUser.clientAccountId,
        clientAccountName: account?.name || 'Unknown',
        isOwner,
      },
    });
  } catch (error) {
    console.error('[CLIENT PORTAL] Login error:', error);
    res.status(500).json({ message: "Login failed" });
  }
});

router.get('/auth/me', requireClientAuth, async (req, res) => {
  try {
    const [clientUser] = await db
      .select()
      .from(clientUsers)
      .where(eq(clientUsers.id, req.clientUser!.clientUserId))
      .limit(1);

    if (!clientUser) {
      return res.status(404).json({ message: "User not found" });
    }

    const [account] = await db
      .select()
      .from(clientAccounts)
      .where(eq(clientAccounts.id, clientUser.clientAccountId))
      .limit(1);

    res.json({
      user: {
        id: clientUser.id,
        email: clientUser.email,
        firstName: clientUser.firstName,
        lastName: clientUser.lastName,
        clientAccount: account,
        isOwner: req.clientUser!.isOwner || false,
      },
    });
  } catch (error) {
    console.error('[CLIENT PORTAL] Get me error:', error);
    res.status(500).json({ message: "Failed to get user" });
  }
});

// Analytics, reports, recordings, conversations, email campaigns
// IMPORTANT: Must be mounted AFTER unauthenticated /auth/* routes to avoid intercepting login
// NOTE: Previously this was `router.use('/', requireClientAuth, analyticsRouter)` which
// acted as a catch-all and blocked /admin/* routes (that use requireAuth, not client auth)
// from ever being reached.  Now we conditionally skip client auth for /admin/* paths.
router.use((req: Request, res: Response, next: NextFunction) => {
  // Let /admin/* requests pass through without client auth — they use requireAuth instead
  if (req.path.startsWith('/admin')) return next();
  // For all other paths, apply client auth then forward to the analytics sub-router
  requireClientAuth(req, res, next);
});
router.use('/', clientPortalAnalyticsRouter);

// ==================== CLIENT ORDERS ====================

router.get('/orders', requireClientAuth, async (req, res) => {
  try {
    const orders = await db
      .select({
        id: clientPortalOrders.id,
        orderNumber: clientPortalOrders.orderNumber,
        status: clientPortalOrders.status,
        createdAt: clientPortalOrders.createdAt,
        updatedAt: clientPortalOrders.updatedAt,
        campaignId: clientPortalOrders.campaignId,
        metadata: clientPortalOrders.metadata,
        requestedQuantity: clientPortalOrders.requestedQuantity,
        approvedQuantity: clientPortalOrders.approvedQuantity,
        deliveredQuantity: clientPortalOrders.deliveredQuantity,
        clientNotes: clientPortalOrders.clientNotes,
      })
      .from(clientPortalOrders)
      .where(eq(clientPortalOrders.clientAccountId, req.clientUser!.clientAccountId))
      .orderBy(desc(clientPortalOrders.createdAt));

    res.json(orders);
  } catch (error) {
    console.error('[CLIENT PORTAL] Get orders error:', error);
    res.status(500).json({ message: "Failed to fetch orders" });
  }
});

router.get('/orders/:id', requireClientAuth, async (req, res) => {
  try {
    const { id } = req.params;
    const [order] = await db
      .select({
        id: clientPortalOrders.id,
        orderNumber: clientPortalOrders.orderNumber,
        status: clientPortalOrders.status,
        createdAt: clientPortalOrders.createdAt,
        updatedAt: clientPortalOrders.updatedAt,
        campaignId: clientPortalOrders.campaignId,
        metadata: clientPortalOrders.metadata,
        requestedQuantity: clientPortalOrders.requestedQuantity,
        approvedQuantity: clientPortalOrders.approvedQuantity,
        deliveredQuantity: clientPortalOrders.deliveredQuantity,
        clientNotes: clientPortalOrders.clientNotes,
        adminNotes: clientPortalOrders.adminNotes,
        rejectionReason: clientPortalOrders.rejectionReason,
      })
      .from(clientPortalOrders)
      .where(
        and(
          eq(clientPortalOrders.id, id),
          eq(clientPortalOrders.clientAccountId, req.clientUser!.clientAccountId)
        )
      )
      .limit(1);

    if (!order) {
      return res.status(404).json({ message: "Order not found" });
    }

    res.json(order);
  } catch (error) {
    console.error('[CLIENT PORTAL] Get order details error:', error);
    res.status(500).json({ message: "Failed to fetch order details" });
  }
});

// ==================== CLIENT CAMPAIGNS ====================

router.get('/campaigns', requireClientAuth, async (req, res) => {
  try {
    const clientAccountId = req.clientUser!.clientAccountId;

    // 1. Fetch Verification Campaigns
    const verificationAccessList = await db
      .select({
        campaign: verificationCampaigns,
      })
      .from(clientCampaignAccess)
      .innerJoin(verificationCampaigns, eq(clientCampaignAccess.campaignId, verificationCampaigns.id))
      .where(
        and(
           eq(clientCampaignAccess.clientAccountId, clientAccountId),
           isNotNull(clientCampaignAccess.campaignId)
        )
      );

    const enrichedVerificationCampaigns = await Promise.all(
      verificationAccessList.map(async ({ campaign }) => {
        const eligibleCount = await db
          .select({ count: sql<number>`count(*)::int` })
          .from(verificationContacts)
          .where(
            and(
              eq(verificationContacts.campaignId, campaign.id),
              eq(verificationContacts.eligibilityStatus, 'Eligible'),
              eq(verificationContacts.reservedSlot, true)
            )
          );

        // Look up project enabledFeatures via junction table
        let enabledFeatures = null;
        const [projectLink] = await db
          .select({ enabledFeatures: clientProjects.enabledFeatures })
          .from(clientProjectCampaigns)
          .innerJoin(clientProjects, eq(clientProjectCampaigns.projectId, clientProjects.id))
          .where(eq(clientProjectCampaigns.campaignId, campaign.id))
          .limit(1);
        if (projectLink) enabledFeatures = projectLink.enabledFeatures;

        return {
          ...campaign,
          type: 'verification',
          eligibleCount: eligibleCount[0]?.count || 0,
          enabledFeatures,
        };
      })
    );

    // 2. Fetch Regular Campaigns — from clientCampaignAccess table
    const regularAccessList = await db
      .select({
        id: campaigns.id,
        name: campaigns.name,
        status: campaigns.status,
        type: campaigns.type,
        projectId: campaigns.projectId,
      })
      .from(clientCampaignAccess)
      .innerJoin(campaigns, eq(clientCampaignAccess.regularCampaignId, campaigns.id))
      .where(
        and(
          eq(clientCampaignAccess.clientAccountId, clientAccountId),
          isNotNull(clientCampaignAccess.regularCampaignId)
        )
      );

    // 3. Fetch campaigns from additional access paths (workOrders, intakeRequests, direct, clientCampaigns)
    const seenIds = new Set(regularAccessList.map(c => c.id));

    // 3a. Via workOrders
    const workOrderCampaigns = await db
      .select({
        id: campaigns.id,
        name: campaigns.name,
        status: campaigns.status,
        type: campaigns.type,
        projectId: campaigns.projectId,
      })
      .from(workOrders)
      .innerJoin(campaigns, eq(workOrders.campaignId, campaigns.id))
      .where(eq(workOrders.clientAccountId, clientAccountId));

    // 3b. Via campaignIntakeRequests
    const intakeCampaigns = await db
      .select({
        id: campaigns.id,
        name: campaigns.name,
        status: campaigns.status,
        type: campaigns.type,
        projectId: campaigns.projectId,
      })
      .from(campaignIntakeRequests)
      .innerJoin(campaigns, eq(campaignIntakeRequests.campaignId, campaigns.id))
      .where(eq(campaignIntakeRequests.clientAccountId, clientAccountId));

    // 3c. Via campaigns.clientAccountId (admin-assigned)
    const directCampaigns = await db
      .select({
        id: campaigns.id,
        name: campaigns.name,
        status: campaigns.status,
        type: campaigns.type,
        projectId: campaigns.projectId,
      })
      .from(campaigns)
      .where(eq(campaigns.clientAccountId, clientAccountId));

    // 3d. Via clientCampaigns table (client-portal-created)
    const clientCreatedCampaigns = await db
      .select({
        id: clientCampaigns.id,
        name: clientCampaigns.name,
        status: clientCampaigns.status,
      })
      .from(clientCampaigns)
      .where(eq(clientCampaigns.clientAccountId, clientAccountId));

    // Merge all regular campaigns, deduplicating by ID
    const allRegularCampaigns = [...regularAccessList];
    for (const c of [...workOrderCampaigns, ...intakeCampaigns, ...directCampaigns]) {
      if (!seenIds.has(c.id)) {
        seenIds.add(c.id);
        allRegularCampaigns.push(c);
      }
    }

    // Add clientCampaigns (they may have a different schema)
    for (const c of clientCreatedCampaigns) {
      if (!seenIds.has(c.id)) {
        seenIds.add(c.id);
        allRegularCampaigns.push({ ...c, type: 'client_campaign', projectId: null });
      }
    }

    const enrichedRegularCampaigns = await Promise.all(
      allRegularCampaigns.map(async (campaign) => {
        // Look up project enabledFeatures directly via projectId
        let enabledFeatures = null;
        if (campaign.projectId) {
          const [project] = await db
            .select({ enabledFeatures: clientProjects.enabledFeatures })
            .from(clientProjects)
            .where(eq(clientProjects.id, campaign.projectId))
            .limit(1);
          if (project) enabledFeatures = project.enabledFeatures;
        }

        return {
          ...campaign,
          campaignType: campaign.type || 'campaign',
          landingPageUrl: null,
          projectFileUrl: null,
          type: 'regular',
          eligibleCount: 0,
          stats: {
            totalLeads: 0,
            verifiedLeads: 0,
            leadsPurchased: 0,
          },
          enabledFeatures,
        };
      })
    );

    res.json([...enrichedVerificationCampaigns, ...enrichedRegularCampaigns]);
  } catch (error) {
    console.error('[CLIENT PORTAL] Get campaigns error:', error);
    res.status(500).json({ message: "Failed to get campaigns" });
  }
});



// ==================== REQUEST ADDITIONAL LEADS ====================

// Request additional leads for an existing campaign
router.post('/campaigns/request-additional-leads', requireClientAuth, async (req, res) => {
  try {
    const { campaignId, requestedQuantity, notes, priority } = req.body;

    if (!campaignId || !requestedQuantity) {
      return res.status(400).json({ message: "Campaign ID and requested quantity are required" });
    }

    if (typeof requestedQuantity !== 'number' || requestedQuantity < 1) {
      return res.status(400).json({ message: "Requested quantity must be a positive number" });
    }

    // Verify client has access to this campaign
    const [access] = await db
      .select()
      .from(clientCampaignAccess)
      .where(
        and(
          eq(clientCampaignAccess.clientAccountId, req.clientUser!.clientAccountId),
          or(
            eq(clientCampaignAccess.campaignId, campaignId),
            eq(clientCampaignAccess.regularCampaignId, campaignId)
          )
        )
      )
      .limit(1);

    if (!access) {
      return res.status(403).json({ message: "You don't have access to this campaign" });
    }

    // Get campaign name for logging
    let campaignName = 'Unknown Campaign';
    const [verificationCamp] = await db
      .select({ name: verificationCampaigns.name })
      .from(verificationCampaigns)
      .where(eq(verificationCampaigns.id, campaignId))
      .limit(1);

    if (verificationCamp) {
      campaignName = verificationCamp.name;
    } else {
      const [regularCamp] = await db
        .select({ name: campaigns.name })
        .from(campaigns)
        .where(eq(campaigns.id, campaignId))
        .limit(1);
      if (regularCamp) {
        campaignName = regularCamp.name;
      }
    }

    // Log the activity
    const activityId = await logClientPortalActivity({
      clientAccountId: req.clientUser!.clientAccountId,
      clientUserId: req.clientUser!.clientUserId,
      entityType: 'additional_leads_request',
      entityId: campaignId,
      action: 'requested_additional_leads',
      details: {
        campaignId,
        campaignName,
        requestedQuantity,
        notes: notes || null,
        priority: priority || 'normal',
        requestedAt: new Date().toISOString(),
        requestedBy: {
          userId: req.clientUser!.clientUserId,
          email: req.clientUser!.email,
          name: `${req.clientUser!.firstName || ''} ${req.clientUser!.lastName || ''}`.trim()
        }
      },
    });

    // Get client account for notification
    const [account] = await db
      .select({ name: clientAccounts.name })
      .from(clientAccounts)
      .where(eq(clientAccounts.id, req.clientUser!.clientAccountId));

    // Send notification to admin
    try {
      console.log(`[CLIENT PORTAL] ${priority === 'urgent' ? '🔴 URGENT: ' : ''}Additional Leads Request - ${account?.name || 'A client'} requested ${requestedQuantity.toLocaleString()} additional leads for campaign "${campaignName}"${notes ? `. Notes: ${notes}` : ''}`);
    } catch (notifyErr) {
      console.error('[CLIENT PORTAL] Notification error:', notifyErr);
    }

    res.status(201).json({
      success: true,
      message: 'Your request has been submitted successfully',
      data: {
        campaignId,
        campaignName,
        requestedQuantity,
        priority: priority || 'normal',
        status: 'pending_review'
      }
    });
  } catch (error) {
    console.error('[CLIENT PORTAL] Request additional leads error:', error);
    res.status(500).json({ message: "Failed to submit request" });
  }
});

// Get activity log for the client
router.get('/activity', requireClientAuth, async (req, res) => {
  try {
    const { page = '1', pageSize = '50', entityType } = req.query;
    const pageNum = parseInt(page as string);
    const pageSizeNum = Math.min(parseInt(pageSize as string), 100);
    const offset = (pageNum - 1) * pageSizeNum;

    let query = db
      .select()
      .from(clientPortalActivityLogs)
      .where(eq(clientPortalActivityLogs.clientAccountId, req.clientUser!.clientAccountId))
      .orderBy(desc(clientPortalActivityLogs.createdAt))
      .limit(pageSizeNum)
      .offset(offset);

    const activities = await query;

    // Get total count
    const [countResult] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(clientPortalActivityLogs)
      .where(eq(clientPortalActivityLogs.clientAccountId, req.clientUser!.clientAccountId));

    res.json({
      activities,
      total: countResult?.count || 0,
      page: pageNum,
      pageSize: pageSizeNum
    });
  } catch (error) {
    console.error('[CLIENT PORTAL] Get activity error:', error);
    res.status(500).json({ message: "Failed to fetch activity log" });
  }
});

router.get('/leads', requireClientAuth, async (req, res) => {
  try {
    const contactsData = await db
      .select({
        id: verificationContacts.id,
        firstName: verificationContacts.firstName,
        lastName: verificationContacts.lastName,
        fullName: verificationContacts.fullName,
        title: verificationContacts.title,
        email: verificationContacts.email,
        phone: verificationContacts.phone,
        linkedinUrl: verificationContacts.linkedinUrl,
        // Get company info from linked account
        company: accounts.name,
        location: accounts.companyLocation,
        employees: accounts.staffCount,
        industry: accounts.industryStandardized,
        campaignName: verificationCampaigns.name,
        orderId: clientPortalOrders.id,
        orderNumber: clientPortalOrders.orderNumber,
        orderDate: clientPortalOrders.createdAt,
      })
      .from(clientPortalOrderContacts)
      .innerJoin(verificationContacts, eq(clientPortalOrderContacts.verificationContactId, verificationContacts.id))
      .innerJoin(clientPortalOrders, eq(clientPortalOrderContacts.orderId, clientPortalOrders.id))
      .leftJoin(verificationCampaigns, eq(clientPortalOrders.campaignId, verificationCampaigns.id))
      .leftJoin(accounts, eq(verificationContacts.accountId, accounts.id))
      .where(eq(clientPortalOrders.clientAccountId, req.clientUser!.clientAccountId))
      .orderBy(desc(clientPortalOrders.createdAt));

    res.json(contactsData);
  } catch (error) {
    console.error('[CLIENT PORTAL] Get all leads error:', error);
    res.status(500).json({ message: "Failed to fetch client leads" });
  }
});

// ==================== QA-APPROVED LEADS (FROM CALL CAMPAIGNS) ====================

// Get list of QA-approved leads from call campaigns the client has access to
router.get('/qualified-leads', requireClientAuth, async (req, res) => {
  try {
    const {
      campaignId,
      page = '1',
      pageSize = '50',
      sortBy = 'approvedAt',
      sortOrder = 'desc',
      search,
      debug,
    } = req.query;

    const pageNum = parseInt(page as string);
    const pageSizeNum = Math.min(parseInt(pageSize as string), 100); // Max 100 per page
    const offset = (pageNum - 1) * pageSizeNum;
    const includeDebug = debug === '1';

    // Get campaigns the client has access to (regular campaigns with QA leads)
    // Don't filter by campaigns.approvalStatus here - the leads themselves are filtered by qaStatus
    const accessList = await db
      .select({ regularCampaignId: clientCampaignAccess.regularCampaignId })
      .from(clientCampaignAccess)
      .where(
        and(
          eq(clientCampaignAccess.clientAccountId, req.clientUser!.clientAccountId),
          isNotNull(clientCampaignAccess.regularCampaignId)
        )
      );

    const accessibleCampaignIds = accessList
      .map(a => a.regularCampaignId)
      .filter((id): id is string => id !== null);

    const buildTelnyxFallbackLeads = async () => {
      const phoneSearchDigits = typeof search === 'string' ? normalizePhoneDigits(search) : '';
      const telnyxPhoneFilter = typeof search === 'string' ? formatPhoneForTelnyx(search) : undefined;
      let telnyxRecordings: Awaited<ReturnType<typeof fetchTelnyxRecordings>> = [];
      try {
        const telnyxFetchPageSize = Math.min(50, Math.max(10, pageSizeNum));
        // Keep fallback fast: this path is best-effort only.
        const telnyxFetchMaxPages = Math.min(2, Math.max(1, pageNum));
        telnyxRecordings = await withTimeout(
          fetchTelnyxRecordings({
            pageSize: telnyxFetchPageSize,
            maxPages: telnyxFetchMaxPages,
            phoneNumber: telnyxPhoneFilter,
          }),
          10000,
          'Telnyx fallback fetch'
        );
      } catch (error: any) {
        console.warn('[CLIENT PORTAL] Telnyx fallback unavailable, returning DB-only empty fallback:', error?.message || error);
        return {
          leads: [],
          total: 0,
          debug: includeDebug ? {
            source: 'telnyx-fallback',
            reason: 'telnyx_fallback_timeout_or_error',
            details: error?.message || 'unknown_telnyx_fallback_error',
            search: typeof search === 'string' ? search : null,
            normalizedSearchDigits: phoneSearchDigits || null,
            telnyxPhoneFilter: telnyxPhoneFilter || null,
          } : undefined,
        };
      }

      if (telnyxRecordings.length === 0) {
        return {
          leads: [],
          total: 0,
          debug: includeDebug ? {
            source: 'telnyx-fallback',
            reason: 'no_telnyx_recordings_for_filter',
            search: typeof search === 'string' ? search : null,
            normalizedSearchDigits: phoneSearchDigits || null,
            telnyxPhoneFilter: telnyxPhoneFilter || null,
          } : undefined,
        };
      }

      const candidateNumbers = new Set<string>();
      for (const rec of telnyxRecordings) {
        const fromDigits = normalizePhoneDigits(rec.from);
        const toDigits = normalizePhoneDigits(rec.to);
        if (fromDigits) {
          candidateNumbers.add(fromDigits);
          candidateNumbers.add(`+${fromDigits}`);
        }
        if (toDigits) {
          candidateNumbers.add(toDigits);
          candidateNumbers.add(`+${toDigits}`);
        }
      }

      const candidateList = Array.from(candidateNumbers);
      if (candidateList.length === 0) {
        return {
          leads: [],
          total: 0,
          debug: includeDebug ? {
            source: 'telnyx-fallback',
            reason: 'no_candidate_numbers_from_telnyx_recordings',
            telnyxRecordingsFetched: telnyxRecordings.length,
            search: typeof search === 'string' ? search : null,
            normalizedSearchDigits: phoneSearchDigits || null,
            telnyxPhoneFilter: telnyxPhoneFilter || null,
          } : undefined,
        };
      }

      const candidateLast10 = Array.from(
        new Set(
          candidateList
            .map((value) => normalizePhoneDigits(value))
            .filter((digits) => digits.length >= 10)
            .map((digits) => digits.slice(-10))
        )
      );

      const phoneMatchConditions = [
        inArray(contacts.directPhoneE164, candidateList),
        inArray(contacts.mobilePhoneE164, candidateList),
        ...candidateLast10.map((digits) => like(contacts.directPhone, `%${digits}%`)),
        ...candidateLast10.map((digits) => like(contacts.mobilePhone, `%${digits}%`)),
      ];

      const contactRows = await db
        .select({
          id: contacts.id,
          firstName: contacts.firstName,
          lastName: contacts.lastName,
          email: contacts.email,
          directPhoneE164: contacts.directPhoneE164,
          mobilePhoneE164: contacts.mobilePhoneE164,
          directPhoneRaw: contacts.directPhone,
          mobilePhoneRaw: contacts.mobilePhone,
          accountName: accounts.name,
          accountIndustry: accounts.industryStandardized,
        })
        .from(contacts)
        .leftJoin(accounts, eq(contacts.accountId, accounts.id))
        .where(or(...phoneMatchConditions)!);

      const contactsByPhone = new Map<string, typeof contactRows[number]>();
      for (const row of contactRows) {
        const phoneValues = [
          row.directPhoneE164,
          row.mobilePhoneE164,
          row.directPhoneRaw,
          row.mobilePhoneRaw,
        ];
        for (const phoneValue of phoneValues) {
          const digits = normalizePhoneDigits(phoneValue);
          if (digits) {
            contactsByPhone.set(digits, row);
            if (digits.length >= 10) {
              contactsByPhone.set(digits.slice(-10), row);
            }
          }
        }
      }

      const fallbackRows = telnyxRecordings
        .map((rec) => {
          const fromDigits = normalizePhoneDigits(rec.from);
          const toDigits = normalizePhoneDigits(rec.to);
          const matchedContact = contactsByPhone.get(toDigits) || contactsByPhone.get(fromDigits);
          const matchedContactName = matchedContact
            ? [matchedContact.firstName, matchedContact.lastName].filter(Boolean).join(' ').trim() || null
            : null;
          const inferredPhone = rec.to || rec.from || null;
          const contactName = matchedContactName || inferredPhone;
          const durationSec = Math.floor((rec.duration_millis || 0) / 1000);
          const matchedPhoneDigits =
            (matchedContact
              ? normalizePhoneDigits(matchedContact.directPhoneE164) ||
                normalizePhoneDigits(matchedContact.mobilePhoneE164) ||
                normalizePhoneDigits(matchedContact.directPhoneRaw) ||
                normalizePhoneDigits(matchedContact.mobilePhoneRaw)
              : null) ||
            null;
          return {
            id: `telnyx-${rec.id}`,
            contactName,
            contactEmail: matchedContact?.email || null,
            accountName: matchedContact?.accountName || null,
            accountIndustry: matchedContact?.accountIndustry || null,
            campaignId: null,
            campaignName: matchedContact ? 'Telnyx Recording' : 'Telnyx Recording (Unmapped)',
            aiScore: null,
            callDuration: durationSec,
            hasRecording: true,
            hasTranscript: false,
            qaStatus: 'approved',
            createdAt: rec.created_at,
            approvedAt: rec.recording_ended_at || rec.created_at,
            matchedPhoneDigits,
            recordingFrom: rec.from || null,
            recordingTo: rec.to || null,
          };
        })
        .filter((row): row is NonNullable<typeof row> => row !== null);

      const filteredRows = (typeof search === 'string' && search.trim())
        ? fallbackRows.filter((row) => {
            const term = search.trim().toLowerCase();
            return (
              (row.contactName || '').toLowerCase().includes(term) ||
              (row.contactEmail || '').toLowerCase().includes(term) ||
              (row.accountName || '').toLowerCase().includes(term) ||
              normalizePhoneDigits(row.recordingFrom || '').includes(phoneSearchDigits) ||
              normalizePhoneDigits(row.recordingTo || '').includes(phoneSearchDigits) ||
              normalizePhoneDigits(row.matchedPhoneDigits || '').includes(phoneSearchDigits)
            );
          })
        : fallbackRows;

      const total = filteredRows.length;
      const offset = (pageNum - 1) * pageSizeNum;
      const pagedRows = filteredRows.slice(offset, offset + pageSizeNum);
      return {
        leads: pagedRows,
        total,
        debug: includeDebug ? {
          source: 'telnyx-fallback',
          search: typeof search === 'string' ? search : null,
          normalizedSearchDigits: phoneSearchDigits || null,
          telnyxPhoneFilter: telnyxPhoneFilter || null,
          telnyxRecordingsFetched: telnyxRecordings.length,
          contactRowsMatchedByPhone: contactRows.length,
          fallbackRowsBeforeSearch: fallbackRows.length,
          fallbackRowsUnmapped: fallbackRows.filter((row) => !row.contactEmail && !row.accountName).length,
          fallbackRowsAfterSearch: filteredRows.length,
          candidatePhoneCount: candidateList.length,
          sampleRecordingPhones: telnyxRecordings.slice(0, 5).map((rec) => ({
            from: rec.from || null,
            to: rec.to || null,
          })),
          reason: filteredRows.length === 0 ? 'recordings_found_but_no_contact_match_or_search_filter_excluded_all' : null,
        } : undefined,
      };
    };

    if (accessibleCampaignIds.length === 0) {
      const fallback = await buildTelnyxFallbackLeads();
      return res.json({
        leads: fallback.leads,
        total: fallback.total,
        page: pageNum,
        pageSize: pageSizeNum,
        debug: includeDebug ? {
          accessMode: 'no_accessible_campaigns_using_telnyx_fallback',
          accessibleCampaignIdsCount: accessibleCampaignIds.length,
          fallback: fallback.debug || null,
        } : undefined,
      });
    }

    // Build where conditions
    // Clients see leads that are:
    //   1) QA approved/published AND submitted to client, OR
    //   2) AI agent qualified with score >= 50 (showcase calls)
    const whereConditions: any[] = [
      inArray(leads.campaignId, accessibleCampaignIds),
      or(
        and(
          inArray(leads.qaStatus, ['approved', 'published']),
          eq(leads.submittedToClient, true)
        ),
        and(
          eq(leads.aiQualificationStatus, 'qualified'),
          gte(sql`CAST(${leads.aiScore} AS numeric)`, sql`50`)
        )
      )
    ];

    // Filter by specific campaign if provided
    if (campaignId && typeof campaignId === 'string') {
      whereConditions.push(eq(leads.campaignId, campaignId));
    }

    // Search filter (search contact name, email, or account name)
    if (search && typeof search === 'string' && search.trim()) {
      const searchTerm = `%${search.trim()}%`;
      whereConditions.push(
        or(
          like(leads.contactName, searchTerm),
          like(leads.contactEmail, searchTerm),
          like(leads.accountName, searchTerm)
        )!
      );
    }

    // Get total count
    const [countResult] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(leads)
      .where(and(...whereConditions));

    const total = countResult?.count || 0;

    // Get leads with campaign info
    const sortColumn = sortBy === 'approvedAt' ? leads.approvedAt :
                      sortBy === 'aiScore' ? leads.aiScore :
                      sortBy === 'callDuration' ? leads.callDuration :
                      sortBy === 'accountName' ? leads.accountName :
                      leads.approvedAt;

    const orderDirection = sortOrder === 'asc' ? asc : desc;

    const leadsData = await db
      .select({
        id: leads.id,
        contactName: leads.contactName,
        contactEmail: leads.contactEmail,
        accountName: leads.accountName,
        accountIndustry: leads.accountIndustry,
        campaignId: leads.campaignId,
        campaignName: campaigns.name,
        aiScore: leads.aiScore,
        callDuration: leads.callDuration,
        recordingUrl: leads.recordingUrl,
        recordingS3Key: leads.recordingS3Key,
        hasRecording: sql<boolean>`${leads.recordingUrl} IS NOT NULL OR ${leads.recordingS3Key} IS NOT NULL`,
        hasTranscript: sql<boolean>`${leads.transcript} IS NOT NULL AND ${leads.transcript} != ''`,
        callSessionId: dialerCallAttempts.callSessionId,
        qaStatus: leads.qaStatus,
        createdAt: leads.createdAt,
        approvedAt: leads.approvedAt,
      })
      .from(leads)
      .leftJoin(campaigns, eq(leads.campaignId, campaigns.id))
      .leftJoin(dialerCallAttempts, eq(leads.callAttemptId, dialerCallAttempts.id))
      .where(and(...whereConditions))
      .orderBy(orderDirection(sortColumn))
      .limit(pageSizeNum)
      .offset(offset);

    if (leadsData.length === 0) {
      const fallback = await buildTelnyxFallbackLeads();
      return res.json({
        leads: fallback.leads,
        total: fallback.total,
        page: pageNum,
        pageSize: pageSizeNum,
        debug: includeDebug ? {
          accessMode: 'accessible_campaigns_present_but_db_leads_empty_using_telnyx_fallback',
          accessibleCampaignIdsCount: accessibleCampaignIds.length,
          dbLeadsCount: leadsData.length,
          fallback: fallback.debug || null,
        } : undefined,
      });
    }

    const normalizedLeadsData = leadsData.map((lead) => {
      const normalizedRecordingUrl = resolveQualifiedLeadRecordingUrl(lead.recordingUrl, lead.recordingS3Key);
      return {
        ...lead,
        recordingUrl: normalizedRecordingUrl,
        hasRecording: Boolean(normalizedRecordingUrl),
      };
    });

    res.json({
      leads: normalizedLeadsData,
      total,
      page: pageNum,
      pageSize: pageSizeNum,
      debug: includeDebug ? {
        accessMode: 'db_leads',
        accessibleCampaignIdsCount: accessibleCampaignIds.length,
        dbLeadsCount: normalizedLeadsData.length,
      } : undefined,
    });
  } catch (error: any) {
    console.error('[CLIENT PORTAL] Get qualified leads error:', error?.message || error);
    res.status(500).json({ message: "Failed to fetch qualified leads", error: error?.message || String(error) });
  }
});

// Export leads as CSV - MUST be before :id route to avoid conflicts
router.get('/qualified-leads/export', requireClientAuth, async (req, res) => {
  try {
    const { campaignId, includeTranscripts = 'false' } = req.query;

    // Get campaigns the client has access to
    const accessList = await db
      .select({ regularCampaignId: clientCampaignAccess.regularCampaignId })
      .from(clientCampaignAccess)
      .where(
        and(
          eq(clientCampaignAccess.clientAccountId, req.clientUser!.clientAccountId),
          isNotNull(clientCampaignAccess.regularCampaignId)
        )
      );

    const accessibleCampaignIds = accessList
      .map(a => a.regularCampaignId)
      .filter((id): id is string => id !== null);

    if (accessibleCampaignIds.length === 0) {
      return res.status(404).json({ message: "No campaigns found" });
    }

    // Build where conditions - QA approved/published submitted to client OR AI qualified with 50+ score
    const whereConditions: any[] = [
      inArray(leads.campaignId, accessibleCampaignIds),
      or(
        and(
          inArray(leads.qaStatus, ['approved', 'published']),
          eq(leads.submittedToClient, true)
        ),
        and(
          eq(leads.aiQualificationStatus, 'qualified'),
          gte(sql`CAST(${leads.aiScore} AS numeric)`, sql`50`)
        )
      )
    ];

    if (campaignId && typeof campaignId === 'string') {
      whereConditions.push(eq(leads.campaignId, campaignId));
    }

    // Get all published leads submitted to client
    const leadsData = await db
      .select({
        id: leads.id,
        contactName: leads.contactName,
        contactEmail: leads.contactEmail,
        accountName: leads.accountName,
        accountIndustry: leads.accountIndustry,
        campaignName: campaigns.name,
        aiScore: leads.aiScore,
        callDuration: leads.callDuration,
        dialedNumber: leads.dialedNumber,
        transcript: leads.transcript,
        approvedAt: leads.approvedAt,
        createdAt: leads.createdAt,
      })
      .from(leads)
      .leftJoin(campaigns, eq(leads.campaignId, campaigns.id))
      .where(and(...whereConditions))
      .orderBy(desc(leads.approvedAt));

    // Generate CSV
    const includeTranscriptsFlag = includeTranscripts === 'true';

    const headers = [
      'Lead ID',
      'Contact Name',
      'Email',
      'Account Name',
      'Industry',
      'Campaign',
      'AI Score',
      'Call Duration (seconds)',
      'Phone Dialed',
      'Approved Date',
      'Created Date',
    ];

    if (includeTranscriptsFlag) {
      headers.push('Transcript');
    }

    const rows = leadsData.map(lead => {
      const row = [
        lead.id,
        lead.contactName || '',
        lead.contactEmail || '',
        lead.accountName || '',
        lead.accountIndustry || '',
        lead.campaignName || '',
        lead.aiScore ? parseFloat(lead.aiScore).toFixed(1) : '',
        lead.callDuration?.toString() || '',
        lead.dialedNumber || '',
        lead.approvedAt ? new Date(lead.approvedAt).toISOString() : '',
        lead.createdAt ? new Date(lead.createdAt).toISOString() : '',
      ];

      if (includeTranscriptsFlag) {
        // Escape transcript for CSV (replace newlines and quotes)
        const transcript = (lead.transcript || '').replace(/"/g, '""').replace(/\n/g, ' ');
        row.push(`"${transcript}"`);
      }

      return row;
    });

    // Build CSV content
    const csvContent = [
      headers.join(','),
      ...rows.map(row => row.map(cell => {
        // Escape cells that contain commas or quotes
        const str = String(cell);
        if (str.includes(',') || str.includes('"') || str.includes('\n')) {
          return `"${str.replace(/"/g, '""')}"`;
        }
        return str;
      }).join(','))
    ].join('\n');

    // Set response headers for CSV download
    const filename = `qualified-leads-${new Date().toISOString().split('T')[0]}.csv`;
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(csvContent);

  } catch (error) {
    console.error('[CLIENT PORTAL] Export leads error:', error);
    res.status(500).json({ message: "Failed to export leads" });
  }
});

// Get campaigns with QA-approved leads (for filtering) - MUST be before :id route
router.get('/qualified-leads/campaigns', requireClientAuth, async (req, res) => {
  console.log('[CLIENT PORTAL] /qualified-leads/campaigns - Request received');
  console.log('[CLIENT PORTAL] clientAccountId:', req.clientUser?.clientAccountId);

  try {
    // Get regular campaigns the client has access to
    const accessList = await db
      .select({
        campaignId: clientCampaignAccess.regularCampaignId,
        id: campaigns.id,
        name: campaigns.name,
      })
      .from(clientCampaignAccess)
      .innerJoin(campaigns, eq(clientCampaignAccess.regularCampaignId, campaigns.id))
      .where(
        and(
          eq(clientCampaignAccess.clientAccountId, req.clientUser!.clientAccountId),
          isNotNull(clientCampaignAccess.regularCampaignId)
        )
      );

    console.log('[CLIENT PORTAL] Found', accessList.length, 'campaigns with access');

    // Get lead counts per campaign - QA approved/published submitted to client OR AI qualified 50+ score
    const campaignData = await Promise.all(
      accessList.map(async (row) => {
        const [count] = await db
          .select({ count: sql<number>`count(*)::int` })
          .from(leads)
          .where(
            and(
              eq(leads.campaignId, row.id),
              or(
                and(
                  inArray(leads.qaStatus, ['approved', 'published']),
                  eq(leads.submittedToClient, true)
                ),
                and(
                  eq(leads.aiQualificationStatus, 'qualified'),
                  gte(sql`CAST(${leads.aiScore} AS numeric)`, sql`50`)
                )
              )
            )
          );

        return {
          id: row.id,
          name: row.name,
          type: 'regular',
          status: 'active', // Default as we didn't fetch status
          approvedLeadsCount: count?.count || 0,
        };
      })
    );

    console.log('[CLIENT PORTAL] Returning', campaignData.length, 'campaigns');
    res.json(campaignData);
  } catch (error: any) {
    console.error('[CLIENT PORTAL] Get lead campaigns error:', error.message);
    console.error('[CLIENT PORTAL] Error stack:', error.stack);
    res.status(500).json({ message: "Failed to fetch campaigns" });
  }
});

// List Telnyx call recordings for client portal Leads tab (scoped to client campaigns)
router.get(['/qualified-leads/recordings', '/telnyx-recordings'], requireClientAuth, async (req, res) => {
  try {
    const clientAccountId = req.clientUser!.clientAccountId;
    const page = Math.max(1, parseInt((req.query.page as string) || '1', 10));
    const pageSize = Math.min(100, Math.max(1, parseInt((req.query.pageSize as string) || '25', 10)));
    const phone = typeof req.query.phone === 'string' ? req.query.phone.trim() : '';
    const telnyxPhoneFilter = formatPhoneForTelnyx(phone);

    let startDate: Date | undefined;
    let endDate: Date | undefined;

    if (typeof req.query.startDate === 'string' && req.query.startDate.trim()) {
      const parsed = new Date(req.query.startDate);
      if (Number.isNaN(parsed.getTime())) {
        return res.status(400).json({ message: 'Invalid startDate' });
      }
      parsed.setHours(0, 0, 0, 0);
      startDate = parsed;
    }

    if (typeof req.query.endDate === 'string' && req.query.endDate.trim()) {
      const parsed = new Date(req.query.endDate);
      if (Number.isNaN(parsed.getTime())) {
        return res.status(400).json({ message: 'Invalid endDate' });
      }
      parsed.setHours(23, 59, 59, 999);
      endDate = parsed;
    }

    const accessRows = await db
      .select({ campaignId: clientCampaignAccess.regularCampaignId })
      .from(clientCampaignAccess)
      .where(
        and(
          eq(clientCampaignAccess.clientAccountId, clientAccountId),
          isNotNull(clientCampaignAccess.regularCampaignId),
        )
      );

    const accessibleCampaignIds = accessRows
      .map((row) => row.campaignId)
      .filter((id): id is string => Boolean(id));

    if (accessibleCampaignIds.length === 0) {
      return res.json({
        total: 0,
        page,
        pageSize,
        items: [],
        source: 'telnyx',
      });
    }

    const callSessionConditions = [inArray(callSessions.campaignId, accessibleCampaignIds)];
    if (startDate) {
      callSessionConditions.push(sql`${callSessions.createdAt} >= ${startDate}`);
    }
    if (endDate) {
      callSessionConditions.push(sql`${callSessions.createdAt} <= ${endDate}`);
    }

    const scopedSessions = await db
      .select({
        id: callSessions.id,
        telnyxCallId: callSessions.telnyxCallId,
        toNumberE164: callSessions.toNumberE164,
        fromNumber: callSessions.fromNumber,
      })
      .from(callSessions)
      .where(and(...callSessionConditions))
      .limit(5000);

    if (scopedSessions.length === 0) {
      return res.json({
        total: 0,
        page,
        pageSize,
        items: [],
        source: 'telnyx',
      });
    }

    const scopedCallSessionIds = new Set(scopedSessions.map((session) => session.id));
    const scopedTelnyxCallIds = new Set(
      scopedSessions
        .map((session) => session.telnyxCallId)
        .filter((value): value is string => Boolean(value))
    );
    const scopedPhoneDigits = new Set<string>();
    for (const session of scopedSessions) {
      const sessionPhones = [session.toNumberE164, session.fromNumber];
      for (const phoneValue of sessionPhones) {
        const digits = normalizePhoneDigits(phoneValue);
        if (!digits) continue;
        scopedPhoneDigits.add(digits);
        if (digits.length >= 10) {
          scopedPhoneDigits.add(digits.slice(-10));
        }
      }
    }

    // Limit Telnyx fetch scope to requested page/batch size to avoid loading huge recording sets.
    const telnyxFetchPageSize = Math.min(50, Math.max(10, pageSize));
    const telnyxFetchMaxPages = Math.min(2, Math.max(1, page));

    let telnyxRecordings: Awaited<ReturnType<typeof fetchTelnyxRecordings>> = [];
    try {
      telnyxRecordings = await withTimeout(
        fetchTelnyxRecordings({
          startDate,
          endDate,
          phoneNumber: telnyxPhoneFilter,
          pageSize: telnyxFetchPageSize,
          maxPages: telnyxFetchMaxPages,
        }),
        10000,
        'Telnyx recordings list fetch'
      );
    } catch (error: any) {
      console.warn('[CLIENT PORTAL] Telnyx recordings fetch timed out, returning empty list:', error?.message || error);
      return res.json({
        total: 0,
        page,
        pageSize,
        items: [],
        source: 'telnyx',
        degraded: true,
      });
    }

    const normalizedSearch = phone.replace(/\D/g, '');
    const filtered = telnyxRecordings
      .filter((recording) => {
        const callSessionMatch = Boolean(recording.call_session_id) && scopedCallSessionIds.has(recording.call_session_id);
        const callControlMatch = Boolean(recording.call_control_id) && scopedTelnyxCallIds.has(recording.call_control_id);
        const fromDigits = normalizePhoneDigits(recording.from);
        const toDigits = normalizePhoneDigits(recording.to);
        const phoneMatch =
          (fromDigits && (scopedPhoneDigits.has(fromDigits) || (fromDigits.length >= 10 && scopedPhoneDigits.has(fromDigits.slice(-10))))) ||
          (toDigits && (scopedPhoneDigits.has(toDigits) || (toDigits.length >= 10 && scopedPhoneDigits.has(toDigits.slice(-10)))));

        if (!callSessionMatch && !callControlMatch && !phoneMatch) {
          return false;
        }

        if (!normalizedSearch) return true;
        const from = fromDigits;
        const to = toDigits;
        return from.includes(normalizedSearch) || to.includes(normalizedSearch);
      })
      .sort((a, b) => {
        const left = new Date(a.created_at).getTime();
        const right = new Date(b.created_at).getTime();
        return right - left;
      });

    const total = filtered.length;
    const offset = (page - 1) * pageSize;
    const items = filtered.slice(offset, offset + pageSize).map((recording) => ({
      id: recording.id,
      callControlId: recording.call_control_id || null,
      callLegId: recording.call_leg_id || null,
      callSessionId: recording.call_session_id || null,
      createdAt: recording.created_at,
      recordingStartedAt: recording.recording_started_at || null,
      recordingEndedAt: recording.recording_ended_at || null,
      from: recording.from || null,
      to: recording.to || null,
      durationMillis: recording.duration_millis || 0,
      durationSec: Math.floor((recording.duration_millis || 0) / 1000),
      status: recording.status,
      channels: recording.channels || null,
      hasMp3: Boolean(recording.download_urls?.mp3),
      hasWav: Boolean(recording.download_urls?.wav),
      primaryFormat: recording.download_urls?.mp3 ? 'mp3' : recording.download_urls?.wav ? 'wav' : null,
    }));

    res.json({
      total,
      page,
      pageSize,
      items,
      source: 'telnyx',
    });
  } catch (error: any) {
    console.error('[CLIENT PORTAL] Failed to list Telnyx recordings:', error);
    res.status(502).json({
      message: 'Failed to fetch recordings from Telnyx',
      details: error?.message || 'Unknown error',
    });
  }
});

// Generate a short-lived tokenized stream URL for browser audio playback
router.get(
  ['/qualified-leads/recordings/:recordingId/stream-token', '/telnyx-recordings/:recordingId/stream-token'],
  requireClientAuth,
  async (req, res) => {
  try {
    const { recordingId } = req.params;
    const payload: ClientRecordingStreamTokenPayload = {
      recordingId,
      clientUserId: req.clientUser!.clientUserId,
      clientAccountId: req.clientUser!.clientAccountId,
      isClientRecordingStream: true,
    };
    const streamToken = jwt.sign(payload, JWT_SECRET, { expiresIn: '15m' });
    const streamUrl = `/api/client-portal/telnyx-recordings/${encodeURIComponent(recordingId)}/stream?token=${encodeURIComponent(streamToken)}`;
    res.json({ streamUrl, expiresIn: 900 });
  } catch (error: any) {
    console.error('[CLIENT PORTAL] Failed to create recording stream token:', error);
    res.status(500).json({ message: 'Failed to prepare recording playback' });
  }
});

// Stream recording audio via server-side proxy (no Telnyx portal redirect)
router.get(['/qualified-leads/recordings/:recordingId/stream', '/telnyx-recordings/:recordingId/stream'], async (req, res) => {
  try {
    const { recordingId } = req.params;
    const token = typeof req.query.token === 'string' ? req.query.token : '';
    const authHeader = req.headers.authorization;
    const bearerToken = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : '';

    let authorized = false;

    if (token) {
      try {
        const payload = jwt.verify(token, JWT_SECRET) as ClientRecordingStreamTokenPayload;
        authorized = Boolean(payload?.isClientRecordingStream && payload.recordingId === recordingId);
      } catch {
        authorized = false;
      }
    }

    if (!authorized && bearerToken && bearerToken !== 'null' && bearerToken !== 'undefined') {
      try {
        const payload = jwt.verify(bearerToken, JWT_SECRET) as ClientJWTPayload;
        authorized = Boolean(payload?.isClient);
      } catch {
        authorized = false;
      }
    }

    if (!authorized) {
      res.setHeader('Content-Type', 'text/plain');
      return res.status(401).send('Authentication required');
    }

    const resolved = await getPlayableRecordingLink(recordingId);
    if (!resolved?.url) {
      res.setHeader('Content-Type', 'text/plain');
      return res.status(404).send('Recording audio not available');
    }

    const audioResponse = await fetch(resolved.url);
    if (!audioResponse.ok) {
      res.setHeader('Content-Type', 'text/plain');
      return res.status(502).send('Failed to fetch recording audio');
    }

    const upstreamContentType = (audioResponse.headers.get('content-type') || '').toLowerCase();
    const contentType =
      upstreamContentType.startsWith('audio/')
        ? upstreamContentType
        : (resolved.mimeType || 'audio/mpeg');
    const contentLength = audioResponse.headers.get('content-length');
    res.setHeader('Content-Type', contentType);
    if (contentLength) {
      res.setHeader('Content-Length', contentLength);
    }
    res.setHeader('Accept-Ranges', 'bytes');
    res.setHeader('Cache-Control', 'private, max-age=300');

    const reader = audioResponse.body?.getReader();
    if (!reader) {
      res.setHeader('Content-Type', 'text/plain');
      return res.status(500).send('Failed to read audio stream');
    }

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (value) {
        res.write(value);
      }
    }

    res.end();
  } catch (error: any) {
    console.error('[CLIENT PORTAL] Recording stream error:', error);
    if (!res.headersSent) {
      res.setHeader('Content-Type', 'text/plain');
      res.status(500).send('Failed to stream recording');
    } else {
      res.end();
    }
  }
});

// Get single lead details (with transcript and recording if visibility allowed)
router.get('/qualified-leads/:id', requireClientAuth, async (req, res) => {
  try {
    const { id } = req.params;

    // Get client account settings to check visibility
    const [clientAccount] = await db
      .select()
      .from(clientAccounts)
      .where(eq(clientAccounts.id, req.clientUser!.clientAccountId))
      .limit(1);

    const visibilitySettings = (clientAccount?.visibilitySettings || {}) as {
      showRecordings?: boolean;
      showLeads?: boolean;
    };

    // Check if leads visibility is enabled
    if (visibilitySettings.showLeads === false) {
      return res.status(403).json({ message: "Lead access not enabled for your account" });
    }

    // Get the lead with full details
    const [lead] = await db
      .select({
        id: leads.id,
        // Contact info
        contactName: leads.contactName,
        contactEmail: leads.contactEmail,
        contactId: leads.contactId,
        // Account info
        accountName: leads.accountName,
        accountIndustry: leads.accountIndustry,
        // Campaign info
        campaignId: leads.campaignId,
        campaignName: campaigns.name,
        // QA info
        qaStatus: leads.qaStatus,
        aiScore: leads.aiScore,
        aiAnalysis: leads.aiAnalysis,
        aiQualificationStatus: leads.aiQualificationStatus,
        qaData: leads.qaData,
        // Call details
        callDuration: leads.callDuration,
        dialedNumber: leads.dialedNumber,
        recordingUrl: leads.recordingUrl,
        recordingS3Key: leads.recordingS3Key,
        transcript: leads.transcript,
        structuredTranscript: leads.structuredTranscript,
        callSessionId: dialerCallAttempts.callSessionId,
        // Timestamps
        createdAt: leads.createdAt,
        approvedAt: leads.approvedAt,
        notes: leads.notes,
      })
      .from(leads)
      .leftJoin(campaigns, eq(leads.campaignId, campaigns.id))
      .leftJoin(dialerCallAttempts, eq(leads.callAttemptId, dialerCallAttempts.id))
      .where(eq(leads.id, id))
      .limit(1);

    if (!lead) {
      return res.status(404).json({ message: "Lead not found" });
    }

    // Verify client has access to this lead's campaign
    const [access] = await db
      .select()
      .from(clientCampaignAccess)
      .where(
        and(
          eq(clientCampaignAccess.clientAccountId, req.clientUser!.clientAccountId),
          eq(clientCampaignAccess.regularCampaignId, lead.campaignId!),
          isNotNull(clientCampaignAccess.regularCampaignId)
        )
      )
      .limit(1);

    if (!access) {
      return res.status(403).json({ message: "You don't have access to this lead" });
    }

    // Get additional contact info if available
    let contactInfo = null;
    if (lead.contactId) {
      const [contact] = await db
        .select({
          firstName: contacts.firstName,
          lastName: contacts.lastName,
          title: contacts.jobTitle,
          email: contacts.email,
          directPhone: contacts.directPhone,
          mobilePhone: contacts.mobilePhone,
          linkedinUrl: contacts.linkedinUrl,
        })
        .from(contacts)
        .where(eq(contacts.id, lead.contactId))
        .limit(1);
      contactInfo = contact || null;
    }

    // Build response based on visibility settings
    const response: Record<string, unknown> = {
      id: lead.id,
      // Contact info
      contactName: lead.contactName || (contactInfo ? `${contactInfo.firstName} ${contactInfo.lastName}`.trim() : null),
      contactEmail: lead.contactEmail || contactInfo?.email,
      contactPhone: contactInfo?.directPhone || contactInfo?.mobilePhone,
      contactTitle: contactInfo?.title,
      linkedinUrl: contactInfo?.linkedinUrl,
      // Account info
      accountName: lead.accountName,
      accountIndustry: lead.accountIndustry,
      // Campaign info
      campaignId: lead.campaignId,
      campaignName: lead.campaignName,
      // QA info
      qaStatus: lead.qaStatus,
      aiScore: lead.aiScore ? parseFloat(lead.aiScore) : null,
      aiAnalysis: lead.aiAnalysis,
      aiQualificationStatus: lead.aiQualificationStatus,
      qaData: lead.qaData,
      // Call details
      callDuration: lead.callDuration,
      dialedNumber: lead.dialedNumber,
      callSessionId: lead.callSessionId,
      // Timestamps
      createdAt: lead.createdAt,
      approvedAt: lead.approvedAt,
      notes: lead.notes,
    };

    // Include recording URL only if visibility is enabled
    if (visibilitySettings.showRecordings !== false) {
      // Always prefer canonical GCS URL when a storage key exists.
      response.recordingUrl = resolveQualifiedLeadRecordingUrl(lead.recordingUrl, lead.recordingS3Key);
      response.transcript = lead.transcript;
      response.structuredTranscript = lead.structuredTranscript;
    }

    res.json(response);
  } catch (error) {
    console.error('[CLIENT PORTAL] Get lead detail error:', error);
    res.status(500).json({ message: "Failed to fetch lead details" });
  }
});

// ==================== LEAD COMMENTS (CLIENT NOTES) ====================

// Get comments for a specific lead
router.get('/qualified-leads/:leadId/comments', requireClientAuth, async (req, res) => {
  try {
    const { leadId } = req.params;
    const clientAccountId = req.clientUser!.clientAccountId;

    // Verify client has access to this lead
    const [lead] = await db
      .select({ campaignId: leads.campaignId })
      .from(leads)
      .where(eq(leads.id, leadId))
      .limit(1);

    if (!lead) {
      return res.status(404).json({ message: "Lead not found" });
    }

    const [access] = await db
      .select()
      .from(clientCampaignAccess)
      .innerJoin(campaigns, eq(clientCampaignAccess.regularCampaignId, campaigns.id))
      .where(
        and(
          eq(clientCampaignAccess.clientAccountId, clientAccountId),
          eq(clientCampaignAccess.regularCampaignId, lead.campaignId!),
          eq(campaigns.approvalStatus, 'published'),
          eq(campaigns.clientAccountId, clientAccountId)
        )
      )
      .limit(1);

    if (!access) {
      return res.status(403).json({ message: "You don't have access to this lead" });
    }

    // Get comments
    const comments = await db
      .select({
        id: leadComments.id,
        leadId: leadComments.leadId,
        commentText: leadComments.commentText,
        isInternal: leadComments.isInternal,
        createdAt: leadComments.createdAt,
        updatedAt: leadComments.updatedAt,
        clientUserEmail: clientUsers.email,
        clientUserFirstName: clientUsers.firstName,
        clientUserLastName: clientUsers.lastName,
      })
      .from(leadComments)
      .leftJoin(clientUsers, eq(leadComments.clientUserId, clientUsers.id))
      .where(
        and(
          eq(leadComments.leadId, leadId),
          eq(leadComments.clientAccountId, clientAccountId),
          sql`${leadComments.deletedAt} IS NULL`
        )
      )
      .orderBy(desc(leadComments.createdAt));

    res.json(comments);
  } catch (error) {
    console.error('[CLIENT PORTAL] Get lead comments error:', error);
    res.status(500).json({ message: "Failed to fetch comments" });
  }
});

// ==================== CLIENT DASHBOARD TUTORIAL VIDEOS ====================

router.get('/tutorial-videos', requireClientAuth, async (req, res) => {
  try {
    const [account] = await db
      .select({ settings: clientAccounts.settings })
      .from(clientAccounts)
      .where(eq(clientAccounts.id, req.clientUser!.clientAccountId))
      .limit(1);

    const allVideos = getClientTutorialVideosFromSettings(account?.settings);
    const videos = allVideos.filter((video) => video.isActive);

    res.json({ videos, count: videos.length });
  } catch (error) {
    console.error('[CLIENT PORTAL] Get tutorial videos error:', error);
    res.status(500).json({ message: 'Failed to fetch tutorial videos' });
  }
});

// Add a comment to a lead
router.post('/qualified-leads/:leadId/comments', requireClientAuth, async (req, res) => {
  try {
    const { leadId } = req.params;
    const { commentText, isInternal = false } = req.body;
    const clientAccountId = req.clientUser!.clientAccountId;
    const clientUserId = req.clientUser!.clientUserId;

    if (!commentText || commentText.trim().length === 0) {
      return res.status(400).json({ message: "Comment text is required" });
    }

    // Verify client has access to this lead
    const [lead] = await db
      .select({ campaignId: leads.campaignId })
      .from(leads)
      .where(eq(leads.id, leadId))
      .limit(1);

    if (!lead) {
      return res.status(404).json({ message: "Lead not found" });
    }

    const [access] = await db
      .select()
      .from(clientCampaignAccess)
      .innerJoin(campaigns, eq(clientCampaignAccess.regularCampaignId, campaigns.id))
      .where(
        and(
          eq(clientCampaignAccess.clientAccountId, clientAccountId),
          eq(clientCampaignAccess.regularCampaignId, lead.campaignId!),
          eq(campaigns.approvalStatus, 'published'),
          eq(campaigns.clientAccountId, clientAccountId)
        )
      )
      .limit(1);

    if (!access) {
      return res.status(403).json({ message: "You don't have access to this lead" });
    }

    // Create comment
    const [comment] = await db
      .insert(leadComments)
      .values({
        leadId,
        clientAccountId,
        clientUserId,
        commentText: commentText.trim(),
        isInternal,
      })
      .returning();

    res.status(201).json(comment);
  } catch (error) {
    console.error('[CLIENT PORTAL] Add lead comment error:', error);
    res.status(500).json({ message: "Failed to add comment" });
  }
});

// Update a comment
router.patch('/qualified-leads/:leadId/comments/:commentId', requireClientAuth, async (req, res) => {
  try {
    const { commentId } = req.params;
    const { commentText } = req.body;
    const clientAccountId = req.clientUser!.clientAccountId;

    if (!commentText || commentText.trim().length === 0) {
      return res.status(400).json({ message: "Comment text is required" });
    }

    // Verify comment belongs to client and exists
    const [existingComment] = await db
      .select()
      .from(leadComments)
      .where(
        and(
          eq(leadComments.id, commentId),
          eq(leadComments.clientAccountId, clientAccountId),
          sql`${leadComments.deletedAt} IS NULL`
        )
      )
      .limit(1);

    if (!existingComment) {
      return res.status(404).json({ message: "Comment not found" });
    }

    // Update comment
    const [updated] = await db
      .update(leadComments)
      .set({
        commentText: commentText.trim(),
        updatedAt: new Date(),
      })
      .where(eq(leadComments.id, commentId))
      .returning();

    res.json(updated);
  } catch (error) {
    console.error('[CLIENT PORTAL] Update lead comment error:', error);
    res.status(500).json({ message: "Failed to update comment" });
  }
});

// Delete a comment (soft delete)
router.delete('/qualified-leads/:leadId/comments/:commentId', requireClientAuth, async (req, res) => {
  try {
    const { commentId } = req.params;
    const clientAccountId = req.clientUser!.clientAccountId;

    // Verify comment belongs to client
    const [existingComment] = await db
      .select()
      .from(leadComments)
      .where(
        and(
          eq(leadComments.id, commentId),
          eq(leadComments.clientAccountId, clientAccountId),
          sql`${leadComments.deletedAt} IS NULL`
        )
      )
      .limit(1);

    if (!existingComment) {
      return res.status(404).json({ message: "Comment not found" });
    }

    // Soft delete
    await db
      .update(leadComments)
      .set({ deletedAt: new Date() })
      .where(eq(leadComments.id, commentId));

    res.json({ success: true, message: "Comment deleted" });
  } catch (error) {
    console.error('[CLIENT PORTAL] Delete lead comment error:', error);
    res.status(500).json({ message: "Failed to delete comment" });
  }
});

// ==================== QA-GATED CONTENT ROUTES ====================

import {
  getClientSimulations,
  getClientMockCalls,
  getClientReports,
  checkClientContentVisibility,
} from "./qa-gated-content";

/**
 * GET /api/client-portal/simulations
 * Get QA-approved simulations for the client
 */
router.get('/simulations', requireClientAuth, async (req: Request, res: Response) => {
  try {
    const clientAccountId = req.clientUser!.clientAccountId;

    // Check visibility settings
    const [clientAccount] = await db
      .select()
      .from(clientAccounts)
      .where(eq(clientAccounts.id, clientAccountId))
      .limit(1);

    const visibilitySettings = (clientAccount?.visibilitySettings as Record<string, unknown>) || {};
    if (visibilitySettings.showSimulations === false) {
      return res.json({ simulations: [], message: "Simulations are not enabled for this account" });
    }

    const simulations = await getClientSimulations(clientAccountId);

    res.json({
      success: true,
      simulations,
      count: simulations.length,
    });
  } catch (error) {
    console.error('[CLIENT PORTAL] Get simulations error:', error);
    res.status(500).json({ message: "Failed to fetch simulations" });
  }
});

/**
 * GET /api/client-portal/mock-calls
 * Get QA-approved mock calls for the client
 */
router.get('/mock-calls', requireClientAuth, async (req: Request, res: Response) => {
  try {
    const clientAccountId = req.clientUser!.clientAccountId;

    // Check visibility settings
    const [clientAccount] = await db
      .select()
      .from(clientAccounts)
      .where(eq(clientAccounts.id, clientAccountId))
      .limit(1);

    const visibilitySettings = (clientAccount?.visibilitySettings as Record<string, unknown>) || {};
    if (visibilitySettings.showMockCalls === false) {
      return res.json({ mockCalls: [], message: "Mock calls are not enabled for this account" });
    }

    const mockCalls = await getClientMockCalls(clientAccountId);

    res.json({
      success: true,
      mockCalls,
      count: mockCalls.length,
    });
  } catch (error) {
    console.error('[CLIENT PORTAL] Get mock calls error:', error);
    res.status(500).json({ message: "Failed to fetch mock calls" });
  }
});

/**
 * GET /api/client-portal/reports
 * Get QA-approved reports for the client
 */
router.get('/reports', requireClientAuth, async (req: Request, res: Response) => {
  try {
    const clientAccountId = req.clientUser!.clientAccountId;

    // Check visibility settings
    const [clientAccount] = await db
      .select()
      .from(clientAccounts)
      .where(eq(clientAccounts.id, clientAccountId))
      .limit(1);

    const visibilitySettings = (clientAccount?.visibilitySettings as Record<string, unknown>) || {};
    if (visibilitySettings.showReports === false) {
      return res.json({ reports: [], message: "Reports are not enabled for this account" });
    }

    const reports = await getClientReports(clientAccountId);

    res.json({
      success: true,
      reports,
      count: reports.length,
    });
  } catch (error) {
    console.error('[CLIENT PORTAL] Get reports error:', error);
    res.status(500).json({ message: "Failed to fetch reports" });
  }
});

/**
 * GET /api/client-portal/approved-content
 * Get all QA-approved content for the client (simulations, mock calls, reports)
 */
router.get('/approved-content', requireClientAuth, async (req: Request, res: Response) => {
  try {
    const clientAccountId = req.clientUser!.clientAccountId;
    const { type } = req.query;

    // Get content based on type filter
    let content: {
      simulations?: unknown[];
      mockCalls?: unknown[];
      reports?: unknown[];
    } = {};

    if (!type || type === 'simulation') {
      content.simulations = await getClientSimulations(clientAccountId);
    }
    if (!type || type === 'mock_call') {
      content.mockCalls = await getClientMockCalls(clientAccountId);
    }
    if (!type || type === 'report') {
      content.reports = await getClientReports(clientAccountId);
    }

    res.json({
      success: true,
      content,
    });
  } catch (error) {
    console.error('[CLIENT PORTAL] Get approved content error:', error);
    res.status(500).json({ message: "Failed to fetch approved content" });
  }
});

// ==================== ADMIN ROUTES ====================

router.get('/admin/clients', requireAuth, requireRole('admin', 'campaign_manager'), async (req, res) => {
  try {
    const clients = await db
      .select()
      .from(clientAccounts)
      .orderBy(desc(clientAccounts.createdAt));

    res.json(clients);
  } catch (error) {
    console.error('[CLIENT PORTAL] Get clients error:', error);
    res.status(500).json({ message: "Failed to get clients" });
  }
});

// Get all work orders (admin view) - joins client + campaign info
router.get('/admin/orders', requireAuth, requireRole('admin', 'campaign_manager'), async (req, res) => {
  try {
    const orders = await db
      .select({
        order: workOrders,
        client: clientAccounts,
      })
      .from(workOrders)
      .innerJoin(clientAccounts, eq(workOrders.clientAccountId, clientAccounts.id))
      .orderBy(desc(workOrders.createdAt));

    // Enrich with campaign name if linked
    const enriched = await Promise.all(
      orders.map(async (row) => {
        let campaign: any = { name: 'Unlinked', id: null };
        if (row.order.campaignId) {
          const [vc] = await db
            .select({ id: verificationCampaigns.id, name: verificationCampaigns.name })
            .from(verificationCampaigns)
            .where(eq(verificationCampaigns.id, row.order.campaignId))
            .limit(1);
          if (vc) {
            campaign = vc;
          } else {
            const [rc] = await db
              .select({ id: campaigns.id, name: campaigns.name })
              .from(campaigns)
              .where(eq(campaigns.id, row.order.campaignId))
              .limit(1);
            if (rc) campaign = rc;
          }
        }
        return { order: row.order, client: row.client, campaign };
      })
    );

    res.json(enriched);
  } catch (error) {
    console.error('[CLIENT PORTAL] Get admin orders error:', error);
    res.status(500).json({ message: "Failed to get orders" });
  }
});

/**
 * POST /admin/clients/:clientId/login-as
 * Admin impersonation: generate a client portal token for an admin to sign into a client's dashboard.
 * Picks the first active user on the account, or a specific userId if provided.
 */
router.post('/admin/clients/:clientId/login-as', requireAuth, requireRole('admin'), async (req, res) => {
  try {
    const { clientId } = req.params;
    const { userId } = req.body;

    // Get client account
    const [account] = await db
      .select()
      .from(clientAccounts)
      .where(eq(clientAccounts.id, clientId))
      .limit(1);

    if (!account) {
      return res.status(404).json({ message: 'Client account not found' });
    }

    // Find the target user
    let targetUser;
    if (userId) {
      [targetUser] = await db
        .select()
        .from(clientUsers)
        .where(and(eq(clientUsers.id, userId), eq(clientUsers.clientAccountId, clientId)))
        .limit(1);
    } else {
      // Pick the first active user
      [targetUser] = await db
        .select()
        .from(clientUsers)
        .where(and(eq(clientUsers.clientAccountId, clientId), eq(clientUsers.isActive, true)))
        .limit(1);
    }

    if (!targetUser) {
      return res.status(404).json({ message: 'No active user found for this client account' });
    }

    // Generate token with isOwner=true since an admin is impersonating
    const token = generateClientToken(targetUser, true);

    console.log(`[CLIENT PORTAL] Admin ${req.user!.userId} logged in as client user ${targetUser.email} (account: ${account.name})`);

    res.json({
      token,
      user: {
        id: targetUser.id,
        email: targetUser.email,
        firstName: targetUser.firstName,
        lastName: targetUser.lastName,
        clientAccountId: targetUser.clientAccountId,
        clientAccountName: account.name,
        isOwner: true,
      },
    });
  } catch (error) {
    console.error('[CLIENT PORTAL] Admin login-as error:', error);
    res.status(500).json({ message: 'Failed to generate client session' });
  }
});

router.post('/admin/clients', requireAuth, requireRole('admin', 'campaign_manager'), async (req, res) => {
  try {
    const data = insertClientAccountSchema.parse({
      ...req.body,
      createdBy: req.user!.userId,
    });

    const inviteDomains = normalizeDomains(req.body.inviteDomains);
    const fallbackDomain =
      data.contactEmail && data.contactEmail.includes('@')
        ? data.contactEmail.split('@')[1].toLowerCase()
        : null;
    const finalDomains =
      inviteDomains.length > 0
        ? inviteDomains
        : fallbackDomain
        ? [fallbackDomain]
        : [];

    const [client] = await db
      .insert(clientAccounts)
      .values({
        ...(data as any),
        inviteDomains: finalDomains,
        inviteSlug: generateInviteSlug(),
        inviteEnabled: req.body.inviteEnabled ?? true,
      })
      .returning();

    res.status(201).json(client);
  } catch (error) {
    console.error('[CLIENT PORTAL] Create client error:', error);
    res.status(500).json({ message: "Failed to create client" });
  }
});

router.get('/admin/clients/:id', requireAuth, requireRole('admin', 'campaign_manager'), async (req, res) => {
  try {
    console.log('[CLIENT PORTAL ADMIN] GET /admin/clients/:id called with id:', req.params.id);
    
    const [client] = await db
      .select()
      .from(clientAccounts)
      .where(eq(clientAccounts.id, req.params.id))
      .limit(1);

    console.log('[CLIENT PORTAL ADMIN] Client found:', client ? client.companyName : 'NOT FOUND');

    if (!client) {
      return res.status(404).json({ message: "Client not found" });
    }

    const users = await db
      .select()
      .from(clientUsers)
      .where(eq(clientUsers.clientAccountId, client.id));

    // Get verification campaign access
    const verificationAccess = await db
      .select({
        access: clientCampaignAccess,
        campaign: verificationCampaigns,
      })
      .from(clientCampaignAccess)
      .innerJoin(verificationCampaigns, eq(clientCampaignAccess.campaignId, verificationCampaigns.id))
      .where(eq(clientCampaignAccess.clientAccountId, client.id));

    // Get regular campaign access (for QA-approved leads)
    const regularAccess = await db
      .select({
        access: clientCampaignAccess,
        id: campaigns.id,
        name: campaigns.name,
        status: campaigns.status,
        type: campaigns.type,
      })
      .from(clientCampaignAccess)
      .innerJoin(campaigns, eq(clientCampaignAccess.regularCampaignId, campaigns.id))
      .where(
        and(
          eq(clientCampaignAccess.clientAccountId, client.id),
          isNotNull(clientCampaignAccess.regularCampaignId)
        )
      );

    const mappedRegularAccess = regularAccess.map((row) => ({
      access: row.access,
      campaign: {
        id: row.id,
        name: row.name,
        status: row.status,
        type: row.type || 'campaign',
        // Minimal stub since specific columns are missing in DB
      },
    }));

    const projects = await db
      .select()
      .from(clientProjects)
      .where(eq(clientProjects.clientAccountId, client.id))
      .orderBy(desc(clientProjects.createdAt));

    const clientWorkOrders = await db
      .select()
      .from(workOrders)
      .where(eq(workOrders.clientAccountId, client.id))
      .orderBy(desc(workOrders.createdAt));

    // Get lead counts for each regular campaign (all approved + published leads for admin view)
    const regularCampaignIds = mappedRegularAccess.map(a => a.campaign.id);
    let leadCounts: Record<string, number> = {};
    if (regularCampaignIds.length > 0) {
      const counts = await db
        .select({
          campaignId: leads.campaignId,
          count: sql<number>`count(*)::int`,
        })
        .from(leads)
        .where(
          and(
            inArray(leads.campaignId, regularCampaignIds),
            or(
              and(
                inArray(leads.qaStatus, ['approved', 'published']),
                eq(leads.submittedToClient, true)
              ),
              and(
                eq(leads.aiQualificationStatus, 'qualified'),
                gte(sql`CAST(${leads.aiScore} AS numeric)`, sql`50`)
              )
            )
          )
        )
        .groupBy(leads.campaignId);
      
      leadCounts = counts.reduce((acc, c) => {
        if (c.campaignId) acc[c.campaignId] = c.count;
        return acc;
      }, {} as Record<string, number>);
    }

    res.json({
      ...client,
      users,
      projects,
      workOrders: clientWorkOrders,
      campaigns: verificationAccess.map(a => ({
        ...a.access,
        campaign: a.campaign,
        type: 'verification'
      })),
      regularCampaigns: mappedRegularAccess.map(a => ({
        ...a.access,
        campaign: a.campaign,
        type: 'regular',
        approvedLeadCount: leadCounts[a.campaign.id] || 0
      })),
    });
  } catch (error) {
    console.error('[CLIENT PORTAL] Get client error:', error);
    res.status(500).json({ message: "Failed to get client" });
  }
});

router.patch('/admin/projects/:id', requireAuth, requireRole('admin', 'campaign_manager'), async (req, res) => {
  try {
    const { status, ratePerLead } = req.body;

    // Validate Status
    if (status && !['draft', 'pending', 'active', 'paused', 'completed', 'archived'].includes(status)) {
        return res.status(400).json({ message: "Invalid status" });
    }

    const [updated] = await db
      .update(clientProjects)
      .set({
        status,
        ratePerLead: ratePerLead ? ratePerLead.toString() : undefined,
        updatedAt: new Date(),
      })
      .where(eq(clientProjects.id, req.params.id))
      .returning();

    if (!updated) {
      return res.status(404).json({ message: "Project not found" });
    }

    // Trigger Notification on Approval (Active)
    if (status === 'active') {
       try {
         // Get contact email from account (projects stick to accounts, not specific users usually)
         const email = await notificationService.getClientAccountPrimaryEmail(updated.clientAccountId);
         if (email) {
           await notificationService.notifyClientOfProjectApproval(updated.clientAccountId, updated.name);
         }
       } catch (err) {
         console.error('[CLIENT PORTAL] Project Approval Notification error:', err);
       }
    }

    res.json(updated);
  } catch (error) {
    console.error('[CLIENT PORTAL] Update project error:', error);
    res.status(500).json({ message: "Failed to update project" });
  }
});

router.patch('/admin/clients/:id', requireAuth, requireRole('admin', 'campaign_manager'), async (req, res) => {
  try {
    const { name, contactEmail, contactPhone, companyName, notes, isActive, inviteEnabled, profile, settings, visibilitySettings } = req.body;
    const inviteDomains = req.body.inviteDomains !== undefined ? normalizeDomains(req.body.inviteDomains) : undefined;

    const [updated] = await db
      .update(clientAccounts)
      .set({
        name,
        contactEmail,
        contactPhone,
        companyName,
        notes,
        isActive,
        ...(inviteEnabled !== undefined ? { inviteEnabled } : {}),
        ...(inviteDomains !== undefined ? { inviteDomains } : {}),
        ...(profile !== undefined ? { profile } : {}),
        ...(settings !== undefined ? { settings } : {}),
        ...(visibilitySettings !== undefined ? { visibilitySettings } : {}),
        updatedAt: new Date(),
      })
      .where(eq(clientAccounts.id, req.params.id))
      .returning();

    if (!updated) {
      return res.status(404).json({ message: "Client not found" });
    }

    res.json(updated);
  } catch (error) {
    console.error('[CLIENT PORTAL] Update client error:', error);
    res.status(500).json({ message: "Failed to update client" });
  }
});

router.get('/admin/clients/:id/tutorial-videos', requireAuth, requireRole('admin', 'campaign_manager'), async (req, res) => {
  try {
    const [account] = await db
      .select({ id: clientAccounts.id, settings: clientAccounts.settings })
      .from(clientAccounts)
      .where(eq(clientAccounts.id, req.params.id))
      .limit(1);

    if (!account) {
      return res.status(404).json({ message: 'Client not found' });
    }

    const videos = getClientTutorialVideosFromSettings(account.settings);
    res.json({ videos, count: videos.length });
  } catch (error) {
    console.error('[CLIENT PORTAL] Get admin tutorial videos error:', error);
    res.status(500).json({ message: 'Failed to fetch tutorial videos' });
  }
});

router.put('/admin/clients/:id/tutorial-videos', requireAuth, requireRole('admin', 'campaign_manager'), async (req, res) => {
  try {
    const parsed = z.array(tutorialVideoInputSchema).parse(req.body?.videos || []);
    const videos = parsed.map((video, index) => buildTutorialVideoFromInput(video, undefined, index));

    const updated = await saveClientTutorialVideos(req.params.id, videos);
    if (!updated) {
      return res.status(404).json({ message: 'Client not found' });
    }

    res.json({ videos, count: videos.length });
  } catch (error) {
    console.error('[CLIENT PORTAL] Replace tutorial videos error:', error);
    res.status(500).json({ message: 'Failed to save tutorial videos' });
  }
});

router.post('/admin/clients/:id/tutorial-videos', requireAuth, requireRole('admin', 'campaign_manager'), async (req, res) => {
  try {
    const parsed = tutorialVideoInputSchema.parse(req.body || {});

    const [account] = await db
      .select({ id: clientAccounts.id, settings: clientAccounts.settings })
      .from(clientAccounts)
      .where(eq(clientAccounts.id, req.params.id))
      .limit(1);

    if (!account) {
      return res.status(404).json({ message: 'Client not found' });
    }

    const existingVideos = getClientTutorialVideosFromSettings(account.settings);
    const nextVideo = buildTutorialVideoFromInput(parsed, undefined, existingVideos.length);
    const videos = [...existingVideos, nextVideo].sort((a, b) => a.sortOrder - b.sortOrder);

    await saveClientTutorialVideos(req.params.id, videos);
    res.status(201).json(nextVideo);
  } catch (error) {
    console.error('[CLIENT PORTAL] Create tutorial video error:', error);
    res.status(500).json({ message: 'Failed to create tutorial video' });
  }
});

router.patch('/admin/clients/:id/tutorial-videos/:videoId', requireAuth, requireRole('admin', 'campaign_manager'), async (req, res) => {
  try {
    const parsed = tutorialVideoInputSchema.partial().parse(req.body || {});

    const [account] = await db
      .select({ id: clientAccounts.id, settings: clientAccounts.settings })
      .from(clientAccounts)
      .where(eq(clientAccounts.id, req.params.id))
      .limit(1);

    if (!account) {
      return res.status(404).json({ message: 'Client not found' });
    }

    const existingVideos = getClientTutorialVideosFromSettings(account.settings);
    const existing = existingVideos.find((video) => video.id === req.params.videoId);
    if (!existing) {
      return res.status(404).json({ message: 'Tutorial video not found' });
    }

    const mergedInput = {
      title: parsed.title ?? existing.title,
      description: parsed.description ?? existing.description ?? null,
      url: parsed.url ?? existing.url,
      embedUrl: parsed.embedUrl ?? existing.embedUrl,
      thumbnailUrl: parsed.thumbnailUrl ?? existing.thumbnailUrl ?? null,
      durationSeconds: parsed.durationSeconds ?? existing.durationSeconds ?? null,
      sortOrder: parsed.sortOrder ?? existing.sortOrder,
      isActive: parsed.isActive ?? existing.isActive,
    };

    const updatedVideo = buildTutorialVideoFromInput(mergedInput, existing, existing.sortOrder);
    const videos = existingVideos
      .map((video) => (video.id === req.params.videoId ? updatedVideo : video))
      .sort((a, b) => a.sortOrder - b.sortOrder);

    await saveClientTutorialVideos(req.params.id, videos);
    res.json(updatedVideo);
  } catch (error) {
    console.error('[CLIENT PORTAL] Update tutorial video error:', error);
    res.status(500).json({ message: 'Failed to update tutorial video' });
  }
});

router.delete('/admin/clients/:id/tutorial-videos/:videoId', requireAuth, requireRole('admin', 'campaign_manager'), async (req, res) => {
  try {
    const [account] = await db
      .select({ id: clientAccounts.id, settings: clientAccounts.settings })
      .from(clientAccounts)
      .where(eq(clientAccounts.id, req.params.id))
      .limit(1);

    if (!account) {
      return res.status(404).json({ message: 'Client not found' });
    }

    const existingVideos = getClientTutorialVideosFromSettings(account.settings);
    const videos = existingVideos.filter((video) => video.id !== req.params.videoId);
    if (videos.length === existingVideos.length) {
      return res.status(404).json({ message: 'Tutorial video not found' });
    }

    await saveClientTutorialVideos(req.params.id, videos);
    res.status(204).send();
  } catch (error) {
    console.error('[CLIENT PORTAL] Delete tutorial video error:', error);
    res.status(500).json({ message: 'Failed to delete tutorial video' });
  }
});

router.post('/admin/clients/:id/invite/regenerate', requireAuth, requireRole('admin', 'campaign_manager'), async (req, res) => {
  try {
    let inviteSlug = generateInviteSlug();
    let attempts = 0;

    // Ensure uniqueness
    while (attempts < 5) {
      const existing = await db
        .select({ id: clientAccounts.id })
        .from(clientAccounts)
        .where(eq(clientAccounts.inviteSlug, inviteSlug))
        .limit(1);

      if (existing.length === 0) break;
      inviteSlug = generateInviteSlug();
      attempts += 1;
    }

    const [updated] = await db
      .update(clientAccounts)
      .set({ inviteSlug, updatedAt: new Date() })
      .where(eq(clientAccounts.id, req.params.id))
      .returning();

    if (!updated) {
      return res.status(404).json({ message: "Client not found" });
    }

    res.json({
      inviteSlug: updated.inviteSlug,
      joinUrl: buildJoinUrl(updated.inviteSlug),
    });
  } catch (error) {
    console.error('[CLIENT PORTAL] Regenerate invite error:', error);
    res.status(500).json({ message: "Failed to regenerate invite link" });
  }
});

router.delete('/admin/clients/:id', requireAuth, requireRole('admin', 'campaign_manager'), async (req, res) => {
  try {
    const [deleted] = await db
      .delete(clientAccounts)
      .where(eq(clientAccounts.id, req.params.id))
      .returning({ id: clientAccounts.id });

    if (!deleted) {
      return res.status(404).json({ message: "Client not found" });
    }

    res.json({ success: true, deletedId: deleted.id });
  } catch (error) {
    console.error('[CLIENT PORTAL] Delete client error:', error);
    res.status(500).json({ message: "Failed to delete client" });
  }
});

router.post('/admin/clients/:clientId/users', requireAuth, requireRole('admin', 'campaign_manager'), async (req, res) => {
  try {
    const { email, password, firstName, lastName } = req.body;

    if (!email || !password) {
      return res.status(400).json({ message: "Email and password required" });
    }

    // Check for existing user with same email to avoid DB constraint error logging
    const [existingUser] = await db
      .select()
      .from(clientUsers)
      .where(eq(clientUsers.email, email.toLowerCase()))
      .limit(1);

    if (existingUser) {
      return res.status(400).json({ message: "Email already exists" });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const [user] = await db
      .insert(clientUsers)
      .values({
        clientAccountId: req.params.clientId,
        email: email.toLowerCase(),
        password: hashedPassword,
        firstName,
        lastName,
        createdBy: req.user!.userId,
      })
      .returning();

    res.status(201).json({
      id: user.id,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      isActive: user.isActive,
    });
  } catch (error: any) {
    console.error('[CLIENT PORTAL] Create user error:', error);
    if (error.code === '23505') {
      return res.status(400).json({ message: "Email already exists" });
    }
    res.status(500).json({ message: "Failed to create user" });
  }
});

router.patch('/admin/clients/:clientId/users/:userId', requireAuth, requireRole('admin', 'campaign_manager'), async (req, res) => {
  try {
    const { firstName, lastName, isActive, password } = req.body;

    const updateData: any = {
      firstName,
      lastName,
      isActive,
      updatedAt: new Date(),
    };

    if (password) {
      updateData.password = await bcrypt.hash(password, 10);
    }

    const [updated] = await db
      .update(clientUsers)
      .set(updateData)
      .where(
        and(
          eq(clientUsers.id, req.params.userId),
          eq(clientUsers.clientAccountId, req.params.clientId)
        )
      )
      .returning();

    if (!updated) {
      return res.status(404).json({ message: "User not found" });
    }

    res.json({
      id: updated.id,
      email: updated.email,
      firstName: updated.firstName,
      lastName: updated.lastName,
      isActive: updated.isActive,
    });
  } catch (error) {
    console.error('[CLIENT PORTAL] Update user error:', error);
    res.status(500).json({ message: "Failed to update user" });
  }
});

router.post('/admin/clients/:clientId/users/:userId/send-password-reset', requireAuth, requireRole('admin', 'campaign_manager'), async (req, res) => {
  try {
    const [clientUser] = await db
      .select({
        id: clientUsers.id,
        email: clientUsers.email,
        firstName: clientUsers.firstName,
        lastName: clientUsers.lastName,
        isActive: clientUsers.isActive,
        clientAccountId: clientUsers.clientAccountId,
      })
      .from(clientUsers)
      .where(
        and(
          eq(clientUsers.id, req.params.userId),
          eq(clientUsers.clientAccountId, req.params.clientId),
        ),
      )
      .limit(1);

    if (!clientUser) {
      return res.status(404).json({ message: 'Client user not found' });
    }

    if (!clientUser.isActive) {
      return res.status(400).json({ message: 'Client user is inactive' });
    }

    const email = clientUser.email.toLowerCase();
    const token = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000);

    await db.insert(passwordResetTokens).values({
      token,
      userId: null,
      clientUserId: clientUser.id,
      email,
      userType: 'client',
      expiresAt,
    });

    const requestBaseUrl = `${req.protocol}://${req.get('host')}`;
    const baseUrl = (PORTAL_BASE_URL || requestBaseUrl || 'http://localhost:5000').replace(/\/$/, '');
    const resetLink = `${baseUrl}/reset-password?token=${token}&type=client`;

    const resetEmailResult = await transactionalEmailService.triggerPasswordResetEmail(email, resetLink, '1 hour');
    if (!resetEmailResult.success) {
      console.error('[CLIENT PORTAL] Admin send reset email failed:', resetEmailResult.error);
      return res.status(500).json({ message: 'Failed to send password reset email' });
    }

    await logClientPortalActivity({
      clientAccountId: clientUser.clientAccountId,
      clientUserId: clientUser.id,
      entityType: 'user',
      entityId: clientUser.id,
      action: 'password_reset_email_sent',
      details: {
        initiatedBy: req.user?.userId || null,
        recipientEmail: email,
      },
    });

    res.json({
      success: true,
      message: 'Password reset email sent',
    });
  } catch (error) {
    console.error('[CLIENT PORTAL] Send password reset email error:', error);
    res.status(500).json({ message: 'Failed to send password reset email' });
  }
});

router.post('/admin/clients/:clientId/campaigns', requireAuth, requireRole('admin', 'campaign_manager'), async (req, res) => {
  try {
    const { campaignId, campaignType } = req.body;
    console.log('[CLIENT PORTAL] Grant access request:', { clientId: req.params.clientId, campaignId, campaignType });

    if (!campaignId) {
      return res.status(400).json({ message: "Campaign ID required" });
    }

    // Support both verification campaigns and regular campaigns (for QA leads)
    const accessData: any = {
      clientAccountId: req.params.clientId,
      grantedBy: req.user!.userId,
    };

    if (campaignType === 'regular') {
      const [campaign] = await db
        .select()
        .from(campaigns)
        .where(eq(campaigns.id, campaignId))
        .limit(1);

      if (!campaign) {
        console.log('[CLIENT PORTAL] Campaign not found:', campaignId);
        return res.status(404).json({ message: "Campaign not found" });
      }

      console.log('[CLIENT PORTAL] Found campaign:', { id: campaign.id, name: campaign.name, clientAccountId: campaign.clientAccountId });

      // Check if campaign is already linked to a different client
      if (campaign.clientAccountId && campaign.clientAccountId !== req.params.clientId) {
        console.log('[CLIENT PORTAL] Campaign linked to different client:', campaign.clientAccountId);
        return res.status(400).json({ message: "Campaign is linked to a different client account" });
      }

      // Link the campaign to the client if not already linked
      if (!campaign.clientAccountId) {
        console.log('[CLIENT PORTAL] Linking campaign to client:', req.params.clientId);
        await db
          .update(campaigns)
          .set({ clientAccountId: req.params.clientId })
          .where(eq(campaigns.id, campaignId));
      }

      accessData.regularCampaignId = campaignId;
    } else {
      accessData.campaignId = campaignId;
    }

    console.log('[CLIENT PORTAL] Inserting access record:', accessData);
    const [access] = await db
      .insert(clientCampaignAccess)
      .values(accessData)
      .returning();

    console.log('[CLIENT PORTAL] Access granted successfully:', access.id);
    res.status(201).json(access);
  } catch (error: any) {
    console.error('[CLIENT PORTAL] Grant access error:', error.message, error.code, error.detail);
    if (error.code === '23505') {
      return res.status(400).json({ message: "Access already granted for this campaign" });
    }
    res.status(500).json({ message: error.message || "Failed to grant access" });
  }
});

router.delete('/admin/clients/:clientId/campaigns/:accessId', requireAuth, requireRole('admin', 'campaign_manager'), async (req, res) => {
  try {
    await db
      .delete(clientCampaignAccess)
      .where(eq(clientCampaignAccess.id, req.params.accessId));

    res.status(204).send();
  } catch (error) {
    console.error('[CLIENT PORTAL] Revoke access error:', error);
    res.status(500).json({ message: "Failed to revoke access" });
  }
});

export default router;
