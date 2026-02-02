/**
 * Number Pool Services - Index
 * 
 * Barrel export for all number pool management services.
 * 
 * @see docs/NUMBER_POOL_MANAGEMENT_SYSTEM.md
 */

// Main Services
export { default as NumberService } from './number-service';
export { default as NumberRouterService } from './number-router-service';
export { default as ReputationEngine } from './reputation-engine';
export { default as CooldownManager } from './cooldown-manager';

// Individual function exports for direct usage
export {
  syncFromTelnyx,
  getNumbers,
  getNumberById,
  getNumberByE164,
  createNumber,
  updateNumber,
  deleteNumber,
  createAssignment,
  getAssignments,
  getNumbersForCampaign,
  updateAssignment,
  deleteAssignment,
  getPoolSummary,
  resetHourlyCounters,
  resetDailyCounters,
  type TelnyxApiNumber,
  type NumberPoolSummary,
  type NumberWithDetails,
  type CreateNumberInput,
  type UpdateNumberInput,
  type CreateAssignmentInput,
} from './number-service';

export {
  selectNumber,
  releaseNumber,
  recordCallOutcome,
  isNumberPoolEnabled,
  NoAvailableNumberError,
  CallRoutingError,
  type NumberSelectionRequest,
  type NumberSelectionResult,
  type CallOutcome,
} from './number-router-service';

export {
  calculateReputation,
  recalculateAllReputations,
  updateReputationAfterCall,
  type ReputationBand,
  type ReputationScoreDetails,
} from './reputation-engine';

export {
  checkCooldownTriggers,
  triggerCooldown,
  triggerManualCooldown,
  endCooldown,
  getCooldownStatus,
  processExpiredCooldowns,
  getNumbersInCooldown,
  handleSpamComplaint,
  handleCarrierBlock,
  COOLDOWN_TRIGGERS,
  type CooldownReason,
  type CooldownTrigger,
  type CooldownCheckResult,
  type CooldownStatus,
} from './cooldown-manager';
