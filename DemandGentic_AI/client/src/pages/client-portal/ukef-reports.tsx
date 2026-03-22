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
  leadsByMonth: Array;
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
  aiAnalysis: Record | null;
  qaData: Record | null;
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

async function apiFetch(path: string): Promise {
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
  if (score === null) return N/A;
  const color = score >= 80 ? 'bg-green-100 text-green-800' :
    score >= 60 ? 'bg-yellow-100 text-yellow-800' :
      'bg-red-100 text-red-800';
  return {score.toFixed(1)};
}

function QaStatusBadge({ status }: { status: string | null }) {
  if (!status) return null;
  const styles: Record = {
    approved: 'bg-green-100 text-green-800',
    published: 'bg-blue-100 text-blue-800',
    rejected: 'bg-red-100 text-red-800',
    under_review: 'bg-yellow-100 text-yellow-800',
    new: 'bg-gray-100 text-gray-800',
  };
  return (
    
      {status.replace(/_/g, ' ')}
    
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
    
      
        
          
            
              
            
            
              Qualified Leads
              {metrics.totalQualifiedLeads}
            
          
        
      
      
        
          
            
              
            
            
              Active Campaigns
              {metrics.totalCampaigns}
            
          
        
      
      
        
          
            
              
            
            
              Avg AI Score
              
                {metrics.avgAiScore !== null ? metrics.avgAiScore.toFixed(1) : '—'}
              
            
          
        
      
    
  );
}

// ─── Monthly Chart ───────────────────────────────────────────────────────────

function MonthlyChart({ data }: { data: Array }) {
  if (data.length === 0) return null;
  const maxCount = Math.max(...data.map(d => d.count), 1);

  return (
    
      
        Leads by Month
      
      
        
          {data.map(({ month, count }) => (
            
              {count}
              
              
                {month.slice(5)}
              
            
          ))}
        
      
    
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
    
      
        Campaigns
        Click a campaign to view qualified leads
      
      
        
          
            
              
                Campaign
                Status
                Qualified
                Avg Score
                Date Range
                Action
              
            
            
              {campaigns.map(c => (
                
                  {c.name}
                  
                    {c.status}
                  
                  {c.qualifiedLeadCount}
                  
                    
                  
                  
                    {c.dateRange.earliest ? (
                      <>
                        {formatDate(c.dateRange.earliest)} — {formatDate(c.dateRange.latest)}
                      
                    ) : '—'}
                  
                  
                     onSelectCampaign(c.id)}
                      disabled={c.qualifiedLeadCount === 0}
                    >
                       View Leads
                    
                  
                
              ))}
            
          
        
      
    
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

  const { data, isLoading, error } = useQuery({
    queryKey: ['ukef-leads', campaignId, page, pageSize],
    queryFn: () => apiFetch(`/campaigns/${campaignId}/leads?page=${page}&pageSize=${pageSize}`),
  });

  if (isLoading) {
    return (
      
        
      
    );
  }

  if (error) {
    return (
      
        
          
            
            Failed to load leads: {(error as Error).message}
          
        
      
    );
  }

  if (!data) return null;

  return (
    
      
        
           Back
        
        
          {campaignName}
          
            {data.total} qualified lead{data.total !== 1 ? 's' : ''}
          
        
      

      
        
          
            
              
                
                  Contact
                  Company
                  QA Status
                  AI Score
                  Evidence
                  Delivered
                  Action
                
              
              
                {data.leads.map(lead => (
                  
                    
                      
                        {lead.contactName || '—'}
                        {lead.jobTitle || ''}
                      
                    
                    {lead.companyName || '—'}
                    
                      
                    
                    
                      
                    
                    
                      
                        {lead.hasRecording && (
                          
                             Audio
                          
                        )}
                        {lead.hasTranscript && (
                          
                             Text
                          
                        )}
                      
                    
                    
                      {formatDate(lead.deliveredAt)}
                    
                    
                       onSelectLead(lead.id)}
                      >
                         Details
                      
                    
                  
                ))}
              
            
          

          {/* Pagination */}
          {data.totalPages > 1 && (
            
              
                Page {data.page} of {data.totalPages} ({data.total} leads)
              
              
                 setPage(p => p - 1)}
                >
                   Previous
                
                = data.totalPages}
                  onClick={() => setPage(p => p + 1)}
                >
                  Next 
                
              
            
          )}
        
      
    
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
  const [recordingUrl, setRecordingUrl] = useState(null);
  const [loadingRecording, setLoadingRecording] = useState(false);

  const { data: lead, isLoading } = useQuery({
    queryKey: ['ukef-lead-detail', leadId],
    queryFn: () => apiFetch(`/leads/${leadId}`),
    enabled: !!leadId && open,
  });

  const handleOpenRecording = async () => {
    if (!leadId) return;
    setLoadingRecording(true);
    try {
      const link = await apiFetch(`/leads/${leadId}/recording-link`);
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
     { if (!v) { onClose(); setRecordingUrl(null); } }}>
      
        
          Lead Detail
          
            {lead?.contactName || 'Loading...'} {lead?.companyName ? ` — ${lead.companyName}` : ''}
          
        

        {isLoading && (
          
            
          
        )}

        {lead && (
          
            {/* Contact Info */}
            
              Contact Information
              
                
                  
                  {lead.contactName || '—'}
                
                
                  
                  {lead.companyName || '—'}
                
                
                  
                  {lead.jobTitle || '—'}
                
                
                  
                  {lead.email || '—'}
                
                {lead.phone && (
                  
                    
                    {lead.phone}
                  
                )}
                {lead.department && (
                  
                    
                    {lead.department}
                  
                )}
              
            

            

            {/* Status & Scores */}
            
              Quality Assessment
              
                
                  QA Status:
                  
                
                
                  AI Score:
                  
                
                {lead.aiQualificationStatus && (
                  
                    AI Status:
                    {lead.aiQualificationStatus}
                  
                )}
              

              {/* AI Analysis */}
              {lead.aiAnalysis && Object.keys(lead.aiAnalysis).length > 0 && (
                
                  AI Analysis
                  
                    {Object.entries(lead.aiAnalysis).map(([key, value]) => (
                      
                        
                          {key.replace(/_/g, ' ')}:
                        
                        {typeof value === 'object' ? JSON.stringify(value) : String(value)}
                      
                    ))}
                  
                
              )}
            

            

            {/* Dates */}
            
              Timeline
              
                
                  
                  Delivered:
                  {formatDate(lead.deliveredAt)}
                
                
                  
                  Created:
                  {formatDate(lead.createdAt)}
                
              
            

            

            {/* Recording */}
            
              Recording
              {lead.hasRecording ? (
                
                  
                    {loadingRecording ? (
                      
                    ) : (
                      
                    )}
                    Open Recording
                  
                  {recordingUrl && (
                    
                       Link generated — opens in new tab
                    
                  )}
                
              ) : (
                No recording available
              )}
            

            

            {/* Transcript */}
            
              Transcript
              {lead.transcript ? (
                
                  {lead.transcript}
                
              ) : (
                
                  {lead.transcriptionStatus === 'completed'
                    ? 'Transcript processing completed but no text available'
                    : lead.transcriptionStatus
                      ? `Transcription status: ${lead.transcriptionStatus}`
                      : 'No transcript available'}
                
              )}
            
          
        )}
      
    
  );
}

