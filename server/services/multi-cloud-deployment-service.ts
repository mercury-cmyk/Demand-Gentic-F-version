import type {
  CapabilitySupport,
  CostPreference,
  DeploymentAutomationLevel,
  DeploymentBlueprint,
  DeploymentFit,
  DeploymentProviderCategory,
  DeploymentProviderId,
  MultiCloudDeploymentPlanRequest,
  MultiCloudDeploymentPlanResponse,
  MultiCloudProviderDescriptor,
  MultiCloudProviderRecommendation,
  OpsExperience,
  ProviderCapabilityMatrix,
  DeploymentCostBreakdown,
} from "@shared/multi-cloud-deployment";

interface NormalizedPlanRequest extends MultiCloudDeploymentPlanRequest {
  containerImage: string;
}

interface ProviderDefinition {
  providerId: DeploymentProviderId;
  providerName: string;
  category: DeploymentProviderCategory;
  automationLevel: DeploymentAutomationLevel;
  executionAvailable: boolean;
  description: string;
  setupComplexity: OpsExperience;
  capabilities: ProviderCapabilityMatrix;
}

interface WorkloadEnvelope {
  alwaysOn: boolean;
  requestSeconds: number;
  serviceInstanceCount: number;
  workerFootprint: {
    cpuCores: number;
    memoryGb: number;
    hours: number;
  };
}

const HOURS_PER_MONTH = 730;
const DEFAULT_REGION = "us-central1";
const DEFAULT_CONTAINER_IMAGE = "ghcr.io/your-org/your-app:latest";

const PROVIDERS: ProviderDefinition[] = [
  {
    providerId: "self-hosted-vm",
    providerName: "Self-hosted VM / Docker Compose",
    category: "vm",
    automationLevel: "live",
    executionAvailable: true,
    description: "Best for network-heavy or SIP-style workloads that need full host control.",
    setupComplexity: "high",
    capabilities: {
      webSockets: "native",
      rawTcpUdp: "native",
      backgroundWorkers: "native",
      cronJobs: "native",
      managedDatabase: "conditional",
      persistentDisk: "native",
      customDomains: "native",
      dockerCompose: "native",
      multiRegion: "conditional",
      privateNetworking: "native",
      gpu: "native",
    },
  },
  {
    providerId: "google-cloud-run",
    providerName: "Google Cloud Run",
    category: "serverless",
    automationLevel: "live",
    executionAvailable: true,
    description: "Lowest-ops option for stateless APIs, web apps, and bursty services.",
    setupComplexity: "low",
    capabilities: {
      webSockets: "conditional",
      rawTcpUdp: "unsupported",
      backgroundWorkers: "native",
      cronJobs: "native",
      managedDatabase: "native",
      persistentDisk: "conditional",
      customDomains: "native",
      dockerCompose: "unsupported",
      multiRegion: "conditional",
      privateNetworking: "native",
      gpu: "native",
    },
  },
  {
    providerId: "aws-fargate",
    providerName: "AWS ECS Fargate",
    category: "container-service",
    automationLevel: "blueprint",
    executionAvailable: false,
    description: "Strong fit for enterprise VPC networking, long-running containers, and controlled scaling.",
    setupComplexity: "medium",
    capabilities: {
      webSockets: "native",
      rawTcpUdp: "native",
      backgroundWorkers: "native",
      cronJobs: "native",
      managedDatabase: "native",
      persistentDisk: "conditional",
      customDomains: "native",
      dockerCompose: "unsupported",
      multiRegion: "native",
      privateNetworking: "native",
      gpu: "unsupported",
    },
  },
  {
    providerId: "digitalocean-app-platform",
    providerName: "DigitalOcean App Platform",
    category: "paas",
    automationLevel: "blueprint",
    executionAvailable: false,
    description: "Simple managed container platform with predictable pricing and low operational overhead.",
    setupComplexity: "low",
    capabilities: {
      webSockets: "conditional",
      rawTcpUdp: "unsupported",
      backgroundWorkers: "native",
      cronJobs: "native",
      managedDatabase: "native",
      persistentDisk: "unsupported",
      customDomains: "native",
      dockerCompose: "unsupported",
      multiRegion: "unsupported",
      privateNetworking: "conditional",
      gpu: "unsupported",
    },
  },
];

