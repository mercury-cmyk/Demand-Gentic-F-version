/**
 * UKEF Campaign Reports — API Routes
 * 
 * All routes are gated behind:
 * 1. Feature flag: ukef_campaign_reports (default OFF)
 * 2. Hard client gate: only client "Lightcast" (UKEF) can access
 * 
 * Routes:
 * - GET  /api/client-portal/ukef-reports/summary        — Summary metrics
 * - GET  /api/client-portal/ukef-reports/campaigns       — List campaigns with stats
 * - GET  /api/client-portal/ukef-reports/campaigns/:id/leads — Paginated leads for a campaign
 * - GET  /api/client-portal/ukef-reports/leads/:id       — Lead detail with transcript
 * - GET  /api/client-portal/ukef-reports/leads/:id/recording-link — Generate signed recording URL
 * - GET  /api/client-portal/ukef-reports/export          — CSV export of all qualified leads
 */

import { Router, Request, Response, NextFunction } from 'express';
import { db } from '../../db';
import { eq, and, desc, sql, gte, or, inArray } from 'drizzle-orm';
import { campaigns, leads, contacts, accounts, clientAccounts, dialerCallAttempts } from '@shared/schema';
import { requireFeatureFlag } from '../../feature-flags';
import { getPresignedDownloadUrl } from '../../lib/storage';
import {
  UKEF_CLIENT_ACCOUNT_ID,
  UKEF_CUTOFF_DATE,
  RECORDING_URL_EXPIRY_SECONDS,
  type UkefCampaignSummary,
  type UkefReportsSummaryMetrics,
  type UkefCampaignLeadListItem,
  type UkefLeadDetail,
  type UkefRecordingLinkResponse,
  type UkefCampaignLeadsResponse,
} from './types';

const router = Router();

// ─── Client Gate Middleware ──────────────────────────────────────────────────

/**
 * Hard client gate: only the Lightcast/UKEF client account can access.
 * Uses hardcoded client account ID for security (not name-based lookup).
 */
function requireUkefClient(req: Request, res: Response, next: NextFunction) {
  const clientAccountId = (req as any).clientUser?.clientAccountId;
  if (!clientAccountId) {
    return res.status(401).json({ error: 'Client authentication required' });
  }

  if (clientAccountId !== UKEF_CLIENT_ACCOUNT_ID) {
    return res.status(403).json({
      error: 'forbidden',
      message: 'This feature is only available for UKEF',
    });
  }
  next();
}

// ─── Shared query helpers ────────────────────────────────────────────────────

/** SQL fragment for qualifying leads: approved or published QA status */
const QUALIFIED_FILTER = sql`(${leads.qaStatus} IN ('approved', 'published'))`;

/** SQL fragment for date cutoff */
const DATE_CUTOFF = sql`${leads.deliveredAt} >= ${UKEF_CUTOFF_DATE}`;

// ─── Routes ──────────────────────────────────────────────────────────────────

/**
 * GET /summary — Aggregate metrics across all UKEF campaigns
 */
router.get('/summary',
  requireFeatureFlag('ukef_campaign_reports'),
  requireUkefClient,
  async (req: Request, res: Response) => {
    try {
      // Get all campaign IDs for this client
      const ukefCampaigns = await db
        .select({ id: campaigns.id })
        .from(campaigns)
        .where(eq(campaigns.clientAccountId, UKEF_CLIENT_ACCOUNT_ID));

      const campaignIds = ukefCampaigns.map(c => c.id);

      if (campaignIds.length === 0) {
        return res.json({
          totalQualifiedLeads: 0,
          totalCampaigns: 0,
          avgAiScore: null,
          leadsByMonth: [],
        } as UkefReportsSummaryMetrics);
      }

      // Summary metrics
      const metricsResult = await db.execute(sql`
        SELECT 
          count(*) as total_qualified,
          round(avg(ai_score)::numeric, 1) as avg_ai_score
        FROM leads
        WHERE campaign_id = ANY(${campaignIds})
          AND ${QUALIFIED_FILTER}
          AND ${DATE_CUTOFF}
      `);
      const metrics = (metricsResult.rows as any[])[0];

      // Leads by month
      const monthlyData = await db.execute(sql`
        SELECT 
          to_char(delivered_at, 'YYYY-MM') as month,
          count(*) as count
        FROM leads
        WHERE campaign_id = ANY(${campaignIds})
          AND ${QUALIFIED_FILTER}
          AND ${DATE_CUTOFF}
        GROUP BY to_char(delivered_at, 'YYYY-MM')
        ORDER BY month ASC
      `);

      const summary: UkefReportsSummaryMetrics = {
        totalQualifiedLeads: Number(metrics?.total_qualified || 0),
        totalCampaigns: campaignIds.length,
        avgAiScore: metrics?.avg_ai_score ? Number(metrics.avg_ai_score) : null,
        leadsByMonth: (monthlyData.rows || []).map((r: any) => ({
          month: r.month,
          count: Number(r.count),
        })),
      };

      res.json(summary);
    } catch (error: any) {
      console.error('[UkefReports] Summary error:', error);
      res.status(500).json({ error: 'Failed to fetch summary' });
    }
  }
);

