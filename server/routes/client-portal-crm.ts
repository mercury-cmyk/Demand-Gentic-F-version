/**
 * Client Portal CRM Routes
 * 
 * Manages client's own accounts and contacts (their CRM data).
 * Permission-gated by 'accounts_contacts' and 'bulk_upload' features.
 */

import { Router, Request, Response } from 'express';
import { db } from '../db';
import { eq, and, or, like, desc, asc, sql, inArray } from 'drizzle-orm';
import {
  clientCrmAccounts,
  clientCrmContacts,
  clientFeatureAccess,
  clientBulkImports,
  insertClientCrmAccountSchema,
  insertClientCrmContactSchema,
} from '@shared/schema';
import { z } from 'zod';

const router = Router();

// ==================== MIDDLEWARE ====================

/**
 * Check if client has 'accounts_contacts' feature enabled
 */
async function requireAccountsContactsFeature(req: Request, res: Response, next: Function) {
  const clientAccountId = req.clientUser?.clientAccountId;
  if (!clientAccountId) {
    return res.status(401).json({ message: 'Unauthorized' });
  }

  const [feature] = await db
    .select()
    .from(clientFeatureAccess)
    .where(
      and(
        eq(clientFeatureAccess.clientAccountId, clientAccountId),
        eq(clientFeatureAccess.feature, 'accounts_contacts')
      )
    )
    .limit(1);

  // Default to enabled when no explicit record exists (no restrictions)
  if (feature && !feature.isEnabled) {
    return res.status(403).json({
      message: 'Accounts & Contacts feature is not enabled for your account',
      featureRequired: 'accounts_contacts'
    });
  }

  next();
}

/**
 * Check if client has 'bulk_upload' feature enabled
 */
async function requireBulkUploadFeature(req: Request, res: Response, next: Function) {
  const clientAccountId = req.clientUser?.clientAccountId;
  if (!clientAccountId) {
    return res.status(401).json({ message: 'Unauthorized' });
  }

  const [feature] = await db
    .select()
    .from(clientFeatureAccess)
    .where(
      and(
        eq(clientFeatureAccess.clientAccountId, clientAccountId),
        eq(clientFeatureAccess.feature, 'bulk_upload')
      )
    )
    .limit(1);

  // Default to enabled when no explicit record exists (no restrictions)
  if (feature && !feature.isEnabled) {
    return res.status(403).json({
      message: 'Bulk upload feature is not enabled for your account',
      featureRequired: 'bulk_upload'
    });
  }

  next();
}

// Apply accounts_contacts feature check to all routes
router.use(requireAccountsContactsFeature);

// ==================== ACCOUNTS ====================

/**
 * GET /accounts
 * List all CRM accounts for the client
 */
router.get('/accounts', async (req: Request, res: Response) => {
  try {
    const clientAccountId = req.clientUser?.clientAccountId;
    const { search, status, limit = '50', offset = '0', sortBy = 'name', sortOrder = 'asc', campaignId } = req.query;

    let query = db
      .select()
      .from(clientCrmAccounts)
      .where(eq(clientCrmAccounts.clientAccountId, clientAccountId!));

    // Apply filters
    const conditions = [eq(clientCrmAccounts.clientAccountId, clientAccountId!)];
    
    if (search) {
      conditions.push(
        or(
          like(clientCrmAccounts.name, `%${search}%`),
          like(clientCrmAccounts.domain, `%${search}%`),
          like(clientCrmAccounts.industry, `%${search}%`)
        )!
      );
    }
    
    if (status && status !== 'all') {
      conditions.push(eq(clientCrmAccounts.status, status as string));
    }

    if (campaignId) {
      // This assumes a linking table between campaigns and accounts exists.
      // Let's say it's `campaignCrmAccounts`
      const subquery = db
        .select({ accountId: sql`"campaign_audience"."account_id"` })
        .from(sql`"campaign_audience"`)
        .where(sql`"campaign_audience"."campaign_id" = ${campaignId}`);
      
      conditions.push(inArray(clientCrmAccounts.id, subquery));
    }

    const accounts = await db
      .select()
      .from(clientCrmAccounts)
      .where(and(...conditions))
      .orderBy(sortOrder === 'desc' ? desc(clientCrmAccounts.name) : asc(clientCrmAccounts.name))
      .limit(parseInt(limit as string))
      .offset(parseInt(offset as string));

    // Get total count
    const [{ count }] = await db
      .select({ count: sql<number>`count(*)` })
      .from(clientCrmAccounts)
      .where(and(...conditions));

    res.json({
      accounts,
      total: Number(count),
      limit: parseInt(limit as string),
      offset: parseInt(offset as string),
    });
  } catch (error) {
    console.error('[CLIENT CRM] List accounts error:', error);
    res.status(500).json({ message: 'Failed to fetch accounts' });
  }
});