const CAPABILITY_LABELS: Record<keyof ProviderCapabilityMatrix, string> = {
  webSockets: "WebSockets",
  rawTcpUdp: "raw TCP/UDP networking",
  backgroundWorkers: "background workers",
  cronJobs: "scheduled jobs",
  managedDatabase: "managed database integrations",
  persistentDisk: "persistent disk",
  customDomains: "custom domains",
  dockerCompose: "Docker Compose compatibility",
  multiRegion: "multi-region routing",
  privateNetworking: "private networking",
  gpu: "GPU workloads",
};

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function roundCurrency(value: number): number {
  return Math.round(value * 100) / 100;
}

function slugifyName(value: string): string {
  const slug = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

  return slug.slice(0, 40) || "demandgentic-service";
}

function deriveWorkerFootprint(request: NormalizedPlanRequest) {
  if (!request.capabilities.backgroundWorkers || request.backgroundWorkerHours <= 0) {
    return {
      cpuCores: 0,
      memoryGb: 0,
      hours: 0,
    };
  }

  return {
    cpuCores: clamp(Math.max(0.5, request.requiredCpuCores * 0.5), 0.5, request.requiredCpuCores),
    memoryGb: clamp(Math.max(0.5, request.requiredMemoryGb * 0.5), 0.5, request.requiredMemoryGb),
    hours: clamp(request.backgroundWorkerHours, 1, HOURS_PER_MONTH),
  };
}

function deriveServiceInstances(request: NormalizedPlanRequest): number {
  const minimum = request.environment === "production" ? 1 : 1;
  const highAvailabilityMinimum =
    request.environment === "production" &&
    (request.capabilities.webSockets || request.capabilities.rawTcpUdp || request.workloadType === "full-stack")
      ? 2
      : minimum;

  const concurrencyPerInstance =
    request.workloadType === "realtime-voice"
      ? 15
      : request.capabilities.webSockets
        ? 80
        : request.workloadType === "full-stack"
          ? 120
          : 180;

  const concurrencyDriven = request.peakConcurrentUsers > 0
    ? Math.ceil(request.peakConcurrentUsers / concurrencyPerInstance)
    : 1;

  return clamp(Math.max(highAvailabilityMinimum, concurrencyDriven), 1, 20);
}

function buildWorkloadEnvelope(request: NormalizedPlanRequest): WorkloadEnvelope {
  const averageDurationMs = clamp(request.averageRequestDurationMs, 50, 300000);
  const requestSeconds = request.monthlyRequests * (averageDurationMs / 1000);

  return {
    alwaysOn:
      request.capabilities.webSockets ||
      request.capabilities.rawTcpUdp ||
      request.workloadType === "realtime-voice",
    requestSeconds,
    serviceInstanceCount: deriveServiceInstances(request),
    workerFootprint: deriveWorkerFootprint(request),
  };
}

function normalizeRequest(input: MultiCloudDeploymentPlanRequest): NormalizedPlanRequest {
  return {
    ...input,
    appName: input.appName?.trim() || "DemandGentic Service",
    containerImage: input.containerImage?.trim() || DEFAULT_CONTAINER_IMAGE,
    monthlyRequests: clamp(Number(input.monthlyRequests) || 0, 0, 5_000_000_000),
    averageRequestDurationMs: clamp(Number(input.averageRequestDurationMs) || 300, 50, 300000),
    monthlyTrafficGb: clamp(Number(input.monthlyTrafficGb) || 0, 0, 100000),
    peakConcurrentUsers: clamp(Number(input.peakConcurrentUsers) || 0, 0, 250000),
    requiredCpuCores: clamp(Number(input.requiredCpuCores) || 1, 0.25, 64),
    requiredMemoryGb: clamp(Number(input.requiredMemoryGb) || 1, 0.5, 256),
    requiredStorageGb: clamp(Number(input.requiredStorageGb) || 10, 0, 4000),
    backgroundWorkerHours: clamp(Number(input.backgroundWorkerHours) || 0, 0, HOURS_PER_MONTH),
    scheduledJobRunsPerMonth: clamp(Number(input.scheduledJobRunsPerMonth) || 0, 0, 1_000_000),
    maxMonthlyBudgetUsd:
      input.maxMonthlyBudgetUsd == null
        ? null
        : clamp(Number(input.maxMonthlyBudgetUsd) || 0, 0, 10_000_000),
    preferredRegion: input.preferredRegion?.trim() || DEFAULT_REGION,
  };
}

