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
  const [selectedRequest, setSelectedRequest] = useState(null);
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
  const { data: requests, isLoading } = useQuery({
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
        return Pending;
      case 'approved':
        return Approved;
      case 'denied':
        return Denied;
      case 'expired':
        return Expired;
      case 'revoked':
        return Revoked;
      default:
        return {status};
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
    
      {/* Header */}
      
        
          
            
          
        
        
          Access Requests
          
            Request and manage access to resources
          
        
         setShowCreateModal(true)}>
          
          New Request
        
      

      {/* Tabs */}
      
        
          
            
              Pending
              {pendingCount > 0 && (
                
                  {pendingCount}
                
              )}
            
            Approved
            Denied
            All
          
          
          
            
             setSearchQuery(e.target.value)}
              className="pl-10"
            />
          
        

        
          
            
              
                {activeTab.charAt(0).toUpperCase() + activeTab.slice(1)} Requests
              
              
                {filteredRequests?.length ?? 0} requests
              
            
            
              {isLoading ? (
                
                  {[1, 2, 3].map(i => )}
                
              ) : filteredRequests && filteredRequests.length > 0 ? (
                
                  
                    
                      Resource
                      Actions
                      Duration
                      Status
                      Submitted
                      Review
                    
                  
                  
                    {filteredRequests.map((request) => (
                      
                        
                          
                            {request.entityType}
                            {request.entityName && (
                              {request.entityName}
                            )}
                          
                          
                            {request.reason}
                          
                        
                        
                          
                            {request.actions.slice(0, 2).map(action => (
                              
                                {action}
                              
                            ))}
                            {request.actions.length > 2 && (
                              
                                +{request.actions.length - 2}
                              
                            )}
                          
                        
                        
                          {request.requestedDuration || 'Permanent'}
                        
                        
                          {getStatusBadge(request.status)}
                        
                        
                          {new Date(request.createdAt).toLocaleDateString()}
                        
                        
                          {request.status === 'pending' ? (
                            
                               {
                                  setSelectedRequest(request);
                                  setShowReviewModal(true);
                                }}
                              >
                                
                                Review
                              
                            
                          ) : (
                             {
                                setSelectedRequest(request);
                                setShowReviewModal(true);
                              }}
                            >
                              View
                            
                          )}
                        
                      
                    ))}
                  
                
              ) : (
                
                  
                  No requests
                  
                    {activeTab === 'pending' 
                      ? 'No pending access requests to review'
                      : 'No requests match your filters'
                    }
                  
                
              )}
            
          
        
      

      {/* Create Request Modal */}
      
        
          
            Request Access
            
              Submit a request for access to a resource
            
          
          
          
            
              
                Entity Type
                 setNewRequest({ ...newRequest, entityType: v })}>
                  
                    
                  
                  
                    {ENTITY_TYPES.map(type => (
                      
                        {type.replace(/_/g, ' ')}
                      
                    ))}
                  
                
              
              
                Duration
                 setNewRequest({ ...newRequest, requestedDuration: v })}>
                  
                    
                  
                  
                    {DURATION_OPTIONS.map(opt => (
                      
                        {opt.label}
                      
                    ))}
                  
                
              
            
            
            
              Resource Name (Optional)
               setNewRequest({ ...newRequest, entityName: e.target.value })}
                placeholder="e.g., Account name, Campaign name"
              />
            
            
            
              Actions Needed
              
                {ACTIONS.map(action => (
                  
                     toggleAction(action)}
                    />
                    
                      {action.replace(/_/g, ' ')}
                    
                  
                ))}
              
            
            
            
              Reason for Access
               setNewRequest({ ...newRequest, reason: e.target.value })}
                placeholder="Explain why you need this access (minimum 10 characters)"
                rows={3}
              />
            
          
          
          
             {
              setShowCreateModal(false);
              resetNewRequest();
            }}>
              Cancel
            
             createRequestMutation.mutate(newRequest)}
              disabled={
                !newRequest.entityType || 
                newRequest.actions.length === 0 || 
                newRequest.reason.length 
              {createRequestMutation.isPending ? 'Submitting...' : 'Submit Request'}
            
          
        
      

      {/* Review Request Modal */}
      
        
          
            Review Access Request
            
              {selectedRequest?.status === 'pending' 
                ? 'Approve or deny this access request'
                : 'View request details'
              }
            
          
          
          {selectedRequest && (
            
              
                
                  Entity Type
                  {selectedRequest.entityType}
                
                
                  Duration
                  {selectedRequest.requestedDuration || 'Permanent'}
                
              
              
              
                Actions Requested
                
                  {selectedRequest.actions.map(action => (
                    {action}
                  ))}
                
              
              
              
                Reason
                
                  {selectedRequest.reason}
                
              
              
              
                Status
                {getStatusBadge(selectedRequest.status)}
              
              
              {selectedRequest.status === 'pending' && (
                
                  Review Notes (Optional)
                   setReviewNotes(e.target.value)}
                    placeholder="Add notes for your decision..."
                  />
                
              )}
              
              {selectedRequest.reviewNotes && (
                
                  Reviewer Notes
                  
                    {selectedRequest.reviewNotes}
                  
                
              )}
            
          )}
          
          
             {
              setShowReviewModal(false);
              setSelectedRequest(null);
              setReviewNotes('');
            }}>
              Close
            
            
            {selectedRequest?.status === 'pending' && (
              <>
                 reviewRequestMutation.mutate({
                    id: selectedRequest.id,
                    action: 'deny',
                    notes: reviewNotes
                  })}
                  disabled={reviewRequestMutation.isPending}
                >
                  
                  Deny
                
                 reviewRequestMutation.mutate({
                    id: selectedRequest.id,
                    action: 'approve',
                    notes: reviewNotes
                  })}
                  disabled={reviewRequestMutation.isPending}
                >
                  
                  Approve
                
              
            )}
          
        
      
    
  );
}