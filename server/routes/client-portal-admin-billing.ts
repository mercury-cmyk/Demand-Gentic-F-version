import { Router, Request, Response } from 'express';
import { randomUUID } from 'crypto';
import { db } from '../db';
import { eq, and, desc, sql, isNull, gte, lte, inArray } from 'drizzle-orm';
import {
  clientAccounts,
  clientBillingConfig,
  clientCampaignPricing,
  clientPricingDocuments,
  clientActivityCosts,
  clientInvoices,
  clientInvoiceItems,
  clientInvoiceActivity,
  clientProjects,
  clientBusinessProfiles,
  verificationCampaigns,
  workOrders,
  campaigns,
  leads,
} from '@shared/schema';
import { requireAuth, requireRole } from '../auth';
import { z } from 'zod';

const router = Router();

// All routes require admin auth
router.use(requireAuth);
router.use(requireRole('admin', 'campaign_manager'));

// List all client accounts
// Note: GET /clients and GET /clients/:clientId are handled by main client-portal.ts admin routes
// (which include richer data: users, campaigns, regularCampaigns). Do NOT duplicate them here.

// ==================== BILLING CONFIGURATION ====================

// Get billing config for a client
router.get('/clients/:clientId/billing', async (req: Request, res: Response) => {
  try {
    const { clientId } = req.params;

    const [config] = await db
      .select()
      .from(clientBillingConfig)
      .where(eq(clientBillingConfig.clientAccountId, clientId))
      .limit(1);

    if (!config) {
      // Return defaults
      return res.json({
        clientAccountId: clientId,
        defaultBillingModel: 'cpl',
        defaultRatePerLead: '150.00',
        defaultRatePerContact: '25.00',
        defaultRatePerCallMinute: '0.15',
        defaultRatePerEmail: '0.02',
        paymentTermsDays: 30,
        currency: 'USD',
        autoInvoiceEnabled: true,
        invoiceDayOfMonth: 1,
        paymentDueDayOfMonth: null,
        taxExempt: false,
        taxRate: '0',
      });
    }

    res.json(config);
  } catch (error) {
    console.error('[ADMIN] Get billing config error:', error);
    res.status(500).json({ message: 'Failed to get billing config' });
  }
});

// Create/Update billing config
const billingConfigSchema = z.object({
  defaultBillingModel: z.enum(['cpl', 'cpc', 'monthly_retainer', 'hybrid']).optional(),
  defaultRatePerLead: z.number().min(0).optional(),
  defaultRatePerContact: z.number().min(0).optional(),
  defaultRatePerCallMinute: z.number().min(0).optional(),
  defaultRatePerEmail: z.number().min(0).optional(),
  monthlyRetainerAmount: z.number().min(0).optional(),
  retainerIncludesLeads: z.number().int().min(0).optional(),
  overageRatePerLead: z.number().min(0).optional(),
  paymentTermsDays: z.number().int().min(1).max(90).optional(),
  currency: z.string().length(3).optional(),
  billingEmail: z.string().email().optional().nullable(),
  billingAddress: z.any().optional(),
  taxExempt: z.boolean().optional(),
  taxId: z.string().optional().nullable(),
  taxRate: z.number().min(0).max(1).optional(),
  autoInvoiceEnabled: z.boolean().optional(),
  invoiceDayOfMonth: z.number().int().min(1).max(28).optional(),
  paymentDueDayOfMonth: z.number().int().min(1).max(28).optional().nullable(),
});

router.put('/clients/:clientId/billing', async (req: Request, res: Response) => {
  try {
    const { clientId } = req.params;
    const data = billingConfigSchema.parse(req.body);

    // Check if config exists
    const [existing] = await db
      .select({ id: clientBillingConfig.id })
      .from(clientBillingConfig)
      .where(eq(clientBillingConfig.clientAccountId, clientId))
      .limit(1);

    const updateData = {
      ...(data.defaultBillingModel && { defaultBillingModel: data.defaultBillingModel }),
      ...(data.defaultRatePerLead !== undefined && { defaultRatePerLead: data.defaultRatePerLead.toString() }),
      ...(data.defaultRatePerContact !== undefined && { defaultRatePerContact: data.defaultRatePerContact.toString() }),
      ...(data.defaultRatePerCallMinute !== undefined && { defaultRatePerCallMinute: data.defaultRatePerCallMinute.toString() }),
      ...(data.defaultRatePerEmail !== undefined && { defaultRatePerEmail: data.defaultRatePerEmail.toString() }),
      ...(data.monthlyRetainerAmount !== undefined && { monthlyRetainerAmount: data.monthlyRetainerAmount.toString() }),
      ...(data.retainerIncludesLeads !== undefined && { retainerIncludesLeads: data.retainerIncludesLeads }),
      ...(data.overageRatePerLead !== undefined && { overageRatePerLead: data.overageRatePerLead.toString() }),
      ...(data.paymentTermsDays !== undefined && { paymentTermsDays: data.paymentTermsDays }),
      ...(data.currency && { currency: data.currency }),
      ...(data.billingEmail !== undefined && { billingEmail: data.billingEmail }),
      ...(data.billingAddress !== undefined && { billingAddress: data.billingAddress }),
      ...(data.taxExempt !== undefined && { taxExempt: data.taxExempt }),
      ...(data.taxId !== undefined && { taxId: data.taxId }),
      ...(data.taxRate !== undefined && { taxRate: data.taxRate.toString() }),
      ...(data.autoInvoiceEnabled !== undefined && { autoInvoiceEnabled: data.autoInvoiceEnabled }),
      ...(data.invoiceDayOfMonth !== undefined && { invoiceDayOfMonth: data.invoiceDayOfMonth }),
      ...(data.paymentDueDayOfMonth !== undefined && { paymentDueDayOfMonth: data.paymentDueDayOfMonth }),
      updatedAt: new Date(),
    };

    if (existing) {
      const [updated] = await db
        .update(clientBillingConfig)
        .set(updateData)
        .where(eq(clientBillingConfig.clientAccountId, clientId))
        .returning();
      res.json(updated);
    } else {
      const [created] = await db
        .insert(clientBillingConfig)
        .values({
          clientAccountId: clientId,
          ...updateData,
        })
        .returning();
      res.status(201).json(created);
    }
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ message: 'Validation error', errors: error.errors });
    }
    console.error('[ADMIN] Update billing config error:', error);
    res.status(500).json({ message: 'Failed to update billing config' });
  }
});

// ==================== INVOICE MANAGEMENT ====================

