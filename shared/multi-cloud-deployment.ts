export const deploymentProviderIds = [
  "self-hosted-vm",
  "google-cloud-run",
  "aws-fargate",
  "digitalocean-app-platform",
] as const;

export type DeploymentProviderId = (typeof deploymentProviderIds)[number];

export const deploymentWorkloadTypes = [
  "api",
  "full-stack",
  "worker",
  "realtime-websocket",
  "realtime-voice",
  "scheduled-jobs",
] as const;

export type DeploymentWorkloadType = (typeof deploymentWorkloadTypes)[number];

export type DeploymentEnvironment = "development" | "staging" | "production";
export type OpsExperience = "low" | "medium" | "high";
export type CostPreference = "lowest-cost" | "balanced" | "managed";
export type CapabilitySupport = "native" | "conditional" | "unsupported";
export type DeploymentAutomationLevel = "live" | "blueprint";
export type DeploymentFit = "best-fit" | "good-fit" | "acceptable" | "not-recommended";
export type DeploymentProviderCategory = "vm" | "serverless" | "container-service" | "paas";

export interface MultiCloudCapabilities {
  webSockets: boolean;
  rawTcpUdp: boolean;
  backgroundWorkers: boolean;
  cronJobs: boolean;
  managedDatabase: boolean;
  persistentDisk: boolean;
  customDomains: boolean;
  dockerCompose: boolean;
  multiRegion: boolean;
  privateNetworking: boolean;
  gpu: boolean;
}

export interface MultiCloudDeploymentPlanRequest {
  appName: string;
  containerImage?: string;
  environment: DeploymentEnvironment;
  workloadType: DeploymentWorkloadType;
  monthlyRequests: number;
  averageRequestDurationMs: number;
  monthlyTrafficGb: number;
  peakConcurrentUsers: number;
  requiredCpuCores: number;
  requiredMemoryGb: number;
  requiredStorageGb: number;
  backgroundWorkerHours: number;
  scheduledJobRunsPerMonth: number;
  maxMonthlyBudgetUsd?: number | null;
  preferredRegion?: string | null;
  opsTeamExperience: OpsExperience;
  costPreference: CostPreference;
  capabilities: MultiCloudCapabilities;
}

export interface ProviderCapabilityMatrix {
  webSockets: CapabilitySupport;
  rawTcpUdp: CapabilitySupport;
  backgroundWorkers: CapabilitySupport;
  cronJobs: CapabilitySupport;
  managedDatabase: CapabilitySupport;
  persistentDisk: CapabilitySupport;
  customDomains: CapabilitySupport;
  dockerCompose: CapabilitySupport;
  multiRegion: CapabilitySupport;
  privateNetworking: CapabilitySupport;
  gpu: CapabilitySupport;
}

export interface DeploymentCostBreakdown {
  computeUsd: number;
  platformUsd: number;
  storageUsd: number;
  bandwidthUsd: number;
  totalUsd: number;
  confidence: "high" | "medium" | "low";
  excludedItems: string[];
}

export interface DeploymentBlueprint {
  label: string;
  format: "json";
  filename: string;
  data: Record<string, unknown>;
  notes: string[];
}

export interface MultiCloudProviderRecommendation {
  providerId: DeploymentProviderId;
  providerName: string;
  category: DeploymentProviderCategory;
  automationLevel: DeploymentAutomationLevel;
  executionAvailable: boolean;
  score: number;
  fit: DeploymentFit;
  summary: string;
  estimatedMonthlyCostUsd: number;
  estimatedCostRangeUsd: {
    low: number;
    high: number;
  };
  setupComplexity: OpsExperience;
  capabilityCoveragePercent: number;
  reasons: string[];
  tradeoffs: string[];
  blockers: string[];
  capabilities: ProviderCapabilityMatrix;
  costBreakdown: DeploymentCostBreakdown;
  blueprint: DeploymentBlueprint;
}

export interface MultiCloudProviderDescriptor {
  providerId: DeploymentProviderId;
  providerName: string;
  category: DeploymentProviderCategory;
  automationLevel: DeploymentAutomationLevel;
  executionAvailable: boolean;
  description: string;
}

export interface MultiCloudDeploymentPlanResponse {
  generatedAt: string;
  request: MultiCloudDeploymentPlanRequest;
  selectedProviderId: DeploymentProviderId;
  assumptions: string[];
  providers: MultiCloudProviderRecommendation[];
}
