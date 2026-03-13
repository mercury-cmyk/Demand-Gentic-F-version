/**
 * Email Builder Routes
 *
 * API endpoints for the drag-and-drop email builder including:
 * - Template management (CRUD)
 * - Block management (CRUD, reorder)
 * - Image management (upload, AI generation, library)
 * - Brand kit management
 * - Email preview and rendering
 */

import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { db } from '../db';
import {
  emailBuilderTemplates,
  emailBuilderBlocks,
  emailBuilderImages,
  brandKits,
  aiImageGenerationJobs,
} from '../../shared/schema';
import { eq, desc, and, sql, asc } from 'drizzle-orm';
import { emailBlockRenderer } from '../services/email-block-renderer';
import {
  aiImageGenerator,
  getAvailableStyles,
  getAvailableAspectRatios,
  getPromptSuggestions,
} from '../services/ai-image-generator';
import { getPresignedUploadUrl, getPublicUrl, deleteFromS3, getFromS3, generateStorageKey } from '../lib/storage';
import { resolveScopedOrganizationId } from '../lib/client-organization-scope';
import { requireDualAuth } from '../auth';
import multer from 'multer';
import crypto from 'crypto';

const router = Router();

// Configure multer for file uploads
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB limit
  },
  fileFilter: (req, file, cb) => {
    const allowedMimes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
    if (allowedMimes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Invalid file type. Only JPEG, PNG, GIF, and WebP are allowed.'));
    }
  },
});

/**
 * GET /api/email-builder/images/serve/:id
 * Serve an image by proxying from GCS (permanent, no-expiry URL)
 * NOTE: This route is public so images can be loaded in emails/browsers
 */
router.get('/images/serve/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    console.log(`[ImageServe] Serving image: ${id}`);

    const [image] = await db
      .select()
      .from(emailBuilderImages)
      .where(eq(emailBuilderImages.id, id))
      .limit(1);

    if (!image) {
      console.warn(`[ImageServe] Image not found: ${id}`);
      return res.status(404).json({ error: 'Image not found' });
    }

    // If storedUrl is a GCS URL, extract the key and stream from GCS
    if (image.storedUrl && image.storedUrl.includes('storage.googleapis.com')) {
      // More robust key extraction that doesn't depend on strict environment variable matching
      let key = image.storedUrl;
      const gcsMatch = image.storedUrl.match(/https:\/\/storage\.googleapis\.com\/[^\/]+\/(.+)/);
      if (gcsMatch && gcsMatch[1]) {
        key = gcsMatch[1];
      } else {
        // Fallback to legacy replacement
        const { getGcsBucket } = await import('../lib/gcp-config');
        const bucketName = getGcsBucket();
        key = image.storedUrl.replace(`https://storage.googleapis.com/${bucketName}/`, '');
      }

      console.log(`[ImageServe] Streaming from GCS: url=${image.storedUrl}, key=${key}, mimeType=${image.mimeType}`);

      res.setHeader('Content-Type', image.mimeType || 'image/png');
      res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');

      try {
        const stream = await getFromS3(key);
        stream.on('error', (err: any) => {
          console.error(`[ImageServe] Stream error for key ${key}:`, err.message);
          if (!res.headersSent) {
            // If GCS returns 404, the stream emits an error with code 404 usually
            if (err.code === 404 || err.message?.includes('No such object')) {
              res.status(404).json({ error: 'Image not found in storage' });
            } else {
              res.status(500).json({ error: 'Storage stream error' });
            }
          }
        });
        stream.pipe(res);
      } catch (err: any) {
        console.error('[ImageServe] Failed to create stream:', err);
        if (!res.headersSent) {
          res.status(500).json({ error: 'Failed to access image storage' });
        }
      }
    } else if (image.storedUrl) {
      console.log(`[ImageServe] Redirecting to: ${image.storedUrl}`);
      res.redirect(image.storedUrl);
    } else {
      console.warn(`[ImageServe] No storedUrl for image: ${id}`);
      res.status(404).json({ error: 'Image file not found' });
    }
  } catch (error: any) {
    console.error('[ImageServe] Error serving image:', error.message || error);
    res.status(500).json({ error: 'Failed to serve image' });
  }
});

