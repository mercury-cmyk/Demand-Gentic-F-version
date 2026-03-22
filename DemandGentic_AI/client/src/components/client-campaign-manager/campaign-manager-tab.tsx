import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Wand2,
  Sparkles,
  Loader2,
  Brain,
  Phone,
  Mail,
  MessageSquareText,
  Target,
  Plus,
  Calendar,
  TrendingUp,
  Eye,
  AlertCircle,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { PlanDetailView } from "./plan-detail-view";
import type { CampaignPlanOutput } from "../../../../server/services/ai-campaign-planner";

interface CampaignManagerTabProps {
  authHeaders: { headers: { Authorization: string } };
}

type View = 'overview' | 'generate' | 'detail';

interface OISummary {
  hasOI: boolean;
  orgName: string | null;
  orgDescription: string | null;
  orgIndustry: string | null;
  valueProposition: string | null;
  coreProducts: string[];
  icpPersonas: Array;
  icpIndustries: string[];
  differentiators: string[];
  emailAngles: string[];
  callOpeners: string[];
  learningSummary: string | null;
}

interface PlanListItem {
  id: string;
  name: string;
  status: string;
  campaignGoal: string | null;
  campaignDuration: string | null;
  funnelStageCount: number | null;
  channelCount: number | null;
  estimatedLeadVolume: string | null;
  createdAt: string;
  approvedAt: string | null;
}

interface PlanFull {
  id: string;
  name: string;
  status: string;
  generatedPlan: CampaignPlanOutput;
  createdAt: string;
  approvedAt: string | null;
}