/**
 * GET /accounts/:id
 * Get a single CRM account with its contacts
 */
router.get('/accounts/:id', async (req: Request, res: Response) => {
  try {
    const clientAccountId = req.clientUser?.clientAccountId;
    const { id } = req.params;

    const [account] = await db
      .select()
      .from(clientCrmAccounts)
      .where(
        and(
          eq(clientCrmAccounts.id, id),
          eq(clientCrmAccounts.clientAccountId, clientAccountId!)
        )
      )
      .limit(1);

    if (!account) {
      return res.status(404).json({ message: 'Account not found' });
    }

    // Get contacts for this account
    const contacts = await db
      .select()
      .from(clientCrmContacts)
      .where(eq(clientCrmContacts.crmAccountId, id))
      .orderBy(asc(clientCrmContacts.lastName));

    res.json({
      account,
      contacts,
      contactCount: contacts.length,
    });
  } catch (error) {
    console.error('[CLIENT CRM] Get account error:', error);
    res.status(500).json({ message: 'Failed to fetch account' });
  }
});

/**
 * POST /accounts
 * Create a new CRM account
 */
router.post('/accounts', async (req: Request, res: Response) => {
  try {
    const clientAccountId = req.clientUser?.clientAccountId;
    const clientUserId = req.clientUser?.clientUserId;

    const createSchema = z.object({
      name: z.string().min(1, 'Account name is required'),
      domain: z.string().optional().nullable(),
      industry: z.string().optional().nullable(),
      employees: z.string().optional().nullable(),
      annualRevenue: z.string().optional().nullable(),
      city: z.string().optional().nullable(),
      state: z.string().optional().nullable(),
      country: z.string().optional().nullable(),
      phone: z.string().optional().nullable(),
      website: z.string().url().optional().nullable().or(z.literal('')),
      accountType: z.string().optional().nullable(),
      status: z.string().default('active'),
      customFields: z.record(z.any()).optional().nullable(),
    });

    const validatedData = createSchema.parse(req.body);

    const [account] = await db
      .insert(clientCrmAccounts)
      .values({
        clientAccountId: clientAccountId!,
        ...validatedData,
        website: validatedData.website || null,
        createdBy: clientUserId,
      })
      .returning();

    res.status(201).json({
      message: 'Account created successfully',
      account,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ message: 'Validation failed', errors: error.errors });
    }
    console.error('[CLIENT CRM] Create account error:', error);
    res.status(500).json({ message: 'Failed to create account' });
  }
});

/**
 * PUT /accounts/:id
 * Update a CRM account
 */
