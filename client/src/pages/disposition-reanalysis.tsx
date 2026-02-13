/**
 * Disposition Reanalysis Page (Deep AI Analysis)
 *
 * Comprehensive admin page for AI-powered call disposition reanalysis with:
 *   - Deep transcript analysis against campaign goals
 *   - Agent behavior scoring (engagement, empathy, closing, objection handling)
 *   - Call quality assessment vs campaign QA parameters
 *   - Misclassification detection with confidence scoring
 *   - Clickable disposition counts → drill into filtered contacts
 *   - Professional chat-style transcript viewer (agent/prospect organized)
 *   - Push-to-dashboard / QA / client portal from contact detail
 *   - Full recording playback, interaction history, and action bar
 *
 * Route: /disposition-reanalysis
 *
 * API info:
 *   - Uses DeepSeek Chat (deepseek-chat) when DEEPSEEK_API_KEY is set, else OpenAI GPT-4o
 *   - Batch concurrency: 5 parallel AI calls per chunk
 *   - Max batch: 200 calls per preview, 100 per apply
 *   - Transcript truncated to 16K chars (40% head + 55% tail for closing context)
 */

import { useState, useCallback, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiRequest } from '@/lib/queryClient';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Checkbox } from '@/components/ui/checkbox';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { Textarea } from '@/components/ui/textarea';
import { Progress } from '@/components/ui/progress';
import {
  RefreshCw,
  Search,
  Play,
  Eye,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  ArrowRight,
  Phone,
  Clock,
  FileText,
  Loader2,
  BarChart3,
  Shield,
  Headphones,
  Users,
  TrendingUp,
  ArrowUpDown,
  Download,
  Send,
  Brain,
  Target,
  Star,
  MessageSquare,
  Activity,
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  History,
  Mic,
  Volume2,
} from 'lucide-react';

// ==================== TYPES ====================

interface DispositionStat {
  disposition: string;
  count: number;
  percentage: number;
  avgDurationSec: number;
  withTranscript: number;
  withRecording: number;
}

interface StatsResponse {
  total: number;
  distribution: DispositionStat[];
  potentialMisclassifications: number;
}

interface AgentBehaviorScore {
  engagementScore: number;
  empathyScore: number;
  objectionHandlingScore: number;
  closingScore: number;
  qualificationScore: number;
  scriptAdherenceScore: number;
  overallScore: number;
  strengths: string[];
  weaknesses: string[];
  coachingNotes: string;
}

interface CallQualityAssessment {
  campaignAlignmentScore: number;
  talkingPointsCoverage: number;
  missedTalkingPoints: string[];
  objectionResponseQuality: string;
  sentimentProgression: string;
  identityConfirmed: boolean;
  qualificationMet: boolean;
  keyMoments: Array<{ timestamp: string; description: string; impact: string }>;
}

interface DeepReanalysisCall {
  callSessionId: string;
  callAttemptId: string | null;
  contactId: string | null;
  contactName: string;
  companyName: string;
  contactEmail: string | null;
  contactPhone: string;
  campaignId: string;
  campaignName: string;
  campaignObjective: string | null;
  durationSec: number;
  currentDisposition: string;
  suggestedDisposition: string;
  confidence: number;
  reasoning: string;
  positiveSignals: string[];
  negativeSignals: string[];
  shouldOverride: boolean;
  agentType: string | null;
  agentBehavior: AgentBehaviorScore | null;
  callQuality: CallQualityAssessment | null;
  fullTranscript: any;
  transcriptPreview: string;
  recordingUrl: string | null;
  callDate: string;
  hasLead: boolean;
  leadId: string | null;
  qaStatus: string | null;
  actionTaken: string | null;
  pushStatus: {
    pushedToClient: boolean;
    pushedToQA: boolean;
    exportedAt: string | null;
  };
}

interface DeepReanalysisSummary {
  totalAnalyzed: number;
  totalShouldChange: number;
  totalChanged: number;
  totalErrors: number;
  dryRun: boolean;
  avgConfidence: number;
  avgAgentScore: number;
  avgCallQuality: number;
  breakdown: { currentDisposition: string; suggestedDisposition: string; count: number; avgConfidence: number }[];
  agentBehaviorSummary: {
    avgEngagement: number;
    avgEmpathy: number;
    avgObjectionHandling: number;
    avgClosing: number;
    avgQualification: number;
    avgScriptAdherence: number;
    topStrengths: string[];
    topWeaknesses: string[];
  };
  callQualitySummary: {
    avgCampaignAlignment: number;
    avgTalkingPointsCoverage: number;
    topMissedTalkingPoints: string[];
    identityConfirmedRate: number;
    qualificationMetRate: number;
  };
  calls: DeepReanalysisCall[];
  actionsSummary: {
    newLeadsCreated: number;
    leadsRemovedFromCampaign: number;
    movedToQA: number;
    movedToNeedsReview: number;
    retriesScheduled: number;
    pushedToClient: number;
  };
}

interface DispositionContact {
  callSessionId: string;
  callAttemptId: string | null;
  contactId: string | null;
  contactName: string;
  companyName: string;
  contactEmail: string | null;
  contactPhone: string;
  jobTitle: string | null;
  city: string | null;
  state: string | null;
  campaignId: string;
  campaignName: string;
  campaignObjective: string | null;
  durationSec: number;
  disposition: string;
  agentType: string | null;
  recordingUrl: string | null;
  fullTranscript: any;
  parsedTranscript: Array<{ role: string; text: string; turnNumber: number }>;
  transcriptSummary: string;
  callDate: string;
  hasLead: boolean;
  leadId: string | null;
  qaStatus: string | null;
  interactionHistory: Array<{
    date: string;
    disposition: string;
    durationSec: number;
    callSessionId: string;
    agentType: string | null;
    hasRecording: boolean;
    hasTranscript: boolean;
  }>;
  aiAnalysis: any;
}

interface ContactsByDispositionResponse {
  contacts: DispositionContact[];
  total: number;
  disposition: string;
  page: number;
  pageSize: number;
}

interface Campaign {
  id: string;
  name: string;
}

const DISPOSITION_LABELS: Record<string, string> = {
  qualified_lead: 'Qualified Lead',
  not_interested: 'Not Interested',
  do_not_call: 'Do Not Call',
  voicemail: 'Voicemail',
  no_answer: 'No Answer',
  invalid_data: 'Invalid Data',
  needs_review: 'Needs Review',
  callback_requested: 'Callback Requested',
  unknown: 'Unknown',
};

const DISPOSITION_COLORS: Record<string, string> = {
  qualified_lead: 'bg-emerald-100 text-emerald-800 border-emerald-200',
  not_interested: 'bg-red-100 text-red-800 border-red-200',
  do_not_call: 'bg-red-200 text-red-900 border-red-300',
  voicemail: 'bg-amber-100 text-amber-800 border-amber-200',
  no_answer: 'bg-slate-100 text-slate-700 border-slate-200',
  invalid_data: 'bg-orange-100 text-orange-800 border-orange-200',
  needs_review: 'bg-blue-100 text-blue-800 border-blue-200',
  callback_requested: 'bg-purple-100 text-purple-800 border-purple-200',
  unknown: 'bg-gray-100 text-gray-600 border-gray-200',
};

