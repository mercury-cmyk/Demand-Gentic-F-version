/**
 * Client Portal Settings Routes
 * 
 * Manages client business profile (legal name, address, unsubscribe URL)
 * and feature access information.
 */

import { Router, Request, Response } from 'express';
import { db } from '../db';
import { eq, and, ilike, or, desc, asc } from 'drizzle-orm';
import {
  clientBusinessProfiles,
  clientFeatureAccess,
  clientPermissionGrants,
  clientAccounts,
  insertClientBusinessProfileSchema,
  clientOrganizationLinks,
  campaignOrganizations,
  campaigns,
  accounts,
  accountIntelligence,
  externalEvents,
  workOrderDrafts,
} from '@shared/schema';
import { z } from 'zod';
import { isNull } from 'drizzle-orm';
import { collectWebsiteContent, type WebsitePageSummary } from '../lib/website-research';
import {
  researchCompanyCore,
  researchMarketPosition,
  researchCustomerIntelligence,
  researchNewsAndTrends,
  consolidateResearch,
  SPECIALIZED_PROMPTS,
} from '../lib/org-intelligence-helper';

const router = Router();

// ==================== BUSINESS PROFILE ====================

/**
 * GET /business-profile
 * Get the client's business profile (legal name, address, etc.)
 */
router.get('/business-profile', async (req: Request, res: Response) => {
  try {
    const clientAccountId = req.clientUser?.clientAccountId;
    if (!clientAccountId) {
      return res.status(401).json({ message: 'Unauthorized' });
    }

    const [profile] = await db
      .select()
      .from(clientBusinessProfiles)
      .where(eq(clientBusinessProfiles.clientAccountId, clientAccountId))
      .limit(1);

    // Also get the client account name
    const [clientAccount] = await db
      .select({ name: clientAccounts.name })
      .from(clientAccounts)
      .where(eq(clientAccounts.id, clientAccountId))
      .limit(1);

    if (!profile) {
      // Return empty profile with client name for initial setup
      return res.json({
        profile: null,
        clientName: clientAccount?.name || 'Unknown',
        needsSetup: true,
      });
    }

    return res.json({
      profile,
      clientName: clientAccount?.name || 'Unknown',
      needsSetup: false,
    });
  } catch (error) {
    console.error('[CLIENT SETTINGS] Get business profile error:', error);
    res.status(500).json({ message: 'Failed to fetch business profile' });
  }
});

/**
 * POST /business-profile
 * Create or update the client's business profile
 */
