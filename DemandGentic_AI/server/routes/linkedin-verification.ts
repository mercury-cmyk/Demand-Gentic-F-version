/**
 * LinkedIn Image Verification Routes
 * Handles LinkedIn screenshot uploads and verification workflow
 */

import { Router } from 'express';
import { requireAuth } from '../auth';
import { getPresignedUploadUrl, generateStorageKey, getPublicUrl } from '../lib/storage';
import { z } from 'zod';
import { db } from '../db';
import { leads, contacts, accounts } from '@shared/schema';
import { eq } from 'drizzle-orm';
import crypto from 'crypto';
import { linkedinVerificationQueue } from '../lib/linkedin-verification-queue';

const router = Router();

// Schema for LinkedIn upload request
const linkedinUploadSchema = z.object({
  leadId: z.string().uuid(),
  fileName: z.string(),
  contentType: z.string().regex(/^image\/(jpeg|jpg|png|webp)$/),
  fileSize: z.number().max(5 * 1024 * 1024), // 5MB max
});

/**
 * POST /api/linkedin-verification/upload-url
 * Generate presigned URL for LinkedIn image upload
 */
router.post('/upload-url', requireAuth, async (req, res) => {
  try {
    const { leadId, fileName, contentType, fileSize } = linkedinUploadSchema.parse(req.body);
    
    // Verify lead exists and user has access
    const lead = await db.query.leads.findFirst({
      where: eq(leads.id, leadId),
    });
    
    if (!lead) {
      return res.status(404).json({ 
        ok: false, 
        error: 'Lead not found' 
      });
    }

    // Generate secure S3 key with random hash
    const hash = crypto.randomBytes(8).toString('hex');
    const timestamp = Date.now();
    const sanitizedName = fileName.replace(/[^a-zA-Z0-9.-]/g, '_');
    const s3Key = `linkedin-verification/${leadId}/${timestamp}-${hash}-${sanitizedName}`;

    // Generate presigned upload URL (15 minute expiry)
    const uploadUrl = await getPresignedUploadUrl(s3Key, contentType, 900);
    
    // Generate public URL for viewing after upload
    const publicUrl = await getPublicUrl(s3Key);

    console.log('[LINKEDIN-UPLOAD] Generated presigned URL for lead:', leadId);

    return res.json({
      ok: true,
      uploadUrl,
      publicUrl,
      s3Key
    });

  } catch (error) {
    console.error('[LINKEDIN-UPLOAD] Error generating upload URL:', error);
    
    if (error instanceof z.ZodError) {
      return res.status(400).json({ 
        ok: false, 
        error: 'Invalid upload request', 
        details: error.errors 
      });
    }
    
    return res.status(500).json({ 
      ok: false, 
      error: 'Failed to generate upload URL' 
    });
  }
});

/**
 * POST /api/linkedin-verification/verify
 * Trigger async verification after image upload
 */
router.post('/verify', requireAuth, async (req, res) => {
  try {
    const { leadId, imageUrl } = z.object({
      leadId: z.string().uuid(),
      imageUrl: z.string().url(),
    }).parse(req.body);

    // Verify lead exists and get contact data
    const lead = await db.query.leads.findFirst({
      where: eq(leads.id, leadId),
      with: {
        contact: {
          with: {
            account: true,
          },
        },
      },
    });

    if (!lead) {
      return res.status(404).json({ 
        ok: false, 
        error: 'Lead not found' 
      });
    }

    // Update lead with image URL
    await db.update(leads)
      .set({ 
        linkedinImageUrl: imageUrl,
        verificationStatus: 'pending_ai',
        updatedAt: new Date(),
      })
      .where(eq(leads.id, leadId));

    // Queue async verification job
    if (!linkedinVerificationQueue) {
      return res.status(503).json({
        ok: false,
        error: 'LinkedIn verification service unavailable (Redis not configured)',
      });
    }

    await linkedinVerificationQueue.add('verify-linkedin-image', {
      leadId,
      imageUrl,
      contactName: lead.contact?.fullName || lead.contactName || '',
      companyName: lead.contact?.account?.name || null,
    }, {
      attempts: 3,
      backoff: {
        type: 'exponential',
        delay: 2000,
      },
    });

    console.log('[LINKEDIN-VERIFY] Queued verification job for lead:', leadId);

    return res.json({
      ok: true,
      message: 'Verification job queued',
      leadId,
    });

  } catch (error) {
    console.error('[LINKEDIN-VERIFY] Error queuing verification:', error);
    
    if (error instanceof z.ZodError) {
      return res.status(400).json({ 
        ok: false, 
        error: 'Invalid verification request', 
        details: error.errors 
      });
    }
    
    return res.status(500).json({ 
      ok: false, 
      error: 'Failed to queue verification' 
    });
  }
});

