/**
 * AI Project Creation Routes
 * Natural language to structured project data extraction
 */

import { Router } from 'express';
import { z } from 'zod';
import { db } from '../db';
import { aiProjectIntents, insertAiProjectIntentSchema, type InsertAiProjectIntent } from '@shared/schema';
import { requireAuth, requireRole } from '../auth';
import { expensiveOperationLimiter } from '../middleware/security';
import {
  extractProjectFromNaturalLanguage,
  redactPII
} from '../services/ai-project-orchestrator';
import { getOrganizationById } from '../services/problem-intelligence/organization-service';

const router = Router();

// Brand colors for styled templates
const BRAND_COLORS = {
  primary: '#2563eb',    // Blue
  secondary: '#1e40af',  // Dark Blue  
  accent: '#3b82f6',     // Light Blue
  text: '#1f2937',       // Dark Gray
  muted: '#6b7280',      // Medium Gray
  background: '#f3f4f6', // Light Gray
  white: '#ffffff',
};

/**
 * Generate a styled HTML email body from structured content
 */
function generateStyledEmailBody(content: {
  heroTitle: string;
  heroSubtitle: string;
  intro: string;
  valueBullets: string[];
  ctaLabel: string;
  ctaUrl?: string;
  closingLine: string;
  senderName?: string;
}): string {
  const bulletPoints = content.valueBullets
    .map(bullet => `<li style="margin-bottom: 8px; padding-left: 8px;">${bullet}</li>`)
    .join('\n');

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="Content-Type" content="text/html; charset=UTF-8">
  <title>${content.heroTitle}</title>
  <!--[if mso]>
  <noscript>
    <xml>
      <o:OfficeDocumentSettings>
        <o:PixelsPerInch>96</o:PixelsPerInch>
      </o:OfficeDocumentSettings>
    </xml>
  </noscript>
  <![endif]-->
  <style>
    body { margin: 0; padding: 0; background-color: #f3f4f6; }
    table { border-collapse: collapse; }
    img { max-width: 100%; }
  </style>
</head>
<body style="margin: 0; padding: 0; background-color: #f3f4f6; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color: #f3f4f6;">
    <tr>
      <td align="center" style="padding: 40px 20px;">
        <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="background-color: #ffffff; border-radius: 8px; box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);">
          <tr>
            <td>
              <!-- Hero Section -->
              <div style="background: linear-gradient(135deg, ${BRAND_COLORS.primary} 0%, ${BRAND_COLORS.secondary} 100%); padding: 32px; border-radius: 8px 8px 0 0; text-align: center;">
                <h1 style="margin: 0; color: ${BRAND_COLORS.white}; font-size: 28px; font-weight: 700; line-height: 1.2;">
                  ${content.heroTitle}
                </h1>
                <p style="margin: 12px 0 0 0; color: rgba(255,255,255,0.9); font-size: 16px; line-height: 1.5;">
                  ${content.heroSubtitle}
                </p>
              </div>

              <!-- Main Content -->
              <div style="padding: 32px;">
                <p style="margin: 0 0 24px 0; color: ${BRAND_COLORS.text}; font-size: 16px; line-height: 1.6;">
                  Hi {{firstName}},
                </p>
                
                <p style="margin: 0 0 24px 0; color: ${BRAND_COLORS.text}; font-size: 16px; line-height: 1.6;">
                  ${content.intro}
                </p>

                <!-- Value Points -->
                <div style="background-color: ${BRAND_COLORS.background}; border-left: 4px solid ${BRAND_COLORS.primary}; padding: 20px 24px; margin: 24px 0; border-radius: 0 8px 8px 0;">
                  <p style="margin: 0 0 12px 0; font-weight: 600; color: ${BRAND_COLORS.text}; font-size: 14px; text-transform: uppercase; letter-spacing: 0.5px;">
                    What You'll Get:
                  </p>
                  <ul style="margin: 0; padding: 0 0 0 20px; color: ${BRAND_COLORS.text}; font-size: 15px; line-height: 1.6;">
                    ${bulletPoints}
                  </ul>
                </div>

                <!-- CTA Button -->
                <div style="text-align: center; margin: 32px 0;">
                  <a href="${content.ctaUrl || 'https://example.com'}" style="display: inline-block; background: linear-gradient(135deg, ${BRAND_COLORS.primary} 0%, ${BRAND_COLORS.accent} 100%); color: ${BRAND_COLORS.white}; padding: 14px 32px; border-radius: 6px; text-decoration: none; font-weight: 600; font-size: 16px; box-shadow: 0 4px 14px rgba(37, 99, 235, 0.3);">
                    ${content.ctaLabel}
                  </a>
                </div>

                <!-- Closing -->
                <p style="margin: 24px 0 0 0; color: ${BRAND_COLORS.text}; font-size: 16px; line-height: 1.6;">
                  ${content.closingLine}
                </p>

                <!-- Signature -->
                <div style="margin-top: 32px; padding-top: 16px; border-top: 1px solid #e5e7eb;">
                  <p style="margin: 0; font-weight: 600; color: ${BRAND_COLORS.text};">${content.senderName || 'Your Team'}</p>
                </div>
              </div>
            </td>
          </tr>
          <tr>
            <td style="padding: 20px 32px; background: #1e293b; border-radius: 0 0 8px 8px; text-align: center;">
              <p style="margin: 0; color: #94a3b8; font-size: 13px;">
                <a href="{{unsubscribe_url}}" style="color: #60a5fa; text-decoration: none;">Unsubscribe</a> | 
                <a href="#" style="color: #60a5fa; text-decoration: none;">Preferences</a>
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

/**
 * Generate fallback content when AI is unavailable
 */
function generateFallbackContent(params: {
  campaignName: string;
  outreachType: string;
  tone: string;
  context: string;
  senderName: string;
  companyName?: string;
  ctaUrl?: string;
}) {
  const { campaignName, outreachType, context, senderName, companyName, ctaUrl } = params;
  const contextTrimmed = context.trim();
  const contextHeadline = contextTrimmed || "Quick idea for {{company}}";
  
  // Generate contextual content based on outreach type
  const templates: Record<string, any> = {
    'cold-outreach': {
      heroTitle: 'Quick idea for {{company}}',
      heroSubtitle: 'A practical way to improve outcomes without a heavy lift',
      intro: `Hi {{firstName}}, I noticed ${companyName || 'your team'} is focused on growth and efficiency. ${context || 'We typically help teams reduce time-to-value and improve conversion quality without adding headcount.'}`,
      valueBullets: [
        'Reduce manual effort by 20-30% through targeted automation',
        'Improve pipeline quality with clearer qualification signals',
        'Launch in days, not weeks, with guided enablement'
      ],
      ctaLabel: 'Open to a quick chat?',
      closingLine: 'If it sounds relevant, happy to share a short walkthrough.'
    },
    'follow-up': {
      heroTitle: 'Following up briefly',
      heroSubtitle: 'Sharing a clearer use case for your team',
      intro: `Hi {{firstName}}, quick follow-up in case my last note got buried. ${context || 'Teams like {{company}} use this to accelerate handoffs and tighten conversion rates.'}`,
      valueBullets: [
        'Takes 15 minutes to assess fit',
        'No rip-and-replace - integrates with your current stack',
        'Clear ROI with measurable lift in response rates'
      ],
      ctaLabel: 'Worth a 15-min look?',
      closingLine: 'Happy to tailor it to your workflow if helpful.'
    },
    'meeting-request': {
      heroTitle: 'Short meeting request',
      heroSubtitle: 'A focused walkthrough with immediate takeaways',
      intro: context || 'I have a few specific ideas that could improve your team\'s outreach efficiency and conversion quality.',
      valueBullets: [
        '20-minute walkthrough tailored to {{company}}',
        'Benchmarks from similar B2B teams',
        'Actionable steps you can apply immediately'
      ],
      ctaLabel: 'Book a Time',
      closingLine: 'If you\'re open, I can send a couple time options.'
    },
    'event-invite': {
      heroTitle: 'You\'re invited',
      heroSubtitle: 'A practical session for revenue leaders',
      intro: context || 'We\'re hosting a short, tactical session on improving B2B outreach performance and attribution.',
      valueBullets: [
        'Real examples from high-performing teams',
        'Playbooks you can reuse immediately',
        'Live Q&A on your use case'
      ],
      ctaLabel: 'Reserve Your Spot',
      closingLine: 'Hope you can join us.'
    },
    'content-promotion': {
      heroTitle: contextHeadline,
      heroSubtitle: 'Practical insights for B2B demand generation',
      intro: contextTrimmed
        ? `Hi {{firstName}},\n\n${contextTrimmed}`
        : 'I wanted to share a concise resource that outlines what is working now for B2B teams.',
      valueBullets: [
        'Actionable steps your team can use this week',
        'Benchmarks for modern demand gen programs',
        'Templates you can plug into your workflow'
      ],
      ctaLabel: 'Get It Now',
      closingLine: 'Let me know if you want the companion checklist as well.'
    }
  };

  const template = templates[outreachType] || templates['cold-outreach'];

  if (contextTrimmed) {
    template.heroTitle = template.heroTitle || contextHeadline;
    template.intro = template.intro || `Hi {{firstName}},\n\n${contextTrimmed}`;
  }
  
  // Adjust for campaign name context
  if (campaignName && campaignName.toLowerCase() !== 'untitled campaign') {
    template.intro = `${template.intro} This is regarding ${campaignName}.`;
  }

  return {
    ...template,
    senderName,
    ctaUrl: ctaUrl || undefined
  };
}

// Request validation schemas
const extractProjectSchema = z.object({
  prompt: z.string().min(10, 'Prompt must be at least 10 characters').max(5000, 'Prompt must be less than 5000 characters'),
});

const intentFeedbackSchema = z.object({
  correctedData: z.record(z.any()).optional(),
  feedbackNotes: z.string().optional(),
  wasUseful: z.boolean().optional(),
});

// Schema for email generation
const generateEmailSchema = z.object({
  campaignName: z.string().optional().default('Untitled Campaign'),
  outreachType: z.string().optional().default('cold-outreach'),
  tone: z.string().optional().default('professional'),
  context: z.string().optional().default(''),
  senderName: z.string().optional().default('Your Team'),
  companyName: z.string().optional().default(''),
  ctaUrl: z.string().optional().default(''),
  brandPalette: z.string().optional(),
  // Project & org context for intelligent generation
  organizationId: z.string().optional(),
  projectName: z.string().optional(),
  projectDescription: z.string().optional(),
  clientName: z.string().optional(),
});

/**
 * POST /api/ai/generate-email
 * Generate AI-powered email content with styled HTML
 */
router.post(
  '/generate-email',
  requireAuth,
  async (req, res) => {
    try {
      const params = generateEmailSchema.parse(req.body);
      
      console.log('[AI Email] Generating email for:', params.campaignName);

      // Load org intelligence if an organizationId is provided
      let orgContext = '';
      if (params.organizationId) {
        try {
          const org = await getOrganizationById(params.organizationId);
          if (org) {
            const parts: string[] = [];
            if (org.compiledOrgContext) {
              parts.push(org.compiledOrgContext);
            } else {
              if (org.identity) {
                const identity = org.identity as any;
                if (identity.description) parts.push(`Organization: ${identity.description}`);
                if (identity.industry) parts.push(`Industry: ${identity.industry}`);
              }
              if (org.offerings) {
                const offerings = org.offerings as any;
                if (offerings.coreProducts?.length) parts.push(`Products/Services: ${offerings.coreProducts.join(', ')}`);
                if (offerings.problemsSolved?.length) parts.push(`Problems solved: ${offerings.problemsSolved.join(', ')}`);
                if (offerings.differentiators?.length) parts.push(`Differentiators: ${offerings.differentiators.join(', ')}`);
              }
              if (org.positioning) {
                const pos = org.positioning as any;
                if (pos.valueProposition) parts.push(`Value proposition: ${pos.valueProposition}`);
              }
              if (org.outreach) {
                const outreach = org.outreach as any;
                if (outreach.emailAngles?.length) parts.push(`Proven email angles: ${outreach.emailAngles.join(', ')}`);
              }
            }
            orgContext = parts.join('\n');
          }
        } catch (e) {
          console.warn('[AI Email] Could not load org intelligence:', e);
        }
      }

      // Build project context section
      const projectContext = [
        params.clientName ? `Client: ${params.clientName}` : '',
        params.projectName ? `Project: ${params.projectName}` : '',
        params.projectDescription ? `Project description: ${params.projectDescription}` : '',
      ].filter(Boolean).join('\n');

      // Try to use DeepSeek AI first
      let content;
      let usedAi = false;

      try {
        // Dynamically import to avoid startup failures if not configured
        const { generateEmailContent } = await import('../lib/deepseek-email-service');

        const prompt = `Create a strategic, high-converting B2B ${params.outreachType} email for campaign "${params.campaignName}".
Tone: ${params.tone}. Company: ${params.companyName || "the sender"}.

Requirements:
- Lead with a specific, credible hook based on the context.
- Use the provided context as the PRIMARY message. If a clear headline phrase is present, use it as the heroTitle.
- Address a realistic pain point and connect it to a clear outcome.
- Use personalization tokens like {{firstName}}, {{lastName}}, {{company}}, and {{jobTitle}} where it reads naturally. Do NOT use {{contact.X}} or {{account.X}} format — use ONLY flat tokens like {{firstName}}.
- Avoid fluffy claims; prefer concrete outcomes, timelines, or proof points.
- Keep the intro 2-3 sentences, then 3 concise value bullets.
- Include a CTA label that sounds like a low-friction next step.
- If provided, use this CTA URL: ${params.ctaUrl || "https://example.com"}.
${projectContext ? `\nProject Context:\n${projectContext}` : ''}
${orgContext ? `\nOrganization Intelligence (use this to make the email highly relevant):\n${orgContext}` : ''}

Additional Context:
${params.context || "No additional context provided."}`;

        content = await generateEmailContent(prompt, {
          tone: params.tone as any,
          templateType: params.outreachType,
          companyName: params.companyName || undefined,
        });
        usedAi = true;
        console.log('[AI Email] Successfully generated with DeepSeek AI');
      } catch (aiError: any) {
        console.log('[AI Email] AI unavailable, using styled fallback:', aiError.message);
        content = generateFallbackContent(params);
      }

      if (params.ctaUrl && !content?.ctaUrl) {
        content.ctaUrl = params.ctaUrl;
      }

      // Generate styled HTML body from the content
      const styledBody = generateStyledEmailBody({
        ...content,
        senderName: params.senderName,
      });

      res.json({
        success: true,
        usedAi,
        subject: content.subject || `${params.campaignName} - Important Update`,
        body: styledBody,
        rawContent: content,
      });
    } catch (error: any) {
      console.error('[AI Email] Generation error:', error);
      
      if (error instanceof z.ZodError) {
        return res.status(400).json({ 
          success: false,
          message: 'Invalid request', 
          errors: error.errors 
        });
      }
      
      res.status(500).json({
        success: false,
        message: error.message || 'Failed to generate email',
      });
    }
  }
);

/**
 * POST /api/ai/suggest-subject
 * Generate AI-suggested email subject lines using project/org context
 */
router.post(
  '/suggest-subject',
  requireAuth,
  async (req, res) => {
    try {
      const { campaignName, projectName, projectDescription, organizationId, clientName } = req.body;

      if (!campaignName) {
        return res.status(400).json({ success: false, message: 'campaignName is required' });
      }

      // Load org intelligence if available
      let orgContext = '';
      if (organizationId) {
        try {
          const org = await getOrganizationById(organizationId);
          if (org) {
            const outreach = org.outreach as any;
            const positioning = org.positioning as any;
            if (outreach?.emailAngles?.length) orgContext += `Email angles: ${outreach.emailAngles.join(', ')}. `;
            if (positioning?.valueProposition) orgContext += `Value prop: ${positioning.valueProposition}. `;
          }
        } catch (e) {
          // Non-fatal
        }
      }

      const contextParts = [
        clientName ? `Client: ${clientName}` : '',
        projectName ? `Project: ${projectName}` : '',
        projectDescription ? projectDescription : '',
        orgContext,
      ].filter(Boolean).join(' | ');

      try {
        const { generateEmailContent } = await import('../lib/deepseek-email-service');
        const prompt = `Generate a concise, compelling B2B cold email subject line for:
Campaign: "${campaignName}"
${contextParts ? `Context: ${contextParts}` : ''}

Requirements:
- Under 60 characters
- No spam words (free, urgent, guaranteed)
- Creates curiosity or addresses a specific pain point
- Professional tone

Return ONLY the subject line text, nothing else.`;

        const result = await generateEmailContent(prompt, { tone: 'professional', templateType: 'subject-only' });
        const subject = result?.subject || result?.heroTitle || `${campaignName} — a quick note`;

        return res.json({ success: true, subject: subject.replace(/^["']|["']$/g, '').trim() });
      } catch (aiError) {
        // Fallback subject
        const words = campaignName.split(' ').slice(0, 4).join(' ');
        return res.json({ success: true, subject: `Quick question about ${words}` });
      }
    } catch (error: any) {
      console.error('[AI Subject] Error:', error);
      res.status(500).json({ success: false, message: error.message || 'Failed to suggest subject' });
    }
  }
);

/**
 * POST /api/ai/extract-project
 * Extract structured project data from natural language input
 */
router.post(
  '/extract-project',
  requireAuth,
  requireRole('admin', 'manager'),
  expensiveOperationLimiter,
  async (req, res) => {
    try {
      // Validate request body
      const validation = extractProjectSchema.safeParse(req.body);
      if (!validation.success) {
        return res.status(400).json({ 
          error: 'Invalid request', 
          details: validation.error.errors 
        });
      }
      
      const { prompt } = validation.data;
      const userId = req.user!.userId as string;

      console.log('[AI Project] Extracting project from natural language');

      // Extract project data using AI orchestrator
      const result = await extractProjectFromNaturalLanguage(prompt);

      // Redact PII from prompt for safe storage
      const redactedPrompt = redactPII(prompt);

      // Store the intent in the database
      const [intent] = await db
        .insert(aiProjectIntents)
        .values({
          userId,
          originalPrompt: redactedPrompt,
          redactedPrompt,
          extractedData: result.extractedData as any,
          confidenceScore: result.confidenceScore.toString(),
          confidenceLevel: result.confidenceLevel,
          modelUsed: result.modelUsed,
          processingTime: result.processingTime,
          validationErrors: result.validationErrors as any,
          validationWarnings: result.validationWarnings as any,
          status: result.validationErrors.length === 0 ? 'needs_review' : 'processing',
        } as InsertAiProjectIntent)
        .returning();

      console.log(`[AI Project] Created intent ${intent.id} with ${result.confidenceLevel} confidence (${result.confidenceScore}%)`);

      // Return the extracted data with metadata
      res.json({
        success: true,
        intentId: intent.id,
        extractedData: result.extractedData,
        confidenceScore: result.confidenceScore,
        confidenceLevel: result.confidenceLevel,
        validationErrors: result.validationErrors,
        validationWarnings: result.validationWarnings,
        status: intent.status,
        processingTime: result.processingTime,
      });
    } catch (error) {
      console.error('[AI Project] Extraction failed:', error);
      res.status(500).json({
        error: error instanceof Error ? error.message : 'Failed to extract project data',
      });
    }
  }
);

/**
 * GET /api/ai/intents
 * Get all AI project intents for the current user
 */
router.get(
  '/intents',
  requireAuth,
  requireRole('admin', 'manager'),
  async (req, res) => {
    try {
      const userId = req.user!.userId as string;
      
      // Only return intents created by the current user
      const intents = await db.query.aiProjectIntents.findMany({
        where: (intents, { eq }) => eq(intents.userId, userId),
        orderBy: (intents, { desc }) => [desc(intents.createdAt)],
        limit: 100,
      });

      res.json(intents);
    } catch (error) {
      console.error('[AI Project] Failed to fetch intents:', error);
      res.status(500).json({
        error: 'Failed to fetch AI project intents',
      });
    }
  }
);

/**
 * GET /api/ai/intents/:id
 * Get a specific AI project intent by ID
 */
router.get(
  '/intents/:id',
  requireAuth,
  requireRole('admin', 'manager'),
  async (req, res) => {
    try {
      const intentId = req.params.id;
      const userId = req.user!.userId as string;

      // Only return intent if it belongs to the current user
      const intent = await db.query.aiProjectIntents.findFirst({
        where: (intents, { eq, and }) => and(
          eq(intents.id, intentId),
          eq(intents.userId, userId)
        ),
      });

      if (!intent) {
        return res.status(404).json({ error: 'Intent not found' });
      }

      res.json(intent);
    } catch (error) {
      console.error('[AI Project] Failed to fetch intent:', error);
      res.status(500).json({
        error: 'Failed to fetch AI project intent',
      });
    }
  }
);

/**
 * POST /api/ai/intents/:id/feedback
 * Submit feedback for an AI project intent (learning loop)
 */
router.post(
  '/intents/:id/feedback',
  requireAuth,
  requireRole('admin', 'manager'),
  async (req, res) => {
    try {
      // Validate request body
      const validation = intentFeedbackSchema.safeParse(req.body);
      if (!validation.success) {
        return res.status(400).json({ 
          error: 'Invalid request', 
          details: validation.error.errors 
        });
      }
      
      const intentId = req.params.id;
      const userId = req.user!.userId as string;
      const { correctedData, feedbackNotes, wasUseful } = validation.data;

      // Verify the intent belongs to the current user
      const intent = await db.query.aiProjectIntents.findFirst({
        where: (intents, { eq, and }) => and(
          eq(intents.id, intentId),
          eq(intents.userId, userId)
        ),
      });

      if (!intent) {
        return res.status(404).json({ error: 'Intent not found' });
      }

      // TODO: Store feedback in aiIntentFeedback table
      // This will be implemented in task 6 (feedback learning system)

      console.log(`[AI Project] Received feedback for intent ${intentId}`);

      res.json({
        success: true,
        message: 'Feedback recorded successfully',
      });
    } catch (error) {
      console.error('[AI Project] Failed to record feedback:', error);
      res.status(500).json({
        error: 'Failed to record feedback',
      });
    }
  }
);

export default router;
