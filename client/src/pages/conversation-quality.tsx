import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import {
  MessageSquare,
  Phone,
  Mail,
  AlertTriangle,
  CheckCircle,
  XCircle,
  Clock,
  User,
  Building,
  Search,
  Filter,
  FileText,
  TrendingUp,
  BarChart3,
  RefreshCw,
  Loader2,
  Zap,
  Sparkles
} from "lucide-react";
import { format } from "date-fns";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";

interface TranscriptTurn {
  role: 'agent' | 'contact' | 'assistant' | 'user' | 'system';
  text: string;
  timestamp?: string;
}

interface ConversationRecord {
  id: string;
  type: 'call' | 'email';
  source: 'call_session' | 'test_call' | 'email_send';
  campaignId: string;
  campaignName: string;
  contactId?: string;
  contactName: string;
  contactEmail?: string;
  companyName: string;
  status: string;
  disposition?: string;
  agentType?: 'human' | 'ai';
  agentName?: string;
  duration?: number;
  transcript?: string;
  transcriptTurns?: TranscriptTurn[];
  analysis?: {
    overallScore?: number;
    testResult?: string;
    summary?: string;
    performanceMetrics?: {
      identityConfirmed?: boolean;
      gatekeeperHandled?: boolean;
      pitchDelivered?: boolean;
      objectionHandled?: boolean;
      closingAttempted?: boolean;
      conversationFlow?: string;
      rapportBuilding?: string;
    };
    qualityDimensions?: {
      engagement?: number;
      clarity?: number;
      empathy?: number;
      objectionHandling?: number;
      qualification?: number;
      closing?: number;
    };
    issues?: any[];
    recommendations?: any[];
    suggestions?: any[];
    dispositionReview?: {
      assignedDisposition?: string;
      expectedDisposition?: string;
      isAccurate?: boolean;
      notes?: string[];
    };
  };
  detectedIssues?: any[];
  callSummary?: string;
  testResult?: string;
  recordingUrl?: string;
  recordingS3Key?: string;
  recordingStatus?: string;
  telnyxRecordingId?: string;
  hasRecording?: boolean;
  createdAt: string;
  isTestCall: boolean;
}

function DispositionBadge({ disposition }: { disposition: string }) {
  const config: Record<string, { variant: 'default' | 'secondary' | 'destructive' | 'outline'; className?: string }> = {
    qualified: { variant: 'default', className: 'bg-green-600' },
    not_interested: { variant: 'secondary' },
    voicemail: { variant: 'outline' },
    no_answer: { variant: 'outline' },
    callback_requested: { variant: 'default', className: 'bg-blue-600' },
    dnc_request: { variant: 'destructive' },
    busy: { variant: 'outline' },
    gatekeeper: { variant: 'secondary' },
    wrong_number: { variant: 'destructive' },
  };
  const { variant, className } = config[disposition] || { variant: 'outline' };
  return (
    <Badge variant={variant} className={className}>
      {disposition?.replace(/_/g, ' ') || 'Unknown'}
    </Badge>
  );
}

function QAStatusBadge({ status }: { status: string }) {
  const config: Record<string, { variant: 'default' | 'secondary' | 'destructive' | 'outline'; className?: string; label: string }> = {
    approved: { variant: 'default', className: 'bg-green-600', label: 'Approved' },
    rejected: { variant: 'destructive', label: 'Rejected' },
    pending_review: { variant: 'secondary', label: 'Pending Review' },
    pending: { variant: 'outline', label: 'Pending' },
  };
  const { variant, className, label } = config[status] || { variant: 'outline', label: status || 'Unknown' };
  return <Badge variant={variant} className={className}>{label}</Badge>;
}

