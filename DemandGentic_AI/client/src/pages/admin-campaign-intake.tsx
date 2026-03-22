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

const STATUS_COLORS: Record = {
  pending: 'bg-yellow-100 text-yellow-800',
  approved: 'bg-blue-100 text-blue-800',
  rejected: 'bg-red-100 text-red-800',
  assigned: 'bg-purple-100 text-purple-800',
  pending_qso: 'bg-orange-100 text-orange-800',
  qso_approved: 'bg-green-100 text-green-800',
  in_progress: 'bg-indigo-100 text-indigo-800',
  completed: 'bg-emerald-100 text-emerald-800',
};

const PRIORITY_COLORS: Record = {
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
  const [statusFilter, setStatusFilter] = useState('all');
  const [priorityFilter, setPriorityFilter] = useState('all');

  // Dialog state
  const [assignDialogOpen, setAssignDialogOpen] = useState(false);
  const [rejectDialogOpen, setRejectDialogOpen] = useState(false);
  const [selectedRequest, setSelectedRequest] = useState(null);
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
    
      {/* Header */}
      
        
          
            
            Campaign Intake
          
          
            Manage campaign requests from clients
          
        
         refetch()} variant="outline" size="sm">
          
          Refresh
        
      

      {/* Filters */}
      
        
          
            
            Filters
          
        
        
          
            
              Status
              
                
                  
                
                
                  All Statuses
                  Pending
                  Approved
                  Assigned
                  Pending QSO
                  QSO Approved
                  In Progress
                  Completed
                  Rejected
                
              
            
            
              Priority
              
                
                  
                
                
                  All Priorities
                  Urgent
                  High
                  Normal
                  Low
                
              
            
          
        
      

      {/* Table */}
      
        
          {isLoading ? (
            
              {[...Array(5)].map((_, i) => (
                
              ))}
            
          ) : intakeRequests.length === 0 ? (
            
              
              No intake requests
              Campaign requests from clients will appear here.
            
          ) : (
            
              
                
                  Client
                  Request
                  Status
                  Priority
                  Assigned PM
                  Created
                  Actions
                
              
              
                {intakeRequests.map((request) => (
                  
                    
                      
                        
                        
                          {request.clientAccountName || 'Unknown Client'}
                        
                      
                    
                    
                      
                        
                          {request.rawInput?.slice(0, 60) || 'No description'}
                          {(request.rawInput?.length || 0) > 60 && '...'}
                        
                        
                          {request.campaignType && (
                            
                              {request.campaignType.replace(/_/g, ' ')}
                            
                          )}
                          {request.requestedLeadCount && (
                            
                              
                              {request.requestedLeadCount} leads
                            
                          )}
                        
                      
                    
                    
                      
                        {request.status.replace(/_/g, ' ')}
                      
                    
                    
                      
                        {request.priority}
                      
                    
                    
                      {request.assignedPmName || (
                        Unassigned
                      )}
                    
                    
                      
                        
                        {format(new Date(request.createdAt), 'MMM d, yyyy')}
                      
                    
                    
                      
                        
                          
                            
                          
                        
                        
                          {/* View Details */}
                           navigate(`/admin/campaign-intake/${request.id}`)}>
                            
                            View Details
                          
                          

                          {/* Status-dependent actions */}
                          {request.status === 'pending' && (
                            <>
                               approveMutation.mutate(request.id)}>
                                
                                Approve
                              
                               {
                                  setSelectedRequest(request);
                                  setRejectDialogOpen(true);
                                }}
                              >
                                
                                Reject
                              
                            
                          )}

                          {request.status === 'approved' && (
                             {
                                setSelectedRequest(request);
                                setAssignDialogOpen(true);
                              }}
                            >
                              
                              Assign PM
                            
                          )}

                          {request.status === 'assigned' && (
                             qsoMutation.mutate({ id: request.id, action: 'submit' })}
                            >
                              
                              Submit to QSO
                            
                          )}

                          {request.status === 'pending_qso' && (
                             qsoMutation.mutate({ id: request.id, action: 'approve' })}
                            >
                              
                              Approve QSO
                            
                          )}

                          {request.status === 'qso_approved' && (
                            <>
                              
                               handleStartAgentic(request)}>
                                
                                Start Agentic Creation
                              
                            
                          )}
                        
                      
                    
                  
                ))}
              
            
          )}
        
      

      {/* Assign PM Dialog */}
      
        
          
            Assign Project Manager
            
              Select a project manager to handle this campaign request.
            
          
          
            Project Manager
            
              
                
              
              
                {users.map((user) => (
                  
                    {user.fullName || user.email}
                  
                ))}
              
            
          
          
             setAssignDialogOpen(false)}>
              Cancel
            
             {
                if (selectedRequest && selectedPmId) {
                  assignMutation.mutate({ id: selectedRequest.id, pmId: selectedPmId });
                }
              }}
              disabled={!selectedPmId || assignMutation.isPending}
            >
              {assignMutation.isPending ? 'Assigning...' : 'Assign PM'}
            
          
        
      

      {/* Reject Dialog */}
      
        
          
            Reject Request
            
              Please provide a reason for rejecting this campaign request.
            
          
          
            Rejection Reason
             setRejectionReason(e.target.value)}
              placeholder="Enter the reason for rejection..."
              rows={3}
            />
          
          
             setRejectDialogOpen(false)}>
              Cancel
            
             {
                if (selectedRequest) {
                  rejectMutation.mutate({ id: selectedRequest.id, reason: rejectionReason });
                }
              }}
              disabled={!rejectionReason || rejectMutation.isPending}
            >
              {rejectMutation.isPending ? 'Rejecting...' : 'Reject Request'}
            
          
        
      
    
  );
}