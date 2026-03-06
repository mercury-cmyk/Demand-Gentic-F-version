import { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiRequest } from '@/lib/queryClient';
import { useAuth } from '@/contexts/AuthContext';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { Bot, FlaskConical, GitBranch, Mic, MicOff, Play, Save, Upload, Clock, CheckCircle, XCircle, Send, Phone, PhoneOff, Volume2, History, AlertCircle, MessageSquare, ClipboardList, BarChart3, Pencil, Settings, Eye, EyeOff, Plus, Trash2, ThumbsUp, FileText, Search, ChevronDown, ChevronRight, Shield, Zap, TrendingUp, Target, MoreVertical, Info, RefreshCw } from 'lucide-react';
import { OpenAIRealtimeWebRTCClient, type OpenAIRealtimeState } from '@/lib/webrtc/openai-realtime-webrtc-client';
import { ResizablePanelGroup, ResizablePanel, ResizableHandle } from '@/components/ui/resizable';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Skeleton } from '@/components/ui/skeleton';
import { Progress } from '@/components/ui/progress';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, Radar, ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, AreaChart, Area } from 'recharts';

type DraftSection = {
  sectionId: string;
  name: string;
  category: string;
  content: string;
  lastEditedAt: string;
  lastEditedBy: string | null;
};

type VoiceConfig = {
  provider: string;
  voiceId: string;
  speakingRate: number;
  tone: string;
  clarity: number;
};

type OverviewResponse = {
  production?: {
    version?: string;
  };
  stats?: OverviewStats;
};

type DraftResponse = {
  draftVersion: number;
  sections: DraftSection[];
  voiceConfig: VoiceConfig;
};

type VoiceOption = {
  id: string;
  label: string;
};

type VoicesResponse = {
  voices: VoiceOption[];
};

type SampleCampaign = {
  id: string;
  name: string;
};

type SampleAccount = {
  id: string;
  name: string;
};

type SampleContact = {
  id: string;
  name: string;
  title: string;
};

type SampleDatasetResponse = {
  campaigns: SampleCampaign[];
  accounts: SampleAccount[];
  contacts: SampleContact[];
};

type SimulationScenario = {
  id: string;
  title: string;
};

type SimulationPersona = {
  id: string;
  name: string;
};

type SimulationOptionsResponse = {
  scenarios: SimulationScenario[];
  personas: SimulationPersona[];
  customScenarios?: CustomScenario[];
};

type SimulationResponse = {
  success: boolean;
  simulation: {
    sessionId: string;
    status: string;
    turns: number;
    transcriptPreview: Array<{ role: string; content: string }>;
    scores?: { overall: number; toneAdherence: number; objectionHandling: number; identityLock: number; callFlow: number };
  };
  analysis: any;
};

type DraftHistoryEntry = {
  version: number;
  savedAt: string;
  summary: string;
};

type PublishHistoryEntry = {
  publishedVersion: string;
  publishedAt: string;
  note: string;
  sectionChanges: number;
};

type VersionsResponse = {
  draft?: {
    history?: DraftHistoryEntry[];
  };
  publishHistory?: PublishHistoryEntry[];
};

type PublishRequestSectionChange = {
  sectionId: string;
  name: string;
  oldContent: string;
  newContent: string;
};

type PublishRequest = {
  id: string;
  requestedBy: string;
  requestedAt: string;
  note: string;
  status: 'pending' | 'approved' | 'rejected';
  reviewedBy: string | null;
  reviewedAt: string | null;
  reviewNote: string | null;
  draftVersion: number;
  sectionChanges: PublishRequestSectionChange[];
};

type PublishRequestsResponse = {
  requests: PublishRequest[];
};

type LiveTestTranscriptTurn = {
  role: 'user' | 'assistant';
  text: string;
  timestamp: string;
};

type LiveTestScores = {
  overall: number;
  toneAdherence: number;
  objectionHandling: number;
  identityLock: number;
  callFlow: number;
};

type LiveTestRecord = {
  id: string;
  startedAt: string;
  endedAt: string;
  userId: string;
  voiceId: string;
  draftVersion: number;
  transcript: LiveTestTranscriptTurn[];
  durationSec: number;
  scores: LiveTestScores;
  evaluation: {
    recommendations: string[];
    conversationStages: string[];
  };
};

type DraftPromptResponse = {
  prompt: string;
  voiceId: string;
  draftVersion: number;
  sectionCount: number;
};

type LiveTestHistoryResponse = {
  records: LiveTestRecord[];
};

type SimulationRecord = {
  id: string;
  runAt: string;
  runBy: string;
  scenarioId: string;
  scenarioTitle: string;
  personaId: string;
  turns: number;
  transcript: { role: string; content: string }[];
  scores: { overall: number; toneAdherence: number; objectionHandling: number; identityLock: number; callFlow: number };
  evaluation: { recommendations: string[]; conversationStages: string[] };
};

type ActivityLogEntry = {
  id: string;
  timestamp: string;
  userId: string;
  action: string;
  detail: string;
  category: 'edit' | 'simulation' | 'publish' | 'approval' | 'config' | 'scenario' | 'snippet' | 'comment';
};

type SectionComment = {
  id: string;
  sectionId: string;
  userId: string;
  createdAt: string;
  content: string;
  resolved: boolean;
  resolvedBy: string | null;
  resolvedAt: string | null;
};

type PromptSnippet = {
  id: string;
  title: string;
  content: string;
  category: string;
  createdBy: string;
  createdAt: string;
  isApproved: boolean;
};

type CustomScenario = {
  id: string;
  title: string;
  description: string;
  defaultPersonaId: string;
  defaultObjections: string[];
  createdBy: string;
  createdAt: string;
  isApproved: boolean;
};

type RealTranscript = {
  id: number;
  campaignId: string | null;
  contactName: string;
  transcript: string | null;
  duration: number | null;
  disposition: string | null;
  calledAt: string;
  agentType: string;
};

type OverviewStats = {
  totalSimulations: number;
  avgSimScore: number;
  modifiedSections: number;
  pendingApprovals: number;
  totalComments: number;
  lastActivity: string | null;
  snippetCount: number;
  customScenarioCount: number;
};

const OPENAI_VOICES = [
  { id: 'alloy', label: 'Alloy (neutral)' },
  { id: 'echo', label: 'Echo (warm male)' },
  { id: 'fable', label: 'Fable (storyteller)' },
  { id: 'nova', label: 'Nova (bright female)' },
  { id: 'shimmer', label: 'Shimmer (soft female)' },
  { id: 'onyx', label: 'Onyx (deep male)' },
] as const;

function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

function getScoreColor(score: number): string {
  if (score >= 75) return 'text-green-600';
  if (score >= 50) return 'text-yellow-600';
  return 'text-red-600';
}

function getScoreBg(score: number): string {
  if (score >= 75) return 'bg-green-500';
  if (score >= 50) return 'bg-yellow-500';
  return 'bg-red-500';
}

const getErrorMessage = (error: unknown): string => {
  if (error instanceof Error) return error.message;
  if (typeof error === 'string') return error;
  return 'Unknown error';
};

const configuredApiOrigin =
  ((import.meta as any).env?.VITE_API_BASE_URL as string | undefined)?.trim()?.replace(/\/$/, '') || '';

const configuredExtraApiOriginsRaw =
  ((import.meta as any).env?.VITE_VOICE_TRAINING_API_ORIGINS as string | undefined) || '';

const configuredExtraApiOrigins = configuredExtraApiOriginsRaw
  .split(',')
  .map((entry) => entry.trim().replace(/\/$/, ''))
  .filter(Boolean);

const autoDetectedVoiceApiOrigin =
  typeof window !== 'undefined' && /(^|\.)pivotal-b2b\.com$/i.test(window.location.hostname)
    ? 'https://demandgentic.ai'
    : '';

const productionVoiceApiFallback =
  typeof window !== 'undefined' && !/^(localhost|127\.0\.0\.1)$/i.test(window.location.hostname)
    ? 'https://demandgentic.ai'
    : '';

const withApiOrigin = (path: string): string => {
  if (!path.startsWith('/')) return path;
  return path;
};

const API_PATH_BASES = ['/api/voice-agent-training', '/api/unified-agents/voice-training'];

const getApiBases = (): string[] => {
  const knownProductionOrigins = [
    'https://demandgentic.ai',
    'https://www.demandgentic.ai',
    'https://pivotal-b2b.com',
    'https://www.pivotal-b2b.com',
  ];

  const originCandidates = [
    configuredApiOrigin,
    '',
    autoDetectedVoiceApiOrigin,
    productionVoiceApiFallback,
    ...configuredExtraApiOrigins,
    ...knownProductionOrigins,
  ];

  return Array.from(new Set(originCandidates.filter(Boolean).map((entry) => entry.replace(/\/$/, '')))).flatMap((origin) =>
    API_PATH_BASES.map((pathBase) => (origin ? `${origin}${withApiOrigin(pathBase)}` : withApiOrigin(pathBase))),
  ).concat(API_PATH_BASES);
};

const isLikelyHtmlFallback = (value: string): boolean => {
  const normalized = value.trim().toLowerCase();
  return normalized.startsWith('<!doctype') || normalized.startsWith('<html');
};

const roleHelpText = 'Required role: admin, campaign_manager, quality_analyst (aliases: manager, qa_analyst).';
const apiHelpText =
  'If this persists in production, set VITE_API_BASE_URL to your backend origin so API calls do not hit the frontend HTML fallback. On pivotal-b2b.com we auto-try https://demandgentic.ai as a backup.';
const localhostHelpText =
  typeof window !== 'undefined' && /^(localhost|127\.0\.0\.1)$/i.test(window.location.hostname)
    ? ' Local dev detected: configure VITE_VOICE_TRAINING_PROXY_TARGET (or VITE_API_BASE_URL) and restart the Vite dev server so /api routes proxy to backend instead of returning index.html.'
    : '';

async function trainingApiRequest<T>(
  method: string,
  routePath: string,
  data?: unknown,
): Promise<T> {
  const apiBases = Array.from(new Set(getApiBases()));
  let lastError: unknown;
  const attemptErrors: string[] = [];

  for (let index = 0; index < apiBases.length; index += 1) {
    const base = apiBases[index];
    const url = `${base}${routePath}`;
    try {
      const response = await apiRequest(method, url, data);
      const contentType = (response.headers.get('content-type') || '').toLowerCase();

      if (contentType.includes('application/json')) {
        return (await response.json()) as T;
      }

      const text = await response.text();
      if (isLikelyHtmlFallback(text)) {
        throw new Error(
          `API returned HTML instead of JSON at ${url}. This usually means auth/session or gateway routing is blocking the API. ${roleHelpText} ${apiHelpText}${localhostHelpText}`,
        );
      }

      return JSON.parse(text) as T;
    } catch (error) {
      lastError = error;
      attemptErrors.push(`${url} -> ${getErrorMessage(error)}`);
      // Continue trying all configured origins/paths before failing.
    }
  }

  const currentHost = typeof window !== 'undefined' ? window.location.origin : 'unknown-host';
  const consolidated = `Voice Agent Training request failed after trying ${apiBases.length} endpoint(s) from ${currentHost}. ${attemptErrors.join(' | ')}`;
  throw lastError instanceof Error ? new Error(consolidated) : new Error(consolidated);
}

function DiffResultViewer({ versionA, versionB, agentId }: { versionA: string; versionB: string; agentId: string }) {
  const diffQuery = useQuery({
    queryKey: ['/api/voice-agent-training/diff', versionA, versionB],
    queryFn: () => trainingApiRequest('GET', `/api/voice-agent-training/diff/${versionA}/${versionB}`),
    enabled: !!versionA && !!versionB && versionA !== versionB,
  });
  if (diffQuery.isLoading) return <p className="text-xs text-muted-foreground">Loading diff...</p>;
  if (diffQuery.isError) return <p className="text-xs text-destructive">Failed to load diff</p>;
  const data = diffQuery.data as any;
  if (!data) return null;
  return (
    <div className="space-y-2">
      <div className="flex gap-2 text-xs">
        <Badge variant="outline" className="text-green-600">+{data.additions} added</Badge>
        <Badge variant="outline" className="text-red-600">-{data.removals} removed</Badge>
        <Badge variant="outline">{data.modifications} modified</Badge>
      </div>
      {(data.sectionDiffs || []).map((sd: any) => (
        <details key={sd.sectionId} className="border rounded p-2 text-xs">
          <summary className="cursor-pointer font-medium">{sd.sectionId} ({sd.changeType})</summary>
          <div className="mt-1 space-y-0.5 max-h-[200px] overflow-auto">
            {(sd.lineDiff || []).map((ld: any, i: number) => (
              <div key={i} className={`font-mono ${ld.type === 'add' ? 'bg-green-100 dark:bg-green-950/30 text-green-800 dark:text-green-300' : ld.type === 'remove' ? 'bg-red-100 dark:bg-red-950/30 text-red-800 dark:text-red-300' : ''}`}>
                {ld.type === 'add' ? '+' : ld.type === 'remove' ? '-' : ' '} {ld.line}
              </div>
            ))}
          </div>
        </details>
      ))}
    </div>
  );
}

