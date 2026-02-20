import { useQuery } from '@tanstack/react-query';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Loader2, User, Building2, Mail, Phone, Linkedin,
  Clock, Calendar, Target, FileText, Headphones, Copy, ExternalLink,
  CheckCircle, AlertCircle, Star,
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { TranscriptViewer } from './transcript-viewer';
import { RecordingPlayer } from './recording-player';
import { PushToShowcaseButton } from '@/components/showcase-calls/push-to-showcase-button';

interface LeadDetail {
  id: string;
  callSessionId?: string | null;
  hasRecording?: boolean;
  contactName: string | null;
  contactEmail: string | null;
  contactPhone: string | null;
  contactTitle: string | null;
  linkedinUrl: string | null;
  accountName: string | null;
  accountIndustry: string | null;
  campaignId: string | null;
  campaignName: string | null;
  qaStatus: string | null;
  aiScore: number | null;
  aiAnalysis: any;
  aiQualificationStatus: string | null;
  qaData: any;
  callDuration: number | null;
  dialedNumber: string | null;
  recordingUrl: string | null;
  transcript: string | null;
  structuredTranscript: any;
  createdAt: string | null;
  approvedAt: string | null;
  notes: string | null;
}

interface LeadDetailModalProps {
  leadId: string | null;
  open: boolean;
  onClose: () => void;
}

