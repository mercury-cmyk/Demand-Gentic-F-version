/**
 * Client Portal Settings Routes
 * 
 * Manages client business profile (legal name, address, unsubscribe URL)
 * and feature access information.
 */

import { Router, Request, Response } from 'express';
import { db } from '../db';
import { eq, and } from 'drizzle-orm';
import {
  clientBusinessProfiles,
  clientFeatureAccess,
  clientAccounts,
  insertClientBusinessProfileSchema,
  clientOrganizationLinks,
  campaignOrganizations,
  campaigns,
} from '@shared/schema';
import { z } from 'zod';

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
      legalBusinessName: z.string().min(1, 'Legal business name is required'),
      dbaName: z.string().optional().nullable(),
      addressLine1: z.string().min(1, 'Address is required'),
      addressLine2: z.string().optional().nullable(),
      city: z.string().min(1, 'City is required'),
      state: z.string().min(1, 'State is required'),
      postalCode: z.string().min(1, 'Postal code is required'),
      country: z.string().default('United States'),
      customUnsubscribeUrl: z.string().url().optional().nullable().or(z.literal('')),
      website: z.string().url().optional().nullable().or(z.literal('')),
      phone: z.string().optional().nullable(),
      supportEmail: z.string().email().optional().nullable().or(z.literal('')),
      logoUrl: z.string().url().optional().nullable().or(z.literal('')),
      brandColor: z.string().regex(/^#[0-9A-Fa-f]{6}$/).optional().nullable(),
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

    const features = await db
      .select({
        feature: clientFeatureAccess.feature,
        isEnabled: clientFeatureAccess.isEnabled,
        config: clientFeatureAccess.config,
      })
      .from(clientFeatureAccess)
      .where(
        and(
          eq(clientFeatureAccess.clientAccountId, clientAccountId),
          eq(clientFeatureAccess.isEnabled, true)
        )
      );

    // Convert to a map for easy lookup
    const featureMap: Record<string, { enabled: boolean; config?: any }> = {};
    features.forEach((f) => {
      featureMap[f.feature] = {
        enabled: f.isEnabled,
        config: f.config,
      };
    });

    // List of all possible features
    const allFeatures = [
      'accounts_contacts',
      'bulk_upload',
      'campaign_creation',
      'email_templates',
      'call_flows',
      'voice_selection',
      'calendar_booking',
      'analytics_dashboard',
      'reports_export',
      'api_access',
    ];

    // Build complete feature status
    const featureStatus = allFeatures.map((feature) => ({
      feature,
      enabled: featureMap[feature]?.enabled || false,
      config: featureMap[feature]?.config || null,
    }));

    res.json({
      features: featureStatus,
      enabledFeatures: features.map((f) => f.feature),
    });
  } catch (error) {
    console.error('[CLIENT SETTINGS] Get features error:', error);
    res.status(500).json({ message: 'Failed to fetch features' });
  }
});

/**
 * GET /features/:feature
 * Check if a specific feature is enabled
 */
router.get('/features/:feature', async (req: Request, res: Response) => {
  try {
    const clientAccountId = req.clientUser?.clientAccountId;
    const { feature } = req.params;
    
    if (!clientAccountId) {
      return res.status(401).json({ message: 'Unauthorized' });
    }

    const [featureAccess] = await db
      .select()
      .from(clientFeatureAccess)
      .where(
        and(
          eq(clientFeatureAccess.clientAccountId, clientAccountId),
          eq(clientFeatureAccess.feature, feature as any)
        )
      )
      .limit(1);

    res.json({
      feature,
      enabled: featureAccess?.isEnabled || false,
      config: featureAccess?.config || null,
    });
  } catch (error) {
    console.error('[CLIENT SETTINGS] Check feature error:', error);
    res.status(500).json({ message: 'Failed to check feature access' });
  }
});

// ==================== ORGANIZATION INTELLIGENCE ====================

/**
 * GET /organization-intelligence
 * Get the organization intelligence linked to this client account
 * Includes identity, offerings, ICP, positioning, and outreach context
 */
router.get('/organization-intelligence', async (req: Request, res: Response) => {
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

    res.json({
      organization: {
        id: organization.id,
        name: organization.name,
        domain: organization.domain,
        industry: organization.industry,
        logoUrl: organization.logoUrl,
        identity: organization.identity,
        offerings: organization.offerings,
        icp: organization.icp,
        positioning: organization.positioning,
        outreach: organization.outreach,
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

export default router;