router.put('/accounts/:id', async (req: Request, res: Response) => {
  try {
    const clientAccountId = req.clientUser?.clientAccountId;
    const { id } = req.params;

    // Verify ownership
    const [existing] = await db
      .select({ id: clientCrmAccounts.id })
      .from(clientCrmAccounts)
      .where(
        and(
          eq(clientCrmAccounts.id, id),
          eq(clientCrmAccounts.clientAccountId, clientAccountId!)
        )
      )
      .limit(1);

    if (!existing) {
      return res.status(404).json({ message: 'Account not found' });
    }

    const updateSchema = z.object({
      name: z.string().min(1).optional(),
      domain: z.string().optional().nullable(),
      industry: z.string().optional().nullable(),
      employees: z.string().optional().nullable(),
      annualRevenue: z.string().optional().nullable(),
      city: z.string().optional().nullable(),
      state: z.string().optional().nullable(),
      country: z.string().optional().nullable(),
      phone: z.string().optional().nullable(),
      website: z.string().url().optional().nullable().or(z.literal('')),
      accountType: z.string().optional().nullable(),
      status: z.string().optional(),
      customFields: z.record(z.any()).optional().nullable(),
    });

    const validatedData = updateSchema.parse(req.body);

    const [account] = await db
      .update(clientCrmAccounts)
      .set({
        ...validatedData,
        website: validatedData.website || null,
        updatedAt: new Date(),
      })
      .where(eq(clientCrmAccounts.id, id))
      .returning();

    res.json({
      message: 'Account updated successfully',
      account,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ message: 'Validation failed', errors: error.errors });
    }
    console.error('[CLIENT CRM] Update account error:', error);
    res.status(500).json({ message: 'Failed to update account' });
  }
});

/**
 * DELETE /accounts/:id
 * Delete a CRM account
 */
router.delete('/accounts/:id', async (req: Request, res: Response) => {
  try {
    const clientAccountId = req.clientUser?.clientAccountId;
    const { id } = req.params;

    const [deleted] = await db
      .delete(clientCrmAccounts)
      .where(
        and(
          eq(clientCrmAccounts.id, id),
          eq(clientCrmAccounts.clientAccountId, clientAccountId!)
        )
      )
      .returning();

    if (!deleted) {
      return res.status(404).json({ message: 'Account not found' });
    }

    res.json({ message: 'Account deleted successfully' });
  } catch (error) {
    console.error('[CLIENT CRM] Delete account error:', error);
    res.status(500).json({ message: 'Failed to delete account' });
  }
});

// ==================== CONTACTS ====================

/**
 * GET /contacts
 * List all CRM contacts for the client
 */
router.get('/contacts', async (req: Request, res: Response) => {
  try {
    const clientAccountId = req.clientUser?.clientAccountId;
    const { 
      search, 
      status, 
      accountId,
      campaignId,
      limit = '50', 
      offset = '0',
      sortBy = 'lastName',
      sortOrder = 'asc'
    } = req.query;

    const conditions = [eq(clientCrmContacts.clientAccountId, clientAccountId!)];
    
    if (search) {
      conditions.push(
        or(
          like(clientCrmContacts.firstName, `%${search}%`),
          like(clientCrmContacts.lastName, `%${search}%`),
          like(clientCrmContacts.email, `%${search}%`),
          like(clientCrmContacts.company, `%${search}%`),
          like(clientCrmContacts.title, `%${search}%`)
        )!
      );
    }
    
    if (status && status !== 'all') {
      conditions.push(eq(clientCrmContacts.status, status as string));
    }

    if (accountId) {
      conditions.push(eq(clientCrmContacts.crmAccountId, accountId as string));
    }

    if (campaignId) {
      const subquery = db
        .select({ contactId: sql`"campaign_audience"."contact_id"` })
        .from(sql`"campaign_audience"`)
        .where(sql`"campaign_audience"."campaign_id" = ${campaignId}`);

      conditions.push(inArray(clientCrmContacts.id, subquery));
    }

    const contacts = await db
      .select()
      .from(clientCrmContacts)
      .where(and(...conditions))
      .orderBy(sortOrder === 'desc' ? desc(clientCrmContacts.lastName) : asc(clientCrmContacts.lastName))
      .limit(parseInt(limit as string))
      .offset(parseInt(offset as string));

    // Get total count
    const [{ count }] = await db
      .select({ count: sql<number>`count(*)` })
      .from(clientCrmContacts)
      .where(and(...conditions));

    res.json({
      contacts,
      total: Number(count),
      limit: parseInt(limit as string),
      offset: parseInt(offset as string),
    });
  } catch (error) {
    console.error('[CLIENT CRM] List contacts error:', error);
    res.status(500).json({ message: 'Failed to fetch contacts' });
  }
});

