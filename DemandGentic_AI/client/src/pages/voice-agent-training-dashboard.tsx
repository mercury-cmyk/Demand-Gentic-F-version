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
    transcriptPreview: Array;
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
  return normalized.startsWith('(
  method: string,
  routePath: string,
  data?: unknown,
): Promise {
  const apiBases = Array.from(new Set(getApiBases()));
  let lastError: unknown;
  const attemptErrors: string[] = [];

  for (let index = 0; index  ${getErrorMessage(error)}`);
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
  if (diffQuery.isLoading) return Loading diff...;
  if (diffQuery.isError) return Failed to load diff;
  const data = diffQuery.data as any;
  if (!data) return null;
  return (
    
      
        +{data.additions} added
        -{data.removals} removed
        {data.modifications} modified
      
      {(data.sectionDiffs || []).map((sd: any) => (
        
          {sd.sectionId} ({sd.changeType})
          
            {(sd.lineDiff || []).map((ld: any, i: number) => (
              
                {ld.type === 'add' ? '+' : ld.type === 'remove' ? '-' : ' '} {ld.line}
              
            ))}
          
        
      ))}
    
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

  const [selectedSectionId, setSelectedSectionId] = useState('');
  const [sectionContent, setSectionContent] = useState('');
  const [changeLog, setChangeLog] = useState('');

  const [voiceConfig, setVoiceConfig] = useState({
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
  const [liveTestState, setLiveTestState] = useState('idle');
  const [liveTestVoice, setLiveTestVoice] = useState('alloy');
  const [liveTranscript, setLiveTranscript] = useState([]);
  const [liveTestDuration, setLiveTestDuration] = useState(0);
  const [liveTestResult, setLiveTestResult] = useState(null);
  const [liveTestStartedAt, setLiveTestStartedAt] = useState('');
  const [isMuted, setIsMuted] = useState(false);
  const [showLiveTestHistory, setShowLiveTestHistory] = useState(false);
  const [liveTestSectionIds, setLiveTestSectionIds] = useState([]);
  const [liveTestScenarioId, setLiveTestScenarioId] = useState('');
  const rtcClientRef = useRef(null);
  const audioElementRef = useRef(null);
  const micStreamRef = useRef(null);
  const durationIntervalRef = useRef | null>(null);
  const transcriptEndRef = useRef(null);

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
  const [activityFilter, setActivityFilter] = useState('');
  const [diffVersionA, setDiffVersionA] = useState('');
  const [diffVersionB, setDiffVersionB] = useState('');
  const [showRealTranscripts, setShowRealTranscripts] = useState(false);
  const [audioPreviewLoading, setAudioPreviewLoading] = useState(false);
  const sectionEditorRef = useRef(null);

  // Redesign state
  const [sectionSearchQuery, setSectionSearchQuery] = useState('');
  const [voiceConfigOpen, setVoiceConfigOpen] = useState(false);
  const [simResultTab, setSimResultTab] = useState('scores');
  const [simProgress, setSimProgress] = useState(0);
  const [simProgressText, setSimProgressText] = useState('');
  const [deleteConfirmTarget, setDeleteConfirmTarget] = useState(null);
  const [expandedSimHistoryId, setExpandedSimHistoryId] = useState(null);

  const overviewQuery = useQuery({
    queryKey: ['voice-training-overview'],
    queryFn: async () => trainingApiRequest('GET', '/overview'),
  });

  const draftQuery = useQuery({
    queryKey: ['voice-training-draft'],
    queryFn: async () => trainingApiRequest('GET', '/draft'),
  });

  const versionsQuery = useQuery({
    queryKey: ['voice-training-versions'],
    queryFn: async () => trainingApiRequest('GET', '/versions'),
  });

  const voicesQuery = useQuery({
    queryKey: ['voice-training-voices'],
    queryFn: async () => trainingApiRequest('GET', '/voices'),
  });

  const sampleDataQuery = useQuery({
    queryKey: ['voice-training-sample-data'],
    queryFn: async () => trainingApiRequest('GET', '/sample-dataset'),
  });

  const simulationOptionsQuery = useQuery({
    queryKey: ['voice-training-simulation-options'],
    queryFn: async () => trainingApiRequest('GET', '/simulation-options'),
  });

  // ── New queries for 12 improvements ────────────────────────────────────

  const simulationHistoryQuery = useQuery({
    queryKey: ['voice-training-simulation-history'],
    queryFn: async () => trainingApiRequest('GET', '/simulation-history?limit=20'),
  });

  const activityLogQuery = useQuery({
    queryKey: ['voice-training-activity-log', activityFilter],
    queryFn: async () => trainingApiRequest('GET', `/activity-log?limit=50${activityFilter ? `&category=${activityFilter}` : ''}`),
  });

  const productionSectionsQuery = useQuery }>({
    queryKey: ['voice-training-production-sections'],
    queryFn: async () => trainingApiRequest('GET', '/production-sections'),
  });

  const snippetsQuery = useQuery({
    queryKey: ['voice-training-snippets'],
    queryFn: async () => trainingApiRequest('GET', '/snippets'),
  });

  const sectionCommentsQuery = useQuery({
    queryKey: ['voice-training-section-comments', selectedSectionId],
    queryFn: async () => trainingApiRequest('GET', `/sections/${selectedSectionId}/comments`),
    enabled: !!selectedSectionId,
  });

  const realTranscriptsQuery = useQuery({
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
    const groups: Record = {};
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
      return trainingApiRequest('PUT', `/draft/sections/${selectedSectionId}`, {
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
    mutationFn: async () => trainingApiRequest('PUT', '/voice-config', voiceConfig),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['voice-training-draft'] });
      toast({ title: 'Voice config saved', description: 'Gemini voice settings are now bound to this draft.' });
    },
    onError: (err: unknown) => {
      toast({ title: 'Failed to save voice config', description: getErrorMessage(err), variant: 'destructive' });
    },
  });

  const simulationMutation = useMutation({
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
          return idx ('POST', '/simulate', {
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
    mutationFn: async () => trainingApiRequest('POST', '/publish', { note: publishNote }),
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
    mutationFn: async (version: number) => trainingApiRequest('POST', `/rollback-draft/${version}`, {}),
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

  const liveTestHistoryQuery = useQuery({
    queryKey: ['voice-training-live-test-history'],
    queryFn: async () => trainingApiRequest('GET', '/live-test/history?limit=10'),
  });

  const saveLiveTestResultMutation = useMutation({
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
      const draftPrompt = await trainingApiRequest('GET', `/live-test/draft-prompt${qs ? `?${qs}` : ''}`);

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

  const publishRequestsQuery = useQuery({
    queryKey: ['voice-training-publish-requests'],
    queryFn: async () => trainingApiRequest('GET', '/publish-requests'),
  });

  const requestPublishMutation = useMutation({
    mutationFn: async () => trainingApiRequest('POST', '/request-publish', { note: publishNote }),
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
    mutationFn: async (requestId: string) => trainingApiRequest('POST', `/publish-requests/${requestId}/approve`, { note: approvalReviewNote }),
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
    mutationFn: async (requestId: string) => trainingApiRequest('POST', `/publish-requests/${requestId}/reject`, { note: rejectionNote }),
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
      
        
          
            
            
          
          
            
            
          
        
        
          {[1,2,3,4].map(i => (
            
          ))}
        
        
        
          
          
        
      
    );
  }

  if (hasLoadError) {
    return (
      
        
          
            Unable to load Voice Agent Training data
            
              {loadErrorMessage}
            
          
          
             {
                overviewQuery.refetch();
                draftQuery.refetch();
              }}
            >
              Retry
            
          
        
      
    );
  }

  return (
    
    
      {/* ── Header ─────────────────────────────────────────────── */}
      
        
          
            
            Voice Agent Training Dashboard
            {isAdmin && Admin}
            {isVoiceTrainer && Voice Trainer}
          
          
            Unified voice prompt iteration, simulation, and controlled publish.
          
        
        
          Production v{overviewQuery.data?.production?.version || 'n/a'}
          Draft v{draftQuery.data?.draftVersion || 'n/a'}
        
      

      {/* ── KPI Stats Row ──────────────────────────────────────── */}
      {overviewQuery.data?.stats && (
        
          
            
              
                
                  Simulations
                  {overviewQuery.data.stats.totalSimulations}
                
                
                  
                
              
              Avg score: {overviewQuery.data.stats.avgSimScore || '—'}
            
          
          
            
              
                
                  Prompt Health
                  {overviewQuery.data.stats.modifiedSections}
                
                
                  
                
              
              Modified sections · {overviewQuery.data.stats.totalComments} comments
            
          
          
            
              
                
                  Pending
                  {overviewQuery.data.stats.pendingApprovals}
                
                
                  
                
              
              {overviewQuery.data.stats.snippetCount} snippets · {overviewQuery.data.stats.customScenarioCount} scenarios
            
          
          
            
              
                
                  Last Activity
                  
                    {overviewQuery.data.stats.lastActivity
                      ? new Date(overviewQuery.data.stats.lastActivity).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
                      : 'None'}
                  
                
                
                  
                
              
            
          
        
      )}

      
        
          Prompt Management {sections.length}
          Simulation {simulationHistoryQuery.data?.records?.length || 0}
          Version Control {pendingRequests.length > 0 && {pendingRequests.length}}
          Sample Dataset
        

        
          {/* ── 3-Panel Resizable Layout ─────────────────────────── */}
          
            
              {/* ── Left: Section List ─────────────────────────────── */}
              
                
                  
                    Prompt Modules
                    
                      
                       setSectionSearchQuery(e.target.value)}
                        placeholder="Search sections..."
                        className="pl-8 h-8 text-xs"
                      />
                    
                  
                  
                    
                      {Object.entries(sectionsByCategory).map(([category, catSections]) => (
                        
                          {category}
                          
                            {catSections.map((section) => {
                              const tokenEst = Math.ceil(section.content.length / 4);
                              const prodSection = productionSectionsQuery.data?.sections?.[section.sectionId];
                              const hasDrift = prodSection && prodSection.content !== section.content;
                              return (
                                 setSelectedSectionId(section.sectionId)}
                                >
                                  
                                    {section.name}
                                    
                                      {hasDrift && (
                                        
                                          
                                          Differs from production
                                        
                                      )}
                                    
                                  
                                  
                                    {tokenEst}t
                                  
                                
                              );
                            })}
                          
                        
                      ))}
                      {filteredSections.length === 0 && (
                        No sections match "{sectionSearchQuery}"
                      )}
                    
                  
                
              

              

              {/* ── Center: Editor ────────────────────────────────── */}
              
                
                  
                    
                      
                        {selectedSection?.name || 'Select a section'}
                        
                          {selectedSection ? `Last edited ${new Date(selectedSection.lastEditedAt).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}` : 'Choose a section to begin editing'}
                        
                      
                      
                        
                           setShowDiffView(!showDiffView)}>
                            {showDiffView ?  : }
                          
                        Toggle diff view
                        
                           setShowSnippets(!showSnippets)}>
                            
                          
                        Snippet library
                        
                           setShowComments(!showComments)}>
                            
                          
                        Comments
                      
                    
                    {/* Toolbar: word/token count */}
                    {selectedSection && (
                      
                        {wordCount} words
                        |
                         1000 ? 'text-red-500 font-medium' : tokenEstimate > 500 ? 'text-yellow-600' : ''}>{tokenEstimate} tokens
                        |
                        {sectionContent.length} chars
                      
                    )}
                  

                  {/* Diff View */}
                  {showDiffView && selectedSection && productionSectionsQuery.data?.sections?.[selectedSection.sectionId] && (
                    
                      
                        
                          
                            Production
                            {productionSectionsQuery.data.sections[selectedSection.sectionId].content}
                          
                        
                        
                        
                          
                            Draft
                            {sectionContent}
                          
                        
                      
                    
                  )}

                  
                     setSectionContent(e.target.value)}
                      className="flex-1 min-h-[240px] font-mono text-xs resize-none"
                      placeholder="Edit prompt section content"
                    />
                    
                       setChangeLog(e.target.value)}
                        placeholder="Change log (required)"
                        className="flex-1 h-8 text-xs"
                      />
                       saveSectionMutation.mutate()}
                        disabled={!selectedSectionId || !changeLog.trim() || saveSectionMutation.isPending}
                      >
                        
                        Save
                      
                    
                  
                
              

              

              {/* ── Right: Context Panel (Snippets / Comments) ───── */}
              
                
                  
                    
                      
                        Snippets
                        Comments
                      
                    
                  
                  
                    {/* Always show snippets or comments based on toggle */}
                    {showComments && selectedSectionId ? (
                      
                        {(sectionCommentsQuery.data?.comments || []).map(comment => (
                          
                            
                              {comment.userId}
                              
                                
                                  {new Date(comment.createdAt).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                                
                                {!comment.resolved && (
                                  
                                     resolveCommentMutation.mutate(comment.id)}>
                                      
                                    
                                  Resolve
                                )}
                              
                            
                            {comment.content}
                            {comment.resolved && Resolved}
                          
                        ))}
                        {!(sectionCommentsQuery.data?.comments || []).length && (
                          
                            
                            No comments yet
                          
                        )}
                        
                           setNewCommentText(e.target.value)}
                            placeholder="Add comment..."
                            className="text-xs h-8"
                            onKeyDown={(e) => { if (e.key === 'Enter' && newCommentText.trim()) addCommentMutation.mutate(); }}
                          />
                          
                             addCommentMutation.mutate()} disabled={!newCommentText.trim() || addCommentMutation.isPending}>
                              
                            
                          Send
                        
                      
                    ) : (
                      
                        
                          Snippet Library
                          
                            
                              
                                New
                              
                            
                            
                              
                                Create Snippet
                                Add a reusable prompt snippet to the library.
                              
                              
                                Title setNewSnippetTitle(e.target.value)} placeholder="Snippet title" />
                                Category setNewSnippetCategory(e.target.value)} placeholder="Category" />
                                Content setNewSnippetContent(e.target.value)} placeholder="Snippet content" className="min-h-[80px] text-xs" />
                              
                              
                                 createSnippetMutation.mutate()} disabled={createSnippetMutation.isPending || !newSnippetContent.trim() || !newSnippetTitle.trim()}>
                                  Create Snippet
                                
                              
                            
                          
                        
                        {(snippetsQuery.data?.snippets || []).map(snip => (
                          
                            
                              
                                {snip.title}
                                {snip.category}
                              
                            
                            {snip.content.slice(0, 80)}
                            
                               {
                                const el = sectionEditorRef.current;
                                if (el) {
                                  const start = el.selectionStart;
                                  const newVal = sectionContent.slice(0, start) + snip.content + sectionContent.slice(start);
                                  setSectionContent(newVal);
                                } else {
                                  setSectionContent(prev => prev + '\n' + snip.content);
                                }
                                toast({ title: 'Inserted', description: `"${snip.title}" added to editor.` });
                              }}>Insert
                              {isAdmin && !snip.isApproved && (
                                
                                   approveSnippetMutation.mutate(snip.id)}>
                                    
                                  
                                Approve
                              )}
                              {(isAdmin || snip.createdBy === (user as any)?.id) && (
                                
                                   setDeleteConfirmTarget({ type: 'snippet', id: snip.id, name: snip.title })}>
                                    
                                  
                                Delete
                              )}
                            
                          
                        ))}
                        {!(snippetsQuery.data?.snippets || []).length && (
                          
                            
                            No snippets yet
                            Create one to get started
                          
                        )}
                      
                    )}
                  
                
              
            
          

          {/* ── Voice Config (Collapsible) ────────────────────────── */}
          
            
              
                
                  
                    
                      
                      Gemini Voice Configuration
                      {voiceConfig.voiceId}
                    
                    {voiceConfigOpen ?  : }
                  
                  Bound to current draft and promoted with publish
                
              
              
                
                  
                    Provider
                     setVoiceConfig((prev) => ({ ...prev, provider: e.target.value }))} className="h-8 text-xs" />
                  
                  
                    Voice ID
                     setVoiceConfig((prev) => ({ ...prev, voiceId: v }))}>
                      
                      
                        {(voicesQuery.data?.voices || []).map((voice) => (
                          {voice.label}
                        ))}
                      
                    
                  
                  
                    Speaking Rate
                     setVoiceConfig((prev) => ({ ...prev, speakingRate: Number(e.target.value) || 1 }))} className="h-8 text-xs" />
                  
                  
                    Tone
                     setVoiceConfig((prev) => ({ ...prev, tone: e.target.value }))} className="h-8 text-xs" />
                  
                  
                    Clarity
                     setVoiceConfig((prev) => ({ ...prev, clarity: Number(e.target.value) || 1 }))} className="h-8 text-xs" />
                  
                  
                     saveVoiceConfigMutation.mutate()} disabled={saveVoiceConfigMutation.isPending}>
                      Save Voice Config
                    
                  
                
              
            
          
        

        
          {/* ── Simulation Config ────────────────────────────────── */}
          
            
              
                
                   Scenario Simulation Engine
                  Telephony-free test calls with controlled personas and sample contacts
                
                {simulationMutation.isPending && (
                  
                    
                    Running...
                  
                )}
              
            
            
              
                
                  Scenario
                  
                    
                    
                      {(simulationOptionsQuery.data?.scenarios || []).map((s) => (
                        {s.title}
                      ))}
                    
                  
                
                
                  Persona
                  
                    
                    
                      {(simulationOptionsQuery.data?.personas || []).map((p) => (
                        {p.name}
                      ))}
                    
                  
                
                
                  Campaign
                  
                    
                    
                      {(sampleDataQuery.data?.campaigns || []).map((c) => (
                        {c.name}
                      ))}
                    
                  
                
              
              
                
                  Account
                  
                    
                    
                      {(sampleDataQuery.data?.accounts || []).map((a) => (
                        {a.name}
                      ))}
                    
                  
                
                
                  Contact
                  
                    
                    
                      {(sampleDataQuery.data?.contacts || []).map((c) => (
                        {c.name} — {c.title}
                      ))}
                    
                  
                
              
              
                Simulation Input
                 setSimulationInput(e.target.value)} className="min-h-[80px] text-xs" />
              

              {/* Progress indicator */}
              {simulationMutation.isPending && (
                
                  
                    {simProgressText}
                    {Math.round(simProgress)}%
                  
                  
                
              )}

              
                 simulationMutation.mutate()} disabled={simulationMutation.isPending} size="sm">
                  
                  {simulationMutation.isPending ? 'Running Simulation...' : 'Run Simulation'}
                
              
            
          

          {/* ── Simulation Result (Tabbed) ────────────────────────── */}
          {simulationMutation.data && (
            
              
                
                  
                    Simulation Result
                    
                      {simulationMutation.data.simulation?.usedDraftPrompt
                        ? `Using your current draft prompt (v${simulationMutation.data.simulation.draftVersion}, ${simulationMutation.data.simulation.draftSectionCount} sections)`
                        : `${simulationMutation.data.simulation?.turns || 0} turns completed`}
                    
                  
                  {simulationMutation.data.simulation?.scores && (
                    
                      = 70 ? 'default' : 'destructive'} className="text-lg px-3 py-1">
                        {simulationMutation.data.simulation.scores.overall}/100
                      
                    
                  )}
                
              
              
                 setSimResultTab(v as 'scores' | 'transcript' | 'analysis')}>
                  
                    Scores
                    Transcript
                    Analysis
                  

                  
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
                        
                          
                            
                              
                                
                                
                                
                                
                              
                            
                          
                          
                            
                              
                                
                                
                                
                                
                                
                                  {barData.map((entry, idx) => (
                                    
                                  ))}
                                
                              
                            
                          
                        
                      );
                    })()}
                    {/* Score cards row */}
                    {simulationMutation.data.simulation?.scores && (
                      
                        {Object.entries(simulationMutation.data.simulation.scores).filter(([k]) => k !== 'overall').map(([key, val]) => (
                          
                            = 80 ? 'text-green-600' : (val as number) >= 50 ? 'text-yellow-600' : 'text-red-600'}`}>{val as number}
                            {key.replace(/([A-Z])/g, ' $1').trim()}
                            
                              = 80 ? 'bg-green-500' : (val as number) >= 50 ? 'bg-yellow-500' : 'bg-red-500'}`} style={{ width: `${val}%` }} />
                            
                          
                        ))}
                      
                    )}
                  

                  
                    {simulationMutation.data.simulation?.transcriptPreview && (
                      
                        
                          {simulationMutation.data.simulation?.transcriptPreview?.length || 0} turns
                        
                        
                          
                            {(Array.isArray(simulationMutation.data.simulation.transcriptPreview) ? simulationMutation.data.simulation.transcriptPreview : []).map((turn: { role: string; content: string }, i: number) => (
                              
                                
                                  {turn.role === 'human' ? 'Contact' : 'AI Agent'}
                                  {turn.content}
                                
                              
                            ))}
                          
                        
                      
                    )}
                  

                  
                    {simulationMutation.data.analysis?.recommendations?.length > 0 && (
                      
                        Recommendations
                        
                          {simulationMutation.data.analysis.recommendations.map((r: string, i: number) => (
                            
                              {r}
                            
                          ))}
                        
                      
                    )}
                    {simulationMutation.data.analysis?.conversationStages?.length > 0 && (
                      
                        Conversation Stages
                        
                          {simulationMutation.data.analysis.conversationStages.map((s: string, i: number) => (
                            {s}
                          ))}
                        
                      
                    )}
                    {simulationMutation.data.analysis?.complianceViolations?.length > 0 && (
                      
                        Compliance Violations
                        
                          {simulationMutation.data.analysis.complianceViolations.map((v: string, i: number) => • {v})}
                        
                      
                    )}
                    {!simulationMutation.data.analysis && (
                      
                        
                        No analysis data available
                      
                    )}
                  
                
              
            
          )}


          {/* Custom scenario builder */}
          
            
              
                
                   Custom Scenarios
                  Create reusable test scenarios
                
                
                  
                    New Scenario
                  
                  
                    
                      Create Custom Scenario
                      Define a reusable test scenario with persona and objections.
                    
                    
                      Title setNewScenarioTitle(e.target.value)} placeholder="Scenario title" />
                      Description setNewScenarioDescription(e.target.value)} placeholder="Description / instructions" className="min-h-[60px]" />
                      
                        Default Persona
                          
                            
                            
                              {(simulationOptionsQuery.data?.personas || []).map((p) => (
                                {p.name}
                              ))}
                            
                          
                        
                        Objections setNewScenarioObjections(e.target.value)} placeholder="Comma-separated" />
                      
                    
                    
                       createCustomScenarioMutation.mutate()} disabled={createCustomScenarioMutation.isPending || !newScenarioTitle.trim()}>
                        Create Scenario
                      
                    
                  
                
              
            
            
              {(simulationOptionsQuery.data?.customScenarios || []).length === 0 ? (
                
                  
                  No custom scenarios
                  Create one to extend your simulation coverage
                
              ) : (
                
                  {(simulationOptionsQuery.data?.customScenarios || []).map((sc: CustomScenario) => (
                    
                      
                        
                          {sc.title}
                          {!sc.isApproved && Pending}
                        
                        {sc.description}
                      
                      
                        {isAdmin && !sc.isApproved && (
                          
                             approveCustomScenarioMutation.mutate(sc.id)}>
                              
                            
                          Approve
                        )}
                        {(isAdmin || sc.createdBy === (user as any)?.id) && (
                          
                             setDeleteConfirmTarget({ type: 'scenario', id: sc.id, name: sc.title })}>
                              
                            
                          Delete
                        )}
                      
                    
                  ))}
                
              )}
            
          

          {/* ── Live Voice Test ──────────────────────────────────────────────── */}
          
            
               Live Voice Test
              
                Speak directly with the AI agent using your current draft prompt. Browser-only — no phone call needed.
              
            
            
              {liveTestState === 'idle' && !liveTestResult && (
                
                  {/* Prompt Module Selection */}
                  
                    Prompt Modules
                    Select which prompt sections to include. Leave empty to use all.
                    
                      {sections.map(s => {
                        const isSelected = liveTestSectionIds.includes(s.sectionId);
                        return (
                           setLiveTestSectionIds(prev =>
                              isSelected ? prev.filter(id => id !== s.sectionId) : [...prev, s.sectionId]
                            )}
                          >
                            {s.name}
                          
                        );
                      })}
                    
                    {liveTestSectionIds.length > 0 && (
                      
                        {liveTestSectionIds.length} of {sections.length} modules selected
                         setLiveTestSectionIds([])}>Clear
                      
                    )}
                  

                  {/* Scenario Selection */}
                  
                    Test Scenario
                    
                      
                      
                        No scenario (free conversation)
                        {(simulationOptionsQuery.data?.scenarios || []).map(s => (
                          {s.title}
                        ))}
                      
                    
                  

                  
                    
                      Voice
                      
                        
                        
                          {OPENAI_VOICES.map(v => (
                            {v.label}
                          ))}
                        
                      
                      Uses OpenAI Realtime voices. Production uses Gemini voices.
                    
                    
                      
                        
                        Start Live Voice Test
                      
                    
                  
                
              )}

              {liveTestState === 'connecting' && (
                
                  
                  Connecting to AI agent...
                
              )}

              {(liveTestState === 'connected' || liveTestState === 'ending' || liveTestState === 'scoring') && (
                
                  {/* Call controls */}
                  
                    
                      
                        
                        Live — {formatDuration(liveTestDuration)}
                      
                      {liveTestVoice}
                    
                    
                      
                        {isMuted ?  : }
                      
                      
                        
                        End Test
                      
                    
                  

                  {/* Live transcript */}
                  
                    
                      {liveTranscript.length === 0 && liveTestState === 'connected' && (
                        Start speaking — transcript will appear here...
                      )}
                      {liveTranscript.map((turn, i) => (
                        
                          
                            {turn.role === 'user' ? 'You' : 'AI Agent'}
                            {turn.text}
                          
                        
                      ))}
                      
                    
                  

                  {liveTestState === 'scoring' && (
                    
                      
                      Scoring conversation...
                    
                  )}
                
              )}

              {/* Evaluation results */}
              {liveTestResult && liveTestState === 'idle' && (
                
                  
                    {[
                      { label: 'Overall', score: liveTestResult.scores.overall },
                      { label: 'Tone', score: liveTestResult.scores.toneAdherence },
                      { label: 'Objections', score: liveTestResult.scores.objectionHandling },
                      { label: 'Identity', score: liveTestResult.scores.identityLock },
                      { label: 'Call Flow', score: liveTestResult.scores.callFlow },
                    ].map(({ label, score }) => (
                      
                        {score}
                        {label}
                        
                          
                        
                      
                    ))}
                  

                  
                    = 70 ? 'default' : 'destructive'}>
                      {liveTestResult.scores.overall >= 70 ? 'PASS' : 'NEEDS WORK'}
                    
                    
                      Duration: {formatDuration(liveTestResult.durationSec)} · {liveTestResult.transcript.length} turns · Draft v{liveTestResult.draftVersion}
                    
                  

                  {liveTestResult.evaluation.recommendations.length > 0 && (
                    
                      Recommendations
                      
                        {liveTestResult.evaluation.recommendations.map((r, i) => (
                          
                            
                            {r}
                          
                        ))}
                      
                    
                  )}

                  {/* Transcript replay */}
                  
                    Full Transcript ({liveTestResult.transcript.length} turns)
                    
                      
                        {liveTestResult.transcript.map((turn, i) => (
                          
                            
                              {turn.role === 'user' ? 'You' : 'AI Agent'}
                              {turn.text}
                            
                          
                        ))}
                      
                    
                  

                  
                     { setLiveTestResult(null); }} variant="outline" size="sm">
                      
                      Run Again
                    
                     setShowLiveTestHistory(!showLiveTestHistory)} variant="ghost" size="sm">
                      
                      {showLiveTestHistory ? 'Hide' : 'Show'} History
                    
                  
                
              )}

              {/* Live test history */}
              {showLiveTestHistory && (
                
                  Recent Live Tests
                  {(liveTestHistoryQuery.data?.records || []).length === 0 ? (
                    No live tests recorded yet.
                  ) : (
                    
                      {(liveTestHistoryQuery.data?.records || []).map((rec) => (
                        
                          
                            
                              = 70 ? 'default' : 'secondary'} className="text-xs">
                                {rec.scores.overall}
                              
                              {new Date(rec.startedAt).toLocaleDateString()} {new Date(rec.startedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                            
                            {formatDuration(rec.durationSec)} · {rec.transcript.length} turns · v{rec.draftVersion}
                          
                          
                            
                              {[
                                { label: 'Overall', score: rec.scores.overall },
                                { label: 'Tone', score: rec.scores.toneAdherence },
                                { label: 'Objections', score: rec.scores.objectionHandling },
                                { label: 'Identity', score: rec.scores.identityLock },
                                { label: 'Call Flow', score: rec.scores.callFlow },
                              ].map(({ label, score }) => (
                                
                                  {label}: {score}
                                
                              ))}
                            
                            {rec.evaluation.recommendations.length > 0 && (
                              
                                {rec.evaluation.recommendations.map((r, i) => • {r})}
                              
                            )}
                            
                              
                                {rec.transcript.map((turn, i) => (
                                  
                                    
                                      {turn.text}
                                    
                                  
                                ))}
                              
                            
                          
                        
                      ))}
                    
                  )}
                
              )}
            
          

          {/* ── Simulation History (Collapsible, last) ────────────────────────── */}
          
            
              
                
                  
                    
                      
                         Simulation History
                        {simulationHistoryQuery.data?.records?.length || 0}
                      
                      Recorded simulation runs
                    
                    
                      
                        
                           { e.stopPropagation(); simulationHistoryQuery.refetch(); }}>
                            
                          
                        
                        Refresh
                      
                      {showSimHistory ?  : }
                    
                  
                
              
              
                
                  {(simulationHistoryQuery.data?.records || []).length === 0 ? (
                    
                      
                      No simulations yet
                      Run your first simulation above to see results here
                    
                  ) : (
                    <>
                      {/* Score trend chart */}
                      {(simulationHistoryQuery.data?.records || []).length >= 2 && (
                        
                          
                             ({ run: i + 1, overall: r.scores?.overall ?? 0 }))}>
                              
                              
                              
                              
                              
                            
                          
                        
                      )}
                      {/* Table */}
                      
                        
                          
                            
                              Score
                              Scenario
                              Turns
                              Date
                              
                            
                          
                          
                            {(simulationHistoryQuery.data?.records || []).map((rec: SimulationRecord) => (
                               setExpandedSimHistoryId(expandedSimHistoryId === rec.id ? null : rec.id)}>
                                
                                  = 70 ? 'default' : 'secondary'} className="text-xs font-mono">
                                    {rec.scores?.overall ?? '—'}
                                  
                                
                                {rec.scenarioTitle || rec.scenarioId}
                                {rec.turns}
                                {new Date(rec.runAt).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                                
                                  {expandedSimHistoryId === rec.id ?  : }
                                
                              
                            ))}
                          
                        
                      
                      {/* Expanded detail */}
                      {expandedSimHistoryId && (() => {
                        const rec = (simulationHistoryQuery.data?.records || []).find(r => r.id === expandedSimHistoryId);
                        if (!rec) return null;
                        return (
                          
                            {rec.scores && (
                              
                                {Object.entries(rec.scores).map(([k, v]) => (
                                  
                                    {k.replace(/([A-Z])/g, ' $1').trim()}
                                    = 70 ? 'text-green-600' : (v as number) >= 50 ? 'text-yellow-600' : 'text-red-600'}`}>{v as number}
                                  
                                ))}
                              
                            )}
                            {rec.evaluation?.recommendations?.length > 0 && (
                              
                                {rec.evaluation.recommendations.map((r, i) => • {r})}
                              
                            )}
                            
                              
                                {rec.transcript.map((t, i) => (
                                  
                                    
                                      {t.content}
                                    
                                  
                                ))}
                              
                            
                          
                        );
                      })()}
                    
                  )}
                
              
            
          
        

        
          {/* Voice trainers: Submit for Approval | Admins: Direct publish + Approval Queue */}
          {isVoiceTrainer ? (
            
              
                 Submit Changes for Admin Approval
                Your changes will be reviewed by an administrator before being published to production.
              
              
                 setPublishNote(e.target.value)}
                  placeholder="Describe your changes (required)"
                  className="text-sm"
                />
                
                   requestPublishMutation.mutate()}
                    disabled={requestPublishMutation.isPending || !publishNote.trim() || pendingRequests.length > 0}
                    size="sm"
                  >
                    
                    {pendingRequests.length > 0 ? 'Approval Pending...' : 'Submit for Approval'}
                  
                
              
            
          ) : (
            
              
                 Draft → Publish Governance
                Promote tested draft to unified production version
              
              
                 setPublishNote(e.target.value)} placeholder="Approval / publish note" />
                
                   publishMutation.mutate()} disabled={publishMutation.isPending}>
                    
                    Publish Draft to Production
                  
                
              
            
          )}

          {/* Approval Queue — visible to admins when there are pending requests */}
          {isAdmin && pendingRequests.length > 0 && (
            
              
                
                  
                  Pending Approval Requests
                  {pendingRequests.length}
                
                Voice trainers have submitted changes for your review
              
              
                {pendingRequests.map((request) => (
                  
                    
                      
                        {request.note}
                        
                          Draft v{request.draftVersion} · {request.sectionChanges.length} section{request.sectionChanges.length !== 1 ? 's' : ''} changed · {new Date(request.requestedAt).toLocaleString()}
                        
                      
                      Pending
                    

                    {/* Section change preview */}
                    
                      View changes
                      
                        {request.sectionChanges.map((change) => (
                          
                            {change.name}
                            
                              
                                Before:
                                {change.oldContent.slice(0, 500)}{change.oldContent.length > 500 ? '...' : ''}
                              
                              
                                After:
                                {change.newContent.slice(0, 500)}{change.newContent.length > 500 ? '...' : ''}
                              
                            
                          
                        ))}
                      
                    

                    {/* Approve / Reject actions */}
                    
                      
                         setApprovalReviewNote(e.target.value)}
                          className="text-xs"
                        />
                      
                       approveRequestMutation.mutate(request.id)}
                        disabled={approveRequestMutation.isPending}
                        className="bg-green-600 hover:bg-green-700"
                      >
                        
                        Approve & Publish
                      
                       {
                          const reason = rejectionNote || prompt('Rejection reason (required):');
                          if (reason) {
                            setRejectionNote(reason);
                            rejectRequestMutation.mutate(request.id);
                          }
                        }}
                        disabled={rejectRequestMutation.isPending}
                      >
                        
                        Reject
                      
                    
                  
                ))}
              
            
          )}

          {/* Publish request status for voice trainers */}
          {isVoiceTrainer && (publishRequestsQuery.data?.requests || []).length > 0 && (
            
              
                Your Publish Requests
              
              
                {(publishRequestsQuery.data?.requests || []).map((request) => (
                  
                    
                      {request.note}
                      
                        {request.status === 'pending' && }
                        {request.status === 'approved' && }
                        {request.status === 'rejected' && }
                        {request.status}
                      
                    
                    
                      Draft v{request.draftVersion} · {request.sectionChanges.length} changes · {new Date(request.requestedAt).toLocaleString()}
                    
                    {request.reviewNote && (
                      
                        Admin feedback: {request.reviewNote}
                      
                    )}
                  
                ))}
              
            
          )}

          
            
              
                Draft History
              
              
                {(versionsQuery.data?.draft?.history || []).map((entry) => (
                  
                    
                      Draft v{entry.version}
                      {new Date(entry.savedAt).toLocaleString()}
                    
                    {entry.summary}
                    {!isVoiceTrainer && (
                      
                         rollbackMutation.mutate(entry.version)}>
                          Restore
                        
                      
                    )}
                  
                ))}
              
            

            
              
                Publish History
              
              
                {(versionsQuery.data?.publishHistory || []).map((entry, idx) => (
                  
                    
                      Published {entry.publishedVersion}
                      {new Date(entry.publishedAt).toLocaleString()}
                    
                    {entry.note}
                    Changes: {entry.sectionChanges}
                  
                ))}
              
            
          

          {/* A/B Version Comparison */}
          
            
               A/B Version Comparison
              Compare any two draft versions side by side
            
            
              
                
                  Version A
                  
                    
                    
                      {(versionsQuery.data?.draft?.history || []).map(e => (
                        v{e.version} — {e.summary?.slice(0, 40)}
                      ))}
                    
                  
                
                
                  Version B
                  
                    
                    
                      {(versionsQuery.data?.draft?.history || []).map(e => (
                        v{e.version} — {e.summary?.slice(0, 40)}
                      ))}
                    
                  
                
              
              {diffVersionA && diffVersionB && diffVersionA !== diffVersionB && (
                
              )}
            
          

          {/* Activity Log */}
          
            
              
                
                   Activity Log
                  Audit trail of all training actions
                
                 setShowActivityLog(!showActivityLog)}>
                  {showActivityLog ? 'Hide' : 'Show'}
                
              
            
            {showActivityLog && (
              
                
                  {['all', 'prompt', 'simulation', 'version', 'comment', 'snippet', 'scenario'].map(cat => (
                     setActivityFilter(cat)}>
                      {cat}
                    
                  ))}
                
                
                  
                    {(activityLogQuery.data?.entries || []).length === 0 && No activity logged yet.}
                    {(activityLogQuery.data?.entries || []).map((entry: ActivityLogEntry) => (
                      
                        
                          {new Date(entry.timestamp).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                        
                        {entry.category}
                        {entry.action} — {entry.detail}
                      
                    ))}
                  
                
              
            )}
          
        

        
          
            
              Controlled Training Dataset
              Safe, non-sensitive records for QA and prompt refinement
            
            
              
                
                  Campaigns
                  {(sampleDataQuery.data?.campaigns || []).length} sample campaigns
                
                
                  Accounts
                  {(sampleDataQuery.data?.accounts || []).length} sample accounts
                
                
                  Contacts
                  {(sampleDataQuery.data?.contacts || []).length} sample contacts
                
              
              {JSON.stringify(sampleDataQuery.data, null, 2)}
            
          

          {/* Real Call Transcripts from DB */}
          
            
              
                
                   Real Call Transcripts
                  Actual call transcripts from production for training reference
                
                 setShowRealTranscripts(!showRealTranscripts)}>
                  {showRealTranscripts ? 'Hide' : 'Load Transcripts'}
                
              
            
            {showRealTranscripts && (
              
                {realTranscriptsQuery.isLoading && Loading transcripts...}
                {realTranscriptsQuery.isError && Failed to load transcripts}
                
                  
                    {(realTranscriptsQuery.data?.transcripts || []).length === 0 && !realTranscriptsQuery.isLoading && (
                      No transcripts found.
                    )}
                    {(realTranscriptsQuery.data?.transcripts || []).map((t: RealTranscript) => (
                      
                        
                          
                            
                            {t.contactName || 'Unknown'}
                            {t.disposition || 'N/A'}
                          
                          
                            {t.duration ? formatDuration(t.duration) : '—'} · {new Date(t.calledAt).toLocaleDateString()}
                          
                        
                        
                          
                            {(t.transcript || '').split('\n').filter((l: string) => l.trim()).map((line: string, i: number) => {
                              const isAgent = /^(Agent|AI):/i.test(line);
                              const isHuman = /^(Human|Contact|Prospect|Customer):/i.test(line);
                              const text = line.replace(/^(Agent|AI|Human|Contact|Prospect|Customer):\s*/i, '');
                              return (
                                
                                  
                                    {(isAgent || isHuman) && {isAgent ? 'Agent' : 'Contact'}: }
                                    {text}
                                  
                                
                              );
                            })}
                          
                        
                      
                    ))}
                  
                
              
            )}
          
        
      

      {/* ── Delete Confirmation Dialog ──────────────────────────── */}
       { if (!open) setDeleteConfirmTarget(null); }}>
        
          
            Delete {deleteConfirmTarget?.type === 'snippet' ? 'Snippet' : 'Scenario'}
            
              Are you sure you want to delete "{deleteConfirmTarget?.name}"? This action cannot be undone.
            
          
          
             setDeleteConfirmTarget(null)}>Cancel
             {
              if (!deleteConfirmTarget) return;
              if (deleteConfirmTarget.type === 'snippet') {
                deleteSnippetMutation.mutate(deleteConfirmTarget.id);
              } else {
                deleteCustomScenarioMutation.mutate(deleteConfirmTarget.id);
              }
              setDeleteConfirmTarget(null);
              toast({ title: 'Deleted', description: `${deleteConfirmTarget.name} has been removed.` });
            }}>
              Delete
            
          
        
      
    
    
  );
}