/**
 * Problem Intelligence System - TypeScript Types
 *
 * These types define the structure of JSONB fields stored in the Problem Intelligence tables.
 * They are used for type safety when working with service catalogs, problem definitions,
 * and generated problem intelligence.
 */

// ==================== SERVICE CATALOG TYPES ====================

/**
 * A problem that a service solves
 */
export interface ProblemSolved {
  id: string;
  problemStatement: string;
  symptoms: ProblemSymptom[];
  impactAreas: ImpactArea[];
  severity: 'high' | 'medium' | 'low';
}

/**
 * A symptom/indicator of a problem
 */
export interface ProblemSymptom {
  id: string;
  symptomDescription: string;
  dataSource: 'firmographic' | 'tech_stack' | 'intent' | 'behavioral' | 'industry';
  detectionLogic?: string; // Optional logic description for automated detection
}

/**
 * An area impacted by a problem
 */
export interface ImpactArea {
  id: string;
  area: 'Revenue' | 'Cost' | 'Risk' | 'Efficiency' | 'Growth' | 'Compliance';
  description: string;
  severity: 'high' | 'medium' | 'low';
}

/**
 * A service differentiator
 */
export interface ServiceDifferentiator {
  id: string;
  claim: string;
  proof: string;
  competitorGap?: string;
}

/**
 * A value proposition for a service
 */
export interface ValueProposition {
  id: string;
  headline: string;
  description: string;
  targetPersona?: string;
  quantifiedValue?: string; // e.g., "40% faster", "$100K savings"
}

/**
 * Full service definition (extends DB type with parsed JSONB fields)
 */
export interface ServiceDefinition {
  id: number;
  serviceName: string;
  serviceCategory: 'platform' | 'consulting' | 'integration' | 'managed_service' | 'data' | 'other';
  serviceDescription: string | null;
  problemsSolved: ProblemSolved[];
  differentiators: ServiceDifferentiator[];
  valuePropositions: ValueProposition[];
  targetIndustries: string[] | null;
  targetPersonas: string[] | null;
  targetDepartments: string[] | null; // Departments this service targets
  displayOrder: number;
  isActive: boolean;
}

// ==================== PROBLEM DEFINITION TYPES ====================

/**
 * Messaging angle for a specific problem
 */
export interface MessagingAngle {
  id: string;
  angle: string;
  openingLine: string;
  followUp: string;
  persona?: string; // Optional target persona for this angle
}

/**
 * Detection rules for automated problem matching
 */
export interface DetectionRules {
  industries?: string[];
  techStack?: {
    required?: string[]; // Technologies that must be present
    absent?: string[];   // Technologies that must NOT be present
  };
  firmographics?: {
    minRevenue?: number;
    maxRevenue?: number;
    minEmployees?: number;
    maxEmployees?: number;
    regions?: string[];
  };
  intentSignals?: string[];
}

/**
 * Full problem definition (extends DB type with parsed JSONB fields)
 */
export interface ProblemDefinitionFull {
  id: number;
  organizationId?: string;
  problemStatement: string;
  problemCategory: 'efficiency' | 'growth' | 'risk' | 'cost' | 'compliance' | 'innovation';
  symptoms: ProblemSymptom[];
  impactAreas: ImpactArea[];
  serviceIds: number[] | null;
  messagingAngles: MessagingAngle[];
  detectionRules: DetectionRules;
  targetDepartments: string[]; // Which departments typically own this problem
  isActive: boolean;
  createdAt?: Date | null;
  updatedAt?: Date | null;
}

// ==================== ACCOUNT SIGNALS TYPES ====================

/**
 * Signals extracted from existing account data
 * Used for problem detection (no live research)
 */
export interface AccountSignals {
  firmographic: {
    industry: string | null;
    subIndustry?: string | null;
    revenue?: number | null;
    employees?: number | null;
    region?: string | null;
    yearFounded?: number | null;
  };
  techStack: {
    technologies: string[];
    categories: Record<string, string[]>; // e.g., { "CRM": ["Salesforce"], "Marketing": ["HubSpot"] }
  };
  intentSignals: string[];
  behavioralSignals: {
    lastTouchAt?: Date | null;
    pipelineStatus?: string | null;
    engagementLevel?: 'high' | 'medium' | 'low' | 'none';
  };
}

// ==================== DETECTED PROBLEMS TYPES ====================

/**
 * A signal that contributed to problem detection
 */
export interface DetectionSignal {
  signalType: 'firmographic' | 'tech_stack' | 'intent' | 'behavioral' | 'industry';
  signalValue: string;
  matchedRule: string;
  contribution: number; // 0-1, how much this signal contributed to detection
}

/**
 * A detected problem for an account
 */
export interface DetectedProblem {
  problemId: number;
  problemStatement: string;
  confidence: number; // 0-1
  detectionSignals: DetectionSignal[];
  relevantServices: number[]; // IDs of services that address this problem
  messagingAngles: MessagingAngle[];
  targetDepartments: string[]; // Departments that own this problem
}

