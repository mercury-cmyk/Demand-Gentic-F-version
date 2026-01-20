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
  FileText, Loader2, UserCheck, ArrowUpDown, RefreshCw,
} from 'lucide-react';

interface QualifiedLead {
  id: string;
  contactName: string | null;
  contactEmail: string | null;
  accountName: string | null;
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
}

interface Campaign {
  id: string;
  name: string;
  type: string;
  status: string;
  approvedLeadsCount: number;
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
  const [sortBy, setSortBy] = useState('approvedAt');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');

  const getToken = () => localStorage.getItem('clientPortalToken');

  // Fetch campaigns for filter dropdown
  const { data: campaigns = [] } = useQuery<Campaign[]>({
    queryKey: ['client-portal-lead-campaigns'],
    queryFn: async () => {
      const res = await fetch('/api/client-portal/qualified-leads/campaigns', {
        headers: { Authorization: `Bearer ${getToken()}` },
      });
      if (!res.ok) return [];
      return res.json();
    },
  });

  // Fetch leads with pagination and filters
  const { data: leadsResponse, isLoading, refetch } = useQuery<{
    leads: QualifiedLead[];
    total: number;
    page: number;
    pageSize: number;
  }>({
    queryKey: ['client-portal-qualified-leads', page, pageSize, search, campaignFilter, sortBy, sortOrder],
    queryFn: async () => {
      const params = new URLSearchParams({
        page: String(page),
        pageSize: String(pageSize),
        sortBy,
        sortOrder,
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
    if (numScore >= 80) return <Badge className="bg-green-100 text-green-800">{numScore.toFixed(0)}</Badge>;
    if (numScore >= 60) return <Badge className="bg-yellow-100 text-yellow-800">{numScore.toFixed(0)}</Badge>;
    return <Badge className="bg-red-100 text-red-800">{numScore.toFixed(0)}</Badge>;
  };

  return (
    <Card>
      <CardHeader className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <CardTitle>Qualified Leads</CardTitle>
          <CardDescription>
            {total.toLocaleString()} QA-approved leads from your campaigns
          </CardDescription>
        </div>
        <div className="flex flex-wrap gap-2">
          <div className="relative w-64">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search leads..."
              className="pl-9"
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
            <SelectTrigger className="w-48">
              <Filter className="h-4 w-4 mr-2" />
              <SelectValue placeholder="All Campaigns" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Campaigns</SelectItem>
              {campaigns.map((c) => (
                <SelectItem key={c.id} value={c.id}>
                  {c.name} ({c.approvedLeadsCount})
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button variant="outline" size="icon" onClick={() => refetch()}>
            <RefreshCw className="h-4 w-4" />
          </Button>
          <Button variant="outline" onClick={onExport}>
            <Download className="h-4 w-4 mr-2" />
            Export
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="flex justify-center p-12">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        ) : leads.length === 0 ? (
          <div className="text-center py-12">
            <UserCheck className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
            <h3 className="font-semibold mb-2">No Leads Found</h3>
            <p className="text-muted-foreground">
              {search || campaignFilter !== 'all'
                ? 'No leads match your filters. Try adjusting your search.'
                : 'QA-approved leads from your campaigns will appear here.'}
            </p>
          </div>
        ) : (
          <>
            <div className="rounded-lg border overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="-ml-3 h-8 data-[state=open]:bg-accent"
                        onClick={() => handleSort('accountName')}
                      >
                        Contact
                        <ArrowUpDown className="ml-2 h-4 w-4" />
                      </Button>
                    </TableHead>
                    <TableHead>Company</TableHead>
                    <TableHead>Campaign</TableHead>
                    <TableHead>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="-ml-3 h-8"
                        onClick={() => handleSort('aiScore')}
                      >
                        AI Score
                        <ArrowUpDown className="ml-2 h-4 w-4" />
                      </Button>
                    </TableHead>
                    <TableHead>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="-ml-3 h-8"
                        onClick={() => handleSort('callDuration')}
                      >
                        Duration
                        <ArrowUpDown className="ml-2 h-4 w-4" />
                      </Button>
                    </TableHead>
                    <TableHead>Assets</TableHead>
                    <TableHead>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="-ml-3 h-8"
                        onClick={() => handleSort('approvedAt')}
                      >
                        Approved
                        <ArrowUpDown className="ml-2 h-4 w-4" />
                      </Button>
                    </TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {leads.map((lead) => (
                    <TableRow key={lead.id} className="cursor-pointer hover:bg-muted/50" onClick={() => onViewDetails(lead.id)}>
                      <TableCell>
                        <div>
                          <p className="font-medium">{lead.contactName || 'Unknown'}</p>
                          <p className="text-xs text-muted-foreground">{lead.contactEmail || '-'}</p>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div>
                          <p className="font-medium">{lead.accountName || '-'}</p>
                          <p className="text-xs text-muted-foreground">{lead.accountIndustry || '-'}</p>
                        </div>
                      </TableCell>
                      <TableCell>
                        <span className="text-sm">{lead.campaignName || '-'}</span>
                      </TableCell>
                      <TableCell>{getScoreBadge(lead.aiScore)}</TableCell>
                      <TableCell className="font-mono text-sm">
                        {formatDuration(lead.callDuration)}
                      </TableCell>
                      <TableCell>
                        <div className="flex gap-1">
                          {lead.hasRecording && (
                            <Headphones className="h-4 w-4 text-blue-500" title="Has Recording" />
                          )}
                          {lead.hasTranscript && (
                            <FileText className="h-4 w-4 text-green-500" title="Has Transcript" />
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {lead.approvedAt
                          ? new Date(lead.approvedAt).toLocaleDateString()
                          : lead.createdAt
                          ? new Date(lead.createdAt).toLocaleDateString()
                          : '-'}
                      </TableCell>
                      <TableCell className="text-right">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={(e) => {
                            e.stopPropagation();
                            onViewDetails(lead.id);
                          }}
                        >
                          <Eye className="h-4 w-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>

            {/* Pagination */}
            <div className="flex items-center justify-between pt-4">
              <p className="text-sm text-muted-foreground">
                Showing {((page - 1) * pageSize) + 1}-{Math.min(page * pageSize, total)} of {total.toLocaleString()} leads
              </p>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page === 1}
                >
                  <ChevronLeft className="h-4 w-4 mr-1" />
                  Previous
                </Button>
                <div className="flex items-center gap-1 px-2">
                  <span className="text-sm">
                    Page {page} of {totalPages}
                  </span>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  disabled={page >= totalPages}
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
