/**
 * UKEF Transcript QA Pipeline — API Routes
 *
 * All routes are gated behind:
 * 1. Feature flag: ukef_transcript_qa (default OFF)
 * 2. Hard client gate: only Lightcast/UKEF client account
 *
 * Admin-trigger pattern: pipeline runs are triggered via POST requests from
 * the dashboard, not by background intervals. This keeps the feature safe
 * and controllable.
 *
 * Routes:
 * - GET  /api/client-portal/ukef-transcript-qa/status         — Pipeline status & metrics
 * - POST /api/client-portal/ukef-transcript-qa/run             — Trigger full pipeline run
 * - POST /api/client-portal/ukef-transcript-qa/assess          — Assess transcript quality only
 * - POST /api/client-portal/ukef-transcript-qa/retranscribe    — Retranscribe missing/partial only
 * - POST /api/client-portal/ukef-transcript-qa/validate        — Validate dispositions only
 * - GET  /api/client-portal/ukef-transcript-qa/review-queue    — Get disposition review queue
 * - POST /api/client-portal/ukef-transcript-qa/review/:id      — Apply review decision
 * - GET  /api/client-portal/ukef-transcript-qa/audit-log       — Get audit trail
 */

import { Router, Request, Response, NextFunction } from 'express';
import { db } from '../../db';
import { sql } from 'drizzle-orm';
import { requireFeatureFlag } from '../../feature-flags';
import { UKEF_CLIENT_ACCOUNT_ID } from './types';
import type {
  PipelineStatusResponse,
  ReviewQueueResponse,
  PipelineRunResponse,
  ReviewActionResponse,
  PipelineConfig,
} from './types';
import { DEFAULT_PIPELINE_CONFIG } from './types';
import { assessTranscriptQuality } from './transcript-classifier';
import { validateDispositions, applyReviewDecision } from './disposition-validator';
import { processRetranscriptionQueue } from './retranscription-job';

const router = Router();

// ─── Client Gate Middleware ──────────────────────────────────────────────────

