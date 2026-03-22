import {
  UNIFIED_PIPELINE_FUNNEL_STAGES,
  type UnifiedPipelineFunnelStage,
} from "./unified-pipeline-types";

const STAGE_ORDER = new Map<UnifiedPipelineFunnelStage, number>(
  UNIFIED_PIPELINE_FUNNEL_STAGES.map((stage) => [stage.id, stage.order])
);

const ORDERED_STAGE_IDS = [...UNIFIED_PIPELINE_FUNNEL_STAGES]
  .sort((left, right) => left.order - right.order)
  .map((stage) => stage.id);

const TERMINAL_STAGES = new Set<UnifiedPipelineFunnelStage>([
  "closed_won",
  "closed_lost",
]);

const ENGAGEMENT_TRIGGER_ELIGIBLE_STAGES = new Set<UnifiedPipelineFunnelStage>([
  "outreach",
  "engaged",
  "qualifying",
  "qualified",
  "appointment_set",
]);

export function normalizeUnifiedPipelineStage(
  stage: string | null | undefined,
  fallback: UnifiedPipelineFunnelStage = "outreach"
): UnifiedPipelineFunnelStage {
  if (!stage) return fallback;

  const normalized = stage as UnifiedPipelineFunnelStage;
  return STAGE_ORDER.has(normalized) ? normalized : fallback;
}

export function getUnifiedPipelineStageRank(stage: UnifiedPipelineFunnelStage): number {
  return STAGE_ORDER.get(stage) ?? 0;
}

export function isTerminalUnifiedPipelineStage(stage: UnifiedPipelineFunnelStage): boolean {
  return TERMINAL_STAGES.has(stage);
}

export function isEngagementTriggerEligibleStage(stage: UnifiedPipelineFunnelStage): boolean {
  return ENGAGEMENT_TRIGGER_ELIGIBLE_STAGES.has(stage);
}

/**
 * Controlled progression guard:
 * - no regression
 * - no advancement from terminal stages
 * - optional max forward jump (defaults to one stage)
 */
export function getControlledForwardStage(
  currentStageInput: string | null | undefined,
  proposedStageInput: string | null | undefined,
  maxForwardJump: number = 1
): UnifiedPipelineFunnelStage {
  const currentStage = normalizeUnifiedPipelineStage(currentStageInput, "target");
  const proposedStage = normalizeUnifiedPipelineStage(proposedStageInput, currentStage);

  if (isTerminalUnifiedPipelineStage(currentStage)) return currentStage;

  const currentRank = getUnifiedPipelineStageRank(currentStage);
  const proposedRank = getUnifiedPipelineStageRank(proposedStage);

  if (proposedRank <= currentRank) return currentStage;

  const boundedJump = Math.max(1, Math.floor(maxForwardJump));
  const maxAllowedRank = Math.min(currentRank + boundedJump, ORDERED_STAGE_IDS.length - 1);
  const safeRank = Math.min(proposedRank, maxAllowedRank);

  return ORDERED_STAGE_IDS[safeRank] ?? currentStage;
}