/**
 * GET /contacts/:id
 * Get a single CRM contact
 */
router.get('/contacts/:id', async (req: Request, res: Response) => {
  try {
    const clientAccountId = req.clientUser?.clientAccountId;
    const { id } = req.params;

    const [contact] = await db
      .select()
      .from(clientCrmContacts)
      .where(
        and(
          eq(clientCrmContacts.id, id),
          eq(clientCrmContacts.clientAccountId, clientAccountId!)
        )
      )
      .limit(1);

    if (!contact) {
      return res.status(404).json({ message: 'Contact not found' });
    }

    // Get associated account if any
    let account = null;
    if (contact.crmAccountId) {
      [account] = await db
        .select()
        .from(clientCrmAccounts)
        .where(eq(clientCrmAccounts.id, contact.crmAccountId))
        .limit(1);
    }

    res.json({
      contact,
      account,
    });
  } catch (error) {
    console.error('[CLIENT CRM] Get contact error:', error);
    res.status(500).json({ message: 'Failed to fetch contact' });
  }
});

/**
 * POST /contacts
 * Create a new CRM contact
 */
router.post('/contacts', async (req: Request, res: Response) => {
  try {
    const clientAccountId = req.clientUser?.clientAccountId;
    const clientUserId = req.clientUser?.clientUserId;

    const createSchema = z.object({
      firstName: z.string().optional().nullable(),
      lastName: z.string().optional().nullable(),
      email: z.string().email().optional().nullable().or(z.literal('')),
      phone: z.string().optional().nullable(),
      mobile: z.string().optional().nullable(),
      title: z.string().optional().nullable(),
      department: z.string().optional().nullable(),
      linkedinUrl: z.string().url().optional().nullable().or(z.literal('')),
      company: z.string().optional().nullable(),
      crmAccountId: z.string().optional().nullable(),
      status: z.string().default('active'),
      customFields: z.record(z.any()).optional().nullable(),
    });

    const validatedData = createSchema.parse(req.body);

    // Verify account ownership if crmAccountId provided
    if (validatedData.crmAccountId) {
      const [account] = await db
        .select({ id: clientCrmAccounts.id })
        .from(clientCrmAccounts)
        .where(
          and(
            eq(clientCrmAccounts.id, validatedData.crmAccountId),
            eq(clientCrmAccounts.clientAccountId, clientAccountId!)
          )
        )
        .limit(1);

      if (!account) {
        return res.status(400).json({ message: 'Invalid account ID' });
      }
    }

    const [contact] = await db
      .insert(clientCrmContacts)
      .values({
        clientAccountId: clientAccountId!,
        ...validatedData,
        email: validatedData.email || null,
        linkedinUrl: validatedData.linkedinUrl || null,
        createdBy: clientUserId,
      })
      .returning();

    res.status(201).json({
      message: 'Contact created successfully',
      contact,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ message: 'Validation failed', errors: error.errors });
    }
    console.error('[CLIENT CRM] Create contact error:', error);
    res.status(500).json({ message: 'Failed to create contact' });
  }
});

/**
 * PUT /contacts/:id
 * Update a CRM contact
 */
