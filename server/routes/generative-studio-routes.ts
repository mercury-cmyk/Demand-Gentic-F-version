/**
 * Generative Studio Routes
 *
 * API endpoints for AI-powered content generation:
 * Landing Pages, Email Templates, Blog Posts, eBooks, Solution Briefs, Chat
 */

import { Router, Request, Response } from "express";
import { db } from "../db";
import {
  generativeStudioProjects,
  generativeStudioChatMessages,
  generativeStudioPublishedPages,
  contentAssets,
} from "@shared/schema";
import { eq, and, desc, sql } from "drizzle-orm";
import { requireAuth } from "../auth";
import {
  generateLandingPage,
  generateEmailTemplate,
  generateBlogPost,
  generateEbook,
  generateSolutionBrief,
  chat as aiChat,
  refineContent,
} from "../services/ai-generative-studio";
import crypto from "crypto";

const router = Router();

// ============================================================================
// PROJECTS CRUD
// ============================================================================

/**
 * GET /projects
 * List all generative studio projects
 */
router.get("/projects", requireAuth, async (req: Request, res: Response) => {
  try {
    const { contentType, status, limit = '50', offset = '0' } = req.query;
    const userId = (req as any).user?.id;

    let query = db.select().from(generativeStudioProjects)
      .orderBy(desc(generativeStudioProjects.createdAt))
      .limit(parseInt(limit as string))
      .offset(parseInt(offset as string));

    const results = await query;

    // Filter in application layer for flexibility
    let filtered = results;
    if (contentType && typeof contentType === 'string') {
      filtered = filtered.filter(p => p.contentType === contentType);
    }
    if (status && typeof status === 'string') {
      filtered = filtered.filter(p => p.status === status);
    }

    res.json({ projects: filtered, total: filtered.length });
  } catch (error: any) {
    console.error('Error listing projects:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /projects/:id
 * Get single project
 */
router.get("/projects/:id", requireAuth, async (req: Request, res: Response) => {
  try {
    const [project] = await db.select().from(generativeStudioProjects)
      .where(eq(generativeStudioProjects.id, req.params.id)).limit(1);

    if (!project) {
      return res.status(404).json({ error: 'Project not found' });
    }

    res.json(project);
  } catch (error: any) {
    console.error('Error getting project:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * PATCH /projects/:id
 * Update project
 */
router.patch("/projects/:id", requireAuth, async (req: Request, res: Response) => {
  try {
    const { title, generatedContent, generatedContentHtml, status, metadata } = req.body;

    const updates: any = { updatedAt: new Date() };
    if (title) updates.title = title;
    if (generatedContent) updates.generatedContent = generatedContent;
    if (generatedContentHtml) updates.generatedContentHtml = generatedContentHtml;
    if (status) updates.status = status;
    if (metadata) updates.metadata = metadata;

    const [updated] = await db.update(generativeStudioProjects)
      .set(updates)
      .where(eq(generativeStudioProjects.id, req.params.id))
      .returning();

    if (!updated) {
      return res.status(404).json({ error: 'Project not found' });
    }

    res.json(updated);
  } catch (error: any) {
    console.error('Error updating project:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * DELETE /projects/:id
 * Delete project
 */
router.delete("/projects/:id", requireAuth, async (req: Request, res: Response) => {
  try {
    await db.delete(generativeStudioProjects)
      .where(eq(generativeStudioProjects.id, req.params.id));
    res.json({ success: true });
  } catch (error: any) {
    console.error('Error deleting project:', error);
    res.status(500).json({ error: error.message });
  }
});

// ============================================================================
// AI GENERATION ENDPOINTS
// ============================================================================

/**
 * POST /generate/landing-page
 */
router.post("/generate/landing-page", requireAuth, async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user?.id || 'system';
    const result = await generateLandingPage({
      ...req.body,
      ownerId: userId,
    });
    res.json(result);
  } catch (error: any) {
    console.error('Error generating landing page:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /generate/email-template
 */
router.post("/generate/email-template", requireAuth, async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user?.id || 'system';
    const result = await generateEmailTemplate({
      ...req.body,
      ownerId: userId,
    });
    res.json(result);
  } catch (error: any) {
    console.error('Error generating email template:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /generate/blog-post
 */
router.post("/generate/blog-post", requireAuth, async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user?.id || 'system';
    const result = await generateBlogPost({
      ...req.body,
      ownerId: userId,
    });
    res.json(result);
  } catch (error: any) {
    console.error('Error generating blog post:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /generate/ebook
 */
router.post("/generate/ebook", requireAuth, async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user?.id || 'system';
    const result = await generateEbook({
      ...req.body,
      ownerId: userId,
    });
    res.json(result);
  } catch (error: any) {
    console.error('Error generating ebook:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /generate/solution-brief
 */
router.post("/generate/solution-brief", requireAuth, async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user?.id || 'system';
    const result = await generateSolutionBrief({
      ...req.body,
      ownerId: userId,
    });
    res.json(result);
  } catch (error: any) {
    console.error('Error generating solution brief:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /refine/:id
 * Refine existing generated content
 */
router.post("/refine/:id", requireAuth, async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user?.id || 'system';
    const { instructions } = req.body;

    if (!instructions) {
      return res.status(400).json({ error: 'Refinement instructions are required' });
    }

    const result = await refineContent(req.params.id, instructions, userId);
    res.json(result);
  } catch (error: any) {
    console.error('Error refining content:', error);
    res.status(500).json({ error: error.message });
  }
});

// ============================================================================
// CHAT ENDPOINTS
// ============================================================================

/**
 * POST /chat
 * Send a chat message
 */
router.post("/chat", requireAuth, async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user?.id || 'system';
    const { sessionId, message, projectId } = req.body;

    if (!message) {
      return res.status(400).json({ error: 'Message is required' });
    }

    const result = await aiChat({
      sessionId,
      message,
      projectId,
      ownerId: userId,
    });

    res.json(result);
  } catch (error: any) {
    console.error('Error in chat:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /chat/sessions
 * List chat sessions
 */
router.get("/chat/sessions", requireAuth, async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user?.id;

    // Get distinct sessions with their latest message
    const sessions = await db
      .selectDistinctOn([generativeStudioChatMessages.sessionId], {
        sessionId: generativeStudioChatMessages.sessionId,
        lastMessage: generativeStudioChatMessages.content,
        lastRole: generativeStudioChatMessages.role,
        createdAt: generativeStudioChatMessages.createdAt,
      })
      .from(generativeStudioChatMessages)
      .orderBy(
        generativeStudioChatMessages.sessionId,
        desc(generativeStudioChatMessages.createdAt)
      );

    res.json({ sessions });
  } catch (error: any) {
    console.error('Error listing chat sessions:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /chat/sessions/:sessionId
 * Get chat history for a session
 */
router.get("/chat/sessions/:sessionId", requireAuth, async (req: Request, res: Response) => {
  try {
    const messages = await db.select().from(generativeStudioChatMessages)
      .where(eq(generativeStudioChatMessages.sessionId, req.params.sessionId))
      .orderBy(generativeStudioChatMessages.createdAt);

    res.json({ messages });
  } catch (error: any) {
    console.error('Error getting chat session:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * DELETE /chat/sessions/:sessionId
 * Delete a chat session
 */
router.delete("/chat/sessions/:sessionId", requireAuth, async (req: Request, res: Response) => {
  try {
    await db.delete(generativeStudioChatMessages)
      .where(eq(generativeStudioChatMessages.sessionId, req.params.sessionId));
    res.json({ success: true });
  } catch (error: any) {
    console.error('Error deleting chat session:', error);
    res.status(500).json({ error: error.message });
  }
});

// ============================================================================
// PUBLISHING ENDPOINTS
// ============================================================================

/**
 * POST /publish/:id
 * Publish a project (create a public page)
 */
router.post("/publish/:id", requireAuth, async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user?.id || 'system';
    const { slug, metaTitle, metaDescription } = req.body;

    const [project] = await db.select().from(generativeStudioProjects)
      .where(eq(generativeStudioProjects.id, req.params.id)).limit(1);

    if (!project) {
      return res.status(404).json({ error: 'Project not found' });
    }

    // Generate slug if not provided
    const pageSlug = slug || project.title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
      + '-' + Date.now().toString(36);

    const metadata = project.metadata as any || {};

    // Check if already published
    const [existing] = await db.select().from(generativeStudioPublishedPages)
      .where(eq(generativeStudioPublishedPages.projectId, project.id)).limit(1);

    if (existing) {
      // Update existing published page
      const [updated] = await db.update(generativeStudioPublishedPages)
        .set({
          title: project.title,
          htmlContent: project.generatedContentHtml || project.generatedContent || '',
          metaTitle: metaTitle || metadata.metaTitle || metadata.seoTitle || project.title,
          metaDescription: metaDescription || metadata.metaDescription || metadata.seoDescription || '',
          isPublished: true,
          publishedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(generativeStudioPublishedPages.id, existing.id))
        .returning();

      // Update project status
      await db.update(generativeStudioProjects)
        .set({ status: 'published', updatedAt: new Date() })
        .where(eq(generativeStudioProjects.id, project.id));

      return res.json({ publishedPage: updated, url: `/api/generative-studio/public/${updated.slug}` });
    }

    // Create new published page
    const [published] = await db.insert(generativeStudioPublishedPages).values({
      projectId: project.id,
      contentType: project.contentType,
      title: project.title,
      slug: pageSlug,
      htmlContent: project.generatedContentHtml || project.generatedContent || '',
      metaTitle: metaTitle || metadata.metaTitle || metadata.seoTitle || project.title,
      metaDescription: metaDescription || metadata.metaDescription || metadata.seoDescription || '',
      isPublished: true,
      publishedAt: new Date(),
      ownerId: userId,
    }).returning();

    // Update project status
    await db.update(generativeStudioProjects)
      .set({ status: 'published', updatedAt: new Date() })
      .where(eq(generativeStudioProjects.id, project.id));

    res.json({ publishedPage: published, url: `/api/generative-studio/public/${pageSlug}` });
  } catch (error: any) {
    console.error('Error publishing:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /unpublish/:id
 * Unpublish a project
 */
router.post("/unpublish/:id", requireAuth, async (req: Request, res: Response) => {
  try {
    const [updated] = await db.update(generativeStudioPublishedPages)
      .set({ isPublished: false, unpublishedAt: new Date(), updatedAt: new Date() })
      .where(eq(generativeStudioPublishedPages.projectId, req.params.id))
      .returning();

    if (updated) {
      await db.update(generativeStudioProjects)
        .set({ status: 'generated', updatedAt: new Date() })
        .where(eq(generativeStudioProjects.id, req.params.id));
    }

    res.json({ success: true });
  } catch (error: any) {
    console.error('Error unpublishing:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /save-as-asset/:id
 * Save project to content assets library
 */
router.post("/save-as-asset/:id", requireAuth, async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user?.id || 'system';

    const [project] = await db.select().from(generativeStudioProjects)
      .where(eq(generativeStudioProjects.id, req.params.id)).limit(1);

    if (!project) {
      return res.status(404).json({ error: 'Project not found' });
    }

    const metadata = project.metadata as any || {};

    const [asset] = await db.insert(contentAssets).values({
      assetType: project.contentType,
      title: project.title,
      description: project.prompt,
      content: project.generatedContent,
      contentHtml: project.generatedContentHtml,
      approvalStatus: 'draft',
      tone: project.tone,
      targetAudience: project.targetAudience,
      tags: metadata.tags || [],
      ownerId: userId,
    }).returning();

    // Link the asset to the project
    await db.update(generativeStudioProjects)
      .set({ contentAssetId: asset.id, updatedAt: new Date() })
      .where(eq(generativeStudioProjects.id, project.id));

    res.json({ asset });
  } catch (error: any) {
    console.error('Error saving as asset:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /public/:slug
 * Serve published page (NO AUTH - public endpoint)
 */
router.get("/public/:slug", async (req: Request, res: Response) => {
  try {
    const [page] = await db.select().from(generativeStudioPublishedPages)
      .where(
        and(
          eq(generativeStudioPublishedPages.slug, req.params.slug),
          eq(generativeStudioPublishedPages.isPublished, true)
        )
      ).limit(1);

    if (!page) {
      return res.status(404).send('<html><body><h1>Page Not Found</h1></body></html>');
    }

    // Increment view count
    await db.update(generativeStudioPublishedPages)
      .set({ viewCount: (page.viewCount || 0) + 1 })
      .where(eq(generativeStudioPublishedPages.id, page.id));

    // Serve as full HTML page
    const fullHtml = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${page.metaTitle || page.title}</title>
  <meta name="description" content="${page.metaDescription || ''}">
  ${page.ogImageUrl ? `<meta property="og:image" content="${page.ogImageUrl}">` : ''}
  <meta property="og:title" content="${page.metaTitle || page.title}">
  <meta property="og:description" content="${page.metaDescription || ''}">
  ${page.cssContent ? `<style>${page.cssContent}</style>` : ''}
</head>
<body>
${page.htmlContent}
</body>
</html>`;

    res.type('html').send(fullHtml);
  } catch (error: any) {
    console.error('Error serving public page:', error);
    res.status(500).send('<html><body><h1>Server Error</h1></body></html>');
  }
});

export default router;
