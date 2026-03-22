import { useEffect, useMemo, useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Loader2, Wand2, Save, CheckCircle2, Megaphone, Share2, Calendar, Target, BrainCircuit, Building2, Users, TrendingUp } from "lucide-react";

type CampaignOption = {
  id: string;
  name: string;
  type: string;
  status: string;
};

type GeneratedPlanResponse = {
  success: boolean;
  plan: any;
};

type SavedPlanResponse = {
  success: boolean;
  campaignId: string;
  campaignName: string;
  approvalStatus: string | null;
  approvedAt: string | null;
  approvedById: string | null;
  plan: any | null;
  planMeta: any | null;
};

type OrgContextResponse = {
  success: boolean;
  hasOrgIntelligence: boolean;
  orgContext: {
    orgName: string | null;
    orgDescription: string | null;
    orgIndustry: string | null;
    domain: string | null;
    targetMarket: string | null;
    valueProposition: string | null;
    keyChallenges: string[];
    icpPersonas: string[];
    coreProducts: string[];
    differentiators: string[];
    competitors: string[];
    whyUs: string[];
    emailAngles: string[];
    callOpeners: string[];
    learningSummary: string | null;
  };
};

const now = new Date();
const defaultQuarter = Math.floor(now.getMonth() / 3) + 1;
const defaultYear = now.getFullYear();

