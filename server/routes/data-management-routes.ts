/**
 * Data Management Routes
 * 
 * Comprehensive API for the Data Management Dashboard:
 * - Audience overview & analytics
 * - Data requests CRUD (procurement workflow)
 * - File upload with validation pipeline
 * - Quality scan management
 * - Data templates CRUD
 * - AI quality recommendations
 */

import { Router, Request, Response } from 'express';
import { db } from '../db';
import { eq, desc, sql, and, count, isNull, isNotNull, asc } from 'drizzle-orm';
import {
  dataRequests, insertDataRequestSchema,
  dataUploads, insertDataUploadSchema,
  dataQualityIssues,
  dataTemplates, insertDataTemplateSchema,
  dataQualityScans,
  contacts, accounts, segments, lists,
} from '@shared/schema';
import { requireAuth, requireRole } from '../auth';
import multer from 'multer';
import {
  runFullQualityScan,
  validateUploadData,
  getAudienceOverview,
  classifyIndustry,
  classifySeniority,
  classifyDepartment,
} from '../services/data-quality-engine';

const router = Router();

// All routes require authentication
router.use(requireAuth);

// Multer for CSV/file uploads (memory storage for processing)
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 50 * 1024 * 1024 }, // 50MB
  fileFilter: (_req, file, cb) => {
    const allowed = ['text/csv', 'application/vnd.ms-excel', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'text/plain'];
    if (allowed.includes(file.mimetype) || file.originalname.endsWith('.csv')) {
      cb(null, true);
    } else {
      cb(new Error('Only CSV and Excel files are supported'));
    }
  },
});

// ==================== AUDIENCE OVERVIEW ====================

/**
 * GET /overview
 * Get comprehensive audience data overview and analytics
 */
router.get('/overview', async (_req: Request, res: Response) => {
  try {
    const overview = await getAudienceOverview();

    // Get latest quality scan
    const [latestScan] = await db.select()
      .from(dataQualityScans)
      .where(eq(dataQualityScans.status, 'completed'))
      .orderBy(desc(dataQualityScans.completedAt))
      .limit(1);

    // Get pending data requests count
    const [requestStats] = await db.select({
      total: sql<number>`count(*)::int`,
      pending: sql<number>`count(case when ${dataRequests.status} = 'requested' then 1 end)::int`,
      inProgress: sql<number>`count(case when ${dataRequests.status} = 'in_progress' then 1 end)::int`,
    }).from(dataRequests);

    // Get recent uploads count
    const [uploadStats] = await db.select({
      total: sql<number>`count(*)::int`,
      processing: sql<number>`count(case when ${dataUploads.status} in ('pending', 'validating', 'processing', 'intelligence_running') then 1 end)::int`,
      completed: sql<number>`count(case when ${dataUploads.status} = 'completed' then 1 end)::int`,
    }).from(dataUploads);

    // Get open quality issues
    const [issueStats] = await db.select({
      total: sql<number>`count(*)::int`,
      critical: sql<number>`count(case when ${dataQualityIssues.severity} = 'critical' then 1 end)::int`,
      high: sql<number>`count(case when ${dataQualityIssues.severity} = 'high' then 1 end)::int`,
      unresolved: sql<number>`count(case when ${dataQualityIssues.status} = 'open' then 1 end)::int`,
    }).from(dataQualityIssues);

    res.json({
      audience: overview,
      qualityScan: latestScan || null,
      dataRequests: requestStats,
      uploads: uploadStats,
      qualityIssues: issueStats,
    });
  } catch (error: any) {
    console.error('[DataMgmt] Overview error:', error);
    res.status(500).json({ message: 'Failed to fetch overview', error: error.message });
  }
});

/**
 * GET /insights/summary
 * Consolidated account/contact analysis for Data Management insights
 */
