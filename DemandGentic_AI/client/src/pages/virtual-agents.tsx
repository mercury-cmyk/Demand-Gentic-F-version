import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLocation } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { useToast } from "@/hooks/use-toast";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Bot,
  Plus,
  MoreHorizontal,
  Pencil,
  Trash2,
  Power,
  PowerOff,
  Loader2,
  Megaphone,
  Settings2,
  PhoneCall,
  MessageSquare,
  Send,
  Sparkles,
  PlayCircle,
  RotateCcw,
  Mic,
  MicOff,
  Eye,
  Building2,
  GraduationCap,
  Target,
  FileText,
  ChevronDown,
  ChevronUp,
  ChevronRight,
  Copy,
  Check,
  Phone,
  PhoneOff,
  CheckCircle,
  X,
  RefreshCw,
  Layers,
} from "lucide-react";
import { format } from "date-fns";
import { SkillBasedAgentCreator } from "@/components/virtual-agents/skill-based-agent-creator";
import { OrganizationIntelligenceSetup, type OrgIntelligenceConfig } from "@/components/agents/organization-intelligence-setup";
import { KnowledgeInspector } from "@/components/virtual-agents/knowledge-inspector";
import { PromptPreviewPanel } from "@/components/virtual-agents/prompt-preview-panel";

interface VirtualAgent {
  id: string;
  name: string;
  description: string | null;
  provider: string;
  externalAgentId: string | null;
  voice: string | null;
  systemPrompt: string | null;
  firstMessage: string | null;
  settings: Record | null;
  isActive: boolean;
  demandAgentType: 'demand_intel' | 'demand_qual' | 'demand_engage' | 'demand_architect' | null;
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
  // Foundation Agent fields (Foundation + Campaign Layer Architecture)
  isFoundationAgent: boolean;
  foundationCapabilities: string[] | null;
}

interface VirtualAgentFormData {
  name: string;
  description: string;
  provider: string;
  voice: string;
  externalAgentId?: string | null;
  systemPrompt?: string;
  firstMessage?: string;
  // Foundational training applied automatically - no per-agent configuration needed
  // Settings are simplified - campaign context drives behavior
  settings: VirtualAgentSettings;
  isActive: boolean;
  demandAgentType?: VirtualAgent['demandAgentType'];
  isFoundationAgent?: boolean;
  foundationCapabilities?: string[];
}

// Preview Studio Types - Agent Preview Lab specification
type ConversationStage = 'opening' | 'discovery' | 'qualification' | 'objection-handling' | 'closing' | 'exit';
type PreviewMode = 'training' | 'realism' | 'stress-test';
type PreviewScenario = 'cold-call' | 'follow-up' | 'objection' | 'gatekeeper';
type TurnState = 'agent' | 'user' | 'thinking';
type UserIntent = 'interested' | 'neutral' | 'busy' | 'objecting' | 'confused' | 'disengaged';
type IssueType = 'tone' | 'compliance' | 'clarity' | 'question' | 'objection' | 'pacing';
type IssueSeverity = 'low' | 'medium' | 'high';
type TurnTag = 'good-move' | 'missed-opportunity' | 'risk' | 'unclear';

type PreviewMessage = {
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
  stage?: ConversationStage;
  turnDuration?: number;
  intent?: UserIntent;
  tag?: TurnTag;
  feedback?: string;
};

// Session Memory - Structured conversation tracking (NOT chain-of-thought)
type SessionMemory = {
  userGoal: string;
  prospectSignals: string[];
  agentClaims: string[];
  questionsAsked: string[];
  objectionsDetected: { objection: string; handling: string; quality: 'good' | 'weak' | 'missed' }[];
  commitments: string[];
  complianceSignals: { type: 'pressure' | 'consent' | 'dnc' | 'assumption'; message: string }[];
  unresolvedItems: string[];
};

// Operational Reasoning Panel (NOT private chain-of-thought)
type ReasoningPanel = {
  understanding: {
    currentObjective: string;
    prospectCareAbout: string;
    confidence: 'low' | 'medium' | 'high';
  };
  strategy: {
    chosenApproach: string;
    nextBestMove: string;
  };
  riskCompliance: {
    flags: ('too-pushy' | 'assumed-too-much' | 'needs-consent' | 'length-risk')[];
    toneCheck: 'executive-grade' | 'borderline' | 'needs-revision';
  };
  evidence: string[];
};

// Evaluation Report Scorecard
type EvaluationScorecard = {
  clarity: number; // 0-20
  authority: number; // 0-20
  brevity: number; // 0-15
  questionQuality: number; // 0-15
  objectionHandling: number; // 0-15
  compliance: number; // 0-15
  humanity: number; // 0-20 - Gratitude, warmth, professional etiquette
  intelligence: number; // 0-15 - Conversational intelligence, acknowledgement, responsiveness
  total: number; // 0-135 (expanded to include intelligence)
};

// Timeline Highlight for report
type TimelineHighlight = {
  turn: number;
  role: 'user' | 'assistant';
  summary: string;
  tag: TurnTag;
};

// Evaluation Report
type EvaluationReport = {
  executiveSummary: {
    whatWentWell: string[];
    whatHurtConversation: string[];
    verdict: 'approve' | 'needs-edits' | 'reject';
  };
  scorecard: EvaluationScorecard;
  timelineHighlights: TimelineHighlight[];
  objectionReview: {
    detected: string[];
    responseQuality: string;
    betterAlternatives: string[];
  };
  promptImprovements: {
    originalLine: string;
    replacement: string;
    reason: string;
  }[];
  recommendedPrompt: string;
  learningNotes: string[];
  // Voicemail Discipline - CRITICAL
  voicemailDiscipline: {
    passed: boolean;
    violations: string[];
  };
  // Humanity & Professionalism Check
  humanityReport: {
    score: number;
    maxScore: number;
    passed: boolean;
    issues: string[];
  };
  // General Intelligence Check
  intelligenceReport: {
    score: number;
    maxScore: number;
    passed: boolean;
    issues: string[];
  };
};

// Learning Entry - Saved coaching notes
type LearningEntry = {
  id: string;
  agentId: string;
  sessionId: string;
  issueType: IssueType;
  feedback: string;
  recommendedFix: string;
  severity: IssueSeverity;
  status: 'proposed' | 'accepted' | 'applied';
  createdAt: Date;
};

type ConversationAnalysis = {
  stage: ConversationStage;
  turnGoal: string;
  confidence: number;
  userIntent: UserIntent;
  issues: string[];
  suggestions: string[];
};

// Side-by-Side Simulation Types
type SimulationPanelState = {
  panelId: 0 | 1 | 2;
  sessionId: string | null;
  messages: PreviewMessage[];
  turnState: TurnState;
  isPending: boolean;
  sessionMemory: SessionMemory;
  reasoningPanel: ReasoningPanel;
  conversationAnalysis: ConversationAnalysis;
  rightPartyStatus: 'unknown' | 'right-party' | 'gatekeeper' | 'wrong-number';
  evaluationReport: EvaluationReport | null;
  error: string | null;
};

type ComparisonReport = {
  panels: Array;
  comparison: {
    bestPerformer: number;
    worstPerformer: number;
    scoreDelta: number;
    commonIssues: string[];
  };
  recommendation: {
    selectedPrompt: number;
    reasoning: string;
  };
};

// Helper to create empty panel state
const createEmptyPanelState = (panelId: 0 | 1 | 2): SimulationPanelState => ({
  panelId,
  sessionId: null,
  messages: [],
  turnState: 'agent',
  isPending: false,
  sessionMemory: {
    userGoal: '',
    prospectSignals: [],
    agentClaims: [],
    questionsAsked: [],
    objectionsDetected: [],
    commitments: [],
    complianceSignals: [],
    unresolvedItems: [],
  },
  reasoningPanel: {
    understanding: {
      currentObjective: 'Confirm prospect identity and establish rapport',
      prospectCareAbout: 'Unknown - needs discovery',
      confidence: 'medium',
    },
    strategy: {
      chosenApproach: 'Professional, consultative opening',
      nextBestMove: 'Ask an open-ended question about their current challenges',
    },
    riskCompliance: {
      flags: [],
      toneCheck: 'executive-grade',
    },
    evidence: [],
  },
  conversationAnalysis: {
    stage: 'opening',
    turnGoal: 'Greet prospect and confirm identity',
    confidence: 100,
    userIntent: 'neutral',
    issues: [],
    suggestions: [],
  },
  rightPartyStatus: 'unknown',
  evaluationReport: null,
  error: null,
});

// Panel color themes for visual distinction
const PANEL_COLORS = {
  0: { bg: 'bg-blue-50 dark:bg-blue-950/20', border: 'border-blue-200 dark:border-blue-800', label: 'text-blue-600 dark:text-blue-400' },
  1: { bg: 'bg-green-50 dark:bg-green-950/20', border: 'border-green-200 dark:border-green-800', label: 'text-green-600 dark:text-green-400' },
  2: { bg: 'bg-purple-50 dark:bg-purple-950/20', border: 'border-purple-200 dark:border-purple-800', label: 'text-purple-600 dark:text-purple-400' },
} as const;

type OrgPromptData = {
  orgIntelligence: string[];
  compliancePolicy: string[];
  platformPolicies: string[];
  agentVoiceDefaults: string[];
};

type TrainingCenter = Record;

// OpenAI voice options
const OPENAI_VOICES = [
  { value: 'alloy', label: 'Alloy - Neutral & balanced', provider: 'openai' },
  { value: 'echo', label: 'Echo - Warm & engaging', provider: 'openai' },
  { value: 'fable', label: 'Fable - Expressive & dynamic', provider: 'openai' },
  { value: 'onyx', label: 'Onyx - Deep & authoritative', provider: 'openai' },
  { value: 'nova', label: 'Nova - Friendly & upbeat', provider: 'openai' },
  { value: 'shimmer', label: 'Shimmer - Clear & professional', provider: 'openai' },
];

// Google voice options (Vertex AI) - Official voices from Google's documentation
const GOOGLE_VOICES = [
  // Primary B2B Sales voices
  { value: 'Kore', label: 'Kore - Firm & Professional (Default)', provider: 'google' },
  { value: 'Fenrir', label: 'Fenrir - Excitable & Persuasive', provider: 'google' },
  { value: 'Charon', label: 'Charon - Informative & Authoritative', provider: 'google' },
  { value: 'Aoede', label: 'Aoede - Breezy & Friendly', provider: 'google' },
  { value: 'Puck', label: 'Puck - Upbeat & Lively', provider: 'google' },
  // Professional voices
  { value: 'Zephyr', label: 'Zephyr - Bright & Clear', provider: 'google' },
  { value: 'Leda', label: 'Leda - Youthful & Modern', provider: 'google' },
  { value: 'Orus', label: 'Orus - Firm & Reliable', provider: 'google' },
  { value: 'Sulafat', label: 'Sulafat - Warm & Caring', provider: 'google' },
  { value: 'Gacrux', label: 'Gacrux - Mature & Credible', provider: 'google' },
  { value: 'Schedar', label: 'Schedar - Even & Composed', provider: 'google' },
  { value: 'Achird', label: 'Achird - Friendly & Welcoming', provider: 'google' },
  // Specialized voices
  { value: 'Sadaltager', label: 'Sadaltager - Knowledgeable & Expert', provider: 'google' },
  { value: 'Pulcherrima', label: 'Pulcherrima - Forward & Assertive', provider: 'google' },

  { value: 'Iapetus', label: 'Iapetus - Clear & Precise', provider: 'google' },
  { value: 'Erinome', label: 'Erinome - Professional Presenter', provider: 'google' },
  // Dynamic voices
  { value: 'Sadachbia', label: 'Sadachbia - Lively & Dynamic', provider: 'google' },
  { value: 'Laomedeia', label: 'Laomedeia - Upbeat & Positive', provider: 'google' },

];

const PROVIDER_OPTIONS = [
  { value: 'google', label: 'Live Voice (Recommended)' },
  { value: 'openai', label: 'OpenAI Realtime' },
];

const PREVIEW_TOKEN_PATTERN = /\{\{\s*([^}]+?)\s*\}\}/g;
const PREVIEW_TOKEN_CONTROLS = new Set(["if", "elseif", "else", "endif"]);
const PREVIEW_TOKEN_ALIASES: Record = {
  contactfullname: "contact.full_name",
  contactfirstname: "contact.first_name",
  jobtitle: "contact.job_title",
  companyname: "account.name",
  agentname: "agent.name",
  orgname: "org.name",
  callerid: "system.caller_id",
  callednumber: "system.called_number",
  time_utc: "system.time_utc",
  timeutc: "system.time_utc",
  "system.time": "system.time_utc",
};
const PREVIEW_TOKEN_DEFAULTS: Record = {
  "agent.name": "Alex Morgan",
  "agent.full_name": "Alex Morgan",
  "agent.name_full": "Alex Morgan",
  "agentname": "Alex Morgan",
  "agent_name": "Alex Morgan",
  "agentfullname": "Alex Morgan",
  "agent_full_name": "Alex Morgan",
  "agentrole": "Business Development Rep",
  "agent_role": "Business Development Rep",
  "agentcompany": "Ayon Design & Build Corp",
  "agent_company": "Ayon Design & Build Corp",
  "org.name": "Ayon Design & Build Corp",
  "orgname": "Ayon Design & Build Corp",
  "org_name": "Ayon Design & Build Corp",
  "account.name": "Northwind Logistics",
  "accountname": "Northwind Logistics",
  "account_name": "Northwind Logistics",
  "company": "Northwind Logistics",
  "companyname": "Northwind Logistics",
  "company_name": "Northwind Logistics",
  "contact.full_name": "Jordan Lee",
  "contact.fullname": "Jordan Lee",
  "contact.first_name": "Jordan",
  "contact.firstname": "Jordan",
  "contact.last_name": "Lee",
  "contact.lastname": "Lee",
  "contact.job_title": "VP of Operations",
  "contact.jobtitle": "VP of Operations",
  "contact.email": "jordan.lee@northwindlogistics.com",
  "firstname": "Jordan",
  "first_name": "Jordan",
  "lastname": "Lee",
  "last_name": "Lee",
  "fullname": "Jordan Lee",
  "full_name": "Jordan Lee",
  "title": "VP of Operations",
  "job_title": "VP of Operations",
  "jobtitle": "VP of Operations",
  "email": "jordan.lee@northwindlogistics.com",
  "system.caller_id": "+14155550199",
  "system.called_number": "+14155559876",
  "caller_id": "+14155550199",
  "called_number": "+14155559876",
  "phonenumber": "+14155559876",
  "phone_number": "+14155559876",
};

const normalizePreviewToken = (token: string) => token.trim().toLowerCase();

const resolvePreviewToken = (token: string) => {
  const normalized = normalizePreviewToken(token);
  return PREVIEW_TOKEN_ALIASES[normalized] ?? normalized;
};

const getPreviewTokenDefault = (token: string): string | undefined => {
  const normalized = normalizePreviewToken(token);
  if (!normalized) return undefined;
  const canonical = resolvePreviewToken(token);
  if (
    canonical === "system.time_utc"
    || canonical === "system.time"
  ) {
    return new Date().toISOString();
  }
  return PREVIEW_TOKEN_DEFAULTS[canonical] ?? PREVIEW_TOKEN_DEFAULTS[normalized];
};

const extractPreviewTokens = (inputs: Array): string[] => {
  const tokens = new Set();

  inputs.forEach((input) => {
    if (!input) return;
    const regex = new RegExp(PREVIEW_TOKEN_PATTERN);
    let match = regex.exec(input);
    while (match) {
      const raw = match[1].trim();
      const normalized = raw.toLowerCase();
      if (raw && !PREVIEW_TOKEN_CONTROLS.has(normalized.split(/\s+/)[0])) {
        tokens.add(raw);
      }
      match = regex.exec(input);
    }
  });

  return Array.from(tokens).sort((a, b) => a.localeCompare(b));
};

const escapeRegExp = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const getFirstPreviewValue = (values: Record, keys: string[]) => {
  for (const key of keys) {
    const value = values[key];
    if (value && value.trim()) {
      return value.trim();
    }
  }
  return "";
};

const buildPreviewValueLookup = (values: Record) => {
  const lookup: Record = {};
  Object.entries(values).forEach(([key, value]) => {
    if (!value || !value.trim()) return;
    const normalized = normalizePreviewToken(key);
    const canonical = resolvePreviewToken(key);
    lookup[normalized] = value;
    lookup[canonical] = value;
  });
  return lookup;
};

const applyPreviewValues = (input: string, values: Record) => {
  const derivedValues = buildPreviewValueLookup(values);
  const firstName = getFirstPreviewValue(derivedValues, [
    "contact.first_name",
    "contact.firstname",
    "first_name",
    "firstname",
  ]);
  const lastName = getFirstPreviewValue(derivedValues, [
    "contact.last_name",
    "contact.lastname",
    "last_name",
    "lastname",
  ]);
  const existingFullName = getFirstPreviewValue(derivedValues, [
    "contact.full_name",
    "contact.fullname",
    "full_name",
    "fullname",
  ]);
  const computedFullName = existingFullName || [firstName, lastName].filter(Boolean).join(" ").trim();
  if (computedFullName) {
    [
      "contact.full_name",
      "contact.fullname",
      "full_name",
      "fullname",
    ].forEach((key) => {
      if (!derivedValues[key]) {
        derivedValues[key] = computedFullName;
      }
    });
  }

  const companyName = getFirstPreviewValue(derivedValues, [
    "account.name",
    "accountname",
    "account_name",
    "company",
    "companyname",
    "company_name",
  ]);
  if (companyName) {
    ["account.name", "company", "companyname", "company_name"].forEach((key) => {
      if (!derivedValues[key]) {
        derivedValues[key] = companyName;
      }
    });
  }

  const orgName = getFirstPreviewValue(derivedValues, [
    "org.name",
    "orgname",
    "org_name",
    "agentcompany",
    "agent_company",
  ]);
  if (orgName) {
    ["org.name", "orgname", "org_name", "agentcompany", "agent_company"].forEach((key) => {
      if (!derivedValues[key]) {
        derivedValues[key] = orgName;
      }
    });
  }

  const agentName = getFirstPreviewValue(derivedValues, [
    "agent.name",
    "agentname",
    "agent_name",
    "agentfullname",
    "agent_full_name",
  ]);
  if (agentName) {
    ["agent.name", "agentname", "agent_name", "agentfullname", "agent_full_name"].forEach((key) => {
      if (!derivedValues[key]) {
        derivedValues[key] = agentName;
      }
    });
  }

  Object.entries(PREVIEW_TOKEN_ALIASES).forEach(([alias, canonical]) => {
    if (!derivedValues[alias] && derivedValues[canonical]) {
      derivedValues[alias] = derivedValues[canonical];
    }
  });

  let result = input;
  for (const [token, value] of Object.entries(derivedValues)) {
    const regex = new RegExp(`\\{\\{\\s*${escapeRegExp(token)}\\s*\\}\\}`, "gi");
    result = result.replace(regex, value);
  }
  return result;
};

const normalizePreviewTranscript = (input: string) =>
  input
    .toLowerCase()
    .replace(/[^a-z0-9]+/gi, " ")
    .replace(/\s+/g, " ")
    .trim();

const buildPreviewInputId = (token: string) =>
  `preview-${token.replace(/[^a-zA-Z0-9_-]/g, "-").toLowerCase()}`;

type SystemToolsSettings = {
  endConversation: boolean;
  detectLanguage: boolean;
  skipTurn: boolean;
  transferToAgent: boolean;
  transferToNumber: boolean;
  playKeypadTouchTone: boolean;
  voicemailDetection: boolean;
  voicemailPolicy?: {
    detectionMode: 'always' | 'intelligent' | 'never';
    action: 'hang_up' | 'leave_message' | 'continue';
  };
};

type AdvancedSettings = {
  asr: {
    textOnly: boolean;
    model: 'default' | 'scribe_realtime';
    inputFormat: 'pcm_16000';
    keywords: string;
  };
  conversational: {
    eagerness: 'low' | 'normal' | 'high';
    takeTurnAfterSilenceSeconds: number;
    endConversationAfterSilenceSeconds: number;
    maxConversationDurationSeconds: number;
  };
  realtime: {
    turnDetection: {
      mode: 'normal' | 'semantic' | 'disabled';
      threshold: number;
      prefixPaddingMs: number;
      silenceDurationMs: number;
      idleTimeoutMs: number;
    };
    functions: string[];
    mcpServers: string[];
    model: string;
    userTranscriptModel: string;
    noiseReduction: 'enabled' | 'disabled';
    modelConfig: string;
    maxTokens: number;
    toolChoice: 'auto' | 'required' | 'none';
  };
  softTimeout: {
    responseTimeoutSeconds: number;
  };
  clientEvents: {
    audio: boolean;
    interruption: boolean;
    userTranscript: boolean;
    agentResponse: boolean;
    agentResponseCorrection: boolean;
  };
  privacy: {
    noPiiLogging: boolean;
    retentionDays: number;
  };
};

// Simplified type for UI - only shows essential settings
type SimplifiedAdvancedSettings = {
  conversational: {
    eagerness: 'low' | 'normal' | 'high';
    takeTurnAfterSilenceSeconds: number;
    endConversationAfterSilenceSeconds: number;
    maxConversationDurationSeconds: number;
  };
};

type VirtualAgentSettings = {
  systemTools: SystemToolsSettings;
  advanced: AdvancedSettings;
  trainingData?: string[];
};