// ==================== GAP ANALYSIS TYPES ====================

/**
 * A capability gap identified for an account
 */
export interface CapabilityGap {
  capability: string;
  accountGap: string; // What the account is missing
  ourSolution: string; // How we solve it
  confidence: number;
}

/**
 * Gap analysis results
 */
export interface GapAnalysis {
  capabilities: CapabilityGap[];
  prioritizedGaps: string[]; // Ordered list of gap descriptions
}

// ==================== MESSAGING PACKAGE TYPES ====================

/**
 * Objection preparation
 */
export interface ObjectionPrep {
  objection: string;
  response: string;
  proofPoint?: string;
}

/**
 * Messaging package for an account
 */
export interface MessagingPackage {
  primaryAngle: string;
  secondaryAngles: string[];
  openingLines: string[];
  objectionPrep: ObjectionPrep[];
  proofPoints: string[];
}

// ==================== OUTREACH STRATEGY TYPES ====================

/**
 * Outreach strategy recommendation
 */
export interface OutreachStrategy {
  recommendedApproach: 'exploratory' | 'consultative' | 'direct' | 'educational';
  talkingPoints: string[];
  questionsToAsk: string[];
  doNotMention: string[];
}

// ==================== DEPARTMENT INTELLIGENCE TYPES ====================

/**
 * Per-department problem-to-solution mapping for a target account
 */
export interface DepartmentProblemMapping {
  department: string; // 'IT' | 'Finance' | 'HR' | 'Marketing' | 'Operations' | 'Sales' | 'Legal' | 'Executive'
  detectedProblems: Array<{
    problemId: number;
    problemStatement: string;
    confidence: number;
  }>;
  relevantServices: Array<{
    serviceId: number;
    serviceName: string;
  }>;
  messagingAngle: string;
  recommendedApproach: string;
  painPoints: string[];       // from industryDepartmentPainPoints
  priorities: string[];       // from industryDepartmentPainPoints
  commonObjections: string[]; // from industryDepartmentPainPoints
  stakeholderTitles: string[]; // persona titles mapped to this dept
  confidence: number;
}

/**
 * Department-level intelligence for a target account
 */
export interface DepartmentIntelligence {
  departments: DepartmentProblemMapping[];
  primaryDepartment: string | null;  // highest confidence / most problems
  crossDepartmentAngles: string[];   // messaging angles that span multiple depts
}

// ==================== CAMPAIGN ACCOUNT PROBLEM INTELLIGENCE ====================

/**
 * Complete problem intelligence for an account in a campaign
 */
export interface CampaignAccountProblemIntelligence {
  campaignId: string;
  accountId: string;
  detectedProblems: DetectedProblem[];
  gapAnalysis: GapAnalysis;
  messagingPackage: MessagingPackage;
  outreachStrategy: OutreachStrategy;
  departmentIntelligence: DepartmentIntelligence;
  generatedAt: Date;
  generationModel?: string;
  sourceFingerprint?: string;
  confidence: number;
}

// ==================== CAMPAIGN INTELLIGENCE PACKAGE ====================

/**
 * Full intelligence package for agent runtime
 * Combines account info, problem intelligence, org context
 */
export interface CampaignIntelligencePackage {
  account: {
    id: string;
    name: string;
    domain: string | null;
    industry?: string | null;
  };
  problemIntelligence: CampaignAccountProblemIntelligence;
  serviceCatalog: ServiceDefinition[];
  callBrief?: {
    openingApproach: string;
    keyPoints: string[];
    objectionHandlers: ObjectionPrep[];
  };
}

// ==================== GENERATION INPUT/OUTPUT TYPES ====================

/**
 * Input for generating account problem intelligence
 */
export interface GenerateAccountProblemInput {
  campaignId: string;
  accountId: string;
  forceRefresh?: boolean;
}

/**
 * Input for batch generation
 */
export interface BatchGenerateInput {
  campaignId: string;
  accountIds: string[];
  concurrency?: number;
}

/**
 * Result of batch generation
 */
export interface BatchGenerateResult {
  success: number;
  failed: number;
  errors: Array<{
    accountId: string;
    error: string;
  }>;
}

// ==================== SERVICE CUSTOMIZATION TYPES ====================

/**
 * Campaign-specific service customization
 */
export interface CampaignServiceCustomizationFull {
  id: number;
  campaignId: string;
  serviceId: number;
  customProblemsSolved: ProblemSolved[] | null;
  customDifferentiators: ServiceDifferentiator[] | null;
  customValuePropositions: ValueProposition[] | null;
  isPrimaryService: boolean;
  focusWeight: number;
}

/**
 * Effective service after merging master + campaign customizations
 */
export interface EffectiveService extends ServiceDefinition {
  isPrimaryService: boolean;
  focusWeight: number;
  hasCustomization: boolean;
}
