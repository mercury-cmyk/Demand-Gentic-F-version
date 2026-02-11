import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ClientPortalLayout } from "@/components/client-portal/layout/client-portal-layout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
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
} from "lucide-react";

const getToken = () => localStorage.getItem('clientPortalToken');

const formatDuration = (seconds: number) => {
  const minutes = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${minutes}:${secs.toString().padStart(2, '0')}`;
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
    ? Math.round(conversations.reduce((sum, c) => sum + (c.qualityScore || 0), 0) / conversations.filter(c => c.qualityScore).length)
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
            <p className="text-foreground/70 mt-2">Review call transcripts and quality analysis</p>
          </div>
        </div>

        {/* Filter */}
        <Card>
          <CardContent className="pt-6">
            <div className="max-w-sm">
              <label className="text-sm font-medium mb-2 block">Campaign</label>
              <Select value={selectedCampaign} onValueChange={setSelectedCampaign}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
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
                <CardDescription>Click on a row to view the transcript</CardDescription>
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
                      <div key={conv.id} className="border rounded-lg">
                        <div
                          className="flex items-center justify-between p-4 cursor-pointer hover:bg-muted/50 transition-colors"
                          onClick={() => setExpandedId(expandedId === conv.id ? null : conv.id)}
                        >
                          <div className="flex items-center gap-4">
                            <div>
                              <p className="font-medium">{conv.contactName}</p>
                              <p className="text-sm text-muted-foreground">{conv.accountName} - {conv.campaignName}</p>
                            </div>
                          </div>
                          <div className="flex items-center gap-3">
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
                            <div className="flex items-center gap-1 text-sm text-muted-foreground">
                              <Clock className="h-3 w-3" />
                              {formatDuration(conv.duration || 0)}
                            </div>
                            <span className="text-sm text-muted-foreground">
                              {new Date(conv.createdAt).toLocaleDateString()}
                            </span>
                            {expandedId === conv.id ? (
                              <ChevronUp className="h-4 w-4" />
                            ) : (
                              <ChevronDown className="h-4 w-4" />
                            )}
                          </div>
                        </div>

                        {expandedId === conv.id && (
                          <div className="border-t px-4 py-4 bg-muted/20">
                            {conv.transcript ? (
                              <ScrollArea className="h-[300px]">
                                <pre className="whitespace-pre-wrap text-sm font-mono leading-relaxed">
                                  {conv.transcript}
                                </pre>
                              </ScrollArea>
                            ) : (
                              <p className="text-sm text-muted-foreground italic">No transcript available</p>
                            )}
                            {conv.analysis && (
                              <div className="mt-4 grid grid-cols-2 md:grid-cols-4 gap-3">
                                {conv.analysis.identityConfirmation !== undefined && (
                                  <div className="p-3 bg-muted/50 rounded-lg">
                                    <p className="text-xs text-muted-foreground">Identity Confirmation</p>
                                    <p className="font-semibold">{conv.analysis.identityConfirmation ? 'Yes' : 'No'}</p>
                                  </div>
                                )}
                                {conv.analysis.pitchDelivery !== undefined && (
                                  <div className="p-3 bg-muted/50 rounded-lg">
                                    <p className="text-xs text-muted-foreground">Pitch Delivery</p>
                                    <p className="font-semibold">{conv.analysis.pitchDelivery}/10</p>
                                  </div>
                                )}
                                {conv.analysis.objectionHandling !== undefined && (
                                  <div className="p-3 bg-muted/50 rounded-lg">
                                    <p className="text-xs text-muted-foreground">Objection Handling</p>
                                    <p className="font-semibold">{conv.analysis.objectionHandling}/10</p>
                                  </div>
                                )}
                                {conv.analysis.closingAttempt !== undefined && (
                                  <div className="p-3 bg-muted/50 rounded-lg">
                                    <p className="text-xs text-muted-foreground">Closing Attempt</p>
                                    <p className="font-semibold">{conv.analysis.closingAttempt ? 'Yes' : 'No'}</p>
                                  </div>
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