export default function CampaignManagerPage() {
  const { toast } = useToast();
  const [selectedCampaignId, setSelectedCampaignId] = useState("");
  const [campaignName, setCampaignName] = useState("");
  const [targetMarket, setTargetMarket] = useState("Mid-market and enterprise B2B organizations");
  const [primaryGoal, setPrimaryGoal] = useState("Generate qualified pipeline and increase meeting conversion quality");
  const [valueProposition, setValueProposition] = useState("Unify outbound demand generation with reasoning-first orchestration across email, phone, automation, and social narrative");
  const [keyChallenges, setKeyChallenges] = useState("Low conversion quality; channel fragmentation; inconsistent positioning");
  const [quarter, setQuarter] = useState(String(defaultQuarter));
  const [year, setYear] = useState(String(defaultYear));
  const [internalOnly, setInternalOnly] = useState(true);
  const [includeEmail, setIncludeEmail] = useState(true);
  const [includePhone, setIncludePhone] = useState(true);
  const [includeAutomation, setIncludeAutomation] = useState(true);
  const [includeSocial, setIncludeSocial] = useState(true);
  const [generatedPlan, setGeneratedPlan] = useState(null);
  const [socialPack, setSocialPack] = useState(null);
  const [orgApplied, setOrgApplied] = useState(false);

  // Fetch org intelligence as the primary source of truth
  const { data: orgContextData, isLoading: orgLoading } = useQuery({
    queryKey: ["/api/campaign-manager/org-context"],
    queryFn: async () => {
      const res = await fetch("/api/campaign-manager/org-context", {
        headers: {
          Authorization: `Bearer ${localStorage.getItem("authToken") || ""}`,
        },
      });
      if (!res.ok) throw new Error("Failed to load organization intelligence");
      return res.json();
    },
    staleTime: 5 * 60 * 1000,
  });

  // Pre-populate form fields from org intelligence when loaded
  useEffect(() => {
    if (!orgContextData?.hasOrgIntelligence || orgApplied) return;

    const ctx = orgContextData.orgContext;
    if (ctx.targetMarket) setTargetMarket(ctx.targetMarket);
    if (ctx.valueProposition) setValueProposition(ctx.valueProposition);
    if (ctx.keyChallenges?.length > 0) setKeyChallenges(ctx.keyChallenges.join("; "));
    setOrgApplied(true);
  }, [orgContextData, orgApplied]);

  const { data: campaigns = [], isLoading: campaignsLoading } = useQuery({
    queryKey: ["/api/campaigns"],
    queryFn: async () => {
      const res = await fetch("/api/campaigns", {
        headers: {
          Authorization: `Bearer ${localStorage.getItem("authToken") || ""}`,
        },
      });
      if (!res.ok) throw new Error("Failed to load campaigns");
      return res.json();
    },
  });

  const {
    data: savedPlanData,
    isFetching: loadingSavedPlan,
  } = useQuery({
    queryKey: ["/api/campaign-manager/campaigns", selectedCampaignId, "plan"],
    enabled: Boolean(selectedCampaignId),
    queryFn: async () => {
      const res = await fetch(`/api/campaign-manager/campaigns/${selectedCampaignId}/plan`, {
        headers: {
          Authorization: `Bearer ${localStorage.getItem("authToken") || ""}`,
        },
      });
      if (!res.ok) throw new Error("Failed to load saved campaign plan");
      return res.json();
    },
  });

  useEffect(() => {
    if (!savedPlanData) return;

    setGeneratedPlan(savedPlanData.plan ?? null);
    setSocialPack(null);

    if (savedPlanData.plan?.meta?.campaign?.name) {
      setCampaignName(savedPlanData.plan.meta.campaign.name);
    }
    if (savedPlanData.plan?.meta?.quarter) {
      const q = Number(savedPlanData.plan.meta.quarter);
      if (q >= 1 && q  campaigns.find((campaign) => campaign.id === selectedCampaignId) || null,
    [campaigns, selectedCampaignId],
  );

  const selectedChannels = useMemo(() => {
    const channels: string[] = [];
    if (includeEmail) channels.push("email");
    if (includePhone) channels.push("phone");
    if (includeAutomation) channels.push("automation");
    if (includeSocial) channels.push("social");
    return channels;
  }, [includeEmail, includePhone, includeAutomation, includeSocial]);

  const generatePlanMutation = useMutation({
    mutationFn: async () => {
      const challengeList = keyChallenges
        .split(";")
        .map((value) => value.trim())
        .filter(Boolean);

      const payload = {
        campaignId: selectedCampaignId || undefined,
        campaignName: campaignName || undefined,
        quarter: Number(quarter),
        year: Number(year),
        targetMarket,
        primaryGoal,
        valueProposition,
        keyChallenges: challengeList.length > 0 ? challengeList : ["Positioning consistency"],
        channels: selectedChannels,
        internalOnly,
      };

      const res = await apiRequest("POST", "/api/campaign-manager/plans/generate", payload, { timeout: 60000 });
      return res.json() as Promise;
    },
    onSuccess: (data) => {
      setGeneratedPlan(data.plan);
      toast({
        title: "Quarterly plan generated",
        description: "Campaign strategy built from organization intelligence, channel playbooks, and social narrative are ready for review.",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Plan generation failed",
        description: error?.message || "Unable to generate plan",
        variant: "destructive",
      });
    },
  });

  const savePlanMutation = useMutation({
    mutationFn: async () => {
      if (!selectedCampaignId || !generatedPlan) {
        throw new Error("Select a campaign and generate a plan first.");
      }
      const res = await apiRequest(
        "POST",
        `/api/campaign-manager/campaigns/${selectedCampaignId}/plan`,
        { plan: generatedPlan, syncCampaignFields: true },
      );
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/campaigns"] });
      queryClient.invalidateQueries({ queryKey: ["/api/campaign-manager/campaigns", selectedCampaignId, "plan"] });
      toast({ title: "Plan saved", description: "Campaign manager plan has been saved to the selected campaign." });
    },
    onError: (error: any) => {
      toast({ title: "Save failed", description: error?.message || "Unable to save plan", variant: "destructive" });
    },
  });

  const approvePlanMutation = useMutation({
    mutationFn: async () => {
      if (!selectedCampaignId) throw new Error("Select a campaign first.");
      const res = await apiRequest("POST", `/api/campaign-manager/campaigns/${selectedCampaignId}/approve`, {
        notes: "Approved via internal Campaign Manager console",
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/campaigns"] });
      queryClient.invalidateQueries({ queryKey: ["/api/campaign-manager/campaigns", selectedCampaignId, "plan"] });
      toast({ title: "Plan approved", description: "Campaign is now marked approved for launch governance." });
    },
    onError: (error: any) => {
      toast({ title: "Approval failed", description: error?.message || "Unable to approve plan", variant: "destructive" });
    },
  });

  const generateSocialMutation = useMutation({
    mutationFn: async () => {
      if (!selectedCampaignId) throw new Error("Select a campaign first.");
      const res = await apiRequest("POST", `/api/campaign-manager/campaigns/${selectedCampaignId}/social-messaging`, {});
      return res.json();
    },
    onSuccess: (data) => {
      setSocialPack(data.socialMessaging);
      toast({ title: "Social messaging generated", description: "Company and individual profile variants are ready." });
    },
    onError: (error: any) => {
      toast({ title: "Social generation failed", description: error?.message || "Unable to generate social pack", variant: "destructive" });
    },
  });

  const orgCtx = orgContextData?.orgContext;
  const hasOrg = orgContextData?.hasOrgIntelligence ?? false;

  return (
    
      
        
          
            
              
              Campaign Manager
            
            AI Quarterly Campaign Manager
            
              Plans quarterly campaigns based on your Organization Intelligence — identity, ICP, positioning, offerings,
              outreach strategies, and performance learnings. Everything is grounded in your org's source of truth.
            
          
          Org Intelligence First
        
      

      {/* Organization Intelligence Source Card */}
      
        
          {orgLoading ? (
            
              
              Loading organization intelligence...
            
          ) : hasOrg ? (
            
              
                
                Organization Intelligence Connected
                Source of Truth
              
              
                {orgCtx?.orgName && (
                  
                    
                    Organization:
                    {orgCtx.orgName}
                  
                )}
                {orgCtx?.icpPersonas && orgCtx.icpPersonas.length > 0 && (
                  
                    
                    ICP Personas:
                    {orgCtx.icpPersonas.length}
                  
                )}
                {orgCtx?.coreProducts && orgCtx.coreProducts.length > 0 && (
                  
                    
                    Products:
                    {orgCtx.coreProducts.length}
                  
                )}
              
              {orgCtx?.learningSummary && (
                Performance learnings from recent campaigns will be included in the plan.
              )}
            
          ) : (
            
              
              
                No organization intelligence configured. Using default brand positioning.
                Configure org intelligence for more targeted quarterly plans.
              
            
          )}
        
      

      
        
          Plan Inputs
          
            {hasOrg
              ? "Fields are pre-populated from your organization intelligence. Override any value as needed."
              : "Define the campaign context and generate a structured quarterly plan."}
          
        
        
          
            Select campaign (optional but recommended)
             setSelectedCampaignId(value)}>
              
                
              
              
                {campaigns.map((campaign) => (
                  
                    {campaign.name} ({campaign.type})
                  
                ))}
              
            
            {selectedCampaignId && (
              
                {loadingSavedPlan ?  : null}
                {loadingSavedPlan ? "Loading saved campaign plan..." : savedPlanData?.plan ? "Loaded saved campaign plan." : "No saved plan found yet for this campaign."}
              
            )}
          

          
            Campaign display name (optional)
             setCampaignName(event.target.value)} placeholder="Q2 Enterprise ABM - Finance" />
          

          
            
              Target market
              {hasOrg && orgCtx?.targetMarket && (from Org Intelligence)}
            
             setTargetMarket(event.target.value)} />
          

          
            Primary goal
             setPrimaryGoal(event.target.value)} />
          

          
            
              Value proposition
              {hasOrg && orgCtx?.valueProposition && (from Org Intelligence)}
            
             setValueProposition(event.target.value)} rows={3} />
          

          
            
              Key challenges (separate with semicolons)
              {hasOrg && orgCtx?.keyChallenges && orgCtx.keyChallenges.length > 0 && (from Org Intelligence)}
            
             setKeyChallenges(event.target.value)} rows={2} />
          

          
            Quarter
            
              
              
                Q1
                Q2
                Q3
                Q4
              
            
          

          
            Year
             setYear(event.target.value)} />
          

          
            Channels
            
              Email
              Phone
              Automation
              Social
            
          

          
            
              Internal-only mode
              Keep planning and governance optimized for inside sales and internal ops.
            
            
          

          
             generatePlanMutation.mutate()} disabled={generatePlanMutation.isPending || selectedChannels.length === 0}>
              {generatePlanMutation.isPending ?  : }Generate plan
            
             savePlanMutation.mutate()} disabled={!generatedPlan || !selectedCampaignId || savePlanMutation.isPending}>
              {savePlanMutation.isPending ?  : }Save to campaign
            
             approvePlanMutation.mutate()} disabled={!selectedCampaignId || approvePlanMutation.isPending}>
              {approvePlanMutation.isPending ?  : }Approve plan
            
             generateSocialMutation.mutate()} disabled={!selectedCampaignId || generateSocialMutation.isPending}>
              {generateSocialMutation.isPending ?  : }Generate social pack
            
          
        
      

      {generatedPlan && (
        
          
            Generated Quarterly Plan
            
              {generatedPlan?.meta?.window?.label || "Quarter"} · {selectedCampaign?.name || campaignName || "Unbound Campaign"}
              {generatedPlan?.meta?.sourceOfTruth === "organization-intelligence" && (
                · Powered by Org Intelligence
              )}
            
            {selectedCampaignId && savedPlanData && (
              
                
                  {savedPlanData.approvalStatus || "draft"}
                
                {savedPlanData.approvedAt ? (
                  
                    Approved at {new Date(savedPlanData.approvedAt).toLocaleString()}
                  
                ) : null}
              
            )}
          
          
            
              
                Cadence
                {generatedPlan?.meta?.cadence || "quarterly"}
              
              
                Window
                {generatedPlan?.meta?.window?.label || "-"}
              
              
                Channels
                {selectedChannels.join(", ")}
              
            

            {/* Org Intelligence Summary in generated plan */}
            {generatedPlan?.organizationIntelligenceSummary?.hasOrgIntelligence && (
              
                
                  
                  Organization Intelligence Applied
                
                
                  {generatedPlan.organizationIntelligenceSummary.orgName && (
                    
                      Organization
                      {generatedPlan.organizationIntelligenceSummary.orgName}
                    
                  )}
                  {generatedPlan.organizationIntelligenceSummary.icpPersonas?.length > 0 && (
                    
                      ICP Personas
                      {generatedPlan.organizationIntelligenceSummary.icpPersonas.join(", ")}
                    
                  )}
                  {generatedPlan.organizationIntelligenceSummary.coreProducts?.length > 0 && (
                    
                      Core Products
                      {generatedPlan.organizationIntelligenceSummary.coreProducts.join(", ")}
                    
                  )}
                  {generatedPlan.organizationIntelligenceSummary.competitors?.length > 0 && (
                    
                      Competitors
                      {generatedPlan.organizationIntelligenceSummary.competitors.join(", ")}
                    
                  )}
                
              
            )}

            
              Core narrative
              
                {generatedPlan?.messagingArchitecture?.coreNarrative || "No narrative generated."}
              
            

            
              Product positioning
              
                {generatedPlan?.productPositioning?.summary || "No product summary available."}
              
              {(generatedPlan?.productPositioning?.keyProductMessages || []).length > 0 ? (
                
                  {(generatedPlan?.productPositioning?.keyProductMessages || []).slice(0, 8).map((message: string, index: number) => (
                    {message}
                  ))}
                
              ) : null}
            

            {/* Persona Angles from Org Intelligence */}
            {generatedPlan?.messagingArchitecture?.personaAngles?.length > 0 && (
              
                Persona angles
                
                  {generatedPlan.messagingArchitecture.personaAngles.map((angle: any, index: number) => (
                    
                      {angle.persona}
                      Pain: {angle.pain}
                      Message: {angle.message}
                    
                  ))}
                
              
            )}

            
              
                Key themes
                
                  {(generatedPlan?.keyThemes || []).map((theme: string, index: number) => (
                    {theme}
                  ))}
                
              

              
                Channel optimization
                
                  Email: {generatedPlan?.channelOptimizationGuidance?.email}
                  Phone: {generatedPlan?.channelOptimizationGuidance?.phone}
                  Automation: {generatedPlan?.channelOptimizationGuidance?.automation}
                  Social: {generatedPlan?.channelOptimizationGuidance?.social}
                
              
            

            {/* Performance Learnings */}
            {generatedPlan?.performanceLearnings && (
              
                
                  
                  Performance learnings (recent campaigns)
                
                {generatedPlan.performanceLearnings}
              
            )}

            {generatedPlan?.outcomeModel?.primarySuccessCriteria ? (
              
                Outcome model
                
                  Primary success criteria: {generatedPlan.outcomeModel.primarySuccessCriteria}
                
              
            ) : null}
          
        
      )}

      {socialPack && (
        
          
            Social Messaging Pack
            Aligned company and individual positioning variants
          
          
            
              Company LinkedIn Headline
              {socialPack?.companyProfile?.linkedinHeadline}
              Company About
              {socialPack?.companyProfile?.linkedinAbout}
            

            
              {(socialPack?.individualProfileVariants || []).map((variant: any, index: number) => (
                
                  {variant.role}
                  {variant.headline}
                  {variant.summary}
                
              ))}
            
          
        
      )}
    
  );
}