export function LeadDetailModal({ leadId, open, onClose }: LeadDetailModalProps) {
  const { toast } = useToast();
  const getToken = () => localStorage.getItem('clientPortalToken');

  const { data: lead, isLoading, error } = useQuery<LeadDetail>({
    queryKey: ['client-portal-lead-detail', leadId],
    queryFn: async () => {
      const res = await fetch(`/api/client-portal/qualified-leads/${leadId}`, {
        headers: { Authorization: `Bearer ${getToken()}` },
      });
      if (!res.ok) throw new Error('Failed to fetch lead details');
      return res.json();
    },
    enabled: !!leadId && open,
  });

  const copyToClipboard = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    toast({ title: `${label} copied to clipboard` });
  };

  const formatDuration = (seconds: number | null) => {
    if (!seconds) return '-';
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}m ${secs}s`;
  };

  const getScoreColor = (score: number | null) => {
    if (!score) return 'text-gray-500';
    if (score >= 80) return 'text-green-600';
    if (score >= 60) return 'text-yellow-600';
    return 'text-red-600';
  };

  const getQualificationBadge = (status: string | null) => {
    switch (status?.toLowerCase()) {
      case 'qualified':
        return <Badge className="bg-green-100 text-green-800"><CheckCircle className="h-3 w-3 mr-1" /> Qualified</Badge>;
      case 'not_qualified':
        return <Badge className="bg-red-100 text-red-800"><AlertCircle className="h-3 w-3 mr-1" /> Not Qualified</Badge>;
      case 'needs_review':
        return <Badge className="bg-yellow-100 text-yellow-800">Needs Review</Badge>;
      default:
        return <Badge variant="outline">{status || 'Unknown'}</Badge>;
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-4xl max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <User className="h-5 w-5" />
            Lead Details
          </DialogTitle>
          <DialogDescription>
            Complete information about this qualified lead
          </DialogDescription>
        </DialogHeader>

        {isLoading ? (
          <div className="flex justify-center items-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        ) : error || !lead ? (
          <div className="text-center py-12 text-muted-foreground">
            <AlertCircle className="h-10 w-10 mx-auto mb-4" />
            <p>Failed to load lead details</p>
          </div>
        ) : (
          <div className="flex-1 overflow-hidden">
            <Tabs defaultValue="overview" className="h-full flex flex-col">
              <TabsList className="grid w-full grid-cols-3">
                <TabsTrigger value="overview">Overview</TabsTrigger>
                <TabsTrigger value="transcript" disabled={!lead.transcript}>
                  <FileText className="h-4 w-4 mr-2" />
                  Transcript
                </TabsTrigger>
                <TabsTrigger value="recording" disabled={!lead.hasRecording}>
                  <Headphones className="h-4 w-4 mr-2" />
                  Recording
                </TabsTrigger>
              </TabsList>

              <ScrollArea className="flex-1 mt-4">
                <TabsContent value="overview" className="mt-0 space-y-4">
                  {/* Contact & Company Info */}
                  <div className="grid md:grid-cols-2 gap-4">
                    <Card>
                      <CardHeader className="pb-3">
                        <CardTitle className="text-base flex items-center gap-2">
                          <User className="h-4 w-4" />
                          Contact Information
                        </CardTitle>
                      </CardHeader>
                      <CardContent className="space-y-3">
                        <div className="flex items-start justify-between">
                          <div>
                            <p className="text-lg font-semibold">{lead.contactName || 'Unknown'}</p>
                            {lead.contactTitle && (
                              <p className="text-sm text-muted-foreground">{lead.contactTitle}</p>
                            )}
                          </div>
                        </div>

                        {lead.contactEmail && (
                          <div className="flex items-center gap-2 group">
                            <Mail className="h-4 w-4 text-muted-foreground" />
                            <span className="text-sm">{lead.contactEmail}</span>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="opacity-0 group-hover:opacity-100 h-6 w-6 p-0"
                              onClick={() => copyToClipboard(lead.contactEmail!, 'Email')}
                            >
                              <Copy className="h-3 w-3" />
                            </Button>
                          </div>
                        )}

                        {lead.contactPhone && (
                          <div className="flex items-center gap-2 group">
                            <Phone className="h-4 w-4 text-muted-foreground" />
                            <span className="text-sm">{lead.contactPhone}</span>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="opacity-0 group-hover:opacity-100 h-6 w-6 p-0"
                              onClick={() => copyToClipboard(lead.contactPhone!, 'Phone')}
                            >
                              <Copy className="h-3 w-3" />
                            </Button>
                          </div>
                        )}

                        {lead.dialedNumber && (
                          <div className="flex items-center gap-2 group">
                            <Phone className="h-4 w-4 text-muted-foreground" />
                            <span className="text-sm text-muted-foreground">
                              Dialed: {lead.dialedNumber}
                            </span>
                          </div>
                        )}

                        {lead.linkedinUrl && (
                          <div className="flex items-center gap-2">
                            <Linkedin className="h-4 w-4 text-blue-600" />
                            <a
                              href={lead.linkedinUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-sm text-blue-600 hover:underline flex items-center gap-1"
                            >
                              LinkedIn Profile
                              <ExternalLink className="h-3 w-3" />
                            </a>
                          </div>
                        )}
                      </CardContent>
                    </Card>

                    <Card>
                      <CardHeader className="pb-3">
                        <CardTitle className="text-base flex items-center gap-2">
                          <Building2 className="h-4 w-4" />
                          Company Information
                        </CardTitle>
                      </CardHeader>
                      <CardContent className="space-y-3">
                        <div>
                          <p className="text-lg font-semibold">{lead.accountName || 'Unknown'}</p>
                          {lead.accountIndustry && (
                            <p className="text-sm text-muted-foreground">{lead.accountIndustry}</p>
                          )}
                        </div>

                        <Separator />

                        <div className="flex items-center gap-2">
                          <Target className="h-4 w-4 text-muted-foreground" />
                          <span className="text-sm">Campaign: {lead.campaignName || '-'}</span>
                        </div>
                      </CardContent>
                    </Card>
                  </div>

                  {/* Call & QA Info */}
                  <div className="grid md:grid-cols-2 gap-4">
                    <Card>
                      <CardHeader className="pb-3">
                        <CardTitle className="text-base flex items-center gap-2">
                          <Headphones className="h-4 w-4" />
                          Call Details
                        </CardTitle>
                      </CardHeader>
                      <CardContent className="space-y-3">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <Clock className="h-4 w-4 text-muted-foreground" />
                            <span className="text-sm">Duration</span>
                          </div>
                          <span className="font-medium">{formatDuration(lead.callDuration)}</span>
                        </div>

                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <FileText className="h-4 w-4 text-muted-foreground" />
                            <span className="text-sm">Transcript</span>
                          </div>
                          {lead.transcript ? (
                            <Badge className="bg-green-100 text-green-800">Available</Badge>
                          ) : (
                            <Badge variant="outline">Not Available</Badge>
                          )}
                        </div>

                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <Headphones className="h-4 w-4 text-muted-foreground" />
                            <span className="text-sm">Recording</span>
                          </div>
                          {lead.hasRecording ? (
                            <Badge className="bg-green-100 text-green-800">Available</Badge>
                          ) : (
                            <Badge variant="outline">Not Available</Badge>
                          )}
                        </div>

                        <Separator />

                        {lead.callSessionId && (
                          <PushToShowcaseButton
                            callSessionId={lead.callSessionId}
                            contactName={lead.contactName}
                            sourceLabel="Lead Detail"
                            buttonProps={{ size: 'sm', variant: 'outline', className: 'w-full' }}
                          />
                        )}

                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <Calendar className="h-4 w-4 text-muted-foreground" />
                            <span className="text-sm">Created</span>
                          </div>
                          <span className="text-sm">
                            {lead.createdAt ? new Date(lead.createdAt).toLocaleDateString() : '-'}
                          </span>
                        </div>

                        {lead.approvedAt && (
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              <CheckCircle className="h-4 w-4 text-green-600" />
                              <span className="text-sm">Approved</span>
                            </div>
                            <span className="text-sm">
                              {new Date(lead.approvedAt).toLocaleDateString()}
                            </span>
                          </div>
                        )}
                      </CardContent>
                    </Card>

                    <Card>
                      <CardHeader className="pb-3">
                        <CardTitle className="text-base flex items-center gap-2">
                          <Star className="h-4 w-4" />
                          AI Analysis
                        </CardTitle>
                      </CardHeader>
                      <CardContent className="space-y-3">
                        <div className="flex items-center justify-between">
                          <span className="text-sm">AI Score</span>
                          <span className={`text-2xl font-bold ${getScoreColor(lead.aiScore)}`}>
                            {lead.aiScore ? lead.aiScore.toFixed(0) : '-'}
                          </span>
                        </div>

                        <div className="flex items-center justify-between">
                          <span className="text-sm">Qualification Status</span>
                          {getQualificationBadge(lead.aiQualificationStatus)}
                        </div>

                        {lead.aiAnalysis && (
                          <>
                            <Separator />
                            <div>
                              <p className="text-sm font-medium mb-2">AI Summary</p>
                              <p className="text-sm text-muted-foreground">
                                {typeof lead.aiAnalysis === 'string'
                                  ? lead.aiAnalysis
                                  : lead.aiAnalysis.summary || lead.aiAnalysis.analysis || 'No summary available'}
                              </p>
                            </div>
                          </>
                        )}

                        {lead.qaData && lead.qaData.key_points && (
                          <>
                            <Separator />
                            <div>
                              <p className="text-sm font-medium mb-2">Key Points</p>
                              <ul className="text-sm text-muted-foreground space-y-1">
                                {lead.qaData.key_points.slice(0, 5).map((point: string, i: number) => (
                                  <li key={i} className="flex items-start gap-2">
                                    <span className="text-primary">•</span>
                                    {point}
                                  </li>
                                ))}
                              </ul>
                            </div>
                          </>
                        )}
                      </CardContent>
                    </Card>
                  </div>

                  {/* Notes */}
                  {lead.notes && (
                    <Card>
                      <CardHeader className="pb-3">
                        <CardTitle className="text-base">Notes</CardTitle>
                      </CardHeader>
                      <CardContent>
                        <p className="text-sm text-muted-foreground whitespace-pre-wrap">{lead.notes}</p>
                      </CardContent>
                    </Card>
                  )}
                </TabsContent>

                <TabsContent value="transcript" className="mt-0">
                  {lead.transcript && (
                    <TranscriptViewer
                      transcript={lead.transcript}
                      structuredTranscript={lead.structuredTranscript}
                    />
                  )}
                </TabsContent>

                <TabsContent value="recording" className="mt-0">
                  {lead.hasRecording && (
                    <RecordingPlayer leadId={lead.id} recordingUrl={lead.recordingUrl} />
                  )}
                </TabsContent>
              </ScrollArea>
            </Tabs>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
