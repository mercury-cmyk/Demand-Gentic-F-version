/**
 * Disposition Reanalysis Page (Deep AI Analysis)
 *
 * Comprehensive admin page for AI-powered call disposition reanalysis with:
 *   - Deep transcript analysis against campaign goals
 *   - Agent behavior scoring (engagement, empathy, closing, objection handling)
 *   - Call quality assessment vs campaign QA parameters
 *   - Misclassification detection with confidence scoring
 *   - Clickable disposition counts ? drill into filtered contacts
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
  SlidersHorizontal,
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
  keyMoments: Array;
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
  hasMore?: boolean;
  nextCursor?: string | null;
  snapshotBefore?: string;
  stagedFastPathCount?: number;
  deepCacheHits?: number;
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
  parsedTranscript: Array;
  transcriptSummary: string;
  callDate: string;
  hasLead: boolean;
  leadId: string | null;
  qaStatus: string | null;
  interactionHistory: Array;
  aiAnalysis: any;
  dispositionDetails: {
    assignedDisposition: string | null;
    expectedDisposition: string | null;
    dispositionAccurate: boolean | null;
    dispositionNotes: any;
    overallQualityScore: number | null;
    sentiment: string | null;
  } | null;
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

interface ClientSampleValidation {
  callSessionId: string;
  contactName: string;
  companyName: string;
  campaignName: string;
  durationSec: number;
  turnCount: number;
  recordingUrl: string | null;
  passed: boolean;
  issues: string[];
}

interface ClientSampleValidationResponse {
  validations: ClientSampleValidation[];
  passedCount: number;
  failedCount: number;
}

const DISPOSITION_LABELS: Record = {
  potential_issues: 'Potential Issues',
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

const DISPOSITION_COLORS: Record = {
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
    
      {label}
    
  );
}

function ConfidenceBadge({ confidence }: { confidence: number }) {
  const pct = Math.round(confidence * 100);
  const color =
    pct >= 80 ? 'bg-emerald-100 text-emerald-800' :
    pct >= 60 ? 'bg-amber-100 text-amber-800' :
    'bg-red-100 text-red-800';
  return {pct}%;
}

function ScoreBar({ label, score, color = 'bg-primary' }: { label: string; score: number; color?: string }) {
  const barColor = score >= 70 ? 'bg-emerald-500' : score >= 40 ? 'bg-amber-500' : 'bg-red-500';
  return (
    
      
        {label}
        {score}/100
      
      
        
      
    
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

interface DispositionReanalysisPageProps {
  campaigns?: Array;
}

export default function DispositionReanalysisPage({ campaigns: externalCampaigns }: DispositionReanalysisPageProps = {}) {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Filters
  const [campaignId, setCampaignId] = useState('');
  const [dispositionFilter, setDispositionFilter] = useState([]);
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [minDuration, setMinDuration] = useState('');
  const [maxDuration, setMaxDuration] = useState('');
  const [batchLimit, setBatchLimit] = useState('100');
  const [agentTypeFilter, setAgentTypeFilter] = useState('all');
  const [confidenceThreshold, setConfidenceThreshold] = useState('');
  const [minTurns, setMinTurns] = useState('');
  const [maxTurns, setMaxTurns] = useState('');

  // State
  const [activeTab, setActiveTab] = useState('overview');
  const [previewResult, setPreviewResult] = useState(null);
  const [selectedCalls, setSelectedCalls] = useState>(new Set());
  const [detailCallId, setDetailCallId] = useState(null);
  const [detailCall, setDetailCall] = useState(null);
  const [overrideDialog, setOverrideDialog] = useState(null);
  const [overrideDisposition, setOverrideDisposition] = useState('');
  const [overrideReason, setOverrideReason] = useState('');
  const [pushClientDialog, setPushClientDialog] = useState(false);
  const [clientNotes, setClientNotes] = useState('');
  const [resultsFilter, setResultsFilter] = useState('all');

  // Contacts-by-disposition state
  const [contactsDisposition, setContactsDisposition] = useState('');
  const [contactsPage, setContactsPage] = useState(0);
  const [contactsSearch, setContactsSearch] = useState('');
  const [contactsTranscriptText, setContactsTranscriptText] = useState('');
  const [selectedContactDetail, setSelectedContactDetail] = useState(null);
  const [contactDetailTab, setContactDetailTab] = useState('transcript');
  const [pushDashboardNotes, setPushDashboardNotes] = useState('');
  const [pushDashboardDialog, setPushDashboardDialog] = useState(false);
  const [selectedContactIds, setSelectedContactIds] = useState>(new Set());

  // Contacts tab filters
  const [contactsMinDuration, setContactsMinDuration] = useState('');
  const [contactsMaxDuration, setContactsMaxDuration] = useState('');
  const [contactsMinTurns, setContactsMinTurns] = useState('');
  const [contactsMaxTurns, setContactsMaxTurns] = useState('');
  const [contactsDateFrom, setContactsDateFrom] = useState('');
  const [contactsDateTo, setContactsDateTo] = useState('');
  const [contactsAccuracy, setContactsAccuracy] = useState('all');
  const [contactsExpectedDisposition, setContactsExpectedDisposition] = useState('');
  const [contactsCurrentDisposition, setContactsCurrentDisposition] = useState('');
  const [contactsFiltersExpanded, setContactsFiltersExpanded] = useState(false);

  // Client sample validation state
  const [sampleValidationResult, setSampleValidationResult] = useState(null);
  const [sampleValidationDialog, setSampleValidationDialog] = useState(false);
  const [sampleClientNotes, setSampleClientNotes] = useState('');

  // Auto-batch progress state
  const [batchProgress, setBatchProgress] = useState(null);

  // ==================== QUERIES ====================

  // Skip fetch when parent provides campaigns
  const { data: campaignsData } = useQuery({
    queryKey: ['/api/campaigns'],
    queryFn: async () => {
      const res = await apiRequest('GET', '/api/campaigns');
      const data = await res.json();
      return Array.isArray(data) ? data : data?.campaigns || [];
    },
    enabled: !externalCampaigns,
  });
  const campaigns = externalCampaigns || campaignsData || [];

  const { data: stats, isLoading: statsLoading, refetch: refetchStats } = useQuery({
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
  const { data: contactsByDisp, isLoading: contactsLoading, refetch: refetchContacts } = useQuery({
    queryKey: ['/api/disposition-reanalysis/contacts-by-disposition', contactsDisposition, campaignId, contactsDateFrom, contactsDateTo, contactsMinDuration, contactsMaxDuration, contactsMinTurns, contactsMaxTurns, contactsTranscriptText, contactsAccuracy, contactsExpectedDisposition, contactsCurrentDisposition, contactsPage, contactsSearch],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (campaignId) params.set('campaignId', campaignId);
      if (contactsDateFrom) params.set('dateFrom', contactsDateFrom);
      if (contactsDateTo) params.set('dateTo', contactsDateTo);
      if (contactsMinDuration) params.set('minDurationSec', contactsMinDuration);
      if (contactsMaxDuration) params.set('maxDurationSec', contactsMaxDuration);
      if (contactsMinTurns) params.set('minTurns', contactsMinTurns);
      if (contactsMaxTurns) params.set('maxTurns', contactsMaxTurns);
      if (contactsTranscriptText) params.set('transcriptText', contactsTranscriptText);
      if (contactsAccuracy !== 'all') params.set('accuracy', contactsAccuracy);
      if (contactsExpectedDisposition) params.set('expectedDisposition', contactsExpectedDisposition);
      if (contactsCurrentDisposition) params.set('currentDisposition', contactsCurrentDisposition);
      params.set('limit', '50');
      params.set('offset', String(contactsPage * 50));
      if (contactsSearch) params.set('search', contactsSearch);
      const res = await apiRequest('GET', `/api/disposition-reanalysis/contacts-by-disposition/${contactsDisposition}?${params}`);
      return res.json();
    },
    enabled: !!contactsDisposition && activeTab === 'contacts',
  });

  // Deep single call analysis
  const { data: deepCallDetail, isLoading: detailLoading } = useQuery({
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

  // Build filter body from current state
  const buildFilterBody = useCallback((limit: number, offset: number, cursor?: string | null, snapshotBefore?: string) => {
    const body: any = {
      hasTranscript: true,
      limit,
      offset,
      agentType: agentTypeFilter,
      skipDeepForObvious: true,
    };
    if (cursor) body.cursor = cursor;
    if (snapshotBefore) body.snapshotBefore = snapshotBefore;
    if (campaignId) body.campaignId = campaignId;
    if (dispositionFilter.length > 0) body.dispositions = dispositionFilter;
    if (dateFrom) body.dateFrom = dateFrom;
    if (dateTo) body.dateTo = dateTo;
    if (minDuration) body.minDurationSec = parseInt(minDuration);
    if (maxDuration) body.maxDurationSec = parseInt(maxDuration);
    if (confidenceThreshold) body.confidenceThreshold = parseFloat(confidenceThreshold) / 100;
    if (minTurns) body.minTurns = parseInt(minTurns);
    if (maxTurns) body.maxTurns = parseInt(maxTurns);
    return body;
  }, [campaignId, dispositionFilter, dateFrom, dateTo, minDuration, maxDuration, confidenceThreshold, minTurns, maxTurns, agentTypeFilter]);

  // Merge two DeepReanalysisSummary objects
  const mergeSummaries = useCallback((a: DeepReanalysisSummary, b: DeepReanalysisSummary): DeepReanalysisSummary => {
    const totalAnalyzed = a.totalAnalyzed + b.totalAnalyzed;
    return {
      totalAnalyzed,
      totalShouldChange: a.totalShouldChange + b.totalShouldChange,
      totalChanged: a.totalChanged + b.totalChanged,
      totalErrors: a.totalErrors + b.totalErrors,
      dryRun: a.dryRun,
      avgConfidence: totalAnalyzed > 0 ? (a.avgConfidence * a.totalAnalyzed + b.avgConfidence * b.totalAnalyzed) / totalAnalyzed : 0,
      avgAgentScore: totalAnalyzed > 0 ? (a.avgAgentScore * a.totalAnalyzed + b.avgAgentScore * b.totalAnalyzed) / totalAnalyzed : 0,
      avgCallQuality: totalAnalyzed > 0 ? (a.avgCallQuality * a.totalAnalyzed + b.avgCallQuality * b.totalAnalyzed) / totalAnalyzed : 0,
      breakdown: [...a.breakdown, ...b.breakdown],
      agentBehaviorSummary: b.agentBehaviorSummary, // Use latest
      callQualitySummary: b.callQualitySummary,
      calls: [...a.calls, ...b.calls],
      actionsSummary: {
        newLeadsCreated: a.actionsSummary.newLeadsCreated + b.actionsSummary.newLeadsCreated,
        leadsRemovedFromCampaign: a.actionsSummary.leadsRemovedFromCampaign + b.actionsSummary.leadsRemovedFromCampaign,
        movedToQA: a.actionsSummary.movedToQA + b.actionsSummary.movedToQA,
        movedToNeedsReview: a.actionsSummary.movedToNeedsReview + b.actionsSummary.movedToNeedsReview,
        retriesScheduled: a.actionsSummary.retriesScheduled + b.actionsSummary.retriesScheduled,
        pushedToClient: a.actionsSummary.pushedToClient + b.actionsSummary.pushedToClient,
      },
      hasMore: b.hasMore,
      nextCursor: b.nextCursor,
      snapshotBefore: a.snapshotBefore || b.snapshotBefore,
      stagedFastPathCount: (a.stagedFastPathCount || 0) + (b.stagedFastPathCount || 0),
      deepCacheHits: (a.deepCacheHits || 0) + (b.deepCacheHits || 0),
    };
  }, []);

  const runBatchedDeepSweep = useCallback(async (
    endpoint: '/api/disposition-reanalysis/deep/preview' | '/api/disposition-reanalysis/deep/apply',
    phaseLabel: string,
    round: number,
  ): Promise => {
    const chunkSize = parseInt(batchLimit) || 100;
    let offset = 0;
    let cursor: string | null = null;
    let snapshotBefore: string | undefined;
    let merged: DeepReanalysisSummary | null = null;

    while (true) {
      setBatchProgress({ current: offset, total: offset + chunkSize, phase: `${phaseLabel} (Round ${round})` });
      const body = buildFilterBody(chunkSize, offset, cursor, snapshotBefore);
      const res = await apiRequest('POST', endpoint, body, { timeout: 600000 });
      const batch = await res.json() as DeepReanalysisSummary;

      if (!snapshotBefore && batch.snapshotBefore) {
        snapshotBefore = batch.snapshotBefore;
      }

      merged = merged ? mergeSummaries(merged, batch) : batch;
      setBatchProgress({ current: merged.totalAnalyzed, total: merged.totalAnalyzed, phase: `${phaseLabel} (Round ${round})` });

      if (!batch.hasMore || !batch.nextCursor) break;
      cursor = batch.nextCursor;
      offset += chunkSize;
    }

    return merged!;
  }, [batchLimit, buildFilterBody, mergeSummaries]);

  // Deep Preview (dry-run) — auto-batches through all matching calls
  const previewMutation = useMutation({
    mutationFn: async () => {
      const merged = await runBatchedDeepSweep('/api/disposition-reanalysis/deep/preview', 'Previewing', 1);

      setBatchProgress(null);
      return merged;
    },
    onSuccess: (data) => {
      setPreviewResult(data);
      setActiveTab('results');
      toast({ title: 'Deep Analysis Complete', description: `Analyzed ${data.totalAnalyzed} calls across all batches. ${data.totalShouldChange} misclassifications found. Avg agent score: ${Math.round(data.avgAgentScore)}/100` });
    },
    onError: (err: any) => {
      setBatchProgress(null);
      toast({ title: 'Analysis Failed', description: err.message, variant: 'destructive' });
    },
  });

  // Deep Apply — auto-batches through all matching calls
  const applyMutation = useMutation({
    mutationFn: async (): Promise => {
      const maxRounds = 6;
      let roundsRun = 0;
      let remainingIssues = 0;
      let stoppedReason = 'clean';
      let lastApply: DeepReanalysisSummary | null = null;

      const cumulativeActions = {
        newLeadsCreated: 0,
        leadsRemovedFromCampaign: 0,
        movedToQA: 0,
        movedToNeedsReview: 0,
        retriesScheduled: 0,
        pushedToClient: 0,
      };
      let cumulativeChanged = 0;
      let cumulativeErrors = 0;

      for (let round = 1; round  {
      setPreviewResult(data.summary);
      queryClient.invalidateQueries({ queryKey: ['/api/disposition-reanalysis/stats'] });
      toast({
        title: data.remainingIssues === 0 ? 'All Problematic Dispositions Processed' : 'Apply Completed With Remaining Issues',
        description: `Rounds: ${data.roundsRun}. Updated: ${data.summary.totalChanged}. Remaining actionable issues: ${data.remainingIssues}. Stop reason: ${data.stoppedReason}.`,
      });
    },
    onError: (err: any) => {
      setBatchProgress(null);
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

  // Validate calls for client samples
  const validateForClientMutation = useMutation({
    mutationFn: async (ids?: string[]) => {
      const callIds = ids || Array.from(selectedCalls.size > 0 ? selectedCalls : selectedContactIds);
      const res = await apiRequest('POST', '/api/disposition-reanalysis/deep/validate-for-client', {
        callSessionIds: callIds,
      });
      return res.json() as Promise;
    },
    onSuccess: (data) => {
      setSampleValidationResult(data);
      setSampleValidationDialog(true);
    },
    onError: (err: any) => {
      toast({ title: 'Validation Failed', description: err.message, variant: 'destructive' });
    },
  });

  // Push validated samples to client
  const pushSamplesToClientMutation = useMutation({
    mutationFn: async () => {
      if (!sampleValidationResult) throw new Error('No validation result');
      const passingIds = sampleValidationResult.validations.filter(v => v.passed).map(v => v.callSessionId);
      if (passingIds.length === 0) throw new Error('No calls passed validation');
      const res = await apiRequest('POST', '/api/disposition-reanalysis/deep/push-to-client', {
        callSessionIds: passingIds,
        clientNotes: sampleClientNotes,
        samplePush: true,
      });
      return res.json();
    },
    onSuccess: (data) => {
      setSampleValidationDialog(false);
      setSampleValidationResult(null);
      setSampleClientNotes('');
      toast({ title: 'Samples Pushed to Client', description: `${data.succeeded} validated recordings pushed to client portal` });
      setSelectedCalls(new Set());
      setSelectedContactIds(new Set());
      queryClient.invalidateQueries({ queryKey: ['/api/disposition-reanalysis/contacts-by-disposition'] });
    },
    onError: (err: any) => {
      toast({ title: 'Push Samples Failed', description: err.message, variant: 'destructive' });
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

  // Click a disposition count ? navigate to contacts tab filtered
  const handleDispositionCountClick = useCallback((disposition: string) => {
    setContactsDisposition(disposition);
    setContactsPage(0);
    setContactsSearch('');
    setContactsTranscriptText('');
    setSelectedContactIds(new Set());
    setContactsMinDuration('');
    setContactsMaxDuration('');
    setContactsMinTurns('');
    setContactsMaxTurns('');
    // Keep Contacts drill-down aligned with Overview/Stats context.
    // This prevents confusing mismatches where a stats count is non-zero
    // but contacts tab appears empty due to a different date window.
    setContactsDateFrom(dateFrom || '');
    setContactsDateTo(dateTo || '');
    setContactsFiltersExpanded(false);
    setActiveTab('contacts');
  }, [dateFrom, dateTo]);

  const activeContactsFilterCount = useMemo(() => {
    let count = 0;
    if (contactsMinDuration) count++;
    if (contactsMaxDuration) count++;
    if (contactsMinTurns) count++;
    if (contactsMaxTurns) count++;
    if (contactsDateFrom) count++;
    if (contactsDateTo) count++;
    if (contactsTranscriptText) count++;
    if (contactsAccuracy !== 'all') count++;
    if (contactsExpectedDisposition) count++;
    if (contactsCurrentDisposition) count++;
    return count;
  }, [contactsMinDuration, contactsMaxDuration, contactsMinTurns, contactsMaxTurns, contactsDateFrom, contactsDateTo, contactsTranscriptText, contactsAccuracy, contactsExpectedDisposition, contactsCurrentDisposition]);

  const activeContactsFilterSummary = useMemo(() => {
    const labels: string[] = [];
    if (contactsSearch.trim()) labels.push(`Search: "${contactsSearch.trim()}"`);
    if (contactsTranscriptText.trim()) labels.push(`Transcript contains: "${contactsTranscriptText.trim()}"`);
    if (contactsMinDuration) labels.push(`Min duration: ${contactsMinDuration}s`);
    if (contactsMaxDuration) labels.push(`Max duration: ${contactsMaxDuration}s`);
    if (contactsMinTurns) labels.push(`Min turns: ${contactsMinTurns}`);
    if (contactsMaxTurns) labels.push(`Max turns: ${contactsMaxTurns}`);
    if (contactsDateFrom) labels.push(`From: ${contactsDateFrom}`);
    if (contactsDateTo) labels.push(`To: ${contactsDateTo}`);
    if (contactsAccuracy !== 'all') labels.push(`Accuracy: ${contactsAccuracy}`);
    if (contactsExpectedDisposition) labels.push(`Expected: ${DISPOSITION_LABELS[contactsExpectedDisposition] || contactsExpectedDisposition}`);
    if (contactsCurrentDisposition) labels.push(`Current: ${DISPOSITION_LABELS[contactsCurrentDisposition] || contactsCurrentDisposition}`);
    return labels;
  }, [contactsSearch, contactsTranscriptText, contactsMinDuration, contactsMaxDuration, contactsMinTurns, contactsMaxTurns, contactsDateFrom, contactsDateTo, contactsAccuracy, contactsExpectedDisposition, contactsCurrentDisposition]);

  const clearContactsFilters = useCallback(() => {
    setContactsMinDuration('');
    setContactsMaxDuration('');
    setContactsMinTurns('');
    setContactsMaxTurns('');
    setContactsDateFrom('');
    setContactsDateTo('');
    setContactsTranscriptText('');
    setContactsAccuracy('all');
    setContactsExpectedDisposition('');
    setContactsCurrentDisposition('');
    setContactsPage(0);
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
    
      {/* Header */}
      
        
          Disposition Reanalysis
          
            Analyze call recordings & transcripts to detect misclassified dispositions and re-route leads
          
        
         refetchStats()} disabled={statsLoading}>
          
          Refresh
        
      

      
        
          
             Overview
          
          
             Analyze & Preview
          
          
            
            Results
            {previewResult && (
              
                {previewResult.totalShouldChange}
              
            )}
          
          
            
            Contacts
            {contactsDisposition && (
              
                {DISPOSITION_LABELS[contactsDisposition] || contactsDisposition}
              
            )}
          
        

        {/* ==================== OVERVIEW TAB ==================== */}
        
          {/* Alert banner */}
          {stats && stats.potentialMisclassifications > 0 && (
            
              
                
                
                  
                    {stats.potentialMisclassifications} potential misclassifications detected
                  
                  
                    Long "not interested" calls, "no answer" calls with transcripts, or extended "voicemail" sessions.
                    Use the Analyze tab to review and correct.
                  
                
                 setActiveTab('analyze')}
                >
                  Review Now
                
              
            
          )}

          {/* Stats cards */}
          
            
              
                
                  
                  Total Calls
                
                {stats?.total?.toLocaleString() || '�'}
              
            
            
              
                
                  
                  Potential Issues
                
                
                   handleDispositionCountClick('potential_issues')}
                    className="text-2xl font-bold text-amber-600 hover:underline cursor-pointer"
                    title="View exact contacts included in Potential Issues"
                  >
                    {stats?.potentialMisclassifications?.toLocaleString() || '0'}
                  
                
              
            
            
              
                
                  
                  Qualified Leads
                
                
                  {stats?.distribution?.find(d => d.disposition === 'qualified_lead')?.count?.toLocaleString() || '0'}
                
              
            
            
              
                
                  
                  Not Interested
                
                
                  {stats?.distribution?.find(d => d.disposition === 'not_interested')?.count?.toLocaleString() || '0'}
                
              
            
          

          {/* Distribution table */}
          
            
              Disposition Distribution
              Breakdown of all call dispositions with transcript and recording availability
            
            
              {statsLoading ? (
                
                  
                
              ) : (
                
                  
                    
                      Disposition
                      Count
                      %
                      Avg Duration
                      With Transcript
                      With Recording
                      Action
                    
                  
                  
                    {stats?.distribution?.map((d) => (
                      
                        
                        
                           handleDispositionCountClick(d.disposition)}
                            className="font-bold text-primary hover:underline cursor-pointer"
                            title={`View all ${d.count} ${DISPOSITION_LABELS[d.disposition] || d.disposition} contacts`}
                          >
                            {d.count.toLocaleString()}
                          
                        
                        {d.percentage}%
                        {formatDuration(d.avgDurationSec)}
                        {d.withTranscript.toLocaleString()}
                        {d.withRecording.toLocaleString()}
                        
                           {
                              setDispositionFilter([d.disposition]);
                              setActiveTab('analyze');
                            }}
                          >
                             Analyze
                          
                        
                      
                    ))}
                  
                
              )}
            
          
        

        {/* ==================== ANALYZE TAB ==================== */}
        
          
            
              Reanalysis Filters
              
                Configure which calls to analyze. Preview first (dry-run), then apply changes.
              
            
            
              
                {/* Campaign */}
                
                  Campaign
                   setCampaignId(v === "all" ? "" : v)}>
                    
                      
                    
                    
                      All campaigns
                      {campaigns.map((c) => (
                        {c.name}
                      ))}
                    
                  
                

                {/* Date range */}
                
                  Date From
                   setDateFrom(e.target.value)} />
                
                
                  Date To
                   setDateTo(e.target.value)} />
                
              

              
                {/* Duration range */}
                
                  Min Duration (sec)
                   setMinDuration(e.target.value)} />
                
                
                  Max Duration (sec)
                   setMaxDuration(e.target.value)} />
                
                
                  Batch Size
                   setBatchLimit(e.target.value)} />
                
              

              
                {/* Turn number range */}
                
                  Min Turns
                   setMinTurns(e.target.value)} />
                
                
                  Max Turns
                   setMaxTurns(e.target.value)} />
                
              

              {/* Disposition filters */}
              
                Filter by Current Disposition
                
                  {Object.entries(DISPOSITION_LABELS).filter(([k]) => k !== 'unknown').map(([key, label]) => (
                     toggleDispositionFilter(key)}
                      className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
                        dispositionFilter.includes(key)
                          ? 'bg-primary text-primary-foreground border-primary'
                          : 'bg-muted text-muted-foreground hover:bg-muted/80'
                      }`}
                    >
                      {label}
                    
                  ))}
                  {dispositionFilter.length > 0 && (
                     setDispositionFilter([])}
                      className="rounded-full border px-3 py-1 text-xs font-medium text-red-600 hover:bg-red-50"
                    >
                      Clear
                    
                  )}
                
              

              

              {batchProgress && (
                
                  
                    
                    {batchProgress.phase} calls... {batchProgress.current} processed
                  
                  
                  
                    Auto-batching in chunks of {batchLimit}. This will continue until all matching calls are processed.
                  
                
              )}

              
                 previewMutation.mutate()}
                  disabled={previewMutation.isPending || applyMutation.isPending}
                >
                  {previewMutation.isPending ? (
                    
                  ) : (
                    
                  )}
                  {previewMutation.isPending ? `Previewing (${batchProgress?.current || 0} calls)...` : 'Preview All (Dry Run)'}
                
                 {
                    if (window.confirm('This will modify call dispositions and route leads across ALL matching calls. Are you sure?')) {
                      applyMutation.mutate();
                    }
                  }}
                  disabled={applyMutation.isPending || previewMutation.isPending}
                >
                  {applyMutation.isPending ? (
                    
                  ) : (
                    
                  )}
                  {applyMutation.isPending
                    ? `${batchProgress?.phase || 'Applying'} (${batchProgress?.current || 0} calls)...`
                    : 'Apply Until Stable'}
                
              
            
          
        

        {/* ==================== RESULTS TAB ==================== */}
        
          {!previewResult ? (
            
              
                
                No analysis results yet. Use the Analyze tab to run a preview.
              
            
          ) : (
            <>
              {/* Summary cards */}
              
                
                  
                    Analyzed
                    {previewResult.totalAnalyzed}
                  
                
                
                  
                    Should Change
                    {previewResult.totalShouldChange}
                  
                
                
                  
                    
                      {previewResult.dryRun ? 'Mode' : 'Changed'}
                    
                    
                      {previewResult.dryRun ? (
                        Dry Run
                      ) : (
                        {previewResult.totalChanged}
                      )}
                    
                  
                
                 0 ? 'border-red-200' : ''}>
                  
                    Errors
                     0 ? 'text-red-600' : ''}`}>
                      {previewResult.totalErrors}
                    
                  
                
                
                  
                    Selected
                    {selectedCalls.size}
                  
                
              

              {/* Breakdown */}
              {previewResult.breakdown.length > 0 && (
                
                  
                    Change Breakdown
                  
                  
                    
                      {previewResult.breakdown.map((b, i) => (
                        
                          
                          
                          
                          {b.count}
                        
                      ))}
                    
                  
                
              )}

              {/* Actions summary (when applied) */}
              {!previewResult.dryRun && (
                
                  
                    Actions Taken
                  
                  
                    
                      
                        Leads Created
                        {previewResult.actionsSummary.newLeadsCreated}
                      
                      
                        Removed
                        {previewResult.actionsSummary.leadsRemovedFromCampaign}
                      
                      
                        ? QA
                        {previewResult.actionsSummary.movedToQA}
                      
                      
                        ? Review
                        {previewResult.actionsSummary.movedToNeedsReview}
                      
                      
                        Retries
                        {previewResult.actionsSummary.retriesScheduled}
                      
                    
                  
                
              )}

              {/* Bulk actions bar */}
              {selectedCalls.size > 0 && (
                
                  
                    {selectedCalls.size} calls selected
                    
                      
                        
                      
                      
                        {Object.entries(DISPOSITION_LABELS).filter(([k]) => k !== 'unknown').map(([key, label]) => (
                          {label}
                        ))}
                      
                    
                     {
                        if (window.confirm(`Override ${selectedCalls.size} calls to "${DISPOSITION_LABELS[overrideDisposition]}"?`)) {
                          bulkOverrideMutation.mutate({
                            newDisposition: overrideDisposition,
                            reason: 'Bulk override from reanalysis page',
                          });
                        }
                      }}
                    >
                      {bulkOverrideMutation.isPending ?  : null}
                      Apply to Selected
                    
                    
                     validateForClientMutation.mutate(Array.from(selectedCalls))}
                    >
                      {validateForClientMutation.isPending ?  : }
                      Push as Client Samples
                    
                     setSelectedCalls(new Set())}>
                      Clear Selection
                    
                  
                
              )}

              {/* Calls table */}
              
                
                  
                    Analyzed Calls
                    
                      
                        Select All Changeable
                      
                    
                  
                
                
                  
                    
                      
                        
                          
                          Contact
                          Campaign
                          Current
                          Suggested
                          Confidence
                          Duration
                          Date
                          Actions
                        
                      
                      
                        {previewResult.calls
                          .filter(c => c.shouldOverride || c.suggestedDisposition !== c.currentDisposition)
                          .concat(previewResult.calls.filter(c => !c.shouldOverride && c.suggestedDisposition === c.currentDisposition))
                          .map((call) => {
                            const hasChange = call.shouldOverride && call.suggestedDisposition !== call.currentDisposition;
                            return (
                              
                                
                                  {hasChange && (
                                     toggleCallSelection(call.callSessionId)}
                                    />
                                  )}
                                
                                
                                  
                                    {call.contactName}
                                    {call.companyName}
                                  
                                
                                {call.campaignName}
                                
                                
                                  {hasChange ? (
                                    
                                      
                                      
                                    
                                  ) : (
                                    No change
                                  )}
                                
                                
                                {formatDuration(call.durationSec)}
                                {formatDate(call.callDate)}
                                
                                  
                                     setDetailCallId(call.callSessionId)}
                                    >
                                      
                                    
                                     {
                                        setOverrideDialog({
                                          callSessionId: call.callSessionId,
                                          currentDisp: call.currentDisposition,
                                        });
                                        setOverrideDisposition(call.suggestedDisposition);
                                      }}
                                    >
                                      
                                    
                                  
                                
                              
                            );
                          })}
                      
                    
                  
                
              
            
          )}
        

        {/* ==================== CONTACTS TAB (drill-down by disposition) ==================== */}
        
          {!contactsDisposition ? (
            
              
                
                Click a disposition count in the Overview tab to view filtered contacts.
              
            
          ) : (
            <>
              {/* Header with disposition context */}
              
                
                  
                     { setContactsDisposition(''); setActiveTab('overview'); }}>
                       Back
                    
                    
                    
                      {(contactsByDisp?.total ?? 0).toLocaleString()} total after filters
                    
                    {activeContactsFilterSummary.length > 0 && (
                      
                        {activeContactsFilterSummary.length} active filters
                      
                    )}
                  
                  {activeContactsFilterSummary.length > 0 && (
                    
                      Active: {activeContactsFilterSummary.slice(0, 3).join(' • ')}
                      {activeContactsFilterSummary.length > 3 ? ` • +${activeContactsFilterSummary.length - 3} more` : ''}
                    
                  )}
                
                
                   { setContactsSearch(e.target.value); setContactsPage(0); }}
                    className="w-64"
                  />
                   refetchContacts()} disabled={contactsLoading}>
                    
                  
                
              

              {/* Contacts filters - collapsible */}
              
                
                  
                     setContactsFiltersExpanded(!contactsFiltersExpanded)}
                      className="gap-2"
                    >
                      
                      Filters
                      {activeContactsFilterCount > 0 && (
                        
                          {activeContactsFilterCount}
                        
                      )}
                    
                    {activeContactsFilterCount > 0 && (
                      
                        Clear all
                      
                    )}
                  

                  {contactsFiltersExpanded && (
                    
                      
                        
                          Min Duration (sec)
                           { setContactsMinDuration(e.target.value); setContactsPage(0); }}
                            className="h-8"
                          />
                        
                        
                          Max Duration (sec)
                           { setContactsMaxDuration(e.target.value); setContactsPage(0); }}
                            className="h-8"
                          />
                        
                        
                          Transcript Text
                           { setContactsTranscriptText(e.target.value); setContactsPage(0); }}
                            className="h-8"
                          />
                        
                      

                      
                        
                          Min Transcript Turns
                           { setContactsMinTurns(e.target.value); setContactsPage(0); }}
                            className="h-8"
                          />
                        
                        
                          Max Transcript Turns
                           { setContactsMaxTurns(e.target.value); setContactsPage(0); }}
                            className="h-8"
                          />
                        
                        
                          Accuracy
                           { setContactsAccuracy(v); setContactsPage(0); }}>
                            
                              
                            
                            
                              All
                              Mismatch
                              Accurate
                            
                          
                        
                      

                      
                        
                          Expected Disposition
                           { setContactsExpectedDisposition(v === '_all' ? '' : v); setContactsPage(0); }}>
                            
                              
                            
                            
                              All
                              Qualified Lead
                              Not Interested
                              Do Not Call
                              Voicemail
                              No Answer
                              Invalid Data
                              Needs Review
                              Callback Requested
                              Unknown
                            
                          
                        
                        
                          Current Disposition
                           { setContactsCurrentDisposition(v === '_all' ? '' : v); setContactsPage(0); }}>
                            
                              
                            
                            
                              All
                              Qualified Lead
                              Not Interested
                              Do Not Call
                              Voicemail
                              No Answer
                              Invalid Data
                              Needs Review
                              Callback Requested
                              Unknown
                            
                          
                        
                        
                      

                      
                        
                          Date From
                           { setContactsDateFrom(e.target.value); setContactsPage(0); }}
                            className="h-8"
                          />
                        
                        
                          Date To
                           { setContactsDateTo(e.target.value); setContactsPage(0); }}
                            className="h-8"
                          />
                        
                        
                      
                    
                  )}
                
              

              {/* Bulk actions bar for contacts */}
              {selectedContactIds.size > 0 && (
                
                  
                    {selectedContactIds.size} selected
                    
                     pushToQAMutation.mutate(Array.from(selectedContactIds))} disabled={pushToQAMutation.isPending}>
                      {pushToQAMutation.isPending ?  : }
                      Push to QA
                    
                     setPushClientDialog(true)}>
                       Push to Client
                    
                     setPushDashboardDialog(true)}>
                       Push to Dashboard
                    
                     validateForClientMutation.mutate(Array.from(selectedContactIds))}
                    >
                      {validateForClientMutation.isPending ?  : }
                      Push as Client Samples
                    
                     setSelectedContactIds(new Set())}>Clear
                  
                
              )}

              {/* Contacts table */}
              
                
                  {contactsLoading ? (
                    
                      
                      Loading contacts...
                    
                  ) : !contactsByDisp?.contacts?.length ? (
                    
                      No contacts found for this disposition.
                    
                  ) : (
                    <>
                      
                        
                          
                            
                              
                                 0 && selectedContactIds.size === contactsByDisp.contacts.length}
                                  onCheckedChange={(checked) => {
                                    if (checked) {
                                      setSelectedContactIds(new Set(contactsByDisp.contacts.map(c => c.callSessionId)));
                                    } else {
                                      setSelectedContactIds(new Set());
                                    }
                                  }}
                                />
                              
                              Contact
                              Company
                              Campaign
                              Duration
                              Date
                              
                                
                                   Rec
                                
                              
                              
                                
                                   Trans
                                
                              
                              History
                              Lead
                              Actions
                            
                          
                          
                            {contactsByDisp.contacts.map((contact) => (
                              
                                
                                   toggleContactSelection(contact.callSessionId)}
                                  />
                                
                                
                                  
                                    {contact.contactName}
                                    {contact.contactEmail && (
                                      {contact.contactEmail}
                                    )}
                                    {contact.contactPhone}
                                  
                                
                                
                                  
                                    {contact.companyName}
                                    {contact.jobTitle && {contact.jobTitle}}
                                  
                                
                                {contact.campaignName}
                                {formatDuration(contact.durationSec)}
                                {formatDate(contact.callDate)}
                                
                                  {contact.recordingUrl ? (
                                    Yes
                                  ) : (
                                    No
                                  )}
                                
                                
                                  {contact.parsedTranscript?.length > 0 ? (
                                    
                                      {contact.parsedTranscript.length} turns
                                    
                                  ) : (
                                    No
                                  )}
                                
                                
                                  
                                    {contact.interactionHistory?.length || 0} calls
                                  
                                
                                
                                  {contact.hasLead ? (
                                    
                                       Yes
                                    
                                  ) : (
                                    --
                                  )}
                                
                                
                                   { setSelectedContactDetail(contact); setContactDetailTab('transcript'); }}
                                  >
                                     View
                                  
                                
                              
                            ))}
                          
                        
                      

                      {/* Pagination */}
                      {contactsByDisp.total > (contactsByDisp.pageSize || 50) && (
                        
                          
                            Showing {contactsPage * (contactsByDisp.pageSize || 50) + 1}-{Math.min((contactsPage + 1) * (contactsByDisp.pageSize || 50), contactsByDisp.total)} of {contactsByDisp.total}
                          
                          
                             setContactsPage(p => p - 1)}
                            >
                               Previous
                            
                            = contactsByDisp.total}
                              onClick={() => setContactsPage(p => p + 1)}
                            >
                              Next 
                            
                          
                        
                      )}
                    
                  )}
                
              
            
          )}
        
      

      {/* ==================== CALL DETAIL DIALOG ==================== */}
       !open && setDetailCallId(null)}>
        
          
            Call Analysis Detail
            
              Full transcript analysis and disposition recommendation
            
          

          {detailLoading ? (
            
              
            
          ) : activeCallDetail ? (
            
              {/* Contact info */}
              
                
                  Contact
                  {activeCallDetail.contactName}
                  {activeCallDetail.companyName}
                
                
                  Campaign
                  {activeCallDetail.campaignName}
                
                
                  Phone
                  {activeCallDetail.contactPhone}
                
                
                  Duration / Date
                  {formatDuration(activeCallDetail.durationSec)} � {formatDate(activeCallDetail.callDate)}
                
              

              

              {/* Disposition comparison */}
              
                
                  Current
                  
                
                
                
                  Suggested
                  
                    
                    
                  
                
                {activeCallDetail.shouldOverride && (
                  
                    Override Recommended
                  
                )}
              

              {/* Reasoning */}
              
                AI Reasoning
                {activeCallDetail.reasoning}
              

              {/* Signals */}
              
                {activeCallDetail.positiveSignals.length > 0 && (
                  
                    Positive Signals
                    
                      {activeCallDetail.positiveSignals.map((s, i) => (
                        {s}
                      ))}
                    
                  
                )}
                {activeCallDetail.negativeSignals.length > 0 && (
                  
                    Negative Signals
                    
                      {activeCallDetail.negativeSignals.map((s, i) => (
                        {s}
                      ))}
                    
                  
                )}
              

              {/* Recording */}
              {(activeCallDetail.recordingUrl || activeCallDetail.callSessionId) && (
                
                  Recording
                   {
                      try {
                        const res = await apiRequest('GET', `/api/recordings/${activeCallDetail.callSessionId}/gcs-url`);
                        const data = await res.json();
                        if (data.url) {
                          window.open(data.url, '_blank', 'noopener,noreferrer');
                        }
                      } catch (err) {
                        console.error('Failed to get recording URL:', err);
                      }
                    }}
                  >
                     Play in New Tab
                  
                
              )}

              {/* Transcript */}
              {activeCallDetail.fullTranscript && (
                
                  Transcript
                  
                    
                  
                
              )}

              {/* Lead info */}
              
                {activeCallDetail.hasLead ? (
                  
                     Lead exists: {activeCallDetail.leadId}
                  
                ) : (
                  
                    No lead created
                  
                )}
              
            
          ) : (
            Call not found
          )}

          
            {activeCallDetail && (
               {
                  setDetailCallId(null);
                  setOverrideDialog({
                    callSessionId: activeCallDetail.callSessionId,
                    currentDisp: activeCallDetail.currentDisposition,
                  });
                  setOverrideDisposition(activeCallDetail.suggestedDisposition);
                }}
              >
                Override Disposition
              
            )}
          
        
      

      {/* ==================== CONTACT DETAIL DIALOG ==================== */}
       !open && setSelectedContactDetail(null)}>
        
          
            
              {selectedContactDetail?.contactName}
              
            
            
              {selectedContactDetail?.companyName}
              {selectedContactDetail?.jobTitle && ` \u2014 ${selectedContactDetail.jobTitle}`}
            
          

          {selectedContactDetail && (
            
              {/* Contact info grid */}
              
                
                  Phone
                  {selectedContactDetail.contactPhone}
                
                {selectedContactDetail.contactEmail && (
                  
                    Email
                    {selectedContactDetail.contactEmail}
                  
                )}
                
                  Campaign
                  {selectedContactDetail.campaignName}
                
                
                  Duration / Date
                  
                    {formatDuration(selectedContactDetail.durationSec)} &mdash; {formatDate(selectedContactDetail.callDate)}
                  
                
              

              

              {/* Disposition Details Section */}
              
                
                  
                    
                    Disposition Details
                  
                  
                    
                      Current Disposition
                      
                    
                    {selectedContactDetail.dispositionDetails?.expectedDisposition && (
                      
                        Expected Disposition
                        
                          
                        
                      
                    )}
                    {selectedContactDetail.dispositionDetails?.dispositionAccurate !== null && selectedContactDetail.dispositionDetails?.dispositionAccurate !== undefined && (
                      
                        Accuracy
                        
                          {selectedContactDetail.dispositionDetails.dispositionAccurate ? (
                            
                               Accurate
                            
                          ) : (
                            
                               Mismatch
                            
                          )}
                        
                      
                    )}
                  

                  {/* Quality score and sentiment */}
                  
                    {selectedContactDetail.dispositionDetails?.overallQualityScore != null && (
                      
                        Call Quality Score
                        
                          
                          {selectedContactDetail.dispositionDetails.overallQualityScore}%
                        
                      
                    )}
                    {selectedContactDetail.dispositionDetails?.sentiment && (
                      
                        Sentiment
                        
                          
                            {selectedContactDetail.dispositionDetails.sentiment}
                          
                        
                      
                    )}
                  

                  {/* Disposition notes */}
                  {selectedContactDetail.dispositionDetails?.dispositionNotes && (
                    
                      Disposition Notes
                      
                        {Array.isArray(selectedContactDetail.dispositionDetails.dispositionNotes) ? (
                          
                            {selectedContactDetail.dispositionDetails.dispositionNotes.map((note: any, i: number) => (
                              {typeof note === 'string' ? note : JSON.stringify(note)}
                            ))}
                          
                        ) : (
                          {JSON.stringify(selectedContactDetail.dispositionDetails.dispositionNotes)}
                        )}
                      
                    
                  )}
                
              

              {/* AI Analysis */}
              {selectedContactDetail.aiAnalysis && (
                
                  
                    
                      
                      AI Analysis
                    
                    
                      {typeof selectedContactDetail.aiAnalysis === 'object' ? (
                        {JSON.stringify(selectedContactDetail.aiAnalysis, null, 2)}
                      ) : (
                        {String(selectedContactDetail.aiAnalysis)}
                      )}
                    
                  
                
              )}

              

              {/* Transcript and History Tabs */}
               setContactDetailTab(v as any)}>
                
                  
                     Transcript
                    {selectedContactDetail.parsedTranscript?.length > 0 && (
                      
                        {selectedContactDetail.parsedTranscript.length}
                      
                    )}
                  
                  
                     History
                    
                      {selectedContactDetail.interactionHistory?.length || 0}
                    
                  
                

                
                  {(selectedContactDetail.recordingUrl || selectedContactDetail.callSessionId) && (
                    
                       {
                          try {
                            const res = await apiRequest('GET', `/api/recordings/${selectedContactDetail.callSessionId}/gcs-url`);
                            const data = await res.json();
                            if (data.url) {
                              window.open(data.url, '_blank', 'noopener,noreferrer');
                            }
                          } catch (err) {
                            console.error('Failed to get recording URL:', err);
                          }
                        }}
                      >
                         Play in New Tab
                      
                    
                  )}
                  
                    
                  
                

                
                  
                    
                      {selectedContactDetail.interactionHistory?.map((h, i) => (
                        
                          
                            
                              
                              {formatDuration(h.durationSec)}
                            
                            {formatDate(h.date)}
                          
                          
                            {h.hasRecording && Rec}
                            {h.hasTranscript && Trans}
                          
                        
                      ))}
                      {(!selectedContactDetail.interactionHistory || selectedContactDetail.interactionHistory.length === 0) && (
                        No interaction history available.
                      )}
                    
                  
                
              

              {/* Lead status */}
              
                {selectedContactDetail.hasLead ? (
                  
                     Lead Created
                  
                ) : (
                  No lead
                )}
                {selectedContactDetail.qaStatus && (
                  QA: {selectedContactDetail.qaStatus}
                )}
              
            
          )}

          
             setSelectedContactDetail(null)}>Close
             {
                if (selectedContactDetail) {
                  setOverrideDialog({
                    callSessionId: selectedContactDetail.callSessionId,
                    currentDisp: selectedContactDetail.disposition,
                  });
                  setOverrideDisposition('');
                  setSelectedContactDetail(null);
                }
              }}
            >
              Override Disposition
            
          
        
      

      {/* ==================== OVERRIDE DIALOG ==================== */}
       !open && setOverrideDialog(null)}>
        
          
            Override Disposition
            
              Change the disposition for this call. This will update the call session, route leads, and log the change.
            
          

          {overrideDialog && (
            
              
                Current Disposition
                
              

              
                New Disposition
                
                  
                    
                  
                  
                    {Object.entries(DISPOSITION_LABELS).filter(([k]) => k !== 'unknown').map(([key, label]) => (
                      {label}
                    ))}
                  
                
              

              
                Reason (optional)
                 setOverrideReason(e.target.value)}
                />
              
            
          )}

          
             setOverrideDialog(null)}>Cancel
             {
                if (overrideDialog) {
                  overrideMutation.mutate({
                    callSessionId: overrideDialog.callSessionId,
                    newDisposition: overrideDisposition,
                    reason: overrideReason,
                  });
                }
              }}
            >
              {overrideMutation.isPending ?  : null}
              Apply Override
            
          
        
      

      {/* ==================== CLIENT SAMPLE VALIDATION DIALOG ==================== */}
       {
        if (!open) {
          setSampleValidationDialog(false);
          setSampleValidationResult(null);
          setSampleClientNotes('');
        }
      }}>
        
          
            Push Recordings as Client Samples
            
              Quality validation ensures only real conversations without technical issues are sent to clients.
            
          

          {sampleValidationResult && (
            
              {/* Summary */}
              
                
                  
                    Total Checked
                    {sampleValidationResult.validations.length}
                  
                
                
                  
                    Passed
                    {sampleValidationResult.passedCount}
                  
                
                 0 ? 'border-red-200' : ''}>
                  
                    Failed
                    {sampleValidationResult.failedCount}
                  
                
              

              {/* Validation list */}
              
                
                  {/* Passed calls first, then failed */}
                  {[...sampleValidationResult.validations]
                    .sort((a, b) => (a.passed === b.passed ? 0 : a.passed ? -1 : 1))
                    .map((v) => (
                    
                      
                        {v.passed ? (
                          
                        ) : (
                          
                        )}
                      
                      
                        
                          {v.contactName}
                          ({v.companyName})
                        
                        
                          {v.campaignName}
                          {formatDuration(v.durationSec)}
                          {v.turnCount} turns
                          {v.recordingUrl ? (
                            Rec
                          ) : (
                            No Rec
                          )}
                        
                        {v.issues.length > 0 && (
                          
                            {v.issues.map((issue, idx) => (
                              
                                {issue}
                              
                            ))}
                          
                        )}
                      
                    
                  ))}
                
              

              {/* Client notes */}
              {sampleValidationResult.passedCount > 0 && (
                
                  Client Notes (optional)
                   setSampleClientNotes(e.target.value)}
                    rows={2}
                  />
                
              )}
            
          )}

          
             { setSampleValidationDialog(false); setSampleValidationResult(null); setSampleClientNotes(''); }}>
              Cancel
            
            {sampleValidationResult && sampleValidationResult.passedCount > 0 && (
               pushSamplesToClientMutation.mutate()}
              >
                {pushSamplesToClientMutation.isPending ?  : }
                Push {sampleValidationResult.passedCount} Passing Calls
              
            )}
          
        
      
    
  );
}

// ==================== TRANSCRIPT VIEWER ====================

function TranscriptView({ transcript }: { transcript: any }) {
  let entries: Array = [];

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
    return {String(transcript)};
  }

  if (entries.length === 0) {
    return No transcript available;
  }

  return (
    
      {entries.map((entry, i) => (
        
          
            {entry.role === 'assistant' || entry.role === 'agent' ? 'Agent' : 'Contact'}:
          {' '}
          {entry.text}
        
      ))}
    
  );
}