// Protect all subsequent routes with authentication
router.use(requireDualAuth);

// =============================================================================
// Email Builder Templates
// =============================================================================

/**
 * GET /api/email-builder/templates
 * List all email builder templates
 */
router.get('/templates', async (req: Request, res: Response) => {
  try {
    const category = req.query.category as string;
    const limit = parseInt(req.query.limit as string) || 50;
    const offset = parseInt(req.query.offset as string) || 0;

    let query = db.select().from(emailBuilderTemplates);

    if (category) {
      query = query.where(eq(emailBuilderTemplates.category, category)) as typeof query;
    }

    const templates = await query
      .orderBy(desc(emailBuilderTemplates.updatedAt))
      .limit(limit)
      .offset(offset);

    res.json({
      templates,
      pagination: { limit, offset, hasMore: templates.length === limit },
    });
  } catch (error: any) {
    console.error('Error fetching templates:', error);
    res.status(500).json({ error: 'Failed to fetch templates' });
  }
});

/**
 * GET /api/email-builder/templates/:id
 * Get a single template with its blocks
 */
router.get('/templates/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const [template] = await db
      .select()
      .from(emailBuilderTemplates)
      .where(eq(emailBuilderTemplates.id, id))
      .limit(1);

    if (!template) {
      return res.status(404).json({ error: 'Template not found' });
    }

    // Get blocks for this template
    const blocks = await db
      .select()
      .from(emailBuilderBlocks)
      .where(eq(emailBuilderBlocks.templateId, id))
      .orderBy(asc(emailBuilderBlocks.sortOrder));

    res.json({ template, blocks });
  } catch (error: any) {
    console.error('Error fetching template:', error);
    res.status(500).json({ error: 'Failed to fetch template' });
  }
});

/**
 * POST /api/email-builder/templates
 * Create a new template
 */
router.post('/templates', async (req: Request, res: Response) => {
  try {
    const schema = z.object({
      name: z.string().min(1).max(255),
      description: z.string().optional(),
      category: z.string().optional(),
      subject: z.string().optional(),
      previewText: z.string().optional(),
      brandKitId: z.string().optional(),
      createdBy: z.string().optional(),
    });

    const data = schema.parse(req.body);

    const [template] = await db
      .insert(emailBuilderTemplates)
      .values({
        ...data,
        status: 'draft',
      })
      .returning();

    res.status(201).json(template);
  } catch (error: any) {
    console.error('Error creating template:', error);
    if (error.name === 'ZodError') {
      return res.status(400).json({ error: 'Invalid data', details: error.errors });
    }
    res.status(500).json({ error: 'Failed to create template' });
  }
});

/**
 * PUT /api/email-builder/templates/:id
 * Update a template
 */
router.put('/templates/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const schema = z.object({
      name: z.string().min(1).max(255).optional(),
      description: z.string().optional(),
      category: z.string().optional(),
      subject: z.string().optional(),
      previewText: z.string().optional(),
      brandKitId: z.string().optional(),
      status: z.enum(['draft', 'published', 'archived']).optional(),
      thumbnailUrl: z.string().optional(),
    });

    const data = schema.parse(req.body);

    const [template] = await db
      .update(emailBuilderTemplates)
      .set({
        ...data,
        updatedAt: new Date(),
      })
      .where(eq(emailBuilderTemplates.id, id))
      .returning();

    if (!template) {
      return res.status(404).json({ error: 'Template not found' });
    }

    res.json(template);
  } catch (error: any) {
    console.error('Error updating template:', error);
    res.status(500).json({ error: 'Failed to update template' });
  }
});

/**
 * DELETE /api/email-builder/templates/:id
 * Delete a template and its blocks
 */
