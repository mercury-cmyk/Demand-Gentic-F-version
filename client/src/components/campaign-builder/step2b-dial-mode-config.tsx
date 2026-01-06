import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Phone, Zap, Settings, Volume2, Clock, Bot, User, MessageSquare, Shield, PhoneForwarded, Sparkles, Loader2, Globe, Calendar } from "lucide-react";
import { cn } from "@/lib/utils";
import { useMutation } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

interface Step2bDialModeConfigProps {
  data: any;
  onNext: (data: any) => void;
  onBack: () => void;
}

type DialMode = 'manual' | 'hybrid' | 'ai_agent';
type AiVoice = 'alloy' | 'echo' | 'fable' | 'onyx' | 'nova' | 'shimmer';
type HandoffTrigger = 'decision_maker_reached' | 'explicit_request' | 'complex_objection' | 'pricing_discussion' | 'technical_question' | 'angry_prospect';

const AI_VOICES: { value: AiVoice; label: string; description: string }[] = [
  { value: 'alloy', label: 'Alloy', description: 'Balanced and versatile' },
  { value: 'echo', label: 'Echo', description: 'Warm and engaging' },
  { value: 'fable', label: 'Fable', description: 'Expressive and dynamic' },
  { value: 'onyx', label: 'Onyx', description: 'Deep and authoritative' },
  { value: 'nova', label: 'Nova', description: 'Friendly and upbeat' },
  { value: 'shimmer', label: 'Shimmer', description: 'Clear and professional' },
];

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
  const [dialMode, setDialMode] = useState<DialMode>(data.dialMode || 'manual');
  const [campaignBrief, setCampaignBrief] = useState('');
  const [amdEnabled, setAmdEnabled] = useState(data.hybridSettings?.amd?.enabled ?? true);
  const [amdConfidenceThreshold, setAmdConfidenceThreshold] = useState(
    data.hybridSettings?.amd?.confidenceThreshold ?? 0.70
  );
  const [amdTimeout, setAmdTimeout] = useState(data.hybridSettings?.amd?.timeout ?? 3000);
  const [unknownAction, setUnknownAction] = useState<'route_to_agent' | 'drop_silent'>(
    data.hybridSettings?.amd?.unknownAction || 'route_to_agent'
  );
  
  const [vmEnabled, setVmEnabled] = useState(data.hybridSettings?.voicemailPolicy?.enabled ?? false);
  const [vmAction, setVmAction] = useState<'leave_message' | 'schedule_callback' | 'drop_silent'>(
    data.hybridSettings?.voicemailPolicy?.action || 'leave_message'
  );
  const [vmMessage, setVmMessage] = useState(data.hybridSettings?.voicemailPolicy?.message || '');
  const [vmCampaignCap, setVmCampaignCap] = useState(data.hybridSettings?.voicemailPolicy?.campaign_daily_vm_cap || 100);
  const [vmContactCap, setVmContactCap] = useState(data.hybridSettings?.voicemailPolicy?.contact_vm_cap || 1);

  // AI Agent Settings
  const [aiPersonaName, setAiPersonaName] = useState(data.aiAgentSettings?.persona?.name || '');
  const [aiCompanyName, setAiCompanyName] = useState(data.aiAgentSettings?.persona?.companyName || '');
  const [aiRole, setAiRole] = useState(data.aiAgentSettings?.persona?.role || 'Sales Representative');
  const [aiVoice, setAiVoice] = useState<AiVoice>(data.aiAgentSettings?.persona?.voice || 'nova');
  
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

  // Business Hours Settings
  const [businessHoursEnabled, setBusinessHoursEnabled] = useState(data.aiAgentSettings?.businessHours?.enabled ?? true);
  const [businessHoursTimezone, setBusinessHoursTimezone] = useState(data.aiAgentSettings?.businessHours?.timezone || 'America/New_York');
  const [businessHoursStart, setBusinessHoursStart] = useState(data.aiAgentSettings?.businessHours?.startTime || '09:00');
  const [businessHoursEnd, setBusinessHoursEnd] = useState(data.aiAgentSettings?.businessHours?.endTime || '17:00');
  const [respectContactTimezone, setRespectContactTimezone] = useState(data.aiAgentSettings?.businessHours?.respectContactTimezone ?? true);
  const [operatingDays, setOperatingDays] = useState<string[]>(
    data.aiAgentSettings?.businessHours?.operatingDays || ['monday', 'tuesday', 'wednesday', 'thursday', 'friday']
  );

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
    const hybridSettings = dialMode === 'hybrid' ? {
      amd: {
        enabled: amdEnabled,
        confidenceThreshold: amdConfidenceThreshold,
        timeout: amdTimeout,
        unknownAction: unknownAction,
      },
      voicemailPolicy: vmEnabled ? {
        enabled: true,
        action: vmAction,
        message: vmMessage,
        campaign_daily_vm_cap: vmCampaignCap,
        contact_vm_cap: vmContactCap,
        region_blacklist: [],
      } : { enabled: false },
    } : undefined;

    const aiAgentSettings = dialMode === 'ai_agent' ? {
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
    } : undefined;

    onNext({
      dialMode,
      hybridSettings,
      aiAgentSettings,
    });
  };

  const toggleHandoffTrigger = (trigger: HandoffTrigger) => {
    setHandoffTriggers(prev => 
      prev.includes(trigger) 
        ? prev.filter(t => t !== trigger)
        : [...prev, trigger]
    );
  };

  return (
    <div className="space-y-6">
      {/* Dial Mode Selection */}
      <div className="space-y-4">
        <div>
          <Label className="text-base font-semibold">Select Dial Mode</Label>
          <p className="text-sm text-muted-foreground mt-1">
            Choose how calls will be initiated to your contacts
          </p>
        </div>

        <RadioGroup value={dialMode} onValueChange={(v) => setDialMode(v as DialMode)}>
          <Card className={cn(dialMode === 'manual' && "border-primary")}>
            <CardHeader className="pb-3">
              <div className="flex items-start gap-4">
                <RadioGroupItem value="manual" id="manual" className="mt-1" data-testid="radio-dial-mode-manual" />
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <Phone className="w-5 h-5 text-primary" />
                    <Label htmlFor="manual" className="text-base font-semibold cursor-pointer">
                      Manual Dial Mode
                    </Label>
                  </div>
                  <CardDescription className="mt-2">
                    Agents pull contacts from their queue and manually initiate calls. Best for personalized outreach and complex sales cycles.
                  </CardDescription>
                  <div className="mt-3 space-y-1 text-sm">
                    <div className="flex items-center gap-2 text-muted-foreground">
                      <div className="w-1.5 h-1.5 rounded-full bg-muted-foreground" />
                      Agent-driven queue with pull/lock workflow
                    </div>
                    <div className="flex items-center gap-2 text-muted-foreground">
                      <div className="w-1.5 h-1.5 rounded-full bg-muted-foreground" />
                      Campaign-level collision prevention
                    </div>
                    <div className="flex items-center gap-2 text-muted-foreground">
                      <div className="w-1.5 h-1.5 rounded-full bg-muted-foreground" />
                      Filter-based audience selection
                    </div>
                  </div>
                </div>
              </div>
            </CardHeader>
          </Card>

          <Card className={cn(dialMode === 'hybrid' && "border-primary")}>
            <CardHeader className="pb-3">
              <div className="flex items-start gap-4">
                <RadioGroupItem value="hybrid" id="hybrid" className="mt-1" data-testid="radio-dial-mode-hybrid" />
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <Zap className="w-5 h-5 text-primary" />
                    <Label htmlFor="hybrid" className="text-base font-semibold cursor-pointer">
                      Hybrid Mode (Humans + AI)
                    </Label>
                  </div>
                  <CardDescription className="mt-2">
                    Humans and AI agents share the same outbound queue with automated dialing and AMD detection. Perfect for scaling operations with both human and AI support.
                  </CardDescription>
                  <div className="mt-3 space-y-1 text-sm">
                    <div className="flex items-center gap-2 text-muted-foreground">
                      <div className="w-1.5 h-1.5 rounded-full bg-muted-foreground" />
                      Unified queue for humans and AI agents
                    </div>
                    <div className="flex items-center gap-2 text-muted-foreground">
                      <div className="w-1.5 h-1.5 rounded-full bg-muted-foreground" />
                      AMD with human-only routing
                    </div>
                    <div className="flex items-center gap-2 text-muted-foreground">
                      <div className="w-1.5 h-1.5 rounded-full bg-muted-foreground" />
                      Pacing engine with abandon-rate feedback (3% target)
                    </div>
                  </div>
                </div>
              </div>
            </CardHeader>
          </Card>

          <Card className={cn(dialMode === 'ai_agent' && "border-primary")}>
            <CardHeader className="pb-3">
              <div className="flex items-start gap-4">
                <RadioGroupItem value="ai_agent" id="ai_agent" className="mt-1" data-testid="radio-dial-mode-ai-agent" />
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <Bot className="w-5 h-5 text-primary" />
                    <Label htmlFor="ai_agent" className="text-base font-semibold cursor-pointer">
                      AI Voice Agent Mode
                    </Label>
                  </div>
                  <CardDescription className="mt-2">
                    Intelligent AI agents handle calls autonomously using natural voice. Navigate gatekeepers, deliver scripts, and hand off to human agents when needed.
                  </CardDescription>
                  <div className="mt-3 space-y-1 text-sm">
                    <div className="flex items-center gap-2 text-muted-foreground">
                      <div className="w-1.5 h-1.5 rounded-full bg-muted-foreground" />
                      OpenAI-powered natural voice conversations
                    </div>
                    <div className="flex items-center gap-2 text-muted-foreground">
                      <div className="w-1.5 h-1.5 rounded-full bg-muted-foreground" />
                      Intelligent gatekeeper navigation
                    </div>
                    <div className="flex items-center gap-2 text-muted-foreground">
                      <div className="w-1.5 h-1.5 rounded-full bg-muted-foreground" />
                      Same lead/QA workflow as human agents
                    </div>
                    <div className="flex items-center gap-2 text-muted-foreground">
                      <div className="w-1.5 h-1.5 rounded-full bg-muted-foreground" />
                      Smart handoff to live agents
                    </div>
                  </div>
                </div>
              </div>
            </CardHeader>
          </Card>
        </RadioGroup>
      </div>

      {/* Hybrid Mode Settings */}
      {dialMode === 'hybrid' && (
        <>
          <Separator />

          {/* AMD Configuration */}
          <Card>
            <CardHeader>
              <div className="flex items-center gap-2">
                <Settings className="w-5 h-5" />
                <CardTitle>Answering Machine Detection (AMD)</CardTitle>
              </div>
              <CardDescription>
                Configure how the system detects and handles answering machines
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <Label htmlFor="amd-enabled" className="font-medium">Enable AMD</Label>
                  <p className="text-sm text-muted-foreground">Automatically detect answering machines</p>
                </div>
                <Switch
                  id="amd-enabled"
                  checked={amdEnabled}
                  onCheckedChange={setAmdEnabled}
                  data-testid="switch-amd-enabled"
                />
              </div>

              {amdEnabled && (
                <>
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <Label>Confidence Threshold: {(amdConfidenceThreshold * 100).toFixed(0)}%</Label>
                      <span className="text-sm text-muted-foreground">
                        {amdConfidenceThreshold >= 0.8 ? 'High' : amdConfidenceThreshold >= 0.6 ? 'Medium' : 'Low'}
                      </span>
                    </div>
                    <Slider
                      value={[amdConfidenceThreshold * 100]}
                      onValueChange={([v]) => setAmdConfidenceThreshold(v / 100)}
                      min={50}
                      max={95}
                      step={5}
                      className="w-full"
                      data-testid="slider-amd-confidence"
                    />
                    <p className="text-xs text-muted-foreground">
                      Higher threshold = more accurate but may miss some machines. Recommended: 70%
                    </p>
                  </div>

                  <div className="space-y-3">
                    <Label>AMD Timeout</Label>
                    <Select value={amdTimeout.toString()} onValueChange={(v) => setAmdTimeout(parseInt(v))}>
                      <SelectTrigger data-testid="select-amd-timeout">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="2000">2 seconds</SelectItem>
                        <SelectItem value="3000">3 seconds (recommended)</SelectItem>
                        <SelectItem value="4000">4 seconds</SelectItem>
                        <SelectItem value="5000">5 seconds</SelectItem>
                      </SelectContent>
                    </Select>
                    <p className="text-xs text-muted-foreground">
                      How long to analyze the call before making a decision
                    </p>
                  </div>

                  <div className="space-y-3">
                    <Label>Unknown Result Action</Label>
                    <Select value={unknownAction} onValueChange={(v: any) => setUnknownAction(v)}>
                      <SelectTrigger data-testid="select-unknown-action">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="route_to_agent">Route to Agent (safer)</SelectItem>
                        <SelectItem value="drop_silent">Drop Silent</SelectItem>
                      </SelectContent>
                    </Select>
                    <p className="text-xs text-muted-foreground">
                      What to do when AMD confidence is below threshold
                    </p>
                  </div>
                </>
              )}
            </CardContent>
          </Card>

          {/* Voicemail Policy */}
          <Card>
            <CardHeader>
              <div className="flex items-center gap-2">
                <Volume2 className="w-5 h-5" />
                <CardTitle>Voicemail Policy</CardTitle>
              </div>
              <CardDescription>
                Configure what happens when a machine is detected
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <Label htmlFor="vm-enabled" className="font-medium">Enable Voicemail Handling</Label>
                  <p className="text-sm text-muted-foreground">Automatically handle detected voicemail</p>
                </div>
                <Switch
                  id="vm-enabled"
                  checked={vmEnabled}
                  onCheckedChange={setVmEnabled}
                  data-testid="switch-vm-enabled"
                />
              </div>

              {vmEnabled && (
                <>
                  <div className="space-y-3">
                    <Label>Voicemail Action</Label>
                    <Select value={vmAction} onValueChange={(v: any) => setVmAction(v)}>
                      <SelectTrigger data-testid="select-vm-action">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="leave_message">Leave Voice Message (TTS)</SelectItem>
                        <SelectItem value="schedule_callback">Schedule Callback</SelectItem>
                        <SelectItem value="drop_silent">Drop Silent</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  {vmAction === 'leave_message' && (
                    <div className="space-y-3">
                      <Label>Voicemail Message</Label>
                      <Textarea
                        placeholder="Enter your voicemail message. Use {{firstName}}, {{lastName}}, {{companyName}} for personalization."
                        value={vmMessage}
                        onChange={(e) => setVmMessage(e.target.value)}
                        rows={4}
                        data-testid="textarea-vm-message"
                      />
                      <p className="text-xs text-muted-foreground">
                        This message will be converted to speech and left as a voicemail
                      </p>
                    </div>
                  )}

                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="vm-campaign-cap">
                        <Clock className="w-4 h-4 inline mr-1" />
                        Daily Campaign Cap
                      </Label>
                      <Input
                        id="vm-campaign-cap"
                        type="number"
                        value={vmCampaignCap}
                        onChange={(e) => setVmCampaignCap(parseInt(e.target.value))}
                        min={1}
                        data-testid="input-vm-campaign-cap"
                      />
                      <p className="text-xs text-muted-foreground">Max VMs per day for campaign</p>
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="vm-contact-cap">
                        <Clock className="w-4 h-4 inline mr-1" />
                        Per-Contact Cap
                      </Label>
                      <Input
                        id="vm-contact-cap"
                        type="number"
                        value={vmContactCap}
                        onChange={(e) => setVmContactCap(parseInt(e.target.value))}
                        min={1}
                        max={5}
                        data-testid="input-vm-contact-cap"
                      />
                      <p className="text-xs text-muted-foreground">Max VMs per contact</p>
                    </div>
                  </div>
                </>
              )}
            </CardContent>
          </Card>
        </>
      )}

      {/* AI Agent Mode Settings */}
      {dialMode === 'ai_agent' && (
        <>
          <Separator />

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

          {/* AI Scripts Configuration */}
          <Card>
            <CardHeader>
              <div className="flex items-center gap-2">
                <MessageSquare className="w-5 h-5" />
                <CardTitle>Conversation Scripts</CardTitle>
              </div>
              <CardDescription>
                Define what the AI should say in different scenarios. Use {"{{firstName}}"}, {"{{lastName}}"}, {"{{companyName}}"} for personalization.
              </CardDescription>
            </CardHeader>
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
        </>
      )}

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

