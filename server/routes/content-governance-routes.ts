/**
 * Content Governance Routes
 *
 * API endpoints for product feature registry, page-feature mappings,
 * content refresh, design governance, version history, and health dashboard.
 */

import { Router, Request, Response, NextFunction } from "express";
import { db } from "../db";
import {
  productFeatures,
  pageFeatureMappings,
  pageVersions,
  contentGovernanceActions,
  generativeStudioPublishedPages,
  campaignOrganizations,
} from "@shared/schema";
import { eq, and, desc, sql, inArray, isNull, count, max } from "drizzle-orm";
import { requireAuth, verifyToken } from "../auth";
import { resolveScopedOrganizationId } from "../lib/client-organization-scope";
import crypto from "crypto";
import jwt from "jsonwebtoken";

const router = Router();
const JWT_SECRET = process.env.JWT_SECRET || "development-secret-key-change-in-production";

// ============================================================================
// HELPERS
// ============================================================================

function sendError(res: Response, error: any, context: string) {
  const requestId = crypto.randomUUID();
  const candidateStatus = error?.statusCode ?? error?.status ?? error?.httpStatus;
  const statusCode =
    typeof candidateStatus === "number" && candidateStatus >= 400 && candidateStatus <= 599
      ? candidateStatus
      : 500;
  console.error(`[ContentGovernance] ${context} requestId=${requestId}`, error);
  res.status(statusCode).json({ error: error?.message || "Internal Server Error", code: error?.code, requestId });
}

function getAuthedUserContext(req: Request): { userId: string; tenantId?: string } {
  const user = (req as any).user as any;
  return {
    userId: user?.id || user?.userId || user?.clientUserId || "system",
    tenantId: user?.tenantId,
  };
}

function requireDualAuth(req: Request, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(401).json({ message: "Authentication required" });
  }
  const token = authHeader.substring(7);
  if (!token || token === "null" || token === "undefined") {
    return res.status(401).json({ message: "Invalid token" });
  }
  const mainPayload = verifyToken(token);
  if (mainPayload) {
    req.user = mainPayload;
    return next();
  }
  try {
    const clientPayload = jwt.verify(token, JWT_SECRET) as any;
    if (clientPayload.isClient) {
      req.user = {
        id: clientPayload.clientUserId,
        username: clientPayload.email,
        role: "client",
        email: clientPayload.email,
        tenantId: clientPayload.clientAccountId,
      } as any;
      (req as any).clientUser = clientPayload;
      return next();
    }
  } catch {}
  return res.status(401).json({ message: "Invalid or expired token" });
}

