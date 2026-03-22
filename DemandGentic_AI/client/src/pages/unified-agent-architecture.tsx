/**
 * Unified Agent Intelligence Dashboard
 * 
 * One Agent Per Type. Fully Self-Contained. Learning-Integrated.
 * 
 * This page provides a comprehensive view of the unified agent architecture:
 * - System overview with all agent types
 * - Agent detail view with prompt section editor
 * - Capability-to-prompt mapping visualization
 * - Learning pipeline status and controls
 * - Recommendation management (apply/reject)
 * - Version history and rollback
 * - Configuration editor
 */

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  Bot,
  Brain,
  Mail,
  Phone,
  Shield,
  Database,
  Search,
  FileText,
  GitBranch,
  ArrowLeft,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  TrendingUp,
  TrendingDown,
  Minus,
  Activity,
  Loader2,
  RotateCcw,
  Zap,
  Target,
  Lightbulb,
  RefreshCw,
  Settings,
  BarChart3,
  GitCompare,
  History,
  PenLine,
  Plus,
  Edit2,
  Trash2,
  Filter,
  Users,
  Sparkles,
  ChevronDown,
  ChevronRight,
  Check,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";
import { getAuthHeaders, apiRequest } from "@/lib/queryClient";

// ==================== API FUNCTIONS ====================

const API_BASE = "/api/unified-agents";

async function fetchJson(url: string) {
  const res = await fetch(url, { headers: getAuthHeaders(url), credentials: "include" });
  if (!res.ok) {
    const errorText = await res.text();
    // Try to parse as JSON for better error messages
    try {
      const errorJson = JSON.parse(errorText);
      throw new Error(errorJson.message || errorJson.error || `HTTP ${res.status}: ${errorText}`);
    } catch {
      throw new Error(`HTTP ${res.status}: ${errorText}`);
    }
  }
  return res.json();
}

