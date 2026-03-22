import React, { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Label } from "@/components/ui/label";
import {
  Loader2,
  Check,
  AlertCircle,
  Plus,
  X,
  CheckCircle2,
  BookOpen,
  Save,
  Brain,
  Shield,
  Settings,
  Cpu,
  Mail,
  Search,
  Phone,
  FileText,
  Trash2,
} from "lucide-react";
import { AgentPromptViewer } from "@/components/agent-prompts";
import { useToast } from "@/hooks/use-toast";

// ============== INTERFACES ==============

interface PromptOptimizationData {
  orgIntelligence: {
    raw: string;
    parsed: string[];
  };
  compliancePolicy: {
    raw: string;
    parsed: string[];
  };
  platformPolicies: {
    raw: string;
    parsed: string[];
  };
  agentVoiceDefaults: {
    raw: string;
    parsed: string[];
  };
}

type TrainingCenter = Record;

interface ComplianceGuardrails {
  dos: string[];
  donts: string[];
}

interface StrategyDoc {
  id: string;
  title: string;
  content: string;
  createdAt: string;
  isActive: boolean;
}

// ============== DEFAULTS ==============

const DEFAULT_ORG_INTELLIGENCE = [
  "Organization intelligence is not configured.",
  "Define brand name, positioning, offerings, ICP, personas, approved claims, and tone.",
];

const DEFAULT_COMPLIANCE_POLICY = [
  "Respect business hours in the prospect's local timezone.",
  "Immediately honor opt-out and do-not-call requests.",
  "Do not harass, pressure, or repeatedly call uninterested prospects.",
  "Be polite, professional, and calm at all times.",
  "No deceptive behavior or misrepresentation.",
  "Do not misuse personal data.",
  "Escalate to a human when uncertain.",
];

const DEFAULT_PLATFORM_POLICIES = [
  "Operate only within allowed tool permissions.",
  "Do not expand tool permissions implicitly.",
  "Use escalation rules when risk is detected.",
];

const DEFAULT_AGENT_VOICE_DEFAULTS = [
  "Use conversational turn-taking: listen before responding.",
  "Navigate IVR quickly and politely.",
  "Handle gatekeepers with concise, respectful requests.",
  "Ask for transfers using role-based language.",
  "Decide when to leave voicemail versus retry.",
  "Escalate to a human when needed.",
];