router.get('/insights/summary', async (_req: Request, res: Response) => {
  try {
    const [
      totalsResult,
      accountLinkageResult,
      segmentByEntityResult,
      listByEntityResult,
      industryResult,
      employeeSizeResult,
      revenueResult,
      accountTypeResult,
      accountCountryResult,
      seniorityResult,
      departmentResult,
      contactCountryResult,
      contactStateResult,
      contactCoverageResult,
      accountCoverageResult,
    ] = await Promise.all([
      db.execute(sql`
        SELECT
          (SELECT count(*)::int FROM accounts) AS total_accounts,
          (SELECT count(*)::int FROM contacts WHERE deleted_at IS NULL) AS total_contacts,
          (SELECT count(*)::int FROM contacts WHERE deleted_at IS NULL AND account_id IS NOT NULL) AS contacts_with_account,
          (SELECT count(*)::int FROM segments WHERE is_active = true) AS active_segments,
          (SELECT count(*)::int FROM lists) AS total_lists
      `),
      db.execute(sql`
        SELECT count(*)::int AS accounts_with_contacts
        FROM accounts a
        WHERE EXISTS (
          SELECT 1
          FROM contacts c
          WHERE c.account_id = a.id
            AND c.deleted_at IS NULL
        )
      `),
      db.select({
        value: segments.entityType,
        count: sql<number>`count(*)::int`,
      }).from(segments)
        .where(eq(segments.isActive, true))
        .groupBy(segments.entityType)
        .orderBy(desc(sql`count(*)`)),
      db.select({
        value: lists.entityType,
        count: sql<number>`count(*)::int`,
      }).from(lists)
        .groupBy(lists.entityType)
        .orderBy(desc(sql`count(*)`)),
      db.execute(sql`
        SELECT industry_standardized AS value, count(*)::int AS count
        FROM accounts
        WHERE industry_standardized IS NOT NULL
          AND btrim(industry_standardized) != ''
        GROUP BY industry_standardized
        ORDER BY count(*) DESC
        LIMIT 30
      `),
      db.execute(sql`
        SELECT employees_size_range::text AS value, count(*)::int AS count
        FROM accounts
        WHERE employees_size_range IS NOT NULL
        GROUP BY employees_size_range
        ORDER BY count(*) DESC
        LIMIT 30
      `),
      db.execute(sql`
        SELECT
          COALESCE(
            NULLIF(revenue_range::text, ''),
            CASE
              WHEN annual_revenue IS NULL THEN NULL
              WHEN annual_revenue < 1000000 THEN '<$1M'
              WHEN annual_revenue < 10000000 THEN '$1M-$10M'
              WHEN annual_revenue < 50000000 THEN '$10M-$50M'
              WHEN annual_revenue < 100000000 THEN '$50M-$100M'
              WHEN annual_revenue < 500000000 THEN '$100M-$500M'
              WHEN annual_revenue < 1000000000 THEN '$500M-$1B'
              ELSE '$1B+'
            END
          ) AS value,
          count(*)::int AS count
        FROM accounts
        WHERE revenue_range IS NOT NULL OR annual_revenue IS NOT NULL
        GROUP BY 1
        ORDER BY count(*) DESC
        LIMIT 30
      `),
      db.execute(sql`
        SELECT type_value AS value, count(*)::int AS count
        FROM (
          SELECT COALESCE(
            NULLIF(btrim(custom_fields->>'accountType'), ''),
            NULLIF(btrim(custom_fields->>'account_type'), ''),
            NULLIF(btrim(list), ''),
            NULLIF(btrim(source_system), '')
          ) AS type_value
          FROM accounts
        ) t
        WHERE type_value IS NOT NULL
        GROUP BY type_value
        ORDER BY count(*) DESC
        LIMIT 30
      `),
      db.execute(sql`
        SELECT hq_country AS value, count(*)::int AS count
        FROM accounts
        WHERE hq_country IS NOT NULL
          AND btrim(hq_country) != ''
        GROUP BY hq_country
        ORDER BY count(*) DESC
        LIMIT 30
      `),
      db.execute(sql`
        SELECT seniority_level AS value, count(*)::int AS count
        FROM contacts
        WHERE deleted_at IS NULL
          AND seniority_level IS NOT NULL
          AND btrim(seniority_level) != ''
        GROUP BY seniority_level
        ORDER BY count(*) DESC
        LIMIT 30
      `),
      db.execute(sql`
        SELECT department AS value, count(*)::int AS count
        FROM contacts
        WHERE deleted_at IS NULL
          AND department IS NOT NULL
          AND btrim(department) != ''
        GROUP BY department
        ORDER BY count(*) DESC
        LIMIT 30
      `),
      db.execute(sql`
        SELECT country AS value, count(*)::int AS count
        FROM contacts
        WHERE deleted_at IS NULL
          AND country IS NOT NULL
          AND btrim(country) != ''
        GROUP BY country
        ORDER BY count(*) DESC
        LIMIT 30
      `),
      db.execute(sql`
        SELECT state AS value, count(*)::int AS count
        FROM contacts
        WHERE deleted_at IS NULL
          AND state IS NOT NULL
          AND btrim(state) != ''
        GROUP BY state
        ORDER BY count(*) DESC
        LIMIT 30
      `),
      db.execute(sql`
        SELECT
          count(*)::int AS total,
          count(case when email IS NOT NULL AND btrim(email) != '' then 1 end)::int AS email,
          count(case when (direct_phone IS NOT NULL AND btrim(direct_phone) != '') OR (mobile_phone IS NOT NULL AND btrim(mobile_phone) != '') then 1 end)::int AS phone,
          count(case when job_title IS NOT NULL AND btrim(job_title) != '' then 1 end)::int AS job_title,
          count(case when seniority_level IS NOT NULL AND btrim(seniority_level) != '' then 1 end)::int AS seniority,
          count(case when department IS NOT NULL AND btrim(department) != '' then 1 end)::int AS department,
          count(case when linkedin_url IS NOT NULL AND btrim(linkedin_url) != '' then 1 end)::int AS linkedin,
          count(case when country IS NOT NULL AND btrim(country) != '' then 1 end)::int AS country,
          count(case when state IS NOT NULL AND btrim(state) != '' then 1 end)::int AS state,
          count(case when city IS NOT NULL AND btrim(city) != '' then 1 end)::int AS city,
          count(case when account_id IS NOT NULL then 1 end)::int AS account_link
        FROM contacts
        WHERE deleted_at IS NULL
      `),
      db.execute(sql`
        SELECT
          count(*)::int AS total,
          count(case when industry_standardized IS NOT NULL AND btrim(industry_standardized) != '' then 1 end)::int AS industry,
          count(case when annual_revenue IS NOT NULL OR (revenue_range IS NOT NULL AND btrim(revenue_range::text) != '') then 1 end)::int AS revenue,
          count(case when staff_count IS NOT NULL OR (employees_size_range IS NOT NULL AND btrim(employees_size_range::text) != '') then 1 end)::int AS employees,
          count(case when domain IS NOT NULL AND btrim(domain) != '' then 1 end)::int AS domain,
          count(case when hq_country IS NOT NULL AND btrim(hq_country) != '' then 1 end)::int AS hq_country,
          count(case when main_phone IS NOT NULL AND btrim(main_phone) != '' then 1 end)::int AS main_phone,
          count(case when linkedin_url IS NOT NULL AND btrim(linkedin_url) != '' then 1 end)::int AS linkedin,
          count(case when source_system IS NOT NULL AND btrim(source_system) != '' then 1 end)::int AS source_system,
          count(case when list IS NOT NULL AND btrim(list) != '' then 1 end)::int AS source_list
        FROM accounts
      `),
    ]);

    const totalsRow = ((totalsResult.rows || [])[0] || {}) as any;
    const accountLinkageRow = ((accountLinkageResult.rows || [])[0] || {}) as any;
    const contactCoverageRow = ((contactCoverageResult.rows || [])[0] || {}) as any;
    const accountCoverageRow = ((accountCoverageResult.rows || [])[0] || {}) as any;

    const totalAccounts = Number(totalsRow.total_accounts || 0);
    const totalContacts = Number(totalsRow.total_contacts || 0);
    const contactsWithAccount = Number(totalsRow.contacts_with_account || 0);
    const accountsWithContacts = Number(accountLinkageRow.accounts_with_contacts || 0);
    const orphanContacts = Math.max(totalContacts - contactsWithAccount, 0);
    const accountsWithoutContacts = Math.max(totalAccounts - accountsWithContacts, 0);
    const activeSegments = Number(totalsRow.active_segments || 0);
    const totalLists = Number(totalsRow.total_lists || 0);

    const percentage = (countValue: number, totalValue: number) =>
      totalValue > 0 ? Math.round((countValue / totalValue) * 1000) / 10 : 0;

    const mapDistribution = (rows: any[], totalValue: number, limit = 10) =>
      (rows || []).slice(0, limit).map((row: any) => {
        const countValue = Number(row.count || 0);
        const rawValue = row.value === null || row.value === undefined ? 'Unknown' : String(row.value);
        const value = rawValue.trim() || 'Unknown';
        return {
          value,
          count: countValue,
          percentage: percentage(countValue, totalValue),
        };
      });

    const coverageRow = (field: string, populated: number, totalValue: number) => {
      const safePopulated = Number(populated || 0);
      const missing = Math.max(totalValue - safePopulated, 0);
      return {
        field,
        total: totalValue,
        populated: safePopulated,
        missing,
        coverage: percentage(safePopulated, totalValue),
      };
    };

    const accountCoverage = [
      coverageRow('Industry', Number(accountCoverageRow.industry || 0), totalAccounts),
      coverageRow('Revenue', Number(accountCoverageRow.revenue || 0), totalAccounts),
      coverageRow('Employee Size', Number(accountCoverageRow.employees || 0), totalAccounts),
      coverageRow('Domain', Number(accountCoverageRow.domain || 0), totalAccounts),
      coverageRow('HQ Country', Number(accountCoverageRow.hq_country || 0), totalAccounts),
      coverageRow('Main Phone', Number(accountCoverageRow.main_phone || 0), totalAccounts),
      coverageRow('LinkedIn URL', Number(accountCoverageRow.linkedin || 0), totalAccounts),
      coverageRow('Source System', Number(accountCoverageRow.source_system || 0), totalAccounts),
      coverageRow('Source List', Number(accountCoverageRow.source_list || 0), totalAccounts),
    ];

    const contactCoverage = [
      coverageRow('Email', Number(contactCoverageRow.email || 0), totalContacts),
      coverageRow('Phone', Number(contactCoverageRow.phone || 0), totalContacts),
      coverageRow('Job Title', Number(contactCoverageRow.job_title || 0), totalContacts),
      coverageRow('Seniority', Number(contactCoverageRow.seniority || 0), totalContacts),
      coverageRow('Department', Number(contactCoverageRow.department || 0), totalContacts),
      coverageRow('LinkedIn URL', Number(contactCoverageRow.linkedin || 0), totalContacts),
      coverageRow('Country', Number(contactCoverageRow.country || 0), totalContacts),
      coverageRow('State', Number(contactCoverageRow.state || 0), totalContacts),
      coverageRow('City', Number(contactCoverageRow.city || 0), totalContacts),
      coverageRow('Account Link', Number(contactCoverageRow.account_link || 0), totalContacts),
    ];

    const gapSuggestion = (recordType: 'account' | 'contact', field: string) => {
      const key = `${recordType}:${field}`;
      const map: Record<string, string> = {
        'account:Industry': 'Run account industry normalization and enrichment.',
        'account:Revenue': 'Prioritize revenue enrichment for target accounts.',
        'account:Employee Size': 'Backfill company size from enrichment providers.',
        'account:Domain': 'Resolve website/domain gaps from account names.',
        'contact:Email': 'Prioritize email verification and enrichment jobs.',
        'contact:Phone': 'Prioritize direct/mobile phone enrichment.',
        'contact:Job Title': 'Backfill titles from LinkedIn/research workflows.',
        'contact:Seniority': 'Auto-classify seniority from job titles.',
        'contact:Department': 'Auto-classify departments from job titles.',
        'contact:Account Link': 'Improve account matching to reduce orphan contacts.',
      };
      return map[key] || 'Prioritize enrichment for this field.';
    };

    const topMissingFields = [
      ...accountCoverage.map((item) => ({ recordType: 'account' as const, ...item })),
      ...contactCoverage.map((item) => ({ recordType: 'contact' as const, ...item })),
    ]
      .filter((item) => item.total > 0 && item.missing > 0)
      .map((item) => ({
        ...item,
        missingRate: percentage(item.missing, item.total),
        recommendation: gapSuggestion(item.recordType, item.field),
      }))
      .sort((a, b) => (b.missingRate - a.missingRate) || (b.missing - a.missing))
      .slice(0, 8);

    res.json({
      generatedAt: new Date().toISOString(),
      totals: {
        accounts: totalAccounts,
        contacts: totalContacts,
        contactsWithAccount,
        orphanContacts,
        accountsWithContacts,
        accountsWithoutContacts,
        activeSegments,
        totalLists,
        accountLinkRate: percentage(accountsWithContacts, totalAccounts),
        contactLinkRate: percentage(contactsWithAccount, totalContacts),
      },
      segments: {
        dynamicByEntity: mapDistribution(segmentByEntityResult as any[], activeSegments, 10),
        staticByEntity: mapDistribution(listByEntityResult as any[], totalLists, 10),
      },
      accounts: {
        firmographics: {
          industry: mapDistribution((industryResult.rows || []) as any[], totalAccounts, 10),
          employeeSize: mapDistribution((employeeSizeResult.rows || []) as any[], totalAccounts, 10),
          revenue: mapDistribution((revenueResult.rows || []) as any[], totalAccounts, 10),
          accountType: mapDistribution((accountTypeResult.rows || []) as any[], totalAccounts, 10),
          hqCountry: mapDistribution((accountCountryResult.rows || []) as any[], totalAccounts, 10),
        },
        coverage: accountCoverage,
      },
      contacts: {
        demographics: {
          seniority: mapDistribution((seniorityResult.rows || []) as any[], totalContacts, 10),
          department: mapDistribution((departmentResult.rows || []) as any[], totalContacts, 10),
          country: mapDistribution((contactCountryResult.rows || []) as any[], totalContacts, 10),
          state: mapDistribution((contactStateResult.rows || []) as any[], totalContacts, 10),
        },
        coverage: contactCoverage,
      },
      gaps: {
        topMissingFields,
      },
    });
  } catch (error: any) {
    console.error('[DataMgmt] Insights summary error:', error);
    res.status(500).json({ message: 'Failed to fetch insights summary', error: error.message });
  }
});