/**
 * GET /campaigns — List UKEF campaigns with qualification stats
 */
router.get('/campaigns',
  requireFeatureFlag('ukef_campaign_reports'),
  requireUkefClient,
  async (req: Request, res: Response) => {
    try {
      const result = await db.execute(sql`
        SELECT
          c.id,
          c.name,
          c.status,
          count(CASE WHEN l.qa_status IN ('approved', 'published') AND l.delivered_at >= ${UKEF_CUTOFF_DATE} THEN 1 END) as qualified_lead_count,
          count(CASE WHEN l.delivered_at >= ${UKEF_CUTOFF_DATE} THEN 1 END) as total_lead_count,
          round(avg(CASE WHEN l.qa_status IN ('approved', 'published') AND l.delivered_at >= ${UKEF_CUTOFF_DATE} THEN l.ai_score END)::numeric, 1) as avg_ai_score,
          min(CASE WHEN l.qa_status IN ('approved', 'published') AND l.delivered_at >= ${UKEF_CUTOFF_DATE} THEN l.delivered_at END) as earliest,
          max(CASE WHEN l.qa_status IN ('approved', 'published') AND l.delivered_at >= ${UKEF_CUTOFF_DATE} THEN l.delivered_at END) as latest
        FROM campaigns c
        LEFT JOIN leads l ON l.campaign_id = c.id
        WHERE c.client_account_id = ${UKEF_CLIENT_ACCOUNT_ID}
        GROUP BY c.id, c.name, c.status
        ORDER BY qualified_lead_count DESC
      `);

      const campaignList: UkefCampaignSummary[] = (result.rows || []).map((r: any) => ({
        id: r.id,
        name: r.name,
        status: r.status,
        qualifiedLeadCount: Number(r.qualified_lead_count || 0),
        totalLeadCount: Number(r.total_lead_count || 0),
        avgAiScore: r.avg_ai_score ? Number(r.avg_ai_score) : null,
        dateRange: {
          earliest: r.earliest ? String(r.earliest) : null,
          latest: r.latest ? String(r.latest) : null,
        },
      }));

      res.json(campaignList);
    } catch (error: any) {
      console.error('[UkefReports] Campaigns error:', error);
      res.status(500).json({ error: 'Failed to fetch campaigns' });
    }
  }
);

/**
 * GET /campaigns/:id/leads — Paginated qualified leads for a specific campaign
 */
router.get('/campaigns/:id/leads',
  requireFeatureFlag('ukef_campaign_reports'),
  requireUkefClient,
  async (req: Request, res: Response) => {
    try {
      const campaignId = req.params.id;
      const page = Math.max(1, Number(req.query.page) || 1);
      const pageSize = Math.min(100, Math.max(10, Number(req.query.pageSize) || 25));
      const offset = (page - 1) * pageSize;

      // Verify campaign belongs to UKEF
      const [campaign] = await db
        .select({ id: campaigns.id, clientAccountId: campaigns.clientAccountId })
        .from(campaigns)
        .where(eq(campaigns.id, campaignId))
        .limit(1);

      if (!campaign || campaign.clientAccountId !== UKEF_CLIENT_ACCOUNT_ID) {
        return res.status(404).json({ error: 'Campaign not found' });
      }

      // Count total qualified leads
      const countRows = await db.execute(sql`
        SELECT count(*) as total
        FROM leads
        WHERE campaign_id = ${campaignId}
          AND ${QUALIFIED_FILTER}
          AND ${DATE_CUTOFF}
      `);
      const countResult = (countRows.rows as any[])[0];

      const total = Number(countResult?.total || 0);

      // Fetch leads
      const leadsResult = await db.execute(sql`
        SELECT
          l.id,
          l.contact_name,
          l.company_name,
          l.job_title,
          l.email,
          l.qa_status,
          l.ai_score,
          l.ai_qualification_status,
          l.delivered_at,
          l.created_at,
          (l.recording_url IS NOT NULL OR l.recording_s3_key IS NOT NULL) as has_recording,
          (l.transcript IS NOT NULL) as has_transcript
        FROM leads l
        WHERE l.campaign_id = ${campaignId}
          AND ${QUALIFIED_FILTER}
          AND ${DATE_CUTOFF}
        ORDER BY l.delivered_at DESC NULLS LAST
        LIMIT ${pageSize}
        OFFSET ${offset}
      `);

      const leadList: UkefCampaignLeadListItem[] = (leadsResult.rows || []).map((r: any) => ({
        id: r.id,
        contactName: r.contact_name,
        companyName: r.company_name,
        jobTitle: r.job_title,
        email: r.email,
        qaStatus: r.qa_status,
        aiScore: r.ai_score ? Number(r.ai_score) : null,
        aiQualificationStatus: r.ai_qualification_status,
        deliveredAt: r.delivered_at ? String(r.delivered_at) : null,
        createdAt: String(r.created_at),
        hasRecording: r.has_recording === true || r.has_recording === 't',
        hasTranscript: r.has_transcript === true || r.has_transcript === 't',
      }));

      const response: UkefCampaignLeadsResponse = {
        leads: leadList,
        total,
        page,
        pageSize,
        totalPages: Math.ceil(total / pageSize),
      };

      res.json(response);
    } catch (error: any) {
      console.error('[UkefReports] Campaign leads error:', error);
      res.status(500).json({ error: 'Failed to fetch leads' });
    }
  }
);

