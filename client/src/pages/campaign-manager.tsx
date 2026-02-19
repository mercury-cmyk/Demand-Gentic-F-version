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
import { Loader2, Wand2, Save, CheckCircle2, Megaphone, Share2, Calendar, Target } from "lucide-react";

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

const now = new Date();
const defaultQuarter = Math.floor(now.getMonth() / 3) + 1;
const defaultYear = now.getFullYear();

export default function CampaignManagerPage() {
  const { toast } = useToast();
  const [selectedCampaignId, setSelectedCampaignId] = useState<string>("");
  const [campaignName, setCampaignName] = useState<string>("");
  const [targetMarket, setTargetMarket] = useState<string>("Mid-market and enterprise B2B organizations");
  const [primaryGoal, setPrimaryGoal] = useState<string>("Generate qualified pipeline and increase meeting conversion quality");
  const [valueProposition, setValueProposition] = useState<string>("Unify outbound demand generation with reasoning-first orchestration across email, phone, automation, and social narrative");
  const [keyChallenges, setKeyChallenges] = useState<string>("Low conversion quality; channel fragmentation; inconsistent positioning");
  const [quarter, setQuarter] = useState<string>(String(defaultQuarter));
  const [year, setYear] = useState<string>(String(defaultYear));
  const [internalOnly, setInternalOnly] = useState<boolean>(true);
  const [includeEmail, setIncludeEmail] = useState<boolean>(true);
  const [includePhone, setIncludePhone] = useState<boolean>(true);
  const [includeAutomation, setIncludeAutomation] = useState<boolean>(true);
  const [includeSocial, setIncludeSocial] = useState<boolean>(true);
  const [generatedPlan, setGeneratedPlan] = useState<any | null>(null);
  const [socialPack, setSocialPack] = useState<any | null>(null);

  const { data: campaigns = [], isLoading: campaignsLoading } = useQuery<CampaignOption[]>({
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
  } = useQuery<SavedPlanResponse>({
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
      if (q >= 1 && q <= 4) setQuarter(String(q));
    }
    if (savedPlanData.plan?.meta?.year) {
      const y = Number(savedPlanData.plan.meta.year);
      if (Number.isFinite(y)) setYear(String(y));
    }
    if (typeof savedPlanData.plan?.meta?.scope === "string") {
      setInternalOnly(savedPlanData.plan.meta.scope === "internal-first");
    }

    if (savedPlanData.plan?.campaignSourceContext?.campaignObjective) {
      setPrimaryGoal(savedPlanData.plan.campaignSourceContext.campaignObjective);
    }

    if (savedPlanData.plan?.campaignSourceContext?.productServiceInfo) {
      setValueProposition(savedPlanData.plan.campaignSourceContext.productServiceInfo);
    }

    if (savedPlanData.plan?.campaignSourceContext?.inheritedTalkingPoints?.length) {
      setKeyChallenges(savedPlanData.plan.campaignSourceContext.inheritedTalkingPoints.join("; "));
    }
  }, [savedPlanData]);

  const selectedCampaign = useMemo(
    () => campaigns.find((campaign) => campaign.id === selectedCampaignId) || null,
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
      return res.json() as Promise<GeneratedPlanResponse>;
    },
    onSuccess: (data) => {
      setGeneratedPlan(data.plan);
      toast({
        title: "Quarterly plan generated",
        description: "Campaign strategy, channel playbooks, and social narrative are ready for review.",
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

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border bg-gradient-to-r from-indigo-600 via-violet-600 to-purple-600 text-white p-6 shadow-lg">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-2">
              <Megaphone className="h-5 w-5" />
              <p className="text-sm uppercase tracking-wide text-white/80">Campaign Manager</p>
            </div>
            <h1 className="text-3xl font-semibold">AI Quarterly Campaign Manager</h1>
            <p className="text-white/80 mt-2 max-w-3xl">
              Internal-first planning workspace for positioning, messaging architecture, cross-channel strategy,
              governance approvals, and social narrative consistency.
            </p>
          </div>
          <Badge className="bg-white/20 text-white border-white/30">Internal-first</Badge>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Plan Inputs</CardTitle>
          <CardDescription>Define the campaign context and generate a structured quarterly plan.</CardDescription>
        </CardHeader>
        <CardContent className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label>Select campaign (optional but recommended)</Label>
            <Select value={selectedCampaignId} onValueChange={(value) => setSelectedCampaignId(value)}>
              <SelectTrigger>
                <SelectValue placeholder={campaignsLoading ? "Loading campaigns..." : "Choose campaign"} />
              </SelectTrigger>
              <SelectContent>
                {campaigns.map((campaign) => (
                  <SelectItem key={campaign.id} value={campaign.id}>
                    {campaign.name} ({campaign.type})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {selectedCampaignId && (
              <p className="text-xs text-muted-foreground flex items-center gap-1">
                {loadingSavedPlan ? <Loader2 className="h-3 w-3 animate-spin" /> : null}
                {loadingSavedPlan ? "Loading saved campaign plan..." : savedPlanData?.plan ? "Loaded saved campaign plan." : "No saved plan found yet for this campaign."}
              </p>
            )}
          </div>

          <div className="space-y-2">
            <Label>Campaign display name (optional)</Label>
            <Input value={campaignName} onChange={(event) => setCampaignName(event.target.value)} placeholder="Q2 Enterprise ABM - Finance" />
          </div>

          <div className="space-y-2">
            <Label>Target market</Label>
            <Input value={targetMarket} onChange={(event) => setTargetMarket(event.target.value)} />
          </div>

          <div className="space-y-2">
            <Label>Primary goal</Label>
            <Input value={primaryGoal} onChange={(event) => setPrimaryGoal(event.target.value)} />
          </div>

          <div className="space-y-2 lg:col-span-2">
            <Label>Value proposition</Label>
            <Textarea value={valueProposition} onChange={(event) => setValueProposition(event.target.value)} rows={3} />
          </div>

          <div className="space-y-2 lg:col-span-2">
            <Label>Key challenges (separate with semicolons)</Label>
            <Textarea value={keyChallenges} onChange={(event) => setKeyChallenges(event.target.value)} rows={2} />
          </div>

          <div className="space-y-2">
            <Label>Quarter</Label>
            <Select value={quarter} onValueChange={setQuarter}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="1">Q1</SelectItem>
                <SelectItem value="2">Q2</SelectItem>
                <SelectItem value="3">Q3</SelectItem>
                <SelectItem value="4">Q4</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>Year</Label>
            <Input type="number" value={year} onChange={(event) => setYear(event.target.value)} />
          </div>

          <div className="lg:col-span-2 space-y-3">
            <Label>Channels</Label>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <div className="flex items-center justify-between border rounded-lg p-3"><span className="text-sm">Email</span><Switch checked={includeEmail} onCheckedChange={setIncludeEmail} /></div>
              <div className="flex items-center justify-between border rounded-lg p-3"><span className="text-sm">Phone</span><Switch checked={includePhone} onCheckedChange={setIncludePhone} /></div>
              <div className="flex items-center justify-between border rounded-lg p-3"><span className="text-sm">Automation</span><Switch checked={includeAutomation} onCheckedChange={setIncludeAutomation} /></div>
              <div className="flex items-center justify-between border rounded-lg p-3"><span className="text-sm">Social</span><Switch checked={includeSocial} onCheckedChange={setIncludeSocial} /></div>
            </div>
          </div>

          <div className="lg:col-span-2 flex items-center justify-between border rounded-lg p-3">
            <div>
              <Label className="text-sm">Internal-only mode</Label>
              <p className="text-xs text-muted-foreground">Keep planning and governance optimized for inside sales and internal ops.</p>
            </div>
            <Switch checked={internalOnly} onCheckedChange={setInternalOnly} />
          </div>

          <div className="lg:col-span-2 flex flex-wrap gap-3">
            <Button onClick={() => generatePlanMutation.mutate()} disabled={generatePlanMutation.isPending || selectedChannels.length === 0}>
              {generatePlanMutation.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Wand2 className="h-4 w-4 mr-2" />}Generate plan
            </Button>
            <Button variant="outline" onClick={() => savePlanMutation.mutate()} disabled={!generatedPlan || !selectedCampaignId || savePlanMutation.isPending}>
              {savePlanMutation.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Save className="h-4 w-4 mr-2" />}Save to campaign
            </Button>
            <Button variant="outline" onClick={() => approvePlanMutation.mutate()} disabled={!selectedCampaignId || approvePlanMutation.isPending}>
              {approvePlanMutation.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <CheckCircle2 className="h-4 w-4 mr-2" />}Approve plan
            </Button>
            <Button variant="outline" onClick={() => generateSocialMutation.mutate()} disabled={!selectedCampaignId || generateSocialMutation.isPending}>
              {generateSocialMutation.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Share2 className="h-4 w-4 mr-2" />}Generate social pack
            </Button>
          </div>
        </CardContent>
      </Card>

      {generatedPlan && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><Target className="h-5 w-5" />Generated Quarterly Plan</CardTitle>
            <CardDescription>
              {generatedPlan?.meta?.window?.label || "Quarter"} · {selectedCampaign?.name || campaignName || "Unbound Campaign"}
            </CardDescription>
            {selectedCampaignId && savedPlanData && (
              <div className="pt-2 flex flex-wrap items-center gap-2">
                <Badge variant={savedPlanData.approvalStatus === "approved" ? "default" : "secondary"}>
                  {savedPlanData.approvalStatus || "draft"}
                </Badge>
                {savedPlanData.approvedAt ? (
                  <span className="text-xs text-muted-foreground">
                    Approved at {new Date(savedPlanData.approvedAt).toLocaleString()}
                  </span>
                ) : null}
              </div>
            )}
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div className="rounded-lg border p-3">
                <p className="text-xs text-muted-foreground">Cadence</p>
                <p className="font-medium">{generatedPlan?.meta?.cadence || "quarterly"}</p>
              </div>
              <div className="rounded-lg border p-3">
                <p className="text-xs text-muted-foreground">Window</p>
                <p className="font-medium flex items-center gap-1"><Calendar className="h-3.5 w-3.5" />{generatedPlan?.meta?.window?.label || "-"}</p>
              </div>
              <div className="rounded-lg border p-3">
                <p className="text-xs text-muted-foreground">Channels</p>
                <p className="font-medium">{selectedChannels.join(", ")}</p>
              </div>
            </div>

            <div className="rounded-lg border p-4">
              <h4 className="font-semibold mb-2">Core narrative</h4>
              <p className="text-sm text-muted-foreground">
                {generatedPlan?.messagingArchitecture?.coreNarrative || "No narrative generated."}
              </p>
            </div>

            <div className="rounded-lg border p-4">
              <h4 className="font-semibold mb-2">Product optimization focus</h4>
              <p className="text-sm text-muted-foreground mb-2">
                {generatedPlan?.productPositioning?.summary || "No product summary available."}
              </p>
              {(generatedPlan?.productPositioning?.keyProductMessages || []).length > 0 ? (
                <ul className="list-disc list-inside text-sm text-muted-foreground space-y-1">
                  {(generatedPlan?.productPositioning?.keyProductMessages || []).slice(0, 6).map((message: string, index: number) => (
                    <li key={`product-message-${index}`}>{message}</li>
                  ))}
                </ul>
              ) : null}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="rounded-lg border p-4">
                <h4 className="font-semibold mb-2">Key themes</h4>
                <ul className="list-disc list-inside text-sm text-muted-foreground space-y-1">
                  {(generatedPlan?.keyThemes || []).map((theme: string, index: number) => (
                    <li key={`theme-${index}`}>{theme}</li>
                  ))}
                </ul>
              </div>

              <div className="rounded-lg border p-4">
                <h4 className="font-semibold mb-2">Channel optimization</h4>
                <ul className="text-sm text-muted-foreground space-y-1">
                  <li><strong>Email:</strong> {generatedPlan?.channelOptimizationGuidance?.email}</li>
                  <li><strong>Phone:</strong> {generatedPlan?.channelOptimizationGuidance?.phone}</li>
                  <li><strong>Automation:</strong> {generatedPlan?.channelOptimizationGuidance?.automation}</li>
                  <li><strong>Social:</strong> {generatedPlan?.channelOptimizationGuidance?.social}</li>
                </ul>
              </div>
            </div>

            {generatedPlan?.outcomeModel?.primarySuccessCriteria ? (
              <div className="rounded-lg border p-4">
                <h4 className="font-semibold mb-2">Outcome model</h4>
                <p className="text-sm text-muted-foreground">
                  <strong>Primary success criteria:</strong> {generatedPlan.outcomeModel.primarySuccessCriteria}
                </p>
              </div>
            ) : null}
          </CardContent>
        </Card>
      )}

      {socialPack && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><Share2 className="h-5 w-5" />Social Messaging Pack</CardTitle>
            <CardDescription>Aligned company and individual positioning variants</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="rounded-lg border p-4">
              <p className="text-xs text-muted-foreground">Company LinkedIn Headline</p>
              <p className="font-medium">{socialPack?.companyProfile?.linkedinHeadline}</p>
              <p className="text-xs text-muted-foreground mt-2">Company About</p>
              <p className="text-sm">{socialPack?.companyProfile?.linkedinAbout}</p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              {(socialPack?.individualProfileVariants || []).map((variant: any, index: number) => (
                <div key={`variant-${index}`} className="rounded-lg border p-4">
                  <p className="text-xs text-muted-foreground">{variant.role}</p>
                  <p className="font-medium mt-1">{variant.headline}</p>
                  <p className="text-sm text-muted-foreground mt-2">{variant.summary}</p>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
