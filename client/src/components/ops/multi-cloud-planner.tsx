import React, { useEffect, useMemo, useState } from "react";
import {
  Activity,
  CheckCircle2,
  Cloud,
  Copy,
  Cpu,
  Database,
  DollarSign,
  HardDrive,
  Loader2,
  Network,
  Rocket,
  Server,
  Wand2,
} from "lucide-react";
import type {
  CapabilitySupport,
  DeploymentProviderId,
  DeploymentWorkloadType,
  MultiCloudCapabilities,
  MultiCloudDeploymentPlanRequest,
  MultiCloudDeploymentPlanResponse,
  MultiCloudProviderRecommendation,
} from "@shared/multi-cloud-deployment";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import { apiJsonRequest } from "@/lib/queryClient";
import { cn } from "@/lib/utils";
import type { Project } from "@/pages/ops-hub";

const WORKLOAD_OPTIONS: Array<{ value: DeploymentWorkloadType; label: string }> = [
  { value: "api", label: "API / Webhook Service" },
  { value: "full-stack", label: "Full-stack App" },
  { value: "worker", label: "Background Worker" },
  { value: "realtime-websocket", label: "Realtime WebSocket" },
  { value: "realtime-voice", label: "Realtime Voice / SIP" },
  { value: "scheduled-jobs", label: "Scheduled Jobs" },
];

const CAPABILITY_TOGGLE_CONFIG: Array<{
  key: keyof MultiCloudCapabilities;
  label: string;
  description: string;
}> = [
  { key: "webSockets", label: "WebSockets", description: "Long-lived realtime connections." },
  { key: "rawTcpUdp", label: "TCP / UDP", description: "Needed for SIP, RTP, or low-level networking." },
  { key: "backgroundWorkers", label: "Workers", description: "Offload async/background processing." },
  { key: "cronJobs", label: "Cron jobs", description: "Scheduled jobs or recurring tasks." },
  { key: "managedDatabase", label: "Managed DB", description: "Needs first-party database integrations." },
  { key: "persistentDisk", label: "Persistent disk", description: "Stateful local storage beyond ephemeral disk." },
  { key: "customDomains", label: "Custom domains", description: "Needs a public custom domain." },
  { key: "dockerCompose", label: "Docker Compose", description: "Must preserve Compose-style deployment." },
  { key: "multiRegion", label: "Multi-region", description: "Needs cross-region deployment support." },
  { key: "privateNetworking", label: "Private networking", description: "Needs VPC/private network controls." },
  { key: "gpu", label: "GPU", description: "Requires GPU-backed runtime." },
];

