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

  // AI Agent Concurrency Settings
  const [maxConcurrentCalls, setMaxConcurrentCalls] = useState(data.maxConcurrentWorkers || data.aiAgentSettings?.maxConcurrentCalls || 50);

  // Business Hours Settings
  const [businessHoursEnabled, setBusinessHoursEnabled] = useState(data.aiAgentSettings?.businessHours?.enabled ?? true);
  const [businessHoursTimezone, setBusinessHoursTimezone] = useState(data.aiAgentSettings?.businessHours?.timezone || 'America/New_York');
  const [businessHoursStart, setBusinessHoursStart] = useState(data.aiAgentSettings?.businessHours?.startTime || '09:00');
  const [businessHoursEnd, setBusinessHoursEnd] = useState(data.aiAgentSettings?.businessHours?.endTime || '17:00');
  const [respectContactTimezone, setRespectContactTimezone] = useState(data.aiAgentSettings?.businessHours?.respectContactTimezone ?? true);
  const [operatingDays, setOperatingDays] = useState(
    data.aiAgentSettings?.businessHours?.operatingDays || ['monday', 'tuesday', 'wednesday', 'thursday', 'friday']
  );

  // Campaign AI Context (Foundation + Campaign Layer Architecture)
  const [campaignObjective, setCampaignObjective] = useState(data.campaignObjective || '');
  const [productServiceInfo, setProductServiceInfo] = useState(data.productServiceInfo || '');
  const [talkingPoints, setTalkingPoints] = useState(data.talkingPoints || []);
  const [newTalkingPoint, setNewTalkingPoint] = useState('');
  const [targetAudienceDescription, setTargetAudienceDescription] = useState(data.targetAudienceDescription || '');
  const [campaignObjections, setCampaignObjections] = useState>(
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
    if (campaignBrief.length  {
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
      maxConcurrentWorkers: maxConcurrentCalls,
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
    
      {/* AI Voice Agent Mode Header */}
      
        
          
            
            
              AI Voice Agent Mode
              
                Intelligent AI agents handle calls autonomously using live voice technology
              
            
          
        
      

      {/* AI Agent Mode Settings */}
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
                
              
            
          

          {/* AI Agent Concurrency Settings */}
          
            
              
                
                Concurrency Settings
              
              
                Configure how many simultaneous calls the AI agent can handle
              
            
            
              
                Max Concurrent Calls
                 setMaxConcurrentCalls(Math.max(1, Math.min(100, parseInt(e.target.value) || 1)))}
                  data-testid="input-max-concurrent-calls"
                />
                
                  Maximum number of simultaneous AI calls for this campaign (1-100). Higher values allow faster outreach but require more capacity.
                
              
            
          

          {/* Campaign AI Context - Foundation + Campaign Layer Architecture */}
          
            
              
                
                Campaign Context for AI Agent
                Recommended
              
              
                Define what this campaign is about. The AI agent will use this context along with its
                foundational training to have informed conversations.
              
            
            
              {/* Campaign Objective */}
              
                Campaign Objective
                 setCampaignObjective(e.target.value)}
                  rows={2}
                  data-testid="textarea-campaign-objective"
                />
                What is the primary goal of each call?
              

              {/* Product/Service Info */}
              
                
                  
                  Product/Service Information
                
                 setProductServiceInfo(e.target.value)}
                  rows={4}
                  data-testid="textarea-product-info"
                />
              

              {/* Key Talking Points */}
              
                
                  
                  Key Talking Points
                
                
                  Add the main points the AI should emphasize during conversations.
                
                
                  {talkingPoints.map((point, index) => (
                    
                      {point}
                       removeTalkingPoint(index)}
                        className="h-6 w-6 p-0 text-muted-foreground hover:text-destructive"
                      >
                        
                      
                    
                  ))}
                  
                     setNewTalkingPoint(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), addTalkingPoint())}
                      data-testid="input-new-talking-point"
                    />
                    
                      
                    
                  
                
              

              {/* Target Audience */}
              
                
                  
                  Target Audience
                
                 setTargetAudienceDescription(e.target.value)}
                  rows={2}
                  data-testid="textarea-target-audience"
                />
                Who are you trying to reach? The AI will tailor its approach accordingly.
              

              {/* Success Criteria */}
              
                Success Criteria
                 setSuccessCriteria(e.target.value)}
                  rows={2}
                  data-testid="textarea-success-criteria"
                />
                What counts as a successful call outcome?
              
            
          

          {/* Campaign-Specific Objections */}
          
            
              
                
                Campaign-Specific Objection Handling
              
              
                Add objections specific to this campaign. The AI agent already knows general objection
                handling - add only campaign-specific responses here.
              
            
            
              {campaignObjections.length > 0 && (
                
                  {campaignObjections.map((obj, index) => (
                    
                      
                        
                          "{obj.objection}"
                          Response: {obj.response}
                        
                         removeObjection(index)}
                          className="h-6 w-6 p-0 text-muted-foreground hover:text-destructive"
                        >
                          
                        
                      
                    
                  ))}
                
              )}

              
                
                  Objection
                   setNewObjection(e.target.value)}
                    data-testid="input-new-objection"
                  />
                
                
                  Response
                   setNewObjectionResponse(e.target.value)}
                    rows={2}
                    data-testid="textarea-new-objection-response"
                  />
                
                
                  
                  Add Objection & Response
                
              
            
          

          {/* Legacy Scripts Section - Collapsible */}
          
             setShowLegacyScripts(!showLegacyScripts)}
            >
              
                
                  
                  Advanced: Legacy Scripts
                
                {showLegacyScripts ? (
                  
                ) : (
                  
                )}
              
              
                Detailed conversation scripts for specific scenarios. The Campaign Context above is usually sufficient.
              
            
            {showLegacyScripts && (
              
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
                
              
            )}
          

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
                  
                
              
            
          

      {/* Navigation */}
      
        
          Back
        
        
          Continue to Scheduling
        
      
    
  );
}