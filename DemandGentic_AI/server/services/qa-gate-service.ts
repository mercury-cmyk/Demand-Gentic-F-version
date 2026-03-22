/**
 * QA Gate Service
 * Universal QA gating for all client-facing content
 * (simulations, mock calls, reports, data exports)
 */

import { db } from "../db";
import {
  qaGatedContent,
  clientSimulationSessions,
  clientMockCalls,
  clientReports,
  clientAccounts,
  clientProjects,
  campaigns,
  activityLog,
  type QAGatedContent,
} from "@shared/schema";
import { eq, and, desc, sql, inArray, isNull, isNotNull } from "drizzle-orm";

// QA Content Types
export type QAContentType = 'simulation' | 'mock_call' | 'report' | 'data_export';

// QA Status Types
export type QAStatus = 'new' | 'under_review' | 'approved' | 'rejected' | 'returned' | 'published';

// Context for registering content
export interface QARegistrationContext {
  campaignId?: string;
  clientAccountId?: string;
  projectId?: string;
  createdBy?: string;
}

// Review submission interface
export interface QAReview {
  status: QAStatus;
  score?: number;
  notes?: string;
  reviewerId: string;
}

// Analysis result interface
export interface QAAnalysisResult {
  score: number;
  qualificationStatus: 'qualified' | 'not_qualified' | 'needs_review';
  highlights: string[];
  recommendations: string[];
  autoApproved: boolean;
}

// Sync result interface
export interface SyncResult {
  synced: number;
  failed: number;
  errors: string[];
}

export interface QALegacyMigrationResult {
  simulationsLinked: number;
  mockCallsLinked: number;
  reportsLinked: number;
  alreadyLinked: number;
  failures: number;
  totalLinked: number;
}

/**
 * Register content for QA gating
 * Creates a qa_gated_content record for the specified content
 */
export async function registerContent(
  contentType: QAContentType,
  contentId: string,
  context: QARegistrationContext
): Promise {
  const [existing] = await db
    .select()
    .from(qaGatedContent)
    .where(
      and(
        eq(qaGatedContent.contentType, contentType),
        eq(qaGatedContent.contentId, contentId),
        context.clientAccountId
          ? eq(qaGatedContent.clientAccountId, context.clientAccountId)
          : sql`true`
      )
    )
    .limit(1);

  if (existing) {
    return existing;
  }

  const [newContent] = await db
    .insert(qaGatedContent)
    .values({
      contentType,
      contentId,
      campaignId: context.campaignId,
      clientAccountId: context.clientAccountId,
      projectId: context.projectId,
      qaStatus: 'new',
      clientVisible: false,
      createdBy: context.createdBy,
    })
    .returning();

  // Log the registration
  if (context.clientAccountId) {
    try {
      await db.insert(activityLog).values({
        eventType: 'qa_analysis_started',
        entityType: 'lead',
        entityId: newContent.id,
        createdBy: context.createdBy,
        payload: {
          contentType,
          contentId,
          clientAccountId: context.clientAccountId,
        },
      });
    } catch (logErr) {
      console.error('[QA-Gate] Failed to log content registration:', logErr);
    }
  }

  return newContent;
}

/**
 * Auto-analyze content quality
 * Returns analysis result and optionally auto-approves based on score threshold
 */