export default function VoiceAgentTrainingDashboard() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { user } = useAuth();

  // Determine role for conditional UI
  const userRoles: string[] = (user as any)?.roles || (user?.role ? [user.role] : []);
  const isVoiceTrainer = userRoles.includes('voice_trainer') && !userRoles.includes('admin');
  const isAdmin = userRoles.includes('admin');

  const [selectedSectionId, setSelectedSectionId] = useState<string>('');
  const [sectionContent, setSectionContent] = useState('');
  const [changeLog, setChangeLog] = useState('');

  const [voiceConfig, setVoiceConfig] = useState<VoiceConfig>({
    provider: 'gemini_live',
    voiceId: 'Fenrir',
    speakingRate: 1,
    tone: 'professional',
    clarity: 1,
  });

  const [scenarioId, setScenarioId] = useState('gatekeeper_handoff');
  const [personaId, setPersonaId] = useState('neutral_dm');
  const [campaignId, setCampaignId] = useState('demo-camp-1');
  const [accountId, setAccountId] = useState('demo-acct-1');
  const [contactId, setContactId] = useState('demo-contact-1');
  const [simulationInput, setSimulationInput] = useState('Run identity lock and gatekeeper protocol behavior.');
  const [publishNote, setPublishNote] = useState(isVoiceTrainer ? '' : 'Approved after simulation review.');
  const [approvalReviewNote, setApprovalReviewNote] = useState('');
  const [rejectionNote, setRejectionNote] = useState('');

  // Live voice test state
  const [liveTestState, setLiveTestState] = useState<'idle' | 'connecting' | 'connected' | 'ending' | 'scoring'>('idle');
  const [liveTestVoice, setLiveTestVoice] = useState('alloy');
  const [liveTranscript, setLiveTranscript] = useState<LiveTestTranscriptTurn[]>([]);
  const [liveTestDuration, setLiveTestDuration] = useState(0);
  const [liveTestResult, setLiveTestResult] = useState<LiveTestRecord | null>(null);
  const [liveTestStartedAt, setLiveTestStartedAt] = useState('');
  const [isMuted, setIsMuted] = useState(false);
  const [showLiveTestHistory, setShowLiveTestHistory] = useState(false);
  const [liveTestSectionIds, setLiveTestSectionIds] = useState<string[]>([]);
  const [liveTestScenarioId, setLiveTestScenarioId] = useState<string>('');
  const rtcClientRef = useRef<OpenAIRealtimeWebRTCClient | null>(null);
  const audioElementRef = useRef<HTMLAudioElement | null>(null);
  const micStreamRef = useRef<MediaStream | null>(null);
  const durationIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const transcriptEndRef = useRef<HTMLDivElement | null>(null);

  // 12 improvements state
  const [showDiffView, setShowDiffView] = useState(false);
  const [showSnippets, setShowSnippets] = useState(false);
  const [showComments, setShowComments] = useState(false);
  const [newCommentText, setNewCommentText] = useState('');
  const [newSnippetTitle, setNewSnippetTitle] = useState('');
  const [newSnippetContent, setNewSnippetContent] = useState('');
  const [newSnippetCategory, setNewSnippetCategory] = useState('general');
  const [showSimHistory, setShowSimHistory] = useState(false);
  const [showCustomScenarioForm, setShowCustomScenarioForm] = useState(false);
  const [newScenarioTitle, setNewScenarioTitle] = useState('');
  const [newScenarioDescription, setNewScenarioDescription] = useState('');
  const [newScenarioPersona, setNewScenarioPersona] = useState('friendly_dm');
  const [newScenarioObjections, setNewScenarioObjections] = useState('');
  const [showActivityLog, setShowActivityLog] = useState(false);
  const [activityFilter, setActivityFilter] = useState<string>('');
  const [diffVersionA, setDiffVersionA] = useState('');
  const [diffVersionB, setDiffVersionB] = useState('');
  const [showRealTranscripts, setShowRealTranscripts] = useState(false);
  const [audioPreviewLoading, setAudioPreviewLoading] = useState(false);
  const sectionEditorRef = useRef<HTMLTextAreaElement | null>(null);

  // Redesign state
  const [sectionSearchQuery, setSectionSearchQuery] = useState('');
  const [voiceConfigOpen, setVoiceConfigOpen] = useState(false);
  const [simResultTab, setSimResultTab] = useState<'scores' | 'transcript' | 'analysis'>('scores');
  const [simProgress, setSimProgress] = useState(0);
  const [simProgressText, setSimProgressText] = useState('');
  const [deleteConfirmTarget, setDeleteConfirmTarget] = useState<{ type: 'snippet' | 'scenario'; id: string; name: string } | null>(null);
  const [expandedSimHistoryId, setExpandedSimHistoryId] = useState<string | null>(null);

  const overviewQuery = useQuery<OverviewResponse>({
    queryKey: ['voice-training-overview'],
    queryFn: async () => trainingApiRequest<OverviewResponse>('GET', '/overview'),
  });

  const draftQuery = useQuery<DraftResponse>({
    queryKey: ['voice-training-draft'],
    queryFn: async () => trainingApiRequest<DraftResponse>('GET', '/draft'),
  });

  const versionsQuery = useQuery<VersionsResponse>({
    queryKey: ['voice-training-versions'],
    queryFn: async () => trainingApiRequest<VersionsResponse>('GET', '/versions'),
  });

  const voicesQuery = useQuery<VoicesResponse>({
    queryKey: ['voice-training-voices'],
    queryFn: async () => trainingApiRequest<VoicesResponse>('GET', '/voices'),
  });

  const sampleDataQuery = useQuery<SampleDatasetResponse>({
    queryKey: ['voice-training-sample-data'],
    queryFn: async () => trainingApiRequest<SampleDatasetResponse>('GET', '/sample-dataset'),
  });

  const simulationOptionsQuery = useQuery<SimulationOptionsResponse>({
    queryKey: ['voice-training-simulation-options'],
    queryFn: async () => trainingApiRequest<SimulationOptionsResponse>('GET', '/simulation-options'),
  });

  // ── New queries for 12 improvements ────────────────────────────────────

  const simulationHistoryQuery = useQuery<{ records: SimulationRecord[] }>({
    queryKey: ['voice-training-simulation-history'],
    queryFn: async () => trainingApiRequest('GET', '/simulation-history?limit=20'),
  });

  const activityLogQuery = useQuery<{ entries: ActivityLogEntry[] }>({
    queryKey: ['voice-training-activity-log', activityFilter],
    queryFn: async () => trainingApiRequest('GET', `/activity-log?limit=50${activityFilter ? `&category=${activityFilter}` : ''}`),
  });

  const productionSectionsQuery = useQuery<{ sections: Record<string, { name: string; content: string; category: string }> }>({
    queryKey: ['voice-training-production-sections'],
    queryFn: async () => trainingApiRequest('GET', '/production-sections'),
  });

  const snippetsQuery = useQuery<{ snippets: PromptSnippet[] }>({
    queryKey: ['voice-training-snippets'],
    queryFn: async () => trainingApiRequest('GET', '/snippets'),
  });

  const sectionCommentsQuery = useQuery<{ comments: SectionComment[] }>({
    queryKey: ['voice-training-section-comments', selectedSectionId],
    queryFn: async () => trainingApiRequest('GET', `/sections/${selectedSectionId}/comments`),
    enabled: !!selectedSectionId,
  });

  const realTranscriptsQuery = useQuery<{ transcripts: RealTranscript[] }>({
    queryKey: ['voice-training-real-transcripts'],
    queryFn: async () => trainingApiRequest('GET', '/real-transcripts?withTranscript=true&limit=10'),
    enabled: showRealTranscripts,
  });

  const sections = draftQuery.data?.sections || [];

  useEffect(() => {
    if (!sections.length) return;
    if (!selectedSectionId) {
      setSelectedSectionId(sections[0].sectionId);
      setSectionContent(sections[0].content);
      return;
    }
    const selected = sections.find((s) => s.sectionId === selectedSectionId);
    if (selected) {
      setSectionContent(selected.content);
    }
  }, [sections, selectedSectionId]);

  useEffect(() => {
    if (draftQuery.data?.voiceConfig) {
      setVoiceConfig(draftQuery.data.voiceConfig);
    }
  }, [draftQuery.data?.voiceConfig]);

  const selectedSection = useMemo(
    () => sections.find((s) => s.sectionId === selectedSectionId) || null,
    [sections, selectedSectionId]
  );

  const filteredSections = useMemo(() => {
    if (!sectionSearchQuery.trim()) return sections;
    const q = sectionSearchQuery.toLowerCase();
    return sections.filter(s => s.name.toLowerCase().includes(q) || s.category.toLowerCase().includes(q));
  }, [sections, sectionSearchQuery]);

  const sectionsByCategory = useMemo(() => {
    const groups: Record<string, DraftSection[]> = {};
    filteredSections.forEach(s => {
      if (!groups[s.category]) groups[s.category] = [];
      groups[s.category].push(s);
    });
    return groups;
  }, [filteredSections]);

  const wordCount = useMemo(() => sectionContent.split(/\s+/).filter(Boolean).length, [sectionContent]);
  const tokenEstimate = useMemo(() => Math.ceil(sectionContent.length / 4), [sectionContent]);

  const saveSectionMutation = useMutation({
    mutationFn: async () => {
      if (!selectedSectionId) throw new Error('Select a section first.');
      return trainingApiRequest<{ success: boolean }>('PUT', `/draft/sections/${selectedSectionId}`, {
        content: sectionContent,
        changeLog,
      });
    },
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['voice-training-draft'] }),
        queryClient.invalidateQueries({ queryKey: ['voice-training-versions'] }),
      ]);
      setChangeLog('');
      toast({ title: 'Draft updated', description: 'Prompt section saved as a new draft version.' });
    },
    onError: (err: unknown) => {
      toast({ title: 'Failed to save draft', description: getErrorMessage(err), variant: 'destructive' });
    },
  });

  const saveVoiceConfigMutation = useMutation({
    mutationFn: async () => trainingApiRequest<{ success: boolean }>('PUT', '/voice-config', voiceConfig),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['voice-training-draft'] });
      toast({ title: 'Voice config saved', description: 'Gemini voice settings are now bound to this draft.' });
    },
    onError: (err: unknown) => {
      toast({ title: 'Failed to save voice config', description: getErrorMessage(err), variant: 'destructive' });
    },
  });

  const simulationMutation = useMutation<SimulationResponse>({
    mutationFn: async () => {
      setSimProgress(10);
      setSimProgressText('Initializing simulation...');
      const progressInterval = setInterval(() => {
        setSimProgress(prev => {
          if (prev >= 85) { clearInterval(progressInterval); return 85; }
          return prev + Math.random() * 8;
        });
        setSimProgressText(prev => {
          const stages = ['Building agent context...', 'Generating human responses...', 'Running conversation turns...', 'Evaluating performance...'];
          const idx = stages.indexOf(prev);
          return idx < stages.length - 1 ? stages[idx + 1] : prev;
        });
      }, 2500);
      try {
        const result = await trainingApiRequest<SimulationResponse>('POST', '/simulate', {
          scenarioId,
          personaId,
          campaignId: campaignId?.startsWith('demo-') ? null : campaignId,
          accountId: accountId?.startsWith('demo-') ? null : accountId,
          contactId: contactId?.startsWith('demo-') ? null : contactId,
          inputScenario: simulationInput,
        });
        clearInterval(progressInterval);
        setSimProgress(100);
        setSimProgressText('Complete');
        return result;
      } catch (err) {
        clearInterval(progressInterval);
        setSimProgress(0);
        setSimProgressText('');
        throw err;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['voice-training-simulation-history'] });
      queryClient.invalidateQueries({ queryKey: ['voice-training-activity-log'] });
      queryClient.invalidateQueries({ queryKey: ['voice-training-overview'] });
    },
  });

  // ── New mutations for 12 improvements ──────────────────────────────────

  const createCustomScenarioMutation = useMutation({
    mutationFn: async () => trainingApiRequest('POST', '/custom-scenarios', {
      title: newScenarioTitle.trim(),
      description: newScenarioDescription.trim(),
      defaultPersonaId: newScenarioPersona,
      defaultObjections: newScenarioObjections.split(',').map(s => s.trim()).filter(Boolean),
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['voice-training-simulation-options'] });
      setNewScenarioTitle(''); setNewScenarioDescription(''); setNewScenarioObjections('');
      setShowCustomScenarioForm(false);
      toast({ title: 'Scenario created', description: 'Custom scenario saved.' });
    },
    onError: (err: unknown) => toast({ title: 'Failed to create scenario', description: getErrorMessage(err), variant: 'destructive' }),
  });

  const deleteCustomScenarioMutation = useMutation({
    mutationFn: async (id: string) => trainingApiRequest('DELETE', `/custom-scenarios/${id}`),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['voice-training-simulation-options'] }); },
  });

  const approveCustomScenarioMutation = useMutation({
    mutationFn: async (id: string) => trainingApiRequest('POST', `/custom-scenarios/${id}/approve`),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['voice-training-simulation-options'] }); },
  });

  const addCommentMutation = useMutation({
    mutationFn: async () => trainingApiRequest('POST', `/sections/${selectedSectionId}/comments`, { content: newCommentText.trim() }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['voice-training-section-comments', selectedSectionId] });
      setNewCommentText('');
      toast({ title: 'Comment added' });
    },
    onError: (err: unknown) => toast({ title: 'Failed to add comment', description: getErrorMessage(err), variant: 'destructive' }),
  });

  const resolveCommentMutation = useMutation({
    mutationFn: async (commentId: string) => trainingApiRequest('POST', `/sections/${selectedSectionId}/comments/${commentId}/resolve`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['voice-training-section-comments', selectedSectionId] });
    },
  });

  const createSnippetMutation = useMutation({
    mutationFn: async () => trainingApiRequest('POST', '/snippets', {
      title: newSnippetTitle.trim(),
      content: newSnippetContent.trim(),
      category: newSnippetCategory.trim(),
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['voice-training-snippets'] });
      setNewSnippetTitle(''); setNewSnippetContent(''); setNewSnippetCategory('general');
      toast({ title: 'Snippet created' });
    },
    onError: (err: unknown) => toast({ title: 'Failed to create snippet', description: getErrorMessage(err), variant: 'destructive' }),
  });

  const deleteSnippetMutation = useMutation({
    mutationFn: async (id: string) => trainingApiRequest('DELETE', `/snippets/${id}`),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['voice-training-snippets'] }); },
  });

  const approveSnippetMutation = useMutation({
    mutationFn: async (id: string) => trainingApiRequest('POST', `/snippets/${id}/approve`),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['voice-training-snippets'] }); },
  });

  const publishMutation = useMutation({
    mutationFn: async () => trainingApiRequest<{ success: boolean }>('POST', '/publish', { note: publishNote }),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['voice-training-overview'] }),
        queryClient.invalidateQueries({ queryKey: ['voice-training-draft'] }),
        queryClient.invalidateQueries({ queryKey: ['voice-training-versions'] }),
      ]);
      toast({ title: 'Published', description: 'Draft promoted to production unified voice version.' });
    },
    onError: (err: unknown) => {
      toast({ title: 'Publish failed', description: getErrorMessage(err), variant: 'destructive' });
    },
  });

  const rollbackMutation = useMutation({
    mutationFn: async (version: number) => trainingApiRequest<{ success: boolean }>('POST', `/rollback-draft/${version}`, {}),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['voice-training-draft'] }),
        queryClient.invalidateQueries({ queryKey: ['voice-training-versions'] }),
      ]);
      toast({ title: 'Draft restored', description: 'Rollback complete.' });
    },
    onError: (err: unknown) => {
      toast({ title: 'Rollback failed', description: getErrorMessage(err), variant: 'destructive' });
    },
  });

  // ── Approval Workflow ──────────────────────────────────────────────

  // ── Live Voice Test ──────────────────────────────────────────────

  const liveTestHistoryQuery = useQuery<LiveTestHistoryResponse>({
    queryKey: ['voice-training-live-test-history'],
    queryFn: async () => trainingApiRequest<LiveTestHistoryResponse>('GET', '/live-test/history?limit=10'),
  });

  const saveLiveTestResultMutation = useMutation<{ success: boolean; record: LiveTestRecord }, unknown, {
    transcript: LiveTestTranscriptTurn[];
    durationSec: number;
    voiceId: string;
    startedAt: string;
  }>({
    mutationFn: async (payload) => trainingApiRequest('POST', '/live-test/result', payload),
    onSuccess: async (data) => {
      await queryClient.invalidateQueries({ queryKey: ['voice-training-live-test-history'] });
      setLiveTestResult((data as any).record);
      setLiveTestState('idle');
    },
    onError: (err: unknown) => {
      toast({ title: 'Failed to save test result', description: getErrorMessage(err), variant: 'destructive' });
      setLiveTestState('idle');
    },
  });

  const cleanupLiveTest = useCallback(() => {
    if (rtcClientRef.current) {
      try { rtcClientRef.current.disconnect(); } catch {}
      rtcClientRef.current = null;
    }
    if (micStreamRef.current) {
      micStreamRef.current.getTracks().forEach(t => t.stop());
      micStreamRef.current = null;
    }
    if (audioElementRef.current) {
      audioElementRef.current.pause();
      audioElementRef.current.srcObject = null;
    }
    if (durationIntervalRef.current) {
      clearInterval(durationIntervalRef.current);
      durationIntervalRef.current = null;
    }
  }, []);

  const startLiveTest = useCallback(async () => {
    try {
      setLiveTestState('connecting');
      setLiveTranscript([]);
      setLiveTestDuration(0);
      setLiveTestResult(null);

      // 1. Fetch draft prompt (with optional module/scenario filters)
      const queryParams = new URLSearchParams();
      if (liveTestSectionIds.length > 0) {
        queryParams.set('sectionIds', liveTestSectionIds.join(','));
      }
      if (liveTestScenarioId && liveTestScenarioId !== 'none') {
        queryParams.set('scenarioId', liveTestScenarioId);
      }
      const qs = queryParams.toString();
      const draftPrompt = await trainingApiRequest<DraftPromptResponse>('GET', `/live-test/draft-prompt${qs ? `?${qs}` : ''}`);

      // 2. Request microphone
      const micStream = await navigator.mediaDevices.getUserMedia({ audio: true });
      micStreamRef.current = micStream;
      const micTrack = micStream.getAudioTracks()[0];

      // 3. Create audio element for playback
      if (!audioElementRef.current) {
        audioElementRef.current = new Audio();
        audioElementRef.current.autoplay = true;
      }

      const startTime = new Date().toISOString();
      setLiveTestStartedAt(startTime);

      // 4. Create WebRTC client
      const client = new OpenAIRealtimeWebRTCClient({
        ephemeralTokenEndpoint: '/api/openai/webrtc/ephemeral-token',
        model: 'gpt-4o-realtime-preview-2024-12-17',
        voice: liveTestVoice,
        instructions: draftPrompt.prompt,
        inputAudioTranscription: { model: 'whisper-1' },
        turnDetection: {
          type: 'server_vad',
          threshold: 0.5,
          silence_duration_ms: 800,
          create_response: true,
        },
        onStateChange: (state: OpenAIRealtimeState) => {
          if (state === 'connected') {
            setLiveTestState('connected');
          } else if (state === 'error') {
            toast({ title: 'Connection lost', description: 'WebRTC connection error.', variant: 'destructive' });
          }
        },
        onAudioOutput: (track: MediaStreamTrack) => {
          if (audioElementRef.current) {
            audioElementRef.current.srcObject = new MediaStream([track]);
          }
        },
        onTranscript: (t: { role: 'user' | 'assistant'; text: string; isFinal: boolean }) => {
          if (t.isFinal && t.text.trim()) {
            setLiveTranscript(prev => [...prev, { role: t.role, text: t.text, timestamp: new Date().toISOString() }]);
          }
        },
        onError: (error: Error) => {
          console.error('[LiveTest] WebRTC error:', error);
          toast({ title: 'Voice test error', description: error.message, variant: 'destructive' });
        },
      });

      rtcClientRef.current = client;
      await client.connect(micTrack);

      // 5. Start duration timer
      durationIntervalRef.current = setInterval(() => {
        setLiveTestDuration(prev => prev + 1);
      }, 1000);

    } catch (err: unknown) {
      cleanupLiveTest();
      setLiveTestState('idle');
      const msg = err instanceof Error ? err.message : 'Failed to start voice test';
      if (msg.includes('Permission denied') || msg.includes('NotAllowedError')) {
        toast({ title: 'Microphone access denied', description: 'Please allow microphone access to use live voice testing.', variant: 'destructive' });
      } else {
        toast({ title: 'Live test failed', description: msg, variant: 'destructive' });
      }
    }
  }, [liveTestVoice, cleanupLiveTest, toast]);

  const endLiveTest = useCallback(async () => {
    setLiveTestState('ending');
    cleanupLiveTest();

    // Score and save
    const finalTranscript = [...liveTranscript];
    if (finalTranscript.length === 0) {
      toast({ title: 'No transcript', description: 'The conversation had no transcribed content.', variant: 'default' });
      setLiveTestState('idle');
      return;
    }

    setLiveTestState('scoring');
    saveLiveTestResultMutation.mutate({
      transcript: finalTranscript,
      durationSec: liveTestDuration,
      voiceId: liveTestVoice,
      startedAt: liveTestStartedAt,
    });
  }, [liveTranscript, liveTestDuration, liveTestVoice, liveTestStartedAt, cleanupLiveTest, saveLiveTestResultMutation, toast]);

  const toggleMute = useCallback(() => {
    if (micStreamRef.current) {
      const track = micStreamRef.current.getAudioTracks()[0];
      if (track) {
        track.enabled = !track.enabled;
        setIsMuted(!track.enabled);
      }
    }
  }, []);

  // Scroll transcript to bottom on new messages
  useEffect(() => {
    transcriptEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [liveTranscript]);

  // Cleanup on unmount
  useEffect(() => {
    return () => { cleanupLiveTest(); };
  }, [cleanupLiveTest]);

  const publishRequestsQuery = useQuery<PublishRequestsResponse>({
    queryKey: ['voice-training-publish-requests'],
    queryFn: async () => trainingApiRequest<PublishRequestsResponse>('GET', '/publish-requests'),
  });

  const requestPublishMutation = useMutation({
    mutationFn: async () => trainingApiRequest<{ success: boolean }>('POST', '/request-publish', { note: publishNote }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['voice-training-publish-requests'] });
      setPublishNote('');
      toast({ title: 'Submitted for approval', description: 'Your publish request has been sent to an administrator for review.' });
    },
    onError: (err: unknown) => {
      toast({ title: 'Submit failed', description: getErrorMessage(err), variant: 'destructive' });
    },
  });

  const approveRequestMutation = useMutation({
    mutationFn: async (requestId: string) => trainingApiRequest<{ success: boolean }>('POST', `/publish-requests/${requestId}/approve`, { note: approvalReviewNote }),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['voice-training-overview'] }),
        queryClient.invalidateQueries({ queryKey: ['voice-training-draft'] }),
        queryClient.invalidateQueries({ queryKey: ['voice-training-versions'] }),
        queryClient.invalidateQueries({ queryKey: ['voice-training-publish-requests'] }),
      ]);
      setApprovalReviewNote('');
      toast({ title: 'Approved & Published', description: 'Changes have been promoted to production.' });
    },
    onError: (err: unknown) => {
      toast({ title: 'Approval failed', description: getErrorMessage(err), variant: 'destructive' });
    },
  });

  const rejectRequestMutation = useMutation({
    mutationFn: async (requestId: string) => trainingApiRequest<{ success: boolean }>('POST', `/publish-requests/${requestId}/reject`, { note: rejectionNote }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['voice-training-publish-requests'] });
      setRejectionNote('');
      toast({ title: 'Rejected', description: 'Publish request has been rejected with feedback.' });
    },
    onError: (err: unknown) => {
      toast({ title: 'Rejection failed', description: getErrorMessage(err), variant: 'destructive' });
    },
  });

  const pendingRequests = (publishRequestsQuery.data?.requests || []).filter((r) => r.status === 'pending');

  const loading = overviewQuery.isLoading || draftQuery.isLoading;
  const hasLoadError = overviewQuery.isError || draftQuery.isError;

  const loadErrorMessage = overviewQuery.error
    ? getErrorMessage(overviewQuery.error)
    : draftQuery.error
      ? getErrorMessage(draftQuery.error)
      : 'Unknown error';

  if (loading) {
    return (
      <div className="p-6 space-y-4">
        <div className="flex items-start justify-between gap-4">
          <div className="space-y-2">
            <Skeleton className="h-8 w-[360px]" />
            <Skeleton className="h-4 w-[500px]" />
          </div>
          <div className="flex gap-2">
            <Skeleton className="h-6 w-[120px] rounded-full" />
            <Skeleton className="h-6 w-[100px] rounded-full" />
          </div>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[1,2,3,4].map(i => (
            <Card key={i}><CardContent className="pt-4 pb-3 space-y-2"><Skeleton className="h-4 w-24" /><Skeleton className="h-8 w-16" /><Skeleton className="h-3 w-32" /></CardContent></Card>
          ))}
        </div>
        <Skeleton className="h-10 w-[400px]" />
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <Skeleton className="h-[420px]" />
          <Skeleton className="h-[420px] lg:col-span-2" />
        </div>
      </div>
    );
  }

  if (hasLoadError) {
    return (
      <div className="p-6">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Unable to load Voice Agent Training data</CardTitle>
            <CardDescription>
              {loadErrorMessage}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button
              onClick={() => {
                overviewQuery.refetch();
                draftQuery.refetch();
              }}
            >
              Retry
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <TooltipProvider delayDuration={300}>
    <div className="p-6 space-y-4">
      {/* ── Header ─────────────────────────────────────────────── */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Bot className="h-6 w-6 text-primary" />
            Voice Agent Training Dashboard
            {isAdmin && <Badge className="ml-2 bg-blue-600 hover:bg-blue-700 text-white text-[10px]"><Shield className="h-3 w-3 mr-1" />Admin</Badge>}
            {isVoiceTrainer && <Badge className="ml-2 bg-purple-600 hover:bg-purple-700 text-white text-[10px]"><Pencil className="h-3 w-3 mr-1" />Voice Trainer</Badge>}
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Unified voice prompt iteration, simulation, and controlled publish.
          </p>
        </div>
        <div className="flex gap-2">
          <Badge variant="outline">Production v{overviewQuery.data?.production?.version || 'n/a'}</Badge>
          <Badge variant="secondary">Draft v{draftQuery.data?.draftVersion || 'n/a'}</Badge>
        </div>
      </div>

      {/* ── KPI Stats Row ──────────────────────────────────────── */}
      {overviewQuery.data?.stats && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <Card className="border-l-4 border-l-blue-500">
            <CardContent className="pt-4 pb-3">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide">Simulations</p>
                  <p className="text-2xl font-bold mt-1">{overviewQuery.data.stats.totalSimulations}</p>
                </div>
                <div className="h-10 w-10 rounded-full bg-blue-100 dark:bg-blue-950/40 flex items-center justify-center">
                  <FlaskConical className="h-5 w-5 text-blue-600 dark:text-blue-400" />
                </div>
              </div>
              <p className="text-xs text-muted-foreground mt-1">Avg score: <span className="font-medium">{overviewQuery.data.stats.avgSimScore || '—'}</span></p>
            </CardContent>
          </Card>
          <Card className="border-l-4 border-l-emerald-500">
            <CardContent className="pt-4 pb-3">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide">Prompt Health</p>
                  <p className="text-2xl font-bold mt-1">{overviewQuery.data.stats.modifiedSections}</p>
                </div>
                <div className="h-10 w-10 rounded-full bg-emerald-100 dark:bg-emerald-950/40 flex items-center justify-center">
                  <Pencil className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
                </div>
              </div>
              <p className="text-xs text-muted-foreground mt-1">Modified sections · {overviewQuery.data.stats.totalComments} comments</p>
            </CardContent>
          </Card>
          <Card className="border-l-4 border-l-amber-500">
            <CardContent className="pt-4 pb-3">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide">Pending</p>
                  <p className="text-2xl font-bold mt-1">{overviewQuery.data.stats.pendingApprovals}</p>
                </div>
                <div className="h-10 w-10 rounded-full bg-amber-100 dark:bg-amber-950/40 flex items-center justify-center">
                  <Clock className="h-5 w-5 text-amber-600 dark:text-amber-400" />
                </div>
              </div>
              <p className="text-xs text-muted-foreground mt-1">{overviewQuery.data.stats.snippetCount} snippets · {overviewQuery.data.stats.customScenarioCount} scenarios</p>
            </CardContent>
          </Card>
          <Card className="border-l-4 border-l-violet-500">
            <CardContent className="pt-4 pb-3">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide">Last Activity</p>
                  <p className="text-sm font-bold mt-2">
                    {overviewQuery.data.stats.lastActivity
                      ? new Date(overviewQuery.data.stats.lastActivity).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
                      : 'None'}
                  </p>
                </div>
                <div className="h-10 w-10 rounded-full bg-violet-100 dark:bg-violet-950/40 flex items-center justify-center">
                  <History className="h-5 w-5 text-violet-600 dark:text-violet-400" />
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      <Tabs defaultValue="prompts" className="space-y-4">
        <TabsList className="grid w-full grid-cols-4 lg:w-auto lg:inline-flex">
          <TabsTrigger value="prompts" className="gap-1.5">Prompt Management <Badge variant="secondary" className="h-5 px-1.5 text-[10px]">{sections.length}</Badge></TabsTrigger>
          <TabsTrigger value="simulation" className="gap-1.5">Simulation <Badge variant="secondary" className="h-5 px-1.5 text-[10px]">{simulationHistoryQuery.data?.records?.length || 0}</Badge></TabsTrigger>
          <TabsTrigger value="versions" className="gap-1.5">Version Control {pendingRequests.length > 0 && <Badge variant="destructive" className="h-5 px-1.5 text-[10px]">{pendingRequests.length}</Badge>}</TabsTrigger>
          <TabsTrigger value="data">Sample Dataset</TabsTrigger>
        </TabsList>

        <TabsContent value="prompts" className="space-y-4">
          {/* ── 3-Panel Resizable Layout ─────────────────────────── */}
          <Card className="overflow-hidden">
            <ResizablePanelGroup direction="horizontal" className="min-h-[560px]">
              {/* ── Left: Section List ─────────────────────────────── */}
              <ResizablePanel defaultSize={25} minSize={18} maxSize={35}>
                <div className="flex flex-col h-full">
                  <div className="p-3 border-b space-y-2">
                    <h3 className="text-sm font-semibold">Prompt Modules</h3>
                    <div className="relative">
                      <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
                      <Input
                        value={sectionSearchQuery}
                        onChange={(e) => setSectionSearchQuery(e.target.value)}
                        placeholder="Search sections..."
                        className="pl-8 h-8 text-xs"
                      />
                    </div>
                  </div>
                  <ScrollArea className="flex-1">
                    <div className="p-2 space-y-3">
                      {Object.entries(sectionsByCategory).map(([category, catSections]) => (
                        <div key={category}>
                          <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider px-2 mb-1">{category}</p>
                          <div className="space-y-0.5">
                            {catSections.map((section) => {
                              const tokenEst = Math.ceil(section.content.length / 4);
                              const prodSection = productionSectionsQuery.data?.sections?.[section.sectionId];
                              const hasDrift = prodSection && prodSection.content !== section.content;
                              return (
                                <button
                                  key={section.sectionId}
                                  type="button"
                                  className={`w-full text-left px-2.5 py-2 rounded-md text-xs transition-colors ${
                                    selectedSectionId === section.sectionId
                                      ? 'bg-primary/10 border border-primary/30 text-primary'
                                      : 'hover:bg-muted/60 border border-transparent'
                                  }`}
                                  onClick={() => setSelectedSectionId(section.sectionId)}
                                >
                                  <div className="flex items-center justify-between">
                                    <span className="font-medium truncate">{section.name}</span>
                                    <div className="flex items-center gap-1 shrink-0">
                                      {hasDrift && (
                                        <Tooltip>
                                          <TooltipTrigger asChild><span className="h-2 w-2 rounded-full bg-orange-500" /></TooltipTrigger>
                                          <TooltipContent side="left"><p className="text-xs">Differs from production</p></TooltipContent>
                                        </Tooltip>
                                      )}
                                    </div>
                                  </div>
                                  <div className="flex items-center gap-1.5 mt-0.5 text-muted-foreground">
                                    <span className="text-[10px]">{tokenEst}t</span>
                                  </div>
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      ))}
                      {filteredSections.length === 0 && (
                        <p className="text-xs text-muted-foreground text-center py-6">No sections match "{sectionSearchQuery}"</p>
                      )}
                    </div>
                  </ScrollArea>
                </div>
              </ResizablePanel>

              <ResizableHandle withHandle />

              {/* ── Center: Editor ────────────────────────────────── */}
              <ResizablePanel defaultSize={50} minSize={30}>
                <div className="flex flex-col h-full">
                  <div className="p-3 border-b">
                    <div className="flex items-center justify-between">
                      <div className="min-w-0">
                        <h3 className="text-sm font-semibold truncate">{selectedSection?.name || 'Select a section'}</h3>
                        <p className="text-[11px] text-muted-foreground">
                          {selectedSection ? `Last edited ${new Date(selectedSection.lastEditedAt).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}` : 'Choose a section to begin editing'}
                        </p>
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        <Tooltip><TooltipTrigger asChild>
                          <Button variant={showDiffView ? 'default' : 'ghost'} size="sm" className="h-7 w-7 p-0" onClick={() => setShowDiffView(!showDiffView)}>
                            {showDiffView ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                          </Button>
                        </TooltipTrigger><TooltipContent>Toggle diff view</TooltipContent></Tooltip>
                        <Tooltip><TooltipTrigger asChild>
                          <Button variant={showSnippets ? 'default' : 'ghost'} size="sm" className="h-7 w-7 p-0" onClick={() => setShowSnippets(!showSnippets)}>
                            <ClipboardList className="h-3.5 w-3.5" />
                          </Button>
                        </TooltipTrigger><TooltipContent>Snippet library</TooltipContent></Tooltip>
                        <Tooltip><TooltipTrigger asChild>
                          <Button variant={showComments ? 'default' : 'ghost'} size="sm" className="h-7 w-7 p-0" onClick={() => setShowComments(!showComments)}>
                            <MessageSquare className="h-3.5 w-3.5" />
                          </Button>
                        </TooltipTrigger><TooltipContent>Comments</TooltipContent></Tooltip>
                      </div>
                    </div>
                    {/* Toolbar: word/token count */}
                    {selectedSection && (
                      <div className="flex items-center gap-3 mt-2 text-[11px] text-muted-foreground">
                        <span>{wordCount} words</span>
                        <span className="text-border">|</span>
                        <span className={tokenEstimate > 1000 ? 'text-red-500 font-medium' : tokenEstimate > 500 ? 'text-yellow-600' : ''}>{tokenEstimate} tokens</span>
                        <span className="text-border">|</span>
                        <span>{sectionContent.length} chars</span>
                      </div>
                    )}
                  </div>

                  {/* Diff View */}
                  {showDiffView && selectedSection && productionSectionsQuery.data?.sections?.[selectedSection.sectionId] && (
                    <div className="border-b">
                      <ResizablePanelGroup direction="horizontal" className="max-h-[200px]">
                        <ResizablePanel defaultSize={50}>
                          <div className="h-full overflow-auto p-3">
                            <p className="text-[10px] font-medium text-red-600 dark:text-red-400 mb-1 uppercase tracking-wide">Production</p>
                            <pre className="whitespace-pre-wrap text-xs text-muted-foreground">{productionSectionsQuery.data.sections[selectedSection.sectionId].content}</pre>
                          </div>
                        </ResizablePanel>
                        <ResizableHandle />
                        <ResizablePanel defaultSize={50}>
                          <div className="h-full overflow-auto p-3">
                            <p className="text-[10px] font-medium text-green-600 dark:text-green-400 mb-1 uppercase tracking-wide">Draft</p>
                            <pre className="whitespace-pre-wrap text-xs">{sectionContent}</pre>
                          </div>
                        </ResizablePanel>
                      </ResizablePanelGroup>
                    </div>
                  )}

                  <div className="flex-1 p-3 flex flex-col gap-2">
                    <Textarea
                      ref={sectionEditorRef}
                      value={sectionContent}
                      onChange={(e) => setSectionContent(e.target.value)}
                      className="flex-1 min-h-[240px] font-mono text-xs resize-none"
                      placeholder="Edit prompt section content"
                    />
                    <div className="flex items-center gap-2">
                      <Input
                        value={changeLog}
                        onChange={(e) => setChangeLog(e.target.value)}
                        placeholder="Change log (required)"
                        className="flex-1 h-8 text-xs"
                      />
                      <Button
                        size="sm"
                        onClick={() => saveSectionMutation.mutate()}
                        disabled={!selectedSectionId || !changeLog.trim() || saveSectionMutation.isPending}
                      >
                        <Save className="h-3.5 w-3.5 mr-1.5" />
                        Save
                      </Button>
                    </div>
                  </div>
                </div>
              </ResizablePanel>

              <ResizableHandle withHandle />

              {/* ── Right: Context Panel (Snippets / Comments) ───── */}
              <ResizablePanel defaultSize={25} minSize={18} maxSize={35}>
                <div className="flex flex-col h-full">
                  <div className="p-3 border-b">
                    <Tabs defaultValue="snippets" className="w-full">
                      <TabsList className="w-full h-8">
                        <TabsTrigger value="snippets" className="text-xs flex-1">Snippets</TabsTrigger>
                        <TabsTrigger value="comments" className="text-xs flex-1">Comments</TabsTrigger>
                      </TabsList>
                    </Tabs>
                  </div>
                  <ScrollArea className="flex-1">
                    {/* Always show snippets or comments based on toggle */}
                    {showComments && selectedSectionId ? (
                      <div className="p-3 space-y-2">
                        {(sectionCommentsQuery.data?.comments || []).map(comment => (
                          <div key={comment.id} className={`border rounded-lg p-2.5 text-xs ${comment.resolved ? 'opacity-50' : ''}`}>
                            <div className="flex items-center justify-between">
                              <span className="font-medium">{comment.userId}</span>
                              <div className="flex items-center gap-1">
                                <span className="text-[10px] text-muted-foreground">
                                  {new Date(comment.createdAt).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                                </span>
                                {!comment.resolved && (
                                  <Tooltip><TooltipTrigger asChild>
                                    <Button variant="ghost" size="sm" className="h-5 w-5 p-0" onClick={() => resolveCommentMutation.mutate(comment.id)}>
                                      <CheckCircle className="h-3 w-3 text-green-600" />
                                    </Button>
                                  </TooltipTrigger><TooltipContent>Resolve</TooltipContent></Tooltip>
                                )}
                              </div>
                            </div>
                            <p className="mt-1">{comment.content}</p>
                            {comment.resolved && <Badge variant="outline" className="text-[10px] mt-1">Resolved</Badge>}
                          </div>
                        ))}
                        {!(sectionCommentsQuery.data?.comments || []).length && (
                          <div className="text-center py-8">
                            <MessageSquare className="h-8 w-8 text-muted-foreground/30 mx-auto mb-2" />
                            <p className="text-xs text-muted-foreground">No comments yet</p>
                          </div>
                        )}
                        <div className="flex gap-1.5 pt-2 border-t">
                          <Input
                            value={newCommentText}
                            onChange={(e) => setNewCommentText(e.target.value)}
                            placeholder="Add comment..."
                            className="text-xs h-8"
                            onKeyDown={(e) => { if (e.key === 'Enter' && newCommentText.trim()) addCommentMutation.mutate(); }}
                          />
                          <Tooltip><TooltipTrigger asChild>
                            <Button size="sm" className="h-8 w-8 p-0" onClick={() => addCommentMutation.mutate()} disabled={!newCommentText.trim() || addCommentMutation.isPending}>
                              <Send className="h-3.5 w-3.5" />
                            </Button>
                          </TooltipTrigger><TooltipContent>Send</TooltipContent></Tooltip>
                        </div>
                      </div>
                    ) : (
                      <div className="p-3 space-y-2">
                        <div className="flex items-center justify-between mb-1">
                          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Snippet Library</p>
                          <Dialog>
                            <DialogTrigger asChild>
                              <Button size="sm" variant="ghost" className="h-6 px-2 text-xs">
                                <Plus className="h-3 w-3 mr-1" />New
                              </Button>
                            </DialogTrigger>
                            <DialogContent>
                              <DialogHeader>
                                <DialogTitle>Create Snippet</DialogTitle>
                                <DialogDescription>Add a reusable prompt snippet to the library.</DialogDescription>
                              </DialogHeader>
                              <div className="space-y-3 py-2">
                                <div><Label className="text-xs">Title</Label><Input value={newSnippetTitle === 'new' ? '' : newSnippetTitle} onChange={(e) => setNewSnippetTitle(e.target.value)} placeholder="Snippet title" /></div>
                                <div><Label className="text-xs">Category</Label><Input value={newSnippetCategory} onChange={(e) => setNewSnippetCategory(e.target.value)} placeholder="Category" /></div>
                                <div><Label className="text-xs">Content</Label><Textarea value={newSnippetContent} onChange={(e) => setNewSnippetContent(e.target.value)} placeholder="Snippet content" className="min-h-[80px] text-xs" /></div>
                              </div>
                              <DialogFooter>
                                <Button size="sm" onClick={() => createSnippetMutation.mutate()} disabled={createSnippetMutation.isPending || !newSnippetContent.trim() || !newSnippetTitle.trim()}>
                                  Create Snippet
                                </Button>
                              </DialogFooter>
                            </DialogContent>
                          </Dialog>
                        </div>
                        {(snippetsQuery.data?.snippets || []).map(snip => (
                          <div key={snip.id} className="border rounded-lg p-2.5 text-xs hover:border-primary/30 transition-colors">
                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-1.5 min-w-0">
                                <span className="font-medium truncate">{snip.title}</span>
                                <Badge variant="outline" className="text-[10px] h-4 shrink-0">{snip.category}</Badge>
                              </div>
                            </div>
                            <p className="text-muted-foreground truncate mt-1">{snip.content.slice(0, 80)}</p>
                            <div className="flex items-center gap-1 mt-1.5">
                              <Button variant="outline" size="sm" className="h-6 px-2 text-[10px]" onClick={() => {
                                const el = sectionEditorRef.current;
                                if (el) {
                                  const start = el.selectionStart;
                                  const newVal = sectionContent.slice(0, start) + snip.content + sectionContent.slice(start);
                                  setSectionContent(newVal);
                                } else {
                                  setSectionContent(prev => prev + '\n' + snip.content);
                                }
                                toast({ title: 'Inserted', description: `"${snip.title}" added to editor.` });
                              }}>Insert</Button>
                              {isAdmin && !snip.isApproved && (
                                <Tooltip><TooltipTrigger asChild>
                                  <Button variant="ghost" size="sm" className="h-6 w-6 p-0" onClick={() => approveSnippetMutation.mutate(snip.id)}>
                                    <ThumbsUp className="h-3 w-3" />
                                  </Button>
                                </TooltipTrigger><TooltipContent>Approve</TooltipContent></Tooltip>
                              )}
                              {(isAdmin || snip.createdBy === (user as any)?.id) && (
                                <Tooltip><TooltipTrigger asChild>
                                  <Button variant="ghost" size="sm" className="h-6 w-6 p-0 text-destructive" onClick={() => setDeleteConfirmTarget({ type: 'snippet', id: snip.id, name: snip.title })}>
                                    <Trash2 className="h-3 w-3" />
                                  </Button>
                                </TooltipTrigger><TooltipContent>Delete</TooltipContent></Tooltip>
                              )}
                            </div>
                          </div>
                        ))}
                        {!(snippetsQuery.data?.snippets || []).length && (
                          <div className="text-center py-8">
                            <ClipboardList className="h-8 w-8 text-muted-foreground/30 mx-auto mb-2" />
                            <p className="text-xs text-muted-foreground">No snippets yet</p>
                            <p className="text-[10px] text-muted-foreground">Create one to get started</p>
                          </div>
                        )}
                      </div>
                    )}
                  </ScrollArea>
                </div>
              </ResizablePanel>
            </ResizablePanelGroup>
          </Card>

          {/* ── Voice Config (Collapsible) ────────────────────────── */}
          <Collapsible open={voiceConfigOpen} onOpenChange={setVoiceConfigOpen}>
            <Card>
              <CollapsibleTrigger asChild>
                <CardHeader className="cursor-pointer hover:bg-muted/30 transition-colors">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Mic className="h-4 w-4" />
                      <CardTitle className="text-base">Gemini Voice Configuration</CardTitle>
                      <Badge variant="outline" className="text-[10px]">{voiceConfig.voiceId}</Badge>
                    </div>
                    {voiceConfigOpen ? <ChevronDown className="h-4 w-4 text-muted-foreground" /> : <ChevronRight className="h-4 w-4 text-muted-foreground" />}
                  </div>
                  <CardDescription>Bound to current draft and promoted with publish</CardDescription>
                </CardHeader>
              </CollapsibleTrigger>
              <CollapsibleContent>
                <CardContent className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-3 pt-0">
                  <div>
                    <Label className="text-xs">Provider</Label>
                    <Input value={voiceConfig.provider} onChange={(e) => setVoiceConfig((prev) => ({ ...prev, provider: e.target.value }))} className="h-8 text-xs" />
                  </div>
                  <div>
                    <Label className="text-xs">Voice ID</Label>
                    <Select value={voiceConfig.voiceId} onValueChange={(v) => setVoiceConfig((prev) => ({ ...prev, voiceId: v }))}>
                      <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {(voicesQuery.data?.voices || []).map((voice) => (
                          <SelectItem key={voice.id} value={voice.id}>{voice.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label className="text-xs">Speaking Rate</Label>
                    <Input type="number" step="0.1" value={voiceConfig.speakingRate} onChange={(e) => setVoiceConfig((prev) => ({ ...prev, speakingRate: Number(e.target.value) || 1 }))} className="h-8 text-xs" />
                  </div>
                  <div>
                    <Label className="text-xs">Tone</Label>
                    <Input value={voiceConfig.tone} onChange={(e) => setVoiceConfig((prev) => ({ ...prev, tone: e.target.value }))} className="h-8 text-xs" />
                  </div>
                  <div>
                    <Label className="text-xs">Clarity</Label>
                    <Input type="number" step="0.1" value={voiceConfig.clarity} onChange={(e) => setVoiceConfig((prev) => ({ ...prev, clarity: Number(e.target.value) || 1 }))} className="h-8 text-xs" />
                  </div>
                  <div className="md:col-span-2 lg:col-span-5 flex justify-end">
                    <Button size="sm" onClick={() => saveVoiceConfigMutation.mutate()} disabled={saveVoiceConfigMutation.isPending}>
                      <Save className="h-3.5 w-3.5 mr-1.5" />Save Voice Config
                    </Button>
                  </div>
                </CardContent>
              </CollapsibleContent>
            </Card>
          </Collapsible>
        </TabsContent>

        <TabsContent value="simulation" className="space-y-4">
          {/* ── Simulation Config ────────────────────────────────── */}
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-base flex items-center gap-2"><FlaskConical className="h-4 w-4" /> Scenario Simulation Engine</CardTitle>
                  <CardDescription>Telephony-free test calls with controlled personas and sample contacts</CardDescription>
                </div>
                {simulationMutation.isPending && (
                  <Badge variant="secondary" className="gap-1">
                    <div className="h-2 w-2 rounded-full bg-yellow-500 animate-pulse" />
                    Running...
                  </Badge>
                )}
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <div>
                  <Label className="text-xs">Scenario</Label>
                  <Select value={scenarioId} onValueChange={setScenarioId}>
                    <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {(simulationOptionsQuery.data?.scenarios || []).map((s) => (
                        <SelectItem key={s.id} value={s.id}>{s.title}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-xs">Persona</Label>
                  <Select value={personaId} onValueChange={setPersonaId}>
                    <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {(simulationOptionsQuery.data?.personas || []).map((p) => (
                        <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-xs">Campaign</Label>
                  <Select value={campaignId} onValueChange={setCampaignId}>
                    <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {(sampleDataQuery.data?.campaigns || []).map((c) => (
                        <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs">Account</Label>
                  <Select value={accountId} onValueChange={setAccountId}>
                    <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {(sampleDataQuery.data?.accounts || []).map((a) => (
                        <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-xs">Contact</Label>
                  <Select value={contactId} onValueChange={setContactId}>
                    <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {(sampleDataQuery.data?.contacts || []).map((c) => (
                        <SelectItem key={c.id} value={c.id}>{c.name} — {c.title}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div>
                <Label className="text-xs">Simulation Input</Label>
                <Textarea value={simulationInput} onChange={(e) => setSimulationInput(e.target.value)} className="min-h-[80px] text-xs" />
              </div>

              {/* Progress indicator */}
              {simulationMutation.isPending && (
                <div className="space-y-2 bg-muted/30 rounded-lg p-4">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-muted-foreground">{simProgressText}</span>
                    <span className="font-medium">{Math.round(simProgress)}%</span>
                  </div>
                  <Progress value={simProgress} className="h-2" />
                </div>
              )}

              <div className="flex justify-end">
                <Button onClick={() => simulationMutation.mutate()} disabled={simulationMutation.isPending} size="sm">
                  <Play className="h-3.5 w-3.5 mr-1.5" />
                  {simulationMutation.isPending ? 'Running Simulation...' : 'Run Simulation'}
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* ── Simulation Result (Tabbed) ────────────────────────── */}
          {simulationMutation.data && (
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="text-base">Simulation Result</CardTitle>
                    <CardDescription>
                      {simulationMutation.data.simulation?.usedDraftPrompt
                        ? `Using your current draft prompt (v${simulationMutation.data.simulation.draftVersion}, ${simulationMutation.data.simulation.draftSectionCount} sections)`
                        : `${simulationMutation.data.simulation?.turns || 0} turns completed`}
                    </CardDescription>
                  </div>
                  {simulationMutation.data.simulation?.scores && (
                    <div className="flex items-center gap-2">
                      <Badge variant={simulationMutation.data.simulation.scores.overall >= 70 ? 'default' : 'destructive'} className="text-lg px-3 py-1">
                        {simulationMutation.data.simulation.scores.overall}/100
                      </Badge>
                    </div>
                  )}
                </div>
              </CardHeader>
              <CardContent>
                <Tabs value={simResultTab} onValueChange={(v) => setSimResultTab(v as 'scores' | 'transcript' | 'analysis')}>
                  <TabsList className="mb-4">
                    <TabsTrigger value="scores" className="gap-1"><Target className="h-3.5 w-3.5" />Scores</TabsTrigger>
                    <TabsTrigger value="transcript" className="gap-1"><MessageSquare className="h-3.5 w-3.5" />Transcript</TabsTrigger>
                    <TabsTrigger value="analysis" className="gap-1"><AlertCircle className="h-3.5 w-3.5" />Analysis</TabsTrigger>
                  </TabsList>

                  <TabsContent value="scores" className="space-y-4">
                    {simulationMutation.data.simulation?.scores && (() => {
                      const scores = simulationMutation.data.simulation!.scores!;
                      const radarData = [
                        { subject: 'Tone', value: scores.toneAdherence, fullMark: 100 },
                        { subject: 'Objections', value: scores.objectionHandling, fullMark: 100 },
                        { subject: 'Identity', value: scores.identityLock, fullMark: 100 },
                        { subject: 'Call Flow', value: scores.callFlow, fullMark: 100 },
                      ];
                      const barData = Object.entries(scores).filter(([k]) => k !== 'overall').map(([key, val]) => ({
                        name: key.replace(/([A-Z])/g, ' $1').trim(),
                        score: val as number,
                        fill: (val as number) >= 80 ? '#22c55e' : (val as number) >= 50 ? '#eab308' : '#ef4444',
                      }));
                      return (
                        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                          <div className="h-[280px]">
                            <ResponsiveContainer width="100%" height="100%">
                              <RadarChart data={radarData}>
                                <PolarGrid strokeDasharray="3 3" />
                                <PolarAngleAxis dataKey="subject" className="text-xs" />
                                <PolarRadiusAxis angle={30} domain={[0, 100]} />
                                <Radar name="Score" dataKey="value" stroke="hsl(var(--primary))" fill="hsl(var(--primary))" fillOpacity={0.2} />
                              </RadarChart>
                            </ResponsiveContainer>
                          </div>
                          <div className="h-[280px]">
                            <ResponsiveContainer width="100%" height="100%">
                              <BarChart data={barData} layout="vertical">
                                <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                                <XAxis type="number" domain={[0, 100]} />
                                <YAxis type="category" dataKey="name" width={100} className="text-xs" />
                                <RechartsTooltip />
                                <Bar dataKey="score" radius={[0, 4, 4, 0]}>
                                  {barData.map((entry, idx) => (
                                    <rect key={idx} fill={entry.fill} />
                                  ))}
                                </Bar>
                              </BarChart>
                            </ResponsiveContainer>
                          </div>
                        </div>
                      );
                    })()}
                    {/* Score cards row */}
                    {simulationMutation.data.simulation?.scores && (
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                        {Object.entries(simulationMutation.data.simulation.scores).filter(([k]) => k !== 'overall').map(([key, val]) => (
                          <div key={key} className="text-center p-3 rounded-lg border bg-card">
                            <p className={`text-xl font-bold ${(val as number) >= 80 ? 'text-green-600' : (val as number) >= 50 ? 'text-yellow-600' : 'text-red-600'}`}>{val as number}</p>
                            <p className="text-[10px] text-muted-foreground capitalize mt-0.5">{key.replace(/([A-Z])/g, ' $1').trim()}</p>
                            <div className="mt-1.5 h-1.5 w-full bg-muted rounded-full overflow-hidden">
                              <div className={`h-full rounded-full ${(val as number) >= 80 ? 'bg-green-500' : (val as number) >= 50 ? 'bg-yellow-500' : 'bg-red-500'}`} style={{ width: `${val}%` }} />
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </TabsContent>

                  <TabsContent value="transcript">
                    {simulationMutation.data.simulation?.transcriptPreview && (
                      <div>
                        <div className="flex items-center justify-between mb-2">
                          <p className="text-xs text-muted-foreground">{simulationMutation.data.simulation?.transcriptPreview?.length || 0} turns</p>
                        </div>
                        <ScrollArea className="h-[400px] rounded-md border p-3">
                          <div className="space-y-2">
                            {(Array.isArray(simulationMutation.data.simulation.transcriptPreview) ? simulationMutation.data.simulation.transcriptPreview : []).map((turn: { role: string; content: string }, i: number) => (
                              <div key={i} className={`flex ${turn.role === 'human' ? 'justify-end' : 'justify-start'}`}>
                                <div className={`max-w-[80%] rounded-lg px-3 py-2 text-sm ${turn.role === 'human' ? 'bg-primary text-primary-foreground' : 'bg-muted'}`}>
                                  <p className="text-[10px] opacity-70 mb-0.5">{turn.role === 'human' ? 'Contact' : 'AI Agent'}</p>
                                  <p>{turn.content}</p>
                                </div>
                              </div>
                            ))}
                          </div>
                        </ScrollArea>
                      </div>
                    )}
                  </TabsContent>

                  <TabsContent value="analysis" className="space-y-3">
                    {simulationMutation.data.analysis?.recommendations?.length > 0 && (
                      <div className="space-y-1.5">
                        <p className="text-sm font-medium">Recommendations</p>
                        <ul className="text-sm space-y-1.5">
                          {simulationMutation.data.analysis.recommendations.map((r: string, i: number) => (
                            <li key={i} className="flex items-start gap-2 text-muted-foreground">
                              <AlertCircle className="h-3.5 w-3.5 mt-0.5 shrink-0 text-amber-500" />{r}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                    {simulationMutation.data.analysis?.conversationStages?.length > 0 && (
                      <div>
                        <p className="text-sm font-medium mb-1.5">Conversation Stages</p>
                        <div className="flex flex-wrap gap-1">
                          {simulationMutation.data.analysis.conversationStages.map((s: string, i: number) => (
                            <Badge key={i} variant="outline" className="text-[10px]">{s}</Badge>
                          ))}
                        </div>
                      </div>
                    )}
                    {simulationMutation.data.analysis?.complianceViolations?.length > 0 && (
                      <div className="bg-red-50 dark:bg-red-950/20 rounded-lg p-3">
                        <p className="text-xs font-medium text-red-600 mb-1">Compliance Violations</p>
                        <ul className="text-xs text-red-600 space-y-0.5">
                          {simulationMutation.data.analysis.complianceViolations.map((v: string, i: number) => <li key={i}>• {v}</li>)}
                        </ul>
                      </div>
                    )}
                    {!simulationMutation.data.analysis && (
                      <div className="text-center py-8">
                        <AlertCircle className="h-8 w-8 text-muted-foreground/30 mx-auto mb-2" />
                        <p className="text-sm text-muted-foreground">No analysis data available</p>
                      </div>
                    )}
                  </TabsContent>
                </Tabs>
              </CardContent>
            </Card>
          )}


          {/* Custom scenario builder */}
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-base flex items-center gap-2"><Settings className="h-4 w-4" /> Custom Scenarios</CardTitle>
                  <CardDescription>Create reusable test scenarios</CardDescription>
                </div>
                <Dialog>
                  <DialogTrigger asChild>
                    <Button variant="outline" size="sm"><Plus className="h-3.5 w-3.5 mr-1" />New Scenario</Button>
                  </DialogTrigger>
                  <DialogContent>
                    <DialogHeader>
                      <DialogTitle>Create Custom Scenario</DialogTitle>
                      <DialogDescription>Define a reusable test scenario with persona and objections.</DialogDescription>
                    </DialogHeader>
                    <div className="space-y-3 py-2">
                      <div><Label className="text-xs">Title</Label><Input value={newScenarioTitle} onChange={(e) => setNewScenarioTitle(e.target.value)} placeholder="Scenario title" /></div>
                      <div><Label className="text-xs">Description</Label><Textarea value={newScenarioDescription} onChange={(e) => setNewScenarioDescription(e.target.value)} placeholder="Description / instructions" className="min-h-[60px]" /></div>
                      <div className="grid grid-cols-2 gap-2">
                        <div><Label className="text-xs">Default Persona</Label>
                          <Select value={newScenarioPersona} onValueChange={setNewScenarioPersona}>
                            <SelectTrigger className="text-xs"><SelectValue placeholder="Default persona" /></SelectTrigger>
                            <SelectContent>
                              {(simulationOptionsQuery.data?.personas || []).map((p) => (
                                <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                        <div><Label className="text-xs">Objections</Label><Input value={newScenarioObjections} onChange={(e) => setNewScenarioObjections(e.target.value)} placeholder="Comma-separated" /></div>
                      </div>
                    </div>
                    <DialogFooter>
                      <Button size="sm" onClick={() => createCustomScenarioMutation.mutate()} disabled={createCustomScenarioMutation.isPending || !newScenarioTitle.trim()}>
                        Create Scenario
                      </Button>
                    </DialogFooter>
                  </DialogContent>
                </Dialog>
              </div>
            </CardHeader>
            <CardContent>
              {(simulationOptionsQuery.data?.customScenarios || []).length === 0 ? (
                <div className="text-center py-8">
                  <Settings className="h-8 w-8 text-muted-foreground/20 mx-auto mb-2" />
                  <p className="text-sm text-muted-foreground">No custom scenarios</p>
                  <p className="text-xs text-muted-foreground mt-1">Create one to extend your simulation coverage</p>
                </div>
              ) : (
                <div className="space-y-1.5">
                  {(simulationOptionsQuery.data?.customScenarios || []).map((sc: CustomScenario) => (
                    <div key={sc.id} className="flex items-center justify-between border rounded-lg p-3 text-sm hover:bg-muted/30 transition-colors">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="font-medium">{sc.title}</span>
                          {!sc.isApproved && <Badge variant="secondary" className="text-[10px]">Pending</Badge>}
                        </div>
                        <p className="text-xs text-muted-foreground truncate max-w-[400px] mt-0.5">{sc.description}</p>
                      </div>
                      <div className="flex items-center gap-1 shrink-0 ml-2">
                        {isAdmin && !sc.isApproved && (
                          <Tooltip><TooltipTrigger asChild>
                            <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => approveCustomScenarioMutation.mutate(sc.id)}>
                              <ThumbsUp className="h-3.5 w-3.5" />
                            </Button>
                          </TooltipTrigger><TooltipContent>Approve</TooltipContent></Tooltip>
                        )}
                        {(isAdmin || sc.createdBy === (user as any)?.id) && (
                          <Tooltip><TooltipTrigger asChild>
                            <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-destructive" onClick={() => setDeleteConfirmTarget({ type: 'scenario', id: sc.id, name: sc.title })}>
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          </TooltipTrigger><TooltipContent>Delete</TooltipContent></Tooltip>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* ── Live Voice Test ──────────────────────────────────────────────── */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2"><Phone className="h-4 w-4" /> Live Voice Test</CardTitle>
              <CardDescription>
                Speak directly with the AI agent using your current draft prompt. Browser-only — no phone call needed.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {liveTestState === 'idle' && !liveTestResult && (
                <div className="space-y-3">
                  {/* Prompt Module Selection */}
                  <div>
                    <Label className="text-xs font-medium">Prompt Modules</Label>
                    <p className="text-xs text-muted-foreground mb-1.5">Select which prompt sections to include. Leave empty to use all.</p>
                    <div className="flex flex-wrap gap-1.5 max-h-[120px] overflow-y-auto border rounded-md p-2">
                      {sections.map(s => {
                        const isSelected = liveTestSectionIds.includes(s.sectionId);
                        return (
                          <Badge
                            key={s.sectionId}
                            variant={isSelected ? 'default' : 'outline'}
                            className="cursor-pointer text-xs transition-colors"
                            onClick={() => setLiveTestSectionIds(prev =>
                              isSelected ? prev.filter(id => id !== s.sectionId) : [...prev, s.sectionId]
                            )}
                          >
                            {s.name}
                          </Badge>
                        );
                      })}
                    </div>
                    {liveTestSectionIds.length > 0 && (
                      <div className="flex items-center justify-between mt-1">
                        <span className="text-xs text-muted-foreground">{liveTestSectionIds.length} of {sections.length} modules selected</span>
                        <Button variant="ghost" size="sm" className="h-5 text-xs px-1" onClick={() => setLiveTestSectionIds([])}>Clear</Button>
                      </div>
                    )}
                  </div>

                  {/* Scenario Selection */}
                  <div>
                    <Label className="text-xs font-medium">Test Scenario</Label>
                    <Select value={liveTestScenarioId} onValueChange={setLiveTestScenarioId}>
                      <SelectTrigger className="text-xs"><SelectValue placeholder="No scenario (free conversation)" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">No scenario (free conversation)</SelectItem>
                        {(simulationOptionsQuery.data?.scenarios || []).map(s => (
                          <SelectItem key={s.id} value={s.id}>{s.title}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <div>
                      <Label>Voice</Label>
                      <Select value={liveTestVoice} onValueChange={setLiveTestVoice}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {OPENAI_VOICES.map(v => (
                            <SelectItem key={v.id} value={v.id}>{v.label}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <p className="text-xs text-muted-foreground mt-1">Uses OpenAI Realtime voices. Production uses Gemini voices.</p>
                    </div>
                    <div className="flex items-end">
                      <Button onClick={startLiveTest} className="w-full">
                        <Mic className="h-4 w-4 mr-2" />
                        Start Live Voice Test
                      </Button>
                    </div>
                  </div>
                </div>
              )}

              {liveTestState === 'connecting' && (
                <div className="flex items-center justify-center py-8 gap-3">
                  <div className="animate-pulse h-3 w-3 rounded-full bg-yellow-500" />
                  <span className="text-sm text-muted-foreground">Connecting to AI agent...</span>
                </div>
              )}

              {(liveTestState === 'connected' || liveTestState === 'ending' || liveTestState === 'scoring') && (
                <div className="space-y-3">
                  {/* Call controls */}
                  <div className="flex items-center justify-between bg-muted/50 rounded-lg p-3">
                    <div className="flex items-center gap-3">
                      <div className="flex items-center gap-2">
                        <div className="h-2.5 w-2.5 rounded-full bg-green-500 animate-pulse" />
                        <span className="text-sm font-medium">Live — {formatDuration(liveTestDuration)}</span>
                      </div>
                      <Badge variant="outline" className="text-xs">{liveTestVoice}</Badge>
                    </div>
                    <div className="flex items-center gap-2">
                      <Button variant="outline" size="sm" onClick={toggleMute} disabled={liveTestState !== 'connected'}>
                        {isMuted ? <MicOff className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
                      </Button>
                      <Button
                        variant="destructive"
                        size="sm"
                        onClick={endLiveTest}
                        disabled={liveTestState !== 'connected'}
                      >
                        <PhoneOff className="h-4 w-4 mr-1" />
                        End Test
                      </Button>
                    </div>
                  </div>

                  {/* Live transcript */}
                  <ScrollArea className="h-[250px] rounded-md border p-3">
                    <div className="space-y-2">
                      {liveTranscript.length === 0 && liveTestState === 'connected' && (
                        <p className="text-xs text-muted-foreground text-center py-4">Start speaking — transcript will appear here...</p>
                      )}
                      {liveTranscript.map((turn, i) => (
                        <div key={i} className={`flex ${turn.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                          <div className={`max-w-[80%] rounded-lg px-3 py-2 text-sm ${
                            turn.role === 'user'
                              ? 'bg-primary text-primary-foreground'
                              : 'bg-muted'
                          }`}>
                            <p className="text-[10px] opacity-70 mb-0.5">{turn.role === 'user' ? 'You' : 'AI Agent'}</p>
                            <p>{turn.text}</p>
                          </div>
                        </div>
                      ))}
                      <div ref={transcriptEndRef} />
                    </div>
                  </ScrollArea>

                  {liveTestState === 'scoring' && (
                    <div className="flex items-center justify-center py-4 gap-3">
                      <div className="animate-spin h-4 w-4 border-2 border-primary border-t-transparent rounded-full" />
                      <span className="text-sm text-muted-foreground">Scoring conversation...</span>
                    </div>
                  )}
                </div>
              )}

              {/* Evaluation results */}
              {liveTestResult && liveTestState === 'idle' && (
                <div className="space-y-4">
                  <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                    {[
                      { label: 'Overall', score: liveTestResult.scores.overall },
                      { label: 'Tone', score: liveTestResult.scores.toneAdherence },
                      { label: 'Objections', score: liveTestResult.scores.objectionHandling },
                      { label: 'Identity', score: liveTestResult.scores.identityLock },
                      { label: 'Call Flow', score: liveTestResult.scores.callFlow },
                    ].map(({ label, score }) => (
                      <div key={label} className="text-center p-3 rounded-lg border">
                        <p className={`text-2xl font-bold ${getScoreColor(score)}`}>{score}</p>
                        <p className="text-xs text-muted-foreground">{label}</p>
                        <div className="mt-1 h-1.5 w-full bg-muted rounded-full overflow-hidden">
                          <div className={`h-full rounded-full ${getScoreBg(score)}`} style={{ width: `${score}%` }} />
                        </div>
                      </div>
                    ))}
                  </div>

                  <div className="flex items-center gap-2">
                    <Badge variant={liveTestResult.scores.overall >= 70 ? 'default' : 'destructive'}>
                      {liveTestResult.scores.overall >= 70 ? 'PASS' : 'NEEDS WORK'}
                    </Badge>
                    <span className="text-sm text-muted-foreground">
                      Duration: {formatDuration(liveTestResult.durationSec)} · {liveTestResult.transcript.length} turns · Draft v{liveTestResult.draftVersion}
                    </span>
                  </div>

                  {liveTestResult.evaluation.recommendations.length > 0 && (
                    <div className="space-y-1">
                      <p className="text-sm font-medium">Recommendations</p>
                      <ul className="text-sm text-muted-foreground space-y-1">
                        {liveTestResult.evaluation.recommendations.map((r, i) => (
                          <li key={i} className="flex items-start gap-2">
                            <AlertCircle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                            {r}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {/* Transcript replay */}
                  <details className="group">
                    <summary className="cursor-pointer text-sm font-medium">Full Transcript ({liveTestResult.transcript.length} turns)</summary>
                    <ScrollArea className="h-[200px] mt-2 rounded-md border p-3">
                      <div className="space-y-2">
                        {liveTestResult.transcript.map((turn, i) => (
                          <div key={i} className={`flex ${turn.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                            <div className={`max-w-[80%] rounded-lg px-3 py-2 text-sm ${
                              turn.role === 'user' ? 'bg-primary text-primary-foreground' : 'bg-muted'
                            }`}>
                              <p className="text-[10px] opacity-70 mb-0.5">{turn.role === 'user' ? 'You' : 'AI Agent'}</p>
                              <p>{turn.text}</p>
                            </div>
                          </div>
                        ))}
                      </div>
                    </ScrollArea>
                  </details>

                  <div className="flex gap-2">
                    <Button onClick={() => { setLiveTestResult(null); }} variant="outline" size="sm">
                      <Play className="h-4 w-4 mr-1" />
                      Run Again
                    </Button>
                    <Button onClick={() => setShowLiveTestHistory(!showLiveTestHistory)} variant="ghost" size="sm">
                      <History className="h-4 w-4 mr-1" />
                      {showLiveTestHistory ? 'Hide' : 'Show'} History
                    </Button>
                  </div>
                </div>
              )}

              {/* Live test history */}
              {showLiveTestHistory && (
                <div className="space-y-2 border-t pt-3">
                  <p className="text-sm font-medium">Recent Live Tests</p>
                  {(liveTestHistoryQuery.data?.records || []).length === 0 ? (
                    <p className="text-xs text-muted-foreground">No live tests recorded yet.</p>
                  ) : (
                    <div className="space-y-1">
                      {(liveTestHistoryQuery.data?.records || []).map((rec) => (
                        <details key={rec.id} className="group">
                          <summary className="cursor-pointer flex items-center justify-between text-sm py-1.5 px-2 rounded hover:bg-muted/50">
                            <span className="flex items-center gap-2">
                              <Badge variant={rec.scores.overall >= 70 ? 'default' : 'secondary'} className="text-xs">
                                {rec.scores.overall}
                              </Badge>
                              <span>{new Date(rec.startedAt).toLocaleDateString()} {new Date(rec.startedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                            </span>
                            <span className="text-xs text-muted-foreground">{formatDuration(rec.durationSec)} · {rec.transcript.length} turns · v{rec.draftVersion}</span>
                          </summary>
                          <div className="px-2 pb-2 space-y-2">
                            <div className="flex gap-2 flex-wrap">
                              {[
                                { label: 'Overall', score: rec.scores.overall },
                                { label: 'Tone', score: rec.scores.toneAdherence },
                                { label: 'Objections', score: rec.scores.objectionHandling },
                                { label: 'Identity', score: rec.scores.identityLock },
                                { label: 'Call Flow', score: rec.scores.callFlow },
                              ].map(({ label, score }) => (
                                <Badge key={label} variant="outline" className="text-xs">
                                  {label}: <span className={`ml-1 font-bold ${getScoreColor(score)}`}>{score}</span>
                                </Badge>
                              ))}
                            </div>
                            {rec.evaluation.recommendations.length > 0 && (
                              <ul className="text-xs text-muted-foreground space-y-0.5 pl-2">
                                {rec.evaluation.recommendations.map((r, i) => <li key={i}>• {r}</li>)}
                              </ul>
                            )}
                            <ScrollArea className="h-[150px] rounded-md border p-2">
                              <div className="space-y-1.5">
                                {rec.transcript.map((turn, i) => (
                                  <div key={i} className={`flex ${turn.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                                    <div className={`max-w-[80%] rounded-lg px-2 py-1.5 text-xs ${
                                      turn.role === 'user' ? 'bg-primary text-primary-foreground' : 'bg-muted'
                                    }`}>
                                      {turn.text}
                                    </div>
                                  </div>
                                ))}
                              </div>
                            </ScrollArea>
                          </div>
                        </details>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </CardContent>
          </Card>

          {/* ── Simulation History (Collapsible, last) ────────────────────────── */}
          <Collapsible open={showSimHistory} onOpenChange={setShowSimHistory}>
            <Card>
              <CardHeader className="pb-2">
                <CollapsibleTrigger asChild>
                  <div className="flex items-center justify-between cursor-pointer group">
                    <div>
                      <CardTitle className="text-base flex items-center gap-2">
                        <History className="h-4 w-4" /> Simulation History
                        <Badge variant="secondary" className="text-[10px] ml-1">{simulationHistoryQuery.data?.records?.length || 0}</Badge>
                      </CardTitle>
                      <CardDescription>Recorded simulation runs</CardDescription>
                    </div>
                    <div className="flex items-center gap-1">
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={(e) => { e.stopPropagation(); simulationHistoryQuery.refetch(); }}>
                            <RefreshCw className="h-3.5 w-3.5" />
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent>Refresh</TooltipContent>
                      </Tooltip>
                      {showSimHistory ? <ChevronDown className="h-4 w-4 text-muted-foreground" /> : <ChevronRight className="h-4 w-4 text-muted-foreground" />}
                    </div>
                  </div>
                </CollapsibleTrigger>
              </CardHeader>
              <CollapsibleContent>
                <CardContent>
                  {(simulationHistoryQuery.data?.records || []).length === 0 ? (
                    <div className="text-center py-10">
                      <FlaskConical className="h-10 w-10 text-muted-foreground/20 mx-auto mb-3" />
                      <p className="text-sm font-medium text-muted-foreground">No simulations yet</p>
                      <p className="text-xs text-muted-foreground mt-1">Run your first simulation above to see results here</p>
                    </div>
                  ) : (
                    <>
                      {/* Score trend chart */}
                      {(simulationHistoryQuery.data?.records || []).length >= 2 && (
                        <div className="h-[140px] mb-4">
                          <ResponsiveContainer width="100%" height="100%">
                            <AreaChart data={[...(simulationHistoryQuery.data?.records || [])].reverse().map((r, i) => ({ run: i + 1, overall: r.scores?.overall ?? 0 }))}>
                              <CartesianGrid strokeDasharray="3 3" />
                              <XAxis dataKey="run" label={{ value: 'Run #', position: 'bottom', offset: -5 }} className="text-[10px]" />
                              <YAxis domain={[0, 100]} className="text-[10px]" />
                              <RechartsTooltip />
                              <Area type="monotone" dataKey="overall" stroke="hsl(var(--primary))" fill="hsl(var(--primary))" fillOpacity={0.1} strokeWidth={2} />
                            </AreaChart>
                          </ResponsiveContainer>
                        </div>
                      )}
                      {/* Table */}
                      <div className="border rounded-lg overflow-hidden">
                        <table className="w-full text-xs">
                          <thead>
                            <tr className="bg-muted/50 border-b">
                              <th className="text-left py-2 px-3 font-medium">Score</th>
                              <th className="text-left py-2 px-3 font-medium">Scenario</th>
                              <th className="text-left py-2 px-3 font-medium hidden md:table-cell">Turns</th>
                              <th className="text-left py-2 px-3 font-medium">Date</th>
                              <th className="text-right py-2 px-3 font-medium w-8"></th>
                            </tr>
                          </thead>
                          <tbody>
                            {(simulationHistoryQuery.data?.records || []).map((rec: SimulationRecord) => (
                              <tr key={rec.id} className="border-b last:border-0 hover:bg-muted/30 cursor-pointer" onClick={() => setExpandedSimHistoryId(expandedSimHistoryId === rec.id ? null : rec.id)}>
                                <td className="py-2 px-3">
                                  <Badge variant={rec.scores?.overall >= 70 ? 'default' : 'secondary'} className="text-xs font-mono">
                                    {rec.scores?.overall ?? '—'}
                                  </Badge>
                                </td>
                                <td className="py-2 px-3 font-medium">{rec.scenarioTitle || rec.scenarioId}</td>
                                <td className="py-2 px-3 hidden md:table-cell text-muted-foreground">{rec.turns}</td>
                                <td className="py-2 px-3 text-muted-foreground">{new Date(rec.runAt).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</td>
                                <td className="py-2 px-3 text-right">
                                  {expandedSimHistoryId === rec.id ? <ChevronDown className="h-3.5 w-3.5 text-muted-foreground inline" /> : <ChevronRight className="h-3.5 w-3.5 text-muted-foreground inline" />}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                      {/* Expanded detail */}
                      {expandedSimHistoryId && (() => {
                        const rec = (simulationHistoryQuery.data?.records || []).find(r => r.id === expandedSimHistoryId);
                        if (!rec) return null;
                        return (
                          <div className="border rounded-lg mt-2 p-4 space-y-3 bg-muted/20">
                            {rec.scores && (
                              <div className="flex gap-2 flex-wrap">
                                {Object.entries(rec.scores).map(([k, v]) => (
                                  <Badge key={k} variant="outline" className="text-xs gap-1">
                                    <span className="capitalize">{k.replace(/([A-Z])/g, ' $1').trim()}</span>
                                    <span className={`font-bold ${(v as number) >= 70 ? 'text-green-600' : (v as number) >= 50 ? 'text-yellow-600' : 'text-red-600'}`}>{v as number}</span>
                                  </Badge>
                                ))}
                              </div>
                            )}
                            {rec.evaluation?.recommendations?.length > 0 && (
                              <ul className="text-xs text-muted-foreground space-y-0.5 pl-2">
                                {rec.evaluation.recommendations.map((r, i) => <li key={i}>• {r}</li>)}
                              </ul>
                            )}
                            <ScrollArea className="h-[160px] rounded-md border p-2">
                              <div className="space-y-1.5">
                                {rec.transcript.map((t, i) => (
                                  <div key={i} className={`flex ${t.role === 'human' ? 'justify-end' : 'justify-start'}`}>
                                    <div className={`max-w-[80%] rounded-lg px-2 py-1.5 text-xs ${t.role === 'human' ? 'bg-primary text-primary-foreground' : 'bg-muted'}`}>
                                      {t.content}
                                    </div>
                                  </div>
                                ))}
                              </div>
                            </ScrollArea>
                          </div>
                        );
                      })()}
                    </>
                  )}
                </CardContent>
              </CollapsibleContent>
            </Card>
          </Collapsible>
        </TabsContent>

        <TabsContent value="versions" className="space-y-4">
          {/* Voice trainers: Submit for Approval | Admins: Direct publish + Approval Queue */}
          {isVoiceTrainer ? (
            <Card className="border-purple-200 dark:border-purple-900/50">
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2"><Send className="h-4 w-4 text-purple-600" /> Submit Changes for Admin Approval</CardTitle>
                <CardDescription>Your changes will be reviewed by an administrator before being published to production.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <Input
                  value={publishNote}
                  onChange={(e) => setPublishNote(e.target.value)}
                  placeholder="Describe your changes (required)"
                  className="text-sm"
                />
                <div className="flex justify-end">
                  <Button
                    onClick={() => requestPublishMutation.mutate()}
                    disabled={requestPublishMutation.isPending || !publishNote.trim() || pendingRequests.length > 0}
                    size="sm"
                  >
                    <Send className="h-3.5 w-3.5 mr-1.5" />
                    {pendingRequests.length > 0 ? 'Approval Pending...' : 'Submit for Approval'}
                  </Button>
                </div>
              </CardContent>
            </Card>
          ) : (
            <Card>
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2"><GitBranch className="h-4 w-4" /> Draft → Publish Governance</CardTitle>
                <CardDescription>Promote tested draft to unified production version</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <Input value={publishNote} onChange={(e) => setPublishNote(e.target.value)} placeholder="Approval / publish note" />
                <div className="flex justify-end">
                  <Button onClick={() => publishMutation.mutate()} disabled={publishMutation.isPending}>
                    <Upload className="h-4 w-4 mr-2" />
                    Publish Draft to Production
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Approval Queue — visible to admins when there are pending requests */}
          {isAdmin && pendingRequests.length > 0 && (
            <Card className="border-amber-500/50">
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <Clock className="h-4 w-4 text-amber-500" />
                  Pending Approval Requests
                  <Badge variant="secondary" className="ml-1">{pendingRequests.length}</Badge>
                </CardTitle>
                <CardDescription>Voice trainers have submitted changes for your review</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {pendingRequests.map((request) => (
                  <div key={request.id} className="border rounded-lg p-4 space-y-3">
                    <div className="flex items-start justify-between">
                      <div>
                        <p className="text-sm font-medium">{request.note}</p>
                        <p className="text-xs text-muted-foreground mt-1">
                          Draft v{request.draftVersion} · {request.sectionChanges.length} section{request.sectionChanges.length !== 1 ? 's' : ''} changed · {new Date(request.requestedAt).toLocaleString()}
                        </p>
                      </div>
                      <Badge variant="outline" className="text-amber-600 border-amber-400">Pending</Badge>
                    </div>

                    {/* Section change preview */}
                    <details className="text-xs">
                      <summary className="cursor-pointer text-muted-foreground hover:text-foreground">View changes</summary>
                      <div className="mt-2 space-y-2">
                        {request.sectionChanges.map((change) => (
                          <div key={change.sectionId} className="border rounded p-2">
                            <p className="font-medium mb-1">{change.name}</p>
                            <div className="grid grid-cols-2 gap-2">
                              <div>
                                <p className="text-muted-foreground mb-1">Before:</p>
                                <pre className="bg-red-50 dark:bg-red-950/20 p-2 rounded max-h-[120px] overflow-auto whitespace-pre-wrap">{change.oldContent.slice(0, 500)}{change.oldContent.length > 500 ? '...' : ''}</pre>
                              </div>
                              <div>
                                <p className="text-muted-foreground mb-1">After:</p>
                                <pre className="bg-green-50 dark:bg-green-950/20 p-2 rounded max-h-[120px] overflow-auto whitespace-pre-wrap">{change.newContent.slice(0, 500)}{change.newContent.length > 500 ? '...' : ''}</pre>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </details>

                    {/* Approve / Reject actions */}
                    <div className="flex items-end gap-2">
                      <div className="flex-1">
                        <Input
                          placeholder="Optional review note"
                          value={approvalReviewNote}
                          onChange={(e) => setApprovalReviewNote(e.target.value)}
                          className="text-xs"
                        />
                      </div>
                      <Button
                        size="sm"
                        onClick={() => approveRequestMutation.mutate(request.id)}
                        disabled={approveRequestMutation.isPending}
                        className="bg-green-600 hover:bg-green-700"
                      >
                        <CheckCircle className="h-3.5 w-3.5 mr-1" />
                        Approve & Publish
                      </Button>
                      <Button
                        size="sm"
                        variant="destructive"
                        onClick={() => {
                          const reason = rejectionNote || prompt('Rejection reason (required):');
                          if (reason) {
                            setRejectionNote(reason);
                            rejectRequestMutation.mutate(request.id);
                          }
                        }}
                        disabled={rejectRequestMutation.isPending}
                      >
                        <XCircle className="h-3.5 w-3.5 mr-1" />
                        Reject
                      </Button>
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}

          {/* Publish request status for voice trainers */}
          {isVoiceTrainer && (publishRequestsQuery.data?.requests || []).length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Your Publish Requests</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 max-h-[300px] overflow-auto">
                {(publishRequestsQuery.data?.requests || []).map((request) => (
                  <div key={request.id} className="border rounded p-3 text-xs">
                    <div className="flex items-center justify-between">
                      <span className="font-medium">{request.note}</span>
                      <Badge
                        variant={request.status === 'approved' ? 'default' : request.status === 'rejected' ? 'destructive' : 'secondary'}
                        className="text-xs"
                      >
                        {request.status === 'pending' && <Clock className="h-3 w-3 mr-1" />}
                        {request.status === 'approved' && <CheckCircle className="h-3 w-3 mr-1" />}
                        {request.status === 'rejected' && <XCircle className="h-3 w-3 mr-1" />}
                        {request.status}
                      </Badge>
                    </div>
                    <p className="text-muted-foreground mt-1">
                      Draft v{request.draftVersion} · {request.sectionChanges.length} changes · {new Date(request.requestedAt).toLocaleString()}
                    </p>
                    {request.reviewNote && (
                      <p className="mt-1 text-muted-foreground italic">
                        Admin feedback: {request.reviewNote}
                      </p>
                    )}
                  </div>
                ))}
              </CardContent>
            </Card>
          )}

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Draft History</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 max-h-[360px] overflow-auto">
                {(versionsQuery.data?.draft?.history || []).map((entry) => (
                  <div key={entry.version} className="border rounded p-2 text-xs">
                    <div className="flex justify-between">
                      <span className="font-medium">Draft v{entry.version}</span>
                      <span>{new Date(entry.savedAt).toLocaleString()}</span>
                    </div>
                    <p className="text-muted-foreground mt-1">{entry.summary}</p>
                    {!isVoiceTrainer && (
                      <div className="mt-2 flex justify-end">
                        <Button size="sm" variant="outline" onClick={() => rollbackMutation.mutate(entry.version)}>
                          Restore
                        </Button>
                      </div>
                    )}
                  </div>
                ))}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">Publish History</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 max-h-[360px] overflow-auto">
                {(versionsQuery.data?.publishHistory || []).map((entry, idx) => (
                  <div key={`${entry.publishedVersion}-${idx}`} className="border rounded p-2 text-xs">
                    <div className="flex justify-between">
                      <span className="font-medium">Published {entry.publishedVersion}</span>
                      <span>{new Date(entry.publishedAt).toLocaleString()}</span>
                    </div>
                    <p className="text-muted-foreground mt-1">{entry.note}</p>
                    <p className="text-muted-foreground">Changes: {entry.sectionChanges}</p>
                  </div>
                ))}
              </CardContent>
            </Card>
          </div>

          {/* A/B Version Comparison */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2"><Eye className="h-4 w-4" /> A/B Version Comparison</CardTitle>
              <CardDescription>Compare any two draft versions side by side</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs">Version A</Label>
                  <Select value={diffVersionA} onValueChange={setDiffVersionA}>
                    <SelectTrigger><SelectValue placeholder="Select version" /></SelectTrigger>
                    <SelectContent>
                      {(versionsQuery.data?.draft?.history || []).map(e => (
                        <SelectItem key={e.version} value={String(e.version)}>v{e.version} — {e.summary?.slice(0, 40)}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-xs">Version B</Label>
                  <Select value={diffVersionB} onValueChange={setDiffVersionB}>
                    <SelectTrigger><SelectValue placeholder="Select version" /></SelectTrigger>
                    <SelectContent>
                      {(versionsQuery.data?.draft?.history || []).map(e => (
                        <SelectItem key={e.version} value={String(e.version)}>v{e.version} — {e.summary?.slice(0, 40)}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              {diffVersionA && diffVersionB && diffVersionA !== diffVersionB && (
                <DiffResultViewer versionA={diffVersionA} versionB={diffVersionB} agentId={''} />
              )}
            </CardContent>
          </Card>

          {/* Activity Log */}
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-base flex items-center gap-2"><ClipboardList className="h-4 w-4" /> Activity Log</CardTitle>
                  <CardDescription>Audit trail of all training actions</CardDescription>
                </div>
                <Button variant="ghost" size="sm" onClick={() => setShowActivityLog(!showActivityLog)}>
                  {showActivityLog ? 'Hide' : 'Show'}
                </Button>
              </div>
            </CardHeader>
            {showActivityLog && (
              <CardContent className="space-y-3">
                <div className="flex gap-1 flex-wrap">
                  {['all', 'prompt', 'simulation', 'version', 'comment', 'snippet', 'scenario'].map(cat => (
                    <Button key={cat} variant={activityFilter === cat ? 'default' : 'outline'} size="sm" className="h-6 text-xs px-2" onClick={() => setActivityFilter(cat)}>
                      {cat}
                    </Button>
                  ))}
                </div>
                <ScrollArea className="max-h-[300px]">
                  <div className="space-y-1">
                    {(activityLogQuery.data?.entries || []).length === 0 && <p className="text-xs text-muted-foreground">No activity logged yet.</p>}
                    {(activityLogQuery.data?.entries || []).map((entry: ActivityLogEntry) => (
                      <div key={entry.id} className="flex items-start gap-2 text-xs border-b pb-1.5">
                        <span className="text-muted-foreground shrink-0 w-[100px]">
                          {new Date(entry.timestamp).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                        </span>
                        <Badge variant="outline" className="text-[10px] h-4 shrink-0">{entry.category}</Badge>
                        <span className="flex-1"><span className="font-medium">{entry.action}</span> — {entry.detail}</span>
                      </div>
                    ))}
                  </div>
                </ScrollArea>
              </CardContent>
            )}
          </Card>
        </TabsContent>

        <TabsContent value="data" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Controlled Training Dataset</CardTitle>
              <CardDescription>Safe, non-sensitive records for QA and prompt refinement</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-sm">
                <div className="border rounded p-3">
                  <div className="font-semibold">Campaigns</div>
                  <div className="text-muted-foreground text-xs">{(sampleDataQuery.data?.campaigns || []).length} sample campaigns</div>
                </div>
                <div className="border rounded p-3">
                  <div className="font-semibold">Accounts</div>
                  <div className="text-muted-foreground text-xs">{(sampleDataQuery.data?.accounts || []).length} sample accounts</div>
                </div>
                <div className="border rounded p-3">
                  <div className="font-semibold">Contacts</div>
                  <div className="text-muted-foreground text-xs">{(sampleDataQuery.data?.contacts || []).length} sample contacts</div>
                </div>
              </div>
              <pre className="text-xs bg-muted p-3 rounded mt-4 max-h-[320px] overflow-auto">{JSON.stringify(sampleDataQuery.data, null, 2)}</pre>
            </CardContent>
          </Card>

          {/* Real Call Transcripts from DB */}
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-base flex items-center gap-2"><FileText className="h-4 w-4" /> Real Call Transcripts</CardTitle>
                  <CardDescription>Actual call transcripts from production for training reference</CardDescription>
                </div>
                <Button variant={showRealTranscripts ? 'default' : 'outline'} size="sm" onClick={() => setShowRealTranscripts(!showRealTranscripts)}>
                  {showRealTranscripts ? 'Hide' : 'Load Transcripts'}
                </Button>
              </div>
            </CardHeader>
            {showRealTranscripts && (
              <CardContent>
                {realTranscriptsQuery.isLoading && <p className="text-xs text-muted-foreground">Loading transcripts...</p>}
                {realTranscriptsQuery.isError && <p className="text-xs text-destructive">Failed to load transcripts</p>}
                <ScrollArea className="max-h-[400px]">
                  <div className="space-y-2">
                    {(realTranscriptsQuery.data?.transcripts || []).length === 0 && !realTranscriptsQuery.isLoading && (
                      <p className="text-xs text-muted-foreground">No transcripts found.</p>
                    )}
                    {(realTranscriptsQuery.data?.transcripts || []).map((t: RealTranscript) => (
                      <details key={t.id} className="border rounded p-2 text-xs">
                        <summary className="cursor-pointer flex items-center justify-between">
                          <span className="flex items-center gap-2">
                            <Phone className="h-3 w-3" />
                            <span className="font-medium">{t.contactName || 'Unknown'}</span>
                            <Badge variant="outline" className="text-[10px]">{t.disposition || 'N/A'}</Badge>
                          </span>
                          <span className="text-muted-foreground">
                            {t.duration ? formatDuration(t.duration) : '—'} · {new Date(t.calledAt).toLocaleDateString()}
                          </span>
                        </summary>
                        <ScrollArea className="max-h-[200px] mt-2 rounded border p-2">
                          <div className="space-y-1.5">
                            {(t.transcript || '').split('\n').filter((l: string) => l.trim()).map((line: string, i: number) => {
                              const isAgent = /^(Agent|AI):/i.test(line);
                              const isHuman = /^(Human|Contact|Prospect|Customer):/i.test(line);
                              const text = line.replace(/^(Agent|AI|Human|Contact|Prospect|Customer):\s*/i, '');
                              return (
                                <div key={i} className={`flex ${isHuman ? 'justify-end' : 'justify-start'}`}>
                                  <div className={`max-w-[85%] rounded px-2 py-1 ${isHuman ? 'bg-primary/10' : isAgent ? 'bg-muted' : 'bg-muted/50 italic'}`}>
                                    {(isAgent || isHuman) && <span className="text-[10px] text-muted-foreground">{isAgent ? 'Agent' : 'Contact'}: </span>}
                                    {text}
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </ScrollArea>
                      </details>
                    ))}
                  </div>
                </ScrollArea>
              </CardContent>
            )}
          </Card>
        </TabsContent>
      </Tabs>

      {/* ── Delete Confirmation Dialog ──────────────────────────── */}
      <Dialog open={!!deleteConfirmTarget} onOpenChange={(open) => { if (!open) setDeleteConfirmTarget(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete {deleteConfirmTarget?.type === 'snippet' ? 'Snippet' : 'Scenario'}</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete "{deleteConfirmTarget?.name}"? This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setDeleteConfirmTarget(null)}>Cancel</Button>
            <Button variant="destructive" size="sm" onClick={() => {
              if (!deleteConfirmTarget) return;
              if (deleteConfirmTarget.type === 'snippet') {
                deleteSnippetMutation.mutate(deleteConfirmTarget.id);
              } else {
                deleteCustomScenarioMutation.mutate(deleteConfirmTarget.id);
              }
              setDeleteConfirmTarget(null);
              toast({ title: 'Deleted', description: `${deleteConfirmTarget.name} has been removed.` });
            }}>
              <Trash2 className="h-3.5 w-3.5 mr-1" />Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
    </TooltipProvider>
  );
}
