/**
 * Pipeline Board — Kanban-style board view of leads across pipeline stages.
 */

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Phone,
  Mail,
  Clock,
  AlertTriangle,
  ChevronRight,
  UserPlus,
  MessageSquare,
} from "lucide-react";
import { PriorityBadge, type PipelineStage, type JourneyLead } from "./journey-pipeline-tab";

interface PipelineBoardProps {
  pipeline: {
    id: string;
    stages: PipelineStage[];
  };
  leads: JourneyLead[];
  loading: boolean;
  onSelectLead: (id: string) => void;
  authHeaders: { headers: { Authorization: string } };
  onRefresh: () => void;
}

export function PipelineBoard({
  pipeline,
  leads,
  loading,
  onSelectLead,
  authHeaders,
  onRefresh,
}: PipelineBoardProps) {
  const queryClient = useQueryClient();
  const stages = (pipeline.stages as PipelineStage[]) || [];

  // Group leads by stage
  const leadsByStage: Record<string, JourneyLead[]> = {};
  stages.forEach((s) => {
    leadsByStage[s.id] = [];
  });
  leads.forEach((lead) => {
    if (leadsByStage[lead.currentStageId]) {
      leadsByStage[lead.currentStageId].push(lead);
    } else {
      // Lead in unknown stage — put in first stage
      const firstStage = stages[0]?.id;
      if (firstStage && leadsByStage[firstStage]) {
        leadsByStage[firstStage].push(lead);
      }
    }
  });

  // Sort leads within each stage by priority desc, then next action date
  Object.keys(leadsByStage).forEach((stageId) => {
    leadsByStage[stageId].sort((a, b) => {
      if (b.priority !== a.priority) return b.priority - a.priority;
      if (a.nextActionAt && b.nextActionAt) {
        return new Date(a.nextActionAt).getTime() - new Date(b.nextActionAt).getTime();
      }
      return a.nextActionAt ? -1 : 1;
    });
  });

  // Move lead mutation
  const moveLead = useMutation({
    mutationFn: async ({ leadId, stageId }: { leadId: string; stageId: string }) => {
      const res = await fetch(`/api/client-portal/journey-pipeline/leads/${leadId}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          ...authHeaders.headers,
        },
        body: JSON.stringify({ currentStageId: stageId }),
      });
      if (!res.ok) throw new Error("Failed to move lead");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["journey-pipeline-leads"] });
      onRefresh();
    },
  });

  if (loading) {
    return (
      <div className="flex gap-4 overflow-x-auto pb-4">
        {stages.map((s) => (
          <div key={s.id} className="min-w-[280px] space-y-3">
            <Skeleton className="h-8 w-full" />
            <Skeleton className="h-24 w-full" />
            <Skeleton className="h-24 w-full" />
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="flex gap-3 overflow-x-auto pb-4">
      {stages.map((stage, stageIndex) => {
        const stageLeads = leadsByStage[stage.id] || [];
        const nextStage = stages[stageIndex + 1];

        return (
          <div
            key={stage.id}
            className="min-w-[280px] max-w-[320px] flex-shrink-0"
          >
            {/* Stage Header */}
            <div
              className="flex items-center justify-between px-3 py-2 rounded-t-lg border border-b-2"
              style={{ borderBottomColor: stage.color || "#6b7280" }}
            >
              <div className="flex items-center gap-2">
                <div
                  className="w-2.5 h-2.5 rounded-full"
                  style={{ backgroundColor: stage.color || "#6b7280" }}
                />
                <span className="font-medium text-sm">{stage.name}</span>
              </div>
              <Badge variant="secondary" className="text-xs">
                {stageLeads.length}
              </Badge>
            </div>

            {/* Stage Content */}
            <ScrollArea className="border border-t-0 rounded-b-lg bg-muted/20 max-h-[600px]">
              <div className="p-2 space-y-2 min-h-[100px]">
                {stageLeads.map((lead) => (
                  <LeadCard
                    key={lead.id}
                    lead={lead}
                    nextStage={nextStage}
                    onClick={() => onSelectLead(lead.id)}
                    onMoveNext={
                      nextStage
                        ? () => moveLead.mutate({ leadId: lead.id, stageId: nextStage.id })
                        : undefined
                    }
                  />
                ))}

                {stageLeads.length === 0 && (
                  <div className="flex items-center justify-center py-8 text-sm text-muted-foreground">
                    No leads
                  </div>
                )}
              </div>
            </ScrollArea>
          </div>
        );
      })}
    </div>
  );
}

// ─── Lead Card ───

function LeadCard({
  lead,
  nextStage,
  onClick,
  onMoveNext,
}: {
  lead: JourneyLead;
  nextStage?: PipelineStage;
  onClick: () => void;
  onMoveNext?: () => void;
}) {
  const isOverdue = lead.nextActionAt && new Date(lead.nextActionAt) < new Date();
  const actionIcon: Record<string, any> = {
    callback: Phone,
    email: Mail,
    sms: MessageSquare,
  };
  const NextActionIcon = lead.nextActionType ? actionIcon[lead.nextActionType] || Clock : Clock;

  // Compute time since last activity
  const lastActivityAge = lead.lastActivityAt
    ? Math.round((Date.now() - new Date(lead.lastActivityAt).getTime()) / (1000 * 60 * 60))
    : null;
  const isStale = lastActivityAge !== null && lastActivityAge > 72;

  return (
    <Card
      className={`cursor-pointer hover:shadow-md transition-shadow ${
        isOverdue ? "border-destructive/50 bg-destructive/5" : isStale ? "border-amber-300/50 bg-amber-50/30 dark:bg-amber-950/10" : ""
      }`}
      onClick={onClick}
    >
      <CardContent className="p-3 space-y-2">
        {/* Lead info */}
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <div className="font-medium text-sm truncate">
              {lead.contactName || "Unknown Contact"}
            </div>
            {lead.companyName && (
              <div className="text-xs text-muted-foreground truncate">{lead.companyName}</div>
            )}
          </div>
          <PriorityBadge priority={lead.priority} />
        </div>

        {/* Source info */}
        {lead.sourceDisposition && (
          <div className="text-xs text-muted-foreground">
            Source: <span className="capitalize">{lead.sourceDisposition.replace(/_/g, " ")}</span>
          </div>
        )}

        {/* Next action */}
        {lead.nextActionAt && (
          <div
            className={`flex items-center gap-1.5 text-xs ${
              isOverdue ? "text-destructive font-medium" : "text-muted-foreground"
            }`}
          >
            {isOverdue && <AlertTriangle className="h-3 w-3" />}
            <NextActionIcon className="h-3 w-3" />
            <span className="capitalize">{lead.nextActionType || "Action"}</span>
            <span>-</span>
            <span>{new Date(lead.nextActionAt).toLocaleDateString()}</span>
          </div>
        )}

        {/* Activity indicators */}
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          {lead.totalActions > 0 && (
            <span className="flex items-center gap-0.5" title={`${lead.totalActions} total actions`}>
              <UserPlus className="h-3 w-3" />
              {lead.totalActions}
            </span>
          )}
          {lastActivityAge !== null && (
            <span className={`flex items-center gap-0.5 ${isStale ? "text-amber-600" : ""}`}
              title={`Last activity ${lastActivityAge}h ago`}>
              <Clock className="h-3 w-3" />
              {lastActivityAge < 24
                ? `${lastActivityAge}h ago`
                : `${Math.round(lastActivityAge / 24)}d ago`}
            </span>
          )}
        </div>

        {/* Quick actions */}
        {nextStage && (
          <div className="flex justify-end pt-1">
            <Button
              variant="ghost"
              size="sm"
              className="h-6 text-xs gap-1 text-muted-foreground hover:text-foreground"
              onClick={(e) => {
                e.stopPropagation();
                onMoveNext?.();
              }}
            >
              {nextStage.name}
              <ChevronRight className="h-3 w-3" />
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