router.delete('/templates/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    // Delete blocks first (cascade should handle this, but explicit is safer)
    await db.delete(emailBuilderBlocks).where(eq(emailBuilderBlocks.templateId, id));

    // Delete template
    const [deleted] = await db
      .delete(emailBuilderTemplates)
      .where(eq(emailBuilderTemplates.id, id))
      .returning();

    if (!deleted) {
      return res.status(404).json({ error: 'Template not found' });
    }

    res.json({ success: true });
  } catch (error: any) {
    console.error('Error deleting template:', error);
    res.status(500).json({ error: 'Failed to delete template' });
  }
});

/**
 * POST /api/email-builder/templates/:id/duplicate
 * Duplicate a template with all its blocks
 */
router.post('/templates/:id/duplicate', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { name } = req.body;

    // Get original template
    const [original] = await db
      .select()
      .from(emailBuilderTemplates)
      .where(eq(emailBuilderTemplates.id, id))
      .limit(1);

    if (!original) {
      return res.status(404).json({ error: 'Template not found' });
    }

    // Create new template
    const [newTemplate] = await db
      .insert(emailBuilderTemplates)
      .values({
        name: name || `${original.name} (Copy)`,
        description: original.description,
        category: original.category,
        subject: original.subject,
        previewText: original.previewText,
        brandKitId: original.brandKitId,
        status: 'draft',
      })
      .returning();

    // Copy blocks
    const blocks = await db
      .select()
      .from(emailBuilderBlocks)
      .where(eq(emailBuilderBlocks.templateId, id))
      .orderBy(asc(emailBuilderBlocks.sortOrder));

    if (blocks.length > 0) {
      await db.insert(emailBuilderBlocks).values(
        blocks.map((block) => ({
          templateId: newTemplate.id,
          blockType: block.blockType,
          sortOrder: block.sortOrder,
          content: block.content,
          styles: block.styles,
          mobileStyles: block.mobileStyles,
          isVisible: block.isVisible,
          hideOnMobile: block.hideOnMobile,
          hideOnDesktop: block.hideOnDesktop,
          conditionalLogic: block.conditionalLogic,
        }))
      );
    }

    res.status(201).json(newTemplate);
  } catch (error: any) {
    console.error('Error duplicating template:', error);
    res.status(500).json({ error: 'Failed to duplicate template' });
  }
});

// =============================================================================
// Email Builder Blocks
// =============================================================================

/**
 * POST /api/email-builder/templates/:templateId/blocks
 * Add a block to a template
 */
router.post('/templates/:templateId/blocks', async (req: Request, res: Response) => {
  try {
    const { templateId } = req.params;

    const schema = z.object({
      blockType: z.enum([
        'text', 'heading', 'image', 'button', 'divider', 'spacer',
        'columns', 'hero', 'card', 'social', 'footer', 'header',
        'list', 'quote', 'video', 'countdown', 'product',
      ]),
      sortOrder: z.number().optional(),
      content: z.any(),
      styles: z.any().optional(),
      mobileStyles: z.any().optional(),
      isVisible: z.boolean().optional(),
      hideOnMobile: z.boolean().optional(),
      hideOnDesktop: z.boolean().optional(),
    });

    const data = schema.parse(req.body);

    // If no sortOrder provided, add to end
    if (data.sortOrder === undefined) {
      const maxOrder = await db
        .select({ max: sql<number>`COALESCE(MAX(sort_order), -1)` })
        .from(emailBuilderBlocks)
        .where(eq(emailBuilderBlocks.templateId, templateId));

      data.sortOrder = (maxOrder[0]?.max ?? -1) + 1;
    }

    const [block] = await db
      .insert(emailBuilderBlocks)
      .values({
        templateId,
        ...data,
      })
      .returning();

    // Update template timestamp
    await db
      .update(emailBuilderTemplates)
      .set({ updatedAt: new Date() })
      .where(eq(emailBuilderTemplates.id, templateId));

    res.status(201).json(block);
  } catch (error: any) {
    console.error('Error adding block:', error);
    if (error.name === 'ZodError') {
      return res.status(400).json({ error: 'Invalid data', details: error.errors });
    }
    res.status(500).json({ error: 'Failed to add block' });
  }
});

