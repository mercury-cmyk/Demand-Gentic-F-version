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

type TrainingCenter = Record<'generic' | 'general_intelligence' | 'demand_intel' | 'demand_qual' | 'demand_engage', string[]>;

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
- Time to First Meeting: <5 business days from campaign launch`,
    createdAt: new Date().toISOString(),
    isActive: true,
  },
];

const DEFAULTS_RAW = {
  orgIntelligence: DEFAULT_ORG_INTELLIGENCE.join("\n"),
  compliancePolicy: DEFAULT_COMPLIANCE_POLICY.join("\n"),
  platformPolicies: DEFAULT_PLATFORM_POLICIES.join("\n"),
  agentVoiceDefaults: DEFAULT_AGENT_VOICE_DEFAULTS.join("\n"),
};

const AGENT_TYPES = [
  { key: 'general_intelligence' as const, label: 'General Intelligence', icon: Brain, description: 'Universal conversational intelligence, humanity, and emotional awareness' },
  { key: 'generic' as const, label: 'Generic Agent', icon: Cpu, description: 'Default training for all agent types' },
  { key: 'demand_intel' as const, label: 'Demand Intelligence', icon: Search, description: 'Account research and buying signal analysis' },
  { key: 'demand_qual' as const, label: 'Voice Qualification', icon: Settings, description: 'BANT qualification and objection handling' },
  { key: 'demand_engage' as const, label: 'Email Engagement', icon: Mail, description: 'Personalized email sequences and optimization' },
];

// ============== COMPONENT ==============

interface PromptOptimizationViewProps {
  organizationId?: string | null;
}

export function PromptOptimizationView({ organizationId }: PromptOptimizationViewProps) {
  const { toast } = useToast();
  const [data, setData] = useState<PromptOptimizationData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
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
  const [trainingCenter, setTrainingCenter] = useState<TrainingCenter>(DEFAULT_TRAINING_CENTER);
  const [trainingHasChanges, setTrainingHasChanges] = useState(false);
  const [selectedAgentType, setSelectedAgentType] = useState<keyof TrainingCenter>('general_intelligence');

  // Compliance Guardrails State
  const [guardrails, setGuardrails] = useState<ComplianceGuardrails>(DEFAULT_COMPLIANCE_GUARDRAILS);
  const [guardrailsHasChanges, setGuardrailsHasChanges] = useState(false);
  const [newDo, setNewDo] = useState("");
  const [newDont, setNewDont] = useState("");

  // Strategy Docs State
  const [strategyDocs, setStrategyDocs] = useState<StrategyDoc[]>(DEFAULT_STRATEGY_DOCS);
  const [strategyDocsHasChanges, setStrategyDocsHasChanges] = useState(false);
  const [newDocTitle, setNewDocTitle] = useState("");
  const [newDocContent, setNewDocContent] = useState("");
  const [addingDoc, setAddingDoc] = useState(false);
  const [editingDocId, setEditingDocId] = useState<string | null>(null);

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
      <Card>
        <CardContent className="flex items-center justify-center py-8">
          <Loader2 className="h-6 w-6 animate-spin" />
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Alert variant="destructive">
        <AlertCircle className="h-4 w-4" />
        <AlertDescription>{error}</AlertDescription>
      </Alert>
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
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {editing ? (
          <Textarea
            value={formData[formKey]}
            onChange={(e) =>
              setFormData({ ...formData, [formKey]: e.target.value })
            }
            placeholder={`Enter ${title.toLowerCase()} (one item per line)`}
            rows={8}
            className="font-mono text-sm"
          />
        ) : (
          <div className="space-y-2">
            {items.length === 0 ? (
              <p className="text-sm text-muted-foreground italic">No data configured</p>
            ) : (
              items.map((item, idx) => (
                <div key={idx} className="flex items-start gap-2 p-2 bg-muted rounded text-sm">
                  <span className="text-muted-foreground min-w-fit pt-1">•</span>
                  <span>{item}</span>
                </div>
              ))
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );

  return (
    <div className="space-y-6">
      {saveSuccess && (
        <Alert className="border-green-200 bg-green-50">
          <Check className="h-4 w-4 text-green-600" />
          <AlertDescription className="text-green-800">
            Prompt optimization intelligence updated successfully
          </AlertDescription>
        </Alert>
      )}

      {usingDefaults && !saveSuccess && (
        <Alert>
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>
            Showing recommended defaults. Save changes to store them for your organization.
          </AlertDescription>
        </Alert>
      )}

      <Tabs defaultValue="training" className="space-y-4">
        <TabsList className="grid w-full grid-cols-9">
          <TabsTrigger value="training" className="flex items-center gap-1">
            <BookOpen className="h-3 w-3" />
            Training
          </TabsTrigger>
          <TabsTrigger value="guardrails" className="flex items-center gap-1">
            <Shield className="h-3 w-3" />
            Guardrails
          </TabsTrigger>
          <TabsTrigger value="docs" className="flex items-center gap-1">
            <FileText className="h-3 w-3" />
            Docs
          </TabsTrigger>
          <TabsTrigger value="org">Organization</TabsTrigger>
          <TabsTrigger value="compliance">Compliance</TabsTrigger>
          <TabsTrigger value="platform">Platform</TabsTrigger>
          <TabsTrigger value="voice-prompts" className="flex items-center gap-1">
            <Phone className="h-3 w-3" />
            Voice
          </TabsTrigger>
          <TabsTrigger value="email-prompts">Email</TabsTrigger>
          <TabsTrigger value="research-prompts">Research</TabsTrigger>
        </TabsList>

        {/* ============== TRAINING CENTER TAB ============== */}
        <TabsContent value="training" className="space-y-4">
          <Card>
            <CardHeader>
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-3">
                  <BookOpen className="h-6 w-6 text-primary" />
                  <div>
                    <CardTitle>Agent Training Center</CardTitle>
                    <CardDescription>
                      Define training defaults that will be automatically included in agent system prompts based on their type
                    </CardDescription>
                  </div>
                </div>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" onClick={handleResetTraining}>
                    Reset to Defaults
                  </Button>
                  <Button size="sm" onClick={handleSaveTraining} disabled={!trainingHasChanges}>
                    <Save className="h-4 w-4 mr-2" />
                    Save Changes
                  </Button>
                </div>
              </div>
            </CardHeader>
          </Card>

          <Tabs value={selectedAgentType} onValueChange={(v) => setSelectedAgentType(v as keyof TrainingCenter)}>
            <TabsList className="w-full justify-start">
              {AGENT_TYPES.map(agentType => (
                <TabsTrigger key={agentType.key} value={agentType.key} className="flex items-center gap-1">
                  <agentType.icon className="h-3 w-3" />
                  {agentType.label}
                </TabsTrigger>
              ))}
            </TabsList>

            {AGENT_TYPES.map(agentType => (
              <TabsContent key={agentType.key} value={agentType.key}>
                <Card>
                  <CardHeader>
                    <div className="flex items-center gap-2">
                      <agentType.icon className="h-5 w-5 text-primary" />
                      <div>
                        <CardTitle className="text-lg">{agentType.label}</CardTitle>
                        <CardDescription>{agentType.description}</CardDescription>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="space-y-2">
                      <Label>Training snippets (one per line)</Label>
                      <Textarea
                        value={trainingCenter[agentType.key].join('\n')}
                        onChange={(e) => {
                          const lines = e.target.value
                            .split('\n')
                            .map(line => line.trim())
                            .filter(Boolean);
                          updateTrainingItems(agentType.key, lines);
                        }}
                        placeholder="Enter training snippets, best practices, FAQs, or edge case handling..."
                        className="min-h-[200px] font-mono text-sm"
                      />
                      <p className="text-xs text-muted-foreground">
                        These training snippets will be automatically included in the system prompt when generating prompts for {agentType.label} agents.
                      </p>
                    </div>

                    <div className="rounded-lg border bg-muted/40 p-4">
                      <p className="text-sm font-medium mb-2">Current training items ({trainingCenter[agentType.key].length}):</p>
                      {trainingCenter[agentType.key].length === 0 ? (
                        <p className="text-sm text-muted-foreground">No training items defined yet</p>
                      ) : (
                        <div className="space-y-1 max-h-[300px] overflow-y-auto">
                          {trainingCenter[agentType.key].map((item, idx) => (
                            <div key={idx} className="flex items-start gap-2 text-sm">
                              <span className="text-muted-foreground min-w-fit">•</span>
                              <span>{item}</span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </CardContent>
                </Card>
              </TabsContent>
            ))}
          </Tabs>
        </TabsContent>

        {/* ============== COMPLIANCE GUARDRAILS TAB ============== */}
        <TabsContent value="guardrails" className="space-y-4">
          <Card>
            <CardHeader>
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-3">
                  <Shield className="h-6 w-6 text-primary" />
                  <div>
                    <CardTitle>Compliance Guardrails</CardTitle>
                    <CardDescription>
                      Define strict rules for what agents must do and must never do
                    </CardDescription>
                  </div>
                </div>
                <Button size="sm" onClick={handleSaveGuardrails} disabled={!guardrailsHasChanges}>
                  <Save className="h-4 w-4 mr-2" />
                  Save Changes
                </Button>
              </div>
            </CardHeader>
          </Card>

          <div className="grid gap-6 md:grid-cols-2">
            {/* Do's Card */}
            <Card className="border-green-200 dark:border-green-900">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-green-700 dark:text-green-400">
                  <CheckCircle2 className="h-5 w-5" />
                  Do's (Encouraged)
                </CardTitle>
                <CardDescription>
                  Behaviors and actions the AI should prioritize.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex gap-2">
                  <Input
                    placeholder="Add a new rule..."
                    value={newDo}
                    onChange={(e) => setNewDo(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && addDo()}
                  />
                  <Button size="icon" onClick={addDo} variant="outline" className="shrink-0">
                    <Plus className="h-4 w-4" />
                  </Button>
                </div>
                <div className="space-y-2 max-h-[400px] overflow-y-auto">
                  {guardrails.dos.map((rule, i) => (
                    <div key={i} className="flex items-center justify-between p-3 bg-green-50 dark:bg-green-900/20 rounded-md border border-green-100 dark:border-green-900">
                      <span className="text-sm">{rule}</span>
                      <Button variant="ghost" size="icon" className="h-6 w-6 shrink-0" onClick={() => removeDo(i)}>
                        <X className="h-3 w-3" />
                      </Button>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            {/* Don'ts Card */}
            <Card className="border-red-200 dark:border-red-900">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-red-700 dark:text-red-400">
                  <AlertCircle className="h-5 w-5" />
                  Don'ts (Restricted)
                </CardTitle>
                <CardDescription>
                  Strict prohibitions and negative constraints.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex gap-2">
                  <Input
                    placeholder="Add a new restriction..."
                    value={newDont}
                    onChange={(e) => setNewDont(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && addDont()}
                  />
                  <Button size="icon" onClick={addDont} variant="outline" className="shrink-0">
                    <Plus className="h-4 w-4" />
                  </Button>
                </div>
                <div className="space-y-2 max-h-[400px] overflow-y-auto">
                  {guardrails.donts.map((rule, i) => (
                    <div key={i} className="flex items-center justify-between p-3 bg-red-50 dark:bg-red-900/20 rounded-md border border-red-100 dark:border-red-900">
                      <span className="text-sm">{rule}</span>
                      <Button variant="ghost" size="icon" className="h-6 w-6 shrink-0" onClick={() => removeDont(i)}>
                        <X className="h-3 w-3" />
                      </Button>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* ============== STRATEGY DOCS TAB ============== */}
        <TabsContent value="docs" className="space-y-4">
          <Card>
            <CardHeader>
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-3">
                  <FileText className="h-6 w-6 text-primary" />
                  <div>
                    <CardTitle>Strategy Docs</CardTitle>
                    <CardDescription>
                      Campaign briefs, strategy documents, and GTM playbooks that inform all AI agent behavior.
                      Active docs are injected into Organization Intelligence context.
                    </CardDescription>
                  </div>
                </div>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" onClick={() => setAddingDoc(true)} disabled={addingDoc}>
                    <Plus className="h-4 w-4 mr-2" />
                    Add Document
                  </Button>
                  <Button size="sm" onClick={handleSaveStrategyDocs} disabled={!strategyDocsHasChanges}>
                    <Save className="h-4 w-4 mr-2" />
                    Save & Sync
                  </Button>
                </div>
              </div>
            </CardHeader>
          </Card>

          {/* Add new doc form */}
          {addingDoc && (
            <Card className="border-blue-200">
              <CardHeader>
                <CardTitle className="text-lg">Add New Strategy Document</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label>Document Title</Label>
                  <Input
                    placeholder="e.g., Q1 2026 Campaign Strategy Brief"
                    value={newDocTitle}
                    onChange={(e) => setNewDocTitle(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Document Content</Label>
                  <Textarea
                    placeholder="Paste your campaign brief, strategy document, or GTM playbook content here..."
                    value={newDocContent}
                    onChange={(e) => setNewDocContent(e.target.value)}
                    className="min-h-[200px] font-mono text-sm"
                  />
                </div>
                <div className="flex gap-2 justify-end">
                  <Button variant="outline" onClick={() => { setAddingDoc(false); setNewDocTitle(""); setNewDocContent(""); }}>
                    Cancel
                  </Button>
                  <Button onClick={addStrategyDoc} disabled={!newDocTitle.trim() || !newDocContent.trim()}>
                    <Plus className="h-4 w-4 mr-2" />
                    Add Document
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Existing docs list */}
          {strategyDocs.length === 0 ? (
            <Card>
              <CardContent className="py-12 text-center">
                <FileText className="h-12 w-12 mx-auto text-muted-foreground/30 mb-3" />
                <p className="text-lg font-medium text-muted-foreground">No strategy documents yet</p>
                <p className="text-sm text-muted-foreground mt-1">
                  Add campaign briefs and strategy docs to inform AI-generated content
                </p>
              </CardContent>
            </Card>
          ) : (
            strategyDocs.map((doc) => (
              <Card key={doc.id} className={doc.isActive ? "border-green-200" : "border-muted opacity-60"}>
                <CardHeader>
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <CardTitle className="text-lg flex items-center gap-2">
                        {doc.title}
                        {doc.isActive ? (
                          <Badge className="bg-green-100 text-green-700 text-[10px]">Active</Badge>
                        ) : (
                          <Badge variant="secondary" className="text-[10px]">Inactive</Badge>
                        )}
                      </CardTitle>
                      <CardDescription>
                        Added {new Date(doc.createdAt).toLocaleDateString()} · {doc.content.split('\n').length} lines
                      </CardDescription>
                    </div>
                    <div className="flex gap-1">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setEditingDocId(editingDocId === doc.id ? null : doc.id)}
                      >
                        {editingDocId === doc.id ? "Collapse" : "Edit"}
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => toggleStrategyDoc(doc.id)}
                      >
                        {doc.isActive ? "Deactivate" : "Activate"}
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-red-500 hover:text-red-700"
                        onClick={() => removeStrategyDoc(doc.id)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  {editingDocId === doc.id ? (
                    <Textarea
                      value={doc.content}
                      onChange={(e) => updateStrategyDoc(doc.id, e.target.value)}
                      className="min-h-[300px] font-mono text-sm"
                    />
                  ) : (
                    <div className="bg-muted rounded-lg p-4 max-h-[300px] overflow-y-auto">
                      <pre className="text-sm whitespace-pre-wrap font-mono">{doc.content}</pre>
                    </div>
                  )}
                </CardContent>
              </Card>
            ))
          )}
        </TabsContent>

        {/* ============== ORGANIZATION TAB ============== */}
        <TabsContent value="org">
          <div className="flex justify-end gap-2 mb-4">
            {editing ? (
              <>
                <Button variant="outline" onClick={() => setEditing(false)}>
                  Cancel
                </Button>
                <Button onClick={handleSave} disabled={saving}>
                  {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Save Changes
                </Button>
              </>
            ) : (
              <>
                {usingDefaults && (
                  <Button variant="secondary" onClick={handleSave} disabled={saving}>
                    {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    Save Defaults
                  </Button>
                )}
                <Button onClick={() => setEditing(true)}>Edit</Button>
              </>
            )}
          </div>
          <PolicySection
            title="Organization Intelligence"
            description="Brand identity, positioning, services, ICP, personas, and approved claims"
            items={data.orgIntelligence.parsed}
            formKey="orgIntelligence"
          />
        </TabsContent>

        {/* ============== COMPLIANCE TAB ============== */}
        <TabsContent value="compliance">
          <div className="flex justify-end gap-2 mb-4">
            {editing ? (
              <>
                <Button variant="outline" onClick={() => setEditing(false)}>
                  Cancel
                </Button>
                <Button onClick={handleSave} disabled={saving}>
                  {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Save Changes
                </Button>
              </>
            ) : (
              <Button onClick={() => setEditing(true)}>Edit</Button>
            )}
          </div>
          <PolicySection
            title="Compliance Policy"
            description="Legal and ethical guidelines for AI agent behavior"
            items={data.compliancePolicy.parsed}
            formKey="compliancePolicy"
          />
        </TabsContent>

        {/* ============== PLATFORM TAB ============== */}
        <TabsContent value="platform">
          <div className="flex justify-end gap-2 mb-4">
            {editing ? (
              <>
                <Button variant="outline" onClick={() => setEditing(false)}>
                  Cancel
                </Button>
                <Button onClick={handleSave} disabled={saving}>
                  {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Save Changes
                </Button>
              </>
            ) : (
              <Button onClick={() => setEditing(true)}>Edit</Button>
            )}
          </div>
          <PolicySection
            title="Platform Policies"
            description="System constraints and tool permissions"
            items={data.platformPolicies.parsed}
            formKey="platformPolicies"
          />
        </TabsContent>

        {/* ============== VOICE AGENT PROMPTS TAB ============== */}
        <TabsContent value="voice-prompts">
          <AgentPromptViewer agentType="voice" />
        </TabsContent>

        {/* ============== EMAIL AGENT PROMPTS TAB ============== */}
        <TabsContent value="email-prompts">
          <AgentPromptViewer agentType="email" />
        </TabsContent>

        {/* ============== RESEARCH AGENT PROMPTS TAB ============== */}
        <TabsContent value="research-prompts">
          <AgentPromptViewer agentType="research" />
        </TabsContent>
      </Tabs>

      <Alert>
        <AlertCircle className="h-4 w-4" />
        <AlertDescription>
          These settings are injected into all AI agent prompts to ensure consistent behavior across your organization.
          Updates take effect on the next agent interaction.
        </AlertDescription>
      </Alert>
    </div>
  );
}
