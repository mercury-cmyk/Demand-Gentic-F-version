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

const CATEGORY_CONFIG: Record<string, { label: string; color: string }> = {
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
    <Card className="hover:shadow-md transition-shadow">
      <CardContent className="p-4">
        {/* Top row: score + category + meta */}
        <div className="flex items-start gap-4">
          {/* Agent Performance Score circle */}
          <div className="flex-shrink-0 flex flex-col items-center">
            <div
              className={`w-14 h-14 rounded-full flex items-center justify-center text-white font-bold text-lg ${
                call.agentPerformanceScore >= 80
                  ? "bg-green-500"
                  : call.agentPerformanceScore >= 60
                  ? "bg-yellow-500"
                  : "bg-red-500"
              }`}
            >
              {call.agentPerformanceScore}
            </div>
            <span className="text-[10px] text-muted-foreground mt-1">Agent Score</span>
          </div>

          {/* Main info */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap mb-1">
              {categoryConfig && (
                <Badge variant="outline" className={`text-xs ${categoryConfig.color}`}>
                  {categoryConfig.label}
                </Badge>
              )}
              {call.sentiment && (
                <Badge
                  variant="outline"
                  className={`text-xs ${
                    call.sentiment === "positive"
                      ? "bg-green-50 text-green-700"
                      : call.sentiment === "negative"
                      ? "bg-red-50 text-red-700"
                      : "bg-gray-50 text-gray-700"
                  }`}
                >
                  {call.sentiment}
                </Badge>
              )}
              <Badge variant="secondary" className="text-xs">
                {formatDisposition(call.assignedDisposition)}
              </Badge>
            </div>

            <div className="flex items-center gap-3 text-sm text-muted-foreground flex-wrap">
              {call.contactName && (
                <span className="flex items-center gap-1">
                  <User className="h-3 w-3" />
                  {call.contactName}
                </span>
              )}
              {call.accountName && (
                <span className="flex items-center gap-1">
                  <Building2 className="h-3 w-3" />
                  {call.accountName}
                </span>
              )}
              {call.campaignName && (
                <span className="flex items-center gap-1">
                  <Megaphone className="h-3 w-3" />
                  {call.campaignName}
                </span>
              )}
            </div>

            <div className="flex items-center gap-3 text-xs text-muted-foreground mt-1">
              <span className="flex items-center gap-1">
                <Clock className="h-3 w-3" />
                {formatDuration(call.durationSec)}
              </span>
              <span>{formatDate(call.startedAt || call.createdAt)}</span>
              {call.hasRecording && (
                <span className="flex items-center gap-1 text-green-600">
                  <Phone className="h-3 w-3" /> Recording
                </span>
              )}
            </div>

            {call.showcaseNotes && (
              <p className="text-xs text-muted-foreground mt-1 italic">
                "{call.showcaseNotes}"
              </p>
            )}
          </div>

          {/* Actions */}
          <div className="flex-shrink-0 flex flex-col gap-1">
            {isPinned ? (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => onUnpin?.(call.callSessionId)}
                title="Unpin from showcase"
              >
                <PinOff className="h-4 w-4" />
              </Button>
            ) : (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => onPin?.(call)}
                title="Pin as showcase"
              >
                <Pin className="h-4 w-4" />
              </Button>
            )}
            <Button
              variant="ghost"
              size="sm"
              onClick={() => onViewDetails?.(call.callSessionId)}
              title="View details"
            >
              <Play className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {/* Dimension bars (compact) */}
        <div className="mt-3 grid grid-cols-3 gap-x-4 gap-y-1">
          {dimensions.map((d) => (
            <div key={d.label} className="flex items-center gap-2">
              <span className="text-[10px] text-muted-foreground w-[80px] truncate">
                {d.label}
              </span>
              <div className="flex-1 h-1.5 bg-muted rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full ${getScoreBg(d.value)}`}
                  style={{ width: `${d.value ?? 0}%` }}
                />
              </div>
              <span className={`text-[10px] font-medium w-6 text-right ${getScoreColor(d.value)}`}>
                {d.value ?? "-"}
              </span>
            </div>
          ))}
        </div>

        {/* Expandable transcript excerpt */}
        {call.transcriptExcerpt && (
          <div className="mt-2">
            <Button
              variant="ghost"
              size="sm"
              className="h-6 px-2 text-xs text-muted-foreground"
              onClick={() => setExpanded(!expanded)}
            >
              {expanded ? (
                <>
                  <ChevronUp className="h-3 w-3 mr-1" /> Hide excerpt
                </>
              ) : (
                <>
                  <ChevronDown className="h-3 w-3 mr-1" /> Show excerpt
                </>
              )}
            </Button>
            {expanded && (
              <p className="text-xs text-muted-foreground mt-1 p-2 bg-muted rounded">
                {call.transcriptExcerpt}...
              </p>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default ShowcaseCallCard;