function estimateCloudRunCost(
  request: NormalizedPlanRequest,
  envelope: WorkloadEnvelope,
): DeploymentCostBreakdown {
  const useInstanceBasedBilling = envelope.alwaysOn || envelope.workerFootprint.hours >= 300;
  const requestCpuRate = 0.000024;
  const requestMemoryRate = 0.0000025;
  const instanceCpuRate = 0.000018;
  const instanceMemoryRate = 0.000002;
  const requestRatePerMillion = 0.4;
  const freeCpuSeconds = 240000;
  const freeMemorySeconds = 450000;
  const freeRequests = 2_000_000;

  let activeCpuSeconds = envelope.requestSeconds * request.requiredCpuCores;
  let activeMemorySeconds = envelope.requestSeconds * request.requiredMemoryGb;

  if (useInstanceBasedBilling) {
    const instanceSeconds = HOURS_PER_MONTH * 3600 * Math.max(1, Math.min(2, envelope.serviceInstanceCount));
    activeCpuSeconds = Math.max(activeCpuSeconds, instanceSeconds * request.requiredCpuCores);
    activeMemorySeconds = Math.max(activeMemorySeconds, instanceSeconds * request.requiredMemoryGb);
  }

  const workerCpuSeconds = envelope.workerFootprint.hours * 3600 * envelope.workerFootprint.cpuCores;
  const workerMemorySeconds = envelope.workerFootprint.hours * 3600 * envelope.workerFootprint.memoryGb;

  activeCpuSeconds += workerCpuSeconds;
  activeMemorySeconds += workerMemorySeconds;

  const cpuRate = useInstanceBasedBilling ? instanceCpuRate : requestCpuRate;
  const memoryRate = useInstanceBasedBilling ? instanceMemoryRate : requestMemoryRate;

  const computeUsd = roundCurrency(Math.max(0, activeCpuSeconds - freeCpuSeconds) * cpuRate);
  const memoryUsd = roundCurrency(Math.max(0, activeMemorySeconds - freeMemorySeconds) * memoryRate);
  const platformUsd = roundCurrency(
    Math.max(0, request.monthlyRequests - freeRequests) / 1_000_000 * requestRatePerMillion,
  );
  const storageUsd = request.capabilities.persistentDisk
    ? roundCurrency(Math.max(0, request.requiredStorageGb - 10) * 0.12)
    : 0;

  return {
    computeUsd: roundCurrency(computeUsd + memoryUsd),
    platformUsd,
    storageUsd,
    bandwidthUsd: 0,
    totalUsd: roundCurrency(computeUsd + memoryUsd + platformUsd + storageUsd),
    confidence: "high",
    excludedItems: [
      "Cloud SQL, Memorystore, and external database charges",
      "Network egress beyond the runtime estimate",
    ],
  };
}

function estimateAwsFargateCost(
  request: NormalizedPlanRequest,
  envelope: WorkloadEnvelope,
): DeploymentCostBreakdown {
  const cpuHourRate = 0.04048;
  const memoryHourRate = 0.004445;
  const serviceHours = request.workloadType === "scheduled-jobs" && !envelope.alwaysOn
    ? Math.max(24, envelope.requestSeconds / 3600)
    : HOURS_PER_MONTH * envelope.serviceInstanceCount;

  const serviceComputeUsd = serviceHours * request.requiredCpuCores * cpuHourRate;
  const serviceMemoryUsd = serviceHours * request.requiredMemoryGb * memoryHourRate;
  const workerComputeUsd =
    envelope.workerFootprint.hours * envelope.workerFootprint.cpuCores * cpuHourRate;
  const workerMemoryUsd =
    envelope.workerFootprint.hours * envelope.workerFootprint.memoryGb * memoryHourRate;
  const platformUsd = request.workloadType === "scheduled-jobs" ? 0 : 18;
  const storageUsd = request.capabilities.persistentDisk
    ? roundCurrency(Math.max(0, request.requiredStorageGb - 20) * 0.08)
    : 0;

  return {
    computeUsd: roundCurrency(serviceComputeUsd + serviceMemoryUsd + workerComputeUsd + workerMemoryUsd),
    platformUsd,
    storageUsd,
    bandwidthUsd: 0,
    totalUsd: roundCurrency(
      serviceComputeUsd +
      serviceMemoryUsd +
      workerComputeUsd +
      workerMemoryUsd +
      platformUsd +
      storageUsd,
    ),
    confidence: "medium",
    excludedItems: [
      "Application or Network Load Balancer charges",
      "Public IPv4, data transfer, and managed database charges",
    ],
  };
}

