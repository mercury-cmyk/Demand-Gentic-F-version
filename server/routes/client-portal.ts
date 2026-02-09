import { Router, Request, Response, NextFunction } from 'express';
import crypto from 'crypto';
import { db } from '../db';
import { eq, and, desc, sql, or, like, isNotNull, asc, inArray } from 'drizzle-orm';
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
  // QA-approved leads system
  leads,
  leadComments,
  campaigns,
  campaignQueue,
  contacts,
  accounts,
  lists,
} from '@shared/schema';
import { requireAuth, requireRole } from '../auth';
import { z } from 'zod';
import { notificationService } from '../services/notification-service';

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
import argyleEventsRouter from '../integrations/argyle_events/routes';
import { ukefReportsRouter } from '../integrations/ukef_reports';
import { ukefTranscriptQaRouter } from '../integrations/ukef_transcript_qa';

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

function generateClientToken(clientUser: typeof clientUsers.$inferSelect): string {
  const payload: ClientJWTPayload = {
    clientUserId: clientUser.id,
    clientAccountId: clientUser.clientAccountId,
    email: clientUser.email,
    firstName: clientUser.firstName,
    lastName: clientUser.lastName,
    isClient: true,
  };
  return jwt.sign(payload, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });
}

function requireClientAuth(req: Request, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;

  // Detailed logging for debugging auth issues
  console.log("[Client Portal Auth] Path:", req.path);
  console.log("[Client Portal Auth] Method:", req.method);
  console.log("[Client Portal Auth] Auth header present:", !!authHeader);

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    console.warn("[Client Portal Auth] REJECTED - Missing or invalid auth header");
    return res.status(401).json({ message: "Authentication required" });
  }

  const token = authHeader.substring(7);

  // Check for null/undefined token
  if (!token || token === 'null' || token === 'undefined') {
    console.warn("[Client Portal Auth] REJECTED - Token is null/undefined string");
    return res.status(401).json({ message: "Invalid token - please log in again" });
  }

  try {
    const payload = jwt.verify(token, JWT_SECRET) as ClientJWTPayload;
    if (!payload.isClient) {
      console.warn("[Client Portal Auth] REJECTED - Token is not a client token");
      return res.status(401).json({ message: "Invalid client token" });
    }
    console.log("[Client Portal Auth] SUCCESS - clientAccountId:", payload.clientAccountId);
    req.clientUser = payload;
    next();
  } catch (error: any) {
    console.warn("[Client Portal Auth] REJECTED - JWT verification failed:", error.message);
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

// Argyle event-sourced campaign drafts (feature-flagged, client-gated)
router.use('/argyle-events', requireClientAuth, argyleEventsRouter);

// UKEF campaign reports with lead evidence & QA (feature-flagged, client-gated)
router.use('/ukef-reports', requireClientAuth, ukefReportsRouter);

// UKEF transcript quality + disposition validation (feature-flagged, client-gated)
router.use('/ukef-transcript-qa', requireClientAuth, ukefTranscriptQaRouter);

// Campaigns (Client wizard and management)
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

    const token = generateClientToken(clientUser);

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
      },
    });
  } catch (error) {
    console.error('[CLIENT PORTAL] Get me error:', error);
    res.status(500).json({ message: "Failed to get user" });
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

        return {
          ...campaign,
          type: 'verification',
          eligibleCount: eligibleCount[0]?.count || 0,
        };
      })
    );

    // 2. Fetch Regular Campaigns
    const regularAccessList = await db
      .select({
        id: campaigns.id,
        name: campaigns.name,
        status: campaigns.status,
        type: campaigns.type,
      })
      .from(clientCampaignAccess)
      .innerJoin(campaigns, eq(clientCampaignAccess.regularCampaignId, campaigns.id))
      .where(
        and(
          eq(clientCampaignAccess.clientAccountId, clientAccountId),
          isNotNull(clientCampaignAccess.regularCampaignId)
        )
      );

    const enrichedRegularCampaigns = regularAccessList.map((campaign) => ({
      ...campaign,
      campaignType: campaign.type || 'campaign',
      landingPageUrl: null, // Column missing in DB
      projectFileUrl: null, // Column missing in DB
      type: 'regular',
      eligibleCount: 0,
       stats: {
        totalLeads: 0,
        verifiedLeads: 0,
        leadsPurchased: 0,
      },
    }));

    res.json([...enrichedVerificationCampaigns, ...enrichedRegularCampaigns]);
  } catch (error) {
    console.error('[CLIENT PORTAL] Get campaigns error:', error);
    res.status(500).json({ message: "Failed to get campaigns" });
  }
});