async function postJson(url: string, body?: any) {
  const res = await fetch(url, {
    method: "POST",
    headers: { ...getAuthHeaders(url), "Content-Type": "application/json" },
    credentials: "include",
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    const errorText = await res.text();
    try {
      const errorJson = JSON.parse(errorText);
      throw new Error(errorJson.message || errorJson.error || `HTTP ${res.status}: ${errorText}`);
    } catch (parseErr) {
      if (parseErr instanceof SyntaxError) throw new Error(`HTTP ${res.status}: ${errorText}`);
      throw parseErr;
    }
  }
  return res.json();
}

async function putJson(url: string, body: any) {
  const res = await fetch(url, {
    method: "PUT",
    headers: { ...getAuthHeaders(url), "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

async function patchJson(url: string, body: any) {
  const res = await fetch(url, {
    method: "PATCH",
    headers: { ...getAuthHeaders(url), "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

// ==================== ICON MAP ====================

const agentIcons: Record = {
  voice: ,
  email: ,
  strategy: ,
  compliance: ,
  data: ,
  research: ,
  content: ,
  pipeline: ,
};

const statusColors: Record = {
  active: "bg-green-500/15 text-green-400 border-green-500/30",
  inactive: "bg-gray-500/15 text-gray-400 border-gray-500/30",
  maintenance: "bg-yellow-500/15 text-yellow-400 border-yellow-500/30",
  deprecated: "bg-red-500/15 text-red-400 border-red-500/30",
};

const trendIcons: Record = {
  improving: ,
  declining: ,
  stable: ,
};

function clampPercent(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(100, Math.round(value)));
}

function getAgentCardProgress(agent: any): number {
  if (typeof agent?.trackingProgress === "number") {
    return clampPercent(agent.trackingProgress);
  }

  if (typeof agent?.overallPerformanceScore === "number" && agent.overallPerformanceScore > 0) {
    return clampPercent(agent.overallPerformanceScore);
  }

  if (Array.isArray(agent?.capabilityScores) && agent.capabilityScores.length > 0) {
    const avg =
      agent.capabilityScores.reduce((sum: number, cap: any) => sum + (cap?.score || 0), 0) /
      agent.capabilityScores.length;
    return clampPercent(avg);
  }

  if ((agent?.totalPromptSections || 0) > 0) {
    return clampPercent(((agent?.activePromptSections || 0) / agent.totalPromptSections) * 100);
  }

  return 0;
}

// ==================== MAIN COMPONENT ====================

export default function UnifiedAgentArchitectureDashboard() {
  const [selectedAgentType, setSelectedAgentType] = useState(null);
  const [activeTab, setActiveTab] = useState("overview");

  return (
    
      {/* Header */}
      
        
          {selectedAgentType && (
             setSelectedAgentType(null)}
              className="mr-1"
            >
              
            
          )}
          
          
            
              {selectedAgentType
                ? `${selectedAgentType.charAt(0).toUpperCase() + selectedAgentType.slice(1)} Agent`
                : "AgentX — The Operator"}
            
            
              One Agent Per Type &bull; Fully Self-Contained &bull; Learning-Integrated
            
          
        
      

      {/* Content */}
      
        {selectedAgentType ? (
          
        ) : (
          
            
               { setSelectedAgentType(type); setActiveTab("overview"); }} />
            
          
        )}
      
    
  );
}

// ==================== SYSTEM OVERVIEW ====================

function SystemOverview({ onSelectAgent }: { onSelectAgent: (type: string) => void }) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { data: summary, isLoading, error, isError } = useQuery({
    queryKey: ["unified-agents-summary"],
    queryFn: () => fetchJson(API_BASE),
    refetchInterval: 30000,
    refetchIntervalInBackground: false,
  });

  const { data: architectureMode, isLoading: architectureModeLoading } = useQuery({
    queryKey: ["voice-architecture-mode"],
    queryFn: () => fetchJson(`${API_BASE}/voice/architecture-mode`),
    refetchInterval: 30000,
    refetchIntervalInBackground: false,
  });

  const setArchitectureMode = useMutation({
    mutationFn: ({ architectureMode }: { architectureMode: "legacy" | "unified" }) =>
      putJson(`${API_BASE}/voice/architecture-mode`, { architectureMode }),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["voice-architecture-mode"] });
      toast({
        title: "Voice architecture updated",
        description: `Runtime mode is now ${data?.architectureMode || "updated"}.`,
      });
    },
    onError: (err: Error) => {
      toast({ title: "Update failed", description: err.message, variant: "destructive" });
    },
  });

  if (isLoading) {
    return (
      
        
      
    );
  }

  if (isError) {
    const isAuthError = error instanceof Error && 
      (error.message.includes('Authentication required') || error.message.includes('401'));
    
    return (
      
        
          
            
              
              {isAuthError ? "Authentication Required" : "Failed to Load Unified Agents"}
            
          
          
            
              {isAuthError 
                ? "You need to log in to access the Unified Agent Intelligence dashboard." 
                : error instanceof Error ? error.message : "An error occurred while fetching agent data"}
            
            {isAuthError && (
               window.location.href = '/login'}
                className="w-full"
              >
                Go to Login
              
            )}
            {!isAuthError && (
               window.location.reload()}
                variant="outline"
                className="w-full"
              >
                
                Retry
              
            )}
          
        
      
    );
  }

  if (!summary || !summary.agents) {
    return (
      
        
          
            
              
              No Agents Found
            
          
          
            
              The unified agent architecture system is initializing. Please ensure the server is running and try again.
            
            
              Debug Info:
              • API Endpoint: {API_BASE}
              • Initialized: {summary?.initialized ? "Yes" : "No"}
              • Total Agents: {summary?.totalAgents ?? 0}
            
             window.location.reload()}
              variant="outline"
              className="w-full"
            >
              
              Refresh
            
          
        
      
    );
  }

  return (
    
      
        {/* Stats row */}
        
          
            
              {summary.totalAgents}
              Canonical Agents
            
          
          
            
              
                {summary.agents?.filter((a: any) => a.status === "active").length || 0}
              
              Active
            
          
          
            
              
                {summary.agents?.reduce((sum: number, a: any) => sum + (a.pendingRecommendations || 0), 0) || 0}
              
              Pending Recommendations
            
          
          
            
              
                {summary.agents?.reduce((sum: number, a: any) => sum + (a.totalCapabilities || 0), 0) || 0}
              
              Total Capabilities
            
          
        

        {/* Runtime architecture control */}
        
          
            
              
              Voice Runtime Architecture
            
            
              Toggle production voice runtime between legacy fallback and unified architecture.
            
          
          
            
              
                
                  Current mode:
                  
                    {architectureMode?.architectureMode || "unknown"}
                  
                  ({architectureMode?.source || "n/a"})
                
                
                  Unified = modern runtime path. Legacy = fallback path.
                
              

              
                Legacy
                 {
                    const mode = checked ? "unified" : "legacy";
                    setArchitectureMode.mutate({ architectureMode: mode });
                  }}
                />
                Unified
              
            
          
        

        {/* Agent cards grid */}
        
          {summary.agents?.map((agent: any) => (
            (() => {
              const progress = getAgentCardProgress(agent);
              return (
             onSelectAgent(agent.agentType)}
            >
              
                
                  
                    {agentIcons[agent.agentType] || }
                    {agent.name}
                  
                  
                    {agent.status}
                  
                
                v{agent.version} &bull; {agent.agentType}
              
              
                
                  {/* Progress score */}
                  
                    Progress
                    {progress}%
                  
                  
                    = 70 ? "bg-green-500" :
                        progress >= 40 ? "bg-yellow-500" : "bg-red-500"
                      )}
                      style={{ width: `${progress}%` }}
                    />
                  

                  {/* Stats */}
                  
                    {agent.activePromptSections}/{agent.totalPromptSections} sections
                    {agent.totalCapabilities} capabilities
                    {agent.overallPerformanceScore ?? 0}% perf
                    {agent.pendingRecommendations > 0 && (
                      
                        {agent.pendingRecommendations} recs
                      
                    )}
                  
                
              
            
              );
            })()
          ))}
        

        {/* Pipeline summary */}
        
      
    
  );
}

// ==================== PIPELINE SUMMARY ====================

function PipelineSummarySection() {
  const { data: pipelines } = useQuery({
    queryKey: ["unified-agents-pipeline-summary"],
    queryFn: () => fetchJson(`${API_BASE}/pipeline-summary`),
    refetchInterval: 60000,
    refetchIntervalInBackground: false,
  });

  if (!pipelines || Object.keys(pipelines).length === 0) return null;

  return (
    
      
        
          
          Learning Pipeline Status
        
      
      
        
          {Object.entries(pipelines).map(([agentType, pipeline]: [string, any]) => (
            
              
                {agentIcons[agentType] || }
                {agentType}
              
              
                {pipeline.status}
                
                  {pipeline.stats?.totalRecommendationsGenerated || 0} recs
                
              
            
          ))}
        
      
    
  );
}

// ==================== AGENT DETAIL VIEW ====================

function AgentDetailView({
  agentType,
  activeTab,
  setActiveTab,
}: {
  agentType: string;
  activeTab: string;
  setActiveTab: (tab: string) => void;
}) {
  const { data: detail, isLoading } = useQuery({
    queryKey: ["unified-agent-detail", agentType],
    queryFn: () => fetchJson(`${API_BASE}/${agentType}`),
    refetchInterval: 30000, // Increased from 15s to 30s
    refetchIntervalInBackground: false,
  });

  if (isLoading) {
    return (
      
        
      
    );
  }

  if (!detail) return Agent not found;

  return (
    
      {/* Agent header with quick stats */}
      
        
          
            {agentIcons[agentType] || }
            
              
                {detail.name}
                
                  {detail.status}
                
                
                  v{detail.versionControl?.currentVersion}
                
              
              {detail.description}
            
          
          
            
              
              {detail.promptSections?.length || 0} sections
            
            
              
              {detail.capabilities?.length || 0} capabilities
            
            
              
              {detail.performanceSnapshot?.overallScore || 0}%
            
          
        
      

      {/* Tabs */}
      
        
          
            Overview
            Prompt Sections
            Capability Map
            
              Recommendations
              {detail.learningPipeline?.recommendations?.filter((r: any) => r.status === "pending").length > 0 && (
                
                  {detail.learningPipeline.recommendations.filter((r: any) => r.status === "pending").length}
                
              )}
            
            Learning Pipeline
            Version History
            Configuration
          
        

        
          
            
          
          
            
          
          
            
          
          
            
          
          
            
          
          
            
          
          
            
          
        
      
    
  );
}