const DEFAULT_TRAINING_CENTER: TrainingCenter = {
  general_intelligence: [
    'CORE PRINCIPLE: Always understand what just happened, acknowledge it, and respond in a way that feels human and attentive',
    'UNIVERSAL RULE: Never ignore user input, never jump ahead without acknowledging, never stack multiple intents in one response, never sound rushed or mechanical',
    'EMOTIONAL LITERACY: Recognize permission, hesitation, confusion, interruption, cooperation, and resistance in every interaction',
    'When someone gives time: Express gratitude immediately',
    'When someone hesitates: Acknowledge and slow down your pace',
    'When you interrupt: Apologize briefly and respectfully',
    'When conversation ends: Close warmly regardless of outcome',
    'GRATITUDE RULE: Whenever another human helps, listens, responds, or cooperates - explicitly acknowledge it',
    'Approved gratitude phrases: "Thank you — I appreciate that", "Thanks for taking a moment", "I appreciate you letting me know", "Thank you for your time"',
    'This applies to: Voice agents, Chat agents, Email agents, Internal assistants',
    'APOLOGY AWARENESS: Understand when an apology is socially appropriate, even if no error occurred',
    'When to apologize: Interrupting, asking for time, clarifying after confusion, repeating a question, ending a conversation unexpectedly',
    'Approved neutral apologies: "Sorry about that", "I apologize for the interruption", "Apologies — let me clarify"',
    'Apology tone: No guilt, no weakness - just professionalism',
    'RESPONSIVENESS RULE: An agent should never appear absent - if you need time to think, acknowledge first, then respond',
    'Universal acknowledgement fillers: "Understood", "I see", "Got it", "That makes sense"',
    'NATURALNESS RULE: Avoid repetition and feel natural - track last 1-2 acknowledgement phrases and avoid repeating consecutively',
    'Rotate between: Neutral ("Got it", "Understood"), Gratitude ("Thank you", "I appreciate that"), Empathy ("I understand", "That makes sense")',
    'SOCIAL CONTINUITY: Maintain light internal understanding of what the human cares about, what has been said, what should not be repeated, and where the conversation stands',
    'CLOSING RULE: Every interaction must end politely, clearly, and without abrupt cutoff',
    'Universal closings: "Thank you for your time", "I appreciate the conversation", "Let me know if you need anything else"',
    'LEARNING CATEGORIES: Humanity, Tone, Responsiveness, Politeness, Conversational flow',
  ],
  generic: [
    'Handle greetings politely',
    'If unsure, ask a concise clarifying question',
    'NEVER leave voicemail - no exceptions, no fallback, no shortened version',
    'First spoken line must be: "Hi, may I speak with {{contact.full_name}}, the {{contact.job_title}} at {{account.name}}?"',
    'If voicemail is offered by anyone, say: "That\'s okay — I\'ll try again later. Thank you." then END CALL immediately',
    'If call routes directly to voicemail: Do NOT speak, do NOT record anything, do NOT introduce yourself - end call silently',
    'If gatekeeper mentions voicemail ("leave a voicemail", "send to voicemail", "goes to voicemail"), say: "No problem — I\'ll try again later. Thank you." then END CALL',
    'Log voicemail outcomes as: VOICEMAIL_DETECTED with voicemail_left: false (always)',
    'Be kind, respectful, warm but not casual, professional never robotic, humble never entitled, calm never rushed',
    'Sound like a thoughtful professional who respects time, appreciates permission, and never assumes access',
    'Use gratitude phrases naturally: "Thank you — I appreciate that", "I really appreciate you giving me a moment", "Thanks for taking the time"',
    'Use apology phrases when interrupting: "I apologize for the interruption", "Sorry to catch you unexpectedly", "I\'ll be very brief — I appreciate your patience"',
    'When permission granted, acknowledge: "Thank you — I\'ll keep this to the 20 seconds you offered"',
    'When interest shown: "Thank you very much — I really appreciate that", "That\'s great, thank you for your openness"',
    'End calls gracefully: "Thank you for your time — I appreciate it", "Thanks again, have a great rest of your day"',
  ],
  demand_intel: [
    'Summarize key buying signals',
    'Capture competitor mentions',
    'Highlight tech stack clues',
  ],
  demand_qual: [
    'Confirm need, timeline, and authority',
    'Surface objections and summarize responses',
    'NEVER leave voicemail under any circumstances',
    'If voicemail detected or offered, politely decline and end call immediately',
    'Always express gratitude when given time or permission',
    'Apologize politely for interruption at call start',
    'End every call with warm, professional gratitude',
  ],
  demand_engage: [
    'Personalize by ICP and role',
    'Suggest next-step CTAs tuned to engagement level',
  ],
};

const DEFAULT_COMPLIANCE_GUARDRAILS: ComplianceGuardrails = {
  dos: [
    "Always disclose you are an AI agent",
    "Verify decision maker status early",
    "Record all calls for quality assurance",
  ],
  donts: [
    "Never promise specific ROI numbers without data",
    "Do not discuss competitor pricing",
    "Never ask for credit card info over chat",
  ],
};

