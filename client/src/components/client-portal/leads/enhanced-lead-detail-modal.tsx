import { useState } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { queryClient } from '@/lib/queryClient';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Textarea } from '@/components/ui/textarea';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import {
  Loader2, User, Building2, Mail, Phone, Linkedin, Clock, Calendar, Target, 
  FileText, Headphones, MessageSquare, Send, Trash2, Edit, Sparkles,
  CheckCircle, Star, TrendingUp,
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { TranscriptViewer } from './transcript-viewer';
import { RecordingPlayer } from './recording-player';
import { PushToShowcaseButton } from '@/components/showcase-calls/push-to-showcase-button';

interface LeadComment {
  id: string;
  leadId: string;
  commentText: string;
  isInternal: boolean;
  createdAt: string;
  updatedAt: string;
  clientUserEmail: string | null;
  clientUserFirstName: string | null;
  clientUserLastName: string | null;
}

interface LeadDetail {
  id: string;
  callSessionId?: string | null;
  contactName: string | null;
  contactEmail: string | null;
  contactPhone: string | null;
  contactTitle: string | null;
  linkedinUrl: string | null;
  accountName: string | null;
  accountIndustry: string | null;
  campaignId: string | null;
  campaignName: string | null;
  qaStatus: string | null;
  aiScore: number | null;
  aiAnalysis: any;
  aiQualificationStatus: string | null;
  qaData: any;
  callDuration: number | null;
  dialedNumber: string | null;
  recordingUrl: string | null;
  transcript: string | null;
  structuredTranscript: any;
  createdAt: string | null;
  approvedAt: string | null;
  notes: string | null;
}

interface EnhancedLeadDetailModalProps {
  leadId: string | null;
  open: boolean;
  onClose: () => void;
}

export function EnhancedLeadDetailModal({ leadId, open, onClose }: EnhancedLeadDetailModalProps) {
  const { toast } = useToast();
  const [newComment, setNewComment] = useState('');
  const [editingCommentId, setEditingCommentId] = useState<string | null>(null);
  const [editingText, setEditingText] = useState('');

  const getToken = () => localStorage.getItem('clientPortalToken');

  // Fetch lead details
  const { data: lead, isLoading: leadLoading } = useQuery<LeadDetail>({
    queryKey: ['client-portal-lead-detail', leadId],
    queryFn: async () => {
      const res = await fetch(`/api/client-portal/qualified-leads/${leadId}`, {
        headers: { Authorization: `Bearer ${getToken()}` },
      });
      if (!res.ok) throw new Error('Failed to fetch lead');
      return res.json();
    },
    enabled: !!leadId && open,
  });

  // Fetch comments
  const { data: comments = [], isLoading: commentsLoading } = useQuery<LeadComment[]>({
    queryKey: ['client-portal-lead-comments', leadId],
    queryFn: async () => {
      const res = await fetch(`/api/client-portal/qualified-leads/${leadId}/comments`, {
        headers: { Authorization: `Bearer ${getToken()}` },
      });
      if (!res.ok) throw new Error('Failed to fetch comments');
      return res.json();
    },
    enabled: !!leadId && open,
  });

  // Add comment mutation
  const addCommentMutation = useMutation({
    mutationFn: async (commentText: string) => {
      const res = await fetch(`/api/client-portal/qualified-leads/${leadId}/comments`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${getToken()}`,
        },
        body: JSON.stringify({ commentText }),
      });
      if (!res.ok) throw new Error('Failed to add comment');
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['client-portal-lead-comments', leadId] });
      setNewComment('');
      toast({ title: 'Comment added successfully' });
    },
    onError: () => {
      toast({ title: 'Failed to add comment', variant: 'destructive' });
    },
  });

  // Update comment mutation
  const updateCommentMutation = useMutation({
    mutationFn: async ({ commentId, commentText }: { commentId: string; commentText: string }) => {
      const res = await fetch(`/api/client-portal/qualified-leads/${leadId}/comments/${commentId}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${getToken()}`,
        },
        body: JSON.stringify({ commentText }),
      });
      if (!res.ok) throw new Error('Failed to update comment');
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['client-portal-lead-comments', leadId] });
      setEditingCommentId(null);
      setEditingText('');
      toast({ title: 'Comment updated successfully' });
    },
    onError: () => {
      toast({ title: 'Failed to update comment', variant: 'destructive' });
    },
  });

  // Delete comment mutation
  const deleteCommentMutation = useMutation({
    mutationFn: async (commentId: string) => {
      const res = await fetch(`/api/client-portal/qualified-leads/${leadId}/comments/${commentId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${getToken()}` },
      });
      if (!res.ok) throw new Error('Failed to delete comment');
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['client-portal-lead-comments', leadId] });
      toast({ title: 'Comment deleted successfully' });
    },
    onError: () => {
      toast({ title: 'Failed to delete comment', variant: 'destructive' });
    },
  });

  const formatDuration = (seconds: number | null) => {
    if (!seconds) return '-';
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const getInitials = (firstName: string | null, lastName: string | null) => {
    if (!firstName && !lastName) return '?';
    return `${(firstName || '').charAt(0)}${(lastName || '').charAt(0)}`.toUpperCase();
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-6xl max-h-[90vh] p-0 gap-0 bg-gradient-to-br from-white to-blue-50/20">
        <DialogHeader className="px-8 py-6 bg-gradient-to-r from-blue-600 to-indigo-600 text-white">
          <DialogTitle className="text-2xl flex items-center gap-2">
            <Sparkles className="h-6 w-6" />
            Lead Details
          </DialogTitle>
        </DialogHeader>

        {leadLoading ? (
          <div className="flex justify-center p-12">
            <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
          </div>
        ) : !lead ? (
          <div className="p-8 text-center">
            <p className="text-muted-foreground">Lead not found</p>
          </div>
        ) : (
          <Tabs defaultValue="overview" className="flex-1">
            <div className="px-8 pt-4 border-b">
              <TabsList className="grid w-full max-w-md grid-cols-3">
                <TabsTrigger value="overview">Overview</TabsTrigger>
                <TabsTrigger value="call-details">Call Details</TabsTrigger>
                <TabsTrigger value="comments" className="flex items-center gap-1.5">
                  <MessageSquare className="h-4 w-4" />
                  Comments
                  {comments.length > 0 && (
                    <Badge variant="secondary" className="ml-1 h-5 px-1.5">
                      {comments.length}
                    </Badge>
                  )}
                </TabsTrigger>
              </TabsList>
            </div>

            <ScrollArea className="h-[calc(90vh-180px)]">
              <div className="px-8 py-6">
                {/* Overview Tab */}
                <TabsContent value="overview" className="mt-0 space-y-6">
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                    {/* Contact Information */}
                    <Card className="shadow-md">
                      <CardHeader className="pb-3">
                        <CardTitle className="flex items-center gap-2 text-lg">
                          <User className="h-5 w-5 text-blue-600" />
                          Contact Information
                        </CardTitle>
                      </CardHeader>
                      <CardContent className="space-y-3">
                        <div>
                          <p className="text-sm text-muted-foreground">Name</p>
                          <p className="font-semibold text-lg">{lead.contactName || 'Unknown'}</p>
                        </div>
                        {lead.contactTitle && (
                          <div>
                            <p className="text-sm text-muted-foreground">Title</p>
                            <p className="font-medium">{lead.contactTitle}</p>
                          </div>
                        )}
                        {lead.contactEmail && (
                          <div className="flex items-center gap-2">
                            <Mail className="h-4 w-4 text-muted-foreground" />
                            <a href={`mailto:${lead.contactEmail}`} className="text-blue-600 hover:underline">
                              {lead.contactEmail}
                            </a>
                          </div>
                        )}
                        {lead.contactPhone && (
                          <div className="flex items-center gap-2">
                            <Phone className="h-4 w-4 text-muted-foreground" />
                            <a href={`tel:${lead.contactPhone}`} className="text-blue-600 hover:underline">
                              {lead.contactPhone}
                            </a>
                          </div>
                        )}
                        {lead.linkedinUrl && (
                          <div className="flex items-center gap-2">
                            <Linkedin className="h-4 w-4 text-blue-600" />
                            <a 
                              href={lead.linkedinUrl} 
                              target="_blank" 
                              rel="noopener noreferrer"
                              className="text-blue-600 hover:underline"
                            >
                              View LinkedIn Profile
                            </a>
                          </div>
                        )}
                      </CardContent>
                    </Card>

                    {/* Company Information */}
                    <Card className="shadow-md">
                      <CardHeader className="pb-3">
                        <CardTitle className="flex items-center gap-2 text-lg">
                          <Building2 className="h-5 w-5 text-blue-600" />
                          Company Information
                        </CardTitle>
                      </CardHeader>
                      <CardContent className="space-y-3">
                        <div>
                          <p className="text-sm text-muted-foreground">Company</p>
                          <p className="font-semibold text-lg">{lead.accountName || '-'}</p>
                        </div>
                        {lead.accountIndustry && (
                          <div>
                            <p className="text-sm text-muted-foreground">Industry</p>
                            <Badge variant="outline" className="font-normal">
                              {lead.accountIndustry}
                            </Badge>
                          </div>
                        )}
                      </CardContent>
                    </Card>
                  </div>

                  {/* Qualification Details */}
                  <Card className="shadow-md bg-gradient-to-br from-white to-green-50/30">
                    <CardHeader>
                      <CardTitle className="flex items-center gap-2">
                        <TrendingUp className="h-5 w-5 text-green-600" />
                        Qualification Details
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                        <div className="text-center p-3 bg-white rounded-lg shadow-sm">
                          <p className="text-sm text-muted-foreground mb-1">AI Score</p>
                          <p className="text-2xl font-bold text-blue-600">{lead.aiScore || '-'}</p>
                        </div>
                        <div className="text-center p-3 bg-white rounded-lg shadow-sm">
                          <p className="text-sm text-muted-foreground mb-1">Call Duration</p>
                          <p className="text-2xl font-bold text-green-600">{formatDuration(lead.callDuration)}</p>
                        </div>
                        <div className="text-center p-3 bg-white rounded-lg shadow-sm">
                          <p className="text-sm text-muted-foreground mb-1">Status</p>
                          <Badge className="bg-green-500 hover:bg-green-600">
                            {lead.qaStatus || 'New'}
                          </Badge>
                        </div>
                        <div className="text-center p-3 bg-white rounded-lg shadow-sm">
                          <p className="text-sm text-muted-foreground mb-1">Campaign</p>
                          <p className="text-sm font-medium truncate">{lead.campaignName || '-'}</p>
                        </div>
                      </div>

                      {lead.aiAnalysis && (
                        <div className="mt-4 p-4 bg-white rounded-lg border">
                          <h4 className="font-semibold mb-2 flex items-center gap-2">
                            <Star className="h-4 w-4 text-yellow-500" />
                            AI Analysis
                          </h4>
                          <pre className="text-xs whitespace-pre-wrap text-muted-foreground">
                            {JSON.stringify(lead.aiAnalysis, null, 2)}
                          </pre>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                </TabsContent>

                {/* Call Details Tab */}
                <TabsContent value="call-details" className="mt-0 space-y-6">
                  {lead.callSessionId && (
                    <div className="flex justify-end">
                      <PushToShowcaseButton
                        callSessionId={lead.callSessionId}
                        contactName={lead.contactName}
                        sourceLabel="Lead Detail"
                        buttonProps={{ size: 'sm', variant: 'outline' }}
                      />
                    </div>
                  )}

                  {lead.recordingUrl && (
                    <RecordingPlayer recordingUrl={lead.recordingUrl} />
                  )}
                  
                  {lead.transcript && (
                    <TranscriptViewer 
                      transcript={lead.transcript}
                      structuredTranscript={lead.structuredTranscript}
                    />
                  )}

                  {!lead.recordingUrl && !lead.transcript && (
                    <Card>
                      <CardContent className="p-12 text-center">
                        <FileText className="h-12 w-12 mx-auto mb-4 text-muted-foreground opacity-50" />
                        <p className="text-muted-foreground">No call details available</p>
                      </CardContent>
                    </Card>
                  )}
                </TabsContent>

                {/* Comments Tab */}
                <TabsContent value="comments" className="mt-0 space-y-6">
                  {/* Add Comment */}
                  <Card className="shadow-md">
                    <CardHeader className="pb-3">
                      <CardTitle className="flex items-center gap-2 text-lg">
                        <MessageSquare className="h-5 w-5 text-blue-600" />
                        Add Comment
                      </CardTitle>
                      <CardDescription>
                        Add notes or feedback about this lead
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-3">
                      <Textarea
                        placeholder="Enter your comment here..."
                        value={newComment}
                        onChange={(e) => setNewComment(e.target.value)}
                        rows={4}
                        className="resize-none"
                      />
                      <Button
                        onClick={() => addCommentMutation.mutate(newComment)}
                        disabled={!newComment.trim() || addCommentMutation.isPending}
                        className="w-full sm:w-auto bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700"
                      >
                        {addCommentMutation.isPending ? (
                          <>
                            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                            Posting...
                          </>
                        ) : (
                          <>
                            <Send className="h-4 w-4 mr-2" />
                            Post Comment
                          </>
                        )}
                      </Button>
                    </CardContent>
                  </Card>

                  {/* Comments List */}
                  <div className="space-y-4">
                    {commentsLoading ? (
                      <div className="flex justify-center p-8">
                        <Loader2 className="h-6 w-6 animate-spin text-blue-600" />
                      </div>
                    ) : comments.length === 0 ? (
                      <Card>
                        <CardContent className="p-12 text-center">
                          <MessageSquare className="h-12 w-12 mx-auto mb-4 text-muted-foreground opacity-50" />
                          <p className="text-muted-foreground">No comments yet</p>
                          <p className="text-sm text-muted-foreground mt-1">Be the first to add a comment!</p>
                        </CardContent>
                      </Card>
                    ) : (
                      comments.map((comment) => (
                        <Card key={comment.id} className="shadow-sm">
                          <CardContent className="p-4">
                            <div className="flex items-start gap-3">
                              <Avatar className="h-10 w-10 bg-gradient-to-br from-blue-500 to-indigo-500 text-white">
                                <AvatarFallback>
                                  {getInitials(comment.clientUserFirstName, comment.clientUserLastName)}
                                </AvatarFallback>
                              </Avatar>
                              <div className="flex-1">
                                <div className="flex items-center justify-between mb-2">
                                  <div>
                                    <p className="font-semibold">
                                      {comment.clientUserFirstName && comment.clientUserLastName
                                        ? `${comment.clientUserFirstName} ${comment.clientUserLastName}`
                                        : comment.clientUserEmail || 'Unknown User'}
                                    </p>
                                    <p className="text-xs text-muted-foreground">
                                      {new Date(comment.createdAt).toLocaleString()}
                                    </p>
                                  </div>
                                  <div className="flex gap-1">
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      onClick={() => {
                                        setEditingCommentId(comment.id);
                                        setEditingText(comment.commentText);
                                      }}
                                    >
                                      <Edit className="h-4 w-4" />
                                    </Button>
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      onClick={() => deleteCommentMutation.mutate(comment.id)}
                                      disabled={deleteCommentMutation.isPending}
                                    >
                                      <Trash2 className="h-4 w-4 text-red-500" />
                                    </Button>
                                  </div>
                                </div>

                                {editingCommentId === comment.id ? (
                                  <div className="space-y-2">
                                    <Textarea
                                      value={editingText}
                                      onChange={(e) => setEditingText(e.target.value)}
                                      rows={3}
                                      className="resize-none"
                                    />
                                    <div className="flex gap-2">
                                      <Button
                                        size="sm"
                                        onClick={() => 
                                          updateCommentMutation.mutate({ 
                                            commentId: comment.id, 
                                            commentText: editingText 
                                          })
                                        }
                                        disabled={!editingText.trim() || updateCommentMutation.isPending}
                                      >
                                        Save
                                      </Button>
                                      <Button
                                        size="sm"
                                        variant="outline"
                                        onClick={() => {
                                          setEditingCommentId(null);
                                          setEditingText('');
                                        }}
                                      >
                                        Cancel
                                      </Button>
                                    </div>
                                  </div>
                                ) : (
                                  <p className="text-sm whitespace-pre-wrap">{comment.commentText}</p>
                                )}
                              </div>
                            </div>
                          </CardContent>
                        </Card>
                      ))
                    )}
                  </div>
                </TabsContent>
              </div>
            </ScrollArea>
          </Tabs>
        )}
      </DialogContent>
    </Dialog>
  );
}