/**
 * PUT /api/email-builder/blocks/:id
 * Update a block
 */
router.put('/blocks/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const schema = z.object({
      content: z.any().optional(),
      styles: z.any().optional(),
      mobileStyles: z.any().optional(),
      isVisible: z.boolean().optional(),
      hideOnMobile: z.boolean().optional(),
      hideOnDesktop: z.boolean().optional(),
      conditionalLogic: z.any().optional(),
    });

    const data = schema.parse(req.body);

    const [block] = await db
      .update(emailBuilderBlocks)
      .set({
        ...data,
        updatedAt: new Date(),
      })
      .where(eq(emailBuilderBlocks.id, id))
      .returning();

    if (!block) {
      return res.status(404).json({ error: 'Block not found' });
    }

    // Update template timestamp
    await db
      .update(emailBuilderTemplates)
      .set({ updatedAt: new Date() })
      .where(eq(emailBuilderTemplates.id, block.templateId));

    res.json(block);
  } catch (error: any) {
    console.error('Error updating block:', error);
    res.status(500).json({ error: 'Failed to update block' });
  }
});

/**
 * DELETE /api/email-builder/blocks/:id
 * Delete a block
 */
router.delete('/blocks/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const [deleted] = await db
      .delete(emailBuilderBlocks)
      .where(eq(emailBuilderBlocks.id, id))
      .returning();

    if (!deleted) {
      return res.status(404).json({ error: 'Block not found' });
    }

    // Update template timestamp
    await db
      .update(emailBuilderTemplates)
      .set({ updatedAt: new Date() })
      .where(eq(emailBuilderTemplates.id, deleted.templateId));

    res.json({ success: true });
  } catch (error: any) {
    console.error('Error deleting block:', error);
    res.status(500).json({ error: 'Failed to delete block' });
  }
});

/**
 * POST /api/email-builder/blocks/reorder
 * Reorder blocks within a template
 */
router.post('/blocks/reorder', async (req: Request, res: Response) => {
  try {
    const schema = z.object({
      templateId: z.string(),
      blockOrders: z.array(z.object({
        blockId: z.string(),
        sortOrder: z.number(),
      })),
    });

    const { templateId, blockOrders } = schema.parse(req.body);

    // Update each block's sort order
    for (const { blockId, sortOrder } of blockOrders) {
      await db
        .update(emailBuilderBlocks)
        .set({ sortOrder, updatedAt: new Date() })
        .where(and(
          eq(emailBuilderBlocks.id, blockId),
          eq(emailBuilderBlocks.templateId, templateId)
        ));
    }

    // Update template timestamp
    await db
      .update(emailBuilderTemplates)
      .set({ updatedAt: new Date() })
      .where(eq(emailBuilderTemplates.id, templateId));

    res.json({ success: true });
  } catch (error: any) {
    console.error('Error reordering blocks:', error);
    res.status(500).json({ error: 'Failed to reorder blocks' });
  }
});

// =============================================================================
// Email Rendering & Preview
// =============================================================================

/**
 * POST /api/email-builder/render
 * Render blocks to email-safe HTML
 */
router.post('/render', async (req: Request, res: Response) => {
  try {
    const schema = z.object({
      blocks: z.array(z.any()),
      brandKit: z.any().optional(),
      previewText: z.string().optional(),
    });

    const { blocks, brandKit, previewText } = schema.parse(req.body);

    const html = emailBlockRenderer.renderEmail(blocks, brandKit, previewText);

    res.json({ html });
  } catch (error: any) {
    console.error('Error rendering email:', error);
    res.status(500).json({ error: 'Failed to render email' });
  }
});

/**
 * POST /api/email-builder/templates/:id/render
 * Render a template to HTML
 */
