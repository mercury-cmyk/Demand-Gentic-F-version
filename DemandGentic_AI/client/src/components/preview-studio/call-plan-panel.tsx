import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import {
  Phone,
  MessageSquare,
  Target,
  AlertTriangle,
  Lightbulb,
  User,
  ArrowRight,
  CheckCircle2,
  XCircle,
  HelpCircle,
} from "lucide-react";
import { apiRequest } from "@/lib/queryClient";

interface CallPlanResponse {
  sessionId: string;
  accountCallBrief: {
    theme: string;
    safe_problem_frame: string;
    opening_posture: string;
    one_sentence_insight: string;
    success_definition: string;
    avoid: string[];
    confidence: number;
  };
  participantCallPlan: {
    opening_lines: string[];
    first_question: string;
    micro_insight: string;
    cta: string;
    branching: {
      gatekeeper: { ask: string; fallback: string };
      objection_busy: { response: string };
      objection_not_interested: { response: string };
      voicemail: { message: string };
    };
  };
  participantContext: {
    name: string;
    role: string;
    seniority: string;
    relationship_state: string;
    prior_touches: string[];
    channel_preference: string;
    last_call_outcome: string | null;
  };
  memoryNotes: Array;
}

interface PreviewContext {
  accountCallBrief?: any;
  participantCallPlan?: any;
  participantContext?: any;
}

interface CallPlanPanelProps {
  campaignId: string | null;
  accountId: string | null;
  contactId: string | null;
  previewContext?: PreviewContext;
  isLoading?: boolean;
}

export function CallPlanPanel({
  campaignId,
  accountId,
  contactId,
  previewContext,
  isLoading,
}: CallPlanPanelProps) {
  // Fetch detailed call plan (works with or without contact)
  const { data: callPlanData, isLoading: planLoading } = useQuery({
    queryKey: ['/api/preview-studio/generate-call-plan', campaignId, accountId, contactId],
    queryFn: async () => {
      const payload: any = {
        campaignId,
        accountId,
      };
      if (contactId) {
        payload.contactId = contactId;
      }
      const response = await apiRequest('POST', '/api/preview-studio/generate-call-plan', payload);
      return response.json();
    },
    enabled: !!(campaignId && accountId),
  });

  // Use either the detailed call plan or the preview context
  const callBrief = callPlanData?.accountCallBrief || previewContext?.accountCallBrief;
  const callPlan = callPlanData?.participantCallPlan || previewContext?.participantCallPlan;
  const participantContext = callPlanData?.participantContext || previewContext?.participantContext;

  const loading = isLoading || planLoading;

  if (loading) {
    return (
      
        
        
        
      
    );
  }

  if (!callBrief && !callPlan) {
    return (
      
        
          
          No Call Plan Available
          
            {!campaignId || !accountId
              ? "Select a campaign and account to view the call strategy."
              : "Loading account intelligence and call strategy..."}
          
        
      
    );
  }

  return (
    
      {/* Participant Context */}
      {participantContext && (
        
          
            
              
              Participant Context
            
            
              How this contact is understood by the AI
            
          
          
            
              
                
                  
                    Name
                    {participantContext.name || 'Unknown'}
                  
                  
                    Role
                    {participantContext.role || 'Unknown'}
                  
                  
                    Seniority
                    {participantContext.seniority || 'Unknown'}
                  
                  
                    Relationship State
                    
                      {participantContext.relationship_state || 'Unknown'}
                    
                  
                  
                    Channel Preference
                    {participantContext.channel_preference || 'Unknown'}
                  
                  {participantContext.last_call_outcome && (
                    
                      Last Call Outcome
                      {participantContext.last_call_outcome}
                    
                  )}
                
                {participantContext.prior_touches && participantContext.prior_touches.length > 0 && (
                  
                    Prior Touches
                    
                      {participantContext.prior_touches.map((touch: string, i: number) => (
                        
                          {touch}
                        
                      ))}
                    
                  
                )}
              
            
          
        
      )}

      {/* Account Call Brief */}
      {callBrief && (
        
          
            
              
              Account Call Brief
            
            
              Strategic context for this account
              {callBrief.confidence !== undefined && (
                 0.7 ? "default" : "secondary"}>
                  {Math.round(callBrief.confidence * 100)}% confidence
                
              )}
            
          
          
            {callBrief.theme && (
              
                Theme
                {callBrief.theme}
              
            )}
            {callBrief.safe_problem_frame && (
              
                Problem Frame
                {callBrief.safe_problem_frame}
              
            )}
            {callBrief.one_sentence_insight && (
              
                
                
                  Key Insight
                  {callBrief.one_sentence_insight}
                
              
            )}
            
              {callBrief.opening_posture && (
                
                  Opening Posture
                  {callBrief.opening_posture}
                
              )}
              {callBrief.success_definition && (
                
                  Success Definition
                  {callBrief.success_definition}
                
              )}
            
            {callBrief.avoid && callBrief.avoid.length > 0 && (
              
                
                
                  Avoid Mentioning
                  
                    {callBrief.avoid.map((item: string, i: number) => (
                      
                        {item}
                      
                    ))}
                  
                
              
            )}
          
        
      )}

      {/* Participant Call Plan */}
      {callPlan && (
        
          
            
              
              Participant Call Plan
            
            
              Personalized call flow for this contact
            
          
          
            {/* Opening Lines */}
            {callPlan.opening_lines && callPlan.opening_lines.length > 0 && (
              
                Opening Line Options
                
                  {callPlan.opening_lines.map((line: string, i: number) => (
                    
                      {i + 1}
                      {line}
                    
                  ))}
                
              
            )}

            {/* First Question */}
            {callPlan.first_question && (
              
                
                
                  Discovery Question
                  {callPlan.first_question}
                
              
            )}

            {/* Micro Insight */}
            {callPlan.micro_insight && (
              
                
                
                  Micro Insight
                  {callPlan.micro_insight}
                
              
            )}

            {/* CTA */}
            {callPlan.cta && (
              
                
                
                  Call to Action
                  {callPlan.cta}
                
              
            )}

            {/* Branching Logic */}
            {callPlan.branching && (
              
                Branching Responses
                
                  {callPlan.branching.gatekeeper && (
                    
                      
                        
                          
                          Gatekeeper Handling
                        
                      
                      
                        
                          Primary Ask
                          {callPlan.branching.gatekeeper.ask}
                        
                        
                          Fallback
                          {callPlan.branching.gatekeeper.fallback}
                        
                      
                    
                  )}
                  {callPlan.branching.objection_busy && (
                    
                      
                        
                          
                          "I'm busy" Objection
                        
                      
                      
                        
                          {callPlan.branching.objection_busy.response}
                        
                      
                    
                  )}
                  {callPlan.branching.objection_not_interested && (
                    
                      
                        
                          
                          "Not interested" Objection
                        
                      
                      
                        
                          {callPlan.branching.objection_not_interested.response}
                        
                      
                    
                  )}
                  {callPlan.branching.voicemail && (
                    
                      
                        
                          
                          Voicemail Script
                        
                      
                      
                        
                          {callPlan.branching.voicemail.message}
                        
                      
                    
                  )}
                
              
            )}
          
        
      )}
    
  );
}