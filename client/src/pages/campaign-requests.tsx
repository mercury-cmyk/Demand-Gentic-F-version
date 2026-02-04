/**
 * Campaign Requests Page (Admin View)
 *
 * Admin view of client Work Orders - review, approve, assign to projects/campaigns
 * Connects to: Projects, Campaigns, QA, and Leads
 */

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Progress } from '@/components/ui/progress';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Skeleton } from '@/components/ui/skeleton';
import { useToast } from '@/hooks/use-toast';
import {
  FileText, Search, Clock, CheckCircle2, XCircle,
  AlertCircle, Loader2, Phone, Mail, Target, Sparkles,
  Calendar, Users, Building2, Eye, MoreHorizontal,
  Play, Pause, Check, X, Link2, FolderOpen, Megaphone,
  UserCheck, Send, ClipboardCheck, ListChecks
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { format } from 'date-fns';

interface CampaignRequest {
  id: string;
  orderNumber: string;
  title: string;
  description?: string;
  orderType: string;
  priority: string;
  status: string;
  targetLeadCount?: number;
  targetIndustries?: string[];
  targetTitles?: string[];
  targetCompanySize?: string;
  targetRegions?: string[];
  leadsGenerated?: number;
  leadsDelivered?: number;
  progressPercent?: number;
  requestedStartDate?: string;
  requestedEndDate?: string;
  estimatedBudget?: string;
  approvedBudget?: string;
  clientNotes?: string;
  specialRequirements?: string;
  adminNotes?: string;
  projectId?: string;
  campaignId?: string;
  assignedTo?: string;
  qaStatus?: string;
  submittedAt?: string;
  createdAt: string;
  updatedAt: string;
  clientAccountId: string;
  clientName?: string;
}

interface Lead {
  id: string;
  contactName?: string;
  contactEmail?: string;
  accountName?: string;
  accountIndustry?: string;
  qaStatus: string;
  aiScore?: number;
  aiQualificationStatus?: string;
  submittedToClient?: boolean;
  publishedAt?: string;
  approvedAt?: string;
  createdAt: string;
}

const QA_STATUS_CONFIG: Record<string, { label: string; color: string }> = {
  new: { label: 'New', color: 'bg-slate-100 text-slate-700' },
  under_review: { label: 'Under Review', color: 'bg-yellow-100 text-yellow-700' },
  approved: { label: 'QA Approved', color: 'bg-green-100 text-green-700' },
  rejected: { label: 'Rejected', color: 'bg-red-100 text-red-700' },
  returned: { label: 'Returned', color: 'bg-orange-100 text-orange-700' },
  published: { label: 'Published', color: 'bg-blue-100 text-blue-700' },
};

const STATUS_CONFIG: Record<string, { label: string; color: string; icon: typeof Clock }> = {
  draft: { label: 'Draft', color: 'bg-slate-100 text-slate-700', icon: FileText },
  submitted: { label: 'Submitted', color: 'bg-blue-100 text-blue-700', icon: Clock },
  under_review: { label: 'Under Review', color: 'bg-purple-100 text-purple-700', icon: Eye },
  approved: { label: 'Approved', color: 'bg-green-100 text-green-700', icon: CheckCircle2 },
  in_progress: { label: 'In Progress', color: 'bg-amber-100 text-amber-700', icon: Loader2 },
  qa_review: { label: 'QA Review', color: 'bg-indigo-100 text-indigo-700', icon: Eye },
  completed: { label: 'Completed', color: 'bg-emerald-100 text-emerald-700', icon: CheckCircle2 },
  on_hold: { label: 'On Hold', color: 'bg-orange-100 text-orange-700', icon: AlertCircle },
  rejected: { label: 'Rejected', color: 'bg-red-100 text-red-700', icon: XCircle },
  cancelled: { label: 'Cancelled', color: 'bg-gray-100 text-gray-700', icon: XCircle },
};

const PRIORITY_COLORS: Record<string, string> = {
  low: 'bg-slate-100 text-slate-700',
  normal: 'bg-blue-100 text-blue-700',
  high: 'bg-orange-100 text-orange-700',
  urgent: 'bg-red-100 text-red-700',
};

const ORDER_TYPE_LABELS: Record<string, string> = {
  call_campaign: 'AI Calls',
  email_campaign: 'Email',
  combo_campaign: 'Combo',
  lead_generation: 'Lead Gen',
  appointment_setting: 'Appointments',
  data_enrichment: 'Enrichment',
  market_research: 'Research',
  custom: 'Custom',
};

export default function CampaignRequestsPage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [statusFilter, setStatusFilter] = useState<string>('submitted');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedRequest, setSelectedRequest] = useState<CampaignRequest | null>(null);
  const [showApproveDialog, setShowApproveDialog] = useState(false);
  const [showRejectDialog, setShowRejectDialog] = useState(false);
  const [showLeadsDialog, setShowLeadsDialog] = useState(false);
  const [selectedLeads, setSelectedLeads] = useState<string[]>([]);

  // Form state for approve dialog
  const [approvedBudget, setApprovedBudget] = useState('');
  const [adminNotes, setAdminNotes] = useState('');
  const [createProject, setCreateProject] = useState(true);
  const [createCampaign, setCreateCampaign] = useState(false);
  const [rejectionReason, setRejectionReason] = useState('');

  // Fetch campaign requests
  const { data, isLoading, error } = useQuery<{ campaignRequests: CampaignRequest[]; statusCounts: Record<string, number> }>({
    queryKey: ['campaign-requests', statusFilter],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (statusFilter !== 'all') params.set('status', statusFilter);

      const res = await fetch(`/api/client-portal/admin/campaign-requests/admin?${params}`, {
        credentials: 'include',
      });
      if (!res.ok) throw new Error('Failed to fetch campaign requests');
      return res.json();
    },
  });

  const requests = data?.campaignRequests || [];
  const statusCounts = data?.statusCounts || {};

  const filteredRequests = requests.filter(req =>
    req.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
    req.orderNumber.toLowerCase().includes(searchQuery.toLowerCase()) ||
    req.clientName?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  // Approve mutation
  const approveMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/client-portal/admin/campaign-requests/admin/${selectedRequest?.id}/approve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          approvedBudget: approvedBudget ? parseFloat(approvedBudget) : undefined,
          adminNotes,
          createProject,
          createCampaign,
        }),
      });
      if (!res.ok) throw new Error('Failed to approve request');
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['campaign-requests'] });
      toast({ title: 'Request Approved', description: 'The campaign request has been approved' });
      setShowApproveDialog(false);
      setSelectedRequest(null);
      resetDialogState();
    },
    onError: (error: Error) => {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    },
  });

  // Reject mutation
  const rejectMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/client-portal/admin/campaign-requests/admin/${selectedRequest?.id}/reject`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ rejectionReason }),
      });
      if (!res.ok) throw new Error('Failed to reject request');
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['campaign-requests'] });
      toast({ title: 'Request Rejected', description: 'The campaign request has been rejected' });
      setShowRejectDialog(false);
      setSelectedRequest(null);
      resetDialogState();
    },
    onError: (error: Error) => {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    },
  });

  // Start work mutation
  const startMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/client-portal/admin/campaign-requests/admin/${id}/start`, {
        method: 'POST',
        credentials: 'include',
      });
      if (!res.ok) throw new Error('Failed to start work');
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['campaign-requests'] });
      toast({ title: 'Work Started', description: 'Campaign work has been started' });
    },
    onError: (error: Error) => {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    },
  });

  // Fetch leads for a campaign request
  const { data: leadsData, isLoading: leadsLoading, refetch: refetchLeads } = useQuery<{
    leads: Lead[];
    statusCounts: Record<string, number>;
    campaignId?: string;
    projectId?: string;
  }>({
    queryKey: ['campaign-request-leads', selectedRequest?.id],
    queryFn: async () => {
      if (!selectedRequest?.id) return { leads: [], statusCounts: {} };
      const res = await fetch(`/api/client-portal/admin/campaign-requests/admin/${selectedRequest.id}/leads`, {
        credentials: 'include',
      });
      if (!res.ok) throw new Error('Failed to fetch leads');
      return res.json();
    },
    enabled: !!selectedRequest?.id && showLeadsDialog,
  });

  const requestLeads = leadsData?.leads || [];
  const leadsStatusCounts = leadsData?.statusCounts || {};

  // Move to QA review mutation
  const toQaMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/client-portal/admin/campaign-requests/admin/${id}/to-qa`, {
        method: 'POST',
        credentials: 'include',
      });
      if (!res.ok) throw new Error('Failed to move to QA review');
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['campaign-requests'] });
      toast({ title: 'Moved to QA Review', description: 'Request is now in QA review stage' });
    },
    onError: (error: Error) => {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    },
  });

  // QA approve mutation
  const qaApproveMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/client-portal/admin/campaign-requests/admin/${id}/qa-approve`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ qaNotes: adminNotes }),
      });
      if (!res.ok) throw new Error('Failed to approve QA');
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['campaign-requests'] });
      toast({ title: 'QA Approved', description: 'Leads can now be published to client' });
    },
    onError: (error: Error) => {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    },
  });

  // Publish leads mutation
  const publishLeadsMutation = useMutation({
    mutationFn: async ({ id, leadIds, publishAll }: { id: string; leadIds?: string[]; publishAll?: boolean }) => {
      const res = await fetch(`/api/client-portal/admin/campaign-requests/admin/${id}/leads/publish`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ leadIds, publishAll }),
      });
      if (!res.ok) throw new Error('Failed to publish leads');
      return res.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['campaign-requests'] });
      queryClient.invalidateQueries({ queryKey: ['campaign-request-leads'] });
      toast({
        title: 'Leads Published',
        description: `${data.publishedCount} leads published to client dashboard`,
      });
      setSelectedLeads([]);
    },
    onError: (error: Error) => {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    },
  });

  // Complete work order mutation
  const completeMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/client-portal/admin/campaign-requests/admin/${id}/complete`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      if (!res.ok) throw new Error('Failed to complete request');
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['campaign-requests'] });
      toast({ title: 'Completed', description: 'Campaign request marked as completed' });
    },
    onError: (error: Error) => {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    },
  });

  const resetDialogState = () => {
    setApprovedBudget('');
    setAdminNotes('');
    setCreateProject(true);
    setCreateCampaign(false);
    setRejectionReason('');
  };

  const getStatusBadge = (status: string) => {
    const config = STATUS_CONFIG[status] || STATUS_CONFIG.draft;
    return (
      <Badge className={cn('gap-1', config.color)}>
        {config.label}
      </Badge>
    );
  };

  const handleApprove = (request: CampaignRequest) => {
    setSelectedRequest(request);
    setApprovedBudget(request.estimatedBudget || '');
    setShowApproveDialog(true);
  };

  const handleReject = (request: CampaignRequest) => {
    setSelectedRequest(request);
    setShowRejectDialog(true);
  };

  const handleViewLeads = (request: CampaignRequest) => {
    setSelectedRequest(request);
    setShowLeadsDialog(true);
    setSelectedLeads([]);
  };

  const toggleLeadSelection = (leadId: string) => {
    setSelectedLeads(prev =>
      prev.includes(leadId)
        ? prev.filter(id => id !== leadId)
        : [...prev, leadId]
    );
  };

  const selectAllApprovedLeads = () => {
    const approvedIds = requestLeads
      .filter(l => l.qaStatus === 'approved')
      .map(l => l.id);
    setSelectedLeads(approvedIds);
  };

  if (error) {
    return (
      <div className="container mx-auto py-8">
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <AlertCircle className="h-12 w-12 text-destructive mb-4" />
            <p className="text-lg font-medium">Failed to load campaign requests</p>
            <p className="text-sm text-muted-foreground">Please try again later</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="container mx-auto py-8 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Campaign Requests</h1>
          <p className="text-muted-foreground">Review and manage client work orders</p>
        </div>
      </div>

      {/* Status Tabs */}
      <Tabs value={statusFilter} onValueChange={setStatusFilter}>
        <TabsList>
          <TabsTrigger value="all" className="gap-2">
            All
            <Badge variant="secondary" className="ml-1">{Object.values(statusCounts).reduce((a, b) => a + b, 0) || 0}</Badge>
          </TabsTrigger>
          <TabsTrigger value="submitted" className="gap-2">
            Pending Review
            <Badge variant="secondary" className="ml-1">{statusCounts.submitted || 0}</Badge>
          </TabsTrigger>
          <TabsTrigger value="approved" className="gap-2">
            Approved
            <Badge variant="secondary" className="ml-1">{statusCounts.approved || 0}</Badge>
          </TabsTrigger>
          <TabsTrigger value="in_progress" className="gap-2">
            In Progress
            <Badge variant="secondary" className="ml-1">{statusCounts.in_progress || 0}</Badge>
          </TabsTrigger>
          <TabsTrigger value="qa_review" className="gap-2">
            QA Review
            <Badge variant="secondary" className="ml-1">{statusCounts.qa_review || 0}</Badge>
          </TabsTrigger>
          <TabsTrigger value="completed" className="gap-2">
            Completed
            <Badge variant="secondary" className="ml-1">{statusCounts.completed || 0}</Badge>
          </TabsTrigger>
        </TabsList>
      </Tabs>

      {/* Search */}
      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Search requests..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="pl-9"
        />
      </div>

      {/* Requests Table */}
      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-6 space-y-4">
              {[1, 2, 3].map((i) => (
                <div key={i} className="flex items-center gap-4">
                  <Skeleton className="h-12 w-12 rounded" />
                  <div className="space-y-2 flex-1">
                    <Skeleton className="h-4 w-48" />
                    <Skeleton className="h-3 w-32" />
                  </div>
                  <Skeleton className="h-8 w-24" />
                </div>
              ))}
            </div>
          ) : filteredRequests.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16">
              <FileText className="h-16 w-16 text-muted-foreground/50 mb-4" />
              <h3 className="text-lg font-medium mb-1">No campaign requests</h3>
              <p className="text-sm text-muted-foreground">
                {statusFilter === 'all'
                  ? 'No requests have been submitted yet'
                  : `No ${STATUS_CONFIG[statusFilter]?.label.toLowerCase()} requests`}
              </p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Request</TableHead>
                  <TableHead>Client</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Priority</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Leads</TableHead>
                  <TableHead>Submitted</TableHead>
                  <TableHead className="w-[100px]">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredRequests.map((request) => (
                  <TableRow key={request.id}>
                    <TableCell>
                      <div>
                        <div className="font-medium">{request.title}</div>
                        <div className="text-sm text-muted-foreground">{request.orderNumber}</div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <span className="text-sm">{request.clientName || 'Unknown'}</span>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline">
                        {ORDER_TYPE_LABELS[request.orderType] || request.orderType}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Badge className={PRIORITY_COLORS[request.priority] || ''}>
                        {request.priority}
                      </Badge>
                    </TableCell>
                    <TableCell>{getStatusBadge(request.status)}</TableCell>
                    <TableCell>
                      {request.targetLeadCount?.toLocaleString() || '-'}
                    </TableCell>
                    <TableCell>
                      {request.submittedAt
                        ? format(new Date(request.submittedAt), 'MMM d, yyyy')
                        : '-'}
                    </TableCell>
                    <TableCell>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="sm">
                            <MoreHorizontal className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => setSelectedRequest(request)}>
                            <Eye className="h-4 w-4 mr-2" />
                            View Details
                          </DropdownMenuItem>
                          {request.campaignId && (
                            <DropdownMenuItem onClick={() => handleViewLeads(request)}>
                              <ListChecks className="h-4 w-4 mr-2" />
                              View Leads
                            </DropdownMenuItem>
                          )}
                          <DropdownMenuSeparator />
                          {request.status === 'submitted' && (
                            <>
                              <DropdownMenuItem onClick={() => handleApprove(request)}>
                                <Check className="h-4 w-4 mr-2" />
                                Approve
                              </DropdownMenuItem>
                              <DropdownMenuItem onClick={() => handleReject(request)}>
                                <X className="h-4 w-4 mr-2" />
                                Reject
                              </DropdownMenuItem>
                            </>
                          )}
                          {request.status === 'approved' && (
                            <DropdownMenuItem onClick={() => startMutation.mutate(request.id)}>
                              <Play className="h-4 w-4 mr-2" />
                              Start Work
                            </DropdownMenuItem>
                          )}
                          {request.status === 'in_progress' && (
                            <DropdownMenuItem onClick={() => toQaMutation.mutate(request.id)}>
                              <ClipboardCheck className="h-4 w-4 mr-2" />
                              Move to QA Review
                            </DropdownMenuItem>
                          )}
                          {request.status === 'qa_review' && (
                            <>
                              <DropdownMenuItem onClick={() => qaApproveMutation.mutate(request.id)}>
                                <UserCheck className="h-4 w-4 mr-2" />
                                Approve QA
                              </DropdownMenuItem>
                              <DropdownMenuItem onClick={() => handleViewLeads(request)}>
                                <Send className="h-4 w-4 mr-2" />
                                Publish Leads
                              </DropdownMenuItem>
                            </>
                          )}
                          {(request.status === 'qa_review' && request.qaStatus === 'approved') && (
                            <DropdownMenuItem onClick={() => completeMutation.mutate(request.id)}>
                              <CheckCircle2 className="h-4 w-4 mr-2" />
                              Mark Complete
                            </DropdownMenuItem>
                          )}
                          <DropdownMenuSeparator />
                          {request.projectId && (
                            <DropdownMenuItem>
                              <FolderOpen className="h-4 w-4 mr-2" />
                              View Project
                            </DropdownMenuItem>
                          )}
                          {request.campaignId && (
                            <DropdownMenuItem>
                              <Megaphone className="h-4 w-4 mr-2" />
                              View Campaign
                            </DropdownMenuItem>
                          )}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Detail View Dialog */}
      <Dialog open={!!selectedRequest && !showApproveDialog && !showRejectDialog} onOpenChange={() => setSelectedRequest(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FileText className="h-5 w-5" />
              {selectedRequest?.title}
            </DialogTitle>
            <DialogDescription>
              {selectedRequest?.orderNumber} - {selectedRequest?.clientName}
            </DialogDescription>
          </DialogHeader>

          {selectedRequest && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label className="text-muted-foreground">Status</Label>
                  <div className="mt-1">{getStatusBadge(selectedRequest.status)}</div>
                </div>
                <div>
                  <Label className="text-muted-foreground">Priority</Label>
                  <div className="mt-1">
                    <Badge className={PRIORITY_COLORS[selectedRequest.priority]}>
                      {selectedRequest.priority}
                    </Badge>
                  </div>
                </div>
                <div>
                  <Label className="text-muted-foreground">Type</Label>
                  <div className="mt-1 font-medium">{ORDER_TYPE_LABELS[selectedRequest.orderType]}</div>
                </div>
                <div>
                  <Label className="text-muted-foreground">Target Leads</Label>
                  <div className="mt-1 font-medium">{selectedRequest.targetLeadCount?.toLocaleString() || '-'}</div>
                </div>
              </div>

              {selectedRequest.description && (
                <div>
                  <Label className="text-muted-foreground">Description</Label>
                  <p className="mt-1 text-sm bg-muted p-3 rounded">{selectedRequest.description}</p>
                </div>
              )}

              {(selectedRequest.targetIndustries?.length || selectedRequest.targetTitles?.length) && (
                <div className="space-y-2">
                  {selectedRequest.targetIndustries?.length && (
                    <div>
                      <Label className="text-muted-foreground">Target Industries</Label>
                      <div className="flex flex-wrap gap-1 mt-1">
                        {selectedRequest.targetIndustries.map((i, idx) => (
                          <Badge key={idx} variant="outline">{i}</Badge>
                        ))}
                      </div>
                    </div>
                  )}
                  {selectedRequest.targetTitles?.length && (
                    <div>
                      <Label className="text-muted-foreground">Target Titles</Label>
                      <div className="flex flex-wrap gap-1 mt-1">
                        {selectedRequest.targetTitles.map((t, idx) => (
                          <Badge key={idx} variant="outline">{t}</Badge>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {(selectedRequest.estimatedBudget || selectedRequest.requestedStartDate) && (
                <div className="grid grid-cols-2 gap-4">
                  {selectedRequest.estimatedBudget && (
                    <div>
                      <Label className="text-muted-foreground">Estimated Budget</Label>
                      <div className="mt-1 font-medium">${parseFloat(selectedRequest.estimatedBudget).toLocaleString()}</div>
                    </div>
                  )}
                  {selectedRequest.requestedStartDate && (
                    <div>
                      <Label className="text-muted-foreground">Requested Timeline</Label>
                      <div className="mt-1 font-medium">
                        {selectedRequest.requestedStartDate}
                        {selectedRequest.requestedEndDate && ` - ${selectedRequest.requestedEndDate}`}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {selectedRequest.clientNotes && (
                <div>
                  <Label className="text-muted-foreground">Client Notes</Label>
                  <p className="mt-1 text-sm bg-muted p-3 rounded">{selectedRequest.clientNotes}</p>
                </div>
              )}
            </div>
          )}

          <DialogFooter>
            {selectedRequest?.status === 'submitted' && (
              <>
                <Button variant="outline" onClick={() => handleReject(selectedRequest)}>
                  <X className="h-4 w-4 mr-2" />
                  Reject
                </Button>
                <Button onClick={() => handleApprove(selectedRequest)}>
                  <Check className="h-4 w-4 mr-2" />
                  Approve
                </Button>
              </>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Approve Dialog */}
      <Dialog open={showApproveDialog} onOpenChange={setShowApproveDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Approve Campaign Request</DialogTitle>
            <DialogDescription>
              Approve "{selectedRequest?.title}" from {selectedRequest?.clientName}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Approved Budget ($)</Label>
              <Input
                type="number"
                value={approvedBudget}
                onChange={(e) => setApprovedBudget(e.target.value)}
                placeholder={selectedRequest?.estimatedBudget || 'Enter approved budget'}
              />
            </div>

            <div className="space-y-2">
              <Label>Admin Notes</Label>
              <Textarea
                value={adminNotes}
                onChange={(e) => setAdminNotes(e.target.value)}
                placeholder="Internal notes about this request..."
              />
            </div>

            <div className="space-y-2">
              <Label>Create Resources</Label>
              <div className="space-y-2">
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={createProject}
                    onChange={(e) => setCreateProject(e.target.checked)}
                    className="rounded"
                  />
                  <span className="text-sm">Create Project</span>
                </label>
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={createCampaign}
                    onChange={(e) => setCreateCampaign(e.target.checked)}
                    className="rounded"
                  />
                  <span className="text-sm">Create Campaign</span>
                </label>
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowApproveDialog(false)}>
              Cancel
            </Button>
            <Button onClick={() => approveMutation.mutate()} disabled={approveMutation.isPending}>
              {approveMutation.isPending ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Check className="h-4 w-4 mr-2" />
              )}
              Approve
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Reject Dialog */}
      <Dialog open={showRejectDialog} onOpenChange={setShowRejectDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reject Campaign Request</DialogTitle>
            <DialogDescription>
              Reject "{selectedRequest?.title}" from {selectedRequest?.clientName}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Rejection Reason *</Label>
              <Textarea
                value={rejectionReason}
                onChange={(e) => setRejectionReason(e.target.value)}
                placeholder="Explain why this request is being rejected..."
                rows={4}
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowRejectDialog(false)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={() => rejectMutation.mutate()}
              disabled={rejectMutation.isPending || !rejectionReason.trim()}
            >
              {rejectMutation.isPending ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <X className="h-4 w-4 mr-2" />
              )}
              Reject
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Leads Dialog */}
      <Dialog open={showLeadsDialog} onOpenChange={setShowLeadsDialog}>
        <DialogContent className="max-w-4xl max-h-[80vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ListChecks className="h-5 w-5" />
              Leads for {selectedRequest?.title}
            </DialogTitle>
            <DialogDescription>
              {selectedRequest?.orderNumber} - View and publish QA-approved leads to client dashboard
            </DialogDescription>
          </DialogHeader>

          {/* Leads Stats */}
          <div className="flex gap-4 py-2 border-b">
            <div className="text-center">
              <div className="text-2xl font-bold">{requestLeads.length}</div>
              <div className="text-xs text-muted-foreground">Total Leads</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-green-600">{leadsStatusCounts.approved || 0}</div>
              <div className="text-xs text-muted-foreground">QA Approved</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-blue-600">{leadsStatusCounts.published || 0}</div>
              <div className="text-xs text-muted-foreground">Published</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-yellow-600">{leadsStatusCounts.new || 0}</div>
              <div className="text-xs text-muted-foreground">Pending QA</div>
            </div>
          </div>

          {/* Leads Table */}
          <div className="flex-1 overflow-auto">
            {leadsLoading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
              </div>
            ) : requestLeads.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12">
                <FileText className="h-12 w-12 text-muted-foreground/50 mb-4" />
                <p className="text-muted-foreground">No leads yet for this campaign</p>
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[50px]">
                      <input
                        type="checkbox"
                        checked={selectedLeads.length === requestLeads.filter(l => l.qaStatus === 'approved').length && selectedLeads.length > 0}
                        onChange={(e) => e.target.checked ? selectAllApprovedLeads() : setSelectedLeads([])}
                        className="rounded"
                      />
                    </TableHead>
                    <TableHead>Contact</TableHead>
                    <TableHead>Account</TableHead>
                    <TableHead>QA Status</TableHead>
                    <TableHead>AI Score</TableHead>
                    <TableHead>Created</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {requestLeads.map((lead) => (
                    <TableRow key={lead.id}>
                      <TableCell>
                        <input
                          type="checkbox"
                          checked={selectedLeads.includes(lead.id)}
                          onChange={() => toggleLeadSelection(lead.id)}
                          disabled={lead.qaStatus !== 'approved'}
                          className="rounded"
                        />
                      </TableCell>
                      <TableCell>
                        <div>
                          <div className="font-medium">{lead.contactName || 'Unknown'}</div>
                          <div className="text-sm text-muted-foreground">{lead.contactEmail}</div>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div>
                          <div className="font-medium">{lead.accountName || '-'}</div>
                          <div className="text-sm text-muted-foreground">{lead.accountIndustry}</div>
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge className={QA_STATUS_CONFIG[lead.qaStatus]?.color || ''}>
                          {QA_STATUS_CONFIG[lead.qaStatus]?.label || lead.qaStatus}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        {lead.aiScore !== undefined ? (
                          <Badge variant={lead.aiScore >= 70 ? 'default' : lead.aiScore >= 50 ? 'secondary' : 'outline'}>
                            {lead.aiScore}
                          </Badge>
                        ) : '-'}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {format(new Date(lead.createdAt), 'MMM d, yyyy')}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </div>

          <DialogFooter className="border-t pt-4">
            <div className="flex items-center gap-2 mr-auto text-sm text-muted-foreground">
              {selectedLeads.length > 0 && (
                <span>{selectedLeads.length} leads selected</span>
              )}
            </div>
            <Button variant="outline" onClick={() => setShowLeadsDialog(false)}>
              Close
            </Button>
            <Button
              onClick={() => publishLeadsMutation.mutate({
                id: selectedRequest?.id || '',
                leadIds: selectedLeads.length > 0 ? selectedLeads : undefined,
                publishAll: selectedLeads.length === 0,
              })}
              disabled={publishLeadsMutation.isPending || (requestLeads.filter(l => l.qaStatus === 'approved').length === 0)}
            >
              {publishLeadsMutation.isPending ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Send className="h-4 w-4 mr-2" />
              )}
              {selectedLeads.length > 0
                ? `Publish ${selectedLeads.length} Selected`
                : 'Publish All Approved'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
