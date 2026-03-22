/**
 * QA Review Center Page
 * Admin interface for reviewing and approving QA-gated content
 */

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import {
  QAStatusBadge,
  QAScoreBadge,
  QAContentTypeBadge,
  type QAStatus,
} from "@/components/qa/qa-status-badge";
import {
  CheckCircle,
  XCircle,
  Eye,
  Send,
  RefreshCw,
  Filter,
  BarChart3,
  FileText,
  Phone,
  Play,
  Download,
} from "lucide-react";

// Types
interface QAContent {
  id: string;
  contentType: 'simulation' | 'mock_call' | 'report' | 'data_export';
  contentId: string;
  qaStatus: QAStatus;
  qaScore: number | null;
  qaNotes: string | null;
  clientVisible: boolean;
  createdAt: string;
  reviewedAt: string | null;
}

interface QAContentWithClient {
  qaContent: QAContent;
  clientAccount: {
    id: string;
    name: string;
    companyName: string | null;
  } | null;
}

interface QAStats {
  byStatus: Record;
  byType: Record;
}

// API functions
async function fetchQAContent(params: { status?: string; contentType?: string }) {
  const searchParams = new URLSearchParams();
  if (params.status) searchParams.set('status', params.status);
  if (params.contentType) searchParams.set('contentType', params.contentType);

  const response = await apiRequest('GET', `/api/admin/qa-content?${searchParams.toString()}`);
  return response.json();
}

async function fetchQAStats() {
  const response = await apiRequest('GET', '/api/admin/qa-content/stats');
  return response.json();
}

async function reviewContent(id: string, review: { status: QAStatus; score?: number; notes?: string }) {
  const response = await apiRequest('PATCH', `/api/admin/qa-content/${id}/review`, review);
  return response.json();
}

async function publishContent(id: string) {
  const response = await apiRequest('POST', `/api/admin/qa-content/${id}/publish`);
  return response.json();
}

async function analyzeContent(id: string) {
  const response = await apiRequest('POST', `/api/admin/qa-content/${id}/analyze`);
  return response.json();
}

async function bulkReview(contentIds: string[], review: { status: QAStatus; notes?: string }) {
  const response = await apiRequest('POST', '/api/admin/qa-content/bulk-review', { contentIds, ...review });
  return response.json();
}

async function migrateLegacyQAContent() {
  const response = await apiRequest('POST', '/api/admin/qa-content/migrate');
  return response.json();
}