// ==================== DATA REQUESTS ====================

/**
 * GET /requests
 * List all data requests with pagination
 */
router.get('/requests', async (req: Request, res: Response) => {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 20;
    const status = req.query.status as string;
    const offset = (page - 1) * limit;

    let query = db.select().from(dataRequests).orderBy(desc(dataRequests.createdAt));

    if (status) {
      query = query.where(eq(dataRequests.status, status)) as any;
    }

    const requests = await query.limit(limit).offset(offset);
    const [{ total }] = await db.select({ total: sql<number>`count(*)::int` }).from(dataRequests);

    res.json({
      requests,
      pagination: { page, limit, total, pages: Math.ceil(total / limit) },
    });
  } catch (error: any) {
    console.error('[DataMgmt] List requests error:', error);
    res.status(500).json({ message: 'Failed to fetch requests', error: error.message });
  }
});

/**
 * POST /requests
 * Create a new data request
 */
router.post('/requests', async (req: Request, res: Response) => {
  try {
    const data = insertDataRequestSchema.parse(req.body);
    const [request] = await db.insert(dataRequests).values({
      ...data,
      requestedBy: req.user!.userId,
      status: 'requested',
    }).returning();

    res.status(201).json(request);
  } catch (error: any) {
    console.error('[DataMgmt] Create request error:', error);
    res.status(400).json({ message: 'Failed to create request', error: error.message });
  }
});

/**
 * GET /requests/:id
 * Get a single data request
 */
router.get('/requests/:id', async (req: Request, res: Response) => {
  try {
    const [request] = await db.select().from(dataRequests).where(eq(dataRequests.id, req.params.id));
    if (!request) return res.status(404).json({ message: 'Request not found' });
    res.json(request);
  } catch (error: any) {
    res.status(500).json({ message: 'Failed to fetch request', error: error.message });
  }
});

/**
 * PATCH /requests/:id
 * Update a data request (status changes, assignments, etc.)
 */
router.patch('/requests/:id', async (req: Request, res: Response) => {
  try {
    const updates: Record<string, any> = {};
    const { status, assignedTo, priority, estimatedDelivery, vendorName, vendorCost, notes, specifications } = req.body;

    if (status) {
      updates.status = status;
      if (status === 'delivered') updates.deliveredAt = new Date();
      if (status === 'validated') updates.validatedAt = new Date();
    }
    if (assignedTo !== undefined) updates.assignedTo = assignedTo;
    if (priority) updates.priority = priority;
    if (estimatedDelivery) updates.estimatedDelivery = new Date(estimatedDelivery);
    if (vendorName) updates.vendorName = vendorName;
    if (vendorCost !== undefined) updates.vendorCost = String(vendorCost);
    if (notes) updates.notes = notes;
    if (specifications) updates.specifications = specifications;

    updates.updatedAt = new Date();

    const [updated] = await db.update(dataRequests)
      .set(updates)
      .where(eq(dataRequests.id, req.params.id))
      .returning();

    if (!updated) return res.status(404).json({ message: 'Request not found' });
    res.json(updated);
  } catch (error: any) {
    console.error('[DataMgmt] Update request error:', error);
    res.status(400).json({ message: 'Failed to update request', error: error.message });
  }
});

/**
 * DELETE /requests/:id
 * Delete a data request
 */
router.delete('/requests/:id', requireRole('admin'), async (req: Request, res: Response) => {
  try {
    const [deleted] = await db.delete(dataRequests)
      .where(eq(dataRequests.id, req.params.id))
      .returning();

    if (!deleted) return res.status(404).json({ message: 'Request not found' });
    res.json({ message: 'Request deleted', id: deleted.id });
  } catch (error: any) {
    res.status(500).json({ message: 'Failed to delete request', error: error.message });
  }
});

