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

type DialMode = 'manual' | 'power' | 'ai_agent';
// marin & cedar are highest quality, most natural voices
type AiVoice = 'marin' | 'cedar' | 'alloy' | 'echo' | 'fable' | 'onyx' | 'nova' | 'shimmer' | 'ash' | 'ballad' | 'coral' | 'sage' | 'verse';
type HandoffTrigger = 'decision_maker_reached' | 'explicit_request' | 'complex_objection' | 'pricing_discussion' | 'technical_question' | 'angry_prospect';

const AI_VOICES: { value: AiVoice; label: string; description: string }[] = [
  { value: 'marin', label: 'Marin', description: 'Calm, professional, natural (Recommended)' },
  { value: 'cedar', label: 'Cedar', description: 'Warm, confident, engaging (Recommended)' },
  { value: 'alloy', label: 'Alloy', description: 'Balanced and versatile' },
  { value: 'echo', label: 'Echo', description: 'Warm and engaging' },
  { value: 'fable', label: 'Fable', description: 'Expressive and dynamic' },
  { value: 'onyx', label: 'Onyx', description: 'Deep and authoritative' },
  { value: 'nova', label: 'Nova', description: 'Friendly and upbeat' },
  { value: 'shimmer', label: 'Shimmer', description: 'Clear and professional' },
  { value: 'ash', label: 'Ash', description: 'Natural conversational' },
  { value: 'coral', label: 'Coral', description: 'Bright and clear' },
  { value: 'sage', label: 'Sage', description: 'Thoughtful and calm' },
  { value: 'verse', label: 'Verse', description: 'Articulate and precise' },
  { value: 'ballad', label: 'Ballad', description: 'Smooth and melodic' },
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
  const [dialMode, setDialMode] = useState(data.dialMode || 'power');
  const [campaignBrief, setCampaignBrief] = useState('');
  const [amdEnabled, setAmdEnabled] = useState(data.powerSettings?.amd?.enabled ?? true);
  const [amdConfidenceThreshold, setAmdConfidenceThreshold] = useState(
    data.powerSettings?.amd?.confidenceThreshold ?? 0.70
  );
  const [amdTimeout, setAmdTimeout] = useState(data.powerSettings?.amd?.timeout ?? 3000);
  const [unknownAction, setUnknownAction] = useState(
    data.powerSettings?.amd?.unknownAction || 'route_to_agent'
  );
  
  const [vmEnabled, setVmEnabled] = useState(data.powerSettings?.voicemailPolicy?.enabled ?? false);
  const [vmAction, setVmAction] = useState(
    data.powerSettings?.voicemailPolicy?.action || 'leave_message'
  );
  const [vmMessage, setVmMessage] = useState(data.powerSettings?.voicemailPolicy?.message || '');
  const [vmCampaignCap, setVmCampaignCap] = useState(data.powerSettings?.voicemailPolicy?.campaign_daily_vm_cap || 100);
  const [vmContactCap, setVmContactCap] = useState(data.powerSettings?.voicemailPolicy?.contact_vm_cap || 1);

  // AI Agent Settings
  const [aiPersonaName, setAiPersonaName] = useState(data.aiAgentSettings?.persona?.name || '');
  const [aiCompanyName, setAiCompanyName] = useState(data.aiAgentSettings?.persona?.companyName || '');
  const [aiRole, setAiRole] = useState(data.aiAgentSettings?.persona?.role || 'Sales Representative');
  const [aiVoice, setAiVoice] = useState(data.aiAgentSettings?.persona?.voice || 'Fenrir');
  
  // AI Scripts
  const [aiOpeningScript, setAiOpeningScript] = useState(data.aiAgentSettings?.scripts?.opening || '');
  const [aiGatekeeperScript, setAiGatekeeperScript] = useState(data.aiAgentSettings?.scripts?.gatekeeper || '');
  const [aiPitchScript, setAiPitchScript] = useState(data.aiAgentSettings?.scripts?.pitch || '');
  const [aiObjectionsScript, setAiObjectionsScript] = useState(data.aiAgentSettings?.scripts?.objections || '');
  const [aiClosingScript, setAiClosingScript] = useState(data.aiAgentSettings?.scripts?.closing || '');
  
  // AI Handoff Settings
  const [handoffEnabled, setHandoffEnabled] = useState(data.aiAgentSettings?.handoff?.enabled ?? true);
  const [handoffTriggers, setHandoffTriggers] = useState(
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
  const [operatingDays, setOperatingDays] = useState(
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
    if (campaignBrief.length  {
    const powerSettings = dialMode === 'power' ? {
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
      powerSettings,
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
    
      {/* Dial Mode Selection */}
      
        
          Select Dial Mode
          
            Choose how calls will be initiated to your contacts
          
        

         setDialMode(v as DialMode)}>
          
            
              
                
                
                  
                    
                    
                      Manual Dial Mode
                    
                  
                  
                    Agents pull contacts from their queue and manually initiate calls. Best for personalized outreach and complex sales cycles.
                  
                  
                    
                      
                      Agent-driven queue with pull/lock workflow
                    
                    
                      
                      Campaign-level collision prevention
                    
                    
                      
                      Filter-based audience selection
                    
                  
                
              
            
          

          
            
              
                
                
                  
                    
                    
                      Power Dial Mode
                    
                  
                  
                    Automated dialing with AMD detection. Only connects agents to live humans. Maximizes agent talk time and productivity.
                  
                  
                    
                      
                      AMD with human-only routing
                    
                    
                      
                      Pacing engine with abandon-rate feedback (3% target)
                    
                    
                      
                      Progressive/predictive/preview modes
                    
                  
                
              
            
          

          
            
              
                
                
                  
                    
                    
                      AI Voice Agent Mode
                    
                  
                  
                    Intelligent AI agents handle calls autonomously using natural voice. Navigate gatekeepers, deliver scripts, and hand off to human agents when needed.
                  
                  
                    
                      
                      OpenAI-powered natural voice conversations
                    
                    
                      
                      Intelligent gatekeeper navigation
                    
                    
                      
                      Same lead/QA workflow as human agents
                    
                    
                      
                      Smart handoff to live agents
                    
                  
                
              
            
          
        
      

      {/* Power Mode Settings */}
      {dialMode === 'power' && (
        <>
          

          {/* AMD Configuration */}
          
            
              
                
                Answering Machine Detection (AMD)
              
              
                Configure how the system detects and handles answering machines
              
            
            
              
                
                  Enable AMD
                  Automatically detect answering machines
                
                
              

              {amdEnabled && (
                <>
                  
                    
                      Confidence Threshold: {(amdConfidenceThreshold * 100).toFixed(0)}%
                      
                        {amdConfidenceThreshold >= 0.8 ? 'High' : amdConfidenceThreshold >= 0.6 ? 'Medium' : 'Low'}
                      
                    
                     setAmdConfidenceThreshold(v / 100)}
                      min={50}
                      max={95}
                      step={5}
                      className="w-full"
                      data-testid="slider-amd-confidence"
                    />
                    
                      Higher threshold = more accurate but may miss some machines. Recommended: 70%
                    
                  

                  
                    AMD Timeout
                     setAmdTimeout(parseInt(v))}>
                      
                        
                      
                      
                        2 seconds
                        3 seconds (recommended)
                        4 seconds
                        5 seconds
                      
                    
                    
                      How long to analyze the call before making a decision
                    
                  

                  
                    Unknown Result Action
                     setUnknownAction(v)}>
                      
                        
                      
                      
                        Route to Agent (safer)
                        Drop Silent
                      
                    
                    
                      What to do when AMD confidence is below threshold
                    
                  
                
              )}
            
          

          {/* Voicemail Policy */}
          
            
              
                
                Voicemail Policy
              
              
                Configure what happens when a machine is detected
              
            
            
              
                
                  Enable Voicemail Handling
                  Automatically handle detected voicemail
                
                
              

              {vmEnabled && (
                <>
                  
                    Voicemail Action
                     setVmAction(v)}>
                      
                        
                      
                      
                        Leave Voice Message (TTS)
                        Schedule Callback
                        Drop Silent
                      
                    
                  

                  {vmAction === 'leave_message' && (
                    
                      Voicemail Message
                       setVmMessage(e.target.value)}
                        rows={4}
                        data-testid="textarea-vm-message"
                      />
                      
                        This message will be converted to speech and left as a voicemail
                      
                    
                  )}

                  
                    
                      
                        
                        Daily Campaign Cap
                      
                       setVmCampaignCap(parseInt(e.target.value))}
                        min={1}
                        data-testid="input-vm-campaign-cap"
                      />
                      Max VMs per day for campaign
                    

                    
                      
                        
                        Per-Contact Cap
                      
                       setVmContactCap(parseInt(e.target.value))}
                        min={1}
                        max={5}
                        data-testid="input-vm-contact-cap"
                      />
                      Max VMs per contact
                    
                  
                
              )}
            
          
        
      )}

      {/* AI Agent Mode Settings */}
      {dialMode === 'ai_agent' && (
        <>
          

          {/* AI Persona Configuration */}
          
            
              
                
                AI Persona
              
              
                Configure how your AI agent introduces itself and its voice characteristics
              
            
            
              
                
                  Agent Name
                   setAiPersonaName(e.target.value)}
                    data-testid="input-ai-persona-name"
                  />
                  The name the AI will use to introduce itself
                

                
                  Company Name
                   setAiCompanyName(e.target.value)}
                    data-testid="input-ai-company-name"
                  />
                  Your company name for introductions
                
              

              
                Agent Role/Title
                 setAiRole(e.target.value)}
                  data-testid="input-ai-role"
                />
              

              
                Voice Selection
                
                  {AI_VOICES.map((voice) => (
                     setAiVoice(voice.value)}
                      data-testid={`card-voice-${voice.value}`}
                    >
                      
                        {voice.label}
                        {voice.description}
                      
                    
                  ))}
                
              
            
          

          {/* AI Scripts Configuration */}
          
            
              
                
                Conversation Scripts
              
              
                Define what the AI should say in different scenarios. Use {"{{firstName}}"}, {"{{lastName}}"}, {"{{companyName}}"} for personalization.
              
            
            
              {/* AI Script Generator */}
              
                
                  
                    
                    Generate Scripts with AI
                  
                  
                    Describe your campaign and let AI generate optimized call scripts for you.
                  
                   setCampaignBrief(e.target.value)}
                    rows={4}
                    data-testid="textarea-campaign-brief"
                  />
                  
                    
                      {campaignBrief.length}/20 characters minimum
                    
                    
                      {generateScriptsMutation.isPending ? (
                        <>
                          
                          Generating...
                        
                      ) : (
                        <>
                          
                          Generate Scripts
                        
                      )}
                    
                  
                
              

              

              
                Opening Script
                 setAiOpeningScript(e.target.value)}
                  rows={3}
                  data-testid="textarea-ai-opening"
                />
                Initial greeting when call connects
              

              
                Gatekeeper Script
                 setAiGatekeeperScript(e.target.value)}
                  rows={3}
                  data-testid="textarea-ai-gatekeeper"
                />
                Professional responses when speaking with receptionists or assistants
              

              
                Main Pitch Script
                 setAiPitchScript(e.target.value)}
                  rows={4}
                  data-testid="textarea-ai-pitch"
                />
                Core telemarketing message for decision makers
              

              
                Objection Handling
                 'I completely understand. Many of our current clients felt the same way initially...'"
                  value={aiObjectionsScript}
                  onChange={(e) => setAiObjectionsScript(e.target.value)}
                  rows={4}
                  data-testid="textarea-ai-objections"
                />
                How to respond to common objections
              

              
                Closing Script
                 setAiClosingScript(e.target.value)}
                  rows={3}
                  data-testid="textarea-ai-closing"
                />
                How to end calls professionally
              
            
          

          {/* Gatekeeper Navigation */}
          
            
              
                
                Gatekeeper Navigation
              
              
                Configure how the AI handles gatekeepers and receptionists
              
            
            
              
                Maximum Navigation Attempts
                 setGatekeeperMaxAttempts(parseInt(v))}
                >
                  
                    
                  
                  
                    1 attempt
                    2 attempts
                    3 attempts (recommended)
                    4 attempts
                    5 attempts
                  
                
                
                  How many times to attempt reaching the decision maker before scheduling callback
                
              
            
          

          {/* Human Handoff Configuration */}
          
            
              
                
                Human Handoff
              
              
                Configure when and how to transfer calls to live human agents
              
            
            
              
                
                  Enable Human Handoff
                  Allow AI to transfer calls to live agents
                
                
              

              {handoffEnabled && (
                <>
                  
                    Transfer Phone Number
                     setHandoffTransferNumber(e.target.value)}
                      data-testid="input-handoff-number"
                    />
                    Phone number or extension to transfer qualified calls to
                  

                  
                    Handoff Triggers
                    
                      Select when the AI should transfer to a human agent
                    
                    
                      {HANDOFF_TRIGGERS.map((trigger) => (
                        
                           toggleHandoffTrigger(trigger.value)}
                            data-testid={`checkbox-trigger-${trigger.value}`}
                          />
                          
                            {trigger.label}
                          
                        
                      ))}
                    
                  
                
              )}
            
          

          {/* Business Hours Configuration */}
          
            
              
                
                Business Hours
              
              
                AI calls will only be placed during business hours based on the contact's local timezone
              
            
            
              
                
                  Enforce Business Hours
                  Only place calls during configured hours
                
                
              

              {businessHoursEnabled && (
                <>
                  
                    
                      
                        
                        Respect Contact Timezone
                      
                      Use contact's local timezone instead of campaign timezone
                    
                    
                  

                  
                    
                      Default Timezone
                      
                        
                          
                        
                        
                          Eastern (New York)
                          Central (Chicago)
                          Mountain (Denver)
                          Pacific (Los Angeles)
                          Alaska
                          Hawaii
                          UK (London)
                          Central Europe (Paris)
                          Japan (Tokyo)
                          Australia (Sydney)
                        
                      
                      Fallback when contact timezone unknown
                    

                    
                      Operating Hours
                      
                        
                          
                            
                          
                          
                            8:00 AM
                            8:30 AM
                            9:00 AM
                            9:30 AM
                            10:00 AM
                          
                        
                        to
                        
                          
                            
                          
                          
                            4:00 PM
                            4:30 PM
                            5:00 PM
                            5:30 PM
                            6:00 PM
                            6:30 PM
                            7:00 PM
                            8:00 PM
                          
                        
                      
                    
                  

                  
                    
                      
                      Operating Days
                    
                    
                      {['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'].map((day) => (
                         {
                            setOperatingDays(prev => 
                              prev.includes(day) 
                                ? prev.filter(d => d !== day)
                                : [...prev, day]
                            );
                          }}
                          data-testid={`toggle-day-${day}`}
                        >
                          {day.charAt(0).toUpperCase() + day.slice(1, 3)}
                        
                      ))}
                    
                    
                      US federal holidays are automatically excluded
                    
                  
                
              )}
            
          

          {/* Lead & QA Integration Notice */}
          
            
              
                
                
                  Lead & QA Integration
                  
                    AI agent calls follow the same workflow as human agents: leads are created automatically, 
                    dispositions are logged, recordings are synced, and all calls go through your standard QA process.
                    Configure QA parameters in the next steps.
                  
                
              
            
          
        
      )}

      {/* Navigation */}
      
        
          Back
        
        
          Continue to Scheduling
        
      
    
  );
}