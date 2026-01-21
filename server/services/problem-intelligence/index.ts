/**
 * Problem Intelligence System
 *
 * A context-aware campaign intelligence system that operates with three layers:
 * 1. Organization Service Catalog - Structured services, problems solved, differentiators
 * 2. Target Account Problem Detection - Signal detection from existing account data
 * 3. Problem Generation Engine - AI layer mapping org capabilities to account problems
 *
 * @module problem-intelligence
 */

// Organization Management - Multi-org support
export {
  getOrganizations,
  getOrganizationById,
  getDefaultOrganization,
  createOrganization,
  updateOrganization,
  deleteOrganization,
  setDefaultOrganization,
  updateOrganizationIntelligence,
  getOrganizationsForDropdown,
} from "./organization-service";

// Service Catalog - Master catalog management
export {
  getServiceCatalog,
  getServiceById,
  createService,
  updateService,
  deleteService,
  addProblemToService,
  removeProblemFromService,
  updateProblemInService,
  addDifferentiatorToService,
  removeDifferentiatorFromService,
  addValuePropositionToService,
  removeValuePropositionFromService,
  getCampaignServiceOverrides,
  setCampaignServiceOverride,
  removeCampaignServiceOverride,
  getEffectiveServiceCatalog,
  getServicesForIndustry,
  getServicesForPersona,
} from "./service-catalog-service";

// Problem Detection - Signal extraction and matching
export {
  detectAccountSignals,
  loadProblemDefinitions,
  matchProblemsToAccount,
  analyzeCapabilityGaps,
} from "./problem-detection-service";

// Problem Generation Engine - AI synthesis
export {
  generateAccountProblemIntelligence,
  batchGenerateCampaignProblems,
  refreshAccountProblemIntelligence,
} from "./problem-generation-engine";

// Campaign Intelligence Package - Full package assembly
export {
  getCampaignIntelligencePackage,
  buildProblemIntelligencePromptSection,
  buildCondensedProblemIntelligenceSection,
} from "./campaign-intelligence-package-service";

// SMI Integration - Industry & Role Intelligence Enhancement
export {
  enrichAccountSignalsWithSMI,
  enrichContactWithSMI,
  enhanceProblemDetectionWithSMI,
  getSMILearningInsightsForProblemIntelligence,
} from "./smi-integration";