/**
 * GET /leads/:id — Full lead detail with transcript and QA data
 */
router.get('/leads/:id',
  requireFeatureFlag('ukef_campaign_reports'),
  requireUkefClient,
  async (req: Request, res: Response) => {
    try {
      const leadId = req.params.id;

      const result = await db.execute(sql`
        SELECT
          l.id,
          l.contact_name,
          l.company_name,
          l.job_title,
          l.email,
          l.phone,
          l.department,
          l.seniority_level,
          l.campaign_id,
          c.name as campaign_name,
          l.qa_status,
          l.ai_score,
          l.ai_qualification_status,
          l.ai_analysis,
          l.qa_data,
          l.delivered_at,
          l.submitted_at,
          l.published_at,
          l.created_at,
          (l.recording_url IS NOT NULL OR l.recording_s3_key IS NOT NULL) as has_recording,
          l.transcript,
          l.transcription_status,
          dca.full_transcript as call_transcript
        FROM leads l
        JOIN campaigns c ON c.id = l.campaign_id
        LEFT JOIN dialer_call_attempts dca ON dca.id = l.call_attempt_id
        WHERE l.id = ${leadId}
          AND c.client_account_id = ${UKEF_CLIENT_ACCOUNT_ID}
          AND ${QUALIFIED_FILTER}
      `);

      if (!result.rows || result.rows.length === 0) {
        return res.status(404).json({ error: 'Lead not found' });
      }

      const r: any = result.rows[0];

      // Use best available transcript
      const transcript = r.transcript || r.call_transcript || null;

      const detail: UkefLeadDetail = {
        id: r.id,
        contactName: r.contact_name,
        companyName: r.company_name,
        jobTitle: r.job_title,
        email: r.email,
        phone: r.phone,
        department: r.department,
        seniorityLevel: r.seniority_level,
        campaignId: r.campaign_id,
        campaignName: r.campaign_name,
        qaStatus: r.qa_status,
        aiScore: r.ai_score ? Number(r.ai_score) : null,
        aiQualificationStatus: r.ai_qualification_status,
        aiAnalysis: r.ai_analysis ? (typeof r.ai_analysis === 'string' ? JSON.parse(r.ai_analysis) : r.ai_analysis) : null,
        qaData: r.qa_data ? (typeof r.qa_data === 'string' ? JSON.parse(r.qa_data) : r.qa_data) : null,
        deliveredAt: r.delivered_at ? String(r.delivered_at) : null,
        submittedAt: r.submitted_at ? String(r.submitted_at) : null,
        publishedAt: r.published_at ? String(r.published_at) : null,
        createdAt: String(r.created_at),
        hasRecording: r.has_recording === true || r.has_recording === 't',
        recordingUrl: null, // Never inline — use /recording-link endpoint
        transcript,
        transcriptionStatus: r.transcription_status,
      };

      res.json(detail);
    } catch (error: any) {
      console.error('[UkefReports] Lead detail error:', error);
      res.status(500).json({ error: 'Failed to fetch lead detail' });
    }
  }
);

/**
 * GET /leads/:id/recording-link — Generate a time-limited signed URL for the recording
 * 
 * Security: No audio is stored/proxied. Only a signed URL is returned.
 * URL expires after RECORDING_URL_EXPIRY_SECONDS (default 1 hour).
 */
