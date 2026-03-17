import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import { requireAuth, requireRole } from '../auth';
import { generateAdminEmailTemplateFromPromptSystem } from '../services/admin-email-template-generator';

const router = Router();

router.use(requireAuth, requireRole('admin', 'campaign_manager'));

const generateTemplateSchema = z.object({
  campaignId: z.string().nullable().optional(),
  projectId: z.string().nullable().optional(),
  clientAccountId: z.string().nullable().optional(),
  campaignType: z.string().nullable().optional(),
  channel: z.string().nullable().optional(),
  tone: z.enum(['professional', 'friendly', 'direct']),
  design: z.enum(['plain', 'branded', 'newsletter', 'argyle-brand']),
  campaignName: z.string().default(''),
  objective: z.string().default(''),
  description: z.string().default(''),
  targetAudience: z.string().default(''),
  successCriteria: z.string().optional().default(''),
  targetJobTitles: z.array(z.string()).optional().default([]),
  targetIndustries: z.array(z.string()).optional().default([]),
  landingPageUrl: z.string().default(''),
  organizationName: z.string().default(''),
  organizationIntelligence: z.record(z.any()).nullable().optional(),
  eventContext: z
    .object({
      title: z.string().optional(),
      date: z.string().optional(),
      type: z.string().optional(),
      location: z.string().optional(),
      community: z.string().optional(),
      sourceUrl: z.string().optional(),
      overview: z.string().optional(),
      agenda: z.string().optional(),
      speakers: z.string().optional(),
    })
    .nullable()
    .optional(),
  recipient: z
    .object({
      firstName: z.string().optional(),
      company: z.string().optional(),
      jobTitle: z.string().optional(),
      industry: z.string().optional(),
    })
    .optional(),
  paletteOverrides: z
    .object({
      heroGradient: z.string(),
      cta: z.string(),
      accent: z.string(),
      surface: z.string(),
      button: z.string(),
    })
    .optional(),
  cacheBust: z.number().optional(),
  forceRefreshEventBrief: z.boolean().optional(),
});

router.post('/generate', async (req: Request, res: Response) => {
  const startedAt = Date.now();
  console.info('[EmailTemplateDebug] route.request', {
    method: req.method,
    url: req.originalUrl,
    contentType: req.headers['content-type'] || null,
  });
  try {
    const payload = generateTemplateSchema.parse(req.body);
    console.info('[EmailTemplateDebug] route.payload', {
      generator: 'generateAdminEmailTemplateFromPromptSystem',
      generatorFile: 'server/services/admin-email-template-generator.ts',
      campaignId: payload.campaignId || null,
      landingPageUrl: payload.landingPageUrl || null,
      tone: payload.tone,
      design: payload.design,
      cacheBust: typeof payload.cacheBust === 'number' ? payload.cacheBust : null,
      forceRefreshEventBrief: payload.forceRefreshEventBrief === true,
      templateCacheHit: false,
      templateCacheSource: 'none',
    });
    const generated = await generateAdminEmailTemplateFromPromptSystem(payload);

    console.info('[AdminEmailTemplate] generated', {
      campaignId: payload.campaignId || null,
      promptKey: generated.promptKeyUsed,
      variantCount: 1,
      usedFallback: generated.usedFallback,
    });

    console.info('[EmailTemplateDebug] route.response', {
      status: 200,
      durationMs: Date.now() - startedAt,
      usedFallback: generated.usedFallback,
      subjectLength: generated.subject.length,
      preheaderLength: generated.preheader.length,
      bodyLength: generated.bodyText.length,
      takeawaySignals: (generated.bodyText.match(/^- /gm) || []).length,
    });

    return res.json({
      success: true,
      template: generated,
    });
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      console.info('[EmailTemplateDebug] route.response', {
        status: 400,
        durationMs: Date.now() - startedAt,
        error: 'validation_error',
      });
      return res.status(400).json({
        success: false,
        message: 'Invalid template generation request',
        errors: error.errors,
      });
    }

    console.error('[AdminEmailTemplate] generate error:', error);
    console.info('[EmailTemplateDebug] route.response', {
      status: 500,
      durationMs: Date.now() - startedAt,
      error: error?.message || 'Failed to generate email template',
    });
    return res.status(500).json({
      success: false,
      message: error?.message || 'Failed to generate email template',
    });
  }
});

export default router;