export async function analyzeContent(
  qaContentId: string,
  autoApproveThreshold: number = 85
): Promise {
  const [content] = await db
    .select()
    .from(qaGatedContent)
    .where(eq(qaGatedContent.id, qaContentId))
    .limit(1);

  if (!content) return null;

  // Get auto-approve threshold from project config if available
  let threshold = autoApproveThreshold;
  if (content.projectId) {
    const [project] = await db
      .select()
      .from(clientProjects)
      .where(eq(clientProjects.id, content.projectId))
      .limit(1);
    if (project?.qaGateConfig) {
      const config = project.qaGateConfig as { enabled: boolean; autoApproveThreshold: number; requireManualReview: boolean };
      threshold = config.autoApproveThreshold || threshold;
    }
  }

  // Analyze based on content type
  let analysisResult: QAAnalysisResult;

  switch (content.contentType) {
    case 'simulation':
      analysisResult = await analyzeSimulation(content.contentId);
      break;
    case 'mock_call':
      analysisResult = await analyzeMockCall(content.contentId);
      break;
    case 'report':
      analysisResult = await analyzeReport(content.contentId);
      break;
    default:
      analysisResult = {
        score: 100,
        qualificationStatus: 'qualified',
        highlights: ['Content type does not require analysis'],
        recommendations: [],
        autoApproved: true,
      };
  }

  // Determine auto-approval
  const autoApproved = analysisResult.score >= threshold && analysisResult.qualificationStatus === 'qualified';
  analysisResult.autoApproved = autoApproved;

  // Update the QA content record
  const newStatus: QAStatus = autoApproved ? 'approved' : (analysisResult.score  {
  const [session] = await db
    .select()
    .from(clientSimulationSessions)
    .where(eq(clientSimulationSessions.id, sessionId))
    .limit(1);

  if (!session) {
    return {
      score: 0,
      qualificationStatus: 'not_qualified',
      highlights: ['Simulation session not found'],
      recommendations: ['Verify session ID exists'],
      autoApproved: false,
    };
  }

  // Use existing evaluation if available
  if (session.evaluationResult && session.evaluationScore) {
    const evalResult = session.evaluationResult as { score?: number; strengths?: string[]; improvements?: string[]; summary?: string };
    return {
      score: session.evaluationScore,
      qualificationStatus: session.evaluationScore >= 70 ? 'qualified' : (session.evaluationScore >= 40 ? 'needs_review' : 'not_qualified'),
      highlights: evalResult.strengths || [],
      recommendations: evalResult.improvements || [],
      autoApproved: false,
    };
  }

  // Basic scoring based on session data
  let score = 50; // Base score
  const highlights: string[] = [];
  const recommendations: string[] = [];

  // Check duration
  if (session.durationSeconds && session.durationSeconds > 60) {
    score += 15;
    highlights.push('Good conversation duration');
  } else if (session.durationSeconds && session.durationSeconds  4) {
    score += 20;
    highlights.push('Complete conversation transcript');
  } else {
    recommendations.push('Limited conversation content');
  }

  // Check for session name/context
  if (session.sessionName) {
    score += 5;
    highlights.push('Named session for easy reference');
  }

  // Check configuration completeness
  if (session.simulationConfig) {
    score += 10;
    highlights.push('Configured simulation parameters');
  }

  return {
    score: Math.min(100, score),
    qualificationStatus: score >= 70 ? 'qualified' : (score >= 40 ? 'needs_review' : 'not_qualified'),
    highlights,
    recommendations,
    autoApproved: false,
  };
}

/**
 * Analyze mock call quality
 */
async function analyzeMockCall(callId: string): Promise {
  const [call] = await db
    .select()
    .from(clientMockCalls)
    .where(eq(clientMockCalls.id, callId))
    .limit(1);

  if (!call) {
    return {
      score: 0,
      qualificationStatus: 'not_qualified',
      highlights: ['Mock call not found'],
      recommendations: ['Verify call ID exists'],
      autoApproved: false,
    };
  }

  // Use existing AI analysis if available
  if (call.aiAnalysis && call.aiScore) {
    const analysis = call.aiAnalysis as { score?: number; qualificationStatus?: string; highlights?: string[]; recommendations?: string[] };
    return {
      score: call.aiScore,
      qualificationStatus: call.aiScore >= 70 ? 'qualified' : (call.aiScore >= 40 ? 'needs_review' : 'not_qualified'),
      highlights: analysis.highlights || [],
      recommendations: analysis.recommendations || [],
      autoApproved: false,
    };
  }

  // Basic scoring based on call data
  let score = 50; // Base score
  const highlights: string[] = [];
  const recommendations: string[] = [];

  // Check recording availability
  if (call.recordingUrl) {
    score += 20;
    highlights.push('Recording available for review');
  } else {
    recommendations.push('No recording available');
  }

  // Check transcript
  if (call.transcript && call.transcript.length > 100) {
    score += 15;
    highlights.push('Transcript available');
  } else {
    recommendations.push('Missing or incomplete transcript');
  }

  // Check duration
  if (call.durationSeconds && call.durationSeconds > 30) {
    score += 10;
    highlights.push('Adequate call duration');
  } else if (call.durationSeconds && call.durationSeconds = 70 ? 'qualified' : (score >= 40 ? 'needs_review' : 'not_qualified'),
    highlights,
    recommendations,
    autoApproved: false,
  };
}

/**
 * Analyze report quality
 */
async function analyzeReport(reportId: string): Promise {
  const [report] = await db
    .select()
    .from(clientReports)
    .where(eq(clientReports.id, reportId))
    .limit(1);

  if (!report) {
    return {
      score: 0,
      qualificationStatus: 'not_qualified',
      highlights: ['Report not found'],
      recommendations: ['Verify report ID exists'],
      autoApproved: false,
    };
  }

  // Basic scoring based on report data
  let score = 60; // Base score for reports
  const highlights: string[] = [];
  const recommendations: string[] = [];

  // Check report data completeness
  if (report.reportData && Object.keys(report.reportData).length > 0) {
    score += 15;
    highlights.push('Report data present');
  } else {
    recommendations.push('Report data is empty');
    score -= 20;
  }

  // Check summary
  if (report.reportSummary && report.reportSummary.length > 50) {
    score += 10;
    highlights.push('Summary provided');
  } else {
    recommendations.push('Add a descriptive summary');
  }

  // Check date range
  if (report.reportPeriodStart && report.reportPeriodEnd) {
    score += 10;
    highlights.push('Report period defined');
  } else {
    recommendations.push('Specify report date range');
  }

  // Check file availability
  if (report.fileUrl) {
    score += 5;
    highlights.push('Export file available');
  }

  return {
    score: Math.min(100, score),
    qualificationStatus: score >= 70 ? 'qualified' : (score >= 40 ? 'needs_review' : 'not_qualified'),
    highlights,
    recommendations,
    autoApproved: false,
  };
}

/**
 * Submit manual QA review
 */
export async function submitReview(
  qaContentId: string,
  review: QAReview
): Promise {
  const [content] = await db
    .select()
    .from(qaGatedContent)
    .where(eq(qaGatedContent.id, qaContentId))
    .limit(1);

  if (!content) return null;

  const clientVisible = review.status === 'approved' || review.status === 'published';

  const [updated] = await db
    .update(qaGatedContent)
    .set({
      qaStatus: review.status,
      qaScore: review.score ?? content.qaScore,
      qaNotes: review.notes ?? content.qaNotes,
      reviewedBy: review.reviewerId,
      reviewedAt: new Date(),
      autoReviewed: false,
      clientVisible,
      publishedAt: clientVisible ? new Date() : content.publishedAt,
      updatedAt: new Date(),
    })
    .where(eq(qaGatedContent.id, qaContentId))
    .returning();

  // Log the review
  try {
    await db.insert(activityLog).values({
      eventType: 'qa_analysis_completed',
      entityType: 'lead',
      entityId: qaContentId,
      createdBy: review.reviewerId,
      payload: {
        action: `qa_manual_${review.status}`,
        status: review.status,
        score: review.score,
        notes: review.notes,
        contentType: content.contentType,
      },
    });
  } catch (logErr) {
    console.error('[QA-Gate] Failed to log review:', logErr);
  }

  return updated;
}

/**
 * Publish approved content to client
 */
export async function publishToClient(qaContentId: string, publisherId?: string): Promise {
  const [content] = await db
    .select()
    .from(qaGatedContent)
    .where(eq(qaGatedContent.id, qaContentId))
    .limit(1);

  if (!content) return false;

  // Only approved content can be published
  if (content.qaStatus !== 'approved') {
    return false;
  }

  await db
    .update(qaGatedContent)
    .set({
      qaStatus: 'published',
      clientVisible: true,
      publishedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(qaGatedContent.id, qaContentId));

  // Log the publication
  try {
    await db.insert(activityLog).values({
      eventType: 'qa_auto_approved',
      entityType: 'lead',
      entityId: qaContentId,
      createdBy: publisherId,
      payload: {
        action: 'qa_content_published',
        contentType: content.contentType,
        contentId: content.contentId,
        clientAccountId: content.clientAccountId,
      },
    });
  } catch (logErr) {
    console.error('[QA-Gate] Failed to log publication:', logErr);
  }

  return true;
}

/**
 * Get all approved content for a client
 */
export async function getApprovedContent(
  clientAccountId: string,
  contentType?: QAContentType
): Promise {
  const conditions = [
    eq(qaGatedContent.clientAccountId, clientAccountId),
    eq(qaGatedContent.clientVisible, true),
    inArray(qaGatedContent.qaStatus, ['approved', 'published']),
  ];

  if (contentType) {
    conditions.push(eq(qaGatedContent.contentType, contentType));
  }

  const content = await db
    .select()
    .from(qaGatedContent)
    .where(and(...conditions))
    .orderBy(desc(qaGatedContent.publishedAt));

  return content;
}

/**
 * Get approved simulations for a client
 */
export async function getApprovedSimulations(clientAccountId: string) {
  const approvedContent = await getApprovedContent(clientAccountId, 'simulation');

  if (approvedContent.length === 0) return [];

  const simulationIds = approvedContent.map(c => c.contentId);

  const simulations = await db
    .select()
    .from(clientSimulationSessions)
    .where(inArray(clientSimulationSessions.id, simulationIds))
    .orderBy(desc(clientSimulationSessions.createdAt));

  return simulations;
}

/**
 * Get approved mock calls for a client
 */
export async function getApprovedMockCalls(clientAccountId: string) {
  const approvedContent = await getApprovedContent(clientAccountId, 'mock_call');

  if (approvedContent.length === 0) return [];

  const callIds = approvedContent.map(c => c.contentId);

  const calls = await db
    .select()
    .from(clientMockCalls)
    .where(inArray(clientMockCalls.id, callIds))
    .orderBy(desc(clientMockCalls.createdAt));

  return calls;
}

/**
 * Get approved reports for a client
 */
export async function getApprovedReports(clientAccountId: string) {
  const approvedContent = await getApprovedContent(clientAccountId, 'report');

  if (approvedContent.length === 0) return [];

  const reportIds = approvedContent.map(c => c.contentId);

  const reports = await db
    .select()
    .from(clientReports)
    .where(inArray(clientReports.id, reportIds))
    .orderBy(desc(clientReports.createdAt));

  return reports;
}

/**
 * Check if content is visible to a specific client
 */
export async function isClientVisible(
  contentType: QAContentType,
  contentId: string,
  clientAccountId: string
): Promise {
  const [content] = await db
    .select()
    .from(qaGatedContent)
    .where(
      and(
        eq(qaGatedContent.contentType, contentType),
        eq(qaGatedContent.contentId, contentId),
        eq(qaGatedContent.clientAccountId, clientAccountId)
      )
    )
    .limit(1);

  if (!content) return false;

  return content.clientVisible &&
    (content.qaStatus === 'approved' || content.qaStatus === 'published');
}

/**
 * Get pending QA content for review
 */
export async function getPendingContent(
  contentType?: QAContentType,
  limit: number = 50
) {
  const conditions = [
    inArray(qaGatedContent.qaStatus, ['new', 'under_review']),
  ];

  if (contentType) {
    conditions.push(eq(qaGatedContent.contentType, contentType));
  }

  const content = await db
    .select({
      qaContent: qaGatedContent,
      clientAccount: clientAccounts,
      campaign: campaigns,
      project: clientProjects,
    })
    .from(qaGatedContent)
    .leftJoin(clientAccounts, eq(qaGatedContent.clientAccountId, clientAccounts.id))
    .leftJoin(campaigns, eq(qaGatedContent.campaignId, campaigns.id))
    .leftJoin(clientProjects, eq(qaGatedContent.projectId, clientProjects.id))
    .where(and(...conditions))
    .orderBy(desc(qaGatedContent.createdAt))
    .limit(limit);

  return content;
}

/**
 * Backfill existing client content into QA-gated registry and link qa_content_id references.
 * This enables legacy records to appear in the new QA Review Center.
 */
export async function migrateLegacyContentToQaGate(): Promise {
  const result: QALegacyMigrationResult = {
    simulationsLinked: 0,
    mockCallsLinked: 0,
    reportsLinked: 0,
    alreadyLinked: 0,
    failures: 0,
    totalLinked: 0,
  };

  const simulations = await db
    .select({
      id: clientSimulationSessions.id,
      clientAccountId: clientSimulationSessions.clientAccountId,
      campaignId: clientSimulationSessions.campaignId,
      projectId: clientSimulationSessions.projectId,
      qaContentId: clientSimulationSessions.qaContentId,
    })
    .from(clientSimulationSessions)
    .where(isNull(clientSimulationSessions.qaContentId));

  for (const simulation of simulations) {
    try {
      const qa = await registerContent("simulation", simulation.id, {
        campaignId: simulation.campaignId || undefined,
        clientAccountId: simulation.clientAccountId,
        projectId: simulation.projectId || undefined,
      });

      await db
        .update(clientSimulationSessions)
        .set({ qaContentId: qa.id })
        .where(eq(clientSimulationSessions.id, simulation.id));

      result.simulationsLinked += 1;
    } catch (error) {
      console.error("[QA-Gate] Failed to migrate simulation:", simulation.id, error);
      result.failures += 1;
    }
  }

  const mockCalls = await db
    .select({
      id: clientMockCalls.id,
      clientAccountId: clientMockCalls.clientAccountId,
      campaignId: clientMockCalls.campaignId,
      projectId: clientMockCalls.projectId,
      qaContentId: clientMockCalls.qaContentId,
      createdBy: clientMockCalls.createdBy,
    })
    .from(clientMockCalls)
    .where(isNull(clientMockCalls.qaContentId));

  for (const mockCall of mockCalls) {
    try {
      const qa = await registerContent("mock_call", mockCall.id, {
        campaignId: mockCall.campaignId || undefined,
        clientAccountId: mockCall.clientAccountId,
        projectId: mockCall.projectId || undefined,
        createdBy: mockCall.createdBy || undefined,
      });

      await db
        .update(clientMockCalls)
        .set({ qaContentId: qa.id })
        .where(eq(clientMockCalls.id, mockCall.id));

      result.mockCallsLinked += 1;
    } catch (error) {
      console.error("[QA-Gate] Failed to migrate mock call:", mockCall.id, error);
      result.failures += 1;
    }
  }

  const reports = await db
    .select({
      id: clientReports.id,
      clientAccountId: clientReports.clientAccountId,
      campaignId: clientReports.campaignId,
      projectId: clientReports.projectId,
      qaContentId: clientReports.qaContentId,
      generatedBy: clientReports.generatedBy,
    })
    .from(clientReports)
    .where(isNull(clientReports.qaContentId));

  for (const report of reports) {
    try {
      const qa = await registerContent("report", report.id, {
        campaignId: report.campaignId || undefined,
        clientAccountId: report.clientAccountId,
        projectId: report.projectId || undefined,
        createdBy: report.generatedBy || undefined,
      });

      await db
        .update(clientReports)
        .set({ qaContentId: qa.id })
        .where(eq(clientReports.id, report.id));

      result.reportsLinked += 1;
    } catch (error) {
      console.error("[QA-Gate] Failed to migrate report:", report.id, error);
      result.failures += 1;
    }
  }

  const [linkedSimulationCount, linkedMockCallCount, linkedReportCount] = await Promise.all([
    db
      .select({ count: sql`COUNT(*)` })
      .from(clientSimulationSessions)
      .where(isNotNull(clientSimulationSessions.qaContentId)),
    db
      .select({ count: sql`COUNT(*)` })
      .from(clientMockCalls)
      .where(isNotNull(clientMockCalls.qaContentId)),
    db
      .select({ count: sql`COUNT(*)` })
      .from(clientReports)
      .where(isNotNull(clientReports.qaContentId)),
  ]);

  result.alreadyLinked =
    Number(linkedSimulationCount[0]?.count || 0) +
    Number(linkedMockCallCount[0]?.count || 0) +
    Number(linkedReportCount[0]?.count || 0) -
    result.simulationsLinked -
    result.mockCallsLinked -
    result.reportsLinked;

  result.totalLinked = result.simulationsLinked + result.mockCallsLinked + result.reportsLinked;

  return result;
}

/**
 * Bulk review multiple content items
 */
export async function bulkReview(
  qaContentIds: string[],
  review: QAReview
): Promise {
  let success = 0;
  let failed = 0;

  for (const id of qaContentIds) {
    try {
      const result = await submitReview(id, review);
      if (result) {
        success++;
      } else {
        failed++;
      }
    } catch {
      failed++;
    }
  }

  return { success, failed };
}