export default function QAReviewCenter() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // State
  const [activeTab, setActiveTab] = useState('all');
  const [contentTypeFilter, setContentTypeFilter] = useState('all');
  const [selectedItems, setSelectedItems] = useState([]);
  const [reviewDialogOpen, setReviewDialogOpen] = useState(false);
  const [selectedContent, setSelectedContent] = useState(null);
  const [reviewForm, setReviewForm] = useState({
    status: 'approved',
    score: '',
    notes: '',
  });

  // Status filter based on active tab
  const statusFilter = activeTab === 'pending' ? 'new,under_review' :
    activeTab === 'approved' ? 'approved,published' :
    activeTab === 'rejected' ? 'rejected,returned' : undefined;

  // Queries
  const { data: contentData, isLoading } = useQuery({
    queryKey: ['qa-content', statusFilter, contentTypeFilter],
    queryFn: () => fetchQAContent({
      status: statusFilter,
      contentType: contentTypeFilter !== 'all' ? contentTypeFilter : undefined,
    }),
  });

  const { data: statsData } = useQuery({
    queryKey: ['qa-stats'],
    queryFn: fetchQAStats,
  });

  // Mutations
  const reviewMutation = useMutation({
    mutationFn: ({ id, review }: { id: string; review: { status: QAStatus; score?: number; notes?: string } }) =>
      reviewContent(id, review),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['qa-content'] });
      queryClient.invalidateQueries({ queryKey: ['qa-stats'] });
      toast({ title: 'Review submitted successfully' });
      setReviewDialogOpen(false);
      setSelectedContent(null);
    },
    onError: () => {
      toast({ title: 'Failed to submit review', variant: 'destructive' });
    },
  });

  const publishMutation = useMutation({
    mutationFn: publishContent,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['qa-content'] });
      queryClient.invalidateQueries({ queryKey: ['qa-stats'] });
      toast({ title: 'Content published to client' });
    },
    onError: () => {
      toast({ title: 'Failed to publish content', variant: 'destructive' });
    },
  });

  const analyzeMutation = useMutation({
    mutationFn: analyzeContent,
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['qa-content'] });
      queryClient.invalidateQueries({ queryKey: ['qa-stats'] });
      toast({
        title: 'Analysis complete',
        description: `Score: ${data.analysis?.score || 'N/A'}`,
      });
    },
    onError: () => {
      toast({ title: 'Failed to analyze content', variant: 'destructive' });
    },
  });

  const bulkReviewMutation = useMutation({
    mutationFn: ({ contentIds, review }: { contentIds: string[]; review: { status: QAStatus; notes?: string } }) =>
      bulkReview(contentIds, review),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['qa-content'] });
      queryClient.invalidateQueries({ queryKey: ['qa-stats'] });
      toast({
        title: 'Bulk review complete',
        description: `${data.result?.success || 0} items reviewed`,
      });
      setSelectedItems([]);
    },
    onError: () => {
      toast({ title: 'Failed to bulk review', variant: 'destructive' });
    },
  });

  const migrateMutation = useMutation({
    mutationFn: migrateLegacyQAContent,
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['qa-content'] });
      queryClient.invalidateQueries({ queryKey: ['qa-stats'] });
      toast({
        title: 'Migration complete',
        description: `${data?.result?.totalLinked ?? 0} legacy item(s) linked to QA Review Center`,
      });
    },
    onError: (error: unknown) => {
      const message = error instanceof Error ? error.message : 'Failed to migrate legacy content';
      toast({ title: 'Migration failed', description: message, variant: 'destructive' });
    },
  });

  // Handlers
  const handleReview = (content: QAContentWithClient) => {
    setSelectedContent(content);
    setReviewForm({
      status: 'approved',
      score: content.qaContent.qaScore?.toString() || '',
      notes: content.qaContent.qaNotes || '',
    });
    setReviewDialogOpen(true);
  };

  const handleSubmitReview = () => {
    if (!selectedContent) return;
    reviewMutation.mutate({
      id: selectedContent.qaContent.id,
      review: {
        status: reviewForm.status,
        score: reviewForm.score ? parseInt(reviewForm.score) : undefined,
        notes: reviewForm.notes || undefined,
      },
    });
  };

  const handleBulkApprove = () => {
    if (selectedItems.length === 0) return;
    bulkReviewMutation.mutate({
      contentIds: selectedItems,
      review: { status: 'approved' },
    });
  };

  const handleBulkReject = () => {
    if (selectedItems.length === 0) return;
    bulkReviewMutation.mutate({
      contentIds: selectedItems,
      review: { status: 'rejected', notes: 'Bulk rejected' },
    });
  };

  const toggleSelectItem = (id: string) => {
    setSelectedItems(prev =>
      prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]
    );
  };

  const toggleSelectAll = () => {
    if (!contentData?.content) return;
    const allIds = contentData.content.map((c: QAContentWithClient) => c.qaContent.id);
    if (selectedItems.length === allIds.length) {
      setSelectedItems([]);
    } else {
      setSelectedItems(allIds);
    }
  };

  const getContentTypeIcon = (type: string) => {
    switch (type) {
      case 'simulation': return ;
      case 'mock_call': return ;
      case 'report': return ;
      case 'data_export': return ;
      default: return ;
    }
  };

  const stats = statsData?.stats as QAStats | undefined;
  const content = contentData?.content as QAContentWithClient[] | undefined;
  const availableOutsidePending =
    (stats?.byStatus?.approved || 0) +
    (stats?.byStatus?.published || 0) +
    (stats?.byStatus?.rejected || 0) +
    (stats?.byStatus?.returned || 0);

  return (
    
      {/* Header */}
      
        
          QA Review Center
          
            Review and approve content before publishing to clients
          
        
        
           migrateMutation.mutate()}
            disabled={migrateMutation.isPending}
          >
            
            {migrateMutation.isPending ? 'Migrating...' : 'Migrate Legacy Content'}
          
           queryClient.invalidateQueries({ queryKey: ['qa-content'] })}>
            
            Refresh
          
        
      

      {/* Stats Cards */}
      {stats && (
        
          
            
              Pending Review
              
                {(stats.byStatus?.new || 0) + (stats.byStatus?.under_review || 0)}
              
            
          
          
            
              Approved
              
                {stats.byStatus?.approved || 0}
              
            
          
          
            
              Published
              
                {stats.byStatus?.published || 0}
              
            
          
          
            
              Rejected
              
                {stats.byStatus?.rejected || 0}
              
            
          
        
      )}

      {/* Filters and Actions */}
      
        
          
            
              
              
                
                  
                
                
                  All Types
                  Simulations
                  Mock Calls
                  Reports
                  Data Exports
                
              
            
            {selectedItems.length > 0 && (
              
                
                  {selectedItems.length} selected
                
                
                  
                  Approve
                
                
                  
                  Reject
                
              
            )}
          
        
        
          
            
              
                Pending Review
                {stats && (
                  
                    {(stats.byStatus?.new || 0) + (stats.byStatus?.under_review || 0)}
                  
                )}
              
              Approved
              Rejected
              All
            

            
              {isLoading ? (
                
                  
                
              ) : content && content.length > 0 ? (
                
                  
                    
                      
                        
                      
                      Type
                      Client
                      Status
                      Score
                      Created
                      Actions
                    
                  
                  
                    {content.map((item) => (
                      
                        
                           toggleSelectItem(item.qaContent.id)}
                          />
                        
                        
                          
                            {getContentTypeIcon(item.qaContent.contentType)}
                            
                          
                        
                        
                          {item.clientAccount?.name || 'Unknown Client'}
                          {item.clientAccount?.companyName && (
                            
                              {item.clientAccount.companyName}
                            
                          )}
                        
                        
                          
                        
                        
                          {item.qaContent.qaScore !== null ? (
                            
                          ) : (
                            -
                          )}
                        
                        
                          {new Date(item.qaContent.createdAt).toLocaleDateString()}
                        
                        
                          
                             analyzeMutation.mutate(item.qaContent.id)}
                              disabled={analyzeMutation.isPending}
                            >
                              
                            
                             handleReview(item)}
                            >
                              
                            
                            {item.qaContent.qaStatus === 'approved' && (
                               publishMutation.mutate(item.qaContent.id)}
                                disabled={publishMutation.isPending}
                              >
                                
                              
                            )}
                          
                        
                      
                    ))}
                  
                
              ) : (
                
                  
                    {activeTab === 'pending'
                      ? 'No pending review items found.'
                      : 'No content found for this filter.'}
                  
                  {activeTab === 'pending' && availableOutsidePending > 0 && (
                    
                      
                        There are {availableOutsidePending} reviewed items available in other tabs.
                      
                      
                         setActiveTab('approved')}>
                          View Approved
                        
                         setActiveTab('all')}>
                          View All
                        
                      
                    
                  )}
                
              )}
            
          
        
      

      {/* Review Dialog */}
      
        
          
            Review Content
            
              Submit your QA review for this content
            
          

          {selectedContent && (
            
              
                
                
                  Client: {selectedContent.clientAccount?.name || 'Unknown'}
                
              

              
                Status
                 setReviewForm(prev => ({ ...prev, status: v as QAStatus }))}
                >
                  
                    
                  
                  
                    Approve
                    Reject
                    Needs Review
                    Return for Revision
                  
                
              

              
                Score (0-100)
                 setReviewForm(prev => ({ ...prev, score: e.target.value }))}
                  placeholder="Enter score"
                />
              

              
                Notes
                 setReviewForm(prev => ({ ...prev, notes: e.target.value }))}
                  placeholder="Add review notes..."
                  rows={3}
                />
              
            
          )}

          
             setReviewDialogOpen(false)}>
              Cancel
            
            
              {reviewMutation.isPending ? 'Submitting...' : 'Submit Review'}
            
          
        
      
    
  );
}