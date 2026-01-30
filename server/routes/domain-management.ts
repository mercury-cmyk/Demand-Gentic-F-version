/**
 * Domain Management Routes
 *
 * API endpoints for domain configuration, DNS record generation, and validation.
 */

import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { db } from '../db';
import {
  domainAuth,
  domainConfiguration,
  domainHealthScores,
  domainWarmupSchedule,
  insertDomainConfigurationSchema,
} from '../../shared/schema';
import { eq, desc } from 'drizzle-orm';
import {
  domainDnsGenerator,
  generateSecureCode,
  generateDkimSelector,
} from '../services/domain-dns-generator';
import { domainValidator } from '../services/domain-validator';
import { blacklistMonitorService } from '../services/blacklist-monitor';
import { deliverabilityScorer } from '../services/deliverability-scorer';

const router = Router();

// =============================================================================
// Domain CRUD Operations
// =============================================================================

/**
 * GET /api/domains
 * List all domains with their configuration and health status
 */
router.get('/', async (req: Request, res: Response) => {
  try {
    const domains = await db
      .select({
        id: domainAuth.id,
        domain: domainAuth.domain,
        spfStatus: domainAuth.spfStatus,
        dkimStatus: domainAuth.dkimStatus,
        dmarcStatus: domainAuth.dmarcStatus,
        trackingDomainStatus: domainAuth.trackingDomainStatus,
        lastCheckedAt: domainAuth.lastCheckedAt,
        createdAt: domainAuth.createdAt,
      })
      .from(domainAuth)
      .orderBy(desc(domainAuth.createdAt));

    // Enrich with configuration and health score
    const enrichedDomains = await Promise.all(
      domains.map(async (d) => {
        const config = await db
          .select()
          .from(domainConfiguration)
          .where(eq(domainConfiguration.domainAuthId, d.id))
          .limit(1);

        const health = await db
          .select()
          .from(domainHealthScores)
          .where(eq(domainHealthScores.domainAuthId, d.id))
          .orderBy(desc(domainHealthScores.scoredAt))
          .limit(1);

        return {
          ...d,
          configuration: config[0] || null,
          healthScore: health[0]?.overallScore || null,
          warmupPhase: health[0]?.warmupPhase || 'not_started',
        };
      })
    );

    res.json(enrichedDomains);
  } catch (error: any) {
    console.error('Error fetching domains:', error);
    res.status(500).json({ error: 'Failed to fetch domains' });
  }
});

/**
 * GET /api/domains/:id
 * Get detailed domain information
 */
router.get('/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const domain = await db
      .select()
      .from(domainAuth)
      .where(eq(domainAuth.id, parseInt(id)))
      .limit(1);

    if (domain.length === 0) {
      return res.status(404).json({ error: 'Domain not found' });
    }

    const config = await db
      .select()
      .from(domainConfiguration)
      .where(eq(domainConfiguration.domainAuthId, parseInt(id)))
      .limit(1);

    const health = await db
      .select()
      .from(domainHealthScores)
      .where(eq(domainHealthScores.domainAuthId, parseInt(id)))
      .orderBy(desc(domainHealthScores.scoredAt))
      .limit(1);

    const warmupSchedule = await db
      .select()
      .from(domainWarmupSchedule)
      .where(eq(domainWarmupSchedule.domainAuthId, parseInt(id)))
      .orderBy(domainWarmupSchedule.day);

    res.json({
      domain: domain[0],
      configuration: config[0] || null,
      healthScore: health[0] || null,
      warmupSchedule,
    });
  } catch (error: any) {
    console.error('Error fetching domain:', error);
    res.status(500).json({ error: 'Failed to fetch domain' });
  }
});

/**
 * POST /api/domains
 * Create a new domain
 */
