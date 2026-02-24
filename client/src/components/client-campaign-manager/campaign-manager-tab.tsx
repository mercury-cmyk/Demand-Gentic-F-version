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
  icpPersonas: Array<{ title: string; painPoints?: string[] }>;
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
  const [view, setView] = useState<View>('overview');
  const [selectedPlanId, setSelectedPlanId] = useState<string | null>(null);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // ─── Form state for plan generation ───
  const [campaignGoal, setCampaignGoal] = useState('');
  const [targetBudget, setTargetBudget] = useState('');
  const [channels, setChannels] = useState<Record<string, boolean>>({
    voice: true,
    email: true,
    messaging: true,
  });
  const [campaignDuration, setCampaignDuration] = useState('12 weeks (quarterly)');
  const [additionalContext, setAdditionalContext] = useState('');

  // ─── Data Queries ───

  const { data: oiData, isLoading: oiLoading } = useQuery<OISummary>({
    queryKey: ['campaign-planner-oi-summary'],
    queryFn: async () => {
      const res = await fetch('/api/client-portal/campaign-planner/oi-summary', authHeaders);
      if (!res.ok) throw new Error('Failed to fetch OI');
      return res.json();
    },
    staleTime: 5 * 60 * 1000,
  });

  const { data: plansData, isLoading: plansLoading } = useQuery<{ plans: PlanListItem[] }>({
    queryKey: ['campaign-planner-plans'],
    queryFn: async () => {
      const res = await fetch('/api/client-portal/campaign-planner/plans', authHeaders);
      if (!res.ok) throw new Error('Failed to fetch plans');
      return res.json();
    },
    staleTime: 30 * 1000,
  });

  const { data: selectedPlanData, isLoading: planDetailLoading } = useQuery<{ plan: PlanFull }>({
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
        <div className="flex items-center justify-center py-20">
          <Loader2 className="animate-spin mr-2" size={20} />
          <span className="text-muted-foreground">Loading plan...</span>
        </div>
      );
    }

    const planData = selectedPlanData?.plan;
    if (!planData?.generatedPlan) {
      return (
        <div className="text-center py-20">
          <p className="text-muted-foreground">Plan not found or still generating.</p>
          <Button variant="ghost" onClick={() => { setView('overview'); setSelectedPlanId(null); }} className="mt-4">
            Back to Plans
          </Button>
        </div>
      );
    }

    return (
      <PlanDetailView
        plan={planData.generatedPlan}
        planMeta={{
          id: planData.id,
          status: planData.status,
          createdAt: planData.createdAt,
          approvedAt: planData.approvedAt,
        }}
        onBack={() => { setView('overview'); setSelectedPlanId(null); }}
        onApprove={() => approveMutation.mutate(planData.id)}
        isApproving={approveMutation.isPending}
      />
    );
  }

  // ─── Render: Generate View ───
  if (view === 'generate') {
    return (
      <div className="space-y-6 max-w-3xl">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-bold flex items-center gap-2">
              <Sparkles size={22} className="text-indigo-500" />
              Generate Campaign Plan
            </h2>
            <p className="text-sm text-muted-foreground mt-1">
              AI will create a full-funnel, multi-channel campaign plan from your Organization Intelligence.
              All fields are optional — the AI uses your OI as the primary source.
            </p>
          </div>
          <Button variant="ghost" onClick={() => setView('overview')}>Cancel</Button>
        </div>

        {/* OI Status */}
        {oiData?.hasOI ? (
          <Card className="border-indigo-200 bg-indigo-50/50 dark:bg-indigo-950/20">
            <CardContent className="pt-4 pb-3">
              <div className="flex items-center gap-2 mb-2">
                <Brain size={16} className="text-indigo-600" />
                <span className="text-sm font-semibold text-indigo-700 dark:text-indigo-400">Organization Intelligence Active</span>
              </div>
              <p className="text-xs text-muted-foreground">
                Planning for <strong>{oiData.orgName}</strong> — {oiData.coreProducts?.slice(0, 3).join(', ')}.
                Targeting: {oiData.icpPersonas?.slice(0, 3).map(p => p.title).join(', ')}.
              </p>
            </CardContent>
          </Card>
        ) : (
          <Card className="border-amber-200 bg-amber-50/50 dark:bg-amber-950/20">
            <CardContent className="pt-4 pb-3">
              <div className="flex items-center gap-2">
                <AlertCircle size={16} className="text-amber-600" />
                <span className="text-sm font-medium text-amber-700 dark:text-amber-400">
                  No Organization Intelligence configured. Plans will use industry defaults.
                </span>
              </div>
            </CardContent>
          </Card>
        )}

        <Separator />

        {/* Form */}
        <div className="space-y-5">
          <div>
            <Label htmlFor="goal" className="text-sm font-medium">Campaign Goal (optional)</Label>
            <Textarea
              id="goal"
              value={campaignGoal}
              onChange={(e) => setCampaignGoal(e.target.value)}
              placeholder="e.g., Generate 50 qualified meetings with enterprise CTOs in financial services, focus on appointment setting and SQL generation"
              className="mt-1.5"
              rows={3}
            />
            <p className="text-xs text-muted-foreground mt-1">Leave empty to let AI determine the best strategy from your OI.</p>
          </div>

          <div>
            <Label htmlFor="budget" className="text-sm font-medium">Target Budget (optional)</Label>
            <Input
              id="budget"
              value={targetBudget}
              onChange={(e) => setTargetBudget(e.target.value)}
              placeholder="e.g., $25,000/month or $75,000 total"
              className="mt-1.5"
            />
          </div>

          <div>
            <Label className="text-sm font-medium mb-2 block">Channels</Label>
            <div className="flex flex-wrap gap-4">
              {[
                { key: 'voice', label: 'Voice Calls', icon: Phone },
                { key: 'email', label: 'Email', icon: Mail },
                { key: 'messaging', label: 'Messaging', icon: MessageSquareText },
              ].map(({ key, label, icon: Icon }) => (
                <label key={key} className="flex items-center gap-2 cursor-pointer">
                  <Checkbox
                    checked={channels[key]}
                    onCheckedChange={(checked) => setChannels(prev => ({ ...prev, [key]: !!checked }))}
                  />
                  <Icon size={14} className="text-muted-foreground" />
                  <span className="text-sm">{label}</span>
                </label>
              ))}
            </div>
          </div>

          <div>
            <Label className="text-sm font-medium">Campaign Duration</Label>
            <Select value={campaignDuration} onValueChange={setCampaignDuration}>
              <SelectTrigger className="mt-1.5">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="4 weeks">4 weeks</SelectItem>
                <SelectItem value="8 weeks">8 weeks</SelectItem>
                <SelectItem value="12 weeks (quarterly)">12 weeks (quarterly)</SelectItem>
                <SelectItem value="6 months">6 months</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label htmlFor="context" className="text-sm font-medium">Additional Context (optional)</Label>
            <Textarea
              id="context"
              value={additionalContext}
              onChange={(e) => setAdditionalContext(e.target.value)}
              placeholder="Any specific requirements, exclusions, or context the AI should know about..."
              className="mt-1.5"
              rows={2}
            />
          </div>
        </div>

        <Separator />

        <Button
          onClick={() => generateMutation.mutate()}
          disabled={generateMutation.isPending}
          className="w-full bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-700 hover:to-violet-700 text-white py-6 text-base"
        >
          {generateMutation.isPending ? (
            <>
              <Loader2 className="animate-spin mr-2" size={18} />
              Generating AI Campaign Plan... (this takes 15-30 seconds)
            </>
          ) : (
            <>
              <Wand2 className="mr-2" size={18} />
              Generate Full-Funnel Campaign Plan
            </>
          )}
        </Button>
      </div>
    );
  }

  // ─── Render: Overview (default) ───
  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between flex-wrap gap-4">
        <div>
          <h2 className="text-2xl font-bold flex items-center gap-2">
            <Wand2 size={22} className="text-indigo-500" />
            AI Campaign Planner
          </h2>
          <p className="text-sm text-muted-foreground mt-1">
            Generate full-funnel, multi-channel campaign plans powered by your Organization Intelligence.
          </p>
        </div>
        <Button
          onClick={() => setView('generate')}
          className="bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-700 hover:to-violet-700"
        >
          <Plus size={16} className="mr-2" />
          Generate New Plan
        </Button>
      </div>

      {/* OI Context Card */}
      {oiLoading ? (
        <Card className="animate-pulse">
          <CardContent className="pt-6">
            <div className="h-4 bg-muted rounded w-1/3 mb-3" />
            <div className="h-3 bg-muted rounded w-2/3 mb-2" />
            <div className="h-3 bg-muted rounded w-1/2" />
          </CardContent>
        </Card>
      ) : oiData?.hasOI ? (
        <Card className="border-indigo-100 dark:border-indigo-900">
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Brain size={16} className="text-indigo-600" />
              Organization Intelligence
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div>
              <p className="font-semibold">{oiData.orgName}</p>
              {oiData.orgDescription && (
                <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{oiData.orgDescription}</p>
              )}
            </div>

            {oiData.valueProposition && (
              <div className="bg-indigo-50 dark:bg-indigo-950/30 rounded-lg p-3 border-l-4 border-indigo-400">
                <p className="text-xs italic text-indigo-700 dark:text-indigo-300">{oiData.valueProposition}</p>
              </div>
            )}

            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {oiData.coreProducts?.length > 0 && (
                <div>
                  <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-1">Products</p>
                  <div className="flex flex-wrap gap-1">
                    {oiData.coreProducts.slice(0, 4).map((p, i) => (
                      <Badge key={i} variant="secondary" className="text-[10px]">{p}</Badge>
                    ))}
                    {oiData.coreProducts.length > 4 && (
                      <Badge variant="outline" className="text-[10px]">+{oiData.coreProducts.length - 4}</Badge>
                    )}
                  </div>
                </div>
              )}
              {oiData.icpPersonas?.length > 0 && (
                <div>
                  <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-1">ICP Personas</p>
                  <div className="flex flex-wrap gap-1">
                    {oiData.icpPersonas.slice(0, 3).map((p, i) => (
                      <Badge key={i} variant="outline" className="text-[10px]">{p.title}</Badge>
                    ))}
                    {oiData.icpPersonas.length > 3 && (
                      <Badge variant="outline" className="text-[10px]">+{oiData.icpPersonas.length - 3}</Badge>
                    )}
                  </div>
                </div>
              )}
              {oiData.differentiators?.length > 0 && (
                <div>
                  <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-1">Differentiators</p>
                  <div className="flex flex-wrap gap-1">
                    {oiData.differentiators.slice(0, 3).map((d, i) => (
                      <Badge key={i} variant="outline" className="text-[10px]">{d}</Badge>
                    ))}
                  </div>
                </div>
              )}
              {oiData.icpIndustries?.length > 0 && (
                <div>
                  <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-1">Industries</p>
                  <div className="flex flex-wrap gap-1">
                    {oiData.icpIndustries.slice(0, 3).map((ind, i) => (
                      <Badge key={i} variant="outline" className="text-[10px]">{ind}</Badge>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {oiData.learningSummary && (
              <div className="bg-green-50 dark:bg-green-950/20 rounded-lg p-2 border border-green-200 dark:border-green-800">
                <p className="text-[10px] font-semibold text-green-700 dark:text-green-400">Campaign Learnings Available</p>
                <p className="text-[10px] text-green-600 dark:text-green-500 line-clamp-1">{oiData.learningSummary}</p>
              </div>
            )}
          </CardContent>
        </Card>
      ) : (
        <Card className="border-amber-200 bg-amber-50/50 dark:bg-amber-950/20">
          <CardContent className="pt-6">
            <div className="flex items-center gap-2 mb-2">
              <AlertCircle size={16} className="text-amber-600" />
              <span className="text-sm font-medium text-amber-700 dark:text-amber-400">Organization Intelligence Not Configured</span>
            </div>
            <p className="text-xs text-muted-foreground">
              Set up Organization Intelligence to get personalized campaign plans based on your products, ICP, and market positioning.
            </p>
          </CardContent>
        </Card>
      )}

      <Separator />

      {/* Saved Plans List */}
      <div>
        <h3 className="text-lg font-semibold mb-3 flex items-center gap-2">
          <Target size={18} />
          Campaign Plans
        </h3>

        {plansLoading ? (
          <div className="space-y-3">
            {[1, 2, 3].map(i => (
              <Card key={i} className="animate-pulse">
                <CardContent className="pt-4 pb-4">
                  <div className="h-4 bg-muted rounded w-1/3 mb-2" />
                  <div className="h-3 bg-muted rounded w-1/2" />
                </CardContent>
              </Card>
            ))}
          </div>
        ) : !plansData?.plans?.length ? (
          <Card className="border-dashed">
            <CardContent className="pt-8 pb-8 text-center">
              <Sparkles size={32} className="mx-auto text-muted-foreground/40 mb-3" />
              <p className="text-sm font-medium">No campaign plans yet</p>
              <p className="text-xs text-muted-foreground mt-1 mb-4">
                Generate your first AI-powered, full-funnel campaign plan.
              </p>
              <Button onClick={() => setView('generate')} variant="outline">
                <Wand2 size={14} className="mr-2" /> Generate First Plan
              </Button>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-2">
            {plansData.plans.map((plan) => (
              <Card
                key={plan.id}
                className="hover:shadow-md transition-shadow cursor-pointer"
                onClick={() => { setSelectedPlanId(plan.id); setView('detail'); }}
              >
                <CardContent className="pt-4 pb-4">
                  <div className="flex items-start justify-between">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <h4 className="font-semibold text-sm truncate">{plan.name}</h4>
                        <Badge
                          variant={plan.status === 'approved' ? 'default' : plan.status === 'active' ? 'default' : 'secondary'}
                          className="text-[10px] flex-shrink-0"
                        >
                          {plan.status}
                        </Badge>
                      </div>
                      {plan.campaignGoal && (
                        <p className="text-xs text-muted-foreground truncate mb-1.5">{plan.campaignGoal}</p>
                      )}
                      <div className="flex items-center gap-3 text-xs text-muted-foreground">
                        {plan.funnelStageCount && (
                          <span className="flex items-center gap-1">
                            <TrendingUp size={12} /> {plan.funnelStageCount} stages
                          </span>
                        )}
                        {plan.channelCount && (
                          <span className="flex items-center gap-1">
                            <Target size={12} /> {plan.channelCount} channels
                          </span>
                        )}
                        {plan.estimatedLeadVolume && (
                          <span className="flex items-center gap-1">
                            <TrendingUp size={12} /> {plan.estimatedLeadVolume} leads
                          </span>
                        )}
                        {plan.campaignDuration && (
                          <span className="flex items-center gap-1">
                            <Calendar size={12} /> {plan.campaignDuration}
                          </span>
                        )}
                        <span>{new Date(plan.createdAt).toLocaleDateString()}</span>
                      </div>
                    </div>
                    <Button variant="ghost" size="sm" className="flex-shrink-0 ml-2">
                      <Eye size={14} className="mr-1" /> View
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