// List all invoices (optionally filter by client)
router.get('/invoices', async (req: Request, res: Response) => {
  try {
    const { clientId, status } = req.query;

    let query = db
      .select({
        invoice: clientInvoices,
        client: clientAccounts,
      })
      .from(clientInvoices)
      .innerJoin(clientAccounts, eq(clientInvoices.clientAccountId, clientAccounts.id));

    const conditions = [];
    if (clientId) {
      conditions.push(eq(clientInvoices.clientAccountId, clientId as string));
    }
    if (status) {
      conditions.push(eq(clientInvoices.status, status as any));
    }

    const invoices = await query
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .orderBy(desc(clientInvoices.createdAt));

    res.json(
      invoices.map(({ invoice, client }) => ({
        ...invoice,
        clientName: client.name,
        subtotal: parseFloat(invoice.subtotal),
        taxAmount: parseFloat(invoice.taxAmount || '0'),
        discountAmount: parseFloat(invoice.discountAmount || '0'),
        totalAmount: parseFloat(invoice.totalAmount),
        amountPaid: parseFloat(invoice.amountPaid || '0'),
      }))
    );
  } catch (error) {
    console.error('[ADMIN] List invoices error:', error);
    res.status(500).json({ message: 'Failed to list invoices' });
  }
});

// Get invoice detail
router.get('/invoices/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const [result] = await db
      .select({
        invoice: clientInvoices,
        client: clientAccounts,
      })
      .from(clientInvoices)
      .innerJoin(clientAccounts, eq(clientInvoices.clientAccountId, clientAccounts.id))
      .where(eq(clientInvoices.id, id))
      .limit(1);

    if (!result) {
      return res.status(404).json({ message: 'Invoice not found' });
    }

    // Get client business profile for address
    const [businessProfile] = await db
      .select()
      .from(clientBusinessProfiles)
      .where(eq(clientBusinessProfiles.clientAccountId, result.invoice.clientAccountId))
      .limit(1);

    // Get billing config for billing address fallback
    const [billingConfig] = await db
      .select()
      .from(clientBillingConfig)
      .where(eq(clientBillingConfig.clientAccountId, result.invoice.clientAccountId))
      .limit(1);

    // Build client address string
    let clientAddress = '';
    if (businessProfile?.addressLine1) {
      const parts = [businessProfile.addressLine1];
      if (businessProfile.addressLine2) parts.push(businessProfile.addressLine2);
      const cityStateZip = [businessProfile.city, businessProfile.state, businessProfile.postalCode].filter(Boolean).join(', ');
      if (cityStateZip) parts.push(cityStateZip);
      if (businessProfile.country && businessProfile.country !== 'United States') parts.push(businessProfile.country);
      clientAddress = parts.join('\n');
    } else if (billingConfig?.billingAddress) {
      const addr = billingConfig.billingAddress as Record<string, string>;
      const parts = [addr.line1 || addr.street || addr.address];
      if (addr.line2) parts.push(addr.line2);
      const cityStateZip = [addr.city, addr.state, addr.zip || addr.postalCode].filter(Boolean).join(', ');
      if (cityStateZip) parts.push(cityStateZip);
      clientAddress = parts.filter(Boolean).join('\n');
    }

    // Get line items
    const items = await db
      .select()
      .from(clientInvoiceItems)
      .where(eq(clientInvoiceItems.invoiceId, id))
      .orderBy(clientInvoiceItems.sortOrder);

    // Get activity log
    const activity = await db
      .select()
      .from(clientInvoiceActivity)
      .where(eq(clientInvoiceActivity.invoiceId, id))
      .orderBy(desc(clientInvoiceActivity.performedAt));

    res.json({
      ...result.invoice,
      clientName: result.client.name,
      clientCompany: result.client.companyName,
      clientEmail: result.client.contactEmail,
      clientPhone: result.client.contactPhone,
      clientAddress,
      subtotal: parseFloat(result.invoice.subtotal),
      taxAmount: parseFloat(result.invoice.taxAmount || '0'),
      discountAmount: parseFloat(result.invoice.discountAmount || '0'),
      totalAmount: parseFloat(result.invoice.totalAmount),
      amountPaid: parseFloat(result.invoice.amountPaid || '0'),
      items: items.map((item) => ({
        ...item,
        quantity: parseFloat(item.quantity),
        unitPrice: parseFloat(item.unitPrice),
        amount: parseFloat(item.amount),
      })),
      activity,
    });
  } catch (error) {
    console.error('[ADMIN] Get invoice error:', error);
    res.status(500).json({ message: 'Failed to get invoice' });
  }
});

// Create invoice
const createInvoiceSchema = z.object({
  clientAccountId: z.string().min(1),
  billingPeriodStart: z.string(),
  billingPeriodEnd: z.string(),
  dueDate: z.string().optional(),
  invoiceNumber: z.string().optional(),
  projectId: z.string().optional(),
  items: z.array(z.object({
    description: z.string(),
    itemType: z.string(),
    quantity: z.number(),
    unitPrice: z.number(),
    projectId: z.string().optional(),
    campaignId: z.string().optional(),
  })),
  notes: z.string().optional(),
  discountAmount: z.number().optional(),
});

router.post('/invoices', async (req: Request, res: Response) => {
  try {
    const data = createInvoiceSchema.parse(req.body);

    // Get billing config for tax rate
    const [config] = await db
      .select()
      .from(clientBillingConfig)
      .where(eq(clientBillingConfig.clientAccountId, data.clientAccountId))
      .limit(1);

    const taxRate = config?.taxExempt ? 0 : parseFloat(config?.taxRate || '0');
    const currency = config?.currency || 'USD';
    const paymentTerms = config?.paymentTermsDays || 30;

    // Calculate totals
    const subtotal = data.items.reduce((sum, item) => sum + item.quantity * item.unitPrice, 0);
    const discountAmount = data.discountAmount || 0;
    const taxableAmount = subtotal - discountAmount;
    const taxAmount = taxableAmount * taxRate;
    const totalAmount = taxableAmount + taxAmount;

    // Generate or use custom invoice number
    let invoiceNumber: string;
    if (data.invoiceNumber !== undefined) {
      // "0" means no number shown on invoice — store a unique placeholder to satisfy the unique constraint
      invoiceNumber = data.invoiceNumber === '0' ? `NOINV-${randomUUID()}` : data.invoiceNumber;
    } else {
      const year = new Date().getFullYear();
      const [lastInvoice] = await db
        .select({ invoiceNumber: clientInvoices.invoiceNumber })
        .from(clientInvoices)
        .where(sql`invoice_number LIKE ${'INV-' + year + '-%'}`)
        .orderBy(desc(clientInvoices.invoiceNumber))
        .limit(1);

      let seqNum = 1;
      if (lastInvoice?.invoiceNumber) {
        const match = lastInvoice.invoiceNumber.match(/INV-\d{4}-(\d+)/);
        if (match) {
          seqNum = parseInt(match[1]) + 1;
        }
      }
      invoiceNumber = `INV-${year}-${String(seqNum).padStart(4, '0')}`;
    }

    const issueDate = new Date();
    let dueDate: Date;
    if (data.dueDate) {
      dueDate = new Date(data.dueDate);
    } else if (config?.paymentDueDayOfMonth) {
      const refDate = data.billingPeriodEnd ? new Date(data.billingPeriodEnd) : issueDate;
      const nextMonth = refDate.getMonth() + 1;
      dueDate = new Date(refDate.getFullYear(), nextMonth, config.paymentDueDayOfMonth);
    } else {
      dueDate = new Date(issueDate);
      dueDate.setDate(dueDate.getDate() + paymentTerms);
    }

    // Verify client exists
    const [clientExists] = await db
      .select({ id: clientAccounts.id })
      .from(clientAccounts)
      .where(eq(clientAccounts.id, data.clientAccountId))
      .limit(1);

    if (!clientExists) {
      return res.status(400).json({ message: `Client account not found: ${data.clientAccountId}` });
    }

    if (data.items.length === 0) {
      return res.status(400).json({ message: 'Invoice must have at least one line item' });
    }

    // Create invoice
    const [invoice] = await db
      .insert(clientInvoices)
      .values({
        clientAccountId: data.clientAccountId,
        invoiceNumber,
        billingPeriodStart: data.billingPeriodStart,
        billingPeriodEnd: data.billingPeriodEnd,
        subtotal: subtotal.toFixed(2),
        taxAmount: taxAmount.toFixed(2),
        discountAmount: discountAmount.toFixed(2),
        totalAmount: totalAmount.toFixed(2),
        currency,
        status: 'draft',
        issueDate: issueDate.toISOString().split('T')[0],
        dueDate: dueDate.toISOString().split('T')[0],
        notes: data.notes,
        createdBy: req.user!.userId,
      })
      .returning();

    // Create line items
    await db.insert(clientInvoiceItems).values(
      data.items.map((item, idx) => ({
        invoiceId: invoice.id,
        description: item.description,
        itemType: item.itemType,
        quantity: item.quantity.toString(),
        unitPrice: item.unitPrice.toFixed(4),
        amount: (item.quantity * item.unitPrice).toFixed(2),
        projectId: item.projectId || null,
        campaignId: item.campaignId || null,
        periodStart: data.billingPeriodStart,
        periodEnd: data.billingPeriodEnd,
        sortOrder: idx,
      }))
    );

    // Log creation
    await db.insert(clientInvoiceActivity).values({
      invoiceId: invoice.id,
      activityType: 'created',
      description: 'Invoice created',
      performedBy: req.user!.userId,
    });

    res.status(201).json(invoice);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ message: 'Validation error', errors: error.errors });
    }
    const errMsg = error instanceof Error ? error.message : String(error);
    console.error('[ADMIN] Create invoice error:', errMsg, error);
    // Check for unique constraint violation on invoice number
    if (errMsg.includes('unique') || errMsg.includes('duplicate') || errMsg.includes('23505')) {
      return res.status(409).json({ message: 'Invoice number already exists. Please use a different number.' });
    }
    res.status(500).json({ message: `Failed to create invoice: ${errMsg}` });
  }
});

