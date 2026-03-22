import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import {
  Play,
  Pin,
  PinOff,
  ChevronDown,
  ChevronUp,
  Clock,
  Phone,
  User,
  Building2,
  Megaphone,
} from "lucide-react";

export interface ShowcaseCall {
  id: string;
  callSessionId: string;
  campaignId?: string | null;
  campaignName?: string | null;
  contactName?: string | null;
  accountName?: string | null;
  overallScore: number | null;
  engagementScore: number | null;
  clarityScore: number | null;
  empathyScore: number | null;
  objectionHandlingScore: number | null;
  flowComplianceScore: number | null;
  closingScore: number | null;
  sentiment: string | null;
  assignedDisposition: string | null;
  showcaseCategory?: string | null;
  showcaseNotes?: string | null;
  showcasedAt?: string | null;
  durationSec: number | null;
  recordingStatus: string | null;
  hasRecording: boolean;
  agentType: string | null;
  startedAt: string | null;
  transcriptExcerpt?: string | null;
  agentPerformanceScore: number;
  suggestedCategory?: string;
  createdAt: string;
}

const CATEGORY_CONFIG: Record = {
  objection_handling: { label: "Objection Handling", color: "bg-blue-100 text-blue-800" },
  professional_close: { label: "Professional Close", color: "bg-purple-100 text-purple-800" },
  engagement_mastery: { label: "Engagement Mastery", color: "bg-emerald-100 text-emerald-800" },
  difficult_situation: { label: "Difficult Situation", color: "bg-amber-100 text-amber-800" },
  empathetic_response: { label: "Empathetic Response", color: "bg-pink-100 text-pink-800" },
  perfect_flow: { label: "Perfect Flow", color: "bg-cyan-100 text-cyan-800" },
};

function getScoreColor(score: number | null): string {
  if (!score) return "text-muted-foreground";
  if (score >= 80) return "text-green-600";
  if (score >= 60) return "text-yellow-600";
  return "text-red-500";
}

function getScoreBg(score: number | null): string {
  if (!score) return "bg-muted";
  if (score >= 80) return "bg-green-500";
  if (score >= 60) return "bg-yellow-500";
  return "bg-red-500";
}

function formatDuration(seconds: number | null): string {
  if (!seconds) return "--:--";
  const total = Math.floor(seconds);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;

  if (h > 0) {
    return `${h}:${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
  }

  return `${m}:${s.toString().padStart(2, "0")}`;
}

function formatDate(dateStr: string | null): string {
  if (!dateStr) return "";
  return new Date(dateStr).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function formatDisposition(d: string | null): string {
  if (!d) return "N/A";
  return d.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

interface ShowcaseCallCardProps {
  call: ShowcaseCall;
  isPinned?: boolean;
  onPin?: (call: ShowcaseCall) => void;
  onUnpin?: (callSessionId: string) => void;
  onViewDetails?: (callSessionId: string) => void;
}

export function ShowcaseCallCard({
  call,
  isPinned = false,
  onPin,
  onUnpin,
  onViewDetails,
}: ShowcaseCallCardProps) {
  const [expanded, setExpanded] = useState(false);

  const categoryConfig = call.showcaseCategory
    ? CATEGORY_CONFIG[call.showcaseCategory]
    : call.suggestedCategory
    ? CATEGORY_CONFIG[call.suggestedCategory]
    : null;

  const dimensions = [
    { label: "Engagement", value: call.engagementScore },
    { label: "Clarity", value: call.clarityScore },
    { label: "Empathy", value: call.empathyScore },
    { label: "Objection Handling", value: call.objectionHandlingScore },
    { label: "Flow Compliance", value: call.flowComplianceScore },
    { label: "Closing", value: call.closingScore },
  ];

  return (
    
      
        {/* Top row: score + category + meta */}
        
          {/* Agent Performance Score circle */}
          
            = 80
                  ? "bg-green-500"
                  : call.agentPerformanceScore >= 60
                  ? "bg-yellow-500"
                  : "bg-red-500"
              }`}
            >
              {call.agentPerformanceScore}
            
            Agent Score
          

          {/* Main info */}
          
            
              {categoryConfig && (
                
                  {categoryConfig.label}
                
              )}
              {call.sentiment && (
                
                  {call.sentiment}
                
              )}
              
                {formatDisposition(call.assignedDisposition)}
              
            

            
              {call.contactName && (
                
                  
                  {call.contactName}
                
              )}
              {call.accountName && (
                
                  
                  {call.accountName}
                
              )}
              {call.campaignName && (
                
                  
                  {call.campaignName}
                
              )}
            

            
              
                
                {formatDuration(call.durationSec)}
              
              {formatDate(call.startedAt || call.createdAt)}
              {call.hasRecording && (
                
                   Recording
                
              )}
            

            {call.showcaseNotes && (
              
                "{call.showcaseNotes}"
              
            )}
          

          {/* Actions */}
          
            {isPinned ? (
               onUnpin?.(call.callSessionId)}
                title="Unpin from showcase"
              >
                
              
            ) : (
               onPin?.(call)}
                title="Pin as showcase"
              >
                
              
            )}
             onViewDetails?.(call.callSessionId)}
              title="View details"
            >
              
            
          
        

        {/* Dimension bars (compact) */}
        
          {dimensions.map((d) => (
            
              
                {d.label}
              
              
                
              
              
                {d.value ?? "-"}
              
            
          ))}
        

        {/* Expandable transcript excerpt */}
        {call.transcriptExcerpt && (
          
             setExpanded(!expanded)}
            >
              {expanded ? (
                <>
                   Hide excerpt
                
              ) : (
                <>
                   Show excerpt
                
              )}
            
            {expanded && (
              
                {call.transcriptExcerpt}...
              
            )}
          
        )}
      
    
  );
}

export default ShowcaseCallCard;