function getDigitalOceanPlanCost(request: NormalizedPlanRequest): number {
  if (request.requiredCpuCores <= 1 && request.requiredMemoryGb <= 0.5) return 5;
  if (request.requiredCpuCores <= 1 && request.requiredMemoryGb <= 1) return 29;
  if (request.requiredCpuCores <= 1 && request.requiredMemoryGb <= 2) return 34;
  if (request.requiredCpuCores <= 2 && request.requiredMemoryGb <= 4) return 63;
  if (request.requiredCpuCores <= 4 && request.requiredMemoryGb <= 8) return 121;
  return roundCurrency(request.requiredCpuCores * 28 + request.requiredMemoryGb * 8);
}

function estimateDigitalOceanAppPlatformCost(
  request: NormalizedPlanRequest,
  envelope: WorkloadEnvelope,
): DeploymentCostBreakdown {
  const basePlanUsd = getDigitalOceanPlanCost(request);
  const serviceCount = request.workloadType === "scheduled-jobs" ? 1 : envelope.serviceInstanceCount;
  const backgroundWorkerUsd = envelope.workerFootprint.hours > 0
    ? basePlanUsd * Math.max(0.25, envelope.workerFootprint.hours / HOURS_PER_MONTH)
    : 0;
  const bandwidthAllowanceGb = basePlanUsd <= 5 ? 100 : 100;
  const bandwidthUsd = Math.max(0, request.monthlyTrafficGb - bandwidthAllowanceGb) * 0.02;
  const storageUsd = request.capabilities.persistentDisk
    ? roundCurrency(Math.max(0, request.requiredStorageGb - 10) * 0.1)
    : 0;

  return {
    computeUsd: roundCurrency(basePlanUsd * serviceCount + backgroundWorkerUsd),
    platformUsd: 0,
    storageUsd,
    bandwidthUsd: roundCurrency(bandwidthUsd),
    totalUsd: roundCurrency((basePlanUsd * serviceCount) + backgroundWorkerUsd + bandwidthUsd + storageUsd),
    confidence: "medium",
    excludedItems: [
      "Managed database costs",
      "Region-specific private networking add-ons",
    ],
  };
}

function estimateSelfHostedVmCost(
  request: NormalizedPlanRequest,
  envelope: WorkloadEnvelope,
): DeploymentCostBreakdown {
  const instanceCount = request.capabilities.multiRegion ? 2 : 1;
  let baseVmUsd = 24;

  if (request.requiredCpuCores > 1 || request.requiredMemoryGb > 2) baseVmUsd = 48;
  if (request.requiredCpuCores > 2 || request.requiredMemoryGb > 4) baseVmUsd = 96;
  if (request.requiredCpuCores > 4 || request.requiredMemoryGb > 8) baseVmUsd = 192;
  if (request.requiredCpuCores > 8 || request.requiredMemoryGb > 16) {
    baseVmUsd = roundCurrency(request.requiredCpuCores * 18 + request.requiredMemoryGb * 6);
  }

  const bandwidthUsd = Math.max(0, request.monthlyTrafficGb - 500) * 0.01;
  const storageUsd = Math.max(0, request.requiredStorageGb - 80) * 0.08;
  const workerSurcharge = envelope.workerFootprint.hours > 250 ? baseVmUsd * 0.2 : 0;

  return {
    computeUsd: roundCurrency(baseVmUsd * instanceCount + workerSurcharge),
    platformUsd: 0,
    storageUsd: roundCurrency(storageUsd),
    bandwidthUsd: roundCurrency(bandwidthUsd),
    totalUsd: roundCurrency((baseVmUsd * instanceCount) + workerSurcharge + storageUsd + bandwidthUsd),
    confidence: "low",
    excludedItems: [
      "Managed backup, monitoring, and snapshot tooling",
      "Operator time for patching, failover, and host security",
    ],
  };
}