// Update invoice status
router.patch('/invoices/:id/status', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { status } = req.body;

    const validStatuses = ['draft', 'pending', 'sent', 'paid', 'overdue', 'void', 'disputed'];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({ message: 'Invalid status' });
    }

    const updates: any = { status, updatedAt: new Date() };

    if (status === 'sent') {
      updates.sentBy = req.user!.userId;
      updates.sentAt = new Date();
    } else if (status === 'paid') {
      updates.paidDate = new Date().toISOString().split('T')[0];
    }

    const [updated] = await db
      .update(clientInvoices)
      .set(updates)
      .where(eq(clientInvoices.id, id))
      .returning();

    if (!updated) {
      return res.status(404).json({ message: 'Invoice not found' });
    }

    // Log status change
    await db.insert(clientInvoiceActivity).values({
      invoiceId: id,
      activityType: 'status_changed',
      description: `Status changed to ${status}`,
      performedBy: req.user!.userId,
    });

    res.json(updated);
  } catch (error) {
    console.error('[ADMIN] Update invoice status error:', error);
    res.status(500).json({ message: 'Failed to update invoice status' });
  }
});

// Record payment
router.post('/invoices/:id/payment', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { amount, paymentMethod, paymentReference } = req.body;

    if (!amount || amount <= 0) {
      return res.status(400).json({ message: 'Valid amount is required' });
    }

    const [invoice] = await db
      .select()
      .from(clientInvoices)
      .where(eq(clientInvoices.id, id))
      .limit(1);

    if (!invoice) {
      return res.status(404).json({ message: 'Invoice not found' });
    }

    const currentPaid = parseFloat(invoice.amountPaid || '0');
    const newPaid = currentPaid + amount;
    const total = parseFloat(invoice.totalAmount);

    const updates: any = {
      amountPaid: newPaid.toFixed(2),
      paymentMethod,
      paymentReference,
      updatedAt: new Date(),
    };

    if (newPaid >= total) {
      updates.status = 'paid';
      updates.paidDate = new Date().toISOString().split('T')[0];
    }

    const [updated] = await db
      .update(clientInvoices)
      .set(updates)
      .where(eq(clientInvoices.id, id))
      .returning();

    // Log payment
    await db.insert(clientInvoiceActivity).values({
      invoiceId: id,
      activityType: 'payment_received',
      description: `Payment of $${amount.toFixed(2)} received via ${paymentMethod || 'unknown'}`,
      performedBy: req.user!.userId,
    });

    res.json(updated);
  } catch (error) {
    console.error('[ADMIN] Record payment error:', error);
    res.status(500).json({ message: 'Failed to record payment' });
  }
});

// Get next suggested invoice number
router.get('/next-invoice-number', async (req: Request, res: Response) => {
  try {
    const year = new Date().getFullYear();
    const [lastInvoice] = await db
      .select({ invoiceNumber: clientInvoices.invoiceNumber })
      .from(clientInvoices)
      .where(sql`invoice_number LIKE ${'INV-' + year + '-%'}`)
      .orderBy(desc(clientInvoices.invoiceNumber))
      .limit(1);

    let seqNum = 1;
    if (lastInvoice?.invoiceNumber) {
      const match = lastInvoice.invoiceNumber.match(/INV-\d{4}-(\d+)/);
      if (match) {
        seqNum = parseInt(match[1]) + 1;
      }
    }
    const nextNumber = `INV-${year}-${String(seqNum).padStart(4, '0')}`;
    res.json({ nextNumber, lastNumber: lastInvoice?.invoiceNumber || null });
  } catch (error) {
    console.error('[ADMIN] Get next invoice number error:', error);
    res.status(500).json({ message: 'Failed to get next invoice number' });
  }
});

