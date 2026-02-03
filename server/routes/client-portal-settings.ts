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

// ==================== AVAILABLE VOICES ====================

/**
 * GET /available-voices
 * Get list of available AI voices for campaign configuration
 */
router.get('/available-voices', async (req: Request, res: Response) => {
  try {
    // Gemini/Google TTS voices available for campaigns
    const voices = [
      // Standard voices
      { id: 'en-US-Standard-A', name: 'Standard Female (A)', gender: 'female', language: 'en-US', provider: 'google' },
      { id: 'en-US-Standard-B', name: 'Standard Male (B)', gender: 'male', language: 'en-US', provider: 'google' },
      { id: 'en-US-Standard-C', name: 'Standard Female (C)', gender: 'female', language: 'en-US', provider: 'google' },
      { id: 'en-US-Standard-D', name: 'Standard Male (D)', gender: 'male', language: 'en-US', provider: 'google' },
      
      // Neural/Wavenet voices (higher quality)
      { id: 'en-US-Wavenet-A', name: 'Wavenet Female (A)', gender: 'female', language: 'en-US', provider: 'google', premium: true },
      { id: 'en-US-Wavenet-B', name: 'Wavenet Male (B)', gender: 'male', language: 'en-US', provider: 'google', premium: true },
      { id: 'en-US-Wavenet-C', name: 'Wavenet Female (C)', gender: 'female', language: 'en-US', provider: 'google', premium: true },
      { id: 'en-US-Wavenet-D', name: 'Wavenet Male (D)', gender: 'male', language: 'en-US', provider: 'google', premium: true },
      
      // Studio voices (highest quality)
      { id: 'en-US-Studio-O', name: 'Studio Female (O)', gender: 'female', language: 'en-US', provider: 'google', premium: true },
      { id: 'en-US-Studio-M', name: 'Studio Male (M)', gender: 'male', language: 'en-US', provider: 'google', premium: true },
      
      // Journey voices (conversational)
      { id: 'en-US-Journey-D', name: 'Journey Male (D)', gender: 'male', language: 'en-US', provider: 'google', premium: true },
      { id: 'en-US-Journey-F', name: 'Journey Female (F)', gender: 'female', language: 'en-US', provider: 'google', premium: true },
      
      // UK English
      { id: 'en-GB-Standard-A', name: 'UK Standard Female', gender: 'female', language: 'en-GB', provider: 'google' },
      { id: 'en-GB-Standard-B', name: 'UK Standard Male', gender: 'male', language: 'en-GB', provider: 'google' },
      { id: 'en-GB-Wavenet-A', name: 'UK Wavenet Female', gender: 'female', language: 'en-GB', provider: 'google', premium: true },
      { id: 'en-GB-Wavenet-B', name: 'UK Wavenet Male', gender: 'male', language: 'en-GB', provider: 'google', premium: true },
    ];

    res.json({ voices });
  } catch (error) {
    console.error('[CLIENT SETTINGS] Get voices error:', error);
    res.status(500).json({ message: 'Failed to fetch available voices' });
  }
});

export default router;