router.post('/', async (req: Request, res: Response) => {
  try {
    const schema = z.object({
      domain: z.string().min(1),
      subdomain: z.string().optional(),
      purpose: z.enum(['marketing', 'transactional', 'both']).default('both'),
      provider: z.enum(['mailgun', 'ses', 'sendgrid', 'custom']).default('mailgun'),
      region: z.enum(['US', 'EU']).default('US'),
    });

    const data = schema.parse(req.body);

    // Check if domain already exists
    const existing = await db
      .select()
      .from(domainAuth)
      .where(eq(domainAuth.domain, data.domain))
      .limit(1);

    if (existing.length > 0) {
      return res.status(400).json({ error: 'Domain already exists' });
    }

    // Create domain auth record
    const [newDomain] = await db
      .insert(domainAuth)
      .values({
        domain: data.domain,
        spfStatus: 'pending',
        dkimStatus: 'pending',
        dmarcStatus: 'pending',
        trackingDomainStatus: 'pending',
      })
      .returning();

    // Generate DNS records
    const dkimSelector = generateDkimSelector(data.domain);
    const secureCode = generateSecureCode();

    const dnsRecords = domainDnsGenerator.generateAllDnsRecords({
      domain: data.domain,
      subdomain: data.subdomain,
      provider: data.provider,
      region: data.region,
      dkimSelector,
      includeTracking: true,
      dmarcPolicy: 'none', // Start with monitoring
    });

    // Create configuration record
    await db.insert(domainConfiguration).values({
      domainAuthId: newDomain.id,
      secureCode,
      subdomain: data.subdomain,
      parentDomain: data.domain,
      domainPurpose: data.purpose,
      generatedSpfRecord: dnsRecords.spf.value,
      generatedDkimSelector: dkimSelector,
      generatedDkimRecord: dnsRecords.dkim.value,
      generatedDmarcRecord: dnsRecords.dmarc.value,
      generatedTrackingCname: dnsRecords.tracking?.value || null,
      allowMarketing: data.purpose === 'marketing' || data.purpose === 'both',
      allowTransactional: data.purpose === 'transactional' || data.purpose === 'both',
      mailgunRegion: data.region,
    });

    // Initialize blacklist monitors
    await blacklistMonitorService.initializeDomainMonitors(newDomain.id, data.domain);

    // Initialize health score
    await db.insert(domainHealthScores).values({
      domainAuthId: newDomain.id,
      overallScore: 0,
      warmupPhase: 'not_started',
    });

    res.status(201).json({
      domain: newDomain,
      dnsRecords: domainDnsGenerator.formatDnsRecordsForDisplay(dnsRecords),
    });
  } catch (error: any) {
    console.error('Error creating domain:', error);
    if (error.name === 'ZodError') {
      return res.status(400).json({ error: 'Invalid request data', details: error.errors });
    }
    res.status(500).json({ error: 'Failed to create domain' });
  }
});

/**
 * DELETE /api/domains/:id
 * Delete a domain
 */
router.delete('/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const domain = await db
      .select()
      .from(domainAuth)
      .where(eq(domainAuth.id, parseInt(id)))
      .limit(1);

    if (domain.length === 0) {
      return res.status(404).json({ error: 'Domain not found' });
    }

    await db.delete(domainAuth).where(eq(domainAuth.id, parseInt(id)));

    res.json({ success: true, message: 'Domain deleted' });
  } catch (error: any) {
    console.error('Error deleting domain:', error);
    res.status(500).json({ error: 'Failed to delete domain' });
  }
});

// =============================================================================
// DNS Record Generation
// =============================================================================

/**
 * POST /api/domains/:id/generate-records
 * Regenerate DNS records for a domain
 */
