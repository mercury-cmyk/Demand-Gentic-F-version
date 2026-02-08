import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Zap, Settings, Clock, Bot, User, MessageSquare, Shield, PhoneForwarded, Sparkles, Loader2, Globe, Calendar, Target, Package, ListChecks, Users, AlertCircle, Plus, X, ChevronDown, ChevronUp } from "lucide-react";
import { cn } from "@/lib/utils";
import { useMutation } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

// Import voices from shared constants
import { ALL_VOICES } from '@/lib/voice-constants';

interface Step2bDialModeConfigProps {
  data: any;
  onNext: (data: any) => void;
  onBack: () => void;
}

type DialMode = 'ai_agent';
// Native live voices
type AiVoice = string;
type HandoffTrigger = 'decision_maker_reached' | 'explicit_request' | 'complex_objection' | 'pricing_discussion' | 'technical_question' | 'angry_prospect';

// Use imported voices
const AI_VOICES = ALL_VOICES.map(v => ({
  value: v.id as AiVoice,
  label: v.provider === 'openai' ? `${v.name} (OpenAI)` : v.name,
  description: `${v.description} (${v.gender === 'male' ? 'Male' : 'Female'})`,
  gender: v.gender,
  provider: v.provider,
}));

const HANDOFF_TRIGGERS: { value: HandoffTrigger; label: string }[] = [
  { value: 'decision_maker_reached', label: 'Decision maker reached' },
  { value: 'explicit_request', label: 'Prospect asks to speak with human' },
  { value: 'complex_objection', label: 'Complex objection detected' },
  { value: 'pricing_discussion', label: 'Pricing negotiation needed' },
  { value: 'technical_question', label: 'Technical questions arise' },
  { value: 'angry_prospect', label: 'Negative sentiment detected' },
];

