import { Router, Request, Response } from 'express';
import { db } from '../db';
import { eq, and, desc, sql, between, isNull, gte, lte } from 'drizzle-orm';
import {
  clientBillingConfig,
  clientCampaignPricing,
  clientActivityCosts,
  clientInvoices,
  clientInvoiceItems,
  clientInvoiceActivity,
  clientProjects,
  verificationCampaigns,
} from '@shared/schema';
import { z } from 'zod';

const router = Router();

// ==================== COST TRACKING ====================

// Lightweight summary for dashboard widgets (back-compat with older clients)
router.get('/summary', async (req: Request, res: Response) => {
  try {
    const clientAccountId = req.clientUser!.clientAccountId;

    const startDate = new Date(new Date().getFullYear(), new Date().getMonth(), 1); // First of current month
    const endDate = new Date();

    const [totalCosts] = await db
      .select({
        total: sql<string>`COALESCE(SUM(total_cost), 0)::text`,
      })
      .from(clientActivityCosts)
      .where(
        and(
          eq(clientActivityCosts.clientAccountId, clientAccountId),
          gte(clientActivityCosts.activityDate, startDate),
          lte(clientActivityCosts.activityDate, endDate)
        )
      );

    const byType = await db
      .select({
        type: clientActivityCosts.activityType,
        total: sql<string>`SUM(total_cost)::text`,
        count: sql<number>`count(*)::int`,
      })
      .from(clientActivityCosts)
      .where(
        and(
          eq(clientActivityCosts.clientAccountId, clientAccountId),
          gte(clientActivityCosts.activityDate, startDate),
          lte(clientActivityCosts.activityDate, endDate)
        )
      )
      .groupBy(clientActivityCosts.activityType);

    const monthlyTrend = await db
      .select({
        month: sql<string>`to_char(activity_date, 'YYYY-MM')`,
        cost: sql<string>`SUM(total_cost)::text`,
      })
      .from(clientActivityCosts)
      .where(
        and(
          eq(clientActivityCosts.clientAccountId, clientAccountId),
          gte(clientActivityCosts.activityDate, new Date(Date.now() - 180 * 24 * 60 * 60 * 1000))
        )
      )
      .groupBy(sql`to_char(activity_date, 'YYYY-MM')`)
      .orderBy(sql`to_char(activity_date, 'YYYY-MM')`);

    res.json({
      totalCost: parseFloat(totalCosts?.total || '0'),
      byType: byType.map((t) => ({
        ...t,
        total: parseFloat(t.total),
      })),
      monthlyTrend: monthlyTrend.map((m) => ({
        ...m,
        cost: parseFloat(m.cost),
      })),
    });
  } catch (error) {
    console.error('[CLIENT PORTAL] Billing summary error:', error);
    res.status(500).json({ message: 'Failed to get billing summary' });
  }
});

// Get cost summary
router.get('/costs/summary', async (req: Request, res: Response) => {
  try {
    const clientAccountId = req.clientUser!.clientAccountId;

    // Get date range from query params
    const startDate = req.query.startDate
      ? new Date(req.query.startDate as string)
      : new Date(new Date().getFullYear(), new Date().getMonth(), 1); // First of current month
    const endDate = req.query.endDate
      ? new Date(req.query.endDate as string)
      : new Date();

    // Total costs for period
    const [totalCosts] = await db
      .select({
        total: sql<string>`COALESCE(SUM(total_cost), 0)::text`,
        count: sql<number>`count(*)::int`,
      })
      .from(clientActivityCosts)
      .where(
        and(
          eq(clientActivityCosts.clientAccountId, clientAccountId),
          gte(clientActivityCosts.activityDate, startDate),
          lte(clientActivityCosts.activityDate, endDate)
        )
      );

    // Uninvoiced costs
    const [uninvoiced] = await db
      .select({
        total: sql<string>`COALESCE(SUM(total_cost), 0)::text`,
        count: sql<number>`count(*)::int`,
      })
      .from(clientActivityCosts)
      .where(
        and(
          eq(clientActivityCosts.clientAccountId, clientAccountId),
          isNull(clientActivityCosts.invoiceId)
        )
      );

    // Costs by type for period
    const byType = await db
      .select({
        activityType: clientActivityCosts.activityType,
        total: sql<string>`SUM(total_cost)::text`,
        count: sql<number>`count(*)::int`,
      })
      .from(clientActivityCosts)
      .where(
        and(
          eq(clientActivityCosts.clientAccountId, clientAccountId),
          gte(clientActivityCosts.activityDate, startDate),
          lte(clientActivityCosts.activityDate, endDate)
        )
      )
      .groupBy(clientActivityCosts.activityType);

    // Monthly trend (last 6 months)
    const monthlyTrend = await db
      .select({
        month: sql<string>`to_char(activity_date, 'YYYY-MM')`,
        total: sql<string>`SUM(total_cost)::text`,
      })
      .from(clientActivityCosts)
      .where(
        and(
          eq(clientActivityCosts.clientAccountId, clientAccountId),
          gte(clientActivityCosts.activityDate, new Date(Date.now() - 180 * 24 * 60 * 60 * 1000))
        )
      )
      .groupBy(sql`to_char(activity_date, 'YYYY-MM')`)
      .orderBy(sql`to_char(activity_date, 'YYYY-MM')`);

    res.json({
      period: {
        start: startDate.toISOString(),
        end: endDate.toISOString(),
      },
      totalCost: parseFloat(totalCosts?.total || '0'),
      activityCount: totalCosts?.count || 0,
      uninvoicedTotal: parseFloat(uninvoiced?.total || '0'),
      uninvoicedCount: uninvoiced?.count || 0,
      byType: byType.map((t) => ({
        ...t,
        total: parseFloat(t.total),
      })),
      monthlyTrend: monthlyTrend.map((m) => ({
        ...m,
        total: parseFloat(m.total),
      })),
    });
  } catch (error) {
    console.error('[CLIENT PORTAL] Get cost summary error:', error);
    res.status(500).json({ message: 'Failed to get cost summary' });
  }
});