router.post('/:id/generate-records', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const schema = z.object({
      provider: z.enum(['mailgun', 'ses', 'sendgrid', 'custom']).optional(),
      region: z.enum(['US', 'EU']).optional(),
      dmarcPolicy: z.enum(['none', 'quarantine', 'reject']).optional(),
      includeTracking: z.boolean().optional(),
    });

    const options = schema.parse(req.body);

    const domain = await db
      .select()
      .from(domainAuth)
      .where(eq(domainAuth.id, parseInt(id)))
      .limit(1);

    if (domain.length === 0) {
      return res.status(404).json({ error: 'Domain not found' });
    }

    const config = await db
      .select()
      .from(domainConfiguration)
      .where(eq(domainConfiguration.domainAuthId, parseInt(id)))
      .limit(1);

    const dkimSelector = config[0]?.generatedDkimSelector || generateDkimSelector(domain[0].domain);

    const dnsRecords = domainDnsGenerator.generateAllDnsRecords({
      domain: domain[0].domain,
      subdomain: config[0]?.subdomain || undefined,
      provider: options.provider || 'mailgun',
      region: options.region || (config[0]?.mailgunRegion as 'US' | 'EU') || 'US',
      dkimSelector,
      includeTracking: options.includeTracking ?? true,
      dmarcPolicy: options.dmarcPolicy || 'none',
    });

    // Update configuration
    if (config[0]) {
      await db
        .update(domainConfiguration)
        .set({
          generatedSpfRecord: dnsRecords.spf.value,
          generatedDkimSelector: dkimSelector,
          generatedDkimRecord: dnsRecords.dkim.value,
          generatedDmarcRecord: dnsRecords.dmarc.value,
          generatedTrackingCname: dnsRecords.tracking?.value || null,
          updatedAt: new Date(),
        })
        .where(eq(domainConfiguration.domainAuthId, parseInt(id)));
    }

    res.json(domainDnsGenerator.formatDnsRecordsForDisplay(dnsRecords));
  } catch (error: any) {
    console.error('Error generating DNS records:', error);
    res.status(500).json({ error: 'Failed to generate DNS records' });
  }
});

// =============================================================================
// DNS Validation
// =============================================================================

/**
 * POST /api/domains/:id/validate
 * Validate DNS records for a domain
 */
router.post('/:id/validate', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const domain = await db
      .select()
      .from(domainAuth)
      .where(eq(domainAuth.id, parseInt(id)))
      .limit(1);

    if (domain.length === 0) {
      return res.status(404).json({ error: 'Domain not found' });
    }

    const config = await db
      .select()
      .from(domainConfiguration)
      .where(eq(domainConfiguration.domainAuthId, parseInt(id)))
      .limit(1);

    const dkimSelector = config[0]?.generatedDkimSelector || 'default';

    // Run validation
    const validation = await domainValidator.validateDomain({
      domain: domain[0].domain,
      dkimSelector,
      expectedSpfIncludes: ['mailgun.org'], // Could be dynamic based on provider
      trackingSubdomain: 'email',
    });

    // Update domain status
    await db
      .update(domainAuth)
      .set({
        spfStatus: validation.spf.status === 'verified' ? 'verified' : validation.spf.status === 'partial' ? 'pending' : 'failed',
        dkimStatus: validation.dkim.status === 'verified' ? 'verified' : validation.dkim.status === 'partial' ? 'pending' : 'failed',
        dmarcStatus: validation.dmarc.status === 'verified' ? 'verified' : validation.dmarc.status === 'partial' ? 'pending' : 'failed',
        trackingDomainStatus: validation.tracking?.status === 'verified' ? 'verified' : 'pending',
        lastCheckedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(domainAuth.id, parseInt(id)));

    // Update configuration timestamps
    if (config[0]) {
      await db
        .update(domainConfiguration)
        .set({
          spfVerifiedAt: validation.spf.valid ? new Date() : null,
          dkimVerifiedAt: validation.dkim.valid ? new Date() : null,
          dmarcVerifiedAt: validation.dmarc.valid ? new Date() : null,
          trackingVerifiedAt: validation.tracking?.valid ? new Date() : null,
          updatedAt: new Date(),
        })
        .where(eq(domainConfiguration.domainAuthId, parseInt(id)));
    }

    res.json(validation);
  } catch (error: any) {
    console.error('Error validating domain:', error);
    res.status(500).json({ error: 'Failed to validate domain' });
  }
});

/**
 * GET /api/domains/:id/health
 * Get health score and recommendations for a domain
 */
router.get('/:id/health', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const domain = await db
      .select()
      .from(domainAuth)
      .where(eq(domainAuth.id, parseInt(id)))
      .limit(1);

    if (domain.length === 0) {
      return res.status(404).json({ error: 'Domain not found' });
    }

    const result = await deliverabilityScorer.runDomainHealthCheck(
      parseInt(id),
      domain[0].domain
    );

    res.json(result);
  } catch (error: any) {
    console.error('Error fetching health score:', error);
    res.status(500).json({ error: 'Failed to fetch health score' });
  }
});

/**
 * GET /api/domains/:id/recommendations
 * Get recommendations for improving deliverability
 */