router.post('/templates/:id/render', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    // Get template
    const [template] = await db
      .select()
      .from(emailBuilderTemplates)
      .where(eq(emailBuilderTemplates.id, id))
      .limit(1);

    if (!template) {
      return res.status(404).json({ error: 'Template not found' });
    }

    // Get blocks
    const blocks = await db
      .select()
      .from(emailBuilderBlocks)
      .where(eq(emailBuilderBlocks.templateId, id))
      .orderBy(asc(emailBuilderBlocks.sortOrder));

    // Get brand kit if specified
    let brandKit = null;
    if (template.brandKitId) {
      const [kit] = await db
        .select()
        .from(brandKits)
        .where(eq(brandKits.id, template.brandKitId))
        .limit(1);
      brandKit = kit;
    }

    // Render
    const html = emailBlockRenderer.renderEmail(
      blocks.map(b => ({
        type: b.blockType,
        content: b.content,
        styles: b.styles,
        isVisible: b.isVisible,
        hideOnMobile: b.hideOnMobile,
        hideOnDesktop: b.hideOnDesktop,
      })),
      brandKit ? {
        primaryColor: brandKit.primaryColor,
        secondaryColor: brandKit.secondaryColor,
        accentColor: brandKit.accentColor,
        backgroundColor: brandKit.backgroundColor,
        textColor: brandKit.textColor,
        linkColor: brandKit.linkColor,
        headingFont: brandKit.headingFont,
        bodyFont: brandKit.bodyFont,
      } : undefined,
      template.previewText || undefined
    );

    res.json({
      html,
      subject: template.subject,
      previewText: template.previewText,
    });
  } catch (error: any) {
    console.error('Error rendering template:', error);
    res.status(500).json({ error: 'Failed to render template' });
  }
});

/**
 * GET /api/email-builder/templates/:id/preview
 * Get a standalone HTML preview page
 */
router.get('/templates/:id/preview', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    // Get template
    const [template] = await db
      .select()
      .from(emailBuilderTemplates)
      .where(eq(emailBuilderTemplates.id, id))
      .limit(1);

    if (!template) {
      return res.status(404).json({ error: 'Template not found' });
    }

    // Get blocks
    const blocks = await db
      .select()
      .from(emailBuilderBlocks)
      .where(eq(emailBuilderBlocks.templateId, id))
      .orderBy(asc(emailBuilderBlocks.sortOrder));

    // Get brand kit if specified
    let brandKit = null;
    if (template.brandKitId) {
      const [kit] = await db
        .select()
        .from(brandKits)
        .where(eq(brandKits.id, template.brandKitId))
        .limit(1);
      brandKit = kit;
    }

    // Render
    const html = emailBlockRenderer.renderEmail(
      blocks.map(b => ({
        type: b.blockType,
        content: b.content,
        styles: b.styles,
        isVisible: b.isVisible,
        hideOnMobile: b.hideOnMobile,
        hideOnDesktop: b.hideOnDesktop,
      })),
      brandKit ? {
        primaryColor: brandKit.primaryColor,
        secondaryColor: brandKit.secondaryColor,
        accentColor: brandKit.accentColor,
        backgroundColor: brandKit.backgroundColor,
        textColor: brandKit.textColor,
        linkColor: brandKit.linkColor,
        headingFont: brandKit.headingFont,
        bodyFont: brandKit.bodyFont,
      } : undefined,
      template.previewText || undefined
    );

    res.setHeader('Content-Type', 'text/html');
    res.send(html);
  } catch (error: any) {
    console.error('Error previewing template:', error);
    res.status(500).json({ error: 'Failed to preview template' });
  }
});

// =============================================================================
// Image Management
// =============================================================================

/**
 * GET /api/email-builder/images
 * List images in the library
 */
