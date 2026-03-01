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
  byStatus: Record<string, number>;
  byType: Record<string, number>;
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
  const [contentTypeFilter, setContentTypeFilter] = useState<string>('all');
  const [selectedItems, setSelectedItems] = useState<string[]>([]);
  const [reviewDialogOpen, setReviewDialogOpen] = useState(false);
  const [selectedContent, setSelectedContent] = useState<QAContentWithClient | null>(null);
  const [reviewForm, setReviewForm] = useState<{
    status: QAStatus;
    score: string;
    notes: string;
  }>({
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
      case 'simulation': return <Play className="h-4 w-4" />;
      case 'mock_call': return <Phone className="h-4 w-4" />;
      case 'report': return <FileText className="h-4 w-4" />;
      case 'data_export': return <Download className="h-4 w-4" />;
      default: return <FileText className="h-4 w-4" />;
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
    <div className="container mx-auto py-6 space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold">QA Review Center</h1>
          <p className="text-muted-foreground">
            Review and approve content before publishing to clients
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            onClick={() => migrateMutation.mutate()}
            disabled={migrateMutation.isPending}
          >
            <RefreshCw className={`h-4 w-4 mr-2 ${migrateMutation.isPending ? 'animate-spin' : ''}`} />
            {migrateMutation.isPending ? 'Migrating...' : 'Migrate Legacy Content'}
          </Button>
          <Button variant="outline" onClick={() => queryClient.invalidateQueries({ queryKey: ['qa-content'] })}>
            <RefreshCw className="h-4 w-4 mr-2" />
            Refresh
          </Button>
        </div>
      </div>

      {/* Stats Cards */}
      {stats && (
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Pending Review</CardDescription>
              <CardTitle className="text-2xl">
                {(stats.byStatus?.new || 0) + (stats.byStatus?.under_review || 0)}
              </CardTitle>
            </CardHeader>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Approved</CardDescription>
              <CardTitle className="text-2xl text-green-600">
                {stats.byStatus?.approved || 0}
              </CardTitle>
            </CardHeader>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Published</CardDescription>
              <CardTitle className="text-2xl text-blue-600">
                {stats.byStatus?.published || 0}
              </CardTitle>
            </CardHeader>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Rejected</CardDescription>
              <CardTitle className="text-2xl text-red-600">
                {stats.byStatus?.rejected || 0}
              </CardTitle>
            </CardHeader>
          </Card>
        </div>
      )}

      {/* Filters and Actions */}
      <Card>
        <CardHeader>
          <div className="flex justify-between items-center">
            <div className="flex items-center gap-4">
              <Filter className="h-4 w-4 text-muted-foreground" />
              <Select value={contentTypeFilter} onValueChange={setContentTypeFilter}>
                <SelectTrigger className="w-[180px]">
                  <SelectValue placeholder="Content Type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Types</SelectItem>
                  <SelectItem value="simulation">Simulations</SelectItem>
                  <SelectItem value="mock_call">Mock Calls</SelectItem>
                  <SelectItem value="report">Reports</SelectItem>
                  <SelectItem value="data_export">Data Exports</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {selectedItems.length > 0 && (
              <div className="flex items-center gap-2">
                <span className="text-sm text-muted-foreground">
                  {selectedItems.length} selected
                </span>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={handleBulkApprove}
                  disabled={bulkReviewMutation.isPending}
                >
                  <CheckCircle className="h-4 w-4 mr-1" />
                  Approve
                </Button>
                <Button
                  size="sm"
                  variant="destructive"
                  onClick={handleBulkReject}
                  disabled={bulkReviewMutation.isPending}
                >
                  <XCircle className="h-4 w-4 mr-1" />
                  Reject
                </Button>
              </div>
            )}
          </div>
        </CardHeader>
        <CardContent>
          <Tabs value={activeTab} onValueChange={setActiveTab}>
            <TabsList>
              <TabsTrigger value="pending">
                Pending Review
                {stats && (
                  <Badge variant="secondary" className="ml-2">
                    {(stats.byStatus?.new || 0) + (stats.byStatus?.under_review || 0)}
                  </Badge>
                )}
              </TabsTrigger>
              <TabsTrigger value="approved">Approved</TabsTrigger>
              <TabsTrigger value="rejected">Rejected</TabsTrigger>
              <TabsTrigger value="all">All</TabsTrigger>
            </TabsList>

            <TabsContent value={activeTab} className="mt-4">
              {isLoading ? (
                <div className="flex justify-center py-8">
                  <RefreshCw className="h-6 w-6 animate-spin" />
                </div>
              ) : content && content.length > 0 ? (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-[50px]">
                        <Checkbox
                          checked={selectedItems.length === content.length}
                          onCheckedChange={toggleSelectAll}
                        />
                      </TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead>Client</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Score</TableHead>
                      <TableHead>Created</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {content.map((item) => (
                      <TableRow key={item.qaContent.id}>
                        <TableCell>
                          <Checkbox
                            checked={selectedItems.includes(item.qaContent.id)}
                            onCheckedChange={() => toggleSelectItem(item.qaContent.id)}
                          />
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            {getContentTypeIcon(item.qaContent.contentType)}
                            <QAContentTypeBadge type={item.qaContent.contentType} size="sm" />
                          </div>
                        </TableCell>
                        <TableCell>
                          {item.clientAccount?.name || 'Unknown Client'}
                          {item.clientAccount?.companyName && (
                            <span className="text-muted-foreground text-xs block">
                              {item.clientAccount.companyName}
                            </span>
                          )}
                        </TableCell>
                        <TableCell>
                          <QAStatusBadge status={item.qaContent.qaStatus} size="sm" />
                        </TableCell>
                        <TableCell>
                          {item.qaContent.qaScore !== null ? (
                            <QAScoreBadge score={item.qaContent.qaScore} size="sm" />
                          ) : (
                            <span className="text-muted-foreground">-</span>
                          )}
                        </TableCell>
                        <TableCell>
                          {new Date(item.qaContent.createdAt).toLocaleDateString()}
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex justify-end gap-2">
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => analyzeMutation.mutate(item.qaContent.id)}
                              disabled={analyzeMutation.isPending}
                            >
                              <BarChart3 className="h-4 w-4" />
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => handleReview(item)}
                            >
                              <Eye className="h-4 w-4" />
                            </Button>
                            {item.qaContent.qaStatus === 'approved' && (
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => publishMutation.mutate(item.qaContent.id)}
                                disabled={publishMutation.isPending}
                              >
                                <Send className="h-4 w-4" />
                              </Button>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              ) : (
                <div className="text-center py-8 text-muted-foreground space-y-3">
                  <p>
                    {activeTab === 'pending'
                      ? 'No pending review items found.'
                      : 'No content found for this filter.'}
                  </p>
                  {activeTab === 'pending' && availableOutsidePending > 0 && (
                    <div className="space-y-2">
                      <p className="text-sm">
                        There are {availableOutsidePending} reviewed items available in other tabs.
                      </p>
                      <div className="flex justify-center gap-2">
                        <Button variant="outline" size="sm" onClick={() => setActiveTab('approved')}>
                          View Approved
                        </Button>
                        <Button variant="outline" size="sm" onClick={() => setActiveTab('all')}>
                          View All
                        </Button>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>

      {/* Review Dialog */}
      <Dialog open={reviewDialogOpen} onOpenChange={setReviewDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Review Content</DialogTitle>
            <DialogDescription>
              Submit your QA review for this content
            </DialogDescription>
          </DialogHeader>

          {selectedContent && (
            <div className="space-y-4">
              <div className="flex items-center gap-4">
                <QAContentTypeBadge type={selectedContent.qaContent.contentType} />
                <span className="text-muted-foreground">
                  Client: {selectedContent.clientAccount?.name || 'Unknown'}
                </span>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium">Status</label>
                <Select
                  value={reviewForm.status}
                  onValueChange={(v) => setReviewForm(prev => ({ ...prev, status: v as QAStatus }))}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="approved">Approve</SelectItem>
                    <SelectItem value="rejected">Reject</SelectItem>
                    <SelectItem value="under_review">Needs Review</SelectItem>
                    <SelectItem value="returned">Return for Revision</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium">Score (0-100)</label>
                <Input
                  type="number"
                  min="0"
                  max="100"
                  value={reviewForm.score}
                  onChange={(e) => setReviewForm(prev => ({ ...prev, score: e.target.value }))}
                  placeholder="Enter score"
                />
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium">Notes</label>
                <Textarea
                  value={reviewForm.notes}
                  onChange={(e) => setReviewForm(prev => ({ ...prev, notes: e.target.value }))}
                  placeholder="Add review notes..."
                  rows={3}
                />
              </div>
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setReviewDialogOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleSubmitReview}
              disabled={reviewMutation.isPending}
            >
              {reviewMutation.isPending ? 'Submitting...' : 'Submit Review'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