/**
 * GET /campaigns/:campaignId/preview-audience
 * Get a sample of accounts and contacts from a campaign's audience for preview purposes
 * Returns 5-10 sample accounts and 20-30 sample contacts for the client to preview personalization
 */
router.get('/campaigns/:campaignId/preview-audience', requireClientAuth, async (req, res) => {
  const { campaignId } = req.params;
  console.log('[CLIENT PORTAL] /campaigns/:campaignId/preview-audience - Request received');
  console.log('[CLIENT PORTAL] campaignId:', campaignId);
  console.log('[CLIENT PORTAL] clientAccountId:', req.clientUser?.clientAccountId);

  try {
    const clientAccountId = req.clientUser!.clientAccountId;

    // Verify client has access to this campaign
    // Check both UUID string match AND numeric ID for regularCampaignId
    const [accessCheck] = await db
      .select()
      .from(clientCampaignAccess)
      .where(
        and(
          eq(clientCampaignAccess.clientAccountId, clientAccountId),
          or(
            eq(clientCampaignAccess.campaignId, campaignId),
            eq(clientCampaignAccess.regularCampaignId, campaignId)
          )
        )
      )
      .limit(1);

    console.log('[CLIENT PORTAL] Access check result:', accessCheck ? 'GRANTED' : 'DENIED');

    if (!accessCheck) {
      console.warn('[CLIENT PORTAL] 403 - No access to campaign', campaignId, 'for client', clientAccountId);
      return res.status(403).json({ message: "You don't have access to this campaign" });
    }

    // Try to get campaign details (verification campaign)
    let campaignData: any = null;
    let isVerificationCampaign = false;

    // Check if it's a verification campaign
    const [verificationCampaign] = await db
      .select()
      .from(verificationCampaigns)
      .where(eq(verificationCampaigns.id, campaignId))
      .limit(1);

    if (verificationCampaign) {
      campaignData = verificationCampaign;
      isVerificationCampaign = true;

      // Get sample contacts from verification campaign (limit 30)
      const sampleContacts = await db
        .select({
          id: verificationContacts.id,
          firstName: verificationContacts.firstName,
          lastName: verificationContacts.lastName,
          email: verificationContacts.email,
          phone: verificationContacts.phone,
          title: verificationContacts.title,
          company: verificationContacts.company,
        })
        .from(verificationContacts)
        .where(eq(verificationContacts.campaignId, campaignId))
        .limit(30);

      // Group contacts by company to derive accounts
      const accountsMap = new Map<string, { name: string; contactCount: number; sampleContacts: any[] }>();
      
      for (const contact of sampleContacts) {
        const companyName = contact.company || 'Unknown Company';
        if (!accountsMap.has(companyName)) {
          accountsMap.set(companyName, {
            name: companyName,
            contactCount: 0,
            sampleContacts: [],
          });
        }
        const acc = accountsMap.get(companyName)!;
        acc.contactCount++;
        if (acc.sampleContacts.length < 5) {
          acc.sampleContacts.push(contact);
        }
      }

      // Convert to array and limit to 10 accounts
      const sampleAccounts = Array.from(accountsMap.entries())
        .slice(0, 10)
        .map(([id, data], index) => ({
          id: `company_${index}`,
          name: data.name,
          contactCount: data.contactCount,
        }));

      return res.json({
        campaign: {
          id: campaignData.id,
          name: campaignData.name,
          status: campaignData.status,
          type: 'verification',
        },
        accounts: sampleAccounts,
        contacts: sampleContacts,
        totalAccountsAvailable: accountsMap.size,
        totalContactsAvailable: sampleContacts.length,
      });
    }

    // Check if it's a regular campaign (UUID string)
    const [regularCampaign] = await db
      .select()
      .from(campaigns)
      .where(eq(campaigns.id, campaignId))
      .limit(1);

    if (regularCampaign) {
      campaignData = regularCampaign;
      let sampleContactsData: any[] = [];

      // First try: Get contacts from campaignQueue (for activated campaigns)
      const queueContacts = await db
        .select({
          id: contacts.id,
          firstName: contacts.firstName,
          lastName: contacts.lastName,
          email: contacts.email,
          phone: contacts.directPhone,
          title: contacts.jobTitle,
          accountId: contacts.accountId,
          accountName: accounts.name,
          accountWebsite: accounts.website,
          accountIndustry: accounts.industry,
        })
        .from(campaignQueue)
        .innerJoin(contacts, eq(campaignQueue.contactId, contacts.id))
        .innerJoin(accounts, eq(campaignQueue.accountId, accounts.id))
        .where(eq(campaignQueue.campaignId, campaignId))
        .limit(30);

      console.log(`[Preview-Audience] Campaign ${campaignId}: queueContacts=${queueContacts.length}`);
      
      if (queueContacts.length > 0) {
        sampleContactsData = queueContacts;
      } else {
        // Fallback: Resolve from audienceRefs (for campaigns not yet activated)
        const audienceRefs = regularCampaign.audienceRefs as any;
        console.log(`[Preview-Audience] audienceRefs:`, JSON.stringify(audienceRefs));
        
        if (audienceRefs) {
          let contactIds: string[] = [];

          // Get contacts from lists
          const listIds = audienceRefs.lists || audienceRefs.selectedLists || [];
          console.log(`[Preview-Audience] listIds:`, listIds);
          
          if (Array.isArray(listIds) && listIds.length > 0) {
            const campaignLists = await db
              .select({ recordIds: lists.recordIds })
              .from(lists)
              .where(inArray(lists.id, listIds));

            console.log(`[Preview-Audience] Found ${campaignLists.length} lists`);
            
            for (const list of campaignLists) {
              if (list.recordIds && Array.isArray(list.recordIds)) {
                console.log(`[Preview-Audience] List has ${list.recordIds.length} record IDs`);
                contactIds.push(...list.recordIds);
              }
            }
          }

          // Deduplicate and limit
          contactIds = [...new Set(contactIds)].slice(0, 30);

          if (contactIds.length > 0) {
            const listContacts = await db
              .select({
                id: contacts.id,
                firstName: contacts.firstName,
                lastName: contacts.lastName,
                email: contacts.email,
                phone: contacts.directPhone,
                title: contacts.jobTitle,
                accountId: contacts.accountId,
              })
              .from(contacts)
              .where(inArray(contacts.id, contactIds))
              .limit(30);

            // Get account details for these contacts
            const accountIds = [...new Set(listContacts.map(c => c.accountId).filter(Boolean))] as string[];
            let accountDetails: any[] = [];
            if (accountIds.length > 0) {
              accountDetails = await db
                .select({
                  id: accounts.id,
                  name: accounts.name,
                  website: accounts.website,
                  industry: accounts.industry,
                })
                .from(accounts)
                .where(inArray(accounts.id, accountIds))
                .limit(10);
            }
            const accountMap = new Map(accountDetails.map(a => [a.id, a]));

            sampleContactsData = listContacts.map(c => ({
              ...c,
              accountName: accountMap.get(c.accountId)?.name || 'Unknown Company',
              accountWebsite: accountMap.get(c.accountId)?.website || null,
              accountIndustry: accountMap.get(c.accountId)?.industry || null,
            }));
          }
        }
      }

      // Build unique accounts list (limit 10)
      const accountsMap = new Map<string, { id: string; name: string; website: string | null; industry: string | null }>();
      for (const c of sampleContactsData) {
        if (c.accountId && !accountsMap.has(c.accountId)) {
          accountsMap.set(c.accountId, {
            id: c.accountId,
            name: c.accountName || 'Unknown Company',
            website: c.accountWebsite,
            industry: c.accountIndustry,
          });
        }
      }
      const sampleAccounts = Array.from(accountsMap.values()).slice(0, 10);

      // Enrich contacts with company name
      const enrichedContacts = sampleContactsData.map(c => ({
        id: c.id,
        firstName: c.firstName,
        lastName: c.lastName,
        email: c.email,
        phone: c.phone,
        title: c.title,
        company: c.accountName || 'Unknown Company',
      }));

      return res.json({
        campaign: {
          id: campaignData.id,
          name: campaignData.name,
          status: campaignData.status,
          type: 'regular',
        },
        accounts: sampleAccounts,
        contacts: enrichedContacts,
        totalAccountsAvailable: accountsMap.size,
        totalContactsAvailable: sampleContactsData.length,
      });
    }

    res.status(404).json({ message: "Campaign not found" });
  } catch (error) {
    console.error('[CLIENT PORTAL] Get preview audience error:', error);
    res.status(500).json({ message: "Failed to get preview audience" });
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
      await notificationService.sendInternalNotification({
        title: `${priority === 'urgent' ? '🔴 URGENT: ' : ''}Additional Leads Request`,
        message: `${account?.name || 'A client'} has requested ${requestedQuantity.toLocaleString()} additional leads for campaign "${campaignName}"${notes ? `. Notes: ${notes}` : ''}`,
        type: priority === 'urgent' ? 'urgent' : 'info',
        metadata: {
          campaignId,
          campaignName,
          requestedQuantity,
          clientAccountId: req.clientUser!.clientAccountId,
          clientName: account?.name,
          priority
        }
      });
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
      search
    } = req.query;

    const pageNum = parseInt(page as string);
    const pageSizeNum = Math.min(parseInt(pageSize as string), 100); // Max 100 per page
    const offset = (pageNum - 1) * pageSizeNum;

    // Get campaigns the client has access to (regular campaigns with QA leads)
    const accessList = await db
      .select({ regularCampaignId: clientCampaignAccess.regularCampaignId })
      .from(clientCampaignAccess)
      .innerJoin(campaigns, eq(clientCampaignAccess.regularCampaignId, campaigns.id))
      .where(
        and(
          eq(clientCampaignAccess.clientAccountId, req.clientUser!.clientAccountId),
          isNotNull(clientCampaignAccess.regularCampaignId),
          eq(campaigns.approvalStatus, 'published'),
          eq(campaigns.clientAccountId, req.clientUser!.clientAccountId)
        )
      );

    const accessibleCampaignIds = accessList
      .map(a => a.regularCampaignId)
      .filter((id): id is string => id !== null);

    if (accessibleCampaignIds.length === 0) {
      return res.json({ leads: [], total: 0, page: pageNum, pageSize: pageSizeNum });
    }

    // Build where conditions
    // Clients only see leads that are published AND submitted to client
    const whereConditions = [
      inArray(leads.campaignId, accessibleCampaignIds),
      eq(leads.qaStatus, 'published'),
      eq(leads.submittedToClient, true)
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
        hasRecording: sql<boolean>`${leads.recordingUrl} IS NOT NULL OR ${leads.recordingS3Key} IS NOT NULL`,
        hasTranscript: sql<boolean>`${leads.transcript} IS NOT NULL AND ${leads.transcript} != ''`,
        qaStatus: leads.qaStatus,
        createdAt: leads.createdAt,
        approvedAt: leads.approvedAt,
      })
      .from(leads)
      .leftJoin(campaigns, eq(leads.campaignId, campaigns.id))
      .where(and(...whereConditions))
      .orderBy(orderDirection(sortColumn))
      .limit(pageSizeNum)
      .offset(offset);

    res.json({
      leads: leadsData,
      total,
      page: pageNum,
      pageSize: pageSizeNum,
    });
  } catch (error) {
    console.error('[CLIENT PORTAL] Get qualified leads error:', error);
    res.status(500).json({ message: "Failed to fetch qualified leads" });
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
      .innerJoin(campaigns, eq(clientCampaignAccess.regularCampaignId, campaigns.id))
      .where(
        and(
          eq(clientCampaignAccess.clientAccountId, req.clientUser!.clientAccountId),
          isNotNull(clientCampaignAccess.regularCampaignId),
          eq(campaigns.approvalStatus, 'published'),
          eq(campaigns.clientAccountId, req.clientUser!.clientAccountId)
        )
      );

    const accessibleCampaignIds = accessList
      .map(a => a.regularCampaignId)
      .filter((id): id is string => id !== null);

    if (accessibleCampaignIds.length === 0) {
      return res.status(404).json({ message: "No campaigns found" });
    }

    // Build where conditions - only published leads submitted to client
    const whereConditions = [
      inArray(leads.campaignId, accessibleCampaignIds),
      eq(leads.qaStatus, 'published'),
      eq(leads.submittedToClient, true)
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

    // Get lead counts per campaign - only published leads submitted to client
    const campaignData = await Promise.all(
      accessList.map(async (row) => {
        const [count] = await db
          .select({ count: sql<number>`count(*)::int` })
          .from(leads)
          .where(
            and(
              eq(leads.campaignId, row.id),
              eq(leads.qaStatus, 'published'),
              eq(leads.submittedToClient, true)
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
        // Timestamps
        createdAt: leads.createdAt,
        approvedAt: leads.approvedAt,
        notes: leads.notes,
      })
      .from(leads)
      .leftJoin(campaigns, eq(leads.campaignId, campaigns.id))
      .where(eq(leads.id, id))
      .limit(1);

    if (!lead) {
      return res.status(404).json({ message: "Lead not found" });
    }

    // Verify client has access to this lead's campaign
    const [access] = await db
      .select()
      .from(clientCampaignAccess)
      .innerJoin(campaigns, eq(clientCampaignAccess.regularCampaignId, campaigns.id))
      .where(
        and(
          eq(clientCampaignAccess.clientAccountId, req.clientUser!.clientAccountId),
          eq(clientCampaignAccess.regularCampaignId, lead.campaignId!),
          eq(campaigns.approvalStatus, 'published'),
          eq(campaigns.clientAccountId, req.clientUser!.clientAccountId)
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
          title: contacts.title,
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
      // Timestamps
      createdAt: lead.createdAt,
      approvedAt: lead.approvedAt,
      notes: lead.notes,
    };

    // Include recording URL only if visibility is enabled
    if (visibilitySettings.showRecordings !== false) {
      // Prefer S3 key (permanent storage) over Telnyx URL (may expire)
      if (lead.recordingS3Key) {
        // TODO: Generate signed S3 URL here
        response.recordingUrl = lead.recordingUrl; // Fallback for now
      } else {
        response.recordingUrl = lead.recordingUrl;
      }
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

// Add a comment to a lead
router.post('/qualified-leads/:leadId/comments', requireClientAuth, async (req, res) => {
  try {
    const { leadId } = req.params;
    const { commentText, isInternal = false } = req.body;
    const clientAccountId = req.clientUser!.clientAccountId;
    const clientUserId = req.clientUser!.id;

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

    const visibilitySettings = (clientAccount?.visibilitySettings as Record<string, boolean>) || {};
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

    const visibilitySettings = (clientAccount?.visibilitySettings as Record<string, boolean>) || {};
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

    const visibilitySettings = (clientAccount?.visibilitySettings as Record<string, boolean>) || {};
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
        ...data,
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
    const [client] = await db
      .select()
      .from(clientAccounts)
      .where(eq(clientAccounts.id, req.params.id))
      .limit(1);

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
            inArray(leads.qaStatus, ['approved', 'published'])
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
           await notificationService.notifyClientOfProjectApproval(updated, email);
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