function estimateCost(
  provider: ProviderDefinition,
  request: NormalizedPlanRequest,
  envelope: WorkloadEnvelope,
): DeploymentCostBreakdown {
  switch (provider.providerId) {
    case "google-cloud-run":
      return estimateCloudRunCost(request, envelope);
    case "aws-fargate":
      return estimateAwsFargateCost(request, envelope);
    case "digitalocean-app-platform":
      return estimateDigitalOceanAppPlatformCost(request, envelope);
    case "self-hosted-vm":
    default:
      return estimateSelfHostedVmCost(request, envelope);
  }
}

function getCapabilityCoverage(
  provider: ProviderDefinition,
  request: NormalizedPlanRequest,
): {
  coveragePercent: number;
  blockers: string[];
  tradeoffs: string[];
  reasons: string[];
} {
  const requiredKeys = (Object.keys(request.capabilities) as Array<keyof ProviderCapabilityMatrix>)
    .filter((key) => request.capabilities[key]);

  if (requiredKeys.length === 0) {
    return {
      coveragePercent: 100,
      blockers: [],
      tradeoffs: [],
      reasons: ["Matches the baseline HTTP/container requirements without extra feature constraints."],
    };
  }

  const blockers: string[] = [];
  const tradeoffs: string[] = [];
  const reasons: string[] = [];
  let nativeSupportCount = 0;

  for (const key of requiredKeys) {
    const support = provider.capabilities[key];
    const label = CAPABILITY_LABELS[key];

    if (support === "native") {
      nativeSupportCount += 1;
      reasons.push(`Supports ${label} without extra infrastructure.`);
      continue;
    }

    if (support === "conditional") {
      tradeoffs.push(`${label} needs extra configuration on ${provider.providerName}.`);
      nativeSupportCount += 0.5;
      continue;
    }

    blockers.push(`${provider.providerName} is a poor fit for ${label}.`);
  }

  return {
    coveragePercent: Math.round((nativeSupportCount / requiredKeys.length) * 100),
    blockers,
    tradeoffs,
    reasons,
  };
}

function computeCostBonus(
  providerCost: number,
  cheapestCost: number,
  preference: CostPreference,
): number {
  if (providerCost <= 0 || cheapestCost <= 0) return 0;

  const ratio = providerCost / cheapestCost;
  const weight = preference === "lowest-cost" ? 26 : preference === "balanced" ? 16 : 8;
  return clamp(Math.round((2 - ratio) * weight), -weight, weight);
}

function buildFit(score: number, blockers: string[]): DeploymentFit {
  if (blockers.length > 0 && score < 55) return "not-recommended";
  if (score >= 92) return "best-fit";
  if (score >= 78) return "good-fit";
  if (score >= 60) return "acceptable";
  return "not-recommended";
}

function buildSummary(
  provider: ProviderDefinition,
  request: NormalizedPlanRequest,
  fit: DeploymentFit,
): string {
  switch (provider.providerId) {
    case "google-cloud-run":
      return fit === "not-recommended"
        ? "Great on ops and burst pricing, but this workload is leaning beyond Cloud Run's sweet spot."
        : "Best when you want managed autoscaling and low idle cost for stateless services.";
    case "aws-fargate":
      return "Better when you need stronger networking control, long-running containers, or enterprise VPC patterns.";
    case "digitalocean-app-platform":
      return "Useful when predictable managed container pricing matters more than deep infrastructure control.";
    case "self-hosted-vm":
    default:
      return request.capabilities.rawTcpUdp || request.capabilities.dockerCompose
        ? "Most compatible option for protocol-heavy workloads and existing Docker Compose operations."
        : "Strong fallback when compatibility matters more than reducing operational overhead.";
  }
}