// Get costs by project
router.get('/costs/by-project', async (req: Request, res: Response) => {
  try {
    const clientAccountId = req.clientUser!.clientAccountId;

    const costsByProject = await db
      .select({
        projectId: clientActivityCosts.projectId,
        projectName: clientProjects.name,
        projectCode: clientProjects.projectCode,
        total: sql<string>`SUM(client_activity_costs.total_cost)::text`,
        count: sql<number>`count(*)::int`,
      })
      .from(clientActivityCosts)
      .leftJoin(clientProjects, eq(clientActivityCosts.projectId, clientProjects.id))
      .where(eq(clientActivityCosts.clientAccountId, clientAccountId))
      .groupBy(clientActivityCosts.projectId, clientProjects.name, clientProjects.projectCode);

    res.json(
      costsByProject.map((p) => ({
        ...p,
        total: parseFloat(p.total),
      }))
    );
  } catch (error) {
    console.error('[CLIENT PORTAL] Get costs by project error:', error);
    res.status(500).json({ message: 'Failed to get costs by project' });
  }
});

// Get costs by campaign
router.get('/costs/by-campaign', async (req: Request, res: Response) => {
  try {
    const clientAccountId = req.clientUser!.clientAccountId;

    const costsByCampaign = await db
      .select({
        campaignId: clientActivityCosts.campaignId,
        campaignName: verificationCampaigns.name,
        total: sql<string>`SUM(client_activity_costs.total_cost)::text`,
        count: sql<number>`count(*)::int`,
      })
      .from(clientActivityCosts)
      .leftJoin(verificationCampaigns, eq(clientActivityCosts.campaignId, verificationCampaigns.id))
      .where(eq(clientActivityCosts.clientAccountId, clientAccountId))
      .groupBy(clientActivityCosts.campaignId, verificationCampaigns.name);

    res.json(
      costsByCampaign.map((c) => ({
        ...c,
        total: parseFloat(c.total),
      }))
    );
  } catch (error) {
    console.error('[CLIENT PORTAL] Get costs by campaign error:', error);
    res.status(500).json({ message: 'Failed to get costs by campaign' });
  }
});

// Get recent activity costs
router.get('/costs/recent', async (req: Request, res: Response) => {
  try {
    const clientAccountId = req.clientUser!.clientAccountId;
    const limit = Math.min(parseInt(req.query.limit as string) || 50, 100);

    const recentCosts = await db
      .select({
        id: clientActivityCosts.id,
        activityType: clientActivityCosts.activityType,
        activityDate: clientActivityCosts.activityDate,
        quantity: clientActivityCosts.quantity,
        unitRate: clientActivityCosts.unitRate,
        totalCost: clientActivityCosts.totalCost,
        description: clientActivityCosts.description,
        projectId: clientActivityCosts.projectId,
        campaignId: clientActivityCosts.campaignId,
        invoiced: sql<boolean>`invoice_id IS NOT NULL`,
      })
      .from(clientActivityCosts)
      .where(eq(clientActivityCosts.clientAccountId, clientAccountId))
      .orderBy(desc(clientActivityCosts.activityDate))
      .limit(limit);

    res.json(recentCosts);
  } catch (error) {
    console.error('[CLIENT PORTAL] Get recent costs error:', error);
    res.status(500).json({ message: 'Failed to get recent costs' });
  }
});

