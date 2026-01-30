/**
 * IAM Access Requests Page
 * 
 * Manage access requests from users
 */

import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Link } from 'wouter';
import { 
  Clock, Search, Plus, ChevronLeft, CheckCircle, XCircle, 
  AlertCircle, User, Calendar, FileText
} from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { useToast } from '@/hooks/use-toast';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@/components/ui/tabs';

interface AccessRequest {
  id: string;
  requesterId: string;
  entityType: string;
  entityId?: string;
  entityName?: string;
  actions: string[];
  requestedDuration?: string;
  reason: string;
  status: 'pending' | 'approved' | 'denied' | 'expired' | 'revoked';
  reviewerId?: string;
  reviewedAt?: string;
  reviewNotes?: string;
  grantId?: string;
  createdAt: string;
}

const ENTITY_TYPES = [
  'account', 'project', 'campaign', 'agent', 'call_session',
  'recording', 'transcript', 'report', 'lead', 'delivery',
  'domain', 'smtp', 'email_template', 'prompt', 'quality_review'
];

const ACTIONS = [
  'view', 'create', 'edit', 'delete', 'run', 'execute',
  'approve', 'publish', 'assign', 'export', 'view_sensitive'
];

const DURATION_OPTIONS = [
  { value: '1h', label: '1 Hour' },
  { value: '4h', label: '4 Hours' },
  { value: '1d', label: '1 Day' },
  { value: '7d', label: '7 Days' },
  { value: '30d', label: '30 Days' },
  { value: '', label: 'Permanent' },
];

