import { Router } from "express";
import { db } from "../db";
import {
  contentPromotionPages,
  contentPromotionPageViews,
  generativeStudioProjects,
  generativeStudioPublishedPages,
  leadForms,
  leadFormSubmissions,
  campaigns,
  clientProjects,
  clientAccounts,
  contentAssets,
} from "@shared/schema";
import { eq, desc, and, sql } from "drizzle-orm";
import { requireAuth } from "../auth";
import { generateContentPromotionPage } from "../services/ai-content-promotion";

const router = Router();

// ==================== Admin Endpoints (requireAuth) ====================

// List all promo pages for the tenant
router.get("/api/content-promotion/pages", requireAuth, async (req, res) => {
  const tenantId = (req as any).user?.tenantId || "default-tenant";
  const userId =
    (req as any).user?.id ||
    (req as any).user?.userId ||
    (req as any).user?.clientUserId;
  const { status } = req.query;
  const requestedStatus = typeof status === "string" ? status : undefined;

  try {
    // Fetch content-promotion pages from both scopes (tenant + creator) and merge.
    const sourceErrors: Array<{ source: string; message: string }> = [];

    let tenantScopedPages: any[] = [];
    if (tenantId && tenantId !== "default-tenant") {
      const tenantConditions: any[] = [eq(contentPromotionPages.tenantId, tenantId)];
      if (requestedStatus) {
        tenantConditions.push(eq(contentPromotionPages.status, requestedStatus as any));
      }
      try {
        tenantScopedPages = await db
          .select()
          .from(contentPromotionPages)
          .where(and(...tenantConditions))
          .orderBy(desc(contentPromotionPages.createdAt));
      } catch (err: any) {
        sourceErrors.push({ source: "contentPromotionPages.tenant", message: err?.message || String(err) });
      }
    }

    let userScopedPages: any[] = [];
    if (userId) {
      const userConditions: any[] = [eq(contentPromotionPages.createdBy, userId)];
      if (requestedStatus) {
        userConditions.push(eq(contentPromotionPages.status, requestedStatus as any));
      }
      try {
        userScopedPages = await db
          .select()
          .from(contentPromotionPages)
          .where(and(...userConditions))
          .orderBy(desc(contentPromotionPages.createdAt));
      } catch (err: any) {
        sourceErrors.push({ source: "contentPromotionPages.user", message: err?.message || String(err) });
      }
    }

    const pagesById = new Map<string, any>();
    for (const page of [...tenantScopedPages, ...userScopedPages]) {
      if (page?.id) pagesById.set(page.id, page);
    }
    const pages = Array.from(pagesById.values());

    // Also surface published Content Studio landing pages so both modules
    // follow the same listing route in Content Promotion manager.
    const shouldIncludeStudioPublishedPages =
      !requestedStatus || requestedStatus === "published";
    const shouldIncludeStudioDraftProjects =
      !requestedStatus || requestedStatus === "draft";

    let studioPages: any[] = [];
    if (shouldIncludeStudioPublishedPages) {
      const studioPagesById = new Map<string, any>();

      if (tenantId && tenantId !== "default-tenant") {
        try {
          const tenantStudioPages = await db
            .select()
            .from(generativeStudioPublishedPages)
            .where(
              and(
                eq(generativeStudioPublishedPages.contentType, "landing_page" as any),
                eq(generativeStudioPublishedPages.isPublished, true),
                eq(generativeStudioPublishedPages.tenantId, tenantId)
              )
            )
            .orderBy(desc(generativeStudioPublishedPages.createdAt));
          for (const page of tenantStudioPages) {
            if (page?.id) studioPagesById.set(page.id, page);
          }
        } catch (err: any) {
          sourceErrors.push({ source: "generativeStudioPublishedPages.tenant", message: err?.message || String(err) });
        }
      }

      if (userId) {
        try {
          const userStudioPages = await db
            .select()
            .from(generativeStudioPublishedPages)
            .where(
              and(
                eq(generativeStudioPublishedPages.contentType, "landing_page" as any),
                eq(generativeStudioPublishedPages.isPublished, true),
                eq(generativeStudioPublishedPages.ownerId, userId)
              )
            )
            .orderBy(desc(generativeStudioPublishedPages.createdAt));
          for (const page of userStudioPages) {
            if (page?.id) studioPagesById.set(page.id, page);
          }
        } catch (err: any) {
          sourceErrors.push({ source: "generativeStudioPublishedPages.user", message: err?.message || String(err) });
        }
      }

      studioPages = Array.from(studioPagesById.values());
    }

    let studioProjects: any[] = [];
    if (shouldIncludeStudioDraftProjects) {
      const studioProjectsById = new Map<string, any>();

      if (tenantId && tenantId !== "default-tenant") {
        try {
          const tenantStudioProjects = await db
            .select()
            .from(generativeStudioProjects)
            .where(
              and(
                eq(generativeStudioProjects.contentType, "landing_page" as any),
                eq(generativeStudioProjects.tenantId, tenantId)
              )
            )
            .orderBy(desc(generativeStudioProjects.createdAt));
          for (const project of tenantStudioProjects) {
            if (project?.id) studioProjectsById.set(project.id, project);
          }
        } catch (err: any) {
          sourceErrors.push({ source: "generativeStudioProjects.tenant", message: err?.message || String(err) });
        }
      }

      if (userId) {
        try {
          const userStudioProjects = await db
            .select()
            .from(generativeStudioProjects)
            .where(
              and(
                eq(generativeStudioProjects.contentType, "landing_page" as any),
                eq(generativeStudioProjects.ownerId, userId)
              )
            )
            .orderBy(desc(generativeStudioProjects.createdAt));
          for (const project of userStudioProjects) {
            if (project?.id) studioProjectsById.set(project.id, project);
          }
        } catch (err: any) {
          sourceErrors.push({ source: "generativeStudioProjects.user", message: err?.message || String(err) });
        }
      }

      studioProjects = Array.from(studioProjectsById.values());
    }

    const publishedProjectIds = new Set(
      studioPages
        .map((p) => p.projectId)
        .filter((v) => typeof v === "string" && v.length > 0)
    );

    const mappedStudioPages = studioPages.map((page) => ({
      id: `studio:${page.id}`,
      tenantId: page.tenantId || tenantId,
      title: page.title,
      slug: page.slug,
      pageType: "gated_download",
      status: "published",
      templateTheme: "modern_gradient",
      heroConfig: {
        headline: page.title,
        subHeadline: "",
        backgroundStyle: "gradient",
        backgroundValue: "linear-gradient(135deg, #667eea 0%, #764ba2 100%)",
      },
      assetConfig: null,
      brandingConfig: {
        primaryColor: "#7c3aed",
        accentColor: "#3b82f6",
        companyName: "",
      },
      formConfig: null,
      socialProofConfig: null,
      benefitsConfig: null,
      urgencyConfig: null,
      thankYouConfig: null,
      seoConfig: {
        metaTitle: page.metaTitle,
        metaDescription: page.metaDescription,
        ogImageUrl: page.ogImageUrl,
      },
      linkedLeadFormId: null,
      viewCount: page.viewCount || 0,
      uniqueViewCount: 0,
      submissionCount: 0,
      conversionRate: null,
      publishedAt: page.publishedAt,
      expiresAt: null,
      createdBy: page.ownerId,
      createdAt: page.createdAt,
      updatedAt: page.updatedAt,
      sourceType: "content_studio",
      sourceProjectId: page.projectId,
      previewPath: `/generative-studio/public/${page.slug}`,
    }));

    const mappedStudioProjects = studioProjects
      .filter((project) => !publishedProjectIds.has(project.id))
      .filter((project) => project.status !== "failed")
      .map((project) => ({
        id: `studio-project:${project.id}`,
        tenantId: project.tenantId || tenantId,
        title: project.title,
        slug: `studio-${typeof project.id === "string" ? project.id.slice(0, 8) : "project"}`,
        pageType: "gated_download",
        status: "draft",
        templateTheme: "modern_gradient",
        heroConfig: {
          headline: project.title,
          subHeadline: "",
          backgroundStyle: "gradient",
          backgroundValue: "linear-gradient(135deg, #667eea 0%, #764ba2 100%)",
        },
        assetConfig: null,
        brandingConfig: {
          primaryColor: "#7c3aed",
          accentColor: "#3b82f6",
          companyName: "",
        },
        formConfig: null,
        socialProofConfig: null,
        benefitsConfig: null,
        urgencyConfig: null,
        thankYouConfig: null,
        seoConfig: null,
        linkedLeadFormId: null,
        viewCount: 0,
        uniqueViewCount: 0,
        submissionCount: 0,
        conversionRate: null,
        publishedAt: null,
        expiresAt: null,
        createdBy: project.ownerId,
        createdAt: project.createdAt,
        updatedAt: project.updatedAt,
        sourceType: "content_studio",
        sourceProjectId: project.id,
        previewPath: `/generative-studio?projectId=${project.id}`,
      }));

    const unifiedPages = [...pages, ...mappedStudioPages, ...mappedStudioProjects].sort((a, b) => {
      const aTime = new Date(a.createdAt as any).getTime();
      const bTime = new Date(b.createdAt as any).getTime();
      return bTime - aTime;
    });

    if (sourceErrors.length > 0) {
      console.warn("[Content Promotion] Partial source failures while listing pages:", sourceErrors);
    }

    res.json(unifiedPages);
  } catch (error: any) {
    console.error("[Content Promotion] Error listing pages:", error);
    // Last-resort fallback: do not break page load entirely.
    try {
      const fallback = await db
        .select()
        .from(contentPromotionPages)
        .where(eq(contentPromotionPages.tenantId, tenantId))
        .orderBy(desc(contentPromotionPages.createdAt));
      return res.json(fallback);
    } catch (fallbackError: any) {
      console.error("[Content Promotion] Fallback list failed:", fallbackError);
      return res.json([]);
    }
  }
});