// ==================== OVERVIEW TAB ====================

function AgentOverviewTab({ detail }: { detail: any }) {
  const tracking = detail.trackingMetrics;

  return (
    
      
        {/* Tracking overview */}
        {tracking && (
          
            
              Tracking Readiness
              
                Progress computed from sections, capabilities, mappings, learning inputs, and configuration completeness
              
            
            
              
                
                  Overall Progress
                  {tracking.progress}%
                
                
                  = 70 ? "bg-green-500" : tracking.progress >= 40 ? "bg-yellow-500" : "bg-red-500"
                    )}
                    style={{ width: `${tracking.progress}%` }}
                  />
                

                
                  
                    Sections
                    {tracking.activePromptSections}/{tracking.totalPromptSections}
                  
                  
                    Capabilities
                    {tracking.activeCapabilities}/{tracking.totalCapabilities}
                  
                  
                    Mapping Coverage
                    {tracking.mappingCoverage}%
                  
                  
                    Learning Coverage
                    {tracking.learningCoverage}%
                  
                
              
            
          
        )}

        {/* Performance overview */}
        
          
            Capability Performance
          
          
            
              {detail.capabilities?.map((cap: any) => (
                
                  
                    
                      {cap.name}
                      {trendIcons[cap.trend] || trendIcons.stable}
                    
                    {cap.performanceScore}%
                  
                  
                    = 70 ? "bg-green-500" :
                        cap.performanceScore >= 40 ? "bg-yellow-500" : "bg-red-500"
                      )}
                      style={{ width: `${cap.performanceScore}%` }}
                    />
                  
                
              ))}
            
          
        

        {/* Prompt sections summary */}
        
          
            Prompt Architecture
            
              {detail.promptSections?.length || 0} sections defining this agent's intelligence
            
          
          
            
              {detail.promptSections?.map((section: any) => (
                
                  {section.name}
                  
                    #{section.sectionNumber}
                    &bull;
                    {section.changeCount} edits
                  
                
              ))}
            
          
        

        {/* Capability-to-prompt map summary */}
        
          
            Capability-to-Prompt Map
            
              How capabilities map to prompt sections for targeted optimization
            
          
          
            
              {detail.capabilityPromptMap?.slice(0, 8).map((mapping: any, idx: number) => (
                
                  
                    {mapping.capability?.name || "?"}
                  
                  &rarr;
                  
                    {mapping.promptSection?.name || "?"}
                  
                  
                    {Math.round((mapping.confidence || 0) * 100)}% conf
                  
                
              ))}
            
          
        

        {/* Pipeline status */}
        {detail.learningPipeline?.state && (
          
            
              
                
                Learning Pipeline
              
            
            
              
                {detail.learningPipeline.state.status}
                
                  {detail.learningPipeline.state.stats?.totalRecommendationsGenerated || 0} recommendations generated
                
                
                  {detail.learningPipeline.state.stats?.totalApplied || 0} applied
                
              
            
          
        )}
      
    
  );
}

// ==================== PROMPT SECTIONS TAB ====================

function PromptSectionsTab({ agentType }: { agentType: string }) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [editingSection, setEditingSection] = useState(null);
  const [editContent, setEditContent] = useState("");
  const [editReason, setEditReason] = useState("");

  const { data: sections } = useQuery({
    queryKey: ["unified-agent-sections", agentType],
    queryFn: () => fetchJson(`${API_BASE}/${agentType}/prompt-sections`),
  });

  const updateSection = useMutation({
    mutationFn: ({ sectionId, newContent, reason }: { sectionId: string; newContent: string; reason: string }) =>
      putJson(`${API_BASE}/${agentType}/prompt-sections/${sectionId}`, { newContent, reason }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["unified-agent-sections", agentType] });
      queryClient.invalidateQueries({ queryKey: ["unified-agent-detail", agentType] });
      setEditingSection(null);
      setEditContent("");
      setEditReason("");
      toast({ title: "Section updated", description: "Prompt section saved with version tracking." });
    },
    onError: (err: Error) => {
      toast({ title: "Update failed", description: err.message, variant: "destructive" });
    },
  });

  return (
    
      
        
          
            {sections?.totalSections || 0} foundational prompt sections — each versioned and editable
          
        

        
          {sections?.sections?.map((section: any) => (
            
              
                
                  
                    {section.sectionNumber}
                  
                  {section.name}
                  
                    {section.isActive ? "active" : "inactive"}
                  
                  {section.changeCount} edits
                
              
              
                
                  
                    Category: {section.category}
                    Hash: {section.versionHash}
                  

                  {editingSection === section.id ? (
                    
                       setEditContent(e.target.value)}
                        className="font-mono text-xs min-h-[200px]"
                        placeholder="Section content..."
                      />
                       setEditReason(e.target.value)}
                        placeholder="Reason for edit..."
                        className="text-xs"
                      />
                      
                        
                            updateSection.mutate({
                              sectionId: section.id,
                              newContent: editContent,
                              reason: editReason,
                            })
                          }
                          disabled={!editContent.trim() || !editReason.trim() || updateSection.isPending}
                        >
                          {updateSection.isPending ? (
                            
                          ) : (
                            
                          )}
                          Save
                        
                         { setEditingSection(null); setEditContent(""); setEditReason(""); }}
                        >
                          Cancel
                        
                      
                    
                  ) : (
                    <>
                      
                        {section.content}
                      
                       {
                          setEditingSection(section.id);
                          setEditContent(section.content);
                          setEditReason("");
                        }}
                      >
                        
                        Edit Section
                      
                    
                  )}
                
              
            
          ))}
        
      
    
  );
}