function requireUkefClient(req: Request, res: Response, next: NextFunction) {
  // Check for client portal user
  const clientAccountId = (req as any).clientUser?.clientAccountId;
  // Also check for admin/internal user (accessible via admin panel)
  const isAdmin = (req as any).user?.role === 'super_admin' || (req as any).user?.role === 'admin';

  if (isAdmin) {
    return next(); // Admins can access for oversight
  }

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

// ─── GET /status — Pipeline metrics ─────────────────────────────────────────

router.get(
  '/status',
  requireFeatureFlag('ukef_transcript_qa'),
  requireUkefClient,
  async (_req: Request, res: Response) => {
    try {
      // Get transcript quality stats
      const transcriptStats = await db.execute(sql`
        SELECT transcript_status::text as status, count(*)::text as count
        FROM transcript_quality_assessments
        GROUP BY transcript_status
      `);

      // Get disposition validation stats
      const dispositionStats = await db.execute(sql`
        SELECT validation_status::text as status, count(*)::text as count
        FROM disposition_review_tasks
        GROUP BY validation_status
      `);

      // Get last pipeline run
      const lastRun = await db.execute(sql`
        SELECT created_at::text
        FROM transcript_qa_audit_log
        WHERE action = 'pipeline_run'
        ORDER BY created_at DESC
        LIMIT 1
      `);

      // Total assessed
      const totalResult = await db.execute(sql`
        SELECT count(*)::text as total FROM transcript_quality_assessments
      `);

      // Review queue count
      const reviewQueueResult = await db.execute(sql`
        SELECT count(*)::text as count
        FROM disposition_review_tasks
        WHERE validation_status = 'mismatch'
      `);

      // Retranscription queue count
      const retranscriptionQueueResult = await db.execute(sql`
        SELECT count(*)::text as count
        FROM transcript_quality_assessments
        WHERE transcript_status IN ('missing', 'partial')
          AND transcript_source = 'existing'
      `);

      // Build response
      const tStats: Record = { missing: 0, partial: 0, complete: 0, failed: 0 };
      for (const row of (transcriptStats.rows || [])) {
        tStats[row.status] = parseInt(row.count, 10);
      }

      const dStats: Record = { pending: 0, validated: 0, mismatch: 0, auto_corrected: 0, reviewed: 0 };
      for (const row of (dispositionStats.rows || [])) {
        dStats[row.status] = parseInt(row.count, 10);
      }

      const response: PipelineStatusResponse = {
        lastRun: (lastRun.rows || [])[0]?.created_at
          ? new Date((lastRun.rows || [])[0].created_at)
          : null,
        totalAssessed: parseInt((totalResult.rows || [])[0]?.total || '0', 10),
        transcriptStats: tStats as any,
        dispositionStats: dStats as any,
        retranscriptionQueue: parseInt((retranscriptionQueueResult.rows || [])[0]?.count || '0', 10),
        reviewQueue: parseInt((reviewQueueResult.rows || [])[0]?.count || '0', 10),
      };

      res.json(response);
    } catch (err) {
      console.error('[UKEF-TQA] Status error:', err);
      res.status(500).json({ error: 'Failed to fetch pipeline status' });
    }
  }
);

// ─── POST /run — Full pipeline run ──────────────────────────────────────────

router.post(
  '/run',
  requireFeatureFlag('ukef_transcript_qa'),
  requireUkefClient,
  async (req: Request, res: Response) => {
    const startTime = Date.now();
    try {
      const config: PipelineConfig = {
        ...DEFAULT_PIPELINE_CONFIG,
        ...(req.body?.config || {}),
      };

      // Step 1: Assess transcript quality
      const assessResult = await assessTranscriptQuality(config);

      // Step 2: Retranscribe missing/partial
      const retranscribeResult = await processRetranscriptionQueue(config);

      // Step 3: Validate dispositions
      const validateResult = await validateDispositions(config);

      const durationMs = Date.now() - startTime;

      // Audit log the pipeline run
      await db.execute(sql`
        INSERT INTO transcript_qa_audit_log
          (id, lead_id, action, new_value, performed_by, metadata)
        VALUES (
          gen_random_uuid()::text,
          'pipeline',
          'pipeline_run',
          ${JSON.stringify({
            assessed: assessResult.assessed,
            retranscribed: retranscribeResult.retranscribed,
            validated: validateResult.validated,
            mismatches: validateResult.mismatches,
            durationMs,
          })}::jsonb,
          ${(req as any).user?.id || (req as any).clientUser?.id || 'system'},
          ${JSON.stringify({ config })}::jsonb
        )
      `);

      const response: PipelineRunResponse = {
        success: true,
        assessed: assessResult.assessed,
        retranscribed: retranscribeResult.retranscribed,
        validated: validateResult.validated,
        mismatches: validateResult.mismatches,
        errors: validateResult.errors + retranscribeResult.failed,
        durationMs,
      };

      res.json(response);
    } catch (err) {
      console.error('[UKEF-TQA] Pipeline run error:', err);
      res.status(500).json({ error: 'Pipeline run failed', details: String(err) });
    }
  }
);

// ─── POST /assess — Assess transcript quality only ──────────────────────────

router.post(
  '/assess',
  requireFeatureFlag('ukef_transcript_qa'),
  requireUkefClient,
  async (req: Request, res: Response) => {
    try {
      const config: PipelineConfig = { ...DEFAULT_PIPELINE_CONFIG, ...(req.body?.config || {}) };
      const result = await assessTranscriptQuality(config);
      res.json({ success: true, ...result });
    } catch (err) {
      console.error('[UKEF-TQA] Assess error:', err);
      res.status(500).json({ error: 'Assessment failed' });
    }
  }
);

// ─── POST /retranscribe — Retranscribe missing/partial ──────────────────────

router.post(
  '/retranscribe',
  requireFeatureFlag('ukef_transcript_qa'),
  requireUkefClient,
  async (req: Request, res: Response) => {
    try {
      const config: PipelineConfig = { ...DEFAULT_PIPELINE_CONFIG, ...(req.body?.config || {}) };
      const result = await processRetranscriptionQueue(config);
      res.json({ success: true, ...result });
    } catch (err) {
      console.error('[UKEF-TQA] Retranscribe error:', err);
      res.status(500).json({ error: 'Retranscription failed' });
    }
  }
);

// ─── POST /validate — Validate dispositions only ───────────────────────────

router.post(
  '/validate',
  requireFeatureFlag('ukef_transcript_qa'),
  requireUkefClient,
  async (req: Request, res: Response) => {
    try {
      const config: PipelineConfig = { ...DEFAULT_PIPELINE_CONFIG, ...(req.body?.config || {}) };
      const result = await validateDispositions(config);
      res.json({ success: true, ...result });
    } catch (err) {
      console.error('[UKEF-TQA] Validate error:', err);
      res.status(500).json({ error: 'Validation failed' });
    }
  }
);

// ─── GET /review-queue — Get disposition mismatches for review ──────────────

router.get(
  '/review-queue',
  requireFeatureFlag('ukef_transcript_qa'),
  requireUkefClient,
  async (req: Request, res: Response) => {
    try {
      const page = Math.max(1, parseInt(req.query.page as string, 10) || 1);
      const pageSize = Math.min(100, Math.max(1, parseInt(req.query.pageSize as string, 10) || 20));
      const offset = (page - 1) * pageSize;

      // Status filter (default: show mismatches)
      const statusFilter = (req.query.status as string) || 'mismatch';

      // Get total count
      const countResult = await db.execute(sql`
        SELECT count(*)::text as total
        FROM disposition_review_tasks
        WHERE validation_status = ${statusFilter}::disposition_validation_status
      `);

      // Get items with lead/contact/campaign info
      const items = await db.execute(sql`
        SELECT drt.id, drt.lead_id,
               dca.call_session_id,
               concat(co.first_name, ' ', co.last_name) as contact_name,
               co.email as contact_email,
               ca.name as campaign_name,
               drt.existing_disposition,
               drt.recommended_disposition,
               drt.confidence::text,
               drt.rationale,
               drt.evidence_snippets,
               left(l.transcript, 200) as transcript_preview,
               drt.validation_status::text,
               drt.created_at::text
        FROM disposition_review_tasks drt
        JOIN leads l ON l.id = drt.lead_id
        LEFT JOIN dialer_call_attempts dca ON dca.id = l.call_attempt_id
        LEFT JOIN contacts co ON co.id = l.contact_id
        LEFT JOIN campaigns ca ON ca.id = drt.campaign_id
        WHERE drt.validation_status = ${statusFilter}::disposition_validation_status
        ORDER BY drt.confidence ASC, drt.created_at DESC
        LIMIT ${pageSize} OFFSET ${offset}
      `);

      const response: ReviewQueueResponse = {
        items: (items.rows || []).map(row => ({
          id: row.id,
          leadId: row.lead_id,
          callSessionId: row.call_session_id,
          contactName: row.contact_name,
          contactEmail: row.contact_email,
          campaignName: row.campaign_name,
          existingDisposition: row.existing_disposition,
          recommendedDisposition: row.recommended_disposition,
          confidence: row.confidence ? parseFloat(row.confidence) : null,
          rationale: row.rationale,
          evidenceSnippets: row.evidence_snippets || [],
          transcriptPreview: row.transcript_preview,
          validationStatus: row.validation_status as any,
          createdAt: new Date(row.created_at),
        })),
        total: parseInt((countResult.rows || [])[0]?.total || '0', 10),
        page,
        pageSize,
      };

      res.json(response);
    } catch (err) {
      console.error('[UKEF-TQA] Review queue error:', err);
      res.status(500).json({ error: 'Failed to fetch review queue' });
    }
  }
);

// ─── POST /review/:id — Apply review decision ──────────────────────────────

router.post(
  '/review/:id',
  requireFeatureFlag('ukef_transcript_qa'),
  requireUkefClient,
  async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const { action, overrideDisposition, reviewNotes } = req.body;

      if (!action || !['accept', 'reject', 'override'].includes(action)) {
        return res.status(400).json({ error: 'Invalid action. Must be accept, reject, or override.' });
      }

      if (action === 'override' && !overrideDisposition) {
        return res.status(400).json({ error: 'overrideDisposition required when action is override.' });
      }

      const reviewedBy = (req as any).user?.id || (req as any).clientUser?.id || 'unknown';
      const result = await applyReviewDecision(id, action, reviewedBy, overrideDisposition, reviewNotes);

      if (!result.success) {
        return res.status(404).json({ error: 'Review task not found' });
      }

      const response: ReviewActionResponse = {
        success: true,
        taskId: id,
        action,
        newDisposition: result.newDisposition,
      };

      res.json(response);
    } catch (err) {
      console.error('[UKEF-TQA] Review action error:', err);
      res.status(500).json({ error: 'Review action failed' });
    }
  }
);

