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
  contentPromotionPageViews,
  contentAssets,
  clientProjects,
  pageVersions,
  pageFeatureMappings,
} from "@shared/schema";
import { eq, and, desc, sql, max } from "drizzle-orm";
import { requireAuth, verifyToken } from "../auth";
import { resolveScopedOrganizationId } from "../lib/client-organization-scope";
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
    typeof candidateStatus === "number" && candidateStatus >= 400 && candidateStatus > 'organizationId' = ${organizationId}`);
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

async function resolveRequestOrganizationId(
  req: Request,
  source: "body" | "query",
  requireOrganization = false,
): Promise {
  const { tenantId } = getAuthedUserContext(req);
  const requestedOrganizationId =
    source === "body"
      ? normalizeOptionalId(req.body?.organizationId)
      : normalizeOptionalId(req.query.organizationId);

  const organizationId = await resolveScopedOrganizationId({
    tenantId,
    requestedOrganizationId,
    requireOrganization,
  });

  if (source === "body") {
    req.body = {
      ...(req.body || {}),
      organizationId,
    };
  }

  return organizationId;
}

// ============================================================================
// PROJECTS CRUD
// ============================================================================

/**
 * GET /resolve-project-org
 * Resolve organization ID from a project ID.
 * Checks generativeStudioProjects first (metadata.organizationId),
 * then falls back to clientProjects (campaignOrganizationId).
 */
router.get("/resolve-project-org", requireDualAuth, async (req: Request, res: Response) => {
  try {
    const projectId = normalizeOptionalId(req.query.projectId);
    const { userId, tenantId } = getAuthedUserContext(req);
    const scopedOrganizationId = await resolveRequestOrganizationId(req, "query", false);

    if (!projectId) {
      return res.json({ organizationId: null, source: null });
    }

    // 1. Check generative studio projects first (most likely when projectId is in URL)
    const [gsProject] = await db.select({
      id: generativeStudioProjects.id,
      metadata: generativeStudioProjects.metadata,
      contentType: generativeStudioProjects.contentType,
      ownerId: generativeStudioProjects.ownerId,
      tenantId: generativeStudioProjects.tenantId,
    }).from(generativeStudioProjects).where(eq(generativeStudioProjects.id, projectId)).limit(1);

    if (gsProject) {
      const meta = (gsProject.metadata as any) || {};
      if (tenantId) {
        if (gsProject.tenantId !== tenantId) {
          return res.status(403).json({ error: "Access denied" });
        }
        if (!scopedOrganizationId || meta.organizationId !== scopedOrganizationId) {
          return res.status(403).json({ error: "Access denied" });
        }
      } else if (gsProject.ownerId !== userId) {
        return res.status(403).json({ error: "Access denied" });
      }

      return res.json({
        organizationId: meta.organizationId || null,
        clientProjectId: meta.clientProjectId || null,
        studioProjectId: gsProject.id,
        studioProjectType: gsProject.contentType,
        source: "generative_studio",
      });
    }

    // 2. Fallback: check client projects
    const [clientProject] = await db.select({
      clientAccountId: clientProjects.clientAccountId,
      campaignOrganizationId: clientProjects.campaignOrganizationId,
    }).from(clientProjects).where(eq(clientProjects.id, projectId)).limit(1);

    if (clientProject) {
      if (tenantId) {
        if (clientProject.clientAccountId !== tenantId) {
          return res.status(403).json({ error: "Access denied" });
        }
        if (
          !scopedOrganizationId ||
          clientProject.campaignOrganizationId !== scopedOrganizationId
        ) {
          return res.status(403).json({ error: "Access denied" });
        }
      }

      return res.json({
        organizationId: clientProject.campaignOrganizationId || null,
        clientProjectId: projectId,
        source: "client_project",
      });
    }

    res.json({ organizationId: null, source: null });
  } catch (error: any) {
    return sendGenerativeStudioError(res, error, "resolve project org");
  }
});

/**
 * GET /org-projects
 * List client projects for an organization
 */
router.get("/org-projects", requireDualAuth, async (req: Request, res: Response) => {
  try {
    const user = (req as any).user;
    const tenantId = user.tenantId;
    const organizationId = await resolveRequestOrganizationId(req, "query", false);

    if (tenantId && !organizationId) {
      return res.json({ projects: [] });
    }

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
    const organizationId = await resolveRequestOrganizationId(req, "query", false);
    const clientProjectId = normalizeOptionalId(req.query.clientProjectId);

    let conditions = [];
    
    // Strict scoping: If tenantId exists (Client), scope by tenantId. 
    // Otherwise scope by ownerId (internal user)
    if (tenantId) {
       conditions.push(eq(generativeStudioProjects.tenantId, tenantId));
    } else {
       conditions.push(eq(generativeStudioProjects.ownerId, userId));
    }

    if (tenantId && !organizationId) {
      return res.json({ projects: [], total: 0 });
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
    const { userId, tenantId } = getAuthedUserContext(req);
    const organizationId = await resolveRequestOrganizationId(req, "query", false);
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
    if (!tenantId && project.ownerId !== userId) {
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
    const { userId, tenantId } = getAuthedUserContext(req);
    const organizationId = await resolveRequestOrganizationId(req, "query", false);
    const clientProjectId = normalizeOptionalId(req.query.clientProjectId);

    // Check ownership
    const [project] = await db.select().from(generativeStudioProjects)
        .where(eq(generativeStudioProjects.id, req.params.id)).limit(1);

    if (!project) return res.status(404).json({ error: 'Project not found' });
    if (tenantId && project.tenantId !== tenantId) return res.status(403).json({ error: 'Access denied' });
    if (!tenantId && project.ownerId !== userId) return res.status(403).json({ error: 'Access denied' });
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
    const { userId, tenantId } = getAuthedUserContext(req);
    const organizationId = await resolveRequestOrganizationId(req, "query", false);
    const clientProjectId = normalizeOptionalId(req.query.clientProjectId);

    // Check ownership
    const [project] = await db.select().from(generativeStudioProjects)
        .where(eq(generativeStudioProjects.id, req.params.id)).limit(1);

    if (!project) return res.status(404).json({ error: 'Project not found' });
    if (tenantId && project.tenantId !== tenantId) return res.status(403).json({ error: 'Access denied' });
    if (!tenantId && project.ownerId !== userId) return res.status(403).json({ error: 'Access denied' });
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
    await resolveRequestOrganizationId(req, "body", true);

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
    await resolveRequestOrganizationId(req, "body", true);

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
    await resolveRequestOrganizationId(req, "body", true);

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
    await resolveRequestOrganizationId(req, "body", true);

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
    await resolveRequestOrganizationId(req, "body", true);

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
    const organizationId = await resolveRequestOrganizationId(req, "query", false);
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
    const organizationId = await resolveRequestOrganizationId(req, "body", true);

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
    const { userId, tenantId } = getAuthedUserContext(req);
    const organizationId = await resolveRequestOrganizationId(req, "query", false);

    if (tenantId && !organizationId) {
      return res.json({ sessions: [] });
    }

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
    const { userId, tenantId } = getAuthedUserContext(req);
    const organizationId = await resolveRequestOrganizationId(req, "query", false);
    if (tenantId && !organizationId) {
      return res.status(403).json({ error: 'Access denied' });
    }
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
    const { userId, tenantId } = getAuthedUserContext(req);
    const organizationId = await resolveRequestOrganizationId(req, "query", false);
    if (tenantId && !organizationId) {
      return res.status(403).json({ error: 'Access denied' });
    }
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
    const { userId, tenantId } = getAuthedUserContext(req);
    const { slug, metaTitle, metaDescription, publishToResourceCenter, resourceCategory, featureIds } = req.body;
    const organizationId = await resolveRequestOrganizationId(req, "body", false);
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
      // Snapshot current content into version history before overwriting
      try {
        const [maxVer] = await db.select({ max: max(pageVersions.versionNumber) })
          .from(pageVersions).where(eq(pageVersions.publishedPageId, existing.id));
        const nextVersion = ((maxVer?.max as number) || 0) + 1;
        await db.insert(pageVersions).values({
          publishedPageId: existing.id,
          versionNumber: nextVersion,
          htmlContent: existing.htmlContent,
          cssContent: existing.cssContent,
          changeDescription: `Snapshot before republish of "${project.title}"`,
          changeTrigger: 'manual',
          createdBy: userId,
          tenantId,
        });
      } catch (versionErr) {
        console.error('[GenerativeStudio] Failed to create version snapshot on republish', versionErr);
      }

      // Update existing published page
      const [updated] = await db.update(generativeStudioPublishedPages)
        .set({
          title: project.title,
          htmlContent: project.generatedContentHtml || project.generatedContent || '',
          metaTitle: metaTitle || metadata.metaTitle || metadata.seoTitle || project.title,
          metaDescription: metaDescription || metadata.metaDescription || metadata.seoDescription || '',
          isPublished: true,
          publishedAt: new Date(),
          isResourceCenter: publishToResourceCenter === true,
          resourceCategory: publishToResourceCenter ? (resourceCategory || null) : undefined,
          tenantId: tenantId,
          updatedAt: new Date(),
        })
        .where(eq(generativeStudioPublishedPages.id, existing.id))
        .returning();

      // Update project status
      await db.update(generativeStudioProjects)
        .set({ status: 'published', updatedAt: new Date() })
        .where(eq(generativeStudioProjects.id, project.id));

      // Create feature mappings if provided
      if (Array.isArray(featureIds) && featureIds.length > 0) {
        try {
          for (const fId of featureIds) {
            await db.insert(pageFeatureMappings).values({
              publishedPageId: updated.id,
              featureId: fId,
              coverageDepth: 'primary',
              lastVerifiedAt: new Date(),
              tenantId,
            }).onConflictDoUpdate({
              target: [pageFeatureMappings.publishedPageId, pageFeatureMappings.featureId],
              set: { coverageDepth: 'primary', lastVerifiedAt: new Date() },
            });
          }
        } catch (mapErr) {
          console.error('[GenerativeStudio] Failed to create feature mappings on publish', mapErr);
        }
      }

      return res.json({ publishedPage: updated, url: `/generative-studio/public/${updated.slug}` });
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
      isResourceCenter: publishToResourceCenter === true,
      resourceCategory: publishToResourceCenter ? (resourceCategory || null) : null,
      ownerId: userId,
      tenantId: tenantId,
    }).returning();

    // Update project status
    await db.update(generativeStudioProjects)
      .set({ status: 'published', updatedAt: new Date() })
      .where(eq(generativeStudioProjects.id, project.id));

    // Create feature mappings if provided
    if (Array.isArray(featureIds) && featureIds.length > 0) {
      try {
        for (const fId of featureIds) {
          await db.insert(pageFeatureMappings).values({
            publishedPageId: published.id,
            featureId: fId,
            coverageDepth: 'primary',
            lastVerifiedAt: new Date(),
            tenantId,
          }).onConflictDoUpdate({
            target: [pageFeatureMappings.publishedPageId, pageFeatureMappings.featureId],
            set: { coverageDepth: 'primary', lastVerifiedAt: new Date() },
          });
        }
      } catch (mapErr) {
        console.error('[GenerativeStudio] Failed to create feature mappings on publish', mapErr);
      }
    }

    res.json({ publishedPage: published, url: `/generative-studio/public/${pageSlug}` });
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
    const { userId, tenantId } = getAuthedUserContext(req);
    const organizationId = await resolveRequestOrganizationId(req, "body", false);
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
    const { userId, tenantId } = getAuthedUserContext(req);
    const organizationId = await resolveRequestOrganizationId(req, "body", false);
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
    const effectiveOrganizationId = organizationId || metadata.organizationId || null;
    const effectiveClientProjectId = clientProjectId || metadata.clientProjectId || null;

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
        organizationId: effectiveOrganizationId,
        clientProjectId: effectiveClientProjectId,
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
 * GET /published/:slug/submissions
 * Internal analytics endpoint for latest landing page form submissions
 */
router.get("/published/:slug/submissions", requireDualAuth, async (req: Request, res: Response) => {
  try {
    const { userId, tenantId } = getAuthedUserContext(req);
    const limitRaw = Number.parseInt(String(req.query.limit ?? '10'), 10);
    const limit = Number.isFinite(limitRaw) ? Math.min(Math.max(limitRaw, 1), 100) : 10;

    const [page] = await db.select().from(generativeStudioPublishedPages)
      .where(eq(generativeStudioPublishedPages.slug, req.params.slug))
      .limit(1);

    if (!page) {
      return res.status(404).json({ error: 'Published page not found' });
    }

    if (tenantId && page.tenantId !== tenantId) {
      return res.status(403).json({ error: 'Access denied' });
    }
    if (!tenantId && page.ownerId !== userId) {
      return res.status(403).json({ error: 'Access denied' });
    }

    const [totalRow] = await db
      .select({ count: sql`COUNT(*)::int` })
      .from(contentPromotionPageViews)
      .where(
        and(
          eq(contentPromotionPageViews.pageId, page.id),
          eq(contentPromotionPageViews.eventType, 'form_submit')
        )
      );

    const recentRows = await db
      .select({
        id: contentPromotionPageViews.id,
        createdAt: contentPromotionPageViews.createdAt,
        visitorEmail: contentPromotionPageViews.visitorEmail,
        visitorFirstName: contentPromotionPageViews.visitorFirstName,
        visitorLastName: contentPromotionPageViews.visitorLastName,
        visitorCompany: contentPromotionPageViews.visitorCompany,
        utmSource: contentPromotionPageViews.utmSource,
        utmMedium: contentPromotionPageViews.utmMedium,
        utmCampaign: contentPromotionPageViews.utmCampaign,
        formData: contentPromotionPageViews.formData,
      })
      .from(contentPromotionPageViews)
      .where(
        and(
          eq(contentPromotionPageViews.pageId, page.id),
          eq(contentPromotionPageViews.eventType, 'form_submit')
        )
      )
      .orderBy(desc(contentPromotionPageViews.createdAt))
      .limit(limit);

    return res.json({
      slug: page.slug,
      title: page.title,
      totalSubmissions: totalRow?.count || 0,
      recentSubmissions: recentRows,
    });
  } catch (error: any) {
    return sendGenerativeStudioError(res, error, 'get published submissions');
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
      return res.status(404).send('Page Not Found');
    }

    // Increment view count
    await db.update(generativeStudioPublishedPages)
      .set({ viewCount: (page.viewCount || 0) + 1 })
      .where(eq(generativeStudioPublishedPages.id, page.id));

    // Serve as full HTML page
    const fullHtml = `


  
  
  ${page.metaTitle || page.title}
  
  ${page.ogImageUrl ? `` : ''}
  
  
  ${page.cssContent ? `${page.cssContent}` : ''}