// Generate invoice from uninvoiced costs
router.post('/clients/:clientId/generate-invoice', async (req: Request, res: Response) => {
  try {
    const { clientId } = req.params;
    const { periodStart, periodEnd, invoiceNumber: customInvoiceNumber, projectId } = req.body;

    if (!periodStart || !periodEnd) {
      return res.status(400).json({ message: 'Period start and end dates are required' });
    }

    // Get uninvoiced costs for the period (optionally filtered by project)
    const costConditions = [
      eq(clientActivityCosts.clientAccountId, clientId),
      isNull(clientActivityCosts.invoiceId),
      gte(clientActivityCosts.activityDate, new Date(periodStart)),
      lte(clientActivityCosts.activityDate, new Date(periodEnd)),
    ];
    if (projectId) {
      costConditions.push(eq(clientActivityCosts.projectId, projectId));
    }
    const costs = await db
      .select()
      .from(clientActivityCosts)
      .where(and(...costConditions));

    // Get billing config early (needed by both paths)
    const [config] = await db
      .select()
      .from(clientBillingConfig)
      .where(eq(clientBillingConfig.clientAccountId, clientId))
      .limit(1);

    let items: Array<{ description: string; itemType: string; quantity: number; unitPrice: number; campaignId?: string }>;
    let subtotal: number;
    let costIdsToMark: string[] = [];

    if (costs.length > 0) {
      // ====== PATH A: Use pre-recorded activity costs ======
      const grouped = costs.reduce((acc, cost) => {
        const key = cost.activityType;
        if (!acc[key]) {
          acc[key] = { quantity: 0, total: 0 };
        }
        acc[key].quantity += parseFloat(cost.quantity);
        acc[key].total += parseFloat(cost.totalCost);
        return acc;
      }, {} as Record<string, { quantity: number; total: number }>);

      const activityLabels: Record<string, string> = {
        lead_delivered: 'Leads Delivered',
        contact_verified: 'Contacts Verified',
        ai_call_minute: 'AI Call Minutes',
        email_sent: 'Emails Sent',
        retainer_fee: 'Monthly Retainer',
      };

      items = Object.entries(grouped).map(([type, data]) => ({
        description: activityLabels[type] || type,
        itemType: type,
        quantity: data.quantity,
        unitPrice: data.total / data.quantity,
      }));

      subtotal = Object.values(grouped).reduce((sum, g) => sum + g.total, 0);
      costIdsToMark = costs.map((c) => c.id);
    } else {
      // ====== PATH B: Fall back to delivered leads from campaigns ======
      // Find campaigns linked to this client (and optionally to the selected project)
      const campaignConditions = [
        eq(campaigns.clientAccountId, clientId),
      ];
      if (projectId) {
        campaignConditions.push(eq(campaigns.projectId, projectId));
      }
      const clientCampaigns = await db
        .select({ id: campaigns.id, type: campaigns.type, name: campaigns.name, costPerLead: campaigns.costPerLead })
        .from(campaigns)
        .where(and(...campaignConditions));

      if (clientCampaigns.length === 0) {
        return res.status(400).json({ message: 'No campaigns found for this client/project' });
      }

      // Count delivered leads per campaign within the billing period
      const campaignIds = clientCampaigns.map((c) => c.id);
      const deliveredLeads = await db
        .select({
          campaignId: leads.campaignId,
          count: sql<number>`count(*)::int`,
        })
        .from(leads)
        .where(
          and(
            inArray(leads.campaignId, campaignIds),
            sql`${leads.qaStatus} IN ('approved', 'published')`,
            gte(leads.createdAt, new Date(periodStart)),
            lte(leads.createdAt, new Date(periodEnd)),
            isNull(leads.deletedAt),
          )
        )
        .groupBy(leads.campaignId);

      if (deliveredLeads.length === 0) {
        return res.status(400).json({ message: 'No delivered leads found for this period. Use Manual Invoice to create a custom invoice.' });
      }

      // Get client campaign pricing for rate lookups
      const pricingRecords = await db
        .select()
        .from(clientCampaignPricing)
        .where(eq(clientCampaignPricing.clientAccountId, clientId));

      // Get project rate override if available
      let projectRate: number | null = null;
      if (projectId) {
        const [proj] = await db
          .select({ ratePerLead: clientProjects.ratePerLead })
          .from(clientProjects)
          .where(eq(clientProjects.id, projectId))
          .limit(1);
        if (proj?.ratePerLead) {
          projectRate = parseFloat(proj.ratePerLead);
        }
      }

      const pricingMap = new Map(pricingRecords.map((p) => [p.campaignType, parseFloat(p.pricePerLead)]));
      const campaignMap = new Map(clientCampaigns.map((c) => [c.id, c]));

      // Default pricing by campaign type
      const defaultRates: Record<string, number> = {
        content_syndication: 25, high_quality_leads: 150, bant_leads: 175,
        appointment_setting: 200, intent_data: 35, email_campaign: 15,
        abm_campaign: 100, webinar_leads: 50, ai_calling: 20,
      };

      items = deliveredLeads.map((dl) => {
        const camp = campaignMap.get(dl.campaignId!);
        const campType = camp?.type || 'leads';
        const campName = camp?.name || campType;

        // Price priority: project rate > campaign costPerLead > client campaign pricing > default
        let unitPrice = projectRate
          || (camp?.costPerLead ? parseFloat(camp.costPerLead) : null)
          || pricingMap.get(campType)
          || defaultRates[campType]
          || 25;

        return {
          description: `${campName} — Delivered Leads`,
          itemType: 'lead_delivered',
          quantity: dl.count,
          unitPrice,
          campaignId: dl.campaignId || undefined,
        };
      });

      subtotal = items.reduce((sum, item) => sum + item.quantity * item.unitPrice, 0);
    }

    const taxRate = config?.taxExempt ? 0 : parseFloat(config?.taxRate || '0');
    const taxAmount = subtotal * taxRate;
    const totalAmount = subtotal + taxAmount;

    // Generate or use custom invoice number
    let invoiceNumber: string;
    if (customInvoiceNumber !== undefined) {
      // "0" means no number shown on invoice — store a unique placeholder to satisfy the unique constraint
      invoiceNumber = customInvoiceNumber === '0' ? `NOINV-${randomUUID()}` : customInvoiceNumber;
    } else {
      const year = new Date().getFullYear();
      const [lastInvoice] = await db
        .select({ invoiceNumber: clientInvoices.invoiceNumber })
        .from(clientInvoices)
        .where(sql`invoice_number LIKE ${'INV-' + year + '-%'}`)
        .orderBy(desc(clientInvoices.invoiceNumber))
        .limit(1);

      let seqNum = 1;
      if (lastInvoice?.invoiceNumber) {
        const match = lastInvoice.invoiceNumber.match(/INV-\d{4}-(\d+)/);
        if (match) {
          seqNum = parseInt(match[1]) + 1;
        }
      }
      invoiceNumber = `INV-${year}-${String(seqNum).padStart(4, '0')}`;
    }

    const paymentTerms = config?.paymentTermsDays || 30;
    const issueDate = new Date();
    let dueDate: Date;
    if (config?.paymentDueDayOfMonth) {
      const refDate = new Date(periodEnd);
      const nextMonth = refDate.getMonth() + 1;
      dueDate = new Date(refDate.getFullYear(), nextMonth, config.paymentDueDayOfMonth);
    } else {
      dueDate = new Date(issueDate);
      dueDate.setDate(dueDate.getDate() + paymentTerms);
    }

    // Create invoice
    const [invoice] = await db
      .insert(clientInvoices)
      .values({
        clientAccountId: clientId,
        invoiceNumber,
        billingPeriodStart: periodStart,
        billingPeriodEnd: periodEnd,
        subtotal: subtotal.toFixed(2),
        taxAmount: taxAmount.toFixed(2),
        totalAmount: totalAmount.toFixed(2),
        currency: config?.currency || 'USD',
        status: 'draft',
        issueDate: issueDate.toISOString().split('T')[0],
        dueDate: dueDate.toISOString().split('T')[0],
        createdBy: req.user!.userId,
      })
      .returning();

    // Create line items
    await db.insert(clientInvoiceItems).values(
      items.map((item, idx) => ({
        invoiceId: invoice.id,
        description: item.description,
        itemType: item.itemType,
        quantity: item.quantity.toString(),
        unitPrice: item.unitPrice.toFixed(4),
        amount: (item.quantity * item.unitPrice).toFixed(2),
        campaignId: item.campaignId || undefined,
        periodStart,
        periodEnd,
        sortOrder: idx,
      }))
    );

    // Update pre-recorded activity costs with invoice reference (only if using Path A)
    if (costIdsToMark.length > 0) {
      await db
        .update(clientActivityCosts)
        .set({ invoiceId: invoice.id, invoicedAt: new Date() })
        .where(inArray(clientActivityCosts.id, costIdsToMark));
    }

    // Log creation
    const source = costIdsToMark.length > 0
      ? `Invoice auto-generated from ${costIdsToMark.length} activity costs`
      : `Invoice auto-generated from ${items.reduce((s, i) => s + i.quantity, 0)} delivered leads across ${items.length} campaign(s)`;
    await db.insert(clientInvoiceActivity).values({
      invoiceId: invoice.id,
      activityType: 'created',
      description: source,
      performedBy: req.user!.userId,
    });

    res.status(201).json({
      invoice,
      costsIncluded: costs.length,
      subtotal,
      totalAmount,
    });
  } catch (error) {
    const errMsg = error instanceof Error ? error.message : String(error);
    console.error('[ADMIN] Generate invoice error:', errMsg, error);
    if (errMsg.includes('unique') || errMsg.includes('duplicate') || errMsg.includes('23505')) {
      return res.status(409).json({ message: 'Invoice number already exists. Please use a different number.' });
    }
    res.status(500).json({ message: `Failed to generate invoice: ${errMsg}` });
  }
});

