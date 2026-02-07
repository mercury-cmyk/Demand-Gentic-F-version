/**
 * Step - Call Flow Layer
 * 
 * Campaign wizard step for configuring the Call Flow Layer (Layer 3.5).
 * This layer defines the deterministic conversation flow that the AI agent must follow.
 * 
 * Features:
 * - Use default B2B appointment flow
 * - Customize existing flow steps
 * - Preview flow visualization
 * - View step-by-step rules
 */

import { useState, useEffect } from "react";
import { apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  ChevronRight,
  ChevronDown,
  Workflow,
  Target,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  ArrowRight,
  Lock,
  Unlock,
  Settings2,
  Eye,
  Lightbulb,
  Phone,
  Calendar,
  MessageSquare,
  UserCheck,
  Hand,
  Headphones,
  ThumbsUp,
  LogOut,
  Info,
  Sparkles,
  Shield,
  ListFilter
} from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

// ======================== TYPES ========================

interface Intent {
  id: string;
  name: string;
  description: string;
}

interface ExitCondition {
  signal: string;
  description: string;
  nextStep?: string;
}

interface BranchRule {
  trigger: string;
  condition: string;
  targetStep?: string;
  capability?: string;
  description: string;
}

interface CallFlowStep {
  stepId: string;
  name: string;
  mappedState: string;
  goal: string;
  allowedIntents: string[];
  forbiddenIntents?: string[];
  allowedQuestions: number;
  maxTurnsInStep: number;
  mustDo?: string[];
  mustNotDo?: string[];
  exitCriteria: ExitCondition[];
  branches?: BranchRule[];
}

interface CallFlow {
  id: string;
  name: string;
  objective: string;
  successCriteria: string;
  maxTotalTurns: number;
  steps: CallFlowStep[];
  isDefault?: boolean;
  isSystemFlow?: boolean;
  version?: number;
}

// ======================== DEFAULT CALL FLOW ========================