function DispositionBadge({ disposition }: { disposition: string }) {
  const colors = DISPOSITION_COLORS[disposition] || DISPOSITION_COLORS.unknown;
  const label = DISPOSITION_LABELS[disposition] || disposition;
  return (
    <Badge variant="outline" className={`${colors} text-xs font-medium`}>
      {label}
    </Badge>
  );
}

function ConfidenceBadge({ confidence }: { confidence: number }) {
  const pct = Math.round(confidence * 100);
  const color =
    pct >= 80 ? 'bg-emerald-100 text-emerald-800' :
    pct >= 60 ? 'bg-amber-100 text-amber-800' :
    'bg-red-100 text-red-800';
  return <Badge variant="outline" className={`${color} text-xs`}>{pct}%</Badge>;
}

function ScoreBar({ label, score, color = 'bg-primary' }: { label: string; score: number; color?: string }) {
  const barColor = score >= 70 ? 'bg-emerald-500' : score >= 40 ? 'bg-amber-500' : 'bg-red-500';
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-xs">
        <span className="text-muted-foreground">{label}</span>
        <span className="font-medium">{score}/100</span>
      </div>
      <div className="h-1.5 w-full bg-muted rounded-full overflow-hidden">
        <div className={`h-full rounded-full transition-all ${barColor}`} style={{ width: `${score}%` }} />
      </div>
    </div>
  );
}

function formatDuration(sec: number): string {
  if (!sec) return '0s';
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return m > 0 ? `${m}m${s}s` : `${s}s`;
}