// ==================== DATA UPLOADS ====================

/**
 * POST /uploads
 * Upload a CSV file for processing
 */
router.post('/uploads', upload.single('file'), async (req: Request, res: Response) => {
  try {
    if (!req.file) return res.status(400).json({ message: 'No file uploaded' });

    const content = req.file.buffer.toString('utf-8');
    const lines = content.split('\n').filter(l => l.trim());
    if (lines.length < 2) return res.status(400).json({ message: 'File has no data rows' });

    const headers = lines[0].split(',').map(h => h.trim().replace(/^"|"$/g, ''));
    const rows: Record<string, string>[] = [];

    for (let i = 1; i < lines.length; i++) {
      const values = parseCSVLine(lines[i]);
      const row: Record<string, string> = {};
      headers.forEach((h, idx) => { row[h] = (values[idx] || '').trim(); });
      rows.push(row);
    }

    // Validate data
    const validation = validateUploadData(headers, rows);

    // Create upload record
    const [uploadRecord] = await db.insert(dataUploads).values({
      fileName: req.file.originalname,
      fileSize: req.file.size,
      mimeType: req.file.mimetype,
      uploadedBy: req.user!.userId,
      status: validation.isValid ? 'validating' : 'failed',
      totalRows: rows.length,
      validRows: validation.validRows,
      invalidRows: validation.invalidRows,
      duplicateRows: validation.duplicateRows,
      qualityScore: validation.qualityScore,
      completenessScore: validation.completenessScore,
      columnMapping: validation.detectedSchema.reduce((acc, col) => {
        if (col.suggestedMapping) acc[col.name] = col.suggestedMapping;
        return acc;
      }, {} as Record<string, string>),
      validationErrors: validation.errors,
      dataRequestId: (req.body.dataRequestId as string) || null,
      projectId: (req.body.projectId as string) || null,
      campaignId: (req.body.campaignId as string) || null,
    }).returning();

    res.status(201).json({
      upload: uploadRecord,
      validation: {
        isValid: validation.isValid,
        totalRows: validation.totalRows,
        validRows: validation.validRows,
        invalidRows: validation.invalidRows,
        duplicateRows: validation.duplicateRows,
        qualityScore: validation.qualityScore,
        completenessScore: validation.completenessScore,
        errors: validation.errors.slice(0, 20),
        warnings: validation.warnings,
        detectedSchema: validation.detectedSchema,
      },
    });
  } catch (error: any) {
    console.error('[DataMgmt] Upload error:', error);
    res.status(500).json({ message: 'Upload failed', error: error.message });
  }
});

/**
 * GET /uploads
 * List all uploads with pagination
 */
router.get('/uploads', async (req: Request, res: Response) => {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 20;
    const offset = (page - 1) * limit;

    const uploads = await db.select().from(dataUploads)
      .orderBy(desc(dataUploads.createdAt))
      .limit(limit).offset(offset);

    const [{ total }] = await db.select({ total: sql<number>`count(*)::int` }).from(dataUploads);

    res.json({
      uploads,
      pagination: { page, limit, total, pages: Math.ceil(total / limit) },
    });
  } catch (error: any) {
    res.status(500).json({ message: 'Failed to fetch uploads', error: error.message });
  }
});

/**
 * GET /uploads/:id
 * Get a single upload with processing status
 */
router.get('/uploads/:id', async (req: Request, res: Response) => {
  try {
    const [uploadRecord] = await db.select().from(dataUploads).where(eq(dataUploads.id, req.params.id));
    if (!uploadRecord) return res.status(404).json({ message: 'Upload not found' });
    res.json(uploadRecord);
  } catch (error: any) {
    res.status(500).json({ message: 'Failed to fetch upload', error: error.message });
  }
});

/**
 * PATCH /uploads/:id/mapping
 * Update column mapping for an upload
 */
router.patch('/uploads/:id/mapping', async (req: Request, res: Response) => {
  try {
    const { columnMapping } = req.body;
    const [updated] = await db.update(dataUploads)
      .set({ columnMapping, updatedAt: new Date() })
      .where(eq(dataUploads.id, req.params.id))
      .returning();

    if (!updated) return res.status(404).json({ message: 'Upload not found' });
    res.json(updated);
  } catch (error: any) {
    res.status(400).json({ message: 'Failed to update mapping', error: error.message });
  }
});

// ==================== QUALITY SCANS ====================

/**
 * POST /quality/scan
 * Trigger a new data quality scan
 */
router.post('/quality/scan', async (req: Request, res: Response) => {
  try {
    const { projectId, campaignId, uploadId } = req.body;
    const report = await runFullQualityScan(req.user!.userId, { projectId, campaignId, uploadId });
    res.json(report);
  } catch (error: any) {
    console.error('[DataMgmt] Quality scan error:', error);
    res.status(500).json({ message: 'Quality scan failed', error: error.message });
  }
});

/**
 * GET /quality/scans
 * List all quality scan results
 */
router.get('/quality/scans', async (req: Request, res: Response) => {
  try {
    const limit = parseInt(req.query.limit as string) || 10;
    const scans = await db.select().from(dataQualityScans)
      .orderBy(desc(dataQualityScans.createdAt))
      .limit(limit);

    res.json(scans);
  } catch (error: any) {
    res.status(500).json({ message: 'Failed to fetch scans', error: error.message });
  }
});

/**
 * GET /quality/scans/:id
 * Get detailed scan results
 */
router.get('/quality/scans/:id', async (req: Request, res: Response) => {
  try {
    const [scan] = await db.select().from(dataQualityScans)
      .where(eq(dataQualityScans.id, req.params.id));

    if (!scan) return res.status(404).json({ message: 'Scan not found' });

    // Get associated issues
    const issues = await db.select().from(dataQualityIssues)
      .where(eq(dataQualityIssues.scanBatchId, scan.id))
      .orderBy(desc(sql`case 
        when ${dataQualityIssues.severity} = 'critical' then 0 
        when ${dataQualityIssues.severity} = 'high' then 1 
        when ${dataQualityIssues.severity} = 'medium' then 2 
        when ${dataQualityIssues.severity} = 'low' then 3 
        else 4 end`))
      .limit(200);

    res.json({ scan, issues });
  } catch (error: any) {
    res.status(500).json({ message: 'Failed to fetch scan', error: error.message });
  }
});

/**
 * GET /quality/issues
 * Get all quality issues with filtering
 */
router.get('/quality/issues', async (req: Request, res: Response) => {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 50;
    const severity = req.query.severity as string;
    const status = req.query.status as string;
    const issueType = req.query.issueType as string;
    const offset = (page - 1) * limit;

    let conditions: any[] = [];
    if (severity) conditions.push(eq(dataQualityIssues.severity, severity));
    if (status) conditions.push(eq(dataQualityIssues.status, status));
    if (issueType) conditions.push(eq(dataQualityIssues.issueType, issueType));

    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

    const issues = await db.select().from(dataQualityIssues)
      .where(whereClause)
      .orderBy(desc(dataQualityIssues.createdAt))
      .limit(limit).offset(offset);

    const [{ total }] = await db.select({
      total: sql<number>`count(*)::int`,
    }).from(dataQualityIssues).where(whereClause);

    res.json({
      issues,
      pagination: { page, limit, total, pages: Math.ceil(total / limit) },
    });
  } catch (error: any) {
    res.status(500).json({ message: 'Failed to fetch issues', error: error.message });
  }
});