export function CampaignManagerTab({ authHeaders }: CampaignManagerTabProps) {
  const [view, setView] = useState('overview');
  const [selectedPlanId, setSelectedPlanId] = useState(null);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // ─── Form state for plan generation ───
  const [campaignGoal, setCampaignGoal] = useState('');
  const [targetBudget, setTargetBudget] = useState('');
  const [channels, setChannels] = useState>({
    voice: true,
    email: true,
    messaging: true,
  });
  const [campaignDuration, setCampaignDuration] = useState('12 weeks (quarterly)');
  const [additionalContext, setAdditionalContext] = useState('');

  // ─── Data Queries ───

  const { data: oiData, isLoading: oiLoading } = useQuery({
    queryKey: ['campaign-planner-oi-summary'],
    queryFn: async () => {
      const res = await fetch('/api/client-portal/campaign-planner/oi-summary', authHeaders);
      if (!res.ok) throw new Error('Failed to fetch OI');
      return res.json();
    },
    staleTime: 5 * 60 * 1000,
  });

  const { data: plansData, isLoading: plansLoading } = useQuery({
    queryKey: ['campaign-planner-plans'],
    queryFn: async () => {
      const res = await fetch('/api/client-portal/campaign-planner/plans', authHeaders);
      if (!res.ok) throw new Error('Failed to fetch plans');
      return res.json();
    },
    staleTime: 30 * 1000,
  });

  const { data: selectedPlanData, isLoading: planDetailLoading } = useQuery({
    queryKey: ['campaign-planner-plan', selectedPlanId],
    queryFn: async () => {
      const res = await fetch(`/api/client-portal/campaign-planner/plans/${selectedPlanId}`, authHeaders);
      if (!res.ok) throw new Error('Failed to fetch plan');
      return res.json();
    },
    enabled: !!selectedPlanId && view === 'detail',
    staleTime: 60 * 1000,
  });

  // ─── Mutations ───

  const generateMutation = useMutation({
    mutationFn: async () => {
      const selectedChannels = Object.entries(channels)
        .filter(([, v]) => v)
        .map(([k]) => k);

      const res = await apiRequest('POST', '/api/client-portal/campaign-planner/generate-plan', {
        campaignGoal: campaignGoal || undefined,
        targetBudget: targetBudget || undefined,
        preferredChannels: selectedChannels.length > 0 ? selectedChannels : undefined,
        campaignDuration: campaignDuration || undefined,
        additionalContext: additionalContext || undefined,
      }, { timeout: 120000 });
      return res.json();
    },
    onSuccess: (data) => {
      toast({ title: 'Campaign plan generated!', description: 'Your AI campaign plan is ready for review.' });
      queryClient.invalidateQueries({ queryKey: ['campaign-planner-plans'] });
      setSelectedPlanId(data.plan.id);
      setView('detail');
      // Reset form
      setCampaignGoal('');
      setTargetBudget('');
      setAdditionalContext('');
    },
    onError: (error: any) => {
      toast({
        title: 'Generation failed',
        description: error?.message || 'Failed to generate campaign plan. Please try again.',
        variant: 'destructive',
      });
    },
  });

  const approveMutation = useMutation({
    mutationFn: async (planId: string) => {
      const res = await apiRequest('PATCH', `/api/client-portal/campaign-planner/plans/${planId}/approve`);
      return res.json();
    },
    onSuccess: () => {
      toast({ title: 'Plan approved!', description: 'Campaign plan has been approved successfully.' });
      queryClient.invalidateQueries({ queryKey: ['campaign-planner-plans'] });
      queryClient.invalidateQueries({ queryKey: ['campaign-planner-plan', selectedPlanId] });
    },
  });

  // ─── Render: Detail View ───
  if (view === 'detail' && selectedPlanId) {
    if (planDetailLoading) {
      return (
        
          
          Loading plan...
        
      );
    }

    const planData = selectedPlanData?.plan;
    if (!planData?.generatedPlan) {
      return (
        
          Plan not found or still generating.
           { setView('overview'); setSelectedPlanId(null); }} className="mt-4">
            Back to Plans
          
        
      );
    }

    return (
       { setView('overview'); setSelectedPlanId(null); }}
        onApprove={() => approveMutation.mutate(planData.id)}
        isApproving={approveMutation.isPending}
      />
    );
  }

  // ─── Render: Generate View ───
  if (view === 'generate') {
    return (
      
        
          
            
              
              Generate Campaign Plan
            
            
              AI will create a full-funnel, multi-channel campaign plan from your Organization Intelligence.
              All fields are optional — the AI uses your OI as the primary source.
            
          
           setView('overview')}>Cancel
        

        {/* OI Status */}
        {oiData?.hasOI ? (
          
            
              
                
                Organization Intelligence Active
              
              
                Planning for {oiData.orgName} — {oiData.coreProducts?.slice(0, 3).join(', ')}.
                Targeting: {oiData.icpPersonas?.slice(0, 3).map(p => p.title).join(', ')}.
              
            
          
        ) : (
          
            
              
                
                
                  No Organization Intelligence configured. Plans will use industry defaults.
                
              
            
          
        )}

        

        {/* Form */}
        
          
            Campaign Goal (optional)
             setCampaignGoal(e.target.value)}
              placeholder="e.g., Generate 50 qualified meetings with enterprise CTOs in financial services, focus on appointment setting and SQL generation"
              className="mt-1.5"
              rows={3}
            />
            Leave empty to let AI determine the best strategy from your OI.
          

          
            Target Budget (optional)
             setTargetBudget(e.target.value)}
              placeholder="e.g., $25,000/month or $75,000 total"
              className="mt-1.5"
            />
          

          
            Channels
            
              {[
                { key: 'voice', label: 'Voice Calls', icon: Phone },
                { key: 'email', label: 'Email', icon: Mail },
                { key: 'messaging', label: 'Messaging', icon: MessageSquareText },
              ].map(({ key, label, icon: Icon }) => (
                
                   setChannels(prev => ({ ...prev, [key]: !!checked }))}
                  />
                  
                  {label}
                
              ))}
            
          

          
            Campaign Duration
            
              
                
              
              
                4 weeks
                8 weeks
                12 weeks (quarterly)
                6 months
              
            
          

          
            Additional Context (optional)
             setAdditionalContext(e.target.value)}
              placeholder="Any specific requirements, exclusions, or context the AI should know about..."
              className="mt-1.5"
              rows={2}
            />
          
        

        

         generateMutation.mutate()}
          disabled={generateMutation.isPending}
          className="w-full bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-700 hover:to-violet-700 text-white py-6 text-base"
        >
          {generateMutation.isPending ? (
            <>
              
              Generating AI Campaign Plan... (this takes 15-30 seconds)
            
          ) : (
            <>
              
              Generate Full-Funnel Campaign Plan
            
          )}
        
      
    );
  }

  // ─── Render: Overview (default) ───
  return (
    
      {/* Header */}
      
        
          
            
            AI Campaign Planner
          
          
            Generate full-funnel, multi-channel campaign plans powered by your Organization Intelligence.
          
        
         setView('generate')}
          className="bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-700 hover:to-violet-700"
        >
          
          Generate New Plan
        
      

      {/* OI Context Card */}
      {oiLoading ? (
        
          
            
            
            
          
        
      ) : oiData?.hasOI ? (
        
          
            
              
              Organization Intelligence
            
          
          
            
              {oiData.orgName}
              {oiData.orgDescription && (
                {oiData.orgDescription}
              )}
            

            {oiData.valueProposition && (
              
                {oiData.valueProposition}
              
            )}

            
              {oiData.coreProducts?.length > 0 && (
                
                  Products
                  
                    {oiData.coreProducts.slice(0, 4).map((p, i) => (
                      {p}
                    ))}
                    {oiData.coreProducts.length > 4 && (
                      +{oiData.coreProducts.length - 4}
                    )}
                  
                
              )}
              {oiData.icpPersonas?.length > 0 && (
                
                  ICP Personas
                  
                    {oiData.icpPersonas.slice(0, 3).map((p, i) => (
                      {p.title}
                    ))}
                    {oiData.icpPersonas.length > 3 && (
                      +{oiData.icpPersonas.length - 3}
                    )}
                  
                
              )}
              {oiData.differentiators?.length > 0 && (
                
                  Differentiators
                  
                    {oiData.differentiators.slice(0, 3).map((d, i) => (
                      {d}
                    ))}
                  
                
              )}
              {oiData.icpIndustries?.length > 0 && (
                
                  Industries
                  
                    {oiData.icpIndustries.slice(0, 3).map((ind, i) => (
                      {ind}
                    ))}
                  
                
              )}
            

            {oiData.learningSummary && (
              
                Campaign Learnings Available
                {oiData.learningSummary}
              
            )}
          
        
      ) : (
        
          
            
              
              Organization Intelligence Not Configured
            
            
              Set up Organization Intelligence to get personalized campaign plans based on your products, ICP, and market positioning.
            
          
        
      )}

      

      {/* Saved Plans List */}
      
        
          
          Campaign Plans
        

        {plansLoading ? (
          
            {[1, 2, 3].map(i => (
              
                
                  
                  
                
              
            ))}
          
        ) : !plansData?.plans?.length ? (
          
            
              
              No campaign plans yet
              
                Generate your first AI-powered, full-funnel campaign plan.
              
               setView('generate')} variant="outline">
                 Generate First Plan
              
            
          
        ) : (
          
            {plansData.plans.map((plan) => (
               { setSelectedPlanId(plan.id); setView('detail'); }}
              >
                
                  
                    
                      
                        {plan.name}
                        
                          {plan.status}
                        
                      
                      {plan.campaignGoal && (
                        {plan.campaignGoal}
                      )}
                      
                        {plan.funnelStageCount && (
                          
                             {plan.funnelStageCount} stages
                          
                        )}
                        {plan.channelCount && (
                          
                             {plan.channelCount} channels
                          
                        )}
                        {plan.estimatedLeadVolume && (
                          
                             {plan.estimatedLeadVolume} leads
                          
                        )}
                        {plan.campaignDuration && (
                          
                             {plan.campaignDuration}
                          
                        )}
                        {new Date(plan.createdAt).toLocaleDateString()}
                      
                    
                    
                       View
                    
                  
                
              
            ))}
          
        )}
      
    
  );
}