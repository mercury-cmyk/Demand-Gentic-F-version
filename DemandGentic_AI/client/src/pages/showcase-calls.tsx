import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Progress } from "@/components/ui/progress";
import {
  Trophy,
  Sparkles,
  Filter,
  ChevronLeft,
  ChevronRight,
  Loader2,
  BarChart3,
  Heart,
  MessageSquare,
  Shield,
  Zap,
  Target,
  Download,
  FileAudio,
  ExternalLink,
} from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { ShowcaseCallCard, type ShowcaseCall } from "@/components/showcase-calls/showcase-call-card";
import { PinShowcaseDialog } from "@/components/showcase-calls/pin-showcase-dialog";
import { TranscriptDisplay } from "@/components/call-intelligence";
import { useToast } from "@/hooks/use-toast";

// ============================================================================
// Types
// ============================================================================

interface ShowcaseStats {
  total: number;
  averages: {
    overall: number;
    engagement: number;
    clarity: number;
    empathy: number;
    objectionHandling: number;
    flowCompliance: number;
  };
  byCategory: Array;
  topCampaigns: Array;
  conversationPool?: {
    totalConversations: number;
    avgScore: number;
    highPerformers: number;
  };
}

interface ShowcaseListResponse {
  calls: ShowcaseCall[];
  pagination: { page: number; limit: number; total: number; totalPages: number };
}

interface AutoDetectResponse {
  candidates: (ShowcaseCall & { suggestedCategory: string })[];
  threshold: number;
}

interface CallDetails {
  callSessionId: string;
  overallScore: number | null;
  engagementScore: number | null;
  clarityScore: number | null;
  empathyScore: number | null;
  objectionHandlingScore: number | null;
  qualificationScore: number | null;
  closingScore: number | null;
  flowComplianceScore: number | null;
  campaignAlignmentScore: number | null;
  sentiment: string | null;
  engagementLevel: string | null;
  assignedDisposition: string | null;
  contactName: string | null;
  contactJobTitle: string | null;
  accountName: string | null;
  campaignName: string | null;
  fullTranscript: string | null;
  playbackUrl: string | null;
  downloadUrl: string | null;
  gcsUrlEndpoint?: string | null;
  hasRecording: boolean;
  durationSec: number | null;
  startedAt: string | null;
  showcaseCategory: string | null;
  showcaseNotes: string | null;
  agentPerformanceScore: number;
  issues: any[] | null;
  recommendations: any[] | null;
  [key: string]: any;
}

const CATEGORY_OPTIONS = [
  { value: "all", label: "All Categories" },
  { value: "objection_handling", label: "Objection Handling" },
  { value: "professional_close", label: "Professional Close" },
  { value: "engagement_mastery", label: "Engagement Mastery" },
  { value: "difficult_situation", label: "Difficult Situation" },
  { value: "perfect_flow", label: "Perfect Flow" },
  { value: "empathetic_response", label: "Empathetic Response" },
];

const CATEGORY_ICONS: Record = {
  objection_handling: Shield,
  professional_close: Target,
  engagement_mastery: Zap,
  difficult_situation: MessageSquare,
  perfect_flow: BarChart3,
  empathetic_response: Heart,
};

function dedupeById(items: T[]): T[] {
  const seen = new Set();
  const unique: T[] = [];
  for (const item of items) {
    const rawId = item?.id;
    if (rawId === null || rawId === undefined) {
      unique.push(item);
      continue;
    }
    const id = String(rawId);
    if (seen.has(id)) continue;
    seen.add(id);
    unique.push(item);
  }
  return unique;
}

function dedupeCalls(items: T[]): T[] {
  const seen = new Set();
  const unique: T[] = [];
  for (const item of items) {
    const stableId = item.callSessionId || item.id || "";
    if (!stableId) {
      unique.push(item);
      continue;
    }
    if (seen.has(stableId)) continue;
    seen.add(stableId);
    unique.push(item);
  }
  return unique;
}

// ============================================================================
// Main Page Component
// ============================================================================

interface ShowcaseCallsPageProps {
  campaigns?: Array;
}

