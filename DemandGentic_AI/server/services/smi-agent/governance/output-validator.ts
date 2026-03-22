/**
 * Output Validator Service
 * Validates SMI Agent outputs for quality and compliance
 * Ensures outputs are campaign-aware, structured, and actionable
 */

import type {
  SmiValidationResult,
  ValidationError,
  ValidationWarning,
  TitleMappingResult,
  IndustryClassificationResult,
  MultiPerspectiveIntelligence,
  ContactIntelligenceResult,
  PredictiveScore,
  SolutionMapping,
} from '../types';

/**
 * Validate any SMI output based on type
 */
export async function validateSmiOutput(
  outputType: string,
  output: any
): Promise {
  switch (outputType) {
    case 'title_mapping':
      return validateTitleMapping(output);
    case 'industry_classification':
      return validateIndustryClassification(output);
    case 'multi_perspective':
      return validateMultiPerspective(output);
    case 'contact_intelligence':
      return validateContactIntelligence(output);
    case 'predictive_score':
      return validatePredictiveScore(output);
    case 'solution_mapping':
      return validateSolutionMapping(output);
    default:
      return {
        isValid: true,
        errors: [],
        warnings: [{ field: 'outputType', message: `Unknown output type: ${outputType}`, severity: 'low' }],
        suggestions: [],
      };
  }
}

/**
 * Validate title mapping result
 */
