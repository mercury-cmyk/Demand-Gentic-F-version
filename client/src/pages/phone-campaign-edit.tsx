import { useState, useEffect } from "react";
import { useRoute, useLocation } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { ArrowLeft, Save, Phone, Users, Shield, Settings, Brain, Bot, Target, Package, ListChecks, X, Plus, Layers, Sparkles } from "lucide-react";
import { HybridAgentAssignment } from "@/components/hybrid-agent-assignment";
import { StepQAParameters } from "@/components/campaign-builder/step-qa-parameters";
import { CampaignContextRegenerate } from "@/components/campaigns/campaign-context-regenerate";
import { InlineOrgCreator } from "@/components/campaigns/inline-org-creator";
import { Checkbox } from "@/components/ui/checkbox";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { PhoneCampaignSuppressionManager } from "@/components/phone-campaign-suppression-manager";
import { CampaignKnowledgeConfig } from "@/components/campaigns/campaign-knowledge-config";
import { CampaignAudienceSelector, type AudienceSelection } from "@/components/campaigns/CampaignAudienceSelector";
import { CampaignContextEditor } from "@/components/campaigns/CampaignContextEditor";

export default function PhoneCampaignEditPage() {
  const [, paramsA] = useRoute("/campaigns/phone/:id/edit");
  const [, paramsB] = useRoute("/phone-campaigns/:id/edit");
  // Support /campaigns/:type/edit/:id pattern (e.g., /campaigns/appointment_generation/edit/:id)
  const [, paramsC] = useRoute("/campaigns/:type/edit/:id");
  const [, setLocation] = useLocation();
  const campaignId = paramsA?.id || paramsB?.id || paramsC?.id;
  const { toast } = useToast();

  // State for campaign fields
  const [name, setName] = useState("");
  const [selectedSegments, setSelectedSegments] = useState<string[]>([]);
  const [selectedLists, setSelectedLists] = useState<string[]>([]);
  const [selectedDomainSets, setSelectedDomainSets] = useState<string[]>([]);
  const [audienceSource, setAudienceSource] = useState<"filters" | "segment" | "list" | "domain_set">("segment");
  // Advanced filters + exclusions (parity with create workflow)
  const [filterGroup, setFilterGroup] = useState<any | undefined>(undefined);
  const [appliedFilterGroup, setAppliedFilterGroup] = useState<any | undefined>(undefined);
  const [excludedSegments, setExcludedSegments] = useState<string[]>([]);
  const [excludedLists, setExcludedLists] = useState<string[]>([]);

  // Campaign Context fields (replaces call script)
  const [campaignObjective, setCampaignObjective] = useState("");
  const [productServiceInfo, setProductServiceInfo] = useState("");
  const [talkingPoints, setTalkingPoints] = useState<string[]>([]);
  const [targetAudienceDescription, setTargetAudienceDescription] = useState("");
  const [successCriteria, setSuccessCriteria] = useState("");
  const [campaignObjections, setCampaignObjections] = useState<any[]>([]);

  // Account Cap state
  const [capEnabled, setCapEnabled] = useState(false);
  const [leadsPerAccount, setLeadsPerAccount] = useState(3);
  const [capMode, setCapMode] = useState<string>('queue_size');

  // QA Parameters state
  const [qaParameters, setQaParameters] = useState<any>(null);

  // Lead Delivery state
  const [deliveryTemplateId, setDeliveryTemplateId] = useState<string | null>(null);

  // Max Call Duration state (in seconds, default 240 = 4 minutes)
  const [maxCallDurationSeconds, setMaxCallDurationSeconds] = useState<number>(240);

  // Organization selection state
  const [problemIntelligenceOrgId, setProblemIntelligenceOrgId] = useState<string | null>(null);

  // Dial Mode state - AI Agent mode is the default and only supported mode
  const [dialMode, setDialMode] = useState<'ai_agent'>('ai_agent');

  // AI Agent Concurrency state (for ai_agent dial mode)
  const [maxConcurrentCalls, setMaxConcurrentCalls] = useState<number>(50);

  // Fetch campaign data - always refetch to ensure we have latest context fields
  const { data: campaign, isLoading: campaignLoading } = useQuery<any>({
    queryKey: [`/api/campaigns/${campaignId}`],
    enabled: !!campaignId,
    staleTime: 0, // Always consider data stale so it refetches
    refetchOnMount: 'always', // Force refetch when component mounts
  });

  // Fetch export templates for lead delivery
  const { data: exportTemplates = [] } = useQuery<any[]>({
    queryKey: ['/api/export-templates'],
  });

  // Fetch organizations for organization selection
  const { data: organizationsData } = useQuery<{ organizations: { id: string; name: string }[] }>({
    queryKey: ['/api/organizations/dropdown'],
  });

  // Initialize form with campaign data
  useEffect(() => {
    if (campaign) {
      setName(campaign.name || "");

      // Initialize Campaign Context fields
      setCampaignObjective(campaign.campaignObjective || "");
      setProductServiceInfo(campaign.productServiceInfo || "");
      setTalkingPoints(campaign.talkingPoints || []);
      setTargetAudienceDescription(campaign.targetAudienceDescription || "");
      setSuccessCriteria(campaign.successCriteria || "");
      setCampaignObjections(campaign.campaignObjections || []);

      // Initialize audience selections
      if (campaign.audienceRefs) {
        setSelectedSegments(campaign.audienceRefs.segments || []);
        setSelectedLists(campaign.audienceRefs.lists || []);
        setSelectedDomainSets(campaign.audienceRefs.domain_sets || []);
        setExcludedSegments(campaign.audienceRefs.excludedSegments || []);
        setExcludedLists(campaign.audienceRefs.excludedLists || []);
        setFilterGroup(campaign.audienceRefs.filterGroup || undefined);
        setAppliedFilterGroup(campaign.audienceRefs.filterGroup || undefined);

        // Determine source
        if (campaign.audienceRefs.filterGroup && (campaign.audienceRefs.filterGroup.conditions?.length ?? 0) > 0) {
          setAudienceSource("filters");
        } else if (campaign.audienceRefs.segments?.length > 0) {
          setAudienceSource("segment");
        } else if (campaign.audienceRefs.lists?.length > 0) {
          setAudienceSource("list");
        } else if (campaign.audienceRefs.domain_sets?.length > 0) {
          setAudienceSource("domain_set");
        }
      }

      // Initialize account cap
      if (campaign.accountCap) {
        setCapEnabled(campaign.accountCap.enabled || false);
        setLeadsPerAccount(campaign.accountCap.leadsPerAccount || 3);
        setCapMode(campaign.accountCap.mode || 'queue_size');
      }

      // Initialize QA parameters
      setQaParameters(campaign.qaParameters || null);

      // Initialize delivery template
      setDeliveryTemplateId(campaign.deliveryTemplateId || null);

      // Initialize max call duration
      setMaxCallDurationSeconds(campaign.maxCallDurationSeconds || 240);

      // Initialize organization
      setProblemIntelligenceOrgId(campaign.problemIntelligenceOrgId || null);

      // AI Agent mode is always used
      // setDialMode is not needed as it's always 'ai_agent'

      // Initialize AI Agent settings
      if (campaign.aiAgentSettings?.maxConcurrentCalls) {
        setMaxConcurrentCalls(campaign.aiAgentSettings.maxConcurrentCalls);
      }
    }
  }, [campaign]);

  // Update campaign mutation
  const updateMutation = useMutation({
    mutationFn: async (data: any) => {
      return await apiRequest('PATCH', `/api/campaigns/${campaignId}`, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/campaigns'], refetchType: 'active' });
      toast({
        title: "Success",
        description: "Campaign updated successfully",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message || "Failed to update campaign",
        variant: "destructive",
      });
    },
  });

  const handleSave = () => {
    // Validate required fields
    if (!name.trim()) {
      toast({
        title: "Validation Error",
        description: "Campaign name is required",
        variant: "destructive",
      });
      return;
    }

    // Build audienceRefs - preserve existing refs and update only the selected source
    const audienceRefs: any = { ...campaign?.audienceRefs };

    // Clear all audience sources first
    delete audienceRefs.segments;
    delete audienceRefs.lists;
    delete audienceRefs.domain_sets;
    delete audienceRefs.filterGroup;
    delete audienceRefs.excludedSegments;
    delete audienceRefs.excludedLists;

    // Set only the selected source
    if (audienceSource === 'filters' && filterGroup && (filterGroup.conditions?.length ?? 0) > 0) {
      audienceRefs.filterGroup = filterGroup;
    } else if (audienceSource === 'segment' && selectedSegments.length > 0) {
      audienceRefs.segments = selectedSegments;
    } else if (audienceSource === 'list' && selectedLists.length > 0) {
      audienceRefs.lists = selectedLists;
    } else if (audienceSource === 'domain_set' && selectedDomainSets.length > 0) {
      audienceRefs.domain_sets = selectedDomainSets;
    }

    // Validate audience selection
    if (!audienceRefs.filterGroup && !audienceRefs.segments && !audienceRefs.lists && !audienceRefs.domain_sets) {
      toast({
        title: "Validation Error",
        description: "Please select at least one audience (segment, list, or domain set)",
        variant: "destructive",
      });
      return;
    }

    // Persist exclusions when present
    if (excludedSegments.length > 0) {
      audienceRefs.excludedSegments = excludedSegments;
    }
    if (excludedLists.length > 0) {
      audienceRefs.excludedLists = excludedLists;
    }

    // Build account cap
    const accountCap = capEnabled ? {
      enabled: true,
      leadsPerAccount,
      mode: capMode,
    } : null;

    // Build AI Agent settings (merge with existing to preserve other settings)
    // AI Agent mode is always enabled
    const aiAgentSettings = {
      ...(campaign?.aiAgentSettings || {}),
      maxConcurrentCalls,
    };

    updateMutation.mutate({
      name,
      audienceRefs,
      accountCap,
      qaParameters,
      deliveryTemplateId,
      // Max call duration enforcement
      maxCallDurationSeconds,
      // Organization assignment
      problemIntelligenceOrgId,
      // Dial mode
      dialMode,
      // AI Agent settings (includes concurrency)
      aiAgentSettings,
      // Campaign Context fields
      campaignObjective,
      productServiceInfo,
      talkingPoints: talkingPoints.length > 0 ? talkingPoints : undefined,
      targetAudienceDescription,
      successCriteria,
      campaignObjections: campaignObjections.length > 0 ? campaignObjections : undefined,
    });
  };

  if (campaignLoading) {
    return (
      <div className="container mx-auto p-6 space-y-6">
        <Skeleton className="h-12 w-full" />
        <Skeleton className="h-96 w-full" />
      </div>
    );
  }

  if (!campaign) {
    return (
      <div className="container mx-auto p-6">
        <Card>
          <CardHeader>
            <CardTitle>Campaign Not Found</CardTitle>
            <CardDescription>
              The requested phone campaign could not be found.
            </CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  return (
    <div className="container mx-auto p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button 
            variant="outline" 
            size="icon" 
            onClick={() => setLocation('/phone-campaigns')}
            data-testid="button-back"
          >
            <ArrowLeft className="w-4 h-4" />
          </Button>
          <div>
            <h1 className="text-2xl font-bold">Edit Phone Campaign</h1>
            <p className="text-muted-foreground">{campaign.name}</p>
          </div>
        </div>
        <Button 
          onClick={handleSave} 
          disabled={updateMutation.isPending}
          data-testid="button-save"
        >
          <Save className="w-4 h-4 mr-2" />
          Save Changes
        </Button>
      </div>

      {/* Campaign Status Badge */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex items-center gap-2">
            <Label>Status:</Label>
            <Badge variant={campaign.status === 'active' ? 'default' : 'secondary'}>
              {campaign.status}
            </Badge>
          </div>
        </CardContent>
      </Card>

      {/* Tabs for different sections */}
      <Tabs defaultValue="basic" className="space-y-4">
        <TabsList className="grid w-full grid-cols-7">
          <TabsTrigger value="basic" data-testid="tab-basic">
            <Phone className="w-4 h-4 mr-2" />
            Basic Info
          </TabsTrigger>
          <TabsTrigger value="audience" data-testid="tab-audience">
            <Users className="w-4 h-4 mr-2" />
            Audience
          </TabsTrigger>
          <TabsTrigger value="agents" data-testid="tab-agents">
            <Bot className="w-4 h-4 mr-2" />
            Agents
          </TabsTrigger>
          <TabsTrigger value="knowledge" data-testid="tab-knowledge">
            <Layers className="w-4 h-4 mr-2" />
            Knowledge
          </TabsTrigger>
          <TabsTrigger value="qa-parameters" data-testid="tab-qa-parameters">
            <Brain className="w-4 h-4 mr-2" />
            AI Quality
          </TabsTrigger>
          <TabsTrigger value="suppressions" data-testid="tab-suppressions">
            <Shield className="w-4 h-4 mr-2" />
            Suppressions
          </TabsTrigger>
          <TabsTrigger value="settings" data-testid="tab-settings">
            <Settings className="w-4 h-4 mr-2" />
            Settings
          </TabsTrigger>
        </TabsList>

        {/* Basic Info Tab */}
        <TabsContent value="basic" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Basic Information</CardTitle>
              <CardDescription>
                Update campaign name and organization
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="name">Campaign Name</Label>
                <Input
                  id="name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Enter campaign name"
                  data-testid="input-name"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="organization">Organization</Label>
                <div className="flex gap-2">
                  <Select
                    value={problemIntelligenceOrgId || "none"}
                    onValueChange={(value) => setProblemIntelligenceOrgId(value === "none" ? null : value)}
                  >
                    <SelectTrigger data-testid="select-organization" className="flex-1">
                      <SelectValue placeholder="Select organization (optional)" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">No organization</SelectItem>
                      {organizationsData?.organizations?.map((org) => (
                        <SelectItem key={org.id} value={org.id}>
                          {org.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <InlineOrgCreator
                    onOrgCreated={(orgId) => setProblemIntelligenceOrgId(orgId)}
                    triggerVariant="button"
                    triggerSize="default"
                  />
                </div>
                <p className="text-xs text-muted-foreground">
                  Link this campaign to an organization to use its Problem Intelligence and messaging context
                </p>
              </div>
            </CardContent>
          </Card>

          {/* Campaign Context Section */}
          <CampaignContextEditor
            data={{
              campaignObjective,
              productServiceInfo,
              talkingPoints,
              targetAudienceDescription,
              successCriteria,
              campaignObjections,
            }}
            onChange={(newData) => {
              setCampaignObjective(newData.campaignObjective);
              setProductServiceInfo(newData.productServiceInfo);
              setTalkingPoints(newData.talkingPoints);
              setTargetAudienceDescription(newData.targetAudienceDescription);
              setSuccessCriteria(newData.successCriteria);
              setCampaignObjections(newData.campaignObjections || []);
            }}
            headerAction={
              <CampaignContextRegenerate
                currentContext={{
                  campaignObjective,
                  productServiceInfo,
                  talkingPoints,
                  targetAudienceDescription,
                  successCriteria,
                }}
                onApply={(generated) => {
                  setCampaignObjective(generated.campaignObjective);
                  setProductServiceInfo(generated.productServiceInfo);
                  setTalkingPoints(generated.talkingPoints);
                  setTargetAudienceDescription(generated.targetAudienceDescription);
                  setSuccessCriteria(generated.successCriteria);
                }}
                campaignName={name}
              />
            }
          />
        </TabsContent>

        {/* Audience Tab */}
        <TabsContent value="audience" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Audience Selection</CardTitle>
              <CardDescription>
                Choose the target audience for this campaign
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <CampaignAudienceSelector
                value={{
                  source: audienceSource,
                  selectedSegments,
                  selectedLists,
                  selectedDomainSets,
                  excludedSegments,
                  excludedLists,
                  filterGroup
                }}
                onChange={(newSelection) => {
                  setAudienceSource(newSelection.source);
                  setSelectedSegments(newSelection.selectedSegments || []);
                  setSelectedLists(newSelection.selectedLists || []);
                  setSelectedDomainSets(newSelection.selectedDomainSets || []);
                  setExcludedSegments(newSelection.excludedSegments || []);
                  setExcludedLists(newSelection.excludedLists || []);
                  setFilterGroup(newSelection.filterGroup);
                  setAppliedFilterGroup(newSelection.filterGroup);
                }}
                hideSummary={false}
              />
            </CardContent>
          </Card>
        </TabsContent>

        {/* Agents Tab */}
        <TabsContent value="agents" className="space-y-4">
          <HybridAgentAssignment campaignId={campaignId!} />
        </TabsContent>

        {/* Knowledge Blocks Tab */}
        <TabsContent value="knowledge" className="space-y-4">
          {campaignId && <CampaignKnowledgeConfig campaignId={campaignId} />}
        </TabsContent>

        {/* QA Parameters Tab */}
        <TabsContent value="qa-parameters" className="space-y-4">
          <StepQAParameters
            data={{
              qaParameters,
              campaignObjective,
              productServiceInfo,
              talkingPoints,
              targetAudienceDescription,
              successCriteria,
            }}
            onChange={(data) => setQaParameters(data.qaParameters)}
            onNext={() => {}}
          />
        </TabsContent>

        {/* Suppressions Tab */}
        <TabsContent value="suppressions" className="space-y-4">
          <PhoneCampaignSuppressionManager campaignId={campaignId!} />
        </TabsContent>

        {/* Settings Tab */}
        <TabsContent value="settings" className="space-y-4">
          {/* AI Agent Mode */}
          <Card className="border-primary/30 bg-primary/5">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Bot className="w-5 h-5 text-primary" />
                AI Voice Agent Mode
              </CardTitle>
              <CardDescription>
                AI voice agent handles calls autonomously using Gemini Live voice technology
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* AI Agent Concurrency Settings */}
              <div className="space-y-2">
                <Label htmlFor="max-concurrent-calls">Max Concurrent Calls</Label>
                <Input
                  id="max-concurrent-calls"
                  type="number"
                  min="1"
                  max="100"
                  value={maxConcurrentCalls}
                  onChange={(e) => setMaxConcurrentCalls(Math.max(1, Math.min(100, parseInt(e.target.value) || 1)))}
                  data-testid="input-max-concurrent-calls"
                />
                <p className="text-sm text-muted-foreground">
                  Maximum number of simultaneous AI calls for this campaign (1-100)
                </p>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Account Lead Cap</CardTitle>
              <CardDescription>
                Limit the number of contacts attempted per account
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center space-x-2">
                <Checkbox
                  id="cap-enabled"
                  checked={capEnabled}
                  onCheckedChange={(checked) => setCapEnabled(checked as boolean)}
                  data-testid="checkbox-cap-enabled"
                />
                <Label htmlFor="cap-enabled" className="cursor-pointer">
                  Enable Account Lead Cap
                </Label>
              </div>

              {capEnabled && (
                <div className="space-y-4 pl-6 border-l-2 border-primary/20">
                  <div className="space-y-2">
                    <Label htmlFor="leads-per-account">Maximum Leads per Account</Label>
                    <Input
                      id="leads-per-account"
                      type="number"
                      min="1"
                      max="50"
                      value={leadsPerAccount}
                      onChange={(e) => setLeadsPerAccount(parseInt(e.target.value) || 1)}
                      data-testid="input-leads-per-account"
                    />
                    <p className="text-sm text-muted-foreground">
                      Maximum number of contacts to attempt per account
                    </p>
                  </div>

                  <div className="space-y-2">
                    <Label>Enforcement Mode</Label>
                    <RadioGroup value={capMode} onValueChange={setCapMode}>
                      <div className="flex items-center space-x-2">
                        <RadioGroupItem value="queue_size" id="mode-queue" data-testid="radio-mode-queue" />
                        <Label htmlFor="mode-queue" className="cursor-pointer">
                          Queue Size (limit contacts added to queue)
                        </Label>
                      </div>
                      <div className="flex items-center space-x-2">
                        <RadioGroupItem value="connected_calls" id="mode-connected" data-testid="radio-mode-connected" />
                        <Label htmlFor="mode-connected" className="cursor-pointer">
                          Connected Calls (limit based on successful connections)
                        </Label>
                      </div>
                      <div className="flex items-center space-x-2">
                        <RadioGroupItem value="positive_disp" id="mode-positive" data-testid="radio-mode-positive" />
                        <Label htmlFor="mode-positive" className="cursor-pointer">
                          Positive Dispositions (limit based on interested/qualified outcomes)
                        </Label>
                      </div>
                    </RadioGroup>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Max Call Duration */}
          <Card>
            <CardHeader>
              <CardTitle>Max Call Duration</CardTitle>
              <CardDescription>
                Strictly enforce a maximum call duration for all AI voice calls in this campaign
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="max-call-duration">Maximum Duration (seconds)</Label>
                <Input
                  id="max-call-duration"
                  type="number"
                  min="60"
                  max="1800"
                  step="30"
                  value={maxCallDurationSeconds}
                  onChange={(e) => setMaxCallDurationSeconds(Math.max(60, Math.min(1800, parseInt(e.target.value) || 240)))}
                  data-testid="input-max-call-duration"
                />
                <p className="text-sm text-muted-foreground">
                  Calls will be automatically ended after this duration. Range: 60-1800 seconds (1-30 minutes).
                  Current: {Math.floor(maxCallDurationSeconds / 60)} min {maxCallDurationSeconds % 60} sec
                </p>
              </div>
              <div className="flex gap-2 flex-wrap">
                <Button variant="outline" size="sm" onClick={() => setMaxCallDurationSeconds(120)}>2 min</Button>
                <Button variant="outline" size="sm" onClick={() => setMaxCallDurationSeconds(180)}>3 min</Button>
                <Button variant="outline" size="sm" onClick={() => setMaxCallDurationSeconds(240)}>4 min</Button>
                <Button variant="outline" size="sm" onClick={() => setMaxCallDurationSeconds(300)}>5 min</Button>
                <Button variant="outline" size="sm" onClick={() => setMaxCallDurationSeconds(600)}>10 min</Button>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Lead Delivery Template</CardTitle>
              <CardDescription>
                Configure how qualified leads are formatted when delivered via webhook
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="delivery-template">Export Template</Label>
                <Select 
                  value={deliveryTemplateId || "none"} 
                  onValueChange={(value) => setDeliveryTemplateId(value === "none" ? null : value)}
                >
                  <SelectTrigger data-testid="select-delivery-template">
                    <SelectValue placeholder="Select delivery template (optional)" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">No template (raw data)</SelectItem>
                    {exportTemplates.map((template: any) => (
                      <SelectItem key={template.id} value={template.id}>
                        {template.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-sm text-muted-foreground">
                  When a lead is QA approved, it will be automatically formatted using this template and delivered via the configured webhook.
                  Configure delivery webhooks in Campaign Orders.
                </p>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