router.put('/contacts/:id', async (req: Request, res: Response) => {
  try {
    const clientAccountId = req.clientUser?.clientAccountId;
    const { id } = req.params;

    // Verify ownership
    const [existing] = await db
      .select({ id: clientCrmContacts.id })
      .from(clientCrmContacts)
      .where(
        and(
          eq(clientCrmContacts.id, id),
          eq(clientCrmContacts.clientAccountId, clientAccountId!)
        )
      )
      .limit(1);

    if (!existing) {
      return res.status(404).json({ message: 'Contact not found' });
    }

    const updateSchema = z.object({
      firstName: z.string().optional().nullable(),
      lastName: z.string().optional().nullable(),
      email: z.string().email().optional().nullable().or(z.literal('')),
      phone: z.string().optional().nullable(),
      mobile: z.string().optional().nullable(),
      title: z.string().optional().nullable(),
      department: z.string().optional().nullable(),
      linkedinUrl: z.string().url().optional().nullable().or(z.literal('')),
      company: z.string().optional().nullable(),
      crmAccountId: z.string().optional().nullable(),
      status: z.string().optional(),
      emailOptOut: z.boolean().optional(),
      phoneOptOut: z.boolean().optional(),
      customFields: z.record(z.any()).optional().nullable(),
    });

    const validatedData = updateSchema.parse(req.body);

    const [contact] = await db
      .update(clientCrmContacts)
      .set({
        ...validatedData,
        email: validatedData.email || null,
        linkedinUrl: validatedData.linkedinUrl || null,
        updatedAt: new Date(),
      })
      .where(eq(clientCrmContacts.id, id))
      .returning();

    res.json({
      message: 'Contact updated successfully',
      contact,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ message: 'Validation failed', errors: error.errors });
    }
    console.error('[CLIENT CRM] Update contact error:', error);
    res.status(500).json({ message: 'Failed to update contact' });
  }
});

/**
 * DELETE /contacts/:id
 * Delete a CRM contact
 */
router.delete('/contacts/:id', async (req: Request, res: Response) => {
  try {
    const clientAccountId = req.clientUser?.clientAccountId;
    const { id } = req.params;

    const [deleted] = await db
      .delete(clientCrmContacts)
      .where(
        and(
          eq(clientCrmContacts.id, id),
          eq(clientCrmContacts.clientAccountId, clientAccountId!)
        )
      )
      .returning();

    if (!deleted) {
      return res.status(404).json({ message: 'Contact not found' });
    }

    res.json({ message: 'Contact deleted successfully' });
  } catch (error) {
    console.error('[CLIENT CRM] Delete contact error:', error);
    res.status(500).json({ message: 'Failed to delete contact' });
  }
});

/**
 * POST /contacts/:id/link-account
 * Link a contact to an account
 */
router.post('/contacts/:id/link-account', async (req: Request, res: Response) => {
  try {
    const clientAccountId = req.clientUser?.clientAccountId;
    const { id } = req.params;
    const { accountId } = req.body;

    // Verify contact ownership
    const [contact] = await db
      .select({ id: clientCrmContacts.id })
      .from(clientCrmContacts)
      .where(
        and(
          eq(clientCrmContacts.id, id),
          eq(clientCrmContacts.clientAccountId, clientAccountId!)
        )
      )
      .limit(1);

    if (!contact) {
      return res.status(404).json({ message: 'Contact not found' });
    }

    // Verify account ownership
    if (accountId) {
      const [account] = await db
        .select({ id: clientCrmAccounts.id })
        .from(clientCrmAccounts)
        .where(
          and(
            eq(clientCrmAccounts.id, accountId),
            eq(clientCrmAccounts.clientAccountId, clientAccountId!)
          )
        )
        .limit(1);

      if (!account) {
        return res.status(400).json({ message: 'Invalid account ID' });
      }
    }

    const [updated] = await db
      .update(clientCrmContacts)
      .set({
        crmAccountId: accountId || null,
        updatedAt: new Date(),
      })
      .where(eq(clientCrmContacts.id, id))
      .returning();

    res.json({
      message: accountId ? 'Contact linked to account' : 'Contact unlinked from account',
      contact: updated,
    });
  } catch (error) {
    console.error('[CLIENT CRM] Link contact error:', error);
    res.status(500).json({ message: 'Failed to link contact' });
  }
});

// ==================== BULK IMPORT ====================

/**
 * POST /bulk-import
 * Start a bulk import job for contacts or accounts
 */