function buildBlueprint(
  provider: ProviderDefinition,
  request: NormalizedPlanRequest,
  envelope: WorkloadEnvelope,
): DeploymentBlueprint {
  const slug = slugifyName(request.appName);
  const port = request.workloadType === "realtime-voice" ? 5060 : 8080;
  const maxInstances = clamp(
    Math.max(envelope.serviceInstanceCount * 2, request.peakConcurrentUsers > 0 ? Math.ceil(request.peakConcurrentUsers / 40) : 2),
    2,
    50,
  );

  switch (provider.providerId) {
    case "google-cloud-run":
      return {
        label: "Cloud Run service payload",
        format: "json",
        filename: `${slug}.cloud-run.json`,
        data: {
          providerId: provider.providerId,
          serviceName: slug,
          imageUrl: request.containerImage,
          region: request.preferredRegion || DEFAULT_REGION,
          environment: request.environment,
          minInstances: envelope.alwaysOn ? Math.min(2, envelope.serviceInstanceCount) : 0,
          maxInstances,
          cpuLimit: String(request.requiredCpuCores),
          memoryLimit: `${request.requiredMemoryGb}Gi`,
          port,
          privateNetworking: request.capabilities.privateNetworking,
          customDomains: request.capabilities.customDomains,
        },
        notes: [
          "Cloud Run works best when the primary service stays stateless.",
          "Background work can be split into a second service or Cloud Run jobs.",
        ],
      };
    case "aws-fargate":
      return {
        label: "AWS ECS Fargate blueprint",
        format: "json",
        filename: `${slug}.fargate.json`,
        data: {
          providerId: provider.providerId,
          clusterName: `${slug}-cluster`,
          serviceName: `${slug}-service`,
          desiredCount: envelope.serviceInstanceCount,
          launchType: "FARGATE",
          taskDefinition: {
            cpu: Math.round(request.requiredCpuCores * 1024),
            memory: Math.round(request.requiredMemoryGb * 1024),
            image: request.containerImage,
            portMappings: [
              {
                containerPort: port,
                protocol: request.capabilities.rawTcpUdp ? "udp" : "tcp",
              },
            ],
          },
          networking: {
            loadBalancerType: request.capabilities.rawTcpUdp ? "network" : "application",
            privateSubnetsRequired: request.capabilities.privateNetworking,
            multiAz: request.environment === "production",
          },
          schedules: request.capabilities.cronJobs
            ? {
                enabled: true,
                estimatedRunsPerMonth: request.scheduledJobRunsPerMonth,
              }
            : undefined,
        },
        notes: [
          "This repo now produces an AWS-ready blueprint, but the runtime adapter is not wired for direct execution yet.",
          "Add an ECS deployment adapter or Terraform apply step to make this option fully live.",
        ],
      };
    case "digitalocean-app-platform":
      return {
        label: "DigitalOcean App Platform blueprint",
        format: "json",
        filename: `${slug}.do-app-platform.json`,
        data: {
          providerId: provider.providerId,
          appName: slug,
          region: request.preferredRegion || "nyc",
          serviceSpec: {
            image: request.containerImage,
            httpPort: port,
            instanceCount: Math.max(1, envelope.serviceInstanceCount),
            instanceSizeHintUsd: getDigitalOceanPlanCost(request),
            workersEnabled: request.capabilities.backgroundWorkers,
            jobsEnabled: request.capabilities.cronJobs,
          },
          domains: request.capabilities.customDomains ? ["app.example.com"] : [],
        },
        notes: [
          "App Platform is best for HTTP-style services and worker patterns, not low-level SIP/UDP routing.",
          "Use a separate managed database when stateful storage is required.",
        ],
      };
    case "self-hosted-vm":
    default:
      return {
        label: "VM deployment blueprint",
        format: "json",
        filename: `${slug}.vm-deploy.json`,
        data: {
          providerId: provider.providerId,
          stack: "docker-compose",
          deployScript: "vm-deploy/deploy.sh",
          environment: request.environment,
          recommendedVm: {
            cpuCores: request.requiredCpuCores,
            memoryGb: request.requiredMemoryGb,
            storageGb: Math.max(80, request.requiredStorageGb),
            replicas: request.capabilities.multiRegion ? 2 : 1,
          },
          image: request.containerImage,
          ports: [port],
          dockerComposeCompatible: true,
        },
        notes: [
          "This option preserves the existing VM/Docker Compose deployment path in the repo.",
          "Plan for separate monitoring, backups, and patching if this becomes the long-term default.",
        ],
      };
  }
}

