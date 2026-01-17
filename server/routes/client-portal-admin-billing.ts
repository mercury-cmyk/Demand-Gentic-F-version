import { Router, Request, Response } from 'express';
import { db } from '../db';
import { eq, and, desc, sql, isNull, gte, lte, inArray } from 'drizzle-orm';
import {
  clientAccounts,
  clientBillingConfig,
  clientActivityCosts,
  clientInvoices,
  clientInvoiceItems,
  clientInvoiceActivity,
  clientProjects,
  verificationCampaigns,
} from '@shared/schema';
import { requireAuth, requireRole } from '../auth';
import { z } from 'zod';

const router = Router();

// All routes require admin auth
router.use(requireAuth);
router.use(requireRole('admin', 'campaign_manager'));

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
      clientEmail: result.client.contactEmail,
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
  clientAccountId: z.string().uuid(),
  billingPeriodStart: z.string(),
  billingPeriodEnd: z.string(),
  items: z.array(z.object({
    description: z.string(),
    itemType: z.string(),
    quantity: z.number(),
    unitPrice: z.number(),
    projectId: z.string().uuid().optional(),
    campaignId: z.string().uuid().optional(),
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

    // Generate invoice number
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
    const invoiceNumber = `INV-${year}-${String(seqNum).padStart(4, '0')}`;

    const issueDate = new Date();
    const dueDate = new Date();
    dueDate.setDate(dueDate.getDate() + paymentTerms);

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
        projectId: item.projectId,
        campaignId: item.campaignId,
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
    console.error('[ADMIN] Create invoice error:', error);
    res.status(500).json({ message: 'Failed to create invoice' });
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

// Generate invoice from uninvoiced costs
router.post('/clients/:clientId/generate-invoice', async (req: Request, res: Response) => {
  try {
    const { clientId } = req.params;
    const { periodStart, periodEnd } = req.body;

    if (!periodStart || !periodEnd) {
      return res.status(400).json({ message: 'Period start and end dates are required' });
    }

    // Get uninvoiced costs for the period
    const costs = await db
      .select()
      .from(clientActivityCosts)
      .where(
        and(
          eq(clientActivityCosts.clientAccountId, clientId),
          isNull(clientActivityCosts.invoiceId),
          gte(clientActivityCosts.activityDate, new Date(periodStart)),
          lte(clientActivityCosts.activityDate, new Date(periodEnd))
        )
      );

    if (costs.length === 0) {
      return res.status(400).json({ message: 'No uninvoiced costs found for this period' });
    }

    // Group by activity type
    const grouped = costs.reduce((acc, cost) => {
      const key = cost.activityType;
      if (!acc[key]) {
        acc[key] = { quantity: 0, total: 0 };
      }
      acc[key].quantity += parseFloat(cost.quantity);
      acc[key].total += parseFloat(cost.totalCost);
      return acc;
    }, {} as Record<string, { quantity: number; total: number }>);

    // Get billing config
    const [config] = await db
      .select()
      .from(clientBillingConfig)
      .where(eq(clientBillingConfig.clientAccountId, clientId))
      .limit(1);

    const activityLabels: Record<string, string> = {
      lead_delivered: 'Leads Delivered',
      contact_verified: 'Contacts Verified',
      ai_call_minute: 'AI Call Minutes',
      email_sent: 'Emails Sent',
      retainer_fee: 'Monthly Retainer',
    };

    // Create line items
    const items = Object.entries(grouped).map(([type, data]) => ({
      description: activityLabels[type] || type,
      itemType: type,
      quantity: data.quantity,
      unitPrice: data.total / data.quantity, // Average unit price
    }));

    // Calculate totals
    const taxRate = config?.taxExempt ? 0 : parseFloat(config?.taxRate || '0');
    const subtotal = Object.values(grouped).reduce((sum, g) => sum + g.total, 0);
    const taxAmount = subtotal * taxRate;
    const totalAmount = subtotal + taxAmount;

    // Generate invoice number
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
    const invoiceNumber = `INV-${year}-${String(seqNum).padStart(4, '0')}`;

    const paymentTerms = config?.paymentTermsDays || 30;
    const issueDate = new Date();
    const dueDate = new Date();
    dueDate.setDate(dueDate.getDate() + paymentTerms);

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
        periodStart,
        periodEnd,
        sortOrder: idx,
      }))
    );

    // Update costs with invoice reference
    await db
      .update(clientActivityCosts)
      .set({ invoiceId: invoice.id, invoicedAt: new Date() })
      .where(inArray(clientActivityCosts.id, costs.map((c) => c.id)));

    // Log creation
    await db.insert(clientInvoiceActivity).values({
      invoiceId: invoice.id,
      activityType: 'created',
      description: `Invoice auto-generated from ${costs.length} activity costs`,
      performedBy: req.user!.userId,
    });

    res.status(201).json({
      invoice,
      costsIncluded: costs.length,
      subtotal,
      totalAmount,
    });
  } catch (error) {
    console.error('[ADMIN] Generate invoice error:', error);
    res.status(500).json({ message: 'Failed to generate invoice' });
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

export default router;
