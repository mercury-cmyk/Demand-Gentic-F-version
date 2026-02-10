/**
 * UKEF Campaign Reports — Client Portal Component
 * 
 * Embeddable component (no layout wrapper) for the client portal dashboard.
 * Shows qualified leads with evidence: recordings, transcripts, QA analysis.
 * 
 * Only visible when the ukef_campaign_reports feature is enabled for the UKEF/Lightcast client.
 */
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Separator } from '@/components/ui/separator';
import { useToast } from '@/hooks/use-toast';
import {
  BarChart3,
  Users,
  FileText,
  Download,
  ChevronLeft,
  ChevronRight,
  Eye,
  Play,
  Award,
  TrendingUp,
  Calendar,
  Building2,
  Mail,
  Phone,
  Briefcase,
  Loader2,
  AlertCircle,
  CheckCircle2,
  Star,
  ArrowLeft,
} from 'lucide-react';

const getToken = () => localStorage.getItem('clientPortalToken');

// ─── Types ───────────────────────────────────────────────────────────────────

interface CampaignSummary {
  id: string;
  name: string;
  status: string;
  qualifiedLeadCount: number;
  totalLeadCount: number;
  avgAiScore: number | null;
  dateRange: {
    earliest: string | null;
    latest: string | null;
  };
}

interface SummaryMetrics {
  totalQualifiedLeads: number;
  totalCampaigns: number;
  avgAiScore: number | null;
  leadsByMonth: Array<{ month: string; count: number }>;
}

interface LeadListItem {
  id: string;
  contactName: string | null;
  companyName: string | null;
  jobTitle: string | null;
  email: string | null;
  qaStatus: string | null;
  aiScore: number | null;
  aiQualificationStatus: string | null;
  deliveredAt: string | null;
  createdAt: string;
  hasRecording: boolean;
  hasTranscript: boolean;
}

interface LeadDetail {
  id: string;
  contactName: string | null;
  companyName: string | null;
  jobTitle: string | null;
  email: string | null;
  phone: string | null;
  department: string | null;
  seniorityLevel: string | null;
  campaignId: string;
  campaignName: string;
  qaStatus: string | null;
  aiScore: number | null;
  aiQualificationStatus: string | null;
  aiAnalysis: Record<string, any> | null;
  qaData: Record<string, any> | null;
  deliveredAt: string | null;
  submittedAt: string | null;
  publishedAt: string | null;
  createdAt: string;
  hasRecording: boolean;
  recordingUrl: string | null;
  transcript: string | null;
  transcriptionStatus: string | null;
}

