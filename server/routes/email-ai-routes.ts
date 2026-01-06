import { Router } from 'express';
import { requireAuth } from '../auth';
import { analyzeEmail, rewriteEmail } from '../lib/email-ai-service';
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
    res.status(500).json({ message: 'Failed to analyze email' });
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
    res.status(500).json({ message: 'Failed to rewrite email' });
  }
});

export default router;
