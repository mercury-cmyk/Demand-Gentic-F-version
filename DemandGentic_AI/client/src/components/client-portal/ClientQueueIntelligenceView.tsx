/**
 * Client Portal Queue Intelligence View
 *
 * Read-only version of admin QueueIntelligenceView.
 * Uses client portal auth (Bearer token) and routes through /api/client-portal/campaigns/:id/queue-intelligence/*.
 * No scoring, no settings — purely informational for clients.
 */

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Brain, BarChart3, Layers, List, Loader2, Activity } from "lucide-react";
import { ScoreOverviewPanel } from "@/components/queue-intelligence/ScoreOverviewPanel";
import { SegmentAnalysisPanel } from "@/components/queue-intelligence/SegmentAnalysisPanel";
import { LiveStatsPanel, type LiveStatsData } from "@/components/queue-intelligence/LiveStatsPanel";
import type { ScoreOverview, SegmentAnalysis, ContactScoresResponse, ScoreBreakdown } from "@/components/queue-intelligence/types";
import { SCORE_DIMENSIONS } from "@/components/queue-intelligence/types";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Button } from "@/components/ui/button";
import { ChevronLeft, ChevronRight, ArrowUpDown } from "lucide-react";

const getToken = () => localStorage.getItem("clientPortalToken");

/** Authenticated fetch for client portal endpoints */
async function clientFetch(path: string): Promise {
  const res = await fetch(path, {
    headers: { Authorization: `Bearer ${getToken()}` },
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.message || `Request failed (${res.status})`);
  }
  return res.json();
}

// ─── Sub-Score Bars (inline — identical to admin version) ─────────────────────
function SubScoreBars({ breakdown }: { breakdown: ScoreBreakdown }) {
  return (
    
      
        
          
            {SCORE_DIMENSIONS.map((dim) => (
              
            ))}
          
        
        
          
            {SCORE_DIMENSIONS.map((dim) => (
              
                
                
                  {dim.label}: {breakdown[dim.key]}/200
                
              
            ))}
          
        
      
    
  );
}

// ─── Client Contact Scores Table ──────────────────────────────────────────────
function ClientContactScoresTable({ campaignId }: { campaignId: string }) {
  const [page, setPage] = useState(1);
  const [sortBy, setSortBy] = useState("score");
  const [tierFilter, setTierFilter] = useState("all");

  const { data, isLoading } = useQuery({
    queryKey: ["client-qi", campaignId, "contact-scores", page, sortBy, tierFilter],
    queryFn: () => {
      const params = new URLSearchParams({ page: String(page), limit: "25", sortBy });
      if (tierFilter !== "all") params.set("tier", tierFilter);
      return clientFetch(
        `/api/client-portal/campaigns/${campaignId}/queue-intelligence/contact-scores?${params}`
      );
    },
    enabled: !!campaignId,
  });

  const sortOptions = [
    { value: "score", label: "AI Score" },
    { value: "industry", label: "Industry" },
    { value: "topic", label: "Topic" },
    { value: "accountFit", label: "Account Fit" },
    { value: "roleFit", label: "Role Fit" },
    { value: "historical", label: "Historical" },
    { value: "priority", label: "Final Priority" },
  ];

  return (
    
      
        
          Contact Scores
          
            
              Tier:
               { setTierFilter(v); setPage(1); }}>
                
                
                  All
                  Tier 1
                  Tier 2
                  Tier 3
                  Tier 4
                
              
            
            
              
               { setSortBy(v); setPage(1); }}>
                
                
                  {sortOptions.map((opt) => (
                    {opt.label}
                  ))}
                
              
            
          
        
      
      
        {isLoading ? (
          Loading...
        ) : !data || data.contacts.length === 0 ? (
          
            No scored contacts available yet.
          
        ) : (
          <>
            
              
                
                  Contact
                  Company
                  Industry
                  Title
                  AI Score
                  Sub-Scores
                  Final Priority
                
              
              
                {data.contacts.map((contact) => (
                  
                    {contact.contactName}
                    {contact.accountName}
                    {contact.industry || "—"}
                    {contact.jobTitle || "—"}
                    
                      = 800 ? "border-green-500 text-green-600"
                            : contact.aiPriorityScore >= 600 ? "border-blue-500 text-blue-600"
                            : contact.aiPriorityScore >= 400 ? "border-yellow-500 text-yellow-600"
                            : "border-red-500 text-red-600"
                        }
                      >
                        {contact.aiPriorityScore}
                      
                    
                    
                      
                    
                    {contact.finalPriority}
                  
                ))}
              
            

            {data.pagination.totalPages > 1 && (
              
                
                  Page {data.pagination.page} of {data.pagination.totalPages} ({data.pagination.total} contacts)
                
                
                   setPage((p) => p - 1)}>
                    
                  
                  = data.pagination.totalPages} onClick={() => setPage((p) => p + 1)}>
                    
                  
                
              
            )}
          
        )}
      
    
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

interface Props {
  campaignId: string;
}

export function ClientQueueIntelligenceView({ campaignId }: Props) {
  const [activeTab, setActiveTab] = useState("live-stats");

  const basePath = `/api/client-portal/campaigns/${campaignId}/queue-intelligence`;

  // Overview
  const { data: overview, isLoading: overviewLoading } = useQuery({
    queryKey: ["client-qi", campaignId, "overview"],
    queryFn: () => clientFetch(`${basePath}/overview`),
    enabled: !!campaignId,
  });

  // Segments
  const { data: segments, isLoading: segmentsLoading } = useQuery({
    queryKey: ["client-qi", campaignId, "segment-analysis"],
    queryFn: () => clientFetch(`${basePath}/segment-analysis`),
    enabled: !!campaignId && activeTab === "segments",
  });

  // Live stats
  const {
    data: liveStats,
    isLoading: liveStatsLoading,
    error: liveStatsError,
  } = useQuery({
    queryKey: ["client-qi", campaignId, "live-stats"],
    queryFn: () => clientFetch(`${basePath}/live-stats`),
    enabled: !!campaignId && activeTab === "live-stats",
    refetchInterval: activeTab === "live-stats" ? 30000 : false,
    retry: 1,
  });

  const hasScores = overview && overview.totalScored > 0;

  return (
    
      {/* Header — read-only, no scoring or settings buttons */}
      
        
          
          
            Queue Intelligence
            
              AI-powered contact prioritization based on industry, topic, account fit, role, and historical data
            
          
        
        {overview?.scoredAt && (
          
            Last scored: {new Date(overview.scoredAt).toLocaleString()}
          
        )}
      

      {/* Tabs */}
      
        
          
            
            Live Stats
          
          {hasScores && (
            <>
              
                
                Overview
              
              
                
                Segments
              
              
                
                Contact Scores
                
                  {overview?.totalScored || 0}
                
              
            
          )}
        

        
          {liveStatsLoading ? (
            
              
            
          ) : liveStatsError ? (
            
              
              Could not load live stats
              
                {(liveStatsError as any)?.message ||
                  "The queue may not have any contacts yet. Try again later."}
              
            
          ) : liveStats ? (
            
          ) : (
            
              
              No Queue Data
              
                Queue contacts into this campaign first, then live stats will appear here showing country distribution,
                phone status, priority breakdown, and next-in-line contacts.
              
            
          )}
        

        {hasScores && (
          <>
            
              {overviewLoading ? (
                
                  
                
              ) : overview ? (
                
              ) : null}
            

            
              {segmentsLoading ? (
                
                  
                
              ) : segments ? (
                
              ) : null}
            

            
              
            
          
        )}
      
    
  );
}