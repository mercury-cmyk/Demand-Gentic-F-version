import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
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
  RefreshCw
} from "lucide-react";
import { format } from "date-fns";
import { cn } from "@/lib/utils";

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
  analysis?: any;
  detectedIssues?: any[];
  callSummary?: string;
  testResult?: string;
  recordingUrl?: string;
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
        {conversation.duration && conversation.duration > 0 && (
          <div className="mt-1 text-xs text-muted-foreground">
            Duration: {Math.floor(conversation.duration / 60)}:{String(conversation.duration % 60).padStart(2, '0')}
          </div>
        )}
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
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedConversation, setSelectedConversation] = useState<ConversationRecord | null>(null);

  // Fetch campaigns for filter
  const { data: campaigns = [] } = useQuery<any[]>({
    queryKey: ['/api/campaigns'],
  });

  // Fetch ALL conversations (call sessions, test calls, emails)
  const qaParams = new URLSearchParams();
  if (selectedCampaign !== 'all') qaParams.append('campaignId', selectedCampaign);
  if (selectedType !== 'all') qaParams.append('type', selectedType);
  if (searchQuery) qaParams.append('search', searchQuery);
  qaParams.append('limit', '200');

  const { data: qaData, isLoading: qaLoading, refetch } = useQuery<any>({
    queryKey: ['/api/qa/conversations', selectedCampaign, selectedType, searchQuery],
    queryFn: async () => {
      const response = await fetch(`/api/qa/conversations?${qaParams.toString()}`, {
        credentials: 'include'
      });
      if (!response.ok) throw new Error('Failed to fetch conversations');
      return response.json();
    },
  });

  const allConversations: ConversationRecord[] = qaData?.conversations || [];

  // Apply source filter client-side
  const conversations = selectedSource === 'all'
    ? allConversations
    : allConversations.filter(c => c.source === selectedSource);

  // Stats from API
  const apiStats = qaData?.stats || {};
  const stats = {
    total: apiStats.total || conversations.length,
    calls: apiStats.calls || conversations.filter(c => c.type === 'call').length,
    emails: apiStats.emails || conversations.filter(c => c.type === 'email').length,
    testCalls: apiStats.testCalls || conversations.filter(c => c.isTestCall).length,
    withTranscripts: apiStats.withTranscripts || conversations.filter(c => c.transcript || c.transcriptTurns).length,
  };

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
        <Button variant="outline" onClick={() => refetch()}>
          <RefreshCw className="h-4 w-4 mr-2" />
          Refresh
        </Button>
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
                <p className="text-xs text-muted-foreground">Calls</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2">
              <Mail className="h-5 w-5 text-blue-500" />
              <div>
                <p className="text-2xl font-bold">{stats.emails}</p>
                <p className="text-xs text-muted-foreground">Emails</p>
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
              <FileText className="h-5 w-5 text-green-500" />
              <div>
                <p className="text-2xl font-bold">{stats.withTranscripts}</p>
                <p className="text-xs text-muted-foreground">With Transcripts</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

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
              {conversations.length} conversation{conversations.length !== 1 ? 's' : ''} with transcripts
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
                  {selectedConversation.callSummary && (
                    <div className="bg-muted/50 p-3 rounded-lg">
                      <h4 className="text-sm font-medium mb-1">Call Summary</h4>
                      <p className="text-sm text-muted-foreground">{selectedConversation.callSummary}</p>
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

                  {/* Recording URL */}
                  {selectedConversation.recordingUrl && (
                    <div className="bg-muted/50 p-3 rounded-lg">
                      <h4 className="text-sm font-medium mb-2">Recording</h4>
                      <audio controls className="w-full" src={selectedConversation.recordingUrl}>
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
