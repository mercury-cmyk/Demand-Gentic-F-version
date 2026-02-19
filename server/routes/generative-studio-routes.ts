/**
 * Generative Studio Routes
 *
 * API endpoints for AI-powered content generation:
 * Landing Pages, Email Templates, Blog Posts, eBooks, Solution Briefs, Chat
 */

import { Router, Request, Response, NextFunction } from "express";
import { db } from "../db";
import {
  generativeStudioProjects,
  generativeStudioChatMessages,
  generativeStudioPublishedPages,
  contentAssets,
  clientProjects,
} from "@shared/schema";
import { eq, and, desc, sql } from "drizzle-orm";
import { requireAuth, verifyToken } from "../auth";
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
import jwt from 'jsonwebtoken';

const router = Router();
const JWT_SECRET = process.env.JWT_SECRET || "development-secret-key-change-in-production";

function sendGenerativeStudioError(res: Response, error: any, context: string) {
  const requestId = crypto.randomUUID();
  const candidateStatus =
    error?.statusCode ?? error?.status ?? error?.httpStatus;
  const statusCode =
    typeof candidateStatus === "number" && candidateStatus >= 400 && candidateStatus <= 599
      ? candidateStatus
      : 500;

  console.error(`[GenerativeStudio] ${context} requestId=${requestId}`, error);

  res.status(statusCode).json({
    error: error?.message || "Internal Server Error",
    code: error?.code,
    requestId,
  });
}

function getAuthedUserContext(req: Request): { userId: string; tenantId?: string } {
  const user = (req as any).user as any;
  return {
    userId: user?.id || user?.userId || user?.clientUserId || "system",
    tenantId: user?.tenantId,
  };
}

/**
 * Dual auth middleware - accepts both main app tokens and client portal tokens.
 * Sets req.user for main app users, or synthesizes a compatible req.user for client portal users.
 */
function requireDualAuth(req: Request, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ message: "Authentication required" });
  }

  const token = authHeader.substring(7);
  if (!token || token === 'null' || token === 'undefined') {
    return res.status(401).json({ message: "Invalid token" });
  }

  // Try main app auth first
  const mainPayload = verifyToken(token);
  if (mainPayload) {
    req.user = mainPayload;
    return next();
  }

  // Try client portal auth
  try {
    const clientPayload = jwt.verify(token, JWT_SECRET) as any;
    if (clientPayload.isClient) {
      // Synthesize a compatible req.user for generative studio endpoints
      req.user = {
        id: clientPayload.clientUserId, // careful: mapping clientUserId to id
        username: clientPayload.email,
        role: 'client',
        email: clientPayload.email,
        tenantId: clientPayload.clientAccountId, // Important for scoping
      } as any;
      
      // Also set clientUser for explicit checks if needed
      (req as any).clientUser = clientPayload;
      return next();
    }
  } catch {
    // Token didn't verify as client token either
  }

  return res.status(401).json({ message: "Invalid or expired token" });
}

function getProjectMetadataValue(project: any, key: string): string | undefined {
  const metadata = (project?.metadata || {}) as any;
  const value = metadata[key];
  return typeof value === 'string' ? value : undefined;
}

function isProjectWithinScope(
  project: any,
  organizationId?: string,
  clientProjectId?: string
): boolean {
  if (organizationId && getProjectMetadataValue(project, 'organizationId') !== organizationId) return false;
  if (clientProjectId && getProjectMetadataValue(project, 'clientProjectId') !== clientProjectId) return false;
  return true;
}

function buildProjectScopeFilters(
  organizationId?: string,
  clientProjectId?: string
): any[] {
  const filters: any[] = [];
  if (organizationId) {
    filters.push(sql`${generativeStudioProjects.metadata} ->> 'organizationId' = ${organizationId}`);
  }
  if (clientProjectId) {
    filters.push(sql`${generativeStudioProjects.metadata} ->> 'clientProjectId' = ${clientProjectId}`);
  }
  return filters;
}