// Get uninvoiced costs summary for a client
router.get('/clients/:clientId/uninvoiced-costs', async (req: Request, res: Response) => {
  try {
    const { clientId } = req.params;

    const costs = await db
      .select({
        activityType: clientActivityCosts.activityType,
        total: sql<string>`SUM(total_cost)::text`,
        count: sql<number>`count(*)::int`,
        minDate: sql<string>`MIN(activity_date)::text`,
        maxDate: sql<string>`MAX(activity_date)::text`,
      })
      .from(clientActivityCosts)
      .where(
        and(
          eq(clientActivityCosts.clientAccountId, clientId),
          isNull(clientActivityCosts.invoiceId)
        )
      )
      .groupBy(clientActivityCosts.activityType);

    const totalUninvoiced = costs.reduce((sum, c) => sum + parseFloat(c.total), 0);

    res.json({
      totalUninvoiced,
      byType: costs.map((c) => ({
        ...c,
        total: parseFloat(c.total),
      })),
    });
  } catch (error) {
    console.error('[ADMIN] Get uninvoiced costs error:', error);
    res.status(500).json({ message: 'Failed to get uninvoiced costs' });
  }
});

// ==================== DELETE INVOICE ====================

router.delete('/invoices/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const [existing] = await db
      .select()
      .from(clientInvoices)
      .where(eq(clientInvoices.id, id))
      .limit(1);

    if (!existing) {
      return res.status(404).json({ message: 'Invoice not found' });
    }

    if (existing.status !== 'draft' && existing.status !== 'pending') {
      return res.status(400).json({ message: 'Only draft or pending invoices can be deleted' });
    }

    // Un-link any activity costs that were tied to this invoice
    await db
      .update(clientActivityCosts)
      .set({ invoiceId: null })
      .where(eq(clientActivityCosts.invoiceId, id));

    // Delete line items, activity records, then the invoice
    await db.delete(clientInvoiceItems).where(eq(clientInvoiceItems.invoiceId, id));
    await db.delete(clientInvoiceActivity).where(eq(clientInvoiceActivity.invoiceId, id));
    await db.delete(clientInvoices).where(eq(clientInvoices.id, id));

    res.json({ message: 'Invoice deleted' });
  } catch (error) {
    console.error('[ADMIN] Delete invoice error:', error);
    res.status(500).json({ message: 'Failed to delete invoice' });
  }
});

// ==================== UPDATE INVOICE ====================

const updateInvoiceSchema = z.object({
  billingPeriodStart: z.string().optional(),
  billingPeriodEnd: z.string().optional(),
  dueDate: z.string().optional().nullable(),
  invoiceNumber: z.string().optional(),
  items: z.array(z.object({
    description: z.string(),
    itemType: z.string(),
    quantity: z.number(),
    unitPrice: z.number(),
    projectId: z.string().uuid().optional().nullable(),
    campaignId: z.string().uuid().optional().nullable(),
  })).optional(),
  notes: z.string().optional().nullable(),
  discountAmount: z.number().optional(),
});

router.patch('/invoices/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const data = updateInvoiceSchema.parse(req.body);

    const [existing] = await db
      .select()
      .from(clientInvoices)
      .where(eq(clientInvoices.id, id))
      .limit(1);

    if (!existing) {
      return res.status(404).json({ message: 'Invoice not found' });
    }

    if (existing.status !== 'draft' && existing.status !== 'pending') {
      return res.status(400).json({ message: 'Only draft or pending invoices can be edited' });
    }

    const updates: any = { updatedAt: new Date() };
    if (data.billingPeriodStart) updates.billingPeriodStart = data.billingPeriodStart;
    if (data.billingPeriodEnd) updates.billingPeriodEnd = data.billingPeriodEnd;
    if (data.dueDate !== undefined) updates.dueDate = data.dueDate;
    if (data.invoiceNumber) updates.invoiceNumber = data.invoiceNumber;
    if (data.notes !== undefined) updates.notes = data.notes;

    // Recalculate totals if items are provided
    if (data.items) {
      const [config] = await db
        .select()
        .from(clientBillingConfig)
        .where(eq(clientBillingConfig.clientAccountId, existing.clientAccountId))
        .limit(1);

      const taxRate = config?.taxExempt ? 0 : parseFloat(config?.taxRate || '0');
      const subtotal = data.items.reduce((sum, item) => sum + item.quantity * item.unitPrice, 0);
      const discountAmount = data.discountAmount ?? parseFloat(existing.discountAmount || '0');
      const taxableAmount = subtotal - discountAmount;
      const taxAmount = taxableAmount * taxRate;
      const totalAmount = taxableAmount + taxAmount;

      updates.subtotal = subtotal.toFixed(2);
      updates.discountAmount = discountAmount.toFixed(2);
      updates.taxAmount = taxAmount.toFixed(2);
      updates.totalAmount = totalAmount.toFixed(2);

      // Replace line items
      await db.delete(clientInvoiceItems).where(eq(clientInvoiceItems.invoiceId, id));
      if (data.items.length > 0) {
        await db.insert(clientInvoiceItems).values(
          data.items.map((item, idx) => ({
            invoiceId: id,
            description: item.description,
            itemType: item.itemType,
            quantity: item.quantity.toString(),
            unitPrice: item.unitPrice.toFixed(4),
            amount: (item.quantity * item.unitPrice).toFixed(2),
            projectId: item.projectId,
            campaignId: item.campaignId,
            sortOrder: idx,
          }))
        );
      }
    } else if (data.discountAmount !== undefined) {
      const subtotal = parseFloat(existing.subtotal);
      const [config] = await db
        .select()
        .from(clientBillingConfig)
        .where(eq(clientBillingConfig.clientAccountId, existing.clientAccountId))
        .limit(1);
      const taxRate = config?.taxExempt ? 0 : parseFloat(config?.taxRate || '0');
      const taxableAmount = subtotal - data.discountAmount;
      const taxAmount = taxableAmount * taxRate;
      updates.discountAmount = data.discountAmount.toFixed(2);
      updates.taxAmount = taxAmount.toFixed(2);
      updates.totalAmount = (taxableAmount + taxAmount).toFixed(2);
    }

    const [updated] = await db
      .update(clientInvoices)
      .set(updates)
      .where(eq(clientInvoices.id, id))
      .returning();

    await db.insert(clientInvoiceActivity).values({
      invoiceId: id,
      activityType: 'updated',
      description: 'Invoice updated',
      performedBy: req.user!.userId,
    });

    res.json(updated);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ message: 'Validation error', errors: error.errors });
    }
    console.error('[ADMIN] Update invoice error:', error);
    res.status(500).json({ message: 'Failed to update invoice' });
  }
});