router.get('/images', async (req: Request, res: Response) => {
  try {
    const source = req.query.source as string;
    const limit = parseInt(req.query.limit as string) || 50;
    const offset = parseInt(req.query.offset as string) || 0;

    let query = db.select().from(emailBuilderImages);

    if (source) {
      query = query.where(eq(emailBuilderImages.source, source as any)) as typeof query;
    }

    const images = await query
      .orderBy(desc(emailBuilderImages.createdAt))
      .limit(limit)
      .offset(offset);

    res.json({
      images,
      pagination: { limit, offset, hasMore: images.length === limit },
    });
  } catch (error: any) {
    console.error('Error fetching images:', error);
    res.status(500).json({ error: 'Failed to fetch images' });
  }
});

/**
 * POST /api/email-builder/images/upload
 * Upload an image
 */
router.post('/images/upload', upload.single('image'), async (req: Request, res: Response) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No image file provided' });
    }

    const { altText, tags, folderId } = req.body;

    const fileName = `${Date.now()}-${req.file.originalname}`;
    const storageKey = generateStorageKey('email-images', fileName);

    // Upload to cloud storage
    const { uploadToS3 } = await import('../lib/storage');
    await uploadToS3(storageKey, req.file.buffer, req.file.mimetype);
    const storedUrl = await getPublicUrl(storageKey);

    // Create database record
    const [image] = await db
      .insert(emailBuilderImages)
      .values({
        source: 'upload',
        storedUrl,
        thumbnailUrl: storedUrl, // TODO: Generate actual thumbnail
        fileName: req.file.originalname,
        mimeType: req.file.mimetype,
        sizeBytes: req.file.size,
        altText,
        tags: tags ? JSON.parse(tags) : undefined,
        folderId,
      })
      .returning();

    res.status(201).json(image);
  } catch (error: any) {
    console.error('Error uploading image:', error);
    res.status(500).json({ error: 'Failed to upload image' });
  }
});

/**
 * POST /api/email-builder/images/upload-url
 * Get a presigned URL for direct browser upload
 */
router.post('/images/upload-url', async (req: Request, res: Response) => {
  try {
    const schema = z.object({
      fileName: z.string(),
      contentType: z.string(),
    });

    const { fileName, contentType } = schema.parse(req.body);

    const storageKey = generateStorageKey('email-images', fileName);
    const uploadUrl = await getPresignedUploadUrl(storageKey, contentType);
    const publicUrl = await getPublicUrl(storageKey);

    res.json({
      uploadUrl,
      storageKey,
      publicUrl,
    });
  } catch (error: any) {
    console.error('Error generating upload URL:', error);
    res.status(500).json({ error: 'Failed to generate upload URL' });
  }
});

/**
 * POST /api/email-builder/images/generate
 * Generate an image using AI
 */
router.post('/images/generate', async (req: Request, res: Response) => {
  try {
    const schema = z.object({
      prompt: z.string().min(10).max(1000),
      negativePrompt: z.string().optional(),
      style: z.enum([
        'photorealistic', 'illustration', 'abstract', 'minimalist',
        'corporate', 'tech', 'lifestyle', 'product', '3d_render',
        'watercolor', 'flat_design', 'isometric',
      ]).optional(),
      aspectRatio: z.enum(['1:1', '16:9', '4:3', '3:4', '9:16', '3:2', '2:3']).optional(),
      numberOfImages: z.number().min(1).max(4).optional(),
      organizationId: z.string().optional(),
      clientProjectId: z.string().optional(),
    });

    const data = schema.parse(req.body);
    const user = (req as any).user as any;
    const organizationId = await resolveScopedOrganizationId({
      tenantId: user?.tenantId,
      requestedOrganizationId: data.organizationId,
      requireOrganization: !!user?.tenantId,
    });

    const result = await aiImageGenerator.generateImages({
      ...data,
      organizationId,
      requestedBy: user?.id,
    });

    res.json(result);
  } catch (error: any) {
    console.error('Error generating image:', error);
    if (error.name === 'ZodError') {
      return res.status(400).json({ error: 'Invalid data', details: error.errors });
    }
    const statusCode =
      typeof error?.statusCode === 'number' && error.statusCode >= 400 && error.statusCode <= 599
        ? error.statusCode
        : 500;
    res.status(statusCode).json({ error: 'Failed to generate image', message: error.message });
  }
});