router.get('/:id/recommendations', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const domain = await db
      .select()
      .from(domainAuth)
      .where(eq(domainAuth.id, parseInt(id)))
      .limit(1);

    if (domain.length === 0) {
      return res.status(404).json({ error: 'Domain not found' });
    }

    const recommendations = await deliverabilityScorer.generateRecommendations(
      parseInt(id),
      domain[0].domain
    );

    res.json(recommendations);
  } catch (error: any) {
    console.error('Error generating recommendations:', error);
    res.status(500).json({ error: 'Failed to generate recommendations' });
  }
});

// =============================================================================
// Warmup Management
// =============================================================================

/**
 * POST /api/domains/:id/warmup/start
 * Start domain warmup schedule
 */
router.post('/:id/warmup/start', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const schema = z.object({
      targetDailyVolume: z.number().min(100).max(100000).default(5000),
      isNewDomain: z.boolean().default(true),
    });

    const { targetDailyVolume, isNewDomain } = schema.parse(req.body);

    const domain = await db
      .select()
      .from(domainAuth)
      .where(eq(domainAuth.id, parseInt(id)))
      .limit(1);

    if (domain.length === 0) {
      return res.status(404).json({ error: 'Domain not found' });
    }

    // Generate warmup schedule
    const schedule = domainDnsGenerator.getWarmupSchedule({
      isNewDomain,
      currentDailyVolume: 0,
      targetDailyVolume,
    });

    // Clear existing schedule
    await db
      .delete(domainWarmupSchedule)
      .where(eq(domainWarmupSchedule.domainAuthId, parseInt(id)));

    // Insert new schedule
    const startDate = new Date();
    for (const daySchedule of schedule) {
      const scheduledDate = new Date(startDate);
      scheduledDate.setDate(scheduledDate.getDate() + daySchedule.day - 1);

      await db.insert(domainWarmupSchedule).values({
        domainAuthId: parseInt(id),
        day: daySchedule.day,
        scheduledDate,
        targetVolume: daySchedule.targetVolume,
        status: daySchedule.day === 1 ? 'in_progress' : 'pending',
        notes: daySchedule.notes,
      });
    }

    // Update health score warmup phase
    await db
      .update(domainHealthScores)
      .set({
        warmupPhase: 'phase_1',
        warmupStartedAt: new Date(),
        dailySendTarget: schedule[0].targetVolume,
        updatedAt: new Date(),
      })
      .where(eq(domainHealthScores.domainAuthId, parseInt(id)));

    res.json({
      success: true,
      schedule,
      startDate,
    });
  } catch (error: any) {
    console.error('Error starting warmup:', error);
    res.status(500).json({ error: 'Failed to start warmup' });
  }
});

/**
 * POST /api/domains/:id/warmup/pause
 * Pause domain warmup
 */
router.post('/:id/warmup/pause', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    await db
      .update(domainHealthScores)
      .set({
        warmupPhase: 'paused',
        updatedAt: new Date(),
      })
      .where(eq(domainHealthScores.domainAuthId, parseInt(id)));

    res.json({ success: true, message: 'Warmup paused' });
  } catch (error: any) {
    console.error('Error pausing warmup:', error);
    res.status(500).json({ error: 'Failed to pause warmup' });
  }
});

/**
 * GET /api/domains/:id/warmup/schedule
 * Get warmup schedule for a domain
 */
router.get('/:id/warmup/schedule', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const schedule = await db
      .select()
      .from(domainWarmupSchedule)
      .where(eq(domainWarmupSchedule.domainAuthId, parseInt(id)))
      .orderBy(domainWarmupSchedule.day);

    const health = await db
      .select()
      .from(domainHealthScores)
      .where(eq(domainHealthScores.domainAuthId, parseInt(id)))
      .orderBy(desc(domainHealthScores.scoredAt))
      .limit(1);

    res.json({
      schedule,
      currentPhase: health[0]?.warmupPhase || 'not_started',
      startedAt: health[0]?.warmupStartedAt,
      currentDailyTarget: health[0]?.dailySendTarget,
    });
  } catch (error: any) {
    console.error('Error fetching warmup schedule:', error);
    res.status(500).json({ error: 'Failed to fetch warmup schedule' });
  }
});

export default router;
