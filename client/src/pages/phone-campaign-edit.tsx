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
import { ArrowLeft, Save, Phone, Users, Shield, Settings, Brain, Bot, Target, Package, ListChecks, X, Plus } from "lucide-react";
import { HybridAgentAssignment } from "@/components/hybrid-agent-assignment";
import { StepQAParameters } from "@/components/campaign-builder/step-qa-parameters";
import { Checkbox } from "@/components/ui/checkbox";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { PhoneCampaignSuppressionManager } from "@/components/phone-campaign-suppression-manager";

export default function PhoneCampaignEditPage() {
  const [, params] = useRoute("/campaigns/phone/:id/edit");
  const [, setLocation] = useLocation();
  const campaignId = params?.id;
  const { toast } = useToast();

  // State for campaign fields
  const [name, setName] = useState("");
  const [selectedSegments, setSelectedSegments] = useState<string[]>([]);
  const [selectedLists, setSelectedLists] = useState<string[]>([]);
  const [selectedDomainSets, setSelectedDomainSets] = useState<string[]>([]);
  const [audienceSource, setAudienceSource] = useState<"segment" | "list" | "domain_set">("segment");

  // Campaign Context fields (replaces call script)
  const [campaignObjective, setCampaignObjective] = useState("");
  const [productServiceInfo, setProductServiceInfo] = useState("");
  const [talkingPoints, setTalkingPoints] = useState<string[]>([]);
  const [newTalkingPoint, setNewTalkingPoint] = useState("");
  const [targetAudienceDescription, setTargetAudienceDescription] = useState("");
  const [successCriteria, setSuccessCriteria] = useState("");

  // Account Cap state
  const [capEnabled, setCapEnabled] = useState(false);
  const [leadsPerAccount, setLeadsPerAccount] = useState(3);
  const [capMode, setCapMode] = useState<string>('queue_size');

  // QA Parameters state
  const [qaParameters, setQaParameters] = useState<any>(null);

  // Lead Delivery state
  const [deliveryTemplateId, setDeliveryTemplateId] = useState<string | null>(null);

  // Fetch campaign data
  const { data: campaign, isLoading: campaignLoading } = useQuery<any>({
    queryKey: [`/api/campaigns/${campaignId}`],
    enabled: !!campaignId,
  });

  // Fetch segments
  const { data: segments = [] } = useQuery<any[]>({
    queryKey: ['/api/segments'],
  });

  // Fetch lists
  const { data: lists = [] } = useQuery<any[]>({
    queryKey: ['/api/lists'],
  });

  // Fetch domain sets
  const { data: domainSets = [] } = useQuery<any[]>({
    queryKey: ['/api/domain-sets'],
  });

  // Fetch export templates for lead delivery
  const { data: exportTemplates = [] } = useQuery<any[]>({
    queryKey: ['/api/export-templates'],
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

      // Initialize audience selections
      if (campaign.audienceRefs) {
        setSelectedSegments(campaign.audienceRefs.segments || []);
        setSelectedLists(campaign.audienceRefs.lists || []);
        setSelectedDomainSets(campaign.audienceRefs.domain_sets || []);

        // Determine source
        if (campaign.audienceRefs.segments?.length > 0) {
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
    }
  }, [campaign]);

  // Talking Points management
  const addTalkingPoint = () => {
    if (newTalkingPoint.trim()) {
      setTalkingPoints(prev => [...prev, newTalkingPoint.trim()]);
      setNewTalkingPoint('');
    }
  };

  const removeTalkingPoint = (index: number) => {
    setTalkingPoints(prev => prev.filter((_, i) => i !== index));
  };

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

    // Set only the selected source
    if (audienceSource === 'segment' && selectedSegments.length > 0) {
      audienceRefs.segments = selectedSegments;
    } else if (audienceSource === 'list' && selectedLists.length > 0) {
      audienceRefs.lists = selectedLists;
    } else if (audienceSource === 'domain_set' && selectedDomainSets.length > 0) {
      audienceRefs.domain_sets = selectedDomainSets;
    }

    // Validate audience selection
    if (!audienceRefs.segments && !audienceRefs.lists && !audienceRefs.domain_sets) {
      toast({
        title: "Validation Error",
        description: "Please select at least one audience (segment, list, or domain set)",
        variant: "destructive",
      });
      return;
    }

    // Build account cap
    const accountCap = capEnabled ? {
      enabled: true,
      leadsPerAccount,
      mode: capMode,
    } : null;

    updateMutation.mutate({
      name,
      audienceRefs,
      accountCap,
      qaParameters,
      deliveryTemplateId,
      // Campaign Context fields
      campaignObjective,
      productServiceInfo,
      talkingPoints: talkingPoints.length > 0 ? talkingPoints : undefined,
      targetAudienceDescription,
      successCriteria,
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
            onClick={() => setLocation('/campaigns/telemarketing')}
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
        <TabsList className="grid w-full grid-cols-6">
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
                Update campaign name
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
            </CardContent>
          </Card>

          {/* Campaign Context Section */}
          <Card className="border-primary/30 bg-primary/5">
            <CardHeader>
              <div className="flex items-center gap-2">
                <Target className="w-5 h-5 text-primary" />
                <CardTitle>Campaign Context</CardTitle>
              </div>
              <CardDescription>
                Define the campaign goals and context. This information will be displayed to agents during calls
                to help them understand the campaign objectives and have informed conversations.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* Campaign Objective */}
              <div className="space-y-2">
                <Label htmlFor="campaign-objective">Campaign Objective</Label>
                <Textarea
                  id="campaign-objective"
                  placeholder="e.g., Book qualified meetings with IT decision makers interested in cloud security solutions"
                  value={campaignObjective}
                  onChange={(e) => setCampaignObjective(e.target.value)}
                  rows={2}
                  data-testid="textarea-campaign-objective"
                />
                <p className="text-xs text-muted-foreground">What is the primary goal of each call?</p>
              </div>

              {/* Product/Service Info */}
              <div className="space-y-2">
                <Label htmlFor="product-service-info">
                  <Package className="w-4 h-4 inline mr-1" />
                  Product/Service Information
                </Label>
                <Textarea
                  id="product-service-info"
                  placeholder="Describe your product/service, key features, and value proposition..."
                  value={productServiceInfo}
                  onChange={(e) => setProductServiceInfo(e.target.value)}
                  rows={4}
                  data-testid="textarea-product-info"
                />
              </div>

              {/* Key Talking Points */}
              <div className="space-y-3">
                <Label>
                  <ListChecks className="w-4 h-4 inline mr-1" />
                  Key Talking Points
                </Label>
                <p className="text-xs text-muted-foreground">
                  Add the main points agents should emphasize during conversations.
                </p>
                <div className="space-y-2">
                  {talkingPoints.map((point, index) => (
                    <div key={index} className="flex items-center gap-2 p-2 bg-muted rounded-md">
                      <span className="flex-1 text-sm">{point}</span>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => removeTalkingPoint(index)}
                        className="h-6 w-6 p-0 text-muted-foreground hover:text-destructive"
                      >
                        <X className="w-4 h-4" />
                      </Button>
                    </div>
                  ))}
                  <div className="flex gap-2">
                    <Input
                      placeholder="e.g., Reduces security incidents by 40%"
                      value={newTalkingPoint}
                      onChange={(e) => setNewTalkingPoint(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), addTalkingPoint())}
                      data-testid="input-new-talking-point"
                    />
                    <Button variant="outline" onClick={addTalkingPoint} data-testid="button-add-talking-point">
                      <Plus className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              </div>

              {/* Target Audience */}
              <div className="space-y-2">
                <Label htmlFor="target-audience">
                  <Users className="w-4 h-4 inline mr-1" />
                  Target Audience
                </Label>
                <Textarea
                  id="target-audience"
                  placeholder="e.g., CISOs and IT Directors at mid-market companies (500-5000 employees) in healthcare and finance"
                  value={targetAudienceDescription}
                  onChange={(e) => setTargetAudienceDescription(e.target.value)}
                  rows={2}
                  data-testid="textarea-target-audience"
                />
                <p className="text-xs text-muted-foreground">Who are you trying to reach?</p>
              </div>

              {/* Success Criteria */}
              <div className="space-y-2">
                <Label htmlFor="success-criteria">Success Criteria</Label>
                <Textarea
                  id="success-criteria"
                  placeholder="e.g., Meeting booked with decision maker, or referral to correct contact"
                  value={successCriteria}
                  onChange={(e) => setSuccessCriteria(e.target.value)}
                  rows={2}
                  data-testid="textarea-success-criteria"
                />
                <p className="text-xs text-muted-foreground">What counts as a successful call outcome?</p>
              </div>
            </CardContent>
          </Card>
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
              <div className="space-y-2">
                <Label>Audience Source</Label>
                <RadioGroup value={audienceSource} onValueChange={(value: any) => setAudienceSource(value)}>
                  <div className="flex items-center space-x-2">
                    <RadioGroupItem value="segment" id="segment" data-testid="radio-segment" />
                    <Label htmlFor="segment">Segments</Label>
                  </div>
                  <div className="flex items-center space-x-2">
                    <RadioGroupItem value="list" id="list" data-testid="radio-list" />
                    <Label htmlFor="list">Lists</Label>
                  </div>
                  <div className="flex items-center space-x-2">
                    <RadioGroupItem value="domain_set" id="domain_set" data-testid="radio-domain-set" />
                    <Label htmlFor="domain_set">Domain Sets</Label>
                  </div>
                </RadioGroup>
              </div>

              {/* Segments Selection */}
              {audienceSource === "segment" && (
                <div className="space-y-2">
                  <Label>Select Segments</Label>
                  <div className="border rounded-lg p-4 space-y-2 max-h-64 overflow-y-auto">
                    {segments.map((segment: any) => (
                      <div key={segment.id} className="flex items-center space-x-2">
                        <Checkbox
                          id={`segment-${segment.id}`}
                          checked={selectedSegments.includes(segment.id)}
                          onCheckedChange={(checked) => {
                            if (checked) {
                              setSelectedSegments([...selectedSegments, segment.id]);
                            } else {
                              setSelectedSegments(selectedSegments.filter(id => id !== segment.id));
                            }
                          }}
                          data-testid={`checkbox-segment-${segment.id}`}
                        />
                        <Label htmlFor={`segment-${segment.id}`} className="cursor-pointer">
                          {segment.name}
                        </Label>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Lists Selection */}
              {audienceSource === "list" && (
                <div className="space-y-2">
                  <Label>Select Lists</Label>
                  <div className="border rounded-lg p-4 space-y-2 max-h-64 overflow-y-auto">
                    {lists.map((list: any) => (
                      <div key={list.id} className="flex items-center space-x-2">
                        <Checkbox
                          id={`list-${list.id}`}
                          checked={selectedLists.includes(list.id)}
                          onCheckedChange={(checked) => {
                            if (checked) {
                              setSelectedLists([...selectedLists, list.id]);
                            } else {
                              setSelectedLists(selectedLists.filter(id => id !== list.id));
                            }
                          }}
                          data-testid={`checkbox-list-${list.id}`}
                        />
                        <Label htmlFor={`list-${list.id}`} className="cursor-pointer">
                          {list.name}
                        </Label>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Domain Sets Selection */}
              {audienceSource === "domain_set" && (
                <div className="space-y-2">
                  <Label>Select Domain Sets</Label>
                  <div className="border rounded-lg p-4 space-y-2 max-h-64 overflow-y-auto">
                    {domainSets.map((domainSet: any) => (
                      <div key={domainSet.id} className="flex items-center space-x-2">
                        <Checkbox
                          id={`domain-set-${domainSet.id}`}
                          checked={selectedDomainSets.includes(domainSet.id)}
                          onCheckedChange={(checked) => {
                            if (checked) {
                              setSelectedDomainSets([...selectedDomainSets, domainSet.id]);
                            } else {
                              setSelectedDomainSets(selectedDomainSets.filter(id => id !== domainSet.id));
                            }
                          }}
                          data-testid={`checkbox-domain-set-${domainSet.id}`}
                        />
                        <Label htmlFor={`domain-set-${domainSet.id}`} className="cursor-pointer">
                          {domainSet.name}
                        </Label>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Agents Tab */}
        <TabsContent value="agents" className="space-y-4">
          <HybridAgentAssignment campaignId={campaignId!} />
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