/**
 * GET /api/email-builder/images/generate/:jobId
 * Get status of an image generation job
 */
router.get('/images/generate/:jobId', async (req: Request, res: Response) => {
  try {
    const { jobId } = req.params;
    const user = (req as any).user as any;

    const result = await aiImageGenerator.getJobStatus(jobId);

    if (!result) {
      return res.status(404).json({ error: 'Job not found' });
    }

    if (user?.id && result.requestedBy && result.requestedBy !== user.id) {
      return res.status(403).json({ error: 'Access denied' });
    }

    res.json(result);
  } catch (error: any) {
    console.error('Error fetching job status:', error);
    res.status(500).json({ error: 'Failed to fetch job status' });
  }
});

/**
 * GET /api/email-builder/images/styles
 * Get available AI image styles
 */
router.get('/images/styles', (req: Request, res: Response) => {
  res.json({
    styles: getAvailableStyles(),
    aspectRatios: getAvailableAspectRatios(),
  });
});

/**
 * GET /api/email-builder/images/suggestions
 * Get prompt suggestions for a category
 */
router.get('/images/suggestions', (req: Request, res: Response) => {
  const category = (req.query.category as string) || 'abstract';
  const suggestions = getPromptSuggestions(category);
  res.json({ category, suggestions });
});

/**
 * DELETE /api/email-builder/images/:id
 * Delete an image
 */
router.delete('/images/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    // Get image to find storage key
    const [image] = await db
      .select()
      .from(emailBuilderImages)
      .where(eq(emailBuilderImages.id, id))
      .limit(1);

    if (!image) {
      return res.status(404).json({ error: 'Image not found' });
    }

    // Delete from storage if it's our hosted image
    if (image.storedUrl && image.storedUrl.includes('storage.googleapis.com')) {
      try {
        // Extract key from URL
        const urlParts = image.storedUrl.split('/');
        const key = urlParts.slice(-2).join('/');
        await deleteFromS3(key);
      } catch (e) {
        console.warn('Failed to delete image from storage:', e);
      }
    }

    // Delete from database
    await db.delete(emailBuilderImages).where(eq(emailBuilderImages.id, id));

    res.json({ success: true });
  } catch (error: any) {
    console.error('Error deleting image:', error);
    res.status(500).json({ error: 'Failed to delete image' });
  }
});


// =============================================================================
// Brand Kit Management
// =============================================================================

/**
 * GET /api/email-builder/brand-kits
 * List all brand kits
 */
router.get('/brand-kits', async (req: Request, res: Response) => {
  try {
    const kits = await db
      .select()
      .from(brandKits)
      .orderBy(desc(brandKits.updatedAt));

    res.json(kits);
  } catch (error: any) {
    console.error('Error fetching brand kits:', error);
    res.status(500).json({ error: 'Failed to fetch brand kits' });
  }
});

/**
 * GET /api/email-builder/brand-kits/:id
 * Get a single brand kit
 */
router.get('/brand-kits/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const [kit] = await db
      .select()
      .from(brandKits)
      .where(eq(brandKits.id, id))
      .limit(1);

    if (!kit) {
      return res.status(404).json({ error: 'Brand kit not found' });
    }

    res.json(kit);
  } catch (error: any) {
    console.error('Error fetching brand kit:', error);
    res.status(500).json({ error: 'Failed to fetch brand kit' });
  }
});

/**
 * POST /api/email-builder/brand-kits
 * Create a new brand kit
 */