// Get single page with full config
router.get("/api/content-promotion/pages/:id", requireAuth, async (req, res) => {
  try {
    const [page] = await db
      .select()
      .from(contentPromotionPages)
      .where(eq(contentPromotionPages.id, req.params.id))
      .limit(1);

    if (!page) {
      return res.status(404).json({ error: "Page not found" });
    }

    res.json(page);
  } catch (error: any) {
    console.error("[Content Promotion] Error getting page:", error);
    res.status(500).json({ error: "Failed to get content promotion page" });
  }
});

// Generate landing page with AI based on campaign/project context
router.post("/api/content-promotion/pages/generate", requireAuth, async (req, res) => {
  try {
    const { campaignId, projectId, organizationId, clientId } = req.body;

    if (!campaignId && !projectId) {
      return res.status(400).json({ error: "Campaign or Project ID is required for AI generation" });
    }

    // ---- Gather context from DB ----
    let campaignData: any = null;
    let projectData: any = null;
    let clientData: any = null;
    let assetData: any[] = [];

    if (campaignId) {
      const [c] = await db.select().from(campaigns).where(eq(campaigns.id, campaignId)).limit(1);
      campaignData = c || null;
      // If campaign has a project, fetch it
      if (c?.projectId && !projectId) {
        const [p] = await db.select().from(clientProjects).where(eq(clientProjects.id, c.projectId)).limit(1);
        projectData = p || null;
      }
      // Fetch linked content assets (PDFs, docs)
      const assets = await db.execute(sql`
        SELECT id, asset_type, title, description, content, target_audience, cta_goal, tags, file_url
        FROM content_assets
        WHERE ${campaignId} = ANY(linked_campaigns)
        LIMIT 5
      `);
      assetData = (assets.rows as any[]) || [];
    }

    if (projectId && !projectData) {
      const [p] = await db.select().from(clientProjects).where(eq(clientProjects.id, projectId)).limit(1);
      projectData = p || null;
    }

    const clientAccountId = clientId || campaignData?.clientAccountId || projectData?.clientAccountId;
    if (clientAccountId && !clientData) {
      const [ca] = await db.select().from(clientAccounts).where(eq(clientAccounts.id, clientAccountId)).limit(1);
      clientData = ca || null;
    }

    // Build context object for AI
    const context = {
      campaignName: campaignData?.name || null,
      campaignObjective: campaignData?.campaignObjective || null,
      productServiceInfo: campaignData?.productServiceInfo || null,
      targetAudienceDescription: campaignData?.targetAudienceDescription || null,
      talkingPoints: campaignData?.talkingPoints || null,
      successCriteria: campaignData?.successCriteria || null,
      campaignContextBrief: campaignData?.campaignContextBrief || null,
      callScript: campaignData?.callScript || null,
      emailSubject: campaignData?.emailSubject || null,
      projectName: projectData?.name || null,
      projectDescription: projectData?.description || null,
      companyName: clientData?.companyName || clientData?.name || null,
      assets: assetData.map((a: any) => ({
        title: a.title,
        description: a.description,
        type: a.asset_type,
        targetAudience: a.target_audience,
        ctaGoal: a.cta_goal,
        content: a.content ? String(a.content).substring(0, 3000) : null,
      })),
    };

    const result = await generateContentPromotionPage(context);

    res.json(result);
  } catch (error: any) {
    console.error("[Content Promotion] Error generating with AI:", error);
    res.status(500).json({ error: error.message || "Failed to generate with AI" });
  }
});