// ─── Main Component ──────────────────────────────────────────────────────────

type ViewState =
  | { type: 'overview' }
  | { type: 'campaign'; campaignId: string; campaignName: string }
  | { type: 'lead'; leadId: string; campaignId: string; campaignName: string };

export function UkefReportsContent() {
  const { toast } = useToast();
  const [view, setView] = useState({ type: 'overview' });
  const [selectedLeadId, setSelectedLeadId] = useState(null);

  // ─── Summary ───────────────────────────────────────────────────────────────
  const { data: summary, isLoading: summaryLoading, error: summaryError } = useQuery({
    queryKey: ['ukef-summary'],
    queryFn: () => apiFetch('/summary'),
  });

  // ─── Campaigns ─────────────────────────────────────────────────────────────
  const { data: campaignsData, isLoading: campaignsLoading } = useQuery({
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
        
          
            
              
              Campaign reports are not available for your account.
            
          
        
      );
    }
    return (
      
        
          
            
              
              Error loading reports: {errMsg}
            
          
        
      
    );
  }

  // ─── Loading state ─────────────────────────────────────────────────────────
  if (summaryLoading || campaignsLoading) {
    return (
      
        
        Loading reports...
      
    );
  }

  return (
    
      {/* Header */}
      
        
          Campaign Reports
          
            Qualified leads with call evidence, transcripts, and quality analysis
          
        
        
           Export CSV
        
      

      {/* Overview */}
      {view.type === 'overview' && summary && campaignsData && (
        <>
          
          {summary.leadsByMonth.length > 0 && (
            
          )}
           {
              const c = campaignsData.find(c => c.id === id);
              setView({
                type: 'campaign',
                campaignId: id,
                campaignName: c?.name || 'Campaign',
              });
            }}
          />
        
      )}

      {/* Campaign Lead List */}
      {view.type === 'campaign' && (
         setView({ type: 'overview' })}
          onSelectLead={(id) => setSelectedLeadId(id)}
        />
      )}

      {/* Lead Detail Dialog */}
       setSelectedLeadId(null)}
      />
    
  );
}

export default UkefReportsContent;