/**
 * POST /api/linkedin-verification/verify-url
 * Submit LinkedIn profile URL for verification (simpler flow without image upload)
 */
router.post('/verify-url', requireAuth, async (req, res) => {
  try {
    const { leadId, linkedinUrl, agentId } = z.object({
      leadId: z.string().uuid(),
      linkedinUrl: z.string().url(),
      agentId: z.string().uuid().optional(),
    }).parse(req.body);

    // Validate LinkedIn URL - strict hostname checking
    try {
      const urlObj = new URL(linkedinUrl);
      const allowedHostnames = ['linkedin.com', 'www.linkedin.com', 'linkedin.cn', 'www.linkedin.cn'];
      if (!allowedHostnames.includes(urlObj.hostname.toLowerCase())) {
        return res.status(400).json({
          ok: false,
          error: 'Invalid LinkedIn URL - must be from linkedin.com or linkedin.cn',
        });
      }
    } catch (error) {
      return res.status(400).json({
        ok: false,
        error: 'Invalid URL format',
      });
    }

    // Verify lead exists
    const lead = await db.query.leads.findFirst({
      where: eq(leads.id, leadId),
    });

    if (!lead) {
      return res.status(404).json({ 
        ok: false, 
        error: 'Lead not found' 
      });
    }

    // Update lead with LinkedIn URL and mark as pending (awaiting QA review)
    // Note: verifiedAt and verifiedBy will be set by QA team when they approve the lead
    await db.update(leads)
      .set({ 
        linkedinUrl: linkedinUrl,
        verificationStatus: 'pending',
        updatedAt: new Date(),
      })
      .where(eq(leads.id, leadId));

    console.log('[LINKEDIN-URL] Saved LinkedIn URL for lead:', leadId);

    return res.json({
      ok: true,
      message: 'LinkedIn URL saved successfully',
      leadId,
    });

  } catch (error) {
    console.error('[LINKEDIN-URL] Error saving LinkedIn URL:', error);
    
    if (error instanceof z.ZodError) {
      return res.status(400).json({ 
        ok: false, 
        error: 'Invalid request', 
        details: error.errors 
      });
    }
    
    return res.status(500).json({ 
      ok: false, 
      error: 'Failed to save LinkedIn URL' 
    });
  }
});

/**
 * POST /api/linkedin-verification/create-lead
 * Create a new lead with LinkedIn URL (no verification, just save)
 */
router.post('/create-lead', requireAuth, async (req, res) => {
  try {
    const { linkedinUrl, campaignId, contactId } = z.object({
      linkedinUrl: z.string().url(),
      campaignId: z.string().uuid(),
      contactId: z.string().uuid().optional(),
    }).parse(req.body);

    // Validate LinkedIn URL - strict hostname checking
    try {
      const urlObj = new URL(linkedinUrl);
      const allowedHostnames = ['linkedin.com', 'www.linkedin.com', 'linkedin.cn', 'www.linkedin.cn'];
      if (!allowedHostnames.includes(urlObj.hostname.toLowerCase())) {
        return res.status(400).json({
          ok: false,
          error: 'Invalid LinkedIn URL - must be from linkedin.com or linkedin.cn',
        });
      }
    } catch (error) {
      return res.status(400).json({
        ok: false,
        error: 'Invalid URL format',
      });
    }

    const [contact] = contactId
      ? await db
          .select({
            accountId: contacts.accountId,
            accountName: accounts.name,
            accountIndustry: accounts.industryStandardized,
          })
          .from(contacts)
          .leftJoin(accounts, eq(contacts.accountId, accounts.id))
          .where(eq(contacts.id, contactId))
          .limit(1)
      : [];

    // Create new lead
    const [newLead] = await db.insert(leads)
      .values({
        campaignId,
        contactId: contactId || null,
        accountId: contact?.accountId || null,
        accountName: contact?.accountName || null,
        accountIndustry: contact?.accountIndustry || null,
        linkedinUrl,
        verificationStatus: 'pending',
        createdAt: new Date(),
        updatedAt: new Date(),
      })
      .returning();

    console.log('[LINKEDIN-CREATE] Created new lead with LinkedIn URL:', newLead.id);

    return res.json({
      ok: true,
      message: 'Lead created successfully',
      leadId: newLead.id,
      lead: newLead,
    });

  } catch (error) {
    console.error('[LINKEDIN-CREATE] Error creating lead:', error);
    
    if (error instanceof z.ZodError) {
      return res.status(400).json({ 
        ok: false, 
        error: 'Invalid request', 
        details: error.errors 
      });
    }
    
    return res.status(500).json({ 
      ok: false, 
      error: 'Failed to create lead' 
    });
  }
});

export default router;