// ==================== INVOICES ====================

// List invoices
router.get('/invoices', async (req: Request, res: Response) => {
  try {
    const clientAccountId = req.clientUser!.clientAccountId;

    const invoices = await db
      .select({
        id: clientInvoices.id,
        invoiceNumber: clientInvoices.invoiceNumber,
        billingPeriodStart: clientInvoices.billingPeriodStart,
        billingPeriodEnd: clientInvoices.billingPeriodEnd,
        subtotal: clientInvoices.subtotal,
        taxAmount: clientInvoices.taxAmount,
        totalAmount: clientInvoices.totalAmount,
        amountPaid: clientInvoices.amountPaid,
        currency: clientInvoices.currency,
        status: clientInvoices.status,
        issueDate: clientInvoices.issueDate,
        dueDate: clientInvoices.dueDate,
        paidDate: clientInvoices.paidDate,
        pdfUrl: clientInvoices.pdfUrl,
        createdAt: clientInvoices.createdAt,
      })
      .from(clientInvoices)
      .where(eq(clientInvoices.clientAccountId, clientAccountId))
      .orderBy(desc(clientInvoices.createdAt));

    res.json(
      invoices.map((inv) => ({
        ...inv,
        subtotal: parseFloat(inv.subtotal),
        taxAmount: parseFloat(inv.taxAmount || '0'),
        totalAmount: parseFloat(inv.totalAmount),
        amountPaid: parseFloat(inv.amountPaid || '0'),
        balanceDue: parseFloat(inv.totalAmount) - parseFloat(inv.amountPaid || '0'),
      }))
    );
  } catch (error) {
    console.error('[CLIENT PORTAL] List invoices error:', error);
    res.status(500).json({ message: 'Failed to list invoices' });
  }
});

// Get invoice detail
router.get('/invoices/:id', async (req: Request, res: Response) => {
  try {
    const clientAccountId = req.clientUser!.clientAccountId;
    const invoiceId = req.params.id;

    const [invoice] = await db
      .select()
      .from(clientInvoices)
      .where(
        and(
          eq(clientInvoices.id, invoiceId),
          eq(clientInvoices.clientAccountId, clientAccountId)
        )
      )
      .limit(1);

    if (!invoice) {
      return res.status(404).json({ message: 'Invoice not found' });
    }

    // Get line items
    const items = await db
      .select()
      .from(clientInvoiceItems)
      .where(eq(clientInvoiceItems.invoiceId, invoiceId))
      .orderBy(clientInvoiceItems.sortOrder);

    // Get activity log
    const activity = await db
      .select()
      .from(clientInvoiceActivity)
      .where(eq(clientInvoiceActivity.invoiceId, invoiceId))
      .orderBy(desc(clientInvoiceActivity.performedAt));

    // Log view activity
    await db.insert(clientInvoiceActivity).values({
      invoiceId,
      activityType: 'viewed',
      description: 'Invoice viewed by client',
      performedByClient: req.clientUser!.clientUserId,
    });

    res.json({
      ...invoice,
      subtotal: parseFloat(invoice.subtotal),
      taxAmount: parseFloat(invoice.taxAmount || '0'),
      discountAmount: parseFloat(invoice.discountAmount || '0'),
      totalAmount: parseFloat(invoice.totalAmount),
      amountPaid: parseFloat(invoice.amountPaid || '0'),
      items: items.map((item) => ({
        ...item,
        quantity: parseFloat(item.quantity),
        unitPrice: parseFloat(item.unitPrice),
        amount: parseFloat(item.amount),
      })),
      activity,
    });
  } catch (error) {
    console.error('[CLIENT PORTAL] Get invoice error:', error);
    res.status(500).json({ message: 'Failed to get invoice' });
  }
});

// Get invoice PDF URL
router.get('/invoices/:id/pdf', async (req: Request, res: Response) => {
  try {
    const clientAccountId = req.clientUser!.clientAccountId;
    const invoiceId = req.params.id;

    const [invoice] = await db
      .select({
        pdfUrl: clientInvoices.pdfUrl,
        invoiceNumber: clientInvoices.invoiceNumber,
      })
      .from(clientInvoices)
      .where(
        and(
          eq(clientInvoices.id, invoiceId),
          eq(clientInvoices.clientAccountId, clientAccountId)
        )
      )
      .limit(1);

    if (!invoice) {
      return res.status(404).json({ message: 'Invoice not found' });
    }

    if (!invoice.pdfUrl) {
      return res.status(404).json({ message: 'PDF not yet generated' });
    }

    // Log download
    await db.insert(clientInvoiceActivity).values({
      invoiceId,
      activityType: 'pdf_downloaded',
      description: 'Invoice PDF downloaded by client',
      performedByClient: req.clientUser!.clientUserId,
    });

    res.json({
      pdfUrl: invoice.pdfUrl,
      fileName: `${invoice.invoiceNumber}.pdf`,
    });
  } catch (error) {
    console.error('[CLIENT PORTAL] Get invoice PDF error:', error);
    res.status(500).json({ message: 'Failed to get invoice PDF' });
  }
});

