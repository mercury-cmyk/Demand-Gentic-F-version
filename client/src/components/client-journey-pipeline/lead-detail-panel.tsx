/**
 * Lead Detail Panel — Slide-out panel showing full lead context, activity timeline,
 * AI-generated follow-up context, and action scheduling.
 */

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Phone,
  Mail,
  MessageSquare,
  StickyNote,
  Clock,
  CheckCircle2,
  XCircle,
  SkipForward,
  ArrowRight,
  Sparkles,
  User,
  Building2,
  Briefcase,
  AlertTriangle,
  CalendarDays,
  FileText,
  Loader2,
  Send,
  Eye,
  MousePointerClick,
  Activity,
} from "lucide-react";
import { PriorityBadge, type PipelineStage, type JourneyLead, type JourneyAction } from "./journey-pipeline-tab";
import { ScheduleActionDialog } from "./schedule-action-dialog";

interface LeadDetailPanelProps {
  leadId: string;
  pipeline: {
    id: string;
    stages: PipelineStage[];
  };
  authHeaders: { headers: { Authorization: string } };
  onClose: () => void;
  onRefresh: () => void;
}

export function LeadDetailPanel({
  leadId,
  pipeline,
  authHeaders,
  onClose,
  onRefresh,
}: LeadDetailPanelProps) {
  const queryClient = useQueryClient();
  const [showSchedule, setShowSchedule] = useState(false);
  const [scheduleType, setScheduleType] = useState<"callback" | "email" | "note">("callback");
  const [activeTab, setActiveTab] = useState("timeline");
  const [notes, setNotes] = useState("");
  const [notesEdited, setNotesEdited] = useState(false);

  const stages = (pipeline.stages as PipelineStage[]) || [];

  // ─── Fetch lead detail ───
  const { data: leadData, isLoading } = useQuery<{
    lead: JourneyLead;
    actions: JourneyAction[];
  }>({
    queryKey: ["journey-lead-detail", leadId],
    queryFn: async () => {
      const res = await fetch(
        `/api/client-portal/journey-pipeline/leads/${leadId}`,
        authHeaders
      );
      if (!res.ok) throw new Error("Failed to fetch lead");
      return res.json();
    },
    enabled: !!leadId,
  });

  const lead = leadData?.lead;
  const actions = leadData?.actions || [];

  // Initialize notes when lead loads
  if (lead && !notesEdited && notes !== (lead.notes || "")) {
    setNotes(lead.notes || "");
  }

  // ─── Fetch communications history ───
  const { data: commsData } = useQuery<{
    communications: {
      emailActions: any[];
      campaignEmails: any[];
      emailTrackingEvents: any[];
      activityHistory: any[];
      summary: {
        totalEmails: number;
        emailsSent: number;
        emailsOpened: number;
        emailsClicked: number;
        emailsBounced: number;
        totalActivities: number;
      };
    };
  }>({
    queryKey: ["journey-lead-comms", leadId],
    queryFn: async () => {
      const res = await fetch(
        `/api/client-portal/journey-pipeline/leads/${leadId}/communications`,
        authHeaders
      );
      if (!res.ok) throw new Error("Failed to fetch communications");
      return res.json();
    },
    enabled: !!leadId && activeTab === "comms",
  });

  const comms = commsData?.communications;

  // ─── Accountability Scorecard ───
  const { data: accountabilityData } = useQuery<{
    success: boolean;
    accountability: {
      summary: {
        total: number;
        completed: number;
        failed: number;
        skipped: number;
        scheduled: number;
        overdue: number;
        completionRate: number;
        verified: number;
        verificationRate: number;
        avgResponseHours: number | null;
      };
      byActionType: Record<string, { total: number; completed: number; failed: number; skipped: number }>;
      executionMethods: Record<string, number>;
    };
  }>({
    queryKey: ["journey-lead-accountability", leadId],
    queryFn: async () => {
      const res = await fetch(
        `/api/client-portal/journey-pipeline/leads/${leadId}/accountability`,
        authHeaders
      );
      if (!res.ok) throw new Error("Failed to fetch accountability");
      return res.json();
    },
    enabled: !!leadId,
  });

  const accountability = accountabilityData?.accountability;

  // ─── AI Follow-up Generation ───
  const generateFollowUp = useMutation({
    mutationFn: async (type: "callback" | "email") => {
      const res = await fetch(
        `/api/client-portal/journey-pipeline/leads/${leadId}/generate-followup`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json", ...authHeaders.headers },
          body: JSON.stringify({ type }),
        }
      );
      if (!res.ok) throw new Error("Failed to generate");
      return res.json();
    },
  });

  // ─── AI Recommendation ───
  const getRecommendation = useMutation({
    mutationFn: async () => {
      const res = await fetch(
        `/api/client-portal/journey-pipeline/leads/${leadId}/recommend-action`,
        { method: "POST", headers: { "Content-Type": "application/json", ...authHeaders.headers } }
      );
      if (!res.ok) throw new Error("Failed to get recommendation");
      return res.json();
    },
  });

  // ─── Update Lead ───
  const updateLead = useMutation({
    mutationFn: async (data: Record<string, any>) => {
      const res = await fetch(`/api/client-portal/journey-pipeline/leads/${leadId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", ...authHeaders.headers },
        body: JSON.stringify(data),
      });
      if (!res.ok) throw new Error("Failed to update");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["journey-lead-detail", leadId] });
      queryClient.invalidateQueries({ queryKey: ["journey-pipeline-leads"] });
      onRefresh();
    },
  });

  // ─── Complete Action ───
  const completeAction = useMutation({
    mutationFn: async ({ actionId, outcome, resultDisposition, executionMethod }: {
      actionId: string;
      outcome: string;
      resultDisposition?: string;
      executionMethod?: string;
    }) => {
      const res = await fetch(
        `/api/client-portal/journey-pipeline/actions/${actionId}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json", ...authHeaders.headers },
          body: JSON.stringify({
            status: "completed",
            outcome,
            resultDisposition,
            executionMethod: executionMethod || "manual",
          }),
        }
      );
      if (!res.ok) throw new Error("Failed to update action");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["journey-lead-detail", leadId] });
      queryClient.invalidateQueries({ queryKey: ["journey-lead-accountability", leadId] });
    },
  });

  const skipAction = useMutation({
    mutationFn: async (actionId: string) => {
      const res = await fetch(
        `/api/client-portal/journey-pipeline/actions/${actionId}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json", ...authHeaders.headers },
          body: JSON.stringify({ status: "skipped" }),
        }
      );
      if (!res.ok) throw new Error("Failed to skip action");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["journey-lead-detail", leadId] });
    },
  });

  const currentStage = stages.find((s) => s.id === lead?.currentStageId);

  return (
    <Sheet open={true} onOpenChange={() => onClose()}>
      <SheetContent className="w-full sm:max-w-[560px] overflow-y-auto">
        {isLoading || !lead ? (
          <div className="space-y-4 pt-6">
            <Skeleton className="h-8 w-48" />
            <Skeleton className="h-4 w-32" />
            <Skeleton className="h-[300px] w-full" />
          </div>
        ) : (
          <>
            <SheetHeader className="pb-4">
              <div className="flex items-start justify-between">
                <div>
                  <SheetTitle className="text-lg">
                    {lead.contactName || "Unknown Contact"}
                  </SheetTitle>
                  <div className="flex items-center gap-2 mt-1 text-sm text-muted-foreground">
                    {lead.jobTitle && (
                      <span className="flex items-center gap-1">
                        <Briefcase className="h-3 w-3" />
                        {lead.jobTitle}
                      </span>
                    )}
                    {lead.companyName && (
                      <span className="flex items-center gap-1">
                        <Building2 className="h-3 w-3" />
                        {lead.companyName}
                      </span>
                    )}
                  </div>
                </div>
                <PriorityBadge priority={lead.priority} />
              </div>

              {/* Contact details */}
              <div className="flex flex-wrap gap-2 mt-2">
                {lead.contactPhone && (
                  <Badge variant="outline" className="gap-1 text-xs">
                    <Phone className="h-3 w-3" />
                    {lead.contactPhone}
                  </Badge>
                )}
                {lead.contactEmail && (
                  <Badge variant="outline" className="gap-1 text-xs">
                    <Mail className="h-3 w-3" />
                    {lead.contactEmail}
                  </Badge>
                )}
              </div>

              {/* Stage selector */}
              <div className="flex items-center gap-2 mt-3">
                <span className="text-sm font-medium">Stage:</span>
                <Select
                  value={lead.currentStageId}
                  onValueChange={(stageId) => updateLead.mutate({ currentStageId: stageId })}
                >
                  <SelectTrigger className="w-[200px] h-8">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {stages.map((s) => (
                      <SelectItem key={s.id} value={s.id}>
                        <div className="flex items-center gap-2">
                          <div
                            className="w-2 h-2 rounded-full"
                            style={{ backgroundColor: s.color || "#6b7280" }}
                          />
                          {s.name}
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                <Select
                  value={String(lead.priority)}
                  onValueChange={(v) => updateLead.mutate({ priority: parseInt(v) })}
                >
                  <SelectTrigger className="w-[120px] h-8">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {[5, 4, 3, 2, 1].map((p) => (
                      <SelectItem key={p} value={String(p)}>
                        Priority {p}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </SheetHeader>

            <Separator />

            {/* Quick Actions */}
            <div className="flex flex-wrap gap-2 py-3">
              <Button
                size="sm"
                variant="outline"
                className="gap-1"
                onClick={() => {
                  setScheduleType("callback");
                  setShowSchedule(true);
                }}
              >
                <Phone className="h-3.5 w-3.5" />
                Schedule Callback
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="gap-1"
                onClick={() => {
                  setScheduleType("email");
                  setShowSchedule(true);
                }}
              >
                <Mail className="h-3.5 w-3.5" />
                Send Email
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="gap-1"
                onClick={() => {
                  setScheduleType("note");
                  setShowSchedule(true);
                }}
              >
                <StickyNote className="h-3.5 w-3.5" />
                Add Note
              </Button>
              <Button
                size="sm"
                variant="secondary"
                className="gap-1"
                onClick={() => getRecommendation.mutate()}
                disabled={getRecommendation.isPending}
              >
                <Sparkles className="h-3.5 w-3.5" />
                {getRecommendation.isPending ? "Thinking..." : "AI Recommend"}
              </Button>
            </div>

            {/* AI Recommendation Result */}
            {getRecommendation.data?.recommendation && (
              <Card className="mb-3 border-primary/30 bg-primary/5">
                <CardContent className="p-3 space-y-2">
                  <div className="flex items-center gap-2 text-sm font-medium">
                    <Sparkles className="h-4 w-4 text-primary" />
                    AI Recommendation
                  </div>
                  <div className="text-sm">
                    <span className="font-medium capitalize">
                      {getRecommendation.data.recommendation.actionType}
                    </span>{" "}
                    — {getRecommendation.data.recommendation.timing}
                  </div>
                  <p className="text-sm text-muted-foreground">
                    {getRecommendation.data.recommendation.reasoning}
                  </p>
                  <Button
                    size="sm"
                    className="gap-1"
                    onClick={() => {
                      setScheduleType(
                        getRecommendation.data.recommendation.actionType === "email"
                          ? "email"
                          : "callback"
                      );
                      setShowSchedule(true);
                    }}
                  >
                    Schedule {getRecommendation.data.recommendation.actionType}
                  </Button>
                </CardContent>
              </Card>
            )}

            {/* Accountability Scorecard */}
            {accountability && accountability.summary.total > 0 && (
              <Card className="mb-3">
                <CardContent className="p-3">
                  <div className="flex items-center gap-2 mb-2 text-sm font-medium">
                    <Activity className="h-4 w-4" />
                    Execution Scorecard
                  </div>
                  <div className="grid grid-cols-4 gap-2">
                    <div className="text-center p-1.5 rounded bg-muted/50">
                      <div className="text-lg font-bold">{accountability.summary.completionRate}%</div>
                      <div className="text-[10px] text-muted-foreground">Completion</div>
                    </div>
                    <div className="text-center p-1.5 rounded bg-muted/50">
                      <div className="text-lg font-bold">
                        {accountability.summary.completed}/{accountability.summary.total}
                      </div>
                      <div className="text-[10px] text-muted-foreground">Actions Done</div>
                    </div>
                    <div className="text-center p-1.5 rounded bg-muted/50">
                      <div className={`text-lg font-bold ${accountability.summary.overdue > 0 ? "text-destructive" : ""}`}>
                        {accountability.summary.overdue}
                      </div>
                      <div className="text-[10px] text-muted-foreground">Overdue</div>
                    </div>
                    <div className="text-center p-1.5 rounded bg-muted/50">
                      <div className="text-lg font-bold">
                        {accountability.summary.avgResponseHours != null
                          ? accountability.summary.avgResponseHours < 24
                            ? `${accountability.summary.avgResponseHours}h`
                            : `${Math.round(accountability.summary.avgResponseHours / 24)}d`
                          : "—"}
                      </div>
                      <div className="text-[10px] text-muted-foreground">Avg Response</div>
                    </div>
                  </div>
                  {/* Action type breakdown row */}
                  <div className="flex gap-3 mt-2 text-xs text-muted-foreground">
                    {Object.entries(accountability.byActionType).map(([type, stats]) => (
                      <span key={type} className="flex items-center gap-1 capitalize">
                        {type === "callback" && <Phone className="h-3 w-3" />}
                        {type === "email" && <Mail className="h-3 w-3" />}
                        {type === "sms" && <MessageSquare className="h-3 w-3" />}
                        {stats.completed}/{stats.total}
                      </span>
                    ))}
                    {accountability.summary.verified > 0 && (
                      <span className="flex items-center gap-1 text-green-600">
                        <CheckCircle2 className="h-3 w-3" />
                        {accountability.summary.verificationRate}% verified
                      </span>
                    )}
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Tabs: Timeline / Source Context / Notes */}
            <Tabs value={activeTab} onValueChange={setActiveTab}>
              <TabsList className="w-full">
                <TabsTrigger value="timeline" className="flex-1">
                  Timeline
                </TabsTrigger>
                <TabsTrigger value="comms" className="flex-1">
                  Communications
                </TabsTrigger>
                <TabsTrigger value="context" className="flex-1">
                  Source Context
                </TabsTrigger>
                <TabsTrigger value="notes" className="flex-1">
                  Notes
                </TabsTrigger>
              </TabsList>

              {/* ─── Timeline Tab ─── */}
              <TabsContent value="timeline" className="space-y-2 mt-3">
                {actions.length === 0 ? (
                  <div className="text-center py-8 text-sm text-muted-foreground">
                    No actions yet. Schedule a callback or email to get started.
                  </div>
                ) : (
                  actions.map((action) => (
                    <ActionTimelineItem
                      key={action.id}
                      action={action}
                      onComplete={(outcome, resultDisposition, executionMethod) =>
                        completeAction.mutate({ actionId: action.id, outcome, resultDisposition, executionMethod })
                      }
                      onSkip={() => skipAction.mutate(action.id)}
                    />
                  ))
                )}
              </TabsContent>

              {/* ─── Communications Tab ─── */}
              <TabsContent value="comms" className="space-y-3 mt-3">
                {!comms ? (
                  <div className="space-y-2">
                    <Skeleton className="h-16 w-full" />
                    <Skeleton className="h-16 w-full" />
                  </div>
                ) : (
                  <>
                    {/* Email engagement summary */}
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                      <div className="flex items-center gap-2 p-2 rounded-md bg-muted/50">
                        <Send className="h-3.5 w-3.5 text-blue-500" />
                        <div>
                          <div className="text-sm font-medium">{comms.summary.emailsSent}</div>
                          <div className="text-xs text-muted-foreground">Sent</div>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 p-2 rounded-md bg-muted/50">
                        <Eye className="h-3.5 w-3.5 text-green-500" />
                        <div>
                          <div className="text-sm font-medium">{comms.summary.emailsOpened}</div>
                          <div className="text-xs text-muted-foreground">Opened</div>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 p-2 rounded-md bg-muted/50">
                        <MousePointerClick className="h-3.5 w-3.5 text-purple-500" />
                        <div>
                          <div className="text-sm font-medium">{comms.summary.emailsClicked}</div>
                          <div className="text-xs text-muted-foreground">Clicked</div>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 p-2 rounded-md bg-muted/50">
                        <Activity className="h-3.5 w-3.5 text-orange-500" />
                        <div>
                          <div className="text-sm font-medium">{comms.summary.totalActivities}</div>
                          <div className="text-xs text-muted-foreground">Activities</div>
                        </div>
                      </div>
                    </div>

                    {/* Email actions from journey pipeline */}
                    {comms.emailActions.length > 0 && (
                      <div>
                        <div className="text-xs font-medium text-muted-foreground mb-2">
                          Pipeline Emails
                        </div>
                        <div className="space-y-2">
                          {comms.emailActions.map((action: any) => (
                            <Card key={action.id}>
                              <CardContent className="p-3">
                                <div className="flex items-start gap-2">
                                  <Mail className="h-3.5 w-3.5 mt-0.5 text-blue-500" />
                                  <div className="flex-1 min-w-0">
                                    <div className="flex items-center justify-between">
                                      <span className="text-sm font-medium">
                                        {action.title || "Email"}
                                      </span>
                                      <Badge
                                        variant={action.status === "completed" ? "default" : "outline"}
                                        className="text-xs"
                                      >
                                        {action.status}
                                      </Badge>
                                    </div>
                                    {action.description && (
                                      <p className="text-xs text-muted-foreground mt-1 line-clamp-2">
                                        {action.description}
                                      </p>
                                    )}
                                    <div className="text-xs text-muted-foreground mt-1">
                                      {action.completedAt
                                        ? new Date(action.completedAt).toLocaleString()
                                        : action.scheduledAt
                                          ? `Scheduled: ${new Date(action.scheduledAt).toLocaleString()}`
                                          : new Date(action.createdAt).toLocaleString()}
                                    </div>
                                  </div>
                                </div>
                              </CardContent>
                            </Card>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Campaign email sends */}
                    {comms.campaignEmails.length > 0 && (
                      <div>
                        <div className="text-xs font-medium text-muted-foreground mb-2">
                          Campaign Emails
                        </div>
                        <div className="space-y-2">
                          {comms.campaignEmails.map((email: any) => (
                            <Card key={email.id}>
                              <CardContent className="p-3">
                                <div className="flex items-center justify-between">
                                  <div className="flex items-center gap-2">
                                    <Send className="h-3.5 w-3.5 text-cyan-500" />
                                    <span className="text-sm">Campaign Email</span>
                                  </div>
                                  <Badge
                                    variant={email.status === "sent" ? "default" : "outline"}
                                    className="text-xs"
                                  >
                                    {email.status}
                                  </Badge>
                                </div>
                                <div className="text-xs text-muted-foreground mt-1">
                                  {email.sentAt
                                    ? new Date(email.sentAt).toLocaleString()
                                    : new Date(email.createdAt).toLocaleString()}
                                </div>
                              </CardContent>
                            </Card>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Email tracking events */}
                    {comms.emailTrackingEvents.length > 0 && (
                      <div>
                        <div className="text-xs font-medium text-muted-foreground mb-2">
                          Engagement Events
                        </div>
                        <div className="space-y-1">
                          {comms.emailTrackingEvents.map((event: any) => {
                            const iconMap: Record<string, typeof Eye> = {
                              opened: Eye,
                              clicked: MousePointerClick,
                              delivered: CheckCircle2,
                              bounced: XCircle,
                            };
                            const EventIcon = iconMap[event.type] || Activity;
                            return (
                              <div key={event.id} className="flex items-center gap-2 text-sm py-1">
                                <EventIcon className="h-3 w-3 text-muted-foreground" />
                                <span className="capitalize">{event.type}</span>
                                <span className="text-xs text-muted-foreground ml-auto">
                                  {new Date(event.createdAt).toLocaleString()}
                                </span>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}

                    {/* Activity history */}
                    {comms.activityHistory.length > 0 && (
                      <div>
                        <div className="text-xs font-medium text-muted-foreground mb-2">
                          Activity History
                        </div>
                        <div className="space-y-1">
                          {comms.activityHistory.map((activity: any) => (
                            <div key={activity.id} className="flex items-center gap-2 text-sm py-1 border-b border-muted/30 last:border-0">
                              <Clock className="h-3 w-3 text-muted-foreground" />
                              <span className="capitalize">
                                {activity.eventType.replace(/_/g, " ")}
                              </span>
                              <span className="text-xs text-muted-foreground ml-auto">
                                {new Date(activity.createdAt).toLocaleString()}
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {comms.summary.totalEmails === 0 && comms.summary.totalActivities === 0 && (
                      <div className="text-center py-8 text-sm text-muted-foreground">
                        No communications recorded yet.
                      </div>
                    )}
                  </>
                )}
              </TabsContent>

              {/* ─── Source Context Tab ─── */}
              <TabsContent value="context" className="space-y-3 mt-3">
                {lead.sourceDisposition && (
                  <div>
                    <div className="text-xs font-medium text-muted-foreground mb-1">
                      Source Disposition
                    </div>
                    <Badge variant="outline" className="capitalize">
                      {lead.sourceDisposition.replace(/_/g, " ")}
                    </Badge>
                  </div>
                )}

                {lead.sourceCallSummary && (
                  <div>
                    <div className="text-xs font-medium text-muted-foreground mb-1">
                      Call Summary
                    </div>
                    <Card>
                      <CardContent className="p-3 text-sm">
                        {lead.sourceCallSummary}
                      </CardContent>
                    </Card>
                  </div>
                )}

                {lead.sourceAiAnalysis && typeof lead.sourceAiAnalysis === "object" && (
                  <div>
                    <div className="text-xs font-medium text-muted-foreground mb-1">
                      AI Analysis
                    </div>
                    <Card>
                      <CardContent className="p-3 text-sm space-y-2">
                        {(lead.sourceAiAnalysis as any).keyTopicsDiscussed && (
                          <div>
                            <span className="font-medium">Topics: </span>
                            {Array.isArray((lead.sourceAiAnalysis as any).keyTopicsDiscussed)
                              ? (lead.sourceAiAnalysis as any).keyTopicsDiscussed.join(", ")
                              : String((lead.sourceAiAnalysis as any).keyTopicsDiscussed)}
                          </div>
                        )}
                        {(lead.sourceAiAnalysis as any).objections && (
                          <div>
                            <span className="font-medium">Objections: </span>
                            {Array.isArray((lead.sourceAiAnalysis as any).objections)
                              ? (lead.sourceAiAnalysis as any).objections.join(", ")
                              : String((lead.sourceAiAnalysis as any).objections)}
                          </div>
                        )}
                        {(lead.sourceAiAnalysis as any).interestLevel && (
                          <div>
                            <span className="font-medium">Interest: </span>
                            {(lead.sourceAiAnalysis as any).interestLevel}
                          </div>
                        )}
                        {(lead.sourceAiAnalysis as any).nextSteps && (
                          <div>
                            <span className="font-medium">Suggested Next Steps: </span>
                            {(lead.sourceAiAnalysis as any).nextSteps}
                          </div>
                        )}
                      </CardContent>
                    </Card>
                  </div>
                )}

                {/* AI Follow-Up Generation */}
                <div className="pt-2">
                  <div className="text-xs font-medium text-muted-foreground mb-2">
                    AI-Generated Follow-Up Context
                  </div>
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      variant="secondary"
                      className="gap-1"
                      onClick={() => generateFollowUp.mutate("callback")}
                      disabled={generateFollowUp.isPending}
                    >
                      {generateFollowUp.isPending ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <Phone className="h-3.5 w-3.5" />
                      )}
                      Generate Call Script
                    </Button>
                    <Button
                      size="sm"
                      variant="secondary"
                      className="gap-1"
                      onClick={() => generateFollowUp.mutate("email")}
                      disabled={generateFollowUp.isPending}
                    >
                      {generateFollowUp.isPending ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <Mail className="h-3.5 w-3.5" />
                      )}
                      Generate Email Draft
                    </Button>
                  </div>
                </div>

                {/* AI Generated Content */}
                {generateFollowUp.data?.success && generateFollowUp.data.type === "callback" && (
                  <Card className="border-primary/30">
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm flex items-center gap-2">
                        <Sparkles className="h-4 w-4 text-primary" />
                        AI Call Script
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-3 text-sm">
                      <div>
                        <div className="font-medium mb-1">Opening Line</div>
                        <p className="text-muted-foreground italic">
                          "{generateFollowUp.data.context.openingLine}"
                        </p>
                      </div>
                      <div>
                        <div className="font-medium mb-1">Talking Points</div>
                        <ul className="list-disc pl-4 space-y-1 text-muted-foreground">
                          {generateFollowUp.data.context.talkingPoints?.map(
                            (tp: string, i: number) => (
                              <li key={i}>{tp}</li>
                            )
                          )}
                        </ul>
                      </div>
                      {generateFollowUp.data.context.objectionResponses?.length > 0 && (
                        <div>
                          <div className="font-medium mb-1">Objection Responses</div>
                          {generateFollowUp.data.context.objectionResponses.map(
                            (or: any, i: number) => (
                              <div key={i} className="mb-2">
                                <div className="text-xs font-medium">"{or.objection}"</div>
                                <div className="text-xs text-muted-foreground pl-2">
                                  {or.response}
                                </div>
                              </div>
                            )
                          )}
                        </div>
                      )}
                      <div>
                        <div className="font-medium mb-1">Approach</div>
                        <p className="text-muted-foreground">
                          {generateFollowUp.data.context.recommendedApproach}
                        </p>
                      </div>
                    </CardContent>
                  </Card>
                )}

                {generateFollowUp.data?.success && generateFollowUp.data.type === "email" && (
                  <Card className="border-primary/30">
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm flex items-center gap-2">
                        <Sparkles className="h-4 w-4 text-primary" />
                        AI Email Draft
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-2 text-sm">
                      <div>
                        <div className="font-medium">Subject</div>
                        <p className="text-muted-foreground">
                          {generateFollowUp.data.email.subject}
                        </p>
                      </div>
                      <Separator />
                      <div
                        className="text-muted-foreground prose prose-sm max-w-none"
                        dangerouslySetInnerHTML={{
                          __html: generateFollowUp.data.email.bodyHtml,
                        }}
                      />
                    </CardContent>
                  </Card>
                )}

                {generateFollowUp.isError && (
                  <div className="text-sm text-destructive">
                    Failed to generate follow-up content. Please try again.
                  </div>
                )}
              </TabsContent>

              {/* ─── Notes Tab ─── */}
              <TabsContent value="notes" className="space-y-3 mt-3">
                <Textarea
                  value={notes}
                  onChange={(e) => {
                    setNotes(e.target.value);
                    setNotesEdited(true);
                  }}
                  placeholder="Add notes about this lead..."
                  className="min-h-[120px]"
                />
                {notesEdited && (
                  <Button
                    size="sm"
                    onClick={() => {
                      updateLead.mutate({ notes });
                      setNotesEdited(false);
                    }}
                    disabled={updateLead.isPending}
                  >
                    Save Notes
                  </Button>
                )}
              </TabsContent>
            </Tabs>

            {/* Status controls */}
            <Separator className="my-3" />
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground">Status:</span>
              {(["active", "paused", "completed", "lost"] as const).map((status) => (
                <Button
                  key={status}
                  size="sm"
                  variant={lead.status === status ? "default" : "outline"}
                  className="h-7 text-xs capitalize"
                  onClick={() => updateLead.mutate({ status })}
                >
                  {status}
                </Button>
              ))}
            </div>
          </>
        )}

        {/* Schedule Action Dialog */}
        <ScheduleActionDialog
          open={showSchedule}
          onOpenChange={setShowSchedule}
          leadId={leadId}
          actionType={scheduleType}
          authHeaders={authHeaders}
          onCreated={() => {
            queryClient.invalidateQueries({ queryKey: ["journey-lead-detail", leadId] });
            queryClient.invalidateQueries({ queryKey: ["journey-pipeline-leads"] });
            setShowSchedule(false);
          }}
        />
      </SheetContent>
    </Sheet>
  );
}

// ─── Action Timeline Item ───

const CALLBACK_DISPOSITIONS = [
  { value: "connected", label: "Connected - Spoke with contact" },
  { value: "voicemail", label: "Left voicemail" },
  { value: "no_answer", label: "No answer" },
  { value: "busy", label: "Line busy" },
  { value: "meeting_set", label: "Meeting scheduled" },
  { value: "not_interested", label: "Not interested" },
  { value: "wrong_number", label: "Wrong number" },
  { value: "callback_requested", label: "Callback requested" },
];

const EMAIL_DISPOSITIONS = [
  { value: "sent", label: "Email sent" },
  { value: "replied", label: "Got reply" },
  { value: "bounced", label: "Bounced" },
  { value: "no_response", label: "No response yet" },
];

function ActionTimelineItem({
  action,
  onComplete,
  onSkip,
}: {
  action: JourneyAction;
  onComplete: (outcome: string, resultDisposition?: string, executionMethod?: string) => void;
  onSkip: () => void;
}) {
  const [showOutcome, setShowOutcome] = useState(false);
  const [outcome, setOutcome] = useState("");
  const [disposition, setDisposition] = useState("");

  const isOverdue =
    action.status === "scheduled" &&
    action.scheduledAt &&
    new Date(action.scheduledAt) < new Date();

  const iconMap: Record<string, any> = {
    callback: Phone,
    email: Mail,
    sms: MessageSquare,
    note: StickyNote,
    stage_change: ArrowRight,
  };

  const statusIconMap: Record<string, any> = {
    completed: CheckCircle2,
    skipped: SkipForward,
    failed: XCircle,
    scheduled: Clock,
    in_progress: Clock,
  };

  const ActionIcon = iconMap[action.actionType] || FileText;
  const StatusIcon = statusIconMap[action.status] || Clock;

  const dispositionOptions = action.actionType === "callback"
    ? CALLBACK_DISPOSITIONS
    : action.actionType === "email"
      ? EMAIL_DISPOSITIONS
      : null;

  // Compute response time if executed
  const responseTimeLabel = action.scheduledAt && action.executedAt
    ? (() => {
        const hrs = Math.round((new Date(action.executedAt).getTime() - new Date(action.scheduledAt).getTime()) / (1000 * 60 * 60));
        return hrs < 1 ? "<1h" : hrs < 24 ? `${hrs}h` : `${Math.round(hrs / 24)}d`;
      })()
    : null;

  return (
    <Card className={isOverdue ? "border-destructive/50" : ""}>
      <CardContent className="p-3">
        <div className="flex items-start gap-3">
          <div
            className={`mt-0.5 p-1.5 rounded-full ${
              action.status === "completed"
                ? "bg-green-100 text-green-600"
                : action.status === "skipped"
                  ? "bg-gray-100 text-gray-400"
                  : isOverdue
                    ? "bg-destructive/10 text-destructive"
                    : "bg-primary/10 text-primary"
            }`}
          >
            <ActionIcon className="h-3.5 w-3.5" />
          </div>

          <div className="flex-1 min-w-0 space-y-1">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-medium text-sm capitalize">{action.actionType}</span>
                <Badge
                  variant={
                    action.status === "completed"
                      ? "default"
                      : action.status === "skipped"
                        ? "secondary"
                        : "outline"
                  }
                  className="text-xs"
                >
                  <StatusIcon className="h-3 w-3 mr-1" />
                  {action.status}
                </Badge>
                {isOverdue && (
                  <Badge variant="destructive" className="text-xs gap-1">
                    <AlertTriangle className="h-3 w-3" />
                    Overdue
                  </Badge>
                )}
                {/* Execution method badge */}
                {action.executionMethod && (
                  <Badge variant="outline" className="text-xs">
                    {action.executionMethod === "automated" ? "Auto" : "Manual"}
                  </Badge>
                )}
                {/* Verified badge */}
                {action.linkedEntityId && (
                  <Badge variant="secondary" className="text-xs gap-1 bg-green-50 text-green-700 border-green-200">
                    <CheckCircle2 className="h-3 w-3" />
                    Verified
                  </Badge>
                )}
              </div>
              <div className="flex items-center gap-2">
                {responseTimeLabel && (
                  <span className="text-xs text-muted-foreground" title="Response time (scheduled → executed)">
                    {responseTimeLabel}
                  </span>
                )}
                <span className="text-xs text-muted-foreground">
                  {action.scheduledAt
                    ? new Date(action.scheduledAt).toLocaleDateString()
                    : new Date(action.createdAt).toLocaleDateString()}
                </span>
              </div>
            </div>

            {action.title && <div className="text-sm">{action.title}</div>}
            {action.description && (
              <div className="text-sm text-muted-foreground">{action.description}</div>
            )}
            {action.outcome && (
              <div className="text-sm">
                <span className="font-medium">Outcome: </span>
                {action.outcome}
              </div>
            )}
            {action.resultDisposition && (
              <div className="text-sm">
                <span className="font-medium">Disposition: </span>
                <span className="capitalize">{action.resultDisposition.replace(/_/g, " ")}</span>
              </div>
            )}

            {/* Execution timestamps for completed actions */}
            {action.status === "completed" && action.executedAt && (
              <div className="text-xs text-muted-foreground">
                Executed: {new Date(action.executedAt).toLocaleString()}
                {action.completedAt && action.executedAt !== action.completedAt && (
                  <> &middot; Completed: {new Date(action.completedAt).toLocaleString()}</>
                )}
              </div>
            )}

            {/* AI Context badge */}
            {action.aiGeneratedContext && (
              <Badge variant="secondary" className="text-xs gap-1">
                <Sparkles className="h-3 w-3" />
                AI-assisted
              </Badge>
            )}

            {/* Action buttons for scheduled items */}
            {action.status === "scheduled" && (
              <div className="flex flex-col gap-2 pt-1">
                {!showOutcome ? (
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-7 text-xs gap-1"
                      onClick={() => setShowOutcome(true)}
                    >
                      <CheckCircle2 className="h-3 w-3" />
                      Complete
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-7 text-xs gap-1 text-muted-foreground"
                      onClick={onSkip}
                    >
                      <SkipForward className="h-3 w-3" />
                      Skip
                    </Button>
                  </div>
                ) : (
                  <div className="space-y-2 border rounded-md p-2 bg-muted/30">
                    {/* Disposition selector for callbacks/emails */}
                    {dispositionOptions && (
                      <Select value={disposition} onValueChange={setDisposition}>
                        <SelectTrigger className="h-7 text-xs">
                          <SelectValue placeholder="Select disposition..." />
                        </SelectTrigger>
                        <SelectContent>
                          {dispositionOptions.map((d) => (
                            <SelectItem key={d.value} value={d.value} className="text-xs">
                              {d.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    )}
                    <input
                      type="text"
                      value={outcome}
                      onChange={(e) => setOutcome(e.target.value)}
                      placeholder="Notes (e.g. Discussed pricing, will follow up Thursday)"
                      className="w-full h-7 text-xs border rounded px-2"
                    />
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        className="h-7 text-xs"
                        onClick={() => {
                          const outcomeText = disposition
                            ? `${disposition.replace(/_/g, " ")}${outcome ? ` - ${outcome}` : ""}`
                            : outcome || "Completed";
                          onComplete(outcomeText, disposition || undefined, "manual");
                          setShowOutcome(false);
                          setOutcome("");
                          setDisposition("");
                        }}
                      >
                        Save
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-7 text-xs"
                        onClick={() => {
                          setShowOutcome(false);
                          setOutcome("");
                          setDisposition("");
                        }}
                      >
                        Cancel
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
