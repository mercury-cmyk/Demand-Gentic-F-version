import { Router, Request, Response } from 'express';
import { signatureService } from '../lib/signature-service';
import { requireAuth } from '../auth';
import { z } from 'zod';

const router = Router();

const createSignatureSchema = z.object({
  name: z.string().min(1).max(255),
  signatureHtml: z.string().min(1),
  signaturePlain: z.string().optional(),
  isDefault: z.boolean().optional(),
});

const updateSignatureSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  signatureHtml: z.string().min(1).optional(),
  signaturePlain: z.string().optional(),
  isDefault: z.boolean().optional(),
  active: z.boolean().optional(),
});

router.post('/signatures', requireAuth, async (req: Request, res: Response) => {
  try {
    const input = createSignatureSchema.parse(req.body);
    const signature = await signatureService.createSignature((req as any).user.id, input);

    res.status(201).json(signature);
  } catch (error) {
    console.error('[SIGNATURE-CREATE] Error:', error);
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Invalid input', details: error.errors });
    }
    res.status(500).json({ error: 'Failed to create signature' });
  }
});

router.get('/signatures', requireAuth, async (req: Request, res: Response) => {
  try {
    const signatures = await signatureService.getUserSignatures((req as any).user.id);
    res.json(signatures);
  } catch (error) {
    console.error('[SIGNATURE-LIST] Error:', error);
    res.status(500).json({ error: 'Failed to fetch signatures' });
  }
});

router.get('/signatures/default', requireAuth, async (req: Request, res: Response) => {
  try {
    const signature = await signatureService.getDefaultSignature((req as any).user.id);
    res.json(signature);
  } catch (error) {
    console.error('[SIGNATURE-DEFAULT] Error:', error);
    res.status(500).json({ error: 'Failed to fetch default signature' });
  }
});

router.get('/signatures/:id', requireAuth, async (req: Request, res: Response) => {
  try {
    const signature = await signatureService.getSignatureById((req as any).user.id, req.params.id);
    
    if (!signature) {
      return res.status(404).json({ error: 'Signature not found' });
    }

    res.json(signature);
  } catch (error) {
    console.error('[SIGNATURE-GET] Error:', error);
    res.status(500).json({ error: 'Failed to fetch signature' });
  }
});

router.patch('/signatures/:id', requireAuth, async (req: Request, res: Response) => {
  try {
    const input = updateSignatureSchema.parse(req.body);
    const signature = await signatureService.updateSignature((req as any).user.id, req.params.id, input);

    if (!signature) {
      return res.status(404).json({ error: 'Signature not found' });
    }

    res.json(signature);
  } catch (error) {
    console.error('[SIGNATURE-UPDATE] Error:', error);
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Invalid input', details: error.errors });
    }
    res.status(500).json({ error: 'Failed to update signature' });
  }
});

router.delete('/signatures/:id', requireAuth, async (req: Request, res: Response) => {
  try {
    const deleted = await signatureService.deleteSignature((req as any).user.id, req.params.id);

    if (!deleted) {
      return res.status(404).json({ error: 'Signature not found' });
    }

    res.status(204).send();
  } catch (error) {
    console.error('[SIGNATURE-DELETE] Error:', error);
    res.status(500).json({ error: 'Failed to delete signature' });
  }
});

router.post('/signatures/:id/set-default', requireAuth, async (req: Request, res: Response) => {
  try {
    const signature = await signatureService.setDefaultSignature((req as any).user.id, req.params.id);

    if (!signature) {
      return res.status(404).json({ error: 'Signature not found' });
    }

    res.json(signature);
  } catch (error) {
    console.error('[SIGNATURE-SET-DEFAULT] Error:', error);
    res.status(500).json({ error: 'Failed to set default signature' });
  }
});

export default router;