router.post('/brand-kits', async (req: Request, res: Response) => {
  try {
    const schema = z.object({
      name: z.string().min(1).max(255),
      // Colors
      primaryColor: z.string().optional(),
      secondaryColor: z.string().optional(),
      accentColor: z.string().optional(),
      backgroundColor: z.string().optional(),
      textColor: z.string().optional(),
      linkColor: z.string().optional(),
      // Typography
      headingFont: z.string().optional(),
      bodyFont: z.string().optional(),
      headingFontSize: z.string().optional(),
      bodyFontSize: z.string().optional(),
      lineHeight: z.string().optional(),
      // Branding
      logoImageId: z.string().optional(),
      logoWidth: z.number().optional(),
      logoAlignment: z.enum(['left', 'center', 'right']).optional(),
      // Social
      socialLinks: z.any().optional(),
      // Footer
      companyName: z.string().optional(),
      companyAddress: z.string().optional(),
      footerLinks: z.any().optional(),
      // Status
      isDefault: z.boolean().optional(),
    });

    const data = schema.parse(req.body);

    // If this is set as default, unset other defaults
    if (data.isDefault) {
      await db.update(brandKits).set({ isDefault: false });
    }

    const [kit] = await db.insert(brandKits).values(data).returning();

    res.status(201).json(kit);
  } catch (error: any) {
    console.error('Error creating brand kit:', error);
    if (error.name === 'ZodError') {
      return res.status(400).json({ error: 'Invalid data', details: error.errors });
    }
    res.status(500).json({ error: 'Failed to create brand kit' });
  }
});

/**
 * PUT /api/email-builder/brand-kits/:id
 * Update a brand kit
 */
router.put('/brand-kits/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const schema = z.object({
      name: z.string().min(1).max(255).optional(),
      primaryColor: z.string().optional(),
      secondaryColor: z.string().optional(),
      accentColor: z.string().optional(),
      backgroundColor: z.string().optional(),
      textColor: z.string().optional(),
      linkColor: z.string().optional(),
      headingFont: z.string().optional(),
      bodyFont: z.string().optional(),
      headingFontSize: z.string().optional(),
      bodyFontSize: z.string().optional(),
      lineHeight: z.string().optional(),
      logoImageId: z.string().optional(),
      logoWidth: z.number().optional(),
      logoAlignment: z.enum(['left', 'center', 'right']).optional(),
      socialLinks: z.any().optional(),
      companyName: z.string().optional(),
      companyAddress: z.string().optional(),
      footerLinks: z.any().optional(),
      isDefault: z.boolean().optional(),
    });

    const data = schema.parse(req.body);

    // If this is set as default, unset other defaults
    if (data.isDefault) {
      await db.update(brandKits).set({ isDefault: false });
    }

    const [kit] = await db
      .update(brandKits)
      .set({
        ...data,
        updatedAt: new Date(),
      })
      .where(eq(brandKits.id, id))
      .returning();

    if (!kit) {
      return res.status(404).json({ error: 'Brand kit not found' });
    }

    res.json(kit);
  } catch (error: any) {
    console.error('Error updating brand kit:', error);
    res.status(500).json({ error: 'Failed to update brand kit' });
  }
});

/**
 * DELETE /api/email-builder/brand-kits/:id
 * Delete a brand kit
 */
router.delete('/brand-kits/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const [deleted] = await db
      .delete(brandKits)
      .where(eq(brandKits.id, id))
      .returning();

    if (!deleted) {
      return res.status(404).json({ error: 'Brand kit not found' });
    }

    res.json({ success: true });
  } catch (error: any) {
    console.error('Error deleting brand kit:', error);
    res.status(500).json({ error: 'Failed to delete brand kit' });
  }
});

/**
 * GET /api/email-builder/brand-kits/default
 * Get the default brand kit
 */
router.get('/brand-kits/default', async (req: Request, res: Response) => {
  try {
    const [kit] = await db
      .select()
      .from(brandKits)
      .where(eq(brandKits.isDefault, true))
      .limit(1);

    if (!kit) {
      // Return first kit if no default set
      const [firstKit] = await db.select().from(brandKits).limit(1);
      if (firstKit) {
        return res.json(firstKit);
      }
      return res.status(404).json({ error: 'No brand kit found' });
    }

    res.json(kit);
  } catch (error: any) {
    console.error('Error fetching default brand kit:', error);
    res.status(500).json({ error: 'Failed to fetch default brand kit' });
  }
});

export default router;