router.get('/leads/:id/recording-link',
  requireFeatureFlag('ukef_campaign_reports'),
  requireUkefClient,
  async (req: Request, res: Response) => {
    try {
      const leadId = req.params.id;

      // Fetch lead with recording info
      const result = await db.execute(sql`
        SELECT l.id, l.recording_url, l.recording_s3_key
        FROM leads l
        JOIN campaigns c ON c.id = l.campaign_id
        WHERE l.id = ${leadId}
          AND c.client_account_id = ${UKEF_CLIENT_ACCOUNT_ID}
          AND ${QUALIFIED_FILTER}
      `);

      if (!result.rows || result.rows.length === 0) {
        return res.status(404).json({ error: 'Lead not found' });
      }

      const lead: any = result.rows[0];

      let response: UkefRecordingLinkResponse;

      if (lead.recording_s3_key) {
        // Generate fresh signed URL from GCS
        try {
          const url = await getPresignedDownloadUrl(
            lead.recording_s3_key,
            RECORDING_URL_EXPIRY_SECONDS
          );
          response = {
            leadId,
            url,
            expiresInSeconds: RECORDING_URL_EXPIRY_SECONDS,
            source: 'gcs',
          };
        } catch (err: any) {
          console.error('[UkefReports] GCS signed URL error:', err.message);
          // Fall back to direct recording_url if GCS fails
          response = {
            leadId,
            url: lead.recording_url || null,
            expiresInSeconds: 0,
            source: lead.recording_url ? 'direct' : 'none',
          };
        }
      } else if (lead.recording_url) {
        // Pass through existing recording URL (may be expired AWS pre-signed URL)
        response = {
          leadId,
          url: lead.recording_url,
          expiresInSeconds: 0,
          source: 'direct',
        };
      } else {
        response = {
          leadId,
          url: null,
          expiresInSeconds: 0,
          source: 'none',
        };
      }

      res.json(response);
    } catch (error: any) {
      console.error('[UkefReports] Recording link error:', error);
      res.status(500).json({ error: 'Failed to generate recording link' });
    }
  }
);

/**
 * GET /export — CSV export of all qualified leads across UKEF campaigns
 */
router.get('/export',
  requireFeatureFlag('ukef_campaign_reports'),
  requireUkefClient,
  async (req: Request, res: Response) => {
    try {
      const result = await db.execute(sql`
        SELECT
          l.id as lead_id,
          l.contact_name,
          l.company_name,
          l.job_title,
          l.email,
          c.name as campaign_name,
          l.qa_status,
          l.ai_score,
          l.delivered_at,
          (l.recording_url IS NOT NULL OR l.recording_s3_key IS NOT NULL) as has_recording,
          (l.transcript IS NOT NULL) as has_transcript
        FROM leads l
        JOIN campaigns c ON c.id = l.campaign_id
        WHERE c.client_account_id = ${UKEF_CLIENT_ACCOUNT_ID}
          AND ${QUALIFIED_FILTER}
          AND ${DATE_CUTOFF}
        ORDER BY l.delivered_at DESC NULLS LAST
      `);

      const rows = result.rows || [];

      // Build CSV
      const headers = [
        'Lead ID', 'Contact Name', 'Company', 'Job Title', 'Email',
        'Campaign', 'QA Status', 'AI Score', 'Delivered Date',
        'Has Recording', 'Has Transcript'
      ];

      const csvRows = [headers.join(',')];
      for (const r of rows as any[]) {
        csvRows.push([
          escapeCsvField(r.lead_id),
          escapeCsvField(r.contact_name || ''),
          escapeCsvField(r.company_name || ''),
          escapeCsvField(r.job_title || ''),
          escapeCsvField(r.email || ''),
          escapeCsvField(r.campaign_name || ''),
          escapeCsvField(r.qa_status || ''),
          r.ai_score ? String(r.ai_score) : '',
          r.delivered_at ? new Date(r.delivered_at).toISOString().split('T')[0] : '',
          (r.has_recording === true || r.has_recording === 't') ? 'Yes' : 'No',
          (r.has_transcript === true || r.has_transcript === 't') ? 'Yes' : 'No',
        ].join(','));
      }

      const csv = csvRows.join('\n');

      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', `attachment; filename="ukef-qualified-leads-${new Date().toISOString().split('T')[0]}.csv"`);
      res.send(csv);
    } catch (error: any) {
      console.error('[UkefReports] Export error:', error);
      res.status(500).json({ error: 'Failed to export leads' });
    }
  }
);

function escapeCsvField(value: string): string {
  if (value.includes(',') || value.includes('"') || value.includes('\n')) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

export default router;