const DEFAULT_CALL_FLOW: CallFlow = {
  id: 'default-b2b-appointment',
  name: 'B2B Appointment Setting',
  objective: 'Book a qualified meeting with decision makers in target accounts',
  successCriteria: 'Calendar invite sent with confirmed date/time and attendees',
  maxTotalTurns: 20,
  isDefault: true,
  steps: [
    {
      stepId: 'step-1-permission',
      name: 'Permission & Presence',
      mappedState: 'CONTEXT_FRAMING',
      goal: 'Secure permission to proceed with the conversation.',
      allowedIntents: ['request_permission', 'acknowledge'],
      forbiddenIntents: ['share_insight', 'propose_meeting', 'schedule_meeting'],
      allowedQuestions: 1,
      maxTurnsInStep: 3,
      mustDo: ['Use one sentence maximum', 'Ask only one question', 'Wait for explicit response'],
      mustNotDo: ['Pitch any product', 'Mention specific offerings', 'Ask multiple questions'],
      exitCriteria: [
        { signal: 'prospect_agrees', description: 'Prospect agrees to continue', nextStep: 'step-2-role' },
        { signal: 'prospect_asks', description: 'Prospect asks "what\'s this about?"', nextStep: 'step-2-role' },
      ],
      branches: [
        { trigger: 'busy', condition: 'Prospect says "I\'m busy"', targetStep: 'step-8-exit', description: 'Offer callback' },
      ]
    },
    {
      stepId: 'step-2-role',
      name: 'Role Confirmation',
      mappedState: 'DISCOVERY',
      goal: 'Confirm responsibility or route to correct owner.',
      allowedIntents: ['ask_question', 'acknowledge'],
      forbiddenIntents: ['share_insight', 'propose_meeting'],
      allowedQuestions: 1,
      maxTurnsInStep: 3,
      mustDo: ['Ask exactly one role-related question', 'Confirm relevant responsibility'],
      mustNotDo: ['Make assumptions about role', 'Skip verification'],
      exitCriteria: [
        { signal: 'role_confirmed', description: 'Prospect confirms relevant responsibility', nextStep: 'step-3-curiosity' },
      ],
      branches: [
        { trigger: 'wrong_person', condition: 'Not the right person', capability: 'refer_to_colleague', description: 'Ask for referral' },
        { trigger: 'gatekeeper', condition: 'Speaking with assistant', capability: 'gatekeeper_handling', description: 'Navigate gatekeeper' },
      ]
    },
    {
      stepId: 'step-3-curiosity',
      name: 'Curiosity Trigger',
      mappedState: 'DISCOVERY',
      goal: 'Create engagement through curiosity.',
      allowedIntents: ['ask_question'],
      forbiddenIntents: ['share_insight', 'propose_meeting', 'schedule_meeting'],
      allowedQuestions: 1,
      maxTurnsInStep: 2,
      mustDo: ['Ask a forced-choice or open curiosity question', 'Make it market-relevant'],
      mustNotDo: ['Pitch product', 'Mention features', 'Ask yes/no questions'],
      exitCriteria: [
        { signal: 'engagement', description: 'Prospect answers with opinion', nextStep: 'step-4-discovery' },
      ],
      branches: [
        { trigger: 'time_pressure', condition: 'Limited time indicated', targetStep: 'step-6-meeting-ask', description: 'Skip to meeting' },
      ]
    },
    {
      stepId: 'step-4-discovery',
      name: 'Discovery Lite',
      mappedState: 'LISTENING',
      goal: 'Capture exactly one qualifying signal.',
      allowedIntents: ['ask_question', 'acknowledge', 'listen'],
      forbiddenIntents: ['share_insight', 'propose_meeting'],
      allowedQuestions: 1,
      maxTurnsInStep: 4,
      mustDo: ['Ask ONE question only', 'Let prospect speak uninterrupted', 'Listen for pain/priority/timing signals'],
      mustNotDo: ['Interrupt', 'Ask multiple questions', 'Jump to solution'],
      exitCriteria: [
        { signal: 'pain_detected', description: 'Pain point mentioned', nextStep: 'step-5-insight' },
        { signal: 'priority_detected', description: 'Priority/focus area mentioned', nextStep: 'step-5-insight' },
        { signal: 'timing_detected', description: 'Timing/urgency mentioned', nextStep: 'step-5-insight' },
      ],
      branches: [
        { trigger: 'strong_interest', condition: 'Strong interest shown', targetStep: 'step-6-meeting-ask', description: 'Skip to meeting' },
      ]
    },
    {
      stepId: 'step-5-insight',
      name: 'Insight Drop',
      mappedState: 'ACKNOWLEDGEMENT',
      goal: 'Create compelling reason for follow-up.',
      allowedIntents: ['share_insight', 'ask_question'],
      forbiddenIntents: ['schedule_meeting'],
      allowedQuestions: 1,
      maxTurnsInStep: 3,
      mustDo: ['Share ONLY ONE insight', 'Reference market pattern', 'End with interest question'],
      mustNotDo: ['Accuse their approach', 'Share multiple insights', 'Make it about your product'],
      exitCriteria: [
        { signal: 'interest', description: 'Interest in learning more', nextStep: 'step-6-meeting-ask' },
      ],
      branches: [
        { trigger: 'pushback', condition: 'Pushes back on insight', capability: 'objection_handling', description: 'Acknowledge and pivot' },
      ]
    },
    {
      stepId: 'step-6-meeting-ask',
      name: 'Soft Meeting Ask',
      mappedState: 'PERMISSION_REQUEST',
      goal: 'Propose a short, low-pressure meeting.',
      allowedIntents: ['propose_meeting'],
      forbiddenIntents: ['share_insight'],
      allowedQuestions: 1,
      maxTurnsInStep: 3,
      mustDo: ['Use low-pressure language: "quick", "15 minutes"', 'Frame as exploration', 'Make easy to say yes'],
      mustNotDo: ['Ask twice in same turn', 'Use pressure tactics', 'Sound like a sales pitch'],
      exitCriteria: [
        { signal: 'accepted', description: 'Agrees to meeting', nextStep: 'step-7-calendar' },
        { signal: 'soft_yes', description: 'Shows openness', nextStep: 'step-7-calendar' },
      ],
      branches: [
        { trigger: 'objection', condition: 'Objects to meeting', capability: 'objection_handling', description: 'Handle with one attempt' },
        { trigger: 'send_email', condition: 'Asks for email instead', targetStep: 'step-8-exit', description: 'Agree to email' },
        { trigger: 'not_now', condition: 'Says "not now"', targetStep: 'step-8-exit', description: 'Schedule callback' },
      ]
    },
    {
      stepId: 'step-7-calendar',
      name: 'Calendar Lock',
      mappedState: 'CLOSE',
      goal: 'Secure specific date/time.',
      allowedIntents: ['schedule_meeting', 'confirm_details'],
      forbiddenIntents: ['share_insight', 'ask_question'],
      allowedQuestions: 2,
      maxTurnsInStep: 5,
      mustDo: ['Offer two time options max', 'Confirm time zone', 'Confirm attendees', 'Send calendar invite'],
      mustNotDo: ['Offer too many options', 'Skip time zone', 'Leave attendees ambiguous'],
      exitCriteria: [
        { signal: 'scheduled', description: 'Date/time/attendees confirmed', nextStep: 'step-8-exit' },
      ],
      branches: [
        { trigger: 'conflict', condition: 'Times don\'t work', targetStep: 'step-7-calendar', description: 'Offer alternatives' },
      ]
    },
    {
      stepId: 'step-8-exit',
      name: 'Exit with Goodwill',
      mappedState: 'END',
      goal: 'Leave positive impression.',
      allowedIntents: ['exit_call', 'acknowledge', 'confirm_details'],
      forbiddenIntents: ['ask_question', 'propose_meeting', 'share_insight'],
      allowedQuestions: 0,
      maxTurnsInStep: 2,
      mustDo: ['Thank for their time', 'Reconfirm next steps', 'End cleanly'],
      mustNotDo: ['Make last pitch', 'Ask more questions', 'Express disappointment'],
      exitCriteria: [
        { signal: 'ended', description: 'Graceful farewell exchanged' },
      ],
    },
  ]
};