export function Step2bDialModeConfig({ data, onNext, onBack }: Step2bDialModeConfigProps) {
  const { toast } = useToast();
  // AI Agent mode is the only supported dial mode
  const dialMode: DialMode = 'ai_agent';
  const [campaignBrief, setCampaignBrief] = useState('');

  // AI Agent Settings
  const [aiPersonaName, setAiPersonaName] = useState(data.aiAgentSettings?.persona?.name || '');
  const [aiCompanyName, setAiCompanyName] = useState(data.aiAgentSettings?.persona?.companyName || '');
  const [aiRole, setAiRole] = useState(data.aiAgentSettings?.persona?.role || 'Sales Representative');
  const [aiVoice, setAiVoice] = useState<AiVoice>(data.aiAgentSettings?.persona?.voice || 'Fenrir');
  
  // AI Scripts
  const [aiOpeningScript, setAiOpeningScript] = useState(data.aiAgentSettings?.scripts?.opening || '');
  const [aiGatekeeperScript, setAiGatekeeperScript] = useState(data.aiAgentSettings?.scripts?.gatekeeper || '');
  const [aiPitchScript, setAiPitchScript] = useState(data.aiAgentSettings?.scripts?.pitch || '');
  const [aiObjectionsScript, setAiObjectionsScript] = useState(data.aiAgentSettings?.scripts?.objections || '');
  const [aiClosingScript, setAiClosingScript] = useState(data.aiAgentSettings?.scripts?.closing || '');
  
  // AI Handoff Settings
  const [handoffEnabled, setHandoffEnabled] = useState(data.aiAgentSettings?.handoff?.enabled ?? true);
  const [handoffTriggers, setHandoffTriggers] = useState<HandoffTrigger[]>(
    data.aiAgentSettings?.handoff?.triggers || ['decision_maker_reached', 'explicit_request']
  );
  const [handoffTransferNumber, setHandoffTransferNumber] = useState(data.aiAgentSettings?.handoff?.transferNumber || '');
  
  // Gatekeeper Logic
  const [gatekeeperMaxAttempts, setGatekeeperMaxAttempts] = useState(data.aiAgentSettings?.gatekeeperLogic?.maxAttempts || 3);

  // AI Agent Concurrency Settings
  const [maxConcurrentCalls, setMaxConcurrentCalls] = useState(data.aiAgentSettings?.maxConcurrentCalls || 50);

  // Business Hours Settings
  const [businessHoursEnabled, setBusinessHoursEnabled] = useState(data.aiAgentSettings?.businessHours?.enabled ?? true);
  const [businessHoursTimezone, setBusinessHoursTimezone] = useState(data.aiAgentSettings?.businessHours?.timezone || 'America/New_York');
  const [businessHoursStart, setBusinessHoursStart] = useState(data.aiAgentSettings?.businessHours?.startTime || '09:00');
  const [businessHoursEnd, setBusinessHoursEnd] = useState(data.aiAgentSettings?.businessHours?.endTime || '17:00');
  const [respectContactTimezone, setRespectContactTimezone] = useState(data.aiAgentSettings?.businessHours?.respectContactTimezone ?? true);
  const [operatingDays, setOperatingDays] = useState<string[]>(
    data.aiAgentSettings?.businessHours?.operatingDays || ['monday', 'tuesday', 'wednesday', 'thursday', 'friday']
  );

  // Campaign AI Context (Foundation + Campaign Layer Architecture)
  const [campaignObjective, setCampaignObjective] = useState(data.campaignObjective || '');
  const [productServiceInfo, setProductServiceInfo] = useState(data.productServiceInfo || '');
  const [talkingPoints, setTalkingPoints] = useState<string[]>(data.talkingPoints || []);
  const [newTalkingPoint, setNewTalkingPoint] = useState('');
  const [targetAudienceDescription, setTargetAudienceDescription] = useState(data.targetAudienceDescription || '');
  const [campaignObjections, setCampaignObjections] = useState<Array<{ objection: string; response: string }>>(
    data.campaignObjections || []
  );
  const [newObjection, setNewObjection] = useState('');
  const [newObjectionResponse, setNewObjectionResponse] = useState('');
  const [successCriteria, setSuccessCriteria] = useState(data.successCriteria || '');
  const [showLegacyScripts, setShowLegacyScripts] = useState(false);

  // AI Script Generation
  const generateScriptsMutation = useMutation({
    mutationFn: async (brief: string) => {
      const response = await apiRequest('POST', '/api/ai-calls/generate-scripts', {
        campaignBrief: brief,
        companyName: aiCompanyName,
        agentName: aiPersonaName,
        agentRole: aiRole,
      });
      const data = await response.json();
      return data as { success: boolean; scripts: { opening: string; gatekeeper: string; pitch: string; objections: string; closing: string } };
    },
    onSuccess: (data) => {
      if (data.scripts) {
        setAiOpeningScript(data.scripts.opening);
        setAiGatekeeperScript(data.scripts.gatekeeper);
        setAiPitchScript(data.scripts.pitch);
        setAiObjectionsScript(data.scripts.objections);
        setAiClosingScript(data.scripts.closing);
        toast({
          title: "Scripts Generated",
          description: "AI has generated optimized call scripts based on your brief.",
        });
      }
    },
    onError: (error: Error) => {
      toast({
        title: "Generation Failed",
        description: error.message || "Failed to generate scripts. Please try again.",
        variant: "destructive",
      });
    },
  });

  const handleGenerateScripts = () => {
    if (campaignBrief.length < 20) {
      toast({
        title: "Brief Too Short",
        description: "Please enter at least 20 characters describing your campaign.",
        variant: "destructive",
      });
      return;
    }
    generateScriptsMutation.mutate(campaignBrief);
  };

  const handleSubmit = () => {
    // AI Agent mode is always enabled
    const aiAgentSettings = {
      persona: {
        name: aiPersonaName,
        companyName: aiCompanyName,
        role: aiRole,
        voice: aiVoice,
      },
      scripts: {
        opening: aiOpeningScript,
        gatekeeper: aiGatekeeperScript,
        pitch: aiPitchScript,
        objections: aiObjectionsScript,
        closing: aiClosingScript,
      },
      handoff: {
        enabled: handoffEnabled,
        triggers: handoffTriggers,
        transferNumber: handoffTransferNumber,
      },
      gatekeeperLogic: {
        maxAttempts: gatekeeperMaxAttempts,
      },
      businessHours: {
        enabled: businessHoursEnabled,
        timezone: businessHoursTimezone,
        startTime: businessHoursStart,
        endTime: businessHoursEnd,
        respectContactTimezone: respectContactTimezone,
        operatingDays: operatingDays,
      },
      maxConcurrentCalls,
    };

    onNext({
      dialMode,
      aiAgentSettings,
      // Campaign AI Context fields (Foundation + Campaign Layer Architecture)
      campaignObjective,
      productServiceInfo,
      talkingPoints: talkingPoints.length > 0 ? talkingPoints : undefined,
      targetAudienceDescription,
      campaignObjections: campaignObjections.length > 0 ? campaignObjections : undefined,
      successCriteria,
    });
  };

  const toggleHandoffTrigger = (trigger: HandoffTrigger) => {
    setHandoffTriggers(prev =>
      prev.includes(trigger)
        ? prev.filter(t => t !== trigger)
        : [...prev, trigger]
    );
  };

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

  // Campaign Objections management
  const addObjection = () => {
    if (newObjection.trim() && newObjectionResponse.trim()) {
      setCampaignObjections(prev => [...prev, { objection: newObjection.trim(), response: newObjectionResponse.trim() }]);
      setNewObjection('');
      setNewObjectionResponse('');
    }
  };

  const removeObjection = (index: number) => {
    setCampaignObjections(prev => prev.filter((_, i) => i !== index));
  };

  return (
    <div className="space-y-6">
      {/* AI Voice Agent Mode Header */}
      <Card className="border-primary bg-primary/5">
        <CardHeader className="pb-3">
          <div className="flex items-center gap-3">
            <Bot className="w-6 h-6 text-primary" />
            <div>
              <CardTitle className="text-lg">AI Voice Agent Mode</CardTitle>
              <CardDescription className="mt-1">
                Intelligent AI agents handle calls autonomously using live voice technology
              </CardDescription>
            </div>
          </div>
        </CardHeader>
      </Card>

      {/* AI Agent Mode Settings */}
      {/* AI Persona Configuration */}
          <Card>
            <CardHeader>
              <div className="flex items-center gap-2">
                <User className="w-5 h-5" />
                <CardTitle>AI Persona</CardTitle>
              </div>
              <CardDescription>
                Configure how your AI agent introduces itself and its voice characteristics
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="ai-persona-name">Agent Name</Label>
                  <Input
                    id="ai-persona-name"
                    placeholder="e.g., Sarah, Michael"
                    value={aiPersonaName}
                    onChange={(e) => setAiPersonaName(e.target.value)}
                    data-testid="input-ai-persona-name"
                  />
                  <p className="text-xs text-muted-foreground">The name the AI will use to introduce itself</p>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="ai-company-name">Company Name</Label>
                  <Input
                    id="ai-company-name"
                    placeholder="e.g., Pivotal Solutions"
                    value={aiCompanyName}
                    onChange={(e) => setAiCompanyName(e.target.value)}
                    data-testid="input-ai-company-name"
                  />
                  <p className="text-xs text-muted-foreground">Your company name for introductions</p>
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="ai-role">Agent Role/Title</Label>
                <Input
                  id="ai-role"
                  placeholder="e.g., Business Development Representative"
                  value={aiRole}
                  onChange={(e) => setAiRole(e.target.value)}
                  data-testid="input-ai-role"
                />
              </div>

              <div className="space-y-3">
                <Label>Voice Selection</Label>
                <div className="grid grid-cols-3 gap-2">
                  {AI_VOICES.map((voice) => (
                    <Card
                      key={voice.value}
                      className={cn(
                        "cursor-pointer transition-colors hover-elevate",
                        aiVoice === voice.value && "border-primary bg-primary/5"
                      )}
                      onClick={() => setAiVoice(voice.value)}
                      data-testid={`card-voice-${voice.value}`}
                    >
                      <CardContent className="p-3">
                        <div className="font-medium text-sm">{voice.label}</div>
                        <div className="text-xs text-muted-foreground">{voice.description}</div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              </div>
            </CardContent>
          </Card>

          {/* AI Agent Concurrency Settings */}
          <Card>
            <CardHeader>
              <div className="flex items-center gap-2">
                <Zap className="w-5 h-5" />
                <CardTitle>Concurrency Settings</CardTitle>
              </div>
              <CardDescription>
                Configure how many simultaneous calls the AI agent can handle
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
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
                <p className="text-xs text-muted-foreground">
                  Maximum number of simultaneous AI calls for this campaign (1-100). Higher values allow faster outreach but require more capacity.
                </p>
              </div>
            </CardContent>
          </Card>

          {/* Campaign AI Context - Foundation + Campaign Layer Architecture */}
          <Card className="border-primary/30 bg-primary/5">
            <CardHeader>
              <div className="flex items-center gap-2">
                <Target className="w-5 h-5 text-primary" />
                <CardTitle>Campaign Context for AI Agent</CardTitle>
                <span className="px-2 py-0.5 text-xs font-medium rounded-full bg-primary/20 text-primary">Recommended</span>
              </div>
              <CardDescription>
                Define what this campaign is about. The AI agent will use this context along with its
                foundational training to have informed conversations.
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
                  placeholder="Describe your product/service, key features, and value proposition. The AI will use this to explain what you offer naturally in conversation..."
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
                  Add the main points the AI should emphasize during conversations.
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
                <p className="text-xs text-muted-foreground">Who are you trying to reach? The AI will tailor its approach accordingly.</p>
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

          {/* Campaign-Specific Objections */}
          <Card>
            <CardHeader>
              <div className="flex items-center gap-2">
                <AlertCircle className="w-5 h-5" />
                <CardTitle>Campaign-Specific Objection Handling</CardTitle>
              </div>
              <CardDescription>
                Add objections specific to this campaign. The AI agent already knows general objection
                handling - add only campaign-specific responses here.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {campaignObjections.length > 0 && (
                <div className="space-y-3">
                  {campaignObjections.map((obj, index) => (
                    <div key={index} className="p-3 bg-muted rounded-lg space-y-2">
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex-1">
                          <p className="text-sm font-medium">"{obj.objection}"</p>
                          <p className="text-sm text-muted-foreground mt-1">Response: {obj.response}</p>
                        </div>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => removeObjection(index)}
                          className="h-6 w-6 p-0 text-muted-foreground hover:text-destructive"
                        >
                          <X className="w-4 h-4" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              <div className="space-y-3 p-3 border rounded-lg border-dashed">
                <div className="space-y-2">
                  <Label htmlFor="new-objection" className="text-sm">Objection</Label>
                  <Input
                    id="new-objection"
                    placeholder='e.g., "We already have a security solution"'
                    value={newObjection}
                    onChange={(e) => setNewObjection(e.target.value)}
                    data-testid="input-new-objection"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="new-objection-response" className="text-sm">Response</Label>
                  <Textarea
                    id="new-objection-response"
                    placeholder="That makes sense. How is it working for you? Many of our clients found that..."
                    value={newObjectionResponse}
                    onChange={(e) => setNewObjectionResponse(e.target.value)}
                    rows={2}
                    data-testid="textarea-new-objection-response"
                  />
                </div>
                <Button
                  variant="outline"
                  onClick={addObjection}
                  disabled={!newObjection.trim() || !newObjectionResponse.trim()}
                  className="w-full"
                  data-testid="button-add-objection"
                >
                  <Plus className="w-4 h-4 mr-2" />
                  Add Objection & Response
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* Legacy Scripts Section - Collapsible */}
          <Card className="border-muted">
            <CardHeader
              className="cursor-pointer hover:bg-muted/50 transition-colors"
              onClick={() => setShowLegacyScripts(!showLegacyScripts)}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <MessageSquare className="w-5 h-5 text-muted-foreground" />
                  <CardTitle className="text-muted-foreground">Advanced: Legacy Scripts</CardTitle>
                </div>
                {showLegacyScripts ? (
                  <ChevronUp className="w-5 h-5 text-muted-foreground" />
                ) : (
                  <ChevronDown className="w-5 h-5 text-muted-foreground" />
                )}
              </div>
              <CardDescription>
                Detailed conversation scripts for specific scenarios. The Campaign Context above is usually sufficient.
              </CardDescription>
            </CardHeader>
            {showLegacyScripts && (
              <CardContent className="space-y-4">
                {/* AI Script Generator */}
                <Card className="bg-gradient-to-r from-primary/5 to-primary/10 border-primary/20">
                  <CardContent className="pt-4 space-y-3">
                    <div className="flex items-center gap-2">
                      <Sparkles className="w-4 h-4 text-primary" />
                      <Label className="font-semibold">Generate Scripts with AI</Label>
                    </div>
                    <p className="text-sm text-muted-foreground">
                      Describe your campaign and let AI generate optimized call scripts for you.
                    </p>
                    <Textarea
                      placeholder="E.g., We're a B2B software company selling cloud security solutions to mid-market IT directors. Our main value proposition is reducing security incidents by 60% while cutting costs. We want to book demo meetings..."
                      value={campaignBrief}
                      onChange={(e) => setCampaignBrief(e.target.value)}
                      rows={4}
                      data-testid="textarea-campaign-brief"
                    />
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-muted-foreground">
                        {campaignBrief.length}/20 characters minimum
                      </span>
                      <Button
                        onClick={handleGenerateScripts}
                        disabled={generateScriptsMutation.isPending || campaignBrief.length < 20}
                        data-testid="button-generate-scripts"
                      >
                        {generateScriptsMutation.isPending ? (
                          <>
                            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                            Generating...
                          </>
                        ) : (
                          <>
                            <Sparkles className="w-4 h-4 mr-2" />
                            Generate Scripts
                          </>
                        )}
                      </Button>
                    </div>
                  </CardContent>
                </Card>

                <Separator />

                <div className="space-y-2">
                  <Label htmlFor="ai-opening">Opening Script</Label>
                  <Textarea
                    id="ai-opening"
                    placeholder="Hi, this is {{agentName}} from {{companyName}}. I'm reaching out to speak with {{firstName}} {{lastName}} regarding..."
                    value={aiOpeningScript}
                    onChange={(e) => setAiOpeningScript(e.target.value)}
                    rows={3}
                    data-testid="textarea-ai-opening"
                  />
                  <p className="text-xs text-muted-foreground">Initial greeting when call connects</p>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="ai-gatekeeper">Gatekeeper Script</Label>
                  <Textarea
                    id="ai-gatekeeper"
                    placeholder="I'm calling from {{companyName}} regarding a business matter for {{firstName}}. Would you be able to connect me, or could I leave a message?"
                    value={aiGatekeeperScript}
                    onChange={(e) => setAiGatekeeperScript(e.target.value)}
                    rows={3}
                    data-testid="textarea-ai-gatekeeper"
                  />
                  <p className="text-xs text-muted-foreground">Professional responses when speaking with receptionists or assistants</p>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="ai-pitch">Main Pitch Script</Label>
                  <Textarea
                    id="ai-pitch"
                    placeholder="The reason for my call is to discuss how {{companyName}} can help your organization with..."
                    value={aiPitchScript}
                    onChange={(e) => setAiPitchScript(e.target.value)}
                    rows={4}
                    data-testid="textarea-ai-pitch"
                  />
                  <p className="text-xs text-muted-foreground">Core telemarketing message for decision makers</p>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="ai-objections">Objection Handling</Label>
                  <Textarea
                    id="ai-objections"
                    placeholder="Common objections and responses. Format: 'Not interested' -> 'I completely understand. Many of our current clients felt the same way initially...'"
                    value={aiObjectionsScript}
                    onChange={(e) => setAiObjectionsScript(e.target.value)}
                    rows={4}
                    data-testid="textarea-ai-objections"
                  />
                  <p className="text-xs text-muted-foreground">How to respond to common objections</p>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="ai-closing">Closing Script</Label>
                  <Textarea
                    id="ai-closing"
                    placeholder="Thank you for your time, {{firstName}}. I'll have one of our specialists follow up with more details..."
                    value={aiClosingScript}
                    onChange={(e) => setAiClosingScript(e.target.value)}
                    rows={3}
                    data-testid="textarea-ai-closing"
                  />
                  <p className="text-xs text-muted-foreground">How to end calls professionally</p>
                </div>
              </CardContent>
            )}
          </Card>

          {/* Gatekeeper Navigation */}
          <Card>
            <CardHeader>
              <div className="flex items-center gap-2">
                <Shield className="w-5 h-5" />
                <CardTitle>Gatekeeper Navigation</CardTitle>
              </div>
              <CardDescription>
                Configure how the AI handles gatekeepers and receptionists
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="gatekeeper-max-attempts">Maximum Navigation Attempts</Label>
                <Select
                  value={gatekeeperMaxAttempts.toString()}
                  onValueChange={(v) => setGatekeeperMaxAttempts(parseInt(v))}
                >
                  <SelectTrigger data-testid="select-gatekeeper-attempts">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="1">1 attempt</SelectItem>
                    <SelectItem value="2">2 attempts</SelectItem>
                    <SelectItem value="3">3 attempts (recommended)</SelectItem>
                    <SelectItem value="4">4 attempts</SelectItem>
                    <SelectItem value="5">5 attempts</SelectItem>
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  How many times to attempt reaching the decision maker before scheduling callback
                </p>
              </div>
            </CardContent>
          </Card>

          {/* Human Handoff Configuration */}
          <Card>
            <CardHeader>
              <div className="flex items-center gap-2">
                <PhoneForwarded className="w-5 h-5" />
                <CardTitle>Human Handoff</CardTitle>
              </div>
              <CardDescription>
                Configure when and how to transfer calls to live human agents
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <Label htmlFor="handoff-enabled" className="font-medium">Enable Human Handoff</Label>
                  <p className="text-sm text-muted-foreground">Allow AI to transfer calls to live agents</p>
                </div>
                <Switch
                  id="handoff-enabled"
                  checked={handoffEnabled}
                  onCheckedChange={setHandoffEnabled}
                  data-testid="switch-handoff-enabled"
                />
              </div>

              {handoffEnabled && (
                <>
                  <div className="space-y-2">
                    <Label htmlFor="handoff-number">Transfer Phone Number</Label>
                    <Input
                      id="handoff-number"
                      placeholder="+1 (555) 123-4567"
                      value={handoffTransferNumber}
                      onChange={(e) => setHandoffTransferNumber(e.target.value)}
                      data-testid="input-handoff-number"
                    />
                    <p className="text-xs text-muted-foreground">Phone number or extension to transfer qualified calls to</p>
                  </div>

                  <div className="space-y-3">
                    <Label>Handoff Triggers</Label>
                    <p className="text-xs text-muted-foreground mb-2">
                      Select when the AI should transfer to a human agent
                    </p>
                    <div className="grid grid-cols-2 gap-2">
                      {HANDOFF_TRIGGERS.map((trigger) => (
                        <div
                          key={trigger.value}
                          className="flex items-center space-x-2"
                        >
                          <Checkbox
                            id={`trigger-${trigger.value}`}
                            checked={handoffTriggers.includes(trigger.value)}
                            onCheckedChange={() => toggleHandoffTrigger(trigger.value)}
                            data-testid={`checkbox-trigger-${trigger.value}`}
                          />
                          <Label
                            htmlFor={`trigger-${trigger.value}`}
                            className="text-sm font-normal cursor-pointer"
                          >
                            {trigger.label}
                          </Label>
                        </div>
                      ))}
                    </div>
                  </div>
                </>
              )}
            </CardContent>
          </Card>

          {/* Business Hours Configuration */}
          <Card>
            <CardHeader>
              <div className="flex items-center gap-2">
                <Clock className="w-5 h-5" />
                <CardTitle>Business Hours</CardTitle>
              </div>
              <CardDescription>
                AI calls will only be placed during business hours based on the contact's local timezone
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <Label htmlFor="bh-enabled" className="font-medium">Enforce Business Hours</Label>
                  <p className="text-sm text-muted-foreground">Only place calls during configured hours</p>
                </div>
                <Switch
                  id="bh-enabled"
                  checked={businessHoursEnabled}
                  onCheckedChange={setBusinessHoursEnabled}
                  data-testid="switch-business-hours-enabled"
                />
              </div>

              {businessHoursEnabled && (
                <>
                  <div className="flex items-center justify-between">
                    <div>
                      <Label htmlFor="bh-respect-tz" className="font-medium">
                        <Globe className="w-4 h-4 inline mr-1" />
                        Respect Contact Timezone
                      </Label>
                      <p className="text-sm text-muted-foreground">Use contact's local timezone instead of campaign timezone</p>
                    </div>
                    <Switch
                      id="bh-respect-tz"
                      checked={respectContactTimezone}
                      onCheckedChange={setRespectContactTimezone}
                      data-testid="switch-respect-contact-tz"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="bh-timezone">Default Timezone</Label>
                      <Select value={businessHoursTimezone} onValueChange={setBusinessHoursTimezone}>
                        <SelectTrigger data-testid="select-timezone">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="America/New_York">Eastern (New York)</SelectItem>
                          <SelectItem value="America/Chicago">Central (Chicago)</SelectItem>
                          <SelectItem value="America/Denver">Mountain (Denver)</SelectItem>
                          <SelectItem value="America/Los_Angeles">Pacific (Los Angeles)</SelectItem>
                          <SelectItem value="America/Anchorage">Alaska</SelectItem>
                          <SelectItem value="Pacific/Honolulu">Hawaii</SelectItem>
                          <SelectItem value="Europe/London">UK (London)</SelectItem>
                          <SelectItem value="Europe/Paris">Central Europe (Paris)</SelectItem>
                          <SelectItem value="Asia/Tokyo">Japan (Tokyo)</SelectItem>
                          <SelectItem value="Australia/Sydney">Australia (Sydney)</SelectItem>
                        </SelectContent>
                      </Select>
                      <p className="text-xs text-muted-foreground">Fallback when contact timezone unknown</p>
                    </div>

                    <div className="space-y-2">
                      <Label>Operating Hours</Label>
                      <div className="flex items-center gap-2">
                        <Select value={businessHoursStart} onValueChange={setBusinessHoursStart}>
                          <SelectTrigger className="w-24" data-testid="select-start-time">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="08:00">8:00 AM</SelectItem>
                            <SelectItem value="08:30">8:30 AM</SelectItem>
                            <SelectItem value="09:00">9:00 AM</SelectItem>
                            <SelectItem value="09:30">9:30 AM</SelectItem>
                            <SelectItem value="10:00">10:00 AM</SelectItem>
                          </SelectContent>
                        </Select>
                        <span className="text-muted-foreground">to</span>
                        <Select value={businessHoursEnd} onValueChange={setBusinessHoursEnd}>
                          <SelectTrigger className="w-24" data-testid="select-end-time">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="16:00">4:00 PM</SelectItem>
                            <SelectItem value="16:30">4:30 PM</SelectItem>
                            <SelectItem value="17:00">5:00 PM</SelectItem>
                            <SelectItem value="17:30">5:30 PM</SelectItem>
                            <SelectItem value="18:00">6:00 PM</SelectItem>
                            <SelectItem value="18:30">6:30 PM</SelectItem>
                            <SelectItem value="19:00">7:00 PM</SelectItem>
                            <SelectItem value="20:00">8:00 PM</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                  </div>

                  <div className="space-y-3">
                    <Label>
                      <Calendar className="w-4 h-4 inline mr-1" />
                      Operating Days
                    </Label>
                    <div className="flex flex-wrap gap-2">
                      {['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'].map((day) => (
                        <div
                          key={day}
                          className={cn(
                            "px-3 py-1.5 rounded-md text-sm cursor-pointer border transition-colors",
                            operatingDays.includes(day) 
                              ? "bg-primary text-primary-foreground border-primary" 
                              : "bg-muted border-border hover-elevate"
                          )}
                          onClick={() => {
                            setOperatingDays(prev => 
                              prev.includes(day) 
                                ? prev.filter(d => d !== day)
                                : [...prev, day]
                            );
                          }}
                          data-testid={`toggle-day-${day}`}
                        >
                          {day.charAt(0).toUpperCase() + day.slice(1, 3)}
                        </div>
                      ))}
                    </div>
                    <p className="text-xs text-muted-foreground">
                      US federal holidays are automatically excluded
                    </p>
                  </div>
                </>
              )}
            </CardContent>
          </Card>

          {/* Lead & QA Integration Notice */}
          <Card className="bg-muted/50">
            <CardContent className="pt-4">
              <div className="flex items-start gap-3">
                <Settings className="w-5 h-5 text-muted-foreground mt-0.5" />
                <div>
                  <p className="font-medium text-sm">Lead & QA Integration</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    AI agent calls follow the same workflow as human agents: leads are created automatically, 
                    dispositions are logged, recordings are synced, and all calls go through your standard QA process.
                    Configure QA parameters in the next steps.
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

      {/* Navigation */}
      <div className="flex justify-end gap-3">
        <Button variant="outline" onClick={onBack} data-testid="button-back">
          Back
        </Button>
        <Button onClick={handleSubmit} data-testid="button-next">
          Continue to Scheduling
        </Button>
      </div>
    </div>
  );
}

