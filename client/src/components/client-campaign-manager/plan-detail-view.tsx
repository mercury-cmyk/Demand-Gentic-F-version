import { useState } from "react";
import {
  ArrowLeft,
  CheckCircle2,
  Phone,
  Mail,
  MessageSquareText,
  TrendingUp,
  Target,
  Users,
  Clock,
  BarChart3,
  DollarSign,
  Lightbulb,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Separator } from "@/components/ui/separator";
import { FunnelVisualization } from "./funnel-visualization";
import type { CampaignPlanOutput } from "../../../../server/services/ai-campaign-planner";

interface PlanDetailViewProps {
  plan: CampaignPlanOutput;
  planMeta: {
    id: string;
    status: string;
    createdAt: string;
    approvedAt: string | null;
  };
  onBack: () => void;
  onApprove: () => void;
  isApproving?: boolean;
}

function ChannelIcon({ channel }: { channel: string }) {
  switch (channel) {
    case 'voice': return <Phone size={16} />;
    case 'email': return <Mail size={16} />;
    case 'messaging': return <MessageSquareText size={16} />;
    default: return null;
  }
}

function ExpandableCard({ title, icon, children, defaultOpen = false }: {
  title: string;
  icon: React.ReactNode;
  children: React.ReactNode;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <Card>
      <button
        onClick={() => setOpen(!open)}
        className="w-full px-6 py-4 flex items-center justify-between hover:bg-accent/30 transition-colors rounded-t-lg"
      >
        <div className="flex items-center gap-2">
          {icon}
          <span className="font-semibold">{title}</span>
        </div>
        {open ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
      </button>
      {open && <CardContent className="pt-0">{children}</CardContent>}
    </Card>
  );
}

export function PlanDetailView({ plan, planMeta, onBack, onApprove, isApproving }: PlanDetailViewProps) {
  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between flex-wrap gap-4">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="sm" onClick={onBack}>
            <ArrowLeft size={16} className="mr-1" /> Back
          </Button>
          <div>
            <h2 className="text-2xl font-bold">{plan.planName}</h2>
            <div className="flex items-center gap-2 mt-1">
              <Badge variant={planMeta.status === 'approved' ? 'default' : 'secondary'}>
                {planMeta.status}
              </Badge>
              <span className="text-xs text-muted-foreground">
                Created {new Date(planMeta.createdAt).toLocaleDateString()}
              </span>
              {planMeta.approvedAt && (
                <span className="text-xs text-green-600 flex items-center gap-1">
                  <CheckCircle2 size={12} /> Approved {new Date(planMeta.approvedAt).toLocaleDateString()}
                </span>
              )}
            </div>
          </div>
        </div>
        {planMeta.status === 'generated' && (
          <Button onClick={onApprove} disabled={isApproving} className="bg-green-600 hover:bg-green-700">
            <CheckCircle2 size={16} className="mr-2" />
            {isApproving ? 'Approving...' : 'Approve Plan'}
          </Button>
        )}
      </div>

      {/* Tabs */}
      <Tabs defaultValue="overview" className="w-full">
        <TabsList className="grid w-full grid-cols-6 lg:grid-cols-6">
          <TabsTrigger value="overview" className="text-xs">Overview</TabsTrigger>
          <TabsTrigger value="funnel" className="text-xs">Funnel</TabsTrigger>
          <TabsTrigger value="channels" className="text-xs">Channels</TabsTrigger>
          <TabsTrigger value="personas" className="text-xs">Personas</TabsTrigger>
          <TabsTrigger value="timeline" className="text-xs">Timeline</TabsTrigger>
          <TabsTrigger value="results" className="text-xs">Results</TabsTrigger>
        </TabsList>

        {/* ─── Overview Tab ─── */}
        <TabsContent value="overview" className="space-y-6 mt-4">
          {/* Executive Summary */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <Target size={18} /> Executive Summary
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground whitespace-pre-line leading-relaxed">
                {plan.executiveSummary}
              </p>
            </CardContent>
          </Card>

          {/* Campaign Strategy */}
          {plan.campaignStrategy && (
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Campaign Strategy</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div>
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1">Positioning</p>
                  <p className="text-sm">{plan.campaignStrategy.positioning}</p>
                </div>
                <div>
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1">Core Narrative</p>
                  <p className="text-sm">{plan.campaignStrategy.coreNarrative}</p>
                </div>
                <div>
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1">Target Market</p>
                  <p className="text-sm">{plan.campaignStrategy.targetMarketSummary}</p>
                </div>
                {plan.campaignStrategy.differentiators?.length > 0 && (
                  <div>
                    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1">Differentiators</p>
                    <div className="flex flex-wrap gap-1.5">
                      {plan.campaignStrategy.differentiators.map((d, i) => (
                        <Badge key={i} variant="outline">{d}</Badge>
                      ))}
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {/* Funnel Preview */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <TrendingUp size={18} /> Full-Funnel Overview
              </CardTitle>
            </CardHeader>
            <CardContent>
              <FunnelVisualization funnelStrategy={plan.funnelStrategy} compact />
            </CardContent>
          </Card>

          {/* Estimated Results Summary */}
          {plan.estimatedResults && (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <Card className="p-4 text-center">
                <p className="text-xs text-muted-foreground">Total Leads</p>
                <p className="text-xl font-bold">{plan.estimatedResults.totalLeadVolume}</p>
              </Card>
              <Card className="p-4 text-center">
                <p className="text-xs text-muted-foreground">Qualified (SQL)</p>
                <p className="text-xl font-bold text-orange-600">{plan.estimatedResults.qualifiedLeads}</p>
              </Card>
              <Card className="p-4 text-center">
                <p className="text-xs text-muted-foreground">Appointments</p>
                <p className="text-xl font-bold text-purple-600">{plan.estimatedResults.expectedAppointments}</p>
              </Card>
              <Card className="p-4 text-center">
                <p className="text-xs text-muted-foreground">Closed / Won</p>
                <p className="text-xl font-bold text-green-600">{plan.estimatedResults.estimatedClosedWon}</p>
              </Card>
            </div>
          )}
        </TabsContent>

        {/* ─── Funnel Strategy Tab ─── */}
        <TabsContent value="funnel" className="space-y-4 mt-4">
          <FunnelVisualization funnelStrategy={plan.funnelStrategy} />
          <Separator />
          {plan.funnelStrategy?.map((stage, idx) => (
            <ExpandableCard
              key={stage.stage}
              title={`${idx + 1}. ${stage.stageLabel}`}
              icon={<TrendingUp size={16} />}
              defaultOpen={idx === 0}
            >
              <div className="space-y-4">
                <p className="text-sm text-muted-foreground">{stage.objective}</p>

                <div className="grid md:grid-cols-3 gap-3">
                  <div>
                    <p className="text-xs font-semibold text-muted-foreground mb-1">Volume</p>
                    <p className="text-sm font-medium">{stage.estimatedVolumeAtStage}</p>
                  </div>
                  <div>
                    <p className="text-xs font-semibold text-muted-foreground mb-1">Conversion</p>
                    <p className="text-sm font-medium">{stage.estimatedConversionRate}</p>
                  </div>
                  <div>
                    <p className="text-xs font-semibold text-muted-foreground mb-1">Duration</p>
                    <p className="text-sm font-medium">~{stage.durationDays} days</p>
                  </div>
                </div>

                <div>
                  <p className="text-xs font-semibold text-muted-foreground mb-1">Channels</p>
                  <div className="flex flex-wrap gap-1.5">
                    {stage.primaryChannels?.map((ch) => (
                      <Badge key={ch} className="gap-1">
                        <ChannelIcon channel={ch} /> {ch} (primary)
                      </Badge>
                    ))}
                    {stage.secondaryChannels?.map((ch) => (
                      <Badge key={ch} variant="outline" className="gap-1">
                        <ChannelIcon channel={ch} /> {ch} (secondary)
                      </Badge>
                    ))}
                  </div>
                </div>

                {stage.messagingTheme && (
                  <div>
                    <p className="text-xs font-semibold text-muted-foreground mb-1">Messaging Theme</p>
                    <p className="text-sm italic">{stage.messagingTheme}</p>
                  </div>
                )}

                {stage.tactics?.length > 0 && (
                  <div>
                    <p className="text-xs font-semibold text-muted-foreground mb-1">Tactics</p>
                    <ul className="list-disc list-inside text-sm space-y-0.5">
                      {stage.tactics.map((t, i) => <li key={i}>{t}</li>)}
                    </ul>
                  </div>
                )}

                {stage.kpis?.length > 0 && (
                  <div>
                    <p className="text-xs font-semibold text-muted-foreground mb-1">KPIs</p>
                    <div className="grid grid-cols-2 gap-2">
                      {stage.kpis.map((kpi, i) => (
                        <div key={i} className="bg-muted/50 rounded px-2 py-1.5">
                          <p className="text-xs text-muted-foreground">{kpi.metric}</p>
                          <p className="text-sm font-medium">{kpi.target}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {stage.automationTriggers?.length > 0 && (
                  <div>
                    <p className="text-xs font-semibold text-muted-foreground mb-1">Stage Advancement Triggers</p>
                    <ul className="list-disc list-inside text-sm space-y-0.5">
                      {stage.automationTriggers.map((t, i) => <li key={i}>{t}</li>)}
                    </ul>
                  </div>
                )}
              </div>
            </ExpandableCard>
          ))}
        </TabsContent>

        {/* ─── Channel Strategies Tab ─── */}
        <TabsContent value="channels" className="space-y-4 mt-4">
          {plan.channelStrategies?.map((cs) => (
            <Card key={cs.channel}>
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <ChannelIcon channel={cs.channel} />
                  {cs.channel.charAt(0).toUpperCase() + cs.channel.slice(1)} Strategy
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <p className="text-sm">{cs.overallRole}</p>

                <div className="grid md:grid-cols-2 gap-3">
                  <div>
                    <p className="text-xs font-semibold text-muted-foreground mb-1">Cadence</p>
                    <p className="text-sm">{cs.cadence}</p>
                  </div>
                  <div>
                    <p className="text-xs font-semibold text-muted-foreground mb-1">Personalization</p>
                    <p className="text-sm">{cs.personalization}</p>
                  </div>
                </div>

                {cs.funnelStageUsage?.length > 0 && (
                  <div>
                    <p className="text-xs font-semibold text-muted-foreground mb-2">Per-Stage Usage</p>
                    <div className="space-y-3">
                      {cs.funnelStageUsage.map((su, i) => (
                        <div key={i} className="bg-muted/30 rounded-lg p-3">
                          <p className="text-sm font-medium mb-1">{su.stage}</p>
                          <p className="text-xs text-muted-foreground mb-2">{su.approach}</p>
                          {su.sequenceOutline?.length > 0 && (
                            <ol className="list-decimal list-inside text-xs space-y-0.5 ml-2">
                              {su.sequenceOutline.map((step, j) => <li key={j}>{step}</li>)}
                            </ol>
                          )}
                          {su.messageTemplateGuidance && (
                            <p className="text-xs italic mt-1 text-muted-foreground">{su.messageTemplateGuidance}</p>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {cs.complianceNotes && (
                  <div className="bg-yellow-50 dark:bg-yellow-950/30 border border-yellow-200 dark:border-yellow-800 rounded-lg p-3">
                    <p className="text-xs font-semibold text-yellow-700 dark:text-yellow-400 mb-1">Compliance Notes</p>
                    <p className="text-xs text-yellow-600 dark:text-yellow-500">{cs.complianceNotes}</p>
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </TabsContent>

        {/* ─── Persona Playbooks Tab ─── */}
        <TabsContent value="personas" className="space-y-4 mt-4">
          {plan.personaStrategies?.map((ps, idx) => (
            <Card key={idx}>
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <Users size={18} />
                  {ps.personaTitle}
                  <Badge variant="outline" className="ml-2 gap-1">
                    <ChannelIcon channel={ps.preferredChannel} /> {ps.preferredChannel}
                  </Badge>
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <p className="text-sm">{ps.messagingAngle}</p>

                {ps.painPoints?.length > 0 && (
                  <div>
                    <p className="text-xs font-semibold text-muted-foreground mb-1">Pain Points</p>
                    <div className="flex flex-wrap gap-1.5">
                      {ps.painPoints.map((pp, i) => (
                        <Badge key={i} variant="destructive" className="text-xs">{pp}</Badge>
                      ))}
                    </div>
                  </div>
                )}

                {/* Call Script */}
                {ps.callScript && (
                  <ExpandableCard
                    title="Voice Call Script"
                    icon={<Phone size={14} />}
                    defaultOpen={false}
                  >
                    <div className="space-y-3">
                      <div>
                        <p className="text-xs font-semibold text-muted-foreground">Opener</p>
                        <p className="text-sm bg-blue-50 dark:bg-blue-950/30 rounded p-2 mt-1 italic">"{ps.callScript.opener}"</p>
                      </div>
                      {ps.callScript.discoveryQuestions?.length > 0 && (
                        <div>
                          <p className="text-xs font-semibold text-muted-foreground mb-1">Discovery Questions</p>
                          <ol className="list-decimal list-inside text-sm space-y-0.5">
                            {ps.callScript.discoveryQuestions.map((q, i) => <li key={i}>{q}</li>)}
                          </ol>
                        </div>
                      )}
                      <div>
                        <p className="text-xs font-semibold text-muted-foreground">Value Statement</p>
                        <p className="text-sm mt-1">{ps.callScript.valueStatement}</p>
                      </div>
                      {ps.callScript.objectionHandlers?.length > 0 && (
                        <div>
                          <p className="text-xs font-semibold text-muted-foreground mb-1">Objection Handlers</p>
                          <div className="space-y-2">
                            {ps.callScript.objectionHandlers.map((oh, i) => (
                              <div key={i} className="bg-muted/30 rounded p-2">
                                <p className="text-xs font-medium text-red-600">"{ oh.objection}"</p>
                                <p className="text-xs mt-0.5">{oh.response}</p>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                      <div>
                        <p className="text-xs font-semibold text-muted-foreground">Close Attempt</p>
                        <p className="text-sm mt-1 italic">"{ps.callScript.closeAttempt}"</p>
                      </div>
                    </div>
                  </ExpandableCard>
                )}

                {/* Email Sequence */}
                {ps.emailSequence?.length > 0 && (
                  <ExpandableCard
                    title={`Email Sequence (${ps.emailSequence.length} emails)`}
                    icon={<Mail size={14} />}
                    defaultOpen={false}
                  >
                    <div className="space-y-3">
                      {ps.emailSequence.map((email, i) => (
                        <div key={i} className="bg-muted/30 rounded-lg p-3">
                          <div className="flex items-center gap-2 mb-1">
                            <Badge variant="outline" className="text-[10px]">Email {i + 1}</Badge>
                            <p className="text-sm font-medium">{email.subject}</p>
                          </div>
                          <p className="text-xs text-muted-foreground">{email.previewText}</p>
                          <p className="text-xs mt-1">{email.bodyTheme}</p>
                          <p className="text-xs font-medium mt-1 text-primary">CTA: {email.cta}</p>
                        </div>
                      ))}
                    </div>
                  </ExpandableCard>
                )}
              </CardContent>
            </Card>
          ))}
        </TabsContent>

        {/* ─── Timeline & KPIs Tab ─── */}
        <TabsContent value="timeline" className="space-y-6 mt-4">
          {/* Timeline */}
          {plan.timeline && (
            <Card>
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <Clock size={18} />
                  Campaign Timeline ({plan.timeline.totalDurationWeeks} weeks)
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {plan.timeline.phases?.map((phase, idx) => (
                    <div key={idx} className="relative pl-8 pb-4">
                      {/* Timeline line */}
                      {idx < (plan.timeline.phases?.length || 0) - 1 && (
                        <div className="absolute left-3 top-6 w-0.5 h-full bg-border" />
                      )}
                      {/* Timeline dot */}
                      <div className="absolute left-1.5 top-1.5 w-3 h-3 rounded-full bg-primary border-2 border-background" />
                      <div>
                        <div className="flex items-center gap-2 mb-1">
                          <h4 className="font-semibold text-sm">{phase.phaseName}</h4>
                          <Badge variant="outline" className="text-[10px]">{phase.weekRange}</Badge>
                        </div>
                        <ul className="list-disc list-inside text-xs text-muted-foreground space-y-0.5 mb-1">
                          {phase.activities?.map((a, i) => <li key={i}>{a}</li>)}
                        </ul>
                        <p className="text-xs font-medium text-green-600">Milestone: {phase.milestone}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {/* KPI Framework */}
          {plan.kpiFramework && (
            <Card>
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <BarChart3 size={18} /> KPI Framework
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {plan.kpiFramework.primaryKpis?.length > 0 && (
                  <div>
                    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Primary KPIs</p>
                    <div className="grid md:grid-cols-2 gap-2">
                      {plan.kpiFramework.primaryKpis.map((kpi, i) => (
                        <div key={i} className="bg-primary/5 border border-primary/20 rounded-lg p-3">
                          <p className="text-sm font-medium">{kpi.metric}</p>
                          <p className="text-lg font-bold text-primary">{kpi.target}</p>
                          <p className="text-xs text-muted-foreground">{kpi.measurementMethod}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                {plan.kpiFramework.secondaryKpis?.length > 0 && (
                  <div>
                    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Secondary KPIs</p>
                    <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                      {plan.kpiFramework.secondaryKpis.map((kpi, i) => (
                        <div key={i} className="bg-muted/50 rounded p-2">
                          <p className="text-xs text-muted-foreground">{kpi.metric}</p>
                          <p className="text-sm font-medium">{kpi.target}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* ─── Results & Budget Tab ─── */}
        <TabsContent value="results" className="space-y-6 mt-4">
          {/* Estimated Results */}
          {plan.estimatedResults && (
            <Card>
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <TrendingUp size={18} /> Estimated Results
                  <Badge variant={
                    plan.estimatedResults.confidenceLevel === 'high' ? 'default' :
                    plan.estimatedResults.confidenceLevel === 'medium' ? 'secondary' : 'outline'
                  }>
                    {plan.estimatedResults.confidenceLevel} confidence
                  </Badge>
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                  <div className="text-center p-3 bg-blue-50 dark:bg-blue-950/30 rounded-lg">
                    <p className="text-xs text-muted-foreground">Total Leads</p>
                    <p className="text-xl font-bold text-blue-600">{plan.estimatedResults.totalLeadVolume}</p>
                  </div>
                  <div className="text-center p-3 bg-orange-50 dark:bg-orange-950/30 rounded-lg">
                    <p className="text-xs text-muted-foreground">Qualified</p>
                    <p className="text-xl font-bold text-orange-600">{plan.estimatedResults.qualifiedLeads}</p>
                  </div>
                  <div className="text-center p-3 bg-purple-50 dark:bg-purple-950/30 rounded-lg">
                    <p className="text-xs text-muted-foreground">Appointments</p>
                    <p className="text-xl font-bold text-purple-600">{plan.estimatedResults.expectedAppointments}</p>
                  </div>
                  <div className="text-center p-3 bg-green-50 dark:bg-green-950/30 rounded-lg">
                    <p className="text-xs text-muted-foreground">Closed/Won</p>
                    <p className="text-xl font-bold text-green-600">{plan.estimatedResults.estimatedClosedWon}</p>
                  </div>
                  <div className="text-center p-3 bg-muted/50 rounded-lg">
                    <p className="text-xs text-muted-foreground">First Results</p>
                    <p className="text-lg font-bold">{plan.estimatedResults.timeToFirstResults}</p>
                  </div>
                </div>

                {plan.estimatedResults.assumptions?.length > 0 && (
                  <div>
                    <p className="text-xs font-semibold text-muted-foreground mb-1">Assumptions</p>
                    <ul className="list-disc list-inside text-xs text-muted-foreground space-y-0.5">
                      {plan.estimatedResults.assumptions.map((a, i) => <li key={i}>{a}</li>)}
                    </ul>
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {/* Budget Guidance */}
          {plan.budgetGuidance && (
            <Card>
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <DollarSign size={18} /> Budget Guidance
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="bg-muted/50 rounded-lg p-4 text-center">
                  <p className="text-xs text-muted-foreground">Estimated Budget Range</p>
                  <p className="text-2xl font-bold">{plan.budgetGuidance.estimatedRange}</p>
                </div>

                {plan.budgetGuidance.allocationByChannel?.length > 0 && (
                  <div>
                    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Channel Allocation</p>
                    <div className="space-y-2">
                      {plan.budgetGuidance.allocationByChannel.map((alloc, i) => (
                        <div key={i} className="flex items-center gap-3">
                          <div className="w-24 text-sm font-medium capitalize">{alloc.channel}</div>
                          <div className="flex-1">
                            <div className="h-6 bg-muted rounded-full overflow-hidden">
                              <div
                                className="h-full bg-gradient-to-r from-primary to-primary/70 rounded-full flex items-center justify-end pr-2"
                                style={{ width: `${Math.min(alloc.percentAllocation, 100)}%` }}
                              >
                                <span className="text-[10px] font-bold text-primary-foreground">{alloc.percentAllocation}%</span>
                              </div>
                            </div>
                          </div>
                          <p className="text-xs text-muted-foreground w-40 hidden lg:block">{alloc.rationale}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {/* Learning Integration */}
          {plan.learningIntegration && (
            <Card>
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <Lightbulb size={18} /> Learning Integration
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {plan.learningIntegration.appliedInsights?.length > 0 && (
                  <div>
                    <p className="text-xs font-semibold text-green-600 mb-1">Applied Insights</p>
                    <ul className="list-disc list-inside text-sm space-y-0.5">
                      {plan.learningIntegration.appliedInsights.map((a, i) => <li key={i}>{a}</li>)}
                    </ul>
                  </div>
                )}
                {plan.learningIntegration.risksIdentified?.length > 0 && (
                  <div>
                    <p className="text-xs font-semibold text-amber-600 mb-1">Risks Identified</p>
                    <ul className="list-disc list-inside text-sm space-y-0.5">
                      {plan.learningIntegration.risksIdentified.map((r, i) => <li key={i}>{r}</li>)}
                    </ul>
                  </div>
                )}
                {plan.learningIntegration.mitigationStrategies?.length > 0 && (
                  <div>
                    <p className="text-xs font-semibold text-blue-600 mb-1">Mitigation Strategies</p>
                    <ul className="list-disc list-inside text-sm space-y-0.5">
                      {plan.learningIntegration.mitigationStrategies.map((m, i) => <li key={i}>{m}</li>)}
                    </ul>
                  </div>
                )}
              </CardContent>
            </Card>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
