import { Router } from "express";
import { db } from "../db";
import {
  contentPromotionPages,
  contentPromotionPageViews,
  leadForms,
  leadFormSubmissions,
} from "@shared/schema";
import { eq, desc, and, sql } from "drizzle-orm";
import { requireAuth } from "../auth";

const router = Router();

// ==================== Admin Endpoints (requireAuth) ====================

// List all promo pages for the tenant
router.get("/api/content-promotion/pages", requireAuth, async (req, res) => {
  try {
    const tenantId = (req as any).user?.tenantId || "default-tenant";
    const { status } = req.query;

    let conditions = [eq(contentPromotionPages.tenantId, tenantId)];

    if (status && typeof status === "string") {
      conditions.push(eq(contentPromotionPages.status, status as any));
    }

    const pages = await db
      .select()
      .from(contentPromotionPages)
      .where(and(...conditions))
      .orderBy(desc(contentPromotionPages.createdAt));

    res.json(pages);
  } catch (error: any) {
    console.error("[Content Promotion] Error listing pages:", error);
    res.status(500).json({ error: "Failed to list content promotion pages" });
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
    res.status(500).json({ error: "Failed to create content promotion page" });
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