/**
 * PATCH /quality/issues/:id
 * Update issue status (resolve, dismiss, etc.)
 */
router.patch('/quality/issues/:id', async (req: Request, res: Response) => {
  try {
    const { status, resolution } = req.body;
    const updates: Record<string, any> = { updatedAt: new Date() };
    if (status) updates.status = status;
    if (resolution) updates.resolution = resolution;
    if (status === 'resolved' || status === 'dismissed') {
      updates.resolvedBy = req.user!.userId;
      updates.resolvedAt = new Date();
    }

    const [updated] = await db.update(dataQualityIssues)
      .set(updates)
      .where(eq(dataQualityIssues.id, req.params.id))
      .returning();

    if (!updated) return res.status(404).json({ message: 'Issue not found' });
    res.json(updated);
  } catch (error: any) {
    res.status(400).json({ message: 'Failed to update issue', error: error.message });
  }
});

/**
 * POST /quality/issues/bulk-resolve
 * Bulk resolve quality issues
 */
router.post('/quality/issues/bulk-resolve', async (req: Request, res: Response) => {
  try {
    const { issueIds, resolution } = req.body;
    if (!Array.isArray(issueIds) || issueIds.length === 0) {
      return res.status(400).json({ message: 'issueIds array required' });
    }

    const result = await db.update(dataQualityIssues)
      .set({
        status: 'resolved',
        resolution: resolution || 'Bulk resolved',
        resolvedBy: req.user!.userId,
        resolvedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(sql`${dataQualityIssues.id} = ANY(${issueIds})`);

    res.json({ message: 'Issues resolved', count: result.rowCount || 0 });
  } catch (error: any) {
    res.status(500).json({ message: 'Bulk resolve failed', error: error.message });
  }
});

// ==================== DATA TEMPLATES ====================

/**
 * GET /templates
 * List all data templates
 */
router.get('/templates', async (_req: Request, res: Response) => {
  try {
    const templates = await db.select().from(dataTemplates)
      .orderBy(desc(dataTemplates.createdAt));
    res.json(templates);
  } catch (error: any) {
    res.status(500).json({ message: 'Failed to fetch templates', error: error.message });
  }
});

/**
 * POST /templates
 * Create a new data template
 */
router.post('/templates', async (req: Request, res: Response) => {
  try {
    const data = insertDataTemplateSchema.parse(req.body);
    const [template] = await db.insert(dataTemplates).values({
      ...data,
      createdBy: req.user!.userId,
    }).returning();

    res.status(201).json(template);
  } catch (error: any) {
    console.error('[DataMgmt] Create template error:', error);
    res.status(400).json({ message: 'Failed to create template', error: error.message });
  }
});

/**
 * GET /templates/:id
 * Get a single template
 */
router.get('/templates/:id', async (req: Request, res: Response) => {
  try {
    const [template] = await db.select().from(dataTemplates)
      .where(eq(dataTemplates.id, req.params.id));
    if (!template) return res.status(404).json({ message: 'Template not found' });
    res.json(template);
  } catch (error: any) {
    res.status(500).json({ message: 'Failed to fetch template', error: error.message });
  }
});

/**
 * PATCH /templates/:id
 * Update a template
 */
router.patch('/templates/:id', async (req: Request, res: Response) => {
  try {
    const { name, description, templateType, mandatoryFields, optionalFields,
      fieldValidations, namingConventions, industryTaxonomy, titleHierarchy, isActive } = req.body;

    const updates: Record<string, any> = { updatedAt: new Date() };
    if (name !== undefined) updates.name = name;
    if (description !== undefined) updates.description = description;
    if (templateType !== undefined) updates.templateType = templateType;
    if (mandatoryFields !== undefined) updates.mandatoryFields = mandatoryFields;
    if (optionalFields !== undefined) updates.optionalFields = optionalFields;
    if (fieldValidations !== undefined) updates.fieldValidations = fieldValidations;
    if (namingConventions !== undefined) updates.namingConventions = namingConventions;
    if (industryTaxonomy !== undefined) updates.industryTaxonomy = industryTaxonomy;
    if (titleHierarchy !== undefined) updates.titleHierarchy = titleHierarchy;
    if (isActive !== undefined) updates.isActive = isActive;

    // Increment version on content changes
    if (mandatoryFields || optionalFields || fieldValidations) {
      updates.version = sql`${dataTemplates.version} + 1`;
    }

    const [updated] = await db.update(dataTemplates)
      .set(updates)
      .where(eq(dataTemplates.id, req.params.id))
      .returning();

    if (!updated) return res.status(404).json({ message: 'Template not found' });
    res.json(updated);
  } catch (error: any) {
    res.status(400).json({ message: 'Failed to update template', error: error.message });
  }
});

/**
 * DELETE /templates/:id
 * Delete a template
 */
router.delete('/templates/:id', requireRole('admin'), async (req: Request, res: Response) => {
  try {
    const [deleted] = await db.delete(dataTemplates)
      .where(eq(dataTemplates.id, req.params.id))
      .returning();

    if (!deleted) return res.status(404).json({ message: 'Template not found' });
    res.json({ message: 'Template deleted', id: deleted.id });
  } catch (error: any) {
    res.status(500).json({ message: 'Failed to delete template', error: error.message });
  }
});

// ==================== HYGIENE & NORMALIZATION ====================

/**
 * GET /hygiene/duplicates
 * Find potential duplicate contacts by email
 */
router.get('/hygiene/duplicates', async (req: Request, res: Response) => {
  try {
    const limit = parseInt(req.query.limit as string) || 50;
    const duplicates = await db.execute(sql`
      SELECT email, count(*)::int as duplicate_count,
        json_agg(json_build_object(
          'id', id, 'fullName', full_name, 'jobTitle', job_title,
          'directPhone', direct_phone, 'createdAt', created_at
        ) ORDER BY created_at DESC) as records
      FROM contacts
      WHERE email IS NOT NULL AND email != '' AND deleted_at IS NULL
      GROUP BY email
      HAVING count(*) > 1
      ORDER BY count(*) DESC
      LIMIT ${limit}
    `);
    
    const totalDuplicateGroups = await db.execute(sql`
      SELECT count(*)::int as total FROM (
        SELECT email FROM contacts
        WHERE email IS NOT NULL AND email != '' AND deleted_at IS NULL
        GROUP BY email HAVING count(*) > 1
      ) sub
    `);

    res.json({
      duplicateGroups: duplicates.rows || [],
      totalGroups: (totalDuplicateGroups.rows?.[0] as any)?.total || 0,
    });
  } catch (error: any) {
    console.error('[DataMgmt] Duplicate detection error:', error);
    res.status(500).json({ message: 'Failed to detect duplicates', error: error.message });
  }
});

/**
 * GET /hygiene/normalization-preview
 * Preview what normalization would do for industries and titles
 */
router.get('/hygiene/normalization-preview', async (_req: Request, res: Response) => {
  try {
    // Unnormalized industries (raw != standardized or standardized is null)
    const rawIndustries = await db.execute(sql`
      SELECT industry_raw as raw, industry_standardized as standardized, count(*)::int as record_count
      FROM accounts
      WHERE industry_raw IS NOT NULL AND industry_raw != ''
        AND (industry_standardized IS NULL OR industry_standardized = '' OR industry_raw != industry_standardized)
      GROUP BY industry_raw, industry_standardized
      ORDER BY count(*) DESC
      LIMIT 50
    `);

    // Contacts without seniority classification
    const unclassifiedTitles = await db.execute(sql`
      SELECT job_title, count(*)::int as record_count
      FROM contacts
      WHERE job_title IS NOT NULL AND job_title != '' 
        AND (seniority_level IS NULL OR seniority_level = '')
        AND deleted_at IS NULL
      GROUP BY job_title
      ORDER BY count(*) DESC
      LIMIT 50
    `);

    // Contacts without department
    const unclassifiedDepts = await db.execute(sql`
      SELECT job_title, count(*)::int as record_count
      FROM contacts
      WHERE job_title IS NOT NULL AND job_title != ''
        AND (department IS NULL OR department = '')
        AND deleted_at IS NULL
      GROUP BY job_title
      ORDER BY count(*) DESC
      LIMIT 50
    `);

    // Phone normalization opportunities (phones not in E.164)
    const unnormalizedPhones = await db.execute(sql`
      SELECT count(*)::int as total
      FROM contacts
      WHERE deleted_at IS NULL
        AND (
          (direct_phone IS NOT NULL AND direct_phone != '' AND (direct_phone_e164 IS NULL OR direct_phone_e164 = ''))
          OR (mobile_phone IS NOT NULL AND mobile_phone != '' AND (mobile_phone_e164 IS NULL OR mobile_phone_e164 = ''))
        )
    `);

    // Email normalization opportunities
    const unnormalizedEmails = await db.execute(sql`
      SELECT count(*)::int as total
      FROM contacts
      WHERE email IS NOT NULL AND email != ''
        AND (email_normalized IS NULL OR email_normalized = '')
        AND deleted_at IS NULL
    `);

    res.json({
      industries: { items: rawIndustries.rows || [], total: (rawIndustries.rows || []).length },
      titles: { items: unclassifiedTitles.rows || [], total: (unclassifiedTitles.rows || []).length },
      departments: { items: unclassifiedDepts.rows || [], total: (unclassifiedDepts.rows || []).length },
      phones: { total: (unnormalizedPhones.rows?.[0] as any)?.total || 0 },
      emails: { total: (unnormalizedEmails.rows?.[0] as any)?.total || 0 },
    });
  } catch (error: any) {
    console.error('[DataMgmt] Normalization preview error:', error);
    res.status(500).json({ message: 'Failed to preview normalization', error: error.message });
  }
});

/**
 * POST /hygiene/normalize-industries
 * Run batch industry normalization using the classification engine
 */
router.post('/hygiene/normalize-industries', async (_req: Request, res: Response) => {
  try {
    const rawRows = await db.execute(sql`
      SELECT id, industry_raw FROM accounts
      WHERE industry_raw IS NOT NULL AND industry_raw != ''
        AND (industry_standardized IS NULL OR industry_standardized = '')
      LIMIT 500
    `);

    let normalized = 0;
    for (const row of (rawRows.rows || []) as any[]) {
      const classified = classifyIndustry(row.industry_raw);
      if (classified) {
        await db.execute(sql`
          UPDATE accounts SET industry_standardized = ${classified}, updated_at = NOW()
          WHERE id = ${row.id}
        `);
        normalized++;
      }
    }

    res.json({ message: 'Industry normalization complete', processed: (rawRows.rows || []).length, normalized });
  } catch (error: any) {
    console.error('[DataMgmt] Industry normalization error:', error);
    res.status(500).json({ message: 'Normalization failed', error: error.message });
  }
});

/**
 * POST /hygiene/normalize-titles
 * Run batch title normalization (seniority + department classification)
 */
router.post('/hygiene/normalize-titles', async (_req: Request, res: Response) => {
  try {
    const rows = await db.execute(sql`
      SELECT id, job_title FROM contacts
      WHERE job_title IS NOT NULL AND job_title != ''
        AND (seniority_level IS NULL OR seniority_level = '' OR department IS NULL OR department = '')
        AND deleted_at IS NULL
      LIMIT 500
    `);

    let seniorityUpdated = 0, deptUpdated = 0;
    for (const row of (rows.rows || []) as any[]) {
      const updates: string[] = [];
      const seniority = classifySeniority(row.job_title);
      const department = classifyDepartment(row.job_title);

      if (seniority) {
        await db.execute(sql`UPDATE contacts SET seniority_level = ${seniority} WHERE id = ${row.id} AND (seniority_level IS NULL OR seniority_level = '')`);
        seniorityUpdated++;
      }
      if (department) {
        await db.execute(sql`UPDATE contacts SET department = ${department} WHERE id = ${row.id} AND (department IS NULL OR department = '')`);
        deptUpdated++;
      }
    }

    res.json({ message: 'Title normalization complete', processed: (rows.rows || []).length, seniorityUpdated, departmentUpdated: deptUpdated });
  } catch (error: any) {
    console.error('[DataMgmt] Title normalization error:', error);
    res.status(500).json({ message: 'Normalization failed', error: error.message });
  }
});

/**
 * POST /hygiene/normalize-emails
 * Normalize email addresses (lowercase, trim)
 */
router.post('/hygiene/normalize-emails', async (_req: Request, res: Response) => {
  try {
    const result = await db.execute(sql`
      UPDATE contacts
      SET email_normalized = lower(trim(email)), updated_at = NOW()
      WHERE email IS NOT NULL AND email != ''
        AND (email_normalized IS NULL OR email_normalized = '')
        AND deleted_at IS NULL
    `);

    res.json({ message: 'Email normalization complete', normalized: result.rowCount || 0 });
  } catch (error: any) {
    res.status(500).json({ message: 'Email normalization failed', error: error.message });
  }
});

/**
 * POST /hygiene/merge-duplicates
 * Merge duplicate contacts (keep newest, soft-delete older)
 */
router.post('/hygiene/merge-duplicates', requireRole('admin'), async (req: Request, res: Response) => {
  try {
    const { email } = req.body;
    if (!email) return res.status(400).json({ message: 'email is required' });

    // Find all contacts with this email
    const dupes = await db.execute(sql`
      SELECT id, full_name, email, job_title, direct_phone, created_at
      FROM contacts
      WHERE lower(trim(email)) = lower(trim(${email})) AND deleted_at IS NULL
      ORDER BY created_at DESC
    `);

    const rows = (dupes.rows || []) as any[];
    if (rows.length <= 1) return res.json({ message: 'No duplicates to merge', merged: 0 });

    // Keep the newest (first), soft-delete the rest
    const keep = rows[0];
    const toDelete = rows.slice(1).map((r: any) => r.id);

    const result = await db.execute(sql`
      UPDATE contacts SET deleted_at = NOW()
      WHERE id = ANY(${toDelete})
    `);

    res.json({ message: 'Duplicates merged', kept: keep.id, merged: result.rowCount || 0 });
  } catch (error: any) {
    res.status(500).json({ message: 'Merge failed', error: error.message });
  }
});

// ==================== SEGMENTATION ====================

/**
 * GET /segmentation/distribution
 * Get distribution of a specific field for segmentation
 */
router.get('/segmentation/distribution', async (req: Request, res: Response) => {
  try {
    const field = req.query.field as string;
    const recordType = (req.query.recordType as string) || 'contacts';
    
    const allowedContactFields = ['seniority_level', 'department', 'country', 'state', 'city'];
    const allowedAccountFields = ['industry_standardized', 'employees_size_range', 'hq_country', 'hq_state'];
    
    const allowed = recordType === 'accounts' ? allowedAccountFields : allowedContactFields;
    if (!field || !allowed.includes(field)) {
      return res.status(400).json({ message: `field must be one of: ${allowed.join(', ')}` });
    }

    const table = recordType === 'accounts' ? 'accounts' : 'contacts';
    const deletedFilter = recordType === 'contacts' ? sql`AND deleted_at IS NULL` : sql``;

    const dist = await db.execute(sql.raw(`
      SELECT ${field} as value, count(*)::int as count
      FROM ${table}
      WHERE ${field} IS NOT NULL AND ${field} != '' ${recordType === 'contacts' ? 'AND deleted_at IS NULL' : ''}
      GROUP BY ${field}
      ORDER BY count(*) DESC
      LIMIT 50
    `));

    res.json({ field, recordType, distribution: dist.rows || [] });
  } catch (error: any) {
    res.status(500).json({ message: 'Failed to get distribution', error: error.message });
  }
});

/**
 * GET /segmentation/summary
 * Get comprehensive segmentation summary across all dimensions
 */
router.get('/segmentation/summary', async (_req: Request, res: Response) => {
  try {
    // Seniority breakdown
    const seniority = await db.select({
      value: contacts.seniorityLevel,
      count: sql<number>`count(*)::int`,
    }).from(contacts)
      .where(and(isNotNull(contacts.seniorityLevel), isNull(contacts.deletedAt)))
      .groupBy(contacts.seniorityLevel)
      .orderBy(desc(sql`count(*)`));

    // Department breakdown
    const department = await db.select({
      value: contacts.department,
      count: sql<number>`count(*)::int`,
    }).from(contacts)
      .where(and(isNotNull(contacts.department), isNull(contacts.deletedAt)))
      .groupBy(contacts.department)
      .orderBy(desc(sql`count(*)`));

    // Industry breakdown
    const industry = await db.select({
      value: accounts.industryStandardized,
      count: sql<number>`count(*)::int`,
    }).from(accounts)
      .where(isNotNull(accounts.industryStandardized))
      .groupBy(accounts.industryStandardized)
      .orderBy(desc(sql`count(*)`));

    // Geography (country)
    const geography = await db.select({
      value: contacts.country,
      count: sql<number>`count(*)::int`,
    }).from(contacts)
      .where(and(isNotNull(contacts.country), isNull(contacts.deletedAt)))
      .groupBy(contacts.country)
      .orderBy(desc(sql`count(*)`))
      .limit(20);

    // Company size
    const companySize = await db.select({
      value: accounts.employeesSizeRange,
      count: sql<number>`count(*)::int`,
    }).from(accounts)
      .where(isNotNull(accounts.employeesSizeRange))
      .groupBy(accounts.employeesSizeRange)
      .orderBy(desc(sql`count(*)`));

    res.json({ seniority, department, industry, geography, companySize });
  } catch (error: any) {
    res.status(500).json({ message: 'Failed to get segmentation summary', error: error.message });
  }
});

// ==================== ENRICHMENT ====================

/**
 * GET /enrichment/gaps
 * Identify field-level data gaps and enrichment opportunities
 */
router.get('/enrichment/gaps', async (_req: Request, res: Response) => {
  try {
    const [contactStats] = await db.select({
      total: sql<number>`count(*)::int`,
      missingEmail: sql<number>`count(case when email IS NULL OR email = '' then 1 end)::int`,
      missingPhone: sql<number>`count(case when direct_phone IS NULL OR direct_phone = '' then 1 end)::int`,
      missingMobile: sql<number>`count(case when mobile_phone IS NULL OR mobile_phone = '' then 1 end)::int`,
      missingTitle: sql<number>`count(case when job_title IS NULL OR job_title = '' then 1 end)::int`,
      missingSeniority: sql<number>`count(case when seniority_level IS NULL OR seniority_level = '' then 1 end)::int`,
      missingDepartment: sql<number>`count(case when department IS NULL OR department = '' then 1 end)::int`,
      missingLinkedIn: sql<number>`count(case when linkedin_url IS NULL OR linkedin_url = '' then 1 end)::int`,
      missingCountry: sql<number>`count(case when country IS NULL OR country = '' then 1 end)::int`,
      missingState: sql<number>`count(case when state IS NULL OR state = '' then 1 end)::int`,
      missingCity: sql<number>`count(case when city IS NULL OR city = '' then 1 end)::int`,
      missingAccount: sql<number>`count(case when account_id IS NULL then 1 end)::int`,
    }).from(contacts).where(isNull(contacts.deletedAt));

    const [accountStats] = await db.select({
      total: sql<number>`count(*)::int`,
      missingIndustry: sql<number>`count(case when industry_standardized IS NULL OR industry_standardized = '' then 1 end)::int`,
      missingRevenue: sql<number>`count(case when annual_revenue IS NULL then 1 end)::int`,
      missingEmployees: sql<number>`count(case when staff_count IS NULL AND (employees_size_range IS NULL OR employees_size_range = '') then 1 end)::int`,
      missingDomain: sql<number>`count(case when domain IS NULL OR domain = '' then 1 end)::int`,
      missingCountry: sql<number>`count(case when hq_country IS NULL OR hq_country = '' then 1 end)::int`,
      missingPhone: sql<number>`count(case when main_phone IS NULL OR main_phone = '' then 1 end)::int`,
      missingLinkedIn: sql<number>`count(case when linkedin_url IS NULL OR linkedin_url = '' then 1 end)::int`,
    }).from(accounts);

    // Build enrichment opportunities
    const contactGaps = [
      { field: 'Email', missing: contactStats.missingEmail, total: contactStats.total, priority: 'critical' as const, automatable: false },
      { field: 'Direct Phone', missing: contactStats.missingPhone, total: contactStats.total, priority: 'high' as const, automatable: false },
      { field: 'Job Title', missing: contactStats.missingTitle, total: contactStats.total, priority: 'high' as const, automatable: false },
      { field: 'Seniority Level', missing: contactStats.missingSeniority, total: contactStats.total, priority: 'medium' as const, automatable: true },
      { field: 'Department', missing: contactStats.missingDepartment, total: contactStats.total, priority: 'medium' as const, automatable: true },
      { field: 'LinkedIn URL', missing: contactStats.missingLinkedIn, total: contactStats.total, priority: 'medium' as const, automatable: false },
      { field: 'Country', missing: contactStats.missingCountry, total: contactStats.total, priority: 'low' as const, automatable: false },
      { field: 'State', missing: contactStats.missingState, total: contactStats.total, priority: 'low' as const, automatable: false },
      { field: 'City', missing: contactStats.missingCity, total: contactStats.total, priority: 'low' as const, automatable: false },
      { field: 'Account Link', missing: contactStats.missingAccount, total: contactStats.total, priority: 'high' as const, automatable: false },
    ];

    const accountGaps = [
      { field: 'Industry', missing: accountStats.missingIndustry, total: accountStats.total, priority: 'high' as const, automatable: true },
      { field: 'Revenue', missing: accountStats.missingRevenue, total: accountStats.total, priority: 'medium' as const, automatable: false },
      { field: 'Employee Count', missing: accountStats.missingEmployees, total: accountStats.total, priority: 'medium' as const, automatable: false },
      { field: 'Domain', missing: accountStats.missingDomain, total: accountStats.total, priority: 'high' as const, automatable: false },
      { field: 'HQ Country', missing: accountStats.missingCountry, total: accountStats.total, priority: 'low' as const, automatable: false },
      { field: 'Phone', missing: accountStats.missingPhone, total: accountStats.total, priority: 'low' as const, automatable: false },
      { field: 'LinkedIn', missing: accountStats.missingLinkedIn, total: accountStats.total, priority: 'low' as const, automatable: false },
    ];

    // Overall enrichment score
    const contactTotal = contactGaps.reduce((sum, g) => sum + g.total, 0);
    const contactMissing = contactGaps.reduce((sum, g) => sum + g.missing, 0);
    const accountTotal = accountGaps.reduce((sum, g) => sum + g.total, 0);
    const accountMissing = accountGaps.reduce((sum, g) => sum + g.missing, 0);
    const overallCoverage = contactTotal + accountTotal > 0
      ? Math.round(((1 - (contactMissing + accountMissing) / (contactTotal + accountTotal)) * 100))
      : 0;

    res.json({
      overallCoverage,
      contacts: { stats: contactStats, gaps: contactGaps },
      accounts: { stats: accountStats, gaps: accountGaps },
    });
  } catch (error: any) {
    console.error('[DataMgmt] Enrichment gaps error:', error);
    res.status(500).json({ message: 'Failed to analyze enrichment gaps', error: error.message });
  }
});

// ==================== ANALYTICS ====================

/**
 * GET /analytics/field-coverage
 * Get field coverage analytics across all data
 */
router.get('/analytics/field-coverage', async (_req: Request, res: Response) => {
  try {
    const [contactCoverage] = await db.select({
      total: sql<number>`count(*)::int`,
      email: sql<number>`count(case when ${contacts.email} is not null then 1 end)::int`,
      jobTitle: sql<number>`count(case when ${contacts.jobTitle} is not null then 1 end)::int`,
      directPhone: sql<number>`count(case when ${contacts.directPhone} is not null then 1 end)::int`,
      mobilePhone: sql<number>`count(case when ${contacts.mobilePhone} is not null then 1 end)::int`,
      seniorityLevel: sql<number>`count(case when ${contacts.seniorityLevel} is not null then 1 end)::int`,
      department: sql<number>`count(case when ${contacts.department} is not null then 1 end)::int`,
      country: sql<number>`count(case when ${contacts.country} is not null then 1 end)::int`,
      state: sql<number>`count(case when ${contacts.state} is not null then 1 end)::int`,
      city: sql<number>`count(case when ${contacts.city} is not null then 1 end)::int`,
      linkedinUrl: sql<number>`count(case when ${contacts.linkedinUrl} is not null then 1 end)::int`,
    }).from(contacts);

    const [acctCoverage] = await db.select({
      total: sql<number>`count(*)::int`,
      industry: sql<number>`count(case when ${accounts.industryStandardized} is not null then 1 end)::int`,
      revenue: sql<number>`count(case when ${accounts.annualRevenue} is not null then 1 end)::int`,
      employees: sql<number>`count(case when ${accounts.staffCount} is not null or ${accounts.employeesSizeRange} is not null then 1 end)::int`,
      domain: sql<number>`count(case when ${accounts.domain} is not null then 1 end)::int`,
      hqCountry: sql<number>`count(case when ${accounts.hqCountry} is not null then 1 end)::int`,
      phone: sql<number>`count(case when ${accounts.mainPhone} is not null then 1 end)::int`,
    }).from(accounts);

    res.json({ contactCoverage, accountCoverage: acctCoverage });
  } catch (error: any) {
    res.status(500).json({ message: 'Failed to fetch coverage', error: error.message });
  }
});

/**
 * GET /analytics/quality-trends
 * Get quality score trends over time
 */
router.get('/analytics/quality-trends', async (req: Request, res: Response) => {
  try {
    const limit = parseInt(req.query.limit as string) || 20;
    const trends = await db.select({
      id: dataQualityScans.id,
      createdAt: dataQualityScans.createdAt,
      overallHealthScore: dataQualityScans.overallHealthScore,
      completenessScore: dataQualityScans.completenessScore,
      accuracyScore: dataQualityScans.accuracyScore,
      consistencyScore: dataQualityScans.consistencyScore,
      complianceScore: dataQualityScans.complianceScore,
      totalRecordsScanned: dataQualityScans.totalRecordsScanned,
      issuesFound: dataQualityScans.issuesFound,
    }).from(dataQualityScans)
      .where(eq(dataQualityScans.status, 'completed'))
      .orderBy(desc(dataQualityScans.completedAt))
      .limit(limit);

    res.json(trends);
  } catch (error: any) {
    res.status(500).json({ message: 'Failed to fetch trends', error: error.message });
  }
});

/**
 * GET /analytics/issue-summary
 * Get aggregated issue statistics
 */
router.get('/analytics/issue-summary', async (_req: Request, res: Response) => {
  try {
    // By type
    const byType = await db.select({
      issueType: dataQualityIssues.issueType,
      count: sql<number>`count(*)::int`,
    }).from(dataQualityIssues)
      .where(eq(dataQualityIssues.status, 'open'))
      .groupBy(dataQualityIssues.issueType)
      .orderBy(desc(sql`count(*)`));

    // By severity
    const bySeverity = await db.select({
      severity: dataQualityIssues.severity,
      count: sql<number>`count(*)::int`,
    }).from(dataQualityIssues)
      .where(eq(dataQualityIssues.status, 'open'))
      .groupBy(dataQualityIssues.severity);

    // By record type
    const byRecordType = await db.select({
      recordType: dataQualityIssues.recordType,
      count: sql<number>`count(*)::int`,
    }).from(dataQualityIssues)
      .where(eq(dataQualityIssues.status, 'open'))
      .groupBy(dataQualityIssues.recordType);

    res.json({ byType, bySeverity, byRecordType });
  } catch (error: any) {
    res.status(500).json({ message: 'Failed to fetch issue summary', error: error.message });
  }
});

/**
 * POST /classify/industry
 * AI classify industry from raw text
 */
router.post('/classify/industry', (req: Request, res: Response) => {
  try {
    const { rawIndustry } = req.body;
    const classified = classifyIndustry(rawIndustry);
    res.json({ raw: rawIndustry, standardized: classified });
  } catch (error: any) {
    res.status(400).json({ message: 'Classification failed', error: error.message });
  }
});

/**
 * POST /classify/title
 * AI classify title seniority and department
 */
router.post('/classify/title', (req: Request, res: Response) => {
  try {
    const { title } = req.body;
    const seniority = classifySeniority(title);
    const department = classifyDepartment(title);
    res.json({ title, seniority, department });
  } catch (error: any) {
    res.status(400).json({ message: 'Classification failed', error: error.message });
  }
});

// ==================== HELPERS ====================

function parseCSVLine(line: string): string[] {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === ',' && !inQuotes) {
      result.push(current.trim());
      current = '';
    } else {
      current += char;
    }
  }
  result.push(current.trim());
  return result;
}

export default router;