export default function ShowcaseCallsPage({ campaigns: externalCampaigns }: ShowcaseCallsPageProps = {}) {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Filters
  const [tab, setTab] = useState("showcased");
  const [page, setPage] = useState(1);
  const [selectedCampaign, setSelectedCampaign] = useState("all");
  const [selectedCategory, setSelectedCategory] = useState("all");
  const [minScore, setMinScore] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [showFilters, setShowFilters] = useState(false);

  // Pin dialog state
  const [pinDialogOpen, setPinDialogOpen] = useState(false);
  const [pinTarget, setPinTarget] = useState(null);

  // Detail panel state
  const [detailCallId, setDetailCallId] = useState(null);
  const [isPlaying, setIsPlaying] = useState(false);

  // Build query params
  const buildParams = () => {
    const params = new URLSearchParams();
    params.append("page", page.toString());
    params.append("limit", "50");
    if (selectedCampaign !== "all") params.append("campaignId", selectedCampaign);
    if (selectedCategory !== "all") params.append("category", selectedCategory);
    if (minScore) params.append("minScore", minScore);
    if (startDate) params.append("startDate", new Date(startDate).toISOString());
    if (endDate) params.append("endDate", new Date(endDate).toISOString());
    return params.toString();
  };

  // ---- Queries ----

  const { data: stats, isLoading: statsLoading } = useQuery({
    queryKey: ["/api/showcase-calls/stats"],
    queryFn: async () => {
      const res = await apiRequest("GET", "/api/showcase-calls/stats");
      return res.json();
    },
    staleTime: 5 * 60 * 1000, // 5 min — stats change slowly
  });

  const { data: showcasedData, isLoading: showcasedLoading } = useQuery({
    queryKey: ["/api/showcase-calls", page, selectedCampaign, selectedCategory, minScore, startDate, endDate],
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/showcase-calls?${buildParams()}`);
      return res.json();
    },
    enabled: tab === "showcased",
    staleTime: 2 * 60 * 1000, // 2 min
  });

  const { data: discoverData, isLoading: discoverLoading } = useQuery({
    queryKey: ["/api/showcase-calls/auto-detect", selectedCampaign, minScore],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (selectedCampaign !== "all") params.append("campaignId", selectedCampaign);
      if (minScore) params.append("threshold", minScore);
      params.append("limit", "30");
      const res = await apiRequest("GET", `/api/showcase-calls/auto-detect?${params.toString()}`);
      return res.json();
    },
    enabled: tab === "discover",
    staleTime: 2 * 60 * 1000, // 2 min
  });

  const { data: detailData, isLoading: detailLoading } = useQuery({
    queryKey: ["/api/showcase-calls/details", detailCallId],
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/showcase-calls/${detailCallId}/details`);
      return res.json();
    },
    enabled: !!detailCallId,
  });

  // Campaigns list for filter — skip fetch when parent provides campaigns
  const { data: campaignsList } = useQuery>({
    queryKey: ["/api/campaigns"],
    queryFn: async () => {
      const res = await apiRequest("GET", "/api/campaigns");
      const data = await res.json();
      return Array.isArray(data) ? data : data.campaigns || [];
    },
    enabled: !externalCampaigns,
  });

  const uniqueCampaigns = useMemo(
    () => dedupeById(externalCampaigns || campaignsList || []),
    [externalCampaigns, campaignsList]
  );
  const showcasedCalls = useMemo(
    () => dedupeCalls(showcasedData?.calls || []),
    [showcasedData]
  );
  const discoverCalls = useMemo(
    () => dedupeCalls(discoverData?.candidates || []),
    [discoverData]
  );

  const getFreshRecordingUrl = async (callId: string, fallbackUrl?: string | null, endpoint?: string | null) => {
    if (fallbackUrl) return fallbackUrl;
    const endpointPath = endpoint || `/api/recordings/${callId}/gcs-url`;
    const res = await apiRequest('GET', endpointPath);
    const data = await res.json();
    return data?.url || null;
  };

  // ---- Mutations ----

  const pinMutation = useMutation({
    mutationFn: async ({ callSessionId, category, notes }: { callSessionId: string; category: string; notes: string }) => {
      const res = await apiRequest("POST", `/api/showcase-calls/${callSessionId}/pin`, { category, notes });
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Call pinned as showcase" });
      queryClient.invalidateQueries({ queryKey: ["/api/showcase-calls"] });
      queryClient.invalidateQueries({ queryKey: ["/api/showcase-calls/stats"] });
      queryClient.invalidateQueries({ queryKey: ["/api/showcase-calls/auto-detect"] });
      setPinDialogOpen(false);
      setPinTarget(null);
    },
    onError: () => {
      toast({ title: "Failed to pin call", variant: "destructive" });
    },
  });

  const unpinMutation = useMutation({
    mutationFn: async (callSessionId: string) => {
      const res = await apiRequest("DELETE", `/api/showcase-calls/${callSessionId}/pin`);
      return res.json();
    },
    onSuccess: (_data, callSessionId) => {
      queryClient.setQueriesData(
        { queryKey: ["/api/showcase-calls"] },
        (prev) => {
          if (!prev) return prev;
          const nextCalls = prev.calls.filter((c) => c.callSessionId !== callSessionId);
          if (nextCalls.length === prev.calls.length) return prev;

          return {
            ...prev,
            calls: nextCalls,
            pagination: {
              ...prev.pagination,
              total: Math.max(0, prev.pagination.total - 1),
              totalPages: Math.max(1, Math.ceil(Math.max(0, prev.pagination.total - 1) / prev.pagination.limit)),
            },
          };
        }
      );

      toast({ title: "Showcase call unpinned" });
      queryClient.invalidateQueries({ queryKey: ["/api/showcase-calls"] });
      queryClient.invalidateQueries({ queryKey: ["/api/showcase-calls/stats"] });
      queryClient.invalidateQueries({ queryKey: ["/api/showcase-calls/auto-detect"] });
    },
    onError: () => {
      toast({ title: "Failed to unpin call", variant: "destructive" });
    },
  });

  // ---- Handlers ----

  const handlePin = (call: ShowcaseCall) => {
    setPinTarget(call);
    setPinDialogOpen(true);
  };

  const handleConfirmPin = (category: string, notes: string) => {
    if (!pinTarget) return;
    pinMutation.mutate({ callSessionId: pinTarget.callSessionId, category, notes });
  };

  const handleUnpin = (callSessionId: string) => {
    unpinMutation.mutate(callSessionId);
  };

  const pagination = showcasedData?.pagination;

  // ============================================================================
  // Render
  // ============================================================================

  return (
    
      {/* Header */}
      
        
          
            
              
              Showcase Calls
            
            
              Meaningful, professional conversations with recording playback, clear transcript, detected issues, and recommendations. Refreshes every 6 hours.
            
          
           setShowFilters(!showFilters)}>
            
            Filters
          
        

        {/* Stats bar */}
        {stats && !statsLoading && (
          
            
              
              {stats.total}
              showcased
            
            {stats.total > 0 && (
              
                
                {stats.averages.overall}
                avg score
              
            )}
            {stats.conversationPool && (
              <>
                
                  
                  {stats.conversationPool.totalConversations}
                  real conversations
                
                
                  
                  {stats.conversationPool.highPerformers}
                  high performers
                
              
            )}
            {stats.byCategory.map((cat) => {
              const Icon = CATEGORY_ICONS[cat.category] || Sparkles;
              return (
                
                  
                  {cat.category?.replace(/_/g, " ")} ({cat.count})
                
              );
            })}
          
        )}

        {/* Filters */}
        {showFilters && (
          
             { setSelectedCampaign(v); setPage(1); }}>
              
                
              
              
                All Campaigns
                {uniqueCampaigns.map((c) => (
                  {c.name}
                ))}
              
            

             { setSelectedCategory(v); setPage(1); }}>
              
                
              
              
                {CATEGORY_OPTIONS.map((cat) => (
                  {cat.label}
                ))}
              
            

             { setMinScore(e.target.value); setPage(1); }}
              className="w-[100px]"
            />

             { setStartDate(e.target.value); setPage(1); }}
              className="w-[140px]"
            />
            to
             { setEndDate(e.target.value); setPage(1); }}
              className="w-[140px]"
            />
          
        )}
      

      {/* Content */}
      
         { setTab(v); setPage(1); }}>
          
            
              
              Showcased ({stats?.total ?? 0})
            
            
              
              Discover
            
          

          {/* ---- Showcased Tab ---- */}
          
            {showcasedLoading ? (
              
                
              
            ) : !showcasedCalls.length ? (
              
                
                  
                  No showcase calls yet
                  
                    Go to the Discover tab to find and pin your top meaningful conversations.
                  
                
              
            ) : (
              
                {showcasedCalls.map((call) => (
                  
                ))}

                {/* Pagination */}
                {pagination && pagination.totalPages > 1 && (
                  
                    
                      Page {pagination.page} of {pagination.totalPages} ({pagination.total} total)
                    
                    
                       setPage(page - 1)}
                      >
                        
                      
                      = pagination.totalPages}
                        onClick={() => setPage(page + 1)}
                      >
                        
                      
                    
                  
                )}
              
            )}
          

          {/* ---- Discover Tab ---- */}
          
            
              
                Auto-detected calls with strong conversation quality, handling precision, and longer call duration.
                These calls demonstrate meaningful professional handling regardless of outcome.
              
            

            {discoverLoading ? (
              
                
              
            ) : !discoverCalls.length ? (
              
                
                  
                  No candidates found
                  
                    No calls meet the performance threshold yet. Lower the minimum score or wait for more analyzed calls.
                  
                
              
            ) : (
              
                
                  Found {discoverCalls.length} candidates (threshold: {discoverData?.threshold}+)
                
                {discoverCalls.map((call) => (
                  
                ))}
              
            )}
          
        
      

      {/* Pin Dialog */}
      

      {/* Detail Side Panel */}
       { if (!open) setDetailCallId(null); }}>
        
          {detailLoading ? (
            
              
            
          ) : detailData ? (
            <>
              
                
                  
                  Call Details
                
              

              
                {/* Performance Score */}
                
                  = 80
                        ? "bg-green-500"
                        : detailData.agentPerformanceScore >= 60
                        ? "bg-yellow-500"
                        : "bg-red-500"
                    }`}
                  >
                    {detailData.agentPerformanceScore}
                  
                  
                    {detailData.contactName || "Unknown"}
                    {detailData.contactJobTitle && (
                      {detailData.contactJobTitle}
                    )}
                    {detailData.accountName && (
                      {detailData.accountName}
                    )}
                  
                

                {/* Meta */}
                
                  {detailData.assignedDisposition && (
                    
                      {detailData.assignedDisposition.replace(/_/g, " ")}
                    
                  )}
                  {detailData.sentiment && (
                    
                      {detailData.sentiment}
                    
                  )}
                  {detailData.campaignName && (
                    {detailData.campaignName}
                  )}
                

                {/* Dimension Scores */}
                
                  
                    Quality Dimensions
                  
                  
                    {[
                      { label: "Engagement", value: detailData.engagementScore },
                      { label: "Clarity", value: detailData.clarityScore },
                      { label: "Empathy", value: detailData.empathyScore },
                      { label: "Objection Handling", value: detailData.objectionHandlingScore },
                      { label: "Flow Compliance", value: detailData.flowComplianceScore },
                      { label: "Qualification", value: detailData.qualificationScore },
                      { label: "Closing", value: detailData.closingScore },
                      { label: "Campaign Alignment", value: detailData.campaignAlignmentScore },
                    ].map((d) => (
                      
                        {d.label}
                        
                          
                        
                        = 80
                              ? "text-green-600"
                              : (d.value ?? 0) >= 60
                              ? "text-yellow-600"
                              : "text-red-500"
                          }`}
                        >
                          {d.value ?? "-"}
                        
                      
                    ))}
                  
                

                {/* Recording Download */}
                {detailData.hasRecording && (
                  
                    
                      Recording
                    
                    
                      
                         {
                            try {
                              const url = await getFreshRecordingUrl(
                                detailData.callSessionId,
                                detailData.playbackUrl || detailData.downloadUrl,
                                detailData.gcsUrlEndpoint || undefined
                              );
                              if (!url) throw new Error('No recording URL available');
                              window.open(url, '_blank', 'noopener,noreferrer');
                            } catch (err) {
                              console.error('Failed to get recording URL:', err);
                              toast({ title: 'Recording unavailable', description: 'Could not resolve recording URL', variant: 'destructive' });
                            }
                          }}
                        >
                          
                          Play in New Tab
                        
                         {
                            try {
                              const url = await getFreshRecordingUrl(
                                detailData.callSessionId,
                                detailData.downloadUrl || detailData.playbackUrl,
                                detailData.gcsUrlEndpoint || undefined
                              );
                              if (!url) throw new Error('No recording URL available');
                              const a = document.createElement('a');
                              a.href = url;
                              a.download = `recording-${detailData.callSessionId}.mp3`;
                              a.click();
                            } catch (err) {
                              console.error('Failed to download recording:', err);
                              toast({ title: 'Download failed', description: 'Could not resolve recording URL', variant: 'destructive' });
                            }
                          }}
                        >
                          
                          Download
                        
                      
                    
                  
                )}

                {/* Transcript */}
                {detailData.fullTranscript && (
                  
                    
                      Transcript
                    
                    
                      
                        
                      
                    
                  
                )}

                {/* Detected Issues */}
                {!!detailData.issues?.length && (
                  
                    
                      Detected Issues
                    
                    
                      {detailData.issues.map((issue: any, idx: number) => (
                        
                          
                            {issue?.type || issue?.category || `Issue ${idx + 1}`}
                          
                          {issue?.severity && (
                            
                              Severity: {String(issue.severity)}
                            
                          )}
                          
                            {issue?.description || issue?.evidence || JSON.stringify(issue)}
                          
                        
                      ))}
                    
                  
                )}

                {/* Recommendations */}
                {!!detailData.recommendations?.length && (
                  
                    
                      Recommendations
                    
                    
                      {detailData.recommendations.map((rec: any, idx: number) => (
                        
                          
                            {rec?.category || rec?.title || `Recommendation ${idx + 1}`}
                          
                          
                            {rec?.suggestedChange || rec?.description || rec?.expectedImpact || JSON.stringify(rec)}
                          
                        
                      ))}
                    
                  
                )}

                {/* Showcase Notes */}
                {detailData.showcaseNotes && (
                  
                    
                      Showcase Notes
                    
                    
                      "{detailData.showcaseNotes}"
                    
                  
                )}
              
            
          ) : (
            
              Call details not found
            
          )}
        
      
    
  );
}