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
    case 'voice': return ;
    case 'email': return ;
    case 'messaging': return ;
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
    
       setOpen(!open)}
        className="w-full px-6 py-4 flex items-center justify-between hover:bg-accent/30 transition-colors rounded-t-lg"
      >
        
          {icon}
          {title}
        
        {open ?  : }
      
      {open && {children}}
    
  );
}

export function PlanDetailView({ plan, planMeta, onBack, onApprove, isApproving }: PlanDetailViewProps) {
  return (
    
      {/* Header */}
      
        
          
             Back
          
          
            {plan.planName}
            
              
                {planMeta.status}
              
              
                Created {new Date(planMeta.createdAt).toLocaleDateString()}
              
              {planMeta.approvedAt && (
                
                   Approved {new Date(planMeta.approvedAt).toLocaleDateString()}
                
              )}
            
          
        
        {planMeta.status === 'generated' && (
          
            
            {isApproving ? 'Approving...' : 'Approve Plan'}
          
        )}
      

      {/* Tabs */}
      
        
          Overview
          Funnel
          Channels
          Personas
          Timeline
          Results
        

        {/* ─── Overview Tab ─── */}
        
          {/* Executive Summary */}
          
            
              
                 Executive Summary
              
            
            
              
                {plan.executiveSummary}
              
            
          

          {/* Campaign Strategy */}
          {plan.campaignStrategy && (
            
              
                Campaign Strategy
              
              
                
                  Positioning
                  {plan.campaignStrategy.positioning}
                
                
                  Core Narrative
                  {plan.campaignStrategy.coreNarrative}
                
                
                  Target Market
                  {plan.campaignStrategy.targetMarketSummary}
                
                {plan.campaignStrategy.differentiators?.length > 0 && (
                  
                    Differentiators
                    
                      {plan.campaignStrategy.differentiators.map((d, i) => (
                        {d}
                      ))}
                    
                  
                )}
              
            
          )}

          {/* Funnel Preview */}
          
            
              
                 Full-Funnel Overview
              
            
            
              
            
          

          {/* Estimated Results Summary */}
          {plan.estimatedResults && (
            
              
                Total Leads
                {plan.estimatedResults.totalLeadVolume}
              
              
                Qualified (SQL)
                {plan.estimatedResults.qualifiedLeads}
              
              
                Appointments
                {plan.estimatedResults.expectedAppointments}
              
              
                Closed / Won
                {plan.estimatedResults.estimatedClosedWon}
              
            
          )}
        

        {/* ─── Funnel Strategy Tab ─── */}
        
          
          
          {plan.funnelStrategy?.map((stage, idx) => (
            }
              defaultOpen={idx === 0}
            >
              
                {stage.objective}

                
                  
                    Volume
                    {stage.estimatedVolumeAtStage}
                  
                  
                    Conversion
                    {stage.estimatedConversionRate}
                  
                  
                    Duration
                    ~{stage.durationDays} days
                  
                

                
                  Channels
                  
                    {stage.primaryChannels?.map((ch) => (
                      
                         {ch} (primary)
                      
                    ))}
                    {stage.secondaryChannels?.map((ch) => (
                      
                         {ch} (secondary)
                      
                    ))}
                  
                

                {stage.messagingTheme && (
                  
                    Messaging Theme
                    {stage.messagingTheme}
                  
                )}

                {stage.tactics?.length > 0 && (
                  
                    Tactics
                    
                      {stage.tactics.map((t, i) => {t})}
                    
                  
                )}

                {stage.kpis?.length > 0 && (
                  
                    KPIs
                    
                      {stage.kpis.map((kpi, i) => (
                        
                          {kpi.metric}
                          {kpi.target}
                        
                      ))}
                    
                  
                )}

                {stage.automationTriggers?.length > 0 && (
                  
                    Stage Advancement Triggers
                    
                      {stage.automationTriggers.map((t, i) => {t})}
                    
                  
                )}
              
            
          ))}
        

        {/* ─── Channel Strategies Tab ─── */}
        
          {plan.channelStrategies?.map((cs) => (
            
              
                
                  
                  {cs.channel.charAt(0).toUpperCase() + cs.channel.slice(1)} Strategy
                
              
              
                {cs.overallRole}

                
                  
                    Cadence
                    {cs.cadence}
                  
                  
                    Personalization
                    {cs.personalization}
                  
                

                {cs.funnelStageUsage?.length > 0 && (
                  
                    Per-Stage Usage
                    
                      {cs.funnelStageUsage.map((su, i) => (
                        
                          {su.stage}
                          {su.approach}
                          {su.sequenceOutline?.length > 0 && (
                            
                              {su.sequenceOutline.map((step, j) => {step})}
                            
                          )}
                          {su.messageTemplateGuidance && (
                            {su.messageTemplateGuidance}
                          )}
                        
                      ))}
                    
                  
                )}

                {cs.complianceNotes && (
                  
                    Compliance Notes
                    {cs.complianceNotes}
                  
                )}
              
            
          ))}
        

        {/* ─── Persona Playbooks Tab ─── */}
        
          {plan.personaStrategies?.map((ps, idx) => (
            
              
                
                  
                  {ps.personaTitle}
                  
                     {ps.preferredChannel}
                  
                
              
              
                {ps.messagingAngle}

                {ps.painPoints?.length > 0 && (
                  
                    Pain Points
                    
                      {ps.painPoints.map((pp, i) => (
                        {pp}
                      ))}
                    
                  
                )}

                {/* Call Script */}
                {ps.callScript && (
                  }
                    defaultOpen={false}
                  >
                    
                      
                        Opener
                        "{ps.callScript.opener}"
                      
                      {ps.callScript.discoveryQuestions?.length > 0 && (
                        
                          Discovery Questions
                          
                            {ps.callScript.discoveryQuestions.map((q, i) => {q})}
                          
                        
                      )}
                      
                        Value Statement
                        {ps.callScript.valueStatement}
                      
                      {ps.callScript.objectionHandlers?.length > 0 && (
                        
                          Objection Handlers
                          
                            {ps.callScript.objectionHandlers.map((oh, i) => (
                              
                                "{ oh.objection}"
                                {oh.response}
                              
                            ))}
                          
                        
                      )}
                      
                        Close Attempt
                        "{ps.callScript.closeAttempt}"
                      
                    
                  
                )}

                {/* Email Sequence */}
                {ps.emailSequence?.length > 0 && (
                  }
                    defaultOpen={false}
                  >
                    
                      {ps.emailSequence.map((email, i) => (
                        
                          
                            Email {i + 1}
                            {email.subject}
                          
                          {email.previewText}
                          {email.bodyTheme}
                          CTA: {email.cta}
                        
                      ))}
                    
                  
                )}
              
            
          ))}
        

        {/* ─── Timeline & KPIs Tab ─── */}
        
          {/* Timeline */}
          {plan.timeline && (
            
              
                
                  
                  Campaign Timeline ({plan.timeline.totalDurationWeeks} weeks)
                
              
              
                
                  {plan.timeline.phases?.map((phase, idx) => (
                    
                      {/* Timeline line */}
                      {idx 
                      )}
                      {/* Timeline dot */}
                      
                      
                        
                          {phase.phaseName}
                          {phase.weekRange}
                        
                        
                          {phase.activities?.map((a, i) => {a})}
                        
                        Milestone: {phase.milestone}
                      
                    
                  ))}
                
              
            
          )}

          {/* KPI Framework */}
          {plan.kpiFramework && (
            
              
                
                   KPI Framework
                
              
              
                {plan.kpiFramework.primaryKpis?.length > 0 && (
                  
                    Primary KPIs
                    
                      {plan.kpiFramework.primaryKpis.map((kpi, i) => (
                        
                          {kpi.metric}
                          {kpi.target}
                          {kpi.measurementMethod}
                        
                      ))}
                    
                  
                )}
                {plan.kpiFramework.secondaryKpis?.length > 0 && (
                  
                    Secondary KPIs
                    
                      {plan.kpiFramework.secondaryKpis.map((kpi, i) => (
                        
                          {kpi.metric}
                          {kpi.target}
                        
                      ))}
                    
                  
                )}
              
            
          )}
        

        {/* ─── Results & Budget Tab ─── */}
        
          {/* Estimated Results */}
          {plan.estimatedResults && (
            
              
                
                   Estimated Results
                  
                    {plan.estimatedResults.confidenceLevel} confidence
                  
                
              
              
                
                  
                    Total Leads
                    {plan.estimatedResults.totalLeadVolume}
                  
                  
                    Qualified
                    {plan.estimatedResults.qualifiedLeads}
                  
                  
                    Appointments
                    {plan.estimatedResults.expectedAppointments}
                  
                  
                    Closed/Won
                    {plan.estimatedResults.estimatedClosedWon}
                  
                  
                    First Results
                    {plan.estimatedResults.timeToFirstResults}
                  
                

                {plan.estimatedResults.assumptions?.length > 0 && (
                  
                    Assumptions
                    
                      {plan.estimatedResults.assumptions.map((a, i) => {a})}
                    
                  
                )}
              
            
          )}

          {/* Budget Guidance */}
          {plan.budgetGuidance && (
            
              
                
                   Budget Guidance
                
              
              
                
                  Estimated Budget Range
                  {plan.budgetGuidance.estimatedRange}
                

                {plan.budgetGuidance.allocationByChannel?.length > 0 && (
                  
                    Channel Allocation
                    
                      {plan.budgetGuidance.allocationByChannel.map((alloc, i) => (
                        
                          {alloc.channel}
                          
                            
                              
                                {alloc.percentAllocation}%
                              
                            
                          
                          {alloc.rationale}
                        
                      ))}
                    
                  
                )}
              
            
          )}

          {/* Learning Integration */}
          {plan.learningIntegration && (
            
              
                
                   Learning Integration
                
              
              
                {plan.learningIntegration.appliedInsights?.length > 0 && (
                  
                    Applied Insights
                    
                      {plan.learningIntegration.appliedInsights.map((a, i) => {a})}
                    
                  
                )}
                {plan.learningIntegration.risksIdentified?.length > 0 && (
                  
                    Risks Identified
                    
                      {plan.learningIntegration.risksIdentified.map((r, i) => {r})}
                    
                  
                )}
                {plan.learningIntegration.mitigationStrategies?.length > 0 && (
                  
                    Mitigation Strategies
                    
                      {plan.learningIntegration.mitigationStrategies.map((m, i) => {m})}
                    
                  
                )}
              
            
          )}
        
      
    
  );
}