function TranscriptViewer({ transcript, turns }: { transcript?: string; turns?: TranscriptTurn[] }) {
  if (turns && turns.length > 0) {
    return (
      <div className="space-y-3">
        {turns.map((turn, index) => (
          <div
            key={index}
            className={cn(
              "p-3 rounded-lg",
              turn.role === 'agent' || turn.role === 'assistant'
                ? 'bg-primary/10 ml-4'
                : turn.role === 'system'
                ? 'bg-muted text-muted-foreground text-sm italic'
                : 'bg-muted mr-4'
            )}
          >
            <div className="flex items-center gap-2 mb-1">
              <Badge variant="outline" className="text-xs">
                {turn.role === 'agent' || turn.role === 'assistant' ? 'Agent' :
                 turn.role === 'system' ? 'System' : 'Contact'}
              </Badge>
              {turn.timestamp && (
                <span className="text-xs text-muted-foreground">
                  {turn.timestamp}
                </span>
              )}
            </div>
            <p className="text-sm">{turn.text}</p>
          </div>
        ))}
      </div>
    );
  }

  if (transcript) {
    return (
      <div className="bg-muted p-4 rounded-lg">
        <pre className="text-sm whitespace-pre-wrap font-sans">{transcript}</pre>
      </div>
    );
  }

  return (
    <div className="text-center py-8 text-muted-foreground">
      <MessageSquare className="h-12 w-12 mx-auto mb-2 opacity-50" />
      <p>No transcript available</p>
    </div>
  );
}

function SourceBadge({ source, isTestCall }: { source: string; isTestCall: boolean }) {
  if (isTestCall) {
    return <Badge variant="outline" className="bg-yellow-50 text-yellow-700 border-yellow-300">Test Call</Badge>;
  }
  const sourceLabels: Record<string, string> = {
    call_session: 'Production',
    email_send: 'Email',
  };
  return <Badge variant="outline">{sourceLabels[source] || source}</Badge>;
}