export default function IamRequests() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState('pending');
  const [searchQuery, setSearchQuery] = useState('');
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showReviewModal, setShowReviewModal] = useState(false);
  const [selectedRequest, setSelectedRequest] = useState<AccessRequest | null>(null);
  const [reviewNotes, setReviewNotes] = useState('');
  
  const [newRequest, setNewRequest] = useState({
    entityType: '',
    entityId: '',
    entityName: '',
    actions: [] as string[],
    requestedDuration: '7d',
    reason: '',
  });

  // Fetch requests
  const { data: requests, isLoading } = useQuery<AccessRequest[]>({
    queryKey: ['/api/iam/requests'],
  });

  // Create request mutation
  const createRequestMutation = useMutation({
    mutationFn: async (data: typeof newRequest) => {
      const res = await fetch('/api/iam/requests', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(data),
      });
      if (!res.ok) throw new Error('Failed to create request');
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/iam/requests'] });
      setShowCreateModal(false);
      resetNewRequest();
      toast({ title: 'Access request submitted' });
    },
    onError: () => {
      toast({ title: 'Failed to submit request', variant: 'destructive' });
    },
  });

  // Review request mutation
  const reviewRequestMutation = useMutation({
    mutationFn: async ({ id, action, notes }: { id: string; action: 'approve' | 'deny'; notes?: string }) => {
      const res = await fetch(`/api/iam/requests/${id}/review`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ action, reviewNotes: notes }),
      });
      if (!res.ok) throw new Error('Failed to review request');
      return res.json();
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['/api/iam/requests'] });
      setShowReviewModal(false);
      setSelectedRequest(null);
      setReviewNotes('');
      toast({ 
        title: variables.action === 'approve' ? 'Request approved' : 'Request denied'
      });
    },
    onError: () => {
      toast({ title: 'Failed to review request', variant: 'destructive' });
    },
  });

  const resetNewRequest = () => {
    setNewRequest({
      entityType: '',
      entityId: '',
      entityName: '',
      actions: [],
      requestedDuration: '7d',
      reason: '',
    });
  };

  const toggleAction = (action: string) => {
    setNewRequest(prev => ({
      ...prev,
      actions: prev.actions.includes(action)
        ? prev.actions.filter(a => a !== action)
        : [...prev.actions, action]
    }));
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'pending':
        return <Badge variant="outline" className="text-yellow-600 border-yellow-600"><Clock className="h-3 w-3 mr-1" />Pending</Badge>;
      case 'approved':
        return <Badge variant="default" className="bg-green-600"><CheckCircle className="h-3 w-3 mr-1" />Approved</Badge>;
      case 'denied':
        return <Badge variant="destructive"><XCircle className="h-3 w-3 mr-1" />Denied</Badge>;
      case 'expired':
        return <Badge variant="secondary"><AlertCircle className="h-3 w-3 mr-1" />Expired</Badge>;
      case 'revoked':
        return <Badge variant="outline"><XCircle className="h-3 w-3 mr-1" />Revoked</Badge>;
      default:
        return <Badge variant="secondary">{status}</Badge>;
    }
  };

  const filteredRequests = requests?.filter(req => {
    const matchesSearch = 
      req.entityType.toLowerCase().includes(searchQuery.toLowerCase()) ||
      req.reason.toLowerCase().includes(searchQuery.toLowerCase()) ||
      req.entityName?.toLowerCase().includes(searchQuery.toLowerCase());
    
    if (activeTab === 'all') return matchesSearch;
    return matchesSearch && req.status === activeTab;
  });

  const pendingCount = requests?.filter(r => r.status === 'pending').length || 0;

  return (
    <div className="container mx-auto p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Link href="/iam">
          <Button variant="ghost" size="icon">
            <ChevronLeft className="h-5 w-5" />
          </Button>
        </Link>
        <div className="flex-1">
          <h1 className="text-3xl font-bold tracking-tight">Access Requests</h1>
          <p className="text-muted-foreground">
            Request and manage access to resources
          </p>
        </div>
        <Button onClick={() => setShowCreateModal(true)}>
          <Plus className="h-4 w-4 mr-2" />
          New Request
        </Button>
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <div className="flex items-center justify-between">
          <TabsList>
            <TabsTrigger value="pending" className="gap-2">
              Pending
              {pendingCount > 0 && (
                <Badge variant="destructive" className="ml-1">
                  {pendingCount}
                </Badge>
              )}
            </TabsTrigger>
            <TabsTrigger value="approved">Approved</TabsTrigger>
            <TabsTrigger value="denied">Denied</TabsTrigger>
            <TabsTrigger value="all">All</TabsTrigger>
          </TabsList>
          
          <div className="relative w-64">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search requests..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10"
            />
          </div>
        </div>

        <TabsContent value={activeTab} className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle>
                {activeTab.charAt(0).toUpperCase() + activeTab.slice(1)} Requests
              </CardTitle>
              <CardDescription>
                {filteredRequests?.length ?? 0} requests
              </CardDescription>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <div className="space-y-3">
                  {[1, 2, 3].map(i => <Skeleton key={i} className="h-16" />)}
                </div>
              ) : filteredRequests && filteredRequests.length > 0 ? (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Resource</TableHead>
                      <TableHead>Actions</TableHead>
                      <TableHead>Duration</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Submitted</TableHead>
                      <TableHead className="text-right">Review</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredRequests.map((request) => (
                      <TableRow key={request.id}>
                        <TableCell>
                          <div>
                            <Badge variant="outline">{request.entityType}</Badge>
                            {request.entityName && (
                              <span className="ml-2 text-sm">{request.entityName}</span>
                            )}
                          </div>
                          <p className="text-sm text-muted-foreground mt-1 line-clamp-1">
                            {request.reason}
                          </p>
                        </TableCell>
                        <TableCell>
                          <div className="flex flex-wrap gap-1">
                            {request.actions.slice(0, 2).map(action => (
                              <Badge key={action} variant="secondary" className="text-xs">
                                {action}
                              </Badge>
                            ))}
                            {request.actions.length > 2 && (
                              <Badge variant="secondary" className="text-xs">
                                +{request.actions.length - 2}
                              </Badge>
                            )}
                          </div>
                        </TableCell>
                        <TableCell className="text-muted-foreground">
                          {request.requestedDuration || 'Permanent'}
                        </TableCell>
                        <TableCell>
                          {getStatusBadge(request.status)}
                        </TableCell>
                        <TableCell className="text-muted-foreground">
                          {new Date(request.createdAt).toLocaleDateString()}
                        </TableCell>
                        <TableCell className="text-right">
                          {request.status === 'pending' ? (
                            <div className="flex gap-2 justify-end">
                              <Button 
                                size="sm" 
                                variant="outline"
                                onClick={() => {
                                  setSelectedRequest(request);
                                  setShowReviewModal(true);
                                }}
                              >
                                <CheckCircle className="h-4 w-4 mr-1" />
                                Review
                              </Button>
                            </div>
                          ) : (
                            <Button 
                              size="sm" 
                              variant="ghost"
                              onClick={() => {
                                setSelectedRequest(request);
                                setShowReviewModal(true);
                              }}
                            >
                              View
                            </Button>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              ) : (
                <div className="text-center py-8">
                  <Clock className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                  <h3 className="text-lg font-medium mb-2">No requests</h3>
                  <p className="text-muted-foreground mb-4">
                    {activeTab === 'pending' 
                      ? 'No pending access requests to review'
                      : 'No requests match your filters'
                    }
                  </p>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Create Request Modal */}
      <Dialog open={showCreateModal} onOpenChange={setShowCreateModal}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Request Access</DialogTitle>
            <DialogDescription>
              Submit a request for access to a resource
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Entity Type</Label>
                <Select value={newRequest.entityType} onValueChange={(v) => setNewRequest({ ...newRequest, entityType: v })}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select type..." />
                  </SelectTrigger>
                  <SelectContent>
                    {ENTITY_TYPES.map(type => (
                      <SelectItem key={type} value={type}>
                        {type.replace(/_/g, ' ')}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Duration</Label>
                <Select value={newRequest.requestedDuration} onValueChange={(v) => setNewRequest({ ...newRequest, requestedDuration: v })}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {DURATION_OPTIONS.map(opt => (
                      <SelectItem key={opt.value || 'permanent'} value={opt.value}>
                        {opt.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            
            <div>
              <Label>Resource Name (Optional)</Label>
              <Input
                value={newRequest.entityName}
                onChange={(e) => setNewRequest({ ...newRequest, entityName: e.target.value })}
                placeholder="e.g., Account name, Campaign name"
              />
            </div>
            
            <div>
              <Label>Actions Needed</Label>
              <div className="grid grid-cols-3 gap-2 mt-2 p-3 border rounded-md">
                {ACTIONS.map(action => (
                  <div key={action} className="flex items-center space-x-2">
                    <Checkbox 
                      id={`req-action-${action}`}
                      checked={newRequest.actions.includes(action)}
                      onCheckedChange={() => toggleAction(action)}
                    />
                    <Label htmlFor={`req-action-${action}`} className="cursor-pointer text-sm">
                      {action.replace(/_/g, ' ')}
                    </Label>
                  </div>
                ))}
              </div>
            </div>
            
            <div>
              <Label>Reason for Access</Label>
              <Textarea
                value={newRequest.reason}
                onChange={(e) => setNewRequest({ ...newRequest, reason: e.target.value })}
                placeholder="Explain why you need this access (minimum 10 characters)"
                rows={3}
              />
            </div>
          </div>
          
          <DialogFooter>
            <Button variant="outline" onClick={() => {
              setShowCreateModal(false);
              resetNewRequest();
            }}>
              Cancel
            </Button>
            <Button 
              onClick={() => createRequestMutation.mutate(newRequest)}
              disabled={
                !newRequest.entityType || 
                newRequest.actions.length === 0 || 
                newRequest.reason.length < 10 ||
                createRequestMutation.isPending
              }
            >
              {createRequestMutation.isPending ? 'Submitting...' : 'Submit Request'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Review Request Modal */}
      <Dialog open={showReviewModal} onOpenChange={setShowReviewModal}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Review Access Request</DialogTitle>
            <DialogDescription>
              {selectedRequest?.status === 'pending' 
                ? 'Approve or deny this access request'
                : 'View request details'
              }
            </DialogDescription>
          </DialogHeader>
          
          {selectedRequest && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label className="text-muted-foreground">Entity Type</Label>
                  <p className="font-medium">{selectedRequest.entityType}</p>
                </div>
                <div>
                  <Label className="text-muted-foreground">Duration</Label>
                  <p className="font-medium">{selectedRequest.requestedDuration || 'Permanent'}</p>
                </div>
              </div>
              
              <div>
                <Label className="text-muted-foreground">Actions Requested</Label>
                <div className="flex flex-wrap gap-1 mt-1">
                  {selectedRequest.actions.map(action => (
                    <Badge key={action}>{action}</Badge>
                  ))}
                </div>
              </div>
              
              <div>
                <Label className="text-muted-foreground">Reason</Label>
                <p className="mt-1 p-3 bg-muted rounded-md text-sm">
                  {selectedRequest.reason}
                </p>
              </div>
              
              <div>
                <Label className="text-muted-foreground">Status</Label>
                <div className="mt-1">{getStatusBadge(selectedRequest.status)}</div>
              </div>
              
              {selectedRequest.status === 'pending' && (
                <div>
                  <Label>Review Notes (Optional)</Label>
                  <Textarea
                    value={reviewNotes}
                    onChange={(e) => setReviewNotes(e.target.value)}
                    placeholder="Add notes for your decision..."
                  />
                </div>
              )}
              
              {selectedRequest.reviewNotes && (
                <div>
                  <Label className="text-muted-foreground">Reviewer Notes</Label>
                  <p className="mt-1 p-3 bg-muted rounded-md text-sm">
                    {selectedRequest.reviewNotes}
                  </p>
                </div>
              )}
            </div>
          )}
          
          <DialogFooter>
            <Button variant="outline" onClick={() => {
              setShowReviewModal(false);
              setSelectedRequest(null);
              setReviewNotes('');
            }}>
              Close
            </Button>
            
            {selectedRequest?.status === 'pending' && (
              <>
                <Button 
                  variant="destructive"
                  onClick={() => reviewRequestMutation.mutate({
                    id: selectedRequest.id,
                    action: 'deny',
                    notes: reviewNotes
                  })}
                  disabled={reviewRequestMutation.isPending}
                >
                  <XCircle className="h-4 w-4 mr-2" />
                  Deny
                </Button>
                <Button 
                  onClick={() => reviewRequestMutation.mutate({
                    id: selectedRequest.id,
                    action: 'approve',
                    notes: reviewNotes
                  })}
                  disabled={reviewRequestMutation.isPending}
                >
                  <CheckCircle className="h-4 w-4 mr-2" />
                  Approve
                </Button>
              </>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
