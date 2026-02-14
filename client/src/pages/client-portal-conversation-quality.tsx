import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ClientPortalLayout } from "@/components/client-portal/layout/client-portal-layout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  MessageSquareText,
  Loader2,
  Phone,
  Clock,
  Star,
  ChevronDown,
  ChevronUp,
  CheckCircle,
  XCircle,
  AlertTriangle,
  Lightbulb,
  BarChart3,
  Mic,
} from "lucide-react";

const getToken = () => localStorage.getItem('clientPortalToken');

const formatDuration = (seconds: number) => {
  const minutes = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${minutes}:${secs.toString().padStart(2, '0')}`;
};

const getScoreColor = (score: number) => {
  if (score >= 80) return 'text-green-600';
  if (score >= 60) return 'text-amber-600';
  return 'text-red-600';
};

const getScoreBarColor = (score: number) => {
  if (score >= 80) return '[&>div]:bg-green-500';
  if (score >= 60) return '[&>div]:bg-amber-500';
  return '[&>div]:bg-red-500';
};

const getSentimentBadge = (sentiment: string | null) => {
  if (!sentiment) return null;
  const s = sentiment.toLowerCase();
  if (s === 'positive') return <Badge className="bg-green-100 text-green-700 border-green-200">Positive</Badge>;
  if (s === 'negative') return <Badge className="bg-red-100 text-red-700 border-red-200">Negative</Badge>;
  return <Badge className="bg-gray-100 text-gray-700 border-gray-200">Neutral</Badge>;
};

interface Conversation {
  id: string;
  campaignId: string;
  campaignName: string;
  contactName: string;
  accountName: string;
  disposition: string;
  duration: number;
  qualityScore: number | null;
  qaStatus: string | null;
  transcript: string | null;
  analysis: any | null;
  createdAt: string;
  // Post-call quality dimensions
  engagementScore: number | null;
  clarityScore: number | null;
  empathyScore: number | null;
  objectionHandlingScore: number | null;
  qualificationScore: number | null;
  closingScore: number | null;
  flowComplianceScore: number | null;
  campaignAlignmentScore: number | null;
  sentiment: string | null;
  engagementLevel: string | null;
  issues: string[] | null;
  recommendations: string[] | null;
  hasRecording: boolean;
  recordingS3Key: string | null;
}

function QualityDimensionBar({ label, score }: { label: string; score: number | null }) {
  if (score === null || score === undefined) return null;
  const pct = Math.round(score);
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-foreground/80">{label}</span>
        <span className={`text-xs font-bold ${getScoreColor(pct)}`}>{pct}%</span>
      </div>
      <Progress value={pct} className={`h-2 ${getScoreBarColor(pct)}`} />
    </div>
  );
}

function hasAnyQualityDimension(conv: Conversation): boolean {
  return [
    conv.engagementScore, conv.clarityScore, conv.empathyScore,
    conv.objectionHandlingScore, conv.qualificationScore, conv.closingScore,
    conv.flowComplianceScore, conv.campaignAlignmentScore,
  ].some(s => s !== null && s !== undefined);
}

export default function ClientPortalConversationQuality() {
  const [selectedCampaign, setSelectedCampaign] = useState<string>('all');
  const [expandedId, setExpandedId] = useState<string | null>(null);

  // Fetch campaigns
  const { data: campaignsData } = useQuery({
    queryKey: ['client-portal-campaigns-for-quality'],
    queryFn: async () => {
      const res = await fetch('/api/client-portal/campaigns', {
        headers: { Authorization: `Bearer ${getToken()}` },
      });
      if (!res.ok) throw new Error('Failed to fetch campaigns');
      return res.json();
    },
  });

  const campaigns = [
    ...(campaignsData?.verificationCampaigns || []),
    ...(campaignsData?.regularCampaigns || []),
  ];

  // Fetch conversations
  const { data: conversations = [], isLoading } = useQuery<Conversation[]>({
    queryKey: ['client-portal-conversations', selectedCampaign],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (selectedCampaign !== 'all') params.append('campaignId', selectedCampaign);
      const res = await fetch(`/api/client-portal/conversations?${params}`, {
        headers: { Authorization: `Bearer ${getToken()}` },
      });
      if (!res.ok) throw new Error('Failed to fetch conversations');
      return res.json();
    },
  });

  const avgQuality = conversations.length > 0
    ? Math.round(conversations.reduce((sum, c) => sum + (c.qualityScore || 0), 0) / (conversations.filter(c => c.qualityScore).length || 1))
    : 0;

  const qaApproved = conversations.filter(c => c.qaStatus === 'approved').length;
  const qaRejected = conversations.filter(c => c.qaStatus === 'rejected').length;

  return (
    <ClientPortalLayout>
      <div className="space-y-6 pb-8">
        {/* Header */}
        <div className="bg-gradient-to-br from-amber-500/10 via-primary/5 to-transparent rounded-2xl p-6 md:p-8 border border-amber-500/20 relative overflow-hidden">
          <div className="absolute top-0 right-0 w-64 h-64 bg-amber-500/10 rounded-full blur-3xl -translate-y-1/2 translate-x-1/2" />
          <div className="relative z-10">
            <div className="flex items-center gap-3 mb-2">
              <div className="h-12 w-12 rounded-xl bg-gradient-to-br from-amber-500 to-amber-600 flex items-center justify-center shadow-lg">
                <MessageSquareText className="h-6 w-6 text-white" />
              </div>
              <h1 className="text-2xl md:text-3xl font-bold tracking-tight">Conversation Quality</h1>
            </div>
            <p className="text-foreground/70 mt-2">Review call transcripts, quality scores, and AI-powered analysis</p>
          </div>
        </div>

        {/* Filter */}
        <Card className="bg-card text-card-foreground">
          <CardContent className="pt-6">
            <div className="max-w-sm">
              <label className="text-sm font-medium mb-2 block text-foreground">Campaign</label>
              <Select value={selectedCampaign} onValueChange={setSelectedCampaign}>
                <SelectTrigger className="bg-background border-input text-foreground">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-popover text-popover-foreground border-border">
                  <SelectItem value="all">All Campaigns</SelectItem>
                  {campaigns.map((c: any) => (
                    <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>

        {isLoading ? (
          <div className="flex justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        ) : (
          <>
            {/* Summary Stats */}
            <div className="grid gap-4 md:grid-cols-4">
              <Card>
                <CardHeader className="flex flex-row items-center justify-between pb-2">
                  <CardTitle className="text-sm font-medium">Total Conversations</CardTitle>
                  <Phone className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{conversations.length}</div>
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="flex flex-row items-center justify-between pb-2">
                  <CardTitle className="text-sm font-medium">Avg Quality Score</CardTitle>
                  <Star className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{avgQuality}%</div>
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="flex flex-row items-center justify-between pb-2">
                  <CardTitle className="text-sm font-medium">QA Approved</CardTitle>
                  <CheckCircle className="h-4 w-4 text-green-500" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold text-green-600">{qaApproved}</div>
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="flex flex-row items-center justify-between pb-2">
                  <CardTitle className="text-sm font-medium">QA Rejected</CardTitle>
                  <XCircle className="h-4 w-4 text-red-500" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold text-red-600">{qaRejected}</div>
                </CardContent>
              </Card>
            </div>

            {/* Conversations List */}
            <Card>
              <CardHeader>
                <CardTitle>Conversations</CardTitle>
                <CardDescription>Click on a row to view quality analysis and transcript</CardDescription>
              </CardHeader>
              <CardContent>
                {conversations.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-12 text-center">
                    <MessageSquareText className="h-12 w-12 text-muted-foreground/50 mb-4" />
                    <h3 className="text-lg font-semibold">No Conversations Yet</h3>
                    <p className="text-muted-foreground mt-2">
                      Conversation quality data will appear once calls are made.
                    </p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {conversations.map((conv) => (
                      <div key={conv.id} className="border border-border rounded-lg overflow-hidden">
                        {/* Row header */}
                        <div
                          className="flex items-center justify-between p-4 cursor-pointer hover:bg-accent/50 transition-colors bg-card text-card-foreground"
                          onClick={() => setExpandedId(expandedId === conv.id ? null : conv.id)}
                        >
                          <div className="flex items-center gap-4 min-w-0">
                            <div className="min-w-0">
                              <p className="font-medium truncate">{conv.contactName}</p>
                              <p className="text-sm text-muted-foreground truncate">{conv.accountName} - {conv.campaignName}</p>
                            </div>
                          </div>
                          <div className="flex items-center gap-3 flex-shrink-0">
                            <Badge variant="outline" className="capitalize">
                              {conv.disposition?.replace(/_/g, ' ') || 'N/A'}
                            </Badge>
                            {conv.qualityScore !== null && (
                              <Badge variant={conv.qualityScore >= 70 ? 'default' : 'destructive'}>
                                {conv.qualityScore}%
                              </Badge>
                            )}
                            {conv.qaStatus && (
                              <Badge variant={conv.qaStatus === 'approved' ? 'default' : 'destructive'}>
                                {conv.qaStatus}
                              </Badge>
                            )}
                            {conv.hasRecording && (
                              <Mic className="h-3.5 w-3.5 text-muted-foreground" />
                            )}
                            <div className="flex items-center gap-1 text-sm text-muted-foreground">
                              <Clock className="h-3 w-3" />
                              {formatDuration(conv.duration || 0)}
                            </div>
                            <span className="text-sm text-muted-foreground">
                              {new Date(conv.createdAt).toLocaleDateString()}
                            </span>
                            {expandedId === conv.id ? (
                              <ChevronUp className="h-4 w-4 text-muted-foreground" />
                            ) : (
                              <ChevronDown className="h-4 w-4 text-muted-foreground" />
                            )}
                          </div>
                        </div>

                        {/* Expanded content */}
                        {expandedId === conv.id && (
                          <div className="border-t border-border bg-card text-card-foreground">
                            {hasAnyQualityDimension(conv) || conv.sentiment || conv.issues?.length || conv.recommendations?.length ? (
                              <Tabs defaultValue="analysis" className="w-full">
                                <div className="px-4 pt-3 border-b border-border">
                                  <TabsList className="bg-muted">
                                    <TabsTrigger value="analysis" className="data-[state=active]:bg-background">
                                      <BarChart3 className="h-3.5 w-3.5 mr-1.5" />
                                      Analysis
                                    </TabsTrigger>
                                    <TabsTrigger value="transcript" className="data-[state=active]:bg-background">
                                      <MessageSquareText className="h-3.5 w-3.5 mr-1.5" />
                                      Transcript
                                    </TabsTrigger>
                                  </TabsList>
                                </div>

                                {/* Analysis Tab */}
                                <TabsContent value="analysis" className="mt-0 p-4">
                                  <div className="space-y-5">
                                    {/* Overall Score + Sentiment */}
                                    <div className="flex items-center gap-4 flex-wrap">
                                      {conv.qualityScore !== null && (
                                        <div className="flex items-center gap-2">
                                          <span className="text-sm font-medium text-muted-foreground">Overall:</span>
                                          <span className={`text-2xl font-bold ${getScoreColor(conv.qualityScore)}`}>
                                            {conv.qualityScore}%
                                          </span>
                                        </div>
                                      )}
                                      {getSentimentBadge(conv.sentiment)}
                                      {conv.engagementLevel && (
                                        <Badge variant="outline" className="capitalize">
                                          {conv.engagementLevel} Engagement
                                        </Badge>
                                      )}
                                    </div>

                                    {/* Quality Dimensions */}
                                    {hasAnyQualityDimension(conv) && (
                                      <div>
                                        <h4 className="text-sm font-semibold mb-3 text-foreground">Quality Dimensions</h4>
                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-3">
                                          <QualityDimensionBar label="Engagement" score={conv.engagementScore} />
                                          <QualityDimensionBar label="Clarity" score={conv.clarityScore} />
                                          <QualityDimensionBar label="Empathy" score={conv.empathyScore} />
                                          <QualityDimensionBar label="Objection Handling" score={conv.objectionHandlingScore} />
                                          <QualityDimensionBar label="Qualification" score={conv.qualificationScore} />
                                          <QualityDimensionBar label="Closing" score={conv.closingScore} />
                                          <QualityDimensionBar label="Flow Compliance" score={conv.flowComplianceScore} />
                                          <QualityDimensionBar label="Campaign Alignment" score={conv.campaignAlignmentScore} />
                                        </div>
                                      </div>
                                    )}

                                    {/* Issues */}
                                    {conv.issues && conv.issues.length > 0 && (
                                      <div>
                                        <h4 className="text-sm font-semibold mb-2 flex items-center gap-1.5 text-foreground">
                                          <AlertTriangle className="h-3.5 w-3.5 text-amber-500" />
                                          Issues Identified
                                        </h4>
                                        <ul className="space-y-1">
                                          {conv.issues.map((issue, i) => (
                                            <li key={i} className="text-sm text-muted-foreground flex items-start gap-2">
                                              <span className="text-amber-500 mt-1.5 shrink-0">&#8226;</span>
                                              {issue}
                                            </li>
                                          ))}
                                        </ul>
                                      </div>
                                    )}

                                    {/* Recommendations */}
                                    {conv.recommendations && conv.recommendations.length > 0 && (
                                      <div>
                                        <h4 className="text-sm font-semibold mb-2 flex items-center gap-1.5 text-foreground">
                                          <Lightbulb className="h-3.5 w-3.5 text-blue-500" />
                                          Recommendations
                                        </h4>
                                        <ul className="space-y-1">
                                          {conv.recommendations.map((rec, i) => (
                                            <li key={i} className="text-sm text-muted-foreground flex items-start gap-2">
                                              <span className="text-blue-500 mt-1.5 shrink-0">&#8226;</span>
                                              {rec}
                                            </li>
                                          ))}
                                        </ul>
                                      </div>
                                    )}

                                    {/* Fallback to legacy analysis if no quality dimensions */}
                                    {!hasAnyQualityDimension(conv) && conv.analysis && (
                                      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                                        {conv.analysis.identityConfirmation !== undefined && (
                                          <div className="p-3 bg-muted rounded-lg">
                                            <p className="text-xs text-muted-foreground">Identity Confirmation</p>
                                            <p className="font-semibold text-foreground">{conv.analysis.identityConfirmation ? 'Yes' : 'No'}</p>
                                          </div>
                                        )}
                                        {conv.analysis.pitchDelivery !== undefined && (
                                          <div className="p-3 bg-muted rounded-lg">
                                            <p className="text-xs text-muted-foreground">Pitch Delivery</p>
                                            <p className="font-semibold text-foreground">{conv.analysis.pitchDelivery}/10</p>
                                          </div>
                                        )}
                                        {conv.analysis.objectionHandling !== undefined && (
                                          <div className="p-3 bg-muted rounded-lg">
                                            <p className="text-xs text-muted-foreground">Objection Handling</p>
                                            <p className="font-semibold text-foreground">{conv.analysis.objectionHandling}/10</p>
                                          </div>
                                        )}
                                        {conv.analysis.closingAttempt !== undefined && (
                                          <div className="p-3 bg-muted rounded-lg">
                                            <p className="text-xs text-muted-foreground">Closing Attempt</p>
                                            <p className="font-semibold text-foreground">{conv.analysis.closingAttempt ? 'Yes' : 'No'}</p>
                                          </div>
                                        )}
                                      </div>
                                    )}
                                  </div>
                                </TabsContent>

                                {/* Transcript Tab */}
                                <TabsContent value="transcript" className="mt-0 p-4">
                                  {conv.transcript ? (
                                    <ScrollArea className="h-[300px]">
                                      <pre className="whitespace-pre-wrap text-sm font-mono leading-relaxed text-foreground">
                                        {conv.transcript}
                                      </pre>
                                    </ScrollArea>
                                  ) : (
                                    <p className="text-sm text-muted-foreground italic py-4">No transcript available</p>
                                  )}
                                </TabsContent>
                              </Tabs>
                            ) : (
                              /* No analysis data — just show transcript */
                              <div className="p-4">
                                {conv.transcript ? (
                                  <ScrollArea className="h-[300px]">
                                    <pre className="whitespace-pre-wrap text-sm font-mono leading-relaxed text-foreground">
                                      {conv.transcript}
                                    </pre>
                                  </ScrollArea>
                                ) : (
                                  <p className="text-sm text-muted-foreground italic">No transcript available</p>
                                )}
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </>
        )}
      </div>
    </ClientPortalLayout>
  );
}