interface LeadsResponse {
  leads: LeadListItem[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

interface RecordingLink {
  leadId: string;
  url: string | null;
  expiresInSeconds: number;
  source: 'gcs' | 'direct' | 'none';
}

// ─── API helpers ─────────────────────────────────────────────────────────────

async function apiFetch<T>(path: string): Promise<T> {
  const res = await fetch(`/api/client-portal/ukef-reports${path}`, {
    headers: { Authorization: `Bearer ${getToken()}` },
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || body.message || `Request failed (${res.status})`);
  }
  return res.json();
}

// ─── Sub-components ──────────────────────────────────────────────────────────

function ScoreBadge({ score }: { score: number | null }) {
  if (score === null) return <Badge variant="outline">N/A</Badge>;
  const color = score >= 80 ? 'bg-green-100 text-green-800' :
    score >= 60 ? 'bg-yellow-100 text-yellow-800' :
      'bg-red-100 text-red-800';
  return <Badge className={color}>{score.toFixed(1)}</Badge>;
}

function QaStatusBadge({ status }: { status: string | null }) {
  if (!status) return null;
  const styles: Record<string, string> = {
    approved: 'bg-green-100 text-green-800',
    published: 'bg-blue-100 text-blue-800',
    rejected: 'bg-red-100 text-red-800',
    under_review: 'bg-yellow-100 text-yellow-800',
    new: 'bg-gray-100 text-gray-800',
  };
  return (
    <Badge className={styles[status] || 'bg-gray-100 text-gray-800'}>
      {status.replace(/_/g, ' ')}
    </Badge>
  );
}

function formatDate(dateStr: string | null): string {
  if (!dateStr) return '—';
  try {
    return new Date(dateStr).toLocaleDateString('en-GB', {
      day: 'numeric', month: 'short', year: 'numeric',
    });
  } catch { return dateStr; }
}

// ─── Summary Cards ───────────────────────────────────────────────────────────

function SummaryCards({ metrics }: { metrics: SummaryMetrics }) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
      <Card>
        <CardContent className="pt-6">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-green-100 rounded-lg">
              <Users className="w-5 h-5 text-green-700" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Qualified Leads</p>
              <p className="text-2xl font-bold">{metrics.totalQualifiedLeads}</p>
            </div>
          </div>
        </CardContent>
      </Card>
      <Card>
        <CardContent className="pt-6">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-blue-100 rounded-lg">
              <BarChart3 className="w-5 h-5 text-blue-700" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Active Campaigns</p>
              <p className="text-2xl font-bold">{metrics.totalCampaigns}</p>
            </div>
          </div>
        </CardContent>
      </Card>
      <Card>
        <CardContent className="pt-6">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-purple-100 rounded-lg">
              <TrendingUp className="w-5 h-5 text-purple-700" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Avg AI Score</p>
              <p className="text-2xl font-bold">
                {metrics.avgAiScore !== null ? metrics.avgAiScore.toFixed(1) : '—'}
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

// ─── Monthly Chart ───────────────────────────────────────────────────────────

function MonthlyChart({ data }: { data: Array<{ month: string; count: number }> }) {
  if (data.length === 0) return null;
  const maxCount = Math.max(...data.map(d => d.count), 1);

  return (
    <Card className="mb-6">
      <CardHeader>
        <CardTitle className="text-lg">Leads by Month</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="flex items-end gap-2 h-32">
          {data.map(({ month, count }) => (
            <div key={month} className="flex flex-col items-center flex-1">
              <span className="text-xs text-muted-foreground mb-1">{count}</span>
              <div
                className="w-full bg-blue-500 rounded-t min-h-[4px]"
                style={{ height: `${(count / maxCount) * 100}%` }}
              />
              <span className="text-xs text-muted-foreground mt-1">
                {month.slice(5)}
              </span>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

// ─── Campaign Table ──────────────────────────────────────────────────────────

function CampaignTable({
  campaigns,
  onSelectCampaign,
}: {
  campaigns: CampaignSummary[];
  onSelectCampaign: (id: string) => void;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">Campaigns</CardTitle>
        <CardDescription>Click a campaign to view qualified leads</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left text-muted-foreground">
                <th className="pb-2 font-medium">Campaign</th>
                <th className="pb-2 font-medium text-center">Status</th>
                <th className="pb-2 font-medium text-center">Qualified</th>
                <th className="pb-2 font-medium text-center">Avg Score</th>
                <th className="pb-2 font-medium text-center">Date Range</th>
                <th className="pb-2 font-medium text-center">Action</th>
              </tr>
            </thead>
            <tbody>
              {campaigns.map(c => (
                <tr key={c.id} className="border-b hover:bg-muted/50">
                  <td className="py-3 font-medium">{c.name}</td>
                  <td className="py-3 text-center">
                    <Badge variant="outline">{c.status}</Badge>
                  </td>
                  <td className="py-3 text-center font-semibold">{c.qualifiedLeadCount}</td>
                  <td className="py-3 text-center">
                    <ScoreBadge score={c.avgAiScore} />
                  </td>
                  <td className="py-3 text-center text-xs text-muted-foreground">
                    {c.dateRange.earliest ? (
                      <>
                        {formatDate(c.dateRange.earliest)} — {formatDate(c.dateRange.latest)}
                      </>
                    ) : '—'}
                  </td>
                  <td className="py-3 text-center">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => onSelectCampaign(c.id)}
                      disabled={c.qualifiedLeadCount === 0}
                    >
                      <Eye className="w-4 h-4 mr-1" /> View Leads
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}

// ─── Lead List ───────────────────────────────────────────────────────────────

function LeadList({
  campaignId,
  campaignName,
  onBack,
  onSelectLead,
}: {
  campaignId: string;
  campaignName: string;
  onBack: () => void;
  onSelectLead: (id: string) => void;
}) {
  const [page, setPage] = useState(1);
  const pageSize = 25;

  const { data, isLoading, error } = useQuery<LeadsResponse>({
    queryKey: ['ukef-leads', campaignId, page, pageSize],
    queryFn: () => apiFetch(`/campaigns/${campaignId}/leads?page=${page}&pageSize=${pageSize}`),
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error) {
    return (
      <Card>
        <CardContent className="pt-6">
          <div className="flex items-center gap-2 text-red-600">
            <AlertCircle className="w-5 h-5" />
            <span>Failed to load leads: {(error as Error).message}</span>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (!data) return null;

  return (
    <div>
      <div className="flex items-center gap-3 mb-4">
        <Button variant="ghost" size="sm" onClick={onBack}>
          <ArrowLeft className="w-4 h-4 mr-1" /> Back
        </Button>
        <div>
          <h3 className="text-lg font-semibold">{campaignName}</h3>
          <p className="text-sm text-muted-foreground">
            {data.total} qualified lead{data.total !== 1 ? 's' : ''}
          </p>
        </div>
      </div>

      <Card>
        <CardContent className="pt-4">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-muted-foreground">
                  <th className="pb-2 font-medium">Contact</th>
                  <th className="pb-2 font-medium">Company</th>
                  <th className="pb-2 font-medium text-center">QA Status</th>
                  <th className="pb-2 font-medium text-center">AI Score</th>
                  <th className="pb-2 font-medium text-center">Evidence</th>
                  <th className="pb-2 font-medium text-center">Delivered</th>
                  <th className="pb-2 font-medium text-center">Action</th>
                </tr>
              </thead>
              <tbody>
                {data.leads.map(lead => (
                  <tr key={lead.id} className="border-b hover:bg-muted/50">
                    <td className="py-3">
                      <div>
                        <div className="font-medium">{lead.contactName || '—'}</div>
                        <div className="text-xs text-muted-foreground">{lead.jobTitle || ''}</div>
                      </div>
                    </td>
                    <td className="py-3 text-muted-foreground">{lead.companyName || '—'}</td>
                    <td className="py-3 text-center">
                      <QaStatusBadge status={lead.qaStatus} />
                    </td>
                    <td className="py-3 text-center">
                      <ScoreBadge score={lead.aiScore} />
                    </td>
                    <td className="py-3 text-center">
                      <div className="flex items-center justify-center gap-1">
                        {lead.hasRecording && (
                          <Badge variant="outline" className="text-xs">
                            <Play className="w-3 h-3 mr-0.5" /> Audio
                          </Badge>
                        )}
                        {lead.hasTranscript && (
                          <Badge variant="outline" className="text-xs">
                            <FileText className="w-3 h-3 mr-0.5" /> Text
                          </Badge>
                        )}
                      </div>
                    </td>
                    <td className="py-3 text-center text-xs text-muted-foreground">
                      {formatDate(lead.deliveredAt)}
                    </td>
                    <td className="py-3 text-center">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => onSelectLead(lead.id)}
                      >
                        <Eye className="w-4 h-4 mr-1" /> Details
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {data.totalPages > 1 && (
            <div className="flex items-center justify-between mt-4 pt-4 border-t">
              <span className="text-sm text-muted-foreground">
                Page {data.page} of {data.totalPages} ({data.total} leads)
              </span>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page <= 1}
                  onClick={() => setPage(p => p - 1)}
                >
                  <ChevronLeft className="w-4 h-4" /> Previous
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page >= data.totalPages}
                  onClick={() => setPage(p => p + 1)}
                >
                  Next <ChevronRight className="w-4 h-4" />
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// ─── Lead Detail Dialog ──────────────────────────────────────────────────────

function LeadDetailDialog({
  leadId,
  open,
  onClose,
}: {
  leadId: string | null;
  open: boolean;
  onClose: () => void;
}) {
  const { toast } = useToast();
  const [recordingUrl, setRecordingUrl] = useState<string | null>(null);
  const [loadingRecording, setLoadingRecording] = useState(false);

  const { data: lead, isLoading } = useQuery<LeadDetail>({
    queryKey: ['ukef-lead-detail', leadId],
    queryFn: () => apiFetch(`/leads/${leadId}`),
    enabled: !!leadId && open,
  });

  const handleOpenRecording = async () => {
    if (!leadId) return;
    setLoadingRecording(true);
    try {
      const link = await apiFetch<RecordingLink>(`/leads/${leadId}/recording-link`);
      if (link.url) {
        setRecordingUrl(link.url);
        window.open(link.url, '_blank', 'noopener,noreferrer');
      } else {
        toast({
          title: 'No recording available',
          description: 'This lead does not have a recording file.',
          variant: 'destructive',
        });
      }
    } catch (err: any) {
      toast({
        title: 'Recording error',
        description: err.message || 'Failed to generate recording link',
        variant: 'destructive',
      });
    } finally {
      setLoadingRecording(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) { onClose(); setRecordingUrl(null); } }}>
      <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Lead Detail</DialogTitle>
          <DialogDescription>
            {lead?.contactName || 'Loading...'} {lead?.companyName ? ` — ${lead.companyName}` : ''}
          </DialogDescription>
        </DialogHeader>

        {isLoading && (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="w-6 h-6 animate-spin" />
          </div>
        )}

        {lead && (
          <div className="space-y-6">
            {/* Contact Info */}
            <div>
              <h4 className="text-sm font-semibold text-muted-foreground mb-2">Contact Information</h4>
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div className="flex items-center gap-2">
                  <Users className="w-4 h-4 text-muted-foreground" />
                  <span>{lead.contactName || '—'}</span>
                </div>
                <div className="flex items-center gap-2">
                  <Building2 className="w-4 h-4 text-muted-foreground" />
                  <span>{lead.companyName || '—'}</span>
                </div>
                <div className="flex items-center gap-2">
                  <Briefcase className="w-4 h-4 text-muted-foreground" />
                  <span>{lead.jobTitle || '—'}</span>
                </div>
                <div className="flex items-center gap-2">
                  <Mail className="w-4 h-4 text-muted-foreground" />
                  <span>{lead.email || '—'}</span>
                </div>
                {lead.phone && (
                  <div className="flex items-center gap-2">
                    <Phone className="w-4 h-4 text-muted-foreground" />
                    <span>{lead.phone}</span>
                  </div>
                )}
                {lead.department && (
                  <div className="flex items-center gap-2">
                    <Building2 className="w-4 h-4 text-muted-foreground" />
                    <span>{lead.department}</span>
                  </div>
                )}
              </div>
            </div>

            <Separator />

            {/* Status & Scores */}
            <div>
              <h4 className="text-sm font-semibold text-muted-foreground mb-2">Quality Assessment</h4>
              <div className="flex flex-wrap gap-3 items-center">
                <div className="flex items-center gap-2">
                  <span className="text-sm text-muted-foreground">QA Status:</span>
                  <QaStatusBadge status={lead.qaStatus} />
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-sm text-muted-foreground">AI Score:</span>
                  <ScoreBadge score={lead.aiScore} />
                </div>
                {lead.aiQualificationStatus && (
                  <div className="flex items-center gap-2">
                    <span className="text-sm text-muted-foreground">AI Status:</span>
                    <Badge variant="outline">{lead.aiQualificationStatus}</Badge>
                  </div>
                )}
              </div>

              {/* AI Analysis */}
              {lead.aiAnalysis && Object.keys(lead.aiAnalysis).length > 0 && (
                <div className="mt-3">
                  <p className="text-sm font-medium mb-1">AI Analysis</p>
                  <div className="bg-muted/50 rounded-lg p-3 text-sm space-y-1">
                    {Object.entries(lead.aiAnalysis).map(([key, value]) => (
                      <div key={key} className="flex gap-2">
                        <span className="text-muted-foreground capitalize min-w-[120px]">
                          {key.replace(/_/g, ' ')}:
                        </span>
                        <span>{typeof value === 'object' ? JSON.stringify(value) : String(value)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <Separator />

            {/* Dates */}
            <div>
              <h4 className="text-sm font-semibold text-muted-foreground mb-2">Timeline</h4>
              <div className="grid grid-cols-2 gap-2 text-sm">
                <div className="flex items-center gap-2">
                  <Calendar className="w-4 h-4 text-muted-foreground" />
                  <span className="text-muted-foreground">Delivered:</span>
                  <span>{formatDate(lead.deliveredAt)}</span>
                </div>
                <div className="flex items-center gap-2">
                  <Calendar className="w-4 h-4 text-muted-foreground" />
                  <span className="text-muted-foreground">Created:</span>
                  <span>{formatDate(lead.createdAt)}</span>
                </div>
              </div>
            </div>

            <Separator />

            {/* Recording */}
            <div>
              <h4 className="text-sm font-semibold text-muted-foreground mb-2">Recording</h4>
              {lead.hasRecording ? (
                <div className="flex items-center gap-3">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleOpenRecording}
                    disabled={loadingRecording}
                  >
                    {loadingRecording ? (
                      <Loader2 className="w-4 h-4 mr-1 animate-spin" />
                    ) : (
                      <Play className="w-4 h-4 mr-1" />
                    )}
                    Open Recording
                  </Button>
                  {recordingUrl && (
                    <span className="text-xs text-green-600 flex items-center gap-1">
                      <CheckCircle2 className="w-3 h-3" /> Link generated — opens in new tab
                    </span>
                  )}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">No recording available</p>
              )}
            </div>

            <Separator />

            {/* Transcript */}
            <div>
              <h4 className="text-sm font-semibold text-muted-foreground mb-2">Transcript</h4>
              {lead.transcript ? (
                <div className="bg-muted/30 rounded-lg p-4 max-h-64 overflow-y-auto">
                  <pre className="text-sm whitespace-pre-wrap font-sans">{lead.transcript}</pre>
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">
                  {lead.transcriptionStatus === 'completed'
                    ? 'Transcript processing completed but no text available'
                    : lead.transcriptionStatus
                      ? `Transcription status: ${lead.transcriptionStatus}`
                      : 'No transcript available'}
                </p>
              )}
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

// ─── Main Component ──────────────────────────────────────────────────────────

type ViewState =
  | { type: 'overview' }
  | { type: 'campaign'; campaignId: string; campaignName: string }
  | { type: 'lead'; leadId: string; campaignId: string; campaignName: string };

export function UkefReportsContent() {
  const { toast } = useToast();
  const [view, setView] = useState<ViewState>({ type: 'overview' });
  const [selectedLeadId, setSelectedLeadId] = useState<string | null>(null);

  // ─── Summary ───────────────────────────────────────────────────────────────
  const { data: summary, isLoading: summaryLoading, error: summaryError } = useQuery<SummaryMetrics>({
    queryKey: ['ukef-summary'],
    queryFn: () => apiFetch('/summary'),
  });

  // ─── Campaigns ─────────────────────────────────────────────────────────────
  const { data: campaignsData, isLoading: campaignsLoading } = useQuery<CampaignSummary[]>({
    queryKey: ['ukef-campaigns'],
    queryFn: () => apiFetch('/campaigns'),
  });

  // ─── CSV Export ────────────────────────────────────────────────────────────
  const handleExport = async () => {
    try {
      const res = await fetch('/api/client-portal/ukef-reports/export', {
        headers: { Authorization: `Bearer ${getToken()}` },
      });
      if (!res.ok) throw new Error('Export failed');
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `ukef-qualified-leads-${new Date().toISOString().split('T')[0]}.csv`;
      a.click();
      URL.revokeObjectURL(url);
      toast({ title: 'Export complete', description: 'CSV file downloaded.' });
    } catch (err: any) {
      toast({
        title: 'Export failed',
        description: err.message,
        variant: 'destructive',
      });
    }
  };

  // ─── Error state ───────────────────────────────────────────────────────────
  if (summaryError) {
    const errMsg = (summaryError as Error).message;
    // If feature flag is off or client not authorized, show a clean message
    if (errMsg.includes('403') || errMsg.includes('forbidden') || errMsg.includes('not_found')) {
      return (
        <div className="flex items-center justify-center py-12">
          <Card className="max-w-md">
            <CardContent className="pt-6 text-center">
              <AlertCircle className="w-8 h-8 text-muted-foreground mx-auto mb-2" />
              <p className="text-muted-foreground">Campaign reports are not available for your account.</p>
            </CardContent>
          </Card>
        </div>
      );
    }
    return (
      <div className="flex items-center justify-center py-12">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-2 text-red-600">
              <AlertCircle className="w-5 h-5" />
              <span>Error loading reports: {errMsg}</span>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  // ─── Loading state ─────────────────────────────────────────────────────────
  if (summaryLoading || campaignsLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
        <span className="ml-2 text-muted-foreground">Loading reports...</span>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Campaign Reports</h2>
          <p className="text-muted-foreground">
            Qualified leads with call evidence, transcripts, and quality analysis
          </p>
        </div>
        <Button variant="outline" onClick={handleExport}>
          <Download className="w-4 h-4 mr-2" /> Export CSV
        </Button>
      </div>

      {/* Overview */}
      {view.type === 'overview' && summary && campaignsData && (
        <>
          <SummaryCards metrics={summary} />
          {summary.leadsByMonth.length > 0 && (
            <MonthlyChart data={summary.leadsByMonth} />
          )}
          <CampaignTable
            campaigns={campaignsData}
            onSelectCampaign={(id) => {
              const c = campaignsData.find(c => c.id === id);
              setView({
                type: 'campaign',
                campaignId: id,
                campaignName: c?.name || 'Campaign',
              });
            }}
          />
        </>
      )}

      {/* Campaign Lead List */}
      {view.type === 'campaign' && (
        <LeadList
          campaignId={view.campaignId}
          campaignName={view.campaignName}
          onBack={() => setView({ type: 'overview' })}
          onSelectLead={(id) => setSelectedLeadId(id)}
        />
      )}

      {/* Lead Detail Dialog */}
      <LeadDetailDialog
        leadId={selectedLeadId}
        open={!!selectedLeadId}
        onClose={() => setSelectedLeadId(null)}
      />
    </div>
  );
}

export default UkefReportsContent;