// ==================== SEND INVOICE VIA EMAIL ====================

router.post('/invoices/:id/send', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { recipientEmail, message } = req.body;

    if (!recipientEmail) {
      return res.status(400).json({ message: 'Recipient email is required' });
    }

    // Fetch invoice + client
    const [result] = await db
      .select({ invoice: clientInvoices, client: clientAccounts })
      .from(clientInvoices)
      .innerJoin(clientAccounts, eq(clientInvoices.clientAccountId, clientAccounts.id))
      .where(eq(clientInvoices.id, id))
      .limit(1);

    if (!result) {
      return res.status(404).json({ message: 'Invoice not found' });
    }

    const { invoice, client } = result;

    // Fetch line items
    const items = await db
      .select()
      .from(clientInvoiceItems)
      .where(eq(clientInvoiceItems.invoiceId, id))
      .orderBy(clientInvoiceItems.sortOrder);

    const subtotal = parseFloat(invoice.subtotal);
    const tax = parseFloat(invoice.taxAmount || '0');
    const discount = parseFloat(invoice.discountAmount || '0');
    const total = parseFloat(invoice.totalAmount);

    // Build HTML email with inline styles
    const itemRows = items.map((item) =>
      `<tr>
        <td style="padding:8px;border-bottom:1px solid #e5e7eb">${item.description}</td>
        <td style="padding:8px;border-bottom:1px solid #e5e7eb;text-align:right">${parseFloat(item.quantity).toLocaleString()}</td>
        <td style="padding:8px;border-bottom:1px solid #e5e7eb;text-align:right">$${parseFloat(item.unitPrice).toFixed(2)}</td>
        <td style="padding:8px;border-bottom:1px solid #e5e7eb;text-align:right;font-weight:600">$${parseFloat(item.amount).toFixed(2)}</td>
      </tr>`
    ).join('');

    const customMessage = message
      ? `<p style="margin-bottom:16px;color:#374151">${message.replace(/</g, '&lt;').replace(/>/g, '&gt;')}</p>`
      : '';

    const showInvoiceNumber = invoice.invoiceNumber && invoice.invoiceNumber !== '0' && !invoice.invoiceNumber.startsWith('NOINV-');
    const invoiceLabel = showInvoiceNumber ? `Invoice ${invoice.invoiceNumber}` : 'Invoice';
    const emailSubjectNumber = showInvoiceNumber ? ` ${invoice.invoiceNumber}` : '';

    const html = `
      <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;color:#1f2937">
        <div style="background:#f9fafb;padding:24px;border-radius:8px;margin-bottom:24px">
          <h1 style="margin:0 0 4px;font-size:20px;color:#111827">Pivotal B2B LLC</h1>
          <p style="margin:0;color:#6b7280;font-size:13px">16192 Coastal Highway, Lewes, DE 19958, USA</p>
        </div>
        ${customMessage}
        <h2 style="font-size:16px;color:#111827;margin-bottom:8px">${invoiceLabel}</h2>
        <table style="width:100%;margin-bottom:16px;font-size:13px;color:#6b7280">
          <tr><td>Issue Date:</td><td style="text-align:right">${invoice.issueDate || '—'}</td></tr>
          <tr><td>Due Date:</td><td style="text-align:right">${invoice.dueDate || '—'}</td></tr>
          <tr><td>Billing Period:</td><td style="text-align:right">${invoice.billingPeriodStart} to ${invoice.billingPeriodEnd}</td></tr>
        </table>
        <table style="width:100%;border-collapse:collapse;font-size:13px;margin-bottom:16px">
          <thead>
            <tr style="background:#f3f4f6">
              <th style="padding:8px;text-align:left;font-size:11px;text-transform:uppercase;color:#6b7280">Description</th>
              <th style="padding:8px;text-align:right;font-size:11px;text-transform:uppercase;color:#6b7280">Qty</th>
              <th style="padding:8px;text-align:right;font-size:11px;text-transform:uppercase;color:#6b7280">Unit Price</th>
              <th style="padding:8px;text-align:right;font-size:11px;text-transform:uppercase;color:#6b7280">Amount</th>
            </tr>
          </thead>
          <tbody>${itemRows}</tbody>
        </table>
        <table style="width:250px;margin-left:auto;font-size:13px">
          <tr><td style="color:#6b7280;padding:4px 0">Subtotal</td><td style="text-align:right;padding:4px 0">$${subtotal.toFixed(2)}</td></tr>
          ${discount > 0 ? `<tr><td style="color:#6b7280;padding:4px 0">Discount</td><td style="text-align:right;padding:4px 0">-$${discount.toFixed(2)}</td></tr>` : ''}
          ${tax > 0 ? `<tr><td style="color:#6b7280;padding:4px 0">Tax</td><td style="text-align:right;padding:4px 0">$${tax.toFixed(2)}</td></tr>` : ''}
          <tr style="border-top:2px solid #111827"><td style="font-weight:bold;padding:8px 0;font-size:15px">Total Due</td><td style="text-align:right;font-weight:bold;padding:8px 0;font-size:15px">$${total.toFixed(2)}</td></tr>
        </table>
        <div style="margin-top:24px;padding:16px;background:#eff6ff;border:1px solid #bfdbfe;border-radius:8px;font-size:12px;color:#1e40af">
          <p style="margin:0 0 8px;font-weight:bold">Wire Transfer Details (USD)</p>
          <table style="font-size:12px;color:#1e40af">
            <tr><td style="padding:2px 12px 2px 0">SWIFT/BIC:</td><td style="font-family:monospace">CHFGUS44021</td></tr>
            <tr><td style="padding:2px 12px 2px 0">ABA Routing:</td><td style="font-family:monospace">091311229</td></tr>
            <tr><td style="padding:2px 12px 2px 0">Bank:</td><td>Choice Financial Group</td></tr>
            <tr><td style="padding:2px 12px 2px 0">Account:</td><td style="font-family:monospace">202556901478</td></tr>
            <tr><td style="padding:2px 12px 2px 0">Beneficiary:</td><td>Pivotal B2B LLC</td></tr>
          </table>
        </div>
        <p style="margin-top:24px;font-size:11px;color:#9ca3af;text-align:center">
          Thank you for your business.${showInvoiceNumber ? ' Please include the invoice number in the wire reference.' : ''}
        </p>
      </div>
    `;

    // Try to send via Mercury email service
    try {
      const { MercuryEmailService } = await import('../services/mercury/email-service');
      const emailService = new MercuryEmailService();
      const sendResult = await emailService.sendDirect({
        to: recipientEmail,
        subject: `Invoice${emailSubjectNumber} from Pivotal B2B LLC`,
        html,
        fromName: 'Pivotal B2B Billing',
        fromEmail: 'mercury@pivotal-b2b.com',
      });

      if (!sendResult.success) {
        console.warn('[ADMIN] Invoice email send failed via Mercury:', sendResult.error);
        return res.status(500).json({ message: `Email send failed: ${sendResult.error}` });
      }
    } catch (emailError: any) {
      console.error('[ADMIN] Invoice email error:', emailError.message);
      return res.status(500).json({ message: 'Failed to send email. Check SMTP configuration.' });
    }

    // Update invoice status to sent
    const [updated] = await db
      .update(clientInvoices)
      .set({
        status: 'sent',
        sentBy: req.user!.userId,
        sentAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(clientInvoices.id, id))
      .returning();

    await db.insert(clientInvoiceActivity).values({
      invoiceId: id,
      activityType: 'sent',
      description: `Invoice emailed to ${recipientEmail}`,
      performedBy: req.user!.userId,
    });

    res.json({ success: true, invoice: updated });
  } catch (error) {
    console.error('[ADMIN] Send invoice error:', error);
    res.status(500).json({ message: 'Failed to send invoice' });
  }
});

