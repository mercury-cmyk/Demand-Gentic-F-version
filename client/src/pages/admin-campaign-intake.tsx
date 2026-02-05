/**
 * Admin Campaign Intake Page
 *
 * Lists all campaign intake requests from clients with:
 * - Filtering by status, client, priority
 * - Quick actions: Approve, Reject, Assign PM
 * - Link to agentic campaign creation
 */

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useLocation } from 'wouter';
import { apiRequest } from '@/lib/queryClient';
import { useToast } from '@/hooks/use-toast';
import { format } from 'date-fns';

// UI Components
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { Skeleton } from '@/components/ui/skeleton';

// Icons
import {
  Inbox,
  CheckCircle2,
  XCircle,
  UserPlus,
  MoreHorizontal,
  Play,
  Clock,
  AlertCircle,
  ArrowUpRight,
  Filter,
  RefreshCw,
  Sparkles,
  Building2,
  Calendar,
  Users,
  DollarSign,
} from 'lucide-react';

// Types
interface IntakeRequest {
  id: string;
  sourceType: string;
  clientAccountId: string | null;
  clientAccountName: string | null;
  status: string;
  priority: string;
  rawInput: string | null;
  extractedContext: any;
  assignedPmId: string | null;
  assignedPmName: string | null;
  requestedLeadCount: number | null;
  requestedStartDate: string | null;
  estimatedCost: string | null;
  campaignType: string | null;
  createdAt: string;
}

interface User {
  id: string;
  fullName: string;
  email: string;
}

const STATUS_COLORS: Record<string, string> = {
  pending: 'bg-yellow-100 text-yellow-800',
  approved: 'bg-blue-100 text-blue-800',
  rejected: 'bg-red-100 text-red-800',
  assigned: 'bg-purple-100 text-purple-800',
  pending_qso: 'bg-orange-100 text-orange-800',
  qso_approved: 'bg-green-100 text-green-800',
  in_progress: 'bg-indigo-100 text-indigo-800',
  completed: 'bg-emerald-100 text-emerald-800',
};

const PRIORITY_COLORS: Record<string, string> = {
  low: 'bg-gray-100 text-gray-600',
  normal: 'bg-blue-100 text-blue-600',
  high: 'bg-orange-100 text-orange-600',
  urgent: 'bg-red-100 text-red-600',
};