router.post('/business-profile', async (req: Request, res: Response) => {
  try {
    const clientAccountId = req.clientUser?.clientAccountId;
    const clientUserId = req.clientUser?.clientUserId;
    if (!clientAccountId) {
      return res.status(401).json({ message: 'Unauthorized' });
    }

    const updateSchema = z.object({
      legalBusinessName: z.string().optional().nullable().or(z.literal('')),
      dbaName: z.string().optional().nullable(),
      addressLine1: z.string().optional().nullable().or(z.literal('')),
      addressLine2: z.string().optional().nullable(),
      city: z.string().optional().nullable().or(z.literal('')),
      state: z.string().optional().nullable().or(z.literal('')),
      postalCode: z.string().optional().nullable().or(z.literal('')),
      country: z.string().default('United States'),
      customUnsubscribeUrl: z.string().url().optional().nullable().or(z.literal('')),
      website: z.string().url().optional().nullable().or(z.literal('')),
      phone: z.string().optional().nullable(),
      supportEmail: z.string().email().optional().nullable().or(z.literal('')),
      logoUrl: z.string().url().optional().nullable().or(z.literal('')),
      brandColor: z.string().regex(/^#([0-9A-Fa-f]{3}|[0-9A-Fa-f]{6})$/).optional().nullable().or(z.literal('')),
    });

    const validatedData = updateSchema.parse(req.body);

    // Clean empty strings to null
    const cleanData = Object.fromEntries(
      Object.entries(validatedData).map(([key, value]) => [
        key,
        value === '' ? null : value,
      ])
    );

    // Check if profile exists
    const [existing] = await db
      .select({ id: clientBusinessProfiles.id })
      .from(clientBusinessProfiles)
      .where(eq(clientBusinessProfiles.clientAccountId, clientAccountId))
      .limit(1);

    let profile;
    if (existing) {
      // Update existing
      [profile] = await db
        .update(clientBusinessProfiles)
        .set({
          ...cleanData,
          updatedAt: new Date(),
          updatedBy: clientUserId,
        })
        .where(eq(clientBusinessProfiles.id, existing.id))
        .returning();
    } else {
      // Create new - ensure all required fields are present
      [profile] = await db
        .insert(clientBusinessProfiles)
        .values({
          clientAccountId,
          legalBusinessName: cleanData.legalBusinessName as string,
          dbaName: cleanData.dbaName as string | null,
          addressLine1: cleanData.addressLine1 as string,
          addressLine2: cleanData.addressLine2 as string | null,
          city: cleanData.city as string,
          state: cleanData.state as string,
          postalCode: cleanData.postalCode as string,
          country: (cleanData.country as string) || 'United States',
          customUnsubscribeUrl: cleanData.customUnsubscribeUrl as string | null,
          website: cleanData.website as string | null,
          phone: cleanData.phone as string | null,
          supportEmail: cleanData.supportEmail as string | null,
          logoUrl: cleanData.logoUrl as string | null,
          brandColor: cleanData.brandColor as string | null,
          updatedBy: clientUserId,
        })
        .returning();
    }

    res.json({
      message: existing ? 'Business profile updated' : 'Business profile created',
      profile,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({
        message: 'Validation failed',
        errors: error.errors,
      });
    }
    console.error('[CLIENT SETTINGS] Update business profile error:', error);
    res.status(500).json({ message: 'Failed to update business profile' });
  }
});

// ==================== FEATURE ACCESS ====================

/**
 * GET /features
 * Get all enabled features for the client
 */
router.get('/features', async (req: Request, res: Response) => {
  try {
    const clientAccountId = req.clientUser?.clientAccountId;
    if (!clientAccountId) {
      return res.status(401).json({ message: 'Unauthorized' });
    }

    // Read from new clientPermissionGrants table (default-deny)
    const grants = await db
      .select({
        feature: clientPermissionGrants.feature,
        isEnabled: clientPermissionGrants.isEnabled,
        config: clientPermissionGrants.config,
        expiresAt: clientPermissionGrants.expiresAt,
      })
      .from(clientPermissionGrants)
      .where(
        and(
          eq(clientPermissionGrants.clientAccountId, clientAccountId),
          eq(clientPermissionGrants.isEnabled, true),
          isNull(clientPermissionGrants.revokedAt),
        )
      );

    // Filter out expired grants
    const now = new Date();
    const activeGrants = grants.filter(
      (g) => !g.expiresAt || new Date(g.expiresAt) > now
    );

    const enabledFeatures = activeGrants.map((g) => g.feature);

    // Build feature status map
    const featureStatus = activeGrants.map((g) => ({
      feature: g.feature,
      enabled: true,
      config: g.config || null,
    }));

    // Fetch visibility settings alongside features
    const [clientAccount] = await db.select({ visibilitySettings: clientAccounts.visibilitySettings })
      .from(clientAccounts).where(eq(clientAccounts.id, clientAccountId)).limit(1);
    const visibilitySettings = (clientAccount?.visibilitySettings || {}) as Record;

    res.json({
      features: featureStatus,
      enabledFeatures,
      visibilitySettings,
    });
  } catch (error) {
    console.error('[CLIENT SETTINGS] Get features error:', error);
    res.status(500).json({ message: 'Failed to fetch features' });
  }
});

/**
 * GET /features/:feature
 * Check if a specific feature is enabled (default-deny via clientPermissionGrants)
 */
router.get('/features/:feature', async (req: Request, res: Response) => {
  try {
    const clientAccountId = req.clientUser?.clientAccountId;
    const { feature } = req.params;
    
    if (!clientAccountId) {
      return res.status(401).json({ message: 'Unauthorized' });
    }

    const [grant] = await db
      .select({
        isEnabled: clientPermissionGrants.isEnabled,
        config: clientPermissionGrants.config,
        expiresAt: clientPermissionGrants.expiresAt,
      })
      .from(clientPermissionGrants)
      .where(
        and(
          eq(clientPermissionGrants.clientAccountId, clientAccountId),
          eq(clientPermissionGrants.feature, feature as any),
          eq(clientPermissionGrants.isEnabled, true),
          isNull(clientPermissionGrants.revokedAt),
        )
      )
      .limit(1);

    // Default-deny: only enabled if an active, non-expired grant exists
    const isExpired = grant?.expiresAt ? new Date(grant.expiresAt)  {
  try {
    const clientAccountId = req.clientUser?.clientAccountId;
    if (!clientAccountId) {
      return res.status(401).json({ message: 'Unauthorized' });
    }

    // Get the organization linked to this client
    const [orgLink] = await db
      .select({
        organizationId: clientOrganizationLinks.campaignOrganizationId,
        isPrimary: clientOrganizationLinks.isPrimary,
      })
      .from(clientOrganizationLinks)
      .where(eq(clientOrganizationLinks.clientAccountId, clientAccountId))
      .orderBy(
        desc(clientOrganizationLinks.isPrimary),
        desc(clientOrganizationLinks.updatedAt),
        desc(clientOrganizationLinks.createdAt),
      )
      .limit(1);

    if (!orgLink) {
      return res.json({
        organization: null,
        campaigns: [],
        message: 'No organization linked to this account',
      });
    }

    // Get the organization details
    const [organization] = await db
      .select()
      .from(campaignOrganizations)
      .where(eq(campaignOrganizations.id, orgLink.organizationId))
      .limit(1);

    if (!organization) {
      return res.json({
        organization: null,
        campaigns: [],
        message: 'Organization not found',
      });
    }

    // Get campaigns that use this organization
    const linkedCampaigns = await db
      .select({
        id: campaigns.id,
        name: campaigns.name,
        status: campaigns.status,
        type: campaigns.type,
      })
      .from(campaigns)
      .where(eq(campaigns.problemIntelligenceOrgId, organization.id))
      .limit(20);

    // Check if the org's intelligence fields are empty — if so, try to pull from accountIntelligence
    const isEmptyObj = (obj: any) => !obj || (typeof obj === 'object' && Object.keys(obj).length === 0);
    let identity = organization.identity;
    let offerings = organization.offerings;
    let icp = organization.icp;
    let positioning = organization.positioning;
    let outreach = organization.outreach;
    let events = (organization as any).events;
    let forums = (organization as any).forums;

    if (organization.domain && isEmptyObj(identity) && isEmptyObj(offerings)) {
      // Org record has no intelligence — fallback to accountIntelligence table (admin-analyzed data)
      const [aiProfile] = await db
        .select()
        .from(accountIntelligence)
        .where(eq(accountIntelligence.domain, organization.domain))
        .orderBy(desc(accountIntelligence.createdAt))
        .limit(1);

      if (aiProfile) {
        identity = aiProfile.identity || identity;
        offerings = aiProfile.offerings || offerings;
        icp = aiProfile.icp || icp;
        positioning = aiProfile.positioning || positioning;
        outreach = aiProfile.outreach || outreach;

        // Also backfill the campaignOrganizations record so future reads are fast
        await db
          .update(campaignOrganizations)
          .set({
            identity: aiProfile.identity,
            offerings: aiProfile.offerings,
            icp: aiProfile.icp,
            positioning: aiProfile.positioning,
            outreach: aiProfile.outreach,
            updatedAt: new Date(),
          })
          .where(eq(campaignOrganizations.id, organization.id));
      }
    }

    res.json({
      organization: {
        id: organization.id,
        name: organization.name,
        domain: organization.domain,
        industry: organization.industry,
        logoUrl: organization.logoUrl,
        identity,
        offerings,
        icp,
        positioning,
        outreach,
        events: events || {},
        forums: forums || {},
        branding: (organization as any).branding || {},
        compiledOrgContext: organization.compiledOrgContext,
        updatedAt: organization.updatedAt,
      },
      campaigns: linkedCampaigns,
      isPrimary: orgLink.isPrimary,
    });
  } catch (error) {
    console.error('[CLIENT SETTINGS] Get organization intelligence error:', error);
    res.status(500).json({ message: 'Failed to fetch organization intelligence' });
  }
});

/**
 * PUT /organization-intelligence
 * Update the organization intelligence for this client
 */
router.put('/organization-intelligence', async (req: Request, res: Response) => {
  try {
    const clientAccountId = req.clientUser?.clientAccountId;
    const clientUserId = req.clientUser?.clientUserId;
    if (!clientAccountId) {
      return res.status(401).json({ message: 'Unauthorized' });
    }

    const updateSchema = z.object({
      identity: z.object({
        legalName: z.string().optional(),
        description: z.string().optional(),
        industry: z.string().optional(),
        employees: z.string().optional(),
        regions: z.array(z.string()).optional(),
        foundedYear: z.number().optional(),
      }).optional(),
      offerings: z.object({
        coreProducts: z.array(z.string()).optional(),
        useCases: z.array(z.string()).optional(),
        problemsSolved: z.array(z.string()).optional(),
        differentiators: z.array(z.string()).optional(),
      }).optional(),
      icp: z.object({
        industries: z.array(z.string()).optional(),
        personas: z.array(z.object({
          title: z.string(),
          painPoints: z.array(z.string()).optional(),
          goals: z.array(z.string()).optional(),
        })).optional(),
        objections: z.array(z.string()).optional(),
        companySize: z.string().optional(),
      }).optional(),
      positioning: z.object({
        oneLiner: z.string().optional(),
        valueProposition: z.string().optional(),
        competitors: z.array(z.string()).optional(),
        whyUs: z.array(z.string()).optional(),
      }).optional(),
      outreach: z.object({
        emailAngles: z.array(z.string()).optional(),
        callOpeners: z.array(z.string()).optional(),
        objectionHandlers: z.array(z.object({
          objection: z.string(),
          response: z.string(),
        })).optional(),
      }).optional(),
      branding: z.object({
        tone: z.string().optional(),
        communicationStyle: z.string().optional(),
        keywords: z.array(z.string()).optional(),
        forbiddenTerms: z.array(z.string()).optional(),
        primaryColor: z.string().optional(),
        secondaryColor: z.string().optional(),
      }).optional(),
      events: z.object({
        upcoming: z.string().optional(),
        strategy: z.string().optional(),
      }).optional(),
      forums: z.object({
        list: z.string().optional(),
        engagement_strategy: z.string().optional(),
      }).optional(),
      logoUrl: z.string().optional(),
    });

    const validatedData = updateSchema.parse(req.body);

    // Get the organization linked to this client
    const [orgLink] = await db
      .select({ organizationId: clientOrganizationLinks.campaignOrganizationId })
      .from(clientOrganizationLinks)
      .where(eq(clientOrganizationLinks.clientAccountId, clientAccountId))
      .limit(1);

    if (!orgLink) {
      return res.status(404).json({ message: 'No organization linked to this account' });
    }

    // Update the organization intelligence
    const [updated] = await db
      .update(campaignOrganizations)
      .set({
        ...(validatedData.identity && { identity: validatedData.identity }),
        ...(validatedData.offerings && { offerings: validatedData.offerings }),
        ...(validatedData.icp && { icp: validatedData.icp }),
        ...(validatedData.positioning && { positioning: validatedData.positioning }),
        ...(validatedData.outreach && { outreach: validatedData.outreach }),
        ...(validatedData.branding && { branding: validatedData.branding }),
        ...(validatedData.events && { events: validatedData.events }),
        ...(validatedData.forums && { forums: validatedData.forums }),
        ...(validatedData.logoUrl !== undefined && { logoUrl: validatedData.logoUrl }),
        updatedAt: new Date(),
      })
      .where(eq(campaignOrganizations.id, orgLink.organizationId))
      .returning();

    res.json({
      message: 'Organization intelligence updated successfully',
      organization: updated,
    });
  } catch (error) {
    console.error('[CLIENT SETTINGS] Update organization intelligence error:', error);
    if (error instanceof z.ZodError) {
      return res.status(400).json({ message: 'Invalid data', errors: error.errors });
    }
    res.status(500).json({ message: 'Failed to update organization intelligence' });
  }
});

/**
 * POST /organization-intelligence
 * Create a new organization for this client if none exists
 */
router.post('/organization-intelligence', async (req: Request, res: Response) => {
  try {
    const clientAccountId = req.clientUser?.clientAccountId;
    if (!clientAccountId) {
      return res.status(401).json({ message: 'Unauthorized' });
    }

    // Check if client already has an organization linked
    const [existingLink] = await db
      .select()
      .from(clientOrganizationLinks)
      .where(eq(clientOrganizationLinks.clientAccountId, clientAccountId))
      .limit(1);

    if (existingLink) {
      return res.status(400).json({ message: 'Organization already linked to this account' });
    }

    // Get client account name
    const [clientAccount] = await db
      .select({ name: clientAccounts.name })
      .from(clientAccounts)
      .where(eq(clientAccounts.id, clientAccountId))
      .limit(1);

    const createSchema = z.object({
      name: z.string().min(1, 'Organization name is required'),
      domain: z.string().optional(),
      industry: z.string().optional(),
    });

    const validatedData = createSchema.parse(req.body);

    // Create a new organization
    const [newOrg] = await db
      .insert(campaignOrganizations)
      .values({
        name: validatedData.name,
        domain: validatedData.domain || null,
        industry: validatedData.industry || null,
        identity: {},
        offerings: {},
        icp: {},
        positioning: {},
        outreach: {},
      })
      .returning();

    // Link the organization to this client account
    await db.insert(clientOrganizationLinks).values({
      clientAccountId,
      campaignOrganizationId: newOrg.id,
      isPrimary: true,
    });

    res.status(201).json({
      message: 'Organization created and linked successfully',
      organization: {
        id: newOrg.id,
        name: newOrg.name,
        domain: newOrg.domain,
        industry: newOrg.industry,
        identity: newOrg.identity,
        offerings: newOrg.offerings,
        icp: newOrg.icp,
        positioning: newOrg.positioning,
        outreach: newOrg.outreach,
      },
    });
  } catch (error) {
    console.error('[CLIENT SETTINGS] Create organization error:', error);
    if (error instanceof z.ZodError) {
      return res.status(400).json({ message: 'Invalid data', errors: error.errors });
    }
    res.status(500).json({ message: 'Failed to create organization' });
  }
});

// ==================== ORGANIZATION INTELLIGENCE DEEP ANALYSIS ====================

// Helper functions for deep analysis
function resolveNumberFromEnv(name: string, fallback: number, min: number, max: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(Math.max(parsed, min), max);
}

function extractJson(text: string): any | null {
  if (!text) return null;
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) return null;
  try {
    return JSON.parse(match[0]);
  } catch {
    return null;
  }
}

function buildSynthesisSchemaPrompt(): string {
  return `Return JSON in the following format ONLY (no markdown, no explanation):
{
  "identity": {
    "legalName": "Company legal name (e.g., Acme Corporation)",
    "description": "2-3 sentence company description",
    "industry": "Primary industry (e.g., Technology, Healthcare, Finance)",
    "employees": "Employee range estimate (e.g., 100-500, 1000-5000)",
    "regions": "Operating regions (e.g., North America, Global, EMEA)"
  },
  "offerings": {
    "coreProducts": "Main products or services (comma-separated)",
    "useCases": "Key use cases their solution addresses",
    "problemsSolved": "The concrete business problems they solve for customers",
    "differentiators": "What makes them unique vs competitors"
  },
  "icp": {
    "industries": "Target industries they serve",
    "personas": "Key buyer personas they target (titles)",
    "objections": "Common objections their prospects might have"
  },
  "positioning": {
    "oneLiner": "A compelling one-liner pitch for this company",
    "competitors": "Likely competitors in their space",
    "whyUs": "Why customers choose them over alternatives"
  },
  "outreach": {
    "emailAngles": "Best email approach angles for their outreach",
    "callOpeners": "Effective cold call openers for their sales team"
  }
}`;
}

/**
 * POST /organization-intelligence/analyze-deep
 * Deep multi-model analysis with SSE progress streaming for client organizations
 */
router.post('/organization-intelligence/analyze-deep', async (req: Request, res: Response) => {
  const clientAccountId = req.clientUser?.clientAccountId;
  if (!clientAccountId) {
    return res.status(401).json({ message: 'Unauthorized' });
  }

  // Set SSE headers
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders();

  const sendProgress = (phase: string, message: string, progress: number) => {
    res.write(`data: ${JSON.stringify({ type: 'progress', phase, message, progress })}\n\n`);
  };

  const sendError = (error: string) => {
    res.write(`data: ${JSON.stringify({ type: 'error', error })}\n\n`);
    res.end();
  };

  const sendComplete = (data: any) => {
    res.write(`data: ${JSON.stringify({ type: 'complete', data })}\n\n`);
    res.end();
  };

  try {
    const { domain, context } = req.body;

    if (!domain) {
      return sendError("Domain is required");
    }

    const cleanDomain = domain.replace(/^(https?:\/\/)?(www\.)?/, '').split('/')[0].toLowerCase();
    sendProgress("init", `Starting deep analysis for ${cleanDomain}...`, 0);

    // Check for required API keys
    const openaiKey = process.env.AI_INTEGRATIONS_OPENAI_API_KEY || process.env.OPENAI_API_KEY;
    const geminiKey = process.env.AI_INTEGRATIONS_GEMINI_API_KEY || process.env.GEMINI_API_KEY;
    const anthropicKey = process.env.AI_INTEGRATIONS_ANTHROPIC_API_KEY || process.env.ANTHROPIC_API_KEY;
    const deepseekKey = process.env.DEEPSEEK_API_KEY;

    const availableModels = [
      openaiKey ? 'OpenAI' : null,
      geminiKey ? 'Gemini' : null,
      anthropicKey ? 'Claude' : null,
      deepseekKey ? 'DeepSeek' : null,
    ].filter(Boolean);

    if (availableModels.length === 0) {
      return sendError("No AI API keys configured for organization intelligence analysis.");
    }

    sendProgress("init", `${availableModels.length} AI models available: ${availableModels.join(', ')}`, 2);

    // Phase 1: Deep Web Research (Parallel Streams)
    sendProgress("research", "Starting deep web research (4 parallel streams)...", 5);

    const [coreResearch, marketResearch, customerResearch, newsResearch, websiteContent] = await Promise.all([
      researchCompanyCore(cleanDomain),
      researchMarketPosition(cleanDomain),
      researchCustomerIntelligence(cleanDomain),
      researchNewsAndTrends(cleanDomain),
      collectWebsiteContent(cleanDomain, {
        maxPages: Number(process.env.ORG_INTELLIGENCE_WEB_PAGES || 20),
        maxCharsPerPage: Number(process.env.ORG_INTELLIGENCE_WEB_PAGE_CHARS || 4000),
        timeoutMs: Number(process.env.ORG_INTELLIGENCE_WEB_TIMEOUT_MS || 15000),
      }),
    ]);

    const researchData = consolidateResearch([coreResearch, marketResearch, customerResearch, newsResearch]);

    sendProgress("research", `Research complete: ${researchData.totalQueries} queries, ${researchData.allSources.length} sources`, 25);

    // Get any existing CRM context
    const existingAccounts = await db.select({
      id: accounts.id,
      name: accounts.name,
      domain: accounts.domain,
      description: accounts.description,
      industryStandardized: accounts.industryStandardized,
      employeesSizeRange: accounts.employeesSizeRange,
    })
    .from(accounts)
    .where(
      or(
        ilike(accounts.domain, `%${cleanDomain}%`),
        ilike(accounts.name, `%${cleanDomain.split('.')[0]}%`)
      )
    )
    .limit(5);

    const crmContext = existingAccounts.length > 0 ? existingAccounts : null;

    // Phase 2: Multi-Model Analysis
    sendProgress("analysis", "Starting multi-model AI analysis...", 30);

    const contextPayload = JSON.stringify({
      domain: cleanDomain,
      research: researchData.allFindings,
      sources: researchData.allSources.slice(0, 30),
      crm: crmContext,
      website: {
        totalPages: websiteContent?.pages?.length || 0,
        pages: websiteContent?.pages?.map((page: WebsitePageSummary) => ({
          url: page.url,
          title: page.title,
          description: page.description,
          headings: page.headings,
          content: page.excerpt,
        })) || [],
      },
    }, null, 2);

    const outputSchema = buildSynthesisSchemaPrompt();
    const modelOutputs: Array = [];
    const timeoutMs = resolveNumberFromEnv("ORG_INTELLIGENCE_MODEL_TIMEOUT_MS", 120000, 10000, 300000);

    // Run available models in parallel
    const modelPromises: Promise[] = [];

    // OpenAI - Strategic Analyst
    if (openaiKey) {
      modelPromises.push((async () => {
        try {
          sendProgress("analysis", "OpenAI analyzing as Strategic Analyst...", 35);
          const OpenAI = (await import("openai")).default;
          const openai = new OpenAI({ apiKey: openaiKey });
          const model = process.env.ORG_INTELLIGENCE_OPENAI_MODEL || "gpt-4o";

          const completion = await openai.chat.completions.create({
            model,
            max_tokens: 4096,
            messages: [
              {
                role: "user",
                content: `${SPECIALIZED_PROMPTS.strategic}\n\n## Organization: ${cleanDomain}\n\n## Research Data:\n${contextPayload}\n\n${outputSchema}\n\nReturn your strategic analysis in valid JSON format only.`,
              },
            ],
          });

          const parsed = extractJson(completion.choices[0]?.message?.content || "");
          if (parsed) {
            modelOutputs.push({ model, perspective: 'strategic', data: parsed, confidence: 0.94 });
          }
        } catch (error: any) {
          console.error('[Client Org-Intel] OpenAI error:', error.message);
        }
      })());
    }

    // Gemini - Customer Success Expert
    if (geminiKey) {
      modelPromises.push((async () => {
        try {
          sendProgress("analysis", "Gemini analyzing as Customer Success Expert...", 40);
          const { GoogleGenAI } = await import("@google/genai");
          const genai = new GoogleGenAI({
            apiKey: geminiKey,
            httpOptions: { apiVersion: "" },
          });
          const model = process.env.ORG_INTELLIGENCE_GEMINI_MODEL || "gemini-1.5-pro";

          const result = await genai.models.generateContent({
            model: `models/${model}`,
            contents: `${SPECIALIZED_PROMPTS.customerSuccess}\n\n## Organization: ${cleanDomain}\n\n## Research Data:\n${contextPayload}\n\n${outputSchema}\n\nReturn your customer-focused analysis in valid JSON format only.`,
            config: { maxOutputTokens: 4096, temperature: 0.3 },
          });

          const parsed = extractJson(result.text || "");
          if (parsed) {
            modelOutputs.push({ model, perspective: 'customerSuccess', data: parsed, confidence: 0.92 });
          }
        } catch (error: any) {
          console.error('[Client Org-Intel] Gemini error:', error.message);
        }
      })());
    }

    // Claude - Brand Strategist
    if (anthropicKey) {
      modelPromises.push((async () => {
        try {
          sendProgress("analysis", "Claude analyzing as Brand Strategist...", 45);
          const model = process.env.ORG_INTELLIGENCE_CLAUDE_MODEL || "claude-3-sonnet-20240229";
          const baseUrl = process.env.AI_INTEGRATIONS_ANTHROPIC_BASE_URL || "https://api.anthropic.com";
          const normalizedBaseUrl = baseUrl.replace(/\/$/, "");
          const url = normalizedBaseUrl.endsWith("/v1")
            ? `${normalizedBaseUrl}/messages`
            : `${normalizedBaseUrl}/v1/messages`;

          const controller = new AbortController();
          const timeout = setTimeout(() => controller.abort(), timeoutMs);

          const response = await fetch(url, {
            method: "POST",
            headers: {
              "content-type": "application/json",
              "x-api-key": anthropicKey,
              "anthropic-version": "2023-06-01",
            },
            body: JSON.stringify({
              model,
              max_tokens: 4096,
              messages: [
                {
                  role: "user",
                  content: `${SPECIALIZED_PROMPTS.brandStrategy}\n\n## Organization: ${cleanDomain}\n\n## Research Data:\n${contextPayload}\n\n${outputSchema}\n\nReturn your brand strategy analysis in valid JSON format only.`,
                },
              ],
            }),
            signal: controller.signal,
          });

          clearTimeout(timeout);

          if (response.ok) {
            const data = await response.json();
            const responseText = Array.isArray(data.content)
              ? data.content.filter((item: any) => item?.type === "text").map((item: any) => item?.text || "").join("")
              : "";

            const parsed = extractJson(responseText);
            if (parsed) {
              modelOutputs.push({ model, perspective: 'brandStrategy', data: parsed, confidence: 0.93 });
            }
          }
        } catch (error: any) {
          console.error('[Client Org-Intel] Claude error:', error.message);
        }
      })());
    }

    await Promise.all(modelPromises);
    sendProgress("analysis", `${modelOutputs.length} model analyses completed`, 60);

    if (modelOutputs.length === 0) {
      return sendError("All AI model analyses failed. Please try again.");
    }

    // Phase 3: Synthesize Results
    sendProgress("synthesis", "Synthesizing intelligence from all models...", 70);

    // Merge model outputs with weighted confidence
    const synthesized: any = {
      identity: {},
      offerings: {},
      icp: {},
      positioning: {},
      outreach: {},
    };

    const mergeField = (category: string, field: string) => {
      const values: Array = [];
      for (const output of modelOutputs) {
        const val = output.data[category]?.[field];
        if (val) {
          values.push({ value: val, confidence: output.confidence, model: output.model });
        }
      }
      if (values.length === 0) return null;

      // Pick highest confidence value
      values.sort((a, b) => b.confidence - a.confidence);
      return {
        value: values[0].value,
        confidence: values[0].confidence,
        sources: values.map(v => v.model),
      };
    };

    // Synthesize each field
    ['legalName', 'description', 'industry', 'employees', 'regions'].forEach(f => {
      synthesized.identity[f] = mergeField('identity', f);
    });
    ['coreProducts', 'useCases', 'problemsSolved', 'differentiators'].forEach(f => {
      synthesized.offerings[f] = mergeField('offerings', f);
    });
    ['industries', 'personas', 'objections'].forEach(f => {
      synthesized.icp[f] = mergeField('icp', f);
    });
    ['oneLiner', 'competitors', 'whyUs'].forEach(f => {
      synthesized.positioning[f] = mergeField('positioning', f);
    });
    ['emailAngles', 'callOpeners'].forEach(f => {
      synthesized.outreach[f] = mergeField('outreach', f);
    });

    sendProgress("synthesis", "Intelligence synthesis complete", 85);

    // Phase 4: Save to organization if client has one linked
    sendProgress("save", "Preparing to save organization intelligence...", 90);

    // Get client's linked organization
    const [orgLink] = await db
      .select({ organizationId: clientOrganizationLinks.campaignOrganizationId })
      .from(clientOrganizationLinks)
      .where(eq(clientOrganizationLinks.clientAccountId, clientAccountId))
      .limit(1);

    if (orgLink) {
      // Update the organization with new intelligence
      await db
        .update(campaignOrganizations)
        .set({
          domain: cleanDomain,
          identity: {
            legalName: synthesized.identity.legalName?.value,
            description: synthesized.identity.description?.value,
            industry: synthesized.identity.industry?.value,
            employees: synthesized.identity.employees?.value,
            regions: synthesized.identity.regions?.value ? [synthesized.identity.regions.value] : undefined,
          },
          offerings: {
            coreProducts: synthesized.offerings.coreProducts?.value ? [synthesized.offerings.coreProducts.value] : undefined,
            useCases: synthesized.offerings.useCases?.value ? [synthesized.offerings.useCases.value] : undefined,
            problemsSolved: synthesized.offerings.problemsSolved?.value ? [synthesized.offerings.problemsSolved.value] : undefined,
            differentiators: synthesized.offerings.differentiators?.value ? [synthesized.offerings.differentiators.value] : undefined,
          },
          icp: {
            industries: synthesized.icp.industries?.value ? [synthesized.icp.industries.value] : undefined,
            personas: synthesized.icp.personas?.value ? [{ title: synthesized.icp.personas.value }] : undefined,
            objections: synthesized.icp.objections?.value ? [synthesized.icp.objections.value] : undefined,
          },
          positioning: {
            oneLiner: synthesized.positioning.oneLiner?.value,
            valueProposition: synthesized.positioning.whyUs?.value,
            competitors: synthesized.positioning.competitors?.value ? [synthesized.positioning.competitors.value] : undefined,
            whyUs: synthesized.positioning.whyUs?.value ? [synthesized.positioning.whyUs.value] : undefined,
          },
          outreach: {
            emailAngles: synthesized.outreach.emailAngles?.value ? [synthesized.outreach.emailAngles.value] : undefined,
            callOpeners: synthesized.outreach.callOpeners?.value ? [synthesized.outreach.callOpeners.value] : undefined,
          },
          updatedAt: new Date(),
        })
        .where(eq(campaignOrganizations.id, orgLink.organizationId));

      sendProgress("save", "Organization intelligence saved successfully", 95);
    }

    sendProgress("complete", "Deep analysis complete!", 100);

    sendComplete({
      success: true,
      domain: cleanDomain,
      synthesized,
      organizationUpdated: !!orgLink,
      meta: {
        models: modelOutputs.map(m => `${m.model} (${m.perspective})`),
        modelCount: modelOutputs.length,
        researchSources: researchData.allSources.length,
        researchQueries: researchData.totalQueries,
        analysisDepth: 'deep',
        timestamp: new Date().toISOString(),
      },
    });

  } catch (error: any) {
    console.error('[Client Org-Intel] Deep analysis error:', error);
    sendError(error.message || "Failed to analyze organization");
  }
});

/**
 * POST /organization-intelligence/analyze
 * Quick single-model analysis for client organizations
 */
router.post('/organization-intelligence/analyze', async (req: Request, res: Response) => {
  const clientAccountId = req.clientUser?.clientAccountId;
  if (!clientAccountId) {
    return res.status(401).json({ message: 'Unauthorized' });
  }

  try {
    const { domain } = req.body;

    if (!domain) {
      return res.status(400).json({ message: 'Domain is required' });
    }

    const cleanDomain = domain.replace(/^(https?:\/\/)?(www\.)?/, '').split('/')[0].toLowerCase();

    // Check for API keys
    const geminiKey = process.env.AI_INTEGRATIONS_GEMINI_API_KEY || process.env.GEMINI_API_KEY;
    const openaiKey = process.env.AI_INTEGRATIONS_OPENAI_API_KEY || process.env.OPENAI_API_KEY;

    if (!geminiKey && !openaiKey) {
      return res.status(500).json({ message: 'No AI API keys configured' });
    }

    // Quick web research
    const websiteContent = await collectWebsiteContent(cleanDomain, {
      maxPages: 10,
      maxCharsPerPage: 3000,
      timeoutMs: 10000,
    });

    const contextPayload = JSON.stringify({
      domain: cleanDomain,
      website: {
        totalPages: websiteContent?.pages?.length || 0,
        pages: websiteContent?.pages?.slice(0, 5).map((page: WebsitePageSummary) => ({
          url: page.url,
          title: page.title,
          description: page.description,
          content: page.excerpt?.slice(0, 2000),
        })) || [],
      },
    }, null, 2);

    const outputSchema = buildSynthesisSchemaPrompt();
    let analysisResult: any = null;

    // Try Gemini first
    if (geminiKey) {
      try {
        const { GoogleGenAI } = await import("@google/genai");
        const genai = new GoogleGenAI({
          apiKey: geminiKey,
          httpOptions: { apiVersion: "" },
        });

        const result = await genai.models.generateContent({
          model: "models/gemini-1.5-flash",
          contents: `Analyze this organization and provide comprehensive intelligence.\n\n## Organization: ${cleanDomain}\n\n## Website Data:\n${contextPayload}\n\n${outputSchema}`,
          config: { maxOutputTokens: 2048, temperature: 0.3 },
        });

        analysisResult = extractJson(result.text || "");
      } catch (error: any) {
        console.error('[Client Org-Intel Quick] Gemini error:', error.message);
      }
    }

    // Fallback to OpenAI
    if (!analysisResult && openaiKey) {
      try {
        const OpenAI = (await import("openai")).default;
        const openai = new OpenAI({ apiKey: openaiKey });

        const completion = await openai.chat.completions.create({
          model: "gpt-4o-mini",
          max_tokens: 2048,
          messages: [
            {
              role: "user",
              content: `Analyze this organization and provide comprehensive intelligence.\n\n## Organization: ${cleanDomain}\n\n## Website Data:\n${contextPayload}\n\n${outputSchema}`,
            },
          ],
        });

        analysisResult = extractJson(completion.choices[0]?.message?.content || "");
      } catch (error: any) {
        console.error('[Client Org-Intel Quick] OpenAI error:', error.message);
      }
    }

    if (!analysisResult) {
      return res.status(500).json({ message: 'Failed to analyze organization' });
    }

    res.json({
      success: true,
      domain: cleanDomain,
      analysis: analysisResult,
      pagesAnalyzed: websiteContent?.pages?.length || 0,
    });

  } catch (error: any) {
    console.error('[Client Org-Intel Quick] Error:', error);
    res.status(500).json({ message: error.message || 'Failed to analyze organization' });
  }
});

// ==================== AVAILABLE VOICES ====================

/**
 * GET /available-voices
 * Get list of available AI voices for campaign configuration
 * Uses Gemini Live native audio voices for real-time conversations
 */
router.get('/available-voices', async (req: Request, res: Response) => {
  try {
    // Actual Gemini Live native voices - each has a unique sound signature
    const voices = [
      // ============ MALE VOICES ============
      {
        id: 'Puck',
        name: 'Puck',
        gender: 'male',
        accent: 'American',
        tone: 'Upbeat & Energetic',
        description: 'A youthful, enthusiastic voice with high energy. Perfect for exciting product launches and engaging cold calls.',
        bestFor: ['Product Launches', 'Cold Calling', 'Tech Startups'],
        provider: 'gemini',
        color: 'from-orange-500 to-amber-500'
      },
      {
        id: 'Charon',
        name: 'Charon',
        gender: 'male',
        accent: 'American',
        tone: 'Deep & Mature',
        description: 'A rich, bass-heavy voice that conveys wisdom and experience. Ideal for enterprise deals and senior executives.',
        bestFor: ['Enterprise Sales', 'Executive Outreach', 'Financial Services'],
        provider: 'gemini',
        color: 'from-slate-600 to-slate-800'
      },
      {
        id: 'Fenrir',
        name: 'Fenrir',
        gender: 'male',
        accent: 'American',
        tone: 'Bold & Confident',
        description: 'A strong, assertive voice that commands attention. Great for persuasive sales and overcoming objections.',
        bestFor: ['Sales Calls', 'Lead Qualification', 'B2B Outreach'],
        provider: 'gemini',
        color: 'from-blue-500 to-indigo-600'
      },
      {
        id: 'Orus',
        name: 'Orus',
        gender: 'male',
        accent: 'American',
        tone: 'Warm & Conversational',
        description: 'A friendly, approachable voice that feels like talking to a trusted colleague. Perfect for relationship building.',
        bestFor: ['Customer Success', 'Account Management', 'Renewals'],
        provider: 'gemini',
        color: 'from-teal-500 to-cyan-500'
      },

      // ============ FEMALE VOICES ============
      {
        id: 'Kore',
        name: 'Kore',
        gender: 'female',
        accent: 'American',
        tone: 'Calm & Soothing',
        description: 'A gentle, reassuring voice that puts people at ease. Excellent for healthcare, insurance, and sensitive topics.',
        bestFor: ['Healthcare', 'Insurance', 'Financial Services'],
        provider: 'gemini',
        color: 'from-green-400 to-emerald-500'
      },
      {
        id: 'Aoede',
        name: 'Aoede',
        gender: 'female',
        accent: 'American',
        tone: 'Bright & Friendly',
        description: 'A cheerful, welcoming voice that creates instant rapport. Ideal for customer outreach and appointment setting.',
        bestFor: ['Appointment Setting', 'Customer Outreach', 'Surveys'],
        provider: 'gemini',
        color: 'from-rose-400 to-pink-500'
      },
      {
        id: 'Leda',
        name: 'Leda',
        gender: 'female',
        accent: 'American',
        tone: 'Professional & Articulate',
        description: 'A clear, polished voice with executive presence. Perfect for C-suite conversations and professional services.',
        bestFor: ['Executive Outreach', 'Professional Services', 'Consulting'],
        provider: 'gemini',
        color: 'from-violet-500 to-purple-600'
      },
      {
        id: 'Zephyr',
        name: 'Zephyr',
        gender: 'female',
        accent: 'American',
        tone: 'Light & Modern',
        description: 'A fresh, contemporary voice that resonates with younger audiences. Great for tech and modern brands.',
        bestFor: ['SaaS Sales', 'Tech Industry', 'Modern Brands'],
        provider: 'gemini',
        color: 'from-cyan-500 to-blue-500'
      },
    ];

    res.json({ voices });
  } catch (error) {
    console.error('[CLIENT SETTINGS] Get voices error:', error);
    res.status(500).json({ message: 'Failed to fetch available voices' });
  }
});

/**
 * GET /image-proxy
 *
 * Server-side proxy for fetching external images that may be blocked by CORS.
 * Used by the brand color extractor when canvas can't read cross-origin images.
 * Returns the image as base64 data URI so the client can draw it on canvas.
 */
router.get('/image-proxy', async (req: Request, res: Response) => {
  try {
    const { url } = req.query;
    if (!url || typeof url !== 'string') {
      return res.status(400).json({ message: 'Missing url parameter' });
    }

    // Basic URL validation
    let parsed: URL;
    try {
      parsed = new URL(url);
    } catch {
      return res.status(400).json({ message: 'Invalid URL' });
    }

    if (!['http:', 'https:'].includes(parsed.protocol)) {
      return res.status(400).json({ message: 'Only HTTP/HTTPS URLs are allowed' });
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10_000);

    const response = await fetch(url, {
      signal: controller.signal,
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; BrandColorExtractor/1.0)' },
    });
    clearTimeout(timeout);

    if (!response.ok) {
      return res.status(response.status).json({ message: `Image fetch failed: ${response.status}` });
    }

    const contentType = response.headers.get('content-type') || 'image/png';
    if (!contentType.startsWith('image/')) {
      return res.status(400).json({ message: 'URL does not point to an image' });
    }

    const buffer = Buffer.from(await response.arrayBuffer());

    // Size limit: 5MB
    if (buffer.length > 5 * 1024 * 1024) {
      return res.status(413).json({ message: 'Image too large (max 5MB)' });
    }

    const base64 = buffer.toString('base64');
    res.json({ dataUri: `data:${contentType};base64,${base64}` });
  } catch (error: any) {
    if (error.name === 'AbortError') {
      return res.status(504).json({ message: 'Image fetch timed out' });
    }
    console.error('[CLIENT SETTINGS] Image proxy error:', error.message);
    res.status(500).json({ message: 'Failed to fetch image' });
  }
});

// ==================== LINKED EVENTS (for Organization Intelligence) ====================

/**
 * GET /linked-events
 * Returns external events for this client so the OI Events tab can display them.
 * Includes draft/work-order status for each event.
 */
router.get('/linked-events', async (req: Request, res: Response) => {
  try {
    const clientAccountId = req.clientUser?.clientAccountId;
    if (!clientAccountId) {
      return res.status(401).json({ message: 'Unauthorized' });
    }

    // Fetch all external events for this client, ordered by date
    const events = await db
      .select({
        id: externalEvents.id,
        title: externalEvents.title,
        community: externalEvents.community,
        eventType: externalEvents.eventType,
        location: externalEvents.location,
        startAtIso: externalEvents.startAtIso,
        startAtHuman: externalEvents.startAtHuman,
        sourceUrl: externalEvents.sourceUrl,
        sourceProvider: externalEvents.sourceProvider,
        overviewExcerpt: externalEvents.overviewExcerpt,
      })
      .from(externalEvents)
      .where(eq(externalEvents.clientId, clientAccountId))
      .orderBy(asc(externalEvents.startAtIso));

    // Fetch draft statuses for these events
    const drafts = await db
      .select({
        externalEventId: workOrderDrafts.externalEventId,
        status: workOrderDrafts.status,
        workOrderId: workOrderDrafts.workOrderId,
      })
      .from(workOrderDrafts)
      .where(eq(workOrderDrafts.clientAccountId, clientAccountId));

    const draftMap = new Map();
    for (const d of drafts) {
      if (d.externalEventId) {
        draftMap.set(d.externalEventId, { status: d.status, workOrderId: d.workOrderId });
      }
    }

    const linkedEvents = events.map((event) => {
      const draft = draftMap.get(event.id);
      return {
        ...event,
        draftStatus: draft?.status || null,
        hasWorkOrder: !!draft?.workOrderId,
      };
    });

    res.json({ events: linkedEvents });
  } catch (error: any) {
    console.error('[CLIENT SETTINGS] Linked events error:', error.message);
    res.status(500).json({ message: 'Failed to fetch linked events' });
  }
});

export default router;