${page.htmlContent}

`;

    res.type('html').send(fullHtml);
  } catch (error: any) {
    console.error('Error serving public page:', error);
    res.status(500).send('Server Error');
  }
});

/**
 * POST /public/:slug/track-submit
 * Track landing page form submissions for published Generative Studio pages
 * (public endpoint, no auth)
 */
router.post("/public/:slug/track-submit", async (req: Request, res: Response) => {
  try {
    const [page] = await db.select().from(generativeStudioPublishedPages)
      .where(
        and(
          eq(generativeStudioPublishedPages.slug, req.params.slug),
          eq(generativeStudioPublishedPages.isPublished, true)
        )
      ).limit(1);

    if (!page) {
      return res.status(404).json({ error: "Page not found" });
    }

    const body = (req.body && typeof req.body === 'object') ? req.body : {};
    const ipAddress =
      (req.headers["x-forwarded-for"] as string)?.split(",")[0] ||
      req.socket.remoteAddress ||
      null;
    const userAgent = req.headers["user-agent"] || null;
    const referrer = req.headers.referer || null;

    const submitterEmail = String(body.business_email || body.email || '').trim() || null;
    const submitterName = String(body.name || body.full_name || '').trim() || null;
    const firstName = String(body.first_name || body.firstname || '').trim() || null;
    const lastName = String(body.last_name || body.lastname || '').trim() || null;
    const company = String(body.company || '').trim() || null;

    await db.insert(contentPromotionPageViews).values({
      pageId: page.id,
      visitorEmail: submitterEmail,
      visitorFirstName: firstName,
      visitorLastName: lastName,
      visitorCompany: company,
      ipAddress,
      userAgent,
      referrer,
      utmSource: body.utm_source || null,
      utmMedium: body.utm_medium || null,
      utmCampaign: body.utm_campaign || null,
      utmTerm: body.utm_term || null,
      utmContent: body.utm_content || null,
      eventType: "form_submit",
      formData: {
        submitterName,
        submitterEmail,
        company,
        jobTitle: body.job_title || null,
        phone: body.phone || null,
        contactId: body.contact_id || null,
        campaignId: body.campaign_id || null,
        campaignName: body.campaign_name || null,
        sourceUrl: body.source_url || null,
        assetUrl: body.asset_url || null,
      },
      convertedAt: new Date(),
    } as any);

    return res.json({ success: true });
  } catch (error: any) {
    console.error('[GenerativeStudio] form tracking error:', error);
    return res.status(500).json({ error: 'Failed to track submission' });
  }
});

// ============================================================
// PROXY FORM SUBMISSION ROUTES (authenticated)
// ============================================================

import { z } from "zod";
import {
  getCampaignClickers,
  createProxySubmissionJob,
  processProxySubmissionJob,
  getProxySubmissionJobStatus,
  listProxySubmissionJobs,
  cancelProxySubmissionJob,
} from "../services/proxy-form-submission-service";

/**
 * GET /proxy-submissions/campaign/:campaignId/clickers
 * Get contacts who clicked email links in a campaign (candidates for proxy submission)
 */
router.get("/proxy-submissions/campaign/:campaignId/clickers", requireAuth, async (req: Request, res: Response) => {
  try {
    const clickers = await getCampaignClickers(req.params.campaignId);
    return res.json({ clickers, total: clickers.length });
  } catch (error: any) {
    return sendGenerativeStudioError(res, error, 'get campaign clickers');
  }
});

const createProxyJobSchema = z.object({
  pageSlug: z.string().min(1),
  campaignId: z.string().min(1),
  contactIds: z.array(z.string().min(1)).min(1).max(500),
  utmDefaults: z.object({
    utmSource: z.string().optional(),
    utmMedium: z.string().optional(),
    utmCampaign: z.string().optional(),
    utmTerm: z.string().optional(),
    utmContent: z.string().optional(),
  }).optional(),
  minDelayMs: z.number().int().min(1000).max(60000).optional(),
  maxDelayMs: z.number().int().min(2000).max(120000).optional(),
});

/**
 * POST /proxy-submissions/jobs
 * Create a proxy form submission job from selected campaign clickers
 */
router.post("/proxy-submissions/jobs", requireAuth, async (req: Request, res: Response) => {
  try {
    const parsed = createProxyJobSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        error: 'Validation failed',
        details: parsed.error.flatten().fieldErrors,
      });
    }

    const userId = (req as any).userId || (req as any).user?.id;
    if (!userId) {
      return res.status(401).json({ error: 'User not authenticated' });
    }

    const { pageSlug, campaignId, contactIds, utmDefaults, minDelayMs, maxDelayMs } = parsed.data;

    const result = await createProxySubmissionJob({
      pageSlug,
      campaignId,
      createdBy: userId,
      contactIds,
      utmDefaults,
      minDelayMs,
      maxDelayMs,
    });

    // Start processing in the background (non-blocking)
    processProxySubmissionJob(result.jobId).catch((err) =>
      console.error(`[ProxyFormSubmit] Background processing failed for job ${result.jobId}:`, err)
    );

    return res.status(201).json({
      message: 'Proxy submission job created and processing started',
      jobId: result.jobId,
      itemCount: result.itemCount,
    });
  } catch (error: any) {
    return sendGenerativeStudioError(res, error, 'create proxy submission job');
  }
});

/**
 * GET /proxy-submissions/jobs
 * List proxy submission jobs (optionally filtered by campaignId)
 */
router.get("/proxy-submissions/jobs", requireAuth, async (req: Request, res: Response) => {
  try {
    const campaignId = req.query.campaignId as string | undefined;
    const limit = Math.min(parseInt(req.query.limit as string) || 20, 100);
    const jobs = await listProxySubmissionJobs(campaignId, limit);
    return res.json({ jobs });
  } catch (error: any) {
    return sendGenerativeStudioError(res, error, 'list proxy submission jobs');
  }
});

/**
 * GET /proxy-submissions/jobs/:jobId
 * Get detailed status of a specific job including item-level results
 */
router.get("/proxy-submissions/jobs/:jobId", requireAuth, async (req: Request, res: Response) => {
  try {
    const job = await getProxySubmissionJobStatus(req.params.jobId);
    if (!job) {
      return res.status(404).json({ error: 'Job not found' });
    }
    return res.json(job);
  } catch (error: any) {
    return sendGenerativeStudioError(res, error, 'get proxy submission job');
  }
});

/**
 * POST /proxy-submissions/jobs/:jobId/cancel
 * Cancel a pending or processing job
 */
router.post("/proxy-submissions/jobs/:jobId/cancel", requireAuth, async (req: Request, res: Response) => {
  try {
    const cancelled = await cancelProxySubmissionJob(req.params.jobId);
    if (!cancelled) {
      return res.status(400).json({ error: 'Job cannot be cancelled (not in pending/processing state)' });
    }
    return res.json({ message: 'Job cancelled', jobId: req.params.jobId });
  } catch (error: any) {
    return sendGenerativeStudioError(res, error, 'cancel proxy submission job');
  }
});

export default router;