export default function AdminCampaignIntakePage() {
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Filter state
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [priorityFilter, setPriorityFilter] = useState<string>('all');

  // Dialog state
  const [assignDialogOpen, setAssignDialogOpen] = useState(false);
  const [rejectDialogOpen, setRejectDialogOpen] = useState(false);
  const [selectedRequest, setSelectedRequest] = useState<IntakeRequest | null>(null);
  const [rejectionReason, setRejectionReason] = useState('');
  const [selectedPmId, setSelectedPmId] = useState('');

  // Fetch intake requests
  const { data: intakeData, isLoading, refetch } = useQuery({
    queryKey: ['admin-campaign-intake', statusFilter, priorityFilter],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (statusFilter !== 'all') params.append('status', statusFilter);
      if (priorityFilter !== 'all') params.append('priority', priorityFilter);
      const res = await apiRequest('GET', `/api/admin/campaign-intake?${params.toString()}`);
      return res.json();
    },
  });

  // Fetch available PMs (users with admin or manager role)
  const { data: usersData } = useQuery({
    queryKey: ['admin-users-pms'],
    queryFn: async () => {
      const res = await apiRequest('GET', '/api/users');
      return res.json();
    },
  });

  // Mutations
  const approveMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await apiRequest('POST', `/api/admin/campaign-intake/${id}/approve`);
      return res.json();
    },
    onSuccess: () => {
      toast({ title: 'Request Approved', description: 'Campaign intake request has been approved.' });
      queryClient.invalidateQueries({ queryKey: ['admin-campaign-intake'] });
    },
    onError: (error: any) => {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    },
  });

  const rejectMutation = useMutation({
    mutationFn: async ({ id, reason }: { id: string; reason: string }) => {
      const res = await apiRequest('POST', `/api/admin/campaign-intake/${id}/reject`, { reason });
      return res.json();
    },
    onSuccess: () => {
      toast({ title: 'Request Rejected', description: 'Campaign intake request has been rejected.' });
      queryClient.invalidateQueries({ queryKey: ['admin-campaign-intake'] });
      setRejectDialogOpen(false);
      setRejectionReason('');
    },
    onError: (error: any) => {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    },
  });

  const assignMutation = useMutation({
    mutationFn: async ({ id, pmId }: { id: string; pmId: string }) => {
      const res = await apiRequest('POST', `/api/admin/campaign-intake/${id}/assign`, { pmId });
      return res.json();
    },
    onSuccess: () => {
      toast({ title: 'PM Assigned', description: 'Project manager has been assigned.' });
      queryClient.invalidateQueries({ queryKey: ['admin-campaign-intake'] });
      setAssignDialogOpen(false);
      setSelectedPmId('');
    },
    onError: (error: any) => {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    },
  });

  const qsoMutation = useMutation({
    mutationFn: async ({ id, action, notes }: { id: string; action: string; notes?: string }) => {
      const res = await apiRequest('POST', `/api/admin/campaign-intake/${id}/qso`, { action, notes });
      return res.json();
    },
    onSuccess: (_, { action }) => {
      toast({
        title: action === 'submit' ? 'Submitted to QSO' : 'QSO Approved',
        description: action === 'submit' ? 'Request submitted for QSO review.' : 'QSO review completed.',
      });
      queryClient.invalidateQueries({ queryKey: ['admin-campaign-intake'] });
    },
    onError: (error: any) => {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    },
  });

  const handleStartAgentic = (request: IntakeRequest) => {
    navigate(`/admin/agentic-campaign-creator?intakeId=${request.id}`);
  };

  const intakeRequests: IntakeRequest[] = intakeData?.data || [];
  const users: User[] = usersData || [];

  return (
    <div className="container mx-auto py-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Inbox className="h-6 w-6" />
            Campaign Intake
          </h1>
          <p className="text-muted-foreground">
            Manage campaign requests from clients
          </p>
        </div>
        <Button onClick={() => refetch()} variant="outline" size="sm">
          <RefreshCw className="h-4 w-4 mr-2" />
          Refresh
        </Button>
      </div>

      {/* Filters */}
      <Card>
        <CardHeader className="pb-4">
          <CardTitle className="text-base flex items-center gap-2">
            <Filter className="h-4 w-4" />
            Filters
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex gap-4">
            <div className="w-48">
              <Label className="text-xs">Status</Label>
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger>
                  <SelectValue placeholder="All Statuses" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Statuses</SelectItem>
                  <SelectItem value="pending">Pending</SelectItem>
                  <SelectItem value="approved">Approved</SelectItem>
                  <SelectItem value="assigned">Assigned</SelectItem>
                  <SelectItem value="pending_qso">Pending QSO</SelectItem>
                  <SelectItem value="qso_approved">QSO Approved</SelectItem>
                  <SelectItem value="in_progress">In Progress</SelectItem>
                  <SelectItem value="completed">Completed</SelectItem>
                  <SelectItem value="rejected">Rejected</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="w-48">
              <Label className="text-xs">Priority</Label>
              <Select value={priorityFilter} onValueChange={setPriorityFilter}>
                <SelectTrigger>
                  <SelectValue placeholder="All Priorities" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Priorities</SelectItem>
                  <SelectItem value="urgent">Urgent</SelectItem>
                  <SelectItem value="high">High</SelectItem>
                  <SelectItem value="normal">Normal</SelectItem>
                  <SelectItem value="low">Low</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Table */}
      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-6 space-y-4">
              {[...Array(5)].map((_, i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          ) : intakeRequests.length === 0 ? (
            <div className="p-12 text-center">
              <Inbox className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
              <h3 className="font-medium text-lg">No intake requests</h3>
              <p className="text-muted-foreground">Campaign requests from clients will appear here.</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Client</TableHead>
                  <TableHead>Request</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Priority</TableHead>
                  <TableHead>Assigned PM</TableHead>
                  <TableHead>Created</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {intakeRequests.map((request) => (
                  <TableRow key={request.id}>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <Building2 className="h-4 w-4 text-muted-foreground" />
                        <span className="font-medium">
                          {request.clientAccountName || 'Unknown Client'}
                        </span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="max-w-xs">
                        <p className="truncate text-sm">
                          {request.rawInput?.slice(0, 60) || 'No description'}
                          {(request.rawInput?.length || 0) > 60 && '...'}
                        </p>
                        <div className="flex gap-2 mt-1">
                          {request.campaignType && (
                            <Badge variant="outline" className="text-xs">
                              {request.campaignType.replace(/_/g, ' ')}
                            </Badge>
                          )}
                          {request.requestedLeadCount && (
                            <Badge variant="outline" className="text-xs">
                              <Users className="h-3 w-3 mr-1" />
                              {request.requestedLeadCount} leads
                            </Badge>
                          )}
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge className={STATUS_COLORS[request.status] || 'bg-gray-100'}>
                        {request.status.replace(/_/g, ' ')}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Badge className={PRIORITY_COLORS[request.priority] || 'bg-gray-100'}>
                        {request.priority}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      {request.assignedPmName || (
                        <span className="text-muted-foreground text-sm">Unassigned</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1 text-sm text-muted-foreground">
                        <Calendar className="h-3 w-3" />
                        {format(new Date(request.createdAt), 'MMM d, yyyy')}
                      </div>
                    </TableCell>
                    <TableCell className="text-right">
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon">
                            <MoreHorizontal className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          {/* View Details */}
                          <DropdownMenuItem onClick={() => navigate(`/admin/campaign-intake/${request.id}`)}>
                            <ArrowUpRight className="h-4 w-4 mr-2" />
                            View Details
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />

                          {/* Status-dependent actions */}
                          {request.status === 'pending' && (
                            <>
                              <DropdownMenuItem onClick={() => approveMutation.mutate(request.id)}>
                                <CheckCircle2 className="h-4 w-4 mr-2 text-green-600" />
                                Approve
                              </DropdownMenuItem>
                              <DropdownMenuItem
                                onClick={() => {
                                  setSelectedRequest(request);
                                  setRejectDialogOpen(true);
                                }}
                              >
                                <XCircle className="h-4 w-4 mr-2 text-red-600" />
                                Reject
                              </DropdownMenuItem>
                            </>
                          )}

                          {request.status === 'approved' && (
                            <DropdownMenuItem
                              onClick={() => {
                                setSelectedRequest(request);
                                setAssignDialogOpen(true);
                              }}
                            >
                              <UserPlus className="h-4 w-4 mr-2" />
                              Assign PM
                            </DropdownMenuItem>
                          )}

                          {request.status === 'assigned' && (
                            <DropdownMenuItem
                              onClick={() => qsoMutation.mutate({ id: request.id, action: 'submit' })}
                            >
                              <Clock className="h-4 w-4 mr-2" />
                              Submit to QSO
                            </DropdownMenuItem>
                          )}

                          {request.status === 'pending_qso' && (
                            <DropdownMenuItem
                              onClick={() => qsoMutation.mutate({ id: request.id, action: 'approve' })}
                            >
                              <CheckCircle2 className="h-4 w-4 mr-2 text-green-600" />
                              Approve QSO
                            </DropdownMenuItem>
                          )}

                          {request.status === 'qso_approved' && (
                            <>
                              <DropdownMenuSeparator />
                              <DropdownMenuItem onClick={() => handleStartAgentic(request)}>
                                <Sparkles className="h-4 w-4 mr-2 text-primary" />
                                Start Agentic Creation
                              </DropdownMenuItem>
                            </>
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

      {/* Assign PM Dialog */}
      <Dialog open={assignDialogOpen} onOpenChange={setAssignDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Assign Project Manager</DialogTitle>
            <DialogDescription>
              Select a project manager to handle this campaign request.
            </DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <Label>Project Manager</Label>
            <Select value={selectedPmId} onValueChange={setSelectedPmId}>
              <SelectTrigger>
                <SelectValue placeholder="Select a PM" />
              </SelectTrigger>
              <SelectContent>
                {users.map((user) => (
                  <SelectItem key={user.id} value={user.id}>
                    {user.fullName || user.email}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAssignDialogOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={() => {
                if (selectedRequest && selectedPmId) {
                  assignMutation.mutate({ id: selectedRequest.id, pmId: selectedPmId });
                }
              }}
              disabled={!selectedPmId || assignMutation.isPending}
            >
              {assignMutation.isPending ? 'Assigning...' : 'Assign PM'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Reject Dialog */}
      <Dialog open={rejectDialogOpen} onOpenChange={setRejectDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reject Request</DialogTitle>
            <DialogDescription>
              Please provide a reason for rejecting this campaign request.
            </DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <Label>Rejection Reason</Label>
            <Textarea
              value={rejectionReason}
              onChange={(e) => setRejectionReason(e.target.value)}
              placeholder="Enter the reason for rejection..."
              rows={3}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRejectDialogOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={() => {
                if (selectedRequest) {
                  rejectMutation.mutate({ id: selectedRequest.id, reason: rejectionReason });
                }
              }}
              disabled={!rejectionReason || rejectMutation.isPending}
            >
              {rejectMutation.isPending ? 'Rejecting...' : 'Reject Request'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