// Create new page
router.post("/api/content-promotion/pages", requireAuth, async (req, res) => {
  try {
    const tenantId = (req as any).user?.tenantId || "default-tenant";
    const createdBy = (req as any).user?.userId || (req as any).user?.id;
    const body = req.body;

    // Auto-generate slug from title if not provided
    let slug = body.slug;
    if (!slug && body.title) {
      slug =
        body.title
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, "-")
          .replace(/(^-|-$)/g, "") +
        "-" +
        Date.now().toString(36);
    }

    // Validate slug format
    if (!slug || !/^[a-z0-9-]{3,100}$/.test(slug)) {
      return res.status(400).json({
        error:
          "Slug must be lowercase, only a-z, 0-9, hyphens, between 3-100 characters",
      });
    }

    // Check slug uniqueness
    const [existing] = await db
      .select({ id: contentPromotionPages.id })
      .from(contentPromotionPages)
      .where(eq(contentPromotionPages.slug, slug))
      .limit(1);

    if (existing) {
      return res.status(409).json({ error: "A page with this slug already exists" });
    }

    const [page] = await db
      .insert(contentPromotionPages)
      .values({
        ...body,
        slug,
        tenantId,
        createdBy,
      } as any)
      .returning();

    res.json(page);
  } catch (error: any) {
    console.error("[Content Promotion] Error creating page:", error);
    const detail = error?.message || error?.detail || "Unknown database error";
    // Surface actionable info: missing table, enum, constraint violations
    if (detail.includes("does not exist") || detail.includes("relation")) {
      res.status(500).json({ error: `Database table or type missing — run migrations. Detail: ${detail}` });
    } else if (detail.includes("violates") || detail.includes("constraint")) {
      res.status(400).json({ error: `Validation error: ${detail}` });
    } else {
      res.status(500).json({ error: `Failed to create content promotion page: ${detail}` });
    }
  }
});

