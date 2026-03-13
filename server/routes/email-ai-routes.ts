import { Router } from 'express';
import { requireAuth } from '../auth';
import { analyzeEmail, rewriteEmail } from '../lib/email-ai-service';
import { composeEmail, rewriteEmailBody, checkGrammar } from '../services/email-compose-ai';
import { z } from 'zod';

const router = Router();

const analyzeEmailSchema = z.object({
  subject: z.string().min(1, 'Subject is required'),
  body: z.string().min(1, 'Body is required'),
  recipientContext: z.string().optional(),
});

const rewriteEmailSchema = z.object({
  subject: z.string().min(1, 'Subject is required'),
  body: z.string().min(1, 'Body is required'),
  improvements: z.array(z.string()).min(1, 'At least one improvement is required'),
});

router.post('/analyze', requireAuth, async (req, res) => {
  try {
    const { subject, body, recipientContext } = analyzeEmailSchema.parse(req.body);

    const analysis = await analyzeEmail(subject, body, recipientContext);

    res.json(analysis);
  } catch (error) {
    console.error('[EMAIL-AI] Analysis error:', error);
    if (error instanceof z.ZodError) {
      return res.status(400).json({ message: 'Invalid request data', errors: error.errors });
    }
    res.status(500).json({ message: (error as Error).message || 'Failed to analyze email' });
  }
});

router.post('/rewrite', requireAuth, async (req, res) => {
  try {
    const { subject, body, improvements } = rewriteEmailSchema.parse(req.body);

    const rewritten = await rewriteEmail(subject, body, improvements);

    res.json(rewritten);
  } catch (error) {
    console.error('[EMAIL-AI] Rewrite error:', error);
    if (error instanceof z.ZodError) {
      return res.status(400).json({ message: 'Invalid request data', errors: error.errors });
    }
    res.status(500).json({ message: (error as Error).message || 'Failed to rewrite email' });
  }
});

// ==================== AI Compose (DeepSeek → Kimi → OpenAI) ====================

const composeEmailSchema = z.object({
  prompt: z.string().min(1, 'Prompt is required').max(2000),
  tone: z.string().optional(),
  replyTo: z.string().optional(),
});

router.post('/compose', requireAuth, async (req, res) => {
  try {
    const { prompt, tone, replyTo } = composeEmailSchema.parse(req.body);
    const result = await composeEmail(prompt, { tone, replyTo });
    res.json(result);
  } catch (error) {
    console.error('[EMAIL-AI] Compose error:', error);
    if (error instanceof z.ZodError) {
      return res.status(400).json({ message: 'Invalid request data', errors: error.errors });
    }
    res.status(500).json({ message: (error as Error).message || 'Failed to compose email' });
  }
});

const rewriteBodySchema = z.object({
  body: z.string().min(1, 'Body is required'),
  instructions: z.string().min(1, 'Instructions are required').max(1000),
});

router.post('/rewrite-body', requireAuth, async (req, res) => {
  try {
    const { body, instructions } = rewriteBodySchema.parse(req.body);
    const result = await rewriteEmailBody(body, instructions);
    res.json(result);
  } catch (error) {
    console.error('[EMAIL-AI] Rewrite-body error:', error);
    if (error instanceof z.ZodError) {
      return res.status(400).json({ message: 'Invalid request data', errors: error.errors });
    }
    res.status(500).json({ message: (error as Error).message || 'Failed to rewrite email' });
  }
});

const grammarCheckSchema = z.object({
  text: z.string().min(1, 'Text is required').max(10000),
});

router.post('/grammar', requireAuth, async (req, res) => {
  try {
    const { text } = grammarCheckSchema.parse(req.body);
    const result = await checkGrammar(text);
    res.json(result);
  } catch (error) {
    console.error('[EMAIL-AI] Grammar check error:', error);
    if (error instanceof z.ZodError) {
      return res.status(400).json({ message: 'Invalid request data', errors: error.errors });
    }
    res.status(500).json({ message: (error as Error).message || 'Failed to check grammar' });
  }
});

export default router;
