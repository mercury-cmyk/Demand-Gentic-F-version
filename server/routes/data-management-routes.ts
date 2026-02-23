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
  contacts, accounts,
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