function validateTitleMapping(output: TitleMappingResult): SmiValidationResult {
  const errors: ValidationError[] = [];
  const warnings: ValidationWarning[] = [];
  const suggestions: string[] = [];

  // Required field validation
  if (!output.rawTitle) {
    errors.push({ field: 'rawTitle', message: 'Raw title is required', code: 'REQUIRED_FIELD' });
  }

  // Confidence validation
  if (output.confidence !== undefined) {
    if (output.confidence  1) {
      errors.push({ field: 'confidence', message: 'Confidence must be between 0 and 1', code: 'INVALID_RANGE' });
    }
    if (output.confidence  0) {
    suggestions.push('Review alternative role matches for accuracy');
  }

  return {
    isValid: errors.length === 0,
    errors,
    warnings,
    suggestions,
  };
}

/**
 * Validate industry classification result
 */
function validateIndustryClassification(output: IndustryClassificationResult): SmiValidationResult {
  const errors: ValidationError[] = [];
  const warnings: ValidationWarning[] = [];
  const suggestions: string[] = [];

  // Required field validation
  if (!output.rawInput) {
    errors.push({ field: 'rawInput', message: 'Raw input is required', code: 'REQUIRED_FIELD' });
  }

  if (!output.industryCode) {
    errors.push({ field: 'industryCode', message: 'Industry code is required', code: 'REQUIRED_FIELD' });
  }

  // Confidence validation
  if (output.confidence  1) {
    errors.push({ field: 'engagementPropensity', message: 'Score must be between 0 and 1', code: 'INVALID_RANGE' });
  }
  if (output.qualificationPropensity  1) {
    errors.push({ field: 'qualificationPropensity', message: 'Score must be between 0 and 1', code: 'INVALID_RANGE' });
  }

  // Approach validation
  const validApproaches = ['direct', 'consultative', 'educational', 'peer-based'];
  if (output.bestApproach && !validApproaches.includes(output.bestApproach)) {
    warnings.push({ field: 'bestApproach', message: 'Non-standard approach value', severity: 'low' });
  }

  // Stale data warning
  if (output.isStale) {
    warnings.push({ field: 'isStale', message: 'Intelligence data is stale and should be refreshed', severity: 'high' });
    suggestions.push('Regenerate contact intelligence with forceRefresh=true');
  }

  return {
    isValid: errors.length === 0,
    errors,
    warnings,
    suggestions,
  };
}

/**
 * Validate predictive score
 */
function validatePredictiveScore(output: PredictiveScore): SmiValidationResult {
  const errors: ValidationError[] = [];
  const warnings: ValidationWarning[] = [];
  const suggestions: string[] = [];

  // Required field validation
  if (!output.contactId) {
    errors.push({ field: 'contactId', message: 'Contact ID is required', code: 'REQUIRED_FIELD' });
  }
  if (!output.campaignId) {
    errors.push({ field: 'campaignId', message: 'Campaign ID is required', code: 'REQUIRED_FIELD' });
  }

  // Score range validation
  const scoreFields = [
    'engagementLikelihood',
    'qualificationLikelihood',
    'roleScore',
    'industryScore',
    'problemFitScore',
    'historicalPatternScore',
  ];

  for (const field of scoreFields) {
    const value = (output as any)[field];
    if (value !== undefined && (value  1)) {
      errors.push({ field, message: `${field} must be between 0 and 1`, code: 'INVALID_RANGE' });
    }
  }

  // Priority validation
  if (output.callPriority  100) {
    errors.push({ field: 'callPriority', message: 'Call priority must be between 1 and 100', code: 'INVALID_RANGE' });
  }

  // Priority tier consistency
  const expectedTier =
    output.callPriority >= 70 ? 'high' :
    output.callPriority >= 40 ? 'medium' : 'low';

  if (output.priorityTier !== expectedTier) {
    warnings.push({
      field: 'priorityTier',
      message: `Priority tier (${output.priorityTier}) doesn't match call priority (${output.callPriority})`,
      severity: 'low',
    });
  }

  // Blocking factors warning
  if (output.hasBlockingFactors && output.callPriority > 50) {
    warnings.push({
      field: 'hasBlockingFactors',
      message: 'Contact has blocking factors but still has high priority',
      severity: 'high',
    });
    suggestions.push('Review blocking factors before proceeding');
  }

  // Stale data warning
  if (output.isStale) {
    warnings.push({ field: 'isStale', message: 'Predictive score is stale', severity: 'medium' });
  }

  return {
    isValid: errors.length === 0,
    errors,
    warnings,
    suggestions,
  };
}

/**
 * Validate solution mapping
 */
function validateSolutionMapping(output: SolutionMapping): SmiValidationResult {
  const errors: ValidationError[] = [];
  const warnings: ValidationWarning[] = [];
  const suggestions: string[] = [];

  // Required field validation
  if (!output.solution) {
    errors.push({ field: 'solution', message: 'Solution description is required', code: 'REQUIRED_FIELD' });
  }

  // Problem mappings validation
  if (!output.problemMappings || output.problemMappings.length === 0) {
    warnings.push({ field: 'problemMappings', message: 'No problems identified for solution', severity: 'medium' });
    suggestions.push('Provide more specific solution description');
  } else {
    for (const pm of output.problemMappings) {
      if (!pm.problemStatement) {
        errors.push({ field: 'problemMapping.problemStatement', message: 'Problem statement is required', code: 'REQUIRED_FIELD' });
      }
      if (pm.solutionFit  1) {
        errors.push({ field: 'problemMapping.solutionFit', message: 'Solution fit must be between 0 and 1', code: 'INVALID_RANGE' });
      }
    }
  }

  // Role recommendations validation
  if (!output.roleRecommendations || output.roleRecommendations.length === 0) {
    warnings.push({ field: 'roleRecommendations', message: 'No role recommendations generated', severity: 'medium' });
  } else {
    for (const rr of output.roleRecommendations) {
      if (!rr.role) {
        errors.push({ field: 'roleRecommendation.role', message: 'Role is required', code: 'REQUIRED_FIELD' });
      }
      if (rr.fitScore  1) {
        errors.push({ field: 'roleRecommendation.fitScore', message: 'Fit score must be between 0 and 1', code: 'INVALID_RANGE' });
      }
    }
  }

  return {
    isValid: errors.length === 0,
    errors,
    warnings,
    suggestions,
  };
}

/**
 * Output Validator class for dependency injection
 */
export class OutputValidator {
  async validate(outputType: string, output: any): Promise {
    return validateSmiOutput(outputType, output);
  }
}