// Update page config
router.put("/api/content-promotion/pages/:id", requireAuth, async (req, res) => {
  try {
    const { id, createdAt, updatedAt, tenantId, createdBy, ...updateData } = req.body;

    // If slug is being changed, validate uniqueness
    if (updateData.slug) {
      if (!/^[a-z0-9-]{3,100}$/.test(updateData.slug)) {
        return res.status(400).json({
          error:
            "Slug must be lowercase, only a-z, 0-9, hyphens, between 3-100 characters",
        });
      }

      const [existing] = await db
        .select({ id: contentPromotionPages.id })
        .from(contentPromotionPages)
        .where(
          and(
            eq(contentPromotionPages.slug, updateData.slug),
            sql`${contentPromotionPages.id} != ${req.params.id}`
          )
        )
        .limit(1);

      if (existing) {
        return res.status(409).json({ error: "A page with this slug already exists" });
      }
    }

    const [page] = await db
      .update(contentPromotionPages)
      .set({ ...updateData, updatedAt: new Date() })
      .where(eq(contentPromotionPages.id, req.params.id))
      .returning();

    if (!page) {
      return res.status(404).json({ error: "Page not found" });
    }

    res.json(page);
  } catch (error: any) {
    console.error("[Content Promotion] Error updating page:", error);
    res.status(500).json({ error: "Failed to update content promotion page" });
  }
});