function formatDate(iso: string): string {
  if (!iso) return '';
  const d = new Date(iso);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

// ==================== MAIN COMPONENT ====================

export default function DispositionReanalysisPage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Filters
  const [campaignId, setCampaignId] = useState<string>('');
  const [dispositionFilter, setDispositionFilter] = useState<string[]>([]);
  const [dateFrom, setDateFrom] = useState<string>('');
  const [dateTo, setDateTo] = useState<string>('');
  const [minDuration, setMinDuration] = useState<string>('');
  const [maxDuration, setMaxDuration] = useState<string>('');
  const [batchLimit, setBatchLimit] = useState<string>('30');
  const [agentTypeFilter, setAgentTypeFilter] = useState<string>('all');
  const [confidenceThreshold, setConfidenceThreshold] = useState<string>('');

  // State
  const [activeTab, setActiveTab] = useState<string>('overview');
  const [previewResult, setPreviewResult] = useState<DeepReanalysisSummary | null>(null);
  const [selectedCalls, setSelectedCalls] = useState<Set<string>>(new Set());
  const [detailCallId, setDetailCallId] = useState<string | null>(null);
  const [detailCall, setDetailCall] = useState<DeepReanalysisCall | null>(null);
  const [overrideDialog, setOverrideDialog] = useState<{ callSessionId: string; currentDisp: string } | null>(null);
  const [overrideDisposition, setOverrideDisposition] = useState<string>('');
  const [overrideReason, setOverrideReason] = useState<string>('');
  const [pushClientDialog, setPushClientDialog] = useState(false);
  const [clientNotes, setClientNotes] = useState('');
  const [resultsFilter, setResultsFilter] = useState<'all' | 'changes' | 'correct'>('all');

  // Contacts-by-disposition state
  const [contactsDisposition, setContactsDisposition] = useState<string>('');
  const [contactsPage, setContactsPage] = useState(0);
  const [contactsSearch, setContactsSearch] = useState('');
  const [selectedContactDetail, setSelectedContactDetail] = useState<DispositionContact | null>(null);
  const [contactDetailTab, setContactDetailTab] = useState<'transcript' | 'analysis' | 'history'>('transcript');
  const [pushDashboardNotes, setPushDashboardNotes] = useState('');
  const [pushDashboardDialog, setPushDashboardDialog] = useState(false);
  const [selectedContactIds, setSelectedContactIds] = useState<Set<string>>(new Set());

  // ==================== QUERIES ====================

  const { data: campaignsData } = useQuery<Campaign[]>({
    queryKey: ['/api/campaigns'],
    queryFn: async () => {
      const res = await apiRequest('GET', '/api/campaigns');
      const data = await res.json();
      return Array.isArray(data) ? data : data?.campaigns || [];
    },
  });

  const { data: stats, isLoading: statsLoading, refetch: refetchStats } = useQuery<StatsResponse>({
    queryKey: ['/api/disposition-reanalysis/stats', campaignId, dateFrom, dateTo],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (campaignId) params.set('campaignId', campaignId);
      if (dateFrom) params.set('dateFrom', dateFrom);
      if (dateTo) params.set('dateTo', dateTo);
      const res = await apiRequest('GET', `/api/disposition-reanalysis/stats?${params}`);
      return res.json();
    },
  });

  // Contacts by disposition query
  const { data: contactsByDisp, isLoading: contactsLoading, refetch: refetchContacts } = useQuery<ContactsByDispositionResponse>({
    queryKey: ['/api/disposition-reanalysis/contacts-by-disposition', contactsDisposition, campaignId, dateFrom, dateTo, contactsPage, contactsSearch],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (campaignId) params.set('campaignId', campaignId);
      if (dateFrom) params.set('dateFrom', dateFrom);
      if (dateTo) params.set('dateTo', dateTo);
      params.set('limit', '50');
      params.set('offset', String(contactsPage * 50));
      if (contactsSearch) params.set('search', contactsSearch);
      const res = await apiRequest('GET', `/api/disposition-reanalysis/contacts-by-disposition/${contactsDisposition}?${params}`);
      return res.json();
    },
    enabled: !!contactsDisposition && activeTab === 'contacts',
  });

  // Deep single call analysis
  const { data: deepCallDetail, isLoading: detailLoading } = useQuery<DeepReanalysisCall>({
    queryKey: ['/api/disposition-reanalysis/deep/analyze', detailCallId],
    queryFn: async () => {
      const res = await apiRequest('GET', `/api/disposition-reanalysis/deep/analyze/${detailCallId}`);
      return res.json();
    },
    enabled: !!detailCallId && !detailCall,
  });

  // Use either inline detail (from batch) or fetched detail
  const activeCallDetail = detailCall || deepCallDetail;

  // ==================== MUTATIONS ====================

  // Deep Preview (dry-run)
  const previewMutation = useMutation({
    mutationFn: async () => {
      const body: any = {
        hasTranscript: true,
        limit: parseInt(batchLimit) || 30,
        agentType: agentTypeFilter,
      };
      if (campaignId) body.campaignId = campaignId;
      if (dispositionFilter.length > 0) body.dispositions = dispositionFilter;
      if (dateFrom) body.dateFrom = dateFrom;
      if (dateTo) body.dateTo = dateTo;
      if (minDuration) body.minDurationSec = parseInt(minDuration);
      if (maxDuration) body.maxDurationSec = parseInt(maxDuration);
      if (confidenceThreshold) body.confidenceThreshold = parseFloat(confidenceThreshold) / 100;

      const res = await apiRequest('POST', '/api/disposition-reanalysis/deep/preview', body, { timeout: 600000 });
      return res.json() as Promise<DeepReanalysisSummary>;
    },
    onSuccess: (data) => {
      setPreviewResult(data);
      setActiveTab('results');
      toast({ title: 'Deep Analysis Complete', description: `Analyzed ${data.totalAnalyzed} calls. ${data.totalShouldChange} misclassifications found. Avg agent score: ${Math.round(data.avgAgentScore)}/100` });
    },
    onError: (err: any) => {
      toast({ title: 'Analysis Failed', description: err.message, variant: 'destructive' });
    },
  });

  // Deep Apply
  const applyMutation = useMutation({
    mutationFn: async () => {
      const body: any = {
        hasTranscript: true,
        limit: parseInt(batchLimit) || 30,
        agentType: agentTypeFilter,
      };
      if (campaignId) body.campaignId = campaignId;
      if (dispositionFilter.length > 0) body.dispositions = dispositionFilter;
      if (dateFrom) body.dateFrom = dateFrom;
      if (dateTo) body.dateTo = dateTo;
      if (minDuration) body.minDurationSec = parseInt(minDuration);
      if (maxDuration) body.maxDurationSec = parseInt(maxDuration);
      if (confidenceThreshold) body.confidenceThreshold = parseFloat(confidenceThreshold) / 100;

      const res = await apiRequest('POST', '/api/disposition-reanalysis/deep/apply', body, { timeout: 600000 });
      return res.json() as Promise<DeepReanalysisSummary>;
    },
    onSuccess: (data) => {
      setPreviewResult(data);
      queryClient.invalidateQueries({ queryKey: ['/api/disposition-reanalysis/stats'] });
      toast({ title: 'Changes Applied', description: `Updated ${data.totalChanged} dispositions. ${data.totalErrors} errors.` });
    },
    onError: (err: any) => {
      toast({ title: 'Apply Failed', description: err.message, variant: 'destructive' });
    },
  });

  // Single override
  const overrideMutation = useMutation({
    mutationFn: async ({ callSessionId, newDisposition, reason }: { callSessionId: string; newDisposition: string; reason: string }) => {
      const res = await apiRequest('POST', `/api/disposition-reanalysis/override/${callSessionId}`, { newDisposition, reason });
      return res.json();
    },
    onSuccess: (data) => {
      setOverrideDialog(null);
      setOverrideDisposition('');
      setOverrideReason('');
      queryClient.invalidateQueries({ queryKey: ['/api/disposition-reanalysis/stats'] });
      queryClient.invalidateQueries({ queryKey: ['/api/disposition-reanalysis/contacts-by-disposition'] });
      toast({ title: 'Disposition Updated', description: data.action || 'Success' });
    },
    onError: (err: any) => {
      toast({ title: 'Override Failed', description: err.message, variant: 'destructive' });
    },
  });

  // Bulk override
  const bulkOverrideMutation = useMutation({
    mutationFn: async ({ newDisposition, reason }: { newDisposition: string; reason: string }) => {
      const overrides = Array.from(selectedCalls).map(callSessionId => ({ callSessionId, newDisposition, reason }));
      const res = await apiRequest('POST', '/api/disposition-reanalysis/bulk-override', { overrides });
      return res.json();
    },
    onSuccess: (data) => {
      setSelectedCalls(new Set());
      queryClient.invalidateQueries({ queryKey: ['/api/disposition-reanalysis/stats'] });
      queryClient.invalidateQueries({ queryKey: ['/api/disposition-reanalysis/contacts-by-disposition'] });
      toast({ title: 'Bulk Override Complete', description: `${data.succeeded} succeeded, ${data.failed} failed` });
    },
    onError: (err: any) => {
      toast({ title: 'Bulk Override Failed', description: err.message, variant: 'destructive' });
    },
  });

  // Push to QA (supports both selectedCalls and selectedContactIds)
  const pushToQAMutation = useMutation({
    mutationFn: async (ids?: string[]) => {
      const callIds = ids || Array.from(selectedCalls.size > 0 ? selectedCalls : selectedContactIds);
      const res = await apiRequest('POST', '/api/disposition-reanalysis/deep/push-to-qa', {
        callSessionIds: callIds,
      });
      return res.json();
    },
    onSuccess: (data) => {
      toast({ title: 'Pushed to QA', description: `${data.succeeded} pushed, ${data.failed} failed` });
      setSelectedCalls(new Set());
      setSelectedContactIds(new Set());
      queryClient.invalidateQueries({ queryKey: ['/api/disposition-reanalysis/contacts-by-disposition'] });
    },
    onError: (err: any) => {
      toast({ title: 'Push to QA Failed', description: err.message, variant: 'destructive' });
    },
  });

  // Push to Client
  const pushToClientMutation = useMutation({
    mutationFn: async (ids?: string[]) => {
      const callIds = ids || Array.from(selectedCalls.size > 0 ? selectedCalls : selectedContactIds);
      const res = await apiRequest('POST', '/api/disposition-reanalysis/deep/push-to-client', {
        callSessionIds: callIds,
        clientNotes,
      });
      return res.json();
    },
    onSuccess: (data) => {
      setPushClientDialog(false);
      setClientNotes('');
      toast({ title: 'Pushed to Client', description: `${data.succeeded} calls pushed to client portal` });
      setSelectedCalls(new Set());
      setSelectedContactIds(new Set());
      queryClient.invalidateQueries({ queryKey: ['/api/disposition-reanalysis/contacts-by-disposition'] });
    },
    onError: (err: any) => {
      toast({ title: 'Push to Client Failed', description: err.message, variant: 'destructive' });
    },
  });

  // Push to Dashboard
  const pushToDashboardMutation = useMutation({
    mutationFn: async (ids?: string[]) => {
      const callIds = ids || Array.from(selectedCalls.size > 0 ? selectedCalls : selectedContactIds);
      const res = await apiRequest('POST', '/api/disposition-reanalysis/deep/push-to-dashboard', {
        callSessionIds: callIds,
        notes: pushDashboardNotes,
      });
      return res.json();
    },
    onSuccess: (data) => {
      setPushDashboardDialog(false);
      setPushDashboardNotes('');
      toast({ title: 'Pushed to Dashboard', description: `${data.succeeded} calls pushed to main dashboard` });
      setSelectedCalls(new Set());
      setSelectedContactIds(new Set());
      queryClient.invalidateQueries({ queryKey: ['/api/disposition-reanalysis/contacts-by-disposition'] });
    },
    onError: (err: any) => {
      toast({ title: 'Push to Dashboard Failed', description: err.message, variant: 'destructive' });
    },
  });

  // ==================== HANDLERS ====================

  const toggleDispositionFilter = useCallback((disp: string) => {
    setDispositionFilter(prev =>
      prev.includes(disp) ? prev.filter(d => d !== disp) : [...prev, disp]
    );
  }, []);

  const toggleCallSelection = useCallback((id: string) => {
    setSelectedCalls(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }, []);

  const toggleContactSelection = useCallback((id: string) => {
    setSelectedContactIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }, []);

  const selectAllChangeable = useCallback(() => {
    if (!previewResult) return;
    const changeable = previewResult.calls
      .filter(c => c.shouldOverride && c.suggestedDisposition !== c.currentDisposition)
      .map(c => c.callSessionId);
    setSelectedCalls(new Set(changeable));
  }, [previewResult]);

  // Click a disposition count → navigate to contacts tab filtered
  const handleDispositionCountClick = useCallback((disposition: string) => {
    setContactsDisposition(disposition);
    setContactsPage(0);
    setContactsSearch('');
    setSelectedContactIds(new Set());
    setActiveTab('contacts');
  }, []);

  const handleExport = useCallback(async (format: 'csv' | 'json') => {
    if (!previewResult?.calls?.length) return;
    try {
      const res = await apiRequest('POST', '/api/disposition-reanalysis/deep/export', {
        calls: previewResult.calls,
        format,
      });
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `disposition-reanalysis-${new Date().toISOString().split('T')[0]}.${format}`;
      a.click();
      URL.revokeObjectURL(url);
      toast({ title: 'Export Complete', description: `Downloaded ${previewResult.calls.length} records as ${format.toUpperCase()}` });
    } catch (err: any) {
      toast({ title: 'Export Failed', description: err.message, variant: 'destructive' });
    }
  }, [previewResult, toast]);

  const filteredCalls = useMemo(() => {
    if (!previewResult?.calls) return [];
    switch (resultsFilter) {
      case 'changes':
        return previewResult.calls.filter(c => c.shouldOverride && c.suggestedDisposition !== c.currentDisposition);
      case 'correct':
        return previewResult.calls.filter(c => !c.shouldOverride || c.suggestedDisposition === c.currentDisposition);
      default:
        return previewResult.calls;
    }
  }, [previewResult, resultsFilter]);

  // ==================== RENDER ====================

  return (
    <div className="flex flex-col gap-6 p-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Disposition Reanalysis</h1>
          <p className="text-muted-foreground mt-1">
            Analyze call recordings & transcripts to detect misclassified dispositions and re-route leads
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={() => refetchStats()} disabled={statsLoading}>
          <RefreshCw className={`mr-2 h-4 w-4 ${statsLoading ? 'animate-spin' : ''}`} />
          Refresh
        </Button>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="overview" className="gap-1.5">
            <BarChart3 className="h-4 w-4" /> Overview
          </TabsTrigger>
          <TabsTrigger value="analyze" className="gap-1.5">
            <Search className="h-4 w-4" /> Analyze & Preview
          </TabsTrigger>
          <TabsTrigger value="results" className="gap-1.5">
            <FileText className="h-4 w-4" />
            Results
            {previewResult && (
              <Badge variant="secondary" className="ml-1.5 text-xs">
                {previewResult.totalShouldChange}
              </Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="contacts" className="gap-1.5">
            <Users className="h-4 w-4" />
            Contacts
            {contactsDisposition && (
              <Badge variant="secondary" className="ml-1.5 text-xs">
                {DISPOSITION_LABELS[contactsDisposition] || contactsDisposition}
              </Badge>
            )}
          </TabsTrigger>
        </TabsList>

        {/* ==================== OVERVIEW TAB ==================== */}
        <TabsContent value="overview" className="space-y-6">
          {/* Alert banner */}
          {stats && stats.potentialMisclassifications > 0 && (
            <Card className="border-amber-200 bg-amber-50">
              <CardContent className="flex items-center gap-3 py-4">
                <AlertTriangle className="h-5 w-5 text-amber-600 flex-shrink-0" />
                <div>
                  <p className="font-medium text-amber-900">
                    {stats.potentialMisclassifications} potential misclassifications detected
                  </p>
                  <p className="text-sm text-amber-700">
                    Long "not interested" calls, "no answer" calls with transcripts, or extended "voicemail" sessions.
                    Use the Analyze tab to review and correct.
                  </p>
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  className="ml-auto border-amber-300 text-amber-800 hover:bg-amber-100"
                  onClick={() => setActiveTab('analyze')}
                >
                  Review Now
                </Button>
              </CardContent>
            </Card>
          )}

          {/* Stats cards */}
          <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center gap-2">
                  <Phone className="h-4 w-4 text-muted-foreground" />
                  <span className="text-sm text-muted-foreground">Total Calls</span>
                </div>
                <p className="text-2xl font-bold mt-1">{stats?.total?.toLocaleString() || '—'}</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center gap-2">
                  <AlertTriangle className="h-4 w-4 text-amber-500" />
                  <span className="text-sm text-muted-foreground">Potential Issues</span>
                </div>
                <p className="text-2xl font-bold mt-1 text-amber-600">
                  {stats?.potentialMisclassifications?.toLocaleString() || '0'}
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                  <span className="text-sm text-muted-foreground">Qualified Leads</span>
                </div>
                <p className="text-2xl font-bold mt-1 text-emerald-600">
                  {stats?.distribution?.find(d => d.disposition === 'qualified_lead')?.count?.toLocaleString() || '0'}
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center gap-2">
                  <XCircle className="h-4 w-4 text-red-500" />
                  <span className="text-sm text-muted-foreground">Not Interested</span>
                </div>
                <p className="text-2xl font-bold mt-1 text-red-600">
                  {stats?.distribution?.find(d => d.disposition === 'not_interested')?.count?.toLocaleString() || '0'}
                </p>
              </CardContent>
            </Card>
          </div>

          {/* Distribution table */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Disposition Distribution</CardTitle>
              <CardDescription>Breakdown of all call dispositions with transcript and recording availability</CardDescription>
            </CardHeader>
            <CardContent>
              {statsLoading ? (
                <div className="flex items-center justify-center py-10">
                  <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Disposition</TableHead>
                      <TableHead className="text-right">Count</TableHead>
                      <TableHead className="text-right">%</TableHead>
                      <TableHead className="text-right">Avg Duration</TableHead>
                      <TableHead className="text-right">With Transcript</TableHead>
                      <TableHead className="text-right">With Recording</TableHead>
                      <TableHead className="text-right">Action</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {stats?.distribution?.map((d) => (
                      <TableRow key={d.disposition}>
                        <TableCell><DispositionBadge disposition={d.disposition} /></TableCell>
                        <TableCell className="text-right">
                          <button
                            onClick={() => handleDispositionCountClick(d.disposition)}
                            className="font-bold text-primary hover:underline cursor-pointer"
                            title={`View all ${d.count} ${DISPOSITION_LABELS[d.disposition] || d.disposition} contacts`}
                          >
                            {d.count.toLocaleString()}
                          </button>
                        </TableCell>
                        <TableCell className="text-right">{d.percentage}%</TableCell>
                        <TableCell className="text-right">{formatDuration(d.avgDurationSec)}</TableCell>
                        <TableCell className="text-right">{d.withTranscript.toLocaleString()}</TableCell>
                        <TableCell className="text-right">{d.withRecording.toLocaleString()}</TableCell>
                        <TableCell className="text-right">
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => {
                              setDispositionFilter([d.disposition]);
                              setActiveTab('analyze');
                            }}
                          >
                            <Search className="h-3.5 w-3.5 mr-1" /> Analyze
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ==================== ANALYZE TAB ==================== */}
        <TabsContent value="analyze" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Reanalysis Filters</CardTitle>
              <CardDescription>
                Configure which calls to analyze. Preview first (dry-run), then apply changes.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
                {/* Campaign */}
                <div className="space-y-2">
                  <Label>Campaign</Label>
                  <Select value={campaignId || "all"} onValueChange={(v) => setCampaignId(v === "all" ? "" : v)}>
                    <SelectTrigger>
                      <SelectValue placeholder="All campaigns" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All campaigns</SelectItem>
                      {campaignsData?.map((c) => (
                        <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {/* Date range */}
                <div className="space-y-2">
                  <Label>Date From</Label>
                  <Input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label>Date To</Label>
                  <Input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
                </div>
              </div>

              <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
                {/* Duration range */}
                <div className="space-y-2">
                  <Label>Min Duration (sec)</Label>
                  <Input type="number" placeholder="0" value={minDuration} onChange={(e) => setMinDuration(e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label>Max Duration (sec)</Label>
                  <Input type="number" placeholder="Any" value={maxDuration} onChange={(e) => setMaxDuration(e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label>Batch Size</Label>
                  <Input type="number" placeholder="50" value={batchLimit} onChange={(e) => setBatchLimit(e.target.value)} />
                </div>
              </div>

              {/* Disposition filters */}
              <div className="space-y-2">
                <Label>Filter by Current Disposition</Label>
                <div className="flex flex-wrap gap-2">
                  {Object.entries(DISPOSITION_LABELS).filter(([k]) => k !== 'unknown').map(([key, label]) => (
                    <button
                      key={key}
                      onClick={() => toggleDispositionFilter(key)}
                      className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
                        dispositionFilter.includes(key)
                          ? 'bg-primary text-primary-foreground border-primary'
                          : 'bg-muted text-muted-foreground hover:bg-muted/80'
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                  {dispositionFilter.length > 0 && (
                    <button
                      onClick={() => setDispositionFilter([])}
                      className="rounded-full border px-3 py-1 text-xs font-medium text-red-600 hover:bg-red-50"
                    >
                      Clear
                    </button>
                  )}
                </div>
              </div>

              <Separator />

              <div className="flex gap-3">
                <Button
                  onClick={() => previewMutation.mutate()}
                  disabled={previewMutation.isPending}
                >
                  {previewMutation.isPending ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <Eye className="mr-2 h-4 w-4" />
                  )}
                  Preview Changes (Dry Run)
                </Button>
                <Button
                  variant="destructive"
                  onClick={() => {
                    if (window.confirm('This will modify call dispositions and route leads. Are you sure?')) {
                      applyMutation.mutate();
                    }
                  }}
                  disabled={applyMutation.isPending}
                >
                  {applyMutation.isPending ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <Play className="mr-2 h-4 w-4" />
                  )}
                  Apply Changes
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ==================== RESULTS TAB ==================== */}
        <TabsContent value="results" className="space-y-6">
          {!previewResult ? (
            <Card>
              <CardContent className="py-10 text-center text-muted-foreground">
                <FileText className="h-10 w-10 mx-auto mb-3 opacity-40" />
                <p>No analysis results yet. Use the Analyze tab to run a preview.</p>
              </CardContent>
            </Card>
          ) : (
            <>
              {/* Summary cards */}
              <div className="grid grid-cols-2 gap-4 md:grid-cols-5">
                <Card>
                  <CardContent className="pt-6 text-center">
                    <p className="text-sm text-muted-foreground">Analyzed</p>
                    <p className="text-2xl font-bold">{previewResult.totalAnalyzed}</p>
                  </CardContent>
                </Card>
                <Card className="border-amber-200">
                  <CardContent className="pt-6 text-center">
                    <p className="text-sm text-amber-600">Should Change</p>
                    <p className="text-2xl font-bold text-amber-700">{previewResult.totalShouldChange}</p>
                  </CardContent>
                </Card>
                <Card className={previewResult.dryRun ? '' : 'border-emerald-200'}>
                  <CardContent className="pt-6 text-center">
                    <p className="text-sm text-muted-foreground">
                      {previewResult.dryRun ? 'Mode' : 'Changed'}
                    </p>
                    <p className="text-2xl font-bold">
                      {previewResult.dryRun ? (
                        <Badge variant="outline">Dry Run</Badge>
                      ) : (
                        <span className="text-emerald-600">{previewResult.totalChanged}</span>
                      )}
                    </p>
                  </CardContent>
                </Card>
                <Card className={previewResult.totalErrors > 0 ? 'border-red-200' : ''}>
                  <CardContent className="pt-6 text-center">
                    <p className="text-sm text-muted-foreground">Errors</p>
                    <p className={`text-2xl font-bold ${previewResult.totalErrors > 0 ? 'text-red-600' : ''}`}>
                      {previewResult.totalErrors}
                    </p>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="pt-6 text-center">
                    <p className="text-sm text-muted-foreground">Selected</p>
                    <p className="text-2xl font-bold text-primary">{selectedCalls.size}</p>
                  </CardContent>
                </Card>
              </div>

              {/* Breakdown */}
              {previewResult.breakdown.length > 0 && (
                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-base">Change Breakdown</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="flex flex-wrap gap-3">
                      {previewResult.breakdown.map((b, i) => (
                        <div key={i} className="flex items-center gap-2 rounded-lg border bg-muted/40 px-3 py-2 text-sm">
                          <DispositionBadge disposition={b.currentDisposition} />
                          <ArrowRight className="h-3.5 w-3.5 text-muted-foreground" />
                          <DispositionBadge disposition={b.suggestedDisposition} />
                          <Badge variant="secondary" className="ml-1">{b.count}</Badge>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* Actions summary (when applied) */}
              {!previewResult.dryRun && (
                <Card className="border-emerald-200 bg-emerald-50/50">
                  <CardHeader className="pb-3">
                    <CardTitle className="text-base text-emerald-800">Actions Taken</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="grid grid-cols-2 gap-4 md:grid-cols-5">
                      <div className="text-center">
                        <p className="text-sm text-muted-foreground">Leads Created</p>
                        <p className="text-xl font-bold text-emerald-700">{previewResult.actionsSummary.newLeadsCreated}</p>
                      </div>
                      <div className="text-center">
                        <p className="text-sm text-muted-foreground">Removed</p>
                        <p className="text-xl font-bold text-red-600">{previewResult.actionsSummary.leadsRemovedFromCampaign}</p>
                      </div>
                      <div className="text-center">
                        <p className="text-sm text-muted-foreground">→ QA</p>
                        <p className="text-xl font-bold text-blue-600">{previewResult.actionsSummary.movedToQA}</p>
                      </div>
                      <div className="text-center">
                        <p className="text-sm text-muted-foreground">→ Review</p>
                        <p className="text-xl font-bold text-amber-600">{previewResult.actionsSummary.movedToNeedsReview}</p>
                      </div>
                      <div className="text-center">
                        <p className="text-sm text-muted-foreground">Retries</p>
                        <p className="text-xl font-bold text-slate-600">{previewResult.actionsSummary.retriesScheduled}</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* Bulk actions bar */}
              {selectedCalls.size > 0 && (
                <Card className="border-primary/30 bg-primary/5">
                  <CardContent className="flex items-center gap-4 py-3">
                    <span className="text-sm font-medium">{selectedCalls.size} calls selected</span>
                    <Select
                      value={overrideDisposition}
                      onValueChange={setOverrideDisposition}
                    >
                      <SelectTrigger className="w-[200px]">
                        <SelectValue placeholder="Set disposition..." />
                      </SelectTrigger>
                      <SelectContent>
                        {Object.entries(DISPOSITION_LABELS).filter(([k]) => k !== 'unknown').map(([key, label]) => (
                          <SelectItem key={key} value={key}>{label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Button
                      size="sm"
                      disabled={!overrideDisposition || bulkOverrideMutation.isPending}
                      onClick={() => {
                        if (window.confirm(`Override ${selectedCalls.size} calls to "${DISPOSITION_LABELS[overrideDisposition]}"?`)) {
                          bulkOverrideMutation.mutate({
                            newDisposition: overrideDisposition,
                            reason: 'Bulk override from reanalysis page',
                          });
                        }
                      }}
                    >
                      {bulkOverrideMutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                      Apply to Selected
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => setSelectedCalls(new Set())}>
                      Clear Selection
                    </Button>
                  </CardContent>
                </Card>
              )}

              {/* Calls table */}
              <Card>
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-base">Analyzed Calls</CardTitle>
                    <div className="flex gap-2">
                      <Button variant="outline" size="sm" onClick={selectAllChangeable}>
                        Select All Changeable
                      </Button>
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  <ScrollArea className="h-[600px]">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="w-10"></TableHead>
                          <TableHead>Contact</TableHead>
                          <TableHead>Campaign</TableHead>
                          <TableHead>Current</TableHead>
                          <TableHead>Suggested</TableHead>
                          <TableHead>Confidence</TableHead>
                          <TableHead>Duration</TableHead>
                          <TableHead>Date</TableHead>
                          <TableHead>Actions</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {previewResult.calls
                          .filter(c => c.shouldOverride || c.suggestedDisposition !== c.currentDisposition)
                          .concat(previewResult.calls.filter(c => !c.shouldOverride && c.suggestedDisposition === c.currentDisposition))
                          .map((call) => {
                            const hasChange = call.shouldOverride && call.suggestedDisposition !== call.currentDisposition;
                            return (
                              <TableRow
                                key={call.callSessionId}
                                className={hasChange ? 'bg-amber-50/50' : ''}
                              >
                                <TableCell>
                                  {hasChange && (
                                    <Checkbox
                                      checked={selectedCalls.has(call.callSessionId)}
                                      onCheckedChange={() => toggleCallSelection(call.callSessionId)}
                                    />
                                  )}
                                </TableCell>
                                <TableCell>
                                  <div>
                                    <p className="font-medium text-sm">{call.contactName}</p>
                                    <p className="text-xs text-muted-foreground">{call.companyName}</p>
                                  </div>
                                </TableCell>
                                <TableCell className="text-sm">{call.campaignName}</TableCell>
                                <TableCell><DispositionBadge disposition={call.currentDisposition} /></TableCell>
                                <TableCell>
                                  {hasChange ? (
                                    <div className="flex items-center gap-1">
                                      <ArrowRight className="h-3 w-3 text-amber-500" />
                                      <DispositionBadge disposition={call.suggestedDisposition} />
                                    </div>
                                  ) : (
                                    <span className="text-xs text-muted-foreground">No change</span>
                                  )}
                                </TableCell>
                                <TableCell><ConfidenceBadge confidence={call.confidence} /></TableCell>
                                <TableCell className="text-sm">{formatDuration(call.durationSec)}</TableCell>
                                <TableCell className="text-xs text-muted-foreground">{formatDate(call.callDate)}</TableCell>
                                <TableCell>
                                  <div className="flex gap-1">
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      onClick={() => setDetailCallId(call.callSessionId)}
                                    >
                                      <Eye className="h-3.5 w-3.5" />
                                    </Button>
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      onClick={() => {
                                        setOverrideDialog({
                                          callSessionId: call.callSessionId,
                                          currentDisp: call.currentDisposition,
                                        });
                                        setOverrideDisposition(call.suggestedDisposition);
                                      }}
                                    >
                                      <ArrowUpDown className="h-3.5 w-3.5" />
                                    </Button>
                                  </div>
                                </TableCell>
                              </TableRow>
                            );
                          })}
                      </TableBody>
                    </Table>
                  </ScrollArea>
                </CardContent>
              </Card>
            </>
          )}
        </TabsContent>

        {/* ==================== CONTACTS TAB (drill-down by disposition) ==================== */}
        <TabsContent value="contacts" className="space-y-6">
          {!contactsDisposition ? (
            <Card>
              <CardContent className="py-10 text-center text-muted-foreground">
                <Users className="h-10 w-10 mx-auto mb-3 opacity-40" />
                <p>Click a disposition count in the Overview tab to view filtered contacts.</p>
              </CardContent>
            </Card>
          ) : (
            <>
              {/* Header with disposition context */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <Button variant="ghost" size="sm" onClick={() => { setContactsDisposition(''); setActiveTab('overview'); }}>
                    <ChevronLeft className="h-4 w-4 mr-1" /> Back
                  </Button>
                  <DispositionBadge disposition={contactsDisposition} />
                  <span className="text-sm text-muted-foreground">
                    {contactsByDisp?.total?.toLocaleString() || '...'} contacts
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <Input
                    placeholder="Search contacts..."
                    value={contactsSearch}
                    onChange={(e) => { setContactsSearch(e.target.value); setContactsPage(0); }}
                    className="w-64"
                  />
                  <Button variant="outline" size="sm" onClick={() => refetchContacts()} disabled={contactsLoading}>
                    <RefreshCw className={`h-4 w-4 ${contactsLoading ? 'animate-spin' : ''}`} />
                  </Button>
                </div>
              </div>

              {/* Bulk actions bar for contacts */}
              {selectedContactIds.size > 0 && (
                <Card className="border-primary/30 bg-primary/5">
                  <CardContent className="flex items-center gap-3 py-3 flex-wrap">
                    <span className="text-sm font-medium">{selectedContactIds.size} selected</span>
                    <Separator orientation="vertical" className="h-6" />
                    <Button size="sm" variant="outline" onClick={() => pushToQAMutation.mutate(Array.from(selectedContactIds))} disabled={pushToQAMutation.isPending}>
                      {pushToQAMutation.isPending ? <Loader2 className="mr-1 h-3 w-3 animate-spin" /> : <Shield className="mr-1 h-3 w-3" />}
                      Push to QA
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => setPushClientDialog(true)}>
                      <Send className="mr-1 h-3 w-3" /> Push to Client
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => setPushDashboardDialog(true)}>
                      <BarChart3 className="mr-1 h-3 w-3" /> Push to Dashboard
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => setSelectedContactIds(new Set())}>Clear</Button>
                  </CardContent>
                </Card>
              )}

              {/* Contacts table */}
              <Card>
                <CardContent className="pt-4">
                  {contactsLoading ? (
                    <div className="flex items-center justify-center py-10">
                      <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                      <span className="ml-2 text-sm text-muted-foreground">Loading contacts...</span>
                    </div>
                  ) : !contactsByDisp?.contacts?.length ? (
                    <div className="text-center py-10 text-muted-foreground">
                      <p>No contacts found for this disposition.</p>
                    </div>
                  ) : (
                    <>
                      <ScrollArea className="h-[600px]">
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead className="w-10">
                                <Checkbox
                                  checked={contactsByDisp.contacts.length > 0 && selectedContactIds.size === contactsByDisp.contacts.length}
                                  onCheckedChange={(checked) => {
                                    if (checked) {
                                      setSelectedContactIds(new Set(contactsByDisp.contacts.map(c => c.callSessionId)));
                                    } else {
                                      setSelectedContactIds(new Set());
                                    }
                                  }}
                                />
                              </TableHead>
                              <TableHead>Contact</TableHead>
                              <TableHead>Company</TableHead>
                              <TableHead>Campaign</TableHead>
                              <TableHead>Duration</TableHead>
                              <TableHead>Date</TableHead>
                              <TableHead>
                                <div className="flex items-center gap-1">
                                  <Mic className="h-3 w-3" /> Rec
                                </div>
                              </TableHead>
                              <TableHead>
                                <div className="flex items-center gap-1">
                                  <FileText className="h-3 w-3" /> Trans
                                </div>
                              </TableHead>
                              <TableHead>History</TableHead>
                              <TableHead>Lead</TableHead>
                              <TableHead>Actions</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {contactsByDisp.contacts.map((contact) => (
                              <TableRow key={contact.callSessionId} className="hover:bg-muted/50">
                                <TableCell>
                                  <Checkbox
                                    checked={selectedContactIds.has(contact.callSessionId)}
                                    onCheckedChange={() => toggleContactSelection(contact.callSessionId)}
                                  />
                                </TableCell>
                                <TableCell>
                                  <div>
                                    <p className="font-medium text-sm">{contact.contactName}</p>
                                    {contact.contactEmail && (
                                      <p className="text-xs text-muted-foreground">{contact.contactEmail}</p>
                                    )}
                                    <p className="text-xs text-muted-foreground font-mono">{contact.contactPhone}</p>
                                  </div>
                                </TableCell>
                                <TableCell>
                                  <div>
                                    <p className="text-sm">{contact.companyName}</p>
                                    {contact.jobTitle && <p className="text-xs text-muted-foreground">{contact.jobTitle}</p>}
                                  </div>
                                </TableCell>
                                <TableCell className="text-sm">{contact.campaignName}</TableCell>
                                <TableCell className="text-sm">{formatDuration(contact.durationSec)}</TableCell>
                                <TableCell className="text-xs text-muted-foreground">{formatDate(contact.callDate)}</TableCell>
                                <TableCell>
                                  {contact.recordingUrl ? (
                                    <Badge variant="outline" className="bg-emerald-50 text-emerald-700 text-xs">Yes</Badge>
                                  ) : (
                                    <Badge variant="outline" className="text-xs">No</Badge>
                                  )}
                                </TableCell>
                                <TableCell>
                                  {contact.parsedTranscript?.length > 0 ? (
                                    <Badge variant="outline" className="bg-blue-50 text-blue-700 text-xs">
                                      {contact.parsedTranscript.length} turns
                                    </Badge>
                                  ) : (
                                    <Badge variant="outline" className="text-xs">No</Badge>
                                  )}
                                </TableCell>
                                <TableCell>
                                  <Badge variant="outline" className="text-xs">
                                    {contact.interactionHistory?.length || 0} calls
                                  </Badge>
                                </TableCell>
                                <TableCell>
                                  {contact.hasLead ? (
                                    <Badge variant="outline" className="bg-emerald-50 text-emerald-700 text-xs">
                                      <CheckCircle2 className="h-3 w-3 mr-0.5" /> Yes
                                    </Badge>
                                  ) : (
                                    <span className="text-xs text-muted-foreground">--</span>
                                  )}
                                </TableCell>
                                <TableCell>
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={() => { setSelectedContactDetail(contact); setContactDetailTab('transcript'); }}
                                  >
                                    <Eye className="h-3.5 w-3.5 mr-1" /> View
                                  </Button>
                                </TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      </ScrollArea>

                      {/* Pagination */}
                      {contactsByDisp.total > 50 && (
                        <div className="flex items-center justify-between mt-4">
                          <p className="text-sm text-muted-foreground">
                            Showing {contactsPage * 50 + 1}-{Math.min((contactsPage + 1) * 50, contactsByDisp.total)} of {contactsByDisp.total}
                          </p>
                          <div className="flex gap-2">
                            <Button
                              variant="outline"
                              size="sm"
                              disabled={contactsPage === 0}
                              onClick={() => setContactsPage(p => p - 1)}
                            >
                              <ChevronLeft className="h-4 w-4" /> Previous
                            </Button>
                            <Button
                              variant="outline"
                              size="sm"
                              disabled={(contactsPage + 1) * 50 >= contactsByDisp.total}
                              onClick={() => setContactsPage(p => p + 1)}
                            >
                              Next <ChevronRight className="h-4 w-4" />
                            </Button>
                          </div>
                        </div>
                      )}
                    </>
                  )}
                </CardContent>
              </Card>
            </>
          )}
        </TabsContent>
      </Tabs>

      {/* ==================== CALL DETAIL DIALOG ==================== */}
      <Dialog open={!!detailCallId} onOpenChange={(open) => !open && setDetailCallId(null)}>
        <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Call Analysis Detail</DialogTitle>
            <DialogDescription>
              Full transcript analysis and disposition recommendation
            </DialogDescription>
          </DialogHeader>

          {detailLoading ? (
            <div className="flex items-center justify-center py-10">
              <Loader2 className="h-6 w-6 animate-spin" />
            </div>
          ) : activeCallDetail ? (
            <div className="space-y-4">
              {/* Contact info */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label className="text-xs text-muted-foreground">Contact</Label>
                  <p className="font-medium">{activeCallDetail.contactName}</p>
                  <p className="text-sm text-muted-foreground">{activeCallDetail.companyName}</p>
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground">Campaign</Label>
                  <p className="font-medium">{activeCallDetail.campaignName}</p>
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground">Phone</Label>
                  <p className="font-mono text-sm">{activeCallDetail.contactPhone}</p>
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground">Duration / Date</Label>
                  <p className="text-sm">{formatDuration(activeCallDetail.durationSec)} · {formatDate(activeCallDetail.callDate)}</p>
                </div>
              </div>

              <Separator />

              {/* Disposition comparison */}
              <div className="flex items-center gap-4">
                <div>
                  <Label className="text-xs text-muted-foreground">Current</Label>
                  <div className="mt-1"><DispositionBadge disposition={activeCallDetail.currentDisposition} /></div>
                </div>
                <ArrowRight className="h-5 w-5 text-muted-foreground mt-4" />
                <div>
                  <Label className="text-xs text-muted-foreground">Suggested</Label>
                  <div className="mt-1 flex items-center gap-2">
                    <DispositionBadge disposition={activeCallDetail.suggestedDisposition} />
                    <ConfidenceBadge confidence={activeCallDetail.confidence} />
                  </div>
                </div>
                {activeCallDetail.shouldOverride && (
                  <Badge variant="outline" className="bg-amber-100 text-amber-800 mt-4">
                    Override Recommended
                  </Badge>
                )}
              </div>

              {/* Reasoning */}
              <div>
                <Label className="text-xs text-muted-foreground">AI Reasoning</Label>
                <p className="text-sm mt-1 bg-muted rounded-md p-3">{activeCallDetail.reasoning}</p>
              </div>

              {/* Signals */}
              <div className="grid grid-cols-2 gap-4">
                {activeCallDetail.positiveSignals.length > 0 && (
                  <div>
                    <Label className="text-xs text-emerald-600">Positive Signals</Label>
                    <div className="flex flex-wrap gap-1 mt-1">
                      {activeCallDetail.positiveSignals.map((s, i) => (
                        <Badge key={i} variant="outline" className="bg-emerald-50 text-emerald-700 text-xs">{s}</Badge>
                      ))}
                    </div>
                  </div>
                )}
                {activeCallDetail.negativeSignals.length > 0 && (
                  <div>
                    <Label className="text-xs text-red-600">Negative Signals</Label>
                    <div className="flex flex-wrap gap-1 mt-1">
                      {activeCallDetail.negativeSignals.map((s, i) => (
                        <Badge key={i} variant="outline" className="bg-red-50 text-red-700 text-xs">{s}</Badge>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* Recording */}
              {activeCallDetail.recordingUrl && (
                <div>
                  <Label className="text-xs text-muted-foreground">Recording</Label>
                  <audio controls className="w-full mt-1" src={activeCallDetail.recordingUrl} />
                </div>
              )}

              {/* Transcript */}
              {activeCallDetail.fullTranscript && (
                <div>
                  <Label className="text-xs text-muted-foreground">Transcript</Label>
                  <ScrollArea className="h-[250px] mt-1 border rounded-md p-3 bg-muted/30">
                    <TranscriptView transcript={activeCallDetail.fullTranscript} />
                  </ScrollArea>
                </div>
              )}

              {/* Lead info */}
              <div className="flex items-center gap-4 text-sm">
                {activeCallDetail.hasLead ? (
                  <Badge variant="outline" className="bg-emerald-50 text-emerald-700">
                    <CheckCircle2 className="h-3 w-3 mr-1" /> Lead exists: {activeCallDetail.leadId}
                  </Badge>
                ) : (
                  <Badge variant="outline" className="bg-slate-50 text-slate-600">
                    No lead created
                  </Badge>
                )}
              </div>
            </div>
          ) : (
            <p className="text-center text-muted-foreground py-6">Call not found</p>
          )}

          <DialogFooter>
            {activeCallDetail && (
              <Button
                onClick={() => {
                  setDetailCallId(null);
                  setOverrideDialog({
                    callSessionId: activeCallDetail.callSessionId,
                    currentDisp: activeCallDetail.currentDisposition,
                  });
                  setOverrideDisposition(activeCallDetail.suggestedDisposition);
                }}
              >
                Override Disposition
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ==================== OVERRIDE DIALOG ==================== */}
      <Dialog open={!!overrideDialog} onOpenChange={(open) => !open && setOverrideDialog(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Override Disposition</DialogTitle>
            <DialogDescription>
              Change the disposition for this call. This will update the call session, route leads, and log the change.
            </DialogDescription>
          </DialogHeader>

          {overrideDialog && (
            <div className="space-y-4">
              <div>
                <Label className="text-xs text-muted-foreground">Current Disposition</Label>
                <div className="mt-1"><DispositionBadge disposition={overrideDialog.currentDisp} /></div>
              </div>

              <div className="space-y-2">
                <Label>New Disposition</Label>
                <Select value={overrideDisposition} onValueChange={setOverrideDisposition}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select disposition..." />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(DISPOSITION_LABELS).filter(([k]) => k !== 'unknown').map(([key, label]) => (
                      <SelectItem key={key} value={key}>{label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Reason (optional)</Label>
                <Textarea
                  placeholder="Why are you overriding this disposition?"
                  value={overrideReason}
                  onChange={(e) => setOverrideReason(e.target.value)}
                />
              </div>
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setOverrideDialog(null)}>Cancel</Button>
            <Button
              disabled={!overrideDisposition || overrideMutation.isPending}
              onClick={() => {
                if (overrideDialog) {
                  overrideMutation.mutate({
                    callSessionId: overrideDialog.callSessionId,
                    newDisposition: overrideDisposition,
                    reason: overrideReason,
                  });
                }
              }}
            >
              {overrideMutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Apply Override
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ==================== TRANSCRIPT VIEWER ====================

function TranscriptView({ transcript }: { transcript: any }) {
  let entries: Array<{ role: string; text: string }> = [];

  try {
    const parsed = typeof transcript === 'string' ? JSON.parse(transcript) : transcript;
    if (Array.isArray(parsed)) {
      entries = parsed.map((t: any) => ({
        role: t.role || 'unknown',
        text: t.message || t.text || '',
      }));
    }
  } catch {
    // Plain text transcript
    return <pre className="text-xs whitespace-pre-wrap font-mono">{String(transcript)}</pre>;
  }

  if (entries.length === 0) {
    return <p className="text-sm text-muted-foreground italic">No transcript available</p>;
  }

  return (
    <div className="space-y-2">
      {entries.map((entry, i) => (
        <div
          key={i}
          className={`text-xs leading-relaxed ${
            entry.role === 'assistant' || entry.role === 'agent'
              ? 'pl-0'
              : 'pl-4 border-l-2 border-blue-200'
          }`}
        >
          <span className={`font-semibold ${
            entry.role === 'assistant' || entry.role === 'agent'
              ? 'text-emerald-700'
              : 'text-blue-700'
          }`}>
            {entry.role === 'assistant' || entry.role === 'agent' ? 'Agent' : 'Contact'}:
          </span>{' '}
          <span className="text-slate-700">{entry.text}</span>
        </div>
      ))}
    </div>
  );
}