function ConversationCard({
  conversation,
  isSelected,
  onClick
}: {
  conversation: ConversationRecord;
  isSelected: boolean;
  onClick: () => void;
}) {
  return (
    <Card
      className={cn(
        "cursor-pointer transition-all hover:shadow-md",
        isSelected && "ring-2 ring-primary",
        conversation.isTestCall && "border-yellow-200 bg-yellow-50/30"
      )}
      onClick={onClick}
    >
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              {conversation.type === 'call' ? (
                <Phone className="h-4 w-4 text-muted-foreground" />
              ) : (
                <Mail className="h-4 w-4 text-muted-foreground" />
              )}
              <span className="font-medium truncate">{conversation.contactName || 'Unknown Contact'}</span>
              {conversation.agentType === 'ai' && (
                <Badge variant="secondary" className="text-xs">AI</Badge>
              )}
            </div>
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Building className="h-3 w-3" />
              <span className="truncate">{conversation.companyName || 'Unknown Company'}</span>
            </div>
          </div>
          <div className="flex flex-col items-end gap-1">
            <SourceBadge source={conversation.source} isTestCall={conversation.isTestCall} />
            {conversation.disposition && (
              <DispositionBadge disposition={conversation.disposition} />
            )}
          </div>
        </div>
        <div className="mt-3 flex items-center justify-between text-xs text-muted-foreground">
          <span className="truncate">{conversation.campaignName}</span>
          <div className="flex items-center gap-1">
            <Clock className="h-3 w-3" />
            {format(new Date(conversation.createdAt), 'MMM d, HH:mm')}
          </div>
        </div>
        {/* Quality Score + Duration */}
        <div className="mt-1 flex items-center gap-3 text-xs text-muted-foreground">
          {conversation.analysis?.overallScore !== undefined && conversation.analysis.overallScore > 0 && (
            <Badge
              variant={conversation.analysis.overallScore >= 70 ? "default" : conversation.analysis.overallScore >= 50 ? "secondary" : "destructive"}
              className={cn("text-xs", conversation.analysis.overallScore >= 70 && "bg-green-600")}
            >
              Score: {conversation.analysis.overallScore}/100
            </Badge>
          )}
          {conversation.duration && conversation.duration > 0 && (
            <span>
              Duration: {Math.floor(conversation.duration / 60)}:{String(conversation.duration % 60).padStart(2, '0')}
            </span>
          )}
        </div>
        {conversation.detectedIssues && conversation.detectedIssues.length > 0 && (
          <div className="mt-2 flex items-center gap-1">
            <AlertTriangle className="h-3 w-3 text-yellow-500" />
            <span className="text-xs text-yellow-600">{conversation.detectedIssues.length} issue(s) detected</span>
          </div>
        )}
        {conversation.testResult && (
          <div className="mt-2 flex items-center gap-1">
            {conversation.testResult === 'success' ? (
              <CheckCircle className="h-3 w-3 text-green-500" />
            ) : conversation.testResult === 'failed' ? (
              <XCircle className="h-3 w-3 text-red-500" />
            ) : (
              <AlertTriangle className="h-3 w-3 text-yellow-500" />
            )}
            <span className="text-xs capitalize">{conversation.testResult.replace(/_/g, ' ')}</span>
          </div>
        )}
        {(conversation.transcript || conversation.transcriptTurns) && (
          <div className="mt-1 flex items-center gap-1 text-xs text-green-600">
            <FileText className="h-3 w-3" />
            <span>Has transcript</span>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default function ConversationQualityPage() {
  const [selectedCampaign, setSelectedCampaign] = useState<string>('all');
  const [selectedType, setSelectedType] = useState<string>('all');
  const [selectedSource, setSelectedSource] = useState<string>('all');
  const [selectedDisposition, setSelectedDisposition] = useState<string>('all');
  const [showOnlyWithTranscripts, setShowOnlyWithTranscripts] = useState<boolean>(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [dateFrom, setDateFrom] = useState<string>('');
  const [dateTo, setDateTo] = useState<string>('');
  const [selectedConversation, setSelectedConversation] = useState<ConversationRecord | null>(null);
  const queryClient = useQueryClient();
  const { toast } = useToast();

  // Fetch campaigns for filter
  const { data: campaigns = [] } = useQuery<any[]>({
    queryKey: ['/api/campaigns'],
  });

  // Fetch ALL conversations (call sessions, test calls, emails)
  const qaParams = new URLSearchParams();
  if (selectedCampaign !== 'all') qaParams.append('campaignId', selectedCampaign);
  if (selectedType !== 'all') qaParams.append('type', selectedType);
  if (searchQuery) qaParams.append('search', searchQuery);
  if (dateFrom) qaParams.append('dateFrom', dateFrom);
  if (dateTo) qaParams.append('dateTo', dateTo);
  qaParams.append('limit', '200');

  const { data: qaData, isLoading: qaLoading, refetch } = useQuery<any>({
    queryKey: ['/api/qa/conversations', selectedCampaign, selectedType, searchQuery, dateFrom, dateTo],
    queryFn: async () => {
      const response = await apiRequest('GET', `/api/qa/conversations?${qaParams.toString()}`);
      return response.json();
    },
  });

  const allConversations: ConversationRecord[] = qaData?.conversations || [];

  // Apply filters client-side
  let conversations = allConversations;
  
  // Source filter
  if (selectedSource !== 'all') {
    conversations = conversations.filter(c => c.source === selectedSource);
  }
  
  // Disposition filter
  if (selectedDisposition !== 'all') {
    conversations = conversations.filter(c => 
      c.disposition?.toLowerCase().includes(selectedDisposition.toLowerCase())
    );
  }
  
  // Transcript filter - show only calls with substantial transcripts
  if (showOnlyWithTranscripts) {
    conversations = conversations.filter(c => 
      (c.transcript && c.transcript.length > 100) || 
      (c.transcriptTurns && c.transcriptTurns.length > 2)
    );
  }

  // Use backend-computed stats (accurate across full dataset, not limited by fetch cap)
  const backendStats = qaData?.stats;
  const stats = {
    total: qaData?.total ?? conversations.length,
    calls: backendStats?.callSessions ?? conversations.filter(c => c.type === 'call' && !c.isTestCall).length,
    analyzed: backendStats?.analyzedWithScores ?? conversations.filter(c => c.analysis?.overallScore && c.analysis.overallScore > 0).length,
    testCalls: backendStats?.testCalls ?? conversations.filter(c => c.isTestCall).length,
    avgScore: backendStats?.avgQualityScore ?? null,
    avgDimensions: backendStats?.avgDimensions as { engagement: number; clarity: number; empathy: number; objectionHandling: number; qualification: number; closing: number } | undefined,
  };

  // Count calls with transcript but no analysis (eligible for bulk analyze)
  const unanalyzedWithTranscript = conversations.filter(c =>
    !c.isTestCall &&
    (c.transcript || (c.transcriptTurns && c.transcriptTurns.length > 0)) &&
    (!c.analysis?.overallScore || c.analysis.overallScore === 0)
  ).length;

  // Transcribe & analyze a single call
  const transcribeMutation = useMutation({
    mutationFn: async (callSessionId: string) => {
      const response = await apiRequest('POST', `/api/qa/transcribe/${callSessionId}`, { analyze: true });
      return response.json();
    },
    onSuccess: (data: any) => {
      toast({
        title: 'Transcription Complete',
        description: data.analyzed
          ? `Transcribed (${data.transcriptLength} chars) and analyzed (Score: ${data.analysis?.overallScore}/100)`
          : `Transcribed successfully (${data.transcriptLength} chars)`,
      });
      queryClient.invalidateQueries({ queryKey: ['/api/qa/conversations'] });
    },
    onError: (error: any) => {
      toast({
        title: 'Transcription Failed',
        description: error?.message || 'Failed to transcribe recording',
        variant: 'destructive',
      });
    },
  });

  // Re-analyze a call that already has a transcript
  const reanalyzeMutation = useMutation({
    mutationFn: async (callSessionId: string) => {
      const response = await apiRequest('POST', `/api/qa/transcribe/${callSessionId}`, { analyze: true });
      return response.json();
    },
    onSuccess: (data: any) => {
      toast({
        title: 'Analysis Complete',
        description: `Quality Score: ${data.analysis?.overallScore}/100`,
      });
      queryClient.invalidateQueries({ queryKey: ['/api/qa/conversations'] });
    },
    onError: (error: any) => {
      toast({
        title: 'Analysis Failed',
        description: error?.message || 'Failed to analyze conversation',
        variant: 'destructive',
      });
    },
  });

  const bulkAnalyzeMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest('POST', '/api/qa/bulk-analyze', {});
      return response.json();
    },
    onSuccess: (data: any) => {
      toast({
        title: 'Bulk Analysis Complete',
        description: `${data.analyzed} calls analyzed, ${data.failed} failed${data.skipped ? `, ${data.skipped} skipped` : ''}`,
      });
      queryClient.invalidateQueries({ queryKey: ['/api/qa/conversations'] });
    },
    onError: (error: any) => {
      toast({
        title: 'Analysis Failed',
        description: error?.message || 'Failed to run bulk analysis',
        variant: 'destructive',
      });
    },
  });

  return (
    <div className="container mx-auto p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <FileText className="h-6 w-6" />
            Conversation Quality Panel
          </h1>
          <p className="text-muted-foreground">
            Review and analyze call transcripts to identify issues and improve agent performance
          </p>
        </div>
        <div className="flex items-center gap-2">
          {unanalyzedWithTranscript > 0 && (
            <Button
              variant="default"
              onClick={() => bulkAnalyzeMutation.mutate()}
              disabled={bulkAnalyzeMutation.isPending}
            >
              {bulkAnalyzeMutation.isPending ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Zap className="h-4 w-4 mr-2" />
              )}
              {bulkAnalyzeMutation.isPending
                ? 'Analyzing...'
                : `Analyze ${unanalyzedWithTranscript} Unanalyzed`}
            </Button>
          )}
          <Button variant="outline" onClick={() => refetch()}>
            <RefreshCw className="h-4 w-4 mr-2" />
            Refresh
          </Button>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2">
              <MessageSquare className="h-5 w-5 text-muted-foreground" />
              <div>
                <p className="text-2xl font-bold">{stats.total}</p>
                <p className="text-xs text-muted-foreground">Total Interactions</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2">
              <Phone className="h-5 w-5 text-purple-500" />
              <div>
                <p className="text-2xl font-bold">{stats.calls}</p>
                <p className="text-xs text-muted-foreground">Production Calls</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2">
              <BarChart3 className="h-5 w-5 text-blue-500" />
              <div>
                <p className="text-2xl font-bold">{stats.analyzed}</p>
                <p className="text-xs text-muted-foreground">Analyzed</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-yellow-500" />
              <div>
                <p className="text-2xl font-bold">{stats.testCalls}</p>
                <p className="text-xs text-muted-foreground">Test Calls</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2">
              <TrendingUp className="h-5 w-5 text-green-500" />
              <div>
                <p className="text-2xl font-bold">{stats.avgScore !== null ? `${stats.avgScore}/100` : '--'}</p>
                <p className="text-xs text-muted-foreground">Avg Score</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Quality Dimension Averages */}
      {stats.avgDimensions && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-blue-500" />
              Quality Dimensions (Avg across {stats.analyzed} analyzed)
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            <div className="grid grid-cols-3 md:grid-cols-6 gap-3">
              {[
                { key: 'engagement', label: 'Engagement', color: 'text-blue-600' },
                { key: 'clarity', label: 'Clarity', color: 'text-purple-600' },
                { key: 'empathy', label: 'Empathy', color: 'text-pink-600' },
                { key: 'objectionHandling', label: 'Objection Handling', color: 'text-orange-600' },
                { key: 'qualification', label: 'Qualification', color: 'text-teal-600' },
                { key: 'closing', label: 'Closing', color: 'text-green-600' },
              ].map(dim => {
                const value = stats.avgDimensions![dim.key as keyof typeof stats.avgDimensions];
                return (
                  <div key={dim.key} className="text-center p-3 rounded-lg bg-muted/50">
                    <div className={cn("text-2xl font-bold", dim.color)}>{value}</div>
                    <div className="text-xs text-muted-foreground mt-1">{dim.label}</div>
                    <div className="w-full bg-muted rounded-full h-1.5 mt-2">
                      <div
                        className={cn(
                          "h-1.5 rounded-full",
                          value >= 70 ? "bg-green-500" : value >= 50 ? "bg-yellow-500" : "bg-red-500"
                        )}
                        style={{ width: `${value}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Filters */}
      <Card>
        <CardContent className="p-4">
          <div className="flex flex-wrap gap-4 items-end">
            <div className="flex-1 min-w-[200px]">
              <Label htmlFor="search">Search</Label>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  id="search"
                  placeholder="Search by name, company..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-9"
                />
              </div>
            </div>
            <div className="w-[200px]">
              <Label htmlFor="campaign">Campaign</Label>
              <Select value={selectedCampaign} onValueChange={setSelectedCampaign}>
                <SelectTrigger id="campaign">
                  <SelectValue placeholder="All Campaigns" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Campaigns</SelectItem>
                  {campaigns.map((campaign: any) => (
                    <SelectItem key={campaign.id} value={campaign.id}>
                      {campaign.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="w-[140px]">
              <Label htmlFor="type">Type</Label>
              <Select value={selectedType} onValueChange={setSelectedType}>
                <SelectTrigger id="type">
                  <SelectValue placeholder="All Types" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Types</SelectItem>
                  <SelectItem value="call">Calls</SelectItem>
                  <SelectItem value="email">Emails</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="w-[160px]">
              <Label htmlFor="source">Source</Label>
              <Select value={selectedSource} onValueChange={setSelectedSource}>
                <SelectTrigger id="source">
                  <SelectValue placeholder="All Sources" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Sources</SelectItem>
                  <SelectItem value="call_session">Production Calls</SelectItem>
                  <SelectItem value="test_call">Test Calls</SelectItem>
                  <SelectItem value="email_send">Emails</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="w-[180px]">
              <Label htmlFor="disposition">Disposition</Label>
              <Select value={selectedDisposition} onValueChange={setSelectedDisposition}>
                <SelectTrigger id="disposition">
                  <SelectValue placeholder="All Dispositions" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Dispositions</SelectItem>
                  <SelectItem value="completed">Completed</SelectItem>
                  <SelectItem value="qualified">Qualified</SelectItem>
                  <SelectItem value="not_interested">Not Interested</SelectItem>
                  <SelectItem value="callback">Callback Requested</SelectItem>
                  <SelectItem value="gatekeeper">Gatekeeper</SelectItem>
                  <SelectItem value="voicemail">Voicemail</SelectItem>
                  <SelectItem value="no_answer">No Answer</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="w-[150px]">
              <Label htmlFor="dateFrom">From Date</Label>
              <Input
                id="dateFrom"
                type="date"
                value={dateFrom}
                onChange={(e) => setDateFrom(e.target.value)}
              />
            </div>
            <div className="w-[150px]">
              <Label htmlFor="dateTo">To Date</Label>
              <Input
                id="dateTo"
                type="date"
                value={dateTo}
                onChange={(e) => setDateTo(e.target.value)}
              />
            </div>
            <div className="flex items-center space-x-2 pt-6">
              <Checkbox 
                id="hasTranscripts" 
                checked={showOnlyWithTranscripts}
                onCheckedChange={(checked) => setShowOnlyWithTranscripts(checked === true)}
              />
              <Label htmlFor="hasTranscripts" className="text-sm cursor-pointer">
                Show only with full transcripts
              </Label>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Main Content - Split View */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Conversation List */}
        <Card className="h-[600px] flex flex-col">
          <CardHeader className="pb-2">
            <CardTitle className="text-lg">Conversations</CardTitle>
            <CardDescription>
              {conversations.length} conversation{conversations.length !== 1 ? 's' : ''} ({stats.analyzed} analyzed with quality scores)
            </CardDescription>
          </CardHeader>
          <CardContent className="flex-1 overflow-hidden p-0">
            {qaLoading ? (
              <div className="p-4 space-y-4">
                {[1, 2, 3].map((i) => (
                  <Skeleton key={i} className="h-24 w-full" />
                ))}
              </div>
            ) : conversations.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full text-muted-foreground">
                <MessageSquare className="h-12 w-12 mb-2 opacity-50" />
                <p>No conversations found</p>
                <p className="text-sm">Try adjusting your filters</p>
              </div>
            ) : (
              <ScrollArea className="h-full p-4">
                <div className="space-y-3">
                  {conversations.map((conversation) => (
                    <ConversationCard
                      key={conversation.id}
                      conversation={conversation}
                      isSelected={selectedConversation?.id === conversation.id}
                      onClick={() => setSelectedConversation(conversation)}
                    />
                  ))}
                </div>
              </ScrollArea>
            )}
          </CardContent>
        </Card>

        {/* Transcript Viewer */}
        <Card className="h-[600px] flex flex-col">
          <CardHeader className="pb-2">
            <CardTitle className="text-lg">Transcript</CardTitle>
            {selectedConversation && (
              <CardDescription>
                {selectedConversation.contactName} - {selectedConversation.companyName}
              </CardDescription>
            )}
          </CardHeader>
          <CardContent className="flex-1 overflow-hidden p-0">
            {selectedConversation ? (
              <ScrollArea className="h-full p-4">
                <div className="space-y-4">
                  {/* Conversation Details */}
                  <div className="flex flex-wrap gap-2">
                    <SourceBadge source={selectedConversation.source} isTestCall={selectedConversation.isTestCall} />
                    {selectedConversation.disposition && (
                      <DispositionBadge disposition={selectedConversation.disposition} />
                    )}
                    {selectedConversation.agentType && (
                      <Badge variant="secondary">{selectedConversation.agentType === 'ai' ? 'AI Agent' : 'Human Agent'}</Badge>
                    )}
                    {selectedConversation.duration && selectedConversation.duration > 0 && (
                      <Badge variant="outline">
                        <Clock className="h-3 w-3 mr-1" />
                        {Math.floor(selectedConversation.duration / 60)}:{String(selectedConversation.duration % 60).padStart(2, '0')}
                      </Badge>
                    )}
                    {selectedConversation.testResult && (
                      <Badge
                        variant={selectedConversation.testResult === 'success' ? 'default' : selectedConversation.testResult === 'failed' ? 'destructive' : 'secondary'}
                        className={selectedConversation.testResult === 'success' ? 'bg-green-600' : ''}
                      >
                        {selectedConversation.testResult.replace(/_/g, ' ')}
                      </Badge>
                    )}
                  </div>

                  {/* Campaign & Agent Info */}
                  <div className="text-sm text-muted-foreground space-y-1">
                    <div>Campaign: {selectedConversation.campaignName}</div>
                    {selectedConversation.agentName && (
                      <div>Agent: {selectedConversation.agentName}</div>
                    )}
                  </div>

                  {/* Call Summary */}
                  {(selectedConversation.callSummary || selectedConversation.analysis?.summary) && (
                    <div className="bg-muted/50 p-3 rounded-lg">
                      <h4 className="text-sm font-medium mb-1">Call Summary</h4>
                      <p className="text-sm text-muted-foreground">
                        {selectedConversation.callSummary || selectedConversation.analysis?.summary}
                      </p>
                    </div>
                  )}

                  {/* Analysis Score & Quality Dimensions */}
                  {selectedConversation.analysis && (
                    <div className="bg-blue-50 border border-blue-200 p-3 rounded-lg space-y-3">
                      <div className="flex items-center justify-between">
                        <h4 className="text-sm font-medium flex items-center gap-1">
                          <BarChart3 className="h-4 w-4 text-blue-600" />
                          Quality Analysis
                        </h4>
                        {selectedConversation.analysis.overallScore !== undefined && (
                          <Badge
                            variant={selectedConversation.analysis.overallScore >= 70 ? "default" : selectedConversation.analysis.overallScore >= 50 ? "secondary" : "destructive"}
                            className={selectedConversation.analysis.overallScore >= 70 ? "bg-green-600" : ""}
                          >
                            Score: {selectedConversation.analysis.overallScore}/100
                          </Badge>
                        )}
                      </div>

                      {/* Quality Dimensions Grid */}
                      {selectedConversation.analysis.qualityDimensions && (
                        <div className="grid grid-cols-3 gap-2 text-xs">
                          {Object.entries(selectedConversation.analysis.qualityDimensions).map(([key, value]) => (
                            <div key={key} className="bg-white/50 p-2 rounded">
                              <div className="text-muted-foreground capitalize">{key.replace(/([A-Z])/g, ' $1')}</div>
                              <div className="font-medium">{String(value)}</div>
                            </div>
                          ))}
                        </div>
                      )}

                      {/* Performance Metrics */}
                      {selectedConversation.analysis.performanceMetrics && (
                        <div className="flex flex-wrap gap-1.5">
                          {selectedConversation.analysis.performanceMetrics.identityConfirmed && (
                            <Badge variant="outline" className="text-xs bg-green-50 text-green-700 border-green-300">Identity Confirmed</Badge>
                          )}
                          {selectedConversation.analysis.performanceMetrics.pitchDelivered && (
                            <Badge variant="outline" className="text-xs bg-green-50 text-green-700 border-green-300">Pitch Delivered</Badge>
                          )}
                          {selectedConversation.analysis.performanceMetrics.objectionHandled && (
                            <Badge variant="outline" className="text-xs bg-green-50 text-green-700 border-green-300">Objection Handled</Badge>
                          )}
                          {selectedConversation.analysis.performanceMetrics.closingAttempted && (
                            <Badge variant="outline" className="text-xs bg-green-50 text-green-700 border-green-300">Closing Attempted</Badge>
                          )}
                          {selectedConversation.analysis.performanceMetrics.conversationFlow && (
                            <Badge variant="outline" className="text-xs">Flow: {selectedConversation.analysis.performanceMetrics.conversationFlow}</Badge>
                          )}
                        </div>
                      )}
                    </div>
                  )}

                  {/* Recommendations */}
                  {selectedConversation.analysis?.recommendations && selectedConversation.analysis.recommendations.length > 0 && (
                    <div className="bg-green-50 border border-green-200 p-3 rounded-lg">
                      <h4 className="text-sm font-medium mb-2 flex items-center gap-1">
                        <TrendingUp className="h-4 w-4 text-green-600" />
                        Recommendations ({selectedConversation.analysis.recommendations.length})
                      </h4>
                      <div className="space-y-2">
                        {selectedConversation.analysis.recommendations.slice(0, 3).map((rec: any, idx: number) => (
                          <div key={idx} className="text-sm bg-white/50 p-2 rounded">
                            <Badge variant="outline" className="text-xs mb-1">{rec.category}</Badge>
                            <p className="text-muted-foreground">{rec.suggestedChange}</p>
                            {rec.expectedImpact && (
                              <p className="text-green-700 text-xs mt-1">Impact: {rec.expectedImpact}</p>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Detected Issues */}
                  {selectedConversation.detectedIssues && selectedConversation.detectedIssues.length > 0 && (
                    <div className="bg-yellow-50 border border-yellow-200 p-3 rounded-lg">
                      <h4 className="text-sm font-medium mb-2 flex items-center gap-1">
                        <AlertTriangle className="h-4 w-4 text-yellow-600" />
                        Detected Issues ({selectedConversation.detectedIssues.length})
                      </h4>
                      <div className="space-y-2">
                        {selectedConversation.detectedIssues.map((issue: any, idx: number) => (
                          <div key={idx} className="text-sm">
                            <div className="flex items-center gap-2">
                              <Badge variant="outline" className={
                                issue.severity === 'high' ? 'border-red-300 text-red-700' :
                                issue.severity === 'medium' ? 'border-yellow-300 text-yellow-700' :
                                'border-gray-300'
                              }>
                                {issue.severity}
                              </Badge>
                              <span className="font-medium">{issue.type}</span>
                            </div>
                            <p className="text-muted-foreground mt-1">{issue.description}</p>
                            {issue.suggestion && (
                              <p className="text-blue-600 text-xs mt-1">Suggestion: {issue.suggestion}</p>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Recording Playback - uses stream endpoint for reliable GCS playback */}
                  {(selectedConversation.hasRecording || selectedConversation.recordingUrl || selectedConversation.recordingS3Key || selectedConversation.telnyxRecordingId || selectedConversation.source === 'call_session') && (
                    <div className="bg-muted/50 p-3 rounded-lg">
                      <div className="flex items-center justify-between mb-2">
                        <h4 className="text-sm font-medium flex items-center gap-2">
                          <Phone className="h-4 w-4" />
                          Call Recording
                          {selectedConversation.recordingS3Key && (
                            <Badge variant="outline" className="text-xs bg-green-50 text-green-700 border-green-300">GCS Stored</Badge>
                          )}
                        </h4>
                        <div className="flex items-center gap-2">
                          {/* Transcribe button: show if no transcript or very short */}
                          {!selectedConversation.isTestCall && (
                            !selectedConversation.transcript ||
                            (selectedConversation.transcript.length < 50 && (!selectedConversation.transcriptTurns || selectedConversation.transcriptTurns.length === 0))
                          ) && (
                            <Button
                              size="sm"
                              variant="default"
                              onClick={() => transcribeMutation.mutate(selectedConversation.id)}
                              disabled={transcribeMutation.isPending}
                            >
                              {transcribeMutation.isPending ? (
                                <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                              ) : (
                                <MessageSquare className="h-3 w-3 mr-1" />
                              )}
                              {transcribeMutation.isPending ? 'Transcribing...' : 'Transcribe & Analyze'}
                            </Button>
                          )}
                          {/* Re-analyze button: show if has transcript but no analysis */}
                          {!selectedConversation.isTestCall &&
                            (selectedConversation.transcript && selectedConversation.transcript.length >= 50) &&
                            (!selectedConversation.analysis?.overallScore || selectedConversation.analysis.overallScore === 0) && (
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => reanalyzeMutation.mutate(selectedConversation.id)}
                              disabled={reanalyzeMutation.isPending}
                            >
                              {reanalyzeMutation.isPending ? (
                                <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                              ) : (
                                <BarChart3 className="h-3 w-3 mr-1" />
                              )}
                              {reanalyzeMutation.isPending ? 'Analyzing...' : 'Analyze Quality'}
                            </Button>
                          )}
                        </div>
                      </div>
                      <audio
                        key={selectedConversation.id}
                        controls
                        className="w-full"
                        src={`/api/recordings/${selectedConversation.id}/stream`}
                        onError={(e) => {
                          const target = e.target as HTMLAudioElement;
                          target.style.display = 'none';
                          const parent = target.parentElement;
                          if (parent && !parent.querySelector('.audio-error')) {
                            const errorDiv = document.createElement('div');
                            errorDiv.className = 'audio-error text-sm text-destructive flex items-center gap-2 p-2 bg-destructive/10 rounded';
                            errorDiv.innerHTML = '<span>Recording unavailable - may have expired or failed to upload</span>';
                            parent.appendChild(errorDiv);
                          }
                        }}
                      >
                        Your browser does not support the audio element.
                      </audio>
                    </div>
                  )}

                  {/* Transcript */}
                  <div>
                    <h4 className="text-sm font-medium mb-2">Transcript</h4>
                    <TranscriptViewer
                      transcript={selectedConversation.transcript}
                      turns={selectedConversation.transcriptTurns}
                    />
                  </div>
                </div>
              </ScrollArea>
            ) : (
              <div className="flex flex-col items-center justify-center h-full text-muted-foreground">
                <FileText className="h-12 w-12 mb-2 opacity-50" />
                <p>Select a conversation to view transcript</p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