const PROJECT_DEFAULTS: Record<string, Partial<MultiCloudDeploymentPlanRequest>> = {
  demandgentic: {
    workloadType: "full-stack",
    monthlyRequests: 600000,
    averageRequestDurationMs: 450,
    monthlyTrafficGb: 300,
    peakConcurrentUsers: 150,
    requiredCpuCores: 2,
    requiredMemoryGb: 4,
    requiredStorageGb: 80,
    backgroundWorkerHours: 240,
    scheduledJobRunsPerMonth: 1440,
    opsTeamExperience: "medium",
    costPreference: "balanced",
    capabilities: {
      webSockets: true,
      rawTcpUdp: false,
      backgroundWorkers: true,
      cronJobs: true,
      managedDatabase: true,
      persistentDisk: false,
      customDomains: true,
      dockerCompose: false,
      multiRegion: false,
      privateNetworking: true,
      gpu: false,
    },
  },
  "media-bridge": {
    workloadType: "realtime-voice",
    monthlyRequests: 120000,
    averageRequestDurationMs: 2500,
    monthlyTrafficGb: 450,
    peakConcurrentUsers: 40,
    requiredCpuCores: 2,
    requiredMemoryGb: 4,
    requiredStorageGb: 60,
    backgroundWorkerHours: 0,
    scheduledJobRunsPerMonth: 0,
    opsTeamExperience: "high",
    costPreference: "balanced",
    capabilities: {
      webSockets: true,
      rawTcpUdp: true,
      backgroundWorkers: false,
      cronJobs: false,
      managedDatabase: false,
      persistentDisk: false,
      customDomains: false,
      dockerCompose: true,
      multiRegion: false,
      privateNetworking: true,
      gpu: false,
    },
  },
  drachtio: {
    workloadType: "realtime-voice",
    monthlyRequests: 80000,
    averageRequestDurationMs: 4000,
    monthlyTrafficGb: 180,
    peakConcurrentUsers: 25,
    requiredCpuCores: 2,
    requiredMemoryGb: 2,
    requiredStorageGb: 40,
    backgroundWorkerHours: 0,
    scheduledJobRunsPerMonth: 0,
    opsTeamExperience: "high",
    costPreference: "balanced",
    capabilities: {
      webSockets: false,
      rawTcpUdp: true,
      backgroundWorkers: false,
      cronJobs: false,
      managedDatabase: false,
      persistentDisk: false,
      customDomains: false,
      dockerCompose: true,
      multiRegion: false,
      privateNetworking: true,
      gpu: false,
    },
  },
  "cloud-services": {
    workloadType: "api",
    monthlyRequests: 1200000,
    averageRequestDurationMs: 350,
    monthlyTrafficGb: 220,
    peakConcurrentUsers: 220,
    requiredCpuCores: 1,
    requiredMemoryGb: 1,
    requiredStorageGb: 20,
    backgroundWorkerHours: 60,
    scheduledJobRunsPerMonth: 360,
    opsTeamExperience: "low",
    costPreference: "lowest-cost",
    capabilities: {
      webSockets: false,
      rawTcpUdp: false,
      backgroundWorkers: true,
      cronJobs: true,
      managedDatabase: true,
      persistentDisk: false,
      customDomains: true,
      dockerCompose: false,
      multiRegion: false,
      privateNetworking: true,
      gpu: false,
    },
  },
};

function getDefaultPlan(project: Project): MultiCloudDeploymentPlanRequest {
  const projectDefaults = PROJECT_DEFAULTS[project.id] ?? {};

  return {
    appName: project.name,
    containerImage: project.services[0]?.imageUrl || "",
    environment: project.environment,
    workloadType: projectDefaults.workloadType || "api",
    monthlyRequests: projectDefaults.monthlyRequests || 100000,
    averageRequestDurationMs: projectDefaults.averageRequestDurationMs || 300,
    monthlyTrafficGb: projectDefaults.monthlyTrafficGb || 80,
    peakConcurrentUsers: projectDefaults.peakConcurrentUsers || 50,
    requiredCpuCores: projectDefaults.requiredCpuCores || 1,
    requiredMemoryGb: projectDefaults.requiredMemoryGb || 1,
    requiredStorageGb: projectDefaults.requiredStorageGb || 20,
    backgroundWorkerHours: projectDefaults.backgroundWorkerHours || 0,
    scheduledJobRunsPerMonth: projectDefaults.scheduledJobRunsPerMonth || 0,
    maxMonthlyBudgetUsd: null,
    preferredRegion: "us-central1",
    opsTeamExperience: projectDefaults.opsTeamExperience || "medium",
    costPreference: projectDefaults.costPreference || "balanced",
    capabilities: projectDefaults.capabilities || {
      webSockets: false,
      rawTcpUdp: false,
      backgroundWorkers: false,
      cronJobs: false,
      managedDatabase: true,
      persistentDisk: false,
      customDomains: true,
      dockerCompose: false,
      multiRegion: false,
      privateNetworking: false,
      gpu: false,
    },
  };
}

function formatCurrency(value: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: value >= 100 ? 0 : 2,
  }).format(value);
}

function getFitBadgeClass(fit: MultiCloudProviderRecommendation["fit"]): string {
  switch (fit) {
    case "best-fit":
      return "bg-emerald-100 text-emerald-700 border-emerald-200";
    case "good-fit":
      return "bg-blue-100 text-blue-700 border-blue-200";
    case "acceptable":
      return "bg-amber-100 text-amber-700 border-amber-200";
    default:
      return "bg-red-100 text-red-700 border-red-200";
  }
}

