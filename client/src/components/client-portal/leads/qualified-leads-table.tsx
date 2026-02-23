import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import {
  ChevronLeft, ChevronRight, Search, Filter, Download, Eye, Headphones,
  FileText, Loader2, UserCheck, ArrowUpDown, RefreshCw, MessageSquare, Sparkles,
  TrendingUp, Building2, LayoutList,
} from 'lucide-react';
import { PushToShowcaseButton } from '@/components/showcase-calls/push-to-showcase-button';

interface QualifiedLead {
  id: string;
  callSessionId?: string | null;
  contactName: string | null;
  contactEmail: string | null;
  accountName: string | null;
  companyName?: string | null;
  accountIndustry: string | null;
  campaignId: string | null;
  campaignName: string | null;
  aiScore: string | null;
  callDuration: number | null;
  hasRecording: boolean;
  hasTranscript: boolean;
  qaStatus: string | null;
  createdAt: string | null;
  approvedAt: string | null;
  commentCount?: number;
}

interface Campaign {
  id: string;
  name: string;
  type: string;
  status: string;
  approvedLeadsCount: number;
}

interface QualifiedLeadsDebugData {
  [key: string]: unknown;
}

interface QualifiedLeadsTableProps {
  onViewDetails: (leadId: string) => void;
  onExport: () => void;
}