// Delete (archive) page
router.delete("/api/content-promotion/pages/:id", requireAuth, async (req, res) => {
  try {
    const [page] = await db
      .update(contentPromotionPages)
      .set({ status: "archived" as any, updatedAt: new Date() })
      .where(eq(contentPromotionPages.id, req.params.id))
      .returning();

    if (!page) {
      return res.status(404).json({ error: "Page not found" });
    }

    res.json({ success: true });
  } catch (error: any) {
    console.error("[Content Promotion] Error archiving page:", error);
    res.status(500).json({ error: "Failed to archive content promotion page" });
  }
});

// Publish page
router.post("/api/content-promotion/pages/:id/publish", requireAuth, async (req, res) => {
  try {
    const [page] = await db
      .update(contentPromotionPages)
      .set({
        status: "published" as any,
        publishedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(contentPromotionPages.id, req.params.id))
      .returning();

    if (!page) {
      return res.status(404).json({ error: "Page not found" });
    }

    res.json(page);
  } catch (error: any) {
    console.error("[Content Promotion] Error publishing page:", error);
    res.status(500).json({ error: "Failed to publish content promotion page" });
  }
});

// Unpublish page
router.post("/api/content-promotion/pages/:id/unpublish", requireAuth, async (req, res) => {
  try {
    const [page] = await db
      .update(contentPromotionPages)
      .set({
        status: "draft" as any,
        updatedAt: new Date(),
      })
      .where(eq(contentPromotionPages.id, req.params.id))
      .returning();

    if (!page) {
      return res.status(404).json({ error: "Page not found" });
    }

    res.json(page);
  } catch (error: any) {
    console.error("[Content Promotion] Error unpublishing page:", error);
    res.status(500).json({ error: "Failed to unpublish content promotion page" });
  }
});

// Duplicate page
router.post("/api/content-promotion/pages/:id/duplicate", requireAuth, async (req, res) => {
  try {
    const tenantId = (req as any).user?.tenantId || "default-tenant";
    const createdBy = (req as any).user?.userId || (req as any).user?.id;

    // Read the original page
    const [original] = await db
      .select()
      .from(contentPromotionPages)
      .where(eq(contentPromotionPages.id, req.params.id))
      .limit(1);

    if (!original) {
      return res.status(404).json({ error: "Page not found" });
    }

    const newSlug = `${original.slug}-copy-${Date.now().toString(36)}`;

    const [page] = await db
      .insert(contentPromotionPages)
      .values({
        tenantId,
        title: `Copy of ${original.title}`,
        slug: newSlug,
        pageType: original.pageType,
        status: "draft" as any,
        templateTheme: original.templateTheme,
        heroConfig: original.heroConfig,
        assetConfig: original.assetConfig,
        brandingConfig: original.brandingConfig,
        formConfig: original.formConfig,
        socialProofConfig: original.socialProofConfig,
        benefitsConfig: original.benefitsConfig,
        urgencyConfig: original.urgencyConfig,
        thankYouConfig: original.thankYouConfig,
        seoConfig: original.seoConfig,
        linkedLeadFormId: original.linkedLeadFormId,
        viewCount: 0,
        uniqueViewCount: 0,
        submissionCount: 0,
        conversionRate: "0",
        createdBy,
      } as any)
      .returning();

    res.json(page);
  } catch (error: any) {
    console.error("[Content Promotion] Error duplicating page:", error);
    res.status(500).json({ error: "Failed to duplicate content promotion page" });
  }
});

// Get analytics summary
router.get("/api/content-promotion/pages/:id/analytics", requireAuth, async (req, res) => {
  try {
    const { id } = req.params;

    // Get the page record for counters
    const [page] = await db
      .select({
        viewCount: contentPromotionPages.viewCount,
        submissionCount: contentPromotionPages.submissionCount,
        conversionRate: contentPromotionPages.conversionRate,
      })
      .from(contentPromotionPages)
      .where(eq(contentPromotionPages.id, id))
      .limit(1);

    if (!page) {
      return res.status(404).json({ error: "Page not found" });
    }

    // Get total views, unique views, submissions from page views table
    const [viewStats] = await db
      .select({
        totalViews: sql<number>`count(*)::int`,
        uniqueViews: sql<number>`count(distinct ${contentPromotionPageViews.visitorEmail})::int`,
        submissions: sql<number>`count(*) filter (where ${contentPromotionPageViews.eventType} = 'form_submit')::int`,
      })
      .from(contentPromotionPageViews)
      .where(eq(contentPromotionPageViews.pageId, id));

    // UTM breakdown
    const utmBreakdown = await db
      .select({
        utmSource: contentPromotionPageViews.utmSource,
        utmCampaign: contentPromotionPageViews.utmCampaign,
        count: sql<number>`count(*)::int`,
      })
      .from(contentPromotionPageViews)
      .where(
        and(
          eq(contentPromotionPageViews.pageId, id),
          sql`${contentPromotionPageViews.utmSource} IS NOT NULL`
        )
      )
      .groupBy(
        contentPromotionPageViews.utmSource,
        contentPromotionPageViews.utmCampaign
      );

    res.json({
      viewCount: page.viewCount,
      submissionCount: page.submissionCount,
      conversionRate: page.conversionRate,
      detailed: {
        totalViews: viewStats?.totalViews || 0,
        uniqueViews: viewStats?.uniqueViews || 0,
        submissions: viewStats?.submissions || 0,
      },
      utmBreakdown,
    });
  } catch (error: any) {
    console.error("[Content Promotion] Error getting analytics:", error);
    res.status(500).json({ error: "Failed to get analytics" });
  }
});

// ==================== Public Endpoints (NO auth) ====================

// Fetch page config by slug (public)
router.get("/api/public/promo/:slug", async (req, res) => {
  try {
    const { slug } = req.params;

    const [page] = await db
      .select()
      .from(contentPromotionPages)
      .where(
        and(
          eq(contentPromotionPages.slug, slug),
          eq(contentPromotionPages.status, "published" as any)
        )
      )
      .limit(1);

    if (!page) {
      return res.status(404).json({ error: "Page not found" });
    }

    // Check expiration
    if (page.expiresAt && new Date(page.expiresAt) < new Date()) {
      return res.status(404).json({ error: "This page has expired" });
    }

    // Increment viewCount atomically
    await db
      .update(contentPromotionPages)
      .set({
        viewCount: sql`${contentPromotionPages.viewCount} + 1`,
      } as any)
      .where(eq(contentPromotionPages.id, page.id));

    // Extract UTM params
    const utmSource = (req.query.utm_source as string) || null;
    const utmMedium = (req.query.utm_medium as string) || null;
    const utmCampaign = (req.query.utm_campaign as string) || null;
    const utmTerm = (req.query.utm_term as string) || null;
    const utmContent = (req.query.utm_content as string) || null;

    // Extract visitor info
    const visitorEmail = (req.query.email as string) || null;
    const visitorFirstName = (req.query.firstName as string) || null;
    const visitorLastName = (req.query.lastName as string) || null;
    const visitorCompany = (req.query.company as string) || null;

    // Store IP, userAgent, referrer
    const ipAddress =
      (req.headers["x-forwarded-for"] as string)?.split(",")[0] ||
      req.socket.remoteAddress ||
      null;
    const userAgent = req.headers["user-agent"] || null;
    const referrer = req.headers.referer || null;

    // Record page view
    await db.insert(contentPromotionPageViews).values({
      pageId: page.id,
      visitorEmail,
      visitorFirstName,
      visitorLastName,
      visitorCompany,
      ipAddress,
      userAgent,
      referrer,
      utmSource,
      utmMedium,
      utmCampaign,
      utmTerm,
      utmContent,
      eventType: "view",
    } as any);

    res.json(page);
  } catch (error: any) {
    console.error("[Content Promotion] Error fetching public page:", error);
    res.status(500).json({ error: "Failed to fetch page" });
  }
});

// Form submission (public)
router.post("/api/public/promo/:slug/submit", async (req, res) => {
  try {
    const { slug } = req.params;

    const [page] = await db
      .select()
      .from(contentPromotionPages)
      .where(
        and(
          eq(contentPromotionPages.slug, slug),
          eq(contentPromotionPages.status, "published" as any)
        )
      )
      .limit(1);

    if (!page) {
      return res.status(404).json({ error: "Page not found" });
    }

    const submissionData = req.body;
    const submitterEmail =
      submissionData.email || submissionData.submitterEmail || null;
    const submitterName =
      submissionData.name || submissionData.submitterName || null;
    const companyName =
      submissionData.company || submissionData.companyName || null;
    const jobTitle =
      submissionData.jobTitle || submissionData.title || null;

    const ipAddress =
      (req.headers["x-forwarded-for"] as string)?.split(",")[0] ||
      req.socket.remoteAddress ||
      null;
    const userAgent = req.headers["user-agent"] || null;

    // If page has a linked lead form, create a lead form submission
    if (page.linkedLeadFormId) {
      const [linkedForm] = await db
        .select()
        .from(leadForms)
        .where(eq(leadForms.id, page.linkedLeadFormId))
        .limit(1);

      if (linkedForm) {
        await db.insert(leadFormSubmissions).values({
          formId: linkedForm.id,
          submitterEmail: submitterEmail || "unknown@unknown.com",
          submitterName,
          companyName,
          jobTitle,
          formData: submissionData,
          ipAddress,
          userAgent,
          sourceUrl: submissionData.sourceUrl || req.headers.referer || null,
          processed: false,
        } as any);
      }
    }

    // Record form_submit event in page views
    await db.insert(contentPromotionPageViews).values({
      pageId: page.id,
      visitorEmail: submitterEmail,
      visitorFirstName: submissionData.firstName || null,
      visitorLastName: submissionData.lastName || null,
      visitorCompany: companyName,
      ipAddress,
      userAgent,
      referrer: req.headers.referer || null,
      utmSource: submissionData.utm_source || null,
      utmMedium: submissionData.utm_medium || null,
      utmCampaign: submissionData.utm_campaign || null,
      utmTerm: submissionData.utm_term || null,
      utmContent: submissionData.utm_content || null,
      eventType: "form_submit",
      formData: submissionData,
      convertedAt: new Date(),
    } as any);

    // Increment submissionCount atomically and update conversionRate
    await db
      .update(contentPromotionPages)
      .set({
        submissionCount: sql`${contentPromotionPages.submissionCount} + 1`,
        conversionRate: sql`CASE WHEN ${contentPromotionPages.viewCount} > 0 THEN (${contentPromotionPages.submissionCount}::numeric / ${contentPromotionPages.viewCount} * 100) ELSE 0 END`,
        updatedAt: new Date(),
      } as any)
      .where(eq(contentPromotionPages.id, page.id));

    res.json({
      success: true,
      thankYouConfig: page.thankYouConfig,
      assetUrl: (page.assetConfig as any)?.fileUrl || null,
    });
  } catch (error: any) {
    console.error("[Content Promotion] Error submitting form:", error);
    res.status(500).json({ error: "Failed to submit form" });
  }
});

// Lightweight event tracking (public)
router.post("/api/public/promo/:slug/track", async (req, res) => {
  try {
    const { slug } = req.params;
    const {
      eventType,
      scrollDepthPercent,
      timeOnPageMs,
      formData,
      utm_source,
      utm_medium,
      utm_campaign,
      utm_term,
      utm_content,
      email,
      firstName,
      lastName,
      company,
    } = req.body;

    // Look up page by slug to get the page ID
    const [page] = await db
      .select({ id: contentPromotionPages.id })
      .from(contentPromotionPages)
      .where(
        and(
          eq(contentPromotionPages.slug, slug),
          eq(contentPromotionPages.status, "published" as any)
        )
      )
      .limit(1);

    if (!page) {
      return res.status(404).json({ error: "Page not found" });
    }

    const ipAddress =
      (req.headers["x-forwarded-for"] as string)?.split(",")[0] ||
      req.socket.remoteAddress ||
      null;
    const userAgent = req.headers["user-agent"] || null;
    const referrer = req.headers.referer || null;

    await db.insert(contentPromotionPageViews).values({
      pageId: page.id,
      visitorEmail: email || null,
      visitorFirstName: firstName || null,
      visitorLastName: lastName || null,
      visitorCompany: company || null,
      ipAddress,
      userAgent,
      referrer,
      utmSource: utm_source || null,
      utmMedium: utm_medium || null,
      utmCampaign: utm_campaign || null,
      utmTerm: utm_term || null,
      utmContent: utm_content || null,
      eventType: eventType || "track",
      scrollDepthPercent: scrollDepthPercent || null,
      timeOnPageMs: timeOnPageMs || null,
      formData: formData || null,
    } as any);

    res.json({ success: true });
  } catch (error: any) {
    console.error("[Content Promotion] Error tracking event:", error);
    res.status(500).json({ error: "Failed to track event" });
  }
});

export default router;