const DEFAULT_STRATEGY_DOCS: StrategyDoc[] = [
  {
    id: "demandgentic-campaign-brief",
    title: "DemandGentic Campaign Strategy Brief",
    content: `MISSION: Accelerate pipeline generation for B2B revenue teams by replacing fragmented point solutions with a single, AI-native demand generation platform that autonomously prospects, qualifies, and nurtures at scale.

TARGET MARKET:
- Company Size: Mid-market to Enterprise ($10M–$500M+ ARR)
- Industries: SaaS/Cloud, Cybersecurity, FinServ, HealthTech, Enterprise Software, Professional Services
- Buyers: VP Demand Gen, VP Revenue Ops, Director of Sales Development, CMO, CRO
- Pain Signal: Teams running 3–5 disconnected tools (dialer + email + ABM + intent data + CRM) with declining connect rates, rising CPL, and no unified intelligence layer

VALUE PROPOSITION: "One platform. AI agents that call, email, and qualify — powered by deep organization intelligence." DemandGentic AI replaces the patchwork of outbound dialers, marketing automation, and ABM tools with an end-to-end demand generation engine.

KEY DIFFERENTIATORS:
- AI Voice Agents: Autonomous outbound calls with real-time conversation analysis, live transcription, and instant lead scoring
- Organization Intelligence: Multi-model deep research (Gemini + OpenAI + Anthropic + DeepSeek) builds ICP profiles, competitive positioning, and messaging angles per prospect
- Generative Studio: Full content suite — landing pages, emails, blogs, eBooks, solution briefs — all enriched with org intelligence context
- Unified Pipeline: Single platform from top-of-funnel prospecting through AE handoff with built-in verification and QA
- Real-Time Intelligence: Sentiment analysis, objection detection, and disposition scoring happen during the call, not after

MESSAGING THEMES:
- Consolidation: "Stop paying for 5 tools that don't talk to each other"
- AI-Native: "Our AI agents don't just analyze calls — they make them"
- Intelligence-First: "Every touchpoint is informed by multi-model company research"
- Speed to Pipeline: "Generate a full campaign — from research to content to calls — in hours, not weeks"
- Quality Over Quantity: "Verified, qualified leads — not raw lists"

COMPETITIVE POSITIONING:
- vs Sales Engagement (Salesloft, Outreach, Apollo): We add autonomous AI voice + org intelligence; they require human SDRs
- vs ABM Platforms (Demandbase, 6sense, Terminus): We execute campaigns end-to-end; they provide intent signals only
- vs AI Voice (Bland AI, Air AI): We embed voice in a full demand gen platform; they're standalone voice tools
- vs Marketing Automation (HubSpot, Marketo, Pardot): We're AI-native with real-time intelligence; they're workflow-centric

OUTREACH CHANNELS:
- AI Voice Calls (60%): AI agents open conversations, qualify interest, and book meetings
- Email Sequences (30%): Generative Studio creates persona-specific sequences aligned to org intelligence
- Content & Landing Pages (10%): eBooks, solution briefs, and landing pages as conversion assets

SUCCESS METRICS:
- Connect Rate: >12% on AI voice outreach
- Qualified Lead Rate: >25% of connected calls
- Cost Per Qualified Lead: 40–60% reduction vs. current stack
- Time to First Meeting: (null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [usingDefaults, setUsingDefaults] = useState(false);

  const [formData, setFormData] = useState({
    orgIntelligence: "",
    compliancePolicy: "",
    platformPolicies: "",
    agentVoiceDefaults: "",
  });

  // Training Center State
  const [trainingCenter, setTrainingCenter] = useState(DEFAULT_TRAINING_CENTER);
  const [trainingHasChanges, setTrainingHasChanges] = useState(false);
  const [selectedAgentType, setSelectedAgentType] = useState('general_intelligence');

  // Compliance Guardrails State
  const [guardrails, setGuardrails] = useState(DEFAULT_COMPLIANCE_GUARDRAILS);
  const [guardrailsHasChanges, setGuardrailsHasChanges] = useState(false);
  const [newDo, setNewDo] = useState("");
  const [newDont, setNewDont] = useState("");

  // Strategy Docs State
  const [strategyDocs, setStrategyDocs] = useState(DEFAULT_STRATEGY_DOCS);
  const [strategyDocsHasChanges, setStrategyDocsHasChanges] = useState(false);
  const [newDocTitle, setNewDocTitle] = useState("");
  const [newDocContent, setNewDocContent] = useState("");
  const [addingDoc, setAddingDoc] = useState(false);
  const [editingDocId, setEditingDocId] = useState(null);

  // Fetch prompt optimization data when organizationId changes
  useEffect(() => {
    fetchPromptOptimization();
  }, [organizationId]);

  // Load Training Center from localStorage on mount
  useEffect(() => {
    const stored = localStorage.getItem('virtual-agent-training-center');
    if (stored) {
      try {
        const parsed = JSON.parse(stored);
        setTrainingCenter({ ...DEFAULT_TRAINING_CENTER, ...parsed });
      } catch {
        // ignore parse errors
      }
    }
  }, []);

  // Load Compliance Guardrails from localStorage on mount
  useEffect(() => {
    const stored = localStorage.getItem('compliance-guardrails');
    if (stored) {
      try {
        const parsed = JSON.parse(stored);
        setGuardrails({ ...DEFAULT_COMPLIANCE_GUARDRAILS, ...parsed });
      } catch {
        // ignore parse errors
      }
    }
  }, []);

  // Load Strategy Docs from localStorage on mount
  useEffect(() => {
    const stored = localStorage.getItem('org-intelligence-strategy-docs');
    if (stored) {
      try {
        const parsed = JSON.parse(stored);
        if (Array.isArray(parsed) && parsed.length > 0) {
          setStrategyDocs(parsed);
        }
      } catch {
        // ignore parse errors
      }
    }
  }, []);

  const fetchPromptOptimization = async () => {
    try {
      setLoading(true);
      setError(null);
      const url = organizationId
        ? `/api/org-intelligence/prompt-optimization?organizationId=${organizationId}`
        : "/api/org-intelligence/prompt-optimization";
      const response = await fetch(url, {
        credentials: "include",
        headers: {
          "Authorization": `Bearer ${localStorage.getItem("authToken") || ""}`,
        },
      });

      // If auth fails or server error, use defaults
      if (!response.ok) {
        console.warn("[PromptOptimization] API returned", response.status, "- using defaults");
        setUsingDefaults(true);
        setData({
          orgIntelligence: { raw: DEFAULTS_RAW.orgIntelligence, parsed: DEFAULT_ORG_INTELLIGENCE },
          compliancePolicy: { raw: DEFAULTS_RAW.compliancePolicy, parsed: DEFAULT_COMPLIANCE_POLICY },
          platformPolicies: { raw: DEFAULTS_RAW.platformPolicies, parsed: DEFAULT_PLATFORM_POLICIES },
          agentVoiceDefaults: { raw: DEFAULTS_RAW.agentVoiceDefaults, parsed: DEFAULT_AGENT_VOICE_DEFAULTS },
        });
        setFormData({ ...DEFAULTS_RAW });
        return;
      }

      const result = await response.json();
      const hasAnyValue = [
        result.orgIntelligence?.raw,
        result.compliancePolicy?.raw,
        result.platformPolicies?.raw,
        result.agentVoiceDefaults?.raw,
      ].some((value: string) => value && value.trim().length > 0);

      if (!hasAnyValue) {
        setUsingDefaults(true);
        setData({
          orgIntelligence: { raw: DEFAULTS_RAW.orgIntelligence, parsed: DEFAULT_ORG_INTELLIGENCE },
          compliancePolicy: { raw: DEFAULTS_RAW.compliancePolicy, parsed: DEFAULT_COMPLIANCE_POLICY },
          platformPolicies: { raw: DEFAULTS_RAW.platformPolicies, parsed: DEFAULT_PLATFORM_POLICIES },
          agentVoiceDefaults: { raw: DEFAULTS_RAW.agentVoiceDefaults, parsed: DEFAULT_AGENT_VOICE_DEFAULTS },
        });
        setFormData({ ...DEFAULTS_RAW });
      } else {
        setUsingDefaults(false);
        setData(result);
        setFormData({
          orgIntelligence: result.orgIntelligence?.raw || "",
          compliancePolicy: result.compliancePolicy?.raw || "",
          platformPolicies: result.platformPolicies?.raw || "",
          agentVoiceDefaults: result.agentVoiceDefaults?.raw || "",
        });
      }
    } catch (err: any) {
      console.error("[PromptOptimization] Fetch error:", err);
      // Use defaults on error instead of showing error
      setUsingDefaults(true);
      setData({
        orgIntelligence: { raw: DEFAULTS_RAW.orgIntelligence, parsed: DEFAULT_ORG_INTELLIGENCE },
        compliancePolicy: { raw: DEFAULTS_RAW.compliancePolicy, parsed: DEFAULT_COMPLIANCE_POLICY },
        platformPolicies: { raw: DEFAULTS_RAW.platformPolicies, parsed: DEFAULT_PLATFORM_POLICIES },
        agentVoiceDefaults: { raw: DEFAULTS_RAW.agentVoiceDefaults, parsed: DEFAULT_AGENT_VOICE_DEFAULTS },
      });
      setFormData({ ...DEFAULTS_RAW });
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    try {
      setSaving(true);
      setSaveSuccess(false);
      const response = await fetch("/api/org-intelligence/prompt-optimization", {
        method: "PUT",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${localStorage.getItem("authToken") || ""}`,
        },
        body: JSON.stringify(formData),
      });
      if (!response.ok) throw new Error("Failed to save prompt optimization data");
      setSaveSuccess(true);
      setEditing(false);
      await fetchPromptOptimization();
      setTimeout(() => setSaveSuccess(false), 3000);
    } catch (err: any) {
      setError(err.message || "Failed to save");
    } finally {
      setSaving(false);
    }
  };

  // Training Center handlers
  const handleSaveTraining = () => {
    try {
      localStorage.setItem('virtual-agent-training-center', JSON.stringify(trainingCenter));
      setTrainingHasChanges(false);
      toast({
        title: 'Training Center saved',
        description: 'Training defaults will be used when generating agent prompts.',
      });
    } catch (error) {
      toast({
        title: 'Failed to save',
        description: error instanceof Error ? error.message : 'Could not save training center',
        variant: 'destructive',
      });
    }
  };

  const handleResetTraining = () => {
    setTrainingCenter(DEFAULT_TRAINING_CENTER);
    setTrainingHasChanges(true);
    toast({
      title: 'Reset to defaults',
      description: 'Click Save to persist the changes.',
    });
  };

  const updateTrainingItems = (key: keyof TrainingCenter, items: string[]) => {
    setTrainingCenter(prev => ({ ...prev, [key]: items }));
    setTrainingHasChanges(true);
  };

  // Compliance Guardrails handlers
  const handleSaveGuardrails = () => {
    try {
      localStorage.setItem('compliance-guardrails', JSON.stringify(guardrails));
      setGuardrailsHasChanges(false);
      toast({
        title: 'Compliance Guardrails saved',
        description: 'Guardrails will be applied to all agent interactions.',
      });
    } catch (error) {
      toast({
        title: 'Failed to save',
        description: error instanceof Error ? error.message : 'Could not save guardrails',
        variant: 'destructive',
      });
    }
  };

  const addDo = () => {
    if (newDo.trim()) {
      setGuardrails(prev => ({ ...prev, dos: [...prev.dos, newDo.trim()] }));
      setNewDo("");
      setGuardrailsHasChanges(true);
    }
  };

  const addDont = () => {
    if (newDont.trim()) {
      setGuardrails(prev => ({ ...prev, donts: [...prev.donts, newDont.trim()] }));
      setNewDont("");
      setGuardrailsHasChanges(true);
    }
  };

  const removeDo = (index: number) => {
    setGuardrails(prev => ({ ...prev, dos: prev.dos.filter((_, i) => i !== index) }));
    setGuardrailsHasChanges(true);
  };

  const removeDont = (index: number) => {
    setGuardrails(prev => ({ ...prev, donts: prev.donts.filter((_, i) => i !== index) }));
    setGuardrailsHasChanges(true);
  };

  // Strategy Docs handlers
  const handleSaveStrategyDocs = async () => {
    try {
      localStorage.setItem('org-intelligence-strategy-docs', JSON.stringify(strategyDocs));

      // Also inject active docs into the orgIntelligence field so they flow into buildAgentSystemPrompt
      const activeDocs = strategyDocs.filter(d => d.isActive);
      if (activeDocs.length > 0) {
        const docsContext = activeDocs
          .map(d => `--- STRATEGY DOC: ${d.title} ---\n${d.content}`)
          .join('\n\n');

        const currentOI = formData.orgIntelligence || "";
        // Remove any previously injected strategy doc sections
        const cleanedOI = currentOI.replace(/\n?\n?--- STRATEGY DOC:[\s\S]*$/m, "").trim();
        const updatedOI = cleanedOI ? `${cleanedOI}\n\n${docsContext}` : docsContext;

        setFormData(prev => ({ ...prev, orgIntelligence: updatedOI }));

        // Save to backend
        const response = await fetch("/api/org-intelligence/prompt-optimization", {
          method: "PUT",
          credentials: "include",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${localStorage.getItem("authToken") || ""}`,
          },
          body: JSON.stringify({ orgIntelligence: updatedOI }),
        });
        if (!response.ok) throw new Error("Failed to sync docs to org intelligence");
        await fetchPromptOptimization();
      }

      setStrategyDocsHasChanges(false);
      toast({
        title: 'Strategy Docs saved',
        description: `${activeDocs.length} active doc(s) synced to Organization Intelligence.`,
      });
    } catch (error) {
      toast({
        title: 'Failed to save',
        description: error instanceof Error ? error.message : 'Could not save strategy docs',
        variant: 'destructive',
      });
    }
  };

  const addStrategyDoc = () => {
    if (!newDocTitle.trim() || !newDocContent.trim()) return;
    const newDoc: StrategyDoc = {
      id: `doc-${Date.now()}`,
      title: newDocTitle.trim(),
      content: newDocContent.trim(),
      createdAt: new Date().toISOString(),
      isActive: true,
    };
    setStrategyDocs(prev => [...prev, newDoc]);
    setNewDocTitle("");
    setNewDocContent("");
    setAddingDoc(false);
    setStrategyDocsHasChanges(true);
  };

  const removeStrategyDoc = (id: string) => {
    setStrategyDocs(prev => prev.filter(d => d.id !== id));
    setStrategyDocsHasChanges(true);
  };

  const toggleStrategyDoc = (id: string) => {
    setStrategyDocs(prev => prev.map(d => d.id === id ? { ...d, isActive: !d.isActive } : d));
    setStrategyDocsHasChanges(true);
  };

  const updateStrategyDoc = (id: string, content: string) => {
    setStrategyDocs(prev => prev.map(d => d.id === id ? { ...d, content } : d));
    setStrategyDocsHasChanges(true);
  };

  if (loading) {
    return (
      
        
          
        
      
    );
  }

  if (error) {
    return (
      
        
        {error}
      
    );
  }

  if (!data) return null;

  const PolicySection = ({
    title,
    description,
    items,
    formKey,
  }: {
    title: string;
    description: string;
    items: string[];
    formKey: keyof typeof formData;
  }) => (
    
      
        {title}
        {description}
      
      
        {editing ? (
          
              setFormData({ ...formData, [formKey]: e.target.value })
            }
            placeholder={`Enter ${title.toLowerCase()} (one item per line)`}
            rows={8}
            className="font-mono text-sm"
          />
        ) : (
          
            {items.length === 0 ? (
              No data configured
            ) : (
              items.map((item, idx) => (
                
                  •
                  {item}
                
              ))
            )}
          
        )}
      
    
  );

  return (
    
      {saveSuccess && (
        
          
          
            Prompt optimization intelligence updated successfully
          
        
      )}

      {usingDefaults && !saveSuccess && (
        
          
          
            Showing recommended defaults. Save changes to store them for your organization.
          
        
      )}

      
        
          
            
            Training
          
          
            
            Guardrails
          
          
            
            Docs
          
          Organization
          Compliance
          Platform
          
            
            Voice
          
          Email
          Research
        

        {/* ============== TRAINING CENTER TAB ============== */}
        
          
            
              
                
                  
                  
                    Agent Training Center
                    
                      Define training defaults that will be automatically included in agent system prompts based on their type
                    
                  
                
                
                  
                    Reset to Defaults
                  
                  
                    
                    Save Changes
                  
                
              
            
          

           setSelectedAgentType(v as keyof TrainingCenter)}>
            
              {AGENT_TYPES.map(agentType => (
                
                  
                  {agentType.label}
                
              ))}
            

            {AGENT_TYPES.map(agentType => (
              
                
                  
                    
                      
                      
                        {agentType.label}
                        {agentType.description}
                      
                    
                  
                  
                    
                      Training snippets (one per line)
                       {
                          const lines = e.target.value
                            .split('\n')
                            .map(line => line.trim())
                            .filter(Boolean);
                          updateTrainingItems(agentType.key, lines);
                        }}
                        placeholder="Enter training snippets, best practices, FAQs, or edge case handling..."
                        className="min-h-[200px] font-mono text-sm"
                      />
                      
                        These training snippets will be automatically included in the system prompt when generating prompts for {agentType.label} agents.
                      
                    

                    
                      Current training items ({trainingCenter[agentType.key].length}):
                      {trainingCenter[agentType.key].length === 0 ? (
                        No training items defined yet
                      ) : (
                        
                          {trainingCenter[agentType.key].map((item, idx) => (
                            
                              •
                              {item}
                            
                          ))}
                        
                      )}
                    
                  
                
              
            ))}
          
        

        {/* ============== COMPLIANCE GUARDRAILS TAB ============== */}
        
          
            
              
                
                  
                  
                    Compliance Guardrails
                    
                      Define strict rules for what agents must do and must never do
                    
                  
                
                
                  
                  Save Changes
                
              
            
          

          
            {/* Do's Card */}
            
              
                
                  
                  Do's (Encouraged)
                
                
                  Behaviors and actions the AI should prioritize.
                
              
              
                
                   setNewDo(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && addDo()}
                  />
                  
                    
                  
                
                
                  {guardrails.dos.map((rule, i) => (
                    
                      {rule}
                       removeDo(i)}>
                        
                      
                    
                  ))}
                
              
            

            {/* Don'ts Card */}
            
              
                
                  
                  Don'ts (Restricted)
                
                
                  Strict prohibitions and negative constraints.
                
              
              
                
                   setNewDont(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && addDont()}
                  />
                  
                    
                  
                
                
                  {guardrails.donts.map((rule, i) => (
                    
                      {rule}
                       removeDont(i)}>
                        
                      
                    
                  ))}
                
              
            
          
        

        {/* ============== STRATEGY DOCS TAB ============== */}
        
          
            
              
                
                  
                  
                    Strategy Docs
                    
                      Campaign briefs, strategy documents, and GTM playbooks that inform all AI agent behavior.
                      Active docs are injected into Organization Intelligence context.
                    
                  
                
                
                   setAddingDoc(true)} disabled={addingDoc}>
                    
                    Add Document
                  
                  
                    
                    Save & Sync
                  
                
              
            
          

          {/* Add new doc form */}
          {addingDoc && (
            
              
                Add New Strategy Document
              
              
                
                  Document Title
                   setNewDocTitle(e.target.value)}
                  />
                
                
                  Document Content
                   setNewDocContent(e.target.value)}
                    className="min-h-[200px] font-mono text-sm"
                  />
                
                
                   { setAddingDoc(false); setNewDocTitle(""); setNewDocContent(""); }}>
                    Cancel
                  
                  
                    
                    Add Document
                  
                
              
            
          )}

          {/* Existing docs list */}
          {strategyDocs.length === 0 ? (
            
              
                
                No strategy documents yet
                
                  Add campaign briefs and strategy docs to inform AI-generated content
                
              
            
          ) : (
            strategyDocs.map((doc) => (
              
                
                  
                    
                      
                        {doc.title}
                        {doc.isActive ? (
                          Active
                        ) : (
                          Inactive
                        )}
                      
                      
                        Added {new Date(doc.createdAt).toLocaleDateString()} · {doc.content.split('\n').length} lines
                      
                    
                    
                       setEditingDocId(editingDocId === doc.id ? null : doc.id)}
                      >
                        {editingDocId === doc.id ? "Collapse" : "Edit"}
                      
                       toggleStrategyDoc(doc.id)}
                      >
                        {doc.isActive ? "Deactivate" : "Activate"}
                      
                       removeStrategyDoc(doc.id)}
                      >
                        
                      
                    
                  
                
                
                  {editingDocId === doc.id ? (
                     updateStrategyDoc(doc.id, e.target.value)}
                      className="min-h-[300px] font-mono text-sm"
                    />
                  ) : (
                    
                      {doc.content}
                    
                  )}
                
              
            ))
          )}
        

        {/* ============== ORGANIZATION TAB ============== */}
        
          
            {editing ? (
              <>
                 setEditing(false)}>
                  Cancel
                
                
                  {saving && }
                  Save Changes
                
              
            ) : (
              <>
                {usingDefaults && (
                  
                    {saving && }
                    Save Defaults
                  
                )}
                 setEditing(true)}>Edit
              
            )}
          
          
        

        {/* ============== COMPLIANCE TAB ============== */}
        
          
            {editing ? (
              <>
                 setEditing(false)}>
                  Cancel
                
                
                  {saving && }
                  Save Changes
                
              
            ) : (
               setEditing(true)}>Edit
            )}
          
          
        

        {/* ============== PLATFORM TAB ============== */}
        
          
            {editing ? (
              <>
                 setEditing(false)}>
                  Cancel
                
                
                  {saving && }
                  Save Changes
                
              
            ) : (
               setEditing(true)}>Edit
            )}
          
          
        

        {/* ============== VOICE AGENT PROMPTS TAB ============== */}
        
          
        

        {/* ============== EMAIL AGENT PROMPTS TAB ============== */}
        
          
        

        {/* ============== RESEARCH AGENT PROMPTS TAB ============== */}
        
          
        
      

      
        
        
          These settings are injected into all AI agent prompts to ensure consistent behavior across your organization.
          Updates take effect on the next agent interaction.
        
      
    
  );
}