// ======================== STEP ICON MAPPING ========================

const stepIcons: Record<string, React.ReactNode> = {
  'step-1-permission': <Hand className="h-5 w-5" />,
  'step-2-role': <UserCheck className="h-5 w-5" />,
  'step-3-curiosity': <Lightbulb className="h-5 w-5" />,
  'step-4-discovery': <Headphones className="h-5 w-5" />,
  'step-5-insight': <Sparkles className="h-5 w-5" />,
  'step-6-meeting-ask': <Calendar className="h-5 w-5" />,
  'step-7-calendar': <CheckCircle2 className="h-5 w-5" />,
  'step-8-exit': <LogOut className="h-5 w-5" />,
};

// ======================== CAMPAIGN TYPE FLOW MAPPING ========================

const CAMPAIGN_TYPE_FLOW_NAMES: Record<string, { name: string; description: string }> = {
  'appointment_generation': { name: 'B2B Appointment Setting', description: 'Book qualified meetings with decision makers' },
  'sql': { name: 'B2B Appointment Setting', description: 'Book qualified meetings with decision makers' },
  'telemarketing': { name: 'B2B Appointment Setting', description: 'Book qualified meetings with decision makers' },
  'high_quality_leads': { name: 'Lead Qualification (HQL/SQL)', description: 'Qualify leads and determine sales-readiness' },
  'live_webinar': { name: 'Webinar Registration', description: 'Register prospects for webinar events' },
  'on_demand_webinar': { name: 'Webinar Registration', description: 'Register prospects for on-demand content' },
  'content_syndication': { name: 'Content Syndication Follow-up', description: 'Follow up on content downloads' },
  'executive_dinner': { name: 'Event Invitation', description: 'Secure RSVPs for exclusive events' },
  'leadership_forum': { name: 'Event Invitation', description: 'Secure RSVPs for leadership forums' },
  'conference': { name: 'Event Invitation', description: 'Secure conference attendance' },
  'call': { name: 'Generic Outbound', description: 'Flexible outbound calling flow' },
  'combo': { name: 'Generic Outbound', description: 'Flexible multi-channel flow' },
};

// ======================== COMPONENT ========================

interface StepCallFlowProps {
  data: any;
  onNext: (data: any) => void;
  onBack: () => void;
}