// ==================== CAPABILITY MAP TAB ====================

function CapabilityMapTab({ agentType, detail }: { agentType: string; detail: any }) {
  const { data: capMap } = useQuery({
    queryKey: ["unified-agent-cap-map", agentType],
    queryFn: () => fetchJson(`${API_BASE}/${agentType}/capability-map`),
  });

  const map = capMap?.map || detail?.capabilityPromptMap || [];

  return (
    
      
        
          Capability &rarr; Prompt Section &rarr; Learning Sources
          
            Each capability maps to a specific prompt section. Learning inputs feed into the pipeline to generate
            targeted recommendations for that section.
          
        

        
          {map.map((m: any, idx: number) => (
            
              
                {/* Capability column */}
                
                  
                    
                    {m.capability?.name || "Unknown"}
                  
                  
                    Score: {m.capability?.score || 0}%
                    {trendIcons[m.capability?.trend] || trendIcons.stable}
                  
                

                {/* Arrow */}
                
                  &rarr;
                

                {/* Prompt section column */}
                
                  
                    
                    {m.promptSection?.name || "Unknown"}
                  
                  
                    #{m.promptSection?.sectionNumber} &bull; {Math.round((m.confidence || 0) * 100)}% confidence
                  
                

                {/* Arrow */}
                
                  &larr;
                

                {/* Learning sources column */}
                
                  
                    
                    Learning Sources
                  
                  
                    {m.learningInputSources?.map((src: any, si: number) => (
                      
                        {src.name}
                      
                    )) || (
                      No sources
                    )}
                  
                
              
              {m.requiresApproval && (
                
                  Requires approval before applying recommendations
                
              )}
            
          ))}
        
      
    
  );
}

// ==================== RECOMMENDATIONS TAB ====================

function RecommendationsTab({ agentType }: { agentType: string }) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [rejectReason, setRejectReason] = useState("");
  const [rejectingId, setRejectingId] = useState(null);

  const { data: recs } = useQuery({
    queryKey: ["unified-agent-recommendations", agentType],
    queryFn: () => fetchJson(`${API_BASE}/${agentType}/recommendations`),
    refetchInterval: 30000, // Increased from 10s to 30s
    refetchIntervalInBackground: false,
  });

  const applyRec = useMutation({
    mutationFn: (id: string) => postJson(`${API_BASE}/${agentType}/recommendations/${id}/apply`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["unified-agent-recommendations", agentType] });
      queryClient.invalidateQueries({ queryKey: ["unified-agent-detail", agentType] });
      toast({ title: "Recommendation applied", description: "Prompt section updated." });
    },
    onError: (err: Error) => toast({ title: "Failed", description: err.message, variant: "destructive" }),
  });

  const rejectRec = useMutation({
    mutationFn: ({ id, reason }: { id: string; reason: string }) =>
      postJson(`${API_BASE}/${agentType}/recommendations/${id}/reject`, { reason }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["unified-agent-recommendations", agentType] });
      setRejectingId(null);
      setRejectReason("");
      toast({ title: "Recommendation rejected" });
    },
    onError: (err: Error) => toast({ title: "Failed", description: err.message, variant: "destructive" }),
  });

  const pending = recs?.recommendations?.filter((r: any) => r.status === "pending") || [];
  const others = recs?.recommendations?.filter((r: any) => r.status !== "pending") || [];

  return (
    
      
        {/* Pending */}
        {pending.length > 0 && (
          
            
              
              Pending Recommendations ({pending.length})
            
            {pending.map((rec: any) => (
              
                
                  
                    
                      {rec.title}
                      
                        {rec.category} &bull; Priority: {rec.priorityScore}
                        {rec.targetSectionId && (
                           &bull; Target: {rec.targetSectionId}
                        )}
                      
                    
                    pending
                  

                  {rec.impact && (
                    
                      Expected improvement: {rec.impact.expectedImprovement}%
                      {rec.impact.riskLevel && ` &bull; Risk: ${rec.impact.riskLevel}`}
                    
                  )}

                  {rec.governance?.requiresExplicitApproval && (
                    
                      Requires approval: {rec.governance.approvalReasons?.join(', ')}
                    
                  )}

                  
                     applyRec.mutate(rec.id)}
                      disabled={applyRec.isPending}
                    >
                      {applyRec.isPending ? (
                        
                      ) : (
                        
                      )}
                      {rec.governance?.requiresExplicitApproval ? 'Approve & Apply' : 'Apply'}
                    

                    {rejectingId === rec.id ? (
                      
                         setRejectReason(e.target.value)}
                          placeholder="Reason for rejection..."
                          className="text-xs h-8"
                        />
                         rejectRec.mutate({ id: rec.id, reason: rejectReason })}
                          disabled={!rejectReason.trim() || rejectRec.isPending}
                        >
                          Confirm
                        
                         { setRejectingId(null); setRejectReason(""); }}
                        >
                          Cancel
                        
                      
                    ) : (
                       setRejectingId(rec.id)}
                      >
                        
                        Reject
                      
                    )}
                  
                
              
            ))}
          
        )}

        {/* Past recommendations */}
        {others.length > 0 && (
          
            
              Past Recommendations ({others.length})
            
            {others.map((rec: any) => (
              
                
                  {rec.title}
                  {rec.category}
                
                
                  {rec.status}
                
              
            ))}
          
        )}

        {pending.length === 0 && others.length === 0 && (
          
            
            No recommendations yet
            Run the learning pipeline to generate optimization recommendations.
          
        )}
      
    
  );
}

