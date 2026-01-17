import { Router, Request, Response } from 'express';
import { db } from '../db';
import { eq, and, desc, sql, between, isNull, gte, lte } from 'drizzle-orm';
import {
  clientBillingConfig,
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

export default router;