function normalizeOptionalId(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

async function resolveRequestOrganizationId(
  req: Request,
  source: "body" | "query",
  requireOrganization = false,
): Promise<string | undefined> {
  const { tenantId } = getAuthedUserContext(req);
  const requestedOrganizationId =
    source === "body"
      ? normalizeOptionalId(req.body?.organizationId)
      : normalizeOptionalId(req.query.organizationId as string);
  return resolveScopedOrganizationId({ tenantId, requestedOrganizationId, requireOrganization });
}

function slugify(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

// ============================================================================
// FEATURE REGISTRY CRUD
// ============================================================================

/** GET /features — List features for an organization */
router.get("/features", requireDualAuth, async (req: Request, res: Response) => {
  try {
    const organizationId = await resolveRequestOrganizationId(req, "query", true);
    if (!organizationId) return res.status(400).json({ error: "organizationId is required" });

    const { tenantId } = getAuthedUserContext(req);
    const statusFilter = normalizeOptionalId(req.query.status as string);
    const categoryFilter = normalizeOptionalId(req.query.category as string);

    const conditions: any[] = [eq(productFeatures.organizationId, organizationId)];
    if (tenantId) conditions.push(eq(productFeatures.tenantId, tenantId));
    if (statusFilter) conditions.push(sql`${productFeatures.status} = ${statusFilter}`);
    if (categoryFilter) conditions.push(eq(productFeatures.category, categoryFilter));

    const features = await db
      .select()
      .from(productFeatures)
      .where(and(...conditions))
      .orderBy(desc(productFeatures.updatedAt));

    res.json({ features });
  } catch (error: any) {
    return sendError(res, error, "list features");
  }
});

/** POST /features — Create a new product feature */
router.post("/features", requireDualAuth, async (req: Request, res: Response) => {
  try {
    const { userId, tenantId } = getAuthedUserContext(req);
    const organizationId = await resolveRequestOrganizationId(req, "body", true);
    if (!organizationId) return res.status(400).json({ error: "organizationId is required" });

    const { name, description, category, status, releaseDate, keyBenefits, targetPersonas, competitiveAngle, metadata } = req.body;
    if (!name || typeof name !== "string" || !name.trim()) {
      return res.status(400).json({ error: "name is required" });
    }

    const slug = req.body.slug || slugify(name);

    const [feature] = await db.insert(productFeatures).values({
      organizationId,
      name: name.trim(),
      slug,
      description: description || null,
      category: category || null,
      status: status || "draft",
      releaseDate: releaseDate ? new Date(releaseDate) : null,
      keyBenefits: keyBenefits || [],
      targetPersonas: targetPersonas || [],
      competitiveAngle: competitiveAngle || null,
      metadata: metadata || {},
      ownerId: userId,
      tenantId,
    }).returning();

    res.status(201).json({ feature });
  } catch (error: any) {
    if (error?.constraint?.includes("org_slug")) {
      return res.status(409).json({ error: "A feature with this slug already exists for this organization" });
    }
    return sendError(res, error, "create feature");
  }
});

/** PUT /features/:id — Update a product feature */
router.put("/features/:id", requireDualAuth, async (req: Request, res: Response) => {
  try {
    const { userId, tenantId } = getAuthedUserContext(req);
    const featureId = req.params.id;

    const [existing] = await db.select().from(productFeatures).where(eq(productFeatures.id, featureId)).limit(1);
    if (!existing) return res.status(404).json({ error: "Feature not found" });
    if (tenantId && existing.tenantId !== tenantId) return res.status(403).json({ error: "Access denied" });

    const { name, description, category, status, releaseDate, keyBenefits, targetPersonas, competitiveAngle, metadata, slug } = req.body;

    const updates: any = { updatedAt: new Date() };
    if (name !== undefined) updates.name = name.trim();
    if (slug !== undefined) updates.slug = slug;
    if (description !== undefined) updates.description = description;
    if (category !== undefined) updates.category = category;
    if (status !== undefined) updates.status = status;
    if (releaseDate !== undefined) updates.releaseDate = releaseDate ? new Date(releaseDate) : null;
    if (keyBenefits !== undefined) updates.keyBenefits = keyBenefits;
    if (targetPersonas !== undefined) updates.targetPersonas = targetPersonas;
    if (competitiveAngle !== undefined) updates.competitiveAngle = competitiveAngle;
    if (metadata !== undefined) updates.metadata = metadata;

    const [updated] = await db.update(productFeatures).set(updates).where(eq(productFeatures.id, featureId)).returning();

    // When a feature is updated, create a governance action for affected pages
    try {
      const mappings = await db.select({ publishedPageId: pageFeatureMappings.publishedPageId })
        .from(pageFeatureMappings).where(eq(pageFeatureMappings.featureId, featureId));
      if (mappings.length > 0) {
        for (const mapping of mappings) {
          await db.insert(contentGovernanceActions).values({
            organizationId: existing.organizationId,
            actionType: "refresh_recommended",
            publishedPageId: mapping.publishedPageId,
            featureId,
            description: `Feature "${updated.name}" was updated. Pages referencing this feature may need a content refresh.`,
            status: "pending",
            tenantId,
          });
        }
      }
    } catch (err) {
      console.error("[ContentGovernance] Failed to create refresh actions on feature update", err);
    }

    res.json({ feature: updated });
  } catch (error: any) {
    return sendError(res, error, "update feature");
  }
});

/** DELETE /features/:id — Soft-delete (set status to sunset) */
router.delete("/features/:id", requireDualAuth, async (req: Request, res: Response) => {
  try {
    const { tenantId } = getAuthedUserContext(req);
    const featureId = req.params.id;

    const [existing] = await db.select().from(productFeatures).where(eq(productFeatures.id, featureId)).limit(1);
    if (!existing) return res.status(404).json({ error: "Feature not found" });
    if (tenantId && existing.tenantId !== tenantId) return res.status(403).json({ error: "Access denied" });

    const [updated] = await db.update(productFeatures)
      .set({ status: "sunset", updatedAt: new Date() })
      .where(eq(productFeatures.id, featureId))
      .returning();

    res.json({ feature: updated });
  } catch (error: any) {
    return sendError(res, error, "delete feature");
  }
});

// ============================================================================
// PAGE-FEATURE MAPPINGS
// ============================================================================

/** GET /mappings — List mappings (by pageId, featureId, or organizationId) */
router.get("/mappings", requireDualAuth, async (req: Request, res: Response) => {
  try {
    const { tenantId } = getAuthedUserContext(req);
    const pageId = normalizeOptionalId(req.query.pageId as string);
    const featureId = normalizeOptionalId(req.query.featureId as string);
    const organizationId = await resolveRequestOrganizationId(req, "query", false);

    if (!pageId && !featureId && !organizationId) {
      return res.status(400).json({ error: "Provide pageId, featureId, or organizationId" });
    }

    let query = db
      .select({
        mapping: pageFeatureMappings,
        featureName: productFeatures.name,
        featureSlug: productFeatures.slug,
        featureCategory: productFeatures.category,
        featureStatus: productFeatures.status,
        pageTitle: generativeStudioPublishedPages.title,
        pageSlug: generativeStudioPublishedPages.slug,
      })
      .from(pageFeatureMappings)
      .leftJoin(productFeatures, eq(pageFeatureMappings.featureId, productFeatures.id))
      .leftJoin(generativeStudioPublishedPages, eq(pageFeatureMappings.publishedPageId, generativeStudioPublishedPages.id));

    const conditions: any[] = [];
    if (pageId) conditions.push(eq(pageFeatureMappings.publishedPageId, pageId));
    if (featureId) conditions.push(eq(pageFeatureMappings.featureId, featureId));
    if (tenantId) conditions.push(eq(pageFeatureMappings.tenantId, tenantId));
    if (organizationId) conditions.push(eq(productFeatures.organizationId, organizationId));

    const results = await query.where(and(...conditions));
    res.json({ mappings: results });
  } catch (error: any) {
    return sendError(res, error, "list mappings");
  }
});

/** POST /mappings — Create a manual mapping */
router.post("/mappings", requireDualAuth, async (req: Request, res: Response) => {
  try {
    const { tenantId } = getAuthedUserContext(req);
    const { publishedPageId, featureId, coverageDepth } = req.body;
    if (!publishedPageId || !featureId) return res.status(400).json({ error: "publishedPageId and featureId are required" });

    const [mapping] = await db.insert(pageFeatureMappings).values({
      publishedPageId,
      featureId,
      coverageDepth: coverageDepth || "mentioned",
      aiConfidence: null,
      lastVerifiedAt: new Date(),
      tenantId,
    }).returning();

    res.status(201).json({ mapping });
  } catch (error: any) {
    if (error?.constraint?.includes("page_feature")) {
      return res.status(409).json({ error: "This mapping already exists" });
    }
    return sendError(res, error, "create mapping");
  }
});

/** DELETE /mappings/:id — Remove a mapping */
router.delete("/mappings/:id", requireDualAuth, async (req: Request, res: Response) => {
  try {
    const [deleted] = await db.delete(pageFeatureMappings)
      .where(eq(pageFeatureMappings.id, req.params.id))
      .returning();
    if (!deleted) return res.status(404).json({ error: "Mapping not found" });
    res.json({ deleted: true });
  } catch (error: any) {
    return sendError(res, error, "delete mapping");
  }
});

/** POST /mappings/auto-detect/:pageId — Trigger AI auto-mapping */
router.post("/mappings/auto-detect/:pageId", requireDualAuth, async (req: Request, res: Response) => {
  try {
    const organizationId = await resolveRequestOrganizationId(req, "body", true);
    if (!organizationId) return res.status(400).json({ error: "organizationId is required" });
    const { tenantId } = getAuthedUserContext(req);
    const pageId = req.params.pageId;

    const [page] = await db.select().from(generativeStudioPublishedPages)
      .where(eq(generativeStudioPublishedPages.id, pageId)).limit(1);
    if (!page) return res.status(404).json({ error: "Published page not found" });

    const features = await db.select().from(productFeatures)
      .where(and(eq(productFeatures.organizationId, organizationId), eq(productFeatures.status, "active")));

    if (features.length === 0) {
      return res.json({ mappings: [], message: "No active features to map against" });
    }

    // Lazy-load AI service to avoid circular deps
    const { autoMapFeaturesToPage } = await import("../services/ai-content-governance");
    const detectedMappings = await autoMapFeaturesToPage(pageId, organizationId, page.htmlContent, features);

    // Upsert mappings
    const results = [];
    for (const detected of detectedMappings) {
      const [mapping] = await db.insert(pageFeatureMappings).values({
        publishedPageId: pageId,
        featureId: detected.featureId,
        coverageDepth: detected.coverageDepth,
        aiConfidence: detected.confidence,
        lastVerifiedAt: new Date(),
        tenantId,
      }).onConflictDoUpdate({
        target: [pageFeatureMappings.publishedPageId, pageFeatureMappings.featureId],
        set: {
          coverageDepth: detected.coverageDepth,
          aiConfidence: detected.confidence,
          lastVerifiedAt: new Date(),
        },
      }).returning();
      results.push(mapping);
    }

    res.json({ mappings: results });
  } catch (error: any) {
    return sendError(res, error, "auto-detect mappings");
  }
});

// ============================================================================
// CONTENT REFRESH
// ============================================================================

/** POST /refresh/analyze — Analyze impact of a feature on existing pages */
router.post("/refresh/analyze", requireDualAuth, async (req: Request, res: Response) => {
  try {
    const organizationId = await resolveRequestOrganizationId(req, "body", true);
    if (!organizationId) return res.status(400).json({ error: "organizationId is required" });
    const { featureId } = req.body;
    if (!featureId) return res.status(400).json({ error: "featureId is required" });

    const [feature] = await db.select().from(productFeatures).where(eq(productFeatures.id, featureId)).limit(1);
    if (!feature) return res.status(404).json({ error: "Feature not found" });

    const { tenantId } = getAuthedUserContext(req);
    const conditions: any[] = [eq(generativeStudioPublishedPages.isPublished, true)];
    if (tenantId) conditions.push(eq(generativeStudioPublishedPages.tenantId, tenantId));

    const pages = await db.select().from(generativeStudioPublishedPages).where(and(...conditions));

    const { analyzeFeaturePageImpact } = await import("../services/ai-content-governance");
    const analysis = await analyzeFeaturePageImpact(feature, pages);

    res.json({ analysis });
  } catch (error: any) {
    return sendError(res, error, "analyze feature impact");
  }
});

/** POST /refresh/generate — Generate a content refresh preview for a page */
router.post("/refresh/generate", requireDualAuth, async (req: Request, res: Response) => {
  try {
    const organizationId = await resolveRequestOrganizationId(req, "body", true);
    if (!organizationId) return res.status(400).json({ error: "organizationId is required" });
    const { publishedPageId, featureIds } = req.body;
    if (!publishedPageId) return res.status(400).json({ error: "publishedPageId is required" });

    const [page] = await db.select().from(generativeStudioPublishedPages)
      .where(eq(generativeStudioPublishedPages.id, publishedPageId)).limit(1);
    if (!page) return res.status(404).json({ error: "Published page not found" });

    const features = featureIds?.length
      ? await db.select().from(productFeatures).where(inArray(productFeatures.id, featureIds))
      : await db.select().from(productFeatures).where(and(
          eq(productFeatures.organizationId, organizationId),
          eq(productFeatures.status, "active")
        ));

    const { generateContentRefresh } = await import("../services/ai-content-governance");
    const result = await generateContentRefresh(page, features, organizationId);

    res.json({ preview: result });
  } catch (error: any) {
    return sendError(res, error, "generate content refresh");
  }
});

/** POST /refresh/apply — Apply a content refresh (creates version, updates page) */
router.post("/refresh/apply", requireDualAuth, async (req: Request, res: Response) => {
  try {
    const { userId, tenantId } = getAuthedUserContext(req);
    const { publishedPageId, updatedHtml, changeDescription, featureIds } = req.body;
    if (!publishedPageId || !updatedHtml) return res.status(400).json({ error: "publishedPageId and updatedHtml are required" });

    const [page] = await db.select().from(generativeStudioPublishedPages)
      .where(eq(generativeStudioPublishedPages.id, publishedPageId)).limit(1);
    if (!page) return res.status(404).json({ error: "Published page not found" });

    // Create version snapshot of current content
    const [maxVersion] = await db.select({ max: max(pageVersions.versionNumber) })
      .from(pageVersions).where(eq(pageVersions.publishedPageId, publishedPageId));
    const nextVersion = ((maxVersion?.max as number) || 0) + 1;

    await db.insert(pageVersions).values({
      publishedPageId,
      versionNumber: nextVersion,
      htmlContent: page.htmlContent,
      cssContent: page.cssContent,
      changeDescription: `Snapshot before AI content refresh: ${changeDescription || ""}`.trim(),
      changeTrigger: "ai_refresh",
      featureContext: featureIds || null,
      createdBy: userId,
      tenantId,
    });

    // Update the live page
    const [updated] = await db.update(generativeStudioPublishedPages)
      .set({ htmlContent: updatedHtml, updatedAt: new Date() })
      .where(eq(generativeStudioPublishedPages.id, publishedPageId))
      .returning();

    res.json({ page: updated, versionCreated: nextVersion });
  } catch (error: any) {
    return sendError(res, error, "apply content refresh");
  }
});

// ============================================================================
// DESIGN GOVERNANCE
// ============================================================================

/** POST /design/improve — Generate a design improvement preview from a prompt */
router.post("/design/improve", requireDualAuth, async (req: Request, res: Response) => {
  try {
    const organizationId = await resolveRequestOrganizationId(req, "body", true);
    if (!organizationId) return res.status(400).json({ error: "organizationId is required" });
    const { publishedPageId, designPrompt } = req.body;
    if (!publishedPageId || !designPrompt) return res.status(400).json({ error: "publishedPageId and designPrompt are required" });

    const [page] = await db.select().from(generativeStudioPublishedPages)
      .where(eq(generativeStudioPublishedPages.id, publishedPageId)).limit(1);
    if (!page) return res.status(404).json({ error: "Published page not found" });

    const { generateDesignImprovement } = await import("../services/ai-content-governance");
    const result = await generateDesignImprovement(page, designPrompt, organizationId);

    res.json({ preview: result });
  } catch (error: any) {
    return sendError(res, error, "design improvement");
  }
});

/** POST /design/apply — Apply a design improvement */
router.post("/design/apply", requireDualAuth, async (req: Request, res: Response) => {
  try {
    const { userId, tenantId } = getAuthedUserContext(req);
    const { publishedPageId, updatedHtml, designPrompt, changeDescription } = req.body;
    if (!publishedPageId || !updatedHtml) return res.status(400).json({ error: "publishedPageId and updatedHtml are required" });

    const [page] = await db.select().from(generativeStudioPublishedPages)
      .where(eq(generativeStudioPublishedPages.id, publishedPageId)).limit(1);
    if (!page) return res.status(404).json({ error: "Published page not found" });

    // Version snapshot
    const [maxVersion] = await db.select({ max: max(pageVersions.versionNumber) })
      .from(pageVersions).where(eq(pageVersions.publishedPageId, publishedPageId));
    const nextVersion = ((maxVersion?.max as number) || 0) + 1;

    await db.insert(pageVersions).values({
      publishedPageId,
      versionNumber: nextVersion,
      htmlContent: page.htmlContent,
      cssContent: page.cssContent,
      changeDescription: `Snapshot before design update: ${changeDescription || designPrompt || ""}`.trim(),
      changeTrigger: "design_update",
      designPrompt: designPrompt || null,
      createdBy: userId,
      tenantId,
    });

    const [updated] = await db.update(generativeStudioPublishedPages)
      .set({ htmlContent: updatedHtml, updatedAt: new Date() })
      .where(eq(generativeStudioPublishedPages.id, publishedPageId))
      .returning();

    res.json({ page: updated, versionCreated: nextVersion });
  } catch (error: any) {
    return sendError(res, error, "apply design improvement");
  }
});

// ============================================================================
// VERSION HISTORY
// ============================================================================

/** GET /versions/:pageId — List all versions for a page */
router.get("/versions/:pageId", requireDualAuth, async (req: Request, res: Response) => {
  try {
    const versions = await db.select().from(pageVersions)
      .where(eq(pageVersions.publishedPageId, req.params.pageId))
      .orderBy(desc(pageVersions.versionNumber));

    res.json({ versions });
  } catch (error: any) {
    return sendError(res, error, "list versions");
  }
});

/** POST /versions/:pageId/rollback/:versionId — Rollback to a specific version */
router.post("/versions/:pageId/rollback/:versionId", requireDualAuth, async (req: Request, res: Response) => {
  try {
    const { userId, tenantId } = getAuthedUserContext(req);
    const { pageId, versionId } = req.params;

    const [targetVersion] = await db.select().from(pageVersions)
      .where(and(eq(pageVersions.id, versionId), eq(pageVersions.publishedPageId, pageId)))
      .limit(1);
    if (!targetVersion) return res.status(404).json({ error: "Version not found" });

    const [currentPage] = await db.select().from(generativeStudioPublishedPages)
      .where(eq(generativeStudioPublishedPages.id, pageId)).limit(1);
    if (!currentPage) return res.status(404).json({ error: "Published page not found" });

    // Snapshot current before rollback
    const [maxVersion] = await db.select({ max: max(pageVersions.versionNumber) })
      .from(pageVersions).where(eq(pageVersions.publishedPageId, pageId));
    const nextVersion = ((maxVersion?.max as number) || 0) + 1;

    await db.insert(pageVersions).values({
      publishedPageId: pageId,
      versionNumber: nextVersion,
      htmlContent: currentPage.htmlContent,
      cssContent: currentPage.cssContent,
      changeDescription: `Snapshot before rollback to version ${targetVersion.versionNumber}`,
      changeTrigger: "rollback",
      createdBy: userId,
      tenantId,
    });

    // Apply rollback
    const [updated] = await db.update(generativeStudioPublishedPages)
      .set({
        htmlContent: targetVersion.htmlContent,
        cssContent: targetVersion.cssContent,
        updatedAt: new Date(),
      })
      .where(eq(generativeStudioPublishedPages.id, pageId))
      .returning();

    res.json({ page: updated, rolledBackToVersion: targetVersion.versionNumber, newVersionCreated: nextVersion });
  } catch (error: any) {
    return sendError(res, error, "rollback version");
  }
});

// ============================================================================
// HEALTH & GOVERNANCE ACTIONS
// ============================================================================

/** GET /health/:organizationId — Page health dashboard data */
router.get("/health/:organizationId", requireDualAuth, async (req: Request, res: Response) => {
  try {
    const organizationId = req.params.organizationId;
    const { tenantId } = getAuthedUserContext(req);

    // Get all published pages for org (via tenantId scope)
    const pageConditions: any[] = [eq(generativeStudioPublishedPages.isPublished, true)];
    if (tenantId) pageConditions.push(eq(generativeStudioPublishedPages.tenantId, tenantId));
    const pages = await db.select().from(generativeStudioPublishedPages).where(and(...pageConditions));

    // Get all active features for org
    const features = await db.select().from(productFeatures)
      .where(and(eq(productFeatures.organizationId, organizationId), eq(productFeatures.status, "active")));

    // Get all mappings
    const pageIds = pages.map(p => p.id);
    const featureIds = features.map(f => f.id);
    let mappings: any[] = [];
    if (pageIds.length > 0) {
      mappings = await db.select().from(pageFeatureMappings)
        .where(inArray(pageFeatureMappings.publishedPageId, pageIds));
    }

    // Calculate health per page
    const pageHealth = pages.map(page => {
      const pageMappings = mappings.filter(m => m.publishedPageId === page.id);
      const coveredFeatureIds = new Set(pageMappings.map(m => m.featureId));
      const staleFeatures = features.filter(f =>
        coveredFeatureIds.has(f.id) &&
        f.updatedAt > (page.updatedAt || page.createdAt)
      );

      const daysSinceUpdate = Math.floor((Date.now() - new Date(page.updatedAt || page.createdAt).getTime()) / (1000 * 60 * 60 * 24));
      let healthScore = 100;
      if (daysSinceUpdate > 90) healthScore -= 30;
      else if (daysSinceUpdate > 30) healthScore -= 15;
      if (staleFeatures.length > 0) healthScore -= staleFeatures.length * 10;
      healthScore = Math.max(0, healthScore);

      return {
        id: page.id,
        title: page.title,
        slug: page.slug,
        healthScore,
        daysSinceUpdate,
        totalMappings: pageMappings.length,
        staleFeatures: staleFeatures.map(f => ({ id: f.id, name: f.name })),
        lastUpdated: page.updatedAt,
      };
    });

    // Uncovered features (active features with no page mapping)
    const mappedFeatureIds = new Set(mappings.map(m => m.featureId));
    const uncoveredFeatures = features
      .filter(f => !mappedFeatureIds.has(f.id))
      .map(f => ({ id: f.id, name: f.name, category: f.category }));

    res.json({
      pages: pageHealth,
      uncoveredFeatures,
      totalPages: pages.length,
      totalFeatures: features.length,
      totalMappings: mappings.length,
      averageHealthScore: pageHealth.length > 0
        ? Math.round(pageHealth.reduce((sum, p) => sum + p.healthScore, 0) / pageHealth.length)
        : 100,
    });
  } catch (error: any) {
    return sendError(res, error, "page health");
  }
});

/** GET /actions — List governance actions */
router.get("/actions", requireDualAuth, async (req: Request, res: Response) => {
  try {
    const organizationId = await resolveRequestOrganizationId(req, "query", false);
    const { tenantId } = getAuthedUserContext(req);
    const statusFilter = normalizeOptionalId(req.query.status as string);

    const conditions: any[] = [];
    if (organizationId) conditions.push(eq(contentGovernanceActions.organizationId, organizationId));
    if (tenantId) conditions.push(eq(contentGovernanceActions.tenantId, tenantId));
    if (statusFilter) conditions.push(eq(contentGovernanceActions.status, statusFilter));

    const actions = await db.select().from(contentGovernanceActions)
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .orderBy(desc(contentGovernanceActions.createdAt))
      .limit(100);

    res.json({ actions });
  } catch (error: any) {
    return sendError(res, error, "list actions");
  }
});

/** PUT /actions/:id — Update action status (approve/dismiss) */
router.put("/actions/:id", requireDualAuth, async (req: Request, res: Response) => {
  try {
    const { userId } = getAuthedUserContext(req);
    const { status } = req.body;
    if (!status || !["approved", "applied", "dismissed"].includes(status)) {
      return res.status(400).json({ error: "status must be one of: approved, applied, dismissed" });
    }

    const [updated] = await db.update(contentGovernanceActions)
      .set({ status, resolvedBy: userId, resolvedAt: new Date() })
      .where(eq(contentGovernanceActions.id, req.params.id))
      .returning();

    if (!updated) return res.status(404).json({ error: "Action not found" });
    res.json({ action: updated });
  } catch (error: any) {
    return sendError(res, error, "update action");
  }
});

// ============================================================================
// RESOURCE CENTER
// ============================================================================

/** GET /resource-center/public — Public endpoint (no auth) for resource center content */
router.get("/resource-center/public", async (req: Request, res: Response) => {
  try {
    const categoryFilter = normalizeOptionalId(req.query.category as string);
    const contentTypeFilter = normalizeOptionalId(req.query.contentType as string);

    const conditions: any[] = [
      eq(generativeStudioPublishedPages.isPublished, true),
      eq(generativeStudioPublishedPages.isResourceCenter, true),
    ];
    if (categoryFilter) conditions.push(eq(generativeStudioPublishedPages.resourceCategory, categoryFilter));
    if (contentTypeFilter) conditions.push(sql`${generativeStudioPublishedPages.contentType} = ${contentTypeFilter}`);

    const resources = await db.select({
      id: generativeStudioPublishedPages.id,
      title: generativeStudioPublishedPages.title,
      slug: generativeStudioPublishedPages.slug,
      contentType: generativeStudioPublishedPages.contentType,
      metaTitle: generativeStudioPublishedPages.metaTitle,
      metaDescription: generativeStudioPublishedPages.metaDescription,
      resourceCategory: generativeStudioPublishedPages.resourceCategory,
      viewCount: generativeStudioPublishedPages.viewCount,
      publishedAt: generativeStudioPublishedPages.publishedAt,
    })
      .from(generativeStudioPublishedPages)
      .where(and(...conditions))
      .orderBy(desc(generativeStudioPublishedPages.publishedAt));

    res.json({ resources });
  } catch (error: any) {
    return sendError(res, error, "public resource center");
  }
});

/** GET /resource-center — List all published resource center content */
router.get("/resource-center", requireDualAuth, async (req: Request, res: Response) => {
  try {
    const { tenantId } = getAuthedUserContext(req);
    const categoryFilter = normalizeOptionalId(req.query.category as string);
    const contentTypeFilter = normalizeOptionalId(req.query.contentType as string);

    const conditions: any[] = [
      eq(generativeStudioPublishedPages.isPublished, true),
      eq(generativeStudioPublishedPages.isResourceCenter, true),
    ];
    if (tenantId) conditions.push(eq(generativeStudioPublishedPages.tenantId, tenantId));
    if (categoryFilter) conditions.push(eq(generativeStudioPublishedPages.resourceCategory, categoryFilter));
    if (contentTypeFilter) conditions.push(sql`${generativeStudioPublishedPages.contentType} = ${contentTypeFilter}`);

    const resources = await db.select({
      id: generativeStudioPublishedPages.id,
      title: generativeStudioPublishedPages.title,
      slug: generativeStudioPublishedPages.slug,
      contentType: generativeStudioPublishedPages.contentType,
      metaTitle: generativeStudioPublishedPages.metaTitle,
      metaDescription: generativeStudioPublishedPages.metaDescription,
      resourceCategory: generativeStudioPublishedPages.resourceCategory,
      viewCount: generativeStudioPublishedPages.viewCount,
      publishedAt: generativeStudioPublishedPages.publishedAt,
      updatedAt: generativeStudioPublishedPages.updatedAt,
    })
      .from(generativeStudioPublishedPages)
      .where(and(...conditions))
      .orderBy(desc(generativeStudioPublishedPages.publishedAt));

    res.json({ resources });
  } catch (error: any) {
    return sendError(res, error, "list resource center");
  }
});

/** PUT /resource-center/:pageId — Toggle resource center status for a page */
router.put("/resource-center/:pageId", requireDualAuth, async (req: Request, res: Response) => {
  try {
    const { isResourceCenter, resourceCategory } = req.body;
    const [updated] = await db.update(generativeStudioPublishedPages)
      .set({
        isResourceCenter: isResourceCenter === true,
        resourceCategory: isResourceCenter ? (resourceCategory || null) : null,
        updatedAt: new Date(),
      })
      .where(eq(generativeStudioPublishedPages.id, req.params.pageId))
      .returning();

    if (!updated) return res.status(404).json({ error: "Published page not found" });
    res.json({ page: updated });
  } catch (error: any) {
    return sendError(res, error, "update resource center status");
  }
});

// ============================================================================
// COMPREHENSIVE FEATURE REGISTRY SEED — God-Level Platform Governance
// ============================================================================

/**
 * POST /seed-platform-features — Populate the feature registry with every
 * major capability of the DemandGentic AI platform, categorized across the
 * full agentic architecture.  Idempotent: skips features whose slug already exists.
 */
router.post("/seed-platform-features", requireDualAuth, async (req: Request, res: Response) => {
  try {
    const { userId, tenantId } = getAuthedUserContext(req);
    const organizationId = await resolveRequestOrganizationId(req, "body", true);
    if (!organizationId) return res.status(400).json({ error: "organizationId is required" });

    const PLATFORM_FEATURES = [
      // ─────────────────────── AGENTIC AI ───────────────────────
      {
        name: "AgentC — Autonomous Agentic Operator",
        slug: "agentc-agentic-operator",
        category: "Agentic AI",
        status: "active" as const,
        description: "Unified AI assistant (AgentC) embedded across Admin and Client Portal. Processes natural-language instructions, creates execution plans, performs CRM actions, generates content, analyzes data, and manages campaigns — all within a side-panel interface with plan-review-execute governance.",
        keyBenefits: ["Natural language campaign management", "Autonomous plan generation with human-in-the-loop approval", "Cross-domain actions (CRM, content, analytics, billing)", "Context-aware per user role and account boundary"],
        targetPersonas: ["Client Account Manager", "Admin Operator", "Campaign Manager"],
        competitiveAngle: "Only B2B demand-gen platform with a unified agentic operator that spans voice, email, pipeline, and creative content — all governed by execution plan review.",
      },
      {
        name: "AgentC Voice Prompting",
        slug: "agentc-voice-prompting",
        category: "Agentic AI",
        status: "active" as const,
        description: "Browser-native speech-to-text voice prompting in the AgentC chat interface. Users click the mic button, speak naturally, and their voice is transcribed to text with interim previews — then sent as a standard prompt to AgentC.",
        keyBenefits: ["Hands-free interaction with AgentC", "Real-time interim transcription display", "Seamless fallback to text input", "No additional API cost — uses browser SpeechRecognition"],
        targetPersonas: ["Client Account Manager", "Sales Rep", "Campaign Manager"],
        competitiveAngle: "Voice-first AI assistant input — users can dictate complex campaign instructions without typing.",
      },
      {
        name: "AgentC Realtime Voice Conversation",
        slug: "agentc-realtime-voice",
        category: "Agentic AI",
        status: "active" as const,
        description: "Full-duplex real-time voice conversation with AgentC powered by OpenAI Realtime API via WebRTC. Establishes a peer-to-peer audio connection — users speak naturally and hear AgentC respond with human-like voice in real-time. Includes live transcript display, voice activity detection, mute/speaker controls.",
        keyBenefits: ["Natural conversational AI interface", "Sub-second latency via WebRTC", "Live transcript of both parties", "Server VAD for natural turn-taking", "Ephemeral token security — no long-lived keys on client"],
        targetPersonas: ["Client Account Manager", "Executive", "Account Director"],
        competitiveAngle: "First B2B demand generation platform with real-time voice AI agent using WebRTC — conversation, not commands.",
      },
      {
        name: "AI Pipeline Agent",
        slug: "ai-pipeline-agent",
        category: "Agentic AI",
        status: "active" as const,
        description: "Autonomous AI brain that controls ALL pipeline decisions: stage advancement, action scheduling, escalations, and health monitoring. Uses Vertex AI to reason over lead context, call history, and campaign patterns. Auto-creates pipelines on campaign launch.",
        keyBenefits: ["Zero-touch pipeline management", "AI-driven stage advancement", "Automatic stale-lead detection (10min health monitor)", "Context-aware follow-up action generation"],
        targetPersonas: ["Campaign Manager", "Sales Operations", "Client Account Manager"],
        competitiveAngle: "AI doesn't just suggest — it decides and executes pipeline actions autonomously with full audit trail.",
      },
      {
        name: "Campaign-Pipeline Orchestrator",
        slug: "campaign-pipeline-orchestrator",
        category: "Agentic AI",
        status: "active" as const,
        description: "Signal routing layer that connects campaign events (calls, emails, dispositions) to the AI Pipeline Agent. Routes email tracking signals via the email-pipeline bridge. Ensures every campaign signal reaches the right pipeline for AI processing.",
        keyBenefits: ["Unified signal processing", "Email-to-pipeline bridge", "Real-time event routing", "Campaign launch auto-pipeline creation"],
        targetPersonas: ["System Architect", "Campaign Manager"],
        competitiveAngle: "Full-loop campaign-to-pipeline automation — every touchpoint feeds AI decision-making.",
      },
      {
        name: "Unified Agent Architecture",
        slug: "unified-agent-architecture",
        category: "Agentic AI",
        status: "active" as const,
        description: "Decoupled agent configuration system with ResolvedAgentConfig resolved once at call setup and cached on session. Supports 10+ specialized agents: Voice, Email, Content, Pipeline, QA, Strategy, Memory, Research-Analysis, Data-Management, Compliance.",
        keyBenefits: ["Single-resolve agent config", "No downstream DB queries for agent config", "Supports inline and virtual agent origins", "Clean separation of config vs. execution"],
        targetPersonas: ["Platform Engineer", "AI Architect"],
        competitiveAngle: "Modular agent architecture enables rapid deployment of new specialized AI capabilities.",
      },
      {
        name: "Vertex AI Agentic Hub",
        slug: "vertex-agentic-hub",
        category: "Agentic AI",
        status: "active" as const,
        description: "Client-facing agentic capabilities hub powered by Vertex AI: campaign ordering, voice simulations, email generation, image generation (Imagen 3), campaign reports, and agentic campaign setup — all from a unified Vertex AI backend.",
        keyBenefits: ["Enterprise-grade AI via Google Cloud", "Multi-modal capabilities (text, voice, image)", "Function calling for structured actions", "Organization-aware context injection"],
        targetPersonas: ["Client Account Manager", "Marketing Director"],
        competitiveAngle: "Enterprise Vertex AI backbone with function calling — not just chat, but structured agentic actions.",
      },
      {
        name: "AI Deep Research Agent",
        slug: "ai-deep-research",
        category: "Agentic AI",
        status: "active" as const,
        description: "Multi-model deep research agent using Vertex AI with Grounding (Google Search). Performs comprehensive market analysis, competitive intelligence, industry trend analysis, and account research with cited web sources.",
        keyBenefits: ["Web-grounded research with citations", "Multi-model synthesis", "Market and competitive intelligence", "Account-level deep research"],
        targetPersonas: ["Strategy Analyst", "Account Executive", "Marketing Director"],
        competitiveAngle: "Built-in research agent with live web grounding — competitive intel without leaving the platform.",
      },
      {
        name: "Collaborative Code Agent (Ops)",
        slug: "ops-code-agent",
        category: "Agentic AI",
        status: "active" as const,
        description: "Internal AI code agent in the Ops Hub for platform development, debugging, and automation. Supports collaborative coding sessions with runtime execution.",
        keyBenefits: ["AI-assisted platform development", "Runtime code execution", "Error formatting and debugging", "Ops-grade automation"],
        targetPersonas: ["Platform Engineer", "DevOps"],
        competitiveAngle: "Self-improving platform — AI agents that maintain and enhance the platform itself.",
      },

      // ─────────────────────── VOICE & REALTIME ───────────────────────
      {
        name: "Multi-Provider Voice Engine",
        slug: "multi-provider-voice-engine",
        category: "Voice & Realtime",
        status: "active" as const,
        description: "Pluggable voice provider architecture supporting Gemini Live (Vertex AI), OpenAI Realtime, and Kimi voice providers. Includes provider resolver, fallback handler, audio transcoding, and dynamic persona injection.",
        keyBenefits: ["Provider redundancy and failover", "Dynamic persona injection per campaign", "Audio transcoding (PCM/Opus/μ-law)", "Unified interface across providers"],
        targetPersonas: ["Platform Engineer", "Campaign Manager"],
        competitiveAngle: "Multi-provider voice AI — automatically routes to the best available provider.",
      },
      {
        name: "Gemini Live Voice Agent",
        slug: "gemini-live-voice-agent",
        category: "Voice & Realtime",
        status: "active" as const,
        description: "Production voice agent powered by Gemini Live (Vertex AI) via WebSocket. Supports camelCase Vertex AI protocol, dynamic persona generation, real-time audio streaming, function calling mid-conversation, and turn-based conversation management.",
        keyBenefits: ["Native Google Cloud integration", "Server-side VAD", "Mid-conversation function calling", "Enterprise SLA and compliance"],
        targetPersonas: ["Campaign Manager", "Voice Operations"],
        competitiveAngle: "Enterprise-grade Gemini voice agent with dynamic persona — not a wrapper, a native integration.",
      },
      {
        name: "OpenAI Realtime WebRTC",
        slug: "openai-realtime-webrtc",
        category: "Voice & Realtime",
        status: "active" as const,
        description: "Browser-to-OpenAI WebRTC connection for real-time voice conversations. Ephemeral token-based security — server issues short-lived session tokens, client never holds API keys. Used for AgentC Voice and Preview Studio.",
        keyBenefits: ["Sub-100ms latency via WebRTC", "Ephemeral token security model", "Browser-native — no plugins required", "Whisper-1 live transcription"],
        targetPersonas: ["Client User", "Campaign Manager"],
        competitiveAngle: "Direct WebRTC to OpenAI — the lowest latency voice AI available in a B2B platform.",
      },
      {
        name: "Voice Agent Training Dashboard",
        slug: "voice-agent-training",
        category: "Voice & Realtime",
        status: "active" as const,
        description: "Dashboard for training, testing, and tuning voice agent behavior. Includes prompt management, voice simulation studio, and A/B testing of agent personas.",
        keyBenefits: ["Rapid agent persona iteration", "A/B test voice behaviors", "Simulation before deployment", "Prompt versioning"],
        targetPersonas: ["AI Trainer", "Campaign Manager", "Quality Analyst"],
        competitiveAngle: "Purpose-built voice agent training environment — not just prompts, but full behavioral tuning.",
      },

      // ─────────────────────── CAMPAIGN INTELLIGENCE ───────────────────────
      {
        name: "AI Campaign Planner",
        slug: "ai-campaign-planner",
        category: "Campaign Intelligence",
        status: "active" as const,
        description: "Full-funnel multi-channel campaign planning powered by Gemini 3 Pro reasoning. Generates awareness → engaged → qualifying → qualified_sql → appointment → closed_won funnel strategy with voice, email, and messaging channel assignments per stage.",
        keyBenefits: ["AI-generated full-funnel strategy", "Multi-channel orchestration (voice, email, messaging)", "Organization Intelligence-aware planning", "Funnel visualization with stage-channel mapping"],
        targetPersonas: ["Campaign Manager", "Marketing Director", "Client Account Manager"],
        competitiveAngle: "AI reasons through the entire sales funnel — not just one channel, but the full multi-channel journey.",
      },
      {
        name: "Intelligent Campaign Creator",
        slug: "intelligent-campaign-creator",
        category: "Campaign Intelligence",
        status: "active" as const,
        description: "AI-assisted campaign setup wizard that auto-generates campaign configurations, target audience definitions, dial modes, and agent assignments based on campaign objectives and Organization Intelligence.",
        keyBenefits: ["Auto-generated campaign configs", "OI-powered audience targeting", "Smart dial mode selection", "One-click campaign launch"],
        targetPersonas: ["Campaign Manager", "Client Account Manager"],
        competitiveAngle: "Campaign creation in minutes, not hours — AI handles the configuration complexity.",
      },
      {
        name: "AI Conversation Quality Department",
        slug: "ai-conversation-quality",
        category: "Campaign Intelligence",
        status: "active" as const,
        description: "AI-powered post-call quality analysis that evaluates conversations across multiple dimensions: objection handling, rapport building, compliance, information gathering, and outcome achievement.",
        keyBenefits: ["Automated quality scoring", "Multi-dimension analysis", "Trend detection across campaigns", "Agent coaching recommendations"],
        targetPersonas: ["Quality Analyst", "Campaign Manager", "Training Manager"],
        competitiveAngle: "Every call automatically quality-scored — no sampling, no manual review needed.",
      },
      {
        name: "AI Disposition Intelligence",
        slug: "ai-disposition-intelligence",
        category: "Campaign Intelligence",
        status: "active" as const,
        description: "Unified disposition engine that processes call outcomes, generates lead quality assessments, and triggers downstream pipeline actions. Includes deep reanalysis capability for disputed dispositions.",
        keyBenefits: ["Automated disposition classification", "Deep reanalysis for disputes", "Pipeline signal generation", "Cross-campaign disposition analytics"],
        targetPersonas: ["Campaign Manager", "Quality Analyst", "Sales Operations"],
        competitiveAngle: "AI-powered disposition — not just logging outcomes, but understanding intent and triggering actions.",
      },
      {
        name: "Unified Pipeline Planner",
        slug: "unified-pipeline-planner",
        category: "Campaign Intelligence",
        status: "active" as const,
        description: "AI-powered pipeline strategy engine that analyzes account-level engagement data and generates unified pipeline strategies spanning awareness through close. Integrates with Organization Intelligence for context-aware planning.",
        keyBenefits: ["Account-level pipeline planning", "Full-funnel strategy generation", "OI-powered context awareness", "Cross-campaign pipeline optimization"],
        targetPersonas: ["Account Executive", "Campaign Manager", "Revenue Operations"],
        competitiveAngle: "Unified pipeline intelligence — one AI brain that sees across all campaigns for each account.",
      },

      // ─────────────────────── PIPELINE & ENGAGEMENT ───────────────────────
      {
        name: "Unified Account-Based Pipeline",
        slug: "unified-account-pipeline",
        category: "Pipeline & Engagement",
        status: "active" as const,
        description: "Full-funnel unified pipeline: OI → strategy → campaigns → execution → account pipeline → close. Accounts are primary entities with contacts tracked within. Supports Kanban board visualization, stage management, and AI-driven pipeline actions.",
        keyBenefits: ["Account-centric pipeline management", "Full-funnel visibility (awareness to close)", "Kanban board visualization", "AI-driven stage advancement"],
        targetPersonas: ["Account Executive", "Sales Operations", "Campaign Manager"],
        competitiveAngle: "Account-based pipeline that spans the entire demand generation lifecycle — not just sales stages.",
      },
      {
        name: "Lead Journey Pipeline",
        slug: "lead-journey-pipeline",
        category: "Pipeline & Engagement",
        status: "active" as const,
        description: "Client-facing lead nurture pipeline for follow-up management. AI-powered talking points from previous calls, auto-generated email drafts, and next-action recommendations. Default stages: New Lead → Callback Scheduled → Contacted → Engaged → Appointment Set → Closed.",
        keyBenefits: ["AI-generated talking points per lead", "Auto-drafted follow-up emails", "Next-action AI recommendations", "Client-facing pipeline visibility"],
        targetPersonas: ["Client Account Manager", "Sales Rep", "BDR"],
        competitiveAngle: "Every lead gets AI-powered follow-up context — no more cold callbacks.",
      },
      {
        name: "Pipeline Accounts System",
        slug: "pipeline-accounts",
        category: "Pipeline & Engagement",
        status: "active" as const,
        description: "Top-of-funnel account management with AI-powered AE assignment. Manages account stages, batch AE assignments, and buyer journey board visualization.",
        keyBenefits: ["AI-powered AE assignment", "Account stage tracking", "Buyer journey visualization", "Batch operations"],
        targetPersonas: ["Sales Operations", "Account Executive", "Revenue Operations"],
        competitiveAngle: "AI assigns the right AE to the right account based on expertise, capacity, and account signals.",
      },
      {
        name: "Unified Pipeline Inbox Analyzer",
        slug: "pipeline-inbox-analyzer",
        category: "Pipeline & Engagement",
        status: "active" as const,
        description: "AI-powered inbox analysis that scans pipeline communications and extracts actionable signals for pipeline advancement, risk detection, and engagement scoring.",
        keyBenefits: ["Auto-extract pipeline signals from emails", "Risk detection", "Engagement scoring", "Actionable recommendations"],
        targetPersonas: ["Sales Operations", "Account Executive"],
        competitiveAngle: "Email intelligence feeds pipeline — every message is a signal for AI processing.",
      },

      // ─────────────────────── CONTENT & CREATIVE ───────────────────────
      {
        name: "Generative Studio",
        slug: "generative-studio",
        category: "Content & Creative",
        status: "active" as const,
        description: "AI-powered content creation hub with 7 modules: Landing Pages, Email Templates, Blog Posts, eBooks, Solution Briefs, Image Generation (Imagen 3), and AI Chat. Landing pages powered by unified engine (Vertex AI/Gemini); other modules use Vertex AI.",
        keyBenefits: ["7 content types from one interface", "OI-powered content generation", "Brand-consistent output", "One-click publish to hosted pages"],
        targetPersonas: ["Content Marketer", "Marketing Director", "Client Account Manager"],
        competitiveAngle: "Full creative studio — landing pages, emails, blogs, ebooks, and images from a single AI-powered interface.",
      },
      {
        name: "Unified Landing Page Engine",
        slug: "unified-lp-engine",
        category: "Content & Creative",
        status: "active" as const,
        description: "Single source of truth for all landing page generation. Uses Vertex AI (Gemini) with mandatory Organization Intelligence injection. Enforces lead capture forms. Serves both Generative Studio and Content Promotion systems.",
        keyBenefits: ["Consistent LP quality across all entry points", "Mandatory OI injection", "Lead capture form enforcement", "Feature registry context integration"],
        targetPersonas: ["Content Marketer", "Campaign Manager"],
        competitiveAngle: "Every landing page is Organization Intelligence-aware and lead-capture-optimized by default.",
      },
      {
        name: "Content Governance System",
        slug: "content-governance",
        category: "Content & Creative",
        status: "active" as const,
        description: "AI-powered governance for published content: product feature registry, page-feature coverage matrix, page health monitoring, version history, and automated content refresh recommendations. AI detects coverage gaps and suggests page updates when new features launch.",
        keyBenefits: ["Automated coverage gap detection", "AI-driven content refresh", "Feature-page mapping matrix", "Version history with rollback"],
        targetPersonas: ["Content Manager", "Product Marketing", "Marketing Operations"],
        competitiveAngle: "Self-governing content — AI monitors pages, detects gaps, and recommends updates automatically.",
      },
      {
        name: "Content Promotion Manager",
        slug: "content-promotion",
        category: "Content & Creative",
        status: "active" as const,
        description: "Campaign-linked content promotion system that generates and distributes landing pages, social media content, and promotional assets tied to campaign contexts.",
        keyBenefits: ["Campaign-linked content distribution", "Auto-generated promotional assets", "Multi-channel promotion", "Performance tracking"],
        targetPersonas: ["Campaign Manager", "Content Marketer"],
        competitiveAngle: "Content promotion integrated directly into campaign workflows — not a separate system.",
      },
      {
        name: "Brand Kits",
        slug: "brand-kits",
        category: "Content & Creative",
        status: "active" as const,
        description: "Centralized brand management with logo, color palette, typography, and style guidelines. Feeds into all AI-generated content for brand consistency.",
        keyBenefits: ["Centralized brand assets", "Auto-applied to AI content", "Client-specific brand contexts", "Design governance enforcement"],
        targetPersonas: ["Brand Manager", "Content Marketer", "Client Account Manager"],
        competitiveAngle: "Brand consistency guaranteed — AI reads and applies brand kits to every generated asset.",
      },
      {
        name: "AI Image Generation (Imagen 3)",
        slug: "ai-image-generation",
        category: "Content & Creative",
        status: "active" as const,
        description: "Google Imagen 3-powered image generation integrated into Generative Studio. Creates campaign visuals, hero images, social media graphics, and product illustrations from natural language prompts.",
        keyBenefits: ["Enterprise-grade image generation", "Campaign-specific visuals", "Multiple aspect ratios and styles", "Brand-aware generation"],
        targetPersonas: ["Content Marketer", "Designer", "Campaign Manager"],
        competitiveAngle: "Enterprise Imagen 3 — not DALL-E, but Google's production image model with safety filters.",
      },

      // ─────────────────────── DATA MANAGEMENT ───────────────────────
      {
        name: "Organization Intelligence (OI)",
        slug: "organization-intelligence",
        category: "Data Management",
        status: "active" as const,
        description: "Core data layer that stores comprehensive organization profiles: company info, products, services, competitive positioning, target market, messaging, and business context. Mandatory context for all AI operations — assertOrganizationIntelligence() enforces this system-wide.",
        keyBenefits: ["AI context foundation for all operations", "Eliminates hallucination via grounding", "Client self-service OI management", "System-wide OI enforcement"],
        targetPersonas: ["Client Account Manager", "Account Director", "Marketing Director"],
        competitiveAngle: "Every AI decision grounded in organization context — not generic, but precisely informed.",
      },
      {
        name: "Accounts & Contacts CRM",
        slug: "accounts-contacts-crm",
        category: "Data Management",
        status: "active" as const,
        description: "Full CRM system with accounts, contacts, segments, lists, and domain sets. Supports CSV import with AI-powered column mapping, enrichment jobs, LinkedIn verification, and hierarchical account management.",
        keyBenefits: ["AI-powered CSV mapping", "Account enrichment", "LinkedIn verification", "Hierarchical account management", "Segment and list management"],
        targetPersonas: ["Data Manager", "Campaign Manager", "Sales Operations"],
        competitiveAngle: "AI-assisted data management — import, clean, enrich, and segment with minimal manual effort.",
      },
      {
        name: "Unified Knowledge Hub",
        slug: "unified-knowledge-hub",
        category: "Data Management",
        status: "active" as const,
        description: "Centralized knowledge management system with knowledge blocks, vector search (Vertex AI), and semantic retrieval. Feeds contextual knowledge into agent prompts and content generation.",
        keyBenefits: ["Semantic search across knowledge base", "Auto-injected into agent context", "Knowledge block management", "Vector embeddings via Vertex AI"],
        targetPersonas: ["Knowledge Manager", "Campaign Manager", "Content Marketer"],
        competitiveAngle: "Enterprise knowledge retrieval — agents don't just have prompts, they have organizational knowledge.",
      },

      // ─────────────────────── EMAIL & COMMUNICATION ───────────────────────
      {
        name: "Email Campaign Engine",
        slug: "email-campaign-engine",
        category: "Email & Communication",
        status: "active" as const,
        description: "Full email campaign management: template builder, sequence automation, A/B testing, merge tags, send scheduling, and deliverability monitoring. Supports Brevo, Mercury, and custom SMTP providers.",
        keyBenefits: ["Visual email builder", "Sequence automation", "Multi-provider support (Brevo, Mercury, SMTP)", "Deliverability dashboard", "Merge tag personalization"],
        targetPersonas: ["Email Marketer", "Campaign Manager", "Client Account Manager"],
        competitiveAngle: "Multi-provider email with built-in deliverability intelligence — not locked to one ESP.",
      },
      {
        name: "Shared Inbox",
        slug: "shared-inbox",
        category: "Email & Communication",
        status: "active" as const,
        description: "Collaborative email inbox for client teams with thread management, assignment, and AI-powered response suggestions. Integrates with pipeline for signal extraction.",
        keyBenefits: ["Team email collaboration", "AI response suggestions", "Pipeline integration", "Thread management"],
        targetPersonas: ["Client Account Manager", "Sales Rep", "Support Team"],
        competitiveAngle: "Shared inbox that feeds pipeline intelligence — every email is a data point.",
      },
      {
        name: "Mercury Notification System",
        slug: "mercury-notifications",
        category: "Email & Communication",
        status: "active" as const,
        description: "Internal notification and transactional email system. Handles system alerts, campaign status updates, lead notifications, and administrative communications. NOT used for client campaign emails (operational rule).",
        keyBenefits: ["Real-time system notifications", "Transactional email delivery", "Campaign status alerts", "Admin communication channel"],
        targetPersonas: ["System Administrator", "Campaign Manager"],
        competitiveAngle: "Dedicated notification infrastructure — system emails never interfere with campaign deliverability.",
      },

      // ─────────────────────── LEAD INTELLIGENCE ───────────────────────
      {
        name: "Precision Lead Engine",
        slug: "precision-lead-engine",
        category: "Lead Intelligence",
        status: "active" as const,
        description: "Dual-model AI consensus engine (Kimi 128k + DeepSeek) for lead analysis. Runs parallel analysis with consensus scoring. Autopilot batch processing every 10 minutes. Dedup via unique index on dedupKey.",
        keyBenefits: ["Dual-model consensus (reduces false positives)", "128k context for deep analysis", "Autopilot batch processing", "Deduplication built-in"],
        targetPersonas: ["Sales Operations", "Campaign Manager", "Revenue Operations"],
        competitiveAngle: "Two AI models must agree — the highest-accuracy lead analysis in B2B demand gen.",
      },
      {
        name: "Qualification Bridge",
        slug: "qualification-bridge",
        category: "Lead Intelligence",
        status: "active" as const,
        description: "Closes the gap between 'potential lead detected' and 'lead created in leads table'. Multi-signal scoring: precision verdict + LQA signals + learned campaign patterns → qualify decision. Learning engine that discovers campaign-specific qualification patterns.",
        keyBenefits: ["Auto-creates leads from analysis signals", "Multi-signal scoring", "Campaign pattern learning", "Bridges post-call analysis to CRM"],
        targetPersonas: ["Sales Operations", "Campaign Manager"],
        competitiveAngle: "AI doesn't just analyze — it learns what 'qualified' means for each campaign and acts on it.",
      },
      {
        name: "AI Lead Quality Assessment (LQA)",
        slug: "ai-lead-quality-assessment",
        category: "Lead Intelligence",
        status: "active" as const,
        description: "Post-call lead quality analysis that evaluates conversation transcripts, identifies buying signals, rates lead quality, and generates follow-up recommendations.",
        keyBenefits: ["Automated lead scoring from conversations", "Buying signal detection", "Follow-up recommendation generation", "Campaign-level quality trending"],
        targetPersonas: ["Sales Operations", "Quality Analyst", "Campaign Manager"],
        competitiveAngle: "Every conversation produces a structured quality assessment — not just a disposition code.",
      },
      {
        name: "AI Account Enrichment",
        slug: "ai-account-enrichment",
        category: "Lead Intelligence",
        status: "active" as const,
        description: "AI-powered account and contact enrichment using multiple data sources and AI analysis to enhance account profiles with firmographic, technographic, and intent data.",
        keyBenefits: ["Multi-source enrichment", "Firmographic and technographic data", "Intent signal detection", "Automated enrichment jobs"],
        targetPersonas: ["Data Manager", "Sales Operations", "Account Executive"],
        competitiveAngle: "AI-enriched accounts — goes beyond basic firmographics to understand intent and technology stack.",
      },

      // ─────────────────────── ANALYTICS & REPORTING ───────────────────────
      {
        name: "Call Intelligence Dashboard",
        slug: "call-intelligence-dashboard",
        category: "Analytics & Reporting",
        status: "active" as const,
        description: "Real-time call analytics with conversation intelligence: talk-time analysis, sentiment tracking, keyword detection, objection patterns, and agent performance metrics across all campaigns.",
        keyBenefits: ["Real-time call monitoring", "Sentiment and keyword analysis", "Agent performance tracking", "Campaign-level conversation insights"],
        targetPersonas: ["Campaign Manager", "Quality Analyst", "Operations Manager"],
        competitiveAngle: "Every call analyzed in real-time — not sampled, not delayed, every single conversation.",
      },
      {
        name: "Engagement Analytics",
        slug: "engagement-analytics",
        category: "Analytics & Reporting",
        status: "active" as const,
        description: "Cross-channel engagement analytics spanning voice calls, emails, landing page visits, and pipeline interactions. Provides unified engagement scoring and attribution.",
        keyBenefits: ["Cross-channel attribution", "Unified engagement scoring", "Campaign ROI analysis", "Trend detection"],
        targetPersonas: ["Marketing Analyst", "Campaign Manager", "Revenue Operations"],
        competitiveAngle: "Unified cross-channel analytics — one score that spans voice, email, and web engagement.",
      },
      {
        name: "Agent Reports Dashboard",
        slug: "agent-reports-dashboard",
        category: "Analytics & Reporting",
        status: "active" as const,
        description: "Performance reporting for AI voice agents: call volume, success rates, conversation quality scores, disposition breakdowns, and agent-level comparison analytics.",
        keyBenefits: ["AI agent performance tracking", "Disposition analytics", "Quality score trending", "Agent comparison"],
        targetPersonas: ["Campaign Manager", "Quality Analyst", "Operations Manager"],
        competitiveAngle: "Dedicated AI agent analytics — understand how each virtual agent performs across campaigns.",
      },
      {
        name: "AI Model Governance",
        slug: "ai-model-governance",
        category: "Analytics & Reporting",
        status: "active" as const,
        description: "Tracking and governance for AI model usage across the platform: model versions, token consumption, cost tracking, performance metrics, and model selection policies.",
        keyBenefits: ["Model usage tracking", "Cost visibility", "Performance benchmarking", "Policy enforcement"],
        targetPersonas: ["Platform Engineer", "Finance", "AI Operations"],
        competitiveAngle: "Full AI cost transparency — know exactly which models serve which features and what they cost.",
      },

      // ─────────────────────── CLIENT PORTAL ───────────────────────
      {
        name: "Client Self-Service Portal",
        slug: "client-self-service-portal",
        category: "Client Portal",
        status: "active" as const,
        description: "White-label client portal with feature-gated navigation, role-based access, and comprehensive self-service capabilities. Supports Overview, Campaigns, Data Management, AI Studio, Communications, Analytics, and Account sections.",
        keyBenefits: ["Feature-gated navigation", "Role-based access control", "Client branding support", "Comprehensive self-service", "Owner/team member hierarchy"],
        targetPersonas: ["Client Account Manager", "Client Team Member", "Account Director"],
        competitiveAngle: "Enterprise client portal with AI capabilities — clients don't just view reports, they command AI agents.",
      },
      {
        name: "Preview Studio",
        slug: "preview-studio",
        category: "Client Portal",
        status: "active" as const,
        description: "Live voice agent simulation studio where clients can test and preview AI voice agent behavior before campaign launch. Includes call simulation, persona testing, and script validation.",
        keyBenefits: ["Pre-launch agent testing", "Client confidence building", "Script validation", "Persona preview"],
        targetPersonas: ["Client Account Manager", "Campaign Manager"],
        competitiveAngle: "Clients preview their AI agent before it goes live — confidence before commitment.",
      },
      {
        name: "Client Booking System",
        slug: "client-booking-system",
        category: "Client Portal",
        status: "active" as const,
        description: "Integrated booking and calendar system for scheduling meetings, demos, and follow-ups. Supports public booking pages, admin booking management, and calendar synchronization.",
        keyBenefits: ["Public booking pages", "Calendar integration", "Admin booking management", "Automated reminders"],
        targetPersonas: ["Client Account Manager", "Sales Rep", "Account Director"],
        competitiveAngle: "Booking built into the demand gen workflow — appointments flow directly from pipeline to calendar.",
      },
      {
        name: "Work Order System",
        slug: "work-order-system",
        category: "Client Portal",
        status: "active" as const,
        description: "Client-facing work order management for requesting campaigns, lead orders, and custom services. Includes order tracking, status updates, and fulfillment workflow.",
        keyBenefits: ["Structured order management", "Status tracking", "Fulfillment workflow", "Client visibility"],
        targetPersonas: ["Client Account Manager", "Operations Manager"],
        competitiveAngle: "Professional order management — clients submit, track, and receive with full transparency.",
      },

      // ─────────────────────── PLATFORM INFRASTRUCTURE ───────────────────────
      {
        name: "Multi-Model AI Router",
        slug: "multi-model-ai-router",
        category: "Platform Infrastructure",
        status: "active" as const,
        description: "Intelligent routing across AI providers: Vertex AI (Gemini 2.0 Flash, Gemini 3 Pro), OpenAI (GPT-4o, Realtime), Kimi (128k context), and DeepSeek. Includes concurrency management, cost tracking, and automatic failover.",
        keyBenefits: ["Best-model-for-task routing", "Automatic failover", "Concurrency management", "Cost optimization"],
        targetPersonas: ["Platform Engineer", "AI Operations"],
        competitiveAngle: "5+ AI models orchestrated by task type — the right model for every operation, automatically.",
      },
      {
        name: "Unified Prompt Service",
        slug: "unified-prompt-service",
        category: "Platform Infrastructure",
        status: "active" as const,
        description: "Centralized prompt management with organization-aware context injection, knowledge block integration, and version-controlled prompt templates used across all AI services.",
        keyBenefits: ["Centralized prompt management", "OI context injection", "Knowledge block integration", "Version control"],
        targetPersonas: ["AI Operations", "Platform Engineer"],
        competitiveAngle: "Every AI prompt is OI-grounded and version-controlled — systematic, not ad-hoc.",
      },
      {
        name: "QA Gate Service",
        slug: "qa-gate-service",
        category: "Platform Infrastructure",
        status: "active" as const,
        description: "Quality assurance gate that all AI-generated content passes through before delivery. Includes content registration, quality scoring, and human review workflows.",
        keyBenefits: ["AI output quality control", "Content registration and tracking", "Human review workflow", "Quality scoring"],
        targetPersonas: ["Quality Analyst", "Content Manager"],
        competitiveAngle: "AI output is not raw — every piece passes through quality governance before reaching clients.",
      },
      {
        name: "Telnyx Voice Infrastructure",
        slug: "telnyx-voice-infra",
        category: "Platform Infrastructure",
        status: "active" as const,
        description: "Production voice infrastructure via Telnyx: SIP trunking, number pool management, WebRTC, TeXML call control, call recording, and webhook-driven event processing.",
        keyBenefits: ["Production SIP trunking", "Number pool management", "Call recording", "WebRTC support", "Webhook event processing"],
        targetPersonas: ["Platform Engineer", "Voice Operations"],
        competitiveAngle: "Enterprise voice infrastructure — carrier-grade reliability with programmable call control.",
      },
      {
        name: "IAM & Client Access Management",
        slug: "iam-client-access",
        category: "Platform Infrastructure",
        status: "active" as const,
        description: "Identity and access management with role-based permissions, client account hierarchy, feature gating, team invitations, and audit logging.",
        keyBenefits: ["Role-based access control", "Feature gating per client", "Team management", "Audit logging"],
        targetPersonas: ["System Administrator", "Account Director"],
        competitiveAngle: "Enterprise-grade access control — every action is permissioned and audited.",
      },

      // ─────────────────────── INTEGRATION ───────────────────────
      {
        name: "Brevo Integration",
        slug: "brevo-integration",
        category: "Integration",
        status: "active" as const,
        description: "Deep integration with Brevo (formerly Sendinblue): email campaigns, contact sync, analytics, webhook processing, and shared template management.",
        keyBenefits: ["Bidirectional contact sync", "Campaign analytics integration", "Webhook processing", "Template sharing"],
        targetPersonas: ["Email Marketer", "Integration Engineer"],
        competitiveAngle: "Native Brevo integration — not just API calls, but deep bidirectional synchronization.",
      },
      {
        name: "Social Media Publisher",
        slug: "social-media-publisher",
        category: "Integration",
        status: "active" as const,
        description: "Multi-platform social media publishing with content scheduling, campaign-linked distribution, and performance tracking.",
        keyBenefits: ["Multi-platform publishing", "Content scheduling", "Campaign-linked distribution", "Performance tracking"],
        targetPersonas: ["Social Media Manager", "Content Marketer"],
        competitiveAngle: "Social media distribution integrated into campaign workflows — publish alongside voice and email.",
      },

      // ─────────────────────── SECURITY & GOVERNANCE ───────────────────────
      {
        name: "Content Security & Compliance",
        slug: "content-security-compliance",
        category: "Security & Governance",
        status: "active" as const,
        description: "AI safety filters, content compliance checks, GDPR data handling, telemarketing suppression lists, and audit trails across all AI-generated content and voice interactions.",
        keyBenefits: ["AI safety filtering", "GDPR compliance", "Telemarketing suppression", "Full audit trail"],
        targetPersonas: ["Compliance Officer", "System Administrator", "Legal"],
        competitiveAngle: "Enterprise compliance built-in — not an afterthought, but a core architectural principle.",
      },
      {
        name: "Finance Program & Cost Tracking",
        slug: "finance-cost-tracking",
        category: "Security & Governance",
        status: "active" as const,
        description: "Client billing management with campaign pricing, cost tracking per activity, invoice generation, and usage-based billing. Integrates AI model costs with client billing.",
        keyBenefits: ["Activity-based cost tracking", "AI cost attribution", "Automated invoicing", "Usage-based billing"],
        targetPersonas: ["Finance", "Account Director", "Operations Manager"],
        competitiveAngle: "Full cost transparency — every AI call, every email, every pipeline action has a tracked cost.",
      },
    ];

    let created = 0;
    let skipped = 0;

    for (const feature of PLATFORM_FEATURES) {
      // Check if slug already exists for this org
      const [existing] = await db
        .select({ id: productFeatures.id })
        .from(productFeatures)
        .where(and(eq(productFeatures.organizationId, organizationId), eq(productFeatures.slug, feature.slug)))
        .limit(1);

      if (existing) {
        skipped++;
        continue;
      }

      await db.insert(productFeatures).values({
        organizationId,
        name: feature.name,
        slug: feature.slug,
        description: feature.description,
        category: feature.category,
        status: feature.status,
        releaseDate: new Date(),
        keyBenefits: feature.keyBenefits,
        targetPersonas: feature.targetPersonas,
        competitiveAngle: feature.competitiveAngle,
        metadata: {},
        ownerId: userId,
        tenantId,
      });
      created++;
    }

    console.log(`[ContentGovernance] Seeded ${created} features, skipped ${skipped} existing (org=${organizationId})`);
    res.json({ created, skipped, total: PLATFORM_FEATURES.length });
  } catch (error: any) {
    return sendError(res, error, "seed platform features");
  }
});

export default router;