// ==================== BILLING CONFIG (Read-only for clients) ====================

// Get billing config
router.get('/config', async (req: Request, res: Response) => {
  try {
    const clientAccountId = req.clientUser!.clientAccountId;

    const [config] = await db
      .select({
        defaultBillingModel: clientBillingConfig.defaultBillingModel,
        defaultRatePerLead: clientBillingConfig.defaultRatePerLead,
        defaultRatePerContact: clientBillingConfig.defaultRatePerContact,
        paymentTermsDays: clientBillingConfig.paymentTermsDays,
        currency: clientBillingConfig.currency,
        autoInvoiceEnabled: clientBillingConfig.autoInvoiceEnabled,
        invoiceDayOfMonth: clientBillingConfig.invoiceDayOfMonth,
        paymentDueDayOfMonth: clientBillingConfig.paymentDueDayOfMonth,
      })
      .from(clientBillingConfig)
      .where(eq(clientBillingConfig.clientAccountId, clientAccountId))
      .limit(1);

    if (!config) {
      return res.json({
        defaultBillingModel: 'cpl',
        defaultRatePerLead: 150,
        defaultRatePerContact: 25,
        paymentTermsDays: 30,
        currency: 'USD',
        autoInvoiceEnabled: true,
        invoiceDayOfMonth: 1,
        paymentDueDayOfMonth: null,
      });
    }

    res.json({
      ...config,
      defaultRatePerLead: parseFloat(config.defaultRatePerLead || '150'),
      defaultRatePerContact: parseFloat(config.defaultRatePerContact || '25'),
    });
  } catch (error) {
    console.error('[CLIENT PORTAL] Get billing config error:', error);
    res.status(500).json({ message: 'Failed to get billing config' });
  }
});

// ==================== CAMPAIGN PRICING ====================

// Standard campaign types with default prices
const DEFAULT_CAMPAIGN_PRICING: Record<string, { label: string; defaultPrice: number }> = {
  high_quality_leads: { label: 'HQL - High Quality Leads', defaultPrice: 150 },
  bant_leads: { label: 'BANT Qualified Leads', defaultPrice: 200 },
  sql: { label: 'SQL Generation', defaultPrice: 250 },
  appointment_generation: { label: 'Appointment Setting', defaultPrice: 350 },
  lead_qualification: { label: 'Lead Qualification', defaultPrice: 100 },
  content_syndication: { label: 'Content Syndication (CS)', defaultPrice: 75 },
  webinar_invite: { label: 'Webinar Invitation', defaultPrice: 125 },
  live_webinar: { label: 'Live Webinar Promotion', defaultPrice: 150 },
  on_demand_webinar: { label: 'On-Demand Webinar', defaultPrice: 100 },
  executive_dinner: { label: 'Executive Dinner', defaultPrice: 500 },
  leadership_forum: { label: 'Leadership Forum', defaultPrice: 400 },
  conference: { label: 'Conference/Event', defaultPrice: 175 },
  email: { label: 'Email-Only Campaign', defaultPrice: 50 },
  data_validation: { label: 'Data Validation & Enrichment', defaultPrice: 25 },
  event_registration_digital_ungated: { label: 'Event Registration - Digital (Ungated/Click)', defaultPrice: 10 },
  event_registration_digital_gated: { label: 'Event Registration - Digital (Gated)', defaultPrice: 30 },
  in_person_event: { label: 'In-Person Events Program', defaultPrice: 80 },
};