export function StepCallFlow({ data, onNext, onBack }: StepCallFlowProps) {
  const [useDefaultFlow, setUseDefaultFlow] = useState(data.callFlow?.useDefault !== false);
  const [callFlow, setCallFlow] = useState<CallFlow>(data.callFlow?.customFlow || DEFAULT_CALL_FLOW);
  const [activeTab, setActiveTab] = useState<"overview" | "steps" | "customize">("overview");
  const [expandedSteps, setExpandedSteps] = useState<string[]>([]);
  const [previewStep, setPreviewStep] = useState<string | null>(null);
  const [isLoadingFlow, setIsLoadingFlow] = useState(false);

  // New state for call flow selection
  const [availableFlows, setAvailableFlows] = useState<CallFlow[]>([]);
  const [selectedFlowId, setSelectedFlowId] = useState<string>(data.callFlow?.flowId || '');
  const [isLoadingFlows, setIsLoadingFlows] = useState(false);

  // Get campaign type from wizard data
  const campaignType = data.type || data.campaignType || 'call';
  const flowInfo = CAMPAIGN_TYPE_FLOW_NAMES[campaignType] || { name: 'Generic Outbound', description: 'Flexible outbound calling flow' };

  console.log(`[StepCallFlow] Mounted/updated with data.type=${data.type}, data.campaignType=${data.campaignType}, resolved campaignType=${campaignType}`);

  // Fetch ALL available call flows on mount
  useEffect(() => {
    setIsLoadingFlows(true);
    console.log(`[StepCallFlow] Fetching all available call flows...`);

    apiRequest('GET', `/api/call-flows/all`)
      .then(res => res.json())
      .then(result => {
        console.log(`[StepCallFlow] Available call flows:`, result);
        if (result.success && result.callFlows) {
          setAvailableFlows(result.callFlows);
        }
      })
      .catch(err => {
        console.error('[StepCallFlow] Failed to fetch available call flows:', err);
      })
      .finally(() => setIsLoadingFlows(false));
  }, []);

  // Fetch appropriate call flow when campaign type changes (for default selection)
  // Uses the call flow management endpoint which respects admin-configured mappings
  useEffect(() => {
    // Always fetch the call flow for the campaign type to get custom mappings
    if (campaignType) {
      setIsLoadingFlow(true);
      console.log(`[StepCallFlow] useEffect triggered - Fetching call flow for campaign type: ${campaignType}`);

      // Use the call flow management endpoint that supports custom mappings
      apiRequest('GET', `/api/call-flows/for-campaign/${campaignType}`)
        .then(res => res.json())
        .then(result => {
          console.log(`[StepCallFlow] API response for ${campaignType}:`, result);
          if (result.success && result.callFlow) {
            console.log(`[StepCallFlow] Setting call flow: ${result.callFlow.name} (isCustomMapping: ${result.isCustomMapping})`);
            setCallFlow(result.callFlow);
            // Set the selected flow ID if not already set
            if (!selectedFlowId) {
              setSelectedFlowId(result.callFlow.id);
            }
          }
        })
        .catch(err => {
          console.error('[StepCallFlow] Failed to fetch call flow:', err);
          // Fallback to legacy endpoint
          apiRequest('GET', `/api/campaign-wizard/call-flows/${campaignType}`)
            .then(res => res.json())
            .then(result => {
              if (result.success && result.callFlow) {
                console.log(`[StepCallFlow] Fallback: Setting call flow: ${result.callFlow.name}`);
                setCallFlow(result.callFlow);
                if (!selectedFlowId) {
                  setSelectedFlowId(result.callFlow.id);
                }
              }
            })
            .catch(e => console.error('[StepCallFlow] Fallback also failed:', e));
        })
        .finally(() => setIsLoadingFlow(false));
    }
  }, [campaignType]);

  // Handle call flow selection change
  const handleFlowSelection = (flowId: string) => {
    console.log(`[StepCallFlow] User selected flow ID: ${flowId}`);
    setSelectedFlowId(flowId);

    // Find the flow in available flows
    const selectedFlow = availableFlows.find(f => f.id === flowId);
    if (selectedFlow) {
      console.log(`[StepCallFlow] Setting selected flow: ${selectedFlow.name}`);
      setCallFlow(selectedFlow);
    }
  };

  // Group flows by system vs custom for the dropdown
  const systemFlows = availableFlows.filter(f => f.isSystemFlow || f.isDefault);
  const customFlows = availableFlows.filter(f => !f.isSystemFlow && !f.isDefault);

  const handleNext = () => {
    onNext({
      callFlow: {
        useDefault: useDefaultFlow,
        customFlow: useDefaultFlow ? null : callFlow,
        flowId: selectedFlowId || callFlow.id,
        flowName: callFlow.name,
        // Include full flow data for the campaign to use
        selectedFlow: callFlow,
      }
    });
  };

  const toggleStepExpanded = (stepId: string) => {
    setExpandedSteps(prev => 
      prev.includes(stepId) 
        ? prev.filter(id => id !== stepId)
        : [...prev, stepId]
    );
  };

  const updateStepField = (stepId: string, field: keyof CallFlowStep, value: any) => {
    setCallFlow(prev => ({
      ...prev,
      steps: prev.steps.map(step => 
        step.stepId === stepId ? { ...step, [field]: value } : step
      )
    }));
  };

  return (
    <TooltipProvider>
      <div className="space-y-6">
        {/* Header Card */}
        <Card className="border-blue-200 bg-gradient-to-r from-blue-50 to-indigo-50">
          <CardHeader className="pb-3">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-blue-100 rounded-lg">
                <Workflow className="h-6 w-6 text-blue-600" />
              </div>
              <div>
                <CardTitle className="flex items-center gap-2">
                  Call Flow Layer
                  <Badge variant="outline" className="ml-2 text-xs">Layer 3.5</Badge>
                </CardTitle>
                <CardDescription className="mt-1">
                  Define the deterministic conversation flow your AI agent must follow
                </CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="pt-0">
            <div className="bg-white/60 rounded-lg p-3 text-sm text-slate-600">
              <div className="flex items-start gap-2">
                <Shield className="h-4 w-4 text-blue-500 mt-0.5 flex-shrink-0" />
                <div>
                  <strong>Authority Level:</strong> This layer is authoritative. The agent may not bypass, 
                  reorder, or improvise beyond what the call flow explicitly allows. It defines <em>what</em> to 
                  accomplish and in <em>what order</em>.
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Call Flow Selection */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <ListFilter className="h-5 w-5" />
              Select Call Flow
            </CardTitle>
            <CardDescription>
              Choose a pre-configured call flow or customize one for this campaign
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Flow Selector Dropdown */}
            <div className="space-y-2">
              <Label htmlFor="flow-select">Call Flow</Label>
              <Select
                value={selectedFlowId}
                onValueChange={handleFlowSelection}
                disabled={isLoadingFlows || isLoadingFlow}
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder={isLoadingFlows ? "Loading flows..." : "Select a call flow"} />
                </SelectTrigger>
                <SelectContent>
                  {/* System Flows Group */}
                  {systemFlows.length > 0 && (
                    <SelectGroup>
                      <SelectLabel className="flex items-center gap-2">
                        <Shield className="h-3 w-3" />
                        System Flows
                      </SelectLabel>
                      {systemFlows.map((flow) => (
                        <SelectItem key={flow.id} value={flow.id}>
                          <div className="flex items-center gap-2">
                            <span>{flow.name}</span>
                            {flow.id === selectedFlowId && flow.steps && (
                              <Badge variant="secondary" className="text-xs">
                                {flow.steps.length} steps
                              </Badge>
                            )}
                          </div>
                        </SelectItem>
                      ))}
                    </SelectGroup>
                  )}

                  {/* Custom Flows Group */}
                  {customFlows.length > 0 && (
                    <SelectGroup>
                      <SelectLabel className="flex items-center gap-2">
                        <Settings2 className="h-3 w-3" />
                        Custom Flows
                      </SelectLabel>
                      {customFlows.map((flow) => (
                        <SelectItem key={flow.id} value={flow.id}>
                          <div className="flex items-center gap-2">
                            <span>{flow.name}</span>
                            {flow.id === selectedFlowId && flow.steps && (
                              <Badge variant="outline" className="text-xs">
                                {flow.steps.length} steps
                              </Badge>
                            )}
                          </div>
                        </SelectItem>
                      ))}
                    </SelectGroup>
                  )}

                  {/* Fallback when no flows loaded */}
                  {availableFlows.length === 0 && !isLoadingFlows && (
                    <SelectItem value={callFlow.id || 'default'}>
                      {callFlow.name || 'Default Flow'}
                    </SelectItem>
                  )}
                </SelectContent>
              </Select>
            </div>

            {/* Selected Flow Info */}
            {callFlow && (
              <div className="p-3 bg-slate-50 rounded-lg border">
                <div className="flex items-start justify-between">
                  <div className="space-y-1">
                    <div className="font-medium flex items-center gap-2">
                      {callFlow.name}
                      {(callFlow.isSystemFlow || callFlow.isDefault) && (
                        <Badge variant="secondary" className="text-xs">System</Badge>
                      )}
                    </div>
                    <p className="text-sm text-muted-foreground">
                      {callFlow.objective || flowInfo.description}
                    </p>
                    <div className="flex items-center gap-3 text-xs text-muted-foreground mt-2">
                      <span className="flex items-center gap-1">
                        <Workflow className="h-3 w-3" />
                        {callFlow.steps?.length || 0} steps
                      </span>
                      <span className="flex items-center gap-1">
                        <MessageSquare className="h-3 w-3" />
                        Max {callFlow.maxTotalTurns} turns
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Customize Toggle */}
            <Separator />
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                {useDefaultFlow ? (
                  <Lock className="h-5 w-5 text-green-500" />
                ) : (
                  <Unlock className="h-5 w-5 text-amber-500" />
                )}
                <div>
                  <Label htmlFor="use-default" className="text-base font-medium">
                    Use As-Is
                  </Label>
                  <p className="text-sm text-muted-foreground">
                    {useDefaultFlow
                      ? "Flow will be used without modifications"
                      : "Custom modifications enabled - edit steps below"}
                  </p>
                </div>
              </div>
              <Switch
                id="use-default"
                checked={useDefaultFlow}
                onCheckedChange={setUseDefaultFlow}
              />
            </div>
          </CardContent>
        </Card>

        {/* Main Content Tabs */}
        <Card>
          <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as any)}>
            <CardHeader className="pb-0">
              <TabsList className="grid w-full grid-cols-3">
                <TabsTrigger value="overview" className="flex items-center gap-2">
                  <Eye className="h-4 w-4" />
                  Overview
                </TabsTrigger>
                <TabsTrigger value="steps" className="flex items-center gap-2">
                  <Workflow className="h-4 w-4" />
                  Flow Steps
                </TabsTrigger>
                <TabsTrigger value="customize" className="flex items-center gap-2" disabled={useDefaultFlow}>
                  <Settings2 className="h-4 w-4" />
                  Customize
                </TabsTrigger>
              </TabsList>
            </CardHeader>

            <CardContent className="pt-4">
              {/* Overview Tab */}
              <TabsContent value="overview" className="mt-0 space-y-4">
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label className="text-muted-foreground text-xs uppercase tracking-wider">Flow Name</Label>
                    <div className="font-semibold">{callFlow.name}</div>
                  </div>
                  <div className="space-y-2">
                    <Label className="text-muted-foreground text-xs uppercase tracking-wider">Max Turns</Label>
                    <div className="font-semibold">{callFlow.maxTotalTurns} turns</div>
                  </div>
                </div>
                
                <Separator />
                
                <div className="space-y-2">
                  <Label className="text-muted-foreground text-xs uppercase tracking-wider">Objective</Label>
                  <div className="p-3 bg-slate-50 rounded-lg">{callFlow.objective}</div>
                </div>
                
                <div className="space-y-2">
                  <Label className="text-muted-foreground text-xs uppercase tracking-wider">Success Criteria</Label>
                  <div className="p-3 bg-green-50 rounded-lg border border-green-200 flex items-start gap-2">
                    <Target className="h-4 w-4 text-green-600 mt-0.5" />
                    <span>{callFlow.successCriteria}</span>
                  </div>
                </div>

                {/* Visual Flow Diagram */}
                <div className="space-y-2">
                  <Label className="text-muted-foreground text-xs uppercase tracking-wider">Flow Visualization</Label>
                  <div className="flex flex-wrap items-center gap-2 p-4 bg-slate-50 rounded-lg">
                    {callFlow.steps.map((step, index) => (
                      <div key={step.stepId} className="flex items-center">
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <div 
                              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm cursor-pointer transition-colors
                                ${previewStep === step.stepId 
                                  ? 'bg-blue-100 text-blue-700 ring-2 ring-blue-500' 
                                  : 'bg-white border hover:bg-slate-100'}`}
                              onClick={() => setPreviewStep(previewStep === step.stepId ? null : step.stepId)}
                            >
                              {stepIcons[step.stepId] || <MessageSquare className="h-4 w-4" />}
                              <span className="hidden sm:inline">{step.name}</span>
                              <span className="sm:hidden">{index + 1}</span>
                            </div>
                          </TooltipTrigger>
                          <TooltipContent>
                            <p className="font-medium">{step.name}</p>
                            <p className="text-xs text-muted-foreground">{step.goal}</p>
                          </TooltipContent>
                        </Tooltip>
                        {index < callFlow.steps.length - 1 && (
                          <ArrowRight className="h-4 w-4 mx-1 text-slate-400" />
                        )}
                      </div>
                    ))}
                  </div>
                </div>

                {/* Step Preview */}
                {previewStep && (
                  <div className="border rounded-lg p-4 bg-blue-50/50 animate-in fade-in duration-200">
                    {(() => {
                      const step = callFlow.steps.find(s => s.stepId === previewStep);
                      if (!step) return null;
                      return (
                        <div className="space-y-3">
                          <div className="flex items-center gap-2">
                            {stepIcons[step.stepId]}
                            <h4 className="font-semibold">{step.name}</h4>
                            <Badge variant="outline" className="text-xs">{step.mappedState}</Badge>
                          </div>
                          <p className="text-sm text-muted-foreground">{step.goal}</p>
                          <div className="grid gap-2 sm:grid-cols-2 text-sm">
                            <div className="flex items-center gap-2">
                              <CheckCircle2 className="h-4 w-4 text-green-500" />
                              <span>Max {step.allowedQuestions} question(s)</span>
                            </div>
                            <div className="flex items-center gap-2">
                              <AlertTriangle className="h-4 w-4 text-amber-500" />
                              <span>Max {step.maxTurnsInStep} turns</span>
                            </div>
                          </div>
                        </div>
                      );
                    })()}
                  </div>
                )}
              </TabsContent>

              {/* Flow Steps Tab */}
              <TabsContent value="steps" className="mt-0">
                <ScrollArea className="h-[400px] pr-4">
                  <Accordion type="multiple" value={expandedSteps} className="space-y-2">
                    {callFlow.steps.map((step, index) => (
                      <AccordionItem 
                        key={step.stepId} 
                        value={step.stepId}
                        className="border rounded-lg px-4"
                      >
                        <AccordionTrigger 
                          onClick={() => toggleStepExpanded(step.stepId)}
                          className="hover:no-underline"
                        >
                          <div className="flex items-center gap-3 text-left">
                            <div className="flex items-center justify-center w-8 h-8 rounded-full bg-slate-100 text-sm font-semibold">
                              {index + 1}
                            </div>
                            <div>
                              <div className="flex items-center gap-2">
                                {stepIcons[step.stepId]}
                                <span className="font-medium">{step.name}</span>
                              </div>
                              <p className="text-xs text-muted-foreground font-normal">{step.goal}</p>
                            </div>
                          </div>
                        </AccordionTrigger>
                        <AccordionContent className="pt-2 pb-4 space-y-4">
                          {/* Mapped State */}
                          <div className="flex items-center gap-2">
                            <Badge variant="secondary">{step.mappedState}</Badge>
                            <span className="text-sm text-muted-foreground">Voice Agent State</span>
                          </div>

                          {/* Allowed Intents */}
                          <div className="space-y-1">
                            <Label className="text-xs text-green-600 flex items-center gap-1">
                              <CheckCircle2 className="h-3 w-3" /> Allowed Actions
                            </Label>
                            <div className="flex flex-wrap gap-1">
                              {step.allowedIntents.map(intent => (
                                <Badge key={intent} variant="outline" className="bg-green-50 text-green-700 border-green-200">
                                  {intent.replace(/_/g, ' ')}
                                </Badge>
                              ))}
                            </div>
                          </div>

                          {/* Forbidden Intents */}
                          {step.forbiddenIntents && step.forbiddenIntents.length > 0 && (
                            <div className="space-y-1">
                              <Label className="text-xs text-red-600 flex items-center gap-1">
                                <XCircle className="h-3 w-3" /> Forbidden Actions
                              </Label>
                              <div className="flex flex-wrap gap-1">
                                {step.forbiddenIntents.map(intent => (
                                  <Badge key={intent} variant="outline" className="bg-red-50 text-red-700 border-red-200">
                                    {intent.replace(/_/g, ' ')}
                                  </Badge>
                                ))}
                              </div>
                            </div>
                          )}

                          {/* Constraints */}
                          <div className="grid gap-3 sm:grid-cols-2 text-sm">
                            <div className="p-2 bg-slate-50 rounded">
                              <span className="text-muted-foreground">Questions allowed:</span>{' '}
                              <strong>{step.allowedQuestions}</strong>
                            </div>
                            <div className="p-2 bg-slate-50 rounded">
                              <span className="text-muted-foreground">Max turns:</span>{' '}
                              <strong>{step.maxTurnsInStep}</strong>
                            </div>
                          </div>

                          {/* Must Do */}
                          {step.mustDo && step.mustDo.length > 0 && (
                            <div className="space-y-1">
                              <Label className="text-xs text-green-600">Must Do</Label>
                              <ul className="text-sm space-y-1">
                                {step.mustDo.map((item, i) => (
                                  <li key={i} className="flex items-start gap-2">
                                    <CheckCircle2 className="h-3 w-3 text-green-500 mt-1 flex-shrink-0" />
                                    {item}
                                  </li>
                                ))}
                              </ul>
                            </div>
                          )}

                          {/* Must Not Do */}
                          {step.mustNotDo && step.mustNotDo.length > 0 && (
                            <div className="space-y-1">
                              <Label className="text-xs text-red-600">Must NOT Do</Label>
                              <ul className="text-sm space-y-1">
                                {step.mustNotDo.map((item, i) => (
                                  <li key={i} className="flex items-start gap-2">
                                    <XCircle className="h-3 w-3 text-red-500 mt-1 flex-shrink-0" />
                                    {item}
                                  </li>
                                ))}
                              </ul>
                            </div>
                          )}

                          {/* Exit Criteria */}
                          <div className="space-y-1">
                            <Label className="text-xs text-blue-600">Exit Criteria → Next Step</Label>
                            <ul className="text-sm space-y-1">
                              {step.exitCriteria.map((ec, i) => (
                                <li key={i} className="flex items-start gap-2">
                                  <ArrowRight className="h-3 w-3 text-blue-500 mt-1 flex-shrink-0" />
                                  <span>
                                    {ec.description}
                                    {ec.nextStep && (
                                      <Badge variant="outline" className="ml-2 text-xs">
                                        → {ec.nextStep.replace('step-', '').replace('-', '. ')}
                                      </Badge>
                                    )}
                                  </span>
                                </li>
                              ))}
                            </ul>
                          </div>

                          {/* Branches */}
                          {step.branches && step.branches.length > 0 && (
                            <div className="space-y-1">
                              <Label className="text-xs text-amber-600">Special Branches</Label>
                              <ul className="text-sm space-y-1">
                                {step.branches.map((branch, i) => (
                                  <li key={i} className="flex items-start gap-2">
                                    <AlertTriangle className="h-3 w-3 text-amber-500 mt-1 flex-shrink-0" />
                                    <span>
                                      <strong>IF</strong> {branch.condition} → {branch.description}
                                    </span>
                                  </li>
                                ))}
                              </ul>
                            </div>
                          )}
                        </AccordionContent>
                      </AccordionItem>
                    ))}
                  </Accordion>
                </ScrollArea>
              </TabsContent>

              {/* Customize Tab */}
              <TabsContent value="customize" className="mt-0">
                {useDefaultFlow ? (
                  <div className="text-center py-8 text-muted-foreground">
                    <Lock className="h-12 w-12 mx-auto mb-4 opacity-50" />
                    <p>Disable "Use Default Flow" to customize steps</p>
                  </div>
                ) : (
                  <div className="space-y-4">
                    <div className="grid gap-4 md:grid-cols-2">
                      <div className="space-y-2">
                        <Label htmlFor="flow-name">Flow Name</Label>
                        <Input
                          id="flow-name"
                          value={callFlow.name}
                          onChange={(e) => setCallFlow(prev => ({ ...prev, name: e.target.value }))}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="max-turns">Max Total Turns</Label>
                        <Input
                          id="max-turns"
                          type="number"
                          min={5}
                          max={50}
                          value={callFlow.maxTotalTurns}
                          onChange={(e) => setCallFlow(prev => ({ 
                            ...prev, 
                            maxTotalTurns: parseInt(e.target.value) || 20 
                          }))}
                        />
                      </div>
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="objective">Objective</Label>
                      <Textarea
                        id="objective"
                        value={callFlow.objective}
                        onChange={(e) => setCallFlow(prev => ({ ...prev, objective: e.target.value }))}
                        rows={2}
                      />
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="success">Success Criteria</Label>
                      <Textarea
                        id="success"
                        value={callFlow.successCriteria}
                        onChange={(e) => setCallFlow(prev => ({ ...prev, successCriteria: e.target.value }))}
                        rows={2}
                      />
                    </div>

                    <Separator />

                    <div className="space-y-2">
                      <Label className="flex items-center gap-2">
                        <Settings2 className="h-4 w-4" />
                        Step Customization
                      </Label>
                      <p className="text-sm text-muted-foreground">
                        Click on a step in the "Flow Steps" tab to customize individual step rules.
                      </p>
                    </div>
                  </div>
                )}
              </TabsContent>
            </CardContent>
          </Tabs>
        </Card>

        {/* Layer Hierarchy Info */}
        <Card className="border-amber-200 bg-amber-50/50">
          <CardContent className="pt-4 pb-4">
            <div className="flex items-start gap-3">
              <Info className="h-5 w-5 text-amber-600 flex-shrink-0 mt-0.5" />
              <div className="text-sm">
                <strong className="text-amber-800">Layer Hierarchy</strong>
                <p className="text-amber-700 mt-1">
                  Layer 1 (Voice Control) and Layer 2 (Org Knowledge) can override Call Flow. 
                  However, Call Flow (Layer 3.5) takes precedence over Campaign Context (Layer 3) 
                  when determining conversation progression.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Navigation */}
        <div className="flex justify-between pt-4">
          <Button variant="outline" onClick={onBack}>
            Back
          </Button>
          <Button onClick={handleNext} className="flex items-center gap-2">
            Continue
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </TooltipProvider>
  );
}
