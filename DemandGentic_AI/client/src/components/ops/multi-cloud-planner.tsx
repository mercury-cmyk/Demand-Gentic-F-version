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

const WORKLOAD_OPTIONS: Array = [
  { value: "api", label: "API / Webhook Service" },
  { value: "full-stack", label: "Full-stack App" },
  { value: "worker", label: "Background Worker" },
  { value: "realtime-websocket", label: "Realtime WebSocket" },
  { value: "realtime-voice", label: "Realtime Voice / SIP" },
  { value: "scheduled-jobs", label: "Scheduled Jobs" },
];

const CAPABILITY_TOGGLE_CONFIG: Array = [
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

const PROJECT_DEFAULTS: Record> = {
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
      return ;
    case "aws-fargate":
      return ;
    case "digitalocean-app-platform":
      return ;
    case "self-hosted-vm":
    default:
      return ;
  }
}

export default function MultiCloudPlanner({ project }: { project: Project }) {
  const { toast } = useToast();
  const [planInput, setPlanInput] = useState(() => getDefaultPlan(project));
  const [plan, setPlan] = useState(null);
  const [loading, setLoading] = useState(false);
  const [deployingProviderId, setDeployingProviderId] = useState(null);
  const [selectedProviderId, setSelectedProviderId] = useState(null);

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
      const response = await apiJsonRequest("POST", "/api/ops/deployments/plan", nextInput);

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
      const response = await apiJsonRequest("POST", "/api/ops/deployments/deploy", {
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

  function updatePlanInput(
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
    
      
        
          
            
              
                
                Auto Provider Routing
              
              
                Multi-cloud deployment planner
                
                  Score Google Cloud, AWS, DigitalOcean, and self-hosted VM options from the application profile instead of hard-coding a single deploy target.
                
              
            
            
              
                
                  
                    
                    Target budget
                  
                  
                    {planInput.maxMonthlyBudgetUsd ? formatCurrency(planInput.maxMonthlyBudgetUsd) : "Open"}
                  
                
              
              
                
                  
                    
                    Selected route
                  
                  
                    {selectedProvider?.providerName || "Analyze requirements"}
                  
                
              
            
          
        
        
          
            
              Application
               updatePlanInput("appName", event.target.value)}
                placeholder="DemandGentic API"
                className="bg-white/90"
              />
            
            
              Container image
               updatePlanInput("containerImage", event.target.value)}
                placeholder="ghcr.io/org/image:tag"
                className="bg-white/90 font-mono text-sm"
              />
            
            
              Workload
               updatePlanInput("workloadType", value as DeploymentWorkloadType)}
              >
                
                  
                
                
                  {WORKLOAD_OPTIONS.map((option) => (
                    
                      {option.label}
                    
                  ))}
                
              
            
            
              Cost mode
               updatePlanInput("costPreference", value as MultiCloudDeploymentPlanRequest["costPreference"])}
              >
                
                  
                
                
                  Lowest cost
                  Balanced
                  Managed / low ops
                
              
            
          

          
            
              Monthly requests
               updatePlanInput("monthlyRequests", Number(event.target.value))}
                className="bg-white/90"
              />
            
            
              Avg request duration (ms)
               updatePlanInput("averageRequestDurationMs", Number(event.target.value))}
                className="bg-white/90"
              />
            
            
              Traffic / month (GB)
               updatePlanInput("monthlyTrafficGb", Number(event.target.value))}
                className="bg-white/90"
              />
            
            
              Peak concurrent users
               updatePlanInput("peakConcurrentUsers", Number(event.target.value))}
                className="bg-white/90"
              />
            
          

          
            
              CPU cores
               updatePlanInput("requiredCpuCores", Number(event.target.value))}
                className="bg-white/90"
              />
            
            
              Memory (GB)
               updatePlanInput("requiredMemoryGb", Number(event.target.value))}
                className="bg-white/90"
              />
            
            
              Storage (GB)
               updatePlanInput("requiredStorageGb", Number(event.target.value))}
                className="bg-white/90"
              />
            
            
              Budget cap / month
               {
                  const value = event.target.value.trim();
                  updatePlanInput("maxMonthlyBudgetUsd", value ? Number(value) : null);
                }}
                placeholder="Optional"
                className="bg-white/90"
              />
            
          

          
            
              Worker hours / month
               updatePlanInput("backgroundWorkerHours", Number(event.target.value))}
                className="bg-white/90"
              />
            
            
              Scheduled job runs / month
               updatePlanInput("scheduledJobRunsPerMonth", Number(event.target.value))}
                className="bg-white/90"
              />
            
            
              Ops team
               updatePlanInput("opsTeamExperience", value as MultiCloudDeploymentPlanRequest["opsTeamExperience"])}
              >
                
                  
                
                
                  Low ops capacity
                  Medium ops capacity
                  High ops capacity
                
              
            
            
              Preferred region
               updatePlanInput("preferredRegion", event.target.value)}
                className="bg-white/90"
              />
            
          

          

          
            {CAPABILITY_TOGGLE_CONFIG.map((toggle) => (
              
                
                  {toggle.label}
                  {toggle.description}
                
                 updateCapability(toggle.key, checked)}
                />
              
            ))}
          

          
            
              
                
                {planInput.requiredCpuCores} vCPU
              
              
                
                {planInput.requiredMemoryGb} GB RAM
              
              
                
                {planInput.requiredStorageGb} GB storage
              
            
             void fetchPlan()}
              disabled={loading}
              className="bg-slate-900 hover:bg-slate-800"
            >
              {loading ?  : }
              Analyze provider fit
            
          
        
      

      {plan && (
        <>
          
            {plan.providers.map((provider, index) => (
               setSelectedProviderId(provider.providerId)}
              >
                
                  
                    
                      
                        {getProviderIcon(provider.providerId)}
                        {provider.providerName}
                      
                      {provider.summary}
                    
                    {provider.fit.replace("-", " ")}
                  
                
                
                  
                    
                      {provider.score}
                      Score
                    
                    
                      
                        {formatCurrency(provider.estimatedMonthlyCostUsd)}
                      
                      
                        {formatCurrency(provider.estimatedCostRangeUsd.low)} to {formatCurrency(provider.estimatedCostRangeUsd.high)}
                      
                    
                  

                  
                    
                      Coverage
                      {provider.capabilityCoveragePercent}%
                    
                      
                        Automation
                        {canExecuteProvider(provider) ? "Live" : "Blueprint"}
                      
                  

                  {provider.reasons.length > 0 && (
                    
                      {provider.reasons.slice(0, 2).map((reason) => (
                        
                          
                          {reason}
                        
                      ))}
                    
                  )}
                
              
            ))}
          

          {selectedProvider && (
            
              
                
                  
                    
                      
                        {getProviderIcon(selectedProvider.providerId)}
                        {selectedProvider.providerName}
                      
                      
                        {selectedProvider.summary}
                      
                    
                    
                      
                        {selectedProvider.fit.replace("-", " ")}
                      
                      
                        {canExecuteProvider(selectedProvider) ? "Direct deploy" : "Blueprint only"}
                      
                    
                  
                
                
                  
                    
                      Runtime estimate
                      
                        {formatCurrency(selectedProvider.estimatedMonthlyCostUsd)}
                      
                    
                    
                      Setup complexity
                      
                        {selectedProvider.setupComplexity}
                      
                    
                    
                      Coverage
                      
                        {selectedProvider.capabilityCoveragePercent}%
                      
                    
                    
                      Confidence
                      
                        {selectedProvider.costBreakdown.confidence}
                      
                    
                  

                  
                    
                      Why it fits
                      
                        {selectedProvider.reasons.length > 0 ? selectedProvider.reasons.map((reason) => (
                          
                            
                            {reason}
                          
                        )) : (
                          No special boosts applied beyond the baseline fit.
                        )}
                      
                    

                    
                      Tradeoffs and blockers
                      
                        {[...selectedProvider.tradeoffs, ...selectedProvider.blockers].length > 0 ? (
                          [...selectedProvider.tradeoffs, ...selectedProvider.blockers].map((item) => (
                            
                              
                              {item}
                            
                          ))
                        ) : (
                          No material blockers were found for this profile.
                        )}
                      
                    
                  

                  
                    
                      Capability map
                      
                        {selectedProvider.category}
                      
                    
                    
                      {Object.entries(selectedProvider.capabilities).map(([key, value]) => (
                        
                          {key}
                        
                      ))}
                    
                  

                  
                    
                      
                        Deployment blueprint
                        
                          {selectedProvider.blueprint.label} in {selectedProvider.blueprint.filename}
                        
                      
                      
                         void handleCopyBlueprint(selectedProvider)}
                        >
                          
                          Copy blueprint
                        
                         void handleDeploy(selectedProvider)}
                          disabled={deployingProviderId !== null}
                          className="bg-slate-900 hover:bg-slate-800"
                        >
                          {deployingProviderId === selectedProvider.providerId ? (
                            
                          ) : (
                            
                          )}
                          {canExecuteProvider(selectedProvider) ? "Deploy now" : "Use blueprint"}
                        
                      
                    
                    
                      {JSON.stringify(selectedProvider.blueprint.data, null, 2)}
                    
                    
                      {selectedProvider.blueprint.notes.map((note) => (
                        
                          
                          {note}
                        
                      ))}
                    
                  
                
              

              
                
                  Cost model
                  
                    Runtime estimate for the selected provider. Use the excluded items list to decide where to layer DB, egress, or networking costs.
                  
                
                
                  
                    
                      Compute
                      
                        {formatCurrency(selectedProvider.costBreakdown.computeUsd)}
                      
                    
                    
                      Platform
                      
                        {formatCurrency(selectedProvider.costBreakdown.platformUsd)}
                      
                    
                    
                      Storage
                      
                        {formatCurrency(selectedProvider.costBreakdown.storageUsd)}
                      
                    
                    
                      Bandwidth
                      
                        {formatCurrency(selectedProvider.costBreakdown.bandwidthUsd)}
                      
                    
                  

                  
                    
                      
                      Excluded items
                    
                    
                      {selectedProvider.costBreakdown.excludedItems.map((item) => (
                        
                          
                          {item}
                        
                      ))}
                    
                  

                  
                    Planner assumptions
                    
                      {plan.assumptions.map((assumption) => (
                        
                          
                          {assumption}
                        
                      ))}
                    
                  
                
              
            
          )}
        
      )}
    
  );
}