function normalizeOptionalId(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

// ============================================================================
// PROJECTS CRUD
// ============================================================================

/**
 * GET /org-projects
 * List client projects for an organization
 */
router.get("/org-projects", requireDualAuth, async (req: Request, res: Response) => {
  try {
    const user = (req as any).user;
    const tenantId = user.tenantId;
    const organizationId = normalizeOptionalId(req.query.organizationId);

    if (!tenantId && !organizationId) {
      return res.json({ projects: [] });
    }

    const conditions: any[] = [];
    if (tenantId) {
      conditions.push(eq(clientProjects.clientAccountId, tenantId));
    }
    if (organizationId) {
      conditions.push(eq(clientProjects.campaignOrganizationId, organizationId));
    }

    const projects = await db
      .select({
        id: clientProjects.id,
        name: clientProjects.name,
        status: clientProjects.status,
      })
      .from(clientProjects)
      .where(and(...conditions))
      .orderBy(desc(clientProjects.createdAt));

    res.json({ projects });
  } catch (error: any) {
    return sendGenerativeStudioError(res, error, "list org projects");
  }
});

/**
 * GET /projects
 * List all generative studio projects
 */
router.get("/projects", requireDualAuth, async (req: Request, res: Response) => {
  try {
    const { contentType, status, limit = '50', offset = '0' } = req.query;
    const { userId, tenantId } = getAuthedUserContext(req);
    const organizationId = normalizeOptionalId(req.query.organizationId);
    const clientProjectId = normalizeOptionalId(req.query.clientProjectId);

    let conditions = [];
    
    // Strict scoping: If tenantId exists (Client), scope by tenantId. 
    // Otherwise scope by ownerId (internal user)
    if (tenantId) {
       conditions.push(eq(generativeStudioProjects.tenantId, tenantId));
    } else {
       conditions.push(eq(generativeStudioProjects.ownerId, userId));
    }

    if (!tenantId && !organizationId) {
      return res.json({ projects: [], total: 0 });
    }

    conditions.push(...buildProjectScopeFilters(organizationId, clientProjectId));

    let query = db.select().from(generativeStudioProjects)
      .where(and(...conditions))
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
    return sendGenerativeStudioError(res, error, "list projects");
  }
});

/**
 * GET /projects/:id
 * Get single project
 */
router.get("/projects/:id", requireDualAuth, async (req: Request, res: Response) => {
  try {
    const user = (req as any).user;
    const tenantId = user.tenantId;
    const organizationId = normalizeOptionalId(req.query.organizationId);
    const clientProjectId = normalizeOptionalId(req.query.clientProjectId);

    const [project] = await db.select().from(generativeStudioProjects)
      .where(eq(generativeStudioProjects.id, req.params.id)).limit(1);

    if (!project) {
      return res.status(404).json({ error: 'Project not found' });
    }

    // Security check
    if (tenantId && project.tenantId !== tenantId) {
      return res.status(403).json({ error: 'Access denied' });
    }

    if (!isProjectWithinScope(project, organizationId, clientProjectId)) {
      return res.status(403).json({ error: 'Access denied' });
    }

    res.json(project);
  } catch (error: any) {
    return sendGenerativeStudioError(res, error, "get project");
  }
});

/**
 * PATCH /projects/:id
 * Update project
 */
router.patch("/projects/:id", requireDualAuth, async (req: Request, res: Response) => {
  try {
    const { title, generatedContent, generatedContentHtml, status, metadata } = req.body;
    const user = (req as any).user;
    const tenantId = user.tenantId;
    const organizationId = normalizeOptionalId(req.query.organizationId);
    const clientProjectId = normalizeOptionalId(req.query.clientProjectId);

    // Check ownership
    const [project] = await db.select().from(generativeStudioProjects)
        .where(eq(generativeStudioProjects.id, req.params.id)).limit(1);

    if (!project) return res.status(404).json({ error: 'Project not found' });
    if (tenantId && project.tenantId !== tenantId) return res.status(403).json({ error: 'Access denied' });
    if (!isProjectWithinScope(project, organizationId, clientProjectId)) return res.status(403).json({ error: 'Access denied' });

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
    return sendGenerativeStudioError(res, error, "update project");
  }
});

/**
 * DELETE /projects/:id
 * Delete project
 */
router.delete("/projects/:id", requireDualAuth, async (req: Request, res: Response) => {
  try {
    const user = (req as any).user;
    const tenantId = user.tenantId;
    const organizationId = normalizeOptionalId(req.query.organizationId);
    const clientProjectId = normalizeOptionalId(req.query.clientProjectId);

    // Check ownership
    const [project] = await db.select().from(generativeStudioProjects)
        .where(eq(generativeStudioProjects.id, req.params.id)).limit(1);

    if (!project) return res.status(404).json({ error: 'Project not found' });
    if (tenantId && project.tenantId !== tenantId) return res.status(403).json({ error: 'Access denied' });
    if (!isProjectWithinScope(project, organizationId, clientProjectId)) return res.status(403).json({ error: 'Access denied' });

    await db.delete(generativeStudioProjects)
      .where(eq(generativeStudioProjects.id, req.params.id));
    res.json({ success: true });
  } catch (error: any) {
    return sendGenerativeStudioError(res, error, "delete project");
  }
});

// ============================================================================
// AI GENERATION ENDPOINTS
// ============================================================================

/**
 * POST /generate/landing-page
 */
router.post("/generate/landing-page", requireDualAuth, async (req: Request, res: Response) => {
  try {
    const { userId, tenantId } = getAuthedUserContext(req);

    const result = await generateLandingPage({
      ...req.body,
      ownerId: userId,
      tenantId: tenantId,
    });
    res.json(result);
  } catch (error: any) {
    return sendGenerativeStudioError(res, error, "generate landing page");
  }
});

/**
 * POST /generate/email-template
 */
router.post("/generate/email-template", requireDualAuth, async (req: Request, res: Response) => {
  try {
    const { userId, tenantId } = getAuthedUserContext(req);

    const result = await generateEmailTemplate({
      ...req.body,
      ownerId: userId,
      tenantId: tenantId,
    });
    res.json(result);
  } catch (error: any) {
    return sendGenerativeStudioError(res, error, "generate email template");
  }
});

/**
 * POST /generate/blog-post
 */
router.post("/generate/blog-post", requireDualAuth, async (req: Request, res: Response) => {
  try {
    const { userId, tenantId } = getAuthedUserContext(req);

    const result = await generateBlogPost({
      ...req.body,
      ownerId: userId,
      tenantId: tenantId,
    });
    res.json(result);
  } catch (error: any) {
    return sendGenerativeStudioError(res, error, "generate blog post");
  }
});

/**
 * POST /generate/ebook
 */
router.post("/generate/ebook", requireDualAuth, async (req: Request, res: Response) => {
  try {
    const { userId, tenantId } = getAuthedUserContext(req);

    const result = await generateEbook({
      ...req.body,
      ownerId: userId,
      tenantId: tenantId,
    });
    res.json(result);
  } catch (error: any) {
    return sendGenerativeStudioError(res, error, "generate ebook");
  }
});

/**
 * POST /generate/solution-brief
 */
router.post("/generate/solution-brief", requireDualAuth, async (req: Request, res: Response) => {
  try {
    const { userId, tenantId } = getAuthedUserContext(req);

    const result = await generateSolutionBrief({
      ...req.body,
      ownerId: userId,
      tenantId: tenantId,
    });
    res.json(result);
  } catch (error: any) {
    return sendGenerativeStudioError(res, error, "generate solution brief");
  }
});

/**
 * POST /refine/:id
 * Refine existing generated content
 */
router.post("/refine/:id", requireDualAuth, async (req: Request, res: Response) => {
  try {
    const { userId, tenantId } = getAuthedUserContext(req);
    const { instructions } = req.body;
    const organizationId = normalizeOptionalId(req.query.organizationId);
    const clientProjectId = normalizeOptionalId(req.query.clientProjectId);

    if (!instructions) {
      return res.status(400).json({ error: 'Refinement instructions are required' });
    }

    // Check ownership before refinement
    const [project] = await db.select().from(generativeStudioProjects)
        .where(eq(generativeStudioProjects.id, req.params.id)).limit(1);

    if (!project) return res.status(404).json({ error: 'Project not found' });
    if (tenantId && project.tenantId !== tenantId) return res.status(403).json({ error: 'Access denied' });
    if (!isProjectWithinScope(project, organizationId, clientProjectId)) return res.status(403).json({ error: 'Access denied' });

    const result = await refineContent(req.params.id, instructions, userId);
    res.json(result);
  } catch (error: any) {
    return sendGenerativeStudioError(res, error, "refine content");
  }
});

// ============================================================================
// CHAT ENDPOINTS
// ============================================================================

/**
 * POST /chat
 * Send a chat message
 */
router.post("/chat", requireDualAuth, async (req: Request, res: Response) => {
  try {
    const { userId } = getAuthedUserContext(req);
    const { sessionId, message, projectId } = req.body;
    const organizationId = normalizeOptionalId(req.body.organizationId);

    if (!message) {
      return res.status(400).json({ error: 'Message is required' });
    }

    if (organizationId && sessionId && !sessionId.startsWith(`${organizationId}::`)) {
      return res.status(403).json({ error: 'Access denied' });
    }

    const result = await aiChat({
      sessionId,
      message,
      projectId,
      ownerId: userId,
      organizationId,
    });

    res.json(result);
  } catch (error: any) {
    return sendGenerativeStudioError(res, error, "chat");
  }
});

/**
 * GET /chat/sessions
 * List chat sessions
 */
router.get("/chat/sessions", requireDualAuth, async (req: Request, res: Response) => {
  try {
    const { userId } = getAuthedUserContext(req);
    const organizationId = normalizeOptionalId(req.query.organizationId);

    const conditions: any[] = [eq(generativeStudioChatMessages.ownerId, userId)];
    if (organizationId) {
      conditions.push(sql`${generativeStudioChatMessages.sessionId} like ${organizationId + '::%'}`);
    }

    // Get distinct sessions with their latest message
    const sessions = await db
      .selectDistinctOn([generativeStudioChatMessages.sessionId], {
        sessionId: generativeStudioChatMessages.sessionId,
        lastMessage: generativeStudioChatMessages.content,
        lastRole: generativeStudioChatMessages.role,
        createdAt: generativeStudioChatMessages.createdAt,
      })
      .from(generativeStudioChatMessages)
      .where(and(...conditions))
      .orderBy(
        generativeStudioChatMessages.sessionId,
        desc(generativeStudioChatMessages.createdAt)
      );

    res.json({ sessions });
  } catch (error: any) {
    return sendGenerativeStudioError(res, error, "list chat sessions");
  }
});

/**
 * GET /chat/sessions/:sessionId
 * Get chat history for a session
 */
router.get("/chat/sessions/:sessionId", requireDualAuth, async (req: Request, res: Response) => {
  try {
    const { userId } = getAuthedUserContext(req);
    const organizationId = normalizeOptionalId(req.query.organizationId);
    if (organizationId && !req.params.sessionId.startsWith(`${organizationId}::`)) {
      return res.status(403).json({ error: 'Access denied' });
    }

    const messages = await db.select().from(generativeStudioChatMessages)
      .where(and(
        eq(generativeStudioChatMessages.sessionId, req.params.sessionId),
        eq(generativeStudioChatMessages.ownerId, userId)
      ))
      .orderBy(generativeStudioChatMessages.createdAt);

    res.json({ messages });
  } catch (error: any) {
    return sendGenerativeStudioError(res, error, "get chat session");
  }
});

/**
 * DELETE /chat/sessions/:sessionId
 * Delete a chat session
 */
router.delete("/chat/sessions/:sessionId", requireDualAuth, async (req: Request, res: Response) => {
  try {
    const { userId } = getAuthedUserContext(req);
    const organizationId = normalizeOptionalId(req.query.organizationId);
    if (organizationId && !req.params.sessionId.startsWith(`${organizationId}::`)) {
      return res.status(403).json({ error: 'Access denied' });
    }

    await db.delete(generativeStudioChatMessages)
      .where(and(
        eq(generativeStudioChatMessages.sessionId, req.params.sessionId),
        eq(generativeStudioChatMessages.ownerId, userId)
      ));
    res.json({ success: true });
  } catch (error: any) {
    return sendGenerativeStudioError(res, error, "delete chat session");
  }
});

// ============================================================================
// PUBLISHING ENDPOINTS
// ============================================================================

/**
 * POST /publish/:id
 * Publish a project (create a public page)
 */
router.post("/publish/:id", requireDualAuth, async (req: Request, res: Response) => {
  try {
    const user = (req as any).user;
    const userId = user?.id || 'system';
    const tenantId = user?.tenantId;
    const { slug, metaTitle, metaDescription } = req.body;
    const organizationId = normalizeOptionalId(req.body.organizationId);
    const clientProjectId = normalizeOptionalId(req.body.clientProjectId);

    const [project] = await db.select().from(generativeStudioProjects)
      .where(eq(generativeStudioProjects.id, req.params.id)).limit(1);

    if (!project) {
      return res.status(404).json({ error: 'Project not found' });
    }

    if (tenantId && project.tenantId !== tenantId) {
      return res.status(403).json({ error: 'Access denied' });
    }
    if (!tenantId && project.ownerId !== userId) {
      return res.status(403).json({ error: 'Access denied' });
    }
    if (!isProjectWithinScope(project, organizationId, clientProjectId)) {
      return res.status(403).json({ error: 'Access denied' });
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
    return sendGenerativeStudioError(res, error, "publish");
  }
});

/**
 * POST /unpublish/:id
 * Unpublish a project
 */
router.post("/unpublish/:id", requireDualAuth, async (req: Request, res: Response) => {
  try {
    const user = (req as any).user;
    const userId = user?.id || 'system';
    const tenantId = user?.tenantId;
    const organizationId = normalizeOptionalId(req.body?.organizationId);
    const clientProjectId = normalizeOptionalId(req.body?.clientProjectId);

    const [project] = await db.select().from(generativeStudioProjects)
      .where(eq(generativeStudioProjects.id, req.params.id)).limit(1);

    if (!project) {
      return res.status(404).json({ error: 'Project not found' });
    }

    if (tenantId && project.tenantId !== tenantId) {
      return res.status(403).json({ error: 'Access denied' });
    }
    if (!tenantId && project.ownerId !== userId) {
      return res.status(403).json({ error: 'Access denied' });
    }
    if (!isProjectWithinScope(project, organizationId, clientProjectId)) {
      return res.status(403).json({ error: 'Access denied' });
    }

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
    return sendGenerativeStudioError(res, error, "unpublish");
  }
});

/**
 * POST /save-as-asset/:id
 * Save project to content assets library
 */
router.post("/save-as-asset/:id", requireDualAuth, async (req: Request, res: Response) => {
  try {
    const user = (req as any).user;
    const userId = user?.id || 'system';
    const tenantId = user?.tenantId;
    const organizationId = normalizeOptionalId(req.body?.organizationId);
    const clientProjectId = normalizeOptionalId(req.body?.clientProjectId);

    const [project] = await db.select().from(generativeStudioProjects)
      .where(eq(generativeStudioProjects.id, req.params.id)).limit(1);

    if (!project) {
      return res.status(404).json({ error: 'Project not found' });
    }

    if (tenantId && project.tenantId !== tenantId) {
      return res.status(403).json({ error: 'Access denied' });
    }
    if (!tenantId && project.ownerId !== userId) {
      return res.status(403).json({ error: 'Access denied' });
    }
    if (!isProjectWithinScope(project, organizationId, clientProjectId)) {
      return res.status(403).json({ error: 'Access denied' });
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
      metadata: {
        organizationId,
        clientProjectId,
      },
    }).returning();

    // Link the asset to the project
    await db.update(generativeStudioProjects)
      .set({ contentAssetId: asset.id, updatedAt: new Date() })
      .where(eq(generativeStudioProjects.id, project.id));

    res.json({ asset });
  } catch (error: any) {
    return sendGenerativeStudioError(res, error, "save as asset");
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
