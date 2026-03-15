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

export default router;
