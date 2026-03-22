import { useState, useEffect, useRef } from "react";
import { useRoute, useLocation } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest, getAuthHeaders } from "@/lib/queryClient";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { ArrowLeft, Save, Phone, Users, Shield, Settings, Brain, Bot, Target, Package, ListChecks, X, Plus, Layers, Sparkles, Mic, Volume2, Play, Square, User, Building, Loader2 } from "lucide-react";
import { ALL_VOICES } from '@/lib/voice-constants';
import { cn } from "@/lib/utils";
import { HybridAgentAssignment } from "@/components/hybrid-agent-assignment";
import { StepQAParameters } from "@/components/campaign-builder/step-qa-parameters";
import { CampaignContextRegenerate } from "@/components/campaigns/campaign-context-regenerate";
import { Checkbox } from "@/components/ui/checkbox";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { PhoneCampaignSuppressionManager } from "@/components/phone-campaign-suppression-manager";
import { CampaignKnowledgeConfig } from "@/components/campaigns/campaign-knowledge-config";
import { CampaignAudienceSelector, type AudienceSelection } from "@/components/campaigns/CampaignAudienceSelector";
import { CampaignContextEditor } from "@/components/campaigns/CampaignContextEditor";
import { normalizeCampaignCallFlow, type CampaignCallFlow } from "@shared/call-flow";
import { SUPER_ORG_ID, SUPER_ORG_NAME } from "@shared/schema";

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
  const [selectedSegments, setSelectedSegments] = useState([]);
  const [selectedLists, setSelectedLists] = useState([]);
  const [selectedDomainSets, setSelectedDomainSets] = useState([]);
  const [audienceSource, setAudienceSource] = useState("segment");
  // Advanced filters + exclusions (parity with create workflow)
  const [filterGroup, setFilterGroup] = useState(undefined);
  const [appliedFilterGroup, setAppliedFilterGroup] = useState(undefined);
  const [excludedSegments, setExcludedSegments] = useState([]);
  const [excludedLists, setExcludedLists] = useState([]);

  // Campaign Context fields (replaces call script)
  const [campaignObjective, setCampaignObjective] = useState("");
  const [productServiceInfo, setProductServiceInfo] = useState("");
  const [talkingPoints, setTalkingPoints] = useState([]);
  const [targetAudienceDescription, setTargetAudienceDescription] = useState("");
  const [successCriteria, setSuccessCriteria] = useState("");
  const [campaignObjections, setCampaignObjections] = useState([]);
  const [callFlow, setCallFlow] = useState(null);

  // Account Cap state
  const [capEnabled, setCapEnabled] = useState(false);
  const [leadsPerAccount, setLeadsPerAccount] = useState(3);
  const [capMode, setCapMode] = useState('queue_size');

  // QA Parameters state
  const [qaParameters, setQaParameters] = useState(null);

  // Lead Delivery state
  const [deliveryTemplateId, setDeliveryTemplateId] = useState(null);

  // Max Call Duration state (in seconds, default 240 = 4 minutes)
  const [maxCallDurationSeconds, setMaxCallDurationSeconds] = useState(240);

  // Voice Provider per-campaign (null = use system default)
  const [voiceProvider, setVoiceProvider] = useState(null);

  const problemIntelligenceOrgId = SUPER_ORG_ID;

  // Dial Mode state - AI Agent mode is the default and only supported mode
  const [dialMode, setDialMode] = useState('ai_agent');

  // AI Agent Concurrency state (for ai_agent dial mode)
  const [maxConcurrentCalls, setMaxConcurrentCalls] = useState(50);

  // AI Voice/Persona state
  const [selectedVoice, setSelectedVoice] = useState('Fenrir');
  const [aiPersonaName, setAiPersonaName] = useState('');
  const [aiRole, setAiRole] = useState('Sales Representative');
  const [genderFilter, setGenderFilter] = useState('all');
  const [providerFilter, setProviderFilter] = useState('all');
  const [playingVoice, setPlayingVoice] = useState(null);
  const [loadingVoice, setLoadingVoice] = useState(null);
  const audioRef = useRef(null);

  // Build voice list from constants
  const AI_VOICES = ALL_VOICES.map(v => ({
    value: v.id,
    label: v.name,
    description: v.description,
    gender: v.gender,
    provider: v.provider,
    tone: v.tone,
    bestFor: v.bestFor,
    color: v.color,
  }));

  // Fetch campaign data - always refetch to ensure we have latest context fields
  const { data: campaign, isLoading: campaignLoading } = useQuery({
    queryKey: [`/api/campaigns/${campaignId}`],
    enabled: !!campaignId,
    staleTime: 0, // Always consider data stale so it refetches
    refetchOnMount: 'always', // Force refetch when component mounts
  });

  // Fetch export templates for lead delivery
  const { data: exportTemplates = [] } = useQuery({
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
      setCampaignObjections(campaign.campaignObjections || []);
      setCallFlow(normalizeCampaignCallFlow(campaign.callFlow, campaign.type));

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

      // Initialize voice provider
      setVoiceProvider(campaign.voiceProvider || null);

      // AI Agent mode is always used
      // setDialMode is not needed as it's always 'ai_agent'

      // Initialize AI Agent settings
      if (campaign.maxConcurrentWorkers) {
        setMaxConcurrentCalls(campaign.maxConcurrentWorkers);
      } else if (campaign.aiAgentSettings?.maxConcurrentCalls) {
        setMaxConcurrentCalls(campaign.aiAgentSettings.maxConcurrentCalls);
      }

      // Initialize AI Voice/Persona settings
      if (campaign.aiAgentSettings?.persona) {
        setSelectedVoice(campaign.aiAgentSettings.persona.voice || 'Fenrir');
        setAiPersonaName(campaign.aiAgentSettings.persona.name || '');
        setAiRole(campaign.aiAgentSettings.persona.role || 'Sales Representative');
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
  const syncQueueMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", `/api/campaigns/${campaignId}/ops/sync-queue`, { link_accounts: true });
      return res.json();
    },
    onSuccess: (data) => {
      toast({
        title: "Queue Sync Complete",
        description: `Added: ${data.added_to_queue}, Accounts Linked: ${data.accounts_linked}, Skipped (No Account): ${data.skipped_no_account}`,
      });
    },
    onError: (error) => {
      toast({
        title: "Sync Failed",
        description: error.message,
        variant: "destructive",
      });
    }
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
      persona: {
        ...(campaign?.aiAgentSettings?.persona || {}),
        name: aiPersonaName,
        role: aiRole,
        voice: selectedVoice,
        companyName: SUPER_ORG_NAME,
      },
    };

    updateMutation.mutate({
      name,
      audienceRefs,
      accountCap,
      qaParameters,
      deliveryTemplateId,
      // Max call duration enforcement
      maxCallDurationSeconds,
      // Voice provider per-campaign
      voiceProvider: voiceProvider || null,
      // Organization assignment
      problemIntelligenceOrgId,
      // Dial mode
      dialMode,
      maxConcurrentWorkers: maxConcurrentCalls,
      // AI Agent settings (includes concurrency)
      aiAgentSettings,
      // Campaign Context fields
      campaignObjective,
      productServiceInfo,
      talkingPoints: talkingPoints.length > 0 ? talkingPoints : undefined,
      targetAudienceDescription,
      successCriteria,
      campaignObjections: campaignObjections.length > 0 ? campaignObjections : undefined,
      callFlow,
    });
  };

  if (campaignLoading) {
    return (
      
        
        
      
    );
  }

  if (!campaign) {
    return (
      
        
          
            Campaign Not Found
            
              The requested phone campaign could not be found.
            
          
        
      
    );
  }

  return (
    
      {/* Header */}
      
        
           setLocation('/phone-campaigns')}
            data-testid="button-back"
          >
            
          
          
            Edit Phone Campaign
            {campaign.name}
          
        
        
          
          Save Changes
        
      

      {/* Campaign Status Badge */}
      
        
          
            Status:
            
              {campaign.status}
            
          
        
      

      {/* Tabs for different sections */}
      
        
          
            
            Basic Info
          
          
            
            Audience
          
          
            
            AI Voice
          
          
            
            Agents
          
          
            
            Knowledge
          
          
            
            AI Quality
          
          
            
            Suppressions
          
          
            
            Settings
          
        

        {/* Basic Info Tab */}
        
          
            
              Basic Information
              
                Update campaign name and organization
              
            
            
              
                Campaign Name
                 setName(e.target.value)}
                  placeholder="Enter campaign name"
                  data-testid="input-name"
                />
              

              
                Organization
                
                  
                  {SUPER_ORG_NAME}
                  Super Organization
                
                
                  Admin campaigns always use the super organization for Problem Intelligence and messaging context
                
              
            
          

          {/* Campaign Context Section */}
           {
              setCampaignObjective(newData.campaignObjective);
              setProductServiceInfo(newData.productServiceInfo);
              setTalkingPoints(newData.talkingPoints);
              setTargetAudienceDescription(newData.targetAudienceDescription);
              setSuccessCriteria(newData.successCriteria);
              setCampaignObjections(newData.campaignObjections || []);
              setCallFlow(newData.callFlow || null);
            }}
            campaignType={campaign.type}
            headerAction={
               {
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
        

        {/* Audience Tab */}
        
          
            
              Queue Operations
              
                Maintenance tools for campaign queue
              
            
            
              
                  syncQueueMutation.mutate()} variant="outline" disabled={syncQueueMutation.isPending}>
                    {syncQueueMutation.isPending ?  : }
                    Sync Queue & Link Accounts
                 
                 
                    Populates missing contacts into the queue and attempts to link them to accounts by normalized company name.
                 
              
            
          

          
            
              Audience Selection
              
                Choose the target audience for this campaign
              
            
            
               {
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
            
          
        

        {/* AI Voice Tab */}
        
          {/* AI Persona Configuration */}
          
            
              
                
                AI Persona
              
              
                Configure how your AI agent introduces itself
              
            
            
              
                
                  Agent Name
                   setAiPersonaName(e.target.value)}
                    data-testid="input-ai-persona-name"
                  />
                  Name used in introductions
                

                
                  Company Name
                  
                    
                    {SUPER_ORG_NAME}
                  
                  From the super organization
                

                
                  Agent Role
                   setAiRole(e.target.value)}
                    data-testid="input-ai-role"
                  />
                  Role/title for the agent
                
              
            
          

          {/* Voice Filters */}
          
            
              Gender
              
                {(['all', 'male', 'female'] as const).map((g) => (
                   setGenderFilter(g)}
                    data-testid={`filter-gender-${g}`}
                  >
                    {g === 'all' ? 'All' : g.charAt(0).toUpperCase() + g.slice(1)}
                  
                ))}
              
            
            
              Provider
              
                {(['all', 'gemini', 'openai'] as const).map((p) => (
                   setProviderFilter(p)}
                    data-testid={`filter-provider-${p}`}
                  >
                    {p === 'all' ? 'All' : p.charAt(0).toUpperCase() + p.slice(1)}
                  
                ))}
              
            
          

          {/* Voice Grid */}
          
            
              
                
                Select AI Voice
              
              
                Choose the voice that will represent your brand on calls
              
            
            
              
                {AI_VOICES
                  .filter(voice => {
                    if (genderFilter !== 'all' && voice.gender !== genderFilter) return false;
                    if (providerFilter !== 'all' && voice.provider !== providerFilter) return false;
                    return true;
                  })
                  .map((voice) => (
                     setSelectedVoice(voice.value)}
                      data-testid={`voice-${voice.value}`}
                    >
                      
                        
                          
                            {voice.label}
                            
                              {voice.provider}
                            
                          
                          {voice.description}
                          
                            
                              {voice.gender}
                            
                            {voice.tone && (
                              
                                {voice.tone}
                              
                            )}
                          
                        
                         {
                            e.stopPropagation();
                            if (playingVoice === voice.value) {
                              if (audioRef.current) {
                                audioRef.current.pause();
                                audioRef.current.currentTime = 0;
                              }
                              setPlayingVoice(null);
                              setLoadingVoice(null);
                              return;
                            }
                            if (audioRef.current) {
                              audioRef.current.pause();
                              audioRef.current.currentTime = 0;
                            }
                            setLoadingVoice(voice.value);
                            try {
                              const response = await fetch('/api/voice-providers/preview', {
                                method: 'POST',
                                headers: {
                                  'Content-Type': 'application/json',
                                  ...getAuthHeaders(),
                                },
                                credentials: 'include',
                                body: JSON.stringify({
                                  voiceId: voice.value,
                                  provider: voice.provider,
                                }),
                              });
                              if (!response.ok) throw new Error('Failed to load preview');
                              const audioBlob = await response.blob();
                              const audioUrl = URL.createObjectURL(audioBlob);
                              audioRef.current = new Audio(audioUrl);
                              audioRef.current.onended = () => {
                                setPlayingVoice(null);
                                setLoadingVoice(null);
                                URL.revokeObjectURL(audioUrl);
                              };
                              setPlayingVoice(voice.value);
                              setLoadingVoice(null);
                              await audioRef.current.play();
                            } catch (error) {
                              setLoadingVoice(null);
                              toast({
                                title: "Preview Unavailable",
                                description: "Could not load voice preview",
                                variant: "destructive",
                              });
                            }
                          }}
                          data-testid={`play-voice-${voice.value}`}
                        >
                          {loadingVoice === voice.value ? (
                            
                          ) : playingVoice === voice.value ? (
                            
                          ) : (
                            
                          )}
                        
                      
                      {selectedVoice === voice.value && (
                        
                          
                        
                      )}
                    
                  ))}
              
            
          
        

        {/* Agents Tab */}
        
          
        

        {/* Knowledge Blocks Tab */}
        
          {campaignId && }
        

        {/* QA Parameters Tab */}
        
           setQaParameters(data.qaParameters)}
            onNext={() => {}}
          />
        

        {/* Suppressions Tab */}
        
          
        

        {/* Settings Tab */}
        
          {/* AI Agent Mode */}
          
            
              
                
                AI Voice Agent Mode
              
              
                AI voice agent handles calls autonomously using live voice technology
              
            
            
              {/* AI Agent Concurrency Settings */}
              
                Max Concurrent Calls
                 setMaxConcurrentCalls(Math.max(1, Math.min(100, parseInt(e.target.value) || 1)))}
                  data-testid="input-max-concurrent-calls"
                />
                
                  Maximum number of simultaneous AI calls for this campaign (1-100)
                
              
            
          

          
            
              Account Lead Cap
              
                Limit the number of contacts attempted per account
              
            
            
              
                 setCapEnabled(checked as boolean)}
                  data-testid="checkbox-cap-enabled"
                />
                
                  Enable Account Lead Cap
                
              

              {capEnabled && (
                
                  
                    Maximum Leads per Account
                     setLeadsPerAccount(parseInt(e.target.value) || 1)}
                      data-testid="input-leads-per-account"
                    />
                    
                      Maximum number of contacts to attempt per account
                    
                  

                  
                    Enforcement Mode
                    
                      
                        
                        
                          Queue Size (limit contacts added to queue)
                        
                      
                      
                        
                        
                          Connected Calls (limit based on successful connections)
                        
                      
                      
                        
                        
                          Positive Dispositions (limit based on interested/qualified outcomes)
                        
                      
                    
                  
                
              )}
            
          

          {/* Voice Provider */}
          
            
               Voice Provider
              
                Select which AI voice provider this campaign uses. Set per-campaign to run OpenAI and Google simultaneously across campaigns.
              
            
            
              
                Provider
                 setVoiceProvider(value === "default" ? null : value)}
                >
                  
                    
                  
                  
                    System Default
                    OpenAI Realtime
                    Google Gemini
                  
                
                
                  {voiceProvider
                    ? `This campaign will use ${voiceProvider === 'openai' ? 'OpenAI Realtime' : 'Google Gemini'} for all calls.`
                    : 'Using the system-wide default voice provider.'}
                
              
            
          

          {/* Max Call Duration */}
          
            
              Max Call Duration
              
                Strictly enforce a maximum call duration for all AI voice calls in this campaign
              
            
            
              
                Maximum Duration (seconds)
                 setMaxCallDurationSeconds(Math.max(60, Math.min(1800, parseInt(e.target.value) || 240)))}
                  data-testid="input-max-call-duration"
                />
                
                  Calls will be automatically ended after this duration. Range: 60-1800 seconds (1-30 minutes).
                  Current: {Math.floor(maxCallDurationSeconds / 60)} min {maxCallDurationSeconds % 60} sec
                
              
              
                 setMaxCallDurationSeconds(120)}>2 min
                 setMaxCallDurationSeconds(180)}>3 min
                 setMaxCallDurationSeconds(240)}>4 min
                 setMaxCallDurationSeconds(300)}>5 min
                 setMaxCallDurationSeconds(600)}>10 min
              
            
          

          
            
              Lead Delivery Template
              
                Configure how qualified leads are formatted when delivered via webhook
              
            
            
              
                Export Template
                 setDeliveryTemplateId(value === "none" ? null : value)}
                >
                  
                    
                  
                  
                    No template (raw data)
                    {exportTemplates.map((template: any) => (
                      
                        {template.name}
                      
                    ))}
                  
                
                
                  When a lead is QA approved, it will be automatically formatted using this template and delivered via the configured webhook.
                  Configure delivery webhooks in Campaign Orders.
                
              
            
          
        
      
    
  );
}