// ==================== CLIENT CAMPAIGN PRICING ====================

// Standard campaign types for reference
const CAMPAIGN_TYPES = [
  { value: 'high_quality_leads', label: 'HQL - High Quality Leads', defaultPrice: 150 },
  { value: 'bant_leads', label: 'BANT Qualified Leads', defaultPrice: 200 },
  { value: 'sql', label: 'SQL Generation', defaultPrice: 250 },
  { value: 'appointment_generation', label: 'Appointment Setting', defaultPrice: 350 },
  { value: 'lead_qualification', label: 'Lead Qualification', defaultPrice: 100 },
  { value: 'content_syndication', label: 'Content Syndication (CS)', defaultPrice: 75 },
  { value: 'webinar_invite', label: 'Webinar Invitation', defaultPrice: 125 },
  { value: 'live_webinar', label: 'Live Webinar Promotion', defaultPrice: 150 },
  { value: 'on_demand_webinar', label: 'On-Demand Webinar', defaultPrice: 100 },
  { value: 'executive_dinner', label: 'Executive Dinner', defaultPrice: 500 },
  { value: 'leadership_forum', label: 'Leadership Forum', defaultPrice: 400 },
  { value: 'conference', label: 'Conference/Event', defaultPrice: 175 },
  { value: 'email', label: 'Email-Only Campaign', defaultPrice: 50 },
  { value: 'data_validation', label: 'Data Validation & Enrichment', defaultPrice: 25 },
  { value: 'event_registration_digital_ungated', label: 'Event Registration - Digital (Ungated/Click)', defaultPrice: 10 },
  { value: 'event_registration_digital_gated', label: 'Event Registration - Digital (Gated)', defaultPrice: 30 },
  { value: 'in_person_event', label: 'In-Person Events Program', defaultPrice: 80 },
];

// Get all campaign pricing for a client
router.get('/clients/:clientId/campaign-pricing', async (req: Request, res: Response) => {
  try {
    const { clientId } = req.params;

    // Get existing pricing configurations for this client
    const existingPricing = await db
      .select()
      .from(clientCampaignPricing)
      .where(eq(clientCampaignPricing.clientAccountId, clientId))
      .orderBy(clientCampaignPricing.campaignType);

    // Create a map of existing pricing
    const pricingMap = new Map(existingPricing.map(p => [p.campaignType, p]));

    // Merge with all campaign types to show complete list
    const fullPricingList = CAMPAIGN_TYPES.map(type => {
      const existing = pricingMap.get(type.value);
      return {
        campaignType: type.value,
        label: type.label,
        pricePerLead: existing?.pricePerLead || type.defaultPrice.toFixed(2),
        minimumOrderSize: existing?.minimumOrderSize || 100,
        volumeDiscounts: existing?.volumeDiscounts || [],
        isEnabled: existing?.isEnabled ?? true,
        notes: existing?.notes || null,
        isConfigured: !!existing,
        id: existing?.id || null,
      };
    });

    res.json({
      clientId,
      pricing: fullPricingList,
      configuredCount: existingPricing.length,
      totalCampaignTypes: CAMPAIGN_TYPES.length,
    });
  } catch (error) {
    console.error('[ADMIN] Get campaign pricing error:', error);
    res.status(500).json({ message: 'Failed to get campaign pricing' });
  }
});

// Update or create pricing for a specific campaign type
router.put('/clients/:clientId/campaign-pricing/:campaignType', async (req: Request, res: Response) => {
  try {
    const { clientId, campaignType } = req.params;

    const pricingSchema = z.object({
      pricePerLead: z.string().or(z.number()).transform(val => String(val)),
      minimumOrderSize: z.number().int().min(1).optional().default(100),
      volumeDiscounts: z.array(z.object({
        minQuantity: z.number().int().min(1),
        discountPercent: z.number().min(0).max(100),
      })).optional().default([]),
      isEnabled: z.boolean().optional().default(true),
      notes: z.string().optional().nullable(),
    });

    const validatedData = pricingSchema.parse(req.body);

    // Check if pricing already exists
    const [existing] = await db
      .select()
      .from(clientCampaignPricing)
      .where(and(
        eq(clientCampaignPricing.clientAccountId, clientId),
        eq(clientCampaignPricing.campaignType, campaignType)
      ))
      .limit(1);

    let result;
    if (existing) {
      // Update existing
      [result] = await db
        .update(clientCampaignPricing)
        .set({
          pricePerLead: validatedData.pricePerLead,
          minimumOrderSize: validatedData.minimumOrderSize,
          volumeDiscounts: validatedData.volumeDiscounts,
          isEnabled: validatedData.isEnabled,
          notes: validatedData.notes,
          updatedAt: new Date(),
        })
        .where(eq(clientCampaignPricing.id, existing.id))
        .returning();
    } else {
      // Create new
      [result] = await db
        .insert(clientCampaignPricing)
        .values({
          clientAccountId: clientId,
          campaignType,
          pricePerLead: validatedData.pricePerLead,
          minimumOrderSize: validatedData.minimumOrderSize,
          volumeDiscounts: validatedData.volumeDiscounts,
          isEnabled: validatedData.isEnabled,
          notes: validatedData.notes,
        })
        .returning();
    }

    res.json({
      message: existing ? 'Pricing updated successfully' : 'Pricing created successfully',
      pricing: result,
    });
  } catch (error) {
    console.error('[ADMIN] Update campaign pricing error:', error);
    if (error instanceof z.ZodError) {
      return res.status(400).json({ message: 'Invalid data', errors: error.errors });
    }
    res.status(500).json({ message: 'Failed to update campaign pricing' });
  }
});