// ==================== LEARNING PIPELINE TAB ====================

function LearningPipelineTab({ agentType }: { agentType: string }) {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const { data: pipeline } = useQuery({
    queryKey: ["unified-agent-pipeline", agentType],
    queryFn: () => fetchJson(`${API_BASE}/${agentType}/learning-pipeline`),
    refetchInterval: 30000, // Increased from 10s to 30s
    refetchIntervalInBackground: false,
  });

  const triggerAnalysis = useMutation({
    mutationFn: () =>
      postJson(`${API_BASE}/${agentType}/learning-pipeline/analyze`, {
        performanceData: [
          { sourceType: "call_metrics", metrics: { totalCalls: 0, conversionRate: 0 }, insights: [] },
        ],
      }),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["unified-agent-pipeline", agentType] });
      queryClient.invalidateQueries({ queryKey: ["unified-agent-recommendations", agentType] });
      toast({
        title: "Analysis complete",
        description: `${data.recommendations?.length || 0} recommendations generated`,
      });
    },
    onError: (err: Error) => toast({ title: "Analysis failed", description: err.message, variant: "destructive" }),
  });

  const state = pipeline?.state;

  return (
    
      
        {/* Pipeline status */}
        
          
            
              
                
                Pipeline Status
              
               triggerAnalysis.mutate()}
                disabled={triggerAnalysis.isPending}
              >
                {triggerAnalysis.isPending ? (
                  
                ) : (
                  
                )}
                Run Analysis
              
            
          
          
            {state ? (
              
                
                  {state.status}
                  {state.lastRun && (
                    
                      Last run: {new Date(state.lastRun).toLocaleString()}
                    
                  )}
                

                
                  
                    {state.stats?.totalRecommendationsGenerated || 0}
                    Generated
                  
                  
                    {state.stats?.totalApplied || 0}
                    Applied
                  
                  
                    {state.stats?.totalRejected || 0}
                    Rejected
                  
                  
                    
                      {state.stats?.averageImprovementFromApplied?.toFixed(1) || 0}%
                    
                    Avg Improvement
                  
                

                {/* Active collectors */}
                {state.activeCollectors?.length > 0 && (
                  
                    Data Collectors
                    
                      {state.activeCollectors.map((c: any) => (
                        
                          {c.sourceType} ({c.dataPointsCollected})
                        
                      ))}
                    
                  
                )}
              
            ) : (
              Pipeline not initialized for this agent
            )}
          
        

        {/* Recent analyses */}
        {pipeline?.recentAnalyses?.length > 0 && (
          
            
              Recent Analyses
            
            
              
                {pipeline.recentAnalyses.map((analysis: any) => (
                  
                    
                      {analysis.sourceType}
                      
                        {new Date(analysis.analyzedAt).toLocaleString()}
                      
                    
                    
                      {analysis.findings?.length || 0} findings &bull; {analysis.recommendationIds?.length || 0} recommendations
                    
                  
                ))}
              
            
          
        )}
      
    
  );
}

// ==================== VERSION HISTORY TAB ====================