router.post('/bulk-import', requireBulkUploadFeature, async (req: Request, res: Response) => {
  try {
    const clientAccountId = req.clientUser?.clientAccountId;
    const clientUserId = req.clientUser?.clientUserId;

    const importSchema = z.object({
      importType: z.enum(['contacts', 'accounts']),
      fileName: z.string(),
      fileUrl: z.string(),
      columnMapping: z.record(z.string()),
      campaignId: z.string().optional().nullable(),
    });

    const validatedData = importSchema.parse(req.body);

    const [importJob] = await db
      .insert(clientBulkImports)
      .values({
        clientAccountId: clientAccountId!,
        importType: validatedData.importType,
        fileName: validatedData.fileName,
        fileUrl: validatedData.fileUrl,
        columnMapping: validatedData.columnMapping,
        campaignId: validatedData.campaignId,
        status: 'pending',
        uploadedBy: clientUserId,
      })
      .returning();

    // In production, this would trigger a background job to process the file
    // For now, we'll return the job ID for status checking

    res.status(201).json({
      message: 'Import job created',
      importJob,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ message: 'Validation failed', errors: error.errors });
    }
    console.error('[CLIENT CRM] Bulk import error:', error);
    res.status(500).json({ message: 'Failed to create import job' });
  }
});

/**
 * GET /bulk-import/:id
 * Get status of a bulk import job
 */
router.get('/bulk-import/:id', async (req: Request, res: Response) => {
  try {
    const clientAccountId = req.clientUser?.clientAccountId;
    const { id } = req.params;

    const [importJob] = await db
      .select()
      .from(clientBulkImports)
      .where(
        and(
          eq(clientBulkImports.id, id),
          eq(clientBulkImports.clientAccountId, clientAccountId!)
        )
      )
      .limit(1);

    if (!importJob) {
      return res.status(404).json({ message: 'Import job not found' });
    }

    res.json({ importJob });
  } catch (error) {
    console.error('[CLIENT CRM] Get import status error:', error);
    res.status(500).json({ message: 'Failed to fetch import status' });
  }
});

/**
 * GET /bulk-imports
 * List all bulk import jobs for the client
 */
router.get('/bulk-imports', async (req: Request, res: Response) => {
  try {
    const clientAccountId = req.clientUser?.clientAccountId;
    const { limit = '20', offset = '0' } = req.query;

    const imports = await db
      .select()
      .from(clientBulkImports)
      .where(eq(clientBulkImports.clientAccountId, clientAccountId!))
      .orderBy(desc(clientBulkImports.createdAt))
      .limit(parseInt(limit as string))
      .offset(parseInt(offset as string));

    res.json({ imports });
  } catch (error) {
    console.error('[CLIENT CRM] List imports error:', error);
    res.status(500).json({ message: 'Failed to fetch import history' });
  }
});

// ==================== STATS ====================

/**
 * GET /stats
 * Get CRM statistics for the client
 */
router.get('/stats', async (req: Request, res: Response) => {
  try {
    const clientAccountId = req.clientUser?.clientAccountId;

    // Get counts
    const [accountStats] = await db
      .select({ count: sql<number>`count(*)` })
      .from(clientCrmAccounts)
      .where(eq(clientCrmAccounts.clientAccountId, clientAccountId!));

    const [contactStats] = await db
      .select({ count: sql<number>`count(*)` })
      .from(clientCrmContacts)
      .where(eq(clientCrmContacts.clientAccountId, clientAccountId!));

    const [optedOutStats] = await db
      .select({ count: sql<number>`count(*)` })
      .from(clientCrmContacts)
      .where(
        and(
          eq(clientCrmContacts.clientAccountId, clientAccountId!),
          or(
            eq(clientCrmContacts.emailOptOut, true),
            eq(clientCrmContacts.phoneOptOut, true)
          )
        )
      );

    res.json({
      totalAccounts: Number(accountStats.count),
      totalContacts: Number(contactStats.count),
      optedOutContacts: Number(optedOutStats.count),
    });
  } catch (error) {
    console.error('[CLIENT CRM] Get stats error:', error);
    res.status(500).json({ message: 'Failed to fetch CRM stats' });
  }
});

export default router;