const DEFAULT_SYSTEM_TOOLS: SystemToolsSettings = {
  endConversation: true,
  detectLanguage: false,
  skipTurn: false,
  transferToAgent: true,
  transferToNumber: true,
  playKeypadTouchTone: false,
  voicemailDetection: true,
  voicemailPolicy: {
    detectionMode: 'intelligent',
    action: 'hang_up',
  },
};

const DEFAULT_ADVANCED_SETTINGS: AdvancedSettings = {
  asr: {
    textOnly: false,
    model: 'default',
    inputFormat: 'pcm_16000',
    keywords: '',
  },
    conversational: {
      eagerness: 'normal',
      takeTurnAfterSilenceSeconds: 4,
      endConversationAfterSilenceSeconds: 60,
      maxConversationDurationSeconds: 200,
    },
  realtime: {
    turnDetection: {
      mode: 'normal',
      threshold: 0.5,
      prefixPaddingMs: 300,
      silenceDurationMs: 500,
      idleTimeoutMs: 0,
    },
    functions: [
      'detect_voicemail_and_hangup',
      'enforce_max_call_duration',
      'navigate_and_dial',
      'connect_to_operator',
    ],
    mcpServers: [],
    model: 'gpt-realtime',
    userTranscriptModel: 'whisper-1',
    noiseReduction: 'enabled',
    modelConfig: '',
    maxTokens: 4096,
    toolChoice: 'auto',
  },
  softTimeout: {
    responseTimeoutSeconds: -1,
  },
  clientEvents: {
    audio: true,
    interruption: true,
    userTranscript: true,
    agentResponse: true,
    agentResponseCorrection: true,
  },
  privacy: {
    noPiiLogging: false,
    retentionDays: -1,
  },
};

const SYSTEM_TOOL_OPTIONS: Array;
  label: string;
  description: string;
}> = [
  { key: 'endConversation', label: 'End conversation', description: 'Allow the agent to end the call when appropriate.' },
  { key: 'detectLanguage', label: 'Detect language', description: "Identify the caller's language for better routing." },
  { key: 'skipTurn', label: 'Skip turn', description: 'Let the agent skip a response and wait.' },
  { key: 'transferToAgent', label: 'Transfer to agent', description: 'Hand off to a live agent when requested.' },
  { key: 'transferToNumber', label: 'Transfer to number', description: 'Transfer the call to a specific phone number.' },
  { key: 'playKeypadTouchTone', label: 'Play keypad touch tone', description: 'Send DTMF tones for IVR navigation.' },
];

const PREVIEW_LANGUAGE_OPTIONS = [
  { value: 'en-US', label: 'English (US)' },
  { value: 'en-GB', label: 'English (UK)' },
  { value: 'ar-SA', label: 'Arabic (Saudi Arabia)' },
  { value: 'fr-FR', label: 'French (France)' },
  { value: 'es-ES', label: 'Spanish (Spain)' },
  { value: 'de-DE', label: 'German (Germany)' },
];

const AGENT_TYPE_OPTIONS = [
  { value: 'demand_qual', label: 'Voice Agent', description: 'Voice calls - BANT qualification and objection handling' },
  { value: 'demand_engage', label: 'Email Agent', description: 'Personalized email sequences and optimization' },
  { value: 'demand_intel', label: 'Research & Reason Agent', description: 'Account research, buying signals, and intelligence analysis' },
  { value: 'demand_architect', label: 'The Architect', description: 'AI & coding solutions expert - system design, code generation, and technical architecture' },
];

const DEFAULT_TRAINING_CENTER: TrainingCenter = {
  // 🧠 GENERAL AGENT TRAINING LAYER (GLOBAL / CONTINUOUS)
  // Purpose: Increase agent intelligence, humanity, and conversational quality
  // Scope: Applies to all agents, all scenarios - this is how an agent should behave as a professional human
  general_intelligence: [
    // 1️⃣ GENERAL CONVERSATIONAL INTELLIGENCE (UNIVERSAL)
    'CORE PRINCIPLE: Always understand what just happened, acknowledge it, and respond in a way that feels human and attentive',
    'UNIVERSAL RULE: Never ignore user input, never jump ahead without acknowledging, never stack multiple intents in one response, never sound rushed or mechanical',
    
    // 2️⃣ HUMANITY & EMOTIONAL AWARENESS (GENERAL KNOWLEDGE)
    'EMOTIONAL LITERACY: Recognize permission, hesitation, confusion, interruption, cooperation, and resistance in every interaction',
    'When someone gives time: Express gratitude immediately',
    'When someone hesitates: Acknowledge and slow down your pace',
    'When you interrupt: Apologize briefly and respectfully',
    'When conversation ends: Close warmly regardless of outcome',
    
    // 3️⃣ GRATITUDE & POLITENESS (GLOBAL HABIT)
    'GRATITUDE RULE: Whenever another human helps, listens, responds, or cooperates - explicitly acknowledge it',
    'Approved gratitude phrases: "Thank you — I appreciate that", "Thanks for taking a moment", "I appreciate you letting me know", "Thank you for your time"',
    'This applies to: Voice agents, Chat agents, Email agents, Internal assistants',
    
    // 4️⃣ APOLOGY INTELLIGENCE (GENERAL ETIQUETTE)
    'APOLOGY AWARENESS: Understand when an apology is socially appropriate, even if no error occurred',
    'When to apologize: Interrupting, asking for time, clarifying after confusion, repeating a question, ending a conversation unexpectedly',
    'Approved neutral apologies: "Sorry about that", "I apologize for the interruption", "Apologies — let me clarify"',
    'Apology tone: No guilt, no weakness - just professionalism',
    
    // 5️⃣ SILENCE & RESPONSIVENESS AWARENESS (GENERAL)
    'RESPONSIVENESS RULE: An agent should never appear absent - if you need time to think, acknowledge first, then respond',
    'Universal acknowledgement fillers: "Understood", "I see", "Got it", "That makes sense"',
    'This applies to: Voice latency, chat typing delays, tool calls, long reasoning steps',
    
    // 6️⃣ ACKNOWLEDGEMENT ROTATION (GENERAL SKILL)
    'NATURALNESS RULE: Avoid repetition and feel natural - track last 1-2 acknowledgement phrases and avoid repeating consecutively',
    'Rotate between: Neutral ("Got it", "Understood"), Gratitude ("Thank you", "I appreciate that"), Empathy ("I understand", "That makes sense")',
    'This improves perceived intelligence across all agent types',
    
    // 7️⃣ CONVERSATION MEMORY (GENERAL AWARENESS)
    'SOCIAL CONTINUITY: Maintain light internal understanding of what the human cares about, what has been said, what should not be repeated, and where the conversation stands',
    'This is not task memory - it is social continuity and awareness',
    
    // 8️⃣ RESPECTFUL ENDINGS (UNIVERSAL)
    'CLOSING RULE: Every interaction must end politely, clearly, and without abrupt cutoff',
    'Universal closings: "Thank you for your time", "I appreciate the conversation", "Let me know if you need anything else"',
    'Apply even when: The answer is "no", the task fails, the agent exits early',
    
    // 9️⃣ GENERAL LEARNING LOOP (GLOBAL)
    'LEARNING CATEGORIES: Humanity, Tone, Responsiveness, Politeness, Conversational flow',
    'Any feedback like "Sound warmer", "Too robotic", "Responded too late", "Didn\'t acknowledge" should influence all future interactions',
  ],
  demand_intel: [
    'Summarize key buying signals',
    'Capture competitor mentions',
    'Highlight tech stack clues',
    'Identify decision-making patterns',
    'Research account context before engagement',
  ],
  demand_qual: [
    // Core voice agent training
    'Handle greetings politely',
    'If unsure, ask a concise clarifying question',
    'Confirm need, timeline, and authority',
    'Surface objections and summarize responses',
    // VOICEMAIL POLICY (MANDATORY - NO EXCEPTIONS)
    'NEVER leave voicemail - no exceptions, no fallback, no shortened version',
    'First spoken line must be: "Hi, may I speak with {{contact.full_name}}, the {{contact.job_title}} at {{account.name}}?"',
    'If voicemail is offered by anyone, say: "That\'s okay — I\'ll try again later. Thank you." then END CALL immediately',
    'If call routes directly to voicemail: Do NOT speak, do NOT record anything, do NOT introduce yourself - end call silently',
    'If gatekeeper mentions voicemail ("leave a voicemail", "send to voicemail", "goes to voicemail"), say: "No problem — I\'ll try again later. Thank you." then END CALL',
    'Log voicemail outcomes as: VOICEMAIL_DETECTED with voicemail_left: false (always)',
    // HUMANITY, KINDNESS & PROFESSIONAL ETIQUETTE (MANDATORY)
    'Be kind, respectful, warm but not casual, professional never robotic, humble never entitled, calm never rushed',
    'Sound like a thoughtful professional who respects time, appreciates permission, and never assumes access',
    // GRATITUDE (Always express when someone: allows you to speak, gives time, answers questions, considers follow-up, or listens)
    'Use gratitude phrases naturally: "Thank you — I appreciate that", "I really appreciate you giving me a moment", "Thanks for taking the time", "I appreciate you hearing me out", "That\'s very kind of you — thank you"',
    // POLITE APOLOGY FOR INTERRUPTION (cold call, busy signal, hesitation)
    'Use apology phrases when interrupting: "I apologize for the interruption", "Sorry to catch you unexpectedly", "I\'ll be very brief — I appreciate your patience", "I understand this may not be a good time"',
    // RESPECT PERMISSION - When given "20 seconds" or "briefly", stay within that time and acknowledge it
    'When permission granted, acknowledge: "Thank you — I\'ll keep this to the 20 seconds you offered"',
    // WARM ACCEPTANCE - When interest shown, respond with genuine appreciation
    'When interest shown: "Thank you very much — I really appreciate that", "That\'s great, thank you for your openness", "I appreciate you being willing to explore this"',
    // GRACEFUL EXIT - Every call must end kindly, even blocked ones
    'End calls gracefully: "Thank you for your time — I appreciate it", "Thanks again, have a great rest of your day", "I appreciate your help — thank you"',
    // FORBIDDEN: Sounding rushed, entitled, indifferent, overly cheerful/salesy, over-apologizing, emotional manipulation
  ],
  demand_engage: [
    'Personalize by ICP and role',
    'Suggest next-step CTAs tuned to engagement level',
    'Craft subject lines that drive opens',
    'Match tone to recipient seniority',
    'Include relevant social proof',
  ],
  demand_architect: [
    'Design scalable architectures with clear component boundaries',
    'Recommend AI integration patterns (RAG, fine-tuning, agent orchestration)',
    'Review code for quality, performance, and security issues',
    'Evaluate tech stacks against project requirements and team capability',
    'Provide solution blueprints with implementation roadmaps',
    'Always present trade-offs with 2-3 options before recommending',
    'Include code examples alongside architectural guidance',
  ]
};

const ECHO_GUARD_WINDOW_MS = 1200;
const ECHO_MIN_LENGTH = 12;
const ASSISTANT_MIN_COOLDOWN_MS = 1200;
const ASSISTANT_WORD_MS = 250;
const ASSISTANT_POST_PLAYBACK_COOLDOWN_MS = 200;

const DEFAULT_FIRST_MESSAGE = 'Hi, may I speak with {{contact.full_name}}, the {{contact.job_title}} at {{account.name}}?';

// Foundation Capability options (matches server/services/foundation-capabilities.ts)
const FOUNDATION_CAPABILITIES = [
  { id: 'gatekeeper_handling', label: 'Gatekeeper Handling', description: 'Navigate receptionists and assistants professionally' },
  { id: 'right_party_verification', label: 'Right Party Verification', description: 'Confirm you are speaking with the correct person' },
  { id: 'objection_handling', label: 'Objection Handling', description: 'Framework for handling common objections professionally' },
  { id: 'meeting_booking', label: 'Meeting Booking', description: 'Calendar coordination and availability discussion' },
  { id: 'survey_collection', label: 'Survey Collection', description: 'Question asking and response capture' },
  { id: 'qualification', label: 'Lead Qualification', description: 'BANT/qualification criteria discovery' },
  { id: 'voicemail_handling', label: 'Voicemail Handling', description: 'Policy for voicemail detection' },
  { id: 'transfer_handoff', label: 'Transfer & Handoff', description: 'Human agent transfer triggers and process' },
];

const defaultFormData: VirtualAgentFormData = {
  name: '',
  description: '',
  provider: 'google',
  voice: 'Fenrir',
  externalAgentId: '',
  systemPrompt: '',
  firstMessage: '',
  settings: {
    systemTools: DEFAULT_SYSTEM_TOOLS,
    advanced: DEFAULT_ADVANCED_SETTINGS,
    trainingData: [],
  },
  isActive: true,
  demandAgentType: 'demand_qual',
  isFoundationAgent: false,
  foundationCapabilities: [],
};

// ============================================================================
// SIDE-BY-SIDE SIMULATION PANEL COMPONENT
// ============================================================================
type SimulationPanelProps = {
  panelIndex: 0 | 1 | 2;
  panelState: SimulationPanelState;
  promptLabel: string;
  promptPreview: string;
  simulationStarted: boolean;
  onPlayVoice?: (content: string) => void;
};

const SimulationPanelComponent: React.FC = ({
  panelIndex,
  panelState,
  promptLabel,
  promptPreview,
  simulationStarted,
  onPlayVoice,
}) => {
  const colors = PANEL_COLORS[panelIndex];

  return (
    
      {/* Panel Header */}
      
        
          
            
              {promptLabel}
            
            
              {promptPreview || "No prompt configured"}
            
          
          
            
              {panelState.turnState === 'thinking' ? 'Thinking...' : panelState.turnState === 'agent' ? 'Agent' : 'Your Turn'}
            
            {panelState.error && (
              Error
            )}
          
        
      

      {/* Conversation Area */}
      
        
          {!simulationStarted ? (
            
              
              Ready to simulate
            
          ) : panelState.messages.length === 0 ? (
            
              {panelState.isPending ? (
                
                  
                  Waiting for response...
                
              ) : (
                "Waiting for agent..."
              )}
            
          ) : (
            
              {panelState.messages.map((message, index) => (
                
                  
                  
                    
                      
                        {message.role === 'user' ? 'You' : 'Agent'}
                      
                    
                    {message.content}
                    {message.role === 'assistant' && onPlayVoice && (
                       onPlayVoice(message.content)}
                      >
                        
                      
                    )}
                  
                
              ))}
              {panelState.isPending && (
                
                  
                  Thinking...
                
              )}
            
          )}
        

        {/* Mini Stats */}
        
          {panelState.messages.length} turns
          {panelState.evaluationReport && (
            
              Score: {panelState.evaluationReport.scorecard.total}/135
            
          )}
        
      
    
  );
};

// ============================================================================
// COMPARISON OVERLAY COMPONENT
// ============================================================================
type ComparisonOverlayProps = {
  panels: [SimulationPanelState, SimulationPanelState, SimulationPanelState];
  promptVariants: [string, string, string];
  onClose: () => void;
  onSelectWinner: (panelIndex: number) => void;
};

const ComparisonOverlayComponent: React.FC = ({
  panels,
  promptVariants,
  onClose,
  onSelectWinner,
}) => {
  // Calculate scores for each panel
  const panelScores = panels.map((panel, index) => ({
    index,
    label: `Variant ${index + 1}`,
    messageCount: panel.messages.length,
    score: panel.evaluationReport?.scorecard.total ?? 0,
    verdict: panel.evaluationReport?.executiveSummary.verdict ?? 'needs-edits',
    promptPreview: promptVariants[index]?.slice(0, 100) || 'No prompt',
    hasEvaluation: !!panel.evaluationReport,
  }));

  const bestIndex = panelScores.reduce((best, current) =>
    current.score > panelScores[best].score ? current.index : best
  , 0);

  return (
    
      
        
          
            
              
              Prompt Comparison Results
            
            
              Compare performance across your 3 prompt variants
            
          
          
            
          
        

        
          
            {panelScores.map((panel) => {
              const colors = PANEL_COLORS[panel.index as 0 | 1 | 2];
              const isBest = panel.index === bestIndex && panel.score > 0;

              return (
                
                  
                    
                      {panel.label}
                      {isBest && Best}
                    
                  
                  
                    
                      {panel.promptPreview}...
                    

                    {panel.hasEvaluation ? (
                      <>
                        
                          Score
                          {panel.score}/135
                        

                        
                          Verdict
                          
                            {panel.verdict}
                          
                        

                        
                          Turns
                          {panel.messageCount}
                        

                         onSelectWinner(panel.index)}
                        >
                          
                          Use This Prompt
                        
                      
                    ) : (
                      
                        No evaluation available
                      
                    )}
                  
                
              );
            })}
          
        

        
          Close
        
      
    
  );
};