function VersionHistoryTab({ agentType }: { agentType: string }) {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const { data: versions } = useQuery({
    queryKey: ["unified-agent-versions", agentType],
    queryFn: () => fetchJson(`${API_BASE}/${agentType}/version-history`),
  });

  const rollback = useMutation({
    mutationFn: (version: string) =>
      postJson(`${API_BASE}/${agentType}/rollback/${version}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["unified-agent-versions", agentType] });
      queryClient.invalidateQueries({ queryKey: ["unified-agent-detail", agentType] });
      queryClient.invalidateQueries({ queryKey: ["unified-agent-sections", agentType] });
      toast({ title: "Rollback complete" });
    },
    onError: (err: Error) => toast({ title: "Rollback failed", description: err.message, variant: "destructive" }),
  });

  return (
    
      
        
          
            
              
              Version History
            
            
              Current: v{versions?.currentVersion} &bull; {versions?.totalVersions || 0} versions
            
          
        

        
          {versions?.history?.map((snapshot: any, idx: number) => (
            
              
                
                  
                    
                      v{snapshot.version}
                    
                    {idx === 0 && (
                      current
                    )}
                  
                  
                    {snapshot.changelog} &bull; by {snapshot.deployedBy}
                  
                  
                    {new Date(snapshot.timestamp).toLocaleString()}
                  
                
                {idx > 0 && snapshot.rollbackAvailable && (
                  
                    
                      
                        
                        Rollback
                      
                    
                    
                      
                        Rollback to v{snapshot.version}?
                        
                          This will restore all prompt sections to the state at version {snapshot.version}.
                          A new version entry will be created for the rollback.
                        
                      
                      
                         rollback.mutate(snapshot.version)}
                          disabled={rollback.isPending}
                        >
                          {rollback.isPending ? (
                            
                          ) : (
                            
                          )}
                          Confirm Rollback
                        
                      
                    
                  
                )}
              
            
          ))}

          {(!versions?.history || versions.history.length === 0) && (
            
              
              No version history yet
              Edit a prompt section to create the first version snapshot.
            
          )}
        
      
    
  );
}

// ==================== CONFIGURATION TAB ====================

function ConfigurationTab({ agentType }: { agentType: string }) {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const { data: config } = useQuery({
    queryKey: ["unified-agent-config", agentType],
    queryFn: () => fetchJson(`${API_BASE}/${agentType}/configuration`),
  });

  const updateConfig = useMutation({
    mutationFn: (updates: any) => patchJson(`${API_BASE}/${agentType}/configuration`, updates),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["unified-agent-config", agentType] });
      queryClient.invalidateQueries({ queryKey: ["unified-agent-detail", agentType] });
      toast({ title: "Configuration updated" });
    },
    onError: (err: Error) => toast({ title: "Update failed", description: err.message, variant: "destructive" }),
  });

  const cfg = config?.configuration;
  if (!cfg) return Loading...;

  const toDisplayText = (value: any): string => {
    if (value == null) return "N/A";
    if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
      return String(value);
    }
    if (Array.isArray(value)) {
      return value.map((item) => toDisplayText(item)).join(", ");
    }
    if (typeof value === "object") {
      return (
        value.name ||
        value.id ||
        value.state ||
        value.trigger ||
        value.label ||
        value.description ||
        JSON.stringify(value)
      );
    }
    return String(value);
  };

  return (
    
      
        {/* Tone & Persona */}
        
          
            
              
              Tone & Persona
            
          
          
            
              
                Personality
                {cfg.toneAndPersona?.personality || "Not set"}
              
              
                Formality
                {cfg.toneAndPersona?.formality || "Not set"}
              
              {cfg.toneAndPersona?.empathy !== undefined && (
                
                  Empathy
                  {cfg.toneAndPersona.empathy}/10
                
              )}
              {cfg.toneAndPersona?.assertiveness !== undefined && (
                
                  Assertiveness
                  {cfg.toneAndPersona.assertiveness}/10
                
              )}
              {cfg.toneAndPersona?.warmth !== undefined && (
                
                  Warmth
                  {cfg.toneAndPersona.warmth}/10
                
              )}
              {cfg.toneAndPersona?.technicality !== undefined && (
                
                  Technicality
                  {cfg.toneAndPersona.technicality}/10
                
              )}
            
            {cfg.toneAndPersona?.customTraits?.length > 0 && (
              
                Custom Traits
                
                  {cfg.toneAndPersona.customTraits.map((trait: any, i: number) => (
                    {toDisplayText(trait)}
                  ))}
                
              
            )}
          
        

        {/* Performance Tuning */}
        
          
            Performance Tuning
          
          
            
              
                Temperature
                {cfg.performanceTuning?.temperature ?? "N/A"}
              
              
                Max Tokens
                {cfg.performanceTuning?.maxTokens ?? "N/A"}
              
              
                Top P
                {cfg.performanceTuning?.topP ?? "N/A"}
              
              
                Model
                {cfg.performanceTuning?.modelPreference ?? "N/A"}
              
            
          
        

        {/* Compliance */}
        {cfg.complianceSettings && (
          
            
              
                
                Compliance Settings
              
            
            
              
                {cfg.complianceSettings.frameworks?.length > 0 && (
                  
                    Frameworks
                    
                      {cfg.complianceSettings.frameworks.map((fw: any, i: number) => (
                        {toDisplayText(fw)}
                      ))}
                    
                  
                )}
                {cfg.complianceSettings.prohibitedPhrases?.length > 0 && (
                  
                    Prohibited Phrases
                    
                      {cfg.complianceSettings.prohibitedPhrases.map((p: any, i: number) => (
                        {toDisplayText(p)}
                      ))}
                    
                  
                )}
              
            
          
        )}

        {/* Retry & Escalation */}
        {cfg.retryAndEscalation && (
          
            
              Retry & Escalation
            
            
              
                
                  Max Retries
                  {cfg.retryAndEscalation.maxRetries ?? "N/A"}
                
                
                  Cooldown (min)
                  {cfg.retryAndEscalation.cooldownMinutes ?? "N/A"}
                
                
                  Escalation Threshold
                  {cfg.retryAndEscalation.escalationThreshold ?? "N/A"}
                
              
            
          
        )}

        {/* State Machine */}
        {cfg.stateMachine && (
          
            
              State Machine
            
            
              
                
                  Initial State
                  {toDisplayText(cfg.stateMachine.initialState)}
                
                
                  States
                  
                    {cfg.stateMachine.states?.map((s: any, i: number) => (
                      {toDisplayText(s)}
                    ))}
                  
                
                {cfg.stateMachine.transitions?.length > 0 && (
                  
                    Transitions ({cfg.stateMachine.transitions.length})
                    
                      {cfg.stateMachine.transitions.slice(0, 8).map((t: any, i: number) => (
                        
                          {toDisplayText(t.from)}
                          &rarr;
                          {toDisplayText(t.to)}
                          ({toDisplayText(t.trigger)})
                        
                      ))}
                    
                  
                )}
              
            
          
        )}

        {/* System prompt metadata */}
        {cfg.systemPromptMetadata && (
          
            
              System Metadata
            
            
              
                
                  Created
                  {new Date(cfg.systemPromptMetadata.createdAt).toLocaleDateString()}
                
                
                  Last Edited
                  {new Date(cfg.systemPromptMetadata.lastEdited).toLocaleDateString()}
                
                
                  Total Edits
                  {cfg.systemPromptMetadata.editCount}
                
              
            
          
        )}
      
    
  );
}

// ==================== AGENT PROMPTS TAB ====================

interface AgentPromptItem {
  id: string;
  name: string;
  description: string | null;
  userRole: string | null;
  iamRoleId: string | null;
  isClientPortal: boolean;
  promptType: "system" | "capability" | "restriction" | "persona" | "context";
  promptContent: string;
  capabilities: string[] | null;
  restrictions: string[] | null;
  contextRules: Record | null;
  isActive: boolean;
  priority: number;
  version: number;
  createdAt: string;
  updatedAt: string;
}
// ==================== AGENT SETUP TAB ====================

function AgentSetupTab({ agentType }: { agentType: string }) {
  return (
    
      
        {/* Header actions */}
        
          
            
              
              Role-Based Agent Prompts
            
            
              Configure and manage AI agent prompts by role
            
          
          
             {/* Seed defaults will be added */}}
            >
              
              Seed Defaults
            
             {/* Create prompt will be added */}}>
              
              Create Prompt
            
          
        

        {/* Content */}
        
      
    
  );
}

// ==================== AGENT PROMPTS TAB CONTENT ====================

function AgentPromptsTabContent() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [searchQuery, setSearchQuery] = useState("");
  const [roleFilter, setRoleFilter] = useState("all");
  const [typeFilter, setTypeFilter] = useState("all");
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [editingPrompt, setEditingPrompt] = useState(null);

  const { data: prompts = [], isLoading } = useQuery({
    queryKey: ["unified-agent-prompts", roleFilter, typeFilter],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (roleFilter !== "all") params.append("role", roleFilter);
      if (typeFilter !== "all") params.append("type", typeFilter);
      const response = await apiRequest("GET", `${PROMPTS_API}?${params.toString()}`);
      return response.json();
    },
  });

  const { data: tools = [] } = useQuery({
    queryKey: ["unified-agent-prompt-tools"],
    queryFn: async () => {
      const response = await apiRequest("GET", `${PROMPTS_API}/tools/available`);
      return response.json();
    },
  });

  const createMutation = useMutation({
    mutationFn: async (data: Partial) => {
      const response = await apiRequest("POST", PROMPTS_API, data);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["unified-agent-prompts"] });
      setIsCreateDialogOpen(false);
      toast({ title: "Prompt created" });
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: Partial }) => {
      const response = await apiRequest("PUT", `${PROMPTS_API}/${id}`, data);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["unified-agent-prompts"] });
      setEditingPrompt(null);
      toast({ title: "Prompt updated" });
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const response = await apiRequest("DELETE", `${PROMPTS_API}/${id}`);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["unified-agent-prompts"] });
      toast({ title: "Prompt deactivated" });
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const seedDefaultsMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest("POST", `${PROMPTS_API}/seed-defaults`);
      return response.json();
    },
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ["unified-agent-prompts"] });
      toast({ title: "Success", description: data.message });
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const filteredPrompts = prompts.filter((prompt) => {
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      return (
        prompt.name.toLowerCase().includes(query) ||
        prompt.description?.toLowerCase().includes(query) ||
        prompt.promptContent.toLowerCase().includes(query)
      );
    }
    return true;
  });

  const promptsByRole = filteredPrompts.reduce((acc, prompt) => {
    const role = prompt.isClientPortal ? "client" : prompt.userRole || "universal";
    if (!acc[role]) acc[role] = [];
    acc[role].push(prompt);
    return acc;
  }, {} as Record);

  return (
    
      {/* Filters */}
      
        
          
            
              
                
                 setSearchQuery(e.target.value)}
                  className="pl-9 h-8 text-sm"
                />
              
            
            
              
                
              
              
                All Roles
                Administrator
                Campaign Manager
                Quality Analyst
                Data Operations
                Agent
              
            
            
              
                
              
              
                All Types
                System
                Capability
                Restriction
                Persona
                Context
              
            
          
        
      

      {/* Stats */}
      
        
          
            {prompts.length}
            Total Prompts
          
        
        
          
            
              {prompts.filter((p) => p.isActive).length}
            
            Active
          
        
        
          
            
              {Object.keys(promptsByRole).length}
            
            Roles Configured
          
        
        
          
            
              {prompts.filter((p) => p.isClientPortal).length}
            
            Client Portal
          
        
      

      {/* Prompts by role */}
      {isLoading ? (
        
          
        
      ) : filteredPrompts.length === 0 ? (
        
          
            
            
              {searchQuery ? "No prompts match your search" : "No prompts configured yet"}
            
             seedDefaultsMutation.mutate()}>
              
              Seed Default Prompts
            
          
        
      ) : (
        
          {Object.entries(promptsByRole).map(([role, rolePrompts]) => (
             deleteMutation.mutate(id)}
              onToggleActive={(prompt) =>
                updateMutation.mutate({ id: prompt.id, data: { isActive: !prompt.isActive } })
              }
            />
          ))}
        
      )}

      {/* Create/Edit Dialog */}
       {
          if (!open) {
            setIsCreateDialogOpen(false);
            setEditingPrompt(null);
          }
        }}
        prompt={editingPrompt}
        tools={tools}
        onSave={(data) => {
          if (editingPrompt) {
            updateMutation.mutate({ id: editingPrompt.id, data });
          } else {
            createMutation.mutate(data);
          }
        }}
        isSaving={createMutation.isPending || updateMutation.isPending}
      />
    
  );
}

// ==================== AGENT PROMPTS TAB ====================

interface AgentPromptItem {
  id: string;
  name: string;
  description: string | null;
  userRole: string | null;
  iamRoleId: string | null;
  isClientPortal: boolean;
  promptType: "system" | "capability" | "restriction" | "persona" | "context";
  promptContent: string;
  capabilities: string[] | null;
  restrictions: string[] | null;
  contextRules: Record | null;
  isActive: boolean;
  priority: number;
  version: number;
  createdAt: string;
  updatedAt: string;
}

interface PromptTool {
  id: string;
  name: string;
  category: string;
  description: string;
}

const promptTypeColors: Record = {
  system: "bg-blue-500/10 text-blue-500 border-blue-500/20",
  capability: "bg-green-500/10 text-green-500 border-green-500/20",
  restriction: "bg-red-500/10 text-red-500 border-red-500/20",
  persona: "bg-purple-500/10 text-purple-500 border-purple-500/20",
  context: "bg-amber-500/10 text-amber-500 border-amber-500/20",
};

const roleLabels: Record = {
  admin: "Administrator",
  agent: "Agent",
  campaign_manager: "Campaign Manager",
  quality_analyst: "Quality Analyst",
  data_ops: "Data Operations",
  content_creator: "Content Creator",
  client: "Client Portal",
};

const PROMPTS_API = "/api/unified-agents/agent-prompts";


// ==================== PROMPT ROLE SECTION ====================

function PromptRoleSection({
  role,
  prompts,
  onEdit,
  onDelete,
  onToggleActive,
}: {
  role: string;
  prompts: AgentPromptItem[];
  onEdit: (prompt: AgentPromptItem) => void;
  onDelete: (id: string) => void;
  onToggleActive: (prompt: AgentPromptItem) => void;
}) {
  const [isExpanded, setIsExpanded] = useState(true);
  const RoleIcon = role === "client" ? Users : Shield;

  return (
    
      
        
          
            
              
                
                  
                
                
                  {roleLabels[role] || role}
                  
                    {prompts.length} prompt{prompts.length !== 1 ? "s" : ""} configured
                  
                
              
              
                
                  {prompts.filter((p) => p.isActive).length} active
                
                {isExpanded ? (
                  
                ) : (
                  
                )}
              
            
          
        
        
          
            {prompts.map((prompt) => (
               onEdit(prompt)}
                onDelete={() => onDelete(prompt.id)}
                onToggleActive={() => onToggleActive(prompt)}
              />
            ))}
          
        
      
    
  );
}

// ==================== PROMPT ITEM CARD ====================

function PromptItemCard({
  prompt,
  onEdit,
  onDelete,
  onToggleActive,
}: {
  prompt: AgentPromptItem;
  onEdit: () => void;
  onDelete: () => void;
  onToggleActive: () => void;
}) {
  const [showContent, setShowContent] = useState(false);

  return (
    
      
        
          
            {prompt.name}
            
              {prompt.promptType}
            
            {!prompt.isActive && (
              Inactive
            )}
          
          {prompt.description && (
            {prompt.description}
          )}
          
            {prompt.capabilities?.slice(0, 4).map((cap) => (
              {cap}
            ))}
            {prompt.capabilities && prompt.capabilities.length > 4 && (
              
                +{prompt.capabilities.length - 4} more
              
            )}
          
          
            
              
                {showContent ? "Hide content" : "Show content"}
                {showContent ? (
                  
                ) : (
                  
                )}
              
            
            
              
                {prompt.promptContent}
              
            
          
        
        
          
          
            
          
          
            
          
        
      
      
        v{prompt.version}
        Priority: {prompt.priority}
        Updated: {new Date(prompt.updatedAt).toLocaleDateString()}
      
    
  );
}

// ==================== PROMPT EDIT DIALOG ====================

function PromptEditDialog({
  open,
  onOpenChange,
  prompt,
  tools,
  onSave,
  isSaving,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  prompt: AgentPromptItem | null;
  tools: PromptTool[];
  onSave: (data: Partial) => void;
  isSaving: boolean;
}) {
  const [formData, setFormData] = useState>({
    name: "",
    description: "",
    userRole: null,
    isClientPortal: false,
    promptType: "system",
    promptContent: "",
    capabilities: [],
    restrictions: [],
    isActive: true,
    priority: 0,
  });

  useState(() => {
    if (prompt) {
      setFormData(prompt);
    } else {
      setFormData({
        name: "",
        description: "",
        userRole: null,
        isClientPortal: false,
        promptType: "system",
        promptContent: "",
        capabilities: [],
        restrictions: [],
        isActive: true,
        priority: 0,
      });
    }
  });

  const toolsByCategory = tools.reduce((acc, tool) => {
    if (!acc[tool.category]) acc[tool.category] = [];
    acc[tool.category].push(tool);
    return acc;
  }, {} as Record);

  const toggleCapability = (toolId: string) => {
    const current = formData.capabilities || [];
    const updated = current.includes(toolId)
      ? current.filter((c) => c !== toolId)
      : [...current, toolId];
    setFormData({ ...formData, capabilities: updated });
  };

  const toggleRestriction = (toolId: string) => {
    const current = formData.restrictions || [];
    const updated = current.includes(toolId)
      ? current.filter((r) => r !== toolId)
      : [...current, toolId];
    setFormData({ ...formData, restrictions: updated });
  };

  return (
    
      
        
          {prompt ? "Edit Prompt" : "Create New Prompt"}
          Configure the agent prompt settings and capabilities
        

        
          
            
              Name
               setFormData({ ...formData, name: e.target.value })}
                placeholder="Enter prompt name"
              />
            
            
              Type
               setFormData({ ...formData, promptType: value as any })}
              >
                
                  
                
                
                  System
                  Capability
                  Restriction
                  Persona
                  Context
                
              
            
          

          
            Description
             setFormData({ ...formData, description: e.target.value })}
              placeholder="Brief description of this prompt"
            />
          

          
            
              User Role
              
                  setFormData({ ...formData, userRole: value === "none" ? null : value })
                }
              >
                
                  
                
                
                  Universal (All Roles)
                  Administrator
                  Campaign Manager
                  Quality Analyst
                  Data Operations
                  Agent
                  Content Creator
                
              
            
            
              Priority
               setFormData({ ...formData, priority: parseInt(e.target.value) || 0 })}
              />
            
          

          
            
               setFormData({ ...formData, isClientPortal: checked })}
              />
              Client Portal Only
            
            
               setFormData({ ...formData, isActive: checked })}
              />
              Active
            
          

          
            Prompt Content
             setFormData({ ...formData, promptContent: e.target.value })}
              placeholder="Enter the prompt content..."
              className="min-h-[150px] font-mono text-sm"
            />
          

          
            
              Capabilities
              Restrictions
            
            
              
                {Object.entries(toolsByCategory).map(([category, categoryTools]) => (
                  
                    {category}
                    
                      {categoryTools.map((tool) => (
                         toggleCapability(tool.id)}
                        >
                          {formData.capabilities?.includes(tool.id) && (
                            
                          )}
                          {tool.name}
                        
                      ))}
                    
                  
                ))}
              
            
            
              
                {Object.entries(toolsByCategory).map(([category, categoryTools]) => (
                  
                    {category}
                    
                      {categoryTools.map((tool) => (
                         toggleRestriction(tool.id)}
                        >
                          {formData.restrictions?.includes(tool.id) && (
                            
                          )}
                          {tool.name}
                        
                      ))}
                    
                  
                ))}
              
            
          
        

        
           onOpenChange(false)}>
            Cancel
          
           onSave(formData)}
            disabled={isSaving || !formData.name || !formData.promptContent}
          >
            {isSaving && }
            {prompt ? "Save Changes" : "Create Prompt"}
          
        
      
    
  );
}