export function QualifiedLeadsTable({ onViewDetails, onExport }: QualifiedLeadsTableProps) {
  const [page, setPage] = useState(1);
  const [pageSize] = useState(25);
  const [search, setSearch] = useState('');
  const [campaignFilter, setCampaignFilter] = useState<string>('all');
  const [sortBy, setSortBy] = useState('createdAt');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc');

  const getToken = () => localStorage.getItem('clientPortalToken');

  // Fetch campaigns for filter dropdown
  const { data: campaigns = [] } = useQuery<Campaign[]>({
    queryKey: ['client-portal-lead-campaigns'],
    queryFn: async () => {
      const token = getToken();
      console.log('[QualifiedLeads] Fetching campaigns, token present:', !!token);
      const res = await fetch('/api/client-portal/qualified-leads/campaigns', {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) {
        const errorText = await res.text();
        console.error('[QualifiedLeads] campaigns fetch failed:', res.status, errorText);
        return [];
      }
      return res.json();
    },
  });

  // Fetch leads with pagination and filters
  const { data: leadsResponse, isLoading, refetch } = useQuery<{
    leads: QualifiedLead[];
    total: number;
    page: number;
    pageSize: number;
    debug?: QualifiedLeadsDebugData;
  }>({
    queryKey: ['client-portal-qualified-leads', page, pageSize, search, campaignFilter, sortBy, sortOrder],
    queryFn: async () => {
      const params = new URLSearchParams({
        page: String(page),
        pageSize: String(pageSize),
        sortBy,
        sortOrder,
        debug: '1',
      });
      if (search) params.set('search', search);
      if (campaignFilter && campaignFilter !== 'all') params.set('campaignId', campaignFilter);

      const res = await fetch(`/api/client-portal/qualified-leads?${params}`, {
        headers: { Authorization: `Bearer ${getToken()}` },
      });
      if (!res.ok) throw new Error('Failed to fetch leads');
      return res.json();
    },
  });

  const leads = leadsResponse?.leads || [];
  const total = leadsResponse?.total || 0;
  const totalPages = Math.ceil(total / pageSize);
  const debugText = leadsResponse?.debug ? JSON.stringify(leadsResponse.debug, null, 2) : '';
  const leadsWithRecordings = leads.filter((lead) => lead.hasRecording).length;
  const leadsWithTranscripts = leads.filter((lead) => lead.hasTranscript).length;

  const handleSort = (column: string) => {
    if (sortBy === column) {
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
    } else {
      setSortBy(column);
      setSortOrder('desc');
    }
  };

  const formatDuration = (seconds: number | null) => {
    if (!seconds) return '-';
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const getScoreBadge = (score: string | null) => {
    if (!score) return null;
    const numScore = parseFloat(score);
    if (numScore >= 80) return (
      <Badge className="bg-gradient-to-r from-green-500 to-emerald-500 text-white border-0 shadow-sm">
        <span className="font-bold">{numScore.toFixed(0)}</span>
      </Badge>
    );
    if (numScore >= 60) return (
      <Badge className="bg-gradient-to-r from-yellow-400 to-orange-400 text-white border-0 shadow-sm">
        <span className="font-bold">{numScore.toFixed(0)}</span>
      </Badge>
    );
    return (
      <Badge className="bg-gradient-to-r from-red-400 to-pink-400 text-white border-0 shadow-sm">
        <span className="font-bold">{numScore.toFixed(0)}</span>
      </Badge>
    );
  };

  return (
    <Card className="shadow-lg border-0 bg-gradient-to-br from-white to-blue-50/30 overflow-hidden">
      <CardHeader className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-6">
        <div className="space-y-1.5">
          <CardTitle className="text-2xl flex items-center gap-2">
            <Sparkles className="h-6 w-6 text-blue-600" />
            Qualified Leads
          </CardTitle>
          <CardDescription className="flex items-center gap-2">
            <TrendingUp className="h-4 w-4 text-green-600" />
            <span className="font-semibold text-green-600">{total.toLocaleString()}</span>
            <span className="text-muted-foreground">QA-approved leads from your campaigns</span>
          </CardDescription>
        </div>
        <div className="w-full sm:w-auto flex flex-col sm:flex-row gap-2">
          <div className="relative w-full sm:w-64">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search leads..."
              className="pl-10 bg-white border-gray-200 focus:ring-2 focus:ring-blue-500 transition-all"
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
            />
          </div>
          <Select
            value={campaignFilter}
            onValueChange={(v) => {
              setCampaignFilter(v);
              setPage(1);
            }}
          >
            <SelectTrigger className="w-full sm:w-52 bg-white border-gray-200">
              <Filter className="h-4 w-4 mr-2 text-blue-600" />
              <SelectValue placeholder="All Campaigns" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">
                <span className="font-medium">All Campaigns</span>
              </SelectItem>
              {campaigns.map((c) => (
                <SelectItem key={c.id} value={c.id}>
                  <div className="flex items-center justify-between w-full gap-2">
                    <span>{c.name}</span>
                    <Badge variant="secondary" className="text-xs">
                      {c.approvedLeadsCount}
                    </Badge>
                  </div>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button 
            variant="outline" 
            size="icon" 
            onClick={() => refetch()}
            className="h-10 w-10 hover:bg-blue-50 hover:border-blue-300 transition-colors"
          >
            <RefreshCw className="h-4 w-4" />
          </Button>
          <Button 
            variant="default" 
            onClick={onExport}
            className="h-10 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 shadow-md"
          >
            <Download className="h-4 w-4 mr-2" />
            Export
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-4">
          <div className="rounded-xl border border-slate-200/80 bg-white/90 p-3">
            <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Current Page</p>
            <p className="text-lg font-semibold text-slate-900">{leads.length.toLocaleString()} leads</p>
          </div>
          <div className="rounded-xl border border-blue-200/70 bg-blue-50/50 p-3">
            <p className="text-[11px] uppercase tracking-wide text-blue-700/70">With Recording</p>
            <p className="text-lg font-semibold text-blue-700">{leadsWithRecordings.toLocaleString()}</p>
          </div>
          <div className="rounded-xl border border-emerald-200/70 bg-emerald-50/50 p-3">
            <p className="text-[11px] uppercase tracking-wide text-emerald-700/70">With Transcript</p>
            <p className="text-lg font-semibold text-emerald-700">{leadsWithTranscripts.toLocaleString()}</p>
          </div>
        </div>

        {isLoading ? (
          <div className="flex justify-center p-16">
            <div className="text-center space-y-3">
              <Loader2 className="h-10 w-10 animate-spin text-blue-600 mx-auto" />
              <p className="text-sm text-muted-foreground">Loading your leads...</p>
            </div>
          </div>
        ) : leads.length === 0 ? (
          <div className="text-center py-16 bg-gradient-to-br from-gray-50 to-blue-50/20 rounded-lg border-2 border-dashed">
            <UserCheck className="h-16 w-16 mx-auto mb-4 text-muted-foreground opacity-50" />
            <h3 className="font-semibold text-lg mb-2">No Leads Found</h3>
            <p className="text-muted-foreground max-w-md mx-auto">
              {search || campaignFilter !== 'all'
                ? 'No leads match your current filters. Try adjusting your search criteria.'
                : 'QA-approved leads from your campaigns will appear here once they are delivered.'}
            </p>
            {debugText && (
              <div className="mt-6 max-w-3xl mx-auto text-left">
                <p className="text-xs font-semibold text-slate-700 mb-2">Diagnostics (copy/paste this)</p>
                <pre className="text-xs bg-slate-950 text-slate-100 rounded-md p-3 overflow-auto border border-slate-700">
                  {debugText}
                </pre>
              </div>
            )}
          </div>
        ) : (
          <>
            <div className="rounded-xl border border-gray-200 shadow-sm bg-white overflow-hidden">
              <div className="px-3 py-2 border-b bg-slate-50/70 flex items-center gap-2 text-xs text-slate-600">
                <LayoutList className="h-3.5 w-3.5" />
                <span>Scroll horizontally on smaller screens to view all columns.</span>
              </div>
              <div className="max-h-[65vh] overflow-auto">
              <Table className="min-w-[980px]">
                <TableHeader className="bg-gradient-to-r from-gray-50 to-blue-50/50 sticky top-0 z-10">
                  <TableRow className="border-b-2 border-gray-200">
                    <TableHead className="font-semibold">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="-ml-3 h-8 hover:bg-white/80"
                        onClick={() => handleSort('accountName')}
                      >
                        Contact
                        <ArrowUpDown className="ml-2 h-4 w-4" />
                      </Button>
                    </TableHead>
                    <TableHead className="font-semibold">Company</TableHead>
                    <TableHead className="font-semibold">Campaign</TableHead>
                    <TableHead className="font-semibold">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="-ml-3 h-8 hover:bg-white/80"
                        onClick={() => handleSort('aiScore')}
                      >
                        AI Score
                        <ArrowUpDown className="ml-2 h-4 w-4" />
                      </Button>
                    </TableHead>
                    <TableHead className="font-semibold">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="-ml-3 h-8 hover:bg-white/80"
                        onClick={() => handleSort('callDuration')}
                      >
                        Duration
                        <ArrowUpDown className="ml-2 h-4 w-4" />
                      </Button>
                    </TableHead>
                    <TableHead className="font-semibold">Assets</TableHead>
                    <TableHead className="font-semibold">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="-ml-3 h-8 hover:bg-white/80"
                        onClick={() => handleSort('approvedAt')}
                      >
                        Approved
                        <ArrowUpDown className="ml-2 h-4 w-4" />
                      </Button>
                    </TableHead>
                    <TableHead className="font-semibold text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {leads.map((lead, idx) => (
                    <TableRow 
                      key={lead.id} 
                      className={`cursor-pointer transition-colors hover:bg-blue-50/50 ${idx % 2 === 0 ? 'bg-white' : 'bg-gray-50/30'}`}
                      onClick={() => onViewDetails(lead.id)}
                    >
                      <TableCell className="py-4">
                        <div className="space-y-1">
                          <p className="font-semibold text-gray-900">{lead.contactName || 'Unknown'}</p>
                          <p className="text-xs text-muted-foreground truncate max-w-[200px]">{lead.contactEmail || '-'}</p>
                        </div>
                      </TableCell>
                      <TableCell className="py-4">
                        <div className="space-y-1">
                          <div className="flex items-center gap-1.5">
                            <Building2 className="h-3.5 w-3.5 text-blue-600" />
                            <p className="font-medium text-gray-900">{lead.companyName || lead.accountName || '-'}</p>
                          </div>
                          <p className="text-xs text-muted-foreground">{lead.accountIndustry || '-'}</p>
                        </div>
                      </TableCell>
                      <TableCell className="py-4">
                        <Badge variant="outline" className="font-normal">
                          {lead.campaignName || '-'}
                        </Badge>
                      </TableCell>
                      <TableCell className="py-4">{getScoreBadge(lead.aiScore)}</TableCell>
                      <TableCell className="font-mono text-sm py-4">
                        {formatDuration(lead.callDuration)}
                      </TableCell>
                      <TableCell className="py-4">
                        <div className="flex gap-2">
                          {lead.hasRecording && (
                            <div className="flex items-center gap-1 text-xs" title="Has Recording">
                              <Headphones className="h-4 w-4 text-blue-600" aria-hidden="true" />
                            </div>
                          )}
                          {lead.hasTranscript && (
                            <div className="flex items-center gap-1 text-xs" title="Has Transcript">
                              <FileText className="h-4 w-4 text-green-600" aria-hidden="true" />
                            </div>
                          )}
                          {(lead.commentCount || 0) > 0 && (
                            <div className="flex items-center gap-1 text-xs">
                              <MessageSquare className="h-4 w-4 text-orange-600" />
                              <span className="text-orange-600 font-medium">{lead.commentCount}</span>
                            </div>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground py-4">
                        {lead.approvedAt
                          ? new Date(lead.approvedAt).toLocaleDateString()
                          : lead.createdAt
                          ? new Date(lead.createdAt).toLocaleDateString()
                          : '-'}
                      </TableCell>
                      <TableCell className="text-right py-4">
                        <div className="flex justify-end gap-2">
                          {lead.callSessionId && (
                            <PushToShowcaseButton
                              callSessionId={lead.callSessionId}
                              contactName={lead.contactName}
                              sourceLabel="Leads Table"
                              label="Showcase"
                              stopPropagation
                              buttonProps={{ size: 'sm', variant: 'outline' }}
                            />
                          )}
                          <Button
                            variant="ghost"
                            size="sm"
                            className="hover:bg-blue-100 hover:text-blue-700"
                            onClick={(e) => {
                              e.stopPropagation();
                              onViewDetails(lead.id);
                            }}
                          >
                            <Eye className="h-4 w-4 mr-1.5" />
                            View
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              </div>
            </div>

            {/* Modern Pagination */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 pt-6 border-t border-gray-200 mt-4">
              <p className="text-sm text-muted-foreground font-medium">
                Showing <span className="text-gray-900">{((page - 1) * pageSize) + 1}-{Math.min(page * pageSize, total)}</span> of <span className="text-gray-900">{total.toLocaleString()}</span> leads
              </p>
              <div className="flex items-center gap-2 self-end md:self-auto">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page === 1}
                  className="hover:bg-blue-50"
                >
                  <ChevronLeft className="h-4 w-4 mr-1" />
                  Previous
                </Button>
                <div className="flex items-center gap-1 px-3 py-1 bg-gray-100 rounded-md">
                  <span className="text-sm font-semibold text-gray-700">
                    Page {page} of {totalPages}
                  </span>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  disabled={page >= totalPages}
                  className="hover:bg-blue-50"
                >
                  Next
                  <ChevronRight className="h-4 w-4 ml-1" />
                </Button>
              </div>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