// Get campaign pricing for the current client (for order panel)
router.get('/campaign-pricing', async (req: Request, res: Response) => {
  try {
    const clientAccountId = req.clientUser!.clientAccountId;

    // Get client-specific pricing
    const clientPricing = await db
      .select()
      .from(clientCampaignPricing)
      .where(eq(clientCampaignPricing.clientAccountId, clientAccountId));

    // Create a map of client-specific pricing
    const pricingMap = new Map(clientPricing.map(p => [p.campaignType, p]));

    // Build full pricing list with client overrides or defaults
    const pricing: Record<string, {
      pricePerLead: number;
      minimumOrderSize: number;
      volumeDiscounts: any[];
      isEnabled: boolean;
      label: string;
    }> = {};

    for (const [campaignType, defaults] of Object.entries(DEFAULT_CAMPAIGN_PRICING)) {
      const clientConfig = pricingMap.get(campaignType);
      pricing[campaignType] = {
        pricePerLead: clientConfig ? parseFloat(clientConfig.pricePerLead) : defaults.defaultPrice,
        minimumOrderSize: clientConfig?.minimumOrderSize || 100,
        volumeDiscounts: (clientConfig?.volumeDiscounts as any[]) || [],
        isEnabled: clientConfig?.isEnabled ?? true,
        label: defaults.label,
      };
    }

    res.json({
      pricing,
      hasCustomPricing: clientPricing.length > 0,
    });
  } catch (error) {
    console.error('[CLIENT PORTAL] Get campaign pricing error:', error);
    res.status(500).json({ message: 'Failed to get campaign pricing' });
  }
});

// Get pricing for a specific campaign type (for calculating order totals)
router.get('/campaign-pricing/:campaignType', async (req: Request, res: Response) => {
  try {
    const clientAccountId = req.clientUser!.clientAccountId;
    const { campaignType } = req.params;

    // Check for client-specific pricing
    const [clientConfig] = await db
      .select()
      .from(clientCampaignPricing)
      .where(and(
        eq(clientCampaignPricing.clientAccountId, clientAccountId),
        eq(clientCampaignPricing.campaignType, campaignType)
      ))
      .limit(1);

    const defaults = DEFAULT_CAMPAIGN_PRICING[campaignType];

    if (!defaults && !clientConfig) {
      return res.status(404).json({ message: 'Unknown campaign type' });
    }

    const pricing = {
      campaignType,
      pricePerLead: clientConfig ? parseFloat(clientConfig.pricePerLead) : (defaults?.defaultPrice || 100),
      minimumOrderSize: clientConfig?.minimumOrderSize || 100,
      volumeDiscounts: (clientConfig?.volumeDiscounts as any[]) || [],
      isEnabled: clientConfig?.isEnabled ?? true,
      label: defaults?.label || campaignType,
    };

    res.json(pricing);
  } catch (error) {
    console.error('[CLIENT PORTAL] Get campaign type pricing error:', error);
    res.status(500).json({ message: 'Failed to get campaign pricing' });
  }
});

// Calculate total price for an order (with volume discounts)
router.post('/calculate-order-price', async (req: Request, res: Response) => {
  try {
    const clientAccountId = req.clientUser!.clientAccountId;
    const { campaignType, quantity } = req.body;

    if (!campaignType || !quantity || quantity < 1) {
      return res.status(400).json({ message: 'Campaign type and quantity are required' });
    }

    // Get client-specific pricing or defaults
    const [clientConfig] = await db
      .select()
      .from(clientCampaignPricing)
      .where(and(
        eq(clientCampaignPricing.clientAccountId, clientAccountId),
        eq(clientCampaignPricing.campaignType, campaignType)
      ))
      .limit(1);

    const defaults = DEFAULT_CAMPAIGN_PRICING[campaignType];
    const basePrice = clientConfig ? parseFloat(clientConfig.pricePerLead) : (defaults?.defaultPrice || 100);
    const minimumOrderSize = clientConfig?.minimumOrderSize || 100;
    const volumeDiscounts = (clientConfig?.volumeDiscounts as { minQuantity: number; discountPercent: number }[]) || [];

    // Check minimum order size
    if (quantity < minimumOrderSize) {
      return res.status(400).json({
        message: `Minimum order size is ${minimumOrderSize}`,
        minimumOrderSize,
      });
    }

    // Calculate discount based on volume
    let discountPercent = 0;
    for (const tier of volumeDiscounts.sort((a, b) => b.minQuantity - a.minQuantity)) {
      if (quantity >= tier.minQuantity) {
        discountPercent = tier.discountPercent;
        break;
      }
    }

    const subtotal = basePrice * quantity;
    const discount = subtotal * (discountPercent / 100);
    const total = subtotal - discount;

    res.json({
      campaignType,
      quantity,
      pricePerLead: basePrice,
      subtotal,
      discountPercent,
      discountAmount: discount,
      total,
      minimumOrderSize,
      volumeDiscounts,
    });
  } catch (error) {
    console.error('[CLIENT PORTAL] Calculate order price error:', error);
    res.status(500).json({ message: 'Failed to calculate order price' });
  }
});

export default router;
