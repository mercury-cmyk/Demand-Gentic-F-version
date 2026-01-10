import { Router } from 'express';
import { requireAuth } from '../auth';
import { z } from 'zod';
import {
  generateEmailContent,
  improveEmailContent,
  generateSubjectVariants,
  analyzeEmailQuality,
} from '../lib/deepseek-email-service';

const router = Router();

// Schema for content generation
const generateContentSchema = z.object({
  prompt: z.string().min(5, 'Prompt must be at least 5 characters'),
  companyName: z.string().optional(),
  industry: z.string().optional(),
  targetAudience: z.string().optional(),
  tone: z.enum(['professional', 'friendly', 'urgent', 'casual']).optional(),
  templateType: z.string().optional(),
  accountId: z.string().optional(),
  campaignId: z.string().optional(),
});

// Schema for content improvement
const improveContentSchema = z.object({
  currentHtml: z.string().min(1, 'Current HTML is required'),
  subject: z.string().min(1, 'Subject is required'),
  prompt: z.string().min(5, 'Prompt must be at least 5 characters'),
  brandPalette: z.string().optional(),
  companyName: z.string().optional(),
  industry: z.string().optional(),
  targetAudience: z.string().optional(),
  accountId: z.string().optional(),
  campaignId: z.string().optional(),
});

// Schema for subject variants
const subjectVariantsSchema = z.object({
  topic: z.string().min(3, 'Topic is required'),
  currentSubject: z.string().optional(),
  count: z.number().min(1).max(10).optional().default(5),
});

// Schema for quality analysis
const qualityAnalysisSchema = z.object({
  subject: z.string().min(1, 'Subject is required'),
  htmlContent: z.string().min(1, 'HTML content is required'),
});

/**
 * Generate email content from a prompt using DeepSeek AI
 * POST /api/email-ai/deepseek/generate
 */
router.post('/generate', requireAuth, async (req, res) => {
  try {
    const data = generateContentSchema.parse(req.body);
    
    const content = await generateEmailContent(data.prompt, {
      companyName: data.companyName,
      industry: data.industry,
      targetAudience: data.targetAudience,
      tone: data.tone,
      templateType: data.templateType,
      accountId: data.accountId,
      campaignId: data.campaignId,
    });

    res.json({
      success: true,
      content,
    });
  } catch (error: any) {
    console.error('[DEEPSEEK-AI] Generate error:', error);
    
    if (error instanceof z.ZodError) {
      return res.status(400).json({ 
        success: false,
        message: 'Invalid request data', 
        errors: error.errors 
      });
    }
    
    if (error.message?.includes('API key')) {
      return res.status(503).json({ 
        success: false,
        message: 'AI service not configured. Please set DEEPSEEK_API_KEY.' 
      });
    }
    
    res.status(500).json({ 
      success: false,
      message: error.message || 'Failed to generate content' 
    });
  }
});

/**
 * Improve existing email content using DeepSeek AI
 * POST /api/email-ai/deepseek/improve
 */
router.post('/improve', requireAuth, async (req, res) => {
  try {
    const data = improveContentSchema.parse(req.body);
    
    const improvement = await improveEmailContent(data);

    res.json({
      success: true,
      improvement,
    });
  } catch (error: any) {
    console.error('[DEEPSEEK-AI] Improve error:', error);
    
    if (error instanceof z.ZodError) {
      return res.status(400).json({ 
        success: false,
        message: 'Invalid request data', 
        errors: error.errors 
      });
    }
    
    res.status(500).json({ 
      success: false,
      message: error.message || 'Failed to improve content' 
    });
  }
});

/**
 * Generate subject line variants for A/B testing
 * POST /api/email-ai/deepseek/subject-variants
 */
router.post('/subject-variants', requireAuth, async (req, res) => {
  try {
    const data = subjectVariantsSchema.parse(req.body);
    
    const result = await generateSubjectVariants(
      data.topic,
      data.currentSubject,
      data.count
    );

    res.json({
      success: true,
      ...result,
    });
  } catch (error: any) {
    console.error('[DEEPSEEK-AI] Subject variants error:', error);
    
    if (error instanceof z.ZodError) {
      return res.status(400).json({ 
        success: false,
        message: 'Invalid request data', 
        errors: error.errors 
      });
    }
    
    res.status(500).json({ 
      success: false,
      message: error.message || 'Failed to generate subject variants' 
    });
  }
});

/**
 * Analyze email quality and spam risk
 * POST /api/email-ai/deepseek/analyze
 */
router.post('/analyze', requireAuth, async (req, res) => {
  try {
    const data = qualityAnalysisSchema.parse(req.body);
    
    const analysis = await analyzeEmailQuality(data.subject, data.htmlContent);

    res.json({
      success: true,
      analysis,
    });
  } catch (error: any) {
    console.error('[DEEPSEEK-AI] Analysis error:', error);
    
    if (error instanceof z.ZodError) {
      return res.status(400).json({ 
        success: false,
        message: 'Invalid request data', 
        errors: error.errors 
      });
    }
    
    res.status(500).json({ 
      success: false,
      message: error.message || 'Failed to analyze email' 
    });
  }
});

export default router;