function buildRecommendation(
  provider: ProviderDefinition,
  request: NormalizedPlanRequest,
  envelope: WorkloadEnvelope,
  cheapestCost: number,
): MultiCloudProviderRecommendation {
  const costBreakdown = estimateCost(provider, request, envelope);
  const { coveragePercent, blockers, tradeoffs, reasons } = getCapabilityCoverage(provider, request);
  let score = 70;

  score += Math.round((coveragePercent - 50) * 0.6);
  score += computeCostBonus(costBreakdown.totalUsd, cheapestCost, request.costPreference);

  if (request.opsTeamExperience === "low") {
    score += provider.setupComplexity === "low" ? 12 : provider.setupComplexity === "medium" ? 3 : -18;
  } else if (request.opsTeamExperience === "high") {
    score += provider.setupComplexity === "high" ? 6 : 0;
  }

  if (request.costPreference === "managed") {
    score += provider.setupComplexity === "low" ? 8 : provider.setupComplexity === "medium" ? 2 : -10;
  }

  if (request.capabilities.rawTcpUdp && provider.capabilities.rawTcpUdp === "native") {
    score += 16;
  }

  if (request.capabilities.dockerCompose && provider.capabilities.dockerCompose === "native") {
    score += 18;
  }

  if (request.capabilities.multiRegion) {
    score += provider.capabilities.multiRegion === "native"
      ? 8
      : provider.capabilities.multiRegion === "conditional"
        ? -2
        : -18;
  }

  if (request.maxMonthlyBudgetUsd && costBreakdown.totalUsd > request.maxMonthlyBudgetUsd) {
    const overageRatio = costBreakdown.totalUsd / request.maxMonthlyBudgetUsd;
    score -= clamp(Math.round((overageRatio - 1) * 35), 6, 30);
    tradeoffs.push(`Estimated runtime cost exceeds the budget cap of $${request.maxMonthlyBudgetUsd.toFixed(2)}.`);
  }

  if (!provider.executionAvailable) {
    score -= 4;
    tradeoffs.push("Direct deployment execution is not wired yet; use the generated blueprint.");
  }

  score = clamp(score, 0, 100);
  const fit = buildFit(score, blockers);
  const rangeMultiplier = costBreakdown.confidence === "high" ? 0.08 : costBreakdown.confidence === "medium" ? 0.16 : 0.28;
  const estimatedMonthlyCostUsd = roundCurrency(costBreakdown.totalUsd);

  return {
    providerId: provider.providerId,
    providerName: provider.providerName,
    category: provider.category,
    automationLevel: provider.automationLevel,
    executionAvailable: provider.executionAvailable,
    score,
    fit,
    summary: buildSummary(provider, request, fit),
    estimatedMonthlyCostUsd,
    estimatedCostRangeUsd: {
      low: roundCurrency(estimatedMonthlyCostUsd * (1 - rangeMultiplier)),
      high: roundCurrency(estimatedMonthlyCostUsd * (1 + rangeMultiplier)),
    },
    setupComplexity: provider.setupComplexity,
    capabilityCoveragePercent: coveragePercent,
    reasons: reasons.slice(0, 4),
    tradeoffs: tradeoffs.slice(0, 4),
    blockers: blockers.slice(0, 4),
    capabilities: provider.capabilities,
    costBreakdown,
    blueprint: buildBlueprint(provider, request, envelope),
  };
}

export class MultiCloudDeploymentService {
  listProviders(): MultiCloudProviderDescriptor[] {
    return PROVIDERS.map((provider) => ({
      providerId: provider.providerId,
      providerName: provider.providerName,
      category: provider.category,
      automationLevel: provider.automationLevel,
      executionAvailable: provider.executionAvailable,
      description: provider.description,
    }));
  }

  planDeployment(input: MultiCloudDeploymentPlanRequest): MultiCloudDeploymentPlanResponse {
    const request = normalizeRequest(input);
    const envelope = buildWorkloadEnvelope(request);
    const rawCosts = PROVIDERS.map((provider) => estimateCost(provider, request, envelope).totalUsd);
    const cheapestCost = rawCosts.reduce((lowest, current) => {
      if (current <= 0) return lowest;
      return lowest <= 0 ? current : Math.min(lowest, current);
    }, 0);

    const providers = PROVIDERS
      .map((provider) => buildRecommendation(provider, request, envelope, cheapestCost))
      .sort((left, right) => {
        if (right.score !== left.score) return right.score - left.score;
        return left.estimatedMonthlyCostUsd - right.estimatedMonthlyCostUsd;
      });

    return {
      generatedAt: new Date().toISOString(),
      request,
      selectedProviderId: providers[0]?.providerId || "self-hosted-vm",
      assumptions: [
        "Estimates model base runtime cost, not the full cloud invoice.",
        "Managed database, CDN, and egress-heavy charges are shown as excluded items where vendor pricing was not modeled directly.",
        "Provider scores combine capability fit, operational overhead, budget alignment, and runtime estimate.",
      ],
      providers,
    };
  }
}

export const multiCloudDeploymentService = new MultiCloudDeploymentService();