// Bulk update pricing for multiple campaign types
router.put('/clients/:clientId/campaign-pricing', async (req: Request, res: Response) => {
  try {
    const { clientId } = req.params;

    const bulkPricingSchema = z.object({
      pricing: z.array(z.object({
        campaignType: z.string(),
        pricePerLead: z.string().or(z.number()).transform(val => String(val)),
        minimumOrderSize: z.number().int().min(1).optional().default(100),
        volumeDiscounts: z.array(z.object({
          minQuantity: z.number().int().min(1),
          discountPercent: z.number().min(0).max(100),
        })).optional().default([]),
        isEnabled: z.boolean().optional().default(true),
        notes: z.string().optional().nullable(),
      })),
    });

    const { pricing } = bulkPricingSchema.parse(req.body);

    const results = [];
    for (const item of pricing) {
      // Check if pricing already exists
      const [existing] = await db
        .select()
        .from(clientCampaignPricing)
        .where(and(
          eq(clientCampaignPricing.clientAccountId, clientId),
          eq(clientCampaignPricing.campaignType, item.campaignType)
        ))
        .limit(1);

      let result;
      if (existing) {
        [result] = await db
          .update(clientCampaignPricing)
          .set({
            pricePerLead: item.pricePerLead,
            minimumOrderSize: item.minimumOrderSize,
            volumeDiscounts: item.volumeDiscounts,
            isEnabled: item.isEnabled,
            notes: item.notes,
            updatedAt: new Date(),
          })
          .where(eq(clientCampaignPricing.id, existing.id))
          .returning();
      } else {
        [result] = await db
          .insert(clientCampaignPricing)
          .values({
            clientAccountId: clientId,
            campaignType: item.campaignType,
            pricePerLead: item.pricePerLead,
            minimumOrderSize: item.minimumOrderSize,
            volumeDiscounts: item.volumeDiscounts,
            isEnabled: item.isEnabled,
            notes: item.notes,
          })
          .returning();
      }
      results.push(result);
    }

    res.json({
      message: 'Pricing updated successfully',
      updated: results.length,
    });
  } catch (error) {
    console.error('[ADMIN] Bulk update campaign pricing error:', error);
    if (error instanceof z.ZodError) {
      return res.status(400).json({ message: 'Invalid data', errors: error.errors });
    }
    res.status(500).json({ message: 'Failed to update campaign pricing' });
  }
});

// Delete pricing for a specific campaign type (revert to defaults)
router.delete('/clients/:clientId/campaign-pricing/:campaignType', async (req: Request, res: Response) => {
  try {
    const { clientId, campaignType } = req.params;

    await db
      .delete(clientCampaignPricing)
      .where(and(
        eq(clientCampaignPricing.clientAccountId, clientId),
        eq(clientCampaignPricing.campaignType, campaignType)
      ));

    res.json({ message: 'Pricing removed, will use defaults' });
  } catch (error) {
    console.error('[ADMIN] Delete campaign pricing error:', error);
    res.status(500).json({ message: 'Failed to delete campaign pricing' });
  }
});

// ==================== CLIENT PRICING DOCUMENTS ====================

// Get all pricing documents for a client
router.get('/clients/:clientId/pricing-documents', async (req: Request, res: Response) => {
  try {
    const { clientId } = req.params;

    const docs = await db
      .select()
      .from(clientPricingDocuments)
      .where(eq(clientPricingDocuments.clientAccountId, clientId))
      .orderBy(desc(clientPricingDocuments.createdAt));

    res.json({ clientId, documents: docs });
  } catch (error) {
    console.error('[ADMIN] Get pricing documents error:', error);
    res.status(500).json({ message: 'Failed to get pricing documents' });
  }
});

// Upload a pricing document (metadata only - file already uploaded to GCS via presigned URL)
router.post('/clients/:clientId/pricing-documents', async (req: Request, res: Response) => {
  try {
    const { clientId } = req.params;

    const docSchema = z.object({
      name: z.string().min(1, 'Document name is required'),
      description: z.string().optional().nullable(),
      fileKey: z.string().min(1, 'File key is required'),
      fileName: z.string().min(1, 'File name is required'),
      fileType: z.string().min(1, 'File type is required'),
      fileSize: z.number().optional(),
      uploadedBy: z.string().optional(),
    });

    const data = docSchema.parse(req.body);

    const [doc] = await db
      .insert(clientPricingDocuments)
      .values({
        clientAccountId: clientId,
        name: data.name,
        description: data.description || null,
        fileKey: data.fileKey,
        fileName: data.fileName,
        fileType: data.fileType,
        fileSize: data.fileSize || null,
        uploadedBy: data.uploadedBy || null,
      })
      .returning();

    res.json({ message: 'Pricing document uploaded', document: doc });
  } catch (error) {
    console.error('[ADMIN] Upload pricing document error:', error);
    if (error instanceof z.ZodError) {
      return res.status(400).json({ message: 'Invalid data', errors: error.errors });
    }
    res.status(500).json({ message: 'Failed to upload pricing document' });
  }
});

// Delete a pricing document
router.delete('/clients/:clientId/pricing-documents/:docId', async (req: Request, res: Response) => {
  try {
    const { clientId, docId } = req.params;

    await db
      .delete(clientPricingDocuments)
      .where(and(
        eq(clientPricingDocuments.id, docId),
        eq(clientPricingDocuments.clientAccountId, clientId)
      ));

    res.json({ message: 'Pricing document removed' });
  } catch (error) {
    console.error('[ADMIN] Delete pricing document error:', error);
    res.status(500).json({ message: 'Failed to delete pricing document' });
  }
});

// Get download URL for a pricing document
router.get('/clients/:clientId/pricing-documents/:docId/download', async (req: Request, res: Response) => {
  try {
    const { clientId, docId } = req.params;

    const [doc] = await db
      .select()
      .from(clientPricingDocuments)
      .where(and(
        eq(clientPricingDocuments.id, docId),
        eq(clientPricingDocuments.clientAccountId, clientId)
      ))
      .limit(1);

    if (!doc) {
      return res.status(404).json({ message: 'Document not found' });
    }

    const { getPresignedDownloadUrl } = await import('../lib/storage');
    const downloadUrl = await getPresignedDownloadUrl(doc.fileKey, 3600); // 1 hour

    res.json({ downloadUrl, fileName: doc.fileName });
  } catch (error) {
    console.error('[ADMIN] Download pricing document error:', error);
    res.status(500).json({ message: 'Failed to generate download URL' });
  }
});

export default router;