export default function VirtualAgentsPage() {
  const [, setLocation] = useLocation();
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [creationMode, setCreationMode] = useState('skill');
  const [editingAgent, setEditingAgent] = useState(null);
  const [deleteAgent, setDeleteAgent] = useState(null);
  // Clone/Duplicate dialog state
  const [cloneDialogOpen, setCloneDialogOpen] = useState(false);
  const [agentToClone, setAgentToClone] = useState(null);
  const [cloneName, setCloneName] = useState("");
  const [formData, setFormData] = useState(defaultFormData);
  const [orgPromptData, setOrgPromptData] = useState({
    orgIntelligence: [],
    compliancePolicy: [],
    platformPolicies: [],
    agentVoiceDefaults: [],
  });
  const [orgPromptLoading, setOrgPromptLoading] = useState(false);
  const [trainingCenter, setTrainingCenter] = useState(DEFAULT_TRAINING_CENTER);
  const [activeTrainingType, setActiveTrainingType] = useState('demand_qual');
  const [testCallAgent, setTestCallAgent] = useState(null);
  const [testCallAgentCampaignId, setTestCallAgentCampaignId] = useState(null);
  const [testCallAgentCampaigns, setTestCallAgentCampaigns] = useState>([]);
  const [previewTokens, setPreviewTokens] = useState([]);
  const [previewValues, setPreviewValues] = useState>({});
  // Prompt management for preview
  const [previewPromptId, setPreviewPromptId] = useState('');
  const [previewPromptVersion, setPreviewPromptVersion] = useState('');
  const [previewPromptVariables, setPreviewPromptVariables] = useState>({});
  // Tool management for preview
  const [previewTools, setPreviewTools] = useState(['detect_voicemail_and_hangup']);
  const [previewMessages, setPreviewMessages] = useState([]);
  const [previewInput, setPreviewInput] = useState('');
  const [previewSessionId, setPreviewSessionId] = useState(undefined); // Session ID for persistent conversation state
  const [isListening, setIsListening] = useState(false);
  const [speechSupported, setSpeechSupported] = useState(false);
  const [autoSendVoice, setAutoSendVoice] = useState(true);
  const [autoPlayVoice, setAutoPlayVoice] = useState(true);
  const [previewLanguage, setPreviewLanguage] = useState('en-US');

  // Enhanced Preview Lab State
  const [previewProvider, setPreviewProvider] = useState('openai');
  const [previewVoice, setPreviewVoice] = useState('');
  const [previewEnvVars, setPreviewEnvVars] = useState>([]);
  const [previewPromptVariants, setPreviewPromptVariants] = useState(['', '', '']);
  const [activePromptVariant, setActivePromptVariant] = useState(0);

  // Side-by-Side Mode State
  const [sideBySideMode, setSideBySideMode] = useState(false);
  const [simulationPanels, setSimulationPanels] = useState([
    createEmptyPanelState(0),
    createEmptyPanelState(1),
    createEmptyPanelState(2),
  ]);
  const [showComparisonOverlay, setShowComparisonOverlay] = useState(false);
  const [comparisonReport, setComparisonReport] = useState(null);

  // Agent Preview Lab - Enhanced State
  const [previewMode, setPreviewMode] = useState('training');
  const [previewScenario, setPreviewScenario] = useState('cold-call');
  const [turnState, setTurnState] = useState('agent');
  const [rightPartyStatus, setRightPartyStatus] = useState('unknown');
  const [conversationAnalysis, setConversationAnalysis] = useState({
    stage: 'opening',
    turnGoal: 'Greet prospect and confirm identity',
    confidence: 100,
    userIntent: 'neutral',
    issues: [],
    suggestions: [],
  });
  const [simulationStarted, setSimulationStarted] = useState(false);
  const [simulationStartTime, setSimulationStartTime] = useState(null);
  const [showReasoningPanel, setShowReasoningPanel] = useState(true);
  const [reasoningPanelTab, setReasoningPanelTab] = useState('reasoning');
  
  // Session Memory - Structured conversation tracking
  const [sessionMemory, setSessionMemory] = useState({
    userGoal: '',
    prospectSignals: [],
    agentClaims: [],
    questionsAsked: [],
    objectionsDetected: [],
    commitments: [],
    complianceSignals: [],
    unresolvedItems: [],
  });
  
  // Reasoning Panel - Operational thinking artifacts
  const [reasoningPanel, setReasoningPanel] = useState({
    understanding: {
      currentObjective: 'Confirm prospect identity and establish rapport',
      prospectCareAbout: 'Unknown - needs discovery',
      confidence: 'medium',
    },
    strategy: {
      chosenApproach: 'Professional, consultative opening',
      nextBestMove: 'Ask an open-ended question about their current challenges',
    },
    riskCompliance: {
      flags: [],
      toneCheck: 'executive-grade',
    },
    evidence: [],
  });
  
  // Evaluation Report - End-of-preview analysis
  const [evaluationReport, setEvaluationReport] = useState(null);
  const [showEvaluationReport, setShowEvaluationReport] = useState(false);
  
  // Learning System - Saved coaching notes
  const [learnings, setLearnings] = useState([]);
  const [sessionId] = useState(() => `session_${Date.now()}`);
  
  const speechRecognitionRef = useRef(null);
  const autoListenRef = useRef(false);
  const manualStopRef = useRef(false);
  const audioPlaybackRef = useRef(null);
  const playbackLockRef = useRef(false);
  const lastAssistantSpokenRef = useRef("");
  const lastAssistantSpokenAtRef = useRef(0);
  const lastEchoNoticeAtRef = useRef(0);
  const assistantPlaybackUntilRef = useRef(0);
  const turnStartTimeRef = useRef(0);
  const lastTranscriptRef = useRef("");
  const lastTranscriptAtRef = useRef(0);
  const criticalSpeechErrorRef = useRef(false); // Track if we hit a critical error to stop auto-restart
  const voiceInitializedRef = useRef(false); // Prevent multiple voice initializations
  const lastPreviewLanguageRef = useRef(previewLanguage);
  const suppressAutoRestartRef = useRef(false);
  const startListeningRef = useRef void>(() => {});
  const restartTimeoutRef = useRef(null);
  const { toast } = useToast();

  useEffect(() => {
    const loadOrgPrompt = async () => {
      setOrgPromptLoading(true);
      try {
        const response = await apiRequest('GET', '/api/org-intelligence/prompt-optimization');
        const data = await response.json();
        setOrgPromptData({
          orgIntelligence: data?.orgIntelligence?.parsed || [],
          compliancePolicy: data?.compliancePolicy?.parsed || [],
          platformPolicies: data?.platformPolicies?.parsed || [],
          agentVoiceDefaults: data?.agentVoiceDefaults?.parsed || [],
        });
        
        // Only show warning if request failed, not if data is simply empty
        if (data?.source === 'fallback') {
          console.warn('[Virtual Agents] Org intelligence unavailable, using defaults');
        }
      } catch (error) {
        console.error('Failed to load org intelligence prompt data', error);
        // Don't show error toast - just log it and use empty defaults
        setOrgPromptData({
          orgIntelligence: [],
          compliancePolicy: [],
          platformPolicies: [],
          agentVoiceDefaults: [],
        });
      } finally {
        setOrgPromptLoading(false);
      }
    };

    void loadOrgPrompt();
  }, [toast]);

  // Load agent defaults when creating a new agent
  useEffect(() => {
    const loadAgentDefaults = async () => {
      if (isCreateOpen && !editingAgent) {
        try {
          const response = await apiRequest('GET', '/api/agent-defaults');
          const defaults = await response.json();
          
          setFormData({
            name: '',
            description: '',
            provider: defaults.defaultVoiceProvider || 'google',
            voice: defaults.defaultVoice || 'Fenrir',
            settings: {
              systemTools: DEFAULT_SYSTEM_TOOLS,
              advanced: DEFAULT_ADVANCED_SETTINGS,
              trainingData: [],
            },
            isActive: true,
          });
        } catch (error) {
          console.error('Failed to load agent defaults', error);
          // Fall back to hardcoded defaults
          setFormData(defaultFormData);
        }
      }
    };

    void loadAgentDefaults();
  }, [isCreateOpen, editingAgent]);

  useEffect(() => {
    try {
      const stored = localStorage.getItem('virtual-agent-training-center');
      if (stored) {
        const parsed = JSON.parse(stored);
        setTrainingCenter({ ...DEFAULT_TRAINING_CENTER, ...parsed });
      }
    } catch {
      // ignore parse errors
    }
  }, []);

  useEffect(() => {
    const nextType = formData.demandAgentType ?? 'demand_qual';
    setActiveTrainingType(nextType);
  }, [formData.demandAgentType]);

  useEffect(() => {
    if (!testCallAgent) {
      setPreviewTokens([]);
      setPreviewValues({});
      setPreviewMessages([]);
      setPreviewInput('');
      setIsListening(false);
      lastAssistantSpokenRef.current = "";
      lastAssistantSpokenAtRef.current = 0;
      lastEchoNoticeAtRef.current = 0;
      assistantPlaybackUntilRef.current = 0;
      lastTranscriptRef.current = "";
      lastTranscriptAtRef.current = 0;
      if (speechRecognitionRef.current) {
        try {
          speechRecognitionRef.current.stop();
        } catch {
          // Ignore shutdown errors.
        }
      }
      return;
    }

    // Extract tokens from agent prompts AND all prompt variants (for side-by-side mode)
    const tokens = extractPreviewTokens([
      testCallAgent.systemPrompt,
      testCallAgent.firstMessage,
      ...previewPromptVariants, // Include all variant prompts
    ]);

    setPreviewTokens(tokens);
    setPreviewValues((current) => {
      const nextValues: Record = {};
      tokens.forEach((token) => {
        if (current[token] !== undefined) {
          nextValues[token] = current[token];
          return;
        }
        const fallback = getPreviewTokenDefault(token);
        nextValues[token] = fallback ?? "";
      });
      return nextValues;
    });
  }, [testCallAgent, previewPromptVariants]);

  // Initialize enhanced preview settings
  useEffect(() => {
    if (testCallAgent) {
      // Default to agent's provider if known, else OpenAI
      const p = (testCallAgent.provider as 'openai' | 'gemini') || 'openai';
      setPreviewProvider(p);
      setPreviewVoice(testCallAgent.voice || (p === 'openai' ? 'nova' : 'Puck'));

      // Initialize prompt variants - Variant 0 is the agent's current prompt
      setPreviewPromptVariants([testCallAgent.systemPrompt || '', '', '']);
      setActivePromptVariant(0);
      setPreviewEnvVars([]); // Reset env vars on agent switch
    }
  }, [testCallAgent]);

  // Fetch campaign assignments for preview context selector
  useEffect(() => {
    if (!testCallAgent?.id) {
      setTestCallAgentCampaignId(null);
      setTestCallAgentCampaigns([]);
      return;
    }

    // Fetch the agent's campaign assignments
    const fetchCampaignAssignments = async () => {
      try {
        const response = await apiRequest('GET', `/api/virtual-agents/${testCallAgent.id}/assignments`);
        const assignments = await response.json() as Array;

        // Store all assignments for the selector
        setTestCallAgentCampaigns(assignments);

        // Auto-select the first active campaign assignment
        const activeAssignment = assignments.find(a => a.isActive);
        if (activeAssignment) {
          setTestCallAgentCampaignId(activeAssignment.campaignId);
          console.log('[Preview Studio] Auto-selected campaign context:', activeAssignment.campaignName);
        } else if (assignments.length > 0) {
          // Fall back to first assignment if none are active
          setTestCallAgentCampaignId(assignments[0].campaignId);
          console.log('[Preview Studio] Using first campaign context:', assignments[0].campaignName);
        } else {
          setTestCallAgentCampaignId(null);
        }
      } catch (error) {
        console.error('[Preview Studio] Failed to fetch campaign assignments:', error);
        setTestCallAgentCampaignId(null);
        setTestCallAgentCampaigns([]);
      }
    };

    fetchCampaignAssignments();
  }, [testCallAgent?.id]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const speechApi = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    const isSupported = Boolean(speechApi);
    console.log('[Voice Preview] Speech API check:', isSupported ? 'SUPPORTED' : 'NOT SUPPORTED', 
      'SpeechRecognition:', !!(window as any).SpeechRecognition,
      'webkitSpeechRecognition:', !!(window as any).webkitSpeechRecognition);
    setSpeechSupported(isSupported);
  }, []);

  useEffect(() => {
    if (!autoPlayVoice) {
      lastAssistantSpokenRef.current = "";
      lastAssistantSpokenAtRef.current = 0;
      assistantPlaybackUntilRef.current = 0;
    }
  }, [autoPlayVoice]);

  const previewOpeningMessage = useMemo(() => {
    // Use agent's firstMessage if available, otherwise use default
    const rawFirstMessage = testCallAgent?.firstMessage?.trim() || DEFAULT_FIRST_MESSAGE;
    // Defensive check
    if (!rawFirstMessage) return '';
    const result = applyPreviewValues(rawFirstMessage, previewValues || {});
    return result;
  }, [previewValues, testCallAgent]);

  const previewSystemPrompt = useMemo(() => {
    const rawPrompt = previewPromptVariants[activePromptVariant]?.trim() 
      ? previewPromptVariants[activePromptVariant]
      : (testCallAgent?.systemPrompt?.trim() || '');
      
    if (!rawPrompt) return '';
    return applyPreviewValues(rawPrompt, previewValues || {});
  }, [previewValues, testCallAgent, previewPromptVariants, activePromptVariant]);

  useEffect(() => {
    if (!testCallAgent) return;
    if (!previewOpeningMessage) return;

    setPreviewMessages((current) => {
      if (current.length > 0) return current;
      return [{ role: 'assistant', content: previewOpeningMessage, timestamp: new Date(), stage: 'opening' }];
    });
  }, [testCallAgent, previewOpeningMessage]);

  const { data: agents = [], isLoading } = useQuery({
    queryKey: ['/api/virtual-agents'],
  });

  const createMutation = useMutation({
    mutationFn: async (data: VirtualAgentFormData) => {
      const response = await apiRequest('POST', '/api/virtual-agents', data);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/virtual-agents'] });
      setIsCreateOpen(false);
      setFormData(defaultFormData);
      toast({ title: "Virtual agent created successfully" });
    },
    onError: (error: Error) => {
      toast({ title: "Failed to create agent", description: error.message, variant: "destructive" });
    },
  });

  const createSkillBasedAgentMutation = useMutation({
    mutationFn: async (data: {
      agentName: string;
      skillId: string;
      skillInputValues: Record;
      voice: string;
      provider: string;
    }) => {
      const response = await apiRequest('POST', '/api/virtual-agents/create-from-skill', data);
      return response.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['/api/virtual-agents'] });
      setIsCreateOpen(false);
      setCreationMode('skill');
      toast({
        title: "Skill-based agent created successfully",
        description: `${data.skillMetadata.skillName} is ready to deploy`
      });
    },
    onError: (error: Error) => {
      toast({ title: "Failed to create skill-based agent", description: error.message, variant: "destructive" });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: Partial }) => {
      const response = await apiRequest('PATCH', `/api/virtual-agents/${id}`, data);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/virtual-agents'] });
      setEditingAgent(null);
      setFormData(defaultFormData);
      toast({ title: "Virtual agent updated successfully" });
    },
    onError: (error: Error) => {
      toast({ title: "Failed to update agent", description: error.message, variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const response = await apiRequest('DELETE', `/api/virtual-agents/${id}`);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/virtual-agents'] });
      setDeleteAgent(null);
      toast({ title: "Virtual agent deleted successfully" });
    },
    onError: (error: Error) => {
      toast({ title: "Failed to delete agent", description: error.message, variant: "destructive" });
    },
  });

  const toggleActiveMutation = useMutation({
    mutationFn: async ({ id, isActive }: { id: string; isActive: boolean }) => {
      const response = await apiRequest('PATCH', `/api/virtual-agents/${id}`, { isActive });
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/virtual-agents'] });
      toast({ title: "Agent status updated" });
    },
    onError: (error: Error) => {
      toast({ title: "Failed to update status", description: error.message, variant: "destructive" });
    },
  });

  // Clone/Duplicate mutation
  const cloneMutation = useMutation({
    mutationFn: async ({ id, name }: { id: string; name?: string }) => {
      const response = await apiRequest('POST', `/api/virtual-agents/${id}/clone`, { name });
      return response.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['/api/virtual-agents'] });
      setCloneDialogOpen(false);
      setAgentToClone(null);
      setCloneName("");
      toast({ title: "Virtual agent duplicated", description: `Created "${data.agent.name}"` });
    },
    onError: (error: Error) => {
      toast({ title: "Failed to duplicate agent", description: error.message, variant: "destructive" });
    },
  });

  const previewConversationMutation = useMutation({
    mutationFn: async ({
      sessionId,
      virtualAgentId,
      campaignId,
      systemPrompt,
      firstMessage,
      messages,
      voice,
      settings,
      promptId,
      promptVersion,
      promptVariables,
      tools,
      provider,
      envVars,
    }: {
      sessionId?: string;
      virtualAgentId?: string;
      campaignId?: string;
      systemPrompt?: string;
      firstMessage?: string;
      messages: PreviewMessage[];
      voice?: string;
      settings?: any;
      promptId?: string;
      promptVersion?: string;
      promptVariables?: Record;
      tools?: string[];
      provider?: string;
      envVars?: Record;
    }) => {
      // Always send required settings for preview session
      const testAdvanced = ((testCallAgent?.settings as VirtualAgentSettings | null)?.advanced ?? {}) as Partial;
      const requiredSettings = {
        voice: voice ?? testCallAgent?.voice ?? 'Fenrir',
        settings: {
          systemTools: {
            ...DEFAULT_SYSTEM_TOOLS,
            ...(testCallAgent?.settings?.systemTools ?? {}),
          },
          advanced: {
            ...DEFAULT_ADVANCED_SETTINGS,
            ...testAdvanced,
            conversational: {
              ...DEFAULT_ADVANCED_SETTINGS.conversational,
              ...(testAdvanced.conversational ?? {}),
              eagerness: 'normal',
              takeTurnAfterSilenceSeconds: 0.5, // 0.50 seconds
              endConversationAfterSilenceSeconds: 60,
              maxConversationDurationSeconds: 240,
            },
            asr: {
              ...DEFAULT_ADVANCED_SETTINGS.asr,
              ...(testAdvanced.asr ?? {}),
              model: 'default',
              inputFormat: 'pcm_16000',
              keywords: '',
            },
            noiseReduction: { enabled: true },
            maxTokens: 4096,
            prefixPadding: 300,
            silenceDuration: 500,
            idleTimeout: 0,
            semantic: false,
            threshold: 0.5,
            model: 'user-transcript-model',
            functions: tools ?? previewTools,
          },
        },
        prompt: promptId ? {
          id: promptId,
          version: promptVersion,
          variables: promptVariables,
        } : undefined,
      };
      const response = await apiRequest('POST', '/api/virtual-agents/preview-conversation', {
        sessionId,
        virtualAgentId,
        campaignId,
        systemPrompt,
        firstMessage,
        messages,
        provider,
        envVars,
        ...requiredSettings,
      });
      return response.json() as Promise;
    },
    onError: (error: Error) => {
      toast({ title: "Preview failed", description: error.message, variant: "destructive" });
    },
  });

  const handleCreate = () => {
    createMutation.mutate(formData);
  };

  const handleSkillBasedCreate = async (data: {
    agentName: string;
    skillId: string;
    skillInputValues: Record;
    voice: string;
    provider: string;
  }) => {
    await createSkillBasedAgentMutation.mutateAsync(data);
  };

  const handleUpdate = () => {
    if (editingAgent) {
      updateMutation.mutate({ id: editingAgent.id, data: formData });
    }
  };

  const handleEdit = (agent: VirtualAgent) => {
    const rawSettings = (agent.settings ?? {}) as Partial;
    const mergedSettings: VirtualAgentSettings = {
      systemTools: {
        ...DEFAULT_SYSTEM_TOOLS,
        ...(rawSettings.systemTools ?? {}),
      },
      advanced: {
        asr: {
          ...DEFAULT_ADVANCED_SETTINGS.asr,
          ...(rawSettings.advanced?.asr ?? {}),
        },
        conversational: {
          ...DEFAULT_ADVANCED_SETTINGS.conversational,
          ...(rawSettings.advanced?.conversational ?? {}),
        },
        realtime: {
          ...DEFAULT_ADVANCED_SETTINGS.realtime,
          ...(rawSettings.advanced?.realtime ?? {}),
        },
        softTimeout: {
          ...DEFAULT_ADVANCED_SETTINGS.softTimeout,
          ...(rawSettings.advanced?.softTimeout ?? {}),
        },
        clientEvents: {
          ...DEFAULT_ADVANCED_SETTINGS.clientEvents,
          ...(rawSettings.advanced?.clientEvents ?? {}),
        },
        privacy: {
          ...DEFAULT_ADVANCED_SETTINGS.privacy,
          ...(rawSettings.advanced?.privacy ?? {}),
        },
      },
      trainingData: rawSettings.trainingData ?? [],
    };

    setFormData({
      name: agent.name,
      description: agent.description || '',
      provider: agent.provider,
      externalAgentId: agent.externalAgentId || '',
      voice: agent.voice || 'nova',
      systemPrompt: agent.systemPrompt || '',
      firstMessage: agent.firstMessage || '',
      settings: mergedSettings,
      isActive: agent.isActive,
      demandAgentType: agent.demandAgentType || null,
      // Foundation Agent fields
      isFoundationAgent: agent.isFoundationAgent ?? false,
      foundationCapabilities: agent.foundationCapabilities || [],
    });
    // Initialize preview tools from saved settings
    const savedFunctions = mergedSettings.advanced?.realtime?.functions;
    if (savedFunctions && Array.isArray(savedFunctions)) {
      setPreviewTools(savedFunctions);
    }
    setEditingAgent(agent);
  };

  const handleCloseDialog = () => {
    setIsCreateOpen(false);
    setEditingAgent(null);
    setFormData(defaultFormData);
  };

  const activeAgents = agents.filter(a => a.isActive);
  const inactiveAgents = agents.filter(a => !a.isActive);
  const missingPreviewTokens = previewTokens.filter((token) => !previewValues[token]?.trim());

  // Agent Preview Lab - Helper Functions
  const analyzeConversationStage = useCallback((messages: PreviewMessage[]): ConversationStage => {
    const messageCount = messages.length;
    const lastUserMessage = messages.filter(m => m.role === 'user').slice(-1)[0]?.content?.toLowerCase() || '';
    
    // Check for identity confirmation on first user response
    const firstUserResponse = messages.filter(m => m.role === 'user')[0]?.content?.toLowerCase() || '';
    const identityConfirmationPatterns = [
      'yes', 'yeah', 'yep', 'yup',
      'speaking', 'this is me', "that's me", 'it\'s me',
      'this is ', 'speaking with'
    ];
    const isIdentityConfirmed = identityConfirmationPatterns.some(pattern => firstUserResponse.includes(pattern));
    
    // If first user message is an identity confirmation, advance from opening
    if (messageCount  8) return 'qualification';
    return 'discovery';
  }, []);

  const detectUserIntent = useCallback((message: string): UserIntent => {
    const lower = message.toLowerCase();
    if (lower.includes('yes') || lower.includes('interested') || lower.includes('tell me more')) return 'interested';
    if (lower.includes('busy') || lower.includes('not a good time') || lower.includes('call back')) return 'busy';
    if (lower.includes('no') || lower.includes('not interested') || lower.includes("don't need")) return 'objecting';
    if (lower.includes('what') || lower.includes('?') || lower.includes("don't understand")) return 'confused';
    if (lower.length  {
    const goals: Record = {
      'opening': 'Greet prospect and confirm identity',
      'discovery': 'Understand pain points and current situation',
      'qualification': 'Confirm budget, authority, need, timeline',
      'objection-handling': 'Address concerns professionally',
      'closing': 'Secure next steps or follow-up',
      'exit': 'Close conversation gracefully',
    };
    return goals[stage];
  }, []);

  const analyzeAgentResponse = useCallback((response: string, stage: ConversationStage): { issues: string[]; suggestions: string[] } => {
    const issues: string[] = [];
    const suggestions: string[] = [];
    
    // Response length checks
    if (response.length > 300) {
      issues.push('Response too long - may lose prospect attention');
      suggestions.push('Keep responses under 2-3 sentences');
    }
    
    // Question stacking check
    const questionCount = (response.match(/\?/g) || []).length;
    if (questionCount > 2) {
      issues.push('Multiple questions in one turn');
      suggestions.push('Ask one question at a time');
    }
    
    // Stage-specific checks
    if (stage === 'opening' && !response.toLowerCase().includes('speak with')) {
      suggestions.push('Consider confirming you have the right person');
    }
    
    if (stage === 'objection-handling' && !response.toLowerCase().includes('understand')) {
      suggestions.push('Acknowledge the objection before responding');
    }
    
    return { issues, suggestions };
  }, []);

  // Session Memory - Update structured conversation tracking per turn
  const updateSessionMemory = useCallback((
    message: PreviewMessage,
    allMessages: PreviewMessage[]
  ) => {
    setSessionMemory(prev => {
      const updated = { ...prev };
      const content = message.content.toLowerCase();
      
      if (message.role === 'user') {
        // Detect prospect signals
        if (content.includes('busy') || content.includes('not a good time')) {
          updated.prospectSignals = [...updated.prospectSignals, 'Time-pressed'];
        }
        if (content.includes('not interested') || content.includes('no thanks')) {
          updated.prospectSignals = [...updated.prospectSignals, 'Not interested'];
        }
        if (content.includes('tell me more') || content.includes('interested')) {
          updated.prospectSignals = [...updated.prospectSignals, 'Showing interest'];
        }
        if (content.includes('how much') || content.includes('cost') || content.includes('price')) {
          updated.prospectSignals = [...updated.prospectSignals, 'Price-conscious'];
        }
        
        // Detect objections
        const objectionPatterns = [
          { pattern: /not interested/i, type: 'Interest' },
          { pattern: /too expensive|cost|price/i, type: 'Budget' },
          { pattern: /already have|using|vendor/i, type: 'Competition' },
          { pattern: /busy|not a good time|call back/i, type: 'Timing' },
          { pattern: /who are you|what company/i, type: 'Authority' },
          { pattern: /send.*email|send.*info/i, type: 'Brush-off' },
        ];
        
        for (const { pattern, type } of objectionPatterns) {
          if (pattern.test(content)) {
            const existingObjection = updated.objectionsDetected.find(o => o.objection === type);
            if (!existingObjection) {
              updated.objectionsDetected = [...updated.objectionsDetected, {
                objection: type,
                handling: 'pending',
                quality: 'missed',
              }];
            }
          }
        }
      } else if (message.role === 'assistant') {
        // Detect agent claims
        if (content.includes('we can') || content.includes('we help') || content.includes('our solution')) {
          const claim = message.content.split('.')[0];
          if (claim.length  m.role === 'user').slice(-1)[0]?.content?.toLowerCase() || '';
        updated.objectionsDetected = updated.objectionsDetected.map(obj => {
          if (obj.handling === 'pending') {
            const handled = content.includes('understand') || content.includes('appreciate') || content.includes('hear you');
            return {
              ...obj,
              handling: handled ? content.slice(0, 100) : 'pending',
              quality: handled ? 'good' : obj.quality,
            };
          }
          return obj;
        });
        
        // Detect commitments
        if (content.includes("i'll send") || content.includes("i will send") || content.includes("i'll email")) {
          updated.commitments = [...updated.commitments, 'Send follow-up email'];
        }
        if (content.includes('call you') || content.includes('follow up')) {
          updated.commitments = [...updated.commitments, 'Schedule follow-up call'];
        }
        
        // Detect compliance signals
        if (content.includes('just wanted') || content.includes('real quick') || content.includes('only take')) {
          updated.complianceSignals = [...updated.complianceSignals, {
            type: 'pressure',
            message: 'Minimizing language detected',
          }];
        }
        if (!content.includes('?') && allMessages.length  200) {
          updated.complianceSignals = [...updated.complianceSignals, {
            type: 'assumption',
            message: 'Long pitch without discovery questions',
          }];
        }
      }
      
      // Detect unresolved items (questions asked but not answered)
      const assistantQuestions = allMessages
        .filter(m => m.role === 'assistant')
        .flatMap(m => m.content.match(/[^.!?]*\?/g) || []);
      const userResponses = allMessages.filter(m => m.role === 'user').map(m => m.content);
      
      if (assistantQuestions.length > userResponses.length) {
        updated.unresolvedItems = ['Pending response to agent question'];
      }
      
      return updated;
    });
  }, []);

  // Update Reasoning Panel based on conversation state
  const updateReasoningPanel = useCallback((
    stage: ConversationStage,
    userIntent: UserIntent,
    messages: PreviewMessage[],
    issues: string[]
  ) => {
    const lastUserMessage = messages.filter(m => m.role === 'user').slice(-1)[0]?.content || '';
    
    // Determine confidence
    let confidence: 'low' | 'medium' | 'high' = 'medium';
    if (userIntent === 'interested') confidence = 'high';
    if (userIntent === 'objecting' || userIntent === 'disengaged') confidence = 'low';
    
    // Determine what prospect cares about
    let prospectCareAbout = 'Unknown - needs discovery';
    if (lastUserMessage.toLowerCase().includes('time') || lastUserMessage.toLowerCase().includes('busy')) {
      prospectCareAbout = 'Respecting their time';
    } else if (lastUserMessage.toLowerCase().includes('cost') || lastUserMessage.toLowerCase().includes('price')) {
      prospectCareAbout = 'Value and ROI';
    } else if (lastUserMessage.toLowerCase().includes('competitor') || lastUserMessage.toLowerCase().includes('already')) {
      prospectCareAbout = 'Differentiation from current solution';
    } else if (userIntent === 'confused') {
      prospectCareAbout = 'Clarity on value proposition';
    }
    
    // Determine strategy
    const stageStrategies: Record = {
      'opening': { 
        approach: 'Professional, consultative opening', 
        nextMove: 'Confirm identity and bridge to value proposition' 
      },
      'discovery': { 
        approach: 'Active listening with probing questions', 
        nextMove: 'Ask about current challenges or processes' 
      },
      'qualification': { 
        approach: 'Direct but respectful qualification', 
        nextMove: 'Confirm decision-making authority and timeline' 
      },
      'objection-handling': { 
        approach: 'Empathetic acknowledgment then pivot', 
        nextMove: 'Acknowledge concern, then offer alternative perspective' 
      },
      'closing': { 
        approach: 'Clear next-steps proposal', 
        nextMove: 'Propose specific follow-up action with timeline' 
      },
      'exit': { 
        approach: 'Graceful close preserving relationship', 
        nextMove: 'Thank them and leave door open' 
      },
    };
    
    // Determine risk flags
    const flags: ReasoningPanel['riskCompliance']['flags'] = [];
    if (issues.some(i => i.includes('too long'))) flags.push('length-risk');
    if (issues.some(i => i.includes('Multiple questions'))) flags.push('too-pushy');
    if (sessionMemory.complianceSignals.some(s => s.type === 'assumption')) flags.push('assumed-too-much');
    if (sessionMemory.complianceSignals.some(s => s.type === 'pressure')) flags.push('needs-consent');
    
    // Determine tone check
    let toneCheck: ReasoningPanel['riskCompliance']['toneCheck'] = 'executive-grade';
    if (flags.length > 0) toneCheck = 'borderline';
    if (flags.length > 2) toneCheck = 'needs-revision';
    
    // Gather evidence from recent user messages
    const evidence = messages
      .filter(m => m.role === 'user')
      .slice(-3)
      .map(m => `"${m.content.slice(0, 50)}${m.content.length > 50 ? '...' : ''}"`);
    
    setReasoningPanel({
      understanding: {
        currentObjective: getStageGoal(stage),
        prospectCareAbout,
        confidence,
      },
      strategy: {
        chosenApproach: stageStrategies[stage].approach,
        nextBestMove: stageStrategies[stage].nextMove,
      },
      riskCompliance: {
        flags,
        toneCheck,
      },
      evidence,
    });
  }, [sessionMemory.complianceSignals, getStageGoal]);

  // Generate Evaluation Report at end of preview
  const generateEvaluationReport = useCallback((messages: PreviewMessage[]): EvaluationReport => {
    const agentMessages = messages.filter(m => m.role === 'assistant');
    const userMessages = messages.filter(m => m.role === 'user');
    
    // VOICEMAIL DISCIPLINE CHECK - CRITICAL
    const voicemailViolations: string[] = [];
    const voicemailKeywords = ['voicemail', 'leave a message', 'leave message', 'record', 'after the beep', 'after the tone'];
    const correctVoicemailResponse = ["try again later", "no problem", "that's okay"];
    
    for (let i = 0; i  msgLower.includes(kw))) {
        // Check if next agent response is appropriate
        const nextAgentMsg = messages.slice(i + 1).find(m => m.role === 'assistant');
        if (nextAgentMsg) {
          const agentLower = nextAgentMsg.content.toLowerCase();
          const hasCorrectResponse = correctVoicemailResponse.some(r => agentLower.includes(r));
          const isBrief = nextAgentMsg.content.length  msgLower.includes(p))) {
        gratitudeCount++;
      }
      
      // Check for apology at start (first 2 agent messages)
      if (i  msgLower.includes(p))) {
        apologyAtStart = true;
      }
      
      // Check for warm closing (last agent message)
      if (i === agentMessages.length - 1) {
        warmClosing = warmClosingPhrases.some(p => msgLower.includes(p));
        // Check for abrupt ending (short, no gratitude)
        if (agentMessages[i].content.length  msgLower.includes(p))) {
          abruptEnding = true;
        }
      }
      
      // Check for rushed/salesy tone
      if (rushedPhrases.some(p => msgLower.includes(p))) {
        rushedTone = true;
      }
      if (salesyPhrases.some(p => msgLower.includes(p))) {
        salesyTone = true;
      }
    }
    
    // Check if gratitude was expressed after user gave permission
    const permissionPhrases = ['okay', 'sure', 'go ahead', 'yes', 'fine', 'alright', 'seconds', 'minute', 'briefly'];
    for (let i = 0; i  userLower.includes(p))) {
        // Find next agent message
        const msgIndex = messages.indexOf(userMessages[i]);
        const nextAgentMsg = messages.slice(msgIndex + 1).find(m => m.role === 'assistant');
        if (nextAgentMsg && !gratitudePhrases.some(p => nextAgentMsg.content.toLowerCase().includes(p))) {
          humanityIssues.push(`Turn ${msgIndex + 2}: No gratitude after permission granted (HIGH SEVERITY)`);
        }
      }
    }
    
    if (abruptEnding) {
      humanityIssues.push('Call ended abruptly without graceful closing (HIGH SEVERITY)');
    }
    if (!apologyAtStart && messages.length > 2) {
      humanityIssues.push('No polite acknowledgment of interruption at call start (MEDIUM)');
    }
    if (rushedTone) {
      humanityIssues.push('Rushed/minimizing language detected (MEDIUM)');
    }
    if (salesyTone) {
      humanityIssues.push('Overly salesy/cheerful language detected (MEDIUM)');
    }
    if (gratitudeCount === 0 && agentMessages.length > 2) {
      humanityIssues.push('No gratitude expressed throughout conversation (HIGH SEVERITY)');
    }
    
    // Calculate humanity score (0-20)
    let humanityScore = 20;
    if (abruptEnding) humanityScore -= 6; // High severity
    if (gratitudeCount === 0) humanityScore -= 6; // High severity  
    if (!apologyAtStart) humanityScore -= 3; // Medium
    if (rushedTone) humanityScore -= 3; // Medium
    if (salesyTone) humanityScore -= 3; // Medium
    if (!warmClosing) humanityScore -= 2;
    // Bonus for good gratitude usage
    if (gratitudeCount >= 2) humanityScore = Math.min(20, humanityScore + 2);
    humanityScore = Math.max(0, humanityScore);
    
    // 🧠 GENERAL INTELLIGENCE CHECK
    const intelligenceIssues: string[] = [];
    const acknowledgementPhrases = ['understood', 'i see', 'got it', 'that makes sense', 'i understand', 'okay', 'right'];
    const stackedIntentPhrases = ['but also', 'and also', 'plus', 'additionally', 'furthermore', 'moreover'];
    
    let acknowledgementCount = 0;
    let lastAcknowledgement = '';
    let repeatedAcknowledgement = false;
    let stackedIntents = false;
    let ignoredInput = false;
    let jumpedAhead = false;
    
    for (let i = 0; i  msgLower.includes(p));
      if (foundAck) {
        acknowledgementCount++;
        if (foundAck === lastAcknowledgement) {
          repeatedAcknowledgement = true;
        }
        lastAcknowledgement = foundAck;
      }
      
      // Check for stacked intents (multiple questions or topics in one response)
      if (questionCount > 2) {
        stackedIntents = true;
        intelligenceIssues.push(`Turn ${i + 1}: Multiple questions stacked in one response (avoid overwhelming)`);
      }
      if (stackedIntentPhrases.some(p => msgLower.includes(p)) && questionCount > 1) {
        stackedIntents = true;
      }
      
      // Check for jumping ahead without acknowledging user input
      if (i > 0) {
        const prevUserMsg = messages.filter(m => m.role === 'user').slice(-1)[0];
        if (prevUserMsg) {
          const userMsgIndex = messages.indexOf(prevUserMsg);
          const agentMsgIndex = messages.indexOf(agentMessages[i]);
          // If agent message immediately follows user message without acknowledgement
          if (agentMsgIndex === userMsgIndex + 1 && !acknowledgementPhrases.some(p => msgLower.startsWith(p))) {
            // Check if user asked a question or made a statement that needs acknowledgement
            const userLower = prevUserMsg.content.toLowerCase();
            const userAskedQuestion = prevUserMsg.content.includes('?');
            const userMadeStatement = prevUserMsg.content.length > 20 && !userAskedQuestion;
            if (userMadeStatement && !gratitudePhrases.some(p => msgLower.includes(p))) {
              jumpedAhead = true;
            }
          }
        }
      }
    }
    
    // Check for ignoring user input (no acknowledgement after user speaks)
    for (let i = 0; i  userContent.includes(p))) {
          // Agent should slow down/acknowledge
          const slowDownPhrases = ['understand', 'no problem', 'take your time', 'no rush', 'that\'s okay'];
          if (!slowDownPhrases.some(p => agentContent.includes(p))) {
            intelligenceIssues.push(`Turn ${i + 2}: User hesitated but agent didn't acknowledge or slow down`);
            ignoredInput = true;
          }
        }
        
        // User expressed confusion
        const confusionPhrases = ['what do you mean', 'confused', 'don\'t understand', 'what?', 'huh?'];
        if (confusionPhrases.some(p => userContent.includes(p))) {
          const clarifyPhrases = ['let me clarify', 'sorry', 'what i mean', 'to explain', 'in other words'];
          if (!clarifyPhrases.some(p => agentContent.includes(p))) {
            intelligenceIssues.push(`Turn ${i + 2}: User was confused but agent didn't clarify`);
            ignoredInput = true;
          }
        }
      }
    }
    
    if (repeatedAcknowledgement) {
      intelligenceIssues.push('Same acknowledgement phrase repeated consecutively (sounds robotic)');
    }
    if (acknowledgementCount === 0 && agentMessages.length > 2) {
      intelligenceIssues.push('No acknowledgement phrases used throughout conversation (lacks attentiveness)');
    }
    if (jumpedAhead) {
      intelligenceIssues.push('Agent jumped ahead without acknowledging user input (MEDIUM)');
    }
    
    // Calculate intelligence score (0-15) - this will be added to compliance for now
    let intelligenceScore = 15;
    if (repeatedAcknowledgement) intelligenceScore -= 3;
    if (acknowledgementCount === 0 && agentMessages.length > 2) intelligenceScore -= 4;
    if (stackedIntents) intelligenceScore -= 3;
    if (ignoredInput) intelligenceScore -= 4;
    if (jumpedAhead) intelligenceScore -= 2;
    // Bonus for good acknowledgement rotation
    if (acknowledgementCount >= 3 && !repeatedAcknowledgement) intelligenceScore = Math.min(15, intelligenceScore + 2);
    intelligenceScore = Math.max(0, intelligenceScore);
    
    // Calculate scorecard
    const avgResponseLength = agentMessages.reduce((sum, m) => sum + m.content.length, 0) / (agentMessages.length || 1);
    const totalQuestions = agentMessages.reduce((sum, m) => sum + (m.content.match(/\?/g) || []).length, 0);
    const questionStacking = agentMessages.filter(m => (m.content.match(/\?/g) || []).length > 2).length;
    const objectionHandledWell = sessionMemory.objectionsDetected.filter(o => o.quality === 'good').length;
    const totalObjections = sessionMemory.objectionsDetected.length;
    
    // Score calculations (heuristic-based)
    const clarityScore = Math.min(20, Math.max(0, 20 - Math.floor((avgResponseLength - 150) / 30)));
    const authorityScore = agentMessages.some(m => m.content.toLowerCase().includes('we help') || m.content.toLowerCase().includes('our clients')) ? 18 : 12;
    const brevityScore = Math.min(15, Math.max(0, 15 - Math.floor((avgResponseLength - 100) / 40)));
    const questionQualityScore = Math.min(15, Math.max(0, Math.floor(totalQuestions / agentMessages.length * 5) - questionStacking * 3));
    const objectionHandlingScore = totalObjections > 0 
      ? Math.round((objectionHandledWell / totalObjections) * 15) 
      : 15;
    // Voicemail violations severely impact compliance score
    const complianceScore = Math.max(0, 15 - sessionMemory.complianceSignals.length * 3 - voicemailViolations.length * 5);
    const totalScore = clarityScore + authorityScore + brevityScore + questionQualityScore + objectionHandlingScore + complianceScore + humanityScore + intelligenceScore;
    
    // Executive summary
    const whatWentWell: string[] = [];
    const whatHurt: string[] = [];
    
    if (voicemailDisciplinePassed) whatWentWell.push('Voicemail discipline maintained');
    else whatHurt.push('CRITICAL: Voicemail policy violated');
    
    if (humanityScore >= 16) whatWentWell.push('Warm, professional, human tone');
    else if (humanityScore = 12) whatWentWell.push('Good conversational intelligence and acknowledgement');
    else if (intelligenceScore = 15) whatWentWell.push('Clear and concise responses');
    else whatHurt.push('Responses were too verbose');
    
    if (questionQualityScore >= 10) whatWentWell.push('Good use of questions');
    else whatHurt.push('Question stacking or lack of discovery');
    
    if (objectionHandlingScore >= 10) whatWentWell.push('Effective objection handling');
    else if (totalObjections > 0) whatHurt.push('Missed or weak objection responses');
    
    if (complianceScore >= 12) whatWentWell.push('Professional, compliant tone');
    else whatHurt.push('Pressure tactics or assumptions detected');
    
    // Timeline highlights
    const timelineHighlights: TimelineHighlight[] = messages.slice(0, 10).map((m, i) => {
      let tag: TurnTag = 'good-move';
      if (m.role === 'assistant') {
        if (m.content.length > 300) tag = 'risk';
        else if ((m.content.match(/\?/g) || []).length > 2) tag = 'risk';
        else if (m.content.toLowerCase().includes('understand') && m.stage === 'objection-handling') tag = 'good-move';
        // Voicemail violation is a critical risk
        if (m.content.toLowerCase().includes('voicemail') || m.content.toLowerCase().includes('leave a message')) tag = 'risk';
      } else {
        if (m.intent === 'objecting') tag = 'risk';
        else if (m.intent === 'interested') tag = 'good-move';
        else if (m.intent === 'disengaged') tag = 'missed-opportunity';
      }
      
      return {
        turn: i + 1,
        role: m.role,
        summary: m.content.slice(0, 60) + (m.content.length > 60 ? '...' : ''),
        tag,
      };
    });
    
    // Objection review
    const detectedObjections = sessionMemory.objectionsDetected.map(o => o.objection);
    const goodHandlings = sessionMemory.objectionsDetected.filter(o => o.quality === 'good');
    const responseQuality = totalObjections > 0
      ? `${goodHandlings.length}/${totalObjections} objections handled effectively`
      : 'No objections detected';
    
    // Prompt improvements (heuristic suggestions)
    const promptImprovements: EvaluationReport['promptImprovements'] = [];
    
    // Add voicemail violation fixes first (highest priority)
    if (!voicemailDisciplinePassed) {
      promptImprovements.push({
        originalLine: 'Agent left or attempted to leave voicemail',
        replacement: 'Add instruction: "NEVER leave voicemail. If voicemail is offered, say: That\'s okay — I\'ll try again later. Thank you. Then END CALL immediately."',
        reason: 'CRITICAL: Voicemail policy must be enforced',
      });
    }
    
    if (avgResponseLength > 250) {
      promptImprovements.push({
        originalLine: 'Current response style is verbose',
        replacement: 'Add instruction: "Keep responses under 3 sentences. Use bullet points for lists."',
        reason: 'Improve brevity for executive-level prospects',
      });
    }
    if (questionStacking > 0) {
      promptImprovements.push({
        originalLine: 'Multiple questions per turn detected',
        replacement: 'Add instruction: "Ask ONE question per turn. Wait for answer before asking more."',
        reason: 'Prevent overwhelming the prospect',
      });
    }
    if (sessionMemory.complianceSignals.some(s => s.type === 'pressure')) {
      promptImprovements.push({
        originalLine: 'Pressure language detected',
        replacement: 'Add instruction: "Never minimize or rush. Respect their time by being direct about value."',
        reason: 'Maintain executive-grade professionalism',
      });
    }
    
    // Humanity improvements
    if (humanityIssues.some(i => i.includes('No gratitude after permission'))) {
      promptImprovements.push({
        originalLine: 'No gratitude when permission granted',
        replacement: 'Add instruction: "When prospect gives time or permission, always acknowledge: Thank you — I appreciate that."',
        reason: 'HUMANITY: Gratitude is mandatory after permission',
      });
    }
    if (abruptEnding) {
      promptImprovements.push({
        originalLine: 'Call ended without graceful closing',
        replacement: 'Add instruction: "End every call gracefully: Thank you for your time — I appreciate it. or Thanks again, have a great rest of your day."',
        reason: 'HUMANITY: Every call must end kindly',
      });
    }
    if (rushedTone) {
      promptImprovements.push({
        originalLine: 'Rushed/minimizing language used',
        replacement: 'Add instruction: "Never sound rushed. Avoid phrases like real quick, just a second. Be calm and respectful."',
        reason: 'HUMANITY: Sound calm, never rushed',
      });
    }
    if (salesyTone) {
      promptImprovements.push({
        originalLine: 'Overly salesy language detected',
        replacement: 'Add instruction: "Never sound overly cheerful or salesy. Be warm but professional. Avoid amazing, incredible, fantastic."',
        reason: 'HUMANITY: Professional, not salesy',
      });
    }
    
    // Intelligence improvements
    if (repeatedAcknowledgement) {
      promptImprovements.push({
        originalLine: 'Same acknowledgement phrase repeated',
        replacement: 'Add instruction: "Rotate acknowledgement phrases. Use variety: Understood, I see, Got it, That makes sense, Thank you."',
        reason: 'INTELLIGENCE: Acknowledgement rotation for naturalness',
      });
    }
    if (ignoredInput) {
      promptImprovements.push({
        originalLine: 'User input not acknowledged',
        replacement: 'Add instruction: "Always acknowledge user input before responding. If they hesitate, slow down. If confused, clarify."',
        reason: 'INTELLIGENCE: Never ignore what the user says',
      });
    }
    if (stackedIntents) {
      promptImprovements.push({
        originalLine: 'Multiple intents stacked in response',
        replacement: 'Add instruction: "Never stack multiple questions or topics. One intent per response. Wait for acknowledgement."',
        reason: 'INTELLIGENCE: Avoid overwhelming the user',
      });
    }
    if (acknowledgementCount === 0 && agentMessages.length > 2) {
      promptImprovements.push({
        originalLine: 'No acknowledgement phrases used',
        replacement: 'Add instruction: "Use acknowledgement fillers when appropriate: Understood, I see, Got it, That makes sense."',
        reason: 'INTELLIGENCE: Show attentiveness and presence',
      });
    }
    
    // Verdict - voicemail violations are automatic failure, humanity and intelligence issues affect verdict
    let verdict: 'approve' | 'needs-edits' | 'reject' = 'approve';
    if (!voicemailDisciplinePassed) verdict = 'reject'; // CRITICAL: Voicemail violation = automatic reject
    else if (humanityScore  1 || humanityScore  o.quality !== 'good')
          .map(o => `For "${o.objection}": Acknowledge first, then pivot to value`),
      },
      promptImprovements,
      recommendedPrompt: promptImprovements.length > 0 
        ? `Consider adding these instructions to your prompt:\n${promptImprovements.map(p => `• ${p.replacement}`).join('\n')}`
        : 'Prompt looks good! No major changes recommended.',
      learningNotes: [
        ...whatHurt.map(h => `Improvement: ${h}`),
        ...promptImprovements.map(p => p.reason),
        ...humanityIssues,
        ...intelligenceIssues,
      ],
      voicemailDiscipline: {
        passed: voicemailDisciplinePassed,
        violations: voicemailViolations,
      },
      humanityReport: {
        score: humanityScore,
        maxScore: 20,
        passed: humanityScore >= 14,
        issues: humanityIssues,
      },
      intelligenceReport: {
        score: intelligenceScore,
        maxScore: 15,
        passed: intelligenceScore >= 10,
        issues: intelligenceIssues,
      },
    };
  }, [sessionMemory]);

  // Add learning entry from feedback
  const addLearningEntry = useCallback((
    issueType: IssueType,
    feedback: string,
    recommendedFix: string,
    severity: IssueSeverity
  ) => {
    if (!testCallAgent) return;
    
    const newLearning: LearningEntry = {
      id: `learning_${Date.now()}`,
      agentId: testCallAgent.id.toString(),
      sessionId,
      issueType,
      feedback,
      recommendedFix,
      severity,
      status: 'proposed',
      createdAt: new Date(),
    };
    
    setLearnings(prev => [...prev, newLearning]);
    
    toast({
      title: "Learning noted",
      description: `${issueType} feedback saved for review`,
    });
  }, [testCallAgent, sessionId, toast]);

  // Apply learning to prompt
  const applyLearning = useCallback((learningId: string) => {
    const learning = learnings.find(l => l.id === learningId);
    if (!learning) return;
    
    // Update learning status
    setLearnings(prev => prev.map(l => 
      l.id === learningId ? { ...l, status: 'accepted' as const } : l
    ));
    
    // Append recommendation to system prompt
    const currentPrompt = previewSystemPrompt || '';
    const updatedPrompt = `${currentPrompt}\n\n[Coaching note: ${learning.recommendedFix}]`;
    toast({
      title: "Learning applied",
      description: "Coaching note added to agent prompt",
    });
  }, [learnings, previewSystemPrompt, toast]);

  const stopListening = useCallback(() => {
    suppressAutoRestartRef.current = true;
    if (restartTimeoutRef.current) {
      clearTimeout(restartTimeoutRef.current);
      restartTimeoutRef.current = null;
    }
    try {
      if (speechRecognitionRef.current) {
        speechRecognitionRef.current.abort(); // Use abort() for immediate stop
        speechRecognitionRef.current = null;
      }
    } catch {
      // Ignore stop errors.
    }
    setIsListening(false);
  }, []);

  const handlePlayPreviewVoice = useCallback(async (text: string) => {
    if (!previewVoice || !previewProvider) return;
    const wasListening = isListening;
    const allowAutoResume = autoListenRef.current && !manualStopRef.current;
    const normalizedText = normalizePreviewTranscript(text);
    if (normalizedText) {
      const wordCount = normalizedText.split(" ").filter(Boolean).length;
      const estimatedDurationMs = Math.max(
        ASSISTANT_MIN_COOLDOWN_MS,
        wordCount * ASSISTANT_WORD_MS
      );
      lastAssistantSpokenRef.current = normalizedText;
      lastAssistantSpokenAtRef.current = Date.now();
      assistantPlaybackUntilRef.current = Date.now()
        + estimatedDurationMs
        + ASSISTANT_POST_PLAYBACK_COOLDOWN_MS;
    }
    playbackLockRef.current = true;
    if (wasListening) {
      manualStopRef.current = true;
      stopListening();
    }
    if (audioPlaybackRef.current) {
      audioPlaybackRef.current.pause();
      audioPlaybackRef.current = null;
    }
    try {
      const response = await apiRequest(
        'GET',
        `/api/virtual-agents/preview-voice?voice=${previewVoice}&provider=${previewProvider}&text=${encodeURIComponent(text)}`
      );
      const audioBlob = await response.blob();
      const audioUrl = URL.createObjectURL(audioBlob);
      const audio = new Audio(audioUrl);
      audioPlaybackRef.current = audio;
      audio.onloadedmetadata = () => {
        const durationMs = Number.isFinite(audio.duration) ? audio.duration * 1000 : 0;
        if (durationMs > 0) {
          // Use precise duration; do not keep earlier overestimates
          assistantPlaybackUntilRef.current = Date.now() + durationMs + ASSISTANT_POST_PLAYBACK_COOLDOWN_MS;
        }
      };
      const cleanupPlayback = () => {
        URL.revokeObjectURL(audioUrl);
        if (audioPlaybackRef.current === audio) {
          audioPlaybackRef.current = null;
        }
        if (normalizedText) {
          lastAssistantSpokenAtRef.current = Date.now();
        }
        // After playback ends, accept speech quickly
        assistantPlaybackUntilRef.current = Date.now() + ASSISTANT_POST_PLAYBACK_COOLDOWN_MS;
        playbackLockRef.current = false;
        if (allowAutoResume) {
          manualStopRef.current = false;
          suppressAutoRestartRef.current = false; // CRITICAL: Reset this so mic can restart
          console.log('[Voice Preview] Audio playback ended, starting mic in 200ms...');
          setTimeout(() => {
            console.log('[Voice Preview] Starting mic after playback...');
            startListeningRef.current();
          }, 200);
        }
      };
      audio.onended = cleanupPlayback;
      audio.onerror = cleanupPlayback;
      try {
        await audio.play();
      } catch (playError) {
        cleanupPlayback();
        throw playError;
      }
    } catch (error) {
      playbackLockRef.current = false;
      if (allowAutoResume) {
        manualStopRef.current = false;
        setTimeout(() => {
          startListeningRef.current();
        }, 200);
      }
      toast({
        title: "Voice preview failed",
        description: error instanceof Error ? error.message : "Could not play voice preview",
        variant: "destructive"
      });
    }
  }, [previewVoice, previewProvider, isListening, stopListening, toast]);

  const handleStartSimulation = useCallback(() => {
    console.log('[Voice Preview] handleStartSimulation called - previewOpeningMessage:', !!previewOpeningMessage, 'testCallAgent:', !!testCallAgent);
    
    if (!previewOpeningMessage) {
      toast({ title: "No opening message", description: "Configure an opening message first", variant: "destructive" });
      return;
    }
    
    // Reset voice initialized flag so useEffect can start fresh
    voiceInitializedRef.current = false;
    console.log('[Voice Preview] Reset voiceInitializedRef, setting simulationStarted to true');
    
    // CRITICAL: Initialize voice listening refs BEFORE setting simulationStarted
    // This ensures handlePlayPreviewVoice knows to auto-resume listening after playback
    autoListenRef.current = true;
    manualStopRef.current = false;
    criticalSpeechErrorRef.current = false;
    suppressAutoRestartRef.current = false;
    
    setSimulationStarted(true);
    setSimulationStartTime(new Date());
    setTurnState('agent');
    setShowEvaluationReport(false);
    setEvaluationReport(null);
    turnStartTimeRef.current = Date.now();
    
    // Reset session memory
    setSessionMemory({
      userGoal: previewScenario === 'cold-call' ? 'Schedule a meeting' : 
                previewScenario === 'follow-up' ? 'Continue previous conversation' :
                previewScenario === 'objection' ? 'Handle objections' : 'Get past gatekeeper',
      prospectSignals: [],
      agentClaims: [],
      questionsAsked: [],
      objectionsDetected: [],
      commitments: [],
      complianceSignals: [],
      unresolvedItems: [],
    });
    
    // Reset reasoning panel
    setReasoningPanel({
      understanding: {
        currentObjective: 'Confirm prospect identity and establish rapport',
        prospectCareAbout: 'Unknown - needs discovery',
        confidence: 'medium',
      },
      strategy: {
        chosenApproach: 'Professional, consultative opening',
        nextBestMove: 'Ask an open-ended question about their current challenges',
      },
      riskCompliance: {
        flags: [],
        toneCheck: 'executive-grade',
      },
      evidence: [],
    });
    
    const openingMsg: PreviewMessage = {
      role: 'assistant',
      content: previewOpeningMessage,
      timestamp: new Date(),
      stage: 'opening',
    };
    
    setPreviewMessages([openingMsg]);
    setConversationAnalysis({
      stage: 'opening',
      turnGoal: 'Greet prospect and confirm identity',
      confidence: 100,
      userIntent: 'neutral',
      issues: [],
      suggestions: [],
    });
    
    // Auto-play opening message - mic will start after playback ends
    if (autoPlayVoice && previewVoice) {
      void handlePlayPreviewVoice(previewOpeningMessage);
    } else if (speechSupported) {
      // No audio to play, start listening immediately
      // Use ref to avoid circular dependency (startListening defined later in file)
      startListeningRef.current();
    }
  }, [previewOpeningMessage, previewScenario, autoPlayVoice, previewVoice, toast, handlePlayPreviewVoice, speechSupported]);

  const handleResetPreview = () => {
    setSimulationStarted(false);
    setSimulationStartTime(null);
    setTurnState('agent');
    setShowEvaluationReport(false);
    setEvaluationReport(null);
    setConversationAnalysis({
      stage: 'opening',
      turnGoal: 'Greet prospect and confirm identity',
      confidence: 100,
      userIntent: 'neutral',
      issues: [],
      suggestions: [],
    });
    
    // Reset session memory
    setSessionMemory({
      userGoal: '',
      prospectSignals: [],
      agentClaims: [],
      questionsAsked: [],
      objectionsDetected: [],
      commitments: [],
      complianceSignals: [],
      unresolvedItems: [],
    });
    
    // Reset reasoning panel
    setReasoningPanel({
      understanding: {
        currentObjective: 'Confirm prospect identity and establish rapport',
        prospectCareAbout: 'Unknown - needs discovery',
        confidence: 'medium',
      },
      strategy: {
        chosenApproach: 'Professional, consultative opening',
        nextBestMove: 'Ask an open-ended question about their current challenges',
      },
      riskCompliance: {
        flags: [],
        toneCheck: 'executive-grade',
      },
      evidence: [],
    });
    
    if (previewOpeningMessage) {
      setPreviewMessages([{ role: 'assistant', content: previewOpeningMessage, timestamp: new Date(), stage: 'opening' }]);
    } else {
      setPreviewMessages([]);
    }
    setPreviewInput('');
    setPreviewSessionId(undefined); // Reset session ID for new conversation
    lastAssistantSpokenRef.current = "";
    lastAssistantSpokenAtRef.current = 0;
    assistantPlaybackUntilRef.current = 0;
    lastTranscriptRef.current = "";
    lastTranscriptAtRef.current = 0;
    voiceInitializedRef.current = false; // Allow re-initialization on next start
  };

  // End preview and generate report
  const handleEndPreview = useCallback(() => {
    if (previewMessages.length  {
    // Check at least one prompt is configured
    if (!previewPromptVariants.some(p => p.trim())) {
      toast({
        title: "No prompts configured",
        description: "Configure at least one prompt variant to start simulation",
        variant: "destructive",
      });
      return;
    }

    // Initialize all panels with opening message (with variable substitution)
    const rawOpeningMessage = previewOpeningMessage || DEFAULT_FIRST_MESSAGE;
    const openingMessage = applyPreviewValues(rawOpeningMessage, previewValues);
    setSimulationPanels(prev => prev.map((panel, idx) => ({
      ...panel,
      sessionId: `side-by-side-${idx}-${Date.now()}`,
      messages: previewPromptVariants[idx]?.trim()
        ? [{ role: 'assistant' as const, content: openingMessage, timestamp: new Date(), stage: 'opening' as ConversationStage }]
        : [],
      turnState: 'user' as TurnState,
      isPending: false,
      error: null,
      evaluationReport: null,
    })) as [SimulationPanelState, SimulationPanelState, SimulationPanelState]);

    setSimulationStarted(true);
    setSimulationStartTime(new Date());

    toast({
      title: "Simulation started",
      description: "All panels are ready. Type or speak your response.",
    });
  }, [previewPromptVariants, previewOpeningMessage, previewValues, toast]);

  // Send message to all panels in parallel
  const handleSendToAllPanels = useCallback(async (overrideMessage?: string) => {
    const message = (overrideMessage ?? previewInput).trim();
    if (!message || !simulationStarted) return;

    // Add user message to all panels and set them to thinking
    setSimulationPanels(prev => prev.map((panel, idx) => {
      // Skip panels without prompts
      if (!previewPromptVariants[idx]?.trim()) return panel;

      const userMsg: PreviewMessage = {
        role: 'user',
        content: message,
        timestamp: new Date(),
      };
      return {
        ...panel,
        messages: [...panel.messages, userMsg],
        turnState: 'thinking' as TurnState,
        isPending: true,
        error: null,
      };
    }) as [SimulationPanelState, SimulationPanelState, SimulationPanelState]);

    setPreviewInput('');

    // Build API calls for all 3 panels
    const apiCalls = simulationPanels.map(async (panel, index) => {
      const rawPromptForPanel = previewPromptVariants[index];
      if (!rawPromptForPanel?.trim()) {
        return { status: 'skipped' as const, panelIndex: index };
      }

      // Apply variable substitution to the prompt
      const promptForPanel = applyPreviewValues(rawPromptForPanel, previewValues);
      const openingMessage = previewOpeningMessage || (testCallAgent?.firstMessage ? applyPreviewValues(testCallAgent.firstMessage, previewValues) : undefined);

      try {
        const response = await apiRequest('POST', '/api/virtual-agents/preview-conversation', {
          sessionId: panel.sessionId,
          virtualAgentId: testCallAgent?.id,
          campaignId: testCallAgentCampaignId || undefined,
          systemPrompt: promptForPanel,
          firstMessage: openingMessage,
          messages: [...panel.messages, { role: 'user', content: message }].map(m => ({ role: m.role, content: m.content })),
          provider: previewProvider,
          envVars: previewEnvVars.reduce((acc, curr) => ({...acc, [curr.key]: curr.value}), {} as Record),
        });
        const data = await response.json();
        return { status: 'success' as const, panelIndex: index, data };
      } catch (error: any) {
        return { status: 'error' as const, panelIndex: index, error: error.message || 'Request failed' };
      }
    });

    // Execute all API calls in parallel
    const results = await Promise.allSettled(apiCalls);

    // Update each panel with its result
    setSimulationPanels(prev => {
      const newPanels = [...prev] as [SimulationPanelState, SimulationPanelState, SimulationPanelState];
      results.forEach((result, index) => {
        if (result.status === 'fulfilled') {
          const value = result.value;
          if (value.status === 'success' && value.data?.reply) {
            const assistantMsg: PreviewMessage = {
              role: 'assistant',
              content: value.data.reply,
              timestamp: new Date(),
            };
            newPanels[index] = {
              ...newPanels[index],
              isPending: false,
              turnState: 'user',
              messages: [...newPanels[index].messages, assistantMsg],
            };
          } else if (value.status === 'error') {
            newPanels[index] = {
              ...newPanels[index],
              isPending: false,
              turnState: 'user',
              error: value.error,
            };
          } else if (value.status === 'skipped') {
            newPanels[index] = {
              ...newPanels[index],
              isPending: false,
            };
          }
        } else {
          // Promise rejected
          newPanels[index] = {
            ...newPanels[index],
            isPending: false,
            turnState: 'user',
            error: 'Request failed',
          };
        }
      });
      return newPanels;
    });
  }, [previewInput, simulationStarted, simulationPanels, previewPromptVariants, previewValues, testCallAgent, testCallAgentCampaignId, previewOpeningMessage, previewProvider, previewEnvVars]);

  // End simulation and show comparison
  const handleEndAndCompare = useCallback(() => {
    // Generate evaluation reports for each panel
    setSimulationPanels(prev => prev.map((panel, idx) => {
      if (panel.messages.length  {
    setSimulationPanels([
      createEmptyPanelState(0),
      createEmptyPanelState(1),
      createEmptyPanelState(2),
    ]);
    setSimulationStarted(false);
    setSimulationStartTime(null);
    setShowComparisonOverlay(false);
    setPreviewInput('');
  }, []);

  // ============================================================================
  // END SIDE-BY-SIDE HANDLERS
  // ============================================================================

  const handleSendPreview = useCallback(async (overrideMessage?: string) => {
    if (!testCallAgent) return;
    const message = (overrideMessage ?? previewInput).trim();
    if (!message) return;

    // Track turn duration
    const turnDuration = turnStartTimeRef.current ? Date.now() - turnStartTimeRef.current : 0;
    const userIntent = detectUserIntent(message);
    const currentStage = analyzeConversationStage(previewMessages);

    const userMsg: PreviewMessage = {
      role: 'user',
      content: message,
      timestamp: new Date(),
      stage: currentStage,
      turnDuration,
      intent: userIntent,
    };

    const nextMessages: PreviewMessage[] = [...previewMessages, userMsg];
    
    // Detect identity confirmation on first user response
    if (previewMessages.length  msgLower.includes(pattern))) {
        setRightPartyStatus('right-party');
      }
    }

    if (!overrideMessage) {
      setPreviewInput('');
    }
    setPreviewMessages(nextMessages);
    setTurnState('thinking');
    turnStartTimeRef.current = Date.now();
    
    // Update session memory with user message
    updateSessionMemory(userMsg, nextMessages);

    try {
      const data = await previewConversationMutation.mutateAsync({
        sessionId: previewSessionId, // Use session ID for persistent conversation state
        virtualAgentId: testCallAgent.id,
        campaignId: testCallAgentCampaignId || undefined,
        systemPrompt: previewSystemPrompt || undefined,
        firstMessage: previewOpeningMessage || undefined,
        messages: nextMessages.map(m => ({
          role: m.role,
          content: m.content,
          timestamp: m.timestamp ?? new Date(),
          stage: m.stage,
          turnDuration: m.turnDuration,
        })),
        provider: previewProvider,
        envVars: previewEnvVars.reduce((acc, curr) => ({...acc, [curr.key]: curr.value}), {} as Record),
      });

      // Store session ID if returned (prevents conversation resets)
      if (data?.sessionId && !previewSessionId) {
        setPreviewSessionId(data.sessionId);
      }

      if (data?.reply) {
        const newStage = analyzeConversationStage([...nextMessages, { role: 'assistant', content: data.reply, timestamp: new Date() }]);
        const { issues, suggestions } = analyzeAgentResponse(data.reply, newStage);
        
        const assistantMsg: PreviewMessage = {
          role: 'assistant',
          content: data.reply,
          timestamp: new Date(),
          stage: newStage,
          turnDuration: Date.now() - turnStartTimeRef.current,
        };
        
        const updatedMessages = [...nextMessages, assistantMsg];
        setPreviewMessages(updatedMessages);
        setTurnState('agent');
        
        // Update conversation analysis
        setConversationAnalysis({
          stage: newStage,
          turnGoal: getStageGoal(newStage),
          confidence: Math.max(60, 100 - (issues.length * 15)),
          userIntent,
          issues,
          suggestions,
        });
        
        // Update session memory with agent message
        updateSessionMemory(assistantMsg, updatedMessages);
        
        // Update reasoning panel
        updateReasoningPanel(newStage, userIntent, updatedMessages, issues);
        
        if (autoPlayVoice && testCallAgent.voice) {
          void handlePlayPreviewVoice(data.reply);
        }
        
        // Set turn to user after agent finishes
        turnStartTimeRef.current = Date.now();
      }
    } catch {
      setTurnState('user');
      // Error is handled by mutation onError toast.
    }
  }, [
    autoPlayVoice,
    previewConversationMutation,
    previewInput,
    previewMessages,
    previewOpeningMessage,
    previewSessionId,
    previewSystemPrompt,
    testCallAgent,
    analyzeConversationStage,
    analyzeAgentResponse,
    detectUserIntent,
    getStageGoal,
    updateSessionMemory,
    updateReasoningPanel,
    previewProvider,
    previewEnvVars,
    handlePlayPreviewVoice,
  ]);

  const startListening = useCallback(() => {
    // Guard: Don't start if manually stopped or dialog is closed
    if (manualStopRef.current) {
      console.log('[Voice Preview] startListening blocked: manualStopRef is true');
      return;
    }
    // CRITICAL: Check ref first - it's more reliable than state
    if (speechRecognitionRef.current) {
      console.log('[Voice Preview] startListening blocked: recognition already active (ref exists)');
      return;
    }
    if (isListening) {
      console.log('[Voice Preview] startListening blocked: already listening');
      return;
    }
    // Note: Removed audio playback guard - it was causing issues on fresh start
    // The auto-restart logic in onend will still respect playback lock
    const speechApi = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!speechApi) {
      console.log('[Voice Preview] startListening blocked: no speech API available');
      return;
    }

    if (restartTimeoutRef.current) {
      clearTimeout(restartTimeoutRef.current);
      restartTimeoutRef.current = null;
    }

    console.log('[Voice Preview] Starting speech recognition...');
    
    // Create fresh recognition instance to avoid stale state
    const recognition = new speechApi();
    recognition.lang = previewLanguage;
    recognition.interimResults = false; // Only final results for reliability
    recognition.continuous = false; // Single-utterance mode; auto-restart handles next turn
    recognition.maxAlternatives = 1;

    recognition.onaudiostart = () => {
      console.log('[Voice Preview] 🎤 Audio capture started - microphone is active');
    };
    
    recognition.onsoundstart = () => {
      console.log('[Voice Preview] 🔊 Sound detected by microphone');
    };
    
    recognition.onspeechstart = () => {
      console.log('[Voice Preview] 🗣️ Speech detected - user is speaking');
    };
    
    recognition.onspeechend = () => {
      console.log('[Voice Preview] Speech ended');
    };
    
    recognition.onsoundend = () => {
      console.log('[Voice Preview] Sound ended');
    };
    
    recognition.onaudioend = () => {
      console.log('[Voice Preview] Audio capture ended');
    };

    recognition.onresult = (event: any) => {
      const resultIndex = Number.isInteger(event?.resultIndex)
        ? event.resultIndex
        : (event?.results?.length || 1) - 1;
      const result = event?.results?.[resultIndex];
      if (result && result.isFinal === false) {
        return;
      }
      const transcript = result?.[0]?.transcript?.trim();
      console.log('[Voice Preview] Got transcript:', transcript);
      if (!transcript) return;
      const now = Date.now();
      if (lastTranscriptRef.current === transcript && now - lastTranscriptAtRef.current  4000) {
          lastEchoNoticeAtRef.current = now;
          toast({
            title: "Ignored echoed audio",
            description: "Heard the agent playback. Use headphones or pause the mic while audio plays.",
          });
        }
        return;
      }
      if (normalizedTranscript && normalizedAssistant) {
        const isRecent = now - lastAssistantSpokenAtRef.current = ECHO_MIN_LENGTH
          && normalizedAssistant.length >= ECHO_MIN_LENGTH;
        const isEchoMatch = hasEnoughLength
          && (normalizedAssistant.includes(normalizedTranscript)
            || normalizedTranscript.includes(normalizedAssistant));
        if (isRecent && isEchoMatch) {
          if (now - lastEchoNoticeAtRef.current > 4000) {
            lastEchoNoticeAtRef.current = now;
            toast({
              title: "Ignored echoed audio",
              description: "Heard the agent playback. Use headphones or pause the mic while audio plays.",
            });
          }
          return;
        }
      }
      if (autoSendVoice) {
        // In side-by-side mode, broadcast to all panels
        if (sideBySideMode) {
          // Pass transcript directly to avoid React batching state issues
          handleSendToAllPanels(transcript);
        } else {
          handleSendPreview(transcript);
        }
      } else {
        setPreviewInput((current) => (current ? `${current} ${transcript}` : transcript));
      }
    };

    recognition.onerror = (event: any) => {
      setIsListening(false);
      if (speechRecognitionRef.current === recognition) {
        speechRecognitionRef.current = null;
      }
      const errorType = event?.error || 'unknown';
      console.log('[Voice Preview] Error event:', errorType, event);
      
      // Don't show toasts for benign/expected errors
      // 'no-speech' - user didn't say anything (normal)
      // 'aborted' - recognition was intentionally stopped
      // 'network' can happen transiently
      if (errorType === 'no-speech') {
        console.log('[Voice Preview] No speech detected - this is normal, will auto-restart');
        return; // Silently ignore these common non-critical errors
      }
      if (errorType === 'aborted') {
        console.log('[Voice Preview] Recognition aborted (intentional stop)');
        suppressAutoRestartRef.current = true;
        return;
      }
      
      // Mark critical errors to stop auto-restart loop
      const isCriticalError = ['not-allowed', 'audio-capture', 'service-not-allowed'].includes(errorType);
      if (isCriticalError) {
        criticalSpeechErrorRef.current = true;
      }
      
      // For critical errors, show a toast but with rate limiting
      const now = Date.now();
      if (now - lastEchoNoticeAtRef.current  {
      console.log('[Voice Preview] Recognition ended');
      setIsListening(false);
      if (speechRecognitionRef.current === recognition) {
        speechRecognitionRef.current = null;
      }
      if (suppressAutoRestartRef.current) {
        console.log('[Voice Preview] Auto-restart suppressed');
        suppressAutoRestartRef.current = false;
        return;
      }
      // In continuous mode, only restart if there was an error - not after normal operation
      // This prevents the abort/restart loop
      if (autoListenRef.current && !manualStopRef.current && !criticalSpeechErrorRef.current) {
        console.log('[Voice Preview] Recognition ended unexpectedly - restarting in 500ms...');
        if (restartTimeoutRef.current) {
          return;
        }
        restartTimeoutRef.current = window.setTimeout(() => {
          restartTimeoutRef.current = null;
          if (!speechRecognitionRef.current) { // Only restart if not already running
            startListening();
          }
        }, 500);
      }
    };

    speechRecognitionRef.current = recognition;

    try {
      recognition.start();
      setIsListening(true);
      console.log('[Voice Preview] Recognition started successfully - listening now');
    } catch (err) {
      console.error('[Voice Preview] Failed to start recognition:', err);
      setIsListening(false);
      toast({
        title: "Voice capture failed",
        description: "Could not start speech recognition. Check microphone permissions.",
        variant: "destructive",
      });
    }
  }, [autoSendVoice, handleSendPreview, handleSendToAllPanels, isListening, previewLanguage, sideBySideMode, toast]);

  useEffect(() => {
    startListeningRef.current = startListening;
  }, [startListening]);

  const handleVoiceToggle = () => {
    if (!speechSupported) {
      toast({
        title: "Voice input unavailable",
        description: "Your browser does not support speech recognition.",
        variant: "destructive",
      });
      return;
    }

    const speechApi = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!speechApi) {
      toast({
        title: "Voice input unavailable",
        description: "Speech recognition API not found in this browser.",
        variant: "destructive",
      });
      return;
    }

    if (isListening) {
      manualStopRef.current = true;
      stopListening();
      return;
    }

    // Reset critical error flag when user manually starts listening (to allow retry)
    criticalSpeechErrorRef.current = false;
    manualStopRef.current = false;
    suppressAutoRestartRef.current = false;
    startListening();
  };

  useEffect(() => {
    console.log('[Voice Preview] useEffect triggered - testCallAgent:', !!testCallAgent, 'speechSupported:', speechSupported, 'simulationStarted:', simulationStarted, 'sideBySideMode:', sideBySideMode, 'alreadyInitialized:', voiceInitializedRef.current);

    // Voice works in single mode with testCallAgent OR in side-by-side mode without testCallAgent
    const hasAgentOrSideBySide = testCallAgent || sideBySideMode;
    if (!hasAgentOrSideBySide || !speechSupported || !simulationStarted) {
      console.log('[Voice Preview] useEffect early return - missing requirements');
      // Reset initialized flag when dialog closes
      if (!simulationStarted) {
        voiceInitializedRef.current = false;
      }
      return;
    }
    
    // CRITICAL: Prevent re-initialization if already started
    if (voiceInitializedRef.current) {
      console.log('[Voice Preview] Already initialized, skipping...');
      return;
    }
    
    // Mark as initialized IMMEDIATELY to prevent race conditions
    voiceInitializedRef.current = true;
    console.log('[Voice Preview] First initialization - setting up voice...');
    
    // Reset all flags BEFORE starting to listen
    autoListenRef.current = true;
    manualStopRef.current = false;
    criticalSpeechErrorRef.current = false;
    suppressAutoRestartRef.current = false;
    lastTranscriptRef.current = "";
    lastTranscriptAtRef.current = 0;
    if (restartTimeoutRef.current) {
      clearTimeout(restartTimeoutRef.current);
      restartTimeoutRef.current = null;
    }
    
    // Reset audio playback refs - they might be stale from previous session
    playbackLockRef.current = false;
    if (audioPlaybackRef.current) {
      try {
        audioPlaybackRef.current.pause();
        audioPlaybackRef.current.src = '';
        audioPlaybackRef.current = null;
      } catch {
        // Ignore
      }
    }
    
    // Start listening directly - Speech Recognition API handles mic permission itself
    const timeoutId = setTimeout(() => {
      console.log('[Voice Preview] Starting listening (initial)...');
      startListening();
    }, 300);
    
    return () => {
      clearTimeout(timeoutId);
      // Only cleanup when simulation actually ends (not on every effect rerun)
      // This cleanup only runs when this specific effect dependency changes
      if (!simulationStarted) {
        console.log('[Voice Preview] Simulation ended, cleaning up...');
        voiceInitializedRef.current = false; // Allow re-initialization on next open
        autoListenRef.current = false;
        manualStopRef.current = true; // Prevent restart
        suppressAutoRestartRef.current = true;
        if (restartTimeoutRef.current) {
          clearTimeout(restartTimeoutRef.current);
          restartTimeoutRef.current = null;
        }
        
        // Stop speech recognition
        try {
          if (speechRecognitionRef.current) {
            speechRecognitionRef.current.abort(); // Use abort() for immediate stop
            speechRecognitionRef.current = null;
          }
        } catch {
          // Ignore cleanup errors
        }
        
        // Stop any audio playback
        try {
          if (audioPlaybackRef.current) {
            audioPlaybackRef.current.pause();
            audioPlaybackRef.current.src = '';
            audioPlaybackRef.current = null;
          }
          playbackLockRef.current = false;
        } catch {
          // Ignore cleanup errors
        }
      }
    };
  }, [testCallAgent?.id, speechSupported, simulationStarted, sideBySideMode]);

  useEffect(() => {
    if (lastPreviewLanguageRef.current === previewLanguage) {
      return;
    }
    lastPreviewLanguageRef.current = previewLanguage;
    if (!isListening) return;
    stopListening();
    startListening();
  }, [previewLanguage, isListening, startListening, stopListening]);

  return (
    
      
        
          
            
            Virtual Agents
          
          
            Manage AI agent personas for hybrid campaigns
          
        
        
          {/* Primary: Simple Create Dialog - matches Edit flow */}
           {
              setFormData(defaultFormData);
              setPreviewTools(['detect_voicemail_and_hangup']);
              setIsCreateOpen(true);
              setCreationMode('manual');
            }}
          >
            
            Create New Agent
          
          {/* Secondary: Skill-Based Create Dialog */}
          
            
              
                
                Skill-Based
              
            
          
            {creationMode === 'manual' ? (
              /* Simple Create Form - matches Edit flow */
              <>
                
                  
                    
                      Create AI Voice Agent
                      
                        Configure your AI agent's voice and behavior
                      
                    
                    
                       setCreationMode('skill')}>
                        
                        Use Skill-Based
                      
                      
                        Cancel
                      
                      
                        {createMutation.isPending ? (
                          
                        ) : null}
                        Create Agent
                      
                    
                  
                
                
              
            ) : (
              /* Skill-Based Creation */
              <>
                
                  
                    Create AI Voice Agent - Skill-Based
                    
                      Create an agent from a pre-defined skill template
                    
                  
                
                
                  
                     setCreationMode('manual')}>
                      
                      Switch to Manual
                    
                  
                  
                
              
            )}
          
        
        
      

      
        
          
            Total Agents
            
          
          
            {agents.length}
          
        
        
          
            Active
            
          
          
            {activeAgents.length}
          
        
        
          
            Inactive
            
          
          
            {inactiveAgents.length}
          
        
      

      
        
          AI Agents List
          
            Each virtual agent can be assigned to campaigns alongside human agents
          
        
        
          {isLoading ? (
            
              {[1, 2, 3].map(i => (
                
              ))}
            
          ) : agents.length === 0 ? (
            
              
              No virtual agents configured yet
              Create your first AI agent to get started
            
          ) : (
            
              
                
                  Agent
                  Type
                  Provider
                  Voice
                  Status
                  Created
                  
                
              
              
                {isLoading ? (
                  
                    
                      
                        
                        Loading agents...
                      
                    
                  
                ) : (agents || []).length === 0 ? (
                  
                    
                      No agents found. Create your first agent to get started.
                    
                  
                ) : (
                  (agents || []).map(agent => (
                  
                    
                      
                        
                          
                        
                        
                          
                            {agent.name}
                            {agent.isFoundationAgent && (
                              
                                
                                Foundation
                              
                            )}
                          
                          {agent.description && (
                            
                              {agent.description}
                            
                          )}
                          {agent.isFoundationAgent && agent.foundationCapabilities && agent.foundationCapabilities.length > 0 && (
                            
                              {agent.foundationCapabilities.slice(0, 3).map((cap) => (
                                
                                  {cap.replace(/_/g, ' ')}
                                
                              ))}
                              {agent.foundationCapabilities.length > 3 && (
                                
                                  +{agent.foundationCapabilities.length - 3} more
                                
                              )}
                            
                          )}
                        
                      
                    
                    
                      
                        {AGENT_TYPE_OPTIONS.find(t => t.value === (agent.demandAgentType || 'demand_qual'))?.label || 'Voice Agent'}
                      
                    
                    
                      
                        {agent.provider}
                      
                    
                    
                      {agent.voice || 'Default'}
                    
                    
                      
                        {agent.isActive ? "Active" : "Inactive"}
                      
                    
                    
                      {format(new Date(agent.createdAt), 'MMM d, yyyy')}
                    
                    
                      
                        
                          
                            
                          
                        
                        
                           handleEdit(agent)}>
                            
                            Edit
                          
                           {
                            setAgentToClone(agent);
                            setCloneName(`${agent.name} (Copy)`);
                            setCloneDialogOpen(true);
                          }}>
                            
                            Duplicate
                          
                           toggleActiveMutation.mutate({
                              id: agent.id,
                              isActive: !agent.isActive
                            })}
                          >
                            {agent.isActive ? (
                              <>
                                
                                Deactivate
                              
                            ) : (
                              <>
                                
                                Activate
                              
                            )}
                          
                           setLocation('/preview-studio')}>
                            
                            Preview Studio
                          
                           setDeleteAgent(agent)}
                            className="text-destructive focus:text-destructive"
                          >
                            
                            Delete
                          
                        
                      
                    
                  
                )))}
              
            
          )}
        
      

       !open && handleCloseDialog()}>
        
          
            
              
                Edit Virtual Agent
                
                  Update the AI agent configuration
                
              
              
                
                  Cancel
                
                
                  {updateMutation.isPending ? (
                    
                  ) : null}
                  Save Changes
                
              
            
          
          
        
      

       !open && setDeleteAgent(null)}>
        
          
            Delete Virtual Agent
            
              Are you sure you want to delete "{deleteAgent?.name}"? This action cannot be undone.
              Agents with active campaign assignments cannot be deleted.
            
          
          
            Cancel
             deleteAgent && deleteMutation.mutate(deleteAgent.id)}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleteMutation.isPending ? (
                
              ) : (
                "Delete"
              )}
            
          
        
      

      {/* Clone/Duplicate Dialog */}
       {
        if (!open) {
          setCloneDialogOpen(false);
          setAgentToClone(null);
          setCloneName("");
        }
      }}>
        
          
            Duplicate Virtual Agent
            
              Create a copy of "{agentToClone?.name}" with all its settings.
            
          
          
            
              New Agent Name
               setCloneName(e.target.value)}
                placeholder="Enter name for the new agent"
              />
            
          
          
             setCloneDialogOpen(false)}>
              Cancel
            
             agentToClone && cloneMutation.mutate({
                id: agentToClone.id,
                name: cloneName || undefined,
              })}
              disabled={cloneMutation.isPending}
            >
              {cloneMutation.isPending ? (
                
              ) : (
                
              )}
              Duplicate
            
          
        
      

      {/* Agent Preview Lab Dialog */}
       {
          if (!open) {
            // CRITICAL: Stop all audio/speech BEFORE clearing state
            autoListenRef.current = false;
            manualStopRef.current = true;
            suppressAutoRestartRef.current = true;
            if (restartTimeoutRef.current) {
              clearTimeout(restartTimeoutRef.current);
              restartTimeoutRef.current = null;
            }
            
            // Immediately abort speech recognition
            try {
              if (speechRecognitionRef.current) {
                speechRecognitionRef.current.abort();
                speechRecognitionRef.current = null;
              }
            } catch {
              // Ignore errors
            }
            setIsListening(false);
            
            // Stop any audio playback
            try {
              if (audioPlaybackRef.current) {
                audioPlaybackRef.current.pause();
                audioPlaybackRef.current.src = '';
                audioPlaybackRef.current = null;
              }
              playbackLockRef.current = false;
            } catch {
              // Ignore errors
            }
            
            // Now clear state
            setTestCallAgent(null);
            setPreviewMessages([]);
            setPreviewInput('');
            setSimulationStarted(false);
            setSimulationStartTime(null);
            setShowEvaluationReport(false);
            setEvaluationReport(null);
            setLearnings([]);
            // Reset side-by-side state
            setSideBySideMode(false);
            setSimulationPanels([
              createEmptyPanelState(0),
              createEmptyPanelState(1),
              createEmptyPanelState(2),
            ]);
            setShowComparisonOverlay(false);
          }
        }}
      >
        
          
            
              
                
                  
                  Agent Preview Lab
                  {sideBySideMode && Side-by-Side}
                
                
                  {sideBySideMode
                    ? "Compare up to 3 prompt variants simultaneously. Your input broadcasts to all panels."
                    : "Full-conversation simulation. You are the prospect. No phone calls are placed."
                  }
                
              
              
                {/* Mode Toggle */}
                
                   {
                      if (simulationStarted) return;
                      setSideBySideMode(false);
                    }}
                    disabled={simulationStarted}
                  >
                    Single
                  
                   {
                      if (simulationStarted) return;
                      setSideBySideMode(true);
                      // Reset panels when switching to side-by-side
                      setSimulationPanels([
                        createEmptyPanelState(0),
                        createEmptyPanelState(1),
                        createEmptyPanelState(2),
                      ]);
                    }}
                    disabled={simulationStarted}
                  >
                    Side-by-Side
                  
                
                {!sideBySideMode && (
                  <>
                    {/* Preview Mode Selector */}
                     setPreviewMode(v as PreviewMode)}>
                      
                        
                      
                      
                        Training Mode
                        Realism Mode
                        Stress Test
                      
                    
                  
                )}
                
                  {simulationStarted ? "Live Simulation" : "Ready"}
                
              
            
          

          {/* ============================================================ */}
          {/* SIDE-BY-SIDE MODE LAYOUT                                     */}
          {/* ============================================================ */}
          {sideBySideMode && (
            
              {/* Shared Config Bar */}
              
                
                  Provider:
                   setPreviewProvider(v)}>
                    
                    
                      OpenAI
                      Gemini
                    
                  
                
                
                  Voice:
                  
                    
                    
                      {previewProvider === 'openai' ? (
                        <>
                          Alloy
                          Echo
                          Nova
                          Shimmer
                        
                      ) : (
                        <>
                          Puck
                          Kore
                          Aoede
                        
                      )}
                    
                  
                
                
                  Scenario:
                   setPreviewScenario(v as PreviewScenario)}>
                    
                    
                      Cold Call
                      Follow-up
                      Objection
                      Gatekeeper
                    
                  
                
                {testCallAgentCampaigns.length > 0 && (
                  
                    Campaign:
                     setTestCallAgentCampaignId(v === "none" ? null : v)}
                    >
                      
                      
                        No campaign
                        {testCallAgentCampaigns.map((c) => (
                          
                            {c.campaignName}
                          
                        ))}
                      
                    
                  
                )}
              

              {/* Variables Panel (Collapsible) */}
              {previewTokens.length > 0 && (
                
                  
                    
                      
                      Variables
                      {previewTokens.length}
                      {missingPreviewTokens.length > 0 && (
                        {missingPreviewTokens.length} missing
                      )}
                    
                  
                  
                    
                      {previewTokens.map((token) => (
                        
                          
                            {token}
                          
                          
                              setPreviewValues({
                                ...previewValues,
                                [token]: e.target.value,
                              })
                            }
                            placeholder={token}
                            className="h-7 text-xs"
                            disabled={simulationStarted}
                          />
                        
                      ))}
                    
                  
                
              )}

              {/* Prompt Configuration Row */}
              
                {([0, 1, 2] as const).map((idx) => {
                  const colors = PANEL_COLORS[idx];
                  return (
                    
                      Variant {idx + 1} Prompt
                       {
                          const newVariants = [...previewPromptVariants] as [string, string, string];
                          newVariants[idx] = e.target.value;
                          setPreviewPromptVariants(newVariants);
                        }}
                        placeholder={`System prompt for variant ${idx + 1}...`}
                        disabled={simulationStarted}
                      />
                    
                  );
                })}
              

              {/* View Final Assembled Prompts (after variable substitution) */}
              
                
                  
                    
                    View Final Assembled Prompts
                    
                      Variables Applied
                    
                  
                  
                
                
                  
                    {([0, 1, 2] as const).map((idx) => {
                      const colors = PANEL_COLORS[idx];
                      const rawPrompt = previewPromptVariants[idx]?.trim() || '';
                      const finalPrompt = rawPrompt ? applyPreviewValues(rawPrompt, previewValues) : '';
                      const hasChanges = rawPrompt !== finalPrompt;
                      return (
                        
                          
                            Variant {idx + 1} (Final)
                            {hasChanges && (
                              Variables Substituted
                            )}
                          
                          {finalPrompt ? (
                            
                              {finalPrompt}
                            
                          ) : (
                            
                              No prompt configured
                            
                          )}
                        
                      );
                    })}
                  
                
              

              {/* 3 Simulation Panels */}
              
                {([0, 1, 2] as const).map((idx) => (
                  
                ))}
              

              {/* Shared Input Area */}
              
                
                  
                    {isListening ?  : }
                  
                
                 setPreviewInput(e.target.value)}
                  placeholder={simulationStarted ? "Type your response (broadcasts to all panels)..." : "Start simulation first..."}
                  className="min-h-[50px] text-sm flex-1"
                  disabled={!simulationStarted}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' && !event.shiftKey) {
                      event.preventDefault();
                      handleSendToAllPanels();
                    }
                  }}
                />
                 handleSendToAllPanels()}
                  disabled={!simulationStarted || !previewInput.trim() || simulationPanels.some(p => p.isPending)}
                >
                  {simulationPanels.some(p => p.isPending) ? (
                    
                  ) : (
                    
                  )}
                
              

              {/* Action Buttons */}
              
                {!simulationStarted ? (
                   p.trim())}>
                    
                    Start All Simulations
                  
                ) : (
                  
                    
                      
                      End & Compare
                    
                    
                      
                      Reset All
                    
                  
                )}
              

              {/* Comparison Overlay */}
              {showComparisonOverlay && (
                 setShowComparisonOverlay(false)}
                  onSelectWinner={(idx) => {
                    // Copy winning prompt to agent's system prompt
                    toast({
                      title: "Prompt Selected",
                      description: `Variant ${idx + 1} selected as winner. You can now apply it to your agent.`,
                    });
                    setShowComparisonOverlay(false);
                  }}
                />
              )}
            
          )}

          {/* ============================================================ */}
          {/* SINGLE MODE LAYOUT (Original)                                */}
          {/* ============================================================ */}
          {!sideBySideMode && (
          <>
          
            
              {/* Left Panel - Scenario Setup */}
              
                
                  Scenario Setup
                
                
                  {/* Provider & Env Vars */}
                  
                    
                      Provider
                       setPreviewProvider(v)}>
                        
                        
                          OpenAI
                          Gemini
                        
                      
                    
                    {/* Voice Selector */}
                    
                      Voice
                      
                        
                        
                           {previewProvider === 'openai' ? (
                              <>
                                Alloy
                                Echo
                                Fable
                                Onyx
                                Nova
                                Shimmer
                              
                           ) : (
                              <>
                                Puck
                                Charon
                                Kore
                                Fenrir
                                Aoede
                              
                           )}
                        
                      
                    
                     
                      Env Vars
                      
                          Edit ({previewEnvVars.length})
                          
                             Environment Variables
                             
                             
                                {previewEnvVars.map((ev, i) => (
                                    
                                         {
                                            const newVars = [...previewEnvVars];
                                            newVars[i].key = e.target.value;
                                            setPreviewEnvVars(newVars);
                                        }} placeholder="Key" />
                                         {
                                            const newVars = [...previewEnvVars];
                                            newVars[i].value = e.target.value;
                                            setPreviewEnvVars(newVars);
                                        }} placeholder="Value" />
                                         {
                                             const newVars = [...previewEnvVars];
                                             newVars.splice(i, 1);
                                             setPreviewEnvVars(newVars);
                                        }}>
                                    
                                ))}
                                 setPreviewEnvVars([...previewEnvVars, {key:'', value:''}])}>Add Variable
                             
                             
                          
                      
                    
                  

                  {/* System Prompt Variants */}
                  
                      
                        System Prompt
                        {activePromptVariant + 1}/3
                      
                       setActivePromptVariant(Number(v) as 0|1|2)}>
                        
                           Variant 1
                           Variant 2
                           Variant 3
                        
                        
                             {
                                    const newVariants = [...previewPromptVariants] as [string, string, string];
                                    newVariants[activePromptVariant] = e.target.value;
                                    setPreviewPromptVariants(newVariants);
                                }}
                                placeholder="Configure system prompt variant..."
                            />
                        
                      
                  

                  {previewTokens.length > 0 ? (
                    
                      
                        Variables
                        {previewTokens.length}
                      
                      
                        
                          {previewTokens.map((token) => (
                            
                              
                                {token}
                              
                              
                                  setPreviewValues({
                                    ...previewValues,
                                    [token]: e.target.value,
                                  })
                                }
                                placeholder={`${token}`}
                                className="h-8 text-sm"
                              />
                            
                          ))}
                        
                      
                    
                  ) : (
                    
                      No variables detected.
                    
                  )}

                  {/* View Final Assembled Prompt (single mode) */}
                  
                    
                      
                        
                        View Final Prompt
                      
                      
                    
                    
                      
                        
                          With variables substituted:
                          {previewSystemPrompt !== previewPromptVariants[activePromptVariant] && (
                            Variables Applied
                          )}
                        
                        
                          
                            {previewSystemPrompt || 'No prompt configured'}
                          
                        
                      
                    
                  

                  
                    {testCallAgent?.name}
                    
                      {testCallAgent?.provider} • {testCallAgent?.voice || 'Default'}
                    
                  

                  {/* Campaign Context Selector */}
                  {testCallAgentCampaigns.length > 0 && (
                    
                      Campaign Context
                       setTestCallAgentCampaignId(v === "none" ? null : v)}
                      >
                        
                          
                        
                        
                          No campaign context
                          {testCallAgentCampaigns.map((c) => (
                            
                              {c.campaignName} {c.isActive ? "" : "(inactive)"}
                            
                          ))}
                        
                      
                      
                        Campaign objective, talking points, and objections will be injected into the agent context.
                      
                    
                  )}

                  
                    Opening Line
                    
                      {previewOpeningMessage || "No opening line configured."}
                    
                  

                  {/* Start Simulation Button */}
                  {!simulationStarted && !showEvaluationReport ? (
                    
                      
                      Start Simulation
                    
                  ) : simulationStarted ? (
                    
                      
                        
                        End & Evaluate
                      
                      
                        
                        Cancel & Reset
                      
                    
                  ) : (
                     {
                        setShowEvaluationReport(false);
                        handleResetPreview();
                      }}
                    >
                      
                      New Simulation
                    
                  )}
                  
                  {/* Scenario Type Selector */}
                  
                    Scenario Type
                     setPreviewScenario(v as PreviewScenario)}>
                      
                        
                      
                      
                        📞 Cold Call
                        🔄 Follow-up
                        🛡️ Objection Drill
                        🚪 Gatekeeper
                      
                    
                  
                
              

              {/* Center Panel - Live Conversation */}
              
                
                  
                    Live Conversation
                    Speak naturally as the prospect.
                  
                  
                    
                      {turnState === 'agent' ? '🎙️ Agent Speaking' : turnState === 'thinking' ? '💭 Thinking...' : '👂 Your Turn'}
                    
                    
                      {isListening ?  : }
                    
                  
                
                
                  {/* Conversation Transcript */}
                  
                    {!simulationStarted ? (
                      
                        
                        Ready to simulate
                        Click "Start Simulation" to begin the call
                      
                    ) : previewMessages.length === 0 ? (
                      
                        Waiting for agent to speak...
                      
                    ) : (
                      
                        {previewMessages.map((message, index) => (
                          
                            
                            
                              
                                
                                  {message.role === 'user' ? 'You (Contact)' : 'Agent'}
                                
                                {message.timestamp && (
                                  
                                    {message.timestamp.toLocaleTimeString()}
                                  
                                )}
                                {previewMode === 'training' && message.stage && (
                                  
                                    {message.stage}
                                  
                                )}
                              
                              {message.content}
                              {message.role === 'assistant' && testCallAgent?.voice && (
                                 handlePlayPreviewVoice(message.content)}
                                >
                                  
                                
                              )}
                            
                          
                        ))}
                        {turnState === 'thinking' && (
                          
                            
                            Agent is thinking...
                          
                        )}
                      
                    )}
                  

                  {/* Voice Controls */}
                  
                    
                      
                        {isListening ?  : }
                        {isListening ? "Mute" : "Unmute"}
                      
                      
                        
                          
                        
                        
                          {PREVIEW_LANGUAGE_OPTIONS.map((option) => (
                            
                              {option.label}
                            
                          ))}
                        
                      
                    
                    
                      
                        
                        Auto-send
                      
                      
                        
                        Auto-play
                      
                    
                  

                  {/* Manual Input */}
                  
                     setPreviewInput(e.target.value)}
                      placeholder={simulationStarted ? "Type your response as the prospect..." : "Start simulation first..."}
                      className="min-h-[60px] text-sm"
                      disabled={!simulationStarted}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter' && !event.shiftKey) {
                          event.preventDefault();
                          handleSendPreview();
                        }
                      }}
                    />
                     handleSendPreview()}
                      disabled={!simulationStarted || previewConversationMutation.isPending || !previewInput.trim()}
                    >
                      {previewConversationMutation.isPending ? (
                        
                      ) : (
                        
                      )}
                    
                  
                
              

              {/* Right Panel - Agent Reasoning (Training Mode) */}
              {previewMode === 'training' && (
                
                  
                    
                      Agent Intelligence
                       setShowReasoningPanel(!showReasoningPanel)}
                      >
                        {showReasoningPanel ?  : }
                      
                    
                  
                  {showReasoningPanel && (
                    
                      {/* Tab Navigation */}
                      
                        {(['reasoning', 'memory', 'flags', 'score'] as const).map((tab) => (
                           setReasoningPanelTab(tab)}
                            className={`px-3 py-2 text-xs font-medium border-b-2 transition-colors ${
                              reasoningPanelTab === tab 
                                ? 'border-primary text-primary' 
                                : 'border-transparent text-muted-foreground hover:text-foreground'
                            }`}
                          >
                            {tab === 'reasoning' && '🧠 Reasoning'}
                            {tab === 'memory' && '📝 Memory'}
                            {tab === 'flags' && '⚠️ Flags'}
                            {tab === 'score' && '📊 Score'}
                          
                        ))}
                      
                      
                      
                        {/* Reasoning Tab */}
                        {reasoningPanelTab === 'reasoning' && (
                          
                            {/* Understanding Card */}
                            
                              
                                Understanding
                              
                              
                                
                                  Objective:
                                  {reasoningPanel.understanding.currentObjective}
                                
                                
                                  Prospect cares about:
                                  {reasoningPanel.understanding.prospectCareAbout}
                                
                                
                                  Confidence:
                                  
                                    {reasoningPanel.understanding.confidence}
                                  
                                
                              
                            

                            {/* Strategy Card */}
                            
                              
                                Strategy
                              
                              
                                
                                  Approach:
                                  {reasoningPanel.strategy.chosenApproach}
                                
                                
                                  Next move:
                                  {reasoningPanel.strategy.nextBestMove}
                                
                              
                            

                            {/* Risk & Compliance Card */}
                             0 ? 'border-orange-300 bg-orange-50 dark:bg-orange-950/20' : ''
                            }`}>
                              
                                Risk & Compliance
                              
                              
                                
                                  Tone:
                                  
                                    {reasoningPanel.riskCompliance.toneCheck === 'executive-grade' ? '✓ Executive-grade' :
                                     reasoningPanel.riskCompliance.toneCheck === 'borderline' ? '⚠️ Borderline' : '✗ Needs revision'}
                                  
                                
                                {reasoningPanel.riskCompliance.flags.length > 0 && (
                                  
                                    {reasoningPanel.riskCompliance.flags.map((flag, i) => (
                                      
                                        {flag === 'too-pushy' && '🔥 Too pushy'}
                                        {flag === 'assumed-too-much' && '❓ Assumed too much'}
                                        {flag === 'needs-consent' && '⚖️ Needs consent'}
                                        {flag === 'length-risk' && '📏 Too long'}
                                      
                                    ))}
                                  
                                )}
                                {reasoningPanel.riskCompliance.flags.length === 0 && (
                                  No flags
                                )}
                              
                            

                            {/* Evidence Card */}
                            {reasoningPanel.evidence.length > 0 && (
                              
                                
                                  Evidence (User Inputs)
                                
                                
                                  {reasoningPanel.evidence.map((e, i) => (
                                    {e}
                                  ))}
                                
                              
                            )}
                          
                        )}

                        {/* Memory Tab */}
                        {reasoningPanelTab === 'memory' && (
                          
                            
                              Goal
                              {sessionMemory.userGoal || 'Not set'}
                            

                            {sessionMemory.prospectSignals.length > 0 && (
                              
                                Prospect Signals
                                
                                  {sessionMemory.prospectSignals.map((signal, i) => (
                                    {signal}
                                  ))}
                                
                              
                            )}

                            {sessionMemory.agentClaims.length > 0 && (
                              
                                Agent Claims
                                
                                  {sessionMemory.agentClaims.slice(-3).map((claim, i) => (
                                    • {claim}
                                  ))}
                                
                              
                            )}

                            {sessionMemory.questionsAsked.length > 0 && (
                              
                                Questions Asked
                                
                                  {sessionMemory.questionsAsked.slice(-3).map((q, i) => (
                                    {q}
                                  ))}
                                
                              
                            )}

                            {sessionMemory.objectionsDetected.length > 0 && (
                              
                                Objections
                                
                                  {sessionMemory.objectionsDetected.map((obj, i) => (
                                    
                                      
                                        {obj.objection}
                                      
                                      
                                        {obj.quality === 'good' ? '✓ Handled' : obj.quality === 'weak' ? '~ Weak' : '✗ Missed'}
                                      
                                    
                                  ))}
                                
                              
                            )}

                            {sessionMemory.commitments.length > 0 && (
                              
                                Commitments
                                
                                  {sessionMemory.commitments.map((c, i) => (
                                    ✓ {c}
                                  ))}
                                
                              
                            )}
                          
                        )}

                        {/* Flags Tab */}
                        {reasoningPanelTab === 'flags' && (
                          
                            {sessionMemory.complianceSignals.length > 0 ? (
                              sessionMemory.complianceSignals.map((signal, i) => (
                                
                                  
                                    
                                      {signal.type === 'pressure' && '🔥 Pressure'}
                                      {signal.type === 'consent' && '⚖️ Consent'}
                                      {signal.type === 'dnc' && '🚫 DNC'}
                                      {signal.type === 'assumption' && '❓ Assumption'}
                                    
                                  
                                  {signal.message}
                                   addLearningEntry(
                                      signal.type === 'pressure' ? 'compliance' : 'tone',
                                      signal.message,
                                      `Avoid ${signal.type} language`,
                                      signal.type === 'pressure' ? 'high' : 'medium'
                                    )}
                                  >
                                    📝 Note for learning
                                  
                                
                              ))
                            ) : (
                              
                                ✓
                                No compliance flags detected
                              
                            )}

                            {reasoningPanel.riskCompliance.flags.length > 0 && (
                              
                                Risk Flags
                                
                                  {reasoningPanel.riskCompliance.flags.map((flag, i) => (
                                    
                                      
                                        {flag === 'too-pushy' && '🔥 Too pushy'}
                                        {flag === 'assumed-too-much' && '❓ Assumed too much'}
                                        {flag === 'needs-consent' && '⚖️ Needs consent'}
                                        {flag === 'length-risk' && '📏 Response too long'}
                                      
                                       addLearningEntry(
                                          flag === 'too-pushy' ? 'tone' : 'compliance',
                                          flag.replace(/-/g, ' '),
                                          `Fix ${flag.replace(/-/g, ' ')} issue`,
                                          'medium'
                                        )}
                                      >
                                        📝 Note
                                      
                                    
                                  ))}
                                
                              
                            )}
                          
                        )}

                        {/* Score Tab */}
                        {reasoningPanelTab === 'score' && (
                          
                            {/* Live Score Preview */}
                            
                              
                                {Math.min(100, Math.max(0, 
                                  100 - (conversationAnalysis.issues.length * 10) - 
                                  (sessionMemory.complianceSignals.length * 5) +
                                  (sessionMemory.objectionsDetected.filter(o => o.quality === 'good').length * 5)
                                ))}
                              
                              Live Score (Estimated)
                            

                            
                              Breakdown
                              
                                
                                  Clarity
                                  
                                    {conversationAnalysis.issues.some(i => i.includes('long')) ? '⚠️ Verbose' : '✓ Clear'}
                                  
                                
                                
                                  Questions
                                  
                                    {sessionMemory.questionsAsked.length} asked
                                  
                                
                                
                                  Objections
                                  
                                    {sessionMemory.objectionsDetected.filter(o => o.quality === 'good').length}/
                                    {sessionMemory.objectionsDetected.length} handled
                                  
                                
                                
                                  Compliance
                                  
                                    {sessionMemory.complianceSignals.length === 0 ? '✓ Clean' : `⚠️ ${sessionMemory.complianceSignals.length} flags`}
                                  
                                
                              
                            

                            
                              End simulation for full scorecard
                            
                          
                        )}
                      

                      {/* Call Duration Footer */}
                      {simulationStartTime && (
                        
                          
                            Duration
                            
                              {Math.floor((Date.now() - simulationStartTime.getTime()) / 1000)}s
                            
                          
                        
                      )}
                    
                  )}
                
              )}
            
          

          {/* Evaluation Report Overlay */}
          {showEvaluationReport && evaluationReport && (
            
              
                {/* Header */}
                
                  
                    
                      📊 Evaluation Report
                    
                    
                      {testCallAgent?.name} - {new Date().toLocaleDateString()}
                    
                  
                  
                    {/* Voicemail Discipline Badge - CRITICAL */}
                    
                      {evaluationReport.voicemailDiscipline.passed ? '📵 Voicemail: PASS' : '🚨 Voicemail: FAIL'}
                    
                    {/* Humanity Badge */}
                    = 14 ? 'default' : 
                               evaluationReport.scorecard.humanity >= 10 ? 'secondary' : 'destructive'}
                      className="text-sm px-3 py-1"
                    >
                      {evaluationReport.scorecard.humanity >= 14 ? '🌿 Humanity: PASS' : 
                       evaluationReport.scorecard.humanity >= 10 ? '🌿 Humanity: FAIR' : '🌿 Humanity: FAIL'}
                    
                    {/* Intelligence Badge */}
                    = 10 ? 'default' : 
                               evaluationReport.scorecard.intelligence >= 7 ? 'secondary' : 'destructive'}
                      className="text-sm px-3 py-1"
                    >
                      {evaluationReport.scorecard.intelligence >= 10 ? '🧠 Intelligence: PASS' : 
                       evaluationReport.scorecard.intelligence >= 7 ? '🧠 Intelligence: FAIR' : '🧠 Intelligence: FAIL'}
                    
                    
                      {evaluationReport.executiveSummary.verdict === 'approve' && '✓ Approved'}
                      {evaluationReport.executiveSummary.verdict === 'needs-edits' && '⚠️ Needs Edits'}
                      {evaluationReport.executiveSummary.verdict === 'reject' && '✗ Rejected'}
                    
                     setShowEvaluationReport(false)}
                    >
                      
                    
                  
                

                {/* Score Card */}
                
                  
                    Performance Scorecard
                  
                  
                    
                      {/* Total Score */}
                      
                        = 108 ? 'text-green-600' :
                          evaluationReport.scorecard.total >= 81 ? 'text-yellow-600' : 'text-red-600'
                        }`}>
                          {evaluationReport.scorecard.total}
                        
                        / 135
                      
                      
                      {/* Score Breakdown */}
                      
                        {[
                          { label: 'Clarity', score: evaluationReport.scorecard.clarity, max: 20 },
                          { label: 'Authority', score: evaluationReport.scorecard.authority, max: 20 },
                          { label: 'Humanity & Warmth', score: evaluationReport.scorecard.humanity, max: 20, icon: '🌿' },
                          { label: 'Intelligence', score: evaluationReport.scorecard.intelligence, max: 15, icon: '🧠' },
                          { label: 'Brevity', score: evaluationReport.scorecard.brevity, max: 15 },
                          { label: 'Question Quality', score: evaluationReport.scorecard.questionQuality, max: 15 },
                          { label: 'Objection Handling', score: evaluationReport.scorecard.objectionHandling, max: 15 },
                          { label: 'Compliance', score: evaluationReport.scorecard.compliance, max: 15 },
                        ].map((item: { label: string; score: number; max: number; icon?: string }) => (
                          
                            
                              {item.icon && {item.icon}}
                              {item.label}
                            
                            
                              = 0.8 ? 'bg-green-500' :
                                  item.score / item.max >= 0.6 ? 'bg-yellow-500' : 'bg-red-500'
                                }`}
                                style={{ width: `${(item.score / item.max) * 100}%` }}
                              />
                            
                            
                              {item.score}/{item.max}
                            
                          
                        ))}
                      
                    
                  
                

                {/* Executive Summary */}
                
                  
                    Executive Summary
                  
                  
                    {evaluationReport.executiveSummary.whatWentWell.length > 0 && (
                      
                        
                          ✓ What Went Well
                        
                        
                          {evaluationReport.executiveSummary.whatWentWell.map((item, i) => (
                            • {item}
                          ))}
                        
                      
                    )}
                    {evaluationReport.executiveSummary.whatHurtConversation.length > 0 && (
                      
                        
                          ✗ What Hurt the Conversation
                        
                        
                          {evaluationReport.executiveSummary.whatHurtConversation.map((item, i) => (
                            • {item}
                          ))}
                        
                      
                    )}
                  
                

                {/* Voicemail Discipline - CRITICAL SECTION */}
                {!evaluationReport.voicemailDiscipline.passed && (
                  
                    
                      
                        🚨 CRITICAL: Voicemail Policy Violated
                      
                      
                        The agent must NEVER leave voicemail. This is a non-negotiable policy violation.
                      
                    
                    
                      
                        Violations Detected:
                        
                          {evaluationReport.voicemailDiscipline.violations.map((violation, i) => (
                            
                              ❌
                              {violation}
                            
                          ))}
                        
                      
                      
                        Required Behavior:
                        
                          • If voicemail is offered: Say "That's okay — I'll try again later. Thank you." then END CALL
                          • If call routes to voicemail: Do NOT speak, end call silently
                          • If gatekeeper mentions voicemail: Say "No problem — I'll try again later. Thank you." then END CALL
                        
                      
                    
                  
                )}

                {/* Humanity & Professionalism Report */}
                {evaluationReport.humanityReport.issues.length > 0 && (
                  
                    
                      
                        🌿 Humanity & Professional Etiquette
                        
                          {evaluationReport.humanityReport.score}/{evaluationReport.humanityReport.maxScore}
                        
                      
                      
                        {evaluationReport.humanityReport.passed 
                          ? 'Good humanity signals detected, with some areas for improvement.'
                          : 'The agent should show more warmth, gratitude, and professional courtesy.'}
                      
                    
                    
                      
                        Areas to Improve:
                        
                          {evaluationReport.humanityReport.issues.map((issue, i) => (
                            
                              {issue.includes('HIGH SEVERITY') ? '⚠️' : '💡'}
                              {issue}
                            
                          ))}
                        
                      
                      
                        Humanity Best Practices:
                        
                          • Express gratitude when given permission: "Thank you for a moment"
                          • Acknowledge interruption: "I appreciate you taking my call"
                          • Warm closing: "Thank you for your time — have a great day!"
                          • Avoid rushed language: "real quick", "just a second"
                          • Avoid overly salesy tone: "amazing", "incredible opportunity"
                        
                      
                    
                  
                )}

                {/* Intelligence Report */}
                {evaluationReport.intelligenceReport.issues.length > 0 && (
                  
                    
                      
                        🧠 Conversational Intelligence
                        
                          {evaluationReport.intelligenceReport.score}/{evaluationReport.intelligenceReport.maxScore}
                        
                      
                      
                        {evaluationReport.intelligenceReport.passed 
                          ? 'Good conversational awareness, with some areas for improvement.'
                          : 'The agent needs to improve acknowledgement, attentiveness, and conversational flow.'}
                      
                    
                    
                      
                        Areas to Improve:
                        
                          {evaluationReport.intelligenceReport.issues.map((issue, i) => (
                            
                              {issue.includes('MEDIUM') ? '⚠️' : '💡'}
                              {issue}
                            
                          ))}
                        
                      
                      
                        Intelligence Best Practices:
                        
                          • Always acknowledge user input: "Understood", "I see", "Got it"
                          • When user hesitates: Slow down and acknowledge
                          • When user is confused: Clarify immediately
                          • One intent per response - avoid stacking questions
                          • Rotate acknowledgement phrases for naturalness
                          • Never appear absent - if thinking, acknowledge first
                        
                      
                    
                  
                )}

                {/* Timeline Highlights */}
                {evaluationReport.timelineHighlights.length > 0 && (
                  
                    
                      Timeline Highlights
                    
                    
                      
                        {evaluationReport.timelineHighlights.slice(0, 6).map((highlight, i) => (
                          
                            
                              #{highlight.turn}
                            
                            
                              {highlight.role === 'assistant' ? '🤖' : '👤'}
                            
                            {highlight.summary}
                            
                              {highlight.tag === 'good-move' && '✓ Good'}
                              {highlight.tag === 'risk' && '⚠️ Risk'}
                              {highlight.tag === 'missed-opportunity' && '💡 Missed'}
                              {highlight.tag === 'unclear' && '? Unclear'}
                            
                          
                        ))}
                      
                    
                  
                )}

                {/* Objection Review */}
                {evaluationReport.objectionReview.detected.length > 0 && (
                  
                    
                      Objection Review
                    
                    
                      
                        {evaluationReport.objectionReview.detected.map((obj, i) => (
                          {obj}
                        ))}
                      
                      
                        Quality: 
                        {evaluationReport.objectionReview.responseQuality}
                      
                      {evaluationReport.objectionReview.betterAlternatives.length > 0 && (
                        
                          💡 Better Alternatives
                          
                            {evaluationReport.objectionReview.betterAlternatives.map((alt, i) => (
                              • {alt}
                            ))}
                          
                        
                      )}
                    
                  
                )}

                {/* Prompt Improvements */}
                {evaluationReport.promptImprovements.length > 0 && (
                  
                    
                      🔧 Suggested Prompt Improvements
                    
                    
                      {evaluationReport.promptImprovements.map((improvement, i) => (
                        
                          
                            
                              Issue: {improvement.originalLine}
                              {improvement.replacement}
                              💡 {improvement.reason}
                            
                             {
                                addLearningEntry('tone', improvement.originalLine, improvement.replacement, 'medium');
                              }}
                            >
                              📝 Save
                            
                          
                        
                      ))}
                    
                  
                )}

                {/* Learning Notes */}
                {learnings.length > 0 && (
                  
                    
                      📚 Learning Notes
                      Coaching notes from this session
                    
                    
                      {learnings.map((learning) => (
                        
                          
                            
                              {learning.issueType}
                              
                                {learning.status}
                              
                            
                            {learning.recommendedFix}
                          
                          {learning.status === 'proposed' && (
                             applyLearning(learning.id)}
                            >
                              Apply
                            
                          )}
                        
                      ))}
                    
                  
                )}

                {/* Action Buttons */}
                
                   {
                      setShowEvaluationReport(false);
                      handleResetPreview();
                    }}
                  >
                    
                    New Simulation
                  
                   {
                      setTestCallAgent(null);
                      setShowEvaluationReport(false);
                      handleResetPreview();
                    }}
                  >
                    Close Preview
                  
                
              
            
          )}
          
          )}

          
            
              💡
              
                {previewMode === 'training' ? 'Training mode: Visible stage indicators and hints' :
                 previewMode === 'realism' ? 'Realism mode: Natural pacing, no hints' :
                 'Stress test: Interruptions and ambiguous responses'}
              
            
             {
                setTestCallAgent(null);
                setPreviewMessages([]);
                setPreviewInput('');
                setSimulationStarted(false);
                setSimulationStartTime(null);
              }}
            >
              Close
            
          
        
      
    
  );
}

type PromptSources = {
  goal: string;
  orgIntelligence: string[];
  compliancePolicy: string[];
  platformPolicies: string[];
  agentVoiceDefaults: string[];
  trainingDefaults: string[];
  generatedAt: Date | null;
};

function AgentForm({
  formData,
  setFormData,
  onSubmit,
  onCancel,
  isLoading,
  submitLabel,
  toast,
  orgPromptData,
  orgPromptLoading,
  trainingCenter,
  activeTrainingType,
  editingAgent,
}: {
  formData: VirtualAgentFormData;
  setFormData: (data: VirtualAgentFormData) => void;
  onSubmit: () => void;
  onCancel: () => void;
  isLoading: boolean;
  submitLabel: string;
  toast: ReturnType['toast'];
  orgPromptData: OrgPromptData;
  orgPromptLoading: boolean;
  trainingCenter: TrainingCenter;
  activeTrainingType: 'demand_intel' | 'demand_qual' | 'demand_engage';
  editingAgent?: VirtualAgent | null;
}) {
  const [agentGoal, setAgentGoal] = useState('');
  // Local state for preview-only settings (not persisted to agent)
  const [previewPromptId, setPreviewPromptId] = useState('');
  const [previewPromptVersion, setPreviewPromptVersion] = useState('');
  const [previewPromptVariables, setPreviewPromptVariables] = useState>({});
  const [previewTools, setPreviewTools] = useState(['detect_voicemail_and_hangup']);
  const [promptSources, setPromptSources] = useState({
    goal: '',
    orgIntelligence: [],
    compliancePolicy: [],
    platformPolicies: [],
    agentVoiceDefaults: [],
    trainingDefaults: [],
    generatedAt: null,
  });
  const [showPromptPreview, setShowPromptPreview] = useState(false);
  const [copiedPrompt, setCopiedPrompt] = useState(false);
  const baseSettings = formData.settings ?? defaultFormData.settings;
  const systemTools = baseSettings.systemTools;
  const advanced = baseSettings.advanced;
  const realtimeConfig = advanced.realtime ?? DEFAULT_ADVANCED_SETTINGS.realtime;
  const trainingDefaults = trainingCenter[activeTrainingType] ?? [];
  const trainingLabel =
    AGENT_TYPE_OPTIONS.find((opt) => opt.value === activeTrainingType)?.label || 'Voice Agent';
  const activeToolCount = Object.values(systemTools).filter((v) => typeof v === 'boolean' && v).length;

  const formatCsv = (values: string[]) => values.join(', ');
  const parseCsv = (value: string) =>
    value
      .split(',')
      .map((entry) => entry.trim())
      .filter(Boolean);

    const handleGeneratePrompt = () => {
      if (!agentGoal.trim()) {
        toast({ title: 'Add a goal first', description: 'Describe the agent goal to generate a prompt.', variant: 'destructive' });
        return;
      }

    const { orgIntelligence, compliancePolicy, platformPolicies, agentVoiceDefaults } = orgPromptData;
    const hasOrgData = [orgIntelligence, compliancePolicy, platformPolicies, agentVoiceDefaults].some(arr => arr.length > 0);

    if (!hasOrgData) {
      toast({ title: 'Org intelligence unavailable', description: 'Using goal only. Update org intelligence for richer prompts.', variant: 'destructive' });
    }

      const formatBulletList = (items: string[]) =>
        items
          .map((item) => item.trim())
          .filter(Boolean)
          .map((item) => (item.startsWith('-') ? item : `- ${item}`))
          .join('\n');

      const buildListSection = (title: string, items: string[]) =>
        items.length ? `## ${title}\n${formatBulletList(items)}` : '';

      const operatorGoal = agentGoal.trim();

      const basePrompt = `# Personality

You are {{agent.name}}, a professional voice agent representing **{{org.name}}**.

You are thoughtful, observant, and intentional in your communication.
You adapt naturally to context and speak with genuine professionalism.
You never sound gimmicky, pushy, or scripted.

# Environment

You are on a phone call.
You only have access to the phone and your conversational ability.

The current time is {{system.time_utc}}.
The caller ID is {{system.caller_id}}.
The destination number is {{system.called_number}}.

# Tone

Your voice is calm, warm, and professional.
Speak clearly and at a natural pace.
Use natural pauses.
Ask one question at a time and always wait for the response.
Never interrupt.
Never rush.
Be considerate of the person's time.

# Goal

${operatorGoal}

Your primary objective is to confirm you are speaking with the right person ({{contact.first_name}}) and then accomplish your goal through a natural conversation.

## Call Flow Logic

### 1. Identity Confirmation
Begin by asking to speak with {{contact.first_name}}.
Listen carefully and classify the response.

### 2. Right Person Confirmed
If the person confirms they are {{contact.full_name}}:

- Thank them for taking the call and acknowledge their time.
- Introduce yourself and **{{org.name}}** briefly.
- Clearly state the purpose of your call.
- Engage in natural conversation aligned with your goal.
- Listen actively and respond thoughtfully.
- If appropriate, confirm follow-up details ({{contact.email}}).
- Close the call warmly.

### 3. Gatekeeper Handling
If the person is not {{contact.first_name}}:

- Be polite and respectful.
- Ask to be connected to {{contact.first_name}}.
- Do not pitch or explain details to the gatekeeper.
- Make no more than two polite attempts.
- If refused, thank them and end the call gracefully.

### 4. Transfer Handling
If connected to {{contact.first_name}} after a transfer:

- Restart the introduction calmly.
- Continue with the standard conversation flow.

# Guardrails

If asked whether you are an AI or automated system:
- Acknowledge honestly and confidently.
- Do not apologize for being AI.
- Explain that real humans created your message and purpose.
- Ask if they are comfortable continuing.
- Respect their decision.

Example response:
"Yes, I'm an automated assistant. The message I'm sharing was created by real people at {{org.name}}. Are you comfortable continuing?"

If the person asks to stop or expresses discomfort:
- Apologize briefly.
- End the call politely.

# NEVER Leave Voicemail
If you detect an answering machine or voicemail, hang up immediately. Do not leave a message.
`;

      const extraSections = [
        buildListSection('Organization Intelligence', orgIntelligence),
        buildListSection('Compliance Policy', compliancePolicy),
        buildListSection('Platform Policies', platformPolicies),
        buildListSection('Voice Defaults', agentVoiceDefaults),
        buildListSection('Training Defaults', trainingDefaults),
      ].filter(Boolean).join('\n\n');

      const sections = extraSections
        ? `${basePrompt}\n\n# Additional Context\n${extraSections}`
        : basePrompt;

    // Save sources for the prompt preview
    setPromptSources({
      goal: agentGoal.trim(),
      orgIntelligence,
      compliancePolicy,
      platformPolicies,
      agentVoiceDefaults,
      trainingDefaults,
      generatedAt: new Date(),
    });

    setFormData({ ...formData, systemPrompt: sections });
    setShowPromptPreview(true);
    toast({ title: 'System prompt generated', description: 'Goal, org intelligence, and training defaults merged into the prompt.' });
  };

  const handleCopyPrompt = async () => {
    if (formData.systemPrompt) {
      await navigator.clipboard.writeText(formData.systemPrompt);
      setCopiedPrompt(true);
      setTimeout(() => setCopiedPrompt(false), 2000);
      toast({ title: 'Copied to clipboard' });
    }
  };

  const totalSourceCount =
    (promptSources.goal ? 1 : 0) +
    promptSources.orgIntelligence.length +
    promptSources.compliancePolicy.length +
    promptSources.platformPolicies.length +
    promptSources.agentVoiceDefaults.length +
    promptSources.trainingDefaults.length;

  return (
    
      
        
          {/* Simplified Agent Creation - Voice Configuration Only */}
          
            Voice Configuration
            Call Handling
          

        
          {/* Prompt selection for preview session */}
          
            Prompt Management (Preview Only)
            
              
                Prompt ID
                 setPreviewPromptId(e.target.value)}
                  placeholder="e.g. pmpt_123"
                />
              
              
                Prompt Version
                 setPreviewPromptVersion(e.target.value)}
                  placeholder="e.g. 89"
                />
              
              
                Prompt Variables
                
                  {Object.entries(previewPromptVariables).map(([key, value]) => (
                    
                       {
                          const newKey = e.target.value;
                          setPreviewPromptVariables(vars => {
                            const updated = { ...vars };
                            updated[newKey] = updated[key];
                            delete updated[key];
                            return updated;
                          });
                        }}
                        placeholder="Variable name"
                        className="w-1/2"
                      />
                       {
                          const newValue = e.target.value;
                          setPreviewPromptVariables(vars => ({ ...vars, [key]: newValue }));
                        }}
                        placeholder="Value"
                        className="w-1/2"
                      />
                       setPreviewPromptVariables(vars => { const updated = { ...vars }; delete updated[key]; return updated; })}>
                        ×
                      
                    
                  ))}
                   setPreviewPromptVariables(vars => ({ ...vars, '': '' }))}>
                    + Add Variable
                  
                
              
            
          
          {/* Tool selection - saved with agent */}
          
            Function Tools
            
              {['detect_voicemail_and_hangup', 'enforce_max_call_duration', 'navigate_and_dial', 'connect_to_operator'].map(tool => {
                const currentFunctions = formData.settings?.advanced?.realtime?.functions ?? previewTools;
                const isEnabled = currentFunctions.includes(tool);
                return (
                   {
                      const newFunctions = isEnabled
                        ? currentFunctions.filter((t: string) => t !== tool)
                        : [...currentFunctions, tool];
                      // Update both preview tools and formData settings
                      setPreviewTools(newFunctions);
                      setFormData(prev => ({
                        ...prev,
                        settings: {
                          ...prev.settings,
                          advanced: {
                            ...prev.settings?.advanced,
                            realtime: {
                              ...prev.settings?.advanced?.realtime,
                              functions: newFunctions,
                            },
                          },
                        },
                      }));
                    }}
                  >
                    {tool}
                  
                );
              })}
            
            Select which function tools are available for this agent.
          
          
            
              Agent Details
              
                
                  
                    
                      
                      Voice Configuration Agent
                    
                    
                      Virtual agents define voice and basic call handling. All agents automatically receive foundational B2B training.
                      Campaign context, objectives, and specific skills are defined at the campaign level.
                    
                  

                  
                    
                      Agent Name *
                       setFormData({ ...formData, name: e.target.value })}
                        placeholder="e.g., Professional Female Voice"
                        data-testid="input-agent-name"
                      />
                      
                        Use a descriptive name for the voice (e.g., "Friendly Female", "Professional Male")
                      
                    
                    
                      Voice Provider
                       setFormData({ ...formData, provider: value })}
                      >
                        
                          
                        
                        
                          {PROVIDER_OPTIONS.map(opt => (
                            {opt.label}
                          ))}
                        
                      
                      
                        Google (Gemini) is recommended for cost-effectiveness
                      
                    
                  

                  
                    Description (Optional)
                     setFormData({ ...formData, description: e.target.value })}
                      placeholder="Brief description of this voice configuration"
                      data-testid="input-description"
                    />
                  
                
              
            

            
              Voice Selection
              
                
                  
                    Select Voice *
                    
                       setFormData({ ...formData, voice: value })}
                      >
                        
                          
                        
                        
                          {(formData.provider === 'openai' ? OPENAI_VOICES : GOOGLE_VOICES).map(opt => (
                            {opt.label}
                          ))}
                        
                      
                      {formData.voice && (
                         {
                            try {
                              const response = await apiRequest('GET', `/api/virtual-agents/preview-voice?voice=${formData.voice}&provider=${formData.provider}&text=${encodeURIComponent('Hello! This is a preview of the voice you selected. I will be making professional B2B outreach calls.')}`);
                              const audioBlob = await response.blob();
                              const audioUrl = URL.createObjectURL(audioBlob);
                              const audio = new Audio(audioUrl);
                              audio.play();
                              audio.onended = () => URL.revokeObjectURL(audioUrl);
                            } catch (error) {
                              toast({
                                title: "Preview failed",
                                description: error instanceof Error ? error.message : "Could not play voice preview",
                                variant: "destructive"
                              });
                            }
                          }}
                          title="Preview voice"
                        >
                          
                        
                      )}
                    
                    
                      {formData.provider === 'google' 
                        ? 'Google Gemini voices - optimized for natural conversation' 
                        : 'OpenAI Realtime voices'}
                    
                  

                  
                    Voice Recommendation
                    
                      Kore (default) - Soft, friendly, professional. Ideal for B2B sales calls.
                      Pegasus - Calm, authoritative. Good for executive outreach.
                      Aoede - Bright, energetic. Suitable for high-volume prospecting.
                    
                  
                
              
            
          
        

        
          
            
              
              Basic Call Handling
            
            
              Configure basic call handling features. Advanced conversation skills and behaviors are automatically 
              applied based on campaign objectives and foundational B2B training.
            
          

          {/* Voicemail Detection Configuration */}
          
            
              
                Voicemail Detection
                
                  Detect voicemail systems and configure how the agent should respond.
                
              
              
                  setFormData({
                    ...formData,
                    settings: {
                      ...baseSettings,
                      systemTools: {
                        ...systemTools,
                        voicemailDetection: checked,
                      },
                    },
                  })
                }
                data-testid="switch-voicemail-detection"
              />
            
            {systemTools.voicemailDetection && (
              
                
                  Detection Mode
                  
                      setFormData({
                        ...formData,
                        settings: {
                          ...baseSettings,
                          systemTools: {
                            ...systemTools,
                            voicemailPolicy: {
                              ...systemTools.voicemailPolicy,
                              detectionMode: value as 'always' | 'intelligent' | 'never',
                              action: systemTools.voicemailPolicy?.action || 'hang_up',
                            },
                          },
                        },
                      })
                    }
                  >
                    
                      
                    
                    
                      Intelligently (Recommended)
                      Always
                      Never
                    
                  
                  
                    Intelligently detects voicemail using AI analysis of audio patterns.
                  
                
                
                  Action on Detection
                  
                      setFormData({
                        ...formData,
                        settings: {
                          ...baseSettings,
                          systemTools: {
                            ...systemTools,
                            voicemailPolicy: {
                              ...systemTools.voicemailPolicy,
                              detectionMode: systemTools.voicemailPolicy?.detectionMode || 'intelligent',
                              action: value as 'hang_up' | 'leave_message' | 'continue',
                            },
                          },
                        },
                      })
                    }
                  >
                    
                      
                    
                    
                      Hang Up (Recommended)
                      Leave Message
                      Continue Conversation
                    
                  
                  
                    What to do when voicemail is detected.
                  
                
              
            )}
          

          
            
              Active Status
              
                Only active agents can be assigned to campaigns
              
            
             setFormData({ ...formData, isActive: checked })}
              data-testid="switch-active"
            />
          
        

        {/* Removed: knowledge tab - handled automatically
            Removed: advanced tab - handled at campaign level */}

      
      
    
  );
}