// ─── GET /audit-log — Audit trail ────────────────────────────────────────────

router.get(
  '/audit-log',
  requireFeatureFlag('ukef_transcript_qa'),
  requireUkefClient,
  async (req: Request, res: Response) => {
    try {
      const page = Math.max(1, parseInt(req.query.page as string, 10) || 1);
      const pageSize = Math.min(100, Math.max(1, parseInt(req.query.pageSize as string, 10) || 50));
      const offset = (page - 1) * pageSize;
      const leadId = req.query.leadId as string | undefined;

      let whereClause = sql`1=1`;
      if (leadId) {
        whereClause = sql`lead_id = ${leadId}`;
      }

      const countResult = await db.execute(sql`
        SELECT count(*)::text as total
        FROM transcript_qa_audit_log
        WHERE ${whereClause}
      `);

      const logRows = await db.execute(sql`
        SELECT id, lead_id, action, old_value, new_value,
               performed_by, model_version, provider, metadata,
               created_at::text
        FROM transcript_qa_audit_log
        WHERE ${whereClause}
        ORDER BY created_at DESC
        LIMIT ${pageSize} OFFSET ${offset}
      `);

      res.json({
        items: logRows.rows || [],
        total: parseInt((countResult.rows || [])[0]?.total || '0', 10),
        page,
        pageSize,
      });
    } catch (err) {
      console.error('[UKEF-TQA] Audit log error:', err);
      res.status(500).json({ error: 'Failed to fetch audit log' });
    }
  }
);

export default router;