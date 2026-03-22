/**
 * SMI Agent - Search, Mapping & Intelligence Agent
 *
 * A comprehensive B2B reasoning agent that provides:
 * - Title → Role → Function Mapping with decision authority
 * - Industry → Sub-Industry Classification with SIC/NAICS normalization
 * - Multi-Perspective Account/Contact Intelligence (Finance, HR, Marketing, Operations, IT)
 * - Solution → Problem → Role Mapping and Recommendations
 * - Learning from campaign performance with predictive scoring
 * - Governance with auditable, campaign-aware outputs
 *
 * @module smi-agent
 */

// Types
export * from './types';

// Mapping Services
export {
  TitleMappingService,
  mapTitle,
  mapTitlesBatch,
  getAdjacentRoles,
  getRoleTaxonomy,
  expandCampaignRolesToTitles,
} from './mapping/title-mapping-service';

export {
  IndustryMappingService,
  classifyIndustry,
  getIndustryIntelligence,
  getIndustryDepartmentPainPoints,
  getIndustryTaxonomy,
} from './mapping/industry-mapping-service';

export {
  RoleExpansionService,
  expandRolesForCampaign,
} from './mapping/role-expansion-service';

// Intelligence Services
export {
  PerspectiveEngine,
  generateMultiPerspectiveIntelligence,
  getCachedPerspectiveAnalysis,
  invalidatePerspectiveCache,
} from './intelligence/perspective-engine';

export {
  ContactIntelligenceService,
  generateContactIntelligence,
  getContactIntelligence,
  invalidateContactIntelligence,
} from './intelligence/contact-intelligence';

export {
  SolutionMappingService,
  mapSolutionToProblemsAndRoles,
  getRecommendedTargets,
} from './intelligence/solution-mapping-service';

// Learning Services
export {
  LearningAggregator,
  aggregateLearnings,
  getLearningInsights,
} from './learning/learning-aggregator';

export {
  PredictiveScorer,
  generatePredictiveScore,
  generateCampaignPredictiveScores,
  getContactPredictiveScore,
} from './learning/predictive-scorer';

export {
  FeedbackProcessor,
  processCallOutcomeForSMI,
  recordLearningOutcome,
  batchProcessLearningRecords,
} from './learning/feedback-processor';

// Governance Services
export {
  OutputValidator,
  validateSmiOutput,
} from './governance/output-validator';

export {
  AuditLogger,
  logSmiAudit,
  getSmiAuditLog,
  getAuditStatistics,
  createAuditContext,
  purgeOldAuditLogs,
} from './governance/audit-logger';