function getSupportBadgeClass(value: CapabilitySupport): string {
  switch (value) {
    case "native":
      return "bg-emerald-100 text-emerald-700 border-emerald-200";
    case "conditional":
      return "bg-amber-100 text-amber-700 border-amber-200";
    default:
      return "bg-slate-100 text-slate-600 border-slate-200";
  }
}

function getProviderIcon(providerId: DeploymentProviderId) {
  switch (providerId) {
    case "google-cloud-run":
      return <Cloud className="h-4 w-4 text-blue-500" />;
    case "aws-fargate":
      return <Network className="h-4 w-4 text-orange-500" />;
    case "digitalocean-app-platform":
      return <Activity className="h-4 w-4 text-cyan-500" />;
    case "self-hosted-vm":
    default:
      return <Server className="h-4 w-4 text-slate-500" />;
  }
}

export default function MultiCloudPlanner({ project }: { project: Project }) {
  const { toast } = useToast();
  const [planInput, setPlanInput] = useState<MultiCloudDeploymentPlanRequest>(() => getDefaultPlan(project));
  const [plan, setPlan] = useState<MultiCloudDeploymentPlanResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [deployingProviderId, setDeployingProviderId] = useState<DeploymentProviderId | null>(null);
  const [selectedProviderId, setSelectedProviderId] = useState<DeploymentProviderId | null>(null);

  useEffect(() => {
    const nextDefault = getDefaultPlan(project);
    setPlanInput(nextDefault);
    void fetchPlan(nextDefault);
  }, [project.id]);

  const selectedProvider = useMemo(
    () => plan?.providers.find((provider) => provider.providerId === selectedProviderId) || plan?.providers[0] || null,
    [plan, selectedProviderId],
  );

  function canExecuteProvider(provider: MultiCloudProviderRecommendation): boolean {
    if (!provider.executionAvailable) {
      return false;
    }

    if (provider.providerId === "self-hosted-vm") {
      return project.deployTarget === "vm";
    }

    if (provider.providerId === "google-cloud-run") {
      return Boolean(planInput.containerImage?.trim());
    }

    return false;
  }

  async function fetchPlan(nextInput: MultiCloudDeploymentPlanRequest = planInput) {
    setLoading(true);
    try {
      const response = await apiJsonRequest<{
        success: boolean;
        plan: MultiCloudDeploymentPlanResponse;
        error?: string;
      }>("POST", "/api/ops/deployments/plan", nextInput);

      if (!response.success) {
        throw new Error(response.error || "Failed to generate deployment plan");
      }

      setPlan(response.plan);
      setSelectedProviderId(response.plan.selectedProviderId);
    } catch (error) {
      toast({
        title: "Planner unavailable",
        description: error instanceof Error ? error.message : String(error),
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  }

  async function handleCopyBlueprint(provider: MultiCloudProviderRecommendation) {
    try {
      await navigator.clipboard.writeText(JSON.stringify(provider.blueprint.data, null, 2));
      toast({
        title: "Blueprint copied",
        description: `${provider.providerName} blueprint copied to clipboard.`,
      });
    } catch (error) {
      toast({
        title: "Copy failed",
        description: error instanceof Error ? error.message : String(error),
        variant: "destructive",
      });
    }
  }

  async function handleDeploy(provider: MultiCloudProviderRecommendation) {
    if (!canExecuteProvider(provider)) {
      void handleCopyBlueprint(provider);
      return;
    }

    if (provider.providerId === "google-cloud-run" && !planInput.containerImage?.trim()) {
      toast({
        title: "Container image required",
        description: "Add a container image before deploying to a managed provider.",
        variant: "destructive",
      });
      return;
    }

    setDeployingProviderId(provider.providerId);
    try {
      const blueprint = provider.blueprint.data;
      const response = await apiJsonRequest<{
        success: boolean;
        message?: string;
        error?: string;
      }>("POST", "/api/ops/deployments/deploy", {
        providerId: provider.providerId,
        serviceName: blueprint.serviceName,
        imageUrl: blueprint.imageUrl,
        region: blueprint.region,
        minInstances: blueprint.minInstances,
        maxInstances: blueprint.maxInstances,
        cpuLimit: blueprint.cpuLimit,
        memoryLimit: blueprint.memoryLimit,
        port: blueprint.port,
      });

      if (!response.success) {
        throw new Error(response.error || "Deployment failed");
      }

      toast({
        title: "Deployment started",
        description: response.message || `${provider.providerName} deployment queued successfully.`,
      });
    } catch (error) {
      toast({
        title: "Deployment failed",
        description: error instanceof Error ? error.message : String(error),
        variant: "destructive",
      });
    } finally {
      setDeployingProviderId(null);
    }
  }

  function updatePlanInput<K extends keyof MultiCloudDeploymentPlanRequest>(
    key: K,
    value: MultiCloudDeploymentPlanRequest[K],
  ) {
    setPlanInput((current) => ({
      ...current,
      [key]: value,
    }));
  }

  function updateCapability(key: keyof MultiCloudCapabilities, value: boolean) {
    setPlanInput((current) => ({
      ...current,
      capabilities: {
        ...current.capabilities,
        [key]: value,
      },
    }));
  }

  return (
    <div className="space-y-6">
      <Card className="overflow-hidden border-slate-200 bg-[linear-gradient(135deg,#f7fafc_0%,#eef6ff_55%,#fff8ec_100%)]">
        <CardHeader className="pb-3">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div className="space-y-2">
              <div className="inline-flex items-center gap-2 rounded-full border border-white/70 bg-white/80 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500 shadow-sm">
                <Wand2 className="h-3.5 w-3.5 text-indigo-500" />
                Auto Provider Routing
              </div>
              <div>
                <CardTitle className="text-slate-900">Multi-cloud deployment planner</CardTitle>
                <CardDescription className="mt-1 max-w-3xl text-slate-600">
                  Score Google Cloud, AWS, DigitalOcean, and self-hosted VM options from the application profile instead of hard-coding a single deploy target.
                </CardDescription>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3 lg:min-w-[360px]">
              <Card className="border-white/80 bg-white/70 shadow-sm">
                <CardContent className="pt-4">
                  <div className="flex items-center gap-2 text-slate-500">
                    <DollarSign className="h-4 w-4 text-emerald-500" />
                    <span className="text-xs font-semibold uppercase tracking-[0.16em]">Target budget</span>
                  </div>
                  <div className="mt-2 text-2xl font-bold text-slate-900">
                    {planInput.maxMonthlyBudgetUsd ? formatCurrency(planInput.maxMonthlyBudgetUsd) : "Open"}
                  </div>
                </CardContent>
              </Card>
              <Card className="border-white/80 bg-white/70 shadow-sm">
                <CardContent className="pt-4">
                  <div className="flex items-center gap-2 text-slate-500">
                    <Rocket className="h-4 w-4 text-blue-500" />
                    <span className="text-xs font-semibold uppercase tracking-[0.16em]">Selected route</span>
                  </div>
                  <div className="mt-2 text-sm font-semibold text-slate-900">
                    {selectedProvider?.providerName || "Analyze requirements"}
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <div className="space-y-2">
              <Label htmlFor="app-name">Application</Label>
              <Input
                id="app-name"
                value={planInput.appName}
                onChange={(event) => updatePlanInput("appName", event.target.value)}
                placeholder="DemandGentic API"
                className="bg-white/90"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="container-image">Container image</Label>
              <Input
                id="container-image"
                value={planInput.containerImage || ""}
                onChange={(event) => updatePlanInput("containerImage", event.target.value)}
                placeholder="ghcr.io/org/image:tag"
                className="bg-white/90 font-mono text-sm"
              />
            </div>
            <div className="space-y-2">
              <Label>Workload</Label>
              <Select
                value={planInput.workloadType}
                onValueChange={(value) => updatePlanInput("workloadType", value as DeploymentWorkloadType)}
              >
                <SelectTrigger className="bg-white/90">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {WORKLOAD_OPTIONS.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Cost mode</Label>
              <Select
                value={planInput.costPreference}
                onValueChange={(value) => updatePlanInput("costPreference", value as MultiCloudDeploymentPlanRequest["costPreference"])}
              >
                <SelectTrigger className="bg-white/90">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="lowest-cost">Lowest cost</SelectItem>
                  <SelectItem value="balanced">Balanced</SelectItem>
                  <SelectItem value="managed">Managed / low ops</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <div className="space-y-2">
              <Label htmlFor="monthly-requests">Monthly requests</Label>
              <Input
                id="monthly-requests"
                type="number"
                min={0}
                value={planInput.monthlyRequests}
                onChange={(event) => updatePlanInput("monthlyRequests", Number(event.target.value))}
                className="bg-white/90"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="request-duration">Avg request duration (ms)</Label>
              <Input
                id="request-duration"
                type="number"
                min={50}
                value={planInput.averageRequestDurationMs}
                onChange={(event) => updatePlanInput("averageRequestDurationMs", Number(event.target.value))}
                className="bg-white/90"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="traffic-gb">Traffic / month (GB)</Label>
              <Input
                id="traffic-gb"
                type="number"
                min={0}
                value={planInput.monthlyTrafficGb}
                onChange={(event) => updatePlanInput("monthlyTrafficGb", Number(event.target.value))}
                className="bg-white/90"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="peak-users">Peak concurrent users</Label>
              <Input
                id="peak-users"
                type="number"
                min={0}
                value={planInput.peakConcurrentUsers}
                onChange={(event) => updatePlanInput("peakConcurrentUsers", Number(event.target.value))}
                className="bg-white/90"
              />
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <div className="space-y-2">
              <Label htmlFor="cpu-cores">CPU cores</Label>
              <Input
                id="cpu-cores"
                type="number"
                min={0.25}
                step={0.25}
                value={planInput.requiredCpuCores}
                onChange={(event) => updatePlanInput("requiredCpuCores", Number(event.target.value))}
                className="bg-white/90"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="memory-gb">Memory (GB)</Label>
              <Input
                id="memory-gb"
                type="number"
                min={0.5}
                step={0.5}
                value={planInput.requiredMemoryGb}
                onChange={(event) => updatePlanInput("requiredMemoryGb", Number(event.target.value))}
                className="bg-white/90"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="storage-gb">Storage (GB)</Label>
              <Input
                id="storage-gb"
                type="number"
                min={0}
                value={planInput.requiredStorageGb}
                onChange={(event) => updatePlanInput("requiredStorageGb", Number(event.target.value))}
                className="bg-white/90"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="budget-usd">Budget cap / month</Label>
              <Input
                id="budget-usd"
                type="number"
                min={0}
                value={planInput.maxMonthlyBudgetUsd ?? ""}
                onChange={(event) => {
                  const value = event.target.value.trim();
                  updatePlanInput("maxMonthlyBudgetUsd", value ? Number(value) : null);
                }}
                placeholder="Optional"
                className="bg-white/90"
              />
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <div className="space-y-2">
              <Label htmlFor="worker-hours">Worker hours / month</Label>
              <Input
                id="worker-hours"
                type="number"
                min={0}
                value={planInput.backgroundWorkerHours}
                onChange={(event) => updatePlanInput("backgroundWorkerHours", Number(event.target.value))}
                className="bg-white/90"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="job-runs">Scheduled job runs / month</Label>
              <Input
                id="job-runs"
                type="number"
                min={0}
                value={planInput.scheduledJobRunsPerMonth}
                onChange={(event) => updatePlanInput("scheduledJobRunsPerMonth", Number(event.target.value))}
                className="bg-white/90"
              />
            </div>
            <div className="space-y-2">
              <Label>Ops team</Label>
              <Select
                value={planInput.opsTeamExperience}
                onValueChange={(value) => updatePlanInput("opsTeamExperience", value as MultiCloudDeploymentPlanRequest["opsTeamExperience"])}
              >
                <SelectTrigger className="bg-white/90">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="low">Low ops capacity</SelectItem>
                  <SelectItem value="medium">Medium ops capacity</SelectItem>
                  <SelectItem value="high">High ops capacity</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="preferred-region">Preferred region</Label>
              <Input
                id="preferred-region"
                value={planInput.preferredRegion || ""}
                onChange={(event) => updatePlanInput("preferredRegion", event.target.value)}
                className="bg-white/90"
              />
            </div>
          </div>

          <Separator className="bg-slate-200/80" />

          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {CAPABILITY_TOGGLE_CONFIG.map((toggle) => (
              <div
                key={toggle.key}
                className="flex items-start justify-between gap-4 rounded-2xl border border-white/80 bg-white/75 px-4 py-3 shadow-sm"
              >
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-slate-800">{toggle.label}</p>
                  <p className="mt-1 text-xs leading-relaxed text-slate-500">{toggle.description}</p>
                </div>
                <Switch
                  checked={planInput.capabilities[toggle.key]}
                  onCheckedChange={(checked) => updateCapability(toggle.key, checked)}
                />
              </div>
            ))}
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-4 text-xs text-slate-500">
              <span className="inline-flex items-center gap-1.5">
                <Cpu className="h-3.5 w-3.5 text-slate-400" />
                {planInput.requiredCpuCores} vCPU
              </span>
              <span className="inline-flex items-center gap-1.5">
                <HardDrive className="h-3.5 w-3.5 text-slate-400" />
                {planInput.requiredMemoryGb} GB RAM
              </span>
              <span className="inline-flex items-center gap-1.5">
                <Database className="h-3.5 w-3.5 text-slate-400" />
                {planInput.requiredStorageGb} GB storage
              </span>
            </div>
            <Button
              onClick={() => void fetchPlan()}
              disabled={loading}
              className="bg-slate-900 hover:bg-slate-800"
            >
              {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Wand2 className="mr-2 h-4 w-4" />}
              Analyze provider fit
            </Button>
          </div>
        </CardContent>
      </Card>

      {plan && (
        <>
          <div className="grid gap-4 xl:grid-cols-4">
            {plan.providers.map((provider, index) => (
              <Card
                key={provider.providerId}
                className={cn(
                  "cursor-pointer border-slate-200 transition-all hover:-translate-y-0.5 hover:shadow-md",
                  selectedProviderId === provider.providerId && "border-slate-900 shadow-md",
                  index === 0 && "bg-[linear-gradient(180deg,#ffffff_0%,#f8fbff_100%)]",
                )}
                onClick={() => setSelectedProviderId(provider.providerId)}
              >
                <CardHeader className="pb-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="space-y-2">
                      <div className="flex items-center gap-2">
                        {getProviderIcon(provider.providerId)}
                        <CardTitle className="text-base text-slate-900">{provider.providerName}</CardTitle>
                      </div>
                      <CardDescription className="text-slate-500">{provider.summary}</CardDescription>
                    </div>
                    <Badge className={getFitBadgeClass(provider.fit)}>{provider.fit.replace("-", " ")}</Badge>
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex items-end justify-between">
                    <div>
                      <div className="text-3xl font-bold text-slate-900">{provider.score}</div>
                      <div className="text-xs uppercase tracking-[0.16em] text-slate-400">Score</div>
                    </div>
                    <div className="text-right">
                      <div className="text-lg font-semibold text-slate-900">
                        {formatCurrency(provider.estimatedMonthlyCostUsd)}
                      </div>
                      <div className="text-xs text-slate-500">
                        {formatCurrency(provider.estimatedCostRangeUsd.low)} to {formatCurrency(provider.estimatedCostRangeUsd.high)}
                      </div>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <div className="rounded-xl bg-slate-50 px-3 py-2">
                      <div className="text-slate-400">Coverage</div>
                      <div className="mt-1 font-semibold text-slate-800">{provider.capabilityCoveragePercent}%</div>
                    </div>
                      <div className="rounded-xl bg-slate-50 px-3 py-2">
                        <div className="text-slate-400">Automation</div>
                        <div className="mt-1 font-semibold text-slate-800">{canExecuteProvider(provider) ? "Live" : "Blueprint"}</div>
                      </div>
                  </div>

                  {provider.reasons.length > 0 && (
                    <div className="space-y-1">
                      {provider.reasons.slice(0, 2).map((reason) => (
                        <div key={reason} className="flex items-start gap-2 text-xs text-slate-600">
                          <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-500" />
                          <span>{reason}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>

          {selectedProvider && (
            <div className="grid gap-6 xl:grid-cols-[1.15fr,0.85fr]">
              <Card className="border-slate-200">
                <CardHeader className="pb-3">
                  <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                    <div>
                      <CardTitle className="flex items-center gap-2 text-slate-900">
                        {getProviderIcon(selectedProvider.providerId)}
                        {selectedProvider.providerName}
                      </CardTitle>
                      <CardDescription className="mt-1 text-slate-500">
                        {selectedProvider.summary}
                      </CardDescription>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <Badge className={getFitBadgeClass(selectedProvider.fit)}>
                        {selectedProvider.fit.replace("-", " ")}
                      </Badge>
                      <Badge variant="outline" className="border-slate-300 text-slate-600">
                        {canExecuteProvider(selectedProvider) ? "Direct deploy" : "Blueprint only"}
                      </Badge>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="space-y-5">
                  <div className="grid gap-4 md:grid-cols-4">
                    <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
                      <div className="text-xs uppercase tracking-[0.16em] text-slate-400">Runtime estimate</div>
                      <div className="mt-2 text-2xl font-bold text-slate-900">
                        {formatCurrency(selectedProvider.estimatedMonthlyCostUsd)}
                      </div>
                    </div>
                    <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
                      <div className="text-xs uppercase tracking-[0.16em] text-slate-400">Setup complexity</div>
                      <div className="mt-2 text-2xl font-bold capitalize text-slate-900">
                        {selectedProvider.setupComplexity}
                      </div>
                    </div>
                    <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
                      <div className="text-xs uppercase tracking-[0.16em] text-slate-400">Coverage</div>
                      <div className="mt-2 text-2xl font-bold text-slate-900">
                        {selectedProvider.capabilityCoveragePercent}%
                      </div>
                    </div>
                    <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
                      <div className="text-xs uppercase tracking-[0.16em] text-slate-400">Confidence</div>
                      <div className="mt-2 text-2xl font-bold capitalize text-slate-900">
                        {selectedProvider.costBreakdown.confidence}
                      </div>
                    </div>
                  </div>

                  <div className="grid gap-4 md:grid-cols-2">
                    <div className="rounded-2xl border border-slate-200 p-4">
                      <p className="text-sm font-semibold text-slate-800">Why it fits</p>
                      <div className="mt-3 space-y-2">
                        {selectedProvider.reasons.length > 0 ? selectedProvider.reasons.map((reason) => (
                          <div key={reason} className="flex items-start gap-2 text-sm text-slate-600">
                            <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-500" />
                            <span>{reason}</span>
                          </div>
                        )) : (
                          <p className="text-sm text-slate-500">No special boosts applied beyond the baseline fit.</p>
                        )}
                      </div>
                    </div>

                    <div className="rounded-2xl border border-slate-200 p-4">
                      <p className="text-sm font-semibold text-slate-800">Tradeoffs and blockers</p>
                      <div className="mt-3 space-y-2">
                        {[...selectedProvider.tradeoffs, ...selectedProvider.blockers].length > 0 ? (
                          [...selectedProvider.tradeoffs, ...selectedProvider.blockers].map((item) => (
                            <div key={item} className="flex items-start gap-2 text-sm text-slate-600">
                              <Activity className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" />
                              <span>{item}</span>
                            </div>
                          ))
                        ) : (
                          <p className="text-sm text-slate-500">No material blockers were found for this profile.</p>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="rounded-2xl border border-slate-200 p-4">
                    <div className="flex items-center justify-between gap-3">
                      <p className="text-sm font-semibold text-slate-800">Capability map</p>
                      <Badge variant="outline" className="border-slate-300 text-slate-600">
                        {selectedProvider.category}
                      </Badge>
                    </div>
                    <div className="mt-4 flex flex-wrap gap-2">
                      {Object.entries(selectedProvider.capabilities).map(([key, value]) => (
                        <Badge key={key} className={getSupportBadgeClass(value as CapabilitySupport)}>
                          {key}
                        </Badge>
                      ))}
                    </div>
                  </div>

                  <div className="rounded-2xl border border-slate-200 p-4">
                    <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                      <div>
                        <p className="text-sm font-semibold text-slate-800">Deployment blueprint</p>
                        <p className="mt-1 text-sm text-slate-500">
                          {selectedProvider.blueprint.label} in {selectedProvider.blueprint.filename}
                        </p>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <Button
                          variant="outline"
                          onClick={() => void handleCopyBlueprint(selectedProvider)}
                        >
                          <Copy className="mr-2 h-4 w-4" />
                          Copy blueprint
                        </Button>
                        <Button
                          onClick={() => void handleDeploy(selectedProvider)}
                          disabled={deployingProviderId !== null}
                          className="bg-slate-900 hover:bg-slate-800"
                        >
                          {deployingProviderId === selectedProvider.providerId ? (
                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          ) : (
                            <Rocket className="mr-2 h-4 w-4" />
                          )}
                          {canExecuteProvider(selectedProvider) ? "Deploy now" : "Use blueprint"}
                        </Button>
                      </div>
                    </div>
                    <pre className="mt-4 overflow-x-auto rounded-2xl bg-slate-950 p-4 text-[12px] leading-relaxed text-slate-100">
                      {JSON.stringify(selectedProvider.blueprint.data, null, 2)}
                    </pre>
                    <div className="mt-4 space-y-2">
                      {selectedProvider.blueprint.notes.map((note) => (
                        <div key={note} className="flex items-start gap-2 text-sm text-slate-600">
                          <Activity className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" />
                          <span>{note}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card className="border-slate-200">
                <CardHeader className="pb-3">
                  <CardTitle className="text-slate-900">Cost model</CardTitle>
                  <CardDescription className="text-slate-500">
                    Runtime estimate for the selected provider. Use the excluded items list to decide where to layer DB, egress, or networking costs.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
                      <div className="text-xs uppercase tracking-[0.16em] text-slate-400">Compute</div>
                      <div className="mt-2 text-xl font-bold text-slate-900">
                        {formatCurrency(selectedProvider.costBreakdown.computeUsd)}
                      </div>
                    </div>
                    <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
                      <div className="text-xs uppercase tracking-[0.16em] text-slate-400">Platform</div>
                      <div className="mt-2 text-xl font-bold text-slate-900">
                        {formatCurrency(selectedProvider.costBreakdown.platformUsd)}
                      </div>
                    </div>
                    <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
                      <div className="text-xs uppercase tracking-[0.16em] text-slate-400">Storage</div>
                      <div className="mt-2 text-xl font-bold text-slate-900">
                        {formatCurrency(selectedProvider.costBreakdown.storageUsd)}
                      </div>
                    </div>
                    <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
                      <div className="text-xs uppercase tracking-[0.16em] text-slate-400">Bandwidth</div>
                      <div className="mt-2 text-xl font-bold text-slate-900">
                        {formatCurrency(selectedProvider.costBreakdown.bandwidthUsd)}
                      </div>
                    </div>
                  </div>

                  <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-4">
                    <div className="flex items-center gap-2">
                      <DollarSign className="h-4 w-4 text-slate-500" />
                      <p className="text-sm font-semibold text-slate-800">Excluded items</p>
                    </div>
                    <div className="mt-3 space-y-2">
                      {selectedProvider.costBreakdown.excludedItems.map((item) => (
                        <div key={item} className="flex items-start gap-2 text-sm text-slate-600">
                          <Activity className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" />
                          <span>{item}</span>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="rounded-2xl border border-dashed border-indigo-200 bg-indigo-50/70 p-4">
                    <p className="text-sm font-semibold text-indigo-900">Planner assumptions</p>
                    <div className="mt-3 space-y-2">
                      {plan.assumptions.map((assumption) => (
                        <div key={assumption} className="flex items-start gap-2 text-sm text-indigo-800">
                          <Activity className="mt-0.5 h-4 w-4 shrink-0 text-indigo-500" />
                          <span>{assumption}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
          )}
        </>
      )}
    </div>
  );
}
